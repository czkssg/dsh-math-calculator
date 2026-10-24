/**
 * UI 后端 API 测试（设置 / 常数表 / 公式表）。
 *
 * 这一层是给「配置与数据管理面板」用的：用户不在这里算数，只在这里改配置、管数据。
 * 直接调 handleApiRequest，不经过 HTTP，跑得快也不需要宿主。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { handleApiRequest } from '../lib/api.js'
import { FORMULAS } from '../lib/formulas.js'
import { workspaceDirectory, switchWorkspace, currentWorkspace } from '../lib/workspace.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass++
    console.log('  ok   ' + name + (detail ? ': ' + detail : ''))
  } else {
    fails.push({ name, detail })
    console.log('  FAIL ' + name + '\n         ' + (detail ?? ''))
  }
}
const call = (method, path, body) => handleApiRequest(path, { method, body })
const sampleId = FORMULAS[0].id

console.log('-- 1. 设置：提示档位 --')
{
  const before = call('GET', 'settings')
  assert('GET settings 200', before.status === 200)
  assert('返回三个档位', Array.isArray(before.json.modes) && before.json.modes.length === 3, JSON.stringify(before.json.modes))
  assert('默认 brief', before.json.promptMode === 'brief', before.json.promptMode)

  const set = call('POST', 'settings', { promptMode: 'full' })
  assert('切换到 full', set.status === 200 && set.json.promptMode === 'full')
  assert('GET 反映新档位', call('GET', 'settings').json.promptMode === 'full')

  const bad = call('POST', 'settings', { promptMode: 'nonsense' })
  assert('非法档位 400', bad.status === 400, String(bad.status))

  call('POST', 'settings', { promptMode: 'brief' })
}

console.log('-- 2. 常数表：读取与修改 --')
{
  const base = call('GET', 'constants')
  assert('GET constants 200', base.status === 200)
  assert('给出可调旋钮', Array.isArray(base.json.base) && base.json.base.length >= 9, String(base.json.base?.length))
  assert('含 c 与 G', base.json.base.some((x) => x.name === 'c') && base.json.base.some((x) => x.name === 'G'))
  assert('每条带单位与说明', base.json.base.every((x) => typeof x.unit === 'string' && typeof x.meaning === 'string'))
  assert('初始无覆盖', Object.keys(base.json.overrides).length === 0, JSON.stringify(base.json.overrides))

  const saved = call('POST', 'workspaces/save-constant', { name: 'default', constantName: 'c', value: 1.5e8 })
  assert('保存常数 200', saved.status === 200, JSON.stringify(saved.json))
  assert('读取到覆盖值', call('GET', 'constants').json.overrides.c === 1.5e8)

  const reset = call('POST', 'workspaces/reset-constant', { name: 'default', constantName: 'c' })
  assert('重置常数 200', reset.status === 200)
  assert('重置后覆盖消失', call('GET', 'constants').json.overrides.c === undefined)
}

console.log('-- 3. 公式表：停用 / 启用 / 重置 --')
{
  const empty = call('GET', 'formula-table')
  assert('GET formula-table 200', empty.status === 200)
  assert('初始无覆盖', empty.json.overrides.length === 0)

  const disabled = call('POST', 'formula-table', { name: 'default', action: 'disable', formulaId: sampleId })
  assert('停用 200', disabled.status === 200, JSON.stringify(disabled.json))
  assert('返回停用条目', disabled.json.overrides.some((o) => o.id === sampleId && o.disabled === true))
  assert('GET 能看到停用', call('GET', 'formula-table').json.overrides.some((o) => o.id === sampleId && o.disabled))

  const enabled = call('POST', 'formula-table', { name: 'default', action: 'enable', formulaId: sampleId })
  assert('启用 200', enabled.status === 200)
  assert('停用标记被清除', enabled.json.overrides.some((o) => o.id === sampleId && o.disabled === false))

  const reset = call('POST', 'formula-table', { name: 'default', action: 'reset', formulaId: sampleId })
  assert('重置 200', reset.status === 200)
  assert('重置后无覆盖', call('GET', 'formula-table').json.overrides.length === 0)

  assert('缺 formulaId → 400', call('POST', 'formula-table', { name: 'default', action: 'disable' }).status === 400)
  assert('非法 action → 400', call('POST', 'formula-table', { name: 'default', action: 'explode', formulaId: sampleId }).status === 400)
  const unknown = call('POST', 'formula-table', { name: 'default', action: 'disable', formulaId: 'no-such-formula' })
  assert('未知公式 id 不崩溃', unknown.status === 200 && String(unknown.json.message).includes('没有 id'), JSON.stringify(unknown.json).slice(0, 80))
}

console.log('-- 4. 工作区隔离 --')
{
  call('POST', 'workspaces/create', { name: 'api-ui-test', description: 'API 测试' })
  call('POST', 'workspaces/switch', { name: 'api-ui-test' })
  assert('新工作区无常数覆盖', Object.keys(call('GET', 'constants').json.overrides).length === 0)
  assert('新工作区无公式覆盖', call('GET', 'formula-table').json.overrides.length === 0)

  call('POST', 'workspaces/switch', { name: 'default' })
  call('POST', 'workspaces/delete', { name: 'api-ui-test' })
}

console.log('-- 5. 路由语义 --')
{
  assert('GET 未知路径 → 404', call('GET', 'nope').status === 404)
  assert('PUT settings → 405', call('PUT', 'settings').status === 405, String(call('PUT', 'settings').status))
  assert('POST constants → 405', call('POST', 'constants', {}).status === 405)
}

console.log('-- 7. 当前工作区接口（右侧边栏「本区数据表」用）--')
{
  const r = call('GET', 'workspaces/current')
  assert('GET workspaces/current 200', r.status === 200, String(r.status))
  assert('返回当前工作区名', typeof r.json.name === 'string' && r.json.name.length > 0, r.json.name)
  assert('返回 summary 摘要', Boolean(r.json.summary), JSON.stringify(r.json.summary))
  const keys = ['changedConstants', 'overrides', 'customFormulas', 'terrains', 'variables']
  assert('summary 字段齐全且为数字', keys.every((k) => typeof r.json.summary[k] === 'number'), JSON.stringify(r.json.summary))
  assert('summary.name 与顶层一致', r.json.summary.name === r.json.name, r.json.summary.name)

  // 关键：'workspaces/current' 不能被当成名为 "current" 的工作区
  assert('current 未被当作工作区名', r.json.name !== 'current', r.json.name)

  // 普通详情路由仍然可用
  const detail = call('GET', 'workspaces/default')
  assert('workspaces/default 仍走详情路由', detail.status === 200 && detail.json.name === 'default', detail.json.name)
}

console.log('-- 8. 切换工作区时数据表自动创建 --')
{
  const name = 'autocreate_check'
  const file = join(workspaceDirectory(), name + '.json')
  // 先确保它不存在
  if (existsSync(file)) call('POST', 'workspaces/delete', { name })

  const before = existsSync(file)
  assert('测试起点：文件不存在', before === false, file)

  const switched = call('POST', 'workspaces/switch', { name })
  assert('切换到新工作区 200', switched.status === 200, String(switched.status))
  assert('切换后 current = ' + name, currentWorkspace() === name, currentWorkspace())

  // 自动创建：切换即落盘，工作区不再是「幽灵」
  assert('数据表已自动创建（磁盘上真的有）', existsSync(file), file)

  const detail = call('GET', 'workspaces/' + name)
  assert('新工作区可读', detail.status === 200 && detail.json.name === name, detail.json.name)

  // 回切到 default，别把测试状态留给其它用例
  switchWorkspace('default')
  if (existsSync(file)) call('POST', 'workspaces/delete', { name })
}

console.log('-- 9. 本工作区的管理接口（右栏「管理」用）--')
{
  const name = 'manage_check'
  const other = 'manage_other'
  for (const n of [name, other]) {
    if (existsSync(join(workspaceDirectory(), n + '.json'))) call('POST', 'workspaces/delete', { name: n })
  }

  assert('切换到新工作区（自动建表）', call('POST', 'workspaces/switch', { name }).status === 200)

  // 变量
  assert('set-variable 200', call('POST', 'workspaces/set-variable', { name, variableName: 'q', value: 42 }).status === 200)
  const afterVar = call('GET', 'workspaces/' + name)
  assert('变量写进了本工作区', Boolean(afterVar.json.variables) && afterVar.json.variables.q === 42, JSON.stringify(afterVar.json.variables))

  // 地点（新增 + 同名覆盖）
  assert('save-terrain 200', call('POST', 'workspaces/save-terrain', { name, terrain: { name: 'port', kind: 'coastal' } }).status === 200)
  call('POST', 'workspaces/save-terrain', { name, terrain: { name: 'port', kind: 'desert' } })
  const afterTerrain = call('GET', 'workspaces/' + name)
  const ports = (afterTerrain.json.terrains || []).filter((t) => t.name === 'port')
  assert('同名地点覆盖而非重复', ports.length === 1 && ports[0].kind === 'desert', JSON.stringify(ports))

  // 一个工作区一张数据表：另一个工作区看不到这些
  call('POST', 'workspaces/switch', { name: other })
  const otherDetail = call('GET', 'workspaces/' + other)
  assert('另一个工作区是独立数据表（没有上面的变量）',
    !otherDetail.json.variables || otherDetail.json.variables.q === undefined,
    JSON.stringify(otherDetail.json.variables))

  // 参数校验
  assert('set-variable 缺名字 400', call('POST', 'workspaces/set-variable', { name }).status === 400)
  assert('set-variable 非数字 400', call('POST', 'workspaces/set-variable', { name, variableName: 'x', value: 'abc' }).status === 400)
  assert('save-terrain 缺 terrain 400', call('POST', 'workspaces/save-terrain', { name }).status === 400)
  assert('save-terrain 缺 terrain.name 400', call('POST', 'workspaces/save-terrain', { name, terrain: { kind: 'plain' } }).status === 400)

  // 收尾：切回 default 并删除测试工作区
  switchWorkspace('default')
  for (const n of [name, other]) call('POST', 'workspaces/delete', { name: n })
}

console.log('-- 10. 新建工作区即生成同名数据表 --')
{
  const name = 'named_table_check'
  if (existsSync(join(workspaceDirectory(), name + '.json'))) call('POST', 'workspaces/delete', { name })

  const created = call('POST', 'workspaces/create', { name, description: '数据表同名测试' })
  assert('create 200', created.status === 200, String(created.status))

  // 关键：建工作区的同时，磁盘上立刻出现与工作区**同名**的数据表文件
  const file = join(workspaceDirectory(), name + '.json')
  assert('同名数据表已自动创建', existsSync(file), file)

  const data = JSON.parse(readFileSync(file, 'utf8'))
  assert('数据表内的 name 与工作区同名', data.name === name, data.name)
  assert('数据表包含四张子表', ['constants', 'formulaTable', 'terrains', 'variables'].every((k) => data[k] !== undefined),
    Object.keys(data).join(','))

  // 再写一条变量，确认写的是这张同名表
  call('POST', 'workspaces/set-variable', { name, variableName: 'mark', value: 1 })
  const again = JSON.parse(readFileSync(file, 'utf8'))
  assert('写入落在同名数据表里', again.variables && again.variables.mark === 1, JSON.stringify(again.variables))

  switchWorkspace('default')
  call('POST', 'workspaces/delete', { name })
}

console.log('-- 10.5 按宿主工作区绑定数据表（一个工作区一张同名表）--')
{
  // 用两个假的工作区身份，验证：各自建表、互不影响、重复绑定复用。
  const wsA = { workspaceId: 'aaaaaaaa-1111-2222-3333-444444444444', title: 'bind_alpha' }
  const wsB = { workspaceId: 'bbbbbbbb-5555-6666-7777-888888888888', title: 'bind_beta' }
  const fileA = join(workspaceDirectory(), wsA.title + '.json')
  const fileB = join(workspaceDirectory(), wsB.title + '.json')
  for (const f of [fileA, fileB]) if (existsSync(f)) call('POST', 'workspaces/delete', { name: f.replace(/\.json$/, '').split('\\').pop() })

  const firstA = call('POST', 'workspaces/bind', wsA)
  assert('绑定 A → 200', firstA.status === 200, String(firstA.status))
  assert('A 建出同名数据表', existsSync(fileA), fileA)
  assert('A 是新建（created=true）', firstA.json.created === true, String(firstA.json.created))
  assert('A 表名 = 工作区标题', firstA.json.name === wsA.title, firstA.json.name)

  const firstB = call('POST', 'workspaces/bind', wsB)
  assert('绑定 B → 200', firstB.status === 200, String(firstB.status))
  assert('B 建出自己的表', existsSync(fileB), fileB)
  assert('A 与 B 是两张不同的表', firstA.json.name !== firstB.json.name,
    firstA.json.name + ' vs ' + firstB.json.name)

  // 往 A 写数据，B 不应受影响
  call('POST', 'workspaces/set-variable', { name: wsA.title, variableName: 'onlyA', value: 9 })
  const dataA = JSON.parse(readFileSync(fileA, 'utf8'))
  const dataB = JSON.parse(readFileSync(fileB, 'utf8'))
  assert('A 的表里写入了变量', dataA.variables && dataA.variables.onlyA === 9, JSON.stringify(dataA.variables))
  assert('B 的表没有被污染', !dataB.variables || dataB.variables.onlyA === undefined, JSON.stringify(dataB.variables))

  // 重复绑定 A：必须复用，不能重建（否则数据会丢）
  const againA = call('POST', 'workspaces/bind', wsA)
  assert('重复绑定复用同一张表', againA.json.name === firstA.json.name, againA.json.name)
  assert('重复绑定不再算新建', againA.json.created === false, String(againA.json.created))
  const afterRe = JSON.parse(readFileSync(fileA, 'utf8'))
  assert('复用后原有数据还在', afterRe.variables && afterRe.variables.onlyA === 9, JSON.stringify(afterRe.variables))

  // 只有 id 没有标题时，用 id 前缀派生稳定表名
  const idOnly = { workspaceId: 'cccccccc-9999-0000-1111-222222222222', title: '' }
  const bound = call('POST', 'workspaces/bind', idOnly)
  assert('只有 id 也能派生表名', bound.json.name === 'ws-cccccccc', bound.json.name)
  call('POST', 'workspaces/delete', { name: bound.json.name })

  // 收尾
  switchWorkspace('default')
  for (const name of [wsA.title, wsB.title]) call('POST', 'workspaces/delete', { name })
}

console.log('-- 11. 客户端心跳（诊断：面板挂没挂上）--')
{
  assert('GET client-status 200', call('GET', 'client-status').status === 200)

  const hello = call('POST', 'client-hello', {
    registered: 3,
    page: true,
    rightTabService: true,
    rightTabRegistered: false,
    rightTabError: null,
    order: 30,
  })
  assert('POST client-hello 200', hello.status === 200, String(hello.status))

  const hb = call('GET', 'client-status').json.heartbeat
  assert('心跳已记录且带时间戳', Boolean(hb) && typeof hb.at === 'string' && !Number.isNaN(Date.parse(hb.at)),
    JSON.stringify(hb))
  assert('心跳带回注册信息',
    Boolean(hb) && Boolean(hb.payload) && hb.payload.page === true && hb.payload.order === 30,
    JSON.stringify(hb && hb.payload))
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
