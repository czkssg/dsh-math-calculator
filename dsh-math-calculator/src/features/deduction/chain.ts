/**
 * 链条传导（`chain`）。
 *
 * ## 为什么这是推演最核心的运算形状
 *
 * AI 在长推演里最终给出的往往不是单一数字，而是一条链：
 * 价格链 5 层、时间链 7 段。单点 sensitivity 只能回答"某一项变多少"，
 * 回答不了"A 变 X% 之后末端变成多少"。这里把链显式建模成有序段。
 *
 * ## 变量约定
 *
 * ```
 *   raw     起始值
 *   prev    上一段的结果（第一段的 prev = raw）
 *   s0..sN  第 i 段的结果（无论段名是什么都能引用）
 *   <as>    段自定的英文别名（推荐给中文段名配一个）
 *   <name>  段名本身，仅当它匹配 /^[A-Za-z_][A-Za-z0-9_]*$/ 时可用
 * ```
 *
 * 引用不存在的变量必须报 unknown_symbol，并把可用名列出来——
 * 静默当 0 会让整条链悄悄算错，那比报错危险得多。
 *
 * @module dsh-math-calculator/features/deduction/chain
 */

import { evaluate } from 'mathjs'
import { CalcError } from '../../core/errors.js'

/** 一段。 */
export interface ChainStage {
  /** 段名（可中文，用于展示）。 */
  name: string
  /** 该段的表达式，可引用 raw / prev / s0..sN / 之前的段别名。 */
  expr: string
  /** 英文别名，供后续段引用（中文名不能直接当变量）。 */
  as?: string
}

/** 输入。 */
export interface ChainInput {
  stages: ChainStage[]
  /** 起始值。 */
  raw: number
  /** 量的单位（只用于渲染）。 */
  unit?: string
}

/** 一行结果。 */
export interface ChainRow {
  stage: string
  value: number
  /** 本段相对上一段的增量（第一段为 0）。 */
  delta: number
  /** 本段值占末值的比例（末值为 0 时记 0）。 */
  share: number
  /** 本段增量占末值的比例——判断"哪一段是主导成本"要用它，而不是累计占比。 */
  deltaShare: number
}

/** 结果。 */
export interface ChainOutcome {
  result: string
  value: {
    table: ChainRow[]
    total: string
    breakpoints: string[]
    verdict: string
    closingGap: number
  }
  notice?: string
}

/** 数值格式化。 */
function f(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  const abs = Math.abs(value)
  if (abs >= 1e6 || (abs > 0 && abs < 1e-3)) return value.toExponential(3)
  return Number(value.toPrecision(6)).toString()
}

/** 合法别名。 */
const LEGAL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * 求一条链。
 *
 * @param input - 段列表与起始值
 * @returns 表格 + 断点 + 判定
 * @throws {CalcError} 缺参数 → missing_params；表达式/引用错 → invalid_argument 或 unknown_symbol
 */
export function runChain(input: ChainInput | undefined): ChainOutcome {
  if (input === undefined || input === null) {
    throw new CalcError(
      'missing_params',
      'chain 需要 stages（段列表）与 raw（起始值）',
      '例如 {chain:{raw:8, stages:[{name:"坑口价",expr:"raw"},{name:"运输成本",expr:"raw*0.3",as:"trans"}]}}。',
    )
  }
  const stages = (input as { stages?: unknown }).stages
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new CalcError(
      'missing_params',
      'chain 需要非空的 stages 数组',
      '每段形如 {name:"到岸价", expr:"prev+trans"}；第一段通常写 {name:"坑口价", expr:"raw"}。',
    )
  }
  const raw = (input as { raw?: unknown }).raw
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new CalcError(
      'missing_params',
      'chain 需要 raw（起始值，有限数）',
      '例如 raw:8 表示坑口价 8 先令/吨。',
    )
  }

  const scope: Record<string, number> = { raw }
  const rows: ChainRow[] = []
  let previous = raw

  for (let i = 0; i < stages.length; i += 1) {
    const stage = stages[i] as Record<string, unknown> | null
    if (typeof stage !== 'object' || stage === null || Array.isArray(stage)) {
      throw new CalcError('invalid_argument', 'stages[' + i + '] 必须是对象（含 name 与 expr）', '例如 {name:"运输成本", expr:"raw*0.3"}。')
    }
    const name = typeof stage['name'] === 'string' && stage['name'].trim() !== '' ? stage['name'].trim() : '段 ' + (i + 1)
    const expr = stage['expr']
    if (typeof expr !== 'string' || expr.trim() === '') {
      throw new CalcError(
        'invalid_argument',
        'stages[' + i + ']（' + name + '）缺 expr（非空表达式字符串）',
        '例如 {name:"利润", expr:"prev*0.25"}。',
      )
    }
    scope['prev'] = previous

    /** 中文段名不能直接当变量：mathjs 会报语法错，直接转成可读的 unknown_symbol。 */
    if (/[\u4e00-\u9fa5]/.test(expr)) {
      throw new CalcError(
        'unknown_symbol',
        '第 ' + (i + 1) + ' 段「' + name + '」的表达式里有中文标识符：' + expr,
        '变量名只能用 ASCII 字母数字下划线。中文段名请配 as（如 as:"trans"），然后在表达式里写 prev+trans。',
      )
    }

    let computed: unknown
    try {
      computed = evaluate(expr, scope)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const unknown = /Undefined symbol\s+(\S+)/i.exec(message)
      if (unknown) {
        throw new CalcError(
          'unknown_symbol',
          '第 ' + (i + 1) + ' 段「' + name + '」引用了未定义的变量 ' + unknown[1],
          '本段可用：raw / prev / s0…s' + i + ' / ' + Object.keys(scope).filter((k) => !/^(raw|prev|s\d+)$/.test(k)).join(' / ') +
            '。中文段名不能直接当变量，请给段加 as（如 as:"trans"）。',
        )
      }
      throw new CalcError('invalid_argument', '第 ' + (i + 1) + ' 段「' + name + '」表达式无法求值：' + message.slice(0, 160), '检查括号与运算符。')
    }
    if (typeof computed !== 'number' || !Number.isFinite(computed)) {
      throw new CalcError(
        'non_finite',
        '第 ' + (i + 1) + ' 段「' + name + '」算出非有限值（' + String(computed) + '）',
        '常见原因：除以 0 或引用了一个还没赋值的量。',
      )
    }

    const value = computed
    rows.push({ stage: name, value, delta: value - previous, share: 0, deltaShare: 0 })
    scope['s' + i] = value
    if (typeof stage['as'] === 'string' && LEGAL_NAME.test(stage['as'])) scope[stage['as']] = value
    if (LEGAL_NAME.test(name)) scope[name] = value
    previous = value
  }

  const lastValue = rows[rows.length - 1].value
  for (const row of rows) {
    row.share = lastValue === 0 ? 0 : row.value / lastValue
    row.deltaShare = lastValue === 0 ? 0 : row.delta / lastValue
  }

  /**
   * 断点看**增量占比**，不看累计占比。
   *
   * 累计链里每段的值都接近末值（share 趋近 100%），用它判主导段会永远判成末段。
   * "运输成本占总价 30%" 说的是增量，不是累计。
   */
  const breakpoints: string[] = []
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i].deltaShare > 0.5) {
      breakpoints.push(
        rows[i].stage + ' 的增量占终点值的 ' + (rows[i].deltaShare * 100).toFixed(0) + '%——超过一半，这一段的任何波动都会主导整链。',
      )
    }
  }

  const closingGap = lastValue - raw
  const dominant = rows.slice(1).sort((a, b) => b.deltaShare - a.deltaShare)[0]
  const verdict =
    '链闭合（' + rows.length + ' 段，起点 ' + f(raw) + ' → 终点 ' + f(lastValue) + '）；' +
    (dominant ? dominant.stage + ' 是主导成本（增量占 ' + (dominant.deltaShare * 100).toFixed(0) + '%）' : '只有一段，无主导成本')

  const unitSuffix = typeof input.unit === 'string' && input.unit.trim() !== '' ? '（' + input.unit.trim() + '）' : ''
  const total = rows.map((row) => f(row.value)).join(' → ') + unitSuffix

  const lines: string[] = ['链条传导', '', '  段名            本段值        增量        累计占比      增量占比']
  for (const row of rows) {
    lines.push(
      '  ' + row.stage.padEnd(15) + f(row.value).padStart(12) + f(row.delta).padStart(12) +
      (row.share * 100).toFixed(1).padStart(9) + '%' + (row.deltaShare * 100).toFixed(1).padStart(11) + '%',
    )
  }
  lines.push('')
  lines.push('  总量：' + total)
  lines.push('  ' + verdict)
  if (breakpoints.length > 0) {
    for (const point of breakpoints) lines.push('  · ' + point)
  }

  return {
    result: lines.join('\n'),
    value: { table: rows, total, breakpoints, verdict, closingGap },
  }
}
