/**
 * 意图路由：用错入口时给出可执行的 operation 建议（12 类场景 + 噪音控制）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-route-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
/** 把 notice + hint + result 拼起来找建议。 */
function adviceOf(out) {
  return String(out.notice ?? '') + '\n' + String(out.error?.hint ?? '') + '\n' + String(out.result ?? '')
}
function targetOf(text) {
  const m = /operation[:=]\s*"?([a-z_-]+)/.exec(text)
  return m === null ? '' : m[1]
}
console.log('-- 1. 十二类误用都能路由 --')
const CASES = [
  ['x^2-4=0', 'solve'],
  ['求导数 d/dx of x^3', 'derivative'],
  ['这个积分怎么算', 'integral'],
  ['矩阵的特征值是多少', 'eigen'],
  ['账目对不对，收支平衡吗', 'balance'],
  ['这座塔能不能造出来', 'feasibility'],
  ['这个星球的重力和气候', 'world'],
  ['把三里换算成公里', 'units'],
  ['日出日落时间', 'astro'],
  ['最短路怎么走', 'topology'],
  ['地图上的国界', 'world-map'],
  ['我要求一下这个数', 'formula'],
]
for (const [text, expect] of CASES) {
  const out = await run({ operation: 'evaluate', expression: text })
  const target = targetOf(adviceOf(out))
  assert('★ ' + text.slice(0, 12) + ' → ' + expect, target.startsWith(expect), '实际: ' + (target || '（无建议）'))
}
console.log('-- 2. 报错类型改判 --')
{
  const out = await run({ operation: 'evaluate', expression: 'x^2-4=0' })
  assert('★ 「= 被当赋值」不再报 internal', out.ok === false && out.error?.type === 'invalid_argument', String(out.error?.type))
  assert('★ 结果文本里带提示', String(out.result).includes('提示：'), String(out.result).slice(0, 80))
}
console.log('-- 3. 噪音控制（正常式子不提示）--')
for (const text of ['1+1', '2*3+4', 'sqrt(16)', '10 hp to kW', '(80/25-101/41.5)/(80/25)*100', 'sin(pi/6)']) {
  const out = await run({ operation: 'evaluate', expression: text })
  const advice = adviceOf(out)
  const noisy = advice.includes('可能用错入口') || advice.includes('看起来是**') || advice.includes('看起来像')
  assert('★ 不打扰：' + text.slice(0, 24), !noisy, advice.slice(0, 80))
}
console.log('-- 4. 非通用入口不提示（不越权）--')
{
  const out = await run({ operation: 'solve', equations: 'x^2-4=0' })
  const advice = adviceOf(out)
  assert('★ solve 本身不给「换 operation」建议', !advice.includes('看起来是**方程**'), '')
}
console.log('-- 5. 决策树优先级（第一个命中就赢）--')
{
  /** 方程组优先于单方程。 */
  const sys = adviceOf(await run({ operation: 'evaluate', expression: 'x+y=5, x-y=1' }))
  assert('★ 多方程 → system（不是 solve）', targetOf(sys) === 'system', targetOf(sys))
  /** 特征值优先于一般矩阵。 */
  const eig = adviceOf(await run({ operation: 'evaluate', expression: '求这个矩阵的特征值' }))
  assert('★ 特征值 → eigen（不是 matrix）', targetOf(eig) === 'eigen', targetOf(eig))
  /** 回归优先于描述统计。 */
  const reg = adviceOf(await run({ operation: 'evaluate', expression: '帮我做数据回归拟合' }))
  assert('★ 回归 → regression（不是 stats）', targetOf(reg) === 'regression', targetOf(reg))
  /** 地图优先于拓扑。 */
  const map = adviceOf(await run({ operation: 'evaluate', expression: '这个地图上的地形和国界' }))
  assert('★ 地图 → world-map（不是 topology）', targetOf(map) === 'world-map', targetOf(map))
}
console.log('-- 6. 拿不准就静默（宁缺勿滥）--')
{
  for (const text of ['嗯', '这个', '看看', '你好']) {
    const advice = adviceOf(await run({ operation: 'evaluate', expression: text }))
    const noisy = advice.includes('看起来是**') || advice.includes('这像是**')
    assert('★ 静默：' + text, !noisy, advice.slice(0, 60))
  }
}

console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
