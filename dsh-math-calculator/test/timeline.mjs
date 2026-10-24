/**
 * 补丁1/11 时间轴测试：快慢变量解耦 + 历史临界点。
 */
import {
  buildTimeline, luminosityAt, habitableZone, geologicalHeatAt,
  findCriticalPoints, detectPathLock, renderTimeline,
} from '../lib/timeline.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

console.log('-- 1. 慢变量：恒星亮度 --')
{
  assert('t=0 亮度 1.0', luminosityAt(0) === 1)
  assert('t=10 亮度 2.0', Math.abs(luminosityAt(10) - 2) < 1e-9, String(luminosityAt(10)))
  assert('亮度单调增', luminosityAt(5) > luminosityAt(2))
}

console.log('-- 2. 慢变量：地质热流 --')
{
  assert('t=0 热流 1.0', Math.abs(geologicalHeatAt(0) - 1) < 1e-9)
  assert('t=30 衰减到 1/e', Math.abs(geologicalHeatAt(30) - Math.exp(-10)) < 0.01,
    geologicalHeatAt(30).toExponential(2))
  assert('热流单调减', geologicalHeatAt(5) < geologicalHeatAt(2))
}

console.log('-- 3. 宜居带外移 --')
{
  const hz0 = habitableZone(1)
  const hz2 = habitableZone(2)
  assert('亮度 1 时内边界 0.95', Math.abs(hz0.inner - 0.95) < 0.01, String(hz0.inner))
  assert('亮度 2 时内边界外移', hz2.inner > hz0.inner,
    hz2.inner.toFixed(2) + ' > ' + hz0.inner.toFixed(2))
  assert('外移倍数 = √2', Math.abs(hz2.inner / hz0.inner - Math.SQRT2) < 0.01,
    (hz2.inner / hz0.inner).toFixed(3))
}

console.log('-- 4. 临界点 --')
{
  const points = findCriticalPoints({})
  assert('至少 3 个临界点', points.length >= 3, String(points.length))
  assert('按时间排序', points.every((p, i) => i === 0 || p.tGyr >= points[i - 1].tGyr))
  assert('含湿润温室失控', points.some((p) => p.name.includes('温室')))
  assert('含地质死寂', points.some((p) => p.name.includes('地质')))
  assert('含恒星离开主序', points.some((p) => p.name.includes('主序')))
  assert('每个都说明不可逆原因', points.every((p) => p.irreversible.length > 6))
  assert('每个都说明之后状态', points.every((p) => p.after.length > 6))
}

console.log('-- 5. 时间轴生成 --')
{
  const tl = buildTimeline({ steps: 6, toGyr: 10 })
  assert('6 个采样点', tl.points.length === 6, String(tl.points.length))
  assert('首点 t=0', tl.points[0].tGyr === 0)
  assert('末点 t=10', tl.points[5].tGyr === 10)
  assert('亮度递增', tl.points[5].luminosity > tl.points[0].luminosity)
  assert('热流递减', tl.points[5].geologicalHeat < tl.points[0].geologicalHeat)
  assert('有适用域说明', tl.domain.length > 10, tl.domain.slice(0, 30))
}

console.log('-- 6. 地球轨迹合理性 --')
{
  const tl = buildTimeline({ steps: 11, toGyr: 10 })
  assert('t=0 宜居', tl.points[0].habitable === true)
  assert('t=0 有大气', tl.points[0].hasAtmosphere === true)
  // 不应在前 20 亿年就失去大气
  assert('t=2 仍有大气', tl.points[2].hasAtmosphere === true,
    tl.points[2].note)
  // 后期应失去
  assert('t=10 已失去大气', tl.points[10].hasAtmosphere === false)
}

console.log('-- 7. 路径锁定（补丁11）--')
{
  const points = findCriticalPoints({})
  const critical = points[0]
  // 跨越临界点
  const crossed = detectPathLock(
    { parameter: 1, tGyr: critical.tGyr - 1 },
    { parameter: 1, tGyr: critical.tGyr + 1 },
    points,
  )
  assert('检测到跨越', crossed.locked === true, crossed.explanation.slice(0, 40))
  assert('指出跨越了哪个', Boolean(crossed.crossed), String(crossed.crossed && crossed.crossed.name))
  assert('说明不可逆', crossed.explanation.includes('不可逆') || crossed.explanation.includes('回不去'),
    crossed.explanation.slice(0, 60))

  // 未跨越
  const safe = detectPathLock(
    { parameter: 1, tGyr: 0 },
    { parameter: 1, tGyr: 0.5 },
    points.filter((p) => p.tGyr > 2),
  )
  assert('未跨越不锁定', safe.locked === false, safe.explanation)
}

console.log('-- 8. 渲染 --')
{
  const text = renderTimeline(buildTimeline({ steps: 4 }))
  assert('含时间序列', text.includes('时间序列'))
  assert('含临界点', text.includes('历史临界点'))
  assert('含快慢解耦说明', text.includes('快慢变量解耦'))
  assert('含适用域', text.includes('适用域'))
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
