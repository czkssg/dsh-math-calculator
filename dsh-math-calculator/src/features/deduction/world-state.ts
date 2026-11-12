/**
 * 设定条目库（`world_state`）：对话继承的无损替代。
 *
 * ## 它解决的真实问题
 *
 * 长项目会撞上上下文上限，只能把前文压成一份「对话继承总结」（有损压缩）。
 * 每次压缩都损失细节、口径、推导链与例外情况；损失一旦发生，
 * 后面的推演就建立在「被压缩过的世界」上。
 *
 * 桌面版的解法不是「压缩得更好」，而是**不压缩**：状态在文件里，按条目查。
 *
 * ## 与 workspace 的分工
 *
 * ```
 *   workspace   数值型状态（常数、星球参数、命名变量）
 *   world_state 文本型设定（条目、口径、废弃链、术语）
 * ```
 *
 * ## 关键设计：废弃链而不是删除
 *
 * 设定会改。直接覆盖会让后人不知道曾经有过这一版，会重复踩坑；
 * 标 `deprecated` + `supersedes` 指向新条目，才能留下完整演化史。
 *
 * ## 本模块的边界
 *
 * 纯逻辑：接受一个 `StateBook`，返回更新后的 `StateBook`。
 * 文件读写由 `src/io/state-store.ts` 负责（与 v3 的数据注入约定一致）。
 *
 * @module dsh-math-calculator/features/deduction/world-state
 */

import { CalcError } from '../../core/errors.js'

/** 一个设定条目。 */
export interface StateEntry {
  id: string
  /** 一句话摘要（列表显示用）。 */
  title: string
  /** 正文（可长，这是「不压缩」的兑现）。 */
  body: string
  /** active / deprecated / draft。 */
  status: string
  tags: string[]
  /** 本条取代了哪些条目（废弃链）。 */
  supersedes: string[]
  createdAt: string
  updatedAt: string
}

/** 一个工作区的设定库。 */
export interface StateBook {
  version: number
  entries: StateEntry[]
}

/** 操作输入。 */
export interface WorldStateInput {
  /** set/add/update / check / get / list / search / deprecate。 */
  action?: string
  /** 一批条目（set 用）。 */
  entries?: unknown[]
  /** 单条（set 用）。 */
  entry?: unknown
  /** get/deprecate 用。 */
  id?: string
  /** deprecate：取代它的新条目 id。 */
  supersededBy?: string
  /** search 用。 */
  query?: string
  /** list 过滤：状态。 */
  status?: string
  /** list 过滤：标签（任一命中）。 */
  tags?: string[]
  /** 是否包含废弃条目（list/search 缺省包含）。 */
  includeDeprecated?: boolean
}

/** 结果。 */
export interface WorldStateOutcome {
  result: string
  value: unknown
  /** 更新后的设定库（调用方负责落盘）。 */
  book: StateBook
  notice?: string
}

/** 空库。 */
export function emptyBook(): StateBook {
  return { version: 1, entries: [] }
}

/** 归一 id。 */
function normalizeId(raw: unknown): string {
  const id = typeof raw === 'string' ? raw.trim() : ''
  if (id === '') {
    throw new CalcError('invalid_argument', '条目必须有 id', 'id 是检索与废弃链的锚点，不能省。例如 {id:"T086", title:"…"}。')
  }
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) {
    throw new CalcError('invalid_argument', 'id 只能用字母/数字/下划线/连字符（1–40 字符），收到 "' + id + '"', '例如 T086、north-iron、Q3。')
  }
  return id
}

/** 归一一个条目。 */
function normalizeEntry(raw: unknown, existing: StateEntry | undefined, now: string): StateEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CalcError('invalid_argument', 'entry 必须是对象', '例如 {id:"T01", title:"北境有铁矿", body:"…"}。')
  }
  const obj = raw as Record<string, unknown>
  const id = normalizeId(obj['id'])
  const title = typeof obj['title'] === 'string' ? obj['title'].trim().slice(0, 200) : (existing?.title ?? '')
  if (title === '') {
    throw new CalcError('invalid_argument', '条目 ' + id + ' 必须有 title', 'title 是一句话摘要，列表显示用。')
  }
  const status = typeof obj['status'] === 'string' ? obj['status'] : (existing?.status ?? 'active')
  if (!['active', 'deprecated', 'draft'].includes(status)) {
    throw new CalcError('invalid_argument', '条目 ' + id + ' 的 status 只能是 active / deprecated / draft（收到 "' + status + '"）', '')
  }
  return {
    id,
    title,
    body: typeof obj['body'] === 'string' ? obj['body'] : (existing?.body ?? ''),
    status,
    tags: Array.isArray(obj['tags']) ? obj['tags'].map((item) => String(item)) : (existing?.tags ?? []),
    supersedes: Array.isArray(obj['supersedes']) ? obj['supersedes'].map((item) => String(item)) : (existing?.supersedes ?? []),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

/** 检查悬空引用等结构问题。 */
function checkBook(book: StateBook): Array<{ kind: string; message: string }> {
  const findings: Array<{ kind: string; message: string }> = []
  const byId = new Map<string, StateEntry>()
  for (const entry of book.entries) {
    if (byId.has(entry.id)) findings.push({ kind: 'duplicate_id', message: 'id 重复：' + entry.id })
    byId.set(entry.id, entry)
  }
  for (const entry of book.entries) {
    for (const target of entry.supersedes) {
      if (!byId.has(target)) {
        findings.push({ kind: 'dangling_supersede', message: entry.id + ' 声称取代 ' + target + '，但 ' + target + ' 不存在' })
      }
    }
    if (entry.status === 'deprecated' && !book.entries.some((other) => other.supersedes.includes(entry.id))) {
      findings.push({ kind: 'deprecated_without_successor', message: entry.id + ' 已废弃，但没有任何条目声称取代它（演化史断了）' })
    }
    if (entry.body.trim() === '') findings.push({ kind: 'empty_body', message: entry.id + ' 只有标题没有正文（不压缩的承诺没兑现）' })
    if (entry.title.length < 4) findings.push({ kind: 'terse_title', message: entry.id + ' 的标题过短（"' + entry.title + '"），列表里看不出是什么' })
  }
  return findings
}

/**
 * 执行设定库操作。
 *
 * @param input - 操作与参数
 * @param book - 当前设定库（不会被原地修改）
 * @param now - 时间戳（测试可固定）
 * @returns 结果与更新后的库
 * @throws {CalcError} 操作未知 / 条目非法
 */
export function runWorldState(input: WorldStateInput | undefined, book: StateBook, now: string = new Date().toISOString()): WorldStateOutcome {
  if (input === undefined || input === null) {
    throw new CalcError('missing_params', 'world_state 需要输入', '例如 {world_state:{action:"set", entries:[{id:"T01", title:"北境有铁矿"}]}}。')
  }
  const action = typeof input.action === 'string' && input.action.trim() !== '' ? input.action.trim().toLowerCase() : 'list'
  const next: StateBook = { version: book.version, entries: book.entries.map((entry) => ({ ...entry })) }
  const lines: string[] = []

  // ── set ──
  if (action === 'set' || action === 'add' || action === 'update') {
    const list = Array.isArray(input.entries) ? input.entries : input.entry !== undefined ? [input.entry] : []
    if (list.length === 0) {
      throw new CalcError(
        'missing_params',
        'world_state set 需要 entries（条目数组）或 entry（单条）',
        '例如 {action:"set", entries:[{id:"T01", title:"北境有铁矿", body:"…", tags:["地理"]}]}。',
      )
    }
    const created: string[] = []
    const updated: string[] = []
    for (const item of list) {
      const peekId = (item as Record<string, unknown> | null)?.['id']
      const existing = typeof peekId === 'string' ? next.entries.find((one) => one.id === peekId) : undefined
      const entry = normalizeEntry(item, existing, now)
      if (existing) {
        next.entries[next.entries.indexOf(existing)] = entry
        updated.push(entry.id)
      } else {
        next.entries.push(entry)
        created.push(entry.id)
      }
    }
    const findings = checkBook(next)
    lines.push('✓ 设定库已更新')
    if (created.length > 0) lines.push('  新建：' + created.join('、'))
    if (updated.length > 0) lines.push('  更新：' + updated.join('、'))
    lines.push('  现有条目共 ' + next.entries.length + ' 个')
    const dangling = findings.filter((finding) => finding.kind === 'dangling_supersede')
    if (dangling.length > 0) {
      lines.push('')
      lines.push('⚠ 废弃链有悬空引用：')
      for (const finding of dangling) lines.push('   · ' + finding.message)
    }
    return { result: lines.join('\n'), value: { action: 'set', created, updated, total: next.entries.length, dangling: dangling.map((d) => d.message) }, book: next }
  }

  // ── deprecate ──
  if (action === 'deprecate') {
    const id = normalizeId(input.id)
    const target = next.entries.find((entry) => entry.id === id)
    if (!target) {
      throw new CalcError('unknown_symbol', '设定库里没有条目 ' + id, '已收录：' + next.entries.map((entry) => entry.id).join('、') + '。')
    }
    target.status = 'deprecated'
    target.updatedAt = now
    let successor: string | null = null
    if (typeof input.supersededBy === 'string' && input.supersededBy.trim() !== '') {
      successor = input.supersededBy.trim()
      const replacement = next.entries.find((entry) => entry.id === successor)
      if (!replacement) {
        throw new CalcError('unknown_symbol', '取代条目 ' + successor + ' 不在库里', '先 set 新条目，再 deprecate 旧条目并指向它。')
      }
      if (!replacement.supersedes.includes(id)) replacement.supersedes.push(id)
      replacement.updatedAt = now
    }
    const lines2 = ['✓ 已废弃 ' + id + '（' + target.title + '）']
    if (successor !== null) lines2.push('  取代它的条目：' + successor)
    else lines2.push('  ⚠ 没有指定取代条目——演化史会断（后人不知道它被哪条取代）')
    return { result: lines2.join('\n'), value: { action: 'deprecate', id, supersededBy: successor }, book: next }
  }

  // ── check ──
  if (action === 'check') {
    const findings = checkBook(next)
    lines.push('═══ 设定库结构检查 ═══', '')
    lines.push('  条目 ' + next.entries.length + ' 个，问题 ' + findings.length + ' 条')
    lines.push('')
    if (findings.length === 0) lines.push('  ✓ 未发现悬空引用、重复 id、断链或空正文')
    else for (const finding of findings) lines.push('  ✗ [' + finding.kind + '] ' + finding.message)
    return { result: lines.join('\n'), value: { action: 'check', findings }, book: next, ...(findings.length > 0 ? { notice: '有 ' + findings.length + ' 条结构问题' } : {}) }
  }

  // ── get ──
  if (action === 'get') {
    const id = normalizeId(input.id)
    const entry = next.entries.find((one) => one.id === id)
    if (!entry) {
      throw new CalcError('unknown_symbol', '设定库里没有条目 ' + id, '已收录：' + next.entries.map((one) => one.id).join('、') + '。')
    }
    lines.push('【' + entry.id + '】' + entry.title)
    lines.push('  状态：' + entry.status + '　标签：' + (entry.tags.length > 0 ? entry.tags.join('、') : '（无）'))
    lines.push('  取代：' + (entry.supersedes.length > 0 ? entry.supersedes.join('、') : '（无）'))
    lines.push('  创建：' + entry.createdAt + '　修改：' + entry.updatedAt)
    lines.push('')
    lines.push(entry.body)
    return { result: lines.join('\n'), value: entry, book: next }
  }

  // ── search ──
  if (action === 'search') {
    const query = typeof input.query === 'string' ? input.query.trim() : ''
    if (query === '') throw new CalcError('missing_params', 'world_state search 需要 query', '例如 {action:"search", query:"铁矿"}。')
    const hits = next.entries.filter((entry) => entry.title.includes(query) || entry.body.includes(query) || entry.tags.some((tag) => tag.includes(query)))
    lines.push('═══ 检索「' + query + '」：' + hits.length + ' 条 ═══', '')
    for (const entry of hits) lines.push('  ' + entry.id.padEnd(10) + entry.status.padEnd(12) + entry.title + (entry.tags.length > 0 ? '　[' + entry.tags.join('、') + ']' : ''))
    return { result: lines.join('\n'), value: { action: 'search', query, hits }, book: next }
  }

  // ── list（缺省）──
  if (action !== 'list') {
    throw new CalcError(
      'unknown_argument',
      '不认识的 world_state action「' + action + '」',
      '可用：set / deprecate / check / get / search / list。',
    )
  }
  const statusFilter = typeof input.status === 'string' ? input.status : null
  const tagFilter = Array.isArray(input.tags) ? input.tags.map((item) => String(item)) : []
  let list = next.entries
  if (statusFilter !== null) list = list.filter((entry) => entry.status === statusFilter)
  if (tagFilter.length > 0) list = list.filter((entry) => entry.tags.some((tag) => tagFilter.includes(tag)))
  if (input.includeDeprecated === false) list = list.filter((entry) => entry.status !== 'deprecated')
  lines.push('═══ 设定库（' + list.length + ' 条 / 全库 ' + next.entries.length + ' 条）═══', '')
  for (const entry of list) {
    lines.push('  ' + entry.id.padEnd(10) + entry.status.padEnd(12) + entry.title + (entry.tags.length > 0 ? '　[' + entry.tags.join('、') + ']' : '') + '　' + entry.body.length + ' 字')
  }
  lines.push('')
  lines.push('  ★ 正文不压缩；按条目查，不要通读全库。')
  return { result: lines.join('\n'), value: { action: 'list', entries: list, total: next.entries.length }, book: next }
}
