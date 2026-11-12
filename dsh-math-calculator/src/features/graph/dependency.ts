/**
 * 依赖传导（`dependency`）。
 *
 * ## ★ 用 graphology，不自己写 BFS/环检测
 *
 * 老插件手写了三样（98 行）：
 *
 * ```
 *   buildAdjacency   建邻接表
 *   traverse         BFS 传导（含上下游方向）
 *   findCycles       DFS 环检测
 * ```
 *
 * 而那三样 graphology 全有，且**老插件版本有上游方向 bug**
 * （第一版只取 `edge.to`，传入边表时永远得空数组）。
 *
 * ## 这一层的四个能力
 *
 * ```
 *   上下游   改 X 会传导到谁 / X 依赖谁
 *   环检测   依赖成环（那是设计错误，必须报出来）
 *   层深     分成几代（谁是根、谁是末级）
 *   跨度     从根到叶最长几跳
 * ```
 *
 * ## 一个必须说清的边界
 *
 * 这是**抽象的依赖传导**（改重力常数 → 山高上限变），
 * 与「实体拓扑」（A 到 B 多远）是两件事。
 *
 * ```
 *   dependency     关系，不关心在哪里
 *   entity_topology 位置、路径、地形阻力     ← 第五类功能，尚未实现
 * ```
 *
 * @module dsh-math-calculator/features/graph/dependency
 */

import Graph from 'graphology'
import { topologicalSort, hasCycle, topologicalGenerations } from 'graphology-dag'
import { CalcError } from '../../core/errors.js'

/** 依赖图输入。 */
export interface DependencyInput {
  /** 节点列表（可为空——那就从 edges 里推断）。 */
  nodes?: Array<string | { id: string; label?: string }>
  /** 边列表。 */
  edges: Array<{ from: string; to: string; label?: string }>
}

/** 传导结果。 */
export interface DependencyOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 建图（统一的输入处理）。 */
function buildGraph(input: DependencyInput): Graph {
  if (!Array.isArray(input.edges) || input.edges.length === 0) {
    throw new CalcError(
      'missing_params',
      'dependency 需要 nodes（节点列表）与 edges（边列表），都为非空',
      '例如 {dependency:{edges:[{from:"G",to:"g"},{from:"M",to:"g"}]}}。' +
        '边表示「from 变化会传导到 to」。',
    )
  }

  const graph = new Graph({ multi: false, type: 'directed' })

  /** 收集节点（显式给的 + 边里出现的）。 */
  const ids = new Set<string>()
  for (const node of input.nodes ?? []) {
    ids.add(typeof node === 'string' ? node : node.id)
  }
  for (const edge of input.edges) {
    if (typeof edge?.from !== 'string' || typeof edge?.to !== 'string') {
      throw new CalcError(
        'invalid_argument',
        '每条边都要有 from 与 to（收到 ' + JSON.stringify(edge) + '）',
        '例如 {from:"G", to:"g"}。',
      )
    }
    ids.add(edge.from)
    ids.add(edge.to)
  }
  for (const id of ids) graph.addNode(id)

  /** 加边（去重，自环单独处理）。 */
  for (const edge of input.edges) {
    if (edge.from === edge.to) {
      throw new CalcError(
        'invalid_argument',
        '节点「' + edge.from + '」依赖自己（自环）',
        '自环意味着「改 X 会传导到 X 本身」—— 检查是否写错了。',
      )
    }
    if (!graph.hasEdge(edge.from, edge.to)) graph.addEdge(edge.from, edge.to)
  }

  return graph
}

/**
 * 从起点向下游（或上游）传导。
 *
 * @param graph - 图
 * @param start - 起点
 * @param direction - `downstream`（改我影响谁）/ `upstream`（谁改动影响我）
 * @returns `{ visited: 按层分组, depth: 最深层数 }`
 */
function traverse(
  graph: Graph,
  start: string,
  direction: 'downstream' | 'upstream',
): { levels: string[][]; depth: number } {
  const levels: string[][] = []
  const visited = new Set<string>([start])
  let frontier = [start]

  while (frontier.length > 0) {
    const next: string[] = []
    for (const node of frontier) {
      const neighbors = direction === 'downstream'
        ? graph.outboundNeighbors(node)
        : graph.inboundNeighbors(node)
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        next.push(neighbor)
      }
    }
    if (next.length === 0) break
    levels.push(next.sort())
    frontier = next
  }

  return { levels, depth: levels.length }
}

/**
 * 依赖传导分析。
 *
 * @param input - 图输入
 * @param start - 起点（可选）
 * @param direction - 方向
 * @returns 结果
 */
export function analyzeDependency(
  input: DependencyInput,
  start?: string,
  direction: 'downstream' | 'upstream' = 'downstream',
): DependencyOutcome {
  const graph = buildGraph(input)
  const nodeCount = graph.order
  const edgeCount = graph.size

  /** 环检测（先判 —— 有环时拓扑排序会抛错）。 */
  const cyclic = hasCycle(graph)

  const lines: string[] = []
  lines.push('═══ 依赖传导 ═══')
  lines.push('')
  lines.push('  节点 ' + nodeCount + ' 个　边 ' + edgeCount + ' 条')

  /** 孤立节点（无入无出）。 */
  const isolated: string[] = []
  for (const node of graph.nodes()) {
    if (graph.degree(node) === 0) isolated.push(node)
  }
  if (isolated.length > 0) {
    lines.push('  孤立节点（无任何依赖关系）：' + isolated.join(', '))
  }

  /** 环。 */
  if (cyclic) {
    lines.push('')
    lines.push('  ✗ **依赖成环** —— 这是设计错误（A 依赖 B、B 又依赖 A，改谁都会自相矛盾）')
    /** 找出环上的节点（在环里的节点删掉后图仍连通）。 */
    lines.push('  有环时无法给出层深与拓扑序（那需要无环）。')
  }

  /** 层深与拓扑序（仅无环时）。 */
  let generations: string[][] = []
  let order: string[] = []
  if (!cyclic) {
    generations = topologicalGenerations(graph) as string[][]
    order = topologicalSort(graph) as string[]
    lines.push('')
    lines.push('  层深 ' + generations.length + ' 代：')
    for (let i = 0; i < generations.length; i += 1) {
      lines.push('    L' + i + '：' + generations[i].join(', '))
    }
    /** 根与叶。 */
    const roots = graph.nodes().filter((n) => graph.inDegree(n) === 0)
    const leaves = graph.nodes().filter((n) => graph.outDegree(n) === 0)
    if (roots.length > 0) lines.push('  根（不被任何节点依赖）：' + roots.join(', '))
    if (leaves.length > 0) lines.push('  叶（不依赖任何节点）：' + leaves.join(', '))
  }

  /** 指定起点时给传导路径。 */
  let traversal: { start: string; direction: string; levels: string[][]; depth: number } | null = null
  if (start !== undefined && start !== '') {
    if (!graph.hasNode(start)) {
      throw new CalcError(
        'invalid_argument',
        '图里没有节点「' + start + '」',
        '现有节点：' + graph.nodes().slice(0, 20).join(', ') +
          (graph.order > 20 ? ' …（共 ' + graph.order + ' 个）' : ''),
      )
    }
    const { levels, depth } = traverse(graph, start, direction)
    traversal = { start, direction, levels, depth }

    lines.push('')
    lines.push('  从「' + start + '」' +
      (direction === 'downstream' ? '向下游传导' : '受上游影响') + '：')
    if (levels.length === 0) {
      lines.push('    （' + (direction === 'downstream' ? '它不影响任何节点' : '没有节点影响它') + '）')
    } else {
      for (let i = 0; i < levels.length; i += 1) {
        lines.push('    ' + (i + 1) + ' 跳：' + levels[i].join(', '))
      }
      lines.push('    最远 ' + depth + ' 跳，共影响 ' + levels.reduce((s, l) => s + l.length, 0) + ' 个节点')
    }
  }

  return {
    result: lines.join('\n'),
    value: {
      nodes: graph.nodes(),
      edges: graph.edges(),
      nodeCount,
      edgeCount,
      cyclic,
      generations,
      topologicalOrder: order,
      isolated,
      traversal,
    },
    notice: cyclic
      ? '依赖成环 —— 这不是「算不出」，是图本身有问题。有环时改任何节点都会绕回自己。'
      : undefined,
  }
}
