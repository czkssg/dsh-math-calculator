/**
 * 结论翻转判定：扰动之后，「能不能」变了没有。
 *
 * ## 与 sensitivity 的分工
 *
 * sensitivity 回答「数值变了多少」；flip 回答「结论变没变」。
 * 数值变化 1.8% 在「飞不出去→还是飞不出去」与「能飞→飞不出去」两种情形下完全相同，
 * 但叙事后果天差地别。所以翻转必须单独判定，不能从变化率大小推出来。
 *
 * ## 判定方式
 *
 * 不看变化率，看布尔结论是否改变。结论由调用方提供判据（如 `(x) => x < 9.4`）。
 *
 * @module dsh-math-calculator/features/deduction/flip
 */

/** 一个扰动方向的结果。 */
export interface FlipProbe {
  direction: -1 | 1
  epsilon: number
  input: number
  value: number
  holds: boolean
  flipped: boolean
  relativeChange: number
}

/** 翻转判定结果。 */
export interface FlipReport {
  base: number
  baseValue: number
  baseHolds: boolean
  probes: FlipProbe[]
  flipped: boolean
  severity: 'stable' | 'fragile' | 'critical'
  verdict: string
  margin?: number
}

/** 选项。 */
export interface FlipOptions {
  epsilon?: number
  claim?: string
}

/**
 * 判定结论在扰动下会不会翻转。
 *
 * @param evaluate - 输入 → 判据值
 * @param judge - 判据值 → 布尔结论
 * @param base - 基线输入
 * @param options - 扰动幅度与描述
 * @returns 翻转报告
 */
export function checkFlip(
  evaluate: (input: number) => number,
  judge: (value: number) => boolean,
  base: number,
  options: FlipOptions = {},
): FlipReport {
  const epsilon = options.epsilon ?? 0.2
  const baseValue = evaluate(base)
  const baseHolds = judge(baseValue)
  const probes: FlipProbe[] = []

  for (const direction of [-1, 1] as const) {
    const input = base * (1 + direction * epsilon)
    if (!(input > 0)) continue
    const value = evaluate(input)
    const holds = judge(value)
    probes.push({
      direction,
      epsilon,
      input,
      value,
      holds,
      flipped: holds !== baseHolds,
      relativeChange: baseValue === 0 ? 0 : Math.abs((value - baseValue) / baseValue),
    })
  }

  const flipped = probes.some((probe) => probe.flipped)

  /**
   * 余量：从基线往前走多远会翻转。
   * 搜索上界必须小于 1（比值 1.0 会把输入降到 0，那些点会被跳过而误判成翻不动）。
   */
  let margin: number | undefined
  if (!flipped) {
    const flipsAt = (ratio: number): boolean => {
      if (ratio <= 0 || ratio >= 1) return false
      const up = base * (1 + ratio)
      const down = base * (1 - ratio)
      if (up > 0 && judge(evaluate(up)) !== baseHolds) return true
      if (down > 0 && judge(evaluate(down)) !== baseHolds) return true
      return false
    }
    const ladder = [epsilon, epsilon * 2, epsilon * 3, epsilon * 5, 0.5, 0.7, 0.9, 0.99]
    let upper: number | undefined
    for (const candidate of ladder) {
      if (candidate <= 0 || candidate >= 1) continue
      if (flipsAt(candidate)) {
        upper = candidate
        break
      }
    }
    if (upper !== undefined) {
      const index = ladder.indexOf(upper)
      let lo = index > 0 ? ladder[index - 1] : 0
      let hi = upper
      for (let step = 0; step < 40; step += 1) {
        const mid = (lo + hi) / 2
        if (flipsAt(mid)) hi = mid
        else lo = mid
      }
      margin = hi
    }
  }

  let severity: 'stable' | 'fragile' | 'critical'
  if (flipped) severity = 'critical'
  else if (margin !== undefined && margin < epsilon * 2) severity = 'fragile'
  else severity = 'stable'

  const claim = options.claim ? '「' + options.claim + '」' : '这个结论'
  let verdict: string
  if (severity === 'critical') {
    const dirs = probes.filter((probe) => probe.flipped).map((probe) => (probe.direction < 0 ? '下调' : '上调')).join('、')
    verdict = claim + '在 ' + (epsilon * 100).toFixed(0) + '% 扰动下会翻转（' + dirs + '时）。这是个踩线的设定：想让叙事稳，给它多留些余量；想写「差一点就成」的焦灼，这正好。'
  } else if (severity === 'fragile') {
    const whenNow = baseHolds ? '现在成立' : '现在不成立'
    verdict = claim + '在 ' + (epsilon * 100).toFixed(0) + '% 扰动下没有翻转，但余量只有约 ' + ((margin ?? 0) * 100).toFixed(1) + '%（' + whenNow + '），再动一点结论就变。'
  } else if (margin !== undefined) {
    verdict = claim + '在 ' + (epsilon * 100).toFixed(0) + '% 扰动下不翻转，离翻转还有约 ' + (margin * 100).toFixed(0) + '% 余量——这个设定是稳的。'
  } else {
    verdict = claim + '在 ' + (epsilon * 100).toFixed(0) + '% 扰动下不翻转，且这个量程内都翻不了——结论由别的量决定，不取决于这个参数。'
  }

  return { base, baseValue, baseHolds, probes, flipped, severity, verdict, ...(margin !== undefined ? { margin } : {}) }
}

/** 一条内置判据。 */
export interface FlipClaim {
  id: string
  label: string
  formula: string
  evaluate: (input: number) => number
  judge: (value: number) => boolean
}

/** 地球基准值（只用于把「倍率」换成物理量）。 */
const EARTH = {
  escapeVelocityKmS: 11.186,
  /** 化学火箭的 Δv 上限（km/s）。液氢液氧理论约 9.4，工程实现更低。 */
  chemicalDeltaVKmS: 9.4,
  /** 人的骨骼强度体重比容限：约能承受 3—4 倍地球重力。 */
  humanGravityLimit: 3.5,
  /** 碳基飞行生物的质量上限（kg）。 */
  flyingMassLimitKg: 50,
}

/** 内置判据表。每条对应一个作者真会问的「能不能」。 */
export const FLIP_CLAIMS: FlipClaim[] = [
  {
    id: 'rocket',
    label: '化学火箭能飞出这个星球',
    formula: '判据值 = 逃逸速度 × 输入倍率；成立条件 = 判据值 < 化学火箭 Δv 上限 ' + EARTH.chemicalDeltaVKmS + ' km/s',
    evaluate: (input: number): number => EARTH.escapeVelocityKmS * input,
    judge: (value: number): boolean => value < EARTH.chemicalDeltaVKmS,
  },
  {
    id: 'human',
    label: '人能在这个重力下站立',
    formula: '判据值 = 地球重力 × 输入倍率；成立条件 = 判据值 < 人体耐受上限 ' + EARTH.humanGravityLimit + ' g',
    evaluate: (input: number): number => input,
    judge: (value: number): boolean => value < EARTH.humanGravityLimit,
  },
  {
    id: 'flight',
    label: '碳基生物能靠肌肉飞行',
    formula: '判据值 = 体重（kg），随重力线性增长；成立条件 = 判据值 < 飞行质量上限 ' + EARTH.flyingMassLimitKg + ' kg',
    evaluate: (input: number): number => 10 * input,
    judge: (value: number): boolean => value < EARTH.flyingMassLimitKg,
  },
  {
    id: 'escape_keeps_atmosphere',
    label: '这个星球能留住大气',
    formula: '判据值 = 逃逸速度 × 输入倍率；成立条件 = 判据值 > 保留大气的经验下限 6 km/s',
    evaluate: (input: number): number => EARTH.escapeVelocityKmS * input,
    judge: (value: number): boolean => value > 6,
  },
]
