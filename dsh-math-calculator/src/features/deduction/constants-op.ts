/**
 * `constants`：改变物理常数，自动推导全部派生量，并评估世界偏离程度。
 *
 * 物理常数是耦合的：改 c 会连带改变 mu0、sigma、alpha_fs；改 e_charge 会连带
 * 改变 kCoulomb、alpha_fs、Ry。这里把这层依赖显式建模，避免「只改一个数、
 * 其余不变」造成的自相矛盾。
 *
 * ## preview
 *
 * `preview:true` 时**既不设进程级生效常数，也不写工作区**。
 * 调用方能看到「改成这组常数会怎样」的完整推演，但不污染后续计算。
 *
 * @module dsh-math-calculator/features/deduction/constants-op
 */

import { CalcError } from '../../core/errors.js'
import { currentWorkspace, switchWorkspace } from '../workspace.js'
import { loadWorkspaceFile, saveWorkspaceFile } from '../../io/workspace-store.js'
import {
  CONSTANT_GRAPH,
  FUNDAMENTAL_NAMES,
  recalculateConstants,
  resetActiveConstants,
  setActiveConstants,
  standardValues,
  type ConstantRecalculation,
} from './constants-graph.js'
import {
  OUR_KNOBS,
  OUR_UNIVERSE,
  analyzeConstantChange,
  contradictionsOf,
  deriveScaleLadder,
  dimensionlessFromKnobs,
  type Knobs,
} from './constants-core.js'
import { analyzeConsequences } from './consequences.js'

/** 结果。 */
export interface ConstantsOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 数字渲染。 */
function big(value: number): string {
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e5 || abs < 1e-3) return value.toExponential(6)
  return Number(value.toPrecision(8)).toString()
}

/** 从常数表取有量纲旋钮。 */
function knobsFromValues(values: Record<string, number>): Knobs {
  return {
    c: values['c'] ?? OUR_KNOBS.c,
    hbar: values['hbar'] ?? OUR_KNOBS.hbar,
    e: values['e_charge'] ?? OUR_KNOBS.e,
    epsilon0: values['epsilon0'] ?? OUR_KNOBS.epsilon0,
    me: values['me'] ?? OUR_KNOBS.me,
    mp: values['mp'] ?? OUR_KNOBS.mp,
    G: values['G'] ?? OUR_KNOBS.G,
  }
}

/** 无量纲视角：真正决定物理的是 α、μ、α_G，不是 c/G/h。 */
function dimensionlessSection(values: Record<string, number>): { lines: string[]; data: Record<string, unknown> } {
  const knobs = knobsFromValues(values)
  const measured = dimensionlessFromKnobs(knobs)
  const change = analyzeConstantChange(OUR_KNOBS, knobs)
  const ds = { ...OUR_UNIVERSE, ...measured }
  const ladder = deriveScaleLadder(ds)
  const flags = contradictionsOf(ds)
  const mark: Record<string, string> = { exact: '精确', scaling: '标度', 'order-of-magnitude': '量级' }
  const lines: string[] = ['', '【无量纲视角】（真正决定物理的是这些，不是 c/G/h 本身）']
  lines.push('  α  = ' + change.alphaAfter.toExponential(6) + '（现实 ' + OUR_UNIVERSE.alpha.toExponential(6) + '，×' + change.alphaRatio.toFixed(4) + '）')
  lines.push('  μ  = mₚ/mₑ = ' + change.muAfter.toFixed(2) + '（现实 ' + OUR_UNIVERSE.mu.toFixed(2) + '，×' + change.muRatio.toFixed(4) + '）')
  lines.push('  判定：' + (change.verdict === 'unit-only' ? '只是换单位（物理不变）' : '换了物理') + ' —— ' + change.note, '')
  lines.push('  尺度阶梯（由 α、μ 推出，不再假设地球值）：')
  for (const entry of ladder) {
    lines.push('    ' + entry.name.padEnd(22) + entry.value.toExponential(3).padStart(12) + ' ' + entry.unit.padEnd(8) + ' [' + mark[entry.confidence] + ']')
  }
  if (flags.length > 0) {
    lines.push('', '  ⚠ 与已知物理的张力（不拒绝回答，但请作者知情）')
    for (const flag of flags) lines.push('    · ' + flag)
  }
  return { lines, data: { dimensionless: { alpha: measured.alpha, mu: measured.mu, alphaG: measured.alphaG, verdict: change.verdict, note: change.note }, contradictions: flags } }
}

/**
 * 执行 constants。
 *
 * @param input - 常数覆盖、预览开关与工作区
 * @returns 推演结果
 * @throws {CalcError} 常数名或值不合法
 */
export function runConstants(input: {
  constants?: Record<string, number>
  preview?: boolean
  workspace?: string
} = {}): ConstantsOutcome {
  const overrides = input.constants ?? {}
  const workspace = currentWorkspace()
  if (input.workspace !== undefined && input.workspace.trim() !== '') switchWorkspace(input.workspace)

  /** 传空的 constants: {} 表示「恢复现实宇宙」。 */
  if (Object.keys(overrides).length === 0 && input.constants !== undefined) {
    resetActiveConstants()
    const data = loadWorkspaceFile(workspace)
    saveWorkspaceFile({ ...data, constants: {} })
    return {
      result: '✓ 已恢复现实宇宙的物理常数。\n之后 operation="formula" / "world" 都会使用标准值。\n  工作区 "' + workspace + '" 的常数表也已清空。',
      value: { values: standardValues(), reset: true, workspace },
    }
  }

  let result: ConstantRecalculation
  try {
    result = recalculateConstants(overrides)
  } catch (error) {
    throw new CalcError('invalid_argument', error instanceof Error ? error.message : String(error))
  }

  const lines: string[] = ['══════ 物理常数推演 ══════', '']
  if (Object.keys(overrides).length === 0) {
    lines.push('未指定改动，列出当前基础旋钮与派生量：', '', '【基础旋钮】（可自由设定）')
    for (const node of CONSTANT_GRAPH.filter((item) => item.fundamental)) {
      lines.push('  ' + node.name.padEnd(10) + big(node.standard).padEnd(16) + ' ' + node.unit.padEnd(12) + ' ' + node.meaning)
    }
    lines.push('', '【派生量】（由旋钮自动算出，不能直接设定）')
    for (const node of CONSTANT_GRAPH.filter((item) => !item.fundamental)) {
      lines.push('  ' + node.name.padEnd(10) + big(node.standard).padEnd(16) + ' ' + node.unit.padEnd(12) + ' 依赖: ' + (node.dependsOn ?? []).join(', '))
    }
    lines.push('', '改法：{"operation":"constants", "constants":{"c": 1.5e8}}')
    const dim = dimensionlessSection(standardValues())
    lines.push(...dim.lines)
    return { result: lines.join('\n'), value: { values: standardValues(), fundamental: FUNDAMENTAL_NAMES, ...dim.data } }
  }

  lines.push('【你直接改动的旋钮】')
  for (const change of result.changed) {
    const percent = change.relativeDelta * 100
    lines.push('  ' + change.name.padEnd(10) + big(change.from) + ' → ' + big(change.to) + '  (' + (percent > 0 ? '↑' : '↓') + ' ' + Math.abs(percent).toFixed(2) + '%)')
  }
  if (result.derived.length > 0) {
    lines.push('', '【因耦合而被动改变的量】（不能直接设定，已自动重算）')
    for (const change of result.derived) {
      const percent = change.relativeDelta * 100
      lines.push('  ' + change.name.padEnd(10) + big(change.from) + ' → ' + big(change.to) + '  (' + (percent > 0 ? '↑' : '↓') + ' ' + Math.abs(percent).toFixed(3) + '%)')
    }
  } else {
    lines.push('', '【因耦合而被动改变的量】无（你改的量不影响其他常数）')
  }
  lines.push('', '【世界偏离程度】')
  lines.push('  偏离评分: ' + (result.deviationScore * 100).toFixed(1) + ' / 100')
  lines.push('  判定: ' + result.deviationLevel)
  if (result.affectedFormulaCategories.length > 0) lines.push('  受影响的公式类别: ' + result.affectedFormulaCategories.join(', '))
  if (result.warnings.length > 0) {
    lines.push('', '⚠ 需要注意')
    for (const warning of result.warnings) lines.push('  · ' + warning)
  }

  const consequences = analyzeConsequences(result.values)
  if (consequences.length > 0) {
    const mark = (confidence: string): string => (confidence === 'exact' ? '精确' : confidence === 'empirical' ? '经验估算' : '仅方向')
    const categoryNames: Record<string, string> = { stellar: '恒星与天体', atomic: '原子尺度', chemical: '化学与核合成', planetary: '行星与轨道', human: '人体与生物' }
    lines.push('', '【长链后果】（改这些常数的连锁反应）')
    for (const [category, label] of Object.entries(categoryNames)) {
      const items = consequences.filter((item) => item.category === category)
      if (items.length === 0) continue
      lines.push('', '  ── ' + label + ' ──')
      for (const item of items) {
        lines.push('  · ' + item.name + '  [' + mark(item.confidence) + ']')
        lines.push('      ' + item.description)
        if (item.note) lines.push('      （' + item.note + '）')
      }
    }
  }

  const dim = dimensionlessSection(result.values)
  lines.push(...dim.lines)

  if (input.preview === true) {
    lines.push('', '✓ 预览模式：以上推演已完成，但**未生效、未落盘**。')
    lines.push('  之后 formula / world 仍使用原来的常数。')
    lines.push('  要让它们真生效，去掉 preview 再调一次。')
    return { result: lines.join('\n'), value: { values: result.values, preview: true, applied: false, persisted: false } }
  }

  setActiveConstants(result.values)
  const data = loadWorkspaceFile(workspace)
  saveWorkspaceFile({ ...data, constants: { ...result.values } })
  lines.push('', '✓ 这些常数已生效并保存到工作区 "' + workspace + '" —— 之后 formula / world 都用新值。')
  lines.push('', '⚠ 这是一个**全局副作用**：之后所有 formula / world 都用新常数。')
  lines.push('  只想看后果、不想污染后续 → 加 preview:true 重调一次。')
  lines.push('  要恢复现实宇宙 → 传 constants:{}。')
  lines.push('可用旋钮: ' + FUNDAMENTAL_NAMES.join(', '))

  return {
    result: lines.join('\n'),
    value: {
      values: result.values,
      changed: result.changed,
      derived: result.derived,
      deviationScore: result.deviationScore,
      deviationLevel: result.deviationLevel,
      affectedFormulaCategories: result.affectedFormulaCategories,
      warnings: result.warnings,
      consequences: consequences.map((item) => ({ name: item.name, category: item.category, confidence: item.confidence, description: item.description })),
      ...dim.data,
    },
  }
}
