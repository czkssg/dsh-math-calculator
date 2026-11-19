/**
 * 符号查询短路 + 首次索引构建的行为。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-symbol-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
console.log('-- 1. 纯符号短路 --')
{
  for (const symbol of ['*', '(', '+++', '!!!']) {
    const start = Date.now()
    const out = await run({ operation: 'formulas', query: symbol })
    const elapsed = Date.now() - start
    assert('★ 「' + symbol + '」快速返回且提示纯符号', out.ok === true && String(out.result).includes('纯符号') && elapsed < 200, elapsed + 'ms')
  }
}
console.log('-- 2. 正常查询（首次建索引，二次命中缓存）--')
{
  const first = await run({ operation: 'formulas', query: '动能' })
  assert('首次查询有结果', first.ok === true && String(first.result).includes('动能'), String(first.result).slice(0, 40))
  const start = Date.now()
  const second = await run({ operation: 'formulas', query: '动能' })
  const elapsed = Date.now() - start
  assert('★ 第二次查询命中缓存（< 200ms）', second.ok === true && elapsed < 200, elapsed + 'ms')
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
