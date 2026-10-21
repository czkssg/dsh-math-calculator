/**
 * 设定一致性校验测试。
 *
 * 核心验证：
 *   1. 地球基准下合理设定应判安全
 *   2. 超限设定必须被抓出，且给出正确方向
 *   3. 高重力世界的上限必须收缩
 *   4. 低重力世界的上限必须放宽
 *   5. 建议必须有可操作性
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempHome = mkdtempSync(join(tmpdir(), 'dsh-feas-test-'))
process.env.DSH_MATH_CALC_HOME = tempHome

const mod = await import('../lib/index.js')
const feas = await import('../lib/feasibility.js')
const exec = (a) => mod.runMathTool(a)

let pass = 0
const fails = []
function ok(n, d) { pass++; console.log('  ok   ' + n + (d ? ': ' + d : '')) }
function bad(n, d) { fails.push({ n, d }); console.log('  FAIL ' + n + '\n         ' + d) }
function assert(n, c, d) { if (c) ok(n, d); else bad(n, d || '') }

console.log('-- 1. 地球基准上限合理性 --')
{
  const ctx = feas.deriveConstraintContext({})
  assert('地球重力约 9.82', Math.abs(ctx.gravity - 9.82) < 0.05, ctx.gravity.toFixed(3))
  assert('地球空气密度约 1.225', Math.abs(ctx.airDensity - 1.225) < 0.01, ctx.airDensity.toFixed(4))

  const creature = feas.CONSTRAINT_INDEX.get('creatureHeight').limit(ctx)
  assert('陆生生物上限约 25m', Math.abs(creature - 25) < 1, creature.toFixed(2))

  const flying = feas.CONSTRAINT_INDEX.get('flyingCreatureMass').limit(ctx)
  assert('飞行动物上限约 250kg', Math.abs(flying - 250) < 5, flying.toFixed(1))

  const mountain = feas.CONSTRAINT_INDEX.get('mountainHeight').limit(ctx)
  assert('山峰上限约 9km', Math.abs(mountain - 9000) < 200, mountain.toFixed(0))
}

console.log('-- 2. 合理设定应判安全 --')
{
  const report = feas.checkFeasibility({}, {
    creatureHeight: 10,      // 10m 巨兽，地球上限 25m
    buildingHeight: 500,     // 500m 建筑，上限 4900m
    mountainHeight: 4000,    // 4km 山
    cityPopulation: 100000,  // 10 万人口城市
  })
  assert('全部安全', report.violations.length === 0, JSON.stringify(report.violations.map(v => v.name)))
  assert('总判定自洽', report.overall === 'consistent', report.overall)
}

console.log('-- 3. 超限设定必须被抓出 --')
{
  const report = feas.checkFeasibility({}, {
    creatureHeight: 50,      // 50m 巨兽，超 25m 上限 2 倍
  })
  assert('检测到违规', report.violations.length === 1, String(report.violations.length))
  const v = report.violations[0]
  assert('违规项是生物高度', v.id === 'creatureHeight', v.id)
  assert('比值约 2', Math.abs(v.ratio - 2) < 0.1, v.ratio.toFixed(2))
  assert('有解释', typeof v.explanation === 'string' && v.explanation.length > 20)
  assert('有建议', typeof v.suggestion === 'string' && v.suggestion.length > 10, v.suggestion)
  assert('总判定矛盾', report.overall === 'inconsistent', report.overall)
}

console.log('-- 4. 高重力世界：上限必须收缩 --')
{
  // 2 倍地球重力
  const heavy = feas.deriveConstraintContext({ planetMass: 2, planetRadius: 1 })
  assert('重力约 2 倍', Math.abs(heavy.gravityRatio - 1.96) < 0.1, heavy.gravityRatio.toFixed(2))

  const creatureLimit = feas.CONSTRAINT_INDEX.get('creatureHeight').limit(heavy)
  assert('2g 下巨兽上限降到约 12.5m', Math.abs(creatureLimit - 12.5) < 1, creatureLimit.toFixed(1))

  // 同样的 50m 巨兽在 2g 下违规更严重
  const report = feas.checkFeasibility({ planetMass: 2 }, { creatureHeight: 50 })
  assert('2g 下 50m 巨兽违规', report.violations.length === 1)
  assert('2g 下比值更大（约 4）', Math.abs(report.violations[0].ratio - 4) < 0.5,
    report.violations[0].ratio.toFixed(2))
}

console.log('-- 5. 低重力世界：上限必须放宽 --')
{
  const light = feas.deriveConstraintContext({ planetMass: 0.5, planetRadius: 1 })
  assert('重力约 0.5 倍', Math.abs(light.gravityRatio - 0.49) < 0.05, light.gravityRatio.toFixed(2))

  const creatureLimit = feas.CONSTRAINT_INDEX.get('creatureHeight').limit(light)
  assert('低重力下巨兽上限翻倍（约 50m）', creatureLimit > 45, creatureLimit.toFixed(1))

  // 50m 巨兽在低重力世界变成安全的
  const report = feas.checkFeasibility({ planetMass: 0.5 }, { creatureHeight: 50 })
  assert('低重力下 50m 巨兽安全', report.violations.length === 0,
    JSON.stringify(report.violations.map(v => v.name)))
}

console.log('-- 6. 大气密度影响飞行上限 --')
{
  // 高气压 = 高密度，飞行动物可以更大
  const dense = feas.deriveConstraintContext({ pressure: 300000 })
  const denseLimit = feas.CONSTRAINT_INDEX.get('flyingCreatureMass').limit(dense)

  const normal = feas.deriveConstraintContext({})
  const normalLimit = feas.CONSTRAINT_INDEX.get('flyingCreatureMass').limit(normal)

  assert('高气压下飞行上限提高', denseLimit > normalLimit * 2,
    denseLimit.toFixed(0) + ' vs ' + normalLimit.toFixed(0))
}

console.log('-- 7. 边缘判定 --')
{
  // 正好在上限附近
  const ctx = feas.deriveConstraintContext({})
  const limit = feas.CONSTRAINT_INDEX.get('creatureHeight').limit(ctx)
  const report = feas.checkFeasibility({}, { creatureHeight: limit * 0.9 })
  assert('90% 上限判为边缘', report.marginal.length === 1,
    JSON.stringify(report.results.map(r => r.verdict)))
  assert('边缘项有建议', Boolean(report.marginal[0].suggestion))

  const safeReport = feas.checkFeasibility({}, { creatureHeight: limit * 0.5 })
  assert('50% 上限判为安全', safeReport.marginal.length === 0 && safeReport.violations.length === 0)
}

console.log('-- 8. operation=feasibility 输出结构 --')
{
  const r = exec({
    operation: 'feasibility',
    world: { planetMass: 2, planetRadius: 1 },
    claims: { creatureHeight: 50, buildingHeight: 3000 },
  })
  assert('运行成功', r.ok, r.error?.message)
  assert('有 results', Array.isArray(r.value.results) && r.value.results.length === 2)
  assert('有 violations', Array.isArray(r.value.violations))
  assert('文本含校验结果', r.result.includes('校验结果'), r.result.slice(0, 60))
  assert('文本含总判定', r.result.includes('总判定'))
  assert('超限项出现在文本里', r.result.includes('超限说明'), r.result.includes('超限说明') ? '有' : '无')
}

console.log('-- 9. 只列上限（不给 claims）--')
{
  const r = exec({ operation: 'feasibility' })
  assert('运行成功', r.ok, r.error?.message)
  assert('列出全部约束', r.value.limits.length === feas.CONSTRAINTS.length,
    String(r.value.limits.length))
  assert('文本含约束依据', r.result.includes('依据') || r.result.includes('公式'))
}

console.log('-- 10. 城市人口校验 --')
{
  // 地球上限约 98.6 万
  const ok100k = exec({ operation: 'feasibility', claims: { cityPopulation: 500000 } })
  assert('50 万人口城市可行', ok100k.value.violations.length === 0,
    JSON.stringify(ok100k.value.violations))

  const tooBig = exec({ operation: 'feasibility', claims: { cityPopulation: 3000000 } })
  assert('300 万人口城市超限', tooBig.value.violations.length === 1, String(tooBig.value.violations.length))
  assert('建议提到水运', tooBig.value.results[0].suggestion.includes('水运'),
    tooBig.value.results[0].suggestion)
}

console.log('-- 11. JSON 安全 --')
{
  const r = exec({ operation: 'feasibility', world: { planetMass: 2 }, claims: { creatureHeight: 100 } })
  let safe = true
  try { JSON.stringify(r) } catch (e) { safe = false }
  assert('可序列化', safe)

  const listOnly = exec({ operation: 'feasibility', listConstraints: true })
  let safe2 = true
  try { JSON.stringify(listOnly) } catch (e) { safe2 = false }
  assert('只列上限也可序列化', safe2)
}

console.log('-- 12. 未知约束 id 忽略 --')
{
  const r = exec({ operation: 'feasibility', claims: { not_a_constraint: 999 } })
  assert('未知 id 不崩', r.ok, r.error?.message)
  assert('结果为空', r.value.results.length === 0, String(r.value.results.length))
}

rmSync(tempHome, { recursive: true, force: true })

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  - ' + f.n + ': ' + f.d)
  process.exitCode = 1
}
