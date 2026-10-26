/**
 * 天体目录：恒星、行星、卫星、小天体的代表性样本。
 *
 * ## 为什么需要这个，而不是让作者自己查
 *
 * 写架空世界时最费劲的一步是「先锚一个现实参照物」：我要写一颗潮汐锁定的
 * 红矮星行星，它该多大、多重、多少度？没有参照，数字全靠猜。
 *
 * 本文件收录真实观测值（尽量带来源量级），让作者能：
 *   · 直接拿某颗真实天体当基线改（「比开普勒-1649c 再热一点」）
 *   · 或看一组同类天体的分布范围，判断自己的设定落在什么分位
 *
 * ## 最关键的设计：区分「物理决定」与「只在地球标定」
 *
 * 这是本项目反复强调的分层。改物理常数（α、G、c）时，不同量必须区别对待：
 *
 * | 类别 | 例 | 改常数时会怎样 |
 * |---|---|---|
 * | `first-principles` | 质量、半径、轨道半径 | **不变**。它们由引力与初始条件决定，与 α 几乎无关 |
 * | `scaled` | 光度、有效温度、寿命 | **变**。由核反应速率与斯特藩-玻尔兹曼决定，依赖 α |
 * | `calibrated` | 行星平衡温度、反照率、温室增温 | **只在地球标定下可信**。超出适用域时本文件只给方向 |
 * | `contingent` | 大气成分、云量、磁场、板块 | **不可推导**。这是历史偶然，不是物理必然 |
 *
 * ⚠️ 最容易犯的错：把 `calibrated` 的数值当成物理定律。
 * 地球反照率 0.30 不是物理常数，是「有云、有海、有冰」的结果——
 * 换一颗行星就完全不同。所以每个 calibrated 条目都写明适用域。
 *
 * ## 收录标准
 *
 * 只收**有可靠观测或可靠理论**的样本，不收「疑似存在的系外行星」。
 * 数值给到有效位数为止，不假装精确——观测误差本来就大。
 *
 * @module dsh-math-calculator/body-catalog
 */

/** 一个量对物理常数的依赖方式（决定改常数后它该不该变）。 */
export type ConstantDependence =
  | 'first-principles'
  | 'scaled'
  | 'calibrated'
  | 'contingent'

/** 一条带来源的数值。 */
export interface MeasuredValue {
  /** 数值。 */
  value: number
  /** 单位。 */
  unit: string
  /**
   * 对物理常数的依赖方式。
   *
   * 改常数后是否重算，由它决定：
   *   first-principles / contingent → **不变**
   *   scaled                        → **会变**（由公式决定）
   *   calibrated                    → **只在地球适用域内可信**
   */
  dependence: ConstantDependence
  /** 观测/理论误差（1σ 或量级）。没有就给 undefined，别编。 */
  uncertainty?: number
  /** 适用域（calibrated 必填）。 */
  domain?: string
  /** 来源（尽量写具体：任务名 / 目录名 / 理论）。 */
  source: string
}

/** 天体类别。 */
export type BodyKind =
  | 'star'
  | 'planet-terrestrial'
  | 'planet-gas-giant'
  | 'planet-ice-giant'
  | 'planet-super-earth'
  | 'planet-mini-neptune'
  | 'moon'
  | 'dwarf-planet'
  | 'asteroid'
  | 'kuiper-object'

/** 一个天体的目录条目。 */
export interface BodyEntry {
  /** 标识。 */
  id: string
  /** 中文名。 */
  name: string
  /** 类别。 */
  kind: BodyKind
  /** 一句话：它是什么样的天体，读者会怎么感知。 */
  summary: string
  /** 宿主恒星（行星/卫星才填）。 */
  host?: string
  /** 轨道半长轴（AU）。 */
  semiMajorAxisAU?: MeasuredValue
  /** 质量（地球质量）。 */
  massEarth?: MeasuredValue
  /** 半径（地球半径）。 */
  radiusEarth?: MeasuredValue
  /** 表面重力（地球 g）。由 M/R² 算出时标 first-principles。 */
  surfaceGravityG?: MeasuredValue
  /** 平衡温度 K（不含温室）。 */
  equilibriumTempK?: MeasuredValue
  /** 实测表面/有效温度 K。 */
  surfaceTempK?: MeasuredValue
  /** 几何反照率。 */
  albedo?: MeasuredValue
  /** 自转周期（小时）。 */
  rotationHours?: MeasuredValue
  /** 轴倾角（度）。 */
  obliquityDeg?: MeasuredValue
  /** 轨道偏心率。 */
  eccentricity?: MeasuredValue
  /** 大气压（地球=1）。 */
  pressureAtm?: MeasuredValue
  /** 主要大气成分（百分比的粗描述）。 */
  atmosphere?: string
  /** 是否潮汐锁定。 */
  tidallyLocked?: boolean
  /** 作者需要注意的要点。 */
  notes: string
}

/** 恒星目录条目（比 STAR_CLASSES 更细，带真实样本）。 */
export interface NamedStar extends BodyEntry {
  kind: 'star'
  /** 光谱型。 */
  spectralType: string
  /** 亮度级：V 主序 / IV 次巨星 / III 巨星 / II 亮巨星 / I 超巨星 / D 白矮星。 */
  luminosityClass: 'V' | 'IV' | 'III' | 'II' | 'I' | 'D'
  /** 光度（太阳）。 */
  luminositySun: MeasuredValue
  /** 质量（太阳）。 */
  massSun: MeasuredValue
  /** 半径（太阳）。 */
  radiusSun: MeasuredValue
  /** 有效温度 K。 */
  effectiveTempK: MeasuredValue
}

// ════════════════════════════════════════════════════════════════════
// 恒星：补齐亮度级（原目录只有 V 主序，这是最大缺口）
// ════════════════════════════════════════════════════════════════════

/**
 * 各亮度级的代表性恒星。
 *
 * ## 为什么必须补这一层
 *
 * 原 `star-catalog.ts` 只有主序星（V）。而同样光谱字母的巨星比主序星亮
 * 20—100 倍 —— 作者写「F5-IIIa」时，用 F5V 顶替会让平衡温度差出几百开
 * （实测：0.98 AU 处 257 K vs 576 K，从冰封翻到熔融）。
 *
 * 下面这些是各亮度级里最有名的样本，可直接拿来当参照。
 */
export const NAMED_STARS: NamedStar[] = [
  {
    id: 'sun',
    name: '太阳',
    kind: 'star',
    spectralType: 'G2V',
    luminosityClass: 'V',
    summary: '我们的恒星。亮度稳定、紫外温和，是「复杂生命有时间演化」的参照基准。',
    luminositySun: { value: 1, unit: 'L☉', dependence: 'scaled', source: 'IAU 2015 标称值' },
    massSun: { value: 1, unit: 'M☉', dependence: 'first-principles', source: 'IAU 标称' },
    radiusSun: { value: 1, unit: 'R☉', dependence: 'first-principles', source: 'IAU 标称' },
    effectiveTempK: { value: 5772, unit: 'K', dependence: 'scaled', uncertainty: 0.5, source: 'IAU 2015' },
    albedo: undefined,
    notes: '所有「1 倍地球」参数的锚点。注意有效温度 5772 K 与「表面温度 5778 K」略有差别，前者是斯特藩-玻尔兹曼反解值。',
  },
  {
    id: 'proxima-centauri',
    name: '比邻星',
    kind: 'star',
    spectralType: 'M5.5V',
    luminosityClass: 'V',
    summary: '离太阳最近的恒星，深红矮星。极暗、极长寿，但耀斑狂暴。',
    luminositySun: { value: 0.0017, unit: 'L☉', dependence: 'scaled', uncertainty: 0.0002, source: 'Gaia DR2' },
    massSun: { value: 0.122, unit: 'M☉', dependence: 'first-principles', uncertainty: 0.002, source: 'Gaia DR2' },
    radiusSun: { value: 0.154, unit: 'R☉', dependence: 'first-principles', uncertainty: 0.004, source: '干涉测量' },
    effectiveTempK: { value: 3042, unit: 'K', dependence: 'scaled', uncertainty: 50, source: '光谱拟合' },
    notes: '宜居带约 0.03—0.06 AU（只有太阳系的 1/20）。行星会被潮汐锁定，且处于耀斑轰击下——「一面永昼一面永夜 + 大气被剥离」是这类世界的典型难题。',
  },
  {
    id: 'trappist-1',
    name: 'TRAPPIST-1',
    kind: 'star',
    spectralType: 'M8V',
    luminosityClass: 'V',
    summary: '一颗超冷矮星，却有 7 颗类地行星紧绕——系外行星系统的经典样本。',
    luminositySun: { value: 0.000553, unit: 'L☉', dependence: 'scaled', uncertainty: 1e-4, source: 'Gillon 2017' },
    massSun: { value: 0.089, unit: 'M☉', dependence: 'first-principles', uncertainty: 0.006, source: 'Gillon 2017' },
    radiusSun: { value: 0.121, unit: 'R☉', dependence: 'first-principles', uncertainty: 0.003, source: 'Gillon 2017' },
    effectiveTempK: { value: 2566, unit: 'K', dependence: 'scaled', uncertainty: 26, source: 'Gillon 2017' },
    notes: '7 颗行星轨道都在 0.06 AU 以内，全部可能潮汐锁定。这是「紧凑多行星系统」的极端案例。',
  },
  {
    id: 'F5-giant-example',
    name: 'F 型巨星（参考）',
    kind: 'star',
    spectralType: 'F5III',
    luminosityClass: 'III',
    summary:
      '次巨星/巨星阶段的 F 型星。注意：同样光谱字母，它比 F5V 主序星亮 20—30 倍，半径大 5—10 倍。',
    luminositySun: { value: 25, unit: 'L☉', dependence: 'scaled', uncertainty: 10, source: '光谱型典型值（个体差异大）' },
    massSun: { value: 1.5, unit: 'M☉', dependence: 'first-principles', uncertainty: 0.3, source: '演化模型' },
    radiusSun: { value: 4.5, unit: 'R☉', dependence: 'first-principles', uncertainty: 1.5, source: '光谱型典型值' },
    effectiveTempK: { value: 6500, unit: 'K', dependence: 'scaled', uncertainty: 200, source: '光谱型典型值' },
    notes:
      '这是最关键的一条：主序星目录里的 F5V（1.4 L☉）绝不能用来代表 F5III（约 25 L☉）。' +
      '在 0.98 AU 处，前者给出平衡温度 257 K（冻结），后者 576 K（铅会熔化）。',
  },
  {
    id: 'K5-giant-example',
    name: 'K 型巨星（参考）',
    kind: 'star',
    spectralType: 'K5III',
    luminosityClass: 'III',
    summary: '橙色巨星。体积巨大、表面温度低但总光度高，宜居带推到几个 AU 之外。',
    luminositySun: { value: 400, unit: 'L☉', dependence: 'scaled', uncertainty: 150, source: '光谱型典型值' },
    massSun: { value: 1.2, unit: 'M☉', dependence: 'first-principles', uncertainty: 0.2, source: '演化模型' },
    radiusSun: { value: 30, unit: 'R☉', dependence: 'first-principles', uncertainty: 10, source: '光谱型典型值' },
    effectiveTempK: { value: 4000, unit: 'K', dependence: 'scaled', uncertainty: 150, source: '光谱型典型值' },
    notes: '比 K5V 主序星亮约 500 倍。作者写「橙色太阳」时若想的是巨星，宜居带在 19—33 AU，不是 0.4—0.7 AU。',
  },
  {
    id: 'betelgeuse-like',
    name: '红超巨星（参宿四类）',
    kind: 'star',
    spectralType: 'M1-2Ia',
    luminosityClass: 'I',
    summary: '濒死的红超巨星。极亮、极不稳定、寿命只有几百万年，随时可能超新星爆发。',
    luminositySun: { value: 1e5, unit: 'L☉', dependence: 'scaled', uncertainty: 5e4, source: '干涉测量 + 模型' },
    massSun: { value: 16, unit: 'M☉', dependence: 'first-principles', uncertainty: 6, source: '演化模型' },
    radiusSun: { value: 760, unit: 'R☉', dependence: 'first-principles', uncertainty: 100, source: '干涉测量' },
    effectiveTempK: { value: 3600, unit: 'K', dependence: 'scaled', uncertainty: 200, source: '光谱拟合' },
    notes:
      '半径约 760 倍太阳半径 —— 放在太阳位置，表面会伸到火星轨道之外。' +
      '这类星不适合「稳定世界」设定，但适合「末世」「即将爆发的威胁」叙事。',
  },
  {
    id: 'sirius-b-like',
    name: '白矮星（天狼星 B 类）',
    kind: 'star',
    spectralType: 'DA2',
    luminosityClass: 'D',
    summary: '恒星残骸。地球大小却有太阳质量，表面重力是地球的十万倍。',
    luminositySun: { value: 0.056, unit: 'L☉', dependence: 'scaled', source: '天狼星 B 观测值' },
    massSun: { value: 1.02, unit: 'M☉', dependence: 'first-principles', uncertainty: 0.02, source: '天狼星 B 观测值' },
    radiusSun: { value: 0.0084, unit: 'R☉', dependence: 'first-principles', uncertainty: 0.0002, source: '天狼星 B 观测值' },
    effectiveTempK: { value: 25000, unit: 'K', dependence: 'scaled', uncertainty: 500, source: '天狼星 B 观测值' },
    notes:
      '半径只有约 5800 km（比地球还小）。这类星没有宜居带可言，但它发出的强紫外会' +
      '照亮伴星的行星——写「双星系统」时它是那种「夜里能给行星投下强光的伴星」。',
  },
]

// ════════════════════════════════════════════════════════════════════
// 行星：太阳系 + 代表性系外行星
// ════════════════════════════════════════════════════════════════════

/**
 * 行星样本。
 *
 * 太阳系 8 颗 + 代表性系外行星。数值全部带 dependence 标记：
 * 质量与半径是 first-principles（改常数不会让火星变重），
 * 平衡温度与反照率是 calibrated（只在与观测匹配的大气模型下可信）。
 */
export const NAMED_PLANETS: BodyEntry[] = [
  // ── 太阳系 ──
  {
    id: 'mercury',
    name: '水星',
    kind: 'planet-terrestrial',
    host: 'sun',
    summary: '最靠内的小行星。没有大气，昼侧可以熔化铅，夜侧接近绝对零度。',
    semiMajorAxisAU: { value: 0.387, unit: 'AU', dependence: 'first-principles', source: 'JPL 星历' },
    massEarth: { value: 0.055, unit: 'M⊕', dependence: 'first-principles', source: 'JPL 星历' },
    radiusEarth: { value: 0.383, unit: 'R⊕', dependence: 'first-principles', source: 'JPL 星历' },
    surfaceGravityG: { value: 0.378, unit: 'g', dependence: 'first-principles', source: '由 M/R² 算' },
    equilibriumTempK: { value: 440, unit: 'K', dependence: 'calibrated', domain: '无大气、黑体近似', source: '辐射平衡理论' },
    surfaceTempK: { value: 700, unit: 'K', dependence: 'calibrated', domain: '无大气岩石表面、实测昼侧', uncertainty: 100, source: '实测昼侧' },
    albedo: { value: 0.088, unit: '', dependence: 'contingent', source: '观测' },
    rotationHours: { value: 1407.6, unit: 'h', dependence: 'first-principles', source: '观测' },
    obliquityDeg: { value: 0.034, unit: '°', dependence: 'contingent', source: '观测' },
    eccentricity: { value: 0.2056, unit: '', dependence: 'contingent', source: 'JPL' },
    pressureAtm: { value: 0, unit: 'atm', dependence: 'contingent', source: '观测' },
    atmosphere: '几乎无（极稀薄外逸层）',
    notes: '无大气 → 昼夜温差可达 600 K。这类世界不可能有液态水，是最干净的「死寂岩石」样本。',
  },
  {
    id: 'venus',
    name: '金星',
    kind: 'planet-terrestrial',
    host: 'sun',
    summary: '失控温室的反面教材。地表 464°C、92 个大气压，比水星更热。',
    semiMajorAxisAU: { value: 0.723, unit: 'AU', dependence: 'first-principles', source: 'JPL' },
    massEarth: { value: 0.815, unit: 'M⊕', dependence: 'first-principles', source: 'JPL' },
    radiusEarth: { value: 0.949, unit: 'R⊕', dependence: 'first-principles', source: 'JPL' },
    surfaceGravityG: { value: 0.907, unit: 'g', dependence: 'first-principles', source: '由 M/R² 算' },
    equilibriumTempK: { value: 227, unit: 'K', dependence: 'calibrated', domain: '黑体近似', source: '辐射平衡' },
    surfaceTempK: { value: 737, unit: 'K', dependence: 'calibrated', domain: '92 atm CO₂ 大气、实测地表', uncertainty: 2, source: '探测器实测' },
    albedo: { value: 0.77, unit: '', dependence: 'contingent', source: '观测（硫酸云）' },
    rotationHours: { value: 5832, unit: 'h', dependence: 'first-principles', source: '观测' },
    obliquityDeg: { value: 177.4, unit: '°', dependence: 'contingent', source: '观测' },
    pressureAtm: { value: 92, unit: 'atm', dependence: 'contingent', source: '探测器实测' },
    atmosphere: 'CO₂ 96.5%、N₂ 3.5%',
    notes:
      '平衡温度只有 227 K（该比地球冷），实际地表 737 K —— 温室增温超过 500 K。' +
      '这是「同样的日照，温室效应能让结论彻底翻转」的极端案例。写 Boss 的荒漠世界时拿它当上限参照。',
  },
  {
    id: 'earth',
    name: '地球',
    kind: 'planet-terrestrial',
    host: 'sun',
    summary: '唯一确认有复杂生命的行星。所有「1 倍」参数的锚点。',
    semiMajorAxisAU: { value: 1, unit: 'AU', dependence: 'first-principles', source: 'IAU 2012' },
    massEarth: { value: 1, unit: 'M⊕', dependence: 'first-principles', source: 'IAU' },
    radiusEarth: { value: 1, unit: 'R⊕', dependence: 'first-principles', source: 'IAU' },
    surfaceGravityG: { value: 1, unit: 'g', dependence: 'first-principles', source: 'wgs84 名义 9.80665 m/s²' },
    equilibriumTempK: { value: 255, unit: 'K', dependence: 'calibrated', domain: '黑体近似、反照率 0.30', source: '辐射平衡' },
    surfaceTempK: { value: 288, unit: 'K', dependence: 'calibrated', domain: '有海有云的温室平衡、实测全球均值', uncertainty: 0.5, source: '实测全球均值' },
    albedo: { value: 0.306, unit: '', dependence: 'contingent', domain: '有云、有海、有冰', source: 'Bond 反照率' },
    rotationHours: { value: 23.934, unit: 'h', dependence: 'first-principles', source: '观测' },
    obliquityDeg: { value: 23.44, unit: '°', dependence: 'contingent', source: '观测' },
    pressureAtm: { value: 1, unit: 'atm', dependence: 'contingent', source: '观测' },
    atmosphere: 'N₂ 78.08%、O₂ 20.95%、Ar 0.93%、CO₂ 0.04%',
    notes:
      '反照率 0.306 不是物理常数，是「恰好有这么多云和冰」的结果 —— ' +
      '换一颗行星这个数会完全不同，所以它标 contingent 而不是 first-principles。',
  },
  {
    id: 'mars',
    name: '火星',
    kind: 'planet-terrestrial',
    host: 'sun',
    summary: '稀薄 CO₂ 大气的寒冷荒漠。有液态卤水但无地表稳定液态水。',
    semiMajorAxisAU: { value: 1.524, unit: 'AU', dependence: 'first-principles', source: 'JPL' },
    massEarth: { value: 0.107, unit: 'M⊕', dependence: 'first-principles', source: 'JPL' },
    radiusEarth: { value: 0.532, unit: 'R⊕', dependence: 'first-principles', source: 'JPL' },
    surfaceGravityG: { value: 0.379, unit: 'g', dependence: 'first-principles', source: '由 M/R² 算' },
    equilibriumTempK: { value: 210, unit: 'K', dependence: 'calibrated', domain: '黑体近似、反照率 0.25', source: '辐射平衡' },
    surfaceTempK: { value: 210, unit: 'K', dependence: 'calibrated', domain: '稀薄 CO₂ 大气、实测全球均值', uncertainty: 10, source: '实测均值' },
    albedo: { value: 0.25, unit: '', dependence: 'contingent', source: '观测' },
    rotationHours: { value: 24.62, unit: 'h', dependence: 'first-principles', source: '观测' },
    obliquityDeg: { value: 25.19, unit: '°', dependence: 'contingent', source: '观测' },
    pressureAtm: { value: 0.006, unit: 'atm', dependence: 'contingent', source: '探测器实测' },
    atmosphere: 'CO₂ 95%、N₂ 3%、Ar 1.6%',
    notes:
      '均温 210 K 低于水冰点，但仍有液态卤水 —— 所以「温度极端」不等于「不可能有化学」。' +
      '这正是死寂判定里「冻结算 marginal、不算 dead」的由来。',
  },
  {
    id: 'jupiter',
    name: '木星',
    kind: 'planet-gas-giant',
    host: 'sun',
    summary: '最大的行星。气态巨行星，没有固体表面，重力 2.5 g。',
    semiMajorAxisAU: { value: 5.204, unit: 'AU', dependence: 'first-principles', source: 'JPL' },
    massEarth: { value: 317.8, unit: 'M⊕', dependence: 'first-principles', source: 'JPL' },
    radiusEarth: { value: 11.21, unit: 'R⊕', dependence: 'first-principles', source: 'JPL' },
    surfaceGravityG: { value: 2.528, unit: 'g', dependence: 'first-principles', source: '由 M/R² 算（参考面）' },
    rotationHours: { value: 9.925, unit: 'h', dependence: 'first-principles', source: '观测' },
    obliquityDeg: { value: 3.13, unit: '°', dependence: 'contingent', source: '观测' },
    pressureAtm: { value: 1, unit: 'atm', dependence: 'contingent', domain: '取 1 atm 等压面', source: '约定' },
    atmosphere: 'H₂ 90%、He 10%',
    notes:
      '气态巨行星没有「表面」——1 bar 等压面只是约定。写「木星上有陆地」需要先解决浮力问题。' +
      '它的 67 颗卫星里有 4 颗类地大小的（木卫二、三、四、一），是「卫星上可能有生命」的主要候选。',
  },
  {
    id: 'saturn',
    name: '土星',
    kind: 'planet-gas-giant',
    host: 'sun',
    summary: '第二大行星，最壮观的行星环。密度比水还低。',
    semiMajorAxisAU: { value: 9.583, unit: 'AU', dependence: 'first-principles', source: 'JPL' },
    massEarth: { value: 95.2, unit: 'M⊕', dependence: 'first-principles', source: 'JPL' },
    radiusEarth: { value: 9.45, unit: 'R⊕', dependence: 'first-principles', source: 'JPL' },
    surfaceGravityG: { value: 1.065, unit: 'g', dependence: 'first-principles', source: '由 M/R² 算（参考面）' },
    rotationHours: { value: 10.66, unit: 'h', dependence: 'first-principles', source: '观测' },
    obliquityDeg: { value: 26.73, unit: '°', dependence: 'contingent', source: '观测' },
    pressureAtm: { value: 1, unit: 'atm', dependence: 'contingent', domain: '取 1 atm 等压面', source: '约定' },
    atmosphere: 'H₂ 96%、He 3%',
    notes:
      '平均密度只有 687 kg/m³，比水还低 —— 理论上「有足够大的水池它能浮起来」。' +
      '写架空世界时这是「低密度巨型行星」的现实参照。',
  },
  {
    id: 'uranus',
    name: '天王星',
    kind: 'planet-ice-giant',
    host: 'sun',
    summary: '「躺着自转」的冰巨星。轴倾角 98°，两极轮流经历 42 年白昼。',
    semiMajorAxisAU: { value: 19.19, unit: 'AU', dependence: 'first-principles', source: 'JPL' },
    massEarth: { value: 14.5, unit: 'M⊕', dependence: 'first-principles', source: 'JPL' },
    radiusEarth: { value: 4.01, unit: 'R⊕', dependence: 'first-principles', source: 'JPL' },
    surfaceGravityG: { value: 0.886, unit: 'g', dependence: 'first-principles', source: '由 M/R² 算' },
    rotationHours: { value: 17.24, unit: 'h', dependence: 'first-principles', source: '观测' },
    obliquityDeg: { value: 97.77, unit: '°', dependence: 'contingent', source: '观测' },
    pressureAtm: { value: 1, unit: 'atm', dependence: 'contingent', domain: '取 1 atm 等压面', source: '约定' },
    atmosphere: 'H₂ 83%、He 15%、CH₄ 2%',
    notes:
      '轴倾角 98° 意味着它几乎「躺着」公转 —— 每个极区会连续 42 年被照、再 42 年不见太阳。' +
      '这是「极端季节」的现成样本，比双星或偏心轨道更省事就能写出怪季节。',
  },
  {
    id: 'neptune',
    name: '海王星',
    kind: 'planet-ice-giant',
    host: 'sun',
    summary: '最远的行星。风速可达 2100 km/h，是太阳系里最狂暴的天气。',
    semiMajorAxisAU: { value: 30.07, unit: 'AU', dependence: 'first-principles', source: 'JPL' },
    massEarth: { value: 17.1, unit: 'M⊕', dependence: 'first-principles', source: 'JPL' },
    radiusEarth: { value: 3.88, unit: 'R⊕', dependence: 'first-principles', source: 'JPL' },
    surfaceGravityG: { value: 1.137, unit: 'g', dependence: 'first-principles', source: '由 M/R² 算' },
    rotationHours: { value: 16.11, unit: 'h', dependence: 'first-principles', source: '观测' },
    obliquityDeg: { value: 28.32, unit: '°', dependence: 'contingent', source: '观测' },
    pressureAtm: { value: 1, unit: 'atm', dependence: 'contingent', domain: '取 1 atm 等压面', source: '约定' },
    atmosphere: 'H₂ 80%、He 19%、CH₄ 1.5%',
    notes:
      '离太阳 30 AU，接收的辐照只有地球的 1/900，但它的大气活动比木星还剧烈 —— ' +
      '「离恒星远 = 平静」是错的，内部热源让它可以很狂暴。',
  },
  {
    id: 'europa',
    name: '木卫二（欧罗巴）',
    kind: 'moon',
    host: 'jupiter',
    summary: '冰壳之下有全球性液态海洋。可能是太阳系除地球外最有希望有生命的地方。',
    semiMajorAxisAU: { value: 0.004485, unit: 'AU', dependence: 'first-principles', source: 'JPL（木星距 671000 km）' },
    massEarth: { value: 0.008, unit: 'M⊕', dependence: 'first-principles', source: 'JPL' },
    radiusEarth: { value: 0.245, unit: 'R⊕', dependence: 'first-principles', source: 'JPL' },
    surfaceGravityG: { value: 0.134, unit: 'g', dependence: 'first-principles', source: '由 M/R² 算' },
    surfaceTempK: { value: 103, unit: 'K', dependence: 'calibrated', domain: '冰壳表面、潮汐加热未计入', uncertainty: 10, source: '实测赤道温度' },
    albedo: { value: 0.67, unit: '', dependence: 'contingent', source: '观测' },
    pressureAtm: { value: 0, unit: 'atm', dependence: 'contingent', source: '几乎无' },
    atmosphere: '极稀薄 O₂（辐射分解产生）',
    tidallyLocked: true,
    notes:
      '表面 103 K 是冰，但潮汐加热让冰下有液态海洋 —— 这说明「只看表面温度判宜居」会漏掉整个类别。' +
      '潮汐锁定（永朝木星）在这类卫星上是常态。',
  },
  {
    id: 'titan',
    name: '土卫六（泰坦）',
    kind: 'moon',
    host: 'saturn',
    summary: '有厚氮大气和液态甲烷湖。唯一有稠密大气的卫星。',
    semiMajorAxisAU: { value: 0.008168, unit: 'AU', dependence: 'first-principles', source: 'JPL（土星距 1221870 km）' },
    massEarth: { value: 0.0225, unit: 'M⊕', dependence: 'first-principles', source: 'JPL' },
    radiusEarth: { value: 0.404, unit: 'R⊕', dependence: 'first-principles', source: 'JPL' },
    surfaceGravityG: { value: 0.138, unit: 'g', dependence: 'first-principles', source: '由 M/R² 算' },
    surfaceTempK: { value: 94, unit: 'K', dependence: 'calibrated', domain: '稠密 N₂ 大气、惠更斯号单点实测', uncertainty: 2, source: '惠更斯号实测' },
    pressureAtm: { value: 1.45, unit: 'atm', dependence: 'contingent', source: '惠更斯号实测' },
    atmosphere: 'N₂ 95%、CH₄ 5%',
    tidallyLocked: true,
    notes:
      '气压比地球还高，但温度只有 94 K —— 有厚大气不代表能住人。' +
      '液态甲烷湖说明「溶剂」不必是水，这是架空世界里「非水生命」的现实依据。',
  },
  {
    id: 'enceladus',
    name: '土卫二（恩克拉多斯）',
    kind: 'moon',
    host: 'saturn',
    summary: '南极有冰喷泉的微小卫星。喷出的水汽说明冰下有海洋。',
    semiMajorAxisAU: { value: 0.00159, unit: 'AU', dependence: 'first-principles', source: 'JPL（土星距 238000 km）' },
    massEarth: { value: 0.000018, unit: 'M⊕', dependence: 'first-principles', source: 'JPL' },
    radiusEarth: { value: 0.0394, unit: 'R⊕', dependence: 'first-principles', source: 'JPL（252 km）' },
    surfaceGravityG: { value: 0.0113, unit: 'g', dependence: 'first-principles', source: '由 M/R² 算' },
    surfaceTempK: { value: 75, unit: 'K', dependence: 'calibrated', domain: '冰面、南极喷泉区', uncertainty: 5, source: '观测' },
    albedo: { value: 0.81, unit: '', dependence: 'contingent', source: '观测（极高反照率）' },
    tidallyLocked: true,
    notes: '半径只有 252 km，重力 0.011 g —— 在上面跳一下能跳过一座山。',
  },

  // ── 代表性系外行星 ──
  {
    id: 'kepler-1649c',
    name: '开普勒-1649c',
    kind: 'planet-terrestrial',
    host: 'kepler-1649',
    summary: '目前已知最接近地球大小的宜居带系外行星之一（半径 1.06 R⊕）。',
    semiMajorAxisAU: { value: 0.0649, unit: 'AU', dependence: 'first-principles', source: 'NASA 确认 2020' },
    radiusEarth: { value: 1.06, unit: 'R⊕', dependence: 'first-principles', uncertainty: 0.1, source: '凌星法' },
    massEarth: undefined,
    equilibriumTempK: { value: 234, unit: 'K', dependence: 'calibrated', uncertainty: 20, domain: '假定地球型反照率', source: '推算' },
    notes:
      '质量未知（凌星法只给半径）。这提醒一件事：系外行星的很多参数是**推算**不是**实测**，' +
      '写设定时别把推算值当成确定事实。',
  },
  {
    id: 'gj-1132b',
    name: 'GJ 1132b',
    kind: 'planet-terrestrial',
    host: 'gj-1132',
    summary: '一颗受强辐照的类地行星，可能拥有二次大气。',
    semiMajorAxisAU: { value: 0.0153, unit: 'AU', dependence: 'first-principles', source: '观测' },
    massEarth: { value: 1.6, unit: 'M⊕', dependence: 'first-principles', uncertainty: 0.5, source: '径向速度' },
    radiusEarth: { value: 1.16, unit: 'R⊕', dependence: 'first-principles', uncertainty: 0.1, source: '凌星法' },
    equilibriumTempK: { value: 580, unit: 'K', dependence: 'calibrated', domain: '假定地球型反照率、无大气修正', uncertainty: 50, source: '推算' },
    notes: '平衡温度 580 K —— 即使有大气也远超水的沸点，是「热岩石行星」。',
  },
  {
    id: '55-cancri-e',
    name: '55 Cancri e',
    kind: 'planet-super-earth',
    host: '55-cancri',
    summary: '超级地球，极靠内。昼侧可能熔岩遍野。',
    semiMajorAxisAU: { value: 0.0154, unit: 'AU', dependence: 'first-principles', source: '观测' },
    massEarth: { value: 8, unit: 'M⊕', dependence: 'first-principles', uncertainty: 1, source: '径向速度' },
    radiusEarth: { value: 1.9, unit: 'R⊕', dependence: 'first-principles', uncertainty: 0.1, source: '凌星法' },
    surfaceGravityG: { value: 2.2, unit: 'g', dependence: 'first-principles', source: '由 M/R² 算' },
    equilibriumTempK: { value: 1600, unit: 'K', dependence: 'calibrated', domain: '假定低反照率熔岩表面', uncertainty: 200, source: '推算' },
    notes: '8 倍质量、1.9 倍半径 → 重力 2.2 g。这是「超级地球」的典型：重力偏大，生物形态会完全不同。',
  },
  {
    id: 'gj-1214b',
    name: 'GJ 1214b',
    kind: 'planet-mini-neptune',
    host: 'gj-1214',
    summary: '典型的海王星型小行星：有厚氢氦包层，密度低。',
    semiMajorAxisAU: { value: 0.0149, unit: 'AU', dependence: 'first-principles', source: '观测' },
    massEarth: { value: 6.55, unit: 'M⊕', dependence: 'first-principles', uncertainty: 1, source: '径向速度' },
    radiusEarth: { value: 2.68, unit: 'R⊕', dependence: 'first-principles', uncertainty: 0.2, source: '凌星法' },
    surfaceGravityG: { value: 0.91, unit: 'g', dependence: 'first-principles', source: '由 M/R² 算' },
    notes:
      '注意：质量 6.55 M⊕ 但重力只有 0.91 g（比地球还小）—— 因为它又大又「蓬松」。' +
      '这打破了「质量大 = 重力大」的直觉，写设定时容易搞错。',
  },
  {
    id: 'hd-189733b',
    name: 'HD 189733b',
    kind: 'planet-gas-giant',
    host: 'hd-189733',
    summary: '热木星。离恒星极近，被强烈加热，大气在逃逸。',
    semiMajorAxisAU: { value: 0.0314, unit: 'AU', dependence: 'first-principles', source: '观测' },
    massEarth: { value: 360, unit: 'M⊕', dependence: 'first-principles', uncertainty: 20, source: '径向速度' },
    radiusEarth: { value: 13.2, unit: 'R⊕', dependence: 'first-principles', uncertainty: 0.5, source: '凌星法' },
    equilibriumTempK: { value: 1200, unit: 'K', dependence: 'calibrated', domain: '均匀再辐射、零反照率假定', uncertainty: 100, source: '推算' },
    notes: '热木星是「行星可以被恒星烤到膨胀」的证明 —— 半径比木星还大，因为它被加热膨胀了。',
  },
]

// ════════════════════════════════════════════════════════════════════
// 小天体：矮行星、小行星、柯伊伯带天体
// ════════════════════════════════════════════════════════════════════

/** 矮行星与小天体样本。 */
export const NAMED_SMALL_BODIES: BodyEntry[] = [
  {
    id: 'ceres',
    name: '谷神星',
    kind: 'dwarf-planet',
    host: 'sun',
    summary: '小行星带里最大的天体。可能有地下冰与盐层。',
    semiMajorAxisAU: { value: 2.77, unit: 'AU', dependence: 'first-principles', source: 'JPL' },
    massEarth: { value: 0.00016, unit: 'M⊕', dependence: 'first-principles', source: '观测' },
    radiusEarth: { value: 0.0738, unit: 'R⊕', dependence: 'first-principles', source: '观测（470 km）' },
    surfaceGravityG: { value: 0.029, unit: 'g', dependence: 'first-principles', source: '由 M/R² 算' },
    notes: '重力 0.029 g —— 在上面扔一块石头能绕它飞很远。',
  },
  {
    id: 'pluto',
    name: '冥王星',
    kind: 'dwarf-planet',
    host: 'sun',
    summary: '柯伊伯带矮行星。有稀薄氮大气和氮冰平原。',
    semiMajorAxisAU: { value: 39.48, unit: 'AU', dependence: 'first-principles', source: 'JPL' },
    massEarth: { value: 0.00218, unit: 'M⊕', dependence: 'first-principles', source: 'JPL' },
    radiusEarth: { value: 0.1868, unit: 'R⊕', dependence: 'first-principles', source: '新视野号（1188 km）' },
    surfaceGravityG: { value: 0.063, unit: 'g', dependence: 'first-principles', source: '由 M/R² 算' },
    surfaceTempK: { value: 44, unit: 'K', dependence: 'calibrated', domain: '稀薄 N₂ 大气、新视野号单点实测', uncertainty: 3, source: '新视野号' },
    pressureAtm: { value: 0.00001, unit: 'atm', dependence: 'contingent', source: '观测' },
    atmosphere: 'N₂ 稀薄',
    tidallyLocked: true,
    notes: '和卫星卡戎潮汐锁定成双星系统 —— 这是「行星与卫星互为对方的卫星」的真实例子。',
  },
  {
    id: 'tunguska-class',
    name: '通古斯级撞击体',
    kind: 'asteroid',
    summary: '直径约 60—80 m 的小行星。空中爆炸可摧毁数百平方公里森林。',
    radiusEarth: { value: 0.0000055, unit: 'R⊕', dependence: 'first-principles', uncertainty: 0.000001, source: '通古斯事件反推' },
    notes:
      '写「天降火球」时的量级参照。直径 60 m 的石头释放约 10—15 兆吨 TNT，' +
      '但不会造成全球灾变 —— 那是 1 km 以上的级别。',
  },
]

/** 全部带名字的天体（恒星 + 行星 + 小天体）。 */
export const ALL_NAMED_BODIES: Array<NamedStar | BodyEntry> = [
  ...NAMED_STARS,
  ...NAMED_PLANETS,
  ...NAMED_SMALL_BODIES,
]

/** 按 id 索引。 */
export const BODY_INDEX: Map<string, NamedStar | BodyEntry> = new Map(
  ALL_NAMED_BODIES.map((body) => [body.id, body]),
)

/** 按类别分组（给检索用）。 */
export function bodiesByKind(kind: BodyKind): Array<NamedStar | BodyEntry> {
  return ALL_NAMED_BODIES.filter((body) => body.kind === kind)
}

/**
 * 判断某个量在改物理常数后是否该重算。
 *
 * 为什么单独做成函数：作者（和 AI）最容易犯的错就是
 * 「改了 α 之后把行星质量也跟着改」——质量由引力与初始条件决定，
 * 与精细结构常数几乎无关，改了就是篡改设定。
 *
 * @param dependence - 该量的依赖类别
 * @returns 改常数后是否应重算
 */
export function shouldRescaleOnConstantChange(dependence: ConstantDependence): boolean {
  return dependence === 'scaled'
}
