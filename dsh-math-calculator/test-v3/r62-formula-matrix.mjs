/**
 * R62 公式矩阵：存在性（抽样）+ 带单位调用 + 量纲数据一致性。
 *
 * 官方公式套件只测「结构/可解析」；这里补三件：每条 id 可查询、真实单位能调用、
 * desc 里写的单位与 dimension 标注一致（R56 五连错、R58 三十三条错标的守护）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-r62f-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
const formulas = JSON.parse(readFileSync(join(root, 'src/data/formulas.json'), 'utf8'))

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 结构 --')
{
  assert('公式库 ≥ 800 条', formulas.length >= 800, String(formulas.length))
  const ids = formulas.map((f) => f.id)
  assert('id 唯一', new Set(ids).size === ids.length, String(ids.length - new Set(ids).size))
  const badKeys = formulas.filter((f) => !Array.isArray(f.keys) || f.keys.length === 0 || !f.unit)
  assert('每条有 keys 与 unit', badKeys.length === 0, badKeys.slice(0, 3).map((f) => f.id).join(','))
}

console.log('-- 2. 存在性（均匀抽样 40 条）--')
{
  const step = Math.max(1, Math.ceil(formulas.length / 40))
  const sample = formulas.filter((_, index) => index % step === 0).slice(0, 40)
  for (const entry of sample) {
    const r = await run({ operation: 'formula', formula: entry.id })
    assert(entry.id + ' 可查询（不报 unknown_formula）', r.error?.type !== 'unknown_formula', JSON.stringify(r.error?.type))
  }
}

console.log('-- 3. 带单位调用（真实单位，不是裸数）--')
{
  const cases = [
    ['beam_section_modulus', { b: '0.1 m', h: '0.15 m' }, '0.000375 m³'],
    ['kiln_firing_time', { delta_T: '1080 K', heating_rate: '150 K/h' }, '7.2 h'],
    ['reactor_residence_time', { volume: '10 m^3', volumetric_flow: '5 m^3/h' }, '2 h'],
    ['oxygen_depletion', { V: '30 m^3', n: 2, consumption: '0.3 m^3/min' }, '10.5 min'],
    ['gear_geometry', { gear_module: '2 mm', teeth: 20 }, '40 mm'],
    ['admin_radius_from_info', { speed_km_per_day: '20 km/day', max_days: '10 天' }, '100 km'],
    ['kiln_heat_balance', { ware_mass: '100 kg', ware_specific_heat: '1000 J/(kg*K)', delta_T: '1080 K', shell_loss_ratio: 12 }, '1404000 kJ'],
    ['ideal_gas', { n: '1 mol', T: '300 K', P: '101325 Pa' }, '0.0246'],
    ['heat_capacity', { m: '10 kg', c: '4186 J/(kg*K)', dT: '10 K' }, '418600'],
    ['kinetic_energy', { m: '10 kg', v: '20 m/s' }, '2000'],
  ]
  for (const [id, overrides, expect] of cases) {
    const r = await run({ operation: 'formula', formula: id, overrides })
    assert(id + ' 带单位可算且数值对', r.ok === true && String(r.result).includes(expect), String(r.result).slice(-90))
  }
  const gear = await run({ operation: 'formula', formula: 'gear_contact_stress', overrides: { Ze: 190, Ft: '1000 N', b: '0.02 m', d1: '0.05 m', u: 3 } })
  assert('gear_contact_stress ≈ 219 MPa', gear.ok === true && String(gear.result).includes('219.39'), String(gear.result).slice(-80))
}

console.log('-- 4. 量纲数据一致性（desc 单位 vs dimension）--')
{
  const GAS = JSON.stringify({ M: 1, L: 2, T: -2, Theta: -1, N: -1 })
  const D2 = JSON.stringify({ L: 2, T: -1 })
  const COND = JSON.stringify({ M: 1, L: 1, T: -3, Theta: -1 })
  const LENGTH = JSON.stringify({ L: 1 })
  const RATE = JSON.stringify({ T: -1, Theta: 1 })
  const rule = (pattern, expected, label) => {
    const bad = []
    for (const formula of formulas) {
      for (const [name, param] of Object.entries(formula.params || {})) {
        const desc = String(param.desc || '')
        if (!pattern.test(desc)) continue
        if (JSON.stringify(param.dimension || {}) !== expected) bad.push(formula.id + '.' + name)
      }
    }
    assert(label + ' 全部标注正确', bad.length === 0, bad.slice(0, 5).join(','))
  }
  rule(/气体常数/, GAS, '气体常数（J/(mol·K)）')
  rule(/扩散系数|扩散常数/, D2, '扩散系数（m²/s）')
  rule(/导热系数/, COND, '导热系数（W/(m·K)）')
  rule(/截面宽/, LENGTH, '截面宽（m）')
  rule(/升温速率|加热速率/, RATE, '升温速率（K/h）')
  const pe = formulas.find((f) => f.id === 'potential_energy')
  assert('potential_energy.g = 加速度', JSON.stringify(pe.params.g.dimension) === JSON.stringify({ L: 1, T: -2 }), JSON.stringify(pe.params.g.dimension))
}

console.log('-- 5. 别名包含 API（formula 的 keys 整词命中）--')
{
  const cases = [
    ['thermal_radiation', 'stefan_boltzmann', 'missing_params'],
    ['potential_gravity', 'potential_energy', 'missing_params'],
    ['rocket_equation', 'rocket_equation', 'missing_params'],
  ]
  for (const [query, target, kind] of cases) {
    const r = await run({ operation: 'formula', formula: query })
    assert('别名 ' + query + ' → ' + target, r.error?.type === kind && String(r.error.message).includes(target), JSON.stringify(r.error?.message).slice(0, 100))
  }
  const rocket = await run({ operation: 'formula', formula: 'rocket_equation', overrides: { Isp: 311, m0: 100000, m1: 10000 } })
  assert('rocket_equation Δv ≈ 7022.6 m/s', rocket.ok === true && String(rocket.result).includes('7022.58'), String(rocket.result).slice(-90))
  const solar = await run({ operation: 'formula', formula: 'solar_luminosity' })
  assert('solar_luminosity = 3.828e26 W', solar.ok === true && String(solar.result).includes('3.828'), String(solar.result).slice(-80))
}

console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
