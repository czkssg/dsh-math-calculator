/**
 * 天体目录查询与常数传导（`bodies`）。
 *
 * ## 两类数据，两种处理
 *
 * ```
 *   天体条目（26 个）   id/名称/类别/物理量{value,unit,dependence,source}
 *   天体类型（32 类）   family/evidence/basis/perception/pitfall…
 * ```
 *
 * 数据由调用方注入（`src/data/bodies.json` 与 `body-taxonomy.json`），
 * 本模块不持有表、不读文件——与 formulas 的约定一致。
 *
 * ## 改常数之后：哪些必须重算、哪些绝不能动
 *
 * 这是本模块存在的理由。改 α 之后：
 *   · 行星质量/半径/轨道 —— 严格不动（定义式里没有 α，让它变才是篡改设定）
 *   · 恒星光度/寿命/温度 —— 必须重算（公式决定）
 *   · 平衡温度 —— **间接依赖**：α 改不透明度 → 改 L → 改 T_eq，不是幂律，
 *     不能给倍数，只能提示"用 world 重跑"
 *   · 大气成分/云量/反照率 —— 历史偶然，没有公式，只能由作者重新设定
 *
 * 把"间接依赖"误列进"不该动"，作者就会拿旧温度写新宇宙——这是最要命的失败模式，
 * 所以输出里三类严格分开。
 *
 * @module dsh-math-calculator/features/deduction/bodies
 */

import { CalcError } from '../../core/errors.js'

/** 一条测量值。 */
export interface MeasuredValue {
  value: number
  unit: string
  dependence?: string
  uncertainty?: number
  source?: string
  domain?: string
}

/** 天体条目（字段平铺：id/name/kind + 若干量）。 */
export interface BodyEntry {
  id: string
  name: string
  kind: string
  spectralType?: string
  luminosityClass?: string
  summary?: string
  notes?: string
  [key: string]: unknown
}

/** 天体类型。 */
export interface BodyTypeEntry {
  id: string
  name: string
  nameEn?: string
  family: string
  evidence: string
  basis?: string
  perception?: string
  massKg?: number
  radiusKm?: number
  gravityG?: number
  tempK?: number
  densityKgM3?: number
  lockedBy?: string
  freeToAuthor?: string
  pitfall?: string
  narrativeUse?: string
  constantDependence?: string
}

/** 一条常数传导规则。 */
export interface ScalingRule {
  quantity: string
  constant: string
  exponent: number
  confidence: 'exact' | 'empirical' | 'order-of-magnitude' | 'direction-only'
  mechanism: string
  domain: string
}

/** 注入的数据。 */
export interface BodiesDeps {
  bodies: BodyEntry[]
  taxonomy: BodyTypeEntry[]
}

/** 常数 → 天体量的传导规则表。 */
export const SCALING_RULES: ScalingRule[] = [
  {
    quantity: '化学键能',
    constant: 'alpha_fs',
    exponent: 2,
    confidence: 'exact',
    mechanism: '里德伯能量 E ∝ α²（库仑势 ∝ α），化学键能同量级',
    domain: 'α 偏离现实 < 50%',
  },
  {
    quantity: '原子尺度（玻尔半径）',
    constant: 'alpha_fs',
    exponent: -1,
    confidence: 'exact',
    mechanism: 'a₀ = ħ/(mₑcα)，严格 ∝ 1/α',
    domain: '任意 α（但 α > 1 时该式失效）',
  },
  {
    quantity: '材料抗压强度',
    constant: 'alpha_fs',
    exponent: 5,
    confidence: 'order-of-magnitude',
    mechanism: '强度 ∝ 键能/原子体积² ∝ α²/α⁻² ≈ α⁵（体积由 a₀³ 缩放）',
    domain: 'α 偏离现实 < 30%；超出后晶体结构本身会变',
  },
  {
    quantity: '恒星核聚变点火温度',
    constant: 'alpha_fs',
    exponent: 2,
    confidence: 'order-of-magnitude',
    mechanism: '库仑势垒 ∝ α²，隧道穿透率对势垒指数敏感',
    domain: '量级估计，实际还依赖强相互作用强度',
  },
  {
    quantity: '恒星寿命',
    constant: 'alpha_fs',
    exponent: 0.5,
    confidence: 'order-of-magnitude',
    mechanism: 'α↑ → 不透明度↑ → 辐射压↑ → 光度↓ → 燃烧更慢。低质量星 τ∝α²，大质量星 τ∝α⁰',
    domain: '低质量星取指数 2，大质量星取 0',
  },
  {
    quantity: '行星平衡温度',
    constant: 'alpha_fs',
    exponent: 0,
    confidence: 'direction-only',
    mechanism:
      'T_eq 不含 α，但 α 改变恒星光度 L，再由 L 间接决定 T_eq。这不是幂律，必须按新 L 重算。',
    domain: '只看方向；具体数值请改 α 后用 world 重算',
  },
  {
    quantity: '行星质量、半径、轨道半长轴',
    constant: 'alpha_fs',
    exponent: 0,
    confidence: 'direction-only',
    mechanism: '这些由引力与初始角动量决定，定义式里没有 α——同一天体质量不变，只是化学与材料性质变了',
    domain: '严格为零：改 α 绝不该改动这些数',
  },
  {
    quantity: '行星反照率',
    constant: 'alpha_fs',
    exponent: 0,
    confidence: 'direction-only',
    mechanism:
      '反照率取决于云、冰、海、植被的分布，是历史与气候的结果，不是 α 的函数。α 变了会改变云滴散射效率，但本模型不重做气候模拟。',
    domain: '无公式可依；只能由作者重新设定',
  },
  {
    quantity: '行星质量、半径、轨道半长轴',
    constant: 'G',
    exponent: 0,
    confidence: 'direction-only',
    mechanism: '这些量由引力与初始角动量决定，不是 G 的函数——同样的质量只是产生了更大的重力',
    domain: '严格为零：改 G 绝不该改动这些数',
  },
  {
    quantity: '表面重力',
    constant: 'G',
    exponent: 1,
    confidence: 'exact',
    mechanism: 'g = GM/R²，严格 ∝ G',
    domain: '任意',
  },
  {
    quantity: '逃逸速度',
    constant: 'G',
    exponent: 0.5,
    confidence: 'exact',
    mechanism: 'v = √(2GM/R)，∝ √G',
    domain: '任意',
  },
  {
    quantity: '轨道周期',
    constant: 'G',
    exponent: -0.5,
    confidence: 'exact',
    mechanism: '开普勒第三定律 P = 2π√(a³/GM)，∝ G^(-1/2)',
    domain: '任意',
  },
  {
    quantity: '恒星最小点火质量',
    constant: 'G',
    exponent: -1.5,
    confidence: 'order-of-magnitude',
    mechanism: 'G↑ → 引力压缩更强 → 更小的质量也能点燃核心',
    domain: '量级估计',
  },
  {
    quantity: 'α（精细结构常数）',
    constant: 'c',
    exponent: -1,
    confidence: 'exact',
    mechanism: 'α = e²/(4πε₀ħc)，严格 ∝ 1/c',
    domain: '任意',
  },
  {
    quantity: '原子尺度（玻尔半径）',
    constant: 'c',
    exponent: 1,
    confidence: 'exact',
    mechanism: '由 α ∝ 1/c 且 a₀ ∝ 1/α 得 a₀ ∝ c',
    domain: '任意',
  },
  {
    quantity: '化学键能',
    constant: 'c',
    exponent: -2,
    confidence: 'exact',
    mechanism: '由 E ∝ α² 且 α ∝ 1/c 得 E ∝ c⁻²',
    domain: '任意',
  },
  {
    quantity: '大气成分、云量、反照率、磁场、板块构造',
    constant: '(任意)',
    exponent: 0,
    confidence: 'direction-only',
    mechanism: '这些是历史偶然的结果，不是物理定律的推论',
    domain: '永远不可推导：只能由作者设定，或引用同类天体的观测值',
  },
]

/** 依赖类别说明。 */
export function describeDependence(dependence: string | undefined): string {
  switch (dependence) {
    case 'first-principles':
      return '物理必然（改常数不该动）'
    case 'scaled':
      return '随常数变（公式决定）'
    case 'calibrated':
      return '地球标定（超域失真）'
    case 'contingent':
      return '历史偶然（不可推导）'
    default:
      return '未标注'
  }
}

/** 输入。 */
export interface BodiesInput {
  /** 按名称查单个天体（精确优先，其次包含匹配）。 */
  bodyName?: string
  /** 按类别列天体（star/planet/moon/small-body）。 */
  bodyKind?: string
  /** 按类型查天体类型。 */
  bodyType?: string
  /** 按证据等级过滤类型（observed/inferred/speculative…）。 */
  bodyEvidence?: string
  /** 改动的常数名（alpha_fs / G / c）。 */
  bodyConstant?: string
  /** 该常数变成原来的几倍。 */
  bodyFactor?: number
}

/** 结果。 */
export interface BodiesOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 数字渲染。 */
function f(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  const abs = Math.abs(value)
  if (abs === 0) return '0'
  if (abs >= 1e6 || abs < 1e-3) return value.toExponential(3)
  return Number(value.toPrecision(6)).toString()
}

/** 判断一个字段是否是测量值。 */
function asMeasured(value: unknown): MeasuredValue | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record['value'] !== 'number' || typeof record['unit'] !== 'string') return null
  const measured: MeasuredValue = { value: record['value'], unit: record['unit'] }
  if (typeof record['dependence'] === 'string') measured.dependence = record['dependence']
  if (typeof record['uncertainty'] === 'number') measured.uncertainty = record['uncertainty']
  if (typeof record['source'] === 'string') measured.source = record['source']
  if (typeof record['domain'] === 'string') measured.domain = record['domain']
  return measured
}

/** 渲染一个天体。 */
function renderBody(body: BodyEntry): string[] {
  const lines: string[] = []
  lines.push('【' + body.name + '】（' + body.id + '，' + body.kind + '）')
  if (body.spectralType) lines.push('  光谱型：' + body.spectralType + (body.luminosityClass ? ' / ' + body.luminosityClass : ''))
  if (body.summary) lines.push('  ' + body.summary)
  lines.push('')
  for (const [key, raw] of Object.entries(body)) {
    if (['id', 'name', 'kind', 'spectralType', 'luminosityClass', 'summary', 'notes'].includes(key)) continue
    const measured = asMeasured(raw)
    if (!measured) continue
    lines.push(
      '  ' + key.padEnd(18) + f(measured.value).padStart(14) + ' ' + measured.unit.padEnd(6) +
        ' [' + describeDependence(measured.dependence) + ']' +
        (measured.source ? ' 来源：' + measured.source : ''),
    )
  }
  if (body.notes) {
    lines.push('')
    lines.push('  备注：' + body.notes)
  }
  return lines
}

/** 渲染一个天体类型。 */
function renderType(type: BodyTypeEntry): string[] {
  const lines: string[] = []
  lines.push('【' + type.name + '】（' + type.id + '，家族 ' + type.family + '，证据 ' + type.evidence + '）')
  const quantities: Array<[string, number | undefined, string]> = [
    ['质量', type.massKg, 'kg'],
    ['半径', type.radiusKm, 'km'],
    ['重力', type.gravityG, 'g'],
    ['温度', type.tempK, 'K'],
    ['密度', type.densityKgM3, 'kg/m³'],
  ]
  for (const [label, value, unit] of quantities) {
    if (typeof value === 'number' && Number.isFinite(value)) lines.push('  ' + label + '：' + f(value) + ' ' + unit)
  }
  if (type.basis) lines.push('  依据：' + type.basis)
  if (type.perception) lines.push('  观感：' + type.perception)
  if (type.lockedBy) lines.push('  物理锁：' + type.lockedBy)
  if (type.freeToAuthor) lines.push('  可自由设定：' + type.freeToAuthor)
  if (type.pitfall) lines.push('  常见错误：' + type.pitfall)
  if (type.narrativeUse) lines.push('  叙事用法：' + type.narrativeUse)
  if (type.constantDependence) lines.push('  常数依赖：' + type.constantDependence)
  return lines
}

/**
 * 常数传导。
 *
 * @param constant - 常数名
 * @param factor - 倍数
 * @returns 三类结果（有幂次 / 间接依赖 / 不该动）
 */
export function propagateConstantChange(constant: string, factor: number): {
  constant: string
  factor: number
  effects: Array<{ quantity: string; multiplier: number; text: string; confidence: string }>
  indirect: Array<{ quantity: string; reason: string }>
  unchanged: string[]
} {
  const rules = SCALING_RULES.filter((rule) => rule.constant === constant)
  const effects: Array<{ quantity: string; multiplier: number; text: string; confidence: string }> = []
  const indirect: Array<{ quantity: string; reason: string }> = []
  const unchanged: string[] = []

  for (const rule of rules) {
    if (rule.exponent !== 0) {
      const multiplier = factor ** rule.exponent
      const direction = multiplier > 1.0001 ? '升高' : multiplier < 0.9999 ? '降低' : '不变'
      effects.push({
        quantity: rule.quantity,
        multiplier,
        text: rule.quantity + ' ' + direction + '到原来的 ' + multiplier.toPrecision(4) + ' 倍（' + rule.mechanism + '）',
        confidence: rule.confidence,
      })
      continue
    }
    /** exponent=0 有两种：真不动，或"间接依赖、要重算但没有幂次"。 */
    if (/间接|重算|不能标|通过|新值/.test(rule.mechanism)) {
      indirect.push({ quantity: rule.quantity, reason: rule.mechanism })
    } else {
      unchanged.push(rule.quantity)
    }
  }
  return { constant, factor, effects, indirect, unchanged }
}

/**
 * 查询天体目录。
 *
 * @param input - 查询条件
 * @param deps - 注入的数据
 * @returns 渲染结果
 * @throws {CalcError} 查不到 → unknown_symbol；常数/倍数非法 → invalid_argument
 */
export function runBodies(input: BodiesInput, deps: BodiesDeps): BodiesOutcome {
  const bodies = deps.bodies
  const taxonomy = deps.taxonomy
  const lines: string[] = []

  // ── 常数传导 ──
  if (typeof input.bodyConstant === 'string' && input.bodyConstant.trim() !== '') {
    const constant = input.bodyConstant.trim()
    const factor = typeof input.bodyFactor === 'number' ? input.bodyFactor : 2
    const known = [...new Set(SCALING_RULES.map((rule) => rule.constant))]
    if (!known.includes(constant)) {
      throw new CalcError(
        'unknown_argument',
        '不认识的常数「' + constant + '」',
        '可用：' + known.join(' / ') + '。',
      )
    }
    if (!Number.isFinite(factor) || factor <= 0) {
      throw new CalcError('invalid_argument', 'bodyFactor 必须是正的有限数（收到 ' + String(factor) + '）', '例如 1.1 表示常数变成原来的 1.1 倍。')
    }
    const outcome = propagateConstantChange(constant, factor)
    lines.push('═══ 常数传导：' + constant + ' ×' + factor + ' ═══', '')
    if (outcome.effects.length > 0) {
      lines.push('【按幂次重算】')
      for (const effect of outcome.effects) lines.push('  · ' + effect.text)
    }
    if (outcome.indirect.length > 0) {
      lines.push('')
      lines.push('【间接依赖：要重算，但没有幂次】')
      for (const item of outcome.indirect) lines.push('  · ' + item.quantity + ' —— ' + item.reason)
    }
    if (outcome.unchanged.length > 0) {
      lines.push('')
      lines.push('【严格不动（改了就是篡改设定）】')
      for (const item of outcome.unchanged) lines.push('  · ' + item)
    }
    return { result: lines.join('\n'), value: outcome }
  }

  // ── 单个天体 ──
  if (typeof input.bodyName === 'string' && input.bodyName.trim() !== '') {
    const wanted = input.bodyName.trim()
    const exact = bodies.find((body) => body.id === wanted || body.name === wanted)
    const fuzzy = bodies.filter((body) => body.id.includes(wanted) || body.name.includes(wanted))
    const matches = exact ? [exact] : fuzzy
    if (matches.length === 0) {
      throw new CalcError(
        'unknown_symbol',
        '天体目录里没有「' + wanted + '」',
        '已收录：' + bodies.map((body) => body.name + '(' + body.id + ')').join('、') + '。',
      )
    }
    if (matches.length > 1) {
      throw new CalcError(
        'invalid_argument',
        '「' + wanted + '」匹配到多个天体',
        '候选：' + matches.map((body) => body.name + '(' + body.id + ')').join(' / ') + '。请写完整名称或 id。',
      )
    }
    return { result: renderBody(matches[0]).join('\n'), value: matches[0] }
  }

  // ── 天体类型 ──
  if ((typeof input.bodyType === 'string' && input.bodyType.trim() !== '') || typeof input.bodyEvidence === 'string') {
    const wantedType = typeof input.bodyType === 'string' ? input.bodyType.trim() : ''
    const evidence = typeof input.bodyEvidence === 'string' ? input.bodyEvidence.trim() : ''
    let pool = taxonomy
    if (wantedType !== '') {
      const exact = taxonomy.find((type) => type.id === wantedType || type.name === wantedType)
      const fuzzy = taxonomy.filter((type) => type.id.includes(wantedType) || type.name.includes(wantedType))
      pool = exact ? [exact] : fuzzy
      if (pool.length === 0) {
        throw new CalcError(
          'unknown_symbol',
          '天体类型里没有「' + wantedType + '」',
          '已收录类型：' + taxonomy.map((type) => type.name).join('、') + '。',
        )
      }
    }
    if (evidence !== '') {
      const known = [...new Set(taxonomy.map((type) => type.evidence))]
      if (!known.includes(evidence)) {
        throw new CalcError('unknown_argument', '不认识的证据等级「' + evidence + '」', '可用：' + known.join(' / ') + '。')
      }
      pool = pool.filter((type) => type.evidence === evidence)
    }
    if (pool.length === 1 && wantedType !== '') return { result: renderType(pool[0]).join('\n'), value: pool[0] }
    lines.push('═══ 天体类型（' + pool.length + ' 条）═══', '')
    for (const type of pool) lines.push('  ' + type.id.padEnd(26) + type.name.padEnd(16) + ' 家族 ' + type.family + ' · 证据 ' + type.evidence)
    if (practiceNotice(pool)) lines.push('', practiceNotice(pool)!)
    return { result: lines.join('\n'), value: { count: pool.length, ids: pool.map((type) => type.id) } }
  }

  // ── 按 kind 列天体 ──
  if (typeof input.bodyKind === 'string' && input.bodyKind.trim() !== '') {
    const kind = input.bodyKind.trim()
    const list = bodies.filter((body) => body.kind === kind)
    if (list.length === 0) {
      const known = [...new Set(bodies.map((body) => body.kind))]
      throw new CalcError('unknown_symbol', '没有类别「' + kind + '」的天体', '可用类别：' + known.join(' / ') + '。')
    }
    lines.push('═══ ' + kind + '（' + list.length + ' 个）═══', '')
    for (const body of list) lines.push('  ' + body.id.padEnd(22) + body.name)
    return { result: lines.join('\n'), value: { kind, count: list.length, ids: list.map((body) => body.id) } }
  }

  // ── 概览 ──
  lines.push('══════ 天体目录 ══════', '')
  lines.push('天体 ' + bodies.length + ' 个，类型 ' + taxonomy.length + ' 类。', '')
  const kinds = [...new Set(bodies.map((body) => body.kind))]
  for (const kind of kinds) {
    lines.push('【' + kind + '】' + bodies.filter((body) => body.kind === kind).map((body) => body.name).join('、'))
  }
  lines.push('')
  lines.push('【类型】' + taxonomy.map((type) => type.name).join('、'))
  lines.push('')
  lines.push('用法：{"operation":"bodies","bodyName":"火星"} / {"bodyType":"白矮星"} / {"bodyKind":"planet"}')
  lines.push('改常数看后果：{"operation":"bodies","bodyConstant":"G","bodyFactor":2}')
  return { result: lines.join('\n'), value: { bodies: bodies.map((body) => body.id), types: taxonomy.map((type) => type.id) } }
}

/** 证据等级不足时的提示。 */
function practiceNotice(pool: BodyTypeEntry[]): string | null {
  const speculative = pool.filter((type) => type.evidence === 'speculative').length
  if (speculative === 0) return null
  return '注：其中 ' + speculative + ' 类只有理论/推测证据（evidence=speculative），设定引用时保留"推测"标签。'
}
