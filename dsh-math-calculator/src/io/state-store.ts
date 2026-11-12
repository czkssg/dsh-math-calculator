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
import { emptyBook, type StateBook } from '../features/deduction/world-state.js'

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
  const path = stateFilePath(workspace, dir)
  if (!existsSync(path)) return emptyBook()
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<StateBook>
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      entries: Array.isArray(parsed.entries) ? (parsed.entries as StateBook['entries']) : [],
    }
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
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(stateFilePath(workspace, dir), JSON.stringify(book, null, 2), 'utf8')
}

/** 列出已有设定库的工作区名。 */
export function listStateWorkspaces(dir: string = stateDirectory()): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.state.json'))
    .map((name) => name.slice(0, -'.state.json'.length))
}
