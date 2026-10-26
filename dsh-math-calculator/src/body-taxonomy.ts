/**
 * 天体类型学：从已观测到纯理论预言，按「科幻创作会遇到什么」来分类。
 *
 * ## 为什么不能只收太阳系
 *
 * 太阳系只有 8 颗行星、1 颗恒星，而科幻创作要的是「一整个宇宙的可能性空间」：
 * 流浪行星、热木星、超级地球、中子星、黑洞、白矮星、褐矮星、戴森球……
 * 这些在太阳系里一个都没有，但作者天天要用。
 *
 * ## 三类条目，可信度天差地别
 *
 * | 类别 | 例 | 依据 | 本文件怎么处理 |
 * |---|---|---|---|
 * | **已观测** | 热木星、超级地球、潮汐锁定行星 | 凌星/径向速度/直接成像 | 给观测值或严格推算 |
 * | **理论预言** | 中子星、黑洞、白矮星、褐星 | 广义相对论/恒星演化模型 | 给理论值 + 标注「未直接观测」 |
 * | **纯思辨** | 戴森球、伯纳德星、质量 1e15 kg 的「行星」 | 没有观测也没有严格理论 | 给量纲约束 + 明确标「思辨」 |
 *
 * ⚠️ 最容易误导作者的做法：把三类混在一起给数字，不标注来源。
 * 于是「中子星表面重力 1e11 g」和「戴森球厚 1 公里」看起来一样权威——
 * 前者是物理必然，后者只是某人拍脑袋。所以每条都必须带 `evidence`。
 *
 * ## 「预言的一个一个加」怎么理解
 *
 * 这里的「预言」指**理论预言**（theoretical prediction），不是占星术。
 * 每类都写清：哪些参数由物理锁死（改不了）、哪些由形成历史决定（可以编）。
 *
 * @module dsh-math-calculator/body-taxonomy
 */

/** 天体类型的证据等级。 */
export type EvidenceLevel =
  | 'observed'
  | 'theoretical'
  | 'speculative'

/** 一个天体类型。 */
export interface BodyType {
  /** 标识。 */
  id: string
  /** 中文名。 */
  name: string
  /** 英文名（便于检索与查文献）。 */
  nameEn: string
  /** 归类：恒星残骸 / 行星 / 小天体 / 人工结构 / 纯思辨。 */
  family: 'stellar-remnant' | 'star' | 'planet' | 'small-body' | 'exotic' | 'artificial'
  /** 证据等级。 */
  evidence: EvidenceLevel
  /** 依据（观测证据或理论出处）。 */
  basis: string
  /** 一句话：读者会怎么感知到它。 */
  perception: string
  /** 典型质量（kg）。 */
  massKg?: number
  /** 典型半径（km）。 */
  radiusKm?: number
  /** 典型表面重力（以地球 g 为单位）。 */
  gravityG?: number
  /** 典型表面/有效温度 K。 */
  tempK?: number
  /** 典型密度 kg/m³。 */
  densityKgM3?: number
  /**
   * 物理锁死的性质：改不了的部分。
   *
   * 例：中子星的半径与质量被状态方程锁死（1.4 M☉ 对应约 11—12 km），
   * 作者可以编它的磁场、转速、伴星，但编不了「半径 1000 km 的中子星」。
   */
  lockedBy?: string
  /** 作者可以自由发挥的部分（编这些不会与物理冲突）。 */
  freeToAuthor?: string
  /** 写这类天体时最容易踩的坑。 */
  pitfall?: string
  /** 科幻创作中的典型用法。 */
  narrativeUse?: string
  /** 对物理常数的依赖（改 α 之类会不会变）。 */
  constantDependence?: 'first-principles' | 'scaled' | 'calibrated' | 'contingent'
}

/**
 * 天体类型总表。
 *
 * 按「创作时先想到什么」排序：恒星残骸最震撼，人工结构最极端，纯思辨放最后。
 */
export const BODY_TYPES: BodyType[] = [
  // ══════════════════════════════════════════════════════════════
  // 一、恒星残骸（科幻里最常用、物理最锁死的一批）
  // ══════════════════════════════════════════════════════════════
  {
    id: 'white-dwarf',
    name: '白矮星',
    nameEn: 'White dwarf',
    family: 'stellar-remnant',
    evidence: 'observed',
    basis: '已观测上千颗（如天狼星 B）。电子简并压支撑，钱德拉塞卡极限 1.44 M☉。',
    perception: '一颗地球大小、却有一个太阳质量的死星。表面重力是地球的十万倍，温度先高后冷。',
    massKg: 1.0 * 1.989e30,
    radiusKm: 6300,
    gravityG: 1.0e5,
    tempK: 10000,
    // 1 M☉ / 6300 km → 1.9e9 kg/m³（一立方米近两千吨）
    densityKgM3: 1.9e9,
    lockedBy: '电子简并压：质量超过 1.44 M☉ 就撑不住（会坍缩成中子星）。半径与质量反相关：质量越大反而越小。',
    freeToAuthor: '温度（刚形成时 10 万 K，冷却到几千 K 要几十亿年）、磁场、是否有伴星、表面成分（氢/氦/碳/氧）。',
    pitfall: '常见错误是给白矮星「正常大小」——它的半径只有地球量级（约 6000 km），不是木星量级。',
    narrativeUse: '「死去的太阳」视觉符号；双星系统中的强紫外伴星；未来文明的遗迹。',
    constantDependence: 'first-principles',
  },
  {
    id: 'neutron-star',
    name: '中子星',
    nameEn: 'Neutron star',
    family: 'stellar-remnant',
    evidence: 'observed',
    basis: '已观测（脉冲星）。中子简并压支撑，半径几乎固定。',
    perception: '直径只有 20 公里，却有一点四个太阳的质量。一茶匙物质重十亿吨。',
    massKg: 1.4 * 1.989e30,
    radiusKm: 11,
    gravityG: 1.6e11,
    tempK: 6e5,
    densityKgM3: 5.0e17,
    lockedBy:
      '中子简并压 + 引力平衡：半径被状态方程锁死在 10—13 km（质量 1.2—2 M☉ 范围）。' +
      '逃逸速度约 0.4c —— 理论上接近光速。自转可以到每秒 700 转（毫秒脉冲星）。',
    freeToAuthor: '磁场（可强可弱，磁星达 1e15 高斯）、自转周期、是否有伴星、是否在吸积。',
    pitfall:
      '「中子星表面」是个危险说法——它的「表面」重力场强到原子核会被压成面条状（核意面）。' +
      '任何「站在中子星上」的描写都需要先解决潮汐力把人撕碎的问题（潮汐力 ∝ 1/r³，在 11 km 尺度上是致命的）。',
    narrativeUse: '极端计时基准（脉冲星 = 宇宙钟）；引力波源；导航信标；「一茶匙十亿吨」的震撼感。',
    constantDependence: 'first-principles',
  },
  {
    id: 'black-hole-stellar',
    name: '恒星级黑洞',
    nameEn: 'Stellar-mass black hole',
    family: 'stellar-remnant',
    evidence: 'observed',
    basis: '已观测（LIGO 引力波、X 射线双星）。史瓦西半径 r_s = 2GM/c²。',
    perception: '一个「没有表面」的引力陷阱。10 太阳质量的黑洞事件视界只有 30 公里。',
    massKg: 10 * 1.989e30,
    radiusKm: 29.5,
    tempK: 6e-9,
    lockedBy:
      '事件视界由质量唯一决定：r_s = 2GM/c² ≈ 2.95 km × (M/M☉)。' +
      '除质量、自转、电荷外**没有任何其他可区分性质**（无毛定理）。',
    freeToAuthor: '自转（Kerr 参数，影响能层与喷流）、是否吸积（决定亮不亮）、吸积盘倾角、伴星。',
    pitfall:
      '「黑洞会把整个星系吸进去」是错的——在同样距离上，用 10 M☉ 黑洞替换太阳，' +
      '行星轨道完全不变（引力只取决于质量，不是「黑洞」这个身份）。' +
      '真正的危险只在视界附近。',
    narrativeUse: '不可逆的边界（叙事上的「越过就不能回头」）；时间膨胀；引力透镜；信息悖论。',
    constantDependence: 'first-principles',
  },
  {
    id: 'black-hole-supermassive',
    name: '超大质量黑洞',
    nameEn: 'Supermassive black hole',
    family: 'stellar-remnant',
    evidence: 'observed',
    basis: '已观测（银心 Sgr A* 约 4e6 M☉、M87* 约 6.5e9 M☉，均有直接成像）。',
    perception: '星系中心的巨兽。质量是太阳的百万到百亿倍，事件视界可以比整个太阳系还大。',
    massKg: 4e6 * 1.989e30,
    radiusKm: 1.18e7,
    tempK: 1e-14,
    lockedBy: '同样遵守 r_s = 2GM/c²。4e6 M☉ 对应视界半径约 1.2e7 km（约 0.08 AU）。',
    freeToAuthor: '自转、吸积率（决定类星体多亮）、是否有喷流、与宿主星系的关系。',
    pitfall:
      '平均密度随质量增大而**降低**：超大质量黑洞的平均密度可以比水还低。' +
      '「黑洞 = 极高密度」只在恒星级成立。',
    narrativeUse: '星系级威胁；类星体的能量源；「银河中心有东西」的设定；时间尺度极大。',
    constantDependence: 'first-principles',
  },
  {
    id: 'brown-dwarf',
    name: '褐矮星',
    nameEn: 'Brown dwarf',
    family: 'stellar-remnant',
    evidence: 'observed',
    basis: '已观测数百颗。质量 13—80 木星质量，不够点燃氢聚变，但能短暂烧氘。',
    perception: '「失败的恒星」。像恒星一样形成，但太轻了，只能暗红地熬着。',
    massKg: 50 * 1.898e27,
    radiusKm: 70000,
    gravityG: 150,
    tempK: 1000,
    densityKgM3: 8e3,
    lockedBy: '质量上限约 80 M_J（再重就能点燃氢）。半径几乎与质量无关（简并态，都约木星大小）。',
    freeToAuthor: '温度（13—80 M_J 对应 500—2800 K）、是否有行星、大气云层（可观测到 L/T/Y 光谱型）。',
    pitfall: '褐矮星的半径与木星接近，但质量可以是木星的 50 倍——「看大小猜质量」会大错。',
    narrativeUse: '「没当上太阳」的悲剧感；可作为流浪行星的暗弱光源；红外观测的挑战。',
    constantDependence: 'first-principles',
  },

  // ══════════════════════════════════════════════════════════════
  // 二、恒星类型（补齐主序之外的演化阶段）
  // ══════════════════════════════════════════════════════════════
  {
    id: 'red-giant',
    name: '红巨星',
    nameEn: 'Red giant',
    family: 'star',
    evidence: 'observed',
    basis: '已观测（如大角星、毕宿五）。主序星耗尽核心氢后膨胀。',
    perception: '一颗膨胀了几十倍的垂死恒星。表面温度反而降低，但总亮度暴增。',
    massKg: 1.1 * 1.989e30,
    radiusKm: 1e8,
    gravityG: 0.001,
    tempK: 3500,
    lockedBy: '半径膨胀是氢壳层燃烧的必然结果。太阳在约 50 亿年后进入此阶段，半径会到达地球轨道附近。',
    freeToAuthor: '具体半径（10—200 R☉）、是否脉动（米拉变星）、是否已抛出行星状星云。',
    pitfall: '红巨星的宜居带极远（几十 AU），但寿命只剩几亿年——不够演化出复杂生命。',
    narrativeUse: '「太阳要死了」的末世设定；母星膨胀吞没内行星；文明的迁徙。',
    constantDependence: 'scaled',
  },
  {
    id: 'pulsar',
    name: '脉冲星',
    nameEn: 'Pulsar',
    family: 'stellar-remnant',
    evidence: 'observed',
    basis: '已观测（1967 年首次发现）。快速自转的中子星，磁极扫过视线产生脉冲。',
    perception: '宇宙里最准的钟。每秒可能脉冲几百次，精度堪比原子钟。',
    massKg: 1.4 * 1.989e30,
    radiusKm: 11,
    gravityG: 1.6e11,
    tempK: 1e6,
    densityKgM3: 5e17,
    lockedBy: '脉冲周期 = 自转周期，精度受自转减慢率限制。周期范围 1.4 ms — 8.5 s。',
    freeToAuthor: '自转周期、磁场强度、是否在双星中、是否有伴星行星（已发现多例）。',
    pitfall: '「脉冲星行星」是真实存在的（PSR B1257+12），但辐射环境极端，宜居性存疑。',
    narrativeUse: '星际导航信标；精确计时；「宇宙灯塔」的意象。',
    constantDependence: 'first-principles',
  },
  {
    id: 'magnetar',
    name: '磁星',
    nameEn: 'Magnetar',
    family: 'stellar-remnant',
    evidence: 'observed',
    basis: '已观测数十颗。磁场强度 1e14—1e15 高斯（地球磁场约 0.5 高斯）。',
    perception: '磁场强到能在几百公里外抹掉你的银行卡、撕裂分子键。',
    massKg: 1.4 * 1.989e30,
    radiusKm: 11,
    gravityG: 1.6e11,
    tempK: 1e7,
    densityKgM3: 5e17,
    lockedBy: '磁场强度上限由能量平衡决定（约 1e15 高斯）。超过则星体被自身磁场撕裂。',
    freeToAuthor: '磁场具体强度、是否处于活跃期（会爆发 X 射线/伽马射线）。',
    pitfall:
      '在 1000 km 距离上，磁场的能量密度足以把水分子撕开——' +
      '「磁星附近的行星」需要极强的设定辩护。',
    narrativeUse: '极端环境；毁灭性爆发（2004 年那次磁星爆发影响了半个银河的无线电）；「磁场风暴」的视觉效果。',
    constantDependence: 'first-principles',
  },

  // ══════════════════════════════════════════════════════════════
  // 三、行星类型（科幻最常见的舞台）
  // ══════════════════════════════════════════════════════════════
  {
    id: 'hot-jupiter',
    name: '热木星',
    nameEn: 'Hot Jupiter',
    family: 'planet',
    evidence: 'observed',
    basis: '已观测数百颗（如 51 Pegasi b，1995 年首个被发现）。离恒星极近的气态巨行星。',
    perception: '一个被恒星烤到发胀的巨行星。轨道周期只有几天，大气在沸腾逃逸。',
    massKg: 1.0 * 1.898e27,
    radiusKm: 100000,
    gravityG: 2.5,
    tempK: 1500,
    densityKgM3: 400,
    lockedBy: '轨道周期 1—10 天；平衡温度 1000—3000 K。这么大的行星不可能在近轨道形成，必须是被迁移过来的。',
    freeToAuthor: '是否有逆行星轨道（已观测到）、大气成分、是否有伴星、是否正在失大气。',
    pitfall: '热木星没有「表面」，且被潮汐锁定——昼侧与夜侧温差可达 1000 K。',
    narrativeUse: '「随时会蒸发」的世界；极端昼夜温差；被恒星锁定的一面永远面向火焰。',
    constantDependence: 'calibrated',
  },
  {
    id: 'rogue-planet',
    name: '流浪行星',
    nameEn: 'Rogue planet / Free-floating planet',
    family: 'planet',
    evidence: 'observed',
    basis: '已观测数十颗（微引力透镜、直接成像）。不绕恒星的自由漂浮行星。',
    perception: '一个没有太阳的世界。天永远是黑的，唯一的热来自行星内部。',
    massKg: 1.0 * 5.972e24,
    radiusKm: 6371,
    gravityG: 1.0,
    tempK: 50,
    densityKgM3: 5500,
    lockedBy: '没有恒星光，表面温度只取决于内部热与残存放射性。数亿年后降到与宇宙微波背景相当（约 3 K）。',
    freeToAuthor: '内部热源（潮汐加热、放射性）、是否有卫星、是否有大气（氢气可保温）、是否有地下海洋。',
    pitfall:
      '「流浪行星上能住人」需要强设定：地表温度接近 3 K，光合作用完全不可能。' +
      '地下海洋（靠潮汐或放射热）是唯一现实路径。',
    narrativeUse: '「没有太阳的世界」；黑暗中的文明；星际旅行的中转站；孤独感最强的舞台。',
    constantDependence: 'first-principles',
  },
  {
    id: 'tidally-locked-planet',
    name: '潮汐锁定行星',
    nameEn: 'Tidally locked planet',
    family: 'planet',
    evidence: 'observed',
    basis: '理论必然（潮汐演化），已间接支持（如 TRAPPIST-1 系统）。',
    perception: '一面永远白昼、一面永远黑夜。分界线上是永恒的黄昏。',
    massKg: 1.0 * 5.972e24,
    radiusKm: 6371,
    gravityG: 1.0,
    tempK: 280,
    densityKgM3: 5500,
    lockedBy:
      '潮汐锁定时间尺度 ∝ a⁶ —— 轨道越近锁定越快。红矮星宜居带内（a < 0.1 AU）' +
      '的行星在几亿年内必然锁定。',
    freeToAuthor: '昼夜侧温差（取决于大气环流与海洋热输送）、是否有多行星、是否有共振。',
    pitfall:
      '「一面永昼一面永夜」不等于「昼侧烤焦、夜侧冰封」——厚大气可以把热输运过去。' +
      '但这也意味着强风与永久性风暴。',
    narrativeUse: '「黄昏带」文明；永昼与永夜的社会分化；气象极端。',
    constantDependence: 'first-principles',
  },
  {
    id: 'super-earth',
    name: '超级地球',
    nameEn: 'Super-Earth',
    family: 'planet',
    evidence: 'observed',
    basis: '已观测数十颗（如 55 Cancri e、Kepler-20b）。质量 1—10 地球质量。',
    perception: '一个比地球更大更重的岩石世界。重力 1.5—3 g，人类会被压得站不直。',
    massKg: 5 * 5.972e24,
    radiusKm: 12742,
    gravityG: 1.7,
    tempK: 280,
    densityKgM3: 6000,
    lockedBy: '重力 g ∝ M/R。质量 5 M⊕、半径 1.6 R⊕ 对应 2 g。',
    freeToAuthor: '大气成分、是否有海洋、自转、磁场。',
    pitfall:
      '超级地球的逃逸速度高（约 1.5—2 倍地球），会保留更厚的氢氦包层——' +
      '「超级地球」很容易变成「迷你海王星」，不是理想宜居地。',
    narrativeUse: '重力更大的世界；生物形态矮壮；航天更难（逃逸速度高）。',
    constantDependence: 'first-principles',
  },
  {
    id: 'ocean-planet',
    name: '海洋行星',
    nameEn: 'Ocean planet / Water world',
    family: 'planet',
    evidence: 'theoretical',
    basis: '理论预言，尚未确认。整颗行星被全球性海洋覆盖，无陆地。',
    perception: '一个没有陆地的世界。除了浮岛与冰盖，脚下永远是水。',
    massKg: 3 * 5.972e24,
    radiusKm: 15000,
    gravityG: 1.2,
    tempK: 300,
    densityKgM3: 3000,
    lockedBy: '水占比高 → 密度低（约 3000 kg/m³），重力低于同质量岩石行星。',
    freeToAuthor: '水深（几十到几百公里）、是否有海底热泉、冰盖厚度、洋流。',
    pitfall:
      '深海洋行星（水深 > 100 km）会在底部形成高压冰层（冰 VII），' +
      '与岩石地幔隔绝——这会影响物质循环，进而影响生命。',
    narrativeUse: '水世界文明（如你的 Pearl Moon、Chandria IV）；无陆地社会的设定；航海社会。',
    constantDependence: 'first-principles',
  },

  // ══════════════════════════════════════════════════════════════
  // 四、天体力学/星系级结构（科幻里写「宏大」时绕不开）
  // ══════════════════════════════════════════════════════════════
  {
    id: 'globular-cluster',
    name: '球状星团',
    nameEn: 'Globular cluster',
    family: 'exotic',
    evidence: 'observed',
    basis: '已观测（银河系内约 150 个）。上万颗恒星紧密聚集，年龄极老。',
    perception: '夜空里一万颗星的密集球团。中心区域的星间距只有几十个 AU。',
    massKg: 1e54,
    radiusKm: 1e14,
    tempK: 0,
    densityKgM3: 1e3,
    lockedBy: '引力束缚系统，尺度 10—100 光年，恒星密度是太阳附近的 100—1000 倍。',
    freeToAuthor: '天体数量、金属丰度（通常极低）、是否已耗尽星际气体、是否有中心黑洞。',
    pitfall: '球状星团里没有行星——恒星密度太高，行星轨道会被扰动掉。',
    narrativeUse: '「恒星的都市」；古老文明；密集星空的视觉奇观。',
    constantDependence: 'first-principles',
  },
  {
    id: 'dyson-sphere',
    name: '戴森球',
    nameEn: 'Dyson sphere',
    family: 'artificial',
    evidence: 'speculative',
    basis: '纯理论构想（1960 年 Dyson 提出）。包围整颗恒星收集能源。',
    perception: '一颗被包裹起来的恒星。你可能看不到它，只看到红外余热。',
    massKg: 1e27,
    radiusKm: 1.5e8,
    tempK: 300,
    lockedBy:
      '材料强度是致命瓶颈：在 1 AU 处，任何结构承受的离心/重力载荷远超已知材料极限。' +
      '「刚性球壳」不可能——只能是无人居住的「戴森云」（大量独立轨道单元）。',
    freeToAuthor: '云还是壳、收集效率、是否可居住、是否透明（可透光部分）、是否有内圈热管理。',
    pitfall:
      '刚性戴森球在物理上会自毁（内部应力），真正可行的是戴森云（百万个独立环或卫星）。' +
      '而且从外部观测时，它表现为「红外过剩的恒星」，不是「黑洞」。',
    narrativeUse: 'II 型文明的标志；恒星光被遮住的星系；「红外观测发现异常」的侦探情节。',
    constantDependence: 'contingent',
  },

  // ══════════════════════════════════════════════════════════════
  // 五、纯思辨（科幻里最自由、也最需要标注「思辨」的一批）
  // ══════════════════════════════════════════════════════════════
  {
    id: 'curtain-world',
    name: '帘幕类天体',
    nameEn: 'Curtain body / Strange matter star',
    family: 'exotic',
    evidence: 'speculative',
    basis: '纯理论假设。奇异物质或奇异夸克星，只在极端假设下存在。',
    perception: '一个可能连本身都不是常规物质的星体。',
    freeToAuthor: '几乎一切——但正因为几乎一切都能编，更需要作者自己定规则并保持一致。',
    pitfall: '「奇异物质能转化一切正常物质」这类设定一旦引入，就瓦解了整个世界的物理基础——要非常谨慎。',
    narrativeUse: '宇宙级威胁；不可理解的物理；「碰到就同化」的恐怖感。',
    constantDependence: 'contingent',
  },

  // ══════════════════════════════════════════════════════════════
  // 六、更多恒星演化阶段（补齐「恒星一生」链条）
  // ══════════════════════════════════════════════════════════════
  {
    id: 'main-sequence-star',
    name: '主序星',
    nameEn: 'Main-sequence star',
    family: 'star',
    evidence: 'observed',
    basis: '我们的太阳就是。核心稳定氢聚变，占恒星一生 90% 时间。',
    perception: '一颗稳定的普通恒星。亮度缓慢增长，可以安稳几十亿年。',
    massKg: 1.989e30,
    radiusKm: 695700,
    gravityG: 274,
    tempK: 5778,
    densityKgM3: 1410,
    lockedBy:
      '质光关系 L ∝ M^3.5—4（粗略）。质量决定光度、半径、寿命、有效温度——' +
      '一旦质量定了，其余基本锁定。',
    freeToAuthor: '具体质量（0.08—100 M☉）、金属丰度、自转、双星关系、演化年龄。',
    pitfall: '「主序星」是演化的一个阶段，不是类型。太阳 50 亿年后就不在主序了。',
    narrativeUse: '最常见、最适合「有人居住」的恒星；作者的世界几乎都绕主序星。',
    constantDependence: 'scaled',
  },
  {
    id: 'blue-supergiant',
    name: '蓝超巨星',
    nameEn: 'Blue supergiant',
    family: 'star',
    evidence: 'observed',
    basis: '已观测（如参宿七、海山二）。质量 20—100 M☉，寿命只有几百万年。',
    perception: '一颗亮到能照亮整个星系旋臂的年轻巨兽，寿命却短得来不及演化出文明。',
    massKg: 30 * 1.989e30,
    radiusKm: 3e7,
    gravityG: 70,
    tempK: 15000,
    densityKgM3: 5e-3,
    lockedBy: '寿命 ∝ M^-2.5：30 M☉ 只有约 600 万年。大质量星的「短暂」是物理决定的。',
    freeToAuthor: '质量、是否脉动、是否在双星、是否即将超新星爆发。',
    pitfall:
      '大质量星会吹出强星风，把周围行星大气剥离，宜居带也极远（几十到几百 AU）。' +
      '「围绕蓝超巨星的行星」需要极强的设定辩护。',
    narrativeUse: '壮丽但致命的恒星；「即将爆发」的倒计时；星际文明的避难所。',
    constantDependence: 'scaled',
  },
  {
    id: 'wolf-rayet',
    name: '沃尔夫-拉叶星',
    nameEn: 'Wolf-Rayet star',
    family: 'star',
    evidence: 'observed',
    basis: '已观测（如天社一）。大质量恒星抛掉外层，核心暴露。',
    perception: '一颗剥了皮的恒星。极亮、极热，星风猛烈，寿命只有几十万年。',
    massKg: 20 * 1.989e30,
    radiusKm: 5e6,
    gravityG: 5000,
    tempK: 80000,
    densityKgM3: 1e-2,
    lockedBy: '核心暴露 → 表面温度 5 万—20 万 K，紫外辐射极强。寿命以十万年计。',
    freeToAuthor: '是否正走向超新星、是否有伴星、星风强度。',
    pitfall: '紫外辐射强度是太阳的几千倍——附近任何行星的大气都会被电离剥离。',
    narrativeUse: '「宇宙熔炉」；超新星前夜；极端辐射环境。',
    constantDependence: 'scaled',
  },
  {
    id: 'red-dwarf',
    name: '红矮星',
    nameEn: 'Red dwarf',
    family: 'star',
    evidence: 'observed',
    basis: '银河系最常见的恒星（约占 75%）。质量 0.08—0.5 M☉。',
    perception: '小而暗的红光。寿命几千亿年，但八卦的耀斑狂暴。',
    massKg: 0.3 * 1.989e30,
    radiusKm: 2.1e5,
    gravityG: 380,
    tempK: 3300,
    densityKgM3: 2e4,
    lockedBy: '寿命 ∝ M^-2.5：0.3 M☉ 可活约 2000 亿年。宜居带极近（0.1—0.3 AU）。',
    freeToAuthor: '耀斑频率、是否为「安静型」、是否有行星系统。',
    pitfall:
      '绝大多数红矮星有强烈耀斑（米拉变星之外），会剥离行星大气。' +
      '但也有一些安静型（如比邻星相对温和），后者更适合生命。',
    narrativeUse: '最可能的「有生命」恒星类型；长寿宇宙文明；暗弱的恒星环境。',
    constantDependence: 'scaled',
  },

  // ══════════════════════════════════════════════════════════════
  // 七、更多行星类型（科幻创作核心）
  // ══════════════════════════════════════════════════════════════
  {
    id: 'gas-giant',
    name: '气态巨行星',
    nameEn: 'Gas giant',
    family: 'planet',
    evidence: 'observed',
    basis: '已观测（木星、土星及数百颗系外）。主要由氢氦组成，无固体表面。',
    perception: '一颗巨大的、没有地面的世界。猛烈的风暴带、永远的压力深渊。',
    massKg: 1.898e27,
    radiusKm: 7e4,
    gravityG: 2.5,
    tempK: 165,
    densityKgM3: 1326,
    lockedBy: '没有固体表面——『表面』只是 1 atm 等压面。半径与质量关系被简并态锁死。',
    freeToAuthor: '大气成分、云层结构、是否有环、磁层、卫星系统。',
    pitfall:
      '气态巨行星的半径与质量关系近似「质量越大越致密」——超过约 2 木星质量后' +
      '半径不再增加（简并态）。「一百倍木星大小的气态巨行星」是不存在的。',
    narrativeUse: '悬浮城市；风暴带中的世界；星际殖民的经典目标。',
    constantDependence: 'first-principles',
  },
  {
    id: 'ice-giant',
    name: '冰巨星',
    nameEn: 'Ice giant',
    family: 'planet',
    evidence: 'observed',
    basis: '已观测（天王星、海王星）。主要由冰物质（水、氨、甲烷）组成。',
    perception: '一颗蓝绿色的行星。没有明显的表面，大气平静却极度寒冷。',
    massKg: 5e26,
    radiusKm: 2.5e4,
    gravityG: 1.1,
    tempK: 60,
    densityKgM3: 1300,
    lockedBy: '密度与半径范围被形成条件锁定（10—20 地球质量是典型区间）。',
    freeToAuthor: '轴倾角（天王星近 98°）、是否有环、内部热、大气颜色。',
    pitfall:
      '冰巨星的「冰」不是水冰，而是超临界流体（水、氨、甲烷混合物）。' +
      '天王星自转轴几乎躺着——这会让季节极端（每个极区连续 42 年白昼）。',
    narrativeUse: '极端季节（轴倾角近 90°）；蓝绿色世界的视觉特色；寒冷但可能宜居的卫星。',
    constantDependence: 'first-principles',
  },
  {
    id: 'super-jupiter',
    name: '超级木星',
    nameEn: 'Super-Jupiter',
    family: 'planet',
    evidence: 'observed',
    basis: '已观测多颗（质量 2—13 木星质量）。',
    perception: '一个「超大的木星」。可能接近褐矮星，能短暂烧氘。',
    massKg: 5 * 1.898e27,
    radiusKm: 8e4,
    gravityG: 12,
    tempK: 1000,
    densityKgM3: 1200,
    lockedBy: '质量界限：超过 13 M_J 开始烧氘（成为褐矮星），超过 80 M_J 点燃氢。',
    freeToAuthor: '轨道、是否有环、温度、是否有超强磁场（可达地球的百倍）。',
    pitfall: '超级木星的磁场可以极强（某些观测到数千倍地球磁场），强烈的辐射带会摧毁卫星上的电子设备。',
    narrativeUse: '巨型气态行星；极端风暴；辐射带的死亡地带。',
    constantDependence: 'first-principles',
  },
  {
    id: 'icy-moon',
    name: '冰卫（冰质卫星）',
    nameEn: 'Icy moon',
    family: 'planet',
    evidence: 'observed',
    basis: '已观测（木卫二、土卫二、土卫六）。冰壳下有液态海洋。',
    perception: '一个冰封的卫星。表面零下上百度，冰层下却有全球性海洋。',
    massKg: 4.8e22,
    radiusKm: 1600,
    gravityG: 0.13,
    tempK: 100,
    densityKgM3: 1900,
    lockedBy: '温度由日照与潮汐加热决定。冰壳厚度可在几十到几百公里。',
    freeToAuthor: '海洋深度、是否有热泉、冰壳裂缝、是否有大气、潮汐加热强度。',
    pitfall:
      '「冰下海洋」是生命的主要候选，但陆上生命所需的阳光不可达——' +
      '需要化学能（海底热泉）支撑，这会引起完全不同类型的生态系统。',
    narrativeUse: '地外生命候选；深海文明；冰上世界（如你的 Landunder）。',
    constantDependence: 'calibrated',
  },
  {
    id: 'chthonian-planet',
    name: '地狱行星',
    nameEn: 'Chthonian planet / Lava planet',
    family: 'planet',
    evidence: 'theoretical',
    basis: '理论预言，可能已间接观测。大气被恒星剥离，只剩岩石核心。',
    perception: '一颗被恒星烤干的行星。昼侧是熔岩海，夜侧可能冻结岩石。',
    massKg: 3 * 5.972e24,
    radiusKm: 12000,
    gravityG: 1.3,
    tempK: 2000,
    densityKgM3: 8000,
    lockedBy: '高温 + 无大气 → 表面温度由辐照与热辐射平衡决定（可达 2000—3000 K）。',
    freeToAuthor: '轨道、是否仍有残余大气、是否有金属蒸汽、冷却速率。',
    pitfall:
      '熔岩行星的「岩石蒸汽大气」会产生复杂大气（硅酸盐云），' +
      '不是「真空」——写这类世界时大气科学是关键。',
    narrativeUse: '地狱景观；「被烤干的同胞」；恒星活动的破坏力。',
    constantDependence: 'calibrated',
  },

  // ══════════════════════════════════════════════════════════════
  // 八、小天体（写「毁灭」与「资源」时用）
  // ══════════════════════════════════════════════════════════════
  {
    id: 'asteroid-belt',
    name: '小行星带',
    nameEn: 'Asteroid belt',
    family: 'small-body',
    evidence: 'observed',
    basis: '已观测（太阳系小行星带，约 1 亿颗 > 1 km）。',
    perception: '无数碎石组成的海洋。看似密集，实际间距是几百万公里。',
    massKg: 2.4e21,
    radiusKm: 4e8,
    tempK: 170,
    lockedBy: '总质量只有月球的约 3%。之间距极大——「穿越小行星带」不会撞得像电影里那样。',
    freeToAuthor: '形成历史、是否有开采价值、是否有大天体藏在其中。',
    pitfall:
      '小行星带极其空旷：探测器穿越几乎不会撞上东西。' +
      '「密集的碎石带」是电影错觉。',
    narrativeUse: '资源开采；海盗藏身处；撞击威胁（需要特别大的个体）。',
    constantDependence: 'first-principles',
  },
  {
    id: 'comet',
    name: '彗星',
    nameEn: 'Comet',
    family: 'small-body',
    evidence: 'observed',
    basis: '已观测（如哈雷彗星）。冰与尘埃的混合体，近太阳时升华出彗尾。',
    perception: '一颗拖着长长光尾的雪球。未靠近太阳时只是一个暗弱的小点。',
    massKg: 1e15,
    radiusKm: 10,
    tempK: 200,
    lockedBy:
      '彗尾只在近太阳时出现（升华温度约 150—200 K）；' +
      '彗核很小（几公里到几十公里），但彗尾可以长到 1 AU。',
    freeToAuthor: '轨道、成分（冰与有机物）、是否有生命前体分子。',
    pitfall:
      '彗尾与彗核完全不是一回事——彗尾非常稀薄（比实验室真空还稀），' +
      '「彗尾吞噬行星」是错的。彗星真正的威胁是彗核撞击。',
    narrativeUse: '预兆与灾变（历史原型：十字军时代的彗星）；「生命的种子」（彗星带来有机物）；太空探险目标。',
    constantDependence: 'calibrated',
  },
  {
    id: 'kuiper-belt',
    name: '柯伊伯带',
    nameEn: 'Kuiper belt',
    family: 'small-body',
    evidence: 'observed',
    basis: '已观测（冥王星、妊神星等）。海王星轨道外的冰质天体带。',
    perception: '太阳系边缘的黑暗冰坟场。天体极小，温度 40 K 上下。',
    massKg: 1e23,
    radiusKm: 1e10,
    tempK: 45,
    lockedBy: '温度接近 40 K（很冷但比真空高几十倍），驱动挥发物（甲烷、氨）冻结。',
    freeToAuthor: '天体数量、是否有大天体、是否有星际天体经过。',
    pitfall: '天体密度极低（「带」其实非常空旷），「密集的冰质地带」是错觉。',
    narrativeUse: '文明的边缘；被困的星际探测器；对「太阳系全景」的兴趣。',
    constantDependence: 'first-principles',
  },
  {
    id: 'oort-cloud',
    name: '奥尔特云',
    nameEn: 'Oort cloud',
    family: 'small-body',
    evidence: 'theoretical',
    basis: '理论预言（长周期彗星的来源，尚未直接观测）。包围太阳系的冰质球壳。',
    perception: '太阳系最外面的边界。数千亿颗冰质天体，延伸到数万 AU。',
    massKg: 1.9e22,
    radiusKm: 1e13,
    tempK: 5,
    lockedBy: '只有约 5 K（宇宙微波背景加一点），天体间距上亿公里。',
    freeToAuthor: '天体总数、是否有大天体、是否受临近恒星扰动。',
    pitfall: '奥尔特云的存在是间接推断的（长周期彗星来源），没有被直接观测。',
    narrativeUse: '「太阳系的尽头」；长周期彗星（如 NEOWISE）的家；文明的孤岛。',
    constantDependence: 'first-principles',
  },

  // ══════════════════════════════════════════════════════════════
  // 九、星系级结构（写「宏大」时绕不开）
  // ══════════════════════════════════════════════════════════════
  {
    id: 'spiral-galaxy',
    name: '旋涡星系',
    nameEn: 'Spiral galaxy',
    family: 'exotic',
    evidence: 'observed',
    basis: '已观测（银河系、仙女座）。有旋臂的盘状星系，中心常有超大质量黑洞。',
    perception: '一个扁平旋转的盘的星海。旋臂里堆着年轻的亮星与气体。',
    massKg: 1.5e42,
    radiusKm: 5e17,
    tempK: 0,
    densityKgM3: 1e-22,
    lockedBy: '直径约 10 万光年。旋转周期 2—3 亿年（太阳绕银心一次）。',
    freeToAuthor: '旋臂数量、中心黑洞质量、是否有棒、伴星系、星系际关系。',
    pitfall:
      '星系不是「均匀的星海」——恒星集中在盘与旋臂，星系际空间极空。' +
      '太阳系在猎户臂的稀薄区域。',
    narrativeUse: '「星系文明」；星图尺度；旋臂间的旅行。',
    constantDependence: 'first-principles',
  },
  {
    id: 'open-cluster',
    name: '疏散星团',
    nameEn: 'Open cluster',
    family: 'exotic',
    evidence: 'observed',
    basis: '已观测（昂星团、毕星团）。上百到上万颗年轻恒星松散聚集。',
    perception: '夜空中的一团亮点（如昂星团）。恒星年轻、松散、终会散开。',
    massKg: 1e34,
    radiusKm: 1e14,
    tempK: 0,
    densityKgM3: 1e-20,
    lockedBy: '寿命只有几亿年（潮汐力与内引力会把它拆散）。',
    freeToAuthor: '恒星数量、年龄、是否有行星、是否将形成双星。',
    pitfall: '疏散星团会散开，所以它不是「永久结构」——写「星团文明」有寿命上限。',
    narrativeUse: '年轻的星空场景；「星光灿烂的夜晚」；常见的科幻星图。',
    constantDependence: 'first-principles',
  },
  {
    id: 'planetary-nebula',
    name: '行星状星云',
    nameEn: 'Planetary nebula',
    family: 'star',
    evidence: 'observed',
    basis: '已观测（如环状星云）。小质量恒星临终时抛出的发光气体壳。',
    perception: '一颗恒星死后留下的彩色光壳。中心有一颗白矮星。',
    massKg: 1e30,
    radiusKm: 1e13,
    tempK: 10000,
    densityKgM3: 1e-12,
    lockedBy: '只持续几万年就消散。颜色取决于气体成分（O 绿、N 红）。',
    freeToAuthor: '形状（多为环、蝶形）、中心星温度、是否有伴星、是否为对称。',
    pitfall: '「行星状」是历史误称——它与行星无关，只是早期望远镜看像行星圆盘。',
    narrativeUse: '壮丽的「恒星遗容」；「暮年恒星」叙事；色彩缤纷的天文背景。',
    constantDependence: 'scaled',
  },
]

/** 按族分组。 */
export function typesByFamily(family: BodyType['family']): BodyType[] {
  return BODY_TYPES.filter(function (type) { return type.family === family })
}

/** 按证据等级分组。 */
export function typesByEvidence(evidence: EvidenceLevel): BodyType[] {
  return BODY_TYPES.filter(function (type) { return type.evidence === evidence })
}

/** 族的显示顺序。 */
export const FAMILY_ORDER: Array<BodyType['family']> = [
  'stellar-remnant',
  'star',
  'planet',
  'small-body',
  'exotic',
  'artificial',
]

/** 族的中文名。 */
export const FAMILY_LABEL: Record<BodyType['family'], string> = {
  'stellar-remnant': '恒星残骸',
  star: '恒星',
  planet: '行星',
  'small-body': '小天体',
  exotic: '宏大结构 / 理论天体',
  artificial: '人工结构',
}

/** 证据等级的中文名与说明。 */
export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  observed: '已观测（有观测证据）',
  theoretical: '理论预言（物理必然但未直接观测）',
  speculative: '纯思辨（既无观测也无严格理论）',
}

/**
 * 按名字或名字片段查类型。
 *
 * @param query - 中文名/英文名/id 片段
 * @returns 匹配的类型；没有返回 undefined
 */
export function findBodyType(query: string): BodyType | undefined {
  const text = query.trim().toLowerCase()
  if (text === '') return undefined
  return BODY_TYPES.find(function (type) {
    return type.id.toLowerCase() === text ||
      type.name.includes(query) ||
      type.nameEn.toLowerCase().includes(text)
  })
}
