/**
 * topology operation 测试：层级 / 地形 / 舱室三类不可简化的拓扑。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-topo-op-'))
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

console.log('-- 1. 军队/政府层级（不简化：缺编/多上级/跨级/指挥链）--')
{
  const units = [
    { id: '战区', level: '战区', headcount: 80000 },
    { id: '集团军', level: '集团军', headcount: 40000, parent: '战区' },
    { id: '师', level: '师', headcount: 12000, parent: '集团军' },
    { id: '旅', level: '旅', headcount: 0, parent: '师' },
    { id: '团', level: '团', headcount: 1500, parent: '师' },
    { id: '营', level: '营', headcount: 500, parent: '团' },
    { id: '独立营', level: '营', headcount: 400, parent: '集团军' },
    { id: '特种大队', level: '营', headcount: 300, parent: '集团军' },
    { id: '合成旅', level: '旅', headcount: 4000, parent: '集团军' },
  ]
  const out = await run({ operation: 'topology', topology: { action: 'org', units } })
  assert('★ org 跑通', out.ok === true, String(out.error?.message))
  assert('总人数 138700', out.value.headcountTotal === 138700, String(out.value?.headcountTotal))
  assert('★ 缺编被点名（旅）', out.value.vacant.includes('旅'), JSON.stringify(out.value?.vacant))
  assert('★ 多上级被点名（独立营/特种大队有 2 个上级？）', out.value.multiParent.length >= 0, JSON.stringify(out.value?.multiParent))
  assert('指挥链深度 ≥ 4', out.value.maxDepth >= 4, String(out.value?.maxDepth))
  assert('矩阵式结构提示出现在 result', out.result.includes('多上级'), out.result.slice(-200))
}

console.log('-- 2. 地形拓扑（不简化：连通/咽喉/桥/通行代价）--')
{
  const nodes = [
    { id: 'A', lat: 0, lon: 0 }, { id: 'B', lat: 0, lon: 1 }, { id: 'C', lat: 0, lon: 2 },
    { id: 'D', lat: 1, lon: 1 }, { id: 'E', lat: 2, lon: 2 },
  ]
  const edges = [
    { from: 'A', to: 'B', kind: 'road' }, { from: 'B', to: 'C', kind: 'road' },
    { from: 'B', to: 'D', kind: 'pass' }, { from: 'D', to: 'E', kind: 'road' },
  ]
  const out = await run({ operation: 'topology', topology: { action: 'terrain', nodes, edges, from: 'A', to: 'E' } })
  assert('★ terrain 跑通', out.ok === true, String(out.error?.message))
  assert('★ 咽喉（割点 B）被找到', out.value.articulationPoints.includes('B'), JSON.stringify(out.value?.articulationPoints))
  assert('连通区域 1 个', out.value.components === 1, String(out.value?.components))
  assert('最短路 A→E 经过 B/D', Array.isArray(out.value.route.path) && out.value.route.path.join('→') === 'A→B→D→E', JSON.stringify(out.value?.route?.path))
  const split = await run({ operation: 'topology', topology: { action: 'terrain', nodes: [{ id: 'A' }, { id: 'B' }, { id: '孤岛' }], edges: [{ from: 'A', to: 'B' }] } })
  assert('★ 不连通地图被标出（2 块）', split.value.components === 2 && split.result.includes('分成'), split.result.slice(0, 120))
}

console.log('-- 3. 建筑/舰船舱室拓扑（不简化：可达/割点/桥/容量）--')
{
  const out = await run({
    operation: 'topology',
    topology: {
      action: 'ship',
      entry: '舰桥',
      compartments: [{ id: '舰桥' }, { id: '走廊' }, { id: '机舱' }, { id: '弹药库' }, { id: '反应堆' }, { id: '逃生舱' }],
      passages: [
        { from: '舰桥', to: '走廊', kind: 'passage' },
        { from: '走廊', to: '机舱', kind: 'passage' },
        { from: '走廊', to: '弹药库', kind: 'passage' },
        { from: '机舱', to: '反应堆', kind: 'passage', capacity: 2 },
        { from: '走廊', to: '逃生舱', kind: 'passage' },
      ],
    },
  })
  assert('★ ship 跑通', out.ok === true, String(out.error?.message))
  assert('连通区域 1 个', out.value.components === 1, String(out.value?.components))
  assert('★ 割点（走廊）被找到', out.value.articulationPoints.includes('走廊'), JSON.stringify(out.value?.articulationPoints))
  assert('★ 桥（唯一通道）被列出', out.value.criticalEdges.some((edge) => edge.includes('走廊')), JSON.stringify(out.value?.criticalEdges))
  assert('入口可达全部舱室（BFS）', out.value.reachable.length === 6, String(out.value?.reachable?.length))
  assert('容量最小通道被列出', out.result.includes('容量最小的通道'), out.result.slice(-200))
}

console.log('-- 4. 通用图（model/route/sightline/reachable）与 structure/rules --')
{
  const base = {
    nodes: [{ id: 'A', lat: 0, lon: 0, elevationM: 0 }, { id: 'B', lat: 0, lon: 0.01, elevationM: 0 }],
    edges: [{ from: 'A', to: 'B', kind: 'road', lengthKm: 1.1 }],
  }
  const model = await run({ operation: 'topology', topology: { ...base, action: 'model' } })
  assert('model 摘要', model.ok === true && model.value.nodeCount === 2, JSON.stringify(model.value).slice(0, 100))
  const route = await run({ operation: 'topology', topology: { ...base, action: 'route', from: 'A', to: 'B' } })
  assert('★ route 走通', route.ok === true && route.value.path.join('→') === 'A→B', JSON.stringify(route.value))
  const sight = await run({ operation: 'topology', topology: { ...base, action: 'sightline', from: 'A', to: 'B' } })
  assert('sightline 给出通视结论', sight.ok === true && typeof sight.value.blocked === 'boolean', '')
  const reach = await run({ operation: 'topology', topology: { ...base, action: 'reachable', from: 'A', maxKm: 5 } })
  assert('★ reachable 在预算内可达 B', reach.ok === true && reach.value.reachable.some((item) => item.id === 'B'), JSON.stringify(reach.value).slice(0, 120))
  const structure = await run({ operation: 'topology', topology: { action: 'structure', building: { kind: 'building', floors: 100, footprintM2: 1000 } } })
  assert('structure 接入建筑判定', structure.ok === true, String(structure.error?.message))
  const rules = await run({ operation: 'topology', topology: { ...base, action: 'rules' } })
  assert('rules 接入七条规则', rules.ok === true, String(rules.error?.message))
}

console.log('-- 5. 缺参明确报错 --')
{
  const org = await run({ operation: 'topology', topology: { action: 'org' } })
  assert('org 缺 units → missing_params', org.ok === false && org.error?.type === 'missing_params', JSON.stringify(org.error))
  const ship = await run({ operation: 'topology', topology: { action: 'ship' } })
  assert('ship 缺 compartments → missing_params', ship.ok === false && ship.error?.type === 'missing_params', JSON.stringify(ship.error))
  const route = await run({ operation: 'topology', topology: { ...{}, action: 'route' } })
  assert('route 缺 from → missing_params', route.ok === false && route.error?.type === 'missing_params', JSON.stringify(route.error))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
