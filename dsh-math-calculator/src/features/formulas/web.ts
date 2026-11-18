/**
 * 公式网：从物理常数出发的全量依赖网。
 *
 * ## 结构
 *
 * ```
 *   第 0 层   常数（c / G / h / kB / ...）
 *   第 1 层   公式参数默认值等于该常数（如 E = mc² 用 c）
 *   第 2 层+  上游公式的输出物理量 = 下游参数的 quantity
 * ```
 *
 * 边存在 `src/data/formula-web.json`（离线构建）：
 * - `constantEdges`：常数 → 公式（参数默认值 ≈ 常数标准值）；
 * - `formulaEdges`：公式 → 公式（输出量 identity 与下游参数 quantity 相同，且量纲一致）。
 *
 * @module dsh-math-calculator/features/formulas/web
 */

/** 常数节点。 */
export interface WebConstant {
  name: string
  standard: number
  unit: string
  fundamental?: boolean
  siDefines?: string | null
}

/** 常数 → 公式的边。 */
export interface WebConstantEdge {
  constant: string
  formula: string
  param: string
  value: number
}

/** 公式 → 公式的边。 */
export interface WebFormulaEdge {
  from: string
  to: string
  param: string
  identity: string
}

/** 公式网数据。 */
export interface FormulaWeb {
  meta?: { constants?: number; formulas?: number; constantEdges?: number; formulaEdges?: number; builtAt?: string; note?: string }
  constants: WebConstant[]
  constantEdges: WebConstantEdge[]
  formulaEdges: WebFormulaEdge[]
}

/** 公式条目（查询只需要 id/name）。 */
export interface WebFormula {
  id: string
  name: string
}

/** 查询选项。 */
export interface WebQuery {
  focus?: string
  depth?: number
  direction?: 'down' | 'up' | 'both'
  /** 每层最多显示条数（默认 20）。 */
  limit?: number
}

/** 一层公式。 */
export interface WebLayer {
  layer: number
  formulas: Array<{ id: string; name: string; via: string[] }>
}

/** 查询结果。 */
export interface WebOutcome {
  result: string
  value: Record<string, unknown>
}

/** 取名称。 */
function nameOf(byId: Map<string, WebFormula>, id: string): string {
  return byId.get(id)?.name ?? id
}

/**
 * 跑一次查询。
 *
 * @param web - 公式网数据
 * @param formulas - 公式表（取名称）
 * @param query - focus/depth/direction
 * @returns 文本与结构化结果
 */
export function runFormulaWeb(web: FormulaWeb, formulas: WebFormula[], query: WebQuery): WebOutcome {
  const byId = new Map(formulas.map((item) => [item.id, item]))
  const constantByName = new Map(web.constants.map((item) => [item.name, item]))
  const constantEdges = web.constantEdges ?? []
  const formulaEdges = web.formulaEdges ?? []
  const outByFrom = new Map<string, WebFormulaEdge[]>()
  const inByTo = new Map<string, WebFormulaEdge[]>()
  for (const edge of formulaEdges) {
    if (outByFrom.get(edge.from) === undefined) outByFrom.set(edge.from, [])
    outByFrom.get(edge.from)?.push(edge)
    if (inByTo.get(edge.to) === undefined) inByTo.set(edge.to, [])
    inByTo.get(edge.to)?.push(edge)
  }
  const constToFormula = new Map<string, WebConstantEdge[]>()
  for (const edge of constantEdges) {
    if (constToFormula.get(edge.constant) === undefined) constToFormula.set(edge.constant, [])
    constToFormula.get(edge.constant)?.push(edge)
  }

  const focus = typeof query.focus === 'string' ? query.focus.trim() : ''
  const depth = Math.max(1, Math.min(5, Number.isFinite(query.depth ?? NaN) ? (query.depth as number) : 2))
  const limit = Math.max(1, Math.min(100, Number.isFinite(query.limit ?? NaN) ? (query.limit as number) : 20))
  const direction = query.direction ?? 'down'

  /** 统计模式。 */
  if (focus === '') {
    const reachable = new Set<string>()
    const firstFormulas = new Set<string>()
    for (const edge of constantEdges) { firstFormulas.add(edge.formula); reachable.add(edge.formula) }
    const frontier = [...firstFormulas]
    const seen = new Set(firstFormulas)
    while (frontier.length > 0) {
      const id = frontier.shift() as string
      for (const edge of outByFrom.get(id) ?? []) {
        if (seen.has(edge.to)) continue
        seen.add(edge.to)
        reachable.add(edge.to)
        frontier.push(edge.to)
      }
    }
    const withInEdge = new Set(formulaEdges.map((edge) => edge.to))
    const isolated = formulas.filter((item) => !withInEdge.has(item.id) && !firstFormulas.has(item.id)).length
    const lines = [
      '═══ 公式网（物理常数 → 公式 → 公式）═══',
      '',
      '  节点：常数 ' + web.constants.length + ' · 公式 ' + formulas.length,
      '  边：常数边 ' + constantEdges.length + ' · 公式边 ' + formulaEdges.length,
      '  从常数可达的公式：' + reachable.size + '（沿常数边与公式边）',
      '  直接使用常数的公式：' + firstFormulas.size,
      '  未被公式引用的常数：' + (web.constants.length - constToFormula.size),
      '  孤立公式（无入边）：' + isolated,
      '',
      '★ 公式边只保留「输出量 == 下游参数量 + 量纲一致」的强边；弱相关在 formulas query:"neighbors"。',
    ]
    return { result: lines.join('\n'), value: { constants: web.constants.length, formulas: formulas.length, constantEdges: constantEdges.length, formulaEdges: formulaEdges.length, reachable: reachable.size, isolated } }
  }

  /** 常数起点。 */
  const constant = constantByName.get(focus)
  if (constant !== undefined) {
    const first = constToFormula.get(constant.name) ?? []
    const lines: string[] = ['═══ 公式网：从常数 ' + constant.name + ' 向下（深度 ' + depth + '）═══', '']
    lines.push('第 0 层 · ' + constant.name + ' = ' + constant.standard + ' ' + constant.unit)
    if (first.length === 0) {
      lines.push('  （没有公式的直接使用这个常数）')
      return { result: lines.join('\n'), value: { focus: constant.name, layers: [] } }
    }
    const layer1 = [...new Set(first.map((edge) => edge.formula))]
    lines.push('', '第 1 层 · 直接使用 ' + constant.name + ' 的公式（' + layer1.length + '）：')
    for (const id of layer1.slice(0, limit)) {
      const params = first.filter((edge) => edge.formula === id).map((edge) => edge.param).join(', ')
      lines.push('  ' + id.padEnd(30) + nameOf(byId, id) + '（作为 ' + params + '）')
    }
    if (layer1.length > limit) lines.push('  … 另有 ' + (layer1.length - limit) + ' 条（用 webLimit 放宽）')
    const layers: WebLayer[] = [{ layer: 1, formulas: layer1.map((id) => ({ id, name: nameOf(byId, id), via: first.filter((edge) => edge.formula === id).map((edge) => edge.param) })) }]
    let frontier = layer1
    const seen = new Set(layer1)
    for (let level = 2; level <= depth; level += 1) {
      const nextMap = new Map<string, string[]>()
      for (const id of frontier) {
        for (const edge of outByFrom.get(id) ?? []) {
          if (seen.has(edge.to)) continue
          if (nextMap.get(edge.to) === undefined) nextMap.set(edge.to, [])
          nextMap.get(edge.to)?.push(edge.from + '.' + edge.param + '（' + edge.identity + '）')
        }
      }
      if (nextMap.size === 0) break
      lines.push('', '第 ' + level + ' 层 · 下游公式（' + nextMap.size + '）：')
      for (const [id, via] of [...nextMap].slice(0, limit)) lines.push('  ' + id.padEnd(30) + nameOf(byId, id) + '（来自 ' + via.slice(0, 3).join('、') + '）')
      if (nextMap.size > limit) lines.push('  … 另有 ' + (nextMap.size - limit) + ' 条（用 webLimit 放宽）')
      frontier = [...nextMap.keys()]
      for (const id of frontier) seen.add(id)
      layers.push({ layer: level, formulas: [...nextMap].map(([id, via]) => ({ id, name: nameOf(byId, id), via })) })
    }
    return { result: lines.join('\n'), value: { focus: constant.name, layers } }
  }

  /** 公式起点。 */
  const entry = formulas.find((item) => item.id === focus || item.name === focus)
  if (entry === undefined) {
    throw new Error('没有名为 "' + focus + '" 的常数或公式')
  }
  const lines: string[] = ['═══ 公式网：' + entry.id + '（' + entry.name + '）· ' + (direction === 'down' ? '下游' : direction === 'up' ? '上游' : '上下游') + '（深度 ' + depth + '）═══', '']
  const collect = (start: string, dir: 'down' | 'up'): WebLayer[] => {
    const layers: WebLayer[] = []
    let frontier = [start]
    const seen = new Set([start])
    for (let level = 1; level <= depth; level += 1) {
      const nextMap = new Map<string, string[]>()
      for (const id of frontier) {
        const list = dir === 'down' ? (outByFrom.get(id) ?? []) : (inByTo.get(id) ?? [])
        for (const edge of list) {
          const other = dir === 'down' ? edge.to : edge.from
          if (seen.has(other)) continue
          if (nextMap.get(other) === undefined) nextMap.set(other, [])
          nextMap.get(other)?.push(dir === 'down' ? edge.from + '.' + edge.param + '（' + edge.identity + '）' : other + '.' + edge.param + ' → ' + edge.to)
        }
      }
      if (nextMap.size === 0) break
      layers.push({ layer: level, formulas: [...nextMap].map(([id, via]) => ({ id, name: nameOf(byId, id), via })) })
      frontier = [...nextMap.keys()]
      for (const id of frontier) seen.add(id)
    }
    return layers
  }
  const down = direction === 'up' ? [] : collect(entry.id, 'down')
  const up = direction === 'down' ? [] : collect(entry.id, 'up')
  const render = (title: string, layers: WebLayer[]) => {
    lines.push(title)
    if (layers.length === 0) { lines.push('  （无）'); lines.push(''); return }
    for (const layer of layers) {
      lines.push('  第 ' + layer.layer + ' 层（' + layer.formulas.length + '）：')
      for (const item of layer.formulas.slice(0, limit)) lines.push('    ' + item.id.padEnd(30) + item.name + '（' + item.via.slice(0, 2).join('、') + '）')
      if (layer.formulas.length > limit) lines.push('    … 另有 ' + (layer.formulas.length - limit) + ' 条')
    }
    lines.push('')
  }
  if (direction !== 'up') render('下游：', down)
  if (direction !== 'down') render('上游：', up)
  return { result: lines.join('\n'), value: { focus: entry.id, down, up } }
}
