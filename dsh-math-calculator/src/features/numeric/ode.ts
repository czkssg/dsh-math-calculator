/**
 * 微分方程与离散递推（ode / recurrence）。
 *
 * ## ★ 2026-11-13 重写：RK4 主循环改用 `ode-rk4`
 *
 * 用户提醒「不能找现成的开源计算代码吗」之后查了 npm，实测：
 *
 * ```
 *   ode-rk4  MIT、零依赖
 *   方程 dy/dt = -0.5y, y(0)=100, [0,10]
 *   → y(10) = 0.6737946999261668      解析解 0.67379470    误差 7e-11 ✓
 * ```
 *
 * 我上一版手写 RK4 时踩了三个坑（四阶中间态污染、BigNumber 15 位限制、
 * 发散检测），而库把前两个直接解决。
 *
 * **但仍要自写两部分**：
 *
 * ```
 *   ① deriv 回调里做 15 位截断   ← 库不知道 BigNumber 的限制
 *   ② 刚性提示                   ← 库不做这个判断（那是领域知识）
 * ```
 *
 * ## `recurrence` 仍自写
 *
 * 递推是「给递推式与初值，逐期输出表格」——这是表格生成器，
 * 没有库的价值（逻辑就是 for 循环）。
 *
 * @module dsh-math-calculator/features/numeric/ode
 */

import rk4 from 'ode-rk4'
import type { Engine } from '../../core/engine.js'
import { CalcError } from '../../core/errors.js'
import { fmtNumber, FMT } from '../../core/format.js'

/** ODE 结果。 */
export interface OdeOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 解析 `dy/dt = -0.5*y` 形态。 */
function parseOde(expression: string): { derivative: string; variable: string } {
  const slashForm = /^d([A-Za-z])\s*\/\s*d([A-Za-z])\s*=\s*(.+)$/.exec(expression.trim())
  if (slashForm !== null) {
    return { variable: slashForm[2], derivative: slashForm[3] }
  }
  const primeForm = /^([A-Za-z])\s*'\s*=\s*(.+)$/.exec(expression.trim())
  if (primeForm !== null) {
    return { variable: 't', derivative: primeForm[2] }
  }
  throw new CalcError(
    'syntax',
    '方程 "' + expression + '" 缺少等号，应为 dy/dt = ... 形式',
    '例如 `dy/dt = -0.5*y` 或 `y\' = -0.5*y`。',
  )
}

/**
 * RK4 求解（主循环由 `ode-rk4` 提供）。
 *
 * @param engine - 引擎
 * @param expression - 方程
 * @param initial - 初值
 * @param from - 起点
 * @param to - 终点
 * @param steps - 步数
 * @param samples - 采样点个数
 * @returns 结果
 */
export function solveOde(
  engine: Engine,
  expression: string,
  initial: Record<string, number>,
  from: number,
  to: number,
  steps = 1000,
  samples = 11,
): OdeOutcome {
  const { derivative, variable } = parseOde(expression)

  const stateNames = Object.keys(initial).filter((k) => k !== variable)
  if (stateNames.length === 0) {
    throw new CalcError(
      'missing_params',
      'initial 里要有状态变量（如 {y: 100}）',
      '方程 `dy/dt = ...` 需要 y 的初值。',
    )
  }
  if (to <= from) {
    throw new CalcError('invalid_argument', 'to 必须大于 from（收到 from=' + from + ', to=' + to + '）', '')
  }

  const h = (to - from) / steps

  /**
   * ## deriv 回调里的两件事
   *
   * ### ① 15 位截断
   *
   * BigNumber 模式拒绝「>15 位有效数字的 JS number」：
   * ```
   *   Cannot implicitly convert a number with >15 significant digits
   * ```
   * 而 RK4 的中间值必然超过 15 位（浮点自然结果）。
   *
   * ### ② 刚性信号采集
   *
   * 库不做这个判断 —— `|dy/dt| / max(|y|,ε) × h` 超过 1 说明
   * 这一步内状态变化超过自身量级，是刚性症状。
   */
  const clamp = (v: number): number => Number(v.toPrecision(15))
  let stiffSignal = 0

  const derivFn = (dydt: number[], y: number[], t: number): void => {
    const scope: Record<string, number> = { [variable]: clamp(t) }
    for (let i = 0; i < stateNames.length; i += 1) scope[stateNames[i]] = clamp(y[i])

    for (let i = 0; i < stateNames.length; i += 1) {
      try {
        const v = Number(engine.evaluate(derivative, scope))
        dydt[i] = Number.isFinite(v) ? v : NaN
        /** 刚性信号：只看第一个状态变量（多变量时等价性足够）。 */
        if (i === 0 && Number.isFinite(v)) {
          const ratio = (Math.abs(v) / Math.max(Math.abs(y[i]), 1e-30)) * h
          if (Number.isFinite(ratio)) stiffSignal = Math.max(stiffSignal, ratio)
        }
      } catch {
        dydt[i] = NaN
      }
    }
  }

  const y0 = stateNames.map((name) => Number(initial[name]))
  const integrator = rk4(y0, derivFn, from, h)

  /** 采样记录。 */
  const points: Array<{ t: number; values: Record<string, number> }> = []
  const record = (t: number, y: number[]): void => {
    const values: Record<string, number> = {}
    for (let i = 0; i < stateNames.length; i += 1) values[stateNames[i]] = y[i]
    points.push({ t, values })
  }
  record(from, integrator.y as number[])

  const sampleEvery = Math.max(1, Math.floor(steps / samples))
  let diverged = false

  for (let step = 1; step <= steps; step += 1) {
    integrator.step()
    const y = integrator.y as number[]
    if (y.some((v) => !Number.isFinite(v))) {
      diverged = true
      break
    }
    if (step % sampleEvery === 0 || step === steps) {
      record(integrator.t as number, y)
    }
  }

  if (diverged) {
    throw new CalcError(
      'non_finite',
      '积分发散（数值爆炸）',
      '常见原因：① 方程本身在有限时间内发散（如 dy/dt = y²）' +
        '② 步长太大导致数值不稳定。把 steps 调大（如 10000）再试。',
    )
  }

  /** 正文表格。 */
  const lines: string[] = []
  lines.push('求解 1 条方程，自变量 ' + variable)
  lines.push('积分区间 [' + from + ', ' + to + ']，步数 ' + steps + '，步长 ' + fmtNumber(h, FMT.general))
  lines.push('')
  const header = variable.padEnd(10) + stateNames.map((n) => n.padEnd(16)).join('')
  lines.push(header)
  lines.push('-'.repeat(header.length + 6))
  for (const point of points) {
    const cells = stateNames.map((n) => fmtNumber(point.values[n], FMT.general).padEnd(16))
    lines.push(fmtNumber(point.t, FMT.general).padEnd(10) + cells.join(''))
  }

  const notice = stiffSignal > 1
    ? '这个方程在部分区间是刚性的（状态变化速度超过自身量级），结果对步长敏感 —— ' +
      '把 steps 调大（如 10000）复算一次看是否收敛。'
    : undefined

  return {
    result: lines.join('\n'),
    value: {
      variable,
      from,
      to,
      steps,
      points: points.map((p) => ({ t: p.t, ...p.values })),
      final: points[points.length - 1]?.values ?? {},
    },
    notice,
  }
}

/**
 * 离散递推。
 *
 * @param engine - 引擎
 * @param recurrence - 递推式
 * @param initial - 初值
 * @param periods - 期数
 * @returns 结果
 */
export function solveRecurrence(
  engine: Engine,
  recurrence: string,
  initial: Record<string, number>,
  periods: number,
): OdeOutcome {
  if (!Number.isInteger(periods) || periods < 0 || periods > 5000) {
    throw new CalcError('invalid_argument', 'periods 必须是 0–5000 的整数（收到 ' + periods + '）', '')
  }
  const names = Object.keys(initial)
  if (names.length === 0) {
    throw new CalcError('missing_params', 'initial 里要有初值（如 {P: 100}）', '')
  }

  let state: Record<string, number> = {}
  for (const name of names) state[name] = Number(initial[name])

  const rows: Array<Record<string, number>> = [{ ...state }]
  let overflow = false

  for (let period = 1; period <= periods; period += 1) {
    /** 同 ODE：BigNumber 拒绝 >15 位 number。 */
    const scope: Record<string, number> = {}
    for (const name of names) scope[name] = Number(state[name].toPrecision(15))
    const next: Record<string, number> = {}
    for (const name of names) {
      const v = Number(engine.evaluate(recurrence, scope))
      if (!Number.isFinite(v)) {
        throw new CalcError(
          'non_finite',
          '第 ' + period + ' 期递推结果不是有限数（' + name + '）',
          '递推式可能指数爆炸或除以零。检查递推式：' + recurrence,
        )
      }
      next[name] = v
    }
    state = next
    rows.push({ ...state })
    if (Math.abs(Object.values(state)[0]) > 1e300) {
      overflow = true
      break
    }
  }

  const lines: string[] = []
  lines.push('离散递推 ' + periods + ' 期，状态 ' + names.join(', '))
  lines.push('递推式: ' + recurrence)
  lines.push('')
  const header = '期'.padEnd(8) + names.map((n) => n.padEnd(18)).join('')
  lines.push(header)
  lines.push('-'.repeat(header.length + 2))
  for (let i = 0; i < rows.length; i += 1) {
    const cells = names.map((n) => fmtNumber(rows[i][n], FMT.general).padEnd(18))
    lines.push(String(i).padEnd(8) + cells.join(''))
  }

  const first = rows[0][names[0]]
  const last = rows[rows.length - 1][names[0]]
  const growth = first !== 0 ? last / first : Infinity

  const notices: string[] = []
  if (Number.isFinite(growth) && Math.abs(growth) > 100 && periods >= 10) {
    notices.push(
      '这个递推在 ' + periods + ' 期内增长了 ' + fmtNumber(growth, FMT.general) +
        ' 倍 —— 指数增长。若这不是预期，检查递推式里的系数。',
    )
  }
  if (overflow) {
    notices.push('数值已接近浮点上限（1e300），后续期数被截断。')
  }

  return {
    result: lines.join('\n'),
    value: { periods, recurrence, rows, growth: Number.isFinite(growth) ? growth : null },
    notice: notices.length > 0 ? notices.join(' ') : undefined,
  }
}
