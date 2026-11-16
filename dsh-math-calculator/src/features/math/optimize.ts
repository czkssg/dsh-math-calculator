/**
 * 线性规划 / 整数规划：把「资源怎么配最优」变成可解。
 *
 * ## 为什么引入（开源检索结论）
 *
 * 「硬核推演」缺的是**优化**：给定有限资源（劳动力/钢材/粮食），怎么配比产出最大？
 * 这不是公式能答的，是线性规划。
 *
 * 选型：
 * - **javascript-lp-solver** 1.0.3（Unlicense，LP/MIP 单纯形法）——✅ 用
 * - glpk.js 5.0.0（**GPL-3.0**）——❌ 传染许可，不用
 * - YALPS（106★，TS 重写）——备选
 *
 * @module dsh-math-calculator/features/math/optimize
 */

import { CalcError } from '../../core/errors.js'
import lpSolver from 'javascript-lp-solver'

/** 输入。 */
export interface OptimizeInput {
  /** 目标名。 */
  objective?: string
  /** 最大化 / 最小化。 */
  opType?: 'max' | 'min'
  /** 约束：{ 资源名: { max: 数量, min?: 数量 } }。 */
  constraints: Record<string, { max?: number; min?: number }>
  /** 变量及其系数：{ 变量名: { 资源名: 消耗, 目标?: 贡献 } }。 */
  variables: Record<string, Record<string, number>>
  /** 是否整数规划。 */
  integers?: string[]
}

/** 结果。 */
export interface OptimizeResult {
  feasible: boolean
  bounded: boolean
  /** 最优目标值。 */
  result: number | null
  /** 变量取值。 */
  values: Record<string, number>
  notes: string[]
}

/**
 * 求解线性规划。
 *
 * @param input - 目标/约束/变量
 * @returns 结果
 * @throws {CalcError} 输入非法
 */
export function optimize(input: OptimizeInput): OptimizeResult {
  if (input.constraints === undefined || Object.keys(input.constraints).length === 0) throw new CalcError('invalid_argument', '需要 constraints（资源约束）', '')
  if (input.variables === undefined || Object.keys(input.variables).length === 0) throw new CalcError('invalid_argument', '需要 variables（变量与系数）', '')
  const objective = input.objective ?? 'objective'
  const opType = input.opType ?? 'max'
  const names = Object.keys(input.variables)
  for (const name of names) {
    const coefficients = input.variables[name]
    for (const [resource, value] of Object.entries(coefficients)) {
      if (resource === '目标' || resource === objective) continue
      if (input.constraints[resource] === undefined) throw new CalcError('invalid_argument', '变量「' + name + '」用了未声明的资源「' + resource + '」', '先把它写进 constraints。')
      if (!(value >= 0)) throw new CalcError('invalid_argument', '系数必须为非负（' + name + '.' + resource + '）', '')
    }
  }
  const constraints: Record<string, unknown> = {}
  for (const [resource, limit] of Object.entries(input.constraints)) constraints[resource] = { ...limit }
  const model = {
    optimize: objective,
    opType,
    constraints,
    variables: input.variables,
    ...(Array.isArray(input.integers) && input.integers.length > 0 ? { ints: Object.fromEntries(input.integers.map((name) => [name, 1])) } : {}),
  }
  const solved = (lpSolver as { Solve: (model: unknown) => Record<string, unknown> }).Solve(model)
  const feasible = solved['feasible'] === true
  const bounded = solved['bounded'] !== false
  const result = typeof solved['result'] === 'number' ? (solved['result'] as number) : null
  const values: Record<string, number> = {}
  for (const name of names) {
    const value = solved[name]
    values[name] = typeof value === 'number' ? value : 0
  }
  const notes: string[] = []
  notes.push(opType === 'max' ? '最大化「' + objective + '」' : '最小化「' + objective + '」')
  if (!feasible) notes.push('无可行解：约束互相冲突（如某资源上限低于最低需求）')
  else if (!bounded) notes.push('无界解：目标可以无限增大（缺少关键约束）')
  else notes.push('最优值 ' + (result ?? 0).toFixed(4) + '；' + names.map((name) => name + '=' + values[name].toFixed(2)).join('，'))
  return { feasible, bounded, result, values, notes }
}
