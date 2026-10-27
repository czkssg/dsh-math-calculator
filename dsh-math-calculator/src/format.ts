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
 * 格式化输出值：**整数完整，小数按「小数点后几位」截断**。
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
 * ## displayPrecision 的语义是「小数点后几位」，不是「有效数字」
 *
 * 这个区别很重要，实测对比：
 *
 *   数值              有效数字=8（旧）    小数位=8（现在）
 *   12345.678901234   12345.679           12345.67890123
 *   1/7               0.14285714          0.14285714
 *   2^0.5             1.4142136           1.41421356
 *
 * 说「保留 8 位」时想的是小数位 —— 而有效数字语义下，
 * 数字越大得到的小数位越少，`12345.678901234` 只给 3 位小数，与直觉不符。
 *
 * ## 整数不做截断
 *
 * `10^20+5`、`50!` 这类整数照原样输出。把 `10^20+5` 写成 `1e20` 是**丢信息**，
 * 不是简洁 —— 作者问「等于多少」，答案就该精确到个位。
 *
 * @param math - mathjs 实例
 * @param value - 待格式化的值
 * @param precision - 计算精度（BigNumber 有效位数）
 * @param displayPrecision - **小数点后保留几位**；省略则输出完整精度
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

  try {
    // 整数：完整输出，不受显示精度影响
    if (isBig && integer) {
      return math.format(value, { notation: 'fixed' })
    }

    const numeric = isBig ? Number(value.toString()) : typeof value === 'number' ? value : null

    /**
     * 没有显式显示精度：保持旧行为（完整精度）。
     *
     * 只是把「极长的小数」改用科学计数法，避免一屏六十位。
     */
    if (displayPrecision === undefined || !Number.isFinite(displayPrecision)) {
      return math.format(value, { notation: 'auto', precision })
    }

    // 有显式显示精度：按**小数位**保留
    const decimals = Math.max(0, Math.min(64, Math.round(displayPrecision)))

    /**
     * 大精度（> 15 位小数）必须走 BigNumber 原值，不能先转 Number。
     *
     * 双精度只有约 15—17 位有效数字，`Number('0.333...'.repeat)` 之后
     * 再 toFixed 会得到垃圾尾数。实测 `1/3` 在 precision=30 时应给 30 位，
     * 转换后只能给 16 位。
     *
     * 这条路径直接让 mathjs 格式化原始 BigNumber。
     */
    if (decimals > 15 && isBig) {
      return math.format(value, { notation: 'fixed', precision: Math.min(precision, decimals + 8) })
    }

    if (numeric === null || !Number.isFinite(numeric)) {
      return math.format(value, { notation: 'auto', precision })
    }
    if (Number.isInteger(numeric)) return String(numeric)

    const abs = Math.abs(numeric)
    // 量级过大时小数位无意义，改用科学计数法
    if (abs >= 1e15) return numeric.toExponential(decimals)
    /**
     * 极小值：**只要会被四舍五入成 0，就必须改用科学计数法**。
     *
     * 踩过：`3.3e-9` 在 8 位小数下 toFixed 得 "0.00000000"，转回数字变成 `0`
     * —— 那不是「不精确」，是**把非零值显示成零**，属于数据丢失。
     * 判据用 `10^-decimals` 而不是更保守的阈值，正好卡在「会不会归零」上。
     */
    if (abs !== 0 && abs < Math.pow(10, -decimals)) {
      return numeric.toExponential(Math.max(decimals, 3))
    }
    // toFixed 会补尾零（1.5 → "1.50000000"），转回数字去掉
    return String(Number(numeric.toFixed(decimals)))
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
