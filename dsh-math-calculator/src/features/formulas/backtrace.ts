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

/** 模型链（data/model-chains.json）。 */
export interface ModelChain {
  id: string
  label: string
  keywords: string[]
  steps: Array<{ op: string; action?: string; formula?: string; kind?: string; label: string; needs?: string[]; provides?: string[] }>
}

/** 模型链一步的依赖排序结果。 */
export interface OrderedSteps {
  steps: ModelChain['steps']
  /** 无法满足的依赖（前面没有步骤提供）。 */
  unresolved: string[]
  /** 是否检测到循环。 */
  cyclic: boolean
}

/**
 * 按 provides / needs 做拓扑排序。
 *
 * 用户要求（2026-11-16）：加链不该人工排步骤——声明每步产出与需要，顺序自动推。
 *
 * 规则：
 * 1. 每步的 needs 若已被前面步骤的 provides 覆盖 → 可放后；
 * 2. 找不到提供者的 needs → 记为 unresolved（由用户给，不是错）；
 * 3. 检测环 → cyclic=true，保持原序并报告。
 *
 * @param steps - 原始步骤
 * @returns 排序结果
 */
export function orderSteps(steps: ModelChain['steps']): OrderedSteps {
  const provided = new Map<string, number>()
  const remaining = steps.map((_, index) => index)
  const ordered: ModelChain['steps'] = []
  const unresolved = new Set<string>()
  let guard = 0
  while (remaining.length > 0 && guard < steps.length * steps.length + 1) {
    guard += 1
    let progressed = false
    for (let position = 0; position < remaining.length; position += 1) {
      const index = remaining[position]
      const step = steps[index]
      const needs = step.needs ?? []
      const satisfied = needs.every((need) => provided.has(need) || unresolved.has(need) === false && !steps.some((s) => (s.provides ?? []).includes(need)))
      if (!satisfied) continue
      ordered.push(step)
      for (const key of step.provides ?? []) provided.set(key, index)
      for (const need of needs) if (!provided.has(need)) unresolved.add(need)
      remaining.splice(position, 1)
      progressed = true
      break
    }
    if (!progressed) break
  }
  if (remaining.length > 0) {
    /** 有环/阻塞：保持原序，标注。 */
    return { steps, unresolved: [...unresolved], cyclic: true }
  }
  return { steps: ordered, unresolved: [...unresolved], cyclic: false }
}

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
  /** 命中的模型链（跨 operation）。 */
  modelChain?: { id: string; label: string; steps: ModelChain['steps']; calls: Array<Record<string, unknown>>; needs: string[] }
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

/**
 * 中文关键词切分（2 字滑窗 + 英文词 + 领域单字）。
 *
 * ## 为什么要有单字（R60）
 *
 * 目标「这座窑一天烧多少煤」的 2 字滑窗是「座窑 / 天烧 / 少煤」——
 * 公式 keys 里写的是「窑炉 / 耗煤 / 烧成」，两头**一个都对不上**，于是推荐链被
 * 「能养活多少人·日」（命中「多少」）抢走。
 *
 * 修法：单字只从**领域词表**（全部公式 keys/name 里出现过的汉字）里收，
 * 这样「窑 / 煤 / 烧」能进，而「天 / 人 / 一」这类万能字不会到处命中。
 *
 * @param text - 目标描述
 * @param vocabulary - 领域单字词表（可选）
 * @returns 关键词列表
 */
/** 疑问词/量词：它们不指向领域量，留着会把「多少」当成关键词（R60）。 */
const STOP_WORDS = new Set(['这座', '那个', '这个', '这些', '那些', '一天', '多少', '怎么', '如何', '什么', '请问', '大概', '大约', '一些', '可以', '需要'])

function tokenize(text: string, vocabulary?: Set<string>): string[] {
  const tokens = new Set<string>()
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (word === '') continue
    if (/[a-z0-9]/.test(word)) tokens.add(word)
    if (/[\u4e00-\u9fa5]/.test(word)) {
      for (let i = 0; i + 2 <= word.length; i += 1) {
        const pair = word.slice(i, i + 2)
        if (!STOP_WORDS.has(pair)) tokens.add(pair)
      }
      if (!STOP_WORDS.has(word)) tokens.add(word)
      if (vocabulary !== undefined) {
        for (const char of word) if (vocabulary.has(char)) tokens.add(char)
      }
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
export function backtrace(formulas: FormulaEntry[], target: string, options: { maxDepth?: number; given?: string[]; modelChains?: ModelChain[] } = {}): BacktraceResult {
  const maxDepth = options.maxDepth ?? 2
  /** 先匹配模型链（跨 operation），命中就不再回落公式链。 */
  const chains = options.modelChains ?? []
  const hitChain = chains.find((chain) => chain.keywords.some((word) => target.includes(word)))
  if (hitChain !== undefined) {
    /** 自动排序：按 provides/needs 拓扑排，不靠人工排步骤。 */
    const ordered = orderSteps(hitChain.steps)
    const steps = ordered.steps
    const calls = steps.map((step) => ({ operation: step.op, ...(step.action !== undefined ? { action: step.action } : {}), ...(step.formula !== undefined ? { formula: step.formula } : {}), ...(step.kind !== undefined ? { kind: step.kind } : {}) }))
    const needs = [...new Set(steps.flatMap((step) => step.needs ?? []))]
    const notes = ['命中模型链「' + hitChain.label + '」：' + steps.map((s) => s.label).join(' → '), '按 calls 逐条执行；needs 是各步需要你补的参数名。']
    if (ordered.cyclic) notes.push('⚠ 依赖环：未能自动排序，保持原序。')
    if (ordered.unresolved.length > 0) notes.push('这些依赖由你提供：' + ordered.unresolved.join('、'))
    return { target, modelChain: { id: hitChain.id, label: hitChain.label, steps, calls, needs }, matches: [], chain: [], missing: [], calls, notes }
  }
  /** 领域单字词表：只收全部公式 name/keys 里出现过的汉字（见 tokenize 注释）。 */
  const vocabulary = new Set<string>()
  for (const entry of formulas) {
    for (const word of [entry.name, ...(entry.keys ?? [])]) {
      for (const char of String(word)) if (/[\u4e00-\u9fa5]/.test(char)) vocabulary.add(char)
    }
  }
  const tokens = tokenize(target, vocabulary)
  const scored: Array<{ entry: FormulaEntry; score: number }> = []
  for (const entry of formulas) {
    const haystack = (entry.name + ' ' + (entry.keys ?? []).join(' ') + ' ' + (entry.desc ?? '') + ' ' + entry.expr).toLowerCase()
    /** keys（人写的别名）权重高于 desc/expr：它才是「用户会怎么问」的索引。 */
    const keysText = (entry.keys ?? []).map((key) => String(key).toLowerCase()).join(' ')
    let score = 0
    for (const token of tokens) {
      /**
       * 单字只看 keys：desc/expr 是长文本，「一 / 天 / 多 / 少」这类字处处都有，
       * 放进 haystack 会让无关公式靠噪音胜出（R60 实测：炉膛热效率 12 分 > 窑炉热平衡 11 分）。
       */
      if (token.length >= 2 && haystack.includes(token)) score += 2
      if (keysText.includes(token)) score += token.length >= 2 ? 3 : 2
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
