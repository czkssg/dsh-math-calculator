/**
 * operation="ode" 的实现。
 *
 * 从 index.ts 原样迁出（纯搬迁：逻辑、错误消息、输出文本逐字未改）。
  *
 * @module dsh-math-calculator/ops/ode-op
*/

import { OdeError, parseOdeSystem, solveOde, type OdeSolution } from '../ode.js'
import { CalcError, fast, normalizeSource, trimNumber, type MathArgs, type Outcome } from './shared.js'

/**
 * `ode`：数值求解常微分方程初值问题。
 *
 * 用 RK4 定步长积分。支持一阶方程组与二阶方程（自动降阶）。
 * 这是对「解微分方程做不到」这一结论的修正 ——
 * mathjs 没有现成的表达式级 ODE 求解器，但算法本身很标准，自己实现即可。
 */
export function opOde(args: MathArgs, engine: any, precision: number): Outcome {
  const text = normalizeSource(args.expression ?? '')
  if (text === '') {
    throw new CalcError(
      'invalid_argument',
      '需要微分方程',
      '写成 dy/dt = ... 的形式，多条方程用逗号分隔。例："dS/dt = -0.3*S*I, dI/dt = 0.3*S*I - 0.1*I, dR/dt = 0.1*I"',
    )
  }

  let system
  try {
    system = parseOdeSystem(text)
  } catch (error) {
    if (error instanceof OdeError) throw new CalcError(error.type, error.message, '左侧必须是导数形式，如 dy/dt 或 d^2y/dt^2。')
    throw error
  }

  const initial = (args.initial ?? {}) as Record<string, number>
  const from = typeof args.from === 'number' ? args.from : 0
  const to = typeof args.to === 'number' ? args.to : 10
  const steps = typeof args.steps === 'number' ? Math.min(1_000_000, Math.max(1, Math.round(args.steps))) : 1000
  const sampleLimit = typeof args.samples === 'number' ? Math.max(2, Math.min(200, Math.round(args.samples))) : 24

  let solution: OdeSolution
  try {
    // 关键：数值积分必须用 Number 引擎，不能用 BigNumber 引擎。
    // RK4 的中间值天然带 15 位以上小数（如 1.0050251567199238），
    // BigNumber 会抛 "Cannot implicitly convert a number with >15 significant digits"。
    // 数值 ODE 本身就只精度到 ~1e-12，用 BigNumber 毫无意义且必然失败。
    solution = solveOde(fast(), system, { initial, from, to, steps, sampleLimit })
  } catch (error) {
    if (error instanceof OdeError) {
      const hint =
        error.type === 'missing_initial'
          ? `需要为这些变量给初值: ${system.stateVariables.join(', ')}。例如 {"${system.stateVariables[0]}": 1}`
          : error.type === 'evaluation'
            ? '检查导数表达式里的符号是否都已定义，以及是否出现除以零等奇点。'
            : undefined
      throw new CalcError(error.type, error.message, hint)
    }
    throw error
  }

  // 组织输出文本
  const lines: string[] = []
  const shownVariables = system.stateVariables.filter((name) => !system.introducedVariables.includes(name))

  lines.push(`求解 ${system.equations.length} 条方程，自变量 ${system.independent}`)
  if (system.introducedVariables.length > 0) {
    lines.push(`（二阶方程已降阶，引入辅助变量 ${system.introducedVariables.join(', ')}）`)
  }
  lines.push(`积分区间 [${from}, ${to}]，步数 ${steps}，步长 ${trimNumber(solution.stepSize, 6)}`)
  lines.push('')

  // 采样表
  const header = [system.independent.padEnd(12), ...shownVariables.map((name) => name.padStart(14))]
  lines.push(header.join(' '))
  lines.push('-'.repeat(header.join(' ').length))
  for (const sample of solution.samples) {
    const cells = [
      trimNumber(sample.t, 6).padEnd(12),
      ...shownVariables.map((name) => trimNumber(sample.values[name] ?? Number.NaN, 6).padStart(14)),
    ]
    lines.push(cells.join(' '))
  }

  lines.push('')
  lines.push('终点值:')
  for (const name of shownVariables) {
    lines.push(`  ${name}(${trimNumber(to, 6)}) = ${trimNumber(solution.final[name] ?? Number.NaN, precision)}`)
  }

  lines.push('')
  lines.push('极值:')
  for (const name of shownVariables) {
    const extreme = solution.extremes[name]
    if (!extreme || !Number.isFinite(extreme.max)) continue
    lines.push(
      `  ${name}: 最大 ${trimNumber(extreme.max, precision)} @ ${system.independent}=${trimNumber(extreme.maxAt, 6)}，` +
        `最小 ${trimNumber(extreme.min, precision)} @ ${system.independent}=${trimNumber(extreme.minAt, 6)}`,
    )
  }

  if (solution.warnings.length > 0) {
    lines.push('')
    lines.push('⚠ 警告:')
    for (const warning of solution.warnings) lines.push(`  ${warning}`)
  }

  return {
    result: lines.join('\n'),
    value: {
      variables: shownVariables,
      independent: system.independent,
      from,
      to,
      steps,
      stepSize: solution.stepSize,
      final: solution.final,
      extremes: solution.extremes,
      samples: solution.samples.map((sample) => ({
        t: sample.t,
        ...Object.fromEntries(shownVariables.map((name) => [name, sample.values[name]])),
      })),
      warnings: solution.warnings,
    },
  }
}
