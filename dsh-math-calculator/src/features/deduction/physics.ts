/**
 * 共享物理式（纯函数层，单一数据源）。
 *
 * ## 为什么单独一层
 *
 * 同一批算式曾经存在两套实现：`world` 里就地写一遍，公式库里再写一遍。
 * 两边数字当时一致，靠的是"抄对了"，不是结构保证——这类重复最危险的失效方式
 * 是某天只改了一处。现在两边都指向这里。
 *
 * ## 约定
 *
 * - 零依赖、零默认值、零上下文。每个参数由调用方显式给。
 * - 只做代数，不注入单位。单位由调用方保证一致（SI）。
 * - 这些是【精确】级关系（代数式），不是经验拟合；标度类结果由上层声明。
 *
 * @module dsh-math-calculator/features/deduction/physics
 */

/** 取参数或默认值（undefined / 非有限 → fallback）。 */
export function numOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** 角度转弧度。 */
export function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** 弧度转角度。 */
export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

/**
 * 表面重力：g = GM/R²。
 *
 * @param G - 万有引力常数（m³/(kg·s²)）
 * @param M - 天体质量（kg）
 * @param R - 天体半径（m）
 * @returns 表面重力加速度（m/s²）
 */
export function surfaceGravity(G: number, M: number, R: number): number {
  return (G * M) / (R * R)
}

/**
 * 逃逸速度：v_esc = √(2GM/R)。
 *
 * @param G - 万有引力常数
 * @param M - 天体质量（kg）
 * @param R - 天体半径（m）
 * @returns 逃逸速度（m/s）
 */
export function escapeVelocity(G: number, M: number, R: number): number {
  return Math.sqrt((2 * G * M) / R)
}

/**
 * 圆轨道速度：v = √(GM/r)。
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
 * 轨道周期（开普勒第三定律）：T = 2π√(r³/(GM))。
 *
 * @param G - 万有引力常数
 * @param M - 中心天体质量（kg）
 * @param r - 轨道半径（m）
 * @returns 周期（s）
 */
export function orbitalPeriod(G: number, M: number, r: number): number {
  return 2 * Math.PI * Math.sqrt((r * r * r) / (G * M))
}

/**
 * 平均密度：ρ = M / (4/3·πR³)。
 *
 * @param M - 质量（kg）
 * @param R - 半径（m）
 * @returns 密度（kg/m³）
 */
export function meanDensity(M: number, R: number): number {
  return M / ((4 / 3) * Math.PI * R * R * R)
}

/**
 * 地平线距离（平视，忽略大气折射）：d = √(2Rh + h²)。
 *
 * 保留 h² 项：低眼高时可忽略，高塔或高山上不能。
 *
 * @param R - 行星半径（m）
 * @param h - 眼高（m）
 * @returns 地平线距离（m）
 */
export function horizonDistance(R: number, h: number): number {
  return Math.sqrt(2 * R * h + h * h)
}

/**
 * 恒星光度（斯特藩-玻尔兹曼）：L = 4πR²σT⁴。
 *
 * @param sigma - 斯特藩-玻尔兹曼常数（W/(m²·K⁴)）
 * @param R - 恒星半径（m）
 * @param T - 表面温度（K）
 * @returns 光度（W）
 */
export function stellarLuminosity(sigma: number, R: number, T: number): number {
  return 4 * Math.PI * R * R * sigma * Math.pow(T, 4)
}

/**
 * 行星平衡温度（不含温室）：T_eq = [L(1-α)/(16πσd²)]^(1/4)。
 *
 * 16π 而不是 4π：接收面积 πR² 摊到辐射面积 4πR²，得到 1/4 的几何因子。
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
 * 自转离心比：ω²R/g。> 1 表示赤道物体飘起（解体判据）。
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
 * 材料能支撑的最大高度：h = σ_strength / (ρg)。
 *
 * ## strength 不设默认值
 *
 * 两套口径差 54%：由精细结构常数推出的地球材料强度 1.3e8 Pa，
 * 与公式库常用的 2e8 Pa。给了默认值，"用的是哪个口径"就被隐藏起来了。
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
 * 干绝热直减率：Γ = g·M_molar/(3.5·R_gas)。
 *
 * 3.5 = γ/(γ-1)，γ=7/5（双原子气体）。湿绝热还要乘经验修正系数，
 * 那个系数由上层以地球 6.5 K/km 标定，不属于本层。
 *
 * @param g - 重力（m/s²）
 * @param molarMass - 摩尔质量（kg/mol）
 * @param R - 气体常数（J/(mol·K)）
 * @returns 直减率（K/m）
 */
export function dryLapseRate(g: number, molarMass: number, R: number): number {
  return (g * molarMass) / (3.5 * R)
}

/**
 * 普朗克黑体辐射函数 B_λ(T)（相对强度，省略 2hc² 常数因子）。
 *
 * @param h - 普朗克常数
 * @param c - 光速
 * @param kB - 玻尔兹曼常数
 * @param lambdaNm - 波长（nm）
 * @param tempK - 温度（K）
 * @returns B_λ 的相对值（只用于比较光谱形状）
 */
export function planckRadiance(h: number, c: number, kB: number, lambdaNm: number, tempK: number): number {
  const lambda = lambdaNm * 1e-9
  const exponent = (h * c) / (lambda * kB * tempK)
  if (exponent > 700) return 0 // 防止 exp 溢出
  return 1 / (lambda ** 5 * (Math.exp(exponent) - 1))
}

/**
 * 维恩位移定律：峰值波长 λ_max = b / T。
 *
 * @param b - 维恩常数（m·K，2.897771955e-3）
 * @param tempK - 温度（K）
 * @returns 峰值波长（nm）
 */
export function wienPeakNm(b: number, tempK: number): number {
  return (b / tempK) * 1e9
}
