/** 战伤结算：失血时间 / 伤亡拆分 / 含伤后死亡的总死亡。
 *
 * 这一段此前完全是空白：库里有 lanchester 交战损耗，但没有「倒下的人里多少死」。
 * 三条公式都**不依赖历史统计**——失血靠生理常数，拆分与合并靠算术自洽，
 * 时代相关的比例（阵亡占比、DOW 率）一律作为参数交给调用方。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-casualty-'))
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

console.log('-- 1. 失血还能撑多久（生理学，可自证）--')
{
  const r = await run({ operation: 'formula', formula: 'hemorrhage_survival_time', params: { body_mass: 70, bleeding_rate: 100 } })
  assert('70kg、100ml/min → 24.5 分钟', r.ok === true && near(r.value.result, 24.5, 1e-6), r.ok ? String(r.value.result) : r.error && r.error.message)
  const slow = await run({ operation: 'formula', formula: 'hemorrhage_survival_time', params: { body_mass: 70, bleeding_rate: 50 } })
  assert('失血速率减半 → 时间翻倍（49 分钟）', slow.ok === true && near(slow.value.result, 49, 1e-6), slow.ok ? String(slow.value.result) : '')
  const heavy = await run({ operation: 'formula', formula: 'hemorrhage_survival_time', params: { body_mass: 140, bleeding_rate: 100 } })
  assert('体重翻倍 → 时间翻倍（49 分钟）', heavy.ok === true && near(heavy.value.result, 49, 1e-6), heavy.ok ? String(heavy.value.result) : '')
  assert('零失血速率不能静默给 Infinity', !(r.ok === true && !Number.isFinite(r.value.result)), '')
  const zero = await run({ operation: 'formula', formula: 'hemorrhage_survival_time', params: { body_mass: 70, bleeding_rate: 0 } })
  const bad = zero.ok === false || (zero.ok === true && !Number.isFinite(zero.value.result))
  assert('bleeding_rate=0 必须报错或明确非有限值', bad, zero.ok ? String(zero.value.result) : '')
}

console.log('-- 2. 伤亡拆分：阵亡占比 --')
{
  const r = await run({ operation: 'formula', formula: 'casualty_breakdown', params: { total_losses: 1000, kia_share: 0.25 } })
  assert('伤亡 1000、阵亡占比 25% → 250 阵亡', r.ok === true && near(r.value.result, 250, 1e-6), r.ok ? String(r.value.result) : r.error && r.error.message)
  const low = await run({ operation: 'formula', formula: 'casualty_breakdown', params: { total_losses: 1000, kia_share: 0.4 } })
  assert('火力战偏亡（0.4）→ 400 阵亡', low.ok === true && near(low.value.result, 400, 1e-6), low.ok ? String(low.value.result) : '')
}

console.log('-- 3. 含伤后死亡的总死亡 --')
{
  const r = await run({ operation: 'formula', formula: 'deaths_with_dow', params: { kia: 250, wounded: 750, dow_rate: 0.15 } })
  assert('250 阵亡 + 750 伤 × 15% DOW → 362.5 死亡', r.ok === true && near(r.value.result, 362.5, 1e-6), r.ok ? String(r.value.result) : r.error && r.error.message)
  const noCare = await run({ operation: 'formula', formula: 'deaths_with_dow', params: { kia: 250, wounded: 750, dow_rate: 0.3 } })
  assert('无野战外科（DOW 30%）→ 475 死亡', noCare.ok === true && near(noCare.value.result, 475, 1e-6), noCare.ok ? String(noCare.value.result) : '')
  const zeroDow = await run({ operation: 'formula', formula: 'deaths_with_dow', params: { kia: 250, wounded: 750, dow_rate: 0 } })
  assert('DOW=0 → 死亡 = 阵亡数', zeroDow.ok === true && near(zeroDow.value.result, 250, 1e-6), zeroDow.ok ? String(zeroDow.value.result) : '')
}

console.log('-- 4. 与兰彻斯特串联（整条链能跑通）--')
{
  const lan = await run({ operation: 'formula', formula: 'lanchester_square', params: { N0: 1000, M0: 800, a: 1, b: 1 } })
  assert('兰彻斯特平方律：1000 vs 800 → 剩 600', lan.ok === true && near(lan.value.result, 600, 1e-6), lan.ok ? String(lan.value.result) : lan.error && lan.error.message)
  const losses = 1000 - (lan.ok ? lan.value.result : NaN)
  const kia = await run({ operation: 'formula', formula: 'casualty_breakdown', params: { total_losses: losses, kia_share: 0.25 } })
  const dead = await run({ operation: 'formula', formula: 'deaths_with_dow', params: { kia: kia.ok ? kia.value.result : NaN, wounded: losses - (kia.ok ? kia.value.result : NaN), dow_rate: 0.15 } })
  assert('损耗 400 → 100 阵亡 / 300 伤 → 145 死亡', dead.ok === true && near(dead.value.result, 145, 1e-6), dead.ok ? String(dead.value.result) : '')
  const deadValue = dead.ok === true ? dead.value.result : NaN
  assert('总死亡 ≤ 伤亡总数（算术自洽）', Number.isFinite(deadValue) && deadValue <= losses, String(deadValue) + ' vs ' + losses)
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
