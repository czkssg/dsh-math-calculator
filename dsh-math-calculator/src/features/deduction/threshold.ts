/**
 * 自定义阈值判断（`threshold`）。
 *
 * ## 语义（按反馈包 6.5 的示例反推并自洽化）
 *
 * ```
 *   thresholds 按 at 升序；at_i 是第 i 档（label_i）的**上界（不含）**
 *   value <  at_0              → label_0（最低档）
 *   at_{i-1} ≤ value < at_i    → label_i
 *   value ≥ at_n               → label_n（最高档），并注明「已超过最高档」
 * ```
 *
 * 规格示例：`0.35 → 中`，note `落在 0.2–0.5 区间`。要让这两条同时成立，
 * at 只能是"该档的上界"：0.35 落在 (0.2, 0.5)，对应 at=0.5 那一档的 label「中」。
 * 若把 at 当"下界"，0.35 会归「低」，与规格示例矛盾 —— 所以这里按上界语义实现，
 * 并在输出里把区间写清楚，避免调用方按错语义读。
 *
 * ## 不猜
 *
 * 档名、区间、判据全部由调用方给；工具只把数字放进调用方划的格子。
 *
 * @module dsh-math-calculator/features/deduction/threshold
 */

import { CalcError } from '../../core/errors.js'
import { fmtGeneral } from '../../core/format.js'

/** 一档阈值。 */
export interface ThresholdLevel {
  /** 该档的上界（不含）。 */
  at: number
  /** 档名（原样回带）。 */
  label: string
  /** 该档补充说明（可选，原样回带）。 */
  note?: string
}

/** 输入。 */
export interface ThresholdInput {
  value: number
  thresholds: ThresholdLevel[]
}

/** 结果。 */
export interface ThresholdOutcome {
  result: string
  value: unknown
  notice?: string
}

/**
 * 判断一个数落在哪一档。
 *
 * @param input - 数值与阈值表
 * @returns 档名、区间说明与结构化结果
 * @throws {CalcError} 缺 value / thresholds 为空 → `missing_params`；
 *   value 或 at 非有限数、label 为空 → `invalid_argument`
 */
export function classifyThreshold(input: ThresholdInput | undefined): ThresholdOutcome {
  if (input === undefined || input === null) {
    throw new CalcError(
      'missing_params',
      'threshold 需要 value（待判断的数值）与 thresholds（阈值表）',
      '例如 {threshold:{value:0.35, thresholds:[{at:0.2,label:"低"}…]}}。',
    )
  }
  const rawValue = (input as { value?: unknown }).value
  if (rawValue === undefined || rawValue === null) {
    throw new CalcError('missing_params', 'threshold 缺 value（待判断的数值）', '例如 {threshold:{value:0.35, thresholds:[…]}}。')
  }
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    throw new CalcError(
      'invalid_argument',
      'value 必须是有限数（收到 ' + String(rawValue) + '）',
      '不能是字符串、NaN 或无穷。例如 value:0.35。',
    )
  }
  const value = rawValue

  const rawThresholds = (input as { thresholds?: unknown }).thresholds
  if (!Array.isArray(rawThresholds) || rawThresholds.length === 0) {
    throw new CalcError(
      'missing_params',
      'threshold 需要非空的 thresholds 数组',
      '例如 thresholds:[{at:0.2,label:"低"},{at:0.5,label:"中"},{at:0.8,label:"高"}]。',
    )
  }

  const levels: ThresholdLevel[] = []
  for (let i = 0; i < rawThresholds.length; i += 1) {
    const item = rawThresholds[i] as Record<string, unknown> | null
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new CalcError('invalid_argument', 'thresholds[' + i + '] 必须是对象（含 at 与 label）', '例如 {at:0.2, label:"低"}。')
    }
    if (typeof item['at'] !== 'number' || !Number.isFinite(item['at'])) {
      throw new CalcError('invalid_argument', 'thresholds[' + i + '].at 必须是有限数（收到 ' + String(item['at']) + '）', 'at 是这一档的上界。例如 at:0.2。')
    }
    if (typeof item['label'] !== 'string' || item['label'].trim() === '') {
      throw new CalcError('invalid_argument', 'thresholds[' + i + '].label 必须是非空字符串', 'label 是档名，工具会原样回带。例如 label:"中"。')
    }
    const level: ThresholdLevel = { at: item['at'], label: item['label'] }
    if (typeof item['note'] === 'string') level.note = item['note']
    levels.push(level)
  }

  const sorted = levels
    .map((level, index) => ({ level, index }))
    .sort((a, b) => a.level.at - b.level.at || a.index - b.index)
    .map((entry) => entry.level)

  const duplicates: number[] = []
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].at === sorted[i - 1].at && !duplicates.includes(sorted[i].at)) duplicates.push(sorted[i].at)
  }

  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  /** 第一个 value < at 的档；找不到说明超过最高档。 */
  const upper = sorted.findIndex((level) => value < level.at)

  let index: number
  let label: string
  let note: string
  let levelKind: 'below-min' | 'within' | 'at-top' | 'above'

  if (upper === -1) {
    index = sorted.length - 1
    label = last.label
    levelKind = 'above'
    note = '已超过最高档（最高档上界 at=' + fmtGeneral(last.at) + '「' + last.label + '」）'
  } else {
    index = upper
    label = sorted[index].label
    if (index === 0) {
      levelKind = 'below-min'
      note = '低于最低档阈值 ' + fmtGeneral(first.at) + '，归「' + label + '」'
    } else if (sorted[index - 1].at === value) {
      levelKind = 'within'
      note = '正好等于上一档上界 ' + fmtGeneral(sorted[index - 1].at) + '，归下一档「' + label + '」'
    } else {
      levelKind = 'within'
      note = '落在 ' + fmtGeneral(sorted[index - 1].at) + '–' + fmtGeneral(sorted[index].at) + ' 区间'
    }
    if (value === last.at && index === sorted.length - 1) levelKind = 'at-top'
    if (sorted[index].note !== undefined && sorted[index].note !== '') note += '；' + sorted[index].note
  }

  const lowerBound = index === 0 ? null : sorted[index - 1].at
  const upperBound = sorted[index].at

  const resultLines = ['阈值判断', '', '  ' + fmtGeneral(value) + ' → 「' + label + '」', '  ' + note]
  if (duplicates.length > 0) {
    resultLines.push(
      '  注意：at=' + duplicates.map(fmtGeneral).join(', ') + ' 有重复档位，区间宽度为 0；落在该点的值归排序后靠前的档。',
    )
  }

  const notices: string[] = []
  if (duplicates.length > 0) notices.push('阈值表里有重复的 at，区间宽度为 0')
  if (levelKind === 'below-min') notices.push('数值低于最低档阈值，已归最低档而不是报错')
  if (levelKind === 'above') notices.push('数值已超过最高档，label 取最高档')

  return {
    result: resultLines.join('\n'),
    value: {
      value,
      label,
      note,
      index,
      level: levelKind,
      at: sorted[index]?.at ?? null,
      lowerBound,
      upperBound,
      thresholds: sorted.map((level) => ({ at: level.at, label: level.label })),
    },
    ...(notices.length > 0 ? { notice: notices.join('；') } : {}),
  }
}
