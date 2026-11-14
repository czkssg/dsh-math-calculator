/**
 * 文档解析（PDF）：来自实践文档 _tools/pdf2md 的整合。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-doc-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
const fixture = join(root, 'test-v3/fixtures/sample-deepseek.pdf')
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. PDF 文本提取与清洗 --')
{
  const out = await run({ operation: 'document', document: { action: 'extract', path: fixture } })
  assert('★ extract 跑通', out.ok === true, String(out.error?.message))
  assert('★ 正文被保留', out.result.includes('Grain output'), out.result.slice(0, 120))
  assert('★ 页眉被清洗（不含日期）', !out.result.includes('2026/11/14'), '')
  assert('★ 页码被清洗', !/\b1\/1\b/.test(out.result), out.result.slice(0, 120))
  assert('页数 1', out.value.pages === 1, String(out.value?.pages))
  assert('低文本标记（54 字符）', out.value.lowText === true, String(out.value?.lowText))
}

console.log('-- 2. 数字台账（PDF / 纯文本）--')
{
  const pdf = await run({ operation: 'document', document: { action: 'numbers', path: fixture } })
  assert('★ PDF 抽出数字（266/920）', pdf.ok === true && pdf.result.includes('266') && pdf.result.includes('920'), pdf.result.slice(0, 160))
  const text = await run({ operation: 'document', document: { action: 'numbers', text: '人口 9.2 亿，粮产 2.66 亿吨。' } })
  assert('★ 纯文本中文量级折算（9.2 亿 → 9.2e8）', text.ok === true && Array.isArray(text.value.items) && text.value.items.some((item) => Math.abs(item.value - 9.2e8) < 1), JSON.stringify(text.value).slice(0, 160))
}

console.log('-- 3. 表格与错误路径 --')
{
  const tables = await run({ operation: 'document', document: { action: 'tables', path: fixture } })
  assert('无表格时明确说没有', tables.ok === true && tables.result.includes('没有检测到表格'), tables.result.slice(0, 80))
  const missing = await run({ operation: 'document', document: { action: 'extract', path: 'D:/no/such.pdf' } })
  assert('★ 不存在 → unknown_symbol', missing.ok === false && missing.error?.type === 'unknown_symbol', JSON.stringify(missing.error))
  const notPdf = await run({ operation: 'document', document: { action: 'extract', path: 'D:/x.txt' } })
  assert('非 PDF → invalid_argument', notPdf.ok === false && notPdf.error?.type === 'invalid_argument', '')
  const badAction = await run({ operation: 'document', document: { action: 'nope', path: fixture } })
  assert('未知动作 → unknown_argument', badAction.ok === false && badAction.error?.type === 'unknown_argument', '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
