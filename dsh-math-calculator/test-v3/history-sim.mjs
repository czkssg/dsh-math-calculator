/**
 * 一站式历史模拟：冲突模型 → 份额序列 → 纪元 + 危机。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-sim-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const c = await import(pathToFileURL(join(root, 'lib/features/deduction/conflict.js')).href)
const h = await import(pathToFileURL(join(root, 'lib/features/deduction/history.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
const sim = { actors: [{ id: 'A', wealth: 500 }, { id: 'B', wealth: 400 }, { id: 'C', wealth: 300 }, { id: 'D', wealth: 350 }], edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'D' }, { from: 'D', to: 'A' }], steps: 200, seed: 7 }

console.log('-- 1. 冲突序列 --')
{
  const r = c.runConflictSeries(sim)
  assert('★ 逐年序列 200 点', r.series.length === 200, String(r.series.length))
  assert('★ 最强势力份额序列', r.leaderShare.length === 200 && r.leaderShare.every((p) => p.value > 0 && p.value <= 1), '')
  assert('集中度 HHI 在 (0,1]', r.concentration.every((p) => p.hhi > 0 && p.hhi <= 1), '')
  assert('★ 同 seed 序列一致', JSON.stringify(r.leaderShare) === JSON.stringify(c.runConflictSeries(sim).leaderShare), '')
}

console.log('-- 2. 平滑与纪元 --')
{
  const r = c.runConflictSeries(sim)
  const raw = h.buildEpochs({ series: r.leaderShare, events: r.events, minEpochYears: 10, threshold: 0.08 })
  const smooth = h.buildEpochs({ series: r.leaderShare, events: r.events, minEpochYears: 10, threshold: 0.08, smoothing: 6 })
  assert('★ 平滑后纪元显著减少', smooth.epochs.length < raw.epochs.length, raw.epochs.length + ' → ' + smooth.epochs.length)
  assert('★ 事件归入纪元（首纪元含战争）', smooth.epochs[0].events.length > 0, String(smooth.epochs[0].events.length))
}

console.log('-- 3. 危机检测 --')
{
  const drop = h.detectCrises([{ year: 0, value: 1 }, { year: 1, value: 0.5 }, { year: 2, value: 0.55 }], { dropRatio: 0.2 })
  assert('★ 跌 50% → 标记危机', drop.length === 1 && drop[0].year === 1, JSON.stringify(drop))
  const flat = h.detectCrises([{ year: 0, value: 1 }, { year: 1, value: 0.95 }], { dropRatio: 0.2 })
  assert('小跌不标危机', flat.length === 0, '')
}

console.log('-- 4. 经 tool（一站式）--')
{
  const out = await run({ operation: 'history', simulate: sim, minEpochYears: 10, smoothing: 6, historyThreshold: 0.08 })
  assert('★ 一站式：含模拟摘要', out.ok === true && out.result.includes('[模拟]'), out.result.slice(0, 80))
  assert('含纪元与转折年', out.result.includes('转折年'), '')
  assert('value 带 crises 与 simulation', Array.isArray(out.value.crises) && out.value.simulation !== null, JSON.stringify(out.value).slice(0, 80))
  const plain = await run({ operation: 'history', series: [{ year: 0, value: 100 }, { year: 20, value: 130 }, { year: 40, value: 90 }] })
  assert('不给 simulate 仍走纯序列', plain.ok === true && !plain.result.includes('[模拟]'), '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
