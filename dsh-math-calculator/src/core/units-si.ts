/**
 * SI 与现代标准单位补全。
 *
 * ## 为什么需要这一层（用户的提醒）
 *
 * > 现在的公制国际单位也应该全塞进去。**特别都塞古代单位把现代单位忘了**。
 *
 * 实测确认了这个疏漏 —— 24 个 SI 导出单位里缺 6 个：
 *
 * ```
 *   ✗ sr   球面度（立体角）
 *   ✗ lm   流明（光通量）
 *   ✗ lx   勒克斯（照度）
 *   ✗ Bq   贝可勒尔（放射性活度）
 *   ✗ Gy   戈瑞（吸收剂量）
 *   ✗ Sv   西弗（剂量当量）
 *   ✗ kat  开特（催化活性）
 * ```
 *
 * 这些都是 **SI 正式导出单位**，属于最基础的现代度量衡。
 *
 * ## 还缺的现代常用单位
 *
 * ```
 *   ✗ au / ly / pc   天文距离三件套
 *   ✗ d              日（时间）
 *   ✗ Np / dB        奈培 / 分贝
 *   ✗ Ci / R / rem   居里 / 伦琴 / 雷姆（核领域旧单位）
 *   ✗ kn / nmi       节 / 海里
 *   ✗ rpm            转每分
 *   ✗ bps            比特每秒
 * ```
 *
 * ## 分层依据
 *
 * 这一批**全部是「现代」**，不带时代变体 —— 它们的定义由国际计量大会
 * （CGPM）统一，没有「同一个词不同时代不同值」的问题。
 *
 * 所以它们是**扁平表**（与 `units-era.ts` 的变体结构不同），
 * 直接注册进 mathjs 即可。
 *
 * @module dsh-math-calculator/core/units-si
 */

/** 一个扁平单位定义。 */
export interface SiUnit {
  /** 注册名（字母数字）。 */
  name: string
  /** 别名（含中文）。 */
  aliases: string[]
  /** 量纲。 */
  dimension: string
  /** 换算到基准单位的因子。 */
  factor: number
  /** 说明。 */
  note: string
}

/**
 * ## SI 导出单位补全（7 个）
 *
 * 全部是**有专门名称的 SI 导出单位**（SI derived units with special names）。
 */
export const SI_DERIVED_MISSING: SiUnit[] = [
  {
    name: 'sr',
    aliases: ['steradian', '球面度', '立体角'],
    dimension: 'solid_angle',
    factor: 1,
    note: '球面度 = SI 立体角单位（1 sr = 1 rad²）。整球 = 4π sr',
  },
  {
    name: 'lm',
    aliases: ['lumen', '流明'],
    dimension: 'luminous_flux',
    factor: 1,
    note: '流明 = SI 光通量单位（1 lm = 1 cd·sr）。灯泡亮度看这个，不看瓦数',
  },
  {
    name: 'lx',
    aliases: ['lux', '勒克斯'],
    dimension: 'illuminance',
    factor: 1,
    note: '勒克斯 = SI 照度单位（1 lx = 1 lm/m²）。晴天户外约 10 万 lx，室内约 300 lx',
  },
  {
    name: 'Bq',
    aliases: ['becquerel', '贝可勒尔', '贝克'],
    dimension: 'activity',
    factor: 1,
    note: '贝可勒尔 = SI 放射性活度单位（1 Bq = 1 次衰变/秒）。1 Ci = 3.7e10 Bq',
  },
  {
    name: 'Gy',
    aliases: ['gray', '戈瑞'],
    dimension: 'absorbed_dose',
    factor: 1,
    note: '戈瑞 = SI 吸收剂量单位（1 Gy = 1 J/kg）。**5 Gy 全身照射约半致死**',
  },
  {
    name: 'Sv',
    aliases: ['sievert', '西弗'],
    dimension: 'dose_equivalent',
    factor: 1,
    note: '西弗 = SI 剂量当量单位（1 Sv = 1 J/kg，按辐射类型加权）。**1 Sv 急性照射约 10% 致死**',
  },
  {
    name: 'kat',
    aliases: ['katal', '开特'],
    dimension: 'catalytic_activity',
    factor: 1,
    note: '开特 = SI 催化活性单位（1 kat = 1 mol/s）。临床酶学用',
  },
]

/**
 * ## 天文距离（3 个）
 *
 * 这三个在科幻与世界观设定里**必然出现**，而之前只注册了 `AU`/`ly`/`pc`
 * 在数据表里、没进引擎。
 */
export const ASTRONOMY_UNITS: SiUnit[] = [
  {
    name: 'au',
    aliases: ['AU', 'astronomicalunit', '天文单位'],
    dimension: 'length',
    factor: 149597870700,
    note: '天文单位 = 日地平均距离 = 149,597,870.7 km（2012 年 IAU 精确定义）',
  },
  {
    name: 'ly',
    aliases: ['lightyear', '光年'],
    dimension: 'length',
    factor: 9460730472580800,
    note: '光年 = 光在真空中一年走的距离 = 9.4607e15 m（**不是时间单位**）',
  },
  {
    name: 'pc',
    aliases: ['parsec', '秒差距'],
    dimension: 'length',
    factor: 30856775814913672.789,
    note: '秒差距 = 1 天文单位的张角为 1 角秒时的距离 = 3.2616 光年（**天文学标准距离单位**）',
  },
]

/**
 * ## 时间补充
 *
 * mathjs 有 `day` 但没有 `d` 这个短名。
 */
export const TIME_UNITS_EXT: SiUnit[] = [
  {
    name: 'd',
    aliases: ['day', '日', '天'],
    dimension: 'time',
    factor: 86400,
    note: '1 日 = 86400 s（**平太阳日**；恒星日 86164 s，差 4 分钟）',
  },
]

/**
 * ## 声学与信号（分贝）
 *
 * ⚠ 分贝**不是线性单位** —— 它是比值的对数表示。
 * 所以这里注册的是「1 dB 对应多少奈培」，而**不能直接与线性量相加减**。
 */
export const ACOUSTIC_UNITS: SiUnit[] = [
  {
    name: 'Np',
    aliases: ['neper', '奈培'],
    dimension: 'ratio',
    factor: 1,
    note: '奈培 = 自然对数比值单位（1 Np = 8.6859 dB）',
  },
  {
    name: 'bel',
    aliases: ['B', '贝尔'],
    dimension: 'ratio',
    factor: 1.1512925465,
    note: '贝尔 = 常用对数比值单位（1 B = 10 dB = 1.1513 Np）',
  },
  {
    name: 'dB',
    aliases: ['decibel', '分贝'],
    dimension: 'ratio',
    factor: 0.11512925465,
    note: '分贝 = 0.1 贝尔（1 dB = 0.11513 Np）。⚠ **对数量，不能与线性量直接相加减**',
  },
]

/**
 * ## 核与辐射（旧单位，仍在用）
 *
 * 这些在核工程、医学与科幻设定里常见，且与 SI 单位**差很大**：
 *
 * ```
 *   1 Ci = 3.7e10 Bq      差 10 个数量级
 *   1 rad = 0.01 Gy       差 100 倍
 *   1 rem = 0.01 Sv       差 100 倍
 * ```
 */
export const RADIATION_UNITS: SiUnit[] = [
  {
    name: 'Ci',
    aliases: ['curie', '居里'],
    dimension: 'activity',
    factor: 3.7e10,
    note: '居里 = 3.7e10 Bq（**1 g 镭的活度**）。仍用于医学与核工业',
  },
  {
    name: 'radabsorbed',
    aliases: ['rad_absorbed', '拉德', 'raddose'],
    dimension: 'absorbed_dose',
    factor: 0.01,
    note: '拉德 = 0.01 Gy（吸收剂量的 CGS 单位，**与角度 rad 不是一回事**）',
  },
  {
    name: 'rem',
    aliases: ['雷姆'],
    dimension: 'dose_equivalent',
    factor: 0.01,
    note: '雷姆 = 0.01 Sv（剂量当量的 CGS 单位）。美国法规仍大量用 rem',
  },
  {
    name: 'R',
    aliases: ['roentgen', '伦琴'],
    dimension: 'exposure',
    factor: 0.000258,
    note: '伦琴 = 2.58e-4 C/kg（**照射量**，不是吸收剂量）。1 R ≈ 0.00877 Gy 空气',
  },
]

/**
 * ## 其他现代常用
 */
export const MODERN_MISC_UNITS: SiUnit[] = [
  {
    name: 'rpm',
    aliases: ['revolutionsperminute', '转每分'],
    dimension: 'angular_velocity',
    factor: 0.10471975511965977,
    note: '转每分 = 0.1047 rad/s（**转速**；蒸汽机与电动机铭牌标 rpm）',
  },
  {
    name: 'bps',
    aliases: ['bitpersecond', '比特每秒'],
    dimension: 'data_rate',
    factor: 1,
    note: '比特每秒 = 数据传输速率基本单位',
  },
  {
    name: 'knotmodern',
    aliases: ['kn', '节', 'knot_modern', '海里每小时'],
    dimension: 'speed',
    factor: 0.5144444444444445,
    note: '1 节 = 1 海里/小时 = 0.5144 m/s（**航海与航空速度**）',
  },
  {
    name: 'nmimodern',
    aliases: ['nauticalmile2', '海里', 'nmi_modern'],
    dimension: 'length',
    factor: 1852,
    note: '1 海里 = 1852 m（**1 分纬度**；与 statute mile 1609.344 不同）',
  },
  {
    name: 'lpmetric',
    aliases: ['lpm', '升每分'],
    dimension: 'flow',
    factor: 1.6666666666666667e-5,
    note: '升每分 = 1.6667e-5 m³/s（公制流量，与英制 gpm 对应）',
  },
]

/** 全部 SI 与现代单位补全。 */
export const SI_MODERN_UNITS: SiUnit[] = [
  ...SI_DERIVED_MISSING,
  ...ASTRONOMY_UNITS,
  ...TIME_UNITS_EXT,
  ...ACOUSTIC_UNITS,
  ...RADIATION_UNITS,
  ...MODERN_MISC_UNITS,
]
