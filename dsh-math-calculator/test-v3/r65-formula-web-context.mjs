/**
 * 公式调用 × 公式网：调用时附带上下游（value.web + notice 摘要）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-ctx-'))
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
console.log('-- 1. 成功调用带上下游 --')
{
  const out = await run({ operation: 'formula', formula: 'kinetic_energy', params: { m: 2, v: 3 } })
  assert('调用成功', out.ok === true, String(out.error?.message))
  assert('★ value.web 有下游', Array.isArray(out.value?.web?.downstream) && out.value.web.downstream.length > 0, String(out.value?.web?.downstream?.length))
  assert('★ notice 有网摘要', String(out.notice || '').includes('网：'), String(out.notice || '').slice(0, 50))
  assert('web.focus = 公式 id', out.value?.web?.focus === 'kinetic_energy', '')
}
console.log('-- 2. 常数上游 --')
{
  const out = await run({ operation: 'formula', formula: 'mass_energy', params: { m: 1 } })
  const ups = (out.value?.web?.upstream || []).map((x) => x.id)
  assert('★ mass_energy 上游含常数 c', ups.includes('c'), ups.slice(0, 6).join(','))
}
console.log('-- 3. 别名调用指向主节点 --')
{
  const out = await run({ operation: 'formula', formula: 'projectile_energy', params: { m: 2, v: 3 } })
  assert('别名调用成功', out.ok === true, String(out.error?.message))
  assert('★ canonical = kinetic_energy', out.value?.web?.canonical === 'kinetic_energy', String(out.value?.web?.canonical))
  assert('下游与主一致', out.value.web.downstream.length > 0, '')
}
console.log('-- 4. 可关闭 --')
{
  const out = await run({ operation: 'formula', formula: 'kinetic_energy', params: { m: 2, v: 3 }, webContext: false })
  assert('★ webContext:false 不带 web', out.ok === true && out.value?.web === undefined, '')
}
console.log('-- 5. 量纲错误仍先拦 --')
{
  const out = await run({ operation: 'formula', formula: 'kinetic_energy', params: { m: '2 kg', v: '3 s' } })
  assert('★ 量纲错误优先于网上下文', out.ok === false && out.error?.type === 'unit_mismatch', String(out.error?.type))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }