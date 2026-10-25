/**
 * 世界参数元数据：界面据此渲染表单，不写死任何参数。
 *
 * @module dsh-math-calculator/world-params
 * @description
 * ## 为什么要单独一个模块
 *
 * 界面需要知道每个参数的：中文名、单位、默认值、范围、
 * 「改了它影响什么」。这些知识属于**领域**，不属于界面——
 * 所以放在后端，界面只负责画。
 *
 * 好处：以后加参数只改这一个文件，界面自动跟着长出新的输入框。
 *
 * ## 分层
 *
 * | 层 | 含义 | 界面处理 |
 * |---|---|---|
 * | `basic` | 高频，作者一定关心 | 默认展开 |
 * | `advanced` | 低频，精调才用 | 折叠在「更多参数」 |
 * | `derived` | 派生量，**不可输入** | 只读显示（不在本文件，见 derive 输出） |
 *
 * ⚠️ 约束：本表**只列基础量**。重力、均温、一天这些派生量绝不能出现在这里，
 * 否则界面会允许用户硬设定一个与公式冲突的值。
 */

/** 一个参数的元数据。 */
export interface ParamSpec {
  /** 参数键名（对应 WorldParams 的字段）。 */
  key: string
  /** 中文名。 */
  label: string
  /** 单位（显示在输入框右侧）。 */
  unit: string
  /** 默认值。array 型给空数组。 */
  def: number | string | boolean | unknown[]
  /** 分层：basic 默认展开，advanced 折叠。 */
  tier: 'basic' | 'advanced'
  /**
   * 类型：
   *   number 数字，choice 下拉，bool 开关，**array 结构化数组**（如逐颗卫星）。
   *
   * `array` 是给「一个参数装一整张表」用的：`moons` 是 MoonSpec[]，
   * 每颗卫星各有质量/距离/半径/反照率。它不能按标量校验，
   * 由 `itemShape` 描述单颗的字段。
   */
  kind: 'number' | 'choice' | 'bool' | 'array'
  /** choice 型可选项。 */
  choices?: Array<{ value: string; label: string }>
  /**
   * array 型：单个元素的字段规格。
   *
   * 每项 `{ key, kind, range? }`；`kind` 支持 number / string。
   * 校验时逐元素逐字段走，越界按该字段的 range 判。
   */
  itemShape?: Array<{
    key: string
    kind: 'number' | 'string'
    range?: { min?: number; max?: number; hard?: boolean }
    /** 是否必填（缺了就用该字段的默认值，一般不必填）。 */
    required?: boolean
  }>
  /** 改了它影响什么（给作者看的一句话）。 */
  affects: string
  /**
   * 合理范围。
   *
   * ⚠️ 语义经过 2026-10-25 修正，现在**真的会被校验**：
   *   · `hard` 未标 → **软范围**：越界仍写入，但返回 `warnings[]` 提醒
   *     （作者要 500 倍质量的行星是设定自由，不该拦）；
   *   · `hard: true` → **硬边界**：越界直接 400，因为会算出
   *     Infinity / NaN / 负物理量，下游没法用。
   *
   * 哪些参数该标 hard 不是猜的，是实测出来的（见 `test/validation.mjs`）。
   */
  range?: { min?: number; max?: number; hard?: boolean }
  /** 是否可为空（空 = 用默认值）。 */
  optional?: boolean
  /** 分组（界面按组排列）。 */
  group: string
}

import { STAR_CLASSES } from './star-catalog.js'

/** 恒星光谱型选项（从目录生成，不手写）。 */
function starChoices(): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = []
  for (const item of STAR_CLASSES) {
    out.push({ value: item.id, label: item.id + '（' + item.name + '，' + item.tempK + ' K）' })
  }
  return out
}

/**
 * 全部基础参数（25 个）。
 *
 * 顺序即界面顺序：先分组，组内 basic 在前。
 */
export const WORLD_PARAMS: ParamSpec[] = [
  // ── 恒星 ──
  {
    key: 'starClass',
    label: '恒星类型',
    unit: '',
    def: 'G2V',
    tier: 'basic',
    kind: 'choice',
    choices: starChoices(),
    affects: '一次选定恒星的质量、半径、温度——比手填三个数省事',
    group: '恒星',
    optional: true,
  },
  {
    key: 'starMass',
    label: '恒星质量',
    unit: '太阳质量',
    def: 1,
    tier: 'advanced',
    kind: 'number',
    affects: '决定寿命（∝M^-2.5）与光度（∝M^4）。大质量星亮但短命',
    range: { min: 0.08, max: 50, hard: true },
    group: '恒星',
    optional: true,
  },
  {
    key: 'starRadius',
    label: '恒星半径',
    unit: '太阳半径',
    def: 1,
    tier: 'advanced',
    kind: 'number',
    affects: '影响表面温度与光谱型；与质量一起决定光度',
    range: { min: 0.01, max: 1000 },
    group: '恒星',
    optional: true,
  },
  {
    key: 'starTemp',
    label: '恒星表面温度',
    unit: 'K',
    def: 5778,
    tier: 'advanced',
    kind: 'number',
    affects: '决定光色与宜居带位置。太阳 5778 K（黄白）',
    range: { min: 2000, max: 50000, hard: true },
    group: '恒星',
    optional: true,
  },

  // ── 轨道 ──
  {
    key: 'orbitAU',
    label: '离恒星多远',
    unit: 'AU（地球 = 1）',
    def: 1,
    tier: 'basic',
    kind: 'number',
    affects: '决定冷暖与年长。宜居带约 0.95—1.67',
    range: { min: 0.01, max: 100, hard: true },
    group: '轨道',
    optional: true,
  },
  {
    key: 'eccentricity',
    label: '轨道偏心率',
    unit: '',
    def: 0.0167,
    tier: 'advanced',
    kind: 'number',
    affects: '决定季节温差。地球 0.0167 近乎圆形；0.3 以上冬夏差异剧烈',
    range: { min: 0, max: 0.9 },
    group: '轨道',
    optional: true,
  },

  // ── 行星 ──
  {
    key: 'planetMass',
    label: '行星质量',
    unit: '地球质量',
    def: 1,
    tier: 'basic',
    kind: 'number',
    affects: '决定重力（与半径一起）。质量大则重力大、大气更易保留',
    range: { min: 0.01, max: 100, hard: true },
    group: '行星',
    optional: true,
  },
  {
    key: 'planetRadius',
    label: '行星半径',
    unit: '地球半径',
    def: 1,
    tier: 'basic',
    kind: 'number',
    affects: '决定重力与表面积。半径大则重力小',
    range: { min: 0.1, max: 20, hard: true },
    group: '行星',
    optional: true,
  },
  {
    key: 'rotationHours',
    label: '一天多长',
    unit: '小时',
    def: 23.934,
    tier: 'basic',
    kind: 'number',
    affects: '决定昼夜与风暴。地球 24；太短科氏力强、风暴猛',
    range: { min: 0.5, max: 5000, hard: true },
    group: '行星',
    optional: true,
  },
  {
    key: 'obliquityDeg',
    label: '轴倾角',
    unit: '度',
    def: 23.44,
    tier: 'basic',
    kind: 'number',
    affects: '决定有没有四季。地球 23.4；接近 0 则无季节，接近 90 则极端',
    range: { min: 0, max: 90 },
    group: '行星',
    optional: true,
  },
  {
    key: 'albedo',
    label: '反照率',
    unit: '0—1',
    def: 0.306,
    tier: 'advanced',
    kind: 'number',
    affects: '反射掉多少阳光。地球 0.31；冰面高（0.6+）、海面低（0.1）',
    range: { min: 0, max: 1 },
    group: '行星',
    optional: true,
  },

  // ── 大气 ──
  {
    key: 'pressure',
    label: '海平面气压',
    unit: 'Pa',
    def: 101325,
    tier: 'advanced',
    kind: 'number',
    affects: '决定能不能呼吸、水沸点、飞行难易。地球 101325',
    range: { min: 0, max: 1e8 },
    group: '大气',
    optional: true,
  },
  {
    key: 'greenhouse',
    label: '温室效应',
    unit: 'K 增温',
    def: 33,
    tier: 'advanced',
    kind: 'number',
    affects: '温室效应抬高均温多少。地球 33 K；金星数百 K',
    range: { min: 0, max: 1000 },
    group: '大气',
    optional: true,
  },
  {
    key: 'molarMass',
    label: '大气摩尔质量',
    unit: 'kg/mol',
    def: 0.02896,
    tier: 'advanced',
    kind: 'number',
    affects: '决定声速与大气标高。地球空气 0.029；二氧化碳更重',
    range: { min: 0.002, max: 0.5 },
    group: '大气',
    optional: true,
  },
  {
    key: 'gamma',
    label: '绝热指数',
    unit: '',
    def: 1.4,
    tier: 'advanced',
    kind: 'number',
    affects: '决定声速与对流。双原子气体 1.4；单原子 1.67',
    range: { min: 1, max: 2 },
    group: '大气',
    optional: true,
  },
  {
    key: 'hasLiquid',
    label: '有液态溶剂',
    unit: '',
    def: true,
    tier: 'advanced',
    kind: 'bool',
    affects: '没有液态介质，生命与化学会难得多',
    group: '大气',
  },

  // ── 地表 ──
  {
    key: 'materialStrength',
    label: '地表材料抗压强度',
    unit: 'Pa',
    def: 1.3e8,
    tier: 'advanced',
    kind: 'number',
    affects: '决定建筑能建多高。花岗岩 1.3e8；更强的材料能建更高',
    range: { min: 1e5, max: 1e12 },
    group: '地表',
    optional: true,
  },
  {
    key: 'materialDensity',
    label: '地表材料密度',
    unit: 'kg/m³',
    def: 2700,
    tier: 'advanced',
    kind: 'number',
    affects: '与强度一起决定建筑上限。花岗岩 2700',
    range: { min: 100, max: 30000 },
    group: '地表',
    optional: true,
  },

  // ── 卫星 ──
  {
    key: 'moonCount',
    label: '卫星数量',
    unit: '颗',
    def: 1,
    tier: 'advanced',
    kind: 'number',
    affects: '影响潮汐与夜空。地球 1 颗',
    range: { min: 0, max: 30 },
    group: '卫星',
    optional: true,
  },
  {
    key: 'moonMass',
    label: '主卫星质量',
    unit: '月球质量',
    def: 1,
    tier: 'advanced',
    kind: 'number',
    affects: '影响潮汐强度。月球 1',
    range: { min: 0.001, max: 100, hard: true },
    group: '卫星',
    optional: true,
  },
  {
    key: 'moonDistance',
    label: '主卫星距离',
    unit: '地月距离',
    def: 1,
    tier: 'advanced',
    kind: 'number',
    affects: '影响潮汐与月视大小。地月 384400 km',
    range: { min: 0.1, max: 100, hard: true },
    group: '卫星',
    optional: true,
  },
  {
    key: 'moons',
    label: '逐颗卫星设定',
    unit: '颗',
    def: [],
    tier: 'advanced',
    kind: 'array',
    /**
     * 每颗卫星的字段。
     *
     * 与 moonMass/moonDistance 的关系：给了 `moons` 数组就以它为准，
     * `moonCount` / `moonMass` / `moonDistance` 的数量语义自动失效
     * （见 `world.ts` 的 `params.moons.length > 0` 分支）。
     *
     * `massMoon` 与 `distanceMoon` 标了 hard：零质量会让视星等变 Infinity，
     * 零距离会让潮汐力变 Infinity（实测）。
     */
    itemShape: [
      { key: 'name', kind: 'string' },
      { key: 'massMoon', kind: 'number', range: { min: 0.001, max: 100, hard: true } },
      { key: 'distanceMoon', kind: 'number', range: { min: 0.1, max: 100, hard: true } },
      { key: 'radiusKm', kind: 'number', range: { min: 1, max: 500000 } },
      { key: 'albedo', kind: 'number', range: { min: 0, max: 1 } },
    ],
    affects: '给了就按逐颗参数推演（洛希极限/希尔球/相邻间距/观感），数量以数组长度为准',
    range: { min: 0, max: 30 },
    group: '卫星',
    optional: true,
  },

  // ── 天空 ──
  {
    key: 'lightPollution',
    label: '光污染',
    unit: '0—1',
    def: 0,
    tier: 'advanced',
    kind: 'number',
    affects: '影响夜空能看到多少星。0 = 无人烟，1 = 特大城市',
    range: { min: 0, max: 1 },
    group: '天空',
    optional: true,
  },
  {
    key: 'galaxyBand',
    label: '银河带亮度',
    unit: '0—1',
    def: 0.6,
    tier: 'advanced',
    kind: 'number',
    affects: '设定星球是否在星系盘内，决定夜空有没有银河',
    range: { min: 0, max: 1 },
    group: '天空',
    optional: true,
  },
]

/** 参数索引（按 key 查）。 */
export const PARAM_INDEX: Map<string, ParamSpec> = new Map(
  WORLD_PARAMS.map(function (item) { return [item.key, item] }),
)

/** 分组顺序（界面按这个顺序排）。 */
export const PARAM_GROUPS = ['恒星', '轨道', '行星', '大气', '地表', '卫星', '天空']

/** 允许写入 world 的键（白名单，防止垃圾字段入库）。 */
export const WORLD_KEYS = WORLD_PARAMS.map(function (item) { return item.key })

/**
 * 按分组整理参数（给界面直接用）。
 *
 * @returns 每组的参数列表
 */
export function paramsByGroup(): Array<{ group: string; params: ParamSpec[] }> {
  return PARAM_GROUPS.map(function (group) {
    return {
      group: group,
      params: WORLD_PARAMS.filter(function (item) { return item.group === group }),
    }
  }).filter(function (item) { return item.params.length > 0 })
}
