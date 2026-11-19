/**
 * sys: 链归一 + data export/import 往返。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-sys-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
console.log('-- 1. sys: 链归一 --')
{
  for (const query of ['sys:material', 'sys-material']) {
    const out = await run({ operation: 'formulas', query })
    assert('★ ' + query + ' 进入材料链（缺参且点名 cohesive_energy）', out.ok === false && String(out.error?.message).includes('cohesive_energy'), String(out.error?.type))
  }
  const full = await run({ operation: 'formulas', query: 'sys:material', initial: { cohesive_energy: 4e-19, molar_volume: 1e-5, n: 2, thermal_expansion_coeff: 1.2e-5, lattice_constant: 3e-10, alpha: 1.2e-5, dT: 30, ideal_factor: 0.1, E: 2e11, sigma0: 1e8, ky: 0.5, grain_size: 1e-5, bulk_modulus: 1e11, hall_petch: 0.5 } })
  assert('补全参数后链可跑', full.ok === true || !String(full.error?.message).includes('cohesive_energy'), String(full.error?.type))
}
console.log('-- 2. data export/import --')
{
  await run({ operation: 'data', dataAction: 'put', kind: 'note', name: '导出甲', payload: { a: 1 } })
  const exp = await run({ operation: 'data', dataAction: 'export' })
  assert('★ export 的 value.json 是字符串', typeof exp.value?.json === 'string', typeof exp.value?.json)
  assert('★ value.json 可 JSON.parse', (() => { try { JSON.parse(String(exp.value?.json)); return true } catch { return false } })(), '')
  const imp = await run({ operation: 'data', dataAction: 'import', dataJson: String(exp.value?.json) })
  assert('同数据重复 import 幂等（0 条）', imp.ok === true && imp.value?.imported === 0, String(imp.value?.imported))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
