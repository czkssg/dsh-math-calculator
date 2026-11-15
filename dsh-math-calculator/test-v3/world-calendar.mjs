/**
 * astro world-calendar：world 轨道/自转 → 历法（耦合）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-worldcal-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 地球参数 --')
{
  const out = await run({ operation: 'astro', astro: { action: 'world-calendar', orbitAU: 1, starMass: 1 } })
  assert('★ 一年 365.3 地球日', out.ok === true && out.result.includes('365.3'), out.result.slice(0, 100))
  assert('本地日 366.25 → 366 天 + 6 小时', out.value.yearDays > 366 && out.value.yearDays < 366.5, String(out.value.yearDays))
  assert('★ 4 年一闰', String(out.value.leapRule).includes('4 年'), String(out.value.leapRule))
}

console.log('-- 2. 木星式（5.2 AU、9.9h 自转、小倾角）--')
{
  const out = await run({ operation: 'astro', astro: { action: 'world-calendar', orbitAU: 5.2, starMass: 1, rotationHours: 9.9, obliquityDeg: 3.1 } })
  assert('★ 一年 4331 地球日', out.ok === true && out.result.includes('4331.1'), out.result.slice(0, 100))
  assert('本地日约 10499', out.value.yearDays > 10400 && out.value.yearDays < 10600, String(out.value.yearDays))
  assert('小倾角 → 弱/无季节', String(out.value.season).includes('无季节') || String(out.value.season).includes('弱季节'), String(out.value.season))
}

console.log('-- 3. 非法参数 --')
{
  const bad = await run({ operation: 'astro', astro: { action: 'world-calendar', orbitAU: 0 } })
  assert('轨道 0 → invalid_argument', bad.ok === false && bad.error.type === 'invalid_argument', JSON.stringify(bad.error).slice(0, 60))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
