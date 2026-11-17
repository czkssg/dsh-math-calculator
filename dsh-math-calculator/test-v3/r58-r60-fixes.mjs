/**
 * R58–R60 三份模拟推演 + 144 表复现后的修复守护。
 *
 * ## 这一套锁什么
 *
 * 1. `consistency` 负数+单位（R58 #1）：原来整条抽不出、判「无冲突」；
 * 2. `sanity` 批量锚点（R58 #2）：help 承诺了但实现缺失；
 * 3. 公式量纲/单位标注（144 表 H 类 + R58 #3/#4）：参数带单位不再被 unit_mismatch 挡，
 *    且 `kiln_firing_time` 这类「SI 计算、非 SI 显示」的输出数值正确；
 * 4. `nautical mile` / `raddose` / `backtrace` 链 / 公式别名（R58 #5/#6/#8，R60）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-r58-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. consistency 负数 + 单位 --')
{
  const c = await run({ operation: 'consistency', consistency: { sections: [{ number: 1, text: '反应焓变 -876 kJ/mol' }, { number: 2, text: '反应焓变 -324 kJ/mol' }] } })
  assert('两段负数各抽出 1 条主张', c.value.claimCount === 2, JSON.stringify(c.value.claimCount))
  assert('判为口径冲突', c.result.includes('口径冲突'), c.result.slice(0, 120))
  assert('差 2.7 倍', c.result.includes('差 2.7 倍'), c.result.slice(0, 160))
  const flip = await run({ operation: 'consistency', consistency: { sections: [{ number: 1, text: '功率 +876 W' }, { number: 2, text: '功率 -876 W' }] } })
  assert('正负号相反直接算冲突', flip.result.includes('口径冲突'), flip.result.slice(0, 120))
  const normal = await run({ operation: 'consistency', consistency: { sections: [{ number: 1, text: '人口 920 亿' }, { number: 2, text: '人口 900 亿' }] } })
  assert('近似值（2% 差）仍不算冲突', !normal.result.includes('✗'), normal.result.slice(0, 120))
}

console.log('-- 2. sanity 批量锚点 --')
{
  const big = await run({ operation: 'evaluate', terse: true, expressions: [{ label: '大数', expr: '1e12', sanity: { max: 1e10, note: '测试上限' } }] })
  assert('★ 上限越界有警告', big.result.includes('超出锚点上限') && big.result.includes('达 100 倍'), big.result.slice(0, 160))
  assert('value 标记 violated', big.value.items[0].sanityStatus === 'violated', JSON.stringify(big.value.items[0].sanityStatus))
  const ok = await run({ operation: 'evaluate', expressions: [{ label: '正常', expr: '100', sanity: { max: 1e3 } }] })
  assert('未越界标记 passed 且不打扰', ok.value.items[0].sanityStatus === 'passed' && !ok.result.includes('超出锚点'), ok.result.slice(0, 120))
  const low = await run({ operation: 'evaluate', expressions: [{ label: '小', expr: '1', sanity: { min: 10 } }] })
  assert('下限越界', low.result.includes('低于锚点下限'), low.result.slice(0, 120))
  const mag = await run({ operation: 'evaluate', expressions: [{ label: '量级', expr: '1000', sanity: { expect: 6 } }] })
  assert('量级差 3 个数级', mag.result.includes('与锚点量级'), mag.result.slice(0, 120))
  const none = await run({ operation: 'evaluate', expressions: [{ label: '无判据', expr: '1e12' }] })
  assert('不声明判据则零提示', !none.result.includes('锚点'), none.result.slice(0, 80))
}

console.log('-- 3. 公式量纲：带单位参数不再被拒 --')
{
  const cases = [
    ['beam_section_modulus', { b: '0.1 m', h: '0.15 m' }, '0.000375 m³'],
    ['diffusion_time', { distance: '1 mm', diffusion_coeff: '1e-9 m^2/s' }, ''],
    ['case_depth', { D0: '1e-5 m^2/s', activation_energy: '100 kJ/mol', R: '8.314 J/(mol*K)', temperature: '1200 K', hold_time: '3600 s' }, ''],
    ['ideal_gas', { n: '1 mol', R: '8.314 J/(mol*K)', T: '300 K', P: '101325 Pa' }, ''],
    ['peclet_number', { length: '1 m', velocity: '0.001 m/s', diffusion_coeff: '1e-9 m^2/s' }, ''],
    ['kiln_firing_time', { delta_T: '1080 K', heating_rate: '150 K/h' }, '7.2 h'],
  ]
  for (const [id, overrides, expect] of cases) {
    const r = await run({ operation: 'formula', formula: id, overrides })
    assert(id + ' 接受带单位参数', r.ok === true, String(r.error?.message).slice(0, 80))
    if (expect !== '') assert(id + ' 数值/单位正确：' + expect, String(r.result).includes(expect), String(r.result).slice(-80))
  }
}

console.log('-- 4. 输出单位换算（SI 计算 → 显示单位）--')
{
  const cases = [
    ['reactor_residence_time', { volume: '10 m^3', volumetric_flow: '5 m^3/h' }, '2 h'],
    ['oxygen_depletion', { V: '30 m^3', n: 2, consumption: '0.3 m^3/min' }, '10.5 min'],
    ['gear_geometry', { gear_module: '2 mm', teeth: 20 }, '40 mm'],
    ['admin_radius_from_info', { speed_km_per_day: '20 km/day', max_days: '10 天' }, '100 km'],
    ['kiln_heat_balance', { ware_mass: '100 kg', ware_specific_heat: '1000 J/(kg*K)', delta_T: '1080 K', shell_loss_ratio: 12 }, '1404000 kJ'],
  ]
  for (const [id, overrides, expect] of cases) {
    const r = await run({ operation: 'formula', formula: id, overrides })
    assert(id + ' = ' + expect, r.ok === true && String(r.result).includes(expect), String(r.result).slice(-90))
  }
  const gear = await run({ operation: 'formula', formula: 'gear_contact_stress', overrides: { Ze: 190, Ft: '1000 N', b: '0.02 m', d1: '0.05 m', u: 3 } })
  assert('gear_contact_stress ≈ 219 MPa', gear.ok === true && String(gear.result).includes('219.39'), String(gear.result).slice(-80))
}

console.log('-- 5. shared 修复：nautical mile / raddose --')
{
  const nm = await run({ operation: 'units', unitValue: 10000, unitFrom: 'nautical mile', unitTo: 'km' })
  assert('nautical mile → 18520 km', nm.ok === true && String(nm.result).includes('18520 km'), String(nm.result).slice(0, 100))
  const nmi = await run({ operation: 'units', unitValue: 1, unitFrom: 'nmi', unitTo: 'km' })
  assert('nmi 仍可用', nmi.ok === true && String(nmi.result).includes('1.852 km'), String(nmi.result).slice(0, 80))
  const rd = await run({ operation: 'units', unitValue: 25, unitFrom: 'MJ/kg', unitTo: 'J/g' })
  assert('★ 代入过程不再出现 raddose', rd.ok === true && !String(rd.result).includes('raddose'), String(rd.result).slice(0, 140))
}

console.log('-- 6. backtrace 推荐链对口 --')
{
  const bt = await run({ operation: 'backtrace', target: '这座窑一天烧多少煤' })
  assert('★ 第一命中是窑炉热平衡', bt.value.matches[0].id === 'kiln_heat_balance', JSON.stringify(bt.value.matches.slice(0, 3).map((m) => m.id)))
  assert('推荐链含窑炉', String(bt.result).includes('窑炉热平衡'), String(bt.result).slice(0, 160))
}

console.log('-- 7. 公式别名与火箭方程 --')
{
  const tr = await run({ operation: 'formula', formula: 'thermal_radiation' })
  assert('thermal_radiation 别名命中 stefan_boltzmann', String(tr.error?.message).includes('stefan_boltzmann'), JSON.stringify(tr.error?.message).slice(0, 120))
  const pg = await run({ operation: 'formula', formula: 'potential_gravity' })
  assert('potential_gravity 别名命中 potential_energy', String(pg.error?.message).includes('potential_energy'), JSON.stringify(pg.error?.message).slice(0, 120))
  const rk = await run({ operation: 'formula', formula: 'rocket_equation', overrides: { Isp: 311, m0: 100000, m1: 10000 } })
  assert('rocket_equation 可调用（Δv ≈ 7022.6 m/s）', rk.ok === true && String(rk.result).includes('7022.58'), String(rk.result).slice(-90))
  const pe = await run({ operation: 'formula', formula: 'potential_energy', overrides: { m: '1 kg', h: '10 m', g: '9.81 m/s^2' } })
  assert('potential_energy 的 g 接受 m/s^2', pe.ok === true && String(pe.result).includes('98.1'), String(pe.result).slice(-70))
}

console.log('-- 8. 公式库规模 --')
{
  const formulas = JSON.parse(readFileSync(join(root, 'src/data/formulas.json'), 'utf8'))
  assert('公式库 804 条', formulas.length === 804, String(formulas.length))
  const rocket = formulas.find((f) => f.id === 'rocket_equation')
  assert('rocket_equation 带 sources', Array.isArray(rocket.sources) && rocket.sources.length > 0, '')
}

console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const item of fails) console.log('  - ' + item)
  process.exitCode = 1
}
