/**
 * 读者视角高频公式·第二批：建筑、攻城、农业、医药。
 *
 * 每个数都要能对上常识：20 m 水头≈2 atm、10 公顷×4 吨/公顷=40 吨、
 * 500 人×1.5 kg/日 吃 10 吨粮=13.3 天、0.5 mg/kg×70kg=35 mg。
 */
import * as mod from '../lib/index.js'
import { FORMULAS, formulaFrequency } from '../lib/formulas.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass++
    console.log('  ok   ' + name + (detail ? ': ' + detail : ''))
  } else {
    fails.push({ name, detail })
    console.log('  FAIL ' + name + '\n         ' + (detail ?? ''))
  }
}
const call = (id, overrides) => mod.runMathTool({ operation: 'formula', formula: id, overrides })
const value = (result) => String(result.value && result.value.answer !== undefined ? result.value.answer : result.result)

console.log('-- 1. 规模与分组 --')
{
  assert('公式总数 ≥ 340', FORMULAS.length >= 340, String(FORMULAS.length))
  const cats = new Set(FORMULAS.map((f) => f.cat))
  for (const cat of ['perception/architecture', 'military/combat', 'perception/agriculture', 'biology/physiology']) {
    assert('含分类 ' + cat, cats.has(cat))
  }
  const story2 = FORMULAS.filter((f) => ['brick_count', 'trebuchet_range_estimate', 'crop_total_yield', 'drug_dose_by_weight'].includes(f.id))
  assert('四个代表公式都在', story2.length === 4)
  assert('每条都有频次', story2.every((f) => ['high', 'medium', 'low'].includes(formulaFrequency(f))))
}

console.log('-- 2. 建筑尺度 --')
{
  const pressure = call('water_tower_pressure', { h: 20 })
  assert('20 m 水头 ≈ 196133 Pa', value(pressure).includes('196133') || value(pressure).includes('1.96'), value(pressure).slice(0, 30))

  const bricks = call('brick_count', { area: 10, thickness: 0.24 })
  assert('10m²×0.24m 墙 ≈ 1887 块', String(bricks.value.answer).includes('1886') || String(bricks.value.answer).includes('1887'), String(bricks.value.answer).slice(0, 20))

  const heat = call('window_heat_loss', { U: 5.8, A: 2, dT: 20 })
  assert('窗热损 = 232 W', String(heat.value.answer).includes('232'), String(heat.value.answer).slice(0, 20))

  const draft = call('chimney_draft', { h: 10, T_out: 273.15, T_in: 373.15 })
  assert('烟囱抽力 > 0', Number(draft.value.answer) > 0, String(draft.value.answer).slice(0, 12))
}

console.log('-- 3. 攻城与军事 --')
{
  const momentum = call('ram_momentum', { m: 1000, v: 3 })
  assert('撞锤动量 = 3000 N·s', String(momentum.value.answer).includes('3000'), String(momentum.value.answer).slice(0, 20))

  const treb = call('trebuchet_range_estimate', { eff: 0.5, E: 1e5, m: 10 })
  assert('投石机射程 ≈ 1019 m', String(treb.value.answer).includes('1019'), String(treb.value.answer).slice(0, 20))

  const supply = call('army_supply_days', { stores: 10000, troops: 500, daily_ration: 1.5 })
  assert('10 吨粮撑 13.3 天', String(supply.value.answer).includes('13.3'), String(supply.value.answer).slice(0, 20))

  const march = call('march_days', { distance: 100, speed: 4, hours_per_day: 8 })
  assert('100 km 行军 3.125 天', String(march.value.answer).includes('3.125'), String(march.value.answer).slice(0, 20))

  const front = call('formation_frontage', { troops: 900, spacing: 1.2, ranks: 3 })
  assert('900 人三排正面 360 m', String(front.value.answer).includes('360'), String(front.value.answer).slice(0, 20))
}

console.log('-- 4. 农业产量 --')
{
  const yieldTotal = call('crop_total_yield', { area_ha: 10, yield_per_ha: 4000 })
  assert('10 公顷 × 4 吨 = 40000 kg', String(yieldTotal.value.answer).includes('40000'), String(yieldTotal.value.answer).slice(0, 20))

  const energy = call('food_energy_supply', { mass_kg: 1, kcal_per_kg: 3500 })
  assert('1 kg 谷物 = 1.4644e7 J', String(energy.value.answer).includes('14644000'), String(energy.value.answer).slice(0, 20))

  const fed = call('population_fed', { food_kcal: 1000000 })
  assert('100 万 kcal = 400 人·日', String(fed.value.answer).includes('400'), String(fed.value.answer).slice(0, 20))

  const water = call('irrigation_volume', { area_m2: 1000, depth_mm: 10 })
  assert('1000m² × 10mm = 10 m³', String(water.value.answer).includes('10'), String(water.value.answer).slice(0, 20))

  const feed = call('livestock_feed_need', { heads: 50, daily_feed_kg: 12, days: 180 })
  assert('50 头 × 12kg × 180 天 = 108000 kg', String(feed.value.answer).includes('108000'), String(feed.value.answer).slice(0, 20))
}

console.log('-- 5. 疾病与药物 --')
{
  const dose = call('drug_dose_by_weight', { dose_per_kg: 0.5, weight: 70 })
  assert('0.5 mg/kg × 70kg = 35 mg', String(dose.value.answer).includes('35'), String(dose.value.answer).slice(0, 20))

  const blood = call('blood_volume_estimate', { weight: 70 })
  assert('70kg 血量 ≈ 4900 ml', String(blood.value.answer).includes('4900'), String(blood.value.answer).slice(0, 20))

  const deficit = call('fluid_deficit', { weight: 70, deficit_percent: 5 })
  assert('5% 脱水 ≈ 3500 ml', String(deficit.value.answer).includes('3500'), String(deficit.value.answer).slice(0, 20))

  const hr = call('max_heart_rate', { age: 40 })
  assert('40 岁最大心率 180', String(hr.value.answer).includes('180'), String(hr.value.answer).slice(0, 20))

  const preg = call('pregnancy_days_remaining', { days_since_lmp: 200 })
  assert('孕 200 天还剩 80 天', String(preg.value.answer).includes('80'), String(preg.value.answer).slice(0, 20))

  const infusion = call('infusion_rate', { volume_ml: 1000, hours: 8 })
  assert('1000ml / 8h = 125 ml/h', String(infusion.value.answer).includes('125'), String(infusion.value.answer).slice(0, 20))
}

console.log('-- 6. 可解释性 --')
{
  const ids = ['floor_area_ratio', 'brick_count', 'roof_load', 'stair_comfort_rule', 'chimney_draft', 'ram_momentum', 'crop_total_yield', 'seed_rate', 'pasture_carrying_capacity', 'drug_dose_by_weight', 'clark_child_dose', 'blood_volume_estimate', 'pregnancy_days_remaining', 'fever_energy_cost']
  const missing = ids.filter((id) => !FORMULAS.some((f) => f.id === id))
  assert('全部 id 都存在', missing.length === 0, missing.join(', '))
  const bad = ids
    .map((id) => FORMULAS.find((f) => f.id === id))
    .filter((f) => !f || !f.desc || f.desc.length < 8 || Object.values(f.params).some((p) => !p.desc || p.desc.length < 2))
  assert('全部有说明与参数描述', bad.length === 0, bad.map((f) => f && f.id).join(', '))
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
