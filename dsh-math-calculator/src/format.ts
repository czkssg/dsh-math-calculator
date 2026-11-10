/**
 * 结果格式化与 JSON 安全化。
 *
 * BigNumber 的坑：`math.format(bignumber(50)!)` 默认走 auto，会输出
 * `3.0414e+64`，看起来像浮点近似，实际是精确值。必须用 `notation:'fixed'`
 * 才能把完整数字打出来。所以整数一律走 fixed。
 *
 * @module dsh-math-calculator/format
 */

import {
  PRECISION_LOSS_THRESHOLD,
  isDisplayPrecisionExplicit,
  reportPrecisionLoss,
} from './precision-report.js'

/**
 * 科学计数法该保留几位有效数字，并裁掉尾随零。
 *
 * 位数取 `displayPrecision`（用户设定的位数）与 6 的下限、12 的上限之间：
 *   · 下限 6：太少会显得不精确（`5.6704e-8` 只给 5 位）
 *   · 上限 12：太多又回到「一行几十位」的老问题
 *
 * 裁尾随零是因为 `toExponential` 会补齐位数：
 *   `5.67e-8` 在 8 位下得 `"5.67000000e-8"` —— 那八个 0 不携带信息，
 *   而且会让读者以为「精度很低，只有两位有效数字」。
 *
 * @param value - 数值
 * @param decimals - 用户设定的小数位
 * @returns 科学计数法字符串
 */
function toScientific(value: number, decimals: number): string {
  const digits = Math.min(Math.max(decimals, 6), 12)
  const raw = value.toExponential(digits)
  const [mantissa, exponent] = raw.split('e')
  const trimmed = mantissa.includes('.')
    ? mantissa.replace(/0+$/, '').replace(/\.$/, '')
    : mantissa
  return trimmed + 'e' + exponent
}

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
 * @param respectExplicitUnit - 调用方是否在表达式里**显式写了目标单位**（`.to('cm')`）
 * @returns 显示串
 */
export function formatValue(
  math: any,
  value: any,
  precision: number,
  displayPrecision?: number,
  respectExplicitUnit = false,
): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'function') return '[function]'
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value)

  const isBig = Boolean(value && value.isBigNumber)
  const integer = isIntegerLike(value)

  /**
   * ## 带单位的值：先让 mathjs 格式化，再挑一个「人会说」的单位
   *
   * 实测反馈（2026-11-06）：
   *
   * ```
   *   一个很大的重量 → 1e12 g 被输出成 `1 Tg`
   * ```
   *
   * 「太克」这种 SI 前缀现实中没人说；而中文语料里这个量级叫「100 万吨」。
   * mathjs 的 `Unit` 在**构造时**就选定了前缀，`format` 选项改不了它 ——
   * 所以在文本层做一次归位。
   *
   * 只调**质量**这一个量纲：它是唯一实测出过问题的场景，
   * 而长度/时间/功率的 SI 前缀（km / s / kW）本来就是常用写法，动它们反而添乱。
   */
  /**
   * ## 调用方写了目标单位时，**不许归位**
   *
   * 实测（本轮 1107 报告核查时发现，是本项目最难发现的一类回归）：
   *
   * ```
   *   2 m to cm    → mathjs 算出 200 cm → 工具输出 "2 m"     ← 换算被撤回了
   *   1 t to kg    → mathjs 算出 1000 kg → 工具输出 "1 t"
   *   2.5 m to mm  → mathjs 算出 2500 mm → 工具输出 "2.5 m"
   * ```
   *
   * 根因：归位逻辑不看用户的意图，只看 `unit.value`（基准单位数值），
   * 于是把**显式换算的目标**按阶梯重新挑了一遍 —— 恰好挑回用户出发的那个单位。
   * 数字看着合理（`2 m` 就是个合法的长度），所以不会有人怀疑。
   *
   * 判据很简单：归位是为了「没人指定时挑一个人会说的档」，
   * **一旦指定了，就轮不到工具替他挑**。
   */
  if (value && value.isUnit) {
    if (!respectExplicitUnit) {
      const normalized = normalizeUnitPrefix(value)
      if (normalized !== '') return normalized
    } else {
      /**
       * ## 显式换算时，小数位也必须按 displayPrecision 收
       *
       * 实测（本轮）：`5 cm to inch` 在修好归位之后吐出了整整 21 位小数 ——
       *
       * ```
       *   1.96850393700787401575 inch
       * ```
       *
       * 根因在**归位路径之外**：归位走的是 `formatScalar`（只给 6 位），
       * 掩盖了「Unit 值根本不经过 displayPrecision」这件事。
       * 一旦跳开归位，这个既有缺陷就露出来了。
       *
       * 处理方式：拆成「数字 + 单位」两段，数字那段递归回本函数
       * 的纯数字路径（那里有完整的小数位与丢精度判据），单位原样拼回。
       * 这样既不重复实现截断逻辑，也不会改变整数完整这条不变量。
       */
      /**
       * ★ 拆不开时必须**带着单位**退回，不能落进下面的纯数字分支。
       *
       * 踩过：`1 L/minute to m^3/s` 的格式化结果是 `1.6666e-5 m^3 / s`，
       * 而 `trimUnitNumber` 的正则只认「数字 + 一个单位符号」，遇复合单位返回空串。
       * 于是控制流落进末尾的通用分支，那里对 Unit 值走 `numeric === null`，
       * 输出只剩 `1.666666666666666666666666666666666666666`——**单位没了**。
       *
       * 那个数字本身是对的（1.67e-5），但少了 `m^3 / s` 之后，读者会把它当成
       * 「1.67」，而真实值是 0.0000167，差 10 万倍。
       *
       * 所以这里拆不开就直接用 mathjs 的原格式（单位一定在里面）。
       */
      try {
        /**
         * ## 复合单位必须**自己拼单位**：mathjs 的 toString 会丢它
         *
         * 实测 `1 L/minute to m^3/s`（一个 `to` 到复合单位的值）：
         *
         * ```
         *   math.format(v, {notation:'auto', precision})  → "1.6666666666666…"  ← 没有单位
         *   String(v)                                     → "1.6666666666666…"  ← 也没有
         *   v.formatUnits()                               → "m^3 / s"           ← 单位在这里
         *   v.value                                       → 0.000016666…        ← 基准值
         * ```
         *
         * 根因：`Unit#toString` 会先 `simplify()`，而简化对 `m^3 / s` 这类
         * **多单位复合**处理不了，它就只输出数值那一半。
         * 单单位（`kW`、`cm`）不受影响，所以只有复合单位丢 ——
         * 这也解释了为什么 `1 MJ/day to kW` 一直是对的。
         *
         * 后果很严重：`1.67e-5` 少了 `m^3 / s` 之后看着像「1.67」，
         * 而真实值是 0.0000167，**差 10 万倍**，数字本身没有任何异常。
         *
         * 所以这里显式拆成「数值 + formatUnits()」两段自己拼。
         */
        const unitText = typeof value.formatUnits === 'function' ? value.formatUnits() : ''
        const numericText = math.format(value, { notation: 'auto', precision })
        /**
         * ★ 只在**确实缺单位**时才补。
         *
         * `math.format` 的行为不一致：单单位（`kW`、`cm`）本来就会带上，
         * 多单位复合（`m^3 / s`）才丢。一律追加会得到 `200 cm cm`。
         *
         * 判据用「结果里有没有出现单位的首个符号」—— 够简单，且不会误判：
         * 数值部分只有数字、指数、符号，不会包含单位名。
         */
        const unitHead = unitText.split(/[\s/]/)[0]
        const hasUnit = unitHead !== '' && numericText.includes(unitHead)
        const raw = unitText === '' || hasUnit ? numericText : numericText + ' ' + unitText
        const rendered = trimUnitNumber(math, raw, precision, displayPrecision)
        if (rendered !== '') return rendered
        return raw
      } catch {
        /* 拼不出来：交给下面的兜底 */
      }
    }
  }

  try {
    /**
     * ## 整数：**一律完整输出**，任何阈值都不截断
     *
     * 试过一版「≥1e15 改科学计数法」，被 12 条断言当场打回 ——
     * 那违反本项目最硬的一条不变量：**整数永不丢位**。
     * 写成 `1e20` 是**丢信息**，不是简洁（`10^20` 与 `10^20+5` 会长得一样）。
     *
     * 大数占行宽的问题改由**别处解决**：批量显示时补千分位分组
     * （纯视觉分组、不改值），`result` 数据通道保持完整整数。
     * 这才是「既让人看得清、又不丢一位」的解法。
     */
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
      const formatted = math.format(value, {
        notation: 'fixed',
        precision: Math.min(precision, decimals + 8),
      })
      /**
       * 去掉尾随零：`notation:'fixed'` 会补齐到位数，
       * 于是 `1.23456789e-6` 在 16 位下变成 `0.000001234567890000000000`。
       * 尾随零不携带信息，去掉后更易读。
       */
      return formatted.includes('.')
        ? formatted.replace(/0+$/, '').replace(/\.$/, '')
        : formatted
    }

    if (numeric === null || !Number.isFinite(numeric)) {
      return math.format(value, { notation: 'auto', precision })
    }
    if (Number.isInteger(numeric)) return String(numeric)

    const abs = Math.abs(numeric)
    // 量级过大时小数位无意义，改用科学计数法
    if (abs >= 1e15) return toScientific(numeric, decimals)
    /**
     * 极小值：**只要会被四舍五入成 0，就必须改用科学计数法**。
     *
     * 踩过：`3.3e-9` 在 8 位小数下 toFixed 得 "0.00000000"，转回数字变成 `0`
     * —— 那不是「不精确」，是**把非零值显示成零**，属于数据丢失。
     */
    if (abs !== 0 && abs < Math.pow(10, -decimals)) {
      const rel = 1
      reportPrecisionLoss(rel)
      return toScientific(numeric, decimals)
    }
    // toFixed 会补尾零（1.5 → "1.50000000"），用**文本**去掉，不要转 Number 再转回
    const fixed = numeric.toFixed(decimals)
    const trimmed = fixed.includes('.')
      ? fixed.replace(/0+$/, '').replace(/\.$/, '')
      : fixed
    /**
     * 为什么要保留 fixed 文本、不用 `String(Number(fixed))`：
     *
     * `Number("0.00000081")` 再 `String()` 会得到 `"8.1e-7"` ——
     * 数值没错，但**看起来只有两位有效数字**，读者会以为精度很低。
     * 保留定点文本既忠实于位数设定，也不会让人误判精度。
     */
    const normalizedText = trimmed === '-0' ? '0' : trimmed
    const shown = Number(normalizedText)
    const rel = abs > 0 && Number.isFinite(shown) ? Math.abs(shown - numeric) / abs : 0

    /**
     * ── 定点截断丢精度时，自动改用科学计数法 ──
     *
     * 这是本文件最重要的一条判据，实测代价很具体：
     *
     *   斯特藩-玻尔兹曼常数 σ = 5.670374419e-8
     *     8 位小数定点 → 0.00000006   相对误差 5.8%
     *     科学计数法   → 5.6703744e-8  相对误差 1e-9
     *
     * 前者让 σ 变成 6.0e-8，散热链整条偏移 6%，而且**数字看起来很正常**——
     * 一份报告里 `0.00000006` 不会引起任何人怀疑。
     *
     * 判据用**相对误差**而不是「会不会归零」：`3.3e-9` 归零是明显的事，
     * 而 `5.67e-8` 不归零却已经错了 5.8%，后者更隐蔽。
     *
     * 注意这不违背「displayPrecision 表示小数点后几位」的设定 ——
     * 绝大多数数仍按小数位显示（`1/7` → 0.14285714 误差 1e-9，走定点），
     * 只有定点表达会**丢数据**的极小值才换格式。用户要的是「8 位小数」，
     * 不是「一个读错 5.8% 的数」。
     */
    if (rel > PRECISION_LOSS_THRESHOLD) {
      reportPrecisionLoss(rel)
      /**
       * 只在**未显式指定**精度时才擅自改格式。
       *
       * 为什么区分：调用方写 `displayPrecision:4` 是明确要求 4 位小数，
       * `1/7` → `0.1429` 正是他要的（相对误差 0.03%，可接受）。
       * 若替他改成 `1.4286e-1`，那是**违背明确指令**。
       *
       * 代价改由工具层提示告知（「你选的位数丢了 X% 精度」），而不是悄悄改掉。
       */
      if (!isDisplayPrecisionExplicit()) {
        return toScientific(numeric, decimals)
      }
    }
    return normalizedText
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

/**
 * 判断一个 mathjs 原始返回值里是否含非有限数（Infinity / -Infinity / NaN）。
 *
 * ## 为什么不能用序列化后的文本判断
 *
 * 既有实现 `containsNonFinite` 只认**恰好等于** `"Infinity"` 的字符串。
 * 而带单位的结果序列化成 `"Infinity g"` —— 于是：
 *
 * ```
 *   (1/0)*2 kg   →  ok=true，result "Infinity g"      ← 漏检
 *   2 kg         →  ok=true，result "2 kg"            ← 正常
 * ```
 *
 * 同一件事在裸数字上拦得住、在带单位值上拦不住，是**判据挑错了层**：
 * 文本层只能看见「长得像」，值层才知道「是不是」。
 *
 * ## Unit 的非有限数藏在 `value` 里
 *
 * ```
 *   (1/0)*2 kg  →  Unit { value: BigNumber(Infinity), units: [g] }
 *   (2/0) kg to g →  Unit { value: BigNumber(Infinity) }
 * ```
 *
 * 而正则读文本时那个 `g` 会把判定带偏。所以逐层下钻到真正的数字。
 *
 * @param value - mathjs 的原始返回值（不是 toJsonValue 之后的）
 * @returns 含非有限数时为 true
 */
export function isNonFiniteValue(value: any, depth = 0): boolean {
  if (value === null || value === undefined || depth > 8) return false
  if (typeof value === 'number') return !Number.isFinite(value)
  if (typeof value === 'bigint') return false
  if (typeof value !== 'object') return false
  if (value.isBigNumber) {
    /**
     * BigNumber 自己带 `isFinite()`，用它最准。
     *
     * 退回 `Number(value)` 会踩坑：`1e400` 是**合法的有限大数**，
     * 但转成双精度就成了 Infinity —— 那会把「大」误判成「错」。
     */
    try {
      if (typeof value.isFinite === 'function') return !value.isFinite()
      const text = String(value)
      return text === 'Infinity' || text === '-Infinity' || text === 'NaN'
    } catch {
      return false
    }
  }
  if (value.isUnit) return isNonFiniteValue(value.value, depth + 1)
  /** 复数：实部虚部都要有限。`sqrt(-1)` 是 `0 + 1i`，两者都有限，放行。 */
  if (value.isComplex) {
    return isNonFiniteValue(value.re, depth + 1) || isNonFiniteValue(value.im, depth + 1)
  }
  if (Array.isArray(value)) return value.some((item) => isNonFiniteValue(item, depth + 1))
  /** Matrix 走 toArray，别递归到它的内部字段。 */
  if (value.isMatrix && typeof value.toArray === 'function') {
    try {
      return isNonFiniteValue(value.toArray(), depth + 1)
    } catch {
      return false
    }
  }
  if (value.isResultSet && Array.isArray(value.entries)) {
    return value.entries.some((item: any) => isNonFiniteValue(item, depth + 1))
  }
  if (value.isFraction) return false
  return false
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
 * 每个量纲的「人会说」单位阶梯。
 *
 * ## 为什么需要这张表
 *
 * mathjs 会按数量级自动选 SI 前缀，但它**只按数量级走**，
 * 不管现实中人说哪个词。于是：
 *
 * ```
 *   一个很大的重量 → 1 Tg（太克）      ← 没人这么说
 *   1e6 m         → 1 Mm（兆米）      ← 没人这么说
 *   1e6 L         → 1 ML              ← 没人这么说
 * ```
 *
 * 实测反馈原话：「之前出现过一个很大的重量，居然最后用的单位是 g，
 * 而不是用公斤或吨这种更加常用的单位。」
 *
 * ## 阶梯怎么定
 *
 * 每一档是 `[阈值, 换算系数, 单位名]`，从大到小排；
 * 取第一个「真实值 ≥ 阈值」的档。阈值与系数都以**基准单位**为准。
 *
 * 原则：**只收现实中会出现在正文里的单位**。
 * 兆米、太克、兆升这些「数学上合法、语用上没人用」的档位一律不进表 ——
 * 超出最大常用档就用科学计数法配常用单位（如 `1e6 t`）。
 */
const PREFERRED_UNIT_LADDER: Record<string, Array<[number, number, string]>> = {
  /**
   * 质量以千克为基准（mathjs 的 Unit.value 就是千克数）。
   *
   * 只列到 `t` 为止：再往上走 `kt / Mt / Gt / Tt…`，
   * 由下面的「前缀叠加」在 `t` 上加一层（`t` 不带前缀，不会拼出无效组合）。
   */
  mass: [
    [1e3, 1e-3, 't'],
    [1, 1, 'kg'],
    [1e-3, 1e3, 'g'],
    [0, 1e6, 'mg'],
  ],
  /**
   * 长度以米为基准。km 档从 1e3 起（不是 1e6），否则 1e6 m 会落到 m 档。
   *
   * 高量级直接在这里列全（Gm / Tm / Pm…），而不是靠「前缀叠加」——
   * 因为长度阶梯里已经有 `km`（自带前缀），再叠一层会拼出 `kkm` 这种无效组合。
   * 与其在叠加逻辑里特判「当前符号带不带前缀」，不如把档位摊平在数据里。
   */
  length: [
    [1e18, 1e-18, 'Em'],
    [1e15, 1e-15, 'Pm'],
    [1e12, 1e-12, 'Tm'],
    [1e9, 1e-9, 'Gm'],
    [1e6, 1e-6, 'Mm'],
    [1e3, 1e-3, 'km'],
    [1, 1, 'm'],
    [1e-2, 1e2, 'cm'],
    [1e-3, 1e3, 'mm'],
    [0, 1e6, 'µm'],
  ],
  /** 时间以秒为基准。 */
  time: [
    [86400 * 365.25, 1 / (86400 * 365.25), 'year'],
    [86400, 1 / 86400, 'day'],
    [3600, 1 / 3600, 'h'],
    [60, 1 / 60, 'min'],
    [0, 1, 's'],
  ],
  /**
   * ## 体积刻意不做归位
   *
   * 试过一版（L↔m³ 互换），结果是 `1000 L` 变 `1 m^3` 而 `1 m^3` 变 `1000 L` ——
   * **两者在互相吞吐**，因为 `m^3` 那一档把 `L` 家族整个吃掉了。
   *
   * 体积的「常用写法」本身就不统一：水用 L、土方用 m³、气体用 mL 到都合理。
   * 强行归位只会改变调用方给的语义，收益为零。所以**从阶梯里去掉**，
   * 保持 mathjs 原有选择（它唯一的问题只是 `ML` 这种冷门前缀，而那很少见）。
   */
  /** 功率以瓦为基准。 */
  power: [
    [1e18, 1e-18, 'EW'],
    [1e15, 1e-15, 'PW'],
    [1e12, 1e-12, 'TW'],
    [1e9, 1e-9, 'GW'],
    [1e6, 1e-6, 'MW'],
    [1e3, 1e-3, 'kW'],
    [0, 1, 'W'],
  ],
  /** 能量以焦耳为基准。 */
  energy: [
    [1e18, 1e-18, 'EJ'],
    [1e15, 1e-15, 'PJ'],
    [1e12, 1e-12, 'TJ'],
    [1e9, 1e-9, 'GJ'],
    [1e6, 1e-6, 'MJ'],
    [1e3, 1e-3, 'kJ'],
    [0, 1, 'J'],
  ],
  /** 压强以帕为基准。 */
  pressure: [
    [1e6, 1e-6, 'MPa'],
    [1e3, 1e-3, 'kPa'],
    [0, 1, 'Pa'],
  ],
}

/** mathjs 的基准单位名 → 量纲键。未列出的量纲不归位（保持 mathjs 的选择）。 */
const BASE_TO_DIMENSION: Record<string, string> = {
  g: 'mass',
  t: 'mass',
  kg: 'mass',
  m: 'length',
  s: 'time',
  W: 'power',
  J: 'energy',
  Pa: 'pressure',
}

/**
 * 把「不常用前缀的单位」归到人会说的大小。
 *
 * ## 判据
 *
 * 三件事同时满足才动手：
 *   1. 单个单位的 1 次幂（复合单位如 kg/m³、m/s 不动）
 *   2. 基准单位在 `BASE_TO_DIMENSION` 里（未登记的量纲保持原样）
 *   3. 该量纲有阶梯表
 *
 * ## 关键陷阱：`unit.value` 已经是基准单位的数值
 *
 * ```
 *   1 t      → value = 1000   （基准是 kg，所以这是 1000 kg）
 *   2 kg     → value = 2
 *   1e12 g   → value = 1e9
 *   1e6 m    → value = 1e6
 * ```
 *
 * 踩过两次：第一次乘了 `prefix.value`、第二次乘了 `baseFactor` ——
 * 两次都是「凭直觉推断内部表示」而不实测反推。教训：第三方库的内部语义
 * 必须用数据验证。
 *
 * @param unit - mathjs 的 Unit 对象
 * @returns 归一后的文本；不需要处理时返回空串（由调用方走原路径）
 */
function normalizeUnitPrefix(unit: any): string {
  try {
    const parts = Array.isArray(unit.units) ? unit.units : []
    if (parts.length !== 1 || (parts[0].power ?? 1) !== 1) return ''
    const baseName: string = parts[0].unit?.name ?? ''
    const dimension = BASE_TO_DIMENSION[baseName]
    if (!dimension) return ''
    const ladder = PREFERRED_UNIT_LADDER[dimension]
    if (!ladder) return ''

    const baseValue = Number(unit.value)
    if (!Number.isFinite(baseValue) || baseValue === 0) return ''

    const abs = Math.abs(baseValue)
    const tier = ladder.find(function (row) { return abs >= row[0] })
    if (!tier) return ''
    const [threshold, factor, symbol] = tier
    let value = baseValue * factor

    /**
     * ## 阶梯之上再叠 SI 前缀：k / M / G / T / P / E / Z / Y / R / Q
     *
     * 用户明确要求：「K,M,G,T,P,E,Z,Y,R,Q，不是禁止，可以斟酌使用。」
     *
     * 上一版把前缀**全部禁用**、超档一律丢给科学计数法（`1e6 t`），那是矫枉过正：
     * `Mt`（百万吨）、`Gt`（十亿吨）、`kt`（千吨）这些是**正经写法**，
     * 工程与气候文献里常见；`1e12 t` 反而不如 `1 Tt` 好读。
     *
     * 所以规则改成两层：
     *   · **先按阶梯选常用单位**（保证不会出现 `Tg`、`Mm` 这种冷门组合）
     *   · **数值仍超出该档范围时，在常用单位上叠前缀**（`t` → `kt` / `Mt` / `Gt`）
     *
     * 阈值：|值| ≥ 1000 才升档（`2000 t` → `2 kt`），
     * 这样 `1000 t` 仍是 `1000 t`（不升级）而 `10000 t` 变 `10 kt`。
     * 再往上每 1000 倍升一级，到 Q（10³⁰）为止。
     */
    if (Math.abs(value) >= 1e4 && STEP_PREFIXABLE.has(symbol)) {
      /**
       * `steps` = 该值要**除以 10³ 几次**才能落到 1—999 的区间。
       *
       * ```
       *   value = 2e3   → log10 = 3.3  → floor(3.3/3) = 1 → 疑似 k
       *   value = 1e4   → log10 = 4    → floor(4/3)   = 1 → k
       *   value = 1e6   → log10 = 6    → floor(6/3)   = 2 → M
       * ```
       *
       * 但要注意：**前缀数组的 0 号是 'k'**（即除以 10³ 一次），
       * 所以下标 = steps - 1，不是 steps。
       *
       * 踩过：第一版直接用 `SI_STEP_PREFIXES[steps]`，于是 `1e4 t` 输出成 `10 Mt`
       * —— 倍率差了一千倍（10 Mégatonne ≈ 1e10 t，而实际只要 1e4 t）。
       */
      const exponent = Math.floor(Math.log10(Math.abs(value)))
      const steps = Math.min(Math.floor(exponent / 3), SI_STEP_PREFIXES.length)
      if (steps >= 1) {
        /** 数组 0 号 = 'k'（10³），所以下标是 steps - 1。 */
        const prefix = SI_STEP_PREFIXES[steps - 1]
        const divisor = Math.pow(10, steps * 3)
        return formatScalar(value / divisor) + ' ' + prefix + symbol
      }
    }
    return formatScalar(value) + ' ' + symbol
  } catch {
    return ''
  }
}

/**
 * 「千进制一位」的 SI 前缀序列（不含 k，因为阶梯里的 km/kW/kJ/kPa 已经自带）。
 *
 * 下标即「往上叠了几个 10³」：
 *   [0]='k' → 10³（`2 kt`）
 *   [1]='M' → 10⁶（`2 Mt`）
 *   [2]='G' → 10⁹（`2 Gt`）
 *   …… 直到 [9]='Q' → 10³⁰
 */
const SI_STEP_PREFIXES = ['k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y', 'R', 'Q']

/**
 * 允许叠加前缀的单位符号。
 *
 * ## 为什么 `km` / `GW` / `TJ` 也算「可叠加」
 *
 * 它们本身已是阶梯选出来的常用档（`1e6 m` → `1000 km`）。
 * 再往上（`1e9 m`）如果不能再叠，就只能给 `1e6 km` —— 那正是用户不想要的。
 *
 * 所以「可叠加」跟「带不带前缀」无关，而跟**叠上去之后说不说人话**有关：
 *
 * ```
 *   1e9 m   → 1 Gm     ✓（吉米，物理/天文会说）
 *   1e6 km  → 1 Mm     ✗ 兆米（很少说），但 1 Gm 是对同量级的更好写法
 *   1e9 W   → 1 GW     ✓（已是 GW，再升就是 TW）
 *   1e12 W  → 1 TW     ✓
 * ```
 *
 * 因此集合里放的正是**阶梯可能产出的那些符号**，
 * 这样升档逻辑统一在「在当前符号前面加一层前缀」这一个动作上。
 */
const STEP_PREFIXABLE = new Set(['t', 'm', 's', 'W', 'J', 'Pa', 'g', 'kg'])

/**
 * 把「数值 + 单位」的文本拆开，数字那段按 displayPrecision 重新渲染。
 *
 * ## 为什么需要它
 *
 * formatValue 对 isUnit 有两个分支：
 *   · 归位（normalizeUnitPrefix）→ 走 formatScalar，**只给 6 位**
 *   · 不归位（显式换算）→ 原来直接 math.format，**吐 64 位**
 *
 * 后者是长久存在的缺陷，只是被前者掩盖了：2 m to cm 曾经被改写成 2 m
 * 走归位路径，于是没人发现 5 cm to inch 会给出 21 位小数。
 *
 * 修好归位之后它立刻暴露，所以在这里补上：数字递归回本函数
 * 的纯数字分支（小数位、科学计数法、丢精度判据全都在那儿），单位原样拼回。
 *
 * ## 拆不开就返回空串
 *
 * 复合单位（kg / s^2）、带括号的、含 Infinity 的，一律交给调用方回退到
 * 原格式 —— 那些位置重排数字有风险，而收益为负（本来就不长）。
 *
 * @param math - mathjs 实例
 * @param text - mathjs 已经格式化好的「数字 单位」
 * @param precision - 计算精度
 * @param displayPrecision - 小数位；undefined 表示按完整精度
 * @returns 重新渲染的文本；拆不开时返回空串
 */
function trimUnitNumber(
  math: any,
  text: string,
  precision: number,
  displayPrecision: number | undefined,
): string {
  if (displayPrecision === undefined || !Number.isFinite(displayPrecision)) return ''
  /** 只认「数字 + 一个单位符号」：数字可带符号、小数点、指数。 */
  const match = text.match(/^(-?[0-9][0-9.]*(?:[eE][+-]?[0-9]+)?)\s+([A-Za-z\u00b5]+)$/)
  if (!match) return ''
  const digits = match[1]
  const unitPart = match[2]
  /** 太短的数没必要重排（2 m 就两个字符）。 */
  if (digits.length < 6) return ''
  const numericText = formatValue(math, math.bignumber(digits), precision, displayPrecision)
  if (numericText === '' || numericText === 'undefined') return ''
  return numericText + ' ' + unitPart
}
/**
 * 数值 → 可读文本：大数用科学计数法，其余保留有限位。
 *
 * @param value - 数值
 * @returns 文本
 */
/**
 * ## 数字显示的统一入口（参数化）
 *
 * 本项目里曾有 7 个文件各自实现「数字 → 人读字符串」，阈值与位数各不相同：
 *
 * ```
 *   anchor-solve / summary   fmt    ≥1e6 或 <1e-2 → exp(2)，否则 prec(3)
 *   pipeline                 fmtNum ≥1e5 或 <1e-2 → exp(2)，否则 prec(4)
 *   custom-op / derivation   sci    ≥1e5 或 <1e-3 → exp(3)，否则 prec(5)
 *   units-op / units         show   ≥1e15 或 <1e-4 → exp(4)，否则 prec(6)
 *   param-units              fmt    ≥1e6 或 <1e-3 → exp(3)，否则 prec(4)
 * ```
 *
 * 抽到这里统一定义。**为什么不用 d3-format**：
 *
 * - 本项目非有限值显示 `—`，d3 显示 `NaN`；
 * - 指数阈值是**硬阈值**（1e6/1e-2），d3 的 `~g` 是「有效位数」语义，行为不同；
 * - 51 处测试锁定这些输出，换库会连锁破坏行为契约。
 *
 * 于是保留自己的格式，但消除 7 份重复 —— 这正是「参考成熟库」的正确用法：
 * 学它的接口设计（单一职责、可参数化），不学它的实现。
 */
export interface FmtOptions {
  /** 绝对值 ≥ 此值时用科学计数法。 */
  expHigh: number
  /** 0 < 绝对值 < 此值时用科学计数法。 */
  expLow: number
  /** 科学计数法的小数位数。 */
  expDigits: number
  /** 普通区间的有效位数。 */
  precision: number
  /** 非有限值的显示（默认 `—`）。 */
  nanDisplay?: string
}

/**
 * 按传入的阈值格式化数字 —— 本项目所有「数字 → 人读串」的唯一通道。
 *
 * @param value - 数值
 * @param opt - 阈值与位数配置
 * @returns 显示串
 */
export function fmtNumber(value: number, opt: FmtOptions): string {
  if (!Number.isFinite(value)) return opt.nanDisplay ?? '—'
  const abs = Math.abs(value)
  /** 0 无论走哪条路径都输出 '0'（toPrecision 后 Number() 会去掉尾零）。 */
  if (abs >= opt.expHigh || (abs > 0 && abs < opt.expLow)) return value.toExponential(opt.expDigits)
  return Number(value.toPrecision(opt.precision)).toString()
}

/** 原 anchor-solve / summary 的口径。 */
export function fmtShort(value: number, digits = 3): string {
  return fmtNumber(value, { expHigh: 1e6, expLow: 1e-2, expDigits: 2, precision: digits })
}

/** 原 custom-op / derivation-op 的口径。 */
export function fmtSci(value: number): string {
  return fmtNumber(value, { expHigh: 1e5, expLow: 1e-3, expDigits: 3, precision: 5 })
}

/** 原 units-op / units 的口径。 */
export function fmtShow(value: number): string {
  return fmtNumber(value, { expHigh: 1e15, expLow: 1e-4, expDigits: 4, precision: 6 })
}

function formatScalar(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e6 || abs < 1e-4) {
    /** 科学计数法：尾数最多 6 位有效数字，够读且不啰嗦。 */
    const [mantissa, exponent] = value.toExponential(6).split('e')
    const trimmed = mantissa.includes('.') ? mantissa.replace(/0+$/, '').replace(/\.$/, '') : mantissa
    return trimmed + 'e' + exponent.replace('+', '')
  }
  return String(Number(value.toPrecision(10)))
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
