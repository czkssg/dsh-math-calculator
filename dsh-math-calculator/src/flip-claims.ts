/**
 * 内置「结论翻转」判据库。
 *
 * ## 为什么是预设判据而不是自由函数
 *
 * `flip.ts` 的 `checkFlip(evaluate, judge, ...)` 需要两个函数。工具层不能接受
 * 函数（AI 传不了闭包），所以这里把**作者常问的几种「能不能」**做成交给
 * 判据 id 选的内置项。
 *
 * 输入统一设计成**倍率**（相对地球/相对基线），这样作者不需要懂物理常数：
 *   输入 1.0 = 地球基线；1.5 = 比地球大 50%。
 *
 * ## 与 `sensitivity` 的分工
 *
 * | 子命令 | 问什么 | 输出 |
 * |---|---|---|
 * | `sensitivity` | 数值变了多少 | 相对变化率、是否放大 |
 * | `flip` | **能不能**变了没有 | 布尔是否翻转、余量多远 |
 *
 * 两者的差别是实质性的：数值变 1.8% 可能让「飞得出/飞不出」颠倒，
 * 也可能完全不影响结论。只有 `flip` 能回答后者。
 *
 * @module dsh-math-calculator/flip-claims
 */

import type { FlipReport } from './flip.js'

/** 一条内置判据。 */
export interface FlipClaim {
  /** 判据 id。 */
  id: string
  /** 中文名（会出现在结语里）。 */
  label: string
  /** 判据的表达式说明（给人看）。 */
  formula: string
  /** 由输入倍率算出判据值。 */
  evaluate: (input: number) => number
  /** 由判据值给出布尔结论。 */
  judge: (value: number) => boolean
}

/**
 * 地球基准值（与 constants-graph / world 保持一致的量级）。
 *
 * 只在本文件内用于把「倍率」换成物理量，不参与别处计算。
 */
const EARTH = {
  escapeVelocityKmS: 11.186,
  /** 化学火箭的 Δv 上限（km/s）。液氢液氧理论约 9.4，工程实现更低。 */
  chemicalDeltaVKmS: 9.4,
  /** 人的骨骼强度体重比容限：约能承受 3—4 倍地球重力。 */
  humanGravityLimit: 3.5,
  /** 碳基飞行生物的质量上限（kg），大约 50 kg 就飞不动了。 */
  flyingMassLimitKg: 50,
}

/**
 * 内置判据表。
 *
 * 每条都对应一个作者真会问的「能不能」。
 */
export const FLIP_CLAIMS: FlipClaim[] = [
  {
    id: 'rocket',
    label: '化学火箭能飞出这个星球',
    formula: '判据值 = 逃逸速度 × 输入倍率；成立条件 = 判据值 < 化学火箭 Δv 上限 ' +
      EARTH.chemicalDeltaVKmS + ' km/s',
    evaluate: function (input: number): number {
      return EARTH.escapeVelocityKmS * input
    },
    judge: function (value: number): boolean {
      return value < EARTH.chemicalDeltaVKmS
    },
  },
  {
    id: 'human',
    label: '人能在这个重力下站立',
    formula: '判据值 = 地球重力 × 输入倍率；成立条件 = 判据值 < 人体耐受上限 ' +
      EARTH.humanGravityLimit + ' g',
    evaluate: function (input: number): number {
      return input
    },
    judge: function (value: number): boolean {
      return value < EARTH.humanGravityLimit
    },
  },
  {
    id: 'flight',
    label: '碳基生物能靠肌肉飞行',
    formula: '判据值 = 体重（kg），随重力线性增长；成立条件 = 判据值 < 飞行质量上限 ' +
      EARTH.flyingMassLimitKg + ' kg',
    evaluate: function (input: number): number {
      // 一个 10 kg 的飞行生物在地球勉强能飞；重力放大则等效体重等比放大
      return 10 * input
    },
    judge: function (value: number): boolean {
      return value < EARTH.flyingMassLimitKg
    },
  },
  {
    id: 'escape_keeps_atmosphere',
    label: '这个星球能留住大气',
    formula: '判据值 = 逃逸速度 × 输入倍率；成立条件 = 判据值 > 保留大气的经验下限 6 km/s',
    evaluate: function (input: number): number {
      return EARTH.escapeVelocityKmS * input
    },
    judge: function (value: number): boolean {
      return value > 6
    },
  },
]

/** 判定结果与判据的组合。 */
export interface FlipOutcome {
  /** 用的哪条判据。 */
  claim: FlipClaim
  /** 翻转报告。 */
  report: FlipReport
}
