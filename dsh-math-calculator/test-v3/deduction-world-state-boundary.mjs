/**
 * world_state 边界测试：非法输入、未知动作、文件层读坏不当空库。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-world-state-boundary-'))
process.env.DSH_MATH_CALC_HOME = home
const mod = await import(pathToFileURL(join(root, 'lib/features/deduction/world-state.js')).href)
const io = await import(pathToFileURL(join(root, 'lib/io/state-store.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
function throwsOf(fn) { try { fn(); return null } catch (error) { return error } }
const NOW = '2026-11-13T00:00:00.000Z'

console.log('-- 1. 输入校验 --')
{
  assert('无输入 → missing_params', throwsOf(() => mod.runWorldState(undefined, mod.emptyBook(), NOW))?.type === 'missing_params', '')
  assert('set 无条目 → missing_params', throwsOf(() => mod.runWorldState({ action: 'set' }, mod.emptyBook(), NOW))?.type === 'missing_params', '')
  assert('条目缺 id → invalid_argument', throwsOf(() => mod.runWorldState({ action: 'set', entry: { title: 'x' } }, mod.emptyBook(), NOW))?.type === 'invalid_argument', '')
  assert('★ id 含中文 → invalid_argument', throwsOf(() => mod.runWorldState({ action: 'set', entry: { id: '条目一', title: 'x' } }, mod.emptyBook(), NOW))?.type === 'invalid_argument', '')
  assert('id 超 40 字符 → invalid_argument', throwsOf(() => mod.runWorldState({ action: 'set', entry: { id: 'a'.repeat(41), title: 'x' } }, mod.emptyBook(), NOW))?.type === 'invalid_argument', '')
  assert('缺 title → invalid_argument', throwsOf(() => mod.runWorldState({ action: 'set', entry: { id: 'T1' } }, mod.emptyBook(), NOW))?.type === 'invalid_argument', '')
  assert('status 非法 → invalid_argument', throwsOf(() => mod.runWorldState({ action: 'set', entry: { id: 'T1', title: 'x', status: 'weird' } }, mod.emptyBook(), NOW))?.type === 'invalid_argument', '')
  assert('未知 action → unknown_argument', throwsOf(() => mod.runWorldState({ action: 'nuke' }, mod.emptyBook(), NOW))?.type === 'unknown_argument', '')
  assert('search 缺 query → missing_params', throwsOf(() => mod.runWorldState({ action: 'search' }, mod.emptyBook(), NOW))?.type === 'missing_params', '')
}

console.log('-- 2. 未知条目 --')
{
  assert('get 未知 id → unknown_symbol', throwsOf(() => mod.runWorldState({ action: 'get', id: 'NOPE' }, mod.emptyBook(), NOW))?.type === 'unknown_symbol', '')
  assert('deprecate 未知 id → unknown_symbol', throwsOf(() => mod.runWorldState({ action: 'deprecate', id: 'NOPE' }, mod.emptyBook(), NOW))?.type === 'unknown_symbol', '')
  let book = mod.emptyBook()
  book = mod.runWorldState({ action: 'set', entry: { id: 'T1', title: '标题够长', body: '正文' } }, book, NOW).book
  assert('deprecate 指向不存在的取代者 → unknown_symbol',
    throwsOf(() => mod.runWorldState({ action: 'deprecate', id: 'T1', supersededBy: 'T9' }, book, NOW))?.type === 'unknown_symbol', '')
}

console.log('-- 3. 废弃但无后继 --')
{
  let book = mod.emptyBook()
  book = mod.runWorldState({ action: 'set', entry: { id: 'T1', title: '标题够长', body: '正文' } }, book, NOW).book
  const out = mod.runWorldState({ action: 'deprecate', id: 'T1' }, book, NOW)
  assert('★ 不报错，但提示演化史会断', out.result.includes('演化史会断'), out.result)
}

console.log('-- 4. ★ 纯函数：不改原库 --')
{
  const original = mod.emptyBook()
  const result = mod.runWorldState({ action: 'set', entry: { id: 'T1', title: '标题够长', body: '正文' } }, original, NOW)
  assert('原库仍为空', original.entries.length === 0, String(original.entries.length))
  assert('返回的新库有 1 条', result.book.entries.length === 1, String(result.book.entries.length))
}

console.log('-- 5. 文件层：读坏不当空库 --')
{
  const dir = join(home, 'states')
  mkdirSync(dir, { recursive: true })
  assert('不存在的库 → 空库', io.loadStateBook('fresh-ws', dir).entries.length === 0, '')
  const book = mod.runWorldState({ action: 'set', entry: { id: 'T1', title: '标题够长', body: '正文' } }, mod.emptyBook(), NOW).book
  io.saveStateBook('ws1', book, dir)
  const loaded = io.loadStateBook('ws1', dir)
  assert('写后读回 1 条', loaded.entries.length === 1, String(loaded.entries.length))
  assert('工作区列表含 ws1', io.listStateWorkspaces(dir).includes('ws1'), JSON.stringify(io.listStateWorkspaces(dir)))

  /** 设定库已并入数据层：坏文件场景要先清空数据层，才会回落到读文件。 */
  const datastore = join(process.env.DSH_MATH_CALC_HOME, 'workspaces', '.artifacts', 'datastore')
  rmSync(datastore, { recursive: true, force: true })
  writeFileSync(io.stateFilePath('broken', dir), '{ 这不是 JSON', 'utf8')
  const broken = throwsOf(() => io.loadStateBook('broken', dir))
  assert('★ 读坏文件 → invalid_argument（不当空库）', broken?.type === 'invalid_argument', broken?.type)
  assert('★ hint 说清「不是没有设定」', String(broken?.hint ?? '').includes('不是「没有设定」'), String(broken?.hint ?? '').slice(0, 60))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
