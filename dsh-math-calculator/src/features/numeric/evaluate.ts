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
import { restoreSanitizedUnitNames } from '../../core/engine.js'
import { CalcError } from '../../core/errors.js'
import { tryUcumExpression } from '../../core/ucum.js'
import { toModernExpression } from '../../core/unit-bridge.js'
import { tryUnitPipeline } from '../../core/unit-pipeline.js'
import {
  FMT,
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
/** SI 基准量纲顺序（与 units.ts 的 DIM_ORDER 一致）。 */
const SI_DIMS: Array<{ base: string }> = [
  { base: 'kg' }, { base: 'm' }, { base: 's' }, { base: 'A' }, { base: 'K' }, { base: 'mol' }, { base: 'cd' },
]

/**
 * 常见单位名白名单（出现这些就认为显示正常，不归约）。
 *
 * 注意：这是**显示判据**，不是换算白名单——表外的单位照样能换算，
 * 只是显示时会被换成 SI 基准组合。
 */
const COMMON_UNIT_WORDS = [
  'kg', 'g', 'mg', 't', 'm', 'cm', 'mm', 'km', 'inch', 'ft', 'mile', 'yd',
  's', 'ms', 'min', 'h', 'day', 'year', 'A', 'K', 'mol', 'cd', 'Hz',
  'N', 'J', 'kJ', 'MJ', 'GJ', 'W', 'kW', 'MW', 'GW', 'hp', 'Pa', 'kPa', 'MPa', 'GPa',
  'C', 'V', 'F', 'H', 'S', 'T', 'Wb', 'Gy', 'Sv', 'Bq', 'kat', 'lm', 'lx',
  'kWh', 'MWh', 'L', 'mL', 'bar', 'atm', 'psi', 'degC', 'degF',
]

/**
 * 检测「除号链可能该加括号」的情况。
 *
 * ## 判据（三条同时满足才提示）
 *
 * 1. 表达式里有 **≥2 个除号**，且没有括号把它们分组；
 * 2. 结果单位里出现**负指数**（`kg^-2`、`s^-2`、`m^-6`）——同量纲相除本该约掉；
 * 3. 不是纯数字运算（纯数字的左结合是用户想要的）。
 *
 * ## 为什么不直接改语义
 *
 * `6/2/3 = 1` 是对的（左结合是数学约定）。替用户改成 `6/(2/3)` 会算错。
 * 所以只提示，不改结果。
 *
 * @param expression - 原始表达式
 * @param resultText - 格式化后的结果
 * @returns 提示文本；不该提示时 null
 */
function detectSuspectDivisionChain(expression: string, resultText: string): string | null {
  /** 只看带单位的式子（纯数字不提示）。 */
  if (!/[a-zA-Z\u4e00-\u9fa5]/.test(expression)) return null
  /** 除号计数（含 `/` 与 `÷`）。 */
  const slashes = (expression.match(/[/÷]/g) ?? []).length
  if (slashes < 2) return null
  /** 已有括号分组就不提示（用户已经明确意图）。 */
  if (/\([^()]*[/÷][^()]*\)\s*[/÷]/.test(expression) || /[/÷]\s*\(/.test(expression)) return null
  /** 结果必须有负指数才提示。 */
  if (!/\^-[\d]/.test(resultText)) return null
  /**
   * 给出建议写法。
   *
   * ⚠ 不能按 `/` 无脑拆 —— `30 MJ/kg / 16 MJ/kg` 拆成 `(30 MJ) / (kg) / …` 是错的，
   * 那等于「30 兆焦 ÷ 千克 ÷ 16 兆焦 ÷ 千克」，跟原式一样没解决。
   * 正确做法：只有**恰好两个除号**（形如 `a / b / c`）时给出 `(a) / (b) / (c)` 才对；
   * 四个除号的 `a/b / c/d` 要的其实是 `(a/b) / (c/d)`，分界点无从自动判定，
   * 所以只在「两段」时给具体写法，否则只讲原则。
   */
  const segments = expression.split(/\s*[/÷]\s*/).map((part) => part.trim()).filter((part) => part !== '')
  const suggested = segments.length === 2
    ? '(' + segments[0] + ') / (' + segments[1] + ')'
    : null
  const base = '除号链按**从左到右**计算（数学约定），所以 `' + expression + '` 得到 ' + resultText + '。'
  if (suggested !== null) return base + '若你想要同量纲相除（无量纲结果），请写：`' + suggested + '`。'
  return base + '同量纲相除本应约掉单位；如果你想要的是「（分子）/（分母）」，请把两边各自括起来，例如 `(30 MJ/kg) / (16 MJ/kg)`。'
}

/**
 * 判断显示文本是否用了冷门单位。
 *
 * @param text - 形如 `1e-44 foe` 或 `1000 m^2 / s^2`
 * @returns true = 应归约
 */
/**
 * 已知会被 mathjs 拿去代换的「具名单一单位」中文名。
 *
 * `5 m/s` 的结果单位会被换成 `日行里快`（速度维度里注册最晚的那个），
 * 于是显示成 `288.018 日行里快`。同类还有压强、能量等维度。
 * 判据要认这些名字，光认 `cz` 代号不够。
 */
const SUBSTITUTED_CJK_UNITS = ['日行里快', '驿马日行', '日行里', '一天走里']

function isObscureUnitText(text: string): boolean {
  /**
   * ## 判据必须是「白名单式的已知冷门」，不能是「不在常见集里」
   *
   * 反例（实测踩到）：`1 kg → 0.02 担` 里的「担」不在常见集 → 被判冷门 →
   * 强行归约成 `1 kg`，把用户要的「担」冲掉了。
   * 中文单位、时代单位、自设单位都不该被当成冷门。
   *
   * 所以只看**已知会误导的 mathjs 内部代号**：
   *   foe（超新星能量）、raddose（吸收剂量）——这两个是实测出来的。
   */
  const OBSCURE = ['foe', 'raddose', 'rad_dose', 'radabsorbed', 'czxxl', 'cznvc']
  const matched = /^-?[\d.]+(?:e[+-]?\d+)?\s+(.+)$/i.exec(text.trim())
  if (matched === null) return false
  const unitPart = matched[1]
  if (OBSCURE.some((name) => unitPart.includes(name))) return true
  /** 中文具名单位被代换（`288.018 日行里快`）也算可疑。 */
  return SUBSTITUTED_CJK_UNITS.some((name) => unitPart.includes(name))
}

/**
 * 把 mathjs Unit 归约成 SI 基准组合的文本。
 *
 * 目的：避免 mathjs 用「同量纲的冷门单位」显示（如 `J/g` → `raddose`）。
 *
 * @param value - mathjs Unit
 * @returns 归约后的文本；拆不出时 null（调用方退回原写法）
 */
function siReduce(value: unknown): string | null {
  const unit = value as { dimensions?: number[]; to?: (target: string) => unknown }
  const dims = unit.dimensions
  if (!Array.isArray(dims) || typeof unit.to !== 'function') return null
  const parts: string[] = []
  for (let i = 0; i < Math.min(SI_DIMS.length, dims.length); i += 1) {
    const power = dims[i]
    if (power === 0) continue
    parts.push(SI_DIMS[i].base + (power === 1 ? '' : '^' + power))
  }
  if (parts.length === 0) return null
  try {
    return String(unit.to(parts.join('*')))
  } catch {
    return null
  }
}

/**
 * 格式化标量/单位值给读者看。
 *
 * 单位值会归约掉 mathjs 的内部代号（`raddose`、`foe`、`czxxl`），
 * 但**用户明确写的单位**（`km/h`、`担`、`里`）一律保留。
 *
 * @param value - 求值结果
 * @param options - 显示精度等选项
 * @param engine - mathjs 引擎（取自定义单位）
 * @returns 文本、量级标注与中文读数
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
    /**
     * ## 单位归约到 SI 基准（2026-11-25 修）
     *
     * mathjs 显示单位时会挑一个**同量纲的已注册单位**，于是 `1 J/g` 被显示成
     * `1e+5 raddose`（吸收剂量的内部代号）——数值对，但读者看不懂，
     * 而且看起来像工具把量纲搞错了。
     *
     * 这里先尝试拆成 SI 基准组合（`J/g` → `m^2/s^2` 量纲），拆得出就用它；
     * 拆不出（无量纲/自定义单位）再退回原字符串。
     */
    /**
     * ## 只在「显示成冷门单位」时才归约（保守修复）
     *
     * mathjs 对复合单位的结果会挑**同量纲里最冷门的一个**显示：
     *   `1 J/g` → `1e+5 raddose`（吸收剂量内部代号）
     *   `1 N*m` → `1e-44 foe`（超新星能量单位）
     * 数值都对，但读者看不懂，且看起来像量纲搞错了。
     *
     * ⚠ 不能「一律归约到 SI」——那会把 `10 hp to kW` 变成 `(kg m^2)/s^3`，
     * 把用户明确要的单位冲掉（实测过，比原问题更糟）。
     * 判据：结果单位名**不在常见 SI/工程单位集里**时才归约。
     */
    const textRaw = String(value)
    /**
     * ⚠ **必须在 restoreCjkUnitNames 之前判断**（2026-11-26 修）。
     *
     * 顺序反了会漏掉中文合成名：`5 m/s` 的单位被 mathjs 换成 `czxxl`，
     * 先做 restore 就变成了「日行里快」——那已经不是 `cz` 形态，判据认不出，
     * 结果 `5 m/s` 显示成 `288.018 日行里快`（数值其实是 5 m/s，只是单位被代换）。
     * 实测：发布包验证时才发现 result 与 value 不一致。
     */
    let text = isObscureUnitText(textRaw) ? (siReduce(value) ?? textRaw) : textRaw
    text = restoreCjkUnitNames(text)
    text = restoreSanitizedUnitNames(text)
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
/**
 * 把 scope 里的 JS number 转成引擎的 BigNumber。
 *
 * 修复 2026-11-25 反馈 P1：JS number 与 BigNumber 混算会产生 17 位有效数字，
 * 转回时抛「>15 significant digits」。入口统一转 BigNumber 即可。
 *
 * @param engine - 引擎
 * @param scope - 原作用域
 * @returns 转换后的作用域
 */
function coerceScopeToBigNumber(engine: Engine, scope: Record<string, unknown>): Record<string, unknown> {
  const math = engine.math as unknown as { bignumber?: (value: number) => unknown }
  if (typeof math.bignumber !== 'function') return scope
  for (const [key, value] of Object.entries(scope)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    try {
      scope[key] = math.bignumber(value)
    } catch {
      /* 转换失败原样保留 */
    }
  }
  return scope
}
/**
 * 求值单个表达式（含单位管道与兼容桥）。
 *
 * @param expression - 表达式
 * @param options - 精度/显示/复数等选项
 * @param engine - mathjs 引擎
 * @param toolContext - 工具上下文（可为空）
 * @returns 结果、提示与错误；出错时抛出 CalcError
 */
export function evaluateOne(
  engine: Engine,
  expression: string,
  options: EvaluateOptions,
  /** 变量作用域（variables 注入；与老入口行为对齐）。 */
  scope?: Record<string, unknown>,
): EvaluateOutcome {
  let raw: unknown
  /** 非现代单位被桥接时的提示（`里/时辰` → SI）。 */
  let bridgedNote: string | undefined
  /**
   * 变量注入前统一转 BigNumber。
   *
   * 修复 2026-11-25 反馈 P1：JS number 与 BigNumber 混算时，
   * 中间结果会有 17 位有效数字，转回 BigNumber 时抛
   * 「Cannot implicitly convert a number with >15 significant digits」。
   * 在入口把数字变量转成 BigNumber，混算就不会退化成 JS 数字。
   */
  /**
   * 注意：**原地**把数字转 BigNumber，返回同一个对象。
   * 不能返回新对象——`expressions` 批量靠共享 scope 让「前一条赋值对后一条可见」
   *（`u=5` → `u*3=15`），换新对象会把这个语义切断（r62 回归）。
   */
  const scoped = scope === undefined ? undefined : coerceScopeToBigNumber(engine, scope)
  try {
    raw = engine.evaluate(expression, scoped)
  } catch (error) {
    /**
     * 复合单位兜底：mathjs 不认 `kg/m³` 这类写法时，交给 UCUM（NLM 实现）。
     * 只处理「数值 + 单位 to 单位」的纯换算式，不接管一般表达式。
     */
    /**
     * 非现代单位桥：把 `里/时辰` 这类换成 SI 再算一遍。
     * 这是用户要的「非现代 → 现代 → 非现代」链的第一段。
     */
    /** 统一单位管道：现代↔现代走 UCUM，非现代先桥接成 SI 再 UCUM。 */
    const pipeline = tryUnitPipeline(expression)
    if (pipeline !== null && pipeline.ok && pipeline.value !== null) {
      return {
        result: pipeline.text,
        value: pipeline.value,
        ok: true,
        notice: '单位管道：' + pipeline.message + '（' + pipeline.steps.join('；') + '）',
      }
    }
    const bridged = toModernExpression(expression)
    if (bridged.replaced.length > 0) {
      try {
        raw = engine.evaluate(bridged.expression, scope)
        bridgedNote = '已把 ' + bridged.replaced.map((item) => item.unit + '→' + item.si).join('、') + ' 换成现代单位计算。'
      } catch {
        /* 桥接后仍算不出：继续 UCUM */
      }
    }
    if (raw !== undefined) {
      /** 桥接成功：落到下面的统一后处理（量级/精度/注释都照常）。 */
    } else {
    const ucum = tryUcumExpression(expression)
    if (ucum !== null) {
      return {
        result: ucum.text,
        value: ucum.value,
        ok: true,
        notice: 'mathjs 不认这个复合单位，已用 UCUM 换算（源 ' + ucum.from + ' → 目标 ' + ucum.to + '）。',
      }
    }
    throw error
    }
  }

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
  /** 裸 number 的 NaN/Infinity（`evaluate('NaN')` 返回 number）也要拦。 */
  if (typeof raw === 'number' && !Number.isFinite(raw)) {
    throw new CalcError(
      'non_finite',
      '结果不是有限数（表达式：' + expression + '）',
      '`NaN`/`Infinity` 是符号而不是可用的数值结果；检查表达式是否真的算了东西。',
    )
  }
  /** 字符串形式的 NaN/Infinity 也要拦。 */
  if (typeof raw === 'string' && /^(NaN|Infinity|-Infinity)$/.test(raw.trim())) {
    throw new CalcError(
      'non_finite',
      '结果不是有限数（表达式：' + expression + '）',
      '`NaN`/`Infinity` 是符号而不是可用的数值结果；检查表达式是否真的算了东西。',
    )
  }
  /** 复数结果是合法结果（mathjs Complex），不能被 non_finite 吞掉。 */
  if (typeof raw === 'object' && raw !== null && !('isUnit' in (raw as object)) && 're' in (raw as object) && 'im' in (raw as object)) {
    const re = Number((raw as { re: unknown }).re)
    const im = Number((raw as { im: unknown }).im)
    if (Number.isFinite(re) && Number.isFinite(im)) {
      const text = im === 0 ? String(re) : re === 0 ? im + 'i' : re + ' + ' + im + 'i'
      return {
        result: '复数：' + text,
        value: { re, im },
        ok: true,
        notice: '结果是复数（含虚部）；实部 ' + re + '，虚部 ' + im + '。',
      }
    }
    throw new CalcError('non_finite', '复数结果含非有限分量（表达式：' + expression + '）', '检查实部/虚部是否溢出。')
  }
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

  /**
   * ## 超精度静默丢末位 → 必须提示（T8-D01）
   *
   * BigNumber 的有效位由引擎固定（64）。`(10^100+1)-(10^100)` 在 64 位下
   * 就是 0 —— 数学上正确、工程上是丢信息。旧的缺陷是「静默」。
   * 这里只提示，不改结果：把末位不可信这件事说出来，别假装精确。
   */
  const integerDigits = /^-?\d+$/.test(formatted.text) ? formatted.text.replace('-', '').length : 0
  const precision = options.precision ?? 64
  /**
   * 表达式里出现超过精度的量（`10^100`、65 位以上字面量）时，结果末位不可信。
   * 只看结果位数不够——`(10^100+1)-(10^100)` 的结果是 0（1 位），但过程已丢位。
   */
  const powerMatch = /10\s*\^\s*(\d+)/.exec(expression)
  const explicitPower = powerMatch !== null ? Number(powerMatch[1]) : 0
  const hasLongLiteral = /\d{65,}/.test(expression)
  const overflow = integerDigits > precision || explicitPower > precision || hasLongLiteral
  /**
   * displayPrecision=0 把非零小数截成 0 —— 这是语义，但必须提示，
   * 否则看起来像「算错了」（旧边界测试也正因为这一点要求不显示 0）。
   */
  const truncatedToZero =
    options.displayPrecision === 0 && Number.isFinite(unwrapped.n) && (unwrapped.n as number) !== 0 && Math.round(unwrapped.n as number) === 0
  const notices: string[] = []
  /**
   * ## 除法链可疑提示（2026-11-26）
   *
   * `30 MJ/kg / 16 MJ/kg` 在 mathjs 里按左结合算成 `((30·MJ)/kg)/16·MJ/kg`，
   * 结果是 `1.875 kg^-2` 而不是 `1.875`。纯数字 `6/2/3` 也是左结合（=1），
   * **这符合数学约定**，所以不能替用户改语义。
   *
   * 但用户写复合单位时几乎总想要 `(a/b)/(c/d)`。所以：
   * 只在「结果带负指数 + 表达式里有未加括号的多级除号」时给提示。
   */
  const suspectDivision = detectSuspectDivisionChain(expression, formatted.text)
  if (suspectDivision !== null) notices.push(suspectDivision)
  if (overflow) notices.push('表达式或结果涉及超过当前计算精度 ' + precision + ' 位的量——末位可能不可信；需要精确请显式传更高的 precision（上限 64），或改写表达式。')
  if (truncatedToZero) notices.push('按 displayPrecision:0 显示整数，原值 ' + String(unwrapped.n) + ' 非零但被截成 0；需要小数位请传 displayPrecision:≥1。')
  if (bridgedNote !== undefined) notices.push(bridgedNote)
  const notice = notices.length > 0 ? notices.join(' ') : undefined
  return {
    result,
    /** 大整数必须给**原文**，否则 JSON 里会丢位。 */
    value: unwrapped.bigText !== null ? unwrapped.bigText : toJsonValue(raw),
    ok: true,
    ...(notice !== undefined ? { notice } : {}),
  }
}

/** 锚点判据（与 help「通用手法」一致：max/min 是数值，expect 是数量级）。 */
export interface SanityRule {
  /** 上限（数值）。 */
  max?: number
  /** 下限（数值）。 */
  min?: number
  /** 期望数量级：expect:3 表示 10³。 */
  expect?: number
  /** 判据依据（只回显，不参与计算）。 */
  note?: string
}

/** 数值提取：只比对有限数值；带单位/非数值结果不报（量纲不可比）。 */
function numericOfValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value !== null && typeof value === 'object' && typeof (value as { value?: unknown }).value === 'number') {
    const inner = (value as { value: number }).value
    return Number.isFinite(inner) ? inner : null
  }
  return null
}

/**
 * 锚点数值显示：10 的整数幂写成 1eN（与 help 示例一致），其余走通用格式。
 *
 * @param value - 数值
 * @returns 显示文本
 */
function showAmount(value: number): string {
  if (Number.isFinite(value) && value !== 0) {
    const exponent = Math.log10(Math.abs(value))
    if (Math.abs(exponent - Math.round(exponent)) < 1e-9 && Math.abs(exponent) >= 3) {
      return (value < 0 ? '-1e' : '1e') + Math.round(exponent)
    }
  }
  return fmtNumber(value, FMT.general)
}

/**
 * 比对一条锚点。
 *
 * @param value - 求值结果
 * @param rule - 判据
 * @returns 状态与说明
 */
function checkSanity(value: unknown, rule: SanityRule): { status: 'passed' | 'violated' | 'unknown'; detail: string } {
  const numeric = numericOfValue(value)
  if (numeric === null) return { status: 'unknown', detail: '结果不是数值，锚点未比对' }
  if (typeof rule.max === 'number' && numeric > rule.max) {
    const times = rule.max === 0 ? Infinity : numeric / rule.max
    return {
      status: 'violated',
      detail: '⚠ 超出锚点上限 ' + showAmount(rule.max) + (rule.note !== undefined ? '（' + rule.note + '）' : '') +
        (Number.isFinite(times) ? ' 达 ' + showAmount(times) + ' 倍' : ''),
    }
  }
  if (typeof rule.min === 'number' && numeric < rule.min) {
    const times = numeric === 0 ? Infinity : rule.min / numeric
    return {
      status: 'violated',
      detail: '⚠ 低于锚点下限 ' + showAmount(rule.min) + (rule.note !== undefined ? '（' + rule.note + '）' : '') +
        (Number.isFinite(times) ? ' 达 ' + showAmount(times) + ' 倍' : ''),
    }
  }
  if (typeof rule.expect === 'number') {
    /** expect 是数量级：与 10^expect 差 ≥1 个数级才报。 */
    const magnitude = numeric === 0 ? -Infinity : Math.log10(Math.abs(numeric))
    if (Number.isFinite(magnitude) && Math.abs(magnitude - rule.expect) >= 1) {
      return {
        status: 'violated',
        detail: '⚠ 与锚点量级 10^' + rule.expect + ' 相差 ' + Math.abs(magnitude - rule.expect).toFixed(1) + ' 个数级' +
          (rule.note !== undefined ? '（' + rule.note + '）' : ''),
      }
    }
  }
  return { status: 'passed', detail: '' }
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
  expressions: Array<string | { label?: string; expr: string; sanity?: SanityRule }>,
  options: EvaluateOptions,
  /** 变量作用域（variables 注入）。 */
  scope?: Record<string, unknown>,
): EvaluateOutcome {
  /** 上限 100 条 —— 再多该走数据引用，不是堆表达式撑上下文。 */
  const MAX_BATCH = 100
  if (expressions.length > MAX_BATCH) {
    throw new CalcError('invalid_argument', 'expressions 一次最多 ' + MAX_BATCH + ' 条（收到 ' + expressions.length + ' 条）', '拆成多次调用；批量调用用 calls（上限 50）。')
  }
  const items = expressions
  /**
   * 批量内**共享作用域**：help 承诺「前一条的赋值对后一条可见」（R56/R61）。
   * 原先每条传 undefined，engine 内部 `scope ?? {}` 每次都新建 → `u=5` 写不回去。
   */
  const sharedScope: Record<string, unknown> = scope ?? {}

  interface ItemResult {
    index: number
    label: string
    expression: string
    ok: boolean
    text: string
    value: unknown
    error?: string
    /** 锚点结果（只有条目带 sanity 时存在）。 */
    sanityStatus?: 'passed' | 'violated' | 'unknown'
    sanityNote?: string
  }
  const results: ItemResult[] = []

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    const expr = typeof item === 'string' ? item : item.expr
    const label = typeof item === 'string' ? '' : (item.label ?? '')
    try {
      const one = evaluateOne(engine, expr, options, sharedScope)
      /** 锚点：help 承诺「只在批量 expressions 里生效」，此前实现缺失（R58）。 */
      const rule = typeof item === 'string' ? undefined : item.sanity
      const sanity = rule !== undefined && rule !== null ? checkSanity(one.value, rule) : null
      results.push({
        index: i + 1,
        label,
        expression: expr,
        ok: true,
        text: one.result,
        value: one.value,
        ...(sanity !== null ? { sanityStatus: sanity.status, sanityNote: sanity.detail } : {}),
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
    if (item.sanityNote !== undefined && item.sanityNote !== '') lines.push('     ' + item.sanityNote)
  }
  lines.push('')
  const violated = results.filter((item) => item.sanityStatus === 'violated').length
  if (violated > 0) lines.push('锚点：' + violated + ' 条越界（判据由你给，工具只比对不猜）')
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
        ...(r.sanityStatus !== undefined ? { sanityStatus: r.sanityStatus } : {}),
        ...(r.sanityNote !== undefined ? { sanityNote: r.sanityNote } : {}),
      })),
      sanityViolations: results.filter((item) => item.sanityStatus === 'violated').length,
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
