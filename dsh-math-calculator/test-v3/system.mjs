/**
 * astro system：任意恒星 + 多行星 + 卫星（希尔球/洛希/稳定性）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-system-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const sysMod = await import(pathToFileURL(join(root, 'lib/features/deduction/system.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 类太阳系 --')
{
  const r = sysMod.buildPlanetarySystem({ starMass: 1, planets: [{ name: '地球', a: 1, massEarth: 1, radiusEarth: 1, moons: [{ name: '月球', a: 0.00257 }] }, { name: '木星', a: 5.2, massEarth: 318, radiusEarth: 11.2 }] })
  assert('★ 地球周期 1 年', Math.abs(r.planets[0].periodYears - 1) < 0.01, String(r.planets[0].periodYears))
  assert('★ 地球希尔球 ≈ 0.01 AU', Math.abs(r.planets[0].hillAu - 0.01) < 0.001, String(r.planets[0].hillAu))
  assert('★ 月球周期 ≈ 0.075 年', Math.abs(r.planets[0].moons[0].periodYears - 0.0748) < 0.005, String(r.planets[0].moons[0].periodYears))
  assert('★ 月球不在洛希内/希尔外', r.planets[0].moons[0].insideRoche === false && r.planets[0].moons[0].outsideHill === false, '')
  assert('木星周期 ≈ 11.87 年', Math.abs(r.planets[1].periodYears - 11.87) < 0.05, String(r.planets[1].periodYears))
}

console.log('-- 2. 稳定性提示 --')
{
  const bad = sysMod.buildPlanetarySystem({ starMass: 1, planets: [{ name: 'A', a: 1, massEarth: 1, radiusEarth: 1 }, { name: 'B', a: 1.005, massEarth: 1, radiusEarth: 1 }] })
  assert('★ 行星太近 → 轨道可能交叉警告', bad.warnings.some((w) => w.includes('轨道可能交叉')), JSON.stringify(bad.warnings).slice(0, 100))
  const moonBad = sysMod.buildPlanetarySystem({ starMass: 1, planets: [{ name: '地球', a: 1, massEarth: 1, radiusEarth: 1, moons: [{ name: '贴脸卫', a: 0.00005 }, { name: '远卫', a: 0.5 }] }] })
  assert('★ 卫星在洛希内 → 警告', moonBad.warnings.some((w) => w.includes('洛希')), '')
  assert('★ 卫星超出希尔/3 → 警告', moonBad.warnings.some((w) => w.includes('希尔球/3')), '')
}

console.log('-- 3. 经 tool --')
{
  const out = await run({ operation: 'astro', astro: { action: 'system', system: { starMass: 1.2, planets: [{ name: '新地球', a: 1.3, massEarth: 1.1, moons: [{ name: '月', a: 0.003 }] }] } } })
  assert('★ system 可跑（标题为通用轨道模型）', out.ok === true && out.result.includes('通用轨道模型'), out.result.slice(0, 60))
  assert('输出含希尔球与卫星', out.result.includes('希尔球') && out.result.includes('月：'), out.result.slice(0, 200))
  const empty = await run({ operation: 'astro', astro: { action: 'system', system: { planets: [] } } })
  assert('空行星 → missing_params', empty.ok === false && empty.error.type === 'missing_params', '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
