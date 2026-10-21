/**
 * 常数改动的全公式影响评估。
 *
 * 需求：改一个常数后，**把全部自然科学公式重算一遍**，与现实值对比，
 * 算出每个公式的偏差，并按偏差大小分级。
 *
 * 实现思路：
 *   1. 拿现实基线常数跑一遍所有公式 → 得到「现实参考值」
 *   2. 换上改动后的常数再跑一遍 → 得到「异世界值」
 *   3. 逐个公式算相对偏差
 *   4. 按偏差分级（可忽略 / 轻微 / 显著 / 颠覆）
 *   5. 汇总：有多少公式受影响、最大的偏差在哪
 *
 * 为什么这个比单个公式检查更重要：
 *   一个常数改动会在几十个公式里产生差异，只看几个会漏掉量级问题。
 *   比如 c 减半，质能变 1/4（好算），但斯特藩辐射、精细结构常数、
 *   玻尔半径、里德堡能量全都跟着变，而且变的比例完全不同。
 *
 * @module dsh-math-calculator/impact
 */

import { CONSTANTS, FORMULAS } from './formulas.js'
import { recalculateConstants, standardValues } from './constants-graph.js'

/** 偏差等级。 */
export type ImpactLevel = 'negligible' | 'minor' | 'significant' | 'drastic'

/** 单个公式的影响。 */
export interface FormulaImpact {
  /** 公式 id。 */
  id: string
  /** 公式名。 */
  name: string
  /** 分类。 */
  category: string
  /** 现实宇宙下的结果。 */
  baseline: number
  /** 改动后的结果。 */
  altered: number
  /** 相对偏差（altered/baseline - 1）。 */
  relativeChange: number
  /** 绝对偏差。 */
  absoluteChange: number
  /** 偏差等级。 */
  level: ImpactLevel
  /** 是否因计算失败而无法比较。 */
  failed?: string
}

/** 一次评估的汇总。 */
export interface ImpactReport {
  /** 改动的常数。 */
  changedConstants: Record<string, { from: number; to: number; relativeChange: number }>
  /** 推导后被动变化的常数。 */
  derivedConstants: Record<string, { from: number; to: number; relativeChange: number }>
  /** 参与的公式总数。 */
  totalFormulas: number
  /** 成功比较的公式数。 */
  comparedFormulas: number
  /** 计算失败的公式数。 */
  failedFormulas: number
  /** 按等级统计。 */
  byLevel: Record<ImpactLevel, number>
  /** 偏差最大的若干公式。 */
  worst: FormulaImpact[]
  /** 受影响（超过阈值）的公式。 */
  affected: FormulaImpact[]
  /** 全部结果。 */
  all: FormulaImpact[]
  /** 总偏离评分 0-100。 */
  overallDeviation: number
  /** 一句话总结。 */
  summary: string
}

/** 等级阈值（相对偏差）。 */
const LEVEL_THRESHOLD = {
  negligible: 0.001, // <0.1%
  minor: 0.05, // <5%
  significant: 0.5, // <50%
  // 超过 50% 算 drastic
}

/** 判定偏差等级。 */
function levelOf(relativeChange: number): ImpactLevel {
  const magnitude = Math.abs(relativeChange)
  if (magnitude < LEVEL_THRESHOLD.negligible) return 'negligible'
  if (magnitude < LEVEL_THRESHOLD.minor) return 'minor'
  if (magnitude < LEVEL_THRESHOLD.significant) return 'significant'
  return 'drastic'
}

/** 取数值（排除 NaN/Infinity）。 */
function numeric(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'bigint') return Number(value)
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    if (object.isBigNumber || object.isFraction) {
      const converted = Number(String(value))
      return Number.isFinite(converted) ? converted : undefined
    }
    if (typeof object.toNumber === 'function') {
      try {
        const converted = (object.toNumber as () => number)()
        return Number.isFinite(converted) ? converted : undefined
      } catch {
        return undefined
      }
    }
    if (Array.isArray(value)) return undefined // 矩阵不参与标量比较
  }
  return undefined
}

/**
 * 为一条公式的必填参数生成「合理的测试值」。
 *
 * 为什么必须这么做：270 条公式里绝大多数都有必填参数（质量、半径、时间…），
 * 如果见到必填就跳过，就只剩 5 条能对比，评估完全失去意义。
 *
 * 策略：按参数描述里的**单位线索**推断数量级。
 * 这不是求准，而是保证输入落在定义域内、量级合理，
 * 这样「现实 vs 异世界」的**相对偏差**才有意义（绝对值的精度不重要）。
 */
function synthesizeParam(desc: string, name: string): number | number[] | undefined {
  const text = desc.toLowerCase()

  // 数组型参数：给一组和为 1 的份额
  if (desc.includes('数组') || text.includes('array')) {
    return [0.4, 0.35, 0.25]
  }

  // 定义域敏感的参数优先处理
  if (text.includes('折射率')) return name === 'n1' ? 1.5 : 1.0
  if (text.includes('反照率') || text.includes('albedo')) return 0.3
  if (text.includes('发射率') || text.includes('emissivity')) return 0.9
  if (text.includes('效率') || text.includes('efficiency')) return 0.3
  if (text.includes('摩擦') || text.includes('mu') || text.includes('μ')) return 0.3
  if (text.includes('摩尔分数')) return 0.5
  if (text.includes('阻尼')) return 0.2
  if (text.includes('绝热指数') || text.includes('gamma')) return 1.4
  if (text.includes('比热')) return 1000
  if (text.includes('导热')) return 1
  if (text.includes('对流')) return 10
  if (text.includes('阻率') || text.includes('耗散因子')) return 100
  if (text.includes('折射率')) return 1.5
  if (text.includes('相对风险厌恶') || text.includes(' gamma')) return 2
  if (text.includes('帕累托指数') || text.includes('alpha')) return 1.5

  // 按单位量表
  const unitRules: Array<[RegExp, number]> = [
    [/温度|kelvin|\bK\b/, 300],
    [/半径|radius|\br\b.*\bm\b/, 1],
    [/高度|height|\bh\b.*\bm\b/, 10],
    [/距离|distance|深度|跨度/, 10],
    [/时间|time|t\)|\bt\b.*\bs\b/, 10],
    [/速度|velocity|speed/, 10],
    [/加速度|acceleration/, 2],
    [/质量|mass/, 10],
    [/压强|pressure|\bpa\b/, 101325],
    [/面积|area/, 1],
    [/体积|volume/, 1],
    [/长度|length|原长|摆长|管长|弦长/, 1],
    [/力|force/, 100],
    [/频率|frequency|\bhz\b/, 100],
    [/电压|voltage|\bv\b/, 12],
    [/电流|\bA\b|ampere/, 2],
    [/电阻|resistance|ohm|Ω/, 10],
    [/电容|capacitance/, 1e-6],
    [/电感|inductance/, 1e-3],
    [/电荷|charge|coulomb/, 1e-6],
    [/物质的量|\bmol\b/, 1],
    [/摩尔质量/, 0.028],
    [/密度|density/, 1000],
    [/能量|energy|\bJ\b/, 1000],
    [/功率|power|\bW\b/, 1000],
    [/动量/, 10],
    [/位移|displacement/, 10],
    [/项数|次数|个数|level|n\b/, 5],
    [/年数|年份|年龄/, 30],
    [/人口|population|兵力/, 10000],
    [/容量|capacity/, 1000],
    [/GDP|本金|收益|成本|价值/, 1000],
    [/浓度|concentration/, 0.1],
    [/红移/, 0.1],
    [/角度|角|\brad\b|theta|θ/, Math.PI / 4],
    [/波长|wavelength/, 5e-7],
    [/频率/, 100],
    [/体积流量/, 1],
    [/流量/, 1],
    [/摩尔/, 1],
  ]
  for (const rule of unitRules) {
    if (rule[0].test(text) || rule[0].test(desc)) return rule[1]
  }

  // 兜底：给一个中性的正整数
  return 2
}

/**
 * 用给定的常数表跑一条公式。
 *
 * **关键陷阱**（这是首次评估全部为 0% 的原因）：
 * 很多公式的参数自带默认值，而那个默认值恰好就是现实常数，
 * 例如 mass_energy 的 c=299792458、gravitation 的 G=6.6743e-11。
 * 如果直接把这些默认值塞进 scope，就会**覆盖掉改过的常数**，
 * 于是"改 c"对质能公式没有任何影响 —— 评估完全失效。
 *
 * 正确做法：若某个参数的默认值**等于基线常数**，说明它本意就是"引用该常数"，
 * 此时应当用改动后的常数；否则保留它自己的默认值。
 */
function evaluateFormula(
  math: any,
  formula: {
    id: string
    expr: string
    params: Record<string, { value: number | null; desc: string }>
    builtin?: string
  },
  constants: Record<string, number>,
  baselineConstants: Record<string, number>,
  synthesize: boolean,
): number | undefined {
  if (formula.builtin) return undefined

  const scope: Record<string, any> = {}
  for (const [name, value] of Object.entries(CONSTANTS)) {
    scope[name] = math.bignumber(String(constants[name] ?? value))
  }

  for (const [name, spec] of Object.entries(formula.params)) {
    if (spec.value !== null) {
      // 该参数的默认值是否就是某个常数的现实值？如果是，跟随常数改动
      const baseline = baselineConstants[name]
      if (baseline !== undefined && Math.abs(spec.value - baseline) <= Math.abs(baseline) * 1e-9 + 1e-18) {
        scope[name] = math.bignumber(String(constants[name] ?? spec.value))
      } else {
        scope[name] = math.bignumber(String(spec.value))
      }
      continue
    }
    if (!synthesize) return undefined
    const synthesized = synthesizeParam(spec.desc ?? '', name)
    if (synthesized === undefined) return undefined
    if (Array.isArray(synthesized)) {
      scope[name] = math.bignumber(String(synthesized[0]))
    } else {
      scope[name] = math.bignumber(String(synthesized))
    }
  }

  try {
    const raw = math.evaluate(formula.expr, scope)
    return numeric(raw)
  } catch {
    return undefined
  }
}

/**
 * 评估常数改动对全部公式的影响。
 *
 * @param math - 已创建的 BigNumber mathjs 实例（由调用方复用，避免重复创建）
 * @param overrides - 要改的常数
 * @param options - 选项
 */
export function assessImpact(
  math: any,
  overrides: Record<string, number>,
  options: {
    /** 偏差阈值，超过才算"受影响"。默认 0.1% */
    threshold?: number
    /** worst 列表长度。默认 15 */
    worstLimit?: number
  } = {},
): ImpactReport {
  const threshold = options.threshold ?? 0.001
  const worstLimit = options.worstLimit ?? 15

  const baselineConstants = standardValues()
  const recalculated = recalculateConstants(overrides)
  const alteredConstants = recalculated.values

  // 记录常数变化
  const changedConstants: ImpactReport['changedConstants'] = {}
  for (const change of recalculated.changed) {
    changedConstants[change.name] = {
      from: change.from,
      to: change.to,
      relativeChange: change.relativeDelta,
    }
  }
  const derivedConstants: ImpactReport['derivedConstants'] = {}
  for (const change of recalculated.derived) {
    derivedConstants[change.name] = {
      from: change.from,
      to: change.to,
      relativeChange: change.relativeDelta,
    }
  }

  const all: FormulaImpact[] = []

  for (const formula of FORMULAS) {
    const baseline = evaluateFormula(math, formula as any, baselineConstants, baselineConstants, true)
    const altered = evaluateFormula(math, formula as any, alteredConstants, baselineConstants, true)

    if (baseline === undefined || altered === undefined) {
      all.push({
        id: formula.id,
        name: formula.name,
        category: formula.cat,
        baseline: baseline ?? Number.NaN,
        altered: altered ?? Number.NaN,
        relativeChange: Number.NaN,
        absoluteChange: Number.NaN,
        level: 'negligible',
        failed: '无法自动构造输入（含必填参数或结果为非标量）',
      })
      continue
    }

    const absoluteChange = altered - baseline
    // baseline 为 0 时用绝对变化判断
    const relativeChange =
      baseline === 0 ? (altered === 0 ? 0 : Number.POSITIVE_INFINITY) : absoluteChange / Math.abs(baseline)

    all.push({
      id: formula.id,
      name: formula.name,
      category: formula.cat,
      baseline,
      altered,
      relativeChange,
      absoluteChange,
      level: levelOf(relativeChange),
    })
  }

  const compared = all.filter((entry) => entry.failed === undefined)
  const failed = all.filter((entry) => entry.failed !== undefined)

  const byLevel: Record<ImpactLevel, number> = {
    negligible: 0,
    minor: 0,
    significant: 0,
    drastic: 0,
  }
  for (const entry of compared) byLevel[entry.level] += 1

  const affected = compared.filter((entry) => Math.abs(entry.relativeChange) >= threshold)
  const worst = [...affected]
    .sort((left, right) => Math.abs(right.relativeChange) - Math.abs(left.relativeChange))
    .slice(0, worstLimit)

  // 总体偏离：受影响公式的占比 × 平均偏差量级
  const affectedRatio = compared.length > 0 ? affected.length / compared.length : 0
  const meanMagnitude =
    affected.length > 0
      ? affected.reduce((sum, entry) => sum + Math.min(1, Math.abs(entry.relativeChange)), 0) / affected.length
      : 0
  const overallDeviation = Math.min(100, (affectedRatio * 0.5 + meanMagnitude * 0.5) * 100)

  // 总结
  let summary: string
  if (affected.length === 0) {
    summary = '没有公式产生可测量的偏差——这个改动在公式层面几乎无影响。'
  } else if (byLevel.drastic > 0) {
    summary =
      `${affected.length} 条公式受影响，其中 ${byLevel.drastic} 条偏差超过 50%，` +
      `${byLevel.significant} 条在 5%~50%，${byLevel.minor} 条轻微。这个世界在物理上已明显不同于现实。`
  } else if (byLevel.significant > 0) {
    summary = `${affected.length} 条公式受影响（${byLevel.significant} 条显著、${byLevel.minor} 条轻微），量级上仍可与现实类比。`
  } else {
    summary = `${affected.length} 条公式有轻微偏差（均 <5%），读者基本感知不到。`
  }

  return {
    changedConstants,
    derivedConstants,
    totalFormulas: FORMULAS.length,
    comparedFormulas: compared.length,
    failedFormulas: failed.length,
    byLevel,
    worst,
    affected,
    all,
    overallDeviation,
    summary,
  }
}
