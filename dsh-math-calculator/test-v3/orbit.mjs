/**
 * astro 的通用轨道（开普勒：orbit / binary）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-orbit-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const orbitMod = await import(pathToFileURL(join(root, 'lib/features/deduction/orbit.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 开普勒核心 --')
{
  const earth = orbitMod.orbitalPeriod({ a: 1, e: 0.0167, centralMass: 1 })
  assert('★ 地球轨道周期 = 1.000 年', Math.abs(earth - 1) < 1e-9, String(earth))
  const jupiter = orbitMod.orbitalPeriod({ a: 5.2044, e: 0.0489, centralMass: 1 })
  assert('★ 木星 a=5.2 AU → 周期 ≈ 11.87 年（开普勒 vs 真实历表差 0.01）', Math.abs(jupiter - 11.87) < 0.02, String(jupiter))
  const E = orbitMod.solveKepler(1.5, 0.3)
  assert('开普勒方程自洽（E − e sinE = M）', Math.abs(E - 0.3 * Math.sin(E) - 1.5) < 1e-10, String(E))
}

console.log('-- 2. orbit 经 tool --')
{
  const out = await run({ operation: 'astro', astro: { action: 'orbit', elements: { a: 1, e: 0.0167, centralMass: 1 }, years: 0.25 } })
  assert('★ orbit 可算（周期/位置）', out.ok === true && out.result.includes('周期 1.000 年'), out.result.slice(0, 120))
  assert('标题为通用轨道模型', out.result.includes('通用轨道模型'), out.result.slice(0, 40))
  assert('0.25 年后距离仍约 1 AU', Math.abs(out.value.state.radiusAu - 1) < 0.02, String(out.value.state.radiusAu))
}

console.log('-- 3. 双星 --')
{
  const out = await run({ operation: 'astro', astro: { action: 'binary', binary: { massA: 1, massB: 0.5, semiMajorAu: 1 } } })
  assert('★ 双星周期 0.816 年', out.ok === true && out.result.includes('0.816'), out.result.slice(0, 100))
  assert('★ 质心距按质量反比（0.333 / 0.667）', out.value.result.aStarAu.toFixed(3) === '0.333' && out.value.result.aCompanionAu.toFixed(3) === '0.667', '')
}

console.log('-- 4. 非法参数 --')
{
  const bad = await run({ operation: 'astro', astro: { action: 'binary', binary: { massA: 0, massB: 1, semiMajorAu: 1 } } })
  assert('零质量双星 → invalid_argument', bad.ok === false && bad.error.type === 'invalid_argument', '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
