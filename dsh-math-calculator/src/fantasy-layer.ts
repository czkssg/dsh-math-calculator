/**
 * 幻想层：让幻想设定与真实物理**叠加**而非覆盖。
 *
 * @module dsh-math-calculator/fantasy-layer
 * @description
 * 用户明确选择「叠加式」：新量作为额外输入进入判定，保留原有物理。
 * 因为一个世界可能「既有正常物理，又有灵能」——两者都要算。
 *
 * ## 核心问题：怎么让幻想带真实
 *
 * 幻想最容易犯的错是「想加就加，不付代价」。所以这里的设计是：
 * 每个幻想量必须回答三个问题，否则不给通过：
 *
 * 1. **来源**：它从哪来？（生物自身代谢 / 环境场 / 外部装置）
 * 2. **代价**：用它要付什么？（能量、热量、物质、时间）
 * 3. **上限**：它最多能做到多少？（超过就退回纯物理）
 *
 * ## 叠加的数学形式
 *
 * 不是「灵能顶替代谢」，而是：
 *
 *   有效能力 = 物理能力 + 幻想能力 × 效率
 *   总成本   = 物理成本 + 幻想成本 / 效率
 *
 * 于是：
 *   · 灵能效率 1.0 时，能力翻倍、成本也翻倍——世界还是自洽的；
 *   · 灵能效率 0.01 时，只多一点点能力，却要付 100 倍成本——不划算，
 *     这就解释了「为什么不是人人都在用灵能」；
 *   · 效率 > 1 才叫「真正的幻想」，但那意味着**能量来源本身**是新的，
 *     此时必须声明来源，否则推演按「永动机」处理并标红。
 *
 * 这套形式的好处：幻想世界的数字仍然是**可比较的**——
 * 你能说「这个灵能法师相当于 50 个人力」，而不是「他很厉害」。
 */

import type { Verdict } from './derivation-stack.js'

/** 幻想量的来源类型。 */
export type FantasySource = 'metabolism' | 'ambient-field' | 'artifact' | 'external'

/** 来源的中文说明。 */
export const SOURCE_LABEL: Record<FantasySource, string> = {
  metabolism: '生物自身代谢',
  'ambient-field': '环境场（灵能海、地脉…）',
  artifact: '器物/装置',
  external: '外部注入（神赐、外文明…）',
}

/** 一个幻想能力的定义。 */
export interface FantasyAbility {
  /** 量名（对应自创常数）。 */
  name: string
  /** 中文名。 */
  label: string
  /** 来源。 */
  source: FantasySource
  /**
   * 效率：每消耗 1 单位幻想能量，能得到多少单位的物理能力。
   *
   * 1.0 = 等效能（幻想只换形式，不凭空增量）
   * <1  = 不划算（真实世界多数「特异功能」属于这档）
   * >1  = 真正的额外能量源（必须声明 source，否则按永动机标红）
   */
  efficiency: number
  /** 单位能力需要多少幻想能量（J 或本地单位）。 */
  costPerUnit: number
  /** 每单位时间最多能调用的幻想能量（功率上限，W）。 */
  powerLimit: number
  /** 它替代/增强哪个物理量（用于叠加）。 */
  boosts: string
  /** 说明：在故事里怎么用。 */
  meaning: string
}

/** 叠加结果。 */
export interface OverlayResult {
  /** 物理部分能提供多少。 */
  physical: number
  /** 幻想部分能提供多少。 */
  fantasy: number
  /** 合计。 */
  total: number
  /** 幻想部分的成本（能量/功率）。 */
  cost: number
  /** 成本是否超过可调用上限。 */
  overBudget: boolean
  /** 判定。 */
  verdict: Verdict
  /** 说明。 */
  notes: string[]
}

/**
 * 叠加计算：物理能力 + 幻想能力。
 *
 * @param physical - 纯物理能提供的能力值
 * @param ability - 幻想能力定义
 * @param demand - 需求（想要达到的能力值）
 * @returns 叠加结果与判定
 */
export function overlay(
  physical: number,
  ability: FantasyAbility,
  demand: number,
): OverlayResult {
  const notes: string[] = []
  const needed = Math.max(0, demand - physical)
  const efficiency = Number.isFinite(ability.efficiency) && ability.efficiency > 0 ? ability.efficiency : 1

  // 幻想能量需求 = 缺口 / 效率
  const fantasyEnergy = needed / efficiency
  // 成本 = 能量 × 单位成本
  const cost = fantasyEnergy * ability.costPerUnit

  // 可调用上限：功率上限 × 时间（这里按 1 秒看瞬时能力）
  const budget = ability.powerLimit
  const overBudget = cost > budget

  // 能量来源合法性：效率 > 1 且来源不是 external，视为疑似永动机
  let verdict: Verdict = 'allowed'
  if (efficiency > 1 && ability.source !== 'external') {
    verdict = 'forbidden'
    notes.push(
      '效率 ' + efficiency.toFixed(2) + ' > 1，但来源是「' + SOURCE_LABEL[ability.source] + '」——' +
      '这等于凭空产生能量。要么把效率调到 ≤ 1，要么把来源声明为「外部注入」。',
    )
  } else if (overBudget) {
    verdict = 'marginal'
    notes.push(
      '需要 ' + cost.toExponential(2) + ' 单位幻想能量，但每秒只能调用 ' + budget.toExponential(2) + '——' +
      '超出 ' + (cost / budget).toFixed(1) + ' 倍。要么降低需求，要么提高功率上限。',
    )
  } else {
    notes.push(
      '物理提供 ' + physical.toExponential(2) + '，幻想补足 ' + needed.toExponential(2) + '，' +
      '消耗幻想能量 ' + cost.toExponential(2) + '（预算 ' + budget.toExponential(2) + '）。',
    )
  }

  // 效率 < 1 时给个「不划算」提示
  if (efficiency < 0.1 && verdict === 'allowed') {
    notes.push('效率仅 ' + (efficiency * 100).toFixed(1) + '%，代价是普通方式的 ' + (1 / efficiency).toFixed(0) + ' 倍——世界会自然倾向于不用它。')
  }

  return {
    physical: physical,
    fantasy: needed,
    total: physical + needed,
    cost: cost,
    overBudget: overBudget,
    verdict: verdict,
    notes: notes,
  }
}

/**
 * 代价核算：把幻想能力换算成物理世界的等价量。
 *
 * 这是「幻想带真实」的核心——让幻想数字**可比较**。
 * 例如：「这个法师的灵能输出相当于 50 个人力」比「他很强」有用得多。
 */
export interface CostBreakdown {
  /** 等价人力（按 100 W 持续输出计）。 */
  humanEquivalent: number
  /** 等价代谢食物（按 1 kg 糖 ≈ 1.6e7 J）。 */
  sugarKg: number
  /** 若要散热：需要多少体表面积（按 100 W/m² 散热能力）。 */
  coolingAreaM2: number
  /** 需要的体温与环境温差（若散热面积不足）。 */
  temperatureRiseK: number
  /** 说明。 */
  notes: string[]
}

/** 人类持续输出功率基准（W）。 */
export const HUMAN_POWER_W = 100

/** 糖的能量密度（J/kg）。 */
export const SUGAR_ENERGY_J_PER_KG = 1.6e7

/** 体表散热能力基准（W/m²）。 */
export const COOLING_W_PER_M2 = 100

/**
 * 核算一次幻想输出的物理代价。
 *
 * @param powerW - 幻想输出功率（W）
 * @param bodyAreaM2 - 施术者的体表面积（m²），用于判断散热是否够
 * @returns 等价量与散热需求
 */
export function computeCost(powerW: number, bodyAreaM2: number): CostBreakdown {
  const notes: string[] = []
  const humanEquivalent = powerW / HUMAN_POWER_W
  const energyPerSecond = powerW
  const sugarKgValue = energyPerSecond / SUGAR_ENERGY_J_PER_KG
  const coolingAreaM2 = powerW / COOLING_W_PER_M2
  const availableCooling = Math.max(0.01, bodyAreaM2) * COOLING_W_PER_M2
  const deficit = Math.max(0, powerW - availableCooling)
  // 若散热不足，体温会上升；粗估每 1 W 多余热量需 1 K 温差（按体表面积摊）
  const temperatureRiseK = deficit / (Math.max(0.01, bodyAreaM2) * 10)

  if (humanEquivalent >= 1) {
    notes.push('相当于 ' + humanEquivalent.toFixed(0) + ' 个成年人的持续输出。')
  }
  if (coolingAreaM2 > bodyAreaM2) {
    notes.push(
      '散热需要 ' + coolingAreaM2.toFixed(2) + ' m² 表面积，但施术者只有 ' + bodyAreaM2.toFixed(2) + ' m²——' +
      '超出 ' + (coolingAreaM2 / Math.max(0.01, bodyAreaM2)).toFixed(1) + ' 倍，体温会升 ' + temperatureRiseK.toFixed(1) + ' K。',
    )
    notes.push('这是「为什么强力施术者会烧起来」的物理原因。')
  }
  return {
    humanEquivalent: humanEquivalent,
    sugarKg: sugarKgValue,
    coolingAreaM2: coolingAreaM2,
    temperatureRiseK: temperatureRiseK,
    notes: notes,
  }
}

/**
 * 校验一个幻想能力定义是否「带真实」。
 *
 * 三个必答问题：来源、代价、上限。缺一个就不算自洽的幻想。
 *
 * @param ability - 幻想能力
 * @returns 问题列表（空表示通过）
 */
export function validateFantasy(ability: FantasyAbility): string[] {
  const problems: string[] = []
  if (!ability.name || ability.name.trim() === '') problems.push('缺 name')
  if (!ability.label || ability.label.trim() === '') problems.push('缺 label')
  if (!(ability.efficiency > 0)) problems.push('efficiency 必须 > 0')
  if (ability.efficiency > 1 && ability.source !== 'external') {
    problems.push('efficiency > 1 时必须声明 source=external（否则等于永动机）')
  }
  if (!(ability.costPerUnit >= 0)) problems.push('costPerUnit 必须 >= 0（无代价的幻想不叫幻想）')
  if (ability.costPerUnit === 0) {
    problems.push('costPerUnit = 0：不付代价的能力会让整个推演失去意义')
  }
  if (!(ability.powerLimit > 0)) problems.push('powerLimit 必须 > 0（没有上限等于无限强）')
  if (!ability.meaning || ability.meaning.trim() === '') {
    problems.push('缺 meaning：作者必须说明它在故事里怎么用')
  }
  return problems
}

/**
 * 渲染幻想层的分析报告。
 *
 * @param ability - 幻想能力
 * @param demand - 想要达到的能力值
 * @param physical - 纯物理能提供多少
 * @param bodyAreaM2 - 施术者体表面积
 * @returns 可读文本
 */
export function renderFantasy(
  ability: FantasyAbility,
  demand: number,
  physical: number,
  bodyAreaM2 = 1.8,
): string {
  const out: string[] = []
  const result = overlay(physical, ability, demand)
  const cost = computeCost(result.fantasy * ability.costPerUnit, bodyAreaM2)
  const num = function (value: number): string {
    if (!Number.isFinite(value)) return '—'
    const abs = Math.abs(value)
    if (abs >= 1e5 || (abs < 1e-2 && abs > 0)) return value.toExponential(2)
    return Number(value.toPrecision(4)).toString()
  }
  out.push('═══ 幻想层叠加分析：' + ability.label + ' ═══')
  out.push('')
  out.push('  来源：' + SOURCE_LABEL[ability.source] + '   效率：' + ability.efficiency)
  out.push('  单位成本：' + num(ability.costPerUnit) + '   功率上限：' + num(ability.powerLimit) + ' W')
  out.push('')
  out.push('【叠加结果】（不覆盖，是相加）')
  out.push('  需求总量：  ' + num(demand))
  out.push('  物理提供：  ' + num(result.physical))
  out.push('  幻想补足：  ' + num(result.fantasy))
  out.push('  合计：      ' + num(result.total))
  out.push('')
  out.push('【代价核算】')
  out.push('  幻想能量：  ' + num(result.cost))
  out.push('  等价人力：  ' + cost.humanEquivalent.toFixed(1) + ' 人')
  out.push('  等价食物：  ' + num(cost.sugarKg) + ' kg 糖/秒')
  out.push('  散热需求：  ' + cost.coolingAreaM2.toFixed(2) + ' m²')
  out.push('')
  out.push('【判定】' + (result.verdict === 'allowed' ? '允许' : result.verdict === 'marginal' ? '边缘' : '禁止'))
  for (const note of result.notes) out.push('  · ' + note)
  for (const note of cost.notes) out.push('  · ' + note)
  return out.join(String.fromCharCode(10))
}
