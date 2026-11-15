/**
 * 冲突/贡赋模型——原料来自 dmasad/WorldBuilding 的 TributeModel.py（Axelrod 1995）。
 *
 * ## 原实现做了三件事
 *
 * 1. **wealth 即权力**：每步随机增长；
 * 2. **索贡**：强者向邻居中最弱者索贡——对方可选「付贡」或「开战」；
 * 3. **承诺度（commitment）**：付贡/合战上升，敌对下降；战争靠**联盟**（commitment 偏向一方者集合）决胜负，
 *    而且「只有能拉起触及目标的联盟才能索贡」。
 *
 * ## 二次加工（不照抄）
 *
 * - 原版用 networkx + 全排列搜索联盟；这里用**确定性 PRNG（seed）** + 邻接表 + 按 commitment 阈值站队；
 * - 原版是"一直跑下去"的模拟；这里给**有限步数 + 上限输出**（谁崛起、几次战争、谁亡）；
 * - 原版 wealth 增长随机；这里**增长也走 seed**，保证同输入同输出；
 * - 输出只给结构与数值，不写叙事（叙事归 AI）。
 *
 * @module dsh-math-calculator/features/deduction/conflict
 */

import { CalcError } from '../../core/errors.js'
import { createPrng, roll, rollInt, seedFrom, type PrngState } from '../../core/prng.js'

/** 行动者。 */
export interface Actor {
  id: string
  /** 财富（= 权力）。 */
  wealth: number
}

/** 输入。 */
export interface ConflictInput {
  /** 行动者。 */
  actors: Actor[]
  /** 邻接（无向）。 */
  edges: Array<{ from: string; to: string }>
  /** 步数（默认 50）。 */
  steps?: number
  /** 随机种子（默认 1）。 */
  seed?: number
  /** 每年财富增长率（默认 0.02）。 */
  growth?: number
}

/** 结果。 */
export interface ConflictResult {
  /** 最终财富排序（高→低）。 */
  ranking: Array<{ id: string; wealth: number }>
  /** 战争次数。 */
  wars: number
  /** 付贡次数。 */
  tributes: number
  /** 各行动者战果（胜/负）。 */
  records: Record<string, { wins: number; losses: number }>
  /** 最强/最弱。 */
  strongest: string
  weakest: string
  /** 说明。 */
  notes: string[]
}

/**
 * 运行贡赋/战争模拟。
 *
 * @param input - 行动者与网络
 * @returns 结果
 * @throws {CalcError} 数据非法
 */
export function runConflict(input: ConflictInput): ConflictResult {
  const actors = input.actors ?? []
  if (!Array.isArray(actors) || actors.length < 2) throw new CalcError('invalid_argument', '至少需要 2 个行动者', '')
  const ids = new Set(actors.map((a) => a.id))
  for (const edge of input.edges ?? []) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new CalcError('invalid_argument', '邻接里出现未定义行动者：' + edge.from + '/' + edge.to, '')
  }
  const steps = Math.max(1, Math.floor(input.steps ?? 50))
  const growth = typeof input.growth === 'number' ? input.growth : 0.02
  const prng: PrngState = createPrng(seedFrom(typeof input.seed === 'number' ? input.seed : 1, actors.length, steps))
  const wealth = new Map<string, number>(actors.map((a) => [a.id, Math.max(1, a.wealth)]))
  /** 承诺度：pair → 值（0 = 中性，正 = 亲近）。 */
  const commitment = new Map<string, number>()
  const key = (a: string, b: string): string => (a < b ? a + '|' + b : b + '|' + a)
  for (const edge of input.edges ?? []) commitment.set(key(edge.from, edge.to), 0)
  const neighbors = new Map<string, string[]>()
  for (const actor of actors) neighbors.set(actor.id, [])
  for (const edge of input.edges ?? []) {
    neighbors.get(edge.from)?.push(edge.to)
    neighbors.get(edge.to)?.push(edge.from)
  }
  const records: Record<string, { wins: number; losses: number }> = {}
  for (const actor of actors) records[actor.id] = { wins: 0, losses: 0 }
  let wars = 0
  let tributes = 0
  for (let step = 0; step < steps; step += 1) {
    /** 每步全体增长（随机幅度，同 seed 可复现）。 */
    for (const actor of actors) {
      const rate = growth * (0.5 + roll(prng))
      wealth.set(actor.id, (wealth.get(actor.id) ?? 1) * (1 + rate))
    }
    const actor = actors[rollInt(prng, 0, actors.length - 1)]
    const candidates = (neighbors.get(actor.id) ?? []).filter((id) => (wealth.get(id) ?? 0) < (wealth.get(actor.id) ?? 0))
    if (candidates.length === 0) continue
    /** 选最弱者索贡。 */
    candidates.sort((a, b) => (wealth.get(a) ?? 0) - (wealth.get(b) ?? 0))
    const target = candidates[0]
    const targetWealth = wealth.get(target) ?? 1
    const actorWealth = wealth.get(actor.id) ?? 1
    /** 抵抗意愿：太弱就付贡，够强就打。 */
    const willFight = targetWealth / actorWealth > 0.6 && roll(prng) > 0.5
    if (!willFight) {
      const toll = Math.max(1, targetWealth * 0.02)
      wealth.set(target, targetWealth - toll)
      wealth.set(actor.id, actorWealth + toll)
      commitment.set(key(actor.id, target), (commitment.get(key(actor.id, target)) ?? 0) + 0.1)
      tributes += 1
      continue
    }
    /** 战争：按承诺度站队。 */
    const attackerSide: string[] = [actor.id]
    const defenderSide: string[] = [target]
    for (const other of actors) {
      if (other.id === actor.id || other.id === target) continue
      const toActor = commitment.get(key(other.id, actor.id)) ?? 0
      const toTarget = commitment.get(key(other.id, target)) ?? 0
      if (toActor > toTarget + 0.05) attackerSide.push(other.id)
      else if (toTarget > toActor + 0.05) defenderSide.push(other.id)
    }
    const sideWealth = (side: string[]): number => side.reduce((sum, id) => sum + (wealth.get(id) ?? 0), 0)
    const attackScore = sideWealth(attackerSide)
    const defendScore = sideWealth(defenderSide)
    const winner = attackScore >= defendScore ? actor.id : target
    const loser = winner === actor.id ? target : actor.id
    const spoils = Math.max(1, (wealth.get(loser) ?? 1) * 0.1)
    wealth.set(loser, (wealth.get(loser) ?? 1) - spoils)
    wealth.set(winner, (wealth.get(winner) ?? 1) + spoils)
    records[winner].wins += 1
    records[loser].losses += 1
    commitment.set(key(actor.id, target), (commitment.get(key(actor.id, target)) ?? 0) - 0.2)
    wars += 1
  }
  const ranking = [...wealth.entries()].map(([id, value]) => ({ id, wealth: value })).sort((a, b) => b.wealth - a.wealth)
  return {
    ranking,
    wars,
    tributes,
    records,
    strongest: ranking[0].id,
    weakest: ranking[ranking.length - 1].id,
    notes: ['步数 ' + steps + '，seed=' + (input.seed ?? 1) + '（同 seed 可复现）', '付贡/开战由「实力比 + 随机」决定；联盟按承诺度站队', '输出只给结构与数值，叙事由 AI 写'],
  }
}
/** 分步快照（供 history 使用）。 */
export interface ConflictSeries {
  /** 每年（步）总财富。 */
  series: Array<{ year: number; value: number }>
  /** 事件（战争/付贡高峰）。 */
  events: Array<{ year: number; label: string; kind?: string }>
  /** 每年最强势力。 */
  leaders: Array<{ year: number; id: string }>
  /** 财富集中度（HHI，0–1）。 */
  concentration: Array<{ year: number; hhi: number }>
  /** 最强势力份额（0–1，有涨落 → 可用于纪元划分）。 */
  leaderShare: Array<{ year: number; value: number }>
}

/**
 * 跑冲突并记录逐年快照（conflict → history 的桥）。
 *
 * @param input - 同 runConflict
 * @returns 逐年序列与事件
 */
export function runConflictSeries(input: ConflictInput): ConflictSeries {
  const actors = input.actors ?? []
  if (!Array.isArray(actors) || actors.length < 2) throw new CalcError('invalid_argument', '至少需要 2 个行动者', '')
  const steps = Math.max(1, Math.floor(input.steps ?? 50))
  const growth = typeof input.growth === 'number' ? input.growth : 0.02
  const prng = createPrng(seedFrom(typeof input.seed === 'number' ? input.seed : 1, actors.length, steps))
  const wealth = new Map<string, number>(actors.map((a) => [a.id, Math.max(1, a.wealth)]))
  const key = (a: string, b: string): string => (a < b ? a + '|' + b : b + '|' + a)
  const commitment = new Map<string, number>()
  const neighbors = new Map<string, string[]>()
  for (const actor of actors) neighbors.set(actor.id, [])
  for (const edge of input.edges ?? []) {
    commitment.set(key(edge.from, edge.to), 0)
    neighbors.get(edge.from)?.push(edge.to)
    neighbors.get(edge.to)?.push(edge.from)
  }
  const series: ConflictSeries['series'] = []
  const events: ConflictSeries['events'] = []
  const leaders: ConflictSeries['leaders'] = []
  const concentration: ConflictSeries['concentration'] = []
  const leaderShare: ConflictSeries['leaderShare'] = []
  for (let step = 0; step < steps; step += 1) {
    for (const actor of actors) {
      const rate = growth * (0.5 + roll(prng))
      wealth.set(actor.id, (wealth.get(actor.id) ?? 1) * (1 + rate))
    }
    const actor = actors[rollInt(prng, 0, actors.length - 1)]
    const candidates = (neighbors.get(actor.id) ?? []).filter((id) => (wealth.get(id) ?? 0) < (wealth.get(actor.id) ?? 0))
    if (candidates.length > 0) {
      candidates.sort((a, b) => (wealth.get(a) ?? 0) - (wealth.get(b) ?? 0))
      const target = candidates[0]
      const targetWealth = wealth.get(target) ?? 1
      const actorWealth = wealth.get(actor.id) ?? 1
      if (targetWealth / actorWealth > 0.6 && roll(prng) > 0.5) {
        const spoils = Math.max(1, targetWealth * 0.1)
        wealth.set(target, targetWealth - spoils)
        wealth.set(actor.id, actorWealth + spoils)
        events.push({ year: step, label: actor.id + ' 对 ' + target + ' 开战并取胜', kind: 'war' })
        commitment.set(key(actor.id, target), (commitment.get(key(actor.id, target)) ?? 0) - 0.2)
      } else {
        const toll = Math.max(1, targetWealth * 0.02)
        wealth.set(target, targetWealth - toll)
        wealth.set(actor.id, actorWealth + toll)
        commitment.set(key(actor.id, target), (commitment.get(key(actor.id, target)) ?? 0) + 0.1)
      }
    }
    const total = [...wealth.values()].reduce((sum, v) => sum + v, 0)
    series.push({ year: step, value: total })
    const sorted = [...wealth.entries()].sort((a, b) => b[1] - a[1])
    leaders.push({ year: step, id: sorted[0][0] })
    const hhi = [...wealth.values()].reduce((sum, v) => sum + (v / total) ** 2, 0)
    concentration.push({ year: step, hhi })
    leaderShare.push({ year: step, value: sorted[0][1] / total })
  }
  return { series, events, leaders, concentration, leaderShare }
}
