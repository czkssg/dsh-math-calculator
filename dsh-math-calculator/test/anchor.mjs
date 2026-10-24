/**
 * 逆推校准 + 七张表持久化 + 版本记录测试。
 */
import { backSolve, renderBackSolve, listAnchors, ANCHORS } from '../lib/back-solve.js'
import { archiveDerivation, loadArchive, compareVersions } from '../lib/derivation-log.js'
import { runPipeline } from '../lib/pipeline.js'
import { opWorld } from '../lib/ops/world-op.js'
import { switchWorkspace, resetActiveWorkspace, workspaceDirectory } from '../lib/workspace.js'
import { existsSync, rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

function world(overrides) { return opWorld({ world: overrides || {} }, 32).value }

console.log('-- 1. 锚点清单 --')
{
  const anchors = listAnchors({})
  assert('至少 4 个可反推锚点', anchors.length >= 4, String(anchors.length))
  assert('含陆生生物高度', anchors.some((a) => a.id === 'creatureHeight'))
  assert('每个都有当前上限', anchors.every((a) => Number.isFinite(a.currentLimit) && a.currentLimit > 0),
    anchors.map((a) => a.id + '=' + a.currentLimit.toFixed(1)).join(' '))
}

console.log('-- 2. 逆推：50 米巨兽 --')
{
  const solution = backSolve('creatureHeight', 50)
  assert('反推成功', solution !== null)
  assert('锚点正确', solution.anchor === 'creatureHeight', solution.anchor)
  assert('想要的值正确', solution.wanted === 50, String(solution.wanted))

  const gravity = solution.limits.find((l) => l.parameter === 'gravityRatio')
  assert('重力上限 = 0.5', Math.abs(gravity.max - 0.5) < 1e-9, String(gravity.max))

  const mass = solution.limits.find((l) => l.parameter === 'planetMass')
  assert('质量上限 = 0.5', Math.abs(mass.max - 0.5) < 1e-9, String(mass.max))

  assert('有推荐取值', Object.keys(solution.recommended).length > 0,
    JSON.stringify(solution.recommended))
  assert('推荐重力 ≤ 上限', solution.recommended.gravityRatio <= gravity.max,
    String(solution.recommended.gravityRatio))

  // 关键：代回正向链路验证
  assert('有正向链路结果', solution.pipeline !== undefined)
  assert('推荐参数下无禁止项', solution.pipeline.firstBlocked === null,
    String(solution.pipeline.firstBlocked))
}

console.log('-- 3. 逆推：越极端的锚点，重力上限越低 --')
{
  const s50 = backSolve('creatureHeight', 50)
  const s200 = backSolve('creatureHeight', 200)
  const g50 = s50.limits.find((l) => l.parameter === 'gravityRatio').max
  const g200 = s200.limits.find((l) => l.parameter === 'gravityRatio').max
  assert('200 米比重 50 米要求更低重力', g200 < g50, g200.toFixed(3) + ' < ' + g50.toFixed(3))
  assert('比例正确（25/200 vs 25/50）', Math.abs(g200 / g50 - 0.25) < 0.01, (g200 / g50).toFixed(3))
}

console.log('-- 4. 未知锚点与非法值 --')
{
  assert('未知锚点返回 null', backSolve('nonexistent', 50) === null)
  assert('非法值返回 null', backSolve('creatureHeight', 0) === null)
  assert('负值返回 null', backSolve('creatureHeight', -10) === null)
}

console.log('-- 5. 七张表持久化 --')
{
  resetActiveWorkspace()
  switchWorkspace('log_test_a')
  const dir = workspaceDirectory()
  const file = join(dir, 'log_test_a.derivation.json')
  if (existsSync(file)) rmSync(file, { force: true })

  const pipeline = runPipeline(world({}))
  const first = archiveDerivation('log_test_a', pipeline, [], [], [])
  assert('归档成功', first.version === 'v1', first.version)
  assert('档案文件已落盘', existsSync(file), file)

  const loaded = loadArchive('log_test_a')
  assert('能读回 1 版', loaded.versions.length === 1, String(loaded.versions.length))

  // 七张表字段齐全
  const archive = loaded.versions[0]
  const tables = ['projectCard', 'changeList', 'interfaceCards', 'constraints', 'sensitivity', 'anchors', 'versions']
  assert('七张表字段齐全', tables.every((k) => archive[k] !== undefined), Object.keys(archive).join(','))

  // 第二版
  const pipeline2 = runPipeline(world({ planetMass: 0.5 }))
  const second = archiveDerivation('log_test_a', pipeline2, [], [], [])
  assert('第二版归档', second.version === 'v2', second.version)
  assert('共 2 版', loadArchive('log_test_a').versions.length === 2)
  rmSync(file, { force: true })
}

console.log('-- 6. 工作区隔离 --')
{
  resetActiveWorkspace()
  const dir = workspaceDirectory()
  for (const name of ['log_iso_a', 'log_iso_b']) {
    const f = join(dir, name + '.derivation.json')
    if (existsSync(f)) rmSync(f, { force: true })
  }
  switchWorkspace('log_iso_a')
  archiveDerivation('log_iso_a', runPipeline(world({})), [], [], [])
  switchWorkspace('log_iso_b')
  archiveDerivation('log_iso_b', runPipeline(world({})), [], [], [])
  archiveDerivation('log_iso_b', runPipeline(world({ planetMass: 2 })), [], [], [])

  assert('A 区 1 版', loadArchive('log_iso_a').versions.length === 1)
  assert('B 区 2 版', loadArchive('log_iso_b').versions.length === 2)
  assert('两区互不影响', loadArchive('log_iso_a').versions.length !== loadArchive('log_iso_b').versions.length)

  for (const name of ['log_iso_a', 'log_iso_b']) {
    const f = join(dir, name + '.derivation.json')
    if (existsSync(f)) rmSync(f, { force: true })
  }
  switchWorkspace('default')
}

console.log('-- 7. 版本对比 --')
{
  resetActiveWorkspace()
  switchWorkspace('log_cmp')
  const dir = workspaceDirectory()
  const file = join(dir, 'log_cmp.derivation.json')
  if (existsSync(file)) rmSync(file, { force: true })

  archiveDerivation('log_cmp', runPipeline(world({})), [], [], [])
  archiveDerivation('log_cmp', runPipeline(world({ planetMass: 0.5 })), [], [], [])

  const diff = compareVersions('log_cmp', 'v1')
  assert('对比成功', diff.ok === true, diff.message)
  assert('检测到差异', diff.changes.length > 0, String(diff.changes.length))
  assert('差异含骨比变化',
    diff.changes.some((c) => c.includes('骨骼强度体重比')), diff.changes.join(' | '))

  const missing = compareVersions('log_cmp', 'v9')
  assert('不存在的版本报错', missing.ok === false, missing.message)
  rmSync(file, { force: true })
  switchWorkspace('default')
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
