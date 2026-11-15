/**
 * 行星系统生成：任意恒星 + 多颗行星 + 各自卫星。
 *
 * ## 为什么自建（先查了开源）
 *
 * npm 上没有「程序化行星系统生成」的成熟库：
 * - `orbital-mechanics-kit`（9KB）只做两体，与 `orbit.ts` 重叠；
 * - `pious-squid`（528KB）是**地球轨道卫星**传播（Sun/Moon 摄动），不生成行星系统；
 * - `astronomia` 是历表（VSOP87），只覆盖太阳系。
 *
 * 本模块用开普勒 + 稳定性判据自建，物理规则都有明确出处：
 * - 希尔球 `r_H = a·(m/3M)^(1/3)`（卫星/行星的引力支配范围）；
 * - 洛希极限 `a_R = 2.44·R_p·(ρ_p/ρ_s)^(1/3)`（卫星不能被潮汐撕碎）；
 * - 卫星外限 = 希尔球 / 3（超出会被恒星摄动剥离）；
 * - 行星间距判据：相邻轨道差 > 一个希尔球（避免轨道交叉）。
 *
 * @module dsh-math-calculator/features/deduction/system
 */

import { orbitalPeriod, orbitState, type OrbitalElements } from './orbit.js'

/** 行星输入。 */
export interface PlanetInput {
  name?: string
  /** 半长轴（AU）。 */
  a: number
  /** 偏心率。 */
  e?: number
  /** 倾角（度）。 */
  i?: number
  /** 行星质量（地球质量）。 */
  massEarth?: number
  /** 行星半径（地球半径）。 */
  radiusEarth?: number
  /** 卫星清单。 */
  moons?: Array<{ name?: string; a: number; massEarth?: number; radiusEarth?: number }>
}

/** 系统输入。 */
export interface SystemInput {
  /** 恒星质量（太阳质量）。 */
  starMass?: number
  /** 行星清单。 */
  planets: PlanetInput[]
  /** 当前时刻（年，从历元起）。 */
  years?: number
}

/** 行星结果。 */
export interface PlanetResult {
  name: string
  semiMajorAu: number
  periodYears: number
  massEarth: number
  /** 希尔球（AU）。 */
  hillAu: number
  /** 卫星可行内限（洛希，AU）。 */
  rocheAu: number
  /** 卫星可行外限（希尔/3，AU）。 */
  outerLimitAu: number
  /** 当前位置。 */
  position: { x: number; y: number; z: number }
  moons: Array<{ name: string; semiMajorAu: number; periodYears: number; insideRoche: boolean; outsideHill: boolean }>
}

/** 系统结果。 */
export interface SystemResult {
  starMass: number
  planets: PlanetResult[]
  /** 稳定性问题。 */
  warnings: string[]
}

/**
 * 生成行星系统（周期/希尔球/卫星可行域/稳定性）。
 *
 * @param input - 系统输入
 * @returns 结果
 */
export function buildPlanetarySystem(input: SystemInput): SystemResult {
  const starMass = input.starMass ?? 1
  if (!(starMass > 0)) throw new Error('恒星质量必须为正')
  if (!Array.isArray(input.planets) || input.planets.length === 0) throw new Error('至少给一颗行星')
  const years = input.years ?? 0
  const planets: PlanetResult[] = []
  const warnings: string[] = []

  for (const planet of input.planets) {
    const massEarth = planet.massEarth ?? 1
    const radiusEarth = planet.radiusEarth ?? 1
    const elements: OrbitalElements = { a: planet.a, e: planet.e ?? 0, i: planet.i ?? 0, centralMass: starMass, bodyMass: massEarth / 332946 }
    const period = orbitalPeriod(elements)
    const state = orbitState(elements, years)
    /** 希尔球：a·(m/3M)^(1/3)，质量用地球质量与恒星质量比。 */
    const hill = planet.a * Math.cbrt(massEarth / 332946 / (3 * starMass))
    /** 洛希极限（卫星密度取 3 g/cm³ 近似）：2.44·R_p·(ρ_p/ρ_s)^(1/3)。 */
    const roche = 2.44 * radiusEarth * 6371 / 149597870.7 * Math.cbrt(5.51 / 3)
    const outer = hill / 3
    const moons: PlanetResult['moons'] = []
    for (const moon of planet.moons ?? []) {
      const moonPeriod = orbitalPeriod({ a: moon.a, e: 0, centralMass: massEarth / 332946, bodyMass: (moon.massEarth ?? 0.0123) / 332946 })
      const insideRoche = moon.a < roche
      const outsideHill = moon.a > outer
      if (insideRoche) warnings.push(planet.name + ' 的卫星「' + (moon.name ?? '未命名') + '」在洛希极限内（会被潮汐撕碎）')
      if (outsideHill) warnings.push(planet.name + ' 的卫星「' + (moon.name ?? '未命名') + '」超出希尔球/3（会被恒星摄动剥离）')
      moons.push({ name: moon.name ?? '未命名', semiMajorAu: moon.a, periodYears: moonPeriod, insideRoche, outsideHill })
    }
    planets.push({ name: planet.name ?? '行星' + (planets.length + 1), semiMajorAu: planet.a, periodYears: period, massEarth, hillAu: hill, rocheAu: roche, outerLimitAu: outer, position: state.positionAu, moons })
  }

  /** 行星间距：相邻轨道差应大于一个希尔球（避免轨道交叉）。 */
  for (let index = 1; index < planets.length; index += 1) {
    const gap = planets[index].semiMajorAu - planets[index - 1].semiMajorAu
    const needed = planets[index - 1].hillAu
    if (gap < needed) warnings.push(planets[index - 1].name + ' 与 ' + planets[index].name + ' 间距 ' + gap.toFixed(4) + ' AU < 希尔球 ' + needed.toFixed(4) + ' AU（轨道可能交叉）')
  }

  return { starMass, planets, warnings }
}
