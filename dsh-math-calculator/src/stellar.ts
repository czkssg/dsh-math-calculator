/**
 * 恒星结构与寿命（ADR-0001 S3）。
 *
 * 定位：**能精确的精确，不能精确的经验，再不行只给方向。**
 *
 *   exact             斯特藩-玻尔兹曼、维恩位移、辐射平衡（宜居带）
 *   empirical         质光关系 L∝M^3.5、质径关系、主序寿命 τ∝M^-2.5
 *   order-of-magnitude  α 对点火温度、不透明度的影响
 *   direction-only     α 对寿命净效应（结构模型不覆盖，只给方向）
 *
 * 为什么不"从 α 直接算恒星"：那需要核反应网络 + 不透明度表 + 恒星演化程序，
 * 属于独立科研工程。本模块给的是**可核对的基准线 + 明确的失效边界**。
 *
 * @module dsh-math-calculator/stellar
 */

import { OUR_UNIVERSE } from './constants-core.js'

/** 太阳光度 W。 */
const LSUN = 3.828e26
/** 太阳半径 m。 */
const RSUN = 6.957e8
/** 太阳有效温度 K。 */
const TSUN = 5778
/** 太阳主序寿命 Gyr。 */
const TAU_SUN_GYR = 10

/** 一条敏感度结论。 */
export interface SensitivityEntry {
  id: string
  /** 方向（人话）。 */
  direction: string
  /** 量级倍数或说明。 */
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
  /** 有效温度 K（斯特藩-玻尔兹曼反解）。 */
  effectiveTempK: number
  /** 主序寿命 Gyr。 */
  lifetimeGyr: number
  /** 宜居带内外边界 AU（辐射平衡，精确）。 */
  habitableZoneAU: [number, number]
  /** 辐射峰值波长 nm（维恩，精确）。 */
  peakWavelengthNm: number
  /** 紫外（<400nm）能量占比（普朗克积分，精确）。 */
  uvFraction: number
  /** 一句话定性。 */
  description: string
  /** 对常数的敏感度。 */
  sensitivity: SensitivityEntry[]
}

/** 质光关系（经验，分段）。 */
export function massLuminosity(massSun: number): number {
  const m = Math.max(0.08, massSun)
  if (m < 0.43) return 0.23 * m ** 2.3
  if (m < 2) return m ** 4 // 常见教材用 3.5~4；2 以下 4 更贴合太阳附近
  if (m < 20) return 1.4 * m ** 3.5
  return 32000 * m // 极高质量星接近爱丁顿极限，退回线性
}

/** 质径关系（经验，分段）。 */
export function massRadius(massSun: number): number {
  const m = Math.max(0.08, massSun)
  if (m < 1) return m ** 0.8
  if (m < 10) return m ** 0.57
  return m ** 0.5
}

/** 主序寿命 Gyr：τ = 10 Gyr · (M/M☉)^-2.5。 */
export function mainSequenceLifetime(massSun: number): number {
  const m = Math.max(0.08, massSun)
  return TAU_SUN_GYR * m ** -2.5
}

/** 普朗克谱（任意单位）。 */
function planck(lambdaNm: number, tempK: number): number {
  const h = 6.62607015e-34
  const c = 2.99792458e8
  const k = 1.380649e-23
  const lambda = lambdaNm * 1e-9
  const exponent = (h * c) / (lambda * k * tempK)
  if (exponent > 700) return 0
  return 1 / (lambda ** 5 * (Math.exp(exponent) - 1))
}

/** 紫外（<400nm）能量占比（普朗克积分，精确到采样精度）。 */
export function uvFractionOf(tempK: number): number {
  let uv = 0
  let total = 0
  // 必须覆盖到红外尾巴（10µm–1mm），否则"总能量"被低估、紫外占比虚高。
  // 分段采样：短波细、长波粗，兼顾精度与速度。
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
 * @param massSun - 质量（太阳质量）。
 * @param alpha - 精细结构常数（缺省现实值），用于敏感度。
 */
export function describeStarStructure(
  massSun: number,
  alpha: number = OUR_UNIVERSE.alpha,
  overrides?: { luminositySun?: number; radiusSun?: number },
): StellarProfile {
  const m = Math.max(0.08, massSun)
  // 作者显式给了半径/光度时以它为准，避免同一份输出里两套数字打架。
  const luminositySun = overrides?.luminositySun ?? massLuminosity(m)
  const radiusSun = overrides?.radiusSun ?? massRadius(m)
  const effectiveTempK = TSUN * luminositySun ** 0.25 * radiusSun ** -0.5
  const lifetimeGyr = mainSequenceLifetime(m)
  const habitableZoneAU: [number, number] = [0.95 * Math.sqrt(luminositySun), 1.67 * Math.sqrt(luminositySun)]
  const peakWavelengthNm = (2.897771955e-3 / effectiveTempK) * 1e9
  const uvFraction = uvFractionOf(effectiveTempK)

  const alphaRatio = alpha / OUR_UNIVERSE.alpha
  const sensitivity: SensitivityEntry[] = [
    {
      id: 'ignition-temperature',
      direction: alphaRatio > 1 ? '点火温度升高（库仑势垒变高）' : alphaRatio < 1 ? '点火温度降低' : '与现实中相同',
      magnitude: `×${(alphaRatio ** 2).toFixed(3)}（T_ign ∝ α²）`,
      confidence: 'order-of-magnitude',
      domain: 'α 偏离现实 < 10%',
      note: '库仑势垒 ∝ α·Z₁Z₂，聚变所需速度随之变化；精确值需要核反应网络',
    },
    {
      id: 'thomson-opacity',
      direction: alphaRatio > 1 ? '电子散射不透明度升高' : alphaRatio < 1 ? '不透明度降低' : '与现实中相同',
      magnitude: `×${(alphaRatio ** 2).toFixed(3)}（σ_T ∝ α²）`,
      confidence: 'exact',
      domain: '非简并、非相对论电子',
      note: '汤姆孙散射截面严格 ∝ α²',
    },
    {
      id: 'main-sequence-lifetime',
      direction: alphaRatio > 1 ? '同质量恒星倾向更长寿命（燃烧更慢）' : alphaRatio < 1 ? '同质量恒星倾向更短寿命' : '与现实中相同',
      magnitude: '只给方向，不给倍数',
      confidence: 'direction-only',
      domain: '仅定性；本模型不把 α 折算进恒星演化',
      note: '净效应取决于「质量-光度关系如何随 α 移动」，需要完整恒星结构计算',
    },
    {
      id: 'habitable-zone',
      direction: alphaRatio > 1 ? '宜居带位置取决于光度，本模型不预测移动量' : '同左',
      magnitude: '不建模',
      confidence: 'direction-only',
      domain: '—',
      note: 'HZ = 0.95–1.67√L（精确）；但 L 对 α 的依赖未建模',
    },
  ]

  const className =
    effectiveTempK >= 30000 ? 'O' : effectiveTempK >= 10000 ? 'B' : effectiveTempK >= 7500 ? 'A' :
    effectiveTempK >= 6000 ? 'F' : effectiveTempK >= 5200 ? 'G' : effectiveTempK >= 3700 ? 'K' : 'M'

  const description =
    `${m.toFixed(2)} M☉ 的主序星：L=${luminositySun.toFixed(3)} L☉，R=${radiusSun.toFixed(3)} R☉，` +
    `有效温度 ${Math.round(effectiveTempK)} K（${className} 型），主序寿命约 ${lifetimeGyr < 1 ? (lifetimeGyr * 1000).toFixed(0) + ' Myr' : lifetimeGyr.toFixed(1) + ' Gyr'}。` +
    ` 宜居带 ${habitableZoneAU[0].toFixed(2)}–${habitableZoneAU[1].toFixed(2)} AU，辐射峰值 ${peakWavelengthNm.toFixed(0)} nm，紫外占 ${(uvFraction * 100).toFixed(1)}%。`

  return {
    massSun: m,
    radiusSun,
    luminositySun,
    effectiveTempK,
    lifetimeGyr,
    habitableZoneAU,
    peakWavelengthNm,
    uvFraction,
    description,
    sensitivity,
  }
}
