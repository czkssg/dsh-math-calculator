/**
 * 热工/电气/流体 校核（规则表第 14/15/16 类）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-physsys-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const p = await import(pathToFileURL(join(root, 'lib/features/topology/physical-systems.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 热工 --')
{
  const r = p.assessThermal({ hotK: 773, coldK: 373, inputW: 1000, outputW: 344 })
  assert('★ 卡诺 51.7%（773K/373K）', Math.abs(r.carnot - 0.5175) < 0.001, String(r.carnot))
  assert('★ 实际 34.4%', Math.abs((r.actualEfficiency ?? 0) - 0.344) < 0.001, String(r.actualEfficiency))
  assert('★ 达到卡诺的 66%', Math.abs((r.carnotFractionPct ?? 0) - 66.5) < 1, String(r.carnotFractionPct))
  const heat = p.assessThermal({ hotK: 773, coldK: 373, areaM2: 10, uValueWm2K: 50 })
  assert('★ 换热功率 200 kW（10×50×400）', Math.abs((heat.heatTransferW ?? 0) / 1000 - 200) < 0.1, String(heat.heatTransferW))
  let threw = false
  try { p.assessThermal({ hotK: 300, coldK: 400 }) } catch { threw = true }
  assert('热源低于冷源 → 报错', threw, '')
}

console.log('-- 2. 电气 --')
{
  const r = p.assessElectric({ voltageV: 220, currentA: 20, lengthM: 100, crossSectionMm2: 4 })
  assert('★ 线阻 0.86 Ω（铜、100m、4mm²）', Math.abs((r.resistanceOhm ?? 0) - 0.86) < 0.01, String(r.resistanceOhm))
  assert('★ 压降 17.2 V（7.8%）', Math.abs((r.voltageDropV ?? 0) - 17.2) < 0.1 && Math.abs((r.dropPct ?? 0) - 7.82) < 0.05, String(r.dropPct))
  assert('★ 线损 344 W', Math.abs((r.lossW ?? 0) - 344) < 1, String(r.lossW))
  assert('压降超 5% → 提示加粗', r.verdict.some((v) => v.includes('超过 5%')), '')
  const thin = p.assessElectric({ voltageV: 220, currentA: 20, crossSectionMm2: 1 })
  assert('电流密度 20 A/mm² → 过热提示', thin.verdict.some((v) => v.includes('超过 6 A/mm²')), '')
}

console.log('-- 3. 流体 --')
{
  const r = p.assessFluid({ diameterM: 0.1, flowM3s: 0.02, lengthM: 100 })
  assert('★ 流速 2.55 m/s（DN100）', Math.abs(r.velocityMps - 2.546) < 0.01, String(r.velocityMps))
  assert('★ Re 254648 → 湍流', Math.abs(r.reynolds - 254648) < 100 && r.regime === '湍流', String(r.reynolds))
  assert('★ 沿程损失 60.2 kPa', Math.abs((r.pressureDropPa ?? 0) / 1000 - 60.15) < 0.5, String((r.pressureDropPa ?? 0) / 1000))
  const slow = p.assessFluid({ diameterM: 0.1, flowM3s: 0.0001 })
  assert('低流量 → 层流', slow.regime === '层流', slow.regime)
}

console.log('-- 4. 经 topology 三类 --')
{
  for (const [kind, args, label] of [
    ['thermal', { hotK: 773, coldK: 373 }, '热工'],
    ['electric', { voltageV: 220, currentA: 20 }, '电气'],
    ['fluid', { diameterM: 0.1, flowM3s: 0.02 }, '流体'],
  ]) {
    const out = await run({ operation: 'topology', topology: { action: 'structure', kind, ...args } })
    assert('★ ' + kind + ' 走规则表，标题「' + label + '」', out.ok === true && out.value.assessmentId === kind && out.result.includes(label), String(out.value?.assessmentId))
  }
  const bad = await run({ operation: 'topology', topology: { action: 'structure', kind: 'fluid', diameterM: 0.1 } })
  assert('缺流量 → 不附校核（不瞎编）', bad.ok === true && bad.value.assessmentId === undefined, '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
