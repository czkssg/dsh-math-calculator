/**
 * 气候层：温度/降水/分区/可耕率，以及与 world 的耦合。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-clim-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const gc = await import(pathToFileURL(join(root, 'lib/features/deduction/grid-climate.js')).href)
const wm = await import(pathToFileURL(join(root, 'lib/features/deduction/world-map.js')).href)
const wb = await import(pathToFileURL(join(root, 'lib/features/deduction/world-build.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tools => 0 }
async function runTool(args) { return tool.execute(args, {}) }
console.log('-- 1. 温度带 --')
{
  const cols = 60, rows = 30
  const heights = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0.7))
  const land = Array.from({ length: rows }, () => Array.from({ length: cols }, () => true))
  const r = gc.computeGridClimate({ heights, land, seaLevel: 0.61 })
  const eqTemp = r.temperatureC[Math.floor(rows / 2)][0]
  const poleTemp = r.temperatureC[0][0]
  assert('★ 赤道比极地暖（>20°C 差）', eqTemp - poleTemp > 20, eqTemp.toFixed(1) + ' vs ' + poleTemp.toFixed(1))
  assert('★ 降水非负', r.precipitationMm.every((row) => row.every((v) => v >= 0)), '')
  assert('★ 分区非空', Object.keys(r.zoneShare).length >= 2, JSON.stringify(r.zoneShare))
}
console.log('-- 2. 雨影 --')
{
  const cols = 60, rows = 30
  const heights = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0.62))
  const land = Array.from({ length: rows }, () => Array.from({ length: cols }, () => true))
  const flat = gc.computeGridClimate({ heights, land })
  /** 造一座山脊：迎风（西）坡高、背风（东）低。 */
  const ridge = heights.map((row) => row.slice())
  for (let y = 0; y < rows; y += 1) { ridge[y][30] = 0.95; ridge[y][31] = 0.66 }
  const withRidge = gc.computeGridClimate({ heights: ridge, land })
  const windward = withRidge.precipitationMm[15][30]
  const leeward = withRidge.precipitationMm[15][31]
  assert('★ 迎风坡降水多于背风坡（雨影）', windward > leeward, windward.toFixed(0) + ' vs ' + leeward.toFixed(0))
}
console.log('-- 3. 可耕率 --')
{
  const cols = 60, rows = 30
  const heights = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0.7))
  const land = Array.from({ length: rows }, () => Array.from({ length: cols }, () => true))
  const r = gc.computeGridClimate({ heights, land })
  assert('★ 可耕率在 0–1', r.arableRatio > 0 && r.arableRatio < 1, String(r.arableRatio))
}
console.log('-- 4. 与地图/世界耦合 --')
{
  const map = wm.generateWorldMap({ width: 180, height: 90, seed: 7, climate: true, ascii: false })
  assert('★ 地图带气候摘要', map.climate !== undefined && typeof map.climate.arableRatio === 'number', '')
  assert('地图气候含可耕面积', (map.climate.arableKm2 ?? 0) > 0, String(map.climate?.arableKm2))
  const fixed = wb.buildWorldProfile({})
  const mapped = wb.buildWorldProfile({ useMap: true, mapSeed: 7 })
  assert('★ 默认可耕率 10%', Math.abs(fixed.arableRatio - 0.1) < 1e-9, String(fixed.arableRatio))
  assert('★ useMap 后改用气候可耕率', mapped.arableRatio !== fixed.arableRatio, String(mapped.arableRatio))
  assert('承载力随可耕率变化', mapped.carryingCapacity !== fixed.carryingCapacity, '')
}
console.log('-- 5. 经 tool --')
{
  const out = await runTool({ operation: 'world-map', mapWidth: 180, mapHeight: 90, seed: 7, climate: true, ascii: false })
  assert('★ world-map climate 经 tool', out.ok === true && out.value.climate !== undefined, out.result.slice(0, 60))
  const build = await runTool({ operation: 'world-build', useMap: true, mapSeed: 7 })
  assert('★ world-build useMap 经 tool', build.ok === true && build.value.build.arableRatio > 0, '')
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
