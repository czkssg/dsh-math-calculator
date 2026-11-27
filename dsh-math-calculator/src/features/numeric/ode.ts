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
import { all, create } from 'mathjs'
import type { Engine } from '../../core/engine.js'
import { CalcError } from '../../core/errors.js'
import { fmtNumber, FMT } from '../../core/format.js'

/**
 * 浮点求值实例（ODE 专用）。
 *
 * ## 为什么不用 `Engine`
 *
 * RK4 主循环本身就是浮点运算，而 `Engine` 走 BigNumber：
 * 每一步、每个状态都要一次 BigNumber 求值。2000 步 × 4 阶 × 3 状态
 * （SIR）= 2.4 万次，实测 **29 秒**；换成浮点实例并预编译表达式后 < 1 秒。
 *
 * 数值上不损失：RK4 的截断误差远大于 15 位有效数字，BigNumber 在这条路径上
 * 没有收益，只会把「能算」变成「算不完」。
 */
const floatMath = create(all, { number: 'number', precision: 64 })

/** ODE 结果。 */
export interface OdeOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 解析后的方程组。 */
interface ParsedOde {
  /** 自变量名（`t`，或 `dy/dx` 里的 `x`）。 */
  variable: string
  /** 状态名 → 导数右端表达式。 */
  derivatives: Record<string, string>
}

/**
 * 解析一条或多条一阶导数方程。
 *
 * ## 支持四种写法（都是 help 里承诺过的）
 *
 * ```
 *   dy/dt = -0.5*y              单状态、斜杠形式
 *   y' = -0.5*y                 单状态、撇号形式
 *   S'=-k1*S*I; I'=k1*S*I-k2*I  多状态、分号分隔（help 的写法）
 *   dS/dt=..., dI/dt=...        多状态、逗号分隔（早期文档的写法）
 * ```
 *
 * **2026-11-27 修复**：此前正则带 `^...$` 只认第一条，
 * 右端贪婪吃掉后面所有方程，于是多状态永远"发散"（每个状态都在求同一个导数）。
 * 现在按「条目起点」切分，而不是按分隔符切分——右端可能含
 * `min(a, b)` 这类函数参数逗号，简单 split 会切坏。
 *
 * @param expression - 方程串
 * @returns 自变量与各状态的导数
 * @throws {CalcError} 缺等号、右端为空、同一状态重复定义、变量不一致
 */
function parseOde(expression: string): ParsedOde {
  const source = expression.trim()
  if (source === '') {
    throw new CalcError('syntax', 'ode 需要 expression（方程）', '例如 `dy/dt = -0.5*y`。')
  }
  /** 条目起点：d<状态>/d<变量>= 或 <状态>'= */
  const marker = /\b(?:d([A-Za-z][A-Za-z0-9_]*)\s*\/\s*d([A-Za-z][A-Za-z0-9_]*)|([A-Za-z][A-Za-z0-9_]*)\s*')\s*=/g
  const entries: Array<{ start: number; body: number; state: string; variable?: string }> = []
  for (let match = marker.exec(source); match !== null; match = marker.exec(source)) {
    entries.push({
      start: match.index,
      body: marker.lastIndex,
      state: match[1] ?? match[3] ?? '',
      variable: match[2] ?? undefined,
    })
  }
  if (entries.length === 0) {
    throw new CalcError(
      'syntax',
      '方程 "' + source + '" 缺少等号，应为 dy/dt = ... 形式',
      "例如 `dy/dt = -0.5*y` 或 `y' = -0.5*y`。",
    )
  }
  const derivatives: Record<string, string> = {}
  const variables = new Set<string>()
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry === undefined) continue
    const next = entries[index + 1]
    const end = next !== undefined ? next.start : source.length
    const rhs = source.slice(entry.body, end).replace(/[;,]$/, '').trim().replace(/[;,]$/, '')
    if (rhs === '') {
      throw new CalcError('syntax', '状态「' + entry.state + '」的方程缺右端表达式', '等号右边不能为空。')
    }
    if (derivatives[entry.state] !== undefined) {
      throw new CalcError('syntax', '状态「' + entry.state + '」定义了两次', '每个状态只能有一条一阶导数方程。')
    }
    derivatives[entry.state] = rhs
    if (entry.variable !== undefined) variables.add(entry.variable)
  }
  if (variables.size > 1) {
    throw new CalcError('syntax', '多条方程的导数变量不一致：' + [...variables].join(' / '), '同一个方程组必须对同一个变量求导。')
  }
  return { variable: [...variables][0] ?? 't', derivatives }
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
  samples = 24,
  at?: number[],
): OdeOutcome {
  const { variable, derivatives } = parseOde(expression)

  const stateNames = Object.keys(initial).filter((k) => k !== variable)
  if (stateNames.length === 0) {
    throw new CalcError(
      'missing_params',
      'initial 里要有状态变量（如 {y: 100}）',
      '方程 `dy/dt = ...` 需要 y 的初值。',
    )
  }
  /** 方程出现但没给初值 → 明确报缺哪个，不能默认 0 静默算出另一条曲线。 */
  const missingInitial = Object.keys(derivatives).filter((name) => initial[name] === undefined)
  if (missingInitial.length > 0) {
    throw new CalcError(
      'missing_params',
      'initial 缺状态「' + missingInitial.join('、') + '」的初值',
      '方程里的每个状态都要在 initial 里给初值，例如 {S:999, I:1, R:0}。',
    )
  }
  /** 给了初值却没有对应方程 → 同样是错的（不会自己演化）。 */
  const missingEquation = stateNames.filter((name) => derivatives[name] === undefined)
  if (missingEquation.length > 0) {
    throw new CalcError(
      'syntax',
      '状态「' + missingEquation.join('、') + '」没有对应的一阶导数方程',
      '每条状态都要写一条方程，例如 d' + missingEquation[0] + "/dt = ...。",
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
      const compiledExpression = compiled[i]
      if (compiledExpression === undefined) {
        dydt[i] = NaN
        continue
      }
      try {
        const v = Number(compiledExpression.evaluate(scope))
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

  /** 预编译各状态的导数：每步只求值、不重新解析。 */
  const compiled = stateNames.map((name) => {
    const rightSide = derivatives[name] as string
    try {
      return floatMath.compile(rightSide)
    } catch {
      throw new CalcError('syntax', '方程「' + name + '」的右端无法解析：' + rightSide, '检查括号、函数名与运算符。')
    }
  })

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
  /** 每步跟踪极值：不受采样密度影响，能回答「第几步达峰、峰值多少」。 */
  const extrema: Record<string, { max: number; maxT: number; min: number; minT: number }> = {}
  for (let i = 0; i < stateNames.length; i += 1) {
    const name = stateNames[i]
    if (name === undefined) continue
    const start = y0[i] as number
    extrema[name] = { max: start, maxT: from, min: start, minT: from }
  }
  /** 请求的精确时点（`at`）：不在步上就线性插值，保证「第 3 周」对得上。 */
  const requested = Array.isArray(at)
    ? [...new Set(at.filter((value) => Number.isFinite(value) && value >= from && value <= to))].sort((left, right) => left - right)
    : []
  const atPoints: Array<{ t: number; values: Record<string, number> }> = []
  let nextAt = 0
  let previous: { t: number; y: number[] } = { t: from, y: y0.slice() }
  let diverged = false

  for (let step = 1; step <= steps; step += 1) {
    integrator.step()
    const y = integrator.y as number[]
    if (y.some((v) => !Number.isFinite(v))) {
      diverged = true
      break
    }
    const currentT = integrator.t as number
    for (let i = 0; i < stateNames.length; i += 1) {
      const value = y[i] as number
      const slot = extrema[stateNames[i] as string]
      if (slot === undefined) continue
      if (value > slot.max) {
        slot.max = value
        slot.maxT = currentT
      }
      if (value < slot.min) {
        slot.min = value
        slot.minT = currentT
      }
    }
    while (nextAt < requested.length && (requested[nextAt] as number) <= currentT) {
      const target = requested[nextAt] as number
      const span = currentT - previous.t
      const ratio = span > 0 ? (target - previous.t) / span : 0
      const values: Record<string, number> = {}
      for (let i = 0; i < stateNames.length; i += 1) {
        const before = previous.y[i] as number
        const after = y[i] as number
        values[stateNames[i] as string] = before + (after - before) * ratio
      }
      atPoints.push({ t: target, values })
      nextAt += 1
    }
    previous = { t: currentT, y: y.slice() }
    if (step % sampleEvery === 0 || step === steps) {
      record(currentT, y)
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
      extrema,
      at: atPoints.map((p) => ({ t: p.t, ...p.values })),
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

  /**
   * 预编译递推式并走浮点实例。
   *
   * 与 ODE 同因：`Engine` 走 BigNumber，而浮点递推的中间结果必然超过 15 位有效数字
   * （如 `D*(1+0.02)-5` 第 30 期会撞上限），BigNumber 直接抛
   * 「Cannot implicitly convert a number with >15 significant digits」。
   * 递推本身就是浮点迭代，换浮点实例既正确又快。
   */
  let compiled: { evaluate: (scope: Record<string, number>) => unknown }
  try {
    compiled = floatMath.compile(recurrence)
  } catch {
    throw new CalcError('syntax', '递推式无法解析：' + recurrence, '检查括号、函数名与运算符。')
  }

  for (let period = 1; period <= periods; period += 1) {
    const scope: Record<string, number> = {}
    for (const name of names) scope[name] = Number(state[name])
    const next: Record<string, number> = {}
    for (const name of names) {
      const v = Number(compiled.evaluate(scope))
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

  /**
   * 连续 vs 离散（T6-14）。
   *
   * 离散递推按「期」跳，连续模型按「时间」走；同一增长率两边数值不同：
   * 离散 r_d，连续 r_c = ln(1+r_d)。这里按首末期给平均增长率并标出差额。
   * 近似：只反映首末两点，不反映中间路径（有波动时只作量级参考）。
   */
  const steps = Math.max(1, periods)
  const discreteRate = first !== 0 && last / first > 0 ? Math.pow(last / first, 1 / steps) - 1 : Number.NaN
  const continuousRate = first > 0 && last > 0 ? Math.log(last / first) / steps : Number.NaN
  if (Number.isFinite(discreteRate) && Number.isFinite(continuousRate)) {
    lines.push(
      '',
      '连续 vs 离散（按首末期平均，近似）：',
      '  离散增长率 ' + (discreteRate * 100).toFixed(4) + '%/期',
      '  连续等效增长率 ' + (continuousRate * 100).toFixed(4) + '%/期',
      '  差额 ' + ((continuousRate - Math.log1p(discreteRate)) * 100).toFixed(6) + '%（≈ ln(1+r_d) 与 r_d 的差）',
    )
  }

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
    value: {
      periods,
      recurrence,
      rows,
      growth: Number.isFinite(growth) ? growth : null,
      discreteRate: Number.isFinite(discreteRate) ? discreteRate : null,
      continuousRate: Number.isFinite(continuousRate) ? continuousRate : null,
    },
    notice: notices.length > 0 ? notices.join(' ') : undefined,
  }
}
