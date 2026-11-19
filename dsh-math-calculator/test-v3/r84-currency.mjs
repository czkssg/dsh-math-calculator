/**
 * 货币符号库：list/get，不做汇率与购买力。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-currency-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
console.log('-- 1. list --')
{
  const all = await run({ operation: 'currency' })
  assert('★ 全部 47 条', all.ok === true && all.value?.currencies?.length === 47, String(all.value?.currencies?.length))
  assert('★ 输出标题是符号库', String(all.result).includes('货币符号库'), String(all.result).slice(0, 40))
  const modern = await run({ operation: 'currency', currencyKind: 'modern' })
  assert('★ modern 22 条', modern.ok === true && modern.value?.currencies?.length === 22, String(modern.value?.currencies?.length))
  const ancient = await run({ operation: 'currency', currencyKind: 'ancient' })
  assert('ancient 16 条', ancient.ok === true && ancient.value?.currencies?.length === 16, String(ancient.value?.currencies?.length))
  const fantasy = await run({ operation: 'currency', currencyKind: 'fantasy' })
  assert('fantasy 9 条', fantasy.ok === true && fantasy.value?.currencies?.length === 9, String(fantasy.value?.currencies?.length))
  const bad = await run({ operation: 'currency', currencyKind: 'nope' })
  assert('非法 kind → invalid_argument', bad.ok === false && bad.error?.type === 'invalid_argument', String(bad.error?.type))
}
console.log('-- 2. get --')
{
  const usd = await run({ operation: 'currency', currencyAction: 'get', currencyCode: 'USD' })
  assert('★ USD 信息完整', usd.ok === true && usd.value?.symbol === '$' && usd.value?.abbrev === '美元' && usd.value?.name === '美元', JSON.stringify(usd.value))
  const cny = await run({ operation: 'currency', currencyAction: 'get', currencyCode: '人民币' })
  assert('★ 中文名可查', cny.ok === true && cny.value?.code === 'CNY', JSON.stringify(cny.value))
  const tael = await run({ operation: 'currency', currencyAction: 'get', currencyCode: 'CN_TAEL' })
  assert('古代货币可查', tael.ok === true && tael.value?.abbrev === '两', JSON.stringify(tael.value))
  const unknown = await run({ operation: 'currency', currencyAction: 'get', currencyCode: 'XYZ' })
  assert('未知货币 → unknown_symbol', unknown.ok === false && unknown.error?.type === 'unknown_symbol', String(unknown.error?.type))
}
console.log('-- 3. 不做换算 --')
{
  const convert = await run({ operation: 'currency', currencyAction: 'convert', currencyFrom: 'USD', currencyTo: 'CNY' })
  assert('★ convert 被拒绝（只做符号库）', convert.ok === false && convert.error?.type === 'unknown_argument', String(convert.error?.type))
  assert('提示说明不做换算', (String(convert.error?.message) + String(convert.error?.hint)).includes('list'), JSON.stringify(convert.error))
}
console.log('-- 4. 符号可直接写单价 --')
{
  const all = await run({ operation: 'currency', currencyKind: 'modern' })
  const text = String(all.result)
  assert('★ 现代货币行含 $ / € / ¥', text.includes('$') && text.includes('€') && text.includes('¥'), '')
  assert('★ 缩写列存在（美元/欧元/元）', text.includes('美元') && text.includes('欧元'), '')
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
