/**
 * 物理量分类与缩放律测试。
 *
 * 核心验证：
 *   1. 导出量必须精确还原现实值
 *   2. 缩放指数必须等于理论值（量纲分析的判据）
 *   3. 设定量绝不随常数变（这是"不篡改用户设定"的核心保证）
 *   4. 受限量的上限必须随常数变
 *   5. 该变与不该变的判断必须正确
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempHome = mkdtempSync(join(tmpdir(), 'dsh-quant-test-'))
process.env.DSH_MATH_CALC_HOME = tempHome

const mod = await import('../lib/index.js')
const q = await import('../lib/quantities.js')
const exec = (a) => mod.runMathTool(a)

let pass = 0
const fails = []
function ok(n, d) { pass++; console.log('  ok   ' + n + (d ? ': ' + d : '')) }
function bad(n, d) { fails.push({ n, d }); console.log('  FAIL ' + n + '\n         ' + d) }
function assert(n, c, d) { if (c) ok(n, d); else bad(n, d || '') }

console.log('-- 1. 导出量必须还原现实值 --')
{
  const result = q.computeQuantities({})
  let maxErr = 0
  let worstName = ''
  for (const item of result.derived) {
    const reference = q.QUANTITY_INDEX.get(item.id).standard
    const err = Math.abs(item.standard - reference) / Math.abs(reference)
    if (err > maxErr) { maxErr = err; worstName = item.name }
  }
  assert('导出量最大偏差 < 0.01%（实际 ' + (maxErr * 100).toFixed(4) + '%, ' + worstName + '）',
    maxErr < 1e-4, (maxErr * 100).toFixed(4) + '%')
  assert('导出量数量 >= 19', result.derived.length >= 19, String(result.derived.length))
}

console.log('-- 2. 缩放指数必须等于理论值 --')
{
  const checks = [
    ['planckLength', 'G', 0.5],
    ['planckLength', 'c', -1.5],
    ['planckMass', 'G', -0.5],
    ['planckTime', 'G', 0.5],
    ['bohrRadius', 'me', -1],
    ['bohrRadius', 'e_charge', -2],
    ['bohrRadius', 'c', 0],
    ['bohrRadius', 'G', 0],
    ['rydbergEnergy', 'e_charge', 4],
    ['rydbergEnergy', 'h', -2],
    ['fineStructure', 'c', -1],
    ['stefanBoltzmann', 'c', -2],
    ['stefanBoltzmann', 'kB', 4],
    ['escapeVelocity', 'G', 0.5],
    ['surfaceGravity', 'G', 1],
    ['maxBodySize', 'G', -1],
    ['maxMountainHeight', 'G', -1],
  ]
  for (const triple of checks) {
    const item = q.QUANTITY_INDEX.get(triple[0])
    const exponent = q.scalingExponent(item, triple[1])
    assert(
      triple[0] + ' vs ' + triple[1] + ' 指数 = ' + triple[2],
      Math.abs(exponent - triple[2]) < 0.01,
      exponent.toFixed(4),
    )
  }
}

console.log('-- 3. 设定量绝不随常数变（核心保证）--')
{
  for (const overrides of [{ G: 2.6e-10 }, { c: 1.5e8 }, { e_charge: 3e-19 }, { G: 1e-11, c: 1e8 }]) {
    const result = q.computeQuantities(overrides)
    const anyChanged = result.setting.some((item) => item.changed)
    assert('改 ' + JSON.stringify(overrides) + ' 时设定量不变', !anyChanged,
      JSON.stringify(result.setting.filter((i) => i.changed).map((i) => i.name)))
  }
}

console.log('-- 4. 受限量上限必须随常数变 --')
{
  const result = q.computeQuantities({ G: 1.33486e-10 }) // G 翻倍
  const bodySize = result.bounded.find((b) => b.id === 'maxBodySize')
  assert('G 翻倍 → 体型上限减半', bodySize && Math.abs(bodySize.ratio - 0.5) < 0.01,
    bodySize ? bodySize.ratio.toFixed(4) : '未找到')
  const gravity = result.bounded.find((b) => b.id === 'surfaceGravity')
  assert('G 翻倍 → 表面重力翻倍', gravity && Math.abs(gravity.ratio - 2) < 0.01,
    gravity ? gravity.ratio.toFixed(4) : '未找到')
}

console.log('-- 5. 与常数无关的量必须不变 --')
{
  const result = q.computeQuantities({ G: 2.6e-10 })
  for (const id of ['bohrRadius', 'rydbergEnergy', 'fineStructure', 'stefanBoltzmann']) {
    const item = result.derived.find((d) => d.id === id)
    assert('- ' + id + ' 不受 G 影响', item && !item.changed, item ? item.relativeChange.toExponential(2) : '')
  }
  // 反向：改 c 不该影响玻尔半径（它不含 c）
  const cResult = q.computeQuantities({ c: 1.5e8 })
  const bohr = cResult.derived.find((d) => d.id === 'bohrRadius')
  assert('- 玻尔半径不受 c 影响（定义式不含 c）', bohr && !bohr.changed,
    bohr ? bohr.relativeChange.toExponential(2) : '')
}

console.log('-- 6. operation=quantities 输出结构 --')
{
  const r = exec({ operation: 'quantities', constants: { G: 1.3e-10 }, constantName: 'G' })
  assert('运行成功', r.ok, r.error?.message)
  assert('含 derived', Array.isArray(r.value.derived) && r.value.derived.length > 0)
  assert('含 setting', Array.isArray(r.value.setting) && r.value.setting.length > 0)
  assert('含 bounded', Array.isArray(r.value.bounded) && r.value.bounded.length > 0)
  assert('含 exponents', Array.isArray(r.value.exponents) && r.value.exponents.length > 0)
  assert('文本有分类标题', r.result.includes('导出量') && r.result.includes('设定量') && r.result.includes('受限量'))
  assert('文本有判据说明', r.result.includes('该不该变'))
}

console.log('-- 7. 不带参数也能用（列出全部）--')
{
  const r = exec({ operation: 'quantities' })
  assert('无参数成功', r.ok, r.error?.message)
  assert('列出全部物理量', r.result.includes('普朗克长度') && r.result.includes('行星半径'))
}

console.log('-- 8. JSON 安全 --')
{
  const r = exec({ operation: 'quantities', constants: { G: 2.6e-10 } })
  let safe = true
  try { JSON.stringify(r) } catch (e) { safe = false }
  assert('可序列化', safe)
}

console.log('-- 9. 关键物理校验：普朗克尺度 --')
{
  // 普朗克长度 √(ħG/c³)，G 翻倍 → ×√2
  const result = q.computeQuantities({ G: 1.33486e-10 })
  const lP = result.derived.find((d) => d.id === 'planckLength')
  assert('普朗克长度 ×√2', Math.abs(lP.ratio - Math.SQRT2) < 0.001,
    lP.ratio.toFixed(5) + ' vs ' + Math.SQRT2.toFixed(5))

  // 玻尔半径 ∝ 1/me：me 翻倍 → 半径减半
  const meResult = q.computeQuantities({ me: 1.8218767403e-30 })
  const a0 = meResult.derived.find((d) => d.id === 'bohrRadius')
  assert('me 翻倍 → 玻尔半径减半', Math.abs(a0.ratio - 0.5) < 0.001, a0.ratio.toFixed(5))
}

rmSync(tempHome, { recursive: true, force: true })

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  - ' + f.n + ': ' + f.d)
  process.exitCode = 1
}
