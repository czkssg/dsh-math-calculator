/**
 * 基准数据锚定（`anchor`）。
 *
 * ## 为什么独立一层
 *
 * 推演要「锚定真实历史数据」，但每次检索 23 个网页不现实。
 * 这一层把锚点做成可查询表：值、范围、来源、置信度，原样带回。
 *
 * ## 不编数据
 *
 * 本模块**不内置任何历史人口/经济数据**。可查来源只有两处：
 * ```
 *   ① 调用方传入的 anchors 数组
 *   ② 调用方从工作区 anchors.json 读出后传入的同一数组
 * ```
 * 查不到就报 unknown_symbol 并说明怎么补——凭想象填一个"罗马帝国人口 5.5e7"
 * 会让整份推演建立在编造的数字上，比缺数据危险得多。
 *
 * 锚点里**可以**包含项目自有数据（bodies.json / constants-graph.json 的真实值），
 * 由调用方整理后传入。
 *
 * @module dsh-math-calculator/features/deduction/anchor
 */

import { CalcError } from '../../core/errors.js'

/** 一条锚点。 */
export interface AnchorEntry {
  /** 名称（可中文）。 */
  name: string
  /** 数值。 */
  value: number
  /** 允许范围 [下限, 上限]。 */
  range?: [number, number]
  /** 单位（只用于展示）。 */
  unit?: string
  /** 来源（URL 或文献名）。没给就是 null，工具不编。 */
  sources?: string[]
  /** 置信度：高 / 中 / 低，或 exact/estimated。 */
  confidence?: string
  /** 备注。 */
  note?: string
}

/** 输入。 */
export interface AnchorInput {
  /** 要查的锚点名。 */
  anchor?: string
  /** 可查的锚点表（调用方从工作区 anchors.json 或内置数据整理后传入）。 */
  anchors?: AnchorEntry[]
  /** true 表示列出全部锚点。 */
  list?: boolean
}

/** 结果。 */
export interface AnchorOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 数字格式化。 */
function f(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  const abs = Math.abs(value)
  if (abs >= 1e6 || (abs > 0 && abs < 1e-3)) return value.toExponential(3)
  return Number(value.toPrecision(6)).toString()
}

/** 校验并复制锚点表。 */
function readAnchors(raw: unknown): AnchorEntry[] {
  if (!Array.isArray(raw)) {
    throw new CalcError(
      'missing_params',
      'anchors 必须是数组（每项 {name, value, range?, sources?, confidence?}）',
      '例如 anchors:[{name:"罗马帝国人口", value:5.5e7, range:[4.5e7,7e7], confidence:"中"}]。',
    )
  }
  return raw.map((item, index) => {
    const entry = item as Record<string, unknown> | null
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new CalcError('invalid_argument', 'anchors[' + index + '] 必须是对象', '每项至少要有 name 与 value。')
    }
    if (typeof entry['name'] !== 'string' || entry['name'].trim() === '') {
      throw new CalcError('invalid_argument', 'anchors[' + index + '].name 必须是非空字符串', '')
    }
    if (typeof entry['value'] !== 'number' || !Number.isFinite(entry['value'])) {
      throw new CalcError('invalid_argument', 'anchors[' + index + '].value（' + entry['name'] + '）必须是有限数', '')
    }
    const result: AnchorEntry = { name: entry['name'].trim(), value: entry['value'] }
    if (Array.isArray(entry['range']) && entry['range'].length === 2 && typeof entry['range'][0] === 'number' && typeof entry['range'][1] === 'number') {
      result.range = [entry['range'][0], entry['range'][1]]
    }
    if (typeof entry['unit'] === 'string') result.unit = entry['unit']
    if (Array.isArray(entry['sources'])) result.sources = entry['sources'].filter((s): s is string => typeof s === 'string')
    if (typeof entry['confidence'] === 'string') result.confidence = entry['confidence']
    if (typeof entry['note'] === 'string') result.note = entry['note']
    return result
  })
}

/**
 * 查询锚点。
 *
 * @param input - 锚点名与锚点表
 * @returns 单条结果或全部列表
 * @throws {CalcError} 缺表 → missing_params；查不到 → unknown_symbol
 */
export function lookupAnchor(input: AnchorInput | undefined): AnchorOutcome {
  if (input === undefined || input === null) {
    throw new CalcError(
      'missing_params',
      'anchor 需要 anchor（锚点名）与 anchors（锚点表）',
      '例如 {anchor:{anchor:"罗马帝国人口", anchors:[…]}}。',
    )
  }
  const anchors = readAnchors((input as { anchors?: unknown }).anchors)
  const wanted = typeof input.anchor === 'string' ? input.anchor.trim() : ''

  if (input.list === true || wanted === '') {
    const lines = ['基准锚点（' + anchors.length + ' 条）', '']
    for (const entry of anchors) {
      const range = entry.range ? ' 范围 ' + f(entry.range[0]) + '–' + f(entry.range[1]) : ''
      lines.push('  ' + entry.name.padEnd(20) + f(entry.value).padStart(12) + ' ' + (entry.unit ?? '') + range)
    }
    return { result: lines.join('\n'), value: { anchors } }
  }

  const exact = anchors.filter((entry) => entry.name === wanted)
  const fuzzy = anchors.filter((entry) => entry.name.includes(wanted) || wanted.includes(entry.name))
  const matches = exact.length > 0 ? exact : fuzzy
  if (matches.length === 0) {
    throw new CalcError(
      'unknown_symbol',
      '锚点表里没有「' + wanted + '」',
      '已收录：' + (anchors.length > 0 ? anchors.map((entry) => entry.name).join(' / ') : '（空表）') +
        '。要把这条加进去，写进工作区 anchors.json，或直接在 anchors 数组里给。',
    )
  }
  if (matches.length > 1) {
    throw new CalcError(
      'invalid_argument',
      '「' + wanted + '」匹配到多条锚点，无法确定是哪一条',
      '候选：' + matches.map((entry) => entry.name).join(' / ') + '。请用完整名称。',
    )
  }

  const found = matches[0]
  const lines = [
    '锚点：' + found.name,
    '',
    '  值：' + f(found.value) + (found.unit ? ' ' + found.unit : ''),
    found.range ? '  范围：' + f(found.range[0]) + '–' + f(found.range[1]) : '  范围：未给',
    '  来源：' + (found.sources && found.sources.length > 0 ? found.sources.join('；') : '未给（工具不编造来源）'),
    '  置信度：' + (found.confidence ?? '未标注'),
  ]
  if (found.note) lines.push('  备注：' + found.note)

  const notices: string[] = []
  if (!found.sources || found.sources.length === 0) notices.push('这条锚点没有来源，引用前请自行核实')
  if (found.range) {
    const spread = (found.range[1] - found.range[0]) / Math.max(1e-12, Math.abs(found.value))
    notices.push('范围相对值 ' + (spread * 100).toFixed(0) + '%，引用时保留区间而不是只取单值')
  }

  return {
    result: lines.join('\n'),
    value: found,
    ...(notices.length > 0 ? { notice: notices.join('；') } : {}),
  }
}
