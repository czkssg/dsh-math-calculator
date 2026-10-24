/**
 * 算力预警与降级：在算之前先说清代价。
 *
 * @module dsh-math-calculator/compute-budget
 * @description
 * 方案补丁5。有些推演请求看起来合理，实际会算很久：
 *
 *   · 时间轴 1000 步 × 每步跑完整推演栈；
 *   · 相图 200×200 网格 × 每次求值；
 *   · 逆推校准的高精度二分搜索。
 *
 * 问题是：**用户不知道这个请求有多贵**，点下去就卡住。
 *
 * 所以这里做三件事：
 * 1. **估代价**：按规模参数估算耗时与内存；
 * 2. **预警**：超过阈值时明确告知代价；
 * 3. **降级建议**：给出更省算力但结论不变的替代方案。
 *
 * ## 原则：不拒绝，只提醒
 *
 * 延续用户定位——插件不阻止任何请求，只说「这要花多久」和「可以怎么省」。
 */

/** 一次计算的代价估算。 */
export interface CostEstimate {
  /** 操作名。 */
  operation: string
  /** 估算的计算次数（基本单元）。 */
  units: number
  /** 估算耗时（毫秒）。 */
  estimatedMs: number
  /** 估算内存（MB）。 */
  estimatedMB: number
  /** 风险等级。 */
  risk: 'fast' | 'moderate' | 'slow' | 'very-slow'
  /** 说明。 */
  note: string
  /** 降级建议（若风险高）。 */
  downgrade: Array<{ option: string; saves: string; tradeoff: string }>
}

/**
 * 单个基本计算单元的耗时估算（毫秒）。
 *
 * ⚠️ 这个系数曾经取 0.02，导致 1000 步时间轴被估成 0.4 秒（实际是秒级）。
 * 时间轴每步要做亮度/宜居带/热流三组计算，还带对象分配，
 * 实测量级约 0.2ms/单元。宁可高估也不要低估——低估会让人误以为可以随便跑。
 */
export const UNIT_COST_MS = 0.2

/** 单个结果的内存估算（KB）。 */
export const UNIT_MEMORY_KB = 0.5

/** 风险阈值（毫秒）。 */
export const THRESHOLDS = {
  moderate: 500,
  slow: 3000,
  verySlow: 15000,
}

/**
 * 估算时间轴推演的代价。
 *
 * @param steps - 采样点数
 * @param withPipeline - 每步是否跑完整推演栈
 * @returns 代价估算
 */
export function estimateTimeline(steps: number, withPipeline = false): CostEstimate {
  // 每步的基础开销：亮度/宜居带/热流计算
  const baseUnits = steps * 20
  // 若每步跑推演栈，开销放大
  const pipelineUnits = withPipeline ? steps * 400 : 0
  return buildEstimate('时间轴 (' + steps + ' 步' + (withPipeline ? ' + 推演栈' : '') + ')',
    baseUnits + pipelineUnits, steps)
}

/**
 * 估算相图切片的代价。
 *
 * @param xSteps - X 轴采样数
 * @param ySteps - Y 轴采样数
 * @returns 代价估算
 */
export function estimatePhase(xSteps: number, ySteps: number): CostEstimate {
  return buildEstimate('相图 (' + xSteps + '×' + ySteps + ')', xSteps * ySteps * 30,
    xSteps * ySteps)
}

/**
 * 估算逆推校准的代价。
 *
 * @param iterations - 二分迭代次数
 * @returns 代价估算
 */
export function estimateBackSolve(iterations: number): CostEstimate {
  return buildEstimate('逆推校准 (' + iterations + ' 次迭代)', iterations * 50, 1)
}

/**
 * 估算步数扫描的代价（创造性枚举大量参数组合）。
 *
 * @param combos - 组合数
 * @returns 代价估算
 */
export function estimateSweep(combos: number): CostEstimate {
  return buildEstimate('参数扫描 (' + combos + ' 组)', combos * 120, combos)
}

/**
 * 由计算单元数构造估算。
 *
 * @param operation - 操作名
 * @param units - 计算单元数
 * @param resultCount - 结果数量（用于估内存）
 * @returns 代价估算
 */
function buildEstimate(operation: string, units: number, resultCount: number): CostEstimate {
  const estimatedMs = units * UNIT_COST_MS
  const estimatedMB = (resultCount * UNIT_MEMORY_KB) / 1024

  let risk: CostEstimate['risk'] = 'fast'
  if (estimatedMs >= THRESHOLDS.verySlow) risk = 'very-slow'
  else if (estimatedMs >= THRESHOLDS.slow) risk = 'slow'
  else if (estimatedMs >= THRESHOLDS.moderate) risk = 'moderate'

  const note = risk === 'fast'
    ? '很快，直接算就行。'
    : risk === 'moderate'
      ? '要等几秒，可以接受。'
      : risk === 'slow'
        ? '要等十几秒——建议先估一下是否值得。'
        : '会算很久（超过 15 秒）。强烈建议降级，或者接受等待。'

  const downgrade: CostEstimate['downgrade'] = []
  if (risk === 'slow' || risk === 'very-slow') {
    downgrade.push({
      option: '减少采样点数（约减半）',
      saves: '约省 50% 时间',
      tradeoff: '曲线会更粗糙，可能错过窄峰',
    })
    downgrade.push({
      option: '只算关心区间（缩小范围）',
      saves: '按范围比例省时间',
      tradeoff: '看不到全貌，需要先知道大致位置',
    })
    downgrade.push({
      option: '先粗扫再精算（两阶段）',
      saves: '通常省 70—90%',
      tradeoff: '多一次交互，但结论更可靠',
    })
  }

  return {
    operation: operation,
    units: units,
    estimatedMs: estimatedMs,
    estimatedMB: estimatedMB,
    risk: risk,
    note: note,
    downgrade: downgrade,
  }
}

/**
 * 判断是否该预警。
 *
 * @param estimate - 代价估算
 * @returns 是否预警
 */
export function shouldWarn(estimate: CostEstimate): boolean {
  return estimate.risk === 'slow' || estimate.risk === 'very-slow'
}

/**
 * 渲染代价报告。
 *
 * @param estimate - 代价估算
 * @returns 可读文本
 */
export function renderCost(estimate: CostEstimate): string {
  const out: string[] = []
  const label = { fast: '快', moderate: '中等', slow: '慢', 'very-slow': '很慢' }[estimate.risk]
  out.push('═══ 算力估算：' + estimate.operation + ' ═══')
  out.push('')
  out.push('  计算单元：' + estimate.units.toExponential(2))
  out.push('  估算耗时：' + (estimate.estimatedMs >= 1000
    ? (estimate.estimatedMs / 1000).toFixed(1) + ' 秒'
    : estimate.estimatedMs.toFixed(0) + ' 毫秒'))
  out.push('  估算内存：' + estimate.estimatedMB.toFixed(2) + ' MB')
  out.push('  风险等级：' + label)
  out.push('')
  out.push('  ' + estimate.note)
  if (estimate.downgrade.length > 0) {
    out.push('')
    out.push('【降级建议】')
    for (const item of estimate.downgrade) {
      out.push('  · ' + item.option)
      out.push('    ' + item.saves + '；代价：' + item.tradeoff)
    }
  }
  out.push('')
  out.push('说明：这些是估算值（经验系数），实际耗时会有波动。插件不会拒绝你的请求，只是让你知道代价。')
  return out.join(String.fromCharCode(10))
}
