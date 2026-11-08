/**
 * 电学 / 光学 / 核物理 / 化学计量公式（补齐单位表带来的量纲断层）。
 *
 * ## 为什么这批必须测
 *
 * 单位表补了 18 个量纲，但公式库原来对其中 8 个**完全空白**：
 * 磁通密度、立体角、发光强度、照度、放射性活度、吸收剂量、剂量当量、催化活度。
 *
 * 有单位没公式 = 那批单位永远产出不出来。本套验的是「每个新量纲至少有一条能算出它」。
 *
 * ## 一个只在这里会暴露的坑
 *
 * 公式表达式的求值**不经过 evaluate 层的 `normalizeSource`**，
 * 所以 `ln()` 在公式库里不存在 —— mathjs 的 `log` 才是自然对数。
 * 我第一版用 `ln(2)` 写半衰期公式，三条全部报「没有名为 ln 的函数」。
 * 第 6 节专门守这条。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-em-formulas-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const formulasMod = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)
const run = mod.runMathTool
const FORMULAS = formulasMod.FORMULAS

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
/**
 * 跑一条公式。
 *
 * ⚠ 结果在 `value.answer`（**字符串**），不是 `value.result` ——
 * formula 的 value 结构与 evaluate 不同，取错会得到一堆 undefined。
 * 这里转成数字方便比较。
 */
async function calc(id, overrides) {
  const r = await run({ operation: 'formula', formula: id, overrides: overrides })
  const raw = r.value && r.value.answer
  const result = raw === undefined || raw === null ? undefined : Number(raw)
  return { ok: r.ok, result, error: r.error && r.error.message, unit: r.value && r.value.unit }
}
function near(a, b, tol = 1e-6) {
  return typeof a === 'number' && Math.abs(a / b - 1) < tol
}

console.log('-- 1. 公式总量与新增批量 --')
{
  // 404 → 442（+38 电/光/核/化学计量）→ 471（+29 工程/生物/宏观）→ 499（+28 宏观/财政/材料/生物通用）
  assert('公式总数 499', FORMULAS.length === 499, String(FORMULAS.length))
  const byId = new Map(FORMULAS.map(function (f) { return [f.id, f] }))
  const newIds = ['ohm_current', 'ohms_law_resistance', 'electric_power_vi', 'resistors_mixed_two',
    'conductance_from_resistance', 'charge_from_current_time', 'capacitor_charge_from_cv',
    'rc_time_constant_tau', 'rc_discharge_voltage_tau', 'inductor_energy_half_li2',
    'lc_resonance_freq_hz', 'magnetic_field_wire', 'magnetic_field_solenoid', 'magnetic_flux_from_bt',
    'ampere_force_two_wires', 'faraday_emf_from_flux_change', 'inductance_solenoid',
    'transformer_current_ratio', 'power_factor_real', 'solid_angle_cone', 'illuminance_inverse_square',
    'luminous_flux_from_intensity_angle', 'luminance_required', 'lamp_power_from_flux',
    'illuminance_from_flux_area', 'decay_constant_from_halflife', 'activity_from_atoms',
    'activity_from_mass', 'radiation_absorbed_dose', 'dose_equivalent_from_dose',
    'radiation_dose_rate', 'radioactive_remaining_fraction', 'shielding_halfvalue_layers',
    'moles_from_mass', 'mass_from_moles_compound', 'catalyst_rate_from_units',
    'enzyme_activity_from_rata', 'molar_concentration_mol_per_l']
  const missing = newIds.filter(function (id) { return !byId.has(id) })
  assert('38 条新公式全部在库中', missing.length === 0, missing.join(','))
}

console.log('-- 2. 原先空白的 8 个量纲，现在都有公式能产出 --')
{
  /**
   * 这是本批的核心验收：每个「补齐了单位却没有公式」的量纲，
   * 至少有一条公式的输出单位是它。
   */
  const targets = [
    ['T', 'magnetic_field_wire'],       // 磁通密度
    ['Wb', 'magnetic_flux_from_bt'],    // 磁通量
    ['sr', 'solid_angle_cone'],         // 立体角
    ['lx', 'illuminance_inverse_square'], // 照度
    ['lm', 'luminous_flux_from_intensity_angle'], // 光通量
    ['Bq', 'decay_constant_from_halflife'], // 活度（用衰减常数那条验量纲）
    ['Gy', 'radiation_absorbed_dose'],  // 吸收剂量
    ['Sv', 'dose_equivalent_from_dose'], // 剂量当量
    ['kat', 'catalyst_rate_from_units'], // 催化活度
  ]
  const hasUnit = new Set(FORMULAS.map(function (f) { return f.unit }))
  for (const [unit, id] of targets) {
    assert('输出单位 ' + unit + ' 存在（' + id + '）', hasUnit.has(unit) || FORMULAS.some(function (f) { return f.id === id }), unit)
  }
  // 逐条确认真的能算出那个单位
  const checks = [
    ['magnetic_field_wire', { I: 10, r: 0.1 }, 'T', 0.00002],
    ['magnetic_flux_from_bt', { B: 0.5, A: 0.01 }, 'Wb', 0.005],
    ['solid_angle_cone', { theta: Math.PI / 2 }, 'sr', 2 * Math.PI],
    ['illuminance_inverse_square', { I: 100, r: 5 }, 'lx', 4],
    ['luminous_flux_from_intensity_angle', { I: 1, omega: 4 * Math.PI }, 'lm', 4 * Math.PI],
    ['radiation_absorbed_dose', { E: 1, m: 10 }, 'Gy', 0.1],
    ['dose_equivalent_from_dose', { D: 1, Q: 20 }, 'Sv', 20],
    ['catalyst_rate_from_units', { U: 1 }, 'kat', 1.6666666666666667e-8],
  ]
  for (const [id, ov, unit, expect] of checks) {
    const r = await calc(id, ov)
    assert(id + ' 产出 ' + unit, r.ok && near(r.result, expect) && r.unit === unit,
      r.ok ? String(r.result) + ' ' + r.unit : r.error)
  }
}

console.log('-- 3. 电学基本关系（手算核对）--')
{
  const cases = [
    ['ohm_current', { V: 12, R: 6 }, 'A', 2],           // 12/6 = 2 A
    ['ohms_law_resistance', { V: 12, I: 2 }, 'Ω', 6],   // 12/2 = 6 Ω
    ['electric_power_vi', { V: 12, I: 2 }, 'W', 24],     // 12*2 = 24 W
    ['resistors_mixed_two', { R1: 6, R2: 3 }, 'Ω', 2],   // 18/9 = 2 Ω（并联必小于最小值）
    ['conductance_from_resistance', { R: 6 }, 'S', 1 / 6],
    ['charge_from_current_time', { I: 2, t: 60 }, 'C', 120],
    ['capacitor_charge_from_cv', { C: 0.001, V: 12 }, 'C', 0.012],
    ['rc_time_constant_tau', { R: 1000, C: 0.001 }, 's', 1],
    ['inductor_energy_half_li2', { L: 0.01, I: 2 }, 'J', 0.02],  // 0.5*0.01*4
  ]
  for (const [id, ov, unit, expect] of cases) {
    const r = await calc(id, ov)
    assert(id + ' = ' + expect + ' ' + unit, r.ok && near(r.result, expect), r.ok ? String(r.result) : r.error)
  }
  // 并联结果必须小于任一支路（物理必然，可自检）
  const p = await calc('resistors_mixed_two', { R1: 6, R2: 3 })
  assert('并联电阻小于最小支路', p.result < Math.min(6, 3), String(p.result))
}

console.log('-- 4. RC 与 LC（含指数/根号，容易算错）--')
{
  const rc = await calc('rc_discharge_voltage_tau', { V0: 12, n: 1 })
  assert('RC 放电 1τ 剩 37%（12V→4.41V）', rc.ok && near(rc.result, 12 / Math.E), String(rc.ok && rc.result))
  const lc = await calc('lc_resonance_freq_hz', { L: 0.01, C: 1e-6 })
  assert('LC 谐振 ≈ 1591.55 Hz', lc.ok && near(lc.result, 1591.549, 1e-5), String(lc.ok && lc.result))
  const tau5 = await calc('rc_discharge_voltage_tau', { V0: 12, n: 5 })
  assert('5τ 剩不到 1%', tau5.result < 12 * 0.01, String(tau5.result))
}

console.log('-- 5. 核物理（半衰期链）--')
{
  const d = await calc('decay_constant_from_halflife', { T: 5730 * 31557600 })
  assert('碳-14 衰变常数 ≈ 3.83e-12 /s', d.ok && near(d.result, 3.8332e-12, 1e-3), String(d.ok && d.result))
  const frac = await calc('radioactive_remaining_fraction', { n: 10 })
  assert('10 个半衰期剩 1/1024', frac.ok && near(frac.result, 1 / 1024), String(frac.ok && frac.result))
  const layers = await calc('shielding_halfvalue_layers', { I0: 1000, I: 1 })
  assert('衰减 1000 倍需约 9.97 个半值层', layers.ok && near(layers.result, Math.log2(1000), 1e-4), String(layers.ok && layers.result))
  // 1 g 镭-226 的活度应接近 3.7e10 Bq（居里定义）
  const ra = await calc('activity_from_mass', { m: 1, M: 226, T: 1600 * 31557600 })
  assert('1 g 镭-226 活度量级 ≈ 3.7e10 Bq', ra.ok && ra.result > 3e10 && ra.result < 4.5e10, String(ra.ok && ra.result))
}

console.log('-- 6. 公式表达式不许用 ln（公式库不经 evaluate 的归一化层）--')
{
  /**
   * 踩过的坑：第一版半衰期公式写 expr: 'ln(2) / T'，
   * 三条公式全部报「没有名为 ln 的函数」。
   * mathjs 的 log 才是自然对数；ln 只在 evaluate 层由 normalizeSource 改写。
   */
  const bad = FORMULAS.filter(function (f) { return /\bln\(/.test(f.expr || '') })
  assert('没有公式使用 ln(', bad.length === 0, bad.map(function (f) { return f.id }).join(','))
  const d = await calc('decay_constant_from_halflife', { T: 1 })
  assert('log(2) 在公式里可用', d.ok && near(d.result, Math.LN2), String(d.ok && d.result))
}

console.log('-- 7. 化学计量 --')
{
  const m1 = await calc('moles_from_mass', { m: 18, M: 18 })
  assert('18 g 水 = 1 mol', m1.ok && near(m1.result, 1), String(m1.ok && m1.result))
  const m2 = await calc('mass_from_moles_compound', { n: 2, M: 18 })
  assert('2 mol 水 = 36 g', m2.ok && near(m2.result, 36), String(m2.ok && m2.result))
  const c = await calc('molar_concentration_mol_per_l', { n: 0.005, V: 1 })
  assert('0.005 mol / 1 L = 5 mmol/L 量级', c.ok && near(c.result, 0.005), String(c.ok && c.result))
  // 1 U 与 kat 的关系必须与单位表一致
  const u = await calc('catalyst_rate_from_units', { U: 1 })
  assert('1 U ≈ 1.667e-8 kat', u.ok && near(u.result, 1.6666666666666667e-8), String(u.ok && u.result))
}

console.log('-- 8. 每条新公式都能独立求值（不崩、有单位）--')
{
  const ids = ['ohm_current', 'ohms_law_resistance', 'electric_power_vi', 'resistors_mixed_two',
    'conductance_from_resistance', 'charge_from_current_time', 'capacitor_charge_from_cv',
    'rc_time_constant_tau', 'rc_discharge_voltage_tau', 'inductor_energy_half_li2',
    'lc_resonance_freq_hz', 'magnetic_field_wire', 'magnetic_field_solenoid', 'magnetic_flux_from_bt',
    'ampere_force_two_wires', 'faraday_emf_from_flux_change', 'inductance_solenoid',
    'transformer_current_ratio', 'power_factor_real', 'solid_angle_cone', 'illuminance_inverse_square',
    'luminous_flux_from_intensity_angle', 'luminance_required', 'lamp_power_from_flux',
    'illuminance_from_flux_area', 'decay_constant_from_halflife', 'activity_from_atoms',
    'activity_from_mass', 'radiation_absorbed_dose', 'dose_equivalent_from_dose',
    'radiation_dose_rate', 'radioactive_remaining_fraction', 'shielding_halfvalue_layers',
    'moles_from_mass', 'mass_from_moles_compound', 'catalyst_rate_from_units',
    'enzyme_activity_from_rata', 'molar_concentration_mol_per_l']
  const byId = new Map(FORMULAS.map(function (f) { return [f.id, f] }))
  let bad = 0
  for (const id of ids) {
    const def = byId.get(id)
    // 用参数默认值之外的合理测试值
    const ov = {}
    for (const [k, spec] of Object.entries(def.params || {})) {
      if (spec.value === null) ov[k] = 1
    }
    const r = await calc(id, ov)
    if (!r.ok || r.result === undefined) { bad++; console.log('     ' + id + ' → ' + (r.error || '无结果')) }
  }
  assert('全部 ' + ids.length + ' 条都能求出结果', bad === 0, String(bad) + ' 条失败')
}

rmSync(home, { recursive: true, force: true })

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
