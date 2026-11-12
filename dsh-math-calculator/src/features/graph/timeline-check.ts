/**
 * 时间线检查（`timeline_check`）。
 *
 * 反馈包 N9（P1）：时间线矛盾是推演类文档的高频硬伤——
 * 「第 5 年冰层形成」与「第 3 年已能施工」不该同时成立，但通读时很难发现。
 *
 * ## 检查项
 *
 * ```
 *   逆序       start > end（区间写反）
 *   重叠       两个事件的区间相交（可能是合理的：多线并行）
 *   跨度超限    单个事件跨度超过调用方给的上限
 *   缺起点      既没有 year 也没有 start
 *   输入乱序    事件不是按时间递增排列（只提示，不判错）
 * ```
 *
 * ## 不猜
 *
 * 重叠是否合理由作者定：`overlapAllowed` 缺省 false（报告），传 true 则不报。
 * 工具只列冲突，不说「哪个事件该删」。
 *
 * ## 年份约定
 *
 * 用「年」为单位的数值；公元前用负数（-500 = 公元前 500 年）。
 * 不处理日历/闰年——那是另一层，这里只做区间数学。
 *
 * @module dsh-math-calculator/features/graph/timeline-check
 */

import { CalcError } from '../../core/errors.js'

/** 一个时间线事件。 */
export interface TimelineEvent {
  /** 名称。 */
  name: string
  /** 区间起点（年）。 */
  start?: number
  /** 区间终点（年）；缺省 = start（点事件）。 */
  end?: number
  /** 点事件的年份（等价于 start=end=year）。 */
  year?: number
  /** 若给 duration 而没给 end，则 end = start + duration。 */
  duration?: number
  note?: string
  source?: string
}

/** 输入。 */
export interface TimelineCheckInput {
  events: TimelineEvent[]
  /** 单个事件允许的最大跨度（年）。 */
  maxSpan?: number
  /** 是否允许重叠（缺省 false = 报告重叠）。 */
  overlapAllowed?: boolean
}

/** 一条问题。 */
export interface TimelineFinding {
  kind: 'reversed' | 'overlap' | 'span-exceeded' | 'missing-start' | 'out-of-order'
  events: string[]
  message: string
}

/** 计算结果中的事件。 */
export interface ComputedEvent {
  name: string
  start: number
  end: number
  span: number
  note?: string
  source?: string
}

/** 结果。 */
export interface TimelineCheckOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 数值渲染。 */
function show(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  return String(Number(value.toPrecision(8)))
}

/**
 * 检查时间线。
 *
 * @param input - 事件列表与判据
 * @returns 问题清单 + 排序后的时间线
 * @throws {CalcError} 缺 events → missing_params；事件非法 → invalid_argument
 */
export function runTimelineCheck(input: TimelineCheckInput | undefined): TimelineCheckOutcome {
  if (input === undefined || input === null || !Array.isArray(input.events)) {
    throw new CalcError(
      'missing_params',
      'timeline_check 需要 events（事件数组）',
      '每个事件形如 {name:"冰层形成", year:5} 或 {name:"建设期", start:3, end:8}。公元前用负数。',
    )
  }
  if (input.events.length === 0) {
    throw new CalcError('missing_params', 'timeline_check 的 events 为空', '至少给一个事件。')
  }

  const findings: TimelineFinding[] = []
  const computed: ComputedEvent[] = []

  for (let index = 0; index < input.events.length; index += 1) {
    const event = input.events[index] as unknown as Record<string, unknown> | null
    if (typeof event !== 'object' || event === null || Array.isArray(event)) {
      throw new CalcError('invalid_argument', 'events[' + index + '] 必须是对象', '例如 {name:"冰层形成", year:5}。')
    }
    const name = typeof event['name'] === 'string' && event['name'].trim() !== '' ? event['name'].trim() : '事件 ' + (index + 1)
    const year = typeof event['year'] === 'number' ? event['year'] : undefined
    const startRaw = typeof event['start'] === 'number' ? event['start'] : year
    if (startRaw === undefined || !Number.isFinite(startRaw)) {
      findings.push({ kind: 'missing-start', events: [name], message: name + ' 既没有 year 也没有 start，无法排进时间线' })
      continue
    }
    const duration = typeof event['duration'] === 'number' ? event['duration'] : undefined
    const endRaw = typeof event['end'] === 'number' ? event['end'] : duration !== undefined ? startRaw + duration : year !== undefined ? year : startRaw
    if (!Number.isFinite(endRaw)) {
      throw new CalcError('invalid_argument', name + ' 的 end/duration 不是有限数', 'end 是区间终点（年）；duration 是跨度（年）。')
    }
    if (startRaw > endRaw) {
      findings.push({ kind: 'reversed', events: [name], message: name + ' 的起点 ' + show(startRaw) + ' 晚于终点 ' + show(endRaw) + '（区间写反）' })
    }
    computed.push({
      name,
      start: startRaw,
      end: endRaw,
      span: endRaw - startRaw,
      ...(typeof event['note'] === 'string' ? { note: event['note'] as string } : {}),
      ...(typeof event['source'] === 'string' ? { source: event['source'] as string } : {}),
    })
  }

  /** 跨度超限。 */
  const maxSpan = typeof input.maxSpan === 'number' && Number.isFinite(input.maxSpan) && input.maxSpan > 0 ? input.maxSpan : null
  if (maxSpan !== null) {
    for (const event of computed) {
      if (event.span > maxSpan) {
        findings.push({
          kind: 'span-exceeded',
          events: [event.name],
          message: event.name + ' 跨度 ' + show(event.span) + ' 年，超过上限 ' + show(maxSpan) + ' 年',
        })
      }
    }
  }

  /** 重叠（按排序后的顺序两两比，只报相邻重叠即可覆盖全部相交对）。 */
  const sorted = [...computed].sort((a, b) => a.start - b.start || a.end - b.end)
  if (input.overlapAllowed !== true) {
    for (let index = 0; index + 1 < sorted.length; index += 1) {
      const current = sorted[index]
      const next = sorted[index + 1]
      if (next.start < current.end) {
        findings.push({
          kind: 'overlap',
          events: [current.name, next.name],
          message: current.name + '（' + show(current.start) + '–' + show(current.end) + '）与 ' + next.name +
            '（' + show(next.start) + '–' + show(next.end) + '）重叠',
        })
      }
    }
  }

  /** 输入顺序是否递增（只提示）。 */
  for (let index = 0; index + 1 < computed.length; index += 1) {
    if (computed[index].start > computed[index + 1].start) {
      findings.push({
        kind: 'out-of-order',
        events: [computed[index].name, computed[index + 1].name],
        message: '输入顺序不是时间递增：' + computed[index].name + ' 排在 ' + computed[index + 1].name + ' 之前',
      })
      break
    }
  }

  const lines: string[] = ['═══ 时间线检查 ═══', '']
  lines.push('  事件 ' + computed.length + ' 个，问题 ' + findings.length + ' 条')
  lines.push('')
  if (findings.length === 0) {
    lines.push('  ✓ 未发现逆序、重叠、跨度超限或缺失起点')
  } else {
    const labels: Record<TimelineFinding['kind'], string> = {
      reversed: '逆序',
      overlap: '重叠',
      'span-exceeded': '跨度超限',
      'missing-start': '缺起点',
      'out-of-order': '输入乱序',
    }
    for (const finding of findings) lines.push('  ✗ [' + labels[finding.kind] + '] ' + finding.message)
  }
  lines.push('')
  lines.push('  【排序后的时间线】')
  for (const event of sorted) {
    const span = event.start === event.end ? show(event.start) : show(event.start) + '–' + show(event.end) + '（' + show(event.span) + ' 年）'
    lines.push('  ' + span.padEnd(22, ' ') + event.name + (event.note ? '  · ' + event.note : ''))
  }
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  lines.push('')
  if (first !== undefined && last !== undefined) {
    lines.push('  覆盖 ' + show(first.start) + ' 至 ' + show(last.end) + '（约 ' + show(last.end - first.start) + ' 年）')
  } else {
    lines.push('  没有可排序的事件（全部缺起点）')
  }
  lines.push('  ★ 重叠是否合理由作者定：多线并行时重叠是正常的，传 overlapAllowed:true 可关掉该检查。')

  const notices: string[] = []
  const hard = findings.filter((finding) => finding.kind === 'reversed' || finding.kind === 'missing-start')
  if (hard.length > 0) notices.push('有 ' + hard.length + ' 条硬错误（逆序/缺起点）')
  if (findings.filter((finding) => finding.kind === 'overlap').length > 0) notices.push('有重叠区间，若是有意并行可忽略')

  return {
    result: lines.join('\n'),
    value: {
      events: sorted,
      findings,
      counts: {
        reversed: findings.filter((f) => f.kind === 'reversed').length,
        overlap: findings.filter((f) => f.kind === 'overlap').length,
        'span-exceeded': findings.filter((f) => f.kind === 'span-exceeded').length,
        'missing-start': findings.filter((f) => f.kind === 'missing-start').length,
        'out-of-order': findings.filter((f) => f.kind === 'out-of-order').length,
      },
      coverage: first !== undefined && last !== undefined ? { from: first.start, to: last.end, span: last.end - first.start } : null,
    },
    ...(notices.length > 0 ? { notice: notices.join('；') } : {}),
  }
}
