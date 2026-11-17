/**
 * R53：中文单位大面积缺失（7/10）+ pressure 单位口径 + 公式缺参提示。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-r53-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
console.log('-- 1. R53 点名的 7 个中文单位（全部要能换算到标准值）--')
{
  const cases = [
    ['石', 1, 'kg', 60],
    ['节', 1, 'km/h', 1.852],
    ['牛顿', 1, 'N', 1],
    ['摩尔', 1, 'mol', 1],
    ['吨标煤', 1, 'GJ', 29.3076],
    ['平方英尺', 1, 'm2', 0.09290304],
  ]
  for (const [unit, value, to, expected] of cases) {
    const r = await run({ operation: 'units', unitValue: value, unitFrom: unit, unitTo: to })
    const num = r.ok && r.value ? Number(r.value.result) : NaN
    assert('★ ' + unit + ' → ' + to + ' ≈ ' + expected, Math.abs(num - expected) / expected < 0.01, String(num))
  }
  const c = await run({ operation: 'units', unitValue: 100, unitFrom: '摄氏', unitTo: 'K' })
  assert('★ 100 摄氏 = 373.15 K', Math.abs(Number(c.value.result) - 373.15) < 0.01, String(c.value.result))
}
console.log('-- 2. 原有中文单位不回归 --')
{
  for (const [unit, to, expected] of [['米', 'm', 1], ['公里', 'm', 1000], ['斤', 'kg', 0.5]]) {
    const r = await run({ operation: 'units', unitValue: 1, unitFrom: unit, unitTo: to })
    assert('★ ' + unit + ' 仍可用', r.ok === true && Math.abs(Number(r.value.result) - expected) < 0.001, String(r.value.result))
  }
}
console.log('-- 3. pressure 单位是 Pa（R53 报「<1atm 全崩」实为单位口径）--')
{
  const atm = await run({ operation: 'world', planetMass: 1, pressure: 0.1 })
  assert('★ 按 atm 填 0.1 → 报错', atm.ok === false, String(atm.ok))
  assert('★ hint 给出换算（1 atm = 101325 Pa）', String(atm.error.hint).includes('101325'), String(atm.error?.hint).slice(0, 60))
  const mars = await run({ operation: 'world', planetMass: 0.107, planetRadius: 0.532, pressure: 610 })
  assert('★ 火星 610 Pa 可用', mars.ok === true, String(mars.error?.type))
  const tenth = await run({ operation: 'world', planetMass: 1, pressure: 10132.5 })
  assert('★ 0.1 atm = 10132.5 Pa 可用', tenth.ok === true, String(tenth.error?.type))
}
console.log('-- 4. 公式缺参要给「缺哪个」（不是 [object Object]）--')
{
  const r = await run({ operation: 'formula', formula: 'kinetic_energy' })
  assert('★ 缺参 → missing_params', r.ok === false && r.error.type === 'missing_params', String(r.error?.type))
  assert('★ 说清缺 m 与 v', String(r.error.message).includes('m') && String(r.error.message).includes('v'), String(r.error?.message).slice(0, 60))
  const nf = await run({ operation: 'formula', formula: 'thermal_radiation', params: { T: 300 } })
  assert('★ 公式名不存在 → unknown_formula', nf.ok === false && nf.error.type === 'unknown_formula', String(nf.error?.type))
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
