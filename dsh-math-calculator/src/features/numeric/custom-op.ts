/**
 * `custom`：定义/列出自创常数与新物理量。
 *
 * 有的架空设定靠调现有参数做不出来，必须引入现实没有的量。
 * 这个 operation 让 AI 能自主定义它们，并**强制带量纲**——
 * 否则公式会悄悄算错，等推演跑完才发现结果离谱。
 *
 * 子命令：list / add / remove / check。
 *
 * @module dsh-math-calculator/features/numeric/custom-op
 */

import { CalcError } from '../../core/errors.js'
import { currentWorkspace, switchWorkspace } from '../workspace.js'
import { loadWorkspaceFile, saveWorkspaceFile } from '../../io/workspace-store.js'
import {
  BASE_DIMENSIONS,
  buildCustomConstant,
  checkDimension,
  dimensionText,
  resolveCustomConstants,
  sameDimension,
  validateCustomConstant,
  type CustomConstant,
  type Dimension,
} from './custom-constants.js'
import { standardValues } from '../deduction/constants-graph.js'

/** 结果。 */
export interface CustomOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 数字渲染。 */
function sci(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs !== 0 && (abs >= 1000 || abs < 1e-3)) return value.toExponential(2)
  return Number(value.toPrecision(5)).toString()
}

/**
 * 执行 custom。
 *
 * @param input - 子命令与参数
 * @returns 结果
 * @throws {CalcError} 定义不合法
 */
export function runCustom(input: {
  customAction?: string
  customConstant?: unknown
  customConstantName?: string
  expression?: string
  expectedDimension?: Dimension
  workspace?: string
} = {}): CustomOutcome {
  const sub = typeof input.customAction === 'string' && input.customAction.trim() !== '' ? input.customAction.trim() : 'list'
  const workspace = currentWorkspace()
  if (input.workspace !== undefined && input.workspace.trim() !== '') switchWorkspace(input.workspace)
  const out: string[] = []
  const value: Record<string, unknown> = { subcommand: sub, workspace }

  if (sub === 'list') {
    const data = loadWorkspaceFile(workspace)
    const customs = data.customConstants as unknown as CustomConstant[]
    const resolved = resolveCustomConstants(customs, standardValues())
    out.push('═══ 本工作区的自创量（' + workspace + '）═══', '')
    if (customs.length === 0) {
      out.push('  （还没有自创量）', '')
      out.push('什么时候需要：现有参数怎么调都做不出想要的效果时。')
      out.push('例如想让超光速通信可行 → 定义一个叫 aetherPressure 的量。')
    } else {
      out.push('  量名            中文          当前值        单位        量纲')
      for (const item of customs) {
        out.push('  ' + item.name.padEnd(16) + item.label.padEnd(14) + sci((resolved.values as Record<string, number>)[item.name]).padStart(13) + '  ' + item.unit.padEnd(11) + ' ' + dimensionText(item.dimension))
        out.push('    来源=' + (item.origin === 'author' ? '作者设定' : '派生（' + (item.dependsOn ?? []).join(', ') + '）') + '  含义：' + item.meaning)
      }
    }
    if (resolved.errors.length > 0) {
      out.push('', '⚠ 求解问题：')
      for (const error of resolved.errors) out.push('  · ' + error)
    }
    value['customs'] = customs.map((item) => ({ ...item, currentValue: (resolved.values as Record<string, number>)[item.name], dimensionText: dimensionText(item.dimension) }))
  } else if (sub === 'add') {
    const errors = validateCustomConstant(input.customConstant)
    if (errors.length > 0) {
      out.push('═══ 定义不合法 ═══', '')
      for (const error of errors) out.push('  ✗ ' + error)
      out.push('', '必须提供的字段：name / label / value / unit / meaning / dimension / origin')
      out.push('dimension 用七个基本分量的指数表示，例如压力是 { M: 1, L: -1, T: -2 }')
      return { result: out.join('\n'), value: { errors } }
    }
    const item = input.customConstant as Record<string, unknown>
    const constant: CustomConstant = buildCustomConstant(item)
    const data = loadWorkspaceFile(workspace)
    const rest = (data.customConstants as unknown as CustomConstant[]).filter((existing) => existing.name !== constant.name)
    saveWorkspaceFile({ ...data, customConstants: [...rest, constant] as unknown as Array<Record<string, unknown>> })
    out.push('═══ 已定义自创量 ═══', '')
    out.push('  ' + constant.name + '（' + constant.label + '）= ' + sci(constant.value) + ' ' + constant.unit)
    out.push('  量纲：' + dimensionText(constant.dimension))
    out.push('  含义：' + constant.meaning, '')
    out.push('它现在可以被本区的自定义公式引用，也可以参与推演判定。')
    value['custom'] = constant
  } else if (sub === 'remove') {
    const name = typeof input.customConstantName === 'string' ? input.customConstantName : ''
    if (name === '') throw new CalcError('missing_params', 'custom remove 需要 customConstantName', '例如 {customAction:"remove", customConstantName:"aetherPressure"}。')
    const data = loadWorkspaceFile(workspace)
    const customs = data.customConstants as unknown as CustomConstant[]
    const kept = customs.filter((item) => item.name !== name)
    const removed = kept.length !== customs.length
    if (removed) saveWorkspaceFile({ ...data, customConstants: kept as unknown as Array<Record<string, unknown>> })
    out.push(removed ? '已删除 ' + name : '没有找到 ' + name)
    value['removed'] = removed
  } else if (sub === 'check') {
    const expression = typeof input.expression === 'string' ? input.expression : ''
    if (expression === '') throw new CalcError('missing_params', 'custom check 需要 expression（要检查的公式）', '例如 {customAction:"check", expression:"m*g*h"}。')
    const data = loadWorkspaceFile(workspace)
    const dimensions: Record<string, Dimension> = {}
    for (const item of data.customConstants as unknown as CustomConstant[]) dimensions[item.name] = item.dimension
    Object.assign(dimensions, BASE_DIMENSIONS)
    const result = checkDimension(expression, dimensions, input.expectedDimension)
    /** 未知量是硬错误（T7-N8 族：用户错误必须给出可执行错误类型，不是 ok=true）。 */
    const unknownSymbol = result.problems.find((problem) => problem.includes('未知量'))
    if (unknownSymbol !== undefined) {
      throw new CalcError('unknown_symbol', unknownSymbol, '先用 custom add 定义它的量纲，或改用已有量纲名称（mass/length/time/…）。')
    }
    out.push('═══ 量纲检查 ═══', '')
    out.push('  表达式：' + expression)
    out.push('  结果量纲：' + dimensionText(result.resultDimension), '')
    if (input.expectedDimension) {
      out.push('  期望量纲：' + dimensionText(input.expectedDimension))
      if (result.ok) out.push('  ✓ 与期望一致')
      else {
        out.push('  ✗ 与期望不一致：')
        for (const problem of result.problems) out.push('    · ' + problem)
      }
    } else {
      out.push('  ⚠ 未指定期望量纲，无法判定对错。')
      out.push('  结果量纲 ' + dimensionText(result.resultDimension) + ' 对照常见量：')
      const targets: Array<[string, Dimension]> = [
        ['力', { M: 1, L: 1, T: -2 }],
        ['能量', { M: 1, L: 2, T: -2 }],
        ['功率', { M: 1, L: 2, T: -3 }],
        ['压力', { M: 1, L: -1, T: -2 }],
        ['速度', { L: 1, T: -1 }],
        ['密度', { M: 1, L: -3 }],
        ['频率', { T: -1 }],
      ]
      let matched = false
      for (const pair of targets) {
        if (sameDimension(result.resultDimension, pair[1])) {
          out.push('    → 这看起来是「' + pair[0] + '」')
          matched = true
        }
      }
      if (!matched) out.push('    → 没有匹配到常见量，可能是自创量的组合')
      out.push('', '想要严格判定请传 expectedDimension，例如 {"M":1,"L":-1,"T":-2} 表示压力。')
    }
    if (result.problems.length > 0) {
      out.push('')
      for (const problem of result.problems) out.push('  · ' + problem)
    }
    value['check'] = result
  } else {
    throw new CalcError('unknown_argument', '不认识的 custom 子命令「' + sub + '」', '可用：list / add / remove / check。')
  }

  return { result: out.join('\n'), value }
}
