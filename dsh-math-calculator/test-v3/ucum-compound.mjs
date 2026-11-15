/**
 * UCUM 复合单位复用（NLM ucum-lhc）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-ucum-'))
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

const DENSITY = '1 kg/m' + String.fromCharCode(0xb3) + ' to g/cm' + String.fromCharCode(0xb3)

console.log('-- 1. 上标复合单位（mathjs 不认，UCUM 接）--')
{
  const density = await run({ expression: DENSITY })
  assert('★ kg/m³ → g/cm³ = 0.001', density.ok === true && density.result.includes('0.001'), density.result.slice(0, 80))
  /** 上标归一后 mathjs 可能直接算（更好）；UCUM notice 只在 mathjs 失败时出现，不强制。 */
  assert('★ 上标写法结果正确（UCUM 或 mathjs 均可）', density.ok === true && density.result.includes('0.001'), density.result.slice(0, 60))
  const alt = await run({ expression: '1000 kg/m3 to g/cm3' })
  assert('kg/m3（无上标）仍可用', alt.ok === true, '')
}

console.log('-- 2. 摩尔/浓度与速率 --')
{
  const molar = await run({ expression: '1 mol/L to mol/m' + String.fromCharCode(0xb3) })
  assert('★ mol/L → mol/m³ = 1000', molar.ok === true && String(molar.result).includes('1000'), molar.result.slice(0, 80))
  const rate = await run({ expression: '1 t/a to kg/s' })
  assert('★ t/a → kg/s ≈ 3.1688e-5', rate.ok === true && rate.result.includes('0.00003168'), rate.result.slice(0, 80))
  const cjk = await run({ expression: '1 桶/天 to L/s' })
  assert('★ 中文「桶/天」→ L/s ≈ 0.00184', cjk.ok === true && cjk.result.includes('0.00184'), cjk.result.slice(0, 80))
}

console.log('-- 3. 不接管一般表达式 --')
{
  const plain = await run({ expression: '1+1' })
  assert('普通表达式仍走 mathjs（无 UCUM notice）', plain.ok === true && plain.result.includes('2') && plain.notice === undefined, JSON.stringify(plain.result))
  const bad = await run({ expression: '1 个/亩 to kg/s' })
  assert('UCUM 不认的古制复合式 → 明确报错', bad.ok === false && typeof bad.error?.type === 'string', JSON.stringify(bad.error).slice(0, 100))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
