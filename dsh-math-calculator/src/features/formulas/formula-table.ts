/**
 * 工作区公式表：覆盖、停用、自定义公式。
 *
 * ## 与全局公式库的关系
 *
 * 全局 665 条是模板；工作区的表只存**差异**（覆盖/停用/新增）。
 * 调用公式时把两者物化成"这个世界的公式列表"。
 *
 * ## 常量自动绑定
 *
 * 参数默认值若是某个常数（默认值 == 该常数现实值），就改用工作区的常数表。
 * 否则改了 G 之后，公式里的 G 还是老值——那是最隐蔽的一类错。
 *
 * @module dsh-math-calculator/features/formulas/formula-table
 */

/** 公式定义（与 `data/formulas.json` 同形）。 */
export interface FormulaDef {
  id: string
  cat: string
  name: string
  expr: string
  params: Record<string, { value: number | null; desc: string }>
  unit: string
  desc: string
  keys?: string[]
}

/** 覆盖条目。 */
export interface FormulaOverride {
  id: string
  expression?: string
  params?: Record<string, number | null>
  name?: string
  description?: string
  disabled?: boolean
}

/** 自定义公式。 */
export interface CustomFormula {
  id: string
  name: string
  category: string
  expression: string
  params: Record<string, { value: number | null; desc: string }>
  unit?: string
  description?: string
  keys?: string[]
}

/** 工作区公式表。 */
export interface WorkspaceFormulaTable {
  overrides: FormulaOverride[]
  custom: CustomFormula[]
}

/** 空表。 */
export function emptyFormulaTable(): WorkspaceFormulaTable {
  return { overrides: [], custom: [] }
}

/** 参数默认值是否绑定到某个常数。 */
function isConstantBound(name: string, defaultValue: number, standardConstants: Record<string, number>): boolean {
  const reference = standardConstants[name]
  if (reference === undefined || reference === 0) return false
  return Math.abs(defaultValue - reference) / Math.abs(reference) < 1e-9
}

/**
 * 物化：模板 + 覆盖 + 常量绑定 + 自定义。
 *
 * @param table - 工作区表
 * @param baseFormulas - 全局模板
 * @param workspaceConstants - 本工作区常数覆盖
 * @param standardConstants - 常数现实值（用于判断「是否绑定」）
 * @returns 生效公式与已绑定常量
 */
export function materializeFormulas(
  table: WorkspaceFormulaTable | undefined,
  baseFormulas: FormulaDef[],
  workspaceConstants: Record<string, number> = {},
  standardConstants: Record<string, number> = {},
): { formulas: FormulaDef[]; appliedConstants: string[] } {
  const effectiveConstants = { ...standardConstants, ...workspaceConstants }
  const applied = new Set<string>()
  const overrideIndex = new Map<string, FormulaOverride>()
  for (const override of table?.overrides ?? []) if (typeof override?.id === 'string') overrideIndex.set(override.id, override)

  const formulas: FormulaDef[] = []
  for (const template of baseFormulas) {
    const override = overrideIndex.get(template.id)
    if (override?.disabled) continue

    const params: FormulaDef['params'] = {}
    for (const [name, spec] of Object.entries(template.params ?? {})) params[name] = { value: spec.value, desc: spec.desc }
    if (override?.params) {
      for (const [name, newDefault] of Object.entries(override.params)) {
        if (!params[name]) continue
        params[name] = { value: newDefault, desc: params[name].desc }
      }
    }
    for (const [name, spec] of Object.entries(params)) {
      if (spec.value === null || !isConstantBound(name, spec.value, standardConstants)) continue
      const value = effectiveConstants[name]
      if (value === undefined || value === spec.value) continue
      params[name] = { value, desc: spec.desc }
      applied.add(name)
    }
    formulas.push({
      ...template,
      expr: override?.expression ?? template.expr,
      name: override?.name ?? template.name,
      desc: override?.description ?? template.desc,
      params,
    })
  }

  for (const custom of table?.custom ?? []) {
    formulas.push({
      id: custom.id,
      cat: custom.category ?? 'custom',
      name: custom.name,
      expr: custom.expression,
      params: custom.params,
      unit: custom.unit ?? '',
      desc: custom.description ?? '',
      keys: custom.keys,
    })
  }
  return { formulas, appliedConstants: [...applied] }
}

/** 结果。 */
export interface FormulaTableResult {
  table: WorkspaceFormulaTable
  message: string
}

/** 覆盖一条公式。 */
export function upsertOverride(table: WorkspaceFormulaTable, override: FormulaOverride, baseFormulas: FormulaDef[]): FormulaTableResult {
  if (!baseFormulas.some((formula) => formula.id === override.id)) {
    return { table, message: '没有 id 为 "' + override.id + '" 的公式' }
  }
  const next: WorkspaceFormulaTable = { overrides: table.overrides.filter((item) => item.id !== override.id), custom: [...table.custom] }
  next.overrides.push(override)
  return {
    table: next,
    message: override.disabled ? '已停用公式 "' + override.id + '"' : '已覆盖公式 "' + override.id + '"（表达式' + (override.expression ? '已替换' : '未改') + '，参数' + (override.params ? '已调整' : '未改') + '）',
  }
}

/** 移除覆盖。 */
export function removeOverride(table: WorkspaceFormulaTable, id: string): FormulaTableResult {
  const before = table.overrides.length
  const next: WorkspaceFormulaTable = { overrides: table.overrides.filter((item) => item.id !== id), custom: [...table.custom] }
  return { table: next, message: next.overrides.length < before ? '已移除公式 "' + id + '" 的覆盖' : '"' + id + '" 本来就没有覆盖' }
}

/** 新增自定义公式。 */
export function addCustomFormula(table: WorkspaceFormulaTable, formula: CustomFormula, baseFormulas: FormulaDef[]): FormulaTableResult {
  if (baseFormulas.some((item) => item.id === formula.id) || table.custom.some((item) => item.id === formula.id)) {
    return { table, message: '公式 id "' + formula.id + '" 已存在' }
  }
  return { table: { overrides: [...table.overrides], custom: [...table.custom, formula] }, message: '已新增自定义公式 "' + formula.id + '"' }
}

/** 删除自定义公式。 */
export function removeCustomFormula(table: WorkspaceFormulaTable, id: string): FormulaTableResult {
  const before = table.custom.length
  const next: WorkspaceFormulaTable = { overrides: [...table.overrides], custom: table.custom.filter((item) => item.id !== id) }
  return { table: next, message: next.custom.length < before ? '已删除自定义公式 "' + id + '"' : '"' + id + '" 不是自定义公式' }
}

/**
 * 校验表达式只能用已声明的参数名（或数学函数）。
 *
 * @param math - mathjs 实例
 * @param expression - 表达式
 * @param paramNames - 允许的参数名
 * @returns 错误说明；通过返回 undefined
 */
export function validateExpression(math: { parse: (source: string) => unknown }, expression: string, paramNames: string[]): string | undefined {
  let node: unknown
  try {
    node = math.parse(expression)
  } catch (error) {
    return '表达式语法错误：' + (error instanceof Error ? error.message : String(error))
  }
  const allowed = new Set(paramNames)
  const unknown = new Set<string>()
  const visit = (current: any): void => {
    if (current === null || typeof current !== 'object') return
    if (current.type === 'SymbolNode') {
      const name = String(current.name)
      if (!allowed.has(name) && !(name in (math as unknown as Record<string, unknown>))) unknown.add(name)
    }
    for (const key of Object.keys(current)) {
      if (key === 'parent' || key === 'name') continue
      visit(current[key])
    }
  }
  visit(node)
  if (unknown.size > 0) return '表达式里有未声明的变量：' + [...unknown].join('、') + '（只能用该公式的参数名）'
  return undefined
}
