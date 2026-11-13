/**
 * 反馈缺陷回归（vdocs/反馈包完整对账.md 的 P0–P2 条目）。
 *
 * 每条都成对：**该拒绝的拒绝，该放行的放行**。
 * 已修的在 v3 下必须保持；文档里过时的（如 feasibility 字符串单位）在这里锁住现状。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-defects-'))
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

console.log('-- 1. 精度三件套（T8-D01/D02/D04a）--')
{
  const big = await run({ expression: '(10^100+1)-(10^100)' })
  assert('★ D01 超精度必须提示（不静默）', big.ok === true && typeof big.notice === 'string' && big.notice.includes('超过当前计算精度'), String(big.notice).slice(0, 80))

  const dp0 = await run({ operation: 'evaluate', expression: '1/3', displayPrecision: 0 })
  assert('★ D02 displayPrecision:0 → 只留整数（0）', dp0.ok === true && dp0.result.trim() === '0', dp0.result.slice(0, 40))
  const dp0ok = await run({ operation: 'evaluate', expression: '2.7', displayPrecision: 0 })
  assert('D02 正向对照：2.7 → 3', dp0ok.ok === true && dp0ok.result.trim() === '3', dp0ok.result.slice(0, 40))

  const negative = await run({ operation: 'evaluate', expression: '1/3', displayPrecision: -1 })
  assert('★ D04a 越界必须提示', negative.ok === true && typeof negative.notice === 'string' && negative.notice.includes('0–64'), String(negative.notice).slice(0, 80))
  assert('D04a 钳到 0 位', negative.result.trim() === '0', negative.result.slice(0, 40))
}

console.log('-- 2. 批量与参数契约（T4-15 / T7-N3 / T7-N4 / T7-N6）--')
{
  const batch = await run({
    operation: 'formulas',
    formulas: [
      { formula: 'kleiber', overrides: { m: 1, m0: 1, B0: 1 } },
      { formula: 'kleiber', overrides: { m: 1, m0: 1, B0: 1, bogusKey: 2 }, label: '拼错参数的' },
    ],
  })
  assert('★ T4-15 批量里未知 key 必须点名', batch.ok === true && batch.value.failed === 1 && batch.result.includes('unknown_argument'), batch.result.slice(-200))
  assert('T4-15 另一条仍成功', batch.value.succeeded === 1, JSON.stringify(batch.value))

  const statsWithY = await run({ operation: 'stats', data: [1, 2, 3, 4, 5], dataY: [1, 2] })
  assert('★ T7-N3 stats 收 dataY → unknown_argument', statsWithY.ok === false && statsWithY.error?.type === 'unknown_argument', JSON.stringify(statsWithY.error))

  const tooMany = await run({ operation: 'dist', distribution: 'poisson', params: [3, 99], x: 2 })
  assert('★ T7-N4 dist 多余参数 → invalid_argument', tooMany.ok === false && tooMany.error?.type === 'invalid_argument', JSON.stringify(tooMany.error))
  const exact = await run({ operation: 'dist', distribution: 'poisson', params: [3], x: 2 })
  assert('T7-N4 正向对照：参数个数正确 → 通过', exact.ok === true, String(exact.error?.message))

  const degree = await run({ operation: 'regression', data: [1, 2, 3], dataY: [2, 4, 6], degree: 0 })
  assert('T7-N6 degree<=0 → invalid_argument', degree.ok === false && degree.error?.type === 'invalid_argument', '')
}

console.log('-- 3. balance 量纲（T7-N1/N2）--')
{
  const cross = await run({ operation: 'balance', balance: { a: { demand: 1, supply: 2, unit: 'm³' }, b: { demand: 1, supply: 1, unit: 'kW' } } })
  assert('★ N1 跨量纲 → invalid_argument', cross.ok === false && cross.error?.type === 'invalid_argument', JSON.stringify(cross.error))

  const absurd = await run({ operation: 'balance', balance: { water: { demand: 1, supply: 2, unit: '光年' } } })
  assert('★ N2 水量用光年 → invalid_argument', absurd.ok === false && absurd.error?.type === 'invalid_argument', JSON.stringify(absurd.error))

  const same = await run({ operation: 'balance', balance: { grain: { demand: 1, supply: 2, unit: '吨' }, water: { demand: 1, supply: 2, unit: 'L' } } })
  assert('N1/N2 正向对照：同族（质量+体积）仍会跨族被拒', same.ok === false, '')
  const valid = await run({ operation: 'balance', balance: { grain: { demand: 1, supply: 2, unit: '吨' } } })
  assert('单族常量 → 通过', valid.ok === true, String(valid.error?.message))
}

console.log('-- 4. world terrain / feasibility（T3-13 / T7-N9）--')
{
  const badKind = await run({ operation: 'world', terrain: { kind: 'coastel' } })
  assert('★ T3-13 拼错地形 → invalid_argument', badKind.ok === false && badKind.error?.type === 'invalid_argument', JSON.stringify(badKind.error))
  const goodKind = await run({ operation: 'world', terrain: { kind: 'coastal' } })
  assert('合法地形仍通过', goodKind.ok === true, String(goodKind.error?.message))

  const withUnit = await run({ operation: 'feasibility', claims: { buildingHeight: '50 m' } })
  assert('★ T7-N9 字符串带单位被正确解析（claimed=50）', withUnit.ok === true && withUnit.value.results[0].claimed === 50, JSON.stringify(withUnit.value.results[0]).slice(0, 120))
  const bad = await run({ operation: 'feasibility', claims: { buildingHeight: 'abc' } })
  assert('T7-N9 非法字符串 → invalid_argument', bad.ok === false && bad.error?.type === 'invalid_argument', '')
}

console.log('-- 5. derivation 缺参与默认（W13）--')
{
  const compare = await run({ operation: 'derivation', derivation: 'compare' })
  assert('W13 compare 缺参 → missing_params', compare.ok === false && compare.error?.type === 'missing_params', '')
  const phase = await run({ operation: 'derivation', derivation: 'phase' })
  assert('★ W13 phase 用默认范围必须说出来', phase.ok === true && phase.result.includes('范围：g'), phase.result.slice(0, 120))
  const trace = await run({ operation: 'derivation', derivation: 'trace' })
  assert('W13 trace 缺参时给用法', trace.ok === true && trace.result.includes('用法'), trace.result.slice(0, 120))
}

console.log('-- 6. 已知修复回归（W09-T4-14 / T3-11）--')
{
  const point = await run({ operation: 'units', unitValue: 1, unitFrom: '点', unitTo: 's' })
  assert('★ W09-T4-14「点」不再被当时间单位', point.ok === false, JSON.stringify(point.error).slice(0, 100))
  const world = await run({ operation: 'world' })
  assert('T3-11 world 无参给出行星级默认值', world.ok === true && world.result.includes('【行星】'), world.result.slice(0, 80))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
