/**
 * 面状绕障（topology action:"avoid"）。
 *
 * 图上的最短路（route）解决不了「山/湖/禁飞区挡在中间」；这一套锁住：
 * 直线基线、绕行比、安全间距、非法起点、行星半径缩放、示例清单。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-avoid-'))
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
const FROM = { lat: 30, lon: 110 }
const TO = { lat: 31, lon: 111 }
const BOX = [[[110.35, 30.35], [110.65, 30.35], [110.65, 30.65], [110.35, 30.65]]]

console.log('-- 1. 直线与绕行 --')
{
  const free = await run({ operation: 'topology', topology: { action: 'avoid', fromPoint: FROM, toPoint: TO } })
  assert('★ 无障碍：长度约等于直线（≤1.1 倍）', free.ok === true && free.value.detourRatio <= 1.1 && free.value.detourRatio >= 0.99, JSON.stringify({ ratio: free.value?.detourRatio }))
  assert('无障碍：输出路径点', Array.isArray(free.value.points) && free.value.points.length >= 2, String(free.value?.points?.length))

  const blocked = await run({ operation: 'topology', topology: { action: 'avoid', fromPoint: FROM, toPoint: TO, obstacles: BOX } })
  assert('★ 矩形挡中间：绕行比 >1.05', blocked.ok === true && blocked.value.detourRatio > 1.05, JSON.stringify({ ratio: blocked.value?.detourRatio }))
  assert('绕行长度 > 直线', blocked.value.lengthKm > blocked.value.straightKm, '')
  assert('路径不穿过障碍（端点之外至少有一个点在障碍外）', blocked.value.points.some((p) => !(p.lon > 110.35 && p.lon < 110.65 && p.lat > 30.35 && p.lat < 30.65)), '')
}

console.log('-- 2. 安全间距与非法输入 --')
{
  const base = await run({ operation: 'topology', topology: { action: 'avoid', fromPoint: FROM, toPoint: TO, obstacles: BOX } })
  const safe = await run({ operation: 'topology', topology: { action: 'avoid', fromPoint: FROM, toPoint: TO, obstacles: BOX, safetyKm: 20 } })
  assert('★ 安全间距 20 km：路径更长', safe.ok === true && safe.value.lengthKm > base.value.lengthKm, JSON.stringify({ a: base.value?.lengthKm, b: safe.value?.lengthKm }))

  const inside = await run({ operation: 'topology', topology: { action: 'avoid', fromPoint: { lat: 30.5, lon: 110.5 }, toPoint: TO, obstacles: [[[110.4, 30.4], [110.6, 30.4], [110.6, 30.6], [110.4, 30.6]]] } })
  assert('★ 起点落在障碍内 → invalid_argument', inside.ok === false && inside.error?.type === 'invalid_argument', JSON.stringify(inside.error).slice(0, 100))

  const missing = await run({ operation: 'topology', topology: { action: 'avoid', fromPoint: FROM } })
  assert('缺 toPoint → missing_params', missing.ok === false && missing.error?.type === 'missing_params', JSON.stringify(missing.error?.type))
}

console.log('-- 3. 架空星球半径 --')
{
  const normal = await run({ operation: 'topology', topology: { action: 'avoid', fromPoint: FROM, toPoint: TO } })
  const big = await run({ operation: 'topology', topology: { action: 'avoid', fromPoint: FROM, toPoint: TO, planetRadiusKm: 12742 } })
  assert('★ 半径 ×2 → 路径长度约 ×2', Math.abs(big.value.lengthKm / normal.value.lengthKm - 2) < 0.05, String(big.value?.lengthKm / normal.value?.lengthKm))
}

console.log('-- 4. 示例清单 --')
{
  const examples = await run({ operation: 'topology', topology: { action: 'examples' } })
  assert('示例清单含 avoid', examples.ok === true && String(examples.result).includes('"avoid"'), String(examples.result).slice(0, 60))
}

console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
