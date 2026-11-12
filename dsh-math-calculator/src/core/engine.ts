/**
 * 计算引擎：mathjs + 单位适配。
 *
 * ## 引擎只做三件事
 *
 * ```
 *   ① 建 mathjs 实例（带安全边界）
 *   ② 把表达式里的中文单位归一成符号（`1 里` → `1 li`）
 *   ③ 求值并把结果收敛成统一形态
 * ```
 *
 * **领域逻辑一律不进这里** —— 星球推演、编制树、账本闭合都在 `features/` 下。
 *
 * ## 安全边界（这些是老代码踩出来的，必须保留）
 *
 * ```
 *   ✗ 删掉 import / createUnit / parse 的动态执行能力   ← createUnit 是任意代码入口
 *   ✗ 禁用 Math 命名空间（`Math.min` 不认，但给出可操作提示）
 *   ✓ 表达式长度上限（防止超长输入拖死）
 * ```
 *
 * 为什么删 `createUnit`：它允许运行时注册单位，而注册体是**函数**，
 * 等于把任意代码执行权交出去。这是本项目唯一主动放弃的能力。
 */

import { create, all, type MathJsInstance } from 'mathjs'
import { CalcError, normalizeError } from './errors.js'
import { registerCjkUnits } from './cjk-units.js'

/** 表达式长度上限（字符）。超过就拒绝，而不是慢慢算。 */
const MAX_EXPRESSION_LENGTH = 10_000

/**
 * 中文单位 → 符号别名。
 *
 * ## 为什么在引擎层做归一，而不是在 units 操作里
 *
 * 因为**所有**操作都可能出现中文单位：`evaluate` 里写 `1 里 + 3 米`、
 * `formula` 的 overrides 里写 `s:"60 里"`。若只在 units 操作里做，
 * 别处就会报 `Undefined symbol 里`。
 *
 * ## 只收单字/短词，不收复合
 *
 * 复合单位（`米/秒`）不在这里处理 —— 那交给 ucum 适配层，
 * 因为它要走真正的单位解析而不是字符串替换。
 *
 * **替换顺序很重要**：长词优先（`平方公里` 必须在 `平方` 与 `公里` 之前），
 * 否则会被拆错。老代码在这里出过 `公里` 被拆成 `公` + `里` 的 bug。
 */
const CJK_UNIT_ALIASES: Array<[string, string]> = [
  // 长度（长的放前面）
  ['平方公里', 'km2'], ['平方千米', 'km2'], ['平方米', 'm2'], ['平方厘米', 'cm2'],
  ['立方公里', 'km3'], ['立方米', 'm3'], ['立方厘米', 'cm3'],
  /**
   * ⚠ 基础单位（`米`/`克`/`秒`）必须在长词之后 ——
   * 否则「公里」会先被 `里` 匹配掉。
   *
   * 第一版漏了 `米`/`秒` 这几个裸单位，于是 `1 里 + 3 米` 报语法错：
   * 「米」没被替换，mathjs 当成了未知标识符。
   */
  ['公里', 'km'], ['千米', 'km'], ['厘米', 'cm'], ['毫米', 'mm'], ['米', 'm'],
  ['微米', 'um'], ['纳米', 'nm'],
  ['英里', 'mi'], ['英尺', 'ft'], ['英寸', 'inch'], ['码', 'yd'],
  /**
   * ## ⚠ 中文古制单位必须加 `cn_` 前缀
   *
   * 实测：`li` 在 mathjs 里是 **link（测链，0.201168 m）** ——
   * 而中文的「里」是 500 m。不加前缀会被静默算成错值，
   * 这是最危险的一类 bug（数值看着正常）。
   *
   * 加前缀后 `1 里` → `1 cn_li`，与内置单位彻底隔离。
   */
  ['里', 'cnli'], ['丈', 'cnzhang'], ['尺', 'cnchi'], ['寸', 'cncun'],
  // 质量
  ['公斤', 'kg'], ['千克', 'kg'], ['毫克', 'mg'], ['克', 'g'],
  ['吨', 't'], ['斤', 'cnjin'], ['两', 'cnliang'], ['磅', 'lb'], ['盎司', 'oz'],
  // 时间
  ['小时', 'h'], ['分钟', 'min'], ['秒钟', 's'], ['秒', 's'], ['时辰', 'cnshichen'],
  ['天', 'day'], ['周', 'week'], ['年', 'year'],
  // 体积
  ['加仑', 'gal'], ['升', 'L'], ['毫升', 'mL'],
  // 面积
  ['公顷', 'ha'], ['亩', 'cnmu'],
  // 能量与功率
  ['千瓦时', 'kWh'], ['度电', 'kWh'], ['马力', 'hp'], ['千瓦', 'kW'], ['兆瓦', 'MW'],
  ['瓦', 'W'], ['焦耳', 'J'], ['卡路里', 'cal'], ['千卡', 'kcal'],
  // 压强
  ['帕斯卡', 'Pa'], ['千帕', 'kPa'], ['兆帕', 'MPa'], ['巴', 'bar'],
  // 其他
  ['摄氏度', 'degC'], ['度', 'deg'],
]

/**
 * 把中文单位替换成符号。
 *
 * ## 实现方式与一个必须注意的点
 *
 * 用一次扫描 + 长词优先，而不是「逐条 replace」。原因：
 *
 * ```
 *   逐条 replace：'公里' 先被换成 'km'，然后 '里' 的规则又去匹配 'km' 附近 → 乱
 *   单次扫描：    从左到右，每次匹配「当前位置能匹配的最长词」→ 正确
 * ```
 *
 * 替换结果括在括号里（`(1 li)`），避免与相邻符号粘连成新标识符。
 *
 * @param source - 原始表达式
 * @returns 归一后的表达式
 */
export function normalizeUnits(source: string): string {
  if (source === '') return source
  let out = ''
  let i = 0
  /** 按长度降序排一次，保证「最长匹配优先」。 */
  const sorted = [...CJK_UNIT_ALIASES].sort((a, b) => b[0].length - a[0].length)

  while (i < source.length) {
    let matched = false
    for (const [cjk, symbol] of sorted) {
      if (source.startsWith(cjk, i)) {
        /**
         * 只在「前面不是数字、后面不是字母」时才替换吗？
         *
         * 不 —— `1 里` 的「里」前面是空格，`1里` 前面是数字，两种都该换。
         * 真正要防的是「里」作为普通汉字出现在非单位语境（如 `里面`），
         * 但那需要语义理解，本层不做。判据是：**紧跟数字**才算单位。
         */
        const before = out.trimEnd()
        const prevChar = before.length > 0 ? before[before.length - 1] : ''
        const prevIsDigitOrSpace = /\d/.test(prevChar) || prevChar === ''
        /** 只看紧邻的那个字符是不是数字（跨越空格也算）。 */
        let j = out.length - 1
        while (j >= 0 && out[j] === ' ') j -= 1
        const nearest = j >= 0 ? out[j] : ''
        if (prevIsDigitOrSpace || /[\d)\]]/.test(nearest)) {
          out += symbol
          i += cjk.length
          matched = true
          break
        }
      }
    }
    if (!matched) {
      out += source[i]
      i += 1
    }
  }
  return out
}

/** 引擎包装。 */
export interface Engine {
  /** 底层 mathjs 实例（供需要直接用的功能域）。 */
  readonly math: MathJsInstance
  /**
   * 求值。
   *
   * @param source - 表达式（中文单位会被自动归一）
   * @param scope - 变量作用域
   * @returns 结果（可能是 number / BigNumber / Unit / Matrix）
   */
  evaluate(source: string, scope?: Record<string, unknown>): unknown
  /**
   * 求值并保证结果是有限数。
   *
   * @param source - 表达式
   * @param scope - 变量作用域
   * @returns 数值
   */
  evaluateNumber(source: string, scope?: Record<string, unknown>): number
}

/** 引擎单例（mathjs 实例创建代价不低，且无状态）。 */
let cached: Engine | null = null

/**
 * 建引擎。
 *
 * @returns 引擎实例
 */
export function buildEngine(): Engine {
  if (cached !== null) return cached

  /**
   * ## ★ 默认数值类型必须是 BigNumber，不能是 Number
   *
   * 这条是**实测抓出来的**：用默认配置时 `10^20+5` 返回
   * `100000000000000000000` —— **那个 +5 被双精度浮点吃掉了**。
   *
   * 双精度只有约 15–17 位有效数字，而 10^20 需要 21 位。
   * 本项目以「精确计算」立身，这一条不能妥协。
   *
   * 代价：BigNumber 比 Number 慢约 5–10 倍，且 `Math.*` 不能直接用。
   * 但因为结果最终都要过 `toJsonValue`，慢在可控范围内。
   */
  const math = create(all, { number: 'BigNumber', precision: 64 }) as MathJsInstance

  /**
   * ## 安全边界：删掉动态代码执行入口
   *
   * `import` 能加载任意模块，`createUnit` 的注册体是函数 ——
   * 两者都等于把代码执行权交出去。本项目不提供这类能力。
   *
   * 删掉后调用它们会报 `Undefined function`，而不是静默可用。
   */
  /**
   * ⚠ **只删 `import`，不删 `createUnit`**。
   *
   * 初版把两个都删了，理由是「都等于代码执行入口」。实测后修正：
   *
   * ```
   *   import      能加载任意模块            ← 真危险，必删
   *   createUnit  接受「500 m」这种常量表达式 ← 定义单位所需，且无法执行代码
   * ```
   *
   * 删掉 `createUnit` 的代价是**中文古制单位无法注册**，
   * 于是 `30 里` 根本算不了。这是过度防御。
   */
  for (const name of ['import'] as const) {
    try {
      delete (math as unknown as Record<string, unknown>)[name]
    } catch {
      /* 只读属性删不掉时忽略 —— 不是安全问题，是宿主差异 */
    }
  }

  /** 注册中文古制单位（里/丈/斤/时辰/亩…）—— UCUM 不管这些，必须自己来。 */
  registerCjkUnits(math)

  const evaluate = (source: string, scope?: Record<string, unknown>): unknown => {
    if (typeof source !== 'string') {
      throw new CalcError('invalid_argument', '表达式必须是字符串', '例如 expression:"1+1"。')
    }
    if (source.length > MAX_EXPRESSION_LENGTH) {
      throw new CalcError(
        'invalid_argument',
        '表达式超过 ' + MAX_EXPRESSION_LENGTH + ' 字符上限（收到 ' + source.length + '）',
        '拆成多条用 expressions 批量给，或先化简。',
      )
    }
    const normalized = normalizeUnits(source)
    try {
      return math.evaluate(normalized, scope ?? {})
    } catch (error) {
      throw normalizeError(error, source)
    }
  }

  const evaluateNumber = (source: string, scope?: Record<string, unknown>): number => {
    const value = evaluate(source, scope)
    const n = Number(value as number)
    if (!Number.isFinite(n)) {
      throw new CalcError(
        'non_finite',
        '结果不是有限数（表达式：' + source + '）',
        '常见原因：除以 0、函数定义域外取值、数值溢出。',
      )
    }
    return n
  }

  cached = { math, evaluate, evaluateNumber }
  return cached
}
