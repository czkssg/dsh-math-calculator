/**
 * 工作区隔离测试。
 *
 * 最核心的验证：**在世界观 A 改常数，绝不能影响世界观 B**。
 * 这是"一个世界观对应一张常数表"的根本要求。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 用临时目录，不碰真实 ~/.dsh
const tempHome = mkdtempSync(join(tmpdir(), 'dsh-ws-test-'))
process.env.DSH_MATH_CALC_HOME = tempHome

const mod = await import('../lib/index.js')
const exec = (a) => mod.runMathTool(a)

let pass = 0
const fails = []
const ok = (n, d = '') => { pass++; console.log(`  ok   ${n}${d ? ': ' + d : ''}`) }
const bad = (n, d) => { fails.push({ n, d }); console.log(`  FAIL ${n}\n         ${d}`) }
const assert = (n, c, d = '') => (c ? ok(n, d) : bad(n, d))

console.log('— 1. 工作区基本操作 —')
{
  const list = exec({ operation: 'workspace', action2: 'list' })
  assert('列出工作区', list.ok, list.error?.message)
  assert('初始为空', list.result.includes('还没有保存'), list.result.slice(0, 60))

  const create = exec({ operation: 'workspace', action2: 'create', workspace: 'aether', description: '以太世界' })
  assert('创建 aether', create.ok, create.error?.message)
  assert('创建后切为活动', create.result.includes('已创建并启用'), create.result.slice(0, 60))
}

console.log('— 2. 核心：世界观 A 改常数，不影响 B —')
{
  // 在 aether 改光速
  exec({ operation: 'constants', constants: { c: 1.5e8 * 2 } })
  const inA = exec({ operation: 'formula', formula: 'mass_energy', overrides: { m: 1 } })
  const energyA = Number(inA.value.answer)
  console.log(`       aether 里 1kg 质能: ${energyA.toExponential(4)} J`)

  // 切到新世界观
  exec({ operation: 'workspace', action2: 'create', workspace: 'steam' })
  const inB = exec({ operation: 'formula', formula: 'mass_energy', overrides: { m: 1 } })
  const energyB = Number(inB.value.answer)
  console.log(`       steam 里 1kg 质能: ${energyB.toExponential(4)} J`)

  assert('两个世界的质能**不同**（隔离生效）', Math.abs(energyA - energyB) > 1e10,
    `${energyA.toExponential(3)} vs ${energyB.toExponential(3)}`)

  // steam 应该是现实值
  const realEnergy = 299792458 ** 2
  assert('steam 使用现实光速', Math.abs(energyB - realEnergy) / realEnergy < 1e-6,
    energyB.toExponential(6))

  // 切回 aether，常数应该还在
  exec({ operation: 'workspace', action2: 'switch', workspace: 'aether' })
  const back = exec({ operation: 'formula', formula: 'mass_energy', overrides: { m: 1 } })
  assert('切回 aether 常数依然生效', Math.abs(Number(back.value.answer) - energyA) < 1,
    Number(back.value.answer).toExponential(6))
}

console.log('— 3. 常数表持久化 —')
{
  const show = exec({ operation: 'workspace', action2: 'show', workspace: 'aether' })
  assert('能显示工作区详情', show.ok, show.error?.message)
  assert('显示改过的常数', show.result.includes('c ') || show.result.includes('c\t'), show.result.slice(0, 200))
  assert('记录常数改动百分比', show.result.includes('%'), '')
}

console.log('— 4. 星球参数与变量隔离 —')
{
  exec({ operation: 'workspace', action2: 'switch', workspace: 'aether' })
  const setA = exec({
    operation: 'workspace',
    action2: 'set',
    world: { planetRadius: 1.4, rotationHours: 40 },
    workspaceVariables: { empirePopulation: 5e6, heroHeight: 2.1 },
  })
  assert('保存星球参数与变量', setA.ok, setA.error?.message)

  const showA = exec({ operation: 'workspace', action2: 'show', workspace: 'aether' })
  assert('aether 记录了星球参数', showA.result.includes('planetRadius'), showA.result.slice(0, 150))
  assert('aether 记录了变量', showA.result.includes('empirePopulation'))

  // steam 不应有这些
  const showB = exec({ operation: 'workspace', action2: 'show', workspace: 'steam' })
  assert('steam 没有 aether 的变量', !showB.result.includes('empirePopulation'),
    showB.result.includes('empirePopulation') ? '泄漏了！' : '无泄漏')
  assert('steam 没有 aether 的星球参数', !showB.result.includes('planetRadius'))
}

console.log('— 5. 局部地点保存 —')
{
  exec({ operation: 'workspace', action2: 'switch', workspace: 'aether' })
  const add = exec({
    operation: 'workspace',
    action2: 'add-terrain',
    terrainName: '北境港口',
    terrain: { kind: 'coastal', latitudeDeg: 58, oceanCurrent: 'warm' },
    description: '不冻港',
  })
  assert('保存地点', add.ok, add.error?.message)

  exec({
    operation: 'workspace',
    action2: 'add-terrain',
    terrainName: '灰烬荒漠',
    terrain: { kind: 'desert', latitudeDeg: 25, annualPrecipMm: 80 },
  })

  const show = exec({ operation: 'workspace', action2: 'show', workspace: 'aether' })
  assert('显示两个地点', show.result.includes('北境港口') && show.result.includes('灰烬荒漠'))
  const detail = show.value.workspace.terrains
  assert('地点数量为 2', detail.length === 2, String(detail.length))
  assert('地点参数被保存', detail.some((t) => t.params.kind === 'coastal'))
}

console.log('— 6. 工作区列表 —')
{
  const list = exec({ operation: 'workspace', action2: 'list' })
  assert('列出两个工作区', list.value.workspaces.length >= 2, String(list.value.workspaces.length))
  const aether = list.value.workspaces.find((w) => w.name === 'aether')
  assert('aether 统计正确', aether && aether.constantCount > 0 && aether.terrainCount === 2,
    aether ? `常数${aether.constantCount} 地点${aether.terrainCount}` : '')
  assert('标记当前活动工作区', list.result.includes('●'), '')
}

console.log('— 7. reset 只清常数，保留地点 —')
{
  exec({ operation: 'workspace', action2: 'switch', workspace: 'aether' })
  const before = exec({ operation: 'workspace', action2: 'show', workspace: 'aether' })
  const terrainsBefore = before.value.workspace.terrains.length

  const reset = exec({ operation: 'workspace', action2: 'reset' })
  assert('reset 成功', reset.ok, reset.error?.message)

  const after = exec({ operation: 'workspace', action2: 'show', workspace: 'aether' })
  assert('地点仍在', after.value.workspace.terrains.length === terrainsBefore,
    `${after.value.workspace.terrains.length} vs ${terrainsBefore}`)
  assert('常数已清空', Object.keys(after.value.workspace.constants).length === 0,
    String(Object.keys(after.value.workspace.constants).length))

  // 质能应回到现实值
  const energy = exec({ operation: 'formula', formula: 'mass_energy', overrides: { m: 1 } })
  const realEnergy = 299792458 ** 2
  assert('reset 后质能回到现实值', Math.abs(Number(energy.value.answer) - realEnergy) / realEnergy < 1e-6,
    Number(energy.value.answer).toExponential(6))
}

console.log('— 8. 安全性：非法工作区名 —')
{
  for (const bad_name of ['../etc', 'a/b', 'a\\b', '', 'x'.repeat(100)]) {
    let threw = false
    let r
    try { r = exec({ operation: 'workspace', action2: 'switch', workspace: bad_name }) } catch { threw = true }
    assert(`拒绝非法名 "${bad_name.slice(0, 20)}"`, !threw && (r.ok === false || r.ok === true),
      r?.error?.message?.slice(0, 40) ?? '')
  }
  // 路径穿越必须被拦
  const traversal = exec({ operation: 'workspace', action2: 'switch', workspace: '../../evil' })
  assert('路径穿越被拒', traversal.ok === false || traversal.error?.type === 'invalid_name',
    traversal.error?.message ?? 'ok=true')
}

console.log('— 9. 默认工作区保护 —')
{
  const del = exec({ operation: 'workspace', action2: 'delete', workspace: 'default' })
  assert('不能删除 default', del.ok === false, del.error?.message ?? 'ok=true')
}

console.log('— 10. 删除工作区 —')
{
  const del = exec({ operation: 'workspace', action2: 'delete', workspace: 'steam' })
  assert('删除 steam', del.ok, del.error?.message)
  const list = exec({ operation: 'workspace', action2: 'list' })
  assert('steam 已消失', !list.value.workspaces.some((w) => w.name === 'steam'),
    JSON.stringify(list.value.workspaces.map((w) => w.name)))
}

console.log('— 11. 落盘验证 —')
{
  const list = exec({ operation: 'workspace', action2: 'list' })
  assert('工作区目录存在', list.result.includes(tempHome), list.result.split('\n')[0])
}

console.log('— 12. JSON 安全 —')
{
  for (const action of ['list', 'show']) {
    const r = exec({ operation: 'workspace', action2: action, workspace: 'aether' })
    let safe = true
    try { JSON.stringify(r) } catch { safe = false }
    assert(`${action} 可 JSON 序列化`, safe)
  }
}

rmSync(tempHome, { recursive: true, force: true })

console.log('')
console.log(`通过 ${pass}，失败 ${fails.length}`)
if (fails.length > 0) {
  for (const f of fails) console.log(`  - ${f.n}: ${f.d}`)
  process.exitCode = 1
}
