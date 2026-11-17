/**
 * 功能合并：旧名转发到主入口（单向，不递归）。
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-dedupe-'))
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
console.log('-- 1. world profile:full 与 world-build 等价 --')
{
  const full = await run({ operation: 'world', profile: 'full', planetMass: 1.2, planetRadius: 1.05 })
  const alias = await run({ operation: 'world-build', planetMass: 1.2, planetRadius: 1.05 })
  assert('★ profile:full 含完整画像', full.ok === true && full.result.includes('完整世界画像'), full.result.slice(0, 60))
  assert('★ world-build 转发后同样含画像', alias.ok === true && alias.result.includes('完整世界画像'), alias.result.slice(0, 60))
  assert('两者瓶颈一致', full.value.build.bottleneck === alias.value.build.bottleneck, '')
}
console.log('-- 2. feasibility quick 与 quick_feasible 等价 --')
{
  const claim = { claim: '生物体型 500 吨能存在吗' }
  const quick = await run({ operation: 'feasibility', quick: true, quickFeasible: claim })
  const alias = await run({ operation: 'quick_feasible', quickFeasible: claim })
  assert('★ 两者都返回可行性速判', quick.ok === true && alias.ok === true && quick.result.includes('可行性速判'), quick.result.slice(0, 40))
}
console.log('-- 3. formulas query:table 与 formula-table 等价 --')
{
  const t1 = await run({ operation: 'formulas', query: 'table' })
  const t2 = await run({ operation: 'formula-table' })
  assert('★ 两条路径都可读表（不递归）', t1.ok === true && t2.ok === true, JSON.stringify({ a: t1.error?.type, b: t2.error?.type }))
  const formulaCount = String(JSON.parse(readFileSync(join(root, 'src/data/formulas.json'), 'utf8')).length)
  assert('公式总数一致', t1.result.includes(formulaCount) && t2.result.includes(formulaCount), t1.result.slice(0, 60))
}
console.log('-- 4. 设定库已并入数据层 --')
{
  const set = await run({ operation: 'world_state', world_state: { action: 'set', entry: { id: 'gravity', title: '重力', body: '1.2g', status: 'active', tags: ['物理'] } } })
  assert('★ 设定库写入成功', set.ok === true, set.result.slice(0, 40))
  const data = await run({ operation: 'data', dataAction: 'query', kind: 'setting' })
  assert('★ 数据层能查到 setting 记录（单一数据源）', data.ok === true && data.result.includes('setting:gravity'), data.result.slice(0, 80))
  const list = await run({ operation: 'world_state', world_state: { action: 'list' } })
  assert('设定库 list 仍可用', list.ok === true && list.result.includes('gravity'), '') 
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
