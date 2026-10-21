/**
 * 天空与星空模块测试。
 *
 * 这些断言的锚点都是**现实中可核对的天文量**：
 *   太阳 5778K → 峰值 501nm、角直径 0.53°、视星等 -26.74
 *   正午天顶偏蓝、日落地平线偏红
 *   无月无光害 → 肉眼极限 6.5 等、全天约 9000 颗星
 */
import { observeSky, describeStar, kelvinToHex, peakWavelengthNm, spectralClassOf, daySky, nightSky } from '../lib/sky.js'

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

/** hex → [r,g,b]。 */
function rgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

const SUN = {
  starTempK: 5778,
  starRadiusM: 6.957e8,
  starLuminosityW: 3.828e26,
  orbitAU: 1,
  pressureAtm: 1,
  sunAltitudeDeg: 60,
}

console.log('-- 1. 恒星颜色与光谱 --')
{
  const star = describeStar(SUN)
  assert('太阳峰值波长 ≈ 501nm', Math.abs(star.peakWavelengthNm - 501) < 6, star.peakWavelengthNm.toFixed(1))
  assert('太阳光谱型 = G', star.spectralClass === 'G', star.spectralClass)
  const [r, g, b] = rgb(star.colorHex)
  assert('太阳颜色接近白（三通道都 > 200）', r > 200 && g > 200 && b > 200, star.colorHex)
  assert('太阳颜色偏暖（红 ≥ 蓝）', r >= b - 2, `r=${r} b=${b}`)
  assert('太阳角直径 ≈ 0.53°', Math.abs(star.angularDiameterDeg - 0.533) < 0.02, star.angularDiameterDeg.toFixed(3))
  assert('太阳视星等 ≈ -26.7', Math.abs(star.apparentMagnitude - -26.74) < 0.1, star.apparentMagnitude.toFixed(2))
  assert('太阳有吸收线描述', typeof star.spectralLines === 'string' && star.spectralLines.length > 5)
  assert('太阳描述含"可见光"', star.description.includes('可见光'), star.description.slice(0, 40))
}

console.log('-- 2. 极端恒星的颜色 --')
{
  const m = describeStar({ ...SUN, starTempK: 3400 })
  const [mr, , mb] = rgb(m.colorHex)
  assert('3400K 偏红（R 明显大于 B）', mr - mb > 60, `r=${mr} b=${mb}`)
  assert('3400K 光谱型 = M', m.spectralClass === 'M', m.spectralClass)
  assert('3400K 峰值落在红外', m.peakWavelengthNm > 700, m.peakWavelengthNm.toFixed(0))

  const bStar = describeStar({ ...SUN, starTempK: 20000, starLuminosityW: 3.828e26 * 100, orbitAU: 10 })
  const [br, , bb] = rgb(bStar.colorHex)
  assert('20000K 偏蓝（B 明显大于 R）', bb - br > 40, `r=${br} b=${bb}`)
  assert('20000K 光谱型 = B', bStar.spectralClass === 'B', bStar.spectralClass)
  assert('20000K 峰值落在紫外', bStar.peakWavelengthNm < 400, bStar.peakWavelengthNm.toFixed(0))
}

console.log('-- 3. 光谱型判据 --')
{
  assert('30000K → O', spectralClassOf(30000) === 'O')
  assert('9000K → A', spectralClassOf(9000) === 'A')
  assert('6500K → F', spectralClassOf(6500) === 'F')
  assert('5000K → K', spectralClassOf(5000) === 'K')
  assert('3000K → M', spectralClassOf(3000) === 'M')
  assert('clamp 低于 1000K 仍给深红', rgb(kelvinToHex(500))[0] > 200 && rgb(kelvinToHex(500))[2] < 60)
}

console.log('-- 4. 白天的天空 --')
{
  const noon = daySky(SUN)
  const [zr, , zb] = rgb(noon.zenithColorHex)
  assert('正午天顶偏蓝（B > R）', zb > zr, `r=${zr} b=${zb}`)
  assert('正午描述提到白天', noon.description.includes('白天'), noon.description.slice(0, 30))

  const sunset = daySky({ ...SUN, sunAltitudeDeg: 2 })
  const [hr, , hb] = rgb(sunset.horizonColorHex)
  assert('日落地平线偏红（R > B）', hr > hb, `r=${hr} b=${hb}`)
  assert('日落描述提到地平线', sunset.description.includes('地平线'), sunset.description.slice(0, 40))

  // 回归：红矮星的白昼是橙金色，不能写死成"蓝"
  const redDay = daySky({ ...SUN, starTempK: 3100 })
  assert('红矮星白昼描述为橙金', redDay.description.includes('橙'), redDay.description.slice(0, 40))
  const blueDay = daySky({ ...SUN, starTempK: 20000 })
  assert('蓝巨星白昼描述为蓝', blueDay.description.includes('蓝'), blueDay.description.slice(0, 40))
}

console.log('-- 5. 夜晚的星空 --')
{
  const dark = nightSky({ ...SUN, sunAltitudeDeg: -30, moons: [], lightPollution: 0 })
  assert('无月无光害：极限星等 ≈ 6.5', Math.abs(dark.limitingMagnitude - 6.5) < 0.3, dark.limitingMagnitude.toFixed(2))
  assert('无月无光害：可见星数约 9000', dark.visibleStars > 6000 && dark.visibleStars < 13000, String(dark.visibleStars))
  assert('无月无光害：银河可见', dark.galaxyVisible === true)
  assert('无月光照度 = 0', dark.moonLightLux === 0, String(dark.moonLightLux))

  const moonlit = nightSky({ ...SUN, sunAltitudeDeg: -30, moons: [{ name: '卫星1', fullMagnitude: -13 }] })
  assert('同时给出无月与满月两种夜', moonlit.darkLimitingMagnitude > moonlit.moonlitLimitingMagnitude)
  assert('满月夜极限星等明显下降', moonlit.moonlitLimitingMagnitude < moonlit.darkLimitingMagnitude - 1, moonlit.moonlitLimitingMagnitude.toFixed(2))
  assert('满月夜可见星数骤减', moonlit.visibleStarsMoonlit < moonlit.visibleStarsDark / 5, `${moonlit.visibleStarsMoonlit} vs ${moonlit.visibleStarsDark}`)
  assert('满月当空：照度 > 0.2 lux', moonlit.moonLightLux > 0.2, moonlit.moonLightLux.toFixed(2))
  assert('月光把夜空调亮', moonlit.moonlitSkyBrightness < moonlit.darkSkyBrightness)

  const city = nightSky({ ...SUN, sunAltitudeDeg: -30, moons: [], lightPollution: 1 })
  assert('强光害：极限星等 < 5', city.limitingMagnitude < 5, city.limitingMagnitude.toFixed(2))
  assert('强光害：银河不可见', city.galaxyVisible === false)

  const noGalaxy = nightSky({ ...SUN, sunAltitudeDeg: -30, moons: [], galaxyBand: 0.05 })
  assert('银河带亮度低 → 银河不可见', noGalaxy.galaxyVisible === false)
}

console.log('-- 6. 综合观测 --')
{
  const report = observeSky(SUN)
  assert('汇总含恒星描述', report.star.colorName.length > 0, report.star.colorName)
  assert('汇总要点 >= 3 条', report.summary.length >= 3, String(report.summary.length))
  assert('汇总提到太阳', report.summary.join('').includes('太阳'))
  const hot = observeSky({ ...SUN, starTempK: 12000 })
  assert('高温恒星提醒偏蓝', hot.summary.join('').includes('偏蓝'))
  const cool = observeSky({ ...SUN, starTempK: 3200 })
  assert('低温恒星提醒偏红', cool.summary.join('').includes('偏红'))
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
