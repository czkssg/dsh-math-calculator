/**
 * 英制工业与旧制单位（蒸汽朋克核心）。
 *
 * ## 为什么这一层是蒸汽朋克的关键
 *
 * 蒸汽朋克的工业描写离不开这些单位：
 *
 * ```
 *   锅炉    psi / inHg / BTU / BTU/(lb·°F) / hp_boiler
 *   管路    gpm / cfm / fps
 *   蒸汽    潜热 BTU/lb、干度、过热
 *   机械    ft·lbf / slug / poundal / rpm
 *   货物    firkin / hogshead / bushel / peck / barrel
 *   贵金属  troy ounce / pennyweight / grain / carat
 * ```
 *
 * 而这些在公制里**没有直接对应**（`BTU/lb` 换成 `J/kg` 会失去「每磅」这个工程习惯）。
 *
 * ## 收 English 旧制的三个时期
 *
 * ```
 *   中世纪      Assize of Measures (1196) 之后
 *   帝国制      1824 Imperial Standards（英国法定）
 *   美制        1776 后与英国分道（加仑、吨、英担都不同）
 * ```
 *
 * **帝国制与美制不同**是最容易踩的坑：
 *
 * ```
 *   1 英制加仑 = 4.546 L
 *   1 美制加仑 = 3.785 L          差 20%
 *   1 长吨     = 2240 lb = 1016 kg
 *   1 短吨     = 2000 lb = 907 kg  差 12%
 * ```
 *
 * @module dsh-math-calculator/core/units-imperial
 */

/** 一个单位定义（与 units-data 的形态一致）。 */
export interface UnitEntry {
  /** 单位名（mathjs 里用的标识）。 */
  name: string
  /** 别名（含中文）。 */
  aliases: string[]
  /** 量纲。 */
  dimension: string
  /** 换算到基准单位的因子。 */
  factor: number
  /** 备注（说明来源与区别）。 */
  note?: string
  /** 所属体系（用于帮助与审计）。 */
  system?: 'imperial' | 'us' | 'medieval' | 'cn' | 'count' | 'angle'
}

/**
 * ## 英制长度（含航海与测量专用）
 */
export const IMPERIAL_LENGTH: UnitEntry[] = [
  { name: 'thou', aliases: ['thousandth', 'mil_length', '密尔'], dimension: 'length', factor: 0.0000254, note: '1 thou = 1/1000 英寸 = 25.4 µm；机械公差常用（蒸汽机活塞间隙以 thou 计）', system: 'imperial' },
  { name: 'line', aliases: ['line_length', '线'], dimension: 'length', factor: 0.00211666666, note: '1 line = 1/12 英寸 ≈ 2.12 mm（旧枪械口径单位）', system: 'imperial' },
  { name: 'barleycorn', aliases: ['大麦粒'], dimension: 'length', factor: 0.0084666666, note: '1 barleycorn = 1/3 英寸；英制鞋码的基准', system: 'imperial' },
  { name: 'finger', aliases: ['finger_width', '指宽'], dimension: 'length', factor: 0.022225, note: '1 finger = 7/8 英寸 ≈ 22.2 mm（旧纺织与火药）', system: 'imperial' },
  { name: 'nail', aliases: ['nail_cloth', 'nail布'], dimension: 'length', factor: 0.05715, note: '1 nail = 2.25 英寸 ≈ 57.2 mm（布匹计量）', system: 'medieval' },
  { name: 'palm', aliases: ['palm_width', '掌宽'], dimension: 'length', factor: 0.0762, note: '1 palm = 3 英寸 = 76.2 mm', system: 'imperial' },
  { name: 'hand', aliases: ['hand_width', '掌'], dimension: 'length', factor: 0.1016, note: '1 hand = 4 英寸 = 101.6 mm；马高专用（15 掌 = 1.524 m）', system: 'imperial' },
  { name: 'link', aliases: ['link_chain', '链节'], dimension: 'length', factor: 0.201168, note: '1 link = 1/100 链 = 7.92 英寸 ≈ 20.1 cm（土地测量）', system: 'imperial' },
  { name: 'span', aliases: ['span_width', '拃'], dimension: 'length', factor: 0.2286, note: '1 span = 9 英寸 = 22.86 cm（张开手指的宽度）', system: 'medieval' },
  { name: 'cubit_imperial', aliases: ['皇家肘尺'], dimension: 'length', factor: 0.4572, note: '1 cubit = 18 英寸 = 45.72 cm（圣经与建筑）', system: 'medieval' },
  { name: 'pace', aliases: ['步幅'], dimension: 'length', factor: 0.762, note: '1 pace = 30 英寸 = 76.2 cm（单步；罗马 passus 是双步）', system: 'medieval' },
  { name: 'ell_english', aliases: ['厄尔'], dimension: 'length', factor: 1.143, note: '1 English ell = 45 英寸 = 1.143 m（量布）', system: 'medieval' },
  { name: 'fathom', aliases: ['英寻'], dimension: 'length', factor: 1.8288, note: '1 fathom = 6 ft = 1.8288 m（水深；1 链 = 100 fathom）', system: 'imperial' },
  { name: 'rod', aliases: ['perch', 'pole', '杆', '竿'], dimension: 'length', factor: 5.0292, note: '1 rod = 5.5 yd = 16.5 ft = 5.0292 m（土地基本单位）', system: 'imperial' },
  { name: 'chain', aliases: ['链'], dimension: 'length', factor: 20.1168, note: '1 chain = 66 ft = 22 yd = 20.1168 m（Gunter 链，铁路与土地测量）', system: 'imperial' },
  { name: 'furlong', aliases: ['弗隆'], dimension: 'length', factor: 201.168, note: '1 furlong = 40 rod = 1/8 mile（「一犁之地」长边）', system: 'imperial' },
  { name: 'cable', aliases: ['cable_length', '链长'], dimension: 'length', factor: 185.2, note: '1 cable = 1/10 海里 = 185.2 m（航海）', system: 'imperial' },
  { name: 'nautical_mile', aliases: ['nmi', '海里'], dimension: 'length', factor: 1852, note: '1 海里 = 1852 m（1 分纬度）；与 statute mile 不同', system: 'imperial' },
  { name: 'league_marine', aliases: ['海里格'], dimension: 'length', factor: 5556, note: '1 海里格 = 3 海里 = 5556 m', system: 'imperial' },
]

/**
 * ## 英制质量（含金衡与药衡）
 *
 * ★ 三套并行是英制最大的坑：
 *
 * ```
 *   avoirdupois（常衡）  1 lb = 453.59 g   ← 货物
 *   troy（金衡）         1 lb = 373.24 g   ← 贵金属，12 oz
 *   apothecary（药衡）   1 lb = 373.24 g   ← 药品，但细分不同
 * ```
 */
export const IMPERIAL_MASS: UnitEntry[] = [
  { name: 'grain', aliases: ['格令'], dimension: 'mass', factor: 0.00006479891, note: '1 grain = 64.79891 mg；**三套衡制的共同基准**（常衡 7000 grain = 1 lb，金衡 5760 grain = 1 lb）', system: 'imperial' },
  { name: 'dram', aliases: ['打兰', 'dr'], dimension: 'mass', factor: 0.00177184519, note: '1 dram = 1/16 oz（常衡）= 1.772 g', system: 'imperial' },
  { name: 'ounce', aliases: ['oz', '盎司'], dimension: 'mass', factor: 0.02834952312, note: '1 oz = 1/16 lb（常衡）= 28.35 g', system: 'imperial' },
  { name: 'pound', aliases: ['lb', '磅'], dimension: 'mass', factor: 0.45359237, note: '1 lb（常衡）= 453.59237 g（1959 国际定义）', system: 'imperial' },
  { name: 'stone', aliases: ['英石', 'st'], dimension: 'mass', factor: 6.35029318, note: '1 stone = 14 lb = 6.35 kg（英国人体重常用）', system: 'imperial' },
  { name: 'quarter', aliases: ['qtr', '夸特重'], dimension: 'mass', factor: 12.70058636, note: '1 quarter = 2 stone = 28 lb = 12.7 kg', system: 'imperial' },
  { name: 'cwt_long', aliases: ['long_hundredweight', '长英担'], dimension: 'mass', factor: 50.80234544, note: '1 长英担 = 112 lb = 50.8 kg（英国）', system: 'imperial' },
  { name: 'cwt_short', aliases: ['short_hundredweight', '短英担'], dimension: 'mass', factor: 45.359237, note: '1 短英担 = 100 lb = 45.36 kg（美国）', system: 'us' },
  { name: 'ton_long', aliases: ['long_ton', '长吨', 'imperial_ton'], dimension: 'mass', factor: 1016.0469088, note: '1 长吨 = 2240 lb = 1016.05 kg（英国；船舶吨位常用）', system: 'imperial' },
  { name: 'ton_short', aliases: ['short_ton', '短吨', 'us_ton'], dimension: 'mass', factor: 907.18474, note: '1 短吨 = 2000 lb = 907.18 kg（美国）', system: 'us' },
  { name: 'slug', aliases: ['斯勒格'], dimension: 'mass', factor: 14.59390294, note: '1 slug = 32.174 lb = 14.59 kg（英制质量的力-加速度单位，F=ma 直接用）', system: 'imperial' },
  /** 金衡。 */
  { name: 'pennyweight', aliases: ['dwt', '本尼威特'], dimension: 'mass', factor: 0.00155517384, note: '1 dwt = 24 grain = 1.555 g（金衡）', system: 'imperial' },
  { name: 'troy_ounce', aliases: ['ozt', '金衡盎司'], dimension: 'mass', factor: 0.0311034768, note: '1 ozt = 20 dwt = 31.103 g（贵金属报价单位）', system: 'imperial' },
  { name: 'troy_pound', aliases: ['lbt', '金衡磅'], dimension: 'mass', factor: 0.3732417216, note: '1 金衡磅 = 12 ozt = 373.24 g（比常衡磅轻 17%）', system: 'imperial' },
  { name: 'carat', aliases: ['ct', '克拉'], dimension: 'mass', factor: 0.0002, note: '1 carat = 200 mg（宝石）；注意与「K 金」的 karat 不同', system: 'imperial' },
]

/**
 * ## 英制体积（干量与液量分开）
 *
 * ★ 英制最混乱的一块：**同一名字在英制与美制下容量不同**。
 */
export const IMPERIAL_VOLUME: UnitEntry[] = [
  { name: 'fluid_ounce_imp', aliases: ['fl_oz_imp', '英制液盎司'], dimension: 'volume', factor: 0.0000284130625, note: '1 英制液盎司 = 28.413 mL', system: 'imperial' },
  { name: 'fluid_ounce_us', aliases: ['fl_oz_us', '美制液盎司'], dimension: 'volume', factor: 0.0000295735295625, note: '1 美制液盎司 = 29.574 mL（比英制大 4%）', system: 'us' },
  { name: 'gill_imp', aliases: ['英制及耳'], dimension: 'volume', factor: 0.0001420653125, note: '1 英制 gill = 5 fl oz = 142.1 mL', system: 'imperial' },
  { name: 'pint_imp', aliases: ['英制品脱'], dimension: 'volume', factor: 0.00056826125, note: '1 英制品脱 = 20 fl oz = 568.3 mL（啤酒标准）', system: 'imperial' },
  { name: 'pint_us', aliases: ['美制品脱'], dimension: 'volume', factor: 0.000473176473, note: '1 美制品脱 = 16 fl oz = 473.2 mL（**比英制小 17%**）', system: 'us' },
  { name: 'quart_imp', aliases: ['英制夸脱'], dimension: 'volume', factor: 0.0011365225, note: '1 英制夸脱 = 2 pint = 1.137 L', system: 'imperial' },
  { name: 'gallon_imp', aliases: ['英制加仑', 'imperial_gallon'], dimension: 'volume', factor: 0.00454609, note: '1 英制加仑 = 4.54609 L（1824 定义；蒸汽机耗水常以此计）', system: 'imperial' },
  { name: 'gallon_us', aliases: ['美制加仑', 'us_gallon'], dimension: 'volume', factor: 0.003785411784, note: '1 美制加仑 = 3.785 L（**比英制小 17%**）', system: 'us' },
  { name: 'peck', aliases: ['配克'], dimension: 'volume', factor: 0.00909218, note: '1 peck = 2 英制加仑 = 9.092 L（干量）', system: 'imperial' },
  { name: 'bushel', aliases: ['蒲式耳'], dimension: 'volume', factor: 0.03636872, note: '1 bushel = 4 peck = 8 加仑 = 36.37 L（谷物标准；1 bushel 小麦约 27 kg）', system: 'imperial' },
  { name: 'firkin', aliases: ['小桶'], dimension: 'volume', factor: 0.04091481, note: '1 firkin = 9 英制加仑 = 40.9 L（啤酒/黄油标准桶）', system: 'imperial' },
  { name: 'kilderkin', aliases: ['中桶'], dimension: 'volume', factor: 0.08182962, note: '1 kilderkin = 2 firkin = 18 加仑 = 81.8 L', system: 'imperial' },
  { name: 'barrel_imperial', aliases: ['英制桶'], dimension: 'volume', factor: 0.16365924, note: '1 英制啤酒桶 = 36 加仑 = 163.7 L（**与石油桶不同**）', system: 'imperial' },
  { name: 'hogshead', aliases: ['大桶'], dimension: 'volume', factor: 0.238480942, note: '1 hogshead = 63 加仑 = 238.5 L（葡萄酒/烟草）', system: 'imperial' },
  { name: 'barrel_oil', aliases: ['石油桶', 'bbl'], dimension: 'volume', factor: 0.158987294928, note: '1 石油桶 = 42 美制加仑 = 158.99 L（行业专用，与英制桶无关）', system: 'us' },
]

/**
 * ## 英制面积
 */
export const IMPERIAL_AREA: UnitEntry[] = [
  { name: 'rood', aliases: ['路得'], dimension: 'area', factor: 1011.7141056, note: '1 rood = 1/4 acre = 40 rod² = 1011.7 m²', system: 'imperial' },
  { name: 'acre', aliases: ['英亩'], dimension: 'area', factor: 4046.8564224, note: '1 acre = 4840 yd² = 4046.9 m²（一队牛一天能耕）', system: 'imperial' },
  { name: 'hide', aliases: ['海得'], dimension: 'area', factor: 485623, note: '1 hide ≈ 120 acre（盎格鲁-撒克逊税基，实际 60–160 acre）', system: 'medieval' },
  { name: 'square_mile', aliases: ['平方英里'], dimension: 'area', factor: 2589988.110336, note: '1 平方英里 = 640 acre = 2.59 km²', system: 'imperial' },
]

/**
 * ## 英制工程单位（蒸汽朋克最核心的一批）
 *
 * 这些是**复合单位**，在公制里没有直接对应。
 */
export const IMPERIAL_ENGINEERING: UnitEntry[] = [
  /** 力。 */
  { name: 'poundal', aliases: ['磅达'], dimension: 'force', factor: 0.138254954376, note: '1 poundal = 1 lb·ft/s² = 0.1383 N（英制力的基本单位，F=ma 直接用）', system: 'imperial' },
  { name: 'lbf', aliases: ['pound_force', '磅力'], dimension: 'force', factor: 4.4482216152605, note: '1 lbf = 1 lb × g = 4.448 N（工程最常用）', system: 'imperial' },
  { name: 'kip', aliases: ['千磅力'], dimension: 'force', factor: 4448.2216152605, note: '1 kip = 1000 lbf = 4.448 kN（结构工程标准）', system: 'imperial' },
  { name: 'tonf_long', aliases: ['长吨力'], dimension: 'force', factor: 9964.0164181835, note: '1 长吨力 = 2240 lbf = 9.964 kN', system: 'imperial' },
  /** 压强。 */
  { name: 'psi', aliases: ['磅每平方英寸'], dimension: 'pressure', factor: 6894.757293168, note: '1 psi = 1 lbf/in² = 6.895 kPa（**锅炉压力的标准单位**）', system: 'imperial' },
  { name: 'ksi', aliases: ['千磅每平方英寸'], dimension: 'pressure', factor: 6894757.293168, note: '1 ksi = 1000 psi = 6.895 MPa（钢材强度）', system: 'imperial' },
  { name: 'in_hg', aliases: ['英寸汞柱'], dimension: 'pressure', factor: 3386.389, note: '1 inHg = 3.386 kPa（**真空度与蒸汽机冷凝器**；29.92 inHg = 1 atm）', system: 'imperial' },
  { name: 'mm_hg', aliases: ['毫米汞柱', 'torr'], dimension: 'pressure', factor: 133.322387415, note: '1 mmHg = 133.3 Pa = 1 torr', system: 'imperial' },
  { name: 'in_wc', aliases: ['英寸水柱'], dimension: 'pressure', factor: 249.08891, note: '1 inH₂O = 249.1 Pa（通风与低压差，蒸汽朋克的风箱/风道常用）', system: 'imperial' },
  /** 能量。 */
  { name: 'btu', aliases: ['BTU', '英热单位'], dimension: 'energy', factor: 1055.05585262, note: '1 BTU = 使 1 lb 水升温 1°F 的热量 = 1055 J（**锅炉与燃料的标准单位**）', system: 'imperial' },
  { name: 'therm', aliases: ['撒姆'], dimension: 'energy', factor: 105505585.262, note: '1 therm = 100000 BTU = 105.5 MJ（燃气计费单位）', system: 'imperial' },
  { name: 'ft_lbf', aliases: ['foot_pound', '英尺磅'], dimension: 'energy', factor: 1.3558179483314004, note: '1 ft·lbf = 1.3558 J（**扭矩与冲击功**；蒸汽锤规格以此计）', system: 'imperial' },
  { name: 'hp_hour', aliases: ['马力小时'], dimension: 'energy', factor: 2684519.5376962, note: '1 hp·h = 2.685 MJ', system: 'imperial' },
  /** 功率。 */
  { name: 'hp_boiler', aliases: ['锅炉马力'], dimension: 'power', factor: 9809.5, note: '1 锅炉马力 = 9809.5 W（蒸发 34.5 lb/h 水 @212°F；**蒸汽朋克最该用的功率单位**）', system: 'imperial' },
  { name: 'hp_mech', aliases: ['机械马力'], dimension: 'power', factor: 745.6998715823, note: '1 机械马力 = 550 ft·lbf/s = 745.7 W', system: 'imperial' },
  { name: 'btu_per_hour', aliases: ['BTU每小时'], dimension: 'power', factor: 0.29307107017, note: '1 BTU/h = 0.2931 W（暖气与制冷）', system: 'imperial' },
  { name: 'ton_refrigeration', aliases: ['冷吨'], dimension: 'power', factor: 3516.8528421, note: '1 冷吨 = 12000 BTU/h = 3.517 kW（制冷量）', system: 'imperial' },
  /** 速度。 */
  { name: 'fps', aliases: ['英尺每秒'], dimension: 'speed', factor: 0.3048, note: '1 fps = 0.3048 m/s（流体与机械速度）', system: 'imperial' },
  { name: 'fpm', aliases: ['英尺每分钟'], dimension: 'speed', factor: 0.00508, note: '1 fpm = 5.08 mm/s（通风风速）', system: 'imperial' },
  { name: 'mph', aliases: ['英里每小时'], dimension: 'speed', factor: 0.44704, note: '1 mph = 0.44704 m/s', system: 'imperial' },
  { name: 'knot', aliases: ['节'], dimension: 'speed', factor: 0.5144444444, note: '1 knot = 1 海里/h = 0.5144 m/s（航海）', system: 'imperial' },
  /** 流量（蒸汽朋克核心）。 */
  { name: 'gpm', aliases: ['加仑每分钟'], dimension: 'flow', factor: 0.0000630901964, note: '1 gpm（英制）= 6.309e-5 m³/s = 3.785 L/min（**泵与管路的标准**）', system: 'imperial' },
  { name: 'cfm', aliases: ['立方英尺每分钟'], dimension: 'flow', factor: 0.0004719474432, note: '1 cfm = 4.719e-4 m³/s = 28.32 L/min（**风机与通风标准**）', system: 'imperial' },
]

/**
 * ## 计数单位（各国习惯）
 */
export const COUNT_UNITS: UnitEntry[] = [
  { name: 'dozen', aliases: ['打', 'dz'], dimension: 'count', factor: 12, note: '1 打 = 12 个', system: 'count' },
  { name: 'score', aliases: ['廿'], dimension: 'count', factor: 20, note: '1 score = 20 个（圣经与林肯演说用）', system: 'count' },
  { name: 'gross', aliases: ['罗'], dimension: 'count', factor: 144, note: '1 罗 = 12 打 = 144 个', system: 'count' },
  { name: 'great_gross', aliases: ['大罗'], dimension: 'count', factor: 1728, note: '1 大罗 = 12 罗 = 1728 个', system: 'count' },
  { name: 'ream', aliases: ['令'], dimension: 'count', factor: 500, note: '1 令 = 500 张纸（旧制 480 张）', system: 'count' },
  { name: 'quire', aliases: ['刀'], dimension: 'count', factor: 25, note: '1 刀 = 25 张纸（1 令 = 20 刀）', system: 'count' },
  { name: 'brace', aliases: ['对'], dimension: 'count', factor: 2, note: '1 brace = 2 个（猎物计量）', system: 'count' },
  { name: 'myriad', aliases: ['万'], dimension: 'count', factor: 10000, note: '1 myriad = 10000（希腊语；中文「万」同值）', system: 'count' },
  { name: 'lakh', aliases: ['拉克'], dimension: 'count', factor: 100000, note: '1 lakh = 10 万（印度计数习惯）', system: 'count' },
  { name: 'crore', aliases: ['克罗'], dimension: 'count', factor: 10000000, note: '1 crore = 1000 万（印度计数习惯）', system: 'count' },
]

/**
 * ## 角度补全（航海与天文）
 */
export const ANGLE_UNITS_EXT: UnitEntry[] = [
  { name: 'compass_point', aliases: ['罗经点'], dimension: 'angle', factor: 0.1963495408, note: '1 罗经点 = 11.25° = π/16 rad（32 点罗盘）', system: 'angle' },
  { name: 'rumb', aliases: ['恒向线角'], dimension: 'angle', factor: 0.1963495408, note: '1 rumb = 1/32 圆周 = 11.25°（与罗经点同值）', system: 'angle' },
  { name: 'sextant', aliases: ['六分仪角'], dimension: 'angle', factor: 1.047197551, note: '1 sextant = 60° = π/3 rad', system: 'angle' },
  { name: 'quadrant_angle', aliases: ['象限角'], dimension: 'angle', factor: 1.570796327, note: '1 quadrant = 90° = π/2 rad', system: 'angle' },
]

/** 全部新增单位。 */
export const IMPERIAL_AND_MISC_UNITS: UnitEntry[] = [
  ...IMPERIAL_LENGTH,
  ...IMPERIAL_MASS,
  ...IMPERIAL_VOLUME,
  ...IMPERIAL_AREA,
  ...IMPERIAL_ENGINEERING,
  ...COUNT_UNITS,
  ...ANGLE_UNITS_EXT,
]
