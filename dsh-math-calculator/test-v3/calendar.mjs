/**
 * astro calendar：行星参数 → 历法（年/闰/月/季节/分至点）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-calendar-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const calMod = await import(pathToFileURL(join(root, 'lib/features/deduction/calendar.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 地球对照 --')
{
  const e = calMod.deriveCalendar({})
  assert('★ 地球一年 365.2422 天', Math.abs(e.yearDays - 365.2422) < 0.001, String(e.yearDays))
  assert('★ 4 年一闰', e.leapRule.includes('4 年'), e.leapRule)
  assert('★ 太阴月 29.53', Math.abs((e.lunarMonthDays ?? 0) - 29.53) < 0.01, String(e.lunarMonthDays))
  assert('★ 阴阳历（12.37 月/年）', e.calendarType.includes('阴阳历'), e.calendarType)
  assert('四季分明', e.season.includes('四季'), e.season)
  assert('冬至约第 274 日', Math.abs(e.solstices[3].dayOfYear - 273.9) < 1, String(e.solstices[3].dayOfYear))
}

console.log('-- 2. 类火星 --')
{
  const m = calMod.deriveCalendar({ rotationHours: 24.62, orbitDays: 686.98, obliquityDeg: 25.19, moonCount: 2, moonPeriodDays: 0.319 })
  assert('★ 火星一年 ≈ 669.6 本地日', Math.abs(m.yearDays - 669.6) < 1, String(m.yearDays))
  assert('卫星月 ≈ 0.311 本地日', Math.abs((m.lunarMonthDays ?? 0) - 0.311) < 0.01, String(m.lunarMonthDays))
}

console.log('-- 3. 极端（无卫星/无季节/逆行）--')
{
  const noMoon = calMod.deriveCalendar({ moonCount: 0 })
  assert('无卫星 → lunarMonthDays=null', noMoon.lunarMonthDays === null, String(noMoon.lunarMonthDays))
  const noSeason = calMod.deriveCalendar({ obliquityDeg: 1 })
  assert('倾角 1° → 几乎无季节', noSeason.season.includes('无季节'), noSeason.season)
  const retro = calMod.deriveCalendar({ obliquityDeg: 120 })
  assert('倾角 120° → 极区半年极昼', retro.season.includes('极区'), retro.season)
}

console.log('-- 4. 经 tool --')
{
  const out = await run({ operation: 'astro', astro: { action: 'calendar', rotationHours: 24, orbitDays: 365.2422, obliquityDeg: 23.44 } })
  assert('★ calendar 经 tool 可跑', out.ok === true && out.result.includes('历法推导'), out.result.slice(0, 100))
  assert('输出含闰年与分至点', out.result.includes('闰年') && out.result.includes('分至点'), '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
