/**
 * 公式即函数 + 关系图：共用物理量/常数建立联系，调用时看见相邻公式。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-formula-fn-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const rel = await import(pathToFileURL(join(root, 'lib/features/formulas/relations.js')).href)
const fn = await import(pathToFileURL(join(root, 'lib/features/formulas/function.js')).href)
const engineMod = await import(pathToFileURL(join(root, 'lib/core/engine.js')).href)
const fsx = createRequire(import.meta.url)('node:fs')
const formulas = JSON.parse(fsx.readFileSync(join(root, 'src/data/formulas.json'), 'utf8'))
const constants = JSON.parse(fsx.readFileSync(join(root, 'src/data/constants-graph.json'), 'utf8'))
/** 常数别名：常数表记作 kB，公式里惯写 k（与 dispatch 的 constantNames 一致）。 */
const constantNames = new Set(constants.map((item) => item.name))
constantNames.add('k')
const index = rel.buildRelationIndex(formulas, constantNames)
const tool = toolMod.mathExecuteTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 关系图 --')
{
  const stats = index.stats()
  assert('★ 关系图覆盖全部公式（≥800）', stats.formulas >= 800, String(stats.formulas))
  assert('★ 边数 > 40000（共用物理量/常数/标签连起来）', stats.edges > 40000, String(stats.edges))
  assert('常数集合 44 个（43 + 别名 k）', stats.constants === 44, String(stats.constants))
  assert('★ 物理量语义标签 > 400 个', stats.quantities > 400, String(stats.quantities))

  const neighbors = index.neighbors('ideal_gas', 6)
  assert('★ ideal_gas 有相邻公式', neighbors.length > 0, '')
  const iso = neighbors.find((hit) => hit.id === 'isothermal_work')
  assert('★ 共用物理量（温度/物质的量）', iso !== undefined && iso.sharedQuantities.includes('温度') && iso.sharedQuantities.includes('物质的量'), JSON.stringify(neighbors.map((hit) => hit.id + ':' + hit.sharedQuantities)))
  assert('★ 同符号同义（T/n）', iso !== undefined && iso.sharedSymbols.includes('T') && iso.sharedSymbols.includes('n'), JSON.stringify(iso?.sharedSymbols))
  assert('共用常数 R', iso !== undefined && iso.sharedConstants.includes('R'), JSON.stringify(iso?.sharedConstants))

  const nernstHit = neighbors.find((hit) => hit.id === 'nernst')
  assert('★ 同名异义被标出：n（数量 vs 物质的量）', nernstHit !== undefined && nernstHit.symbolConflicts.some((conflict) => conflict.symbol === 'n' && conflict.meanings.length >= 2), JSON.stringify(nernstHit?.symbolConflicts))

  const crossSymbol = neighbors.find((hit) => hit.sharedQuantities.length > 0 && hit.sharedSymbols.length === 0)
  assert('★ 跨符号的共用物理量也能连（如 P/T 不同名但同量）', crossSymbol !== undefined || neighbors.some((hit) => hit.sharedQuantities.includes('压强')), JSON.stringify(neighbors.map((hit) => ({ id: hit.id, q: hit.sharedQuantities, s: hit.sharedSymbols }))))
  const sorted = neighbors.every((hit, i) => i === 0 || neighbors[i - 1].score >= hit.score)
  assert('邻居按分数降序', sorted, JSON.stringify(neighbors.map((hit) => hit.score)))

  const constantLinked = index.neighbors('thermal_de_broglie_wavelength', 10).find((hit) => hit.id === 'maxwell_speed_peak')
  assert('★ 共用常数 k 建立联系', constantLinked !== undefined && (constantLinked.sharedConstants.includes('k') || constantLinked.sharedQuantities.includes('温度')), JSON.stringify(index.neighbors('thermal_de_broglie_wavelength', 3).map((hit) => hit.id + ':' + hit.sharedConstants + '/' + hit.sharedQuantities)))
}

console.log('-- 2. 公式即函数 --')
{
  const compiled = fn.compileFormula(formulas.find((item) => item.id === 'ideal_gas'), engineMod.buildEngine(), index)
  const required = compiled.params.filter((spec) => spec.required).map((spec) => spec.name)
  assert('★ 参数契约标出必填 n/T', JSON.stringify(required.sort()) === JSON.stringify(['T', 'n']), JSON.stringify(required))
  const withDefaults = compiled.params.filter((spec) => !spec.required).map((spec) => spec.name)
  assert('可选参数 P/R 标出默认值', ['P', 'R'].every((name) => withDefaults.includes(name)), JSON.stringify(withDefaults))

  let error = null
  try { compiled.call({}) } catch (thrown) { error = thrown }
  assert('★ 缺必填 → missing_params', error?.type === 'missing_params', String(error?.message))

  const call = compiled.call({ n: 1, T: 300 })
  assert('★ 调用成功并带相邻公式', typeof call.result === 'string' && call.neighbors.length > 0, JSON.stringify(call.value).slice(0, 80))
  assert('本次代入参数含默认 P', call.substituted.P === 101325, JSON.stringify(call.substituted))
  assert('相邻公式带理由', call.neighbors[0].reason.length > 0, call.neighbors[0].reason)
}

console.log('-- 3. 入口：调用时看见相邻公式 --')
{
  const call = await run({ operation: 'formula', formula: 'ideal_gas', params: { n: 1, T: 300 } })
  assert('★ formula 走函数调用且成功', call.ok === true && call.result.includes('理想气体'), call.result.slice(0, 80))
  assert('★ value.neighbors 非空', Array.isArray(call.value.neighbors) && call.value.neighbors.length > 0, JSON.stringify(call.value).slice(0, 100))
  assert('★ notice 提示相邻公式', typeof call.notice === 'string' && call.notice.includes('相邻公式'), String(call.notice).slice(0, 80))

  const list = await run({ operation: 'formulas', query: 'neighbors', formulaFocus: 'ideal_gas' })
  assert('★ query=neighbors 列出相邻公式', list.ok === true && list.value.neighbors.some((hit) => hit.id === 'isothermal_work'), list.result.slice(0, 120))
  assert('列表带理由行', list.result.includes('共用参数'), list.result.slice(0, 160))

  const legacy = await run({ operation: 'formula', formula: 'kleiber', overrides: { m: 10, m0: 1, B0: 1 } })
  assert('老调用方用 overrides 仍可用', legacy.ok === true, String(legacy.error?.message))

  const missing = await run({ operation: 'formula', formula: 'ideal_gas' })
  assert('★ 缺参 → missing_params（不再静默）', missing.ok === false && missing.error?.type === 'missing_params', JSON.stringify(missing.error))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
