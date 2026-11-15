/**
 * astro：天文历表（astronomy-engine）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-astro-'))
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

console.log('-- 1. 夏至北京 --')
{
  const out = await run({ operation: 'astro', astro: { action: 'rise-set', date: '2026-06-21T00:00:00Z', lat: 39.9, lon: 116.4 } })
  assert('★ 日出日落可算', out.ok === true && out.result.includes('日出'), out.result.slice(0, 100))
  assert('★ 日照时长约 14.9h', typeof out.value.dayLengthHours === 'number' && Math.abs(out.value.dayLengthHours - 14.9) < 0.5, String(out.value.dayLengthHours))
  const sun = await run({ operation: 'astro', astro: { action: 'sun', date: '2026-06-21T00:00:00Z', lat: 39.9, lon: 116.4 } })
  assert('★ 夏至太阳赤纬 23.44°', sun.ok === true && Math.abs(sun.value.sun.dec - 23.44) < 0.05, String(sun.value?.sun?.dec))
}

console.log('-- 2. 月相 --')
{
  const out = await run({ operation: 'astro', astro: { action: 'moon', date: '2026-06-21T00:00:00Z' } })
  assert('★ 月相可算（相位角 + 光照比例）', out.ok === true && out.result.includes('光照比例'), out.result.slice(0, 100))
  assert('光照比例 0–1', out.value.moon.illuminated >= 0 && out.value.moon.illuminated <= 1, String(out.value.moon.illuminated))
}

console.log('-- 3. 极昼/极夜与参数校验 --')
{
  const polar = await run({ operation: 'astro', astro: { action: 'rise-set', date: '2026-06-21T00:00:00Z', lat: 80, lon: 0 } })
  assert('★ 北极圈夏至 → 极昼', polar.ok === true && polar.result.includes('极昼'), polar.result.slice(0, 80))
  const bad = await run({ operation: 'astro', astro: { action: 'sun', lat: 120 } })
  assert('纬度越界 → invalid_argument', bad.ok === false && bad.error.type === 'invalid_argument', '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
