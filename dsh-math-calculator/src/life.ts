/**
 * 化学窗口与生物出现的硬否决（ADR-0001 / 用户定义的第 2、3 项）。
 *
 * 设计原则（用户明确要求）：
 *   **只判断"绝对不行"的部分，剩下的交给叙事/AI 判断。**
 *   所以这里分三档：
 *     hard    物理上绝对排除（没有液态溶剂、分子不可能稳定……）
 *     strong  强约束（需要作者给出解释，但不能说绝对不可能）
 *     open    本模型不下结论，明确交给作者
 *
 * 第 2 项「化学窗口」回答的是：改 α 之后，碳基化学是否还成立。
 *   注意区分两件事：
 *     化学（分子能否稳定存在）  —— 由 α 决定，本模块算
 *     核合成（碳元素能否被造出来）—— 由 α_s 与 Hoyle 共振决定，本模型不覆盖
 *
 * @module dsh-math-calculator/life
 */

import { OUR_UNIVERSE } from './constants-core.js'

/** 水的三相点压力 Pa：低于它液态水不可能存在。 */
const WATER_TRIPLE_POINT_PA = 611.0
/** 水的冰点 K。 */
const WATER_FREEZING_K = 273.15
/** 代表性共价键能量 eV（C–C 单键约 3.6 eV，取 4 作量级代表）。 */
const COVALENT_BOND_EV = 4.0
/** 玻尔兹曼常数 eV/K。 */
const KB_EV = 8.617333262e-5

/** 化学窗口结论。 */
export interface ChemistryWindow {
  alphaRatio: number
  /** 代表性共价键能量 eV（∝ α²）。 */
  bondEnergyEv: number
  /** 表面温度对应的热能 eV。 */
  thermalEv: number
  /** 键能 / 热能：化学是否有"稳定但不冻死"的余地。 */
  stability: number
  verdict: 'bonds-too-weak' | 'window' | 'bonds-too-strong'
  confidence: 'order-of-magnitude'
  domain: string
  note: string
}

/**
 * 化学窗口：α 改变后，分子在给定温度下还能不能稳定存在。
 *
 * 判据（量级）：
 *   stability = E_bond/(k_B T)
 *   - α < 0.35 α₀：所有共价键在表面温度下不足 ~10 kT → 分子热散架，**硬排除**
 *   - α > 3 α₀：键能过强，重排（反应）需要极端条件 → 强约束
 *   - 其间：化学窗口内
 *
 * @param alpha - 精细结构常数。
 * @param tempK - 表面温度 K（默认 300）。
 */
export function chemistryWindow(alpha: number, tempK = 300): ChemistryWindow {
  const ratio = alpha / OUR_UNIVERSE.alpha
  const bondEnergyEv = COVALENT_BOND_EV * ratio ** 2
  const thermalEv = KB_EV * Math.max(1, tempK)
  const stability = bondEnergyEv / thermalEv

  let verdict: ChemistryWindow['verdict']
  let note: string
  if (ratio < 0.35) {
    verdict = 'bonds-too-weak'
    note = `α 只有现实的 ${(ratio * 100).toFixed(0)}%：共价键仅 ${bondEnergyEv.toFixed(3)} eV（${stability.toFixed(1)} kT）——` +
      '在表面温度下会被热运动直接扯散，复杂分子无法存在。'
  } else if (ratio > 3) {
    verdict = 'bonds-too-strong'
    note = `α 是现实的 ${ratio.toFixed(2)} 倍：共价键达 ${bondEnergyEv.toFixed(1)} eV（${stability.toFixed(0)} kT）——` +
      '分子极其稳定，化学重排需要极端温度或催化条件，代谢会非常困难（但高温化学不排除）。'
  } else {
    verdict = 'window'
    note = `α 为现实的 ${ratio.toFixed(2)} 倍：共价键 ${bondEnergyEv.toFixed(2)} eV（约 ${stability.toFixed(0)} kT）——处于化学窗口内。`
  }

  return {
    alphaRatio: ratio,
    bondEnergyEv,
    thermalEv,
    stability,
    verdict,
    confidence: 'order-of-magnitude',
    domain: 'α 偏离现实 < 3 倍；只判断"能不能有稳定分子"，不判断具体分子种类',
    note,
  }
}

/** 一条生命约束。 */
export interface LifeBlocker {
  id: string
  kind: 'hard' | 'strong'
  reason: string
  evidence: string
}

/** 生命闸门结论。 */
export interface LifeGate {
  solvent: 'water'
  blockers: LifeBlocker[]
  /** excluded = 有硬否决；constrained = 只有强约束；open = 没有硬约束。 */
  verdict: 'excluded' | 'constrained' | 'open'
  /** 明确交给人/AI 判断的维度。 */
  openQuestions: string[]
  note: string
}

/** 生命闸门输入（都来自 world 的计算结果）。 */
export interface LifeInput {
  surfaceMeanK: number
  /** 最热纬度带暖季温度 K。 */
  warmestBandK: number
  /** 最冷纬度带冷季温度 K。 */
  coldestBandK: number
  pressurePa: number
  /** 当前气压下的沸点 K。 */
  boilingPointK: number
  stellarLifetimeGyr: number
  /** 恒星紫外能量占比。 */
  uvFraction: number
  tidallyLocked: boolean
}

/**
 * 生命出现的硬否决闸门。
 *
 * 只做三件"绝对不行"的判断（水溶剂前提）：
 *   1. 气压低于水的三相点 → 液态水不存在；
 *   2. 全星球最热处仍低于冰点 → 没有液态水；
 *   3. 全星球最冷处已高于沸点 → 没有液态水。
 * 再加两条**强约束**（不绝对）：化学窗口失效、恒星寿命过短。
 *
 * 其余一律进 openQuestions —— 交给作者/AI。
 *
 * @param input - 由 world 结果汇总的观测输入。
 * @param alpha - 精细结构常数。
 */
export function assessLife(input: LifeInput, alpha: number): LifeGate {
  const blockers: LifeBlocker[] = []
  const chem = chemistryWindow(alpha, input.surfaceMeanK)

  // ── 硬否决：液态水（地球式生命的前提）──
  if (input.pressurePa < WATER_TRIPLE_POINT_PA) {
    blockers.push({
      id: 'below-triple-point',
      kind: 'hard',
      reason: '气压低于水的三相点，液态水不可能存在',
      evidence: `气压 ${(input.pressurePa / 101325).toFixed(4)} atm < 0.006 atm`,
    })
  }
  if (input.warmestBandK < WATER_FREEZING_K) {
    blockers.push({
      id: 'always-frozen',
      kind: 'hard',
      reason: '全星球最热处仍低于冰点，没有液态水',
      evidence: `最热纬度带暖季 ${(input.warmestBandK - 273.15).toFixed(1)}°C`,
    })
  }
  if (input.coldestBandK > input.boilingPointK) {
    blockers.push({
      id: 'always-boiling',
      kind: 'hard',
      reason: '全星球最冷处已高于沸点，水只能以蒸汽存在',
      evidence: `最冷纬度带冷季 ${(input.coldestBandK - 273.15).toFixed(1)}°C > 沸点 ${(input.boilingPointK - 273.15).toFixed(1)}°C`,
    })
  }

  // ── 强约束（不绝对，但需要作者解释）──
  if (chem.verdict === 'bonds-too-weak') {
    blockers.push({
      id: 'chemistry-collapsed',
      kind: 'hard',
      reason: '化学窗口失效：共价键在表面温度下无法维持',
      evidence: chem.note,
    })
  } else if (chem.verdict === 'bonds-too-strong') {
    blockers.push({
      id: 'chemistry-frozen',
      kind: 'strong',
      reason: '共价键过强，化学重排与代谢困难',
      evidence: chem.note,
    })
  }

  if (input.stellarLifetimeGyr < 0.5) {
    blockers.push({
      id: 'star-too-short-lived',
      kind: 'strong',
      reason: '恒星主序寿命过短，来不及演化出复杂生命',
      evidence: `主序寿命 ${(input.stellarLifetimeGyr * 1000).toFixed(0)} Myr（地球用了约 4000 Myr）`,
    })
  }

  if (input.tidallyLocked && input.pressurePa < 0.1 * 101325) {
    blockers.push({
      id: 'locked-thin-atmosphere',
      kind: 'strong',
      reason: '潮汐锁定且大气稀薄：夜面会冻结，热量难以全球输运',
      evidence: '潮汐锁定 + 气压 < 0.1 atm',
    })
  }

  if (input.uvFraction > 0.2 && input.pressurePa < 0.5 * 101325) {
    blockers.push({
      id: 'uv-unshielded',
      kind: 'strong',
      reason: '强紫外且大气稀薄：地表辐射剂量可能致命（表层生命）',
      evidence: `紫外占 ${(input.uvFraction * 100).toFixed(0)}% + 气压 < 0.5 atm`,
    })
  }

  const hard = blockers.filter((b) => b.kind === 'hard')
  const verdict: LifeGate['verdict'] = hard.length > 0 ? 'excluded' : blockers.length > 0 ? 'constrained' : 'open'

  return {
    solvent: 'water',
    blockers,
    verdict,
    openQuestions: [
      '是否有板块运动、磁场与大气演化（本模型不推导）',
      '是否出现细胞、多细胞与有性繁殖（演化不是物理）',
      '是否可能使用非水溶剂（氨、甲烷等；本闸门只按水判定）',
      '智慧与文明是否出现（纯叙事决定）',
    ],
    note:
      verdict === 'excluded'
        ? '存在硬否决项：按水溶剂生命判定为不可能。若要写非水溶剂生命，需要作者显式推翻这条前提。'
        : verdict === 'constrained'
          ? '没有硬否决，但有强约束：生命可以写，但需要给出解释。'
          : '没有发现硬否决：剩余问题交给作者与叙事判断。',
  }
}
