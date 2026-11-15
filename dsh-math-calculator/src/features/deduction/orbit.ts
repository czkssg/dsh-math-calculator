/**
 * 通用轨道（开普勒）——把 astronomy-engine 的地球历表能力推广到任意天体。
 *
 * ## 从 astronomy-engine 解析出的可推广部分
 *
 * astronomy-engine 内部对行星用 **VSOP87 级数**（拟合历表，精度极高但只覆盖太阳系），
 * 对任意天体它没有通用接口（`Orbit` 类未导出）。可推广的是它底层的**开普勒模型**：
 *
 * ```
 *   轨道根数 (a, e, i, Ω, ω, M0, epoch) + 中心天体质量 μ
 *     → 开普勒方程  M = E − e·sinE  （牛顿迭代）
 *     → 真近点角 ν → 轨道平面位置 → 旋转到参考系
 *     → 位置/速度（活力公式）→ 周期（开普勒第三定律）
 * ```
 *
 * 这套对**任何**二体系统都成立：架空行星绕恒星、月球绕行星、双星互绕。
 * VSOP87 不可推广（它只拟合太阳系行星），开普勒可以——这就是分工。
 *
 * @module dsh-math-calculator/features/deduction/orbit
 */

/** 引力常数（AU³/(M☉·年²) 口径）。 */
const G_AU = 4 * Math.PI * Math.PI
/** AU → km。 */
const AU_KM = 149597870.7

/** 轨道根数。 */
export interface OrbitalElements {
  /** 半长轴（AU）。 */
  a: number
  /** 偏心率（0 ≤ e < 1）。 */
  e: number
  /** 倾角（度）。 */
  i?: number
  /** 升交点黄经（度）。 */
  omega?: number
  /** 近日点幅角（度）。 */
  w?: number
  /** 历元平近点角（度）。 */
  M0?: number
  /** 中心天体质量（太阳质量）。 */
  centralMass?: number
  /** 轨道天体质量（太阳质量，默认 0）。 */
  bodyMass?: number
}

/** 位置结果。 */
export interface OrbitState {
  /** 历元后经过的时间（年）。 */
  years: number
  /** 轨道周期（年）。 */
  periodYears: number
  /** 平近点角（度）。 */
  meanAnomaly: number
  /** 偏近点角（度）。 */
  eccentricAnomaly: number
  /** 真近点角（度）。 */
  trueAnomaly: number
  /** 到中心天体的距离（AU）。 */
  radiusAu: number
  /** 位置（AU，参考系坐标）。 */
  positionAu: { x: number; y: number; z: number }
  /** 速度（AU/年）。 */
  velocityAuPerYear: { x: number; y: number; z: number }
}

/**
 * 解开普勒方程 M = E − e·sin E（牛顿迭代）。
 *
 * @param M - 平近点角（弧度）
 * @param e - 偏心率
 * @returns 偏近点角（弧度）
 */
export function solveKepler(M: number, e: number): number {
  /** 高偏心率时以 π 为初值更稳（e>0.8）。 */
  let E = e > 0.8 ? Math.PI : M
  for (let i = 0; i < 100; i += 1) {
    const f = E - e * Math.sin(E) - M
    const fp = 1 - e * Math.cos(E)
    const dE = f / fp
    E -= dE
    if (Math.abs(dE) < 1e-12) break
  }
  return E
}

/**
 * 轨道周期（开普勒第三定律，年）。
 *
 * @param elements - 轨道根数
 * @returns 周期（年）
 */
export function orbitalPeriod(elements: OrbitalElements): number {
  const mu = (elements.centralMass ?? 1) + (elements.bodyMass ?? 0)
  return Math.sqrt((elements.a ** 3) / mu)
}

/**
 * 由轨道根数算某一时刻的位置与速度。
 *
 * @param elements - 轨道根数
 * @param years - 历元后时间（年）
 * @returns 状态
 */
export function orbitState(elements: OrbitalElements, years = 0): OrbitState {
  const e = elements.e
  if (!(elements.a > 0)) throw new Error('半长轴必须为正')
  if (!(e >= 0 && e < 1)) throw new Error('偏心率必须在 [0,1)')
  const period = orbitalPeriod(elements)
  const deg = Math.PI / 180
  const M = ((elements.M0 ?? 0) * deg + (2 * Math.PI * years) / period) % (2 * Math.PI)
  const E = solveKepler(M, e)
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2))
  const r = elements.a * (1 - e * Math.cos(E))
  /** 轨道平面位置。 */
  const xOrb = r * Math.cos(nu)
  const yOrb = r * Math.sin(nu)
  /** 旋转：近日点幅角 ω、升交点 Ω、倾角 i。 */
  const w = (elements.w ?? 0) * deg
  const om = (elements.omega ?? 0) * deg
  const inc = (elements.i ?? 0) * deg
  const cosW = Math.cos(w)
  const sinW = Math.sin(w)
  const cosO = Math.cos(om)
  const sinO = Math.sin(om)
  const cosI = Math.cos(inc)
  const sinI = Math.sin(inc)
  const x = (cosW * cosO - sinW * sinO * cosI) * xOrb + (-sinW * cosO - cosW * sinO * cosI) * yOrb
  const y = (cosW * sinO + sinW * cosO * cosI) * xOrb + (-sinW * sinO + cosW * cosO * cosI) * yOrb
  const z = sinW * sinI * xOrb + cosW * sinI * yOrb
  /** 速度（活力公式 + 角度变化）。 */
  const mu = (elements.centralMass ?? 1) + (elements.bodyMass ?? 0)
  const n = (2 * Math.PI) / period
  const rDot = (n * elements.a * e * Math.sin(E)) / (1 - e * Math.cos(E))
  const rTheta = (n * elements.a * Math.sqrt(1 - e * e)) / (1 - e * Math.cos(E))
  const vxOrb = rDot * Math.cos(nu) - rTheta * Math.sin(nu)
  const vyOrb = rDot * Math.sin(nu) + rTheta * Math.cos(nu)
  const vx = (cosW * cosO - sinW * sinO * cosI) * vxOrb + (-sinW * cosO - cosW * sinO * cosI) * vyOrb
  const vy = (cosW * sinO + sinW * cosO * cosI) * vxOrb + (-sinW * sinO + cosW * cosO * cosI) * vyOrb
  const vz = sinW * sinI * vxOrb + cosW * sinI * vyOrb
  return {
    years,
    periodYears: period,
    meanAnomaly: (M / deg + 360) % 360,
    eccentricAnomaly: (E / deg + 360) % 360,
    trueAnomaly: (nu / deg + 360) % 360,
    radiusAu: r,
    positionAu: { x, y, z },
    velocityAuPerYear: { x: vx, y: vy, z: vz },
  }
}

/** ��星系统。 */
export interface BinarySystem {
  /** 主星质量（太阳质量）。 */
  massA: number
  /** 伴星质量（太阳质量）。 */
  massB: number
  /** 半长轴（AU）。 */
  semiMajorAu: number
  /** 偏心率。 */
  e?: number
}

/** 双星结果。 */
export interface BinaryResult {
  /** 周期（年）。 */
  periodYears: number
  /** 质心到主星的距离（AU）。 */
  aStarAu: number
  /** 质心到伴星的距离（AU）。 */
  aCompanionAu: number
  /** 质心速度比。 */
  velocityRatio: number
  /** 相对速度（km/s，圆轨道近似）。 */
  relativeSpeedKms: number
}

/**
 * 双星互绕（两体 + 质心）。
 *
 * @param system - 系统
 * @returns 结果
 */
export function binaryOrbit(system: BinarySystem): BinaryResult {
  const total = system.massA + system.massB
  const period = Math.sqrt((system.semiMajorAu ** 3) / total)
  const aStar = (system.semiMajorAu * system.massB) / total
  const aCompanion = (system.semiMajorAu * system.massA) / total
  const relSpeed = (2 * Math.PI * system.semiMajorAu) / (period * 365.25 * 86400) * AU_KM
  return {
    periodYears: period,
    aStarAu: aStar,
    aCompanionAu: aCompanion,
    velocityRatio: aStar / aCompanion,
    relativeSpeedKms: relSpeed,
  }
}
