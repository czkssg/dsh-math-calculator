/**
 * 非现代单位桥：古制/英制/地区 ↔ 现代（UCUM/SI）自动双向。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-bridge2-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 非现代 → 现代（单量）--')
{
  const dan = await run({ expression: '1 担 to kg' })
  assert('★ 1 担 = 50 kg', dan.ok === true && dan.result.includes('50'), dan.result.slice(0, 60))
  const qian = await run({ expression: '5 钱 to g' })
  assert('★ 5 钱 = 25 g', qian.ok === true && qian.result.includes('25'), qian.result.slice(0, 60))
  const acre = await run({ expression: '1 英亩 to m2' })
  assert('★ 1 英亩 = 4046.86 m²', acre.ok === true && acre.result.includes('4046'), acre.result.slice(0, 60))
  const russian = await run({ expression: '1 俄里 to m' })
  assert('★ 1 俄里 = 1066.8 m', russian.ok === true && russian.result.includes('1066'), russian.result.slice(0, 60))
  assert('★ 桥接提示写明换算了什么', typeof dan.notice === 'string' && dan.notice.includes('担'), String(dan.notice).slice(0, 60))
}

console.log('-- 2. 非现代复合 → 现代 --')
{
  const speed = await run({ expression: '3 舍/日程 to km/h' })
  assert('★ 3 舍/日程 = 1.8 km/h', speed.ok === true && speed.result.includes('1.8'), speed.result.slice(0, 60))
  const pace = await run({ expression: '2 里/天 to km/h' })
  assert('★ 2 里/天 = 0.0417 km/h', pace.ok === true && pace.result.includes('0.0416'), pace.result.slice(0, 60))
}

console.log('-- 3. 现代 → 非现代（反向）--')
{
  const dan = await run({ expression: '1 kg to 担' })
  assert('★ 1 kg = 0.02 担', dan.ok === true && dan.result.includes('0.02'), dan.result.slice(0, 60))
  const bu = await run({ expression: '2 m to 步' })
  assert('★ 2 m = 1.25 步', bu.ok === true && bu.result.includes('1.25'), bu.result.slice(0, 60))
  const ton = await run({ expression: '1 t to 担' })
  assert('★ 1 t = 20 担', ton.ok === true && ton.result.includes('20'), ton.result.slice(0, 60))
  const li = await run({ expression: '100 km to 里' })
  assert('★ 100 km = 200 里', li.ok === true && li.result.includes('200'), li.result.slice(0, 60))
}

console.log('-- 4. 量纲不同要拒绝 --')
{
  const bad = await run({ expression: '1 kg to 里' })
  assert('★ kg → 里（长度）拒绝', bad.ok === false, JSON.stringify(bad.result || bad.error?.message).slice(0, 80))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
