/**
 * label 字符范围：多语言/符号保留；换行/制表/控制字符/孤立代理/超长清洗。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-labelchars-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const labels = ['中文·电解', '日本語・電解', '한국어 전기분해', 'Русский', 'التحليل', 'การแยก', '⚡⚡', 'E→H η≤0.5 ∑π', 'a\nb 换行', 'a\tb 制表', 'x'.repeat(3000), '\uD800孤立代理', '\u0000控制', '   ', '']
const r = await mathExecuteTool.execute({ calls: labels.map((label, i) => ({ operation: 'evaluate', label, expression: String(i) + '+1' })) }, {})
const results = r.value?.results ?? []
const get = (i) => results[i]?.label
console.log('-- 1. 多语言与符号保留 --')
{
  assert('中文保留', get(0) === '中文·电解', String(get(0)))
  assert('日文保留', get(1) === '日本語・電解', String(get(1)))
  assert('韩文保留', get(2) === '한국어 전기분해', String(get(2)))
  assert('俄文保留', get(3) === 'Русский', String(get(3)))
  assert('阿拉伯文保留', get(4) === 'التحليل', String(get(4)))
  assert('泰文保留', get(5) === 'การแยก', String(get(5)))
  assert('emoji 保留', get(6) === '⚡⚡', String(get(6)))
  assert('数学符号保留', get(7) === 'E→H η≤0.5 ∑π', String(get(7)))
}
console.log('-- 2. 清洗 --')
{
  assert('★ 换行压成空格', get(8) === 'a b 换行', JSON.stringify(get(8)))
  assert('★ 制表压成空格', get(9) === 'a b 制表', JSON.stringify(get(9)))
  assert('★ 超长截断到 81 字（含省略号）', typeof get(10) === 'string' && get(10).length <= 81 && get(10).endsWith('…'), String(get(10)?.length))
  assert('★ 孤立代理移除', get(11) === '孤立代理', JSON.stringify(get(11)))
  assert('★ 控制字符移除', get(12) === '控制', JSON.stringify(get(12)))
  assert('空白 label 被忽略', get(13) === undefined && get(14) === undefined, JSON.stringify([get(13), get(14)]))
}
console.log('-- 3. 渲染不破 --')
{
  const heads = String(r.result).split('\n').filter((line) => line.startsWith('── '))
  assert('★ 头行数 = 条目数', heads.length === labels.length, String(heads.length))
  assert('★ 头行没有残留换行', heads.every((line) => !line.includes('\n')), '')
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }