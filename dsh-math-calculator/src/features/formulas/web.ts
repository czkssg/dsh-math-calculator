/**
 * 公式网：从物理常数出发的全量依赖网（闭合版）。
 *
 * ## 结构
 *
 * ```
 *   第 0 层   常数（c / G / h / kB / ...）
 *   第 1 层   参数默认值等于该常数的公式
 *   第 2 层+  输出物理量组 == 下游参数组（同义词组 + 量纲校验）
 * ```
 *
 * 边存在 `src/data/formula-web.json`（紧凑数组格式）：
 * - `constantEdges`：[常数, 公式, 参数]；
 * - `formulaEdges`：[上游公式, 下游公式, 下游参数, 物理量组]；
 * - 组表在 `groupNames`；环样例在 `meta.sampleCycles`。
 *
 * @module dsh-math-calculator/features/formulas/web
 */

/** 常数：[名称, 标准值, 单位]。 */
export type WebConstant = [string, number, string]

/** 常数边：[常数, 公式, 参数]。 */
export type WebConstantEdge = [string, string, string]

/** 公式边：[上游, 下游, 下游参数, 物理量组]。 */
export type WebFormulaEdge = [string, string, string, string]

/** 公式网数据。 */
export interface FormulaWeb {
  meta?: {
    builtAt?: string
    formulas?: number
    constants?: number
    constantEdges?: number
    formulaEdges?: number
    groups?: number
    aliasCount?: number
    chainCount?: number
    chainEdges?: number
    crossCandidates?: number
    semanticCandidates?: number
    cycleEdges?: number
    isolatedNoIn?: number
    sources?: number
    sinks?: number
    sampleCycles?: string[][]
    note?: string
  }
  groupNames?: string[]
  /** 同式重复条 → 主节点（查询别名时自动指向主）。 */
  aliases?: Record<string, string>
  /** 链边：[链 id, 步号, 上游公式, 下游公式, 下游参数, 上游步号]。 */
  chainEdges?: Array<[string, number, string, string, string, number]>
  /** 公式 → 参与的链（chain/step/role）。 */
  chainIndex?: Record<string, Array<{ chain: string; step: number; role: 'upstream' | 'downstream' }>>
  /** 链 id → 显示名。 */
  chainNames?: Record<string, string>
  /** 跨链自动候选：[链 id, 步号, 公式, 参数, 组, [[其他链, 步号, 公式], …]]。 */
  crossCandidates?: Array<[string, number, string, string, string, Array<[string, number, string]>]>
  constants: WebConstant[]
  constantEdges: WebConstantEdge[]
  formulaEdges: WebFormulaEdge[]
}

/** 公式条目。 */
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
 * @param formulas - 公式表
 * @param query - focus/depth/direction/limit
 * @returns 文本与结构化结果
 */
export function runFormulaWeb(web: FormulaWeb, formulas: WebFormula[], query: WebQuery): WebOutcome {
  const byId = new Map(formulas.map((item) => [item.id, item]))
  const constantByName = new Map(web.constants.map((item) => [item[0], item]))
  const constantEdges = web.constantEdges ?? []
  const formulaEdges = web.formulaEdges ?? []
  /** 查询邻接 = 组匹配网边 + 链边（链边即使没被量纲组匹配，也要出现在上下游里）。 */
  const allEdges: WebFormulaEdge[] = []
  const edgeKeys = new Set<string>()
  /** 链边优先：它们是人工确认的确定性路径，不该被组匹配的泛边挤出显示上限。 */
  for (const [, , from, to, param] of web.chainEdges ?? []) {
    const key = from + '>' + to + '>' + param
    if (edgeKeys.has(key)) continue
    edgeKeys.add(key)
    allEdges.push([from, to, param, '链'])
  }
  for (const edge of formulaEdges) {
    const key = edge[0] + '>' + edge[1] + '>' + edge[2]
    if (edgeKeys.has(key)) continue
    edgeKeys.add(key)
    allEdges.push(edge)
  }
  const outByFrom = new Map<string, WebFormulaEdge[]>()
  const inByTo = new Map<string, WebFormulaEdge[]>()
  for (const edge of allEdges) {
    if (outByFrom.get(edge[0]) === undefined) outByFrom.set(edge[0], [])
    outByFrom.get(edge[0])?.push(edge)
    if (inByTo.get(edge[1]) === undefined) inByTo.set(edge[1], [])
    inByTo.get(edge[1])?.push(edge)
  }
  const constToFormula = new Map<string, WebConstantEdge[]>()
  for (const edge of constantEdges) {
    if (constToFormula.get(edge[0]) === undefined) constToFormula.set(edge[0], [])
    constToFormula.get(edge[0])?.push(edge)
  }
  const groups = new Set(formulaEdges.map((edge) => edge[3]))
  /** 链边索引：from>to>param → 链显示名与步号。 */
  const chainTags = new Map<string, string>()
  for (const [chainId, toStep, from, to, param, fromStep] of web.chainEdges ?? []) {
    const name = web.chainNames?.[chainId] ?? chainId
    chainTags.set(from + '>' + to + '>' + param, name + ' 第' + fromStep + '→' + toStep + '步')
  }

  const rawFocus = typeof query.focus === 'string' ? query.focus.trim() : ''
  const aliases = web.aliases ?? {}
  /** 别名条目自动指向主节点。 */
  const focus = rawFocus !== '' && aliases[rawFocus] !== undefined ? aliases[rawFocus] : rawFocus
  const aliasNote = focus !== rawFocus ? '（' + rawFocus + ' 是 ' + focus + ' 的别名）' : ''
  const depth = Math.max(1, Math.min(5, Number.isFinite(query.depth ?? NaN) ? (query.depth as number) : 2))
  const limit = Math.max(1, Math.min(200, Number.isFinite(query.limit ?? NaN) ? (query.limit as number) : 20))
  const direction = query.direction ?? 'down'

  /** 统计。 */
  if (focus === '') {
    const first = new Set<string>()
    for (const edge of constantEdges) first.add(edge[1])
    const seen = new Set(first)
    const frontier = [...first]
    while (frontier.length > 0) {
      const id = frontier.shift() as string
      for (const edge of outByFrom.get(id) ?? []) {
        if (seen.has(edge[1])) continue
        seen.add(edge[1])
        frontier.push(edge[1])
      }
    }
    const lines = [
      '═══ 公式网（物理常数 → 公式 → 公式）═══',
      '',
      '  节点：常数 ' + web.constants.length + ' · 公式 ' + (web.meta?.formulas ?? formulas.length) + ' · 物理量组 ' + groups.size,
      '  边：常数边 ' + constantEdges.length + ' · 公式边 ' + formulaEdges.length + ' · 链边 ' + (web.meta?.chainEdges ?? 0) + '（' + (web.meta?.chainCount ?? 0) + ' 条链）',
      '  跨链接点：声明步 ' + (web.meta?.chainEdges ?? 0) + ' 条边、自动候选 ' + (web.meta?.crossCandidates ?? 0) + ' 条（语义 ' + (web.meta?.semanticCandidates ?? 0) + ' 条）',
      '  从常数可达的公式：' + seen.size,
      '  直接使用常数的公式：' + first.size,
      '  无入边（源/孤立）：' + (web.meta?.sources ?? 0) + ' · 无出边（汇）：' + (web.meta?.sinks ?? 0),
      '  闭合环：' + (web.meta?.cycleEdges ?? 0) + ' 条环边（互引产生）',
      '',
      '  环样例：' + (web.meta?.sampleCycles ?? []).slice(0, 2).map((cycle) => cycle.join(' → ')).join('；'),
      '',
      '★ 公式边只保留「输出组 == 输入组 + 量纲一致」的强边；弱相关在 formulas query:"neighbors"。',
    ]
    return {
      result: lines.join('\n'),
      value: {
        constants: web.constants.length,
        formulas: web.meta?.formulas ?? formulas.length,
        aliasCount: web.meta?.aliasCount ?? 0,
        groups: groups.size,
        constantEdges: constantEdges.length,
        formulaEdges: formulaEdges.length,
        reachable: seen.size,
        sources: web.meta?.sources ?? 0,
        sinks: web.meta?.sinks ?? 0,
        crossCandidates: web.meta?.crossCandidates ?? 0,
        cycleEdges: web.meta?.cycleEdges ?? 0,
      },
    }
  }

  /** 常数起点。 */
  const constant = constantByName.get(focus)
  if (constant !== undefined) {
    const first = constToFormula.get(constant[0]) ?? []
    const layer1 = [...new Set(first.map((edge) => edge[1]))]
    const lines: string[] = ['═══ 公式网：从常数 ' + constant[0] + ' 向下（深度 ' + depth + '）═══' + aliasNote, '']
    lines.push('第 0 层 · ' + constant[0] + ' = ' + constant[1] + ' ' + constant[2])
    lines.push('', '第 1 层 · 直接使用 ' + constant[0] + ' 的公式（' + layer1.length + '）：')
    for (const id of layer1.slice(0, limit)) {
      const params = first.filter((edge) => edge[1] === id).map((edge) => edge[2]).join(', ')
      lines.push('  ' + id.padEnd(30) + nameOf(byId, id) + '（' + constant[0] + ' → ' + id + '.' + params + '）')
    }
    if (layer1.length > limit) lines.push('  … 另有 ' + (layer1.length - limit) + ' 条（用 webLimit 放宽）')
    if (layer1.length === 0) lines.push('  （没有公式直接使用这个常数）')
    const layers: WebLayer[] = [{ layer: 1, formulas: layer1.map((id) => ({ id, name: nameOf(byId, id), via: first.filter((edge) => edge[1] === id).map((edge) => edge[2]) })) }]
    let frontier = layer1
    const seen = new Set(layer1)
    for (let level = 2; level <= depth; level += 1) {
      const nextMap = new Map<string, string[]>()
      for (const id of frontier) {
        for (const edge of outByFrom.get(id) ?? []) {
          if (seen.has(edge[1])) continue
          if (nextMap.get(edge[1]) === undefined) nextMap.set(edge[1], [])
          nextMap.get(edge[1])?.push(edge[0] + ' ' + (edge[3] === '链' ? '链边' : '输出「' + edge[3] + '」') + ' → ' + edge[1] + '.' + edge[2] + (chainTags.get(edge[0] + '>' + edge[1] + '>' + edge[2]) !== undefined ? '（链:' + chainTags.get(edge[0] + '>' + edge[1] + '>' + edge[2]) + '）' : ''))
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
    return { result: lines.join('\n'), value: { focus: constant[0], layers } }
  }

  /** 公式起点。 */
  const entry = formulas.find((item) => item.id === focus || item.name === focus)
  if (entry === undefined) throw new Error('没有名为 "' + focus + '" 的常数或公式')
  const lines: string[] = ['═══ 公式网：' + entry.id + '（' + entry.name + '）· ' + (direction === 'down' ? '下游' : direction === 'up' ? '上游' : '上下游') + '（深度 ' + depth + '）═══' + aliasNote, '']
  const collect = (start: string, dir: 'down' | 'up'): WebLayer[] => {
    const layers: WebLayer[] = []
    let frontier = [start]
    const seen = new Set([start])
    for (let level = 1; level <= depth; level += 1) {
      const nextMap = new Map<string, string[]>()
      for (const id of frontier) {
        const list = dir === 'down' ? (outByFrom.get(id) ?? []) : (inByTo.get(id) ?? [])
        for (const edge of list) {
          const other = dir === 'down' ? edge[1] : edge[0]
          if (seen.has(other)) continue
          if (nextMap.get(other) === undefined) nextMap.set(other, [])
          nextMap.get(other)?.push(edge[0] + ' ' + (edge[3] === '链' ? '链边' : '输出「' + edge[3] + '」') + ' → ' + edge[1] + '.' + edge[2] + (chainTags.get(edge[0] + '>' + edge[1] + '>' + edge[2]) !== undefined ? '（链:' + chainTags.get(edge[0] + '>' + edge[1] + '>' + edge[2]) + '）' : ''))
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
