/**
 * 公式-链结构图：665 条公式与 22 条推演链连成一张图。
 *
 * ## 为什么需要
 *
 * 公式库（formulas.json）与体系链（systems.json）是两份独立的文本：
 * 一条链只写了 `{formula, note}`，**没有参数映射**——所以「改 A → 末端变多少」
 * 目前做不到数值传导。先把它们连成结构图，能回答的是：
 *
 * ```
 *   这条公式出现在哪些链里
 *   这条链有哪几步、各步用哪条公式
 *   哪些公式不在任何链里（孤立）
 *   链内有没有环（顺序错乱）
 * ```
 *
 * 数值传导缺的是「每一步的输入来自上一步的哪个输出」这份映射；
 * 图上会明确标出这个缺口，不假装能算。
 *
 * @module dsh-math-calculator/features/formulas/formula-graph
 */

import Graph from 'graphology'
import { connectedComponents } from 'graphology-components'
import { CalcError } from '../../core/errors.js'
import type { FormulaEntry } from './query.js'

/** 体系链（与 systems.json 同形）。 */
export interface FormulaSystem {
  id: string
  name: string
  purpose?: string
  keys?: string[]
  steps: Array<{ formula: string; note?: string }>
}

/** 结果。 */
export interface FormulaGraphOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 建图。 */
export function buildFormulaGraph(
  formulas: FormulaEntry[],
  systems: FormulaSystem[],
): { graph: Graph; missingFormulaSteps: string[] } {
  const graph = new Graph({ multi: false, type: 'directed' })
  const formulaIds = new Set(formulas.map((formula) => formula.id))
  for (const formula of formulas) graph.addNode('formula:' + formula.id, { kind: 'formula', label: formula.name })
  const missingFormulaSteps: string[] = []
  for (const system of systems) {
    graph.addNode('system:' + system.id, { kind: 'system', label: system.name })
    system.steps.forEach((step, index) => {
      if (!formulaIds.has(step.formula)) {
        missingFormulaSteps.push(system.id + ' 第 ' + (index + 1) + ' 步引用了不存在的公式 ' + step.formula)
        return
      }
      /** 同一对节点可能出现在多条链里：non-multi 图要先判重，否则 addEdge 直接抛错。 */
      if (!graph.hasEdge('system:' + system.id, 'formula:' + step.formula)) {
        graph.addEdge('system:' + system.id, 'formula:' + step.formula, { kind: 'has-step', order: index })
      }
      /** 链内顺序边：只表示「先算这一步，再算下一步」，不代表数据流。 */
      if (index > 0) {
        const previous = system.steps[index - 1]
        if (formulaIds.has(previous.formula) && previous.formula !== step.formula) {
          const fromNode = 'formula:' + previous.formula
          const toNode = 'formula:' + step.formula
          /** 同一对公式可能在多条链里相邻出现；重复边对结构查询没有增量。 */
          if (!graph.hasEdge(fromNode, toNode)) graph.addEdge(fromNode, toNode, { kind: 'sequence', system: system.id })
        }
      }
    })
  }
  return { graph, missingFormulaSteps }
}

/**
 * 查询公式图。
 *
 * @param formulas - 公式库
 * @param systems - 体系链
 * @param focus - 公式 id 或链 id（可空）
 * @returns 报告
 * @throws {CalcError} focus 不存在
 */
export function runFormulaGraph(formulas: FormulaEntry[], systems: FormulaSystem[], focus?: string): FormulaGraphOutcome {
  const { graph, missingFormulaSteps } = buildFormulaGraph(formulas, systems)
  const lines: string[] = ['═══ 公式-链结构图 ═══', '']

  if (typeof focus === 'string' && focus.trim() !== '') {
    const wanted = focus.trim()
    const formulaNode = 'formula:' + wanted
    const systemNode = 'system:' + wanted
    if (graph.hasNode(formulaNode)) {
      const inSystems = graph.inNeighbors(formulaNode).filter((node) => node.startsWith('system:'))
      const stepGraph = graph.inNeighbors(formulaNode).filter((node) => node.startsWith('formula:'))
      const formula = formulas.find((item) => item.id === wanted)
      lines.push('【公式】' + (formula?.name ?? wanted) + '（' + wanted + '）')
      lines.push('  表达式：' + (formula?.expr ?? '—') + '  单位：' + (formula?.unit ?? '—'))
      lines.push('  出现在 ' + inSystems.length + ' 条链里：' + (inSystems.map((node) => node.replace('system:', '')).join('、') || '（不在任何链里）'))
      if (stepGraph.length > 0) lines.push('  链内前序步骤：' + stepGraph.map((node) => node.replace('formula:', '')).join('、'))
      return { result: lines.join('\n'), value: { focus: wanted, systems: inSystems.map((node) => node.replace('system:', '')), previous: stepGraph.map((node) => node.replace('formula:', '')) } }
    }
    if (graph.hasNode(systemNode)) {
      const system = systems.find((item) => item.id === wanted)
      lines.push('【链】' + (system?.name ?? wanted) + '（' + wanted + '）')
      if (system?.purpose) lines.push('  用途：' + system.purpose)
      lines.push('  ' + system!.steps.length + ' 步：')
      for (let index = 0; index < system!.steps.length; index += 1) {
        const step = system!.steps[index]
        const formula = formulas.find((item) => item.id === step.formula)
        lines.push('  ' + String(index + 1).padStart(2) + '. ' + step.formula.padEnd(26) + (formula?.name ?? '（缺公式）') + (step.note ? '  · ' + step.note : ''))
      }
      return { result: lines.join('\n'), value: { focus: wanted, steps: system!.steps.map((step) => step.formula) } }
    }
    throw new CalcError('unknown_symbol', '公式图里没有 "' + wanted + '"', '可查：公式 id（如 ideal_strength）或链 id（如 sys-material）。')
  }

  const formulaNodes = graph.filterNodes((node) => node.startsWith('formula:'))
  const systemNodes = graph.filterNodes((node) => node.startsWith('system:'))
  const isolatedFormulas = formulaNodes.filter((node) => graph.inDegree(node) === 0)
  const links = systemNodes.map((node) => {
    const system = systems.find((item) => item.id === node.replace('system:', ''))
    return { id: system?.id ?? node, steps: system?.steps.length ?? 0 }
  })
  const components = connectedComponents(graph)
  lines.push('  公式 ' + formulaNodes.length + ' 条 · 链 ' + systemNodes.length + ' 条 · 边 ' + graph.size + ' 条 · 连通分量 ' + components.length + ' 个')
  lines.push('  不在任何链里的公式：' + isolatedFormulas.length + ' 条（' + isolatedFormulas.slice(0, 8).map((node) => node.replace('formula:', '')).join('、') + (isolatedFormulas.length > 8 ? ' …' : '') + '）')
  lines.push('', '  链与步数：')
  for (const link of links) lines.push('    ' + link.id.padEnd(24) + link.steps + ' 步')
  lines.push('')
  lines.push('【已知缺口】链的每一步只写了 formula + note，**没有参数映射**（「上一步的哪个输出喂给这一步的哪个参数」）。')
  lines.push('  所以本图只能做结构查询；「改 A → 末端变多少」的数值传导需要先补这份映射。')
  if (missingFormulaSteps.length > 0) {
    lines.push('', '【悬空引用】' + missingFormulaSteps.length + ' 处')
    for (const item of missingFormulaSteps.slice(0, 10)) lines.push('  · ' + item)
  }
  return {
    result: lines.join('\n'),
    value: {
      formulas: formulaNodes.length,
      systems: systemNodes.length,
      edges: graph.size,
      connectedComponents: components.length,
      isolatedFormulas: isolatedFormulas.map((node) => node.replace('formula:', '')),
      systemsList: links,
      missingFormulaSteps,
      gap: 'steps 缺参数映射（上一步输出 → 这一步输入），数值传导暂不可做',
    },
    ...(missingFormulaSteps.length > 0 ? { notice: '链里有悬空公式引用' } : {}),
  }
}
