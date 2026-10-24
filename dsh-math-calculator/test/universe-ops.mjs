/**
 * 补丁测试：混沌拦截 / 数据表继承 / A/B 对比。
 */
import { checkChaos, CHAOS_LIBRARY, linkInherit, syncInheritance, loadInheritLinks, diffTables } from '../lib/universe-ops.js'
import { switchWorkspace, resetActiveWorkspace, updateWorkspace, loadWorkspace, workspaceDirectory } from '../lib/workspace.js'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

console.log('-- 1. 混沌拦截器（补丁13）--')
{
  const chaotic = checkChaos(1.0)
  assert('λ>0 判为混沌', chaotic.chaotic === true)
  assert('给出可预测时间', Number.isFinite(chaotic.horizon) && chaotic.horizon > 0, chaotic.horizon.toFixed(1))
  assert('给出概率云', chaotic.spread.length > 0, String(chaotic.spread.length))
  assert('超限处标为不可预测', chaotic.spread.some((p) => Number.isNaN(p.low)))
  assert('说明为什么不给数字', chaotic.advice.includes('不要给确定数值'), chaotic.advice.slice(0, 40))

  const stable = checkChaos(-0.5)
  assert('λ<=0 判为可预测', stable.chaotic === false)
  assert('可预测时无概率云', stable.spread.length === 0)
  assert('建议给确定值', stable.advice.includes('可以给确定数值'))

  // λ 越大，可预测时间越短
  const fast = checkChaos(2.0)
  assert('λ 越大可预测时间越短', fast.horizon < chaotic.horizon, fast.horizon.toFixed(1) + ' < ' + chaotic.horizon.toFixed(1))
}

console.log('-- 2. 混沌库 --')
{
  assert('至少 5 个示例', CHAOS_LIBRARY.length >= 5, String(CHAOS_LIBRARY.length))
  assert('含天气', CHAOS_LIBRARY.some((c) => c.name.includes('大气') || c.name.includes('天气')))
  assert('都带说明', CHAOS_LIBRARY.every((c) => c.note.length > 5))
}

console.log('-- 3. 数据表继承（补丁9）--')
{
  resetActiveWorkspace()
  const dir = workspaceDirectory()
  const linkFile = join(dir, '._inherit.json')
  if (existsSync(linkFile)) rmSync(linkFile, { force: true })
  for (const name of ['base_u', 'derived_u']) {
    const f = join(dir, name + '.json')
    if (existsSync(f)) rmSync(f, { force: true })
  }

  // 建两张表
  switchWorkspace('base_u')
  updateWorkspace('base_u', (w) => ({ ...w, constants: { c: 1e8 } }))
  switchWorkspace('derived_u')
  updateWorkspace('derived_u', (w) => ({ ...w, variables: { own: 42 } }))

  const link = linkInherit('derived_u', 'base_u')
  assert('建立继承成功', link.ok === true, link.message)
  assert('记录到继承链', loadInheritLinks().some((l) => l.derived === 'derived_u' && l.base === 'base_u'))

  // 同步：衍生表拿到基线的常数
  const sync = syncInheritance()
  assert('同步了 1 张表', sync.count === 1, String(sync.count))
  const derived = loadWorkspace('derived_u')
  assert('衍生表继承了 c=1e8', derived.constants?.c === 1e8, String(derived.constants?.c))
  assert('衍生表保留自己的变量', derived.variables?.own === 42, String(derived.variables?.own))

  // 改基线再同步，衍生表应跟着变
  updateWorkspace('base_u', (w) => ({ ...w, constants: { c: 5e7 } }))
  syncInheritance()
  assert('基线改动后衍生表更新', loadWorkspace('derived_u').constants?.c === 5e7,
    String(loadWorkspace('derived_u').constants?.c))

  // 非法继承
  assert('不能继承自己', linkInherit('base_u', 'base_u').ok === false)
  assert('基线不存在时报错', linkInherit('derived_u', 'nope').ok === false)

  for (const name of ['base_u', 'derived_u']) rmSync(join(dir, name + '.json'), { force: true })
  if (existsSync(linkFile)) rmSync(linkFile, { force: true })
  switchWorkspace('default')
}

console.log('-- 4. A/B 对比（补丁3）--')
{
  resetActiveWorkspace()
  const dir = workspaceDirectory()
  for (const name of ['ab_a', 'ab_b']) {
    const f = join(dir, name + '.json')
    if (existsSync(f)) rmSync(f, { force: true })
  }
  switchWorkspace('ab_a')
  updateWorkspace('ab_a', (w) => ({ ...w, constants: { c: 299792458 } }))
  switchWorkspace('ab_b')
  updateWorkspace('ab_b', (w) => ({ ...w, constants: { c: 1e8, G: 7e-11 } }))

  const diff = diffTables('ab_a', 'ab_b')
  assert('对比成功', diff.ok === true, diff.message)
  assert('检测到 2 处常数差异', diff.items.filter((i) => i.kind === 'constant').length === 2,
    String(diff.items.length))
  assert('差异里含 c', diff.items.some((i) => i.name === 'c'), diff.items.map((i) => i.name).join(','))
  assert('差异里含 G', diff.items.some((i) => i.name === 'G'))

  const same = diffTables('ab_a', 'ab_a')
  assert('同表对比无差异', same.items.length === 0, same.message)
  assert('不存在的表报错', diffTables('ab_a', 'nope').ok === false)

  for (const name of ['ab_a', 'ab_b']) rmSync(join(dir, name + '.json'), { force: true })
  switchWorkspace('default')
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
