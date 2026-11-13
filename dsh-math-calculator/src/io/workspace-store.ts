/**
 * 工作区文件的读写层。
 *
 * ## 与 feature 的分工
 *
 * feature 是纯逻辑（接受数据、返回新数据）；io 负责路径、读写、原子替换。
 * 落盘格式只在这里定义。
 *
 * ## 两个约定（沿用 state-store 的教训）
 *
 * - 读坏不许当空（会覆盖可恢复的文件），直接抛错；
 * - 写入用临时文件 + rename，避免写一半被读到。
 *
 * @module dsh-math-calculator/io/workspace-store
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CalcError } from '../core/errors.js'

/** 工作区数据（落盘形状）。 */
export interface WorkspaceData {
  version: number
  name: string
  /** 常数覆盖（改过的物理常数）。 */
  constants: Record<string, number>
  /** 自创量与自创常数。 */
  customConstants: Array<Record<string, unknown>>
  /** 公式表覆盖与自定义公式。 */
  formulaTable: Record<string, unknown>
  /** 命名变量（可参与计算）。 */
  variables: Record<string, number>
  /** 命名变量是否参与计算。 */
  useWorkspaceVariables: boolean
  /** 世界参数（可选的当前设定）。 */
  world: Record<string, unknown>
  /** 自创实体类型（topology 的自定义接口）。 */
  customEntities: Array<Record<string, unknown>>
  updatedAt: string
  createdAt: string
}

/** 工作区目录。 */
export function workspaceDirectory(): string {
  const home = process.env['DSH_MATH_CALC_HOME'] ?? join(process.cwd(), '.dsh-math-calculator')
  return join(home, 'workspaces')
}

/** 归一工作区名（只允许字母数字中文下划线连字符，1–40 字符）。 */
export function normalizeWorkspaceName(raw: string): string {
  const name = raw.trim()
  if (name === '') return 'default'
  if (!/^[\w\u4e00-\u9fa5-]{1,40}$/.test(name)) {
    throw new CalcError(
      'invalid_argument',
      '工作区名只能用字母/数字/中文/下划线/连字符（1–40 字符），收到 "' + raw + '"',
      '例如 default、北境、world-2。',
    )
  }
  return name
}

/** 工作区文件路径。 */
export function workspaceFilePath(name: string, dir: string = workspaceDirectory()): string {
  return join(dir, normalizeWorkspaceName(name) + '.json')
}

/** 空工作区。 */
export function emptyWorkspace(name: string, now = new Date().toISOString()): WorkspaceData {
  return {
    version: 1,
    name: normalizeWorkspaceName(name),
    constants: {},
    customConstants: [],
    formulaTable: {},
    variables: {},
    useWorkspaceVariables: false,
    world: {},
    customEntities: [],
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * 读工作区；不存在返回空工作区。
 *
 * @param name - 工作区名
 * @param dir - 目录（缺省 `workspaceDirectory()`）
 * @returns 工作区数据
 * @throws {CalcError} 文件存在但解析失败 → invalid_argument（不当空）
 */
export function loadWorkspaceFile(name: string, dir: string = workspaceDirectory()): WorkspaceData {
  const normalized = normalizeWorkspaceName(name)
  const path = workspaceFilePath(normalized, dir)
  if (!existsSync(path)) return emptyWorkspace(normalized)
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<WorkspaceData>
    const base = emptyWorkspace(normalized, typeof parsed.createdAt === 'string' ? parsed.createdAt : undefined)
    return {
      ...base,
      ...parsed,
      name: normalized,
      constants: typeof parsed.constants === 'object' && parsed.constants !== null ? parsed.constants : {},
      customConstants: Array.isArray(parsed.customConstants) ? parsed.customConstants : [],
      formulaTable: typeof parsed.formulaTable === 'object' && parsed.formulaTable !== null ? parsed.formulaTable : {},
      variables: typeof parsed.variables === 'object' && parsed.variables !== null ? parsed.variables : {},
      world: typeof parsed.world === 'object' && parsed.world !== null ? parsed.world : {},
      customEntities: Array.isArray(parsed.customEntities) ? parsed.customEntities : [],
    }
  } catch (error) {
    throw new CalcError(
      'invalid_argument',
      '工作区文件读不出来：' + (error instanceof Error ? error.message : String(error)),
      '文件：' + path + '。这不是「没有工作区」——文件存在但解析失败。先备份再处理，不要直接覆盖。',
    )
  }
}

/** 写工作区（原子替换）。 */
export function saveWorkspaceFile(data: WorkspaceData, dir: string = workspaceDirectory()): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const path = workspaceFilePath(data.name, dir)
  const temp = path + '.' + Date.now() + '.tmp'
  writeFileSync(temp, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2), 'utf8')
  renameSync(temp, path)
}

/** 列出工作区名。 */
export function listWorkspaceFiles(dir: string = workspaceDirectory()): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort()
}

/** 删除工作区（不存在返回 false）。 */
export function deleteWorkspaceFile(name: string, dir: string = workspaceDirectory()): boolean {
  const path = workspaceFilePath(name, dir)
  if (!existsSync(path)) return false
  unlinkSync(path)
  return true
}
