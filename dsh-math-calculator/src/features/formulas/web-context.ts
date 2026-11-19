/**
 * 公式网：单条公式的上下游上下文（供 formula 调用时附带）。
 *
 * 每条边都带**方向语义**：
 * ```
 *   上游公式「输出量」→ 本公式「参数名」
 *   本公式「输出量」   → 下游公式「参数名」
 * ```
 *
 * @module dsh-math-calculator/features/formulas/web-context
 */

import type { FormulaWeb, WebFormula } from './web.js'

/** 一个相邻节点。 */
export interface WebNeighbor {
  kind: 'constant' | 'formula'
  id: string
  name: string
  /** 本端（或对端）参数名。 */
  param: string
  /** 物理量组（常数边时为 null）。 */
  group?: string
  /** 上游输出量：公式边是输出组名；常数边是常数单位。 */
  output?: string
  /** 常数数值（仅常数）。 */
  value?: number
}

/** 上下游上下文。 */
export interface WebContext {
  focus: string
  /** focus 若为别名，这里是主节点。 */
  canonical: string
  /** 本公式的输出量（取任一出边的组；无出边则缺省）。 */
  output?: string
  upstream: WebNeighbor[]
  downstream: WebNeighbor[]
  /** 该公式参与的链（chain/step/role）。 */
  chains: Array<{ chain: string; name: string; step: number; role: 'upstream' | 'downstream' }>
}

/**
 * 取一条公式的上下游。
 *
 * @param web - 公式网
 * @param formulas - 公式表（取名称）
 * @param id - 公式 id（可以是别名）
 * @returns 上下游（已去重，带输出量）
 */
export function webContextOf(web: FormulaWeb, formulas: WebFormula[], id: string): WebContext {
  const aliases = web.aliases ?? {}
  const canonical = aliases[id] ?? id
  const nameOf = (value: string): string => formulas.find((item) => item.id === value)?.name ?? value
  const constantInfo = new Map(web.constants.map((item) => [item[0], { value: item[1], unit: item[2] }]))
  const upstream: WebNeighbor[] = []
  const downstream: WebNeighbor[] = []
  const seen = new Set<string>()
  let output: string | undefined
  for (const edge of web.constantEdges ?? []) {
    if (edge[1] !== canonical) continue
    const key = 'constant>' + edge[0] + '>' + edge[2]
    if (seen.has(key)) continue
    seen.add(key)
    const info = constantInfo.get(edge[0])
    upstream.push({ kind: 'constant', id: edge[0], name: edge[0], param: edge[2], output: info?.unit, value: info?.value })
  }
  for (const edge of web.formulaEdges ?? []) {
    if (edge[1] === canonical) {
      const key = 'formula>' + edge[0] + '>' + edge[2]
      if (!seen.has(key)) {
        seen.add(key)
        upstream.push({ kind: 'formula', id: edge[0], name: nameOf(edge[0]), param: edge[2], group: edge[3], output: edge[3] })
      }
    }
    if (edge[0] === canonical) {
      output = output ?? edge[3]
      const key = 'out>' + edge[1] + '>' + edge[2]
      if (!seen.has(key)) {
        seen.add(key)
        downstream.push({ kind: 'formula', id: edge[1], name: nameOf(edge[1]), param: edge[2], group: edge[3], output: edge[3] })
      }
    }
  }
  const chains = (web.chainIndex?.[canonical] ?? []).map((item) => ({ ...item, name: web.chainNames?.[item.chain] ?? item.chain }))
  return { focus: id, canonical, ...(output !== undefined ? { output } : {}), upstream, downstream, chains }
}

/**
 * 一行摘要（给 notice），带「输出量 → 参数名」。
 *
 * @param context - 上下游
 * @returns 摘要文本
 */
export function webContextSummary(context: WebContext): string {
  const up = context.upstream.slice(0, 3).map((item) => {
    const from = item.kind === 'constant'
      ? '常数 ' + item.id + (item.value !== undefined ? '=' + item.value : '') + (item.output !== undefined ? ' ' + item.output : '')
      : item.id + '（输出「' + (item.output ?? '?') + '」）'
    return from + ' → .' + item.param
  })
  const down = context.downstream.slice(0, 3).map((item) => {
    const out = context.output !== undefined ? '输出「' + context.output + '」' : '输出'
    return out + ' → ' + item.id + '.' + item.param
  })
  const parts: string[] = []
  if (up.length > 0) parts.push('上游 ' + context.upstream.length + '：' + up.join('；'))
  if (down.length > 0) parts.push('下游 ' + context.downstream.length + '：' + down.join('；'))
  if (context.chains.length > 0) parts.push('链：' + context.chains.slice(0, 2).map((item) => item.name + ' 第' + item.step + '步').join('、'))
  if (parts.length === 0) return '网：无上下游（它是孤立公式）'
  return '网：' + parts.join('。') + '。查完整上下游用 formulas query:"web"'
}
