/**
 * operation="formula-table" 的实现。
 *
 * 从 index.ts 原样迁出（纯搬迁：逻辑、错误消息、输出文本逐字未改）。
 */

import {
  addCustomFormula,
  emptyFormulaTable,
  materializeFormulas,
  removeCustomFormula,
  removeOverride,
  upsertOverride,
  validateExpression,
  type CustomFormula,
  type FormulaOverride,
  type WorkspaceFormulaTable,
} from '../formula-table.js'
import { FORMULAS } from '../formulas.js'
import { toJsonValue } from '../format.js'
import { currentWorkspace, loadWorkspace, normalizeWorkspaceName, updateWorkspace } from '../workspace.js'
import { CalcError, type MathArgs, type Outcome } from './shared.js'

/**
 * `formula-table`：管理工作区的公式表。
 *
 * 每个工作区有自己的公式表 —— 这是数据隔离的一部分。
 * 支持：覆盖现有公式的表达式/参数、停用公式、新增自定义公式。
 * 公式里的常量会**自动跟随本工作区的常数表**。
 */
export function opFormulaTable(args: MathArgs, engine: any): Outcome {
  const action = (args.tableAction ?? 'show').trim().toLowerCase()
  const workspaceName = normalizeWorkspaceName(args.workspace ?? currentWorkspace())
  const workspace = loadWorkspace(workspaceName)
  const table: WorkspaceFormulaTable = workspace.formulaTable ?? emptyFormulaTable()
  const lines: string[] = []

  const save = (next: WorkspaceFormulaTable, message: string): Outcome => {
    updateWorkspace(workspaceName, (current) => ({ ...current, formulaTable: next }))
    const materialized = materializeFormulas(next, workspace.constants)
    const applied = materialized.appliedConstants
    const extra = applied.length > 0 ? '  常量已跟随本工作区: ' + applied.join(', ') : ''
    return {
      result:
        message +
        '\n  工作区: ' + workspaceName +
        '\n  当前生效公式数: ' + materialized.formulas.length +
        (extra ? '\n  ' + extra : ''),
      value: toJsonValue({
        workspace: workspaceName,
        formulaTable: next,
        effectiveCount: materialized.formulas.length,
        appliedConstants: applied,
      }),
    }
  }

  switch (action) {
    case 'show':
    case 'list': {
      const materialized = materializeFormulas(table, workspace.constants)
      lines.push('工作区公式表: ' + workspaceName)
      lines.push('')
      lines.push('  公式总数: ' + materialized.formulas.length + ' 条')
      lines.push('    模板公式: ' + FORMULAS.length + ' 条')
      lines.push('    被覆盖: ' + table.overrides.filter((o) => !o.disabled).length + ' 条')
      lines.push('    被停用: ' + table.overrides.filter((o) => o.disabled).length + ' 条')
      lines.push('    自定义: ' + table.custom.length + ' 条')
      if (materialized.appliedConstants.length > 0) {
        lines.push('  常量已跟随本工作区常数表: ' + materialized.appliedConstants.join(', '))
      }
      lines.push('')

      if (table.overrides.length > 0) {
        lines.push('【覆盖与停用】')
        for (const override of table.overrides) {
          const template = FORMULAS.find((f) => f.id === override.id)
          const parts: string[] = []
          if (override.disabled) parts.push('停用')
          if (override.expression) parts.push('表达式: ' + override.expression)
          if (override.params) {
            parts.push(
              '参数: ' +
                Object.entries(override.params)
                  .map(([k, v]) => k + '=' + (v === null ? '必填' : v))
                  .join(', '),
            )
          }
          lines.push('  ' + override.id.padEnd(24) + (parts.join(' | ') || '仅改名称/说明'))
          if (template && override.expression) {
            lines.push('  ' + ''.padEnd(24) + '模板原式: ' + template.expr)
          }
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

      if (table.overrides.length === 0 && table.custom.length === 0) {
        lines.push('（本工作区还没有改动任何公式，使用全局模板）')
      }

      return {
        result: lines.join('\n'),
        value: toJsonValue({
          workspace: workspaceName,
          formulaTable: table,
          effectiveCount: materialized.formulas.length,
        }),
      }
    }

    case 'override':
    case 'set': {
      if (!args.formulaId) throw new CalcError('invalid_argument', '需要 formulaId 指明覆盖哪条公式')
      const targetId = String(args.formulaId)

      const launchOverride: FormulaOverride = { id: targetId }
      if (typeof args.newExpression === 'string' && args.newExpression.trim() !== '') {
        launchOverride.expression = args.newExpression.trim()
      }
      if (args.newParams && typeof args.newParams === 'object') {
        launchOverride.params = args.newParams
      }
      if (!launchOverride.expression && !launchOverride.params) {
        throw new CalcError('invalid_argument', '需要 newExpression 或 newParams 至少给一个')
      }

      const template = FORMULAS.find((f) => f.id === targetId)
      if (template && launchOverride.expression) {
        const paramNames = Object.keys(template.params)
        const issue = validateExpression(engine, launchOverride.expression, paramNames)
        if (issue) {
          throw new CalcError('invalid_argument', issue, '表达式只能用该公式已声明的参数名，或已知常数。')
        }
      }

      const result = upsertOverride(table, launchOverride)
      if (result.table === table && result.message.includes('没有')) {
        throw new CalcError('unknown_formula', result.message)
      }
      return save(result.table, '✓ ' + result.message)
    }

    case 'remove':
    case 'unoverride': {
      if (!args.formulaId) throw new CalcError('invalid_argument', '需要 formulaId')
      const targetId = String(args.formulaId)
      const customResult = removeCustomFormula(table, targetId)
      if (customResult.table.custom.length < table.custom.length) {
        return save(customResult.table, '✓ ' + customResult.message)
      }
      const overrideResult = removeOverride(table, targetId)
      return save(overrideResult.table, '✓ ' + overrideResult.message)
    }

    case 'add':
    case 'add-custom': {
      const definition = args.customFormula
      if (!definition || typeof definition !== 'object') {
        throw new CalcError(
          'invalid_argument',
          '需要 customFormula 定义新公式',
          '例如 {"id":"my_force","name":"我的力","expression":"k*x","params":{"k":{"value":2,"desc":"刚度"},"x":{"value":null,"desc":"位移"}}}',
        )
      }
      if (typeof definition.id !== 'string' || definition.id.trim() === '') {
        throw new CalcError('invalid_argument', 'customFormula.id 必须是非空字符串')
      }
      if (typeof definition.expression !== 'string' || definition.expression.trim() === '') {
        throw new CalcError('invalid_argument', 'customFormula.expression 必须是非空字符串')
      }

      const params: CustomFormula['params'] = {}
      if (definition.params && typeof definition.params === 'object') {
        for (const entry of Object.entries(definition.params)) {
          const name = entry[0]
          const spec = entry[1] as { value?: number | null; desc?: string } | undefined
          const value =
            spec && typeof spec.value === 'number' && Number.isFinite(spec.value) ? spec.value : null
          params[name] = { value, desc: spec && typeof spec.desc === 'string' ? spec.desc : '' }
        }
      }

      const issue = validateExpression(engine, definition.expression, Object.keys(params))
      if (issue) {
        throw new CalcError(
          'invalid_argument',
          issue,
          '表达式只能用已声明的参数名，或已知物理常数（如 G、c、kB）。',
        )
      }

      const custom: CustomFormula = {
        id: definition.id.trim(),
        name:
          typeof definition.name === 'string' && definition.name.trim()
            ? definition.name.trim()
            : definition.id.trim(),
        category:
          typeof definition.category === 'string' && definition.category.trim()
            ? definition.category.trim()
            : 'custom',
        expression: definition.expression.trim(),
        params,
        unit: typeof definition.unit === 'string' ? definition.unit : undefined,
        description: typeof definition.description === 'string' ? definition.description : undefined,
        keys: Array.isArray(definition.keys) ? definition.keys : undefined,
      }

      const result = addCustomFormula(table, custom)
      if (result.table === table) {
        throw new CalcError('invalid_argument', result.message)
      }
      return save(result.table, '✓ ' + result.message)
    }

    case 'disable': {
      if (!args.formulaId) throw new CalcError('invalid_argument', '需要 formulaId')
      const targetId = String(args.formulaId)
      const existing = table.overrides.find((o) => o.id === targetId)
      const next: FormulaOverride = existing
        ? { ...existing, disabled: true }
        : { id: targetId, disabled: true }
      const result = upsertOverride(table, next)
      return save(result.table, '✓ 已停用公式 "' + targetId + '"')
    }

    case 'enable': {
      if (!args.formulaId) throw new CalcError('invalid_argument', '需要 formulaId')
      const targetId = String(args.formulaId)
      const existing = table.overrides.find((o) => o.id === targetId)
      if (!existing) {
        return save(table, '公式 "' + targetId + '" 本来就没被停用')
      }
      const next: FormulaOverride = { ...existing }
      delete next.disabled
      const hasOther = next.expression || next.params || next.name || next.description
      const result = hasOther ? upsertOverride(table, next) : removeOverride(table, targetId)
      return save(result.table, '✓ 已启用公式 "' + targetId + '"')
    }

    case 'reset': {
      return save(emptyFormulaTable(), '✓ 已清空工作区 "' + workspaceName + '" 的公式表（恢复全局模板）')
    }

    default:
      throw new CalcError(
        'invalid_argument',
        '不认识的公式表动作 "' + action + '"',
        '可用: show / override / remove / add / disable / enable / reset',
      )
  }
}
