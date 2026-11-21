/**
 * 预存真实地球（历史时期）：1500/1800/1900/1945/2000。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-earth-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
console.log('-- 1. 五个时期 --')
for (const era of ['1500', '1800', '1900', '1945', '2000']) {
  const out = await run({ operation: 'world-map', earthEra: era, asciiWidth: 100 })
  assert('★ ' + era + ' 可生成（政权 ≥5、图 ≥20 行）', out.ok === true && (out.value?.powers?.length ?? 0) >= 5 && String(out.value?.ascii).split('\n').length >= 20, String(out.value?.powers?.length))
}
console.log('-- 2. 内容与口径 --')
{
  const out = await run({ operation: 'world-map', earthEra: '1500', asciiWidth: 100 })
  assert('★ 陆地占比合理（0.2–0.45）', out.value?.landRatio > 0.2 && out.value?.landRatio < 0.45, String(out.value?.landRatio))
  assert('★ 图例含政权列表', String(out.value?.ascii).includes('明') && String(out.value?.ascii).includes('奥斯曼'), '')
  assert('★ 声明「简化轮廓，非精确测绘」', String(out.value?.ascii).includes('非精确测绘'), '')
  const unknown = await run({ operation: 'world-map', earthEra: '1999' })
  assert('未知时期 → unknown_symbol', unknown.ok === false && unknown.error?.type === 'unknown_symbol', String(unknown.error?.type))
}
console.log('-- 3. 与随机地图互不干扰 --')
{
  const random = await run({ operation: 'world-map', mapWidth: 200, mapHeight: 100, mapSeed: 3 })
  assert('不给 earthEra → 仍走随机大陆', random.ok === true && random.value?.borders !== undefined, '')
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
