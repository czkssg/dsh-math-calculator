/**
 * 缩放判定（`scaling`）。
 *
 * ## 回答什么
 *
 * 「尺寸放大 N 倍，重量/面积/负载各变多少倍，结构还撑得住吗」——
 * 平方立方定律是 AI 推演里最高频的七类动作之一。
 *
 * ## 不猜
 *
 * 工具只给**倍数关系**与由它推出的超限项，不说"这个设定好不好"。
 * 是否崩塌取决于调用方给的材料强度是否随尺度改变：
 * `strengthScaling` 是调用方声明，缺省 1（材料强度不随尺度变）。
 *
 * @module dsh-math-calculator/features/deduction/scaling
 */

import { CalcError } from '../../core/errors.js'

/** 缩放定律。 */
export type ScalingLaw = 'square-cube' | 'linear' | 'custom'

/** 输入。 */
export interface ScalingInput {
  /** 定律名：square-cube / 平方立方 / linear / 线性 / custom。 */
  law?: string
  /** 起点维度（尺寸/面积/体积/质量）。 */
  from: Record<string, number>
  /** 终点维度。 */
  to: Record<string, number>
  /** custom 时的指数表：量名 → 相对"尺寸"的指数。 */
  exponents?: Record<string, number>
  /** 材料强度随尺寸的指数（缺省 0 表示不随尺度改变；1 表示随尺寸线性增长）。 */
  strengthScaling?: number
  /** 强度基准量的名字（缺省 'mass'）。 */
  loadKey?: string
  /** 承载量的名字（缺省 'area'）。 */
  supportKey?: string
}

/** 结果。 */
export interface ScalingOutcome {
  result: string
  value: {
    law: ScalingLaw
    sizeRatio: number
    factors: Record<string, number>
    loadPerSupportRatio: number
    verdict: string
    note: string
  }
  notice?: string
}

/** 平方立方律的指数。 */
const SQUARE_CUBE: Record<string, number> = {
  length: 1,
  size: 1,
  area: 2,
  surface: 2,
  'surface-area': 2,
  volume: 3,
  mass: 3,
  weight: 3,
}

/** 线性律的指数。 */
const LINEAR: Record<string, number> = {
  length: 1,
  size: 1,
  area: 1,
  surface: 1,
  'surface-area': 1,
  volume: 1,
  mass: 1,
  weight: 1,
}

/**
 * 判定缩放。
 *
 * @param input - 起点、终点与定律
 * @returns 倍数表与判定
 * @throws {CalcError} 缺参数 → missing_params；定律不认识或数值非法 → invalid_argument
 */
export function judgeScaling(input: ScalingInput | undefined): ScalingOutcome {
  if (input === undefined || input === null) {
    throw new CalcError(
      'missing_params',
      'scaling 需要 from 与 to（起点/终点的维度对象）',
      '例如 {scaling:{law:"平方立方", from:{size:1}, to:{size:10}}}。',
    )
  }
  const from = (input as { from?: unknown }).from
  const to = (input as { to?: unknown }).to
  if (typeof from !== 'object' || from === null || Array.isArray(from) || typeof to !== 'object' || to === null || Array.isArray(to)) {
    throw new CalcError(
      'missing_params',
      'scaling 需要 from 与 to 两个对象',
      '例如 from:{size:1}, to:{size:10}。',
    )
  }
  const fromObj = from as Record<string, unknown>
  const toObj = to as Record<string, unknown>
  for (const [obj, label] of [[fromObj, 'from'], [toObj, 'to']] as Array<[Record<string, unknown>, string]>) {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new CalcError(
          'invalid_argument',
          label + '.' + key + ' 必须是正有限数（收到 ' + String(value) + '）',
          '维度值必须是正数；0 或负数会让比例无意义。',
        )
      }
    }
  }

  const rawLaw = typeof input.law === 'string' && input.law.trim() !== '' ? input.law.trim() : 'square-cube'
  let law: ScalingLaw
  let exponents: Record<string, number>
  if (rawLaw === 'square-cube' || rawLaw === 'squarecube' || rawLaw === '平方立方' || rawLaw === '平方立方定律') {
    law = 'square-cube'
    exponents = SQUARE_CUBE
  } else if (rawLaw === 'linear' || rawLaw === '线性') {
    law = 'linear'
    exponents = LINEAR
  } else if (rawLaw === 'custom' || rawLaw === '自定义') {
    law = 'custom'
    if (typeof input.exponents !== 'object' || input.exponents === null || Array.isArray(input.exponents)) {
      throw new CalcError(
        'invalid_argument',
        'law=custom 需要 exponents（量名 → 指数）',
        '例如 exponents:{size:1, mass:3, area:2}。',
      )
    }
    exponents = {}
    for (const [key, value] of Object.entries(input.exponents)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new CalcError('invalid_argument', 'exponents.' + key + ' 必须是有限数', '例如 mass:3。')
      }
      exponents[key] = value
    }
  } else {
    throw new CalcError(
      'unknown_argument',
      '不认识的缩放定律「' + rawLaw + '」',
      '可用：square-cube（平方立方）/ linear（线性）/ custom（自定义，配 exponents）。',
    )
  }

  /** 尺寸比：优先 size，其次 length。 */
  const sizeKey = 'size' in toObj ? 'size' : 'length' in toObj ? 'length' : Object.keys(toObj)[0]
  if (!(sizeKey in fromObj) || fromObj[sizeKey] === 0) {
    throw new CalcError(
      'missing_params',
      'from 与 to 需要有同名维度来定尺寸比（如 size 或 length）',
      '例如 from:{size:1}, to:{size:10}。',
    )
  }
  const sizeRatio = (toObj[sizeKey] as number) / (fromObj[sizeKey] as number)

  /** 倍数表：显式给的维度用实际比值，其余按定律指数推。 */
  const factors: Record<string, number> = {}
  const keys = new Set([...Object.keys(fromObj), ...Object.keys(toObj)])
  for (const key of keys) {
    const explicit = fromObj[key] !== undefined && toObj[key] !== undefined
    if (explicit && fromObj[key] !== 0) {
      factors[key] = (toObj[key] as number) / (fromObj[key] as number)
    } else {
      const exponent = exponents[key]
      if (exponent !== undefined) factors[key] = sizeRatio ** exponent
    }
  }
  if (exponents['mass'] !== undefined && factors['mass'] === undefined) factors['mass'] = sizeRatio ** exponents['mass']
  if (exponents['area'] !== undefined && factors['area'] === undefined) factors['area'] = sizeRatio ** exponents['area']

  const loadKey = typeof input.loadKey === 'string' && input.loadKey !== '' ? input.loadKey : 'mass'
  const supportKey = typeof input.supportKey === 'string' && input.supportKey !== '' ? input.supportKey : 'area'
  const loadFactor = factors[loadKey] ?? sizeRatio ** (exponents[loadKey] ?? 3)
  const supportFactor = factors[supportKey] ?? sizeRatio ** (exponents[supportKey] ?? 2)
  /** 材料强度随尺度变化（调用方声明，缺省不随尺度变）。 */
  const strengthScaling = typeof input.strengthScaling === 'number' && Number.isFinite(input.strengthScaling)
    ? input.strengthScaling
    : 0
  const strengthFactor = sizeRatio ** strengthScaling
  const loadPerSupportRatio = loadFactor / supportFactor / strengthFactor

  const breakdown = Object.entries(factors)
    .map(([key, value]) => key + ' ×' + (Number.isFinite(value) ? Number(value.toPrecision(4)) : String(value)))
    .join('，')

  let verdict: string
  let note: string
  if (!Number.isFinite(loadPerSupportRatio)) {
    verdict = '无法判定：倍数非有限'
    note = '检查 from/to 是否含 0 或极端值。'
  } else if (loadPerSupportRatio > 1.0000001) {
    verdict = '结构负载上升 ' + Number(loadPerSupportRatio.toPrecision(4)) + ' 倍——材料强度不变时必然崩塌'
    note = '平方立方律的直接后果：尺寸 ×N 时质量 ×N³、承载面积 ×N²，单位面积负载 ×N。要成立，必须换材料或改结构（如骨骼加粗、分舱、桁架）。'
  } else if (loadPerSupportRatio < 0.9999999) {
    verdict = '结构负载下降 ' + Number((1 / loadPerSupportRatio).toPrecision(4)) + ' 倍——缩小尺度时更安全'
    note = '同样来自平方立方律：小尺寸结构的承载余量反而更大。'
  } else {
    verdict = '结构负载不变（' + Number(loadPerSupportRatio.toPrecision(4)) + ' 倍）'
    note = '尺寸变化与强度变化恰好抵消；这需要调用方显式声明 strengthScaling。'
  }

  const lines = [
    '缩放判定',
    '',
    '  定律：' + (law === 'square-cube' ? '平方立方' : law === 'linear' ? '线性' : '自定义'),
    '  尺寸比：' + Number(sizeRatio.toPrecision(6)),
    '  倍数：' + breakdown,
    '  单位承载负载：' + Number(loadPerSupportRatio.toPrecision(6)) + ' 倍',
    '',
    '  ' + verdict,
    '  ' + note,
  ]

  return { result: lines.join('\n'), value: { law, sizeRatio, factors, loadPerSupportRatio, verdict, note } }
}
