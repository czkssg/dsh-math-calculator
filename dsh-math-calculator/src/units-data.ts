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
  { name: 'dm', aliases: ['分米'], dimension: 'length', factor: 0.1 },
  { name: 'cm', aliases: ['厘米', '公分'], dimension: 'length', factor: 0.01 },
  { name: 'mm', aliases: ['毫米', '公厘'], dimension: 'length', factor: 0.001 },
  { name: 'µm', aliases: ['微米', 'μm'], dimension: 'length', factor: 1e-6 },
  { name: 'nm', aliases: ['纳米'], dimension: 'length', factor: 1e-9 },

  // ── 中国市制（1929 年定制，现大陆通用）──
  { name: '里', dimension: 'length', factor: 500,
    note: '市里 = 500 m。古代差异极大：周制约 415 m、秦汉约 415 m、清制 576 m' },
  { name: '丈', dimension: 'length', factor: 3.2, note: '市丈 = 10 市尺 = 3.2 m' },
  { name: '市尺', aliases: ['尺'], dimension: 'length', factor: 0.32,
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
  { name: 'kpc', category: 'science', dimension: 'length', factor: 3.0856775814913673e19 },
  { name: 'Mpc', category: 'science', dimension: 'length', factor: 3.0856775814913673e22 },
  { name: 'Rearth', category: 'science', aliases: ['地球半径'], dimension: 'length', factor: 6.371e6 },
  { name: 'Rsun', category: 'science', aliases: ['太阳半径'], dimension: 'length', factor: 6.957e8 },
  { name: 'Ls', aliases: ['光秒'], dimension: 'length', factor: 299792458, category: 'science', note: '光在一秒内走的距离' },

  // ── 微观与专业 ──
  { name: 'Å', aliases: ['埃', 'angstrom'], dimension: 'length', factor: 1e-10, category: 'science', note: '1 Å = 0.1 nm，原子尺度' },
  { name: 'bohr', category: 'science', aliases: ['玻尔半径'], dimension: 'length', factor: 5.29177210903e-11 },

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
  { name: 'mg', aliases: ['毫克'], dimension: 'mass', factor: 1e-6 },
  { name: 'µg', aliases: ['微克', 'mcg'], dimension: 'mass', factor: 1e-9 },
  { name: 'ng', aliases: ['纳克'], dimension: 'mass', factor: 1e-12 },

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
  { name: 'slug', dimension: 'mass', factor: 14.5939029372, category: 'science', note: '英制工程质量单位 ≈ 14.59 kg（1 lbf·s²/ft）' },

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
  { name: 'Mearth', category: 'science', aliases: ['地球质量'], dimension: 'mass', factor: 5.972e24 },
  { name: 'Msun', category: 'science', aliases: ['太阳质量'], dimension: 'mass', factor: 1.989e30 },
  { name: 'amu', category: 'science', aliases: ['原子质量单位', '道尔顿', 'Da'], dimension: 'mass', factor: 1.66053906660e-27 },
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
  { name: 'barn', aliases: ['靶恩'], dimension: 'area', factor: 1e-28, category: 'science', note: '核物理截面单位 = 1e-28 m²' },
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
  { name: 'quad', aliases: ['夸德'], dimension: 'energy', factor: 1.05505585e18, category: 'science', note: '1 quad = 10^15 BTU，美国能源统计用' },

  // ── 燃料与大尺度 ──
  { name: 'toe', aliases: ['吨油当量'], dimension: 'energy', factor: 4.1868e10, category: 'science', note: '1 吨石油当量 = 41.87 GJ，能源统计标准单位' },
  { name: 'tce', aliases: ['吨煤当量'], dimension: 'energy', factor: 2.93076e10, category: 'science', note: '1 吨标准煤当量 = 29.31 GJ（中国统计口径）' },
  { name: 'tTNT', aliases: ['吨TNT'], dimension: 'energy', factor: 4.184e9, note: '1 吨 TNT 当量 = 4.184 GJ' },
  { name: 'ktTNT', aliases: ['千吨TNT'], dimension: 'energy', factor: 4.184e12, note: '战术核武量级' },
  { name: 'MtTNT', aliases: ['百万吨TNT', 'megaton'], dimension: 'energy', factor: 4.184e15, note: '战略核武量级（沙皇炸弹约 50 Mt）' },
  { name: 'GtTNT', aliases: ['十亿吨TNT'], dimension: 'energy', factor: 4.184e18, note: '超级火山与陨击量级' },

  // ── 微观 ──
  { name: 'eV', category: 'science', aliases: ['电子伏'], dimension: 'energy', factor: 1.602176634e-19 },
  { name: 'keV', category: 'science', aliases: ['千电子伏'], dimension: 'energy', factor: 1.602176634e-16 },
  { name: 'MeV', category: 'science', aliases: ['兆电子伏'], dimension: 'energy', factor: 1.602176634e-13 },
  { name: 'GeV', category: 'science', aliases: ['吉电子伏'], dimension: 'energy', factor: 1.602176634e-10 },
  { name: 'TeV', category: 'science', aliases: ['太电子伏'], dimension: 'energy', factor: 1.602176634e-7 },
  { name: 'Ry', aliases: ['里德伯'], dimension: 'energy', factor: 2.1798723611035e-18, category: 'science', note: '里德伯能量 ≈ 13.6 eV，氢原子电离能' },
  { name: 'hartree', aliases: ['哈特里'], dimension: 'energy', factor: 4.3597447222071e-18, category: 'science', note: '原子单位制能量基准 ≈ 27.2 eV' },
  { name: 'eVperBond', aliases: ['每键电子伏'], dimension: 'energy', factor: 1.602176634e-19, category: 'science', note: '化学键能量常用口径' },

  // ── 其它 ──
  { name: 'erg', aliases: ['尔格'], dimension: 'energy', factor: 1e-7, category: 'science', note: 'CGS 制能量单位 = 1e-7 J' },
  { name: 'Ryd', dimension: 'energy', factor: 2.1798723611035e-18, category: 'science', note: '同 Ry，兼容写法' },
  { name: 'foe', aliases: ['foe_energy'], dimension: 'energy', factor: 1e44, category: 'science',
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
  { name: 'cal_per_s', category: 'science', aliases: ['卡每秒'], dimension: 'power', factor: 4.184 },

  // ── 人力畜力（古代/工程题材的核心）──
  { name: '人', aliases: ['人力', '人力持续'], dimension: 'power', factor: 75,
    note: '一个成年人**持续**体力输出约 75 W（几小时尺度）。短时爆发可到 1000 W' },
  { name: '人峰值', aliases: ['人力爆发'], dimension: 'power', factor: 1000, note: '成年人短时（几十秒）爆发功率量级' },
  { name: '畜', aliases: ['畜力', '一畜'], dimension: 'power', factor: 500,
    note: '一头役畜（牛/马）**持续**输出约 500 W' },
  { name: '马持续', dimension: 'power', factor: 735, note: '一匹马持续工作约 0.7—1 马力' },

  // ── 天体与声学 ──
  { name: 'Lsun', aliases: ['太阳光度'], dimension: 'power', factor: 3.828e26, category: 'science', note: '太阳总辐射功率 ≈ 3.83e26 W' },
  { name: 'erg_per_s', category: 'science', aliases: ['尔格每秒'], dimension: 'power', factor: 1e-7 },
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
  { name: 'Ba', aliases: ['巴（CGS）'], dimension: 'pressure', factor: 1e-5, category: 'science', note: 'CGS 制压强单位 = 1 dyn/cm²（与 bar 的「巴」同名但差 10 个量级）' },
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
  { name: 'dyn', aliases: ['达因'], dimension: 'force', factor: 1e-5, category: 'science', note: 'CGS 制力单位 = 1e-5 N' },
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

/**
 * 中国古制与市制的细分单位。
 *
 * ## 为什么这么多条
 *
 * 中文里长度、重量、容量三套都是**十进制细分**（尺寸分厘毫丝忽），
 * 而且历代数值不同。写小说时「一厘银」「三忽」这类说法会出现，
 * 但换算系数从来没人记得住 —— 这正是该收进表的理由。
 *
 * ⚠ 历代数值差异极大，表内统一用**市制（1929 年定制）**为基准，
 * 古制差异写在 note 里；要精确到某朝代用 `customUnits` 覆盖。
 */
export const CHINA_EXTRA_UNITS: UnitDef[] = [
  // ── 长度：市制十进制细分（尺寸分厘毫丝忽）──
  { name: '丝_长度', aliases: ['市丝'], dimension: 'length', factor: 3.2e-5, note: '市丝 = 1/10 市毫 ≈ 32 µm' },
  { name: '忽_长度', aliases: ['市忽'], dimension: 'length', factor: 3.2e-6, note: '市忽 = 1/10 市丝 ≈ 3.2 µm（长度最小单位）' },
  { name: '咫', dimension: 'length', factor: 0.256, note: '周制八寸为一咫 ≈ 25.6 cm（「咫尺天涯」的咫）' },
  { name: '庹', dimension: 'length', factor: 1.6, note: '两臂平伸的长度 ≈ 1.6 m（口语量绳用）' },
  { name: '市尺_古', aliases: ['营造尺'], dimension: 'length', factor: 0.32, note: '明清营造尺 ≈ 32 cm（与市尺数值相同，但用途是建筑）' },
  { name: '汉尺', dimension: 'length', factor: 0.231, note: '汉制一尺 ≈ 23.1 cm（出土汉尺实测）' },
  { name: '商尺', dimension: 'length', factor: 0.158, note: '商制一尺 ≈ 15.8 cm' },
  { name: '周尺', dimension: 'length', factor: 0.199, note: '周制一尺 ≈ 19.9 cm' },
  { name: '清里', dimension: 'length', factor: 576, note: '清制一里 = 180 丈 ≈ 576 m（与市里 500 m 差 15%）' },
  { name: '周里', dimension: 'length', factor: 415.8, note: '周制一里 = 300 步 ≈ 415.8 m' },
  { name: '丈_汉', aliases: ['汉丈'], dimension: 'length', factor: 2.31, note: '汉制一丈 = 10 汉尺 ≈ 2.31 m' },

  // ── 容量：石斗升合勺撮圭（十进制细分）──
  { name: '勺', dimension: 'volume', factor: 1e-5, note: '市勺 = 1/10 市合 ≈ 10 mL' },
  { name: '撮', dimension: 'volume', factor: 1e-6, note: '市撮 = 1/10 市勺 ≈ 1 mL（「一撮盐」）' },
  { name: '圭', dimension: 'volume', factor: 1e-7, note: '市圭 = 1/10 市撮 ≈ 0.1 mL（容量最小单位）' },
  { name: '粟_容量', aliases: ['市粟'], dimension: 'volume', factor: 1e-8, note: '一圭 = 10 粟，古制容量最小粒度' },
  { name: '龠', dimension: 'volume', factor: 5e-5, note: '古制一龠 = 半合 ≈ 50 mL（周礼量制基本单位）' },
  { name: '升_古', aliases: ['汉升'], dimension: 'volume', factor: 0.000198, note: '汉制一升 ≈ 198 mL（出土汉量实测），与市升 1 L 差 5 倍' },
  { name: '斗_汉', aliases: ['汉斗'], dimension: 'volume', factor: 0.00198, note: '汉制一斗 = 10 汉升 ≈ 1.98 L' },
  { name: '石_汉', aliases: ['汉石'], dimension: 'volume', factor: 0.0198, note: '汉制一石 = 10 汉斗 ≈ 19.8 L' },

  // ── 重量：担斤两钱分厘毫丝（十进制细分）──
  { name: '毫_质量', aliases: ['市毫质量'], dimension: 'mass', factor: 5e-8, note: '市毫 = 1/10 市厘 = 0.05 mg' },
  { name: '丝_质量', aliases: ['市丝质量'], dimension: 'mass', factor: 5e-9, note: '市丝 = 1/10 市毫' },
  { name: '忽_质量', aliases: ['市忽质量'], dimension: 'mass', factor: 5e-10, note: '市忽 = 1/10 市丝（重量最小单位）' },
  { name: '镒', dimension: 'mass', factor: 0.315, note: '秦制二十两为一镒 ≈ 315 g（「黄金百镒」）' },
  { name: '汉斤', dimension: 'mass', factor: 0.258, note: '汉制一斤 = 16 汉两 ≈ 258 g（与市斤 500 g 差近一倍）' },
  { name: '汉两', dimension: 'mass', factor: 0.016125, note: '汉制一两 = 1/16 汉斤 ≈ 16.1 g' },
  { name: '清斤', dimension: 'mass', factor: 0.5968, note: '清制一斤 ≈ 596.8 g（库平制），比市斤重 19%' },
  { name: '库平两', aliases: ['关平两'], dimension: 'mass', factor: 0.037301, note: '库平一两 ≈ 37.3 g，清代海关与国库用' },
  { name: '漕平两', dimension: 'mass', factor: 0.036664, note: '漕平一两 ≈ 36.66 g，漕运系统用（各地平砝不同）' },

  // ── 面积：亩分厘毫 + 弓 ──
  { name: '毫_面积', aliases: ['市毫面积'], dimension: 'area', factor: 0.0666667, note: '市毫 = 1/10 市厘面积 ≈ 0.067 m²' },
  { name: '弓', aliases: ['步弓'], dimension: 'area', factor: 2.56, note: '丈量单位，一弓 = 5 尺见方 = 25 平方尺 ≈ 2.56 m²' },
  { name: '方步', dimension: 'area', factor: 2.56, note: '一平方步 ≈ 2.56 m²（「田若干步」的口径）' },
  { name: '畹', dimension: 'area', factor: 2020, note: '古制三十亩为一畹（一说十二亩），差异大，仅作量级参考' },

  // ── 时间：古制补充 ──
  { name: '漏刻', dimension: 'time', factor: 864, note: '百刻制中一刻的细分，约 14.4 分钟（与「刻」同源，此处按一昼夜 100 等分）' },
  { name: '一炷香细', aliases: ['香'], dimension: 'time', factor: 1800, note: '同「炷香」的口语简称' },
  { name: '一盅茶', dimension: 'time', factor: 900, note: '约 15 分钟（无标准，与「盏茶」同族）' },
  { name: '周岁', aliases: ['实岁'], dimension: 'time', factor: 3.1556926e7, note: '生日周期，按回归年计' },
]

/**
 * 欧洲列强的传统单位（工业革命前后，写蒸汽朋克/历史题材的刚需）。
 *
 * ## 为什么这些必须收
 *
 * 公制是 1795 年法国才立、1875 年才国际化的。在此之前**每个国家各有一套**，
 * 而且同一国不同行业还不一样（例如英国有常衡/金衡/药衡三套重量）。
 *
 * 写 1700—1900 年的故事时，人物说的「一普特面粉」「三十维尔斯特」是真的，
 * 换算系数却没人记得住。这些数值来自当时的官方定义或学界通行近似。
 */

/** 俄制（沙俄，16—20 世纪初）。 */
export const RUSSIA_UNITS: UnitDef[] = [
  { name: 'sazhen', aliases: ['沙绳', '俄丈'], dimension: 'length', factor: 2.1336, note: '俄丈 = 7 英尺 ≈ 2.134 m' },
  { name: 'arshin', aliases: ['阿尔申', '俄尺'], dimension: 'length', factor: 0.7112, note: '俄尺 = 16 维尔肖克 ≈ 71.1 cm' },
  { name: 'vershok', aliases: ['维尔肖克'], dimension: 'length', factor: 0.04445, note: '1 维尔肖克 = 1/16 俄尺 ≈ 4.45 cm（量身高用）' },
  { name: 'funt', aliases: ['俄磅'], dimension: 'mass', factor: 0.40951241, note: '俄磅 ≈ 409.5 g，比国际磅重 9.7%' },
  { name: 'zolotnik', aliases: ['佐洛特尼克'], dimension: 'mass', factor: 0.0042662, note: '1 佐洛特尼克 = 1/96 俄磅 ≈ 4.27 g（金饰用）' },
  { name: 'dolya', aliases: ['多利亚'], dimension: 'mass', factor: 4.4429e-5, note: '1 多利亚 = 1/96 佐洛特尼克 ≈ 44.4 mg（最小单位）' },
  { name: 'vedro', aliases: ['维德罗'], dimension: 'volume', factor: 0.012299, note: '俄制液量单位 ≈ 12.3 L（一桶酒）' },
  { name: 'shtof', aliases: ['什托夫'], dimension: 'volume', factor: 0.0012299, note: '1 什托夫 = 1/10 维德罗 ≈ 1.23 L（伏特加瓶）' },
  { name: 'charka', aliases: ['恰尔卡'], dimension: 'volume', factor: 0.00012299, note: '1 恰尔卡 = 1/100 维德罗 ≈ 123 mL（一杯酒）' },
]

/** 德制（普鲁士/各邦，1872 年统一前）。 */
export const GERMANY_UNITS: UnitDef[] = [
  { name: 'rhein_fuss', aliases: ['莱茵尺'], dimension: 'length', factor: 0.3138, note: '普鲁士莱茵尺 ≈ 31.4 cm（1816 年定）' },
  { name: 'rute', aliases: ['鲁特'], dimension: 'length', factor: 3.766, note: '普鲁士路特 = 12 莱茵尺 ≈ 3.77 m（丈量用）' },
  { name: 'meile', aliases: ['德里'], dimension: 'length', factor: 7539.6, note: '普鲁士里 ≈ 7.54 km（比英制里长 4.7 倍）' },
  { name: 'zoll_de', aliases: ['德寸'], dimension: 'length', factor: 0.026154, note: '普鲁士寸 = 1/12 莱茵尺 ≈ 2.62 cm' },
  { name: 'pfund_de', aliases: ['德磅'], dimension: 'mass', factor: 0.4676, note: '普鲁士磅 ≈ 467.6 g（各邦 460—510 g 不等）' },
  { name: 'zentner', aliases: ['德担'], dimension: 'mass', factor: 51.4, note: '普鲁士担 = 110 德磅 ≈ 51.4 kg（一说 100 磅 = 46.8 kg）' },
  { name: 'lot', aliases: ['洛特'], dimension: 'mass', factor: 0.014606, note: '1 洛特 = 1/32 德磅 ≈ 14.6 g（药剂与贵金属）' },
  { name: 'quint', aliases: ['昆特'], dimension: 'mass', factor: 0.014606, note: '同洛特的旧写，各邦数值略异' },
  { name: 'scheffel', aliases: ['舍费尔'], dimension: 'volume', factor: 0.054961, note: '普鲁士谷量单位 ≈ 55 L（量谷物用）' },
  { name: 'eimer', aliases: ['艾默'], dimension: 'volume', factor: 0.0687, note: '德制液量单位 ≈ 68.7 L（各地 60—75 L）' },
  { name: 'mass_de', aliases: ['德马克'], dimension: 'mass', factor: 0.2338, note: '德制马克（重量）≈ 233.8 g（铸币用）' },
]

/** 法制（公制诞生地，但旧制 au 1795 前仍在使用）。 */
export const FRANCE_UNITS: UnitDef[] = [
  { name: 'toise', aliases: ['图瓦兹', '法丈'], dimension: 'length', factor: 1.949, note: '法丈 ≈ 1.949 m（旧制长度基准）' },
  { name: 'pied', aliases: ['法尺'], dimension: 'length', factor: 0.32484, note: '法尺 = 1/6 法丈 ≈ 32.5 cm' },
  { name: 'pouce', aliases: ['法寸'], dimension: 'length', factor: 0.02707, note: '法寸 = 1/12 法尺 ≈ 2.71 cm' },
  { name: 'ligne', aliases: ['法分'], dimension: 'length', factor: 0.002256, note: '1 法分 = 1/12 法寸 ≈ 2.26 mm（钟表游丝用）' },
  { name: 'lieue', aliases: ['法里'], dimension: 'length', factor: 4444.8, note: '法里 ≈ 4.44 km（旧制，各版本 3.9—4.7 km）' },
  { name: 'livre', aliases: ['法磅'], dimension: 'mass', factor: 0.48950584, note: '法磅 ≈ 489.5 g（旧制常衡）' },
  { name: 'once_fr', aliases: ['法盎司'], dimension: 'mass', factor: 0.030594, note: '法盎司 = 1/16 法磅 ≈ 30.6 g' },
  { name: 'gros_fr', aliases: ['格罗'], dimension: 'mass', factor: 0.0038243, note: '1 格罗 = 1/8 法盎司 ≈ 3.82 g' },
  { name: 'quintal_fr', aliases: ['法担'], dimension: 'mass', factor: 48.9506, note: '法担 = 100 法磅 ≈ 49 kg' },
  { name: 'boisseau', aliases: ['布斯罗'], dimension: 'volume', factor: 0.01297, note: '法制谷量 ≈ 13 L（巴黎口径）' },
  { name: 'setier', aliases: ['塞蒂耶'], dimension: 'volume', factor: 0.1297, note: '1 塞蒂耶 = 8 布斯罗 ≈ 130 L' },
  { name: 'muid', aliases: ['米伊'], dimension: 'volume', factor: 0.268, note: '法制大桶 ≈ 268 L（酒桶口径）' },
]

/** 西班牙/葡萄牙/意大利/荷兰/北欧。 */
export const OTHER_EUROPE_UNITS: UnitDef[] = [
  // 西班牙
  { name: 'vara', aliases: ['西尺'], dimension: 'length', factor: 0.8359, note: '西班牙尺 ≈ 83.6 cm（卡斯蒂利亚制）' },
  { name: 'legua', aliases: ['西里'], dimension: 'length', factor: 5572.7, note: '西班牙里 ≈ 5.57 km（约 6667 西尺）' },
  { name: 'libra', aliases: ['西磅'], dimension: 'mass', factor: 0.460093, note: '西班牙磅 ≈ 460 g' },
  { name: 'arroba', aliases: ['阿罗巴'], dimension: 'mass', factor: 11.502, note: '西班牙阿罗巴 = 25 西磅 ≈ 11.5 kg（农产品用）' },
  { name: 'fanega', aliases: ['法内加'], dimension: 'volume', factor: 0.055501, note: '西班牙谷量 ≈ 55.5 L' },

  // 葡萄牙
  { name: 'braça', aliases: ['葡丈'], dimension: 'length', factor: 2.2, note: '葡萄牙丈 ≈ 2.2 m' },
  { name: 'arroba_pt', aliases: ['葡阿罗巴'], dimension: 'mass', factor: 14.688, note: '葡萄牙阿罗巴 ≈ 14.69 kg（比西班牙重 28%）' },

  // 意大利（各邦各异，取通行值）
  { name: 'braccio', aliases: ['意丈'], dimension: 'length', factor: 0.5836, note: '意大利丈 ≈ 58.4 cm（托斯卡纳制，各邦 50—70 cm）' },
  { name: 'piede_it', aliases: ['意尺'], dimension: 'length', factor: 0.2978, note: '意大利尺 ≈ 29.8 cm（罗马制）' },
  { name: 'libbra', aliases: ['意磅'], dimension: 'mass', factor: 0.339, note: '意大利磅 ≈ 339 g（各邦差异大）' },
  { name: 'miglia_it', aliases: ['意里'], dimension: 'length', factor: 1481.7, note: '意大利里 ≈ 1.48 km（罗马制）' },

  // 荷兰
  { name: 'duim', aliases: ['荷寸'], dimension: 'length', factor: 0.0257, note: '荷兰寸 ≈ 2.57 cm' },
  { name: 'voet', aliases: ['荷尺'], dimension: 'length', factor: 0.2831, note: '荷兰尺 ≈ 28.3 cm（阿姆斯特丹制）' },
  { name: 'el', aliases: ['荷兰厄尔'], dimension: 'length', factor: 0.6878, note: '荷兰布尺 ≈ 68.8 cm（量布料用）' },
  { name: 'pond_nl', aliases: ['荷磅'], dimension: 'mass', factor: 0.4954, note: '荷兰磅 ≈ 495 g' },
  { name: 'vat', aliases: ['荷桶'], dimension: 'volume', factor: 0.14157, note: '荷兰桶 ≈ 141.6 L' },

  // 北欧
  { name: 'aln_sv', aliases: ['瑞典尺'], dimension: 'length', factor: 0.5938, note: '瑞典尺 ≈ 59.4 cm' },
  { name: 'mil_sv', aliases: ['瑞典里'], dimension: 'length', factor: 10688.0, note: '瑞典里 ≈ 10.69 km（1889 年后改 10 km）' },
  { name: 'skalpund', aliases: ['瑞典磅'], dimension: 'mass', factor: 0.425076, note: '瑞典磅 ≈ 425 g' },
  { name: 'canne_dk', aliases: ['丹麦丈'], dimension: 'length', factor: 0.6277, note: '丹麦丈 ≈ 62.8 cm' },
  { name: 'pund_dk', aliases: ['丹麦磅'], dimension: 'mass', factor: 0.4963, note: '丹麦磅 ≈ 496 g' },

  // 奥地利/匈牙利/波兰
  { name: 'klafter', aliases: ['克拉夫特'], dimension: 'length', factor: 1.8966, note: '奥地利克拉夫特（丈）≈ 1.897 m' },
  { name: 'wiertel', aliases: ['维尔特尔'], dimension: 'volume', factor: 0.001555, note: '奥地利液量 ≈ 1.56 L' },
  { name: 'metze', aliases: ['梅策'], dimension: 'volume', factor: 0.0619, note: '奥地利谷量 ≈ 61.9 L' },
  { name: 'sążeń', aliases: ['波兰沙任'], dimension: 'length', factor: 1.728, note: '波兰丈 ≈ 1.73 m' },
  { name: 'łokieć', aliases: ['波兰肘'], dimension: 'length', factor: 0.5956, note: '波兰肘 ≈ 59.6 cm' },
]

/**
 * 东亚、南亚、西亚的传统单位。
 *
 * 日本是用户明确点名的：尺贯法（shakkan-hō）自成一套，且与中国市制
 * 同字不同值（日尺 30.3 cm vs 市尺 32 cm，日斤 600 g vs 市斤 500 g）。
 * 写日式题材（武士、町人、和风奇幻）时这些是刚需。
 */

/** 日本尺贯法（1891 年法定，沿用至公制化）。 */
export const JAPAN_UNITS: UnitDef[] = [
  // 长度
  { name: '日尺', aliases: ['曲尺', 'shaku'], dimension: 'length', factor: 0.30303, note: '日本尺 ≈ 30.3 cm（曲尺）。中国市尺 32 cm，差 5%' },
  { name: '日寸', aliases: ['sun'], dimension: 'length', factor: 0.030303, note: '日寸 = 1/10 日尺 ≈ 3.03 cm' },
  { name: '日分', aliases: ['bu_jp'], dimension: 'length', factor: 0.0030303, note: '日分 = 1/10 日寸 ≈ 3.03 mm' },
  { name: '日厘', aliases: ['rin'], dimension: 'length', factor: 0.00030303, note: '日厘 = 1/10 日分' },
  { name: '间', aliases: ['ken'], dimension: 'length', factor: 1.81818, note: '日本「间」= 6 日尺 ≈ 1.82 m（建筑开间模数）' },
  { name: '丈_日', aliases: ['日丈'], dimension: 'length', factor: 3.0303, note: '日丈 = 10 日尺 ≈ 3.03 m' },
  { name: '鲸尺', aliases: ['kujira-shaku'], dimension: 'length', factor: 0.378787, note: '鲸尺 ≈ 37.9 cm（量布用，比曲尺长 25%）' },
  { name: '间_海', aliases: ['hiro'], dimension: 'length', factor: 1.81818, note: '航海用「寻」，同日间 ≈ 1.82 m（测水深）' },

  // 面积
  { name: '日反', aliases: ['tan'], dimension: 'area', factor: 991.74, note: '日反 = 10 日亩 ≈ 992 m²（田地基本单位）' },
  { name: '日畝', aliases: ['se'], dimension: 'area', factor: 99.174, note: '日亩 = 30 日坪 ≈ 99.2 m²（与中文「亩」差 6.7 倍）' },

  // 体积（容量）
  { name: '勺_日', aliases: ['shao_jp'], dimension: 'volume', factor: 1.8039e-5, note: '日勺 ≈ 18 mL（1/10 日合）' },
  { name: '日升量', aliases: ['shō'], dimension: 'volume', factor: 0.0018039, note: '日升 ≈ 1.80 L，中国市升 1 L，差 1.8 倍' },
  { name: '日斗量', aliases: ['to'], dimension: 'volume', factor: 0.018039, note: '日斗 = 10 日升 ≈ 18 L' },

  // 质量（贯目）
  { name: '日匁', aliases: ['monme'], dimension: 'mass', factor: 0.00375, note: '日匁 = 3.75 g（1/1000 贯，贵金属与药）' },
  { name: '日斤_质量', aliases: ['kin_jp'], dimension: 'mass', factor: 0.6, note: '日斤 = 160 匁 ≈ 600 g（中国市斤 500 g，差 20%）' },
  { name: '贯', aliases: ['kan_jp', '贯目'], dimension: 'mass', factor: 3.75, note: '日贯 = 1000 匁 = 3.75 kg（江户时代货币与重量两用）' },
  { name: '日両', aliases: ['ryō_mass'], dimension: 'mass', factor: 0.0375, note: '日两（重量）≈ 37.5 g（十匁）。注意与小判金币的「两」区分' },
]

/** 印度（莫卧儿与英属时期）。 */
export const INDIA_UNITS: UnitDef[] = [
  { name: 'gaz', aliases: ['加兹'], dimension: 'length', factor: 0.9144, note: '莫卧儿加兹 ≈ 0.914 m（各统治期 0.7—1.0 m 不等）' },
  { name: 'coss', aliases: ['科斯'], dimension: 'length', factor: 1855, note: '英属印度科斯 ≈ 1.855 km（与莫卧儿制不同）' },
  { name: 'tola', aliases: ['托拉'], dimension: 'mass', factor: 0.0116638, note: '印度托拉 ≈ 11.66 g（黄金与香料基本单位）' },
  { name: 'seer', aliases: ['锡尔'], dimension: 'mass', factor: 0.9331, note: '莫卧儿锡尔 ≈ 933 g（各邦 0.8—1.2 kg）' },
  { name: 'maund', aliases: ['芒德'], dimension: 'mass', factor: 37.3242, note: '英属印度芒德 = 40 锡尔 ≈ 37.3 kg（大宗货物）' },
  { name: 'candy', aliases: ['坎迪'], dimension: 'mass', factor: 746.48, note: '印度坎迪 = 20 芒德 ≈ 746 kg（棉花贸易）' },
  { name: 'ser_ind', aliases: ['印度升'], dimension: 'volume', factor: 0.001041, note: '印度容量单位 ≈ 1.04 L（各地差异大）' },
  { name: 'bigha', aliases: ['比加'], dimension: 'area', factor: 1337.8, note: '印度比加 ≈ 1338 m²（各邦 1000—2500 m²，差异极大）' },
  { name: 'katha', aliases: ['卡塔'], dimension: 'area', factor: 66.89, note: '1 卡塔 = 1/20 比加 ≈ 66.9 m²（孟加拉制）' },
]

/** 阿拉伯/奥斯曼/波斯。 */
export const ARABIA_UNITS: UnitDef[] = [
  { name: 'dhira', aliases: ['迪拉', '阿拉伯肘'], dimension: 'length', factor: 0.6496, note: '阿拉伯肘 ≈ 65 cm（各学派 0.49—0.94 m，差异极大）' },
  { name: 'farsakh', aliases: ['法尔萨赫'], dimension: 'length', factor: 5544, note: '波斯/阿拉伯「里」≈ 5.54 km（约 12000 肘）' },
  { name: 'ratl', aliases: ['拉特儿'], dimension: 'mass', factor: 0.4375, note: '阿拉伯磅 ≈ 437 g（巴格达制，各地 0.4—0.5 kg）' },
  { name: 'dirham_mass', aliases: ['迪拉姆重'], dimension: 'mass', factor: 0.003125, note: '伊斯兰迪拉姆（重量）≈ 3.125 g（与银币迪拉姆同源）' },
  { name: 'qintar', aliases: ['坎塔'], dimension: 'mass', factor: 44.928, note: '阿拉伯坎塔 = 100 拉特儿 ≈ 44.9 kg' },
  { name: 'okka', aliases: ['奥卡', '奥斯曼欧克'], dimension: 'mass', factor: 1.2829, note: '奥斯曼欧克 ≈ 1.283 kg（100 德拉姆）' },
  { name: 'dirhem_ott', aliases: ['奥斯曼德拉姆'], dimension: 'mass', factor: 0.003207, note: '奥斯曼德拉姆 ≈ 3.21 g（欧克的 1/400）' },
  { name: 'arshin_ott', aliases: ['奥斯曼尺'], dimension: 'length', factor: 0.6503, note: '奥斯曼尺 ≈ 65 cm（与俄尺 71.1 cm 不同，容易混）' },
]

/** 东南亚与其它。 */
export const SEA_OTHER_UNITS: UnitDef[] = [
  { name: 'pik_th', aliases: ['泰尺'], dimension: 'length', factor: 0.508, note: '泰国「皮」≈ 50.8 cm（布料与建筑用）' },
  { name: 'sen_th', aliases: ['泰里'], dimension: 'length', factor: 400, note: '泰国「森」≈ 400 m' },
  { name: 'hath', aliases: ['印度肘'], dimension: 'length', factor: 0.4572, note: '印度「哈特」≈ 45.7 cm（等同英制肘）' },
  { name: 'coyan', aliases: ['科扬'], dimension: 'mass', factor: 2419, note: '东南亚大宗货物单位 ≈ 2.4 t（橡胶/锡）' },
  { name: 'picul', aliases: ['担_南洋'], dimension: 'mass', factor: 60.478, note: '南洋「担」≈ 60.5 kg（华侨与东南亚贸易单位）' },
  { name: 'gantang', aliases: ['甘唐'], dimension: 'volume', factor: 0.00184, note: '马来亚容量单位 ≈ 1.84 L（量米）' },
]

/**
 * 全部单位：公制（含 SI 词头）、中国市制与历代、日本尺贯法、
 * 俄/德/法/西/葡/意/荷/北欧传统单位、印度/阿拉伯/奥斯曼、
 * 英美制、航海与天文，以及数据量/角度/力/频率。
 *
 * 每个条目只声明「等于多少**公制基准单位**」，因此任意两者都能互换 ——
 * 这就是「公制做换算中转」的实现方式。
 *
 * 条数见 `ALL_UNITS.length`（当前 429：度量衡 398 + 科学 31）。
 */

/**
 * 电学、光学、化学与核物理的 SI 单位（补齐量纲断层）。
 *
 * ## 为什么必须补这一批
 *
 * 原来的单位表只有 4 个 SI 基本单位（m / kg / s / K），缺安培、摩尔、坎德拉 ——
 * 于是**整个电学、光学、化学、核物理领域无法换算**：
 * 写「十二伏电池」「三毫居里放射源」「0.5 戈瑞剂量」时工具一律不认识。
 *
 * 这一批把 7 个 SI 基本单位补全，并把 22 个具名导出单位落地，
 * 连带 18 个新量纲（电流/电荷/电压/电容/电阻/电导/磁通/磁通密度/电感/
 * 立体角/发光强度/光通量/照度/物质的量/活度/吸收剂量/剂量当量/催化活度）。
 *
 * ## 溯源
 *
 * 全部按 BIPM《SI Brochure》第 9 版（2019）Table 2/3/5。
 * 非 SI 单位（Ci、rad、U、gauss）按 NIST SP 811 与 ISO 80000 系列。
 *
 * ## 一处同名冲突
 *
 * 辐射吸收剂量的 `rad` 与平面角弧度 `rad` 同名（插件已收弧度）。
 * 辐射那条主名用 `rad_dose`，别名写 `rad (dose)` —— 两个都是正式写法，
 * 但主名不能撞，否则查表时永远命中弧度。
 */
export const SI_ELECTRO_OPTICAL_UNITS: UnitDef[] = [
  // ── SI 七个基本单位中此前缺失的三个 ──
  { name: 'A', aliases: ['安培', 'ampere', 'amp'], dimension: 'current', factor: 1, category: 'science',
    note: 'SI 基本单位，电流基准。2019 修订后由元电荷 e 定义。源：BIPM SI Brochure 9th (2019) Table 2' },
  { name: 'mol', aliases: ['摩尔', 'mole'], dimension: 'amount_of_substance', factor: 1, category: 'science',
    note: 'SI 基本单位，物质的量基准。2019 修订后由阿伏伽德罗常数 NA 定义。源：BIPM SI Brochure 9th (2019) Table 2' },
  { name: 'cd', aliases: ['坎德拉', 'candela'], dimension: 'luminous_intensity', factor: 1, category: 'science',
    note: 'SI 基本单位，发光强度基准。2019 修订后由光视效能 Kcd 定义。源：BIPM SI Brochure 9th (2019) Table 2' },

  // ── SI 具名导出单位（22 个）──
  { name: 'sr', aliases: ['球面度', 'steradian'], dimension: 'solid_angle', factor: 1, category: 'science',
    note: '1 sr = 1 m²/m²，无量纲导出单位。源：BIPM SI Brochure 9th (2019) Table 3' },
  { name: 'C', aliases: ['库仑', 'coulomb'], dimension: 'charge', factor: 1, category: 'science',
    note: '1 C = 1 A·s。源：BIPM SI Brochure 9th (2019) Table 3' },
  { name: 'V', aliases: ['伏', '伏特', 'volt'], dimension: 'voltage', factor: 1, category: 'science',
    note: '1 V = 1 W/A = 1 kg·m²/(s³·A)。源：BIPM SI Brochure 9th (2019) Table 3' },
  { name: 'F', aliases: ['法拉', 'farad'], dimension: 'capacitance', factor: 1, category: 'science',
    note: '1 F = 1 C/V = 1 A²·s⁴/(kg·m²)。源：BIPM SI Brochure 9th (2019) Table 3' },
  /**
   * 欧姆：主名用 U+03A9（希腊字母 Omega）。**U+2126（欧姆符号）必须同时收进别名** ——
   * 从不同来源粘贴的文字会带不同码位，只收一个就有一半认不出。
   */
  /** 主名是 U+03A9（希腊 Omega），别名另收 U+2126（欧姆符号）与「欧姆」。 */
  { name: 'Ω', aliases: ['Ω', '欧姆', 'ohm'], dimension: 'resistance', factor: 1, category: 'science',
    note: '1 Ω = 1 V/A = 1 kg·m²/(s³·A²)。U+03A9 与 U+2126 两个码位都收。源：BIPM SI Brochure 9th (2019) Table 3' },
  { name: 'S', aliases: ['西门子', 'siemens'], dimension: 'conductance', factor: 1, category: 'science',
    note: '1 S = 1 A/V = 1 Ω⁻¹。源：BIPM SI Brochure 9th (2019) Table 3' },
  { name: 'Wb', aliases: ['韦伯', 'weber'], dimension: 'magnetic_flux', factor: 1, category: 'science',
    note: '1 Wb = 1 V·s = 1 kg·m²/(s²·A)。源：BIPM SI Brochure 9th (2019) Table 3' },
  { name: 'T', aliases: ['特斯拉', 'tesla'], dimension: 'magnetic_flux_density', factor: 1, category: 'science',
    note: '1 T = 1 Wb/m² = 1 kg/(s²·A)。源：BIPM SI Brochure 9th (2019) Table 3' },
  { name: 'H', aliases: ['亨利', 'henry'], dimension: 'inductance', factor: 1, category: 'science',
    note: '1 H = 1 Wb/A = 1 kg·m²/(s²·A²)。源：BIPM SI Brochure 9th (2019) Table 3' },
  { name: 'lm', aliases: ['流明', 'lumen'], dimension: 'luminous_flux', factor: 1, category: 'science',
    note: '1 lm = 1 cd·sr。源：BIPM SI Brochure 9th (2019) Table 3' },
  { name: 'lx', aliases: ['勒克斯', 'lux'], dimension: 'illuminance', factor: 1, category: 'science',
    note: '1 lx = 1 lm/m² = 1 cd·sr/m²。源：BIPM SI Brochure 9th (2019) Table 3' },
  { name: 'Bq', aliases: ['贝可', '贝可勒尔', 'becquerel'], dimension: 'activity', factor: 1, category: 'science',
    note: '1 Bq = 1 s⁻¹，每秒一次衰变。源：BIPM SI Brochure 9th (2019) Table 3' },
  { name: 'Gy', aliases: ['戈瑞', 'gray'], dimension: 'absorbed_dose', factor: 1, category: 'science',
    note: '1 Gy = 1 J/kg，吸收剂量。源：BIPM SI Brochure 9th (2019) Table 3' },
  { name: 'Sv', aliases: ['希沃特', 'sievert'], dimension: 'dose_equivalent', factor: 1, category: 'science',
    note: '1 Sv = 1 J/kg，剂量当量（与 Gy 同量纲但含义不同）。源：BIPM SI Brochure 9th (2019) Table 3' },
  /**
   * 物质的量的常用细分：mmol / µmol / nmol。
   *
   * 生化、药学、临床检验里几乎只用这几个 —— 「血糖 5.5 mmol/L」
   * 「酶活 10 µmol/min」都是日常表述，所以归 measure 不归 science。
   */
  { name: 'mmol', aliases: ['毫摩尔', 'millimole'], dimension: 'amount_of_substance', factor: 0.001, category: 'measure',
    note: '1 mmol = 10⁻³ mol。临床检验（血糖/血脂）与生化实验常用。源：BIPM SI Brochure 9th (2019) Table 5' },
  { name: 'µmol', aliases: ['μmol', '微摩尔', 'micromole'], dimension: 'amount_of_substance', factor: 1e-6, category: 'measure',
    note: '1 µmol = 10⁻⁶ mol。酶活与微量分析常用。源：BIPM SI Brochure 9th (2019) Table 5' },
  { name: 'nmol', aliases: ['纳摩尔', 'nanomole'], dimension: 'amount_of_substance', factor: 1e-9, category: 'measure',
    note: '1 nmol = 10⁻⁹ mol。源：BIPM SI Brochure 9th (2019) Table 5' },
  { name: 'kat', aliases: ['开特', 'katal'], dimension: 'catalytic_activity', factor: 1, category: 'science',
    note: '1 kat = 1 mol/s，催化活度。源：BIPM SI Brochure 9th (2019) Table 3' },

  // ── 常用非 SI / 词头单位 ──
  { name: 'Ah', aliases: ['安时', 'ampere-hour', 'A·h'], dimension: 'charge', factor: 3600, category: 'measure',
    note: '1 Ah = 1 A·3600 s = 3600 C。电池容量必用。源：ISO 80000-6 (2008)' },
  { name: 'mAh', aliases: ['毫安时', 'milliampere-hour'], dimension: 'charge', factor: 3.6, category: 'measure',
    note: '1 mAh = 3.6 C，手机电池常用。源：ISO 80000-6 (2008)' },
  { name: 'mV', aliases: ['毫伏', 'millivolt'], dimension: 'voltage', factor: 0.001, category: 'measure',
    note: 'SI 词头单位，1 mV = 10⁻³ V。源：BIPM SI Brochure 9th (2019) Table 5' },
  { name: 'kV', aliases: ['千伏', 'kilovolt'], dimension: 'voltage', factor: 1000, category: 'measure',
    note: 'SI 词头单位，1 kV = 10³ V。源：BIPM SI Brochure 9th (2019) Table 5' },
  { name: 'kΩ', aliases: ['千欧', 'kiloohm', 'kohm'], dimension: 'resistance', factor: 1000, category: 'measure',
    note: 'SI 词头单位，1 kΩ = 10³ Ω。源：BIPM SI Brochure 9th (2019) Table 5' },
  { name: 'MΩ', aliases: ['兆欧', 'megaohm', 'mohm'], dimension: 'resistance', factor: 1000000, category: 'measure',
    note: 'SI 词头单位，1 MΩ = 10⁶ Ω。源：BIPM SI Brochure 9th (2019) Table 5' },
  /** CGS 制磁通密度。1 G = 10⁻⁴ T 是**精确定义**，不是近似，不许为好看写成 0.0001 之外的数。 */
  { name: 'gauss', aliases: ['高斯', 'G', 'Gs'], dimension: 'magnetic_flux_density', factor: 0.0001, category: 'science',
    note: '1 G = 10⁻⁴ T（精确），CGS 制磁通密度。源：ISO 80000-6 (2008)' },
  /** 整球立体角 4π sr。含 π 的值给足 double 位数，note 写精确式子。 */
  { name: 'sphere', aliases: ['整球', '球面'], dimension: 'solid_angle', factor: 12.566370614359172, category: 'science',
    note: '整球立体角 = 4π sr ≈ 12.566370614359172 sr。源：BIPM SI Brochure 9th (2019) §5.2' },
  { name: 'deg²', aliases: ['平方度', 'square degree', 'sqdeg'], dimension: 'solid_angle', factor: 0.00030461741978670857, category: 'science',
    note: '1 deg² = (π/180)² sr ≈ 3.0461741978670857×10⁻⁴ sr，天区面积常用。源：ISO 80000-3 (2019)' },
  { name: 'Ci', aliases: ['居里', 'curie'], dimension: 'activity', factor: 37000000000, category: 'science',
    note: '1 Ci = 3.7×10¹⁰ Bq（精确，定义为 1 g 镭-226 的活度）。源：NIST SP 811 (2008) B.8' },
  /** 辐射 rad：主名 rad_dose，**不能**用 rad —— 弧度已占用，撞名会导致查表永远命中角度。 */
  { name: 'rad_dose', aliases: ['rad (dose)', '拉德'], dimension: 'absorbed_dose', factor: 0.01, category: 'science',
    note: '1 rad = 0.01 Gy（精确），CGS 制吸收剂量。注意与平面角弧度 rad 同名，故主名用 rad_dose。源：NIST SP 811 (2008) B.8' },
  /** 酶单位：1 U = 1 µmol/min。60 s 不是整数秒，所以 factor 是循环小数的 double 近似。 */
  { name: 'U', aliases: ['酶单位', 'enzyme unit', 'IU'], dimension: 'catalytic_activity', factor: 1.6666666666666667e-8, category: 'science',
    note: '1 U = 1 µmol/min = 10⁻⁶ mol / 60 s ≈ 1.6666666666666667×10⁻⁸ kat。源：NC-IUB 酶单位定义 / ISO 18153' },
]

/**
 * 全部单位：公制（含 SI 词头）、中国市制与历代、日本尺贯法、
 * 俄/德/法/西/葡/意/荷/北欧传统单位、印度/阿拉伯/奥斯曼、
 * 英美制、航海与天文、电学/光学/化学/核物理的 SI 单位，
 * 以及数据量/角度/力/频率。
 *
 * 每个条目只声明「等于多少**公制基准单位**」，因此任意两者都能互换 ——
 * 这就是「公制做换算中转」的实现方式。
 *
 * 条数见 `ALL_UNITS.length`：462 条 / 32 个量纲
 * （度量衡与科学两类，见 `UnitDef.category`）。
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
  ...CHINA_EXTRA_UNITS,
  ...RUSSIA_UNITS,
  ...GERMANY_UNITS,
  ...FRANCE_UNITS,
  ...OTHER_EUROPE_UNITS,
  ...JAPAN_UNITS,
  ...INDIA_UNITS,
  ...ARABIA_UNITS,
  ...SEA_OTHER_UNITS,
  ...SI_ELECTRO_OPTICAL_UNITS,
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
  // ── 电学 ──
  current: 'A',
  charge: 'C',
  voltage: 'V',
  capacitance: 'F',
  resistance: 'Ω',
  conductance: 'S',
  magnetic_flux: 'Wb',
  magnetic_flux_density: 'T',
  inductance: 'H',
  // ── 光学 ──
  solid_angle: 'sr',
  luminous_intensity: 'cd',
  luminous_flux: 'lm',
  illuminance: 'lx',
  // ── 化学与核物理 ──
  amount_of_substance: 'mol',
  activity: 'Bq',
  absorbed_dose: 'Gy',
  dose_equivalent: 'Sv',
  catalytic_activity: 'kat',
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
  // ── 电学 ──
  current: '电流',
  charge: '电荷量',
  voltage: '电压',
  capacitance: '电容',
  resistance: '电阻',
  conductance: '电导',
  magnetic_flux: '磁通量',
  magnetic_flux_density: '磁通密度',
  inductance: '电感',
  // ── 光学 ──
  solid_angle: '立体角',
  luminous_intensity: '发光强度',
  luminous_flux: '光通量',
  illuminance: '照度',
  // ── 化学与核物理 ──
  amount_of_substance: '物质的量',
  activity: '放射性活度',
  absorbed_dose: '吸收剂量',
  dose_equivalent: '剂量当量',
  catalytic_activity: '催化活度',
}

/** 量纲排列顺序（列单位时分组的顺序）。 */
export const DIMENSION_ORDER: Dimension[] = [
  // 力学与几何（日常最常用，排前面）
  'length', 'mass', 'time', 'area', 'volume',
  'energy', 'power', 'temperature', 'speed', 'pressure',
  'force', 'angle', 'data', 'frequency',
  // 电学
  'current', 'charge', 'voltage', 'capacitance', 'resistance',
  'conductance', 'magnetic_flux', 'magnetic_flux_density', 'inductance',
  // 光学
  'solid_angle', 'luminous_intensity', 'luminous_flux', 'illuminance',
  // 化学与核物理
  'amount_of_substance', 'activity', 'absorbed_dose',
  'dose_equivalent', 'catalytic_activity',
]
