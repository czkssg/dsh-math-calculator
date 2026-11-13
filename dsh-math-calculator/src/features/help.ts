/**
 * 分节帮助系统：目录 / 单节 / 自然语言搜索。
 *
 * ## 三层结构
 *
 * ```
 *   help                       → 目录（节名 + 一句话简介 + 常见别名）
 *   help, helpTopic:"world"    → 该节完整正文
 *   help, helpQuery:"账本对不上" → 按任务描述搜到对应能力
 * ```
 *
 * 目录层只保证「AI 知道有什么功能」；正文按需取用，单节详细程度不受总量约束。
 *
 * ## 数据
 *
 * 48 节正文从 `src/data/help.json` 注入（第 8 步从老 help.ts 抽出）。
 * 本模块只管检索与渲染。
 *
 * @module dsh-math-calculator/features/help
 */

/** 一节。 */
export interface HelpTopic {
  key: string
  tier: 'core' | 'extra'
  weight: number
  title: string
  summary: string
  aliases?: string[]
  short?: string
  body?: string
}

/** 搜索结果。 */
export interface HelpSearchHit {
  key: string
  title: string
  summary: string
  score: number
  matched: string[]
}

/** 结果。 */
export interface HelpOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 索引缓存。 */
const cache = new Map<string, { keyText: string; aliasText: string; titleText: string; shortText: string; bodyText: string }>()

/** 切词：英文按词、中文 2–4 字滑窗。 */
function tokenizeQuery(text: string): string[] {
  const raw = text.toLowerCase()
  const out = new Set<string>()
  for (const word of raw.match(/[a-z][a-z0-9_-]{1,}/g) ?? []) out.add(word)
  const cjk = raw.replace(/[^\u4e00-\u9fa5]/g, '')
  for (let size = 4; size >= 2; size -= 1) for (let start = 0; start + size <= cjk.length; start += 1) out.add(cjk.slice(start, start + size))
  if (cjk.length >= 2) out.add(cjk)
  return [...out]
}

/** 节的搜索索引。 */
function indexOf(topic: HelpTopic) {
  const cached = cache.get(topic.key)
  if (cached !== undefined) return cached
  const built = {
    keyText: topic.key.toLowerCase(),
    aliasText: (topic.aliases ?? []).join(' ').toLowerCase(),
    titleText: topic.title.toLowerCase(),
    shortText: (topic.short ?? '').toLowerCase(),
    bodyText: topic.summary.toLowerCase(),
  }
  cache.set(topic.key, built)
  return built
}

/**
 * 在全部节里搜索。
 *
 * @param topics - 节数据
 * @param query - 自然语言描述
 * @param limit - 最多几条
 * @returns 按相关度降序
 */
export function searchHelp(topics: HelpTopic[], query: string, limit = 5): HelpSearchHit[] {
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) return []
  const hits: HelpSearchHit[] = []
  for (const topic of topics) {
    const index = indexOf(topic)
    let score = 0
    const matched = new Set<string>()
    for (const token of tokens) {
      if (index.keyText === token) { score += 40; matched.add('key') }
      else if (index.keyText.includes(token)) { score += 10; matched.add('key') }
      if (index.aliasText.includes(token)) { score += 6; matched.add('别名') }
      if (index.titleText.includes(token)) { score += 4; matched.add('标题') }
      if (index.shortText.includes(token)) { score += 3; matched.add('标签') }
      if (index.bodyText.includes(token)) { score += 1; matched.add('简介') }
    }
    if (score > 0) hits.push({ key: topic.key, title: topic.title, summary: topic.summary, score, matched: [...matched] })
  }
  hits.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
  return hits.slice(0, limit)
}

/**
 * 建模段包含：动力学、公式库、参数扫描、配方、世界观，以及九个领域公式节。
 *
 * 领域节原本压成一节 domains（8707 字符），后来拆开——
 * 查「财政赤字」不必再读梁柱挠度与 Péclet 数。
 */
const MODELING_KEYS = [
  'ode', 'formula', 'derivation', 'recipe', 'recipe-errors', 'recipe-fiscal', 'recipe-bio', 'recipe-material', 'recipe-process', 'world',
  'd-struct', 'd-thermal', 'd-fluid', 'd-ecology', 'd-macro', 'd-material', 'd-bio', 'd-fiscal', 'd-gdp', 'd-process', 'd-coldwar', 'd-modern-society', 'd-chemeng',
]

/**
 * 目录渲染：三段（算术 / 建模与推演 / 其余）。
 *
 * ## 每段的长度预算不同
 *
 * ```
 *   算术   几乎每次都会用到 → 一节两行（标题 + 一句话用途）
 *   建模   ode/formula 等常用节两行；领域公式与配方只给「key=六字标签」一行
 *   其余   折叠成一行 several 项
 * ```
 *
 * 领域节的判定用**前缀**（d- / recipe-）而不是固定清单：
 * 清单会随新节漂移，漏进去的领域节就会挤进算术段，把固定层撑大一倍。
 */
/** 对账与设定类的节（第二场景：读既有文档、保住设定）。 */
const RECON_KEYS = [
  'extract', 'state', 'world_state', 'ledger', 'hierarchy', 'interval', 'consistency', 'compare',
  'dependency', 'quick', 'balance', 'quantities', 'constants', 'custom', 'workspace', 'formula-table', 'help',
]

function renderCatalog(topics: HelpTopic[]): string {
  const byWeight = (a: HelpTopic, b: HelpTopic): number => (b.weight ?? 0) - (a.weight ?? 0)
  const core = topics.filter((topic) => topic.tier === 'core').sort(byWeight)
  const extra = topics.filter((topic) => topic.tier !== 'core').sort(byWeight)
  const isCompact = (topic: HelpTopic): boolean => topic.key.startsWith('d-') || topic.key.startsWith('recipe-')
  const isModeling = (topic: HelpTopic): boolean => MODELING_KEYS.includes(topic.key) || isCompact(topic)
  const isRecon = (topic: HelpTopic): boolean => RECON_KEYS.includes(topic.key)
  const arithmetic = core.filter((topic) => !isModeling(topic) && !isRecon(topic))
  const recon = core.filter((topic) => isRecon(topic))
  const modeling = core.filter(isModeling)

  /** key 列宽按最长 key 动态算，避免长 key 与标题粘连。 */
  const width = Math.min(16, Math.max(8, ...topics.map((topic) => topic.key.length)) + 2)
  const lines: string[] = [
    '══════ math_execute 能力目录（' + topics.length + ' 节）══════',
    'helpTopic:"键名" 取全文；可中文词（矩阵/星球）。helpQuery:"…" 按任务搜。',
    '',
    '  ── 一、算术 ──',
  ]
  const pushTwoLine = (topic: HelpTopic): void => {
    lines.push('  ' + topic.key.padEnd(width) + topic.title)
    lines.push('  ' + ''.padEnd(width) + topic.summary)
  }
  for (const topic of arithmetic) pushTwoLine(topic)

  lines.push('', '  ── 二、建模与推演 ──', '  ★ 正在手写循环/逐年表/参数扫描？看这几节')
  for (const topic of modeling.filter((item) => !isCompact(item))) pushTwoLine(topic)
  const compact = modeling.filter(isCompact)
  if (compact.length > 0) {
    const domains = compact.filter((topic) => topic.key.startsWith('d-'))
    const recipes = compact.filter((topic) => topic.key.startsWith('recipe-'))
    const pushCompact = (label: string, items: HelpTopic[]): void => {
      lines.push('  ' + label)
      const labels = items.map((topic) => topic.key + '=' + (topic.short ?? topic.title.slice(0, 8)))
      for (let index = 0; index < labels.length; index += 3) lines.push('    ' + labels.slice(index, index + 3).join(' · '))
    }
    lines.push('  ★ 链怎么连、每步填什么，见 helpTopic:"formula"。')
    if (domains.length > 0) pushCompact('领域公式（按需查）:', domains)
    if (recipes.length > 0) pushCompact('推演配方（场景特定，按需查）:', recipes)
  }

  lines.push('', '  ── 三、对账与设定 ──', '  ★ 读既有文档、保住设定时用这几节')
  for (const topic of recon) pushTwoLine(topic)

  lines.push('', '  ── 四、其余能力 ──')
  const folded = extra.map((topic) => topic.key + '=' + (topic.short ?? topic.title.slice(0, 8)))
  for (let index = 0; index < folded.length; index += 3) lines.push('    ' + folded.slice(index, index + 3).join(' · '))
  lines.push('', '★ 物理量一律带单位写（(10 hp/0.475) to kW、5 cm to inch）：量纲错当场拦下。')
  return lines.join('\n')
}

/** 搜索渲染（弱匹配要明确标出来）。 */
function renderSearch(query: string, hits: HelpSearchHit[]): string {
  if (hits.length === 0) {
    return '没有找到与 "' + query + '" 相关的节。\n可以试：换用更具体的名词（如「单位」「账本」「区间」），或不带参数看目录。'
  }
  const lines: string[] = ['═══ 搜索 "' + query + '" 命中 ' + hits.length + ' 节 ═══', '']
  for (const hit of hits) {
    lines.push('  ' + hit.key.padEnd(14) + hit.title + '（' + hit.score + ' 分：' + hit.matched.join('/') + '）')
    lines.push('    ' + hit.summary)
  }
  if (hits[0].score < 8) {
    lines.push('', '⚠ 最高分只有 ' + hits[0].score + '（弱匹配）——可能没有正好对应的能力，建议再看目录。')
  }
  lines.push('', '查全文：{operation:"help", helpTopic:"' + hits[0].key + '"}')
  return lines.join('\n')
}

/**
 * 执行 help。
 *
 * @param topics - 节数据（注入）
 * @param topic - 节 key
 * @param query - 搜索词
 * @returns 目录 / 正文 / 搜索结果
 */
export function runHelp(topics: HelpTopic[], topic?: string, query?: string): HelpOutcome {
  if (topics.length === 0) {
    return { result: '帮助数据未加载（src/data/help.json 缺失）。', value: { topics: 0 } }
  }
  /** 显式搜索优先于目录（调用方说了「我要搜」，就不该只给某节全文）。 */
  if (typeof query === 'string' && query.trim() !== '') {
    const hits = searchHelp(topics, query.trim())
    return {
      result: renderSearch(query.trim(), hits),
      value: { requested: query.trim(), hits: hits.map((hit) => ({ key: hit.key, score: hit.score })) },
      ...(hits.length > 0 && hits[0].score < 8 ? { notice: '弱匹配，可能没有对应能力' } : {}),
    }
  }
  if (typeof topic !== 'string' || topic.trim() === '') {
    return { result: renderCatalog(topics), value: { topics: topics.length } }
  }
  const wanted = topic.trim()
  const found = topics.find((item) => item.key === wanted) ?? topics.find((item) => item.key.toLowerCase() === wanted.toLowerCase())
  if (found !== undefined) {
    return { result: '═══ ' + found.title + ' ═══\n\n' + (found.body ?? found.summary), value: { topic: found.key, title: found.title } }
  }
  /** 查不到就搜，而不是直接甩目录（老行为）。 */
  const hits = searchHelp(topics, wanted)
  if (hits.length > 0) {
    return {
      result: renderSearch(wanted, hits),
      value: { requested: wanted, hits: hits.map((hit) => ({ key: hit.key, score: hit.score })) },
    }
  }
  return {
    result: '没有名为 "' + wanted + '" 的节，也没搜到相关项。\n可用 key：' + topics.map((item) => item.key).join(' / ') + '\n\n不带参数调用可看目录。',
    value: { topics: topics.map((item) => item.key), requested: wanted },
  }
}