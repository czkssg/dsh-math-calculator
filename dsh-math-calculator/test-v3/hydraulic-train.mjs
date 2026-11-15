/**
 * 液压/气动 + 多级传动链（规则表第 12/13 类）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-hydraulic-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const m = await import(pathToFileURL(join(root, 'lib/features/topology/mechanism.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 液压功率与执行器 --')
{
  const r = m.assessFluidPower({ pressurePa: 21e6, flowM3s: 0.002, boreMm: 100, rodMm: 60 })
  assert('★ 液压功率 42 kW（p·Q）', Math.abs(r.hydraulicPowerW - 42000) < 1, String(r.hydraulicPowerW))
  assert('★ 效率 0.85 → 输出 35.7 kW', Math.abs(r.outputPowerW - 35700) < 1, String(r.outputPowerW))
  assert('★ 缸径 100 mm → 推力 164.9 kN', Math.abs((r.thrustN ?? 0) / 1000 - 164.9) < 0.5, String(r.thrustN))
  assert('★ 回程推力 105.6 kN（杆 60 mm）', Math.abs((r.retractN ?? 0) / 1000 - 105.6) < 0.5, String(r.retractN))
  assert('缸速 0.255 m/s', Math.abs((r.pistonSpeedMps ?? 0) - 0.2546) < 0.001, String(r.pistonSpeedMps))
}

console.log('-- 2. 多级传动 --')
{
  const r = m.assessTrain({ powerW: 15000, rpm: 1500, stages: [{ ratio: 3 }, { ratio: 4, efficiency: 0.95 }] })
  assert('★ 总传动比 12', r.totalRatio === 12, String(r.totalRatio))
  assert('★ 总效率 0.9215（0.97×0.95）', Math.abs(r.totalEfficiency - 0.9215) < 1e-6, String(r.totalEfficiency))
  assert('★ 输出 125 rpm', r.outputRpm === 125, String(r.outputRpm))
  assert('★ 输出扭矩 1056 N·m', Math.abs(r.outputTorqueNm - 1055.96) < 1, String(r.outputTorqueNm))
  assert('逐级记录', r.perStage.length === 2 && r.perStage[1].rpm === 125, JSON.stringify(r.perStage))
}

console.log('-- 3. 校验 --')
{
  let threw = false
  try { m.assessFluidPower({ pressurePa: 0, flowM3s: 1 }) } catch { threw = true }
  assert('压力 0 → 报错', threw, '')
  let threw2 = false
  try { m.assessTrain({ powerW: 1, rpm: 1, stages: [] }) } catch { threw2 = true }
  assert('空传动链 → 报错', threw2, '')
  let threw3 = false
  try { m.assessTrain({ powerW: 1, rpm: 1, stages: [{ ratio: -1 }] }) } catch { threw3 = true }
  assert('负传动比 → 报错', threw3, '')
}

console.log('-- 4. 经 topology --')
{
  const a = await run({ operation: 'topology', topology: { action: 'structure', kind: 'fluid-power', pressurePa: 21e6, flowM3s: 0.002, boreMm: 100 } })
  assert('★ fluid-power 走规则表', a.ok === true && a.value.assessmentId === 'fluid-power', String(a.value?.assessmentId))
  assert('标题为液压/气动', a.result.includes('液压/气动'), a.result.slice(0, 40))
  const b = await run({ operation: 'topology', topology: { action: 'structure', kind: 'gear-train', powerW: 15000, rpm: 1500, stages: [{ ratio: 3 }] } })
  assert('★ gear-train 走规则表', b.ok === true && b.value.assessmentId === 'gear-train', String(b.value?.assessmentId))
  assert('标题为多级传动', b.result.includes('多级传动'), b.result.slice(0, 40))
  const bad = await run({ operation: 'topology', topology: { action: 'structure', kind: 'gear-train', powerW: 15000 } })
  assert('缺 rpm → 不附校核', bad.ok === true && bad.value.assessmentId === undefined, '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
