/**
 * 因果溯源：从任意节点逆向找到它的依赖链。
 *
 * @module dsh-math-calculator/provenance-graph
 * @description
 * 方案补丁4。推演栈跑起来之后会遇到一个实际问题：
 * 用户问「这个 4903 米的建筑上限是怎么来的？」
 *
 * 答案是一条链：
 *
 *   建筑高度上限
 *     ← 材料强度密度比
 *       ← 键能范围
 *         ← e_charge, epsilon0, hbar, c
 *
 * 没有溯源，用户只能看到一个孤立的数字。有了溯源，他知道该改哪一项。
 *
 * ## 两种依赖源
 *
 * 1. **常数图**（`CONSTANT_GRAPH`）：派生常数依赖基础常数；
 * 2. **接口卡**（`INTERFACE_CARDS`）：上层的接口变量依赖下层。
 *
 * 两者拼成一张大图，节点是量名，边是「被谁决定」。
 */

import { CONSTANT_GRAPH } from './constants-graph.js'
import { INTERFACE_CARDS } from './derivation-stack.js'
import { CONSTRAINTS } from './feasibility.js'

/** 图中的一条边：from 依赖 to。 */
export interface Edge {
  /** 下游（被决定的量）。 */
  from: string
  /** 上游（决定它的量）。 */
  to: string
  /** 边所属的层（constant / P1 / P2 …）。 */
  layer: string
}

/** 溯源结果。 */
export interface TraceResult {
  /** 起点。 */
  target: string
  /** 是否找到。 */
  found: boolean
  /** 直接依赖（第一层）。 */
  direct: string[]
  /** 完整路径（从目标往下，去重）。 */
  chain: string[]
  /** 最终落到哪些「基础量」（不能再往上追的）。 */
  roots: string[]
  /** 面包屑导航（每层一行）。 */
  breadcrumb: Array<{ depth: number; names: string[] }>
  /** 若想改变这个量，最该动哪几个。 */
  adjust: string[]
}

/**
 * 构建完整的依赖图。
 *
 * @returns 边列表
 */
export function buildGraph(): Edge[] {
  const edges: Edge[] = []

  // ① 常数图
  for (const node of CONSTANT_GRAPH) {
    if (!node.dependsOn) continue
    for (const dependency of node.dependsOn) {
      edges.push({ from: node.name, to: dependency, layer: 'constant' })
    }
  }

  // ② 接口卡
  for (const layer of Object.keys(INTERFACE_CARDS)) {
    for (const card of INTERFACE_CARDS[layer]) {
      for (const dependency of card.dependsOn) {
        edges.push({ from: card.name, to: dependency, layer: layer })
      }
    }
  }

  // ③ 桥接边：让中间量能追到真正的基础参数
  // 没有这层，溯源会停在「表面重力」这种中间概念上——
  // 用户知道「建筑上限依赖重力」，但还是不知道该改什么。
  const bridges: Array<[string, string[], string]> = [
    ['表面重力', ['行星质量', '行星半径'], 'bridge'],
    ['大气密度', ['表面重力', '气压', '地表温度'], 'bridge'],
    ['地表温度', ['恒星辐射', '温室效应', '反照率'], 'bridge'],
    ['恒星质量', ['基础常数'], 'bridge'],
    ['恒星辐射', ['恒星质量', '轨道距离', '恒星光度'], 'bridge'],
  ]
  for (const bridge of bridges) {
    for (const dependency of bridge[1]) {
      edges.push({ from: bridge[0], to: dependency, layer: bridge[2] })
    }
  }

  // ④ 可行性约束：从 formula 里抽取它依赖的量
  // 这些约束名（如「建筑高度上限」）是作者最常问「这个数怎么来的」的对象，
  // 必须能溯源，否则用户只能看到一个孤立数字。
  for (const constraint of CONSTRAINTS) {
    const deps = extractDeps(constraint.formula, constraint.id)
    for (const dependency of deps) {
      edges.push({ from: constraint.name, to: dependency, layer: 'constraint' })
    }
  }

  return edges
}

/**
 * 从公式文本里抽取依赖的量名。
 *
 * 只做保守匹配——宁可少报，不要错报。
 *
 * @param formula - 公式文本
 * @param selfId - 自身 id（避免自依赖）
 * @returns 依赖的量名列表
 */
function extractDeps(formula: string, selfId: string): string[] {
  const deps: string[] = []
  const text = String(formula || '')
  // 用显式规则而非正则——公式文本格式不统一，正则容易误判。
  // 宁可少报依赖，也不要把错的量算进去（错误的溯源比没有更糟）。
  if (text.includes('g') || text.includes('重力')) deps.push('表面重力')
  if (text.includes('材料强度') || text.includes('strength')) deps.push('材料强度密度比')
  if (text.includes('ρ_air') || text.includes('空气密度')) deps.push('大气密度')
  if (text.includes('温度')) deps.push('地表温度')
  if (text.includes('恒星质量') || text.includes('M☉')) deps.push('恒星质量')
  return Array.from(new Set(deps))
}

/** 所有节点名。 */
export function allNodes(edges: Edge[]): Set<string> {
  const names = new Set<string>()
  for (const edge of edges) {
    names.add(edge.from)
    names.add(edge.to)
  }
  return names
}

/**
 * 从目标节点逆向溯源。
 *
 * @param target - 目标量名
 * @param edges - 依赖图（省略则现建）
 * @param maxDepth - 最大深度（防止图有环时无限递归）
 * @returns 溯源结果
 */
export function trace(target: string, edges?: Edge[], maxDepth = 8): TraceResult {
  const graph = edges ?? buildGraph()
  const byFrom = new Map<string, string[]>()
  for (const edge of graph) {
    const list = byFrom.get(edge.from) ?? []
    list.push(edge.to)
    byFrom.set(edge.from, list)
  }

  const direct = byFrom.get(target) ?? []
  const chain: string[] = []
  const roots: string[] = []
  const breadcrumb: Array<{ depth: number; names: string[] }> = []

  const visited = new Set<string>()
  const queue: Array<{ name: string; depth: number }> = direct.map(function (name) {
    return { name: name, depth: 1 }
  })
  breadcrumb.push({ depth: 0, names: [target] })

  while (queue.length > 0) {
    const current = queue.shift() as { name: string; depth: number }
    if (visited.has(current.name)) continue
    visited.add(current.name)
    if (current.depth > maxDepth) continue

    chain.push(current.name)
    const level = breadcrumb[current.depth]
    if (level === undefined) breadcrumb[current.depth] = { depth: current.depth, names: [current.name] }
    else level.names.push(current.name)

    const next = byFrom.get(current.name) ?? []
    if (next.length === 0) {
      // 没有上游 = 基础量
      if (!roots.includes(current.name)) roots.push(current.name)
      continue
    }
    for (const name of next) {
      queue.push({ name: name, depth: current.depth + 1 })
    }
  }

  // 「最该动哪几个」= 基础量（它们没有任何上游，改它们最直接）
  const adjust = roots.slice(0, 6)

  return {
    target: target,
    found: direct.length > 0,
    direct: direct,
    chain: chain,
    roots: roots,
    breadcrumb: breadcrumb,
    adjust: adjust,
  }
}

/**
 * 找出「哪些量依赖目标」——反向溯源。
 *
 * 改一个常数时，这个函数告诉你影响面有多大。
 *
 * @param target - 目标量名（如 c）
 * @param edges - 依赖图
 * @returns 直接与间接下游
 */
export function impact(target: string, edges?: Edge[]): { direct: string[]; indirect: string[] } {
  const graph = edges ?? buildGraph()
  const byTo = new Map<string, string[]>()
  for (const edge of graph) {
    const list = byTo.get(edge.to) ?? []
    list.push(edge.from)
    byTo.set(edge.to, list)
  }

  const direct = byTo.get(target) ?? []
  const indirect: string[] = []
  const visited = new Set<string>(direct)
  const queue = direct.slice()

  while (queue.length > 0) {
    const current = queue.shift() as string
    const next = byTo.get(current) ?? []
    for (const name of next) {
      if (visited.has(name)) continue
      visited.add(name)
      indirect.push(name)
      queue.push(name)
    }
  }

  return { direct: direct, indirect: indirect }
}

/**
 * 渲染溯源报告。
 *
 * @param result - trace 的结果
 * @returns 可读文本
 */
export function renderTrace(result: TraceResult): string {
  const out: string[] = []
  out.push('═══ 因果溯源：' + result.target + ' ═══')
  out.push('')
  if (!result.found) {
    out.push('  这个量没有上游依赖——它本身就是基础量，改它最直接。')
    return out.join(String.fromCharCode(10))
  }
  out.push('【依赖链】（越往下越基础）')
  for (const level of result.breadcrumb) {
    if (level.names.length === 0) continue
    const indent = '  ' + '  '.repeat(Math.min(level.depth, 6))
    const arrow = level.depth === 0 ? '●' : '←'
    out.push(indent + arrow + ' ' + level.names.join(', '))
  }
  out.push('')
  out.push('【最终落到的基础量】')
  out.push('  ' + (result.roots.length > 0 ? result.roots.join(', ') : '（无法继续追溯）'))
  out.push('')
  out.push('【想改变「' + result.target + '」，最该动这些】')
  out.push('  ' + (result.adjust.length > 0 ? result.adjust.join(', ') : '（直接改它自己）'))
  out.push('')
  out.push('说明：基础量没有任何上游，改它们最直接；中间量也能改，但会与其它推导冲突。')
  return out.join(String.fromCharCode(10))
}

/**
 * 渲染影响面报告。
 *
 * @param target - 目标量
 * @param result - impact 的结果
 * @returns 可读文本
 */
export function renderImpact(target: string, result: { direct: string[]; indirect: string[] }): string {
  const out: string[] = []
  out.push('═══ 影响面：改 ' + target + ' 会波及什么 ═══')
  out.push('')
  out.push('【直接依赖它的】' + (result.direct.length > 0 ? '' : '（无）'))
  for (const name of result.direct) out.push('  · ' + name)
  out.push('')
  out.push('【间接波及的】共 ' + result.indirect.length + ' 项')
  for (const name of result.indirect.slice(0, 15)) out.push('  · ' + name)
  if (result.indirect.length > 15) out.push('  …还有 ' + (result.indirect.length - 15) + ' 项')
  out.push('')
  out.push('改之前先看这个清单——波及面越大，越需要重新校验。')
  return out.join(String.fromCharCode(10))
}
