/**
 * 公式结果单位自检（反馈 §1 公式量纲类）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-unit-check-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}

console.log('-- 1. 正常公式单位校验通过 --')
{
  const gas = await tool.execute({ operation: 'formula', formula: 'ideal_gas', params: { n: 1, T: 300 } }, {})
  assert('★ ideal_gas unitValid=true（m^3 折成 m3）', gas.ok === true && gas.value.unitValid === true, JSON.stringify(gas.value?.unitUcum))
  const em = await tool.execute({ operation: 'formula', formula: 'mass_energy', params: { m: 1 } }, {})
  assert('★ mass_energy unitValid=true（J）', em.ok === true && em.value.unitValid === true, '')
}

console.log('-- 2. 描述性单位不误报 --')
{
  const ang = await tool.execute({ operation: 'formula', formula: 'lorentz_factor', params: { v: 1000 } }, {})
  assert('★ 无量纲公式 unitValid=true', ang.ok === true && ang.value.unitValid === true, String(ang.error?.type))
}

console.log('-- 3. value 带单位信息 --')
{
  const gas = await tool.execute({ operation: 'formula', formula: 'ideal_gas', params: { n: 1, T: 300 } }, {})
  assert('value 含 unit 与 unitUcum', gas.value.unit === 'm^3' && gas.value.unitUcum === 'm3', JSON.stringify({ u: gas.value?.unit, uu: gas.value?.unitUcum }))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
