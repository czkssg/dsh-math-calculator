/**
 * operation="custom" 的实现：定义/列出自创常数与新物理量。
 *
 * @module dsh-math-calculator/ops/custom-op
 * @description
 * 有的架空设定靠调现有参数做不出来，必须引入现实没有的量。
 * 这个 operation 让 AI 能自主定义它们，并**强制带量纲**——
 * 否则公式会悄悄算错，等推演跑完才发现结果离谱。
 */

import {
  validateCustomConstant,
  resolveCustomConstants,
  checkDimension,
  dimensionText,
  BASE_DIMENSIONS,
  sameDimension,
  type CustomConstant,
  type Dimension,
} from '../custom-constants.js'
import { standardValues } from '../constants-graph.js'
import { currentWorkspace, loadWorkspace, updateWorkspace } from '../workspace.js'
import { toJsonValue } from '../format.js'
import type { MathArgs, Outcome } from './shared.js'

/** 数字格式化。 */
function sci(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs === 0) return '0'
  if (abs >= 1e5 || abs < 1e-3) return value.toExponential(3)
  return Number(value.toPrecision(5)).toString()
}

/**
 * `custom`：自创常数 / 新物理量。
 *
 * 子命令：list（列出）/ add（新增）/ remove（删除）/ check（量纲检查）。
 *
 * @param args - 工具参数
 * @returns 统一结果
 */
export function opCustom(args: MathArgs): Outcome {
  const sub = typeof args.customAction === 'string' ? args.customAction : 'list'
  const workspace = currentWorkspace()
  const out: string[] = []
  const value: Record<string, unknown> = { subcommand: sub, workspace: workspace }

  if (sub === 'list') {
    const data = loadWorkspace(workspace)
    const customs = data.customConstants ?? []
    const resolved = resolveCustomConstants(customs, standardValues())
    out.push('═══ 本工作区的自创量（' + workspace + '）═══', '')
    if (customs.length === 0) {
      out.push('  （还没有自创量）', '')
      out.push('什么时候需要：现有参数怎么调都做不出想要的效果时。')
      out.push('例如想让超光速通信可行 → 定义一个叫 aetherPressure 的量。')
    } else {
      out.push('  量名            中文          当前值        单位        量纲')
      for (const item of customs) {
        out.push('  ' + item.name.padEnd(16) + item.label.padEnd(14) +
          sci(resolved.values[item.name]).padStart(13) + '  ' + item.unit.padEnd(11) + ' ' +
          dimensionText(item.dimension))
        out.push('    来源=' + (item.origin === 'author' ? '作者设定' : '派生（' + (item.dependsOn || []).join(', ') + '）') + '  含义：' + item.meaning)
      }
    }
    if (resolved.errors.length > 0) {
      out.push('', '⚠ 求解问题：')
      for (const err of resolved.errors) out.push('  · ' + err)
    }
    value.customs = customs.map(function (item) {
      return { ...item, currentValue: resolved.values[item.name], dimensionText: dimensionText(item.dimension) }
    })
  } else if (sub === 'add') {
    const input = (args as unknown as Record<string, unknown>).customConstant
    const errors = validateCustomConstant(input)
    if (errors.length > 0) {
      out.push('═══ 定义不合法 ═══', '')
      for (const err of errors) out.push('  ✗ ' + err)
      out.push('', '必须提供的字段：name / label / value / unit / meaning / dimension / origin')
      out.push('dimension 用七个基本分量的指数表示，例如压力是 { M: 1, L: -1, T: -2 }')
      return { result: out.join('\n'), value: toJsonValue({ errors: errors }) }
    }
    const item = input as Record<string, unknown>
    const custom: CustomConstant = {
      name: String(item.name),
      label: String(item.label),
      value: Number(item.value),
      unit: String(item.unit),
      dimension: item.dimension as Dimension,
      meaning: String(item.meaning),
      origin: item.origin === 'derived' ? 'derived' : 'author',
      ...(Array.isArray(item.dependsOn) ? { dependsOn: item.dependsOn.map(String) } : {}),
      ...(typeof item.derive === 'string' ? { derive: item.derive } : {}),
      createdAt: new Date().toISOString(),
    }
    updateWorkspace(workspace, function (current) {
      const rest = (current.customConstants ?? []).filter(function (existing) {
        return existing.name !== custom.name
      })
      return { ...current, customConstants: [...rest, custom] }
    })
    out.push('═══ 已定义自创量 ═══', '')
    out.push('  ' + custom.name + '（' + custom.label + '）= ' + sci(custom.value) + ' ' + custom.unit)
    out.push('  量纲：' + dimensionText(custom.dimension))
    out.push('  含义：' + custom.meaning, '')
    out.push('它现在可以被本区的自定义公式引用，也可以参与推演判定。')
    value.custom = custom
  } else if (sub === 'remove') {
    const constantName = typeof args.customConstantName === 'string' ? args.customConstantName : ''
    if (constantName === '') {
      out.push('缺 customConstantName')
    } else {
      let removed = false
      updateWorkspace(workspace, function (current) {
        const kept = (current.customConstants ?? []).filter(function (item) {
          if (item.name === constantName) {
            removed = true
            return false
          }
          return true
        })
        return { ...current, customConstants: kept }
      })
      out.push(removed ? '已删除 ' + constantName : '没有找到 ' + constantName)
      value.removed = removed
    }
  } else if (sub === 'check') {
    const expression = typeof args.expression === 'string' ? args.expression : ''
    if (expression === '') {
      out.push('缺 expression（要检查的公式）')
    } else {
      const data = loadWorkspace(workspace)
      const dimensions: Record<string, Dimension> = {}
      for (const item of data.customConstants ?? []) dimensions[item.name] = item.dimension
      Object.assign(dimensions, BASE_DIMENSIONS)
      const expected = (args as unknown as Record<string, unknown>).expectedDimension as Dimension | undefined
      const result = checkDimension(expression, dimensions, expected)
      out.push('═══ 量纲检查 ═══', '')
      out.push('  表达式：' + expression)
      out.push('  结果量纲：' + dimensionText(result.resultDimension))
      out.push('')
      if (expected) {
        // 给了期望量纲：这才叫「检查」，能抓出算错。
        out.push('  期望量纲：' + dimensionText(expected))
        if (result.ok) {
          out.push('  ✓ 与期望一致')
        } else {
          out.push('  ✗ 与期望不一致：')
          for (const problem of result.problems) out.push('    · ' + problem)
        }
      } else {
        // 没给期望：不能判对错，只能报告结果量纲并提示可能是哪个常见量。
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
        out.push('')
        out.push('想要严格判定请传 expectedDimension，例如 {"M":1,"L":-1,"T":-2} 表示压力。')
      }
      if (result.problems.length > 0) {
        out.push('')
        for (const problem of result.problems) out.push('  · ' + problem)
      }
      value.check = result
    }
  } else {
    out.push('未知子命令：' + sub)
    out.push('可用：list / add / remove / check')
  }

  return { result: out.join('\n'), value: toJsonValue(value) }
}
