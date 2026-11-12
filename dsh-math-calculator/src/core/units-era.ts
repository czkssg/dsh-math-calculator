/**
 * 带时代标注的度量衡体系。
 *
 * ## 为什么需要这一层
 *
 * 老单位表有 464 条、928 个名字，但**同一个单位在不同时代差别极大**，
 * 而那些差异只写在 `note` 文本里：
 *
 * ```
 *   市尺  factor 0.32  note "历代不同：商制约 16 cm、汉制约 23 cm、明清营造尺约 32 cm"
 * ```
 *
 * 问题在于：
 *
 * ```
 *   ① 查「汉代的尺」拿不到 —— 只能读到一句文本，没有可计算的数
 *   ② 换算会默认用 0.32（现代市尺），而写「汉代一尺」时算出的长度差一倍
 *   ③ 无法回答「同一个词在不同朝代差多少」
 * ```
 *
 * ## 这一层的设计
 *
 * 每个单位给**一组变体**，每条带：
 *
 * ```
 *   era     时代标识（商/周/汉/唐/宋/明/清/民国/现代）
 *   yearFrom/yearTo  大致年代区间（负数表示公元前）
 *   factor  该时代的换算因子
 *   variant 变体名（营造尺/量地尺/裁衣尺——同一个朝代也可能有多种）
 *   region  地域（若同一时代不同地区不同）
 *   source  依据（哪本书/哪个考古实物）
 * ```
 *
 * ## 一个必须承认的事实
 *
 * **古代度量衡没有唯一值。** 同一朝代不同用途、不同地区、不同考古实物
 * 都会差几个百分点。所以这里的每条都标注 `confidence`：
 *
 * ```
 *   exact     有明确文献或标准定义（如现代市制）
 *   typical   学界常用值（如汉尺 23.1 cm）
 *   range     只有区间（如商尺 15–17 cm）
 * ```
 *
 * **不把「学界常用值」说成「精确值」** —— 那是这个项目一贯的原则。
 *
 * @module dsh-math-calculator/core/units-era
 */

/** 时代标识。 */
export type Era =
  | '商' | '周' | '秦汉' | '汉' | '三国' | '晋' | '南北朝'
  | '隋' | '唐' | '宋' | '元' | '明' | '清' | '民国' | '现代'
  | '古埃及' | '古巴比伦' | '古希腊' | '古罗马' | '中世纪欧洲'
  | '英制' | '美制' | '公制'

/** 可信度。 */
export type UnitConfidence = 'exact' | 'typical' | 'range'

/** 一个单位在某个时代的一个变体。 */
export interface EraVariant {
  /** 时代。 */
  era: Era
  /** 起始年（负数=公元前，如 -1600 表示前 1600 年）。 */
  yearFrom?: number
  /** 结束年。 */
  yearTo?: number
  /** 该时代的换算因子（到基准单位）。 */
  factor: number
  /** 若只有区间，这里是上界（配合 `factor` 作下界）。 */
  factorHigh?: number
  /** 变体名（如「营造尺」「量地尺」「裁衣尺」）。 */
  variant?: string
  /** 地域（若同代不同地区不同）。 */
  region?: string
  /** 可信度。 */
  confidence: UnitConfidence
  /** 依据（文献或考古实物）。 */
  source: string
}

/** 一个带时代变体的单位。 */
export interface EraUnit {
  /** 现代通名（用于检索）。 */
  name: string
  /** 中文写法（可能有多个）。 */
  cjk: string[]
  /** 量纲。 */
  dimension: 'length' | 'mass' | 'volume' | 'area' | 'time'
  /** 各时代的变体。 */
  variants: EraVariant[]
}

/**
 * ## 中国历代度（长度）
 *
 * 依据：吴承洛《中国度量衡史》、丘光明《中国历代度量衡考》、
 * 国家计量总局《中国古代度量衡图集》。
 *
 * ⚠ 一尺在各朝代的值**不是单调变化**，而是「增—减—增」的锯齿：
 * 商 16 → 汉 23 → 南北朝 30 → 唐 30 → 宋 31 → 明清 32。
 */
export const CHINESE_LENGTH: EraUnit[] = [
  {
    name: '尺',
    cjk: ['尺'],
    dimension: 'length',
    variants: [
      { era: '商', yearFrom: -1600, yearTo: -1046, factor: 0.158, factorHigh: 0.17, confidence: 'range', source: '殷墟出土骨尺、牙尺（15.8–17.0 cm）' },
      { era: '周', yearFrom: -1046, yearTo: -256, factor: 0.199, factorHigh: 0.231, confidence: 'range', source: '《考工记》与洛阳出土铜尺；周尺有三等之说' },
      { era: '秦汉', yearFrom: -221, yearTo: 220, factor: 0.231, variant: '通用尺', confidence: 'typical', source: '商鞅方升配套尺、满城汉墓错金铁尺（23.1 cm）' },
      { era: '汉', yearFrom: -202, yearTo: 220, factor: 0.231, variant: '量地尺', confidence: 'typical', source: '汉承秦制；量地尺略长于通用尺' },
      { era: '三国', yearFrom: 220, yearTo: 280, factor: 0.242, confidence: 'typical', source: '魏尺 24.2 cm；蜀吴略有差异' },
      { era: '南北朝', yearFrom: 420, yearTo: 589, factor: 0.295, confidence: 'typical', source: '北魏尺 29.5 cm（「前代尺」与「后魏尺」并存，差约 1 cm）' },
      { era: '隋', yearFrom: 581, yearTo: 618, factor: 0.296, confidence: 'typical', source: '隋尺 29.6 cm，沿用北朝' },
      { era: '唐', yearFrom: 618, yearTo: 907, factor: 0.3, variant: '大尺', confidence: 'typical', source: '唐有大尺（30.0 cm）与小尺（24.6 cm）两种，大尺用于日常' },
      { era: '唐', yearFrom: 618, yearTo: 907, factor: 0.246, variant: '小尺（黍尺）', confidence: 'typical', source: '小尺用于调律与医药' },
      { era: '宋', yearFrom: 960, yearTo: 1279, factor: 0.312, variant: '营造尺', confidence: 'typical', source: '北宋营造尺 31.2 cm；南宋略短' },
      { era: '宋', yearFrom: 960, yearTo: 1279, factor: 0.272, variant: '布帛尺', confidence: 'typical', source: '布帛尺 27.2 cm，用于量布' },
      { era: '元', yearFrom: 1271, yearTo: 1368, factor: 0.34, confidence: 'typical', source: '元尺 34 cm，是历代最长（蒙古制影响）' },
      { era: '明', yearFrom: 1368, yearTo: 1644, factor: 0.32, variant: '营造尺', confidence: 'typical', source: '明营造尺 32 cm（工部定）' },
      { era: '明', yearFrom: 1368, yearTo: 1644, factor: 0.34, variant: '裁衣尺', confidence: 'typical', source: '裁衣尺 34 cm，比营造尺长' },
      { era: '明', yearFrom: 1368, yearTo: 1644, factor: 0.327, variant: '量地尺', confidence: 'typical', source: '量地尺 32.7 cm' },
      { era: '清', yearFrom: 1644, yearTo: 1912, factor: 0.32, variant: '营造尺', confidence: 'exact', source: '清营造尺 32 cm，有官定标准器' },
      { era: '清', yearFrom: 1644, yearTo: 1912, factor: 0.355, variant: '裁衣尺', confidence: 'typical', source: '清裁衣尺 35.5 cm' },
      { era: '清', yearFrom: 1644, yearTo: 1912, factor: 0.345, variant: '量地尺', confidence: 'typical', source: '清量地尺 34.5 cm' },
      { era: '民国', yearFrom: 1912, yearTo: 1949, factor: 0.3333, variant: '市尺', confidence: 'exact', source: '1929 年《度量衡法》定 1 市尺 = 1/3 m' },
      { era: '现代', yearFrom: 1949, factor: 0.3333, variant: '市尺', confidence: 'exact', source: '1 市尺 = 1/3 m，与民国市尺相同' },
    ],
  },
  {
    name: '里',
    cjk: ['里'],
    dimension: 'length',
    variants: [
      { era: '周', yearFrom: -1046, yearTo: -256, factor: 415.8, confidence: 'typical', source: '周里 = 300 步 = 415.8 m（一步 1.386 m）' },
      { era: '秦汉', yearFrom: -221, yearTo: 220, factor: 415.8, confidence: 'typical', source: '秦汉一里 = 300 步 ≈ 415.8 m' },
      { era: '唐', yearFrom: 618, yearTo: 907, factor: 540, confidence: 'typical', source: '唐里 = 300 步 × 1.8 m ≈ 540 m（唐一步 5 尺）' },
      { era: '宋', yearFrom: 960, yearTo: 1279, factor: 572, confidence: 'typical', source: '宋里 ≈ 572 m' },
      { era: '明', yearFrom: 1368, yearTo: 1644, factor: 572, confidence: 'typical', source: '明里 ≈ 572 m（沿用宋制）' },
      { era: '清', yearFrom: 1644, yearTo: 1912, factor: 576, confidence: 'typical', source: '清里 = 180 丈 = 576 m' },
      { era: '民国', yearFrom: 1912, yearTo: 1949, factor: 500, variant: '市里', confidence: 'exact', source: '1929 年定 1 市里 = 1500 市尺 = 500 m' },
      { era: '现代', yearFrom: 1949, factor: 500, variant: '市里', confidence: 'exact', source: '1 市里 = 500 m' },
    ],
  },
  {
    name: '丈',
    cjk: ['丈'],
    dimension: 'length',
    variants: [
      { era: '秦汉', yearFrom: -221, yearTo: 220, factor: 2.31, confidence: 'typical', source: '1 丈 = 10 尺（汉尺 23.1 cm）' },
      { era: '唐', yearFrom: 618, yearTo: 907, factor: 3.0, confidence: 'typical', source: '1 丈 = 10 大尺' },
      { era: '明', yearFrom: 1368, yearTo: 1644, factor: 3.2, confidence: 'typical', source: '1 丈 = 10 营造尺' },
      { era: '清', yearFrom: 1644, yearTo: 1912, factor: 3.2, confidence: 'exact', source: '1 丈 = 10 营造尺 = 3.2 m' },
      { era: '现代', yearFrom: 1912, factor: 3.2, confidence: 'exact', source: '市制 1 丈 = 10/3 m ≈ 3.2 m（1959 年定 1 丈 = 3.2 m）' },
    ],
  },
  {
    name: '步',
    cjk: ['步'],
    dimension: 'length',
    variants: [
      { era: '周', yearFrom: -1046, yearTo: -256, factor: 1.386, confidence: 'typical', source: '周一步 = 6 尺（周尺 23.1 cm）≈ 1.386 m' },
      { era: '秦汉', yearFrom: -221, yearTo: 220, factor: 1.386, confidence: 'typical', source: '秦汉一步 = 6 尺 ≈ 1.386 m' },
      { era: '唐', yearFrom: 618, yearTo: 907, factor: 1.5, confidence: 'typical', source: '唐改一步 = 5 尺 = 1.5 m（这是里变化的原因）' },
      { era: '清', yearFrom: 1644, yearTo: 1912, factor: 1.6, confidence: 'typical', source: '清一步 = 5 尺 = 1.6 m' },
    ],
  },
]

/**
 * ## 中国历代量（容量）
 *
 * ⚠ 容量单位的变化比长度更剧烈：**汉升约 200 mL，唐宋升约 600 mL，
 * 明清升约 1000 mL** —— 差 5 倍。写「一升米」时若用现代 1 L 会差很多。
 */
export const CHINESE_VOLUME: EraUnit[] = [
  {
    name: '升',
    cjk: ['升'],
    dimension: 'volume',
    variants: [
      { era: '秦汉', yearFrom: -221, yearTo: 220, factor: 0.0002, confidence: 'typical', source: '秦汉一升 ≈ 200 mL（商鞅方升 202 mL）' },
      { era: '汉', yearFrom: -202, yearTo: 220, factor: 0.000198, confidence: 'typical', source: '新莽嘉量一升 ≈ 198 mL' },
      { era: '唐', yearFrom: 618, yearTo: 907, factor: 0.0006, confidence: 'typical', source: '唐一升 ≈ 600 mL（有大升小升之别）' },
      { era: '宋', yearFrom: 960, yearTo: 1279, factor: 0.000702, confidence: 'typical', source: '宋一升 ≈ 702 mL' },
      { era: '明', yearFrom: 1368, yearTo: 1644, factor: 0.001073, confidence: 'typical', source: '明一升 ≈ 1073 mL' },
      { era: '清', yearFrom: 1644, yearTo: 1912, factor: 0.001035, confidence: 'exact', source: '清一升 ≈ 1035 mL（漕斛制）' },
      { era: '现代', yearFrom: 1912, factor: 0.001, confidence: 'exact', source: '公制 1 L' },
    ],
  },
  {
    name: '斗',
    cjk: ['斗'],
    dimension: 'volume',
    variants: [
      { era: '秦汉', yearFrom: -221, yearTo: 220, factor: 0.002, confidence: 'typical', source: '1 斗 = 10 升 ≈ 2 L' },
      { era: '唐', yearFrom: 618, yearTo: 907, factor: 0.006, confidence: 'typical', source: '1 斗 = 10 升 ≈ 6 L' },
      { era: '宋', yearFrom: 960, yearTo: 1279, factor: 0.00702, confidence: 'typical', source: '1 斗 ≈ 7 L' },
      { era: '明', yearFrom: 1368, yearTo: 1644, factor: 0.01073, confidence: 'typical', source: '1 斗 ≈ 10.7 L' },
      { era: '清', yearFrom: 1644, yearTo: 1912, factor: 0.01035, confidence: 'exact', source: '1 斗 ≈ 10.35 L' },
    ],
  },
  {
    name: '石',
    cjk: ['石'],
    dimension: 'volume',
    variants: [
      { era: '秦汉', yearFrom: -221, yearTo: 220, factor: 0.02, confidence: 'typical', source: '1 石 = 10 斗 ≈ 20 L（秦汉石是容量，不是重量）' },
      { era: '唐', yearFrom: 618, yearTo: 907, factor: 0.06, confidence: 'typical', source: '1 石 = 10 斗 ≈ 60 L' },
      { era: '宋', yearFrom: 960, yearTo: 1279, factor: 0.0702, confidence: 'typical', source: '1 石 ≈ 70 L' },
      { era: '明', yearFrom: 1368, yearTo: 1644, factor: 0.1073, confidence: 'typical', source: '1 石 ≈ 107 L' },
      { era: '清', yearFrom: 1644, yearTo: 1912, factor: 0.1035, confidence: 'exact', source: '1 石 ≈ 103.5 L' },
    ],
  },
]

/**
 * ## 中国历代衡（质量）
 *
 * ⚠ 「斤」从商代约 120 g 涨到清代 596.8 g —— **差 5 倍**。
 */
export const CHINESE_MASS: EraUnit[] = [
  {
    name: '斤',
    cjk: ['斤'],
    dimension: 'mass',
    variants: [
      { era: '商', yearFrom: -1600, yearTo: -1046, factor: 0.12, factorHigh: 0.14, confidence: 'range', source: '商代斤约 120–140 g（出土器物推算，样本少）' },
      { era: '周', yearFrom: -1046, yearTo: -256, factor: 0.22, confidence: 'typical', source: '周斤约 220 g' },
      { era: '秦汉', yearFrom: -221, yearTo: 220, factor: 0.25, confidence: 'typical', source: '秦汉一斤 = 16 两 ≈ 250 g（汉秤实测 244–258 g）' },
      { era: '汉', yearFrom: -202, yearTo: 220, factor: 0.254, confidence: 'typical', source: '西汉一斤 ≈ 254 g' },
      { era: '三国', yearFrom: 220, yearTo: 280, factor: 0.22, confidence: 'typical', source: '三国一斤 ≈ 220 g（战乱制轻）' },
      { era: '南北朝', yearFrom: 420, yearTo: 589, factor: 0.44, confidence: 'typical', source: '北魏一斤 ≈ 440 g（「大斤」）' },
      { era: '隋', yearFrom: 581, yearTo: 618, factor: 0.668, confidence: 'typical', source: '隋一斤 ≈ 668 g（大制），另有小制 220 g' },
      { era: '唐', yearFrom: 618, yearTo: 907, factor: 0.668, confidence: 'typical', source: '唐一斤 ≈ 668 g' },
      { era: '宋', yearFrom: 960, yearTo: 1279, factor: 0.64, confidence: 'typical', source: '宋一斤 ≈ 640 g' },
      { era: '元', yearFrom: 1271, yearTo: 1368, factor: 0.633, confidence: 'typical', source: '元一斤 ≈ 633 g' },
      { era: '明', yearFrom: 1368, yearTo: 1644, factor: 0.5968, confidence: 'typical', source: '明一斤 ≈ 596.8 g' },
      { era: '清', yearFrom: 1644, yearTo: 1912, factor: 0.5968, confidence: 'exact', source: '清库平一斤 = 596.816 g（有官定标准）' },
      { era: '民国', yearFrom: 1912, yearTo: 1949, factor: 0.5, variant: '市斤', confidence: 'exact', source: '1929 年定 1 市斤 = 1/2 kg' },
      { era: '现代', yearFrom: 1949, factor: 0.5, variant: '市斤', confidence: 'exact', source: '1 市斤 = 500 g' },
    ],
  },
  {
    name: '两',
    cjk: ['两'],
    dimension: 'mass',
    variants: [
      { era: '秦汉', yearFrom: -221, yearTo: 220, factor: 0.0156, confidence: 'typical', source: '1 两 = 1/16 斤 ≈ 15.6 g' },
      { era: '唐', yearFrom: 618, yearTo: 907, factor: 0.0418, confidence: 'typical', source: '唐 1 两 ≈ 41.8 g（大制）' },
      { era: '清', yearFrom: 1644, yearTo: 1912, factor: 0.0373, confidence: 'exact', source: '清 1 两 = 1/16 斤 ≈ 37.3 g' },
      { era: '现代', yearFrom: 1912, factor: 0.05, confidence: 'exact', source: '市制 1 两 = 50 g（1959 年改为 1 斤 = 10 两）' },
    ],
  },
]

/** 全部中国历史单位。 */
export const CHINESE_ERA_UNITS: EraUnit[] = [
  ...CHINESE_LENGTH,
  ...CHINESE_VOLUME,
  ...CHINESE_MASS,
]

/**
 * 按时代查单位的换算因子。
 *
 * @param unitName - 单位通名（如「尺」）
 * @param era - 时代（如「汉」）
 * @param variant - 变体名（可选，如「营造尺」）
 * @returns 匹配到的变体列表（可能多个，如唐代有大尺与小尺）
 */
export function findEraVariant(unitName: string, era?: Era, variant?: string): EraVariant[] {
  const unit = CHINESE_ERA_UNITS.find((u) => u.name === unitName || u.cjk.includes(unitName))
  if (!unit) return []
  return unit.variants.filter((v) => {
    if (era !== undefined && v.era !== era) return false
    if (variant !== undefined && v.variant !== variant) return false
    return true
  })
}

/**
 * 列出某单位在所有时代的取值（用于「同一个词差多少」）。
 *
 * @param unitName - 单位通名
 * @returns 按年代排序的变体
 */
export function eraTimeline(unitName: string): EraVariant[] {
  const unit = CHINESE_ERA_UNITS.find((u) => u.name === unitName || u.cjk.includes(unitName))
  if (!unit) return []
  return [...unit.variants].sort((a, b) => (a.yearFrom ?? 0) - (b.yearFrom ?? 0))
}
