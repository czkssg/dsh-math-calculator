/**
 * UI v2 重构测试：六大目录 + /derive 路由 + 强绑定。
 */
import { handleApiRequest } from '../lib/api.js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

async function call(path, body, method) {
  return handleApiRequest(path, { method: method || 'POST', route: path, body, params: {}, headers: {} })
}

console.log('-- 1. /derive 路由支持全部目录 --')
{
  const subs = ['pipeline', 'cards', 'civilization', 'dead', 'timeline', 'whitepaper', 'sensitivity', 'checklist']
  for (const sub of subs) {
    const r = await call('/derive', { sub })
    assert(sub + ' 返回 200', r.status === 200, 'status=' + r.status)
    assert(sub + ' 有结果文本',
      typeof r.json.result === 'string' && r.json.result.length > 20,
      String((r.json.result || '').length) + ' 字符')
  }
}

console.log('-- 2. 未知子命令不崩 --')
{
  const r = await call('/derive', { sub: '根本不存在的子命令' })
  assert('未知子命令有响应', r.status === 200 || r.status === 400, 'status=' + r.status)
}

console.log('-- 3. 强绑定：boundWorkspace 字段 --')
{
  // ⚠️ 不假设「列表非空」：其它套件（api.mjs）跑完会清理测试表，
  // 全量跑时这里可能就是空的。先自己造一张，验完再删。
  const probe = 'uiv2-bind-probe'
  await call('/workspaces/create', { name: probe })

  const r = await call('', null, 'GET')
  assert('列表返回 200', r.status === 200)
  const list = r.json.workspaces || []
  assert('探测表已创建', list.some((w) => w.name === probe), String(list.length))
  assert('每张表都有 boundWorkspace',
    list.length > 0 && list.every((w) => typeof w.boundWorkspace === 'string' && w.boundWorkspace.length > 0),
    JSON.stringify(list.map((w) => w.boundWorkspace)))
  assert('表名与绑定名一致（一区一表）',
    list.every((w) => w.name === w.boundWorkspace))

  await call('workspaces/delete', { name: probe })
}

console.log('-- 4. 客户端产物含六大目录 --')
{
  const clientPath = join(process.cwd(), 'lib', 'client.js')
  assert('client.js 存在', existsSync(clientPath), clientPath)
  const source = readFileSync(clientPath, 'utf8')
  assert('含 CONSOLE_TREE', source.includes('CONSOLE_TREE'))
  assert('含 DerivationPane', source.includes('DerivationPane'))
  // ⚠️ 目录树已从「推演栈六大目录」精简为「面向作者的 5 组」。
  //    技术目录（依赖图/接口卡/相图…）不占界面，AI 仍可通过 /derive 取。
  const groups = ['world', 'impact', 'fantasy', 'output', 'history']
  const groupCount = groups.filter(function (g) { return source.includes("id: '" + g + "'") }).length
  assert('有五个一级目录（面向作者）', groupCount === 5, String(groupCount))
  assert('不再有推演栈镜像目录', !source.includes("id: 'laws'") && !source.includes("id: 'engine'"))
}

console.log('-- 5. 客户端硬约束仍满足 --')
{
  const source = readFileSync(join(process.cwd(), 'lib', 'client.js'), 'utf8')
  assert('无顶层 import', !/^import\s/m.test(source))
  assert('无顶层 export', !/^export\s/m.test(source))
  assert('含 __ModuleLoader__ 引导', source.includes('__ModuleLoader__'))
  assert('无写死颜色', !/#[0-9a-fA-F]{6}\b/.test(source) && !/rgba\(/.test(source),
    (source.match(/#[0-9a-fA-F]{6}\b|rgba\(/g) || []).slice(0, 3).join(','))
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
