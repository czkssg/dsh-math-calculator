/**
 * 拓扑 operation：把 features/topology 的能力接成可调用入口。
 *
 * ## 三类不能简化的拓扑
 *
 * ```
 *   org      军队/政府层级：跨级、缺编、多上级（矩阵）、兵种、指挥链深度
 *   terrain  地图地形：连通分量、咽喉（割点/桥）、通行代价、可达范围
 *   ship     建筑/舰船：舱室连通、冗余路径、单点故障（割点）、容量瓶颈
 * ```
 *
 * 通用图（节点/边/距离/最短路径/视线）用 model / route / sightline / reachable；
 * 建筑与载具的物理上限用 structure；结构体检用 rules。
 *
 * ## 口径
 *
 * - 割点用**定义式**判（移除后连通分量数是否增加）；几十节点规模够用，
 *   不引入 Tarjan —— 但图大到几千节点时应换算法（那时再换）。
 * - 缺编/跨级/多上级都是**结构性提示**，不判对错：军队可以有矩阵式指挥。
 *
 * @module dsh-math-calculator/features/topology/ops
 */

import Graph from 'graphology'
import { connectedComponents } from 'graphology-components'
import { CalcError } from '../../core/errors.js'
import { analyzeLogistics } from './logistics.js'
import { resolveAssessment, type AssessmentRule } from './engineering.js'
import assessmentRules from '../../data/topology-assessments.json' with { type: 'json' }

/** 耦合规则表（数据驱动；新增类型只改 JSON + 注册 calculator）。 */
const ASSESSMENT_RULES = (assessmentRules as { rules: AssessmentRule[] }).rules

/**
 * 给任意 topology 动作追加工程校核（按规则表匹配，未命中就不加）。
 *
 * @param action - 动作名
 * @param flat - 扁平输入
 * @param text - 原始结果文本
 * @param value - 原始 value
 * @returns 追加后的结果
 */
function withAssessment(action: string, flat: Record<string, unknown>, text: string, value: unknown): { result: string; value: unknown } {
  const hit = resolveAssessment(ASSESSMENT_RULES, action, flat)
  if (hit === null) return { result: text, value }
  const data = hit.result as Record<string, unknown>
  const lines: string[] = ['', '【工程校核 · ' + hit.rule.id + '】']
  for (const [key, item] of Object.entries(data)) {
    if (typeof item === 'number') lines.push('  ' + key + ' = ' + (Number.isFinite(item) ? item.toPrecision(6) : String(item)))
    else if (typeof item === 'string') lines.push('  ' + key + ' = ' + item)
  }
  return { result: text + '\n' + lines.join('\n'), value: { ...(value as Record<string, unknown>), engineering: data, assessmentId: hit.rule.id } }
}
import { buildTopology, summarizeTopology, type Topology, type TopologyEdge, type TopologyNode } from './model.js'
import { distanceBetween, reachableWithin, shortestRoute, sightline } from './geometry.js'
import { assessStructure, type BuildingInput, type VehicleInput } from './structure.js'
import { checkRules, type RuleContext } from './rules.js'
import { ENTITY_TYPES, RELATION_TYPES, mergeEntityTypes, validateEntityGraph, validateEntityType, type EntityTypeDef } from './entities.js'
import { currentWorkspace } from '../workspace.js'
import { loadWorkspaceFile, saveWorkspaceFile, workspaceArtifactDir } from '../../io/workspace-store.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'


/** topology 全部 action 的可复制示例（反馈：107 次「不知道怎么传」）。 */
const TOPOLOGY_EXAMPLES: Array<{ action: string; label: string; example: Record<string, unknown> }> = [
  { action: 'model', label: '建图与摘要', example: { action: 'model', nodes: [{ id: 'A', lat: 0, lon: 0 }, { id: 'B', lat: 0, lon: 1 }], edges: [{ from: 'A', to: 'B', kind: 'road' }] } },
  { action: 'route', label: '最短路径', example: { action: 'route', nodes: [{ id: 'A', lat: 0, lon: 0 }, { id: 'B', lat: 0, lon: 1 }], edges: [{ from: 'A', to: 'B', kind: 'road' }], from: 'A', to: 'B', mode: 'road' } },
  { action: 'sightline', label: '视线', example: { action: 'sightline', nodes: [{ id: 'A', lat: 0, lon: 0 }, { id: 'B', lat: 0, lon: 1 }], edges: [{ from: 'A', to: 'B', kind: 'road' }], from: 'A', to: 'B' } },
  { action: 'reachable', label: '可达预算', example: { action: 'reachable', nodes: [{ id: 'A', lat: 0, lon: 0 }, { id: 'B', lat: 0, lon: 1 }], edges: [{ from: 'A', to: 'B', kind: 'road' }], from: 'A', maxKm: 200 } },
  { action: 'structure', label: '建筑/载具（扁平写法）', example: { action: 'structure', kind: 'building', levels: 320, area: 1000 } },
  { action: 'structure', label: '建筑/载具（嵌套写法）', example: { action: 'structure', building: { kind: 'building', floors: 100, footprintM2: 500 } } },
  { action: 'rules', label: '七条结构规则', example: { action: 'rules', nodes: [{ id: 'A', lat: 0, lon: 0 }], edges: [] } },
  { action: 'org', label: '军队/政府层级', example: { action: 'org', units: [{ id: '师', level: '师', headcount: 12000, parent: '军' }, { id: '军', level: '军', headcount: 30000 }] } },
  { action: 'terrain', label: '地图地形', example: { action: 'terrain', nodes: [{ id: 'A', lat: 0, lon: 0 }, { id: 'B', lat: 0, lon: 1 }], edges: [{ from: 'A', to: 'B', kind: 'road' }], from: 'A', to: 'B' } },
  { action: 'ship', label: '建筑/舰船拓扑', example: { action: 'ship', entry: '舰桥', compartments: [{ id: '舰桥' }, { id: '机舱' }], passages: [{ from: '舰桥', to: '机舱', kind: 'passage' }] } },
  { action: 'entities', label: '列出实体类型', example: { action: 'entities' } },
  { action: 'define', label: '自创实体类型', example: { action: 'define', entityType: { name: 'clan', label: '氏族', category: 'conceptual', required: ['members', 'leader'], relations: ['alliance'] } } },
  { action: 'validate', label: '实体图校验', example: { action: 'validate', entities: [{ id: '师', type: 'unit', level: '师', headcount: 1 }], relations: [] } },
  { action: 'save', label: '保存模型', example: { action: 'save', modelKey: '北境军', nodes: [{ id: 'A' }], edges: [] } },
  { action: 'load', label: '载入模型', example: { action: 'load', modelKey: '北境军' } },
  { action: 'list', label: '模型清单', example: { action: 'list' } },
  { action: 'export', label: '导出到工作区', example: { action: 'export', modelKey: '北境军', nodes: [{ id: 'A' }], edges: [] } },
  { action: 'import', label: '从工作区导入', example: { action: 'import', file: '北境军.json' } },
];

/**
 * 渲染 action 示例清单。
 *
 * @returns 文本与清单
 */
function renderExamples(): { result: string; value: unknown } {
  const lines: string[] = ['═══ topology 动作清单与可复制示例 ═══', '']
  for (const item of TOPOLOGY_EXAMPLES) {
    lines.push('  ' + item.action.padEnd(12) + item.label)
    lines.push('    ' + JSON.stringify({ operation: 'topology', topology: item.example }))
  }
  lines.push('', '★ 每个示例可直接整段粘贴调用；不带 action 时默认 model。')
  return { result: lines.join('\n'), value: { actions: TOPOLOGY_EXAMPLES } }
}

/** 输入。 */
export interface TopologyOpInput {
  action?: string
  nodes?: TopologyNode[]
  edges?: TopologyEdge[]
  planetRadiusKm?: number
  from?: string
  to?: string
  mode?: string
  maxKm?: number
  building?: BuildingInput
  vehicle?: VehicleInput
  rules?: RuleContext
  /** org：单位列表（parent 自动成边）。 */
  units?: Array<{ id: string; name?: string; level?: string; headcount?: number; parent?: string; kind?: string }>
  /** ship：舱室/系统。 */
  compartments?: Array<{ id: string; name?: string; kind?: string; deck?: number }>
  /** ship：通道/管线。 */
  passages?: Array<{ from: string; to: string; kind?: string; capacity?: number }>
  /** ship：入口节点。 */
  entry?: string
  /** define：自创实体类型。 */
  entityType?: Record<string, unknown>
  /** entities：按类别过滤。 */
  category?: 'physical' | 'conceptual'
  /** validate：实体类型图。 */
  entities?: Array<{ id: string; type?: string; [key: string]: unknown }>
  /** validate：关系边。 */
  relations?: Array<{ from: string; to: string; kind?: string }>
  /** save/load/export/import：模型名与文件路径（相对工作区产物目录）。 */
  modelKey?: string
  /** export/import：文件名（相对 <工作区>.artifacts/）。 */
  file?: string
}

/** 结果。 */
export interface TopologyOpOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 判断有无向图的割点（定义式：移除后连通分量增加）。 */
function articulationPoints(graph: Graph): string[] {
  const base = connectedComponents(graph).length
  const out: string[] = []
  for (const node of graph.nodes()) {
    const sub = new Graph({ type: graph.type, multi: graph.multi })
    const keep = new Set(graph.nodes().filter((item) => item !== node))
    for (const item of keep) sub.addNode(item)
    for (const edge of graph.edges()) {
      const [a, b] = graph.extremities(edge)
      if (keep.has(a) && keep.has(b)) sub.addEdge(a, b)
    }
    if (connectedComponents(sub).length > base) out.push(node)
  }
  return out
}

/** 是否含环（无向：E−N+C>0）。 */
function hasCycleUndirected(graph: Graph): boolean {
  return graph.size - graph.order + connectedComponents(graph).length > 0
}

/** org：军队/政府层级。 */
function runOrg(input: TopologyOpInput): TopologyOpOutcome {
  const units = input.units
  if (!Array.isArray(units) || units.length === 0) {
    throw new CalcError('missing_params', 'org 需要 units（单位列表）', '例如 {topology:{action:"org", units:[{id:"师", level:"师", headcount:12000, parent:"军"}]}}。')
  }
  const graph = new Graph({ type: 'directed' })
  for (const unit of units) graph.addNode(unit.id, { name: unit.name ?? unit.id, level: unit.level ?? '', headcount: unit.headcount ?? 0, kind: unit.kind ?? '' })
  const missingParent: string[] = []
  for (const unit of units) {
    if (unit.parent === undefined || unit.parent === '') continue
    if (!graph.hasNode(unit.parent)) { missingParent.push(unit.id + '→' + unit.parent); continue }
    graph.addEdge(unit.id, unit.parent, { kind: 'command' })
  }
  /** 多上级：入度 >1（矩阵式）。 */
  /** 多上级：有多个上级节点（outNeighbors >1，矩阵式）。inDegree 是下级数，不能用。 */
  const multiParent = graph.nodes().filter((node) => graph.outDegree(node) > 1)
  /** 缺编：headcount 0。 */
  const vacant = graph.nodes().filter((node) => Number(graph.getNodeAttribute(node, 'headcount')) === 0)
  /** 跨级：父级与子级 level 不连续（用 level 字符串无法判，改用链深差异：直接子节点深度应 +1）。 */
  const depth = new Map<string, number>()
  const visit = (node: string, d: number, seen: Set<string>): void => {
    if (seen.has(node)) return
    seen.add(node)
    depth.set(node, Math.max(depth.get(node) ?? 0, d))
    for (const parent of graph.outNeighbors(node)) visit(parent, d + 1, seen)
  }
  for (const node of graph.nodes()) visit(node, 0, new Set())
  /** 指挥链最长深度与断链（无上级的根节点）。 */
  const roots = graph.nodes().filter((node) => graph.outDegree(node) === 0)
  const leaves = graph.nodes().filter((node) => graph.inDegree(node) === 0)
  let maxDepth = 0
  for (const d of depth.values()) maxDepth = Math.max(maxDepth, d)
  const headcountTotal = units.reduce((sum, unit) => sum + (unit.headcount ?? 0), 0)

  const lines: string[] = ['═══ 军队/政府层级拓扑 ═══', '']
  lines.push('  单位 ' + units.length + ' 个，指挥边 ' + graph.size + ' 条，总人数 ' + headcountTotal)
  lines.push('  指挥链深度 ' + maxDepth + ' 层；根（无上级）' + roots.length + ' 个，叶（无下级）' + leaves.length + ' 个')
  lines.push('')
  lines.push('【层级】')
  const sorted = [...graph.nodes()].sort((a, b) => (depth.get(b) ?? 0) - (depth.get(a) ?? 0) || String(a).localeCompare(String(b)))
  for (const node of sorted) {
    const headcount = Number(graph.getNodeAttribute(node, 'headcount'))
    const level = String(graph.getNodeAttribute(node, 'level'))
    const parent = graph.outNeighbors(node)
    lines.push('  ' + String(node).padEnd(18) + ('L' + (depth.get(node) ?? 0)).padEnd(5) + level.padEnd(8) + String(headcount).padStart(8) + (parent.length > 0 ? '  ↑' + parent.join('/') : '  （根）'))
  }
  const problems: string[] = []
  if (missingParent.length > 0) problems.push('上级不存在：' + missingParent.join('、'))
  if (vacant.length > 0) problems.push('缺编（headcount=0）：' + vacant.join('、'))
  if (multiParent.length > 0) problems.push('多上级（矩阵式，先确认是不是有意）：' + multiParent.join('、'))
  if (problems.length > 0) {
    lines.push('', '【结构提示】')
    for (const problem of problems) lines.push('  · ' + problem)
  }
  lines.push('', '★ 缺编/跨级/多上级都是提示，不判对错：矩阵式指挥是合法设计；但自动化流水线会把 headcount=0 当「这级没人」。')
  return {
    result: lines.join('\n'),
    value: { units: units.length, edges: graph.size, headcountTotal, maxDepth, roots, leaves, missingParent, vacant, multiParent, depth: Object.fromEntries(depth) },
  }
}

/** terrain：地图地形拓扑。 */
function runTerrainTopology(input: TopologyOpInput): TopologyOpOutcome {
  const topology = buildTopology({ nodes: input.nodes ?? [], edges: input.edges ?? [], planetRadiusKm: input.planetRadiusKm })
  const summary = summarizeTopology(topology)
  const graph = topology.graph
  const components = connectedComponents(graph)
  const bridges: string[] = []
  const arts = articulationPoints(graph)
  /** 边桥：用定义式（移除该边，连通分量增加）。 */
  for (const edge of graph.edges()) {
    const [a, b] = graph.extremities(edge)
    const sub = new Graph({ type: graph.type, multi: graph.multi })
    for (const node of graph.nodes()) sub.addNode(node)
    for (const other of graph.edges()) {
      const [c, d] = graph.extremities(other)
      if (other === edge) continue
      sub.addEdge(c, d)
    }
    if (connectedComponents(sub).length > components.length) bridges.push(a + '—' + b)
  }
  const lines: string[] = ['═══ 地图地形拓扑 ═══', '']
  lines.push('  地点 ' + graph.order + ' 个，通道 ' + graph.size + ' 条，连通区域 ' + components.length + ' 个')
  if (input.from !== undefined && input.to !== undefined) {
    const route = shortestRoute(topology, input.from, input.to, input.mode ?? 'road')
    lines.push('', '【最短路径 ' + input.from + ' → ' + input.to + '】')
    if (route.path === null) lines.push('  不通（没有可用路径）')
    else lines.push('  ' + route.path.join(' → ') + '，' + route.km.toFixed(1) + ' km，代价 ' + route.cost.toFixed(1) + '（' + (input.mode ?? 'road') + '）')
  }
  if (arts.length > 0) lines.push('', '【咽喉（割点）】' + arts.join('、') + ' —— 这些地点一旦被切断，地图会分裂。')
  if (bridges.length > 0) lines.push('【桥（单条通道）】' + bridges.slice(0, 12).join('、') + (bridges.length > 12 ? ' …' : ''))
  if (components.length > 1) lines.push('', '⚠ 地图被分成 ' + components.length + ' 块：跨区域行军必须先解决连通（渡口/隧道/飞船）。')
  if (summary.isolated.length > 0) lines.push('孤立地点：' + summary.isolated.join('、'))
  lines.push('', '★ 地形拓扑不简化：连通性、咽喉、通行代价三样决定「打得到打不到、运得到运不到」。')
  return {
    result: lines.join('\n'),
    value: { nodes: graph.order, edges: graph.size, components: components.length, articulationPoints: arts, bridges, isolated: summary.isolated, route: input.from !== undefined && input.to !== undefined ? shortestRoute(topology, input.from, input.to, input.mode ?? 'road') : null },
  }
}

/** ship：建筑/舰船舱室拓扑。 */
function runShipTopology(input: TopologyOpInput): TopologyOpOutcome {
  const compartments = input.compartments
  const passages = input.passages
  if (!Array.isArray(compartments) || compartments.length === 0) {
    throw new CalcError('missing_params', 'ship 需要 compartments（舱室/系统列表）', '例如 {topology:{action:"ship", compartments:[{id:"舰桥"},{id:"机舱"}], passages:[{from:"舰桥",to:"机舱"}]}}。')
  }
  const graph = new Graph({ type: 'undirected' })
  for (const item of compartments) graph.addNode(item.id, { name: item.name ?? item.id, kind: item.kind ?? '', deck: item.deck ?? 0 })
  for (const item of passages ?? []) {
    if (!graph.hasNode(item.from) || !graph.hasNode(item.to)) {
      throw new CalcError('unknown_symbol', '通道两端必须都在 compartments 里：' + item.from + ' / ' + item.to, '')
    }
    if (!graph.hasEdge(item.from, item.to)) graph.addEdge(item.from, item.to, { kind: item.kind ?? 'passage', capacity: item.capacity ?? null })
  }
  const components = connectedComponents(graph)
  const arts = articulationPoints(graph)
  const entry = input.entry ?? graph.nodes()[0]
  /** 从入口做一次 BFS（不是只看直接邻居）。 */
  const reachable = new Set<string>()
  if (entry !== undefined && graph.hasNode(entry)) {
    const queue = [entry]
    while (queue.length > 0) {
      const node = queue.shift() as string
      if (reachable.has(node)) continue
      reachable.add(node)
      for (const next of graph.neighbors(node)) if (!reachable.has(next)) queue.push(next)
    }
  }
  /** 冗余：两舱室之间是否存在两条边不相交路径（边连通度 ≥2 的近似：去掉任一单边仍连通）。 */
  const criticalEdges: string[] = []
  for (const edge of graph.edges()) {
    const [a, b] = graph.extremities(edge)
    const sub = new Graph({ type: 'undirected' })
    for (const node of graph.nodes()) sub.addNode(node)
    for (const other of graph.edges()) {
      if (other === edge) continue
      const [c, d] = graph.extremities(other)
      sub.addEdge(c, d)
    }
    if (connectedComponents(sub).length > components.length) criticalEdges.push(a + '—' + b)
  }
  const lines: string[] = ['═══ 建筑/舰船舱室拓扑 ═══', '']
  lines.push('  舱室 ' + graph.order + ' 个，通道 ' + graph.size + ' 条，连通区域 ' + components.length + ' 个')
  if (entry !== undefined) {
    const unreachable = graph.nodes().filter((node) => node !== entry && !reachable.has(node))
    lines.push('  入口：' + entry + '；从入口直达 ' + (reachable.size - 1) + ' 个舱室' + (unreachable.length > 0 ? '；**到不了**：' + unreachable.join('、') : ''))
  }
  if (arts.length > 0) lines.push('', '【单点故障（割点）】' + arts.join('、') + ' —— 这些舱室被毁/堵住会把舰体分段。')
  if (criticalEdges.length > 0) lines.push('【关键通道（桥）】' + criticalEdges.slice(0, 12).join('、') + (criticalEdges.length > 12 ? ' …' : ''))
  const bottlenecks = graph.edges().filter((edge) => typeof graph.getEdgeAttribute(edge, 'capacity') === 'number').sort((a, b) => Number(graph.getEdgeAttribute(a, 'capacity')) - Number(graph.getEdgeAttribute(b, 'capacity'))).slice(0, 3)
  if (bottlenecks.length > 0) {
    lines.push('', '【容量最小的通道】')
    for (const edge of bottlenecks) {
      const [a, b] = graph.extremities(edge)
      lines.push('  ' + a + '—' + b + '：' + graph.getEdgeAttribute(edge, 'capacity'))
    }
  }
  lines.push('', '★ 不简化：连通性（能不能走到）、割点（一处被毁会不会分段）、桥（唯一通道）、容量瓶颈四样缺一不可。')
  return {
    result: lines.join('\n'),
    value: { compartments: graph.order, passages: graph.size, components: components.length, articulationPoints: arts, criticalEdges, entry, reachable: [...reachable] },
  }
}

/**
 * 执行 topology。
 *
 * @param input - 拓扑输入
 * @returns 结果
 * @throws {CalcError} 参数缺失/未知动作
 */
export function runTopology(input: TopologyOpInput = {}): TopologyOpOutcome {
  const action = typeof input.action === 'string' && input.action.trim() !== '' ? input.action.trim() : 'model'
  const KNOWN_ACTIONS = new Set(['model', 'route', 'sightline', 'reachable', 'structure', 'rules', 'org', 'terrain', 'ship', 'building', 'entities', 'define', 'validate', 'save', 'load', 'list', 'export', 'import', 'logistics'])
  /** 示例清单：`action:"examples"`，或拼错动作时也给清单（反馈：107 次猜参数失败）。 */
  if (action === 'examples' || action === 'help' || !KNOWN_ACTIONS.has(action)) return renderExamples()
  if (action === 'save') {
    const key = typeof input.modelKey === 'string' && input.modelKey.trim() !== '' ? input.modelKey.trim() : ''
    if (key === '') throw new CalcError('missing_params', 'save 需要 modelKey（模型名）', '例如 {topology:{action:"save", modelKey:"北境军", nodes:[…], edges:[…]}}。')
    if (!Array.isArray(input.nodes) || input.nodes.length === 0) throw new CalcError('missing_params', 'save 需要 nodes（要保存的拓扑）', '')
    const workspace = currentWorkspace()
    const data = loadWorkspaceFile(workspace)
    const models = { ...(data.topologyModels as Record<string, unknown>), [key]: { nodes: input.nodes, edges: input.edges ?? [], savedAt: new Date().toISOString() } }
    saveWorkspaceFile({ ...data, topologyModels: models })
    return { result: '✓ 已保存拓扑模型「' + key + '」到工作区「' + workspace + '」（' + input.nodes.length + ' 节点，' + (input.edges?.length ?? 0) + ' 边）\n  之后可 action:"load" 取回、action:"export" 导出到工作区文件。', value: { modelKey: key, workspace, nodes: input.nodes.length } }
  }

  if (action === 'load') {
    const key = typeof input.modelKey === 'string' ? input.modelKey.trim() : ''
    if (key === '') throw new CalcError('missing_params', 'load 需要 modelKey', '用 action:"list" 看已保存的模型名。')
    const workspace = currentWorkspace()
    const models = loadWorkspaceFile(workspace).topologyModels as Record<string, { nodes?: unknown; edges?: unknown; savedAt?: string }>
    const model = models[key]
    if (model === undefined) throw new CalcError('unknown_symbol', '工作区「' + workspace + '」里没有模型「' + key + '」', '已有：' + (Object.keys(models).join('、') || '（无）'))
    return { result: '✓ 已载入拓扑模型「' + key + '」（' + ((model.nodes as unknown[])?.length ?? 0) + ' 节点，' + ((model.edges as unknown[])?.length ?? 0) + ' 边，保存于 ' + (model.savedAt ?? '未知') + '）', value: { modelKey: key, nodes: model.nodes, edges: model.edges, workspace } }
  }

  if (action === 'list') {
    const workspace = currentWorkspace()
    const models = loadWorkspaceFile(workspace).topologyModels as Record<string, { nodes?: unknown[]; edges?: unknown[]; savedAt?: string }>
    const keys = Object.keys(models)
    const lines = ['═══ 已保存的拓扑模型（工作区 ' + workspace + '）═══', '']
    if (keys.length === 0) lines.push('  （还没有模型；用 action:"save" 建一个）')
    for (const key of keys) lines.push('  ' + key.padEnd(20) + ((models[key].nodes as unknown[])?.length ?? 0) + ' 节点 / ' + ((models[key].edges as unknown[])?.length ?? 0) + ' 边  ' + (models[key].savedAt ?? ''))
    return { result: lines.join('\n'), value: { workspace, models: keys } }
  }

  if (action === 'export' || action === 'import') {
    const workspace = currentWorkspace()
    const dir = workspaceArtifactDir(workspace)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    if (action === 'export') {
      if (!Array.isArray(input.nodes) || input.nodes.length === 0) {
        throw new CalcError('missing_params', 'export 需要 nodes（或先 action:"save" 再 export 指定 modelKey）', '')
      }
      const name = typeof input.file === 'string' && input.file.trim() !== '' ? input.file.trim() : (typeof input.modelKey === 'string' && input.modelKey.trim() !== '' ? input.modelKey.trim() : 'topology') + '.json'
      const path = join(dir, name)
      writeFileSync(path, JSON.stringify({ nodes: input.nodes, edges: input.edges ?? [] }, null, 1), 'utf8')
      return { result: '✓ 拓扑已导出到工作区：' + path + '\n  之后 action:"import" file:"' + name + '" 可读回。', value: { path, workspace, file: name, nodes: input.nodes.length } }
    }
    const name = typeof input.file === 'string' ? input.file.trim() : ''
    if (name === '') throw new CalcError('missing_params', 'import 需要 file（工作区产物目录里的文件名）', '用 action:"export" 先导出，或给已存在的文件名。')
    const path = join(dir, name)
    if (!existsSync(path)) throw new CalcError('unknown_symbol', '工作区产物目录里没有「' + name + '」', '目录：' + dir)
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { nodes?: unknown; edges?: unknown }
    return { result: '✓ 已从工作区载入拓扑：' + path, value: { path, workspace, nodes: parsed.nodes, edges: parsed.edges } }
  }

  if (action === 'define') {
    const type = validateEntityType(input.entityType)
    const workspace = currentWorkspace()
    const data = loadWorkspaceFile(workspace)
    const customs = (data.customEntities as unknown as EntityTypeDef[]).filter((item) => item.name !== type.name)
    saveWorkspaceFile({ ...data, customEntities: [...customs, type] as unknown as Array<Record<string, unknown>> })
    return {
      result: '✓ 已定义实体类型「' + type.name + '」（' + type.label + '，' + type.category + '）\n  必填：' + type.required.join('、') + (type.relations !== undefined ? '\n  允许关系：' + type.relations.join('、') : '') + '\n  之后 model/org/terrain/ship/validate 都能用它。',
      value: { entityType: type, workspace },
    }
  }

  if (action === 'entities') {
    const customs = loadWorkspaceFile(currentWorkspace()).customEntities as unknown as EntityTypeDef[]
    const all = mergeEntityTypes(customs).filter((type) => input.category === undefined || type.category === input.category)
    const lines: string[] = ['═══ 实体类型（内置 + 自创 ' + customs.length + ' 个）═══', '']
    for (const type of all) {
      lines.push('  ' + type.name.padEnd(14) + type.label.padEnd(12) + type.category.padEnd(10) + '必填：' + type.required.join('、'))
      if (type.note !== undefined) lines.push('  ' + ''.padEnd(14) + type.note)
    }
    lines.push('', '【关系类型】')
    for (const relation of RELATION_TYPES) lines.push('  ' + relation.name.padEnd(14) + relation.label.padEnd(10) + relation.direction.padEnd(11) + relation.cardinality)
    lines.push('', '自创：{topology:{action:"define", entityType:{name,label,category,required,relations?}}}')
    return { result: lines.join('\n'), value: { entityTypes: all, relationTypes: RELATION_TYPES } }
  }

  if (action === 'validate') {
    const customs = loadWorkspaceFile(currentWorkspace()).customEntities as unknown as EntityTypeDef[]
    const problems = validateEntityGraph(input.entities ?? [], input.relations ?? [], customs)
    const lines: string[] = ['═══ 实体图校验 ═══', '']
    if (problems.length === 0) lines.push('  ✓ 没有发现问题（' + (input.entities?.length ?? 0) + ' 个实体，' + (input.relations?.length ?? 0) + ' 条关系）')
    else {
      for (const problem of problems) lines.push('  · [' + problem.kind + '] ' + problem.where + '：' + problem.message)
    }
    return {
      result: lines.join('\n'),
      value: { problems, entityCount: input.entities?.length ?? 0, relationCount: input.relations?.length ?? 0 },
      ...(problems.length > 0 ? { notice: '有 ' + problems.length + ' 个结构问题（类型/字段/关系/基数）' } : {}),
    }
  }

  if (action === 'org') return runOrg(input)
  if (action === 'terrain') return runTerrainTopology(input)
  if (action === 'ship' || action === 'building') {
    const outcome = runShipTopology(input)
    /** 工程校核走规则表（舰船/太空舰船等按 JSON 匹配）。 */
    const merged = withAssessment('ship', input as unknown as Record<string, unknown>, outcome.result, outcome.value)
    return merged
  }
  if (action === 'structure') {
    /** 扁平写法（反馈：kind/levels/area 或 massKg/speedKph/…）也能用。 */
    const flat = input as unknown as Record<string, unknown>
    /** 封闭系统（避难所/温室）：没有结构几何，只做工程核算。 */
    if (flat['kind'] === 'enclosure' || flat['kind'] === 'greenhouse' || flat['kind'] === 'closed-loop' || flat['kind'] === 'compartments' || flat['kind'] === 'megastructure' || flat['kind'] === 'sponge' || flat['kind'] === 'mechanism' || flat['kind'] === 'fluid-power' || flat['kind'] === 'gear-train' || flat['kind'] === 'thermal' || flat['kind'] === 'electric' || flat['kind'] === 'fluid') {
      const label = flat['kind'] === 'mechanism' ? '机械系统' : flat['kind'] === 'fluid-power' ? '液压/气动' : flat['kind'] === 'gear-train' ? '多级传动' : flat['kind'] === 'thermal' ? '热工' : flat['kind'] === 'electric' ? '电气' : flat['kind'] === 'fluid' ? '流体' : flat['kind'] === 'closed-loop' ? '封闭系统闭环' : '封闭系统'
      const merged = withAssessment('structure', flat, '═══ ' + label + '（' + String(flat['kind']) + '）═══', { kind: flat['kind'] })
      return merged
    }
    const building = input.building ?? (flat['kind'] === 'building' || flat['levels'] !== undefined || flat['area'] !== undefined
      ? { kind: 'building', floors: Number(flat['levels'] ?? flat['floors'] ?? 1), footprintM2: Number(flat['area'] ?? flat['footprintM2'] ?? 0), ...(flat['world'] !== undefined ? { world: flat['world'] } : {}) }
      : undefined)
    const vehicle = input.vehicle ?? (flat['massKg'] !== undefined
      ? { kind: 'vehicle', massKg: Number(flat['massKg']), speedKph: Number(flat['speedKph'] ?? 0), energyJ: Number(flat['energyJ'] ?? 0), energyPerKmJ: Number(flat['energyPerKmJ'] ?? 0), ...(flat['payloadKg'] !== undefined ? { payloadKg: Number(flat['payloadKg']) } : {}) }
      : undefined)
    const outcome = assessStructure((building ?? vehicle) as never)
    /** 工程校核走规则表（数据驱动），这里不再硬编码类型。 */
    const flatIn = input as unknown as Record<string, unknown>
    const merged = withAssessment('structure', { ...flatIn, floors: building?.floors ?? flatIn['floors'], footprintM2: building?.footprintM2 ?? flatIn['footprintM2'], massKg: vehicle?.massKg ?? flatIn['massKg'] }, outcome.result, outcome.value)
    return { result: merged.result, value: merged.value, ...(outcome.notice !== undefined ? { notice: outcome.notice } : {}) }
  }
  if (action === 'logistics') {
    const flat = input as unknown as Record<string, unknown>
    const result = analyzeLogistics({ mode: typeof flat['mode'] === 'string' ? flat['mode'] : undefined, distanceKm: flat['distanceKm'] !== undefined ? Number(flat['distanceKm']) : undefined, speedKph: flat['speedKph'] !== undefined ? Number(flat['speedKph']) : undefined, stationKm: flat['stationKm'] !== undefined ? Number(flat['stationKm']) : undefined, stationDelayHours: flat['stationDelayHours'] !== undefined ? Number(flat['stationDelayHours']) : undefined, maxRoundTripDays: flat['maxRoundTripDays'] !== undefined ? Number(flat['maxRoundTripDays']) : undefined })
    return { result: '═══ 后勤/信息时延 ═══\n  ' + result.notes.join('\n  '), value: result }
  }
  if (action === 'rules') {
    const topology = buildTopology({ nodes: input.nodes ?? [], edges: input.edges ?? [], planetRadiusKm: input.planetRadiusKm })
    const outcome = checkRules(topology, input.rules ?? {})
    return { result: outcome.result, value: outcome.value, ...(outcome.notice !== undefined ? { notice: outcome.notice } : {}) }
  }
  if (action === 'route' || action === 'sightline' || action === 'reachable') {
    if (typeof input.from !== 'string' || input.from === '') throw new CalcError('missing_params', action + ' 需要 from（起点）', '')
    if (action !== 'reachable' && (typeof input.to !== 'string' || input.to === '')) throw new CalcError('missing_params', action + ' 需要 to（终点）', '')
    if (action === 'reachable' && typeof input.maxKm !== 'number') throw new CalcError('missing_params', 'reachable 需要 maxKm（预算）', '')
    const topology = buildTopology({ nodes: input.nodes ?? [], edges: input.edges ?? [], planetRadiusKm: input.planetRadiusKm })
    if (action === 'route') {
      const route = shortestRoute(topology, input.from, input.to as string, input.mode ?? 'road')
      return {
        result: route.path === null ? '不通（没有可用路径）' : route.path.join(' → ') + '，' + route.km.toFixed(1) + ' km，代价 ' + route.cost.toFixed(1),
        value: route,
        ...(route.path === null ? { notice: '这两个地点在当前通道网络里不通' } : {}),
      }
    }
    if (action === 'sightline') {
      const sight = sightline(topology, input.from, input.to as string)
      return { result: (sight.blocked ? '被挡：' : '通视：') + input.from + ' → ' + input.to + '，' + sight.distanceKm.toFixed(1) + ' km' + (sight.obstruction !== null ? '（挡在 ' + sight.obstruction + '）' : ''), value: sight, ...(sight.blocked ? { notice: '视线被地形或曲率挡住' } : {}) }
    }
    const reach = reachableWithin(topology, input.from, input.maxKm as number, input.mode ?? 'road')
    return {
      result: '预算 ' + input.maxKm + ' km 内可取达 ' + reach.reachable.length + ' 个地点：' + reach.reachable.map((item) => item.id).join('、') + (reach.unreachable.length > 0 ? '；到不了：' + reach.unreachable.join('、') : ''),
      value: reach,
    }
  }
  /** model：建图 + 摘要。 */
  if (!Array.isArray(input.nodes) || input.nodes.length === 0) {
    throw new CalcError('missing_params', 'topology 需要 nodes（节点列表）或指定 action（org/terrain/ship/structure/rules/route/sightline/reachable）', '例如 {topology:{nodes:[{id:"A",lat:0,lon:0}], edges:[{from:"A",to:"B"}]}}。')
  }
  const topology = buildTopology({ nodes: input.nodes, edges: input.edges ?? [], planetRadiusKm: input.planetRadiusKm })
  const summary = summarizeTopology(topology)
  const lines: string[] = ['═══ 拓扑模型 ═══', '']
  lines.push('  节点 ' + summary.nodeCount + '，边 ' + summary.edgeCount + '，总长 ' + summary.totalEdgeKm.toFixed(1) + ' km')
  if (summary.isolated.length > 0) lines.push('  孤立：' + summary.isolated.join('、'))
  if (topology.findings.length > 0) {
    lines.push('', '【发现】')
    for (const finding of topology.findings) lines.push('  · ' + finding.message)
  }
  lines.push('', '★ 结构体检（环/孤立/悬空）只提示不拒绝：拓扑可以有环（道路网）。')
  return { result: lines.join('\n'), value: { ...summary, findings: topology.findings } }
}
