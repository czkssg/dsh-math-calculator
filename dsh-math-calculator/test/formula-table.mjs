/**
 * 工作区公式表测试。
 *
 * 核心验证：
 *   1. 公式里的常量必须跟随工作区常数（这是需求核心）
 *   2. 公式表必须按工作区隔离（A 改公式不影响 B）
 *   3. 覆盖/自定义/停用/重置都要生效
 *   4. 表达式校验要拦住非法符号
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempHome = mkdtempSync(join(tmpdir(), 'dsh-ftable-test-'))
process.env.DSH_MATH_CALC_HOME = tempHome

const mod = await import('../lib/index.js')
const exec = (a) => mod.runMathTool(a)
const ft = (extra) => exec({ operation: 'formula-table', ...extra })
const ws = (action2, extra) => exec({ operation: 'workspace', action2, ...extra })
const setConstants = (c) => exec({ operation: 'constants', constants: c })

let pass = 0
const fails = []
function ok(n, d) { pass++; console.log('  ok   ' + n + (d ? ': ' + d : '')) }
function bad(n, d) { fails.push({ n, d }); console.log('  FAIL ' + n + '\n         ' + d) }
function assert(n, c, d) { if (c) ok(n, d); else bad(n, d || '') }

console.log('-- 1. 核心：公式里的常量必须跟随工作区常数 --')
{
  ws('create', { workspace: 'earth-like' })
  // 现实宇宙：1kg 质能
  const before = exec({ operation: 'formula', formula: 'mass_energy', overrides: { m: 1 } })
  const energyBefore = Number(before.value.answer)

  // 改 c 减半
  setConstants({ c: 1.5e8 })
  const after = exec({ operation: 'formula', formula: 'mass_energy', overrides: { m: 1 } })
  const energyAfter = Number(after.value.answer)

  const ratio = energyAfter / energyBefore
  // 注意：1.5e8 不是恰好一半（一半是 1.49896e8），所以比值是 (1.5/2.9979)^{2} = 0.250346
  const expectedRatio = (1.5e8 / 299792458) ** 2
  assert('改 c 后质能公式的常量跟着变', Math.abs(ratio - expectedRatio) < 1e-6,
    ratio.toFixed(6) + ' vs ' + expectedRatio.toFixed(6))
  assert('结果文本里 c 用的是新值', after.result.includes('1.5') || after.result.includes('150000000'), after.result.slice(0, 150))
}

console.log('-- 2. 引力公式的 G 也必须跟随 --')
{
  setConstants({ c: 299792458, G: 1.33486e-10 }) // G 翻倍，c 复原
  const r = exec({ operation: 'formula', formula: 'gravitation', overrides: { m1: 1, m2: 1, r: 1 } })
  const force = Number(r.value.answer)
  // G 翻倍 → 力翻倍
  assert('万有引力 G 跟随（力翻倍）', Math.abs(force - 2 * 6.6743e-11) < 1e-20,
    force.toExponential(6) + ' vs ' + (2 * 6.6743e-11).toExponential(6))
}

console.log('-- 3. 公式表按工作区隔离 --')
{
  // earth-like 改了常数，再加一个覆盖
  ft({ tableAction: 'override', formulaId: 'kinetic_energy', newExpression: 'm * v^2' }) // 去掉 0.5
  const inA = exec({ operation: 'formula', formula: 'kinetic_energy', overrides: { m: 2, v: 3 } })
  const kineticA = Number(inA.value.answer)

  // 切到新工作区
  ws('create', { workspace: 'pure' })
  const inB = exec({ operation: 'formula', formula: 'kinetic_energy', overrides: { m: 2, v: 3 } })
  const kineticB = Number(inB.value.answer)

  assert('A 的公式覆盖生效（无 0.5）', Math.abs(kineticA - 18) < 1e-6, String(kineticA))
  assert('B 未受影响（标准 0.5mv²）', Math.abs(kineticB - 9) < 1e-6, String(kineticB))
  assert('两工作区结果不同', kineticA !== kineticB, kineticA + ' vs ' + kineticB)

  // 常数也应隔离
  const massB = exec({ operation: 'formula', formula: 'mass_energy', overrides: { m: 1 } })
  const energyB = Number(massB.value.answer)
  assert('B 用现实常数', Math.abs(energyB - 299792458 ** 2) / 299792458 ** 2 < 1e-6,
    energyB.toExponential(4))
}

console.log('-- 4. 覆盖现有公式 --')
{
  ws('switch', { workspace: 'earth-like' })
  const r = ft({ tableAction: 'override', formulaId: 'kinetic_energy', newExpression: 'm * v^2' })
  assert('覆盖成功', r.ok, r.error?.message)
  assert('提示覆盖了 kinetic_energy', r.result.includes('kinetic_energy'), r.result.split('\n')[0])
}

console.log('-- 5. 改公式的参数默认值 --')
{
  const r = ft({ tableAction: 'override', formulaId: 'compound_interest', newParams: { r: 0.05, n: 12 } })
  assert('改参数成功', r.ok, r.error?.message)

  // 验证参数确实变了
  const calc = exec({ operation: 'formula', formula: 'compound_interest', overrides: { P: 1000, t: 1 } })
  // 1000*(1+0.05/12)^12 ≈ 1051.16
  const expected = 1000 * Math.pow(1 + 0.05 / 12, 12)
  assert('参数默认值已生效', Math.abs(Number(calc.value.answer) - expected) < 0.01,
    Number(calc.value.answer).toFixed(2) + ' vs ' + expected.toFixed(2))
}

console.log('-- 6. 停用公式 --')
{
  const r = ft({ tableAction: 'disable', formulaId: 'kinetic_energy' })
  assert('停用成功', r.ok, r.error?.message)

  const lookup = exec({ operation: 'formulas', query: 'kinetic_energy' })
  assert('停用后在检索里消失', !lookup.value.matches.includes('kinetic_energy'),
    JSON.stringify(lookup.value.matches))

  const enable = ft({ tableAction: 'enable', formulaId: 'kinetic_energy' })
  assert('重新启用', enable.ok, enable.error?.message)
  const after = exec({ operation: 'formulas', query: 'kinetic_energy' })
  assert('启用后恢复', after.value.matches.includes('kinetic_energy'))
}

console.log('-- 7. 自定义公式 --')
{
  const r = ft({
    tableAction: 'add',
    customFormula: {
      id: 'my_force',
      name: '我的力公式',
      category: 'custom/test',
      expression: 'k * x^2',
      params: { k: { value: 3, desc: '系数' }, x: { value: null, desc: '位移' } },
      unit: 'N',
      description: '测试用自定义公式',
    },
  })
  assert('新增成功', r.ok, r.error?.message)

  const calc = exec({ operation: 'formula', formula: 'my_force', overrides: { x: 2 } })
  assert('能调用自定义公式', calc.ok, calc.error?.message)
  assert('计算结果正确 (3*4=12)', Math.abs(Number(calc.value.answer) - 12) < 1e-9,
    String(calc.value.answer))

  // 自定义公式也应隔离
  ws('switch', { workspace: 'pure' })
  const inB = exec({ operation: 'formula', formula: 'my_force', overrides: { x: 2 } })
  assert('B 工作区看不到自定义公式', inB.ok === false, inB.error?.type ?? 'ok=true')
}

console.log('-- 8. 自定义公式里用物理常数 --')
{
  ws('switch', { workspace: 'earth-like' })
  const r = ft({
    tableAction: 'add',
    customFormula: {
      id: 'my_gravity',
      name: '自定义引力',
      expression: 'G * m1 * m2 / r^2 * 2',
      params: { m1: { value: null, desc: '质量1' }, m2: { value: null, desc: '质量2' }, r: { value: null, desc: '距离' } },
    },
  })
  assert('含 G 的自定义公式可以新增', r.ok, r.error?.message)

  const calc = exec({ operation: 'formula', formula: 'my_gravity', overrides: { m1: 1, m2: 1, r: 1 } })
  const force = Number(calc.value.answer)
  // earth-like 的 G 是 1.33486e-10（翻倍），再 ×2 = 4×6.6743e-11
  assert('自定义公式里的 G 跟随工作区常数', Math.abs(force - 4 * 6.6743e-11) < 1e-19,
    force.toExponential(6))
}

console.log('-- 9. 表达式校验 --')
{
  const bad1 = ft({ tableAction: 'override', formulaId: 'kinetic_energy', newExpression: 'm * v * unknown_symbol' })
  assert('未声明符号被拒', bad1.ok === false, bad1.error?.message ?? 'ok=true')

  const bad2 = ft({ tableAction: 'override', formulaId: 'kinetic_energy', newExpression: 'm * * v' })
  assert('语法错误被拒', bad2.ok === false, bad2.error?.message ?? 'ok=true')

  const bad3 = ft({ tableAction: 'override', formulaId: 'nonexistent_formula', newExpression: '1+1' })
  assert('不存在的公式被拒', bad3.ok === false, bad3.error?.message ?? 'ok=true')
}

console.log('-- 10. 查看公式表 --')
{
  const r = ft({ tableAction: 'show' })
  assert('显示成功', r.ok, r.error?.message)
  assert('显示工作区名', r.result.includes('earth-like'))
  assert('显示覆盖数量', r.result.includes('被覆盖'))
  assert('显示自定义', r.result.includes('自定义'))
}

console.log('-- 11. 移除与重置 --')
{
  const remove = ft({ tableAction: 'remove', formulaId: 'kinetic_energy' })
  assert('移除覆盖', remove.ok, remove.error?.message)

  const calc = exec({ operation: 'formula', formula: 'kinetic_energy', overrides: { m: 2, v: 3 } })
  assert('移除后恢复标准公式 (0.5*2*9=9)', Math.abs(Number(calc.value.answer) - 9) < 1e-6,
    String(calc.value.answer))

  const reset = ft({ tableAction: 'reset' })
  assert('重置公式表', reset.ok, reset.error?.message)

  const afterReset = ft({ tableAction: 'show' })
  assert('重置后无覆盖', afterReset.result.includes('还没有改动'))
}

console.log('-- 12. JSON 安全 --')
{
  const r = ft({ tableAction: 'show' })
  let safe = true
  try { JSON.stringify(r) } catch (e) { safe = false }
  assert('可序列化', safe)
}

rmSync(tempHome, { recursive: true, force: true })

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  - ' + f.n + ': ' + f.d)
  process.exitCode = 1
}
