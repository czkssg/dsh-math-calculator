/**
 * 叙事锚点反解：从「我要什么」推回「该改哪个基础量」。
 *
 * 作者想「重力 1.5 倍」，但他不该知道要去改 `planetMass`。所以做成：
 * 用户填目标 → 解出该改的基础量 → 告诉他连带影响。
 *
 * ## 关键约束
 *
 * 反解只输出**基础量**。绝不输出「重力=1.5」这种派生量——
 * 派生量存不进设定数据，也没法和公式共存。
 *
 * ## 实现方式
 *
 * 解析式反解（比数值搜索更快更准）：
 *   · 重力：g = G·M/R² → M = g_target·R²
 *   · 逃逸速度：v = √(2GM/R) → R = 2GM/v²
 *   · 生物高度：L = 25/g_ratio → g_ratio = 25/L
 *   · 一天长度：直接改 rotationHours
 *
 * @module dsh-math-calculator/features/deduction/anchor-solve
 */

import { generateWorld, type WorldDeps } from './world.js'
import { BASE_PHYSICS, OUR_KNOBS } from './constants.js'

/** 支持的锚点类型。 */
export type AnchorKind = 'gravity' | 'escapeVelocity' | 'creatureHeight' | 'dayLength'

/** 反解结果。 */
export interface AnchorResult {
  kind: AnchorKind
  wanted: number
  label: string
  unit: string
  solved: boolean
  changes: Record<string, number>
  reasons: string[]
  sideEffects: Array<{ label: string; before: string; after: string }>
  why?: string
}

/** 数值格式化。 */
function fmt(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e5 || (abs < 1e-3 && abs > 0)) return value.toExponential(2)
  return String(Number(value.toPrecision(4)))
}

/** 读世界参数。 */
function num(params: Record<string, unknown>, key: string, fallback: number): number {
  const value = params[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** 一次世界计算。 */
function worldOf(params: Record<string, unknown>, deps: WorldDeps): Record<string, any> {
  return generateWorld(params as never, deps) as unknown as Record<string, any>
}

/**
 * 反解一个锚点。
 *
 * @param kind - 锚点类型
 * @param wanted - 目标值
 * @param params - 当前世界参数
 * @param deps - 注入数据
 * @returns 反解结果
 */
export function solveAnchor(kind: AnchorKind, wanted: number, params: Record<string, unknown> = {}, deps: WorldDeps = {}): AnchorResult {
  const before = worldOf(params, deps)
  const radiusRatio = num(params, 'planetRadius', 1)
  const massRatio = num(params, 'planetMass', 1)
  const currentGravityEarth = before.planet?.surfaceGravityEarth ?? 1
  const currentEscape = (before.planet?.escapeVelocity ?? 11186) / 1000

  const base: AnchorResult = { kind, wanted, label: '', unit: '', solved: false, changes: {}, reasons: [], sideEffects: [] }
  if (!Number.isFinite(wanted) || wanted <= 0) {
    base.why = '目标值必须是一个正数'
    return base
  }

  if (kind === 'gravity') {
    base.label = '表面重力'
    base.unit = '倍地球重力（g）'
    const targetMass = wanted * radiusRatio * radiusRatio
    const after = worldOf({ ...params, planetMass: targetMass }, deps)
    base.solved = true
    base.changes = { planetMass: targetMass }
    base.reasons.push('重力 ∝ 质量 / 半径²。半径保持 ' + fmt(radiusRatio) + ' 地球半径时，要 ' + fmt(wanted) + ' g 需质量 ' + fmt(targetMass) + ' 地球质量。')
    base.sideEffects.push({ label: '实际重力', before: fmt(currentGravityEarth) + ' g', after: fmt(after.planet?.surfaceGravityEarth ?? 0) + ' g' })
    base.sideEffects.push({ label: '逃逸速度', before: fmt(currentEscape) + ' km/s', after: fmt((after.planet?.escapeVelocity ?? 0) / 1000) + ' km/s' })
    base.sideEffects.push({ label: '大气标高', before: fmt(before.atmosphere?.scaleHeightM ?? 0) + ' m', after: fmt(after.atmosphere?.scaleHeightM ?? 0) + ' m' })
    return base
  }

  if (kind === 'escapeVelocity') {
    base.label = '逃逸速度'
    base.unit = 'km/s'
    const massKg = massRatio * BASE_PHYSICS.Mearth
    const targetR = (2 * OUR_KNOBS.G * massKg) / (wanted * 1000) ** 2
    const targetRadiusRatio = targetR / BASE_PHYSICS.Rearth
    const after = worldOf({ ...params, planetRadius: targetRadiusRatio }, deps)
    base.solved = true
    base.changes = { planetRadius: targetRadiusRatio }
    base.reasons.push('逃逸速度 v = √(2GM/R)。质量保持 ' + fmt(massRatio) + ' 地球质量时，要 ' + fmt(wanted) + ' km/s 需半径 ' + fmt(targetRadiusRatio) + ' 地球半径。')
    base.sideEffects.push({ label: '重力（半径变小则重力变大）', before: fmt(currentGravityEarth) + ' g', after: fmt(after.planet?.surfaceGravityEarth ?? 0) + ' g' })
    return base
  }

  if (kind === 'creatureHeight') {
    base.label = '陆生生物最大高度'
    base.unit = '米'
    const targetRatio = 25 / wanted
    const targetMass = targetRatio * radiusRatio * radiusRatio
    const after = worldOf({ ...params, planetMass: targetMass }, deps)
    base.solved = true
    base.changes = { planetMass: targetMass }
    base.reasons.push('陆生生物高度上限 = 25 / 重力倍数。要 ' + fmt(wanted) + ' 米，重力倍数需 ≤ ' + fmt(targetRatio) + '，对应质量 ' + fmt(targetMass) + ' 地球质量。')
    base.sideEffects.push({ label: '重力', before: fmt(currentGravityEarth) + ' g', after: fmt(after.planet?.surfaceGravityEarth ?? 0) + ' g' })
    return base
  }

  if (kind === 'dayLength') {
    base.label = '一天长度'
    base.unit = '小时'
    const after = worldOf({ ...params, rotationHours: wanted }, deps)
    base.solved = true
    base.changes = { rotationHours: wanted }
    base.reasons.push('一天长度直接由自转周期决定，把自转周期设为 ' + fmt(wanted) + ' 小时即可。')
    base.sideEffects.push({ label: '实际一天（太阳日）', before: fmt(before.planet?.dayHours ?? 0) + ' 小时', after: fmt(after.planet?.dayHours ?? 0) + ' 小时' })
    return base
  }

  base.why = '未知的锚点类型'
  return base
}

/** 可用的锚点清单。 */
export const ANCHORS: Array<{ kind: AnchorKind; label: string; unit: string; hint: string }> = [
  { kind: 'gravity', label: '重力要几倍地球', unit: 'g', hint: '想更重的世界填 1.5，想轻盈填 0.5' },
  { kind: 'escapeVelocity', label: '逃逸速度要多少', unit: 'km/s', hint: '地球 11.2。低于此值更难飞出太空' },
  { kind: 'creatureHeight', label: '生物能长多高', unit: '米', hint: '地球陆地最大约 25 米（蜥脚类）' },
  { kind: 'dayLength', label: '一天要多长', unit: '小时', hint: '地球 24。这个不用反解，直接改' },
]

/**
 * 渲染反解报告。
 *
 * @param result - 反解结果
 * @returns 可读文本
 */
export function renderBackSolve(result: AnchorResult): string {
  const lines: string[] = ['═══ 叙事锚点反解 ═══', '']
  lines.push('  目标：' + result.label + ' = ' + fmt(result.wanted) + ' ' + result.unit)
  if (!result.solved) {
    lines.push('')
    lines.push('  解不出来：' + (result.why ?? '未知原因'))
    return lines.join('\n')
  }
  lines.push('')
  lines.push('  该改的基础量：')
  for (const [key, value] of Object.entries(result.changes)) lines.push('    ' + key + ' = ' + fmt(value))
  lines.push('')
  for (const reason of result.reasons) lines.push('  ' + reason)
  if (result.sideEffects.length > 0) {
    lines.push('')
    lines.push('  连带影响：')
    for (const effect of result.sideEffects) lines.push('    ' + effect.label.padEnd(20) + effect.before + ' → ' + effect.after)
  }
  lines.push('')
  lines.push('  ★ 只改基础量：派生量（重力、逃逸速度）不写进设定数据，它们会随基础量自动重算。')
  return lines.join('\n')
}
