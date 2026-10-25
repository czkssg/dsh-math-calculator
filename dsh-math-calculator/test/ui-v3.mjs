/**
 * UI v3 工作台测试：参数分层、综合推演、反解、自洽性。
 */
import { handleApiRequest } from '../lib/api.js'
import { readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { workspaceDirectory, resetActiveWorkspace } from '../lib/workspace.js'
import { deriveAll } from '../lib/summary.js'
import { solveAnchor, ANCHORS } from '../lib/anchor-solve.js'
import { WORLD_PARAMS, paramsByGroup } from '../lib/world-params.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

async function call(path, body, method) {
  return handleApiRequest(path, { method: method || 'POST', route: path, body, params: {}, headers: {} })
}

resetActiveWorkspace()
const source = readFileSync(join(process.cwd(), 'lib', 'client.js'), 'utf8')

console.log('-- 1. 参数分层：只有基础量可输入 --')
{
  assert('参数总数 ≥ 20', WORLD_PARAMS.length >= 20, String(WORLD_PARAMS.length))
  assert('分 7 组', paramsByGroup().length === 7, String(paramsByGroup().length))
  // 关键：派生量绝不能在可输入清单里
  const forbidden = ['gravity', 'surfaceGravity', 'surfaceMeanK', 'scaleHeight', 'escapeVelocity']
  for (const key of forbidden) {
    assert('不把 ' + key + ' 当输入', !WORLD_PARAMS.some((p) => p.key === key))
  }
  assert('每个参数都有中文名', WORLD_PARAMS.every((p) => p.label.length > 1))
  assert('每个参数都有影响说明', WORLD_PARAMS.every((p) => p.affects.length > 5))
  assert('有 basic 层', WORLD_PARAMS.some((p) => p.tier === 'basic'))
  assert('有 advanced 层', WORLD_PARAMS.some((p) => p.tier === 'advanced'))
}

console.log('-- 2. 综合推演：一次拿到全部结论 --')
{
  const sum = deriveAll({})
  assert('有派生量', sum.derived.length >= 7, String(sum.derived.length))
  assert('有生物结论', sum.biology.length >= 3, String(sum.biology.length))
  assert('有文明结论', sum.civilization.length > 0, String(sum.civilization.length))
  assert('有环境结论', sum.environment.length >= 3, String(sum.environment.length))
  assert('有速写', sum.headline.length > 10, sum.headline)
  const gravity = sum.derived.find((d) => d.key === 'gravity')
  assert('重力约 9.8', Math.abs(gravity.value - 9.8) < 0.3, gravity.text)
}

console.log('-- 3. 派生量不写入参数（自洽性核心）--')
{
  // 硬塞派生量进 params，应该被丢弃
  const dirty = { planetMass: 2, gravity: 99, surfaceMeanK: 999, 乱写的字段: 1 }
  const sum = deriveAll(dirty)
  assert('planetMass 被保留', sum.params.planetMass === 2, String(sum.params.planetMass))
  assert('gravity 被丢弃', sum.params.gravity === undefined)
  assert('surfaceMeanK 被丢弃', sum.params.surfaceMeanK === undefined)
  assert('垃圾字段被丢弃', sum.params['乱写的字段'] === undefined)
  // 重力仍按公式现算
  const gravity = sum.derived.find((d) => d.key === 'gravity')
  assert('重力按公式算（2 倍质量 ≈ 2g）', Math.abs(gravity.value - 19.6) < 0.5, gravity.text)
}

console.log('-- 4. 改基础量 → 派生量全变 --')
{
  const base = deriveAll({})
  const heavy = deriveAll({ planetMass: 2 })
  const pick = (sum, key) => sum.derived.find((d) => d.key === key).value
  assert('重力翻倍', Math.abs(pick(heavy, 'gravity') / pick(base, 'gravity') - 2) < 0.1,
    pick(heavy, 'gravity').toFixed(2) + ' vs ' + pick(base, 'gravity').toFixed(2))
  assert('逃逸速度变大', pick(heavy, 'escapeVelocity') > pick(base, 'escapeVelocity'))
  assert('大气标高变小（重力大压得扁）', pick(heavy, 'scaleHeight') < pick(base, 'scaleHeight'),
    pick(heavy, 'scaleHeight').toFixed(0) + ' vs ' + pick(base, 'scaleHeight').toFixed(0))
  // 生物结论也要跟着变
  const baseBio = base.biology.find((b) => b.label.includes('高度'))
  const heavyBio = heavy.biology.find((b) => b.label.includes('高度'))
  assert('生物高度降低', parseFloat(heavyBio.value) < parseFloat(baseBio.value),
    heavyBio.value + ' vs ' + baseBio.value)
}

console.log('-- 5. 反解：从目标推回基础量 --')
{
  assert('4 个锚点', ANCHORS.length === 4, String(ANCHORS.length))

  const g = solveAnchor('gravity', 1.5, {})
  assert('重力反解成功', g.solved === true)
  assert('反解出 planetMass', g.changes.planetMass !== undefined, JSON.stringify(g.changes))
  assert('质量约 1.5', Math.abs(g.changes.planetMass - 1.5) < 0.05, String(g.changes.planetMass))
  assert('给出了连带效应', g.sideEffects.length >= 2, String(g.sideEffects.length))
  assert('连带含逃逸速度', g.sideEffects.some((s) => s.label.includes('逃逸')))

  const cre = solveAnchor('creatureHeight', 50, {})
  assert('50 米反解出质量 0.5', Math.abs(cre.changes.planetMass - 0.5) < 0.05, String(cre.changes.planetMass))

  const bad = solveAnchor('gravity', -1, {})
  assert('非法值不解', bad.solved === false)
  assert('给出原因', Boolean(bad.why), String(bad.why))
}

console.log('-- 6. 新 API 路由 --')
{
  const meta = await call('/world-params', null, 'GET')
  assert('world-params 200', meta.status === 200)
  assert('返回分组', Array.isArray(meta.json.groups) && meta.json.groups.length === 7)
  assert('返回锚点', Array.isArray(meta.json.anchors) && meta.json.anchors.length === 4)

  const sum = await call('/summary', { world: { planetMass: 2 } })
  assert('summary 200', sum.status === 200)
  assert('summary 有派生量', Array.isArray(sum.json.derived))

  const solved = await call('/solve-anchor', { kind: 'gravity', wanted: 1.5, world: {} })
  assert('solve-anchor 200', solved.status === 200)
  assert('solve-anchor 有 changes', Boolean(solved.json.changes))
}

console.log('-- 7. 界面结构：四区块无导航 --')
{
  assert('有 Workbench', source.includes('Workbench'))
  assert('有序号 ①②③④',
    ['① 设定这个世界', '② 这个世界长什么样', '③ 这意味着什么', '④ 我想要']
      .every((t) => source.includes(t)))
  assert('进阶参数可折叠', source.includes('进阶参数'))
  assert('已删除旧目录树', !source.includes('CONSOLE_TREE'))
  assert('无顶层 import', !/^import\s/m.test(source))
  assert('无写死颜色', !/#[0-9a-fA-F]{6}\b/.test(source) && !/rgba\(/.test(source))
}

console.log('-- 8. 保存链路：name 留空存到当前工作区 --')
{
  const probe = 'ui-v3-probe'
  const dir = workspaceDirectory()
  const file = join(dir, probe + '.json')
  if (existsSync(file)) rmSync(file, { force: true })
  await call('/workspaces/create', { name: probe })
  const saved = await call('/workspaces/save-world', { name: probe, world: { planetMass: 3 } })
  assert('保存 200', saved.status === 200)
  assert('存了 planetMass=3', saved.json.world.planetMass === 3, JSON.stringify(saved.json.world))
  rmSync(file, { force: true })
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
