/** 家庭结构：生育间隔 / 世代长度 / 户规模。
 *
 * 这一层此前是 0 条（只有更替生育率）。三条都按「机制式 + 量级锚点」实现：
 * 生育间隔用 Bongaarts 分解（妊娠 + 产后闭经 + 等待受孕），世代长度是人口学定义，
 * 户规模是账。断言用机制方向与量级区间，不背某个精确值。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-household-'))
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

console.log('-- 1. 生育间隔（Bongaarts 分解）--')
{
  const r = await run({ operation: 'formula', formula: 'birth_interval', params: { gestation_months: 9, postpartum_amenorrhea_months: 12, fecundability: 0.2 } })
  assert('9 + 12 + 1/0.2 = 26 月', r.ok === true && near(r.value.result, 26, 1e-6), r.ok ? String(r.value.result) : r.error && r.error.message)
  const nurse = await run({ operation: 'formula', formula: 'birth_interval', params: { gestation_months: 9, postpartum_amenorrhea_months: 24, fecundability: 0.2 } })
  assert('延长哺乳（闭经 24）→ 38 月（机制方向）', nurse.ok === true && near(nurse.value.result, 38, 1e-6), nurse.ok ? String(nurse.value.result) : '')
  assert('默认参数落在人类 2~3.5 年区间', r.ok && r.value.result / 12 >= 2 && r.value.result / 12 <= 3.5, r.ok ? String(r.value.result / 12) : '')
  const sterile = await run({ operation: 'formula', formula: 'birth_interval', params: { gestation_months: 9, postpartum_amenorrhea_months: 12, fecundability: 0 } })
  const bad = sterile.ok === false || (sterile.ok === true && !Number.isFinite(sterile.value.result))
  assert('fecundability=0 不能静默给 Infinity', bad, sterile.ok ? String(sterile.value.result) : '')
}

console.log('-- 2. 世代长度 --')
{
  const r = await run({ operation: 'formula', formula: 'generation_length', params: { marriage_age: 20, birth_interval_months: 26, children: 8 } })
  assert('初婚 20、间隔 26 月、8 孩 → 约 27.6 岁', r.ok === true && near(r.value.result, 27.583, 0.01), r.ok ? String(r.value.result) : r.error && r.error.message)
  assert('落在传统社会 25~32 岁', r.ok && r.value.result >= 25 && r.value.result <= 32, r.ok ? String(r.value.result) : '')
  const one = await run({ operation: 'formula', formula: 'generation_length', params: { marriage_age: 20, birth_interval_months: 26, children: 1 } })
  assert('只生 1 个 → 世代长度 = 初婚年龄', one.ok === true && near(one.value.result, 20, 1e-6), one.ok ? String(one.value.result) : '')
  const modern = await run({ operation: 'formula', formula: 'generation_length', params: { marriage_age: 28, birth_interval_months: 36, children: 2 } })
  assert('晚婚少生 → 世代拉长（≥29）', modern.ok === true && modern.value.result >= 29, modern.ok ? String(modern.value.result) : '')
}

console.log('-- 3. 户规模 --')
{
  const r = await run({ operation: 'formula', formula: 'household_size', params: { adults: 2, children_alive: 4, elderly: 1 } })
  assert('2 成人 + 4 子女 + 1 老人 = 7 口', r.ok === true && near(r.value.result, 7, 1e-6), r.ok ? String(r.value.result) : r.error && r.error.message)
  const noElder = await run({ operation: 'formula', formula: 'household_size', params: { adults: 2, children_alive: 4 } })
  assert('不给老人数默认 0 → 6 口', noElder.ok === true && near(noElder.value.result, 6, 1e-6), noElder.ok ? String(noElder.value.result) : '')
  assert('户规模 ≥ 成人数（算术自洽）', r.ok && r.value.result >= 2, r.ok ? String(r.value.result) : '')
}

console.log('-- 4. 三条串起来 --')
{
  const bi = await run({ operation: 'formula', formula: 'birth_interval', params: { gestation_months: 9, postpartum_amenorrhea_months: 18, fecundability: 0.2 } })
  const gl = await run({ operation: 'formula', formula: 'generation_length', params: { marriage_age: 18, birth_interval_months: bi.ok ? bi.value.result : NaN, children: 6 } })
  assert('间隔 32 月 + 初婚 18 + 6 孩 → 世代约 24.8 岁', gl.ok === true && near(gl.value.result, 24.8, 0.2), gl.ok ? String(gl.value.result) : '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
