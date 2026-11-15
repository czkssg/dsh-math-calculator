/**
 * 目标驱动回溯（#1）：给目标 → 命中公式 + 链 + 缺参 + 可执行调用。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-backtrace-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const btMod = await import(pathToFileURL(join(root, 'lib/features/formulas/backtrace.js')).href)
const tool = toolMod.mathExecuteTool
const F = JSON.parse(await (await import('node:fs/promises')).readFile(join(root, 'src/data/formulas.json'), 'utf8'))
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 命中与链 --')
{
  const r = btMod.backtrace(F, '锅炉煤耗')
  assert('★ 命中锅炉相关公式', r.matches.some((m) => m.name.includes('煤耗') || m.name.includes('锅炉')), JSON.stringify(r.matches.map((m) => m.name)))
  assert('★ 链含目标公式（末位）', r.chain.length > 0 && r.chain[r.chain.length - 1].id === r.matches[0].id, JSON.stringify(r.chain.map((c) => c.id)))
  assert('★ 缺参列出（不猜数值）', r.missing.length > 0 && r.missing.every((m) => typeof m.param === 'string'), String(r.missing.length))
  assert('★ 可执行调用序列非空', r.calls.length === r.chain.length && r.calls.every((c) => c.operation === 'formula'), '')
}

console.log('-- 2. 派生量展开、基本量不展开 --')
{
  const r = btMod.backtrace(F, '功率')
  const chainIds = r.chain.map((c) => c.id)
  assert('★ 功率链不再拿「圆周周期」凑时间', !chainIds.includes('circular_period'), chainIds.join(','))
  const pump = btMod.backtrace(F, '泵功率')
  assert('缺参含基本量（W/t 或类似）', pump.missing.length > 0, String(pump.missing.length))
}

console.log('-- 3. 未知目标 --')
{
  const r = btMod.backtrace(F, 'zzzqqqxxx')
  assert('★ 未知目标 → 空链 + 提示', r.matches.length === 0 && r.notes.length > 0 && r.notes[0].includes('没找到'), JSON.stringify(r.notes))
}

console.log('-- 4. 经 tool --')
{
  const out = await run({ operation: 'backtrace', target: '泵功率' })
  assert('★ backtrace 经 tool', out.ok === true && out.result.includes('目标回溯'), out.result.slice(0, 60))
  assert('输出含可执行调用', out.result.includes('operation":"formula'), out.result.slice(-120))
  const bad = await run({ operation: 'backtrace' })
  assert('缺 target → missing_params', bad.ok === false && bad.error.type === 'missing_params', JSON.stringify(bad.error).slice(0, 60))
  const given = await run({ operation: 'backtrace', target: '泵功率', given: ['W', 't'] })
  assert('given 参数不再列为缺参', given.ok === true, '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
