/**
 * 天空与星空：从地表抬头能看见什么。
 *
 * 设计原则（沿用本项目的方法论）：
 *   1. 只算**读者能感知**的部分：颜色、亮度、大小、可见数量，不推演整个辐射场；
 *   2. 每个数字都标出它是精确计算还是经验估算；
 *   3. 因果分层——"恒星温度决定颜色"与"天空为什么是蓝的"是两件事，分开算。
 *
 * 三层模型：
 *   第 1 层 恒星本身：温度 → 峰值波长 / 颜色 / 光谱型 / 吸收线 / 视星等 / 角直径
 *   第 2 层 白天的天空：瑞利散射 (1/λ⁴) + 太阳高度角 → 天顶色 / 日落色
 *   第 3 层 夜晚的天空：月光 + 气辉 + 光污染 → 极限星等 / 可见星数 / 夜空基色
 *
 * 精度声明：
 *   - 颜色用黑体 → sRGB 的经验近似（Tanner Helland 拟合，1000–40000K），
 *     给人眼观感用，不是 CIE 配色级精度；
 *   - 天空色用单次瑞利散射 + 三通道高斯投影，能量量级正确、绝对值不可当测光数据；
 *   - 极限星等与可见星数是经验公式（夜空亮度 ↔ 肉眼极限）。
 *
 * @module dsh-math-calculator/sky
 */

/** 维恩位移常数 m·K。 */
const WIEN = 2.897771955e-3
/** 太阳视星等（1 AU 处）。 */
const SUN_APPARENT_MAG = -26.74
/** 满月在地表产生的照度 lux（经验值，0.2–0.3 lux）。 */
const FULL_MOON_LUX = 0.25
/** 极暗夜空亮度 mag/arcsec²。 */
const DARK_SKY_MAG = 22

/** 观测输入。 */
export interface SkyInput {
  starTempK: number
  starRadiusM: number
  /** 恒星光度 W。 */
  starLuminosityW: number
  /** 行星轨道半长轴 AU。 */
  orbitAU: number
  /** 大气压 atm。 */
  pressureAtm: number
  /** 太阳高度角（度）：90 = 天顶，0 = 地平线。默认 60。 */
  sunAltitudeDeg?: number
  /** 卫星（用于夜间亮度），只需满相星等。 */
  moons?: Array<{ name: string; fullMagnitude: number }>
  /** 光污染 0-1（0 = 无人烟，1 = 特大城市）。默认 0。 */
  lightPollution?: number
  /** 银河带亮度 0-1（设定值）。默认 0.6。 */
  galaxyBand?: number
}

/** 恒星在天上的样子。 */
export interface StarVisual {
  tempK: number
  /** 峰值波长 nm（维恩位移）。 */
  peakWavelengthNm: number
  /** 颜色 hex。 */
  colorHex: string
  /** 中文观感色名。 */
  colorName: string
  /** 光谱型（O/B/A/F/G/K/M）。 */
  spectralClass: string
  /** 地表看到的视星等。 */
  apparentMagnitude: number
  /** 角直径（度）。太阳 = 0.53°。 */
  angularDiameterDeg: number
  /** 主要吸收线/谱特征。 */
  spectralLines: string
  description: string
}

/** 白天的天空。 */
export interface DaySky {
  sunAltitudeDeg: number
  zenithColorHex: string
  horizonColorHex: string
  description: string
}

/** 夜晚的天空。 */
export interface NightSky {
  /** 无月夜亮度 mag/arcsec²。 */
  darkSkyBrightness: number
  /** 满月夜亮度 mag/arcsec²。 */
  moonlitSkyBrightness: number
  /** 无月夜肉眼极限星等。 */
  darkLimitingMagnitude: number
  /** 满月夜肉眼极限星等。 */
  moonlitLimitingMagnitude: number
  /** 无月夜可见星数。 */
  visibleStarsDark: number
  /** 满月夜可见星数。 */
  visibleStarsMoonlit: number
  /** 叙事基准（取无月夜）。 */
  limitingMagnitude: number
  /** 叙事基准（取无月夜）。 */
  visibleStars: number
  /** 所有卫星同时满相时的总照度 lux。 */
  moonLightLux: number
  /** 无月夜银河是否可见。 */
  galaxyVisible: boolean
  /** 无月夜天顶色。 */
  zenithColorHex: string
  description: string
}

/** 观测汇总。 */
export interface SkyReport {
  star: StarVisual
  day: DaySky
  night: NightSky
  /** 供主模型二创的要点。 */
  summary: string[]
}

/** 夹取。 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** [0,255] 浮点 → 两位十六进制。 */
function hex2(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')
}

/** rgb → #rrggbb。 */
function toHex(r: number, g: number, b: number): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`
}

/** #rrggbb → [r,g,b]（0–255）。 */
function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

/**
 * 黑体温度 → 目视 RGB。
 *
 * 来源：Tanner Helland 的经典拟合（基于普朗克轨迹在 sRGB 上的近似）。
 * 适用 1000–40000K；超出范围夹取。给人眼观感用。
 */
export function kelvinToRgb(tempK: number): [number, number, number] {
  const t = clamp(tempK, 1000, 40000) / 100
  let r: number
  let g: number
  let b: number

  if (t <= 66) {
    r = 255
  } else {
    r = 329.698727446 * (t - 60) ** -0.1332047592
  }

  if (t <= 66) {
    g = 99.4708025861 * Math.log(t) - 161.1195681661
  } else {
    g = 288.1221695283 * (t - 60) ** -0.0755148492
  }

  if (t >= 66) {
    b = 255
  } else if (t <= 19) {
    b = 0
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307
  }

  return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)]
}

/** 黑体温度 → hex。 */
export function kelvinToHex(tempK: number): string {
  const [r, g, b] = kelvinToRgb(tempK)
  return toHex(r, g, b)
}

/** 峰值波长（nm）。 */
export function peakWavelengthNm(tempK: number): number {
  return (WIEN / Math.max(1, tempK)) * 1e9
}

/** 由温度判光谱型（主序近似）。 */
export function spectralClassOf(tempK: number): string {
  if (tempK >= 30000) return 'O'
  if (tempK >= 10000) return 'B'
  if (tempK >= 7500) return 'A'
  if (tempK >= 6000) return 'F'
  if (tempK >= 5200) return 'G'
  if (tempK >= 3700) return 'K'
  return 'M'
}

/** 各光谱型的典型吸收线（读者能感知的"这颗星为什么偏红/偏蓝"）。 */
const SPECTRAL_LINES: Record<string, string> = {
  O: 'He II 与强紫外连续谱——大量能量在可见光之外，肉眼只看到刺眼的蓝白',
  B: 'He I 中性氦线、氢线较窄——蓝白，像焊弧',
  A: '氢巴尔末线最强——白中带蓝，织女星型',
  F: 'Ca II H/K 线 + 金属线增多——黄白',
  G: 'Ca II 强、Fe I 线密集——暖白（太阳型）',
  K: 'Ca II 极强、金属线密布——橙黄',
  M: 'TiO 分子带把蓝光吃掉了——橙红，肉眼像余烬',
}

/** 颜色的中文观感名。 */
function colorName(tempK: number): string {
  if (tempK >= 20000) return '蓝白'
  if (tempK >= 10000) return '青白'
  if (tempK >= 7500) return '银白'
  if (tempK >= 6000) return '暖白'
  if (tempK >= 5200) return '淡黄'
  if (tempK >= 4200) return '橙黄'
  if (tempK >= 3300) return '橙色'
  return '暗红'
}

/**
 * 恒星在天上的样子。
 * @param input - 恒星与轨道参数。
 */
export function describeStar(input: SkyInput): StarVisual {
  const tempK = input.starTempK
  const classId = spectralClassOf(tempK)
  const luminositySun = input.starLuminosityW / 3.828e26
  const distanceM = input.orbitAU * 1.495978707e11

  // 视星等：m = -26.74 - 2.5log10(L/L☉) + 5log10(d/AU)
  const apparentMagnitude =
    SUN_APPARENT_MAG - 2.5 * Math.log10(luminositySun) + 5 * Math.log10(Math.max(1e-6, input.orbitAU))
  const angularDiameterDeg = (2 * Math.atan(input.starRadiusM / distanceM) * 180) / Math.PI
  const peak = peakWavelengthNm(tempK)
  const hex = kelvinToHex(tempK)
  const name = colorName(tempK)

  const description =
    `${classId} 型恒星，表面 ${Math.round(tempK)} K，辐射峰值 ${peak.toFixed(0)} nm（` +
    `${peak < 400 ? '紫外' : peak < 700 ? '可见光' : '红外'}）——肉眼看是${name}，色号 ${hex}。` +
    ` 在天上占 ${angularDiameterDeg.toFixed(2)}°（太阳 0.53°），视星等 ${apparentMagnitude.toFixed(1)}。`

  return {
    tempK,
    peakWavelengthNm: peak,
    colorHex: hex,
    colorName: name,
    spectralClass: classId,
    apparentMagnitude,
    angularDiameterDeg,
    spectralLines: SPECTRAL_LINES[classId],
    description,
  }
}

/**
 * 普朗克谱（任意单位）：B(λ,T) ∝ 1/λ⁵ · 1/(e^{hc/λkT} − 1)。
 * @param lambdaNm - 波长 nm。
 * @param tempK - 温度 K。
 */
function planck(lambdaNm: number, tempK: number): number {
  const h = 6.62607015e-34
  const c = 2.99792458e8
  const k = 1.380649e-23
  const lambda = lambdaNm * 1e-9
  const exponent = (h * c) / (lambda * k * tempK)
  if (exponent > 700) return 0
  return 1 / (lambda ** 5 * (Math.exp(exponent) - 1))
}

/** 三通道高斯响应（近似人眼/胶片的分色响应，不是 CIE）。 */
const CHANNELS: Array<{ center: number; sigma: number }> = [
  { center: 610, sigma: 55 }, // R
  { center: 550, sigma: 45 }, // G
  { center: 465, sigma: 42 }, // B
]

/**
 * 给一条光谱 → sRGB hex（只保留色度，按最亮通道归一化）。
 * @param spectral - 380–780nm 的采样函数（任意单位）。
 */
export function spectrumToHex(spectral: (lambdaNm: number) => number): string {
  const sums = [0, 0, 0]
  for (let lambda = 380; lambda <= 780; lambda += 5) {
    const intensity = spectral(lambda)
    if (!(intensity > 0)) continue
    for (let ch = 0; ch < 3; ch++) {
      const { center, sigma } = CHANNELS[ch]
      sums[ch] += intensity * Math.exp(-0.5 * ((lambda - center) / sigma) ** 2)
    }
  }
  const max = Math.max(...sums)
  if (!(max > 0)) return '#000000'
  return toHex((sums[0] / max) * 255, (sums[1] / max) * 255, (sums[2] / max) * 255)
}

/**
 * 天空的散射光谱：阳光经 1/λ⁴ 瑞利散射后进入眼睛的部分。
 *
 * 单次散射近似：
 *   L(λ) ∝ Planck(λ,T) · τ(λ) · e^{−τ(λ)·m_scatter} · e^{−τ(λ)·m_sun}
 * τ(λ) = τ₅₅₀ · (550/λ)⁴ · (气压/1atm)
 *
 * 三个可调项分别对应三件真实的事：
 *   - τ(λ) 的 1/λ⁴ → 白天天空偏蓝；
 *   - m_sun 变大（太阳低垂）→ 蓝光在路上被散射光，剩下红 → 日落；
 *   - 气压越高 → 散射越强 → 天空更浓、日落更红。
 *
 * @param sunTempK - 恒星温度。
 * @param sunAltitudeDeg - 太阳高度角（度）。
 * @param pressureAtm - 大气压（atm）。
 */
function skySpectrum(sunTempK: number, sunAltitudeDeg: number, pressureAtm: number): (lambdaNm: number) => number {
  const tau550 = 0.10 * clamp(pressureAtm, 0.05, 5)
  const altitude = clamp(sunAltitudeDeg, 0.1, 90)
  const airmassSun = 1 / Math.sin((altitude * Math.PI) / 180)
  const airmassScatter = 1
  return (lambdaNm: number) => {
    const tau = tau550 * (550 / lambdaNm) ** 4
    return planck(lambdaNm, sunTempK) * tau * Math.exp(-tau * airmassScatter) * Math.exp(-tau * airmassSun)
  }
}

/** 白天的天空配色。 */
export function daySky(input: SkyInput): DaySky {
  const altitude = clamp(input.sunAltitudeDeg ?? 60, 0.1, 90)
  const pressureAtm = clamp(input.pressureAtm, 0.05, 5)

  // 天顶：散射路径最短（m=1）
  const zenithHex = spectrumToHex(skySpectrum(input.starTempK, 90, pressureAtm))
  // 地平线：光路最长（m 大），蓝光被抽走 → 偏红
  const horizonHex = spectrumToHex(skySpectrum(input.starTempK, altitude, pressureAtm))

  // 天顶到底是"蓝"还是"橙"，取决于恒星温度——红矮星的白昼是橙金色，
  // 这里不能写死"蓝"，否则红矮星世界会输出自相矛盾的描述。
  const [zr, , zb] = hexToRgb(zenithHex)
  const tone = zb > zr + 25 ? '蓝' : zr > zb + 25 ? '橙金' : '灰白'

  let description: string
  if (altitude > 45) {
    description = `白天：天顶是 ${zenithHex} 的${tone}，地平线泛白（米氏散射 + 长光路）。`
  } else if (altitude > 10) {
    description = `太阳偏低（${altitude.toFixed(0)}°）：天顶仍是${tone}的，地平线开始转金红（${horizonHex}）。`
  } else if (altitude > 0.5) {
    description = `日落/日出：地平线烧成 ${horizonHex}，天顶还残留蓝色，中间是橙粉过渡带。`
  } else {
    description = '太阳在地平线下：进入暮光，天空从橙红褪到深蓝，星星开始出现。'
  }

  return { sunAltitudeDeg: altitude, zenithColorHex: zenithHex, horizonColorHex: horizonHex, description }
}

/** 夜晚的天空：亮度、极限星等、可见星数。 */
export function nightSky(input: SkyInput): NightSky {
  const moons = input.moons ?? []
  const pollution = clamp(input.lightPollution ?? 0, 0, 1)
  const galaxyBand = clamp(input.galaxyBand ?? 0.6, 0, 1)

  // 月光照度：满月 0.25 lux，星等每亮 5 等照度 ×100
  let moonLux = 0
  for (const moon of moons) {
    moonLux += FULL_MOON_LUX * 10 ** (-0.4 * (moon.fullMagnitude - -12.74))
  }

  /** 由月光照度 + 光污染算夜空亮度（mag/arcsec²，越大越暗）。 */
  function brightnessOf(lux: number): number {
    let value = DARK_SKY_MAG - 4.5 * Math.log10(1 + lux / 0.02)
    value = Math.min(value, 21.5 - 4.5 * pollution)
    return clamp(value, 12, DARK_SKY_MAG)
  }

  // 经验映射：B=22 → 6.5 等；B=17 → 4.0 等
  function limitOf(brightness: number): number {
    return clamp(6.5 - (DARK_SKY_MAG - brightness) * 0.5, 2.5, 7.5)
  }

  const darkBrightness = brightnessOf(0)
  const moonlitBrightness = brightnessOf(moonLux)
  const darkLimit = limitOf(darkBrightness)
  const moonlitLimit = limitOf(moonlitBrightness)

  // 全天可见星数：N(<m) ≈ 9100 · 10^{0.6(m−6.5)}
  const visibleStarsDark = Math.round(9100 * 10 ** (0.6 * (darkLimit - 6.5)))
  const visibleStarsMoonlit = Math.round(9100 * 10 ** (0.6 * (moonlitLimit - 6.5)))

  // 夜空基色：气辉（557.7nm 绿线）+ 月光 + 光污染；用满月值给"最亮的那种夜"
  const airglow = 6 * (1 - pollution)
  const moonTint = clamp(moonLux / FULL_MOON_LUX, 0, 3)
  const r = 2 + moonTint * 26 + pollution * 24
  const g = 3 + moonTint * 28 + pollution * 22 + airglow
  const b = 5 + moonTint * 34 + pollution * 30 + airglow * 0.4
  const zenithColorHex = toHex(r, g, b)

  const galaxyVisible = darkLimit >= 5.0 && galaxyBand > 0.25

  const parts: string[] = []
  parts.push(
    `无月夜：夜空亮度 ${darkBrightness.toFixed(1)} mag/arcsec²，肉眼极限 ${darkLimit.toFixed(1)} 等，全天约 ${visibleStarsDark.toLocaleString('en-US')} 颗星` +
      (galaxyVisible ? '，银河可见' : '，银河不可见'),
  )
  if (moons.length > 0) {
    parts.push(
      `满月夜：极限 ${moonlitLimit.toFixed(1)} 等，只剩约 ${visibleStarsMoonlit.toLocaleString('en-US')} 颗亮星，月光把夜空压成灰蓝`,
    )
  }
  parts.push(`两种夜的亮度差约 ${(darkBrightness - moonlitBrightness).toFixed(1)} mag`)

  return {
    darkSkyBrightness: darkBrightness,
    moonlitSkyBrightness: moonlitBrightness,
    darkLimitingMagnitude: darkLimit,
    moonlitLimitingMagnitude: moonlitLimit,
    visibleStarsDark,
    visibleStarsMoonlit,
    limitingMagnitude: darkLimit,
    visibleStars: visibleStarsDark,
    moonLightLux: moonLux,
    galaxyVisible,
    zenithColorHex,
    description: parts.join('；') + '。',
  }
}

/**
 * 观测汇总：把恒星、白天、夜晚三层拼成读者能用的画像。
 * @param input - 观测输入。
 */
export function observeSky(input: SkyInput): SkyReport {
  const star = describeStar(input)
  const day = daySky(input)
  const night = nightSky(input)

  const summary: string[] = []
  summary.push(`抬头看见的太阳：${star.colorName}（${star.colorHex}），在天上 ${star.angularDiameterDeg.toFixed(2)}°。`)

  if (star.tempK > 8000) {
    summary.push('恒星偏蓝：白天阴影带冷调，植物若靠可见光光合会偏向吸收红光。')
  } else if (star.tempK < 4200) {
    summary.push('恒星偏红：白天像永远处在黄昏，天空可能偏橙而非纯蓝，植物会倾向吸收蓝光。')
  } else {
    summary.push('恒星接近太阳型：白天的颜色与地球相仿，读者不会有陌生感。')
  }

  summary.push(day.description)
  summary.push(night.description)

  if (day.sunAltitudeDeg >= 0.5) {
    summary.push('白天看不见别的星星——大气散射把天空点亮到压过人眼阈值。')
  }

  return { star, day, night, summary }
}