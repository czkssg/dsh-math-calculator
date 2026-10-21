/**
 * UI 后端 API 测试（设置 / 常数表 / 公式表）。
 *
 * 这一层是给「配置与数据管理面板」用的：用户不在这里算数，只在这里改配置、管数据。
 * 直接调 handleApiRequest，不经过 HTTP，跑得快也不需要宿主。
 */
import { handleApiRequest } from '../lib/api.js'
import { FORMULAS } from '../lib/formulas.js'

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

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
