/** 疾病病程：感染到结局的时间 / 病死换算。
 *
 * 传染动力学已有（R0/倍增/峰值/最终规模）；缺的是个体时间轴与 CFR 换算。
 * 三条都是纯算术，可自证；具体病的潜伏/病程/CFR 是参数，不内置单一值。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-disease-'))
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
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol

console.log('-- 1. 感染后第几天出结果 --')
{
  const r = await run({ operation: 'formula', formula: 'infection_to_outcome', params: { incubation_period: 12, illness_duration: 18 } })
  assert('天花开：潜伏 12 + 病程 18 → 30 天', r.ok === true && near(r.value.result, 30, 1e-9), r.ok ? String(r.value.result) : r.error && r.error.message)
  const flu = await run({ operation: 'formula', formula: 'infection_to_outcome', params: { incubation_period: 2, illness_duration: 7 } })
  assert('流感：2 + 7 → 9 天', flu.ok === true && near(flu.value.result, 9, 1e-9), flu.ok ? String(flu.value.result) : '')
}

console.log('-- 2. 病例里死多少 --')
{
  const r = await run({ operation: 'formula', formula: 'deaths_from_cases', params: { cases: 1000, case_fatality_rate: 0.3 } })
  assert('1000 例天花 × 30% → 300 死', r.ok === true && near(r.value.result, 300, 1e-9), r.ok ? String(r.value.result) : r.error && r.error.message)
  const mild = await run({ operation: 'formula', formula: 'deaths_from_cases', params: { cases: 100000, case_fatality_rate: 0.001 } })
  assert('10 万例流感级 × 0.1% → 100 死', mild.ok === true && near(mild.value.result, 100, 1e-9), mild.ok ? String(mild.value.result) : '')
}

console.log('-- 3. 死一个，实际感染多少（冰山）--')
{
  const r = await run({ operation: 'formula', formula: 'cases_from_deaths', params: { deaths: 1, case_fatality_rate: 0.001 } })
  assert('1 例死亡、CFR 0.1% → 1000 人感染', r.ok === true && near(r.value.result, 1000, 1e-6), r.ok ? String(r.value.result) : r.error && r.error.message)
  const sterility = await run({ operation: 'formula', formula: 'cases_from_deaths', params: { deaths: 10, case_fatality_rate: 0 } })
  const bad = sterility.ok === false || (sterility.ok === true && !Number.isFinite(sterility.value.result))
  assert('CFR=0 不能静默给 Infinity', bad, sterility.ok ? String(sterility.value.result) : '')
}

console.log('-- 4. 正反可逆 --')
{
  const c = await run({ operation: 'formula', formula: 'cases_from_deaths', params: { deaths: 300, case_fatality_rate: 0.3 } })
  const back = await run({ operation: 'formula', formula: 'deaths_from_cases', params: { cases: c.ok ? c.value.result : NaN, case_fatality_rate: 0.3 } })
  assert('cases_from_deaths → deaths_from_cases 回到 300', back.ok === true && near(back.value.result, 300, 1e-9), back.ok ? String(back.value.result) : '')
}

console.log('-- 5. 与 SIR 串联 --')
{
  const frac = await run({ operation: 'formula', formula: 'sir_equilibrium', params: { R0: 3, x: 0.9 } })
  assert('SIR 最终感染比例可算', frac.ok === true, frac.error && frac.error.message)
  const population = 10000
  const cases = frac.ok ? frac.value.result * population : NaN
  const dead = await run({ operation: 'formula', formula: 'deaths_from_cases', params: { cases, case_fatality_rate: 0.3 } })
  assert('最终感染 × 人口 × CFR → 死亡数合理（>2000）', dead.ok === true && dead.value.result > 2000, dead.ok ? String(Math.round(dead.value.result)) : '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
