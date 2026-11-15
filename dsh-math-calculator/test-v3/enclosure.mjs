/**
 * 封闭系统（避难所/生物温室）：NASA ECLSS 量级核算。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-enclosure-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const engMod = await import(pathToFileURL(join(root, 'lib/features/topology/engineering.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 基本核算（6 人 / 100 m³ / 7 天）--')
{
  const r = engMod.assessEnclosure({ people: 6, volumeM3: 100, days: 7, cropAreaM2: 300, algaeM3: 2 })
  assert('★ 耗氧 5.04 kg/天（0.84/人）', Math.abs(r.o2KgDay - 5.04) < 0.01, String(r.o2KgDay))
  assert('★ CO₂ 6 kg/天（1.0/人）', Math.abs(r.co2KgDay - 6) < 0.01, String(r.co2KgDay))
  assert('★ CO₂ 上升 30303 ppm/天（100 m³ 太小）', Math.abs(r.co2RisePpmDay - 30303) < 5, String(r.co2RisePpmDay))
  assert('★ 0.79 小时到 1000 ppm → 必须持续清除', Math.abs(r.hoursTo1000Ppm - 0.79) < 0.01, String(r.hoursTo1000Ppm))
  assert('★ LiOH 47.7 kg（7 天）', Math.abs(r.liohKg - 47.7) < 0.2, String(r.liohKg))
  assert('温室 300 ㎡ 供氧覆盖 10.7 人', Math.abs((r.greenhouseCoverPeople ?? 0) - 10.71) < 0.05, String(r.greenhouseCoverPeople))
  assert('藻类 2 m³ 覆盖 3.1 人', Math.abs((r.algaeCoverPeople ?? 0) - 3.1) < 0.05, String(r.algaeCoverPeople))
  assert('人体热负荷 600 W', r.heatLoadW === 600, String(r.heatLoadW))
}

console.log('-- 2. 大体积舱（ISS 级 400 m³）--')
{
  const r = engMod.assessEnclosure({ people: 6, volumeM3: 400 })
  assert('400 m³ → CO₂ 上升 7576 ppm/天', Math.abs(r.co2RisePpmDay - 7576) < 5, String(r.co2RisePpmDay))
  assert('★ 约 3.2 小时到 1000 ppm', Math.abs(r.hoursTo1000Ppm - 3.17) < 0.05, String(r.hoursTo1000Ppm))
}

console.log('-- 3. 经 topology（避难所/温室）--')
{
  const out = await run({ operation: 'topology', topology: { action: 'structure', kind: 'enclosure', people: 6, volumeM3: 100, days: 7 } })
  assert('★ enclosure 走规则表', out.ok === true && out.value.assessmentId === 'enclosure', String(out.value?.assessmentId))
  const gh = await run({ operation: 'topology', topology: { action: 'structure', kind: 'greenhouse', people: 6, volumeM3: 2000, days: 30, cropAreaM2: 500 } })
  assert('★ greenhouse 走规则表', gh.ok === true && gh.value.assessmentId === 'greenhouse', String(gh.value?.assessmentId))
  const bad = await run({ operation: 'topology', topology: { action: 'structure', kind: 'enclosure', people: 6 } })
  assert('缺 volumeM3 → 不附校核（不瞎编）', bad.ok === true && bad.value.assessmentId === undefined, JSON.stringify(bad.value).slice(0, 80))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
