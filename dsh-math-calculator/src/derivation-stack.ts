/**
 * 推演栈：架空世界的分层推演框架。
 *
 * @module dsh-math-calculator/derivation-stack
 * @description
 * 把「常数一变连锁一切」拆成**可管理的一叠层**，每层只向下游暴露 5—10 个
 * 接口变量，避免无限下钻。这是本插件的核心方法论，不是普通计算器的扩展。
 *
 * ## 两层结构
 *
 * - **推演栈**（垂直，逐层向下）：M0 元协议 → P0 基本 → P1 微观 → P2 介观
 *   → P3 体感 → P4 行星 → P5 恒星 → P6 文明叙事。
 * - **贯穿层**（水平，横切所有层）：单位与观测者、不确定性与版本、
 *   时间与历史路径、约束分级。
 *
 * ## 三条铁律
 *
 * 1. **输出不是唯一答案**：任何结论都带「允许 / 边缘 / 禁止 / 待定 / 叙事选择」，
 *    外加置信度与待定项。
 * 2. **真正追踪的是无量纲比值**：同时缩放所有质量通常只是换了单位。
 * 3. **约束分级**：硬约束 > 核心叙事锚点 > 软约束 > 细节设定。
 */

/** 结论状态标签。 */
export type Verdict = 'allowed' | 'marginal' | 'forbidden' | 'pending' | 'narrative'

/** 约束类型。 */
export type ConstraintKind = 'hard' | 'soft' | 'narrative'

/** 置信度。 */
export type Confidence = 'high' | 'medium' | 'low'

/** 状态标签的中文说明（界面上直接用）。 */
export const VERDICT_LABEL: Record<Verdict, string> = {
  allowed: '允许', marginal: '边缘', forbidden: '禁止', pending: '待定', narrative: '叙事选择',
}

/** 约束类型的中文说明。 */
export const CONSTRAINT_LABEL: Record<ConstraintKind, string> = {
  hard: '硬约束', soft: '软约束', narrative: '叙事约束',
}

/** 置信度的中文说明。 */
export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: '高', medium: '中', low: '低' }

/** 推演层定义：核心问题、输入、下游接口、失败模式。 */
export interface StackLayer {
  id: string
  name: string
  question: string
  inputs: string[]
  outputs: string[]
  failureModes: string[]
}

/** 推演栈的八层。多数架空世界只需 P1—P4 + 少量 P5，不必全宇宙展开。 */
export const STACK: StackLayer[] = [
  { id: 'M0', name: '元协议层', question: '推演到什么分辨率？给谁看？',
    inputs: ['目标', '范围', '观测者', '时间窗口'],
    outputs: ['推演卡', '约束优先级', '版本规则'],
    failureModes: ['目标不清会导致无限下钻'] },
  { id: 'P0', name: '基本层', question: '常数、对称性、初条件、边界条件是什么？',
    inputs: ['变更清单', '固定清单'],
    outputs: ['无量纲参数包', '稳定性边界'],
    failureModes: ['量纲错误', '忽略单位重定义', '微调脆弱'] },
  { id: 'P1', name: '微观有效层', question: '核、原子、分子、化学是否成立？',
    inputs: ['P0 参数包'],
    outputs: ['原子尺度', '键能范围', '稳定元素丰度', '主要溶剂相变点', '辐射吸收窗口', '反应速率温区'],
    failureModes: ['核不稳定', '碳氧窗口消失', '化学键能越界'] },
  { id: 'P2', name: '介观材料层', question: '材料、流体、热力学是否可用？',
    inputs: ['P1 接口'],
    outputs: ['材料强度密度比', '代谢能尺度', '热导与散热', '粘度', '可利用元素', '光窗口'],
    failureModes: ['无稳定材料', '无合适溶剂', '热力学窗口过窄'] },
  { id: 'P3', name: '宏观体感层', question: '生物力学、感知、本地单位是否成立？',
    inputs: ['P2 接口', '观测者设定'],
    outputs: ['骨骼强度体重比', '代谢产热散热比', '身高大气标高比', '感知窗口', '反应时间重力比'],
    failureModes: ['生物无法支撑', '散热失败', '感知窗口错位'] },
  { id: 'P4', name: '行星环境层', question: '地质、气候、大气、海洋是否可持续？',
    inputs: ['P1—P3 反馈'],
    outputs: ['大气逃逸率', '地质热流', '碳循环', '灾害频率'],
    failureModes: ['大气无法保留', '气候失控', '地质死寂'] },
  { id: 'P5', name: '恒星天文层', question: '恒星寿命、行星形成、辐射环境如何？',
    inputs: ['P0', 'P4 边界'],
    outputs: ['恒星寿命', '辐射谱', '行星形成概率', '轨道稳定性'],
    failureModes: ['恒星寿命不足', '辐射窗口不利', '行星无法形成'] },
  { id: 'P6', name: '文明叙事层', question: '技术、社会、历史是否自洽？',
    inputs: ['P2—P5 接口'],
    outputs: ['能源路径', '材料路径', '交通尺度', '城市规模', '灾害应对'],
    failureModes: ['技术路径依赖不存在的材料或能源'] },
]

/** 接口卡：一层向下游传递的一个粗粒化变量（规格的 10 个字段）。 */
export interface InterfaceCard {
  name: string
  definition: string
  unit: string
  dependsOn: string[]
  range: { allowed?: [number, number]; marginal?: [number, number] }
  kind: ConstraintKind
  confidence: Confidence
  sensitiveTo: string[]
  narrativeImpact: string[]
  notes?: string
}

/**
 * 判定一个数值落在接口卡的哪个区间。
 *
 * @param value - 待判定的数值
 * @param card - 接口卡
 * @returns 状态（允许 / 边缘 / 禁止 / 待定）
 */
export function judgeRange(value: number, card: InterfaceCard): Verdict {
  if (!Number.isFinite(value)) return 'pending'
  const allowed = card.range.allowed
  const marginal = card.range.marginal
  if (allowed !== undefined && value >= allowed[0] && value <= allowed[1]) return 'allowed'
  if (marginal !== undefined && value >= marginal[0] && value <= marginal[1]) return 'marginal'
  if (allowed === undefined && marginal === undefined) return 'pending'
  return 'forbidden'
}

/** 单位卡：一个世界的度量衡是怎么定的。 */
export interface UnitCard {
  length: string
  mass: string
  time: string
  temperature: string
  energy: string
  observerWindow: string
  conversion: string
}

/**
 * 检测「单位重定义陷阱」。
 *
 * 同时把所有质量乘以同一因子通常不是物理变化，只是换了单位。
 * 真正该追踪的是无量纲比值。
 *
 * @param changes - 各量纲的缩放因子，如 { length: 2, mass: 2 }
 * @returns 判定与说明
 */
export function detectUnitRedefinition(changes: Record<string, number>): {
  isUnitRedefinition: boolean
  reason: string
} {
  const entries = Object.entries(changes).filter(function (entry) {
    return Number.isFinite(entry[1]) && entry[1] !== 0
  })
  if (entries.length === 0) return { isUnitRedefinition: false, reason: '没有有效变更。' }
  if (entries.length === 1) {
    const dim = entries[0][0]
    const factor = entries[0][1]
    return {
      isUnitRedefinition: true,
      reason:
        '只缩放了一个量纲（' + dim + ' × ' + factor + '）。若无量纲比值全部不变，' +
        '这只是换了单位，不是物理变化。请改追踪无量纲组合（如 α、mp/me）。',
    }
  }
  const factors = entries.map(function (entry) { return entry[1] })
  const first = factors[0]
  const allSame = factors.every(function (f) { return Math.abs(f - first) < 1e-9 })
  if (allSame) {
    return {
      isUnitRedefinition: true,
      reason:
        '所有量纲都乘以同一因子 ' + first + '，这等价于整体换算单位，物理世界没有变化。' +
        '请改追踪无量纲比值。',
    }
  }
  return {
    isUnitRedefinition: false,
    reason: '多个量纲以不同比例变化，构成真实物理变化。',
  }
}

/** 无量纲参数包的一项。 */
export interface DimensionlessPack {
  name: string
  meaning: string
  standard: number
  current: number
  deviation: number
}

/**
 * 计算四个核心无量纲量（规格点名的那几个）。
 *
 * @param constants - 已解析的常数表
 * @returns 各无量纲量与偏差
 */
export function dimensionlessPack(constants: Record<string, number>): DimensionlessPack[] {
  const c = constants.c !== undefined ? constants.c : 299792458
  const hbar = constants.hbar !== undefined ? constants.hbar : 1.054571817e-34
  const e = constants.e_charge !== undefined ? constants.e_charge : 1.602176634e-19
  const me = constants.me !== undefined ? constants.me : 9.1093837015e-31
  const mp = constants.mp !== undefined ? constants.mp : 1.67262192369e-27
  const G = constants.G !== undefined ? constants.G : 6.6743e-11
  const epsilon0 = constants.epsilon0 !== undefined ? constants.epsilon0 : 8.8541878128e-12

  const alpha = (e * e) / (4 * Math.PI * epsilon0 * hbar * c)
  const mpMe = mp / me
  const alphaG = (G * mp * mp) / (hbar * c)
  const gravityOverEm = alphaG / alpha

  // 现实值也用**同一组公式**从现实常数算出来，不写死数字。
  // 否则公式一改，standard 与实际就脱节，出现第二份真相。
  const REAL = {
    c: 299792458,
    hbar: 1.054571817e-34,
    e: 1.602176634e-19,
    me: 9.1093837015e-31,
    mp: 1.67262192369e-27,
    G: 6.6743e-11,
    epsilon0: 8.8541878128e-12,
  }
  const realAlpha = (REAL.e * REAL.e) / (4 * Math.PI * REAL.epsilon0 * REAL.hbar * REAL.c)
  const realMpMe = REAL.mp / REAL.me
  const realAlphaG = (REAL.G * REAL.mp * REAL.mp) / (REAL.hbar * REAL.c)
  const realGravityOverEm = realAlphaG / realAlpha

  const packs = [
    { name: 'alpha', meaning: '精细结构常数 —— 电磁力相对强弱', standard: realAlpha, current: alpha },
    { name: 'mp/me', meaning: '质子电子质量比 —— 物质与化学的尺标', standard: realMpMe, current: mpMe },
    { name: 'alphaG', meaning: '引力耦合常数 —— 引力为何可忽略', standard: realAlphaG, current: alphaG },
    { name: 'gravity/em', meaning: '引力与电磁力强度比', standard: realGravityOverEm, current: gravityOverEm },
  ]

  return packs.map(function (pack) {
    return {
      name: pack.name,
      meaning: pack.meaning,
      standard: pack.standard,
      current: pack.current,
      deviation: pack.standard === 0 ? 0 : (pack.current - pack.standard) / pack.standard,
    }
  })
}

/** 敏感性报告。 */
export interface SensitivityReport {
  epsilon: number
  items: Array<{
    parameter: string
    baseline: number
    perturbed: number
    relativeChange: number
    verdict: 'stable' | 'sensitive' | 'threshold'
    note: string
  }>
  fineTuningWarning: boolean
  ranking: string[]
}

/**
 * 一阶敏感性分析：扰动输入，看结论被放大多少倍。
 *
 * @param evaluate - 把参数映射到结论的函数
 * @param base - 基线值
 * @param epsilon - 相对扰动幅度
 * @param narrowThreshold - 判定微调警告的阈值
 * @returns 敏感性报告
 */
export function sensitivity(
  evaluate: (value: number) => number,
  base: number,
  epsilon = 0.01,
  narrowThreshold = 0.1,
): SensitivityReport {
  const baseline = evaluate(base)
  const items: SensitivityReport['items'] = []
  for (const sign of [-1, 1]) {
    const perturbedInput = base * (1 + sign * epsilon)
    const perturbed = evaluate(perturbedInput)
    const relativeChange = baseline === 0 ? 0 : Math.abs((perturbed - baseline) / baseline)
    let verdict: 'stable' | 'sensitive' | 'threshold' = 'stable'
    let note = '结论基本稳定'
    if (relativeChange > narrowThreshold) {
      verdict = 'threshold'
      note = '变化超过 ' + (narrowThreshold * 100).toFixed(0) + '%，可能跨过硬约束边界'
    } else if (relativeChange > epsilon * 2) {
      verdict = 'sensitive'
      note = '结论放大约 ' + (relativeChange / epsilon).toFixed(1) + ' 倍'
    }
    items.push({
      parameter: 'x' + (sign > 0 ? '+' : '-') + (epsilon * 100).toFixed(0) + '%',
      baseline: baseline,
      perturbed: perturbed,
      relativeChange: relativeChange,
      verdict: verdict,
      note: note,
    })
  }
  const worst = Math.max.apply(null, items.map(function (item) { return item.relativeChange }))
  return {
    epsilon: epsilon,
    items: items,
    fineTuningWarning: worst > narrowThreshold,
    ranking: items.slice().sort(function (a, b) { return b.relativeChange - a.relativeChange })
      .map(function (item) { return item.parameter }),
  }
}

/** 相图切片结果。 */
export interface PhaseSlice {
  xs: number[]
  ys: number[]
  grid: Verdict[][]
  counts: Record<Verdict, number>
}

/**
 * 二维相图切片：不追求单点答案，标出每个格子的状态。
 *
 * @param judge - 给定 (x, y) 判定状态
 * @param xRange - x 轴范围
 * @param yRange - y 轴范围
 * @param steps - 每轴采样点数
 * @returns 网格与各状态计数
 */
export function phaseSlice(
  judge: (x: number, y: number) => Verdict,
  xRange: [number, number],
  yRange: [number, number],
  steps = 7,
): PhaseSlice {
  const linspace = function (range: [number, number], count: number): number[] {
    const out: number[] = []
    for (let i = 0; i < count; i += 1) {
      out.push(range[0] + ((range[1] - range[0]) * i) / (count - 1))
    }
    return out
  }
  const xs = linspace(xRange, steps)
  const ys = linspace(yRange, steps)
  const grid: Verdict[][] = []
  const counts: Record<Verdict, number> = {
    allowed: 0, marginal: 0, forbidden: 0, pending: 0, narrative: 0,
  }
  for (const y of ys) {
    const row: Verdict[] = []
    for (const x of xs) {
      const verdict = judge(x, y)
      row.push(verdict)
      counts[verdict] += 1
    }
    grid.push(row)
  }
  return { xs: xs, ys: ys, grid: grid, counts: counts }
}

/** 检查表的一项。 */
export interface ChecklistItem {
  name: string
  pass: boolean
  note?: string
}

/** 推演卡（项目卡）：规格第 0 步要求的六项。 */
export interface ProjectCard {
  type: 'narrative' | 'regional' | 'rigorous' | 'cosmic'
  scope: string
  timeWindow: string
  observer: string
  priority: string
  outOfScope: string[]
}

/** 推演类型的中文说明。 */
export const PROJECT_TYPE_LABEL: Record<ProjectCard['type'], string> = {
  narrative: '叙事级', regional: '区域级', rigorous: '硬自洽级', cosmic: '宇宙级',
}

/** 版本记录条目：每次迭代保留旧版结论。 */
export interface VersionEntry {
  version: string
  changed: string[]
  affectedInterfaces: string[]
  conclusionChange: string
  pending: string[]
  nextTasks: string[]
}

/**
 * 渲染检查表文本（13 项，规格原文）。
 *
 * @param items - 各项检查结果
 * @returns 可直接输出的文本
 */
export function renderChecklist(items: ChecklistItem[]): string {
  const lines: string[] = ['【检查表】']
  for (const item of items) {
    lines.push('  ' + (item.pass ? '✓' : '✗') + ' ' + item.name + (item.note ? ' —— ' + item.note : ''))
  }
  const failed = items.filter(function (item) { return !item.pass }).length
  lines.push('')
  lines.push(failed === 0 ? '全部通过。' : failed + ' 项未通过，需修正后再发布。')
  return lines.join('\n')
}

/**
 * 内置接口卡库：按层组织的粗粒化变量。
 *
 * 每张卡都带「有效范围 / 约束类型 / 置信度 / 敏感度 / 叙事影响」，
 * 所以下游可以直接拿它做前向区间传播。
 *
 * 范围值取自现实宇宙的物理边界（如键能 1—10 eV 是化学反应的能量窗），
 * 架空世界若偏离这些值，就落进「边缘」或「禁止」区。
 */
export const INTERFACE_CARDS: Record<string, InterfaceCard[]> = {
  P1: [
    {
      name: '原子尺度',
      definition: '电子云半径的粗粒化值，决定化学的空间尺度',
      unit: 'm',
      dependsOn: ['me', 'e_charge', 'hbar', 'epsilon0'],
      range: { allowed: [5e-11, 3e-10], marginal: [3e-11, 5e-10] },
      kind: 'hard',
      confidence: 'high',
      sensitiveTo: ['me', 'alpha'],
      narrativeImpact: ['材料密度', '生物尺寸'],
      notes: '玻尔半径 5.29e-11 m 为现实基准；偏差 >2 倍化学性质会显著改变',
    },
    {
      name: '键能范围',
      definition: '化学键的能量尺度，决定反应是否可行',
      unit: 'eV',
      dependsOn: ['e_charge', 'epsilon0', 'hbar', 'c'],
      range: { allowed: [0.5, 10], marginal: [0.1, 30] },
      kind: 'hard',
      confidence: 'high',
      sensitiveTo: ['alpha', 'me'],
      narrativeImpact: ['是否有稳定分子', '代谢能量'],
      notes: '低于 0.1 eV 热扰动即断键；高于 30 eV 化学失去选择性',
    },
    {
      name: '稳定元素丰度',
      definition: '能稳定存在的元素比例',
      unit: '无量纲',
      dependsOn: ['alpha', 'mp/me'],
      range: { allowed: [0.2, 1.0], marginal: [0.05, 0.2] },
      kind: 'hard',
      confidence: 'medium',
      sensitiveTo: ['alpha'],
      narrativeImpact: ['化学多样性', '重核是否存在'],
      notes: 'α 偏离 ~2% 即影响碳氧核合成窗口',
    },
    {
      name: '主要溶剂相变点',
      definition: '常见溶剂的熔沸点',
      unit: 'K',
      dependsOn: ['键能范围'],
      range: { allowed: [200, 400], marginal: [100, 600] },
      kind: 'soft',
      confidence: 'medium',
      sensitiveTo: ['键能范围'],
      narrativeImpact: ['液态水能否存在'],
      notes: '水在 273—373 K；高压可展宽',
    },
    {
      name: '辐射吸收窗口',
      definition: '大气/物质对电磁辐射的透过率',
      unit: '无量纲',
      dependsOn: ['键能范围', '原子尺度'],
      range: { allowed: [0.3, 1.0], marginal: [0.1, 0.3] },
      kind: 'soft',
      confidence: 'low',
      sensitiveTo: ['键能范围'],
      narrativeImpact: ['视觉波长', '表面温度'],
      notes: '需与恒星辐射谱配合看',
    },
  ],
  P2: [
    {
      name: '材料强度密度比',
      definition: '抗拉强度 / 密度，决定结构能做到多大',
      unit: 'N·m/kg 或无量纲比值',
      dependsOn: ['键能范围', '原子尺度'],
      range: { allowed: [1e5, 1e7], marginal: [1e4, 1e8] },
      kind: 'hard',
      confidence: 'high',
      sensitiveTo: ['键能范围'],
      narrativeImpact: ['建筑高度', '生物体型'],
      notes: '钢材约 1e6；混凝土约 1e5',
    },
    {
      name: '代谢能尺度',
      definition: '单位质量可提取的化学能',
      unit: 'J/kg',
      dependsOn: ['键能范围'],
      range: { allowed: [1e6, 5e7], marginal: [1e5, 1e8] },
      kind: 'soft',
      confidence: 'medium',
      sensitiveTo: ['键能范围'],
      narrativeImpact: ['动物体型', '飞行能力'],
      notes: '糖约 1.6e7 J/kg',
    },
    {
      name: '热导与散热',
      definition: '热流密度能力',
      unit: 'W/(m·K)',
      dependsOn: ['键能范围', '原子尺度'],
      range: { allowed: [0.1, 400], marginal: [0.01, 1000] },
      kind: 'soft',
      confidence: 'medium',
      sensitiveTo: ['键能范围'],
      narrativeImpact: ['恒温动物是否可能'],
    },
  ],
  P3: [
    {
      name: '骨骼强度体重比',
      definition: '骨骼承载能力 / 体重（无量纲）',
      unit: '无量纲',
      dependsOn: ['材料强度密度比', 'g'],
      range: { allowed: [3, 100], marginal: [1.5, 300] },
      kind: 'hard',
      confidence: 'high',
      sensitiveTo: ['g', '材料强度密度比'],
      narrativeImpact: ['最大生物尺寸'],
      notes: '地球大象约 4—8；<1.5 则无法支撑自身',
    },
    {
      name: '身高大气标高比',
      definition: '个体高度 / 大气标高 H=kT/(mg)',
      unit: '无量纲',
      dependsOn: ['g', '温度', '摩尔质量'],
      range: { allowed: [1e-4, 1e-2], marginal: [1e-5, 1e-1] },
      kind: 'soft',
      confidence: 'medium',
      sensitiveTo: ['g', '温度'],
      narrativeImpact: ['高山缺氧', '飞行生态'],
    },
    {
      name: '反应时间重力比',
      definition: '神经反应时间 / 自由落体特征时间',
      unit: '无量纲',
      dependsOn: ['g', '生物尺度'],
      range: { allowed: [0.01, 10], marginal: [0.001, 100] },
      kind: 'soft',
      confidence: 'low',
      sensitiveTo: ['g'],
      narrativeImpact: ['能否接住下落物', '战斗节奏'],
    },
  ],
  P4: [
    {
      name: '大气逃逸率',
      definition: '热逃逸造成的质量损失率',
      unit: 'kg/s',
      dependsOn: ['行星质量', '半径', '温度', '恒星辐射'],
      range: { allowed: [0, 1e3], marginal: [1e3, 1e5] },
      kind: 'hard',
      confidence: 'medium',
      sensitiveTo: ['行星质量', '温度'],
      narrativeImpact: ['能否有大气'],
      notes: '超过 1e5 kg/s 时地质时间尺度内大气会散尽',
    },
    {
      name: '地质热流',
      definition: '单位面积散热功率',
      unit: 'W/m²',
      dependsOn: ['行星质量', '放射性元素丰度'],
      range: { allowed: [0.02, 0.2], marginal: [0.005, 1] },
      kind: 'soft',
      confidence: 'medium',
      sensitiveTo: ['行星质量'],
      narrativeImpact: ['板块运动', '火山活动'],
      notes: '地球约 0.087 W/m²',
    },
  ],

  P5: [
    {
      name: '恒星寿命',
      definition: '主序寿命 ≈ 0.007 M c² / L',
      unit: 'yr',
      dependsOn: ['恒星质量', '光度'],
      range: { allowed: [1e7, 1e11], marginal: [1e6, 1e12] },
      kind: 'hard',
      confidence: 'high',
      sensitiveTo: ['恒星质量'],
      narrativeImpact: ['文明演化时间', '大气形成'],
      notes: '太阳约 1e10 yr；<1e7 yr 不足以演化出复杂生命',
    },
    {
      name: '辐射谱峰值波长',
      definition: '黑体峰值波长 = b/T',
      unit: 'm',
      dependsOn: ['恒星温度', 'bWien'],
      range: { allowed: [3e-7, 2e-6], marginal: [1e-7, 1e-5] },
      kind: 'soft',
      confidence: 'high',
      sensitiveTo: ['恒星温度'],
      narrativeImpact: ['天空颜色', '光合作用窗口'],
      notes: '太阳约 5e-7 m（可见光）',
    },
  ],
}
