/**
 * 工作区：数值与设定状态的分层存储。
 *
 * ## 分工
 *
 * ```
 *   workspace    数值型状态（常数覆盖、命名变量、自创量、公式表、世界参数）
 *   world_state  文本型设定（条目、废弃链）
 * ```
 *
 * 两者都落盘，但形状不同。本模块只管前者。
 *
 * ## 动作
 *
 * ```
 *   list     列出全部工作区
 *   create   新建（重名则报错）
 *   switch   切换当前工作区（之后的计算都读它）
 *   set      写入常数/变量/自创量/公式表
 *   delete   删除（不存在返回 false）
 *   stats    目录与文件统计
 * ```
 *
 * ## 当前工作区
 *
 * 进程内单例（与老实现一致）。每个会话的默认值是 `default`。
 * 宿主按 cwd 切换作用域的逻辑在入口层（tool.ts）——本模块只认名字。
 *
 * @module dsh-math-calculator/features/workspace
 */

import { existsSync } from 'node:fs'
import { CalcError } from '../core/errors.js'
import {
  deleteWorkspaceFile,
  emptyWorkspace,
  listWorkspaceFiles,
  loadWorkspaceFile,
  normalizeWorkspaceName,
  saveWorkspaceFile,
  workspaceDirectory,
  type WorkspaceData,
} from '../io/workspace-store.js'

/** 当前工作区（进程内单例）。 */
let current = 'default'

/** 读当前工作区名。 */
export function currentWorkspace(): string {
  return current
}

/** 切当前工作区（不落盘，仅进程内）。 */
export function switchWorkspace(name: string): void {
  current = normalizeWorkspaceName(name)
}

/** 输入。 */
export interface WorkspaceInput {
  /** 动作：list/create/switch/set/delete/stats。 */
  action2?: string
  /** 目标工作区名。 */
  workspace?: string
  /** set：常数覆盖。 */
  constants?: Record<string, number>
  /** set：命名变量。 */
  workspaceVariables?: Record<string, number>
  /** set：命名变量是否参与计算。 */
  useWorkspaceVariables?: boolean
  /** set：世界参数。 */
  world?: Record<string, unknown>
  /** 备注。 */
  description?: string
}

/** 结果。 */
export interface WorkspaceOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 数字渲染。 */
function f(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs !== 0 && (abs >= 1e7 || abs < 1e-3)) return value.toExponential(3)
  return String(Number(value.toPrecision(6)))
}

/**
 * 执行工作区动作。
 *
 * @param input - 动作与数据
 * @param dir - 目录（测试注入）
 * @returns 结果与新状态
 * @throws {CalcError} 动作未知 / 重名 / 名非法
 */
export function runWorkspace(input: WorkspaceInput | undefined, dir: string = workspaceDirectory()): WorkspaceOutcome {
  if (input === undefined || input === null) {
    throw new CalcError('missing_params', 'workspace 需要输入', '例如 {workspace:{action2:"list"}}；建库 {action2:"create", workspace:"北境"}。')
  }
  const action = typeof input.action2 === 'string' && input.action2.trim() !== '' ? input.action2.trim().toLowerCase() : 'list'
  const target = normalizeWorkspaceName(typeof input.workspace === 'string' && input.workspace.trim() !== '' ? input.workspace : current)

  if (action === 'list') {
    const names = listWorkspaceFiles(dir)
    const lines: string[] = ['═══ 工作区 ═══', '']
    lines.push('  当前：' + current)
    lines.push('')
    if (names.length === 0) lines.push('  （还没有工作区；第一次 set 会自动建 default）')
    for (const name of names) {
      let detail = ''
      try {
        const data = loadWorkspaceFile(name, dir)
        const counts = [
          Object.keys(data.constants).length > 0 ? '常数 ' + Object.keys(data.constants).length : '',
          Object.keys(data.variables).length > 0 ? '变量 ' + Object.keys(data.variables).length : '',
          data.customConstants.length > 0 ? '自创量 ' + data.customConstants.length : '',
        ].filter(Boolean)
        detail = counts.length > 0 ? '（' + counts.join('，') + '）' : '（空）'
      } catch {
        detail = '（读取失败）'
      }
      lines.push('  ' + (name === current ? '● ' : '  ') + name + ' ' + detail)
    }
    lines.push('')
    lines.push('  ★ 不同工作区的常数/变量互相隔离；切世界观用 action2="switch"。')
    return { result: lines.join('\n'), value: { current, workspaces: names } }
  }

  if (action === 'create') {
    const path = workspaceDirectory()
    void path
    const existing = listWorkspaceFiles(dir)
    if (existing.includes(target)) {
      throw new CalcError('invalid_argument', '工作区「' + target + '」已存在', '用 action2="switch" 切过去；要重建先 delete。')
    }
    const data = emptyWorkspace(target)
    saveWorkspaceFile(data, dir)
    current = target
    return {
      result: '✓ 已创建工作区「' + target + '」并切换过去。\n  之后的常数/变量都写在这里。',
      value: { created: target, current },
    }
  }

  if (action === 'switch') {
    if (!listWorkspaceFiles(dir).includes(target)) {
      throw new CalcError('unknown_symbol', '工作区「' + target + '」不存在', '已有：' + (listWorkspaceFiles(dir).join('、') || '（无）') + '。先用 create 建一个。')
    }
    current = target
    const data = loadWorkspaceFile(target, dir)
    const counts = [
      Object.keys(data.constants).length > 0 ? '常数 ' + Object.keys(data.constants).length : '',
      Object.keys(data.variables).length > 0 ? '变量 ' + Object.keys(data.variables).length : '',
      data.customConstants.length > 0 ? '自创量 ' + data.customConstants.length : '',
    ].filter(Boolean)
    return {
      result: '✓ 已切换到工作区「' + target + '」' + (counts.length > 0 ? '（' + counts.join('，') + '）' : '（空）') + '。',
      value: { current: target },
    }
  }

  if (action === 'set') {
    const data = loadWorkspaceFile(target, dir)
    const next: WorkspaceData = { ...data, updatedAt: new Date().toISOString() }
    if (input.constants !== undefined) {
      const constants: Record<string, number> = {}
      for (const [key, value] of Object.entries(input.constants)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new CalcError('invalid_argument', 'constants.' + key + ' 必须是有限数（收到 ' + JSON.stringify(value) + '）', '')
        }
        constants[key] = value
      }
      next.constants = constants
    }
    if (input.workspaceVariables !== undefined) {
      const variables: Record<string, number> = {}
      for (const [key, value] of Object.entries(input.workspaceVariables)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new CalcError('invalid_argument', 'workspaceVariables.' + key + ' 必须是有限数（收到 ' + JSON.stringify(value) + '）', '')
        }
        variables[key] = value
      }
      next.variables = variables
    }
    if (input.useWorkspaceVariables !== undefined) next.useWorkspaceVariables = input.useWorkspaceVariables === true
    if (input.world !== undefined) next.world = input.world
    saveWorkspaceFile(next, dir)
    current = target
    const lines: string[] = ['✓ 工作区「' + target + '」已更新', '']
    if (input.constants !== undefined) lines.push('  常数覆盖：' + (Object.keys(next.constants).length > 0 ? Object.entries(next.constants).map(([k, v]) => k + '=' + f(v)).join('，') : '（已清空）'))
    if (input.workspaceVariables !== undefined) lines.push('  命名变量：' + (Object.keys(next.variables).length > 0 ? Object.entries(next.variables).map(([k, v]) => k + '=' + f(v)).join('，') : '（已清空）'))
    if (input.useWorkspaceVariables !== undefined) lines.push('  变量是否参与计算：' + (next.useWorkspaceVariables ? '是' : '否'))
    if (input.world !== undefined) lines.push('  世界参数：' + JSON.stringify(next.world))
    lines.push('', '  ★ 常数覆盖会改变之后所有 formula / world 的结果；只想看后果请用 constants 的 preview。')
    return { result: lines.join('\n'), value: { current: target, data: next } }
  }

  if (action === 'delete') {
    if (target === current) {
      throw new CalcError('invalid_argument', '不能删除当前工作区「' + target + '」', '先切换到别的工作区再删。')
    }
    const removed = deleteWorkspaceFile(target, dir)
    return {
      result: removed ? '✓ 已删除工作区「' + target + '」' : '工作区「' + target + '」不存在，没有可删的。',
      value: { removed, target },
    }
  }

  if (action === 'stats') {
    const names = listWorkspaceFiles(dir)
    const exists = existsSync(dir)
    let bytes = 0
    for (const name of names) {
      try {
        const data = loadWorkspaceFile(name, dir)
        bytes += JSON.stringify(data).length
      } catch {
        /* 坏文件不参与统计 */
      }
    }
    const lines = [
      '═══ 工作区统计 ═══',
      '',
      '  目录：' + dir + (exists ? '' : '（尚未创建）'),
      '  数量：' + names.length,
      '  总大小：约 ' + (bytes / 1024).toFixed(1) + ' KB',
      '  当前：' + current,
    ]
    return { result: lines.join('\n'), value: { count: names.length, bytes, current } }
  }

  throw new CalcError('unknown_argument', '不认识的工作区动作「' + action + '」', '可用：list / create / switch / set / delete / stats。')
}
