/**
 * 公式库：把「能一行算完的现实公式」做成快捷方式。
 *
 * 设计原则（对应世界观推演需求）：
 * 1. **每个参数都有真实默认值**，但**任何参数都可以被调用方覆盖** ——
 *    架空世界把 g 改成 15、把光速改成别的，直接传 variables 即可。
 * 2. **参数为 null 表示必须给定**，缺了会明确报错并列出缺哪个。
 * 3. 公式一律写成 mathjs 表达式，用 BigNumber 求值，保持精度。
 * 4. 只收「能用闭合式（closed form）算完」的公式；
 *    需要解微分方程的（如 SIR、Lotka-Volterra 的完整轨迹）只收平稳点/阈值这类可闭式表达的部分。
 *
 * @module dsh-math-calculator/formula-library
 */

/** 物理与数学常数（SI）。架空世界可通过 variables 覆盖任何一个。 */
export const CONSTANTS: Record<string, number> = {
  G: 6.6743e-11, // 万有引力常数
  c: 299792458, // 光速 m/s
  g: 9.80665, // 标准重力 m/s^2
  h: 6.62607015e-34, // 普朗克常数 J·s
  hbar: 1.054571817e-34, // 约化普朗克常数
  kB: 1.380649e-23, // 玻尔兹曼常数
  NA: 6.02214076e23, // 阿伏伽德罗常数
  R: 8.314462618, // 气体常数
  sigma: 5.670374419e-8, // 斯特藩-玻尔兹曼常数
  e_charge: 1.602176634e-19, // 元电荷
  kCoulomb: 8.9875517923e9, // 库仑常数
  epsilon0: 8.8541878128e-12, // 真空介电常数
  mu0: 1.25663706212e-6, // 真空磁导率
  bWien: 2.897771955e-3, // 维恩位移常数
  atm: 101325, // 标准大气压 Pa
  me: 9.1093837015e-31, // 电子质量 kg
  mp: 1.67262192369e-27, // 质子质量 kg
  muB: 9.2740100783e-24, // 玻尔磁子 J/T
  alpha_fs: 7.2973525693e-3, // 精细结构常数（无量纲）
  Ry: 13.605693122994, // 里德堡能量 eV
  AU: 1.495978707e11, // 天文单位 m
  ly: 9.4607304725808e15, // 光年 m
  pc: 3.0856775814913673e16, // 秒差距 m
  Mearth: 5.9722e24, // 地球质量
  Rearth: 6.371e6, // 地球半径
  Msun: 1.98892e30, // 太阳质量
  Rsun: 6.957e8, // 太阳半径
  Lsun: 3.828e26, // 太阳光度 W
  year: 31557600, // 儒略年 s
  day: 86400, // 日 s
  phi: 1.618033988749895, // 黄金比例
  eulerGamma: 0.5772156649015329, // 欧拉-马歇罗尼常数
  ln2: 0.6931471805599453,
  ln10: 2.302585092994046,
}

/** 一个参数的声明。null 表示必填。 */
export interface ParamSpec {
  /** 默认值；null 表示调用方必须提供。 */
  value: number | null
  /** 说明（含单位）。 */
  desc: string
}

/** 一条公式。 */
export interface FormulaDef {
  id: string
  /** 分类路径，如 physics/mechanics。 */
  cat: string
  /** 中文名。 */
  name: string
  /** mathjs 表达式。 */
  expr: string
  /** 参数表。 */
  params: Record<string, ParamSpec>
  /** 结果的量纲说明（仅展示）。 */
  unit?: string
  desc: string
  /** 检索关键词（中英文）。 */
  keys?: string[]
  /**
   * 读者视角使用频次（缺省按分类推断，见 formulas.ts）。
   * high = 故事里高频出现；low = 几乎不会用到。
   */
  frequency?: 'high' | 'medium' | 'low'
  /** 规则层级（离最底层规则的远近）；缺省由 taxonomy 推断。 */
  layer?: 'fundamental' | 'derived' | 'phenomenological' | 'engineering' | 'conventional'
  /** 学科领域（多标签）：physics / chemistry / materials / medicine …；缺省由 taxonomy 推断。 */
  domains?: string[]
  /** 细标签（自由扩展）。 */
  tags?: string[]
  /**
   * 用 JS 侧实现代替 mathjs 表达式。
   * 用于数组逐元素运算这类 mathjs 表达不好的场景。
   * 值与 formula-builtins.ts 里的实现一一对应。
   */
  builtin?: string
}

/** 便捷构造：带默认值的参数。 */
const p = (value: number | string, desc: string): ParamSpec => ({
  value: typeof value === 'string' ? Number(value) : value,
  desc,
})

/** 便捷构造：必填参数。 */
const req = (desc: string): ParamSpec => ({ value: null, desc })

/**
 * 公式总表。
 *
 * 收录标准：闭合式、单次求值、参数现实可得。
 * 不收：需要解 ODE 的完整曲线、需要外部数据集才能算的（如真实投入产出表）。
 */
export const FORMULAS: FormulaDef[] = [
  // ══════════════════════════════════════════════════════════════════
  // 物理 · 运动学与力学
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'velocity_uniform',
    cat: 'physics/mechanics',
    name: '匀速速度',
    expr: 's / t',
    params: { s: req('位移 m'), t: req('时间 s') },
    unit: 'm/s',
    desc: '匀速直线运动的速度。',
    keys: ['velocity', '速度', '匀速'],
  },
  {
    id: 'acceleration',
    cat: 'physics/mechanics',
    name: '加速度',
    expr: '(v - v0) / t',
    params: { v: req('末速度 m/s'), v0: p(0, '初速度 m/s'), t: req('时间 s') },
    unit: 'm/s^2',
    desc: '匀变速运动的加速度。',
    keys: ['acceleration', '加速度'],
  },
  {
    id: 'kinematics_v',
    cat: 'physics/mechanics',
    name: '速度公式（无位移）',
    expr: 'v0 + a * t',
    params: { v0: p(0, '初速度 m/s'), a: req('加速度 m/s^2'), t: req('时间 s') },
    unit: 'm/s',
    desc: 'v = v0 + at。',
    keys: ['kinematics', '运动学'],
  },
  {
    id: 'kinematics_s',
    cat: 'physics/mechanics',
    name: '位移公式（无末速）',
    expr: 'v0 * t + 0.5 * a * t^2',
    params: { v0: p(0, '初速度 m/s'), a: req('加速度 m/s^2'), t: req('时间 s') },
    unit: 'm',
    desc: 's = v0·t + ½at²。',
    keys: ['kinematics', '位移'],
  },
  {
    id: 'kinematics_v2',
    cat: 'physics/mechanics',
    name: '速度-位移关系',
    expr: 'sqrt(v0^2 + 2 * a * s)',
    params: { v0: p(0, '初速度 m/s'), a: req('加速度 m/s^2'), s: req('位移 m') },
    unit: 'm/s',
    desc: 'v² = v0² + 2as（不含时间）。',
    keys: ['kinematics'],
  },
  {
    id: 'newton_second',
    cat: 'physics/mechanics',
    name: '牛顿第二定律',
    expr: 'm * a',
    params: { m: req('质量 kg'), a: req('加速度 m/s^2') },
    unit: 'N',
    desc: 'F = ma。',
    keys: ['newton', 'force', '力'],
  },
  {
    id: 'weight',
    cat: 'physics/mechanics',
    name: '重力（重量）',
    expr: 'm * g',
    params: { m: req('质量 kg'), g: p(CONSTANTS.g, '重力加速度 m/s^2（架空世界可改）') },
    unit: 'N',
    desc: 'W = mg。改 g 即可模拟高重力/低重力世界。',
    keys: ['weight', 'gravity', '重']  ,
  },
  {
    id: 'friction',
    cat: 'physics/mechanics',
    name: '滑动摩擦力',
    expr: 'mu * N',
    params: { mu: req('摩擦系数 μ'), N: req('正压力 N') },
    unit: 'N',
    desc: 'f = μN。',
    keys: ['friction', '摩擦'],
  },
  {
    id: 'kinetic_energy',
    cat: 'physics/mechanics',
    name: '动能',
    expr: '0.5 * m * v^2',
    params: { m: req('质量 kg'), v: req('速度 m/s') },
    unit: 'J',
    desc: 'Ek = ½mv²。',
    keys: ['kinetic', 'energy', '动能'],
  },
  {
    id: 'potential_energy',
    cat: 'physics/mechanics',
    name: '重力势能',
    expr: 'm * g * h',
    params: { m: req('质量 kg'), g: p(CONSTANTS.g, '重力加速度 m/s^2'), h: req('高度 m') },
    unit: 'J',
    desc: 'Ep = mgh。',
    keys: ['potential', '势能'],
  },
  {
    id: 'momentum',
    cat: 'physics/mechanics',
    name: '动量',
    expr: 'm * v',
    params: { m: req('质量 kg'), v: req('速度 m/s') },
    unit: 'kg·m/s',
    desc: 'p = mv。',
    keys: ['momentum', '动量'],
  },
  {
    id: 'impulse',
    cat: 'physics/mechanics',
    name: '冲量',
    expr: 'F * t',
    params: { F: req('力 N'), t: req('时间 s') },
    unit: 'N·s',
    desc: 'J = F·t = Δp。',
    keys: ['impulse', '冲量'],
  },
  {
    id: 'work',
    cat: 'physics/mechanics',
    name: '功',
    expr: 'F * s * cos(theta)',
    params: { F: req('力 N'), s: req('位移 m'), theta: p(0, '力与位移夹角 rad') },
    unit: 'J',
    desc: 'W = F·s·cosθ。',
    keys: ['work', '功'],
  },
  {
    id: 'power',
    cat: 'physics/mechanics',
    name: '功率',
    expr: 'W / t',
    params: { W: req('功 J'), t: req('时间 s') },
    unit: 'W',
    desc: 'P = W/t。',
    keys: ['power', '功率'],
  },
  {
    id: 'centripetal_accel',
    cat: 'physics/mechanics',
    name: '向心加速度',
    expr: 'v^2 / r',
    params: { v: req('线速度 m/s'), r: req('半径 m') },
    unit: 'm/s^2',
    desc: 'a = v²/r。',
    keys: ['centripetal', '向心'],
  },
  {
    id: 'circular_period',
    cat: 'physics/mechanics',
    name: '圆周运动周期',
    expr: '2 * pi * r / v',
    params: { r: req('半径 m'), v: req('线速度 m/s') },
    unit: 's',
    desc: 'T = 2πr/v。',
    keys: ['circular', '周期'],
  },
  {
    id: 'spring_force',
    cat: 'physics/mechanics',
    name: '弹簧力（胡克定律）',
    expr: 'k * x',
    params: { k: req('劲度系数 N/m'), x: req('形变 m') },
    unit: 'N',
    desc: 'F = kx。',
    keys: ['hooke', 'spring', '弹簧'],
  },
  {
    id: 'spring_energy',
    cat: 'physics/mechanics',
    name: '弹簧势能',
    expr: '0.5 * k * x^2',
    params: { k: req('劲度系数 N/m'), x: req('形变 m') },
    unit: 'J',
    desc: 'E = ½kx²。',
    keys: ['spring', '弹簧'],
  },
  {
    id: 'pendulum_period',
    cat: 'physics/mechanics',
    name: '单摆周期（小角）',
    expr: '2 * pi * sqrt(L / g)',
    params: { L: req('摆长 m'), g: p(CONSTANTS.g, '重力加速度 m/s^2') },
    unit: 's',
    desc: 'T = 2π√(L/g)。改 g 可推演异星钟摆。',
    keys: ['pendulum', '摆'],
  },
  {
    id: 'projectile_range',
    cat: 'physics/mechanics',
    name: '抛射射程（平地）',
    expr: 'v^2 * sin(2 * theta) / g',
    params: { v: req('初速度 m/s'), theta: req('发射角 rad'), g: p(CONSTANTS.g, '重力加速度 m/s^2') },
    unit: 'm',
    desc: 'R = v²sin2θ/g。',
    keys: ['projectile', '抛射', '射程'],
  },
  {
    id: 'projectile_height',
    cat: 'physics/mechanics',
    name: '抛射最大高度',
    expr: '(v * sin(theta))^2 / (2 * g)',
    params: { v: req('初速度 m/s'), theta: req('发射角 rad'), g: p(CONSTANTS.g, '重力加速度 m/s^2') },
    unit: 'm',
    desc: 'H = (v·sinθ)²/(2g)。',
    keys: ['projectile', '抛射'],
  },
  {
    id: 'torque',
    cat: 'physics/mechanics',
    name: '力矩',
    expr: 'r * F * sin(theta)',
    params: { r: req('力臂 m'), F: req('力 N'), theta: p(Math.PI / 2, '夹角 rad') },
    unit: 'N·m',
    desc: 'τ = rF·sinθ。',
    keys: ['torque', '力矩'],
  },
  {
    id: 'moment_inertia_rod',
    cat: 'physics/mechanics',
    name: '细杆转动惯量（过中心）',
    expr: 'm * L^2 / 12',
    params: { m: req('质量 kg'), L: req('长度 m') },
    unit: 'kg·m^2',
    desc: 'I = mL²/12。',
    keys: ['moment', 'inertia', '转动惯量'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 物理 · 引力与天体（世界观推演高频）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'gravitation',
    cat: 'physics/gravity',
    name: '万有引力',
    expr: 'G * m1 * m2 / r^2',
    params: { G: p(CONSTANTS.G, '引力常数'), m1: req('质量1 kg'), m2: req('质量2 kg'), r: req('距离 m') },
    unit: 'N',
    desc: 'F = Gm₁m₂/r²。',
    keys: ['gravity', 'gravitation', '万有引力', '重力', '引力'],
  },
  {
    id: 'surface_gravity',
    cat: 'physics/gravity',
    name: '星球表面重力',
    expr: 'G * M / R^2',
    params: { G: p(CONSTANTS.G, '引力常数'), M: req('星球质量 kg'), R: req('星球半径 m') },
    unit: 'm/s^2',
    desc: 'g = GM/R²。造星球时直接算表面重力。',
    keys: ['surface gravity', '表面重力', '星球'],
  },
  {
    id: 'orbital_velocity',
    cat: 'physics/gravity',
    name: '环绕速度',
    expr: 'sqrt(G * M / r)',
    params: { G: p(CONSTANTS.G, '引力常数'), M: req('中心天体质量 kg'), r: req('轨道半径 m') },
    unit: 'm/s',
    desc: 'v = √(GM/r)。',
    keys: ['orbital', '环绕', '卫星'],
  },
  {
    id: 'escape_velocity',
    cat: 'physics/gravity',
    name: '逃逸速度',
    expr: 'sqrt(2 * G * M / r)',
    params: { G: p(CONSTANTS.G, '引力常数'), M: req('天体质量 kg'), r: req('半径 m') },
    unit: 'm/s',
    desc: 'v = √(2GM/r)。',
    keys: ['escape', '逃逸'],
  },
  {
    id: 'orbital_period',
    cat: 'physics/gravity',
    name: '轨道周期（开普勒第三定律）',
    expr: '2 * pi * sqrt(r^3 / (G * M))',
    params: { G: p(CONSTANTS.G, '引力常数'), M: req('中心天体质量 kg'), r: req('轨道半径 m') },
    unit: 's',
    desc: 'T = 2π√(r³/GM)。',
    keys: ['kepler', '开普勒', '轨道周期'],
  },
  {
    id: 'hill_sphere',
    cat: 'physics/gravity',
    name: '希尔球半径',
    expr: 'a * (m / (3 * M))^(1/3)',
    params: { a: req('轨道半长轴 m'), m: req('小天体质量 kg'), M: req('主星质量 kg') },
    unit: 'm',
    desc: '卫星能稳定绕行的最大范围。',
    keys: ['hill', '希尔球'],
  },
  {
    id: 'roche_limit',
    cat: 'physics/gravity',
    name: '洛希极限（流体卫星）',
    expr: '2.44 * R * (rhoM / rhom)^(1/3)',
    params: { R: req('主星半径 m'), rhoM: req('主星密度 kg/m^3'), rhom: req('卫星密度 kg/m^3') },
    unit: 'm',
    desc: '小于此距离卫星会被潮汐力撕碎。',
    keys: ['roche', '洛希'],
  },
  {
    id: 'tidal_accel',
    cat: 'physics/gravity',
    name: '潮汐加速度差',
    expr: '2 * G * M * d / r^3',
    params: { G: p(CONSTANTS.G, '引力常数'), M: req('主星质量 kg'), r: req('距离 m'), d: req('天体尺度 m') },
    unit: 'm/s^2',
    desc: '≈ 2GMd/r³，衡量潮汐力强弱。',
    keys: ['tidal', '潮汐'],
  },
  {
    id: 'stellar_luminosity',
    cat: 'physics/astronomy',
    name: '恒星光度',
    expr: '4 * pi * R^2 * sigma * T^4',
    params: { R: req('恒星半径 m'), sigma: p(CONSTANTS.sigma, '斯特藩常数'), T: req('表面温度 K') },
    unit: 'W',
    desc: 'L = 4πR²σT⁴。',
    keys: ['luminosity', '光度', '恒星'],
  },
  {
    id: 'equilibrium_temp',
    cat: 'physics/astronomy',
    name: '行星平衡温度',
    expr: 'Tstar * sqrt(Rstar / (2 * d)) * (1 - albedo)^0.25',
    params: {
      Tstar: req('恒星表面温度 K'),
      Rstar: req('恒星半径 m'),
      d: req('轨道距离 m'),
      albedo: p(0.3, '反照率 0-1'),
    },
    unit: 'K',
    desc: '简化模型，用于估算宜居带温度。',
    keys: ['equilibrium', '平衡温度', '宜居'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 物理 · 缩放律（架空生物/建筑必用）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'square_cube_law',
    cat: 'physics/scaling',
    name: '平方-立方定律',
    expr: '(s^3) / (s^2)',
    params: { s: req('线性缩放倍数') },
    unit: '倍数',
    desc: '体积按 s³ 增长、截面积按 s² 增长，故单位面积承重按 s 增长。巨兽悖论的根源。',
    keys: ['square cube', '平方立方', '缩放', '巨兽'],
  },
  {
    id: 'mass_scaling',
    cat: 'physics/scaling',
    name: '质量缩放',
    expr: 'm0 * s^3',
    params: { m0: req('基准质量 kg'), s: req('线性缩放倍数') },
    unit: 'kg',
    desc: '几何相似时质量正比于长度的三次方。',
    keys: ['mass scaling', '质量缩放'],
  },
  {
    id: 'strength_scaling',
    cat: 'physics/scaling',
    name: '承重能力缩放',
    expr: 'F0 * s^2',
    params: { F0: req('基准承重 N'), s: req('线性缩放倍数') },
    unit: 'N',
    desc: '承重正比于截面积 s²。',
    keys: ['strength', '承重'],
  },
  {
    id: 'kleiber',
    cat: 'physics/scaling',
    name: '克莱伯定律（代谢率）',
    expr: 'B0 * (m / m0)^0.75',
    params: { B0: req('基准代谢率 W'), m0: req('基准质量 kg'), m: req('目标质量 kg') },
    unit: 'W',
    desc: '代谢率 ∝ 质量^¾。架空生物若无此约束，把指数当参数另算。',
    keys: ['kleiber', '代谢', '异速生长'],
  },
  {
    id: 'allometric',
    cat: 'physics/scaling',
    name: '通用异速生长律',
    expr: 'Y0 * (m / m0)^b',
    params: { Y0: req('基准量'), m0: req('基准质量 kg'), m: req('目标质量 kg'), b: req('标度指数') },
    unit: '',
    desc: 'Y = Y₀(m/m₀)^b。b 可任意改，用于架空生物设定。',
    keys: ['allometric', '异速'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 物理 · 热学
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'ideal_gas',
    cat: 'physics/thermo',
    name: '理想气体状态方程',
    expr: 'n * R * T / P',
    params: { n: req('物质的量 mol'), R: p(CONSTANTS.R, '气体常数'), T: req('温度 K'), P: p(CONSTANTS.atm, '压强 Pa') },
    unit: 'm^3',
    desc: 'V = nRT/P。',
    keys: ['ideal gas', '理想气体'],
  },
  {
    id: 'heat_capacity',
    cat: 'physics/thermo',
    name: '显热',
    expr: 'm * c * dT',
    params: { m: req('质量 kg'), c: req('比热容 J/(kg·K)'), dT: req('温差 K') },
    unit: 'J',
    desc: 'Q = mcΔT。',
    keys: ['heat', '显热', '比热'],
  },
  {
    id: 'latent_heat',
    cat: 'physics/thermo',
    name: '潜热',
    expr: 'm * L',
    params: { m: req('质量 kg'), L: req('潜热 J/kg') },
    unit: 'J',
    desc: 'Q = mL（相变不升温）。',
    keys: ['latent', '潜热'],
  },
  {
    id: 'mix_temperature',
    cat: 'physics/thermo',
    name: '混合终温',
    expr: '(m1 * c1 * T1 + m2 * c2 * T2) / (m1 * c1 + m2 * c2)',
    params: {
      m1: req('质量1 kg'), c1: req('比热1'), T1: req('初温1 K'),
      m2: req('质量2 kg'), c2: req('比热2'), T2: req('初温2 K'),
    },
    unit: 'K',
    desc: '能量守恒下的热平衡温度。',
    keys: ['mix', '混合温度'],
  },
  {
    id: 'thermal_expansion',
    cat: 'physics/thermo',
    name: '线膨胀',
    expr: 'alpha * L * dT',
    params: { alpha: req('线膨胀系数 1/K'), L: req('原长 m'), dT: req('温差 K') },
    unit: 'm',
    desc: 'ΔL = αLΔT。',
    keys: ['expansion', '膨胀'],
  },
  {
    id: 'stefan_boltzmann',
    cat: 'physics/thermo',
    name: '黑体辐射功率',
    expr: 'sigma * A * T^4',
    params: { sigma: p(CONSTANTS.sigma, '斯特藩常数'), A: req('表面积 m²'), T: req('温度 K') },
    unit: 'W',
    desc: 'P = σAT⁴。',
    keys: ['stefan', '黑体'],
  },
  {
    id: 'wien_displacement',
    cat: 'physics/thermo',
    name: '维恩位移峰值波长',
    expr: 'bWien / T',
    params: { bWien: p(CONSTANTS.bWien, '维恩常数'), T: req('温度 K') },
    unit: 'm',
    desc: 'λmax = b/T。',
    keys: ['wien', '维恩'],
  },
  {
    id: 'carnot_efficiency',
    cat: 'physics/thermo',
    name: '卡诺效率',
    expr: '1 - Tc / Th',
    params: { Tc: req('低温热源 K'), Th: req('高温热源 K') },
    unit: '',
    desc: '任何热机的理论上限。',
    keys: ['carnot', '卡诺', '效率'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 物理 · 电磁
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'ohm',
    cat: 'physics/em',
    name: '欧姆定律',
    expr: 'I * R',
    params: { I: req('电流 A'), R: req('电阻 Ω') },
    unit: 'V',
    desc: 'V = IR。',
    keys: ['ohm', '欧姆'],
  },
  {
    id: 'electric_power',
    cat: 'physics/em',
    name: '电功率',
    expr: 'V * I',
    params: { V: req('电压 V'), I: req('电流 A') },
    unit: 'W',
    desc: 'P = VI。',
    keys: ['electric power', '电功率'],
  },
  {
    id: 'joule_heating',
    cat: 'physics/em',
    name: '焦耳热',
    expr: 'I^2 * R * t',
    params: { I: req('电流 A'), R: req('电阻 Ω'), t: req('时间 s') },
    unit: 'J',
    desc: 'Q = I²Rt。',
    keys: ['joule', '焦耳'],
  },
  {
    id: 'coulomb',
    cat: 'physics/em',
    name: '库仑定律',
    expr: 'k * q1 * q2 / r^2',
    params: { k: p(CONSTANTS.kCoulomb, '库仑常数'), q1: req('电荷1 C'), q2: req('电荷2 C'), r: req('距离 m') },
    unit: 'N',
    desc: 'F = kq₁q₂/r²。',
    keys: ['coulomb', '库仑'],
  },
  {
    id: 'capacitor_energy',
    cat: 'physics/em',
    name: '电容储能',
    expr: '0.5 * C * V^2',
    params: { C: req('电容 F'), V: req('电压 V') },
    unit: 'J',
    desc: 'E = ½CV²。',
    keys: ['capacitor', '电容'],
  },
  {
    id: 'rc_time',
    cat: 'physics/em',
    name: 'RC 时间常数',
    expr: 'R * C',
    params: { R: req('电阻 Ω'), C: req('电容 F') },
    unit: 's',
    desc: 'τ = RC。',
    keys: ['rc', '时间常数'],
  },
  {
    id: 'inductor_energy',
    cat: 'physics/em',
    name: '电感储能',
    expr: '0.5 * L * I^2',
    params: { L: req('电感 H'), I: req('电流 A') },
    unit: 'J',
    desc: 'E = ½LI²。',
    keys: ['inductor', '电感'],
  },
  {
    id: 'lc_resonance',
    cat: 'physics/em',
    name: 'LC 谐振频率',
    expr: '1 / (2 * pi * sqrt(L * C))',
    params: { L: req('电感 H'), C: req('电容 F') },
    unit: 'Hz',
    desc: 'f = 1/(2π√(LC))。',
    keys: ['resonance', '谐振'],
  },
  {
    id: 'lorentz_force',
    cat: 'physics/em',
    name: '洛伦兹力（磁场分量）',
    expr: 'q * v * B * sin(theta)',
    params: { q: req('电荷 C'), v: req('速度 m/s'), B: req('磁感应强度 T'), theta: p(Math.PI / 2, '夹角 rad') },
    unit: 'N',
    desc: 'F = qvB·sinθ。',
    keys: ['lorentz', '洛伦兹'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 物理 · 波动、光学、声学
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'wave_speed',
    cat: 'physics/waves',
    name: '波速',
    expr: 'f * lambda',
    params: { f: req('频率 Hz'), lambda: req('波长 m') },
    unit: 'm/s',
    desc: 'v = fλ。',
    keys: ['wave', '波速'],
  },
  {
    id: 'snell',
    cat: 'physics/optics',
    name: '折射定律（求折射角）',
    expr: 'asin(n1 * sin(theta1) / n2)',
    params: { n1: p(1, '介质1折射率'), n2: req('介质2折射率'), theta1: req('入射角 rad') },
    unit: 'rad',
    desc: 'n₁sinθ₁ = n₂sinθ₂。',
    keys: ['snell', '折射'],
  },
  {
    id: 'thin_lens',
    cat: 'physics/optics',
    name: '薄透镜像距',
    // u = f 时像在无穷远（物理事实）。默认值避开奇点。
    expr: '1 / (1/f - 1/u)',
    params: { f: p(0.1, '焦距 m'), u: p(0.3, '物距 m（等于焦距时无有限像）') },
    unit: 'm',
    desc: '1/f = 1/u + 1/v。',
    keys: ['lens', '透镜'],
  },
  {
    id: 'magnification',
    cat: 'physics/optics',
    name: '横向放大率',
    expr: '-v / u',
    params: { v: req('像距 m'), u: req('物距 m') },
    unit: '',
    desc: 'm = -v/u。',
    keys: ['magnification', '放大率'],
  },
  {
    id: 'decibel',
    cat: 'physics/waves',
    name: '声压级（分贝）',
    expr: '10 * log(I / I0) / log(10)',
    params: { I: req('声强 W/m²'), I0: p(1e-12, '基准声强 W/m²') },
    unit: 'dB',
    desc: 'dB = 10·log₁₀(I/I₀)。',
    keys: ['decibel', '分贝'],
  },
  {
    id: 'doppler',
    cat: 'physics/waves',
    name: '多普勒频移（源移动）',
    expr: 'f0 * vs / (vs - v)',
    params: { f0: req('原频率 Hz'), vs: p(343, '声速 m/s'), v: req('源速 m/s（靠近为正）') },
    unit: 'Hz',
    desc: 'f = f₀·vs/(vs-v)。',
    keys: ['doppler', '多普勒'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 物理 · 相对论
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'lorentz_factor',
    cat: 'physics/relativity',
    name: '洛伦兹因子',
    expr: '1 / sqrt(1 - (v / c)^2)',
    params: { v: req('速度 m/s'), c: p(CONSTANTS.c, '光速 m/s（架空世界可改）') },
    unit: '',
    desc: 'γ = 1/√(1-β²)。',
    keys: ['lorentz', '洛伦兹因子'],
  },
  {
    id: 'time_dilation',
    cat: 'physics/relativity',
    name: '时间膨胀',
    expr: 'dt0 / sqrt(1 - (v / c)^2)',
    params: { dt0: req('固有时间 s'), v: req('速度 m/s'), c: p(CONSTANTS.c, '光速 m/s') },
    unit: 's',
    desc: 'Δt = γΔt₀。',
    keys: ['time dilation', '时间膨胀'],
  },
  {
    id: 'length_contraction',
    cat: 'physics/relativity',
    name: '长度收缩',
    expr: 'L0 * sqrt(1 - (v / c)^2)',
    params: { L0: req('固有长度 m'), v: req('速度 m/s'), c: p(CONSTANTS.c, '光速 m/s') },
    unit: 'm',
    desc: 'L = L₀/γ。',
    keys: ['length contraction', '长度收缩'],
  },
  {
    id: 'mass_energy',
    cat: 'physics/relativity',
    name: '质能方程',
    expr: 'm * c^2',
    params: { m: req('质量 kg'), c: p(CONSTANTS.c, '光速 m/s') },
    unit: 'J',
    desc: 'E = mc²。',
    keys: ['mass energy', '质能'],
  },
  {
    id: 'relativistic_energy',
    cat: 'physics/relativity',
    name: '相对论总能量',
    expr: 'm * c^2 / sqrt(1 - (v / c)^2)',
    params: { m: req('静止质量 kg'), v: req('速度 m/s'), c: p(CONSTANTS.c, '光速 m/s') },
    unit: 'J',
    desc: 'E = γmc²。',
    keys: ['relativistic', '相对论能量'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 物理 · 量子
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'photon_energy',
    cat: 'physics/quantum',
    name: '光子能量',
    expr: 'h * f',
    params: { h: p(CONSTANTS.h, '普朗克常数'), f: req('频率 Hz') },
    unit: 'J',
    desc: 'E = hf。',
    keys: ['photon', '光子'],
  },
  {
    id: 'de_broglie',
    cat: 'physics/quantum',
    name: '德布罗意波长',
    expr: 'h / p',
    params: { h: p(CONSTANTS.h, '普朗克常数'), p: req('动量 kg·m/s') },
    unit: 'm',
    desc: 'λ = h/p。',
    keys: ['de broglie', '德布罗意'],
  },
  {
    id: 'hydrogen_levels',
    cat: 'physics/quantum',
    name: '氢原子能级',
    expr: '-13.6 / n^2',
    params: { n: req('主量子数 n') },
    unit: 'eV',
    desc: 'Eₙ = -13.6/n² eV。',
    keys: ['hydrogen', '氢原子'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 物理 · 流体
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'pressure_depth',
    cat: 'physics/fluid',
    name: '液体压强（含大气）',
    expr: 'P0 + rho * g * h',
    params: { P0: p(CONSTANTS.atm, '表面压强 Pa'), rho: req('密度 kg/m³'), g: p(CONSTANTS.g, '重力加速度'), h: req('深度 m') },
    unit: 'Pa',
    desc: 'P = P₀ + ρgh。深海世界推演常用。',
    keys: ['pressure', '压强', '深度'],
  },
  {
    id: 'buoyancy',
    cat: 'physics/fluid',
    name: '浮力（阿基米德）',
    expr: 'rho * V * g',
    params: { rho: req('流体密度 kg/m³'), V: req('排开体积 m³'), g: p(CONSTANTS.g, '重力加速度') },
    unit: 'N',
    desc: 'F = ρVg。',
    keys: ['buoyancy', '浮力'],
  },
  {
    id: 'flow_rate',
    cat: 'physics/fluid',
    name: '体积流量',
    expr: 'A * v',
    params: { A: req('截面积 m²'), v: req('流速 m/s') },
    unit: 'm³/s',
    desc: 'Q = Av。',
    keys: ['flow', '流量'],
  },
  {
    id: 'reynolds',
    cat: 'physics/fluid',
    name: '雷诺数',
    expr: 'rho * v * D / mu',
    params: { rho: req('密度 kg/m³'), v: req('流速 m/s'), D: req('特征长度 m'), mu: req('动力粘度 Pa·s') },
    unit: '',
    desc: 'Re > 4000 通常为湍流。',
    keys: ['reynolds', '雷诺数'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 物理 · 核物理与放射性
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'decay_constant',
    cat: 'physics/nuclear',
    name: '衰变常数',
    expr: 'log(2) / T',
    params: { T: req('半衰期 s') },
    unit: '1/s',
    desc: 'λ = ln2/T。',
    keys: ['decay', '衰变'],
  },
  {
    id: 'radioactive_decay',
    cat: 'physics/nuclear',
    name: '放射性剩余量',
    expr: 'N0 * 0.5^(t / T)',
    params: { N0: req('初始量'), T: req('半衰期 s'), t: req('经过时间 s') },
    unit: '',
    desc: 'N = N₀·(½)^(t/T)。架空世界的"高辐射区"设定常用。',
    keys: ['radioactive', '放射性', '半衰期'],
  },
  {
    id: 'decay_power',
    cat: 'physics/nuclear',
    name: '指数衰减（连续形式）',
    expr: 'N0 * exp(-lambda * t)',
    params: { N0: req('初始量'), lambda: req('衰变常数 1/s'), t: req('时间 s') },
    unit: '',
    desc: 'N = N₀e^(-λt)。',
    keys: ['exponential decay', '指数衰减'],
  },
  {
    id: 'mass_defect_energy',
    cat: 'physics/nuclear',
    name: '质量亏损能量',
    expr: 'dm * c^2',
    params: { dm: req('质量亏损 kg'), c: p(CONSTANTS.c, '光速 m/s') },
    unit: 'J',
    desc: 'E = Δmc²，核反应能量来源。',
    keys: ['mass defect', '质量亏损'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 数学 · 几何
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'circle_area',
    cat: 'math/geometry',
    name: '圆面积',
    expr: 'pi * r^2',
    params: { r: req('半径') },
    unit: '',
    desc: 'S = πr²。',
    keys: ['circle', '圆'],
  },
  {
    id: 'sphere_volume',
    cat: 'math/geometry',
    name: '球体积',
    expr: '4 / 3 * pi * r^3',
    params: { r: req('半径') },
    unit: '',
    desc: 'V = 4πr³/3。',
    keys: ['sphere', '球'],
  },
  {
    id: 'sphere_area',
    cat: 'math/geometry',
    name: '球表面积',
    expr: '4 * pi * r^2',
    params: { r: req('半径') },
    unit: '',
    desc: 'S = 4πr²。',
    keys: ['sphere', '球面积'],
  },
  {
    id: 'cylinder_volume',
    cat: 'math/geometry',
    name: '圆柱体积',
    expr: 'pi * r^2 * h',
    params: { r: req('半径'), h: req('高') },
    unit: '',
    desc: 'V = πr²h。',
    keys: ['cylinder', '圆柱'],
  },
  {
    id: 'cone_volume',
    cat: 'math/geometry',
    name: '圆锥体积',
    expr: 'pi * r^2 * h / 3',
    params: { r: req('半径'), h: req('高') },
    unit: '',
    desc: 'V = πr²h/3。',
    keys: ['cone', '圆锥'],
  },
  {
    id: 'heron_area',
    cat: 'math/geometry',
    name: '海伦公式（三角形面积）',
    expr: 'sqrt(p * (p - a) * (p - b) * (p - c))',
    params: {
      a: req('边 a'),
      b: req('边 b'),
      c: req('边 c'),
      p: req('半周长 (a+b+c)/2'),
    },
    unit: '',
    desc: 'S = √(p(p-a)(p-b)(p-c))。',
    keys: ['heron', '海伦', '三角形'],
  },
  {
    id: 'pythagoras',
    cat: 'math/geometry',
    name: '勾股定理（求斜边）',
    expr: 'sqrt(a^2 + b^2)',
    params: { a: req('直角边 a'), b: req('直角边 b') },
    unit: '',
    desc: 'c = √(a²+b²)。',
    keys: ['pythagoras', '勾股'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 数学 · 数列、增长、对数尺度
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'arithmetic_sum',
    cat: 'math/series',
    name: '等差数列求和',
    expr: 'n * (a1 + an) / 2',
    params: { n: req('项数'), a1: req('首项'), an: req('末项') },
    unit: '',
    desc: 'S = n(a₁+aₙ)/2。',
    keys: ['arithmetic', '等差'],
  },
  {
    id: 'geometric_sum',
    cat: 'math/series',
    name: '等比数列求和',
    expr: 'a1 * (1 - r^n) / (1 - r)',
    params: { a1: req('首项'), r: req('公比'), n: req('项数') },
    unit: '',
    desc: 'S = a₁(1-rⁿ)/(1-r)。',
    keys: ['geometric', '等比'],
  },
  {
    id: 'exponential_growth',
    cat: 'math/growth',
    name: '指数增长',
    expr: 'N0 * exp(r * t)',
    params: { N0: req('初始量'), r: req('增长率 1/时间'), t: req('时间') },
    unit: '',
    desc: 'N = N₀e^(rt)。',
    keys: ['exponential', '指数增长'],
  },
  {
    id: 'doubling_time',
    cat: 'math/growth',
    name: '倍增时间',
    expr: 'log(2) / r',
    params: { r: req('增长率 1/时间') },
    unit: '时间',
    desc: 't = ln2/r（即 70/百分比 的精确版）。',
    keys: ['doubling', '倍增'],
  },
  {
    id: 'logistic_growth',
    cat: 'math/growth',
    name: '逻辑斯蒂增长（t 时刻）',
    expr: 'K / (1 + ((K - N0) / N0) * exp(-r * t))',
    params: { K: req('环境容量 K'), N0: req('初始量'), r: req('内禀增长率'), t: req('时间') },
    unit: '',
    desc: 'N(t) = K/(1+((K-N₀)/N₀)e^(-rt))。人口/资源上限推演核心公式。',
    keys: ['logistic', '逻辑斯蒂', '人口'],
  },
  {
    id: 'richter',
    cat: 'math/scales',
    name: '里氏震级（能量比）',
    expr: '10^(1.5 * dM)',
    params: { dM: req('震级差') },
    unit: '倍数',
    desc: '震级每增 1，能量约增 31.6 倍。',
    keys: ['richter', '震级'],
  },
  {
    id: 'ph',
    cat: 'math/scales',
    name: 'pH 值',
    expr: '-log(H) / log(10)',
    params: { H: req('氢离子浓度 mol/L') },
    unit: '',
    desc: 'pH = -log₁₀[H⁺]。',
    keys: ['ph', '酸碱'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 经济 · 金融
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'compound_interest',
    cat: 'econ/finance',
    name: '复利终值',
    expr: 'P * (1 + r / n)^(n * t)',
    params: { P: req('本金'), r: req('年利率'), n: p(1, '每年计息次数'), t: req('年数') },
    unit: '',
    desc: 'A = P(1+r/n)^(nt)。n=1 为年复利，n=12 为月复利。',
    keys: ['compound', '复利'],
  },
  {
    id: 'continuous_compounding',
    cat: 'econ/finance',
    name: '连续复利终值',
    expr: 'P * exp(r * t)',
    params: { P: req('本金'), r: req('年利率'), t: req('年数') },
    unit: '',
    desc: 'A = Pe^(rt)。',
    keys: ['continuous', '连续复利'],
  },
  {
    id: 'present_value',
    cat: 'econ/finance',
    name: '现值',
    expr: 'FV / (1 + r)^t',
    params: { FV: req('未来值'), r: req('贴现率'), t: req('年数') },
    unit: '',
    desc: 'PV = FV/(1+r)^t。',
    keys: ['present value', '现值', '贴现'],
  },
  {
    id: 'annuity_pv',
    cat: 'econ/finance',
    name: '年金现值',
    expr: 'PMT * (1 - (1 + r)^(-t)) / r',
    params: { PMT: req('每期支付'), r: req('每期利率'), t: req('期数') },
    unit: '',
    desc: 'PV = PMT·(1-(1+r)^-t)/r。',
    keys: ['annuity', '年金'],
  },
  {
    id: 'cagr',
    cat: 'econ/finance',
    name: '复合年均增长率 CAGR',
    // 注意：参数不能叫 end —— 那是 mathjs 的保留字（用于索引区间），
    // 会报 "Scope contains an illegal symbol"。改用 finalValue。
    expr: '(finalValue / startValue)^(1 / t) - 1',
    params: { startValue: req('起始值'), finalValue: req('终值'), t: req('年数') },
    unit: '',
    desc: 'CAGR = (终/始)^(1/t) - 1。',
    keys: ['cagr', '年均增长'],
  },
  {
    id: 'inflation_adjust',
    cat: 'econ/finance',
    name: '通胀换算（实际购买力）',
    expr: 'amount / (1 + rate)^t',
    params: { amount: req('名义金额'), rate: req('年通胀率'), t: req('年数') },
    unit: '',
    desc: '未来同等购买力折算到今天的金额。',
    keys: ['inflation', '通胀'],
  },
  {
    id: 'roi',
    cat: 'econ/finance',
    name: '投资回报率',
    expr: '(gain - cost) / cost',
    params: { gain: req('收益'), cost: req('成本') },
    unit: '',
    desc: 'ROI = (收益-成本)/成本。',
    keys: ['roi', '回报率'],
  },
  {
    id: 'break_even',
    cat: 'econ/micro',
    name: '盈亏平衡产量',
    expr: 'FC / (price - VC)',
    params: { FC: req('固定成本'), price: req('单价'), VC: req('单位变动成本') },
    unit: '',
    desc: 'Q = FC/(P-VC)。',
    keys: ['break even', '盈亏平衡'],
  },
  {
    id: 'price_elasticity',
    cat: 'econ/micro',
    name: '需求价格弹性（点弹性）',
    expr: '(dQ / Q) / (dP / P)',
    params: { dQ: req('需求量变化'), Q: req('原需求量'), dP: req('价格变化'), P: req('原价格') },
    unit: '',
    desc: '|E|>1 富有弹性。',
    keys: ['elasticity', '弹性'],
  },
  {
    id: 'money_multiplier',
    cat: 'econ/macro',
    name: '货币乘数',
    expr: '1 / reserve',
    params: { reserve: req('准备金率') },
    unit: '',
    desc: '基础货币扩张倍数。',
    keys: ['money multiplier', '货币乘数'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 经济 · 生产函数与增长
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'cobb_douglas',
    cat: 'econ/production',
    name: '柯布-道格拉斯生产函数',
    expr: 'A * K^alpha * L^beta',
    params: { A: p(1, '全要素生产率'), K: req('资本'), L: req('劳动'), alpha: p(0.3, '资本弹性 α'), beta: p(0.7, '劳动弹性 β') },
    unit: '',
    desc: 'Y = A·Kᵅ·Lᵝ。α+β=1 为规模报酬不变。',
    keys: ['cobb douglas', '生产函数'],
  },
  {
    id: 'solow_steady_state',
    cat: 'econ/growth',
    name: '索洛模型稳态资本',
    expr: '(s * A / (delta + n + gx))^(1 / (1 - alpha))',
    params: { s: req('储蓄率'), A: req('技术水平'), delta: req('折旧率'), n: req('人口增长率'), gx: p(0, '技术进步率'), alpha: p(0.3, '资本份额 α') },
    unit: '',
    desc: '稳态人均资本 k* = (sA/(δ+n+g))^(1/(1-α))。',
    keys: ['solow', '索洛', '稳态'],
  },
  {
    id: 'harrod_domar',
    cat: 'econ/growth',
    name: '哈罗德-多马增长率',
    expr: 's / v',
    params: { s: req('储蓄率'), v: req('资本产出比') },
    unit: '',
    desc: 'g = s/v。',
    keys: ['harrod', '哈罗德'],
  },
  {
    id: 'gdp_growth',
    cat: 'econ/macro',
    name: 'GDP 增长率',
    expr: '(gdp1 - gdp0) / gdp0',
    params: { gdp0: req('基期 GDP'), gdp1: req('报告期 GDP') },
    unit: '',
    desc: '(新-旧)/旧。',
    keys: ['gdp', '增长'],
  },
  {
    id: 'leontief_inverse',
    cat: 'econ/io',
    name: '列昂惕夫逆矩阵（完全消耗）',
    // mathjs 没有 eye()，单位矩阵要手写。m 是部门数。
    expr: 'inv([[1 - A11, -A12], [-A21, 1 - A22]])',
    params: {
      A11: p(0.2, '部门1→1 直接消耗系数'),
      A12: p(0.1, '部门1→2'),
      A21: p(0.15, '部门2→1'),
      A22: p(0.25, '部门2→2'),
    },
    unit: '',
    desc: '(I-A)⁻¹ 的两部门形式。多部门请用 operation="matrix" 直接写表达式。',
    keys: ['leontief', '列昂惕夫', '投入产出'],
  },
  {
    id: 'utility_crra',
    cat: 'econ/utility',
    name: 'CRRA 效用函数',
    expr: 'c^(1 - gamma) / (1 - gamma)',
    params: { c: req('消费'), gamma: req('相对风险厌恶系数 γ ≠ 1') },
    unit: '',
    desc: '常数相对风险厌恶效用，γ=1 时退化为 ln c。',
    keys: ['utility', '效用', '风险厌恶'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 社科 · 不平等与分布
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'gini',
    cat: 'social/inequality',
    name: '基尼系数（分组近似）',
    expr: 'G = 1 - Σ (yᵢ + yᵢ₋₁)·(1/n)',
    builtin: 'gini',
    params: { y: req('按收入升序排列的收入份额数组') },
    unit: '',
    desc: '分组数据的梯形法近似。小样本建议直接用 operation="stats" 取分位数后手工积分。',
    keys: ['gini', '基尼'],
  },
  {
    id: 'hhi',
    cat: 'social/inequality',
    name: '赫芬达尔-赫希曼指数',
    expr: 'HHI = Σ sᵢ²',
    builtin: 'hhi',
    params: { s: req('各主体份额数组（小数，如 [0.4,0.3,0.3]）') },
    unit: '',
    desc: '市场集中度。HHI>0.25 视为高度集中。',
    keys: ['hhi', '集中度', '垄断'],
  },
  {
    id: 'shannon_entropy',
    cat: 'social/information',
    name: '香农熵',
    // mathjs 的 log 不收数组、square 不收矩阵、map 的 lambda 语法不通，
    // 所以这条走 JS 侧实现（见 formula-builtins.ts）。
    expr: 'H = -Σ pᵢ·log_base(pᵢ)',
    builtin: 'shannonEntropy',
    params: { p: req('概率分布数组（各分量和为 1）'), base: p(2, '对数底，2=比特') },
    unit: 'bit',
    desc: 'H = -Σp·log_base(p)。信息量/多样性度量。',
    keys: ['entropy', '熵', '香农'],
  },
  {
    id: 'simpson_diversity',
    cat: 'social/ecology',
    name: '辛普森多样性指数',
    expr: 'D = 1 - Σ pᵢ²',
    builtin: 'simpsonDiversity',
    params: { p: req('各物种相对丰度数组') },
    unit: '',
    desc: 'D = 1 - Σp²。生态/语言多样性。',
    keys: ['simpson', '多样性'],
  },
  {
    id: 'power_law',
    cat: 'social/inequality',
    name: '幂律分布（齐夫定律）',
    expr: 'C * rank^(-alpha)',
    params: { C: req('归一化常数'), rank: req('排名'), alpha: req('幂指数 α') },
    unit: '',
    desc: 'y = C·r^(-α)。城市规模、财富、词频通用。',
    keys: ['power law', '幂律', 'zipf', '齐夫'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 社科 · 人口、疾病、网络
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'population_exponential',
    cat: 'social/demography',
    name: '马尔萨斯人口增长',
    expr: 'N0 * exp(r * t)',
    params: { N0: req('初始人口'), r: req('增长率 1/年'), t: req('年数') },
    unit: '人',
    desc: '无约束指数增长。',
    keys: ['malthus', '马尔萨斯', '人口'],
  },
  {
    id: 'population_logistic',
    cat: 'social/demography',
    name: '逻辑斯蒂人口（t 时刻）',
    expr: 'K / (1 + ((K - N0) / N0) * exp(-r * t))',
    params: { K: req('环境容量'), N0: req('初始人口'), r: req('内禀增长率'), t: req('年数') },
    unit: '人',
    desc: '有上限的人口演化。架空世界承载力设定必用。',
    keys: ['logistic', '人口上限', '环境容量'],
  },
  {
    id: 'r0_basic',
    cat: 'social/epidemiology',
    name: '基本传染数 R₀',
    expr: 'beta / gamma',
    params: { beta: req('传播率 1/时间'), gamma: req('康复率 1/时间') },
    unit: '',
    desc: 'R₀ = β/γ。R₀>1 疫情扩散。',
    keys: ['r0', '传染数', '疫情'],
  },
  {
    id: 'herd_immunity',
    cat: 'social/epidemiology',
    name: '群体免疫阈值',
    expr: '1 - 1 / R0',
    params: { R0: req('基本传染数') },
    unit: '',
    desc: '需免疫的人口比例。',
    keys: ['herd', '群体免疫'],
  },
  {
    id: 'sir_equilibrium',
    cat: 'social/epidemiology',
    name: 'SIR 最终感染比例（隐式解近似）',
    expr: '1 - exp(-R0 * x)',
    params: { R0: req('基本传染数'), x: req('最终感染比例猜测值（迭代求解用）') },
    unit: '',
    desc: 'S∞ 满足 1-S∞ = exp(-R₀(1-S∞))。传入猜测值做不动点迭代。',
    keys: ['sir', '最终规模'],
  },
  {
    id: 'gravity_trade',
    cat: 'social/economics',
    name: '引力模型（贸易/迁徙）',
    expr: 'G * M1 * M2 / D^beta',
    params: { G: p(1, '耦合常数'), M1: req('规模1（人口/GDP）'), M2: req('规模2'), D: req('距离'), beta: p(2, '距离衰减指数') },
    unit: '',
    desc: 'T = G·M₁M₂/D^β。城市间互动、贸易流。',
    keys: ['gravity model', '引力模型', '迁徙', '贸易'],
  },
  {
    id: 'lotka_volterra_equilibrium',
    cat: 'social/ecology',
    name: '洛特卡-沃尔泰拉平衡点',
    expr: 'd / beta',
    params: { d: req('捕食者死亡率'), beta: req('捕食效率') },
    unit: '',
    desc: '猎物平衡量 x* = d/β。完整轨迹需要数值积分。',
    keys: ['lotka', '沃尔泰拉', '捕食'],
  },
]

/** 主批次按 id 建立索引。 */
export const FORMULA_INDEX: Map<string, FormulaDef> = new Map(FORMULAS.map((formula) => [formula.id, formula]))
