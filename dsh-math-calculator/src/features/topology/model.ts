/**
 * 实体拓扑模型：节点 + 边 + 属性。
 *
 * ## 为什么单列一类
 *
 * 依赖图（`features/graph`）回答「谁决定谁」，实体拓扑回答「谁在哪、怎么到」。
 * 两者都是图，但边的语义不同：一个是因果，一个是空间/辖属/邻接。
 *
 * ## 建模约定
 *
 * ```
 *   节点   地点 / 建筑 / 载具 / 势力 / 任意实体（kind 自定，props 自由）
 *   边     通路（road/sea/rail/air）、邻接（adjacency）、辖属（hierarchy）
 *   长度   边可以显式给 lengthKm；不给时由两端坐标算球面距离
 *   权重   cost = length × 地形阻力 × 交通方式系数（用于最短路径）
 * ```
 *
 * ## 校验是硬门槛
 *
 * 重复 id、悬空边、自环、非数字长度一律报错——拓扑不成立时，
 * 算出来的距离与可达性没有意义。孤立节点与环不是错误，是报告项。
 *
 * @module dsh-math-calculator/features/topology/model
 */

import Graph from 'graphology'
import { connectedComponents } from 'graphology-components'
import { CalcError } from '../../core/errors.js'

/** 节点。 */
export interface TopologyNode {
  id: string
  name: string
  kind: string
  /** 经纬度（球面）或平面坐标（二选一）。 */
  lat?: number
  lon?: number
  x?: number
  y?: number
  /** 海拔 m（影响视线与距离修正）。 */
  elevationM?: number
  props: Record<string, unknown>
}

/** 边。 */
export interface TopologyEdge {
  from: string
  to: string
  kind: string
  /** 是否双向可走（缺省 true）。 */
  bidirectional: boolean
  /** 长度 km；缺省由坐标算。 */
  lengthKm?: number
  /** 额外代价（如关卡、运费）；缺省 0。 */
  extraCost?: number
  props: Record<string, unknown>
}

/** 校验后的问题。 */
export interface TopologyFinding {
  kind: string
  message: string
}

/** 拓扑。 */
export interface Topology {
  nodes: Map<string, TopologyNode>
  edges: TopologyEdge[]
  graph: Graph
  findings: TopologyFinding[]
  /** 行星半径 km（球面距离用；缺省 6371）。 */
  planetRadiusKm: number
}

/** 节点输入。 */
export interface TopologyInput {
  nodes: Array<Partial<TopologyNode> & { id: string }>
  edges?: Array<Partial<TopologyEdge> & { from: string; to: string }>
  /** 行星半径 km（球面距离用）。缺省 6371。 */
  planetRadiusKm?: number
}

/** 取数值。 */
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** 球面距离（km）。 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number, planetRadiusKm = 6371): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * planetRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** 平面距离（km）。 */
export function planarKm(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1)
}

/**
 * 建拓扑并校验。
 *
 * @param input - 节点、边与行星半径
 * @returns 拓扑与不阻断的问题清单
 * @throws {CalcError} 拓扑不成立（重复 id / 悬空边 / 自环 / 非法长度）
 */
export function buildTopology(input: TopologyInput): Topology {
  if (!input || !Array.isArray(input.nodes) || input.nodes.length === 0) {
    throw new CalcError('missing_params', 'topology 需要非空的 nodes', '例如 {nodes:[{id:"帝都",lat:39.9,lon:116.4}]}。')
  }
  const planetRadiusKm = num(input.planetRadiusKm, 6371)
  const nodes = new Map<string, TopologyNode>()
  for (const raw of input.nodes) {
    if (!raw || typeof raw.id !== 'string' || raw.id.trim() === '') {
      throw new CalcError('invalid_argument', '每个节点都要有非空字符串 id', '例如 {id:"帝都", name:"帝国都城", kind:"city"}。')
    }
    const id = raw.id.trim()
    if (nodes.has(id)) throw new CalcError('invalid_argument', '节点 id 重复：' + id, 'id 是拓扑主键，重复会让边无从定位。')
    /** 经纬度越界会让 haversine 算出荒谬距离（R52：lat 200 / lon 400 → 15,127 km）。 */
    const nodeLat = raw['lat']
    const nodeLon = raw['lon']
    if (typeof nodeLat === 'number' && (nodeLat < -90 || nodeLat > 90)) {
      throw new CalcError('invalid_argument', '节点「' + id + '」的 lat 越界：' + nodeLat, '纬度范围是 −90 – 90 度。')
    }
    if (typeof nodeLon === 'number' && (nodeLon < -180 || nodeLon > 180)) {
      throw new CalcError('invalid_argument', '节点「' + id + '」的 lon 越界：' + nodeLon, '经度范围是 −180 – 180 度（全球地图请用 −180–180，不要写 0–360）。')
    }
    const node: TopologyNode = {
      id,
      name: typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name : id,
      kind: typeof raw.kind === 'string' && raw.kind.trim() !== '' ? raw.kind : 'place',
      props: raw.props !== undefined && raw.props !== null && typeof raw.props === 'object' && !Array.isArray(raw.props) ? (raw.props as Record<string, unknown>) : {},
    }
    if (typeof raw.lat === 'number') node.lat = raw.lat
    if (typeof raw.lon === 'number') node.lon = raw.lon
    if (typeof raw.x === 'number') node.x = raw.x
    if (typeof raw.y === 'number') node.y = raw.y
    if (typeof raw.elevationM === 'number') node.elevationM = raw.elevationM
    nodes.set(id, node)
  }

  const graph = new Graph({ multi: false, type: 'undirected' })
  for (const id of nodes.keys()) graph.addNode(id, { name: nodes.get(id)!.name, kind: nodes.get(id)!.kind })

  const edges: TopologyEdge[] = []
  const findings: TopologyFinding[] = []
  const seen = new Set<string>()
  for (const raw of input.edges ?? []) {
    if (!raw || typeof raw.from !== 'string' || typeof raw.to !== 'string') {
      throw new CalcError('invalid_argument', '每条边都要有 from 与 to', '例如 {from:"帝都", to:"南极煤田", kind:"sea"}。')
    }
    const from = raw.from.trim()
    const to = raw.to.trim()
    if (from === to) throw new CalcError('invalid_argument', '自环边：' + from, '自己到自己没有距离意义；若是辖属关系，应连到不同的节点。')
    if (!nodes.has(from)) throw new CalcError('unknown_symbol', '边指向不存在的节点 ' + from, '先把节点列全，再连边。')
    if (!nodes.has(to)) throw new CalcError('unknown_symbol', '边指向不存在的节点 ' + to, '先把节点列全，再连边。')
    /**
     * 去重要按**无向**键（R52）：边默认 bidirectional，
     * `A→B` 与 `B→A` 在图上就是同一条边，重复 addEdge 会让 graphology 抛
     * `an edge linking "B" to "A" already exists`（暴露成 internal 错误）。
     * 只有两端都显式声明单向时才按有向区分。
     */
    const isOneWay = raw.bidirectional === false
    const key = isOneWay ? from + '|' + to : [from, to].sort().join('|')
    if (seen.has(key)) {
      findings.push({ kind: 'duplicate_edge', message: from + ' → ' + to + ' 与已有边重复（无向图里 A→B 就是 B→A），只保留第一条' })
      continue
    }
    seen.add(key)

    const a = nodes.get(from)!
    const b = nodes.get(to)!
    let lengthKm = typeof raw.lengthKm === 'number' ? raw.lengthKm : undefined
    if (lengthKm === undefined) {
      if (a.lat !== undefined && a.lon !== undefined && b.lat !== undefined && b.lon !== undefined) lengthKm = haversineKm(a.lat, a.lon, b.lat, b.lon, planetRadiusKm)
      else if (a.x !== undefined && a.y !== undefined && b.x !== undefined && b.y !== undefined) lengthKm = planarKm(a.x, a.y, b.x, b.y)
      /**
       * 无坐标不能静默算 0 km（R52）：总长 0 会被读成「这些地点就在一起」，
       * 而真相是没有坐标信息。明确报告。
       */
      else findings.push({ kind: 'no_coordinate', message: from + ' → ' + to + ' 两端缺坐标（lon/lat 或 x/y），长度按 0 处理——总长不可信' })
    }
    if (lengthKm !== undefined && (!Number.isFinite(lengthKm) || lengthKm < 0)) {
      throw new CalcError('invalid_argument', from + ' → ' + to + ' 的长度不合法（' + String(lengthKm) + '）', '长度必须是非负有限数（km）。')
    }
    const edge: TopologyEdge = {
      from,
      to,
      kind: typeof raw.kind === 'string' && raw.kind.trim() !== '' ? raw.kind : 'road',
      bidirectional: raw.bidirectional !== false,
      props: raw.props !== undefined && raw.props !== null && typeof raw.props === 'object' && !Array.isArray(raw.props) ? (raw.props as Record<string, unknown>) : {},
      ...(lengthKm !== undefined ? { lengthKm } : {}),
      ...(typeof raw.extraCost === 'number' && Number.isFinite(raw.extraCost) ? { extraCost: raw.extraCost } : {}),
    }
    edges.push(edge)
    graph.addEdge(from, to, { kind: edge.kind, lengthKm: edge.lengthKm ?? 0, weight: (edge.lengthKm ?? 0) + (edge.extraCost ?? 0) })
    if (edge.bidirectional === false) {
      findings.push({ kind: 'one_way', message: from + ' → ' + to + ' 标为单向；图的邻接按无向处理，可达性会偏乐观' })
    }
  }

  /** 孤立节点与环（报告项，不阻断）。 */
  for (const id of nodes.keys()) {
    if (graph.degree(id) === 0) findings.push({ kind: 'isolated', message: id + ' 是孤立节点（没有任何边）' })
  }
  /**
   * 无向图的「环」是圈，不是 DAG 意义上的环：
   * 圈数 = 边数 − 节点数 + 连通分量数（> 0 即有圈）。
   * 直接用 graphology-dag.hasCycle 会把每条单边都判成环（A→B→A）。
   */
  if (graph.order > 0 && graph.size - graph.order + connectedComponents(graph).length > 0) {
    findings.push({ kind: 'cycle', message: '拓扑里有圈（通路成环）；若这是辖属关系，环意味着上级链闭合，需要人工确认' })
  }

  return { nodes, edges, graph, findings, planetRadiusKm }
}

/**
 * 拓扑摘要。
 *
 * @param topology - 拓扑
 * @returns 节点/边/种类/孤立/环
 */
export function summarizeTopology(topology: Topology): {
  nodeCount: number
  edgeCount: number
  kinds: Record<string, number>
  isolated: string[]
  cycles: boolean
  totalEdgeKm: number
} {
  const kinds: Record<string, number> = {}
  for (const edge of topology.edges) kinds[edge.kind] = (kinds[edge.kind] ?? 0) + 1
  const isolated = [...topology.nodes.keys()].filter((id) => topology.graph.degree(id) === 0)
  return {
    nodeCount: topology.nodes.size,
    edgeCount: topology.edges.length,
    kinds,
    isolated,
    cycles: topology.graph.size - topology.graph.order + connectedComponents(topology.graph).length > 0,
    totalEdgeKm: topology.edges.reduce((sum, edge) => sum + (edge.lengthKm ?? 0), 0),
  }
}
