/**
 * 度量单位数据：古今中外，尽量收全。
 *
 * ## 公制中转
 *
 * 每个单位都只声明「它等于多少**该量纲的公制基准单位**」（`factor`），
 * 换算于是变成 `value × 源factor ÷ 目标factor` 两步，任何两个单位都能互通。
 * 这样加一个单位只需一行数据，不需要和已有单位两两配对（那是 O(n²) 的维护地狱）。
 *
 * 基准单位见 `units.ts` 的 `BASE_UNIT`：长度 m、质量 kg、时间 s、面积 m²、
 * 体积 m³、能量 J、功率 W、温度 K、速度 m/s、压强 Pa，以及本模块新增量纲各自的基准。
 *
 * ## 为什么收这么多
 *
 * 作者写「这堵墙高三丈」「追了三十里地」「秤上三斤二两」时，
 * 换算系数全靠脑记 —— 记错一次就是一次事故（实测反馈里有 3~4 次因为这个中断重算）。
 * 收进表里，就把「记错数」变成「打错名」，后者一眼就能看出来。
 *
 * ## 收录原则
 *
 * · **不收需要上下文才能定的**（「一箭之地」「一盏茶工夫」）—— 猜就是错
 * · **同一名字在不同体系有歧义时，收常用那个并在 note 里标明另一体系**
 *   （加仑、担、石、马力都是这样）
 * · **历史单位标朝代/年代**——尺、斤、里的数值历代不同，这是事实，不是精度问题
 *
 * @module dsh-math-calculator/units-data
 */

import type { Dimension, UnitDef } from './units.js'

/**
 * SI 词头（十进制），从最大到最小。
 *
 * 用于批量生成 `km`/`cm`/`mm` 这类前缀单位，避免手写几十行同构数据。
 */
export const SI_PREFIXES: Array<[string, number]> = [
  ['Q', 1e30],   // quetta
  ['R', 1e27],   // ronna
  ['Y', 1e24],   // yotta
  ['Z', 1e21],   // zetta
  ['E', 1e18],   // exa
  ['P', 1e15],   // peta
  ['T', 1e12],   // tera
  ['G', 1e9],    // giga
  ['M', 1e6],    // mega
  ['k', 1e3],    // kilo
  ['h', 1e2],    // hecto
  ['da', 1e1],   // deca
  ['d', 1e-1],   // deci
  ['c', 1e-2],   // centi
  ['m', 1e-3],   // milli
  ['µ', 1e-6],   // micro（大写希腊字母 μ 与 U+00B5 都收）
  ['n', 1e-9],   // nano
  ['p', 1e-12],  // pico
  ['f', 1e-15],  // femto
  ['a', 1e-18],  // atto
  ['z', 1e-21],  // zepto
  ['y', 1e-24],  // yocto
]

/**
 * 用 SI 词头批量生成一组单位。
 *
 * @param base - 词头后面的单位符号（如 `'m'` → `km`/`cm`/`mm`）
 * @param dimension - 量纲
 * @param baseFactor - 该单位本身的公制等值（如 `'t'` 的 1000 kg）
 * @param aliasPrefix - 中文名前缀（如 `'千'\,`'厘'`），省略则不给中文别名
 * @returns 单位定义数组（含词头为 1 的那个基础单位）
 */

/**
 * 长度。
 *
 * 基准 m。收录：SI（含词头）、中国历代市制与古制、英制/美制、航海、
 * 天文、日/俄/印等地域单位、微观与专业单位。
 */
export const LENGTH_UNITS: UnitDef[] = [
  // ── 公制基本 ──
  { name: 'm', aliases: ['米', '公尺'], dimension: 'length', factor: 1, note: '基准单位' },
  { name: 'km', aliases: ['千米', '公里'], dimension: 'length', factor: 1e3 },

  // ── 中国市制（1929 年定制，现大陆通用）──
  { name: '里', dimension: 'length', factor: 500,
    note: '市里 = 500 m。古代差异极大：周制约 415 m、秦汉约 415 m、清制 576 m' },
  { name: '丈', dimension: 'length', factor: 3.2, note: '市丈 = 10 市尺 = 3.2 m' },
  { name: '尺', dimension: 'length', factor: 0.32,
    note: '市尺 ≈ 32 cm。历代不同：商制约 16 cm、汉制约 23 cm、明清营造尺约 32 cm' },
  { name: '寸', dimension: 'length', factor: 0.032, note: '市寸 = 1/10 市尺 ≈ 3.2 cm' },
  { name: '分', dimension: 'length', factor: 0.0032, note: '市分 = 1/10 市寸（注意与「分」作为质量/面积单位区分）' },
  { name: '厘', dimension: 'length', factor: 0.00032, note: '市厘 = 1/10 市分' },
  { name: '毫', dimension: 'length', factor: 0.000032, note: '市毫 = 1/10 市厘' },
  { name: '步', dimension: 'length', factor: 1.6,
    note: '古代一步 ≈ 5 尺 ≈ 1.6 m（「百步穿杨」约 160 m）。周制「步」为 8 尺' },
  { name: '舍', dimension: 'length', factor: 48000, note: '古代三十里为一舍（「退避三舍」= 九十里 ≈ 45 km，按市里）' },
  { name: '常', aliases: ['丈六'], dimension: 'length', factor: 4.8, note: '古代长度单位，一常 = 15 尺 ≈ 4.8 m' },
  { name: '引', dimension: 'length', factor: 3.2, note: '市政引 = 10 市丈 ≈ 32 m（另：宋代一引 = 10 丈）' },
  { name: '仞', dimension: 'length', factor: 1.6, note: '古七尺或八尺为一仞，取「万仞高山」量级约 1.6 m 每仞' },
  { name: '寻', dimension: 'length', factor: 1.6, note: '古八尺为一寻 ≈ 1.6 m（「千寻」为极言其深）' },
  { name: '轨', dimension: 'length', factor: 2.4, note: '古制车辙宽度相关的长度单位，约 8 尺' },
  { name: '跬', dimension: 'length', factor: 0.8, note: '古半步为一跬 ≈ 0.8 m（「不积跬步」）' },

  // ── 英制/美制 ──
  { name: 'mi', aliases: ['英里', 'mile'], dimension: 'length', factor: 1609.344, note: '国际英里 = 5280 ft = 1609.344 m' },
  { name: 'fur', aliases: ['弗隆', '浪'], dimension: 'length', factor: 201.168, note: '1 弗隆 = 1/8 英里 ≈ 201 m（赛马距离单位）' },
  { name: 'chain', aliases: ['链'], dimension: 'length', factor: 20.1168, note: '1 链 = 66 ft（测量用）' },
  { name: 'rd', aliases: ['杆', 'rod'], dimension: 'length', factor: 5.0292, note: '1 杆 = 16.5 ft' },
  { name: 'fathom', aliases: ['英寻', '拓'], dimension: 'length', factor: 1.8288, note: '1 英寻 = 6 ft ≈ 1.83 m，航海测深常用' },
  { name: 'yd', aliases: ['码', 'yard'], dimension: 'length', factor: 0.9144, note: '1 码 = 3 ft = 0.9144 m（国际码）' },
  { name: 'ft', aliases: ['英尺', 'foot', '呎'], dimension: 'length', factor: 0.3048, note: '国际英尺 = 0.3048 m。旧英制曾有微差' },
  { name: 'in', aliases: ['英寸', 'inch', '吋'], dimension: 'length', factor: 0.0254, note: '1 英寸 = 2.54 cm' },
  { name: 'hand', aliases: ['掌'], dimension: 'length', factor: 0.1016, note: '1 掌 = 4 英寸，量马高常用' },
  { name: 'barleycorn', aliases: ['大麦粒'], dimension: 'length', factor: 0.0084667, note: '1 大麦粒 = 1/3 英寸，鞋码来源' },

  // ── 航海与天文 ──
  { name: 'nmi', aliases: ['海里', '浬'], dimension: 'length', factor: 1852, note: '1 海里 = 1852 m（1 分纬度）' },
  { name: 'AU', aliases: ['天文单位'], dimension: 'length', factor: 1.495978707e11, note: '日地平均距离' },
  { name: 'ly', aliases: ['光年', 'lightyear'], dimension: 'length', factor: 9.4607304725808e15 },
  { name: 'pc', aliases: ['秒差距', 'parsec'], dimension: 'length', factor: 3.0856775814913673e16, note: '1 pc ≈ 3.26 ly' },
  { name: 'kpc', dimension: 'length', factor: 3.0856775814913673e19 },
  { name: 'Mpc', dimension: 'length', factor: 3.0856775814913673e22 },
  { name: 'Rearth', aliases: ['地球半径'], dimension: 'length', factor: 6.371e6 },
  { name: 'Rsun', aliases: ['太阳半径'], dimension: 'length', factor: 6.957e8 },
  { name: 'Ls', aliases: ['光秒'], dimension: 'length', factor: 299792458, note: '光在一秒内走的距离' },

  // ── 微观与专业 ──
  { name: 'Å', aliases: ['埃', 'angstrom'], dimension: 'length', factor: 1e-10, note: '1 Å = 0.1 nm，原子尺度' },
  { name: 'bohr', aliases: ['玻尔半径'], dimension: 'length', factor: 5.29177210903e-11 },

  // ── 其它地域/历史单位 ──
  { name: '日里', aliases: ['里日本', 'ri'], dimension: 'length', factor: 3927.27,
    note: '日本「里」约 3.927 km（36 町），与中国的 500 m 差 8 倍，写日式题材别混' },
  { name: '町', dimension: 'length', factor: 109.09, note: '日本「町」≈ 109 m（60 间）' },
  { name: 'verst', aliases: ['俄里'], dimension: 'length', factor: 1066.8, note: '俄里 ≈ 1066.8 m' },
  { name: 'kos', aliases: ['印度科斯'], dimension: 'length', factor: 3200, note: '印度古长度单位，约 3.2 km（地区差异大）' },
  { name: 'stadium', aliases: ['斯塔德'], dimension: 'length', factor: 185, note: '古希腊长度单位，约 185 m（≈ 1 古罗马 stadia）' },
  { name: 'league', aliases: ['里格'], dimension: 'length', factor: 4824.83, note: '1 里格 ≈ 3 英里 ≈ 4.8 km（陆地里格）' },
  { name: 'cubit', aliases: ['肘尺'], dimension: 'length', factor: 0.4572, note: '古埃及/圣经肘尺 ≈ 45.7 cm（各版本 44—53 cm）' },
  { name: 'span', aliases: ['拃'], dimension: 'length', factor: 0.2286, note: '1 拃 = 9 英寸 ≈ 23 cm（张开手指的长度）' },
  { name: 'pica', aliases: ['派卡'], dimension: 'length', factor: 0.0042333, note: '印刷用 1 派卡 = 12 点' },
  { name: 'typographic_point', aliases: ['磅值', 'pt_typ'], dimension: 'length', factor: 0.00035278, note: '印刷用 1 点 = 1/72 英寸' },
]


/**
 * 质量。
 *
 * 基准 kg。中国市制与古制、英制三套吨、金衡、药衡、日/俄等。
 */
export const MASS_UNITS: UnitDef[] = [
  // ── 公制 ──
  { name: 'kg', aliases: ['千克', '公斤'], dimension: 'mass', factor: 1, note: '基准单位' },
  { name: 't', aliases: ['吨', '公吨'], dimension: 'mass', factor: 1e3, note: '公制吨 = 1000 kg' },
  { name: 'g', aliases: ['克'], dimension: 'mass', factor: 1e-3 },

  // ── 中国市制 ──
  { name: '斤', dimension: 'mass', factor: 0.5,
    note: '市斤 = 500 g（10 两）。历代不同：秦汉一斤约 250 g，明清约 596 g' },
  { name: '两', dimension: 'mass', factor: 0.05, note: '市两 = 50 g（10 钱）' },
  { name: '钱', dimension: 'mass', factor: 0.005, note: '市钱 = 5 g（1/10 两）' },
  { name: '市分', aliases: ['分_质量'], dimension: 'mass', factor: 0.0005, note: '市分 = 0.5 g（1/10 钱）' },
  { name: '市厘', aliases: ['厘_质量'], dimension: 'mass', factor: 5e-5, note: '市厘 = 0.05 g' },
  { name: '担', dimension: 'mass', factor: 50,
    note: '市担 = 100 市斤 = 50 kg。注意：日语「担」是 60 kg，英制「hundredweight」别名也叫担' },
  { name: '石', dimension: 'mass', factor: 60,
    note: '容量/重量混用单位。此处按「一石米约 60 kg」估，历代差异极大（汉石约 30 kg、清石约 70 kg）' },
  { name: '市斗量', aliases: ['斗_质量'], dimension: 'mass', factor: 6, note: '按容量折米约 6 kg/斗（仅作粗估，优先用体积量纲）' },
  { name: '铢', dimension: 'mass', factor: 0.00065, note: '古制 1 两 = 24 铢 ≈ 0.65 g' },
  { name: '钧', dimension: 'mass', factor: 15, note: '古制三十斤为一钧 ≈ 15 kg（「千钧一发」）' },

  // ── 英制/美制：三种「吨」差 1.6%，写航海/蒸汽朋克会撞上 ──
  { name: 'longton', aliases: ['长吨', 'LT', 'gross ton', '载重吨'], dimension: 'mass', factor: 1016.0469088,
    note: '英制长吨 = 2240 磅 ≈ 1016 kg。航运「载重吨」用这个' },
  { name: 'shortton', aliases: ['短吨', 'ST', '净吨'], dimension: 'mass', factor: 907.18474,
    note: '美制短吨 = 2000 磅 ≈ 907 kg，比长吨小 1.6%' },
  { name: 'lb', aliases: ['磅', 'pound'], dimension: 'mass', factor: 0.45359237, note: '国际常衡磅 = 0.45359237 kg' },
  { name: 'oz', aliases: ['盎司'], dimension: 'mass', factor: 0.028349523125, note: '常衡盎司 = 1/16 磅（金衡盎司不同，见 ozt）' },
  { name: 'dr', aliases: ['打兰'], dimension: 'mass', factor: 0.0017718451953125, note: '常衡打兰 = 1/16 盎司' },
  { name: 'gr', aliases: ['格令'], dimension: 'mass', factor: 6.479891e-5, note: '1 格令 = 64.8 mg，药衡与弹道常用' },
  { name: 'cwt', aliases: ['英担'], dimension: 'mass', factor: 50.80234544,
    note: '英制英担 = 112 磅 ≈ 50.8 kg（美制英担 100 磅，差 12%）' },
  { name: 'stone', aliases: ['英石'], dimension: 'mass', factor: 6.35029318, note: '1 英石 = 14 磅（英国人量体重常用）' },
  { name: 'slug', dimension: 'mass', factor: 14.5939029372, note: '英制工程质量单位 ≈ 14.59 kg（1 lbf·s²/ft）' },

  // ── 金衡（贵金属）──
  { name: 'ozt', aliases: ['金衡盎司', 'troy ounce'], dimension: 'mass', factor: 0.0311034768,
    note: '金衡盎司 = 31.1035 g，比常衡盎司重 9.7%。黄金计价用这个' },
  { name: 'lbt', aliases: ['金衡磅'], dimension: 'mass', factor: 0.3732417216, note: '金衡磅 = 12 金衡盎司' },
  { name: 'dwt', aliases: ['便士重'], dimension: 'mass', factor: 0.00155517384, note: '1 便士重 = 24 格令，金衡用' },
  { name: 'carat', aliases: ['克拉'], dimension: 'mass', factor: 0.0002, note: '1 克拉 = 200 mg，宝石重量（与「K 金纯度」的 carat 两回事）' },

  // ── 药衡 ──
  { name: 'scruple', aliases: ['斯克鲁普尔'], dimension: 'mass', factor: 0.0012959782, note: '药衡 = 20 格令 ≈ 1.296 g' },
  { name: 'drachm', aliases: ['液量打兰'], dimension: 'mass', factor: 0.0038879346, note: '药衡打兰 = 60 格令 ≈ 3.888 g' },

  // ── 地域 ──
  { name: 'pood', aliases: ['普特'], dimension: 'mass', factor: 16.38, note: '俄制普特 ≈ 16.38 kg' },
  { name: 'kan', aliases: ['贯'], dimension: 'mass', factor: 3.75, note: '日本「贯」= 3.75 kg（古代东亚通用的「贯」则指铜钱重量）' },
  { name: 'kin', aliases: ['日本斤'], dimension: 'mass', factor: 0.6, note: '日本「斤」= 600 g，与中国市斤 500 g 不同' },

  // ── 天文/微观 ──
  { name: 'Mearth', aliases: ['地球质量'], dimension: 'mass', factor: 5.972e24 },
  { name: 'Msun', aliases: ['太阳质量'], dimension: 'mass', factor: 1.989e30 },
  { name: 'amu', aliases: ['原子质量单位', '道尔顿', 'Da'], dimension: 'mass', factor: 1.66053906660e-27 },
]


/**
 * 时间。
 *
 * 基准 s。含中国古制（刻/时辰/更/炷香）、佛家/道家时间、地质年代、天文周期。
 */
export const TIME_UNITS: UnitDef[] = [
  { name: 's', aliases: ['秒'], dimension: 'time', factor: 1, note: '基准单位' },
  { name: 'ms', aliases: ['毫秒'], dimension: 'time', factor: 1e-3 },
  { name: 'µs', aliases: ['微秒'], dimension: 'time', factor: 1e-6 },
  { name: 'ns', aliases: ['纳秒'], dimension: 'time', factor: 1e-9 },
  { name: 'min', aliases: ['分钟'], dimension: 'time', factor: 60 },
  { name: 'h', aliases: ['小时'], dimension: 'time', factor: 3600,
    note: '与普朗克常数 h 同名。单位换算语境下按小时理解' },

  // ── 中国古制 ──
  { name: '刻', dimension: 'time', factor: 900,
    note: '百刻制：一昼夜 100 刻，一刻 = 14.4 分钟。明清改为 96 刻，一刻 = 15 分钟' },
  { name: '时辰', dimension: 'time', factor: 7200, note: '十二时辰制，一个时辰 = 2 小时（子丑寅卯…）' },
  { name: '更', aliases: ['鼓'], dimension: 'time', factor: 7200, note: '一夜五更，每更约 2 小时（「三更半夜」约 23:00—01:00）' },
  { name: '点', dimension: 'time', factor: 1440, note: '古代报时单位，一昼夜 100 刻又分点，约 24 分钟/点（历制不同）' },
  { name: '炷香', aliases: ['一炷香'], dimension: 'time', factor: 1800,
    note: '约 30 分钟（无标准，说法 15—60 分钟）。写小说出现时建议改用明确数值' },
  { name: '盏茶', aliases: ['一盏茶'], dimension: 'time', factor: 600, note: '约 10 分钟（无标准）' },
  { name: '须臾', dimension: 'time', factor: 2880, note: '佛家计时：一昼夜 30 须臾，约 48 分钟' },
  { name: '弹指', dimension: 'time', factor: 7.2, note: '佛家：一须臾 20 弹指，约 7.2 秒' },
  { name: '刹那', dimension: 'time', factor: 0.018, note: '佛家：一弹指 60 刹那，约 18 毫秒（「刹那间」的实定量）' },
  { name: '甲子', aliases: ['一甲子'], dimension: 'time', factor: 1.89216e9, note: '干支纪年一轮 = 60 年' },

  // ── 日/月/年 ──
  { name: 'day', aliases: ['天', '昼夜'], dimension: 'time', factor: 86400 },
  { name: 'week', aliases: ['周', '星期'], dimension: 'time', factor: 604800 },
  { name: 'fortnight', aliases: ['双周'], dimension: 'time', factor: 1209600, note: '1 双周 = 14 天（英式用法）' },
  { name: 'month', aliases: ['月'], dimension: 'time', factor: 2.629746e6,
    note: '平均月 = 30.4368 天（365.2425/12）。各月不等，硬算时用天数更准' },
  { name: 'year', aliases: ['年'], dimension: 'time', factor: 3.15576e7, note: '儒略年 = 365.25 天（天文惯用）' },
  { name: 'year_trop', aliases: ['回归年', '太阳年'], dimension: 'time', factor: 3.1556926e7, note: '回归年 = 365.2422 天（历法用）' },
  { name: 'decade', aliases: ['十年'], dimension: 'time', factor: 3.15576e8 },
  { name: 'century', aliases: ['世纪'], dimension: 'time', factor: 3.15576e9 },
  { name: 'Gyr', aliases: ['十亿年'], dimension: 'time', factor: 3.15576e16 },
  { name: 'Myr', aliases: ['百万年'], dimension: 'time', factor: 3.15576e13 },

  // ── 天文与物理 ──
  { name: 'sidereal_day', aliases: ['恒星日'], dimension: 'time', factor: 86164.0905, note: '恒星日 = 23h56m4s，比太阳日短约 4 分钟' },
  { name: 'yr_galactic', aliases: ['银河年'], dimension: 'time', factor: 7.2e15, note: '太阳绕银心一周约 2.3 亿年' },
]


/**
 * 面积。
 *
 * 基准 m²。中国市制亩/顷（各地亩不同）、英制 acre/rood、日本町/反步。
 */
export const AREA_UNITS: UnitDef[] = [
  { name: 'm²', aliases: ['平方米', '平米'], dimension: 'area', factor: 1, note: '基准单位' },
  { name: 'km²', aliases: ['平方千米', '平方公里'], dimension: 'area', factor: 1e6 },
  { name: 'cm²', aliases: ['平方厘米'], dimension: 'area', factor: 1e-4 },
  { name: 'mm²', aliases: ['平方毫米'], dimension: 'area', factor: 1e-6 },
  { name: 'ha', aliases: ['公顷'], dimension: 'area', factor: 1e4, note: '1 公顷 = 10000 m² = 15 市亩' },

  // ── 中国市制 ──
  { name: '亩', dimension: 'area', factor: 666.6666666666666,
    note: '市亩 ≈ 666.7 m²（15 亩 = 1 公顷）。东北 1 亩 = 1000 m²，南方部分地亩更小' },
  { name: '顷', dimension: 'area', factor: 66666.66666666667, note: '市顷 = 100 市亩 ≈ 6.67 ha' },
  { name: '市分面积', aliases: ['分_面积'], dimension: 'area', factor: 66.66666666666666, note: '市分 = 1/10 市亩' },
  { name: '市厘面积', aliases: ['厘_面积'], dimension: 'area', factor: 6.666666666666666, note: '市厘 = 1/10 市分' },
  { name: '平方丈', dimension: 'area', factor: 10.24, note: '1 平方丈 = 100 平方尺 ≈ 10.24 m²' },
  { name: '平方尺', dimension: 'area', factor: 0.1024, note: '1 平方尺 ≈ 0.1024 m²' },

  // ── 英制/美制 ──
  { name: 'acre', aliases: ['英亩'], dimension: 'area', factor: 4046.8564224, note: '1 英亩 = 43560 ft² ≈ 4046.9 m² ≈ 6.07 市亩' },
  { name: 'rood', aliases: ['路德'], dimension: 'area', factor: 1011.7141056, note: '1 路德 = 1/4 英亩' },
  { name: 'sqft', aliases: ['平方英尺'], dimension: 'area', factor: 0.09290304 },
  { name: 'sqin', aliases: ['平方英寸'], dimension: 'area', factor: 0.00064516 },
  { name: 'sqyd', aliases: ['平方码'], dimension: 'area', factor: 0.83612736 },
  { name: 'sqmi', aliases: ['平方英里'], dimension: 'area', factor: 2589988.110336 },
  { name: 'section', aliases: ['平方英里区'], dimension: 'area', factor: 2589988.110336, note: '美国土地测量 1 section = 1 平方英里 = 640 英亩' },
  { name: 'township', aliases: ['镇区'], dimension: 'area', factor: 93239571.97, note: '美国测量单位 = 36 sections ≈ 93.2 km²' },

  // ── 日本 ──
  { name: '日町', aliases: ['町_面积'], dimension: 'area', factor: 9917.36, note: '日本「町」≈ 9917 m²（约 0.99 ha），与长度「町」同字不同量纲' },
  { name: '反', aliases: ['段'], dimension: 'area', factor: 992.05, note: '日本「反」= 10 亩（日制）≈ 992 m²' },
  { name: '坪', aliases: ['日坪', 'tsubo'], dimension: 'area', factor: 3.305785,
    note: '日本房产面积基本单位 ≈ 3.306 m²（两张榻榻米）。台湾「坪」同一数值' },
  { name: '畳', aliases: ['叠', '榻榻米'], dimension: 'area', factor: 1.62, note: '一张榻榻米 ≈ 1.62 m²（各地规格略差）' },

  // ── 其它 ──
  { name: 'barn', aliases: ['靶恩'], dimension: 'area', factor: 1e-28, note: '核物理截面单位 = 1e-28 m²' },
]


/**
 * 体积。
 *
 * 基准 m³。中国市制（斗/升/石）、英制美制（加仑三种！）、
 * 烹饪量（杯/勺/茶匙）、酒桶、日本（合/升/石）。
 *
 * ⚠ 体积是歧义最多的量纲：加仑（美/英差 20%）、盎司（液量/常衡）、
 * 夸脱、品脱都分英美两制。表里默认收**美制**并在 note 标明英制差异。
 */
export const VOLUME_UNITS: UnitDef[] = [
  { name: 'm³', aliases: ['立方米', '方'], dimension: 'volume', factor: 1, note: '基准单位' },
  { name: 'cm³', aliases: ['立方厘米', 'cc'], dimension: 'volume', factor: 1e-6 },
  { name: 'mm³', aliases: ['立方毫米'], dimension: 'volume', factor: 1e-9 },
  { name: 'L', aliases: ['升', '公升'], dimension: 'volume', factor: 0.001, note: '1 L = 1 dm³ = 0.001 m³' },
  { name: 'mL', aliases: ['毫升'], dimension: 'volume', factor: 1e-6 },
  { name: 'dL', aliases: ['分升'], dimension: 'volume', factor: 1e-4 },
  { name: 'hL', aliases: ['百升'], dimension: 'volume', factor: 0.1 },

  // ── 中国市制与古制 ──
  { name: '斗', dimension: 'volume', factor: 0.01,
    note: '市斗 = 10 市升 = 0.01 m³（约 10 L）。古代一斗约 2—20 L，差异极大' },
  { name: '市升', aliases: ['升_体积'], dimension: 'volume', factor: 0.001, note: '市升 = 1 市斗的 1/10 = 1 L' },
  { name: '市合', aliases: ['合_体积'], dimension: 'volume', factor: 0.0001, note: '市合 = 1/10 市升 ≈ 100 mL' },
  { name: '市石量', aliases: ['石_体积'], dimension: 'volume', factor: 0.1, note: '市石 = 10 市斗 = 0.1 m³（约 100 L）' },
  { name: '斛', dimension: 'volume', factor: 0.05, note: '古制十斗为一斛，按市制约 50 L' },
  { name: '钟', dimension: 'volume', factor: 0.64, note: '古齐制四升为豆、十豆为区、四区为釜、十釜为钟，约 640 L（说法不一）' },

  // ── 英制/美制 ──
  { name: 'gal', aliases: ['加仑'],
    dimension: 'volume', factor: 0.003785411784,
    note: '**美制加仑** = 3.785 L。英制加仑 = 4.546 L，差 20%。写英国题材要用 gal_uk' },
  { name: 'gal_uk', aliases: ['英制加仑', 'imperial gallon'], dimension: 'volume', factor: 0.00454609,
    note: '英制加仑 = 4.546 L，比美制大 20%' },
  { name: 'qt', aliases: ['夸脱'], dimension: 'volume', factor: 0.000946352946, note: '美制夸脱 = 1/4 加仑 ≈ 0.946 L（英制 1.136 L）' },
  { name: 'pt', aliases: ['品脱'], dimension: 'volume', factor: 0.000473176473, note: '美制品脱 = 1/8 加仑 ≈ 0.473 L（英制品脱 0.568 L）' },
  { name: 'cup', aliases: ['杯'], dimension: 'volume', factor: 0.0002365882365, note: '美制烹饪杯 = 8 fl oz ≈ 236.6 mL' },
  { name: 'floz', aliases: ['液量盎司'], dimension: 'volume', factor: 2.95735295625e-5,
    note: '美制液量盎司 ≈ 29.57 mL（与重量「盎司」28.35 g 不同）' },
  { name: 'tbsp', aliases: ['汤匙', '大勺'], dimension: 'volume', factor: 1.478676478125e-5, note: '美制汤匙 = 1/2 fl oz ≈ 14.79 mL' },
  { name: 'tsp', aliases: ['茶匙', '小勺'], dimension: 'volume', factor: 4.92892159375e-6, note: '美制茶匙 = 1/3 汤匙 ≈ 4.93 mL' },
  { name: 'bbl', aliases: ['桶'], dimension: 'volume', factor: 0.158987294928,
    note: '石油 1 桶 = 42 美制加仑 ≈ 159 L（啤酒桶、英制桶都不同）' },
  { name: 'bu', aliases: ['蒲式耳'], dimension: 'volume', factor: 0.03523907016688, note: '美制蒲式耳 ≈ 35.24 L（英制 36.37 L）' },
  { name: 'pk', aliases: ['配克'], dimension: 'volume', factor: 0.00880976754172, note: '1 配克 = 1/4 蒲式耳 ≈ 8.81 L' },
  { name: 'gill', aliases: ['及尔'], dimension: 'volume', factor: 0.00011829411825, note: '1 及尔 = 1/4 品脱 ≈ 118 mL（烈酒计量）' },
  { name: 'boardfoot', aliases: ['板尺'], dimension: 'volume', factor: 0.002359737216, note: '木材计量 = 1 ft × 1 ft × 1 in ≈ 2.36 L' },
  { name: 'cord', aliases: ['考得'], dimension: 'volume', factor: 3.624556363776, note: '劈柴堆体积 = 128 ft³ ≈ 3.62 m³' },

  // ── 日本 ──
  { name: '日合', aliases: ['合'], dimension: 'volume', factor: 0.00018039, note: '日本「合」≈ 180.4 mL（1/10 日升，量米常用）' },
  { name: '日升', aliases: ['升_日'], dimension: 'volume', factor: 0.0018039, note: '日本「升」≈ 1.804 L，与中国市升 1 L 不同' },
  { name: '日石', aliases: ['石_日', 'koku'], dimension: 'volume', factor: 0.18039,
    note: '日本「石」（koku）≈ 180.4 L，是江户时代俸禄单位（「一万石大名」）' },
]


/**
 * 能量。
 *
 * 基准 J。含营养学卡路里、英制 BTU/therm、化石燃料（吨油当量/吨煤当量）、
 * 火药与核武当量、以及家常能源计量（度、方气）。
 */
export const ENERGY_UNITS: UnitDef[] = [
  { name: 'J', aliases: ['焦耳'], dimension: 'energy', factor: 1, note: '基准单位' },
  { name: 'kJ', aliases: ['千焦'], dimension: 'energy', factor: 1e3 },
  { name: 'MJ', aliases: ['兆焦'], dimension: 'energy', factor: 1e6 },
  { name: 'GJ', aliases: ['吉焦'], dimension: 'energy', factor: 1e9 },
  { name: 'TJ', aliases: ['太焦'], dimension: 'energy', factor: 1e12 },
  { name: 'PJ', aliases: ['拍焦'], dimension: 'energy', factor: 1e15 },
  { name: 'EJ', aliases: ['艾焦'], dimension: 'energy', factor: 1e18 },

  // ── 电与家常 ──
  { name: 'kWh', aliases: ['度电', '千瓦时'], dimension: 'energy', factor: 3.6e6, note: '一度电 = 3.6 MJ，电费计价单位。口语「度」更常指电能，但「度」作为别名已归角度' },
  { name: 'MWh', aliases: ['兆瓦时'], dimension: 'energy', factor: 3.6e9 },
  { name: 'GWh', aliases: ['吉瓦时'], dimension: 'energy', factor: 3.6e12 },
  { name: 'TWh', aliases: ['太瓦时'], dimension: 'energy', factor: 3.6e15, note: '国家级年发电量常用' },

  // ── 热 ──
  { name: 'cal', aliases: ['卡', '卡路里'], dimension: 'energy', factor: 4.184, note: '1 卡 = 4.184 J（把 1 g 水升温 1 ℃）' },
  { name: 'kcal', aliases: ['大卡', '千卡'], dimension: 'energy', factor: 4184,
    note: '营养学说的「卡路里」其实是大卡。1 kcal = 4184 J' },
  { name: 'BTU', aliases: ['英热单位', 'btu'], dimension: 'energy', factor: 1055.05585262,
    note: '英热单位 ≈ 1055 J。实测反馈里它被手打过 8+ 次（1260000 BTU/磅 这类）' },
  { name: 'therm', aliases: ['色姆'], dimension: 'energy', factor: 1.05434184e8, note: '1 therm = 100000 BTU（天然气计价）' },
  { name: 'quad', aliases: ['夸德'], dimension: 'energy', factor: 1.05505585e18, note: '1 quad = 10^15 BTU，美国能源统计用' },

  // ── 燃料与大尺度 ──
  { name: 'toe', aliases: ['吨油当量'], dimension: 'energy', factor: 4.1868e10, note: '1 吨石油当量 = 41.87 GJ，能源统计标准单位' },
  { name: 'tce', aliases: ['吨煤当量'], dimension: 'energy', factor: 2.93076e10, note: '1 吨标准煤当量 = 29.31 GJ（中国统计口径）' },
  { name: 'tTNT', aliases: ['吨TNT'], dimension: 'energy', factor: 4.184e9, note: '1 吨 TNT 当量 = 4.184 GJ' },
  { name: 'ktTNT', aliases: ['千吨TNT'], dimension: 'energy', factor: 4.184e12, note: '战术核武量级' },
  { name: 'MtTNT', aliases: ['百万吨TNT', 'megaton'], dimension: 'energy', factor: 4.184e15, note: '战略核武量级（沙皇炸弹约 50 Mt）' },
  { name: 'GtTNT', aliases: ['十亿吨TNT'], dimension: 'energy', factor: 4.184e18, note: '超级火山与陨击量级' },

  // ── 微观 ──
  { name: 'eV', aliases: ['电子伏'], dimension: 'energy', factor: 1.602176634e-19 },
  { name: 'keV', aliases: ['千电子伏'], dimension: 'energy', factor: 1.602176634e-16 },
  { name: 'MeV', aliases: ['兆电子伏'], dimension: 'energy', factor: 1.602176634e-13 },
  { name: 'GeV', aliases: ['吉电子伏'], dimension: 'energy', factor: 1.602176634e-10 },
  { name: 'TeV', aliases: ['太电子伏'], dimension: 'energy', factor: 1.602176634e-7 },
  { name: 'Ry', aliases: ['里德伯'], dimension: 'energy', factor: 2.1798723611035e-18, note: '里德伯能量 ≈ 13.6 eV，氢原子电离能' },
  { name: 'hartree', aliases: ['哈特里'], dimension: 'energy', factor: 4.3597447222071e-18, note: '原子单位制能量基准 ≈ 27.2 eV' },
  { name: 'eVperBond', aliases: ['每键电子伏'], dimension: 'energy', factor: 1.602176634e-19, note: '化学键能量常用口径' },

  // ── 其它 ──
  { name: 'erg', aliases: ['尔格'], dimension: 'energy', factor: 1e-7, note: 'CGS 制能量单位 = 1e-7 J' },
  { name: 'Ryd', dimension: 'energy', factor: 2.1798723611035e-18, note: '同 Ry，兼容写法' },
  { name: 'foe', aliases: ['foe_energy'], dimension: 'energy', factor: 1e44,
    note: '超新星能量单位，1 foe = 10^44 J（"Fifty-One Erg" 的缩写）' },
]

/**
 * 功率。
 *
 * 基准 W。含马力两套（英制 745.7 / 公制 735）、制冷吨、
 * 人力畜力（写古代题材最需要）、以及天体量级（太阳光度）。
 */
export const POWER_UNITS: UnitDef[] = [
  { name: 'W', aliases: ['瓦', '瓦特'], dimension: 'power', factor: 1, note: '基准单位' },
  { name: 'kW', aliases: ['千瓦'], dimension: 'power', factor: 1e3 },
  { name: 'MW', aliases: ['兆瓦'], dimension: 'power', factor: 1e6 },
  { name: 'GW', aliases: ['吉瓦'], dimension: 'power', factor: 1e9 },
  { name: 'TW', aliases: ['太瓦'], dimension: 'power', factor: 1e12 },
  { name: 'PW', aliases: ['拍瓦'], dimension: 'power', factor: 1e15 },

  // ── 马力：两套差 1.4%，写车/机械题材会撞上 ──
  { name: 'hp', aliases: ['马力', '英制马力'], dimension: 'power', factor: 745.6998715822702,
    note: '英制机械马力 = 550 ft·lbf/s ≈ 745.7 W' },
  { name: 'hp_metric', aliases: ['公制马力', 'PS'], dimension: 'power', factor: 735.49875,
    note: '公制马力 = 735 W，比英制小 1.4%。欧洲车用 PS 标注' },
  { name: 'hp_boiler', aliases: ['锅炉马力'], dimension: 'power', factor: 9809.5, note: '锅炉马力 ≈ 9.81 kW，蒸汽设备铭牌用' },
  { name: 'hp_electric', aliases: ['电马力'], dimension: 'power', factor: 746, note: '电马力 = 746 W（电机铭牌）' },

  { name: 'ftlb', aliases: ['ft·lbf/s', '英尺磅每秒'], dimension: 'power', factor: 1.3558179483314004, note: '1 ft·lbf/s ≈ 1.356 W' },
  { name: 'ton_refrig', aliases: ['冷吨', 'RT'], dimension: 'power', factor: 3516.8528420667,
    note: '制冷吨 ≈ 3.517 kW（空调冷量常用，与重量「吨」无关）' },
  { name: 'cal_per_s', aliases: ['卡每秒'], dimension: 'power', factor: 4.184 },

  // ── 人力畜力（古代/工程题材的核心）──
  { name: '人', aliases: ['人力', '人力持续'], dimension: 'power', factor: 75,
    note: '一个成年人**持续**体力输出约 75 W（几小时尺度）。短时爆发可到 1000 W' },
  { name: '人峰值', aliases: ['人力爆发'], dimension: 'power', factor: 1000, note: '成年人短时（几十秒）爆发功率量级' },
  { name: '畜', aliases: ['畜力', '一畜'], dimension: 'power', factor: 500,
    note: '一头役畜（牛/马）**持续**输出约 500 W' },
  { name: '马持续', dimension: 'power', factor: 735, note: '一匹马持续工作约 0.7—1 马力' },

  // ── 天体与声学 ──
  { name: 'Lsun', aliases: ['太阳光度'], dimension: 'power', factor: 3.828e26, note: '太阳总辐射功率 ≈ 3.83e26 W' },
  { name: 'erg_per_s', aliases: ['尔格每秒'], dimension: 'power', factor: 1e-7 },
]


/**
 * 温度、速度、压强，以及本模块新增的几个量纲。
 *
 * ## 温度为什么特殊
 *
 * 温度是**仿射**变换（`K = °C + 273.15`），不是比例。
 * 表里的 `factor` 只表示「每 1 单位等于多少 K 的**间隔**」，
 * 实际换算由 `units.ts` 的 `convert()` 用专门分支处理偏移。
 * 只收三种有偏移的温标 + 一种无偏移的（K）。列氏/兰氏也收了，方便历史文本。
 */
export const TEMPERATURE_UNITS: UnitDef[] = [
  { name: 'K', aliases: ['开尔文'], dimension: 'temperature', factor: 1, note: '基准单位，无偏移' },
  { name: '°C', aliases: ['℃', '摄氏度', '摄氏'], dimension: 'temperature', factor: 1, note: 'K = °C + 273.15' },
  { name: '°F', aliases: ['℉', '华氏度', '华氏'], dimension: 'temperature', factor: 5 / 9, note: 'K = (°F + 459.67) × 5/9' },
  { name: '°R', aliases: ['兰氏度', 'Rankine'], dimension: 'temperature', factor: 5 / 9, note: '兰氏度：绝对温标，°R = K × 9/5，无偏移（0 °R = 绝对零度）' },
  { name: '°Ré', aliases: ['列氏度', 'Reaumur'], dimension: 'temperature', factor: 1.25, note: '列氏度：0 °Ré = 0 °C，80 °Ré = 100 °C（旧欧洲常用）' },
]

/**
 * 速度。
 *
 * 基准 m/s。含航海（节）、航空（马赫两套基准）、
 * 古代表述（「日行百里」拆成速度）、以及天体量级。
 */
export const SPEED_UNITS: UnitDef[] = [
  { name: 'm/s', aliases: ['米每秒'], dimension: 'speed', factor: 1, note: '基准单位' },
  { name: 'km/h', aliases: ['公里每小时', '迈'], dimension: 'speed', factor: 1 / 3.6,
    note: '1 km/h = 0.2778 m/s。中文口语「迈」常指 km/h（也说 mph，注意歧义）' },
  { name: 'mph', aliases: ['英里每小时'], dimension: 'speed', factor: 0.44704, note: '1 mph = 1.609 km/h' },
  { name: 'kn', aliases: ['节', 'knot'], dimension: 'speed', factor: 0.514444,
    note: '1 节 = 1 海里/小时 ≈ 0.514 m/s。航海与航空通用' },
  { name: 'mach', aliases: ['马赫'], dimension: 'speed', factor: 340.29,
    note: '按海平面 15°C 声速折算。高空声速更低（约 0.8 倍），写高空场景要打折' },
  { name: 'mach_high', aliases: ['高空马赫'], dimension: 'speed', factor: 250, note: '平流层声速约 250 m/s' },
  { name: 'ft/s', aliases: ['英尺每秒'], dimension: 'speed', factor: 0.3048 },
  { name: 'fpm', aliases: ['英尺每分钟'], dimension: 'speed', factor: 0.00508, note: '通风与升降速度常用' },
  { name: 'c', aliases: ['光速'], dimension: 'speed', factor: 299792458, note: '真空光速，精确值' },
  { name: '日行里', aliases: ['一天走里'], dimension: 'speed', factor: 0.005787,
    note: '「日行百里」≈ 50 km/天 ≈ 0.0058 m/s。古人赶路速度的真实量级' },
  { name: '日行里快', aliases: ['驿马日行'], dimension: 'speed', factor: 0.01736,
    note: '驿站换马疾驰约 300 里/天 ≈ 150 km/天' },
]

/**
 * 压强。
 *
 * 基准 Pa。含工程（psi/bar）、气象（hPa/atm）、医学（mmHg）、真空（Torr）、
 * 以及水柱/汞柱高度这类「用液柱高表示压强」的写法。
 */
export const PRESSURE_UNITS: UnitDef[] = [
  { name: 'Pa', aliases: ['帕', '帕斯卡'], dimension: 'pressure', factor: 1, note: '基准单位' },
  { name: 'kPa', aliases: ['千帕'], dimension: 'pressure', factor: 1e3 },
  { name: 'MPa', aliases: ['兆帕'], dimension: 'pressure', factor: 1e6 },
  { name: 'GPa', aliases: ['吉帕'], dimension: 'pressure', factor: 1e9, note: '材料强度常用（钢铁屈服强度量级）' },
  { name: 'hPa', aliases: ['百帕'], dimension: 'pressure', factor: 100, note: '气象常用，海平面约 1013 hPa' },
  { name: 'bar', aliases: ['巴'], dimension: 'pressure', factor: 1e5, note: '1 bar = 100 kPa ≈ 1 个大气压' },
  { name: 'mbar', aliases: ['毫巴'], dimension: 'pressure', factor: 100, note: '气象旧制，与 hPa 等值' },
  { name: 'atm', aliases: ['大气压', '标准大气压'], dimension: 'pressure', factor: 101325, note: '海平面标准大气压 = 101325 Pa' },
  { name: 'psi', aliases: ['磅每平方英寸'], dimension: 'pressure', factor: 6894.757293168,
    note: '1 psi ≈ 6.895 kPa。英制工程常用，与 bar 差 14.5 倍' },
  { name: 'ksi', aliases: ['千磅每平方英寸'], dimension: 'pressure', factor: 6894757.293168, note: '材料强度英制常用' },
  { name: 'mmHg', aliases: ['毫米汞柱'], dimension: 'pressure', factor: 133.322387415,
    note: '1 mmHg ≈ 133.3 Pa。医学血压常用；760 mmHg = 1 atm' },
  { name: 'cmHg', aliases: ['厘米汞柱'], dimension: 'pressure', factor: 1333.22387415 },
  { name: 'Torr', aliases: ['托', 'mmHg_torr'], dimension: 'pressure', factor: 133.32236842105263, note: '与 mmHg 差 0.000014%，工程上可视为同一个' },
  { name: 'inHg', aliases: ['英寸汞柱'], dimension: 'pressure', factor: 3386.389, note: '英制气压常用（美国气象约 29.92 inHg）' },
  { name: 'mH2O', aliases: ['米水柱'], dimension: 'pressure', factor: 9806.65,
    note: '1 m 水柱 ≈ 9.81 kPa。水利与给排水常用，写「水位深十米」时的压强' },
  { name: 'cmH2O', aliases: ['厘米水柱'], dimension: 'pressure', factor: 98.0665, note: '呼吸机与通风常用' },

  // ── 工程与古代 ──
  { name: 'kgf/cm²', aliases: ['工程大气压', 'at'], dimension: 'pressure', factor: 98066.5,
    note: '1 kgf/cm² ≈ 98.07 kPa（旧工程制，与 atm 差 3%）' },
  { name: 'kgf/mm²', aliases: [], dimension: 'pressure', factor: 9806650 },
  { name: 'Ba', aliases: ['巴（CGS）'], dimension: 'pressure', factor: 1e-5, note: 'CGS 制压强单位 = 1 dyn/cm²（与 bar 的「巴」同名但差 10 个量级）' },
]


/**
 * 本模块新增的量纲。
 *
 * 原表只有 10 个量纲（长/质/时/面/体/能/功/温/速/压）。写小说时还会撞上：
 * 数据量（「这段代码多大」）、角度（「转三十度」）、力（「拉弓要多少牛」）、
 * 频率（「一秒几次」）。
 *
 * 这些量纲的**基准单位也是公制 SI**，所以「公制中转」对它们同样成立。
 */

/** 数据量（十进制与二进制两套并存，差 2.4%~7%，是企业价目表最常见的坑）。 */
export const DATA_UNITS: UnitDef[] = [
  { name: 'bit', aliases: ['比特', '位'], dimension: 'data', factor: 1, note: '基准单位' },
  { name: 'B', aliases: ['字节', 'byte'], dimension: 'data', factor: 8, note: '1 字节 = 8 bit' },
  { name: 'kB', aliases: ['千字节'], dimension: 'data', factor: 8e3, note: '**十进制** 1 kB = 1000 B（存储厂商口径）' },
  { name: 'MB', aliases: ['兆字节'], dimension: 'data', factor: 8e6 },
  { name: 'GB', aliases: ['吉字节'], dimension: 'data', factor: 8e9 },
  { name: 'TB', aliases: ['太字节'], dimension: 'data', factor: 8e12 },
  { name: 'PB', aliases: ['拍字节'], dimension: 'data', factor: 8e15 },
  { name: 'EB', aliases: ['艾字节'], dimension: 'data', factor: 8e18 },
  { name: 'KiB', aliases: ['千二进制字节'], dimension: 'data', factor: 8 * 1024, note: '**二进制** 1 KiB = 1024 B（操作系统口径）' },
  { name: 'MiB', aliases: ['兆二进制字节'], dimension: 'data', factor: 8 * 1024 ** 2 },
  { name: 'GiB', aliases: ['吉二进制字节'], dimension: 'data', factor: 8 * 1024 ** 3 },
  { name: 'TiB', aliases: ['太二进制字节'], dimension: 'data', factor: 8 * 1024 ** 4 },
  { name: 'kbit', aliases: ['千比特'], dimension: 'data', factor: 1e3, note: '网络带宽用十进制 bit（「100M 宽带」是 100 Mbit/s）' },
  { name: 'Mbit', aliases: ['兆比特'], dimension: 'data', factor: 1e6 },
  { name: 'Gbit', aliases: ['吉比特'], dimension: 'data', factor: 1e9 },
]

/** 平面角。基准 rad（弧度）。 */
export const ANGLE_UNITS: UnitDef[] = [
  { name: 'rad', aliases: ['弧度'], dimension: 'angle', factor: 1, note: '基准单位' },
  { name: 'deg', aliases: ['度', '°'], dimension: 'angle', factor: Math.PI / 180,
    note: '1° = π/180 rad。别名「度」优先归角度；电能的口语「度」请写「度电」或 kWh' },
  { name: 'arcmin', aliases: ['角分', '′'], dimension: 'angle', factor: Math.PI / 10800, note: '1 角分 = 1/60 度' },
  { name: 'arcsec', aliases: ['角秒', '″'], dimension: 'angle', factor: Math.PI / 648000, note: '1 角秒 = 1/60 角分。天文测角常用' },
  { name: 'grad', aliases: ['百分度', 'gon'], dimension: 'angle', factor: Math.PI / 200, note: '1 百分度 = 0.9°，测量学用' },
  { name: 'turn', aliases: ['周角', '圈'], dimension: 'angle', factor: 2 * Math.PI, note: '1 圈 = 360° = 2π rad' },
  { name: 'mil', aliases: ['密位'], dimension: 'angle', factor: 2 * Math.PI / 6400,
    note: '军用密位：一周 6400 密位（俄制 6000）。炮击与狙击测距常用' },
]

/** 力。基准 N。 */
export const FORCE_UNITS: UnitDef[] = [
  { name: 'N', aliases: ['牛顿'], dimension: 'force', factor: 1, note: '基准单位' },
  { name: 'kN', aliases: ['千牛'], dimension: 'force', factor: 1e3 },
  { name: 'MN', aliases: ['兆牛'], dimension: 'force', factor: 1e6, note: '火箭推力与建筑荷载常用量级' },
  { name: 'dyn', aliases: ['达因'], dimension: 'force', factor: 1e-5, note: 'CGS 制力单位 = 1e-5 N' },
  { name: 'kgf', aliases: ['千克力', '公斤力'], dimension: 'force', factor: 9.80665, note: '1 kgf = 9.80665 N（1 kg 重量）' },
  { name: 'lbf', aliases: ['磅力'], dimension: 'force', factor: 4.4482216152605, note: '1 lbf ≈ 4.448 N' },
  { name: 'tonf', aliases: ['吨力'], dimension: 'force', factor: 9806.65, note: '1 吨力 = 1000 kgf ≈ 9.81 kN' },
  { name: 'kip', aliases: ['千磅力'], dimension: 'force', factor: 4448.2216152605, note: '美制结构工程常用（1000 lbf）' },
]

/** 频率（次要但常用）。基准 Hz。 */
export const FREQUENCY_UNITS: UnitDef[] = [
  { name: 'Hz', aliases: ['赫兹'], dimension: 'frequency', factor: 1, note: '基准单位：每秒一次' },
  { name: 'kHz', aliases: ['千赫'], dimension: 'frequency', factor: 1e3 },
  { name: 'MHz', aliases: ['兆赫'], dimension: 'frequency', factor: 1e6 },
  { name: 'GHz', aliases: ['吉赫'], dimension: 'frequency', factor: 1e9 },
  { name: 'rpm', aliases: ['转每分'], dimension: 'frequency', factor: 1 / 60, note: '1 rpm = 1/60 Hz。发动机与电机转速' },
  { name: 'bpm', aliases: ['每分钟搏动'], dimension: 'frequency', factor: 1 / 60, note: '心率常用（静息 60—100 bpm）' },
]

/**
 * 用 SI 词头批量生成一组单位。
 *
 * 便于将来按需生成（当前表内的前缀单位已直接列在数据里，避免运行期拼装开销）。
 *
 * @param base - 词头后面的单位符号（如 'm' → km/cm/mm）
 * @param dimension - 量纲
 * @param baseFactor - 该单位本身的公制等值（如 't' 的 1000 kg）
 * @returns 单位定义数组
 */
export function withPrefixes(base: string, dimension: Dimension, baseFactor: number): UnitDef[] {
  return SI_PREFIXES.map(function (pair) {
    return { name: pair[0] + base, dimension, factor: baseFactor * pair[1] }
  })
}


/**
 * 全部单位：公制（含 SI 词头）、中国市制与古制、英制与美制、航海、天文、
 * 日本、俄国、印度、古希腊罗马，以及数据量 / 角度 / 力 / 频率。
 *
 * 每个条目只声明「等于多少**公制基准单位**」，因此任意两者都能互换 ——
 * 这就是「公制做换算中转」的实现方式。
 */
export const ALL_UNITS: UnitDef[] = [
  ...LENGTH_UNITS,
  ...MASS_UNITS,
  ...TIME_UNITS,
  ...AREA_UNITS,
  ...VOLUME_UNITS,
  ...ENERGY_UNITS,
  ...POWER_UNITS,
  ...TEMPERATURE_UNITS,
  ...SPEED_UNITS,
  ...PRESSURE_UNITS,
  ...DATA_UNITS,
  ...ANGLE_UNITS,
  ...FORCE_UNITS,
  ...FREQUENCY_UNITS,
]

/** 各量纲的基准（公制中转点）。换算永远「先乘到基准、再除以目标」。 */
export const DIMENSION_BASE: Record<Dimension, string> = {
  length: 'm',
  mass: 'kg',
  time: 's',
  area: 'm²',
  volume: 'm³',
  energy: 'J',
  power: 'W',
  temperature: 'K',
  speed: 'm/s',
  pressure: 'Pa',
  data: 'bit',
  angle: 'rad',
  force: 'N',
  frequency: 'Hz',
}

/** 量纲的中文名。 */
export const DIMENSION_LABEL: Record<Dimension, string> = {
  length: '长度',
  mass: '质量',
  time: '时间',
  area: '面积',
  volume: '体积',
  energy: '能量',
  power: '功率',
  temperature: '温度',
  speed: '速度',
  pressure: '压强',
  data: '数据量',
  angle: '角度',
  force: '力',
  frequency: '频率',
}

/** 量纲排列顺序（列单位时分组的顺序）。 */
export const DIMENSION_ORDER: Dimension[] = [
  'length', 'mass', 'time', 'area', 'volume',
  'energy', 'power', 'temperature', 'speed', 'pressure',
  'force', 'angle', 'data', 'frequency',
]
