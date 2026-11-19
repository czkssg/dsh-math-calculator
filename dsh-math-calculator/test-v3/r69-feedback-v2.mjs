/**
 * 反馈报告 v2 全量（2026-11-19 21:31）的 11 条待修：真 bug 3 条 + 接口 8 条。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-fb2-'))
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
console.log('-- 真 bug --')
{
  const sys = await run({ operation: 'system', equations: ['x+y=3', 'x+y=5'] })
  assert('★ system 矛盾 → no_solution（不再 singular）', sys.ok === false && sys.error?.type === 'no_solution', String(sys.error?.type))
  const opt = await run({ operation: 'optimize', objective: 'profit', constraints: { labor: { max: 1, min: 2 } }, lpVariables: { x: { labor: 1, profit: 1 } } })
  assert('★ optimize 无解 → no_solution（不再 THROW）', opt.ok === false && opt.error?.type === 'no_solution', String(opt.error?.type))
  const optUnbounded = await run({ operation: 'optimize', objective: 'profit', constraints: { labor: { max: 1e9 } }, lpVariables: { x: { labor: 0, profit: 1 } } })
  assert('optimize 无界仍是有效结果（ok=true）', optUnbounded.ok === true && String(optUnbounded.result).includes('无界'), '')
  const data = await run({ operation: 'data', dataAction: 'put', payload: { a: 1 } })
  assert('★ data 空名 → invalid_argument（不再 internal）', data.ok === false && data.error?.type === 'invalid_argument', String(data.error?.type))
}
console.log('-- 接口 --')
{
  const r0 = await run({ operation: 'random', randomSeed: 'a', count: 0, integer: true })
  assert('★ random count:0 → 0 个', r0.ok === true && Array.isArray(r0.value?.values) && r0.value.values.length === 0, JSON.stringify(r0.value?.values))
  const auditS = await run({ operation: 'units_audit', claims: [{ name: 's', unit: 's' }] })
  assert('★ audit s → time（不再 conductance）', String(auditS.result).includes('time'), String(auditS.result).slice(0, 80))
  const auditKg = await run({ operation: 'units_audit', claims: [{ name: 'rho', unit: 'kg/m3' }] })
  assert('★ audit kg/m3 → mass/volume', String(auditKg.result).includes('mass/volume'), String(auditKg.result).slice(0, 80))
  const w1 = await run({ operation: 'world-map', mapSeed: 1, mapWidth: 36, mapHeight: 20, ascii: false })
  const w2 = await run({ operation: 'world-map', mapSeed: 2, mapWidth: 36, mapHeight: 20, ascii: false })
  assert('★ mapSeed 生效（1 与 2 结果不同）', /seed=1/.test(String(w1.result)) && /seed=2/.test(String(w2.result)), String(w1.result).match(/seed=\d/)?.[0] + '/' + String(w2.result).match(/seed=\d/)?.[0])
  const dist = await run({ operation: 'world-map', mapDistance: { from: { x: 0, y: 0 }, to: { x: 10, y: 10 } }, mapWidth: 36, mapHeight: 20, ascii: false })
  assert('★ mapDistance 进文本', String(dist.result).includes('两点距离'), '')
  const calc = await run({ operation: 'calc', expression: '1+1' })
  assert('★ facade calc 免 op（表达式）', calc.ok === true && String(calc.result).includes('2'), String(calc.result).slice(0, 40))
  const calcEq = await run({ operation: 'calc', equations: ['x+y=5', 'x-y=1'] })
  assert('★ facade calc 免 op（方程）', calcEq.ok === true && String(calcEq.result).includes('x = 3'), String(calcEq.result).slice(0, 40))
  const docExtract = await run({ operation: 'document', document: { action: 'extract', text: '第一段' } })
  assert('★ document extract 认 text', docExtract.ok === true && String(docExtract.result).includes('第一段'), String(docExtract.result).slice(0, 40))
  const docTables = await run({ operation: 'document', document: { action: 'tables', text: 'a\tb\n1\t2' } })
  assert('document tables 认 text（按制表符切）', docTables.ok === true && String(docTables.result).includes('纯文本表格'), '')
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }