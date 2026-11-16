/**
 * R49 的三项失败：eigen 非对称 / system equations / recurrence 状态名。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-r49-'))
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
console.log('-- 1. eigen 非对称矩阵（R49 失败项）--')
{
  const r = await run({ operation: 'eigen', matrix: [[1, 2], [3, 4]] })
  assert('★ 非对称矩阵可算', r.ok === true, JSON.stringify(r.error))
  const vals = r.value.map((v) => (typeof v === 'number' ? v : v.re))
  assert('★ 特征值约 -0.372 与 5.372（和 = 5，积 = -2）', Math.abs(vals.reduce((a, b) => a + b, 0) - 5) < 1e-6 && Math.abs(vals.reduce((a, b) => a * b, 1) + 2) < 1e-6, JSON.stringify(vals))
  const c = await run({ operation: 'eigen', matrix: [[0, -1], [1, 0]] })
  assert('★ 复数特征值也能算（±i）', c.ok === true && String(c.result).includes('i'), String(c.result).slice(0, 40))
}
console.log('-- 2. system 的 equations 写法 --')
{
  const r = await run({ operation: 'system', equations: ['x+y=3', 'x-y=1'] })
  assert('★ equations 数组可解（不再崩溃）', r.ok === true, JSON.stringify(r.error))
  assert('★ 解是 x=2、y=1', String(r.result).includes('x = 2') && String(r.result).includes('y = 1'), String(r.result).slice(0, 60))
  const none = await run({ operation: 'system' })
  assert('★ 什么都不给 → missing_params（不崩）', none.ok === false && none.error.type === 'missing_params', String(none.error?.type))
}
console.log('-- 3. 多未知数方程的正确诊断 --')
{
  const r = await run({ operation: 'solve', expression: 'x+y=3' })
  assert('★ 判为「多组解」而不是「没有实数解」', r.ok === false && r.error.type === 'singular', String(r.error?.type))
  assert('★ hint 说清未知数是谁', String(r.error.hint).includes('x') && String(r.error.hint).includes('y'), String(r.error.hint).slice(0, 60))
}
console.log('-- 4. recurrence 状态名从表达式推断 --')
{
  const a = await run({ operation: 'recurrence', recurrence: 'a*2', initial: 1, periods: 3 })
  assert('★ recurrence:"a*2" + initial:1 → 状态 a（不是 P）', a.ok === true && String(a.result).includes('状态 a'), String(a.result).slice(0, 50))
  const p = await run({ operation: 'recurrence', recurrence: 'P*2', initial: 1, periods: 3 })
  assert('★ recurrence:"P*2" → 状态 P', p.ok === true && String(p.result).includes('状态 P'), '')
  const obj = await run({ operation: 'recurrence', recurrence: 'a*2', initial: { a: 1 }, periods: 3 })
  assert('显式对象仍优先', obj.ok === true && String(obj.result).includes('状态 a'), '')
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
