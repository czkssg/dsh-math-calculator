/** 多纪年换算：跨历法年份映射 / 年号换算。
 *
 * calendar-convert 只做单历法内部；跨历法与年号此前是 0 条。
 * 两条都是纯仿射/算术，可自证；带闰年的不规则历法明确不做。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-era-'))
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
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol

console.log('-- 1. 跨历法：年长相同 → 平移 --')
{
  const r = await run({ operation: 'formula', formula: 'era_year_convert', params: { source_year: 100, source_epoch: 0, source_days_per_year: 365.25, target_epoch: 1000, target_days_per_year: 365.25 } })
  assert('源年 100（纪元 0）→ 目标历 1100（纪元 1000）', r.ok === true && near(r.value.result, 1100, 1e-9), r.ok ? String(r.value.result) : r.error && r.error.message)
}

console.log('-- 2. 跨历法：年长不同 → 比例 --')
{
  const r = await run({ operation: 'formula', formula: 'era_year_convert', params: { source_year: 100, source_epoch: 0, source_days_per_year: 360, target_epoch: 1000, target_days_per_year: 365.25 } })
  assert('源 360 天/年、100 年 → 目标 1101.46 年', r.ok === true && near(r.value.result, 1101.4583, 0.001), r.ok ? String(r.value.result) : r.error && r.error.message)
}

console.log('-- 3. 往返一致 --')
{
  const ab = await run({ operation: 'formula', formula: 'era_year_convert', params: { source_year: 500, source_epoch: 100, source_days_per_year: 360, target_epoch: 2000, target_days_per_year: 365.25 } })
  const ba = await run({ operation: 'formula', formula: 'era_year_convert', params: { source_year: ab.ok ? ab.value.result : NaN, source_epoch: 2000, source_days_per_year: 365.25, target_epoch: 100, target_days_per_year: 360 } })
  assert('A→B→A 回到 500', ba.ok === true && near(ba.value.result, 500, 1e-6), ba.ok ? String(ba.value.result) : '')
}

console.log('-- 4. 边界：源年长为 0 --')
{
  const r = await run({ operation: 'formula', formula: 'era_year_convert', params: { source_year: 100, source_epoch: 0, source_days_per_year: 0, target_epoch: 0, target_days_per_year: 365.25 } })
  const bad = r.ok === false || (r.ok === true && !Number.isFinite(r.value.result))
  assert('年长 0 不能静默给 Infinity', bad, r.ok ? String(r.value.result) : '')
}

console.log('-- 5. 年号换算（差一检查）--')
{
  const y3 = await run({ operation: 'formula', formula: 'regnal_year_to_absolute', params: { reign_start_year: 1644, regnal_year: 3 } })
  assert('年号起 1644、第 3 年 → 1646（不是 1647）', y3.ok === true && near(y3.value.result, 1646, 1e-9), y3.ok ? String(y3.value.result) : y3.error && y3.error.message)
  const y1 = await run({ operation: 'formula', formula: 'regnal_year_to_absolute', params: { reign_start_year: 1644, regnal_year: 1 } })
  assert('第 1 年 = 起始年 1644', y1.ok === true && near(y1.value.result, 1644, 1e-9), y1.ok ? String(y1.value.result) : '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
