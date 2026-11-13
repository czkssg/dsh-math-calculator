/**
 * `formula-table`：管理工作区的公式表。
 *
 * 每个工作区有自己的公式表——这是数据隔离的一部分。
 * 支持：覆盖现有公式的表达式/参数、停用公式、新增自定义公式。
 * 公式里的常量会**自动跟随本工作区的常数表**。
 *
 * 全局公式包（global-*）暂未迁移；它写入的是插件级文件，与工作区表是两回事。
 *
 * @module dsh-math-calculator/features/formulas/formula-table-op
 */

import { CalcError } from '../../core/errors.js'
import { buildEngine } from '../../core/engine.js'
import { currentWorkspace, switchWorkspace } from '../workspace.js'
import { loadWorkspaceFile, saveWorkspaceFile } from '../../io/workspace-store.js'
import {
  addCustomFormula,
  emptyFormulaTable,
  materializeFormulas,
  removeCustomFormula,
  removeOverride,
  upsertOverride,
  validateExpression,
  type CustomFormula,
  type FormulaDef,
  type FormulaOverride,
  type WorkspaceFormulaTable,
} from './formula-table.js'

/** 结果。 */
export interface FormulaTableOutcome {
  result: string
  value: unknown
  notice?: string
}

/**
 * 执行 formula-table。
 *
 * @param input - 动作与参数
 * @param formulas - 全局模板（注入）
 * @returns 结果
 * @throws {CalcError} 参数缺失 / 表达式不合法
 */
export function runFormulaTable(
  input: {
    tableAction?: string
    formulaId?: string
    newExpression?: string
    newParams?: Record<string, number | null>
    customFormula?: Record<string, unknown>
    workspace?: string
  },
  formulas: FormulaDef[],
): FormulaTableOutcome {
  const action = (typeof input.tableAction === 'string' && input.tableAction.trim() !== '' ? input.tableAction.trim() : 'show').toLowerCase()
  if (input.workspace !== undefined && input.workspace.trim() !== '') switchWorkspace(input.workspace)
  const workspace = currentWorkspace()
  const data = loadWorkspaceFile(workspace)
  /** 落盘里 formulaTable 可能是 {}（第一次写之前），这里归一成完整形状。 */
  const rawTable = (data as unknown as { formulaTable?: Partial<WorkspaceFormulaTable> }).formulaTable
  const table: WorkspaceFormulaTable = {
    overrides: Array.isArray(rawTable?.overrides) ? (rawTable.overrides as FormulaOverride[]) : [],
    custom: Array.isArray(rawTable?.custom) ? (rawTable.custom as CustomFormula[]) : [],
  }
  const standard = formulas.reduce<Record<string, number>>((acc, formula) => {
    for (const [name, spec] of Object.entries(formula.params ?? {})) if (spec.value !== null) acc[name] ??= spec.value
    return acc
  }, {})
  const save = (next: WorkspaceFormulaTable, message: string): FormulaTableOutcome => {
    saveWorkspaceFile({ ...data, formulaTable: next as unknown as Record<string, unknown> })
    const materialized = materializeFormulas(next, formulas, data.constants, standard)
    const extra = materialized.appliedConstants.length > 0 ? '\n  常量已跟随本工作区: ' + materialized.appliedConstants.join(', ') : ''
    return {
      result: message + '\n  工作区: ' + workspace + '\n  当前生效公式数: ' + materialized.formulas.length + (extra ? '\n  ' + extra : ''),
      value: { workspace, formulaTable: next, effectiveCount: materialized.formulas.length, appliedConstants: materialized.appliedConstants },
    }
  }

  switch (action) {
    case 'show':
    case 'list': {
      const materialized = materializeFormulas(table, formulas, data.constants, standard)
      const lines: string[] = ['工作区公式表: ' + workspace, '']
      lines.push('  公式总数: ' + materialized.formulas.length + ' 条')
      lines.push('    模板公式: ' + formulas.length + ' 条')
      lines.push('    被覆盖: ' + table.overrides.filter((item) => !item.disabled).length + ' 条')
      lines.push('    被停用: ' + table.overrides.filter((item) => item.disabled).length + ' 条')
      lines.push('    自定义: ' + table.custom.length + ' 条')
      if (materialized.appliedConstants.length > 0) lines.push('  常量已跟随本工作区常数表: ' + materialized.appliedConstants.join(', '))
      lines.push('')
      if (table.overrides.length > 0) {
        lines.push('【覆盖与停用】')
        for (const override of table.overrides) {
          const parts: string[] = []
          if (override.disabled) parts.push('停用')
          if (override.expression) parts.push('表达式: ' + override.expression)
          if (override.params) parts.push('参数: ' + Object.entries(override.params).map(([key, value]) => key + '=' + (value === null ? '必填' : value)).join(', '))
          lines.push('  ' + override.id.padEnd(24) + (parts.join(' | ') || '仅改名称/说明'))
        }
        lines.push('')
      }
      if (table.custom.length > 0) {
        lines.push('【自定义公式】')
        for (const custom of table.custom) {
          lines.push('  ' + custom.id.padEnd(24) + custom.expression)
          if (custom.description) lines.push('  ' + ''.padEnd(24) + custom.description)
        }
        lines.push('')
      }
      if (table.overrides.length === 0 && table.custom.length === 0) lines.push('（本工作区还没有改动任何公式，使用全局模板）')
      return { result: lines.join('\n'), value: { workspace, formulaTable: table, effectiveCount: materialized.formulas.length } }
    }

    case 'override':
    case 'set': {
      if (typeof input.formulaId !== 'string' || input.formulaId.trim() === '') throw new CalcError('missing_params', '需要 formulaId 指明覆盖哪条公式', '例如 {tableAction:"override", formulaId:"surface_gravity", newParams:{M:5}}。')
      const targetId = input.formulaId.trim()
      const override: FormulaOverride = { id: targetId }
      if (typeof input.newExpression === 'string' && input.newExpression.trim() !== '') override.expression = input.newExpression.trim()
      if (input.newParams && typeof input.newParams === 'object') override.params = input.newParams
      if (!override.expression && !override.params) throw new CalcError('invalid_argument', '需要 newExpression 或 newParams 至少给一个', '')
      const template = formulas.find((formula) => formula.id === targetId)
      if (template && override.expression) {
        const issue = validateExpression(buildEngine().math, override.expression, Object.keys(template.params ?? {}))
        if (issue) throw new CalcError('invalid_argument', issue, '表达式只能用该公式已声明的参数名，或已知常数。')
      }
      const result = upsertOverride(table, override, formulas)
      if (result.table === table) throw new CalcError('unknown_formula', result.message, '用 formulas query 查可用的公式 id。')
      return save(result.table, '✓ ' + result.message)
    }

    case 'remove':
    case 'unoverride': {
      if (typeof input.formulaId !== 'string' || input.formulaId.trim() === '') throw new CalcError('missing_params', '需要 formulaId', '')
      const targetId = input.formulaId.trim()
      const customResult = removeCustomFormula(table, targetId)
      if (customResult.table.custom.length < table.custom.length) return save(customResult.table, '✓ ' + customResult.message)
      return save(removeOverride(table, targetId).table, '✓ ' + removeOverride(table, targetId).message)
    }

    case 'add':
    case 'add-custom': {
      const definition = input.customFormula
      if (!definition || typeof definition !== 'object') {
        throw new CalcError('missing_params', '需要 customFormula 定义新公式', '例如 {"id":"my_force","name":"我的力","expression":"k*x","params":{"k":{"value":2,"desc":"刚度"},"x":{"value":null,"desc":"位移"}}}')
      }
      if (typeof definition['id'] !== 'string' || definition['id'].trim() === '') throw new CalcError('invalid_argument', 'customFormula.id 必须是非空字符串', '')
      if (typeof definition['expression'] !== 'string' || definition['expression'].trim() === '') throw new CalcError('invalid_argument', 'customFormula.expression 必须是非空字符串', '')
      const params: CustomFormula['params'] = {}
      const rawParams = definition['params']
      if (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)) {
        for (const [name, spec] of Object.entries(rawParams as Record<string, unknown>)) {
          const record = spec !== null && typeof spec === 'object' && !Array.isArray(spec) ? (spec as Record<string, unknown>) : {}
          params[name] = {
            value: typeof record['value'] === 'number' && Number.isFinite(record['value']) ? record['value'] : null,
            desc: typeof record['desc'] === 'string' ? record['desc'] : '',
          }
        }
      }
      const issue = validateExpression(buildEngine().math, definition['expression'].trim(), Object.keys(params))
      if (issue) throw new CalcError('invalid_argument', issue, '表达式只能用已声明的参数名，或已知常数（如 G、c、kB）。')
      const custom: CustomFormula = {
        id: definition['id'].trim(),
        name: typeof definition['name'] === 'string' && definition['name'].trim() !== '' ? definition['name'].trim() : definition['id'].trim(),
        category: typeof definition['category'] === 'string' && definition['category'].trim() !== '' ? definition['category'].trim() : 'custom',
        expression: definition['expression'].trim(),
        params,
        ...(typeof definition['unit'] === 'string' ? { unit: definition['unit'] } : {}),
        ...(typeof definition['description'] === 'string' ? { description: definition['description'] } : {}),
      }
      const result = addCustomFormula(table, custom, formulas)
      if (result.table === table) throw new CalcError('invalid_argument', result.message, '')
      return save(result.table, '✓ ' + result.message)
    }

    case 'disable':
    case 'enable': {
      if (typeof input.formulaId !== 'string' || input.formulaId.trim() === '') throw new CalcError('missing_params', '需要 formulaId', '')
      const targetId = input.formulaId.trim()
      const existing = table.overrides.find((override) => override.id === targetId)
      if (action === 'disable') {
        const next: FormulaOverride = existing ? { ...existing, disabled: true } : { id: targetId, disabled: true }
        return save(upsertOverride(table, next, formulas).table, '✓ 已停用公式 "' + targetId + '"')
      }
      if (!existing) return save(table, '公式 "' + targetId + '" 本来就没被停用')
      const next: FormulaOverride = { ...existing }
      delete next.disabled
      const hasOther = next.expression || next.params || next.name || next.description
      return save(hasOther ? upsertOverride(table, next, formulas).table : removeOverride(table, targetId).table, '✓ 已启用公式 "' + targetId + '"')
    }

    case 'reset':
      return save(emptyFormulaTable(), '✓ 已清空工作区 "' + workspace + '" 的公式表（恢复全局模板）')

    default:
      throw new CalcError('unknown_argument', '不认识的公式表动作 "' + action + '"', '可用: show / override / remove / add / disable / enable / reset')
  }
}
