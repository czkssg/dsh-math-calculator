/**
 * 货币符号库（`currency`）：现代 / 古代 / 架空货币的**符号与名称**。
 *
 * ## 口径（用户 2026-11-20 明确）
 *
 * - **只做符号库**：中文名、国际符号、缩写——方便写作时调用（如 $5/t、€3/kg）；
 * - **不做汇率换算**，**不记录购买力**；购买力由 AI 按当时世界自行查询/设定；
 * - 现代/古代/架空同样只给符号信息（架空的金银铜比例由世界设定决定）。
 *
 * @module dsh-math-calculator/features/currency/currency
 */

import { CalcError } from '../../core/errors.js'

/** 一条货币。 */
export interface CurrencyEntry {
  code: string
  name: string
  symbol?: string
  abbrev?: string
  kind: 'modern' | 'ancient' | 'fantasy'
  note?: string
}

/** 输入。 */
export interface CurrencyInput {
  /** list / get（默认 list）。 */
  action?: string
  /** list 过滤：modern / ancient / fantasy。 */
  kind?: string
  /** get 的货币（代码或中文名/缩写/符号）。 */
  code?: string
}

/** 结果。 */
export interface CurrencyOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 数据文件形状。 */
export interface CurrencyFile {
  meta?: Record<string, unknown>
  currencies: CurrencyEntry[]
}

/** 类型显示名。 */
const KIND_LABEL: Record<string, string> = { modern: '现代货币', ancient: '古代/历史货币', fantasy: '架空通用货币' }

/** 找货币（代码大小写不敏感，也认中文名/缩写/符号）。 */
function findCurrency(entries: CurrencyEntry[], key: string): CurrencyEntry | undefined {
  const text = key.trim()
  if (text === '') return undefined
  const lower = text.toLowerCase()
  return entries.find(
    (item) =>
      item.code.toLowerCase() === lower ||
      item.name === text ||
      item.abbrev === text ||
      (item.symbol !== undefined && item.symbol !== '' && item.symbol === text),
  )
}

/** 一行摘要（符号/缩写是本体）。 */
function lineOf(item: CurrencyEntry): string {
  const symbol = item.symbol !== undefined && item.symbol !== '' ? item.symbol : '—'
  return '  ' + item.code.padEnd(20) + ' ' + item.name.padEnd(16) + ' ' + symbol.padEnd(6) + ' ' + String(item.abbrev ?? '') + (item.note !== undefined ? '  · ' + item.note : '')
}

/**
 * 执行 currency。
 *
 * @param file - 货币数据
 * @param input - 动作与参数
 * @returns 结果
 * @throws {CalcError} 参数缺失/货币未知/动作不支持
 */
export function runCurrency(file: CurrencyFile, input: CurrencyInput = {}): CurrencyOutcome {
  const entries = Array.isArray(file.currencies) ? file.currencies : []
  const action = typeof input.action === 'string' && input.action.trim() !== '' ? input.action.trim().toLowerCase() : 'list'

  if (action === 'list') {
    const kinds = ['modern', 'ancient', 'fantasy']
    const filter = typeof input.kind === 'string' && input.kind.trim() !== '' ? input.kind.trim().toLowerCase() : ''
    if (filter !== '' && !kinds.includes(filter)) {
      throw new CalcError('invalid_argument', 'kind 只支持 modern / ancient / fantasy（收到「' + input.kind + '」）', '')
    }
    const lines: string[] = ['═══ 货币符号库（' + entries.length + ' 条）═══', '']
    const picked = filter === '' ? kinds : [filter]
    for (const kind of picked) {
      const group = entries.filter((item) => item.kind === kind)
      if (group.length === 0) continue
      lines.push('【' + KIND_LABEL[kind] + '】（' + group.length + '）')
      for (const item of group) lines.push(lineOf(item))
      lines.push('')
    }
    lines.push('  ★ 只有符号/名称：做汇率或购买力由 AI 按当时世界查询/设定，库里不写。')
    lines.push('  ★ 写作时单价可直接用缩写：$5/t、€3/kg、¥12/斤、1 两银/石。')
    const listed = entries.filter((item) => filter === '' || item.kind === filter)
    return { result: lines.join('\n'), value: { kind: filter === '' ? 'all' : filter, currencies: listed } }
  }

  if (action === 'get') {
    const key = typeof input.code === 'string' ? input.code : ''
    const item = findCurrency(entries, key)
    if (item === undefined) {
      throw new CalcError('unknown_symbol', '货币库里没有「' + key + '」', '用 {operation:"currency", currencyAction:"list"} 看全部；代码如 CNY/USD/EUR，也认中文名/缩写。')
    }
    const lines: string[] = ['═══ ' + item.name + '（' + item.code + '）═══', '']
    lines.push('  中文名：' + item.name)
    lines.push('  国际符号：' + (item.symbol !== undefined && item.symbol !== '' ? item.symbol : '（无）'))
    lines.push('  缩写：' + (item.abbrev ?? '（无）'))
    lines.push('  类别：' + (KIND_LABEL[item.kind] ?? item.kind))
    if (item.note !== undefined) lines.push('  备注：' + item.note)
    lines.push('')
    lines.push('  ★ 库里不写汇率与购买力；需要时由 AI 按当时世界查询/设定。')
    return { result: lines.join('\n'), value: item }
  }

  throw new CalcError('unknown_argument', '不认识的 currency 动作「' + action + '」', '可用：list（列出符号）/ get（单条信息）。不做换算——购买力由 AI 自行判断。')
}
