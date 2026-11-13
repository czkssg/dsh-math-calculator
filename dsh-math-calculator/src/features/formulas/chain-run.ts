/**
 * 链的数值传导（阶段 3.3）。
 *
 * ## 现状与边界
 *
 * systems.json 的步骤只有 `{formula, note}`；其中**只有少数**是真数据流
 * （如「自重弯矩 → 弯曲应力」）。其余步骤是并列主题——硬连成依赖链等于
 * 重新发明关系。所以这里只走**显式声明**的 `inputs` 映射：
 *
 * ```jsonc
 * { "formula": "beam_bending_stress",
 *   "inputs": { "M": { "fromStep": 12, "note": "自重弯矩 → 弯曲应力" } } }
 * ```
 *
 * 没声明的参数：用公式默认值，或从 `initial` 里按参数名取。
 * 仍缺 → 报 `missing_params` 并列出该补哪些——不猜、不填 0。
 *
 * @module dsh-math-calculator/features/formulas/chain-run
 */

import { CalcError } from '../../core/errors.js'
import type { Engine } from '../../core/engine.js'
import { callFormula, type FormulaFunction } from './function.js'
import type { FormulaEntry } from './query.js'
import type { RelationIndex } from './relations.js'

/** 一步。 */
export interface ChainStep {
  formula: string
  note?: string
  /** 参数 ← 前序步骤输出。 */
  inputs?: Record<string, { fromStep: number; note?: string }>
}

/** 一条链。 */
export interface ChainSystem {
  id: string
  name: string
  purpose?: string
  steps: ChainStep[]
  notes?: string
}

/** 结果。 */
export interface ChainRunOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 单步结果。 */
export interface ChainStepResult {
  step: number
  formula: string
  name: string
  /** 数值结果（无单位）。 */
  value: number
  unit: string
  /** 本次用到的参数（含来自前序步骤的）。 */
  params: Record<string, number>
  /** 其中来自前序步骤的参数。 */
  linked: Record<string, { fromStep: number; value: number }>
}

/**
 * 跑一条链。
 *
 * @param formulas - 公式库
 * @param systems - 链库
 * @param chainId - 链 id
 * @param engine - 引擎
 * @param initial - 初始参数（按参数名给，会应用到所有步骤）
 * @param index - 关系索引（可空）
 * @returns 每步结果与末端
 * @throws {CalcError} 链/参数缺失
 */
export function runChainNumeric(
  formulas: FormulaEntry[],
  systems: ChainSystem[],
  chainId: string,
  engine: Engine,
  initial: Record<string, number | string> = {},
  index?: RelationIndex,
): ChainRunOutcome {
  const system = systems.find((item) => item.id === chainId || item.name === chainId)
  if (system === undefined) {
    throw new CalcError('unknown_formula', '没有 id 为 "' + chainId + '" 的链', '可查：' + systems.map((item) => item.id).join('、'))
  }
  if (!Array.isArray(system.steps) || system.steps.length === 0) {
    throw new CalcError('invalid_argument', '这条链没有步骤：' + chainId, '')
  }

  const results: ChainStepResult[] = []
  const missingList: Array<{ step: number; formula: string; param: string }> = []

  for (let indexStep = 0; indexStep < system.steps.length; indexStep += 1) {
    const step = system.steps[indexStep]
    const entry = formulas.find((item) => item.id === step.formula)
    if (entry === undefined) {
      throw new CalcError('unknown_formula', '链第 ' + (indexStep + 1) + ' 步引用了不存在的公式：' + step.formula, '')
    }
    /** 参数取值：显式映射 > initial > 默认值。 */
    const values: Record<string, number | string> = {}
    const linked: Record<string, { fromStep: number; value: number }> = {}
    for (const [param, mapping] of Object.entries(step.inputs ?? {})) {
      const source = results[mapping.fromStep - 1]
      if (source === undefined) {
        throw new CalcError(
          'invalid_argument',
          '链第 ' + (indexStep + 1) + ' 步的参数 ' + param + ' 声明来自第 ' + mapping.fromStep + ' 步，但那一步还没跑',
          'inputs.fromStep 必须小于当前步骤号。',
        )
      }
      values[param] = source.value
      linked[param] = { fromStep: mapping.fromStep, value: source.value }
    }
    for (const [param, spec] of Object.entries(entry.params ?? {})) {
      if (values[param] !== undefined) continue
      if (initial[param] !== undefined) {
        values[param] = initial[param]
      } else if (spec.value !== null) {
        values[param] = spec.value
      } else {
        missingList.push({ step: indexStep + 1, formula: entry.id, param })
      }
    }
    if (missingList.length > 0) break

    const call = callFormula(formulas, entry.id, engine, values, index, { terse: true })
    const rawValue = call.value as { result?: number; value?: number }
    const numeric = typeof rawValue?.result === 'number' ? rawValue.result : Number(rawValue?.value)
    if (!Number.isFinite(numeric)) {
      throw new CalcError('non_finite', '链第 ' + (indexStep + 1) + ' 步结果不是有限数（' + entry.id + '）', '')
    }
    results.push({
      step: indexStep + 1,
      formula: entry.id,
      name: entry.name,
      value: numeric,
      unit: entry.unit,
      params: Object.fromEntries(Object.entries(call.substituted)),
      linked,
    })
  }

  if (missingList.length > 0) {
    throw new CalcError(
      'missing_params',
      '这条链还缺 ' + missingList.length + ' 个初始参数：' + missingList.map((item) => item.param + '（第 ' + item.step + ' 步 ' + item.formula + '）').join('、'),
      '用 initial 按参数名补，例如 {' + missingList.slice(0, 3).map((item) => item.param + ':1').join(', ') + '}。',
    )
  }

  const lines: string[] = ['═══ 链数值传导：' + system.name + ' ═══', '']
  lines.push('  说明：只走显式声明的数据流；其余步骤用默认值或 initial 参数。', '')
  lines.push('  步  公式                        结果        单位            来自前序')
  for (const item of results) {
    const linkedText = Object.entries(item.linked).map(([param, source]) => param + '←第' + source.fromStep + '步').join(',')
    lines.push('  ' + String(item.step).padEnd(3) + item.formula.padEnd(28) + String(Number(item.value.toPrecision(8))).padEnd(12) + item.unit.padEnd(16) + linkedText)
  }
  const last = results[results.length - 1]
  lines.push('', '末端：' + last.name + ' = ' + Number(last.value.toPrecision(8)) + ' ' + last.unit)
  const linkedSteps = results.filter((item) => Object.keys(item.linked).length > 0).map((item) => item.step)
  if (linkedSteps.length > 0) lines.push('数据流步骤：' + linkedSteps.map((step) => '第' + step + '步').join('、') + '（其余是并列主题，不是依赖）')

  return {
    result: lines.join('\n'),
    value: { chain: system.id, steps: results, terminal: last, linkedSteps },
  }
}
