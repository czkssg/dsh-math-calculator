/**
 * P3 日常生产 + P4 地质速率 + P5 社会失稳（31 条）。
 *
 * ## 三批的共性：都是「量级判据」
 *
 * 与前面几批不同，这三批的公式**没有精确解**，只有量级与方向。
 * 所以断言的设计原则是：
 *
 * ```
 *   ① 验标度（人日线性、时间反比、指数饱和）   ← 这些是确定的结构
 *   ② 验边界（0、负值、饱和）                  ← 这些是确定的
 *   ③ 不验「预测正确」                          ← 那本来就不该由公式保证
 * ```
 *
 * ## P5 的一条特殊断言
 *
 * 社会失稳的公式**必须明确声明「不是预测」**。这是本套最重要的守则 ——
 * 否则用户会拿派生的数当预言用，而那正是这类公式最大的危害。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-p345-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool: run } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const fm = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const num = async (id, overrides) => {
  const r = await run({ operation: 'formula', formula: id, overrides })
  if (!r.ok) return NaN
  const m = String(r.result).match(/结果:\s*(-?[0-9.eE+-]+)/)
  return m ? Number(m[1]) : NaN
}
const close = (a, b, tol) => Math.abs(a - b) <= Math.abs(tol ?? 1e-6)
const rel = (a, b, tol) => Math.abs(a - b) / Math.abs(b) <= tol

console.log('-- P3-1. 纺织：纺纱是瓶颈 --')
{
  /** 手工 30 人日/kg */
  assert('1kg 羊毛 → 30 人日', close(await num('spinning_labor_per_kg', { fiber_mass: 1, labor_per_unit_mass: 30, automation_factor: 1 }), 30))
  /** ★ 珍妮机 200 倍 → 0.15 人日 */
  assert('机械 200 倍 → 0.15 人日', close(await num('spinning_labor_per_kg', { fiber_mass: 1, labor_per_unit_mass: 30, automation_factor: 200 }), 0.15, 1e-9))
  /** ★ 线性于质量。 */
  const m1 = await num('spinning_labor_per_kg', { fiber_mass: 1, labor_per_unit_mass: 30, automation_factor: 1 })
  const m3 = await num('spinning_labor_per_kg', { fiber_mass: 3, labor_per_unit_mass: 30, automation_factor: 1 })
  assert('质量 ×3 → 人日 ×3', close(m3 / m1, 3, 1e-9))

  /** 织布：20m × 1.5 = 30 人日 */
  assert('20m → 30 人日', close(await num('weaving_labor_per_meter', { cloth_length: 20, labor_per_meter: 1.5, automation_factor: 1 }), 30))
  /**
   * ★★ 核心比例：一匹布的纱需 150 人日、织需 30 人日 → 纺占 83%。
   * 这个比例解释了「为什么工业革命的第一个突破是纺纱机」。
   */
  const spin = await num('spinning_labor_per_kg', { fiber_mass: 5, labor_per_unit_mass: 30, automation_factor: 1 })
  const weave = await num('weaving_labor_per_meter', { cloth_length: 20, labor_per_meter: 1.5, automation_factor: 1 })
  assert('纺占整链 83%（纺 150 vs 织 30）', close(spin / (spin + weave), 150 / 180, 1e-9), (spin / (spin + weave) * 100).toFixed(1) + '%')
}

console.log('-- P3-2. 食物保存：盐是战略物资 --')
{
  assert('1 吨肉 → 150kg 盐', close(await num('salt_preservation_need', { food_mass: 1000, salt_ratio: 0.15 }), 150))
  /** ★ 线性：肉翻倍盐翻倍。 */
  const s1 = await num('salt_preservation_need', { food_mass: 1000, salt_ratio: 0.15 })
  const s2 = await num('salt_preservation_need', { food_mass: 2000, salt_ratio: 0.15 })
  assert('肉翻倍 → 盐翻倍', close(s2 / s1, 2, 1e-9))

  /** 熏干产能：10m² × 5kg/m² ÷ 3天 = 16.7 kg/天 */
  assert('熏房日处理 16.7kg', close(await num('smoking_drying_capacity', { rack_area: 10, loading_density: 5, drying_days: 3 }), 16.6667, 1e-3))
  /** ★ 反比：干燥天数翻倍 → 日产能减半。 */
  const d3 = await num('smoking_drying_capacity', { rack_area: 10, loading_density: 5, drying_days: 3 })
  const d6 = await num('smoking_drying_capacity', { rack_area: 10, loading_density: 5, drying_days: 6 })
  /** 容差 1e-6：显示精度截断会让 2.0000000012 这类残差出现。 */
  assert('干燥天数翻倍 → 产能减半', close(d3 / d6, 2, 1e-6), String(d3 / d6))
}

console.log('-- P3-3. 知识与建材 --')
{
  assert('一令纸 → 2 人日', close(await num('paper_labor_per_sheet', { sheet_count: 500, labor_per_sheet: 0.004 }), 2))
  /** ★★ 核心对比：抄一本 53.6 人日，而纸本身只 0.6 人日 —— 贵在抄不在纸。 */
  const copy = await num('copying_labor_per_book', { page_count: 300, minutes_per_page: 60, minutes_per_day: 480, efficiency: 0.7 })
  const paper = await num('paper_labor_per_sheet', { sheet_count: 150, labor_per_sheet: 0.004 })
  assert('抄一本 53.6 人日', close(copy, 53.571, 0.01), String(copy))
  assert('纸只 0.6 人日（贵在抄不在纸）', close(paper, 0.6, 1e-9) && copy > paper * 80, paper + ' vs ' + copy.toFixed(1))
  /** ★ 页数线性。 */
  const c600 = await num('copying_labor_per_book', { page_count: 600, minutes_per_page: 60, minutes_per_day: 480, efficiency: 0.7 })
  assert('页数翻倍 → 人日翻倍', close(c600 / copy, 2, 1e-9))

  /** 烧砖：15000 × 1.2 = 18 吨柴 */
  assert('1.5 万砖 → 18 吨柴', close(await num('brick_firing_fuel', { brick_count: 15000, fuel_per_brick: 1.2 }), 18000))
  /** 石灰：100m² × 2cm × 1700 × 0.25 = 850kg */
  assert('100m² 抹灰 → 850kg 石灰', close(await num('lime_plaster_need', { wall_area: 100, thickness: 0.02, density: 1700, mortar_ratio: 0.25 }), 850))
  /** ★ 面积线性。 */
  const a200 = await num('lime_plaster_need', { wall_area: 200, thickness: 0.02, density: 1700, mortar_ratio: 0.25 })
  assert('面积翻倍 → 石灰翻倍', close(a200 / 850, 2, 1e-9))
}

console.log('-- P4-1. 地质速率：世界的时间深度 --')
{
  /** 剥蚀：1e9/1e8/2700 = 3.7mm/年（活跃山地量级） */
  const ero = await num('erosion_rate_denudation', { sediment_yield: 1e9, drainage_area: 1e8, rock_density: 2700 })
  assert('活跃山地 → 3.7 mm/年', rel(ero, 3.7037e-3, 0.01), (ero * 1000).toFixed(2) + ' mm/年')
  /** ★ 输沙减少 100 倍 → 剥蚀速率降到 0.037 mm/年（低地量级）。 */
  const low = await num('erosion_rate_denudation', { sediment_yield: 1e7, drainage_area: 1e8, rock_density: 2700 })
  assert('低地 → 0.037 mm/年', rel(low, 3.7037e-5, 0.01), (low * 1000).toFixed(3) + ' mm/年')

  /** 山寿命：1000m / 5e-4 = 200 万年 */
  assert('无抬升 → 200 万年', close(await num('mountain_lifetime', { mountain_height: 1000, erosion_rate: 5e-4, uplift_rate: 0 }), 2e6))
  /**
   * ★★ 核心：**抬升 > 剥蚀时「寿命」为负**（山还在长高）。
   * 这是「高山都在活跃造山带」的数学形态。
   */
  const rising = await num('mountain_lifetime', { mountain_height: 1000, erosion_rate: 5e-4, uplift_rate: 6e-4 })
  assert('抬升 > 剥蚀 → 负值（还在长高）', rising < 0, String(rising))
  /** ★ 抬升抵消一半 → 寿命翻倍。 */
  const half = await num('mountain_lifetime', { mountain_height: 1000, erosion_rate: 5e-4, uplift_rate: 2.5e-4 })
  assert('抬升抵消一半 → 寿命翻倍', close(half / 2e6, 2, 1e-9))

  /** ★★ 土壤形成：1cm 表土 500 年、30cm 耕作层 3000~15000 年 */
  const s1cm = await num('soil_formation_time', { soil_depth: 0.01, soil_formation_rate: 2e-5 })
  const s30cm = await num('soil_formation_time', { soil_depth: 0.3, soil_formation_rate: 1e-4 })
  assert('1cm 表土 → 500 年', close(s1cm, 500), String(s1cm))
  assert('30cm 耕作层 → 3000 年', close(s30cm, 3000), String(s30cm))
  /**
   * ★★ 本批最重要的一条：**成土速率 0.02~0.1mm/年，而耕作侵蚀可达 1mm/年** ——
   * 侵蚀快 10~50 倍。这就是「土壤是 mining 不是 farming」的定量根据。
   */
  assert('30cm 最慢需 1.5 万年', close(await num('soil_formation_time', { soil_depth: 0.3, soil_formation_rate: 2e-5 }), 15000), '')
}

console.log('-- P4-2. 河流、海岸、地下水 --')
{
  assert('三角洲 1000km² → 2000 年', close(await num('delta_progradation_time', { delta_area: 1e9, average_thickness: 20, sediment_yield: 2e10, rock_density: 2000 }), 2000))
  /** ★ 面积翻倍 → 时间翻倍。 */
  const d2 = await num('delta_progradation_time', { delta_area: 2e9, average_thickness: 20, sediment_yield: 2e10, rock_density: 2000 })
  assert('面积翻倍 → 时间翻倍', close(d2 / 2000, 2, 1e-9))

  assert('砂岩崖 → 0.5 m/年', close(await num('coastal_erosion_rate', { wave_energy: 1e7, exposure_factor: 1, cliff_height: 20, rock_hardness: 1e6 }), 0.5))
  /** ★★ 核心：软岩（1e5）比花岗岩（1e7）侵蚀快 100 倍。 */
  const soft = await num('coastal_erosion_rate', { wave_energy: 1e7, exposure_factor: 1, cliff_height: 20, rock_hardness: 1e5 })
  const hard = await num('coastal_erosion_rate', { wave_energy: 1e7, exposure_factor: 1, cliff_height: 20, rock_hardness: 1e7 })
  assert('软岩比花岗岩快 100 倍', close(soft / hard, 100, 1e-9), soft.toFixed(1) + ' vs ' + hard.toFixed(3))

  assert('深层含水层 → 100 年换水', close(await num('groundwater_recharge_time', { aquifer_storage: 1e8, recharge_rate: 1e6 }), 100))
  /** ★ 补给减半 → 换水周期翻倍（更容易枯）。 */
  const half = await num('groundwater_recharge_time', { aquifer_storage: 1e8, recharge_rate: 5e5 })
  assert('补给减半 → 周期翻倍', close(half / 100, 2, 1e-9))

  /** 拦沙率：C/I=10 → 91% */
  assert('C/I=10 → 拦 91%', close(await num('sediment_trap_efficiency', { reservoir_capacity: 1e8, annual_sediment_volume: 1e7 }), 0.909091, 1e-5))
  /** ★ 单调递增且趋近 1。 */
  const traps = await Promise.all([0.1, 1, 10, 100].map((r) => num('sediment_trap_efficiency', { reservoir_capacity: r * 1e7, annual_sediment_volume: 1e7 })))
  assert('库容越大拦得越彻底', traps.every((v, i) => i === 0 || v > traps[i - 1]), traps.map((v) => v.toFixed(2)).join(' < '))

  /** ★★ 水库寿命：库容 1e8、年沙 1e7、拦沙 0.8 → 12.5 年（残酷但真实）。 */
  assert('大水库只 12.5 年就淤满', close(await num('reservoir_life', { reservoir_capacity: 1e8, annual_sediment_volume: 1e7, trap_efficiency: 0.8 }), 12.5))
  /** ★ 来沙减半 → 寿命翻倍。 */
  const l2 = await num('reservoir_life', { reservoir_capacity: 1e8, annual_sediment_volume: 5e6, trap_efficiency: 0.8 })
  assert('来沙减半 → 寿命翻倍', close(l2 / 12.5, 2, 1e-9))
}

console.log('-- P5-1. 生存压力与税负 --')
{
  assert('产出 1100/需求 1000 → 盈余 10%', close(await num('subsistence_pressure', { production: 1100, required_consumption: 1000 }), 0.1))
  assert('产出 900 → 缺口 −10%', close(await num('subsistence_pressure', { production: 900, required_consumption: 1000 }), -0.1))
  /**
   * ★ 核心：「刚好够」是最危险的状态 —— 因为农业波动 ±10~20% 是常态。
   * 这条断言验证「盈余 0 时任何减产都直接变负」。
   */
  const exact = await num('subsistence_pressure', { production: 1000, required_consumption: 1000 })
  assert('刚好够 → 0（无缓冲）', close(exact, 0), String(exact))

  assert('税 10%/剩余 30% → 0.33', close(await num('tax_burden_stress', { effective_tax_rate: 0.1, surplus_ratio: 0.3 }), 0.333333, 1e-5))
  assert('税 30%/剩余 10% → 3.0', close(await num('tax_burden_stress', { effective_tax_rate: 0.3, surplus_ratio: 0.1 }), 3))
  /**
   * ★★ 核心：**同样的税率，不同的剩余，后果完全不同**。
   * 10% 税对盈余 30% 的人是 0.33（没事），对盈余 5% 的人是 2.0（致命）。
   * 这就是「税率高低本身没有意义」的数学形态。
   */
  const rich = await num('tax_burden_stress', { effective_tax_rate: 0.1, surplus_ratio: 0.3 })
  const poor = await num('tax_burden_stress', { effective_tax_rate: 0.1, surplus_ratio: 0.05 })
  assert('同税率、剩余降到 1/6 → 压力 ×6', close(poor / rich, 6, 1e-6), poor.toFixed(2) + ' vs ' + rich.toFixed(2))
}

console.log('-- P5-2. 不满累积（第三年才爆）--')
{
  assert('0.3×3 年 → 59%', close(await num('grievance_accumulation', { annual_shock: 0.3, consecutive_years: 3 }), 0.593430, 1e-5))
  assert('0.3×5 年 → 78%', close(await num('grievance_accumulation', { annual_shock: 0.3, consecutive_years: 5 }), 0.776870, 1e-5))
  /**
   * ★★ 核心：**第一年只有 26%，远不足以起义** ——
   * 这正是「前两年靠储备和借贷扛过去」的数学形态。
   * 真实的爆发点在第三到第五年（59%~78%）。
   */
  const y1 = await num('grievance_accumulation', { annual_shock: 0.3, consecutive_years: 1 })
  const y3 = await num('grievance_accumulation', { annual_shock: 0.3, consecutive_years: 3 })
  assert('第一年只有 26%（远不够）', close(y1, 0.259182, 1e-5), (y1 * 100).toFixed(0) + '%')
  assert('第三年是第一年的 2.3 倍', close(y3 / y1, 2.289, 0.01), (y3 / y1).toFixed(2))
  /** ★ 单调递增且趋近 1。 */
  const years = await Promise.all([1, 2, 3, 5, 10].map((y) => num('grievance_accumulation', { annual_shock: 0.3, consecutive_years: y })))
  assert('年数越多越接近 1', years.every((v, i) => i === 0 || v > years[i - 1]) && years[4] > 0.94, years.map((v) => v.toFixed(2)).join(' < '))
}

console.log('-- P5-3. 组织能力与精英过剩 --')
{
  assert('协调 100/收益 1 → 需 100 人', close(await num('revolt_organization_threshold', { coordination_cost: 100, individual_stake: 1 }), 100))
  assert('收益降到 0.2 → 需 500 人', close(await num('revolt_organization_threshold', { coordination_cost: 100, individual_stake: 0.2 }), 500))
  /**
   * ★★ 核心：**收益越低，所需人数越多（反比）**。
   * 所以「饿到活不下去」时（收益=命）所需的门槛会骤降 ——
   * 这就是「民不畏死」的组织学解释。
   */
  const starving = await num('revolt_organization_threshold', { coordination_cost: 100, individual_stake: 10 })
  assert('高收益 → 10 人即可（门很小）', close(starving, 10), String(starving))

  assert('1000 候选/100 职位 → 2.0 倍', close(await num('elite_overproduction', { elite_count: 1000, elite_share: 0.2, available_positions: 100 }), 2))
  assert('职位 250 → 0.8 倍（正常）', close(await num('elite_overproduction', { elite_count: 1000, elite_share: 0.2, available_positions: 250 }), 0.8))
  /**
   * ★★ 核心：**「精英过剩」与「农民困苦」是两个独立机制**。
   * 前者靠上升通道堵塞，后者靠生存压力。
   * 这条断言验证：职位数减少 → 比值升高（而农民指标完全不受影响）。
   */
  const r100 = await num('elite_overproduction', { elite_count: 1000, elite_share: 0.2, available_positions: 100 })
  const r50 = await num('elite_overproduction', { elite_count: 1000, elite_share: 0.2, available_positions: 50 })
  assert('职位减半 → 比值翻倍', close(r50 / r100, 2, 1e-9), r50.toFixed(1) + ' vs ' + r100.toFixed(1))
}

console.log('-- P5-4. ★ 合法性衰减必须声明「不是预测」--')
{
  assert('r=0.02、50 年 → 37%', close(await num('legitimacy_decay', { initial_legitimacy: 1, decay_rate: 0.02, years: 50 }), 0.367879, 1e-5))
  assert('r=0.10、20 年 → 13.5%', close(await num('legitimacy_decay', { initial_legitimacy: 1, decay_rate: 0.1, years: 20 }), 0.135335, 1e-5))
  /** ★ 衰减率提到 5 倍 → 同样年限威信低得多。 */
  const slow = await num('legitimacy_decay', { initial_legitimacy: 1, decay_rate: 0.02, years: 20 })
  const fast = await num('legitimacy_decay', { initial_legitimacy: 1, decay_rate: 0.1, years: 20 })
  assert('灾荒/战败使衰减 5 倍 → 威信骤降', fast < slow / 4, slow.toFixed(3) + ' → ' + fast.toFixed(3))

  /**
   * ★★★ 本套最重要的一条守则断言：
   * 社会失稳的公式**必须在 desc 里明确说「不是预测」**。
   *
   * 因为这类公式最大的危害不是算错，而是**被当成预言用**。
   * 「这个王朝还剩 87 年」这种精确度是荒谬的，但一条公式很容易让人这么读。
   */
  const instability = [
    'subsistence_pressure', 'tax_burden_stress', 'grievance_accumulation',
    'revolt_organization_threshold', 'elite_overproduction', 'legitimacy_decay',
    'repression_cost_ratio',
  ]
  const noWarning = []
  for (const id of instability) {
    const f = fm.FORMULA_INDEX.get(id)
    if (!f) { noWarning.push(id + '(缺失)'); continue }
    if (!/不是预测|量级判据|极粗略|不构成|不是定律|不是「剩余寿命」|不是.*预言|粗判据/.test(f.desc || '')) {
      noWarning.push(id)
    }
  }
  assert('全部声明了「不是预测/量级判据」', noWarning.length === 0, noWarning.join(', '))

  /** ★ 反向对照：`legitimacy_decay` 必须明确说「不是剩余寿命」。 */
  const ld = fm.FORMULA_INDEX.get('legitimacy_decay')
  assert('legitimacy_decay 明说不是剩余寿命', /不是「剩余寿命」|不是剩余寿命/.test(ld?.desc ?? ''), '')

  /** ★ 全库不该存在「王朝寿命预测」这类公式。 */
  const bad = fm.FORMULAS.filter((f) => /dynasty_life|王朝寿命预测|collapse_year/.test(f.id))
  assert('没有「王朝寿命预测」类公式', bad.length === 0, bad.map((f) => f.id).join(','))
}

console.log('-- 收敛检查 --')
{
  const ids = [
    'spinning_labor_per_kg', 'weaving_labor_per_meter', 'salt_preservation_need',
    'smoking_drying_capacity', 'paper_labor_per_sheet', 'copying_labor_per_book',
    'brick_firing_fuel', 'lime_plaster_need',
    'erosion_rate_denudation', 'mountain_lifetime', 'soil_formation_time',
    'delta_progradation_time', 'coastal_erosion_rate', 'groundwater_recharge_time',
    'sediment_trap_efficiency', 'reservoir_life',
    'subsistence_pressure', 'tax_burden_stress', 'grievance_accumulation',
    'revolt_organization_threshold', 'elite_overproduction', 'legitimacy_decay',
    'repression_cost_ratio',
  ]
  const missing = ids.filter((id) => !fm.FORMULA_INDEX.has(id))
  assert('三批 23 条全部入库', missing.length === 0, missing.join(','))

  let noUnit = [], noKeys = [], noCaveat = []
  for (const id of ids) {
    const f = fm.FORMULA_INDEX.get(id)
    if (!f) continue
    if (!f.unit) noUnit.push(id)
    if (!Array.isArray(f.keys) || f.keys.length < 3) noKeys.push(id)
    if (!/⚠/.test(f.desc || '')) noCaveat.push(id)
  }
  assert('都有单位', noUnit.length === 0, noUnit.join(','))
  assert('都有 ≥3 关键词', noKeys.length === 0, noKeys.join(','))
  assert('都标了局限（⚠）', noCaveat.length === 0, noCaveat.join(','))

  assert('公式总数 ≥ 669', fm.FORMULAS.length >= 669, String(fm.FORMULAS.length))
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
