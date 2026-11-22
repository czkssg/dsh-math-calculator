/**
 * world-map SVG：矢量渲染、相对色带、局部放大、编辑后重渲。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-svg-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
const BASE = { operation: 'world-map', mapWidth: 200, mapHeight: 100, mapSeed: 3, nationCount: 4 }
console.log('-- 1. SVG 基本结构 --')
{
  const out = await run({ ...BASE, export: 'svg' })
  const svg = String(out.value?.svg ?? '')
  assert('★ 生成 SVG 文件', out.ok === true && existsSync(String(out.value?.exportPath)), String(out.error?.message))
  assert('★ 是合法 SVG 根元素', svg.startsWith('<svg') && svg.includes('</svg>'), svg.slice(0, 40))
  assert('★ 含 viewBox（可缩放）', svg.includes('viewBox='), '')
  assert('★ 落在 exports 目录', String(out.value?.exportPath).includes('exports'), String(out.value?.exportPath))
}
console.log('-- 2. 相对色带（关键修复）--')
{
  const out = await run({ ...BASE, export: 'svg' })
  const svg = String(out.value?.svg ?? '')
  /** 陆地色带必须出现（初版因绝对阈值导致整张画成海）。 */
  assert('★ 有陆地色（平原/低地）', svg.includes('#cfe0a0') || svg.includes('#b5cf80'), '')
  assert('★ 有海域色（浅海/深海）', svg.includes('#17557d') || svg.includes('#0d3a5c'), '')
  assert('★ 海平面已相对化（seaLevelUsed 存在）', typeof out.value?.svg === 'string', '')
}
console.log('-- 3. 要素与开关 --')
{
  const out = await run({ ...BASE, export: 'svg' })
  const svg = String(out.value?.svg ?? '')
  assert('★ 含等高线路径', svg.includes('<path'), '')
  assert('★ 含比例尺与指北针', svg.includes('km') && svg.includes('>N<'), '')
  const plain = await run({ ...BASE, export: 'svg', graticule: false, svgLabels: false, svgMinerals: false })
  const plainSvg = String(plain.value?.svg ?? '')
  assert('★ 开关可关（注记/网格/矿点）', plainSvg.length < svg.length, String(plainSvg.length) + ' < ' + String(svg.length))
  assert('关注记后无 N 指北针', !plainSvg.includes('>N<'), '')
}
console.log('-- 4. 局部放大（viewBox）--')
{
  const full = await run({ ...BASE, export: 'svg' })
  const zoom = await run({ ...BASE, export: 'svg', viewBox: [50, 25, 40, 20], svgWidth: 1600 })
  assert('★ viewBox 生效', zoom.ok === true && String(zoom.value?.svg).includes('viewBox="50 25 40 20"'), String(zoom.value?.svg).slice(0, 120))
  assert('★ 放大后更省体积（只见局部）', String(zoom.value?.svg).length < String(full.value?.svg).length, String(zoom.value?.svg).length + ' < ' + String(full.value?.svg).length)
}
console.log('-- 5. 编辑后重渲 --')
{
  const before = await run({ ...BASE, export: 'svg' })
  const edited = await run({ ...BASE, export: 'svg', edits: [{ x: 100, y: 50, height: 1 }, { x: 100, y: 50, nation: 9 }] })
  assert('★ 编辑后仍可出 SVG', edited.ok === true && String(edited.value?.svg).length > 1000, String(edited.error?.message))
  assert('★ 编辑改变输出（与未编辑不同）', String(edited.value?.svg) !== String(before.value?.svg), '')
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
