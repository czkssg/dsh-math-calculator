/**
 * 公式网：单条公式的上下游上下文（供 formula 调用时附带）。
 *
 * @module dsh-math-calculator/features/formulas/web-context
 */

import type { FormulaWeb, WebFormula } from './web.js'

/** 一个相邻节点。 */
export interface WebNeighbor {
  kind: 'constant' | 'formula'
  id: string
  name: string
  /** 下游参数名（上游）/ 上游参数名（下游）。 */
  param: string
  group?: string
}

/** 上下游上下文。 */
export interface WebContext {
  focus: string
  /** focus 若为别名，这里是主节点。 */
  canonical: string
  upstream: WebNeighbor[]
  downstream: WebNeighbor[]
}

/**
 * 取一条公式的上下游。
 *
 * @param web - 公式网
 * @param formulas - 公式表（取名称）
 * @param id - 公式 id（可以是别名）
 * @returns 上下游（已去重）
 */
export function webContextOf(web: FormulaWeb, formulas: WebFormula[], id: string): WebContext {
  const aliases = web.aliases ?? {}
  const canonical = aliases[id] ?? id
  const nameOf = (value: string): string => formulas.find((item) => item.id === value)?.name ?? value
  const upstream: WebNeighbor[] = []
  const downstream: WebNeighbor[] = []
  const seen = new Set<string>()
  for (const edge of web.constantEdges ?? []) {
    if (edge[1] !== canonical) continue
    const key = 'constant>' + edge[0] + '>' + edge[2]
    if (seen.has(key)) continue
    seen.add(key)
    upstream.push({ kind: 'constant', id: edge[0], name: edge[0], param: edge[2] })
  }
  for (const edge of web.formulaEdges ?? []) {
    if (edge[1] === canonical) {
      const key = 'formula>' + edge[0] + '>' + edge[2]
      if (!seen.has(key)) {
        seen.add(key)
        upstream.push({ kind: 'formula', id: edge[0], name: nameOf(edge[0]), param: edge[2], group: edge[3] })
      }
    }
    if (edge[0] === canonical) {
      const key = 'out>' + edge[1] + '>' + edge[2]
      if (!seen.has(key)) {
        seen.add(key)
        downstream.push({ kind: 'formula', id: edge[1], name: nameOf(edge[1]), param: edge[2], group: edge[3] })
      }
    }
  }
  return { focus: id, canonical, upstream, downstream }
}

/**
 * 一行摘要（给 notice）。
 *
 * @param context - 上下游
 * @returns 摘要文本
 */
export function webContextSummary(context: WebContext): string {
  const brief = (list: WebNeighbor[]): string => list.slice(0, 3).map((item) => item.id).join('、')
  const parts: string[] = []
  if (context.upstream.length > 0) parts.push('上游 ' + context.upstream.length + '（' + brief(context.upstream) + '）')
  if (context.downstream.length > 0) parts.push('下游 ' + context.downstream.length + '（' + brief(context.downstream) + '）')
  if (parts.length === 0) return '网：无上下游（它是孤立公式）'
  return '网：' + parts.join('；') + '。查完整上下游用 formulas query:"web"'
}
