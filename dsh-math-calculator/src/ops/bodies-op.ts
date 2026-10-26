/**
 * operation="bodies" 的实现：天体目录查询与常数传导。
 *
 * ## 三种用法
 *
 * ```jsonc
 * // 1. 列出全部天体（按类别分组）
 * { "operation": "bodies" }
 *
 * // 2. 查某个天体 / 按类别筛
 * { "operation": "bodies", "bodyName": "mars" }
 * { "operation": "bodies", "bodyKind": "planet-terrestrial" }
 *
 * // 3. 改常数后，看天体数据哪些该重算（**这是最容易出错的一步**）
 * { "operation": "bodies", "bodyConstant": "alpha_fs", "bodyFactor": 2 }
 * ```
 *
 * ## 第 3 种为什么重要
 *
 * 作者改了 α 之后，最容易犯两个**静默**的错：
 *   · 把行星质量也跟着改（错：质量与 α 无关，那是篡改设定）
 *   · 忘了恒星光度要变（错：气候结论还是旧的）
 *
 * 这里把「该变的」和「不该动的」分成两块明确列出来。
 *
 * @module dsh-math-calculator/ops/bodies-op
 */

import { toJsonValue } from '../format.js'
import {
  ALL_NAMED_BODIES,
  BODY_INDEX,
  NAMED_STARS,
  bodiesByKind,
  type BodyEntry,
  type BodyKind,
  type NamedStar,
} from '../body-catalog.js'
import {
  BODY_TYPES,
  EVIDENCE_LABEL,
  FAMILY_LABEL,
  FAMILY_ORDER,
  findBodyType,
  typesByEvidence,
  typesByFamily,
} from '../body-taxonomy.js'
import {
  SCALING_RULES,
  describeDependence,
  howToTreatValue,
  propagateConstantChange,
} from '../body-scaling.js'
import { CalcError, type MathArgs, type Outcome } from './shared.js'

/** 类别的中文名（输出用）。 */
const KIND_LABEL: Record<BodyKind, string> = {
  star: '恒星',
  'planet-terrestrial': '类地行星',
  'planet-super-earth': '超级地球',
  'planet-mini-neptune': '海王星型小行星',
  'planet-gas-giant': '气态巨行星',
  'planet-ice-giant': '冰巨星',
  moon: '卫星',
  'dwarf-planet': '矮行星',
  asteroid: '小行星',
  'kuiper-object': '柯伊伯带天体',
}

/**
 * 格式化一条带来源的数值。
 *
 * @param label - 中文名
 * @param value - 数值条目
 * @returns 一行文本（没有值时返回空串）
 */
function showValue(label: string, value: { value: number; unit: string; dependence: string; uncertainty?: number } | undefined): string {
  if (!value) return ''
  const num =
    Math.abs(value.value) >= 1e5 || (Math.abs(value.value) < 1e-3 && value.value !== 0)
      ? value.value.toExponential(3)
      : String(Number(value.value.toPrecision(6)))
  const err = value.uncertainty !== undefined ? ' ± ' + value.uncertainty : ''
  return '  ' + label.padEnd(14) + num + err + ' ' + value.unit +
    '   [' + describeDependence(value.dependence as never) + ']'
}

/**
 * 渲染一个天体。
 *
 * @param body - 天体条目
 * @returns 文本行
 */
function renderBody(body: NamedStar | BodyEntry): string[] {
  const lines: string[] = []
  const isStar = body.kind === 'star'
  lines.push((isStar ? '★ ' : '● ') + body.name + '（' + body.id + '）  [' + KIND_LABEL[body.kind] + ']')
  if (isStar) {
    const star = body as NamedStar
    lines.push('  光谱型 ' + star.spectralType + '（' + star.luminosityClass + ' 级' +
      (star.luminosityClass === 'V' ? '，主序星' : star.luminosityClass === 'D' ? '，白矮星' : '，非主序——注意与同字母主序星亮度差极大') + '）')
    lines.push(showValue('光度', star.luminositySun))
    lines.push(showValue('质量', star.massSun))
    lines.push(showValue('半径', star.radiusSun))
    lines.push(showValue('有效温度', star.effectiveTempK))
  } else {
    if (body.host) lines.push('  宿主：' + (BODY_INDEX.get(body.host)?.name || body.host))
    lines.push(showValue('轨道半长轴', body.semiMajorAxisAU))
    lines.push(showValue('质量', body.massEarth))
    lines.push(showValue('半径', body.radiusEarth))
    lines.push(showValue('表面重力', body.surfaceGravityG))
    lines.push(showValue('平衡温度', body.equilibriumTempK))
    lines.push(showValue('表面温度', body.surfaceTempK))
    lines.push(showValue('反照率', body.albedo))
    lines.push(showValue('自转周期', body.rotationHours))
    lines.push(showValue('轴倾角', body.obliquityDeg))
    lines.push(showValue('气压', body.pressureAtm))
    if (body.atmosphere) lines.push('  大气            ' + body.atmosphere)
    if (body.tidallyLocked) lines.push('  潮汐锁定         是（一面永朝主星）')
  }
  const filled = lines.filter(function (line) { return line !== '' && line.trim() !== '' })
  filled.push('  说明：' + body.summary)
  filled.push('  要点：' + body.notes)
  return filled
}

/**
 * 渲染一个天体类型。
 *
 * 与具名天体的区别：类型没「精确值」，只有典型值与物理约束。
 * 所以这里刻意不写小数点——写 `11 km` 而不是 `11.0 km`，
 * 避免让人以为中子星半径精确到 0.1 公里。
 *
 * @param type - 类型条目
 * @returns 文本行
 */
function renderType(type: ReturnType<typeof findBodyType> & object): string[] {
  const lines: string[] = []
  const evTag =
    type.evidence === 'observed' ? '✓已观测'
      : type.evidence === 'theoretical' ? '~理论预言' : '?纯思辨'
  lines.push('■ ' + type.name + '（' + type.nameEn + '）  [' + FAMILY_LABEL[type.family] + ' · ' + evTag + ']')
  if (type.massKg !== undefined) {
    const inSun = type.massKg / 1.989e30
    const inEarth = type.massKg / 5.972e24
    const shown = inSun >= 0.01
      ? (inSun >= 0.1 ? inSun.toPrecision(3) + ' 太阳质量' : inSun.toExponential(2) + ' 太阳质量')
      : inEarth >= 0.01
        ? inEarth.toPrecision(3) + ' 地球质量'
        : type.massKg.toExponential(2) + ' kg'
    lines.push('  典型质量      ' + shown)
  }
  if (type.radiusKm !== undefined) {
    lines.push('  典型半径      ' + type.radiusKm.toPrecision(3) + ' km')
  }
  if (type.gravityG !== undefined) {
    lines.push('  典型表面重力   ' + type.gravityG.toExponential(2) + ' g（地球 = 1）')
  }
  if (type.densityKgM3 !== undefined) {
    lines.push('  典型密度      ' + type.densityKgM3.toExponential(2) + ' kg/m³（水 = 1000）')
  }
  if (type.tempK !== undefined && type.tempK > 0) {
    lines.push('  典型温度      ' + type.tempK.toPrecision(3) + ' K')
  }
  lines.push('  依据          ' + type.basis)
  lines.push('  读者感知      ' + type.perception)
  if (type.lockedBy) {
    lines.push('  ▶ 物理锁死（编不了）')
    lines.push('    ' + type.lockedBy)
  }
  if (type.freeToAuthor) {
    lines.push('  ▶ 可自由发挥（编这些不冲突）')
    lines.push('    ' + type.freeToAuthor)
  }
  if (type.pitfall) {
    lines.push('  ▶ 最容易踩的坑')
    lines.push('    ' + type.pitfall)
  }
  if (type.narrativeUse) {
    lines.push('  ▶ 科幻用法')
    lines.push('    ' + type.narrativeUse)
  }
  return lines
}

/**
 * `bodies`：天体目录、类型学与常数传导。
 *
 * @param args - 工具参数
 * @returns 结果文本与结构化值
 */
export function opBodies(args: MathArgs): Outcome {
  const lines: string[] = []

  // ── 用法 0：天体类型学（面向宇宙科幻创作，优先于具名天体）──
  if (args.bodyType !== undefined || args.bodyEvidence !== undefined) {
    const lines2 = []
    // 查单个类型
    if (typeof args.bodyType === 'string' && args.bodyType.trim() !== '') {
      const hit = findBodyType(args.bodyType)
      if (!hit) {
        throw new CalcError(
          'invalid_argument',
          '找不到天体类型「' + args.bodyType + '」',
          '已收录类型：' + BODY_TYPES.map(function (t) { return t.name }).join('、'),
        )
      }
      lines2.push(...renderType(hit as never))
      return { result: lines2.join('\n'), value: toJsonValue({ type: hit } as never) }
    }

    // 按证据等级筛
    if (typeof args.bodyEvidence === 'string' && args.bodyEvidence.trim() !== '') {
      const level = args.bodyEvidence.trim() as never
      if (!EVIDENCE_LABEL[level]) {
        throw new CalcError(
          'invalid_argument',
          '不认识的证据等级「' + args.bodyEvidence + '」',
          '可用：' + Object.keys(EVIDENCE_LABEL).join(' / '),
        )
      }
      const list = typesByEvidence(level)
      lines2.push('═══ ' + EVIDENCE_LABEL[level] + '（' + list.length + ' 类）═══')
      lines2.push('')
      for (const type of list) {
        lines2.push(...renderType(type as never))
        lines2.push('')
      }
      return {
        result: lines2.join('\n'),
        value: toJsonValue({ evidence: level, count: list.length, ids: list.map(function (t) { return t.id }) } as never),
      }
    }

    // 列全部类型（按族分组）
    lines2.push('═══ 天体类型学（' + BODY_TYPES.length + ' 类，面向宇宙科幻创作）═══')
    lines2.push('')
    lines2.push('证据等级决定了这些数字有多可信：')
    lines2.push('  ✓已观测 = 有观测证据；~理论预言 = 物理必然但未直接观测；?纯思辨 = 都没有')
    lines2.push('')
    for (const family of FAMILY_ORDER) {
      const list = typesByFamily(family)
      if (list.length === 0) continue
      lines2.push('【' + FAMILY_LABEL[family] + '】（' + list.length + '）')
      for (const type of list) {
        const tag = type.evidence === 'observed' ? '✓' : type.evidence === 'theoretical' ? '~' : '?'
        lines2.push('  ' + tag + ' ' + type.name.padEnd(14) + ' ' + type.nameEn)
      }
      lines2.push('')
    }
    lines2.push('【用法】')
    lines2.push('  bodyType="中子星"          查单个类型的物理锁死项与可编项')
    lines2.push('  bodyEvidence="speculative" 只看纯思辨类')
    lines2.push('  不带参数                   列出全部类型')
    return {
      result: lines2.join('\n'),
      value: toJsonValue({
        total: BODY_TYPES.length,
        families: FAMILY_ORDER.map(function (family) {
          return { family: family, label: FAMILY_LABEL[family], count: typesByFamily(family).length }
        }),
        ids: BODY_TYPES.map(function (t) { return t.id }),
      } as never),
    }
  }

  // ── 用法 3：常数传导（最重要）──
  if (typeof args.bodyConstant === 'string' && args.bodyConstant.trim() !== '') {
    const constant = args.bodyConstant.trim()
    const factor = typeof args.bodyFactor === 'number' ? args.bodyFactor : 2
    if (!(factor > 0)) {
      throw new CalcError('invalid_argument', 'bodyFactor 必须大于 0', '例如 2 表示常数变成原来的两倍')
    }
    const outcome = propagateConstantChange(constant, factor)

    lines.push('═══ 改常数后的天体传导：' + constant + ' × ' + factor + ' ═══')
    lines.push('')
    if (outcome.effects.length === 0 && outcome.unchanged.length === 0) {
      lines.push('没有关于「' + constant + '」的传导规则。已知常数：' +
        [...new Set(SCALING_RULES.map(function (r) { return r.constant }))].join(' / '))
    } else {
      if (outcome.effects.length > 0) {
        lines.push('【需要重算的量】（有幂次，可算倍数）')
        for (const effect of outcome.effects) {
          const tag =
            effect.confidence === 'exact' ? '[精确]'
              : effect.confidence === 'empirical' ? '[经验]'
                : effect.confidence === 'order-of-magnitude' ? '[量级]' : '[仅方向]'
          lines.push('  ' + tag + ' ' + effect.text)
        }
        lines.push('')
      }
      if (outcome.indirect.length > 0) {
        lines.push('【也要重算，但没有幂次可算】')
        for (const item of outcome.indirect) {
          lines.push('  · ' + item.quantity)
          lines.push('    ' + item.reason)
        }
        lines.push('  → 这一类改完常数后要用 operation="world" 重跑才拿得到新值，')
        lines.push('    不能拿旧数字凑合——旧值属于旧宇宙。')
        lines.push('')
      }
      if (outcome.unchanged.length > 0) {
        lines.push('【绝不该动的量】（改了就是篡改设定）')
        for (const item of outcome.unchanged) lines.push('  · ' + item)
        lines.push('')
      }
      lines.push('【提醒】')
      lines.push('  改常数只影响「由公式决定」的量。行星质量、半径、轨道半长轴由引力与')
      lines.push('  初始条件决定，与电磁类常数无关 —— 同一天体在新宇宙里不会变重变轻。')
      lines.push('  大气成分、反照率、云量是历史偶然，永远没有公式可依，只能由作者设定。')
    }

    return {
      result: lines.join('\n'),
      value: toJsonValue({
        constant: constant,
        factor: factor,
        effects: outcome.effects.map(function (item) {
          return {
            quantity: item.quantity,
            multiplier: Number.isFinite(item.multiplier) ? item.multiplier : String(item.multiplier),
            confidence: item.confidence,
          }
        }),
        unchanged: outcome.unchanged,
      } as never),
    }
  }

  // ── 用法 2a：按名字查单个天体 ──
  if (typeof args.bodyName === 'string' && args.bodyName.trim() !== '') {
    const query = args.bodyName.trim()
    const exact = BODY_INDEX.get(query)
    // 模糊：id 或中文名包含
    const matched = exact ?? ALL_NAMED_BODIES.find(function (body) {
      return body.id.includes(query.toLowerCase()) || body.name.includes(query)
    })
    if (!matched) {
      throw new CalcError(
        'invalid_argument',
        '找不到天体「' + query + '」',
        '可用 operation="bodies"（不带参数）列出全部。已收录：' +
          ALL_NAMED_BODIES.map(function (body) { return body.name }).join('、'),
      )
    }
    lines.push(...renderBody(matched))
    // 结构化值里带上该天体的所有数值与依赖标记
    return {
      result: lines.join('\n'),
      value: toJsonValue({ body: matched } as never),
    }
  }

  // ── 用法 2b：按类别筛 ──
  if (typeof args.bodyKind === 'string' && args.bodyKind.trim() !== '') {
    const kind = args.bodyKind.trim() as BodyKind
    if (!(kind in KIND_LABEL)) {
      throw new CalcError(
        'invalid_argument',
        '不认识的类别「' + kind + '」',
        '可用：' + Object.keys(KIND_LABEL).join(' / '),
      )
    }
    const list = bodiesByKind(kind)
    lines.push('═══ ' + KIND_LABEL[kind] + '（' + list.length + ' 个）═══')
    lines.push('')
    for (const body of list) {
      lines.push(...renderBody(body))
      lines.push('')
    }
    return {
      result: lines.join('\n'),
      value: toJsonValue({ kind: kind, count: list.length, ids: list.map(function (b) { return b.id }) } as never),
    }
  }

  // ── 用法 1：列全部 ──
  lines.push('═══ 天体目录（' + ALL_NAMED_BODIES.length + ' 个）═══')
  lines.push('')
  lines.push('【恒星】（' + NAMED_STARS.length + '）含主序、巨星、超巨星、白矮星')
  for (const star of NAMED_STARS) {
    lines.push('  · ' + star.name.padEnd(16) + star.spectralType.padEnd(10) +
      star.luminositySun.value + ' L☉')
  }
  lines.push('')
  const groups = Object.keys(KIND_LABEL).filter(function (kind) { return kind !== 'star' })
  for (const kind of groups) {
    const list = bodiesByKind(kind as BodyKind)
    if (list.length === 0) continue
    lines.push('【' + KIND_LABEL[kind as BodyKind] + '】（' + list.length + '）')
    for (const body of list) {
      const hostName = body.host ? (BODY_INDEX.get(body.host)?.name || body.host) : ''
      lines.push('  · ' + body.name.padEnd(16) + (hostName ? '绕' + hostName + ' ' : '') +
        (body.radiusEarth ? '  R=' + body.radiusEarth.value + ' R⊕' : ''))
    }
    lines.push('')
  }
  lines.push('【用法】')
  lines.push('  查单个：bodyName="mars"（中文也可以：bodyName="火星"）')
  lines.push('  按类筛：bodyKind="moon"')
  lines.push('  改常数看传导：bodyConstant="alpha_fs", bodyFactor=2')
  lines.push('')
  lines.push('【注意】每个数值都标了依赖类别：')
  lines.push('  物理必然 / 随常数变 / 地球标定 / 历史偶然 —— 这决定了改常数后它该不该动。')

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      total: ALL_NAMED_BODIES.length,
      stars: NAMED_STARS.map(function (s) { return { id: s.id, spectralType: s.spectralType } }),
      ids: ALL_NAMED_BODIES.map(function (b) { return b.id }),
    } as never),
  }
}
