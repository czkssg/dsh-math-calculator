/**
 * operation="quick_feasible" 的实现：一句话可行性判断。
 *
 * ## 为什么需要它
 *
 * 反馈包 `15` 号的动作 5：
 *
 * > 用户常凭「感觉太离谱」否决（末日、南极两个项目各有一次），
 * > 插件该给「有依据的一句话判断」。
 *
 * 现实是：作者说「这不行吧」时，AI 只能说「确实有点勉强」——
 * **两边都没有依据**。这个 operation 把「感觉」变成一个可核对的判定。
 *
 * ## 关键设计约束：它不许自己算新东西
 *
 * 这个操作**不实现任何新物理**。它只做三件事：
 *
 * ```
 *   ① 从 claim 里认出「这句话在问哪个维度」（能量/材料/时间/人口/尺寸）
 *   ② 把该维度交给**已有的**能力去判（feasibility 上限 / civilization 天花板）
 *   ③ 把结果压成一句人话 + 阻因清单
 * ```
 *
 * 若 claim 里认不出任何可判维度，**明说「判不了」并列出能判什么** ——
 * 编一个「大概勉强」比说「我不知道」有害得多。
 *
 * ## 输出三态
 *
 * ```
 *   可行      所有判到的维度都在上限内
 *   勉强      有维度接近上限（< 2 倍余量）
 *   不可行    有维度明确超限
 *   判不了    认不出可判维度（不猜）
 * ```
 *
 * @module dsh-math-calculator/ops/quick-feasible-op
 */

import { toJsonValue } from '../format.js'
import { CONSTRAINTS, deriveConstraintContext } from '../feasibility.js'
import { energyLimits } from '../civilization.js'
import { CalcError, type MathArgs, type Outcome } from './shared.js'

/** 判定结果三态 + 判不了。 */
type Verdict = 'feasible' | 'marginal' | 'infeasible' | 'unknown'

/** 一条判据。 */
interface CheckResult {
  /** 维度名（能量/材料/尺寸/人口/时间）。 */
  dimension: string
  /** 判到了什么（一句人话）。 */
  finding: string
  /** 这一维是否通过；null 表示没判。 */
  passed: boolean | null
  /** 余量倍数（>1 表示还有余量）。 */
  headroom: number | null
}

/**
 * 从 claim 里认维度。
 *
 * ## 判据是「关键词」而不是「理解」
 *
 * 这是刻意的 —— 工具不做语义理解，只做**可核对的词面匹配**。
 * 认不出就是认不出，比猜错好。
 */
const DIMENSION_HINTS: Array<{ dimension: string; words: string[] }> = [
  {
    dimension: '尺寸',
    words: ['高', '长', '大', '尺寸', '身高', '体长', '塔', '楼', '建筑', '山', '巨兽', '生物'],
  },
  {
    dimension: '能量',
    words: ['能量', '功率', '发电', '瓦', '焦', '散热', '能源', '耗能', '功耗', '卡诺'],
  },
  {
    dimension: '人口',
    words: ['人口', '人', '居民', '兵', '军队', '兵力', '劳力', '劳动力'],
  },
  {
    dimension: '材料',
    words: ['材料', '强度', '抗压', '承重', '钢', '混凝土', '结构'],
  },
  {
    dimension: '时间',
    words: ['年', '月', '天', '周期', '工期', '寿命', '多久', '万年', '百年'],
  },
]

/**
 * 从 claim 里认出涉及的维度。
 *
 * @param claim - 一句话声称
 * @returns 命中的维度名（按命中词数降序）
 */
function detectDimensions(claim: string): string[] {
  const scored: Array<{ dimension: string; score: number }> = []
  for (const hint of DIMENSION_HINTS) {
    let score = 0
    for (const word of hint.words) {
      if (claim.includes(word)) score += 1
    }
    if (score > 0) scored.push({ dimension: hint.dimension, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((item) => item.dimension)
}

/**
 * 从 claim 里抽出数字与单位（用于尺寸/人口类判断）。
 *
 * @param claim - 一句话声称
 * @returns 抽到的量与单位
 */
function extractQuantity(claim: string): { value: number; unit: string } | null {
  /** 支持「920 亿人」「49 公里」「100 万吨」这类。 */
  const m = claim.match(/([\d.]+)\s*(万亿|亿|万|千)?\s*([^\d\s，。、,.]{1,4})?/)
  if (!m) return null
  const base = Number(m[1])
  if (!Number.isFinite(base)) return null
  const mag = m[2]
  const factor = mag === '万亿' ? 1e12 : mag === '亿' ? 1e8 : mag === '万' ? 1e4 : mag === '千' ? 1e3 : 1
  const unit = (m[3] ?? '').trim()
  return { value: base * factor, unit }
}

/**
 * `quick_feasible`：一句话可行性判断。
 *
 * @param args - 工具参数
 * @returns 结果文本与结构化值
 */
export function opQuickFeasible(args: MathArgs): Outcome {
  const raw = (args as unknown as Record<string, unknown>).quickFeasible
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const claim = typeof obj.claim === 'string' ? obj.claim.trim() : ''
  if (claim === '') {
    throw new CalcError(
      'invalid_argument',
      'quick_feasible 需要 claim（一句话声称）',
      '例如 {operation:"quick_feasible", quickFeasible:{claim:"这个城能养 920 亿人"}}。' +
        '它会把这句话按维度（尺寸/能量/人口/材料/时间）交给已有能力去判，' +
        '认不出可判维度时会**明说判不了**，而不是随便给个「勉强」。',
    )
  }

  const world = (args.world ?? {}) as Record<string, unknown>
  const context = deriveConstraintContext(world)
  const detected = detectDimensions(claim)
  const results: CheckResult[] = []

  /** ① 尺寸类：交给 feasibility 的上限表。 */
  if (detected.includes('尺寸')) {
    const heightMatch = claim.match(/([\d.]+)\s*(米|m|公里|km)\s*(高|长|大|尺寸)/)
    if (heightMatch) {
      const value = Number(heightMatch[1]) * (heightMatch[2] === '公里' || heightMatch[2] === 'km' ? 1000 : 1)
      const isBuilding = /塔|楼|建筑|结构/.test(claim)
      const cap = CONSTRAINTS.find((item) => item.id === (isBuilding ? 'buildingHeight' : 'creatureHeight'))
      if (cap) {
        /**
         * `limit` 是**函数**（按当前世界重力算），不是固定值 ——
         * 用函数算才不会把「地球的上限」套到 2 倍重力的世界上。
         */
        const actual = cap.limit(context)
        const headroom = actual / value
        results.push({
          dimension: '尺寸',
          finding: cap.name + ' ' + showNum(actual) + ' m，声称 ' + showNum(value) + ' m',
          passed: value <= actual,
          headroom,
        })
      }
    } else {
      const q = extractQuantity(claim)
      results.push({
        dimension: '尺寸',
        finding: q
          ? '认出了「' + showNum(q.value) + ' ' + (q.unit || '（无单位）') + '」但判断不出该比哪个上限'
          : '这句话里没认出具体的尺寸数值',
        passed: null,
        headroom: null,
      })
    }
  }

  /**
   * ② 能量类：抽出 claim 里的功率，与行星能量天花板比。
   *
   * ★ 只给「天花板是多少」而不比，等于没判 —— 第一版就是这样，
   * 于是「这个文明需要 5e13 瓦」明明有可比的两个数，却报了「判不了」。
   */
  if (detected.includes('能量')) {
    try {
      const limits = energyLimits(context as never, {})
      const planet = limits.find((item) => /总功率|日照|能量天花板/.test(item.name))
      /** 从 claim 里抽功率：`5e13 瓦`、`50 亿瓦`、`1.6e13 W`。 */
      const powerMatch = claim.match(/([\d.]+)\s*(?:[eE]([+-]?\d+))?\s*(万亿|亿|万|千)?\s*(瓦|W|kW|MW|GW)/i)
      if (planet && powerMatch) {
        const base = Number(powerMatch[1])
        const exp = powerMatch[2] !== undefined ? Math.pow(10, Number(powerMatch[2])) : 1
        const magWord = powerMatch[3]
        const mag = magWord === '万亿' ? 1e12 : magWord === '亿' ? 1e8 : magWord === '万' ? 1e4 : magWord === '千' ? 1e3 : 1
        const unitWord = powerMatch[4].toLowerCase()
        const unitFactor = unitWord === 'kw' ? 1e3 : unitWord === 'mw' ? 1e6 : unitWord === 'gw' ? 1e9 : 1
        const demand = base * exp * mag * unitFactor
        const headroom = planet.value / demand
        results.push({
          dimension: '能量',
          finding: planet.name + ' ' + showNum(planet.value) + ' W，声称需要 ' + showNum(demand) + ' W',
          passed: demand <= planet.value,
          headroom,
        })
      } else if (planet) {
        results.push({
          dimension: '能量',
          finding: '行星能量天花板 ' + showNum(planet.value) + ' W（这句话里没认出具体功率，未比）',
          passed: null,
          headroom: null,
        })
      }
    } catch {
      /* 拿不到就不判 */
    }
  }

  /** ③ 人口类：没有硬上限，真正的约束是粮/水/地。 */
  if (detected.includes('人口')) {
    const q = extractQuantity(claim)
    results.push({
      dimension: '人口',
      finding: q
        ? '人口 ' + showNum(q.value) + ' 本身没有物理硬上限 —— 真正的约束是粮食/水/面积'
        : '人口本身没有物理硬上限 —— 真正的约束是粮食/水/面积',
      passed: null,
      headroom: null,
    })
  }

  /** ④ 材料类：给出本世界的材料基准。 */
  if (detected.includes('材料')) {
    const cap = CONSTRAINTS.find((item) => /strength|material/i.test(item.id))
    if (cap) {
      results.push({
        dimension: '材料',
        finding: cap.name + ' ' + showNum(cap.limit(context)) + ' Pa（本世界基准，' +
          cap.confidence + '）',
        passed: null,
        headroom: null,
      })
    }
  }

  /** ⑤ 时间类：不判（时间可行性靠工期模型，本工具没有）。 */
  if (detected.includes('时间')) {
    results.push({
      dimension: '时间',
      finding: '时间可行性靠工期/演化模型，本工具不判 —— 用 recurrence 或 ode 推时间表',
      passed: null,
      headroom: null,
    })
  }

  /** 汇总三态。 */
  const judged = results.filter((item) => item.passed !== null)
  const failed = judged.filter((item) => item.passed === false)
  const tight = judged.filter((item) => item.passed === true && item.headroom !== null && item.headroom < 2)

  let verdict: Verdict
  if (judged.length === 0) verdict = 'unknown'
  else if (failed.length > 0) verdict = 'infeasible'
  else if (tight.length > 0) verdict = 'marginal'
  else verdict = 'feasible'

  const VERDICT_LABEL: Record<Verdict, string> = {
    feasible: '可行',
    marginal: '勉强',
    infeasible: '不可行',
    unknown: '判不了',
  }

  const lines: string[] = []
  lines.push('═══ 可行性速判 ═══')
  lines.push('')
  lines.push('  声称：' + claim)
  lines.push('  判定：' + VERDICT_LABEL[verdict])
  lines.push('')

  if (results.length > 0) {
    lines.push('  依据：')
    for (const item of results) {
      const mark = item.passed === null ? '·' : item.passed ? '✓' : '✗'
      lines.push('   ' + mark + ' [' + item.dimension + '] ' + item.finding +
        (item.headroom !== null && item.passed ? '（余量 ' + showNum(item.headroom) + ' 倍）' : ''))
    }
    lines.push('')
  }

  /**
   * 一句话结论 —— 这是这个操作存在的理由。
   *
   * 它必须同时说清「能不能」和「卡在哪」，否则作者还是只能凭感觉。
   */
  const oneLine = ((): string => {
    if (verdict === 'infeasible') {
      const worst = failed[0]
      return '不行：' + worst.dimension + '这一维明确超限（' + worst.finding + '）'
    }
    if (verdict === 'marginal') {
      const near = tight[0]
      return '勉强：' + near.dimension + '只剩 ' + showNum(near.headroom ?? 0) + ' 倍余量，' +
        '任何一环变差就会不成立'
    }
    if (verdict === 'feasible') {
      return '可行：判到的 ' + judged.length + ' 个维度都在上限内'
    }
    return '判不了：这句话里认不出可判的维度，**不猜**'
  })()
  lines.push('  ' + oneLine)

  if (verdict === 'unknown') {
    lines.push('')
    /**
     * ★ 说明要分两种情况：
     *
     * ```
     *   认出了维度、但没有可比的数   → 说「认出来了但要给具体数值」
     *   一个维度都没认出            → 才列可判维度清单
     * ```
     *
     * 第一版不分这两种，于是「人口」明明认出来了，
     * 下面还在列「能判的维度（claim 里带上这些词）」—— 自相矛盾。
     */
    if (detected.length > 0) {
      lines.push('  认出了这些维度：' + detected.join('/') +
        ' —— 但句子里没有可直接比对的数值，所以**不判**。')
      lines.push('  要给具体数才判，例如：')
      lines.push('   · 尺寸：「这座塔能有 8000 米高」')
      lines.push('   · 能量：「这个文明需要 5e13 瓦」')
      lines.push('   · 人口：「这个城能养 920 亿人」（人口本身无硬上限，需配 balance 查粮食）')
    } else {
      lines.push('  这句话里**一个可判维度都没认出**。能判的维度（claim 里带上这些词）：')
      for (const hint of DIMENSION_HINTS) {
        lines.push('   · ' + hint.dimension + '：' + hint.words.slice(0, 5).join('/'))
      }
      lines.push('  ★ 工具只做可核对的词面匹配，不做语义理解 —— 认不出就说认不出。')
    }
  }

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      claim,
      verdict,
      verdictLabel: VERDICT_LABEL[verdict],
      oneLine,
      dimensions: detected,
      checks: results,
      blockers: failed.map((item) => item.finding),
    }),
  }
}

/**
 * 数字显示。
 *
 * @param value - 数值
 * @returns 显示串
 */
function showNum(value: number): string {
  if (!Number.isFinite(value)) return '∞'
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e7 || abs < 1e-3) return value.toExponential(3)
  return String(Number(value.toPrecision(6)))
}
