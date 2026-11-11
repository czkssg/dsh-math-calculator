/**
 * operation="worldState" 的实现：设定条目库（对话继承的无损替代）。
 *
 * ## 它解决的真实问题
 *
 * 反馈包 `16` 号实测：朱庇特项目 **203 轮对话里撞了 6 次上限**，
 * 每次只能让 AI「把前面全部压成一份对话继承总结」（有损压缩）。
 *
 * > 每次压缩都损失：细节、口径、推导链、例外情况。
 * > 而损失一旦发生，后面的推演就建立在「被压缩过的世界」上。
 *
 * 网页版装不下是硬约束；桌面版的解法不是「压缩得更好」，而是**不压缩**：
 *
 * ```
 *   网页版：状态在 AI 记忆里  → 撞上限就压 → 有损
 *   桌面版：状态在文件里      → 无限累积   → 按条目查，不压缩
 * ```
 *
 * ## 与 workspace 的分工
 *
 * ```
 *   workspace   数值型状态（常数、星球参数、命名变量）
 *   worldState  文本型设定（条目、口径、废弃链、术语）
 * ```
 *
 * 两者都落盘，但形状不同：变量是 `{name: number}`，设定条目是
 * `{id, title, body, status, tags, supersedes}` —— 后者要能表达
 * **「这条被那条取代了」**，这是压缩总结永远做不到的。
 *
 * ## 关键设计：废弃链而不是删除
 *
 * 设定会改。改的时候有两种做法：
 *
 * ```
 *   ✗ 直接覆盖 → 后人不知道曾经有过这一版，会重复踩坑
 *   ✓ 标 deprecated + supersedes 指向新条目 → 完整演化史
 * ```
 *
 * 九层项目最后「全部推到西周社会重来」，如果没有废弃链，
 * 后人看到的是「西周制」，不知道前面推过什么、为什么改。
 *
 * @module dsh-math-calculator/ops/world-state-op
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { toJsonValue } from '../format.js'
import { currentWorkspace, normalizeWorkspaceName, workspaceDirectory } from '../workspace.js'
import { CalcError, type MathArgs, type Outcome } from './shared.js'

/** 一个设定条目。 */
export interface StateEntry {
  /** 标识（如 T086）。 */
  id: string
  /** 标题（一句话）。 */
  title: string
  /** 正文（可长，这是「不压缩」的兑现）。 */
  body: string
  /** 状态：active 现行 / deprecated 已废弃 / draft 草稿。 */
  status: string
  /** 标签（用于按主题查）。 */
  tags: string[]
  /** 本条取代了哪些条目（废弃链）。 */
  supersedes: string[]
  /** 创建时间。 */
  createdAt: string
  /** 最后修改时间。 */
  updatedAt: string
}

/** 一个工作区的设定库。 */
interface StateBook {
  /** 版本（将来格式变更用）。 */
  version: number
  /** 条目表。 */
  entries: StateEntry[]
}

/**
 * 设定库文件路径。
 *
 * @param workspace - 工作区名
 * @returns 绝对路径
 */
function stateFilePath(workspace: string): string {
  return join(workspaceDirectory(), workspace + '.state.json')
}

/**
 * 读设定库。文件不存在时返回空库（那是新建工作区的常态）。
 *
 * @param workspace - 工作区名
 * @returns 设定库
 */
function loadBook(workspace: string): StateBook {
  const path = stateFilePath(workspace)
  if (!existsSync(path)) return { version: 1, entries: [] }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<StateBook>
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      entries: Array.isArray(parsed.entries) ? (parsed.entries as StateEntry[]) : [],
    }
  } catch (error) {
    /**
     * 读坏了**不许当成空库** —— 那会让调用方以为设定丢了，
     * 然后重建一份，把可恢复的文件覆盖掉。
     *
     * 这与 workspace 那次修的同一个病（读不到 ≠ 没写过）。
     */
    throw new CalcError(
      'invalid_argument',
      '设定库文件读不出来：' + (error instanceof Error ? error.message : String(error)),
      '文件：' + path + '。**这不是「没有设定」**——文件存在但解析失败。' +
        '请检查该文件是否是合法 JSON，或先备份后删除它再重建。' +
        '不要在未备份的情况下直接写入，那会覆盖掉现有内容。',
    )
  }
}

/**
 * 写设定库。
 *
 * @param workspace - 工作区名
 * @param book - 设定库
 */
function saveBook(workspace: string, book: StateBook): void {
  const dir = workspaceDirectory()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(stateFilePath(workspace), JSON.stringify(book, null, 2), 'utf8')
}

/**
 * 校验并归一一个条目输入。
 *
 * @param raw - 原始输入
 * @param existing - 现有条目（用于判断是否新建）
 * @returns 归一后的条目
 */
function normalizeEntry(raw: unknown, existing?: StateEntry): StateEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CalcError('invalid_argument', 'entry 必须是对象', '例如 {id:"T01", title:"北境有铁矿", body:"…"}。')
  }
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' ? obj.id.trim() : ''
  if (id === '') {
    throw new CalcError(
      'invalid_argument',
      '条目必须有 id',
      'id 是检索与废弃链的锚点，不能省。例如 {id:"T086", title:"…"}。',
    )
  }
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) {
    throw new CalcError(
      'invalid_argument',
      'id 只能用字母/数字/下划线/连字符（1–40 字符），收到 "' + id + '"',
      '例如 T086、north-iron、Q3。',
    )
  }
  const now = new Date().toISOString()
  const title = typeof obj.title === 'string' ? obj.title.trim().slice(0, 200) : (existing?.title ?? '')
  if (title === '') {
    throw new CalcError('invalid_argument', '条目 ' + id + ' 必须有 title', 'title 是一句话摘要，用于列表显示。')
  }
  return {
    id,
    title,
    body: typeof obj.body === 'string' ? obj.body : (existing?.body ?? ''),
    status: typeof obj.status === 'string' ? obj.status : (existing?.status ?? 'active'),
    tags: Array.isArray(obj.tags) ? obj.tags.map((item) => String(item)) : (existing?.tags ?? []),
    supersedes: Array.isArray(obj.supersedes)
      ? obj.supersedes.map((item) => String(item))
      : (existing?.supersedes ?? []),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

/**
 * `worldState`：设定条目库。
 *
 * @param args - 工具参数
 * @returns 结果文本与结构化值
 */
export function opWorldState(args: MathArgs): Outcome {
  const raw = (args as unknown as Record<string, unknown>).world_state
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const action = typeof obj.action === 'string' ? obj.action.trim().toLowerCase() : 'list'
  const workspace = normalizeWorkspaceName(
    typeof obj.workspace === 'string' ? obj.workspace : currentWorkspace(),
  )

  // ── set：写入/更新一批条目 ──
  if (action === 'set' || action === 'add' || action === 'update') {
    const list = Array.isArray(obj.entries) ? obj.entries : Array.isArray(obj.entry) ? [obj.entry] : []
    if (list.length === 0) {
      throw new CalcError(
        'invalid_argument',
        'worldState set 需要 entries（条目数组）',
        '例如 {operation:"world_state", world_state:{action:"set", entries:[' +
          '{id:"T01", title:"北境有铁矿", body:"…", tags:["地理"]}]}}。' +
          '单条也可写成 entry:{…}。',
      )
    }

    const book = loadBook(workspace)
    const created: string[] = []
    const updated: string[] = []

    for (const item of list) {
      const peekId = (item as Record<string, unknown>)?.id
      const existing = typeof peekId === 'string' ? book.entries.find((one) => one.id === peekId) : undefined
      const entry = normalizeEntry(item, existing)
      if (existing) {
        const index = book.entries.indexOf(existing)
        book.entries[index] = entry
        updated.push(entry.id)
      } else {
        book.entries.push(entry)
        created.push(entry.id)
      }
    }

    /**
     * 废弃链的完整性检查：supersedes 指向的条目必须存在。
     *
     * 悬空引用会让「这条取代了谁」查不到 —— 那正是废弃链唯一的用处。
     */
    const ids = new Set(book.entries.map((one) => one.id))
    const dangling: string[] = []
    for (const entry of book.entries) {
      for (const target of entry.supersedes) {
        if (!ids.has(target)) dangling.push(entry.id + ' → ' + target)
      }
    }

    saveBook(workspace, book)

    const lines: string[] = []
    lines.push('✓ 设定库已更新（工作区 "' + workspace + '"）')
    if (created.length > 0) lines.push('  新建：' + created.join('、'))
    if (updated.length > 0) lines.push('  更新：' + updated.join('、'))
    lines.push('  现有条目共 ' + book.entries.length + ' 个')

    if (dangling.length > 0) {
      lines.push('')
      lines.push('⚠ 废弃链有悬空引用（supersedes 指向的条目不存在）：')
      for (const one of dangling) lines.push('   · ' + one)
      lines.push('  这会让「这条取代了谁」查不到 —— 补上被取代的条目，或改掉这个引用。')
    }

    return {
      result: lines.join('\n'),
      value: toJsonValue({
        action: 'set',
        workspace,
        created,
        updated,
        total: book.entries.length,
        dangling,
      }),
    }
  }

  // ── check：一致性检查 ──
  if (action === 'check') {
    const book = loadBook(workspace)
    const findings: Array<{ kind: string; message: string }> = []
    const byId = new Map(book.entries.map((one) => [one.id, one]))

    /** ① 悬空引用。 */
    for (const entry of book.entries) {
      for (const target of entry.supersedes) {
        if (!byId.has(target)) {
          findings.push({
            kind: 'dangling_supersede',
            message: entry.id + ' 声称取代 ' + target + '，但 ' + target + ' 不存在',
          })
        }
      }
    }

    /** ② 已废弃条目仍被别人当作现行依据引用（在有 body 里出现 id）。 */
    for (const entry of book.entries) {
      if (entry.status !== 'active') continue
      for (const other of book.entries) {
        if (other.status !== 'deprecated') continue
        /** 只在 body 里出现「见 T0xx」这类显式引用时才判，避免名字巧合。 */
        if (new RegExp('\\b' + other.id.replace(/[-_]/g, '[-_]') + '\\b').test(entry.body)) {
          findings.push({
            kind: 'cites_deprecated',
            message: entry.id + ' 仍在引用已废弃的 ' + other.id + '（' + other.title + '）',
          })
        }
      }
    }

    /** ③ 同一主题有多个现行版本（可能是忘了废弃旧的）。 */
    const byTag = new Map<string, StateEntry[]>()
    for (const entry of book.entries) {
      if (entry.status !== 'active') continue
      for (const tag of entry.tags) {
        const list = byTag.get(tag) ?? []
        list.push(entry)
        byTag.set(tag, list)
      }
    }
    for (const [tag, list] of byTag) {
      if (list.length >= 2) {
        findings.push({
          kind: 'multi_active',
          message: '标签「' + tag + '」下有 ' + list.length + ' 条现行条目：' +
            list.map((one) => one.id).join('、') + ' —— 若它们是同一件事的不同版本，旧的该标 deprecated',
        })
      }
    }

    const lines: string[] = []
    lines.push('═══ 设定库检查（工作区 "' + workspace + '"）═══')
    lines.push('')
    lines.push('  条目 ' + book.entries.length + ' 个（现行 ' +
      book.entries.filter((one) => one.status === 'active').length + '　已废弃 ' +
      book.entries.filter((one) => one.status === 'deprecated').length + '）')
    lines.push('')
    if (findings.length === 0) {
      lines.push('  ✓ 没发现问题。')
    } else {
      lines.push('  发现 ' + findings.length + ' 处：')
      for (const one of findings) lines.push('   · ' + one.message)
    }
    lines.push('')
    lines.push('  ★ 只报「可能有问题」，不替你改 —— 哪条是有意为之只有你知道。')

    return {
      result: lines.join('\n'),
      value: toJsonValue({ action: 'check', workspace, findings, total: book.entries.length }),
    }
  }

  // ── get：按 id 取全文（这是「不占对话上下文」的关键）──
  if (action === 'get') {
    const id = typeof obj.id === 'string' ? obj.id.trim() : ''
    if (id === '') {
      throw new CalcError(
        'invalid_argument',
        'worldState get 需要 id',
        '例如 {world_state:{action:"get", id:"T086"}}。按 id 取单条正文，不占对话上下文。',
      )
    }
    const book = loadBook(workspace)
    const entry = book.entries.find((one) => one.id === id)
    if (!entry) {
      const available = book.entries.slice(0, 12).map((one) => one.id + '（' + one.title + '）')
      throw new CalcError(
        'invalid_argument',
        '没有 id 为 "' + id + '" 的条目',
        book.entries.length === 0
          ? '这个工作区的设定库还是空的。先用 action:"set" 建条目。'
          : '现有条目：' + available.join('、') + (book.entries.length > 12 ? ' …' : ''),
      )
    }

    /** 谁取代了它 / 它取代了谁（演化史）。 */
    const supersededBy = book.entries.filter((one) => one.supersedes.includes(entry.id))
    const lines: string[] = []
    lines.push('【' + entry.id + '】' + entry.title)
    lines.push('')
    lines.push('  状态：' + entry.status + (entry.status === 'deprecated' ? '（已废弃）' : ''))
    if (entry.tags.length > 0) lines.push('  标签：' + entry.tags.join('、'))
    lines.push('  更新：' + entry.updatedAt)
    if (entry.supersedes.length > 0) {
      lines.push('  本条取代：' + entry.supersedes.join('、'))
    }
    if (supersededBy.length > 0) {
      lines.push('  被这些取代：' + supersededBy.map((one) => one.id + '（' + one.title + '）').join('、'))
    }
    lines.push('')
    lines.push(entry.body)

    return {
      result: lines.join('\n'),
      value: toJsonValue({ action: 'get', workspace, entry }),
    }
  }

  // ── list：按标签/状态/关键词列条目（只给标题，正文按需 get）──
  const book = loadBook(workspace)
  const tag = typeof obj.tag === 'string' ? obj.tag : ''
  const status = typeof obj.status === 'string' ? obj.status : ''
  const query = typeof obj.query === 'string' ? obj.query.toLowerCase() : ''

  let list = book.entries
  if (tag !== '') list = list.filter((one) => one.tags.includes(tag))
  if (status !== '') list = list.filter((one) => one.status === status)
  if (query !== '') {
    list = list.filter(
      (one) =>
        one.id.toLowerCase().includes(query) ||
        one.title.toLowerCase().includes(query) ||
        one.body.toLowerCase().includes(query),
    )
  }

  const lines: string[] = []
  lines.push('═══ 设定库（工作区 "' + workspace + '"）═══')
  lines.push('')
  if (book.entries.length === 0) {
    lines.push('  还是空的。建条目：')
    lines.push('  {operation:"worldState", worldState:{action:"set", entries:[' +
      '{id:"T01", title:"北境有铁矿", body:"…"}]}}')
    lines.push('')
    lines.push('  ★ 这是「对话继承」的无损替代：设定存在文件里，按 id 取，不压缩。')
  } else if (list.length === 0) {
    lines.push('  没有符合条件的条目（共 ' + book.entries.length + ' 个）。')
    if (tag !== '') lines.push('  标签「' + tag + '」没有匹配 —— 现有标签：' +
      [...new Set(book.entries.flatMap((one) => one.tags))].slice(0, 10).join('、'))
    if (query !== '') lines.push('  关键词「' + query + '」没有匹配。')
  } else {
    lines.push('  共 ' + list.length + ' 条' +
      (list.length !== book.entries.length ? '（总 ' + book.entries.length + '）' : '') + '：')
    for (const one of list) {
      const mark = one.status === 'deprecated' ? '［废弃］' : one.status === 'draft' ? '［草稿］' : ''
      lines.push('   · ' + one.id.padEnd(10, ' ') + mark + one.title +
        (one.tags.length > 0 ? '　' + one.tags.map((t) => '#' + t).join(' ') : ''))
    }
    lines.push('')
    lines.push('  取某条全文（不占上下文）：{world_state:{action:"get", id:"…"}}')
  }

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      action: 'list',
      workspace,
      total: book.entries.length,
      shown: list.length,
      entries: list.map((one) => ({
        id: one.id,
        title: one.title,
        status: one.status,
        tags: one.tags,
        supersedes: one.supersedes,
      })),
      tags: [...new Set(book.entries.flatMap((one) => one.tags))],
    }),
  }
}

/**
 * 列出所有有设定库的工作区（供诊断用）。
 *
 * @returns 工作区名列表
 */
export function listStateWorkspaces(): string[] {
  const dir = workspaceDirectory()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.state.json'))
    .map((name) => name.replace(/\.state\.json$/, ''))
}
