/**
 * 逆推校准：从叙事锚点反推物理参数窗口。
 *
 * @module dsh-math-calculator/back-solve
 * @description
 * 正推是「给定参数看世界观成不成立」；逆推是「我想要这个效果，参数该在什么范围」。
 * 后者才是作者最常用的方向——「故事里要有一只 50 米高的巨兽，这星球的重力最多是多少？」
 *
 * 三步：
 * 1. 找约束：从约束库里找与该锚点对应的一条（如 creatureHeight）；
 * 2. 解析反解：约束的 limit 是参数的函数，反过来解出参数上限；
 * 3. 落地校验：把反解出的参数代回**正向链路**，确认其它层是否也成立。
 *
 * 第三步是关键：单条约束很容易自洽，但推演栈是层层依赖的。
 * 这正是规格里「冲突优先级：硬约束 > 叙事锚点 > 软约束」的落地。
 */

import { CONSTRAINTS, deriveConstraintContext } from './feasibility.js'
import { opWorld } from './ops/world-op.js'
import { runPipeline, type PipelineResult } from './pipeline.js'

/** 一个叙事锚点的反推结果。 */
export interface AnchorSolution {
  anchor: string
  label: string
  wanted: number
  unit: string
  limits: Array<{
    parameter: string
    label: string
    max?: number
    min?: number
    reason: string
  }>
  recommended: Record<string, number>
  pipeline?: PipelineResult
  conflicts: string[]
}

/** 可反推的锚点：约束 id 与说明。 */
export interface AnchorDef {
  constraintId: string
  describe: string
}

/** 可反推的锚点清单（只列 limit 可解析的约束）。 */
export const ANCHORS: AnchorDef[] = [
  { constraintId: 'creatureHeight', describe: '重力越低，生物能长得越高。反推重力上限。' },
  { constraintId: 'mountainHeight', describe: '山峰高度上限与重力成反比。反推重力上限。' },
  { constraintId: 'flyingCreatureMass', describe: '飞行生物质量取决于重力与大气密度。' },
  { constraintId: 'buildingHeight', describe: '建筑高度取决于材料强度与重力。' },
]

/**
 * 反推一个锚点：给出想要的值，解出重力等参数的上限。
 *
 * @param anchorId - 约束 id（如 creatureHeight）
 * @param wanted - 想要的值
 * @param baseWorld - 其余世界参数
 * @returns 反推结果；找不到锚点时返回 null
 */
export function backSolve(
  anchorId: string,
  wanted: number,
  baseWorld: Record<string, unknown> = {},
): AnchorSolution | null {
  const constraint = CONSTRAINTS.find(function (item) { return item.id === anchorId })
  if (!constraint) return null
  if (!Number.isFinite(wanted) || wanted <= 0) return null

  const base = deriveConstraintContext(baseWorld)
  const limits: AnchorSolution['limits'] = []

  // creatureHeight：limit = 25 / gravityRatio  →  gravityRatio <= 25 / wanted
  if (anchorId === 'creatureHeight') {
    const maxRatio = 25 / wanted
    limits.push({
      parameter: 'gravityRatio',
      label: '重力倍数（相对地球）',
      max: maxRatio,
      reason: '陆生生物高度上限 = 25 / 重力倍数；要 ' + wanted + ' 米，则重力倍数 ≤ 25 / ' + wanted + ' = ' + maxRatio.toFixed(3),
    })
    const radius = typeof baseWorld.planetRadius === 'number' ? baseWorld.planetRadius : 1
    const maxMass = maxRatio * radius * radius
    limits.push({
      parameter: 'planetMass',
      label: '行星质量（地球质量）',
      max: maxMass,
      reason: 'g ∝ M/R²；R 取 ' + radius.toFixed(2) + ' 地球半径时，M ≤ ' + maxRatio.toFixed(3) + ' × ' + radius.toFixed(2) + '² = ' + maxMass.toFixed(3),
    })
  }

  // mountainHeight：limit = 9000 / gravityRatio
  if (anchorId === 'mountainHeight') {
    const maxRatio = 9000 / wanted
    limits.push({
      parameter: 'gravityRatio',
      label: '重力倍数（相对地球）',
      max: maxRatio,
      reason: '山峰上限 = 9000 / 重力倍数；要 ' + wanted + ' 米高，则重力倍数 ≤ ' + maxRatio.toFixed(3),
    })
  }

  // flyingCreatureMass：limit = 250 × (ρ/ρE) × (gE/g)
  if (anchorId === 'flyingCreatureMass') {
    const densityRatio = base.airDensity / 1.225
    if (densityRatio > 0) {
      const maxRatio = (250 * densityRatio) / wanted
      limits.push({
        parameter: 'gravityRatio',
        label: '重力倍数（相对地球）',
        max: maxRatio,
        reason: '飞行质量上限 = 250 × 空气密度倍数 / 重力倍数；要 ' + wanted + ' kg、空气密度 ' + densityRatio.toFixed(2) + ' 倍地球时，重力倍数 ≤ ' + maxRatio.toFixed(3),
      })
    }
  }

  // buildingHeight：limit = strength / (density × g)
  if (anchorId === 'buildingHeight') {
    const currentLimit = constraint.limit(base)
    if (currentLimit > 0) {
      const maxRatio = base.gravityRatio * (currentLimit / wanted)
      limits.push({
        parameter: 'gravityRatio',
        label: '重力倍数（相对地球）',
        max: maxRatio,
        reason: '当前极限 ' + currentLimit.toFixed(0) + ' 米；要 ' + wanted + ' 米需把重力降到 ' + maxRatio.toFixed(3) + ' 倍地球',
      })
    }
  }

  if (limits.length === 0) return null

  // 推荐点：取重力上限的 90%，留余量
  const gravityLimit = limits.find(function (item) { return item.parameter === 'gravityRatio' })
  const recommended: Record<string, number> = {}
  if (gravityLimit && gravityLimit.max !== undefined && gravityLimit.max > 0) {
    recommended.gravityRatio = gravityLimit.max * 0.9
    const radius = typeof baseWorld.planetRadius === 'number' ? baseWorld.planetRadius : 1
    recommended.planetMass = recommended.gravityRatio * radius * radius
    recommended.planetRadius = radius
  }

  // 把推荐参数代回正向链路，看是否在其它层冲突
  const conflicts: string[] = []
  let pipeline: PipelineResult | undefined
  if (recommended.planetMass !== undefined) {
    try {
      const worldOut = opWorld({
        world: {
          planetMass: recommended.planetMass,
          planetRadius: recommended.planetRadius,
        },
      } as never, 32)
      pipeline = runPipeline((worldOut as any).value)
      if (pipeline.firstBlocked !== null) {
        conflicts.push(
          '满足锚点后，正向链路在 ' + pipeline.firstBlocked + ' 层出现硬约束冲突——需要再调其它参数，或改叙事细节。',
        )
      }
    } catch {
      conflicts.push('正向链路跑失败，无法确认其它层是否成立。')
    }
  }

  return {
    anchor: anchorId,
    label: constraint.name,
    wanted: wanted,
    unit: constraint.unit,
    limits: limits,
    recommended: recommended,
    pipeline: pipeline,
    conflicts: conflicts,
  }
}

/**
 * 列出可反推的锚点（带当前世界的上限）。
 *
 * @param baseWorld - 世界参数
 * @returns 各锚点及当前上限
 */
export function listAnchors(baseWorld: Record<string, unknown> = {}): Array<{
  id: string
  name: string
  unit: string
  currentLimit: number
  describe: string
}> {
  const ctx = deriveConstraintContext(baseWorld)
  return CONSTRAINTS.filter(function (item) {
    return ANCHORS.some(function (anchor) { return anchor.constraintId === item.id })
  }).map(function (item) {
    const anchor = ANCHORS.find(function (candidate) { return candidate.constraintId === item.id })
    return {
      id: item.id,
      name: item.name,
      unit: item.unit,
      currentLimit: item.limit(ctx),
      describe: anchor ? anchor.describe : '',
    }
  })
}

/**
 * 渲染反推报告。
 *
 * @param solution - backSolve 的结果
 * @returns 可读文本
 */
export function renderBackSolve(solution: AnchorSolution): string {
  const num = function (value: number): string {
    if (!Number.isFinite(value)) return '—'
    const abs = Math.abs(value)
    if (abs >= 1e5 || (abs < 1e-2 && abs > 0)) return value.toExponential(3)
    return Number(value.toPrecision(5)).toString()
  }
  const out: string[] = []
  out.push('═══ 逆推校准：' + solution.label + ' ═══')
  out.push('')
  out.push('  叙事锚点：要 ' + num(solution.wanted) + ' ' + solution.unit)
  out.push('')
  out.push('【反推出的参数窗口】')
  for (const limit of solution.limits) {
    if (limit.max !== undefined) {
      out.push('  ' + limit.label.padEnd(22) + ' ≤ ' + num(limit.max))
    } else if (limit.min !== undefined) {
      out.push('  ' + limit.label.padEnd(22) + ' ≥ ' + num(limit.min))
    }
    out.push('    依据：' + limit.reason)
  }
  out.push('')
  if (Object.keys(solution.recommended).length > 0) {
    out.push('【推荐取值】')
    for (const pair of Object.entries(solution.recommended)) {
      out.push('  ' + pair[0].padEnd(22) + ' = ' + num(pair[1]))
    }
    out.push('')
  }
  if (solution.pipeline) {
    out.push('【用推荐参数跑正向链路】')
    for (const layer of solution.pipeline.layers) {
      // 三种状态分开显示：全允许 / 有边缘项 / 有禁止项。
      // 曾经把「有边缘项」也画成 ✗，与「全链路通过」的结论自相矛盾。
      const hasForbidden = layer.items.some(function (it) { return it.verdict === 'forbidden' })
      const hasMarginal = layer.items.some(function (it) { return it.verdict === 'marginal' })
      const mark = hasForbidden ? '✗' : hasMarginal ? '!' : '✓'
      out.push('  ' + mark + ' ' + layer.layer + ' ' + layer.name +
        (hasMarginal && !hasForbidden ? '（有边缘项）' : ''))
    }
    const verdictText =
      solution.pipeline.firstBlocked !== null
        ? '在 ' + solution.pipeline.firstBlocked + ' 受阻'
        : solution.pipeline.verdict === 'marginal'
          ? '无禁止项，但有边缘项（可接受，需注意）'
          : '全链路通过'
    out.push('  总结论：' + verdictText)
    out.push('')
  }
  if (solution.conflicts.length > 0) {
    out.push('【冲突】')
    for (const conflict of solution.conflicts) out.push('  ⚠ ' + conflict)
    out.push('')
    out.push('处理建议（按优先级）：')
    out.push('  1. 先保硬约束——若大气留不住，这个星球不能住人')
    out.push('  2. 再保核心叙事——若「巨兽」是故事基石，改行星参数而非改巨兽')
    out.push('  3. 再调软约束——可把陆生改成水生/浮力/低代谢，绕开骨骼限制')
    out.push('  4. 最后改细节')
  } else if (solution.pipeline) {
    out.push('✓ 没有发现冲突：这个参数窗口可以同时满足锚点与硬约束。')
  }
  return out.join(String.fromCharCode(10))
}
