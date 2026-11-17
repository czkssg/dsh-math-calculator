/**
 * R62 真实单位（未注册 / 别名一致性）
 *
 * 官方 units 套件只测「已注册能不能换算」；这里测真实世界常用写法，且每个「有」配一个「近义」。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-r62-'))
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

console.log('-- 1. 本轮补齐的单位 --')
{
  const pairs = [
    ['nautical mile', 'km', '1.852'], ['nmi', 'km', '1.852'], ['海里', 'km', '1.852'],
    ['当量', 'mol', '1'], ['吨标准煤', 'GJ', '29.3076'], ['吨标煤', 'GJ', '29.3076'], ['标准煤', 'GJ', '29.3076'],
  ]
  for (const [from, to, expect] of pairs) {
    const r = await run({ operation: 'units', unitValue: 1, unitFrom: from, unitTo: to })
    assert(from + ' → ' + to + ' = ' + expect, r.ok === true && String(r.result).includes(expect), String(r.result).slice(0, 90))
  }
}

console.log('-- 2. 其它真实单位（全部应可用）--')
{
  const cases = [
    ['lbf', 'N', '4.448'], ['磅力', 'N', '4.448'], ['BTU', 'J', '1055'], ['英热单位', 'J', '1055'],
    ['hp', 'W', '745.69'], ['马力', 'W', '745.69'], ['kn', 'km/h', '1.852'], ['节', 'km/h', '1.852'],
    ['psi', 'Pa', '6894'], ['冷吨', 'W', '3516'], ['加仑', 'L', '3.785'], ['蒲式耳', 'L', '35.239'],
  ]
  for (const [from, to, expect] of cases) {
    const r = await run({ operation: 'units', unitValue: 1, unitFrom: from, unitTo: to })
    assert(from + ' → ' + to + ' ≈ ' + expect, r.ok === true && String(r.result).includes(expect), String(r.result).slice(0, 90))
  }
}

console.log('-- 3. 别名一致性（成对）--')
{
  const eq = await run({ operation: 'units', unitValue: 2, unitFrom: 'equivalent', unitTo: 'mol' })
  assert('equivalent 与 当量 等价', eq.ok === true && String(eq.result).includes('2 mol'), String(eq.result).slice(0, 80))
  const nm = await run({ operation: 'units', unitValue: 10, unitFrom: 'nautical mile', unitTo: 'nmi' })
  assert('nautical mile 与 nmi 等价', nm.ok === true && String(nm.result).includes('10 nmi'), String(nm.result).slice(0, 80))
  const tce = await run({ operation: 'units', unitValue: 2, unitFrom: '吨标准煤', unitTo: '吨标煤' })
  assert('吨标准煤 与 吨标煤 等价（同为 tce）', tce.ok === true && String(tce.result).includes('2 tce'), String(tce.result).slice(0, 80))
  const bad = await run({ operation: 'units', unitValue: 1, unitFrom: '不存在的单位xyz', unitTo: 'm' })
  assert('伪单位仍明确报错（syntax 或 unknown_symbol）', bad.ok === false && ['syntax', 'unknown_symbol'].includes(String(bad.error?.type)), JSON.stringify(bad.error?.type))
}

console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
