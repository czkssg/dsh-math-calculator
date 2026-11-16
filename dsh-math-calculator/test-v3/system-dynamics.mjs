/**
 * 系统动力学（simulate）：存量/流量演化。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-sd-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const sd = await import(pathToFileURL(join(root, 'lib/features/deduction/system-dynamics.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
console.log('-- 1. 人口增长 --')
{
  const r = sd.simulateSystemDynamics({ stocks: { population: { initial: 100 } }, flows: { births: { to: 'population', rate: '0.03*population' }, deaths: { to: 'population', rate: '-0.01*population' } }, steps: 50 })
  const last = r.series.population[50].value
  assert('★ 2% 年增长 50 年 → 约 269（e^1≈2.72）', Math.abs(last - 269) < 15, String(last))
  assert('floods 无警告（数值稳定）', !r.notes.some((n) => n.includes('算不出')), '')
}
console.log('-- 2. 资源枯竭 --')
{
  const r = sd.simulateSystemDynamics({ stocks: { population: { initial: 100 }, resource: { initial: 1000 } }, flows: { births: { to: 'population', rate: '0.03*population' }, deaths: { to: 'population', rate: '-0.01*population' }, extract: { to: 'resource', rate: '-population*0.5' } }, steps: 50 })
  assert('★ 资源被耗尽（到 0）', Math.abs(r.series.resource[r.series.resource.length - 1].value) < 0.01, String(r.series.resource[50].value))
  assert('资源峰值在 t=0（单调下降）', r.peaks.resource.t === 0, String(r.peaks.resource.t))
}
console.log('-- 3. 达峰回落 --')
{
  const r = sd.simulateSystemDynamics({ stocks: { fish: { initial: 100 } }, flows: { growth: { to: 'fish', rate: 'fish*(1 - fish/500)' }, harvest: { to: 'fish', rate: '-fish*0.6' } }, steps: 60 })
  assert('★ 逻辑斯蒂 + 捕捞 → 收敛到平衡点 200（K=500、捕捞 0.6）', Math.abs(r.series.fish[60].value - 200) < 5, String(r.series.fish[60].value))
}
console.log('-- 4. 校验 --')
{
  let threw = false
  try { sd.simulateSystemDynamics({ stocks: {}, flows: {} }) } catch { threw = true }
  assert('空存量 → 报错', threw, '')
  let threw2 = false
  try { sd.simulateSystemDynamics({ stocks: { a: { initial: 1 } }, flows: { f: { to: 'nope', rate: '1' } } }) } catch { threw2 = true }
  assert('★ 流量指向未知存量 → 报错', threw2, '')
}
console.log('-- 5. 经 tool --')
{
  const out = await run({ operation: 'simulate', stocks: { population: { initial: 100 } }, flows: { births: { to: 'population', rate: '0.03*population' } }, simSteps: 10 })
  assert('★ simulate 经 tool', out.ok === true && out.result.includes('系统动力学'), out.result.slice(0, 60))
  assert('输出含初值/末值/峰值', out.result.includes('初 100.0') && out.result.includes('峰值'), out.result.slice(0, 140))
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
