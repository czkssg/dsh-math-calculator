/**
 * 常数关系网：基础旋钮 → 派生量的依赖图，以及「改一个会牵动谁」。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-net-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
const graph = JSON.parse(readFileSync(join(root, 'src/data/constants-graph.json'), 'utf8'))
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
console.log('-- 1. 依赖图结构 --')
{
  const names = new Set(graph.map((x) => x.name))
  const derived = graph.filter((x) => !x.fundamental)
  const missing = derived.flatMap((x) => (x.dependsOn ?? []).filter((d) => !names.has(d)).map((d) => x.name + '→' + d))
  assert('★ 派生量的依赖都在表内', missing.length === 0, missing.slice(0, 4).join(', '))
  assert('★ 派生量 ≥ 15', derived.length >= 15, String(derived.length))
  const referenced = new Set(derived.flatMap((x) => x.dependsOn ?? []))
  const lonely = graph.filter((x) => x.fundamental && !referenced.has(x.name)).map((x) => x.name)
  assert('基础旋钮大多被派生引用', lonely.length <= 10, '未被引用: ' + lonely.join(','))
}
console.log('-- 2. 渲染「→ 派生」--')
{
  const out = await run({ operation: 'constants' })
  assert('★ 基础旋钮行带「→ 派生」', out.ok === true && String(out.result).includes('→ 派生:'), '')
  assert('★ c 牵动 mu0', /c\s+.*→ 派生:.*mu0/.test(String(out.result)), String(out.result).slice(0, 300))
}
console.log('-- 3. 改一个，派生量跟着变 --')
{
  const base = await run({ operation: 'constants' })
  const changed = await run({ operation: 'constants', constants: { c: 1.5e8 } })
  assert('★ 改 c 成功', changed.ok === true, String(changed.error?.message))
  const mu0 = changed.value?.values?.mu0
  const sigma = changed.value?.values?.sigma
  assert('★ mu0 跟着变', typeof mu0 === 'number' && mu0 !== base.value?.values?.mu0, String(mu0))
  assert('★ sigma 跟着变', typeof sigma === 'number' && sigma !== base.value?.values?.sigma, String(sigma))
}
console.log('-- 4. 派生量不能直接设 --')
{
  const out = await run({ operation: 'constants', constants: { mu0: 1e-6 } })
  assert('★ 设派生量被拒绝', out.ok === false && String(out.error?.message).includes('派生'), String(out.error?.message).slice(0, 80))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }