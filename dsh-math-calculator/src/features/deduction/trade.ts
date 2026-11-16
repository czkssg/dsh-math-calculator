/**
 * 贸易网络：比较优势 → 引力模型 → 流向矩阵与断供风险。
 *
 * ## 模型（为什么是这几个式子）
 *
 * 1. **比较优势**：某地某商品的机会成本 = 本地产出比 / 外部相对价格 → 谁该卖什么；
 * 2. **引力模型**：`flow(A→B) = 产出A × 需求B / 距离^β`（β 默认 1.5，经典贸易引力）；
 * 3. **断供风险**：去掉一条路线后，谁的需求缺口最大。
 *
 * ## 开源结论
 *
 * `trade-network`（Apache-2，42 KB）用途不明；图结构直接用已装的 graphology。
 * 所以本模块只写「经济量」，网络遍历交给 graphology。
 *
 * @module dsh-math-calculator/features/deduction/trade
 */

import { CalcError } from '../../core/errors.js'

/** 一个地区。 */
export interface TradeRegion {
  /** 名称。 */
  id: string
  /** 各商品产出（吨/年 等）。 */
  supply: Record<string, number>
  /** 各商品需求。 */
  demand: Record<string, number>
}

/** 一条路线。 */
export interface TradeRoute {
  from: string
  to: string
  /** 距离 km。 */
  distanceKm: number
  /** 单位运价（每吨每 km）。 */
  freightPerTonKm?: number
  /** 关税（0–1）。 */
  tariff?: number
}

/** 输入。 */
export interface TradeInput {
  regions: TradeRegion[]
  routes: TradeRoute[]
  /** 引力指数 β（默认 1.5）。 */
  beta?: number
}

/** 结果。 */
export interface TradeResult {
  /** 流向（按商品）。 */
  flows: Array<{ good: string; from: string; to: string; quantity: number; freightTons: number; landedCostPerTon: number }>
  /** 各地自给率与总运费。 */
  selfSufficiency: Array<{ id: string; good: string; ratio: number }>
  totalFreight: number
  /** 断供风险：每条路线中断后，受影响最大的一方。 */
  fragility: Array<{ route: string; worstRegion: string; shortfallRatio: number }>
  notes: string[]
}

/**
 * 计算贸易流向。
 *
 * @param input - 地区/路线/引力指数
 * @returns 流向、自给率、断供风险
 * @throws {CalcError} 地区为空或路线指向未知地区
 */
export function computeTrade(input: TradeInput): TradeResult {
  const regions = input.regions ?? []
  const routes = input.routes ?? []
  if (regions.length === 0) throw new CalcError('invalid_argument', '需要 regions（至少一个地区）', '')
  const byId = new Map(regions.map((region) => [region.id, region]))
  for (const route of routes) {
    if (!byId.has(route.from)) throw new CalcError('invalid_argument', '路线起点「' + route.from + '」不在 regions 里', '')
    if (!byId.has(route.to)) throw new CalcError('invalid_argument', '路线终点「' + route.to + '」不在 regions 里', '')
    if (!(route.distanceKm > 0)) throw new CalcError('invalid_argument', '路线「' + route.from + '→' + route.to + '」距离必须为正', '')
  }
  const beta = input.beta ?? 1.5
  const goods = [...new Set(regions.flatMap((region) => Object.keys(region.supply)))]
  const flows: TradeResult['flows'] = []
  /** 每个商品的缺口/盈余。 */
  for (const good of goods) {
    for (const route of routes) {
      const source = byId.get(route.from) as TradeRegion
      const target = byId.get(route.to) as TradeRegion
      const surplus = Math.max(0, (source.supply[good] ?? 0) - (source.demand[good] ?? 0))
      const deficit = Math.max(0, (target.demand[good] ?? 0) - (target.supply[good] ?? 0))
      if (surplus <= 0 || deficit <= 0) continue
      /** 引力：产出 × 需求 / 距离^β。 */
      const gravity = (surplus * deficit) / Math.pow(route.distanceKm / 1000, beta)
      /** 可运量受运价与关税约束：运价越高，实际流动越少。 */
      const freightPerTon = (route.freightPerTonKm ?? 0.02) * route.distanceKm
      const landedExtra = freightPerTon * (1 + (route.tariff ?? 0))
      const quantity = Math.min(surplus, deficit, gravity / Math.max(1, landedExtra))
      if (quantity <= 0) continue
      flows.push({ good, from: route.from, to: route.to, quantity, freightTons: quantity, landedCostPerTon: landedExtra })
    }
  }
  /** 自给率：本地供给 / 需求（含运入）。 */
  const selfSufficiency: TradeResult['selfSufficiency'] = []
  for (const region of regions) {
    for (const good of goods) {
      const demand = region.demand[good] ?? 0
      if (demand <= 0) continue
      const imported = flows.filter((flow) => flow.to === region.id && flow.good === good).reduce((sum, flow) => sum + flow.quantity, 0)
      const supply = (region.supply[good] ?? 0) + imported
      selfSufficiency.push({ id: region.id, good, ratio: supply / demand })
    }
  }
  const totalFreight = flows.reduce((sum, flow) => sum + flow.quantity * flow.landedCostPerTon, 0)
  /** 断供：逐条路线移除，看哪个地区的自给率掉最多。 */
  const fragility: TradeResult['fragility'] = []
  for (const route of routes) {
    const without = flows.filter((flow) => !(flow.from === route.from && flow.to === route.to))
    let worstRegion = ''
    let worstRatio = 0
    for (const region of regions) {
      for (const good of goods) {
        const demand = region.demand[good] ?? 0
        if (demand <= 0) continue
        const imported = without.filter((flow) => flow.to === region.id && flow.good === good).reduce((sum, flow) => sum + flow.quantity, 0)
        const ratio = ((region.supply[good] ?? 0) + imported) / demand
        const shortfall = 1 - Math.min(1, ratio)
        if (shortfall > worstRatio) { worstRatio = shortfall; worstRegion = region.id }
      }
    }
    if (worstRatio > 0) fragility.push({ route: route.from + '→' + route.to, worstRegion, shortfallRatio: worstRatio })
  }
  fragility.sort((a, b) => b.shortfallRatio - a.shortfallRatio)
  const notes = [
    '引力模型：流量 ∝ 产出 × 需求 / 距离^' + beta + '，再按到岸成本折减',
    '流向 ' + flows.length + ' 条，总运费 ' + totalFreight.toFixed(1),
  ]
  if (fragility.length > 0) notes.push('最脆弱路线：' + fragility[0].route + '（断后 ' + fragility[0].worstRegion + ' 缺口 ' + (fragility[0].shortfallRatio * 100).toFixed(0) + '%）')
  return { flows, selfSufficiency, totalFreight, fragility, notes }
}
