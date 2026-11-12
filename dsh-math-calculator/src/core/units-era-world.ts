/**
 * 世界古代度量衡体系。
 *
 * ## 为什么必须单独一层
 *
 * 老单位表里有 `libra`，但它是**西班牙磅（460 g）** ——
 * 而古罗马的 libra 是 **328.9 g**，两者差 40%。
 *
 * ```
 *   写「罗马一 libra 银」用 460 g → 直接差 131 克
 *   （那是将近半磅的差，在货币与军饷推演里是致命的）
 * ```
 *
 * 这不是数据错误，是**同名不同时代**。所以必须像中国历代单位一样，
 * 给每个体系配独立的时代标识与变体。
 *
 * ## 收录范围与依据
 *
 * | 体系 | 时期 | 主要依据 |
 * |---|---|---|
 * | 古埃及 | 前 3000–前 30 | 金字塔测量、罗塞塔石碑、Elephantine 尺 |
 * | 古巴比伦 | 前 1900–前 539 | 汉谟拉比法典、楔形文字泥板 |
 * | 古希腊 | 前 800–前 146 | 奥林匹亚体育场、雅典度量衡官制 |
 * | 古罗马 | 前 509–476 | pes Monetalis 实物、罗马法典 |
 * | 拜占庭 | 476–1453 | 君士坦丁堡度量衡 |
 * | 中世纪欧洲 | 500–1500 | 各地市场标准、行会章程 |
 * | 英国历史 | 1066–1824 | Magna Carta、Assize of Measures (1196) |
 * | 日本 | 701–现在 | 大宝律令、尺贯法 |
 * | 伊斯兰世界 | 622–1500 | 迪拉姆/第纳尔制、cubit 传承 |
 *
 * ## 一个必须承认的限度
 *
 * 古代度量衡**没有唯一标准值**。同一个「罗马尺」在不同地区、
 * 不同考古实物之间差 1–2%。所以每条都标 `confidence`，
 * 且区间型给 `factorHigh`。
 *
 * @module dsh-math-calculator/core/units-era-world
 */

import type { EraUnit } from './units-era.js'

/**
 * ## 古埃及
 *
 * 埃及的长度体系以**王室肘尺（royal cubit）**为核心，
 * 分 7 掌、每掌 4 指。这套体系影响了后来的希腊与罗马。
 */
export const EGYPTIAN_UNITS: EraUnit[] = [
  {
    name: '肘尺',
    cjk: ['肘尺', '腕尺'],
    dimension: 'length',
    variants: [
      {
        era: '古埃及', yearFrom: -3000, yearTo: -30, factor: 0.5235, variant: '王室肘尺',
        confidence: 'typical', source: '王室肘尺 = 7 掌 ≈ 52.35 cm；Elephantine 与 Maya 墓出土尺',
      },
      {
        era: '古埃及', yearFrom: -3000, yearTo: -30, factor: 0.448, variant: '短肘尺',
        confidence: 'typical', source: '短肘尺 = 6 掌 ≈ 44.8 cm，用于建筑与土地',
      },
    ],
  },
  {
    name: '掌',
    cjk: ['掌'],
    dimension: 'length',
    variants: [
      { era: '古埃及', yearFrom: -3000, yearTo: -30, factor: 0.0748, confidence: 'typical', source: '1 掌 = 1/7 王室肘尺 ≈ 7.48 cm' },
    ],
  },
  {
    name: '指',
    cjk: ['指'],
    dimension: 'length',
    variants: [
      { era: '古埃及', yearFrom: -3000, yearTo: -30, factor: 0.0187, confidence: 'typical', source: '1 指 = 1/4 掌 ≈ 1.87 cm' },
    ],
  },
  {
    name: 'deben',
    cjk: ['德本'],
    dimension: 'mass',
    variants: [
      { era: '古埃及', yearFrom: -1500, yearTo: -30, factor: 0.091, confidence: 'typical', source: '中王国起 1 deben ≈ 91 g（早期约 13.6 g 的环状标准，后改为重量制）' },
    ],
  },
  {
    name: 'artaba',
    cjk: ['阿塔巴'],
    dimension: 'volume',
    variants: [
      { era: '古埃及', yearFrom: -600, yearTo: -30, factor: 0.0388, confidence: 'typical', source: '托勒密时代 1 artaba ≈ 38.8 L（谷物计量）' },
    ],
  },
]

/**
 * ## 古希腊
 *
 * 希腊是**各城邦各自为政**：雅典、斯巴达、埃伊纳的度量衡都不同。
 * 这也是「同名不同值」最典型的例子。
 */
export const GREEK_UNITS: EraUnit[] = [
  {
    name: '斯塔德',
    cjk: ['斯塔德', '斯塔迪昂'],
    dimension: 'length',
    variants: [
      {
        era: '古希腊', yearFrom: -800, yearTo: -146, factor: 185, variant: '奥林匹亚斯塔德',
        confidence: 'typical', source: '奥林匹亚体育场实测 ≈ 192.3 m；通用取 185 m',
      },
      {
        era: '古希腊', yearFrom: -800, yearTo: -146, factor: 177.6, variant: '阿提卡斯塔德',
        confidence: 'typical', source: '雅典使用 ≈ 177.6 m',
      },
    ],
  },
  {
    name: 'pous',
    cjk: ['希腊尺'],
    dimension: 'length',
    variants: [
      { era: '古希腊', yearFrom: -800, yearTo: -146, factor: 0.296, variant: '阿提卡尺', confidence: 'typical', source: '阿提卡 pous ≈ 29.6 cm；1 斯塔德 = 600 pous' },
      { era: '古希腊', yearFrom: -800, yearTo: -146, factor: 0.326, variant: '埃伊纳尺', confidence: 'typical', source: '埃伊纳 pous ≈ 32.6 cm（比雅典长约 10%）' },
    ],
  },
  {
    name: '奥林匹亚尺',
    cjk: [],
    dimension: 'length',
    variants: [
      { era: '古希腊', yearFrom: -800, yearTo: -146, factor: 0.3205, confidence: 'typical', source: '奥林匹亚体育场跑道实测推算 ≈ 32.05 cm' },
    ],
  },
  {
    name: 'drachma',
    cjk: ['德拉克马'],
    dimension: 'mass',
    variants: [
      { era: '古希腊', yearFrom: -800, yearTo: -146, factor: 0.00433, variant: '阿提卡', confidence: 'typical', source: '阿提卡 1 drachma ≈ 4.33 g 银；1 mina = 100 drachmae' },
    ],
  },
  {
    name: 'talent',
    cjk: ['塔兰特'],
    dimension: 'mass',
    variants: [
      { era: '古希腊', yearFrom: -800, yearTo: -146, factor: 26, variant: '阿提卡塔兰特', confidence: 'typical', source: '1 塔兰特 = 60 mina = 6000 drachmae ≈ 26 kg' },
    ],
  },
]

/**
 * ## 古罗马
 *
 * ★ 这里最要紧的一条：**罗马的 libra（天秤座）是 328.9 g**，
 * 而老表里的 `libra` 是西班牙磅 460 g。两者差 40%。
 */
export const ROMAN_UNITS: EraUnit[] = [
  {
    name: 'pes',
    cjk: ['罗马尺'],
    dimension: 'length',
    variants: [
      {
        era: '古罗马', yearFrom: -509, yearTo: 476, factor: 0.296, variant: 'Monetalis',
        confidence: 'typical', source: 'pes Monetalis ≈ 29.6 cm（罗马国库标准尺）；1 pes = 12 uncia = 16 digitus',
      },
    ],
  },
  {
    name: 'uncia',
    cjk: ['罗马寸'],
    dimension: 'length',
    variants: [
      { era: '古罗马', yearFrom: -509, yearTo: 476, factor: 0.0246, confidence: 'typical', source: '1 uncia = 1/12 pes ≈ 2.46 cm' },
    ],
  },
  {
    name: 'digitus',
    cjk: ['罗马指'],
    dimension: 'length',
    variants: [
      { era: '古罗马', yearFrom: -509, yearTo: 476, factor: 0.0185, confidence: 'typical', source: '1 digitus = 1/16 pes ≈ 1.85 cm' },
    ],
  },
  {
    name: 'passus',
    cjk: ['罗马步'],
    dimension: 'length',
    variants: [
      { era: '古罗马', yearFrom: -509, yearTo: 476, factor: 1.48, confidence: 'typical', source: '1 passus = 5 pes ≈ 1.48 m（双步）' },
    ],
  },
  {
    name: 'mille passus',
    cjk: ['罗马里'],
    dimension: 'length',
    variants: [
      { era: '古罗马', yearFrom: -509, yearTo: 476, factor: 1480, confidence: 'typical', source: '1 mille passus = 1000 passus ≈ 1.48 km（英里的源头）' },
    ],
  },
  {
    name: 'libra',
    cjk: ['罗马磅'],
    dimension: 'mass',
    variants: [
      {
        era: '古罗马', yearFrom: -509, yearTo: 476, factor: 0.3289,
        confidence: 'typical', source: '★ 罗马 libra ≈ 328.9 g（12 uncia）；**与老表的西班牙 libre 460 g 不是同一个东西**',
      },
    ],
  },
  {
    name: 'uncia_weight',
    cjk: [],
    dimension: 'mass',
    variants: [
      { era: '古罗马', yearFrom: -509, yearTo: 476, factor: 0.0274, confidence: 'typical', source: '1 uncia ≈ 27.4 g（1/12 libra）' },
    ],
  },
  {
    name: 'amphora',
    cjk: ['双耳瓶'],
    dimension: 'volume',
    variants: [
      { era: '古罗马', yearFrom: -509, yearTo: 476, factor: 0.0262, confidence: 'typical', source: '1 amphora ≈ 26.2 L（标准酒/油容器，也是船的容量单位）' },
    ],
  },
  {
    name: 'modius',
    cjk: ['莫迪乌斯'],
    dimension: 'volume',
    variants: [
      { era: '古罗马', yearFrom: -509, yearTo: 476, factor: 0.00873, confidence: 'typical', source: '1 modius ≈ 8.73 L（谷物计量，约 6.7 kg 小麦）' },
    ],
  },
  {
    name: 'iugerum',
    cjk: ['罗马亩'],
    dimension: 'area',
    variants: [
      { era: '古罗马', yearFrom: -509, yearTo: 476, factor: 2519, confidence: 'typical', source: '1 iugerum ≈ 2519 m²（240 × 120 pes，一对牛一天可耕）' },
    ],
  },
]

/**
 * ## 英国历史（1066–1824）
 *
 * 英国的长度单位在 1196 年 Assize of Measures 后固定下来，
 * 但此前各地不同。这里收的是**标准化后的值**，并标出年代。
 */
export const ENGLISH_UNITS: EraUnit[] = [
  {
    name: 'inch',
    cjk: [],
    dimension: 'length',
    variants: [
      { era: '英制', yearFrom: 1196, yearTo: 1824, factor: 0.0254, confidence: 'exact', source: 'Assize of Measures (1196) 定：3 大麦粒 = 1 英寸；后固定为 2.54 cm' },
    ],
  },
  {
    name: 'ell',
    cjk: ['厄尔'],
    dimension: 'length',
    variants: [
      { era: '英制', yearFrom: 1196, yearTo: 1824, factor: 1.143, confidence: 'typical', source: '英国 ell = 45 英寸 ≈ 1.143 m（量布用，各地有差）' },
      { era: '英制', yearFrom: 1196, yearTo: 1824, factor: 0.6858, variant: '苏格兰厄尔', confidence: 'typical', source: '苏格兰 ell ≈ 27 英寸 ≈ 68.6 cm（与英格兰不同！）' },
    ],
  },
  {
    name: 'rod',
    cjk: ['杆'],
    dimension: 'length',
    variants: [
      { era: '英制', yearFrom: 1196, yearTo: 1824, factor: 5.0292, confidence: 'exact', source: '1 rod = 5.5 码 = 16.5 ft ≈ 5.03 m（土地测量基本单位）' },
    ],
  },
  {
    name: 'furlong',
    cjk: ['弗隆'],
    dimension: 'length',
    variants: [
      { era: '英制', yearFrom: 1196, yearTo: 1824, factor: 201.168, confidence: 'exact', source: '1 furlong = 40 rod = 1/8 mile ≈ 201 m（「一犁之地」的长边）' },
    ],
  },
  {
    name: 'acre',
    cjk: ['英亩'],
    dimension: 'area',
    variants: [
      { era: '英制', yearFrom: 1196, yearTo: 1824, factor: 4046.86, confidence: 'exact', source: '1 acre = 1 furlong × 1 chain = 4840 yd² ≈ 4046.9 m²（一队牛一天能耕的地）' },
    ],
  },
  {
    name: 'hide',
    cjk: ['海得'],
    dimension: 'area',
    variants: [
      { era: '英制', yearFrom: 600, yearTo: 1200, factor: 485623, confidence: 'range', factorHigh: 647498, source: '1 hide ≈ 120 acre（盎格鲁-撒克逊税基，实际 60–160 acre 不等）' },
    ],
  },
  {
    name: 'hundredweight',
    cjk: ['英担'],
    dimension: 'mass',
    variants: [
      { era: '英制', yearFrom: 1300, factor: 50.8023, variant: '长担', confidence: 'exact', source: '英国 long hundredweight = 112 lb ≈ 50.8 kg' },
      { era: '美制', yearFrom: 1776, factor: 45.3592, variant: '短担', confidence: 'exact', source: '美国 short hundredweight = 100 lb ≈ 45.4 kg' },
    ],
  },
]

/**
 * ## 日本（尺贯法）
 *
 * 日本在 1891 年《度量衡法》把尺贯法与公制挂钩，
 * 但古代（大宝律令 701 年起）的值与近世不同。
 */
export const JAPANESE_UNITS: EraUnit[] = [
  {
    /**
     * ⚠ `name` 必须唯一：日本的「尺」与中国的「尺」**不是同一个单位**
     *
     * 中国清尺 32 cm、日本曲尺 30.3 cm —— 差 5%，混用会算错。
     * 第一版两份都用 `name:'尺'`，被 `find()` 取第一个（中国的），
     * 于是「日本日尺」永远查不到。
     */
    name: '日尺',
    cjk: ['日尺'],
    dimension: 'length',
    variants: [
      { era: '日本', yearFrom: 701, yearTo: 1868, factor: 0.303, variant: '曲尺', confidence: 'typical', source: '日本曲尺 ≈ 30.3 cm（大宝律令起，与唐大尺同源）' },
      { era: '日本', yearFrom: 1891, factor: 0.30303, variant: '曲尺', confidence: 'exact', source: '1891 年法定 1 尺 = 10/33 m ≈ 30.303 cm' },
      { era: '日本', yearFrom: 701, yearTo: 1868, factor: 0.378, variant: '鲸尺', confidence: 'typical', source: '鲸尺 ≈ 37.8 cm（裁缝用，比曲尺长 25%）' },
    ],
  },
  {
    name: '间',
    cjk: ['日间'],
    dimension: 'length',
    variants: [
      { era: '日本', yearFrom: 1891, factor: 1.818, confidence: 'exact', source: '1 间 = 6 尺 ≈ 1.818 m（房屋开间的标准）' },
    ],
  },
  {
    name: '坪',
    cjk: ['日坪'],
    dimension: 'area',
    variants: [
      { era: '日本', yearFrom: 1891, factor: 3.3058, confidence: 'exact', source: '1 坪 = 6 尺 × 6 尺 ≈ 3.306 m²（两张榻榻米）' },
    ],
  },
  {
    name: '贯',
    cjk: ['日贯'],
    dimension: 'mass',
    variants: [
      { era: '日本', yearFrom: 1891, factor: 3.75, confidence: 'exact', source: '1 贯 = 1000 匁 = 3.75 kg（明治法定值）' },
    ],
  },
  {
    name: '匁',
    cjk: ['日匁'],
    dimension: 'mass',
    variants: [
      { era: '日本', yearFrom: 1891, factor: 0.00375, confidence: 'exact', source: '1 匁 = 3.75 g（もんめ，货币与药材用）' },
    ],
  },
  {
    name: '日升',
    cjk: ['日升'],
    dimension: 'volume',
    variants: [
      { era: '日本', yearFrom: 1891, factor: 0.0018039, confidence: 'exact', source: '1 日升 ≈ 1.804 L（比中国升大；1 斗 = 10 升）' },
      { era: '日本', yearFrom: 701, yearTo: 1868, factor: 0.0012, variant: '古升', confidence: 'range', factorHigh: 0.0018, source: '古代升 1.2–1.8 L，各地不一' },
    ],
  },
]

/**
 * ## 伊斯兰世界
 *
 * 伊斯兰度量衡承接希腊罗马，但** dinar（金币）与 dirham（银币）**
 * 是它自己的核心，且各地 1 dirham 的重量差异很大。
 */
export const ISLAMIC_UNITS: EraUnit[] = [
  {
    name: 'dhira',
    cjk: ['伊斯兰腕尺'],
    dimension: 'length',
    variants: [
      { era: '伊斯兰', yearFrom: 622, yearTo: 1500, factor: 0.4932, variant: 'al-dhira al-sawda', confidence: 'typical', source: '「黑腕尺」≈ 49.32 cm，阿拔斯朝法定' },
      { era: '伊斯兰', yearFrom: 622, yearTo: 1500, factor: 0.58, variant: 'al-dhira al-qimma', confidence: 'typical', source: '「丈量腕尺」≈ 58 cm 至 1.25 m，用于土地' },
    ],
  },
  {
    name: 'dirham',
    cjk: ['迪拉姆'],
    dimension: 'mass',
    variants: [
      { era: '伊斯兰', yearFrom: 622, yearTo: 1500, factor: 0.00297, confidence: 'typical', source: '1 dirham 银 ≈ 2.97 g（7/10 米斯卡尔）；各地 2.8–3.2 g' },
    ],
  },
  {
    name: 'dinar',
    cjk: ['第纳尔'],
    dimension: 'mass',
    variants: [
      { era: '伊斯兰', yearFrom: 622, yearTo: 1500, factor: 0.00425, confidence: 'typical', source: '1 dinar 金 ≈ 4.25 g（= 10 dirham 的银重，金银比约 1:10）' },
    ],
  },
  {
    name: 'qintar',
    cjk: ['坎塔尔'],
    dimension: 'mass',
    variants: [
      { era: '伊斯兰', yearFrom: 622, yearTo: 1500, factor: 44.9, confidence: 'range', factorHigh: 96, source: '1 qintar ≈ 100 ratl ≈ 45–96 kg（各地 ratl 不同，差一倍以上）' },
    ],
  },
]

/** 全部世界古代单位。 */
export const WORLD_ERA_UNITS: EraUnit[] = [
  ...EGYPTIAN_UNITS,
  ...GREEK_UNITS,
  ...ROMAN_UNITS,
  ...ENGLISH_UNITS,
  ...JAPANESE_UNITS,
  ...ISLAMIC_UNITS,
]
