/**
 * 物理量的分类与缩放律。
 *
 * 需求背景（这是之前漏掉的一层）：
 * constants-graph 只跟踪「常数」，但真正参与计算的是「物理量」——
 * 质量、长度、时间、能量、原子半径、化学键能……
 * 改一个常数之后，这些量里**有些必须跟着变，有些绝不能变**。
 *
 * 本模块把物理量分成四类：
 *
 *   fundamental  基础常数 —— 用户拨的旋钮（c、G、h、m_e…）
 *   derived      导出量 —— **必须跟着常数变**，由公式严格决定
 *                （普朗克长度、玻尔半径、里德堡能量…）
 *   setting      设定量 —— **用户自由选择，绝不自动变**
 *                （行星半径、恒星质量、自转周期…）
 *   bounded      受限量 —— 用户选择，但有物理上限；上限本身随常数变
 *                （生物体型上限、建筑高度上限…）
 *
 * 为什么这样分：如果不区分，改 G 之后系统会去"自动修正"行星质量，
 * 那等于篡改创作者的选择。正确做法是：设定量不动，
 * 但告诉你"在你这个设定下，现在的物理上限变了吗、是否已越界"。
 *
 * 「该不该变」的判据是**量纲分析**：对每个导出量算
 *   ∂ln Q / ∂ln 常数
 * 这个指数就是「该常数变 1%，这个量变多少%」。
 * 指数为 0 说明该量与该常数无关——此时强行让它变才是错的。
 *
 * @module dsh-math-calculator/quantities
 */

/** 物理量分类。 */
export type QuantityCategory = 'fundamental' | 'derived' | 'setting' | 'bounded'

/** 一个物理量。 */
export interface QuantityDef {
  /** 标识。 */
  id: string
  /** 中文名。 */
  name: string
  /** 符号。 */
  symbol: string
  /** 单位。 */
  unit: string
  /** 分类。 */
  category: QuantityCategory
  /** 说明。 */
  meaning: string
  /** 现实值。 */
  standard: number
  /**
   * 求值函数：给定常数表返回该量的值。
   * - derived 类必须有
   * - setting 类用常数表原样返回 standard（不受常数影响）
   * - bounded 类返回上限
   */
  compute: (constants: Record<string, number>) => number
  /** 依赖哪些常数（由量纲分析自动算出，这里只写主要依赖供展示）。 */
  primaryDependencies: string[]
  /** 该量对读者的可见性（用于排序展示）。 */
  visibility?: 'high' | 'medium' | 'low'
}

/** 现实常数表（只列本模块用到的）。 */
const REAL = {
  c: 299792458,
  G: 6.6743e-11,
  h: 6.62607015e-34,
  hbar: 6.62607015e-34 / (2 * Math.PI),
  kB: 1.380649e-23,
  e_charge: 1.602176634e-19,
  me: 9.1093837015e-31,
  mp: 1.67262192369e-27,
  NA: 6.02214076e23,
  epsilon0: 8.8541878128e-12,
  sigma: 5.670374419e-8,
  Msun: 1.98892e30,
  Rsun: 695700000,
  Mearth: 5.9722e24,
  Rearth: 6371000,
  g: 9.80665,
}

/** 取常数或现实默认。 */
function pick(constants: Record<string, number>, name: keyof typeof REAL): number {
  // REAL 是内部常量表；constants 里可能含同名覆盖值
  const value = constants[name]
  return typeof value === 'number' && Number.isFinite(value) ? value : REAL[name]
}

/** 取 hbar（若常数表给了 hbar 用它，否则由 h 推）。 */
function pickHbar(constants: Record<string, number>): number {
  if (typeof constants.hbar === 'number' && Number.isFinite(constants.hbar)) return constants.hbar
  return pick(constants, 'h') / (2 * Math.PI)
}

/**
 * 物理量注册表。
 *
 * 每个 derived 量的 compute 直接写成基本常数的表达式 —— 这是它的定义，
 * 不含任何"经验拟合"，所以缩放指数是严格正确的。
 */
export const QUANTITIES: QuantityDef[] = [
  // ════════════════════════════════════════════════
  // 一、导出量：必须跟着常数变
  // ════════════════════════════════════════════════

  // ── 普朗克单位（量子引力尺度）──
  {
    id: 'planckLength',
    name: '普朗克长度',
    symbol: 'l_P',
    unit: 'm',
    category: 'derived',
    meaning: '量子引力效应变得重要的长度尺度 = √(ħG/c³)。',
    standard: 1.616255e-35,
    primaryDependencies: ['hbar', 'G', 'c'],
    compute: (k) => Math.sqrt((pickHbar(k) * pick(k, 'G')) / pick(k, 'c') ** 3),
  },
  {
    id: 'planckMass',
    name: '普朗克质量',
    symbol: 'm_P',
    unit: 'kg',
    category: 'derived',
    meaning: '基本粒子质量的自然上限尺度 = √(ħc/G)。',
    standard: 2.176434e-8,
    primaryDependencies: ['hbar', 'c', 'G'],
    compute: (k) => Math.sqrt((pickHbar(k) * pick(k, 'c')) / pick(k, 'G')),
  },
  {
    id: 'planckTime',
    name: '普朗克时间',
    symbol: 't_P',
    unit: 's',
    category: 'derived',
    meaning: '最小有意义的时间间隔 = √(ħG/c⁵)。',
    standard: 5.391247e-44,
    primaryDependencies: ['hbar', 'G', 'c'],
    compute: (k) => Math.sqrt((pickHbar(k) * pick(k, 'G')) / pick(k, 'c') ** 5),
  },
  {
    id: 'planckEnergy',
    name: '普朗克能量',
    symbol: 'E_P',
    unit: 'J',
    category: 'derived',
    meaning: '√(ħc⁵/G)。',
    standard: 1.9561e9,
    primaryDependencies: ['hbar', 'c', 'G'],
    compute: (k) => Math.sqrt((pickHbar(k) * pick(k, 'c') ** 5) / pick(k, 'G')),
  },
  {
    id: 'planckTemperature',
    name: '普朗克温度',
    symbol: 'T_P',
    unit: 'K',
    category: 'derived',
    meaning: '√(ħc⁵/(Gk_B²))。超过它现有物理失效。',
    standard: 1.416784e32,
    primaryDependencies: ['hbar', 'c', 'G', 'kB'],
    compute: (k) =>
      Math.sqrt((pickHbar(k) * pick(k, 'c') ** 5) / (pick(k, 'G') * pick(k, 'kB') ** 2)),
  },

  // ── 原子尺度（读者能间接感知：物质密度、化学反应）──
  {
    id: 'bohrRadius',
    name: '玻尔半径',
    symbol: 'a₀',
    unit: 'm',
    category: 'derived',
    meaning: '氢原子基态半径 = 4πε₀ħ²/(m_e e²)。**注意它不含 c** —— 改光速不会改变原子大小。',
    standard: 5.29177210903e-11,
    primaryDependencies: ['epsilon0', 'hbar', 'me', 'e_charge'],
    visibility: 'high',
    compute: (k) =>
      (4 * Math.PI * pick(k, 'epsilon0') * pickHbar(k) ** 2) /
      (pick(k, 'me') * pick(k, 'e_charge') ** 2),
  },
  {
    id: 'rydbergEnergy',
    name: '里德堡能量',
    symbol: 'Ry',
    unit: 'J',
    category: 'derived',
    meaning: 'm_e e⁴/(8ε₀²h²)。化学键能的标尺 —— 它变了，所有化学都变。',
    standard: 2.1798723611035e-18,
    primaryDependencies: ['me', 'e_charge', 'epsilon0', 'h'],
    visibility: 'high',
    compute: (k) =>
      (pick(k, 'me') * pick(k, 'e_charge') ** 4) /
      (8 * pick(k, 'epsilon0') ** 2 * pick(k, 'h') ** 2),
  },
  {
    id: 'fineStructure',
    name: '精细结构常数',
    symbol: 'α',
    unit: '无量纲',
    category: 'derived',
    meaning: 'e²/(4πε₀ħc)。决定电磁力相对强弱；偏离 4% 碳就无法合成。',
    standard: 7.2973525693e-3,
    primaryDependencies: ['e_charge', 'epsilon0', 'hbar', 'c'],
    visibility: 'high',
    compute: (k) =>
      (pick(k, 'e_charge') ** 2) /
      (4 * Math.PI * pick(k, 'epsilon0') * pickHbar(k) * pick(k, 'c')),
  },
  {
    id: 'classicalElectronRadius',
    name: '经典电子半径',
    symbol: 'r_e',
    unit: 'm',
    category: 'derived',
    meaning: 'e²/(4πε₀m_e c²)。',
    standard: 2.8179403262e-15,
    primaryDependencies: ['e_charge', 'epsilon0', 'me', 'c'],
    compute: (k) =>
      (pick(k, 'e_charge') ** 2) /
      (4 * Math.PI * pick(k, 'epsilon0') * pick(k, 'me') * pick(k, 'c') ** 2),
  },
  {
    id: 'comptonWavelength',
    name: '电子康普顿波长',
    symbol: 'λ_C',
    unit: 'm',
    category: 'derived',
    meaning: 'h/(m_e c)。量子与相对论效应交接的尺度。',
    standard: 2.42631023867e-12,
    primaryDependencies: ['h', 'me', 'c'],
    compute: (k) => pick(k, 'h') / (pick(k, 'me') * pick(k, 'c')),
  },
  {
    id: 'nuclearLengthScale',
    name: '核力长度尺度',
    symbol: 'λ_N',
    unit: 'm',
    category: 'derived',
    meaning: 'ħ/(m_p c)。约 0.2 fm，决定原子核大小。',
    standard: 2.1030891e-16,
    primaryDependencies: ['hbar', 'mp', 'c'],
    compute: (k) => pickHbar(k) / (pick(k, 'mp') * pick(k, 'c')),
  },
  {
    id: 'atomicMassUnit',
    name: '原子质量单位',
    symbol: 'u',
    unit: 'kg',
    category: 'derived',
    meaning: '≈ m_p（忽略结合能）。改质子质量会改变所有元素的绝对质量。',
    standard: 1.66053906660e-27,
    primaryDependencies: ['mp'],
    visibility: 'high',
    // 1u = m_p / 1.007276466621（质子比原子质量单位重 0.727%，因核结合能）
    compute: (k) => pick(k, 'mp') / 1.007276466621,
  },
  {
    id: 'molarMassConstant',
    name: '摩尔质量常数',
    symbol: 'M_u',
    unit: 'kg/mol',
    category: 'derived',
    meaning: '10⁻³/N_A。',
    standard: 1e-3 / 6.02214076e23,
    primaryDependencies: ['NA'],
    compute: (k) => 1e-3 / pick(k, 'NA'),
  },

  // ── 热学与统计 ──
  {
    id: 'stefanBoltzmann',
    name: '斯特藩-玻尔兹曼常数',
    symbol: 'σ',
    unit: 'W/(m²·K⁴)',
    category: 'derived',
    meaning: '2π⁵k_B⁴/(15h³c²)。',
    standard: 5.670374419e-8,
    primaryDependencies: ['kB', 'h', 'c'],
    visibility: 'high',
    compute: (k) =>
      (2 * Math.PI ** 5 * pick(k, 'kB') ** 4) / (15 * pick(k, 'h') ** 3 * pick(k, 'c') ** 2),
  },
  {
    id: 'gasConstant',
    name: '通用气体常数',
    symbol: 'R',
    unit: 'J/(mol·K)',
    category: 'derived',
    meaning: 'k_B·N_A。',
    standard: 8.314462618,
    primaryDependencies: ['kB', 'NA'],
    compute: (k) => pick(k, 'kB') * pick(k, 'NA'),
  },
  {
    id: 'faradayConstant',
    name: '法拉第常数',
    symbol: 'F',
    unit: 'C/mol',
    category: 'derived',
    meaning: 'N_A·e。电化学计量。',
    standard: 96485.33212,
    primaryDependencies: ['NA', 'e_charge'],
    compute: (k) => pick(k, 'NA') * pick(k, 'e_charge'),
  },
  {
    id: 'thermalWavelength',
    name: '室温热德布罗意波长',
    symbol: 'λ_th',
    unit: 'm',
    category: 'derived',
    meaning: 'h/√(2πm_e k_B T)，T=300K。量子效应在室温是否显著。',
    standard: 4.303475e-9,
    primaryDependencies: ['h', 'me', 'kB'],
    compute: (k) => pick(k, 'h') / Math.sqrt(2 * Math.PI * pick(k, 'me') * pick(k, 'kB') * 300),
  },

  // ── 引力与天体（对给定质量的依赖关系）──
  {
    id: 'schwarzschildPerKg',
    name: '史瓦西半径（每 kg）',
    symbol: 'r_s/M',
    unit: 'm/kg',
    category: 'derived',
    meaning: '2G/c²。同一质量压缩到多小才成黑洞。',
    standard: 2 * 6.6743e-11 / 299792458 ** 2,
    primaryDependencies: ['G', 'c'],
    visibility: 'high',
    compute: (k) => (2 * pick(k, 'G')) / pick(k, 'c') ** 2,
  },
  {
    id: 'gravitationalTimeScale',
    name: '引力时间尺度（每 kg·s²/m³）',
    symbol: 'G',
    unit: 'm³/(kg·s²)',
    category: 'derived',
    meaning: '引力耦合强度本身。',
    standard: 6.6743e-11,
    primaryDependencies: ['G'],
    compute: (k) => pick(k, 'G'),
  },

  // ════════════════════════════════════════════════
  // 二、设定量：用户自由选择，绝不自动变
  // ════════════════════════════════════════════════
  {
    id: 'planetRadius',
    name: '行星半径',
    symbol: 'R_p',
    unit: 'm',
    category: 'setting',
    meaning: '你设定的行星大小。改 G 不会改变它 —— 这是创作选择。',
    standard: 6371000,
    primaryDependencies: [],
    visibility: 'high',
    compute: (k) => pick(k, 'Rearth'),
  },
  {
    id: 'planetMass',
    name: '行星质量',
    symbol: 'M_p',
    unit: 'kg',
    category: 'setting',
    meaning: '你设定的行星质量。不受常数影响。',
    standard: 5.9722e24,
    primaryDependencies: [],
    visibility: 'high',
    compute: (k) => pick(k, 'Mearth'),
  },
  {
    id: 'starMass',
    name: '恒星质量',
    symbol: 'M_*',
    unit: 'kg',
    category: 'setting',
    meaning: '你设定的恒星质量。不受常数影响。',
    standard: 1.98892e30,
    primaryDependencies: [],
    visibility: 'high',
    compute: (k) => pick(k, 'Msun'),
  },
  {
    id: 'starRadius',
    name: '恒星半径',
    symbol: 'R_*',
    unit: 'm',
    category: 'setting',
    meaning: '你设定的恒星大小。',
    standard: 695700000,
    primaryDependencies: [],
    compute: (k) => pick(k, 'Rsun'),
  },
  {
    id: 'rotationPeriod',
    name: '自转周期',
    symbol: 'P_rot',
    unit: 's',
    category: 'setting',
    meaning: '你设定的一天长度。与常数无关。',
    standard: 86164,
    primaryDependencies: [],
    visibility: 'high',
    compute: () => 86164,
  },
  {
    id: 'axialTilt',
    name: '轴倾角',
    symbol: 'ε',
    unit: 'rad',
    category: 'setting',
    meaning: '你设定的季节强度来源。',
    standard: 0.4091,
    primaryDependencies: [],
    compute: () => 0.4091,
  },

  // ════════════════════════════════════════════════
  // 三、受限量：用户选择，但有物理上限（上限随常数变）
  // ════════════════════════════════════════════════
  {
    id: 'surfaceGravity',
    name: '表面重力',
    symbol: 'g',
    unit: 'm/s²',
    category: 'bounded',
    meaning: 'G·M_p/R_p²。由你设定的行星质量和半径 + G 共同决定。改 G 会改变它。',
    standard: 9.80665,
    primaryDependencies: ['G', 'Mearth', 'Rearth'],
    visibility: 'high',
    compute: (k) => (pick(k, 'G') * pick(k, 'Mearth')) / pick(k, 'Rearth') ** 2,
  },
  {
    id: 'maxBodySize',
    name: '陆生生物体型上限',
    symbol: 'L_max',
    unit: 'm',
    category: 'bounded',
    meaning: '∝ 1/g（平方立方定律）。地球约 10m（按承重），实际远小。改重力会改这个上限。',
    standard: 10,
    primaryDependencies: ['G', 'Mearth', 'Rearth'],
    visibility: 'high',
    compute: (k) => {
      const g = (pick(k, 'G') * pick(k, 'Mearth')) / pick(k, 'Rearth') ** 2
      return 10 * (REAL.g / g)
    },
  },
  {
    id: 'maxMountainHeight',
    name: '山峰高度上限',
    symbol: 'h_max',
    unit: 'm',
    category: 'bounded',
    meaning: '材料强度/(ρg)。地球约 4900m。高重力世界山更矮。',
    standard: 4900,
    primaryDependencies: ['G', 'Mearth', 'Rearth'],
    compute: (k) => {
      const g = (pick(k, 'G') * pick(k, 'Mearth')) / pick(k, 'Rearth') ** 2
      return 4900 * (REAL.g / g)
    },
  },
  {
    id: 'maxBuildingHeight',
    name: '建筑高度上限',
    symbol: 'H_max',
    unit: 'm',
    category: 'bounded',
    meaning: '材料抗压强度/(ρg)。地球花岗岩约 4900m。',
    standard: 4900,
    primaryDependencies: ['G', 'Mearth', 'Rearth'],
    compute: (k) => {
      const g = (pick(k, 'G') * pick(k, 'Mearth')) / pick(k, 'Rearth') ** 2
      return 4900 * (REAL.g / g)
    },
  },
  {
    id: 'escapeVelocity',
    name: '逃逸速度',
    symbol: 'v_esc',
    unit: 'm/s',
    category: 'bounded',
    meaning: '√(2GM_p/R_p)。改 G 或改行星质量都会变。',
    standard: 11186,
    primaryDependencies: ['G', 'Mearth', 'Rearth'],
    visibility: 'high',
    compute: (k) => Math.sqrt((2 * pick(k, 'G') * pick(k, 'Mearth')) / pick(k, 'Rearth')),
  },
  {
    id: 'atomicDensityScale',
    name: '普通物质密度标尺',
    symbol: 'ρ_atom',
    unit: 'kg/m³',
    category: 'bounded',
    meaning: '近似 ≈ m_p/a₀³。改原子半径会改变所有固体的密度。',
    standard: 2000,
    primaryDependencies: ['mp', 'epsilon0', 'hbar', 'me', 'e_charge'],
    compute: (k) => {
      const a0 =
        (4 * Math.PI * pick(k, 'epsilon0') * pickHbar(k) ** 2) /
        (pick(k, 'me') * pick(k, 'e_charge') ** 2)
      return pick(k, 'mp') / a0 ** 3
    },
  },
]

/** 按 id 索引。 */
export const QUANTITY_INDEX: Map<string, QuantityDef> = new Map(
  QUANTITIES.map((quantity) => [quantity.id, quantity]),
)

/** 分类标签。 */
export const CATEGORY_LABEL: Record<QuantityCategory, string> = {
  fundamental: '基础常数（旋钮）',
  derived: '导出量（必须跟着常数变）',
  setting: '设定量（你自由选择，不会自动变）',
  bounded: '受限量（有物理上限，上限随常数变）',
}

/** 一个量的缩放信息。 */
export interface ScalingInfo {
  id: string
  name: string
  symbol: string
  unit: string
  category: QuantityCategory
  /** 现实值。 */
  standard: number
  /** 改动后的值。 */
  altered: number
  /** 倍数。 */
  ratio: number
  /** 相对变化。 */
  relativeChange: number
  /** 是否因常数改变而变化。 */
  changed: boolean
}

/**
 * 计算所有物理量在给定常数表下的值，并与现实对比。
 *
 * @param constants - 改动后的常数表
 * @returns 每一类的缩放情况
 */
export function computeQuantities(constants: Record<string, number>): {
  derived: ScalingInfo[]
  setting: ScalingInfo[]
  bounded: ScalingInfo[]
} {
  const baseline: Record<string, number> = {} as Record<string, number>
  for (const [key, value] of Object.entries(REAL)) baseline[key] = value

  const classify = (quantity: QuantityDef): ScalingInfo => {
    const standardValue = quantity.compute(baseline)
    const alteredValue = quantity.compute({ ...baseline, ...constants })
    const ratio = standardValue === 0 ? 1 : alteredValue / standardValue
    return {
      id: quantity.id,
      name: quantity.name,
      symbol: quantity.symbol,
      unit: quantity.unit,
      category: quantity.category,
      standard: standardValue,
      altered: alteredValue,
      ratio,
      relativeChange: ratio - 1,
      changed: Math.abs(ratio - 1) > 1e-9,
    }
  }

  return {
    derived: QUANTITIES.filter((q) => q.category === 'derived').map(classify),
    setting: QUANTITIES.filter((q) => q.category === 'setting').map(classify),
    bounded: QUANTITIES.filter((q) => q.category === 'bounded').map(classify),
  }
}

/**
 * 用数值微分算缩放指数：∂ln Q / ∂ln k。
 *
 * 这个指数回答「k 变 1%，Q 变多少%」——
 * 指数 0 说明 Q 与 k 无关（此时强制让它变才是错的）；
 * 指数 +1 说明正比；-2 说明平方反比。
 *
 * 做法：对每个常数做 ±0.01% 的扰动，取对数差。
 */
export function scalingExponent(
  quantity: QuantityDef,
  constantName: string,
  constants: Record<string, number> = {},
): number {
  const base: Record<string, number> = { ...REAL, ...constants }
  const current = base[constantName]
  if (typeof current !== 'number' || !Number.isFinite(current) || current === 0) return 0

  const epsilon = 1e-4
  const baseValue = quantity.compute(base)
  if (!Number.isFinite(baseValue) || baseValue === 0) return Number.NaN

  const up = quantity.compute({ ...base, [constantName]: current * (1 + epsilon) })
  const down = quantity.compute({ ...base, [constantName]: current * (1 - epsilon) })

  if (!Number.isFinite(up) || !Number.isFinite(down) || up <= 0 || down <= 0) return Number.NaN

  // 中心差分：d(lnQ)/d(lnk)
  return (Math.log(up) - Math.log(down)) / (Math.log(1 + epsilon) - Math.log(1 - epsilon))
}

/**
 * 计算某个常数对每个导出量的影响指数。
 * 用于回答「改这个常数，哪些量必须跟着变、变多少」。
 */
export function exponentsForConstant(
  constantName: string,
  constants: Record<string, number> = {},
): Array<{ quantity: QuantityDef; exponent: number }> {
  return QUANTITIES.filter((q) => q.category !== 'setting').map((quantity) => ({
    quantity,
    exponent: scalingExponent(quantity, constantName, constants),
  }))
}
