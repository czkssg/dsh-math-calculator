/**
 * DAG 画布：原生 SVG 手写的依赖图。
 *
 * @module dsh-math-calculator/graph-layout
 * @description
 * 方案 2.1 要求可视化节点图。但本项目有一条硬约束：
 * **client.js 是单文件、无 import、无打包**，引不进 React Flow 之类的库。
 *
 * 所以这里**手写布局算法 + 用 SVG 画线**。SVG 元素在 react 里就是普通标签
 * （`h('svg', …)`、`h('path', …)`），不需要任何库。
 *
 * ## 布局算法：分层 + 同层均分
 *
 * 依赖图天然是分层的（常数 → P1 → P2 → …），所以用最简单的分层布局：
 *   1. 按「距离根节点的最长路径」给每个节点算层号；
 *   2. 同层节点等距横向排开；
 *   3. 层与层之间纵向留白。
 *
 * 比力导向布局简单得多，但对**分层依赖图**效果反而更好——
 * 力导向会把它画成一团，而分层布局一眼就能看出「谁依赖谁」。
 */

/** 图中的一个节点。 */
export interface GraphNode {
  /** 量名。 */
  id: string
  /** 层号（0 = 最底层）。 */
  depth: number
  /** 画布坐标。 */
  x: number
  y: number
  /** 它依赖多少个上游（用于决定边框粗细）。 */
  incoming: number
}

/** 图中的一条边。 */
export interface GraphEdge {
  from: string
  to: string
  /** 起点坐标（上游）。 */
  x1: number
  y1: number
  /** 终点坐标（下游）。 */
  x2: number
  y2: number
}

/** 布局结果。 */
export interface GraphLayout {
  nodes: GraphNode[]
  edges: GraphEdge[]
  width: number
  height: number
  /** 最多几层。 */
  maxDepth: number
}

/** 节点宽度（像素）。 */
export const NODE_W = 108
/** 节点高度（像素）。 */
export const NODE_H = 24
/** 同层节点之间的横向间距。 */
export const GAP_X = 14
/** 层与层之间的纵向间距。 */
export const GAP_Y = 56
/** 画布四周留白。 */
export const PAD = 16

/**
 * 把依赖边表算成可画的坐标。
 *
 * @param rawEdges - 形如 { from: 下游, to: 上游 } 的边
 * @param focus - 只画与它相关的节点（省略则画全部）
 * @param maxNodes - 最多画多少个节点（防止图太大卡住界面）
 * @returns 布局结果
 */
export function layoutGraph(
  rawEdges: Array<{ from: string; to: string }>,
  focus?: string,
  maxNodes = 40,
): GraphLayout {
  // ① 挑出要画的节点：若给了 focus，只留它的上下游闭包
  let edges = rawEdges
  if (focus) {
    const related = new Set<string>([focus])
    let changed = true
    while (changed) {
      changed = false
      for (const edge of rawEdges) {
        if (related.has(edge.from) && !related.has(edge.to)) { related.add(edge.to); changed = true }
        if (related.has(edge.to) && !related.has(edge.from)) { related.add(edge.from); changed = true }
      }
    }
    edges = rawEdges.filter(function (e) { return related.has(e.from) && related.has(e.to) })
  }

  // ② 节点集合（超限就截断，宁可少画也不要卡死）
  const names = new Set<string>()
  for (const edge of edges) {
    names.add(edge.from)
    names.add(edge.to)
    if (names.size >= maxNodes) break
  }
  const keep = Array.from(names).slice(0, maxNodes)
  const keepSet = new Set(keep)
  edges = edges.filter(function (e) { return keepSet.has(e.from) && keepSet.has(e.to) })
  if (edges.length === 0) return { nodes: [], edges: [], width: 0, height: 0, maxDepth: 0 }

  // ③ 算层号：深度 = 到最底层的距离（沿「依赖」方向走）
  const parents = new Map<string, string[]>()
  for (const edge of edges) {
    const list = parents.get(edge.from) ?? []
    list.push(edge.to)
    parents.set(edge.from, list)
  }

  const depthOf = new Map<string, number>()
  const visiting = new Set<string>()
  function computeDepth(name: string): number {
    if (depthOf.has(name)) return depthOf.get(name) as number
    // 防止成环：正在访问的节点先按 0 处理
    if (visiting.has(name)) return 0
    visiting.add(name)
    const ups = parents.get(name) ?? []
    let depth = 0
    for (const up of ups) {
      if (!keepSet.has(up)) continue
      depth = Math.max(depth, computeDepth(up) + 1)
    }
    visiting.delete(name)
    depthOf.set(name, depth)
    return depth
  }
  for (const name of keep) computeDepth(name)

  // ④ 按层分组并排坐标
  const byDepth = new Map<number, string[]>()
  for (const name of keep) {
    const depth = depthOf.get(name) ?? 0
    const list = byDepth.get(depth) ?? []
    list.push(name)
    byDepth.set(depth, list)
  }
  const depths = Array.from(byDepth.keys()).sort(function (a, b) { return a - b })
  const maxDepth = depths.length > 0 ? depths[depths.length - 1] : 0
  const widest = Math.max.apply(null, depths.map(function (d) { return (byDepth.get(d) ?? []).length }).concat([1]))

  const width = PAD * 2 + widest * NODE_W + (widest - 1) * GAP_X
  const height = PAD * 2 + (maxDepth + 1) * NODE_H + maxDepth * GAP_Y

  const nodes: GraphNode[] = []
  for (const depth of depths) {
    const list = byDepth.get(depth) as string[]
    const rowWidth = list.length * NODE_W + (list.length - 1) * GAP_X
    const startX = (width - rowWidth) / 2
    list.forEach(function (name, index) {
      nodes.push({
        id: name,
        depth: depth,
        x: startX + index * (NODE_W + GAP_X),
        // 深度越大越靠下：底层（基础量）在下方，上层（结论）在上方
        y: PAD + (maxDepth - depth) * (NODE_H + GAP_Y),
        incoming: (parents.get(name) ?? []).length,
      })
    })
  }

  // ⑤ 边坐标
  const posOf = new Map<string, GraphNode>()
  for (const node of nodes) posOf.set(node.id, node)
  const drawnEdges: GraphEdge[] = []
  for (const edge of edges) {
    const down = posOf.get(edge.from)
    const up = posOf.get(edge.to)
    if (!down || !up) continue
    drawnEdges.push({
      from: edge.from,
      to: edge.to,
      x1: up.x + NODE_W / 2,
      y1: up.y,
      x2: down.x + NODE_W / 2,
      y2: down.y + NODE_H,
    })
  }

  return { nodes: nodes, edges: drawnEdges, width: width, height: height, maxDepth: maxDepth }
}

/**
 * 生成贝塞尔曲线的 path（比直线好看，也更容易看出方向）。
 *
 * @param edge - 边
 * @returns SVG path 的 d 属性
 */
export function edgePath(edge: GraphEdge): string {
  const midY = (edge.y1 + edge.y2) / 2
  return 'M ' + edge.x1 + ' ' + edge.y1 +
    ' C ' + edge.x1 + ' ' + midY + ', ' + edge.x2 + ' ' + midY + ', ' + edge.x2 + ' ' + edge.y2
}
