/**
 * 非现代单位桥：穷举映射（1032 别名）抽样验证。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-bridge3-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const bridgeMod = await import(pathToFileURL(join(root, 'lib/core/unit-bridge.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 穷举规模 --')
{
  const table = bridgeMod.buildBridgeTable()
  const count = Object.keys(table).length
  assert('★ 桥接别名 ≥ 1000', count >= 1000, String(count))
  assert('SI 自身不进表（m/s/kg）', table['m'] === undefined && table['s'] === undefined && table['kg'] === undefined, JSON.stringify({ m: table['m'], s: table['s'] }))
  assert('语法关键字不进表（to）', table['to'] === undefined, '')
}

console.log('-- 2. 中国市制/古制 --')
{
  const shichi = await run({ expression: '1 市尺 to cm' })
  assert('1 市尺 = 33.33 cm', shichi.ok === true && shichi.result.includes('33.3'), shichi.result.slice(0, 40))
  const shijin = await run({ expression: '1 市斤 to kg' })
  assert('1 市斤 = 0.5 kg', shijin.ok === true && shijin.result.includes('0.5'), '')
  const dan = await run({ expression: '1 担 to kg' })
  assert('1 担 = 50 kg', dan.ok === true && dan.result.includes('50'), '')
  const qian = await run({ expression: '5 钱 to g' })
  assert('5 钱 = 25 g', qian.ok === true && qian.result.includes('25'), '')
}

console.log('-- 3. 各国传统单位 --')
{
  const tsubo = await run({ expression: '1 坪 to m2' })
  assert('日本 1 坪 = 3.3058 m²', tsubo.ok === true && tsubo.result.includes('3.305'), tsubo.result.slice(0, 40))
  const bushel = await run({ expression: '1 蒲式耳 to L' })
  assert('英制 1 蒲式耳 = 35.239 L', bushel.ok === true && bushel.result.includes('35.239'), bushel.result.slice(0, 40))
  const pood = await run({ expression: '1 普特 to kg' })
  assert('俄国 1 普特 = 16.38 kg', pood.ok === true && pood.result.includes('16.3'), pood.result.slice(0, 40))
  const toise = await run({ expression: '1 图瓦兹 to m' })
  assert('法国 1 图瓦兹 ≈ 1.949 m', toise.ok === true && toise.result.includes('1.94'), toise.result.slice(0, 40))
}

console.log('-- 4. 复合与非现代 ↔ 现代 --')
{
  const rate = await run({ expression: '3 舍/日程 to km/h' })
  assert('★ 3 舍/日程 = 6 km/h', rate.ok === true && rate.result.includes('6'), rate.result.slice(0, 40))
  const rev = await run({ expression: '1 t to 担' })
  assert('★ 1 t = 20 担', rev.ok === true && rev.result.includes('20'), rev.result.slice(0, 40))
  const ku = await run({ expression: '100 km to 里' })
  assert('★ 100 km = 200 里', ku.ok === true && ku.result.includes('200'), ku.result.slice(0, 40))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
