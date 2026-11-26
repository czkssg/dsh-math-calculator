/**
 * 数值格式化与可信度标签。
 *
 * ## 这一层为什么必须保留设计
 *
 * 格式化看着是「把数变成字符串」，但这个项目的格式化承载了**判断信息**：
 *
 * ```
 *   1e12 g   → 应为「100 万吨」，不是「1 Tg」
 *   2 m to cm → 应为「200 cm」，不是「2 m」（显式换算不许被归位撤回）
 *   0.00000123 → 应为科学计数法，不是「0.00000123」（有效位不够）
 * ```
 *
 * 这三条都是**实测踩出来的**，不是设计出来的。新代码保留这些判据。
 *
 * ## 三层精度（这是最容易搞混的地方）
 *
 * ```
 *   precision          计算精度（BigNumber 有效位，默认 64）
 *   displayPrecision   显示精度（**小数点后几位**，默认 8）
 *   工作区固化          把 displayPrecision 存下来，此后免传
 * ```
 *
 * **`displayPrecision` 是小数位，不是有效数字** —— 这个语义曾写错过一次，
 * 导致 AI 建立了错的心智模型（以为设 8 得到 8 位有效数字）。
  *
 * @module dsh-math-calculator/core/format
 */

/** 格式化选项。 */
export interface FmtOptions {
  /** 超过这个绝对值就用科学计数法。 */
  expHigh: number
  /** 小于这个绝对值（且非 0）就用科学计数法。 */
  expLow: number
  /** 科学计数法的尾数位数。 */
  expDigits: number
  /** 定点表示的有效位数。 */
  precision: number
  /** 非有限值的显示（默认 `—`）。 */
  nanDisplay?: string
}

/** 常用预设。 */
export const FMT = {
  /** 通用：大数用科学计数，小数保留合理位数。 */
  general: { expHigh: 1e9, expLow: 1e-6, expDigits: 6, precision: 8 } as FmtOptions,
  /** 简短（摘要类输出）。 */
  short: { expHigh: 1e6, expLow: 1e-2, expDigits: 2, precision: 3 } as FmtOptions,
  /** 科学（推演栈类输出）。 */
  sci: { expHigh: 1e5, expLow: 1e-3, expDigits: 3, precision: 5 } as FmtOptions,
  /** 展示（单位换算类输出）。 */
  show: { expHigh: 1e15, expLow: 1e-4, expDigits: 4, precision: 6 } as FmtOptions,
} as const

/**
 * 数字 → 字符串（**唯一实现**）。
 *
 * @param value - 数值
 * @param opt - 格式选项
 * @returns 显示串
 */
export function fmtNumber(value: number, opt: FmtOptions): string {
  if (!Number.isFinite(value)) return opt.nanDisplay ?? '—'
  const abs = Math.abs(value)
  /**
   * 科学计数法的两个门槛都是**双侧**的：
   * 太大（`expHigh`）或太小（`expLow`）都换 —— 因为 `0.0000000001`
   * 用定点写出来既难读又容易数错 0。
   *
   * `abs > 0` 这个条件是必需的：0 不该走科学计数法。
   */
  if (abs >= opt.expHigh || (abs > 0 && abs < opt.expLow)) return value.toExponential(opt.expDigits)
  /** `toPrecision` 后转 Number 再去 toString，能去掉尾随零。 */
  return Number(value.toPrecision(opt.precision)).toString()
}

/** 简短格式（摘要用）。 */
export const fmtShort = (v: number, digits = 3): string =>
  fmtNumber(v, { expHigh: 1e6, expLow: 1e-2, expDigits: 2, precision: digits })

/** 科学格式（推演栈用）。 */
export const fmtSci = (v: number): string => fmtNumber(v, FMT.sci)

/** 展示格式（单位换算用）。 */
export const fmtShow = (v: number): string => fmtNumber(v, FMT.show)

/** 通用格式。 */
export const fmtGeneral = (v: number): string => fmtNumber(v, FMT.general)

/**
 * 按「小数点后几位」截断（`displayPrecision` 语义）。
 *
 * ## 三个必须处理的边界（都是踩过的）
 *
 * ```
 *   ① 极小数被截成 0        → 3.3e-9 在 8 位小数下变 "0.00000000" → 数据丢失
 *   ② 整数不许截断          → 10^20+5 必须完整显示 21 位
 *   ③ 高精度路径补零        → disp=16 时出现 "...890000000000"
 * ```
 *
 * @param value - 数值
 * @param digits - 小数点后保留几位（0 = 只留整数）
 * @returns 显示串
 */
export function trimDecimal(value: number, digits: number): string {
  if (!Number.isFinite(value)) return String(value)
  if (Number.isInteger(value)) return String(value)

  const abs = Math.abs(value)
  /**
   * ① 会被截成 0 的值，改用科学计数法。
   *
   * 这不是「不够精确」，是**把非零值显示成零**，属于数据丢失。
   */
  /**
   * displayPrecision=0 → 只留整数（四舍五入）。
   *
   * 注意：<1 的非零值会显示成 0，这是「精度 0」的语义，不是算错。
   * 调用方传 displayPrecision:0 就是要这个效果；需要非零显示请给 ≥1。
   */
  if (digits === 0) return String(Math.round(value))
  if (abs < Math.pow(10, -digits)) return value.toExponential(6).replace(/\.?0+e/, 'e')

  /** ② 定点截断。 */
  const text = abs.toFixed(digits)
  /** ③ 去掉尾随零（但不去掉整数部分的零）。 */
  const trimmed = text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text
  return (value < 0 ? '-' : '') + trimmed
}

/**
 * 数值量级（10 的幂）。
 *
 * @param value - 数值
 * @returns 量级（如 2133 → 3）
 */
export function magnitudeOf(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 0
  return Math.floor(Math.log10(Math.abs(value)))
}

/**
 * 量级标注：`(~10³)`。
 *
 * ## 为什么只在 ≥10⁴ 时标注
 *
 * 试过「只要不是 1 位数就标」，结果：
 *
 * ```
 *   3 km  →  注：3 km = 3000 m，量级 10³     ← 注了等于没注，反而占行宽
 * ```
 *
 * 日常量级人本来就有直觉。**只注不直观的那些**。
 *
 * @param value - 数值
 * @returns 标注串；不需要标注时返回空串
 */
export function annotateMagnitude(value: number): string {
  if (!Number.isFinite(value) || value === 0) return ''
  const mag = magnitudeOf(value)
  if (Math.abs(mag) < 4) return ''
  return '(~10' + superscript(mag) + ')'
}

/** 数字 → 上标（10³ 的那个 3）。 */
export function superscript(n: number): string {
  const map: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
  }
  return String(n).split('').map((c) => map[c] ?? c).join('')
}

/**
 * 科学计数法的可读展开：`8.778e7` → `约 8778 万`。
 *
 * ## 为什么需要它
 *
 * 中文语料里 `8778 万吨` 比 `8.778e7 t` 好读得多，而**长链推演里最容易数错 0**。
 * 这个函数给一个「人话锚点」。
 *
 * @param value - 数值
 * @returns 中文量级说法；量级不适用时返回空串
 */
export function chineseMagnitude(value: number): string {
  if (!Number.isFinite(value) || value === 0) return ''
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1e8) {
    const n = abs / 1e8
    return sign + '约 ' + fmtNumber(n, { expHigh: 1e9, expLow: 1e-3, expDigits: 3, precision: 4 }) + ' 亿'
  }
  if (abs >= 1e4) {
    const n = abs / 1e4
    return sign + '约 ' + fmtNumber(n, { expHigh: 1e9, expLow: 1e-3, expDigits: 3, precision: 4 }) + ' 万'
  }
  return ''
}

/**
 * 把 mathjs 的单位名还原成中文写法。
 *
 * ## 为什么需要这一步
 *
 * 为了让中文古制单位能参与运算，它们在 mathjs 里注册成 `cnli`（见 `cjk-units.ts`）。
 * 但输出给用户时显示 `1.006 cnli` 显然不如 `1.006 里`。
 *
 * ## 只还原「整个单位部分」精确匹配的
 *
 * ```
 *   "1.006 cnli"        → "1.006 里"        ✓
 *   "15 km"             → "15 km"           （不动）
 *   "3.5 cnli/s"        → 不还原             ← 复合单位保持符号，避免歧义
 * ```
 *
 * 复合单位不还原是刻意的：`里每秒`、`亩每公顷` 这类中文组合读起来比符号更绕。
 *
 * @param text - 格式化后的文本（如 `"1.006 cnli"`）
 * @returns 中文单位还原后的文本
 */
export function restoreCjkUnitNames(text: string): string {
  const m = /^(.*?)\s+(cn[a-z]+)$/.exec(text)
  if (!m) return text
  const CJK_NAME: Record<string, string> = {
    cnli: '里', cnzhang: '丈', cnchi: '尺', cncun: '寸',
    cnjin: '斤', cnliang: '两', cndan: '石', cndou: '斗',
    cnshichen: '时辰', cnke: '刻', cnmu: '亩', cnqing: '顷',
  }
  const cjk = CJK_NAME[m[2]]
  return cjk === undefined ? text : m[1] + ' ' + cjk
}

/**
 * 把自设单位的注册名还原成「@显示名」。
 *
 * ## 为什么要加 `@`
 *
 * 自设单位与标准单位混在同一个表达式里时，读者必须能分辨两者：
 *
 * ```
 *   1.5 @维尔        自设（本世界发明的）
 *   1.5 km          标准
 * ```
 *
 * `@` 前缀借自 [UCUM 扩展讨论](https://www.healthintersections.com.au/2025/01/14/extending-ucum.html)
 * 的建议 —— 它明确说「用现有单位不用的字符做命名空间」，
 * 这样库能识别「这条表达式含非标准单位」。
 *
 * @param text - 含注册名的文本
 * @param units - 自设单位表
 * @returns 还原后的文本
 */
export function restoreCustomUnitNames(
  text: string,
  units: Array<{ name: string; display: string }>,
): string {
  if (units.length === 0) return text
  let out = text
  /** 按长度降序，避免短名抢先匹配。 */
  const sorted = [...units].sort((a, b) => b.name.length - a.name.length)
  for (const unit of sorted) {
    /** 整词匹配：前后不能紧接字母数字。 */
    const pattern = new RegExp('(?<![A-Za-z0-9])' + unit.name + '(?![A-Za-z0-9])', 'g')
    out = out.replace(pattern, '@' + unit.display)
  }
  return out
}

/**
 * 结果 → 可进 JSON 的值（去掉不可序列化的东西）。
 *
 * ## 为什么需要它
 *
 * 宿主用 `additionalProperties: false` **校验**工具输出。
 * 若把 mathjs 的 `BigNumber`、`Unit`、`Matrix` 直接塞进 `value`，
 * 序列化会在宿主侧失败（2.1.0 事故的原因之一）。
 *
 * @param value - 任意结果
 * @returns 可安全 JSON 化的值
 */
/** SI 基准量纲顺序。 */
const SI_BASE_ORDER = ['kg', 'm', 's', 'A', 'K', 'mol', 'cd']

/** 各量纲的标准 SI 显示写法（dimensions 拼串 → 期望显示）。 */
const STANDARD_DIMENSION_UNITS: Record<string, string> = {
  '0,1,0,0,0,0,0,0,0': 'm',
  '0,0,1,0,0,0,0,0,0': 's',
  '1,0,0,0,0,0,0,0,0': 'kg',
  '0,1,-1,0,0,0,0,0,0': 'm/s',
  '0,2,-2,0,0,0,0,0,0': 'm^2/s^2',
  '1,-1,-2,0,0,0,0,0,0': 'Pa',
  '1,2,-2,0,0,0,0,0,0': 'J',
  '1,2,-3,0,0,0,0,0,0': 'W',
  '1,1,-2,0,0,0,0,0,0': 'N',
  '0,0,-1,0,0,0,0,0,0': 'Hz',
}

/**
 * 把被 mathjs 换过的单位显示归位到标准写法。
 *
 * @param text - 原始显示文本（如 `11.18 mph`）
 * @param unit - mathjs Unit
 * @returns 归位后的文本（不需要时原样返回）
 */
function normalizeDisplayedUnit(text: string, unit: any): string {
  const dims = unit?.dimensions
  if (!Array.isArray(dims)) return text
  /**
   * ⚠ 只有「用户没指定目标单位」时才归位。
   * `5 m/s to km/h` 的显示必须是 `18 km/h`——那是用户明确要的，
   * 无条件归位会把它改回 `5 m/s`（实测踩到）。
   * 判据：结果单位名与「基本单位乘积」一致且含 mph/kn/日行里 这类被替换的痕迹才归位。
   */
  const matched0 = /^-?[\d.]+(?:e[+-]?\d+)?\s+(.+)$/i.exec(text.trim())
  if (matched0 === null) return text
  const shown = matched0[1].replace(/\s+/g, '')
  /**
   * 只归位「被冒名顶替」的单位：显示名是 mph/kn/日行里 这类**具名单一单位**，
   * 而不是基本单位乘积（`m/s`、`km/h`、`kg*m/s^2`）。
   *
   * 这样 `5 m/s to km/h` 的 `km/h` 不会被改（它是乘积形态），
   * 而裸 `5 m/s` 被显示成的 `mph` 会被归位回 `m/s`。
   */
  /**
   * ## 只处理 mathjs 的「内部合成名」，不碰用户注册的单位
   *
   * 合成名形态：`cz` + 3 位小写字母（如 `czxxl`、`cznvc`），来自中文单位内部编码。
   * 用户通过 registerUnits 注册的 `zli` 不是这种形态，必须原样返回（r82 抓过）。
   */
  /**
   * ## 两种要归位的情况（其余一律原样）
   *
   * ① mathjs 内部合成名：`cz` + 3 位小写字母（`czxxl`=日行里快）；
   * ② 被 mathjs 拿去代换的具名中文单位（`5 m/s` 会显示成 `288.018 日行里快`）。
   *
   * ⚠ 但**用户自己写的中文单位**（`里`、`担`、`时辰`）绝不能动——
   * 那是他明确要的单位，改掉会让人以为工具换了单位（`r82` 抓过 `1 zli` 被判成 `m`）。
   * 判据差别在于：代换只发生在「复合单位的结果」上，用户写的则是输入里原本就有。
   */
  const SYNTHETIC = /^cz[a-z]{3}$/
  const SUBSTITUTED = ['日行里快', '驿马日行', '日行里', '一天走里']
  const isSynthetic = SYNTHETIC.test(shown)
  const isSubstituted = SUBSTITUTED.some((name) => shown.includes(name))
  if (!isSynthetic && !isSubstituted) return text
  const key = dims.join(',')
  const expected = STANDARD_DIMENSION_UNITS[key]
  if (expected === undefined) return topLevelObscureCheck(text, unit)
  /** 已是标准写法就不动。 */
  const matched = /^-?[\d.]+(?:e[+-]?\d+)?\s+(.+)$/i.exec(text.trim())
  if (matched === null) return text
  const shownUnit = matched[1].replace(/\s+/g, '')
  if (shownUnit === expected || shownUnit === expected.replace(/\*/g, ' ')) return text
  try {
    return String(unit.to(expected))
  } catch {
    return text
  }
}

/** 非标准量纲的兜底：只处理那两个已知会误导的代号。 */
function topLevelObscureCheck(text: string, unit: any): string {
  return replaceObscureUnit(text, unit)
}

/** 会迷惑读者的内部代号（mathjs 拿它们当同量纲首选）。 */
const OBSCURE_UNITS = ['raddose', 'rad_dose', 'radabsorbed', 'czxxl', 'cznvc', '日行里快', '驿马日行']

/**
 * 把冷门内部单位替换成 SI 基准组合（只在这几个代号出现时）。
 *
 * @param text - 原始显示文本
 * @param unit - mathjs Unit（用于取 dimensions 做归约）
 * @returns 替换后的文本；不含冷门代号时原样返回
 */
function replaceObscureUnit(text: string, unit: any): string {
  if (!OBSCURE_UNITS.some((name) => text.includes(name))) return text
  const reduced = reduceUnitToSi(unit)
  return reduced ?? text
}

/**
 * 把 mathjs Unit 归约成 SI 基准组合。
 *
 * @param unit - mathjs Unit
 * @returns 归约文本；拆不出时 null
 */
function reduceUnitToSi(unit: any): string | null {
  const dims = unit?.dimensions
  if (!Array.isArray(dims) || typeof unit.to !== 'function') return null
  const parts: string[] = []
  for (let i = 0; i < Math.min(SI_BASE_ORDER.length, dims.length); i += 1) {
    const power = dims[i]
    if (power === 0) continue
    parts.push(SI_BASE_ORDER[i] + (power === 1 ? '' : '^' + power))
  }
  if (parts.length === 0) return null
  try {
    return String(unit.to(parts.join('*')))
  } catch {
    return null
  }
}

/**
 * 把任意值转成**无损 JSON**（宿主校验要求）。
 *
 * `undefined` 不是 JSON 值，会让整个输出被判非法；数组里的 `undefined` 转 null，
 * 对象里的直接删键。单位值会先归约到 SI 基准，避免露出 mathjs 内部代号。
 *
 * @param value - 任意运行时值
 * @returns 可安全序列化的 JSON 值
 */
export function toJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  const t = typeof value
  if (t === 'string' || t === 'boolean') return value
  if (t === 'number') return Number.isFinite(value as number) ? value : String(value)

  const any = value as Record<string, unknown>
  /** mathjs BigNumber。 */
  if (any.isBigNumber === true) {
    const n = Number(any.toString())
    return Number.isFinite(n) ? n : String(any.toString())
  }
  /** mathjs Unit（中文单位名还原成人话）。 */
  if (any.isUnit === true) {
    /**
     * ## 只在「显示成冷门内部单位」时才改写（保守修复）
     *
     * mathjs 会选择同量纲里的**某个**已注册单位来显示：
     * `1 J/kg` 与 `1 J/g` 都是「比能」量纲，却都显示成 `raddose`（吸收剂量的内部代号）。
     * 数值正确，但读者看不懂，且看起来像把量纲搞错了。
     *
     * ⚠ 不能用「全部归约到 SI」——那会把 `10 hp to kW` 变成 `(kg m^2)/s^3`，
     * 把用户明确要的单位冲掉（实测过，比原问题更糟）。
     * 所以只在这几个内部代号出现时替换，其余一律原样。
     */
    const raw = String(any.toString())
    /**
     * ## ★ 显示层归位（2026-11-26）
     *
     * 注册过速度类单位后，mathjs 会把裸 `5 m/s` 的**显示**换成 `mph` 这类单位
     * （数值仍正确：11.18 mph = 5 m/s，但读者看到的是被换过的单位）。
     *
     * 修法：若显示用的单位名不是「该量纲的标准 SI 写法」，就按 dimensions 归约回去。
     * 标准写法表见 STANDARD_DIMENSION_UNITS。
     */
    const normalized = normalizeDisplayedUnit(raw, any)
    return restoreCjkUnitNames(normalized)
  }
  /** mathjs Matrix。 */
  if (typeof any.toArray === 'function') return toJsonValue(any.toArray())
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (t === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(any)) out[k] = toJsonValue(v)
    return out
  }
  return String(value)
}
