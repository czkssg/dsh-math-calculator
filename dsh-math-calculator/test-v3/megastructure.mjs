/**
 * 千万级聚居：舱室网络（个位数 → 亿级人口）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-mega-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const m = await import(pathToFileURL(join(root, 'lib/features/topology/megastructure.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 个位数 → 万级 --')
{
  const one = m.designMegastructure({ targetPeople: 1, selfSufficient: true })
  assert('★ 1 人：1 居住舱 + 1 温室舱', one.habitatCompartments === 1 && one.greenhouseCompartments === 1, JSON.stringify({ h: one.habitatCompartments, g: one.greenhouseCompartments }))
  const k = m.designMegastructure({ targetPeople: 1000, selfSufficient: true })
  assert('★ 1000 人：20 居住舱（500㎡/10㎡人=50/舱）', k.habitatCompartments === 20, String(k.habitatCompartments))
  assert('★ 温室舱 56（1000×28/500）', k.greenhouseCompartments === 56, String(k.greenhouseCompartments))
  const w = m.designMegastructure({ targetPeople: 10000, selfSufficient: true })
  assert('1 万人：200 居住 + 560 温室', w.habitatCompartments === 200 && w.greenhouseCompartments === 560, '')
}

console.log('-- 2. 千万级 --')
{
  const r = m.designMegastructure({ targetPeople: 1e7, selfSufficient: true })
  assert('★ 1000 万人：20 万居住舱 + 56 万温室舱', r.habitatCompartments === 200000 && r.greenhouseCompartments === 560000, JSON.stringify({ h: r.habitatCompartments, g: r.greenhouseCompartments }))
  assert('★ 总容积 13.68 亿 m³（1.368e9）', Math.abs(r.totalVolumeM3 / 1e9 - 1.368) < 0.001, String(r.totalVolumeM3))
  assert('★ 总泄漏 1641.6 t/天', Math.abs(r.totalLeakKgDay / 1e6 - 1.6416) < 0.001, String(r.totalLeakKgDay))
  assert('★ 耗氧 840 万 kg/天', Math.abs(r.totalO2KgDay - 8.4e6) < 1, String(r.totalO2KgDay))
  assert('★ 温室面积 2.8 亿 m²（28㎡/人）', Math.abs(r.cropAreaM2 - 2.8e8) < 1, String(r.cropAreaM2))
  assert('人均容积 137 m³/人（含温室与走廊）', Math.abs(r.volumePerPersonM3 - 136.8) < 0.1, String(r.volumePerPersonM3))
}

console.log('-- 3. 亿级（不自给，只居住 + 补给）--')
{
  const r = m.designMegastructure({ targetPeople: 1e8, selfSufficient: false })
  assert('★ 1 亿人：200 万居住舱', r.habitatCompartments === 2000000, String(r.habitatCompartments))
  assert('温室舱 0（不自给）', r.greenhouseCompartments === 0, String(r.greenhouseCompartments))
  assert('★ 总容积 3.6e9 m³', Math.abs(r.totalVolumeM3 / 1e9 - 3.6) < 0.01, String(r.totalVolumeM3))
  assert('★ 用水 3e9 L/天（30 L/人）', Math.abs(r.totalWaterLDay - 3e9) < 1, String(r.totalWaterLDay))
}

console.log('-- 4. 经 topology --')
{
  const out = await run({ operation: 'topology', topology: { action: 'structure', kind: 'megastructure', targetPeople: 1e7, selfSufficient: true } })
  assert('★ megastructure 走规则表', out.ok === true && out.value.assessmentId === 'megastructure', String(out.value?.assessmentId))
  const bad = await run({ operation: 'topology', topology: { action: 'structure', kind: 'megastructure' } })
  assert('缺 targetPeople → 不附校核（不瞎编）', bad.ok === true && bad.value.assessmentId === undefined, '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
