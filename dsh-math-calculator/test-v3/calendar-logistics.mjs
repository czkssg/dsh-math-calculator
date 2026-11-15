/**
 * 历法换算 + 后勤时延（固化边界清单 #2/#3）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-calconv-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const calMod = await import(pathToFileURL(join(root, 'lib/features/deduction/calendar.js')).href)
const logMod = await import(pathToFileURL(join(root, 'lib/features/topology/logistics.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 历法换算（地球）--')
{
  const r = calMod.convertCalendarDate({ year: 3, dayOfYear: 57 })
  assert('★ 第 3 年第 57 天 → 绝对 787', r.absoluteDay === 787, String(r.absoluteDay))
  assert('★ 反推年月一致', r.resolvedYear === 3 && r.resolvedDayOfYear === 57, JSON.stringify({ y: r.resolvedYear, d: r.resolvedDayOfYear }))
  assert('太阳黄经 56.2°、春季', Math.abs(r.solarLongitudeDeg - 56.2) < 0.5 && r.season === '春', JSON.stringify({ l: r.solarLongitudeDeg, s: r.season }))
  const back = calMod.convertCalendarDate({ absoluteDay: 741 })
  assert('★ 绝对 741 → 第 3 年第 11 天', back.resolvedYear === 3 && back.resolvedDayOfYear === 11, JSON.stringify({ y: back.resolvedYear, d: back.resolvedDayOfYear }))
  const leap = calMod.convertCalendarDate({ year: 4, dayOfYear: 0 })
  assert('第 4 年（闰年）→ 绝对 1096（365×3）', leap.absoluteDay === 1095, String(leap.absoluteDay))
}

console.log('-- 2. 历法换算（类火星）--')
{
  const m = calMod.convertCalendarDate({ rotationHours: 24.62, orbitDays: 686.98, absoluteDay: 700 })
  assert('★ 火星第 700 天 → 第 2 年第 31 天', m.resolvedYear === 2 && m.resolvedDayOfYear === 31, JSON.stringify({ y: m.resolvedYear, d: m.resolvedDayOfYear }))
  assert('火星年 670 天（含闰）', m.daysInYear === 670, String(m.daysInYear))
}

console.log('-- 3. 后勤时延（疆域上限）--')
{
  const h = logMod.analyzeLogistics({ mode: 'horse', distanceKm: 3000, maxRoundTripDays: 10 })
  assert('★ 驿马 12 km/h → 3000 km 往返 20.8 天', Math.abs(h.roundTripDays - 20.83) < 0.05, String(h.roundTripDays))
  assert('★ 往返 ≤ 10 天 → 半径 1440 km', Math.abs((h.maxRadiusKm ?? 0) - 1440) < 1, String(h.maxRadiusKm))
  const tel = logMod.analyzeLogistics({ mode: 'telegraph', distanceKm: 10000 })
  assert('★ 电报 → 单程 0.033 小时（光速硬上限）', tel.oneWayHours < 0.05, String(tel.oneWayHours))
  const beacon = logMod.analyzeLogistics({ mode: 'beacon', distanceKm: 1500 })
  assert('烽火 800 km/h → 1.9 小时', Math.abs(beacon.oneWayHours - 1.875) < 0.01, String(beacon.oneWayHours))
  const station = logMod.analyzeLogistics({ mode: 'horse', distanceKm: 1000, stationKm: 100, stationDelayHours: 1 })
  assert('★ 每 100 km 换站 → 10 站 + 10 小时延误', station.stations === 10 && Math.abs(station.oneWayHours - (1000 / 12 + 10)) < 0.1, JSON.stringify({ s: station.stations, h: station.oneWayHours }))
}

console.log('-- 4. 经 tool --')
{
  const c = await run({ operation: 'astro', astro: { action: 'calendar-convert', year: 3, dayOfYear: 57 } })
  assert('★ calendar-convert 经 tool', c.ok === true && c.result.includes('历法换算'), c.result.slice(0, 60))
  const l = await run({ operation: 'topology', topology: { action: 'logistics', mode: 'horse', distanceKm: 3000 } })
  assert('★ logistics 经 tool', l.ok === true && l.result.includes('后勤/信息时延'), l.result.slice(0, 60))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
