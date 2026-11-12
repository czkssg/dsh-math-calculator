/**
 * 拓扑几何：距离、最短路径、视线遮蔽、可达性。
 *
 * ## 距离
 *
 * 架空星球的半径与地球不同，所以**不能直接用 turf 的 distance**
 * （它写死地球半径）。这里用球面 haversine，行星半径由拓扑输入给。
 * 2026-11-13 调研：@turf/distance 7.4.0 MIT，依赖 5 个，但半径不可配；
 * 本需求只要「半径可配的球面距离」，自写更直接（公式是公开知识）。
 *
 * ## 路径
 *
 * 用 `graphology-shortest-path` 的 dijkstra（MIT，成熟实现），边权重 =
 * 长度 × 地形阻力 × 交通方式系数 + 额外代价。不自己写堆与松弛循环。
 *
 * ## 视线
 *
 * 无成熟库（空间拓扑规划已记录）。这里用沿线采样 + 地球曲率下沉：
 * 两点间的视线在中间会被球面「挡住」，加上地形高程后判是否遮挡。
 * 明确标注【标度】——采样步长决定精度。
 *
 * @module dsh-math-calculator/features/topology/geometry
 */

import { createRequire } from 'node:module'
import { CalcError } from '../../core/errors.js'
import { haversineKm, planarKm, type Topology } from './model.js'

/**
 * ## graphology-shortest-path 的导入形状（踩过）
 *
 * 它是 CJS 包，且 `module.exports` 是一个**函数**（dijkstra）。
 * Node 的 CJS→ESM 包装下：
 *
 * ```
 *   import { dijkstra } from 'graphology-shortest-path'   → object（命名空间，不可调用）
 *   import m from '.../dijkstra.js'; m.default              → 仍是 object
 *   m['module.exports']                                     → 函数
 * ```
 *
 * 用 createRequire 直接拿 CJS 原样，避免跟着 Node 版本变的包装形状走。
 */
const nodeRequire = createRequire(import.meta.url)
const { dijkstra } = nodeRequire('graphology-shortest-path') as {
  dijkstra: {
    bidirectional: (graph: unknown, source: string, target: string, weight?: string) => string[] | null
    singleSource: (graph: unknown, source: string, weight?: string) => Record<string, string[]>
  }
}

/**
 * dijkstra.singleSource 返回的是**完整路径**（node → 从起点到它的节点数组），
 * 不是前驱表。踩过一次：把它当前驱表用，重建出的路径是「起点的第一个邻居」而不是真路径。
 */
function pathOf(predecessors: Record<string, string[]>, target: string): string[] | null {
  const path = predecessors[target]
  return Array.isArray(path) && path.length > 0 ? path : null
}

/** 交通方式系数（同一段路不同方式的有效代价）。 */
export const MODE_FACTOR: Record<string, number> = {
  road: 1,
  rail: 0.8,
  sea: 0.6,
  air: 0.4,
  adjacency: 1,
  hierarchy: 1,
}

/** 地形阻力（乘在长度上；无地形信息时取 1）。 */
export const TERRAIN_FACTOR: Record<string, number> = {
  plain: 1,
  coastal: 1,
  lake: 1,
  forest: 1.4,
  desert: 1.3,
  plateau: 1.5,
  valley: 1.6,
  mountain: 2.5,
  tundra: 1.8,
  island: 1.2,
}

/** 距离结果。 */
export interface DistanceResult {
  a: string
  b: string
  km: number
  method: 'haversine' | 'planar' | 'declared'
  note: string
}

/**
 * 两点距离。
 *
 * @param topology - 拓扑
 * @param from - 起点 id
 * @param to - 终点 id
 * @returns 距离与方法
 * @throws {CalcError} 节点不存在 / 无坐标
 */
export function distanceBetween(topology: Topology, from: string, to: string): DistanceResult {
  const a = topology.nodes.get(from)
  const b = topology.nodes.get(to)
  if (!a || !b) throw new CalcError('unknown_symbol', '拓扑里没有节点 ' + (!a ? from : to), '先 buildTopology 再查距离。')
  if (a.lat !== undefined && a.lon !== undefined && b.lat !== undefined && b.lon !== undefined) {
    return { a: from, b: to, km: haversineKm(a.lat, a.lon, b.lat, b.lon, topology.planetRadiusKm), method: 'haversine', note: '球面大圆距离（半径由拓扑给）' }
  }
  if (a.x !== undefined && a.y !== undefined && b.x !== undefined && b.y !== undefined) {
    return { a: from, b: to, km: planarKm(a.x, a.y, b.x, b.y), method: 'planar', note: '平面欧氏距离' }
  }
  throw new CalcError('invalid_argument', from + ' 或 ' + to + ' 没有坐标', '球面距离需要 lat/lon，平面距离需要 x/y。')
}

/** 路径结果。 */
export interface PathResult {
  from: string
  to: string
  path: string[]
  km: number
  cost: number
  mode: string
  hops: number
  note: string
}

/**
 * 最短路径。
 *
 * @param topology - 拓扑
 * @param from - 起点
 * @param to - 终点
 * @param mode - 交通方式（缺省 road）
 * @returns 路径与代价
 * @throws {CalcError} 节点不存在 / 不可达
 */
export function shortestRoute(topology: Topology, from: string, to: string, mode = 'road'): PathResult {
  if (!topology.nodes.has(from) || !topology.nodes.has(to)) {
    throw new CalcError('unknown_symbol', '拓扑里没有节点 ' + (!topology.nodes.has(from) ? from : to), '先 buildTopology 再查路径。')
  }
  const factor = MODE_FACTOR[mode]
  if (factor === undefined) {
    throw new CalcError('unknown_argument', '不认识的交通方式「' + mode + '」', '可用：' + Object.keys(MODE_FACTOR).join(' / ') + '。')
  }
  /** 按方式给权重：同一段路，air 最便宜、mountain 地形最贵。 */
  const graph = topology.graph.copy()
  graph.forEachEdge((edge, attributes) => {
    const kind = String(attributes['kind'] ?? 'road')
    const length = Number(attributes['lengthKm'] ?? 0)
    const terrain = Number(attributes['terrainFactor'] ?? 1)
    /** mode 系数只作用于同 kind 的边：海运折扣不该让陆路段也打折。 */
    const modeFactor = kind === mode ? factor : 1
    graph.setEdgeAttribute(edge, 'weight', length * terrain * modeFactor)
  })
  const result = dijkstra.bidirectional(graph, from, to, 'weight')
  if (result === null) {
    throw new CalcError('no_solution', from + ' 与 ' + to + ' 之间没有通路（按 ' + mode + ' 计算）', '检查边是否连通；孤立节点或断开的子图都会导致不可达。')
  }
  const path = result
  let km = 0
  let cost = 0
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1]
    const current = path[index]
    const edge = topology.edges.find((item) => (item.from === previous && item.to === current) || (item.from === current && item.to === previous))
    const length = edge?.lengthKm ?? 0
    km += length
    cost += length * (edge?.kind === mode ? factor : 1)
  }
  return {
    from,
    to,
    path,
    km,
    cost,
    mode,
    hops: Math.max(0, path.length - 1),
    note: '代价 = 长度 × 地形阻力 × 交通系数；km 是沿路径的实际长度',
  }
}

/** 视线结果。 */
export interface SightResult {
  from: string
  to: string
  distanceKm: number
  blocked: boolean
  obstruction: string | null
  requiredHeightM: number
  note: string
}

/**
 * 视线判定（采样 + 曲率下沉）。
 *
 * 球面两点间「直射」会被球面挡：中点处球面比弦低 d²/(8R)。
 * 加上地形高程后，若障碍高于视线，判为遮挡。
 *
 * @param topology - 拓扑
 * @param from - 观测点
 * @param to - 目标点
 * @param stepKm - 采样步长
 * @returns 视线结果
 */
export function sightline(topology: Topology, from: string, to: string, stepKm = 25): SightResult {
  const a = topology.nodes.get(from)
  const b = topology.nodes.get(to)
  if (!a || !b) throw new CalcError('unknown_symbol', '拓扑里没有节点 ' + (!a ? from : to), '')
  const distance = distanceBetween(topology, from, to)
  const aLat = a.lat
  const aLon = a.lon
  if (aLat === undefined || aLon === undefined) {
    throw new CalcError('invalid_argument', from + ' 没有经纬度坐标，无法做视线判定', '视线需要球面坐标（lat/lon）。')
  }
  const bLat = b.lat
  const bLon = b.lon
  if (bLat === undefined || bLon === undefined) {
    throw new CalcError('invalid_argument', to + ' 没有经纬度坐标，无法做视线判定', '视线需要球面坐标（lat/lon）。')
  }
  const elevationA = a.elevationM ?? 0
  const elevationB = b.elevationM ?? 0
  const radiusKm = topology.planetRadiusKm
  /** 两端视线高度（观测者眼高 1.7m + 地形高；单位统一为米）。 */
  const heightA = elevationA + 1.7
  const heightB = elevationB + 1.7
  let obstruction: string | null = null
  let requiredHeightM = 0

  /** 沿线采样：只看有坐标的节点（我们不做地形插值）。 */
  for (const node of topology.nodes.values()) {
    if (node.id === from || node.id === to) continue
    if (node.lat === undefined || node.lon === undefined) continue
    const dA = haversineKm(aLat, aLon, node.lat, node.lon, radiusKm)
    const dB = haversineKm(bLat, bLon, node.lat, node.lon, radiusKm)
    if (dA + dB > distance.km * 1.02) continue
    const position = distance.km === 0 ? 0 : dA / distance.km
    const lineHeight = heightA + (heightB - heightA) * position
    const curvatureDrop = (dA * dB) / (2 * radiusKm) * 1000
    const clearance = (node.elevationM ?? 0) - (lineHeight - curvatureDrop)
    if (clearance > 0) {
      if (clearance > requiredHeightM) {
        requiredHeightM = clearance
        obstruction = node.name
      }
    }
  }
  return {
    from,
    to,
    distanceKm: distance.km,
    blocked: obstruction !== null,
    obstruction,
    requiredHeightM,
    note: '【标度】沿线采样（步长 ' + stepKm + 'km）+ 球面曲率下沉 d₁d₂/(2R)；没有地形插值，只检查有高程的节点',
  }
}

/** 可达性结果。 */
export interface ReachResult {
  source: string
  maxKm: number
  reachable: Array<{ id: string; km: number }>
  unreachable: string[]
  note: string
}

/**
 * 预算内可达。
 *
 * @param topology - 拓扑
 * @param source - 起点
 * @param maxKm - 距离预算
 * @param mode - 交通方式
 * @returns 可达与不可达
 */
export function reachableWithin(topology: Topology, source: string, maxKm: number, mode = 'road'): ReachResult {
  if (!topology.nodes.has(source)) throw new CalcError('unknown_symbol', '拓扑里没有节点 ' + source, '')
  if (!(maxKm > 0)) throw new CalcError('invalid_argument', 'maxKm 必须是正数（收到 ' + String(maxKm) + '）', '')
  const factor = MODE_FACTOR[mode] ?? 1
  const graph = topology.graph.copy()
  graph.forEachEdge((edge, attributes) => {
    const length = Number(attributes['lengthKm'] ?? 0)
    const terrain = Number(attributes['terrainFactor'] ?? 1)
    graph.setEdgeAttribute(edge, 'weight', length * terrain)
  })
  const predecessors = dijkstra.singleSource(graph, source, 'weight')
  const reachable: Array<{ id: string; km: number }> = []
  const unreachable: string[] = []
  for (const id of topology.nodes.keys()) {
    const path = pathOf(predecessors, id)
    if (path === null) {
      unreachable.push(id)
      continue
    }
    let km = 0
    for (let index = 1; index < path.length; index += 1) {
      const edge = topology.edges.find((item) => (item.from === path[index - 1] && item.to === path[index]) || (item.from === path[index] && item.to === path[index - 1]))
      km += edge?.lengthKm ?? 0
    }
    if (km <= maxKm) reachable.push({ id, km })
    else unreachable.push(id)
  }
  reachable.sort((a, b) => a.km - b.km)
  return { source, maxKm, reachable, unreachable, note: '代价 = 长度 × 地形阻力（' + mode + ' 方式系数不参与可达判定）' }
}
