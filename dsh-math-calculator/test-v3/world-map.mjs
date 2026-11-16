/**
 * 全球地图模拟：地形/河流/矿产/国家，可编辑。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-map-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const wm = await import(pathToFileURL(join(root, 'lib/features/deduction/world-map.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
console.log('-- 1. 海陆比可控 --')
{
  const earth = wm.generateWorldMap({ seed: 7, seaLevel: 0.29, ascii: false })
  assert('★ 陆地目标 0.29 → 实际 ≈29%', Math.abs(earth.stats.landRatio - 0.29) < 0.01, String(earth.stats.landRatio))
  const huge = wm.generateWorldMap({ seed: 7, seaLevel: 0.6, ascii: false })
  assert('★ 陆地目标 0.6 → 实际 ≈60%', Math.abs(huge.stats.landRatio - 0.6) < 0.01, String(huge.stats.landRatio))
}
console.log('-- 2. 地形分类 --')
{
  const r = wm.generateWorldMap({ seed: 7, width: 180, height: 90, ascii: false })
  const kinds = new Set(r.terrain.flat())
  assert('★ 有海/陆/山地/平原多类', kinds.has('ocean') && kinds.has('mountain') && kinds.has('plain'), Array.from(kinds).join(','))
  assert('山地占比合理（0–30%）', r.stats.mountainRatio > 0 && r.stats.mountainRatio < 0.3, String(r.stats.mountainRatio))
}
console.log('-- 3. 河流与矿产 --')
{
  const r = wm.generateWorldMap({ seed: 7, riverCount: 20, ascii: false })
  assert('★ 有河流且是格点序列', r.rivers.length > 0 && Array.isArray(r.rivers[0]) && r.rivers[0].length >= 3, String(r.rivers.length))
  assert('★ 有矿产且带类型', r.minerals.length > 0 && typeof r.minerals[0].kind === 'string', String(r.minerals.length))
  const kinds = new Set(r.minerals.map((m) => m.kind))
  assert('矿产种类多样（≥3 种）', kinds.size >= 3, Array.from(kinds).join(','))
}
console.log('-- 4. 国家分区 --')
{
  const r = wm.generateWorldMap({ seed: 7, width: 180, height: 90, nationCount: 6, ascii: false })
  assert('★ 国家数 = 6', r.stats.nationCount === 6, String(r.stats.nationCount))
  assert('陆地格有国家归属', r.nations.some((row) => row.some((cell) => cell >= 0)), '')
}
console.log('-- 5. 可编辑 --')
{
  const edited = wm.generateWorldMap({ seed: 7, ascii: false, edits: [{ x: 5, y: 5, height: 1 }, { x: 6, y: 5, nation: 42 }, { x: 7, y: 5, seaLevel: 0.5 }] })
  assert('★ 改高度生效（该格 1.0 → 陆地）', edited.heights[5][5] === 1, String(edited.heights[5][5]))
  assert('★ 改国家归属生效', edited.nations[5][6] === 42, String(edited.nations[5][6]))
  assert('★ 改海陆（seaLevel 0.5）→ 陆地比上升', edited.stats.landRatio > 0.4, String(edited.stats.landRatio))
}
console.log('-- 6. 经 tool --')
{
  const out = await run({ operation: 'world-map', seed: 7, nationCount: 6, riverCount: 12, ascii: false })
  assert('★ world-map 经 tool', out.ok === true && out.result.includes('全球地图'), out.result.slice(0, 60))
  assert('★ 默认 720×360（高精度）', out.value.width === 720 && out.value.height === 360, JSON.stringify({ w: out.value.width, h: out.value.height }))
  assert('★ 大网格输出量化（heightsPacked）', typeof out.value.heightsPacked === 'string' && out.value.heights.length === 0, '')
  assert('value 含 heights/terrain/nations', Array.isArray(out.value.heights) && Array.isArray(out.value.nations), '')
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
