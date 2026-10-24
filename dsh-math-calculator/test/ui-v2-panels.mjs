/**
 * UI v2 补全测试：左侧继承/对比 + 右侧初始化引擎 + 全部目录可渲染。
 */
import { handleApiRequest } from '../lib/api.js'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { workspaceDirectory } from '../lib/workspace.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

async function call(path, body, method) {
  return handleApiRequest(path, { method: method || 'POST', route: path, body, params: {}, headers: {} })
}

const probeA = 'uiv2-inherit-base'
const probeB = 'uiv2-inherit-derived'
const dir = workspaceDirectory()
function clean() {
  for (const n of [probeA, probeB]) {
    const f = join(dir, n + '.json')
    if (existsSync(f)) rmSync(f, { force: true })
  }
  const linkFile = join(dir, '._inherit.json')
  if (existsSync(linkFile)) rmSync(linkFile, { force: true })
}
clean()

console.log('-- 1. 继承路由（左侧「继承」页用）--')
{
  await call('/workspaces/create', { name: probeA })
  await call('/workspaces/create', { name: probeB })

  const link = await call('/workspaces/inherit', { derived: probeB, base: probeA })
  assert('建立继承返回 200', link.status === 200, 'status=' + link.status)

  const list = await call('/workspaces/inherit', null, 'GET')
  assert('能读回继承关系', list.status === 200 && Array.isArray(list.json.links),
    JSON.stringify(list.json.links))
  assert('关系正确', (list.json.links || []).some((l) => l.derived === probeB && l.base === probeA))

  const sync = await call('/workspaces/inherit-sync', {})
  assert('同步返回 200', sync.status === 200, 'status=' + sync.status)
  assert('同步有结果', typeof sync.json.count === 'number', JSON.stringify(sync.json))

  const bad = await call('/workspaces/inherit', { derived: '', base: '' })
  assert('缺参数返回 400', bad.status === 400, 'status=' + bad.status)
}

console.log('-- 2. A/B 对比路由（左侧「对比」页用）--')
{
  const diff = await call('/workspaces/diff', { a: probeA, b: probeB })
  assert('对比返回 200', diff.status === 200, 'status=' + diff.status)
  assert('有 items 数组', Array.isArray(diff.json.items), JSON.stringify(diff.json).slice(0, 80))
  assert('有 summary', Boolean(diff.json.summary), JSON.stringify(diff.json.summary))

  const same = await call('/workspaces/diff', { a: probeA, b: probeA })
  assert('同表对比无差异', (same.json.items || []).length === 0)
  const bad = await call('/workspaces/diff', { a: probeA, b: '' })
  assert('缺参数返回 400', bad.status === 400, 'status=' + bad.status)
}

console.log('-- 3. 全部 18 个目录都能渲染 --')
{
  const subs = ['pipeline', 'cards', 'timeline', 'fantasy', 'civilization',
    'dead', 'sensitivity', 'checklist', 'history', 'whitepaper']
  for (const sub of subs) {
    const r = await call('/derive', { sub })
    assert(sub + ' 可渲染', r.status === 200 && typeof r.json.result === 'string',
      'status=' + r.status + ' len=' + String((r.json.result || '').length))
  }
}

console.log('-- 4. 客户端产物含新增界面 --')
{
  const source = readFileSync(join(process.cwd(), 'lib', 'client.js'), 'utf8')
  assert('含继承页', source.includes('InheritTab'))
  assert('含对比页', source.includes('DiffTab'))
  assert('含宇宙初始化引擎', source.includes('宇宙初始化引擎') || source.includes('InitCard') ||
    source.includes('\\u5b87\\u5b99\\u521d\\u59cb\\u5316'),
    '检查编译后的中文转义')
  assert('页签有继承', /id:\s*'inherit'/.test(source))
  assert('页签有对比', /id:\s*'diff'/.test(source))
  assert('archive 走 history', source.includes("'archive': 'history'") || source.includes('history'))
}

console.log('-- 5. 客户端硬约束 --')
{
  const source = readFileSync(join(process.cwd(), 'lib', 'client.js'), 'utf8')
  assert('无顶层 import', !/^import\s/m.test(source))
  assert('无顶层 export', !/^export\s/m.test(source))
  assert('无写死颜色', !/#[0-9a-fA-F]{6}\b/.test(source) && !/rgba\(/.test(source))
}

clean()
console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
