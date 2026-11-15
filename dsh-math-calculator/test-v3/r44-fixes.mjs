/**
 * R44 复测：中文量级 + 上标 + 计数单位（报告 #5）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-r44-units-'))
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

console.log('-- 1. 中文量级 + 空格 --')
{
  const km2 = await run({ expression: '1.2 亿 km² to km²' })
  assert('★ 1.2 亿 km² = 1.2e8 km²', km2.ok === true && km2.result.includes('120000000'), km2.result.slice(0, 60))
  const kg = await run({ expression: '3 亿 kg to t' })
  assert('★ 3 亿 kg = 300000 t', kg.ok === true && kg.result.includes('300000'), kg.result.slice(0, 60))
  const people = await run({ expression: '1 万 人 to 人' })
  assert('★ 1 万 人 = 10000', people.ok === true && people.result.includes('10000'), people.result.slice(0, 60))
}

console.log('-- 2. 上标复合单位 --')
{
  const dens = await run({ expression: '1 kg/m³ to g/cm³' })
  assert('★ kg/m³ → g/cm³ = 0.001', dens.ok === true && dens.result.includes('0.001'), dens.result.slice(0, 60))
}

console.log('-- 3. R44 失败项当前状态（回归）--')
{
  const ledger = await run({ operation: 'ledger', ledger: { parts: [{ name: '石料', value: 158.4 }], total: 158.4 } })
  assert('ledger 已修（不 THROW）', ledger.ok === true, String(ledger.error?.message))
  const world = await run({ operation: 'world', planetMass: 318, planetRadius: 11.2, brief: true })
  assert('world 参数生效（木星 2.5g）', world.ok === true && world.result.includes('2.5'), world.result.slice(0, 50))
  const cn = await run({ operation: 'consistency', consistency: { sections: [{ number: 1, text: '人口 八百 万' }, { number: 2, text: '人口 二千 万' }] } })
  assert('consistency 中文数字（2.5 倍）', cn.ok === true && cn.result.includes('2.5'), cn.result.slice(0, 60))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
