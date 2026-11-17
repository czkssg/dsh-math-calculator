/**
 * R51 极端边界：空表达式 / 栈溢出 / 静默默认 / 区间反序。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-r51-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
console.log('-- 1. 空表达式不许假成功（R51 最严重）--')
{
  const empty = await run({ operation: 'evaluate', expression: '' })
  assert('★ 空字符串 → 报错（不是 ok:true）', empty.ok === false, String(empty.ok))
  assert('★ 错误类型 missing_params', empty.error.type === 'missing_params', String(empty.error?.type))
  assert('★ result 里没有 "undefined" 字样', !String(empty.result).includes('undefined'), String(empty.result))
  const blank = await run({ operation: 'evaluate', expression: '   ' })
  assert('★ 全空白也算空', blank.ok === false, String(blank.ok))
  const ok = await run({ operation: 'evaluate', expression: '1/3' })
  assert('★ 正常表达式不受影响', ok.ok === true && String(ok.result).includes('0.333'), String(ok.result))
}
console.log('-- 2. 栈溢出报成「表达式太复杂」而不是 internal --')
{
  const deep = await run({ operation: 'evaluate', expression: '('.repeat(500) + '1' + ')'.repeat(500) })
  assert('★ 深嵌套 → 不是 internal', deep.ok === false && deep.error.type !== 'internal', String(deep.error?.type))
  assert('★ 说清是表达式太复杂（或更具体的嵌套过深）', String(deep.error.message).includes('太复杂') || String(deep.error.message).includes('嵌套过深'), String(deep.error?.message).slice(0, 50))
  assert('★ hint 给出拆解办法', String(deep.error.hint).includes('拆') || String(deep.error.hint).includes('批量'), String(deep.error?.hint).slice(0, 50))
  assert('★ 超长表达式不全塞进消息（截断）', String(deep.error.message).length < 300, String(String(deep.error.message).length))
}
console.log('-- 3. 静默默认必须说出来 --')
{
  const quiet = await run({ operation: 'derivation', derivation: 'sensitivity' })
  assert('★ 用内置默认模型时要警告', String(quiet.result).includes('内置默认模型'), String(quiet.result).slice(0, 80))
  const explicit = await run({ operation: 'derivation', derivation: 'sensitivity', sensitivityBase: 10, sensitivityExponent: 2 })
  assert('★ 显式给参数时不警告', !String(explicit.result).includes('内置默认模型'), '')
}
console.log('-- 4. 区间反序不许静默交换 --')
{
  const reversed = await run({ operation: 'interval', interval: { value: 13, low: 20, high: 6 } })
  assert('★ 反序 → 报错（不静默重排）', reversed.ok === false, String(reversed.ok))
  assert('★ 说清 low > high', String(reversed.error.message).includes('写反'), String(reversed.error?.message).slice(0, 40))
  const normal = await run({ operation: 'interval', interval: { value: 13, low: 6, high: 20 } })
  assert('★ 正常区间不受影响', normal.ok === true && String(normal.result).includes('[6, 20]'), '')
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
