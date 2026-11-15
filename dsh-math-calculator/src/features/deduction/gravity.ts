/**
 * 引力与相对论：把「宇宙各种天体」从行星推到黑洞/中子星。
 *
 * ## 拼接来源
 *
 * - 牛顿引力与轨道速度：`orbit.ts` 已用开普勒；这里补**局部**量（逃逸速度、圆轨道速度、潮汐）；
 * - 相对论：史瓦西度规的常用公式（**非**完整广义相对论求解）：
 *     史瓦西半径   r_s = 2GM/c²
 *     光子球       1.5 r_s
 *     ISCO         3 r_s（最内稳定圆轨道）
 *     时间膨胀     dτ/dt = sqrt(1 − r_s/r − v²/c²)
 *     引力红移     z = 1/sqrt(1 − r_s/r) − 1
 * - 多体：N 体牛顿引力加速度（不给 N 体积分器，只给瞬时加速度）。
 *
 * ## 边界
 *
 * 这是**弱场/球对称**公式集，不是数值相对论；强场合并、引力波波形不在范围。
 *
 * @module dsh-math-calculator/features/deduction/gravity
 */

/** 万有引力常数（SI）。 */
export const G = 6.6743e-11
/** 光速（m/s）。 */
export const C = 299792458
/** 太阳质量（kg）。 */
export const M_SUN = 1.98847e30
/** 地球质量（kg）。 */
export const M_EARTH = 5.9722e24
/** AU（m）。 */
export const AU = 1.495978707e11

/** 圆轨道速度（m/s）。 */
export function circularVelocity(massKg: number, radiusM: number): number {
  return Math.sqrt((G * massKg) / radiusM)
}

/** 逃逸速度（m/s）。 */
export function escapeVelocity(massKg: number, radiusM: number): number {
  return Math.sqrt((2 * G * massKg) / radiusM)
}

/** 史瓦西半径（m）。 */
export function schwarzschildRadius(massKg: number): number {
  return (2 * G * massKg) / (C * C)
}

/** 光子球半径（m）。 */
export function photonSphere(massKg: number): number {
  return 1.5 * schwarzschildRadius(massKg)
}

/** 最内稳定圆轨道（ISCO，m）。 */
export function iscoRadius(massKg: number): number {
  return 3 * schwarzschildRadius(massKg)
}

/** 引力时间膨胀（静止观察者在无穷远）：dτ/dt。 */
export function gravitationalTimeDilation(massKg: number, radiusM: number): number {
  const rs = schwarzschildRadius(massKg)
  if (radiusM <= rs) return 0
  return Math.sqrt(1 - rs / radiusM)
}

/** 速度时间膨胀（狭义相对论）：dτ/dt。 */
export function velocityTimeDilation(speed: number): number {
  const beta = speed / C
  if (beta >= 1) return 0
  return Math.sqrt(1 - beta * beta)
}

/** 合成时间膨胀（引力 + 速度）：dτ/dt。 */
export function totalTimeDilation(massKg: number, radiusM: number, speed: number): number {
  const rs = schwarzschildRadius(massKg)
  const beta = speed / C
  const inside = 1 - rs / radiusM - beta * beta
  return inside > 0 ? Math.sqrt(inside) : 0
}

/** 引力红移 z。 */
export function gravitationalRedshift(massKg: number, radiusM: number): number {
  const rs = schwarzschildRadius(massKg)
  if (radiusM <= rs) return Infinity
  return 1 / Math.sqrt(1 - rs / radiusM) - 1
}

/** 潮汐加速度（两点的引力差，m/s²）。 */
export function tidalAcceleration(massKg: number, radiusM: number, separationM: number): number {
  return (2 * G * massKg * separationM) / (radiusM ** 3)
}

/** N 体瞬时加速度。 */
export interface GravityBody {
  massKg: number
  positionM: [number, number, number]
}

/**
 * 计算某点的 N 体引力加速度（m/s²）。
 *
 * @param bodies - 引力源
 * @param point - 该点位置（m）
 * @returns 加速度向量
 */
export function nBodyAcceleration(bodies: GravityBody[], point: [number, number, number]): [number, number, number] {
  const acc: [number, number, number] = [0, 0, 0]
  for (const body of bodies) {
    const dx = body.positionM[0] - point[0]
    const dy = body.positionM[1] - point[1]
    const dz = body.positionM[2] - point[2]
    const r2 = dx * dx + dy * dy + dz * dz
    if (r2 === 0) continue
    const r = Math.sqrt(r2)
    const factor = (G * body.massKg) / (r2 * r)
    acc[0] += factor * dx
    acc[1] += factor * dy
    acc[2] += factor * dz
  }
  return acc
}

/** 天体分类。 */
export interface BodyRegime {
  /** 史瓦西半径（m）。 */
  schwarzschildM: number
  /** 是否为黑洞候选（半径 < 史瓦西半径）。 */
  isBlackHole: boolean
  /** 逃逸速度（m/s）。 */
  escapeMps: number
  /** 逃逸速度 / 光速。 */
  beta: number
  /** 相对论效应强度（1 - dτ/dt，0 为无）。 */
  relativityStrength: number
}

/**
 * 判定一个天体的引力区间（行星 → 中子星 → 黑洞）。
 *
 * @param massKg - 质量
 * @param radiusM - 实际半径（黑洞给史瓦西半径）
 * @returns 区间指标
 */
export function classifyRegime(massKg: number, radiusM: number): BodyRegime {
  const rs = schwarzschildRadius(massKg)
  const escape = escapeVelocity(massKg, radiusM)
  const beta = escape / C
  const dilation = radiusM > rs ? Math.sqrt(1 - rs / radiusM) : 0
  return {
    schwarzschildM: rs,
    isBlackHole: radiusM <= rs,
    escapeMps: escape,
    beta,
    relativityStrength: 1 - dilation,
  }
}
