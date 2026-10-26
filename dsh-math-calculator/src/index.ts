/**
 * dsh-math-calculator v2 — DSH 原生高阶数学计算插件
 * ============================================================================
 *
 * 定位：世界观推演时的「可计算部分」执行器。主模型负责想象力与概念建模，
 * 本插件接管一切可以用算法求解的数学运算，保证精确、省 token、本地无延迟。
 *
 * 设计要点
 * --------
 * 1. **用官方 `defineTool`**：与 DSH 社区成熟插件同一套写法，schema 编译 /
 *    参数校验 / 错误包装交给 `@deepseek-ai/dsh-tools`，不会碰到废弃的 `CallId`。
 * 2. **BigNumber 高精度**：默认 64 位有效数字，整数输出走 `notation:'fixed'`，
 *    否则 `50!` 会显示成 `3.04e+64`，看着像近似值（实际精确）。
 * 3. **符号能力补齐**：mathjs 没有符号积分，接 Algebrite；求导双引擎兜底。
 * 4. **方程组**：自然写法 `3x + 2y = 10, x - y = 1` → 系数矩阵 → 精确 lusolve。
 * 5. **缺失能力自研**：概率分布、线性/多项式回归、特征值整理，mathjs 都没有。
 * 6. **绝不把宿主搞挂**：所有可预期错误转成 `{ ok: false, error }`，
 *    `execute()` 自身永不 reject（参数校验层的 ToolArgsError 除外，那是宿主契约）。
 *
 * @module dsh-math-calculator
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'

import { nullspaceOf, rankOf, singularValuesOf } from './numeric.js'
import { ambiguousSymbols, explainSymbol, symbolMeanings } from './symbols.js'
import {
  DOMAINS,
  DOMAIN_NAMES,
  LAYERS,
  domainCounts,
  domainsOf,
  formulasByDomain,
  formulasByLayer,
  layerCounts,
  layerOf,
} from './taxonomy.js'
import {
  containsNonFinite,
  formatValue,
  isIntegerLike,
  toFiniteNumber,
  toJsonValue,
  unwrapResult,
  type JsonValue,
} from './format.js'
import {
  describe,
  binomialCdf,
  binomialPmf,
  chiSquareCdf,
  exponentialCdf,
  linearRegression,
  normalCdf,
  normalInv,
  normalPdf,
  poissonCdf,
  poissonPmf,
  polynomialRegression,
  quantile,
  studentTCdf,
} from './stats.js'
import {
  SymbolicError,
  symbolicDerivative,
  symbolicExpand,
  symbolicIntegral,
  symbolicRoots,
  symbolicRootsWithComplex,
  symbolicSimplify,
} from './symbolic.js'
import {
  extractVariables,
  parseLinearEquation,
  solveLinearSystem_,
  splitEquations,
  type KnownValues,
} from './systems.js'
import {
  CONSTANTS,
  FormulaError,
  buildFormulaScope,
  describeFormula,
  findFormulas,
  formulaFrequency,
  listFormulasByFrequency,
  listFormulaCategories,
  resolveExpression,
  resolveParams,
  resolveFormulaStrict,
  scoreFormulas,
  type FormulaDef,
} from './formulas.js'
import { BUILTINS } from './formula-builtins.js'
import {
  OdeError,
  parseOdeSystem,
  solveOde,
  type OdeSolution,
} from './ode.js'
import { generateWorld, type WorldParams, type WorldProfile } from './world.js'
import { describeTerrain, type TerrainParams, type TerrainClimatology } from './terrain.js'
import {
  CONSTANT_GRAPH,
  FUNDAMENTAL_NAMES,
  getActiveConstants,
  recalculateConstants,
  resetActiveConstants,
  setActiveConstants,
  standardValues,
  type ConstantRecalculation,
} from './constants-graph.js'
import { analyzeConsequences } from './consequences.js'
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
  bindHostWorkspace,
  cwdOfExec,
  cwdOfSession,
  scopeFromCwd,
  setLastExecShape,
  switchWorkspace,
  updateWorkspace,
  workspaceDirectory,
  type SavedTerrain,
  type WorkspaceData,
} from './workspace.js'
import { buildApiRoutes } from './api.js'
import { assessImpact, type ImpactLevel } from './impact.js'
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
} from './formula-table.js'
import { FORMULAS } from './formulas.js'
import {
  TOOL_DESCRIPTION,
  buildSystemPromptSection,
  getPromptMode,
  setPromptMode,
  suggestOperation,
} from './awareness.js'
import {
  buildReminderMessage,
  detectMathNeed,
  recordPrompt,
  resetDetectionState,
  shouldPromptNow,
  type DetectorConfig,
} from './detector.js'
import {
  CONSTRAINTS,
  checkFeasibility,
  deriveConstraintContext,
  type ConstraintResult,
} from './feasibility.js'
import { setActiveConstants as setConstantsForDetection } from './constants-graph.js'
import type { FormulaDef as FormulaType } from './formula-library.js'
import {
  CATEGORY_LABEL,
  QUANTITIES,
  QUANTITY_INDEX,
  computeQuantities,
  scalingExponent,
  type QuantityCategory,
} from './quantities.js'

import {
  CalcError,
  bignum,
  fast,
  normalizeSource,
  safeNumberForJson,
  trimNumber,
  type MathArgs,
  type MathOperation,
  type Outcome,
} from './ops/shared.js'
import { opOde } from './ops/ode-op.js'
import { opWorld } from './ops/world-op.js'
import { opConstants } from './ops/constants-op.js'
import { opWorkspace } from './ops/workspace-op.js'
import { opImpact } from './ops/impact-op.js'
import { opQuantities } from './ops/quantities-op.js'
import { opFormulaTable } from './ops/formula-table-op.js'
import { opFeasibility } from './ops/feasibility-op.js'
import { opDerivation } from './ops/derivation-op.js'
import { opCustom } from './ops/custom-op.js'
import { opUnits } from './ops/units-op.js'
import { opBalance } from './ops/balance-op.js'

// ────────────────────────────────────────────────────────────────────────────
// 类型
// ────────────────────────────────────────────────────────────────────────────

// 公开类型从 ops/shared.ts 再导出，保持 index.ts 的对外 API 不变。
/** 对外再导出 operation 联合类型：调用方只需从入口 import。 */
export type { MathOperation } from './ops/shared.js'

/**
 * 工具执行结果（模型与 UI 都读这个）。
 *
 * ok=false 时 result 里是结构化错误文本，error 字段给出 type/message/hint；
 * **任何情况下都不抛异常**，保证模型不会因为一次坏输入中断整轮对话。
 */
export interface MathResult {
  ok: boolean
  operation: string
  input: string
  result: string
  precision: number
  value?: JsonValue
  variables?: { [key: string]: JsonValue }
  error?: { type: string; message: string; hint?: string }
}

// ────────────────────────────────────────────────────────────────────────────
// 常量
// ────────────────────────────────────────────────────────────────────────────

const TOOL_NAME = 'math_execute'
const PLUGIN_NAME = 'dsh-math-calculator'
/** 检测器可运行时调整（通过 promptMode 之外的 detectorConfig 参数）。 */
let detectorConfig: Partial<DetectorConfig> = {}

/** 更新检测器配置。 */
export function configureDetector(config: Partial<DetectorConfig>): Partial<DetectorConfig> {
  detectorConfig = { ...detectorConfig, ...config }
  return detectorConfig
}

const DEFAULT_PRECISION = 64
const MIN_PRECISION = 1
const MAX_PRECISION = 256
const DEFAULT_VARIABLE = 'x'
const MAX_INPUT_LENGTH = 4_000
/**
 * 矩阵规模上限。
 * 实测 100×100 的特征值分解约 270ms、行列式约 28ms，
 * 150×150 行列式约 95ms —— 放宽到 200 仍能在亚秒级完成，
 * 留给「世界观推演」足够大的复杂网络。再大就接近 1~2 秒，性价比下降。
 */
const MAX_MATRIX_SIZE = 200

const OPERATIONS: readonly MathOperation[] = [
  'auto',
  'evaluate',
  'solve',
  'system',
  'derivative',
  'integral',
  'simplify',
  'expand',
  'roots',
  'matrix',
  'eigen',
  'stats',
  'dist',
  'regression',
  'formula',
  'formulas',
  'ode',
  'world',
  'constants',
  'workspace',
  'impact',
  'quantities',
  'formula-table',
  'feasibility',
  'derivation',
  'custom',
  'units',
  'balance',
  'help',
]

/** 禁用标识符（防止把宿主全局塞进表达式）。 */
const FORBIDDEN_SYMBOLS = new Set([
  'import',
  'createUnit',
  'eval',
  'Function',
  'globalThis',
  'global',
  'process',
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename',
  '__proto__',
  'prototype',
  'constructor',
])

/** 危险属性访问。 */
const FORBIDDEN_PROPERTIES = new Set([
  'constructor',
  '__proto__',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'call',
  'apply',
  'bind',
])

/** 有资源风险的函数 → 常量参上限。 */
const RISKY_FUNCTION_LIMITS = new Map<string, number>([
  ['factorial', 100_000],
  ['gamma', 100_000],
  ['combinations', 1_000_000],
  ['permutations', 10_000_000],
  ['range', 1_000_000],
])

// ────────────────────────────────────────────────────────────────────────────
// 错误
// ────────────────────────────────────────────────────────────────────────────

/** 把任意异常翻译成带类型的 CalcError。 */
function translateError(raw: unknown, fallbackType = 'internal'): CalcError {
  if (raw instanceof CalcError) return raw
  if (raw instanceof SymbolicError) {
    return new CalcError(raw.stage, raw.message, '符号引擎的能力有限，可尝试 operation="integral" 配数值区间。')
  }
  const message = raw instanceof Error ? raw.message : String(raw ?? '未知错误')
  const text = message.trim() || '未知错误'

  if (/Undefined symbol/i.test(text)) {
    return new CalcError('unknown_symbol', text, '先定义变量，或通过 variables 参数传入，例如 {"m": 500}。')
  }
  if (/Unexpected end of expression|Value expected|Parenthesis|Invalid left hand side|SyntaxError|Unexpected operator/i.test(text)) {
    return new CalcError('syntax', text, '检查括号是否配对、运算符是否连续。')
  }
  if (/Units do not match|Cannot convert|not found.*unit/i.test(text)) {
    return new CalcError('unit_mismatch', text, '两侧单位必须同量纲。')
  }
  if (/Dimension mismatch|Size mismatch|dimensions mismatch|Matrix must be/i.test(text)) {
    return new CalcError('dimension', text, '检查矩阵维度是否匹配。')
  }
  if (/singular|接近奇异|无唯一解/i.test(text)) {
    return new CalcError('singular', text, '矩阵不可逆或方程组无唯一解。')
  }
  if (/no access to property|Property .* not found|Cannot read properties of (?:null|undefined)/i.test(text)) {
    return new CalcError('forbidden', text, '该属性访问不被允许。')
  }
  if (/Cannot create function|some dependencies are missing|Unknown function|is not a function/i.test(text)) {
    return new CalcError('unsupported', text, '该函数不受支持，可用 operation="help" 查看能力清单。')
  }
  if (/maximum call stack|out of memory|Invalid array length/i.test(text)) {
    return new CalcError('limit', text, '规模超出限制，请缩小输入。')
  }
  return new CalcError(fallbackType, text)
}

// ────────────────────────────────────────────────────────────────────────────
// AST 安全校验
// ────────────────────────────────────────────────────────────────────────────

function guardAst(node: any): void {
  if (!node || typeof node.traverse !== 'function') return
  node.traverse((current: any) => {
    if (!current) return
    if (current.type === 'SymbolNode') {
      const symbol = String(current.name ?? '')
      if (FORBIDDEN_SYMBOLS.has(symbol)) {
        throw new CalcError('forbidden', `不允许使用标识符 "${symbol}"`, '计算器只接受纯数学表达式。')
      }
      return
    }
    if (current.type === 'AccessorNode') {
      const index = current.index
      const property =
        index?.type === 'ConstantNode'
          ? String(index.value)
          : typeof index?.name === 'string'
            ? index.name
            : String(index ?? '')
      const bare = property.replace(/^["']|["']$/g, '')
      if (FORBIDDEN_PROPERTIES.has(bare)) {
        throw new CalcError('forbidden', `不允许访问属性 "${bare}"`)
      }
      return
    }
    if (current.type === 'ConstantNode' && typeof current.value === 'number' && !Number.isFinite(current.value)) {
      throw new CalcError('invalid_argument', '不允许非有限数值字面量')
    }
  })
}

function guardComplexity(node: any): void {
  if (!node || typeof node.traverse !== 'function') return
  node.traverse((current: any) => {
    if (!current || current.type !== 'FunctionNode') return
    const name = typeof current.fn?.name === 'string' ? current.fn.name : ''
    const limit = RISKY_FUNCTION_LIMITS.get(name)
    if (limit === undefined) return
    for (const argument of current.args ?? []) {
      if (argument?.type === 'ConstantNode' && typeof argument.value === 'number' && Math.abs(argument.value) > limit) {
        throw new CalcError('too_large', `${name}(${argument.value}) 超出安全上限 ${limit}`, '请缩小参数规模。')
      }
    }
  })
}

// ────────────────────────────────────────────────────────────────────────────
// 输入处理
// ────────────────────────────────────────────────────────────────────────────

/** 把 variables 字典转成 mathjs 可用的 scope。 */
function buildScope(engine: any, variables: unknown): Record<string, any> {
  const scope: Record<string, any> = {}
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) return scope
  for (const [key, raw] of Object.entries(variables as Record<string, unknown>)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new CalcError('invalid_argument', `变量名 "${key}" 不合法`, '变量名只能含字母、数字、下划线。')
    }
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) throw new CalcError('invalid_argument', `变量 "${key}" 不是有限数字`)
      scope[key] = engine.bignumber(String(raw))
    } else if (typeof raw === 'string') {
      // 允许字符串形式的大数，例如 "1e100"
      try {
        scope[key] = engine.bignumber(raw.trim())
      } catch {
        throw new CalcError('invalid_argument', `变量 "${key}" 无法解析为数字: ${raw}`)
      }
    } else if (typeof raw === 'boolean') {
      scope[key] = raw
    } else {
      throw new CalcError('invalid_argument', `变量 "${key}" 必须是数字或数字字符串`)
    }
  }
  return scope
}

/** 已知数值（Number 形态），供方程组系数替换。 */
function knownNumbers(variables: unknown): KnownValues {
  const known: KnownValues = {}
  if (!variables || typeof variables !== 'object') return known
  for (const [key, raw] of Object.entries(variables as Record<string, unknown>)) {
    const numeric = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(numeric)) known[key] = numeric
  }
  return known
}

/** 校验并归一化矩阵参数。 */
function normalizeMatrix(source: unknown, label: string): number[][] {
  if (!Array.isArray(source) || source.length === 0) {
    throw new CalcError('invalid_argument', `${label} 必须是二维数字数组`)
  }
  if (source.length > MAX_MATRIX_SIZE) {
    throw new CalcError('too_large', `${label} 行数超过上限 ${MAX_MATRIX_SIZE}`)
  }
  return source.map((row, index) => {
    if (!Array.isArray(row) || row.length === 0) {
      throw new CalcError('invalid_argument', `${label}[${index}] 必须是数字数组`)
    }
    if (row.length > MAX_MATRIX_SIZE) {
      throw new CalcError('too_large', `${label}[${index}] 列数超过上限 ${MAX_MATRIX_SIZE}`)
    }
    return row.map((cell) => {
      const numeric = Number(cell)
      if (!Number.isFinite(numeric)) {
        throw new CalcError('invalid_argument', `${label}[${index}] 含非有限数值`)
      }
      return numeric
    })
  })
}

// ────────────────────────────────────────────────────────────────────────────
// 各 operation 实现
// ────────────────────────────────────────────────────────────────────────────

function opEvaluate(engine: any, expression: string, scope: Record<string, any>, precision: number): Outcome {
  if (expression === '') {
    throw new CalcError('invalid_argument', '表达式为空')
  }
  if (expression.length > MAX_INPUT_LENGTH) {
    throw new CalcError('too_large', `表达式过长（${expression.length} > ${MAX_INPUT_LENGTH}）`)
  }
  let node: any
  try {
    node = engine.parse(expression)
  } catch (error) {
    throw translateError(error, 'syntax')
  }
  guardAst(node)
  guardComplexity(node)

  let raw: any
  try {
    raw = node.evaluate(scope)
  } catch (error) {
    throw translateError(error)
  }

  const value = unwrapResult(raw)
  return {
    result: formatValue(engine, value, precision),
    value: toJsonValue(value),
  }
}

function opDerivative(expression: string, variable: string, precision: number): Outcome {
  const text = normalizeSource(expression)
  if (text === '') throw new CalcError('invalid_argument', '表达式为空')
  let symbolic: string
  try {
    symbolic = symbolicDerivative(text, variable)
  } catch {
    // 退回 mathjs 的求导
    const engine = bignum(precision)
    let node: any
    try {
      node = engine.parse(text)
    } catch (error) {
      throw translateError(error, 'syntax')
    }
    guardAst(node)
    try {
      symbolic = engine.simplify(engine.derivative(node, variable)).toString()
    } catch (error) {
      throw translateError(error)
    }
  }
  return { result: symbolic, value: symbolic }
}

function opIntegral(expression: string, variable: string, precision: number): Outcome {
  const text = normalizeSource(expression)
  if (text === '') throw new CalcError('invalid_argument', '表达式为空')
  const primitive = symbolicIntegral(text, variable)
  return { result: `${primitive} + C`, value: primitive }
}

function opSimplify(expression: string): Outcome {
  const text = normalizeSource(expression)
  if (text === '') throw new CalcError('invalid_argument', '表达式为空')
  const simplified = symbolicSimplify(text)
  return { result: simplified, value: simplified }
}

function opExpand(expression: string): Outcome {
  const text = normalizeSource(expression)
  if (text === '') throw new CalcError('invalid_argument', '表达式为空')
  const expanded = symbolicExpand(text)
  return { result: expanded, value: expanded }
}

function opRoots(expression: string, variable: string, precision: number): Outcome {
  const text = normalizeSource(expression)
  if (text === '') throw new CalcError('invalid_argument', '表达式为空')

  // 优先 Algebrite：它能给出**复数根**，比 mathjs 的 polynomialRoot 强
  // （mathjs 只支持三次及以下，且只返回实数根）。
  let complexRoots: Array<{ re: number; im: number }>
  try {
    complexRoots = symbolicRootsWithComplex(text, variable)
  } catch {
    const engine = bignum(precision)
    let node: any
    try {
      node = engine.parse(text)
    } catch (error) {
      throw translateError(error, 'syntax')
    }
    guardAst(node)
    try {
      const rationalized = engine.rationalize(node.toString(), {}, true)
      complexRoots = (engine.polynomialRoot(...rationalized.coefficients) as any[]).map((value: any) => {
        const numeric = toFiniteNumber(value)
        return numeric === undefined ? { re: Number.NaN, im: Number.NaN } : { re: numeric, im: 0 }
      })
    } catch (error) {
      throw translateError(error)
    }
  }

  // 去重：实部虚部都接近才算重复
  const cleaned = complexRoots
    .map((root) => ({
      re: Math.abs(root.re - Math.round(root.re)) < 1e-9 ? Math.round(root.re) : Number(root.re.toFixed(12)),
      im: Math.abs(root.im) < 1e-9 ? 0 : Number(root.im.toFixed(12)),
    }))
    .filter((root) => Number.isFinite(root.re) && Number.isFinite(root.im))

  const unique: Array<{ re: number; im: number }> = []
  for (const root of cleaned) {
    const duplicate = unique.some(
      (existing) => Math.abs(existing.re - root.re) < 1e-9 && Math.abs(existing.im - root.im) < 1e-9,
    )
    if (!duplicate) unique.push(root)
  }

  if (unique.length === 0) {
    throw new CalcError('no_solution', '没有找到根', '可用 operation="solve" 做数值求根。')
  }

  // 实根在前、复根在后，各自按大小排
  const realRoots = unique.filter((root) => root.im === 0).sort((a, b) => a.re - b.re)
  const complexPairs = unique.filter((root) => root.im !== 0).sort((a, b) => a.re - b.re || a.im - b.im)
  const ordered = [...realRoots, ...complexPairs]

  const render = (root: { re: number; im: number }): string => {
    if (root.im === 0) return `${variable} = ${root.re}`
    const sign = root.im > 0 ? '+' : '-'
    return `${variable} = ${root.re} ${sign} ${Math.abs(root.im)}i`
  }

  const complexCount = complexPairs.length
  const suffix = complexCount > 0 ? `（共 ${ordered.length} 个根，其中 ${complexCount} 个复数）` : ''

  return {
    result: `${suffix ? suffix + '\n' : ''}${ordered.map(render).join('，')}`,
    value: ordered.map((root) => (root.im === 0 ? safeNumberForJson(root.re) : `${root.re}${root.im >= 0 ? '+' : '-'}${Math.abs(root.im)}i`)),
  }
}

/**
 * 解方程：
 * - 多方程（含逗号分隔）→ 线性方程组
 * - 单方程：多项式走精确根，否则数值求根
 */
function opSolve(
  expression: string,
  variable: string,
  known: KnownValues,
  precision: number,
): Outcome {
  const text = normalizeSource(expression)
  if (text === '') throw new CalcError('invalid_argument', '表达式为空')

  const pieces = splitEquations(text)

  // 多方程 → 线性方程组
  if (pieces.length > 1) {
    const equations = pieces
      .map((piece) => parseLinearEquation(piece, known))
      .filter((equation): equation is NonNullable<typeof equation> => equation !== undefined)

    if (equations.length !== pieces.length) {
      throw new CalcError(
        'unsupported',
        '含无法解析为线性的方程',
        'operation="solve" 的方程组目前只支持线性；用 operation="system" 并显式给 matrix/vector 可解任意线性系统。',
      )
    }

    const variables = [...new Set(equations.flatMap((equation) => [...equation.coefficients.keys()]))]
    if (variables.length !== equations.length) {
      throw new CalcError(
        'no_solution',
        `方程数(${equations.length})与未知数(${variables.length})不一致，无法得到唯一解`,
        '请补齐方程，或用 operation="system" 显式给出矩阵。',
      )
    }

    const solution = solveLinearSystem_(equations, variables)
    // 方程数=未知数不代表可解：两行可能线性相关（如 x+y=2, 2x+2y=4），
    // 高斯消元会在奇异时抛错，但接近相关的行仍可能给出无意义的解，这里用残差兜底。
    verifyEquationSolution(equations, variables, solution.values)
    const rendered = variables.map((name, index) => `${name} = ${trimNumber(solution.values[index], precision)}`)
    return {
      result: rendered.join('，'),
      value: Object.fromEntries(variables.map((name, index) => [name, solution.values[index]])),
    }
  }

  // 单方程
  const single = pieces[0]
  if (!single.includes('=')) {
    // 没有等号，视为 f(x) = 0
    return solveSingleEquation(single, variable, known, precision)
  }

  const [left, right] = single.split('=')
  const difference = `(${left.trim()}) - (${right.trim()})`
  return solveSingleEquation(difference, variable, known, precision)
}

/** 解 f(x) = 0：多项式精确，其余数值。 */
function solveSingleEquation(
  expression: string,
  variable: string,
  known: KnownValues,
  precision: number,
): Outcome {
  // 把已知常量替换成数值（known 里的都是已给定的量）
  let replaced = expression
  for (const [name, value] of Object.entries(known)) {
    if (name === variable) continue
    replaced = replaced.replace(new RegExp(`(^|[^A-Za-z0-9_])${name}($|[^A-Za-z0-9_])`, 'g'), `$1(${value})$2`)
  }

  // 多项式路径
  const engine = bignum(precision)
  try {
    const rationalized = engine.rationalize(replaced, {}, true)
    const variables = Array.isArray(rationalized?.variables) ? rationalized.variables : []

    // 关键：不要强制要求未知数叫 "x"。
    // 用户写 `p = 1/3` 时未知数是 p，若这里要求 variables[0] === 'x' 就会
    // 掉进数值求根、再用 x 去求根，必然找不到解。
    // 单变量的情况下，那个变量就是要求解的未知数。
    if (variables.length === 1) {
      const solvedVariable = String(variables[0])
      const coefficients = (rationalized.coefficients as any[]).map((value) => toFiniteNumber(value))
      if (coefficients.every((value) => value !== undefined)) {
        const numeric = coefficients as number[]
        while (numeric.length > 1 && Math.abs(numeric[numeric.length - 1]) < 1e-15) numeric.pop()
        if (numeric.length > 1) {
          // 先试 Algebrite：它能给出**复数根**，而 mathjs 的 polynomialRoot 只给实根
          // （这就是以前 x^3 - 1 = 0 只返回 x = 1 的原因）。
          try {
            const complexRoots = symbolicRootsWithComplex(replaced, solvedVariable)
            const cleaned = complexRoots
              .map((root) => ({
                re: Math.abs(root.re - Math.round(root.re)) < 1e-9 ? Math.round(root.re) : Number(root.re.toFixed(12)),
                im: Math.abs(root.im) < 1e-9 ? 0 : Number(root.im.toFixed(12)),
              }))
              .filter((root) => Number.isFinite(root.re) && Number.isFinite(root.im))
            const unique: Array<{ re: number; im: number }> = []
            for (const root of cleaned) {
              if (!unique.some((x) => Math.abs(x.re - root.re) < 1e-9 && Math.abs(x.im - root.im) < 1e-9)) unique.push(root)
            }
            if (unique.length > 0) {
              const realRoots = unique.filter((root) => root.im === 0).map((root) => root.re).sort((a, b) => a - b)
              const complexPairs = unique
                .filter((root) => root.im !== 0)
                .sort((a, b) => a.re - b.re || a.im - b.im)
              if (complexPairs.length === 0) {
                // 纯实根：保持原有输出格式与 value 形状（既有调用方不受影响）
                return {
                  result: `多项式精确解：${realRoots.map((root) => `${solvedVariable} = ${trimNumber(root, precision)}`).join('，')}`,
                  value: realRoots,
                }
              }
              const render = (root: { re: number; im: number }): string => {
                if (root.im === 0) return `${solvedVariable} = ${trimNumber(root.re, precision)}`
                if (Math.abs(root.re) < 1e-12) {
                  // 纯虚根不写成 "0 - 1i"，直接给 ±ki
                  return `${solvedVariable} = ${root.im > 0 ? '' : '-'}${trimNumber(Math.abs(root.im), precision)}i`
                }
                const sign = root.im > 0 ? '+' : '-'
                return `${solvedVariable} = ${trimNumber(root.re, precision)} ${sign} ${trimNumber(Math.abs(root.im), precision)}i`
              }
              const ordered = [...realRoots.map((re) => ({ re, im: 0 })), ...complexPairs]
              return {
                result: `多项式精确解（含复数根，共 ${ordered.length} 个）：${ordered.map(render).join('，')}`,
                value: ordered,
              }
            }
          } catch {
            /* Algebrite 解不了就退回 mathjs 实根 */
          }

          const raw = engine.polynomialRoot(...numeric) as any[]
          const roots = raw
            .map((value) => toFiniteNumber(value))
            .filter((value): value is number => value !== undefined)
            .map((value) => Number(value.toFixed(12)))
          const unique = [...new Set(roots)].sort((a, b) => a - b)
          if (unique.length > 0) {
            return {
              result: `多项式精确解：${unique.map((root) => `${solvedVariable} = ${trimNumber(root, precision)}`).join('，')}`,
              value: unique,
            }
          }
        }
      }
      // 单变量但不是多项式（或次数不足）→ 用这个变量做数值求根
      const numericRoots = findNumericRoots(replaced, solvedVariable, -1000, 1000)
      if (numericRoots.length > 0) {
        return {
          result: `数值解（近似）：${numericRoots.map((root) => `${solvedVariable} = ${trimNumber(root, precision)}`).join('，')}`,
          value: numericRoots,
        }
      }
      throw new CalcError(
        'no_solution',
        `在默认区间 [-1000, 1000] 内没有找到 "${solvedVariable}" 的实根`,
        '该方程可能无解、无实根，或解在区间之外。',
      )
    }
  } catch (error) {
    if (error instanceof CalcError) throw error
    /* 不是多项式，走下面的数值路径 */
  }

  // 数值求根（多变量或无法多项式化）
  const numeric = findNumericRoots(replaced, variable, -1000, 1000)
  if (numeric.length === 0) {
    throw new CalcError('no_solution', '在默认区间 [-1000, 1000] 内没有找到实根', '可改写为多项式形式，或显式给出区间。')
  }
  return {
    result: `数值解（近似）：${numeric.map((root) => `${variable} = ${trimNumber(root, precision)}`).join('，')}`,
    value: numeric,
  }
}

/** 扫描区间找符号变化，再用二分法精修。 */
function findNumericRoots(expression: string, variable: string, from: number, to: number, steps = 4000): number[] {
  const engine = fast()
  let compiled: any
  try {
    const node = engine.parse(expression)
    guardAst(node)
    compiled = node.compile()
  } catch (error) {
    throw translateError(error)
  }

  const evaluate = (x: number): number | undefined => {
    try {
      const raw = compiled.evaluate({ [variable]: x })
      const numeric = toFiniteNumber(raw)
      return numeric === undefined ? undefined : numeric
    } catch {
      return undefined
    }
  }

  const roots: number[] = []
  const step = (to - from) / steps
  let previousX = from
  let previousY = evaluate(from)

  for (let index = 1; index <= steps; index += 1) {
    const x = from + index * step
    const y = evaluate(x)
    if (y !== undefined && Math.abs(y) < 1e-14) roots.push(x)
    else if (previousY !== undefined && y !== undefined && previousY < 0 !== y < 0) {
      // 二分
      let low = previousX
      let high = x
      let lowValue = previousY
      for (let iteration = 0; iteration < 200; iteration += 1) {
        const middle = (low + high) / 2
        const middleValue = evaluate(middle)
        if (middleValue === undefined) break
        if (Math.abs(middleValue) < 1e-14) {
          low = middle
          high = middle
          break
        }
        if (lowValue < 0 !== middleValue < 0) high = middle
        else {
          low = middle
          lowValue = middleValue
        }
      }
      roots.push((low + high) / 2)
    }
    previousX = x
    previousY = y
  }

  const unique: number[] = []
  for (const root of roots.sort((a, b) => a - b)) {
    const last = unique[unique.length - 1]
    if (last === undefined || Math.abs(root - last) > 1e-6) unique.push(Number(root.toFixed(12)))
  }

  // 周期函数（如 sin(x) = 0.5）在 [-1000,1000] 里会有几百个根，
  // 全列出来既没用又淹没回答。保留最靠近 0 的一批，并告知总数。
  const MAX_REPORTED_ROOTS = 12
  if (unique.length > MAX_REPORTED_ROOTS) {
    const byProximity = [...unique].sort((a, b) => Math.abs(a) - Math.abs(b) || a - b).slice(0, MAX_REPORTED_ROOTS)
    return byProximity.sort((a, b) => a - b)
  }
  return unique
}

/** 矩阵运算。 */
function opMatrix(expression: string, engine: any, precision: number, args: MathArgs): Outcome {
  const text = normalizeSource(expression)

  // 显式给矩阵时优先用参数
  if (Array.isArray(args.matrix)) {
    const matrix = normalizeMatrix(args.matrix, 'matrix')
    if (Array.isArray(args.vector)) {
      const vector = args.vector.map((value) => {
        const numeric = Number(value)
        if (!Number.isFinite(numeric)) throw new CalcError('invalid_argument', 'vector 含非有限数值')
        return numeric
      })
      const solved = engine.lusolve(matrix, vector)
      const values = (solved?.toArray?.() ?? solved).map((row: any) => toFiniteNumber(Array.isArray(row) ? row[0] : row))
      return {
        result: `解向量：[${values.map((value: number | undefined) => (value === undefined ? '?' : trimNumber(value, precision))).join(', ')}]`,
        value: values,
      }
    }
    // 只给矩阵：输出矩阵画像（秩 / 行列式 / 迹 / 奇异值 / 零空间 / 逆）
    //
    // 这是原来的一个真实缺陷：determinant 与 inverse 这类操作只给 matrix 时报
    // "缺少 vector"，而它们根本不需要 vector。
    const rows = matrix.length
    const cols = rows === 0 ? 0 : matrix[0].length
    const square = rows === cols
    const rank = rankOf(matrix)
    const trace = square ? matrix.reduce((sum, row, index) => sum + row[index], 0) : undefined

    let determinant: number | undefined
    if (square) {
      try {
        determinant = toFiniteNumber(engine.det(matrix))
      } catch {
        /* 非常规矩阵，留空 */
      }
    }

    let inverse: number[][] | undefined
    if (square && rank === rows) {
      try {
        const rawInverse = engine.inv(matrix)
        const array = rawInverse?.toArray?.() ?? rawInverse
        if (Array.isArray(array)) inverse = array.map((row: any) => row.map((cell: any) => Number(cell)))
      } catch {
        /* 数值上不可逆 */
      }
    }

    const basis = nullspaceOf(matrix)
    const singularValues = singularValuesOf(matrix)

    const summary: string[] = []
    summary.push(`矩阵 ${rows}×${cols}，秩 ${rank}（满秩为 ${Math.min(rows, cols)}）`)
    if (square) {
      summary.push(`行列式 ${determinant === undefined ? '无法计算' : trimNumber(determinant, precision)}；迹 ${trimNumber(trace ?? 0, precision)}`)
      if (determinant !== undefined && Math.abs(determinant) < 1e-12) summary.push('矩阵奇异：逆不存在')
    }
    summary.push(`奇异值：${singularValues.map((value) => trimNumber(value, precision)).join(', ')}`)
    summary.push(basis.length === 0 ? '零空间只有零向量' : `零空间维数 ${basis.length}`)
    if (inverse) summary.push('逆矩阵见 value.inverse')

    return {
      result: summary.join('\n'),
      value: toJsonValue({ rows, cols, rank, determinant, trace, inverse, nullspace: basis, singularValues }),
    }
  }

  if (text === '') {
    throw new CalcError('invalid_argument', '需要表达式或 matrix 参数')
  }

  let node: any
  try {
    node = engine.parse(text)
  } catch (error) {
    throw translateError(error, 'syntax')
  }
  guardAst(node)
  guardComplexity(node)

  let raw: any
  try {
    raw = node.evaluate({})
  } catch (error) {
    throw translateError(error)
  }
  return {
    result: formatValue(engine, raw, precision),
    value: toJsonValue(raw),
  }
}

/** 特征值 / 特征向量。 */
function opEigen(expression: string, args: MathArgs, precision: number): Outcome {
  let matrix: number[][]
  if (Array.isArray(args.matrix)) {
    matrix = normalizeMatrix(args.matrix, 'matrix')
  } else {
    const text = normalizeSource(expression)
    if (text === '') throw new CalcError('invalid_argument', '需要表达式或 matrix 参数')
    const engine = fast()
    let raw: any
    try {
      raw = engine.evaluate(text, {})
    } catch (error) {
      throw translateError(error)
    }
    const array = Array.isArray(raw) ? raw : raw?.toArray?.()
    matrix = normalizeMatrix(array, 'matrix')
  }

  const rows = matrix.length
  const cols = matrix[0].length
  if (rows !== cols) {
    throw new CalcError('dimension', `特征值要求方阵，实际是 ${rows}×${cols}`)
  }

  const engine = fast()
  let eigenvalues: number[]
  let eigenvectors: number[][] | undefined
  try {
    const raw = engine.eigs(matrix)
    eigenvalues = (raw.values?.toArray?.() ?? raw.values ?? []).map((value: any) => {
      const numeric = toFiniteNumber(value)
      return numeric === undefined ? Number.NaN : numeric
    })
    try {
      const vectors = raw.vectors?.toArray?.() ?? raw.vectors
      if (Array.isArray(vectors)) {
        eigenvectors = vectors.map((row: any) => (Array.isArray(row) ? row.map((cell: any) => toFiniteNumber(cell) ?? Number.NaN) : []))
      }
    } catch {
      /* 特征向量可选 */
    }
  } catch (error) {
    throw translateError(error)
  }

  // 数值噪声清理：接近整数的吸附到整数
  const cleaned = eigenvalues.map((value) => (Math.abs(value - Math.round(value)) < 1e-9 ? Math.round(value) : Number(value.toPrecision(12))))
  const sorted = [...cleaned].sort((a, b) => a - b)

  const lines = [`特征值：${sorted.map((value) => trimNumber(value, 12)).join(', ')}`]
  if (eigenvectors && eigenvectors.length === sorted.length) {
    lines.push('特征向量（按原始顺序，列向量）：')
    for (let index = 0; index < eigenvectors.length; index += 1) {
      lines.push(`  λ${index + 1} = ${trimNumber(cleaned[index], 12)} → [${eigenvectors[index].map((value) => trimNumber(value, 10)).join(', ')}]`)
    }
  }
  return {
    result: lines.join('\n'),
    value: {
      eigenvalues: sorted,
      eigenvectors: eigenvectors?.map((column) => column.map((value) => Number(value.toPrecision(12)))) ?? null,
    },
  }
}

/** 描述统计。 */
function opStats(args: MathArgs, expression: string, precision: number): Outcome {
  let data: number[] | undefined
  if (Array.isArray(args.data)) {
    data = args.data.map((value) => Number(value))
  } else {
    const text = normalizeSource(expression)
    if (text !== '') {
      const engine = fast()
      try {
        const raw = engine.evaluate(text, {})
        const array = Array.isArray(raw) ? raw : raw?.toArray?.()
        if (Array.isArray(array)) data = array.map((value: any) => Number(value))
      } catch (error) {
        throw translateError(error)
      }
    }
  }
  if (!data || data.length === 0) {
    throw new CalcError('invalid_argument', '需要数据', '用 data: [1,2,3] 或 expression: "[1,2,3]"。')
  }
  if (data.some((value) => !Number.isFinite(value))) {
    throw new CalcError('invalid_argument', '数据含非有限数值')
  }

  const summary = describe(data)
  const lines = [
    `样本量 n = ${summary.count}`,
    `均值 = ${trimNumber(summary.mean, precision)}`,
    `中位数 = ${trimNumber(summary.median, precision)}`,
    `众数 = ${summary.mode.map((value) => trimNumber(value, precision)).join(', ')}`,
    `标准差(样本) = ${trimNumber(summary.std, precision)}`,
    `方差(样本) = ${trimNumber(summary.variance, precision)}`,
    `标准差(总体) = ${trimNumber(summary.stdPopulation, precision)}`,
    `极差 = ${trimNumber(summary.range, precision)}`,
    `Q1 = ${trimNumber(summary.q1, precision)}，Q3 = ${trimNumber(summary.q3, precision)}，IQR = ${trimNumber(summary.iqr, precision)}`,
    `偏度 = ${trimNumber(summary.skewness, precision)}，峰度(超额) = ${trimNumber(summary.kurtosis, precision)}`,
  ]
  return { result: lines.join('\n'), value: summary as unknown as JsonValue }
}

/** 概率分布。 */
function opDist(args: MathArgs, precision: number): Outcome {
  const kind = (args.distribution ?? '').trim().toLowerCase()
  if (kind === '') {
    throw new CalcError('invalid_argument', '需要 distribution 参数', '可选：normal / binomial / poisson / exponential / chisquare / t')
  }
  const params = Array.isArray(args.params) ? args.params.map((value) => Number(value)) : []
  const x = typeof args.x === 'number' ? args.x : Number.NaN
  if (!Number.isFinite(x)) {
    throw new CalcError('invalid_argument', '需要数值参数 x')
  }

  const need = (count: number, names: string): void => {
    if (params.length < count || params.some((value) => !Number.isFinite(value))) {
      throw new CalcError('invalid_argument', `distribution="${kind}" 需要 params=[${names}]`)
    }
  }

  switch (kind) {
    case 'normal':
    case 'gaussian': {
      need(2, 'mean, sd')
      const [mean, sd] = params
      if (sd <= 0) throw new CalcError('invalid_argument', '标准差必须为正')
      const z = (x - mean) / sd
      const pdf = normalPdf(z) / sd
      const cdf = normalCdf(z)
      return {
        result: `z = ${trimNumber(z, precision)}\nPDF = ${trimNumber(pdf, precision)}\nCDF = P(X ≤ ${x}) = ${trimNumber(cdf, precision)}\nP(X > ${x}) = ${trimNumber(1 - cdf, precision)}`,
        value: { z, pdf, cdf, upper: 1 - cdf },
      }
    }
    case 'binomial': {
      need(2, 'n, p')
      const [n, p] = params
      if (!Number.isInteger(n) || n < 0) throw new CalcError('invalid_argument', 'n 必须是非负整数')
      if (p < 0 || p > 1) throw new CalcError('invalid_argument', 'p 必须在 [0,1]')
      return {
        result: `PMF = P(X = ${x}) = ${trimNumber(binomialPmf(x, n, p), precision)}\nCDF = P(X ≤ ${x}) = ${trimNumber(binomialCdf(x, n, p), precision)}`,
        value: { pmf: binomialPmf(x, n, p), cdf: binomialCdf(x, n, p) },
      }
    }
    case 'poisson': {
      need(1, 'lambda')
      const [lambda] = params
      if (lambda <= 0) throw new CalcError('invalid_argument', 'lambda 必须为正')
      return {
        result: `PMF = P(X = ${x}) = ${trimNumber(poissonPmf(x, lambda), precision)}\nCDF = P(X ≤ ${x}) = ${trimNumber(poissonCdf(x, lambda), precision)}`,
        value: { pmf: poissonPmf(x, lambda), cdf: poissonCdf(x, lambda) },
      }
    }
    case 'exponential': {
      need(1, 'rate')
      const [rate] = params
      if (rate <= 0) throw new CalcError('invalid_argument', 'rate 必须为正')
      return {
        result: `PDF = ${trimNumber(exponentialCdf(x, rate) === 0 ? 0 : rate * Math.exp(-rate * x), precision)}\nCDF = ${trimNumber(exponentialCdf(x, rate), precision)}`,
        value: { cdf: exponentialCdf(x, rate) },
      }
    }
    case 'chisquare':
    case 'chi2': {
      need(1, 'df')
      const [df] = params
      if (df <= 0) throw new CalcError('invalid_argument', 'df 必须为正')
      return { result: `CDF = ${trimNumber(chiSquareCdf(x, df), precision)}`, value: { cdf: chiSquareCdf(x, df) } }
    }
    case 't':
    case 'student': {
      need(1, 'df')
      const [df] = params
      if (df <= 0) throw new CalcError('invalid_argument', 'df 必须为正')
      return { result: `CDF = ${trimNumber(studentTCdf(x, df), precision)}`, value: { cdf: studentTCdf(x, df) } }
    }
    case 'normalinv': {
      need(0, '')
      return { result: `z(α=${x}) = ${trimNumber(normalInv(x), precision)}`, value: normalInv(x) }
    }
    case 'quantile': {
      const text = normalizeSource(expressionFromArgs(args))
      const engine = fast()
      const raw = engine.evaluate(text, {})
      const array = (Array.isArray(raw) ? raw : raw?.toArray?.()).map((value: any) => Number(value)).sort((a: number, b: number) => a - b)
      return { result: `分位数 = ${trimNumber(quantile(array, x), precision)}`, value: quantile(array, x) }
    }
    default:
      throw new CalcError('invalid_argument', `不支持的分布 "${kind}"`, '可选：normal / binomial / poisson / exponential / chisquare / t / normalinv')
  }
}

function expressionFromArgs(args: MathArgs): string {
  return args.expression ?? ''
}

/** 回归。 */
function opRegression(args: MathArgs, expression: string, precision: number): Outcome {
  let xs: number[] | undefined = Array.isArray(args.data) ? args.data.map((value) => Number(value)) : undefined
  let ys: number[] | undefined = Array.isArray(args.dataY) ? args.dataY.map((value) => Number(value)) : undefined

  if (!xs || !ys) {
    const text = normalizeSource(expression)
    if (text !== '') {
      const engine = fast()
      try {
        const raw = engine.evaluate(text, {})
        const array = Array.isArray(raw) ? raw : raw?.toArray?.()
        if (Array.isArray(array) && array.length === 2) {
          xs = (Array.isArray(array[0]) ? array[0] : array[0]?.toArray?.() ?? []).map((value: any) => Number(value))
          ys = (Array.isArray(array[1]) ? array[1] : array[1]?.toArray?.() ?? []).map((value: any) => Number(value))
        }
      } catch (error) {
        throw translateError(error)
      }
    }
  }

  if (!xs || !ys) {
    throw new CalcError('invalid_argument', '需要 data 与 dataY', '例如 data:[1,2,3], dataY:[2,4,6]。')
  }
  if (xs.length !== ys.length) throw new CalcError('invalid_argument', 'data 与 dataY 长度必须一致')
  if (xs.some((v) => !Number.isFinite(v)) || ys.some((v) => !Number.isFinite(v))) {
    throw new CalcError('invalid_argument', '数据含非有限数值')
  }

  const degree = typeof args.degree === 'number' ? Math.max(1, Math.min(10, Math.round(args.degree))) : 1

  if (degree === 1) {
    const model = linearRegression(xs, ys)
    return {
      result: [
        `线性回归：y = ${trimNumber(model.slope, precision)}·x + (${trimNumber(model.intercept, precision)})`,
        `R = ${trimNumber(model.r, precision)}，R² = ${trimNumber(model.rSquared, precision)}，n = ${model.n}`,
      ].join('\n'),
      value: { slope: model.slope, intercept: model.intercept, r: model.r, rSquared: model.rSquared, n: model.n },
    }
  }

  const model = polynomialRegression(xs, ys, degree)
  const terms = model.coefficients.map((coefficient, power) => {
    if (power === 0) return `${trimNumber(coefficient, precision)}`
    return `${trimNumber(coefficient, precision)}·x^${power}`
  })
  return {
    result: [`${degree} 次多项式回归：y = ${terms.join(' + ')}`, `R² = ${trimNumber(model.rSquared, precision)}，n = ${xs.length}`].join('\n'),
    value: { coefficients: model.coefficients, rSquared: model.rSquared, degree },
  }
}

/** 显式线性系统。 */
function opSystem(args: MathArgs, precision: number): Outcome {
  if (!Array.isArray(args.matrix) || !Array.isArray(args.vector)) {
    throw new CalcError('invalid_argument', '需要 matrix 与 vector', '例如 matrix:[[3,2],[1,-1]], vector:[10,1]')
  }
  const matrix = normalizeMatrix(args.matrix, 'matrix')
  const vector = args.vector.map((value) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) throw new CalcError('invalid_argument', 'vector 含非有限数值')
    return numeric
  })
  if (matrix.length !== vector.length) {
    throw new CalcError('dimension', `matrix 有 ${matrix.length} 行，vector 有 ${vector.length} 个元素`)
  }
  const engine = bignum(precision)
  let raw: any
  try {
    raw = engine.lusolve(matrix, vector)
  } catch (error) {
    throw translateError(error)
  }
  const values = (raw?.toArray?.() ?? raw).map((row: any) => toFiniteNumber(Array.isArray(row) ? row[0] : row))
  // lusolve 对奇异矩阵会静默返回假解，必须用残差校验兜底
  const numericValues = values.map((value: number | undefined) => value ?? Number.NaN)
  verifyLinearSolution(matrix as number[][], vector as number[], numericValues)
  const rendered = values.map((value: number | undefined, index: number) => `x${index + 1} = ${value === undefined ? '?' : trimNumber(value, precision)}`)
  return {
    result: rendered.join('，'),
    value: values,
  }
}

/**
 * 校验方程组的解是否满足每一条原方程。
 * 与 `verifyLinearSolution` 同一目的：宁可报「无唯一解」，也不给假解。
 */
function verifyEquationSolution(
  equations: Array<{ coefficients: Map<string, number>; constant: number }>,
  variables: string[],
  values: number[],
): void {
  for (const equation of equations) {
    let sum = 0
    for (let index = 0; index < variables.length; index += 1) {
      sum += (equation.coefficients.get(variables[index]) ?? 0) * (values[index] ?? 0)
    }
    const scale = Math.max(1, Math.abs(equation.constant), Math.abs(sum))
    if (Math.abs(sum - equation.constant) > 1e-9 * scale) {
      throw new CalcError(
        'inconsistent',
        `方程组无解或有无穷多解（残差 ${Math.abs(sum - equation.constant).toExponential(3)}）`,
        '方程之间可能线性相关（例如 x+y=2 与 2x+2y=4），或条件矛盾。请检查方程组是否独立。',
      )
    }
  }
}

/**
 * 校验线性系统的解是否真的满足原方程。
 *
 * 为什么必须有这一步：mathjs 的 `lusolve` 面对奇异矩阵**不会报错**，
 * 而是返回一个看起来正常、实际不满足全部方程的假解。
 * 实测 `lusolve([[1,2],[2,4]],[1,2])` 返回 `[1, 0]`，代回后并不成立。
 *
 * 对「世界观推演」这类用途，静默的错误答案比报错危险得多，
 * 所以这里用残差兜底：解必须让每一行都成立。
 */
function verifyLinearSolution(matrix: number[][], vector: number[], values: number[]): void {
  // 先查矩阵是否满秩：奇异矩阵要么无解要么无穷多解，都不该给出「唯一解」。
  // 残差校验只能抓矛盾方程组，抓不到「相容但欠定」的情况，所以单独判定。
  const isSingular = matrixIsSingular(matrix)
  const rows = matrix.length
  let inconsistentRow = -1
  for (let row = 0; row < rows; row += 1) {
    let sum = 0
    for (let col = 0; col < values.length; col += 1) {
      sum += (matrix[row][col] ?? 0) * (values[col] ?? 0)
    }
    const target = vector[row] ?? 0
    const scale = Math.max(1, Math.abs(target), Math.abs(sum))
    if (Math.abs(sum - target) > 1e-9 * scale) {
      inconsistentRow = row
      break
    }
  }

  if (inconsistentRow >= 0) {
    throw new CalcError(
      'inconsistent',
      `方程组无解（第 ${inconsistentRow + 1} 行不成立）`,
      '矩阵行之间线性相关且右端项不匹配。请检查系数矩阵是否满秩、右端项是否正确。',
    )
  }
  if (isSingular) {
    throw new CalcError(
      'no_unique_solution',
      '方程组有无穷多解（系数矩阵奇异，行列式为 0）',
      '矩阵行线性相关，解不唯一。请补充独立方程，或改用最小二乘/伪逆求一个特解。',
    )
  }
}

/**
 * 判断方阵是否奇异（行列式接近 0）。
 * 用带部分主元的高斯消元估计，避免直接算大矩阵行列式溢出。
 */
function matrixIsSingular(matrix: number[][]): boolean {
  const n = matrix.length
  if (n === 0 || matrix[0].length !== n) return false
  const a = matrix.map((row) => [...row])
  let scale = 1
  for (const row of a) for (const cell of row) scale = Math.max(scale, Math.abs(cell))

  for (let col = 0; col < n; col += 1) {
    let pivot = col
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
    }
    if (Math.abs(a[pivot][col]) <= 1e-12 * scale) return true
    if (pivot !== col) {
      const temporary = a[col]
      a[col] = a[pivot]
      a[pivot] = temporary
    }
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row][col] / a[col][col]
      if (factor === 0) continue
      for (let k = col; k < n; k += 1) a[row][k] -= factor * a[col][k]
    }
  }
  return false
}

/**
 * `formula`：按 id/名称调一条现成公式。
 *
 * 这是世界观推演的快捷方式：不用记表达式，直接给 id + 参数。
 * 所有参数都能被 `overrides` 覆盖（改 g、改系数、改光速），
 * 也能用 `customExpression` 做结构级改造。
 */
/**
 * 取当前工作区物化后的公式列表。
 * 这是数据隔离的核心：不同工作区看到的是各自的公式表。
 */
function currentFormulas(): FormulaType[] {
  const workspaceName = currentWorkspace()
  const workspace = loadWorkspace(workspaceName)
  const materialized = materializeFormulas(workspace.formulaTable, workspace.constants)
  return materialized.formulas as FormulaType[]
}

/** 在当前工作区的公式表里检索。 */
/**
 * 在当前工作区的公式集里检索。
 *
 * ⚠️ 检索逻辑**必须**复用 `scoreFormulas`，不能在这里再写一份。
 * 曾经这里复制了 `findFormulas` 的旧实现（只做整串子串匹配），
 * 于是 `formulas.ts` 里的检索修好了，这个走工作区集的副本还是旧的：
 * 工具里查「贷款月供」0 条，而单元测试直接调 `findFormulas` 全绿 —— 测试骗了自己。
 * 现在两边共用一份，差异只剩「检索哪一批公式」。
 *
 * @param query - 查询串
 * @param limit - 最多返回条数
 * @returns 按相关度排序的公式
 */
function findInCurrentWorkspace(query: string, limit: number) {
  return scoreFormulas(currentFormulas(), query, limit)
}

function opFormula(args: MathArgs, engine: any, precision: number): Outcome {
  const query = (args.formula ?? args.expression ?? '').trim()
  if (query === '') {
    throw new CalcError('invalid_argument', '需要 formula 参数', '传公式 id 或名称，例如 "escape_velocity"、"逃逸速度"。用 operation="formulas" 检索。')
  }

  /**
   * 单个公式解析用**严格匹配**，不用模糊检索。
   *
   * `formulas`（检索）和 `formula`（求值）的取向相反：
   *   检索要「想得到」，模糊是对的；
   *   求值要「指哪儿打哪儿」，模糊会把 `'不存在xyz'` 里的子词「公式」
   *   匹配到别的公式，于是报 `missing_params` 而不是 `unknown_formula`，
   *   模型以为公式找到了、只是缺参数，去补一堆无关参数。
   */
  const formula = resolveFormulaStrict(currentFormulas(), query)
  if (!formula) {
    throw new CalcError(
      'unknown_formula',
      `没有匹配 "${query}" 的公式`,
      '用 operation="formulas" 按关键词检索，或直接 operation="evaluate" 写自己的表达式。',
    )
  }

  const overrides = (args.overrides ?? {}) as Record<string, number | string>

  let resolved: { values: Record<string, unknown>; overridden: string[]; missing: string[] }
  try {
    resolved = resolveParams(formula, overrides)
  } catch (error) {
    if (error instanceof FormulaError) throw new CalcError(error.type, error.message)
    throw error
  }

  if (resolved.missing.length > 0) {
    // 给出完整参数表，方便模型一次补齐
    const required = Object.entries(formula.params).map(([name, spec]) => `${name}: ${spec.desc}`)
    throw new CalcError(
      'missing_params',
      `公式 "${formula.name}" 缺少参数: ${resolved.missing.join(', ')}`,
      `完整参数表 —— ${required.join('；')}。用 overrides 传入，例如 {"${resolved.missing[0]}": 100}。`,
    )
  }

  const expression = resolveExpression(formula, args.customExpression)
  const scope = buildFormulaScope(engine, resolved.values)

  // 走 JS 实现的公式（数组逐元素运算这类 mathjs 表达不好的）
  if (formula.builtin && !args.customExpression) {
    const implementation = BUILTINS[formula.builtin]
    if (!implementation) {
      throw new CalcError('internal', `公式 "${formula.id}" 声明了不存在的内置实现 "${formula.builtin}"`)
    }
    let answer: number
    try {
      answer = implementation(resolved.values)
    } catch (error) {
      throw new CalcError('invalid_argument', error instanceof Error ? error.message : String(error))
    }
    if (!Number.isFinite(answer)) {
      throw new CalcError('non_finite', `计算结果非有限（${answer}）`, '检查输入是否落在定义域内。')
    }
    const lines = [describeFormula(formula, expression, resolved.values, resolved.overridden)]
    lines.push(`结果: ${trimNumber(answer, Math.min(precision, 15))}${formula.unit ? ` ${formula.unit}` : ''}`)
    return {
      result: lines.join('\n'),
      value: {
        formula: formula.id,
        category: formula.cat,
        expression,
        params: toJsonValue(resolved.values),
        overridden: resolved.overridden,
        answer: safeNumberForJson(answer),
        unit: formula.unit ?? null,
      },
    }
  }

  let node: any
  try {
    node = engine.parse(expression)
  } catch (error) {
    throw translateError(error, 'syntax')
  }
  guardAst(node)
  guardComplexity(node)

  let raw: any
  try {
    raw = node.evaluate(scope)
  } catch (error) {
    throw translateError(error)
  }

  const parts = [describeFormula(formula, expression, resolved.values, resolved.overridden)]
  parts.push(`结果: ${formatValue(engine, raw, precision)}${formula.unit ? ` ${formula.unit}` : ''}`)

  return {
    result: parts.join('\n'),
    value: {
      formula: formula.id,
      category: formula.cat,
      expression,
      params: toJsonValue(resolved.values),
      overridden: resolved.overridden,
      answer: toJsonValue(raw),
      unit: formula.unit ?? null,
    },
  }
}

/** `formulas`：检索/浏览公式库。 */
function opFormulas(args: MathArgs): Outcome {
  const query = (args.query ?? args.expression ?? '').trim()

  // ── 频次查询：query="freq:high" / "频率:高" ──
  //
  // 用户视角：270 条是广度，但故事里高频的是材料/天气/感知/交通/人体这一层。
  // 这里按频次筛，帮 AI 优先调用真正常用的公式。
  const freqMatch = query.match(/^(?:freq|frequency|频率|频次)[:：]\s*(high|medium|low|高|中|低)$/i)
  if (freqMatch) {
    const alias: Record<string, 'high' | 'medium' | 'low'> = { 高: 'high', 中: 'medium', 低: 'low' }
    const level = alias[freqMatch[1]] ?? (freqMatch[1].toLowerCase() as 'high' | 'medium' | 'low')
    const list = listFormulasByFrequency(level)
    const byCategory = new Map<string, number>()
    for (const formula of list) byCategory.set(formula.cat, (byCategory.get(formula.cat) ?? 0) + 1)
    const label = level === 'high' ? '高频（故事里常遇到）' : level === 'medium' ? '中频' : '低频（几乎用不到）'
    const lines = [`${label}：${list.length} 条`]
    lines.push('')
    lines.push('按分类：')
    for (const [cat, count] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${cat}  (${count})`)
    }
    lines.push('')
    lines.push('示例：' + list.slice(0, 12).map((f) => f.id).join(', '))
    lines.push('用 operation="formulas" + query="关键词" 检索具体公式。')
    return { result: lines.join('\n'), value: { level, total: list.length, categories: Object.fromEntries(byCategory) } }
  }

  // ── 符号查询：query="symbol:m" / "符号:m@质量" / "symbol:*" ──
  //
  // 为什么需要：同一个字母在不同公式里含义不同（m 可以是质量、米、分钟）。
  // 让 AI/人先查符号、再调公式，能避免"看起来对、物理意义错"的调用。
  // ── 规则层级查询：query="layer:derived" / "层级:经验" ──
  //
  // 用户纠正：分类不该按学科，而该按「离最底层规则的远近」。
  // 这里把层级做成独立轴，与学科领域、主角感知频率互不替代。
  const LAYER_ALIASES: Record<string, (typeof LAYERS)[number]['id']> = {
    fundamental: 'fundamental',
    mathematical: 'mathematical',
    derived: 'derived',
    phenomenological: 'phenomenological',
    engineering: 'engineering',
    conventional: 'conventional',
    基本: 'fundamental',
    数学: 'mathematical',
    导出: 'derived',
    经验: 'phenomenological',
    工程: 'engineering',
    约定: 'conventional',
  }
  const layerMatch = query.match(/^(?:layer|层级|规则)[:：]\s*([A-Za-z\u4e00-\u9fa5]+)$/i)
  if (layerMatch) {
    const key = layerMatch[1].toLowerCase()
    const layer = LAYER_ALIASES[key] ?? LAYER_ALIASES[layerMatch[1]]
    if (!layer) return { result: `不认识的层级 "${layerMatch[1]}"。可用：${LAYERS.map((l) => l.id).join(' / ')}`, value: { error: 'unknown-layer' } }
    const list = formulasByLayer(layer)
    const definition = LAYERS.find((l) => l.id === layer)!
    const lines = [`${definition.name}（${definition.id}）：${list.length} 条 —— ${definition.desc}`]
    lines.push('')
    lines.push('示例：' + list.slice(0, 15).map((f) => f.id).join(', '))
    lines.push('完整清单用 query="*" 查看，或按领域筛选：query="domain:物理"。')
    return {
      result: lines.join('\n'),
      value: { layer, total: list.length, examples: list.slice(0, 15).map((f) => ({ id: f.id, name: f.name, domains: domainsOf(f) })) },
    }
  }

  // ── 学科领域查询：query="domain:physics" / "领域:医学" ──
  const DOMAIN_ALIASES: Record<string, string> = Object.fromEntries(
    Object.entries(DOMAIN_NAMES).flatMap(([id, name]) => [[id, id], [name, id]]),
  )
  const domainMatch = query.match(/^(?:domain|领域|学科)[:：]\s*([A-Za-z\u4e00-\u9fa5]+)$/i)
  if (domainMatch) {
    const domain = DOMAIN_ALIASES[domainMatch[1].toLowerCase()] ?? DOMAIN_ALIASES[domainMatch[1]]
    if (!domain || !(DOMAINS as readonly string[]).includes(domain)) {
      return { result: `不认识的领域 "${domainMatch[1]}"。可用：${DOMAINS.join(' / ')}`, value: { error: 'unknown-domain' } }
    }
    const list = formulasByDomain(domain)
    const lines = [`领域 ${DOMAIN_NAMES[domain] ?? domain}（${domain}）：${list.length} 条`]
    lines.push('')
    for (const formula of list.slice(0, 20)) {
      lines.push(`  · ${formula.id}（${formula.name}）  [${layerOf(formula)}]`)
    }
    if (list.length > 20) lines.push(`  …还有 ${list.length - 20} 条`)
    return { result: lines.join('\n'), value: { domain, total: list.length } }
  }

  const symbolMatch = query.match(/^(?:symbol|符号)[:：]\s*([A-Za-z_][A-Za-z0-9_]*|\*)(?:@(.+))?$/i)
  if (symbolMatch) {
    const symbol = symbolMatch[1]
    const hint = symbolMatch[2]
    if (symbol === '*') {
      const list = ambiguousSymbols()
      const lines = [`多义符号共 ${list.length} 个（同一字母在不同公式里含义不同）：`]
      for (const item of list) {
        lines.push(`  · ${item.symbol}  ${item.count} 处：${item.concepts.join(' / ')}` + (item.note ? `\n      ${item.note}` : ''))
      }
      lines.push('')
      lines.push('查单个符号：query="symbol:m"，或加语境：query="symbol:m@质量"。')
      return { result: lines.join('\n'), value: { ambiguous: list } }
    }
    const lines = explainSymbol(symbol, hint)
    return {
      result: lines.join('\n'),
      value: toJsonValue({ symbol, hint: hint ?? null, meanings: symbolMeanings(symbol) }),
    }
  }

  if (query === '' || query === '*') {
    const categories = listFormulaCategories()
    const total = categories.reduce((sum, entry) => sum + entry.count, 0)
    const lines = [`公式库共 ${total} 条，按分类：`]
    for (const entry of categories) lines.push(`  ${entry.category}  (${entry.count})`)
    lines.push('')
    lines.push('按规则层级（离最底层规则的远近）：')
    for (const layer of layerCounts()) lines.push(`  ${layer.name}（${layer.layer}）  (${layer.count})`)
    lines.push('')
    lines.push('按学科领域（多标签）：')
    for (const domain of domainCounts()) lines.push(`  ${domain.name}（${domain.domain}）  (${domain.count})`)
    lines.push('')
    lines.push('检索：query="关键词" / "layer:derived" / "domain:物理" / "freq:high" / "symbol:m"；')
    lines.push('调用：operation="formula" + formula="escape_velocity"。')
    return {
      result: lines.join('\n'),
      value: { total, categories, layers: layerCounts(), domains: domainCounts() },
    }
  }

  const matches = findInCurrentWorkspace(query, 20)
  if (matches.length === 0) {
    return {
      result: `没有匹配 "${query}" 的公式。可传 query="*" 查看全部分类。`,
      value: { query, matches: [] },
    }
  }

  const lines = [`匹配 "${query}" 的公式（${matches.length} 条）：`]
  for (const formula of matches) {
    const required = Object.entries(formula.params)
      .filter(([, spec]) => spec.value === null)
      .map(([name]) => name)
    const optional = Object.entries(formula.params)
      .filter(([, spec]) => spec.value !== null)
      .map(([name, spec]) => `${name}=${spec.value}`)
    const parts = []
    if (required.length > 0) parts.push(`必填: ${required.join(', ')}`)
    if (optional.length > 0) parts.push(`可选: ${optional.join(', ')}`)
    lines.push('')
    lines.push(`  ${formula.id}  —— ${formula.name}`)
    lines.push(`     ${formula.expr}`)
    lines.push(`     ${parts.join(' | ')}`)
    lines.push(`     ${formula.desc}`)
  }
  return { result: lines.join('\n'), value: { query, matches: matches.map((m) => m.id) } }
}

/** 能力清单。 */

/** 能力清单。 */
function opHelp(): Outcome {
  return {
    result: [
      '══════ math_execute 完整能力清单 ══════',
      '',
      '【求值与代数】',
      '  evaluate      任意 mathjs 表达式；BigNumber 64 位精度',
      '                例：10^20+5、factorial(50)、(1+2i)*(3-i)、5 cm to inch、sin(30 deg)',
      '  solve         解方程。多方程逗号分隔 = 方程组',
      '                例：3x + 2y = 10, x - y = 1  /  x^2 - 5x + 6 = 0',
      '  system        显式线性系统（matrix + vector）',
      '  derivative    符号求导（order 可指定高阶）',
      '  integral      符号不定积分',
      '  simplify      符号化简',
      '  expand        符号展开',
      '  roots         多项式求根（含复数根）',
      '',
      '【扩展函数】（可直接写在表达式里）',
      '  rank(A)       矩阵的秩；nullspace(A) 零空间基；svd(A) 奇异值',
      '  factorize(n)  整数质因数分解',
      '  nsolve("表达式", 初值)  数值求根（牛顿法 + 二分兜底）',
      '',
      '【线性代数】',
      '  matrix        矩阵乘法/求逆/行列式/转置/迹；只给 matrix 时输出完整画像',
      '                （秩/行列式/迹/奇异值/零空间/逆）',
      '  eigen         特征值与特征向量',
      '',
      '【统计与概率】',
      '  stats         描述统计（均值/中位数/众数/方差/标准差/分位数/偏度/峰度）',
      '  dist          概率分布：normal/binomial/poisson/exponential/chisquare/t/normalinv',
      '  regression    线性与多项式回归（含 R²）',
      '',
      '【微分方程】',
      '  ode           数值求解 ODE（RK4）：一阶方程组（SIR/捕食模型）、二阶方程自动降阶',
      '                返回轨迹、终点值、极值、发散警告',
      '',
      '【公式库】',
      '  formula       调用已收录的 ' + FORMULAS.length + ' 条自然科学公式',
      '                例：formula="escape_velocity", overrides={M,r}',
      '                任何参数可覆盖 —— 架空世界改造的关键',
      '  formulas      检索与分类：',
      '                query="关键词"       按名称/关键词',
      '                query="layer:derived"  按规则层级（fundamental=基本规则、mathematical=数学基础（与基本同级）、derived/phenomenological/engineering/conventional）',
      '                query="domain:物理"    按学科领域（多标签）',
      '                query="freq:high"      按主角感知频率',
      '                query="symbol:m"       按符号含义',
      '  formula-table 两级扩展：工作区临时公式（覆盖/自定义/停用）+ 全局公式包',
      '                （tableAction: global-list / global-add / global-remove）',
      '                字段与校验规则见 docs/formula-authoring.md',
      '',
      '【世界观推演】',
      '  world         输入星球参数 → 体感画像：重力/昼夜/季节/纬度气候/地形上限 +',
      '                天空配色/恒星结构与寿命/卫星系统/化学窗口/生命闸门/跨模块一致性检查',
      '  constants     改变物理常数，自动推导派生量并评估世界偏离度',
      '  quantities    看哪些物理量该跟着常数变、哪些不该（量纲分析 + 缩放指数）',
      '  impact        改常数后跑全部公式并与现实对比，算每条偏差',
      '  units         单位换算：把「三里」「两丈」「五百斤」换成标准单位',
      '                不带单位参数 → 列出全部可用单位（含中文古制与天文单位）',
      '                例：unitValue=30, unitFrom="里", unitTo="km" → 15 km',
      '                自创单位用 customUnits 覆盖（如把「里」定成 576 m）',
      '  balance       收支盘点：粮/水/能/地/财政/军费/信息 多项一起看，给最短板',
      '                例：balance={grain:{demand:2.7e6,supply:3.1e6,unit:"kg/年"}}',
      '                回答「这个王国养不养得起二十万兵」这类问题（feasibility 只管单项上限）',
      '',
      '【数据管理】',
      '  workspace     工作区管理（一个世界观 = 一套常数表 + 公式表 + 地点 + 变量）',
      '                action2: list/show/create/switch/save/set/add-terrain/delete/reset',
      '                stats/cleanup 可查看存储与清理；不同工作区完全隔离',
      '                注意：本插件没有图形界面（2026-10-25 已移除），全部经工具与 HTTP 路由操作',
      '',
      '【其他】',
      '  help          本清单',
      '  prompt-mode   调整系统提示注入档位（off/brief/full）',
      '',
      '【常用参数】',
      '  expression    表达式/方程（多方程用逗号）',
      '  variables     变量字典，如 {"m":500,"v":30}',
      '  operation     上面的值；不填=auto',
      '  precision     有效数字位数，默认 64，范围 1-256',
      '  variable      求导/求根的自变量，默认 x',
      '  overrides     公式参数覆盖',
      '  constants     要改的物理常数',
      '  world         星球参数',
      '  terrain       局部地形参数',
      '',
      '【失败时】返回 ok=false + error.type/message/hint，按 hint 修正即可，不会崩溃。',
    ].join('\n'),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 主流程
// ────────────────────────────────────────────────────────────────────────────

/** 自动判定 operation。 */
function detectOperation(expression: string, args: MathArgs): MathOperation {
  if (expression.includes('=') && !expression.includes('>') && !expression.includes('<')) {
    return 'solve'
  }
  if (Array.isArray(args.matrix)) return 'matrix'
  return 'evaluate'
}

function normalizeOperation(value: unknown): MathOperation {
  if (value === undefined || value === null || value === '') return 'auto'
  if (typeof value !== 'string') throw new CalcError('invalid_argument', 'operation 必须是字符串')
  const lowered = value.trim().toLowerCase() as MathOperation
  if (!OPERATIONS.includes(lowered)) {
    throw new CalcError('invalid_argument', `不认识的 operation "${value}"`, `可用：${OPERATIONS.join(' | ')}`)
  }
  return lowered
}

/** 工具主入口：永不抛异常。 */
export function runMathTool(rawArguments: unknown): MathResult {
  const args = (rawArguments ?? {}) as Partial<MathArgs>
  const input = typeof args.expression === 'string' ? args.expression.trim() : ''

  let operation: MathOperation = 'auto'
  let precision = DEFAULT_PRECISION

  try {
    precision = clampPrecision(args.precision)
    const variable = normalizeVariable(args.variable)
    const requested = normalizeOperation(args.operation)
    const known = knownNumbers(args.variables)
    const engine = bignum(precision)
    const scope = buildScope(engine, args.variables)

    operation = requested === 'auto' ? detectOperation(input, args) : requested

    // 提示档位切换（不影响计算，只影响注入给模型的内容）
    if (args.promptMode !== undefined) {
      const mode = String(args.promptMode).trim().toLowerCase()
      if (mode !== 'off' && mode !== 'brief' && mode !== 'full') {
        throw new CalcError(
          'invalid_argument',
          `不认识的提示档位 "${args.promptMode}"`,
          '可用: off / brief / full',
        )
      }
      setPromptMode(mode as 'off' | 'brief' | 'full')
      const preview = buildSystemPromptSection()
      return {
        ok: true,
        operation: 'prompt-mode',
        input,
        result:
          `✓ 提示注入档位已设为 "${mode}"` +
          (mode === 'off'
            ? '（不再向模型注入提醒，工具仍可用）'
            : `\n当前注入内容预览（${preview.length} 字符）:\n` + preview.slice(0, 500)),
        precision,
      }
    }

    let outcome: Outcome
    switch (operation) {
      case 'help':
        outcome = opHelp()
        break
      case 'derivative':
        outcome = opDerivative(input, variable, precision)
        break
      case 'integral':
        outcome = opIntegral(input, variable, precision)
        break
      case 'simplify':
        outcome = opSimplify(input)
        break
      case 'expand':
        outcome = opExpand(input)
        break
      case 'roots':
        outcome = opRoots(input, variable, precision)
        break
      case 'solve':
        outcome = opSolve(input, variable, known, precision)
        break
      case 'system':
        outcome = opSystem(args, precision)
        break
      case 'matrix':
        outcome = opMatrix(input, engine, precision, args)
        break
      case 'eigen':
        outcome = opEigen(input, args, precision)
        break
      case 'stats':
        outcome = opStats(args, input, precision)
        break
      case 'dist':
        outcome = opDist(args, precision)
        break
      case 'regression':
        outcome = opRegression(args, input, precision)
        break
      case 'formula':
        outcome = opFormula(args, engine, precision)
        break
      case 'formulas':
        outcome = opFormulas(args)
        break
      case 'ode':
        outcome = opOde(args, engine, precision)
        break
      case 'world':
        outcome = opWorld(args, precision)
        break
      case 'constants':
        outcome = opConstants(args)
        break
      case 'workspace':
        outcome = opWorkspace(args)
        break
      case 'impact':
        outcome = opImpact(args, engine)
        break
      case 'quantities':
        outcome = opQuantities(args)
        break
      case 'formula-table':
        outcome = opFormulaTable(args, engine)
        break
      case 'feasibility':
        outcome = opFeasibility(args)
        break
      case 'derivation':
        outcome = opDerivation(args)
        break
      case 'custom':
        outcome = opCustom(args)
        break
      case 'units':
        outcome = opUnits(args)
        break
      case 'balance':
        outcome = opBalance(args)
        break
      case 'evaluate':
      default:
        outcome = opEvaluate(engine, input, scope, precision)
        break
    }

    const result: MathResult = {
      ok: true,
      operation,
      input,
      result: outcome.result,
      precision,
    }
    if (outcome.value !== undefined) result.value = outcome.value
    const variables = scopeSummary(args.variables)
    if (variables !== undefined) result.variables = variables

    /**
     * 非有限结果的处理：**数值型** operation 才算错误，分析型的不算。
     *
     * 这里的判据是「这个 operation 的目的」：
     *   · 数值型（evaluate/solve/formula…）的目的就是给一个数。
     *     算出 Infinity/NaN 说明输入越界（除以零、log(0)），那确实是错误，
     *     转成结构化错误对模型更友好。
     *   · 分析型（world/derivation/impact/balance…）的目的是给结论。
     *     结论里出现无穷是**信息本身**：混沌拦截要说「误差已超过 100%、不可预测」，
     *     热力图要说「这片区域没有解」，impact 要说「这条公式分母为零」。
     *     把它们判成错误，会让 AI 以为分析失败、把正确结论丢掉。
     *
     * 曾经这里是**黑名单**（`help`/`stats`/`impact` 例外），于是每发现一个
     * 新的分析型 operation 就要补一条 —— `chaos` 就这样被漏了：
     * 它输出了正确的混沌判定，却因为概率云里的 Infinity 被报成 `[non_finite]` 错误。
     *
     * 现在反过来用白名单：只有明确「该给数字」的才算错误。
     */
    const STRICT_FINITE_OPERATIONS: MathOperation[] = [
      'auto', 'evaluate', 'solve', 'system', 'derivative', 'integral',
      'simplify', 'expand', 'roots', 'matrix', 'eigen', 'dist',
      'regression', 'ode', 'formula',
    ]
    if (STRICT_FINITE_OPERATIONS.includes(operation) && containsNonFinite(result.value)) {
      throw new CalcError(
        'non_finite',
        `计算结果非有限（${outcome.result}）`,
        '常见于除以零、tan(π/2)、log(0)。若要符号形式可改用 operation="simplify"。',
      )
    }
    return result
  } catch (error) {
    const translated = translateError(error)
    // 第三层提醒：如果模型用错了 operation，给出明确建议
    let hint = translated.hint
    try {
      const suggestion = suggestOperation(input, operation)
      if (suggestion) {
        hint = hint ? `${hint}\n${suggestion}` : suggestion
      }
    } catch {
      /* 建议生成失败不影响错误返回 */
    }
    return {
      ok: false,
      operation,
      input,
      result: `错误[${translated.type}]: ${translated.message}`,
      precision,
      error: {
        type: translated.type,
        message: translated.message,
        ...(hint === undefined ? {} : { hint }),
      },
    }
  }
}

function clampPrecision(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(numeric)) return DEFAULT_PRECISION
  return Math.min(MAX_PRECISION, Math.max(MIN_PRECISION, Math.round(numeric)))
}

function normalizeVariable(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return DEFAULT_VARIABLE
  const trimmed = value.trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    throw new CalcError('invalid_argument', `变量名 "${trimmed}" 不合法`)
  }
  return trimmed
}

function scopeSummary(variables: unknown): { [key: string]: JsonValue } | undefined {
  if (!variables || typeof variables !== 'object') return undefined
  const entries = Object.entries(variables as Record<string, unknown>)
  if (entries.length === 0) return undefined
  const summary: { [key: string]: JsonValue } = {}
  for (const [key, value] of entries) {
    summary[key] = typeof value === 'number' ? safeNumberForJson(value) : String(value)
  }
  return summary
}

// ────────────────────────────────────────────────────────────────────────────
// Tool 定义
// ────────────────────────────────────────────────────────────────────────────

// 描述来自 awareness.ts —— 集中维护，确保枚举了全部 operation，
// 并且写清楚「何时该用」而不只是「能做什么」。
const DESCRIPTION = TOOL_DESCRIPTION

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true, description: '是否成功' },
    operation: { type: 'string', required: true, description: '实际执行的操作' },
    input: { type: 'string', required: true, description: '原始输入' },
    result: { type: 'string', required: true, description: '格式化结果' },
    precision: { type: 'integer', required: true, description: '使用的精度' },
    value: { type: 'json', description: '机器可读结果' },
    variables: { type: 'object', additionalProperties: true, description: '本次使用的变量' },
    error: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', required: true },
        message: { type: 'string', required: true },
        hint: { type: 'string' },
      },
    },
  },
} as const

function renderResult(value: any): Array<{ type: 'text'; text: string }> {
  const payload = (value ?? {}) as Partial<MathResult>
  if (payload.ok === false) {
    const type = payload.error?.type ?? 'error'
    const message = payload.error?.message ?? '未知错误'
    const hint = payload.error?.hint
    return [{ type: 'text', text: hint ? `错误[${type}]: ${message}\n提示: ${hint}` : `错误[${type}]: ${message}` }]
  }
  const result = typeof payload.result === 'string' ? payload.result : String(payload.result ?? '')
  return [{ type: 'text', text: result }]
}

const PARAMETER_SPEC = {
  expression: {
    type: 'string',
    description:
      '数学表达式、方程或待处理数据。多方程用逗号分隔（3x + 2y = 10, x - y = 1）。' +
      '例：10^20 + 5、factorial(50)、x^3 * sin(x)、[[1,2],[3,4]] * [[5],[6]]、[1,2,3,4]。operation=help 时可空。',
  },
  variables: {
    type: 'object',
    additionalProperties: true,
    description: '变量字典，注入表达式求值的环境。例：{"m": 500, "v": 30, "c": 299792458}。值可为数字或数字字符串（大数）。',
  },
  operation: {
    type: 'string',
    enum: OPERATIONS,
    description:
      '默认 auto。evaluate=求值，solve=解方程（多方程自动识别为线性方程组），system=显式线性系统，' +
      'derivative=求导，integral=符号积分，simplify=化简，expand=展开，roots=多项式求根，' +
      'matrix=矩阵运算，eigen=特征值/特征向量，stats=描述统计，dist=概率分布，regression=回归，help=能力清单。',
  },
  variable: {
    type: 'string',
    description: '求导/求根/积分的自变量，默认 "x"。',
  },
  unitValue: {
    type: 'number',
    description:
      '换算的数值。operation=units 时使用；不给则按 1 计。' +
      '例：{operation:"units", unitValue:30, unitFrom:"里", unitTo:"km"} → 15 km。',
  },
  unitFrom: {
    type: 'string',
    description:
      '源单位。operation=units 时使用。支持中文古制（里/丈/尺/寸/步/亩/顷/斤/两/石/斗/刻/时辰/更）、' +
      '英制（英里/英尺/磅/加仑）、天文（AU/光年/秒差距/地球半径/太阳半径）。' +
      '只给单位不给参数则列出全部可用单位。',
  },
  unitTo: {
    type: 'string',
    description: '目标单位，与 unitFrom 同量纲。',
  },
  customUnits: {
    type: 'array',
    description:
      '项目自定义单位，可覆盖内置（如把「里」定成 576 m）。' +
      '每项 {name, dimension, factor, aliases?, note?}，factor 是换成该量纲基准单位的系数。' +
      'dimension 可用：length/mass/time/area/volume/energy/power/temperature/speed。',
  },
  balance: {
    type: 'object',
    additionalProperties: true,
    description:
      '收支盘点（operation=balance）。每项 {demand: 需求量, supply: 能提供多少, unit?: 单位}。' +
      '内置键名 grain/water/energy/land/fiscal/army/info，也可自定。' +
      '给最短板 K=min(supply/demand)，回答「几项一起看这个势力撑不撑得住」。' +
      '只判社会收支；单项生理/工程上限请用 feasibility。',
  },
  matrix: {
    type: 'array',
    description: '二维矩阵，例如 [[1,2],[3,4]]。operation=matrix/eigen/system 时使用。',
  },
  vector: {
    type: 'array',
    description: '一维向量（解线性系统时的右端项），例如 [5,6]。',
  },
  precision: {
    type: 'integer',
    description: 'BigNumber 有效数字位数，默认 64，范围 1-256。',
  },
  data: {
    type: 'array',
    description: '统计/回归的样本数据（X），例如 [1,2,3,4]。',
  },
  dataY: {
    type: 'array',
    description: '回归的因变量（Y），长度须与 data 一致。',
  },
  distribution: {
    type: 'string',
    description: '概率分布名：normal / binomial / poisson / exponential / chisquare / t / normalinv / quantile。',
  },
  params: {
    type: 'array',
    description: '分布参数：normal 用 [均值, 标准差]；binomial 用 [n, p]；poisson 用 [lambda]；chisquare/t 用 [df]。',
  },
  x: {
    type: 'number',
    description: '分布计算的自变量取值（求 CDF/PDF 的点）。',
  },
  degree: {
    type: 'integer',
    description: '多项式回归的次数，默认 1（线性）。',
  },
  formula: {
    type: 'string',
    description:
      'operation="formula" 时要调的公式 id 或名称，例如 "escape_velocity"、"逃逸速度"、"cobb_douglas"。' +
      '用 operation="formulas" 检索可用公式。',
  },
  overrides: {
    type: 'object',
    additionalProperties: true,
    description:
      '覆盖公式里的任意参数 —— 这是架空世界改造的关键。' +
      '例如把重力改成 1.5 倍地球：{"g": 14.71}；把光速改成 1e8：{"c": 100000000}。' +
      '任何带默认值的参数都能这样覆盖。',
  },
  customExpression: {
    type: 'string',
    description:
      'structure 级改造：临时替换公式的表达式，仍沿用该公式的参数名。' +
      '例如 operation="formula", formula="weight", customExpression="m * g * 1.3" 表示该世界重力异常 +30%。',
  },
  query: {
    type: 'string',
    description: 'operation="formulas" 的检索关键词，例如 "重力"、"熵"、"人口"；传 "*" 或留空列出全部分类。',
  },
  initial: {
    type: 'object',
    additionalProperties: true,
    description:
      'operation="ode" 的初值条件。例如 {"S": 999, "I": 1, "R": 0}。' +
      '二阶方程降阶后可能还需要辅助变量（如 y_d 表示 dy/dt），缺了会提示补哪个。',
  },
  from: {
    type: 'number',
    description: 'operation="ode" 的积分起点，默认 0。',
  },
  to: {
    type: 'number',
    description: 'operation="ode" 的积分终点，默认 10。',
  },
  steps: {
    type: 'integer',
    description: 'operation="ode" 的 RK4 步数，默认 1000。步数越大越准、越慢；刚性方程需要更多步。',
  },
  samples: {
    type: 'integer',
    description: 'operation="ode" 在结果里返回的采样点数量上限，默认 24。',
  },
  world: {
    type: 'object',
    additionalProperties: true,
    description:
      'operation="world" 的世界参数，**全部可选，默认地球**。只改你想改的那几个即可。\n' +
      '恒星：starMass(太阳质量)、starRadius(太阳半径)、starTemp(K,默认5778)\n' +
      '轨道：orbitAU(AU,默认1)、eccentricity(默认0.0167)\n' +
      '行星：planetMass(地球质量,默认1)、planetRadius(地球半径,默认1)、rotationHours(默认23.93)、obliquityDeg(默认23.44)、albedo(默认0.306)\n' +
      '大气：pressure(Pa,默认101325)、molarMass(kg/mol,默认0.02896)、gamma(默认1.4)、greenhouse(增温K,默认33)\n' +
      '地表：materialStrength(Pa,默认1.3e8花岗岩)、materialDensity(默认2700)\n' +
      '例：{"planetRadius":1.4,"rotationHours":40,"obliquityDeg":45,"greenhouse":10}',
  },
  planetRadius: {
    type: 'number',
    description: 'operation="world" 便捷参数：行星半径（地球半径为单位）。',
  },
  planetMass: {
    type: 'number',
    description: 'operation="world" 便捷参数：行星质量（地球质量为单位）。',
  },
  rotationHours: {
    type: 'number',
    description: 'operation="world" 便捷参数：自转周期（小时）。',
  },
  obliquityDeg: {
    type: 'number',
    description: 'operation="world" 便捷参数：轴倾角（度）。',
  },
  terrain: {
    type: 'object',
    additionalProperties: true,
    description:
      'operation="world" 的局部地形推演。给了就会额外输出该地点的气候细节。\n' +
      'kind: coastal/plain/plateau/mountain/valley/desert/forest/tundra/island/lake\n' +
      'elevation: 海拔 m | distanceToSea: 距海 km | latitudeDeg: 纬度\n' +
      'annualPrecipMm: 基准年降水 mm | humidity: 0-1\n' +
      'windward: 1=迎风坡, -1=背风坡 | reliefHeight: 山峰相对高度 m\n' +
      'oceanCurrent: warm/cold/none | surface: soil/sand/rock/ice/water/vegetation\n' +
      '例：{"kind":"coastal","elevation":20,"distanceToSea":5,"latitudeDeg":60,"oceanCurrent":"warm"}',
  },
  constants: {
    type: 'object',
    additionalProperties: true,
    description:
      'operation="constants" 要改的物理常数（**只能改基础旋钮**，派生量会自动重算）。\n' +
      '基础旋钮: c(光速) / G(引力常数) / h(普朗克) / kB(玻尔兹曼) / e_charge(元电荷) / ' +
      'me(电子质量) / mp(质子质量) / NA(阿伏伽德罗) / epsilon0(真空介电常数)\n' +
      '派生量（会自动跟随，不能直接改）: hbar, R, mu0, kCoulomb, sigma, bWien, alpha_fs, Ry, muB\n' +
      '例：{"c": 1.5e8} 会让 mu0/sigma/alpha_fs 等自动重算，并评估世界偏离程度。',
  },
} as const

/**
 * 工具定义：官方 `defineTool`，与 DSH 社区成熟插件同一写法。
 */
/**
 * 最近一次工具调用的执行上下文结构（诊断用）。
 *
 * 为什么需要：数据表跟着工作区走，靠的就是 exec 里的 cwd。
 * 一旦宿主换了字段名，表面现象是「数据表不跟着切换」，
 * 而代码里没有任何信号。这个快照让原因可观察。
 */
/**
 * 插件上下文引用（apply 时赋值）。
 *
 * 工具要读宿主服务（workingDirectory）拿当前工作目录，
 * 但 defineTool 的定义在模块级、拿不到 apply 的局部变量。
 */
let ctxRef: any = null

/**
 * 数学计算工具（`math_execute`）。
 *
 * 25 个 operation 的对外入口。执行前会把「当前会话的工作区」切成
 * 数据表作用域，所以同一个工具在不同工作区里用的是不同的数据。
 */
export const mathExecuteTool = defineTool({
  name: TOOL_NAME,
  description: DESCRIPTION,
  parameters: PARAMETER_SPEC,
  output: {
    schema: OUTPUT_SCHEMA,
    render: (_args, value) => renderResult(value),
  },
  execute: async (args, exec) => {
    const rawArgs = (args ?? {}) as Partial<MathArgs>

    // ⚠️ 关键：每次工具调用都把**当前会话的工作区**切过来。
    //
    // 做法照 dsh-memory 的 scopeOf：用 exec.agent.meta.cwd 的 basename
    // 作为作用域（D:\0cengxu\5 → "5"）。这样：
    //   · 用户在会话 A（cwd=D:\proj-a）里算数 → 用 proj-a 的数据表；
    //   · 切到会话 B（cwd=D:\proj-b）再算 → 自动换成 proj-b 的表；
    //   · 两张表互不影响，且表名与左侧工作区名一致。
    //
    // 之前忽略了 exec 参数，所以数据表永远停在 default，不跟工作区走。
    try {
      // cwd 来源（按可靠性排序）：
      //   ① 宿主 workingDirectory 服务 —— 权威来源（sessionProjections 的
      //      workingDirectory 投影就是 header.cwd）；
      //   ② exec / agent.session 上直接能读到的 cwd —— 兼容不同宿主版本；
      //   ③ 都没有 → 空串 → 作用域回落 default（不切表，保持可用）。
      let cwd = cwdOfExec(exec)
      if (cwd === '') {
        try {
          const directories = optionalService(ctxRef, 'workingDirectory')
          if (directories && typeof directories.ensure === 'function' && exec && (exec as any).agent) {
            const resolved = await directories.ensure((exec as any).agent, (exec as any).signal)
            if (typeof resolved === 'string' && resolved.trim() !== '') cwd = resolved.trim()
          }
        } catch {
          /* 服务不可用：退回下面的会话读取 */
        }
      }
      if (cwd === '') {
        cwd = cwdOfSession((exec as any)?.agent?.session)
      }
      const scope = scopeFromCwd(cwd)
      // 诊断：把「取到的 cwd / 推出的作用域 / exec 有哪些键」记下来，
      // 供 GET client-status 读取。排查 cwd 取不到时唯一可靠的证据。
      setLastExecShape({
        at: new Date().toISOString(),
        isUndefined: exec === undefined,
        topKeys: exec && typeof exec === 'object' ? Object.keys(exec as object) : [],
        agentKeys: (exec as any)?.agent && typeof (exec as any).agent === 'object' ? Object.keys((exec as any).agent) : null,
        agentMetaKeys: (exec as any)?.agent?.meta && typeof (exec as any).agent.meta === 'object' ? Object.keys((exec as any).agent.meta) : null,
        sessionKeys: (exec as any)?.session && typeof (exec as any).session === 'object' ? Object.keys((exec as any).session) : null,
        resolvedCwd: cwd,
        resolvedScope: scope,
      })
      if (scope !== currentWorkspace()) switchWorkspace(scope)
    } catch {
      /* 切换失败不影响本次计算（仍在原表上算） */
    }

    try {
      return runMathTool(rawArgs)
    } catch (error) {
      const translated = translateError(error)
      return {
        ok: false,
        operation: 'evaluate',
        input: typeof rawArgs.expression === 'string' ? rawArgs.expression : '',
        result: `错误[${translated.type}]: ${translated.message}`,
        precision: DEFAULT_PRECISION,
        error: {
          type: translated.type,
          message: translated.message,
          ...(translated.hint === undefined ? {} : { hint: translated.hint }),
        },
      }
    }
  },
})

// ────────────────────────────────────────────────────────────────────────────
// Cordis 插件入口
// ────────────────────────────────────────────────────────────────────────────

/** cordis 插件名：宿主用它做插件去重与排序，必须与 package.json 的 name 一致。 */
export const name = PLUGIN_NAME

/**
 * 必需服务：只有 `tools`。
 *
 * ⚠️ **不要再写 `injectOptional`**：cordis 4 没有这个 API。
 * 实测（宿主 DSH 0.2.1-rc.2 / cordis 4.0.5，在宿主自己的 `@deepseek-ai/*` 包里全量 grep
 * `injectOptional` = 0 命中）：`ctx` 是 Proxy，读一个没有 `inject` 声明的服务会直接抛
 *
 *     Error: cannot get property "systemPrompt" without inject
 *
 * 抛出点在 `apply` 内部 → 整个 entry 判为 “did not activate” → **工具根本注册不上**，
 * 而单元测试用的桩 ctx 不校验 inject，所以 1008 项全绿也照样全盘失效。
 * 可选服务一律用 {@link optionalService}（即 `ctx.get`）读。
 */
export const inject = ['tools']

/**
 * 读一个**可选**宿主服务。
 *
 * cordis 明文的读法是 `ctx.get(name)`——“Read a service from the store without the
 * inject requirement”，服务没提供时返回 `undefined`。这也是 dsh-novel-writer 在
 * 生产里用的写法（其 `readHostService`）。
 *
 * 非 cordis 环境（单元测试桩、MCP）没有 `ctx.get`，退回属性访问；属性访问在真宿主上
 * 会被 Proxy 拦下抛错，所以两层都包 try/catch。
 *
 * @param ctx - 插件上下文。
 * @param name - 服务名。
 * @returns 服务实例，或 undefined。
 */
function optionalService(ctx: any, name: string): any {
  try {
    if (ctx && typeof ctx.get === 'function') return ctx.get(name)
  } catch {
    /* 未注册的服务：ctx.get 也可能抛错，按“没有”处理 */
  }
  try {
    return ctx ? ctx[name] : undefined
  } catch {
    /* 属性访问同样可能被 Proxy 拦截 */
  }
  return undefined
}

/**
 * 插件入口：注册工具 → 三层提醒 → UI 后端路由。
 *
 * 顺序有意为之：
 *   1. 先注册工具 —— 即使后面的可选服务全不可用，核心能力也要在；
 *   2. 再挂钩子与系统提示 —— 失败只影响"提醒模型来用"，不影响工具；
 *   3. 最后挂 HTTP 路由 —— 依赖 webServer，headless 宿主没有时静默跳过。
 *
 * 每一步独立 try/catch：任何一步失败都不能让整个 entry 判为 did not activate
 * （那会导致工具根本没注册，是踩过的真机事故）。
 */

/**
 * 把宿主的工作区「批量同步」成数据表（node 侧执行，不依赖浏览器）。
 *
 * 这是用户要的「自动创建」的真正落地点：
 *   ① **安装后补建**：apply 时立刻跑一次，把已存在的工作区全部建表；
 *   ② **新建即建表**：订阅 registry 变更，新工作区出现就建表。
 *
 * 数据来源是宿主 `workspaceRegistry` 服务（node 侧可用，dsh-memory 也用它）：
 *
 *   ctx.workspaceRegistry.list()  // [{ id, path, title, sessionIds, ... }]
 *
 * 早先只在**浏览器侧**（client.ts）触发 sync，依赖面板被打开；
 * 面板没点开就一张表都不建 —— 这正是「装好了却没建表」的原因。
 * node 侧不受这个限制：只要插件激活就会执行。
 *
 * @param ctx - 插件上下文
 * @returns 同步汇总；无法同步时返回 null
 */
function syncHostWorkspaces(ctx: any): { total: number; created: number } | null {
  try {
    const registry = optionalService(ctx, 'workspaceRegistry')
    if (!registry || typeof registry.list !== 'function') return null
    const list = registry.list()
    if (!Array.isArray(list) || list.length === 0) return null
    let created = 0
    for (const workspace of list) {
      try {
        const title = typeof workspace?.title === 'string' ? workspace.title : ''
        const path = typeof workspace?.path === 'string' ? workspace.path : ''
        const hostId = typeof workspace?.id === 'string' ? workspace.id : ''
        // 批量建表不切当前表（否则当前会变成最后一个）
        const result = bindHostWorkspace(hostId, title !== '' ? title : path, false)
        if (result.created) created += 1
      } catch {
        /* 单个工作区失败不影响其它 */
      }
    }
    return { total: list.length, created }
  } catch {
    return null
  }
}

/**
 * 插件入口。
 *
 * 按顺序做几件事，**每一步独立 try/catch**（任何一步失败都不能让整个 entry
 * 判为 did not activate —— 那会导致工具根本没注册，是踩过的真机事故）：
 *
 * 1. 自动建表：把宿主已有工作区补齐同名数据表，并订阅后续变更；
 * 2. 注册 math_execute 工具；
 * 3. 挂钩子与系统提示（失败只影响「提醒模型来用」）；
 * 4. 挂 HTTP 路由（依赖 webServer，headless 宿主没有时静默跳过）。
 *
 * @param ctx - cordis 插件上下文
 */
export function apply(ctx: any): void {
  if (!ctx || typeof ctx.tools?.register !== 'function') {
    throw new Error(`${PLUGIN_NAME}: 宿主未提供 tools 服务，无法注册 ${TOOL_NAME}`)
  }

  // 保存插件上下文：工具执行时要靠它读 workingDirectory 服务拿 cwd。
  // 工具定义是模块级的（宿主按名注册），拿不到 apply 的局部变量，
  // 所以用模块级引用把 ctx 传进去。
  ctxRef = ctx

  // ── 自动建表（node 侧执行，不依赖浏览器打开面板）──
  //
  // ① 安装后补建：把所有已存在的宿主工作区建出同名数据表；
  // ② 新建即建表：订阅 workspaceRegistry 变更，新工作区出现就补上。
  //
  // 这一步失败**不影响**工具注册（自动建表是增强，不是必需）。
  // 早先只在浏览器侧触发，面板没点开就一张表都不建 —— 这是「装好了却没建表」的根因。
  try {
    const first = syncHostWorkspaces(ctx)
    if (first && first.created > 0) {
      console.log(`[${PLUGIN_NAME}] 已为 ${first.created}/${first.total} 个宿主工作区自动创建数据表`)
    }
  } catch {
    /* 自动建表失败：工具照样可用 */
  }
  try {
    const registry = optionalService(ctx, 'workspaceRegistry')
    if (registry && typeof registry.subscribe === 'function') {
      registry.subscribe(() => {
        try {
          syncHostWorkspaces(ctx)
        } catch {
          /* 单次同步失败忽略 */
        }
      })
    }
  } catch {
    /* 没有订阅接口：只做启动那一次 */
  }

  ctx.tools.register(mathExecuteTool)

  // ── 第三层提醒：实时检测模型「思维中的计算需求」──
  //
  // 用 agent/pre-step 钩子：它在模型发起请求前介入，
  // 能通过 { kind: 'enter', messages } 往对话里插入提醒消息。
  //
  // 之所以需要这一层：系统提示注入是「被动提醒」，
  // 模型可能读而不采。这一层是「主动询问」——
  // 检测到用户消息里有大量数字或数学运算时，直接把提醒放进消息流。
  //
  // 防打扰：每会话最多 3 次、有冷却、模型用过插件后静默。
  try {
    const ctxAny = ctx as any
    if (typeof ctxAny.on === 'function') {
      ctxAny.on('agent/pre-step', async (payload: any, next: () => Promise<any>) => {
        try {
          const decision = await next()
          if (!decision || decision.kind !== 'enter') return decision
          const messages = Array.isArray(decision.messages) ? decision.messages : []
          if (messages.length === 0) return decision

          // 取最后一条用户消息的文本
          const lastUser = [...messages].reverse().find((m: any) => m && m.role === 'user')
          if (!lastUser) return decision
          const text =
            typeof lastUser.content === 'string'
              ? lastUser.content
              : Array.isArray(lastUser.content)
                ? lastUser.content
                    .filter((block: any) => block && block.type === 'text')
                    .map((block: any) => String(block.text ?? ''))
                    .join('\n')
                : ''
          if (text.trim() === '') return decision

          // 会话标识：优先用 sessionId，退化为 agent 标识
          const sessionKey = String(
            payload?.agent?.sessionId ?? payload?.agent?.id ?? payload?.sessionId ?? 'default',
          )
          const step = typeof payload?.step === 'number' ? payload.step : 0

          // 本会话是否已用过插件。
          //
          // ⚠️ 必须看**结构化的工具调用痕迹**，绝不能看文本里有没有 "math_execute"。
          // 曾经写成 `content.includes('math_execute')`，而我们的系统提示每轮注入、
          // 且必然包含这个词 —— 于是 toolUsed 恒为 true，检测器从第一轮之后永久静默，
          // 主动提醒的命中率归零（检测器本身命中率其实有 72%）。
          // 另外「用户问 math_execute 怎么用」也会被误判成「已用过」。
          //
          // 三种真实形态都算用过：
          //   · OpenAI 风格：assistant 消息带 tool_calls 数组
          //   · Anthropic 风格：content 数组里有 type === 'tool_use' 的块
          //   · 工具结果消息：role === 'tool'
          const toolUsedInSession = messages.some((m: any) => {
            if (!m || typeof m !== 'object') return false
            if (m.role === 'tool') return true
            if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) return true
            if (Array.isArray(m.content)) {
              return m.content.some(
                (block: any) => block && typeof block === 'object' && block.type === 'tool_use',
              )
            }
            return false
          })

          const detection = shouldPromptNow(sessionKey, text, step, toolUsedInSession, detectorConfig)
          if (!detection.shouldPrompt) return decision

          // 插入提醒：作为一条 system 角色的提示消息追加在用户消息之后
          const reminder = {
            role: 'system',
            content: buildReminderMessage(detection),
          }
          recordPrompt(sessionKey, step)

          return {
            ...decision,
            messages: [...messages, reminder],
          }
        } catch {
          // 检测失败绝不影响正常对话
          try {
            return await next()
          } catch {
            return { kind: 'reject' }
          }
        }
      })
    }
  } catch {
    /* 宿主不支持 agent/pre-step 时跳过这一层 */
  }

  // ── 第二层提醒：系统提示注入 ──
  // 每轮对话都会带上简短提醒，解决「对话长了忘记有插件」的问题。
  // systemPrompt 是**可选**服务：必须走 optionalService，不能直接 ctx.systemPrompt
  // （cordis 的 Proxy 会抛 cannot get property ... without inject，见文件上方 inject 注释）。
  const systemPrompt = optionalService(ctx, 'systemPrompt')
  if (systemPrompt && typeof systemPrompt.section === 'function') {
    try {
      systemPrompt.section({
        name: 'math-calculator',
        order: 180,
        text: () => buildSystemPromptSection(),
      })
    } catch {
      /* 注入失败不影响工具 */
    }
  }

  // ── UI 后端路由 ──
  //
  // 宿主契约：服务名 `webServer`（由 @deepseek-ai/dsh-host-webserver 提供），
  // 用嵌套的 `ctx.inject(['webServer'], cb)` 拿上下文，再 `webServer.register({kind,path,handler})`。
  // 嵌套 inject 不会阻塞本插件加载：webServer 永远不出现（headless / CLI 宿主）时只是回调不跑。
  // 详见 api.ts 顶部的契约说明。
  try {
    const injectFn = (ctx as any).inject
    if (typeof injectFn === 'function') {
      injectFn.call(ctx, ['webServer'], (webCtx: any) => {
        const webServer = webCtx?.webServer
        if (!webServer || typeof webServer.register !== 'function') return undefined
        // 逐条注册并逐条记录失败：注册失败 = 面板接口整块消失，
        // 而它的表现和「面板还没打开」完全一样，静默的话永远查不出来。
        const disposers: Array<() => void> = []
        for (const route of buildApiRoutes()) {
          try {
            disposers.push(webServer.register(route))
          } catch (error) {
            console.error(
              `[${PLUGIN_NAME}] UI 路由注册失败 (${route.kind} ${route.path}):`,
              error instanceof Error ? error.message : String(error),
            )
          }
        }
        return () => {
          for (const dispose of disposers) {
            try {
              dispose()
            } catch {
              /* 单个 route 移除失败不影响其它 */
            }
          }
        }
      }, 'dsh-math-calculator: UI 路由')
    }
  } catch {
    /* 非 cordis 环境（测试桩 / MCP）：没有 UI 路由，工具照常可用 */
  }
}

export default { name, inject, apply, mathExecuteTool }
