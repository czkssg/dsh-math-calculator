/**
 * topology geometry 测试：距离 / 最短路径 / 视线 / 可达性。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-topo-geo-'))
const model = await import(pathToFileURL(join(root, 'lib/features/topology/model.js')).href)
const geo = await import(pathToFileURL(join(root, 'lib/features/topology/geometry.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol
function throwsOf(fn) { try { fn(); return null } catch (error) { return error } }

const nodes = [
  { id: '帝都', name: '帝都', kind: 'city', lat: 39.9, lon: 116.4, elevationM: 50 },
  { id: '港口', name: '东港', kind: 'port', lat: 31.2, lon: 121.5, elevationM: 0 },
  { id: '中转', name: '南洋中转港', kind: 'port', lat: -6, lon: 105, elevationM: 0 },
  { id: '煤田', name: '南极煤田', kind: 'mine', lat: -75, lon: 0, elevationM: 2000 },
  { id: '孤岛', name: '孤岛', kind: 'island', lat: 0, lon: -160 },
]
const edges = [
  { from: '帝都', to: '港口', kind: 'road', lengthKm: 200 },
  { from: '港口', to: '中转', kind: 'sea', lengthKm: 8000 },
  { from: '中转', to: '煤田', kind: 'sea', lengthKm: 3000 },
]
const t = model.buildTopology({ nodes, edges })

console.log('-- 1. 距离 --')
{
  const d = geo.distanceBetween(t, '帝都', '港口')
  assert('球面大圆距离（≈1067km）', near(d.km, 1067, 5) && d.method === 'haversine', d.method + ' ' + d.km)
  assert('★ 帝都→南极煤田 直线约 1.3 万 km', geo.distanceBetween(t, '帝都', '煤田').km > 12000, String(geo.distanceBetween(t, '帝都', '煤田').km))
  assert('未知节点 → unknown_symbol', throwsOf(() => geo.distanceBetween(t, '帝都', '不存在'))?.type === 'unknown_symbol', '')
}

console.log('-- 2. 最短路径（含地形/方式系数）--')
{
  const sea = geo.shortestRoute(t, '帝都', '煤田', 'sea')
  assert('★ 路径经港口与中转', JSON.stringify(sea.path) === JSON.stringify(['帝都', '港口', '中转', '煤田']), JSON.stringify(sea.path))
  assert('★ 沿路径实际长度 200+8000+3000 = 11200km', sea.km === 11200, String(sea.km))
  assert('★ sea 方式代价 = 200 + 8000×0.6 + 3000×0.6 = 6800', near(sea.cost, 6800, 1e-9), String(sea.cost))
  const road = geo.shortestRoute(t, '帝都', '煤田', 'road')
  assert('road 方式代价 = 全长 11200', near(road.cost, 11200, 1e-9), String(road.cost))
  assert('3 跳', sea.hops === 3, String(sea.hops))

  const unreachable = throwsOf(() => geo.shortestRoute(t, '帝都', '孤岛'))
  assert('★ 不可达 → no_solution（不静默给 0）', unreachable?.type === 'no_solution', unreachable?.type)
  assert('未知方式 → unknown_argument', throwsOf(() => geo.shortestRoute(t, '帝都', '煤田', 'teleport'))?.type === 'unknown_argument', '')
}

console.log('-- 3. 可达性预算 --')
{
  const reach = geo.reachableWithin(t, '帝都', 5000)
  assert('★ 5000km 内可达帝都/港口', reach.reachable.map((item) => item.id).sort().join(',') === ['帝都', '港口'].sort().join(','),
    JSON.stringify(reach.reachable))
  assert('★ 中转港 8200km、煤田 11200km 不可达', reach.unreachable.includes('中转') && reach.unreachable.includes('煤田'), JSON.stringify(reach.unreachable))
  assert('按距离排序', reach.reachable[0].km <= reach.reachable[reach.reachable.length - 1].km, '')
  assert('maxKm ≤ 0 → invalid_argument', throwsOf(() => geo.reachableWithin(t, '帝都', 0))?.type === 'invalid_argument', '')
}

console.log('-- 4. 视线与曲率 --')
{
  const sight = model.buildTopology({
    nodes: [
      { id: 'A', lat: 0, lon: 0, elevationM: 0 },
      { id: 'B', lat: 0, lon: 2, elevationM: 0 },
      { id: 'C', lat: 0, lon: 1, elevationM: 100 },
    ],
    edges: [],
  })
  const blocked = geo.sightline(sight, 'A', 'B')
  assert('★ 中间 100m 山丘挡住（曲率下沉约 966m + 100m）', blocked.blocked === true && blocked.obstruction === 'C', JSON.stringify(blocked))
  assert('★ 需要抬高约 1km 才能越过', blocked.requiredHeightM > 900, String(blocked.requiredHeightM))

  // 1.1km 内：曲率下沉约 0.05m，1.7m 眼高足以越过平地
  const clear = model.buildTopology({
    nodes: [
      { id: 'A', lat: 0, lon: 0, elevationM: 0 },
      { id: 'B', lat: 0, lon: 0.01, elevationM: 0 },
      { id: 'C', lat: 0, lon: 0.005, elevationM: 0 },
    ],
    edges: [],
  })
  assert('★ 近距离平地视线不被挡', geo.sightline(clear, 'A', 'B').blocked === false, JSON.stringify(geo.sightline(clear, 'A', 'B')))

  const noCoords = model.buildTopology({ nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 10, y: 0 }] })
  assert('★ 无经纬度做视线 → invalid_argument', throwsOf(() => geo.sightline(noCoords, 'A', 'B'))?.type === 'invalid_argument', '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
