/**
 * 可视化测试：DAG 布局 + 相图热力图（纯 SVG / CSS，无第三方库）。
 */
import { layoutGraph, edgePath, NODE_W, GAP_X } from '../lib/graph-layout.js'
import { buildHeatmap, linspace, detectNarrowWindow } from '../lib/heatmap.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

console.log('-- 1. 分层布局 --')
{
  const edges = [
    { from: 'A', to: 'B' },
    { from: 'A', to: 'C' },
    { from: 'B', to: 'D' },
  ]
  const layout = layoutGraph(edges)
  // A/B/C/D 共 4 个节点（边连接的是 A→B、A→C、B→D）
  assert('4 个节点', layout.nodes.length === 4, String(layout.nodes.length))
  assert('3 条边', layout.edges.length === 3, String(layout.edges.length))
  assert('有坐标', layout.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)))
  assert('有画布尺寸', layout.width > 0 && layout.height > 0,
    layout.width.toFixed(0) + '×' + layout.height.toFixed(0))

  // 分层正确性：D 在最底层（depth 0），A 在最上层
  const dNode = layout.nodes.find((n) => n.id === 'D')
  const aNode = layout.nodes.find((n) => n.id === 'A')
  assert('基础量 depth 更小', dNode.depth < aNode.depth,
    'D=' + dNode.depth + ' A=' + aNode.depth)
  // 基础量在下方（y 更大）
  assert('基础量画在下方', dNode.y > aNode.y, dNode.y + ' > ' + aNode.y)
}

console.log('-- 2. 焦点过滤 --')
{
  const edges = [
    { from: 'A', to: 'B' },
    { from: 'X', to: 'Y' },
  ]
  const all = layoutGraph(edges)
  const focused = layoutGraph(edges, 'A')
  assert('全图 2 条边', all.edges.length === 2)
  assert('聚焦后只剩相关边', focused.edges.length === 1, String(focused.edges.length))
  assert('聚焦后节点减少', focused.nodes.length < all.nodes.length)
}

console.log('-- 3. 节点上限（防卡死）--')
{
  const many = []
  for (let index = 0; index < 200; index += 1) many.push({ from: 'n' + index, to: 'n' + (index + 1) })
  const layout = layoutGraph(many, undefined, 20)
  assert('节点数被截断到 20', layout.nodes.length <= 20, String(layout.nodes.length))
}

console.log('-- 4. 空图与成环 --')
{
  const empty = layoutGraph([])
  assert('空图不崩', empty.nodes.length === 0 && empty.width === 0)

  // 成环不应无限递归
  const cycle = [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }]
  const layout = layoutGraph(cycle)
  assert('成环不崩', layout.nodes.length === 2, String(layout.nodes.length))
}

console.log('-- 5. 贝塞尔路径 --')
{
  const path = edgePath({ from: 'a', to: 'b', x1: 10, y1: 20, x2: 30, y2: 80 })
  assert('是合法 SVG path', path.startsWith('M '), path)
  assert('含二次控制点', path.includes('C '))
}

console.log('-- 6. 热力图 --')
{
  const xs = linspace(0, 1, 3)
  const ys = linspace(0, 1, 2)
  const map = buildHeatmap(xs, ys, (x, y) => ({
    level: x < 0.5 ? 'ok' : 'danger',
    note: 'x=' + x + ' y=' + y,
  }))
  assert('格子数 = 3×2', map.cells.length === 6, String(map.cells.length))
  assert('有行列表值', map.xValues.length === 3 && map.yValues.length === 2)
  // xs = [0, 0.5, 1]，只有 x=0 满足 x<0.5，所以每行 1 绿 2 红，两行 = 2 绿 4 红
  assert('统计正确', map.summary.ok === 2 && map.summary.danger === 4,
    JSON.stringify(map.summary))
  assert('每格有说明', map.cells.every((c) => c.note.length > 3))
}

console.log('-- 7. 求值抛错时降级 --')
{
  const map = buildHeatmap([1], [1], () => { throw new Error('炸了') })
  assert('抛错标为 unknown', map.cells[0].level === 'unknown', map.cells[0].level)
  assert('记下原因', map.cells[0].note.includes('炸了'), map.cells[0].note)
}

console.log('-- 8. 微调警告 --')
{
  // 100 格里只有 2 格是允许的 → 极窄
  const cells = []
  for (let index = 0; index < 100; index += 1) {
    cells.push({ row: 0, col: index, x: index, y: 0, level: index < 2 ? 'ok' : 'danger', note: '' })
  }
  const narrow = detectNarrowWindow(cells)
  assert('识别为极窄', narrow.narrow === true, narrow.safeRatio.toFixed(3))
  assert('给出建议', narrow.note.includes('备选'), narrow.note)

  const wide = cells.map((c, i) => ({ ...c, level: i < 80 ? 'ok' : 'danger' }))
  assert('宽区间不报警', detectNarrowWindow(wide).narrow === false)
}

console.log('-- 9. linspace --')
{
  const arr = linspace(0, 10, 5)
  assert('5 个点', arr.length === 5)
  assert('首尾正确', arr[0] === 0 && arr[4] === 10, arr.join(','))
  assert('最少 2 点', linspace(0, 1, 1).length === 2)
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
