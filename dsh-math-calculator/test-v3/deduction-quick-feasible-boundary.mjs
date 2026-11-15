/**
 * quick_feasible 边界测试：缺参、世界参数变化、数值边界。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-quick-boundary-'))
const qf = await import(pathToFileURL(join(root, 'lib/features/deduction/quick-feasible.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
function throwsOf(fn) { try { fn(); return null } catch (error) { return error } }

console.log('-- 1. 缺参与空输入 --')
{
  assert('无输入 → missing_params', throwsOf(() => qf.runQuickFeasible(undefined))?.type === 'missing_params', '')
  assert('空 claim → missing_params', throwsOf(() => qf.runQuickFeasible({ claim: '   ' }))?.type === 'missing_params', '')
  assert('claim 非字符串 → missing_params', throwsOf(() => qf.runQuickFeasible({ claim: 42 }))?.type === 'missing_params', '')
}

console.log('-- 2. ★ 世界参数变化会改上限 --')
{
  const earth = qf.runQuickFeasible({ claim: '这座塔 8000 米高' })
  const heavy = qf.runQuickFeasible({ claim: '这座塔 8000 米高', world: { planetMass: 2 } })
  assert('2g 星球塔上限约减半', heavy.value.checks[0].finding.includes('2451'), heavy.value.checks[0].finding)
  assert('两者都不可行', earth.value.verdict === 'infeasible' && heavy.value.verdict === 'infeasible', '')
  const low = qf.runQuickFeasible({ claim: '这座塔 8000 米高', world: { planetMass: 0.2 } })
  assert('低重力星球 8000 米塔可行', low.value.verdict === 'feasible', low.value.verdict)
}

console.log('-- 3. 只认维度、无数值 --')
{
  const out = qf.runQuickFeasible({ claim: '这座塔很高' })
  assert('认出了尺寸但无数值 → 判不了', out.value.verdict === 'unknown' && out.value.dimensions.includes('尺寸'), '')
  assert('★ 说明要区分「认出了维度」与「一个都没认出」', out.result.includes('认出了这些维度'), out.result.slice(-200))
  assert('给补充数值的例子', out.result.includes('8000 米'), '')
}

console.log('-- 4. 单位与量级边界 --')
{
  const km = qf.runQuickFeasible({ claim: '这座塔 5 公里高' })
  assert('公里换算成米后再比', km.value.checks[0].finding.includes('5000'), km.value.checks[0].finding)

  const mag = qf.runQuickFeasible({ claim: '这个文明需要 50 亿瓦' })
  assert('「50 亿瓦」= 5e9，可行', mag.value.verdict === 'feasible', JSON.stringify(mag.value.checks))

  const zero = qf.runQuickFeasible({ claim: '这座塔 0 米高' })
  assert('0 米不崩（headroom = ∞）', zero.value.verdict === 'feasible' && !Number.isNaN(zero.value.checks[0].headroom), String(zero.value.checks[0].headroom))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
