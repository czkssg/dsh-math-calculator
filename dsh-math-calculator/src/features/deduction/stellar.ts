/**
 * 恒星结构与寿命。
 *
 * ## 精度分层（这是本模块的核心约定）
 *
 * ```
 *   exact               斯特藩-玻尔兹曼、维恩位移、辐射平衡（宜居带）
 *   empirical           质光关系 L∝M^3.5、质径关系、主序寿命 τ∝M^-2.5
 *   order-of-magnitude  α 对点火温度、不透明度、寿命的净效应
 *   direction-only      α 对寿命的净效应（结构模型不覆盖，只给方向）
 * ```
 *
 * 为什么不"从 α 直接算恒星"：那需要核反应网络 + 不透明度表 + 演化程序，
 * 属于独立科研工程。这里给的是可核对的基准线 + 明确的失效边界。
 *
 * @module dsh-math-calculator/features/deduction/stellar
 */

import { planckRadiance } from './physics.js'
import { ALPHA_REAL, BASE_PHYSICS } from './constants.js'

/** 太阳有效温度 K。 */
const TSUN = 5778
/** 太阳主序寿命 Gyr。 */
const TAU_SUN_GYR = 10
/** 太阳光度 W。 */
const LSUN = BASE_PHYSICS.Lsun

/** 一条敏感度结论。 */
export interface SensitivityEntry {
  id: string
  direction: string
  magnitude: string
  confidence: 'exact' | 'empirical' | 'order-of-magnitude' | 'direction-only'
  domain: string
  note: string
}

/** 恒星结构画像。 */
export interface StellarProfile {
  massSun: number
  radiusSun: number
  luminositySun: number
  effectiveTempK: number
  lifetimeGyr: number
  lifetimeAlphaGyr: number
  lifetimeAlphaExponent: number
  minIgnitionMassSun: number
  habitableZoneAU: [number, number]
  peakWavelengthNm: number
  uvFraction: number
  description: string
  sensitivity: SensitivityEntry[]
}

/**
 * 质光关系（经验，分段）。
 *
 * @param massSun - 质量（太阳质量）
 * @returns 光度（太阳光度）
 */
export function massLuminosity(massSun: number): number {
  const m = Math.max(0.08, massSun)
  if (m < 0.43) return 0.23 * m ** 2.3
  if (m < 2) return m ** 4
  if (m < 20) return 1.4 * m ** 3.5
  return 32000 * m
}

/**
 * 质径关系（经验，分段）。
 *
 * @param massSun - 质量（太阳质量）
 * @returns 半径（太阳半径）
 */
export function massRadius(massSun: number): number {
  const m = Math.max(0.08, massSun)
  if (m < 1) return m ** 0.8
  if (m < 10) return m ** 0.57
  return m ** 0.5
}

/**
 * 主序寿命：τ = 10 Gyr·(M/M☉)^-2.5。
 *
 * @param massSun - 质量（太阳质量）
 * @returns 寿命（Gyr）
 */
export function mainSequenceLifetime(massSun: number): number {
  return TAU_SUN_GYR * Math.max(0.08, massSun) ** -2.5
}

/** 普朗克谱（任意单位）。 */
const planck = (lambdaNm: number, tempK: number): number =>
  planckRadiance(BASE_PHYSICS.h, BASE_PHYSICS.c, BASE_PHYSICS.kB, lambdaNm, tempK)

/**
 * 紫外（<400nm）能量占比（普朗克积分，采样到红外尾巴）。
 *
 * 必须覆盖到 1mm，否则"总能量"被低估、紫外占比虚高。
 *
 * @param tempK - 有效温度（K）
 * @returns 0-1 的比例
 */
export function uvFractionOf(tempK: number): number {
  let uv = 0
  let total = 0
  const bands: Array<[number, number, number]> = [
    [10, 400, 1],
    [400, 1000, 5],
    [1000, 10000, 50],
    [10000, 1e6, 5000],
  ]
  for (const [from, to, step] of bands) {
    for (let lambda = from; lambda <= to; lambda += step) {
      const value = planck(lambda, tempK) * step
      total += value
      if (lambda < 400) uv += value
    }
  }
  return total > 0 ? uv / total : 0
}

/**
 * 恒星结构画像。
 *
 * @param massSun - 质量（太阳质量）
 * @param alpha - 精细结构常数（缺省现实值），用于敏感度
 * @param overrides - 作者显式给的半径/光度（避免同一份输出里两套数字）
 * @returns 结构画像
 */
export function describeStarStructure(
  massSun: number,
  alpha: number = ALPHA_REAL,
  overrides?: { luminositySun?: number; radiusSun?: number },
): StellarProfile {
  const m = Math.max(0.08, massSun)
  const luminositySun = overrides?.luminositySun ?? massLuminosity(m)
  const radiusSun = overrides?.radiusSun ?? massRadius(m)
  const effectiveTempK = TSUN * luminositySun ** 0.25 * radiusSun ** -0.5
  const lifetimeGyr = mainSequenceLifetime(m)
  const habitableZoneAU: [number, number] = [
    0.95 * Math.sqrt(luminositySun),
    1.67 * Math.sqrt(luminositySun),
  ]
  const peakWavelengthNm = (BASE_PHYSICS.bWien / effectiveTempK) * 1e9
  const uvFraction = uvFractionOf(effectiveTempK)
  const alphaRatio = alpha / ALPHA_REAL

  /**
   * α 对寿命的净效应（量级）：
   *   低质量星由不透明度控制，L ∝ 1/κ ∝ α⁻²，寿命 τ ∝ α²；
   *   大质量星辐射压主导，一阶依赖消失；中间取 0.5 过渡。
   */
  const lifetimeAlphaExponent = m < 2 ? 2 : m < 20 ? 0.5 : 0
  const lifetimeAlphaGyr = lifetimeGyr * alphaRatio ** lifetimeAlphaExponent
  const minIgnitionMassSun = 0.08 * alphaRatio ** 2

  const sensitivity: SensitivityEntry[] = [
    {
      id: 'ignition-temperature',
      direction: alphaRatio > 1 ? '点火温度升高（库仑势垒变高）' : alphaRatio < 1 ? '点火温度降低' : '与现实中相同',
      magnitude: '×' + (alphaRatio ** 2).toFixed(3) + '（T_ign ∝ α²）',
      confidence: 'order-of-magnitude',
      domain: 'α 偏离现实 < 10%',
      note: '库仑势垒 ∝ α·Z₁Z₂；精确值需要核反应网络',
    },
    {
      id: 'thomson-opacity',
      direction: alphaRatio > 1 ? '电子散射不透明度升高' : alphaRatio < 1 ? '不透明度降低' : '与现实中相同',
      magnitude: '×' + (alphaRatio ** 2).toFixed(3) + '（σ_T ∝ α²）',
      confidence: 'exact',
      domain: '非简并、非相对论电子',
      note: '汤姆孙散射截面严格 ∝ α²',
    },
    {
      id: 'main-sequence-lifetime',
      direction: alphaRatio > 1 ? '同质量恒星寿命变长（不透明度升高、燃烧更慢）' : alphaRatio < 1 ? '同质量恒星寿命变短' : '与现实中相同',
      magnitude: '×' + (alphaRatio ** lifetimeAlphaExponent).toFixed(3) + '（低质量 τ∝α²，大质量 τ∝α⁰）',
      confidence: 'order-of-magnitude',
      domain: 'α 偏离现实 < 10%；跨质量区间只保证量级',
      note: '推导链：κ∝α² → L∝1/κ → τ∝M/L',
    },
    {
      id: 'ignition-mass',
      direction: alphaRatio > 1 ? '可烧氢的最小质量升高' : '可烧氢的最小质量降低',
      magnitude: '×' + (alphaRatio ** 2).toFixed(3) + '（0.08 M☉ → ' + minIgnitionMassSun.toFixed(3) + ' M☉）',
      confidence: 'order-of-magnitude',
      domain: 'α 偏离现实 < 20%',
      note: '点火温度 ∝ 库仑势垒 ∝ α²；低于此质量的星只能烧氘',
    },
    {
      id: 'habitable-zone',
      direction: '宜居带位置取决于光度，本模型不预测移动量',
      magnitude: '不建模',
      confidence: 'direction-only',
      domain: '—',
      note: 'HZ = 0.95–1.67√L 是精确的；L 对 α 的依赖未建模',
    },
  ]

  const className =
    effectiveTempK >= 30000 ? 'O' : effectiveTempK >= 10000 ? 'B' : effectiveTempK >= 7500 ? 'A' :
    effectiveTempK >= 6000 ? 'F' : effectiveTempK >= 5200 ? 'G' : effectiveTempK >= 3700 ? 'K' : 'M'

  const description =
    m.toFixed(2) + ' M☉ 的主序星：L=' + luminositySun.toFixed(3) + ' L☉，R=' +
    radiusSun.toFixed(3) + ' R☉，有效温度 ' + Math.round(effectiveTempK) + ' K（' + className +
    ' 型），主序寿命约 ' +
    (lifetimeGyr < 1 ? (lifetimeGyr * 1000).toFixed(0) + ' Myr' : lifetimeGyr.toFixed(1) + ' Gyr') +
    '。宜居带 ' + habitableZoneAU[0].toFixed(2) + '–' + habitableZoneAU[1].toFixed(2) +
    ' AU，辐射峰值 ' + peakWavelengthNm.toFixed(0) + ' nm，紫外占 ' +
    (uvFraction * 100).toFixed(1) + '%。'

  return {
    massSun: m,
    radiusSun,
    luminositySun,
    effectiveTempK,
    lifetimeGyr,
    lifetimeAlphaGyr,
    lifetimeAlphaExponent,
    minIgnitionMassSun,
    habitableZoneAU,
    peakWavelengthNm,
    uvFraction,
    description,
    sensitivity,
  }
}

/** 太阳光度常数（供外部复用）。 */
export const SOLAR_LUMINOSITY = LSUN
