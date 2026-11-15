/**
 * 模型链：backtrace 拼跨 operation 的链（world → 人口 → 财政）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-modelchain-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const btMod = await import(pathToFileURL(join(root, 'lib/features/formulas/backtrace.js')).href)
const tool = toolMod.mathExecuteTool
const fs = await import('node:fs/promises')
const F = JSON.parse(await fs.readFile(join(root, 'src/data/formulas.json'), 'utf8'))
const MC = JSON.parse(await fs.readFile(join(root, 'src/data/model-chains.json'), 'utf8')).chains
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 模型链命中（跨 operation）--')
{
  const world = btMod.backtrace(F, '这个世界能养活多少人', { modelChains: MC })
  assert('★ world → 人口链', world.modelChain?.id === 'world-population', String(world.modelChain?.id))
  assert('首步是 world，末步是 balance', world.modelChain?.steps[0].op === 'world' && world.modelChain?.steps[2].op === 'balance', JSON.stringify(world.modelChain?.steps.map((s) => s.op)))
  assert('★ calls 是跨 op 序列', world.modelChain?.calls[0].operation === 'world' && world.modelChain?.calls[2].operation === 'balance', '')
  const fiscal = btMod.backtrace(F, '帝国财政能不能撑住', { modelChains: MC })
  assert('★ 人口 → 财政链', fiscal.modelChain?.id === 'population-fiscal', String(fiscal.modelChain?.id))
}

console.log('-- 2. 未命中模型链 → 回落公式链 --')
{
  const r = btMod.backtrace(F, '锅炉煤耗', { modelChains: MC })
  assert('★ 无模型链时回落公式链', r.modelChain === undefined && r.matches.length > 0, String(r.modelChain?.id))
  assert('公式链仍有链与缺参', r.chain.length > 0 && r.missing.length >= 0, '')
}

console.log('-- 3. 模型链数据驱动 --')
{
  assert('★ 9 条模型链（含文明→历史）', MC.length === 9, String(MC.length))
  const historyChain = btMod.backtrace(F, '这个文明的历史会怎么走', { modelChains: MC })
  assert('★ 历史推演链：conflict → history → diverge', historyChain.modelChain?.id === 'history-sim' && historyChain.modelChain.calls.map((x) => x.operation).join(',') === 'conflict,history,diverge', JSON.stringify(historyChain.modelChain?.calls))
  const custom = [{ id: 'custom', label: '自定义链', keywords: ['我的目标'], steps: [{ op: 'world', label: '第一步', needs: ['x'] }] }]
  const r = btMod.backtrace(F, '我的目标', { modelChains: custom })
  assert('★ 改数据即生效（自定义链）', r.modelChain?.id === 'custom', String(r.modelChain?.id))
}

console.log('-- 4. 经 tool --')
{
  const out = await run({ operation: 'backtrace', target: '军事后勤能打多远' })
  assert('★ tool 命中军队 → 后勤链', out.ok === true && out.result.includes('军队 → 后勤'), out.result.slice(0, 80))
  assert('输出含跨 op 调用', out.result.includes('"operation":"topology"') && out.result.includes('"operation":"formula"'), '')
  assert('needs 汇总列出', out.result.includes('需你给的参数'), '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
