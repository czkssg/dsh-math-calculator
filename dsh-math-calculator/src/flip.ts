/**
 * 结论翻转判定：扰动之后，「能不能」变了没有。
 *
 * ## 为什么这和「敏感度」不是一回事
 *
 * `derivation-stack.ts` 的 `sensitivity()` 回答的是「数值变了多少」——
 * 重力从 9.8 变到 11.8，变化 20%，判 `sensitive`。
 *
 * 但作者真正关心的是：**结论变没变**。
 *
 *   例 1：化学火箭要飞出这个星球，Δv 上限 9.4 km/s，逃逸速度 11.2 km/s → 飞不出去。
 *         参数扰动后逃逸速度 11.4 km/s，数值变了 1.8%，结论**没变**（还是飞不出去）。
 *         → 这个设定很稳，作者可以放心用。
 *
 *   例 2：逃逸速度 11.2，Δv 上限 11.3 → 勉强能飞出去。
 *         扰动后逃逸速度 11.4 → 越过 11.3，结论**翻了**（能飞 → 飞不出去）。
 *         → 这个设定踩在悬崖边上，作者必须知道。
 *
 * 数值变化 1.8% 在两种情形下完全相同，但叙事后果天差地别。
 * 所以「翻转」必须单独判定，不能从「变化率大小」推出来。
 *
 * ## 判定方式
 *
 * 不看变化率，看**布尔结论是否改变**。结论由调用方提供判据函数
 * （如 `(x) => x < deltaV_limit`），本模块比较扰动前后的布尔值。
 *
 * @module dsh-math-calculator/flip
 */

/** 一个扰动方向的结果。 */
export interface FlipProbe {
  /** 扰动方向：-1 下调，+1 上调。 */
  direction: -1 | 1
  /** 扰动幅度（如 0.2 = ±20%）。 */
  epsilon: number
  /** 扰动后的输入值。 */
  input: number
  /** 扰动后的判据值（如逃逸速度）。 */
  value: number
  /** 扰动后的布尔结论。 */
  holds: boolean
  /** 相比基线是否翻转。 */
  flipped: boolean
  /** 数值相对变化（仅作参考，不是判据）。 */
  relativeChange: number
}

/** 翻转判定结果。 */
export interface FlipReport {
  /** 基线输入。 */
  base: number
  /** 基线判据值。 */
  baseValue: number
  /** 基线结论。 */
  baseHolds: boolean
  /** 每个方向的探测结果。 */
  probes: FlipProbe[]
  /** 是否有任一方向翻转。 */
  flipped: boolean
  /** 严重度：stable / fragile / critical。 */
  severity: 'stable' | 'fragile' | 'critical'
  /** 一句话结论（给作者看）。 */
  verdict: string
  /** 余量：距离翻转还有多远（相对值）；无法估算时为 undefined。 */
  margin?: number
}

/** 翻转判定的选项。 */
export interface FlipOptions {
  /** 扰动幅度，默认 0.2（±20%）。 */
  epsilon?: number
  /** 判据的中文描述，如「化学火箭能飞出」。 */
  claim?: string
}

/**
 * 判定结论在扰动下会不会翻转。
 *
 * @param evaluate - 由输入算出判据值的函数（如输入质量比 → 逃逸速度）
 * @param judge - 由判据值给出布尔结论（如 `(v) => v < 9.4`）
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
    // 输入必须仍是正数，否则物理上没有意义
    if (!(input > 0)) continue
    const value = evaluate(input)
    const holds = judge(value)
    probes.push({
      direction: direction,
      epsilon: epsilon,
      input: input,
      value: value,
      holds: holds,
      flipped: holds !== baseHolds,
      relativeChange: baseValue === 0 ? 0 : Math.abs((value - baseValue) / baseValue),
    })
  }

  const flipped = probes.some(function (probe) { return probe.flipped })

  /**
   * 余量估算：从基线往前走多远会翻转。
   *
   * 用二分找**最近的**翻转点。两个方向都要找，取更近的那个——
   * 判据当前不成立时，「下调」可能让它成立，那也算翻转（结论变了）。
   */
  let margin: number | undefined
  if (!flipped) {
    /**
     * 找最近的翻转距离（相对基线的比例）。
     *
     * ⚠️ 搜索上界必须**小于 1**：比值 1.0 会让 `base × (1 − ratio)` 变成 0，
     * 超过 1 就变负数——那些点会被 `> 0` 的判断跳过，于是误判成「翻不动」。
     * 之前写成 `eps × 8`（0.2 × 8 = 1.6），恰好在 −0.6 处被跳过，
     * 于是 5g 的人体判据明明 30% 就翻，却报成「量程内都翻不了」。
     *
     * 现在上界取 0.99（还能表示「几乎降到底」），并把搜索做成**由近及远**：
     * 先试 1 倍 eps，不行再试 2 倍，直到 0.99——保证找到的是**最近**的翻转点。
     */
    const flipsAt = (ratio: number): boolean => {
      if (ratio <= 0 || ratio >= 1) return false
      const up = base * (1 + ratio)
      const down = base * (1 - ratio)
      // 两个方向任一翻转即可；但必须是合法的正值输入
      if (up > 0 && judge(evaluate(up)) !== baseHolds) return true
      if (down > 0 && judge(evaluate(down)) !== baseHolds) return true
      return false
    }

    // 由近及远粗扫，找到第一个「会翻」的比例档
    const ladder = [epsilon, epsilon * 2, epsilon * 3, epsilon * 5, 0.5, 0.7, 0.9, 0.99]
    let upper: number | undefined
    for (const candidate of ladder) {
      if (candidate <= 0 || candidate >= 1) continue
      if (flipsAt(candidate)) { upper = candidate; break }
    }
    if (upper !== undefined) {
      // 在 [上一个不翻的档, 会翻的档] 之间二分，逼近真实临界点
      const index = ladder.indexOf(upper)
      let lo = index > 0 ? ladder[index - 1] : 0
      let hi = upper
      for (let step = 0; step < 40; step++) {
        const mid = (lo + hi) / 2
        if (flipsAt(mid)) hi = mid
        else lo = mid
      }
      margin = hi
    }
  }

  let severity: 'stable' | 'fragile' | 'critical'
  if (flipped) {
    // 扰动内就翻了 → 踩在悬崖边
    severity = 'critical'
  } else if (margin !== undefined && margin < epsilon * 2) {
    // 没翻，但余量小于两倍扰动幅度 → 不算稳
    severity = 'fragile'
  } else {
    severity = 'stable'
  }

  const claim = options.claim ? '「' + options.claim + '」' : '这个结论'
  let verdict: string
  if (severity === 'critical') {
    const which = probes.filter(function (probe) { return probe.flipped })
    const dirs = which.map(function (probe) { return probe.direction < 0 ? '下调' : '上调' }).join('、')
    verdict =
      claim + '在 ' + (epsilon * 100).toFixed(0) + '% 扰动下会翻转（' + dirs +
      '时）。这是个踩线的设定：想让叙事稳，给它多留些余量；想写「差一点就成」的焦灼，这正好。'
  } else if (severity === 'fragile') {
    // 注意：基态可能成立也可能不成立，措辞要区分，否则会误导
    const whenNow = baseHolds ? '现在成立' : '现在不成立'
    verdict =
      claim + '在 ' + (epsilon * 100).toFixed(0) + '% 扰动下没有翻转，但余量只有约 ' +
      (margin! * 100).toFixed(1) + '%（' + whenNow + '），再动一点结论就变。'
  } else if (margin !== undefined) {
    verdict =
      claim + '在 ' + (epsilon * 100).toFixed(0) + '% 扰动下不翻转，离翻转还有约 ' +
      (margin * 100).toFixed(0) + '% 余量——这个设定是稳的。'
  } else {
    verdict =
      claim + '在 ' + (epsilon * 100).toFixed(0) + '% 扰动下不翻转，且这个量程内都翻不了——' +
      '结论由别的量决定，不取决于这个参数。'
  }

  return {
    base: base,
    baseValue: baseValue,
    baseHolds: baseHolds,
    probes: probes,
    flipped: flipped,
    severity: severity,
    verdict: verdict,
    ...(margin !== undefined ? { margin: margin } : {}),
  }
}
