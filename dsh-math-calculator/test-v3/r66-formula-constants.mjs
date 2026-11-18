/**
 * 架空世界的常数可改：公式里的物理常数/经验系数必须是**可选参数**，默认现实值、可覆盖。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-const-'))
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
const num = (out) => { const v = out.value?.result ?? out.value?.value; return Number(v) }
console.log('-- 1. 普朗克常数（光电阈值）--')
{
  const base = await run({ operation: 'formula', formula: 'photoelectric_threshold', params: { work_function: 4.5e-19 } })
  const doubled = await run({ operation: 'formula', formula: 'photoelectric_threshold', params: { work_function: 4.5e-19, h_planck: 1.32521403e-33 } })
  assert('★ 默认 h 可调用', base.ok === true && num(base) > 0, String(base.error?.message))
  assert('★ h 翻倍 → 阈值频率减半', Math.abs(num(base) / num(doubled) - 2) < 0.01, num(base) + ' / ' + num(doubled))
}
console.log('-- 2. 光速（康普顿频移）--')
{
  const base = await run({ operation: 'formula', formula: 'compton_shift', params: { scatter_angle: 3.14159265358979 } })
  const half = await run({ operation: 'formula', formula: 'compton_shift', params: { scatter_angle: 3.14159265358979, c: 599584916 } })
  assert('★ 默认 c 可调用', base.ok === true && num(base) > 0, '')
  assert('★ c 翻倍 → 频移减半', Math.abs(num(base) / num(half) - 2) < 0.01, num(base) + ' / ' + num(half))
}
console.log('-- 3. 阿伏伽德罗常数（裂变能量）--')
{
  const base = await run({ operation: 'formula', formula: 'fission_energy_per_mass', params: { energy_per_fission: 3.2e-11, molar_mass: 0.235 } })
  const doubled = await run({ operation: 'formula', formula: 'fission_energy_per_mass', params: { energy_per_fission: 3.2e-11, molar_mass: 0.235, NA: 1.204428152e24 } })
  assert('★ NA 翻倍 → 结果翻倍', base.ok === true && Math.abs(num(doubled) / num(base) - 2) < 0.01, num(base) + ' / ' + num(doubled))
}
console.log('-- 4. 太阳光度可改 --')
{
  const base = await run({ operation: 'formula', formula: 'solar_luminosity', params: {} })
  const dim = await run({ operation: 'formula', formula: 'solar_luminosity', params: { Lsun: 1e26 } })
  assert('★ 默认 Lsun = 3.828e26', base.ok === true && Math.abs(num(base) - 3.828e26) < 1e20, String(num(base)))
  assert('★ 覆盖 Lsun 生效', Math.abs(num(dim) - 1e26) < 1e19, String(num(dim)))
}
console.log('-- 5. 瑞利系数可改 --')
{
  const base = await run({ operation: 'formula', formula: 'optical_resolving_power', params: { lambda: 5e-7, D: 0.1 } })
  const ideal = await run({ operation: 'formula', formula: 'optical_resolving_power', params: { lambda: 5e-7, D: 0.1, rayleigh_factor: 1.0 } })
  assert('★ 默认 1.22', base.ok === true && Math.abs(num(base) - 1.22 * 5e-6) < 1e-12, String(num(base)))
  assert('★ 改 1.0 生效', Math.abs(num(ideal) - 5e-6) < 1e-12, String(num(ideal)))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }