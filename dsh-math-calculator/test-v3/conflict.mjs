/**
 * 冲突/贡赋模型（Axelrod 原料二次加工）：确定性 + 上限输出。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-conflict-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const c = await import(pathToFileURL(join(root, 'lib/features/deduction/conflict.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
const base = { actors: [{ id: 'A', wealth: 500 }, { id: 'B', wealth: 400 }, { id: 'C', wealth: 300 }, { id: 'D', wealth: 350 }], edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'D' }, { from: 'D', to: 'A' }], steps: 100, seed: 7 }

console.log('-- 1. 模拟与确定性 --')
{
  const r = c.runConflict(base)
  assert('★ 有战争也有付贡', r.wars > 0 && r.tributes > 0, JSON.stringify({ w: r.wars, t: r.tributes }))
  assert('排序按财富降序', r.ranking.every((x, i) => i === 0 || r.ranking[i - 1].wealth >= x.wealth), '')
  assert('★ 同 seed 完全复现', JSON.stringify(r.ranking) === JSON.stringify(c.runConflict(base).ranking) && r.wars === c.runConflict(base).wars, '')
  const other = c.runConflict({ ...base, seed: 8 })
  assert('★ 不同 seed → 结果不同', r.wars !== other.wars || JSON.stringify(r.ranking) !== JSON.stringify(other.ranking), JSON.stringify({ a: r.wars, b: other.wars }))
}

console.log('-- 2. 强者更富（结构正确性）--')
{
  const rich = c.runConflict({ actors: [{ id: 'R', wealth: 5000 }, { id: 'P', wealth: 100 }, { id: 'Q', wealth: 100 }], edges: [{ from: 'R', to: 'P' }, { from: 'P', to: 'Q' }], steps: 50, seed: 3 })
  assert('★ 初始最富者通常终局最强', rich.ranking[0].id === 'R', JSON.stringify(rich.ranking))
  assert('战败记录存在', Object.values(rich.records).some((v) => v.losses > 0), '')
}

console.log('-- 3. 校验 --')
{
  let threw = false
  try { c.runConflict({ actors: [{ id: 'A', wealth: 1 }], edges: [] }) } catch { threw = true }
  assert('单个行动者 → 报错', threw, '')
  let threw2 = false
  try { c.runConflict({ actors: [{ id: 'A', wealth: 1 }, { id: 'B', wealth: 1 }], edges: [{ from: 'A', to: 'Z' }] }) } catch { threw2 = true }
  assert('★ 未定义行动者 → 报错', threw2, '')
}

console.log('-- 4. 经 tool --')
{
  const out = await run({ operation: 'conflict', actors: base.actors, edges: base.edges, steps: 100, seed: 7 })
  assert('★ conflict 经 tool', out.ok === true && out.result.includes('冲突/贡赋模拟'), out.result.slice(0, 60))
  assert('输出含排序与战争次数', out.result.includes('最终排序') && out.result.includes('战争'), '')
  const bad = await run({ operation: 'conflict', actors: [], edges: [] })
  assert('空行动者 → invalid_argument', bad.ok === false && bad.error.type === 'invalid_argument', '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
