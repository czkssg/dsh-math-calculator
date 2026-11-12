/**
 * 公式体系链（`systems`）。
 *
 * ## ★ 用 graphology-dag 做拓扑排序，不自己写 DFS
 *
 * 22 条推演链是 DAG（公式 A 的输出是公式 B 的输入）。
 * 拓扑排序 + 环检测是 `graphology-dag` 的现成能力。
 *
 * ## ⚠ 一个关键的认知：链不等于依赖
 *
 * 老插件试过「让工具自动跑完整条链」，实测失败：
 *
 * ```
 *   22 条链 / 259 步，只有 9 步有依赖（3.5%）
 *   sys-energy 19 步 —— 0 条依赖
 * ```
 *
 * 能源链那 19 步是窑炉、锅炉、卡诺、制冷、储热……
 * **这些是并列主题，不构成依赖链**。让一条并列清单顺序执行，
 * 只会得到一堆互相无关的数。
 *
 * 所以本实现的定位是：
 *
 * ```
 *   拓扑排序   只在**真有依赖**时用（`steps[].from` 显式声明输入）
 *   顺序执行   无依赖时按声明顺序跑，不强求拓扑
 * ```
 *
 * @module dsh-math-calculator/features/formulas/systems
 */

import Graph from 'graphology'
import { topologicalSort } from 'graphology-dag'
import type { Engine } from '../../core/engine.js'
import { CalcError } from '../../core/errors.js'
import type { FormulaEntry } from './query.js'
import { evaluateFormula } from './evaluate.js'

/** 链的一步。 */
export interface SystemStep {
  /** 这一步用哪条公式（公式 id）。 */
  formula: string
  /** 这一步叫什么（显示用）。 */
  name?: string
  /**
   * 输入映射：`{ 公式参数: '前一步的输出' 或 数值 }`。
   *
   * 没有 `from` 时，用公式自己的默认值或调用方给的初值。
   */
  inputs?: Record<string, number | string>
  /** 本步输出叫什么（后续步骤引用）。默认用公式 id。 */
  as?: string
}

/** 一条体系链。 */
export interface FormulaSystem {
  id: string
  name: string
  desc?: string
  steps: SystemStep[]
}

/** 链求值结果。 */
export interface SystemOutcome {
  result: string
  value: unknown
  notice?: string
}

/**
 * 从 steps 里推断依赖边。
 *
 * ## 判据
 *
 * 若第 B 步的 `inputs` 里某个值等于第 A 步的 `as`（或公式 id），
 * 则 A → B。
 *
 * @param steps - 步骤
 * @returns 边列表 `[fromIndex, toIndex]`
 */
function inferEdges(steps: SystemStep[]): Array<[number, number]> {
  /** 输出名 → 步骤下标。 */
  const producedBy = new Map<string, number>()
  for (let i = 0; i < steps.length; i += 1) {
    producedBy.set(steps[i].as ?? steps[i].formula, i)
  }

  const edges: Array<[number, number]> = []
  for (let i = 0; i < steps.length; i += 1) {
    const inputs = steps[i].inputs ?? {}
    for (const value of Object.values(inputs)) {
      if (typeof value !== 'string') continue
      const source = producedBy.get(value)
      if (source !== undefined && source !== i) edges.push([source, i])
    }
  }
  return edges
}

/**
 * 求一条体系链。
 *
 * @param engine - 引擎
 * @param formulas - 全部公式（用于查表）
 * @param system - 链
 * @param initial - 初值（覆盖公式默认值）
 * @param displayPrecision - 显示精度
 * @returns 结果
 */
export function evaluateSystem(
  engine: Engine,
  formulas: FormulaEntry[],
  system: FormulaSystem,
  initial: Record<string, number> = {},
  displayPrecision = 8,
): SystemOutcome {
  if (system.steps.length === 0) {
    throw new CalcError('invalid_argument', '这条链没有步骤（' + system.id + '）', '')
  }

  const byId = new Map(formulas.map((f) => [f.id, f]))
  /** 校验每条公式存在。 */
  for (const step of system.steps) {
    if (!byId.has(step.formula)) {
      throw new CalcError(
        'unknown_formula',
        '链「' + system.id + '」引用了不存在的公式「' + step.formula + '」',
        '检查 `steps[].formula` 是否拼错。',
      )
    }
  }

  const edges = inferEdges(system.steps)

  /**
   * ## 有依赖时用拓扑排序，无依赖时按声明顺序
   *
   * 无依赖的链（如能源链 19 步全是并列主题）强行拓扑排序没意义 ——
   * 排序结果只是任意顺序，而声明顺序至少是作者安排的阅读顺序。
   */
  let order: number[]
  let sorted = false
  if (edges.length > 0) {
    const graph = new Graph({ multi: false, type: 'directed' })
    for (let i = 0; i < system.steps.length; i += 1) graph.addNode(String(i))
    for (const [from, to] of edges) {
      /** 去重（同一对可能因多个输入重复）。 */
      if (!graph.hasEdge(String(from), String(to))) graph.addEdge(String(from), String(to))
    }
    try {
      order = topologicalSort(graph).map(Number)
      sorted = true
    } catch (error) {
      throw new CalcError(
        'invalid_argument',
        '链「' + system.id + '」有环，无法按依赖顺序求值',
        '检查 `steps[].inputs` 是否形成了循环引用。' +
          (error instanceof Error ? '（' + error.message.slice(0, 80) + '）' : ''),
      )
    }
  } else {
    order = system.steps.map((_, i) => i)
  }

  /** 逐步求值。 */
  const outputs: Record<string, number> = {}
  const rows: Array<{
    index: number
    step: string
    formula: string
    result: number
    unit: string
  }> = []

  for (const index of order) {
    const step = system.steps[index]
    const entry = byId.get(step.formula)
    if (entry === undefined) continue

    /** 组装 overrides：初值 + 上游输出。 */
    const overrides: Record<string, unknown> = {}
    /** 公式自己的参数名（用于判断哪些 key 合法）。 */
    const paramNames = new Set(Object.keys(entry.params ?? {}))

    /** ① 上游输出（`inputs` 里字符串形式的值指向某个输出名）。 */
    for (const [param, value] of Object.entries(step.inputs ?? {})) {
      if (typeof value === 'string') {
        if (outputs[value] !== undefined) overrides[param] = outputs[value]
      } else {
        overrides[param] = value
      }
    }
    /** ② 调用方初值（同名参数直接套用）。 */
    for (const [key, value] of Object.entries(initial)) {
      if (paramNames.has(key) && overrides[key] === undefined) overrides[key] = value
    }

    const one = evaluateFormula(engine, entry, overrides, displayPrecision, true)
    const numeric = (one.value as { result: number }).result
    const outputName = step.as ?? step.formula
    outputs[outputName] = numeric

    rows.push({
      index,
      step: step.name ?? entry.name,
      formula: step.formula,
      result: numeric,
      unit: entry.unit,
    })
  }

  /** 正文。 */
  const lines: string[] = []
  lines.push('═══ ' + system.name + ' ═══')
  if (system.desc !== undefined && system.desc !== '') lines.push(system.desc)
  lines.push('')
  if (sorted) {
    lines.push('（按依赖顺序求值：' + edges.length + ' 条依赖边）')
  } else {
    lines.push('（无依赖边，按声明顺序求值）')
  }
  lines.push('')
  for (const row of rows) {
    lines.push('  ' + row.step + ' = ' + fmtSciLocal(row.result) +
      (row.unit !== '' ? ' ' + row.unit : ''))
  }

  return {
    result: lines.join('\n'),
    value: {
      id: system.id,
      name: system.name,
      steps: rows.length,
      edges: edges.length,
      sorted,
      outputs,
      rows,
    },
    notice: edges.length === 0
      ? '这条链的步骤之间没有依赖（都是并列主题），结果不能互相印证 —— ' +
        '按声明顺序算只是为了方便阅读。'
      : undefined,
  }
}

/** 局部科学计数格式化（避免引入 format 的全套逻辑）。 */
function fmtSciLocal(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  const abs = Math.abs(value)
  if (abs >= 1e9 || (abs > 0 && abs < 1e-4)) return value.toExponential(6)
  return String(Number(value.toPrecision(8)))
}
