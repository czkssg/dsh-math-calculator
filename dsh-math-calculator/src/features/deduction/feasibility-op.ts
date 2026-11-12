/**
 * `feasibility` 的 op 包装：参数归一 + 渲染。
 *
 * ## claims 只收对象
 *
 * 数组形态 `[{claim,value,unit}]` 会在 `Object.keys` 处"通过"，然后被整批丢弃，
 * 最后返回「全部 0 项自洽」——假通过比报错危险得多，所以这里直接拒绝数组（A33 教训）。
 *
 * ## 渲染与数据分开
 *
 * `result` 是给人读的表格，`value` 是给程序读的完整结果。提示走 `notice`。
 *
 * @module dsh-math-calculator/features/deduction/feasibility-op
 */

import { CalcError } from '../../core/errors.js'
import { CONSTRAINTS, checkFeasibility, deriveConstraintContext } from './feasibility.js'

/** 输入。 */
export interface FeasibilityOpInput {
  /** 世界参数（与 world 同字段；缺省 = 地球）。 */
  world?: Record<string, unknown>
  /** 待校验设定：约束 id → 数字或带单位字符串。 */
  claims?: Record<string, unknown>
  /** 只列上限，不做校验。 */
  listConstraints?: boolean
}

/** 输出。 */
export interface FeasibilityOpOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 数字渲染。 */
function sci(value: number): string {
  if (!Number.isFinite(value)) return '∞'
  const abs = Math.abs(value)
  if (abs === 0) return '0'
  if (abs >= 1e6 || abs < 0.01) return value.toExponential(3)
  return Number(value.toPrecision(5)).toString()
}

/** 判定标签。 */
function verdictLabel(verdict: 'safe' | 'marginal' | 'violated'): string {
  return verdict === 'safe' ? '✓ 安全' : verdict === 'marginal' ? '⚠ 接近极限' : '✗ 超限'
}

/** 置信度标签。 */
function confidenceLabel(confidence: 'exact' | 'empirical' | 'convention'): string {
  return confidence === 'exact' ? '硬约束' : confidence === 'empirical' ? '经验值' : '惯例'
}

/**
 * 执行 feasibility。
 *
 * @param input - op 输入
 * @returns 渲染结果
 * @throws {CalcError} claims 形态错误 → invalid_argument
 */
export function runFeasibility(input: FeasibilityOpInput = {}): FeasibilityOpOutcome {
  if (Array.isArray(input.claims)) {
    throw new CalcError(
      'invalid_argument',
      'feasibility 的 claims 必须是对象，收到的是数组',
      '正确写法：{"operation":"feasibility","claims":{"cityPopulation":9.2e10,"soldierCount":2e6}}。' +
        '键名可自取，值是数字或带单位字符串（如 "9.2e10 人"）。',
    )
  }

  const world = input.world !== undefined && input.world !== null && typeof input.world === 'object' && !Array.isArray(input.world)
    ? (input.world as Record<string, unknown>)
    : {}
  const environment = deriveConstraintContext(world)
  const lines: string[] = ['══════ 设定一致性校验 ══════', '', '【世界环境】']
  lines.push('  表面重力 ' + environment.gravity.toFixed(2) + ' m/s²（地球的 ' + environment.gravityRatio.toFixed(2) + ' 倍）')
  lines.push('  大气密度 ' + environment.airDensity.toFixed(3) + ' kg/m³（地球 1.225）')
  lines.push('  材料抗压强度 ' + sci(environment.materialStrength) + ' Pa，密度 ' + sci(environment.materialDensity) + ' kg/m³')
  lines.push('  自转 ' + environment.rotationHours.toFixed(1) + ' 小时')
  lines.push('')

  const claims = input.claims
  const hasClaims = claims !== undefined && claims !== null && Object.keys(claims).length > 0

  if (input.listConstraints === true || !hasClaims) {
    lines.push('【本世界的物理上限】（未给 claims，只列上限）')
    lines.push('')
    lines.push('  约束 id                     名称                    上限')
    for (const constraint of CONSTRAINTS) {
      lines.push(
        '  ' + constraint.id.padEnd(28) + constraint.name.padEnd(22) +
          sci(constraint.limit(environment)).padStart(10) + ' ' + constraint.unit,
      )
    }
    lines.push('')
    lines.push('用法：传 claims 校验你的设定，例如')
    lines.push('  {"operation":"feasibility","world":{"planetMass":2},"claims":{"creatureHeight":50,"buildingHeight":3000}}')
    lines.push('')
    lines.push('约束 id 与依据：')
    for (const constraint of CONSTRAINTS) {
      lines.push('')
      lines.push('  · ' + constraint.id + '（' + confidenceLabel(constraint.confidence) + '）')
      lines.push('    ' + constraint.formula)
      lines.push('    ' + constraint.basis)
    }
    return {
      result: lines.join('\n'),
      value: {
        environment,
        limits: CONSTRAINTS.map((c) => ({
          id: c.id,
          name: c.name,
          category: c.category,
          unit: c.unit,
          limit: c.limit(environment),
          confidence: c.confidence,
          formula: c.formula,
        })),
      },
    }
  }

  const report = checkFeasibility(world, claims as Record<string, unknown>)

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

  if (report.violations.length > 0) {
    lines.push('')
    lines.push('【超限说明】')
    for (const violation of report.violations) {
      lines.push('')
      lines.push('  ✗ ' + violation.name + '（' + violation.category + '，置信度 ' + violation.confidence + '）')
      lines.push('    公式: ' + violation.formula)
      lines.push('    依据: ' + violation.basis)
      lines.push('    ' + violation.explanation)
      if (violation.suggestion) lines.push('    → 建议: ' + violation.suggestion)
    }
  }

  if (report.marginal.length > 0) {
    lines.push('')
    lines.push('【接近极限（仍可行，但需要文本解释）】')
    for (const item of report.marginal) {
      lines.push(
        '  ⚠ ' + item.name + ': 设定 ' + sci(item.claimed) + ' ' + item.unit + '，上限 ' +
          sci(item.limit) + ' ' + item.unit + '（' + item.ratio.toFixed(2) + '×）',
      )
      if (item.suggestion) lines.push('    → ' + item.suggestion)
    }
  }

  lines.push('')
  lines.push('【总判定】')
  const overallLabel = report.overall === 'consistent' ? '自洽' : report.overall === 'stretched' ? '勉强成立' : '存在矛盾'
  lines.push('  ' + overallLabel)
  lines.push('  ' + report.summary)
  lines.push('')
  lines.push('注：经验值类约束有 2~3 倍不确定性，轻微超限可通过在文本中给出解释来消解。')

  return {
    result: lines.join('\n'),
    value: {
      environment: report.environment,
      overall: report.overall,
      summary: report.summary,
      results: report.results.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        unit: r.unit,
        claimed: r.claimed,
        limit: r.limit,
        ratio: r.ratio,
        verdict: r.verdict,
        confidence: r.confidence,
        formula: r.formula,
        explanation: r.explanation,
        suggestion: r.suggestion ?? null,
      })),
      violations: report.violations.map((v) => v.id),
      marginal: report.marginal.map((m) => m.id),
    },
  }
}
