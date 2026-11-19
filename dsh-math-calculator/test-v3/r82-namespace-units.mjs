/**
 * mathEngine 第二期：自定义单位命名空间（注册/隔离/注销/冲突）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-ns-'))
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
  assert('★ supportsCustomUnits 为 true', describe.supportsCustomUnits === true, String(describe.supportsCustomUnits))
  assert('methods 含 register/list/unregister', describe.methods.includes('registerUnits') && describe.methods.includes('listUnits') && describe.methods.includes('unregisterUnits'), JSON.stringify(describe.methods))
}
console.log('-- 2. 注册与使用 --')
{
  const reg = service.registerUnits('world-a', [{ name: 'zcredit', factor: 1, base: '' }, { name: 'zli', factor: 500, base: 'm' }])
  assert('★ 注册 2 个单位', reg.ok === true && JSON.stringify(reg.registered) === '["zcredit","zli"]', JSON.stringify(reg))
  const li = service.evaluate('1 zli', { namespace: 'world-a' })
  assert('★ 1 zli 在命名空间内可求值', li.ok === true && li.number === '1' && li.unit === 'zli', JSON.stringify(li))
  const credit = service.evaluate('100 zcredit', { namespace: 'world-a' })
  assert('★ 100 credit 无量纲可用', credit.ok === true && Number(credit.number) === 100, JSON.stringify(credit))
}
console.log('-- 3. 隔离 --')
{
  const outside = service.evaluate('1 zli')
  assert('★ 命名空间外不认识 li（capability）', outside.ok === false && outside.error?.kind === 'capability', JSON.stringify(outside.error))
  const other = service.registerUnits('world-b', [{ name: 'zcubit', factor: 0.4572, base: 'm' }])
  assert('world-b 注册 cubit', other.ok === true, JSON.stringify(other))
  const cross = service.evaluate('1 zli', { namespace: 'world-b' })
  assert('★ world-b 不认识 world-a 的 li', cross.ok === false && cross.error?.kind === 'capability', JSON.stringify(cross.error))
}
console.log('-- 4. 换算 --')
{
  const converted = service.convert(1, 'zli', 'm', { namespace: 'world-a' })
  assert('★ 1 li → 500 m（convert）', converted.ok === true && Number(converted.number) === 500, JSON.stringify(converted))
}
console.log('-- 5. 列出 --')
{
  const all = service.listUnits()
  assert('★ 列出 2 个命名空间', all.ok === true && all.units?.length === 2, JSON.stringify(all.units?.map((item) => item.namespace)))
  const one = service.listUnits('world-a')
  assert('★ world-a 有 2 个单位', one.ok === true && one.units?.[0]?.units.length === 2, JSON.stringify(one.units))
}
console.log('-- 6. 冲突 --')
{
  const builtin = service.registerUnits('world-c', [{ name: 'm', factor: 1 }])
  assert('★ 与内置同名被拒绝', builtin.ok === false && builtin.error?.kind === 'input', JSON.stringify(builtin.error))
  const dup = service.registerUnits('world-a', [{ name: 'zli', factor: 1 }])
  assert('★ 重复注册被拒绝', dup.ok === false && dup.error?.kind === 'input', JSON.stringify(dup.error))
  const badBase = service.registerUnits('world-c', [{ name: 'foo', factor: 1, base: 'zzz' }])
  assert('非法 base 被拒绝', badBase.ok === false && badBase.error?.kind === 'input', JSON.stringify(badBase.error))
  const underscore = service.registerUnits('world-c', [{ name: 'bad_name', factor: 1 }])
  assert('★ 下划线单位名被拒绝（createUnit 限制）', underscore.ok === false && underscore.error?.kind === 'input', JSON.stringify(underscore.error))
}
console.log('-- 7. 注销 --')
{
  const removed = service.unregisterUnits('world-a')
  assert('★ 注销成功', removed.ok === true && removed.removed === true, JSON.stringify(removed))
  const after = service.evaluate('1 zli', { namespace: 'world-a' })
  assert('★ 注销后不可用', after.ok === false && after.error?.kind === 'capability', JSON.stringify(after.error))
  const again = service.unregisterUnits('world-a')
  assert('重复注销 removed=false', again.ok === true && again.removed === false, JSON.stringify(again))
}
console.log('-- 8. 未知命名空间 --')
{
  const unknown = service.evaluate('1+1', { namespace: 'no-such' })
  assert('★ 未知命名空间 → capability', unknown.ok === false && unknown.error?.kind === 'capability', JSON.stringify(unknown.error))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
