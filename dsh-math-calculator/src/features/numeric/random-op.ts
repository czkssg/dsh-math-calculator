/**
 * `random`：长周期可复现随机数 + 行为映射。
 *
 * ## 两种用法
 *
 * 1. **序列**：给 count / min / max / integer，取一串数；
 * 2. **行为映射**：给 actors + traits，每个实体得到一组特征值——
 *    每个实体的子流由 `seed|实体名` 派生，**与实体顺序无关**（同一人无论排第几都得同一值）。
 *
 * ## 周期与可复现
 *
 * 默认 xoshiro256++（周期 2^256−1）；同 seed 同结果，跨调用可复现。
 * `algorithm:"lcg"` 走旧 LCG（周期 2^32，仅为兼容旧推演）。
 *
 * @module dsh-math-calculator/features/numeric/random-op
 */

import { CalcError } from '../../core/errors.js'
import { createPrng, roll, rollInt } from '../../core/prng.js'
import {
  XOSHIRO_INFO,
  createXoshiro,
  xoshiroFloat,
  xoshiroInt,
  xoshiroNext,
  xoshiroSubstream,
  type XoshiroState,
} from '../../core/xoshiro.js'

/** 一个特征的设定。 */
export interface RandomTrait {
  /** 数值下界（默认 0）。 */
  min?: number
  /** 数值上界（默认 1）。 */
  max?: number
  /** 选项（与 min/max 二选一）：随机取一个。 */
  choices?: string[]
}

/** 输入。 */
export interface RandomInput {
  /** 世界种子文本（默认空 = 固定默认种子）。 */
  randomSeed?: string
  /** 序列长度（默认 10，上限 1000）。 */
  count?: number
  /** 下界（默认 0）。 */
  min?: number
  /** 上界（默认 1）。 */
  max?: number
  /** 取整数（默认 false = 浮点）。 */
  integer?: boolean
  /** 行为映射的实体名列表。 */
  randomActors?: string[]
  /** 行为映射的特征表。 */
  randomTraits?: Record<string, RandomTrait>
  /** 算法：xoshiro256pp（默认）/ lcg。 */
  algorithm?: 'xoshiro256pp' | 'lcg'
}

/** 结果。 */
export interface RandomOutcome {
  result: string
  value: Record<string, unknown>
  notice?: string
}

/**
 * 跑一次随机。
 *
 * @param input - 种子、范围、实体与特征
 * @returns 文本与结构化结果
 */
export function runRandom(input: RandomInput = {}): RandomOutcome {
  const seedText = typeof input.randomSeed === 'string' ? input.randomSeed : ''
  const algorithm = input.algorithm === 'lcg' ? 'lcg' : 'xoshiro256pp'
  /** count:0 是合法边界（返回空序列）；负数按 0 处理。 */
  const count = Math.max(0, Math.min(1000, Number.isFinite(input.count ?? NaN) ? (input.count as number) : 10))
  const min = Number.isFinite(input.min ?? NaN) ? (input.min as number) : 0
  const max = Number.isFinite(input.max ?? NaN) ? (input.max as number) : 1
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw new CalcError('invalid_argument', 'random 的 min/max 必须是有限数', '例如 min:0, max:100。')
  if (max < min) throw new CalcError('invalid_argument', 'random 的 max 必须 ≥ min', '例如 min:0, max:1。')
  const integer = input.integer === true
  const actors = Array.isArray(input.randomActors) ? input.randomActors.filter((item) => typeof item === 'string' && item.trim() !== '') : []
  const traits = input.randomTraits !== null && typeof input.randomTraits === 'object' && !Array.isArray(input.randomTraits) ? input.randomTraits : {}

  const lines: string[] = []
  const header = algorithm === 'lcg'
    ? '═══ 随机数（LCG · 周期 2^32）═══'
    : '═══ 随机数（xoshiro256++ · 周期 2^256−1）═══'
  lines.push(header, '')
  lines.push('  种子：' + (seedText === '' ? '（默认）' : seedText) + ' · 算法 ' + algorithm)

  const value: Record<string, unknown> = {
    seed: seedText,
    algorithm,
    period: algorithm === 'lcg' ? '2^32' : XOSHIRO_INFO.period,
    stateBytes: algorithm === 'lcg' ? 4 : XOSHIRO_INFO.stateBytes,
  }

  /** 序列模式。 */
  if (actors.length === 0 || Object.keys(traits).length === 0) {
    const values: Array<number | string> = []
    if (algorithm === 'lcg') {
      const state = createPrng(Number.parseInt(seedText === '' ? '0' : seedText, 10) || 0)
      for (let index = 0; index < count; index += 1) values.push(integer ? rollInt(state, min, max) : min + roll(state) * (max - min))
    } else {
      const state = createXoshiro(seedText)
      for (let index = 0; index < count; index += 1) values.push(integer ? xoshiroInt(state, min, max) : min + xoshiroFloat(state) * (max - min))
    }
    value.values = values
    value.count = values.length
    value.min = min
    value.max = max
    value.integer = integer
    lines.push('', '  ' + (integer ? '整数' : '浮点') + '序列（' + values.length + ' 个，[' + min + ', ' + max + ']）：')
    const shown = values.slice(0, 20).map((item) => typeof item === 'number' ? Number(item.toPrecision(8)) : item)
    lines.push('    ' + shown.join(', ') + (values.length > 20 ? ' …' : ''))
    lines.push('', '★ 同 seed 同结果；要不同世界就换 randomSeed。')
    return { result: lines.join('\n'), value, notice: '周期 ' + (value.period as string) + '：推演里不会循环。' }
  }

  /** 行为映射模式：每个实体一条子流（顺序无关）。 */
  if (algorithm === 'lcg') throw new CalcError('invalid_argument', '行为映射需要 xoshiro256++（默认算法）', 'LCG 只能取序列；去掉 algorithm:"lcg" 即可。')
  const traitNames = Object.keys(traits)
  for (const [name, spec] of Object.entries(traits)) {
    const hasChoices = Array.isArray(spec.choices) && spec.choices.length > 0
    if (!hasChoices) {
      const lo = Number.isFinite(spec.min ?? NaN) ? (spec.min as number) : 0
      const hi = Number.isFinite(spec.max ?? NaN) ? (spec.max as number) : 1
      if (hi < lo) throw new CalcError('invalid_argument', '特征 "' + name + '" 的 max 必须 ≥ min', '')
    }
  }
  const mapped: Record<string, Record<string, number | string>> = {}
  lines.push('', '  行为映射（' + actors.length + ' 个实体 × ' + traitNames.length + ' 个特征）：')
  for (const actor of actors) {
    const state: XoshiroState = xoshiroSubstream(seedText, actor)
    const row: Record<string, number | string> = {}
    for (const name of traitNames) {
      const spec = traits[name] as RandomTrait
      if (Array.isArray(spec.choices) && spec.choices.length > 0) {
        const index = Math.floor(xoshiroFloat(state) * spec.choices.length)
        row[name] = spec.choices[Math.min(spec.choices.length - 1, index)]
      } else {
        const lo = Number.isFinite(spec.min ?? NaN) ? (spec.min as number) : 0
        const hi = Number.isFinite(spec.max ?? NaN) ? (spec.max as number) : 1
        const raw = lo + xoshiroFloat(state) * (hi - lo)
        row[name] = Number(raw.toPrecision(6))
      }
    }
    mapped[actor] = row
    const cells = traitNames.map((name) => name + '=' + row[name]).join('，')
    lines.push('    ' + actor.padEnd(12) + cells)
  }
  value.actors = mapped
  value.traits = Object.fromEntries(traitNames.map((name) => [name, traits[name]]))
  lines.push('', '★ 每个实体的子流由 seed|实体名 派生——与排序无关，同一实体任何时候都得同一值。')
  return { result: lines.join('\n'), value, notice: '行为映射用子流（顺序无关）；周期 ' + (value.period as string) + '。' }
}
