/**
 * operation="constants" 的实现。
 *
 * 从 index.ts 原样迁出（纯搬迁：逻辑、错误消息、输出文本逐字未改）。
 */

import { analyzeConsequences } from '../consequences.js'
import {
  CONSTANT_GRAPH,
  FUNDAMENTAL_NAMES,
  recalculateConstants,
  resetActiveConstants,
  setActiveConstants,
  standardValues,
  type ConstantRecalculation,
} from '../constants-graph.js'
import { toJsonValue } from '../format.js'
import { currentWorkspace, updateWorkspace } from '../workspace.js'
import { CalcError, type MathArgs, type Outcome } from './shared.js'

/**
 * `constants`：改变物理常数，自动推导全部派生量，并评估世界偏离程度。
 *
 * 物理常数是耦合的：改 c 会连带改变 mu0、sigma、alpha_fs；
 * 改 e_charge 会连带改变 kCoulomb、alpha_fs、Ry。
 * 这里把这层依赖显式建模，避免"只改一个数、其余不变"造成的自相矛盾。
 */
export function opConstants(args: MathArgs): Outcome {
  const overrides = (args.constants ?? {}) as Record<string, number>

  // 传空的 constants: {} 表示「恢复现实宇宙」
  if (Object.keys(overrides).length === 0 && args.constants !== undefined) {
    resetActiveConstants()
    // 关键：工作区里存的常数表也要清空。
    // 只清活动表是不够的 —— formula 调用时会从工作区读常数去绑定公式参数，
    // 不清的话下次算出来还是旧世界观的数。
    let clearedWorkspace: string | undefined
    try {
      const name = currentWorkspace()
      updateWorkspace(name, (current) => ({ ...current, constants: {} }))
      clearedWorkspace = name
    } catch {
      /* 写盘失败不影响重置 */
    }
    return {
      result:
        '✓ 已恢复现实宇宙的物理常数。\n之后 operation="formula" / "world" 都会使用标准值。' +
        (clearedWorkspace ? '\n  工作区 "\' + clearedWorkspace + \'" 的常数表也已清空。' : ''),
      value: toJsonValue({ values: standardValues(), reset: true, workspace: clearedWorkspace }),
    }
  }

  let result: ConstantRecalculation
  try {
    result = recalculateConstants(overrides)
  } catch (error) {
    throw new CalcError('invalid_argument', error instanceof Error ? error.message : String(error))
  }

  const lines: string[] = []
  const big = (value: number): string => {
    if (value === 0) return '0'
    const abs = Math.abs(value)
    if (abs >= 1e5 || abs < 1e-3) {
      // 用科学计数法并保留 6 位有效数字
      return value.toExponential(6)
    }
    return Number(value.toPrecision(8)).toString()
  }

  lines.push('══════ 物理常数推演 ══════')
  lines.push('')

  if (Object.keys(overrides).length === 0) {
    lines.push('未指定改动，列出当前基础旋钮与派生量：')
    lines.push('')
    lines.push('【基础旋钮】（可自由设定）')
    for (const node of CONSTANT_GRAPH.filter((n) => n.fundamental)) {
      lines.push(`  ${node.name.padEnd(10)} ${big(node.standard).padEnd(16)} ${node.unit.padEnd(12)} ${node.meaning}`)
    }
    lines.push('')
    lines.push('【派生量】（由旋钮自动算出，不能直接设定）')
    for (const node of CONSTANT_GRAPH.filter((n) => !n.fundamental)) {
      lines.push(
        `  ${node.name.padEnd(10)} ${big(node.standard).padEnd(16)} ${node.unit.padEnd(12)} ` +
          `依赖: ${(node.dependsOn ?? []).join(', ')}`,
      )
    }
    lines.push('')
    lines.push(`改法：{"operation":"constants", "constants":{"c": 1.5e8}}`)
    return {
      result: lines.join('\n'),
      value: toJsonValue({ values: standardValues(), fundamental: FUNDAMENTAL_NAMES }),
    }
  }

  // ── 改动清单 ──
  lines.push('【你直接改动的旋钮】')
  for (const change of result.changed) {
    const percent = change.relativeDelta * 100
    const arrow = percent > 0 ? '↑' : '↓'
    lines.push(
      `  ${change.name.padEnd(10)} ${big(change.from)} → ${big(change.to)}  ` +
        `(${arrow} ${Math.abs(percent).toFixed(2)}%)`,
    )
  }

  // ── 被动变化 ──
  if (result.derived.length > 0) {
    lines.push('')
    lines.push('【因耦合而被动改变的量】（不能直接设定，已自动重算）')
    for (const change of result.derived) {
      const percent = change.relativeDelta * 100
      const arrow = percent > 0 ? '↑' : '↓'
      lines.push(
        `  ${change.name.padEnd(10)} ${big(change.from)} → ${big(change.to)}  ` +
          `(${arrow} ${Math.abs(percent).toFixed(3)}%)`,
      )
    }
  } else {
    lines.push('')
    lines.push('【因耦合而被动改变的量】无（你改的量不影响其他常数）')
  }

  // ── 偏离度 ──
  lines.push('')
  lines.push('【世界偏离程度】')
  lines.push(`  偏离评分: ${(result.deviationScore * 100).toFixed(1)} / 100`)
  lines.push(`  判定: ${result.deviationLevel}`)

  if (result.affectedFormulaCategories.length > 0) {
    lines.push(`  受影响的公式类别: ${result.affectedFormulaCategories.join(', ')}`)
  }

  // ── 警告 ──
  if (result.warnings.length > 0) {
    lines.push('')
    lines.push('⚠ 需要注意')
    for (const warning of result.warnings) lines.push(`  · ${warning}`)
  }

  // ── 长链后果（跨尺度影响）──
  const consequences = analyzeConsequences(result.values)
  if (consequences.length > 0) {
    const byConfidence = {
      exact: consequences.filter((c) => c.confidence === 'exact'),
      empirical: consequences.filter((c) => c.confidence === 'empirical'),
      qualitative: consequences.filter((c) => c.confidence === 'qualitative'),
    }
    const mark = (c: 'exact' | 'empirical' | 'qualitative'): string =>
      c === 'exact' ? '精确' : c === 'empirical' ? '经验估算' : '仅方向'

    const groups: Array<[string, typeof byConfidence.exact]> = [
      ['stellar', []],
    ]
    const categoryNames: Record<string, string> = {
      stellar: '恒星与天体',
      atomic: '原子尺度',
      chemical: '化学与核合成',
      planetary: '行星与轨道',
      human: '人体与生物',
    }

    lines.push('')
    lines.push('【长链后果】（改这些常数的连锁反应）')
    for (const [category, label] of Object.entries(categoryNames)) {
      const items = consequences.filter((c) => c.category === category)
      if (items.length === 0) continue
      lines.push('')
      lines.push(`  ── ${label} ──`)
      for (const item of items) {
        lines.push(`  · ${item.name}  [${mark(item.confidence)}]`)
        lines.push(`      ${item.description}`)
        if (item.note) lines.push(`      （${item.note}）`)
      }
    }

    lines.push('')
    lines.push('  可信度说明:')
    lines.push(`    精确 = 严格代数关系，可直接采信（${byConfidence.exact.length} 条）`)
    lines.push(`    经验估算 = 文献拟合式，量级可信、具体数字有 1~2 个数量级误差（${byConfidence.empirical.length} 条）`)
    if (byConfidence.qualitative.length > 0) {
      lines.push(`    仅方向 = 只给趋势不给数字（${byConfidence.qualitative.length} 条）`)
    }
  }

  // ── 引导 ──
  lines.push('')
  // 把推演结果设为「当前生效的常数」，后续 formula/world 都会用新值
  setActiveConstants(result.values)

  // **自动持久化到活动工作区** —— 这是数据隔离的核心：
  // 每个世界观的常数表存在自己的文件里，切换工作区时整体替换。
  let savedTo: string | undefined
  try {
    const name = currentWorkspace()
    updateWorkspace(name, (current) => ({
      ...current,
      constants: { ...result.values },
    }))
    savedTo = name
  } catch {
    // 写盘失败不影响本次计算
  }

  lines.push(
    savedTo
      ? `✓ 这些常数已生效并保存到工作区 "${savedTo}" —— 之后 formula / world 都用新值。`
      : '✓ 这些常数已生效（写盘失败，仅本次会话有效）。',
  )
  lines.push('  切换世界观请用 operation="workspace" action2="switch"，不同工作区的常数表互相隔离。')
  lines.push(`可用旋钮: ${FUNDAMENTAL_NAMES.join(', ')}`)

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      values: result.values,
      changed: result.changed,
      derived: result.derived,
      deviationScore: result.deviationScore,
      deviationLevel: result.deviationLevel,
      affectedFormulaCategories: result.affectedFormulaCategories,
      warnings: result.warnings,
      consequences: consequences.map((c) => ({
        name: c.name,
        category: c.category,
        confidence: c.confidence,
        value: c.value,
        ratio: c.ratio,
        description: c.description,
      })),
    }),
  }
}
