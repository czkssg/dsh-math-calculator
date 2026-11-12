/**
 * 自设单位扩充口。
 *
 * ## 用户需求
 *
 * > 给单位体系一个自设扩充口。
 *
 * 场景：写架空世界时会有**自己发明的单位**：
 *
 * ```
 *   「1 维尔 = 1.2 km」（本世界的长度单位）
 *   「1 石炭 = 8500 BTU」（本世界的能量单位）
 *   「1 工分 = 4 小时劳动」（本世界的工时单位）
 * ```
 *
 * 这些不在任何标准里（UCUM 也没有），但推演时要用。
 *
 * ## ★ 设计原则来自 UCUM 社区的扩展讨论
 *
 * 参考 [Extending UCUM?](https://www.healthintersections.com.au/2025/01/14/extending-ucum.html)
 * 的四条原则（详见 `docs/自设单位扩充口选型.md`）：
 *
 * ```
 *   ① 命名空间隔离        自设单位加前缀，不污染标准单位
 *   ② 不得用于定义真实单位  与已有单位同名/同值时拒绝或警告
 *   ③ 能参与标准单位运算    注册进 mathjs 后天然满足
 *   ④ 可识别「这是非标准」  查询与输出都带标记
 * ```
 *
 * ## 命名：为什么用 `u_` 前缀而不是 `@`
 *
 * UCUM 讨论里建议用 `@`，但 **mathjs 的 `createUnit` 只允许字母数字**
 * （实测：`cn_li` 报 `Invalid unit name`，下划线都不行）。
 *
 * 所以改用 `u` 前缀 + 驼峰：`uWeiEr`。注册名与显示名分开 ——
 * 显示时还原成 `@维尔`，让人一眼看出这是自设的。
 *
 * @module dsh-math-calculator/core/units-custom
 */

import type { MathJsInstance } from 'mathjs'
import { CalcError } from './errors.js'

/** 一个自设单位。 */
export interface CustomUnit {
  /** 注册名（字母数字，已加 `u` 前缀）。 */
  name: string
  /** 显示名（中文或原文，如「维尔」）。 */
  display: string
  /** 量纲。 */
  dimension: string
  /** 换算到基准单位的因子。 */
  factor: number
  /** 基准单位（`m` / `kg` / `s` …）。 */
  baseUnit: string
  /** 说明。 */
  note: string
  /** 创建时间（ISO）。 */
  createdAt?: string
}

/** 量纲 → mathjs 基准单位。 */
export const DIMENSION_BASE: Record<string, string> = {
  length: 'm',
  mass: 'kg',
  time: 's',
  volume: 'm3',
  area: 'm2',
  temperature: 'K',
  energy: 'J',
  power: 'W',
  pressure: 'Pa',
  force: 'N',
  speed: 'm/s',
  angle: 'rad',
  frequency: 'Hz',
  data: 'B',
  flow: 'm3/s',
  count: '', // 计数单位不注册（无物理量纲）
}

/**
 * 注册名清洗。
 *
 * ## 为什么必须清洗
 *
 * `createUnit` 只接受**字母数字**：
 *
 * ```
 *   cn_li       ✗ Invalid unit name (only alphanumeric characters are allowed)
 *   u维尔        ✗ 同上（中文也不行）
 *   uWeiEr      ✓
 * ```
 *
 * 所以把用户给的显示名转成纯字母数字的注册名：
 * ```
 *   维尔     → uWeiEr     （中文无法转拼音，用哈希兜底）
 *   weiEr    → uWeiEr
 *   船速      → uChuanSu
 * ```
 *
 * 中文无法自动转拼音（那需要额外依赖），所以中文名用**稳定哈希**兜底，
 * 保证同一个中文名每次得到同一个注册名。
 *
 * @param display - 用户给的显示名
 * @returns 注册名
 */
export function toRegistryName(display: string): string {
  const bare = display.replace(/[^A-Za-z0-9]/g, '')
  if (bare.length > 0 && /[A-Za-z]/.test(bare)) {
    return 'u' + bare.charAt(0).toUpperCase() + bare.slice(1)
  }
  /**
   * 中文/符号名：用 FNV-1a 哈希兜底。
   *
   * 哈希而非序号：保证「同一个中文名在任何会话得到同一个注册名」，
   * 否则工作区重载后 `1 维尔` 就找不到之前注册的那个了。
   */
  let hash = 0x811c9dc5
  for (let i = 0; i < display.length; i += 1) {
    hash ^= display.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return 'uX' + hash.toString(36)
}

/** 校验结果。 */
export interface ValidateResult {
  /** 能否注册。 */
  ok: boolean
  /** 注册名（清洗后）。 */
  name: string
  /** 问题清单（`ok:false` 时非空）。 */
  problems: string[]
  /** 警告（不阻止注册，但要让调用方知道）。 */
  warnings: string[]
}

/**
 * 校验一个自设单位能否注册。
 *
 * ## 三条拒绝条件（都是硬约束）
 *
 * ```
 *   ① 量纲不认识 → 无法确定基准单位
 *   ② 因子非正数或非有限 → 换算会得到荒谬值
 *   ③ 名字与标准单位冲突 → 会让 1 m 不再是 1 m
 * ```
 *
 * ## 两条警告（不阻止，但要说出来）
 *
 * ```
 *   ① 同量纲同因子已有单位 → 可能是重复发明
 *   ② 显示名含括号/空格 → 归一可能出错
 * ```
 *
 * @param unit - 待校验的单位（部分字段可缺）
 * @param existingNames - 已有的标准单位名（小写）
 * @param existingSameFactor - 「量纲:因子」相同的已有单位名
 * @returns 校验结果
 */
export function validateCustomUnit(
  unit: Partial<CustomUnit>,
  existingNames: Set<string>,
  existingSameFactor: Map<string, string>,
): ValidateResult {
  const problems: string[] = []
  const warnings: string[] = []

  const display = typeof unit.display === 'string' ? unit.display.trim() : ''
  if (display === '') problems.push('缺 display（这个单位叫什么）')

  const name = toRegistryName(display)

  /** ① 量纲。 */
  const dimension = typeof unit.dimension === 'string' ? unit.dimension : ''
  if (dimension === '') {
    problems.push('缺 dimension（量纲，如 length/mass/energy）')
  } else if (DIMENSION_BASE[dimension] === undefined) {
    problems.push(
      '认不出量纲「' + dimension + '」。可用：' +
        Object.keys(DIMENSION_BASE).filter((d) => DIMENSION_BASE[d] !== '').join(' / '),
    )
  }

  /** ② 因子。 */
  const factor = Number(unit.factor)
  if (!Number.isFinite(factor)) {
    problems.push('缺 factor（换算到基准单位的倍数，如 1 维尔 = 1.2 km 则 factor=1200）')
  } else if (factor <= 0) {
    problems.push('factor 必须大于 0（收到 ' + factor + '）')
  }

  /** ③ 名字冲突。 */
  if (existingNames.has(name.toLowerCase())) {
    problems.push(
      '注册名「' + name + '」与已有单位冲突。' +
        '自设单位不能覆盖标准单位 —— 那会让 `1 m` 不再是 1 m。换个名字。',
    )
  }
  /**
   * ## ⚠ 显示名本身也要查冲突
   *
   * 这一条是实测抓出来的：用 `display:"m"` 注册时，
   * 注册名是 `uM`（不撞），但**显示名是 `m`** ——
   * 于是归一阶段 `1 m` 会被替换成 `1 uM`，
   * **标准单位 m 被自设单位顶掉**。
   *
   * 后果极隐蔽：`1 m to cm` 会得到自设单位的换算值，
   * 而不是 100 cm。且不会报任何错。
   */
  if (display !== '' && existingNames.has(display.toLowerCase())) {
    problems.push(
      '显示名「' + display + '」与已有单位同名。' +
        '这会让 `1 ' + display + '` 被替换成你自设的单位 —— ' +
        '标准单位就被顶掉了。换个显示名。',
    )
  }
  /**
   * 显示名是纯 ASCII 单位符号时也拒 —— `display:"kg"`、`display:"psi"`
   * 都会在归一阶段污染标准单位。
   */
  if (/^[A-Za-z]{1,6}$/.test(display) && display !== '') {
    problems.push(
      '显示名「' + display + '」是全英文字母的短名，容易与标准单位符号混淆。' +
        '建议用中文名（如「维尔」）或加前缀（如「维尔x」）。',
    )
  }

  /** 警告：重复发明。 */
  const key = dimension + ':' + factor
  const dup = existingSameFactor.get(key)
  if (dup !== undefined && problems.length === 0) {
    warnings.push(
      '已有一个同量纲同倍数的单位「' + dup + '」' +
        '（factor 相同）。若你要表达的就是它，直接用已有单位更好；' +
        '若这是本世界的另一个名字，继续注册也可以。',
    )
  }

  /** 警告：显示名形态。 */
  if (/[()（）\[\]、,，]/.test(display)) {
    warnings.push('display 含括号/标点，归一为表达式时可能出错，建议只用汉字或字母。')
  }

  return { ok: problems.length === 0, name, problems, warnings }
}

/**
 * 注册一个自设单位到 mathjs。
 *
 * @param math - mathjs 实例
 * @param unit - 已通过校验的单位
 * @returns 注册名
 */
export function registerCustomUnit(math: MathJsInstance, unit: CustomUnit): string {
  const base = DIMENSION_BASE[unit.dimension]
  if (base === undefined || base === '') {
    throw new CalcError(
      'invalid_argument',
      '量纲「' + unit.dimension + '」无法注册（' + (base === '' ? '计数单位没有物理量纲' : '不认识') + '）',
      '计数类单位走 countFactor 通道，不注册进引擎。',
    )
  }
  const definition = unit.factor + ' ' + base
  try {
    math.createUnit(unit.name, { definition })
  } catch (error) {
    /**
     * 已存在同名单位时 mathjs 会抛。这不该发生（校验已拦），
     * 但若并发注册则可能撞上 —— 报出来而不是静默跳过。
     */
    throw new CalcError(
      'invalid_argument',
      '注册「' + unit.name + '」失败：' + (error instanceof Error ? error.message : String(error)),
      '可能是同名单位已存在。用 action:"list" 查看已注册的自设单位。',
    )
  }
  return unit.name
}

/**
 * 把注册名还原成显示名（用于输出）。
 *
 * @param text - 含注册名的文本（如 `1.5 uWeiEr`）
 * @param units - 自设单位表
 * @returns 还原后的文本（如 `1.5 @维尔`）
 */
export function restoreCustomNames(text: string, units: CustomUnit[]): string {
  let out = text
  /**
   * 按注册名长度降序替换，避免 `uWei` 抢先匹配 `uWeiEr` 的前半截。
   */
  const sorted = [...units].sort((a, b) => b.name.length - a.name.length)
  for (const unit of sorted) {
    /** 整词匹配：前面不能是字母数字。 */
    const pattern = new RegExp('(?<![A-Za-z0-9])' + unit.name + '(?![A-Za-z0-9])', 'g')
    out = out.replace(pattern, '@' + unit.display)
  }
  return out
}
