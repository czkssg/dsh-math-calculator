/**
 * 区间运算（`interval`）。
 *
 * ## 为什么需要它（反馈包 15 号称之为「最被忽视」）
 *
 * AI 推演时全程用区间思考：
 *
 * ```
 *   占比 20–40%、产量 21–25 亿、单产 2000–2500、年减薄 20–50%
 * ```
 *
 * 而**点值工具逼它口算**。区间算术的关键不是「算上下界」，
 * 而是**乘法要四个角都试**（否则会低估区间宽度）。
 *
 * ## 四个能力
 *
 * ```
 *   ① 四则运算     [a,b] + [c,d] = [a+c, b+d]
 *   ② 乘法四点验证  [a,b] × [c,d] 要试 a·c, a·d, b·c, b·d 四个
 *   ③ 门槛判定     区间是否跨过某个阈值（含把握程度）
 *   ④ 松紧评估     相对宽度 → 「能不能当结论用」
 * ```
 *
 * ## 为什么不用开源库
 *
 * 查过 `interval-arithmetic` / `math-intervals`：它们只做纯四则。
 * 而本项目的核心需求是**「把握程度」**（±52% → 只能当方向），
 * 那是领域语义。详见 `docs/对账与图谱选型.md`。
 *
 * @module dsh-math-calculator/features/graph/interval
 */

import { CalcError } from '../../core/errors.js'
import { fmtNumber, FMT } from '../../core/format.js'

/** 一个区间。 */
export interface Bracket {
  low: number
  high: number
}

/** 输入。 */
export interface IntervalInput {
  /** 表达式形态：`[20,50] * [2000,2500]`。 */
  expr?: string
  /** 左操作数。 */
  a?: Bracket | number | string
  /** 运算符。 */
  op?: string
  /** 右操作数。 */
  b?: Bracket | number | string
  /** 门槛值（给定时做门槛判定）。 */
  against?: number
  /** 单位（显示用）。 */
  unit?: string
}

/** 结果。 */
export interface IntervalOutcome {
  result: string
  value: unknown
  notice?: string
}

/**
 * 把输入转成区间。
 *
 * @param raw - 数字 / `[a,b]` / `"20-50"` / `{low,high}`
 * @param name - 参数名（错误提示用）
 * @returns 区间
 */
export function toBracket(raw: unknown, name: string): Bracket {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      throw new CalcError('invalid_argument', name + ' 不是有限数：' + String(raw), '给一个数字或区间。')
    }
    return { low: raw, high: raw }
  }

  if (typeof raw === 'string') {
    const text = raw.trim()
      .replace(/[－—–]/g, '-')
      .replace(/〜/g, '~')
      .replace(/[（(]/g, '[')
      .replace(/[）)]/g, ']')

    /** `[a, b]`。 */
    const bracket = /^\[\s*(-?[\d.]+(?:e[+-]?\d+)?)\s*[,，]\s*(-?[\d.]+(?:e[+-]?\d+)?)\s*\]$/i.exec(text)
    if (bracket !== null) return normalizeBracket(Number(bracket[1]), Number(bracket[2]))

    /** 中文分隔：「20 到 50」。 */
    const cn = /^(-?[\d.]+(?:e[+-]?\d+)?)\s*(?:到|至)\s*(-?[\d.]+(?:e[+-]?\d+)?)$/i.exec(text)
    if (cn !== null) return normalizeBracket(Number(cn[1]), Number(cn[2]))

    /** `20-50` / `20~50`。 */
    const sep = /^(-?[\d.]+(?:e[+-]?\d+)?)\s*[-~]\s*(-?[\d.]+(?:e[+-]?\d+)?)$/i.exec(text)
    if (sep !== null) return normalizeBracket(Number(sep[1]), Number(sep[2]))

    /** 单个数字。 */
    const one = Number(text)
    if (Number.isFinite(one)) return { low: one, high: one }
  }

  if (Array.isArray(raw) && raw.length === 2) {
    return normalizeBracket(Number(raw[0]), Number(raw[1]))
  }

  if (raw !== null && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const low = Number(obj['low'])
    const high = Number(obj['high'])
    if (Number.isFinite(low) && Number.isFinite(high)) return normalizeBracket(low, high)
  }

  throw new CalcError(
    'invalid_argument',
    '认不出 ' + name + ' 的区间形态：' + JSON.stringify(raw),
    '可用 `[20,50]`、`20-50`、`20 到 50`，或直接给数字。',
  )
}

/**
 * 保证 low ≤ high。
 *
 * 反序输入（`low:20, high:6`）会交换，但**必须说出来**（R51 D 类）：
 * 静默交换会让调用方以为参数按原样生效，后续把高低界弄反。
 */
function normalizeBracket(low: number, high: number, name?: string): Bracket {
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    throw new CalcError('invalid_argument', '区间的上下界必须是有限数', '')
  }
  if (low <= high) return { low, high }
  const label = name !== undefined && name !== '' ? '「' + name + '」' : ''
  throw new CalcError(
    'invalid_argument',
    '区间' + label + '的上下界写反了：low=' + low + ' > high=' + high,
    '区间要写成 [小, 大]。若你确实要 [20,6]，请改成 [6,20]——工具不会替你交换，因为那可能掩盖真实的参数错误。',
  )
}

/**
 * 区间四则运算。
 *
 * ## ★ 乘法必须试四个角
 *
 * ```
 *   [-2,3] × [-1,4]
 *   若只算 low×low = 2, high×high = 12  → 得 [2,12]   ✗ 错
 *   四个角：-2×-1=2, -2×4=-8, 3×-1=-3, 3×4=12
 *   → 真实结果 [-8, 12]                              ✓
 * ```
 *
 * @param a - 左区间
 * @param b - 右区间
 * @param op - 运算符
 * @returns 结果区间
 */
export function applyOp(a: Bracket, b: Bracket, op: string): Bracket {
  switch (op) {
    case '+':
      return { low: a.low + b.low, high: a.high + b.high }
    case '-':
      return { low: a.low - b.high, high: a.high - b.low }
    case '*': {
      /** 四个角全试。 */
      const corners = [a.low * b.low, a.low * b.high, a.high * b.low, a.high * b.high]
      return { low: Math.min(...corners), high: Math.max(...corners) }
    }
    case '/': {
      /**
       * 除法的前提：除数区间**不含 0**。
       *
       * 含 0 时结果无界 —— 那必须明确报错，而不是给一个错误的有界值。
       */
      if (b.low <= 0 && b.high >= 0) {
        throw new CalcError(
          'invalid_argument',
          '除数区间 ' + bracketText(b) + ' 含 0，结果无界',
          '分母可能取到 0 时区间除法没有有限结果。请把除数区间改成不含 0 的范围（如 [0.1, 5]）。',
        )
      }
      const corners = [a.low / b.low, a.low / b.high, a.high / b.low, a.high / b.high]
      return { low: Math.min(...corners), high: Math.max(...corners) }
    }
    default:
      throw new CalcError(
        'invalid_argument',
        '不支持的运算符「' + op + '」',
        '可用：+ - * /（也接受 × ÷）。',
      )
  }
}

/** 区间显示。 */
export function bracketText(b: Bracket): string {
  const fmt = (v: number): string => {
    const text = fmtNumber(v, FMT.general)
    return text
  }
  return b.low === b.high ? '[' + fmt(b.low) + ', ' + fmt(b.high) + ']' : '[' + fmt(b.low) + ', ' + fmt(b.high) + ']'
}

/**
 * 把握程度（按相对宽度分档）。
 *
 * ```
 *   ±<5%     很紧 —— 可以直接当结论
 *   ±5–15%   较紧 —— 能下判断，但要说明范围
 *   ±15–35%  较松 —— 只能说趋势
 *   ±>35%    很松 —— 只能当方向（大/小、够/不够）
 * ```
 *
 * @param relativeHalfWidth - 相对半宽（0.1 = ±10%）
 * @returns 档位与说明
 */
export function confidenceLevel(relativeHalfWidth: number): { level: string; note: string } {
  const percent = Math.abs(relativeHalfWidth) * 100
  if (percent < 5) return { level: '很紧', note: '可以直接当结论' }
  if (percent < 15) return { level: '较紧', note: '能下判断，但要说明范围' }
  if (percent < 35) return { level: '较松', note: '只能说趋势' }
  return { level: '很松', note: '只能当方向（大/小、够/不够）' }
}

/**
 * 区间运算主逻辑。
 *
 * @param input - 输入
 * @returns 结果
 */
export function intervalOperation(input: IntervalInput): IntervalOutcome {
  /** 解析表达式形态。 */
  let left: Bracket | null = null
  let right: Bracket | null = null
  let op = '*'

  if (typeof input.expr === 'string' && input.expr.trim() !== '') {
    const text = input.expr.trim()
    /**
     * ## 先试「整串就是一个区间」
     *
     * `{expr:"20-50"}` 是最自然的单区间写法。若不先试这个，
     * `splitExpr` 会把 `-` 当运算符，于是 `20-50` 被解析成
     * 「区间 20 减区间 50」= [-30, -30] —— **数值看着正常但完全错了**。
     *
     * 判据：整串里没有「两侧带空格的运算符」时，先当单区间解析。
     */
    const looksLikeOperation = /\s[+\-*/×÷~]\s/.test(text) || /\]\s*[+\-*/×÷~]\s*\[/.test(text)
    if (!looksLikeOperation) {
      try {
        left = toBracket(text, '区间')
        right = { low: 1, high: 1 }
      } catch {
        /** 单区间不成立，继续走运算解析。 */
      }
    }

    if (left === null) {
      const split = splitExpr(text)
      if (split === null) {
        throw new CalcError(
          'invalid_argument',
          '认不出区间表达式：' + text,
          '写法：「[20,50] * [2000,2500]」（推荐，无歧义）；' +
            '或「20-50 * 2000-2500」（运算符两侧留空格）；' +
            '单个区间直接给：「20-50」或「[20,50]」。',
        )
      }
      left = toBracket(split.a, '左操作数')
      op = split.op === '~' ? '-' : split.op
      right = toBracket(split.b, '右操作数')
    }
  } else {
    left = toBracket(input.a ?? input, 'a')
    op = typeof input.op === 'string' ? input.op.trim() : '*'
    right = input.b === undefined ? { low: 1, high: 1 } : toBracket(input.b, 'b')
  }

  if (left === null || right === null) {
    throw new CalcError('invalid_argument', '没能从输入里认出两个区间', '给 {interval:{expr:"[20,50] * [2000,2500]"}}。')
  }

  const result = applyOp(left, right, op)
  const mid = (result.low + result.high) / 2
  const halfWidth = (result.high - result.low) / 2
  const relativeHalfWidth = mid === 0 ? (halfWidth === 0 ? 0 : Infinity) : halfWidth / Math.abs(mid)
  const confidence = confidenceLevel(relativeHalfWidth)

  /** 正文。 */
  const lines: string[] = []
  lines.push('═══ 区间运算 ═══')
  lines.push('')
  lines.push('  ' + bracketText(left) + ' ' + op + ' ' + bracketText(right) +
    (typeof input.unit === 'string' && input.unit !== '' ? '  （单位：' + input.unit + '）' : ''))
  lines.push('  = ' + bracketText(result))
  lines.push('')
  lines.push('  中点 ' + fmtNumber(mid, FMT.general) +
    '　半宽 ' + fmtNumber(halfWidth, FMT.general) +
    '　相对宽度 ±' + (Number.isFinite(relativeHalfWidth) ? (relativeHalfWidth * 100).toFixed(2) : '∞') + '%')
  lines.push('')
  lines.push('  把握：' + confidence.level +
    (Number.isFinite(relativeHalfWidth) ? '（±' + (relativeHalfWidth * 100).toFixed(0) + '%）' : '') +
    ' —— ' + confidence.note)

  /** 门槛判定。 */
  let threshold: { against: number; verdict: string; confidence: string } | null = null
  if (typeof input.against === 'number') {
    const against = input.against
    const above = result.low >= against
    const below = result.high < against
    const straddles = !above && !below

    let verdict: string
    if (above) verdict = '整个区间都在门槛之上（' + fmtNumber(against, FMT.general) + '）'
    else if (below) verdict = '整个区间都在门槛之下（' + fmtNumber(against, FMT.general) + '）'
    else verdict = '区间**跨过**门槛（' + fmtNumber(against, FMT.general) + '）'

    /**
     * ## 跨过门槛时，把握程度取决于离门槛多远
     *
     * ```
     *   [20,50] vs 门槛 25  → 下限 20 低于 25，只差 20%  → 把握低
     *   [20,50] vs 门槛 21  → 下限 20 只差 5%           → 把握极低
     *   [20,50] vs 门槛 49  → 上限 50 只超过 2%         → 把握极低
     * ```
     */
    let confidenceText: string
    if (above) {
      const margin = (result.low - against) / Math.abs(against || 1)
      confidenceText = margin > 0.2 ? '高' : margin > 0.05 ? '中' : '低（贴近门槛）'
    } else if (below) {
      const margin = (against - result.high) / Math.abs(against || 1)
      confidenceText = margin > 0.2 ? '高' : margin > 0.05 ? '中' : '低（贴近门槛）'
    } else {
      confidenceText = '低（区间跨门槛，两种可能都成立）'
    }

    threshold = { against, verdict, confidence: confidenceText }
    lines.push('')
    lines.push('  门槛判定（对 ' + fmtNumber(against, FMT.general) + '）：')
    lines.push('    ' + verdict)
    lines.push('    把握：' + confidenceText)
  }

  return {
    result: lines.join('\n'),
    value: {
      left,
      op,
      right,
      result,
      mid,
      halfWidth,
      relativeHalfWidth: Number.isFinite(relativeHalfWidth) ? relativeHalfWidth : null,
      confidence: confidence.level,
      threshold,
    },
    notice: confidence.level === '很松'
      ? '区间很松（±' + (relativeHalfWidth * 100).toFixed(0) + '%）—— 这个结果只能当方向用，不能当具体数值。'
      : undefined,
  }
}

/**
 * 切分「区间 运算符 区间」。
 *
 * @param text - 表达式
 * @returns 三段；认不出返回 null
 */
function splitExpr(text: string): { a: string; op: string; b: string } | null {
  const OPERATORS = new Set(['+', '-', '*', '/', '×', '÷'])
  /** 方括号感知：跳过括号内部。 */
  let depth = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '[' || ch === '(') depth += 1
    else if (ch === ']' || ch === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0 && OPERATORS.has(ch)) {
      /** 跳过一元负号。 */
      const before = text.slice(0, i).trim()
      if (ch === '-' && (before === '' || OPERATORS.has(before[before.length - 1] ?? ''))) continue
      /**
       * 跳过「区间分隔符」的连字符：`20-50 * 2000-2500` 里第一个 `-`
       * 两侧都无空白且两侧都是数字 —— 那是区间分隔符。
       */
      if (ch === '-') {
        const left = text.slice(0, i)
        const right = text.slice(i + 1)
        if (!/\s$/.test(left) && !/^\s/.test(right) && /\d$/.test(left.trim()) && /^\d/.test(right.trim())) continue
      }
      const a = text.slice(0, i).trim()
      const b = text.slice(i + 1).trim()
      if (a !== '' && b !== '') {
        return { a, op: ch === '×' ? '*' : ch === '÷' ? '/' : ch, b }
      }
    }
  }
  return null
}
