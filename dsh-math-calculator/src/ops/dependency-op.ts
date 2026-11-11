/**
 * operation="dependency" 的实现：有向图的推演查询。
 *
 * ## 为什么编制树与依赖图要合并成一个操作
 *
 * 它们是**同一个数学对象**在不同领域的实例：
 *
 * ```
 *   编制树     师 → 团 → 营 → 连    边权 = 辖属倍数（1 师辖 4 团）
 *   依赖网     G → g → 山高         边权 = 敏感度（G 变 1% → g 变 1%）
 *   体系链     材料链 12 步串联      边权 = 串联系数
 * ```
 *
 * 而它们要回答的问题也是同一批：
 *
 * ```
 *   ① 传导   改一个节点，下游谁受影响、影响多大
 *   ② 路径   A 到 B 之间隔着几跳
 *   ③ 环     有环说明定义循环（物理上不可能 / 编制上死锁）
 *   ④ 体检   孤立节点、断头、层深异常
 * ```
 *
 * 所以做成一个操作 + 边语义声明，而不是两个专用操作。
 *
 * ## 它补的不是 `hierarchy`，是 `hierarchy` 答不了的那一半
 *
 * ```
 *   hierarchy 能答：这个编制满编多少人
 *   hierarchy 答不了：某个节点被摧毁，多少人失联（连通性）
 *                    一道命令传到底层要几级（深度）
 *                    哪个上级辖得太宽（跨度超限）
 * ```
 *
 * ## 它也不替代 `derivation graph`
 *
 * `graph` 子命令给的是常数依赖图的**坐标**（画图用，含 x/y）。
 * 本操作给的是**结构与查询**（不含坐标，能问问题）。
 *
 * @module dsh-math-calculator/ops/topology-op
 */

import { toJsonValue } from '../format.js'
import { CalcError, type MathArgs, type Outcome } from './shared.js'

/** 图的一条边。 */
interface Edge {
  /** 起点。 */
  from: string
  /** 终点。 */
  to: string
  /** 边权（含义由 `weightKind` 声明）。 */
  weight: number
  /** 边上的标签（可选）。 */
  label?: string
}

/** 图。 */
interface Graph {
  /** 节点名列表。 */
  nodes: string[]
  /** 边列表。 */
  edges: Edge[]
  /** 边权含义：branching 辖属倍数 / sensitivity 敏感度 / serial 串联系数 / flow 流量。 */
  weightKind: string
}

/**
 * 建立邻接表。
 *
 * @param graph - 图
 * @returns 出边表与入边表
 */
function buildAdjacency(graph: Graph): {
  out: Map<string, Edge[]>
  in: Map<string, Edge[]>
} {
  const out = new Map<string, Edge[]>()
  const inn = new Map<string, Edge[]>()
  for (const node of graph.nodes) {
    out.set(node, [])
    inn.set(node, [])
  }
  for (const edge of graph.edges) {
    const list = out.get(edge.from)
    if (list) list.push(edge)
    const back = inn.get(edge.to)
    if (back) back.push(edge)
  }
  return { out, in: inn }
}

/**
 * 从起点出发沿边扩散，收集所有可达节点。
 *
 * ## 方向要显式给，不能靠「传哪张表」隐式决定
 *
 * 第一版设计成「传 out 表走下游、传 in 表走上游」，以为靠表的选择
 * 就能切换方向。**那是错的** —— 因为 `in` 表里的边仍然是
 * `{from: 上游, to: 我}` 的形状，遍历时取 `edge.to` 只会得到「我自己」，
 * 于是**上游永远返回空**。
 *
 * 现在用 `direction` 参数显式说明往哪边走：
 *
 * ```
 *   direction='down'  取 edge.to    （我 → 我给谁）
 *   direction='up'    取 edge.from  （谁 → 我）
 * ```
 *
 * ## 用 BFS 而不是递归 DFS
 *
 * 图可能有环（本操作会报出来），递归会栈溢出；
 * BFS 加 visited 集天然处理环。
 *
 * @param start - 起点
 * @param adjacency - 邻接表（出边或入边）
 * @param direction - 扩散方向
 * @returns 每个可达节点及其跳数；起点自身跳数为 0
 */
function traverse(
  start: string,
  adjacency: Map<string, Edge[]>,
  direction: 'down' | 'up',
): Map<string, number> {
  const distance = new Map<string, number>([[start, 0]])
  const queue = [start]
  while (queue.length > 0) {
    const current = queue.shift() as string
    const depth = distance.get(current) ?? 0
    for (const edge of adjacency.get(current) ?? []) {
      /** 关键：按方向决定走到哪一端。 */
      const next = direction === 'down' ? edge.to : edge.from
      if (distance.has(next)) continue
      distance.set(next, depth + 1)
      queue.push(next)
    }
  }
  return distance
}

/**
 * 找所有环（Johnson 简化版：只报「存在环」与其中一组节点）。
 *
 * ## 为什么不做完整的环枚举
 *
 * 完整枚举在大图上是 NP 难的。推演场景里真正需要的判断是
 * 「**这里有没有环**」——有就说明定义有问题，先修掉再谈其他。
 *
 * @param graph - 图
 * @returns 找到的环（每个环是节点序列）；没有则空数组
 */
function findCycles(graph: Graph): string[][] {
  const state = new Map<string, 0 | 1 | 2>() // 0 未访问 / 1 在栈上 / 2 完成
  const stack: string[] = []
  const cycles: string[][] = []

  const visit = (node: string): void => {
    state.set(node, 1)
    stack.push(node)
    for (const edge of graph.edges) {
      if (edge.from !== node) continue
      const next = edge.to
      const nextState = state.get(next) ?? 0
      if (nextState === 1) {
        /** 找到回边：从栈里截出这一段。 */
        const index = stack.indexOf(next)
        if (index >= 0) cycles.push([...stack.slice(index), next])
      } else if (nextState === 0) {
        visit(next)
      }
    }
    stack.pop()
    state.set(node, 2)
  }

  for (const node of graph.nodes) {
    if ((state.get(node) ?? 0) === 0) visit(node)
  }
  return cycles
}

/**
 * 归一化输入图。
 *
 * @param raw - 原始输入
 * @returns 图
 */
function normalizeGraph(raw: unknown): Graph {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CalcError(
      'invalid_argument',
      'dependency 需要一个图对象：{nodes, edges}',
      '例如 {dependency:{nodes:["师","团","营"],edges:[{from:"师",to:"团",weight:3},{from:"团",to:"营",weight:3}]}}。' +
        '也可以用 groups 简写批量生成层级（见 help）。',
    )
  }
  const obj = raw as Record<string, unknown>

  /**
   * ## 简写：levels + tree 自动生成图
   *
   * 编制树是最常见的用法，每次都手写 5 条边太啰嗦。
   * 给了 `levels` 与 `tree` 就自动建成一条链（每级辖下一级）。
   */
  const levels = Array.isArray(obj.levels) ? obj.levels.map((item) => String(item)) : []
  const tree = Array.isArray(obj.tree) ? obj.tree.map((item) => Number(item)) : []
  if (levels.length >= 2 && tree.length === levels.length - 1) {
    const edges: Edge[] = []
    for (let i = 0; i < levels.length - 1; i += 1) {
      edges.push({ from: levels[i], to: levels[i + 1], weight: tree[i], label: '辖' })
    }
    return { nodes: levels, edges, weightKind: 'branching' }
  }

  const nodes = Array.isArray(obj.nodes) ? obj.nodes.map((item) => String(item)) : []
  const edgesRaw = Array.isArray(obj.edges) ? obj.edges : []
  if (nodes.length === 0 || edgesRaw.length === 0) {
    throw new CalcError(
      'invalid_argument',
      'dependency 需要 nodes（节点列表）与 edges（边列表），都为非空',
      '或者用简写 {levels:["师","团","营"], tree:[3,3]} 自动建一条链。',
    )
  }

  const edges: Edge[] = edgesRaw.map((item) => {
    const one = (item ?? {}) as Record<string, unknown>
    const from = typeof one.from === 'string' ? one.from : ''
    const to = typeof one.to === 'string' ? one.to : ''
    if (from === '' || to === '') {
      throw new CalcError('invalid_argument', '每条边必须有 from 与 to', JSON.stringify(one))
    }
    return {
      from,
      to,
      weight: typeof one.weight === 'number' && Number.isFinite(one.weight) ? one.weight : 1,
      label: typeof one.label === 'string' ? one.label : undefined,
    }
  })

  /** 边引用的节点必须存在（悬空边会让可达性算错）。 */
  const nodeSet = new Set(nodes)
  const dangling = edges.filter((edge) => !nodeSet.has(edge.from) || !nodeSet.has(edge.to))
  if (dangling.length > 0) {
    throw new CalcError(
      'invalid_argument',
      '有 ' + dangling.length + ' 条边引用了不存在的节点',
      dangling
        .slice(0, 5)
        .map((edge) => edge.from + ' → ' + edge.to)
        .join('、') + '。请先把这些节点加进 nodes。',
    )
  }

  return {
    nodes,
    edges,
    weightKind: typeof obj.weightKind === 'string' ? obj.weightKind : 'sensitivity',
  }
}

/**
 * `dependency`：有向图的推演查询。
 *
 * @param args - 工具参数
 * @returns 结果文本与结构化值
 */
export function opDependency(args: MathArgs): Outcome {
  const raw = (args as unknown as Record<string, unknown>).dependency
  const graph = normalizeGraph(raw)
  const obj = (raw ?? {}) as Record<string, unknown>
  const { out, in: inn } = buildAdjacency(graph)

  /** 要查的节点（可选）：给了就报它的下游与上游。 */
  const focus = typeof obj.node === 'string' ? obj.node.trim() : ''

  const lines: string[] = []
  lines.push('═══ 依赖传导 ═══')
  lines.push('')
  lines.push(
    '  节点 ' + graph.nodes.length + ' 个　边 ' + graph.edges.length +
      ' 条　边权含义：' + graph.weightKind,
  )
  lines.push('')

  // ── ① 环检测 ──
  const cycles = findCycles(graph)
  if (cycles.length > 0) {
    lines.push('  ✗ 发现 ' + cycles.length + ' 个环：')
    for (const cycle of cycles.slice(0, 5)) {
      lines.push('   · ' + cycle.join(' → '))
    }
    lines.push('')
    lines.push('    环意味着**定义循环**：A 依赖 B、B 又依赖 A。')
    lines.push('    在物理/编制里这通常说明某条关系写反了，或某个量被当成了自变量又在被推导。')
    lines.push('')
  } else {
    lines.push('  ✓ 无环（这是一张有向无环图，可以按拓扑序推演）')
    lines.push('')
  }

  // ── ② 层深与跨度 ──
  const sources = graph.nodes.filter((node) => (inn.get(node) ?? []).length === 0)
  const sinks = graph.nodes.filter((node) => (out.get(node) ?? []).length === 0)
  lines.push('  根节点（无上游）：' + (sources.length > 0 ? sources.join('、') : '（无，说明有环）'))
  lines.push('  叶节点（无下游）：' + (sinks.length > 0 ? sinks.slice(0, 12).join('、') : '（无）') +
    (sinks.length > 12 ? ' 等 ' + sinks.length + ' 个' : ''))
  lines.push('')

  /**
   * 每个节点的「深度」= 从任一根到它的最长路径跳数。
   * 这决定了信息从顶层传到底层要几跳。
   */
  const depth = new Map<string, number>()
  const computeDepth = (node: string, seen: Set<string>): number => {
    if (depth.has(node)) return depth.get(node) as number
    if (seen.has(node)) return 0
    seen.add(node)
    const parents = inn.get(node) ?? []
    const value = parents.length === 0 ? 0 : Math.max(...parents.map((edge) => computeDepth(edge.from, seen) + 1))
    depth.set(node, value)
    return value
  }
  for (const node of graph.nodes) computeDepth(node, new Set())
  const maxDepth = Math.max(0, ...depth.values())
  lines.push('  最大层深：' + maxDepth + ' 跳' +
    (maxDepth > 0 ? '（从顶到底要传 ' + maxDepth + ' 级）' : ''))
  lines.push('')

  // ── ③ 结构体检 ──
  const findings: string[] = []
  /** 孤立节点：既无入边也无出边。 */
  for (const node of graph.nodes) {
    if ((inn.get(node) ?? []).length === 0 && (out.get(node) ?? []).length === 0) {
      findings.push('「' + node + '」是孤立节点（既无上游也无下游），可能漏连了')
    }
  }
  /** 跨度过宽：一个节点出边 ≥ 8（chunking 的心理学上限约 7±2）。 */
  for (const node of graph.nodes) {
    const children = out.get(node) ?? []
    if (children.length >= 8) {
      findings.push('「' + node + '」辖 ' + children.length + ' 个下游，超过 7±2 的跨度上限（管控会失效）')
    }
  }
  /** 断头：有上游但上游都不可达根（说明上游也是悬空的）。 */
  if (findings.length > 0) {
    lines.push('  结构体检发现 ' + findings.length + ' 处：')
    for (const one of findings) lines.push('   · ' + one)
    lines.push('')
  } else {
    lines.push('  ✓ 结构体检没发现问题。')
    lines.push('')
  }

  // ── ④ 传导查询 ──
  let downstream: Array<{ id: string; hops: number }> = []
  let upstream: Array<{ id: string; hops: number }> = []
  if (focus !== '') {
    if (!graph.nodes.includes(focus)) {
      throw new CalcError(
        'invalid_argument',
        '图里没有节点「' + focus + '」',
        '现有节点：' + graph.nodes.slice(0, 20).join('、') + (graph.nodes.length > 20 ? ' …' : ''),
      )
    }
    const down = traverse(focus, out, 'down')
    downstream = [...down.entries()]
      .filter(([id]) => id !== focus)
      .sort((a, b) => a[1] - b[1])
      .map(([id, hops]) => ({ id, hops }))
    /**
     * ★ 上游要沿**入边表**走。
     *
     * 第一版这里传了 `out`，于是「沿出边可达」返回的是下游节点 ——
     * 结果 `g` 的上游报成「无，它是根节点」，而它明明有 G/M/R 三个上游。
     *
     * `reachableFrom(x, inn)` 沿入边反向扩散，得到的才是「会影响 x 的那些」。
     */
    const up = traverse(focus, inn, 'up')
    upstream = [...up.entries()]
      .filter(([id]) => id !== focus)
      .sort((a, b) => a[1] - b[1])
      .map(([id, hops]) => ({ id, hops }))

    lines.push('  ── 关于「' + focus + '」──')
    lines.push('')
    lines.push('  ↓ 下游（改它会影响到）：' + (downstream.length > 0
      ? downstream.map((one) => one.id + '(' + one.hops + '跳)').join('、')
      : '（无，它是叶节点）'))
    lines.push('  ↑ 上游（它会受这些影响）：' + (upstream.length > 0
      ? upstream.map((one) => one.id + '(' + one.hops + '跳)').join('、')
      : '（无，它是根节点）'))
    lines.push('')
    if (downstream.length === 0) {
      lines.push('    ★ 它是叶节点：改它不会传导到别处，是纯粹的结论量。')
    } else if (upstream.length === 0) {
      lines.push('    ★ 它是根节点：它是自变量，本身不受图内其他量影响。')
    }
  }

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      weightKind: graph.weightKind,
      cycles,
      sources,
      sinks,
      maxDepth,
      depth: Object.fromEntries(depth),
      findings,
      focus: focus === '' ? null : focus,
      downstream,
      upstream,
    }),
  }
}
