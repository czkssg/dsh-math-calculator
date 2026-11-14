/**
 * 错误结构化：所有失败都带 {type,message,hint?}，不再有 THROW / [object Object]。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-errstruct-'))
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
function shaped(r) {
  const e = r.error
  return r.ok === false && typeof e?.type === 'string' && typeof e?.message === 'string' && e.message !== '[object Object]'
}

console.log('-- 1. 八类失败都结构化 --')
{
  const cases = [
    ['缺参', { operation: 'formula' }, 'missing_params'],
    ['未知公式', { operation: 'formula', formula: 'nope' }, 'unknown_formula'],
    ['量纲错', { operation: 'formula', formula: 'ideal_gas', params: { T: '5 kg' } }, 'unit_mismatch'],
    ['语法错', { expression: '1+*2' }, 'syntax'],
    ['未知符号', { expression: 'xyzzy+1' }, 'unknown_symbol'],
    ['除零', { expression: '1/0' }, 'non_finite'],
    ['未知单位', { expression: '1 zzz to m' }, 'unknown_symbol'],
  ]
  for (const [name, args, expected] of cases) {
    const r = await run(args)
    assert('★ ' + name + ' → ' + expected, shaped(r) && r.error.type === expected, JSON.stringify(r.error).slice(0, 80))
  }
}

console.log('-- 2. 未知 operation 不再 THROW --')
{
  let threw = false
  let r
  try { r = await run({ operation: 'nope' }) } catch { threw = true }
  assert('★ 未知 op 不抛异常', threw === false, 'threw')
  assert('★ 未知 op → invalid_argument', shaped(r) && r.error.type === 'invalid_argument', JSON.stringify(r?.error).slice(0, 80))
}

console.log('-- 3. hint 可用 --')
{
  const r = await run({ operation: 'formula' })
  assert('缺参带 hint（怎么传）', typeof r.error.hint === 'string' && r.error.hint.length > 0, '')
  const s = await run({ expression: '1+*2' })
  assert('语法错带 hint（检查什么）', typeof s.error.hint === 'string' && s.error.hint.includes('括号'), s.error.hint)
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
