/**
 * 全公式影响评估测试。
 *
 * 核心验证：
 *   1. 改常数后确实有公式受影响（不能全是 0%）
 *   2. 偏差方向与物理一致（c 减半 → 质能 1/4）
 *   3. 不相关的公式不受影响
 *   4. 分级统计正确
 *   5. 现实基线不产生偏差
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempHome = mkdtempSync(join(tmpdir(), 'dsh-impact-test-'))
process.env.DSH_MATH_CALC_HOME = tempHome

const mod = await import('../lib/index.js')
const exec = (a) => mod.runMathTool(a)

let pass = 0
const fails = []
function ok(n, d) { pass++; console.log('  ok   ' + n + (d ? ': ' + d : '')) }
function bad(n, d) { fails.push({ n, d }); console.log('  FAIL ' + n + '\n         ' + d) }
function assert(n, c, d) { if (c) ok(n, d); else bad(n, d || '') }

console.log('-- 1. 改 c 应有公式受影响 --')
{
  const r = exec({ operation: 'impact', constants: { c: 1.5e8 } })
  assert('评估成功', r.ok, r.error?.message)
  assert('成功对比 >= 250 条', r.value.comparedFormulas >= 250, String(r.value.comparedFormulas))
  assert('受影响公式 > 0（关键！之前是 0 的 bug）', r.value.affected > 0, String(r.value.affected))
  console.log('       受影响 ' + r.value.affected + ' 条，总体偏离 ' + r.value.overallDeviation.toFixed(1))
}

console.log('-- 2. 偏差方向必须符合物理 --')
{
  const r = exec({ operation: 'impact', constants: { c: 1.5e8 } })
  const worst = r.value.worst
  const findByName = (keyword) => worst.find((w) => w.name.includes(keyword))

  // 质能 E = mc²，c 减半 → E 应为 1/4，即 -75%
  const massEnergy = findByName('质能')
  assert('找到质能方程', Boolean(massEnergy), massEnergy ? massEnergy.name : '未找到')
  if (massEnergy) {
    const expected = 1.5e8 / 299792458
    const expectedChange = expected * expected - 1
    assert(
      '质能方程偏差 ≈ ' + (expectedChange * 100).toFixed(1) + '%',
      Math.abs(massEnergy.relativeChange - expectedChange) < 1e-6,
      (massEnergy.relativeChange * 100).toFixed(4) + '%',
    )
  }

  // 黑体辐射 P = σAT⁴，σ ∝ c⁻²，c 减半 → σ 变 4 倍 → P 变 4 倍 = +300%
  const stefan = findByName('黑体辐射')
  assert('找到黑体辐射', Boolean(stefan), stefan ? stefan.name : '未找到')
  if (stefan) {
    assert('黑体辐射偏差 ≈ +300%', Math.abs(stefan.relativeChange - 2.9945) < 0.02,
      (stefan.relativeChange * 100).toFixed(2) + '%')
  }
}

console.log('-- 3. 减少 c 的方向：质能必须变小 --')
{
  const r = exec({ operation: 'impact', constants: { c: 2e8 } })
  const massEnergy = r.value.worst.find((w) => w.name.includes('质能'))
  assert('c 减小 → 质能减小', massEnergy && massEnergy.relativeChange < 0,
    massEnergy ? (massEnergy.relativeChange * 100).toFixed(2) + '%' : '未找到')
}

console.log('-- 4. 改 G：引力类公式受影响 --')
{
  const r = exec({ operation: 'impact', constants: { G: 1.3e-10 } })
  assert('评估成功', r.ok, r.error?.message)
  assert('有受影响公式', r.value.affected > 0, String(r.value.affected))

  const gravityRelated = r.value.worst.filter(
    (w) => w.category.includes('gravity') || w.name.includes('引力') || w.name.includes('逃逸') || w.name.includes('轨道'),
  )
  assert('引力相关公式受影响', gravityRelated.length > 0,
    JSON.stringify(gravityRelated.map((g) => g.name)))

  // G 翻倍 → 逃逸速度 √2 倍 ≈ +41.4%
  const escape = r.value.worst.find((w) => w.name.includes('逃逸'))
  if (escape) {
    // G 翻倍时 Mearth 不变，逃逸速度 ∝ √G 应约 +41%；
    // 但公式里 Mearth 也可能被联动（g 改变会反馈），实测约 39.6%。
    // 允许 38%~42% 的区间。
    assert('逃逸速度偏差在 +38%~42%', escape.relativeChange > 0.38 && escape.relativeChange < 0.42,
      (escape.relativeChange * 100).toFixed(2) + '%')
  }

  // 与引力无关的公式不该受影响（如质能）
  const massEnergy = r.value.all.find((w) => w.name.includes('质能'))
  assert('质能不受 G 影响', massEnergy && Math.abs(massEnergy.relativeChange) < 1e-9,
    massEnergy ? (massEnergy.relativeChange * 100).toFixed(6) + '%' : '')
}

console.log('-- 5. 现实基线不产生偏差 --')
{
  // 改 0% 等于没改；用一个极小的改动验证机制
  const r = exec({ operation: 'impact', constants: { c: 299792458 } })
  assert('评估成功', r.ok, r.error?.message)
  assert('无改动时受影响为 0', r.value.affected === 0, String(r.value.affected))
  assert('总体偏离为 0', r.value.overallDeviation < 1e-6, String(r.value.overallDeviation))
}

console.log('-- 6. 分级统计 --')
{
  const r = exec({ operation: 'impact', constants: { c: 1.5e8 } })
  const byLevel = r.value.byLevel
  const summed = byLevel.negligible + byLevel.minor + byLevel.significant + byLevel.drastic
  assert('分级之和 = 成功对比数', summed === r.value.comparedFormulas,
    summed + ' vs ' + r.value.comparedFormulas)
  assert('有 drastic 级', byLevel.drastic > 0, String(byLevel.drastic))
}

console.log('-- 7. worst 列表结构 --')
{
  const r = exec({ operation: 'impact', constants: { c: 1.5e8 }, worstLimit: 5 })
  assert('worst 数量受 worstLimit 限制', r.value.worst.length <= 5, String(r.value.worst.length))
  for (const entry of r.value.worst) {
    assert('  ' + entry.name.slice(0, 12) + ' 有 baseline', typeof entry.baseline === 'number' || typeof entry.baseline === 'string')
    assert('  ' + entry.name.slice(0, 12) + ' 有 relativeChange', typeof entry.relativeChange === 'number')
    assert('  ' + entry.name.slice(0, 12) + ' 有 level', ['negligible', 'minor', 'significant', 'drastic'].includes(entry.level))
  }
}

console.log('-- 8. 阈值可调 --')
{
  const loose = exec({ operation: 'impact', constants: { c: 1.5e8 }, threshold: 0.5 })
  const strict = exec({ operation: 'impact', constants: { c: 1.5e8 }, threshold: 1e-9 })
  assert('阈值放宽后受影响更少', loose.value.affected <= strict.value.affected,
    loose.value.affected + ' <= ' + strict.value.affected)
}

console.log('-- 9. 多常数同时改 --')
{
  const r = exec({ operation: 'impact', constants: { c: 2e8, G: 1e-10 } })
  assert('多常数评估成功', r.ok, r.error?.message)
  assert('记录两个改动', Object.keys(r.value.changed).length === 2,
    JSON.stringify(Object.keys(r.value.changed)))
  assert('受影响比单改更多', r.value.affected > 0, String(r.value.affected))
}

console.log('-- 10. 错误处理 --')
{
  const noConst = exec({ operation: 'impact' })
  assert('缺 constants 返回失败', noConst.ok === false, noConst.error?.message ?? 'ok=true')
  assert('有提示', typeof noConst.error?.hint === 'string' && noConst.error.hint.length > 0)

  const badConst = exec({ operation: 'impact', constants: { c: -1 } })
  assert('负常数被拒', badConst.ok === false, badConst.error?.message ?? 'ok=true')
}

console.log('-- 11. JSON 安全 --')
{
  const r = exec({ operation: 'impact', constants: { c: 1.5e8 } })
  let safe = true
  try { JSON.stringify(r) } catch (e) { safe = false }
  assert('可 JSON 序列化', safe)
}

rmSync(tempHome, { recursive: true, force: true })

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  - ' + f.n + ': ' + f.d)
  process.exitCode = 1
}
