/**
 * 幻想层：叠加式（不覆盖物理），并要求付代价。
 *
 * ## 定位
 *
 * 插件不判「这个设定行不行」。它做的是把幻想能力换算成**可比较的现实量**：
 * 等价多少人力、多少食物、多少散热面积。
 *
 * 输出**不含「禁止」字样**——设定由作者决定，工具只说你选了它意味着什么。
 *
 * @module dsh-math-calculator/features/deduction/fantasy-layer
 */

/** 幻想能量来源。 */
export type FantasySource = 'metabolism' | 'ambient-field' | 'artifact' | 'external'

/** 来源的中文说明。 */
export const SOURCE_LABEL: Record<FantasySource, string> = {
  metabolism: '生物自身代谢',
  'ambient-field': '环境场（灵能海、地脉…）',
  artifact: '器物/装置',
  external: '外部注入（神赐、外文明…)',
}

/** 一个幻想能力。 */
export interface FantasyAbility {
  name: string
  label: string
  source: FantasySource
  /** 每消耗 1 单位幻想能量得到多少物理能力。 */
  efficiency: number
  /** 单位能力需要多少幻想能量。 */
  costPerUnit: number
  /** 每秒最多能调用的幻想能量。 */
  powerLimit: number
  boosts: string
  meaning: string
}

/** 一条提醒（不是判定）。 */
export interface Hint {
  level: 'info' | 'note'
  text: string
}

/** 叠加结果。 */
export interface OverlayResult {
  physical: number
  fantasy: number
  total: number
  cost: number
  budget: number
  overBudget: boolean
  hints: Hint[]
}

/**
 * 叠加计算：物理 + 幻想。
 *
 * @param physical - 纯物理能提供的能力值
 * @param ability - 幻想能力
 * @param demand - 想要达到的能力值
 * @returns 叠加结果与提醒
 */
export function overlay(physical: number, ability: FantasyAbility, demand: number): OverlayResult {
  const hints: Hint[] = []
  const needed = Math.max(0, demand - physical)
  const efficiency = Number.isFinite(ability.efficiency) && ability.efficiency > 0 ? ability.efficiency : 1
  const fantasyEnergy = needed / efficiency
  const cost = fantasyEnergy * ability.costPerUnit
  const budget = ability.powerLimit
  const overBudget = budget > 0 && cost > budget

  if (efficiency > 1) {
    hints.push({
      level: 'info',
      text: '效率 ' + efficiency.toFixed(2) + ' > 1：幻想能量产出高于投入，属于「额外能量源」设定。若来源是 ' + SOURCE_LABEL[ability.source] + '，故事里通常要交代它从哪来。',
    })
  }
  if (overBudget) {
    hints.push({
      level: 'note',
      text: '需要 ' + cost.toExponential(2) + ' 单位幻想能量，但设定里每秒只能调用 ' + budget.toExponential(2) + '（超出 ' + (cost / budget).toFixed(1) + ' 倍）。若不改，可以让施法有冷却/蓄力时间覆盖这个缺口。',
    })
  }
  if (ability.costPerUnit === 0) {
    hints.push({
      level: 'note',
      text: 'costPerUnit = 0：设定上没有能量代价。读者可能会问「那为什么不是人人都会」。可以给个非能量代价（寿命、社会管制、精神损耗…），或设定为「人人都能，世界因此不同」。',
    })
  }
  if (hints.length === 0) {
    hints.push({
      level: 'info',
      text: '物理提供 ' + physical.toExponential(2) + '，幻想补足 ' + needed.toExponential(2) + '，消耗 ' + cost.toExponential(2) + '（预算 ' + budget.toExponential(2) + '）。',
    })
  }
  return { physical, fantasy: needed, total: physical + needed, cost, budget, overBudget, hints }
}

/** 等价代价。 */
export interface CostBreakdown {
  humanEquivalent: number
  sugarKg: number
  coolingAreaM2: number
  temperatureRiseK: number
  coolingShort: boolean
  hints: Hint[]
}

/** 人类持续输出功率（W）。 */
export const HUMAN_POWER_W = 100
/** 糖能量密度（J/kg）。 */
export const SUGAR_ENERGY_J_PER_KG = 1.6e7
/** 体表散热能力（W/m²）。 */
export const COOLING_W_PER_M2 = 100

/**
 * 核算一次幻想输出的物理代价。
 *
 * @param powerW - 幻想输出功率（W）
 * @param bodyAreaM2 - 施术者体表面积（m²）
 * @returns 等价量与提醒
 */
export function computeCost(powerW: number, bodyAreaM2: number): CostBreakdown {
  const hints: Hint[] = []
  const humanEquivalent = powerW / HUMAN_POWER_W
  const sugarKg = powerW / SUGAR_ENERGY_J_PER_KG
  const coolingAreaM2 = powerW / COOLING_W_PER_M2
  const availableCooling = Math.max(0.01, bodyAreaM2) * COOLING_W_PER_M2
  const deficit = Math.max(0, powerW - availableCooling)
  const temperatureRiseK = deficit / (Math.max(0.01, bodyAreaM2) * 10)
  const coolingShort = coolingAreaM2 > bodyAreaM2

  if (humanEquivalent >= 1) {
    hints.push({ level: 'info', text: '相当于 ' + humanEquivalent.toFixed(0) + ' 个成年人的持续输出——可用于和普通人力比较。' })
  }
  if (coolingShort) {
    hints.push({
      level: 'note',
      text: '靠体表散热需要 ' + coolingAreaM2.toFixed(2) + ' m²，而施术者只有 ' + bodyAreaM2.toFixed(2) + ' m²。若不改热功率，可以设想他有散热手段（汗腺强化、水冷外衣、短时爆发）。',
    })
    if (temperatureRiseK > 10) {
      hints.push({ level: 'info', text: '持续施法时体温估计会升 ' + temperatureRiseK.toFixed(0) + ' K——这本身可以当作设定亮点：「强力施术者都会烧起来」。' })
    }
  }
  return { humanEquivalent, sugarKg, coolingAreaM2, temperatureRiseK, coolingShort, hints }
}

/**
 * 检查幻想定义有没有「算不出来」的字段问题。
 *
 * @param ability - 幻想能力
 * @returns 缺失字段（空表示能算）
 */
export function checkFields(ability: FantasyAbility): string[] {
  const problems: string[] = []
  if (!ability.name || ability.name.trim() === '') problems.push('缺 name')
  if (!ability.label || ability.label.trim() === '') problems.push('缺 label')
  if (!(ability.efficiency > 0)) problems.push('efficiency 必须 > 0（否则算不出来）')
  if (!(ability.powerLimit > 0)) problems.push('powerLimit 必须 > 0（否则没有可调用上限）')
  return problems
}

/**
 * 渲染幻想层报告。
 *
 * @param ability - 幻想能力
 * @param demand - 需求能力值
 * @param physical - 纯物理提供量
 * @param bodyAreaM2 - 体表面积
 * @returns 可读文本
 */
export function renderFantasy(ability: FantasyAbility, demand: number, physical: number, bodyAreaM2 = 1.8): string {
  const result = overlay(physical, ability, demand)
  const cost = computeCost(result.fantasy * ability.costPerUnit, bodyAreaM2)
  const num = (value: number): string => {
    if (!Number.isFinite(value)) return '—'
    const abs = Math.abs(value)
    if (abs >= 1e5 || (abs < 1e-2 && abs > 0)) return value.toExponential(2)
    return Number(value.toPrecision(4)).toString()
  }
  const out: string[] = [
    '═══ 幻想层分析：' + ability.label + ' ═══',
    '',
    '  来源：' + SOURCE_LABEL[ability.source] + '   效率：' + ability.efficiency,
    '  单位成本：' + num(ability.costPerUnit) + '   功率上限：' + num(ability.powerLimit) + ' W',
    '',
    '【叠加结果】物理与幻想相加，不覆盖',
    '  需求总量：  ' + num(demand),
    '  物理提供：  ' + num(result.physical),
    '  幻想补足：  ' + num(result.fantasy),
    '  合计：      ' + num(result.total),
    '',
    '【等价现实量】用于和普通人力/食物比较',
    '  等价人力：  ' + cost.humanEquivalent.toFixed(1) + ' 人',
    '  等价食物：  ' + num(cost.sugarKg) + ' kg 糖/秒',
    '  散热需求：  ' + cost.coolingAreaM2.toFixed(2) + ' m²',
    '',
    '【提醒】仅供参考，设定由你决定',
  ]
  for (const hint of result.hints) out.push('  · ' + hint.text)
  for (const hint of cost.hints) out.push('  · ' + hint.text)
  return out.join('\n')
}
