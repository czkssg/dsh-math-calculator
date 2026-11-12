/**
 * 实体拓扑的七条通用规则。
 *
 * 这七条来自反馈包 17 号的设计：闭合 / 对称 / 无环 / 可达 / 容量 / 连续 / 一致。
 * 规则本身不绑定领域（不预设「城市必须有城墙」），只检查拓扑的**结构性质**。
 *
 * ## 边界
 *
 * - 检查只报事实与位置，不判断「这个设定对不对」；
 * - 任何一条失败都不阻断其它检查；
 * - 缺数据（没给容量/没给坐标）时明确说「没检查」，不当通过。
 *
 * @module dsh-math-calculator/features/topology/rules
 */

import { connectedComponents } from 'graphology-components'
import { createRequire } from 'node:module'
import { haversineKm, planarKm, type Topology } from './model.js'

/** graphology-shortest-path 是 CJS 函数导出，用 createRequire 直接拿原样（见 geometry.ts 的说明）。 */
const nodeRequire = createRequire(import.meta.url)
const { dijkstra } = nodeRequire('graphology-shortest-path') as {
  dijkstra: { bidirectional: (graph: unknown, source: string, target: string, weight?: string) => string[] | null }
}

/** 一条规则结论。 */
export interface RuleFinding {
  rule: 'closure' | 'symmetry' | 'acyclic' | 'reachable' | 'capacity' | 'continuity' | 'consistency'
  status: 'ok' | 'warn' | 'unchecked'
  message: string
  where?: string[]
}

/** 规则输入。 */
export interface RuleContext {
  /** 闭合检查：每组「分项之和 vs 总量」。 */
  groups?: Array<{ name: string; total: number; parts: Array<{ name: string; value: number }> }>
  /** 容量检查：边的容量与负载（缺省读 props.capacity / props.load）。 */
  capacities?: Array<{ from: string; to: string; capacity: number; load: number }>
  /** 一致检查：同一实体的属性在不同来源里的值。 */
  properties?: Array<{ entity: string; key: string; values: Array<{ source: string; value: unknown }> }>
  /** 可达性起点（缺省取第一个节点）。 */
  source?: string
  /** 连续性阈值：声明长度与坐标距离的相对偏差（缺省 0.2）。 */
  continuityTolerance?: number
  /** 闭合容差（缺省 0.01）。 */
  closureTolerance?: number
}

/** 自由度检查结果。 */
export interface RulesOutcome {
  result: string
  value: { findings: RuleFinding[]; counts: { ok: number; warn: number; unchecked: number } }
  notice?: string
}

/** 数字渲染。 */
function f(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e6 || (abs > 0 && abs < 1e-3)) return value.toExponential(2)
  return Number(value.toPrecision(4)).toString()
}

/**
 * 跑七条规则。
 *
 * @param topology - 拓扑
 * @param context - 规则输入（分组/容量/属性/起点）
 * @returns 结论与统计
 */
export function checkRules(topology: Topology, context: RuleContext = {}): RulesOutcome {
  const findings: RuleFinding[] = []
  const tolerance = context.continuityTolerance !== undefined && context.continuityTolerance > 0 ? context.continuityTolerance : 0.2
  const closureTolerance = context.closureTolerance !== undefined && context.closureTolerance >= 0 ? context.closureTolerance : 0.01

  // ① 闭合：分项和 vs 总量
  if (context.groups === undefined || context.groups.length === 0) {
    findings.push({ rule: 'closure', status: 'unchecked', message: '没给 groups，闭合未检查' })
  } else {
    for (const group of context.groups) {
      const sum = group.parts.reduce((total, part) => total + part.value, 0)
      const gap = group.total === 0 ? (sum === 0 ? 0 : Number.POSITIVE_INFINITY) : Math.abs(sum - group.total) / Math.abs(group.total)
      if (gap > closureTolerance) {
        findings.push({
          rule: 'closure',
          status: 'warn',
          message: group.name + '：分项和 ' + f(sum) + ' 与总量 ' + f(group.total) + ' 差 ' + (gap * 100).toFixed(1) + '%',
          where: group.parts.map((part) => part.name),
        })
      } else {
        findings.push({ rule: 'closure', status: 'ok', message: group.name + '：分项和 ' + f(sum) + ' 与总量闭合' })
      }
    }
  }

  // ② 对称：单向边/不成对关系
  const oneWay = topology.edges.filter((edge) => edge.bidirectional === false)
  if (topology.edges.length === 0) findings.push({ rule: 'symmetry', status: 'unchecked', message: '没有边，对称性未检查' })
  else if (oneWay.length === 0) findings.push({ rule: 'symmetry', status: 'ok', message: '所有边都按双向处理' })
  else findings.push({ rule: 'symmetry', status: 'warn', message: oneWay.length + ' 条边标为单向（可达性会偏乐观）', where: oneWay.map((edge) => edge.from + '→' + edge.to) })

  // ③ 无环（无向图的圈：E − N + C > 0；不能用 DAG 的 hasCycle，它会把每条单边判成环）
  const cycleCount = topology.graph.size - topology.graph.order + connectedComponents(topology.graph).length
  findings.push(
    cycleCount > 0
      ? { rule: 'acyclic', status: 'warn', message: '拓扑里有圈（' + cycleCount + ' 个）；若这是辖属关系，圈意味着上级链闭合' }
      : { rule: 'acyclic', status: 'ok', message: '无环' },
  )

  // ④ 可达
  const source = context.source ?? [...topology.nodes.keys()][0]
  if (source === undefined) {
    findings.push({ rule: 'reachable', status: 'unchecked', message: '没有节点，可达性未检查' })
  } else {
    const graph = topology.graph.copy()
    graph.forEachEdge((edge, attributes) => {
      const length = Number(attributes['lengthKm'] ?? 0)
      const terrain = Number(attributes['terrainFactor'] ?? 1)
      graph.setEdgeAttribute(edge, 'weight', length * terrain)
    })
    const unreachable = [...topology.nodes.keys()].filter((id) => id !== source && dijkstra.bidirectional(graph, source, id, 'weight') === null)
    findings.push(
      unreachable.length === 0
        ? { rule: 'reachable', status: 'ok', message: '从 ' + source + ' 可达全部 ' + topology.nodes.size + ' 个节点' }
        : { rule: 'reachable', status: 'warn', message: '从 ' + source + ' 不可达 ' + unreachable.length + ' 个节点', where: unreachable },
    )
  }

  // ⑤ 容量
  if (context.capacities === undefined || context.capacities.length === 0) {
    findings.push({ rule: 'capacity', status: 'unchecked', message: '没给 capacities，容量未检查' })
  } else {
    for (const item of context.capacities) {
      const over = item.load - item.capacity
      findings.push(
        over > 0
          ? { rule: 'capacity', status: 'warn', message: item.from + ' → ' + item.to + ' 负载超出容量 ' + f(over) + '（负载 ' + f(item.load) + ' / 容量 ' + f(item.capacity) + '）' }
          : { rule: 'capacity', status: 'ok', message: item.from + ' → ' + item.to + ' 容量尚有余量 ' + f(-over) },
      )
    }
  }

  // ⑥ 连续：声明长度 vs 坐标距离
  let continuityChecked = 0
  for (const edge of topology.edges) {
    const a = topology.nodes.get(edge.from)!
    const b = topology.nodes.get(edge.to)!
    let computed: number | undefined
    if (a.lat !== undefined && a.lon !== undefined && b.lat !== undefined && b.lon !== undefined) {
      computed = haversineKm(a.lat, a.lon, b.lat, b.lon, topology.planetRadiusKm)
    } else if (a.x !== undefined && a.y !== undefined && b.x !== undefined && b.y !== undefined) {
      computed = planarKm(a.x, a.y, b.x, b.y)
    }
    if (computed === undefined || edge.lengthKm === undefined || edge.lengthKm === 0) continue
    continuityChecked += 1
    const deviation = Math.abs(edge.lengthKm - computed) / computed
    if (deviation > tolerance) {
      findings.push({
        rule: 'continuity',
        status: 'warn',
        message: edge.from + ' → ' + edge.to + ' 声明 ' + f(edge.lengthKm) + ' km，但坐标距离 ' + f(computed) + ' km（偏差 ' + (deviation * 100).toFixed(0) + '%）',
        where: [edge.from, edge.to],
      })
    }
  }
  if (continuityChecked === 0) findings.push({ rule: 'continuity', status: 'unchecked', message: '没有「声明长度 + 坐标」的边，连续性未检查' })
  else if (!findings.some((finding) => finding.rule === 'continuity')) findings.push({ rule: 'continuity', status: 'ok', message: continuityChecked + ' 条边的声明长度与坐标距离一致' })

  // ⑦ 一致：同一实体属性在不同来源冲突
  if (context.properties === undefined || context.properties.length === 0) {
    findings.push({ rule: 'consistency', status: 'unchecked', message: '没给 properties，一致性未检查' })
  } else {
    for (const property of context.properties) {
      const unique = [...new Set(property.values.map((value) => JSON.stringify(value.value)))]
      findings.push(
        unique.length <= 1
          ? { rule: 'consistency', status: 'ok', message: property.entity + '.' + property.key + ' 各处一致' }
          : { rule: 'consistency', status: 'warn', message: property.entity + '.' + property.key + ' 出现 ' + unique.length + ' 种值（' + unique.join(' / ') + '）', where: property.values.map((value) => value.source) },
      )
    }
  }

  const counts = { ok: findings.filter((finding) => finding.status === 'ok').length, warn: findings.filter((finding) => finding.status === 'warn').length, unchecked: findings.filter((finding) => finding.status === 'unchecked').length }
  const lines = ['═══ 实体拓扑七规则 ═══', '', '  ok ' + counts.ok + ' / warn ' + counts.warn + ' / 未检查 ' + counts.unchecked, '']
  const labels = { closure: '闭合', symmetry: '对称', acyclic: '无环', reachable: '可达', capacity: '容量', continuity: '连续', consistency: '一致' } as const
  for (const finding of findings) {
    const mark = finding.status === 'ok' ? '✓' : finding.status === 'warn' ? '✗' : '○'
    lines.push('  ' + mark + ' [' + labels[finding.rule] + '] ' + finding.message)
  }
  lines.push('', '  ★ 规则只查结构性质，不判设定好坏；未检查项明确标「未检查」。')
  return { result: lines.join('\n'), value: { findings, counts }, ...(counts.warn > 0 ? { notice: '有 ' + counts.warn + ' 条结构警告' } : {}) }
}
