/**
 * 删除与清理机制测试。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempHome = mkdtempSync(join(tmpdir(), 'dsh-clean-test-'))
process.env.DSH_MATH_CALC_HOME = tempHome

const mod = await import('../lib/index.js')
const exec = (a) => mod.runMathTool(a)

let pass = 0
const fails = []
const ok = (n, d = '') => { pass++; console.log(`  ok   ${n}${d ? ': ' + d : ''}`) }
const bad = (n, d) => { fails.push({ n, d }); console.log(`  FAIL ${n}\n         ${d}`) }
const assert = (n, c, d = '') => (c ? ok(n, d) : bad(n, d))
const ws = (action2, extra = {}) => exec({ operation: 'workspace', action2, ...extra })

console.log('— 1. 删除单个地点 —')
{
  ws('create', { workspace: 'ws1' })
  ws('add-terrain', { terrainName: '港口', terrain: { kind: 'coastal' } })
  ws('add-terrain', { terrainName: '荒漠', terrain: { kind: 'desert' } })

  const before = ws('show', { workspace: 'ws1' })
  assert('两个地点存在', before.value.workspace.terrains.length === 2)

  const del = ws('remove-terrain', { workspace: 'ws1', terrainName: '港口' })
  assert('删除成功', del.ok && del.result.includes('已从工作区'), del.result)

  const after = ws('show', { workspace: 'ws1' })
  assert('剩一个地点', after.value.workspace.terrains.length === 1, String(after.value.workspace.terrains.length))
  assert('删的是港口', !after.result.includes('港口'), after.result.includes('港口') ? '还在' : '已删')

  const missing = ws('remove-terrain', { workspace: 'ws1', terrainName: '不存在' })
  assert('删不存在的返回友好提示', missing.ok && missing.result.includes('没有名为'), missing.result)
}

console.log('— 2. 删除单个变量 —')
{
  ws('set', { workspace: 'ws1', workspaceVariables: { 甲: 1, 乙: 2, 丙: 3 } })
  const del = ws('remove-variable', { workspace: 'ws1', variableName: '乙' })
  assert('删除变量成功', del.ok && del.result.includes('已从工作区'), del.result)

  const show = ws('show', { workspace: 'ws1' })
  assert('乙 已删除', !show.result.includes('乙='), show.result)
  assert('甲 丙 保留', show.result.includes('甲=') && show.result.includes('丙='))
}

console.log('— 3. 重置单个常数 —')
{
  exec({ operation: 'constants', constants: { c: 1.5e8, G: 1.3e-10 } })
  let show = ws('show', { workspace: 'ws1' })
  assert('两个常数被改', show.value.workspace.constants.c && show.value.workspace.constants.G)

  const resetOne = ws('reset-constant', { workspace: 'ws1', constantName: 'c' })
  assert('重置 c 成功', resetOne.ok && resetOne.result.includes('重置为现实值'), resetOne.result)

  show = ws('show', { workspace: 'ws1' })
  assert('c 已从改动列表消失', !show.result.includes(' c '), show.result.slice(0, 200))
  assert('G 仍在', show.result.includes(' G '), show.result.slice(0, 200))
}

console.log('— 4. 存储统计 —')
{
  ws('create', { workspace: 'ws2' })
  const stats = ws('stats')
  assert('统计可用', stats.ok, stats.error?.message)
  assert('显示工作区数', stats.value.workspaceCount >= 2, String(stats.value.workspaceCount))
  assert('显示字节数', typeof stats.value.totalBytes === 'number', String(stats.value.totalBytes))
  assert('显示目录', typeof stats.value.directory === 'string', stats.value.directory)
  assert('标记空工作区', stats.value.workspaces.some((w) => w.empty), JSON.stringify(stats.value.workspaces.map((w) => `${w.name}:${w.empty}`)))
}

console.log('— 5. 清理：空工作区 —')
{
  // 制造几个空壳
  ws('create', { workspace: 'empty1' })
  ws('create', { workspace: 'empty2' })

  const preview = ws('cleanup', { dryRun: true })
  assert('预览不真删', preview.ok && preview.result.includes('未真删'), preview.result.split('\n')[0])
  assert('预览列出空工作区', preview.value.emptyWorkspacesDeleted.length >= 2,
    JSON.stringify(preview.value.emptyWorkspacesDeleted))

  // 真删
  const done = ws('cleanup')
  assert('实际清理', done.ok, done.error?.message)
  assert('删掉了空壳', done.value.emptyWorkspacesDeleted.length >= 2)
  assert('报告释放空间', typeof done.value.bytesFreed === 'number')

  const list = ws('list')
  assert('空壳已消失', !list.value.workspaces.some((w) => w.name === 'empty1'),
    JSON.stringify(list.value.workspaces.map((w) => w.name)))
}

console.log('— 6. 清理：临时前缀 —')
{
  ws('create', { workspace: 'test-abc' })
  ws('set', { workspace: 'test-abc', workspaceVariables: { x: 1 } }) // 有数据
  ws('create', { workspace: 'tmp-xyz' })
  ws('set', { workspace: 'tmp-xyz', workspaceVariables: { y: 2 } })

  const done = ws('cleanup', { olderThanDays: undefined })
  assert('临时工作区被清理', done.value.tempWorkspacesDeleted.length >= 2,
    JSON.stringify(done.value.tempWorkspacesDeleted))
}

console.log('— 7. 清理：保护 default 与 keep —')
{
  ws('create', { workspace: 'keepme' })
  ws('add-terrain', { terrainName: '保留地', terrain: { kind: 'plain' } })

  const done = ws('cleanup', { keep: ['keepme'] })
  assert('keep 列表被保护', done.value.skipped.some((s) => s.includes('keepme')),
    JSON.stringify(done.value.skipped))

  const show = ws('show', { workspace: 'keepme' })
  assert('keepme 还在', show.ok)
}

console.log('— 8. 清理：按天数 —')
{
  ws('create', { workspace: 'old-ws' })
  ws('set', { workspace: 'old-ws', workspaceVariables: { z: 1 } })
  // 所有工作区都是刚创建的，用 0 天阈值应能删掉
  const done = ws('cleanup', { emptyOnly: false, olderThanDays: -1 })
  assert('按天数清理可用', done.ok, done.error?.message)
}

console.log('— 9. 有数据的工作区不该被误删 —')
{
  ws('create', { workspace: 'important' })
  ws('set', {
    workspace: 'important',
    world: { planetRadius: 1.5 },
    workspaceVariables: { 关键数据: 999 },
  })
  ws('add-terrain', { terrainName: '首都', terrain: { kind: 'plain' } })

  const done = ws('cleanup') // 默认只删空壳
  assert('有数据的不被删', !done.value.emptyWorkspacesDeleted.includes('important'),
    JSON.stringify(done.value.emptyWorkspacesDeleted))

  const show = ws('show', { workspace: 'important' })
  assert('数据完好', show.value.workspace.variables['关键数据'] === 999,
    String(show.value.workspace.variables['关键数据']))
  assert('地点完好', show.result.includes('首都'))
}

console.log('— 10. 删除整个工作区 —')
{
  const del = ws('delete', { workspace: 'important' })
  assert('删除工作区', del.ok && del.result.includes('已删除'), del.result)
  const list = ws('list')
  assert('已从列表消失', !list.value.workspaces.some((w) => w.name === 'important'))
}

console.log('— 11. JSON 安全 —')
{
  for (const action of ['stats', 'list']) {
    const r = ws(action)
    let safe = true
    try { JSON.stringify(r) } catch { safe = false }
    assert(`${action} 可序列化`, safe)
  }
  const preview = ws('cleanup', { dryRun: true })
  let safe = true
  try { JSON.stringify(preview) } catch { safe = false }
  assert('cleanup 可序列化', safe)
}

rmSync(tempHome, { recursive: true, force: true })

console.log('')
console.log(`通过 ${pass}，失败 ${fails.length}`)
if (fails.length > 0) {
  for (const f of fails) console.log(`  - ${f.n}: ${f.d}`)
  process.exitCode = 1
}
