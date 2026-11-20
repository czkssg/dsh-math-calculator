/**
 * mathEngine 扩展接口：命名空间级自定义货币 / 公式。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-ext-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { createMathEngineService } = await import(pathToFileURL(join(root, 'lib/service.js')).href)
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
  assert('★ methods 22 个（含货币/公式扩展）', describe.methods.length === 22 && describe.methods.includes('registerCurrencies') && describe.methods.includes('registerFormulas'), JSON.stringify(describe.methods))
}
console.log('-- 2. 自定义货币 --')
{
  const reg = service.registerCurrencies('world-x', [
    { code: 'ZCR', name: '信用币', symbol: '¤', abbrev: '信', kind: 'fantasy' },
    { code: 'ZCOIN', name: '晶币', symbol: '◇', abbrev: '晶', kind: 'fantasy' },
  ])
  assert('★ 注册 2 个货币', reg.ok === true && JSON.stringify(reg.registered) === '["ZCR","ZCOIN"]', JSON.stringify(reg))
  const listed = service.currency('list', { namespace: 'world-x' })
  assert('★ 命名空间列表 = 内置 47 + 2', listed.ok === true && listed.value?.currencies?.length === 49, String(listed.value?.currencies?.length))
  const hit = service.currency('get', { code: 'ZCR', namespace: 'world-x' })
  assert('★ 自定义货币可查', hit.ok === true && hit.value?.name === '信用币' && hit.value?.symbol === '¤', JSON.stringify(hit.value))
  const builtinConflict = service.registerCurrencies('world-x', [{ code: 'USD', name: '美元2' }])
  assert('★ 与内置同名被拒绝', builtinConflict.ok === false && builtinConflict.error?.kind === 'input', JSON.stringify(builtinConflict.error))
  const isolated = service.currency('get', { code: 'ZCR', namespace: 'world-y' })
  assert('隔离：world-y 查不到 ZCR', isolated.ok === false && isolated.error?.kind === 'capability', '')
  const listing = service.listCurrencies('world-x')
  assert('listCurrencies 返回 2 条', listing.ok === true && listing.units?.[0]?.units?.length === 2, JSON.stringify(listing.units))
}
console.log('-- 3. 自定义公式 --')
{
  const reg = service.registerFormulas('world-x', [
    { id: 'zpower', name: '自定功率', expr: 'F * v', params: { F: 1 }, unit: 'W' },
    { id: 'zcost', name: '自定成本', expr: 'q * p', params: { q: 1 } },
  ])
  assert('★ 注册 2 个公式', reg.ok === true && JSON.stringify(reg.registered) === '["zpower","zcost"]', JSON.stringify(reg))
  const calc = service.formula('zpower', { F: 10, v: 2 }, { namespace: 'world-x' })
  assert('★ zpower = 20', calc.ok === true && calc.number === '20', JSON.stringify(calc))
  assert('带 custom 标记', calc.value?.custom === true && calc.value?.id === 'zpower', JSON.stringify(calc.value))
  const byName = service.formula('自定成本', { q: 3, p: 4 }, { namespace: 'world-x' })
  assert('按名称可调', byName.ok === true && byName.number === '12', JSON.stringify(byName))
  const badExpr = service.registerFormulas('world-x', [{ id: 'zempty', expr: '' }])
  assert('空 expr 被拒绝', badExpr.ok === false && badExpr.error?.kind === 'input', JSON.stringify(badExpr.error))
  const dup = service.registerFormulas('world-x', [{ id: 'zpower', expr: '1+1' }])
  assert('重复 id 被拒绝', dup.ok === false && dup.error?.kind === 'input', JSON.stringify(dup.error))
  const unknown = service.formula('no_such', {}, { namespace: 'world-x' })
  assert('未注册公式 → capability', unknown.ok === false && unknown.error?.kind === 'capability', JSON.stringify(unknown.error))
  const formulas = service.listFormulas('world-x')
  assert('listFormulas 返回 2 条', formulas.ok === true && formulas.units?.[0]?.units?.length === 2, '')
}
console.log('-- 4. 注销 --')
{
  const goneCurrency = service.unregisterCurrencies('world-x')
  assert('★ 注销自定义货币', goneCurrency.ok === true && goneCurrency.removed === true, JSON.stringify(goneCurrency))
  const goneFormula = service.unregisterFormulas('world-x')
  assert('★ 注销自定义公式', goneFormula.ok === true && goneFormula.removed === true, JSON.stringify(goneFormula))
  const after = service.currency('get', { code: 'ZCR', namespace: 'world-x' })
  assert('注销后货币查不到', after.ok === false && after.error?.kind === 'capability', '')
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
