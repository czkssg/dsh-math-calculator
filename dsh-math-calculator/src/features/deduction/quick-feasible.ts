/**
 * 一句话可行性判断（`quick_feasible`）。
 *
 * ## 为什么需要它
 *
 * 作者说「这不行吧」时，AI 只能说「确实有点勉强」——两边都没有依据。
 * 这个 operation 把「感觉」变成可核对的判定。
 *
 * ## 它不许自己算新东西
 *
 * ```
 *   ① 从 claim 里认出「这句话在问哪个维度」（尺寸/能量/人口/材料/时间）
 *   ② 把该维度交给**已有的**能力判（feasibility 的 11 条上限 / 行星截获功率）
 *   ③ 把结果压成一句人话 + 阻因清单
 * ```
 *
 * 认不出可判维度时，明说「判不了」并列出能判什么——编一个「大概勉强」比说「我不知道」有害得多。
 *
 * ## 输出四态
 *
 * ```
 *   可行      所有判到的维度都在上限内
 *   勉强      有维度接近上限（余量 < 2 倍）
 *   不可行    有维度明确超限
 *   判不了    认不出可判维度（不猜）
 * ```
 *
 * @module dsh-math-calculator/features/deduction/quick-feasible
 */

import { CalcError } from '../../core/errors.js'
import { CONSTRAINTS, deriveConstraintContext, type ConstraintContext } from './feasibility.js'
import { BASE_PHYSICS, OUR_KNOBS } from './constants.js'

/** 判定结果。 */
export type QuickVerdict = 'feasible' | 'marginal' | 'infeasible' | 'unknown'

/** 一条判据。 */
export interface QuickCheck {
  dimension: string
  finding: string
  passed: boolean | null
  headroom: number | null
}

/** 结果。 */
export interface QuickFeasibleOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 维度提示词（刻意的词面匹配，不做语义理解）。 */
const DIMENSION_HINTS: Array<{ dimension: string; words: string[] }> = [
  { dimension: '尺寸', words: ['高', '长', '大', '尺寸', '身高', '体长', '塔', '楼', '建筑', '山', '巨兽', '生物'] },
  { dimension: '能量', words: ['能量', '功率', '发电', '瓦', '焦', '散热', '能源', '耗能', '功耗', '卡诺'] },
  { dimension: '人口', words: ['人口', '人', '居民', '兵', '军队', '兵力', '劳力', '劳动力'] },
  { dimension: '材料', words: ['材料', '强度', '抗压', '承重', '钢', '混凝土', '结构'] },
  { dimension: '时间', words: ['年', '月', '天', '周期', '工期', '寿命', '多久', '万年', '百年'] },
]

/** 数字显示。 */
function showNum(value: number): string {
  if (!Number.isFinite(value)) return '∞'
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e7 || abs < 1e-3) return value.toExponential(3)
  return String(Number(value.toPrecision(6)))
}

/** 认维度。 */
function detectDimensions(claim: string): string[] {
  const scored: Array<{ dimension: string; score: number }> = []
  for (const hint of DIMENSION_HINTS) {
    let score = 0
    for (const word of hint.words) if (claim.includes(word)) score += 1
    if (score > 0) scored.push({ dimension: hint.dimension, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((item) => item.dimension)
}

/** 抽数量（含中文量级）。 */
function extractQuantity(claim: string): { value: number; unit: string } | null {
  const match = claim.match(/([\d.]+)\s*(万亿|亿|万|千)?\s*([^\d\s，。、,.]{1,4})?/)
  if (!match) return null
  const base = Number(match[1])
  if (!Number.isFinite(base)) return null
  const mag = match[2]
  const factor = mag === '万亿' ? 1e12 : mag === '亿' ? 1e8 : mag === '万' ? 1e4 : mag === '千' ? 1e3 : 1
  return { value: base * factor, unit: (match[3] ?? '').trim() }
}

/**
 * 行星截获功率（物理天花板）：P = S₀·πR²，S₀ = L/(4πa²)。
 *
 * 这不是「文明能用的功率」，而是「能截获的上限」；actual 利用率远低于 100%。
 *
 * @param ctx - 约束环境
 * @param world - 世界参数（需要恒星光度与行星半径）
 * @returns 截获功率（W）与说明
 */
function planetEnergyCeiling(ctx: ConstraintContext, world: Record<string, unknown>): { value: number; note: string } {
  const num = (key: string, fallback: number): number => {
    const raw = world[key]
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
  }
  const G = OUR_KNOBS.G
  const starMassSun = num('starMass', 1)
  const starRadiusSun = num('starRadius', 1)
  const starTemp = num('starTemp', 5778)
  const orbitAU = num('orbitAU', 1)
  const starMassKg = starMassSun * BASE_PHYSICS.Msun
  const starRadiusM = starRadiusSun * BASE_PHYSICS.Rsun
  const luminosity = 4 * Math.PI * starRadiusM ** 2 * BASE_PHYSICS.sigma * starTemp ** 4
  const distance = orbitAU * BASE_PHYSICS.AU
  const flux = luminosity / (4 * Math.PI * distance ** 2)
  const planetRadiusM = BASE_PHYSICS.Rearth * num('planetRadius', 1)
  const value = flux * Math.PI * planetRadiusM ** 2
  void G
  return {
    value,
    note: '行星截获的恒星功率（100% 利用的物理上限；实际发电/散热利用率远低）',
  }
}

/**
 * 执行 quick_feasible。
 *
 * @param input - claim 与可选世界参数
 * @returns 四态判定
 * @throws {CalcError} 缺 claim → missing_params
 */
export function runQuickFeasible(input: { claim?: string; world?: Record<string, unknown> } | undefined): QuickFeasibleOutcome {
  const claim = typeof input?.claim === 'string' ? input.claim.trim() : ''
  if (claim === '') {
    throw new CalcError(
      'missing_params',
      'quick_feasible 需要 claim（一句话声称）',
      '例如 {quickFeasible:{claim:"这座塔能有 8000 米高"}}。它会按维度交给已有能力判；认不出时明说判不了。',
    )
  }
  const world = input?.world !== undefined && input.world !== null && typeof input.world === 'object' && !Array.isArray(input.world)
    ? input.world
    : {}
  const ctx = deriveConstraintContext(world)
  const detected = detectDimensions(claim)
  const checks: QuickCheck[] = []

  // ① 尺寸
  if (detected.includes('尺寸')) {
    const match = claim.match(/([\d.]+)\s*(米|m|公里|km)\s*(高|长|大|尺寸)/)
    if (match) {
      const value = Number(match[1]) * (match[2] === '公里' || match[2] === 'km' ? 1000 : 1)
      const isBuilding = /塔|楼|建筑|结构/.test(claim)
      const cap = CONSTRAINTS.find((item) => item.id === (isBuilding ? 'buildingHeight' : 'creatureHeight'))
      if (cap) {
        const actual = cap.limit(ctx)
        checks.push({
          dimension: '尺寸',
          finding: cap.name + ' ' + showNum(actual) + ' m，声称 ' + showNum(value) + ' m',
          passed: value <= actual,
          headroom: actual / value,
        })
      }
    } else {
      const quantity = extractQuantity(claim)
      checks.push({
        dimension: '尺寸',
        finding: quantity ? '认出了「' + showNum(quantity.value) + ' ' + (quantity.unit || '（无单位）') + '」但判断不出该比哪个上限' : '这句话里没认出具体的尺寸数值',
        passed: null,
        headroom: null,
      })
    }
  }

  // ② 能量：与行星截获功率比
  if (detected.includes('能量')) {
    const ceiling = planetEnergyCeiling(ctx, world)
    const powerMatch = claim.match(/([\d.]+)\s*(?:[eE]([+-]?\d+))?\s*(万亿|亿|万|千)?\s*(瓦|W|kW|MW|GW)/i)
    if (powerMatch && ceiling.value > 0) {
      const base = Number(powerMatch[1])
      const exp = powerMatch[2] !== undefined ? 10 ** Number(powerMatch[2]) : 1
      const magWord = powerMatch[3]
      const mag = magWord === '万亿' ? 1e12 : magWord === '亿' ? 1e8 : magWord === '万' ? 1e4 : magWord === '千' ? 1e3 : 1
      const unitWord = powerMatch[4].toLowerCase()
      const unitFactor = unitWord === 'kw' ? 1e3 : unitWord === 'mw' ? 1e6 : unitWord === 'gw' ? 1e9 : 1
      const demand = base * exp * mag * unitFactor
      checks.push({
        dimension: '能量',
        finding: '行星截获功率 ' + showNum(ceiling.value) + ' W（' + ceiling.note + '），声称需要 ' + showNum(demand) + ' W',
        passed: demand <= ceiling.value,
        headroom: ceiling.value / demand,
      })
    } else {
      checks.push({
        dimension: '能量',
        finding: '行星截获功率 ' + showNum(ceiling.value) + ' W（这句话里没认出具体功率，未比）',
        passed: null,
        headroom: null,
      })
    }
  }

  // ③ 人口：无物理硬上限
  if (detected.includes('人口')) {
    const quantity = extractQuantity(claim)
    checks.push({
      dimension: '人口',
      finding: quantity
        ? '人口 ' + showNum(quantity.value) + ' 本身没有物理硬上限——真正的约束是粮食/水/面积'
        : '人口本身没有物理硬上限——真正的约束是粮食/水/面积',
      passed: null,
      headroom: null,
    })
  }

  // ④ 材料：给本世界基准
  if (detected.includes('材料')) {
    checks.push({
      dimension: '材料',
      finding: '本世界材料抗压强度基准 ' + showNum(ctx.materialStrength) + ' Pa（建筑上限由它推出）',
      passed: null,
      headroom: null,
    })
  }

  // ⑤ 时间：不判
  if (detected.includes('时间')) {
    checks.push({
      dimension: '时间',
      finding: '时间可行性靠工期/演化模型，本工具不判——用 recurrence 或 ode 推时间表',
      passed: null,
      headroom: null,
    })
  }

  const judged = checks.filter((item) => item.passed !== null)
  const failed = judged.filter((item) => item.passed === false)
  const tight = judged.filter((item) => item.passed === true && item.headroom !== null && item.headroom < 2)

  let verdict: QuickVerdict
  if (judged.length === 0) verdict = 'unknown'
  else if (failed.length > 0) verdict = 'infeasible'
  else if (tight.length > 0) verdict = 'marginal'
  else verdict = 'feasible'

  const VERDICT_LABEL: Record<QuickVerdict, string> = { feasible: '可行', marginal: '勉强', infeasible: '不可行', unknown: '判不了' }
  const lines: string[] = ['═══ 可行性速判 ═══', '', '  声称：' + claim, '  判定：' + VERDICT_LABEL[verdict], '']

  if (checks.length > 0) {
    lines.push('  依据：')
    for (const item of checks) {
      const mark = item.passed === null ? '·' : item.passed ? '✓' : '✗'
      lines.push('   ' + mark + ' [' + item.dimension + '] ' + item.finding + (item.headroom !== null && item.passed ? '（余量 ' + showNum(item.headroom) + ' 倍）' : ''))
    }
    lines.push('')
  }

  const oneLine = ((): string => {
    if (verdict === 'infeasible') return '不行：' + failed[0].dimension + '这一维明确超限（' + failed[0].finding + '）'
    if (verdict === 'marginal') return '勉强：' + tight[0].dimension + '只剩 ' + showNum(tight[0].headroom ?? 0) + ' 倍余量，任何一环变差就会不成立'
    if (verdict === 'feasible') return '可行：判到的 ' + judged.length + ' 个维度都在上限内'
    return '判不了：这句话里认不出可判的维度，不猜'
  })()
  lines.push('  ' + oneLine)

  if (verdict === 'unknown') {
    lines.push('')
    if (detected.length > 0) {
      lines.push('  认出了这些维度：' + detected.join('/') + ' —— 但句子里没有可直接比对的数值，所以不判。')
      lines.push('  要给具体数才判，例如：')
      lines.push('   · 尺寸：「这座塔能有 8000 米高」')
      lines.push('   · 能量：「这个文明需要 5e13 瓦」')
      lines.push('   · 人口：「这个城能养 920 亿人」（人口本身无硬上限，需配 balance 查粮食）')
    } else {
      lines.push('  这句话里一个可判维度都没认出。能判的维度（claim 里带上这些词）：')
      for (const hint of DIMENSION_HINTS) lines.push('   · ' + hint.dimension + '：' + hint.words.slice(0, 5).join('/'))
      lines.push('  ★ 工具只做可核对的词面匹配，不做语义理解——认不出就说认不出。')
    }
  }

  return {
    result: lines.join('\n'),
    value: {
      claim,
      verdict,
      verdictLabel: VERDICT_LABEL[verdict],
      oneLine,
      dimensions: detected,
      checks,
      blockers: failed.map((item) => item.finding),
    },
  }
}
