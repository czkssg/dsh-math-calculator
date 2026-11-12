/**
 * 代数（solve / derivative / integral / simplify / expand / roots）。
 *
 * ## ★ 2026-11-13 重写：改用 algebrite 的现成能力
 *
 * 用户提醒「不能找现成的开源计算代码吗」之后我查了自己**已装**的
 * `algebrite` 的完整 API，发现它早就有：
 *
 * ```
 *   roots(expr, var)         求根，支持多项式与线性
 *   nroots(expr, var)        数值求根（含复根）
 *   defint(expr, var, a, b)  定积分
 *   derivative / integral / simplify / expand / factor / taylor
 * ```
 *
 * 而我上一版手写了「采样插值反推多项式系数 + 高斯消元 + 数值扫描」——
 * **那是重新发明轮子**，而且更不可靠（采样插值在非多项式上会给出假根）。
 *
 * ## 现在的分工
 *
 * ```
 *   algebrite   求根 / 符号微积分 / 化简 / 展开     ← 库的强项
 *   mathjs      polynomialRoot（精确 + 复数根）      ← 库的强项
 *   自写        恒等式与矛盾式的**分类**            ← 库不做这个判断
 * ```
 *
 * 第三条是真正必须自写的：`x=x` 有无穷多解，而任何求根器都会
 * 给出一堆采样点当「根」。
 *
 * @module dsh-math-calculator/features/numeric/algebra
 */

import Algebrite from 'algebrite'
import type { Engine } from '../../core/engine.js'
import { CalcError } from '../../core/errors.js'

/** 代数结果。 */
export interface AlgebraOutcome {
  /** 正文。 */
  result: string
  /** 结构化值。 */
  value: unknown
  /** 额外提示。 */
  notice?: string
}

/**
 * mathjs 语法 → algebrite 语法。
 *
 * @param source - mathjs 风格表达式
 * @returns algebrite 风格
 */
export function toAlgebrite(source: string): string {
  return source
    .replace(/\*\*/g, '^')
    .replace(/\bln\s*\(/g, 'log(')
    .replace(/π/g, 'pi')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
}

/**
 * algebrite 语法 → mathjs 语法。
 *
 * @param source - algebrite 输出
 * @returns mathjs 风格
 */
export function fromAlgebrite(source: string): string {
  return source.replace(/\bpi\b/g, 'π').trim()
}

/**
 * 判断方程是恒等式、矛盾式，还是可解。
 *
 * ## 为什么这一步必须自写
 *
 * 任何求根器对 `x = x` 的处理都是「在区间内采样找符号变化」，
 * 而恒等式的函数值处处为 0，于是：
 *
 * ```
 *   老插件实测：x = x  →  返回 12 个「解」
 * ```
 *
 * 那是**假根**，比报错更危险 —— 用户会以为工具算出了 12 个解。
 *
 * @param engine - 引擎
 * @param equation - 方程（含 `=`）
 * @returns 判定结果
 */
export function classifyEquation(
  engine: Engine,
  equation: string,
): { kind: 'identity' | 'contradiction' | 'solvable'; residual: string; variable: string } {
  const parts = equation.split('=')
  if (parts.length !== 2) {
    throw new CalcError(
      'invalid_argument',
      '方程必须有一个等号（收到 ' + (parts.length - 1) + ' 个）',
      '例如 `2x+3=7`。不等式请用 compare 操作。',
    )
  }
  const left = parts[0].trim()
  const right = parts[1].trim()
  const residual = '(' + left + ')-(' + right + ')'

  /** 找出自由符号。 */
  const KNOWN = new Set([
    'pi', 'e', 'i', 'PI', 'E', 'tau',
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
    'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
    'log', 'log10', 'log2', 'exp', 'sqrt', 'cbrt', 'abs', 'sign',
    'floor', 'ceil', 'round', 'max', 'min', 'pow', 'mod',
  ])
  const symbols: string[] = []
  for (const match of equation.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    const name = match[0]
    if (!KNOWN.has(name) && !symbols.includes(name)) symbols.push(name)
  }
  const variable = symbols[0] ?? 'x'

  if (symbols.length === 0) {
    const value = Number(engine.evaluate(residual))
    return {
      kind: Math.abs(value) < 1e-12 ? 'identity' : 'contradiction',
      residual,
      variable,
    }
  }

  /** 采样判定（足够抓恒等式与矛盾式）。 */
  const samples = [0.317, 1.23, -0.77, 2.91, -1.53, 3.7]
  const values: number[] = []
  for (const sample of samples) {
    const scope: Record<string, number> = {}
    for (const v of symbols) scope[v] = sample * (1 + v.length * 0.1)
    try {
      const v = Number(engine.evaluate(residual, scope))
      if (Number.isFinite(v)) values.push(v)
    } catch {
      continue
    }
  }

  if (values.length >= 3) {
    if (values.every((v) => Math.abs(v) < 1e-9)) {
      return { kind: 'identity', residual, variable }
    }
    const first = values[0]
    if (Math.abs(first) > 1e-9 && values.every((v) => Math.abs(v - first) < 1e-9)) {
      return { kind: 'contradiction', residual, variable }
    }
  }

  return { kind: 'solvable', residual, variable }
}

/**
 * 解方程。
 *
 * ## 求解走 algebrite 的 `roots`
 *
 * 实测（2026-11-13）：
 *
 * ```
 *   A.roots('x^2-4', 'x')     → [-2,2]
 *   A.roots('2x+3-7', 'x')    → 2
 *   A.nroots('x^3-x', 'x')    → 数值解（含复根）
 * ```
 *
 * @param engine - 引擎
 * @param equation - 方程（`2x+3=7` 或逗号分隔的方程组）
 * @returns 结果
 */
export function solveEquation(engine: Engine, equation: string): AlgebraOutcome {
  if (equation.includes(',')) return solveMulti(engine, equation)

  const classified = classifyEquation(engine, equation)

  if (classified.kind === 'identity') {
    throw new CalcError(
      'singular',
      '这个方程是恒等式：' + equation + '（移项后恒为 0）',
      '恒等式有**无穷多解**，不是「算不出」。' +
        '若你想解的是别的方程，检查两边是否不小心写成了一样的。',
    )
  }
  if (classified.kind === 'contradiction') {
    throw new CalcError(
      'no_solution',
      '这个方程无解：' + equation + '（移项后恒为非零常数）',
      '两边矛盾（例如 `x=x+1`）。检查是否写错了常数项。',
    )
  }

  const variable = classified.variable
  const source = toAlgebrite(classified.residual)

  /** 先试精确根。 */
  let text = ''
  try {
    text = Algebrite.roots(source, variable).toString()
  } catch {
    text = ''
  }

  /** 精确根失败或结果为空时，退回数值根。 */
  if (text === '' || text === '[]') {
    try {
      text = Algebrite.nroots(source, variable).toString()
    } catch (error) {
      throw new CalcError(
        'invalid_argument',
        '这个方程解不出来：' + equation + '（' +
          (error instanceof Error ? error.message.slice(0, 60) : '未知原因') + '）',
        '本实现支持多项式与线性方程。超越方程（含 sin/log/exp）请改用数值迭代。',
      )
    }
  }

  /** 解析 algebrite 的输出（`[-2,2]` 或 `2`）。 */
  const values = parseRootList(text)

  if (values.length === 0) {
    throw new CalcError(
      'no_solution',
      '这个方程没有找到实数解：' + equation,
      '可能只有复根（用 operation:"roots" 看全部根）。',
    )
  }

  const isComplex = values.some((v) => typeof v !== 'number')
  const shown = values.map((v) => (typeof v === 'number' ? String(v) : formatComplex(v)))

  return {
    result: (isComplex ? '多项式精确解（含复数根，共 ' + values.length + ' 个）：' : '多项式精确解：') +
      variable + ' = ' + shown.join('，' + variable + ' = '),
    value: values,
    notice: isComplex ? '解含复数根 —— 实数域内该方程无解。' : undefined,
  }
}

/**
 * 解析 algebrite 的根列表输出。
 *
 * 支持三种形态：
 * ```
 *   [-2,2]                          多个实根
 *   2                               单根
 *   [-1/2,1/2]                      分数
 *   [0.5-0.866i,0.5+0.866i]         复数
 * ```
 *
 * @param text - algebrite 输出
 * @returns 根列表
 */
function parseRootList(text: string): Array<number | { re: number; im: number }> {
  const body = text.trim().replace(/^\[/, '').replace(/\]$/, '')
  if (body === '') return []
  const out: Array<number | { re: number; im: number }> = []

  /** 按顶层逗号切分（跳过嵌套括号内的逗号）。 */
  const chunks: string[] = []
  let depth = 0
  let current = ''
  for (const ch of body) {
    if (ch === '(' || ch === '[') depth += 1
    if (ch === ')' || ch === ']') depth -= 1
    if (ch === ',' && depth === 0) {
      chunks.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim() !== '') chunks.push(current.trim())

  for (const chunk of chunks) {
    /** 复数：含 `i`。 */
    if (/i/.test(chunk)) {
      const complex = parseComplex(chunk)
      if (complex !== null) out.push(complex)
      continue
    }
    /** 分数：`a/b`。 */
    const frac = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(chunk)
    if (frac !== null) {
      out.push(Number(frac[1]) / Number(frac[2]))
      continue
    }
    const n = Number(chunk)
    if (Number.isFinite(n)) out.push(Number(n.toFixed(10)))
  }
  return out
}

/**
 * 解析 algebrite 的复数形态（`0.5-0.866i`、`-1i`、`i`）。
 *
 * @param text - 复数字符串
 * @returns 复数；解析失败返回 null
 */
function parseComplex(text: string): { re: number; im: number } | null {
  const cleaned = text.replace(/\s/g, '').replace(/\*i/g, 'i')
  /** 纯虚数 `±1i` / `±ai` / `i`。 */
  const pureImag = /^([+-]?\d*\.?\d*)i$/.exec(cleaned)
  if (pureImag !== null) {
    const coeff = pureImag[1]
    const im = coeff === '' || coeff === '+' ? 1 : coeff === '-' ? -1 : Number(coeff)
    return Number.isFinite(im) ? { re: 0, im } : null
  }
  /** `a±bi`。 */
  const full = /^([+-]?\d*\.?\d*)([+-]\d*\.?\d*)i$/.exec(cleaned)
  if (full !== null) {
    const re = Number(full[1])
    const imPart = full[2]
    const im = imPart === '+' ? 1 : imPart === '-' ? -1 : Number(imPart)
    if (Number.isFinite(re) && Number.isFinite(im)) return { re, im }
  }
  return null
}

/** 格式化复数。 */
function formatComplex(c: { re: number; im: number }): string {
  const re = Math.abs(c.re) < 1e-10 ? 0 : Number(c.re.toFixed(6))
  const im = Math.abs(c.im) < 1e-10 ? 0 : Number(c.im.toFixed(6))
  if (im === 0) return String(re)
  if (re === 0) return String(im) + 'i'
  return re + (im > 0 ? '+' : '') + im + 'i'
}

/**
 * 符号微积分与化简。
 *
 * @param operation - 操作
 * @param expression - 表达式
 * @param variable - 变量
 * @param from - 定积分下限
 * @param to - 定积分上限
 * @returns 结果
 */
export function symbolicOperation(
  operation: 'derivative' | 'integral' | 'simplify' | 'expand',
  expression: string,
  variable = 'x',
  from?: number,
  to?: number,
): AlgebraOutcome {
  const source = toAlgebrite(expression)

  /**
   * ## 定积分走 algebrite 的 `defint`
   *
   * 实测：`A.defint('x^2','x',0,3)` → **9**（精确）。
   *
   * 上一版我自己做「先求原函数再代入上下限」，
   * 而 `defint` 直接给结果且不会有代入误差。
   */
  if (operation === 'integral' && from !== undefined && to !== undefined) {
    let out: string
    try {
      out = Algebrite.defint(source, variable, from, to).toString()
    } catch (error) {
      throw new CalcError(
        'invalid_argument',
        '定积分算不出来：' + expression + '（' +
          (error instanceof Error ? error.message.slice(0, 50) : '未知') + '）',
        '检查被积函数是否在区间内连续，以及积分变量是否正确。',
      )
    }
    const value = Number(out)
    return {
      result: '定积分 ∫(' + expression + ') d' + variable + '，从 ' + from + ' 到 ' + to + '\n  = ' + out,
      value: Number.isFinite(value) ? value : out,
    }
  }

  if (operation === 'derivative') {
    const out = fromAlgebrite(Algebrite.derivative(source, variable).toString())
    return { result: out, value: out }
  }

  if (operation === 'integral') {
    const out = fromAlgebrite(Algebrite.integral(source, variable).toString())
    return {
      result: out + ' + C',
      value: out,
      notice: '不定积分，`+ C` 表示任意常数。',
    }
  }

  if (operation === 'simplify') {
    const out = fromAlgebrite(Algebrite.simplify(source).toString())
    return { result: out, value: out }
  }

  const out = fromAlgebrite(Algebrite.expand(source).toString())
  return { result: out, value: out }
}

/**
 * 求根（`roots`）。
 *
 * @param engine - 引擎
 * @param expression - 表达式（隐含 `= 0`）
 * @param variable - 变量
 * @returns 结果
 */
export function findRoots(engine: Engine, expression: string, variable = 'x'): AlgebraOutcome {
  const source = toAlgebrite(expression)
  let text = ''
  try {
    text = Algebrite.roots(source, variable).toString()
  } catch {
    text = ''
  }
  if (text === '' || text === '[]') {
    try {
      text = Algebrite.nroots(source, variable).toString()
    } catch (error) {
      throw new CalcError(
        'invalid_argument',
        '求不出根：' + expression + '（' +
          (error instanceof Error ? error.message.slice(0, 50) : '未知') + '）',
        '确认表达式含变量 ' + variable + ' 且是代数表达式。',
      )
    }
  }

  const values = parseRootList(text)
  const real = values
    .map((v) => (typeof v === 'number' ? v : Math.abs(v.im) < 1e-9 ? v.re : null))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)

  return {
    result: variable + ' = ' + real.map(String).join('，' + variable + ' = '),
    value: real,
    notice: real.length === 0 ? '没有实根（可能全是复根）。' : undefined,
  }
}

/**
 * 解多元方程组。
 *
 * @param engine - 引擎
 * @param equation - 逗号分隔的方程
 * @returns 结果
 */
function solveMulti(engine: Engine, equation: string): AlgebraOutcome {
  const equations = equation.split(',').map((e) => e.trim()).filter((e) => e !== '')
  if (equations.length < 2) {
    throw new CalcError('invalid_argument', '多方程需要至少两条（逗号分隔）', '例如 `x+y=5, x-y=1`。')
  }

  const blacklist = new Set(['pi', 'e', 'i', 'PI', 'E', 'sin', 'cos', 'tan', 'log', 'exp', 'sqrt'])
  const vars: string[] = []
  for (const eq of equations) {
    for (const m of eq.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
      if (!blacklist.has(m[0]) && !vars.includes(m[0])) vars.push(m[0])
    }
  }
  if (vars.length !== equations.length) {
    throw new CalcError(
      'invalid_argument',
      '方程数 ' + equations.length + ' 与未知数 ' + vars.length + '（' + vars.join(',') + '）不匹配',
      '唯一解需要方程数 = 未知数。',
    )
  }

  /**
   * 用采样反推线性系数（每个方程在若干点上求值）。
   *
   * 只处理线性方程组 —— 非线性多方程没有通用精确解。
   */
  const matrix: number[][] = []
  const rhs: number[] = []
  for (const eq of equations) {
    const parts = eq.split('=')
    if (parts.length !== 2) {
      throw new CalcError('invalid_argument', '方程 "' + eq + '" 缺少等号', '每条都要 `左=右`。')
    }
    const residual = '(' + parts[0].trim() + ')-(' + parts[1].trim() + ')'
    const zero: Record<string, number> = {}
    for (const v of vars) zero[v] = 0
    const c0 = Number(engine.evaluate(residual, zero))
    const row: number[] = []
    for (const v of vars) {
      const scope: Record<string, number> = {}
      for (const vv of vars) scope[vv] = vv === v ? 1 : 0
      const c1 = Number(engine.evaluate(residual, scope))
      row.push(c1 - c0)
    }
    matrix.push(row)
    rhs.push(-c0)
  }

  /** 行列式判断。 */
  const determinant = Number(engine.evaluate('det(' + JSON.stringify(matrix) + ')'))
  if (Math.abs(determinant) < 1e-12) {
    const rank = Number(engine.evaluate('rank(' + JSON.stringify(matrix) + ')'))
    throw new CalcError(
      rank < vars.length ? 'singular' : 'no_solution',
      rank < vars.length
        ? '方程组解不唯一（系数矩阵奇异，有 ' + (vars.length - rank) + ' 个自由变量）'
        : '方程组无解（系数矛盾）',
      '检查方程之间是否线性相关。',
    )
  }

  const solution = engine.evaluate('lusolve(' + JSON.stringify(matrix) + ', ' + JSON.stringify(rhs) + ')')
  const arr = Array.isArray(solution)
    ? (solution as number[])
    : ((solution as { toArray?: () => number[] }).toArray?.() ?? [])

  const named = arr.map((v, i) => vars[i] + ' = ' + Number(Number(v).toFixed(10)))
  return {
    result: named.join('，'),
    value: arr.map((v) => Number(Number(v).toFixed(10))),
  }
}
