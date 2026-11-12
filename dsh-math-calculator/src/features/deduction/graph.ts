/**
 * 依赖图、因果溯源与影响面（`graph` / `trace` / `impact`）。
 *
 * ## 三个视角，一张图
 *
 * ```
 *   graph    整张图：节点、边、层深、坐标
 *   trace    「这个量是怎么来的」——从目标往基础量走
 *   impact   「改这个量会波及什么」——从基础量往目标走
 * ```
 *
 * ## 图的来源
 *
 * 三处合并：常数依赖图（调用方注入）、接口卡的 dependsOn、可行性约束的公式。
 * 另加一层桥接边：没有它，溯源会停在「表面重力」这种中间概念上——
 * 用户知道建筑上限依赖重力，但还是不知道该改什么。
 *
 * ## 不猜
 *
 * 从公式文本抽依赖只做保守匹配（宁可少报，不要错报）。错误的溯源比没有更糟。
 *
 * @module dsh-math-calculator/features/deduction/graph
 */

import { INTERFACE_CARDS } from './derivation-stack.js'
import { CONSTRAINTS } from './feasibility.js'

/** 一条依赖边（from = 下游，to = 上游）。 */
export interface DependencyEdge {
  from: string
  to: string
  layer: string
}

/** 可注入的额外数据。 */
export interface GraphDeps {
  /** 常数依赖图（通常来自 `src/data/constants-graph.json` 的 name/dependsOn）。 */
  constantGraph?: Array<{ name: string; dependsOn?: string[] }>
}

/** 溯源结果。 */
export interface TraceResult {
  target: string
  found: boolean
  direct: string[]
  chain: string[]
  roots: string[]
  breadcrumb: Array<{ depth: number; names: string[] }>
  adjust: string[]
}

/** 从公式文本抽依赖（保守匹配）。 */
function extractDeps(formula: string): string[] {
  const deps: string[] = []
  const text = String(formula || '')
  if (text.includes('g') || text.includes('重力')) deps.push('表面重力')
  if (text.includes('材料强度') || text.includes('strength')) deps.push('材料强度密度比')
  if (text.includes('ρ_air') || text.includes('空气密度')) deps.push('大气密度')
  if (text.includes('温度')) deps.push('地表温度')
  if (text.includes('恒星质量') || text.includes('M☉')) deps.push('恒星质量')
  return [...new Set(deps)]
}

/**
 * 建图。
 *
 * @param deps - 可注入的常数图
 * @returns 边列表
 */
export function buildDependencyGraph(deps: GraphDeps = {}): DependencyEdge[] {
  const edges: DependencyEdge[] = []

  for (const node of deps.constantGraph ?? []) {
    for (const dependency of node.dependsOn ?? []) edges.push({ from: node.name, to: dependency, layer: 'constant' })
  }

  for (const layer of Object.keys(INTERFACE_CARDS)) {
    for (const card of INTERFACE_CARDS[layer]) {
      for (const dependency of card.dependsOn) edges.push({ from: card.name, to: dependency, layer })
    }
  }

  /** 桥接边：让中间量能追到真正的基础参数。 */
  const bridges: Array<[string, string[]]> = [
    ['表面重力', ['行星质量', '行星半径']],
    ['大气密度', ['表面重力', '气压', '地表温度']],
    ['地表温度', ['恒星辐射', '温室效应', '反照率']],
    ['恒星质量', ['基础常数']],
    ['恒星辐射', ['恒星质量', '轨道距离', '恒星光度']],
  ]
  for (const [from, tos] of bridges) for (const to of tos) edges.push({ from, to, layer: 'bridge' })

  for (const constraint of CONSTRAINTS) {
    for (const dependency of extractDeps(constraint.formula)) edges.push({ from: constraint.name, to: dependency, layer: 'constraint' })
  }

  return edges
}

/** 所有节点名。 */
export function allNodeNames(edges: DependencyEdge[]): Set<string> {
  const names = new Set<string>()
  for (const edge of edges) {
    names.add(edge.from)
    names.add(edge.to)
  }
  return names
}

/**
 * 从目标逆向溯源。
 *
 * @param target - 目标量名
 * @param edges - 依赖图
 * @param maxDepth - 最大深度（防环）
 * @returns 溯源结果
 */
export function traceTarget(target: string, edges: DependencyEdge[], maxDepth = 8): TraceResult {
  const byFrom = new Map<string, string[]>()
  for (const edge of edges) {
    const list = byFrom.get(edge.from) ?? []
    list.push(edge.to)
    byFrom.set(edge.from, list)
  }
  const direct = byFrom.get(target) ?? []
  const chain: string[] = []
  const roots: string[] = []
  const breadcrumb: Array<{ depth: number; names: string[] }> = [{ depth: 0, names: [target] }]
  const visited = new Set<string>()
  const queue: Array<{ name: string; depth: number }> = direct.map((name) => ({ name, depth: 1 }))

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current.name)) continue
    visited.add(current.name)
    if (current.depth > maxDepth) continue
    chain.push(current.name)
    const level = breadcrumb[current.depth]
    if (level === undefined) breadcrumb[current.depth] = { depth: current.depth, names: [current.name] }
    else level.names.push(current.name)
    const next = byFrom.get(current.name) ?? []
    if (next.length === 0) {
      if (!roots.includes(current.name)) roots.push(current.name)
      continue
    }
    for (const name of next) queue.push({ name, depth: current.depth + 1 })
  }

  return { target, found: direct.length > 0, direct, chain, roots, breadcrumb, adjust: roots.slice(0, 6) }
}

/**
 * 反向溯源：改目标会波及什么。
 *
 * @param target - 目标量名
 * @param edges - 依赖图
 * @returns 直接与间接下游
 */
export function impactOf(target: string, edges: DependencyEdge[]): { direct: string[]; indirect: string[] } {
  const byTo = new Map<string, string[]>()
  for (const edge of edges) {
    const list = byTo.get(edge.to) ?? []
    list.push(edge.from)
    byTo.set(edge.to, list)
  }
  const direct = byTo.get(target) ?? []
  const indirect: string[] = []
  const visited = new Set<string>(direct)
  const queue = direct.slice()
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const name of byTo.get(current) ?? []) {
      if (visited.has(name)) continue
      visited.add(name)
      indirect.push(name)
      queue.push(name)
    }
  }
  return { direct, indirect }
}

/** 布局参数。 */
export const NODE_W = 108
export const NODE_H = 24
export const GAP_X = 14
export const GAP_Y = 56
export const PAD = 16

/** 一个节点。 */
export interface LayoutNode {
  id: string
  depth: number
  layer: string
  x: number
  y: number
}

/** 布局结果。 */
export interface GraphLayout {
  nodes: LayoutNode[]
  edges: Array<{ from: string; to: string }>
  maxDepth: number
  width: number
  height: number
}

/**
 * 按层深布局（不做力导向：依赖图的层深本身就是信息）。
 *
 * @param edges - 依赖图
 * @param focus - 焦点节点（只影响高亮，不裁剪）
 * @param depths - 只保留指定层深（界面折叠用）
 * @returns 布局
 */
export function layoutDependencyGraph(edges: DependencyEdge[], focus?: string, depths?: number[]): GraphLayout & { focusNode: string | null } {
  const byFrom = new Map<string, string[]>()
  for (const edge of edges) {
    const list = byFrom.get(edge.from) ?? []
    list.push(edge.to)
    byFrom.set(edge.from, list)
  }
  const depthOf = new Map<string, number>()
  const visiting = new Set<string>()
  const compute = (name: string): number => {
    const memo = depthOf.get(name)
    if (memo !== undefined) return memo
    if (visiting.has(name)) return 0
    visiting.add(name)
    const ups = byFrom.get(name) ?? []
    const value = ups.length === 0 ? 0 : 1 + Math.max(...ups.map(compute))
    visiting.delete(name)
    depthOf.set(name, value)
    return value
  }
  const names = [...allNodeNames(edges)].sort()
  for (const name of names) compute(name)

  const keep = depths !== undefined && depths.length > 0 ? new Set(depths) : null
  const byDepth = new Map<number, string[]>()
  for (const name of names) {
    const depth = depthOf.get(name) ?? 0
    if (keep !== null && !keep.has(depth)) continue
    const list = byDepth.get(depth) ?? []
    list.push(name)
    byDepth.set(depth, list)
  }

  const nodes: LayoutNode[] = []
  let maxWidth = 0
  const sortedDepths = [...byDepth.keys()].sort((a, b) => a - b)
  for (const depth of sortedDepths) {
    const row = byDepth.get(depth)!
    row.forEach((name, index) => {
      const layer = edges.find((edge) => edge.from === name)?.layer ?? edges.find((edge) => edge.to === name)?.layer ?? 'other'
      nodes.push({ id: name, depth, layer, x: PAD + index * (NODE_W + GAP_X), y: PAD + depth * (NODE_H + GAP_Y) })
      maxWidth = Math.max(maxWidth, PAD + (index + 1) * (NODE_W + GAP_X))
    })
  }
  const maxDepth = sortedDepths.length > 0 ? Math.max(...sortedDepths) : 0
  return {
    nodes,
    edges: edges.map((edge) => ({ from: edge.from, to: edge.to })),
    maxDepth,
    width: maxWidth,
    height: PAD + (maxDepth + 1) * (NODE_H + GAP_Y),
    focusNode: focus !== undefined && names.includes(focus) ? focus : null,
  }
}

/** 渲染溯源。 */
export function renderTrace(result: TraceResult): string {
  const out: string[] = ['═══ 因果溯源：' + result.target + ' ═══', '']
  if (!result.found) {
    out.push('  这个量没有上游依赖——它本身就是基础量，改它最直接。')
    return out.join('\n')
  }
  out.push('【依赖链】（越往下越基础）')
  for (const level of result.breadcrumb) {
    if (level.names.length === 0) continue
    const indent = '  ' + '  '.repeat(Math.min(level.depth, 6))
    out.push(indent + (level.depth === 0 ? '● ' : '← ') + level.names.join(', '))
  }
  out.push('', '【最终落到的基础量】', '  ' + (result.roots.length > 0 ? result.roots.join(', ') : '（无法继续追溯）'))
  out.push('', '【想改变「' + result.target + '」，最该动这些】', '  ' + (result.adjust.length > 0 ? result.adjust.join(', ') : '（直接改它自己）'))
  out.push('', '说明：基础量没有任何上游，改它们最直接；中间量也能改，但会与其它推导冲突。')
  return out.join('\n')
}

/** 渲染影响面。 */
export function renderImpact(target: string, result: { direct: string[]; indirect: string[] }): string {
  const out: string[] = ['═══ 影响面：改 ' + target + ' 会波及什么 ═══', '']
  out.push('【直接依赖它的】' + (result.direct.length > 0 ? '' : '（无）'))
  for (const name of result.direct) out.push('  · ' + name)
  out.push('', '【间接波及的】共 ' + result.indirect.length + ' 项')
  for (const name of result.indirect.slice(0, 15)) out.push('  · ' + name)
  if (result.indirect.length > 15) out.push('  …还有 ' + (result.indirect.length - 15) + ' 项')
  out.push('', '改之前先看这个清单——波及面越大，越需要重新校验。')
  return out.join('\n')
}
