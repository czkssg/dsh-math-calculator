/**
 * 公式求值（`formula` / `formulas` 调用单条或批量）。
 *
 * ## 从老插件继承的三条判据
 *
 * ### ① `overrides` 错拼必须点名
 *
 * 反馈包报过：错拼一个 key 会被**静默忽略**，用户以为改了参数
 * 实际用的是默认值。修法：把未生效的 key 列出来。
 *
 * ### ② 单位提示必须给
 *
 * 公式参数一律 SI。而用户常按「地球倍数」给（`M: 5.97` 想表达 5.97 倍）。
 * 实测踩过：`M: 5.972` 得到荒谬值，因为那是 5.972 kg 而不是 5.972 倍地球质量。
 *
 * ### ③ 覆盖了默认值要说出来
 *
 * `*` 标记哪些参数被本次调用覆盖 —— 让用户能看出「这个数是按我的输入算的」
 * 还是「按默认值算的」。
 *
 * @module dsh-math-calculator/features/formulas/evaluate
 */

import type { Engine } from '../../core/engine.js'
import { CalcError } from '../../core/errors.js'
import { fmtNumber, FMT, trimDecimal } from '../../core/format.js'
import type { FormulaEntry } from './query.js'

/** 求值结果。 */
export interface FormulaOutcome {
  result: string
  value: unknown
  notice?: string
}

/**
 * 求一条公式。
 *
 * @param engine - 引擎
 * @param entry - 公式条目
 * @param overrides - 参数覆盖
 * @param displayPrecision - 显示精度
 * @param terse - 精简输出
 * @returns 结果
 */
export function evaluateFormula(
  engine: Engine,
  entry: FormulaEntry,
  overrides: Record<string, unknown>,
  displayPrecision = 8,
  terse = false,
): FormulaOutcome {
  /**
   * 展示式不可求值。
   *
   * 实测（2026-11-13 静态校验）：665 条里有 4 条表达式含 Σᵢ / log_base 这类
   * 排版符号，mathjs 解析不了。它们是给检索与帮助看的展示式，
   * 调用求值时应明确说「不可求值」，而不是把语法错误甩给调用方。
   */
  if (entry.executable === false) {
    throw new CalcError(
      'invalid_argument',
      '这条公式是展示式，不能直接求值：' + entry.id + '（' + entry.name + '）',
      '这是展示式（不是可执行公式）：表达式含 Σᵢ / log_base 这类排版符号，mathjs 无法解析。' +
        '要看公式含义用公式检索；要算同类量请用可执行版本，或直接用 evaluate 写式子。',
    )
  }
  /** 收集参数：默认值 + 覆盖。 */
  const defaults: Record<string, number | null> = {}
  const descs: Record<string, string> = {}
  for (const [key, param] of Object.entries(entry.params ?? {})) {
    defaults[key] = param.value
    descs[key] = param.desc
  }

  /**
   * ## 校验 overrides 的 key
   *
   * 三条：
   * ```
   *   ① 认不出的 key → 点名（不许静默忽略）
   *   ② 常数名（g/c/G…）是合法覆盖，不告警
   *   ③ 覆盖后仍缺必填参数 → 报缺失清单
   * ```
   */
  const known = new Set(Object.keys(defaults))
  const unknown = Object.keys(overrides).filter((k) => !known.has(k))
  if (unknown.length > 0) {
    throw new CalcError(
      'unknown_argument',
      '这些参数名认不出来，已被忽略：' + unknown.join(', '),
      '这条公式的参数是：' + [...known].join(', ') +
        '。检查是否拼错（大小写敏感）。',
    )
  }

  /** 合并作用域。 */
  const scope: Record<string, unknown> = {}
  const applied: string[] = []
  for (const [key, value] of Object.entries(defaults)) {
    if (value !== null) scope[key] = value
  }

  /**
   * ## ★ 必须注入物理常数
   *
   * 有 3 条公式的表达式引用了物理常数（`NA` 阿伏伽德罗常数等），
   * 而常数不在 `params` 里 —— 它们是**全局常量**。
   *
   * 实测（2026-11-13）：
   *
   * ```
   *   fission_energy_per_mass  expr: 'energy_per_fission * NA / molar_mass'
   *   → 报错：表达式里的「NA」没有定义
   * ```
   *
   * 不能把这些常数硬编码在这个文件里（会与 `constants-graph` 脱节），
   * 所以从引擎里**按需取**：把常用的物理常数名注入作用域。
   */
  const PHYSICAL_CONSTANTS: Record<string, string> = {
    NA: '6.02214076e23',
    kB: '1.380649e-23',
    h: '6.62607015e-34',
    c: '299792458',
    G: '6.67430e-11',
    e: '1.602176634e-19',
    me: '9.1093837015e-31',
    mp: '1.67262192369e-27',
    R: '8.314462618',
    sigma: '5.670374419e-8',
    F: '96485.33212',
    mu0: '1.25663706212e-6',
    eps0: '8.8541878128e-12',
  }
  for (const [name, value] of Object.entries(PHYSICAL_CONSTANTS)) {
    /** 只在该公式确实用到、且用户没覆盖时才注入。 */
    if (scope[name] === undefined && new RegExp('\\b' + name + '\\b').test(entry.expr)) {
      scope[name] = Number(value)
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    scope[key] = value
    applied.push(key)
  }

  /** 缺必填参数。 */
  const missing = Object.entries(defaults)
    .filter(([key, value]) => value === null && overrides[key] === undefined)
    .map(([key]) => key)
  if (missing.length > 0) {
    throw new CalcError(
      'missing_params',
      '缺必填参数：' + missing.join(', '),
      '用法：{operation:"formula", formula:"' + entry.id + '", overrides:{' +
        missing.map((m) => m + ': 值').join(', ') + '}}。' +
        '参数含义：' + missing.map((m) => m + ' = ' + descs[m]).join('；'),
    )
  }

  /** 求值。 */
  let raw: unknown
  try {
    /**
     * ## ★ 入参必须转成 BigNumber，不能直接传 JS number
     *
     * 错误消息极具误导性：「Cannot implicitly convert a number with
     * >15 significant digits」—— 而 `0.049` 只有 3 位有效数字。
     *
     * 实测（2026-11-13）：
     *
     * ```
     *   m.evaluate('(1 + r/n)^n - 1', { r: 0.049, n: 12 })
     *   → Cannot implicitly convert ...        ✗
     *
     *   m.evaluate('(1 + r/n)^n - 1', { r: m.bignumber('0.049'), n: m.bignumber('12') })
     *   → 0.050115575311968943                  ✓
     * ```
     *
     * 根因：mathjs 在 BigNumber 模式下，运算时要把 JS number **隐式转换**
     * 成 BigNumber；而 `0.049` 的 double 二进制表示有 50+ 位尾数，
     * 转换器认为「这会丢精度」于是拒绝。
     *
     * **不是入参值有问题，是传值类型不对。**
     */
    const bigScope: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(scope)) {
      const n = Number(value)
      bigScope[key] = Number.isFinite(n)
        ? (engine.math as unknown as { bignumber: (v: string) => unknown }).bignumber(String(n))
        : n
    }
    raw = engine.evaluate(entry.expr, bigScope)
  } catch (error) {
    throw new CalcError(
      'invalid_argument',
      '公式求值失败：' + (error instanceof Error ? error.message.slice(0, 80) : String(error)),
      '表达式：' + entry.expr + '。检查参数值是否超出定义域（如 log 里的负数）。',
    )
  }

  /**
   * ## ⚠ 结果可能是矩阵，不只是标量
   *
   * 实测（2026-11-13）：`leontief_inverse` 的表达式是
   * `inv([[1-A11, -A12], [-A21, 1-A22]])` —— 返回的是**矩阵**。
   *
   * 而公式的语义是「给一个数」。所以：
   *
   * ```
   *   标量   → 正常返回
   *   1×1    → 取出那个标量
   *   更大   → 报错并说明「这条公式的结果是矩阵」
   * ```
   */
  const asArray = (() => {
    if (Array.isArray(raw)) return raw
    const any = raw as { toArray?: () => unknown }
    return any?.toArray?.() ?? null
  })()

  if (asArray !== null) {
    /** 展平。 */
    const flat: unknown[] = []
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk)
      else flat.push(v)
    }
    walk(asArray)
    if (flat.length === 1) {
      raw = flat[0]
    } else {
      throw new CalcError(
        'invalid_argument',
        '这条公式的结果是 ' + flat.length + ' 个数的矩阵，不是单个值（' + entry.id + '）',
        '表达式：' + entry.expr + '。若需要矩阵结果，请用 operation:"matrix"。',
      )
    }
  }

  const numeric = Number(raw as number)
  if (!Number.isFinite(numeric)) {
    throw new CalcError(
      'non_finite',
      '结果不是有限数（' + entry.id + '）',
      '常见原因：除以 0、开方负数、指数溢出。检查参数值。',
    )
  }

  /** 显示。 */
  const shown = Number.isInteger(numeric)
    ? String(numeric)
    : trimDecimal(numeric, displayPrecision)

  if (terse) {
    return {
      result: shown + (entry.unit !== '' ? ' ' + entry.unit : ''),
      value: { id: entry.id, result: numeric, unit: entry.unit },
    }
  }

  /** 完整输出。 */
  const lines: string[] = []
  lines.push(entry.name + '  [' + entry.cat + ']')
  lines.push('表达式: ' + entry.expr)
  /** 参数表（覆盖的标 `*`）。 */
  for (const [key, value] of Object.entries(defaults)) {
    const used = overrides[key] !== undefined ? overrides[key] : value
    const mark = overrides[key] !== undefined ? ' *' : ''
    lines.push(key + ' = ' + fmtNumber(Number(used), FMT.general) + mark +
      (descs[key] !== '' ? '  (' + descs[key] + ')' : ''))
  }
  if (applied.length > 0) {
    lines.push('* 表示本次调用覆盖了默认值: ' + applied.join(', '))
  }
  if (entry.unit !== '') {
    lines.push('单位: ' + entry.unit)
  }
  lines.push('结果: ' + shown + (entry.unit !== '' ? ' ' + entry.unit : ''))

  return {
    result: lines.join('\n'),
    value: {
      id: entry.id,
      name: entry.name,
      expr: entry.expr,
      result: numeric,
      unit: entry.unit,
      appliedOverrides: applied,
      params: scope,
    },
  }
}

/**
 * 批量求值多条公式。
 *
 * @param engine - 引擎
 * @param entries - 公式条目（已按顺序）
 * @param overridesList - 每条的覆盖
 * @param displayPrecision - 显示精度
 * @returns 结果
 */
export function evaluateFormulaBatch(
  engine: Engine,
  entries: Array<{ entry: FormulaEntry; overrides: Record<string, unknown>; label?: string }>,
  displayPrecision = 8,
): FormulaOutcome {
  const results: Array<{ label: string; id: string; ok: boolean; text: string; value: unknown }> = []

  for (const item of entries) {
    const label = item.label ?? item.entry.id
    try {
      const one = evaluateFormula(engine, item.entry, item.overrides, displayPrecision, true)
      results.push({
        label,
        id: item.entry.id,
        ok: true,
        text: one.result,
        value: (one.value as { result: number }).result,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({
        label,
        id: item.entry.id,
        ok: false,
        text: '✗ ' + message.split('\n')[0],
        value: null,
      })
    }
  }

  const failed = results.filter((r) => !r.ok)
  const lines: string[] = []
  lines.push('═══ 批量公式（' + results.length + ' 条）═══')
  lines.push('')
  for (const r of results) {
    lines.push('  ' + r.label + ' = ' + r.text)
  }
  lines.push('')
  lines.push('成功 ' + (results.length - failed.length) + '，失败 ' + failed.length)

  return {
    result: lines.join('\n'),
    value: { items: results, failed: failed.length },
    /** 一条失败不影响其它条，但整体 `ok` 要反映。 */
    notice: failed.length > 0 ? '有 ' + failed.length + ' 条失败，详见 items。' : undefined,
  }
}
