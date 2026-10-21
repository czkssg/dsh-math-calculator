/**
 * 从无量纲常数出发的尺度阶梯（ADR-0001 的 S1 落地）。
 *
 * 核心命题（这是本模块存在的理由）：
 *   **有量纲常数不是物理。** 单独改 c、G、h、kB，只要无量纲比值不变，
 *   宇宙的现象完全不变，只是换了一套单位。真正决定"世界长什么样"的是：
 *
 *     α     精细结构常数  1/137.036   —— 原子大小、化学键能、光与物质作用
 *     μ     mₚ/mₑ        1836.15     —— 化学多样性、物质稳定性
 *     α_s   强耦合        0.1179      —— 核力、元素是否存在
 *     α_G   G·mₚ²/(ħc)   5.9e-39     —— 引力相对强度、恒星与行星形成
 *
 * 本模块做三件事：
 *   1. 把现有 20 个"旋钮"分类：有量纲 / 派生 / 无量纲；
 *   2. 由 α、μ 推出尺度阶梯（原子半径、里德伯能量、键能、材料强度）；
 *   3. 判断一次"改常数"到底是换单位还是换物理，并给出等效的 α 变化。
 *
 * 精度策略（用户定的，见 ADR-0001）：精确公式优先；没有就经验公式；
 * 再不行就量级拟合。**每条结论都带 confidence，绝不静默外推。**
 *
 * @module dsh-math-calculator/constants-core
 */

/** 置信度标签：读者/作者据此判断这条能信几分。 */
export type Confidence = 'exact' | 'scaling' | 'order-of-magnitude'

/** 一条尺度结论。 */
export interface ScaleEntry {
  id: string
  name: string
  value: number
  unit: string
  confidence: Confidence
  /** 哪条公式/依据算出来的。 */
  formula: string
  /** 有效范围。超出只降级不拒绝。 */
  domain: string
}

/** 无量纲常数集。 */
export interface DimensionlessSet {
  /** 精细结构常数。 */
  alpha: number
  /** 质子/电子质量比。 */
  mu: number
  /** 强耦合常数（外生输入，本模型不推导）。 */
  alphaS: number
  /** 引力相对强度。 */
  alphaG: number
}

/** 有量纲基础常数（可调，但多数只是单位）。 */
export interface Knobs {
  /** 光速 m/s。 */
  c: number
  /** 约化普朗克常数 J·s。 */
  hbar: number
  /** 元电荷 C。 */
  e: number
  /** 真空介电常数 F/m。 */
  epsilon0: number
  /** 电子质量 kg。 */
  me: number
  /** 质子质量 kg。 */
  mp: number
  /** 引力常数 m³/(kg·s²)。 */
  G: number
}

/** 现实宇宙的常数取值（回归锚）。 */
export const OUR_KNOBS: Knobs = {
  c: 2.99792458e8,
  hbar: 1.054571817e-34,
  e: 1.602176634e-19,
  epsilon0: 8.8541878128e-12,
  me: 9.1093837015e-31,
  mp: 1.67262192369e-27,
  G: 6.6743e-11,
}

/** 现实宇宙的无量纲常数。 */
export const OUR_UNIVERSE: DimensionlessSet = {
  alpha: 1 / 137.035999084,
  mu: 1836.15267343,
  alphaS: 0.1179,
  alphaG: 5.9e-39,
}

/** 电子伏特 J。 */
const EV = 1.602176634e-19
/** 花岗岩抗压强度 Pa（唯一的地球标定锚点，用于给材料强度定量）。 */
const GRANITE_STRENGTH_PA = 1.3e8

/** 由有量纲常数算出无量纲常数。 */
export function dimensionlessFromKnobs(knobs: Knobs): Pick<DimensionlessSet, 'alpha' | 'mu' | 'alphaG'> {
  const alpha = (knobs.e ** 2) / (4 * Math.PI * knobs.epsilon0 * knobs.hbar * knobs.c)
  const mu = knobs.mp / knobs.me
  const alphaG = (knobs.G * knobs.mp ** 2) / (knobs.hbar * knobs.c)
  return { alpha, mu, alphaG }
}

/** 常数分类结果。 */
export interface KnobClass {
  name: string
  kind: 'dimensionful' | 'derived' | 'dimensionless' | 'astronomical-unit'
  /** 它对物理的实际影响。 */
  effect: string
}

/**
 * 对现有 20 个旋钮分类。
 *
 * 这份表就是"为什么不能直接改 c"的答案：真正改变物理的只有 dimensionless 那几个，
 * 其余要么是单位、要么是由它们派生的量。
 */
export function classifyKnobs(): KnobClass[] {
  return [
    { name: 'c', kind: 'dimensionful', effect: '只改单位尺度；单独改它会通过 α = e²/(4πε₀ħc) 间接改变物理' },
    { name: 'G', kind: 'dimensionful', effect: '通过 α_G 影响引力结构与恒星寿命' },
    { name: 'h', kind: 'dimensionful', effect: '单位尺度；通过 α 与量子尺度间接影响' },
    { name: 'kB', kind: 'dimensionful', effect: '只改温度单位的含义，不改变物理' },
    { name: 'e_charge', kind: 'dimensionful', effect: '通过 α 改变电磁作用强度' },
    { name: 'me', kind: 'dimensionful', effect: '通过 μ 与原子单位影响化学' },
    { name: 'mp', kind: 'dimensionful', effect: '通过 μ 与引力强度影响物质' },
    { name: 'NA', kind: 'dimensionful', effect: '只是摩尔定义的换算，不改变物理' },
    { name: 'epsilon0', kind: 'dimensionful', effect: '通过 α 改变电磁作用强度' },
    { name: 'hbar', kind: 'derived', effect: '由 h 派生' },
    { name: 'R', kind: 'derived', effect: '由 kB·NA 派生' },
    { name: 'mu0', kind: 'derived', effect: '由 α 与 ε₀ 派生' },
    { name: 'kCoulomb', kind: 'derived', effect: '由 ε₀ 派生' },
    { name: 'sigma', kind: 'derived', effect: '由 kB、h、c 派生' },
    { name: 'bWien', kind: 'derived', effect: '由 h、c、kB 派生' },
    { name: 'alpha_fs', kind: 'dimensionless', effect: '**真正的物理**：原子与化学的总开关' },
    { name: 'Ry', kind: 'derived', effect: '∝ α²·mₑc²，键能与光谱的能量标尺' },
    { name: 'muB', kind: 'derived', effect: '磁矩单位，随 α 与 mₑ 变化' },
    { name: 'year / day / AU / ly / pc / Rearth', kind: 'astronomical-unit', effect: '天文单位，由 G 与太阳质量决定' },
  ]
}

/** 一次常数变更的判定。 */
export interface ChangeReport {
  verdict: 'unit-only' | 'physical'
  alphaBefore: number
  alphaAfter: number
  /** α 的倍数变化。 */
  alphaRatio: number
  muBefore: number
  muAfter: number
  muRatio: number
  /** 等效的原子尺度倍数（a₀ ∝ 1/α）。 */
  atomicSizeRatio: number
  /** 等效的键能倍数（∝ α²）。 */
  bondEnergyRatio: number
  /** 给人看的一句话结论。 */
  note: string
}

/**
 * 判断"改常数"到底改了什么。
 *
 * 判据：只要 α 与 μ 不变，就是换单位；只要它们变了，就是换了物理。
 * 这条判据能拦住最常见的建模错误——"我把光速改成 1.5e8，世界就不一样了"。
 *
 * @param before - 变更前的有量纲常数。
 * @param after - 变更后的有量纲常数。
 */
export function analyzeConstantChange(before: Knobs, after: Knobs): ChangeReport {
  const a = dimensionlessFromKnobs(before)
  const b = dimensionlessFromKnobs(after)
  const alphaRatio = b.alpha / a.alpha
  const muRatio = b.mu / a.mu
  const alphaUnchanged = Math.abs(alphaRatio - 1) < 1e-9
  const muUnchanged = Math.abs(muRatio - 1) < 1e-9

  const atomicSizeRatio = 1 / alphaRatio
  const bondEnergyRatio = alphaRatio ** 2

  let verdict: ChangeReport['verdict']
  let note: string

  if (alphaUnchanged && muUnchanged) {
    verdict = 'unit-only'
    note = 'α 与 μ 都没变：这只是换了一套单位，物理现象完全不变。'
  } else {
    verdict = 'physical'
    const parts: string[] = []
    if (!alphaUnchanged) {
      parts.push(
        `α 变为原来的 ${alphaRatio.toFixed(4)} 倍 → 原子尺度 ${atomicSizeRatio.toFixed(3)} 倍、` +
          `键能 ${bondEnergyRatio.toFixed(3)} 倍、材料强度约 ${(alphaRatio ** 5).toFixed(2)} 倍`,
      )
    }
    if (!muUnchanged) {
      parts.push(`μ(mₚ/mₑ) 变为 ${muRatio.toFixed(3)} 倍 → 化学多样性与物质稳定性需要重新评估（本模型只给量级）`)
    }
    note = '这不是换单位，是真的换了物理：' + parts.join('；') + '。'
  }

  return {
    verdict,
    alphaBefore: a.alpha,
    alphaAfter: b.alpha,
    alphaRatio,
    muBefore: a.mu,
    muAfter: b.mu,
    muRatio,
    atomicSizeRatio,
    bondEnergyRatio,
    note,
  }
}

/** 未标定的材料强度（bondEnergy / a₀³，纯量纲估计）。 */
function rawStrength(ds: Pick<DimensionlessSet, 'alpha'>): number {
  const a0 = OUR_KNOBS.hbar / (OUR_KNOBS.me * OUR_KNOBS.c * ds.alpha)
  const bondEnergyJ = 0.5 * (0.5 * OUR_KNOBS.me * OUR_KNOBS.c ** 2 * ds.alpha ** 2)
  return bondEnergyJ / a0 ** 3
}

/** 标定因子：让"现实宇宙"恰好等于花岗岩的 1.3e8 Pa。 */
const STRENGTH_CALIBRATION = GRANITE_STRENGTH_PA / rawStrength(OUR_UNIVERSE)

/**
 * 由无量纲常数推尺度阶梯。
 *
 * 只有 α 与 μ 是输入；其余全是导出。这就是"从零点推演"的第一步：
 * 不再假设地球的原子大小、键能、材料强度，而是从 α 算出来。
 *
 * @param ds - 无量纲常数集（至少给 alpha）。
 * @returns 带置信度与适用域的尺度条目。
 */
export function deriveScaleLadder(ds: DimensionlessSet): ScaleEntry[] {
  const { alpha, mu } = ds
  const a0 = OUR_KNOBS.hbar / (OUR_KNOBS.me * OUR_KNOBS.c * alpha)
  const rydbergJ = 0.5 * OUR_KNOBS.me * OUR_KNOBS.c ** 2 * alpha ** 2
  const rydbergEv = rydbergJ / EV
  const bondEv = rydbergEv / 2
  const strength = rawStrength(ds) * STRENGTH_CALIBRATION

  return [
    {
      id: 'bohr-radius',
      name: '原子半径（玻尔半径）',
      value: a0,
      unit: 'm',
      confidence: 'exact',
      formula: 'a₀ = ħ/(mₑcα)',
      domain: 'α < 0.1（弱耦合成立）',
    },
    {
      id: 'rydberg-energy',
      name: '里德伯能量（氢电离能）',
      value: rydbergEv,
      unit: 'eV',
      confidence: 'exact',
      formula: 'Ry = ½mₑc²α²',
      domain: 'α < 0.1',
    },
    {
      id: 'bond-energy',
      name: '典型化学键能量',
      value: bondEv,
      unit: 'eV',
      confidence: 'order-of-magnitude',
      formula: '≈ Ry/2（量级估计，真实键能取决于分子）',
      domain: 'α 偏离现实 < 20%',
    },
    {
      id: 'material-strength',
      name: '材料抗压强度（花岗岩基准）',
      value: strength,
      unit: 'Pa',
      confidence: 'scaling',
      formula: 'S = S₀·(α/α₀)⁵，S₀ = 1.3e8 Pa（唯一地球标定点）',
      domain: 'α 偏离现实 < 50%；超出后晶体结构与缺陷力学不再可比',
    },
    {
      id: 'mountain-scale',
      name: '山峰高度特征尺度',
      value: strength / (2700 * 9.81),
      unit: 'm',
      confidence: 'order-of-magnitude',
      formula: 'h ≈ S/(ρg)，取地球岩石密度与重力',
      domain: '仅当星球重力与岩石密度接近地球时可直接用',
    },
    {
      id: 'chemistry-window',
      name: '化学多样性窗口（μ = mₚ/mₑ）',
      value: mu,
      unit: '无量纲',
      confidence: 'order-of-magnitude',
      formula: 'μ 现实 1836.15；偏离 > 10% 后元素丰度与有机化学需重估',
      domain: '本模型只判断"是否需要重估"，不给出新元素表',
    },
  ]
}

/** 与已知物理的冲突提示。 */
export function contradictionsOf(ds: DimensionlessSet): string[] {
  const out: string[] = []
  const alphaRatio = ds.alpha / OUR_UNIVERSE.alpha
  const muRatio = ds.mu / OUR_UNIVERSE.mu
  const gRatio = ds.alphaG / OUR_UNIVERSE.alphaG

  if (Math.abs(alphaRatio - 1) > 0.05) {
    out.push(
      `α 偏离现实 ${((alphaRatio - 1) * 100).toFixed(0)}%：原子尺度变为 ${(1 / alphaRatio).toFixed(2)} 倍，` +
        '化学键能与材料强度随之改变；所有"从地球标定"的经验公式（气候、潮汐、散射）都进入估算区。',
    )
  }
  if (Math.abs(muRatio - 1) > 0.1) {
    out.push(
      `μ(mₚ/mₑ) 偏离现实 ${((muRatio - 1) * 100).toFixed(0)}%：氢的稳定性、元素丰度与有机化学都可能不同；` +
        '本模型不覆盖这一层，只能提示"需要重估"。',
    )
  }
  if (Math.abs(gRatio - 1) > 0.1) {
    out.push(
      `α_G 偏离现实 ${((gRatio - 1) * 100).toFixed(0)}%：恒星形成、行星聚集与星系结构都会改变；` +
        '本模型只给"变化方向"，不给具体形态。',
    )
  }
  return out
}

/** 一句话总结这套常数下的宇宙。 */
export function describeUniverse(ds: DimensionlessSet): string {
  const ladder = deriveScaleLadder(ds)
  const a0 = ladder[0]
  const strength = ladder.find((x) => x.id === 'material-strength')
  const parts: string[] = []
  parts.push(`原子半径 ${a0.value.toExponential(2)} m（现实 5.29e-11）`)
  if (strength) parts.push(`材料强度约 ${strength.value.toExponential(2)} Pa（现实花岗岩 1.3e8）`)
  parts.push(`化学窗口 μ=${ds.mu.toFixed(1)}`)
  return parts.join('；') + '。'
}
