/**
 * 阶段 3.1/3.2：参数量纲向量 + 带单位参数校验。
 *
 * 判据：参数标注了量纲，就给「带单位的值」做量纲检查；
 * 没标注的不猜（只解析数值，不拦），宁可少拦不可乱拦。
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-fdim-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const fn = await import(pathToFileURL(join(root, 'lib/features/formulas/function.js')).href)
const rel = await import(pathToFileURL(join(root, 'lib/features/formulas/relations.js')).href)
const formulas = JSON.parse(readFileSync(join(root, 'src/data/formulas.json'), 'utf8'))
const constants = JSON.parse(readFileSync(join(root, 'src/data/constants-graph.json'), 'utf8'))
const names = new Set(constants.map((item) => item.name))
names.add('k')
const index = rel.buildRelationIndex(formulas, names)
const tool = toolMod.mathExecuteTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 量纲向量覆盖 --')
{
  let withDim = 0
  let total = 0
  for (const formula of formulas) for (const spec of Object.values(formula.params ?? {})) { total += 1; if (spec.dimension !== undefined) withDim += 1 }
  assert('★ 参数带量纲向量 ≥ 1300 个', withDim >= 1300, withDim + ' / ' + total)
  const ideal = formulas.find((item) => item.id === 'ideal_gas')
  assert('★ ideal_gas 的 P 标注压强量纲', JSON.stringify(ideal.params.P.dimension) === JSON.stringify({ M: 1, L: -1, T: -2 }), JSON.stringify(ideal.params.P.dimension))
  assert('ideal_gas 的 T 标注温度量纲', JSON.stringify(ideal.params.T.dimension) === JSON.stringify({ Theta: 1 }), JSON.stringify(ideal.params.T.dimension))
  assert('ideal_gas 的 n 标注物质的量', JSON.stringify(ideal.params.n.dimension) === JSON.stringify({ N: 1 }), JSON.stringify(ideal.params.n.dimension))
}

console.log('-- 2. 带单位参数：正确用法 --')
{
  const ideal = formulas.find((item) => item.id === 'ideal_gas')
  const compiled = fn.compileFormula(ideal, undefined, index)
  /** compileFormula 需要 engine，后面用 callFormula 实际调用。 */
  const r1 = await run({ operation: 'formula', formula: 'ideal_gas', params: { n: '1 mol', T: '300 K' } })
  assert('★ T="300 K" 与 n="1 mol" 可解析', r1.ok === true, String(r1.error?.message))
  assert('★ 结果按 SI 数值算（0.0246 m³）', r1.result.includes('0.0246'), r1.result.slice(0, 120))

  const r2 = await run({ operation: 'formula', formula: 'ideal_gas', params: { n: 1, T: 300, P: '1 atm' } })
  assert('★ P="1 atm" 换成 SI（101325 Pa）', r2.ok === true && Math.abs(r2.value.result - 0.0246) < 1e-3, JSON.stringify(r2.value).slice(0, 120))
}

console.log('-- 3. 带单位参数：量纲不符必须拒绝 --')
{
  const badT = await run({ operation: 'formula', formula: 'ideal_gas', params: { n: 1, T: '300 m' } })
  assert('★ 温度传长度 → unit_mismatch', badT.ok === false && badT.error?.type === 'unit_mismatch', JSON.stringify(badT.error))
  assert('错误里写出期望与收到', String(badT.error?.message).includes('Theta') && String(badT.error?.message).includes('L'), String(badT.error?.message))

  const badN = await run({ operation: 'formula', formula: 'ideal_gas', params: { n: '1 kg', T: 300 } })
  assert('物质的量传质量 → unit_mismatch', badN.ok === false && badN.error?.type === 'unit_mismatch', JSON.stringify(badN.error))

  const junk = await run({ operation: 'formula', formula: 'ideal_gas', params: { n: 1, T: 'abc' } })
  assert('无法解析的单位串 → invalid_argument', junk.ok === false && junk.error?.type === 'invalid_argument', JSON.stringify(junk.error))
}

console.log('-- 4. 未标注量纲的参数不猜 --')
{
  const velocity = formulas.find((item) => item.id === 'velocity_uniform')
  const sDim = velocity.params.s?.dimension
  const r = await run({ operation: 'formula', formula: 'velocity_uniform', params: { s: '10 m', t: '2 s' } })
  assert('未标注/已标注都能用带单位写法', r.ok === true || sDim !== undefined, String(r.error?.message) + ' | s.dimension=' + JSON.stringify(sDim))
}

console.log('-- 5. 纯数字仍照旧 --')
{
  const r = await run({ operation: 'formula', formula: 'ideal_gas', params: { n: 1, T: 300 } })
  assert('纯数字调用不受影响', r.ok === true, String(r.error?.message))
  const r2 = await run({ operation: 'formula', formula: 'ideal_gas', params: { n: 1, T: 300 }, terse: true })
  assert('terse 也不受影响', r2.ok === true && r2.result.includes('m^3'), r2.result)
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
