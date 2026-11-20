/**
 * mathEngine 五组扩展：constants / worldState / data / entities / models。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-ext2-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { createMathEngineService } = await import(pathToFileURL(join(root, 'lib/service.js')).href)
const service = createMathEngineService()
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
console.log('-- 1. 自述 --')
{
  const describe = service.describe()
  assert('★ methods 22 个', describe.methods.length === 22 && describe.methods.includes('constants') && describe.methods.includes('worldState') && describe.methods.includes('data') && describe.methods.includes('entities') && describe.methods.includes('models'), JSON.stringify(describe.methods))
}
console.log('-- 2. constants --')
{
  const all = service.constants()
  assert('★ 常量表 ≥ 40 条', all.ok === true && Array.isArray(all.value?.constants) && all.value.constants.length >= 40, String(all.value?.constants?.length))
  assert('c 在表里', all.value?.constants?.some((item) => item.name === 'c' && item.standard === 299792458), '')
}
console.log('-- 3. worldState --')
{
  service.registerUnits('w', [{ name: 'zunit', factor: 1 }])
  const set = service.worldState('set', { namespace: 'w', key: '首都', value: '北境城' })
  assert('★ set 写入', set.ok === true && set.value?.value === '北境城', JSON.stringify(set))
  const get = service.worldState('get', { namespace: 'w', key: '首都' })
  assert('★ get 读回', get.ok === true && get.value?.value === '北境城', JSON.stringify(get))
  const list = service.worldState('list', { namespace: 'w' })
  assert('list 有 1 条', list.ok === true && list.value?.entries?.length === 1, JSON.stringify(list.value))
  const del = service.worldState('delete', { namespace: 'w', key: '首都' })
  assert('delete 移除', del.ok === true && del.value?.removed === true, '')
  const after = service.worldState('get', { namespace: 'w', key: '首都' })
  assert('删除后查不到', after.ok === false && after.error?.kind === 'capability', '')
  const bad = service.worldState('get', { namespace: 'nope', key: 'x' })
  assert('未知命名空间 → capability', bad.ok === false && bad.error?.kind === 'capability', '')
}
console.log('-- 4. data --')
{
  const put = service.data('put', { kind: 'note', name: '服务数据', payload: { a: 1 } })
  assert('★ put 成功', put.ok === true, JSON.stringify(put.error))
  const get = service.data('get', { name: '服务数据' })
  assert('★ get 读回', get.ok === true && JSON.stringify(get.value).includes('服务数据'), JSON.stringify(get.value).slice(0, 100))
  const query = service.data('query', { kind: 'note', nameContains: '服务' })
  assert('query 可查', query.ok === true && JSON.stringify(query.value).includes('服务数据'), '')
}
console.log('-- 5. entities --')
{
  const reg = service.entities('register', { namespace: 'w', items: [{ name: '蒸汽机甲', fields: { armor: 'steel' } }, { name: '精灵', note: '长耳' }] })
  assert('★ 注册 2 个实体', reg.ok === true && reg.value?.registered?.length === 2, JSON.stringify(reg))
  const list = service.entities('list', { namespace: 'w' })
  assert('list 返回 2 个', list.ok === true && list.value?.entities?.length === 2, JSON.stringify(list.value))
  const dup = service.entities('register', { namespace: 'w', items: [{ name: '精灵' }] })
  assert('重名被拒绝', dup.ok === false && dup.error?.kind === 'input', JSON.stringify(dup.error))
  const undone = service.entities('unregister', { namespace: 'w' })
  assert('注销实体', undone.ok === true && undone.value?.removed === true, '')
}
console.log('-- 6. models --')
{
  const save = service.models('save', { namespace: 'w', name: '城堡', data: { nodes: ['A'], edges: [] } })
  assert('★ save 模型', save.ok === true && save.value?.saved === true, JSON.stringify(save))
  const load = service.models('load', { namespace: 'w', name: '城堡' })
  assert('★ load 读回', load.ok === true && JSON.stringify(load.value?.data) === '{"nodes":["A"],"edges":[]}', JSON.stringify(load.value))
  const list = service.models('list', { namespace: 'w' })
  assert('list 有 1 个', list.ok === true && list.value?.names?.length === 1, '')
  const del = service.models('delete', { namespace: 'w', name: '城堡' })
  assert('delete 移除', del.ok === true && del.value?.removed === true, '')
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
