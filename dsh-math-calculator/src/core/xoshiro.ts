/**
 * xoshiro256++（周期 2^256−1）——长周期、可复现的随机数。
 *
 * ## 为什么是它（选型记录见 docs/推演选型.md）
 *
 * | 方案 | 周期 | 评价 |
 * |---|---|---|
 * | 现有 LCG | 2^32 | 太短，低位质量差；只保留兼容 |
 * | seedrandom（alea） | 约 2^72 | 成熟，但周期仍短于 2^128 |
 * | mersenne-twister | 2^19937−1 | 周期极长，但状态 2.5KB、JS 实现偏慢 |
 * | **xoshiro256++** | **2^256−1** | 状态 32B、快、通过 BigCrush；算法公有领域 |
 *
 * 用途：世界观推演的**行为映射**——人物/城市/事件的倾向值必须
 * ① 同种子可复现，② 周期长到不会在推演中循环，③ 分布均匀。
 *
 * ## 播种
 *
 * 用 SHA-256(seed 文本) 取 32 字节 → 4×64 位状态；
 * 空种子取固定字符串 `dsh-default-seed`，保证「不传种子也有确定结果」。
 *
 * @module dsh-math-calculator/core/xoshiro
 */

import { createHash } from 'node:crypto'

/** 64 位掩码。 */
const MASK = (1n << 64n) - 1n

/** xoshiro256++ 状态（4 × 64 位）。 */
export interface XoshiroState {
  s: [bigint, bigint, bigint, bigint]
  /** 原始种子文本（回显用）。 */
  seedText: string
}

/** 生成器信息。 */
export const XOSHIRO_INFO = {
  algorithm: 'xoshiro256++',
  period: '2^256−1（约 1.16e77 个数）',
  stateBytes: 32,
  seed: 'SHA-256(seed 文本) → 4×64 位',
} as const

/**
 * 用 SHA-256 把种子文本散列成 4×64 位状态。
 *
 * @param seedText - 种子文本（数字会被转成字符串）
 * @returns 状态
 */
export function createXoshiro(seedText: string | number = ''): XoshiroState {
  const text = seedText === '' ? 'dsh-default-seed' : String(seedText)
  const digest = createHash('sha256').update(text, 'utf8').digest()
  const word = (offset: number): bigint => {
    let value = 0n
    for (let index = 0; index < 8; index += 1) value = (value << 8n) | BigInt(digest[offset + index] ?? 0)
    return value
  }
  const state: [bigint, bigint, bigint, bigint] = [word(0), word(8), word(16), word(24)]
  /** 全零状态会让 xoshiro 退化；SHA-256 极不可能，但仍兜底。 */
  if (state.every((item) => item === 0n)) state[0] = 1n
  return { s: state, seedText: text }
}

/** 64 位循环左移。 */
function rotl(value: bigint, shift: number): bigint {
  return ((value << BigInt(shift)) | (value >> BigInt(64 - shift))) & MASK
}

/**
 * 取下一个 64 位无符号整数。
 *
 * @param state - 状态（原地推进）
 * @returns 0..2^64−1
 */
export function xoshiroNext(state: XoshiroState): bigint {
  const s = state.s
  const result = (rotl((s[0] + s[3]) & MASK, 23) + s[0]) & MASK
  const t = (s[1] << 17n) & MASK
  s[2] = (s[2] ^ s[0]) & MASK
  s[3] = (s[3] ^ s[1]) & MASK
  s[1] = (s[1] ^ s[2]) & MASK
  s[0] = (s[0] ^ s[3]) & MASK
  s[2] = (s[2] ^ t) & MASK
  s[3] = rotl(s[3], 45)
  return result
}

/**
 * 取 [0, 1) 浮点（53 位精度）。
 *
 * @param state - 状态
 * @returns [0, 1)
 */
export function xoshiroFloat(state: XoshiroState): number {
  return Number(xoshiroNext(state) >> 11n) / 9007199254740992
}

/**
 * 取整数区间 [min, max]。
 *
 * @param state - 状态
 * @param min - 下界（含）
 * @param max - 上界（含）
 * @returns 整数
 */
export function xoshiroInt(state: XoshiroState, min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max))
  const hi = Math.floor(Math.max(min, max))
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error('xoshiroInt: 区间必须是有限数')
  return lo + Math.floor(xoshiroFloat(state) * (hi - lo + 1))
}

/**
 * 为某个实体派生独立子流（与实体顺序无关）。
 *
 * @param seedText - 世界种子
 * @param entity - 实体名
 * @returns 子流状态
 */
export function xoshiroSubstream(seedText: string | number, entity: string): XoshiroState {
  return createXoshiro(String(seedText) + '|' + entity)
}
