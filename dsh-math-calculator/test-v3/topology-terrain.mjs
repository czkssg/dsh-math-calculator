/**
 * terrain 对齐测试（第 6 步最后一块）：局部地形与局地气候。
 *
 * 设计原则是「全局气候给基准，地形叠加修正」。每条修正都对应一个可查证的机制：
 * 海拔按绝热递减率降温、距海越远温差越大、洋流冷暖、迎风/背风雨影与焚风、
 * 雪线/林线、谷地逆温、海陆风。测试逐条核对方向与量级。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-terrain-'))
const mod = await import(pathToFileURL(join(root, 'lib/features/topology/terrain.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol

console.log('-- 1. 默认平原：基准不被改动 --')
{
  const out = mod.describeTerrain({})
  assert('均温 = 基准 288K（15°C）', near(out.terrain.meanTempK, 288, 1e-9), String(out.terrain.meanTempK))
  assert('温度异常 = 0', near(out.terrain.tempAnomaly, 0, 1e-9), '')
  assert('距海 50km 的大陆度约 0.118', near(1 - Math.exp(-50 / 400), 0.1175, 0.001), '')
  assert('昼夜温差 ≈ 7.6K', near(out.terrain.diurnalRangeK, 6 + 0.1175 * 14, 0.05), String(out.terrain.diurnalRangeK))
  assert('年温差 ≈ 11.8K', near(out.terrain.seasonalRangeK, 8 + 0.1175 * 32, 0.1), String(out.terrain.seasonalRangeK))
}

console.log('-- 2. 海拔降温（湿度决定干/湿绝热）--')
{
  const wet = mod.describeTerrain({ elevation: 2000, humidity: 0.9 })
  const dry = mod.describeTerrain({ elevation: 2000, humidity: 0.05 })
  const wetLapse = 9.8 + (5 - 9.8) * 0.9
  const dryLapse = 9.8 + (5 - 9.8) * 0.05
  assert('★ 湿空气 2000m 降温 ≈ ' + (wetLapse * 2).toFixed(1) + 'K', near(288 - wet.terrain.meanTempK, wetLapse * 2, 0.01), String(288 - wet.terrain.meanTempK))
  assert('★ 干空气降温更猛', dry.terrain.meanTempK < wet.terrain.meanTempK, String(dry.terrain.meanTempK) + ' vs ' + String(wet.terrain.meanTempK))
  assert('干空气降温 ≈ ' + (dryLapse * 2).toFixed(1) + 'K', near(288 - dry.terrain.meanTempK, dryLapse * 2, 0.01), '')
  assert('海拔 > 500m 给出递减率说明', wet.phenomena.some((p) => p.includes('递减率')), JSON.stringify(wet.phenomena))
}

console.log('-- 3. 大陆度：距海越远温差越大 --')
{
  const coast = mod.describeTerrain({ distanceToSea: 5 })
  const inland = mod.describeTerrain({ distanceToSea: 1000 })
  assert('★ 内陆昼夜温差 > 沿海', inland.terrain.diurnalRangeK > coast.terrain.diurnalRangeK + 5, String(inland.terrain.diurnalRangeK) + ' vs ' + String(coast.terrain.diurnalRangeK))
  assert('★ 内陆年温差 > 沿海', inland.terrain.seasonalRangeK > coast.terrain.seasonalRangeK + 10, '')
  assert('内陆给出「早穿皮袄午穿纱」', inland.phenomena.some((p) => p.includes('皮袄')), '')
  assert('沿海给出海洋性气候说明', coast.phenomena.some((p) => p.includes('海洋性')), '')
}

console.log('-- 4. 洋流 --')
{
  const warm = mod.describeTerrain({ distanceToSea: 20, latitudeDeg: 45, oceanCurrent: 'warm' })
  const cold = mod.describeTerrain({ distanceToSea: 20, latitudeDeg: 45, oceanCurrent: 'cold' })
  const none = mod.describeTerrain({ distanceToSea: 20, latitudeDeg: 45 })
  assert('★ 暖流使均温偏高', warm.terrain.meanTempK > none.terrain.meanTempK + 2, String(warm.terrain.meanTempK - none.terrain.meanTempK))
  assert('★ 寒流使均温偏低', cold.terrain.meanTempK < none.terrain.meanTempK - 1, String(cold.terrain.meanTempK - none.terrain.meanTempK))
  assert('暖流给不冻港观感', warm.visibleEffects.some((e) => e.includes('不冻')), '')
}

console.log('-- 5. 雨影与焚风 --')
{
  const windward = mod.describeTerrain({ reliefHeight: 2000, windward: 1 })
  const leeward = mod.describeTerrain({ reliefHeight: 2000, windward: -1 })
  assert('★ 迎风坡降水增加', windward.terrain.annualPrecipMm > 800, String(windward.terrain.annualPrecipMm))
  assert('★ 背风坡降水减少', leeward.terrain.annualPrecipMm < 800, String(leeward.terrain.annualPrecipMm))
  assert('背风坡焚风增温', leeward.terrain.meanTempK > windward.terrain.meanTempK, '')
  assert('背风坡给干热风观感', leeward.visibleEffects.some((e) => e.includes('焚风')), '')
}

console.log('-- 6. 雪线与林线 --')
{
  const out = mod.describeTerrain({ elevation: 3000, humidity: 0.6 })
  const lapse = 9.8 + (5 - 9.8) * 0.6
  const expectedSnow = (14.85 / lapse) * 1000
  assert('★ 雪线 ≈ ' + expectedSnow.toFixed(0) + 'm', near(out.terrain.snowLineM, expectedSnow, 1), String(out.terrain.snowLineM))
  assert('★ 林线 = 雪线 - 10K 对应高度', near(out.terrain.treeLineM, ((14.85 - 10) / lapse) * 1000, 1), String(out.terrain.treeLineM))
  assert('3000m 高于雪线 → 终年积雪现象', out.phenomena.some((p) => p.includes('高于雪线')), JSON.stringify(out.phenomena))
}

console.log('-- 7. 谷地/海岸/极圈等局部现象 --')
{
  const valley = mod.describeTerrain({ kind: 'valley', elevation: 500 })
  assert('★ 谷地逆温', valley.phenomena.some((p) => p.includes('逆温')), '')
  const coastal = mod.describeTerrain({ kind: 'coastal', distanceToSea: 10 })
  assert('★ 海岸海陆风', coastal.phenomena.some((p) => p.includes('海陆风')), '')
  const polar = mod.describeTerrain({ latitudeDeg: 70, kind: 'tundra' })
  assert('★ 极圈内极昼极夜', polar.phenomena.some((p) => p.includes('极昼')), '')
  assert('苔原冻土', polar.phenomena.some((p) => p.includes('冻土')), '')
  assert('沙漠砂地反照率说明', mod.describeTerrain({ kind: 'desert', surface: 'sand' }).phenomena.some((p) => p.includes('反照率')), '')
}

console.log('-- 8. 干旱指数、生长季与土壤 --')
{
  const arid = mod.describeTerrain({ annualPrecipMm: 100, latitudeDeg: 30 })
  assert('★ 干旱指数体现干旱', arid.terrain.aridityIndex < 0.35, String(arid.terrain.aridityIndex))
  assert('干旱提示依赖地下水', arid.phenomena.some((p) => p.includes('地下水')), '')
  assert('土壤是干旱土', arid.terrain.soilProfile.includes('干旱土'), arid.terrain.soilProfile)
  assert('宜居性提游牧/灌溉', arid.terrain.habitability.includes('灌溉') || arid.terrain.habitability.includes('游牧'), arid.terrain.habitability)

  const cold = mod.describeTerrain({ baseTempK: 253.15 })
  assert('★ 均温 -20°C → 生长季 0 天', cold.terrain.growingSeasonDays === 0, String(cold.terrain.growingSeasonDays))
  const tropical = mod.describeTerrain({ baseTempK: 300, distanceToSea: 5 })
  assert('★ 热带海洋性 → 全年生长', tropical.terrain.growingSeasonDays === 365, String(tropical.terrain.growingSeasonDays))
  assert('无霜期 ≤ 生长季', tropical.terrain.frostFreeDays >= tropical.terrain.growingSeasonDays - 1, '')

  const laterite = mod.describeTerrain({ baseTempK: 300, annualPrecipMm: 2500, latitudeDeg: 5 })
  assert('★ 高温强淋溶 → 红壤/砖红壤', laterite.terrain.soilProfile.includes('红壤'), laterite.terrain.soilProfile)
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
