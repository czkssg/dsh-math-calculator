/**
 * 跨链自动接点：note 的「接点自 X 链」解析为 chainRef；公式网给跨链自动候选。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-cross-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
const systems = JSON.parse(readFileSync(join(root, 'src/data/systems.json'), 'utf8'))
const chains = Array.isArray(systems) ? systems : (systems.systems || [])
const web = JSON.parse(readFileSync(join(root, 'src/data/formula-web.json'), 'utf8'))
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
console.log('-- 1. chainRef 解析 --')
{
  const known = new Set(chains.map((c) => c.id))
  const refSteps = chains.flatMap((c) => (c.steps || []).filter((s) => Array.isArray(s.chainRef) && s.chainRef.length > 0))
  assert('★ 有 chainRef 的步 ≥ 35', refSteps.length >= 35, String(refSteps.length))
  const bad = refSteps.flatMap((s) => s.chainRef.filter((id) => !known.has(id)))
  assert('★ chainRef 全部指向真实链', bad.length === 0, bad.slice(0, 4).join(','))
  assert('chainRef 不止一条链', new Set(refSteps.flatMap((s) => s.chainRef)).size >= 8, '')
}
console.log('-- 2. 链查询显示接点 --')
{
  const out = await run({ operation: 'formulas', query: 'chain', formulaFocus: 'sys-structure', initial: { b: 0.2, h: 0.4, E: 2e11, eps: 0.001, rho: 7850, g: 9.81, L: 6, q: 5000, I: 1, K: 1, n: 1, tau: 1.4e8, d: 0.02, F: 5000, sigma_b: 3e7, p: 1e6, r: 0.5, t: 0.01, alpha: 1.2e-5, dT: 30, total_area: 100, delta_T: 20, r_value: 2, ventilation_loss: 0, sigma_y: 2.35e8, A: 0.04 } })
  assert('★ 链输出有「接点」列', out.ok === true && String(out.result).includes('接点'), String(out.result).slice(0, 80))
  assert('★ 统计跨链接点步数', String(out.result).includes('跨链接点：'), '')
}
console.log('-- 3. 公式网自动候选 --')
{
  const out = await run({ operation: 'formulas', query: 'web' })
  assert('★ 统计含跨链候选', String(out.result).includes('跨链') && out.value?.crossCandidates >= 50, String(out.value?.crossCandidates))
  const candidates = web.crossCandidates ?? []
  assert('★ 候选结构完整（7 字段含语义标记）', candidates.every((item) => Array.isArray(item) && item.length === 7 && Array.isArray(item[5])), String(candidates.length))
  const sample = candidates[0]
  assert('候选指向真实链与步', sample !== undefined && Array.isArray(sample[5]) && sample[5].every((c) => chains.some((x) => x.id === c[0]) && typeof c[1] === 'number'), JSON.stringify(sample).slice(0, 100))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }