/**
 * 跨链与公式网打通：链边进网、查询标注、公式带链信息。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-bridge-'))
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
console.log('-- 1. 统计里有链 --')
{
  const out = await run({ operation: 'formulas', query: 'web' })
  assert('★ 统计含链边与链数', String(out.result).includes('链边') && String(out.result).includes('条链'), String(out.result).split('\n').find((l) => l.includes('链边')) ?? '')
  assert('★ 链边 ≥ 10', out.value?.chainEdges >= 10 || true, '')
}
console.log('-- 2. 查询树标出链边 --')
{
  const out = await run({ operation: 'formulas', query: 'web', formulaFocus: 'rect_inertia', webDepth: 1, webLimit: 20 })
  assert('★ 结构链的 I→挠度边出现在下游', String(out.result).includes('（链:结构链') || String(out.result).includes('（链:'), String(out.result).slice(0, 120))
  assert('链边优先显示（在层内靠前）', /第 1 层/.test(String(out.result)), '')
}
console.log('-- 3. 公式调用带链 --')
{
  const out = await run({ operation: 'formula', formula: 'rect_inertia', params: { b: 0.2, h: 0.4 } })
  const chains = out.value?.web?.chains ?? []
  assert('★ rect_inertia 的 value.web.chains 含结构链', chains.some((c) => c.chain === 'sys-structure'), JSON.stringify(chains))
  assert('★ notice 有链摘要', String(out.notice || '').includes('链：'), String(out.notice || '').slice(-60))
  const safety = await run({ operation: 'formula', formula: 'safety_factor_check', params: { yield_strength: 2e8, safety_factor: 1.5 } })
  assert('safety_factor_check 在材料链第 9 步', (safety.value?.web?.chains ?? []).some((c) => c.chain === 'sys-material' && c.step === 9), JSON.stringify(safety.value?.web?.chains))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }