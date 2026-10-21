/**
 * 公式标签体系（ADR-0001 的延伸）。
 *
 * 用户纠正了原来的分类方式：
 *   原来用 `cat`（physics/mechanics 之类）当唯一分类 —— 错。
 *   正确做法是**多标签**，且至少分三条互相独立的轴：
 *
 *   1. layer（规则层级）：离「最底层自然规则」有多远
 *        fundamental     基本规则：守恒律、相对论、量子、热力学定律级别
 *        derived         导出规律：由基本规则推出、有闭合式（牛顿、麦克斯韦、斯特藩-玻尔兹曼）
 *        phenomenological 经验规律：带实验拟合系数，量级可信（材料强度、风寒、蒸散、异速生长）
 *        engineering     工程/生活换算：几何、配比、剂量、补给，主要由定义与算术决定
 *        conventional    社会约定：货币、制度、统计口径，由人类约定而非自然律
 *
 *   2. domains（学科领域）：physics / chemistry / biology / materials / earth /
 *        astronomy / engineering / military / agriculture / medicine /
 *        economics / social / math —— 一条公式可以同时属于多个领域。
 *
 *   3. frequency（主角感知频率）：
 *        **不是"世界观推导常用度"，而是"以主角为视角，读者在故事里感知到它的频率"**。
 *        例：水塔压力（工程）在主角爬塔时会被感知 → high；
 *            量子隧穿（基本规则）几乎不会出现在主角眼前 → low。
 *
 * `cat` 保留为旧字段（兼容 UI 与既有测试），但分类判断一律走本模块。
 *
 * @module dsh-math-calculator/taxonomy
 */

import { FORMULAS, type FormulaDef } from './formulas.js'

/** 规则层级。 */
export type FormulaLayer = 'fundamental' | 'derived' | 'phenomenological' | 'engineering' | 'conventional'

/** 层级定义（顺序 = 离底层从近到远）。 */
export const LAYERS: Array<{ id: FormulaLayer; name: string; desc: string }> = [
  { id: 'fundamental', name: '基本规则', desc: '守恒律、相对论、量子、热力学定律——自然律本身' },
  { id: 'derived', name: '导出规律', desc: '由基本规则推出、有闭合形式的经典关系' },
  { id: 'phenomenological', name: '经验规律', desc: '带实验拟合系数，量级可信、具体数字有误差' },
  { id: 'engineering', name: '工程换算', desc: '几何、配比、剂量、补给——由定义与算术决定' },
  { id: 'conventional', name: '社会约定', desc: '货币、制度、统计口径——由人类约定而非自然律' },
]

/** 学科领域。 */
export const DOMAINS = [
  'physics',
  'chemistry',
  'biology',
  'materials',
  'earth',
  'astronomy',
  'engineering',
  'military',
  'agriculture',
  'medicine',
  'economics',
  'social',
  'math',
] as const

/** 领域中文名。 */
export const DOMAIN_NAMES: Record<string, string> = {
  physics: '物理',
  chemistry: '化学',
  biology: '生物',
  materials: '材料',
  earth: '地球',
  astronomy: '天文',
  engineering: '工程',
  military: '军事',
  agriculture: '农业',
  medicine: '医学',
  economics: '经济',
  social: '社会',
  math: '数学',
}

/** 分类路径 → 默认层级（可用 LAYER_BY_ID 覆盖）。 */
const CAT_LAYER: Array<[string, FormulaLayer]> = [
  ['physics/quantum', 'fundamental'],
  ['physics/nuclear', 'fundamental'],
  ['physics/relativity', 'fundamental'],
  ['physics/mechanics', 'derived'],
  ['physics/gravity', 'derived'],
  ['physics/em', 'derived'],
  ['physics/thermo', 'derived'],
  ['physics/fluid', 'derived'],
  ['physics/waves', 'derived'],
  ['physics/optics', 'derived'],
  ['physics/astronomy', 'derived'],
  ['physics/scaling', 'phenomenological'],
  ['chemistry/mole', 'derived'],
  ['chemistry/solution', 'derived'],
  ['chemistry/thermo', 'derived'],
  ['chemistry/acid', 'phenomenological'],
  ['chemistry/electro', 'phenomenological'],
  ['chemistry/kinetics', 'phenomenological'],
  ['materials/', 'engineering'],
  ['perception/', 'engineering'],
  ['military/', 'engineering'],
  ['biology/', 'phenomenological'],
  ['math/', 'fundamental'],
  ['econ/', 'conventional'],
  ['social/', 'conventional'],
]

/** 分类路径 → 默认领域。 */
const CAT_DOMAINS: Array<[string, string[]]> = [
  ['physics/astronomy', ['physics', 'astronomy']],
  ['physics/', ['physics']],
  ['chemistry/', ['chemistry']],
  ['materials/', ['materials', 'engineering']],
  ['perception/weather', ['earth', 'physics']],
  ['perception/climate', ['earth', 'physics']],
  ['perception/celestial', ['astronomy']],
  ['perception/senses', ['physics', 'biology']],
  ['perception/travel', ['engineering', 'physics']],
  ['perception/architecture', ['engineering', 'materials']],
  ['perception/agriculture', ['agriculture', 'biology']],
  ['perception/', ['engineering']],
  ['military/', ['military', 'physics']],
  ['biology/physiology', ['biology', 'medicine']],
  ['biology/', ['biology']],
  ['math/', ['math']],
  ['econ/', ['economics']],
  ['social/', ['social']],
]

/**
 * 单条公式的层级覆盖。
 *
 * 为什么需要：同一个 cat 里层级并不一致（"材料/结构"里既有导出规律也有经验公式）。
 * 新增读者视角批次时，逐条标出真实层级。
 */
const LAYER_BY_ID: Record<string, FormulaLayer> = {
  // 材料/结构：力学关系是导出的，强度/疲劳/腐蚀是经验的，砌筑是工程
  hoop_stress: 'derived',
  thermal_stress: 'derived',
  buckling_euler: 'derived',
  beam_center_deflection: 'derived',
  beam_center_moment: 'derived',
  wood_beam_moment_capacity: 'derived',
  column_axial_capacity: 'derived',
  arch_thrust: 'derived',
  hardness_to_yield: 'phenomenological',
  fatigue_life_basquin: 'phenomenological',
  corrosion_rate_weightloss: 'phenomenological',
  brick_count: 'engineering',
  roof_load: 'engineering',
  water_tower_pressure: 'derived',
  window_heat_loss: 'derived',
  lighting_lumen_need: 'engineering',
  chimney_draft: 'derived',
  city_wall_perimeter: 'engineering',
  floor_area_ratio: 'engineering',
  stair_comfort_rule: 'conventional',
  // 天气：风寒/酷热/露点是经验，其余是导出
  wind_chill: 'phenomenological',
  heat_index: 'phenomenological',
  dew_point_magnus: 'phenomenological',
  wind_power_density: 'derived',
  cooling_newton: 'derived',
  heat_conduction_slab: 'derived',
  thermal_time_constant: 'derived',
  // 声光：大多导出，EV 是定义式
  echo_distance: 'derived',
  lightning_distance: 'derived',
  music_note_frequency: 'derived',
  string_fundamental_frequency: 'derived',
  sound_attenuation_distance: 'derived',
  lens_magnification: 'derived',
  camera_exposure_ev: 'engineering',
  optical_resolving_power: 'derived',
  // 交通：船速是经验，其余导出
  hull_speed: 'phenomenological',
  mach_number: 'derived',
  projectile_range_vacuum: 'derived',
  projectile_apex_height: 'derived',
  stopping_distance: 'derived',
  impact_speed_freefall: 'derived',
  // 农业/人体
  growing_degree_days: 'engineering',
  reference_evapotranspiration: 'phenomenological',
  human_body_surface_area: 'phenomenological',
  basal_metabolic_rate: 'phenomenological',
  daily_water_need: 'phenomenological',
  widmark_bac: 'phenomenological',
  allometric_dose_scale: 'phenomenological',
  crop_total_yield: 'engineering',
  food_energy_supply: 'engineering',
  population_fed: 'engineering',
  seed_rate: 'engineering',
  fertilizer_need: 'engineering',
  irrigation_volume: 'engineering',
  livestock_feed_need: 'engineering',
  pasture_carrying_capacity: 'phenomenological',
  harvest_labor_days: 'phenomenological',
  // 攻城
  ram_momentum: 'derived',
  trebuchet_range_estimate: 'phenomenological',
  wall_breach_energy: 'phenomenological',
  formation_frontage: 'engineering',
  army_supply_days: 'engineering',
  march_days: 'engineering',
  // 医药
  drug_dose_by_weight: 'engineering',
  clark_child_dose: 'phenomenological',
  blood_volume_estimate: 'phenomenological',
  fluid_deficit: 'engineering',
  infusion_rate: 'engineering',
  max_heart_rate: 'phenomenological',
  pregnancy_days_remaining: 'phenomenological',
  fever_energy_cost: 'phenomenological',
  ld50_dose: 'engineering',
}

/** 取分类匹配的第一个值。 */
function firstMatch<T>(cat: string, table: Array<[string, T]>): T | undefined {
  for (const [prefix, value] of table) {
    if (cat === prefix || cat.startsWith(prefix)) return value
  }
  return undefined
}

/** 某条公式的规则层级。 */
export function layerOf(formula: FormulaDef): FormulaLayer {
  return formula.layer ?? LAYER_BY_ID[formula.id] ?? firstMatch(formula.cat, CAT_LAYER) ?? 'engineering'
}

/** 某条公式的学科领域（多标签）。 */
export function domainsOf(formula: FormulaDef): string[] {
  const domains = formula.domains ?? firstMatch(formula.cat, CAT_DOMAINS) ?? []
  // 去重并保持稳定顺序
  return [...new Set(domains)]
}

/** 某条公式的细标签（默认取分类最后一段）。 */
export function tagsOf(formula: FormulaDef): string[] {
  if (formula.tags && formula.tags.length > 0) return formula.tags
  const last = formula.cat.split('/').filter(Boolean).pop()
  return last ? [last] : []
}

/** 一条公式的完整标签。 */
export interface FormulaLabels {
  id: string
  name: string
  layer: FormulaLayer
  layerName: string
  domains: string[]
  domainNames: string[]
  tags: string[]
}

/** 取一条公式的全部标签。 */
export function labelsOf(formula: FormulaDef): FormulaLabels {
  const layer = layerOf(formula)
  const domains = domainsOf(formula)
  return {
    id: formula.id,
    name: formula.name,
    layer,
    layerName: LAYERS.find((item) => item.id === layer)?.name ?? layer,
    domains,
    domainNames: domains.map((domain) => DOMAIN_NAMES[domain] ?? domain),
    tags: tagsOf(formula),
  }
}

/** 按层级筛选。 */
export function formulasByLayer(layer: FormulaLayer): FormulaDef[] {
  return FORMULAS.filter((formula) => layerOf(formula) === layer)
}

/** 按领域筛选。 */
export function formulasByDomain(domain: string): FormulaDef[] {
  return FORMULAS.filter((formula) => domainsOf(formula).includes(domain))
}

/** 层级统计。 */
export function layerCounts(): Array<{ layer: FormulaLayer; name: string; count: number }> {
  return LAYERS.map((item) => ({
    layer: item.id,
    name: item.name,
    count: FORMULAS.filter((formula) => layerOf(formula) === item.id).length,
  }))
}

/** 领域统计。 */
export function domainCounts(): Array<{ domain: string; name: string; count: number }> {
  return DOMAINS.map((domain) => ({
    domain,
    name: DOMAIN_NAMES[domain] ?? domain,
    count: FORMULAS.filter((formula) => domainsOf(formula).includes(domain)).length,
  })).filter((item) => item.count > 0)
}
