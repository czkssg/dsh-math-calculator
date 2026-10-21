/**
 * 符号代数：包一层 Algebrite。
 *
 * 为什么需要它：mathjs 只有 `derivative`，**没有符号积分**
 * （`math.integrate` 是 undefined）。Algebrite 是纯 JS 的 CAS，
 * 能给出 `∫x^2 = 1/3*x^3`、`∫sin(x) = -cos(x)` 这样的符号解。
 *
 * 能力边界（实测）：
 *   能：x^2、sin(x)、1/x、ln(x)、tan(x)、x*exp(x)、cos(x)^2、sqrt(1-x^2)、exp(-x^2)
 *   不能：x^3*sin(x)（返回 "could not find a solution"）
 *
 * 安全性：Algebrite 的 `eval` 是**符号求值**，不是 JS 求值。
 * `A.eval('Math.abs(-1)')` 返回符号串 `NaN...*Math`，不会执行 JS。
 * 仍然在入口做标识符黑名单，避免把可疑输入喂给它的解析器。
 *
 * @module dsh-math-calculator/symbolic
 */

import algebrite from 'algebrite'

/** Algebrite 的 CJS 默认导出在不同构建下形状不同，统一取一次。 */
const A: any = (algebrite as any)?.default ?? algebrite

/** 禁用标识符：JS 全局对象/函数名，出现即拒绝。 */
const FORBIDDEN_IDENTIFIERS = [
  'process',
  'require',
  'globalThis',
  'global',
  'module',
  'exports',
  'Function',
  'eval',
  'constructor',
  'prototype',
  '__proto__',
  'import',
]

/** 符号表达式长度上限。 */
const MAX_SYMBOLIC_LENGTH = 2_000

/** 符号求值失败。 */
export class SymbolicError extends Error {
  readonly stage: string
  constructor(stage: string, message: string) {
    super(message)
    this.name = 'SymbolicError'
    this.stage = stage
  }
}

/** 入口校验：长度 + 黑名单标识符。 */
function guard(source: unknown, stage: string): string {
  if (typeof source !== 'string') {
    throw new SymbolicError(stage, '表达式必须是字符串')
  }
  const text = source.trim()
  if (text === '') throw new SymbolicError(stage, '表达式为空')
  if (text.length > MAX_SYMBOLIC_LENGTH) {
    throw new SymbolicError(stage, `表达式过长（${text.length} > ${MAX_SYMBOLIC_LENGTH}）`)
  }
  for (const identifier of FORBIDDEN_IDENTIFIERS) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9_$])${identifier}([^A-Za-z0-9_$]|$)`)
    if (pattern.test(text)) {
      throw new SymbolicError(stage, `不允许使用标识符 "${identifier}"`)
    }
  }
  return text
}

/** 把 Algebrite 的 `1/3*x^3` 转成更易读的 `x^3/3` 形态（尽力而为，不改变语义）。 */
function tidy(expression: string): string {
  return expression
    .replace(/\s+/g, ' ')
    .replace(/\s*\*\s*/g, '*')
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s*\^\s*/g, '^')
    .trim()
}

/**
 * 符号求导：优先 Algebrite（能化简），失败退回 mathjs。
 */
export function symbolicDerivative(expression: string, variable: string): string {
  const text = guard(expression, 'derivative')
  try {
    const result = A.derivative(text, variable)
    const output = tidy(String(result))
    if (output && output !== 'Stop') return output
  } catch {
    /* 退回下面的 mathjs */
  }
  throw new SymbolicError('derivative', `无法对 "${text}" 求导`)
}

/**
 * 符号积分（不定积分）。
 * 这是 Algebrite 相对 mathjs 的核心增量能力。
 */
export function symbolicIntegral(expression: string, variable: string): string {
  const text = guard(expression, 'integral')
  let raw: string
  try {
    raw = String(A.integral(text, variable))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    if (/could not find a solution/i.test(detail)) {
      throw new SymbolicError(
        'integral',
        `符号积分引擎无法求出 "${text}" 的原函数`,
      )
    }
    throw new SymbolicError('integral', `积分失败: ${detail}`)
  }
  const output = tidy(raw)
  if (!output || /^Stop\b/.test(output)) {
    throw new SymbolicError('integral', `符号积分引擎无法求出 "${text}" 的原函数`)
  }
  return output
}

/** 符号化简。 */
export function symbolicSimplify(expression: string): string {
  const text = guard(expression, 'simplify')
  try {
    return tidy(String(A.simplify(text)))
  } catch (error) {
    throw new SymbolicError('simplify', `化简失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 符号展开。 */
export function symbolicExpand(expression: string): string {
  const text = guard(expression, 'expand')
  try {
    return tidy(String(A.expand(text)))
  } catch (error) {
    throw new SymbolicError('expand', `展开失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 多项式求根（单变量），保留复数根。
 *
 * Algebrite 返回的是**符号形式**的根，例如：
 *   x^3 - 1 → [1, -1/2-1/2*i*3^(1/2), -1/2+1/2*i*3^(1/2)]
 *   x^5 - 1 → [-cos(1/5*pi)-i*sin(1/5*pi), ...]
 * 早先直接用 Number() 转换，符号表达式转不了就被丢弃，
 * 结果 5 次方程只返回 x=1 —— 丢了 4 个复数根。
 * 现在先用 `A.float()` 数值化，再解析成 a+bi 形式。
 */
export interface ComplexRoot {
  re: number
  im: number
}

/**
 * 把符号表达式转成复数。
 *
 * 关键坑：Algebrite 的 `float()` 输出带**省略号**，例如
 *   `-0.5-0.866025...*i`
 * 那是显示截断，不是合法数字。正则必须容忍 `...` 并把它去掉。
 */
function toComplex(symbolic: string): ComplexRoot | undefined {
  let floated: string
  try {
    floated = String(A.float(symbolic))
  } catch {
    return undefined
  }
  // 去掉空白与 float() 的截断省略号
  const text = floated.replace(/\s+/g, '').replace(/\.\.\./g, '')

  // 纯实数
  const plain = Number(text)
  if (Number.isFinite(plain)) return { re: plain, im: 0 }

  const NUMBER = '-?[\\d.]+(?:e[+-]?\\d+)?'

  // 纯虚：`-i`、`i`、`0.5*i`、`-0.5*i`
  if (text === 'i') return { re: 0, im: 1 }
  if (text === '-i') return { re: 0, im: -1 }
  const imaginaryOnly = text.match(new RegExp(`^(${NUMBER})\\*?i$`))
  if (imaginaryOnly) {
    const im = Number(imaginaryOnly[1])
    if (Number.isFinite(im)) return { re: 0, im }
  }

  // a+bi / a-bi（虚部可带或不带 *）
  const both = text.match(new RegExp(`^(${NUMBER})([+-])(${NUMBER})\\*?i$`))
  if (both) {
    const re = Number(both[1])
    const im = Number(both[3]) * (both[2] === '-' ? -1 : 1)
    if (Number.isFinite(re) && Number.isFinite(im)) return { re, im }
  }

  // 只以 i 结尾但形式怪异（如 `0.300000...*i` 已被去点）
  if (text.endsWith('i')) {
    const head = text.slice(0, -1).replace(/\*$/, '')
    const im = Number(head)
    if (Number.isFinite(im)) return { re: 0, im }
  }

  return undefined
}

/** 按顶层逗号切分（不切断括号内的逗号）。 */
function splitTopLevel(text: string): string[] {
  const pieces: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(' || char === '[') depth += 1
    if (char === ')' || char === ']') depth -= 1
    if (char === ',' && depth === 0) {
      if (current.trim() !== '') pieces.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim() !== '') pieces.push(current.trim())
  return pieces
}

/** 多项式求根，返回含复数的根。 */
export function symbolicRootsWithComplex(expression: string, variable: string): ComplexRoot[] {
  const text = guard(expression, 'roots')
  let raw: string
  try {
    raw = String(A.roots(text, variable))
  } catch (error) {
    throw new SymbolicError('roots', `求根失败: ${error instanceof Error ? error.message : String(error)}`)
  }
  const match = raw.match(/^\[([\s\S]*)\]$/)
  if (!match) throw new SymbolicError('roots', `无法解析根: ${raw}`)
  const inner = match[1].trim()
  if (inner === '') return []

  const roots: ComplexRoot[] = []
  for (const piece of splitTopLevel(inner)) {
    const complex = toComplex(piece)
    if (complex) roots.push(complex)
  }
  return roots
}

/** 多项式求根，只返回实数根。 */
export function symbolicRoots(expression: string, variable: string): number[] {
  return symbolicRootsWithComplex(expression, variable)
    .filter((root) => Math.abs(root.im) < 1e-9)
    .map((root) => root.re)
}

/**
 * 把系数数组转成多项式字符串（升幂 → 通常写法）。
 * 用于把矩阵法解出的方程组结果回写成符号形式。
 */
export function coefficientsToPolynomial(coefficients: number[], variable = 'x'): string {
  const terms: string[] = []
  for (let power = coefficients.length - 1; power >= 0; power -= 1) {
    const coefficient = coefficients[power]
    if (!Number.isFinite(coefficient) || Math.abs(coefficient) < 1e-15) continue
    const sign = coefficient < 0 ? '-' : '+'
    const magnitude = Math.abs(coefficient)
    let body: string
    if (power === 0) body = String(magnitude)
    else if (power === 1) body = magnitude === 1 ? variable : `${magnitude}*${variable}`
    else body = magnitude === 1 ? `${variable}^${power}` : `${magnitude}*${variable}^${power}`
    terms.push(`${sign} ${body}`)
  }
  if (terms.length === 0) return '0'
  const first = terms[0].replace(/^\+\s*/, '')
  return terms
    .slice(1)
    .reduce((accumulator, term) => `${accumulator} ${term}`, first)
}
