/**
 * 数据层进阶：全文检索 / 迁移 / 自动入库（saveAs）。
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-data2-'))
process.env.DSH_MATH_CALC_HOME = home
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

console.log('-- 1. 全文检索（minisearch）--')
{
  await run({ operation: 'data', dataAction: 'put', kind: 'model', name: '北境军团', tags: ['军事'] })
  await run({ operation: 'data', dataAction: 'put', kind: 'world', name: '冰原世界', tags: ['世界'] })
  const hit = await run({ operation: 'data', dataAction: 'search', query: '冰原' })
  assert('★ 检索命中 world:冰原世界', hit.ok === true && hit.result.includes('冰原世界'), hit.result.slice(0, 80))
  const byTag = await run({ operation: 'data', dataAction: 'search', query: '军事' })
  assert('★ 按标签词命中', byTag.ok === true && byTag.result.includes('北境军团'), byTag.result.slice(0, 80))
  const none = await run({ operation: 'data', dataAction: 'search', query: '不存在zzz' })
  assert('无命中 → 0 条（不报错）', none.ok === true && none.result.includes('0 条'), '')
}

console.log('-- 2. 迁移旧数据 --')
{
  const wsArt = join(home, 'workspaces', '.artifacts')
  mkdirSync(wsArt, { recursive: true })
  writeFileSync(join(wsArt, 'workspace-state.json'), JSON.stringify({ variables: { speed: 10 }, constants: { g: 9.8 }, topologyModels: { 北境: { nodes: [] } } }))
  const out = await run({ operation: 'data', dataAction: 'migrate' })
  assert('★ 迁移 workspace 3 条', out.ok === true && out.result.includes('workspace 3 条'), out.result)
  const again = await run({ operation: 'data', dataAction: 'migrate' })
  assert('★ 幂等：再跑全部跳过', again.ok === true && again.result.includes('跳过 3 条'), again.result)
  const vars = await run({ operation: 'data', dataAction: 'query', kind: 'var' })
  assert('迁移后的变量可查', vars.result.includes('var:speed'), '')
}

console.log('-- 3. 自动入库（saveAs）--')
{
  const out = await run({ operation: 'world', planetMass: 1.5, planetRadius: 1.2, brief: true, saveAs: '木星级世界' })
  assert('★ world + saveAs 正常返回', out.ok === true, '')
  const found = await run({ operation: 'data', dataAction: 'get', id: 'world:木星级世界' })
  assert('★ 结果已入库（world:木星级世界）', found.ok === true && found.result.includes('木星级世界'), found.result.slice(0, 80))
  const conf = await run({ operation: 'conflict', actors: [{ id: 'A', wealth: 100 }, { id: 'B', wealth: 100 }], edges: [{ from: 'A', to: 'B' }], steps: 20, seed: 1, saveAs: '两强之争' })
  assert('conflict + saveAs 可用', conf.ok === true, '')
  const stored = await run({ operation: 'data', dataAction: 'get', id: 'conflict:两强之争' })
  assert('★ 冲突结果入库', stored.ok === true && stored.result.includes('两强之争'), '')
  const bad = await run({ operation: 'formula', saveAs: '不该写' })
  assert('失败结果不入库', bad.ok === false, '')
  const none = await run({ operation: 'data', dataAction: 'get', id: 'note:不该写' })
  assert('失败时确实没写', none.ok === true && none.result.includes('没有这条记录'), '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
