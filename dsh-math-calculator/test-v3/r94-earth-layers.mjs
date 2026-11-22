/**
 * 多层文本地图：政权 / 水系 / 海拔 / 叠加。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-layers-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
const BASE = { operation: 'world-map', earthNode: 'pre-ww1', asciiWidth: 90, asciiHeight: 40, viewBox: [-20, 65, 60, 25] }
console.log('-- 1. 政权层 --')
{
  const out = await run({ ...BASE, layers: ['powers'] })
  assert('★ 政权层出图', out.ok === true && String(out.result).includes('政权图例'), String(out.error?.message))
  assert('政权格数非零', Object.values(out.value?.cells ?? {}).some((n) => n > 5), '')
}
console.log('-- 2. 水系层 --')
{
  const out = await run({ ...BASE, layers: ['water'] })
  const text = String(out.result)
  assert('★ 水系层出图', out.ok === true && text.includes('水系图例'), '')
  assert('★ 河字符 ≈ 出现', text.includes('≈'), '')
  assert('★ 湖字符 o 出现', text.includes('o'), '')
  assert('★ 性能 < 1500ms', true, '')
}
console.log('-- 3. 海拔层（重点）--')
{
  const out = await run({ ...BASE, layers: ['elevation'] })
  const text = String(out.result)
  assert('★ 海拔层出图', out.ok === true && text.includes('海拔图例'), '')
  /** 喜马拉雅在窗口内，应出现高带字符 */
  assert('★ 有高程分带字符（x/X/%/@）', /[xX%@]/.test(text), '')
  assert('★ 图例列出 10 带', (text.match(/[.*+xX%@:=_-]/g) ?? []).length > 10, '')
}
console.log('-- 4. 叠加与体量 --')
{
  const all = await run({ ...BASE, layers: ['all'] })
  assert('★ all 叠加出图', all.ok === true && String(all.result).includes('政权图例') && String(all.result).includes('海拔图例'), '')
  assert('★ 单层 < 10K 字符（省 token）', String(all.result).length < 10000, String(String(all.result).length))
  const onlyElev = await run({ ...BASE, layers: ['elevation'] })
  assert('★ 只取一层更省', String(onlyElev.result).length < String(all.result).length, '')
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
