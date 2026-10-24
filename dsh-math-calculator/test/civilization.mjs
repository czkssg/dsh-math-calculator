/**
 * 目录4 宏观文明推演测试。
 */
import { energyLimits, materialLimits, transportLimits, techTree, runCivilization } from '../lib/civilization.js'
import { deriveConstraintContext } from '../lib/feasibility.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

const earthCtx = deriveConstraintContext({})

console.log('-- 1. 4.1 能量与热力学 --')
{
  const limits = energyLimits(earthCtx, {})
  assert('至少 4 项', limits.length >= 4, String(limits.length))
  assert('全部属于 energy 类别', limits.every((l) => l.category === 'energy'))

  const k = limits.find((l) => l.name === '卡尔达肖夫指数')
  assert('地球卡尔达肖夫约 0.72-0.74', k.value > 0.7 && k.value < 0.76, k.value.toFixed(3))
  assert('依据里写明用消耗功率', k.basis.includes('消耗'), k.basis.slice(0, 30))

  const carnot = limits.find((l) => l.name === '卡诺效率上限')
  assert('卡诺效率 0 < η < 1', carnot.value > 0 && carnot.value < 1, carnot.value.toFixed(3))

  const cool = limits.find((l) => l.name === '辐射散热上限')
  assert('散热上限约 460 W/m²', cool.value > 400 && cool.value < 500, cool.value.toFixed(0))

  assert('每项都有依据', limits.every((l) => l.basis.length > 10))
  assert('每项都有敏感参数', limits.every((l) => Array.isArray(l.sensitiveTo) && l.sensitiveTo.length > 0))
}

console.log('-- 2. 4.2 材料与结构 --')
{
  const limits = materialLimits(earthCtx)
  assert('至少 3 项', limits.length >= 3, String(limits.length))
  const building = limits.find((l) => l.name === '建筑高度上限')
  assert('地球建筑上限约 4900 m', building.value > 4000 && building.value < 6000, building.value.toFixed(0))

  const elevator = limits.find((l) => l.name === '太空电梯材料缺口倍数')
  assert('地球缺约 10000 倍', elevator.value > 5000 && elevator.value < 20000, elevator.value.toFixed(0))
  assert('说明为什么不够', elevator.breakthrough.includes('强度') || elevator.breakthrough.includes('材料'))

  // 低重力世界材料缺口应更小
  const lowCtx = deriveConstraintContext({ planetMass: 0.1, planetRadius: 0.6 })
  const lowLimits = materialLimits(lowCtx)
  const lowElevator = lowLimits.find((l) => l.name === '太空电梯材料缺口倍数')
  assert('低重力世界缺口更小', lowElevator.value < elevator.value,
    lowElevator.value.toFixed(0) + ' < ' + elevator.value.toFixed(0))
}

console.log('-- 3. 4.3 空间与交通 --')
{
  const limits = transportLimits(earthCtx, {})
  const orbit = limits.find((l) => l.name === '第一宇宙速度')
  assert('地球第一宇宙速度约 7.9 km/s', orbit.value > 7800 && orbit.value < 8000, orbit.value.toFixed(0))

  const escape = limits.find((l) => l.name === '逃逸速度')
  assert('地球逃逸速度约 11.2 km/s', escape.value > 11000 && escape.value < 11300, escape.value.toFixed(0))
  assert('逃逸速度 = √2 × 环绕速度',
    Math.abs(escape.value / orbit.value - Math.SQRT2) < 0.01,
    (escape.value / orbit.value).toFixed(3))

  const dv = limits.find((l) => l.name === '化学火箭 Δv 上限')
  assert('化学火箭 Δv 约 13.5 km/s', dv.value > 12000 && dv.value < 15000, dv.value.toFixed(0))
  assert('判断能否离开地球', dv.breakthrough.includes('足以') || dv.breakthrough.includes('不够'))

  const star = limits.find((l) => l.name === '星际航行耗时（0.1c）')
  assert('比邻星约 42 年', star.value > 40 && star.value < 45, star.value.toFixed(0))
}

console.log('-- 4. 4.4 技术树 --')
{
  const all = energyLimits(earthCtx, {}).concat(materialLimits(earthCtx), transportLimits(earthCtx, {}))
  const tech = techTree(earthCtx, all)
  assert('至少 4 个分支', tech.length >= 4, String(tech.length))
  assert('每项都有状态', tech.every((t) => ['open', 'locked', 'conditional'].includes(t.status)))
  assert('每项都有理由', tech.every((t) => t.reason.length > 5))

  const rocket = tech.find((t) => t.branch === '化学火箭航天')
  assert('地球化学火箭可航天', rocket.status === 'open', rocket.status)
  const elevator = tech.find((t) => t.branch === '太空电梯')
  assert('地球太空电梯锁死（材料不够）', elevator.status === 'locked', elevator.status)

  // 高重力世界航天应锁死
  const highCtx = deriveConstraintContext({ planetMass: 5, planetRadius: 1.8 })
  const highAll = energyLimits(highCtx, {}).concat(materialLimits(highCtx), transportLimits(highCtx, {}))
  const highTech = techTree(highCtx, highAll)
  const highRocket = highTech.find((t) => t.branch === '化学火箭航天')
  assert('高重力世界化学火箭锁死', highRocket.status === 'locked', highRocket.status)
  assert('给出替代方案', Boolean(highRocket.requirement), String(highRocket.requirement))
}

console.log('-- 5. 完整推演 --')
{
  const civ = runCivilization({})
  assert('极限总数 ≥ 10', civ.limits.length >= 10, String(civ.limits.length))
  assert('三个类别都有',
    ['energy', 'material', 'transport'].every((c) => civ.limits.some((l) => l.category === c)))
  assert('技术树有分支', civ.tech.length > 0, String(civ.tech.length))
  assert('统计总数对得上', civ.summary.open + civ.summary.locked + civ.summary.conditional === civ.tech.length)
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
