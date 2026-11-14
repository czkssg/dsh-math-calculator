/**
 * 反馈报告 v3 的参数兼容层（solve/ode/chain/impact/topology structure/world 嵌套）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-aliases-'))
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

console.log('-- 1. solve 别名（equation / equations / expr）--')
{
  const one = await run({ operation: 'solve', equation: 'x^2-4=0' })
  assert('★ equation → expression', one.ok === true && one.result.includes('2'), one.result.slice(0, 60))
  const many = await run({ operation: 'solve', equations: ['x+y=5', 'x-y=1'] })
  assert('★ equations 数组 → 方程组', many.ok === true, String(many.error?.message))
  const expr = await run({ operation: 'solve', expr: 'x+1=3' })
  assert('expr 别名', expr.ok === true, '')
}

console.log('-- 2. ode / recurrence 初值写法 --')
{
  const y0 = await run({ operation: 'ode', equation: 'dy/dt = -y', y0: 1, from: 0, to: 1 })
  assert('★ y0 数字 → initial{y}', y0.ok === true && y0.result.includes('求解'), String(y0.error?.message))
  const num = await run({ operation: 'ode', expression: 'dy/dt = -y', initial: 1, from: 0, to: 1 })
  assert('★ initial 数字 → 从表达式取状态名', num.ok === true, String(num.error?.message))
  const rec = await run({ operation: 'recurrence', recurrence: 'P*1.1', initial: 100, periods: 3 })
  assert('★ recurrence initial 数字 → P', rec.ok === true && rec.result.includes('110'), String(rec.error?.message))
}

console.log('-- 3. chain 顶层 / impact from --')
{
  const chain = await run({ operation: 'chain', stages: [{ name: 'a', expr: '1' }, { name: 'b', expr: 'prev*2' }], raw: 1 })
  assert('★ stages/raw 顶层 → chain 对象', chain.ok === true && chain.result.includes('链条传导'), String(chain.error?.message))
  const impact = await run({ operation: 'impact', from: 'alpha_fs' })
  assert('from → traceTarget（给出明确结果或未知量提示）', impact.ok === false ? String(impact.error?.type) === 'unknown_symbol' : true, JSON.stringify(impact.error).slice(0, 80))
}

console.log('-- 4. topology structure 扁平写法 --')
{
  const flat = await run({ operation: 'topology', topology: { action: 'structure', kind: 'building', levels: 320, area: 1000 } })
  assert('★ kind/levels/area → 建筑评估', flat.ok === true && flat.result.includes('建筑评估'), String(flat.error?.message))
  const nested = await run({ operation: 'topology', topology: { action: 'structure', building: { kind: 'building', floors: 100, footprintM2: 500 } } })
  assert('嵌套写法仍可用', nested.ok === true, '')
}

console.log('-- 5. world 嵌套对象 --')
{
  const nested = await run({ operation: 'world', world: { planetMass: 318, planetRadius: 11.2 }, brief: true })
  assert('★ world:{planetMass…} 生效（2.54g）', nested.ok === true && nested.result.includes('2.54'), nested.result.slice(0, 100))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
