/**
 * 压测第二轮回归：复数、温度绝对零度、workspace 数据隔离、中文检索、params/initial 类型、控制字符。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-stress2-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
console.log('-- 1. 复数结果 --')
{
  const a = await run({ operation: 'evaluate', expression: 'sqrt(-1)' })
  assert('★ sqrt(-1) → 1i', a.ok === true && String(a.result).includes('1i'), String(a.result).slice(0, 40))
  const b = await run({ operation: 'evaluate', expression: 'sqrt(-4)' })
  assert('★ sqrt(-4) → 2i', b.ok === true && String(b.result).includes('2i'), String(b.result).slice(0, 40))
  const c = await run({ operation: 'evaluate', expression: '(2+3i)*(1-i)' })
  assert('★ 复数乘法 5+1i', c.ok === true && String(c.result).includes('5 + 1i'), String(c.result).slice(0, 40))
  const batch = await run({ operation: 'evaluate', expressions: ['sqrt(-1)', '1+1'] })
  assert('批量里复数不崩', batch.ok === true && String(batch.result).includes('1i'), '')
}
console.log('-- 2. 温度绝对零度 --')
{
  const cold = await run({ operation: 'units', unitFrom: 'degC', unitTo: 'K', unitValue: -300 })
  assert('★ -300°C → 拒绝', cold.ok === false && cold.error?.type === 'invalid_argument', String(cold.error?.type))
  const edge = await run({ operation: 'units', unitFrom: 'degC', unitTo: 'K', unitValue: -273.15 })
  assert('-273.15°C = 0 K 允许', edge.ok === true, String(edge.error?.type))
  const kelvin = await run({ operation: 'units', unitFrom: 'K', unitTo: 'degC', unitValue: 0 })
  assert('0 K → -273.15°C 允许', kelvin.ok === true && String(kelvin.result).includes('-273.15'), '')
}
console.log('-- 3. workspace 数据隔离 --')
{
  await run({ operation: 'workspace', action2: 'set', workspace: 'iso-w1', workspaceVariables: { a: 1 } })
  await run({ operation: 'data', dataAction: 'put', kind: 'note', name: '隔离记录甲', payload: { a: 1 } })
  const inW1 = await run({ operation: 'data', dataAction: 'search', query: '隔离记录甲' })
  assert('★ w1 能查到自己的记录', inW1.value?.hits?.length === 1, String(inW1.value?.hits?.length))
  await run({ operation: 'workspace', action2: 'set', workspace: 'iso-w2', workspaceVariables: { a: 2 } })
  const inW2 = await run({ operation: 'data', dataAction: 'search', query: '隔离记录甲' })
  assert('★ w2 查不到 w1 的记录（隔离）', inW2.value?.hits?.length === 0, String(inW2.value?.hits?.length))
  await run({ operation: 'data', dataAction: 'put', kind: 'note', name: '隔离记录乙', payload: { a: 2 } })
  const w2Own = await run({ operation: 'data', dataAction: 'search', query: '隔离记录' })
  assert('★ w2 能查到自己的记录', w2Own.value?.hits?.length === 1, String(w2Own.value?.hits?.length))
  await run({ operation: 'workspace', action2: 'set', workspace: 'iso-w1' })
  const backW1 = await run({ operation: 'data', dataAction: 'search', query: '隔离记录' })
  assert('★ 切回 w1 仍只有自己的', backW1.value?.hits?.length === 1, String(backW1.value?.hits?.length))
}
console.log('-- 4. 中文子串检索 --')
{
  const out = await run({ operation: 'data', dataAction: 'search', query: '记录' })
  assert('★ 「记录」能命中「隔离记录甲」', out.value?.hits?.length >= 1, JSON.stringify(out.value?.hits?.length))
}
console.log('-- 5. 类型错误 --')
{
  const paramsArr = await run({ operation: 'formula', formula: 'kinetic_energy', params: [1, 2] })
  assert('★ params 数组 → invalid_argument', paramsArr.ok === false && paramsArr.error?.type === 'invalid_argument', String(paramsArr.error?.type))
  const badInitial = await run({ operation: 'formulas', query: 'chain', formulaFocus: 'sys-structure', initial: { b: 'abc' } })
  assert('★ initial 字符串 → invalid_argument', badInitial.ok === false && badInitial.error?.type === 'invalid_argument', String(badInitial.error?.type))
}
console.log('-- 6. 控制字符 --')
{
  const out = await run({ operation: 'extract_numbers', text: '年产 1 \u0000 亿吨' })
  assert('★ 控制字符不进结果', out.ok === true && !String(out.result).includes('\u0000'), JSON.stringify(String(out.result).slice(0, 60)))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
