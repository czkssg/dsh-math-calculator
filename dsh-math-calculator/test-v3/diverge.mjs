/**
 * 分支推演（DIVERGE）：两条时间线对照。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-diverge-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const dv = await import(pathToFileURL(join(root, 'lib/features/deduction/diverge.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
const base = { actors: [{ id: 'A', wealth: 500 }, { id: 'B', wealth: 400 }, { id: 'C', wealth: 300 }, { id: 'D', wealth: 350 }], edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'D' }, { from: 'D', to: 'A' }], steps: 100, seed: 7 }

console.log('-- 1. 同参数 → 无分歧 --')
{
  const r = dv.runDiverge({ base })
  assert('★ 完全相同的两条线不分歧', r.divergingYear === null && r.maxGap === 0, JSON.stringify({ d: r.divergingYear, g: r.maxGap }))
  assert('终局最强相同', r.baseLeader === r.variantLeader, r.baseLeader + '/' + r.variantLeader)
}

console.log('-- 2. 改 seed → 有分歧 --')
{
  const r = dv.runDiverge({ base, variant: { seed: 99 } })
  assert('★ 换 seed 出现分歧（阈值 0.02）', r.divergingYear !== null, JSON.stringify({ d: r.divergingYear, max: r.maxGap, maxYear: r.maxGapYear }))
  assert('★ 记录最大差异年', r.maxGapYear !== null && r.maxGap > 0, JSON.stringify({ y: r.maxGapYear, g: r.maxGap }))
}

console.log('-- 3. 改结构（去掉一条边）→ 有分歧 --')
{
  const r = dv.runDiverge({ base, variant: { edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }] } })
  assert('★ 结构变化 → 分歧或终局不同', r.divergingYear !== null || r.baseLeader !== r.variantLeader || Math.abs(r.warGap) > 0, JSON.stringify({ d: r.divergingYear, a: r.baseLeader, b: r.variantLeader, w: r.warGap }))
}

console.log('-- 4. 经 tool --')
{
  const out = await run({ operation: 'diverge', base, variant: { seed: 99 } })
  assert('★ diverge 经 tool', out.ok === true && out.result.includes('分支推演'), out.result.slice(0, 60))
  assert('输出含分歧年与最强对照', out.result.includes('分歧年') && out.result.includes('终局最强'), '')
  const bad = await run({ operation: 'diverge' })
  assert('缺 base → 报错', bad.ok === false, JSON.stringify(bad.error).slice(0, 60))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
