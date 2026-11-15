/**
 * 统一数据层（data op）：记录/版本/查询/血缘/统计/导入导出。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-datastore-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const store = await import(pathToFileURL(join(root, 'lib/features/data-store/store.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 写入与版本 --')
{
  const v1 = store.putRecord({ kind: 'var', name: 'tempo', tags: ['参数'], payload: { value: 1.2 } })
  assert('★ 首次写入 v1', v1.version === 1 && v1.id === 'var:tempo', JSON.stringify(v1.id))
  const v2 = store.putRecord({ kind: 'var', name: 'tempo', payload: { value: 1.3 } })
  assert('★ 同名再写 → v2（不是新记录）', v2.version === 2 && store.readRecords().size === 1, String(v2.version))
  assert('payload 已更新', JSON.stringify(v2.payload) === '{"value":1.3}', JSON.stringify(v2.payload))
}

console.log('-- 2. 查询 --')
{
  store.putRecord({ kind: 'model', name: '北境军', tags: ['军事'], refs: ['var:tempo'] })
  store.putRecord({ kind: 'note', name: '待定', tags: ['待办'] })
  assert('★ 按 kind 查询', store.queryRecords({ kind: 'model' }).length === 1, '')
  assert('★ 按 tag 查询', store.queryRecords({ tag: '军事' }).length === 1, '')
  assert('★ 按名称子串', store.queryRecords({ nameContains: '北境' }).length === 1, '')
  assert('按引用查（谁引用 tempo）', store.queryRecords({ refsTo: 'var:tempo' }).length === 1, '')
}

console.log('-- 3. 血缘 --')
{
  const lin = store.lineage('model:北境军')
  assert('★ 上游 = var:tempo', lin.upstream.length === 1 && lin.upstream[0].id === 'var:tempo', JSON.stringify(lin.upstream.map((r) => r.id)))
  const tempo = store.lineage('var:tempo')
  assert('★ 下游 = model:北境军', tempo.downstream.some((r) => r.id === 'model:北境军'), JSON.stringify(tempo.downstream.map((r) => r.id)))
}

console.log('-- 4. 统计与导入导出 --')
{
  const stats = store.storeStats()
  assert('★ 三类记录', stats.total === 3 && stats.byKind.model === 1, JSON.stringify(stats.byKind))
  const json = store.exportRecords()
  assert('★ 导出是 JSON 数组', Array.isArray(JSON.parse(json)), '')
  assert('导入同版本 → 不重复写', store.importRecords(json) === 0, '')
  const newRecords = [{ id: 'constant:g', kind: 'constant', name: 'g', tags: [], refs: [], version: 1, payload: { value: 9.8 }, createdAt: 'x', updatedAt: 'x' }]
  assert('★ 导入新记录 → 1 条', store.importRecords(JSON.stringify(newRecords)) === 1, '')
}

console.log('-- 5. 经 tool --')
{
  const put = await run({ operation: 'data', dataAction: 'put', kind: 'world', name: '冰原', tags: ['世界'], payload: { gravity: 1.2 } })
  assert('★ data:put', put.ok === true && put.result.includes('已写入'), put.result.slice(0, 40))
  const query = await run({ operation: 'data', dataAction: 'query', kind: 'world' })
  assert('★ data:query', query.ok === true && query.result.includes('world:冰原'), query.result.slice(0, 80))
  const lin = await run({ operation: 'data', dataAction: 'lineage', id: 'model:北境军' })
  assert('★ data:lineage', lin.ok === true && lin.result.includes('上游'), lin.result.slice(0, 60))
  const stats = await run({ operation: 'data', dataAction: 'stats' })
  assert('★ data:stats', stats.ok === true && stats.result.includes('数据层统计'), '')
  const get = await run({ operation: 'data', dataAction: 'get', id: 'var:tempo' })
  assert('★ data:get', get.ok === true && get.result.includes('var:tempo'), '')
  const missing = await run({ operation: 'data', dataAction: 'get', id: 'var:nope' })
  assert('取不存在的 → 明确说没有（不报错）', missing.ok === true && missing.result.includes('没有这条记录'), '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
