/**
 * 推演档案：七张表持久化 + 版本记录。
 *
 * @module dsh-math-calculator/derivation-log
 * @description
 * 推演不是一次性的：作者会反复改参数、看结论怎么变。所以需要：
 *
 * 1. **七张表落盘**：项目卡、变更清单、接口卡、约束表、敏感性表、
 *    叙事锚点表、版本记录 —— 存进工作区，换工作区能看各自的历史；
 * 2. **每次跑留一版**：改了参数再跑，能对比「结论从允许变成禁止」这种变化；
 * 3. **待定项不丢**：没想清楚的问题显式留着，下次接着推。
 *
 * 为什么必须落盘而不是只返回：
 * 规格要求「每次迭代保留旧版结论」「不得追求一次闭合」。
 * 只在内存里算完就丢，等于每次从头开始，越推越乱。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { workspaceDirectory } from './workspace.js'
import type { PipelineResult } from './pipeline.js'
import type { AnchorSolution } from './back-solve.js'
import type { VersionEntry } from './derivation-stack.js'

/** 一版推演档案（对应规格的七张表）。 */
export interface DerivationArchive {
  /** 版本号，如 v1、v2。 */
  version: string
  /** 时间戳。 */
  at: string
  /** 项目卡（规格第 0 步）。 */
  projectCard: {
    type: string
    scope: string
    observer: string
    outOfScope: string[]
  }
  /** 变更清单（规格第 1 步）：改了哪些参数。 */
  changeList: Array<{
    parameter: string
    from: unknown
    to: unknown
    handling: string
  }>
  /** 接口卡快照（规格第 5 步）。 */
  interfaceCards: Array<{
    layer: string
    card: string
    value: number
    unit: string
    verdict: string
  }>
  /** 约束表：硬/软/叙事三条线。 */
  constraints: {
    hard: string[]
    soft: string[]
    narrative: string[]
  }
  /** 敏感性表。 */
  sensitivity: Array<{ parameter: string; relativeChange: number; verdict: string }>
  /** 叙事锚点表（逆推结果）。 */
  anchors: Array<{
    anchor: string
    wanted: number
    unit: string
    limits: Array<{ parameter: string; max?: number; reason: string }>
    conflicts: string[]
  }>
  /** 版本记录。 */
  versions: VersionEntry[]
  /** 待定项（不强行闭合）。 */
  pending: string[]
  /** 下轮任务。 */
  nextTasks: string[]
}

/** 档案文件路径。 */
function archiveFile(workspace: string): string {
  return join(workspaceDirectory(), workspace + '.derivation.json')
}

/** 读档案（不存在返回空档案）。 */
export function loadArchive(workspace: string): { versions: DerivationArchive[] } {
  const file = archiveFile(workspace)
  if (!existsSync(file)) return { versions: [] }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    if (Array.isArray(raw?.versions)) return { versions: raw.versions }
    return { versions: [] }
  } catch {
    // 损坏的档案当空处理，绝不让推演起不来
    return { versions: [] }
  }
}

/** 写档案（原子替换）。 */
function saveArchive(workspace: string, versions: DerivationArchive[]): void {
  const file = archiveFile(workspace)
  const dir = workspaceDirectory()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const temp = file + '.' + Date.now() + '.tmp'
  writeFileSync(temp, JSON.stringify({ workspace, versions }, null, 2), 'utf8')
  try {
    // rename 原子替换，避免写一半被读到
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('node:fs') as typeof import('node:fs')
    fs.renameSync(temp, file)
  } catch {
    writeFileSync(file, JSON.stringify({ workspace, versions }, null, 2), 'utf8')
  }
}

/**
 * 归档一版推演结果。
 *
 * @param workspace - 工作区名
 * @param pipeline - 正向链路结果
 * @param anchors - 逆推结果（可选）
 * @param changes - 本次改了哪些参数
 * @param pending - 待定项
 * @returns 归档后的版本号与档案
 */
export function archiveDerivation(
  workspace: string,
  pipeline: PipelineResult,
  anchors: AnchorSolution[] = [],
  changes: DerivationArchive['changeList'] = [],
  pending: string[] = [],
): { version: string; archive: DerivationArchive; total: number } {
  const { versions } = loadArchive(workspace)
  const version = 'v' + (versions.length + 1)

  // 接口卡快照：把链路每层的判定摊平成一张表
  const interfaceCards: DerivationArchive['interfaceCards'] = []
  for (const layer of pipeline.layers) {
    for (const item of layer.items) {
      interfaceCards.push({
        layer: layer.layer,
        card: item.card,
        value: item.value,
        unit: item.unit,
        verdict: item.verdict,
      })
    }
  }

  // 约束表：从失败项里分硬约束，通过项记为软约束
  const hard: string[] = []
  const soft: string[] = []
  for (const item of interfaceCards) {
    if (item.verdict === 'forbidden' || item.verdict === 'marginal') {
      hard.push(item.layer + ' ' + item.card + ' = ' + item.value + ' ' + item.unit)
    } else {
      soft.push(item.layer + ' ' + item.card)
    }
  }

  // 版本记录：这一版改了什么、结论怎么变
  const previous = versions.length > 0 ? versions[versions.length - 1] : null
  const previousVerdict = previous
    ? previous.interfaceCards.filter(function (c) { return c.verdict === 'forbidden' }).length
    : null
  const currentForbidden = interfaceCards.filter(function (c) { return c.verdict === 'forbidden' }).length
  const conclusionChange =
    previousVerdict === null
      ? '首版：' + (currentForbidden === 0 ? '无禁止项' : currentForbidden + ' 项禁止')
      : '禁止项 ' + previousVerdict + ' → ' + currentForbidden

  const versionEntry: VersionEntry = {
    version: version,
    changed: changes.map(function (item) { return item.parameter }),
    affectedInterfaces: hard.slice(0, 5),
    conclusionChange: conclusionChange,
    pending: pending,
    nextTasks: pending.length > 0 ? ['处理后：' + pending[0]] : [],
  }

  const archive: DerivationArchive = {
    version: version,
    at: new Date().toISOString(),
    projectCard: {
      type: 'regional',
      scope: workspace,
      observer: '人类标准（可改）',
      outOfScope: ['宇宙学尺度', '量子引力细节'],
    },
    changeList: changes,
    interfaceCards: interfaceCards,
    constraints: { hard: hard, soft: soft, narrative: anchors.map(function (a) { return a.label }) },
    sensitivity: [],
    anchors: anchors.map(function (a) {
      return {
        anchor: a.anchor,
        wanted: a.wanted,
        unit: a.unit,
        limits: a.limits.map(function (l) { return { parameter: l.parameter, max: l.max, reason: l.reason } }),
        conflicts: a.conflicts,
      }
    }),
    versions: previous ? previous.versions.concat([versionEntry]) : [versionEntry],
    pending: pending,
    nextTasks: pending.length > 0 ? ['处理后：' + pending[0]] : [],
  }

  const next = versions.concat([archive])
  saveArchive(workspace, next)
  return { version: version, archive: archive, total: next.length }
}

/**
 * 对比两版档案，给出差异。
 *
 * @param workspace - 工作区名
 * @param fromVersion - 起始版本（如 v1）
 * @param toVersion - 目标版本（如 v2）；省略则取最后一版
 * @returns 差异说明
 */
export function compareVersions(
  workspace: string,
  fromVersion: string,
  toVersion?: string,
): { ok: boolean; message: string; changes: string[] } {
  const { versions } = loadArchive(workspace)
  const from = versions.find(function (item) { return item.version === fromVersion })
  if (!from) return { ok: false, message: '找不到版本 ' + fromVersion, changes: [] }
  const to = toVersion
    ? versions.find(function (item) { return item.version === toVersion })
    : versions[versions.length - 1]
  if (!to) return { ok: false, message: '找不到版本 ' + (toVersion || '（最新）'), changes: [] }

  const changes: string[] = []
  const fromMap = new Map(from.interfaceCards.map(function (c) { return [c.layer + '/' + c.card, c] }))
  for (const card of to.interfaceCards) {
    const key = card.layer + '/' + card.card
    const before = fromMap.get(key)
    if (!before) {
      changes.push('新增：' + key + ' = ' + card.value + '（' + card.verdict + '）')
      continue
    }
    if (before.verdict !== card.verdict) {
      changes.push(key + '：' + before.verdict + ' → ' + card.verdict)
    } else if (Math.abs(before.value - card.value) > Math.abs(before.value) * 0.01) {
      changes.push(key + '：' + before.value.toPrecision(4) + ' → ' + card.value.toPrecision(4))
    }
  }
  for (const [key] of fromMap) {
    if (!to.interfaceCards.some(function (c) { return c.layer + '/' + c.card === key })) {
      changes.push('移除：' + key)
    }
  }

  return {
    ok: true,
    message: changes.length === 0 ? from.version + ' 与 ' + to.version + ' 没有差异' : from.version + ' → ' + to.version + ' 共 ' + changes.length + ' 处差异',
    changes: changes,
  }
}
