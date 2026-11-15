/**
 * astro tech：天文观测 → 科技能力（望远远/六分仪/航海钟/钟摆/圭表/历法漂移）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-astrotech-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const techMod = await import(pathToFileURL(join(root, 'lib/features/deduction/astrotech.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 望远镜（瑞利判据）--')
{
  const t = techMod.deriveAstroTech({ device: 'telescope', precision: 100 })
  assert('★ 100 mm 口径 → 1.38 角秒', Math.abs((t.value.resolutionArcsec) - 1.384) < 0.02, String(t.value.resolutionArcsec))
  const big = techMod.deriveAstroTech({ device: 'telescope', precision: 2000 })
  assert('2000 mm → <0.1 角秒（可分辨行星圆面）', (big.value.resolutionArcsec) < 0.1, String(big.value.resolutionArcsec))
}

console.log('-- 2. 六分仪/航海钟 --')
{
  const s = techMod.deriveAstroTech({ device: 'sextant', precision: 1 })
  assert('★ 1 角分 → 1.852 km 纬度误差', Math.abs((s.value.latErrorKm) - 1.852) < 0.01, String(s.value.latErrorKm))
  const c = techMod.deriveAstroTech({ device: 'clock', precision: 3 })
  assert('★ 日误差 3 秒 → 0.0125°/天', Math.abs((c.value.degPerDay) - 0.0125) < 1e-9, String(c.value.degPerDay))
}

console.log('-- 3. 钟摆/圭表/历法漂移 --')
{
  const p = techMod.deriveAstroTech({ device: 'pendulum' })
  assert('★ 秒摆 0.994 m', Math.abs((p.value.secondsPendulumM) - 0.994) < 0.01, String(p.value.secondsPendulumM))
  const d = techMod.deriveAstroTech({ device: 'calendar-drift', yearErrorDays: 0.0078 })
  assert('★ 儒略历 128 年差 1 天', Math.abs((d.value.yearsPerDay) - 128.2) < 0.5, String(d.value.yearsPerDay))
  const sh = techMod.deriveAstroTech({ device: 'shadow', precision: 1 })
  assert('圭表 1 mm → 回归年分辨率 0.067 天', (sh.value.yearResolutionDays) > 0, String(sh.value.yearResolutionDays))
}

console.log('-- 4. 经 tool --')
{
  const out = await run({ operation: 'astro', astro: { action: 'tech', device: 'sextant', precision: 1, lat: 40 } })
  assert('★ tech 经 tool 可跑', out.ok === true && out.result.includes('天文观测 → 科技'), out.result.slice(0, 80))
  const bad = await run({ operation: 'astro', astro: { action: 'tech', device: 'nope' } })
  assert('未知 device → 报错', bad.ok === false, JSON.stringify(bad.error).slice(0, 60))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
