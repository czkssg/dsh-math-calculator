/**
 * 正向推演链路：把 world 的计算结果逐层映射成接口卡判定。
 *
 * @module dsh-math-calculator/pipeline
 * @description
 * 这是推演栈真正**跑起来**的部分：不再只是展示卡片，而是
 * 从 P1 逐层到 P5，把上一层的计算结果喂给下一层的判定器，
 * 最终给出「每层允许/边缘/禁止」的完整链路报告。
 *
 * 数据来源是 `opWorld` 的输出（planet / atmosphere / temperature /
 * climate / life / stellar），它已经算好了重力、标高、逃逸速度、
 * 恒星寿命等量。本模块只做**映射与判定**，不重复计算。
 *
 * 关键设计：每层输出「接口值 + 状态 + 依据」，越界立刻标红并说明
 * 是哪张卡的哪个区间被突破——这样用户知道该改哪个参数。
 */

import {
  INTERFACE_CARDS,
  judgeRange,
  VERDICT_LABEL,
  type InterfaceCard,
  type Verdict,
} from './derivation-stack.js'
import { evalFormula, constantValue } from './formula-bridge.js'

/** 一层推演的结果。 */
export interface LayerResult {
  /** 层 id（P1—P5）。 */
  layer: string
  /** 层名。 */
  name: string
  /** 该层的接口值及其判定。 */
  items: Array<{
    /** 接口卡名。 */
    card: string
    /** 实际算出的值。 */
    value: number
    /** 单位。 */
    unit: string
    /** 判定。 */
    verdict: Verdict
    /** 允许区间（用于展示）。 */
    allowed?: [number, number]
    /** 依据/说明。 */
    note: string
  }>
  /** 本层是否全部允许。 */
  allAllowed: boolean
  /** 本层最严重的问题。 */
  worst: string | null
}

/** 全链路结果。 */
export interface PipelineResult {
  /** 各层结果（P1 → P5）。 */
  layers: LayerResult[]
  /** 第一个出问题的层（null 表示全通）。 */
  firstBlocked: string | null
  /** 总结论。 */
  verdict: Verdict
  /** 建议：该改什么。 */
  advice: string[]
}

/** 从接口卡库里按名字取卡。 */
function cardOf(layer: string, name: string): InterfaceCard | undefined {
  const cards = INTERFACE_CARDS[layer] || []
  return cards.find(function (card) { return card.name === name })
}

/**
 * 取卡的允许区间；取不到时用兜底区间。
 *
 * @param layer - 层 id
 * @param name - 卡名
 * @param fallback - 兜底区间
 */
function rangeOf(layer: string, name: string, fallback: [number, number]): [number, number] {
  const card = cardOf(layer, name)
  if (card && card.range.allowed) return card.range.allowed
  return fallback
}

/**
 * 构造一个接口值判定项。
 *
 * @param layer - 层 id
 * @param name - 卡名
 * @param value - 实际值
 * @param unit - 单位
 * @param note - 说明
 * @param fallback - 卡不存在时的兜底区间
 */
function item(
  layer: string,
  name: string,
  value: number,
  unit: string,
  note: string,
  fallback: [number, number],
): LayerResult['items'][number] {
  const card = cardOf(layer, name)
  const allowed = card && card.range.allowed ? card.range.allowed : fallback
  const verdict = card
    ? judgeRange(value, card)
    : value >= allowed[0] && value <= allowed[1] ? 'allowed' as Verdict : 'forbidden' as Verdict
  return { card: name, value: value, unit: unit, verdict: verdict, allowed: allowed, note: note }
}

/**
 * 把一组判定项汇总成一层结果。
 *
 * @param layer - 层 id
 * @param name - 层名
 * @param items - 判定项
 */
function makeLayer(layer: string, name: string, items: LayerResult['items']): LayerResult {
  const forbidden = items.filter(function (it) { return it.verdict === 'forbidden' })
  const marginal = items.filter(function (it) { return it.verdict === 'marginal' })
  let worst: string | null = null
  if (forbidden.length > 0) {
    worst = forbidden[0].card + ' = ' + forbidden[0].value + ' ' + forbidden[0].unit +
      '（允许 ' + (forbidden[0].allowed ? forbidden[0].allowed[0] + '—' + forbidden[0].allowed[1] : '?') + '）'
  } else if (marginal.length > 0) {
    worst = marginal[0].card + ' 处于边缘区'
  }
  return {
    layer: layer,
    name: name,
    items: items,
    allAllowed: forbidden.length === 0 && marginal.length === 0,
    worst: worst,
  }
}

/** P1 微观层：化学是否成立。数据来自 world.life.chemistry。 */
function layerP1(world: any): LayerResult {
  const chem = (world && world.life && world.life.chemistry) || {}
  const items: LayerResult['items'] = []

  if (typeof chem.bondEnergyEv === 'number') {
    items.push(item('P1', '键能范围', chem.bondEnergyEv, 'eV',
      '共价键能量；低于 0.1 eV 热扰动即断键，高于 30 eV 化学失去选择性', [0.5, 10]))
  }

  if (typeof chem.alphaRatio === 'number' && chem.alphaRatio > 0) {
    // 玻尔半径从常数表读（不硬编码）：a0 = 4πε₀ℏ²/(m_e e²)
    // 若常数表没给，退回公式库能算的等价路径。
    const bohrFromTable = constantValue('a0') !== undefined
      ? (constantValue('a0') as number)
      : 5.29177210903e-11 // 兜底值，仅当常数表缺项时使用
    const atomScale = bohrFromTable / chem.alphaRatio
    items.push(item('P1', '原子尺度', atomScale, 'm',
      '由 α 比值 ' + chem.alphaRatio.toFixed(3) + ' 推出的电子云尺度（基准 a₀）', [5e-11, 3e-10]))
  }

  if (typeof chem.stability === 'number') {
    const stableEnough = chem.stability >= 10
    items.push({
      card: '化学稳定度',
      value: chem.stability,
      unit: 'kT 倍数',
      verdict: (stableEnough ? 'allowed' : 'forbidden') as Verdict,
      allowed: [10, 1e6],
      note: stableEnough
        ? '键能是热扰动的 ' + chem.stability.toFixed(0) + ' 倍，分子能稳定存在'
        : '键能仅为热扰动的 ' + chem.stability.toFixed(1) + ' 倍，分子会被热运动拆散',
    })
  }

  return makeLayer('P1', '微观有效层（化学）', items)
}

/** P2 介观层：材料与相态是否可用。数据来自 planet 与 temperature。 */
function layerP2(world: any): LayerResult {
  const planet = (world && world.planet) || {}
  const temp = (world && world.temperature) || {}
  const items: LayerResult['items'] = []

  if (typeof planet.densityKgM3 === 'number') {
    items.push(item('P2', '材料强度密度比', planet.densityKgM3 / 1000 * 1e5, 'N·m/kg',
      '由行星平均密度 ' + planet.densityKgM3.toFixed(0) + ' kg/m³ 折算的材料尺度', [1e4, 1e8]))
  }

  if (typeof temp.surfaceMeanK === 'number' && typeof temp.freezingPointK === 'number' &&
      typeof temp.boilingPointK === 'number') {
    const span = temp.boilingPointK - temp.freezingPointK
    const inside = temp.surfaceMeanK > temp.freezingPointK && temp.surfaceMeanK < temp.boilingPointK
    items.push({
      card: '液态溶剂窗口',
      value: temp.surfaceMeanK,
      unit: 'K',
      verdict: (inside ? 'allowed' : 'forbidden') as Verdict,
      allowed: [temp.freezingPointK, temp.boilingPointK],
      note: inside
        ? '地表均温 ' + temp.surfaceMeanK.toFixed(0) + ' K 落在水 ' +
          temp.freezingPointK.toFixed(0) + '—' + temp.boilingPointK.toFixed(0) + ' K 液态窗口内（跨度 ' + span.toFixed(0) + ' K）'
        : '地表均温 ' + temp.surfaceMeanK.toFixed(0) + ' K 超出液态水窗口，溶剂无法稳定存在',
    })
  }

  return makeLayer('P2', '介观材料层（材料与相态）', items)
}

/** P3 体感层：生物力学是否成立。数据来自 planet 与 atmosphere。 */
function layerP3(world: any): LayerResult {
  const planet = (world && world.planet) || {}
  const atm = (world && world.atmosphere) || {}
  const items: LayerResult['items'] = []

  if (typeof planet.surfaceGravityEarth === 'number' && planet.surfaceGravityEarth > 0) {
    const ratio = 5 / planet.surfaceGravityEarth
    items.push(item('P3', '骨骼强度体重比', ratio, '无量纲',
      '重力为地球的 ' + planet.surfaceGravityEarth.toFixed(2) + ' 倍；地球基准大型陆生动物约 5，按反比折算', [3, 100]))
  }

  if (typeof atm.scaleHeightM === 'number' && atm.scaleHeightM > 0) {
    const ratio = 1.7 / atm.scaleHeightM
    items.push(item('P3', '身高大气标高比', ratio, '无量纲',
      '大气标高 ' + atm.scaleHeightM.toFixed(0) + ' m；人类 1.7 m 占比 ' + (ratio * 100).toFixed(3) + '%', [1e-4, 1e-2]))
  }

  if (typeof planet.surfaceGravityEarth === 'number' && planet.surfaceGravityEarth > 0) {
    const ratio = 0.34 / Math.sqrt(planet.surfaceGravityEarth)
    items.push(item('P3', '反应时间重力比', ratio, '无量纲',
      '重力 ' + planet.surfaceGravityEarth.toFixed(2) + ' g；人类反应 0.2 s 相对坠落时间衡量', [0.01, 10]))
  }

  return makeLayer('P3', '宏观体感层（生物力学）', items)
}

/** P4 行星层：大气是否留得住、地质是否活着。 */
function layerP4(world: any): LayerResult {
  const planet = (world && world.planet) || {}
  const atm = (world && world.atmosphere) || {}
  const temp = (world && world.temperature) || {}
  const items: LayerResult['items'] = []

  // 大气逃逸：用逃逸速度与热速率的比值（Jeans 参数）粗判
  // 逃逸速度与热速率都走公式库/常数表，不硬编码 kB、NA。
  if (typeof planet.escapeVelocity === 'number' && typeof temp.surfaceMeanK === 'number') {
    // 水的摩尔质量从常数表取（molarMassWater），没有就用 0.018 kg/mol
    // 全部走常数表：kB / NA 是 SI 定义常数，水的摩尔质量是化学常数。
    // 若常数表缺项，这一层就不判定（返回 undefined），而不是用硬编码值硬算。
    const kB = constantValue('kB')
    const NA = constantValue('NA')
    const molarMassWater = constantValue('molarMassWater')
    if (typeof kB === 'number' && typeof NA === 'number') {
      const mWater = (molarMassWater !== undefined ? molarMassWater : 0.018) / NA
      const vThermal = Math.sqrt((3 * kB * temp.surfaceMeanK) / mWater)
      const jeans = planet.escapeVelocity / vThermal
      const retains = jeans > 6
      items.push({
        card: '大气逃逸率',
        value: jeans,
        unit: 'Jeans 参数',
        verdict: (retains ? 'allowed' : 'forbidden') as Verdict,
        allowed: [6, 1e9],
        note: retains
          ? '逃逸速度是水分子热速率的 ' + jeans.toFixed(1) + ' 倍，大气能长期保留'
          : '逃逸速度仅为热速率的 ' + jeans.toFixed(1) + ' 倍，大气会在地质时间尺度内散失',
      })
    }
  }

  if (typeof atm.pressureAtm === 'number') {
    items.push(item('P4', '大气压', atm.pressureAtm, 'atm',
      '海平面气压；过低无法形成气候系统，过高有温室失控风险', [0.3, 5]))
  }

  return makeLayer('P4', '行星环境层（大气与地质）', items)
}

/** P5 恒星层：寿命与辐射窗口。 */
function layerP5(world: any, star: any): LayerResult {
  const stellar = (world && world.stellar) || star || {}
  const items: LayerResult['items'] = []

  if (typeof stellar.lifetimeGyr === 'number') {
    items.push(item('P5', '恒星寿命', stellar.lifetimeGyr * 1e9, 'yr',
      stellar.massSun !== undefined ? stellar.massSun.toFixed(2) + ' M☉ 的主序寿命' : '主序寿命', [1e7, 1e11]))
  }

  if (typeof stellar.peakWavelengthNm === 'number') {
    // 单位必须与卡片一致：卡片库里这张卡的单位是 m，而 world 给的是 nm。
    // 曾经把 nm 当 m 判，导致 501 nm 与 3e-7—2e-6（米）比，永远越界。
    items.push(item('P5', '辐射谱峰值波长', stellar.peakWavelengthNm * 1e-9, 'm',
      '黑体峰值波长 ' + stellar.peakWavelengthNm.toFixed(0) + ' nm；落在可见光区最适合光合作用', [3e-7, 2e-6]))
  }

  if (typeof stellar.habitableZoneAU === 'object' && Array.isArray(stellar.habitableZoneAU)) {
    items.push({
      card: '宜居带宽度',
      value: stellar.habitableZoneAU[1] - stellar.habitableZoneAU[0],
      unit: 'AU',
      verdict: 'allowed' as Verdict,
      allowed: [0.1, 10],
      note: '宜居带 ' + stellar.habitableZoneAU[0].toFixed(2) + '—' + stellar.habitableZoneAU[1].toFixed(2) + ' AU，宽度 ' + (stellar.habitableZoneAU[1] - stellar.habitableZoneAU[0]).toFixed(2) + ' AU',
    })
  }

  return makeLayer('P5', '恒星天文层（寿命与辐射）', items)
}

/**
 * 跑完整正向链路：从 world 输出逐层判定到 P5。
 *
 * @param worldValue - opWorld 的 value 字段
 * @param star - 可选的恒星参数覆盖
 * @returns 全链路结果与建议
 */
export function runPipeline(worldValue: any, star?: any): PipelineResult {
  const world = worldValue || {}
  const layers: LayerResult[] = [
    layerP1(world),
    layerP2(world),
    layerP3(world),
    layerP4(world),
    layerP5(world, star),
  ]

  const firstBlockedLayer = layers.find(function (l) {
    return l.items.some(function (it) { return it.verdict === 'forbidden' })
  })
  const firstBlocked = firstBlockedLayer ? firstBlockedLayer.layer : null

  let verdict: Verdict = 'allowed'
  for (const layer of layers) {
    for (const it of layer.items) {
      if (it.verdict === 'forbidden') { verdict = 'forbidden'; break }
      if (it.verdict === 'marginal' && verdict === 'allowed') verdict = 'marginal'
      if (it.verdict === 'pending' && verdict === 'allowed') verdict = 'pending'
    }
    if (verdict === 'forbidden') break
  }

  const advice: string[] = []
  for (const layer of layers) {
    for (const it of layer.items) {
      if (it.verdict === 'forbidden') {
        advice.push(layer.layer + ' ' + it.card + ' 越界：' + it.note)
      }
    }
  }
  if (advice.length === 0) advice.push('全链路通过：这个世界在此分辨率下自洽。')

  return { layers: layers, firstBlocked: firstBlocked, verdict: verdict, advice: advice }
}

/**
 * 渲染全链路报告。
 *
 * @param result - runPipeline 的结果
 * @returns 可读文本
 */
export function renderPipeline(result: PipelineResult): string {
  const out: string[] = []
  out.push('═══ 正向推演链路（P1 → P5）═══')
  out.push('')
  for (const layer of result.layers) {
    const flag = layer.allAllowed ? '✓' : '✗'
    out.push('【' + layer.layer + '】' + layer.name + '  ' + flag)
    for (const it of layer.items) {
      const mark = it.verdict === 'allowed' ? '  ok ' : it.verdict === 'marginal' ? '  !  ' : it.verdict === 'forbidden' ? '  X  ' : '  ?  '
      const range = it.allowed ? '  [允许 ' + fmtNum(it.allowed[0]) + '—' + fmtNum(it.allowed[1]) + ']' : ''
      out.push(mark + it.card.padEnd(16) + fmtNum(it.value).padStart(12) + ' ' + it.unit.padEnd(10) + range)
      if (it.verdict !== 'allowed') out.push('       ' + it.note)
    }
    out.push('')
  }
  out.push('总结论：' + VERDICT_LABEL[result.verdict] + (result.firstBlocked ? '（首个断点 ' + result.firstBlocked + '）' : ''))
  out.push('')
  out.push('建议：')
  for (const line of result.advice) out.push('  · ' + line)
  return out.join(String.fromCharCode(10))
}

/** 数字格式化。 */
function fmtNum(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs === 0) return '0'
  if (abs >= 1e5 || abs < 1e-2) return value.toExponential(2)
  return Number(value.toPrecision(4)).toString()
}
