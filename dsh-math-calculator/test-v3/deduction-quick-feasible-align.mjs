/**
 * quick_feasible 对齐测试：一句话 → 四态判定。
 *
 * 老实现的三条核心行为：
 *   ① 认维度用词面匹配（不做语义理解）；
 *   ② 尺寸/能量交给已有上限判（feasibility / 行星截获功率）；
 *   ③ 认不出就明说「判不了」，不编「大概勉强」。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-quick-align-'))
const qf = await import(pathToFileURL(join(root, 'lib/features/deduction/quick-feasible.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}

console.log('-- 1. ★ 尺寸：8000 米塔 → 不可行 --')
{
  const out = qf.runQuickFeasible({ claim: '这座塔能有 8000 米高' })
  assert('判定不可行', out.value.verdict === 'infeasible', out.value.verdict)
  assert('依据里含建筑上限 4902.9', out.value.checks.some((c) => c.finding.includes('4902.9')), JSON.stringify(out.value.checks))
  assert('★ 一行结论说清卡在哪', out.value.oneLine.startsWith('不行：尺寸这一维'), out.value.oneLine)
}

console.log('-- 2. 尺寸：巨兽 30m → 超生物上限 --')
{
  const out = qf.runQuickFeasible({ claim: '巨兽 30 米高' })
  assert('不可行', out.value.verdict === 'infeasible', out.value.verdict)
  assert('用的是生物上限 24.96m', out.value.checks.some((c) => c.finding.includes('24.96')), JSON.stringify(out.value.checks))
}

console.log('-- 3. 尺寸：800 米塔 → 可行（余量大） --')
{
  const out = qf.runQuickFeasible({ claim: '这座塔 800 米高' })
  assert('可行', out.value.verdict === 'feasible', out.value.verdict)
  assert('★ 给余量倍数', out.value.checks[0].headroom > 5, String(out.value.checks[0].headroom))
}

console.log('-- 4. ★ 能量：与行星截获功率比 --')
{
  const small = qf.runQuickFeasible({ claim: '这个文明需要 5e13 瓦' })
  assert('5e13 W 可行（远低于截获上限）', small.value.verdict === 'feasible', small.value.verdict)
  const huge = qf.runQuickFeasible({ claim: '这个文明需要 1e19 瓦' })
  assert('★ 1e19 W 超过行星截获 → 不可行', huge.value.verdict === 'infeasible', huge.value.verdict)
  assert('依据说明了截获上限', huge.value.checks.some((c) => c.finding.includes('截获')), '')
}

console.log('-- 5. ★ 判不了：人口 / 材料 / 时间 --')
{
  const population = qf.runQuickFeasible({ claim: '这个城能养 920 亿人' })
  assert('人口 → 判不了', population.value.verdict === 'unknown', population.value.verdict)
  assert('说明人口无硬上限', population.value.checks.some((c) => c.finding.includes('没有物理硬上限')), '')
  assert('一行结论说「不猜」', population.value.oneLine.includes('不猜'), population.value.oneLine)

  const material = qf.runQuickFeasible({ claim: '钢材强度提高三倍' })
  assert('材料 → 给出本世界基准，不判', material.value.verdict === 'unknown', material.value.verdict)
  assert('给的是抗压强度', material.value.checks.some((c) => c.finding.includes('抗压强度')), '')

  const time = qf.runQuickFeasible({ claim: '工期 20 年' })
  assert('时间 → 不判并指路', time.value.verdict === 'unknown' && time.value.checks.some((c) => c.finding.includes('recurrence')), '')
}

console.log('-- 6. 词面匹配：乱语 → 列可判维度 --')
{
  const out = qf.runQuickFeasible({ claim: '巨龙很酷' })
  assert('一个维度都没认出', out.value.verdict === 'unknown' && out.value.dimensions.length === 0, JSON.stringify(out.value.dimensions))
  assert('列出可判维度', out.result.includes('尺寸') && out.result.includes('能量'), '')
  assert('声明只做词面匹配', out.result.includes('不做语义理解'), '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
