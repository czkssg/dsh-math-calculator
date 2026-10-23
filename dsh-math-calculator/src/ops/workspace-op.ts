/**
 * operation="workspace" 的实现。
 *
 * 从 index.ts 原样迁出（纯搬迁：逻辑、错误消息、输出文本逐字未改）。
  *
 * @module dsh-math-calculator/ops/workspace-op
*/

import {
  CONSTANT_GRAPH,
  getActiveConstants,
  resetActiveConstants,
  setActiveConstants,
  standardValues,
} from '../constants-graph.js'
import { toJsonValue } from '../format.js'
import {
  DEFAULT_WORKSPACE,
  WorkspaceError,
  cleanupWorkspaces,
  currentWorkspace,
  deleteWorkspace,
  listWorkspaces,
  loadWorkspace,
  normalizeWorkspaceName,
  removeTerrain,
  removeVariable,
  resetConstant,
  storageStats,
  switchWorkspace,
  updateWorkspace,
  workspaceDirectory,
  type SavedTerrain,
} from '../workspace.js'
import { CalcError, type MathArgs, type Outcome } from './shared.js'

/**
 * `workspace`：工作区管理（数据隔离的核心）。
 *
 * 一个工作区 = 一个世界观，独立保存：
 *   - 物理常数表
 *   - 星球参数
 *   - 局部地点（可多个）
 *   - 自定义变量
 *
 * 切换工作区时，活动常数表会整体替换 —— 不同世界观绝不互相污染。
 */
export function opWorkspace(args: MathArgs): Outcome {
  const action = (args.action2 ?? 'list').trim().toLowerCase()

  try {
    switch (action) {
      case 'list': {
        const summaries = listWorkspaces()
        const current = currentWorkspace()
        const lines = [`工作区目录: ${workspaceDirectory()}`, '']
        if (summaries.length === 0) {
          lines.push('（还没有保存过任何工作区，用 action2="create" 新建）')
        } else {
          lines.push(`共 ${summaries.length} 个工作区${current ? `，当前活动: ${current}` : ''}:`)
          lines.push('')
          lines.push('  名称                 常数  地点  变量   最后修改')
          for (const summary of summaries) {
            const marker = summary.name === current ? '●' : ' '
            lines.push(
              `  ${marker} ${summary.name.padEnd(18)} ${String(summary.constantCount).padStart(4)} ` +
                `${String(summary.terrainCount).padStart(5)} ${String(summary.variableCount).padStart(5)}   ${summary.updatedAt.slice(0, 19).replace('T', ' ')}`,
            )
            if (summary.description) lines.push(`      ${summary.description}`)
          }
        }
        return { result: lines.join('\n'), value: toJsonValue({ action, current, workspaces: summaries }) }
      }

      case 'show': {
        const name = normalizeWorkspaceName(args.workspace ?? currentWorkspace())
        const data = loadWorkspace(name)
        const lines = [`工作区 "${data.name}"`]
        if (data.description) lines.push(`  ${data.description}`)
        lines.push('')

        const constantNames = Object.keys(data.constants)
        const all = standardValues()
        // 只显示真正改过的旋钮（相对现实偏差 > 0.01%）
        const changed = constantNames.filter((n) => {
          const node = CONSTANT_GRAPH.find((x) => x.name === n)
          if (!node || !node.fundamental) return false
          const base = all[n]
          const value = data.constants[n]
          if (base === undefined || !Number.isFinite(value)) return false
          return Math.abs(value / base - 1) > 1e-4
        })

        if (changed.length === 0) {
          lines.push('【物理常数】现实值（未改动）')
        } else {
          lines.push(`【物理常数】${changed.length} 项偏离现实`)
          for (const constantName of changed) {
            const value = data.constants[constantName]
            const base = all[constantName]
            const delta = (value / base - 1) * 100
            lines.push(
              `  ${constantName.padEnd(10)} ${value.toExponential(5)}（现实 ${base.toExponential(5)}，${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%）`,
            )
          }
        }

        lines.push('')
        const worldKeys = Object.keys(data.world)
        lines.push(
          worldKeys.length === 0
            ? '【星球参数】未设定'
            : `【星球参数】${worldKeys.map((k) => `${k}=${JSON.stringify(data.world[k])}`).join(', ')}`,
        )

        lines.push('')
        if (data.terrains.length === 0) {
          lines.push('【局部地点】无')
        } else {
          lines.push(`【局部地点】${data.terrains.length} 处`)
          for (const terrain of data.terrains) {
            const params = Object.entries(terrain.params)
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join(', ')
            lines.push(`  · ${terrain.name}${terrain.note ? `（${terrain.note}）` : ''}`)
            lines.push(`      ${params}`)
          }
        }

        lines.push('')
        const variableNames = Object.keys(data.variables)
        lines.push(
          variableNames.length === 0
            ? '【自定义变量】无'
            : `【自定义变量】${variableNames.map((n) => `${n}=${data.variables[n]}`).join(', ')}`,
        )

        return { result: lines.join('\n'), value: toJsonValue({ action, workspace: data }) }
      }

      case 'create': {
        const name = normalizeWorkspaceName(args.workspace)
        if (name === DEFAULT_WORKSPACE) {
          throw new CalcError('invalid_argument', '请给一个新工作区名（不能是 default）')
        }
        const existing = listWorkspaces().some((s) => s.name === name)
        if (existing && args.action2 !== 'create') {
          // 已存在则直接切换，不报错
        }
        const data = loadWorkspace(name)
        if (args.description) data.description = args.description
        if (!existing) {
          data.createdAt = new Date().toISOString()
        }
        updateWorkspace(name, () => data)
        switchWorkspace(name)
        setActiveConstants(data.constants)
        return {
          result:
            `✓ 工作区 "${name}" ${existing ? '已存在，已切换过去' : '已创建并启用'}\n` +
            `活动常数表已切换为该工作区的设定（当前改动 ${Object.keys(data.constants).length} 个常数）。`,
          value: toJsonValue({ action, workspace: name, created: !existing }),
        }
      }

      case 'switch':
      case 'use': {
        const name = normalizeWorkspaceName(args.workspace)
        const data = switchWorkspace(name)
        // 关键：切换常数表，避免 A 世界污染 B 世界
        setActiveConstants(data.constants)
        return {
          result:
            `✓ 已切换到工作区 "${name}"\n` +
            `  常数改动: ${Object.keys(data.constants).length} 个\n` +
            `  局部地点: ${data.terrains.length} 处\n` +
            `  自定义变量: ${Object.keys(data.variables).length} 个\n` +
            '之后所有 constants / world / formula 调用都在此工作区内。',
          value: toJsonValue({ action: 'switch', workspace: name, constants: data.constants }),
        }
      }

      case 'save': {
        // 把当前生效的常数表存进工作区
        const name = normalizeWorkspaceName(args.workspace ?? currentWorkspace())
        const active = getActiveConstants()
        const data = updateWorkspace(name, (current) => ({
          ...current,
          constants: { ...active },
        }))
        return {
          result:
            `✓ 已把当前生效的 ${Object.keys(active).length} 个常数保存到工作区 "${name}"\n` +
            `更新时间: ${data.updatedAt}`,
          value: toJsonValue({ action: 'save', workspace: name, saved: Object.keys(active).length }),
        }
      }

      case 'set': {
        // 保存星球参数 / 变量到工作区
        const name = normalizeWorkspaceName(args.workspace ?? currentWorkspace())
        const data = updateWorkspace(name, (current) => {
          const next = { ...current }
          if (args.world && typeof args.world === 'object') {
            next.world = { ...next.world, ...args.world }
          }
          if (args.workspaceVariables && typeof args.workspaceVariables === 'object') {
            next.variables = { ...next.variables, ...args.workspaceVariables }
          }
          if (args.description) next.description = args.description
          return next
        })
        return {
          result: `✓ 已更新工作区 "${name}"（星球参数 ${Object.keys(data.world).length} 项，变量 ${Object.keys(data.variables).length} 个）`,
          value: toJsonValue({ action: 'set', workspace: data }),
        }
      }

      case 'add-terrain':
      case 'addterrain': {
        const name = normalizeWorkspaceName(args.workspace ?? currentWorkspace())
        if (!args.terrainName || typeof args.terrainName !== 'string') {
          throw new CalcError('invalid_argument', '需要 terrainName 给这个地点起名')
        }
        const terrainParams = (args.terrain ?? {}) as Record<string, unknown>
        const saved: SavedTerrain = {
          name: args.terrainName.trim().slice(0, 80),
          params: terrainParams,
          note: args.description,
          updatedAt: new Date().toISOString(),
        }
        const data = updateWorkspace(name, (current) => {
          const terrains = current.terrains.filter((t) => t.name !== saved.name)
          terrains.push(saved)
          return { ...current, terrains }
        })
        return {
          result: `✓ 已保存地点 "${saved.name}" 到工作区 "${name}"（共 ${data.terrains.length} 处）`,
          value: toJsonValue({ action: 'add-terrain', workspace: name, terrain: saved }),
        }
      }

      case 'delete':
      case 'remove': {
        const name = normalizeWorkspaceName(args.workspace)
        deleteWorkspace(name)
        return {
          result: `✓ 已删除工作区 "${name}"`,
          value: toJsonValue({ action: 'delete', workspace: name }),
        }
      }

      case 'remove-terrain': {
        const name = normalizeWorkspaceName(args.workspace ?? currentWorkspace())
        if (!args.terrainName) throw new CalcError('invalid_argument', '需要 terrainName 指明删哪个地点')
        const removed = removeTerrain(name, args.terrainName)
        return {
          result: removed
            ? `✓ 已从工作区 "${name}" 删除地点 "${args.terrainName}"`
            : `工作区 "${name}" 里没有名为 "${args.terrainName}" 的地点`,
          value: toJsonValue({ action: 'remove-terrain', workspace: name, removed }),
        }
      }

      case 'remove-variable': {
        const name = normalizeWorkspaceName(args.workspace ?? currentWorkspace())
        const variableName = args.variableName ?? args.variable
        if (!variableName) throw new CalcError('invalid_argument', '需要 variableName 指明删哪个变量')
        const removed = removeVariable(name, String(variableName))
        return {
          result: removed
            ? `✓ 已从工作区 "${name}" 删除变量 "${variableName}"`
            : `工作区 "${name}" 里没有变量 "${variableName}"`,
          value: toJsonValue({ action: 'remove-variable', workspace: name, removed }),
        }
      }

      case 'reset-constant': {
        const name = normalizeWorkspaceName(args.workspace ?? currentWorkspace())
        const constantName = args.constantName
        if (!constantName) {
          throw new CalcError('invalid_argument', '需要 constantName 指明重置哪个常数')
        }
        const removed = resetConstant(name, String(constantName))
        // 重新加载该工作区常数到活动表
        const reloaded = loadWorkspace(name)
        setActiveConstants(reloaded.constants)
        return {
          result: removed
            ? `✓ 已把 "${constantName}" 重置为现实值（工作区 "${name}"）`
            : `工作区 "${name}" 里 "${constantName}" 本来就是现实值`,
          value: toJsonValue({ action: 'reset-constant', workspace: name, removed }),
        }
      }

      case 'stats': {
        const stats = storageStats()
        const kb = (bytes: number): string => (bytes / 1024).toFixed(1)
        const lines = [
          '存储统计',
          `  目录: ${stats.directory}`,
          `  工作区: ${stats.workspaceCount} 个，共 ${kb(stats.totalBytes)} KB`,
          '',
        ]
        if (stats.workspaces.length > 0) {
          lines.push('  名称                 体积KB  常数  地点  变量  状态')
          for (const workspace of stats.workspaces) {
            lines.push(
              `  ${workspace.name.padEnd(18)} ${kb(workspace.bytes).padStart(7)} ` +
                `${String(workspace.constantCount).padStart(5)} ${String(workspace.terrainCount).padStart(5)} ` +
                `${String(workspace.variableCount).padStart(5)}  ${workspace.empty ? '空' : '有数据'}`,
            )
          }
        }
        return { result: lines.join('\n'), value: toJsonValue(stats) }
      }

      case 'cleanup': {
        const emptyOnly = args.emptyOnly !== false
        const dryRun = args.dryRun === true
        const olderThanDays =
          typeof args.olderThanDays === 'number' ? args.olderThanDays : undefined
        const keep = Array.isArray(args.keep) ? (args.keep as string[]) : []
        const tempPrefixes = Array.isArray(args.tempPrefixes)
          ? (args.tempPrefixes as string[])
          : undefined

        const report = cleanupWorkspaces({ emptyOnly, dryRun, olderThanDays, keep, tempPrefixes })
        const kb = (bytes: number): string => (bytes / 1024).toFixed(1)
        const lines = [
          dryRun ? '清理预览（未真删）' : '清理完成',
          '',
        ]
        if (report.emptyWorkspacesDeleted.length > 0) {
          lines.push(`  空工作区: ${report.emptyWorkspacesDeleted.join(', ')}`)
        }
        if (report.tempWorkspacesDeleted.length > 0) {
          lines.push(`  临时工作区: ${report.tempWorkspacesDeleted.join(', ')}`)
        }
        if (report.workspacesDeleted.length > 0) {
          lines.push(`  过期工作区: ${report.workspacesDeleted.join(', ')}`)
        }
        const removed =
          report.emptyWorkspacesDeleted.length +
          report.tempWorkspacesDeleted.length +
          report.workspacesDeleted.length
        if (removed === 0) lines.push('  没有符合条件的可清理项')
        else lines.push(`  共处理 ${removed} 个，释放 ${kb(report.bytesFreed)} KB`)

        if (report.skipped.length > 0) {
          lines.push('')
          lines.push(`  保留 ${report.skipped.length} 个:`)
          for (const skipped of report.skipped.slice(0, 10)) lines.push(`    · ${skipped}`)
          if (report.skipped.length > 10) lines.push(`    …还有 ${report.skipped.length - 10} 个`)
        }
        if (dryRun) {
          lines.push('')
          lines.push('  确认无误后，去掉 dryRun 参数再执行一次即可真正删除。')
        }
        return { result: lines.join('\n'), value: toJsonValue(report) }
      }

      case 'reset': {
        // 清空当前工作区的常数（回到现实宇宙），但保留地点和变量
        const name = normalizeWorkspaceName(args.workspace ?? currentWorkspace())
        resetActiveConstants()
        updateWorkspace(name, (current) => ({ ...current, constants: {} }))
        return {
          result: `✓ 工作区 "${name}" 的物理常数已恢复现实值`,
          value: toJsonValue({ action: 'reset', workspace: name }),
        }
      }

      default:
        throw new CalcError(
          'invalid_argument',
          `不认识的工作区动作 "${action}"`,
          '可用: list / show / create / switch / save / set / add-terrain / delete / reset',
        )
    }
  } catch (error) {
    if (error instanceof WorkspaceError) {
      throw new CalcError(error.type, error.message)
    }
    throw error
  }
}
