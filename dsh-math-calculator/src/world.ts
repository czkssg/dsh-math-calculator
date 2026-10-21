/**
 * 星球世界推演（World Profile）。
 *
 * 目标：输入一组基础物理常数，输出这个世界的「体感画像」 ——
 * 重力、一天多长、一年多长、有没有四季、各纬度气候、地形上限、天空与气候。
 *
 * 设计原则：
 * 1. **全部参数有地球默认值**，只改想改的那几个即可。喂地球参数必须还原出地球，
 *    这是验证模型没算错的手段（见 test/world.mjs）。
 * 2. **区分「精确可算」与「粗略估计」**：
 *    - 精确：重力、逃逸速度、周期、标高、雪线、山高上限、地平线 —— 这些是代数关系
 *    - 粗略：纬度温度带 —— 真实气候涉及大气环流、洋流、地形，超出了简单模型的范畴，
 *      给出的是「辐射平衡下的量级」，必须标注为估计值
 * 3. **主动做一致性检查**：自转过快会解体、离恒星太近被潮汐锁定、
 *    大气太薄无法保温 —— 这些矛盾要在输出里显式警告，而不是给一堆自洽的假数字。
 *
 * @module dsh-math-calculator/world
 */

import { CONSTANTS } from './formula-library.js'
import {
  computeLayeredClimate,
  noonElevation,
  dayLength,
  type LayeredClimate,
  type LatitudeClimate,
} from './climate.js'
import {
  STAR_CLASSES,
  STAR_INDEX,
  closestStarClass,
  describeStarClass,
  type StarClass,
} from './star-catalog.js'
import { analyzeMoonSystem, type MoonSpec, type MoonSystemReport } from './moons.js'
import { observeSky, type SkyReport } from './sky.js'
import { describeStarStructure, type StellarProfile } from './stellar.js'
import { assessLife, chemistryWindow, type ChemistryWindow, type LifeGate } from './life.js'
import { checkWorld, type IntegrationCheck } from './integration.js'
import { getActiveConstants } from './constants-graph.js'
import { OUR_UNIVERSE, deriveScaleLadder, dimensionlessFromKnobs } from './constants-core.js'

/** 世界参数（全部可选，默认地球）。 */
export interface WorldParams {
  // ── 恒星 ──
  /** 恒星质量，太阳质量为单位。默认 1。 */
  starMass?: number
  /** 恒星半径，太阳半径为单位。默认 1。 */
  starRadius?: number
  /** 恒星表面温度 K。默认 5778。 */
  starTemp?: number
  // ── 轨道 ──
  /** 轨道半长轴，AU 为单位。默认 1。 */
  orbitAU?: number
  /** 轨道偏心率。默认 0.0167。 */
  eccentricity?: number
  // ── 行星 ──
  /** 行星质量，地球质量为单位。默认 1。 */
  planetMass?: number
  /** 行星半径，地球半径为单位。默认 1。 */
  planetRadius?: number
  /** 自转周期，小时为单位。默认 23.934（恒星日）。 */
  rotationHours?: number
  /** 轴倾角，度。默认 23.44。 */
  obliquityDeg?: number
  /** 反照率 0-1。默认 0.306（地球）。 */
  albedo?: number
  // ── 大气 ──
  /** 海平面气压 Pa。默认 101325。 */
  pressure?: number
  /** 大气平均摩尔质量 kg/mol。默认 0.02896（地球空气）。 */
  molarMass?: number
  /** 绝热指数。默认 1.4。 */
  gamma?: number
  /** 温室效应增温 K。默认 33（地球）。传 0 表示无大气温室。 */
  greenhouse?: number
  // ── 地表材料（决定地形上限）──
  /** 地表材料抗压强度 Pa。默认 1.3e8（花岗岩）。 */
  materialStrength?: number
  /** 地表材料密度 kg/m³。默认 2700（花岗岩）。 */
  materialDensity?: number
  /** 液态水/溶剂是否存在。默认 true。 */
  hasLiquid?: boolean
  /**
   * 恒星光谱型 id（如 'G2V'、'M5V'）。
   * 给了它就按该型的基准值填充 starMass/starRadius/starTemp，
   * 省去用户查表 —— 除非用户同时显式给了那三个参数（显式优先）。
   */
  starClass?: string
  // ── 卫星 ──
  /** 卫星数量。默认 1（地球）。 */
  moonCount?: number
  /** 主卫星质量，月球质量为单位。默认 1。 */
  moonMass?: number
  /** 主卫星轨道半径，地球-月球距离为单位（384400 km）。默认 1。 */
  moonDistance?: number
  /**
   * 多卫星设定（v4）。给了就按逐颗参数推演，
   * 并自动忽略 moonCount 的数量语义（数量以本数组长度为准）。
   */
  moons?: MoonSpec[]
  /** 光污染 0-1（0 = 无人烟，1 = 特大城市），影响夜空亮度与可见星数。默认 0。 */
  lightPollution?: number
  /** 银河带亮度 0-1（设定值：星球是否位于星系盘内）。默认 0.6。 */
  galaxyBand?: number
  // ── 历法 ──
  /** 一"天"定义的参考：'solar'（太阳日，默认）或 'sidereal'（恒星日）。 */
  dayDefinition?: string
}

/** 一个纬度带的气候数据。 */
export interface LatitudeBand {
  latitudeDeg: number
  /** 夏至正午太阳高度角（度）。 */
  noonElevationSummer: number
  /** 冬至正午太阳高度角（度）。 */
  noonElevationWinter: number
  /** 夏至昼长（小时）。 */
  dayLengthSummer: number
  /** 冬至昼长（小时）。 */
  dayLengthWinter: number
  /** 年均可照相对强度（赤道 = 1）。 */
  insolation: number
  /** 粗略年均温度 K。 */
  approxTempK: number
  /** 粗略年均温度 °C。 */
  approxTempC: number
  /** 气候带标签。 */
  zone: string
  /** 暖季平均温度 °C（v3 新增）。 */
  warmSeasonC: number
  /** 冷季平均温度 °C（v3 新增）。 */
  coldSeasonC: number
  /** 年温差 K（v3 新增）。 */
  annualRangeK: number
}

/** 推演结果。 */
export interface WorldProfile {
  // ── 恒星与轨道 ──
  star: {
    massKg: number
    radiusM: number
    tempK: number
    luminosityW: number
    luminositySun: number
  }
  orbit: {
    semiMajorAxisAU: number
    semiMajorAxisM: number
    eccentricity: number
    yearDays: number
    orbitalVelocity: number
    /** 远日点/近日点温度差异（偏心率造成的季节强度）。 */
    perihelionTempDeltaPercent: number
  }
  // ── 行星本体 ──
  planet: {
    massKg: number
    radiusM: number
    densityKgM3: number
    surfaceGravity: number
    surfaceGravityEarth: number
    escapeVelocity: number
    dayHours: number
    /** 赤道离心加速度与重力之比。>1 表示会解体。 */
    centrifugalRatio: number
  }
  // ── 温度 ──
  temperature: {
    /** 无温室时的辐射平衡温度 K。 */
    equilibriumK: number
    /** 含温室后的表面平均温度 K。 */
    surfaceMeanK: number
    surfaceMeanC: number
    /** 水在表面气压下的沸点 K。 */
    boilingPointK: number
    boilingPointC: number
    /** 冻结温度 K（近似）。 */
    freezingPointK: number
  }
  // ── 大气 ──
  atmosphere: {
    pressurePa: number
    pressureAtm: number
    scaleHeightM: number
    molarMass: number
    /** 相对地球的稀薄程度（1 = 地球）。 */
    relativeToEarth: number
    /** 气压降至 0.5 / 0.1 的高度。 */
    altitudeHalfPressure: number
    altitudeTenthPressure: number
  }
  // ── 纬度气候带 ──
  latitudeBands: LatitudeBand[]
  // ── 地形与地貌 ──
  terrain: {
    /** 材料强度决定的最大山高 m。 */
    maxMountainHeight: number
    /** 雪线高度 m（按当前温度估算）。 */
    snowLineM: number
    /** 1.7m 眼高的地平线距离 m。 */
    horizonKm: number
    /** 是否有四季。 */
    hasSeasons: boolean
    /** 季节强度描述。 */
    seasonStrength: string
  }
  // ── 分层气候（v3 新增）──
  /** 完整的四层气候推演：辐照度 / 季节成因 / 纬度分布 / 全球均温。 */
  climate: LayeredClimate
  /** 恒星类型基准（按 starClass 或 starTemp 推断）。 */
  starClass: StarClass
  /** 卫星与潮汐。 */
  moons: {
    count: number
    primaryMassKg: number
    primaryDistanceM: number
    /** 主卫星造成的潮汐加速度 m/s²。 */
    tidalAccel: number
    /** 潮汐力相对地球月球的倍数。 */
    tidalRelativeEarth: number
    /** 是否会潮汐锁定（粗略判据）。 */
    likelyTidallyLocked: boolean
    /** 角直径（度），决定它在天上看起来多大。 */
    angularDiameterDeg: number
  }
  /** 多卫星系统体检：希尔球、洛希极限、相邻间距、共振、每颗的观感。 */
  moonSystem: MoonSystemReport
  /** 抬头能看见什么：恒星颜色、白天天空、夜晚星空。 */
  sky: SkyReport
  /** 恒星结构与寿命（S3）：质光关系、主序寿命、宜居带、紫外占比、常数敏感度。 */
  stellar: StellarProfile
  /** 化学窗口与生命硬否决：只判断"绝对不行"，其余交给作者。 */
  life: { chemistry: ChemistryWindow; gate: LifeGate }
  /** 跨模块一致性检查（后端整合）：各模块结果之间是否自相矛盾。 */
  checks: IntegrationCheck[]
  /** 历法推算。 */
  calendar: {
    /** 太阳日长度（小时）。恒星日 + 太阳日修正。 */
    solarDayHours: number
    /** 恒星日长度（小时）。 */
    siderealDayHours: number
    /** 一年多少太阳日。 */
    daysPerYear: number
    /** 一年多少本地日（叙事核心数字）。 */
    localDaysPerYear: number
    /** 建议的月数（按月球朔望周期，若无卫星则按季节数）。 */
    monthsPerYear: number
    /** 一个月多少天。 */
    daysPerMonth: number
    /** 季节数（通常 4，倾角 0 或极大时特殊）。 */
    seasonCount: number
    /** 每个季节多少本地日。 */
    daysPerSeason: number
    /** 闰年规则建议。 */
    leapRule: string
  }
  // ── 一致性警告 ──
  warnings: string[]
  /** 读者能直接感知的要点（供主模型二创）。 */
  highlights: string[]
}

const EARTH = {
  mass: 5.9722e24,
  radius: 6.371e6,
  g: 9.80665,
  dayHours: 23.9344696,
  yearDays: 365.25636,
  tempK: 288.15,
}

/** 取参数或默认值。 */
function num(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** 弧度转角度。 */
const toDeg = (rad: number): number => (rad * 180) / Math.PI
/** 角度转弧度。 */
const toRad = (deg: number): number => (deg * Math.PI) / 180

/**
 * 计算所需日照随纬度的年可照强度（相对赤道）。
 * 用 cos(纬度) 的简单近似，忽略轴倾角带来的复杂积分 —— 对「体感量级」够用。
 */
function relativeInsolation(latitudeDeg: number): number {
  const phi = toRad(Math.abs(latitudeDeg))
  return Math.max(0, Math.cos(phi))
}

/**
 * 估算某纬度的年均温度。
 *
 * 校准历程（重要，别随手改）：
 * 1. `cos²φ` → 极地 3.9°C，明显偏热（真实 -25°C）。
 * 2. `cos^1.5φ` → 45° 准了，但 75° 给 0.2°C，仍偏热。
 * 3. `cos³φ` + 极地放大 → 75° 到 -0.1°C，还是不够冷。
 *
 * 根本原因：以上都以「年均 cosφ」为标度，但真实温降的主因不是平均日照，
 * 而是**极夜**——高纬有整月甚至半年无日照，散热期极长，而冰雪反照率
 * 又形成正反馈（越冷越白、越白越冷）。
 *
 * 当前模型引入两个因子：
 *   - 极夜因子：|latitude| 超过 65° 后，无日照天数的非线性增长
 *   - 反照率反馈：极区额外降温
 *
 * 地球校验目标：0°→27 | 30°→21 | 45°→12 | 60°→3 | 75°→-15 | 88°→-25
 * 仍为量级估算：洋流（北欧比同纬度高 10°C）、大陆度、海拔不在模型内。
 */
function latitudeTemperature(
  latitudeDeg: number,
  surfaceMeanK: number,
  greenhouseK: number,
  pressureAtm: number,
): number {
  const phi = toRad(latitudeDeg)
  const s = Math.max(0, Math.cos(phi))

  // 全球平均 cos²φ
  const sMean = 0.5

  // 大气越厚，热量向极地输运越强，温差越小
  const transport = Math.min(1.15, 0.32 + 0.68 * Math.min(1.2, pressureAtm))
  // 温室越强，极地相对保温越好
  const greenhouseDamping = 1 / (1 + greenhouseK / 50)

  // 主梯度项：赤道比全球均值热、极地冷
  const amplitude = 44 * transport * greenhouseDamping
  let temperature = surfaceMeanK + amplitude * (s ** 2 - sMean)

  // 极夜惩罚：纬度越高，无日照期越长，散热量显著增加
  // 60° 以下几乎无影响；75° 与 88° 需显著降温（地球实测约 -15 / -25°C）
  const polarNightSeverity = Math.max(0, (Math.abs(latitudeDeg) - 55) / 33)
  const polarNightPenalty = 32 * transport * greenhouseDamping * polarNightSeverity ** 1.35
  temperature -= polarNightPenalty

  // 冰雪反照率正反馈（仅在有液态水/大气的星球上）
  if (greenhouseK > 5) {
    const albedoFeedback = 9 * transport * Math.max(0, (Math.abs(latitudeDeg) - 45) / 43) ** 2
    temperature -= albedoFeedback
  }

  return temperature
}

/** 气候带标签。按年均温划分，与柯本气候分类的大类对应。 */
function climateZone(latitudeDeg: number, tempC: number, hasLiquid: boolean): string {
  const abs = Math.abs(latitudeDeg)
  if (tempC < -25) return abs > 70 ? '极地冰原' : '寒带苔原'
  if (tempC < -10) return '亚寒带针叶林'
  if (tempC < 0) return '亚寒带（冻土）'
  if (tempC < 10) return '温带寒'
  if (tempC < 20) return '温带'
  if (tempC < 28) return '亚热带'
  if (!hasLiquid) return `${abs < 30 ? '干旱热带' : '干旱带'}（无液态溶剂）`
  return '热带'
}

/**
 * 世界推演主函数。
 * @param params - 世界参数（全部可选）
 * @returns 结构化画像 + 警告
 */
export interface WorldOptions {
  /**
   * 生效的物理常数（缺省读 getActiveConstants()）。
   * 这是 S2 的关键：以前 world 用 CONSTANTS 快照，用户改了常数也不生效。
   */
  constants?: Record<string, number>
}

export function generateWorld(params: WorldParams, options: WorldOptions = {}): WorldProfile {
  const warnings: string[] = []
  const highlights: string[] = []

  // 生效常数 = 现实基准 ⊕ 当前工作区/会话的覆盖。
  // 所有物理推导都从这一份走，改 c/G/α 才会真的传导到星球模型。
  const K: Record<string, number> = { ...CONSTANTS, ...(options.constants ?? getActiveConstants()) }
  const knobs = {
    c: K.c,
    hbar: K.hbar,
    e: K.e_charge,
    epsilon0: K.epsilon0,
    me: K.me,
    mp: K.mp,
    G: K.G,
  }
  const alpha = dimensionlessFromKnobs(knobs).alpha

  // ── 恒星 ──
  // 支持两种给法：
  //   a) starClass='M5V' → 按光谱型基准表填充（省去查表）
  //   b) 直接给 starMass/starRadius/starTemp
  // 显式参数优先于 starClass —— 用户想微调时不会被基准值覆盖。
  let baseStar: StarClass
  if (typeof params.starClass === 'string' && params.starClass.trim() !== '') {
    const requested = STAR_INDEX.get(params.starClass.trim())
    if (requested) baseStar = requested
    else {
      // 允许简写（如 'G2' → 'G2V'）
      const upper = params.starClass.trim().toUpperCase()
      const prefixed = STAR_CLASSES.find((s) => s.id.startsWith(upper))
      baseStar = prefixed ?? closestStarClass(num(params.starTemp, 5778))
      if (!prefixed) {
        warnings.push(
          `未找到光谱型 "${params.starClass}"，按给定温度推断为 ${baseStar.id}。` +
            `可选值：${STAR_CLASSES.map((s) => s.id).join(', ')}`,
        )
      }
    }
  } else {
    // 没给 starClass：按温度反查最接近的光谱型（用于补全半径/质量）
    baseStar = closestStarClass(num(params.starTemp, 5778))
  }

  const starMassSun = num(params.starMass, baseStar.massSun)
  const starRadiusSun = num(params.starRadius, baseStar.radiusSun)
  const starTempK = num(params.starTemp, baseStar.tempK)
  const starMassKg = starMassSun * K.Msun
  const starRadiusM = starRadiusSun * K.Rsun
  const luminosityW = 4 * Math.PI * starRadiusM ** 2 * K.sigma * starTempK ** 4
  const luminositySun = luminosityW / K.Lsun

  if (starTempK < 2400) warnings.push(`恒星表面温度 ${starTempK}K 低于红矮星下限，光谱以红外为主，光合作用可能无法进行。`)
  if (starTempK > 40000) warnings.push(`恒星表面温度 ${starTempK}K 属 O 型星，紫外辐射极强，生命需强屏蔽。`)

  // ── 恒星结构与寿命（S3）──
  //
  // 由质量推光度、半径、有效温度、主序寿命与宜居带。
  // 其中斯特藩-玻尔兹曼、维恩、辐射平衡是精确的；质光/质径/寿命是经验关系，
  // α 的净效应只给方向（见 stellar.ts 的敏感度表）。
  // 作者显式给了恒星半径/温度时，用实际值（否则同一份输出会出现两套半径）。
  const explicitStar = params.starRadius !== undefined || params.starTemp !== undefined
  const stellar = describeStarStructure(
    starMassSun,
    alpha,
    explicitStar ? { luminositySun, radiusSun: starRadiusSun } : undefined,
  )

  // ── 轨道 ──
  const orbitAU = num(params.orbitAU, 1)
  const eccentricity = Math.min(0.95, Math.max(0, num(params.eccentricity, 0.0167)))
  const orbitM = orbitAU * K.AU
  const yearSeconds = 2 * Math.PI * Math.sqrt(orbitM ** 3 / (K.G * starMassKg))
  const yearDays = yearSeconds / 86400
  const orbitalVelocity = Math.sqrt((K.G * starMassKg) / orbitM)

  // 偏心率造成的温度季差（近似：距离比 (1+e)/(1-e) 的四次方根）
  const perihelionTempDeltaPercent = ((1 + eccentricity) / (1 - eccentricity)) ** 0.5 - 1
  if (eccentricity > 0.3) {
    warnings.push(`轨道偏心率 ${eccentricity} 较高，近日点/远日点温度差约 ${(perihelionTempDeltaPercent * 100).toFixed(0)}%，季节将由轨道主导而非轴倾角。`)
  }

  // ── 行星本体 ──
  const planetMassEarth = num(params.planetMass, 1)
  const planetRadiusEarth = num(params.planetRadius, 1)
  const planetMassKg = planetMassEarth * EARTH.mass
  const planetRadiusM = planetRadiusEarth * EARTH.radius
  const densityKgM3 = planetMassKg / ((4 / 3) * Math.PI * planetRadiusM ** 3)
  const surfaceGravity = (K.G * planetMassKg) / planetRadiusM ** 2
  const surfaceGravityEarth = surfaceGravity / EARTH.g
  const escapeVelocity = Math.sqrt((2 * K.G * planetMassKg) / planetRadiusM)

  // ── 自转与一天 ──
  const obliquityDeg = Math.min(90, Math.max(0, num(params.obliquityDeg, 23.44)))
  const rotationHours = num(params.rotationHours, EARTH.dayHours)
  const omega = (2 * Math.PI) / (rotationHours * 3600)
  const centrifugalRatio = (omega ** 2 * planetRadiusM) / surfaceGravity

  if (centrifugalRatio > 0.5) {
    warnings.push(
      `赤道离心加速度已达重力的 ${(centrifugalRatio * 100).toFixed(0)}%，自转太快：` +
        '星球会变成扁球，赤道重力和极地差异巨大，且接近解体极限。',
    )
  } else if (centrifugalRatio > 0.2) {
    warnings.push(`赤道离心加速度为重力的 ${(centrifugalRatio * 100).toFixed(0)}%，赤道会比极地明显"轻"，赤道生物体型可更大。`)
  }

  // 密度异常检查
  if (densityKgM3 > 12000) warnings.push(`平均密度 ${densityKgM3.toFixed(0)} kg/m³ 超过致密金属，可能需要简并态物质。`)
  if (densityKgM3 < 500 && planetRadiusEarth > 0.5) warnings.push(`平均密度仅 ${densityKgM3.toFixed(0)} kg/m³，低于水，可能是气态/冰质天体。`)

  // ── 温度 ──
  const albedo = Math.min(0.95, Math.max(0, num(params.albedo, 0.306)))
  const equilibriumK = (luminosityW * (1 - albedo) / (16 * Math.PI * K.sigma * orbitM ** 2)) ** 0.25
  const greenhouseK = Math.max(0, num(params.greenhouse, 33))
  const surfaceMeanK = equilibriumK + greenhouseK
  const surfaceMeanC = surfaceMeanK - 273.15

  // 水的沸点（Clausius-Clapeyron）
  const pressurePa = Math.max(1, num(params.pressure, 101325))
  const pressureAtm = pressurePa / 101325
  const latentHeatVap = 40650 // J/mol
  const boilingPointK = 1 / (1 / 373.15 - (K.R * Math.log(pressurePa / 101325)) / latentHeatVap)
  const boilingPointC = boilingPointK - 273.15
  const freezingPointK = 273.15
  const hasLiquid = params.hasLiquid ?? true

  if (pressureAtm < 0.6) {
    warnings.push(
      `气压只有地球的 ${(pressureAtm * 100).toFixed(0)}%（${pressurePa.toFixed(0)} Pa）。` +
        `水在 ${boilingPointC.toFixed(0)}°C 就沸腾，无法正常烹饪、伤口会快速失血、` +
        '液态水蒸发极快；若气压低于约 0.06 atm，未加压的血液会沸腾。',
    )
  }
  if (boilingPointC < 80) {
    highlights.push(`水在 ${boilingPointC.toFixed(0)}°C 沸腾——高原煮不熟食物是常态，文明可能依赖烘烤/发酵而非水煮。`)
  }
  if (pressureAtm > 3) {
    highlights.push(`气压是地球的 ${pressureAtm.toFixed(1)} 倍，空气浓稠：飞行更容易、但呼吸阻力大，声音传播更远更低沉。`)
  }
  if (hasLiquid && surfaceMeanC < 0) {
    warnings.push(`平均温度 ${surfaceMeanC.toFixed(1)}°C 低于冰点，液态溶剂无法长期存在于表面（可能是雪球世界）。`)
  }
  if (hasLiquid && surfaceMeanK > boilingPointK) {
    warnings.push(`平均温度 ${surfaceMeanC.toFixed(1)}°C 高于表面沸点 ${boilingPointC.toFixed(0)}°C，液态溶剂无法存在（可能是金星式失控温室）。`)
  }

  // ── 大气 ──
  const molarMass = Math.max(0.002, num(params.molarMass, 0.02896))
  const gamma = Math.max(1.01, num(params.gamma, 1.4))
  const scaleHeightM = (K.R * surfaceMeanK) / (molarMass * surfaceGravity)
  const altitudeHalfPressure = scaleHeightM * Math.log(2)
  const altitudeTenthPressure = scaleHeightM * Math.log(10)
  const earthScaleHeight = (K.R * 288.15) / (0.02896 * EARTH.g)
  const relativeToEarth = scaleHeightM / earthScaleHeight

  if (scaleHeightM < 3000) {
    warnings.push(`大气标高仅 ${(scaleHeightM / 1000).toFixed(1)}km（地球 8.5km），大气极薄，昼夜温差会非常剧烈、宇宙射线直射。`)
  }

  // 逃逸速度 vs 分子速率：能否保住大气
  const thermalSpeed = Math.sqrt((3 * K.R * surfaceMeanK) / molarMass)
  const escapeRatio = escapeVelocity / thermalSpeed
  if (escapeRatio < 6) {
    warnings.push(
      `逃逸速度仅为热运动速度的 ${escapeRatio.toFixed(1)} 倍，大气会持续流失——` +
        '这个世界可能没有长期稳定的大气层。',
    )
  }

  // ── 分层气候推演（v3：替换原来的扁平纬度模型）──
  //
  // 为什么改成独立模块：用户指出的核心方法论是
  // 「地日距离 → 光照 → 气候」必须分层次看，否则季节成因会说反。
  // 旧的实现只算 cos(φ) 和纵倾角，既没有分离「倾角主导」与
  // 「偏心率调制」，也没有季节振幅 —— 看不出夏天和冬天差多少。
  //
  // 新模型三层清晰分离（见 src/climate.ts 顶部注释）：
  //   第 1 层 辐照度：S₀ = L/(4πa²)，含偏心率造成的 ΔS
  //   第 2 层 季节：轴倾角（主因）vs 偏心率（调制项），分别量化
  //   第 3 层 纬度：年均温 + 季节振幅，含极夜与反照率
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
    latitudeDeg: 0,
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
    // v3 新增：季节温度
    warmSeasonC: band.warmSeasonK - 273.15,
    coldSeasonC: band.coldSeasonK - 273.15,
    annualRangeK: band.annualRangeK,
  }))

  // ── 地形 ──
  // 材料强度不再写死 1.3e8（花岗岩）：由 α 推出（ADR-0001 S2）。
  // 现实常数下这个函数恰好返回 1.3e8 —— 所以不改变现有输出，只让它随 α 走。
  const derivedStrength =
    deriveScaleLadder({ ...OUR_UNIVERSE, alpha }).find((entry) => entry.id === 'material-strength')?.value ?? 1.3e8
  const materialStrength = num(params.materialStrength, derivedStrength)
  const materialDensity = Math.max(100, num(params.materialDensity, 2700))
  const maxMountainHeight = materialStrength / (materialDensity * surfaceGravity)

  // 雪线：年均温度降到 0°C 的海拔
  // 若全球均温已低于冰点，雪线就是海平面（不是 0 这个数值巧合，而是"全球冰封"）
  // 干绝热直减率 Γ = g·M/(3.5R)（双原子气体，第一性原理），
  // 再乘湿绝热修正 0.665（唯一的经验系数，用地球 6.5 K/km 标定）。
  // 这样重力或大气成分改变时，雪线会跟着移动，而不是永远 6.5 K/km。
  const earthGravity = (CONSTANTS.G * EARTH.mass) / EARTH.radius ** 2
  const LAPSE_MOIST_FACTOR = 0.0065 / ((earthGravity * 0.02896) / (3.5 * CONSTANTS.R))
  const lapseRate = ((surfaceGravity * molarMass) / (3.5 * K.R)) * LAPSE_MOIST_FACTOR
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
    warnings.push(`轴倾角 ${obliquityDeg}°，接近"侧躺"自转：极区会经历半年白昼与半年黑夜，赤道反而季节温和。`)
  }

  // ── 读者感知要点 ──
  highlights.unshift(
    `表面重力是地球的 ${surfaceGravityEarth.toFixed(2)} 倍` +
      (surfaceGravityEarth < 0.7
        ? '——跳跃更高更远，坠落伤害更小，大体积生物更容易支撑。'
        : surfaceGravityEarth > 1.4
          ? '——动作沉重、攀爬困难，生物必须更矮壮，飞行几乎不可能。'
          : '——与地球相近，人类体感几乎无差异。'),
  )

  if (Math.abs(rotationHours - 24) > 2) {
    highlights.push(
      rotationHours < 24
        ? `一天只有 ${rotationHours.toFixed(1)} 小时——昼夜切换极快，生物节律与人类完全不同。`
        : `一天长达 ${rotationHours.toFixed(1)} 小时——正午酷热、深夜严寒，作息会是"分段睡眠"。`,
    )
  }

  highlights.push(
    `一年 ${yearDays.toFixed(0)} 天（地球日），恒星天顶每天移动约 ${(360 / yearDays).toFixed(2)}°。`,
  )

  if (Math.abs(surfaceMeanC) > 5) {
    highlights.push(`全球平均气温 ${surfaceMeanC.toFixed(0)}°C（地球 15°C）。`)
  }

  if (escapeRatio >= 6 && scaleHeightM >= 3000) {
    highlights.push(`地平线距离 ${horizonKm.toFixed(1)}km（地球 4.7km）——决定"世界看起来多大"。`)
  }

  // ── 卫星与潮汐 ──
  //
  // 为什么重要：卫星决定潮汐（影响海岸生态与文明）、月相与历法（影响叙事节奏）、
  // 以及这颗行星是否被潮汐锁定（决定一面永昼一面永夜）。
  // 地球的月球是个异常大的卫星（直径是地球的 27%），这是地球气候稳定的关键因素之一。
  const MOON_MASS = 7.342e22   // kg，月球质量
  const MOON_DIST = 3.844e8    // m，地月平均距离
  // v4：允许多卫星——给了 moons 数组就以它为准（数量与主卫星都跟随）
  const primarySpec = params.moons && params.moons.length > 0 ? params.moons[0] : undefined
  const moonCount =
    params.moons && params.moons.length > 0
      ? params.moons.length
      : Math.max(0, Math.round(num(params.moonCount, 1)))
  const moonMassKg = (primarySpec ? num(primarySpec.massMoon, 1) : num(params.moonMass, 1)) * MOON_MASS
  const moonDistanceM = (primarySpec ? num(primarySpec.distanceMoon, 1) : num(params.moonDistance, 1)) * MOON_DIST

  // 潮汐加速度：a_tidal = 2GM_moon·R_planet / d³
  const tidalAccel =
    moonCount > 0
      ? (2 * K.G * moonMassKg * planetRadiusM) / moonDistanceM ** 3
      : 0
  const earthTidalAccel =
    (2 * K.G * MOON_MASS * EARTH.radius) / MOON_DIST ** 3
  const tidalRelativeEarth = tidalAccel / earthTidalAccel

  // 卫星角直径 = 2·arctan(R_moon / d)
  // 用质量与密度反推半径：假设卫星密度与主星相同
  const moonRadiusM =
    moonCount > 0
      ? Math.cbrt((3 * moonMassKg) / (4 * Math.PI * densityKgM3))
      : 0
  const angularDiameterDeg =
    moonCount > 0 ? (2 * Math.atan(moonRadiusM / moonDistanceM) * 180) / Math.PI : 0

  // 潮汐锁定判据：行星自转周期与公转周期比接近 1:1
  // 简化判据：轨道很近（< 0.1 AU）且自转已被潮汐制动过
  const likelyTidallyLocked =
    orbitAU < 0.1 && moonCount === 0 && rotationHours * 3600 > yearSeconds * 0.5

  if (moonCount === 0) {
    highlights.push('没有卫星——没有潮汐、没有月相，夜空只有恒星。航海文明不会有"潮汐历"，神话里缺少月亮。')
  } else if (tidalRelativeEarth > 3) {
    highlights.push(
      `潮汐是地球的 ${tidalRelativeEarth.toFixed(1)} 倍——海岸带会被反复剧烈冲刷，` +
        '可能形成极宽的潮间带（生命登陆的温床），或让沿海文明无法定居。',
    )
  } else if (tidalRelativeEarth < 0.3) {
    highlights.push(`潮汐只有地球的 ${tidalRelativeEarth.toFixed(1)} 倍，海面平静，潮间带生态贫乏。`)
  }
  if (angularDiameterDeg > 0) {
    const earthMoonDeg = (2 * Math.atan(1.737e6 / MOON_DIST) * 180) / Math.PI
    if (angularDiameterDeg > earthMoonDeg * 3) {
      highlights.push(
        `主卫星在天上看起来是月球的 ${(angularDiameterDeg / earthMoonDeg).toFixed(1)} 倍大` +
          '——夜空的绝对主角，会主导所有文化的历法与神话。',
      )
    }
  }
  if (likelyTidallyLocked) {
    warnings.push(
      '行星可能被潮汐锁定：一面永久白昼、一面永久黑夜。' +
        '晨昏线附近是唯一宜居带，大气会在夜面凝结/冻结，形成剧烈的全球环流。',
    )
  }

  // ── 化学窗口与生命硬否决（v5）──
  //
  // 只回答"绝对不可能"的那部分：没有液态溶剂、分子无法稳定、时间不够。
  // 其余（板块运动、细胞、文明）明确交给作者。
  const lifeChemistry = chemistryWindow(alpha, surfaceMeanK)
  const lifeGate = assessLife(
    {
      surfaceMeanK,
      warmestBandK: Math.max(...latitudeBands.map((b) => b.warmSeasonC + 273.15)),
      coldestBandK: Math.min(...latitudeBands.map((b) => b.coldSeasonC + 273.15)),
      pressurePa,
      boilingPointK,
      stellarLifetimeGyr: stellar.lifetimeAlphaGyr,
      uvFraction: stellar.uvFraction,
      tidallyLocked: likelyTidallyLocked,
    },
    alpha,
  )
  if (lifeGate.verdict === 'excluded') {
    warnings.push('生命闸门判定为"排除"：' + lifeGate.blockers.filter((b) => b.kind === 'hard').map((b) => b.reason).join('；'))
  }

  // ── 多卫星系统体检（v4）──
  //
  // 与上面「主卫星」的区别：上面只回答"潮汐多大"，
  // 这里回答"这套卫星配置在物理上成立吗"——希尔球、洛希极限、相邻间距、共振。
  // 同时给出每颗卫星的观感（角直径、视星等、是否潮汐锁定）。
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
  })
  warnings.push(...moonSystem.warnings)
  highlights.push(...moonSystem.highlights)

  // ── 抬头看见什么（v4）──
  //
  // 从地表观测者的角度把"能感知"的东西算出来：
  // 恒星颜色/谱型/视星等、白天天空配色、夜空亮度与可见星数、银河是否可见。
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
  //
  // "一天多长"有个常见混淆：恒星日（相对恒星自转一周）≠ 太阳日（太阳两次正午）。
  // 地球恒星日 23h56m，太阳日 24h —— 因为公转让太阳每天多"追"约 1°。
  // 叙事用的是**太阳日**，所以必须做这个修正。
  const siderealDayHours = rotationHours
  const daysInYear = yearDays
  // 太阳日 = 恒星日 / (1 - 恒星日/年长度)
  const solarDayHours =
    siderealDayHours / (1 - siderealDayHours / 24 / daysInYear)
  const localDaysPerYear = (daysInYear * 24) / solarDayHours

  // 月数：有卫星则按朔望周期（简化为轨道周期），否则按季节数
  const seasonCount = obliquityDeg > 2 ? 4 : eccentricity > 0.3 ? 2 : 1
  let monthsPerYear: number
  let daysPerMonth: number
  let leapRule: string

  if (moonCount > 0) {
    // 卫星轨道周期：T = 2π√(d³/(G(M+m)))
    const moonPeriodSeconds = 2 * Math.PI * Math.sqrt(
      moonDistanceM ** 3 / (K.G * (planetMassKg + moonMassKg)),
    )
    const moonPeriodDays = moonPeriodSeconds / 86400 / (solarDayHours / 24)
    // 一年能装多少个"月"
    monthsPerYear = Math.max(1, Math.round(localDaysPerYear / moonPeriodDays))
    daysPerMonth = localDaysPerYear / monthsPerYear
    leapRule =
      `一年 ${localDaysPerYear.toFixed(2)} 个本地日，按 ${monthsPerYear} 个月分配，` +
      `每月约 ${daysPerMonth.toFixed(1)} 日。` +
      `若要纯整数历法，可设 ${monthsPerYear} 个月 × ${Math.floor(daysPerMonth)} 日 + 余 ` +
      `${(localDaysPerYear - monthsPerYear * Math.floor(daysPerMonth)).toFixed(1)} 日作为年末节庆。`
  } else {
    monthsPerYear = seasonCount * 3 // 每季三个月
    daysPerMonth = localDaysPerYear / monthsPerYear
    leapRule =
      `无卫星，按月相无法定月。建议按季节分：${seasonCount} 季 × 3 月 × ` +
      `${daysPerMonth.toFixed(1)} 日。` +
      `一年 ${localDaysPerYear.toFixed(2)} 本地日。`
  }

  if (Math.abs(solarDayHours - siderealDayHours) / siderealDayHours > 0.05) {
    highlights.push(
      `注意：恒星日 ${siderealDayHours.toFixed(2)}h，但**太阳日**是 ${solarDayHours.toFixed(2)}h` +
        `（公转让太阳每天多走一段）。叙事用太阳日：一年 ${localDaysPerYear.toFixed(0)} 个本地日。`,
    )
  }

  // ── 跨模块一致性检查（v6，后端整合）──
  //
  // 各模块单独算都对，但它们之间可能互相矛盾：
  // 轨道不在宜居带、历法用错卫星、宜居带内却被生命闸门判死……
  // 这里统一交叉检查，输出 ok / warn / contradiction 三档。
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
    temperature: {
      equilibriumK,
      surfaceMeanK,
      surfaceMeanC,
      boilingPointK,
      boilingPointC,
      freezingPointK,
    },
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
    terrain: {
      maxMountainHeight,
      snowLineM,
      horizonKm,
      hasSeasons,
      seasonStrength,
    },
    climate: layered,
    starClass: baseStar,
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
      daysPerMonth: daysPerMonth,
      seasonCount,
      daysPerSeason: localDaysPerYear / Math.max(1, seasonCount),
      leapRule,
    },
    warnings,
    highlights,
  }
}
