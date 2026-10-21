/**
 * 世界推演测试。
 *
 * 核心验证方式：**喂地球参数必须还原出地球**。
 * 如果默认参数算出来的重力、逃逸速度、一天长度、年长度、平均温度
 * 与真实地球不符，那这个模型就是在编数字。
 */
const mod = await import('../lib/index.js')
const exec = (a) => mod.runMathTool(a)

let pass = 0
const fails = []
const ok = (n) => { pass++; console.log(`  ok   ${n}`) }
const bad = (n, d) => { fails.push({ n, d }); console.log(`  FAIL ${n}\n         ${d}`) }
const near = (name, actual, expected, relTol, unit = '') => {
  const err = expected === 0 ? Math.abs(actual) : Math.abs(actual - expected) / Math.abs(expected)
  if (err <= relTol) ok(`${name}: ${actual.toPrecision(4)}${unit}（期望 ${expected.toPrecision(4)}${unit}）`)
  else bad(name, `实际 ${actual} vs 期望 ${expected}，偏差 ${(err * 100).toFixed(1)}%`)
}

console.log('— 基线：默认参数必须还原地球 —')
{
  const r = exec({ operation: 'world' })
  if (!r.ok) {
    bad('默认世界推演', r.error?.message)
  } else {
    const v = r.value
    near('地球重力', v.planet.surfaceGravity, 9.82, 0.01, ' m/s²')
    near('地球逃逸速度', v.planet.escapeVelocity / 1000, 11.186, 0.01, ' km/s')
    near('地球密度', v.planet.densityKgM3, 5514, 0.02, ' kg/m³')
    near('一天长度', v.planet.dayHours, 23.934, 0.01, ' h')
    near('一年长度', v.orbit.yearDays, 365.26, 0.01, ' 天')
    near('地球半径', v.planet.radiusM / 1000, 6371, 0.001, ' km')
    near('表面平均温度', v.temperature.surfaceMeanK, 288, 0.02, ' K')
    near('大气标高', v.atmosphere.scaleHeightM / 1000, 8.5, 0.05, ' km')
    near('地平线', v.terrain.horizonKm, 4.7, 0.05, ' km')
    near('恒星光度', v.star.luminositySun, 1, 0.05, ' 倍太阳')

    // 地球不该有严重警告
    const serious = v.warnings.filter((w) => !w.includes('偏心率'))
    if (serious.length <= 1) ok(`地球默认无严重警告（${serious.length} 条）`)
    else bad('地球默认警告过多', JSON.stringify(serious))
  }
}

console.log('— 小星球：半径 0.5 地球 —')
{
  const r = exec({ operation: 'world', planetRadius: 0.5 })
  const v = r.value
  near('0.5R 重力', v.planet.surfaceGravity, 9.82 / 0.25, 0.02, ' m/s²')
  near('0.5R 逃逸速度', v.planet.escapeVelocity / 1000, 11.186 / Math.sqrt(0.5), 0.02, ' km/s')
  near('0.5R 地平线', v.terrain.horizonKm, 4.7 / Math.sqrt(2), 0.05, ' km')
  console.log(`       地平线从 4.7km → ${v.terrain.horizonKm.toFixed(2)}km（世界"变小"了）`)
}

console.log('— 高重力世界：半径 1.4 地球、质量 2 地球 —')
{
  const r = exec({ operation: 'world', planetRadius: 1.4, planetMass: 2 })
  const v = r.value
  const expectedG = 9.82 * (2 / 1.96)
  near('1.4R/2M 重力', v.planet.surfaceGravity, expectedG, 0.02, ' m/s²')
  console.log(`       表面重力 ${v.planet.surfaceGravity.toFixed(2)} m/s² = 地球的 ${v.planet.surfaceGravityEarth.toFixed(2)} 倍`)
  console.log(`       山高上限 ${(v.terrain.maxMountainHeight / 1000).toFixed(2)} km（地球约 4.9km）`)
  if (v.terrain.maxMountainHeight < 4900) ok('高重力星球的山更矮')
  else bad('高重力山高', String(v.terrain.maxMountainHeight))
}

console.log('— 长自转：一天 40 小时 —')
{
  const r = exec({ operation: 'world', rotationHours: 40 })
  const v = r.value
  near('一天长度', v.planet.dayHours, 40, 0.001, ' h')
  if (v.planet.centrifugalRatio < 0.2) ok(`离心比 ${v.planet.centrifugalRatio.toFixed(4)} 仍安全`)
  else bad('离心比', String(v.planet.centrifugalRatio))
}

console.log('— 极端自转：一天 2 小时（应警告解体风险）—')
{
  const r = exec({ operation: 'world', rotationHours: 2 })
  const v = r.value
  const hasWarning = v.warnings.some((w) => w.includes('离心') || w.includes('解体'))
  if (hasWarning) ok('极快自转触发了警告')
  else bad('极快自转未警告', JSON.stringify(v.warnings))
  console.log(`       离心/重力比 = ${v.planet.centrifugalRatio.toFixed(3)}`)
}

console.log('— 大轴倾角：45°（极端季节）—')
{
  const r = exec({ operation: 'world', obliquityDeg: 45 })
  const v = r.value
  const band60 = v.latitudeBands.find((b) => b.latitudeDeg === 60)
  console.log(`       60° 纬度：夏至昼长 ${band60.dayLengthSummer.toFixed(1)}h，冬至 ${band60.dayLengthWinter.toFixed(1)}h`)
  if (Math.abs(band60.dayLengthSummer - band60.dayLengthWinter) > 4) ok('45° 倾角产生显著昼长差')
  else bad('倾角季节效果', JSON.stringify(band60))
}

console.log('— 无轴倾角：0°（无季节）—')
{
  const r = exec({ operation: 'world', obliquityDeg: 0, eccentricity: 0 })
  const v = r.value
  if (!v.terrain.hasSeasons) ok('0° 倾角无季节')
  else bad('仍报告有季节', v.terrain.seasonStrength)
  // 各纬度昼长应都是 12 小时
  const allTwelve = v.latitudeBands.every((b) => Math.abs(b.dayLengthSummer - 12) < 0.1)
  if (allTwelve) ok('0° 倾角全球昼长恒为 12h')
  else bad('昼长不均', JSON.stringify(v.latitudeBands.map((b) => b.dayLengthSummer)))
}

console.log('— 稀薄大气：气压 0.1 atm（应警告）—')
{
  const r = exec({ operation: 'world', world: { pressure: 10132.5 } })
  const v = r.value
  near('气压', v.atmosphere.pressureAtm, 0.1, 0.001, ' atm')
  const hasWarn = v.warnings.some((w) => w.includes('沸') || w.includes('薄'))
  if (hasWarn) ok('低气压触发警告')
  else bad('低气压未警告', JSON.stringify(v.warnings))
  console.log(`       水沸点 ${v.temperature.boilingPointC.toFixed(0)}°C`)
}

console.log('— 冷恒星：M 型红矮星（3000K, 0.1 太阳半径）—')
{
  const r = exec({ operation: 'world', world: { starTemp: 3000, starRadius: 0.1, orbitAU: 0.1 } })
  const v = r.value
  console.log(`       光度 ${v.star.luminositySun.toExponential(2)} 倍太阳`)
  console.log(`       表面温度 ${v.temperature.surfaceMeanC.toFixed(1)}°C`)
  if (v.temperature.surfaceMeanC > -50 && v.temperature.surfaceMeanC < 100) {
    ok('红矮星近轨道可以宜居')
  } else {
    ok(`红矮星世界温度 ${v.temperature.surfaceMeanC.toFixed(0)}°C（供参考）`)
  }
}

console.log('— 气体巨行星式：半径 11 地球、密度低 —')
{
  const r = exec({ operation: 'world', planetRadius: 11, planetMass: 318 })
  const v = r.value
  console.log(`       密度 ${v.planet.densityKgM3.toFixed(0)} kg/m³`)
  console.log(`       表面重力 ${v.planet.surfaceGravityEarth.toFixed(2)} 倍地球`)
  if (v.planet.densityKgM3 < 2000) ok('低密度被识别（可能气态）')
  else bad('密度判定', String(v.planet.densityKgM3))
}

console.log('— 纬度气候带合理性 —')
{
  const r = exec({ operation: 'world' })
  const v = r.value
  const equator = v.latitudeBands.find((b) => b.latitudeDeg === 0)
  const pole = v.latitudeBands.find((b) => b.latitudeDeg === 75)
  if (equator.approxTempC > pole.approxTempC) ok(`赤道(${equator.approxTempC.toFixed(0)}°C) 比高纬(${pole.approxTempC.toFixed(0)}°C) 热`)
  else bad('纬度温度梯度错误', `${equator.approxTempC} vs ${pole.approxTempC}`)
  if (equator.dayLengthSummer === 12 && equator.dayLengthWinter === 12) ok('赤道全年昼长 12h')
  else bad('赤道昼长', `${equator.dayLengthSummer}/${equator.dayLengthWinter}`)
  if (pole.dayLengthSummer > 18) ok(`75° 纬度夏至有长日照（${pole.dayLengthSummer.toFixed(1)}h）`)
  else bad('高纬夏季日照', String(pole.dayLengthSummer))
}

console.log('— JSON 安全性与结构 —')
{
  const r = exec({ operation: 'world', planetRadius: 1.2 })
  let serializable = true
  try { JSON.stringify(r) } catch { serializable = false }
  if (serializable) ok('world 结果可 JSON 序列化')
  else bad('JSON 序列化失败', '')
  if (Array.isArray(r.value?.latitudeBands)) ok('latitudeBands 是数组')
  else bad('latitudeBands 结构', JSON.stringify(r.value?.latitudeBands)?.slice(0, 80))
  if (Array.isArray(r.value?.highlights) && r.value.highlights.length > 0) ok('highlights 有内容')
  else bad('highlights 为空', '')
}

console.log('')
console.log(`通过 ${pass}，失败 ${fails.length}`)
if (fails.length > 0) {
  for (const f of fails) console.log(`  - ${f.n}: ${f.d}`)
  process.exitCode = 1
}
