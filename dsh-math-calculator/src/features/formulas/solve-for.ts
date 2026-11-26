/**
 * 公式反解：给定目标值，求其中某个参数（`solve-for`）。
 *
 * ## 为什么需要
 *
 * 665 条公式只能正向算。作者真正常问的是反方向：
 * 「要让构件撑住 100 MPa，壁厚至少多少」「要 5% 年增长，储蓄率要多少」。
 * 旧实现只有 `backSolve` 的 4 个锚点，覆盖不了。
 *
 * ## 两层求解
 *
 * ```
 *   符号层  nerdamer.solve(expr = value, target)
 *          精确、能返回多解；对多项式/可分离方程有效
 *   数值层  nerdamer 解不出时，在 range 内采样 + 二分
 *          对超越方程兜底；结果标注「数值解」
 * ```
 *
 * ## 不猜
 *
 * 解必须**代回验证**（相对误差 < 1e-6）才返回；无解、复数解、超范围都明确说，
 * 不返回一个「看起来像答案」的数。
 *
 * @module dsh-math-calculator/features/formulas/solve-for
 */

import { createRequire } from 'node:module'
import { CalcError } from '../../core/errors.js'
import { buildEngine } from '../../core/engine.js'
import type { FormulaEntry } from './query.js'

const nodeRequire = createRequire(import.meta.url)
/** nerdamer 是 CJS；主包自带 solve，不需要额外插件。 */
const nerdamer = nodeRequire('nerdamer') as {
  solve: (equation: string, variable: string, substitutions?: unknown) => { toString: () => string }
}

/** 输入。 */
export interface SolveForInput {
  formulaId: string
  target: string
  value: number
  /** 其余参数的取值（缺省用公式默认值）。 */
  params?: Record<string, number>
  /** 数值兜底时的搜索区间。 */
  range?: { min: number; max: number }
}

/** 结果。 */
export interface SolveForOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 数字渲染。 */
function show(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs !== 0 && (abs >= 1e7 || abs < 1e-3)) return value.toExponential(4)
  return String(Number(value.toPrecision(6)))
}

/** 解析 nerdamer 的解字符串：`[2,-2]` / `1.019...` / 带 i 的复数。 */
function parseSolutions(text: string, substitutions: Record<string, number> = {}): { real: number[]; complex: string[] } {
  const raw = text.trim().replace(/^\{|\}$/g, '').replace(/^\[|\]$/g, '')
  const parts = raw.split(',').map((item) => item.trim()).filter((item) => item !== '')
  const real: number[] = []
  const complex: string[] = []
  const engine = buildEngine()
  for (const part of parts) {
    /**
     * 独立的 i（前后不是字母）才算虚数单位。
     * 踩过：\`pi\`、\`sin\` 都含字母 i，第一版把它们全当复数，
     * 于是圆面积反解 \`10*pi^(-1/2)\` 被判成「没有实数解」。
     */
    if (/(^|[^a-zA-Z])i([^a-zA-Z]|$)/.test(part)) {
      complex.push(part)
      continue
    }
    const direct = Number(part)
    if (Number.isFinite(direct)) {
      real.push(direct)
      continue
    }
    /** nerdamer 常返回 \`10*pi^(-1/2)\` 或 \`100/(g*h)\`：交给 mathjs 数值化（带其余参数）。 */
    try {
      const scope: Record<string, unknown> = {}
      for (const [name, value] of Object.entries(substitutions)) scope[name] = engine.math.bignumber(String(value))
      const computed = Number(engine.evaluate(part, scope))
      if (Number.isFinite(computed)) real.push(computed)
      else complex.push(part)
    } catch {
      complex.push(part)
    }
  }
  return { real, complex }
}

/**
 * 反解一个参数。
 *
 * @param input - 公式、目标参数、目标值与其余参数
 * @param formulas - 公式库（注入）
 * @returns 解与验证
 * @throws {CalcError} 公式/参数不存在、缺参数、无解
 */
export function solveFor(input: SolveForInput, formulas: FormulaEntry[]): SolveForOutcome {
  const entry = formulas.find((formula) => formula.id === input.formulaId || formula.name === input.formulaId)
  if (entry === undefined) {
    throw new CalcError('unknown_formula', '没有 id 为 "' + input.formulaId + '" 的公式', '用 formulas query 查可用的公式 id。')
  }
  if (entry.executable === false) {
    throw new CalcError('invalid_argument', '这条公式是展示式，不能反解：' + entry.id, '它的表达式含 Σᵢ 这类排版符号。')
  }
  const target = input.target.trim()
  if (!(target in (entry.params ?? {}))) {
    throw new CalcError(
      'unknown_symbol',
      '公式 ' + entry.id + ' 没有参数「' + target + '」',
      '可反解的参数：' + Object.keys(entry.params ?? {}).join(' / ') + '。',
    )
  }
  if (!Number.isFinite(input.value)) {
    throw new CalcError('invalid_argument', '目标值必须是有限数（收到 ' + String(input.value) + '）', '')
  }

  /** 其余参数：显式 > 默认值；仍缺则报缺参（不猜）。 */
  const substituted: Record<string, number> = {}
  const missing: string[] = []
  for (const [name, spec] of Object.entries(entry.params ?? {})) {
    if (name === target) continue
    const provided = input.params?.[name]
    if (typeof provided === 'number' && Number.isFinite(provided)) substituted[name] = provided
    else if (spec.value !== null) substituted[name] = spec.value
    else missing.push(name)
  }
  if (missing.length > 0) {
    throw new CalcError(
      'missing_params',
      '反解 ' + entry.id + ' 的 ' + target + ' 还缺这些参数：' + missing.join('、'),
      '例如 {formula:"' + entry.id + '", solveFor:"' + target + '", targetValue:..., params:{' + missing.map((name) => name + ':1').join(',') + '}}。',
    )
  }

  /** 符号层：把其余参数替换进表达式，再解 target。 */
  const equation = entry.expr + ' = ' + input.value
  let symbolText = ''
  try {
    /** 空替换表不能当第三参数传：nerdamer 在空对象下会返回空解（实测）。 */
    symbolText = Object.keys(substituted).length > 0 ? String(nerdamer.solve(equation, target, substituted)) : String(nerdamer.solve(equation, target))
  } catch {
    symbolText = ''
  }
  const parsed = parseSolutions(symbolText, substituted)

  /** 验证：代回原式，看两边是否相等。 */
  const engine = buildEngine()
  const verified: number[] = []
  /**
   * 代回时要把候选值转成 BigNumber。
   *
   * 踩过：引擎默认 BigNumber，而 JS number 超过 15 位有效数字会被拒绝
   * （\`5.641895835477563\` → 「Cannot implicitly convert a number with >15
   * significant digits」），于是所有解都验证失败、报「无解」。
   */
  const scopeValue = (value: number): unknown => engine.math.bignumber(String(value))
  for (const candidate of parsed.real) {
    try {
      const scope: Record<string, unknown> = { [target]: scopeValue(candidate) }
      for (const [name, value] of Object.entries(substituted)) scope[name] = scopeValue(value)
      const got = Number(engine.evaluate(entry.expr, scope))
      const scale = Math.max(1e-12, Math.abs(got), Math.abs(input.value))
      if (Math.abs(got - input.value) / scale < 1e-6) verified.push(candidate)
    } catch {
      /* 代不回去的解不算 */
    }
  }

  /** 数值层：符号解为空时，在区间内扫描 + 二分。 */
  let numericUsed = false
  let solutions = verified
  if (solutions.length === 0 && input.range !== undefined && input.range.min < input.range.max) {
    numericUsed = true
    const { min, max } = input.range
    const evaluateAt = (x: number): number | null => {
      try {
        const scope: Record<string, unknown> = { [target]: scopeValue(x) }
        for (const [name, value] of Object.entries(substituted)) scope[name] = scopeValue(value)
        const got = Number(engine.evaluate(entry.expr, scope))
        return Number.isFinite(got) ? got - input.value : null
      } catch {
        return null
      }
    }
    const steps = 400
    let previous: { x: number; f: number } | null = null
    for (let index = 0; index <= steps; index += 1) {
      const x = min + ((max - min) * index) / steps
      const f = evaluateAt(x)
      if (f === null) {
        previous = null
        continue
      }
      if (f === 0) {
        solutions.push(x)
        continue
      }
      if (previous !== null && Math.sign(previous.f) !== Math.sign(f)) {
        let lo = previous.x
        let hi = x
        for (let iteration = 0; iteration < 80; iteration += 1) {
          const mid = (lo + hi) / 2
          const fm = evaluateAt(mid)
          if (fm === null) break
          if (Math.abs(fm) < 1e-12) {
            lo = mid
            hi = mid
            break
          }
          if (Math.sign(fm) === Math.sign(evaluateAt(lo) ?? 0)) lo = mid
          else hi = mid
        }
        const root = (lo + hi) / 2
        if (solutions.every((item) => Math.abs(item - root) > 1e-9)) solutions.push(root)
      }
      previous = { x, f }
    }
  }

  const lines: string[] = ['═══ 公式反解：' + entry.name + ' ═══', '']
  lines.push('  公式：' + entry.expr + '（' + entry.unit + '）')
  lines.push('  目标：' + target + ' = ?，使结果等于 ' + show(input.value))
  lines.push('  已代入：' + Object.entries(substituted).map(([name, value]) => name + '=' + show(value)).join('，'))
  lines.push('')

  if (solutions.length === 0) {
    lines.push('  ✗ 没有找到实数解。')
    if (parsed.complex.length > 0) lines.push('  符号解只有复数解：' + parsed.complex.join('，') + '（这通常意味着给定参数下无实数解）')
    if (!numericUsed && input.range === undefined) lines.push('  可给 solveRange:{min,max} 让它在区间内做数值搜索。')
    lines.push('', '  ★ 不返回「看起来像答案」的数：符号解为空、数值也没找到时，这里就是没有解。')
    return { result: lines.join('\n'), value: { formula: entry.id, target, value: input.value, solutions: [], complex: parsed.complex, verified: [] }, ...(parsed.complex.length > 0 ? { notice: '只有复数解' } : {}) }
  }

  solutions.sort((a, b) => a - b)
  lines.push('  ' + target + ' = ' + solutions.map(show).join('  或  ') + (numericUsed ? '（数值解，区间 ' + show(input.range!.min) + '–' + show(input.range!.max) + '）' : '（符号解，已代回验证）'))
  if (solutions.length > 1) lines.push('  ⚠ 多解：物理上通常只有一个成立（看适用域与符号）。' + (entry.desc ? ' 公式备注：' + entry.desc.slice(0, 80) : ''))
  lines.push('', '  验证：代回原式，相对误差 < 1e-6 的解才列出。')
  lines.push('  ★ 这只是数学解；是否物理可行要看该公式的适用域与周边约束。')

  return {
    result: lines.join('\n'),
    value: { formula: entry.id, target, value: input.value, solutions, complex: parsed.complex, verified: solutions, numeric: numericUsed, substituted },
    ...(solutions.length > 1 ? { notice: '有多解，需要按物理意义取舍' } : {}),
  }
}
