/**
 * 求值（`evaluate`）。
 *
 * ## 这一层的三件事
 *
 * ```
 *   ① 单条求值          `2+3*4` → 14
 *   ② 批量求值          多条独立求值，一条失败不影响其它
 *   ③ 精度与显示控制     precision（计算）/ displayPrecision（显示）
 * ```
 *
 * ## 从老插件继承的四条判据（都是踩出来的）
 *
 * ### ① 整数不许截断
 *
 * ```
 *   10^20+5  →  100000000000000000005    完整 21 位
 *   而不是    1.00000000e20
 * ```
 *
 * ### ② 极小数不许显示成 0
 *
 * ```
 *   3.3e-9  在「8 位小数」下若按定点写 → 0.00000000    ← 数据丢失
 *   正确：                             → 3.3e-9
 * ```
 *
 * ### ③ 批量失败时 `ok` 必须为假
 *
 * 老插件修过这条：批量里有一条失败，`result` 里写着「失败」，
 * 但 `ok` 仍是 `true` —— 调用方 `if (!r.ok)` 永远判成功。
 *
 * ### ④ 顶层 `error` 只在「整个调用失败」时给
 *
 * 批量里某条失败**不设**顶层 `error`（那会被读成「全部失败」），
 * 而是给 `failed` / `succeeded` 计数与 `items[].error`。
 *
 * @module dsh-math-calculator/features/numeric/evaluate
 */

import type { Engine } from '../../core/engine.js'
import { CalcError } from '../../core/errors.js'
import {
  fmtNumber,
  trimDecimal,
  magnitudeOf,
  annotateMagnitude,
  chineseMagnitude,
  toJsonValue,
  restoreCjkUnitNames,
  restoreCustomUnitNames,
} from '../../core/format.js'

/** 求值结果。 */
export interface EvaluateOutcome {
  /** 人类可读正文。 */
  result: string
  /** 结构化值。 */
  value: unknown
  /** 提示（不进 result）。 */
  notice?: string
  /** 是否成功（批量里全部成功才算）。 */
  ok: boolean
  /** 批量的局部失败标记。 */
  partial?: boolean
}

/** 求值选项。 */
export interface EvaluateOptions {
  /** 计算精度（BigNumber 有效位）。 */
  precision?: number
  /** 显示精度（**小数点后几位**）。 */
  displayPrecision?: number
  /** 是否精简输出。 */
  terse?: boolean
}

/**
 * 把科学计数法的整数**展开**成完整数字串。
 *
 * ## 为什么必须展开
 *
 * BigNumber 对 30 位以上的整数用科学计数法 `toString()`：
 *
 * ```
 *   10^30+7  →  '1.000000000000000000000000000007e+30'
 * ```
 *
 * 数值没错，但**人看不出那是 10³⁰+7**。而本项目的原则是
 * 「整数永不截断」—— 科学计数法等价于丢掉了可读性。
 *
 * ## 展开规则
 *
 * ```
 *   '1.000...007e+30'  →  '1000...0007'    （30 个 0 后跟 7）
 *   '-1.5e+3'          →  非整数，不展开（返回 null）
 * ```
 *
 * @param text - 科学计数法串
 * @returns 完整整数串；不是整数返回 null
 */
function expandSciInteger(text: string): string | null {
  const m = /^(-?)(\d+)(?:\.(\d+))?e\+(\d+)$/i.exec(text)
  if (m === null) return null
  const sign = m[1]
  const intPart = m[2]
  const fracPart = m[3] ?? ''
  const exponent = Number(m[4])

  /** 所有有效数字拼起来。 */
  const digits = intPart + fracPart
  /**
   * 小数点原本在 `intPart.length` 之后；科学计数法把它右移 `exponent` 位。
   * 展开后整数位数 = intPart.length + exponent。
   */
  const integerLen = intPart.length + exponent
  if (integerLen <= 0) return null
  /** 有效数字不够就补零。 */
  const padded = digits.padEnd(integerLen, '0')
  /**
   * 若有效数字超出整数位，说明有小数部分 —— 那不是整数，不展开。
   */
  if (digits.length > integerLen && /[1-9]/.test(digits.slice(integerLen))) return null
  return sign + padded.slice(0, integerLen)
}

/**
 * 把引擎返回的值归一成「数值 + 可选的原始文本」。
 *
 * ## ★ 为什么必须先归一
 *
 * 引擎用 `number: 'BigNumber'` 模式（为了大整数不丢位），
 * 所以 `engine.evaluate('10^20+5')` 返回的是 **Decimal 对象**，
 * 不是 `number`：
 *
 * ```
 *   typeof value            → 'object'
 *   value.constructor.name  → 'Decimal'
 *   value.isBigNumber       → true
 * ```
 *
 * 若直接 `Number.isInteger(value)` 或 `typeof value === 'number'`，
 * 所有判断都会落空 —— 实测（2026-11-13）表现为：
 *
 * ```
 *   10^20+5  →  输出 100000000000000000000    （+5 丢了）
 *   1 里 + 3 米 →  输出未格式化
 * ```
 *
 * @param value - 引擎返回值
 * @returns 归一结果
 */
function unwrapNumeric(value: unknown): { n: number; bigText: string | null } {
  if (typeof value === 'number') return { n: value, bigText: null }
  const any = value as { isBigNumber?: boolean; toString?: () => string }
  if (any?.isBigNumber === true) {
    const text = String(any.toString?.() ?? '')
    /**
     * ## 大整数必须保留原文
     *
     * `Number('100000000000000000005')` 会变成 `1e20` —— 丢位。
     *
     * ## ⚠ 但 BigNumber 的 toString 不一定是纯数字串
     *
     * 实测（2026-11-13）：
     *
     * ```
     *   10^20+5  →  '100000000000000000005'                纯数字
     *   10^30+7  →  '1.000000000000000000000000000007e+30'  科学计数法！
     *   10^40+7  →  '1.0000...0007e+40'
     * ```
     *
     * 第一版只判 `/^-?\d{16,}$/`，于是 30 位以上的整数**全部落到
     * Number 路径**，输出变成 `1.000e+30`（丢掉了 `+7`）。
     *
     * 所以两种形态都要保留原文：纯数字串，或「整数系数 + e+指数」的
     * 科学计数形态。
     */
    const isPlainInteger = /^-?\d{16,}$/.test(text)
    if (isPlainInteger) return { n: Number(text), bigText: text }
    /**
     * 科学计数形态：**展开成完整整数**。
     *
     * `1.000...007e+30` → `1000...0007`（30 位）。
     * 展开失败（说明不是整数）就退回 Number 路径。
     */
    const expanded = /e\+\d+$/i.test(text) ? expandSciInteger(text) : null
    return { n: Number(text), bigText: expanded }
  }
  return { n: Number(value as number), bigText: null }
}

/**
 * 格式化单个结果值。
 *
 * ## 判定顺序（每一步都源自踩过的坑）
 *
 * ```
 *   ① 空值                  → 直接 String
 *   ② 带单位（Unit）        → 中文名/自设名还原 + 数值按精度截断
 *   ③ BigNumber 大整数      → 保留原文（Number 会丢位）
 *   ④ 整数                  → 千分位（≥1e6 时）
 *   ⑤ 小数                  → 按 displayPrecision 截断
 *   ⑥ 极小值                → 若截断会变 0，改用科学计数法
 * ```
 *
 * @param value - 原始值
 * @param options - 选项
 * @param engine - 引擎（用于还原自设单位名）
 * @returns 显示串与附带信息
 */
export function formatScalar(
  value: unknown,
  options: EvaluateOptions,
  engine: Engine,
): { text: string; magnitude: string; chinese: string } {
  const displayPrecision = options.displayPrecision ?? 8

  /** ① 空值。 */
  if (value === null || value === undefined) {
    return { text: String(value), magnitude: '', chinese: '' }
  }

  /** ② 带单位（mathjs Unit）。 */
  const anyValue = value as { isUnit?: boolean }
  if (anyValue.isUnit === true) {
    let text = String(value)
    text = restoreCjkUnitNames(text)
    text = restoreCustomUnitNames(text, engine.customUnits)
    /**
     * ## 数值部分按精度截断
     *
     * ⚠ 第一版用 `text.split(' ')` 取第 0 段，但 **BigNumber 模式的
     * Unit 文本里数值与单位之间可能有多个空格**，而 `1.9685...e+0 inch`
     * 这种科学计数形态也出现过。
     *
     * 所以改用正则抓「行首的数值」，再把后半段原样接回。
     */
    const numericPrefix = /^(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)(\s+.*)?$/i.exec(text)
    if (numericPrefix !== null) {
      const n = Number(numericPrefix[1])
      if (Number.isFinite(n)) {
        const cut = trimDecimal(n, displayPrecision)
        text = cut + (numericPrefix[2] ?? '')
      }
    }
    return { text, magnitude: '', chinese: '' }
  }

  /** 非数值类型（字符串、布尔、数组…）。 */
  const { n: asNumber, bigText } = unwrapNumeric(value)
  if (typeof value === 'object' && !('isBigNumber' in (value as object))) {
    const json = toJsonValue(value)
    return { text: typeof json === 'string' ? json : JSON.stringify(json), magnitude: '', chinese: '' }
  }
  if (!Number.isFinite(asNumber)) {
    return { text: String(value), magnitude: '', chinese: '' }
  }

  /** ③ BigNumber 大整数：保留原文。 */
  if (bigText !== null) {
    const withSeparators = bigText.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return { text: withSeparators, magnitude: annotateMagnitude(asNumber), chinese: chineseMagnitude(asNumber) }
  }

  /** ④ 整数。 */
  if (Number.isInteger(asNumber)) {
    const text = Math.abs(asNumber) >= 1e6
      ? asNumber.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : String(asNumber)
    return { text, magnitude: annotateMagnitude(asNumber), chinese: chineseMagnitude(asNumber) }
  }

  /** ⑤⑥ 小数。 */
  const text = trimDecimal(asNumber, displayPrecision)
  return { text, magnitude: annotateMagnitude(asNumber), chinese: chineseMagnitude(asNumber) }
}

/**
 * 单条求值。
 *
 * @param engine - 引擎
 * @param expression - 表达式
 * @param options - 选项
 * @returns 结果
 */
export function evaluateOne(
  engine: Engine,
  expression: string,
  options: EvaluateOptions,
): EvaluateOutcome {
  const raw = engine.evaluate(expression)

  /**
   * ## ★ 非有限值必须报错，不能当结果返回
   *
   * BigNumber 模式下 `1/0` **不抛异常**，而是返回一个
   * `Decimal('Infinity')` 对象：
   *
   * ```
   *   engine.evaluate('1/0')
   *   → Infinity（Decimal，constructor.name === 'Decimal'）
   * ```
   *
   * 实测（2026-11-13）：批量 `['1+1','1/0']` 曾是「成功 2，失败 0」——
   * 而 `Infinity` 不是有效答案。
   *
   * 这是老插件同样踩过的坑（P0-2「批量漏检非有限值」）。
   */
  const unwrapped = unwrapNumeric(raw)
  if (typeof raw === 'object' && raw !== null && !('isUnit' in (raw as object))) {
    if (!Number.isFinite(unwrapped.n)) {
      throw new CalcError(
        'non_finite',
        '结果不是有限数（表达式：' + expression + '）',
        '常见原因：除以 0、对数里出现 0 或负数、数值溢出。检查分母与函数定义域。',
      )
    }
  }

  const formatted = formatScalar(raw, options, engine)

  /** 拼正文：值 + 量级标注（若有）。 */
  let result = formatted.text
  if (formatted.magnitude !== '') result += ' ' + formatted.magnitude
  if (formatted.chinese !== '') result += '（' + formatted.chinese + '）'

  return {
    result,
    /** 大整数必须给**原文**，否则 JSON 里会丢位。 */
    value: unwrapped.bigText !== null ? unwrapped.bigText : toJsonValue(raw),
    ok: true,
  }
}

/**
 * 批量求值。
 *
 * ## 一条失败不影响其它条
 *
 * 这是实测需求：一次问五件事，其中一条写错不该让另外四条白算。
 *
 * @param engine - 引擎
 * @param expressions - 表达式列表（字符串或 `{label, expr}`）
 * @param options - 选项
 * @returns 结果
 */
export function evaluateBatch(
  engine: Engine,
  expressions: Array<string | { label?: string; expr: string }>,
  options: EvaluateOptions,
): EvaluateOutcome {
  /** 上限 100 条 —— 再多该走数据引用，不是堆表达式撑上下文。 */
  const MAX_BATCH = 100
  const items = expressions.slice(0, MAX_BATCH)

  interface ItemResult {
    index: number
    label: string
    expression: string
    ok: boolean
    text: string
    value: unknown
    error?: string
  }
  const results: ItemResult[] = []

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    const expr = typeof item === 'string' ? item : item.expr
    const label = typeof item === 'string' ? '' : (item.label ?? '')
    try {
      const one = evaluateOne(engine, expr, options)
      results.push({
        index: i + 1,
        label,
        expression: expr,
        ok: true,
        text: one.result,
        value: one.value,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const type = error instanceof CalcError ? error.type : undefined
      results.push({
        index: i + 1,
        label,
        expression: expr,
        ok: false,
        text: '失败[' + (type ?? 'error') + ']：' + message,
        value: null,
        error: type ?? 'error',
      })
    }
  }

  const failed = results.filter((r) => !r.ok)
  const succeeded = results.length - failed.length

  /**
   * ## 正文格式
   *
   * ```
   *   ═══ 批量求值（3 条）═══
   *     单价（unit=5） = 5
   *     小计（sub=15） = 15
   *   成功 3，失败 0
   * ```
   *
   * 有失败时**必须**说清哪条失败、为什么。
   */
  const lines: string[] = []
  lines.push('═══ 批量求值（' + results.length + ' 条）═══')
  if (results.length < expressions.length) {
    lines.push('  ⚠ 只算了前 ' + MAX_BATCH + ' 条（共给了 ' + expressions.length + ' 条）')
  }
  lines.push('')
  for (const item of results) {
    const head = item.label !== '' ? item.label + '（' + item.expression + '）' : item.expression
    lines.push('  ' + head + ' = ' + item.text)
  }
  lines.push('')
  lines.push('成功 ' + succeeded + '，失败 ' + failed.length)
  /**
   * 全成功时用分级语义，避免「成功」被读成「结论正确」。
   *
   * 这是老插件踩过的：`成功` 两个字读起来像「对了」，
   * 而它只表示「算式没有语法/符号错」。
   */
  if (failed.length === 0) {
    lines.push('（「成功」只表示算式无语法/符号错，不含结论正确性判断）')
  }

  return {
    result: lines.join('\n'),
    value: {
      items: results.map((r) => ({
        index: r.index,
        label: r.label,
        expression: r.expression,
        ok: r.ok,
        value: r.value,
        error: r.error,
      })),
      succeeded,
      failed: failed.length,
      /** 错误类型汇总 —— 让程序化调用方能一眼看出失败性质。 */
      errorTypes: [...new Set(failed.map((r) => r.error).filter((x) => x !== undefined))],
    },
    /**
     * ⚠ **`ok` 必须反映批量结果** —— 老插件修过这条。
     *
     * 若不设：调用方 `if (!r.ok)` 永远判成功。
     */
    ok: failed.length === 0,
    partial: failed.length > 0 && succeeded > 0,
  }
}
