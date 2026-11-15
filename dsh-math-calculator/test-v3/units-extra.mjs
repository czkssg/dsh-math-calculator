/**
 * 反馈报告 v3：单位缺口（AU / 光年 / 桶 / 吨·年复合）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-units-extra-'))
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

console.log('-- 1. 天文单位 --')
{
  const au = await run({ operation: 'units', unitValue: 1, unitFrom: 'AU', unitTo: 'km' })
  assert('★ 1 AU = 149597870.7 km', au.ok === true && au.result.includes('149597870'), au.result.slice(0, 100))
  const cjk = await run({ operation: 'units', unitValue: 1, unitFrom: '天文单位', unitTo: 'm' })
  assert('★ 中文「天文单位」可用', cjk.ok === true && cjk.result.includes('149597870700'), cjk.result.slice(0, 100))
  const ly = await run({ operation: 'units', unitValue: 1, unitFrom: '光年', unitTo: 'km' })
  assert('★ 中文「光年」可用', ly.ok === true && ly.result.includes('9460730472580'), ly.result.slice(0, 100))
}

console.log('-- 2. 石油桶 --')
{
  const bbl = await run({ operation: 'units', unitValue: 1, unitFrom: 'barrel', unitTo: 'L' })
  assert('★ 1 barrel = 158.987 L', bbl.ok === true && bbl.result.includes('158.987'), bbl.result.slice(0, 100))
  const cjk = await run({ operation: 'units', unitValue: 1, unitFrom: '桶', unitTo: 'L' })
  assert('★ 中文「桶」可用', cjk.ok === true && cjk.result.includes('158.987'), cjk.result.slice(0, 100))
}

console.log('-- 3. 复合速率（吨/年）--')
{
  const rate = await run({ expression: '1 吨/年 to kg/s' })
  assert('★ 1 吨/年 ≈ 3.169e-5 kg/s', rate.ok === true && rate.result.includes('0.00003169'), rate.result.slice(0, 100))
  const calc = await run({ expression: '2 吨/年 * 3 年 to kg' })
  assert('★ 复合单位参与运算（2 吨/年 × 3 年 = 6000 kg）', calc.ok === true && calc.result.includes('6000'), calc.result.slice(0, 100))
}

console.log('-- 4. 未受影响 --')
{
  const kwh = await run({ operation: 'units', unitValue: 1, unitFrom: 'kWh', unitTo: 'MJ' })
  assert('kWh → MJ 仍 3.6', kwh.ok === true && kwh.result.includes('3.6'), '')
  const psi = await run({ operation: 'units', unitValue: 1, unitFrom: 'psi', unitTo: 'Pa' })
  assert('psi 仍可用', psi.ok === true && psi.result.includes('6894'), '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
