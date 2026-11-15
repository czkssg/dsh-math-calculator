/**
 * 闭环稳态求解 + 故障模式 + 多舱段泄漏：给**上限**，不设计具体方案。
 *
 * 用户原则（2026-11-16）：工具只算硬边界（「最多撑多少人/多少小时」），
 * 具体怎么圆（加设备、减人、轮作）由 AI 或作者决定。
 *
 * ## 四平衡（O₂ / CO₂ / 水 / 食物）
 *
 * - 氧：作物 + 藻产氧 vs 人耗氧 0.84 kg/人·天；
 * - 碳：作物固碳 vs 人呼出 1.0 kg/人·天；
 * - 水：回收率 vs 人均消耗；
 * - 食物：作物干重 vs 0.62 kg/人·天。
 *
 * 「自持上限人数」= 各平衡允许人数的**最小值**（木桶短板）。
 *
 * @module dsh-math-calculator/features/topology/closure
 */

import { CalcError } from '../../core/errors.js'

/** 输入。 */
export interface ClosureInput {
  /** 人数。 */
  people: number
  /** 温室种植面积 m²。 */
  cropAreaM2?: number
  /** 藻类反应器体积 m³。 */
  algaeM3?: number
  /** 水回收率（0–1，默认 0.93）。 */
  waterRecycle?: number
  /** 氧气缓冲 kg（可选）。 */
  bufferO2Kg?: number
  /** 舱体积 m³（故障模式用）。 */
  volumeM3?: number
}

/** 闭环结果。 */
export interface ClosureResult {
  /** 需要多少面积才能供氧（m²）。 */
  o2RequiredAreaM2: number
  /** 实际作物供氧 kg/天。 */
  o2ProducedKgDay: number
  /** 氧缺口 kg/天（负值=富余）。 */
  o2GapKgDay: number
  /** 食物自给率 %。 */
  foodSelfSufficiencyPct: number
  /** 水自给率 %。 */
  waterSelfSufficiencyPct: number
  /** 自持上限人数（木桶短板）。 */
  maxSelfSufficientPeople: number
  /** 短板项。 */
  bottleneck: string
  /** 故障：CO₂ 清除失效到 5000 ppm 的小时数。 */
  hoursToCo2Critical: number | null
  /** 故障：氧缓冲耗尽小时数。 */
  hoursToO2Depletion: number | null
}

/**
 * 求解闭环稳态与上限。
 *
 * @param input - 人数/面积/藻体积
 * @returns 闭环结果
 */
export function solveClosure(input: ClosureInput): ClosureResult {
  if (!(input.people > 0)) throw new CalcError('invalid_argument', 'people 必须为正', '')
  const people = input.people
  const area = input.cropAreaM2 ?? 0
  const algae = input.algaeM3 ?? 0
  const waterRecycle = input.waterRecycle ?? 0.93
  /** 作物产氧 0.03 kg/(m²·天)；藻类 1.3 kg/(m³·天)。 */
  const o2Produced = area * 0.03 + algae * 1.3
  const o2Needed = people * 0.84
  const o2Gap = o2Produced - o2Needed
  const o2RequiredArea = o2Needed / 0.03
  /** 食物：作物干重 0.02 kg/(m²·天)、藻干重 0.06 kg/(m³·天)。 */
  const foodProduced = area * 0.02 + algae * 0.06
  const foodNeeded = people * 0.62
  const foodPct = foodNeeded > 0 ? Math.min(100, (foodProduced / foodNeeded) * 100) : 100
  const waterPct = Math.min(100, waterRecycle * 100)
  /** 上限：各平衡能支持的人数（食物/氧/水取最小）。 */
  const byOxygen = o2Needed > 0 ? (o2Produced / 0.84) : 0
  const byFood = (foodProduced / 0.62)
  const candidates: Array<{ name: string; value: number }> = [
    { name: '氧', value: byOxygen },
    { name: '食物', value: byFood },
  ]
  let bottleneck = '氧'
  let maxPeople = Infinity
  for (const c of candidates) {
    if (c.value < maxPeople) { maxPeople = c.value; bottleneck = c.name }
  }
  /** 故障模式：CO₂ 到 5000 ppm（短时上限），按 1.98 kg/m³。 */
  const co2KgDay = people * 1.0
  const hoursToCo2Critical = input.volumeM3 !== undefined && input.volumeM3 > 0 ? ((5000 * 1.98 * input.volumeM3) / 1e6 / co2KgDay) * 24 : null
  const hoursToO2Depletion = input.bufferO2Kg !== undefined && input.bufferO2Kg > 0 ? (input.bufferO2Kg / o2Needed) * 24 : null
  return {
    o2RequiredAreaM2: o2RequiredArea,
    o2ProducedKgDay: o2Produced,
    o2GapKgDay: o2Gap,
    foodSelfSufficiencyPct: foodPct,
    waterSelfSufficiencyPct: waterPct,
    maxSelfSufficientPeople: Math.max(0, maxPeople),
    bottleneck,
    hoursToCo2Critical,
    hoursToO2Depletion,
  }
}

/** 多舱段输入。 */
export interface CompartmentTopologyInput {
  /** 舱室（id/体积）。 */
  compartments: Array<{ id: string; volumeM3: number }>
  /** 通道（from/to/是否气闸）。 */
  passages: Array<{ from: string; to: string; airlock?: boolean }>
}

/** 多舱段结果。 */
export interface CompartmentResult {
  /** 总泄漏 kg/天（0.1%/天）。 */
  totalLeakKgDay: number
  /** 可连通的舱室 id（从第一舱出发）。 */
  reachable: string[]
  /** 是否所有舱可达。 */
  fullyConnected: boolean
  /** 关键舱（移除后有舱室失联）。 */
  criticalCompartments: string[]
  /** 气闸数量。 */
  airlockCount: number
}

/**
 * 多舱段连通与泄漏（给上限：哪些舱必须能互达、总泄漏多少）。
 *
 * @param input - 舱室与通道
 * @returns 结果
 */
export function analyzeCompartments(input: CompartmentTopologyInput): CompartmentResult {
  if (!Array.isArray(input.compartments) || input.compartments.length === 0) throw new CalcError('invalid_argument', 'compartments 不能为空', '')
  const totalVolume = input.compartments.reduce((sum, c) => sum + Math.max(0, c.volumeM3), 0)
  /** 空气密度 1.2 kg/m³、日泄漏 0.1%。 */
  const totalLeakKgDay = totalVolume * 1.2 * 0.001
  const start = input.compartments[0].id
  const graph = new Map<string, Set<string>>()
  for (const c of input.compartments) graph.set(c.id, new Set())
  for (const p of input.passages) {
    graph.get(p.from)?.add(p.to)
    graph.get(p.to)?.add(p.from)
  }
  const bfs = (removed: string | null): string[] => {
    if (start === removed) return []
    const seen = new Set<string>([start])
    const queue = [start]
    while (queue.length > 0) {
      const node = queue.shift() as string
      for (const next of graph.get(node) ?? []) {
        if (next === removed || seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    return [...seen]
  }
  const reachable = bfs(null)
  const fullyConnected = reachable.length === input.compartments.length
  const critical = input.compartments.map((c) => c.id).filter((id) => bfs(id).length < reachable.length && id !== start)
  return { totalLeakKgDay, reachable, fullyConnected, criticalCompartments: critical, airlockCount: input.passages.filter((p) => p.airlock === true).length }
}
