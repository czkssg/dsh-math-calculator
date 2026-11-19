/**
 * mathEngine 第三期：公式代入、区间、常量。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-third-'))
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
  assert('★ methods 10 个（含 formula/interval/constant）', describe.methods.length === 10 && describe.methods.includes('formula') && describe.methods.includes('interval') && describe.methods.includes('constant'), JSON.stringify(describe.methods))
}
console.log('-- 2. 公式代入 --')
{
  const out = service.formula('kinetic_energy', { m: 2, v: 3 })
  assert('★ 动能 = 9 J', out.ok === true && out.number === '9' && out.unit === 'J', JSON.stringify(out).slice(0, 120))
  assert('★ 带输出量（web.output）', out.value?.output === '能量', JSON.stringify(out.value))
  const byName = service.formula('粮食总产', { area_hectare: 100, kg_per_hectare: 3000 })
  assert('按名称也能调', byName.ok === true && Number(byName.number) === 270000, JSON.stringify(byName).slice(0, 80))
  const missing = service.formula('kinetic_energy', { m: 2 })
  assert('缺参 → input', missing.ok === false && missing.error?.kind === 'input', JSON.stringify(missing.error))
  const unknown = service.formula('no_such_formula')
  assert('未知公式 → capability', unknown.ok === false && unknown.error?.kind === 'capability', JSON.stringify(unknown.error))
}
console.log('-- 3. 区间 --')
{
  const out = service.interval('20-50')
  assert('★ 20-50 中点 35', out.ok === true && out.number === '35', JSON.stringify(out).slice(0, 100))
  assert('★ 区间结构 low/high/confidence', out.value?.result?.low === 20 && out.value?.result?.high === 50 && typeof out.value?.confidence === 'string', JSON.stringify(out.value).slice(0, 160))
  const mul = service.interval('10*20-50')
  assert('乘法区间 200-500', mul.ok === true && mul.value?.result?.low === 200 && mul.value?.result?.high === 500, JSON.stringify(mul.value?.result))
  const bad = service.interval('')
  assert('空区间 → input', bad.ok === false && bad.error?.kind === 'input', JSON.stringify(bad.error))
}
console.log('-- 4. 常量 --')
{
  const c = service.constant('c')
  assert('★ c = 299792458 m/s', c.ok === true && c.number === '299792458' && c.unit === 'm/s', JSON.stringify(c).slice(0, 100))
  assert('带含义（meaning）', typeof c.value?.meaning === 'string' && c.value.meaning.length > 0, JSON.stringify(c.value))
  const unknown = service.constant('no_such_constant')
  assert('未知常量 → capability', unknown.ok === false && unknown.error?.kind === 'capability', JSON.stringify(unknown.error))
}
console.log('-- 5. 与工具一致 --')
{
  const viaTool = await mathExecuteTool.execute({ operation: 'formula', formula: 'kinetic_energy', params: { m: 2, v: 3 } }, {})
  const viaService = service.formula('kinetic_energy', { m: 2, v: 3 })
  assert('★ 同输入同数值', String(viaTool.value?.result) === viaService.number, String(viaTool.value?.result) + ' vs ' + viaService.number)
  const intervalViaTool = await mathExecuteTool.execute({ operation: 'interval', interval: { expr: '20-50' } }, {})
  assert('区间两路径同 mid', Number(intervalViaTool.value?.mid) === Number(service.interval('20-50').number), '')
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
