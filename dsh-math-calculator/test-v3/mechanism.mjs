/**
 * 机械系统校核（齿轮/轴承/轴），规则表驱动。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-mech-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const mech = await import(pathToFileURL(join(root, 'lib/features/topology/mechanism.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 扭矩与转速 --')
{
  const r = mech.assessMechanism({ powerW: 15000, rpm: 1500, ratio: 3 })
  assert('★ 15000 W @1500 rpm → 95.5 N·m', Math.abs(r.torqueNm - 95.49) < 0.1, String(r.torqueNm))
  assert('★ 传动比 3 → 输出 500 rpm', r.outputRpm === 500, String(r.outputRpm))
}

console.log('-- 2. 齿轮强度 --')
{
  const r = mech.assessMechanism({ powerW: 15000, rpm: 1500, ratio: 3, teethDriver: 20, moduleMm: 3, faceWidthMm: 30 })
  assert('齿数比 3', r.teethRatio === 3, String(r.teethRatio))
  assert('★ 圆周力 3183 N', Math.abs((r.tangentialN ?? 0) - 3183) < 5, String(r.tangentialN))
  assert('★ Lewis 应力 118 MPa', Math.abs((r.lewisStressPa ?? 0) / 1e6 - 117.9) < 1, String((r.lewisStressPa ?? 0) / 1e6))
  assert('判定给出应力范围', r.verdict.some((v) => v.includes('MPa')), '')
}

console.log('-- 3. 轴承寿命 --')
{
  const r = mech.assessMechanism({ powerW: 15000, rpm: 1500, bearingC: 30000, bearingP: 5000, lifeH: 5000 })
  assert('★ L10 = 2400h', Math.abs((r.bearingLifeH ?? 0) - 2400) < 1, String(r.bearingLifeH))
  assert('不足目标寿命 → 提示换大', r.verdict.some((v) => v.includes('需换大一号')), JSON.stringify(r.verdict))
}

console.log('-- 4. 轴与临界转速 --')
{
  const r = mech.assessMechanism({ powerW: 15000, rpm: 1500, shaftDmm: 40 })
  assert('★ 轴扭转 7.6 MPa', Math.abs((r.shaftTorsionPa ?? 0) / 1e6 - 7.6) < 0.2, String((r.shaftTorsionPa ?? 0) / 1e6))
  assert('★ 临界转速 1337 rpm', Math.abs((r.criticalRpm ?? 0) - 1337) < 5, String(r.criticalRpm))
  assert('1500 rpm 接近临界 → 提示', r.verdict.some((v) => v.includes('临界')), JSON.stringify(r.verdict))
}

console.log('-- 5. 经 topology --')
{
  const out = await run({ operation: 'topology', topology: { action: 'structure', kind: 'mechanism', powerW: 15000, rpm: 1500, ratio: 3 } })
  assert('★ mechanism 走规则表', out.ok === true && out.value.assessmentId === 'mechanism', String(out.value?.assessmentId))
  assert('标题为机械系统', out.result.includes('机械系统'), out.result.slice(0, 40))
  const bad = await run({ operation: 'topology', topology: { action: 'structure', kind: 'mechanism', rpm: 1500 } })
  assert('缺 powerW → 不附校核（不瞎编）', bad.ok === true && bad.value.assessmentId === undefined, '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
