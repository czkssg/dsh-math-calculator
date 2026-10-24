/**
 * 补丁7 观测者物理过滤测试。
 *
 * 重点验证：同一个世界，不同观测者看到不同结论（人择选择效应）。
 */
import { OBSERVERS, perceive, filterCapabilities, renderObserver } from '../lib/observer.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

const EARTH_G = 9.80665
const EARTH_H = 8500

console.log('-- 1. 观测者档案 --')
{
  assert('至少 6 种观测者', OBSERVERS.length >= 6, String(OBSERVERS.length))
  const kinds = OBSERVERS.map((o) => o.kind)
  assert('含人类', kinds.includes('human'))
  assert('含小型生物', kinds.includes('tiny'))
  assert('含二维生物', kinds.includes('2d'))
  assert('每个都有完整参数', OBSERVERS.every((o) =>
    o.bodyLength > 0 && o.bodyArea > 0 && o.bodyMass > 0 &&
    o.metabolicPower > 0 && o.nerveSpeed > 0 && o.lifespanYears > 0))
  assert('每个都有视觉波段', OBSERVERS.every((o) => Array.isArray(o.visionRange) && o.visionRange.length === 2))
}

console.log('-- 2. 人类基准应自洽 --')
{
  const human = OBSERVERS.find((o) => o.kind === 'human')
  const m = perceive(human, EARTH_G, EARTH_H)
  assert('人类骨比约 5', Math.abs(m.boneRatio - 5) < 0.5, m.boneRatio.toFixed(2))
  assert('与自身比较为 1.00 倍', Math.abs(m.versusHuman.bone - 1) < 0.01, m.versusHuman.bone.toFixed(2))
  assert('身高标高比约 2e-4', Math.abs(m.heightScaleRatio - 2e-4) < 5e-5, m.heightScaleRatio.toExponential(2))
  assert('散热余量 < 1（不过热）', m.heatBalance < 1, m.heatBalance.toFixed(3))
}

console.log('-- 3. 人择选择效应：同世界不同观测者 --')
{
  const human = OBSERVERS.find((o) => o.kind === 'human')
  const tiny = OBSERVERS.find((o) => o.kind === 'tiny')
  const hm = perceive(human, EARTH_G, EARTH_H)
  const tm = perceive(tiny, EARTH_G, EARTH_H)

  assert('小生物骨比更高（更不易压垮）', tm.boneRatio > hm.boneRatio,
    tm.boneRatio.toFixed(1) + ' > ' + hm.boneRatio.toFixed(1))
  assert('小生物身高标高比更低（大气相对更厚）', tm.heightScaleRatio < hm.heightScaleRatio,
    tm.heightScaleRatio.toExponential(2) + ' < ' + hm.heightScaleRatio.toExponential(2))
  assert('相对人类的骨比倍数约 8.5', tm.versusHuman.bone > 5 && tm.versusHuman.bone < 15,
    tm.versusHuman.bone.toFixed(2))

  // 巨型生物散热应更差
  const giant = OBSERVERS.find((o) => o.kind === 'giant')
  const gm = perceive(giant, EARTH_G, EARTH_H)
  assert('巨型生物散热余量更高', gm.heatBalance > hm.heatBalance,
    gm.heatBalance.toFixed(3) + ' > ' + hm.heatBalance.toFixed(3))
}

console.log('-- 4. 重力变化影响所有观测者 --')
{
  const human = OBSERVERS.find((o) => o.kind === 'human')
  const earth = perceive(human, EARTH_G, EARTH_H)
  const highG = perceive(human, EARTH_G * 2, EARTH_H)
  assert('重力翻倍，骨比减半', Math.abs(highG.boneRatio - earth.boneRatio / 2) < 0.1,
    highG.boneRatio.toFixed(2))
  assert('重力越大反应时间比越高', highG.reactionRatio > earth.reactionRatio,
    highG.reactionRatio.toFixed(4) + ' > ' + earth.reactionRatio.toFixed(4))
}

console.log('-- 5. 能力过滤 --')
{
  const human = OBSERVERS.find((o) => o.kind === 'human')
  const aquatic = OBSERVERS.find((o) => o.kind === 'aquatic')
  const twoD = OBSERVERS.find((o) => o.kind === '2d')
  const tiny = OBSERVERS.find((o) => o.kind === 'tiny')

  const hCaps = filterCapabilities(human)
  assert('人类全部可用', hCaps.every((c) => c.available), hCaps.filter((c) => !c.available).map((c) => c.capability).join(','))

  const aCaps = filterCapabilities(aquatic)
  const fire = aCaps.find((c) => c.capability.includes('用火'))
  assert('水生智慧不能用火', fire.available === false, fire.reason)

  const dCaps = filterCapabilities(twoD)
  const build = dCaps.find((c) => c.capability.includes('三维建筑'))
  assert('二维生物不能三维建筑', build.available === false, build.reason)

  const tCaps = filterCapabilities(tiny)
  assert('小生物大型结构受限', tCaps.find((c) => c.capability.includes('大型结构')).available === false)
  assert('小生物长距离航行受限（寿命短）', tCaps.find((c) => c.capability.includes('长距离')).available === false)
}

console.log('-- 6. 渲染 --')
{
  const human = OBSERVERS.find((o) => o.kind === 'human')
  const text = renderObserver(human, EARTH_G, EARTH_H)
  assert('含观测者标题', text.includes('观测者'))
  assert('含体感', text.includes('体感'))
  assert('含能力清单', text.includes('能做什么'))
  assert('含与人类对比', text.includes('人类的'), text.slice(0, 100))
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
