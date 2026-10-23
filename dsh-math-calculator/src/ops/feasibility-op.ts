/**
 * operation="feasibility" 的实现。
 *
 * 从 index.ts 原样迁出（纯搬迁：逻辑、错误消息、输出文本逐字未改）。
  *
 * @module dsh-math-calculator/ops/feasibility-op
*/

import { CONSTRAINTS, checkFeasibility, deriveConstraintContext, type ConstraintResult } from '../feasibility.js'
import { toJsonValue } from '../format.js'
import { safeNumberForJson, type MathArgs, type Outcome } from './shared.js'

/**
 * `feasibility`：校验设定是否超出物理上限。
 *
 * 这是插件此前缺的一环 —— quantities 说「上限是多少」，
 * feasibility 检查「你写的设定有没有超过那个上限」。
 *
 * 架空创作最常见的硬伤不是算错，而是设定互相矛盾：
 * 2g 星球上 50 米的巨兽、无大气的世界写声音传播、
 * 铁器时代百万人口的城市。读者说不出哪里不对，但会觉得「不真」。
 */
export function opFeasibility(args: MathArgs): Outcome {
  // 世界参数：允许用 world 参数，未给则用地球
  const worldParams = (args.world ?? {}) as Record<string, unknown>
  const merged: Record<string, unknown> = {}
  // 顶层便捷参数
  for (const key of ['planetRadius', 'planetMass', 'rotationHours', 'obliquityDeg']) {
    const value = (args as unknown as Record<string, unknown>)[key]
    if (typeof value === 'number') merged[key] = value
  }
  Object.assign(merged, worldParams)

  const environment = deriveConstraintContext(merged)
  const lines: string[] = []

  const sci = (value: number): string => {
    if (!Number.isFinite(value)) return '∞'
    const abs = Math.abs(value)
    if (abs === 0) return '0'
    if (abs >= 1e6 || abs < 0.01) return value.toExponential(3)
    return Number(value.toPrecision(5)).toString()
  }

  lines.push('══════ 设定一致性校验 ══════')
  lines.push('')
  lines.push('【世界环境】')
  lines.push(`  表面重力 ${environment.gravity.toFixed(2)} m/s²（地球的 ${environment.gravityRatio.toFixed(2)} 倍）`)
  lines.push(`  大气密度 ${environment.airDensity.toFixed(3)} kg/m³（地球 1.225）`)
  lines.push(`  材料抗压强度 ${sci(environment.materialStrength)} Pa，密度 ${sci(environment.materialDensity)} kg/m³`)
  lines.push(`  自转 ${environment.rotationHours.toFixed(1)} 小时`)
  lines.push('')

  // ── 只列上限 ──
  if (args.listConstraints === true || !args.claims || Object.keys(args.claims).length === 0) {
    lines.push('【本世界的物理上限】（未给 claims，只列上限）')
    lines.push('')
    lines.push('  约束 id                     名称                    上限')
    for (const constraint of CONSTRAINTS) {
      const limit = constraint.limit(environment)
      lines.push(
        '  ' + constraint.id.padEnd(28) + constraint.name.padEnd(22) +
          sci(limit).padStart(10) + ' ' + constraint.unit,
      )
    }
    lines.push('')
    lines.push('用法：传 claims 校验你的设定，例如')
    lines.push('  {"operation":"feasibility","world":{"planetMass":2},"claims":{"creatureHeight":50,"buildingHeight":3000}}')
    lines.push('')
    lines.push('约束 id 与依据：')
    for (const constraint of CONSTRAINTS) {
      const confidenceLabel =
        constraint.confidence === 'exact' ? '硬约束' :
        constraint.confidence === 'empirical' ? '经验值' : '惯例'
      lines.push('')
      lines.push(`  · ${constraint.id}（${confidenceLabel}）`)
      lines.push(`    ${constraint.formula}`)
      lines.push(`    ${constraint.basis}`)
    }
    return {
      result: lines.join('\n'),
      value: toJsonValue({
        environment,
        limits: CONSTRAINTS.map((c) => ({
          id: c.id,
          name: c.name,
          category: c.category,
          unit: c.unit,
          limit: safeNumberForJson(c.limit(environment)),
          confidence: c.confidence,
          formula: c.formula,
        })),
      }),
    }
  }

  // ── 执行校验 ──
  const report = checkFeasibility(merged, args.claims)

  const verdictLabel = (verdict: ConstraintResult['verdict']): string =>
    verdict === 'safe' ? '✓ 安全' : verdict === 'marginal' ? '⚠ 接近极限' : '✗ 超限'

  lines.push('【校验结果】')
  lines.push('')
  lines.push('  判定            设定值          物理上限        比值    约束')
  for (const result of report.results) {
    lines.push(
      '  ' + verdictLabel(result.verdict).padEnd(14) +
        (sci(result.claimed) + ' ' + result.unit).padStart(18) +
        (sci(result.limit) + ' ' + result.unit).padStart(16) +
        (result.ratio.toFixed(2) + '×').padStart(9) +
        '   ' + result.name,
    )
  }

  // ── 违规详情 ──
  if (report.violations.length > 0) {
    lines.push('')
    lines.push('【超限说明】')
    for (const violation of report.violations) {
      lines.push('')
      lines.push(`  ✗ ${violation.name}（${violation.category}，置信度 ${violation.confidence}）`)
      lines.push(`    公式: ${violation.formula}`)
      lines.push(`    依据: ${violation.basis}`)
      lines.push(`    ${violation.explanation}`)
      if (violation.suggestion) lines.push(`    → 建议: ${violation.suggestion}`)
    }
  }

  // ── 边缘提示 ──
  if (report.marginal.length > 0) {
    lines.push('')
    lines.push('【接近极限（仍可行，但需要文本解释）】')
    for (const item of report.marginal) {
      lines.push(`  ⚠ ${item.name}: 设定 ${sci(item.claimed)} ${item.unit}，上限 ${sci(item.limit)} ${item.unit}（${item.ratio.toFixed(2)}×）`)
      if (item.suggestion) lines.push(`    → ${item.suggestion}`)
    }
  }

  lines.push('')
  lines.push('【总判定】')
  const overallLabel =
    report.overall === 'consistent' ? '自洽' :
    report.overall === 'stretched' ? '勉强成立' : '存在矛盾'
  lines.push(`  ${overallLabel}`)
  lines.push(`  ${report.summary}`)
  lines.push('')
  lines.push('注：经验值类约束有 2~3 倍不确定性，轻微超限可通过在文本中给出解释来消解。')

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      environment: report.environment,
      overall: report.overall,
      summary: report.summary,
      results: report.results.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        unit: r.unit,
        claimed: safeNumberForJson(r.claimed),
        limit: safeNumberForJson(r.limit),
        ratio: Number.isFinite(r.ratio) ? r.ratio : 'inf',
        verdict: r.verdict,
        confidence: r.confidence,
        formula: r.formula,
        explanation: r.explanation,
        suggestion: r.suggestion ?? null,
      })),
      violations: report.violations.map((v) => v.id),
      marginal: report.marginal.map((m) => m.id),
    }),
  }
}
