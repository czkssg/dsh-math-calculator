/**
 * 太阳系验证：地球矫正 + 外推边界。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-solar-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const sv = await import(pathToFileURL(join(root, 'lib/features/deduction/solar-validation.js')).href)
const cm = await import(pathToFileURL(join(root, 'lib/features/deduction/climate-model.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
console.log('-- 1. 地球（标定集）--')
{
  const e = cm.validateAgainstEarth()
  assert('★ 地球自检平均残差 < 2 K', e.meanTempResidual < 2, e.meanTempResidual.toFixed(2))
}
console.log('-- 2. 太阳系外推 --')
{
  const r = sv.validateAgainstSolarSystem()
  const earth = r.checks.find((c) => c.name === '地球')
  const mars = r.checks.find((c) => c.name === '火星')
  const titan = r.checks.find((c) => c.name === '土卫六泰坦')
  const venus = r.checks.find((c) => c.name === '金星')
  assert('★ 地球误差 < 15 K', Math.abs(earth.errorK) < 15, earth.errorK.toFixed(0))
  assert('★ 火星误差 < 15 K（稀薄大气也准）', Math.abs(mars.errorK) < 15, mars.errorK.toFixed(0))
  assert('★ 泰坦误差 < 15 K（远日天体也准）', Math.abs(titan.errorK) < 15, titan.errorK.toFixed(0))
  assert('★ 金星被标为适用范围外（巨厚大气）', venus.verdict === 'out-of-domain', venus.verdict)
  assert('★ 至少 3 个天体 good', r.goodCount >= 3, String(r.goodCount))
}
console.log('-- 3. 边界结论 --')
{
  const r = sv.validateAgainstSolarSystem()
  assert('结论明确说「类地拟合，不是任意行星模型」', r.notes.some((n) => n.includes('类地气候拟合')), '')
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
