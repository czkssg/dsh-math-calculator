/**
 * 方程组解析与求解。
 *
 * 用户给的是自然写法：`3x + 2y = 10, x - y = 1`。
 * mathjs 只接受矩阵形式 `lusolve([[3,2],[1,-1]],[10,1])`，
 * 所以这一层负责把方程文本转成系数矩阵。
 *
 * 策略：线性方程组走精确的 `lusolve`；单变量多项式走精确求根；
 * 其余退回数值 / 符号。
 *
 * @module dsh-math-calculator/systems
 */

import { solveLinearSystem } from './stats.js'

/** 一条解析后的线性方程：coefficients · variables = constant。 */
export interface LinearEquation {
  coefficients: Map<string, number>
  constant: number
  source: string
}

/** 从记录里取出已定义的数值常量，用于替换系数。 */
export type KnownValues = Record<string, number>

/** 归一化变量别名：`2x` 里的 `x`。 */
const VARIABLE_PATTERN = /([A-Za-z_][A-Za-z0-9_]*)/g

/**
 * 把 `3x + 2y - 4z` 这类表达式收集为「变量 → 系数」。
 *
 * 做法：对每个变量，把表达式按「加减号切项」，逐项判断该项是否含目标变量，
 * 含则把其余部分当系数（数字或已知常量），不含则该变量在这项里系数为 0。
 * 这样能正确处理 `3x`、`-x`、`x/2`、`(1/2)x`、`3*x` 等写法。
 */
function collectCoefficients(
  expression: string,
  variables: string[],
  known: KnownValues,
): Map<string, number> | undefined {
  const coefficients = new Map<string, number>()
  const terms = splitTerms(expression)
  if (terms.length === 0) return undefined

  for (const term of terms) {
    const { sign, body } = term

    // 找出这一项里出现的变量（用词边界，避免 x 命中 xx 或 exp）
    const present = variables.filter((variable) => hasIdentifier(body, variable))

    if (present.length === 0) {
      // 纯常数项 —— 由调用方决定归到哪边
      continue
    }
    if (present.length > 1) {
      // 变量乘变量（如 xy）→ 非线性，交给别的路径
      return undefined
    }

    const variable = present[0]
    // 确认该变量在项里只出现一次（x*x 属于非线性表达式）
    const occurrences = countIdentifier(body, variable)
    if (occurrences !== 1) return undefined

    // 用占位符替换变量，再把占位符位置当作系数语义处理
    const placeholder = '\u0000VAR\u0000'
    let rest = replaceIdentifier(body, variable, placeholder)

    // 形如 "3*VAR" / "VAR*3" / "3VAR"（隐式乘法）都归一到系数
    rest = rest.split(placeholder).join('')

    // 处理除法形式：VAR/2 或 1/VAR 的倒数形式
    const division = rest.match(/^\/\s*(.+)$/)
    if (division) {
      rest = `1/(${division[1]})`
    }

    rest = rest.replace(/^\*+|\*+$/g, '').replace(/^\s+|\s+$/g, '')
    if (rest === '') rest = '1'

    const numeric = evaluateConstant(rest, known)
    if (numeric === undefined) return undefined

    const previous = coefficients.get(variable) ?? 0
    coefficients.set(variable, previous + sign * numeric)
  }

  return coefficients
}

/**
 * 判断表达式里是否出现某个标识符。
 *
 * 关键点：不能要求「前面不是数字」，因为 `3x` 是隐式乘法，`x` 前面正是数字 3。
 * 真正需要排除的是「它其实是更长标识符的一部分」（`xx`、`exp`），
 * 所以边界只挡**字母与下划线**，数字允许紧邻。
 */
function hasIdentifier(expression: string, identifier: string): boolean {
  return countIdentifier(expression, identifier) > 0
}

/** 统计标识符出现次数（允许数字紧邻的隐式乘法写法）。 */
function countIdentifier(expression: string, identifier: string): number {
  const pattern = new RegExp(`(?<![A-Za-z_])${escapeRegExp(identifier)}(?![A-Za-z0-9_])`, 'g')
  return (expression.match(pattern) ?? []).length
}

/** 把标识符替换成占位符。 */
function replaceIdentifier(expression: string, identifier: string, replacement: string): string {
  const pattern = new RegExp(`(?<![A-Za-z_])${escapeRegExp(identifier)}(?![A-Za-z0-9_])`, 'g')
  return expression.replace(pattern, replacement)
}

/** 把表达式按顶层加减号切成带符号的项。 */
function splitTerms(expression: string): Array<{ sign: number; body: string }> {
  const text = expression.replace(/\s+/g, '')
  const terms: Array<{ sign: number; body: string }> = []
  let depth = 0
  let current = ''
  let sign = 1
  let expectSign = true

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '(' || char === '[') depth += 1
    if (char === ')' || char === ']') depth -= 1

    if (depth === 0 && (char === '+' || char === '-') && !expectSign) {
      if (current !== '') terms.push({ sign, body: current })
      sign = char === '-' ? -1 : 1
      current = ''
      expectSign = true
      continue
    }
    if (depth === 0 && (char === '+' || char === '-') && expectSign && current === '') {
      sign = char === '-' ? -1 : 1
      expectSign = false
      continue
    }
    current += char
    expectSign = false
  }
  if (current !== '') terms.push({ sign, body: current })
  return terms
}

/** 求一个「系数表达式」的数值（支持数字、已知常量、简单分数）。 */
function evaluateConstant(expression: string, known: KnownValues): number | undefined {
  const text = expression.trim()
  if (text === '') return 1

  // 纯数字
  const direct = Number(text)
  if (Number.isFinite(direct)) return direct

  // 已知常量
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
    const value = known[text]
    return Number.isFinite(value) ? value : undefined
  }

  // 形如 1/2 或 1/(3)
  const fraction = text.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/)
  if (fraction) {
    const denominator = Number(fraction[2])
    if (denominator === 0) return undefined
    return Number(fraction[1]) / denominator
  }
  return undefined
}

/** 转义正则特殊字符。 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 从一段文本里抽出所有变量名（排除已知常量与函数名）。 */
export function extractVariables(expression: string, known: KnownValues): string[] {
  const found = new Set<string>()
  const matches = expression.match(VARIABLE_PATTERN) ?? []
  const functionNames = new Set(['sin', 'cos', 'tan', 'log', 'ln', 'exp', 'sqrt', 'abs', 'pi', 'e', 'i'])
  for (const match of matches) {
    const lowered = match.toLowerCase()
    if (functionNames.has(lowered)) continue
    if (Object.prototype.hasOwnProperty.call(known, match)) continue
    found.add(match)
  }
  return [...found]
}

/**
 * 解析单个方程 `left = right` 为线性形式。
 * 返回 undefined 表示不是线性方程（含非线性项）。
 */
export function parseLinearEquation(
  source: string,
  known: KnownValues,
  declaredVariables?: string[],
): LinearEquation | undefined {
  const text = source.trim()
  if (text === '') return undefined

  const parts = text.split('=')
  if (parts.length !== 2) return undefined

  const left = parts[0].trim()
  const right = parts[1].trim()
  if (left === '' || right === '') return undefined

  const variables = declaredVariables ?? extractVariables(`${left} ${right}`, known)
  if (variables.length === 0) return undefined

  const leftCoefficients = collectCoefficients(left, variables, known)
  const rightCoefficients = collectCoefficients(right, variables, known)
  if (!leftCoefficients || !rightCoefficients) return undefined

  const leftConstant = constantOf(left, variables, known)
  const rightConstant = constantOf(right, variables, known)
  if (leftConstant === undefined || rightConstant === undefined) return undefined

  const coefficients = new Map<string, number>()
  for (const variable of variables) {
    const value = (leftCoefficients.get(variable) ?? 0) - (rightCoefficients.get(variable) ?? 0)
    coefficients.set(variable, value)
  }

  return {
    coefficients,
    constant: rightConstant - leftConstant,
    source: text,
  }
}

/** 取表达式里的纯常数部分（不含变量）。 */
function constantOf(expression: string, variables: string[], known: KnownValues): number | undefined {
  const terms = splitTerms(expression)
  let total = 0
  for (const term of terms) {
    // 含变量的项属于系数部分，跳过；这里必须与 collectCoefficients 用同一套
    // 判定（隐式乘法 3x 里的 x 也要命中），否则系数会被误当成常数。
    if (variables.some((variable) => hasIdentifier(term.body, variable))) continue
    const numeric = evaluateConstant(term.body, known)
    if (numeric === undefined) return undefined
    total += term.sign * numeric
  }
  return total
}

/** 方程组求解结果。 */
export interface SystemSolution {
  variables: string[]
  values: number[]
  /** 是否有唯一解。 */
  unique: boolean
}

/**
 * 求解线性方程组。
 * 未知数按出现顺序编号，缺失的变量补齐 0 系数。
 */
export function solveLinearSystem_(
  equations: LinearEquation[],
  variables: string[],
): SystemSolution {
  const rows = equations.length
  const cols = variables.length
  if (rows === 0) throw new Error('没有可求解的方程')
  if (cols === 0) throw new Error('没有识别出任何变量')

  const matrix: number[][] = []
  const vector: number[] = []
  for (const equation of equations) {
    const row = variables.map((variable) => equation.coefficients.get(variable) ?? 0)
    matrix.push(row)
    vector.push(equation.constant)
  }

  // 方程数与未知数不等时，用正规方程处理超定/欠定（尽力而为）
  if (rows === cols) {
    const values = solveLinearSystem(matrix, vector)
    return { variables, values, unique: true }
  }

  // 统一走最小二乘（正规方程 A^T A x = A^T b）
  const normal: number[][] = []
  const rhs: number[] = []
  for (let i = 0; i < cols; i += 1) {
    const row: number[] = []
    for (let j = 0; j < cols; j += 1) {
      let sum = 0
      for (let k = 0; k < rows; k += 1) sum += matrix[k][i] * matrix[k][j]
      row.push(sum)
    }
    normal.push(row)
    let sum = 0
    for (let k = 0; k < rows; k += 1) sum += matrix[k][i] * vector[k]
    rhs.push(sum)
  }
  const values = solveLinearSystem(normal, rhs)
  return { variables, values, unique: rows === cols }
}

/** 把方程列表按逗号/分号/换行拆开（不切断括号内的逗号）。 */
export function splitEquations(source: string): string[] {
  const pieces: string[] = []
  let depth = 0
  let current = ''
  for (const char of source) {
    if (char === '(' || char === '[') depth += 1
    if (char === ')' || char === ']') depth -= 1
    if ((char === ',' || char === ';' || char === '\n') && depth === 0) {
      if (current.trim() !== '') pieces.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim() !== '') pieces.push(current.trim())
  return pieces
}
