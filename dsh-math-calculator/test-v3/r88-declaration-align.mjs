/**
 * 声明-实现对照回归：units 概览、topology/hierarchy 顶层参数、已删死键、args 节。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-decl-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
console.log('-- 1. units 无参概览（help 承诺）--')
{
  const out = await run({ operation: 'units' })
  assert('★ 不带参数 → 单位族概览', out.ok === true && String(out.result).includes('单位族概览'), String(out.result).slice(0, 40))
  assert('★ families 覆盖 ≥ 10 个量纲', out.ok === true && out.value?.families?.length >= 10, String(out.value?.families?.length))
  assert('★ 总条数 469', out.value?.families?.reduce((sum, item) => sum + item.count, 0) === 469, '')
}
console.log('-- 2. units 单单位 / 换算 --')
{
  const one = await run({ operation: 'units', unitFrom: '里' })
  assert('只给 unitFrom → 单位信息', one.ok === true && String(one.result).includes('里'), String(one.result).slice(0, 40))
  const conv = await run({ operation: 'units', unitValue: 30, unitFrom: '里', unitTo: 'km' })
  assert('正常换算 30 里 = 15 km', conv.ok === true && String(conv.result).includes('15 km'), '')
}
console.log('-- 3. topology 顶层别名 --')
{
  const out = await run({ operation: 'topology', topology: { action: 'avoid' }, fromPoint: { lat: 30, lon: 110 }, toPoint: { lat: 31, lon: 111 } })
  assert('★ 顶层 fromPoint/toPoint 生效', out.ok === true && /km|路径|距离/.test(String(out.result)), String(out.result).slice(0, 60))
  const struct = await run({ operation: 'topology', topology: { action: 'structure', kind: 'building', footprintM2: 500, floors: 3 }, area: 500 })
  assert('顶层 area 不报错', struct.ok !== false || !String(struct.error?.message).includes('area'), String(struct.error?.message).slice(0, 50))
}
console.log('-- 4. hierarchy 顶层参数 --')
{
  const out = await run({ operation: 'hierarchy', hierarchy: { levels: ['师', '团', '营'], tree: [3, 3], base: 10 } })
  assert('★ hierarchy 对象生效', out.ok === true, String(out.error?.message))
}
console.log('-- 5. 已删死键 --')
{
  const out = await run({ operation: 'evaluate', expression: '1+1', customExpression: 'x+1' })
  assert('customExpression 已从 schema 移除（报认不出）', out.ok === true && String(out.notice ?? '').includes('认不出来'), String(out.notice).slice(0, 60))
}
console.log('-- 6. help 参数总表 --')
{
  const out = await run({ operation: 'help', helpTopic: 'args' })
  assert('★ helpTopic:"args" 可取参数总表', out.ok === true && String(out.result).includes('参数总表'), String(out.result).slice(0, 40))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
