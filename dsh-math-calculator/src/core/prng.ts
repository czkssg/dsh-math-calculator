/**
 * 确定性 PRNG（LCG）——原料来自 Project_Psychohistory 的协议。
 *
 * 原实现（Psychohistory_Agent.md）：
 * ```
 * LCG: seed = (len(history_log) * pop) + year
 *      roll = ((seed*1664525 + 1013904223) mod 2^32) / 2^32
 * ```
 * 它解决的问题：**同状态同结果**——推演可复现，不靠记忆。
 *
 * ## 二次加工（不直接抄）
 *
 * - 原版把 seed 公式写死在 prompt 里；这里做成**可配置的种子函数**；
 * - 补 xorshift 备选（周期更长、低位质量更好），LCG 作默认；
 * - 输出统一 0–1 浮点 + 整数区间，供各模型调用。
 *
 * @module dsh-math-calculator/core/prng
 */

/** 2^32。 */
const MOD = 4294967296

/** LCG 参数（Numerical Recipes）。 */
const MULT = 1664525
const INC = 1013904223

/** PRNG 状态。 */
export interface PrngState {
  seed: number
}

/**
 * 由若干整数分量构造种子（避免直接相加碰撞）。
 *
 * @param parts - 任意整数
 * @returns 32 位种子
 */
export function seedFrom(...parts: number[]): number {
  let hash = 2166136261
  for (const part of parts) {
    hash ^= Math.floor(part) & 0xffffffff
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * 单步 LCG。
 *
 * @param state - 状态
 * @returns 新状态（0..2^32-1）
 */
export function nextLcg(state: PrngState): number {
  state.seed = (state.seed * MULT + INC) % MOD
  return state.seed
}

/**
 * 取 0–1 浮点。
 *
 * @param state - 状态
 * @returns [0, 1)
 */
export function roll(state: PrngState): number {
  return nextLcg(state) / MOD
}

/**
 * 取整数区间 [min, max]。
 *
 * @param state - 状态
 * @param min - 下界（含）
 * @param max - 上界（含）
 * @returns 整数
 */
export function rollInt(state: PrngState, min: number, max: number): number {
  if (max < min) throw new Error('rollInt: max 必须 ≥ min')
  return min + Math.floor(roll(state) * (max - min + 1))
}

/**
 * 创建 PRNG。
 *
 * @param seed - 种子
 * @returns 状态
 */
export function createPrng(seed: number): PrngState {
  return { seed: seed >>> 0 }
}
