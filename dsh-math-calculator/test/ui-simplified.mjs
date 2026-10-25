/**
 * UI 精简测试：面向作者 vs 面向 AI。
 *
 * 用户诉求：UI 太繁复，要区分「用户需要看的」与「只给 AI 的数据」，降低门槛。
 */
import { handleApiRequest } from '../lib/api.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { existsSync, rmSync } from 'node:fs'
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

const source = readFileSync(join(process.cwd(), 'lib', 'client.js'), 'utf8')
const probe = 'ui-simple-probe'

console.log('-- 1. 目录树砍到 5 组 --')
{
  assert('有 5 个组标题',
    ['这个世界', '会有什么后果', '超出物理的设定', '我要能拿走', '我改过什么']
      .every((t) => source.includes(t)))
  // 旧的技术节点应该消失
  assert('没有「接口卡矩阵」', !source.includes('接口卡矩阵'))
  assert('没有「相图热力图」', !source.includes('相图热力图'))
  // ⚠️ 只断言「目录树里没有这个节点」，不能断言「源码不含这个词」：
  //    GraphCanvas 组件还留着（AI 仍可通过 /derive?sub=graph 取数据），
  //    只是不再挂到界面上。
  // 精确截取：从 CONSOLE_TREE 开始，到紧随其后的第一个顶层函数为止。
  // 之前用 indexOf('function makeDerivationPane') 太远，把中间一堆组件也包进来了，
  // 于是「依赖图」出现在后面 GraphCanvas 的注释里，误判成目录树里有这个节点。
  const treeStart = source.indexOf('var CONSOLE_TREE')
  const closeIdx = source.indexOf(String.fromCharCode(10) + ']', treeStart)
  const treeText = treeStart >= 0 && closeIdx > treeStart
    ? source.slice(treeStart, closeIdx + 2)
    : ''
  assert('目录树里没有「依赖图」', treeText && !treeText.includes('依赖图'),
    treeText ? '树内不含该词' : '未取到树片段')
  assert('目录树里没有「相图」', treeText && !treeText.includes('相图'))
  assert('没有「完整性检查」', !source.includes('完整性检查'))
  assert('没有「变更清单」节点', !source.includes('1.3 变更清单'))
}

console.log('-- 2. 作者能直接改世界参数（新能力）--')
{
  await call('/workspaces/create', { name: probe })
  const saved = await call('/workspaces/save-world', {
    name: probe,
    world: { planetMass: 1.5, rotationHours: 30, orbitAU: 0.9 },
  })
  assert('保存世界参数返回 200', saved.status === 200, 'status=' + saved.status)
  assert('参数已存', saved.json && saved.json.world && saved.json.world.planetMass === 1.5,
    JSON.stringify(saved.json && saved.json.world))

  const current = await call('/workspaces/current', null, 'GET')
  assert('当前工作区能读回', current.status === 200)
}

console.log('-- 3. 世界参数只接受已知字段 --')
{
  const bad = await call('/workspaces/save-world', {
    name: probe,
    world: { planetMass: 'abc' },
  })
  assert('非法数值被拒', bad.status === 400, 'status=' + bad.status)

  const junk = await call('/workspaces/save-world', {
    name: probe,
    world: { 乱写的字段: 999, planetMass: 2 },
  })
  assert('垃圾字段被过滤', junk.status === 200 && !('乱写的字段' in (junk.json.world || {})),
    JSON.stringify(junk.json.world))
}

console.log('-- 4. 恢复成地球 --')
{
  const reset = await call('/workspaces/reset-world', { name: probe })
  assert('重置返回 200', reset.status === 200)
  assert('world 清空', JSON.stringify(reset.json.world) === '{}', JSON.stringify(reset.json.world))
}

console.log('-- 5. 基本设定表单存在 --')
{
  assert('有 WorldForm 组件', source.includes('WorldForm'))
  assert('有四个字段', ['行星质量', '一天多长', '离恒星多远'].every((f) => source.includes(f)),
    '行星质量/一天多长/离恒星多远')
  assert('留空即默认', source.includes('留空就是默认值') || source.includes('默认值'))
  assert('有保存按钮', source.includes("'保存'"))
  assert('有恢复按钮', source.includes('恢复成地球'))
}

console.log('-- 6. 引导语降低门槛 --')
{
  assert('解释调完后去哪看', source.includes('会有什么后果'))
  assert('告诉用户可以问 AI', source.includes('让它帮你算') || source.includes('跟 AI 说'))
}

console.log('-- 7. 技术页面仍可通过 AI 访问 --')
{
  // 界面砍掉，但后端能力不能砍——AI 还要用
  for (const sub of ['graph', 'heatmap', 'cards', 'checklist', 'sensitivity']) {
    const r = await call('/derive', { sub })
    assert(sub + ' 后端仍可用', r.status === 200, 'status=' + r.status)
  }
}

console.log('-- 8. 客户端硬约束 --')
{
  assert('无顶层 import', !/^import\s/m.test(source))
  assert('无顶层 export', !/^export\s/m.test(source))
  assert('无写死颜色', !/#[0-9a-fA-F]{6}\b/.test(source) && !/rgba\(/.test(source))
}

const dir = workspaceDirectory()
const f = join(dir, probe + '.json')
if (existsSync(f)) rmSync(f, { force: true })

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f2 of fails) console.log('  - ' + f2.name + ': ' + (f2.detail ?? ''))
process.exit(1)
