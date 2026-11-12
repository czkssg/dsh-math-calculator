/**
 * 推演栈：架空世界的分层推演框架。
 *
 * 把「常数一变连锁一切」拆成可管理的一叠层，每层只向下游暴露 5—10 个接口变量，
 * 避免无限下钻。这是本项目的核心方法论，不是普通计算器的扩展。
 *
 * ## 两层结构
 *
 * ```
 *   垂直：M0 元协议 → P0 基本 → P1 微观 → P2 介观 → P3 体感 → P4 行星 → P5 恒星 → P6 文明叙事
 *   水平：单位与观测者 / 不确定性与版本 / 时间与历史路径 / 约束分级
 * ```
 *
 * ## 三条铁律
 *
 * 1. 输出不是唯一答案：任何结论都带「允许 / 边缘 / 禁止 / 待定 / 叙事选择」。
 * 2. 真正追踪的是无量纲比值：同时缩放所有质量通常只是换了单位。
 * 3. 约束分级：硬约束 > 核心叙事锚点 > 软约束 > 细节设定。
 *
 * @module dsh-math-calculator/features/deduction/derivation-stack
 */

/** 结论状态。 */
export type Verdict = 'allowed' | 'marginal' | 'forbidden' | 'pending' | 'narrative'

/** 约束类型。 */
export type ConstraintKind = 'hard' | 'soft' | 'narrative'

/** 置信度。 */
export type Confidence = 'high' | 'medium' | 'low'

/** 状态标签。 */
export const VERDICT_LABEL: Record<Verdict, string> = {
  allowed: '允许',
  marginal: '边缘',
  forbidden: '禁止',
  pending: '待定',
  narrative: '叙事选择',
}

/** 约束类型标签。 */
export const CONSTRAINT_LABEL: Record<ConstraintKind, string> = {
  hard: '硬约束',
  soft: '软约束',
  narrative: '叙事约束',
}

/** 置信度标签。 */
export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: '高', medium: '中', low: '低' }

/** 推演层定义。 */
export interface StackLayer {
  id: string
  name: string
  question: string
  inputs: string[]
  outputs: string[]
  failureModes: string[]
}

/** 推演栈八层。多数架空世界只需 P1—P4 + 少量 P5。 */
export const STACK: StackLayer[] = [
  {
    id: 'M0',
    name: '元协议层',
    question: '推演到什么分辨率？给谁看？',
    inputs: ['目标', '范围', '观测者', '时间窗口'],
    outputs: ['推演卡', '约束优先级', '版本规则'],
    failureModes: ['目标不清会导致无限下钻'],
  },
  {
    id: 'P0',
    name: '基本层',
    question: '常数、对称性、初条件、边界条件是什么？',
    inputs: ['变更清单', '固定清单'],
    outputs: ['无量纲参数包', '稳定性边界'],
    failureModes: ['量纲错误', '忽略单位重定义', '微调脆弱'],
  },
  {
    id: 'P1',
    name: '微观有效层',
    question: '核、原子、分子、化学是否成立？',
    inputs: ['P0 参数包'],
    outputs: ['原子尺度', '键能范围', '稳定元素丰度', '主要溶剂相变点', '辐射吸收窗口', '反应速率温区'],
    failureModes: ['核不稳定', '碳氧窗口消失', '化学键能越界'],
  },
  {
    id: 'P2',
    name: '介观材料层',
    question: '材料、流体、热力学是否可用？',
    inputs: ['P1 接口'],
    outputs: ['材料强度密度比', '代谢能尺度', '热导与散热', '粘度', '可利用元素', '光窗口'],
    failureModes: ['无稳定材料', '无合适溶剂', '热力学窗口过窄'],
  },
  {
    id: 'P3',
    name: '宏观体感层',
    question: '生物力学、感知、本地单位是否成立？',
    inputs: ['P2 接口', '观测者设定'],
    outputs: ['骨骼强度体重比', '代谢产热散热比', '身高大气标高比', '感知窗口', '反应时间重力比'],
    failureModes: ['生物无法支撑', '散热失败', '感知窗口错位'],
  },
  {
    id: 'P4',
    name: '行星环境层',
    question: '地质、气候、大气、海洋是否可持续？',
    inputs: ['P1—P3 反馈'],
    outputs: ['大气逃逸率', '地质热流', '碳循环', '灾害频率'],
    failureModes: ['大气无法保留', '气候失控', '地质死寂'],
  },
  {
    id: 'P5',
    name: '恒星天文层',
    question: '恒星寿命、行星形成、辐射环境如何？',
    inputs: ['P0', 'P4 边界'],
    outputs: ['恒星寿命', '辐射谱', '行星形成概率', '轨道稳定性'],
    failureModes: ['恒星寿命不足', '辐射窗口不利', '行星无法形成'],
  },
  {
    id: 'P6',
    name: '文明叙事层',
    question: '技术、社会、历史是否自洽？',
    inputs: ['P2—P5 接口'],
    outputs: ['能源路径', '材料路径', '交通尺度', '城市规模', '灾害应对'],
    failureModes: ['技术路径依赖不存在的材料或能源'],
  },
]

/** 接口卡。 */
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
 * @param value - 待判定值
 * @param card - 接口卡
 * @returns 状态
 */
export function judgeRange(value: number, card: InterfaceCard): Verdict {
  if (!Number.isFinite(value)) return 'pending'
  const { allowed, marginal } = card.range
  if (allowed !== undefined && value >= allowed[0] && value <= allowed[1]) return 'allowed'
  if (marginal !== undefined && value >= marginal[0] && value <= marginal[1]) return 'marginal'
  if (allowed === undefined && marginal === undefined) return 'pending'
  return 'forbidden'
}

/**
 * 检测「单位重定义陷阱」。
 *
 * 同时把所有质量乘以同一因子通常不是物理变化，只是换了单位。
 * 只有一个量纲缩放时同理——除非无量纲比值确实变了。
 *
 * @param changes - 各量纲的缩放因子
 * @returns 判定与说明
 */
export function detectUnitRedefinition(changes: Record<string, number>): {
  isUnitRedefinition: boolean
  reason: string
} {
  const entries = Object.entries(changes).filter((entry) => Number.isFinite(entry[1]) && entry[1] !== 0)
  if (entries.length === 0) return { isUnitRedefinition: false, reason: '没有有效变更。' }
  if (entries.length === 1) {
    return {
      isUnitRedefinition: true,
      reason:
        '只缩放了一个量纲（' + entries[0][0] + ' × ' + entries[0][1] + '）。若无量纲比值全部不变，' +
        '这只是换了单位，不是物理变化。请改追踪无量纲组合（如 α、mp/me）。',
    }
  }
  const factors = entries.map((entry) => entry[1])
  const first = factors[0]
  const allSame = factors.every((f) => Math.abs(f - first) < 1e-9)
  if (allSame) {
    return {
      isUnitRedefinition: true,
      reason:
        '所有量纲都乘以同一因子 ' + first + '，等价于整体换算单位，物理世界没有变化。请改追踪无量纲比值。',
    }
  }
  return { isUnitRedefinition: false, reason: '多个量纲以不同比例变化，构成真实物理变化。' }
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
 * 四个核心无量纲量。现实值也用同一组公式从现实常数算，不写死数字。
 *
 * @param constants - 已解析的常数表
 * @returns 各量与偏差
 */
export function dimensionlessPack(constants: Record<string, number>): DimensionlessPack[] {
  const pick = (name: string, fallback: number): number => {
    const value = constants[name]
    return typeof value === 'number' && Number.isFinite(value) && value !== 0 ? value : fallback
  }
  const c = pick('c', 299792458)
  const hbar = pick('hbar', 1.054571817e-34)
  const e = pick('e_charge', 1.602176634e-19)
  const me = pick('me', 9.1093837015e-31)
  const mp = pick('mp', 1.67262192369e-27)
  const G = pick('G', 6.6743e-11)
  const epsilon0 = pick('epsilon0', 8.8541878128e-12)

  const alpha = (e * e) / (4 * Math.PI * epsilon0 * hbar * c)
  const mpMe = mp / me
  const alphaG = (G * mp * mp) / (hbar * c)
  const gravityOverEm = alphaG / alpha

  /** 现实值：同一组公式 + 现实常数。 */
  const REAL = {
    alpha: (1.602176634e-19 ** 2) / (4 * Math.PI * 8.8541878128e-12 * 1.054571817e-34 * 299792458),
    mpMe: 1.67262192369e-27 / 9.1093837015e-31,
  }
  const realAlphaG = (6.6743e-11 * 1.67262192369e-27 ** 2) / (1.054571817e-34 * 299792458)

  const packs: Array<{ name: string; meaning: string; standard: number; current: number }> = [
    { name: 'alpha', meaning: '精细结构常数 —— 电磁力相对强弱', standard: REAL.alpha, current: alpha },
    { name: 'mp/me', meaning: '质子电子质量比 —— 物质与化学的尺标', standard: REAL.mpMe, current: mpMe },
    { name: 'alphaG', meaning: '引力耦合常数 —— 引力为何可忽略', standard: realAlphaG, current: alphaG },
    { name: 'gravity/em', meaning: '引力与电磁力强度比', standard: realAlphaG / REAL.alpha, current: gravityOverEm },
  ]
  return packs.map((pack) => ({
    ...pack,
    deviation: pack.standard === 0 ? 0 : (pack.current - pack.standard) / pack.standard,
  }))
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
 * 一阶敏感性：扰动输入，看结论被放大多少倍。
 *
 * @param evaluate - 输入到结论的函数
 * @param base - 基线输入
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
    const perturbed = evaluate(base * (1 + sign * epsilon))
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
    items.push({ parameter: 'x' + (sign > 0 ? '+' : '-') + (epsilon * 100).toFixed(0) + '%', baseline, perturbed, relativeChange, verdict, note })
  }
  const worst = Math.max(...items.map((item) => item.relativeChange))
  return {
    epsilon,
    items,
    fineTuningWarning: worst > narrowThreshold,
    ranking: items.slice().sort((a, b) => b.relativeChange - a.relativeChange).map((item) => item.parameter),
  }
}

/** 相图切片。 */
export interface PhaseSlice {
  xs: number[]
  ys: number[]
  grid: Verdict[][]
  counts: Record<Verdict, number>
}

/**
 * 二维相图切片：不追求单点答案，标出每格状态。
 *
 * @param judge - 判定函数
 * @param xRange - x 范围
 * @param yRange - y 范围
 * @param steps - 每轴采样数
 * @returns 网格与计数
 */
export function phaseSlice(
  judge: (x: number, y: number) => Verdict,
  xRange: [number, number],
  yRange: [number, number],
  steps = 7,
): PhaseSlice {
  const lin = (range: [number, number], count: number): number[] => {
    const out: number[] = []
    const safe = Math.max(2, count)
    for (let i = 0; i < safe; i += 1) out.push(range[0] + ((range[1] - range[0]) * i) / (safe - 1))
    return out
  }
  const xs = lin(xRange, steps)
  const ys = lin(yRange, steps)
  const grid: Verdict[][] = []
  const counts: Record<Verdict, number> = { allowed: 0, marginal: 0, forbidden: 0, pending: 0, narrative: 0 }
  for (const y of ys) {
    const row: Verdict[] = []
    for (const x of xs) {
      const verdict = judge(x, y)
      row.push(verdict)
      counts[verdict] += 1
    }
    grid.push(row)
  }
  return { xs, ys, grid, counts }
}

/** 检查表一项。 */
export interface ChecklistItem {
  name: string
  pass: boolean
  note?: string
}

/**
 * 生成检查表 13 项（规格原文）。
 *
 * @returns 检查项
 */
export function buildChecklist(): ChecklistItem[] {
  return [
    { name: '量纲一致', pass: true },
    { name: '单位一致', pass: true },
    { name: '已无量纲化', pass: true },
    { name: '极限行为合理', pass: true },
    { name: '守恒律未被违反', pass: true },
    { name: '稳定性边界已查', pass: true },
    { name: '标度律未越界', pass: true },
    { name: '反馈时间尺度已分', pass: false, note: '待填：快变量与慢变量' },
    { name: '观测者已声明', pass: false, note: '待填：人类 / 本地智慧 / 上帝视角' },
    { name: '硬约束无冲突', pass: true },
    { name: '叙事锚点有反推窗口', pass: false, note: '待填：锚点与反推结果' },
    { name: '待定项明确', pass: true },
    { name: '版本可追溯', pass: false, note: '待填：本轮版本号' },
  ]
}

/**
 * 内置接口卡库（数据资产：现实宇宙的物理边界）。
 *
 * 范围值取自现实宇宙：架空世界偏离这些值，就落进「边缘」或「禁止」区。
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
