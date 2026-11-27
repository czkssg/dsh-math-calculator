/** 三份一直没人写的配方：人口年表 / 资源枯竭 / 债务螺旋。
 *
 * 它们不需要新公式，只用 recurrence 与 simulate。此前「没有模板」所以没人用；
 * 本套件把三条配方都跑一遍，并顺带守护一个真实缺陷：
 * recurrence 曾因 BigNumber 拒绝浮点中间结果而直接崩（`D*(1+0.02)-5` 第 30 期）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-recipes-'))
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
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol
const lastOf = (rows, key) => {
  const last = rows[rows.length - 1]
  if (!last) return NaN
  return Number(last[key] ?? (last.values && last.values[key]))
}

console.log('-- 1. 人口年表（逐年）--')
{
  const r = await run({ operation: 'recurrence', recurrence: 'P*1.02', initial: { P: 10000 }, periods: 50 })
  assert('50 期可算', r.ok === true, r.error && r.error.message)
  const v = r.ok ? lastOf(r.value.rows, 'P') : NaN
  assert('10000 × 1.02^50 ≈ 26916', near(v, 26915.9, 5), String(v))
  const capped = await run({ operation: 'recurrence', recurrence: 'P*min(1.02, 10000/P)', initial: { P: 100 }, periods: 200 })
  const cappedValue = capped.ok ? lastOf(capped.value.rows, 'P') : NaN
  assert('承载力上限 10000：永远不超过', Number.isFinite(cappedValue) && cappedValue <= 10000.001, String(cappedValue))
}

console.log('-- 2. 资源枯竭（转折年）--')
{
  const r = await run({ operation: 'simulate', stocks: { 资源: { initial: 1000 } }, flows: { 开采: { to: '资源', rate: '-40' } }, dt: 1, simSteps: 30 })
  assert('存量/流量可算', r.ok === true, r.error && r.error.message)
  const series = r.ok ? r.value.series['资源'] : []
  const end = series[series.length - 1]
  assert('1000 吨、年采 40 → 30 年末为 0', end !== undefined && near(end.value, 0, 1e-6), end && String(end.value))
  assert('峰值出现在 t=0（初值）', r.ok && r.value.peaks['资源'].t === 0, r.ok ? String(r.value.peaks['资源'].t) : '')
}

console.log('-- 3. 债务螺旋（守护 BigNumber 崩溃）--')
{
  const spiral = await run({ operation: 'recurrence', recurrence: 'D*(1.05)-2', initial: { D: 100 }, periods: 30 })
  assert('利息 > 盈余 → 可算（此前 BigNumber 直接崩）', spiral.ok === true, spiral.error && spiral.error.message)
  const d0 = spiral.ok ? Number(spiral.value.rows[0].D) : NaN
  const dEnd = spiral.ok ? lastOf(spiral.value.rows, 'D') : NaN
  assert('债务上升（100 → 约 299）', near(dEnd, 299.3, 2), String(dEnd) + '（初 ' + String(d0) + '）')
  const shrink = await run({ operation: 'recurrence', recurrence: 'D*(1.02)-5', initial: { D: 100 }, periods: 30 })
  const shrinkEnd = shrink.ok ? lastOf(shrink.value.rows, 'D') : NaN
  assert('盈余够付利息 → 债务下降', shrink.ok === true && shrinkEnd < 100, String(shrinkEnd))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
