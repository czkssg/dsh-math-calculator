/**
 * 目标驱动回溯：给一个目标（如「这座窑一天烧多少煤」），
 * 从 801 条公式里找命中公式，再递归找「哪些参数能由别的公式产出」，输出可执行链。
 *
 * ## 为什么固化
 *
 * 用户判断（2026-11-16）：公式库是清单，AI 找路费 token 且易漏；
 * 回溯把「清单」变成「可编程」——一次投入，所有推导路径自动组合。
 *
 * ## 匹配规则（透明、可复核）
 *
 * 1. 目标分词（中文按 2 字滑窗 + 关键词），命中公式的 name/keys/desc/expr；
 * 2. 对命中公式的每个**带 quantity 的必填参数**，找「输出 quantity 相同」的公式；
 * 3. 递归一层（可配深度），生成拓扑序调用序列；
 * 4. 未被覆盖的参数列为「需你给」（不猜）。
 *
 * @module dsh-math-calculator/features/formulas/backtrace
 */

/** 公式条目（data/formulas.json 的运行时形状）。 */
export interface FormulaEntry {
  id: string
  name: string
  cat: string
  expr: string
  params: Record<string, { value?: number | null; desc?: string; quantity?: string; dimension?: Record<string, number> }>
  unit: string
  keys?: string[]
  desc?: string
}

/** 回溯结果。 */
export interface BacktraceResult {
  target: string
  /** 命中的公式。 */
  matches: Array<{ id: string; name: string; score: number }>
  /** 推荐链（从叶子到目标，公式 id 序列）。 */
  chain: Array<{ id: string; name: string; params: string[]; produces: string }>
  /** 需要用户提供的参数。 */
  missing: Array<{ formula: string; param: string; desc: string }>
  /** 可执行调用序列（formula op）。 */
  calls: Array<Record<string, unknown>>
  /** 说明。 */
  notes: string[]
}

/** 中文关键词切分（2 字滑窗 + 英文词）。 */
function tokenize(text: string): string[] {
  const tokens = new Set<string>()
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (word === '') continue
    if (/[a-z0-9]/.test(word)) tokens.add(word)
    if (/[\u4e00-\u9fa5]/.test(word)) {
      for (let i = 0; i + 2 <= word.length; i += 1) tokens.add(word.slice(i, i + 2))
      tokens.add(word)
    }
  }
  return [...tokens]
}

/**
 * 目标回溯。
 *
 * @param formulas - 公式库
 * @param target - 目标描述
 * @param options - 深度与给定参数
 * @returns 回溯结果
 */
export function backtrace(formulas: FormulaEntry[], target: string, options: { maxDepth?: number; given?: string[] } = {}): BacktraceResult {
  const maxDepth = options.maxDepth ?? 2
  const tokens = tokenize(target)
  const scored: Array<{ entry: FormulaEntry; score: number }> = []
  for (const entry of formulas) {
    const haystack = (entry.name + ' ' + (entry.keys ?? []).join(' ') + ' ' + (entry.desc ?? '') + ' ' + entry.expr).toLowerCase()
    let score = 0
    for (const token of tokens) {
      if (haystack.includes(token)) score += token.length >= 2 ? 2 : 1
    }
    if (score > 0) scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score)
  const matches = scored.slice(0, 8).map((item) => ({ id: item.entry.id, name: item.entry.name, score: item.score }))
  if (scored.length === 0) {
    return { target, matches: [], chain: [], missing: [], calls: [], notes: ['没找到匹配公式。换个说法（用公式里的关键词，如「煤耗」「功率」「产量」），或先用 formula 查。'] }
  }
  const targetEntry = scored[0].entry
  const given = new Set((options.given ?? []).map((s) => s.toLowerCase()))
  const chain: BacktraceResult['chain'] = []
  const missing: BacktraceResult['missing'] = []
  const used = new Set<string>([targetEntry.id])
  /** 单位 → 物理量（粗粒度映射，用于「参数能否由别的公式产出」）。 */
  const unitToQuantity = (unit: string): string => {
    const u = unit.trim().replace(/\s+/g, '')
    if (u === '') return ''
    const table: Array<[RegExp, string]> = [
      [/^(W|kW|MW|GW|hp|马力)$/, '功率'],
      [/^(J|kJ|MJ|GJ|kWh|卡|大卡)$/, '能量'],
      [/^(kg|g|t|吨|斤|磅)$/, '质量'],
      [/^(m|km|cm|mm|里|尺)$/, '长度'],
      [/^(m2|m\^2|m²|亩|公顷)$/, '面积'],
      [/^(m3|m\^3|m³|L|升)$/, '体积'],
      [/^(Pa|kPa|MPa|bar|atm)$/, '压强'],
      [/^(N|kN|kgf|lbf)$/, '力'],
      [/^(s|min|h|天|年)$/, '时间'],
      [/^(K|°C|°F|℃)$/, '温度'],
      [/^(m\/s|km\/h|mph|kn)$/, '速度'],
    ]
    for (const [pattern, quantity] of table) if (pattern.test(u)) return quantity
    return ''
  }

  /** 产出 quantity 索引（取公式 unit 或 params 的 quantity）。 */
  const producers = new Map<string, FormulaEntry[]>()
  for (const entry of formulas) {
    const quantity = entry.params && Object.values(entry.params).length > 0 ? '' : ''
    void quantity
    /** 输出量 = 公式 unit 的量纲族（粗粒度：取 expr 里第一个参数之外的单位不做，改用 unit 文本）。 */
    const key = unitToQuantity(entry.unit)
    if (key !== '') {
      const list = producers.get(key) ?? []
      list.push(entry)
      producers.set(key, list)
    }
  }
  const collect = (entry: FormulaEntry, depth: number): void => {
    const params = Object.entries(entry.params ?? {})
    const need: string[] = []
    for (const [name, spec] of params) {
      if (spec.value !== null && spec.value !== undefined) continue
      if (given.has(name.toLowerCase())) continue
      need.push(name)
      const quantity = (spec.quantity ?? '').trim()
      /**
       * 只对「派生量」展开（功率/能量/压强/力…）；
       * 时间/长度/质量/温度这些是基本输入，应由用户给，不能拿「圆周周期」去凑。
       */
      /** 只展开「明显派生」的量；面积/体积/速度常是基本输入，展开会拼出荒谬链（见问题库实测）。 */
      const DERIVED = new Set(['功率', '能量', '压强', '力'])
      const expandable = DERIVED.has(quantity)
      const covered = depth < maxDepth && expandable ? (producers.get(quantity) ?? []).filter((p) => !used.has(p.id))[0] : undefined
      if (covered !== undefined) {
        used.add(covered.id)
        collect(covered, depth + 1)
        chain.push({ id: covered.id, name: covered.name, params: Object.keys(covered.params ?? {}), produces: quantity })
      } else {
        missing.push({ formula: entry.id, param: name, desc: spec.desc ?? '' })
      }
    }
    void need
  }
  collect(targetEntry, 0)
  chain.push({ id: targetEntry.id, name: targetEntry.name, params: Object.keys(targetEntry.params ?? {}), produces: targetEntry.unit })
  const calls = chain.map((step) => ({ operation: 'formula', formula: step.id }))
  return {
    target,
    matches,
    chain,
    missing,
    calls,
    notes: [
      '链按「参数可由别的公式产出」拼出；未覆盖的参数列在 missing（不猜数值）',
      'calls 是可直接按序执行的 formula 调用；有 overrides 时逐条补参数',
    ],
  }
}
