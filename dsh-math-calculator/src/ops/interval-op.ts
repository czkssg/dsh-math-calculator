/**
 * operation="interval" 的实现：区间运算。
 *
 * ## 它解决什么
 *
 * 反馈包 15 号的核心发现：**AI 在推演时全程用区间思考**——
 *
 * ```
 *   「大约一万吨」「20–40%」「21–25 亿」「2000–2500」「4.4–6 万亿」
 * ```
 *
 * **但工具只支持点值**，逼它把这些区间压成单个数再算。
 * 而那一步压缩就是失真的源头：`[20,50]` 被写成 `35`，
 * 后面所有结论都建立在一个「看起来精确」的假数上。
 *
 * 反馈包原话：
 * > 点值运算会把区间硬压成单值，**这正是 AI 推演失真的源头之一**。
 *
 * ## 设计要点
 *
 * 1. **基本四则**用端点运算（区间算术的标准做法）
 * 2. **乘法要验四个端点组合**（负区间会让结果反向，不能只取两端）
 * 3. **除法要检查除数是否跨零**（跨零意味着结果无界，必须明说）
 * 4. **结果是区间就明说宽度**——宽度本身是信息
 *
 * ## 不做什么
 *
 * 不做区间约束求解（那是另一个量级的事），也不猜分布——
 * 只知道上下界时，均匀假设是编的。
 *
 * @module dsh-math-calculator/ops/interval-op
 */

import { toJsonValue } from '../format.js'
import { CalcError, type MathArgs, type Outcome } from './shared.js'

/** 一个区间：`[low, high]`。 */
interface Bracket {
  low: number
  high: number
}

/** 运算结果。 */
interface IntervalResult {
  /** 下界。 */
  low: number
  /** 上界。 */
  high: number
  /** 中点。 */
  mid: number
  /** 半宽。 */
  halfWidth: number
  /** 相对半宽（对中点），用于判断「这个结果有多不确定」。 */
  relativeHalfWidth: number
  /** 是否跨界（跨零或跨无穷）。 */
  crossesZero: boolean
}

/**
 * 把一个区间表达式切成「左操作数 / 运算符 / 右操作数」。
 *
 * ## 为什么不能简单正则切
 *
 * `-` 在区间里有两个身份：**分隔符**（`20-50`）与**减号**（`20 - 5`）。
 * 用「从第一个运算符处切」的规则，`20-50 * 2000-2500` 会从第一个 `-`
 * 切开，右操作数变成 `"50 * 2000-2500"`，彻底解析错。
 *
 * ## 三级规则
 *
 * ```
 *   ① 有方括号：括号内整体算一个操作数，跳过它去找括号外的运算符
 *   ② 无方括号：只认「两侧都有空白」的运算符（`20-50` 的空心不算）
 *   ③ 都不行：返回 null，交给调用方报错
 * ```
 *
 * 宁可报错，不可猜错 —— 切错一个位置，后面的数会全错而没人发现。
 *
 * @param text - 原始表达式
 * @returns 切好的三段，或 null
 */
function splitExpr(text: string): { a: string; op: string; b: string } | null {
  const OP = new Set(['+', '-', '*', '/', '×', '÷', '~'])

  /** ① 括号感知：跳过 [..] 与 (..) 内部。 */
  let depth = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '[' || ch === '(') depth += 1
    else if (ch === ']' || ch === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0 && OP.has(ch)) {
      /** 跳过一元负号：出现在开头、或紧跟运算符时。 */
      const prev = text.slice(0, i).trim()
      if (ch === '-' && (prev === '' || OP.has(prev[prev.length - 1] ?? ''))) continue
      /**
       * ## 跳过「区间分隔符」的连字符
       *
       * `20-50 * 2000-2500` 里第一个 `-` 两侧都无空白 —— 那是区间分隔符。
       * 而 `20 - 50` 两侧有空白 —— 那才是减号。
       *
       * 判据：`-` 两侧**都没有空白**时要求它前后都是数字（区间形态），
       * 此时跳过，继续往后找真正的运算符。
       */
      if (ch === '-') {
        const before = text.slice(0, i)
        const after = text.slice(i + 1)
        const noSpaceLeft = !/\s$/.test(before)
        const noSpaceRight = !/^\s/.test(after)
        const digitLeft = /\d$/.test(before.trim())
        const digitRight = /^\d/.test(after.trim())
        if (noSpaceLeft && noSpaceRight && digitLeft && digitRight) continue
      }
      const a = text.slice(0, i).trim()
      const b = text.slice(i + 1).trim()
      if (a !== '' && b !== '') {
        return { a, op: ch === '×' ? '*' : ch === '÷' ? '/' : ch, b }
      }
    }
  }

  /** ② 无括号：只认「两侧有空白」的运算符。 */
  const spaced = text.match(/^(.*?)\s+([+\-*/×÷~])\s+(.*)$/)
  if (spaced) {
    const a = spaced[1].trim()
    const op = spaced[2]
    const b = spaced[3].trim()
    if (a !== '' && b !== '') return { a, op: op === '×' ? '*' : op === '÷' ? '/' : op, b }
  }

  return null
}

/**
 * 把「21*10^8」这类带数量级的写法折成数字。
 *
 * ## 为什么不用 `eval` 或 `mathjs`
 *
 * 这个函数只处理**一个极窄的形态**：`数字 * 10^整数`。
 * 引入完整求值器会带来注入面（区间输入的来源是用户文本），
 * 而这里根本不需要通用能力。
 *
 * @param text - 形如 `21`、`21*10^8`、`2.1e9`
 * @returns 数值（解析不了就原样返回，交给 Number 判 NaN）
 */
function evalSmallPower(text: string): number {
  const m = text.match(/^(-?[\d.]+(?:e[+-]?\d+)?)\s*\*\s*10\s*\^\s*(-?\d+)$/i)
  if (m) {
    const base = Number(m[1])
    const exp = Number(m[2])
    if (Number.isFinite(base) && Number.isFinite(exp)) return base * Math.pow(10, exp)
  }
  return Number(text)
}

/**
 * 把输入归一成区间。
 *
 * 接受的形态：
 * ```
 *   [20, 50]        数组两元
 *   "20-50"         连字符
 *   "20~50"         波浪
 *   "20 到 50"      中文
 *   35              单值 → [35, 35]
 *   {low:20,high:50}
 * ```
 *
 * @param raw - 原始输入
 * @param name - 参数名（报错时点名）
 * @returns 区间
 */
function toBracket(raw: unknown, name: string): Bracket {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      throw new CalcError('invalid_argument', name + ' 不是有限数：' + String(raw), '给一个数字或区间。')
    }
    return { low: raw, high: raw }
  }

  if (Array.isArray(raw)) {
    if (raw.length !== 2) {
      throw new CalcError(
        'invalid_argument',
        name + ' 是数组时必须正好两个元素（下界、上界），收到 ' + raw.length + ' 个',
        '例如 [20, 50]。',
      )
    }
    const low = Number(raw[0])
    const high = Number(raw[1])
    if (!Number.isFinite(low) || !Number.isFinite(high)) {
      throw new CalcError('invalid_argument', name + ' 的上下界必须是有限数', '例如 [20, 50]。')
    }
    return low <= high ? { low, high } : { low: high, high: low }
  }

  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const low = Number(obj.low)
    const high = Number(obj.high)
    if (Number.isFinite(low) && Number.isFinite(high)) {
      return low <= high ? { low, high } : { low: high, high: low }
    }
  }

  if (typeof raw === 'string') {
    const text = raw.trim().replace(/[－—–]/g, '-').replace(/〜/g, '~')
    /**
     * `[a, b]` 方括号形态。
     *
     * 这是**最自然**的写法（数学上区间就这么写），但第一版漏了它 ——
     * 于是 `"[21,25]*10^8 * [2000,2500]"` 报「认不出区间形态」，
     * 而那正是反馈包里 AI 最常用的表达。
     */
    const bracket = text.match(/^\[\s*(-?[\d.]+(?:e[+-]?\d+)?)\s*[,，]\s*(-?[\d.]+(?:e[+-]?\d+)?)\s*\]$/i)
    if (bracket) return { low: Number(bracket[1]), high: Number(bracket[2]) }
    /** 中文分隔：「20 到 50」「20至50」。 */
    const cn = text.match(/^(-?[\d.]+(?:e[+-]?\d+)?)\s*(?:到|至)\s*(-?[\d.]+(?:e[+-]?\d+)?)$/i)
    if (cn) return { low: Number(cn[1]), high: Number(cn[2]) }
    const sep = text.match(/^(-?[\d.]+(?:e[+-]?\d+)?)\s*[-~]\s*(-?[\d.]+(?:e[+-]?\d+)?)$/i)
    if (sep) return { low: Number(sep[1]), high: Number(sep[2]) }
    /** 带数量级后缀：「21*10^8」「2.1e9」。 */
    const sci = text.match(/^(-?[\d.]+(?:e[+-]?\d+)?(?:\s*\*\s*10\s*\^\s*-?\d+)?)$/i)
    if (sci) {
      const value = Number(evalSmallPower(sci[1]))
      if (Number.isFinite(value)) return { low: value, high: value }
    }
    const one = Number(text)
    if (Number.isFinite(one)) return { low: one, high: one }
  }

  throw new CalcError(
    'invalid_argument',
    '认不出 ' + name + ' 的区间形态：' + JSON.stringify(raw),
    '可用：[20, 50] / "20-50" / "20~50" / "20 到 50" / {low:20,high:50} / 单个数字。',
  )
}

/**
 * 由上下界算出完整结果。
 *
 * @param low - 下界
 * @param high - 上界
 * @returns 区间结果
 */
function makeResult(low: number, high: number): IntervalResult {
  const lo = Math.min(low, high)
  const hi = Math.max(low, high)
  const mid = (lo + hi) / 2
  const halfWidth = (hi - lo) / 2
  const relativeHalfWidth = mid === 0 ? (halfWidth === 0 ? 0 : Number.POSITIVE_INFINITY) : Math.abs(halfWidth / mid)
  return {
    low: lo,
    high: hi,
    mid,
    halfWidth,
    relativeHalfWidth,
    crossesZero: lo <= 0 && hi >= 0,
  }
}

/**
 * 四则运算（区间算术）。
 *
 * @param left - 左区间
 * @param right - 右区间
 * @param op - 运算符：`+ - * /`
 * @returns 结果区间
 */
function applyOp(left: Bracket, right: Bracket, op: string): IntervalResult {
  switch (op) {
    case '+':
      return makeResult(left.low + right.low, left.high + right.high)
    case '-':
      return makeResult(left.low - right.high, left.high - right.low)
    case '*': {
      /**
       * 乘法必须验**四个端点组合**。
       *
       * 只取 `left.low*right.low` 与 `left.high*right.high` 是错的：
       * 一旦有负区间，极值会出现在交叉项上。
       *
       * ```
       *   [-2,3] * [-4,1]
       *   只取两端：(−2)(−4)=8 与 3×1=3  →  [3,8]   ✗ 漏了 −3 与 −12
       *   四点全验：8, −2, −12, 3          →  [−12,8] ✓
       * ```
       */
      const candidates = [
        left.low * right.low,
        left.low * right.high,
        left.high * right.low,
        left.high * right.high,
      ]
      return makeResult(Math.min(...candidates), Math.max(...candidates))
    }
    case '/': {
      /**
       * 除数跨零 → 结果无界。
       *
       * 这不是数值问题，是**语义问题**：`1 / [-1, 1]` 的真值是
       * `(-∞,-1] ∪ [1,∞)`，两个分离的区间。报一个「下界 -∞ 上界 ∞」
       * 虽然保守，但会误导人以为中间也有人。
       *
       * 所以这里直接报错并说清原因。
       */
      if (right.low <= 0 && right.high >= 0) {
        throw new CalcError(
          'invalid_argument',
          '除数区间 [' + show(right.low) + ', ' + show(right.high) + '] 跨零，结果无界',
          '除数跨零时商不是单个区间（1/[-1,1] 实际是 (-∞,-1] 与 [1,∞) 两段）。' +
            '请缩小除数区间，或改用正向的乘方/反比表达。',
        )
      }
      const candidates = [
        left.low / right.low,
        left.low / right.high,
        left.high / right.low,
        left.high / right.high,
      ]
      return makeResult(Math.min(...candidates), Math.max(...candidates))
    }
    default:
      throw new CalcError(
        'invalid_argument',
        '不认识的区间运算符 "' + op + '"',
        '支持：+ − × ÷（也可写 + - * /）。',
      )
  }
}

/**
 * 数字显示。
 *
 * @param value - 数值
 * @returns 显示串
 */
function show(value: number): string {
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞'
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e7 || abs < 1e-3) return value.toExponential(3)
  return String(Number(value.toPrecision(6)))
}

/**
 * 把区间写成 `[a, b]`。
 *
 * @param bracket - 区间
 * @returns 显示串
 */
function bracketText(bracket: Bracket | IntervalResult): string {
  return '[' + show(bracket.low) + ', ' + show(bracket.high) + ']'
}

/**
 * `interval`：区间运算。
 *
 * @param args - 工具参数
 * @returns 结果文本与结构化值
 */
export function opInterval(args: MathArgs): Outcome {
  const raw = args as unknown as Record<string, unknown>
  const payload = raw.interval

  let left: Bracket
  let right: Bracket
  let op: string
  let target: number | undefined
  let unit: string | undefined

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>
    /** `expr` 形态：`"[20,50] * [2000,2500]"` —— 最直观。 */
    if (typeof obj.expr === 'string') {
      const text = obj.expr.trim()
      /**
       * ## 切分运算符时不能把「区间分隔符」当成运算符
       *
       * `20-50 * 2000-2500` 里的第一个 `-` 是**区间分隔符**，不是减号。
       * 第一版用一条「从第一个运算符处切」的正则（字符类里含星号与斜杠，
       * 所以这段注释不能原样写出那个正则 —— 它会提前闭合块注释），
       * 于是从第一个 `-` 就切开，右操作数变成 `"50 * 2000-2500"`，解析失败。
       *
       * ## 规则（按优先级）
       *
       * ```
       *   ① 有方括号 → 括号内的内容整体是一个操作数，括号外找运算符
       *   ② 没有方括号 → 只在「两侧都有空白」的位置认运算符
       *                   （`20-50` 这种无空格的连字符不认作减号）
       *   ③ 仍找不到 → 报错并给写法示例
       * ```
       *
       * 这是「宁可报错，不可猜错」：猜错一个切分位置，后面的数会全错。
       */
      const split = splitExpr(text)
      if (!split) {
        throw new CalcError(
          'invalid_argument',
          '认不出区间表达式：' + text,
          '写法：「[20,50] * [2000,2500]」（推荐，无歧义）；' +
            '或「20-50 * 2000-2500」（运算符两侧留空格）。' +
            '也可以用结构化形态 {interval:{a:[20,50], op:"*", b:[2000,2500]}}。',
        )
      }
      left = toBracket(split.a, '左操作数')
      op = split.op === '~' ? '-' : split.op
      right = toBracket(split.b, '右操作数')
    } else {
      left = toBracket(obj.a ?? obj.left, 'a')
      op = typeof obj.op === 'string' ? obj.op.trim() : '*'
      right = toBracket(obj.b ?? obj.right, 'b')
    }
    if (typeof obj.against === 'number') target = obj.against
    if (typeof obj.unit === 'string') unit = obj.unit
  } else {
    left = toBracket(raw.a ?? raw.left, 'a')
    op = typeof raw.op === 'string' ? raw.op.trim() : '*'
    right = toBracket(raw.b ?? raw.right, 'b')
    if (typeof raw.against === 'number') target = raw.against
    if (typeof raw.unit === 'string') unit = raw.unit
  }

  const result = applyOp(left, right, op)

  const lines: string[] = []
  lines.push('═══ 区间运算 ═══')
  lines.push('')
  lines.push('  ' + bracketText(left) + ' ' + op + ' ' + bracketText(right) +
    (unit ? '  （单位：' + unit + '）' : ''))
  lines.push('  = ' + bracketText(result))
  lines.push('')
  lines.push('  中点 ' + show(result.mid) +
    '　半宽 ' + show(result.halfWidth) +
    '　相对宽度 ±' + (result.relativeHalfWidth * 100).toFixed(2) + '%')

  /**
   * 不确定度分档：这是区间相对点值**唯一多出来的信息**，必须说出来。
   *
   * 分档依据是「相对半宽」——
   * ±5% 以内还能写进设定；±50% 只能当量级；更宽的只能当方向。
   */
  const rw = result.relativeHalfWidth
  if (rw > 0) {
    lines.push('')
    if (rw <= 0.05) {
      lines.push('  把握：较紧（±' + (rw * 100).toFixed(1) + '%）——可以直接写进设定')
    } else if (rw <= 0.2) {
      lines.push('  把握：中等（±' + (rw * 100).toFixed(0) + '%）——写设定时建议给个区间而不是单值')
    } else if (rw <= 0.5) {
      lines.push('  把握：较松（±' + (rw * 100).toFixed(0) + '%）——只适合当量级，别当精确数')
    } else {
      lines.push('  把握：很松（±' + (rw * 100).toFixed(0) + '%）——只能当方向（大/小、够/不够）')
    }
  }
  if (result.crossesZero) {
    lines.push('  ⚠ 结果跨零：符号都不确定，别写成「一定是正/负」')
  }

  /** 阈值判定：`against` 给了就判区间与门槛的关系。 */
  if (target !== undefined) {
    lines.push('')
    lines.push('  对门槛 ' + show(target) + ' 的判定：')
    if (result.high < target) {
      lines.push('   · 整个区间都在门槛**下方**（上限 ' + show(result.high) + ' < ' + show(target) + '）')
    } else if (result.low > target) {
      lines.push('   · 整个区间都在门槛**上方**（下限 ' + show(result.low) + ' > ' + show(target) + '）')
    } else {
      lines.push('   · 区间**跨过**门槛 —— 结论取决于取到区间哪一端')
      lines.push('   · 需要更窄的输入才能定论；现在只能说「可能成立，可能不成立」')
    }
  }

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      input: { a: left, b: right, op },
      low: result.low,
      high: result.high,
      mid: result.mid,
      halfWidth: result.halfWidth,
      relativeHalfWidth: result.relativeHalfWidth,
      crossesZero: result.crossesZero,
      unit: unit ?? null,
      against: target ?? null,
      /** 与门槛的关系：below / above / crosses / null。 */
      verdict:
        target === undefined
          ? null
          : result.high < target
            ? 'below'
            : result.low > target
              ? 'above'
              : 'crosses',
    }),
  }
}
