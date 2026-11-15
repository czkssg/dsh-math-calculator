/**
 * 卫星周期 → 月长（calendar 与 system/orbit 耦合）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-moon-cal-'))
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

console.log('-- 1. 地月耦合 --')
{
  const e = calMod.deriveCalendar({ moonSemiMajorAu: 0.00257, planetMassEarth: 1 })
  assert('★ 地月 a=0.00257 → 恒星月约 27.4 天', Math.abs((e.lunarMonthDays ?? 0) - 27.46) < 0.3, String(e.lunarMonthDays))
  assert('仍判阴阳历', e.calendarType.includes('阴阳历'), e.calendarType)
}

console.log('-- 2. 直接给周期仍可用 --')
{
  const e = calMod.deriveCalendar({ moonPeriodDays: 29.53, moonCount: 1 })
  assert('给 29.53 → 保留', Math.abs((e.lunarMonthDays ?? 0) - 29.53) < 0.01, String(e.lunarMonthDays))
}

console.log('-- 3. 经 tool（卫星半长轴）--')
{
  const out = await run({ operation: 'astro', astro: { action: 'calendar', rotationHours: 24, orbitDays: 365.2422, obliquityDeg: 23.44, moonSemiMajorAu: 0.00257, planetMassEarth: 1 } })
  assert('★ calendar 接受 moonSemiMajorAu', out.ok === true && out.result.includes('太阴月'), out.result.slice(0, 120))
  assert('月长来自开普勒（27.4 天）', out.result.includes('27.46') || out.result.includes('27.45'), out.result.slice(0, 200))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
