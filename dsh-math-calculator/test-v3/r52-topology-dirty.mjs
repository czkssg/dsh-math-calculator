/**
 * R52 拓扑脏图边界：自环/反向重复/重复 id/悬空边/无坐标/经纬越界。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-r52-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
const N = [{ id: 'A', lon: 0, lat: 0 }, { id: 'B', lon: 10, lat: 0 }]
const model = (nodes, edges) => ({ operation: 'topology', topology: { action: 'model', nodes, edges } })
console.log('-- 1. 四类非法输入都要可读（不再是 [object Object]）--')
{
  const selfLoop = await run(model(N, [{ from: 'A', to: 'A' }]))
  assert('★ 自环 → invalid_argument 且说明', selfLoop.ok === false && selfLoop.error.type === 'invalid_argument' && String(selfLoop.error.message).includes('自环'), JSON.stringify(selfLoop.error).slice(0, 80))
  const dupId = await run(model([{ id: 'A', lon: 0, lat: 0 }, { id: 'A', lon: 10, lat: 0 }], []))
  assert('★ 重复 id → 可读错误', dupId.ok === false && String(dupId.error.message).includes('重复'), String(dupId.error?.message).slice(0, 40))
  const dangling = await run(model(N, [{ from: 'A', to: 'X' }]))
  assert('★ 悬空边 → 可读错误', dangling.ok === false && String(dangling.error.message).includes('不存在'), String(dangling.error?.message).slice(0, 40))
  const reversed = await run(model(N, [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }]))
  assert('★ 反向重复 → 不再崩（视为同一条边）', reversed.ok === true, String(reversed.error ? JSON.stringify(reversed.error) : 'ok'))
  assert('★ 反向重复有 findings 说明', String(reversed.result).includes('重复'), String(reversed.result).slice(0, 100))
}
console.log('-- 2. 同向重复仍去重（不回归）--')
{
  const dup = await run(model(N, [{ from: 'A', to: 'B' }, { from: 'A', to: 'B' }]))
  assert('★ 同向重复 → 只保留一条', dup.ok === true && String(dup.result).includes('重复'), '')
}
console.log('-- 3. 两个静默边界 --')
{
  const noCoord = await run(model([{ id: 'A' }, { id: 'B' }], [{ from: 'A', to: 'B' }]))
  assert('★ 无坐标 → 提示「长度不可信」', String(noCoord.result).includes('缺坐标'), String(noCoord.result).slice(0, 100))
  const badLat = await run(model([{ id: 'A', lon: 400, lat: 200 }, { id: 'B', lon: 0, lat: 0 }], [{ from: 'A', to: 'B' }]))
  assert('★ 纬度越界 → 报错（不再算出 15127 km）', badLat.ok === false && String(badLat.error.message).includes('越界'), String(badLat.error?.message).slice(0, 50))
  const badLon = await run(model([{ id: 'A', lon: 400, lat: 0 }, { id: 'B', lon: 0, lat: 0 }], [{ from: 'A', to: 'B' }]))
  assert('★ 经度越界 → 报错', badLon.ok === false && String(badLon.error.message).includes('越界'), '')
  const okLat = await run(model([{ id: 'A', lon: -180, lat: 90 }, { id: 'B', lon: 180, lat: -90 }], [{ from: 'A', to: 'B' }]))
  assert('★ 边界值（±90/±180）仍放行', okLat.ok === true, String(okLat.error ? JSON.stringify(okLat.error) : 'ok'))
}
console.log('-- 4. 正常地球拓扑不受影响 --')
{
  const cities = [
    { id: '北京', lon: 116.4, lat: 39.9 }, { id: '上海', lon: 121.5, lat: 31.2 },
    { id: '东京', lon: 139.7, lat: 35.7 }, { id: '纽约', lon: -74.0, lat: 40.7 },
  ]
  const routes = [{ from: '北京', to: '上海' }, { from: '上海', to: '东京' }, { from: '东京', to: '纽约' }]
  const m = await run(model(cities, routes))
  assert('★ 四城市三航线 → 正常', m.ok === true && String(m.result).includes('节点 4'), String(m.result).slice(0, 60))
  const r = await run({ operation: 'topology', topology: { action: 'route', nodes: cities, edges: routes, from: '北京', to: '纽约' } })
  assert('★ route 仍可算路径', r.ok === true && String(r.result).includes('北京'), String(r.result).slice(0, 80))
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
