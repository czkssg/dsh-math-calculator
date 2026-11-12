/**
 * 中国近代市制细分与古今计数单位。
 *
 * ## 为什么要单独一层
 *
 * 老单位表有「市尺」「市斤」等大单位，但**细分进制不完整**：
 *
 * ```
 *   长度   市尺 → 市寸 → 市分 → 市厘 → 市毫 → 市丝
 *   质量   市斤 → 市两 → 市钱 → 市分 → 市厘 → 市毫 → 市丝
 *   容量   市升 → 市合 → 市勺 → 市撮
 *   面积   市亩 → 市分 → 市厘 → 市毫
 * ```
 *
 * 而写古代/近代设定时，作者会说「三亩五分地」「二两七钱银」——
 * **不补细分，这些都没法算**。
 *
 * ## 两套中国市制的关键差异（1929 前后）
 *
 * ```
 *   清代库平制   1 斤 = 596.816 g，1 斤 = 16 两
 *   1929 市制    1 斤 = 500 g，    1 斤 = 16 两（1959 改为 10 两）
 *   1959 后      1 斤 = 500 g，    1 斤 = 10 两
 * ```
 *
 * 「一两」在清代是 37.3 g、1929 后是 31.25 g、1959 后是 50 g —— **三种值**。
 * 这里是 1929 市制（沿用至今的「市」前缀体系）。
 *
 * @module dsh-math-calculator/core/units-cn-market
 */

import type { UnitEntry } from './units-imperial.js'

/**
 * ## 长度细分（1 市尺 = 1/3 m）
 *
 * 十进制：尺 → 寸 → 分 → 厘 → 毫 → 丝
 */
export const CN_LENGTH_UNITS: UnitEntry[] = [
  /**
   * ⚠ 市尺用独立名 `cnshichi`，**不能复用 `cnchi`**。
   *
   * `cnchi` 在 `cjk-units.ts` 里已定义为 32 cm（明清营造尺）。
   * 若复用同一名字，后注册的会覆盖先注册的 —— 而「覆盖」在这里
   * 表现为「同一个词算出两个差 4% 的值」，属于最难查的一类错。
   */
  { name: 'cnshichi', aliases: ['市尺'], dimension: 'length', factor: 0.33333333333, note: '1 市尺 = 1/3 m（1929 市制）；与营造尺 32cm 差 4%', system: 'cn' },
  { name: 'cncun_market', aliases: ['市寸'], dimension: 'length', factor: 0.03333333333, note: '1 市寸 = 1/10 市尺 = 3.333 cm', system: 'cn' },
  { name: 'cnfen_length', aliases: ['市分'], dimension: 'length', factor: 0.00333333333, note: '1 市分 = 1/10 市寸 = 3.333 mm', system: 'cn' },
  { name: 'cnli_length', aliases: ['市厘'], dimension: 'length', factor: 0.00033333333, note: '1 市厘 = 1/10 市分 = 0.333 mm', system: 'cn' },
  { name: 'cnhao_length', aliases: ['市毫'], dimension: 'length', factor: 0.00003333333, note: '1 市毫 = 1/10 市厘 = 33.3 µm', system: 'cn' },
  { name: 'cnsi_length', aliases: ['市丝'], dimension: 'length', factor: 0.00000333333, note: '1 市丝 = 1/10 市毫 = 3.33 µm', system: 'cn' },
]

/**
 * ## 质量细分（1 市斤 = 500 g，16 两制）
 *
 * 十进制细分 + 16 两制上层
 */
export const CN_MASS_UNITS: UnitEntry[] = [
  { name: 'cnjin_market', aliases: ['市斤'], dimension: 'mass', factor: 0.5, note: '1 市斤 = 500 g（1929 市制，16 两）', system: 'cn' },
  { name: 'cnliang_market', aliases: ['市两'], dimension: 'mass', factor: 0.03125, note: '1 市两 = 1/16 市斤 = 31.25 g（1929 制）', system: 'cn' },
  { name: 'cnqian', aliases: ['市钱', '钱'], dimension: 'mass', factor: 0.003125, note: '1 市钱 = 1/10 市两 = 3.125 g', system: 'cn' },
  { name: 'cnfen_mass', aliases: ['市分重'], dimension: 'mass', factor: 0.0003125, note: '1 市分 = 1/10 市钱 = 0.3125 g', system: 'cn' },
  { name: 'cnli_mass', aliases: ['市厘重'], dimension: 'mass', factor: 0.00003125, note: '1 市厘 = 1/10 市分 = 31.25 mg', system: 'cn' },
  { name: 'cnhao_mass', aliases: ['市毫重'], dimension: 'mass', factor: 0.000003125, note: '1 市毫 = 1/10 市厘 = 3.125 mg', system: 'cn' },
  { name: 'cnsi_mass', aliases: ['市丝重'], dimension: 'mass', factor: 0.0000003125, note: '1 市丝 = 1/10 市毫 = 0.3125 mg', system: 'cn' },
  /** 更大的商用单位。 */
  { name: 'cndan_market', aliases: ['市担'], dimension: 'mass', factor: 50, note: '1 市担 = 100 市斤 = 50 kg', system: 'cn' },
]

/**
 * ## 容量细分（1 市升 = 1 L）
 */
export const CN_VOLUME_UNITS: UnitEntry[] = [
  { name: 'cnsheng_market', aliases: ['市升'], dimension: 'volume', factor: 0.001, note: '1 市升 = 1 L（1929 市制）', system: 'cn' },
  { name: 'cnhe', aliases: ['市合'], dimension: 'volume', factor: 0.0001, note: '1 市合 = 1/10 市升 = 100 mL', system: 'cn' },
  { name: 'cnshao', aliases: ['市勺'], dimension: 'volume', factor: 0.00001, note: '1 市勺 = 1/10 市合 = 10 mL', system: 'cn' },
  { name: 'cncuo', aliases: ['市撮'], dimension: 'volume', factor: 0.000001, note: '1 市撮 = 1/10 市勺 = 1 mL', system: 'cn' },
  { name: 'cndou_market', aliases: ['市斗'], dimension: 'volume', factor: 0.01, note: '1 市斗 = 10 市升 = 10 L', system: 'cn' },
  { name: 'cndan_volume', aliases: ['市石'], dimension: 'volume', factor: 0.1, note: '1 市石 = 10 市斗 = 100 L', system: 'cn' },
]

/**
 * ## 面积细分（1 市亩 ≈ 666.7 m²）
 */
export const CN_AREA_UNITS: UnitEntry[] = [
  { name: 'cnmu_market', aliases: ['市亩'], dimension: 'area', factor: 666.66666666, note: '1 市亩 = 60 平方丈 ≈ 666.7 m²（1929 市制）', system: 'cn' },
  { name: 'cnfen_area', aliases: ['市分地'], dimension: 'area', factor: 66.66666666, note: '1 市分 = 1/10 市亩 = 66.67 m²（「三亩五分地」的「分」）', system: 'cn' },
  { name: 'cnli_area', aliases: ['市厘地'], dimension: 'area', factor: 6.66666666, note: '1 市厘 = 1/10 市分 = 6.667 m²', system: 'cn' },
  { name: 'cnhao_area', aliases: ['市毫地'], dimension: 'area', factor: 0.66666666, note: '1 市毫 = 1/10 市厘 = 0.667 m²', system: 'cn' },
  { name: 'cnqing_market', aliases: ['市顷'], dimension: 'area', factor: 66666.666666, note: '1 市顷 = 100 市亩 ≈ 6.667 ha', system: 'cn' },
]

/**
 * ## 中国古今计数与货币单位
 *
 * 这些在古文与设定里频繁出现，且**不是十进制**。
 */
export const CN_COUNT_UNITS: UnitEntry[] = [
  { name: 'cn_wan', aliases: ['万'], dimension: 'count', factor: 10000, note: '1 万 = 10⁴', system: 'cn' },
  { name: 'cn_yi', aliases: ['亿'], dimension: 'count', factor: 100000000, note: '1 亿 = 10⁸（现代）；**古制「亿」有 10⁵ 与 10⁸ 两说**', system: 'cn' },
  { name: 'cn_zhao', aliases: ['兆'], dimension: 'count', factor: 1000000000000, note: '1 兆 = 10¹²（现代）；古制「兆」= 10⁶ 或 10¹⁶，随朝代变', system: 'cn' },
  { name: 'cn_jing', aliases: ['京'], dimension: 'count', factor: 10000000000000000, note: '1 京 = 10¹⁶（《数术记遗》万进法）', system: 'cn' },
  /** 古籍常用「什」「佰」「仟」。 */
  { name: 'cn_shi', aliases: ['什'], dimension: 'count', factor: 10, note: '1 什 = 10（军队「什伍」之制）', system: 'cn' },
  { name: 'cn_bai', aliases: ['佰'], dimension: 'count', factor: 100, note: '1 佰 = 100', system: 'cn' },
  { name: 'cn_qian', aliases: ['仟'], dimension: 'count', factor: 1000, note: '1 仟 = 1000', system: 'cn' },
]

/** 全部中国市制细分。 */
export const CN_MARKET_UNITS: UnitEntry[] = [
  ...CN_LENGTH_UNITS,
  ...CN_MASS_UNITS,
  ...CN_VOLUME_UNITS,
  ...CN_AREA_UNITS,
  ...CN_COUNT_UNITS,
]
