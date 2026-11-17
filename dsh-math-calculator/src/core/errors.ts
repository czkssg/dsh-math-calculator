/**
 * 统一错误类型。
 *
 * ## 为什么错误类型要单独一个文件
 *
 * 老代码里 `CalcError` 定义在 `ops/shared.ts`（1,340 行的杂项文件）里，
 * 而错误码的含义散落在各处。新架构把它独立出来，因为它是**跨所有功能域的契约**：
 *
 * ```
 *   调用方靠 error.type 做程序化判断
 *   靠 error.hint 给人看下一步怎么做
 * ```
 *
 * ## 错误码清单（这些都是实测出来的，不是设计出来的）
 *
 * | type | 含义 | 典型触发 |
 * |---|---|---|
 * | `invalid_argument` | 参数不合法 | `world{planetMass:-1}` |
 * | `unknown_argument` | 参数名认不出 | `evaluate{expr:'1+1'}`（应为 expression） |
 * | `missing_params` | 缺必填参数 | `derivation{backSolve}` 无 anchor |
 * | `unknown_symbol` | 表达式里有未定义符号 | `m*2` 而 m 未定义 |
 * | `unit_mismatch` | 两侧量纲不符 | `10 hp + 3 kg` |
 * | `unknown_unit` | 不认识这个单位 | `kg/m³`（上标） |
 * | `unknown_formula` | 没有这条公式 | `formula{formula:'no_such'}` |
 * | `unknown_subcommand` | 子命令不存在 | `derivation{derivation:'xxx'}` |
 * | `singular` | 矩阵奇异/方程组无唯一解 | 退化方程组 |
 * | `non_finite` | 结果非有限 | `1/0` |
 * | `syntax` | 表达式语法错 | `2++` |
 * | `internal` | 工具自身 bug | 极少数 |
 *
 * **`internal` 是最后一个该用的类型**：用户输入错却报 internal，
 * 会把人引向错误的排查方向（这是反馈包 T7-N8 报过的）。
  *
 * @module dsh-math-calculator/core/errors
 */

/** 错误类型。 */
export type ErrorType =
  | 'invalid_argument'
  | 'unknown_argument'
  | 'missing_params'
  | 'unknown_symbol'
  | 'unit_mismatch'
  | 'unknown_unit'
  | 'unknown_formula'
  | 'unknown_subcommand'
  | 'singular'
  /**
   * ## `no_solution` 与 `singular` 必须分开
   *
   * 这是反馈包 A5 的核心：
   *
   * ```
   *   x = x + 1        无解                → no_solution
   *   x + y = 5        无穷多解（欠定）      → singular
   *   [[1,1],[2,2]]·x  可能无解也可能无穷多  → 看增广矩阵秩
   * ```
   *
   * 混为一谈会让调用方无法区分「方程本身矛盾」与「需要更多约束」。
   */
  | 'no_solution'
  | 'non_finite'
  | 'syntax'
  | 'internal'

/**
 * 一次可诊断的失败。
 *
 * ## `hint` 的要求
 *
 * 它必须回答「**下一步怎么做**」，不是复述 `message`。
 *
 * ```
 *   ✗ "参数不合法"                        ← 等于没说
 *   ✓ "planetMass 要大于 0；例如 1.5 表示 1.5 倍地球质量"
 * ```
 */
export class CalcError extends Error {
  /** 机器可读的错误类型。 */
  readonly type: ErrorType
  /** 给人看的下一步怎么做（可选）。 */
  readonly hint?: string

  /**
   * @param type - 错误类型
   * @param message - 一句话说清错在哪
   * @param hint - 下一步怎么做
   */
  constructor(type: ErrorType, message: string, hint?: string) {
    super(message)
    this.name = 'CalcError'
    this.type = type
    this.hint = hint
  }
}

/**
 * 把任意异常收敛成 `CalcError`。
 *
 * ## 为什么要收敛
 *
 * mathjs 与各开源库抛的是自己的错误类型（`TypeError`、`Error`、库自定义的）。
 * 若直接透传，调用方拿不到 `error.type`，只能靠猜消息文本。
 *
 * 这里按**消息特征**映射到我们的类型 —— 是启发式的，所以只做「能确定的映射」，
 * 拿不准一律归 `internal` 但要保留原文（不能吞掉信息）。
 *
 * @param error - 原始异常
 * @param source - 原始表达式（用于把 mathjs 的 `char 10` 变成可定位提示）
 * @returns 统一的错误
 */
export function normalizeError(error: unknown, source?: string): CalcError {
  if (error instanceof CalcError) return error

  const raw = error instanceof Error ? error.message : String(error)
  /**
   * 超长表达式不能把整段塞进错误消息（R51）：500 层括号 / 5000 项加法会把
   * 几 KB 原文灌进 message，既没法读也占满上下文。只留头尾。
   */
  const shortSource = source !== undefined && source.length > 60 ? source.slice(0, 40) + '…（共 ' + source.length + ' 字符）' : source
  const where = shortSource !== undefined && shortSource !== '' ? `（表达式：${shortSource}）` : ''

  /**
   * 栈溢出 = 表达式太深/太长，不是工具 bug（R51）。
   * 报 internal 会让调用方去查工具实现，实际该做的是缩短表达式。
   */
  if (/Maximum call stack size exceeded|out of memory/i.test(raw)) {
    return new CalcError(
      'invalid_argument',
      '表达式太复杂，解析时栈溢出' + where,
      '嵌套层数或项数超出可解析范围。把它拆成多步（用 variables 传中间结果），或改用 expressions 批量。',
    )
  }

  /** mathjs 的未定义符号。 */
  const undefinedSymbol = /Undefined symbol\s+(\S+)/i.exec(raw)
  if (undefinedSymbol) {
    const name = undefinedSymbol[1]
    return new CalcError(
      'unknown_symbol',
      `表达式里的「${name}」没有定义${where}`,
      '先给它赋值，或用 variables 参数传入：{"' + name + '": 值}。' +
        '若这是工作区变量，要确认 useWorkspaceVariables 开关已打开。',
    )
  }

  /**
   * ## 未定义**函数**与未定义**符号**要分开
   *
   * mathjs 对两者报不同的措辞：
   *
   * ```
   *   xy*2       → Undefined symbol xy
   *   solve(...) → Undefined function solve
   * ```
   *
   * 若把后者归到 `internal`，用户会以为是工具 bug 而不是「没这个函数」。
   *
   * @see 2026-11-13 实测：新实现调 `solve()` 时撞上这条
   */
  const undefinedFunction = /Undefined function\s+(\S+)/i.exec(raw)
  if (undefinedFunction) {
    const name = undefinedFunction[1]
    return new CalcError(
      'unknown_symbol',
      `没有名为「${name}」的函数${where}`,
      '检查函数名拼写。本插件不提供求解器函数 —— 解方程请用 operation:"solve"。',
    )
  }

  /** mathjs 的单位相关错误。 */
  if (/Units do not match|Cannot convert|is not a valid unit|Unknown unit/i.test(raw)) {
    return new CalcError(
      'unit_mismatch',
      `单位不对：${raw}${where}`,
      '两侧要同量纲才能相加减。换算请用 units 操作，或写成 `值 单位 to 目标单位`。',
    )
  }

  /**
   * ## 语法错有两种形态（实测才知道）
   *
   * ```
   *   "2 @@@ 3"  → Syntax error in part "@@@" (char 1)
   *   "2++"      → Unexpected end of expression (char 4)     ← 这一种第一版漏了
   * ```
   *
   * 两种都要归 `syntax`，否则调用方会看到一个 `internal`（误导排查方向）。
   */
  const syntaxEnd = /Unexpected end of expression \(char (\d+)\)/i.exec(raw)
  if (syntaxEnd) {
    return new CalcError(
      'syntax',
      `表达式在此处未写完（第 ${syntaxEnd[1]} 个字符处）${where}`,
      '运算符后面缺了操作数，或括号没闭合。例如 `2++` 应为 `2+3`。',
    )
  }

  /** 语法错：把 mathjs 的 char N 转成可定位的提示。 */
  const syntax = /Syntax error in part "([^"]*)" \(char (\d+)\)/i.exec(raw)
  if (syntax) {
    return new CalcError(
      'syntax',
      `表达式语法错，卡在「${syntax[1]}」第 ${syntax[2]} 个字符处${where}`,
      '检查括号是否配对、运算符是否连续（如 `2++3`）、函数名是否拼错。',
    )
  }

  /** 非有限结果。 */
  if (/Infinity|NaN|is not finite/i.test(raw)) {
    return new CalcError(
      'non_finite',
      `结果不是有限数${where}`,
      '常见原因：除以 0、对数里出现 0 或负数、数值溢出。检查分母与函数定义域。',
    )
  }

  /** 分母为零。 */
  if (/Division by zero|divide by zero/i.test(raw)) {
    return new CalcError('non_finite', `除以零${where}`, '检查分母是否可能取到 0。')
  }

  /** 其余语法类提示（mathjs 的 Value expected / Unexpected / 括号不配对）→ syntax。 */
  if (/value expected|unexpected|parenthesis|missing|end of expression|invalid character/i.test(raw)) {
    return new CalcError('syntax', `表达式语法错${where}（原文：${raw}）`, '检查括号配对、运算符是否连续、函数名是否拼错。')
  }

  /** 其余归 internal，但**保留原文** —— 吞掉信息会让排查更难。 */
  return new CalcError(
    'internal',
    `工具内部错误：${raw}${where}`,
    '这是工具自身的问题，不是你的输入错。把这条消息与调用参数一起报告。',
  )
}
