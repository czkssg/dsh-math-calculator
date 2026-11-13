/**
 * 阶段 3.3：链的数值传导（只走显式声明的数据流）。
 *
 * 关键判据：
 *   1. 有映射的步骤真的取到前序结果；
 *   2. 改前序输入，下游结果跟着变（传导是真的）；
 *   3. 缺初始参数要说清缺谁；
 *   4. 逆序映射必须拒绝——链的步骤顺序 ≠ 数据流方向。
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-chain-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const fn = await import(pathToFileURL(join(root, 'lib/features/formulas/chain-run.js')).href)
const formulas = JSON.parse(readFileSync(join(root, 'src/data/formulas.json'), 'utf8'))
const systems = JSON.parse(readFileSync(join(root, 'src/data/systems.json'), 'utf8'))
const tool = toolMod.mathExecuteTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

const BASE = {
  cohesive_energy: 6.4e-19, E: 2e11, rho: 7800, sigma0: 1e8, ky: 0.5e6, grain_size: 1e-5,
  shear_modulus: 8e10, bulk_modulus: 1.6e11, strength: 5e8, alpha: 1.2e-5, L: 2, dT: 100,
  safety_factor: 1.5, b: 0.2, h: 0.4, M: 1e4, kic: 3e7, y_factor: 1, crack_length: 1e-3, eps: 0.001,
}

console.log('-- 1. 材料链跑通 --')
{
  const out = await run({ operation: 'formulas', query: 'chain', formulaFocus: 'sys-material', initial: BASE })
  assert('★ 材料链跑通', out.ok === true, String(out.error?.message))
  const step9 = out.value.steps.find((item) => item.step === 9)
  assert('★ 第 9 步取到第 5 步的屈服强度', step9?.linked?.yield_strength?.fromStep === 5, JSON.stringify(step9?.linked))
  assert('linked 值与第 5 步结果一致', Math.abs(step9.linked.yield_strength.value - out.value.steps[4].value) < 1e-6, '')
  assert('末端有值', typeof out.value.terminal.value === 'number' && Number.isFinite(out.value.terminal.value), JSON.stringify(out.value.terminal))
}

console.log('-- 2. 传导是真的（改上游，下游变）--')
{
  const base = await run({ operation: 'formulas', query: 'chain', formulaFocus: 'sys-material', initial: BASE })
  const harder = await run({ operation: 'formulas', query: 'chain', formulaFocus: 'sys-material', initial: { ...BASE, sigma0: 2e8 } })
  assert('★ 改 sigma0 → 第 5 步屈服强度变', Math.abs(harder.value.steps[4].value - base.value.steps[4].value) > 1, JSON.stringify({ a: base.value.steps[4].value, b: harder.value.steps[4].value }))
  assert('★ 第 9 步（许用应力）跟着变', Math.abs(harder.value.steps[8].value - base.value.steps[8].value) > 1, JSON.stringify({ a: base.value.steps[8].value, b: harder.value.steps[8].value }))

  const grain = await run({ operation: 'formulas', query: 'chain', formulaFocus: 'sys-material', initial: { ...BASE, grain_size: 1e-6 } })
  assert('改晶粒尺寸 → 屈服强度显著变', Math.abs(grain.value.steps[4].value - base.value.steps[4].value) > 1e6, JSON.stringify({ a: base.value.steps[4].value, b: grain.value.steps[4].value }))
}

console.log('-- 3. 缺参 / 未知链 / 逆序映射 --')
{
  const missing = await run({ operation: 'formulas', query: 'chain', formulaFocus: 'sys-material', initial: { E: 2e11 } })
  assert('★ 缺参报 missing_params 并列出', missing.ok === false && missing.error?.type === 'missing_params' && String(missing.error.message).includes('cohesive_energy'), JSON.stringify(missing.error))

  const unknown = await run({ operation: 'formulas', query: 'chain', formulaFocus: 'no-such-chain' })
  assert('未知链 → unknown_formula', unknown.ok === false && unknown.error?.type === 'unknown_formula', JSON.stringify(unknown.error))

  const badSystem = [{
    id: 'test-reverse', name: '逆序测试',
    steps: [
      { formula: 'safety_factor_check', inputs: { yield_strength: { fromStep: 2 } } },
      { formula: 'hall_petch' },
    ],
  }]
  const engineMod = await import(pathToFileURL(join(root, 'lib/core/engine.js')).href)
  let error = null
  try {
    fn.runChainNumeric(formulas, badSystem, 'test-reverse', engineMod.buildEngine(), BASE)
  } catch (thrown) {
    error = thrown
  }
  assert('★ 逆序映射 → invalid_argument（方向必须一致）', error?.type === 'invalid_argument' && String(error.message).includes('还没跑'), String(error?.message))
}

console.log('-- 4. 其他链给出缺参而不是乱算 --')
{
  const energy = await run({ operation: 'formulas', query: 'chain', formulaFocus: 'sys-energy', initial: {} })
  assert('能源链缺参 → 说明缺哪些（不静默）', energy.ok === false && energy.error?.type === 'missing_params', JSON.stringify(energy.error).slice(0, 120))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
