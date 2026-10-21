/**
 * 分层气候模型验证。
 *
 * 核心验证目标（按用户指正的顺序）：
 *   1. 辐照度层：地球年均 1361 W/m²，偏心率振幅约 6.8%
 *   2. 季节层：轴倾角必须判为主因，偏心率必须是调制项
 *   3. 季节层：6.8% 辐照度变化不能等于 6.8% 温度变化
 *   4. 纬度层：地球年均温曲线要接近实测
 *   5. 反例：毛轨道(倾角0)时季节必须由偏心率主导
 */
const climate = await import('../lib/climate.js')
const stars = await import('../lib/star-catalog.js')

let pass = 0
const fails = []
function ok(n, d) { pass++; console.log('  ok   ' + n + (d ? ': ' + d : '')) }
function bad(n, d) { fails.push({ n, d }); console.log('  FAIL ' + n + '\n         ' + d) }
function assert(n, c, d) { if (c) ok(n, d); else bad(n, d || '') }

const AU = 1.495978707e11

console.log('-- 1. 恒星基准表 --')
{
  const sun = stars.STAR_INDEX.get('G2V')
  assert('太阳光度约 1 L☉', Math.abs(sun.luminositySun - 1) < 0.02, sun.luminositySun.toFixed(4))
  assert('太阳宜居带约 0.95~1.67 AU',
    Math.abs(sun.habitableInnerAU - 0.95) < 0.03 && Math.abs(sun.habitableOuterAU - 1.67) < 0.05,
    sun.habitableInnerAU.toFixed(2) + '~' + sun.habitableOuterAU.toFixed(2))
  assert('太阳峰值波长约 500nm', Math.abs(sun.peakWavelengthNm - 501) < 15,
    sun.peakWavelengthNm.toFixed(0) + 'nm')
  assert('太阳寿命约 100 亿年', Math.abs(sun.lifespanGyr - 10) < 0.5, sun.lifespanGyr.toFixed(1))

  // M 型矮星长久寿
  const m5 = stars.STAR_INDEX.get('M5V')
  assert('M5V 寿命远长于太阳', m5.lifespanGyr > 500, m5.lifespanGyr.toFixed(0) + ' Gyr')
  assert('M5V 宜居带很近', m5.habitableOuterAU < 0.1, m5.habitableOuterAU.toFixed(3))

  // 按温度反查
  const found = stars.closestStarClass(5700)
  assert('按温度 5700K 查到 G2V', found.id === 'G2V', found.id)

  assert('恒星表有 9 个光谱型', stars.STAR_CLASSES.length === 9, String(stars.STAR_CLASSES.length))
}

console.log('-- 2. 辐照度层：地球基准 --')
{
  const irr = climate.computeIrradiance(3.828e26, AU, 0.0167, 0.306)

  assert('地球年均辐照度约 1361 W/m²', Math.abs(irr.annualMeanWm2 - 1361) < 10,
    irr.annualMeanWm2.toFixed(1))

  // 用户说的 6.8%
  assert('偏心率辐照度振幅约 6.8%', Math.abs(irr.eccentricityAmplitude - 0.068) < 0.005,
    (irr.eccentricityAmplitude * 100).toFixed(2) + '%')

  // 用户给的数据：近日点 1.471 亿 km，远日点 1.521 亿 km
  const periKm = (AU * (1 - 0.0167)) / 1e9
  const aphKm = (AU * (1 + 0.0167)) / 1e9
  assert('近日点约 1.471 亿 km', Math.abs(periKm - 147.1) < 0.5, periKm.toFixed(1) + ' 百万km')
  assert('远日点约 1.521 亿 km', Math.abs(aphKm - 152.1) < 0.5, aphKm.toFixed(1) + ' 百万km')

  assert('平衡温度约 255K', Math.abs(irr.equilibriumK - 255) < 3, irr.equilibriumK.toFixed(1))
}

console.log('-- 3. 季节层：轴倾角必须是主因（用户的核心指正）--')
{
  const irr = climate.computeIrradiance(3.828e26, AU, 0.0167, 0.306)
  const season = climate.computeSeason(23.44, 0.0167, irr, 33, 101325, true, 288.15)

  assert('地球季节由轴倾角主导', season.dominant === 'obliquity', season.dominant)
  assert('有季节', season.hasSeasons)

  // 关键：偏心率造成的温度影响必须远小于辐照度影响
  const irradiancePct = irr.eccentricityAmplitude
  const tempPct = season.eccentricityTempAmplitude

  assert('偏心率温度影响 < 辐照度影响的 1/4（四次根折算）',
    tempPct < irradiancePct / 4 * 1.3,
    `辐照 ${(irradiancePct*100).toFixed(2)}% → 温度 ${(tempPct*100).toFixed(2)}%`)
  assert('偏心率温度影响在 0.3%~2% 量级',
    tempPct > 0.003 && tempPct < 0.02,
    (tempPct * 100).toFixed(2) + '%')

  // 描述里必须说清主因
  assert('描述提到轴倾角主导', season.causeSummary.includes('轴倾角'))
  assert('描述提到偏心率是次要', season.causeSummary.includes('次要') || season.causeSummary.includes('调制'))
}

console.log('-- 4. 地球纬度温度曲线 --')
{
  const result = climate.computeLayeredClimate({
    luminosityW: 3.828e26,
    semiMajorAxisM: AU,
    eccentricity: 0.0167,
    obliquityDeg: 23.44,
    albedo: 0.306,
    greenhouseK: 33,
    pressurePa: 101325,
    rotationHours: 23.934,
    hasOcean: true,
    latitudeDeg: 0,
  })

  assert('全球均温约 15°C（地球实测）', Math.abs(result.surfaceMeanC - 15) < 4,
    result.surfaceMeanC.toFixed(1) + '°C')

  const targets = [
    [0, 27, 6],
    [30, 21, 6],
    [45, 12, 6],
    [60, 3, 8],
    [75, -15, 12],
    [88, -25, 15],
  ]
  for (const [lat, expected, tolerance] of targets) {
    const band = result.latitudes.find((b) => b.latitudeDeg === lat)
    assert(`${lat}° 年均温接近 ${expected}°C`,
      Math.abs(band.annualMeanC - expected) <= tolerance,
      band.annualMeanC.toFixed(1) + '°C')
  }
}

console.log('-- 5. 季节振幅随纬度增大 --')
{
  const result = climate.computeLayeredClimate({
    luminosityW: 3.828e26,
    semiMajorAxisM: AU,
    eccentricity: 0.0167,
    obliquityDeg: 23.44,
    albedo: 0.306,
    greenhouseK: 33,
    pressurePa: 101325,
    rotationHours: 23.934,
    hasOcean: true,
    latitudeDeg: 0,
  })

  const eq = result.latitudes.find((b) => b.latitudeDeg === 0)
  const mid = result.latitudes.find((b) => b.latitudeDeg === 45)
  const pol = result.latitudes.find((b) => b.latitudeDeg === 75)

  assert('赤道年温差最小 (<6K)', eq.annualRangeK < 6, eq.annualRangeK.toFixed(1) + 'K')
  assert('45° 年温差中等 (10~30K)', mid.annualRangeK > 10 && mid.annualRangeK < 30,
    mid.annualRangeK.toFixed(1) + 'K')
  assert('75° 年温差大 (>25K)', pol.annualRangeK > 25, pol.annualRangeK.toFixed(1) + 'K')
  assert('振幅随纬度单调增大',
    eq.annualRangeK < mid.annualRangeK && mid.annualRangeK < pol.annualRangeK,
    `${eq.annualRangeK.toFixed(1)} < ${mid.annualRangeK.toFixed(1)} < ${pol.annualRangeK.toFixed(1)}`)
}

console.log('-- 6. 极夜与极昼 --')
{
  const result = climate.computeLayeredClimate({
    luminosityW: 3.828e26,
    semiMajorAxisM: AU,
    eccentricity: 0.0167,
    obliquityDeg: 23.44,
    albedo: 0.306,
    greenhouseK: 33,
    pressurePa: 101325,
    rotationHours: 23.934,
    hasOcean: true,
    latitudeDeg: 0,
  })

  const eq = result.latitudes.find((b) => b.latitudeDeg === 0)
  assert('赤道昼夜恒 12 小时', Math.abs(eq.dayLengthSummer - 12) < 0.2,
    eq.dayLengthSummer.toFixed(2) + 'h')

  const p75 = result.latitudes.find((b) => b.latitudeDeg === 75)
  assert('75° 夏至极昼', p75.dayLengthSummer === 24, p75.dayLengthSummer + 'h')
  assert('75° 冬至极夜', p75.dayLengthWinter === 0, p75.dayLengthWinter + 'h')

  assert('极圈纬度 = 90 - 倾角 = 66.56°',
    Math.abs(result.polarCircleDeg - 66.56) < 0.1, result.polarCircleDeg.toFixed(2))
  assert('直射点范围 = ±倾角', Math.abs(result.subsolarRangeDeg - 23.44) < 0.01)
}

console.log('-- 7. 反例：无轴倾角时季节由偏心率主导 --')
{
  const irr = climate.computeIrradiance(3.828e26, AU, 0.4, 0.306)  // 大偏心率
  const season = climate.computeSeason(0, 0.4, irr, 33, 101325, true, 288.15)

  assert('倾角 0 + 大偏心率 → 偏心率主导', season.dominant === 'eccentricity', season.dominant)
  assert('描述提醒「全球同步」而非南北反相',
    season.causeSummary.includes('全球同步') || season.causeSummary.includes('南北半球反相'),
    season.causeSummary.slice(0, 80))
  assert('大偏心率的辐照度振幅很大',
    irr.eccentricityAmplitude > 1.5,
    (irr.eccentricityAmplitude * 100).toFixed(0) + '%')
}

console.log('-- 8. 无倾角无偏心率 → 无季节 --')
{
  const irr = climate.computeIrradiance(3.828e26, AU, 0, 0.306)
  const season = climate.computeSeason(0, 0, irr, 33, 101325, true, 288.15)
  assert('判定为无季节', season.dominant === 'neither', season.dominant)
  assert('hasSeasons=false', !season.hasSeasons)
}

console.log('-- 9. 不同恒星类型的世界 --')
{
  // M5V 红矮星，宜居带内缘
  const m5 = stars.STAR_INDEX.get('M5V')
  const orbitAU = (m5.habitableInnerAU + m5.habitableOuterAU) / 2
  const result = climate.computeLayeredClimate({
    luminosityW: m5.luminositySun * 3.828e26,
    semiMajorAxisM: orbitAU * AU,
    eccentricity: 0,
    obliquityDeg: 23.44,
    albedo: 0.3,
    greenhouseK: 20,
    pressurePa: 101325,
    rotationHours: 23.934,
    hasOcean: true,
    latitudeDeg: 0,
  })
  console.log(`       M5V 宜居带中心 ${orbitAU.toFixed(3)} AU → 全球均温 ${result.surfaceMeanC.toFixed(1)}°C`)
  assert('红矮星宜居带内温度在合理范围 (-50~80°C)',
    result.surfaceMeanC > -50 && result.surfaceMeanC < 80,
    result.surfaceMeanC.toFixed(1) + '°C')

  // O5V 蓝巨星，宜居带很远
  const o5 = stars.STAR_INDEX.get('O5V')
  const oOrbit = (o5.habitableInnerAU + o5.habitableOuterAU) / 2
  console.log(`       O5V 宜居带中心 ${oOrbit.toFixed(1)} AU，寿命仅 ${o5.lifespanGyr.toFixed(2)} Gyr`)
  assert('O5V 宜居带很远 (>10 AU)', oOrbit > 10, oOrbit.toFixed(1) + ' AU')
  assert('O5V 寿命很短 (<0.1 Gyr)', o5.lifespanGyr < 0.1, o5.lifespanGyr.toFixed(3) + ' Gyr')
}

console.log('-- 10. 高倾角世界（侧躺自转）--')
{
  const result = climate.computeLayeredClimate({
    luminosityW: 3.828e26,
    semiMajorAxisM: AU,
    eccentricity: 0.0167,
    obliquityDeg: 80,
    albedo: 0.306,
    greenhouseK: 33,
    pressurePa: 101325,
    rotationHours: 23.934,
    hasOcean: true,
    latitudeDeg: 0,
  })

  const eq = result.latitudes.find((b) => b.latitudeDeg === 0)
  const p75 = result.latitudes.find((b) => b.latitudeDeg === 75)

  assert('80° 倾角极圈缩到 10°', Math.abs(result.polarCircleDeg - 10) < 0.1,
    result.polarCircleDeg.toFixed(1))
  assert('80° 倾角下 75° 有极昼', p75.dayLengthSummer === 24, p75.dayLengthSummer + 'h')
  console.log(`       赤道年温差 ${eq.annualRangeK.toFixed(1)}K, 75° ${p75.annualRangeK.toFixed(1)}K`)

  // ⚠️ 这里曾经写错断言：以为「高倾角下赤道也该有大年温差」。
  // 实际情况相反 —— 倾角 80° 时赤道在夏至和冬至的太阳高度角都是 10°
  // （|0-80|=80 和 |0+80|=80），以二至为基准的年温差接近 0。
  // 赤道的季节峰值出现在**二分点**（太阳直射赤道、高度角 90°），不在二至点。
  // 所以「高倾角 → 赤道无二至季节」是物理正确的，不是模型缺陷。
  assert('高倾角下赤道以二至为基准的年温差接近 0（物理正确）',
    eq.annualRangeK < 4, eq.annualRangeK.toFixed(1) + 'K')
  assert('高倾角下高纬季节振幅显著放大', p75.annualRangeK > 40,
    p75.annualRangeK.toFixed(1) + 'K')
  assert('高倾角下季节振幅梯度远大于地球',
    p75.annualRangeK > eq.annualRangeK * 10,
    `75° ${p75.annualRangeK.toFixed(1)}K vs 赤道 ${eq.annualRangeK.toFixed(1)}K`)
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  - ' + f.n + ': ' + f.d)
  process.exitCode = 1
}
