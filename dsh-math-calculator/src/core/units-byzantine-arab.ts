/**
 * 拜占庭与阿拉伯帝国度量衡（第五批）。
 *
 * ## 为什么这两套值得单独做
 *
 * ```
 *   拜占庭  476–1453，跨越千年，是罗马到伊斯兰的桥梁
 *   阿拉伯  622–1258，承接波斯与拜占庭，横跨西班牙到印度
 * ```
 *
 * 这两套体系**直接影响了中世纪欧洲与伊斯兰世界的度量衡**，
 * 而且它们的细分链比现有收录完整得多。
 *
 * ## 依据文献
 *
 * | 体系 | 依据 |
 * |---|---|
 * | 拜占庭 | 《法学汇纂》（Digesta）、《帝国法典》、君士坦丁堡度量衡原器 |
 * | 阿拉伯 | 伊斯兰教法（Sharia）的 zakat 计量、al-Khwarizmi 的算术书、al-Biruni 的《印度志》 |
 *
 * ## ★ 一个必须说清的复杂点
 *
 * 拜占庭的 `litra` **在千年里变了三次**：
 *
 * ```
 *   早期（4–7 世纪）   约 327.45 g    承罗马 libra
 *   中期（8–10 世纪）  约 320 g       略轻
 *   晚期（11–15 世纪） 约 320 g       稳定
 * ```
 *
 * 而阿拉伯的 `ratl`（磅）**在帝国各地差一倍以上** ——
 * 巴格达 ratl 与西班牙 ratl 完全不同。所以这两套的单位都必须给区间或变体。
 *
 * @module dsh-math-calculator/core/units-byzantine-arab
 */

import type { EraUnit } from './units-era.js'

/**
 * ## 拜占庭（476–1453）
 *
 * 拜占庭度量衡承罗马，但**独立演化千年**。
 * 其 `litra` 是欧洲中世纪重量的基准之一。
 */
export const BYZANTINE_DETAIL_UNITS: EraUnit[] = [
  {
    name: 'litra',
    cjk: ['拜占庭磅'],
    dimension: 'mass',
    variants: [
      { era: '拜占庭', yearFrom: 476, yearTo: 700, factor: 0.32745, variant: '早期', confidence: 'typical', source: '早期 litra ≈ 327.45 g（直接承罗马 libra 328.9 g）' },
      { era: '拜占庭', yearFrom: 700, yearTo: 1200, factor: 0.320, variant: '中期', confidence: 'typical', source: '中期 litra ≈ 320 g（**比早期轻 2%**，具体年份不详）' },
      { era: '拜占庭', yearFrom: 1200, yearTo: 1453, factor: 0.318, variant: '晚期', confidence: 'typical', source: '晚期 litra ≈ 318 g（第四次十字军后，受西方影响）' },
    ],
  },
  {
    name: 'ounce_byz',
    cjk: ['拜占庭盎司'],
    dimension: 'mass',
    variants: [
      { era: '拜占庭', yearFrom: 476, yearTo: 1453, factor: 0.02729, confidence: 'typical', source: '1 oungia（盎司）= 1/12 litra ≈ 27.29 g' },
    ],
  },
  {
    name: 'gramma',
    cjk: ['拜占庭格令'],
    dimension: 'mass',
    variants: [
      { era: '拜占庭', yearFrom: 476, yearTo: 1453, factor: 0.003411, confidence: 'typical', source: '1 gramma（格令）= 1/8 oungia ≈ 3.411 g（**比英制 grain 64.8mg 大 52 倍**）' },
    ],
  },
  {
    name: 'keration_byz',
    cjk: ['拜占庭角豆'],
    dimension: 'mass',
    variants: [
      { era: '拜占庭', yearFrom: 476, yearTo: 1453, factor: 0.000218, confidence: 'typical', source: '1 keration（角豆籽）= 1/24 gramma ≈ 0.218 g —— **「克拉」的词源**' },
    ],
  },
  {
    name: 'spathion',
    cjk: ['拜占庭剑尺'],
    dimension: 'length',
    variants: [
      { era: '拜占庭', yearFrom: 476, yearTo: 1453, factor: 0.3114, confidence: 'typical', source: '1 spathion（「剑」）= 1/6 orgyia ≈ 31.14 cm（拜占庭建筑尺）' },
    ],
  },
  {
    name: 'pous_byz',
    cjk: ['拜占庭尺'],
    dimension: 'length',
    variants: [
      { era: '拜占庭', yearFrom: 476, yearTo: 1453, factor: 0.3114, confidence: 'typical', source: '1 pous（拜占庭尺）≈ 31.14 cm（**比罗马 pes 29.6cm 长 5%**）' },
    ],
  },
  {
    name: 'orgyia',
    cjk: ['拜占庭寻'],
    dimension: 'length',
    variants: [
      { era: '拜占庭', yearFrom: 476, yearTo: 1453, factor: 1.8684, confidence: 'typical', source: '1 orgyia（双臂展）= 6 pous ≈ 1.868 m（**航海测深用**）' },
    ],
  },
  {
    name: 'milion',
    cjk: ['拜占庭里'],
    dimension: 'length',
    variants: [
      { era: '拜占庭', yearFrom: 476, yearTo: 1453, factor: 1574.16, confidence: 'typical', source: '1 milion（拜占庭里）= 7.5 斯塔德 ≈ 1.574 km（君士坦丁堡的「金里程柱」以此为基准）' },
    ],
  },
  {
    name: 'modios_byz',
    cjk: ['拜占庭斗'],
    dimension: 'volume',
    variants: [
      { era: '拜占庭', yearFrom: 476, yearTo: 1453, factor: 0.01026, confidence: 'typical', source: '1 modios ≈ 10.26 L（谷物；**与罗马 modius 8.73 L 不同**）' },
    ],
  },
  {
    name: 'xestes',
    cjk: ['拜占庭液量'],
    dimension: 'volume',
    variants: [
      { era: '拜占庭', yearFrom: 476, yearTo: 1453, factor: 0.000547, confidence: 'typical', source: '1 xestes ≈ 0.547 L（罗马 sextarius 的延续）' },
    ],
  },
]

/**
 * ## 阿拉伯帝国（622–1258）
 *
 * ★ 阿拉伯度量衡的核心是**宗教计量**：
 * `saa`（صاع）与 `mudd`（مد）是 zakat（天课）的计量单位，
 * 因此**在教法上有严格定义**，不像商业单位那样各地随意。
 */
export const ARAB_UNITS: EraUnit[] = [
  {
    name: 'ratl',
    cjk: ['阿拉伯磅'],
    dimension: 'mass',
    variants: [
      { era: '阿拉伯', yearFrom: 622, yearTo: 1258, factor: 0.40625, variant: '巴格达', region: '巴格达', confidence: 'typical', source: '1 ratl baghdadi ≈ 406.25 g（**阿拔斯朝标准**，约 130 dirham）' },
      { era: '阿拉伯', yearFrom: 622, yearTo: 1258, factor: 0.4681, variant: '埃及', region: '埃及', confidence: 'typical', source: '1 ratl misri ≈ 468 g（埃及标准，**比巴格达重 15%**）' },
      { era: '阿拉伯', yearFrom: 622, yearTo: 1258, factor: 0.5625, variant: '叙利亚', region: '叙利亚', confidence: 'typical', source: '1 ratl shami ≈ 562.5 g（叙利亚/黎凡特标准，**最重**）' },
    ],
  },
  {
    name: 'mudd',
    cjk: ['阿拉伯莫德'],
    dimension: 'volume',
    variants: [
      { era: '阿拉伯', yearFrom: 622, yearTo: 1258, factor: 0.000543, confidence: 'exact', source: '1 mudd = 1/4 saa ≈ 0.543 L（**教法定义的 zakat 单位**，用于施舍计量）' },
    ],
  },
  {
    name: 'saa',
    cjk: ['阿拉伯萨阿'],
    dimension: 'volume',
    variants: [
      { era: '阿拉伯', yearFrom: 622, yearTo: 1258, factor: 0.002172, confidence: 'exact', source: '1 saa ≈ 2.172 L（**教法定量**：zakat al-fitr 的施舍量约 2.5-3 kg 谷物）' },
    ],
  },
  {
    name: 'qafiz',
    cjk: ['阿拉伯卡菲兹'],
    dimension: 'volume',
    variants: [
      { era: '阿拉伯', yearFrom: 622, yearTo: 1258, factor: 0.0065, confidence: 'range', factorHigh: 0.0091, source: '1 qafiz ≈ 6.5–9.1 L（谷物；各地不同）' },
    ],
  },
  {
    name: 'farsakh_arab',
    cjk: ['阿拉伯法尔萨赫'],
    dimension: 'length',
    variants: [
      { era: '阿拉伯', yearFrom: 622, yearTo: 1258, factor: 5760, confidence: 'typical', source: '1 farsakh ≈ 5.76 km（**阿拉伯语「里」**，源自波斯；比罗马里 1.48km 长 4 倍）' },
    ],
  },
  {
    name: 'mijl',
    cjk: ['阿拉伯英里'],
    dimension: 'length',
    variants: [
      { era: '阿拉伯', yearFrom: 622, yearTo: 1258, factor: 1920, confidence: 'typical', source: '1 mijl ≈ 1.92 km（1/3 farsakh），不是英里的 1.609 km' },
    ],
  },
  {
    name: 'qasaba',
    cjk: ['阿拉伯量地竿'],
    dimension: 'length',
    variants: [
      { era: '阿拉伯', yearFrom: 622, yearTo: 1258, factor: 3.6, confidence: 'typical', source: '1 qasaba（量地竿）≈ 3.6 m（用于土地测量）' },
    ],
  },
  {
    name: 'qintar_arab',
    cjk: ['阿拉伯坎塔尔'],
    dimension: 'mass',
    variants: [
      { era: '阿拉伯', yearFrom: 622, yearTo: 1258, factor: 40.6, confidence: 'range', factorHigh: 96, source: '1 qintar = 100 ratl ≈ 40.6–96 kg（**取决于哪个 ratl** —— 巴格达版 40.6kg，叙利亚版 56kg，埃及版更大）' },
    ],
  },
  {
    name: 'miskal',
    cjk: ['阿拉伯米斯卡尔'],
    dimension: 'mass',
    variants: [
      { era: '阿拉伯', yearFrom: 622, yearTo: 1258, factor: 0.00425, confidence: 'typical', source: '1 mithqal ≈ 4.25 g（**黄金重量单位**；比 dirham 重 1.4 倍，这个比例决定金银比价）' },
    ],
  },
]

/** 全部第五批。 */
export const BYZANTINE_ARAB_UNITS: EraUnit[] = [
  ...BYZANTINE_DETAIL_UNITS,
  ...ARAB_UNITS,
]
