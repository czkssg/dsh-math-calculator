/**
 * 结果格式化与 JSON 安全化。
 *
 * BigNumber 的坑：`math.format(bignumber(50)!)` 默认走 auto，会输出
 * `3.0414e+64`，看起来像浮点近似，实际是精确值。必须用 `notation:'fixed'`
 * 才能把完整数字打出来。所以整数一律走 fixed。
 *
 * @module dsh-math-calculator/format
 */

/** 可无损 JSON 化的值。 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

/** 数字转字符串：非有限值不进入 JSON。 */
export function safeNumber(value: number): JsonValue {
  return Number.isFinite(value) ? value : String(value)
}

/**
 * 判断一个 BigNumber/数字是否是整数（无小数部分）。
 * 用于决定格式化时要不要用 fixed。
 */
export function isIntegerLike(value: any): boolean {
  try {
    if (typeof value === 'number') return Number.isInteger(value)
    if (value && typeof value.isInteger === 'function') return value.isInteger()
    if (value && value.isBigNumber) {
      // BigNumber#isInteger 在 mathjs 里可能不存在，退回字符串判断
      const text = value.toString()
      if (/e/i.test(text)) return false
      return !text.includes('.')
    }
  } catch {
    /* 判断失败就当作非整数 */
  }
  return false
}

/**
 * 格式化输出值：**整数完整，小数按显示精度截断**。
 *
 * ## 计算精度 vs 显示精度
 *
 * `precision` 是计算精度（BigNumber 的有效位数），拿它直接当显示位数有两个毛病：
 *   · 64 位全吐出来，一行里六十个数字，人和 AI 都读不下去
 *   · 真调低 precision 又会**算错大数** —— 实测 `(10^20+1)-(10^20)`
 *     在 precision=20 时得 0（应为 1）
 *
 * 所以拆成两层：计算永远按 `precision`（默认 64）走，显示用 `displayPrecision`。
 *
 * ## 整数不做截断
 *
 * `10^20+5`、`50!` 这类整数照原样输出。把 `10^20+5` 写成 `1e20` 是**丢信息**，
 * 不是简洁 —— 作者问「等于多少」，答案就该精确到个位。
 *
 * @param math - mathjs 实例
 * @param value - 待格式化的值
 * @param precision - 计算精度（BigNumber 有效位数）
 * @param displayPrecision - 显示有效位数；省略则用计算精度（保持旧行为）
 * @returns 显示串
 */
export function formatValue(
  math: any,
  value: any,
  precision: number,
  displayPrecision?: number,
): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'function') return '[function]'
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value)

  const isBig = Boolean(value && value.isBigNumber)
  const integer = isIntegerLike(value)
  // 显示位数只在明确给了、且小于计算精度时才生效
  const show = typeof displayPrecision === 'number' && Number.isFinite(displayPrecision)
    ? Math.min(displayPrecision, precision)
    : precision

  try {
    if (isBig && integer) {
      return math.format(value, { notation: 'fixed' })
    }
    // 显示精度足够高（接近计算精度）时用 auto，避免丢掉整数位的信息
    return math.format(value, { notation: 'auto', precision: show })
  } catch {
    try {
      return String(value)
    } catch {
      return '[unprintable]'
    }
  }
}

/**
 * 把 mathjs 的任意返回值转成可 JSON 化的值。
 * Matrix / Complex / Unit / Fraction / BigNumber / Range / ResultSet 分别处理。
 */
export function toJsonValue(value: any, depth = 0, seen = new Set<unknown>()): JsonValue {
  if (value === null || value === undefined) return null

  const kind = typeof value
  if (kind === 'number') return safeNumber(value as number)
  if (kind === 'string' || kind === 'boolean') return value as JsonValue
  if (kind === 'bigint') return String(value)
  if (kind === 'function') return null
  if (kind !== 'object') return null
  if (depth > 8) return String(value)

  if (seen.has(value)) return '[circular]'
  seen.add(value)
  try {
    if (Array.isArray(value)) {
      const limited = value.length > 5000 ? value.slice(0, 5000) : value
      return limited.map((item) => toJsonValue(item, depth + 1, seen))
    }

    const object = value as any

    if (object.isMatrix && typeof object.toArray === 'function') {
      try {
        return toJsonValue(object.toArray(), depth + 1, seen)
      } catch {
        return String(value)
      }
    }
    if (object.isRange && typeof object.toArray === 'function') {
      try {
        return toJsonValue(object.toArray(), depth + 1, seen)
      } catch {
        return String(value)
      }
    }
    if (object.isComplex) {
      return {
        re: toJsonValue(object.re, depth + 1, seen),
        im: toJsonValue(object.im, depth + 1, seen),
        text: String(value),
      }
    }
    if (object.isUnit) return String(value)
    if (object.isFraction || object.isBigNumber) return String(value)
    if (object.isResultSet && Array.isArray(object.entries)) {
      const entries = object.entries
      return toJsonValue(entries.length === 1 ? entries[0] : entries, depth + 1, seen)
    }

    const plain: { [key: string]: JsonValue } = {}
    let count = 0
    for (const key of Object.keys(object)) {
      if (count >= 500) break
      count += 1
      try {
        plain[key] = toJsonValue(object[key], depth + 1, seen)
      } catch {
        plain[key] = null
      }
    }
    return plain
  } finally {
    seen.delete(value)
  }
}

/** 取 ResultSet 的最后一个值（`a=1; b=2; a+b` → 3）。 */
export function unwrapResult(value: any): any {
  if (value && typeof value === 'object' && value.isResultSet && Array.isArray(value.entries)) {
    if (value.entries.length === 0) return undefined
    return value.entries[value.entries.length - 1]
  }
  return value
}

/** 递归判断一个 JSON 值里是否含非有限数字。 */
export function containsNonFinite(value: JsonValue | undefined): boolean {
  if (value === undefined) return false
  if (typeof value === 'number') return !Number.isFinite(value)
  if (typeof value === 'string') return value === 'NaN' || value === 'Infinity' || value === '-Infinity'
  if (Array.isArray(value)) return value.some((item) => containsNonFinite(item))
  if (value !== null && typeof value === 'object') {
    return Object.values(value as { [key: string]: JsonValue }).some((item) => containsNonFinite(item))
  }
  return false
}

/**
 * 尽力把任意值转成有限数字。失败返回 undefined。
 * 复数只接受虚部≈0 的情况。
 */
export function toFiniteNumber(value: any): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : undefined
  }
  if (value && typeof value === 'object') {
    if (value.isComplex) {
      const re = toFiniteNumber(value.re)
      const im = toFiniteNumber(value.im)
      if (re !== undefined && im !== undefined && Math.abs(im) < 1e-12) return re
      return undefined
    }
    if (value.isUnit && typeof value.toNumber === 'function') {
      try {
        const numeric = value.toNumber()
        return Number.isFinite(numeric) ? numeric : undefined
      } catch {
        return undefined
      }
    }
    if (value.isFraction || value.isBigNumber) {
      try {
        const numeric = Number(value.valueOf())
        return Number.isFinite(numeric) ? numeric : undefined
      } catch {
        return undefined
      }
    }
  }
  return undefined
}
