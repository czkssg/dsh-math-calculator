/**
 * 多卫星系统测试。
 *
 * 锚点全部是真实量：
 *   地球希尔球 ≈ 1.5×10⁶ km；地月洛希极限 ≈ 1.8×10⁴ km；
 *   月球角直径 0.518°、周期 27.32 天、满月 -12.74 等、潮汐 1.0 倍。
 */
import { analyzeMoonSystem } from '../lib/moons.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass++
    console.log('  ok   ' + name + (detail ? ': ' + detail : ''))
  } else {
    fails.push({ name, detail })
    console.log('  FAIL ' + name + '\n         ' + (detail ?? ''))
  }
}

const EARTH = {
  planetMassKg: 5.9722e24,
  planetRadiusM: 6.371e6,
  planetDensityKgM3: 5514,
  starMassKg: 1.9885e30,
  orbitM: 1.495978707e11,
  planetRotationHours: 23.934,
}

const earthMoon = analyzeMoonSystem({ ...EARTH, moons: [{ massMoon: 1, distanceMoon: 1 }] })

console.log('-- 1. 地球基准（模型必须复现现实）--')
{
  assert('希尔球 ≈ 1.5×10⁶ km', earthMoon.hillRadiusKm > 1.3e6 && earthMoon.hillRadiusKm < 1.7e6, Math.round(earthMoon.hillRadiusKm))
  assert('洛希极限 ≈ 1.8×10⁴ km', earthMoon.rocheLimitKm > 1.6e4 && earthMoon.rocheLimitKm < 2.1e4, Math.round(earthMoon.rocheLimitKm))
  assert('稳定内边界在洛希极限之外', earthMoon.stableInnerKm > earthMoon.rocheLimitKm)
  assert('稳定外边界 ≈ 0.45 希尔球', Math.abs(earthMoon.stableOuterKm / earthMoon.hillRadiusKm - 0.45) < 1e-6)

  const moon = earthMoon.moons[0]
  assert('月球角直径 ≈ 0.518°', Math.abs(moon.angularDiameterDeg - 0.518) < 0.01, moon.angularDiameterDeg.toFixed(3))
  assert('相对月球大小 ≈ 1.0', Math.abs(moon.angularDiameterRelativeMoon - 1) < 0.01, moon.angularDiameterRelativeMoon.toFixed(2))
  assert('月球周期 ≈ 27.3 天', Math.abs(moon.periodDays - 27.3) < 0.4, moon.periodDays.toFixed(2))
  assert('满月视星等 ≈ -12.7', Math.abs(moon.fullMagnitude - -12.74) < 0.15, moon.fullMagnitude.toFixed(2))
  assert('潮汐 ≈ 地球的 1 倍', Math.abs(moon.tidalRelativeMoon - 1) < 0.02, moon.tidalRelativeMoon.toFixed(2))
  assert('月球已被潮汐锁定', moon.tidallyLockedLikely === true)
  assert('系统判定为稳定', earthMoon.stable === true)
  assert('观感描述非空', typeof moon.impression === 'string' && moon.impression.includes('°'), moon.impression.slice(0, 40))
}

console.log('-- 2. 卫星容量与间距 --')
{
  assert('地球可容纳 ≥ 3 颗月球质量卫星', earthMoon.maxMoonCount >= 3, String(earthMoon.maxMoonCount))
  assert('单卫星系统无相邻间距问题', earthMoon.minSpacingMargin === null)

  const spaced = analyzeMoonSystem({ ...EARTH, moons: [{ massMoon: 1, distanceMoon: 1 }, { massMoon: 1, distanceMoon: 3 }] })
  assert('远距离两颗卫星间距足够', spaced.minSpacingMargin !== null && spaced.minSpacingMargin > 1, String(spaced.minSpacingMargin?.toFixed(2)))
  assert('间距足够时系统稳定', spaced.stable === true)

  const crowded = analyzeMoonSystem({ ...EARTH, moons: [{ massMoon: 1, distanceMoon: 1 }, { massMoon: 1, distanceMoon: 1.2 }] })
  assert('靠太近的两颗卫星判为失稳', crowded.stable === false)
  assert('靠太近会给出警告', crowded.warnings.length > 0, crowded.warnings[0]?.slice(0, 40))

  const small = analyzeMoonSystem({ ...EARTH, moons: [{ massMoon: 0.01, distanceMoon: 1 }] })
  assert('小卫星的容量更大', small.maxMoonCount > earthMoon.maxMoonCount, `${small.maxMoonCount} > ${earthMoon.maxMoonCount}`)
}

console.log('-- 3. 边界违规会被抓出来 --')
{
  const far = analyzeMoonSystem({ ...EARTH, moons: [{ massMoon: 1, distanceMoon: 20 }] })
  assert('超远卫星超出希尔球', far.moons[0].outsideHill === true)
  assert('超出希尔球会被警告', far.warnings.length > 0)
  assert('超出希尔球 → 系统不稳定', far.stable === false)

  const near = analyzeMoonSystem({ ...EARTH, moons: [{ massMoon: 1, distanceMoon: 0.02 }] })
  assert('超近卫星进入洛希极限', near.moons[0].insideRoche === true)
  assert('进入洛希极限会被警告', near.warnings.length > 0)
  assert('洛希极限内 → 系统不稳定', near.stable === false)
}

console.log('-- 4. 共振检测 --')
{
  const resonant = analyzeMoonSystem({
    ...EARTH,
    moons: [{ massMoon: 0.1, distanceMoon: 1 }, { massMoon: 0.1, distanceMoon: 1.5874 }],
  })
  assert('1:2 轨道共振被识别', resonant.resonances.some((r) => r.includes('1:2')), resonant.resonances.join('; ') || '(无)')
  assert('共振会写进要点', resonant.highlights.some((h) => h.includes('共振')))
}

console.log('-- 5. 无卫星与多卫星的叙事差异 --')
{
  const none = analyzeMoonSystem({ ...EARTH, moons: [] })
  assert('无卫星时没有月亮条目', none.moons.length === 0)
  assert('无卫星时提示没有潮汐', none.highlights.some((h) => h.includes('没有卫星')))
  assert('无卫星时系统仍算稳定', none.stable === true)

  const three = analyzeMoonSystem({
    ...EARTH,
    moons: [
      { massMoon: 1, distanceMoon: 1 },
      { massMoon: 0.5, distanceMoon: 2.4 },
      { massMoon: 0.2, distanceMoon: 4.2 },
    ],
  })
  assert('三颗卫星全部有观感描述', three.moons.length === 3 && three.moons.every((m) => m.impression.length > 5))
  assert('多卫星提示复合月相', three.highlights.some((h) => h.includes('颗卫星')))
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
