/**
 * mathEngine 服务（第一期）：求值/换算/量纲/自述、结构化返回、错误三档、与工具一致。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-service-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { createMathEngineService } = await import(pathToFileURL(join(root, 'lib/service.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const service = createMathEngineService()
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
console.log('-- 1. 自述 --')
{
  const describe = service.describe()
  assert('★ version 与 package.json 一致', describe.version === JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, describe.version)
  assert('★ operations ≥ 60 且含 evaluate/formulas', describe.operations.length >= 60 && describe.operations.includes('evaluate') && describe.operations.includes('formulas'), String(describe.operations.length))
  assert('★ unitFamilies 非空', describe.unitFamilies.length >= 10 && describe.unitFamilies.every((item) => item.count > 0), String(describe.unitFamilies.length))
  assert('methods 声明 26 个（含链扩展）', Array.isArray(describe.methods) && describe.methods.length === 26 && describe.methods.includes('registerUnits') && describe.methods.includes('formula'), JSON.stringify(describe.methods))
}
console.log('-- 2. 求值 --')
{
  const plain = service.evaluate('2+3')
  assert('★ 2+3 → number "5"', plain.ok === true && plain.number === '5', JSON.stringify(plain))
  const withUnit = service.evaluate('1 m + 1 ft')
  assert('★ 1 m + 1 ft → 1.3048 m', withUnit.ok === true && withUnit.number === '1.3048' && withUnit.unit === 'm', JSON.stringify(withUnit))
  const complex = service.evaluate('sqrt(-4)')
  assert('复数结果保留结构', complex.ok === true && JSON.stringify(complex.value) === '{"re":0,"im":2}', JSON.stringify(complex))
  const withVars = service.evaluate('m*v', { variables: { m: 2, v: 3 } })
  assert('variables 生效', withVars.ok === true && withVars.number === '6', JSON.stringify(withVars))
}
console.log('-- 3. 单位换算 --')
{
  const feet = service.convert(1, 'm', 'ft')
  assert('★ 1 m → ft 有值/单位/步骤', feet.ok === true && typeof feet.number === 'string' && feet.unit === 'ft' && Array.isArray(feet.steps) && feet.steps.length > 0, JSON.stringify(feet).slice(0, 120))
  assert('换算数值正确', Math.abs(Number(feet.number) - 3.280839895) < 1e-6, feet.number)
}
console.log('-- 4. 量纲 --')
{
  const ok = service.checkDimension('kg/m3')
  assert('★ kg/m3 可识别', ok.ok === true && ok.unit === 'kg/m3', JSON.stringify(ok))
  const bad = service.checkDimension('zzz-unit')
  assert('★ 未知单位 → capability', bad.ok === false && bad.error?.kind === 'capability', JSON.stringify(bad.error))
}
console.log('-- 5. 错误三档 --')
{
  const empty = service.evaluate('')
  assert('input：空表达式', empty.ok === false && empty.error?.kind === 'input', JSON.stringify(empty.error))
  const division = service.evaluate('1/0')
  assert('input：非有限', division.ok === false && division.error?.kind === 'input', JSON.stringify(division.error))
  const unknown = service.evaluate('1 foo')
  assert('capability：未知符号', unknown.ok === false && unknown.error?.kind === 'capability', JSON.stringify(unknown.error))
}
console.log('-- 6. 与工具一致 --')
{
  const viaTool = await mathExecuteTool.execute({ operation: 'evaluate', expression: '3*7' }, {})
  const viaService = service.evaluate('3*7')
  assert('★ 同输入同数值', viaTool.ok === true && viaService.ok === true && String(viaTool.value) === viaService.number, String(viaTool.value) + ' vs ' + viaService.number)
  const unitViaTool = await mathExecuteTool.execute({ operation: 'units', unitValue: 1, unitFrom: 'm', unitTo: 'ft' }, {})
  const unitViaService = service.convert(1, 'm', 'ft')
  assert('换算两路径同值', Math.abs(Number(unitViaTool.value?.result) - Number(unitViaService.number)) < 1e-9, JSON.stringify([unitViaTool.value?.result, unitViaService.number]))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
