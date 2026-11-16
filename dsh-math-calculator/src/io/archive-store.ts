/**
 * 推演档案与继承关系的文件层。
 *
 * ## 与 feature 的分工
 *
 * feature 是纯逻辑（接受档案数组、返回新数组）；io 负责路径、读写、原子替换。
 * 落盘格式只在这里定义。
 *
 * ## 两个约定
 *
 * - 档案读坏**不许当空**（会覆盖可恢复的文件），直接抛错；
 * - 写入用临时文件 + rename，避免写一半被读到。
 *
 * @module dsh-math-calculator/io/archive-store
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CalcError } from '../core/errors.js'
import { putRecord, queryRecords } from '../features/data-store/store.js'

/**
 * 推演档案统一存进数据层（kind="archive"）。
 *
 * 用户要求（2026-11-16）：全量耦合、功能重复合并。归档与通用数据层本是同类，
 * 现在读写都走 data-store；旧文件（<workspace>.derivation.json）首次读时导入一次。
 */
const ARCHIVE_KIND = 'archive'

/** 状态目录。 */
export function archiveDirectory(): string {
  const home = process.env['DSH_MATH_CALC_HOME'] ?? join(process.cwd(), '.dsh-math-calculator')
  return join(home, 'archives')
}

/** 档案文件路径。 */
export function archiveFilePath(workspace: string, dir: string = archiveDirectory()): string {
  const name = workspace.trim() === '' ? 'default' : workspace.trim()
  return join(dir, name + '.derivation.json')
}

/** 读档案；不存在返回空。 */
export function loadArchiveFile<T>(workspace: string, dir: string = archiveDirectory()): { versions: T[] } {
  const rows = queryRecords({ kind: ARCHIVE_KIND })
  if (rows.length > 0) {
    const versions = rows.map((row) => row.payload as T).filter((item) => item !== null && typeof item === 'object')
    return { versions }
  }
  /** 兼容：数据层为空时读旧文件并导入一次。 */
  const path = archiveFilePath(workspace, dir)
  if (!existsSync(path)) return { versions: [] }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { versions?: T[] }
    const versions = Array.isArray(parsed.versions) ? parsed.versions : []
    for (const [index, version] of versions.entries()) {
      const label = (version as Record<string, unknown>)['version'] ?? 'v' + (index + 1)
      putRecord({ kind: ARCHIVE_KIND, name: workspace + '/' + String(label), tags: ['归档'], payload: version })
    }
    return { versions }
  } catch (error) {
    throw new CalcError(
      'invalid_argument',
      '推演档案读不出来：' + (error instanceof Error ? error.message : String(error)),
      '文件：' + path + '。这不是「没有档案」——文件存在但解析失败。先备份再处理，不要直接覆盖。',
    )
  }
}

/** 写档案（原子替换）。 */
export function saveArchiveFile<T>(workspace: string, versions: T[], dir: string = archiveDirectory()): void {
  /** 统一写数据层；不再写独立档案文件。 */
  for (const [index, version] of versions.entries()) {
    const label = (version as Record<string, unknown>)['version'] ?? 'v' + (index + 1)
    putRecord({ kind: ARCHIVE_KIND, name: workspace + '/' + String(label), tags: ['归档'], payload: version })
  }
  void dir
  void mkdirSync
  void writeFileSync
  void renameSync
}

/** 继承关系文件路径（每个工作区一份）。 */
export function inheritFilePath(workspace: string, dir: string = archiveDirectory()): string {
  const name = workspace.trim() === '' ? 'default' : workspace.trim()
  return join(dir, name + '.inherit.json')
}

/** 读继承关系。 */
export function loadInheritFile<T>(workspace: string, dir: string = archiveDirectory()): { links: T[] } {
  const path = inheritFilePath(workspace, dir)
  if (!existsSync(path)) return { links: [] }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { links?: T[] }
    return { links: Array.isArray(parsed.links) ? parsed.links : [] }
  } catch (error) {
    throw new CalcError('invalid_argument', '继承关系读不出来：' + (error instanceof Error ? error.message : String(error)), '文件：' + path + '。')
  }
}

/** 写继承关系。 */
export function saveInheritFile<T>(workspace: string, links: T[], dir: string = archiveDirectory()): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(inheritFilePath(workspace, dir), JSON.stringify({ links }, null, 2), 'utf8')
}

/** 列出已有档案的工作区名。 */
export function listArchiveWorkspaces(dir: string = archiveDirectory()): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.derivation.json'))
    .map((name) => name.slice(0, -'.derivation.json'.length))
}
