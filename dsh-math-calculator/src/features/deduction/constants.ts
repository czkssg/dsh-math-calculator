/**
 * 常数基准与无量纲推导。
 *
 * ## 为什么不是"直接读 constants-graph.json"
 *
 * v3 的分层是：数据（`src/data/*.json`）→ 逻辑（`features/*`）。
 * feature 不自己读文件，数据由调用方注入（见 `features/formulas/query.ts` 的同一约定）。
 * 所以这里只定义**现实基准**（回归锚）与推导式；工作区覆盖值由调用方以对象传入。
 *
 * ## 一个必须记住的边界
 *
 * 真正改变物理的是无量纲常数（α、μ、α_G），有量纲常数多数只是单位。
 * `alphaFromKnobs` 是那条唯一正确的换算路径；单独改 c 会通过它间接改 α。
 *
 * @module dsh-math-calculator/features/deduction/constants
 */

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

/** 现实宇宙的旋钮取值（回归锚）。 */
export const OUR_KNOBS: Knobs = {
  c: 2.99792458e8,
  hbar: 1.054571817e-34,
  e: 1.602176634e-19,
  epsilon0: 8.8541878128e-12,
  me: 9.1093837015e-31,
  mp: 1.67262192369e-27,
  G: 6.6743e-11,
}

/** 精细结构常数（现实值）。 */
export const ALPHA_REAL = 1 / 137.035999084

/** 质子/电子质量比（现实值）。 */
export const MU_REAL = 1836.15267343

/** 花岗岩抗压强度（唯一的地球标定锚点）。 */
export const GRANITE_STRENGTH_PA = 1.3e8

/**
 * 由有量纲常数算无量纲常数。
 *
 * α = e²/(4πε₀ħc)。这是"改常数到底改了什么"的唯一判据：
 * 只有 α 与 μ 进入物理结论，其余量要么是单位、要么是派生量。
 *
 * @param knobs - 有量纲常数
 * @returns α / μ / α_G
 */
export function dimensionlessFromKnobs(knobs: Knobs): { alpha: number; mu: number; alphaG: number } {
  const alpha = knobs.e ** 2 / (4 * Math.PI * knobs.epsilon0 * knobs.hbar * knobs.c)
  const mu = knobs.mp / knobs.me
  const alphaG = (knobs.G * knobs.mp ** 2) / (knobs.hbar * knobs.c)
  return { alpha, mu, alphaG }
}

/**
 * 材料抗压强度（标度关系，唯一标定点 1.3e8 Pa）。
 *
 * S = S₀·(α/α₀)⁵。五次方来自：键能 ∝ α²，键密度 ∝ a₀⁻³ ∝ α³。
 * 现实常数下返回 1.3e8 —— 与老插件一致，不改变既有 world 输出。
 *
 * @param alpha - 当前的精细结构常数
 * @returns 抗压强度（Pa）
 */
export function materialStrengthFromAlpha(alpha: number): number {
  return GRANITE_STRENGTH_PA * (alpha / ALPHA_REAL) ** 5
}

/** 物理计算常用的基准值（SI）。 */
export const BASE_PHYSICS = {
  /** 斯特藩-玻尔兹曼常数 W/(m²·K⁴)。 */
  sigma: 5.670374419e-8,
  /** 气体常数 J/(mol·K)。 */
  R: 8.314462618,
  /** 天文单位 m。 */
  AU: 1.495978707e11,
  /** 太阳质量 kg。 */
  Msun: 1.98847e30,
  /** 太阳半径 m。 */
  Rsun: 6.957e8,
  /** 太阳光度 W。 */
  Lsun: 3.828e26,
  /** 地球质量 kg。 */
  Mearth: 5.9722e24,
  /** 地球半径 m。 */
  Rearth: 6.371e6,
  /** 地球表面重力 m/s²。 */
  g: 9.80665,
  /** 维恩常数 m·K。 */
  bWien: 2.897771955e-3,
  /** 真空光速 m/s。 */
  c: 2.99792458e8,
  /** 普朗克常数 J·s。 */
  h: 6.62607015e-34,
  /** 玻尔兹曼常数 J/K。 */
  kB: 1.380649e-23,
  /** 地球恒星日 小时。 */
  earthSiderealDayHours: 23.9344696,
  /** 地球回归年 天。 */
  earthYearDays: 365.25636,
} as const

/**
 * 合并基准与覆盖值。
 *
 * @param base - 基准表（通常来自 `src/data/constants-graph.json` 的 name→standard）
 * @param overrides - 工作区覆盖值
 * @returns 生效常数
 */
export function resolveConstants(
  base: Record<string, number>,
  overrides?: Record<string, number>,
): Record<string, number> {
  return { ...base, ...(overrides ?? {}) }
}
