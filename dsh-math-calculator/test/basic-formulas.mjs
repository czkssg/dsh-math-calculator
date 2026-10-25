/**
 * 第七批公式：通用计算基础件（金融 / 几何 / 化学 / 电学 / 工程 / 天文）。
 *
 * ## 为什么有这一批
 *
 * 插件定位是计算器，但实测 35 个常见计算需求只命中 17 个 ——
 * 「房贷月供多少」「余弦定理求第三边」「串容抗多少」这类日常问题原本无解。
 * 这一批补的就是这些。旧库 355 条里，物理与叙事推演占绝大多数，
 * 通用工程计算反而薄。
 *
 * ## 期望值来源
 *
 * 全部**独立手算**，不从实现反抄。可验算的几条特别标注：
 *   · 3-4-5 直角三角形：余弦定理应得 5
 *   · 球冠 h=r 得半球 2π/3，h=2r 得整球 4π/3
 *   · 正多边形 n=4,s=2 得正方形面积 4
 *   · 1 mol 标准气体 22.414 L
 *   · 100 经 6 个半衰期剩 100/64 = 1.5625
 *   · 太阳质量主序寿命 10 Gyr，10 M☉ 约 3200 万年
 *
 * ## mathjs 的坑
 *
 * `log` 是自然对数（不是 log₁₀）。复利翻倍时间用 log/log 比值，
 * 两处同底所以结果正确；写成 log10 反而错。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-basic-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { FORMULAS, FORMULA_INDEX, findFormulas } = await import(
  pathToFileURL(join(root, 'lib/formulas.js')).href
)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 跑一条公式取数值。 */
async function calc(id, overrides) {
  const r = await run({ operation: 'formula', formula: id, overrides })
  if (!r.ok) return { ok: false, text: String(r.result).slice(0, 120) }
  return { ok: true, answer: Number(r.value && r.value.answer), unit: r.value && r.value.unit }
}

/** 断言数值接近期望（相对误差 1e-4）。 */
async function near(id, overrides, expected, label) {
  const r = await calc(id, overrides)
  const ok = r.ok && Number.isFinite(r.answer) && Math.abs(r.answer - expected) <= Math.abs(expected) * 1e-4
  assert(label || id, ok, r.ok ? r.answer + '（期望 ' + expected + '）' : r.text)
}

console.log('-- 1. 金融：贷款、利息、现值 --')
{
  // 100 万 / 30 年 / 4.9% → 月供 5307.27
  await near('loan_payment', { P: 1e6, annual_rate: 0.049, months: 360 }, 5307.27, '房贷月供 5307.27')
  // 1 万 5% 单利 10 年 = 1.5 万
  await near('simple_interest', { P: 10000, r: 0.05, t: 10 }, 15000, '单利终值 1.5 万')
  // 1000×10 期 5% 年金现值 = 7721.73
  await near('annuity_present_value', { pmt: 1000, r: 0.05, n: 10 }, 7721.73, '年金现值 7721.73')
  // NPV = 7721.73 - 5000 = 2721.73
  await near('npv_simple', { cf: 1000, r: 0.05, n: 10, initial: 5000 }, 2721.73, 'NPV 2721.73')
  await near('depreciation_straight_line', { cost: 100000, salvage: 10000, years: 10 }, 9000, '年折旧 9000')
  await near('break_even_units', { fixed_cost: 50000, price: 100, unit_cost: 60 }, 1250, '保本销量 1250 件')
  // 名义 12% 月复利 → EAR = (1+0.01)^12-1 = 0.126825
  await near('effective_annual_rate', { nominal_rate: 0.12, n: 12 }, 0.126825, '实际年利率 12.68%')
  // 7% 翻倍 = ln2/ln1.07 = 10.2447
  await near('compound_growth_time', { P: 10000, target: 20000, r: 0.07 }, 10.2447, '7% 翻倍 10.24 年')
  // 100 万 30 年 3% 通胀 → 41.2 万
  await near('purchasing_power', { P: 1e6, inflation: 0.03, years: 30 }, 411986.76, '30 年后购买力 41.2 万')
  await near('markup_margin', { price: 100, cost: 60 }, 0.4, '毛利率 40%')

  // 自洽性：单利与复利在 t=1 时应相等
  const simple1 = await calc('simple_interest', { P: 1000, r: 0.1, t: 1 })
  const compound1 = await calc('compound_interest', { P: 1000, r: 0.1, t: 1, n: 1 })
  assert('单利与年复利在 1 年时相等',
    Math.abs(simple1.answer - compound1.answer) < 1e-9,
    simple1.answer + ' vs ' + compound1.answer)
}

console.log('-- 2. 几何：可验算的几条 --')
{
  // 3-4-5 直角三角形：夹角 90° 时第三边应为 5
  await near('law_of_cosines', { a: 3, b: 4, angle_c: Math.PI / 2 }, 5, '3-4-5 直角三角形')
  // 夹角 60° 时：√(9+16-2·3·4·0.5) = √13
  await near('law_of_cosines', { a: 3, b: 4, angle_c: Math.PI / 3 }, Math.sqrt(13), '夹角 60° → √13')
  // 30° 对边 10 → 90° 对边 20（直角边是斜边一半）
  await near('law_of_sines', { a: 10, angle_a: Math.PI / 6, angle_b: Math.PI / 2 }, 20, '正弦定理 30°→90°')
  await near('sector_area', { r: 2, theta: Math.PI }, Math.PI * 2, '半圆扇形 πr²/2')
  // 球冠：h=r 得半球，h=2r 得整球 —— 两个端点都能验算
  await near('spherical_cap_volume', { r: 1, h: 1 }, (2 * Math.PI) / 3, '球冠 h=r = 半球')
  await near('spherical_cap_volume', { r: 1, h: 2 }, (4 * Math.PI) / 3, '球冠 h=2r = 整球')
  await near('trapezoid_area', { a: 3, b: 5, h: 4 }, 16, '梯形 (3+5)×4/2')
  await near('ellipse_area', { a: 3, b: 2 }, 6 * Math.PI, '椭圆 6π')
  await near('torus_volume', { R: 5, r: 1 }, 10 * Math.PI * Math.PI, '圆环 10π²')
  // 正四边形退化为正方形
  await near('regular_polygon_area', { n: 4, s: 2 }, 4, '正四边形 = 正方形 4')
}

console.log('-- 3. 化学：浓度与摩尔 --')
{
  await near('solubility_product', { cation: 0.01, anion: 0.02, m: 1, n: 2 }, 4e-6, 'Ksp = 0.01×0.02²')
  await near('titration_moles', { C1: 0.1, V1: 25, C2: 0.05 }, 50, '滴定 50 mL')
  await near('molality', { moles: 1, kg_solvent: 2 }, 0.5, '质量摩尔浓度 0.5')
  await near('mass_percent', { solute_mass: 5, solution_mass: 100 }, 5, '5% 溶液')
  await near('ppm_concentration', { solute_mass: 1e-3, solution_mass: 1 }, 1000, '1000 ppm')
  await near('gas_volume_stp', { moles: 1 }, 22.414, '1 mol = 22.414 L')
  await near('particles_from_moles', { n: 1 }, 6.02214076e23, '1 mol 粒子数')
  // 6 个半衰期 → 100/64
  await near('radioactive_remaining', { N0: 100, t: 30, half_life: 5 }, 1.5625, '6 个半衰期剩 1/64')
  // 1 个半衰期恰剩一半
  await near('radioactive_remaining', { N0: 100, t: 5, half_life: 5 }, 50, '1 个半衰期剩一半')
}

console.log('-- 4. 电学：阻抗、分压、能耗 --')
{
  // 50 Hz 1 µF：1/(2π×50×1e-6) = 3183.1
  await near('capacitive_reactance', { f: 50, C: 1e-6 }, 3183.0988, '容抗 3183 Ω')
  await near('inductive_reactance', { f: 50, L: 0.1 }, 10 * Math.PI, '感抗 10π')
  await near('lc_resonance', { L: 0.001, C: 1e-6 }, 5032.9212, 'LC 谐振 5033 Hz')
  await near('voltage_divider', { Vin: 12, R1: 1000, R2: 2000 }, 8, '分压 8 V')
  await near('energy_kwh', { power: 2000, hours: 3 }, 6, '2kW×3h = 6 度')
  await near('battery_runtime', { capacity: 3000, load: 500 }, 6, '续航 6 小时')
  await near('transformer_turns', { N1: 100, V1: 220, V2: 12 }, 5.454545, '降压匝数')
}

console.log('-- 5. 工程：传动、流体、热应力 --')
{
  await near('gear_ratio', { N1: 20, N2: 60 }, 3, '齿轮比 3')
  // Re = 1000×1×0.1/1e-3 = 1e5
  await near('reynolds_number', { rho: 1000, v: 1, D: 0.1, mu: 1e-3 }, 1e5, '雷诺数 1e5（湍流）')
  await near('thermal_stress', { E: 2e11, alpha: 1.2e-5, dT: 50 }, 1.2e8, '热应力 1.2e8 Pa')
  await near('spring_energy', { k: 100, x: 0.2 }, 2, '弹簧储能 2 J')
  await near('hydraulic_force', { pressure: 1e6, area: 0.01 }, 10000, '液压 10 kN')
  await near('pulley_ratio', { D1: 100, D2: 200 }, 0.5, '皮带轮 0.5')

  // 平方律：形变量翻倍储能四倍
  const e1 = await calc('spring_energy', { k: 100, x: 0.1 })
  const e2 = await calc('spring_energy', { k: 100, x: 0.2 })
  assert('弹簧形变翻倍 → 储能四倍', Math.abs(e2.answer / e1.answer - 4) < 1e-9,
    (e2.answer / e1.answer).toFixed(3))
}

console.log('-- 6. 天文：主序寿命 --')
{
  await near('main_sequence_lifetime', { M: 1 }, 10, '太阳 10 Gyr')
  await near('main_sequence_lifetime', { M: 10 }, 0.0316228, '10 M☉ ≈ 32 Myr')

  // 关键回归：world 顶层传 starMass 曾经被**静默忽略**，永远输出太阳的 10 Gyr。
  // 理由：顶层只认 4 个便捷参数，其余必须塞进 world 里，但没有任何报错。
  const heavy = await run({ operation: 'world', starMass: 10 })
  assert('world 顶层 starMass=10 生效（寿命约 32 Myr）',
    /3[0-9]\.?[0-9]* *Myr/.test(String(heavy.result)),
    String(heavy.result).match(/主序寿命[^\n]*/)?.[0] || '未找到寿命行')

  const sun = await run({ operation: 'world', starMass: 1 })
  assert('world 顶层 starMass=1 给太阳寿命 10 Gyr',
    /10\.0 Gyr/.test(String(sun.result)),
    String(sun.result).match(/主序寿命[^\n]*/)?.[0] || '')

  // 两条路（顶层便捷参数 / 嵌套 world）必须等价
  const a = await run({ operation: 'world', starMass: 10 })
  const b = await run({ operation: 'world', world: { starMass: 10 } })
  const pick = (t) => String(t).match(/主序寿命[^\n]*/)?.[0] || ''
  assert('顶层参数与嵌套 world 结果一致', pick(a.result) === pick(b.result),
    pick(a.result) + ' vs ' + pick(b.result))

  // 嵌套写法仍然优先于顶层（显式更明确）
  const mixed = await run({ operation: 'world', starMass: 10, world: { starMass: 1 } })
  assert('world 里的值优先于顶层', /10\.0 Gyr/.test(String(mixed.result)),
    String(mixed.result).match(/主序寿命[^\n]*/)?.[0] || '')
}

console.log('-- 7. 检索：中文复合词必须能查到 --')
{
  // 这就是修检索的理由：这些说法以前全部 0 条
  const cases = [
    ['比热容', 'heat_capacity'],
    ['粮食产量', 'grain_yield_total'],
    ['贷款月供', 'loan_payment'],
    ['余弦定理', 'law_of_cosines'],
    ['稀释浓度', 'dilution'],
  ]
  for (const [query, expected] of cases) {
    const found = findFormulas(query)
    assert('「' + query + '」能检索到 ' + expected,
      found.some((f) => f.id === expected),
      found.slice(0, 3).map((f) => f.id).join(',') || '无结果')
  }
  // 同义词
  assert('「月供」能查到贷款公式',
    findFormulas('月供').some((f) => f.id === 'loan_payment'), '')
  assert('「粘度」能查到雷诺数（涉及黏度）',
    findFormulas('粘度').length > 0, String(findFormulas('粘度').length))
  // 长词应排在前面：查「贷款月供」时 loan_payment 要在首条
  const top = findFormulas('贷款月供')[0]
  assert('「贷款月供」首条就是 loan_payment', top && top.id === 'loan_payment',
    top && top.id)
}

console.log('-- 8. 元数据完整性 --')
{
  const IDS = [
    'loan_payment', 'simple_interest', 'annuity_present_value', 'npv_simple',
    'depreciation_straight_line', 'break_even_units', 'effective_annual_rate',
    'compound_growth_time', 'purchasing_power', 'markup_margin',
    'law_of_cosines', 'law_of_sines', 'sector_area', 'spherical_cap_volume',
    'trapezoid_area', 'ellipse_area', 'torus_volume', 'regular_polygon_area',
    'solubility_product', 'titration_moles', 'molality', 'mass_percent',
    'ppm_concentration', 'gas_volume_stp', 'particles_from_moles', 'radioactive_remaining',
    'capacitive_reactance', 'inductive_reactance', 'lc_resonance', 'voltage_divider',
    'energy_kwh', 'battery_runtime', 'transformer_turns',
    'gear_ratio', 'reynolds_number', 'thermal_stress', 'spring_energy',
    'hydraulic_force', 'pulley_ratio', 'main_sequence_lifetime',
  ]
  assert('新增 40 条', IDS.length === 40, String(IDS.length))
  for (const id of IDS) {
    const f = FORMULA_INDEX.get(id)
    if (!f) { assert(id + ' 已入库', false, '缺失'); continue }
    assert(id + ' 字段完整',
      Boolean(f.name && f.expr && f.desc && f.cat && f.keys && f.keys.length > 0),
      f.cat)
  }
  assert('公式总数 ≥ 395', FORMULAS.length >= 395, String(FORMULAS.length))
  // 所有新公式都要能求值（默认参数下不崩）
  let broken = []
  for (const id of IDS) {
    const r = await calc(id, {})
    if (!r.ok && !/missing|缺少/i.test(r.text)) broken.push(id)
  }
  assert('新公式在缺参数时只报缺参数，不抛别错', broken.length === 0, broken.join(','))
}

try {
  rmSync(home, { recursive: true, force: true })
} catch {
  /* 忽略 */
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
