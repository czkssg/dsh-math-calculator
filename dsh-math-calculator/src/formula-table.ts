/**
 * 工作区级的公式表。
 *
 * 需求背景：
 *   公式里有大量内嵌常量（`gravitation` 的 G、`lorentz_factor` 的 c…）。
 *   在世界观推演中，这些常量是**改过**的，所以公式里的常量也必须跟着改。
 *   同时每个世界可能需要**自己的一套公式**（改结构、加新公式）。
 *
 * 设计：
 *   1. **公式表跟着工作区走**（数据隔离），不同世界互不影响
 *   2. 三种操作：
 *        override  —— 改现有公式的表达式（结构级改造）
 *        param     —— 改某条公式的参数默认值
 *        custom    —— 新增整个公式
 *   3. **常量自动绑定**：若某个参数的默认值等于某常数，且本工作区改过该常数，
 *      则自动使用工作区的常数，而不是写死的现实值。
 *
 * 为什么不能只依赖全局 FORMULAS：
 *   全局表是"现实宇宙的公式库"。工作区的公式表是"这个世界的公式库"。
 *   两者是「模板 : 实例」关系，不能互相污染。
 *
 * @module dsh-math-calculator/formula-table
 */

import { FORMULAS, type FormulaDef } from './formulas.js'
import { getActiveConstants, standardValues } from './constants-graph.js'

/** 公式覆盖条目。 */
export interface FormulaOverride {
  /** 目标公式 id。 */
  id: string
  /** 替换表达式（不填则保留原表达式）。 */
  expression?: string
  /** 参数默认值覆盖：参数名 → 新默认值。传 null 表示改为必填。 */
  params?: Record<string, number | null>
  /** 名称覆盖。 */
  name?: string
  /** 说明覆盖。 */
  description?: string
  /** 是否停用该公式。 */
  disabled?: boolean
}

/** 自定义公式（完整定义）。 */
export interface CustomFormula {
  id: string
  name: string
  category: string
  expression: string
  /** 参数：名字 → { 默认值（null=必填）, 说明 }。 */
  params: Record<string, { value: number | null; desc: string }>
  unit?: string
  description?: string
  /** 检索关键词。 */
  keys?: string[]
}

/** 一个工作区的公式表。 */
export interface WorkspaceFormulaTable {
  /** 覆盖现有公式。 */
  overrides: FormulaOverride[]
  /** 本工作区独有的新公式。 */
  custom: CustomFormula[]
}

/** 空表。 */
export function emptyFormulaTable(): WorkspaceFormulaTable {
  return { overrides: [], custom: [] }
}

/**
 * 判断某个参数的默认值是否「绑定」到某个常数。
 *
 * 判据：默认值与该常数的现实值相等（相对误差 < 1e-9）。
 * 这类参数不是"用户随便填的数"，而是"这里的常量"，
 * 所以必须跟随工作区的常数表，而不是写死。
 */
function isConstantBound(paramName: string, defaultValue: number, standardConstants: Record<string, number>): boolean {
  const reference = standardConstants[paramName]
  if (reference === undefined || reference === 0) return false
  return Math.abs(defaultValue - reference) / Math.abs(reference) < 1e-9
}

/**
 * 把工作区的公式表「物化」成这个世界的实际公式列表。
 *
 * 处理顺序：
 *   1. 拿全局公式库作为模板
 *   2. 应用 overrides（改表达式 / 改参数 / 停用）
 *   3. **常量自动绑定**：参数默认值若是常量，改用工作区的值
 *   4. 追加 custom 新公式
 *
 * @param table - 工作区的公式表
 * @param workspaceConstants - 该工作区的常数（可空，空则用现实值）
 * @returns 这个世界的公式列表
 */
export function materializeFormulas(
  table: WorkspaceFormulaTable | undefined,
  workspaceConstants: Record<string, number> = {},
): { formulas: FormulaDef[]; appliedConstants: string[] } {
  const standardConstants = standardValues()
  const effectiveConstants = { ...standardConstants, ...workspaceConstants }
  const appliedConstants = new Set<string>()

  const overrideIndex = new Map<string, FormulaOverride>()
  for (const override of table?.overrides ?? []) {
    if (override && typeof override.id === 'string') overrideIndex.set(override.id, override)
  }

  const formulas: FormulaDef[] = []

  for (const template of FORMULAS) {
    const override = overrideIndex.get(template.id)
    if (override?.disabled) continue

    // 参数：先复制模板，再应用 override，最后做常量绑定
    const params: FormulaDef['params'] = {}
    for (const [name, spec] of Object.entries(template.params)) {
      params[name] = { value: spec.value, desc: spec.desc }
    }

    if (override?.params) {
      for (const [name, newDefault] of Object.entries(override.params)) {
        if (!params[name]) continue
        params[name] = { value: newDefault, desc: params[name].desc }
      }
    }

    // ── 常量自动绑定 ──
    // 这是核心：如果某个参数默认值本来就是常量，就换成工作区的值。
    for (const [name, spec] of Object.entries(params)) {
      if (spec.value === null) continue
      if (!isConstantBound(name, spec.value, standardConstants)) continue
      const effective = effectiveConstants[name]
      if (effective === undefined || effective === spec.value) continue
      params[name] = { value: effective, desc: spec.desc }
      appliedConstants.add(name)
    }

    formulas.push({
      ...template,
      name: override?.name ?? template.name,
      desc: override?.description ?? template.desc,
      expr: override?.expression?.trim() ? override.expression.trim() : template.expr,
      params,
    })
  }

  // ── 追加自定义公式 ──
  for (const custom of table?.custom ?? []) {
    if (!custom || typeof custom.id !== 'string' || typeof custom.expression !== 'string') continue
    if (formulas.some((f) => f.id === custom.id)) continue // 不覆盖同名

    const params: FormulaDef['params'] = {}
    for (const [name, spec] of Object.entries(custom.params ?? {})) {
      if (!spec || typeof spec !== 'object') continue
      const value = typeof spec.value === 'number' && Number.isFinite(spec.value) ? spec.value : null
      params[name] = { value, desc: typeof spec.desc === 'string' ? spec.desc : '' }
    }

    // 自定义公式也做常量绑定
    for (const [name, spec] of Object.entries(params)) {
      if (spec.value === null) continue
      if (!isConstantBound(name, spec.value, standardConstants)) continue
      const effective = effectiveConstants[name]
      if (effective === undefined || effective === spec.value) continue
      params[name] = { value: effective, desc: spec.desc }
      appliedConstants.add(name)
    }

    formulas.push({
      id: custom.id,
      cat: custom.category || 'custom',
      name: custom.name || custom.id,
      expr: custom.expression,
      params,
      unit: custom.unit,
      desc: custom.description ?? '(本工作区自定义公式)',
      keys: Array.isArray(custom.keys) ? custom.keys : [],
    })
  }

  return { formulas, appliedConstants: [...appliedConstants] }
}

/** 公式表操作结果。 */
export interface FormulaTableResult {
  table: WorkspaceFormulaTable
  message: string
}

/** 校验表达式是否能被 mathjs 解析（不做求值）。 */
export function validateExpression(math: any, expression: string, paramNames: string[]): string | undefined {
  if (typeof expression !== 'string' || expression.trim() === '') return '表达式为空'
  try {
    const node = math.parse(expression)
    // 检查用到的符号是否都在参数表里（排除已知常数与函数名）
    const known = new Set([...paramNames, ...Object.keys(standardValues()), ...Object.keys(getActiveConstants())])
    const missing: string[] = []
    node.traverse((current: any) => {
      if (!current) return
      if (current.type === 'SymbolNode') {
        const symbol = String(current.name ?? '')
        if (symbol === '') return
        if (!known.has(symbol)) missing.push(symbol)
      }
    })
    if (missing.length > 0) {
      return `表达式里用了未声明的符号: ${[...new Set(missing)].join(', ')}`
    }
    return undefined
  } catch (error) {
    return `表达式解析失败: ${error instanceof Error ? error.message : String(error)}`
  }
}

/** 新建一个覆盖条目（校验后返回新表）。 */
export function upsertOverride(
  table: WorkspaceFormulaTable,
  override: FormulaOverride,
): FormulaTableResult {
  if (!FORMULAS.some((f) => f.id === override.id)) {
    return { table, message: `没有 id 为 "${override.id}" 的公式` }
  }
  const next: WorkspaceFormulaTable = {
    overrides: table.overrides.filter((o) => o.id !== override.id),
    custom: [...table.custom],
  }
  next.overrides.push(override)
  return {
    table: next,
    message: override.disabled
      ? `已停用公式 "${override.id}"`
      : `已覆盖公式 "${override.id}"（表达式${override.expression ? '已替换' : '未改'}，参数${override.params ? '已调整' : '未改'}）`,
  }
}

/** 移除一个覆盖条目（恢复模板）。 */
export function removeOverride(table: WorkspaceFormulaTable, id: string): FormulaTableResult {
  const before = table.overrides.length
  const next: WorkspaceFormulaTable = {
    overrides: table.overrides.filter((o) => o.id !== id),
    custom: [...table.custom],
  }
  return {
    table: next,
    message: next.overrides.length < before ? `已移除公式 "${id}" 的覆盖` : `"${id}" 本来就没有覆盖`,
  }
}

/** 新增自定义公式。 */
export function addCustomFormula(
  table: WorkspaceFormulaTable,
  formula: CustomFormula,
): FormulaTableResult {
  if (FORMULAS.some((f) => f.id === formula.id) || table.custom.some((f) => f.id === formula.id)) {
    return { table, message: `公式 id "${formula.id}" 已存在` }
  }
  const next: WorkspaceFormulaTable = {
    overrides: [...table.overrides],
    custom: [...table.custom, formula],
  }
  return { table: next, message: `已新增自定义公式 "${formula.id}"` }
}

/** 删除自定义公式。 */
export function removeCustomFormula(table: WorkspaceFormulaTable, id: string): FormulaTableResult {
  const before = table.custom.length
  const next: WorkspaceFormulaTable = {
    overrides: [...table.overrides],
    custom: table.custom.filter((f) => f.id !== id),
  }
  return {
    table: next,
    message: next.custom.length < before ? `已删除自定义公式 "${id}"` : `没有自定义公式 "${id}"`,
  }
}
