/**
 * 数组型公式：gini / hhi / shannon_entropy / simpson_diversity。
 *
 * ## 为什么单独测
 *
 * 这 4 条此前标为 executable:false（"展示式"），因为它们要**遍历数组**，
 * 而普通公式求值只处理标量。能力体检发现这是 859 条里唯一的 4 条空白。
 *
 * ## 断言用「定义性质」，不是「背数值」
 *
 * 例如基尼系数：完全平均 → 0；完全集中 → 接近 1。这比背一个具体数字可靠。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-array-formula-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
/** 取数值结果。 */
const numOf = (out) => {
  const v = out.value
  if (typeof v === 'number') return v
  if (v && typeof v === 'object' && typeof v.answer === 'number') return v.answer
  return Number(String(out.result).replace(/[^\d.eE+-]/g, ''))
}

console.log('-- 1. 基尼系数 gini --')
{
  /** 完全平均：所有人份额相同 → G = 0 */
  const even = await run({ operation: 'formula', formula: 'gini', overrides: { y: [0.25, 0.25, 0.25, 0.25] } })
  assert('★ 完全平均 → 0', even.ok && Math.abs(numOf(even)) < 1e-9, String(numOf(even)))
  /** 完全集中：一人独占 → 接近 1 */
  const skewed = await run({ operation: 'formula', formula: 'gini', overrides: { y: [0, 0, 0, 1] } })
  assert('★ 完全集中 → 接近 1', skewed.ok && numOf(skewed) > 0.7, String(numOf(skewed)))
  /** 单调性：越不均越大 */
  const a = await run({ operation: 'formula', formula: 'gini', overrides: { y: [0.25, 0.25, 0.25, 0.25] } })
  const b = await run({ operation: 'formula', formula: 'gini', overrides: { y: [0.1, 0.2, 0.3, 0.4] } })
  assert('★ 越不均越大（单调性）', numOf(b) > numOf(a), numOf(a) + ' vs ' + numOf(b))
}

console.log('-- 2. 赫芬达尔指数 hhi --')
{
  /** 四家均分 → 4×(0.25)² = 0.25 */
  const four = await run({ operation: 'formula', formula: 'hhi', overrides: { s: [0.25, 0.25, 0.25, 0.25] } })
  assert('★ 四家均分 = 0.25', four.ok && Math.abs(numOf(four) - 0.25) < 1e-9, String(numOf(four)))
  /** 一家独占 → 1 */
  const mono = await run({ operation: 'formula', formula: 'hhi', overrides: { s: [1] } })
  assert('★ 完全垄断 = 1', mono.ok && Math.abs(numOf(mono) - 1) < 1e-9, String(numOf(mono)))
  /** 定义性质：份额平方和，必在 [0,1] */
  const mid = await run({ operation: 'formula', formula: 'hhi', overrides: { s: [0.5, 0.3, 0.2] } })
  assert('★ 结果落在 [0,1]', mid.ok && numOf(mid) >= 0 && numOf(mid) <= 1, String(numOf(mid)))
}

console.log('-- 3. 香农熵 shannon_entropy --')
{
  /** 两种等概率 → 1 bit */
  const half = await run({ operation: 'formula', formula: 'shannon_entropy', overrides: { p: [0.5, 0.5], base: 2 } })
  assert('★ 两种等概率 = 1 bit', half.ok && Math.abs(numOf(half) - 1) < 1e-6, String(numOf(half)))
  /** 四种等概率 → 2 bit */
  const four = await run({ operation: 'formula', formula: 'shannon_entropy', overrides: { p: [0.25, 0.25, 0.25, 0.25], base: 2 } })
  assert('★ 四种等概率 = 2 bit', four.ok && Math.abs(numOf(four) - 2) < 1e-6, String(numOf(four)))
  /** 确定事件 → 0 -->
  const sure = await run({ operation: 'formula', formula: 'shannon_entropy', overrides: { p: [1], base: 2 } })
  assert('★ 确定事件 = 0 bit', sure.ok && Math.abs(numOf(sure)) < 1e-9, String(numOf(sure)))
}

console.log('-- 4. 辛普森多样性 simpson_diversity --')
{
  /** 两个等丰度 → 1 - 2×0.25 = 0.5 */
  const two = await run({ operation: 'formula', formula: 'simpson_diversity', overrides: { p: [0.5, 0.5] } })
  assert('★ 两个等丰度 = 0.5', two.ok && Math.abs(numOf(two) - 0.5) < 1e-9, String(numOf(two)))
  /** 单一物种 → 0 -->
  const mono = await run({ operation: 'formula', formula: 'simpson_diversity', overrides: { p: [1] } })
  assert('★ 单一物种 = 0', mono.ok && Math.abs(numOf(mono)) < 1e-9, String(numOf(mono)))
}

console.log('-- 5. 边界与错误处理 --')
{
  /** 空数组应明确报错，不能静默返回 0。 */
  const empty = await run({ operation: 'formula', formula: 'hhi', overrides: { s: [] } })
  assert('★ 空数组明确报错', empty.ok === false, String(empty.ok))
  /** 非数组输入应报错。 */
  const bad = await run({ operation: 'formula', formula: 'hhi', overrides: { s: 0.5 } })
  assert('★ 非数组明确报错', bad.ok === false, String(bad.ok))
}

console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
