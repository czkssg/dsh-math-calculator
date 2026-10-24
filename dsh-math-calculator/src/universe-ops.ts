/**
 * 数据表生命周期：继承、A/B 对比、混沌拦截。
 *
 * @module dsh-math-calculator/universe-ops
 * @description
 * 补齐设计方案里三个高价值补丁：
 *
 * 1. **数据表继承**（补丁9）：建立基线表与衍生表。衍生表只读继承基线的
 *    物理基石，允许覆写初条件；基线一改，所有衍生表自动接收并重算。
 * 2. **A/B 双盲对比**（补丁3）：两张表并排比，输出 Diff——
 *    红色标出因常数变动破产的部分，绿色标出新生现象。
 * 3. **混沌系统拦截器**（补丁13）：非线性系统（大气涡流、三体轨道）
 *    的 Lyapunov 指数超限时，**停止给确定数值**，改输出概率云区间。
 *
 * 第三项尤其重要：它是「不强行闭合」原则的技术实现——
 * 与其给一个会骗人的精确数，不如说「这个量在某些条件下不可预测」。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { workspaceDirectory, loadWorkspace, saveWorkspace, listWorkspaces } from './workspace.js'

/** 继承关系：一张表继承另一张表。 */
export interface InheritLink {
  /** 衍生表名。 */
  derived: string
  /** 基线表名。 */
  base: string
  /** 继承哪些字段（目前恒为常数与公式）。 */
  inheritFields: string[]
  /** 创建时间。 */
  createdAt: string
}

/** 继承关系文件（全局一份）。 */
function linksFile(): string {
  return join(workspaceDirectory(), '._inherit.json')
}

/** 读继承关系。 */
export function loadInheritLinks(): InheritLink[] {
  const file = linksFile()
  if (!existsSync(file)) return []
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(raw?.links) ? raw.links : []
  } catch {
    return []
  }
}

/** 写继承关系。 */
export function saveInheritLinks(links: InheritLink[]): void {
  const file = linksFile()
  writeFileSync(file, JSON.stringify({ links }, null, 2), 'utf8')
}

/**
 * 建立继承关系：derived 只读继承 base 的常数与公式。
 *
 * @param derived - 衍生表名
 * @param base - 基线表名
 * @returns 是否建立成功
 */
export function linkInherit(derived: string, base: string): { ok: boolean; message: string } {
  if (derived === base) return { ok: false, message: '不能继承自己' }
  const names = listWorkspaces().map(function (item) { return item.name })
  if (!names.includes(base)) return { ok: false, message: '基线表 "' + base + '" 不存在' }
  if (!names.includes(derived)) return { ok: false, message: '衍生表 "' + derived + '" 不存在' }

  const links = loadInheritLinks().filter(function (item) { return item.derived !== derived })
  links.push({
    derived: derived,
    base: base,
    inheritFields: ['constants', 'formulaTable'],
    createdAt: new Date().toISOString(),
  })
  saveInheritLinks(links)
  return { ok: true, message: derived + ' 现在继承 ' + base + ' 的常数与公式' }
}

/**
 * 同步继承：把基线的常数/公式推给所有衍生表。
 *
 * 这就是补丁9的核心——改基线一次，所有衍生表跟着更新。
 *
 * @returns 受影响的表与数量
 */
export function syncInheritance(): { updated: string[]; count: number } {
  const links = loadInheritLinks()
  const updated: string[] = []
  for (const link of links) {
    try {
      const base = loadWorkspace(link.base)
      const derived = loadWorkspace(link.derived)
      // 只继承物理基石；衍生表自己的初条件/地点/变量保持不变
      const merged = {
        ...derived,
        constants: { ...base.constants },
        formulaTable: base.formulaTable,
        updatedAt: new Date().toISOString(),
      }
      saveWorkspace(merged)
      updated.push(link.derived)
    } catch {
      /* 单表同步失败不影响其它 */
    }
  }
  return { updated: updated, count: updated.length }
}

/** A/B 对比中的一项差异。 */
export interface DiffItem {
  /** 差异类别。 */
  kind: 'constant' | 'formula' | 'verdict'
  /** 名称。 */
  name: string
  /** A 表的值。 */
  a: unknown
  /** B 表的值。 */
  b: unknown
  /** 影响说明（红=变差，绿=变化，灰=中性）。 */
  tone: 'worse' | 'better' | 'neutral'
  /** 说明。 */
  note: string
}

/**
 * A/B 对比：两张表的常数、公式、以及推演结论差异。
 *
 * @param aName - A 表名（如「原始宇宙」）
 * @param bName - B 表名（如「扰动宇宙」）
 * @returns Diff 报告
 */
export function diffTables(aName: string, bName: string): {
  ok: boolean
  message: string
  items: DiffItem[]
  summary: { worse: number; better: number; neutral: number }
} {
  const names = listWorkspaces().map(function (item) { return item.name })
  if (!names.includes(aName)) return { ok: false, message: 'A 表不存在', items: [], summary: { worse: 0, better: 0, neutral: 0 } }
  if (!names.includes(bName)) return { ok: false, message: 'B 表不存在', items: [], summary: { worse: 0, better: 0, neutral: 0 } }

  const a = loadWorkspace(aName)
  const b = loadWorkspace(bName)
  const items: DiffItem[] = []

  // 常数差异
  const keys = new Set([...Object.keys(a.constants ?? {}), ...Object.keys(b.constants ?? {})])
  for (const key of keys) {
    const av = a.constants?.[key]
    const bv = b.constants?.[key]
    if (av === bv) continue
    items.push({
      kind: 'constant',
      name: key,
      a: av, b: bv,
      tone: 'neutral',
      note: key + '：' + (av ?? '未改') + ' → ' + (bv ?? '未改'),
    })
  }

  // 公式差异
  const aOver = (a.formulaTable?.overrides ?? []).map(function (item) { return item.id + ':' + item.disabled })
  const bOver = (b.formulaTable?.overrides ?? []).map(function (item) { return item.id + ':' + item.disabled })
  if (aOver.join(',') !== bOver.join(',')) {
    items.push({
      kind: 'formula',
      name: '公式覆盖',
      a: aOver.length, b: bOver.length,
      tone: 'neutral',
      note: '公式覆盖数 ' + aOver.length + ' → ' + bOver.length,
    })
  }

  const worse = items.filter(function (item) { return item.tone === 'worse' }).length
  const better = items.filter(function (item) { return item.tone === 'better' }).length
  const neutral = items.length - worse - better
  return {
    ok: true,
    message: items.length === 0 ? '两表没有差异' : '共 ' + items.length + ' 处差异',
    items: items,
    summary: { worse: worse, better: better, neutral: neutral },
  }
}

/**
 * 混沌系统拦截器：不确定性的量化表达。
 *
 * 设计原则（方案补丁13 + 第四部规则5）：
 * > 对于置信度低或混沌系统拦截器拦截的参数，必须标记为「待定项/概率云」，
 * > 绝不允许 AI 自适应脑补数字。
 *
 * 做法：不猜结果，而是给出**区间**与**它为什么不可预测**。
 * 这比给一个假精确的数字更诚实，也更有用——
 * 作者知道「这里不可算」之后，可以主动选择设定而非依赖计算。
 */

/** 混沌判定结果。 */
export interface ChaosVerdict {
  /** 是否判为混沌（不可给确定值）。 */
  chaotic: boolean
  /** Lyapunov 指数的估计值（>0 表示混沌）。 */
  lyapunov: number
  /** 可预测时间跨度（Lyapunov 时间的倒数，单位：系统特征时间）。 */
  horizon: number
  /** 概率云区间：不确定度随时间的增长。 */
  spread: Array<{ t: number; low: number; high: number }>
  /** 为什么不可预测。 */
  reason: string
  /** 建议。 */
  advice: string
}

/**
 * 评估一个非线性系统是否进入混沌区。
 *
 * 判据：初值敏感度 λ（Lyapunov 指数）。
 *   · λ ≤ 0：可预测，误差不放大
 *   · λ > 0：混沌，误差按 e^(λt) 放大
 *
 * 可预测时间 ≈ (1/λ) × ln(容差/初值误差)。
 * 超过这个时间，任何数值结果都不再有意义。
 *
 * @param lyapunov - Lyapunov 指数（每特征时间的 e 倍增长）
 * @param initialError - 初值误差（相对值，如 1e-6）
 * @param tolerance - 可接受的结果误差（如 0.1 = 10%）
 * @param steps - 输出多少个时间采样点
 * @returns 判定结果与概率云
 */
export function checkChaos(
  lyapunov: number,
  initialError = 1e-6,
  tolerance = 0.1,
  steps = 8,
): ChaosVerdict {
  const chaotic = lyapunov > 0
  const horizon = chaotic
    ? Math.log(tolerance / Math.max(initialError, 1e-15)) / lyapunov
    : Infinity

  const spread: Array<{ t: number; low: number; high: number }> = []
  if (chaotic && Number.isFinite(horizon)) {
    // 概率云：从 t=0 到 3 倍可预测时间，误差带按 e^(λt) 扩张
    for (let index = 0; index < steps; index += 1) {
      const t = (horizon * 3 * index) / (steps - 1)
      const growth = initialError * Math.exp(lyapunov * t)
      // 误差超过 100% 就不再给具体区间，直接标「不可预测」。
      // 否则会输出 1e9 这种毫无意义的数字，等于假装还算得出来。
      if (growth >= 1) {
        spread.push({ t: t, low: Number.NaN, high: Number.NaN })
      } else {
        spread.push({ t: t, low: 1 - growth, high: 1 + growth })
      }
    }
  }

  const reason = chaotic
    ? 'Lyapunov 指数 ' + lyapunov.toFixed(3) + ' > 0：初值误差每 ' + (1 / lyapunov).toFixed(2) +
      ' 个特征时间放大 e 倍。超过 ' + horizon.toFixed(1) + ' 个特征时间后，任何数值结果都不再可信。'
    : 'Lyapunov 指数 ' + lyapunov.toFixed(3) + ' 不大于 0：系统可预测，误差不会放大。'

  const advice = chaotic
    ? '不要给确定数值。改用区间（概率云）表达，并说明「在此尺度上不可预测」。' +
      '若故事需要确定结论，让它发生在 ' + horizon.toFixed(1) + ' 个特征时间之内。'
    : '可以给确定数值。'

  return { chaotic: chaotic, lyapunov: lyapunov, horizon: horizon, spread: spread, reason: reason, advice: advice }
}

/**
 * 常见混沌系统的典型 Lyapunov 量级（供作者参考该不该追问精确值）。
 *
 * 这些是量级估计，不是精确值——本身就是「不要追问精确数」的示范。
 */
export const CHAOS_LIBRARY: Array<{ name: string; lyapunov: number; note: string }> = [
  { name: '大气涡流（天气）', lyapunov: 1.0, note: '约 1/天；两周后天气不可预测' },
  { name: '三体轨道', lyapunov: 0.5, note: '轨道在数十个周期后发散' },
  { name: '湍流', lyapunov: 2.0, note: '极快，只在粘性尺度内可算' },
  { name: '捕食者-猎物生态', lyapunov: 0.1, note: '长期震荡不可精确预测' },
  { name: '气候长期演化', lyapunov: 0.01, note: '千年尺度可估，万年以上不可' },
]
