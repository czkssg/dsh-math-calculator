/**
 * 算力估算：跑之前先知道代价。
 *
 * 单个基本计算单元按 0.2ms 估（时间轴每步要做亮度/宜居带/热流三组计算并分配对象）。
 * 宁可高估也不要低估——低估会让人误以为可以随便跑。
 *
 * 插件不拒绝请求，只让调用方知道代价与降级选项。
 *
 * @module dsh-math-calculator/features/deduction/compute-budget
 */

/** 估算结果。 */
export interface CostEstimate {
  operation: string
  units: number
  estimatedMs: number
  estimatedMB: number
  risk: 'fast' | 'moderate' | 'slow' | 'very-slow'
  note: string
  downgrade: Array<{ option: string; saves: string; tradeoff: string }>
}

/** 单元耗时（ms）。 */
export const UNIT_COST_MS = 0.2
/** 单元内存（KB）。 */
export const UNIT_MEMORY_KB = 0.5
/** 风险阈值（ms）。 */
export const THRESHOLDS = { moderate: 500, slow: 3000, verySlow: 15000 }

/** 由单元数构造估算。 */
function buildEstimate(operation: string, units: number, resultCount: number): CostEstimate {
  const estimatedMs = units * UNIT_COST_MS
  const estimatedMB = (resultCount * UNIT_MEMORY_KB) / 1024
  let risk: CostEstimate['risk'] = 'fast'
  if (estimatedMs >= THRESHOLDS.verySlow) risk = 'very-slow'
  else if (estimatedMs >= THRESHOLDS.slow) risk = 'slow'
  else if (estimatedMs >= THRESHOLDS.moderate) risk = 'moderate'
  const note =
    risk === 'fast'
      ? '很快，直接算就行。'
      : risk === 'moderate'
        ? '要等几秒，可以接受。'
        : risk === 'slow'
          ? '要等十几秒——建议先估一下是否值得。'
          : '会算很久（超过 15 秒）。强烈建议降级，或者接受等待。'
  const downgrade: CostEstimate['downgrade'] = []
  if (risk === 'slow' || risk === 'very-slow') {
    downgrade.push({ option: '减少采样点数（约减半）', saves: '约省 50% 时间', tradeoff: '曲线会更粗糙，可能错过窄峰' })
    downgrade.push({ option: '只算关心区间（缩小范围）', saves: '按范围比例省时间', tradeoff: '看不到全貌，需要先知道大致位置' })
    downgrade.push({ option: '先粗扫再精算（两阶段）', saves: '通常省 70—90%', tradeoff: '多一次交互，但结论更可靠' })
  }
  return { operation, units, estimatedMs, estimatedMB, risk, note, downgrade }
}

/** 时间轴。 */
export function estimateTimeline(steps: number, withPipeline = false): CostEstimate {
  const baseUnits = steps * 20
  const pipelineUnits = withPipeline ? steps * 400 : 0
  return buildEstimate('时间轴 (' + steps + ' 步' + (withPipeline ? ' + 推演栈' : '') + ')', baseUnits + pipelineUnits, steps)
}

/** 相图。 */
export function estimatePhase(xSteps: number, ySteps: number): CostEstimate {
  return buildEstimate('相图 (' + xSteps + '×' + ySteps + ')', xSteps * ySteps * 30, xSteps * ySteps)
}

/** 逆推。 */
export function estimateBackSolve(iterations: number): CostEstimate {
  return buildEstimate('逆推校准 (' + iterations + ' 次迭代)', iterations * 50, 1)
}

/** 扫描。 */
export function estimateSweep(combos: number): CostEstimate {
  return buildEstimate('参数扫描 (' + combos + ' 组)', combos * 120, combos)
}

/** 是否该预警。 */
export function shouldWarn(estimate: CostEstimate): boolean {
  return estimate.risk === 'slow' || estimate.risk === 'very-slow'
}

/** 渲染。 */
export function renderCost(estimate: CostEstimate): string {
  const label = { fast: '快', moderate: '中等', slow: '慢', 'very-slow': '很慢' }[estimate.risk]
  const out: string[] = [
    '═══ 算力估算：' + estimate.operation + ' ═══',
    '',
    '  计算单元：' + estimate.units.toExponential(2),
    '  估算耗时：' + (estimate.estimatedMs >= 1000 ? (estimate.estimatedMs / 1000).toFixed(1) + ' 秒' : estimate.estimatedMs.toFixed(0) + ' 毫秒'),
    '  估算内存：' + estimate.estimatedMB.toFixed(2) + ' MB',
    '  风险等级：' + label,
    '',
    '  ' + estimate.note,
  ]
  if (estimate.downgrade.length > 0) {
    out.push('', '【降级建议】')
    for (const item of estimate.downgrade) out.push('  · ' + item.option, '    ' + item.saves + '；代价：' + item.tradeoff)
  }
  out.push('', '说明：这些是估算值（经验系数），实际耗时会有波动。插件不会拒绝请求，只是让你知道代价。')
  return out.join('\n')
}
