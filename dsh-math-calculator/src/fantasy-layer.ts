/**
 * 幻想层：算清幻想量的物理含义，只提示不自裁。
 *
 * @module dsh-math-calculator/fantasy-layer
 * @description
 * 设计定位（用户 2026-10-25 明确）：
 *
 * > 插件是给用户**圆世界观**的，不是去反驳的。幻想怎么设定由用户与 AI 交互决定，
 * > 插件只负责：算的时候别忘结合幻想量与真实量、检查逻辑自洽、提个醒。
 *
 * 所以这一层的产出只有两类：
 * 1. **数字**：把幻想能力换算成物理世界的等价量（人力、食物、散热面积、温升）；
 * 2. **提醒**：指出「这里可能有个坑」，措辞一律是「需要注意 / 如果不……则……」，
 *    **没有「禁止」这个词，也不拦截任何设定**。
 *
 * 唯一保留的硬错误是**输入不完整**（缺名字、缺单位这类），那不是世界观判断，
 * 是数据缺字段，算不出来才需要说。
 *
 * ## 叠加而不是覆盖
 *
 * 用户选的是叠加式：世界可能「既有正常物理，又有灵能」，两者都要算。
 *
 *   有效能力 = 物理能力 + 幻想能力
 *   幻想能量 = (需求 − 物理能力) / 效率
 *   总代价   = 幻想能量 × 单位成本
 *
 * 好处：幻想世界的数字仍然**可比较**——
 * 能说「这个法师相当于 49 个人力」，而不是「他很厉害」。
 */

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
  /** 量名。 */
  name: string
  /** 中文名。 */
  label: string
  /** 来源（只是描述，不做合法性拦截）。 */
  source: FantasySource
  /** 效率：每消耗 1 单位幻想能量得到多少物理能力。 */
  efficiency: number
  /** 单位能力需要多少幻想能量。 */
  costPerUnit: number
  /** 每秒最多能调用的幻想能量（功率上限）。 */
  powerLimit: number
  /** 它增强哪个物理量。 */
  boosts: string
  /** 在故事里怎么用。 */
  meaning: string
}

/** 一条提醒（不是判定）。 */
export interface Hint {
  /** 提醒级别：info 只是说明，note 是可能需要注意的地方。 */
  level: 'info' | 'note'
  /** 内容。 */
  text: string
}

/** 叠加结果。 */
export interface OverlayResult {
  /** 物理部分能提供多少。 */
  physical: number
  /** 幻想部分能提供多少。 */
  fantasy: number
  /** 合计。 */
  total: number
  /** 幻想部分的成本。 */
  cost: number
  /** 可调用上限。 */
  budget: number
  /** 成本是否超过上限（只用于提醒，不做判定）。 */
  overBudget: boolean
  /** 提醒列表。 */
  hints: Hint[]
}

/**
 * 叠加计算：物理能力 + 幻想能力。
 *
 * 只做算术与提醒，**不给通过/禁止的结论**——那由用户与 AI 决定。
 *
 * @param physical - 纯物理能提供的能力值
 * @param ability - 幻想能力定义
 * @param demand - 想要达到的能力值
 * @returns 叠加结果与提醒
 */
export function overlay(
  physical: number,
  ability: FantasyAbility,
  demand: number,
): OverlayResult {
  const hints: Hint[] = []
  const needed = Math.max(0, demand - physical)
  const efficiency = Number.isFinite(ability.efficiency) && ability.efficiency > 0 ? ability.efficiency : 1
  const fantasyEnergy = needed / efficiency
  const cost = fantasyEnergy * ability.costPerUnit
  const budget = ability.powerLimit
  const overBudget = budget > 0 && cost > budget

  // 只说事实，不下结论
  if (efficiency > 1) {
    hints.push({
      level: 'info',
      text: '效率 ' + efficiency.toFixed(2) + ' > 1：幻想能量产出高于投入，这属于「额外能量源」的设定。' +
        '若来源是 ' + SOURCE_LABEL[ability.source] + '，故事里通常会交代它从哪来（信仰、地脉、外部文明…）。',
    })
  }
  if (overBudget) {
    hints.push({
      level: 'note',
      text: '需要 ' + cost.toExponential(2) + ' 单位幻想能量，但设定里每秒只能调用 ' + budget.toExponential(2) +
        '（超出 ' + (cost / budget).toFixed(1) + ' 倍）。若不打算改，可以让施法有冷却/蓄力时间来覆盖这个缺口。',
    })
  }
  if (ability.costPerUnit === 0) {
    hints.push({
      level: 'note',
      text: 'costPerUnit = 0：设定上没有能量代价。读者可能会问「那为什么不是人人都会」。' +
        '想圆的话可以给个非能量代价（寿命、寿命、社会管制、精神损耗…），或干脆设定为「人人都能，世界因此不同」。',
    })
  }
  if (hints.length === 0) {
    hints.push({
      level: 'info',
      text: '物理提供 ' + physical.toExponential(2) + '，幻想补足 ' + needed.toExponential(2) +
        '，消耗 ' + cost.toExponential(2) + '（预算 ' + budget.toExponential(2) + '）。',
    })
  }

  return {
    physical: physical,
    fantasy: needed,
    total: physical + needed,
    cost: cost,
    budget: budget,
    overBudget: overBudget,
    hints: hints,
  }
}

/**
 * 代价核算：把幻想能力换算成物理世界的等价量。
 *
 * 这是「算的时候别忘了结合现实量」的落地点——让幻想数字**可比较**。
 * 只报告数字，不评价好坏。
 */
export interface CostBreakdown {
  /** 等价人力（按 100 W 持续输出计）。 */
  humanEquivalent: number
  /** 等价食物（按 1 kg 糖 ≈ 1.6e7 J）。 */
  sugarKg: number
  /** 若靠体表散热，需要多少面积（按 100 W/m²）。 */
  coolingAreaM2: number
  /** 散热不足时的温升估计（K）。 */
  temperatureRiseK: number
  /** 体表面积是否够散热。 */
  coolingShort: boolean
  /** 提醒列表。 */
  hints: Hint[]
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
 * 只算数字与可能需要注意的地方，不评判设定好坏。
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
    hints.push({
      level: 'info',
      text: '相当于 ' + humanEquivalent.toFixed(0) + ' 个成年人的持续输出——可用于和普通人力比较。',
    })
  }
  if (coolingShort) {
    hints.push({
      level: 'note',
      text: '靠体表散热需要 ' + coolingAreaM2.toFixed(2) + ' m²，而施术者只有 ' + bodyAreaM2.toFixed(2) + ' m²。' +
        '若不打算改热功率，可以设想他有散热手段（汗腺强化、水冷外衣、短时爆发而非持续输出）。',
    })
    if (temperatureRiseK > 10) {
      hints.push({
        level: 'info',
        text: '持续施法时体温估计会升 ' + temperatureRiseK.toFixed(0) + ' K——这本身可以当作设定亮点：' +
          '「强力施术者都会烧起来」，读者会觉得可信。',
      })
    }
  }
  return {
    humanEquivalent: humanEquivalent,
    sugarKg: sugarKg,
    coolingAreaM2: coolingAreaM2,
    temperatureRiseK: temperatureRiseK,
    coolingShort: coolingShort,
    hints: hints,
  }
}

/**
 * 检查幻想定义有没有**算不出来**的字段问题。
 *
 * 只报「缺字段导致算不了」，不评判设定是否合理——
 * efficiency > 1、costPerUnit = 0 这类都可以算，只是会给出提醒。
 *
 * @param ability - 幻想能力
 * @returns 缺失字段列表（空表示能算）
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
 * 渲染幻想层分析报告。
 *
 * 输出数字 + 提醒，**不含任何「禁止」字样**。
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
  const cost = computeCost(result.fantasy * ability.costPerUnit / 1, bodyAreaM2)
  const num = function (value: number): string {
    if (!Number.isFinite(value)) return '—'
    const abs = Math.abs(value)
    if (abs >= 1e5 || (abs < 1e-2 && abs > 0)) return value.toExponential(2)
    return Number(value.toPrecision(4)).toString()
  }
  out.push('═══ 幻想层分析：' + ability.label + ' ═══')
  out.push('')
  out.push('  来源：' + SOURCE_LABEL[ability.source] + '   效率：' + ability.efficiency)
  out.push('  单位成本：' + num(ability.costPerUnit) + '   功率上限：' + num(ability.powerLimit) + ' W')
  out.push('')
  out.push('【叠加结果】物理与幻想相加，不覆盖')
  out.push('  需求总量：  ' + num(demand))
  out.push('  物理提供：  ' + num(result.physical))
  out.push('  幻想补足：  ' + num(result.fantasy))
  out.push('  合计：      ' + num(result.total))
  out.push('')
  out.push('【等价现实量】用于和普通人力/食物比较')
  out.push('  等价人力：  ' + cost.humanEquivalent.toFixed(1) + ' 人')
  out.push('  等价食物：  ' + num(cost.sugarKg) + ' kg 糖/秒')
  out.push('  散热需求：  ' + cost.coolingAreaM2.toFixed(2) + ' m²')
  out.push('')
  out.push('【提醒】仅供参考，设定由你决定')
  for (const hint of result.hints) out.push('  · ' + hint.text)
  for (const hint of cost.hints) out.push('  · ' + hint.text)
  return out.join(String.fromCharCode(10))
}
