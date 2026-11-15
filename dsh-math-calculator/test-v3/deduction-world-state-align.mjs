/**
 * world_state 对齐测试：设定库的增删查改与废弃链。
 *
 * 老接口动作：set / check / get / list（缺省）。新实现补齐 deprecate / search。
 * 核心判据是「废弃链而不是删除」：改设定时标 deprecated 并指向新条目，
 * 留下完整演化史——这是压缩总结永远做不到的。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-world-state-align-'))
const mod = await import(pathToFileURL(join(root, 'lib/features/deduction/world-state.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const NOW = '2026-11-13T00:00:00.000Z'

console.log('-- 1. set：新建与更新 --')
{
  const first = mod.runWorldState({
    action: 'set',
    entries: [
      { id: 'T01', title: '北境有铁矿', body: '北境山脉中段有露天铁矿，品位约 35%。', tags: ['地理', '资源'] },
      { id: 'T02', title: '铁器技术已成熟', body: '本地冶铁温度可达 1200°C。', tags: ['技术'] },
    ],
  }, mod.emptyBook(), NOW)
  assert('新建 2 条', first.value.created.length === 2, JSON.stringify(first.value.created))
  assert('库内 2 条', first.book.entries.length === 2, String(first.book.entries.length))
  assert('createdAt 用注入时间', first.book.entries[0].createdAt === NOW, first.book.entries[0].createdAt)
  assert('result 报「已更新」', first.result.includes('✓ 设定库已更新'), '')

  const second = mod.runWorldState({
    action: 'set',
    entry: { id: 'T01', title: '北境有铁矿（修订）', body: '品位修正为 28%。' },
  }, first.book, '2026-11-14T00:00:00.000Z')
  assert('更新既有条目', second.value.updated.length === 1 && second.value.created.length === 0, JSON.stringify(second.value))
  assert('更新保留 createdAt', second.book.entries[0].createdAt === NOW, second.book.entries[0].createdAt)
  assert('★ 更新改了 updatedAt', second.book.entries[0].updatedAt === '2026-11-14T00:00:00.000Z', second.book.entries[0].updatedAt)
  assert('库内仍 2 条（不重复插入）', second.book.entries.length === 2, String(second.book.entries.length))
}

console.log('-- 2. ★ 废弃链 --')
{
  let book = mod.emptyBook()
  book = mod.runWorldState({ action: 'set', entries: [{ id: 'T01', title: '旧口径', body: '人口 920 亿。' }] }, book, NOW).book
  book = mod.runWorldState({ action: 'set', entries: [{ id: 'T03', title: '新口径', body: '人口 8 亿。' }] }, book, NOW).book
  const deprecated = mod.runWorldState({ action: 'deprecate', id: 'T01', supersededBy: 'T03' }, book, NOW)
  const old = deprecated.book.entries.find((entry) => entry.id === 'T01')
  const replacement = deprecated.book.entries.find((entry) => entry.id === 'T03')
  assert('★ 旧条目 status=deprecated', old.status === 'deprecated', old.status)
  assert('★ 新条目 supersedes 含旧 id', replacement.supersedes.includes('T01'), JSON.stringify(replacement.supersedes))
  assert('result 说明取代关系', deprecated.result.includes('取代它的条目'), deprecated.result)
}

console.log('-- 3. get / list / search --')
{
  let book = mod.emptyBook()
  book = mod.runWorldState({ action: 'set', entries: [
    { id: 'T01', title: '北境有铁矿', body: '品位 28%。', tags: ['地理'] },
    { id: 'T02', title: '人口 8 亿', body: '集中在河谷。', tags: ['人口'] },
  ] }, book, NOW).book

  const got = mod.runWorldState({ action: 'get', id: 'T01' }, book, NOW)
  assert('get 返回正文', got.result.includes('品位 28%'), '')
  assert('get 返回原文对象', got.value.id === 'T01', got.value.id)

  const list = mod.runWorldState({ action: 'list' }, book, NOW)
  assert('list 列 2 条', list.value.entries.length === 2, String(list.value.entries.length))
  assert('list 显示字数', list.result.includes('字'), '')

  const filtered = mod.runWorldState({ action: 'list', tags: ['人口'] }, book, NOW)
  assert('★ 标签过滤', filtered.value.entries.length === 1 && filtered.value.entries[0].id === 'T02', JSON.stringify(filtered.value.entries.map((e) => e.id)))

  const searched = mod.runWorldState({ action: 'search', query: '铁矿' }, book, NOW)
  assert('★ 检索命中标题', searched.value.hits.length === 1 && searched.value.hits[0].id === 'T01', String(searched.value.hits.length))
  const bodyHit = mod.runWorldState({ action: 'search', query: '河谷' }, book, NOW)
  assert('检索也搜正文', bodyHit.value.hits.length === 1, String(bodyHit.value.hits.length))
}

console.log('-- 4. check：结构问题 --')
{
  const book = {
    version: 1,
    entries: [
      { id: 'A', title: '条目 A 的标题', body: '正文 A', status: 'active', tags: [], supersedes: ['不存在的条目'], createdAt: NOW, updatedAt: NOW },
      { id: 'B', title: '条目 B 的标题', body: '', status: 'deprecated', tags: [], supersedes: [], createdAt: NOW, updatedAt: NOW },
      { id: 'C', title: '短', body: '正文', status: 'active', tags: [], supersedes: [], createdAt: NOW, updatedAt: NOW },
    ],
  }
  const out = mod.runWorldState({ action: 'check' }, book, NOW)
  const kinds = out.value.findings.map((f) => f.kind)
  assert('★ 检出悬空 supersedes', kinds.includes('dangling_supersede'), JSON.stringify(kinds))
  assert('★ 检出空正文', kinds.includes('empty_body'), JSON.stringify(kinds))
  assert('★ 检出废弃但无后继', kinds.includes('deprecated_without_successor'), JSON.stringify(kinds))
  assert('★ 检出过短标题', kinds.includes('terse_title'), JSON.stringify(kinds))
  assert('notice 汇总问题数', (out.notice ?? '').includes('结构问题'), String(out.notice))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
