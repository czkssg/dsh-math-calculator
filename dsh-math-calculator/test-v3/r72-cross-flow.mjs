/**
 * 跨链取值：crossFlow 声明 + crossValues 传值。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-xflow-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
const systems = JSON.parse(readFileSync(join(root, 'src/data/systems.json'), 'utf8'))
const chains = Array.isArray(systems) ? systems : (systems.systems || [])
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
const BASE = { b: 0.2, h: 0.4, E: 2e11, eps: 0.001, rho: 7850, g: 9.81, L: 6, q: 5000, I: 1, K: 1, n: 1, tau: 1.4e8, d: 0.02, F: 5000, sigma_b: 3e7, p: 1e6, r: 0.5, t: 0.01, alpha: 1.2e-5, dT: 30, total_area: 100, delta_T: 20, r_value: 2, ventilation_loss: 0, A: 0.04, t: 0.01 }
console.log('-- 1. crossFlow 数据 --')
{
  const links = []
  for (const chain of chains) for (const [i, step] of (chain.steps || []).entries()) for (const [param, mapping] of Object.entries(step.crossFlow || {})) links.push({ chain: chain.id, step: i + 1, formula: step.formula, param, target: mapping })
  assert('★ crossFlow ≥ 5 条', links.length >= 5, String(links.length))
  assert('★ 每条 crossFlow 指向真实链', links.every((link) => chains.some((c) => c.id === link.target.chain)), '')
}
console.log('-- 2. 缺 crossValues 时有来源提示 --')
{
  const out = await run({ operation: 'formulas', query: 'chain', formulaFocus: 'sys-structure', initial: BASE })
  assert('缺 crossValues → missing_params（sigma_y 无默认值）', out.ok === false && out.error?.type === 'missing_params', String(out.error?.type))
  const message = String(out.error?.message || '')
  assert('★ 缺参消息指明来源链与步', message.includes('材料链') && message.includes('第 5 步'), message.slice(0, 120))
  assert('hint 给 crossValues 示例', String(out.error?.hint || '').includes('crossValues'), String(out.error?.hint || '').slice(0, 80))
}
console.log('-- 3. 给 crossValues 后跑通 --')
{
  const out = await run({ operation: 'formulas', query: 'chain', formulaFocus: 'sys-structure', initial: BASE, crossValues: { 'sys-material': { 5: 5e8 } } })
  assert('★ 结构链跑通', out.ok === true, String(out.error?.message))
  const step = (out.value?.steps || []).find((item) => item.step === 14)
  assert('★ 第 14 步 crossLinked 带来源', step?.crossLinked?.sigma_y?.chain === 'sys-material' && step.crossLinked.sigma_y.step === 5, JSON.stringify(step?.crossLinked))
  assert('取值等于传入值', step.crossLinked.sigma_y.value === 5e8, String(step.crossLinked.sigma_y.value))
  assert('★ 渲染行显示「sigma_y←材料链第5步」', String(out.result).includes('sigma_y←材料链第 5 步') || String(out.result).includes('sigma_y←材料链第5步'), '')
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }