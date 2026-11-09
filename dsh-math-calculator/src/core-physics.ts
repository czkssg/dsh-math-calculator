/**
 * ## 共享的物理核心式（single source of truth）
 *
 * 这个模块解决一个具体的结构问题：**同一批物理量被算了两次**。
 *
 * ```
 *   src/world.ts          自己算 surfaceGravity / escapeVelocity / maxMountainHeight…
 *   src/formula-library.ts 也有 surface_gravity / escape_velocity / building_height_limit…
 * ```
 *
 * 实测确认 `world.ts` 完全不 import 公式库（只引 `CONSTANTS` 常量表）。
 * 两边当前数字一致 —— 但那是因为「当初抄对了」，**不是结构上保证一致**。
 * 本项目已经吃过一次同类的亏（README 写 404 条而代码 442 条）。
 *
 * ## 为什么不直接让 world import 公式库
 *
 * 两个原因：
 *
 * ```
 * ① 重量：formulas.ts 会拉进 631 条公式与 mathjs 的全部依赖，
 *   而 world 只需要 4 个算式。为了 4 行代码引入一个引擎不划算。
 *
 * ② 方向：公式库的定位是「可查询的数据」，world 是「一次推演」。
 *   让推演依赖数据是自然的，让数据依赖推演则不行（会成环）。
 * ```
 *
 * ## 所以这里的定位是「被双方共享的纯函数层」
 *
 * ```
 *   core-physics.ts（本文件，零依赖、纯函数）
 *        ↑                    ↑
 *   world.ts            formula-library.ts
 *   （推演用）           （对外暴露成公式）
 * ```
 *
 * 依赖是单向的：两边都指向这里，这里不指向任何人。
 * **改一处，两边同时变** —— 这才是「单一数据源」。
 *
 * ## 一个必须记住的坑
 *
 * 这些函数只做**纯计算**，不注入任何默认值或上下文。
 * 例如 `buildingHeightLimit` 的 `strength` 参数：
 *
 * ```
 *   world 用 1.3e8（由精细结构常数 α 推出，ADR-0001 S2）
 *   公式库默认 2e8
 * ```
 *
 * 两者算出的山高差 54%（4.9 km vs 7.54 km）—— **这不是 bug，是输入口径不同**。
 * 所以本模块**不提供默认值**，逼调用方明确自己用的是哪个。
 *
 * @module dsh-math-calculator/core-physics
 */

/**
 * 表面重力。
 *
 * @param G - 万有引力常数（m³/(kg·s²)）
 * @param M - 行星质量（kg）
 * @param R - 行星半径（m）
 * @returns 表面重力加速度（m/s²）
 */
export function surfaceGravity(G: number, M: number, R: number): number {
  return (G * M) / (R * R)
}

/**
 * 逃逸速度（第二宇宙速度）。
 *
 * @param G - 万有引力常数
 * @param M - 行星质量（kg）
 * @param R - 行星半径（m）
 * @returns 逃逸速度（m/s）
 */
export function escapeVelocity(G: number, M: number, R: number): number {
  return Math.sqrt((2 * G * M) / R)
}

/**
 * 圆轨道速度（第一宇宙速度）。
 *
 * @param G - 万有引力常数
 * @param M - 中心天体质量（kg）
 * @param r - 轨道半径（m）
 * @returns 轨道速度（m/s）
 */
export function orbitalVelocity(G: number, M: number, r: number): number {
  return Math.sqrt((G * M) / r)
}

/**
 * 圆轨道周期（开普勒第三定律）。
 *
 * @param G - 万有引力常数
 * @param M - 中心天体质量（kg）
 * @param r - 轨道半径（m）
 * @returns 周期（秒）
 */
export function orbitalPeriod(G: number, M: number, r: number): number {
  return 2 * Math.PI * Math.sqrt((r * r * r) / (G * M))
}

/**
 * 平均密度。
 *
 * @param M - 质量（kg）
 * @param R - 半径（m）
 * @returns 密度（kg/m³）
 */
export function meanDensity(M: number, R: number): number {
  return M / ((4 / 3) * Math.PI * R * R * R)
}

/**
 * 地平线距离（平视，忽略大气折射）。
 *
 * ★ 这是**几何**，不是经验式：d = √(2Rh + h²)。
 *   小 h 时近似 √(2Rh)，但公式保留 h² 项以免高塔时失真。
 *
 * @param R - 行星半径（m）
 * @param h - 眼高（m）
 * @returns 地平线距离（m）
 */
export function horizonDistance(R: number, h: number): number {
  return Math.sqrt(2 * R * h + h * h)
}

/**
 * 恒星的光度（斯特藩-玻尔兹曼）。
 *
 * @param sigma - 斯特藩常数（W/(m²·K⁴)）
 * @param R - 恒星半径（m）
 * @param T - 表面温度（K）
 * @returns 光度（W）
 */
export function stellarLuminosity(sigma: number, R: number, T: number): number {
  return 4 * Math.PI * R * R * sigma * Math.pow(T, 4)
}

/**
 * 行星平衡温度（不含温室）。
 *
 * @param L - 恒星光度（W）
 * @param albedo - 反照率（0~1）
 * @param d - 轨道半径（m）
 * @param sigma - 斯特藩常数
 * @returns 平衡温度（K）
 */
export function equilibriumTemperature(L: number, albedo: number, d: number, sigma: number): number {
  return Math.pow((L * (1 - albedo)) / (16 * Math.PI * sigma * d * d), 0.25)
}

/**
 * 自转离心比（赤道离心力 / 重力）。
 *
 * ★ > 1 意味着赤道上的物体"飘起来"——这是行星自转上限的判据。
 *
 * @param omega - 自转角速度（rad/s）
 * @param R - 赤道半径（m）
 * @param g - 表面重力（m/s²）
 * @returns 无量纲比值
 */
export function centrifugalRatio(omega: number, R: number, g: number): number {
  return (omega * omega * R) / g
}

/**
 * 材料能支撑的最大山高（抗压强度 / 单位面积重量）。
 *
 * ★★ **必须显式传 strength。** 这个参数有两套口径：
 *
 * ```
 *   world 用 1.3e8（由 α 推出的地球材料强度，ADR-0001 S2）
 *   公式库默认 2e8
 * ```
 *
 * 差 54%（4.9 km vs 7.54 km）。本函数**不提供默认值**，
 * 因为一旦给了默认值，「用的是哪个口径」就会被隐藏起来 ——
 * 而那正是这类重复实现最危险的失效方式。
 *
 * @param strength - 抗压强度（Pa）
 * @param rho - 密度（kg/m³）
 * @param g - 表面重力（m/s²）
 * @returns 最大高度（m）
 */
export function buildingHeightLimit(strength: number, rho: number, g: number): number {
  return strength / (rho * g)
}

/**
 * 干绝热直减率（双原子气体，第一性原理）。
 *
 * Γ = g·M_molar/(3.5·R_gas)。3.5 = (γ/(γ−1)) 中 γ=7/5 的结果。
 *
 * @param g - 重力（m/s²）
 * @param molarMass - 摩尔质量（kg/mol）
 * @param R - 气体常数（J/(mol·K)）
 * @returns 直减率（K/m）
 */
export function dryLapseRate(g: number, molarMass: number, R: number): number {
  return (g * molarMass) / (3.5 * R)
}
