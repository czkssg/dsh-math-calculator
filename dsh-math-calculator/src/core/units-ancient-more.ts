/**
 * 更多古文明度量衡体系（第三批）。
 *
 * ## 数据源与依据
 *
 * | 体系 | 依据文献 |
 * |---|---|
 * | 古巴比伦 | 汉谟拉比法典、楔形文字泥板（Nissen, *Archaische Verwaltungstexte*） |
 * | 古印度 | 《政事论》（Arthashastra）、《摩奴法典》、Hindu 度量衡传统 |
 * | 拜占庭 | 《法学汇纂》、君士坦丁堡度量衡标准 |
 * | 波斯/阿拉伯 | 伊斯兰之前的萨珊波斯制 |
 * | 俄罗斯旧制 | 沙俄度量衡（1718 彼得大帝标准、1899 门捷列夫标准） |
 * | 德国旧制 | 各邦度量衡（1816 普鲁士标准） |
 * | 法国旧制 | 大革命前（pied du roi，国王尺） |
 *
 * ## ★ 一个必须承认的限度
 *
 * 古文明度量衡的现代换算值**多数是学者从考古实物推算的**，
 * 而非当时文献明确记载。所以：
 *
 * ```
 *   confidence: 'typical'  学界常用值（多数）
 *   confidence: 'range'    只有区间（样本少或争议大）
 *   confidence: 'exact'    有明确文献/法定标准（少数）
 * ```
 *
 * @module dsh-math-calculator/core/units-ancient-more
 */

import type { EraUnit } from './units-era.js'

/**
 * ## 古巴比伦（前 1900–前 539）
 *
 * 巴比伦的**六十进制**影响了后世的角度与时间。
 * 长度以「指」（uban）为基础，30 指 = 1 ninda。
 */
export const BABYLONIAN_UNITS: EraUnit[] = [
  {
    name: 'ninda',
    cjk: ['尼达'],
    dimension: 'length',
    variants: [
      { era: '古巴比伦', yearFrom: -1900, yearTo: -539, factor: 6, confidence: 'typical', source: '1 ninda = 12 cubit（kus）≈ 6 m；古巴比伦土地测量的基本单位' },
    ],
  },
  {
    name: 'kus',
    cjk: ['巴比伦肘尺'],
    dimension: 'length',
    variants: [
      { era: '古巴比伦', yearFrom: -1900, yearTo: -539, factor: 0.5, confidence: 'typical', source: '1 kus（cubit）≈ 50 cm；巴比伦人的前臂长度' },
    ],
  },
  {
    name: 'uban',
    cjk: ['巴比伦指'],
    dimension: 'length',
    variants: [
      { era: '古巴比伦', yearFrom: -1900, yearTo: -539, factor: 0.016667, confidence: 'typical', source: '1 uban（finger）= 1/30 kus ≈ 1.67 cm' },
    ],
  },
  {
    name: 'sila',
    cjk: ['西拉'],
    dimension: 'volume',
    variants: [
      { era: '古巴比伦', yearFrom: -1900, yearTo: -539, factor: 0.0008, confidence: 'range', factorHigh: 0.001, source: '1 sila ≈ 0.8–1.0 L（谷物量；各地陶器实测差异大）' },
    ],
  },
  {
    name: 'mina',
    cjk: ['米纳'],
    dimension: 'mass',
    variants: [
      { era: '古巴比伦', yearFrom: -1900, yearTo: -539, factor: 0.5, confidence: 'typical', source: '1 mina ≈ 500 g（60 shekel）；1 talent = 60 mina = 30 kg' },
    ],
  },
  {
    name: 'shekel',
    cjk: ['舍客勒'],
    dimension: 'mass',
    variants: [
      { era: '古巴比伦', yearFrom: -1900, yearTo: -539, factor: 0.008333, confidence: 'typical', source: '1 shekel = 1/60 mina ≈ 8.33 g（**货币与重量合一**，是最早的银本位单位）' },
    ],
  },
  {
    name: 'talent_babylon',
    cjk: ['巴比伦塔兰特'],
    dimension: 'mass',
    variants: [
      { era: '古巴比伦', yearFrom: -1900, yearTo: -539, factor: 30, confidence: 'typical', source: '1 talent = 60 mina ≈ 30 kg（巴比伦 talent 比希腊 26 kg 重）' },
    ],
  },
]

/**
 * ## 古印度（前 500–1500）
 *
 * 依据《政事论》（Kautilya, 前 4 世纪）与《摩奴法典》。
 * 印度的**yojana** 是古代南亚最重要的距离单位，但值争议很大。
 */
export const INDIAN_UNITS: EraUnit[] = [
  {
    name: 'yojana',
    cjk: ['由旬'],
    dimension: 'length',
    variants: [
      { era: '古印度', yearFrom: -500, yearTo: 1500, factor: 12800, confidence: 'range', factorHigh: 16000, source: '1 yojana ≈ 12.8–16 km（**争议最大的古单位**：佛典说 30 里，天文书说 4 krośa，各地不同）' },
    ],
  },
  {
    name: 'krosha',
    cjk: ['克罗沙'],
    dimension: 'length',
    variants: [
      { era: '古印度', yearFrom: -500, yearTo: 1500, factor: 3200, confidence: 'typical', source: '1 krośa（呼）= 1/4 yojana ≈ 3.2 km（「一呼之地」，能听到一声牛叫的距离）' },
    ],
  },
  {
    name: 'danda',
    cjk: ['丹达'],
    dimension: 'length',
    variants: [
      { era: '古印度', yearFrom: -500, yearTo: 1500, factor: 1.8, confidence: 'typical', source: '1 danda（杖）= 4 hasta ≈ 1.8 m' },
    ],
  },
  {
    name: 'hasta',
    cjk: ['哈斯塔'],
    dimension: 'length',
    variants: [
      { era: '古印度', yearFrom: -500, yearTo: 1500, factor: 0.45, confidence: 'typical', source: '1 hasta（肘）= 24 angula ≈ 45 cm' },
    ],
  },
  {
    name: 'angula',
    cjk: ['安古拉'],
    dimension: 'length',
    variants: [
      { era: '古印度', yearFrom: -500, yearTo: 1500, factor: 0.01875, confidence: 'typical', source: '1 angula（指）= 1/24 hasta ≈ 1.875 cm' },
    ],
  },
  {
    name: 'tola',
    cjk: ['托拉'],
    dimension: 'mass',
    variants: [
      { era: '古印度', yearFrom: -500, yearTo: 1500, factor: 0.011664, confidence: 'typical', source: '1 tola ≈ 11.664 g（**南亚黄金与香料的标准单位**，英国殖民期正式化）' },
    ],
  },
  {
    name: 'maund',
    cjk: ['芒德'],
    dimension: 'mass',
    variants: [
      { era: '古印度', yearFrom: -500, yearTo: 1500, factor: 37.3242, confidence: 'typical', source: '1 maund = 40 seer ≈ 37.32 kg（印度大宗货物）' },
    ],
  },
  {
    name: 'seer',
    cjk: ['西尔'],
    dimension: 'mass',
    variants: [
      { era: '古印度', yearFrom: -500, yearTo: 1500, factor: 0.9331, confidence: 'typical', source: '1 seer = 1/40 maund ≈ 0.933 kg（印度日常计量）' },
    ],
  },
]

/**
 * ## 拜占庭（476–1453）
 *
 * 拜占庭承罗马制但**独立演化**：litra 比罗马 libra 轻。
 */
export const BYZANTINE_UNITS: EraUnit[] = [
  /**
   * ⚠ `litra` 与 `orgyia` **移到 `units-byzantine-arab.ts`**。
   *
   * 原因：那两处在第五批里带了完整的多时期变体
   * （litra 早/中/晚期 327.45 / 320 / 318 g），
   * 若这里也留一份单变体的，会导致 `name` 重复 ——
   * 而重复的后果不只是测试红：`findEraVariant` 只取第一个匹配，
   * 于是「晚期 litra」永远查不到。
   */
  {
    name: 'keration',
    cjk: ['凯拉顿'],
    dimension: 'mass',
    variants: [
      { era: '拜占庭', yearFrom: 476, yearTo: 1453, factor: 0.000218, confidence: 'typical', source: '1 keration（角豆籽）= 1/1728 litra ≈ 0.218 g（**钻石「克拉」的词源**）' },
    ],
  },
  {
    name: 'modios',
    cjk: ['拜占庭斗'],
    dimension: 'volume',
    variants: [
      { era: '拜占庭', yearFrom: 476, yearTo: 1453, factor: 0.01026, confidence: 'typical', source: '1 modios ≈ 10.26 L（谷物；与罗马 modius 8.73 L 不同）' },
    ],
  },
]

/**
 * ## 俄罗斯旧制（1718–1924）
 *
 * 彼得大帝 1718 年标准化，1899 年门捷列夫复核。
 */
export const RUSSIAN_UNITS: EraUnit[] = [
  {
    name: 'sazhen',
    cjk: ['沙绳'],
    dimension: 'length',
    variants: [
      { era: '沙俄', yearFrom: 1718, yearTo: 1924, factor: 2.1336, confidence: 'exact', source: '1 sazhen（сажень）= 7 英尺 = 2.1336 m（1899 门捷列夫定）' },
    ],
  },
  {
    name: 'arshin',
    cjk: ['俄尺'],
    dimension: 'length',
    variants: [
      { era: '沙俄', yearFrom: 1718, yearTo: 1924, factor: 0.7112, confidence: 'exact', source: '1 arshin（аршин）= 28 英寸 = 0.7112 m（**俄国布匹标准**）' },
    ],
  },
  {
    name: 'vershok',
    cjk: ['维尔肖克'],
    dimension: 'length',
    variants: [
      { era: '沙俄', yearFrom: 1718, yearTo: 1924, factor: 0.04445, confidence: 'exact', source: '1 vershok（вершок）= 1/16 arshin = 4.445 cm（「一指节」）' },
    ],
  },
  {
    name: 'verst',
    cjk: ['俄里'],
    dimension: 'length',
    variants: [
      { era: '沙俄', yearFrom: 1718, yearTo: 1924, factor: 1066.8, confidence: 'exact', source: '1 verst（верста）= 500 sazhen = 1.0668 km（**里程碑**）' },
    ],
  },
  {
    name: 'pood',
    cjk: ['普特'],
    dimension: 'mass',
    variants: [
      { era: '沙俄', yearFrom: 1718, yearTo: 1924, factor: 16.3805, confidence: 'exact', source: '1 pood（пуд）= 40 funt = 16.38 kg（**俄国粮食与货物标准**）' },
    ],
  },
  {
    name: 'funt',
    cjk: ['俄磅'],
    dimension: 'mass',
    variants: [
      { era: '沙俄', yearFrom: 1718, yearTo: 1924, factor: 0.40951241, confidence: 'exact', source: '1 funt（фунт）= 409.51 g（俄磅，比英磅轻 10%）' },
    ],
  },
  {
    name: 'zolotnik',
    cjk: ['佐洛特尼克'],
    dimension: 'mass',
    variants: [
      { era: '沙俄', yearFrom: 1718, yearTo: 1924, factor: 0.004266, confidence: 'exact', source: '1 zolotnik（золотник）= 1/96 funt = 4.266 g（**俄国金银成色单位**）' },
    ],
  },
  {
    name: 'vedro',
    cjk: ['维德罗'],
    dimension: 'volume',
    variants: [
      { era: '沙俄', yearFrom: 1718, yearTo: 1924, factor: 12.299, confidence: 'exact', source: '1 vedro（ведро）= 12.3 L（「一桶」，伏特加标准容器）' },
    ],
  },
]

/**
 * ## 德国旧制（1816–1871）
 *
 * 普鲁士 1816 标准，德意志各邦在 1871 统一前各不相同。
 */
export const GERMAN_UNITS: EraUnit[] = [
  {
    name: 'rhein_fuss',
    cjk: ['莱茵尺'],
    dimension: 'length',
    variants: [
      { era: '德意志', yearFrom: 1816, yearTo: 1871, factor: 0.31385, confidence: 'exact', source: '1 Rhein-Fuß = 31.385 cm（**普鲁士 1816 法定标准**，德国科学界通用）' },
    ],
  },
  {
    name: 'rute',
    cjk: ['鲁特'],
    dimension: 'length',
    variants: [
      { era: '德意志', yearFrom: 1816, yearTo: 1871, factor: 3.7662, confidence: 'typical', source: '1 Rute = 12 Rhein-Fuß ≈ 3.766 m（土地测量杆）' },
    ],
  },
  {
    name: 'meile',
    cjk: ['德里'],
    dimension: 'length',
    variants: [
      { era: '德意志', yearFrom: 1816, yearTo: 1871, factor: 7532.5, confidence: 'typical', source: '1 deutsche Meile ≈ 7.53 km（**普鲁士里程**，比英里的 1.609 km 长 4.7 倍）' },
    ],
  },
  {
    name: 'pfund',
    cjk: ['德磅'],
    dimension: 'mass',
    variants: [
      { era: '德意志', yearFrom: 1816, yearTo: 1871, factor: 0.4677, confidence: 'typical', source: '1 Zollpfund = 467.7 g（普鲁士关税磅，1858 德意志关税同盟标准）' },
    ],
  },
  {
    name: 'loth',
    cjk: ['洛特'],
    dimension: 'mass',
    variants: [
      { era: '德意志', yearFrom: 1816, yearTo: 1871, factor: 0.014616, confidence: 'typical', source: '1 Loth = 1/32 Pfund ≈ 14.62 g' },
    ],
  },
]

/**
 * ## 法国旧制（前 800–1795）
 *
 * 大革命前的**国王尺（pied du roi）**是欧洲最精密的旧标准之一。
 * 1795 年公制取代它 —— 而这正是公制的起点。
 */
export const FRENCH_UNITS: EraUnit[] = [
  {
    name: 'pied_roi',
    cjk: ['国王尺'],
    dimension: 'length',
    variants: [
      { era: '法国旧制', yearFrom: 800, yearTo: 1795, factor: 0.32484, confidence: 'exact', source: '1 pied du roi = 32.484 cm（**巴黎子午线测量的基准**，1791 年据此定义米）' },
    ],
  },
  {
    name: 'toise',
    cjk: ['法丈'],
    dimension: 'length',
    variants: [
      { era: '法国旧制', yearFrom: 800, yearTo: 1795, factor: 1.94904, confidence: 'exact', source: '1 toise = 6 pied = 1.949 m（秘鲁子午线测量的标准尺）' },
    ],
  },
  {
    name: 'ligne_fr',
    cjk: ['法线'],
    dimension: 'length',
    variants: [
      { era: '法国旧制', yearFrom: 800, yearTo: 1795, factor: 0.0022574, confidence: 'exact', source: '1 ligne = 1/12 pouce ≈ 2.257 mm（**纽扣直径的标准**）' },
    ],
  },
  {
    name: 'lieue',
    cjk: ['法里'],
    dimension: 'length',
    variants: [
      { era: '法国旧制', yearFrom: 800, yearTo: 1795, factor: 4444.8, confidence: 'typical', source: '1 lieue = 2280 toise ≈ 4.445 km（**法国驿道里程**）' },
    ],
  },
  {
    name: 'livre_fr',
    cjk: ['法磅'],
    dimension: 'mass',
    variants: [
      { era: '法国旧制', yearFrom: 800, yearTo: 1795, factor: 0.4895, confidence: 'typical', source: '1 livre = 489.5 g（巴黎磅，比英磅重 8%）' },
    ],
  },
  {
    name: 'once_fr',
    cjk: ['法盎司'],
    dimension: 'mass',
    variants: [
      { era: '法国旧制', yearFrom: 800, yearTo: 1795, factor: 0.030594, confidence: 'typical', source: '1 once = 1/16 livre ≈ 30.59 g' },
    ],
  },
]

/** 全部第三批古文明单位。 */
export const ANCIENT_MORE_UNITS: EraUnit[] = [
  ...BABYLONIAN_UNITS,
  ...INDIAN_UNITS,
  ...BYZANTINE_UNITS,
  ...RUSSIAN_UNITS,
  ...GERMAN_UNITS,
  ...FRENCH_UNITS,
]
