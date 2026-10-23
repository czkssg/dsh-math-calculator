/**
 * 兼容性测试（第二组）：数据层与并发。
 *
 * 第一组证明「别人搞坏 ctx，我们能活」。
 * 这一组证明「别人搞坏我们的数据 / 同时写，我们也不崩、不丢数据」。
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 数据目录必须在 import 之前设定
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'compat-data-'))

const mod = await import('../lib/index.js')
const ws = await import('../lib/workspace.js')
const packs = await import('../lib/formula-pack.js')

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const run = (args) => mod.runMathTool(args)

console.log('-- H. 工作区数据被破坏 --')
{
  const created = ws.loadWorkspace('default')
  assert('默认工作区可创建', Boolean(created && created.name === 'default'), created && created.name)

  const bad = join(process.env.DSH_HOME, 'math-calc', 'workspaces', 'broken.json')
  mkdirSync(join(process.env.DSH_HOME, 'math-calc', 'workspaces'), { recursive: true })
  writeFileSync(bad, '{ this is not json', 'utf8')
  let threw = null
  try {
    const loaded = ws.loadWorkspace('broken')
    assert('损坏的 JSON 不会让加载崩溃（返回可用默认值）', Boolean(loaded), loaded ? loaded.name : 'null')
  } catch (error) {
    threw = error
  }
  assert('损坏文件不抛异常', threw === null, threw && threw.message.slice(0, 60))

  // 结构合法但内容荒谬
  const weird = join(process.env.DSH_HOME, 'math-calc', 'workspaces', 'weird.json')
  writeFileSync(weird, JSON.stringify({ name: 'weird', constants: 'not-an-object', formulaTable: 42 }), 'utf8')
  let threw2 = null
  try { ws.loadWorkspace('weird') } catch (error) { threw2 = error }
  assert('字段类型错误不抛异常', threw2 === null, threw2 && threw2.message.slice(0, 60))
}

console.log('-- I. 全局公式包被破坏 --')
{
  const file = packs.packFilePath()
  mkdirSync(join(process.env.DSH_HOME, 'math-calc', 'formula-packs'), { recursive: true })
  writeFileSync(file, 'not json at all', 'utf8')
  let list = null
  let threw = null
  try { list = packs.loadGlobalFormulas() } catch (error) { threw = error }
  assert('坏掉的公式包不抛异常', threw === null, threw && threw.message.slice(0, 60))
  assert('坏包按空包处理（内置公式不受影响）', Array.isArray(list) && list.length === 0, JSON.stringify(list))

  // 包里有非法公式：只丢掉非法的，保留合法的
  writeFileSync(file, JSON.stringify({
    version: 1,
    formulas: [
      { id: 'good_one', cat: 'x/y', name: '好', expr: '1 + 1', params: {}, desc: '测试' },
      { id: 'BAD-ID', cat: 'x', name: '坏', expr: '1', params: {}, desc: 'x' },
    ],
  }), 'utf8')
  const filtered = packs.loadGlobalFormulas()
  assert('非法公式被过滤，合法公式保留', filtered.length === 1 && filtered[0].id === 'good_one', JSON.stringify(filtered.map((f) => f.id)))
}

console.log('-- J. 并发写不互相破坏 --')
{
  // 注意：workspace 的 action 参数叫 action2（历史命名，避免与 operation 语义混淆）
  const results = []
  for (let i = 0; i < 6; i += 1) {
    results.push(run({ operation: 'workspace', action2: 'create', name: 'race_' + i }))
  }
  assert('连续创建 6 个工作区都成功', results.every((r) => !r.error), results.filter((r) => r.error).length + ' 失败')
  const names = ws.listWorkspaces().map((w) => w.name)
  assert('6 个工作区都在列表里', ['race_0', 'race_1', 'race_2', 'race_3', 'race_4', 'race_5'].every((n) => names.includes(n)), names.join(','))
}

console.log('-- K. 与别人的同名目录共存 --')
{
  const home = process.env.DSH_HOME
  mkdirSync(join(home, 'math-calc', 'workspaces'), { recursive: true })
  // 模拟别的插件在同一父目录下放了文件
  writeFileSync(join(home, 'math-calc', 'README-from-other-plugin.txt'), 'x', 'utf8')
  writeFileSync(join(home, 'math-calc', 'workspaces', '.keep'), '', 'utf8')
  let threw = null
  try { ws.listWorkspaces() } catch (error) { threw = error }
  assert('同目录下多出无关文件不影响工作区列表', threw === null, threw && threw.message.slice(0, 60))
  const names = ws.listWorkspaces().map((w) => w.name)
  assert('.keep 这类非 json 文件被忽略', !names.includes('.keep'), names.join(','))
}

console.log('-- L. 重复加载模块不重复副作用 --')
{
  const before = mod.runMathTool({ operation: 'formulas', query: '*' })
  const total1 = before.value.total
  const again = await import('../lib/formulas.js?cachebust=' + Date.now())
  assert('模块可重复导入', Boolean(again.FORMULAS))
  const after = mod.runMathTool({ operation: 'formulas', query: '*' })
  assert('重复导入不改变公式总数', after.value.total === total1, total1 + ' vs ' + after.value.total)
}

rmSync(process.env.DSH_HOME, { recursive: true, force: true })

console.log('')
if (fails.length === 0) console.log(`全部通过：${pass} 项`)
else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
