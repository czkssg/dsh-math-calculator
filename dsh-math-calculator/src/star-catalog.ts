/**
 * 恒星光谱型基准表。
 *
 * 需求来源：架空世界推演必须先定「这是什么恒星」，
 * 因为恒星类型决定了光度、寿命、光谱、宜居带，而这些又是下游
 * 「轨道距离 → 辐照度 → 温度 → 气候」链条的起点。
 * 不给基准值的话，用户就得自己查太阳质量、半径、表面温度，很容易算错量级。
 *
 * 数据取自主序星（V 类）标准观测值。非主序星（巨星/白矮星）需用户自行指定参数。
 *
 * @module dsh-math-calculator/star-catalog
 */

/** 一个光谱型的基准值。 */
export interface StarClass {
  /** 光谱型标识，如 'G2V'。 */
  id: string
  /** 中文类别名。 */
  name: string
  /** 表面有效温度 K。 */
  tempK: number
  /** 半径，太阳半径为单位。 */
  radiusSun: number
  /** 质量，太阳质量为单位。 */
  massSun: number
  /** 光度（按斯特藩-玻尔兹曼由 T 与 R 算出），太阳光度为单位。 */
  luminositySun: number
  /** 目视颜色。 */
  color: string
  /** 峰值波长 nm。 */
  peakWavelengthNm: number
  /** 主序寿命 Gyr。 */
  lifespanGyr: number
  /** 保守宜居带内边界 AU（Kasting/Kopparapu 标定，L^0.5 缩放）。 */
  habitableInnerAU: number
  /** 保守宜居带外边界 AU。 */
  habitableOuterAU: number
  /** 紫外线强度相对太阳的倍数（粗略，用于判断生物是否需要屏蔽）。 */
  uvFactor: number
  /** 读者/创作者需要知道的关键特点。 */
  notes: string
}

/** 斯特藩-玻尔兹曼常数。 */
const SIGMA = 5.670374419e-8
/** 太阳半径 m。 */
const RSUN = 6.957e8
/** 太阳光度 W。 */
const LSUN = 3.828e26
/** 维恩位移常数 m·K。 */
const WIEN = 2.897771955e-3

/**
 * 由温度与半径算光度（相对太阳）。
 * L = 4πR²σT⁴
 */
function luminosityOf(tempK: number, radiusSun: number): number {
  const radiusM = radiusSun * RSUN
  return (4 * Math.PI * radiusM ** 2 * SIGMA * tempK ** 4) / LSUN
}

/**
 * 宜居带边界。
 * 用 Kopparapu 2013 的保守估计按 L^0.5 缩放：
 *   内边界（潮湿温室极限）= 0.95 AU × √L
 *   外边界（最大温室极限）  = 1.67 AU × √L
 * 这是「地表能有液态水」的粗略范围，不含潮汐锁定、大气成分等复杂因素。
 */
function habitableZone(luminositySun: number): [number, number] {
  const root = Math.sqrt(luminositySun)
  return [0.95 * root, 1.67 * root]
}

/** 主序寿命：τ ≈ 10 Gyr × (M/M☉)^-2.5。 */
function lifespanOf(massSun: number): number {
  if (massSun <= 0) return 0
  return 10 * massSun ** -2.5
}

/**
 * 紫外线因子。
 *
 * 物理依据：黑体辐射的紫外尾随温度急剧增长。太阳（5778K）的 UV 约占总量 8%，
 * 更热的星紫外占比高得多。用 (T/5778)^4 作粗略标度 —— 这只是量级判断，
 * 精确值需要积分普朗克谱，对文学创作没必要。
 */
function uvFactorOf(tempK: number): number {
  return Math.max(1e-4, (tempK / 5778) ** 4)
}

/** 构造一条基准记录。 */
function makeClass(
  id: string,
  name: string,
  tempK: number,
  radiusSun: number,
  massSun: number,
  color: string,
  notes: string,
): StarClass {
  const luminositySun = luminosityOf(tempK, radiusSun)
  const [inner, outer] = habitableZone(luminositySun)
  return {
    id,
    name,
    tempK,
    radiusSun,
    massSun,
    luminositySun,
    color,
    peakWavelengthNm: (WIEN / tempK) * 1e9,
    lifespanGyr: lifespanOf(massSun),
    habitableInnerAU: inner,
    habitableOuterAU: outer,
    uvFactor: uvFactorOf(tempK),
    notes,
  }
}

/**
 * 光谱型基准表（主序星）。
 *
 * 覆盖 O 到 M 型，足够覆盖绝大多数架空设定需要。
 * 数值保留有效数字，不必精确到最后一位 —— 恒星个体差异本来就有一倍以上。
 */
export const STAR_CLASSES: StarClass[] = [
  makeClass(
    'O5V',
    'O 型蓝色巨星',
    40000,
    12.0,
    40,
    '蓝',
    '极端明亮，紫外主导。寿命仅数百万年，来不及演化出复杂生命，且光度太强会吹散行星大气。设定里出现它通常意味着「年轻、狂暴、不宜居」。',
  ),
  makeClass(
    'B5V',
    'B 型蓝白星',
    15200,
    3.9,
    5.9,
    '蓝白',
    '明亮、紫外强。寿命约 1 亿年，勉强够简单生命。宜居带较远（约 17 AU），行星公转周期长，季节变化慢。',
  ),
  makeClass(
    'A5V',
    'A 型白星',
    8200,
    1.8,
    2.1,
    '白',
    '偏白偏亮，紫外约为太阳的 4 倍。寿命约 1.6 亿年。宜居带约 4.5 AU。',
  ),
  makeClass(
    'F5V',
    'F 型黄白星',
    6500,
    1.3,
    1.4,
    '黄白',
    '类太阳但更亮更热，紫外略强。寿命约 4.4 亿年。宜居带约 1.9 AU。是「比地球更亮更热的世界」的好选择。',
  ),
  makeClass(
    'G2V',
    'G 型黄星（太阳）',
    5778,
    1.0,
    1.0,
    '黄',
    '太阳本身。寿命约 100 亿年，光度稳定，紫外温和 —— 这些条件叠加才让复杂生命有时间演化。宜居带 0.95~1.67 AU。',
  ),
  makeClass(
    'G8V',
    'G 型偏晚黄星',
    5300,
    0.9,
    0.9,
    '黄',
    '比太阳稍暗稍冷，宜居带略近（约 0.7~1.3 AU）。寿命更长（约 130 亿年），是「更稳妥的太阳」选择。',
  ),
  makeClass(
    'K5V',
    'K 型橙矮星',
    4400,
    0.72,
    0.69,
    '橙',
    '长寿（约 250 亿年）、光度稳定、紫外很弱、耀斑比 M 型温和得多。天文学上被认为是比太阳更理想的孕育生命候选。宜居带约 0.38~0.67 AU。',
  ),
  makeClass(
    'M0V',
    'M 型红矮星',
    3800,
    0.6,
    0.57,
    '橙红',
    '极长寿（约 1000 亿年）、极暗。宜居带极近（0.25~0.44 AU），行星极易被潮汐锁定 —— 一面永昼一面永夜，这是红矮星世界最关键的设定特征。耀斑活动强烈。',
  ),
  makeClass(
    'M5V',
    'M 型深红矮星',
    3100,
    0.2,
    0.15,
    '深红',
    '最暗淡的主序星。峰值辐射在红外，可见光很少 —— 这种世界的「白天」看起来像地球的黄昏。光合作用需要能吸收红光的色素，植物可能是黑色或紫色。',
  ),
]

/** 按 id 索引。 */
export const STAR_INDEX: Map<string, StarClass> = new Map(STAR_CLASSES.map((s) => [s.id, s]))

/**
 * 按温度反查最接近的光谱型。
 * 用户只给温度时，用来补全半径/质量/光度等其余参数。
 */
export function closestStarClass(tempK: number): StarClass {
  let best = STAR_CLASSES[0]
  let bestDelta = Infinity
  for (const star of STAR_CLASSES) {
    const delta = Math.abs(Math.log(star.tempK / tempK))
    if (delta < bestDelta) {
      bestDelta = delta
      best = star
    }
  }
  return best
}

/** 光谱型的通俗描述（给读者看）。 */
export function describeStarClass(star: StarClass): string {
  const parts: string[] = []
  parts.push(`${star.name}（${star.id}）`)
  parts.push(`表面 ${star.tempK}K，颜色${star.color}`)
  parts.push(`光度是太阳的 ${star.luminositySun.toFixed(star.luminositySun >= 1 ? 1 : 3)} 倍`)
  parts.push(`寿命约 ${star.lifespanGyr.toFixed(0)} 亿年`)
  parts.push(
    `宜居带 ${star.habitableInnerAU.toFixed(2)}~${star.habitableOuterAU.toFixed(2)} AU`,
  )
  return parts.join('，')
}
