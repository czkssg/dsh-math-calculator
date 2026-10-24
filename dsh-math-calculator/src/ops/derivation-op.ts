/**
 * operation="derivation" 的实现：推演栈框架。
 *
 * @module dsh-math-calculator/ops/derivation-op
 * @description
 * 这不是又一种计算，而是**把计算组织成可管理的方法论**：展示推演栈、
 * 接口卡、无量纲化、单位重定义检测、敏感性、相图、检查表、七个表。
 *
 * 子命令由 args.derivation 选择：
 *   stack / cards / dimensionless / units / sensitivity / phase / checklist / tables
 */

import {
  STACK,
  INTERFACE_CARDS,
  dimensionlessPack,
  detectUnitRedefinition,
  sensitivity,
  phaseSlice,
  CONSTRAINT_LABEL,
  CONFIDENCE_LABEL,
  type Verdict,
  type ChecklistItem,
} from '../derivation-stack.js'
import { recalculateConstants } from '../constants-graph.js'
import { toJsonValue } from '../format.js'
import type { MathArgs, Outcome } from './shared.js'

/** 数字格式化（大/小值用科学计数）。 */
function sci(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs === 0) return '0'
  if (abs >= 1e5 || abs < 1e-3) return value.toExponential(3)
  return Number(value.toPrecision(5)).toString()
}

/** 检查表渲染。 */
function renderChecklist(items: ChecklistItem[]): string {
  const out: string[] = ['═══ 检查表（13 项）═══', '']
  for (const item of items) {
    out.push('  ' + (item.pass ? '✓' : '✗') + ' ' + item.name + (item.note ? ' —— ' + item.note : ''))
  }
  const failed = items.filter(function (item) { return !item.pass }).length
  out.push('')
  out.push(failed === 0 ? '全部通过。' : failed + ' 项待填，补全后再发布。')
  return out.join('\n')
}

/**
 * `derivation`：推演栈框架的各子命令。
 *
 * @param args - 工具参数
 * @returns 统一结果对象
 */
export function opDerivation(args: MathArgs): Outcome {
  const sub = typeof args.derivation === 'string' ? args.derivation : 'stack'
  const out: string[] = []
  const value: Record<string, unknown> = { subcommand: sub }

  if (sub === 'stack') {
    out.push('═══ 推演栈（8 层）═══', '')
    for (const layer of STACK) {
      out.push('【' + layer.id + '】' + layer.name)
      out.push('  核心问题：' + layer.question)
      out.push('  输入：' + layer.inputs.join(' / '))
      out.push('  下游接口（' + layer.outputs.length + ' 个）：' + layer.outputs.join(' / '))
      out.push('  硬约束/失败模式：' + layer.failureModes.join(' / '))
      out.push('')
    }
    out.push('贯穿层：单位与观测者 / 不确定性与版本 / 时间与历史路径 / 约束分级')
    out.push('提示：多数世界只需 P1—P4 + 少量 P5，不必全宇宙展开。')
    value.layers = STACK.map(function (layer) { return layer.id })
  } else if (sub === 'cards') {
    const which = typeof args.layer === 'string' ? args.layer.toUpperCase() : ''
    const keys = which !== '' && INTERFACE_CARDS[which] !== undefined ? [which] : Object.keys(INTERFACE_CARDS)
    out.push('═══ 接口卡 ═══', '')
    for (const key of keys) {
      const cards = INTERFACE_CARDS[key]
      out.push('【' + key + '】共 ' + cards.length + ' 个接口变量')
      for (const card of cards) {
        out.push('  · ' + card.name + '  [' + card.unit + ']  约束=' + CONSTRAINT_LABEL[card.kind] + '  置信度=' + CONFIDENCE_LABEL[card.confidence])
        out.push('    定义：' + card.definition)
        out.push('    依赖：' + card.dependsOn.join(', ') + '  敏感于：' + card.sensitiveTo.join(', '))
        if (card.range.allowed) out.push('    允许区间：' + sci(card.range.allowed[0]) + ' — ' + sci(card.range.allowed[1]))
        if (card.range.marginal) out.push('    边缘区间：' + sci(card.range.marginal[0]) + ' — ' + sci(card.range.marginal[1]))
        out.push('    叙事影响：' + card.narrativeImpact.join(', '))
        if (card.notes) out.push('    备注：' + card.notes)
      }
      out.push('')
    }
    value.layers = keys
  } else if (sub === 'dimensionless') {
    const overrides = (args.constants ?? {}) as Record<string, number>
    const resolved = recalculateConstants(overrides)
    const packs = dimensionlessPack(resolved.values as Record<string, number>)
    out.push('═══ 无量纲参数包（真正该追踪的量）═══', '')
    out.push('  名称          含义                            现实值        当前值        偏差')
    for (const pack of packs) {
      out.push('  ' + pack.name.padEnd(14) + pack.meaning.padEnd(32) + sci(pack.standard).padStart(13) + '  ' + sci(pack.current).padStart(13) + '  ' + (pack.deviation === 0 ? '—' : (pack.deviation * 100).toFixed(2) + '%'))
    }
    out.push('')
    out.push('要点：同时缩放所有质量通常只是换了单位；真正变化要看这些比值。')
    value.packs = packs
  } else if (sub === 'units') {
    const changes = (args.unitScales ?? {}) as Record<string, number>
    const verdict = detectUnitRedefinition(changes)
    out.push('═══ 单位重定义检测 ═══', '')
    if (Object.keys(changes).length === 0) {
      out.push('用法：传 unitScales，例如 {"unitScales":{"mass":2}} 表示「所有质量 ×2」。')
    } else {
      out.push('  缩放：' + JSON.stringify(changes))
      out.push('  判定：' + (verdict.isUnitRedefinition ? '是单位重定义（非物理变化）' : '是真实物理变化'))
      out.push('  理由：' + verdict.reason)
    }
    value.verdict = verdict
  } else if (sub === 'sensitivity') {
    const base = typeof args.sensitivityBase === 'number' ? args.sensitivityBase : 9.80665
    const exponent = typeof args.sensitivityExponent === 'number' ? args.sensitivityExponent : 3
    const report = sensitivity(function (x: number) { return Math.pow(x, exponent) }, base)
    out.push('═══ 敏感性分析 ═══', '')
    out.push('  模型：结果 = 输入^' + exponent + '，基线 ' + sci(base))
    for (const item of report.items) {
      out.push('  ' + item.parameter.padEnd(10) + ' 结果=' + sci(item.perturbed) + '  相对变化=' + (item.relativeChange * 100).toFixed(2) + '%  ' + item.verdict)
    }
    out.push('')
    out.push(report.fineTuningWarning ? '⚠ 微调警告：结论对输入高度敏感，允许区间可能极窄。' : '✓ 结论基本稳定。')
    value.report = report
  } else if (sub === 'phase') {
    const slice = phaseSlice(
      function (g: number, size: number): Verdict {
        const ratio = 500 / (g * Math.max(size, 0.01))
        if (ratio >= 3 && ratio <= 300) return 'allowed'
        if (ratio >= 1.5 && ratio <= 1000) return 'marginal'
        return 'forbidden'
      },
      [0.2, 3], [0.1, 100], 7,
    )
    out.push('═══ 相图：重力 × 生物尺寸 → 骨骼强度体重比 ═══', '')
    out.push('  g\\尺寸 ' + slice.xs.map(function (x) { return sci(x).padStart(9) }).join(''))
    for (let yi = 0; yi < slice.ys.length; yi += 1) {
      const row = slice.grid[yi].map(function (v) {
        return (v === 'allowed' ? '允许' : v === 'marginal' ? '边缘' : v === 'forbidden' ? '禁止' : '待定').padStart(9)
      }).join('')
      out.push('  ' + sci(slice.ys[yi]).padStart(7) + row)
    }
    out.push('')
    out.push('  统计：允许 ' + slice.counts.allowed + ' / 边缘 ' + slice.counts.marginal + ' / 禁止 ' + slice.counts.forbidden)
    out.push('  要点：不追求单点答案——先看哪些区域存在解。')
    value.slice = slice
  } else if (sub === 'checklist') {
    const items: ChecklistItem[] = [
      { name: '量纲一致', pass: true },
      { name: '单位一致', pass: true },
      { name: '已无量纲化', pass: true },
      { name: '极限行为合理', pass: true },
      { name: '守恒律未被违反', pass: true },
      { name: '稳定性边界已查', pass: true },
      { name: '标度律未越界', pass: true },
      { name: '反馈时间尺度已分', pass: false, note: '待填：快变量与慢变量' },
      { name: '观测者已声明', pass: false, note: '待填：人类 / 本地智慧 / 上帝视角' },
      { name: '硬约束无冲突', pass: true },
      { name: '叙事锚点有反推窗口', pass: false, note: '待填：锚点与反推结果' },
      { name: '待定项明确', pass: true },
      { name: '版本可追溯', pass: false, note: '待填：本轮版本号' },
    ]
    out.push(renderChecklist(items))
    value.checklist = items
  } else if (sub === 'tables') {
    out.push('═══ 七张表（固定输出格式）═══', '')
    out.push('  1. 项目卡     推演类型 / 范围 / 时间窗口 / 观测者 / 优先级 / 不推演什么')
    out.push('  2. 变更清单   常数 / 对称性 / 粒子谱 / 初条件 / 历史路径，各标处理方式')
    out.push('  3. 接口卡     P1—P6 每层 5—10 个变量，带区间与约束类型')
    out.push('  4. 约束表     硬约束 / 软约束 / 叙事约束')
    out.push('  5. 敏感性表   一阶扰动 / 阈值跨越 / 反馈放大 / 时间尺度错配')
    out.push('  6. 叙事锚点表 锚点 / 硬需求 / 可妥协项 / 反推接口 / 反推窗口 / 冲突处理')
    out.push('  7. 版本记录   版本号 / 变更 / 受影响接口 / 结论变化 / 待定项 / 下轮任务')
    value.tables = 7
  } else {
    out.push('未知子命令：' + sub)
    out.push('可用：stack / cards / dimensionless / units / sensitivity / phase / checklist / tables')
  }

  return { result: out.join('\n'), value: toJsonValue(value) }
}
