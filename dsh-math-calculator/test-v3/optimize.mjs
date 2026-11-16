/**
 * 线性规划（optimize）：资源最优配比。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-lp-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const opt = await import(pathToFileURL(join(root, 'lib/features/math/optimize.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
console.log('-- 1. 最大化 --')
{
  const r = opt.optimize({ objective: 'profit', opType: 'max', constraints: { labor: { max: 100 }, steel: { max: 80 } }, variables: { A: { profit: 3, labor: 2, steel: 1 }, B: { profit: 5, labor: 4, steel: 3 } } })
  assert('★ 有解且最优值 150', r.feasible === true && Math.abs(r.result - 150) < 0.01, String(r.result))
  assert('★ A=50、B=0', Math.abs(r.values.A - 50) < 0.01 && r.values.B === 0, JSON.stringify(r.values))
}
console.log('-- 2. 最小化 --')
{
  const r = opt.optimize({ objective: 'cost', opType: 'min', constraints: { demand: { min: 100 } }, variables: { x: { cost: 3, demand: 5 }, y: { cost: 4, demand: 8 } } })
  assert('★ 最小代价 50（全用 y）', Math.abs(r.result - 50) < 0.01, String(r.result))
  assert('y=12.5', Math.abs(r.values.y - 12.5) < 0.01, JSON.stringify(r.values))
}
console.log('-- 3. 校验 --')
{
  let threw = false
  try { opt.optimize({ objective: 'p', constraints: { r: { max: 1 } }, variables: { a: { p: 1, unknown: 2 } } }) } catch { threw = true }
  assert('★ 未声明资源 → 报错（不静默忽略）', threw, '')
}
console.log('-- 4. 整数规划 --')
{
  const r = opt.optimize({ objective: 'value', opType: 'max', constraints: { weight: { max: 10 } }, variables: { gold: { value: 10, weight: 4 }, silver: { value: 5, weight: 2 } }, integers: ['gold', 'silver'] })
  assert('★ 整数解', Number.isInteger(r.values.gold), JSON.stringify(r.values))
}
console.log('-- 5. 经 tool --')
{
  const out = await run({ operation: 'optimize', objective: 'profit', opType: 'max', constraints: { labor: { max: 100 }, steel: { max: 80 } }, lpVariables: { A: { profit: 3, labor: 2, steel: 1 }, B: { profit: 5, labor: 4, steel: 3 } } })
  assert('★ optimize 经 tool', out.ok === true && out.result.includes('线性规划'), out.result.slice(0, 60))
  const bad = await run({ operation: 'optimize', objective: 'p' })
  assert('缺约束 → invalid_argument', bad.ok === false && bad.error.type === 'invalid_argument', '')
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
