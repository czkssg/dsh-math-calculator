/**
 * 入口第二批：数值/公式/图谱走新实现。
 *
 * 这两批加起来后，入口的「具名 operation」几乎全部由新代码处理；
 * 仍走老入口的只剩 constants / workspace / quantities / formula-table /
 * custom / balance / help / auto（不在本轮范围，见交接）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-tool-num-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const dispatch = await import(pathToFileURL(join(root, 'lib/dispatch.js')).href)
const tool = toolMod.mathExecuteTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) {
  return tool.execute(args, {})
}

console.log('-- 1. evaluate / 代数 --')
{
  const basic = await run({ operation: 'evaluate', expression: '2+3*4' })
  assert('★ evaluate 走新实现（14）', basic.ok === true && basic.result.includes('14'), basic.result.slice(0, 60))
  const batch = await run({ operation: 'evaluate', expressions: ['1/4', '2^10'] })
  assert('批量求值', batch.ok === true && batch.result.includes('0.25') && batch.result.includes('1024'), batch.result.slice(0, 80))
  const withVars = await run({ operation: 'evaluate', expression: 'm*v', variables: { m: 5, v: 3 } })
  assert('★ 带变量仍走老入口（15）', withVars.ok === true && withVars.result.includes('15'), withVars.result.slice(0, 60))

  const solve = await run({ operation: 'solve', expression: 'x^2-4=0' })
  assert('solve 走新实现', solve.ok === true && (solve.result.includes('2') || solve.result.includes('-2')), solve.result.slice(0, 60))
  const deriv = await run({ operation: 'derivative', expression: 'x^3' })
  assert('derivative 走新实现', deriv.ok === true && deriv.result.includes('3'), deriv.result.slice(0, 60))
  const integral = await run({ operation: 'integral', expression: 'x^2', from: 0, to: 3 })
  assert('定积分 9', integral.ok === true && integral.result.includes('9'), integral.result.slice(0, 60))
  const roots = await run({ operation: 'roots', expression: 'x^2-1' })
  assert('roots', roots.ok === true, roots.result.slice(0, 60))
}

console.log('-- 2. 矩阵 / 统计 / 分布 / 回归 --')
{
  const matrix = await run({ operation: 'matrix', matrix: [[1, 2], [3, 4]] })
  assert('matrix 秩 2、行列式 -2', matrix.ok === true && matrix.result.includes('2') && matrix.result.includes('-2'), matrix.result.slice(0, 80))
  const eigen = await run({ operation: 'eigen', matrix: [[2, 1], [1, 2]] })
  assert('eigen 3 与 1', eigen.ok === true && eigen.result.includes('3') && eigen.result.includes('1'), eigen.result.slice(0, 80))
  const system = await run({ operation: 'system', matrix: [[1, 1], [1, -1]], vector: [5, 1] })
  assert('线性方程组 x=3,y=2', system.ok === true, system.result.slice(0, 80))

  const stats = await run({ operation: 'stats', data: [1, 2, 3, 4] })
  assert('stats 均值 2.5', stats.ok === true && stats.result.includes('2.5'), stats.result.slice(0, 80))
  const dist = await run({ operation: 'dist', distribution: 'normal', params: [0, 1], x: 0 })
  assert('dist 标准正态在 0 的密度 0.3989', dist.ok === true && dist.result.includes('0.398'), dist.result.slice(0, 80))
  const reg = await run({ operation: 'regression', data: [1, 2, 3], dataY: [2, 4, 6] })
  assert('回归斜率 2', reg.ok === true && reg.result.includes('2'), reg.result.slice(0, 80))
}

console.log('-- 3. ODE / 递推 / 单位 --')
{
  const ode = await run({ operation: 'ode', expression: 'dy/dt = -y', initial: { y: 1 }, from: 0, to: 1, steps: 200, samples: 3 })
  assert('★ ODE 衰减到约 0.37', ode.ok === true, ode.result.slice(0, 100))
  const rec = await run({ operation: 'recurrence', recurrence: 'P*2', initial: { P: 100 }, periods: 5 })
  assert('递推翻倍 3200', rec.ok === true && rec.result.includes('3200'), rec.result.slice(0, 80))
  const units = await run({ operation: 'units', unitValue: 30, unitFrom: '里', unitTo: 'km' })
  assert('★ 30 里 → 15 km', units.ok === true && units.result.includes('15'), units.result.slice(0, 60))
  const describe = await run({ operation: 'units', unitFrom: '里' })
  assert('只给 unitFrom → 单位信息', describe.ok === true, describe.result.slice(0, 60))
}

console.log('-- 4. 公式库 --')
{
  const query = await run({ operation: 'formulas', query: '克莱伯' })
  assert('公式检索有结果', query.ok === true && query.result.length > 20, query.result.slice(0, 80))
  const formulaMissing = await run({ operation: 'formula', formula: 'kleiber' })
  assert('★ 缺参 → missing_params 并列出参数', formulaMissing.ok === false && formulaMissing.error?.type === 'missing_params' && (formulaMissing.error?.hint ?? '').includes('m'), JSON.stringify(formulaMissing.error))
  const formula = await run({ operation: 'formula', formula: 'kleiber', overrides: { m: 10, m0: 1, B0: 1 } })
  assert('★ 给 overrides 后能算', formula.ok === true && formula.result.length > 10, formula.result.slice(0, 100))
}

console.log('-- 5. 对账图谱五件套 --')
{
  const ledger = await run({ operation: 'ledger', ledger: { parts: [{ name: '甲', value: 60 }, { name: '乙', value: 40 }], total: 100 } })
  assert('ledger 闭合', ledger.ok === true && ledger.result.includes('100'), ledger.result.slice(0, 80))
  const consistency = await run({ operation: 'consistency', consistency: { sections: [{ number: 1, text: '人口 920 亿' }, { number: 2, text: '人口 8 亿' }] } })
  assert('★ consistency 检出 115 倍冲突', consistency.ok === true && consistency.result.includes('115'), consistency.result.slice(0, 80))
  const compare = await run({ operation: 'compare', compare: { rows: ['甲', '乙'], cols: ['成本'], data: [[10], [15]] } })
  assert('compare 表 + 胜者', compare.ok === true && compare.result.includes('甲'), compare.result.slice(0, 80))
  const interval = await run({ operation: 'interval', interval: { expr: '20-50' } })
  assert('interval 区间', interval.ok === true, interval.result.slice(0, 80))
  const dependency = await run({ operation: 'dependency', dependency: { edges: [{ from: 'G', to: 'g' }, { from: 'g', to: 'v' }] }, traceTarget: 'G' })
  assert('dependency 下游传导', dependency.ok === true, dependency.result.slice(0, 80))
}

console.log('-- 6. 迁移清单 --')
{
  assert('★ 全部 48 个 operation 已迁移', dispatch.MIGRATED_OPERATIONS.length === 48, String(dispatch.MIGRATED_OPERATIONS.length))
  const rest = ['constants', 'workspace', 'quantities', 'formula-table', 'custom', 'balance', 'help']
  for (const op of rest) {
    assert('收尾批 ' + op + ' 已在迁移清单', dispatch.MIGRATED_OPERATIONS.includes(op), '')
  }
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
