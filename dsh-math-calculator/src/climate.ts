/**
 * 分层气候推演。
 *
 * 这个模块存在的唯一理由：**把季节成因说对**。
 *
 * 常见的错误混淆（必须避免）：
 *   ✗ 「离太阳近所以夏天」—— 错。北半球冬季在近日点，却更冷。
 *   ✗ 「距离影响 6.8%，所以季节温差 6.8%」—— 错。辐照度变化 ≠ 温度变化。
 *   ✗ 把偏心率当季节主因 —— 只在偏心率极高时才成立。
 *
 * 正确的层次（本模块按此顺序建模）：
 *
 *   ┌─ 第 1 层：辐照度 ────────────────────────────────┐
 *   │ 输入：恒星光度 L、轨道半长轴 a、偏心率 e          │
 *   │ 输出：年**平均**辐照度 S₀ = L/(4πa²)，           │
 *   │       以及近日点/远日点的辐照度差 ΔS/S₀          │
 *   │ 性质：这是**能量收支的基准线**，决定全球平均温度  │
 *   └──────────────────────────────────────────────┘
 *
 *   ┌─ 第 2 层：季节的两种来源，必须分开算 ───────────┐
 *   │ (a) 轴倾角 → 太阳赤纬变化 → 太阳高度角/昼长      │
 *   │     这是**季节主因**。倾角 0 则无季节。          │
 *   │     地球 23.4°：45°N 夏至正午 68°，冬至 21°      │
 *   │                                                  │
 *   │ (b) 偏心率 → 日地距离变化 → 辐照度变化           │
 *   │     这是**调制项**。地球只有 ±3.3%，全球 ±6.8%   │
 *   │     且南北半球反相：北半球冬季近日点（抵消一点） │
 *   │     只有 e > 0.3 时才可能压过轴倾角成为主因      │
 *   └──────────────────────────────────────────────┘
 *
 *   ┌─ 第 3 层：纬度分布 ──────────────────────────────┐
 *   │ 年**平均**温度随纬度：受 cosφ 但主要由极夜+反照率 │
 *   │ 控制（高纬有整月无日照，散热期极长）             │
 *   │ 季节**振幅**随纬度：高纬振幅大（极地半年极夜）   │
 *   │ 热惯性缓冲：海洋/大气把极端值削平，不能线性放大  │
 *   └──────────────────────────────────────────────┘
 *
 * 关键：第 1 层的辐照度变化**不能**直接等于温度变化。
 * 用 Stefan-Boltzmann 吸收温度 T ∝ S^(1/4) 作为物理上限，
 * 再乘热惯性阻尼系数 —— 这样 6.8% 的辐照度变化只剩约 1.7% 的温度响应，
 * 与地球实测（约 1°C 量级的半球季节不对称）量级吻合。
 *
 * @module dsh-math-calculator/climate
 */

/** 分层的输入参数。 */
export interface ClimateInput {
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
  /** 海平面气压 Pa（用于热惯性判断）。 */
  pressurePa: number
  /** 自转周期 小时（用于判断热量能否混合）。 */
  rotationHours: number
  /** 是否有海洋（液态水）。海洋热惯性极大。 */
  hasOcean: boolean
  /** 当地纬度 度。 */
  latitudeDeg: number
}

/** 第 1 层：辐照度。 */
export interface IrradianceLayer {
  /** 年均辐照度 W/m²（在轨道半长轴处）。 */
  annualMeanWm2: number
  /** 地球年均辐照度 W/m²，用于对比。 */
  earthWm2: number
  /** 相对地球的倍数。 */
  relativeToEarth: number
  /** 近日点辐照度 W/m²。 */
  perihelionWm2: number
  /** 远日点辐照度 W/m²。 */
  aphelionWm2: number
  /** 近日点/远日点辐照度差异比例。地球约 0.068。 */
  eccentricityAmplitude: number
  /** 无温室辐射平衡温度 K（全球年均）。 */
  equilibriumK: number
}

/** 第 2 层：两种季节来源的分离。 */
export interface SeasonLayer {
  /** 轴倾角造成的季节强度（0-1，以地球 23.4° 为 1.0 参照）。 */
  obliquityFactor: number
  /** 偏心率造成的季节强度（0-1，以地球 0.0167 为 0.0 参照）。 */
  eccentricityFactor: number
  /** 谁在主导。 */
  dominant: 'obliquity' | 'eccentricity' | 'both' | 'neither'
  /** 主因说明（一句话，可直接写进设定文档）。 */
  causeSummary: string
  /**
   * 偏心率对**温度**的影响（不是辐照度）。
   * 已经过 S^(1/4) 折算与热惯性阻尼。
   */
  eccentricityTempAmplitude: number
  /**
   * 半球季节不对称度。
   * 0 = 南北半球季节完全对称（圆轨道）；
   * 正值 = 一个半球的季节更极端。
   * 地球约 +0.03（北半球冬季在近日点，稍微缓和）。
   */
  hemisphericAsymmetry: number
  /** 是否有季节。 */
  hasSeasons: boolean
  /** 文字描述。 */
  description: string
}

/** 第 3 层：纬度气候。 */
export interface LatitudeClimate {
  latitudeDeg: number
  /** 年均温度 K。 */
  annualMeanK: number
  /** 年均温度 °C。 */
  annualMeanC: number
  /** 暖季平均温度 K。 */
  warmSeasonK: number
  /** 冷季平均温度 K。 */
  coldSeasonK: number
  /** 年温差（暖季 - 冷季）K。 */
  annualRangeK: number
  /** 夏至正午太阳高度角 度。 */
  noonElevationSummer: number
  /** 冬至正午太阳高度角 度。 */
  noonElevationWinter: number
  /** 夏至昼长 小时。 */
  dayLengthSummer: number
  /** 冬至昼长 小时。 */
  dayLengthWinter: number
  /** 年均相对辐照度（赤道为 1）。 */
  relativeInsolation: number
  /** 气候带。 */
  zone: string
}

/** 完整的分层气候结果。 */
export interface LayeredClimate {
  irradiance: IrradianceLayer
  season: SeasonLayer
  /** 全球年均表面温度 K。 */
  surfaceMeanK: number
  /** 全球年均表面温度 °C。 */
  surfaceMeanC: number
  /** 各纬度带。 */
  latitudes: LatitudeClimate[]
  /** 太阳直射点能达到的纬度范围（= ±倾角）。 */
  subsolarRangeDeg: number
  /** 极圈纬度（= 90 - 倾角）。倾角为 0 时无极圈。 */
  polarCircleDeg: number
}

const EARTH = {
  /** 地球轨道半长轴 m。 */
  au: 1.495978707e11,
  /** 地球年均辐照度 W/m²（太阳常数）。 */
  solarConstant: 1361,
  /** 地球按 0.306 反照率、1 AU 的平衡温度。 */
  equilibriumK: 255,
  /** 斯特藩-玻尔兹曼常数。 */
  sigma: 5.670374419e-8,
  /** 地球年均表面温度 K。 */
  surfaceMeanK: 288.15,
}

const toRad = (deg: number): number => (deg * Math.PI) / 180
const toDeg = (rad: number): number => (rad * 180) / Math.PI

/**
 * 第 1 层：算辐照度。
 *
 * S = L / (4πa²)
 * 偏心率影响：(1+e)² 与 (1-e)² 的比值，因为近日点距 a(1-e)、远日点 a(1+e)，
 * 而辐照度 ∝ 1/r²。
 */
export function computeIrradiance(
  luminosityW: number,
  semiMajorAxisM: number,
  eccentricity: number,
  albedo: number,
): IrradianceLayer {
  const annualMeanWm2 = luminosityW / (4 * Math.PI * semiMajorAxisM ** 2)
  const perihelionR = semiMajorAxisM * (1 - eccentricity)
  const aphelionR = semiMajorAxisM * (1 + eccentricity)
  const perihelionWm2 = luminosityW / (4 * Math.PI * perihelionR ** 2)
  const aphelionWm2 = luminosityW / (4 * Math.PI * aphelionR ** 2)
  const eccentricityAmplitude =
    annualMeanWm2 > 0 ? (perihelionWm2 - aphelionWm2) / annualMeanWm2 : 0

  // 辐射平衡温度：T_eq = [S(1-α) / (4σ)]^(1/4)
  // 除以 4 是因为全球平均把接收面积摊到球面积（πR² → 4πR²）
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
 * 第 2 层：分离季节成因。
 *
 * 这是整个模块最核心的部分。要点：
 *
 * 1. **轴倾角是主因**。判据：倾角 > 2° 就有天文季节。
 *    季节强度用 sin(倾角) 标度（因为太阳赤纬变化幅度就是 ±倾角，
 *    而高度角变化 ∝ sin）。
 *
 * 2. **偏心率是调制项**。它对温度的影响要经过三次折算：
 *    a) 辐照度变化 ΔS/S = (1+e)²/(1-e)² - 1
 *    b) 温度对辐照度的四分之一次方响应：ΔT/T ≈ 0.25 × ΔS/S
 *    c) 热惯性阻尼：海洋+大气把年周期波动削平，地球实测阻尼约 0.5
 *    所以地球 6.8% 的辐照度变化 → 约 0.85% 的温度变化，量级吻合。
 *
 * 3. **半球不对称性**。地球北半球冬季在近日点（1 月初），
 *    这使得北半球冬天比同纬度南半球冬天暖约 1-2°C。
 *    代码里用符号表示：正值 = 北半球季节更极端。
 */
export function computeSeason(
  obliquityDeg: number,
  eccentricity: number,
  irradiance: IrradianceLayer,
  greenhouseK: number,
  pressurePa: number,
  hasOcean: boolean,
  surfaceMeanK: number,
): SeasonLayer {
  // ── 轴倾角因子 ──
  // 地球 23.44° 定为 1.0。用 sin(倾角)/sin(23.44°) 标度：
  // 倾角 0 → 0（无季节）；倾角 90° → 2.5（半年极昼极夜）
  const obliquityFactor =
    Math.sin(toRad(Math.min(90, obliquityDeg))) / Math.sin(toRad(23.44))

  // ── 偏心率因子 ──
  // 地球 0.0167 定为基准（几乎可忽略）
  const eccentricityFactor = eccentricity / 0.0167

  // ── 偏心率对温度的影响（三段折算）──
  // a) 辐照度变化
  const deltaS = irradiance.eccentricityAmplitude
  // b) Stefan-Boltzmann 四次根响应：T ∝ S^(1/4) → ΔT/T = ΔS/(4S)
  let deltaT = deltaS / 4
  // c) 热惯性阻尼：海洋热容大，把年波动大幅削平
  //    无海洋（干燥岩石）阻尼弱，波动更接近理论值
  const inertiaDamping = hasOcean ? 0.5 : 0.8
  //    厚大气增强输运，进一步削平
  const atmosphereDamping = 1 / (1 + Math.min(2, pressurePa / 101325) * 0.15)
  deltaT *= inertiaDamping * atmosphereDamping

  const eccentricityTempAmplitude = deltaT

  // ── 谁主导 ──
  // 轴倾角贡献：从 0 到 sin(倾角) 的**高度角变化**带来的季节
  // 偏心率贡献：辐照度变化折算后的温度影响
  // 两者都是无量纲的相对强度，可以直接比大小
  const obliquityStrength = obliquityFactor
  const eccentricityStrength = eccentricityTempAmplitude / 0.0085 // 地球 0.85% 归一为 1

  let dominant: SeasonLayer['dominant']
  if (obliquityDeg < 2 && eccentricity < 0.05) dominant = 'neither'
  else if (obliquityDeg < 2) dominant = 'eccentricity'
  else if (eccentricity > 0.3 && eccentricityStrength > obliquityStrength) dominant = 'eccentricity'
  else if (eccentricity > 0.15) dominant = 'both'
  else dominant = 'obliquity'

  // ── 半球不对称 ──
  // 近日点发生在北半球冬季时（地球当前情况），北半球冬天被缓和；
  // 岁差会改变这一点，所以这里只给量级与符号说明。
  const hemisphericAsymmetry = eccentricityTempAmplitude * 0.5

  // ── 描述 ──
  let description: string
  let causeSummary: string

  if (dominant === 'neither') {
    description = '几乎没有季节。'
    causeSummary = '轴倾角接近 0 且轨道接近正圆 —— 没有天文季节，只有天气扰动。'
  } else if (dominant === 'obliquity') {
    description =
      obliquityDeg < 10
        ? '四季温和（倾角小）'
        : obliquityDeg < 35
          ? '四季分明（倾角接近地球）'
          : obliquityDeg < 60
            ? '季节极端（倾角大）'
            : '半球半年极昼半年极夜（倾角接近侧躺）'
    causeSummary =
      `季节由轴倾角 ${obliquityDeg.toFixed(1)}° 主导：太阳直射点在南北纬 ${obliquityDeg.toFixed(1)}° 之间往返，` +
      `造成太阳高度角与昼长的周期性变化。` +
      (eccentricity > 0.05
        ? `轨道偏心率 ${eccentricity.toFixed(3)} 只额外带来约 ${(eccentricityTempAmplitude * 100).toFixed(1)}% 的温度调制，` +
          '属**次要**因素：它让一个半球季节略强、另一个略弱，但不改变季节的南北反相本质。'
        : `轨道偏心率 ${eccentricity.toFixed(4)} 接近正圆，带来的温度调制仅约 ${(eccentricityTempAmplitude * 100).toFixed(2)}%，` +
          '属**次要**因素，可忽略。')
  } else if (dominant === 'eccentricity') {
    description = '季节由轨道距离主导（大偏心率）'
    causeSummary =
      `偏心率高达 ${eccentricity.toFixed(2)}，近日点与远日点距离差太大，` +
      `辐照度相差 ${(irradiance.eccentricityAmplitude * 100).toFixed(0)}%，` +
      `折算到温度约 ${(eccentricityTempAmplitude * 100).toFixed(1)}%，` +
      `已经超过轴倾角 ${obliquityDeg.toFixed(1)}° 的作用。` +
      '注意：这种世界的季节是**全球同步**的（整个星球同时变暖变冷），不是南北半球反相 —— 这与地球式季节完全不同。'
  } else {
    description = '轴倾角与轨道偏心率共同塑形季节'
    causeSummary =
      `轴倾角 ${obliquityDeg.toFixed(1)}° 造成南北半球反相的常规季节，` +
      `同时偏心率 ${eccentricity.toFixed(2)} 叠加了约 ${(eccentricityTempAmplitude * 100).toFixed(1)}% 的全球同步温度变化。` +
      '两者的叠加会让一个半球的季节更极端，另一个更温和。'
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
 * 某纬度的夏至/冬至正午太阳高度角。
 *
 * 公式：h = 90° - |φ - δ|
 * 其中 δ 是太阳赤纬，夏至 +ε、冬至 -ε（ε 为轴倾角）。
 * 当结果 < 0 时该纬度处于极夜。
 */
export function noonElevation(latitudeDeg: number, obliquityDeg: number, season: 'summer' | 'winter'): number {
  const declination = season === 'summer' ? obliquityDeg : -obliquityDeg
  const raw = 90 - Math.abs(Math.abs(latitudeDeg) - Math.abs(declination))
  // 南半球夏至时太阳赤纬在另一侧
  const adjusted = latitudeDeg >= 0 ? raw : 90 - Math.abs(Math.abs(latitudeDeg) - Math.abs(declination))
  return Math.max(0, adjusted)
}

/**
 * 某纬度的昼长。
 *
 * 公式：cos(H) = -tan(φ)·tan(δ)
 * 昼长 = 2H/15° 小时（H 为时角，单位度）
 * |−tanφ·tanδ| > 1 时进入极昼（24h）或极夜（0h）。
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
 * 年**平均**温度随纬度的分布。
 *
 * 校准历程（别随手改，这是试出来的）：
 *   cos²φ → 极地 3.9°C，明显偏热
 *   cos^1.5φ → 45° 准了，75° 给 0.2°C，仍偏热
 *   cos³φ + 极地放大 → 75° 到 -0.1°C，还不够冷
 *
 * 根本原因：真实温降主因不是「平均日照少」，而是**极夜** ——
 * 高纬有整月甚至半年完全无日照，散热期极长，冰雪反照率又形成正反馈。
 *
 * 地球校验目标：
 *   0°→27 | 30°→21 | 45°→12 | 60°→3 | 75°→-15 | 88°→-25
 */
export function annualMeanTemperature(
  latitudeDeg: number,
  globalMeanK: number,
  greenhouseK: number,
  pressureAtm: number,
): number {
  const s = Math.max(0, Math.cos(toRad(latitudeDeg)))
  // 大气越厚，热量向极地输运越强，温差越小
  const transport = Math.min(1.15, 0.32 + 0.68 * Math.min(1.2, pressureAtm))
  // 温室越强，极地相对保温越好
  const greenhouseDamping = 1 / (1 + greenhouseK / 50)

  const amplitude = 44 * transport * greenhouseDamping
  let temperature = globalMeanK + amplitude * (s ** 2 - 0.5)

  // 极夜惩罚
  const polarNightSeverity = Math.max(0, (Math.abs(latitudeDeg) - 55) / 33)
  temperature -= 32 * transport * greenhouseDamping * polarNightSeverity ** 1.35

  // 冰雪反照率正反馈
  if (greenhouseK > 5) {
    temperature -= 9 * transport * Math.max(0, (Math.abs(latitudeDeg) - 45) / 43) ** 2
  }

  return temperature
}

/**
 * 季节温度振幅随纬度。
 *
 * ⚠️ 这里踩过一个物理理解错误，务必保留说明：
 *
 * 最初的实现用 `sin²φ` 作纬度因子 —— 结果 45° 只算出 4.3K（应约 18K），
 * 而且赤道永远是 0K、高倾角世界赤道也没季节。这是错的。
 *
 * 为什么错：`sin²φ` 只反映「纬度越高太阳越斜」，完全不体现
 * **太阳高度角在一年内的变化幅度**。而季节的本质正是这个变化幅度。
 *
 * 正确做法：比较夏至与冬至的**正午太阳高度角**，取其正弦差：
 *
 *     h_夏 = 90° - |φ - ε|      （ε 为轴倾角，太阳赤纬 = +ε）
 *     h_冬 = 90° - |φ + ε|      （太阳赤纬 = -ε）
 *     季节性 ∝ sin(h_夏) - sin(h_冬)
 *
 * 这个形式天然满足两条关键物理：
 *   1. **ε = 0 时两者相等 → 差为 0 → 完全无季节**（自动成立，无需特判）
 *   2. **高倾角时所有纬度都有季节**，包括赤道
 *      （80° 倾角下赤道从太阳直射变到 10° 高度角，变化巨大）
 *
 * 地球校准（ε=23.44，按海拔 0、海洋性气候）：
 *   φ=0  → 0.00   → 振幅地板 2K（来自偏心率与半球不对称）
 *   φ=30 → 0.398  → 约 13K
 *   φ=45 → 0.560  → 约 18K   ← 实测最热月-最冷月差
 *   φ=60 → 0.689  → 约 22K
 *   φ=75 → 0.620 × 极夜加成 1.5 → 约 30K
 *
 * 最后乘热惯性阻尼：
 *   - 海洋把振幅压到 0.45（沿岸比内陆温和得多）
 *   - 厚大气进一步削平
 *   - 冷星球（水汽少、温室弱）振幅反而更大
 */
export function seasonalAmplitude(
  latitudeDeg: number,
  globalMeanK: number,
  obliquityDeg: number,
  pressureAtm: number,
  hasOcean: boolean,
): number {
  // 夏至/冬至正午太阳高度角（负值表示太阳在地平线下 = 极夜）
  const hSummer = 90 - Math.abs(Math.abs(latitudeDeg) - obliquityDeg)
  const hWinter = 90 - Math.abs(Math.abs(latitudeDeg) + obliquityDeg)

  // 正弦差即「一年内太阳加热能力的变化幅度」
  // 极夜时高度角为负 → 太阳完全不升起 → 贡献 0
  const sinSummer = Math.sin(toRad(Math.max(0, hSummer)))
  const sinWinter = hWinter > 0 ? Math.sin(toRad(hWinter)) : 0
  const swing = Math.max(0, sinSummer - sinWinter)

  // 基准系数：让 φ=45°、ε=23.44 时 swing=0.56 对应约 18K（阻尼前 54K）
  let amplitude = 96 * swing

  // 高纬极夜加成：>60° 后昼夜极端化，实际年温差比公式更陡
  const polarBoost = 1 + Math.max(0, (Math.abs(latitudeDeg) - 60) / 30) * 1.5
  amplitude *= polarBoost

  // 热惯性阻尼
  const oceanDamping = hasOcean ? 0.45 : 1.0
  const airDamping = 1 / (1 + Math.min(2.5, pressureAtm) * 0.35)
  amplitude *= oceanDamping * airDamping

  // 冷星球（远低于冰点）水汽少、温室弱，振幅反而更大
  if (globalMeanK < 260) amplitude *= 1.3

  // 振幅地板：即使赤道 swing=0，偏心率与半球不对称仍带来 2~3K 年温差
  // （地球赤道实测年较差约 2-3K，不是 0）
  return Math.max(2, amplitude)
}

/**
 * 气候带标签。按年均温划分，对应柯本气候分类大类。
 */
export function climateZone(
  latitudeDeg: number,
  tempC: number,
  hasLiquid: boolean,
  annualRangeK: number,
): string {
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

/**
 * 主函数：分层推算完整气候。
 */
export function computeLayeredClimate(input: ClimateInput): LayeredClimate {
  const irradiance = computeIrradiance(
    input.luminosityW,
    input.semiMajorAxisM,
    input.eccentricity,
    input.albedo,
  )

  // 温室效应加在平衡温度上
  const surfaceMeanK = irradiance.equilibriumK + input.greenhouseK

  const season = computeSeason(
    input.obliquityDeg,
    input.eccentricity,
    irradiance,
    input.greenhouseK,
    input.pressurePa,
    input.hasOcean,
    surfaceMeanK,
  )

  const pressureAtm = Math.max(0.001, input.pressurePa / 101325)
  const latitudes: LatitudeClimate[] = []

  for (const latitudeDeg of [0, 15, 30, 45, 60, 75, 88]) {
    const annualMeanK = annualMeanTemperature(
      latitudeDeg,
      surfaceMeanK,
      input.greenhouseK,
      pressureAtm,
    )

    // 季节振幅只由轴倾角主导！
    // 偏心率造成的是「全球同步」变化，不影响南北半球反相的振幅
    const amplitude = seasonalAmplitude(
      latitudeDeg,
      surfaceMeanK,
      input.obliquityDeg,
      pressureAtm,
      input.hasOcean,
    )

    // 有海洋时，暖季/冷季相位差，用简单对称处理
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
      zone: climateZone(
        latitudeDeg,
        annualMeanK - 273.15,
        input.hasOcean,
        amplitude,
      ),
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
