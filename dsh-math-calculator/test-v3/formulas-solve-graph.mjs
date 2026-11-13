/**
 * 阶段 2：公式反解（solve-for）与公式-链结构图。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-formulas-solve-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)

const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 反解：符号解 + 验证 --')
{
  const out = await run({ operation: 'formula', formula: 'circle_area', solveFor: 'r', targetValue: 100 })
  assert('★ 圆面积 100 → r ≈ 5.6419', out.ok === true && out.value.solutions.some((x) => near(x, Math.sqrt(100 / Math.PI), 1e-6)), JSON.stringify(out.value?.solutions))
  assert('result 说明已代回验证', out.result.includes('代回验证'), out.result.slice(0, 80))

  const mgh = await run({ operation: 'formula', formula: 'potential_energy', solveFor: 'm', targetValue: 100, params: { g: 9.81, h: 10 } })
  assert('★ m·g·h=100 → m ≈ 1.0194', mgh.ok === true && mgh.value.solutions.some((x) => near(x, 100 / (9.81 * 10), 1e-6)), JSON.stringify(mgh.value?.solutions))
}

console.log('-- 2. 多解与无解 --')
{
  const multi = await run({ operation: 'formula', formula: 'circle_area', solveFor: 'r', targetValue: 100 })
  assert('★ 多解（±r）给出提示', multi.value.solutions.length >= 2 && (multi.notice ?? '').includes('多解'), JSON.stringify(multi.value?.solutions))
  const noReal = await run({ operation: 'formula', formula: 'circle_area', solveFor: 'r', targetValue: -100 })
  assert('★ 负数目标 → 无实数解', noReal.ok === true && noReal.value.solutions.length === 0, JSON.stringify(noReal.value))
  assert('说明只有复数解或可给 range', noReal.result.includes('没有找到实数解'), noReal.result.slice(0, 80))
}

console.log('-- 3. 参数与错误路径 --')
{
  const missing = await run({ operation: 'formula', formula: 'ideal_strength', solveFor: 'factor', targetValue: 100 })
  assert('★ 缺必填参数 → missing_params', missing.ok === false && missing.error?.type === 'missing_params', JSON.stringify(missing.error))

  const badFormula = await run({ operation: 'formula', formula: 'no_such_formula', solveFor: 'x', targetValue: 1 })
  assert('未知公式 → 走老入口报错或 unknown_formula', badFormula.ok === false, String(badFormula.error?.type))

  const badTarget = await run({ operation: 'formula', formula: 'circle_area', solveFor: 'z', targetValue: 1 })
  assert('未知参数 → unknown_symbol', badTarget.ok === false && badTarget.error?.type === 'unknown_symbol', JSON.stringify(badTarget.error))

  const display = await run({ operation: 'formula', formula: 'gini', solveFor: 'n', targetValue: 1 })
  assert('★ 展示式不能反解 → invalid_argument', display.ok === false && display.error?.type === 'invalid_argument', JSON.stringify(display.error))
}

console.log('-- 4. 公式-链结构图 --')
{
  const graph = await run({ operation: 'formulas', query: 'graph' })
  assert('★ 公式 686 条 + 链 22 条', graph.ok === true && graph.value.formulas === 686 && graph.value.systems === 22, JSON.stringify({ f: graph.value?.formulas, s: graph.value?.systems }))
  assert('边数 > 0', graph.value.edges > 0, String(graph.value?.edges))
  assert('★ 明确标出「steps 缺参数映射」的缺口', graph.result.includes('没有参数映射') && graph.value.gap.includes('缺参数映射'), '')
  assert('孤立公式统计', Array.isArray(graph.value.isolatedFormulas), '')

  const focusFormula = await run({ operation: 'formulas', formulaGraph: true, formulaFocus: 'ideal_strength' })
  assert('★ 焦点公式：出现在哪些链', focusFormula.ok === true && focusFormula.value.systems.length > 0, JSON.stringify(focusFormula.value?.systems))

  const focusSystem = await run({ operation: 'formulas', formulaGraph: true, formulaFocus: 'sys-material' })
  assert('★ 焦点链：列出步骤', focusSystem.ok === true && focusSystem.value.steps.length > 0, String(focusSystem.value?.steps?.length))

  const bad = await run({ operation: 'formulas', formulaGraph: true, formulaFocus: 'no-such' })
  assert('未知焦点 → unknown_symbol', bad.ok === false && bad.error?.type === 'unknown_symbol', JSON.stringify(bad.error))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
