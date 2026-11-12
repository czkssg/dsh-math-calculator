/**
 * 更多历史度量衡体系（第四批）。
 *
 * ## 收录范围
 *
 * | 体系 | 时期 | 依据 |
 * |---|---|---|
 * | 奥斯曼帝国 | 1299–1922 | 伊斯坦布尔度量衡标准、《奥斯曼法典》 |
 * | 萨珊波斯 | 224–651 | 萨珊银币制、阿拉伯继承的波斯度量衡 |
 * | 玛雅 | 前 2000–1520 | 玛雅抄本（Dresden Codex）、奇琴伊察考古 |
 * | 阿兹特克 | 1300–1521 | 《门多萨抄本》、西班牙征服者记录 |
 * | 北欧（瑞典/丹麦/挪威） | 1000–1889 | 瑞典 1665 标准、1889 米制转换法 |
 * | 荷兰 | 1500–1820 | 阿姆斯特丹度量衡（世界贸易标准） |
 * | 西班牙/葡萄牙 | 1200–1850 | 卡斯蒂利亚制、《印度群岛法》 |
 * | 意大利各邦 | 1200–1861 | 各城邦独立标准（佛罗伦萨、威尼斯、米兰） |
 * | 波兰/匈牙利 | 1300–1850 | 克拉科夫标准、匈牙利 1874 公制化前 |
 *
 * ## ★ 这批体系的一个共同难点
 *
 * **同一体系内不同城市不同值**。例如意大利的 braccio：
 *
 * ```
 *   佛罗伦萨 braccio  58.36 cm
 *   威尼斯 braccio    63.67 cm    ← 差 9%
 *   米兰 braccio      59.49 cm
 * ```
 *
 * 所以每条都标 `region`。
 *
 * @module dsh-math-calculator/core/units-ancient-4
 */

import type { EraUnit } from './units-era.js'

/**
 * ## 奥斯曼帝国（1299–1922）
 *
 * 奥斯曼的度量衡以**伊斯坦布尔标准**为准，1922 后被土耳其共和国公制化。
 * 其 `arşın`（尺）与 `okka`（磅）影响整个中东与巴尔干。
 */
export const OTTOMAN_UNITS: EraUnit[] = [
  {
    name: 'arsin',
    cjk: ['奥斯曼尺'],
    dimension: 'length',
    variants: [
      { era: '奥斯曼', yearFrom: 1299, yearTo: 1922, factor: 0.68, variant: 'çarşı arşını', confidence: 'typical', source: 'Çarşı arşını（市集尺）≈ 68 cm，**商业与布匹**用' },
      { era: '奥斯曼', yearFrom: 1299, yearTo: 1922, factor: 0.758, variant: 'mimari arşın', confidence: 'typical', source: 'Mimari arşın（建筑尺）≈ 75.8 cm，**建筑与工程**用（比市集尺长 11%）' },
    ],
  },
  {
    name: 'parmak',
    cjk: ['奥斯曼指'],
    dimension: 'length',
    variants: [
      { era: '奥斯曼', yearFrom: 1299, yearTo: 1922, factor: 0.03166, confidence: 'typical', source: '1 parmak（指）= 1/24 建筑尺 ≈ 3.17 cm' },
    ],
  },
  {
    name: 'okka',
    cjk: ['奥斯曼磅'],
    dimension: 'mass',
    variants: [
      { era: '奥斯曼', yearFrom: 1299, yearTo: 1922, factor: 1.2829, confidence: 'exact', source: '1 okka（oke）= 1282.9 g（**伊斯坦布尔标准**；比英磅重近 3 倍）' },
    ],
  },
  {
    name: 'dirhem_ott',
    cjk: ['奥斯曼德拉克马'],
    dimension: 'mass',
    variants: [
      { era: '奥斯曼', yearFrom: 1299, yearTo: 1922, factor: 0.003207, confidence: 'typical', source: '1 dirhem = 1/400 okka ≈ 3.207 g（**奥斯曼银币标准**）' },
    ],
  },
  {
    name: 'kantar_ott',
    cjk: ['奥斯曼坎塔尔'],
    dimension: 'mass',
    variants: [
      { era: '奥斯曼', yearFrom: 1299, yearTo: 1922, factor: 56.442, confidence: 'typical', source: '1 kantar = 44 okka ≈ 56.44 kg（**大宗货物**）' },
    ],
  },
  {
    name: 'kile',
    cjk: ['奥斯曼基莱'],
    dimension: 'volume',
    variants: [
      { era: '奥斯曼', yearFrom: 1299, yearTo: 1922, factor: 0.037, confidence: 'range', factorHigh: 0.046, source: '1 kile（谷物）≈ 37–46 L（**伊斯坦布尔的 kile 与各省不同**）' },
    ],
  },
  {
    name: 'donum',
    cjk: ['奥斯曼顿亩'],
    dimension: 'area',
    variants: [
      { era: '奥斯曼', yearFrom: 1299, yearTo: 1922, factor: 919.3, confidence: 'typical', source: '1 dönüm ≈ 919.3 m²（「一人一天可耕之地」，约 40 × 40 步）' },
    ],
  },
  {
    name: 'farsakh_ott',
    cjk: ['奥斯曼法尔萨赫'],
    dimension: 'length',
    variants: [
      { era: '奥斯曼', yearFrom: 1299, yearTo: 1922, factor: 5555, confidence: 'range', factorHigh: 6666, source: '1 farsakh（波斯语「里」）≈ 5.5–6.7 km（伊斯兰世界的路程单位，各地不同）' },
    ],
  },
]

/**
 * ## 萨珊波斯（224–651）
 *
 * 萨珊的银币 `drachm` 与长度 `gaz` 被阿拉伯帝国继承，
 * 是伊斯兰度量衡的直接源头。
 */
export const PERSIAN_UNITS: EraUnit[] = [
  {
    name: 'gaz_pers',
    cjk: ['波斯腕尺'],
    dimension: 'length',
    variants: [
      { era: '波斯', yearFrom: 224, yearTo: 651, factor: 1.04, confidence: 'typical', source: '1 gaz（波斯腕尺）≈ 104 cm（比伊斯兰腕尺长一倍；萨珊「王家尺」）' },
    ],
  },
  {
    name: 'sang_pers',
    cjk: ['波斯桑'],
    dimension: 'mass',
    variants: [
      { era: '波斯', yearFrom: 224, yearTo: 651, factor: 0.149, confidence: 'range', factorHigh: 0.19, source: '1 sang ≈ 149–190 g（萨珊银币重量标准，各朝不同）' },
    ],
  },
  {
    name: 'mann_pers',
    cjk: ['波斯曼'],
    dimension: 'mass',
    variants: [
      { era: '波斯', yearFrom: 224, yearTo: 651, factor: 2.98, confidence: 'range', factorHigh: 5.96, source: '1 mann ≈ 3–6 kg（「一曼」，波斯与伊斯兰世界的大宗计量，**各地差一倍**）' },
    ],
  },
]

/**
 * ## 玛雅（前 2000–1520）
 *
 * 玛雅的长度以人体为基础（`kin` = 一人高），
 * 而其**计数与历法**（二十进制）比度量衡更著名。
 */
export const MAYA_UNITS: EraUnit[] = [
  {
    name: 'kin_maya',
    cjk: ['玛雅步'],
    dimension: 'length',
    variants: [
      { era: '玛雅', yearFrom: -2000, yearTo: 1520, factor: 1.62, confidence: 'typical', source: '1 kin ≈ 1.62 m（「一个人」，玛雅长度的基本单位）' },
    ],
  },
  {
    name: 'xoc',
    cjk: ['玛雅尺'],
    dimension: 'length',
    variants: [
      { era: '玛雅', yearFrom: -2000, yearTo: 1520, factor: 0.405, confidence: 'typical', source: '1 xoc ≈ 40.5 cm（前臂长，1 kin = 4 xoc）' },
    ],
  },
  {
    name: 'poch_maya',
    cjk: ['玛雅步量'],
    dimension: 'length',
    variants: [
      { era: '玛雅', yearFrom: -2000, yearTo: 1520, factor: 1.35, confidence: 'range', factorHigh: 1.62, source: '1 poch ≈ 1.35–1.62 m（一步的距离，与 kin 常混用）' },
    ],
  },
  {
    name: 'load_maya',
    cjk: ['玛雅驮'],
    dimension: 'mass',
    variants: [
      { era: '玛雅', yearFrom: -2000, yearTo: 1520, factor: 23, confidence: 'range', factorHigh: 27, source: '1 load（可可豆计量）≈ 23–27 kg（**可可豆曾是货币**，1 load = 24000 粒）' },
    ],
  },
]

/**
 * ## 阿兹特克（1300–1521）
 *
 * 依据《门多萨抄本》与西班牙征服者（Cortés, Bernal Díaz）的记录。
 */
export const AZTEC_UNITS: EraUnit[] = [
  {
    name: 'quahuitl',
    cjk: ['阿兹特克尺'],
    dimension: 'length',
    variants: [
      { era: '阿兹特克', yearFrom: 1300, yearTo: 1521, factor: 0.83, confidence: 'typical', source: '1 quahuitl（「一臂」）≈ 83 cm（西班牙记录：约 3 西班牙尺）' },
    ],
  },
  {
    name: 'cemmatl',
    cjk: ['阿兹特克拃'],
    dimension: 'length',
    variants: [
      { era: '阿兹特克', yearFrom: 1300, yearTo: 1521, factor: 0.208, confidence: 'typical', source: '1 cemmatl（「一手」）= 1/4 quahuitl ≈ 20.8 cm' },
    ],
  },
  {
    name: 'tlapantli',
    cjk: ['阿兹特克丈'],
    dimension: 'length',
    variants: [
      { era: '阿兹特克', yearFrom: 1300, yearTo: 1521, factor: 2.49, confidence: 'typical', source: '1 tlapantli ≈ 2.49 m（3 quahuitl，量地单位）' },
    ],
  },
  {
    name: 'centli',
    cjk: ['阿兹特克玉米单位'],
    dimension: 'volume',
    variants: [
      { era: '阿兹特克', yearFrom: 1300, yearTo: 1521, factor: 0.0044, confidence: 'range', factorHigh: 0.0055, source: '1 centli（玉米，约 4000 粒）≈ 4.4–5.5 L（**玉米是主要贡赋**）' },
    ],
  },
]

/**
 * ## 北欧（瑞典/丹麦/挪威，1000–1889）
 *
 * 瑞典 1665 年标准化，1889 年转公制。
 * `mil`（瑞典里）是 10.69 km —— 比挪威/丹麦的里都长。
 */
export const NORDIC_UNITS: EraUnit[] = [
  {
    name: 'fot_sv',
    cjk: ['瑞典尺'],
    dimension: 'length',
    variants: [
      { era: '北欧', yearFrom: 1665, yearTo: 1889, factor: 0.2969, confidence: 'exact', source: '1 svensk fot = 29.69 cm（**1665 年瑞典标准**，由 Rydaholm 原器确定）' },
    ],
  },
  {
    name: 'tum',
    cjk: ['瑞典寸'],
    dimension: 'length',
    variants: [
      { era: '北欧', yearFrom: 1665, yearTo: 1889, factor: 0.02474, confidence: 'exact', source: '1 tum（拇指）= 1/12 fot ≈ 2.474 cm' },
    ],
  },
  {
    name: 'aln_sv',
    cjk: ['瑞典厄尔'],
    dimension: 'length',
    variants: [
      { era: '北欧', yearFrom: 1665, yearTo: 1889, factor: 0.5938, confidence: 'exact', source: '1 aln = 2 fot = 59.38 cm（**瑞典布匹标准**）' },
    ],
  },
  {
    name: 'mil_sv',
    cjk: ['瑞典里'],
    dimension: 'length',
    variants: [
      { era: '北欧', yearFrom: 1665, yearTo: 1889, factor: 10688.4, confidence: 'exact', source: '1 mil = 36000 fot = 10.688 km（**北欧最长的里**；现代瑞典口语仍用「mil」= 10 km）' },
    ],
  },
  {
    name: 'skalpund',
    cjk: ['瑞典磅'],
    dimension: 'mass',
    variants: [
      { era: '北欧', yearFrom: 1665, yearTo: 1889, factor: 0.425076, confidence: 'exact', source: '1 skålpund = 425.08 g（瑞典磅，比英磅轻 6%）' },
    ],
  },
  {
    name: 'lispund',
    cjk: ['瑞典里斯磅'],
    dimension: 'mass',
    variants: [
      { era: '北欧', yearFrom: 1665, yearTo: 1889, factor: 8.50152, confidence: 'exact', source: '1 lispund = 20 skålpund ≈ 8.50 kg' },
    ],
  },
  {
    name: 'skeppund',
    cjk: ['瑞典船磅'],
    dimension: 'mass',
    variants: [
      /**
       * ⚠ 1 skeppund = **20 lispund**（不是 16）。
       *
       * 但 20 × 8.50152 = 170.03 ≠ 136.024。
       * 实际原因是：skeppund 有两种定义 ——
       * ```
       *   skeppund stapelstad（贸易港标准）= 20 lispund = 170 kg
       *   skeppund viktualie（食品标准）  = 16 lispund = 136 kg
       * ```
       * 本表取 **viktualie（食品）版本 136 kg**，因为它在史料里出现更多。
       */
      { era: '北欧', yearFrom: 1665, yearTo: 1889, factor: 136.024, variant: 'viktualie', confidence: 'exact', source: '1 skeppund viktualie（食品船磅）= 16 lispund ≈ 136 kg；贸易港版是 20 lispund = 170 kg' },
    ],
  },
]

/**
 * ## 荷兰（1500–1820）
 *
 * 阿姆斯特丹是 17 世纪的世界贸易中心，其度量衡被各国商船采用。
 */
export const DUTCH_UNITS: EraUnit[] = [
  {
    name: 'voet',
    cjk: ['荷兰尺'],
    dimension: 'length',
    variants: [
      { era: '荷兰', yearFrom: 1500, yearTo: 1820, factor: 0.2831, confidence: 'exact', source: '1 Amsterdamse voet = 28.31 cm（**阿姆斯特丹标准**，比莱茵尺短 10%）' },
      { era: '荷兰', yearFrom: 1500, yearTo: 1820, factor: 0.3139, variant: 'Rijnlandse voet', confidence: 'exact', source: '1 Rijnlandse voet（莱茵兰尺）= 31.39 cm（**荷兰水利工程标准**，与普鲁士莱茵尺同源）' },
    ],
  },
  {
    name: 'duim',
    cjk: ['荷兰寸'],
    dimension: 'length',
    variants: [
      { era: '荷兰', yearFrom: 1500, yearTo: 1820, factor: 0.02573, confidence: 'typical', source: '1 duim（拇指）= 1/11 voet ≈ 2.573 cm（**注意荷兰是 11 进制，不是 12**）' },
    ],
  },
  {
    name: 'el_nl',
    cjk: ['荷兰厄尔'],
    dimension: 'length',
    variants: [
      { era: '荷兰', yearFrom: 1500, yearTo: 1820, factor: 0.6878, confidence: 'exact', source: '1 Amsterdamse el = 68.78 cm（**荷兰布匹标准**，世界布市通用）' },
    ],
  },
  {
    name: 'mud',
    cjk: ['荷兰莫德'],
    dimension: 'volume',
    variants: [
      { era: '荷兰', yearFrom: 1500, yearTo: 1820, factor: 0.1096, confidence: 'typical', source: '1 mud ≈ 109.6 L（谷物；1 last = 27 mud）' },
    ],
  },
  {
    name: 'last_nl',
    cjk: ['荷兰拉斯特'],
    dimension: 'volume',
    variants: [
      { era: '荷兰', yearFrom: 1500, yearTo: 1820, factor: 2.96, confidence: 'typical', source: '1 last ≈ 2.96 m³（**航运计容单位**，1 last ≈ 2 吨载重）' },
    ],
  },
  {
    name: 'pond_nl',
    cjk: ['荷兰磅'],
    dimension: 'mass',
    variants: [
      { era: '荷兰', yearFrom: 1500, yearTo: 1820, factor: 0.4941, confidence: 'exact', source: '1 Amsterdams pond = 494.1 g（比英磅重 9%）' },
    ],
  },
]

/**
 * ## 西班牙/葡萄牙（1200–1850）
 *
 * `arroba` 是伊比利亚最重要的单位 —— 它同时是**重量**（11.5 kg）
 * 与**容量**（16.1 L），且西班牙与葡萄牙的值不同。
 */
export const IBERIAN_UNITS: EraUnit[] = [
  {
    name: 'vara',
    cjk: ['西班牙尺'],
    dimension: 'length',
    variants: [
      { era: '西班牙', yearFrom: 1200, yearTo: 1850, factor: 0.8359, variant: '卡斯蒂利亚', confidence: 'exact', source: '1 vara castellana = 83.59 cm（**卡斯蒂利亚标准**，西班牙帝国全域使用）' },
      { era: '西班牙', yearFrom: 1200, yearTo: 1850, factor: 1.1, variant: '瓦伦西亚', confidence: 'typical', source: '1 vara valenciana ≈ 1.10 m（**比卡斯蒂利亚长 32%**，各地不同）' },
    ],
  },
  {
    name: 'legua',
    cjk: ['西班牙里格'],
    dimension: 'length',
    variants: [
      { era: '西班牙', yearFrom: 1200, yearTo: 1850, factor: 5572.7, variant: '陆地', confidence: 'exact', source: '1 legua = 5000 varas = 5.573 km（**西班牙陆地里格**，最常用）' },
      { era: '西班牙', yearFrom: 1200, yearTo: 1850, factor: 6666.7, variant: 'legal', confidence: 'typical', source: '1 legua legal ≈ 6.667 km（法定里格，与地理里格不同）' },
    ],
  },
  {
    name: 'arroba_sp',
    cjk: ['西班牙阿罗巴'],
    dimension: 'mass',
    variants: [
      { era: '西班牙', yearFrom: 1200, yearTo: 1850, factor: 11.5023, confidence: 'exact', source: '1 arroba = 25 libras ≈ 11.50 kg（**西班牙**；葡萄牙是 14.69 kg，**差 28%**）' },
    ],
  },
  {
    name: 'arroba_pt',
    cjk: ['葡萄牙阿罗巴'],
    dimension: 'mass',
    variants: [
      { era: '葡萄牙', yearFrom: 1200, yearTo: 1850, factor: 14.688, confidence: 'exact', source: '1 arroba = 32 arráteis ≈ 14.69 kg（**葡萄牙**；比西班牙重 28%）' },
    ],
  },
  {
    name: 'fanega',
    cjk: ['西班牙法内加'],
    dimension: 'volume',
    variants: [
      { era: '西班牙', yearFrom: 1200, yearTo: 1850, factor: 0.0555, confidence: 'range', factorHigh: 0.0667, source: '1 fanega（谷物）≈ 55.5–66.7 L（**卡斯蒂利亚 55.5 L**；各地差 20%）' },
    ],
  },
  {
    name: 'quintal_sp',
    cjk: ['西班牙公担'],
    dimension: 'mass',
    variants: [
      { era: '西班牙', yearFrom: 1200, yearTo: 1850, factor: 46.009, confidence: 'exact', source: '1 quintal = 4 arrobas ≈ 46.01 kg（**西班牙**；法西「公担」= 100 kg，不同）' },
    ],
  },
]

/**
 * ## 意大利各邦（1200–1861）
 *
 * 意大利在 1861 统一前**每城一制**。`braccio`（臂尺）是最典型的例子。
 */
export const ITALIAN_UNITS: EraUnit[] = [
  {
    name: 'braccio',
    cjk: ['意大利臂尺'],
    dimension: 'length',
    variants: [
      { era: '意大利', yearFrom: 1200, yearTo: 1861, factor: 0.5836, variant: '佛罗伦萨', region: '佛罗伦萨', confidence: 'exact', source: '1 braccio fiorentino = 58.36 cm（**但丁与美第奇时代的布匹尺**）' },
      { era: '意大利', yearFrom: 1200, yearTo: 1861, factor: 0.6367, variant: '威尼斯', region: '威尼斯', confidence: 'exact', source: '1 braccio veneziano = 63.67 cm（**比佛罗伦萨长 9%**）' },
      { era: '意大利', yearFrom: 1200, yearTo: 1861, factor: 0.5949, variant: '米兰', region: '米兰', confidence: 'typical', source: '1 braccio milanese = 59.49 cm' },
    ],
  },
  {
    name: 'piede_it',
    cjk: ['意大利尺'],
    dimension: 'length',
    variants: [
      { era: '意大利', yearFrom: 1200, yearTo: 1861, factor: 0.2978, variant: '罗马', region: '罗马', confidence: 'typical', source: '1 piede romano = 29.78 cm（**教廷标准**，承古罗马 pes 的 29.6 cm）' },
      { era: '意大利', yearFrom: 1200, yearTo: 1861, factor: 0.3477, variant: '威尼斯', region: '威尼斯', confidence: 'typical', source: '1 piede veneto = 34.77 cm（**比罗马长 17%**）' },
    ],
  },
  {
    name: 'libbra_it',
    cjk: ['意大利磅'],
    dimension: 'mass',
    variants: [
      { era: '意大利', yearFrom: 1200, yearTo: 1861, factor: 0.3395, variant: '佛罗伦萨', region: '佛罗伦萨', confidence: 'typical', source: '1 libbra fiorentina = 339.5 g（**12 盎司制**，比英磅轻 25%）' },
      { era: '意大利', yearFrom: 1200, yearTo: 1861, factor: 0.3012, variant: '威尼斯', region: '威尼斯', confidence: 'typical', source: '1 libbra veneziana = 301.2 g（**轻磅**，用于贵重货物）' },
      { era: '意大利', yearFrom: 1200, yearTo: 1861, factor: 0.7627, variant: '米兰', region: '米兰', confidence: 'typical', source: '1 libbra milanese = 762.7 g（**重磅**，比威尼斯重 1.5 倍）' },
    ],
  },
  {
    name: 'staio',
    cjk: ['意大利斯泰奥'],
    dimension: 'volume',
    variants: [
      { era: '意大利', yearFrom: 1200, yearTo: 1861, factor: 0.02437, variant: '佛罗伦萨', region: '佛罗伦萨', confidence: 'typical', source: '1 staio fiorentino ≈ 24.37 L（谷物）' },
      { era: '意大利', yearFrom: 1200, yearTo: 1861, factor: 0.0292, variant: '米兰', region: '米兰', confidence: 'typical', source: '1 staio milanese ≈ 29.2 L' },
    ],
  },
]

/**
 * ## 波兰/匈牙利（1300–1874）
 */
export const POLISH_HUNGARIAN_UNITS: EraUnit[] = [
  {
    name: 'lokiec',
    cjk: ['波兰肘尺'],
    dimension: 'length',
    variants: [
      { era: '波兰', yearFrom: 1300, yearTo: 1850, factor: 0.5955, confidence: 'exact', source: '1 łokieć = 59.55 cm（**克拉科夫标准**，波兰布匹尺）' },
    ],
  },
  {
    name: 'stopa_pl',
    cjk: ['波兰尺'],
    dimension: 'length',
    variants: [
      { era: '波兰', yearFrom: 1300, yearTo: 1850, factor: 0.288, confidence: 'typical', source: '1 stopa = 28.8 cm（波兰尺，比英呎短 5%）' },
    ],
  },
  {
    name: 'funt_pl',
    cjk: ['波兰磅'],
    dimension: 'mass',
    variants: [
      { era: '波兰', yearFrom: 1300, yearTo: 1850, factor: 0.4052, confidence: 'exact', source: '1 funt = 405.2 g（**波兰磅**，与俄磅 409.5 g 接近但有别）' },
    ],
  },
  {
    name: 'garniec',
    cjk: ['波兰加涅茨'],
    dimension: 'volume',
    variants: [
      { era: '波兰', yearFrom: 1300, yearTo: 1850, factor: 0.003766, confidence: 'typical', source: '1 garniec ≈ 3.766 L（波兰容量基本单位）' },
    ],
  },
  {
    name: 'pozsony',
    cjk: ['匈牙利波佐尼'],
    dimension: 'mass',
    variants: [
      { era: '匈牙利', yearFrom: 1300, yearTo: 1874, factor: 0.5606, confidence: 'typical', source: '1 pozsonyi font ≈ 560.6 g（**匈牙利磅**，1874 公制化前使用）' },
    ],
  },
]

/** 全部第四批。 */
export const ANCIENT_FOURTH_UNITS: EraUnit[] = [
  ...OTTOMAN_UNITS,
  ...PERSIAN_UNITS,
  ...MAYA_UNITS,
  ...AZTEC_UNITS,
  ...NORDIC_UNITS,
  ...DUTCH_UNITS,
  ...IBERIAN_UNITS,
  ...ITALIAN_UNITS,
  ...POLISH_HUNGARIAN_UNITS,
]
