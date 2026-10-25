/**
 * 叙事锚点反解：从「我要什么」推回「该改哪个基础量」。
 *
 * @module dsh-math-calculator/anchor-solve
 * @description
 * ## 为什么这是界面最需要的功能
 *
 * 用户想「重力 1.5 倍」，但他不该知道要去改 `planetMass`。
 * 直接让他填质量，是要求他懂物理。
 *
 * 所以做成：`用户填目标 → 系统解出该改的基础量 → 告诉他连带影响 → 一键应用`。
 *
 * ## 关键约束
 *
 * 反解**只输出基础量**。绝不输出「重力=1.5」这种派生量，
 * 因为派生量存不进 data，也没法和公式共存。
 *
 * ## 实现方式
 *
 * 用解析式反解（比数值搜索更快更准）：
 *   · 重力：g = G·M/R²  →  M = g_target · R²
 *   · 逃逸速度：v = √(2gR) → R = v²/(2g)
 *   · 生物高度：L = 25/g_ratio → g_ratio = 25/L
 */

import { opWorld } from './ops/world-op.js'

/** 支持的锚点类型。 */
export type AnchorKind = 'gravity' | 'escapeVelocity' | 'creatureHeight' | 'dayLength'

/** 一个锚点的反解结果。 */
export interface AnchorResult {
  /** 锚点类型。 */
  kind: AnchorKind
  /** 用户想要的值。 */
  wanted: number
  /** 锚点的中文名。 */
  label: string
  /** 单位。 */
  unit: string
  /** 是否解得出来。 */
  solved: boolean
  /** 该改哪个基础量（键名 → 新值）。 */
  changes: Record<string, number>
  /** 每个改动的中文说明。 */
  reasons: string[]
  /** 连带影响（改完后哪些派生量会变）。 */
  sideEffects: Array<{ label: string; before: string; after: string }>
  /** 解不出来时说明原因。 */
  why?: string
}

/**
 * 格式化数值。
 *
 * @param value - 数值
 * @param digits - 位数
 * @returns 显示串
 */
function fmt(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e6 || (abs < 1e-2 && abs > 0)) return value.toExponential(2)
  return Number(value.toPrecision(digits)).toString()
}

/**
 * 读一个世界参数的当前值（缺省则用默认）。
 *
 * @param params - 当前参数
 * @param key - 键名
 * @param fallback - 默认值
 * @returns 数值
 */
function num(params: Record<string, unknown>, key: string, fallback: number): number {
  const value = params[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * 反解一个锚点。
 *
 * @param kind - 锚点类型
 * @param wanted - 用户想要的值
 * @param params - 当前世界参数
 * @returns 反解结果
 */
export function solveAnchor(
  kind: AnchorKind,
  wanted: number,
  params: Record<string, unknown> = {},
): AnchorResult {
  const before = (opWorld({ world: params } as never, 32) as any).value || {}
  const radiusRatio = num(params, 'planetRadius', 1)
  const massRatio = num(params, 'planetMass', 1)

  const currentGravityEarth = (before.planet && before.planet.surfaceGravityEarth) || 1
  const currentEscapeKms = ((before.planet && before.planet.surfaceGravity) || 9.8) *
    ((before.planet && before.planet.radiusM) || 6.371e6)
  const currentEscape = Math.sqrt(2 * currentEscapeKms) / 1000

  const base: AnchorResult = {
    kind: kind,
    wanted: wanted,
    label: '',
    unit: '',
    solved: false,
    changes: {},
    reasons: [],
    sideEffects: [],
  }

  if (!Number.isFinite(wanted) || wanted <= 0) {
    base.why = '目标值必须是一个正数'
    return base
  }

  // ── 锚点 1：重力 ──
  if (kind === 'gravity') {
    base.label = '表面重力'
    base.unit = '倍地球重力（g）'
    // g ∝ M/R²  →  固定半径时 M = g_target × R²
    const targetMass = wanted * radiusRatio * radiusRatio
    base.solved = true
    base.changes = { planetMass: targetMass }
    base.reasons.push(
      '重力 ∝ 质量 / 半径²。半径保持 ' + fmt(radiusRatio) + ' 地球半径时，' +
      '要 ' + fmt(wanted) + ' g 需质量 ' + fmt(targetMass) + ' 地球质量。',
    )
    // 连带效应：改完实算一遍
    const after = (opWorld({
      world: { ...params, planetMass: targetMass },
    } as never, 32) as any).value || {}
    const afterGravity = (after.planet && after.planet.surfaceGravityEarth) || 0
    const afterScale = (after.atmosphere && after.atmosphere.scaleHeightM) || 0
    const beforeScale = (before.atmosphere && before.atmosphere.scaleHeightM) || 0
    const afterEscape = Math.sqrt(2 *
      ((after.planet && after.planet.surfaceGravity) || 0) *
      ((after.planet && after.planet.radiusM) || 6.371e6)) / 1000
    base.sideEffects.push({
      label: '实际重力',
      before: fmt(currentGravityEarth) + ' g',
      after: fmt(afterGravity) + ' g',
    })
    base.sideEffects.push({
      label: '逃逸速度',
      before: fmt(currentEscape) + ' km/s',
      after: fmt(afterEscape) + ' km/s',
    })
    base.sideEffects.push({
      label: '大气标高',
      before: fmt(beforeScale) + ' m',
      after: fmt(afterScale) + ' m',
    })
    return base
  }

  // ── 锚点 2：逃逸速度 ──
  if (kind === 'escapeVelocity') {
    base.label = '逃逸速度'
    base.unit = 'km/s'
    // v = √(2GM/R)  →  固定质量时 R = 2GM/v²
    const G = 6.674e-11
    const earthMass = 5.972e24
    const massKg = massRatio * earthMass
    const targetR = (2 * G * massKg) / Math.pow(wanted * 1000, 2)
    const targetRadiusRatio = targetR / 6.371e6
    base.solved = true
    base.changes = { planetRadius: targetRadiusRatio }
    base.reasons.push(
      '逃逸速度 v = √(2GM/R)。质量保持 ' + fmt(massRatio) + ' 地球质量时，' +
      '要 ' + fmt(wanted) + ' km/s 需半径 ' + fmt(targetRadiusRatio) + ' 地球半径。',
    )
    const after = (opWorld({
      world: { ...params, planetRadius: targetRadiusRatio },
    } as never, 32) as any).value || {}
    const afterGravity = (after.planet && after.planet.surfaceGravityEarth) || 0
    base.sideEffects.push({
      label: '重力（半径变小则重力变大）',
      before: fmt(currentGravityEarth) + ' g',
      after: fmt(afterGravity) + ' g',
    })
    return base
  }

  // ── 锚点 3：生物高度 ──
  if (kind === 'creatureHeight') {
    base.label = '陆生生物最大高度'
    base.unit = '米'
    // L_max = 25 / g_ratio  →  g_ratio = 25 / L
    const targetRatio = 25 / wanted
    const targetMass = targetRatio * radiusRatio * radiusRatio
    base.solved = true
    base.changes = { planetMass: targetMass }
    base.reasons.push(
      '陆生生物高度上限 = 25 / 重力倍数。要 ' + fmt(wanted) + ' 米，' +
      '重力倍数需 ≤ ' + fmt(targetRatio) + '，对应质量 ' + fmt(targetMass) + ' 地球质量。',
    )
    const after = (opWorld({
      world: { ...params, planetMass: targetMass },
    } as never, 32) as any).value || {}
    const afterGravity = (after.planet && after.planet.surfaceGravityEarth) || 0
    base.sideEffects.push({
      label: '重力',
      before: fmt(currentGravityEarth) + ' g',
      after: fmt(afterGravity) + ' g',
    })
    return base
  }

  // ── 锚点 4：一天多长 ──
  if (kind === 'dayLength') {
    base.label = '一天长度'
    base.unit = '小时'
    // 直接就是 rotationHours 输入，不用反解
    base.solved = true
    base.changes = { rotationHours: wanted }
    base.reasons.push('一天长度直接由自转周期决定，把自转周期设为 ' + fmt(wanted) + ' 小时即可。')
    const after = (opWorld({
      world: { ...params, rotationHours: wanted },
    } as never, 32) as any).value || {}
    base.sideEffects.push({
      label: '实际一天（太阳日）',
      before: fmt((before.planet && before.planet.dayHours) || 0) + ' 小时',
      after: fmt((after.planet && after.planet.dayHours) || 0) + ' 小时',
    })
    return base
  }

  base.why = '未知的锚点类型'
  return base
}

/** 可用的锚点清单（界面据此生成选择器）。 */
export const ANCHORS: Array<{ kind: AnchorKind; label: string; unit: string; hint: string }> = [
  {
    kind: 'gravity',
    label: '重力要几倍地球',
    unit: 'g',
    hint: '想更重的世界填 1.5，想轻盈填 0.5',
  },
  {
    kind: 'escapeVelocity',
    label: '逃逸速度要多少',
    unit: 'km/s',
    hint: '地球 11.2。低于此值更难飞出太空',
  },
  {
    kind: 'creatureHeight',
    label: '生物能长多高',
    unit: '米',
    hint: '地球陆地最大约 25 米（蜥脚类）',
  },
  {
    kind: 'dayLength',
    label: '一天要多长',
    unit: '小时',
    hint: '地球 24。这个不用反解，直接改',
  },
]
