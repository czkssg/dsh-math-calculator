/**
 * 公式库第六批：势力运行与文明动力学（`formula-library-power.ts`）。
 *
 * ## 期望值来源
 *
 * 全部**独立手算**，不从实现抄：
 *   EROI = 100/5 = 20
 *   EROI 净剩余 = 100 × (1 − 1/20) = 95 J
 *   卡尔达肖夫：地球 1.8e13 W → (log10(1.8e13) − 6)/10 = 0.7255
 *   粮食总产 = 1000 公顷 × 3000 kg × 0.9 = 2.7e6 kg
 *   供养人口 = 2.7e6 × 3500 kcal / (2200 × 365) = 11768 人
 *   所需耕地 = 1e6 × 2200 × 365 / (3000 × 3500 × 0.9) ≈ 8.497e4 公顷
 *   财政收入 = 1e6 × 3000 × 0.1 = 3e8
 *   军饷 = 1e4 × 1500 = 1.5e7
 *   军费占比 = 120/100 = 1.2
 *   扩散曲线 t = t_mid 时恰为 0.5
 *   扩散半衰期 rate=0.5 → ln(99)/0.5 ≈ 9.19 年
 *   信息耗时 = 1000 km / 200 km/天 = 5 天
 *   统治半径 = 200 × 20 / 2 = 2000 km
 *
 * ## 为什么这两条要特别小心
 *
 * `kardashev_scale` 与 `diffusion_half_life` 第一版写错了：
 *   · kardashev 写成 `log10(power/1e16)/0.9044+0.1`，算地球给 1.47（应 0.73）；
 *   · diffusion_half_life 用了 `ln()`，但 mathjs 的自然对数是 `log()`，
 *     `ln` 不存在 → 算出 undefined，且**不报错**。
 * 这就是「公式能求值 ≠ 公式算得对」，所以本套测试用独立期望值钉住数值。
 */
import { FORMULAS, FORMULA_INDEX } from '../lib/formulas.js'
import { runMathTool } from '../lib/index.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 跑一条公式，取数值结果。 */
async function calc(id, overrides) {
  const result = await runMathTool({ operation: 'formula', formula: id, overrides })
  if (!result.ok) return { ok: false, error: result.result }
  const answer = result.value && result.value.answer
  return { ok: true, answer: Number(answer), unit: result.value.unit }
}

/** 断言数值接近期望。 */
async function near(id, overrides, expected, label, tol = 1e-6) {
  const r = await calc(id, overrides)
  assert(
    label,
    r.ok && Number.isFinite(r.answer) && Math.abs(r.answer - expected) <= Math.abs(expected) * tol,
    r.ok ? String(r.answer) + '（期望 ' + expected + '）' : String(r.error).slice(0, 120),
  )
  return r
}

console.log('-- 1. 能源：EROI 与卡尔达肖夫 --')
{
  await near('eroi', { energy_out: 100, energy_invested: 5 }, 20, 'EROI = 100/5 = 20')
  await near('eroi_surplus', { energy_out: 100, eroi: 20 }, 95, '净剩余 = 100×(1−1/20) = 95 J')
  // EROI = 1 时剩余必须是 0（再多能源也养不活非生产人口）
  await near('eroi_surplus', { energy_out: 100, eroi: 1 }, 0, 'EROI=1 时净剩余为 0')
  // 地球 1.8e13 W → 0.7255
  await near('kardashev_scale', { power: 1.8e13 }, 0.7255272505, '卡尔达肖夫：地球 = 0.726')
  // II 型：整颗恒星 3.8e26 W → 2.058（(26.58−6)/10）
  const k2 = await calc('kardashev_scale', { power: 3.8e26 })
  assert('卡尔达肖夫：恒星级 ≈ 2.06', k2.ok && Math.abs(k2.answer - 2.058) < 0.01, k2.ok ? String(k2.answer) : '')
}

console.log('-- 2. 粮食：产量、供养人口、所需耕地 --')
{
  await near('grain_yield_total', { area_hectare: 1000, kg_per_hectare: 3000 }, 2.7e6,
    '粮食总产 = 1000×3000×0.9 = 2.7e6 kg')
  await near('population_fed_by_grain', { grain_kg: 2.7e6 }, 11768.3686177,
    '供养人口 = 2.7e6×3500/(2200×365) = 11768 人')
  await near('arable_land_needed', { population: 1e6 }, 84973.5449735,
    '百万人口需耕地 ≈ 8.497e4 公顷')
  // 反向自洽：先算所需耕地，再用它算粮食，应恰好供养该人口
  const land = await calc('arable_land_needed', { population: 1e6 })
  const grain = await calc('grain_yield_total', { area_hectare: land.answer, kg_per_hectare: 3000 })
  const fed = await calc('population_fed_by_grain', { grain_kg: grain.answer })
  assert('耕地 → 粮食 → 人口 往返自洽（100 万）',
    Math.abs(fed.answer - 1e6) < 1, fed.answer && fed.answer.toFixed(2))
}

console.log('-- 3. 财政：收入、军饷、负担比 --')
{
  await near('fiscal_revenue', { population: 1e6, output_per_capita: 3000, tax_rate: 0.1 }, 3e8,
    '财政收入 = 1e6×3000×0.1 = 3e8')
  await near('army_pay_cost', { soldiers: 1e4, pay_per_soldier_year: 1500 }, 1.5e7,
    '军饷 = 1e4×1500 = 1.5e7')
  await near('fiscal_burden_ratio', { army_cost: 120, revenue: 100 }, 1.2, '负担比 = 120/100 = 1.2')
  // 2 万兵 vs 3e8 财政：军费 3e7，占比 0.1 —— 撑得住
  const pay = await calc('army_pay_cost', { soldiers: 2e4 })
  const rev = await calc('fiscal_revenue', { population: 1e6 })
  const burden = await calc('fiscal_burden_ratio', { army_cost: pay.answer, revenue: rev.answer })
  assert('2 万兵/百万人口 → 负担比 0.1（撑得住）',
    Math.abs(burden.answer - 0.1) < 1e-9, String(burden.answer))
}

console.log('-- 4. 扩散：S 曲线与半衰期 --')
{
  // t = t_mid 时渗透率恰为 0.5（S 曲线的定义性质）
  await near('diffusion_s_curve', { t: 8, t_mid: 8, rate: 0.5 }, 0.5, 't=t_mid 时渗透率 = 0.5')
  const early = await calc('diffusion_s_curve', { t: 0, t_mid: 8, rate: 0.5 })
  assert('t=0 时渗透率很低（<0.05）', early.ok && early.answer < 0.05, early.ok ? String(early.answer) : '')
  const late = await calc('diffusion_s_curve', { t: 30, t_mid: 8, rate: 0.5 })
  assert('t=30 时接近饱和（>0.99）', late.ok && late.answer > 0.99, late.ok ? String(late.answer) : '')
  // 半衰期 = ln(99)/rate
  await near('diffusion_half_life', { rate: 0.5 }, 9.1902397, 'rate=0.5 → 半衰期 9.19 年')
  await near('diffusion_half_life', { rate: 0.1 }, 45.9511985, 'rate=0.1 → 半衰期 45.95 年')
  // 关键回归：曾经用 ln() 导致 undefined 且不报错
  const half = await calc('diffusion_half_life', { rate: 0.5 })
  assert('半衰期不是 undefined/NaN（ln 写成 log 的回归）',
    half.ok && Number.isFinite(half.answer), half.ok ? String(half.answer) : '')
}

console.log('-- 5. 信息：传递耗时与统治半径 --')
{
  await near('info_delivery_time', { distance: 1000, speed_km_per_day: 200 }, 5,
    '1000 km / 200 km·天⁻¹ = 5 天')
  await near('admin_radius_from_info', { speed_km_per_day: 200, max_days: 20 }, 2000,
    '统治半径 = 200×20/2 = 2000 km')
  // 骑马帝国按 400 km/天、30 天 → 6000 km
  await near('admin_radius_from_info', { speed_km_per_day: 400, max_days: 30 }, 6000,
    '快马 30 天 → 6000 km')
  // 步行 40 km/天、20 天 → 400 km（这解释了古代小国林立）
  await near('admin_radius_from_info', { speed_km_per_day: 40, max_days: 20 }, 400,
    '步行 → 仅 400 km')
}

console.log('-- 6. 元数据完整性 --')
{
  const ids = [
    'eroi', 'eroi_surplus', 'kardashev_scale',
    'grain_yield_total', 'population_fed_by_grain', 'arable_land_needed',
    'fiscal_revenue', 'army_pay_cost', 'fiscal_burden_ratio',
    'diffusion_s_curve', 'diffusion_half_life',
    'info_delivery_time', 'admin_radius_from_info',
  ]
  for (const id of ids) {
    const f = FORMULA_INDEX.get(id)
    assert('公式 ' + id + ' 已入库', Boolean(f), '')
    if (!f) continue
    assert(id + ' 有中文名', typeof f.name === 'string' && f.name.length > 0, f.name)
    assert(id + ' 有表达式', typeof f.expr === 'string' && f.expr.length > 0, f.expr)
    assert(id + ' 有说明', typeof f.desc === 'string' && f.desc.length > 10, '')
    assert(id + ' 有分类', typeof f.cat === 'string' && f.cat.startsWith('power/'), f.cat)
    assert(id + ' 有检索词', Array.isArray(f.keys) && f.keys.length > 0, (f.keys || []).join(','))
  }
  assert('公式总数从 342 增加', FORMULAS.length >= 355, String(FORMULAS.length))
}

console.log('-- 7. 公式不能算出 undefined/NaN（全量扫一遍）--')
{
  // 曾经 diffusion_half_life 用 ln() → undefined 且不报错。
  // 这里对第六批全部公式用合理参数跑一遍，确认都给得出有限数。
  const probes = {
    eroi: { energy_out: 100, energy_invested: 5 },
    eroi_surplus: { energy_out: 100, eroi: 20 },
    kardashev_scale: { power: 1.8e13 },
    grain_yield_total: { area_hectare: 1000 },
    population_fed_by_grain: { grain_kg: 2.7e6 },
    arable_land_needed: { population: 1e6 },
    fiscal_revenue: { population: 1e6 },
    army_pay_cost: { soldiers: 1e4 },
    fiscal_burden_ratio: { army_cost: 1.2e7, revenue: 3e8 },
    diffusion_s_curve: { t: 8, t_mid: 8 },
    diffusion_half_life: { rate: 0.5 },
    info_delivery_time: { distance: 1000 },
    admin_radius_from_info: {},
  }
  for (const [id, overrides] of Object.entries(probes)) {
    const r = await calc(id, overrides)
    assert(id + ' 用默认参数能算出有限数',
      r.ok && Number.isFinite(r.answer), r.ok ? String(r.answer) : String(r.error).slice(0, 100))
  }
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
