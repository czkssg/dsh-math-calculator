/**
 * operation="consistency" 的实现：跨条目结构体检。
 *
 * ## 借鉴来源：dsh-novel-writer 的 `graph.js`（跨章结构视图）
 *
 * 它的开场白说得极准：
 *
 * > 伏笔表 / 人物设定 / 时间线 / 剧情大纲在插件里都是**离散静态表**，
 * > 没有任何跨章计算。长篇崩掉通常不是某章文笔差，
 * > 而是**「线断了、人丢了、伏笔忘了」**。
 *
 * 世界观推演里有**完全同构**的三个问题：
 *
 * ```
 *   小说                  世界观
 *   伏笔埋了多久没回收  →  设定条目立了多久没用上
 *   人物连续缺席 N 章    →  势力/地点连续 N 章没被提及
 *   剧情线最大空档      →  依赖链断在哪
 * ```
 *
 * 而本插件原来的 `checklist` 只输出一段**固定清单**（238 字符），
 * `graph` 只给计数（77 字符）—— 都不看具体内容。这块确实是空的。
 *
 * ## 四个可移植的机制（逐条来自它的实现）
 *
 * ```
 *   ① 提及判定：长词（≥3 字）命中 1 个即算；短词（2 字）要命中 ≥2 个
 *      —— 因为「的青铜」这类碎片会造成大量假命中
 *   ② 埋设章取三者最小：正文关键词 ∪ 登记字段 ∪ 显式 chapter
 *      —— 全都没有就记 null，**不编造数字**
 *   ③ 连续缺席阈值可配（默认 5），且登记首现与实际首现不一致时提示
 *   ④ 目录不存在是唯一允许抛错的情况；其它一律降级 + 明说
 *      「空字段不代表确实没有内容」
 * ```
 *
 * @module dsh-math-calculator/ops/consistency-op
 */

import { toJsonValue } from '../format.js'
import { CalcError, type MathArgs, type Outcome } from './shared.js'

/** 一个设定条目。 */
interface Entry {
  /** 标识。 */
  id: string
  /** 内容（用于关键词匹配）。 */
  content: string
  /** 显式登记的首次出现位置（可选）。 */
  firstSeen?: number
  /** 状态：open 未回收 / done 已回收。 */
  status?: string
  /** 关联的人物/势力名。 */
  related?: string[]
}

/** 一个片段（对应小说的「章」）。 */
interface Section {
  /** 序号（从 1 起）。 */
  number: number
  /** 标题（可选）。 */
  title?: string
  /** 正文。 */
  text: string
}

/** 体检结果。 */
interface Finding {
  /** 类型。 */
  kind: 'stale' | 'absence' | 'gap' | 'orphan' | 'mismatch'
  /** 严重度（数字越大越要紧）。 */
  severity: number
  /** 一句话描述。 */
  message: string
  /** 涉及的对象。 */
  target: string
}

/**
 * 从内容里抽关键词（中文 2-4 字片段 + 英文词）。
 *
 * ## 长词/短词分开，是这套机制的关键
 *
 * novel-writer 的实现：
 * > 长词（≥3 字）命中 1 个即算；短词（2 字）需命中 ≥2 个。
 * > 原因：`plotKeywords` 会产出「的青铜」这类碎片，只认单个二字片段会大量假命中。
 *
 * 这条判据直接照搬 —— 它解决的是「2 字片段区分度太低」这个共性问题。
 *
 * @param content - 条目内容
 * @returns 强词（≥3 字）与弱词（2 字）
 */
function extractKeywords(content: string): { strong: string[]; weak: string[] } {
  const cjk = content.replace(/[^\u4e00-\u9fa5]/g, '')
  const strong = new Set<string>()
  const weak = new Set<string>()
  /** 3-4 字片段算强词。 */
  for (let size = 4; size >= 3; size -= 1) {
    for (let start = 0; start + size <= cjk.length; start += 1) {
      strong.add(cjk.slice(start, start + size))
    }
  }
  /** 2 字片段算弱词。 */
  for (let start = 0; start + 2 <= cjk.length; start += 1) {
    weak.add(cjk.slice(start, start + 2))
  }
  /** 英文/数字词。 */
  for (const word of content.match(/[A-Za-z][A-Za-z0-9_-]{1,}/g) ?? []) {
    strong.add(word.toLowerCase())
  }
  /** 强词里已包含的弱词不必重复计。 */
  for (const key of strong) weak.delete(key)
  return { strong: [...strong], weak: [...weak] }
}

/**
 * 判断一个片段是否「提及」某条目。
 *
 * @param text - 片段正文（已小写）
 * @param keywords - 该条目的强/弱词
 * @returns 是否提及
 */
function mentions(text: string, keywords: { strong: string[]; weak: string[] }): boolean {
  if (text === '') return false
  /** 强词命中 1 个即算。 */
  if (keywords.strong.some((key) => text.includes(key))) return true
  /** 弱词要命中 ≥2 个（单个 2 字片段区分度太低）。 */
  let weakHit = 0
  for (const key of keywords.weak) {
    if (text.includes(key)) {
      weakHit += 1
      if (weakHit >= 2) return true
    }
  }
  return false
}

/**
 * `consistency`：跨条目结构体检。
 *
 * @param args - 工具参数
 * @returns 结果文本与结构化值
 */
export function opConsistency(args: MathArgs): Outcome {
  const raw = (args as unknown as Record<string, unknown>).consistency
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CalcError(
      'invalid_argument',
      'consistency 需要给一个对象：{ sections, entries }',
      '例如 {consistency:{' +
        'sections:[{number:1,title:"开篇",text:"…正文…"},{number:2,text:"…"}],' +
        'entries:[{id:"T01",content:"北境有铁矿",status:"open"}]}}。' +
        '它会体检：条目立了多久没用上、势力/人物连续缺席、依赖断在哪。',
    )
  }

  const obj = raw as Record<string, unknown>
  const sectionsRaw = Array.isArray(obj.sections) ? obj.sections : []
  const entriesRaw = Array.isArray(obj.entries) ? obj.entries : []

  if (sectionsRaw.length === 0) {
    throw new CalcError(
      'invalid_argument',
      'consistency 需要 sections（片段列表），收到空',
      'sections 是世界观的章节/片段，每项 {number, title?, text}。' +
        '没有片段就无法判断「多久没提到」—— 那是这个操作的核心。',
    )
  }

  const sections: Section[] = sectionsRaw.map((item, index) => {
    const one = (item ?? {}) as Record<string, unknown>
    return {
      number: typeof one.number === 'number' ? one.number : index + 1,
      title: typeof one.title === 'string' ? one.title : undefined,
      text: typeof one.text === 'string' ? one.text : '',
    }
  })
  sections.sort((a, b) => a.number - b.number)
  const maxNumber = sections[sections.length - 1]?.number ?? 0

  const entries: Entry[] = entriesRaw.map((item, index) => {
    const one = (item ?? {}) as Record<string, unknown>
    return {
      id: typeof one.id === 'string' ? one.id : 'E' + (index + 1),
      content: typeof one.content === 'string' ? one.content : '',
      firstSeen: typeof one.firstSeen === 'number' ? one.firstSeen : undefined,
      status: typeof one.status === 'string' ? one.status : undefined,
      related: Array.isArray(one.related) ? one.related.map((r) => String(r)) : undefined,
    }
  })

  /** 缺席阈值（novel-writer 默认 5 章）。 */
  const absenceThreshold =
    typeof obj.absenceThreshold === 'number' && obj.absenceThreshold > 0
      ? Math.floor(obj.absenceThreshold)
      : 5
  /** 陈条阈值：未回收条目超过这么多章没再被提，就提示。 */
  const staleThreshold =
    typeof obj.staleThreshold === 'number' && obj.staleThreshold > 0
      ? Math.floor(obj.staleThreshold)
      : 10

  const degraded: string[] = []
  const findings: Finding[] = []

  /** 预先把每段的正文小写化（只做一次，避免重复开销）。 */
  const lowered = sections.map((section) => section.text.toLowerCase())

  // ── ① 每个条目：首次提及章 + 埋了多久 ──
  interface Lifecycle {
    id: string
    content: string
    status: string
    firstSeen: number | null
    lastSeen: number | null
    distance: number | null
    mentionedIn: number[]
  }
  const lifecycles: Lifecycle[] = []

  for (const entry of entries) {
    const keywords = extractKeywords(entry.content)
    const hitChapters: number[] = []
    sections.forEach((section, index) => {
      if (mentions(lowered[index], keywords)) hitChapters.push(section.number)
    })

    /**
     * 首次提及取三者最小：正文关键词 ∪ 显式 firstSeen。
     *
     * novel-writer 的做法是三者（含 mentionedIn 文件名），
     * 本操作只有两者 —— 但**「全都没有就记 null，不编造数字」这条照搬**。
     */
    const candidates: number[] = [...hitChapters]
    if (entry.firstSeen !== undefined) candidates.push(entry.firstSeen)
    const firstSeen = candidates.length > 0 ? Math.min(...candidates) : null
    const lastSeen = hitChapters.length > 0 ? Math.max(...hitChapters) : null

    if (firstSeen === null) {
      degraded.push(
        '条目 ' + entry.id + '（' + entry.content.slice(0, 16) + '…）在正文与登记字段里' +
          '都找不到提及位置：distance 不可知，不编造数字',
      )
    } else if (firstSeen > maxNumber) {
      degraded.push(
        '条目 ' + entry.id + ' 的首次提及（第 ' + firstSeen + ' 段）超出最大段号（第 ' +
          maxNumber + ' 段）：distance 按 0 计（登记字段可能指向尚未创建的片段）',
      )
    }

    const distance = firstSeen !== null && maxNumber > 0 ? Math.max(maxNumber - firstSeen, 0) : null
    lifecycles.push({
      id: entry.id,
      content: entry.content,
      status: entry.status ?? 'open',
      firstSeen,
      lastSeen,
      distance,
      mentionedIn: hitChapters,
    })

    /** 只对未回收条目判「陈条」。 */
    if ((entry.status ?? 'open') === 'done') continue
    if (distance !== null && distance >= staleThreshold) {
      findings.push({
        kind: 'stale',
        severity: Math.min(10, Math.floor(distance / staleThreshold) * 3),
        message: '条目 ' + entry.id + '（' + entry.content.slice(0, 18) + '…）立了 ' +
          distance + ' 段还没回收',
        target: entry.id,
      })
    }

    /** 登记的首现与实际首现不一致（novel-writer 的交叉核对）。 */
    if (entry.firstSeen !== undefined && hitChapters.length > 0 && entry.firstSeen !== hitChapters[0]) {
      findings.push({
        kind: 'mismatch',
        severity: 2,
        message: '条目 ' + entry.id + ' 登记的首次出现（第 ' + entry.firstSeen +
          ' 段）与正文实际首次提及（第 ' + hitChapters[0] + ' 段）不一致',
        target: entry.id,
      })
    }
  }

  // ── ② 关联对象的连续缺席（对应小说的「人丢了」）──
  const relatedNames = new Set<string>()
  for (const entry of entries) {
    for (const name of entry.related ?? []) relatedNames.add(name)
  }
  interface Absence {
    name: string
    presentIn: number[]
    absentRun: Array<{ from: number; to: number; length: number }>
  }
  const absences: Absence[] = []

  for (const name of relatedNames) {
    const presentIn: number[] = []
    sections.forEach((section, index) => {
      if (lowered[index].includes(name.toLowerCase())) presentIn.push(section.number)
    })
    if (presentIn.length === 0) {
      degraded.push('「' + name + '」全书未出场（登记了但正文里找不到名字）')
      continue
    }
    /** 找连续缺席区间。 */
    const runs: Array<{ from: number; to: number; length: number }> = []
    const present = new Set(presentIn)
    let runStart: number | null = null
    for (let n = 1; n <= maxNumber; n += 1) {
      if (!present.has(n)) {
        if (runStart === null) runStart = n
      } else if (runStart !== null) {
        const length = n - runStart
        if (length >= absenceThreshold) runs.push({ from: runStart, to: n - 1, length })
        runStart = null
      }
    }
    if (runStart !== null) {
      const length = maxNumber - runStart + 1
      if (length >= absenceThreshold) runs.push({ from: runStart, to: maxNumber, length })
    }
    absences.push({ name, presentIn, absentRun: runs })
    for (const run of runs) {
      findings.push({
        kind: 'absence',
        severity: Math.min(10, run.length),
        message: '「' + name + '」第 ' + run.from + '–' + run.to + ' 段连续缺席 ' + run.length + ' 段',
        target: name,
      })
    }
  }

  // ── ③ 剧情线最大空档（把未回收条目按关联对象聚成线）──
  interface Thread {
    name: string
    entries: string[]
    activeSections: number[]
    maxGap: number
    gapRange: [number, number] | null
  }
  const threads: Thread[] = []
  for (const name of relatedNames) {
    const relatedEntries = entries.filter((entry) => (entry.related ?? []).includes(name))
    const openEntries = relatedEntries.filter((entry) => (entry.status ?? 'open') !== 'done')
    if (openEntries.length === 0) continue
    /** 这条线上所有被提及的段号。 */
    const active = new Set<number>()
    for (const entry of openEntries) {
      const life = lifecycles.find((item) => item.id === entry.id)
      for (const n of life?.mentionedIn ?? []) active.add(n)
    }
    const sortedActive = [...active].sort((a, b) => a - b)
    /** 找最大空档。 */
    let maxGap = 0
    let gapRange: [number, number] | null = null
    for (let i = 1; i < sortedActive.length; i += 1) {
      const gap = sortedActive[i] - sortedActive[i - 1] - 1
      if (gap > maxGap) {
        maxGap = gap
        gapRange = [sortedActive[i - 1] + 1, sortedActive[i] - 1]
      }
    }
    threads.push({
      name,
      entries: openEntries.map((entry) => entry.id),
      activeSections: sortedActive,
      maxGap,
      gapRange,
    })
    if (maxGap >= absenceThreshold && gapRange) {
      findings.push({
        kind: 'gap',
        severity: Math.min(10, maxGap),
        message: '「' + name + '」这条线在第 ' + gapRange[0] + '–' + gapRange[1] +
          ' 段断了 ' + maxGap + ' 段',
        target: name,
      })
    }
  }

  // ── ④ 完全没被提及的条目 ──
  for (const life of lifecycles) {
    if (life.mentionedIn.length === 0 && life.firstSeen === null) {
      findings.push({
        kind: 'orphan',
        severity: 5,
        message: '条目 ' + life.id + '（' + life.content.slice(0, 18) + '…）在正文里从未出现',
        target: life.id,
      })
    }
  }

  /** 按严重度降序。 */
  findings.sort((a, b) => b.severity - a.severity)

  // ── 渲染 ──
  const lines: string[] = []
  lines.push('═══ 结构体检 ═══')
  lines.push('')
  lines.push('  片段 ' + sections.length + ' 个（第 1–' + maxNumber + ' 段）　' +
    '条目 ' + entries.length + ' 个　关联对象 ' + relatedNames.size + ' 个')
  lines.push('')

  if (findings.length === 0) {
    lines.push('  ✓ 没发现结构问题：没有陈条、没有连续缺席、没有断线。')
  } else {
    lines.push('  发现 ' + findings.length + ' 处（按严重度排序）：')
    for (const finding of findings) {
      const label =
        finding.kind === 'stale' ? '陈条'
          : finding.kind === 'absence' ? '缺席'
            : finding.kind === 'gap' ? '断线'
              : finding.kind === 'orphan' ? '从未出现'
                : '口径不一致'
      lines.push('   · [' + label + '] ' + finding.message)
    }
  }

  /** 条目生命周期表（哪怕没问题也值得看）。 */
  if (lifecycles.length > 0) {
    lines.push('')
    lines.push('  条目生命周期：')
    for (const life of lifecycles) {
      lines.push(
        '   · ' + life.id.padEnd(8, ' ') +
        (life.firstSeen === null ? '首现未知' : '首现第 ' + life.firstSeen + ' 段').padEnd(14, ' ') +
        (life.distance === null ? '' : '已过 ' + String(life.distance).padEnd(4, ' ') + '段') +
        (life.mentionedIn.length === 0 ? '（正文未提及）' : '') +
        (life.status === 'done' ? '［已回收］' : ''),
      )
    }
  }

  if (degraded.length > 0) {
    lines.push('')
    lines.push('  ⚠ 以下项数据不足，已如实标注（未编造）：')
    for (const one of degraded) lines.push('   · ' + one)
  }

  lines.push('')
  lines.push('  ★ 工具只报「哪里可能有问题」，**不替你改设定** —— 哪条是有意为之只有你知道。')

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      sections: sections.length,
      entries: entries.length,
      maxChapter: maxNumber,
      findings,
      lifecycles,
      absences,
      threads,
      degraded,
      absenceThreshold,
      staleThreshold,
    }),
  }
}
