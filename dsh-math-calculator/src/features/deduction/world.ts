/**
 * 星球世界推演（World Profile）。
 *
 * 输入一组基础物理参数，输出这个世界的"体感画像"：重力、昼夜、
 * 一年多长、四季成因、各纬度气候、地形上限、天空、卫星、生命闸门。
 *
 * ## 三条设计原则
 *
 * 1. 全部参数有地球默认值。喂地球参数必须还原出地球——这是模型校验手段。
 * 2. 区分"精确可算"与"粗略估计"：重力/逃逸/周期/标高/雪线是代数关系；
 *    纬度温度带涉及环流与洋流，只能给辐射平衡下的量级。
 * 3. 主动做一致性检查：自转过快会解体、离恒星太近会被潮汐锁定、
 *    大气太薄无法保温——这些矛盾要显式警告，而不是给一堆自洽的假数字。
 *
 * ## 数据注入
 *
 * 常数基准与光谱型表由调用方注入（v3 的数据/逻辑分离约定）。
 * 缺省时退回现实基准值，保证"只给地球参数"能直接跑。
 *
 * @module dsh-math-calculator/features/deduction/world
 */

import {
  surfaceGravity as physicsSurfaceGravity,
  escapeVelocity as physicsEscapeVelocity,
  orbitalVelocity as physicsOrbitalVelocity,
  orbitalPeriod as physicsOrbitalPeriod,
  meanDensity as physicsMeanDensity,
  centrifugalRatio as physicsCentrifugalRatio,
  stellarLuminosity as physicsStellarLuminosity,
  buildingHeightLimit as physicsBuildingHeightLimit,
  dryLapseRate as physicsDryLapseRate,
  numOr,
  toRad,
} from './physics.js'
import { computeLayeredClimate, type LayeredClimate, type LatitudeClimate } from './climate.js'
import { describeStarStructure, type StellarProfile } from './stellar.js'
import { observeSky, type SkyReport } from './sky.js'
import { analyzeMoonSystem, type MoonSpec, type MoonSystemReport } from './moons.js'
import { chemistryWindow, assessLife, type ChemistryWindow, type LifeGate } from './life.js'
import { checkWorld, type IntegrationCheck } from './integration.js'
import { closestStarClass, describeStarClass, type StarClass } from './star-catalog.js'
import {
  ALPHA_REAL,
  BASE_PHYSICS,
  OUR_KNOBS,
  dimensionlessFromKnobs,
  materialStrengthFromAlpha,
} from './constants.js'

/** 世界参数（全部可选，默认地球）。 */
export interface WorldParams {
  /** 恒星质量（太阳质量）。 */
  starMass?: number
  /** 恒星半径（太阳半径）。 */
  starRadius?: number
  /** 恒星表面温度 K。 */
  starTemp?: number
  /** 轨道半长轴 AU。 */
  orbitAU?: number
  /** 轨道偏心率。 */
  eccentricity?: number
  /** 行星质量（地球质量）。 */
  planetMass?: number
  /** 行星半径（地球半径）。 */
  planetRadius?: number
  /** 自转周期 小时。 */
  rotationHours?: number
  /** 轴倾角 度。 */
  obliquityDeg?: number
  /** 反照率 0-1。 */
  albedo?: number
  /** 海平面气压 Pa。 */
  pressure?: number
  /** 大气平均摩尔质量 kg/mol。 */
  molarMass?: number
  /** 绝热指数。 */
  gamma?: number
  /** 温室增温 K。 */
  greenhouse?: number
  /** 地表材料抗压强度 Pa。 */
  materialStrength?: number
  /** 地表材料密度 kg/m³。 */
  materialDensity?: number
  /** 液态溶剂是否存在。 */
  hasLiquid?: boolean
  /** 光谱型 id（如 'G2V'）。 */
  starClass?: string
  /** 卫星数量。 */
  moonCount?: number
  /** 主卫星质量（月球质量）。 */
  moonMass?: number
  /** 主卫星轨道半径（地月距离）。 */
  moonDistance?: number
  /** 多卫星设定。 */
  moons?: MoonSpec[]
  /** 光污染 0-1。 */
  lightPollution?: number
  /** 银河带亮度 0-1。 */
  galaxyBand?: number
  /** 'solar' 或 'sidereal'。 */
  dayDefinition?: string
}

/** 一个纬度带的气候数据。 */
export interface LatitudeBand {
  latitudeDeg: number
  noonElevationSummer: number
  noonElevationWinter: number
  dayLengthSummer: number
  dayLengthWinter: number
  insolation: number
  approxTempK: number
  approxTempC: number
  zone: string
  warmSeasonC: number
  coldSeasonC: number
  annualRangeK: number
}

/** 推演结果。 */
export interface WorldProfile {
  star: { massKg: number; radiusM: number; tempK: number; luminosityW: number; luminositySun: number }
  orbit: {
    semiMajorAxisAU: number
    semiMajorAxisM: number
    eccentricity: number
    yearDays: number
    orbitalVelocity: number
    perihelionTempDeltaPercent: number
  }
  planet: {
    massKg: number
    radiusM: number
    densityKgM3: number
    surfaceGravity: number
    surfaceGravityEarth: number
    escapeVelocity: number
    dayHours: number
    centrifugalRatio: number
  }
  temperature: {
    equilibriumK: number
    surfaceMeanK: number
    surfaceMeanC: number
    boilingPointK: number
    boilingPointC: number
    freezingPointK: number
  }
  atmosphere: {
    pressurePa: number
    pressureAtm: number
    scaleHeightM: number
    molarMass: number
    relativeToEarth: number
    altitudeHalfPressure: number
    altitudeTenthPressure: number
  }
  latitudeBands: LatitudeBand[]
  terrain: {
    maxMountainHeight: number
    snowLineM: number
    horizonKm: number
    hasSeasons: boolean
    seasonStrength: string
  }
  climate: LayeredClimate
  starClass: StarClass | null
  moons: {
    count: number
    primaryMassKg: number
    primaryDistanceM: number
    tidalAccel: number
    tidalRelativeEarth: number
    likelyTidallyLocked: boolean
    angularDiameterDeg: number
  }
  moonSystem: MoonSystemReport
  sky: SkyReport
  stellar: StellarProfile
  life: { chemistry: ChemistryWindow; gate: LifeGate }
  checks: IntegrationCheck[]
  calendar: {
    solarDayHours: number
    siderealDayHours: number
    daysPerYear: number
    localDaysPerYear: number
    monthsPerYear: number
    daysPerMonth: number
    seasonCount: number
    daysPerSeason: number
    leapRule: string
  }
  warnings: string[]
  highlights: string[]
  starNotes: string[]
}

/** 注入的数据。 */
export interface WorldDeps {
  /** 常数基准（通常来自 `src/data/constants-graph.json` 的 name→standard）。 */
  constants?: Record<string, number>
  /** 光谱型表（通常来自 `src/data/stars.json`）。 */
  starClasses?: StarClass[]
}

/** 地球基准。 */
const EARTH = {
  mass: 5.9722e24,
  radius: 6.371e6,
  g: 9.80665,
  dayHours: 23.9344696,
  yearDays: 365.25636,
  tempK: 288.15,
}

/** 月球基准。 */
const MOON_MASS = 7.342e22
const MOON_DIST = 3.844e8

/** 由常数表取一个值，缺项退回现实基准。 */
function pick(K: Record<string, number>, name: string, fallback: number): number {
  const value = K[name]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * 世界推演总入口。
 *
 * @param params - 作者给的设定（缺省 = 地球）
 * @param deps - 注入的常数基准与光谱型表
 * @returns 完整画像
 *
 * 失败策略：不抛异常，异常降级成 warnings——作者改设定时不该被中断。
 * 但"参数非法"（如负质量）由调用方（op 层）先行校验。
 */
export function generateWorld(params: WorldParams, deps: WorldDeps = {}): WorldProfile {
  const warnings: string[] = []
  const highlights: string[] = []
  const K = deps.constants ?? {}

  const num = (value: number | undefined, fallback: number): number => numOr(value, fallback)
  const c = pick(K, 'c', OUR_KNOBS.c)
  const hbar = pick(K, 'hbar', OUR_KNOBS.hbar)
  const eCharge = pick(K, 'e_charge', OUR_KNOBS.e)
  const epsilon0 = pick(K, 'epsilon0', OUR_KNOBS.epsilon0)
  const me = pick(K, 'me', OUR_KNOBS.me)
  const mp = pick(K, 'mp', OUR_KNOBS.mp)
  const G = pick(K, 'G', OUR_KNOBS.G)
  const sigma = pick(K, 'sigma', BASE_PHYSICS.sigma)
  const gasR = pick(K, 'R', BASE_PHYSICS.R)
  const AU = pick(K, 'AU', BASE_PHYSICS.AU)
  const Msun = pick(K, 'Msun', BASE_PHYSICS.Msun)
  const Rsun = pick(K, 'Rsun', BASE_PHYSICS.Rsun)
  const Lsun = pick(K, 'Lsun', BASE_PHYSICS.Lsun)

  const alpha = dimensionlessFromKnobs({ c, hbar, e: eCharge, epsilon0, me, mp, G }).alpha

  // ── 恒星 ──
  const starNotes: string[] = []
  const starClasses = deps.starClasses ?? []
  let baseStar: StarClass | undefined
  if (typeof params.starClass === 'string' && params.starClass.trim() !== '') {
    const requested = starClasses.find((s) => s.id === params.starClass!.trim())
    if (requested) baseStar = requested
    else {
      const upper = params.starClass.trim().toUpperCase()
      baseStar = starClasses.find((s) => s.id.startsWith(upper))
      if (!baseStar) {
        baseStar = closestStarClass(starClasses, num(params.starTemp, 5778))
        if (starClasses.length > 0) {
          starNotes.push(
            '未找到光谱型「' + params.starClass + '」，已按温度推断为 ' + baseStar!.id + '（主序星）。可选值：' +
              starClasses.map((s) => s.id).join(', '),
          )
          const lumMatch = params.starClass.trim().match(/(III|II|IV|I)\b/i)
          const lum = lumMatch ? lumMatch[1].toUpperCase() : undefined
          if (lum !== undefined && lum !== 'V') {
            starNotes.push(
              '⚠ 你给的是「' + lum + '」级（巨/次巨星），而本模型只支持主序星（V）。' +
                '同光谱字母的巨星比主序星亮 20—100 倍，因此温度、宜居带、日照量都会显著偏低——这个结果不能直接采信。' +
                '要接近真实，请显式给 starMass 与 starRadius。',
            )
          }
        }
      }
    }
  } else {
    baseStar = closestStarClass(starClasses, num(params.starTemp, 5778))
    const gaveAnyStar =
      params.starMass !== undefined || params.starRadius !== undefined || params.starTemp !== undefined
    if (!gaveAnyStar) {
      starNotes.push(
        '没有给任何恒星参数，已默认成太阳（G2V，1 L☉，5778 K）。' +
          '若这颗行星绕的不是太阳型恒星（例如 K 型橙星或 F 型巨星），温度与宜居带会差很多。',
      )
    }
  }

  const starMassSun = num(params.starMass, baseStar?.massSun ?? 1)
  const starRadiusSun = num(params.starRadius, baseStar?.radiusSun ?? 1)
  const starTempK = num(params.starTemp, baseStar?.tempK ?? 5778)
  const starMassKg = starMassSun * Msun
  const starRadiusM = starRadiusSun * Rsun
  const luminosityW = physicsStellarLuminosity(sigma, starRadiusM, starTempK)
  const luminositySun = luminosityW / Lsun

  if (starTempK < 2400) warnings.push('恒星表面温度 ' + starTempK + 'K 低于红矮星下限，光谱以红外为主，光合作用可能无法进行。')
  if (starTempK > 40000) warnings.push('恒星表面温度 ' + starTempK + 'K 属 O 型星，紫外辐射极强，生命需强屏蔽。')

  const explicitStar = params.starRadius !== undefined || params.starTemp !== undefined
  const stellar = describeStarStructure(
    starMassSun,
    alpha,
    explicitStar ? { luminositySun, radiusSun: starRadiusSun } : undefined,
  )

  // ── 轨道 ──
  const orbitAU = num(params.orbitAU, 1)
  const eccentricity = Math.min(0.95, Math.max(0, num(params.eccentricity, 0.0167)))
  const orbitM = orbitAU * AU
  const yearSeconds = physicsOrbitalPeriod(G, starMassKg, orbitM)
  const yearDays = yearSeconds / 86400
  const orbitalVelocity = physicsOrbitalVelocity(G, starMassKg, orbitM)
  const perihelionTempDeltaPercent = ((1 + eccentricity) / (1 - eccentricity)) ** 0.5 - 1
  if (eccentricity > 0.3) {
    warnings.push(
      '轨道偏心率 ' + eccentricity + ' 较高，近日点/远日点温度差约 ' +
        (perihelionTempDeltaPercent * 100).toFixed(0) + '%，季节将由轨道主导而非轴倾角。',
    )
  }

  // ── 行星本体 ──
  const planetMassEarth = num(params.planetMass, 1)
  const planetRadiusEarth = num(params.planetRadius, 1)
  const planetMassKg = planetMassEarth * EARTH.mass
  const planetRadiusM = planetRadiusEarth * EARTH.radius
  const densityKgM3 = physicsMeanDensity(planetMassKg, planetRadiusM)
  const surfaceGravity = physicsSurfaceGravity(G, planetMassKg, planetRadiusM)
  const surfaceGravityEarth = surfaceGravity / EARTH.g
  const escapeVelocity = physicsEscapeVelocity(G, planetMassKg, planetRadiusM)

  const obliquityDeg = Math.min(90, Math.max(0, num(params.obliquityDeg, 23.44)))
  const rotationHours = num(params.rotationHours, EARTH.dayHours)
  const omega = (2 * Math.PI) / (rotationHours * 3600)
  const centrifugalRatio = physicsCentrifugalRatio(omega, planetRadiusM, surfaceGravity)

  if (centrifugalRatio > 0.5) {
    warnings.push(
      '赤道离心加速度已达重力的 ' + (centrifugalRatio * 100).toFixed(0) +
        '%，自转太快：星球会变成扁球，赤道重力和极地差异巨大，且接近解体极限。',
    )
  } else if (centrifugalRatio > 0.2) {
    warnings.push(
      '赤道离心加速度为重力的 ' + (centrifugalRatio * 100).toFixed(0) + '%，赤道会比极地明显"轻"，赤道生物体型可更大。',
    )
  }
  if (densityKgM3 > 12000) warnings.push('平均密度 ' + densityKgM3.toFixed(0) + ' kg/m³ 超过致密金属，可能需要简并态物质。')
  if (densityKgM3 < 500 && planetRadiusEarth > 0.5) warnings.push('平均密度仅 ' + densityKgM3.toFixed(0) + ' kg/m³，低于水，可能是气态/冰质天体。')

  // ── 温度 ──
  const albedo = Math.min(0.95, Math.max(0, num(params.albedo, 0.306)))
  const equilibriumK = ((luminosityW * (1 - albedo)) / (16 * Math.PI * sigma * orbitM ** 2)) ** 0.25
  const greenhouseK = Math.max(0, num(params.greenhouse, 33))
  const surfaceMeanK = equilibriumK + greenhouseK
  const surfaceMeanC = surfaceMeanK - 273.15

  const pressurePa = Math.max(1, num(params.pressure, 101325))
  const pressureAtm = pressurePa / 101325
  const latentHeatVap = 40650
  const boilingPointK = 1 / (1 / 373.15 - (gasR * Math.log(pressurePa / 101325)) / latentHeatVap)
  const boilingPointC = boilingPointK - 273.15
  const freezingPointK = 273.15
  const hasLiquid = params.hasLiquid ?? true

  if (pressureAtm < 0.6) {
    warnings.push(
      '气压只有地球的 ' + (pressureAtm * 100).toFixed(0) + '%（' + pressurePa.toFixed(0) + ' Pa）。' +
        '水在 ' + boilingPointC.toFixed(0) + '°C 就沸腾，无法正常烹饪、伤口会快速失血、液态水蒸发极快；' +
        '若气压低于约 0.06 atm，未加压的血液会沸腾。',
    )
  }
  if (boilingPointC < 80) {
    highlights.push('水在 ' + boilingPointC.toFixed(0) + '°C 沸腾——高原煮不熟食物是常态，文明可能依赖烘烤/发酵而非水煮。')
  }
  if (pressureAtm > 3) {
    highlights.push('气压是地球的 ' + pressureAtm.toFixed(1) + ' 倍，空气浓稠：飞行更容易、但呼吸阻力大，声音传播更远更低沉。')
  }
  if (hasLiquid && surfaceMeanC < 0) {
    warnings.push('平均温度 ' + surfaceMeanC.toFixed(1) + '°C 低于冰点，液态溶剂无法长期存在于表面（可能是雪球世界）。')
  }
  if (hasLiquid && surfaceMeanK > boilingPointK) {
    warnings.push('平均温度 ' + surfaceMeanC.toFixed(1) + '°C 高于表面沸点 ' + boilingPointC.toFixed(0) + '°C，液态溶剂无法存在（可能是金星式失控温室）。')
  }

  // ── 大气 ──
  const molarMass = Math.max(0.002, num(params.molarMass, 0.02896))
  const gamma = Math.max(1.01, num(params.gamma, 1.4))
  const scaleHeightM = (gasR * surfaceMeanK) / (molarMass * surfaceGravity)
  const altitudeHalfPressure = scaleHeightM * Math.log(2)
  const altitudeTenthPressure = scaleHeightM * Math.log(10)
  const earthScaleHeight = (gasR * 288.15) / (0.02896 * EARTH.g)
  const relativeToEarth = scaleHeightM / earthScaleHeight

  if (scaleHeightM < 3000) {
    warnings.push('大气标高仅 ' + (scaleHeightM / 1000).toFixed(1) + 'km（地球 8.5km），大气极薄，昼夜温差会非常剧烈、宇宙射线直射。')
  }
  const thermalSpeed = Math.sqrt((3 * gasR * surfaceMeanK) / molarMass)
  const escapeRatio = escapeVelocity / thermalSpeed
  if (escapeRatio < 6) {
    warnings.push('逃逸速度仅为热运动速度的 ' + escapeRatio.toFixed(1) + ' 倍，大气会持续流失——这个世界可能没有长期稳定的大气层。')
  }
  // gamma 参与绝热判断（仅用于标高修正的说明，不改变主算式）
  void gamma

  // ── 分层气候 ──
  const layered = computeLayeredClimate({
    alpha,
    luminosityW,
    semiMajorAxisM: orbitM,
    eccentricity,
    obliquityDeg,
    albedo,
    greenhouseK,
    pressurePa,
    rotationHours,
    hasOcean: hasLiquid,
  })

  const latitudeBands: LatitudeBand[] = layered.latitudes.map((band: LatitudeClimate) => ({
    latitudeDeg: band.latitudeDeg,
    noonElevationSummer: band.noonElevationSummer,
    noonElevationWinter: band.noonElevationWinter,
    dayLengthSummer: band.dayLengthSummer,
    dayLengthWinter: band.dayLengthWinter,
    insolation: band.relativeInsolation,
    approxTempK: band.annualMeanK,
    approxTempC: band.annualMeanC,
    zone: band.zone,
    warmSeasonC: band.warmSeasonK - 273.15,
    coldSeasonC: band.coldSeasonK - 273.15,
    annualRangeK: band.annualRangeK,
  }))

  // ── 地形 ──
  const derivedStrength = materialStrengthFromAlpha(alpha)
  const materialStrength = num(params.materialStrength, derivedStrength)
  const materialDensity = Math.max(100, num(params.materialDensity, 2700))
  const maxMountainHeight = physicsBuildingHeightLimit(materialStrength, materialDensity, surfaceGravity)

  const earthGravity = (OUR_KNOBS.G * EARTH.mass) / EARTH.radius ** 2
  const LAPSE_MOIST_FACTOR = 0.0065 / ((earthGravity * 0.02896) / (3.5 * BASE_PHYSICS.R))
  const lapseRate = physicsDryLapseRate(surfaceGravity, molarMass, gasR) * LAPSE_MOIST_FACTOR
  const snowLineM = surfaceMeanK > freezingPointK ? (surfaceMeanK - freezingPointK) / lapseRate : 0
  const horizonKm = Math.sqrt(2 * planetRadiusM * 1.7 + 1.7 ** 2) / 1000

  if (snowLineM === 0) {
    highlights.push('全球年均温低于冰点——海平面就是雪线，任何陆地都被冰雪覆盖（雪球世界）。')
  }

  const hasSeasons = obliquityDeg > 2 || eccentricity > 0.05
  const seasonStrength =
    obliquityDeg < 2
      ? eccentricity > 0.05
        ? '无轴倾角季节，但轨道偏心带来季节'
        : '几乎没有季节'
      : obliquityDeg < 10
        ? '四季温和'
        : obliquityDeg < 35
          ? '四季分明'
          : obliquityDeg < 60
            ? '季节极端（夏季酷热、冬季极寒）'
            : '倾角接近 90°，半球半年极昼半年极夜'
  if (obliquityDeg > 60) {
    warnings.push('轴倾角 ' + obliquityDeg + '°，接近"侧躺"自转：极区会经历半年白昼与半年黑夜，赤道反而季节温和。')
  }

  // ── 读者感知要点 ──
  highlights.unshift(
    '表面重力是地球的 ' + surfaceGravityEarth.toFixed(2) + ' 倍' +
      (surfaceGravityEarth < 0.7
        ? '——跳跃更高更远，坠落伤害更小，大体积生物更容易支撑。'
        : surfaceGravityEarth > 1.4
          ? '——动作沉重、攀爬困难，生物得长成矮壮型才撑得住，飞行几乎不可能。'
          : '——与地球相近，人类体感几乎无差异。'),
  )
  if (Math.abs(rotationHours - 24) > 2) {
    highlights.push(
      rotationHours < 24
        ? '一天只有 ' + rotationHours.toFixed(1) + ' 小时——昼夜切换极快，生物节律与人类完全不同。'
        : '一天长达 ' + rotationHours.toFixed(1) + ' 小时——正午酷热、深夜严寒，作息会是"分段睡眠"。',
    )
  }
  highlights.push('一年 ' + yearDays.toFixed(0) + ' 天（地球日），恒星天顶每天移动约 ' + (360 / yearDays).toFixed(2) + '°。')
  if (Math.abs(surfaceMeanC) > 5) {
    highlights.push('全球平均气温 ' + surfaceMeanC.toFixed(0) + '°C（地球 15°C）。')
  }
  if (escapeRatio >= 6 && scaleHeightM >= 3000) {
    highlights.push('地平线距离 ' + horizonKm.toFixed(1) + 'km（地球 4.7km）——决定"世界看起来多大"。')
  }

  // ── 卫星与潮汐 ──
  const primarySpec = params.moons && params.moons.length > 0 ? params.moons[0] : undefined
  const moonCount =
    params.moons && params.moons.length > 0 ? params.moons.length : Math.max(0, Math.round(num(params.moonCount, 1)))
  const moonMassKg = (primarySpec ? num(primarySpec.massMoon, 1) : num(params.moonMass, 1)) * MOON_MASS
  const moonDistanceM = (primarySpec ? num(primarySpec.distanceMoon, 1) : num(params.moonDistance, 1)) * MOON_DIST

  const tidalAccel = moonCount > 0 ? (2 * G * moonMassKg * planetRadiusM) / moonDistanceM ** 3 : 0
  const earthTidalAccel = (2 * G * MOON_MASS * EARTH.radius) / MOON_DIST ** 3
  const tidalRelativeEarth = tidalAccel / earthTidalAccel

  const moonRadiusM = moonCount > 0 ? Math.cbrt((3 * moonMassKg) / (4 * Math.PI * densityKgM3)) : 0
  const angularDiameterDeg = moonCount > 0 ? (2 * Math.atan(moonRadiusM / moonDistanceM) * 180) / Math.PI : 0
  const likelyTidallyLocked = orbitAU < 0.1 && moonCount === 0 && rotationHours * 3600 > yearSeconds * 0.5

  if (moonCount === 0) {
    highlights.push('没有卫星——没有潮汐、没有月相，夜空只有恒星。航海文明不会有"潮汐历"，神话里缺少月亮。')
  } else if (tidalRelativeEarth > 3) {
    highlights.push(
      '潮汐是地球的 ' + tidalRelativeEarth.toFixed(1) + ' 倍——海岸带会被反复剧烈冲刷，可能形成极宽的潮间带（生命登陆的温床），或让沿海文明无法定居。',
    )
  } else if (tidalRelativeEarth < 0.3) {
    highlights.push('潮汐只有地球的 ' + tidalRelativeEarth.toFixed(1) + ' 倍，海面平静，潮间带生态贫乏。')
  }
  if (angularDiameterDeg > 0) {
    const earthMoonDeg = (2 * Math.atan(1.737e6 / MOON_DIST) * 180) / Math.PI
    if (angularDiameterDeg > earthMoonDeg * 3) {
      highlights.push(
        '主卫星在天上看起来是月球的 ' + (angularDiameterDeg / earthMoonDeg).toFixed(1) +
          ' 倍大——夜空的绝对主角，会主导所有文化的历法与神话。',
      )
    }
  }
  if (likelyTidallyLocked) {
    warnings.push(
      '行星可能被潮汐锁定：一面永久白昼、一面永久黑夜。晨昏线附近是唯一宜居带，大气会在夜面凝结/冻结，形成剧烈的全球环流。',
    )
  }

  // ── 化学窗口与生命闸门 ──
  const lifeChemistry = chemistryWindow(alpha, surfaceMeanK)
  const warmestBandK = Math.max(...latitudeBands.map((b) => b.warmSeasonC + 273.15))
  const coldestBandK = Math.min(...latitudeBands.map((b) => b.coldSeasonC + 273.15))
  const lifeGate = assessLife(
    {
      surfaceMeanK,
      warmestBandK,
      coldestBandK,
      pressurePa,
      boilingPointK,
      stellarLifetimeGyr: stellar.lifetimeAlphaGyr,
      uvFraction: stellar.uvFraction,
      tidallyLocked: likelyTidallyLocked,
    },
    alpha,
  )
  if (lifeGate.verdict === 'excluded') {
    warnings.push(
      '生命闸门判定为"排除"：' +
        lifeGate.blockers.filter((b) => b.kind === 'hard').map((b) => b.reason).join('；'),
    )
  }

  // ── 多卫星系统体检 ──
  const moonSpecs: MoonSpec[] =
    params.moons && params.moons.length > 0
      ? params.moons
      : moonCount > 0
        ? [{ massMoon: num(params.moonMass, 1), distanceMoon: num(params.moonDistance, 1) }]
        : []
  const moonSystem = analyzeMoonSystem({
    planetMassKg,
    planetRadiusM,
    planetDensityKgM3: densityKgM3,
    starMassKg,
    orbitM,
    planetRotationHours: rotationHours,
    moons: moonSpecs,
    G,
  })
  warnings.push(...moonSystem.warnings)
  highlights.push(...moonSystem.highlights)

  // ── 天空 ──
  const sky = observeSky({
    alpha,
    starTempK,
    starRadiusM,
    starLuminosityW: luminosityW,
    orbitAU,
    pressureAtm,
    sunAltitudeDeg: 60,
    moons: moonSystem.moons.map((m) => ({ name: m.name, fullMagnitude: m.fullMagnitude })),
    lightPollution: num(params.lightPollution, 0),
    galaxyBand: num(params.galaxyBand, 0.6),
  })
  highlights.push(...sky.summary)

  // ── 历法 ──
  const siderealDayHours = rotationHours
  const daysInYear = yearDays
  const solarDayHours = siderealDayHours / (1 - siderealDayHours / 24 / daysInYear)
  const localDaysPerYear = (daysInYear * 24) / solarDayHours
  const seasonCount = obliquityDeg > 2 ? 4 : eccentricity > 0.3 ? 2 : 1

  let monthsPerYear: number
  let daysPerMonth: number
  let leapRule: string
  if (moonCount > 0) {
    const moonPeriodSeconds = 2 * Math.PI * Math.sqrt(moonDistanceM ** 3 / (G * (planetMassKg + moonMassKg)))
    const moonPeriodDays = moonPeriodSeconds / 86400 / (solarDayHours / 24)
    monthsPerYear = Math.max(1, Math.round(localDaysPerYear / moonPeriodDays))
    daysPerMonth = localDaysPerYear / monthsPerYear
    leapRule =
      '一年 ' + localDaysPerYear.toFixed(2) + ' 个本地日，按 ' + monthsPerYear + ' 个月分配，每月约 ' +
      daysPerMonth.toFixed(1) + ' 日。若要纯整数历法，可设 ' + monthsPerYear + ' 个月 × ' +
      Math.floor(daysPerMonth) + ' 日 + 余 ' +
      (localDaysPerYear - monthsPerYear * Math.floor(daysPerMonth)).toFixed(1) + ' 日作为年末节庆。'
  } else {
    monthsPerYear = seasonCount * 3
    daysPerMonth = localDaysPerYear / monthsPerYear
    leapRule =
      '无卫星，按月相无法定月。建议按季节分：' + seasonCount + ' 季 × 3 月 × ' +
      daysPerMonth.toFixed(1) + ' 日。一年 ' + localDaysPerYear.toFixed(2) + ' 本地日。'
  }
  if (Math.abs(solarDayHours - siderealDayHours) / siderealDayHours > 0.05) {
    highlights.push(
      '注意：恒星日 ' + siderealDayHours.toFixed(2) + 'h，但太阳日是 ' + solarDayHours.toFixed(2) +
        'h（公转让太阳每天多走一段）。叙事用太阳日：一年 ' + localDaysPerYear.toFixed(0) + ' 个本地日。',
    )
  }

  // ── 跨模块一致性检查 ──
  const checks = checkWorld({
    orbitAU,
    starTempK,
    stellar: {
      massSun: stellar.massSun,
      effectiveTempK: stellar.effectiveTempK,
      habitableZoneAU: stellar.habitableZoneAU,
      lifetimeAlphaGyr: stellar.lifetimeAlphaGyr,
    },
    moonSystem: {
      moons: moonSystem.moons.map((moon) => ({ name: moon.name, periodDays: moon.periodDays })),
      maxMoonCount: moonSystem.maxMoonCount,
    },
    calendar: { monthsPerYear, daysPerMonth },
    life: { gate: lifeGate },
    temperature: { surfaceMeanC },
  })

  return {
    star: { massKg: starMassKg, radiusM: starRadiusM, tempK: starTempK, luminosityW, luminositySun },
    orbit: {
      semiMajorAxisAU: orbitAU,
      semiMajorAxisM: orbitM,
      eccentricity,
      yearDays,
      orbitalVelocity,
      perihelionTempDeltaPercent: perihelionTempDeltaPercent * 100,
    },
    planet: {
      massKg: planetMassKg,
      radiusM: planetRadiusM,
      densityKgM3,
      surfaceGravity,
      surfaceGravityEarth,
      escapeVelocity,
      dayHours: rotationHours,
      centrifugalRatio,
    },
    temperature: { equilibriumK, surfaceMeanK, surfaceMeanC, boilingPointK, boilingPointC, freezingPointK },
    atmosphere: {
      pressurePa,
      pressureAtm,
      scaleHeightM,
      molarMass,
      relativeToEarth,
      altitudeHalfPressure,
      altitudeTenthPressure,
    },
    latitudeBands,
    terrain: { maxMountainHeight, snowLineM, horizonKm, hasSeasons, seasonStrength },
    climate: layered,
    starClass: baseStar ?? null,
    moons: {
      count: moonCount,
      primaryMassKg: moonMassKg,
      primaryDistanceM: moonDistanceM,
      tidalAccel,
      tidalRelativeEarth,
      likelyTidallyLocked,
      angularDiameterDeg,
    },
    moonSystem,
    sky,
    stellar,
    life: { chemistry: lifeChemistry, gate: lifeGate },
    checks,
    calendar: {
      solarDayHours,
      siderealDayHours,
      daysPerYear: daysInYear,
      localDaysPerYear,
      monthsPerYear,
      daysPerMonth,
      seasonCount,
      daysPerSeason: localDaysPerYear / Math.max(1, seasonCount),
      leapRule,
    },
    warnings,
    highlights,
    starNotes,
  }
}

/** 导出给调用方的辅助：光谱型描述（避免 op 层重复实现）。 */
export { describeStarClass }
/** 现实精细结构常数（供校验）。 */
export { ALPHA_REAL }
