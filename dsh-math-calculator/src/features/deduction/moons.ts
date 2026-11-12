/**
 * 多卫星系统：物理可行性 + 抬头观感。
 *
 * 支持"两个月亮""三颗卫星轮流升起"这类设定，但能不能这么写是轨道力学问题：
 *   - 卫星要在行星的**希尔球**内，否则被恒星抢走；
 *   - 卫星不能在**洛希极限**内，否则被潮汐撕碎成环；
 *   - 相邻卫星半长轴不能太近，否则互相扰动而失稳；
 *   - 潮汐锁定随距离急剧变化（∝ a⁶），近的锁、远的松。
 *
 * 判据来源：
 *   希尔球 r_H = a (m_p / 3M_*)^(1/3)
 *   洛希极限（流体）d = 2.44 R_p (ρ_p / ρ_m)^(1/3)
 *   稳定间距 Δa ≳ 3.5 R_H,mutual（Gladman 1993 数值判据）
 *   潮汐锁定时间尺度 ∝ a⁶ / m（简化标定）
 *
 * 以上都是【量级】判据，不是 N 体积分。真实系统还要考虑共振迁移、形成历史、恒星摄动。
 *
 * @module dsh-math-calculator/features/deduction/moons
 */

import { numOr } from './physics.js'

/** 月球质量 kg。 */
const MOON_MASS = 7.342e22
/** 地月平均距离 m。 */
const MOON_DIST = 3.844e8
/** 月球半径 m。 */
const MOON_RADIUS = 1.7374e6
/** 月球几何反照率。 */
const MOON_ALBEDO = 0.12
/** 满月视星等。 */
const MOON_FULL_MAG = -12.74
/** 卫星默认密度 kg/m³（月球）。 */
const MOON_DENSITY = 3344

/** 一颗卫星的设定。 */
export interface MoonSpec {
  name?: string
  /** 质量，月球质量为单位。默认 1。 */
  massMoon?: number
  /** 轨道半长轴，地月距离为单位。默认 1。 */
  distanceMoon?: number
  /** 半径 km。给了就用它，否则按密度从质量反推。 */
  radiusKm?: number
  /** 几何反照率 0-1。默认 0.12。 */
  albedo?: number
}

/** 单颗卫星的观测量。 */
export interface MoonView {
  name: string
  massMoon: number
  distanceKm: number
  radiusKm: number
  periodDays: number
  angularDiameterDeg: number
  angularDiameterRelativeMoon: number
  fullMagnitude: number
  tidalRelativeMoon: number
  insideRoche: boolean
  outsideHill: boolean
  tidallyLockedLikely: boolean
  impression: string
}

/** 卫星系统体检报告。 */
export interface MoonSystemReport {
  hillRadiusKm: number
  stableInnerKm: number
  stableOuterKm: number
  rocheLimitKm: number
  moons: MoonView[]
  maxMoonCount: number
  minSpacingMargin: number | null
  resonances: string[]
  stable: boolean
  warnings: string[]
  highlights: string[]
}

/** 分析上下文。 */
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
  /** 系统年龄 Gyr。默认 4.5。 */
  systemAgeGyr?: number
  /** 万有引力常数。默认 6.6743e-11。 */
  G?: number
}

/** 由质量与密度推半径（m）。 */
function radiusFromMass(massKg: number, densityKgM3: number): number {
  return Math.cbrt((3 * massKg) / (4 * Math.PI * densityKgM3))
}

/** 圆轨道周期（s）。 */
function orbitalPeriodOf(mu: number, a: number): number {
  return 2 * Math.PI * Math.sqrt(a ** 3 / mu)
}

/**
 * 潮汐锁定时间尺度（Gyr，粗略标定）。
 * 标定：地月系统约 0.5 Gyr 内锁定。只判断"这个距离上大概率锁没锁"。
 */
function tidalLockTimescaleGyr(distanceM: number, moonMassKg: number): number {
  const a = distanceM / MOON_DIST
  const m = moonMassKg / MOON_MASS
  return (0.5 * a ** 6) / m
}

/**
 * 卫星系统分析。
 *
 * @param input - 行星与卫星设定
 * @returns 稳定性体检 + 每颗卫星的观感
 */
export function analyzeMoonSystem(input: MoonSystemInput): MoonSystemReport {
  const warnings: string[] = []
  const highlights: string[] = []
  const G = input.G ?? 6.6743e-11
  const planetMass = input.planetMassKg
  const planetRadius = input.planetRadiusM
  const planetDensity = input.planetDensityKgM3
  const age = numOr(input.systemAgeGyr, 4.5)

  const hillRadius = input.orbitM * Math.cbrt(planetMass / (3 * input.starMassKg))
  const stableOuter = 0.45 * hillRadius
  const rocheLimit = 2.44 * planetRadius * Math.cbrt(planetDensity / MOON_DENSITY)
  const stableInner = Math.max(rocheLimit * 1.05, planetRadius * 1.5)

  const moons: MoonView[] = []
  const specs = input.moons.length > 0 ? input.moons : []
  const earthMoonAngularDeg = (2 * Math.atan(MOON_RADIUS / MOON_DIST) * 180) / Math.PI

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]
    const name = spec.name?.trim() || '卫星' + (i + 1)
    const massKg = numOr(spec.massMoon, 1) * MOON_MASS
    const distanceM = numOr(spec.distanceMoon, 1) * MOON_DIST
    const radiusM = spec.radiusKm !== undefined ? spec.radiusKm * 1000 : radiusFromMass(massKg, MOON_DENSITY)
    const albedo = numOr(spec.albedo, MOON_ALBEDO)

    const mu = G * (planetMass + massKg)
    const periodDays = orbitalPeriodOf(mu, distanceM) / 86400
    const angularDeg = (2 * Math.atan(radiusM / distanceM) * 180) / Math.PI
    const magnitude =
      MOON_FULL_MAG -
      2.5 * Math.log10((albedo / MOON_ALBEDO) * (radiusM / MOON_RADIUS) ** 2 * (MOON_DIST / distanceM) ** 2)

    const tidalAccel = (2 * G * massKg * planetRadius) / distanceM ** 3
    const earthTidalAccel = (2 * G * MOON_MASS * 6.371e6) / MOON_DIST ** 3
    const tidalRelative = tidalAccel / earthTidalAccel

    const insideRoche = distanceM < rocheLimit
    const outsideHill = distanceM > hillRadius
    const locked = tidalLockTimescaleGyr(distanceM, massKg) < age

    if (insideRoche) {
      warnings.push(
        name + ' 距离 ' + (distanceM / 1000).toFixed(0) + ' km，在洛希极限（' + (rocheLimit / 1000).toFixed(0) +
          ' km）以内——会被潮汐撕碎，现实中它是一条环，不是月亮。',
      )
    }
    if (outsideHill) {
      warnings.push(
        name + ' 距离 ' + (distanceM / 1000).toFixed(0) + ' km，超出希尔球（' + (hillRadius / 1000).toFixed(0) +
          ' km）——它实际是绕恒星转的小天体，会被行星引力甩掉。',
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

  // 相邻卫星能不能共存：3.5 倍互相希尔半径
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
        inner.name + ' 与 ' + outer.name + ' 靠得太近：实际间距 ' + (actualGap / 1000).toFixed(0) +
          ' km，需要至少 ' + (requiredGap / 1000).toFixed(0) + ' km——这种配置几十万年内会互相扰动而失稳。',
      )
    }

    const ratio = outer.periodDays / inner.periodDays
    const pairs: Array<[number, number]> = [[1, 2], [1, 3], [2, 3], [3, 4], [1, 4], [2, 5]]
    for (const [p, q] of pairs) {
      if (Math.abs(ratio - q / p) / (q / p) < 0.02) {
        resonances.push(inner.name + ':' + outer.name + ' ≈ ' + p + ':' + q + ' 轨道共振')
        break
      }
    }
  }

  // 容量上限（几何估算）
  const typicalMass =
    specs.length > 0 ? Math.min(...specs.map((s) => numOr(s.massMoon, 1))) * MOON_MASS : MOON_MASS
  const spacingFactor = 1 + 3.5 * Math.cbrt((2 * typicalMass) / (3 * planetMass))
  let capacity = 0
  let r = stableInner
  while (r * spacingFactor <= stableOuter && capacity < 64) {
    capacity++
    r *= spacingFactor
  }

  // 观感描述
  for (const moon of moons) {
    const parts: string[] = []
    parts.push('天上看 ' + moon.angularDiameterDeg.toFixed(2) + '°（月球的 ' + moon.angularDiameterRelativeMoon.toFixed(2) + ' 倍）')
    parts.push('满相亮度 ' + moon.fullMagnitude.toFixed(1) + ' 等')
    if (moon.tidallyLockedLikely) parts.push('已被潮汐锁定（永远同一面朝行星）')
    if (moon.angularDiameterRelativeMoon > 2.5) {
      highlights.push(
        moon.name + ' 在天上比月球大 ' + moon.angularDiameterRelativeMoon.toFixed(1) +
          ' 倍——它会主导夜空的明暗、潮汐与所有文化的月神形象。',
      )
    }
    if (moon.fullMagnitude < -14) {
      highlights.push(moon.name + ' 满相时比满月还亮 ' + (-14 - moon.fullMagnitude).toFixed(1) + ' 等，夜里能投出清晰影子。')
    }
    moon.impression = parts.join('；') + '。'
  }

  if (moons.length === 0) {
    highlights.push('没有卫星——没有潮汐、没有月相，夜空只有恒星。航海与历法只能靠太阳和星星。')
  } else if (moons.length === 1) {
    highlights.push('只有一颗卫星：月相清晰可数，历法自然按月，这是最容易写出"熟悉感"的配置。')
  } else {
    highlights.push(
      moons.length + ' 颗卫星：会同时出现多个月亮、多套月相叠加、复合潮汐。夜空更亮，但历法会变复杂。',
    )
  }
  if (resonances.length > 0) {
    highlights.push('存在轨道共振：' + resonances.join('；') + '。共振本身稳定，还能让"每隔几年两月同辉"成为可预测天象。')
  }

  const stable =
    moons.every((m) => !m.insideRoche && !m.outsideHill) && (minSpacingMargin === null || minSpacingMargin >= 1)

  if (moons.length > capacity) {
    warnings.push(
      '卫星数量 ' + moons.length + ' 超过几何容量估算 ' + capacity +
        '（按等质量卫星、3.5 倍互相希尔半径间距推算）——要么卫星都很小，要么需要特殊形成历史。',
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
