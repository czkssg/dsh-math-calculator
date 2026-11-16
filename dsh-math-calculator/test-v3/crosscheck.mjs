/**
 * 跨模块对账（crosscheck）：同一量两处实现比对。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-cc-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const cc = await import(pathToFileURL(join(root, 'lib/features/graph/crosscheck.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
console.log('-- 1. 路径取值 --')
{
  assert('★ 普通路径', cc.extractByPath({ planet: { escapeVelocity: 11200 } }, 'planet.escapeVelocity') === 11200, '')
  assert('★ 序列取末值', cc.extractByPath({ series: { pop: [{ value: 1 }, { value: 9 }] } }, 'series.pop') === 9, '')
  assert('路径不存在 → null', cc.extractByPath({}, 'a.b') === null, '')
}
console.log('-- 2. 对账执行（含换算） --')
{
  const items = [
    { id: 'x', label: '换算后一致', a: { op: 'a', params: {} }, b: { op: 'b', params: {} }, extractA: 'v', extractB: 'v', scaleA: 1000, tolerance: 0.01 },
    { id: 'y', label: '不一致', a: { op: 'a', params: {} }, b: { op: 'b', params: {} }, extractA: 'v', extractB: 'v', tolerance: 0.01 },
    { id: 'z', label: '取不到', a: { op: 'a', params: {} }, b: { op: 'b', params: {} }, extractA: 'missing', extractB: 'v' },
  ]
  const results = cc.runCrosschecks(items, (op) => (op === 'a' ? { v: 5 } : { v: 5000 }))
  assert('★ 换算后一致（5×1000 vs 5000）', results[0].verdict === 'match' && results[0].diffPercent < 1, JSON.stringify(results[0]))
  assert('★ 无换算 → 不一致', results[1].verdict === 'drift', JSON.stringify(results[1]))
  assert('★ 取不到 → error', results[2].verdict === 'error', JSON.stringify(results[2]))
}
console.log('-- 3. 经 tool（真实 5 项）--')
{
  const out = await run({ operation: 'crosscheck' })
  assert('★ 5 项全部一致', out.ok === true && out.value.drifted === 0 && out.value.errors === 0, JSON.stringify({ d: out.value?.drifted, e: out.value?.errors }))
  assert('含逃逸速度与排水量', out.result.includes('逃逸速度') && out.result.includes('排水量'), out.result.slice(0, 120))
  const one = await run({ operation: 'crosscheck', checkId: 'o2' })
  assert('★ checkId 只跑一项', one.ok === true && one.value.results.length === 1, String(one.value?.results?.length))
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
