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
  if (digits === 0) {
    if (abs < 1) return value.toExponential(6).replace(/\.?0+e/, 'e')
    return String(Math.round(value))
  }
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
  if (any.isUnit === true) return restoreCjkUnitNames(String(any.toString()))
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
