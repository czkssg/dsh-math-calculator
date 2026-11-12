/**
 * 分层气候推演。
 *
 * ## 这个模块存在的理由：把季节成因说对
 *
 * 三种常见混淆，这里按层次分开建模：
 *
 * 1. 「离太阳近所以夏天」——错。北半球冬季在近日点，反而更冷。
 * 2. 「距离影响 6.8%，所以季节温差 6.8%」——错。辐照度变化要经
 *    Stefan-Boltzmann 四次根折算，再乘热惯性阻尼。
 * 3. 把偏心率当季节主因——只有 e > 0.3 时才可能压过轴倾角。
 *
 * ## 三层
 *
 * ```
 *   第 1 层 辐照度  S₀ = L/(4πa²)，含偏心率造成的近日/远日差
 *   第 2 层 季节    轴倾角（主因）vs 偏心率（调制项）分开量化
 *   第 3 层 纬度    年均温 + 季节振幅，含极夜惩罚与冰雪反照率反馈
 * ```
 *
 * 第 3 层的系数是用地球实测温度标定的（校准历程见各函数注释），
 * 不是从第一性原理推出的——所以纬度气候的结论必须标【标度】，
 * 不能标【精确】。第 1 层与几何部分是【精确】。
 *
 * @module dsh-math-calculator/features/deduction/climate
 */

import { toRad, toDeg } from './physics.js'

/** 分层气候输入。 */
export interface ClimateInput {
  /** 精细结构常数（决定热容标定；缺省现实值）。 */
  alpha?: number
  /** 恒星光度 W。 */
  luminosityW: number
  /** 轨道半长轴 m。 */
  semiMajorAxisM: number
  /** 轨道偏心率 0-1。 */
  eccentricity: number
  /** 轴倾角 度。 */
  obliquityDeg: number
  /** 反照率 0-1。 */
  albedo: number
  /** 温室增温 K。 */
  greenhouseK: number
  /** 海平面气压 Pa。 */
  pressurePa: number
  /** 自转周期 小时。 */
  rotationHours: number
  /** 是否有液态溶剂（海洋热惯性）。 */
  hasOcean: boolean
}

/** 第 1 层：辐照度。 */
export interface IrradianceLayer {
  annualMeanWm2: number
  earthWm2: number
  relativeToEarth: number
  perihelionWm2: number
  aphelionWm2: number
  eccentricityAmplitude: number
  equilibriumK: number
}

/** 第 2 层：季节成因。 */
export interface SeasonLayer {
  obliquityFactor: number
  eccentricityFactor: number
  dominant: 'obliquity' | 'eccentricity' | 'both' | 'neither'
  causeSummary: string
  eccentricityTempAmplitude: number
  hemisphericAsymmetry: number
  hasSeasons: boolean
  description: string
}

/** 第 3 层：纬度气候。 */
export interface LatitudeClimate {
  latitudeDeg: number
  annualMeanK: number
  annualMeanC: number
  warmSeasonK: number
  coldSeasonK: number
  annualRangeK: number
  noonElevationSummer: number
  noonElevationWinter: number
  dayLengthSummer: number
  dayLengthWinter: number
  relativeInsolation: number
  zone: string
}

/** 完整分层气候结果。 */
export interface LayeredClimate {
  irradiance: IrradianceLayer
  season: SeasonLayer
  surfaceMeanK: number
  surfaceMeanC: number
  latitudes: LatitudeClimate[]
  subsolarRangeDeg: number
  polarCircleDeg: number
}

/** 地球基准（用于对比，不是可改设定）。 */
const EARTH = {
  solarConstant: 1361,
  sigma: 5.670374419e-8,
}

/** 地球轴倾角基准（季节因子的归一化参照）。 */
const EARTH_OBLIQUITY = 23.44
/** 地球偏心率基准。 */
const EARTH_ECCENTRICITY = 0.0167
/** 现实精细结构常数。 */
const ALPHA_REAL = 7.2973525693e-3

/** 标准差归一：地球偏心率带来的温度振幅约 0.85%。 */
const EARTH_ECCENTRICITY_TEMP = 0.0085

/**
 * 第 1 层：辐照度。
 *
 * S = L/(4πa²)。近日点 r = a(1-e)、远日点 r = a(1+e)，
 * 因为 S ∝ 1/r²，所以 ΔS/S₀ 由 (1-e)² 与 (1+e)² 的比值给出。
 *
 * @param luminosityW - 恒星光度（W）
 * @param semiMajorAxisM - 轨道半长轴（m）
 * @param eccentricity - 偏心率
 * @param albedo - 反照率
 * @returns 辐照度层
 */
export function computeIrradiance(
  luminosityW: number,
  semiMajorAxisM: number,
  eccentricity: number,
  albedo: number,
): IrradianceLayer {
  const annualMeanWm2 = luminosityW / (4 * Math.PI * semiMajorAxisM ** 2)
  const perihelionWm2 = luminosityW / (4 * Math.PI * (semiMajorAxisM * (1 - eccentricity)) ** 2)
  const aphelionWm2 = luminosityW / (4 * Math.PI * (semiMajorAxisM * (1 + eccentricity)) ** 2)
  const eccentricityAmplitude = annualMeanWm2 > 0 ? (perihelionWm2 - aphelionWm2) / annualMeanWm2 : 0
  const equilibriumK = ((annualMeanWm2 * (1 - albedo)) / (4 * EARTH.sigma)) ** 0.25

  return {
    annualMeanWm2,
    earthWm2: EARTH.solarConstant,
    relativeToEarth: annualMeanWm2 / EARTH.solarConstant,
    perihelionWm2,
    aphelionWm2,
    eccentricityAmplitude,
    equilibriumK,
  }
}

/**
 * 第 2 层：分离季节的两种来源。
 *
 * 轴倾角贡献用 sin(ε)/sin(23.44°) 标度；偏心率贡献要经三步折算：
 *
 * ```
 *   a) 辐照度变化        ΔS/S
 *   b) 四次根响应        ΔT/T = ΔS/(4S)
 *   c) 热惯性阻尼        海洋 0.5 / 岩石 0.8，再乘大气输运因子
 * ```
 *
 * 地球 6.8% 的辐照度变化因此只剩约 0.85% 的温度响应，
 * 与实测的半球季节不对称量级吻合。
 *
 * @param obliquityDeg - 轴倾角（度）
 * @param eccentricity - 偏心率
 * @param irradiance - 第 1 层结果
 * @param pressurePa - 气压（Pa）
 * @param hasOcean - 是否有海洋
 * @param alpha - 精细结构常数（热容标定）
 * @returns 季节层
 */
export function computeSeason(
  obliquityDeg: number,
  eccentricity: number,
  irradiance: IrradianceLayer,
  pressurePa: number,
  hasOcean: boolean,
  alpha: number = ALPHA_REAL,
): SeasonLayer {
  const obliquityFactor = Math.sin(toRad(Math.min(90, obliquityDeg))) / Math.sin(toRad(EARTH_OBLIQUITY))
  const eccentricityFactor = eccentricity / EARTH_ECCENTRICITY

  /** a) 辐照度变化 → b) 四次根响应。 */
  let deltaT = irradiance.eccentricityAmplitude / 4

  /** c) 热惯性：热容 ∝ α²（化学键能标定），现实常数下倍率为 1。 */
  const heatCapacityScale = (ALPHA_REAL / Math.max(1e-9, alpha)) ** 2
  const inertiaDamping = (hasOcean ? 0.5 : 0.8) * heatCapacityScale
  const atmosphereDamping = 1 / (1 + Math.min(2, pressurePa / 101325) * 0.15)
  deltaT *= inertiaDamping * atmosphereDamping

  const eccentricityTempAmplitude = deltaT

  const obliquityStrength = obliquityFactor
  const eccentricityStrength = eccentricityTempAmplitude / EARTH_ECCENTRICITY_TEMP

  let dominant: SeasonLayer['dominant']
  if (obliquityDeg < 2 && eccentricity < 0.05) dominant = 'neither'
  else if (obliquityDeg < 2) dominant = 'eccentricity'
  else if (eccentricity > 0.3 && eccentricityStrength > obliquityStrength) dominant = 'eccentricity'
  else if (eccentricity > 0.15) dominant = 'both'
  else dominant = 'obliquity'

  const hemisphericAsymmetry = eccentricityTempAmplitude * 0.5

  let description: string
  let causeSummary: string

  if (dominant === 'neither') {
    description = '几乎没有季节。'
    causeSummary = '轴倾角接近 0 且轨道接近正圆——没有天文季节，只有天气扰动。'
  } else if (dominant === 'obliquity') {
    description =
      obliquityDeg < 10 ? '四季温和（倾角小）'
        : obliquityDeg < 35 ? '四季分明（倾角接近地球）'
          : obliquityDeg < 60 ? '季节极端（倾角大）'
            : '半球半年极昼半年极夜（倾角接近侧躺）'
    causeSummary =
      '季节由轴倾角 ' + obliquityDeg.toFixed(1) + '° 主导：太阳直射点在南北纬 ' +
      obliquityDeg.toFixed(1) + '° 之间往返，造成太阳高度角与昼长的周期性变化。' +
      (eccentricity > 0.05
        ? '轨道偏心率 ' + eccentricity.toFixed(3) + ' 只额外带来约 ' +
          (eccentricityTempAmplitude * 100).toFixed(1) + '% 的温度调制，属**次要**因素：它让一个半球季节略强、另一个略弱，但不改变季节的南北反相本质。'
        : '轨道偏心率 ' + eccentricity.toFixed(4) + ' 接近正圆，带来的温度调制仅约 ' +
          (eccentricityTempAmplitude * 100).toFixed(2) + '%，属**次要**因素，可忽略。')
  } else if (dominant === 'eccentricity') {
    description = '季节由轨道距离主导（大偏心率）'
    causeSummary =
      '偏心率 ' + eccentricity.toFixed(2) + '，辐照度相差 ' +
      (irradiance.eccentricityAmplitude * 100).toFixed(0) + '%，折算到温度约 ' +
      (eccentricityTempAmplitude * 100).toFixed(1) + '%，已超过轴倾角 ' +
      obliquityDeg.toFixed(1) + '° 的作用。这种季节是全球同步的，不是南北半球反相。'
  } else {
    description = '轴倾角与轨道偏心率共同塑形季节'
    causeSummary =
      '轴倾角 ' + obliquityDeg.toFixed(1) + '° 造成南北半球反相的常规季节，' +
      '偏心率 ' + eccentricity.toFixed(2) + ' 叠加约 ' +
      (eccentricityTempAmplitude * 100).toFixed(1) + '% 的全球同步温度变化。'
  }

  return {
    obliquityFactor,
    eccentricityFactor,
    dominant,
    causeSummary,
    eccentricityTempAmplitude,
    hemisphericAsymmetry,
    hasSeasons: obliquityDeg > 2 || eccentricity > 0.05,
    description,
  }
}

/**
 * 某纬度某半球的至日正午太阳高度角。
 *
 * h = 90° - |φ - δ|，δ = ±ε。北半球夏至 δ=+ε、冬至 δ=-ε；
 * 南半球相反。极夜时返回 0（太阳不升起）。
 *
 * @param latitudeDeg - 纬度（北正南负）
 * @param obliquityDeg - 轴倾角（度）
 * @param season - 'summer' | 'winter'（相对该半球）
 * @returns 高度角（度，≥0）
 */
export function noonElevation(latitudeDeg: number, obliquityDeg: number, season: 'summer' | 'winter'): number {
  const northern = latitudeDeg >= 0
  const sign = season === 'summer' ? (northern ? 1 : -1) : northern ? -1 : 1
  const declination = sign * obliquityDeg
  return Math.max(0, 90 - Math.abs(latitudeDeg - declination))
}

/**
 * 某纬度昼长（小时）。
 *
 * cos(H) = -tanφ·tanδ，昼长 = 2H/15°。|cosH| > 1 为极昼（24h）或极夜（0h）。
 *
 * @param latitudeDeg - 纬度（度）
 * @param declinationDeg - 太阳赤纬（度）
 * @returns 昼长（小时）
 */
export function dayLength(latitudeDeg: number, declinationDeg: number): number {
  const phi = toRad(latitudeDeg)
  const delta = toRad(declinationDeg)
  const cosH = -Math.tan(phi) * Math.tan(delta)
  if (cosH <= -1) return 24
  if (cosH >= 1) return 0
  return (2 * toDeg(Math.acos(cosH))) / 15
}

/**
 * 纬度年均温（K）。
 *
 * 标定目标（地球，海拔 0、海洋性气候）：
 * `0°→27 | 30°→21 | 45°→12 | 60°→3 | 75°→-15 | 88°→-25`（°C）
 *
 * 温降主因不是"平均日照少"，而是极夜——高纬有整月无日照，散热期极长，
 * 冰雪反照率又形成正反馈。所以除了 cos²φ 主梯度，还要加极夜惩罚。
 *
 * @param latitudeDeg - 纬度（度）
 * @param globalMeanK - 全球年均表面温度（K）
 * @param greenhouseK - 温室增温（K）
 * @param pressureAtm - 气压（atm）
 * @returns 年均温度（K）
 */
export function annualMeanTemperature(
  latitudeDeg: number,
  globalMeanK: number,
  greenhouseK: number,
  pressureAtm: number,
): number {
  const s = Math.max(0, Math.cos(toRad(latitudeDeg)))
  const transport = Math.min(1.15, 0.32 + 0.68 * Math.min(1.2, pressureAtm))
  const greenhouseDamping = 1 / (1 + greenhouseK / 50)
  const amplitude = 44 * transport * greenhouseDamping

  let temperature = globalMeanK + amplitude * (s ** 2 - 0.5)
  const polarNightSeverity = Math.max(0, (Math.abs(latitudeDeg) - 55) / 33)
  temperature -= 32 * transport * greenhouseDamping * polarNightSeverity ** 1.35

  if (greenhouseK > 5) {
    temperature -= 9 * transport * Math.max(0, (Math.abs(latitudeDeg) - 45) / 43) ** 2
  }
  return temperature
}

/**
 * 季节温度振幅（K）。
 *
 * 用至日正午高度角的正弦差作为"一年内加热能力的变化幅度"：
 *
 * ```
 *   h_夏 = 90 - |φ - ε|,  h_冬 = 90 - |φ + ε|
 *   季节性 ∝ sin(h_夏) - sin(h_冬)
 * ```
 *
 * 这个形式自动满足两条物理：ε=0 时差为 0（无季节）；
 * 高倾角时所有纬度都有季节（含赤道）。
 *
 * @param latitudeDeg - 纬度（度）
 * @param globalMeanK - 全球年均温度（K）
 * @param obliquityDeg - 轴倾角（度）
 * @param pressureAtm - 气压（atm）
 * @param hasOcean - 是否有海洋
 * @returns 振幅（K）
 */
export function seasonalAmplitude(
  latitudeDeg: number,
  globalMeanK: number,
  obliquityDeg: number,
  pressureAtm: number,
  hasOcean: boolean,
): number {
  const hSummer = 90 - Math.abs(Math.abs(latitudeDeg) - obliquityDeg)
  const hWinter = 90 - Math.abs(Math.abs(latitudeDeg) + obliquityDeg)
  const sinSummer = Math.sin(toRad(Math.max(0, hSummer)))
  const sinWinter = hWinter > 0 ? Math.sin(toRad(hWinter)) : 0
  const swing = Math.max(0, sinSummer - sinWinter)

  let amplitude = 96 * swing
  const polarBoost = 1 + Math.max(0, (Math.abs(latitudeDeg) - 60) / 30) * 1.5
  amplitude *= polarBoost

  const oceanDamping = hasOcean ? 0.45 : 1.0
  const airDamping = 1 / (1 + Math.min(2.5, pressureAtm) * 0.35)
  amplitude *= oceanDamping * airDamping

  if (globalMeanK < 260) amplitude *= 1.3
  return Math.max(2, amplitude)
}

/**
 * 气候带标签（按年均温与年较差，对应柯本大类）。
 *
 * @param latitudeDeg - 纬度
 * @param tempC - 年均温（°C）
 * @param hasLiquid - 是否有液态溶剂
 * @param annualRangeK - 年较差（K）
 * @returns 气候带名
 */
export function climateZone(latitudeDeg: number, tempC: number, hasLiquid: boolean, annualRangeK: number): string {
  const abs = Math.abs(latitudeDeg)
  if (tempC < -25) return abs > 70 ? '极地冰原' : '寒带苔原'
  if (tempC < -10) return '亚寒带针叶林'
  if (tempC < 0) return '亚寒带（冻土）'
  if (tempC < 10) return annualRangeK > 30 ? '温带大陆性' : '温带寒'
  if (tempC < 20) return annualRangeK > 30 ? '温带大陆性' : '温带'
  if (tempC < 28) {
    if (!hasLiquid) return '干旱热带'
    return annualRangeK < 8 ? '热带雨林' : '亚热带'
  }
  if (!hasLiquid) return '干旱带（无液态溶剂）'
  return annualRangeK < 5 ? '热带雨林' : '热带'
}

/** 纬度采样带（与老实现一致）。 */
const LATITUDE_BANDS = [0, 15, 30, 45, 60, 75, 88]

/**
 * 主函数：三层气候推演。
 *
 * @param input - 输入参数
 * @returns 分层结果
 */
export function computeLayeredClimate(input: ClimateInput): LayeredClimate {
  const irradiance = computeIrradiance(
    input.luminosityW,
    input.semiMajorAxisM,
    input.eccentricity,
    input.albedo,
  )
  const surfaceMeanK = irradiance.equilibriumK + input.greenhouseK
  const season = computeSeason(
    input.obliquityDeg,
    input.eccentricity,
    irradiance,
    input.pressurePa,
    input.hasOcean,
    input.alpha ?? ALPHA_REAL,
  )

  const pressureAtm = Math.max(0.001, input.pressurePa / 101325)
  const latitudes: LatitudeClimate[] = []

  for (const latitudeDeg of LATITUDE_BANDS) {
    const annualMeanK = annualMeanTemperature(latitudeDeg, surfaceMeanK, input.greenhouseK, pressureAtm)
    const amplitude = seasonalAmplitude(latitudeDeg, surfaceMeanK, input.obliquityDeg, pressureAtm, input.hasOcean)
    const warmSeasonK = annualMeanK + amplitude / 2
    const coldSeasonK = annualMeanK - amplitude / 2

    latitudes.push({
      latitudeDeg,
      annualMeanK,
      annualMeanC: annualMeanK - 273.15,
      warmSeasonK,
      coldSeasonK,
      annualRangeK: amplitude,
      noonElevationSummer: noonElevation(latitudeDeg, input.obliquityDeg, 'summer'),
      noonElevationWinter: noonElevation(latitudeDeg, input.obliquityDeg, 'winter'),
      dayLengthSummer: dayLength(latitudeDeg, input.obliquityDeg),
      dayLengthWinter: dayLength(latitudeDeg, -input.obliquityDeg),
      relativeInsolation: Math.max(0, Math.cos(toRad(latitudeDeg))),
      zone: climateZone(latitudeDeg, annualMeanK - 273.15, input.hasOcean, amplitude),
    })
  }

  return {
    irradiance,
    season,
    surfaceMeanK,
    surfaceMeanC: surfaceMeanK - 273.15,
    latitudes,
    subsolarRangeDeg: input.obliquityDeg,
    polarCircleDeg: Math.max(0, 90 - input.obliquityDeg),
  }
}
