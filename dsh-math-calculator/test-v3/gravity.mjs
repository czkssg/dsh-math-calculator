/**
 * astro gravity/relativity：万有引力 + 史瓦西相对论（宇宙各天体）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-gravity-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const g = await import(pathToFileURL(join(root, 'lib/features/deduction/gravity.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 牛顿引力（地球/太阳）--')
{
  assert('★ 地球逃逸速度 11.19 km/s', Math.abs(g.escapeVelocity(g.M_EARTH, 6371000) / 1000 - 11.19) < 0.05, '')
  assert('★ 地球圆轨道速度 7.91 km/s', Math.abs(g.circularVelocity(g.M_EARTH, 6371000) / 1000 - 7.91) < 0.05, '')
  assert('★ 太阳逃逸速度 617.7 km/s', Math.abs(g.escapeVelocity(g.M_SUN, 6.957e8) / 1000 - 617.7) < 1, '')
}

console.log('-- 2. 史瓦西相对论 --')
{
  assert('★ 太阳史瓦西半径 2953 m', Math.abs(g.schwarzschildRadius(g.M_SUN) - 2953) < 3, String(g.schwarzschildRadius(g.M_SUN)))
  assert('★ 太阳 ISCO = 3 r_s', Math.abs(g.iscoRadius(g.M_SUN) / g.schwarzschildRadius(g.M_SUN) - 3) < 1e-9, '')
  const bh = g.classifyRegime(10 * g.M_SUN, g.schwarzschildRadius(10 * g.M_SUN))
  assert('★ 10 M☉ 黑洞：逃逸速度 = c', Math.abs(bh.beta - 1) < 1e-6, String(bh.beta))
  const earthD = g.totalTimeDilation(g.M_EARTH, 6371000, 0)
  assert('地球表面时间膨胀 ≈ 1 − 7e-10', Math.abs(earthD - 1) < 1e-8, String(earthD))
}

console.log('-- 3. 经 tool --')
{
  const out = await run({ operation: 'astro', astro: { action: 'gravity', massKg: 5.9722e24, radiusM: 6371000 } })
  assert('★ gravity 经 tool 可跑', out.ok === true && out.result.includes('逃逸速度'), out.result.slice(0, 100))
  const rel = await run({ operation: 'astro', astro: { action: 'relativity', massKg: 1.98847e30, radiusM: 6.957e8 } })
  assert('★ relativity 经 tool（太阳：弱场）', rel.ok === true && rel.result.includes('史瓦西半径'), rel.result.slice(0, 100))
  assert('太阳红移极小（弱场）', rel.value.redshift < 1e-4, String(rel.value.redshift))
}

console.log('-- 4. N 体引力 --')
{
  const acc = g.nBodyAcceleration([{ massKg: g.M_EARTH, positionM: [0, 0, 0] }], [0, 6371000, 0])
  assert('★ 地表引力加速度 ≈ 9.8 m/s²（指向地心，取绝对值）', Math.abs(Math.abs(acc[1]) - 9.82) < 0.1, String(acc[1]))
  const a2 = g.nBodyAcceleration([{ massKg: g.M_EARTH, positionM: [0, 0, 0] }, { massKg: g.M_SUN, positionM: [g.AU, 0, 0] }], [0, 6371000, 0])
  assert('叠加太阳引力（同量级小）', Math.abs(a2[1] - acc[1]) < 0.01, '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
