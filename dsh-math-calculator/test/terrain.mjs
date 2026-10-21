/**
 * 局地地形气候测试。
 * 验证方式：拿真实地理案例反算，看模型有没有常识性错误。
 */
const mod = await import('../lib/index.js')
const exec = (a) => mod.runMathTool(a)

let pass = 0
const fails = []
const ok = (n, d = '') => { pass++; console.log(`  ok   ${n}${d ? ': ' + d : ''}`) }
const bad = (n, d) => { fails.push({ n, d }); console.log(`  FAIL ${n}\n         ${d}`) }
const assert = (n, c, d = '') => (c ? ok(n, d) : bad(n, d))

const terrain = (params, world) =>
  exec({ operation: 'world', world: world ?? {}, terrain: params })

console.log('— 1. 沿海 vs 内陆（同纬度）—')
{
  const coastal = terrain({ kind: 'coastal', distanceToSea: 2, latitudeDeg: 45, elevation: 10 })
  const inland = terrain({ kind: 'plain', distanceToSea: 900, latitudeDeg: 45, elevation: 10 })

  if (!coastal.ok || !inland.ok) {
    bad('沿海/内陆推演', coastal.error?.message ?? inland.error?.message)
  } else {
    const c = coastal.value.localTerrain.terrain
    const i = inland.value.localTerrain.terrain
    console.log(`       沿海: 昼夜温差 ${c.diurnalRangeK.toFixed(0)}K, 年温差 ${c.seasonalRangeK.toFixed(0)}K`)
    console.log(`       内陆: 昼夜温差 ${i.diurnalRangeK.toFixed(0)}K, 年温差 ${i.seasonalRangeK.toFixed(0)}K`)
    assert('内陆年温差 > 沿海', i.seasonalRangeK > c.seasonalRangeK,
      `${i.seasonalRangeK.toFixed(0)} vs ${c.seasonalRangeK.toFixed(0)}`)
    assert('内陆昼夜温差 > 沿海', i.diurnalRangeK > c.diurnalRangeK,
      `${i.diurnalRangeK.toFixed(0)} vs ${c.diurnalRangeK.toFixed(0)}`)
    // 沿海应出现海陆风描述
    const hasBreeze = coastal.result.includes('海陆风')
    assert('沿海出现海陆风描述', hasBreeze)
  }
}

console.log('— 2. 海拔降温（同纬度不同海拔）—')
{
  const low = terrain({ kind: 'plain', elevation: 0, latitudeDeg: 30, humidity: 0.5 })
  const high = terrain({ kind: 'mountain', elevation: 4000, latitudeDeg: 30, humidity: 0.5 })
  const tLow = low.value.localTerrain.terrain.meanTempC
  const tHigh = high.value.localTerrain.terrain.meanTempC
  console.log(`       0m: ${tLow.toFixed(1)}°C | 4000m: ${tHigh.toFixed(1)}°C | 降温 ${(tLow - tHigh).toFixed(1)}K`)
  // 干绝热 9.8 K/km × 4km = 39.2K；湿绝热 5.0 × 4 = 20K
  assert('4000m 降温在 20~40K 之间', (tLow - tHigh) > 18 && (tLow - tHigh) < 42, `${(tLow - tHigh).toFixed(1)}K`)
}

console.log('— 3. 干燥空气降温更猛（干绝热）—')
{
  const wet = terrain({ kind: 'mountain', elevation: 3000, latitudeDeg: 30, humidity: 0.9 })
  const dry = terrain({ kind: 'mountain', elevation: 3000, latitudeDeg: 30, humidity: 0.1 })
  const tWet = wet.value.localTerrain.terrain.meanTempC
  const tDry = dry.value.localTerrain.terrain.meanTempC
  console.log(`       湿空气山顶: ${tWet.toFixed(1)}°C | 干空气山顶: ${tDry.toFixed(1)}°C`)
  assert('干燥环境降温更猛', tDry < tWet, `${tDry.toFixed(1)} < ${tWet.toFixed(1)}`)
}

console.log('— 4. 雨影效应（迎风坡 vs 背风坡）—')
{
  const win = terrain({ kind: 'mountain', elevation: 1000, windward: 1, reliefHeight: 2500, annualPrecipMm: 1000 })
  const lee = terrain({ kind: 'mountain', elevation: 1000, windward: -1, reliefHeight: 2500, annualPrecipMm: 1000 })
  const pWin = win.value.localTerrain.terrain.annualPrecipMm
  const pLee = lee.value.localTerrain.terrain.annualPrecipMm
  console.log(`       迎风坡: ${pWin.toFixed(0)}mm | 背风坡: ${pLee.toFixed(0)}mm`)
  assert('背风坡降水显著少于迎风坡', pLee < pWin * 0.7, `${pLee} vs ${pWin}`)
  assert('迎风坡有抬升增雨描述', win.result.includes('抬升') || win.result.includes('增雨'))
  assert('背风坡有雨影/焚风描述', lee.result.includes('雨影') || lee.result.includes('焚风'))
}

console.log('— 5. 洋流影响（暖流使高纬港口不冻）—')
{
  const warm = terrain({ kind: 'coastal', latitudeDeg: 60, distanceToSea: 2, oceanCurrent: 'warm', elevation: 5 })
  const cold = terrain({ kind: 'coastal', latitudeDeg: 60, distanceToSea: 2, oceanCurrent: 'cold', elevation: 5 })
  const tWarm = warm.value.localTerrain.terrain.meanTempC
  const tCold = cold.value.localTerrain.terrain.meanTempC
  console.log(`       暖流沿岸: ${tWarm.toFixed(1)}°C | 寒流沿岸: ${tCold.toFixed(1)}°C`)
  assert('暖流沿岸更暖', tWarm > tCold, `${tWarm.toFixed(1)} > ${tCold.toFixed(1)}`)
  assert('暖流有不冻港描述', warm.result.includes('不冻'))
  assert('寒流有多雾少雨描述', cold.result.includes('雾'))
}

console.log('— 6. 垂直地带性（雪线/林线）—')
{
  const r = terrain({ kind: 'mountain', elevation: 5000, latitudeDeg: 30 })
  const t = r.value.localTerrain.terrain
  console.log(`       雪线 ${(t.snowLineM / 1000).toFixed(2)}km | 林线 ${(t.treeLineM / 1000).toFixed(2)}km`)
  assert('林线低于雪线', t.treeLineM < t.snowLineM, `${t.treeLineM} < ${t.snowLineM}`)
  assert('5000m 高于雪线应提示终年积雪', r.result.includes('终年积雪') || r.result.includes('高于雪线'),
    r.result.includes('终年积雪') ? '有提示' : '无')
}

console.log('— 7. 干旱指数与土壤 —')
{
  const desert = terrain({ kind: 'desert', annualPrecipMm: 100, latitudeDeg: 25, elevation: 500, surface: 'sand' })
  const forest = terrain({ kind: 'forest', annualPrecipMm: 1800, latitudeDeg: 5, elevation: 100, humidity: 0.85 })
  const d = desert.value.localTerrain.terrain
  const f = forest.value.localTerrain.terrain
  console.log(`       沙漠: 干旱指数 ${d.aridityIndex.toFixed(2)}, 土壤 ${d.soilProfile}`)
  console.log(`       雨林: 干旱指数 ${f.aridityIndex.toFixed(2)}, 土壤 ${f.soilProfile}`)
  assert('沙漠干旱指数 < 0.35', d.aridityIndex < 0.35, String(d.aridityIndex))
  assert('沙漠土壤为干旱土', d.soilProfile.includes('干旱'))
  assert('沙漠有沙地反照率描述', desert.result.includes('砂质') || desert.result.includes('灼热'))
}

console.log('— 8. 生长季 —')
{
  const tropical = terrain({ kind: 'forest', latitudeDeg: 5, annualPrecipMm: 2000 })
  const arctic = terrain({ kind: 'tundra', latitudeDeg: 75, annualPrecipMm: 200 })
  const tT = tropical.value.localTerrain.terrain
  const tA = arctic.value.localTerrain.terrain
  console.log(`       热带: 生长季 ${tT.growingSeasonDays}天 | 苔原: 生长季 ${tA.growingSeasonDays}天`)
  assert('热带生长季接近全年', tT.growingSeasonDays > 330, String(tT.growingSeasonDays))
  assert('苔原生长季很短', tA.growingSeasonDays < 120, String(tA.growingSeasonDays))
}

console.log('— 9. 谷地逆温 —')
{
  const r = terrain({ kind: 'valley', elevation: 800, latitudeDeg: 45 })
  assert('谷地提示逆温', r.result.includes('逆温'), r.result.includes('逆温') ? '有' : '无')
}

console.log('— 10. 结构化输出与 JSON 安全 —')
{
  const r = terrain({ kind: 'coastal', latitudeDeg: 40, oceanCurrent: 'warm' })
  let safe = true
  try { JSON.stringify(r) } catch { safe = false }
  assert('可 JSON 序列化', safe)
  assert('localTerrain 存在', r.value?.localTerrain !== undefined)
  const t = r.value.localTerrain.terrain
  for (const key of ['meanTempC', 'diurnalRangeK', 'annualPrecipMm', 'growingSeasonDays', 'aridityIndex', 'soilProfile', 'habitability']) {
    assert(`  字段 ${key} 存在`, t[key] !== undefined, String(t[key]))
  }
  assert('有读者可见效果', Array.isArray(r.value.localTerrain.visibleEffects) && r.value.localTerrain.visibleEffects.length > 0)
}

console.log('— 11. 不给 terrain 时不影响原有输出 —')
{
  const r = exec({ operation: 'world' })
  assert('无 terrain 时正常', r.ok && r.value.localTerrain === undefined, r.value?.localTerrain === undefined ? '无 localTerrain' : '意外出现')
}

console.log('')
console.log(`通过 ${pass}，失败 ${fails.length}`)
if (fails.length > 0) {
  for (const f of fails) console.log(`  - ${f.n}: ${f.d}`)
  process.exitCode = 1
}
