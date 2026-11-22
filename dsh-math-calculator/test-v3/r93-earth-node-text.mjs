/**
 * 真实地球历史节点：文本地图（给 AI 读）+ 局部放大 + 矢量可选。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-node-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
console.log('-- 1. 文本地图（默认，给 AI 读）--')
{
  const out = await run({ operation: 'world-map', earthNode: 'pre-ww1', asciiWidth: 100 })
  assert('★ 出文本地图', out.ok === true && String(out.result).includes('一战前夕'), String(out.error?.message))
  assert('★ 体积小（< 20K 字符）', String(out.result).length < 20000, String(String(out.result).length))
  assert('★ 有坐标尺（经度刻度）', String(out.result).includes('+') && /-\d{2,3}/.test(String(out.result)), '')
  assert('★ 有图例与格数统计', String(out.result).includes('图例') && String(out.result).includes('格）'), '')
  assert('★ 政权格数非零', Object.values(out.value?.cells ?? {}).some((n) => n > 10), JSON.stringify(out.value?.cells))
}
console.log('-- 2. 各节点可用 --')
for (const node of ['medieval', 'pre-ww1', 'pre-ww2', 'cold-war']) {
  const out = await run({ operation: 'world-map', earthNode: node, asciiWidth: 80 })
  assert('★ ' + node + ' 可生成', out.ok === true && String(out.result).length > 1000, String(out.error?.message))
}
console.log('-- 3. 局部放大 --')
{
  const europe = await run({ operation: 'world-map', earthNode: 'pre-ww1', asciiWidth: 90, viewBox: [-15, 60, 45, 30] })
  assert('★ viewBox 生效', europe.ok === true && String(europe.result).includes('经度 -15°…45°'), String(europe.result).slice(0, 120))
  assert('★ 放大后欧洲政权可见', String(europe.result).includes('德意志帝国'), '')
  const global = await run({ operation: 'world-map', earthNode: 'pre-ww1', asciiWidth: 90 })
  assert('★ 放大后与全球视图不同', String(europe.result) !== String(global.result), '')
}
console.log('-- 4. 矢量可选 / 错误 --')
{
  const svg = await run({ operation: 'world-map', earthNode: 'pre-ww1', format: 'svg', svgWidth: 1200 })
  assert('★ format:svg 才出矢量', svg.ok === true && String(svg.value?.svg ?? '').startsWith('<svg'), String(svg.error?.message))
  const bad = await run({ operation: 'world-map', earthNode: 'no-such-node' })
  assert('未知节点 → unknown_symbol', bad.ok === false && bad.error?.type === 'unknown_symbol', String(bad.error?.type))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
