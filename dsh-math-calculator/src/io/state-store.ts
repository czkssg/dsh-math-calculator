/**
 * 设定库的文件层。
 *
 * ## 为什么与 feature 分开
 *
 * v3 的约定是「数据由调用方注入」：feature 是纯逻辑，io 负责路径与读写。
 * 这样 `world-state.ts` 可以在内存里测（不需要文件），
 * 而落盘格式只在这一处定义。
 *
 * ## 读坏了不许当成空库
 *
 * 这是踩过的坑（workspace 同类问题）：文件存在但解析失败时，
 * 当成空库会让调用方以为设定丢了，然后重建一份，把可恢复的文件覆盖掉。
 * 所以这里直接抛错，并在 hint 里说清「这不是没有设定」。
 *
 * @module dsh-math-calculator/io/state-store
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CalcError } from '../core/errors.js'
import { emptyBook, type StateBook, type StateEntry } from '../features/deduction/world-state.js'
import { putRecord, queryRecords } from '../features/data-store/store.js'

/**
 * 设定库统一存进数据层（kind="setting"）。
 *
 * 用户要求（2026-11-16）：功能重复的合并。设定库与通用数据层本是同一件事，
 * 只是入口不同。现在读写都走 data-store —— 单一数据源。
 * 旧文件（<workspace>.state.json）保留兼容：首次读时若数据层为空则导入一次。
 */
const SETTING_KIND = 'setting'

/** 状态目录（可用环境变量覆盖，测试用临时目录）。 */
export function stateDirectory(): string {
  const home = process.env['DSH_MATH_CALC_HOME'] ?? join(process.cwd(), '.dsh-math-calculator')
  return join(home, 'states')
}

/** 设定库文件路径。 */
export function stateFilePath(workspace: string, dir: string = stateDirectory()): string {
  const name = workspace.trim() === '' ? 'default' : workspace.trim()
  return join(dir, name + '.state.json')
}

/**
 * 读设定库；文件不存在返回空库。
 *
 * @param workspace - 工作区名
 * @param dir - 目录（缺省 `stateDirectory()`）
 * @returns 设定库
 * @throws {CalcError} 文件存在但解析失败 → invalid_argument（不当空库）
 */
export function loadStateBook(workspace: string, dir: string = stateDirectory()): StateBook {
  const rows = queryRecords({ kind: SETTING_KIND })
  if (rows.length > 0) {
    const entries = rows.map((row) => row.payload as StateEntry).filter((entry) => entry !== null && typeof entry === 'object')
    return { version: 1, entries }
  }
  /** 兼容：数据层为空时读旧文件并导入一次。 */
  const path = stateFilePath(workspace, dir)
  if (!existsSync(path)) return emptyBook()
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<StateBook>
    const entries = Array.isArray(parsed.entries) ? (parsed.entries as StateBook['entries']) : []
    for (const entry of entries) putRecord({ kind: SETTING_KIND, name: entry.id, tags: (entry as StateEntry).tags ?? [], payload: entry })
    return { version: typeof parsed.version === 'number' ? parsed.version : 1, entries }
  } catch (error) {
    throw new CalcError(
      'invalid_argument',
      '设定库文件读不出来：' + (error instanceof Error ? error.message : String(error)),
      '文件：' + path + '。这不是「没有设定」——文件存在但解析失败。' +
        '请检查它是否是合法 JSON，或先备份后删除再重建；不要在未备份时直接写入，那会覆盖现有内容。',
    )
  }
}

/**
 * 写设定库。
 *
 * @param workspace - 工作区名
 * @param book - 设定库
 * @param dir - 目录（缺省 `stateDirectory()`）
 */
export function saveStateBook(workspace: string, book: StateBook, dir: string = stateDirectory()): void {
  /** 统一写数据层；不再写独立 state 文件（旧文件保留不动，迁移后也不会被覆盖）。 */
  for (const entry of book.entries) {
    putRecord({ kind: SETTING_KIND, name: (entry as StateEntry).id, tags: (entry as StateEntry).tags ?? [], payload: entry })
  }
  void dir
  void mkdirSync
  void writeFileSync
}

/** 列出已有设定库的工作区名。 */
export function listStateWorkspaces(dir: string = stateDirectory()): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.state.json'))
    .map((name) => name.slice(0, -'.state.json'.length))
}
