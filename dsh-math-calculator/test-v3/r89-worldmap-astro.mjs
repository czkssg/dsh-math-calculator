/**
 * world-map 国界/地形/矿产编辑 + astro 日照时长修复回归。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-wm-astro-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
const MAP = { operation: 'world-map', mapWidth: 200, mapHeight: 100, mapSeed: 7, nationCount: 4, ascii: true }
console.log('-- 1. 地形图 / 国界图 --')
{
  const out = await run(MAP)
  assert('★ 地形 ASCII 可画', out.ok === true && typeof out.value?.ascii === 'string' && out.value.ascii.split('\n').length > 10, '')
  const terrainChars = new Set(String(out.value?.ascii).replace(/\n/g, '').split(''))
  assert('★ 地形图含分层字符（海洋/平原/山地等）', terrainChars.size >= 5, Array.from(terrainChars).join(''))
  assert('★ 国界 ASCII 可画', typeof out.value?.asciiBorders === 'string' && out.value.asciiBorders.split('\n').length > 10, '')
  assert('★ 国界统计存在', typeof out.value?.borders?.cells === 'number' && out.value.borders.cells > 0 && out.value.borders.nations === 4, JSON.stringify(out.value?.borders))
  assert('★ 声明：随机大陆不作底图', String(out.value?.notes).includes('随机生成的大陆'), '')
  assert('图例在 notes 里', String(out.value?.notes).includes('图例'), '')
}
console.log('-- 2. 编辑矿产 --')
{
  const set = await run({ ...MAP, edits: [{ x: 10, y: 10, mineral: 3 }] })
  const hit = set.value?.minerals?.find((m) => m.x === 10 && m.y === 10)
  assert('★ edits.mineral=3 → 该格矿 3 级', hit !== undefined && hit.grade === 3, JSON.stringify(hit))
  const clear = await run({ ...MAP, edits: [{ x: 10, y: 10, mineral: 3 }, { x: 10, y: 10, mineral: 0 }] })
  assert('★ edits.mineral=0 清除该格矿', clear.value?.minerals?.find((m) => m.x === 10 && m.y === 10) === undefined, '')
}
console.log('-- 3. 编辑国家 → 国界变化 --')
{
  const base = await run(MAP)
  const edited = await run({ ...MAP, edits: [{ x: 100, y: 50, nation: 9 }] })
  assert('★ 改国家归属改变国界段数', edited.value?.borders?.cells !== base.value?.borders?.cells, String(base.value?.borders?.cells) + ' → ' + String(edited.value?.borders?.cells))
}
console.log('-- 4. astro 日照时长（修复回归）--')
{
  const summer = await run({ operation: 'astro', astro: { action: 'rise-set', date: '2026-06-21T00:00:00Z', lat: 45, lon: 0 } })
  assert('★ lat45 夏至 15–16h（旧实现 39.62h）', summer.ok === true && summer.value.dayLengthHours > 15 && summer.value.dayLengthHours < 16, String(summer.value?.dayLengthHours))
  const winter = await run({ operation: 'astro', astro: { action: 'rise-set', date: '2026-12-21T00:00:00Z', lat: 45, lon: 0 } })
  assert('★ lat45 冬至 8–9.5h（旧实现 32.78h）', winter.ok === true && winter.value.dayLengthHours > 8 && winter.value.dayLengthHours < 9.5, String(winter.value?.dayLengthHours))
  assert('★ 正午太阳高度合理（lat45 夏 >60°）', summer.value.noonAltitude > 60, String(summer.value?.noonAltitude))
  const polarDay = await run({ operation: 'astro', astro: { action: 'rise-set', date: '2026-06-21T00:00:00Z', lat: 70, lon: 0 } })
  assert('★ lat70 夏至极昼 24h', polarDay.ok === true && polarDay.value.dayLengthHours >= 23.9 && polarDay.value.polar === true, String(polarDay.value?.dayLengthHours))
  const polarNight = await run({ operation: 'astro', astro: { action: 'rise-set', date: '2026-12-21T00:00:00Z', lat: 70, lon: 0 } })
  assert('★ lat70 冬至极夜 0h', polarNight.ok === true && polarNight.value.dayLengthHours <= 0.1, String(polarNight.value?.dayLengthHours))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
