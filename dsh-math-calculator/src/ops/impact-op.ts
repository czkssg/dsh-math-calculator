/**
 * operation="impact" 的实现。
 *
 * 从 index.ts 原样迁出（纯搬迁：逻辑、错误消息、输出文本逐字未改）。
 */

import { toJsonValue } from '../format.js'
import { assessImpact, type ImpactLevel } from '../impact.js'
import { CalcError, safeNumberForJson, type MathArgs, type Outcome } from './shared.js'

/**
 * `impact`：改常数后，把全部自然科学公式重算一遍并与现实对比。
 *
 * 这是「牵一发动全身」的量化验证：不只看几个关键公式，
 * 而是把 270 条公式全部跑一遍，算出每条的现实值 vs 异世界值。
 */
export function opImpact(args: MathArgs, engine: any): Outcome {
  const overrides = (args.constants ?? {}) as Record<string, number>

  if (Object.keys(overrides).length === 0) {
    throw new CalcError(
      'invalid_argument',
      '需要 constants 参数指明要改哪个常数',
      '例如 {"c": 1.5e8} 或 {"G": 1.3e-10}。这会跑全部公式并与现实对比。',
    )
  }

  const threshold = typeof args.threshold === 'number' ? args.threshold : 0.001
  const worstLimit = typeof args.worstLimit === 'number' ? Math.max(5, Math.min(50, args.worstLimit)) : 15

  let report
  try {
    report = assessImpact(engine, overrides, { threshold, worstLimit })
  } catch (error) {
    throw new CalcError('internal', `影响评估失败: ${error instanceof Error ? error.message : String(error)}`)
  }

  const lines: string[] = []
  const pct = (value: number): string => {
    if (!Number.isFinite(value)) return '∞'
    const shown = value * 100
    if (Math.abs(shown) >= 1000) return `${shown.toExponential(2)}%`
    return `${shown >= 0 ? '+' : ''}${shown.toFixed(2)}%`
  }
  const levelLabel: Record<ImpactLevel, string> = {
    negligible: '可忽略',
    minor: '轻微',
    significant: '显著',
    drastic: '颠覆',
  }

  lines.push('══════ 全公式影响评估 ══════')
  lines.push('')

  // ── 直接改动 ──
  lines.push('【直接改动的常数】')
  for (const [name, change] of Object.entries(report.changedConstants)) {
    lines.push(`  ${name.padEnd(10)} ${change.from.toExponential(4)} → ${change.to.toExponential(4)}  (${pct(change.relativeChange)})`)
  }

  // ── 被动联动 ──
  if (Object.keys(report.derivedConstants).length > 0) {
    lines.push('')
    lines.push('【被动联动的常数】')
    for (const [name, change] of Object.entries(report.derivedConstants)) {
      lines.push(`  ${name.padEnd(10)} ${change.from.toExponential(4)} → ${change.to.toExponential(4)}  (${pct(change.relativeChange)})`)
    }
  }

  // ── 汇总 ──
  lines.push('')
  lines.push('【公式影响汇总】')
  lines.push(`  参与公式: ${report.totalFormulas} 条`)
  lines.push(`  成功对比: ${report.comparedFormulas} 条`)
  if (report.failedFormulas > 0) {
    lines.push(`  无法自动对比: ${report.failedFormulas} 条（含必填参数或非标量结果）`)
  }
  lines.push('')
  lines.push(`  受影响公式: ${report.affected.length} 条`)
  lines.push(`    · 颠覆 (>50%)    ${report.byLevel.drastic} 条`)
  lines.push(`    · 显著 (5%~50%)  ${report.byLevel.significant} 条`)
  lines.push(`    · 轻微 (0.1%~5%) ${report.byLevel.minor} 条`)
  lines.push(`    · 可忽略 (<0.1%) ${report.byLevel.negligible} 条`)
  lines.push('')
  lines.push(`  总体偏离度: ${report.overallDeviation.toFixed(1)} / 100`)
  lines.push(`  ${report.summary}`)

  // ── 偏差最大 ──
  if (report.worst.length > 0) {
    lines.push('')
    lines.push(`【偏差最大的 ${report.worst.length} 条公式】`)
    lines.push('  公式                              现实值           异世界值          偏差')
    for (const entry of report.worst) {
      const nameDisplay = `${entry.name}（${entry.category}）`.slice(0, 30)
      const baselineText = Math.abs(entry.baseline) > 1e6 || (Math.abs(entry.baseline) < 0.001 && entry.baseline !== 0)
        ? entry.baseline.toExponential(3)
        : entry.baseline.toFixed(4)
      const alteredText = Math.abs(entry.altered) > 1e6 || (Math.abs(entry.altered) < 0.001 && entry.altered !== 0)
        ? entry.altered.toExponential(3)
        : entry.altered.toFixed(4)
      lines.push(
        `  ${nameDisplay.padEnd(32)} ${baselineText.padStart(14)} ${alteredText.padStart(16)} ${pct(entry.relativeChange).padStart(12)}`,
      )
    }
  }

  // ── 按分类统计 ──
  const byCategory = new Map<string, { affected: number; total: number; maxDeviation: number }>()
  for (const entry of report.all) {
    if (entry.failed !== undefined) continue
    const bucket = byCategory.get(entry.category) ?? { affected: 0, total: 0, maxDeviation: 0 }
    bucket.total += 1
    const magnitude = Math.abs(entry.relativeChange)
    if (magnitude >= threshold) bucket.affected += 1
    if (magnitude > bucket.maxDeviation) bucket.maxDeviation = magnitude
    byCategory.set(entry.category, bucket)
  }

  if (byCategory.size > 0) {
    lines.push('')
    lines.push('【分类影响】')
    const sorted = [...byCategory.entries()].sort((left, right) => right[1].maxDeviation - left[1].maxDeviation)
    for (const [category, bucket] of sorted) {
      const ratio = bucket.total > 0 ? ((bucket.affected / bucket.total) * 100).toFixed(0) : '0'
      lines.push(
        `  ${category.padEnd(26)} 受影响 ${String(bucket.affected).padStart(3)}/${String(bucket.total).padStart(3)} (${ratio.padStart(3)}%)  最大偏差 ${pct(bucket.maxDeviation)}`,
      )
    }
  }

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      changed: report.changedConstants,
      derived: report.derivedConstants,
      totalFormulas: report.totalFormulas,
      comparedFormulas: report.comparedFormulas,
      failedFormulas: report.failedFormulas,
      affected: report.affected.length,
      byLevel: report.byLevel,
      overallDeviation: report.overallDeviation,
      summary: report.summary,
      worst: report.worst.map((entry) => ({
        id: entry.id,
        name: entry.name,
        category: entry.category,
        baseline: safeNumberForJson(entry.baseline),
        altered: safeNumberForJson(entry.altered),
        relativeChange: Number.isFinite(entry.relativeChange) ? entry.relativeChange : 'inf',
        level: entry.level,
      })),
      all: report.all.map((entry) => ({
        id: entry.id,
        name: entry.name,
        category: entry.category,
        baseline: safeNumberForJson(entry.baseline),
        altered: safeNumberForJson(entry.altered),
        relativeChange: Number.isFinite(entry.relativeChange) ? entry.relativeChange : 'inf',
        level: entry.level,
        failed: entry.failed ?? null,
      })),
    }),
  }
}
