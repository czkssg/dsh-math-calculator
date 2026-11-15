/**
 * balance 跨量纲与速率单位（反馈 G3/H3/I1/K4：粮/水/能三项）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-balance-cross-'))
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

console.log('-- 1. 速率单位（吨/年、m^3/年、kWh/年）--')
{
  const out = await run({ operation: 'balance', balance: { grain: { demand: 3.2e9, supply: 3.4e9, unit: '吨/年' }, water: { demand: 1.2e11, supply: 1e11, unit: 'm^3/年' }, energy: { demand: 7.3e9, supply: 7.9e9, unit: 'kWh/年' } } })
  assert('★ 三项跨量纲可盘点', out.ok === true, String(out.error?.message))
  assert('粮食覆盖率 106%', out.result.includes('106%'), out.result.slice(0, 200))
  assert('水 83%（缺）', out.result.includes('83%'), '')
  assert('★ 给出跨量纲提示', out.result.includes('跨量纲提示'), '')
  assert('最短板按覆盖率选（水 83%）', out.value.bottleneck !== null && out.value.bottleneck.key === 'water', JSON.stringify(out.value?.bottleneck).slice(0, 100))
}

console.log('-- 2. 现代速率单位（t/a、m3/a、kWh/a）--')
{
  const out = await run({ operation: 'balance', balance: { grain: { demand: 3.2e9, supply: 3.4e9, unit: 't/a' }, energy: { demand: 7.3e9, supply: 7.9e9, unit: 'kWh/a' } } })
  assert('★ t/a 与 kWh/a 可盘点', out.ok === true, String(out.error?.message))
}

console.log('-- 3. 同量纲仍按绝对值比较 --')
{
  const out = await run({ operation: 'balance', balance: { grain: { demand: 100, supply: 80, unit: '万吨' } } })
  assert('万吨 认得出（质量族）', out.ok === true && out.result.includes('80%'), out.result.slice(0, 120))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
