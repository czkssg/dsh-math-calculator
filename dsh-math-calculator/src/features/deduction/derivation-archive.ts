/**
 * 推演档案：版本记录、历史与对比（`archive` / `history` / `compare` / `diff`）。
 *
 * ## 为什么建档
 *
 * 设定会反复改。没有档案时，作者只能靠「我记得前一版是怎样」——
 * 而长项目里这种记忆必然失真。建档把每版的物理底色与判定固定下来，
 * 之后能回答「这一版比上一版变了什么」。
 *
 * ## 存什么（与老实现的差异）
 *
 * 老实现存七张表（项目卡/变更清单/接口卡/约束表/敏感性/锚点/版本记录）。
 * v3 存**可核对的快照**：世界参数 + 物理底色 + 判定 + 技术树统计。
 * 这够回答「变了什么」，而七张表里多数是模板文字，重造没有信息增量。
 *
 * @module dsh-math-calculator/features/deduction/derivation-archive
 */

import { CalcError } from '../../core/errors.js'
import { generateWorld, type WorldDeps } from './world.js'
import { judgeDead } from './dead-universe.js'
import { runCivilization } from './civilization.js'

/** 一版档案。 */
export interface ArchiveVersion {
  version: string
  at: string
  /** 世界参数（用于回放与对比）。 */
  world: Record<string, unknown>
  /** 物理底色。 */
  physical: {
    gravityEarth: number
    dayHours: number
    meanTempC: number
    pressureAtm: number
    escapeKms: number
  }
  /** 判定。 */
  verdict: {
    deadLevel: string
    lifeGate: string
    checks: number
  }
  /** 技术树统计。 */
  tech: { open: number; conditional: number; locked: number }
  /** 作者写的备注。 */
  note: string
}

/** 从世界参数生成一版快照。 */
export function snapshotOf(world: Record<string, unknown>, deps: WorldDeps = {}): Omit<ArchiveVersion, 'version' | 'at'> {
  const profile = generateWorld(world as never, deps)
  const dead = judgeDead(profile as unknown as Record<string, unknown>)
  const civ = runCivilization(world)
  return {
    world: { ...world },
    physical: {
      gravityEarth: profile.planet.surfaceGravityEarth,
      dayHours: profile.planet.dayHours,
      meanTempC: profile.temperature.surfaceMeanC,
      pressureAtm: profile.atmosphere.pressureAtm,
      escapeKms: profile.planet.escapeVelocity / 1000,
    },
    verdict: { deadLevel: dead.level, lifeGate: profile.life.gate.verdict, checks: profile.checks.length },
    tech: { open: civ.summary.open, conditional: civ.summary.conditional, locked: civ.summary.locked },
    note: '',
  }
}

/**
 * 归档一版。
 *
 * @param versions - 现有版本
 * @param world - 世界参数
 * @param deps - 注入数据
 * @param note - 备注
 * @param now - 时间戳
 * @returns 新版本与更新后的数组
 */
export function archiveVersion(
  versions: ArchiveVersion[],
  world: Record<string, unknown>,
  deps: WorldDeps = {},
  note = '',
  now = new Date().toISOString(),
): { version: ArchiveVersion; versions: ArchiveVersion[] } {
  const snapshot = snapshotOf(world, deps)
  const next = 'v' + (versions.length + 1)
  const version: ArchiveVersion = { ...snapshot, version: next, at: now, note }
  return { version, versions: [...versions, version] }
}

/** 一次对比中的差异。 */
export interface ArchiveDiffItem {
  field: string
  a: unknown
  b: unknown
  tone: 'worse' | 'better' | 'neutral'
  note: string
}

/**
 * 对比两版。
 *
 * @param versions - 档案
 * @param from - 起始版本号（v1）
 * @param to - 目标版本号（缺省最后一版）
 * @returns 差异清单
 */
export function compareVersions(versions: ArchiveVersion[], from: string, to?: string): { message: string; items: ArchiveDiffItem[]; ok: boolean } {
  const versionA = versions.find((item) => item.version === from)
  if (!versionA) return { ok: false, message: '找不到版本 ' + from + '（已有：' + versions.map((item) => item.version).join('、') + '）', items: [] }
  const versionB = to !== undefined ? versions.find((item) => item.version === to) : versions[versions.length - 1]
  if (!versionB) return { ok: false, message: '找不到版本 ' + String(to), items: [] }
  if (versionA.version === versionB.version) return { ok: false, message: '两个版本相同（' + versionA.version + '），没有可比的差异', items: [] }

  const items: ArchiveDiffItem[] = []
  const push = (field: string, a: unknown, b: unknown, tone: ArchiveDiffItem['tone'], note: string): void => {
    if (JSON.stringify(a) !== JSON.stringify(b)) items.push({ field, a, b, tone, note })
  }
  push('重力（地球倍数）', versionA.physical.gravityEarth, versionB.physical.gravityEarth, 'neutral', '重力变化会影响建筑/生物上限')
  push('一天时长', versionA.physical.dayHours, versionB.physical.dayHours, 'neutral', '')
  push('均温 °C', versionA.physical.meanTempC, versionB.physical.meanTempC, versionB.physical.meanTempC < versionA.physical.meanTempC ? 'worse' : 'better', '')
  push('气压 atm', versionA.physical.pressureAtm, versionB.physical.pressureAtm, 'neutral', '')
  push('逃逸速度 km/s', versionA.physical.escapeKms, versionB.physical.escapeKms, 'neutral', '')
  push('死寂等级', versionA.verdict.deadLevel, versionB.verdict.deadLevel, versionB.verdict.deadLevel === 'alive' ? 'better' : 'worse', '')
  push('生命闸门', versionA.verdict.lifeGate, versionB.verdict.lifeGate, 'neutral', '')
  push('技术开放数', versionA.tech.open, versionB.tech.open, versionB.tech.open > versionA.tech.open ? 'better' : 'worse', '')
  push('技术锁死数', versionA.tech.locked, versionB.tech.locked, versionB.tech.locked < versionA.tech.locked ? 'better' : 'worse', '')

  const message =
    items.length === 0
      ? '两版在记录的量上没有差异（' + versionA.version + ' vs ' + versionB.version + '）'
      : '对比 ' + versionA.version + ' → ' + versionB.version + '：' + items.length + ' 处差异'
  return { ok: true, message, items }
}

/**
 * 渲染档案历史。
 *
 * @param versions - 档案
 * @returns 可读文本
 */
export function renderHistory(versions: ArchiveVersion[]): string {
  const lines: string[] = ['═══ 推演档案 ═══', '']
  if (versions.length === 0) {
    lines.push('  （还没有归档过）')
    lines.push('用 derivation="archive" 把当前世界参数存成一版。')
    return lines.join('\n')
  }
  lines.push('  版本   时间                  重力   均温    死寂     生命闸门   技术(开/条/锁)')
  for (const item of versions) {
    lines.push(
      '  ' + item.version.padEnd(6) + item.at.slice(0, 19).padEnd(22) +
        item.physical.gravityEarth.toFixed(2).padStart(6) +
        item.physical.meanTempC.toFixed(0).padStart(7) +
        item.verdict.deadLevel.padEnd(9) +
        item.verdict.lifeGate.padEnd(10) +
        item.tech.open + '/' + item.tech.conditional + '/' + item.tech.locked,
    )
  }
  lines.push('')
  lines.push('  ★ 档案只存可核对的快照；叙事与推导链由作者另存。')
  return lines.join('\n')
}

/**
 * 渲染对比结果。
 *
 * @param result - compareVersions 的结果
 * @returns 可读文本
 */
export function renderCompare(result: ReturnType<typeof compareVersions>): string {
  const lines: string[] = ['═══ 版本对比 ═══', '', '  ' + result.message]
  if (result.items.length > 0) {
    lines.push('')
    for (const item of result.items) {
      const mark = item.tone === 'worse' ? '✗' : item.tone === 'better' ? '✓' : '·'
      lines.push('  ' + mark + ' ' + item.field + '：' + JSON.stringify(item.a) + ' → ' + JSON.stringify(item.b) + (item.note ? '（' + item.note + '）' : ''))
    }
  }
  lines.push('')
  lines.push('  ★ 对比只列差异，不判断哪一版更好——那是作者的决定。')
  return lines.join('\n')
}

/**
 * 校验输入参数。
 *
 * @param input - op 输入
 * @returns 归一后的世界参数等
 * @throws {CalcError} 缺参
 */
export function readArchiveInput(input: Record<string, unknown>): { world: Record<string, unknown>; note: string } {
  const world = input['world'] !== undefined && input['world'] !== null && typeof input['world'] === 'object' && !Array.isArray(input['world']) ? (input['world'] as Record<string, unknown>) : {}
  const note = typeof input['note'] === 'string' ? input['note'] : ''
  return { world, note }
}
