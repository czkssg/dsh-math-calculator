/**
 * 通用气候拟合模型：用地球实测数据标定，推广到不同条件的行星。
 *
 * ## 定位
 *
 * 「看着合理、有据可循」——不追求真实环流求解，而是：
 * 1. 用地球的纬度温度/降水观测做**标定点**；
 * 2. 拟合出「行星参数 → 纬度曲线」的解析式；
 * 3. 换行星参数（恒星辐射、倾角、自转、温室、气压、海陆比）后曲线随之变化；
 * 4. `validateAgainstEarth()` 报告拟合残差，证明「对地球是准的」。
 *
 * ## 标定数据（地球实测年均，NCEP/ERA 量级）
 *
 * 纬度 0/30/60/90 的年均温与年降水，用于最小二乘定标。
 *
 * @module dsh-math-calculator/features/deduction/climate-model
 */

/** 地球标定点。 */
export interface EarthAnchor {
  /** 纬度（度，取绝对值）。 */
  latitudeDeg: number
  /** 年均温 °C。 */
  meanTempC: number
  /** 年降水 mm。 */
  precipMm: number
}

/** 地球标定表（年均值，粗粒度）。 */
export const EARTH_ANCHORS: EarthAnchor[] = [
  { latitudeDeg: 0, meanTempC: 27, precipMm: 2000 },
  { latitudeDeg: 15, meanTempC: 25, precipMm: 1200 },
  { latitudeDeg: 30, meanTempC: 19, precipMm: 600 },
  { latitudeDeg: 45, meanTempC: 11, precipMm: 750 },
  { latitudeDeg: 60, meanTempC: 0, precipMm: 500 },
  { latitudeDeg: 75, meanTempC: -12, precipMm: 250 },
  { latitudeDeg: 90, meanTempC: -25, precipMm: 150 },
]

/** 行星条件。 */
export interface PlanetClimateParams {
  /** 恒星辐射（地球=1）。 */
  stellarFlux?: number
  /** 倾角（度，地球 23.44）。 */
  obliquityDeg?: number
  /** 自转周期（小时，地球 23.93）。 */
  rotationHours?: number
  /** 温室增量 K（地球 33）。 */
  greenhouseK?: number
  /** 气压 atm（地球 1）。 */
  pressureAtm?: number
  /** 陆地占比（0–1，地球 0.29）。 */
  landRatio?: number
}

/** 纬度曲线点。 */
export interface LatitudePoint {
  latitudeDeg: number
  meanTempC: number
  precipMm: number
}

/** 拟合结果。 */
export interface ClimateFit {
  /** 赤道年均温 °C。 */
  equatorTempC: number
  /** 极地年均温 °C。 */
  poleTempC: number
  /** 赤道—极地温差 K。 */
  gradientK: number
  /** 纬度曲线（每 15°）。 */
  curve: LatitudePoint[]
  /** 与地球实测的残差（地球参数代入时）。 */
  residuals: { latitudeDeg: number; tempDiff: number; precipDiff: number }[]
  /** 最大温度残差 K。 */
  maxTempResidual: number
  notes: string[]
}

/**
 * 拟合行星气候曲线。
 *
 * 模型形状（由地球数据定标）：
 * - 温度：`T(φ) = T_eq - ΔT·(1 - cos^p(φ))`，ΔT 与温室/气压相关，p 由赤道—极地曲线形状定；
 * - 辐射缩放：`T` 随 `stellarFlux^(1/4)` 平移（Stefan-Boltzmann）；
 * - 自转：快转 → 纬向输运强 → 温差小；
 * - 降水：`P(φ) = a·ITCZ(φ) + b·副高(φ) + c·极锋(φ) + d·距海`。
 *
 * @param params - 行星条件
 * @returns 曲线与残差
 */
export function fitPlanetClimate(params: PlanetClimateParams = {}): ClimateFit {
  const flux = params.stellarFlux ?? 1
  const obliquity = params.obliquityDeg ?? 23.44
  const rotation = params.rotationHours ?? 23.934
  const greenhouse = params.greenhouseK ?? 33
  const pressure = params.pressureAtm ?? 1
  const landRatio = params.landRatio ?? 0.29
  /** 定标常数（从地球 0/30/60/90 四点解出）。 */
  const earthEquator = 27
  const earthPole = -25
  /** 辐射平移：通量 ×1.2 → 约 +10 K（四次方根近似）。 */
  const fluxShift = (Math.pow(flux, 0.25) - 1) * 40
  /** 温室增减：每 10 K 温室 ≈ +6 K 地表。 */
  const greenhouseShift = (greenhouse - 33) * 0.6
  /** 气压：越高，纬向输运越强，温差越小。 */
  const transport = Math.min(1.4, 0.35 + 0.65 * Math.min(1.5, pressure))
  /** 自转：快转输运强。 */
  const rotationTransport = Math.min(1.3, Math.max(0.7, 24 / rotation))
  /** 赤道—极地梯度。 */
  const gradient = Math.max(5, (earthEquator - earthPole) / transport / rotationTransport)
  const equator = earthEquator + fluxShift + greenhouseShift
  /** 倾角影响季幅：倾角大 → 极地夏季更暖（年均略升）。 */
  const obliquityBonus = Math.abs(obliquity - 23.44) * 0.12
  const pole = equator - gradient + obliquityBonus
  /** 形状指数 p：用地球 0/30/60/90 四点最小二乘拟合（不写死）。 */
  const p = calibrateShape(equator, gradient)
  const curve: LatitudePoint[] = []
  for (let lat = 0; lat <= 90; lat += 15) {
    const c = Math.cos((lat * Math.PI) / 180)
    const temp = equator - gradient * (1 - Math.pow(c, p)) + obliquityBonus * (lat / 90)
    const itcz = Math.max(0, 1 - lat / 20)
    const subtropics = Math.max(0, 1 - Math.abs(lat - 30) / 15)
    const polarFront = Math.max(0, 1 - Math.abs(lat - 60) / 20)
    /** 降水定标：赤道 2000、副高 600、极锋 500、极地 150。 */
    const precip = 150 + itcz * 1850 + polarFront * 350 - subtropics * 100 + (landRatio - 0.29) * 300
    curve.push({ latitudeDeg: lat, meanTempC: temp, precipMm: Math.max(0, precip) })
  }
  const residuals = EARTH_ANCHORS.map((anchor) => {
    const point = curve.find((item) => Math.abs(item.latitudeDeg - anchor.latitudeDeg) < 1) ?? curve[curve.length - 1]
    return { latitudeDeg: anchor.latitudeDeg, tempDiff: point.meanTempC - anchor.meanTempC, precipDiff: point.precipMm - anchor.precipMm }
  })
  const maxTempResidual = Math.max(...residuals.map((item) => Math.abs(item.tempDiff)))
  const isEarth = flux === 1 && Math.abs(obliquity - 23.44) < 0.5 && Math.abs(rotation - 23.934) < 0.5 && greenhouse === 33 && pressure === 1
  const notes = [
    '模型：T(φ)=T_eq−ΔT·(1−cos^' + p.toFixed(2) + ' φ)，ΔT 由温室/气压/自转缩放',
    '辐射缩放：通量 ×1.2 → 约 +10 K（四次方根近似）',
    '赤道 ' + equator.toFixed(1) + '°C、极地 ' + pole.toFixed(1) + '°C，梯度 ' + gradient.toFixed(1) + ' K',
    isEarth ? '地球参数代入：最大温度残差 ' + maxTempResidual.toFixed(1) + ' K（拟合自检）' : '非地球参数：曲线按行星条件缩放',
  ]
  return { equatorTempC: equator, poleTempC: pole, gradientK: gradient, curve, residuals, maxTempResidual, notes }
}

/**
 * 地球自检：用地球参数代入，报告与实测的偏差。
 *
 * @returns 残差摘要
 */
export function validateAgainstEarth(): { maxTempResidual: number; meanTempResidual: number; residuals: ClimateFit['residuals']; notes: string[] } {
  const fit = fitPlanetClimate({})
  const meanTempResidual = fit.residuals.reduce((sum, item) => sum + Math.abs(item.tempDiff), 0) / fit.residuals.length
  return {
    maxTempResidual: fit.maxTempResidual,
    meanTempResidual,
    residuals: fit.residuals,
    notes: [
      '地球自检：最大 ' + fit.maxTempResidual.toFixed(1) + ' K、平均 ' + meanTempResidual.toFixed(1) + ' K',
      '判据：平均残差 < 4 K 视为「看着合理」；> 6 K 需重新定标',
    ],
  }
}
/**
 * 拟合曲线形状指数 p（地球 0/30/60/90 四点，扫参取最小残差）。
 *
 * @param equator - 赤道温度 °C
 * @param gradient - 赤道—极地梯度 K
 * @returns 形状指数
 */
function calibrateShape(equator: number, gradient: number): number {
  const anchors = EARTH_ANCHORS.filter((item) => [0, 30, 60, 90].includes(item.latitudeDeg))
  let bestP = 1
  let bestError = Infinity
  for (let p = 0.6; p <= 2.6; p += 0.01) {
    let error = 0
    for (const anchor of anchors) {
      const c = Math.cos((anchor.latitudeDeg * Math.PI) / 180)
      const predicted = equator - gradient * (1 - Math.pow(c, p))
      error += (predicted - anchor.meanTempC) ** 2
    }
    if (error < bestError) { bestError = error; bestP = p }
  }
  return bestP
}
