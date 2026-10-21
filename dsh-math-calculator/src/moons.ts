/**
 * 多卫星系统：物理可行性 + 抬头观感。
 *
 * 为什么单独一个模块：原来的 `world.moons` 只支持"一颗主卫星"，但架空设定常想写
 * "两个月亮""三颗卫星轮流升起"。能不能这么写，不是创作自由问题，是**轨道力学**问题：
 *   - 卫星必须在行星的**希尔球**里，否则会被恒星抢走；
 *   - 卫星不能在**洛希极限**内，否则会被潮汐撕碎成环；
 *   - 相邻两颗卫星的半长轴不能太接近，否则互相扰动、几十万年就撞掉或弹飞；
 *   - 潮汐锁定会随距离急剧变化（∝ a⁶），近的锁、远的松。
 *
 * 判据来源（全部写在注释里，改动前先回去读）：
 *   - 希尔球：r_H = a (m_p / 3M_*)^(1/3)
 *   - 洛希极限（流体）：d = 2.44 R_p (ρ_p / ρ_m)^(1/3)
 *   - 两颗卫星的稳定间距：Δa ≳ 3.5 R_H,mutual，
 *     其中 R_H,mutual = ((m₁+m₂)/(3M_p))^(1/3) · a_mean（Gladman 1993 的数值判据）
 *   - 潮汐锁定时间尺度 ∝ a⁶ / m（简化标定，仅用于"会不会锁"的量级判断）
 *
 * 精度声明：以上都是**量级判据**，不是 N 体积分。真实系统还要考虑共振迁移、
 * 形成历史、恒星摄动。输出里凡是估算值都标注了。
 *
 * @module dsh-math-calculator/moons
 */

/** 万有引力常数。 */
const G = 6.6743e-11
/** 月球质量 kg。 */
const MOON_MASS = 7.342e22
/** 地月平均距离 m。 */
const MOON_DIST = 3.844e8
/** 月球半径 m。 */
const MOON_RADIUS = 1.7374e6
/** 月球几何反照率。 */
const MOON_ALBEDO = 0.12
/** 满月视星等（参考基准）。 */
const MOON_FULL_MAG = -12.74
/** 卫星默认密度 kg/m³（月球）。 */
const MOON_DENSITY = 3344

/** 一颗卫星的设定（作者给的是设定，不是结论）。 */
export interface MoonSpec {
  /** 显示名，默认「卫星1」「卫星2」…… */
  name?: string
  /** 质量，月球质量为单位。默认 1。 */
  massMoon?: number
  /** 轨道半长轴，地月距离为单位。默认 1。 */
  distanceMoon?: number
  /** 半径 km。给了就用它；否则按密度从质量反推。 */
  radiusKm?: number
  /** 几何反照率 0-1。默认 0.12（月球）。 */
  albedo?: number
}

/** 单颗卫星算出来的观测量。 */
export interface MoonView {
  name: string
  /** 质量，月球质量为单位（保留下来，间距判据要用）。 */
  massMoon: number
  distanceKm: number
  radiusKm: number
  /** 轨道周期（地球日）。 */
  periodDays: number
  /** 角直径（度）。月球 = 0.518°。 */
  angularDiameterDeg: number
  /** 相对月球看起来的大小倍数。 */
  angularDiameterRelativeMoon: number
  /** 满相视星等（越小越亮，满月 = -12.74）。 */
  fullMagnitude: number
  /** 潮汐力，相对地球-月球。 */
  tidalRelativeMoon: number
  /** 是否在洛希极限内（会被撕碎）。 */
  insideRoche: boolean
  /** 是否超出希尔球（会被恒星抢走）。 */
  outsideHill: boolean
  /** 是否可能已被行星潮汐锁定（一面永朝行星）。 */
  tidallyLockedLikely: boolean
  /** 一句观感描述。 */
  impression: string
}

/** 整个卫星系统的体检报告。 */
export interface MoonSystemReport {
  /** 希尔球半径 km。 */
  hillRadiusKm: number
  /** 稳定轨道内边界 km（洛希极限之外）。 */
  stableInnerKm: number
  /** 稳定轨道外边界 km（约 0.45 倍希尔球）。 */
  stableOuterKm: number
  /** 洛希极限 km（流体近似）。 */
  rocheLimitKm: number
  moons: MoonView[]
  /** 按"等质量卫星 + 3.5 互相希尔半径间距"估的容量上限（估算）。 */
  maxMoonCount: number
  /** 相邻卫星实际间距 / 所需最小间距；<1 表示不稳定。 */
  minSpacingMargin: number | null
  /** 检测到的轨道共振（如 "1:2"）。 */
  resonances: string[]
  /** 整个系统是否稳定。 */
  stable: boolean
  warnings: string[]
  highlights: string[]
}

/** 分析所需的行星/恒星上下文。 */
export interface MoonSystemInput {
  planetMassKg: number
  planetRadiusM: number
  planetDensityKgM3: number
  starMassKg: number
  /** 行星轨道半长轴 m。 */
  orbitM: number
  /** 行星自转周期 小时。 */
  planetRotationHours: number
  moons: MoonSpec[]
  /** 系统年龄 Gyr（用于潮汐锁定判断）。默认 4.5。 */
  systemAgeGyr?: number
}

/** 取参数或默认值。 */
function num(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** 由质量与密度推半径（m）。 */
function radiusFromMass(massKg: number, densityKgM3: number): number {
  return Math.cbrt((3 * massKg) / (4 * Math.PI * densityKgM3))
}

/** 圆轨道周期（秒）。 */
function orbitalPeriod(mu: number, a: number): number {
  return 2 * Math.PI * Math.sqrt(a ** 3 / mu)
}

/**
 * 潮汐锁定时间尺度（Gyr，粗略标定）。
 *
 * 标定：地月系统在 ~0.5 Gyr 内锁定（月球一面朝地球是事实）。
 * 依赖 a⁶（潮汐力矩随距离衰减极快）与 1/m（越大锁得越快）。
 * 只用于判断"这个距离上大概率锁没锁"，不是精确积分。
 */
function tidalLockTimescaleGyr(distanceM: number, moonMassKg: number): number {
  const a = distanceM / MOON_DIST
  const m = moonMassKg / MOON_MASS
  return 0.5 * a ** 6 / m
}

/**
 * 卫星系统分析。
 * @param input - 行星与卫星设定。
 * @returns 稳定性体检 + 每颗卫星的观感。
 */
export function analyzeMoonSystem(input: MoonSystemInput): MoonSystemReport {
  const warnings: string[] = []
  const highlights: string[] = []
  const planetMass = input.planetMassKg
  const planetRadius = input.planetRadiusM
  const planetDensity = input.planetDensityKgM3
  const age = num(input.systemAgeGyr, 4.5)

  // ── 1. 行星能"抓住"多远的东西：希尔球 ──
  const hillRadius = input.orbitM * Math.cbrt(planetMass / (3 * input.starMassKg))
  // 逆行卫星可以更远（~0.7 r_H），顺行实际稳定边界约 0.45 r_H（保守取值）
  const stableOuter = 0.45 * hillRadius

  // ── 2. 靠多近会被撕碎：洛希极限（流体近似）──
  const rocheLimit = 2.44 * planetRadius * Math.cbrt(planetDensity / MOON_DENSITY)
  const stableInner = Math.max(rocheLimit * 1.05, planetRadius * 1.5)

  const moons: MoonView[] = []
  const specs = input.moons.length > 0 ? input.moons : []
  const earthMoonAngularDeg = (2 * Math.atan(MOON_RADIUS / MOON_DIST) * 180) / Math.PI

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]
    const name = spec.name?.trim() || `卫星${i + 1}`
    const massKg = num(spec.massMoon, 1) * MOON_MASS
    const distanceM = num(spec.distanceMoon, 1) * MOON_DIST
    const radiusM = spec.radiusKm !== undefined
      ? spec.radiusKm * 1000
      : radiusFromMass(massKg, MOON_DENSITY)
    const albedo = num(spec.albedo, MOON_ALBEDO)

    const mu = G * (planetMass + massKg)
    const periodSeconds = orbitalPeriod(mu, distanceM)
    const periodDays = periodSeconds / 86400

    const angularDeg = (2 * Math.atan(radiusM / distanceM) * 180) / Math.PI

    // 视星等：以满月为基准，按 反照率 × 半径² / 距离² 缩放
    const magnitude =
      MOON_FULL_MAG -
      2.5 *
        Math.log10(
          (albedo / MOON_ALBEDO) *
            (radiusM / MOON_RADIUS) ** 2 *
            (MOON_DIST / distanceM) ** 2,
        )

    // 潮汐加速度 a_tidal = 2 G m R_p / d³，以地月为 1
    const tidalAccel = (2 * G * massKg * planetRadius) / distanceM ** 3
    const earthTidalAccel = (2 * G * MOON_MASS * 6.371e6) / MOON_DIST ** 3
    const tidalRelative = tidalAccel / earthTidalAccel

    const insideRoche = distanceM < rocheLimit
    const outsideHill = distanceM > hillRadius

    const lockTime = tidalLockTimescaleGyr(distanceM, massKg)
    const locked = lockTime < age

    if (insideRoche) {
      warnings.push(
        `${name} 距离 ${(distanceM / 1000).toFixed(0)} km，在洛希极限（${(rocheLimit / 1000).toFixed(0)} km）以内——` +
          '会被潮汐撕碎，现实中它会是一条环，不是月亮。',
      )
    }
    if (outsideHill) {
      warnings.push(
        `${name} 距离 ${(distanceM / 1000).toFixed(0)} km，超出希尔球（${(hillRadius / 1000).toFixed(0)} km）——` +
          '它实际上是绕恒星转的小行星，会被行星的引力甩掉。',
      )
    }

    moons.push({
      name,
      massMoon: massKg / MOON_MASS,
      distanceKm: distanceM / 1000,
      radiusKm: radiusM / 1000,
      periodDays,
      angularDiameterDeg: angularDeg,
      angularDiameterRelativeMoon: angularDeg / earthMoonAngularDeg,
      fullMagnitude: magnitude,
      tidalRelativeMoon: tidalRelative,
      insideRoche,
      outsideHill,
      tidallyLockedLikely: locked,
      impression: '',
    })
  }

  // ── 3. 相邻卫星能不能共存：3.5 倍互相希尔半径 ──
  const sorted = [...moons].sort((a, b) => a.distanceKm - b.distanceKm)
  let minSpacingMargin: number | null = null
  const resonances: string[] = []

  for (let i = 0; i + 1 < sorted.length; i++) {
    const inner = sorted[i]
    const outer = sorted[i + 1]
    const mInner = inner.massMoon * MOON_MASS
    const mOuter = outer.massMoon * MOON_MASS
    const aMean = ((inner.distanceKm + outer.distanceKm) / 2) * 1000
    const mutualHill = Math.cbrt((mInner + mOuter) / (3 * planetMass)) * aMean
    const requiredGap = 3.5 * mutualHill
    const actualGap = (outer.distanceKm - inner.distanceKm) * 1000
    const margin = requiredGap > 0 ? actualGap / requiredGap : Number.POSITIVE_INFINITY
    if (minSpacingMargin === null || margin < minSpacingMargin) minSpacingMargin = margin

    if (margin < 1) {
      warnings.push(
        `${inner.name} 与 ${outer.name} 靠得太近（质量大、间距小）：实际 ${(actualGap / 1000).toFixed(0)} km，` +
          `需要至少 ${(requiredGap / 1000).toFixed(0)} km——这种配置几十万年内就会互相扰动而失稳。`,
      )
    }

    // 共振检测：周期比接近小整数比（±2%）
    const ratio = outer.periodDays / inner.periodDays
    for (const [p, q] of [[1, 2], [1, 3], [2, 3], [3, 4], [1, 4], [2, 5]] as const) {
      if (Math.abs(ratio - q / p) / (q / p) < 0.02) {
        resonances.push(`${inner.name}:${outer.name} ≈ ${p}:${q} 轨道共振`)
        break
      }
    }
  }

  // ── 4. 容量上限（几何估算）──
  const typicalMass = specs.length > 0
    ? Math.min(...specs.map((s) => num(s.massMoon, 1))) * MOON_MASS
    : MOON_MASS
  const spacingFactor = 1 + 3.5 * Math.cbrt((2 * typicalMass) / (3 * planetMass))
  let capacity = 0
  let r = stableInner
  while (r * spacingFactor <= stableOuter && capacity < 64) {
    capacity++
    r *= spacingFactor
  }

  // ── 5. 观感描述 ──
  for (const moon of moons) {
    const parts: string[] = []
    parts.push(`天上看 ${moon.angularDiameterDeg.toFixed(2)}°（月球的 ${moon.angularDiameterRelativeMoon.toFixed(2)} 倍）`)
    parts.push(`满相亮度 ${moon.fullMagnitude.toFixed(1)} 等`)
    if (moon.tidallyLockedLikely) parts.push('已被潮汐锁定（永远同一面朝行星）')
    if (moon.angularDiameterRelativeMoon > 2.5) {
      highlights.push(
        `${moon.name} 在天上比月球大 ${moon.angularDiameterRelativeMoon.toFixed(1)} 倍——` +
          '它会主导夜空的明暗、潮汐与所有文化的月神形象。',
      )
    }
    if (moon.fullMagnitude < -14) {
      highlights.push(`${moon.name} 满相时比满月还亮 ${(-14 - moon.fullMagnitude).toFixed(1)} 等，夜里能投出清晰影子。`)
    }
    moon.impression = parts.join('；') + '。'
  }

  if (moons.length === 0) {
    highlights.push('没有卫星——没有潮汐、没有月相，夜空只有恒星。航海与历法都只能靠太阳和星星。')
  } else if (moons.length === 1) {
    highlights.push('只有一颗卫星：月相清晰可数，历法自然按月，这是最容易写出"熟悉感"的配置。')
  } else {
    highlights.push(
      `${moons.length} 颗卫星：会同时出现多个月亮、多套月相叠加、复合潮汐。` +
        '夜空更亮，但历法会变得复杂（除非一颗明显更近、周期最短，成为主要计时依据）。',
    )
  }

  if (resonances.length > 0) {
    highlights.push(`存在轨道共振：${resonances.join('；')}。共振本身是稳定的，还能让"每隔几年两月同辉"成为可预测的天象。`)
  }

  const stable =
    moons.every((m) => !m.insideRoche && !m.outsideHill) && (minSpacingMargin === null || minSpacingMargin >= 1)

  if (moons.length > capacity) {
    warnings.push(
      `卫星数量 ${moons.length} 超过几何容量估算 ${capacity}（按等质量卫星、3.5 倍互相希尔半径间距推算）——` +
        '要么卫星都很小，要么需要给出特殊的形成历史。',
    )
  }

  return {
    hillRadiusKm: hillRadius / 1000,
    stableInnerKm: stableInner / 1000,
    stableOuterKm: stableOuter / 1000,
    rocheLimitKm: rocheLimit / 1000,
    moons,
    maxMoonCount: capacity,
    minSpacingMargin,
    resonances,
    stable,
    warnings,
    highlights,
  }
}
