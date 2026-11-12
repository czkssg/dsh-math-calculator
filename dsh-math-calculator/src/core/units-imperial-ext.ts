/**
 * 英制工业单位补充（第二批）—— 按 UCUM 官方表扩充。
 *
 * ## 数据源
 *
 * [UCUM ucum-ci.units](https://github.com/ucum-org/ucum/blob/main/ucum-ci.units)
 * （Regenstrief Institute，GPL-2.0，只取事实性数据）。
 * 选型理由见 `docs/单位数据源选型.md`。
 *
 * ## ★ 本批最重要的发现：英制有三套，不是两套
 *
 * ```
 *   [IN_I]   国际英寸  2.54 cm 精确      ← 1959 国际协定
 *   [IN_US]  美制英寸  1/[FT_US]×12      ← 1893 前的美国标准
 *   [IN_BR]  英制英寸  2.539998 cm       ← 英国 Imperial Standard
 * ```
 *
 * 国际英尺与美制英尺差 **0.6 ppm**。单看可忽略，但大地测量（几百公里）会累积到米级。
 *
 * ## 蒸汽朋克最该用的几组
 *
 * ```
 *   锅炉     six BTU / five calorie / hp_boiler
 *   货运     board_foot / cord / circular_mil
 *   书报     printer_point / pica / didot / cicero
 *   药剂     scruple / apothecary_dram / apothecary_ounce
 *   纺织     tex / denier
 * ```
 *
 * @module dsh-math-calculator/core/units-imperial-ext
 */

import type { UnitEntry } from './units-imperial.js'

/**
 * ## 英制长度三套（含测量链）
 *
 * UCUM 明确区分国际/美制/英制。这里全部收进来。
 */
export const IMPERIAL_LENGTH_EXT: UnitEntry[] = [
  /** 三套英尺。 */
  { name: 'ft_i', aliases: ['国际英尺'], dimension: 'length', factor: 0.3048, note: '国际英尺 = 0.3048 m（1959 协定精确定义）', system: 'imperial' },
  { name: 'ft_us', aliases: ['美制英尺'], dimension: 'length', factor: 0.3048006096012192, note: '美制英尺 = 1200/3937 m ≈ 0.30480061 m（比国际英尺长 0.6 ppm）', system: 'us' },
  { name: 'ft_br', aliases: ['英制英尺'], dimension: 'length', factor: 0.3047999902464003, note: '英制英尺 = 12 × 2.539998 cm（Imperial Standard）', system: 'imperial' },
  /** Gunter 链与 Ramden 链（测量专用）。 */
  { name: 'ch_us', aliases: ['冈特链'], dimension: 'length', factor: 20.116840233680467, note: 'Gunter 链 = 66 美制英尺（土地测量标准）', system: 'us' },
  { name: 'lk_us', aliases: ['冈特链节'], dimension: 'length', factor: 0.20116840233680466, note: '1 link = 1/100 Gunter 链', system: 'us' },
  { name: 'rch_us', aliases: ['拉姆登链'], dimension: 'length', factor: 30.48006096012192, note: 'Ramden 链 = 100 美制英尺（铁路曲线测量）', system: 'us' },
  { name: 'rlk_us', aliases: ['拉姆登链节'], dimension: 'length', factor: 0.3048006096012192, note: '1 Ramden link = 1/100 Ramden 链 = 1 美制英尺', system: 'us' },
  /** 印刷（蒸汽朋克书报业）。 */
  { name: 'point_pr', aliases: ['印刷点'], dimension: 'length', factor: 0.0003514598, note: 'Printer\'s point = 0.013837 in ≈ 0.3515 mm（传统活字单位）', system: 'imperial' },
  { name: 'pica_pr', aliases: ['印刷派卡'], dimension: 'length', factor: 0.0042175176, note: 'Printer\'s pica = 12 印刷点 ≈ 4.218 mm', system: 'imperial' },
  { name: 'line', aliases: ['线'], dimension: 'length', factor: 0.0021166666, note: '1 line = 1/12 英寸 ≈ 2.117 mm（旧枪械口径）', system: 'imperial' },
  { name: 'point', aliases: ['点'], dimension: 'length', factor: 0.0003527777, note: '1 point = 1/6 line ≈ 0.3528 mm（PostScript 点）', system: 'imperial' },
  { name: 'pica', aliases: ['派卡'], dimension: 'length', factor: 0.0042333333, note: '1 pica = 12 point ≈ 4.233 mm', system: 'imperial' },
  /** 法国印刷。 */
  { name: 'didot', aliases: ['迪多点'], dimension: 'length', factor: 0.0003759715, note: 'Didot 点 ≈ 0.376 mm（欧洲大陆活字）', system: 'imperial' },
  { name: 'cicero', aliases: ['西塞罗'], dimension: 'length', factor: 0.004511658, note: 'Cicero = 12 Didot 点 ≈ 4.512 mm', system: 'imperial' },
  /** 圆密尔（电线规格）。 */
  { name: 'circular_mil', aliases: ['圆密尔'], dimension: 'area', factor: 5.067074790974977e-10, note: '1 圆密尔 = π/4 × mil² ≈ 5.067e-10 m²（**AWG 电线规格的基准**）', system: 'imperial' },
]

/**
 * ## 英制面积（测量与地籍）
 */
export const IMPERIAL_AREA_EXT: UnitEntry[] = [
  { name: 'acre_us', aliases: ['美制英亩'], dimension: 'area', factor: 4046.872609874252, note: '美制英亩 = 160 rd_us²（比国际英亩大 0.004%）', system: 'us' },
  { name: 'acre_br', aliases: ['英制英亩'], dimension: 'area', factor: 4046.8564224, note: '英制英亩 = 4840 yd_br²', system: 'imperial' },
  { name: 'section', aliases: ['平方英里区'], dimension: 'area', factor: 2589998.470319521, note: '1 section = 1 平方英里（美国公地测量：640 acre）', system: 'us' },
  { name: 'township', aliases: ['镇区'], dimension: 'area', factor: 93239944.93150276, note: '1 township = 36 section = 6×6 mile', system: 'us' },
  { name: 'square_rod', aliases: ['平方杆'], dimension: 'area', factor: 25.29285264, note: '1 平方杆 = rd² ≈ 25.29 m²', system: 'imperial' },
]

/**
 * ## 英制容积（干量 vs 液量 —— 最容易混的一块）
 *
 * ★ **干量加仑 ≠ 液量加仑**。
 *
 * ```
 *   美制液量加仑 = 231 in³ = 3.785 L
 *   美制干量加仑（Winchester）= 1/8 bu_us = 4.405 L     ← 差 16%
 * ```
 */
export const IMPERIAL_VOLUME_EXT: UnitEntry[] = [
  { name: 'minim_us', aliases: ['美制量滴'], dimension: 'volume', factor: 6.1611519921875e-8, note: '1 minim = 1/60 液量打兰 ≈ 0.0616 mL（药剂最小单位）', system: 'us' },
  { name: 'minim_br', aliases: ['英制量滴'], dimension: 'volume', factor: 5.9193880208333e-8, note: '1 英制 minim ≈ 0.0592 mL', system: 'imperial' },
  { name: 'fluiddram_us', aliases: ['美制液量打兰'], dimension: 'volume', factor: 3.6966911953125e-6, note: '1 液量打兰 = 1/8 fl oz ≈ 3.697 mL', system: 'us' },
  { name: 'teaspoon_us', aliases: ['美制茶匙'], dimension: 'volume', factor: 4.92892159375e-6, note: '1 茶匙 = 1/6 fl oz ≈ 4.929 mL', system: 'us' },
  { name: 'tablespoon_us', aliases: ['美制汤匙'], dimension: 'volume', factor: 1.478676478125e-5, note: '1 汤匙 = 1/2 fl oz ≈ 14.79 mL', system: 'us' },
  { name: 'cup_us', aliases: ['美制杯'], dimension: 'volume', factor: 0.0002365882365, note: '1 美制杯 = 8 fl oz ≈ 236.6 mL', system: 'us' },
  /** 干量 —— 与液量分开。 */
  { name: 'bushel_us', aliases: ['美制蒲式耳'], dimension: 'volume', factor: 0.03523907016688, note: '1 美制蒲式耳 = 2150.42 in³ = 35.239 L（谷物；**与英制 36.369 L 不同**）', system: 'us' },
  { name: 'peck_us', aliases: ['美制配克'], dimension: 'volume', factor: 0.00880976754172, note: '1 美制配克 = 1/4 bu = 8.810 L', system: 'us' },
  { name: 'dry_quart_us', aliases: ['美制干夸脱'], dimension: 'volume', factor: 0.001101220942715, note: '1 干夸脱 = 1/8 pk = 1.101 L', system: 'us' },
  { name: 'dry_pint_us', aliases: ['美制干品脱'], dimension: 'volume', factor: 0.0005506104713575, note: '1 干品脱 = 1/2 干夸脱 = 550.6 mL', system: 'us' },
  /** Winchester 加仑（1101 年英国标准，历史单位）。 */
  { name: 'gallon_winchester', aliases: ['温彻斯特加仑'], dimension: 'volume', factor: 0.00440488377086, note: 'Winchester 加仑 = 1/8 bu_us = 4.405 L（**1101 年 Winchester 标准**，比液量加仑大 16%）', system: 'medieval' },
  /** 木材。 */
  { name: 'board_foot', aliases: ['板英尺'], dimension: 'volume', factor: 0.002359737216, note: '1 板英尺 = 144 in³ = 12×12×1 in ≈ 2.36 L（**木材交易标准**）', system: 'imperial' },
  { name: 'cord', aliases: ['考得'], dimension: 'volume', factor: 3.624556363776, note: '1 cord = 128 ft³ = 3.625 m³（柴堆：4×4×8 ft）', system: 'imperial' },
  { name: 'stere', aliases: ['层积立方米'], dimension: 'volume', factor: 1, note: '1 stere = 1 m³（欧洲木材计量，与 cord 对应）', system: 'imperial' },
]

/**
 * ## 英制质量（药衡 apothecary —— 与金衡 troy 不同！）
 *
 * ★ **三套衡制的细分方式不同**：
 *
 * ```
 *   常衡 avoirdupois   1 lb = 16 oz = 7000 grain     货物
 *   金衡 troy          1 lb = 12 oz = 5760 grain     贵金属
 *   药衡 apothecary    1 lb = 12 oz = 5760 grain     药剂
 *                     但细分：1 oz = 8 dram = 24 scruple = 480 grain
 *                            （金衡：1 oz = 20 dwt = 480 grain）
 * ```
 *
 * 药衡与金衡的**磅与盎司相同**，但**细分链不同**。
 */
export const IMPERIAL_MASS_EXT: UnitEntry[] = [
  { name: 'scruple', aliases: ['斯克鲁普'], dimension: 'mass', factor: 0.0012959782, note: '1 scruple = 20 grain ≈ 1.296 g（药衡最小单位）', system: 'imperial' },
  { name: 'dram_ap', aliases: ['药衡打兰'], dimension: 'mass', factor: 0.0038879346, note: '1 药衡打兰 = 3 scruple = 60 grain ≈ 3.888 g', system: 'imperial' },
  { name: 'ounce_ap', aliases: ['药衡盎司'], dimension: 'mass', factor: 0.0311034768, note: '1 药衡盎司 = 8 药衡打兰 = 480 grain ≈ 31.103 g（**与金衡盎司同值**）', system: 'imperial' },
  { name: 'pound_ap', aliases: ['药衡磅'], dimension: 'mass', factor: 0.3732417216, note: '1 药衡磅 = 12 药衡盎司 ≈ 373.24 g（**与金衡磅同值**）', system: 'imperial' },
  /** 金衡细分。 */
  { name: 'mite', aliases: ['螨重'], dimension: 'mass', factor: 0.0000032399455, note: '1 mite = 1/20 grain ≈ 3.24 mg（药衡极小单位）', system: 'imperial' },
  /** 纺织。 */
  { name: 'tex', aliases: ['特克斯'], dimension: 'linear_density', factor: 1e-6, note: '1 tex = 1 g/km（纤维细度国际标准）', system: 'imperial' },
  { name: 'denier', aliases: ['但尼尔'], dimension: 'linear_density', factor: 1.1111111111e-7, note: '1 denier = 1 g/9km（**丝袜与化纤的细度单位**）', system: 'imperial' },
]

/**
 * ## 六种 BTU 与五种卡路里（差 0.5%，但写锅炉时必须说清）
 */
export const ENERGY_VARIANTS: UnitEntry[] = [
  { name: 'btu_39', aliases: ['BTU39'], dimension: 'energy', factor: 1059.67, note: 'BTU @39°F = 1.05967 kJ（James Watt 原始定义温度）', system: 'imperial' },
  { name: 'btu_59', aliases: ['BTU59'], dimension: 'energy', factor: 1054.8, note: 'BTU @59°F = 1.05480 kJ', system: 'imperial' },
  { name: 'btu_60', aliases: ['BTU60'], dimension: 'energy', factor: 1054.68, note: 'BTU @60°F = 1.05468 kJ', system: 'imperial' },
  { name: 'btu_mean', aliases: ['BTU平均'], dimension: 'energy', factor: 1055.87, note: '平均 BTU = 1.05587 kJ（0–100°C 积分平均）', system: 'imperial' },
  { name: 'btu_it', aliases: ['BTU国际表'], dimension: 'energy', factor: 1055.05585262, note: '★ 国际表 BTU = 1.0550558 kJ（**最常用，工程标准**）', system: 'imperial' },
  { name: 'btu_th', aliases: ['BTU热化学'], dimension: 'energy', factor: 1054.35, note: '热化学 BTU = 1.054350 kJ', system: 'imperial' },
  /** 卡路里变体。 */
  { name: 'cal_15', aliases: ['卡15'], dimension: 'energy', factor: 4.1858, note: '15°C 卡 = 4.1858 J', system: 'imperial' },
  { name: 'cal_20', aliases: ['卡20'], dimension: 'energy', factor: 4.1819, note: '20°C 卡 = 4.1819 J', system: 'imperial' },
  { name: 'cal_it', aliases: ['卡国际表'], dimension: 'energy', factor: 4.1868, note: '国际表卡 = 4.1868 J（蒸汽表常用）', system: 'imperial' },
  { name: 'cal_th', aliases: ['卡热化学'], dimension: 'energy', factor: 4.184, note: '热化学卡 = 4.184 J（精确定义）', system: 'imperial' },
  { name: 'food_calorie', aliases: ['大卡'], dimension: 'energy', factor: 4184, note: '1 食物卡（大卡）= 1 kcal_th = 4184 J', system: 'imperial' },
]

/**
 * ## 其他工业单位（工程与医疗）
 */
export const MISC_INDUSTRIAL: UnitEntry[] = [
  /** 压强补充。 */
  { name: 'technical_atmosphere', aliases: ['工程大气压'], dimension: 'pressure', factor: 98066.5, note: '1 at = 1 kgf/cm² = 98.0665 kPa（**欧洲工程界常用**，与标准大气压 101.325 不同）', system: 'imperial' },
  { name: 'meter_water', aliases: ['米水柱'], dimension: 'pressure', factor: 9806.65, note: '1 mH₂O = 9.80665 kPa（泵扬程）', system: 'imperial' },
  { name: 'meter_mercury', aliases: ['米汞柱'], dimension: 'pressure', factor: 133322, note: '1 mHg = 133.322 kPa', system: 'imperial' },
  /** 粘度（蒸汽机润滑）。 */
  { name: 'poise', aliases: ['泊'], dimension: 'dynamic_viscosity', factor: 0.1, note: '1 P = 0.1 Pa·s（动力粘度，CGS）', system: 'imperial' },
  { name: 'stokes', aliases: ['斯托克斯'], dimension: 'kinematic_viscosity', factor: 0.0001, note: '1 St = 1 cm²/s = 1e-4 m²/s（运动粘度，CGS）', system: 'imperial' },
  /** 功率补充。 */
  { name: 'hp_electric', aliases: ['电马力'], dimension: 'power', factor: 746, note: '1 电马力 = 746 W（电动机铭牌）', system: 'imperial' },
  { name: 'hp_metric', aliases: ['公制马力'], dimension: 'power', factor: 735.49875, note: '1 PS = 735.5 W（**与机械马力 745.7 差 1.4%**，欧洲常用）', system: 'imperial' },
  /** 声学。 */
  { name: 'neper', aliases: ['奈培'], dimension: 'ratio', factor: 1, note: '1 Np = 8.686 dB（自然对数衰减）', system: 'imperial' },
  /** 筛网与线径。 */
  { name: 'mesh', aliases: ['目'], dimension: 'inverse_length', factor: 39.37007874, note: '1 mesh = 1/英寸 ≈ 39.37 /m（筛网目数）', system: 'imperial' },
]

/** 全部补充单位。 */
export const IMPERIAL_EXT_UNITS: UnitEntry[] = [
  ...IMPERIAL_LENGTH_EXT,
  ...IMPERIAL_AREA_EXT,
  ...IMPERIAL_VOLUME_EXT,
  ...IMPERIAL_MASS_EXT,
  ...ENERGY_VARIANTS,
  ...MISC_INDUSTRIAL,
]
