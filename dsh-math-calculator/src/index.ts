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
  isNonFiniteValue,
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
  displayPrecisionOf,
  scopeFromCwd,
  setLastExecShape,
  switchWorkspace,
  updateWorkspace,
  workspaceDirectory,
  workspaceVariablesOf,
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
  currentDisplayPrecision,
  fast,
  normalizeSource,
  normalizeChineseUnits,
  rational,
  safeNumberForJson,
  setActiveDisplayPrecision,
  trimNumber,
  type MathArgs,
  type MathOperation,
  type Outcome,
} from './ops/shared.js'
import {
  PRECISION_LOSS_THRESHOLD,
  consumePrecisionLoss,
  isDisplayPrecisionExplicit,
  setDisplayPrecisionExplicit,
} from './precision-report.js'
import { opOde } from './ops/ode-op.js'
import { opWorld } from './ops/world-op.js'
import { opConstants } from './ops/constants-op.js'
import { opWorkspace } from './ops/workspace-op.js'
import { opImpact } from './ops/impact-op.js'
import { opQuantities } from './ops/quantities-op.js'
import { opFormulaTable } from './ops/formula-table-op.js'
import { opFeasibility } from './ops/feasibility-op.js'
import { opDerivation, DERIVATION_SUBCOMMANDS } from './ops/derivation-op.js'
import { WORLD_KEYS } from './world-params.js'
import { annotateMagnitude, annotateMetricPrefix, checkAnchors, checkAngleUnit, checkLabelMagnitude, explainUnitResult, findBatchAnomalies } from './guards.js'
import { opCustom } from './ops/custom-op.js'
import { opUnits } from './ops/units-op.js'
import { opBalance } from './ops/balance-op.js'
import { opBodies } from './ops/bodies-op.js'
import { KIND_LABEL, empiricalNoteOf } from './empirical-decomposition.js'
import { cacheKey, clearCache, getCached, setCached } from './result-cache.js'

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
  /**
   * 本次结果来自缓存（未重新计算）。
   *
   * 为什么要暴露：AI 需要知道「这个数是刚算的还是回忆的」——
   * 若它以为自己刚验证过而实际只是缓存，会把「没改过设定」误当成「验证通过」。
   * 改动常数或切换工作区后缓存键会变，所以不会出现「改了设定还拿旧值」。
   */
  cached?: boolean
  /**
   * 附加提示（渲染时展示给模型，**不进入 `result`**）。
   *
   * 为什么要分开：`result` 是数据通道，调用方会做精确相等比较；
   * 往里拼提示会让 `0.1+0.2` 从 `0.3` 变成两行，破坏所有精确断言。
   * 提示属于「给人/模型看的说明」，走这个字段即可。
   */
  notice?: string
  /**
   * 批量模式：「部分成功」——本批有失败条目，但也有成功结果可用。
   *
   * 为什么要单独一个字段：`ok` 是布尔，说不了「废了几条、还剩几条」。
   * 没有它，调用方只能二选一：整批当废（浪费成功条目）或整批当可用（把失败当成功）。
   */
  partial?: boolean
  /** 批量模式：失败条目数。 */
  failed?: number
  /** 批量模式：成功条目数。 */
  succeeded?: number
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
/**
 * 显示精度默认值：**小数点后 8 位**。
 *
 * 为什么不默认「完整输出」：64 位小数一条结果就是六十五个字符，
 * 人和 AI 都得自己截断。8 位小数对创作与工程核对都够用，
 * 而整数永远完整输出（`10^20+5` 不受影响）。
 *
 * 为什么是 8 而不是 6：6 位小数在千级数字上只剩 `5307.267206`，
 * 而实测常见需求（月供、速度、重力）到这个精度就够；
 * 再少会让「1.5 倍重力 = 14.71 m/s²」这类值看着不够准。
 */
const DEFAULT_DISPLAY_PRECISION = 8
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
/**
 * 批量求值的条数上限。
 *
 * 为什么不设很大：批量是为了省往返，不是拿来跑百万条数据的。
 * 100 条已能覆盖「一个表格的几列」这类常见需求；再多应该走
 * 代码沙箱/数据引用（本插件不做），否则结果文本本身就把上下文撑满了。
 */
const MAX_BATCH_EXPRESSIONS = 100

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
  'bodies',
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
/**
 * 给括号类语法错补一句「在哪一层、哪一对对不上」。
 *
 * ## 为什么需要它
 *
 * 原来的提示是一句固定文案「检查括号是否配对、运算符是否连续」——
 * 对长公式等于没说。实测反馈原话：char 25 指向的是多余的右括号，
 * 真正缺的那个左括号在更前面，人得自己数。
 *
 * 这里做的是**最小可用的定位**，不是完整解析器：
 *   · 扫一遍得到每个括号的层级与配对状态
 *   · 报出第一处不配对的位置（缺左 / 多右）
 *   · 回显表达式并在下方标出各层的起止
 *
 * ## 为什么不做「自动补括号」
 *
 * 猜意图补全括号，猜错时会把报错变成一个**算错的数** ——
 * 比直接报错糟得多。这里只指出位置，补不补、补在哪，由调用方决定。
 *
 * @param source - 归一化后的表达式
 * @returns 提示文本；括号本身平衡时返回空串（说明不是括号问题）
 */
function diagnoseParentheses(source: string): string {
  if (typeof source !== 'string' || source === '') return ''
  const openAt: Array<{ index: number; depth: number }> = []
  const pairs: Array<{ open: number; close: number; depth: number }> = []
  let depth = 0
  let firstUnexpectedClose = -1
  /** 引号内的括号不算结构（例如 5 cm to "inch(2)" 这类）。 */
  let inQuote: string | null = null

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    if (inQuote !== null) {
      if (ch === inQuote) inQuote = null
      continue
    }
    if (ch === '"' || ch === "'") { inQuote = ch; continue }
    if (ch === '(') {
      openAt.push({ index: i, depth })
      depth += 1
    } else if (ch === ')') {
      depth -= 1
      const opened = openAt.pop()
      if (opened === undefined) {
        if (firstUnexpectedClose < 0) firstUnexpectedClose = i
        depth = 0
      } else {
        pairs.push({ open: opened.index, close: i, depth: opened.depth })
      }
    }
  }

  const lines: string[] = []
  if (firstUnexpectedClose >= 0) {
    lines.push('第 ' + (firstUnexpectedClose + 1) + ' 个字符处的 ")" 没有对应的左括号')
    if (openAt.length > 0) {
      lines.push('这几个左括号始终没配上: ' + openAt.map(function (o) { return '第 ' + (o.index + 1) + ' 字符' }).join('、'))
    }
    lines.push('多数情况是它前面漏了一个 "("')
  } else if (openAt.length > 0) {
    lines.push('这几个左括号没有闭合: ' + openAt.map(function (o) { return '第 ' + (o.index + 1) + ' 字符' }).join('、'))
    lines.push('在末尾补上 ' + openAt.length + ' 个 ")" 即可（若本意不是这样，删掉多余的 "("）')
  } else {
    return ''
  }

  /** 回显表达式并标出层级（超过 120 字符只给结论，避免糊成一片）。 */
  if (source.length <= 120) {
    const marks: string[] = []
    for (let i = 0; i < source.length; i += 1) marks.push(' ')
    for (const pair of pairs) {
      marks[pair.open] = String(Math.min(9, pair.depth))
      marks[pair.close] = String(Math.min(9, pair.depth))
    }
    lines.push('')
    lines.push(source)
    lines.push(marks.join(''))
    lines.push('（数字标的是括号层级，同层级的左右括号应该一一对应）')
  }
  return lines.join('\n')
}

/**
 * 语法错误的具体解释：**先认常见误因，再退到通用诊断**。
 *
 * ## 为什么需要分类
 *
 * 实测反馈（2026-11-06 第二份）列了三种同 `syntax` 但原因完全不同的情况：
 *
 * ```
 *   / 112.5e8     → 「检查括号是否配对、运算符是否连续」
 *   2.66亿 * 330  → 没有任何提示
 *   1,000 * 2     → 仍说「检查括号」  ← 真因是千分位逗号
 * ```
 *
 * 第三条最糟：**提示指向了错误的方向**。用户会去数括号，而问题是逗号。
 *
 * ## 顺序：具体 → 通用
 *
 * 越具体的误因越先判，因为它们能被可靠识别；都认不出才用括号诊断兜底。
 *
 * @param source - 归一化后的表达式
 * @param engineText - 引擎给的原始消息（含 char 位置）
 * @returns 解释文本
 */
function explainSyntax(source: string, engineText: string): string {
  const at = engineText.match(/char ([0-9]+)/i)
  const position = at ? Number(at[1]) : 0
  /** 出错字符附近的一小段，便于用户对照。 */
  const snippet = position > 0 && source.length > 0
    ? source.slice(Math.max(0, position - 1), Math.min(source.length, position + 6))
    : ''

  /**
   * ① 千分位逗号 —— 中文语料里极常见（`1,000`、`139,000,000`）。
   * 引擎把逗号当分隔符，报语法错。
   */
  if (/[0-9],[0-9]{3}/.test(source)) {
    return '无法解析：表达式里有**千分位逗号**（如 1,000）。去掉逗号即可 —— 千分位只是书写习惯，不参与计算。'
  }

  /**
   * ② 中文/未知字符 —— 量级词与中文单位若无对应展开，会落到这里。
   * 给出可操作的下一步（而不是「检查括号」）。
   */
  if (/[\u4e00-\u9fff]/.test(source)) {
    return '无法解析：表达式里有中文。中文单位（里/丈/亩/斤/吨）与量级词（万/亿/万亿）可直接写；' +
      '其它中文标识符请改用英文变量名，或先存进工作区。'
  }

  /**
   * ③ 运算符位置 —— 开头/连续运算符。
   */
  if (/^[*/+^]|\/\/|[*/+^]{2,}/.test(source)) {
    return '无法解析：运算符位置不对' + (position > 0 ? '（第 ' + position + ' 个字符附近「' + snippet + '」）' : '') +
      '。检查是否以运算符开头，或出现连续运算符。'
  }

  /**
   * ④ 兜底：括号诊断（它会给出层级图），再退到通用建议。
   */
  const diagnostic = diagnoseParentheses(source)
  if (diagnostic) return diagnostic

  return '检查括号是否配对、运算符是否连续。' +
    (position > 0 ? '（引擎报错位置：第 ' + position + ' 个字符「' + snippet + '」）' : '')
}

/**
 * 把 mathjs `Unexpected type of argument in function to` 这类内部报错
 * 翻译成调用方能行动的说法。
 *
 * ## 为什么它必须单独处理
 *
 * 实测（1107 报告问题 6）：
 *
 * ```
 *   (0.907 kg / (10 hp * 0.475)) to min
 *   → 错误[internal]: Unexpected type of argument in function to
 *      (expected: Unit or string or ... actual: function, index: 1)
 * ```
 *
 * `internal` 在本项目的约定里意思是**工具自己坏了** —— 会让人去重试，
 * 而真实原因有四种，全部是写法问题：
 *
 * ```
 *   ① 目标单位名撞上内置函数   1 s to min    → actual: function
 *      （min/max/mean/sum/abs/round… 在 mathjs 里是函数，不是单位）
 *   ② 值根本不是单位           0.5 to kW     → actual: Unit | identifier
 *      （`to` 只能把**带单位的量**换算，裸数字没有单位可换）
 *   ③ 值算了半天不是有限数     (1/0) to kW
 *   ④ 目标单位拼错             2 m to cmm
 * ```
 *
 * 四类的修复方向完全不同，所以不能笼统说「检查写法」。
 *
 * @param message - mathjs 的原始消息
 * @returns 翻译后的错误；认不出时返回 null（交给上层兜底）
 */
function translateToError(message: string): CalcError | null {
  if (!/in function to\b/i.test(message)) return null
  /** ① 目标单位名是内置函数：消息里 `actual: function` 就是这个信号。 */
  if (/actual: function/i.test(message)) {
    const known = ['min','max','mean','median','mode','sum','prod','std','variance','abs','sqrt','exp','log','floor','ceil','round','sign','norm','size','index','count','map','filter']
    return new CalcError(
      'unit_name_conflict',
      '目标单位名与内置函数同名，mathjs 把它当函数而不是单位',
      '常见撞名: ' + known.slice(0, 10).join(' / ') + ' …' +
        '。时间单位写全称（minute / hour / second），或改用 operation="units"' +
        '（units 的单位表与函数命名空间互不干扰）。',
    )
  }
  /** ② 值不是单位：`actual: Unit | identifier` 说明左边根本没解析成带单位的量。 */
  if (/actual: Unit \| identifier/i.test(message)) {
    return new CalcError(
      'not_a_quantity',
      'to 只能给「带单位的量」换算，左边这个值不带单位',
      '要么写成带单位的形态（1 hp、2 kg），要么先去算出一个带单位的结果；' +
        '纯数字换单位请用 operation="units"（给 unitValue/unitFrom/unitTo）。',
    )
  }
  /** ③ 剩下的是「左边算出来不是有限数量」，最典型是除以零。（按 4 类） */
  return new CalcError(
    'not_a_quantity',
    'to 的目标单位没被识别，或左边的值不构成可换算的量',
    '检查目标单位拼写（cm / cm^3 / MJ/kg）；若左边算式含除法，先确认它没除以零。',
  )
}
function translateError(raw: unknown, fallbackType = 'internal', source = ''): CalcError {
  if (raw instanceof CalcError) return raw
  if (raw instanceof SymbolicError) {
    return new CalcError(raw.stage, raw.message, '符号引擎的能力有限，可尝试 operation="integral" 配数值区间。')
  }
  const message = raw instanceof Error ? raw.message : String(raw ?? '未知错误')
  const text = message.trim() || '未知错误'

  /** `to` 的四种写法错误优先翻译 —— 它原本一律落进 `internal`。 */
  const toError = translateToError(text)
  if (toError) return toError

  if (/Undefined symbol/i.test(text)) {
    return new CalcError('unknown_symbol', text, '先定义变量，或通过 variables 参数传入，例如 {"m": 500}。')
  }
  /**
   * 未定义的函数也归 `unknown_symbol`，不归 `internal`。
   *
   * 实测反馈：`nosuchfunc(1)` 报 `internal`，而 `internal` 的含义是
   * 「工具自己坏了」—— 会误导用户去重试同一个错。函数名打错是**输入问题**，
   * 该给可操作的提示。
   */
  if (/Undefined function/i.test(text)) {
    const name = text.match(/Undefined function\s+(\S+)/i)?.[1] ?? ''
    return new CalcError(
      'unknown_symbol',
      name ? '没有名为 "' + name + '" 的函数' : text,
      '可用 operation="help" 查看支持的全部函数与公式。',
    )
  }
  /**
   * ⚠️ `SyntaxError` 与 `Syntax error` **不是同一个字符串**：一个是标识符名、一个是消息文本。
   * mathjs 抛的是后者（`Syntax error in part "某中文*2" (char 1)`）。
   *
   * 踩过：正则只写了前者，于是这类错误落到了末尾的兜底分支 ——
   * 表现为「错误类型对（syntax）、但没有任何 hint」。这类漏判不报错、不显眼，
   * 靠的是对照实验（同样是语法错，`1+*2` 有提示而 `某中文*2` 没有）才揪出来。
   *
   * 所以两种写法都收，并且用 `\s*` 容忍中间空格差异。
   */
  if (/Unexpected end of expression|Value expected|Parenthesis|Invalid left hand side|Syntax\s*Error|Unexpected operator/i.test(text)) {
    return new CalcError('syntax', text, explainSyntax(source, text))
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

/**
 * mathjs 内置的**单字母单位符号**。
 *
 * 实测确认的完整清单（`math.evaluate('1 X')` 能得到 Unit 的那些）。
 * 注意 `i`（虚数单位）与 `e`（自然常数）**不在**此列 —— 它们是常量不是单位。
 */
const BARE_UNIT_LETTERS = new Set('ABCFHJKLNSTVWbghlmst'.split(''))

/**
 * 拦下「未定义的单字母变量被当成单位」这一类**静默错误**。
 *
 * ## 为什么这是最危险的一类
 *
 * 实测反馈（`math_execute_实测问题与改进建议.md` 的 P0-2）：
 *
 * ```
 * rho=2035; rho*V   → 2.035 kV     ← V 被当成伏特
 * rho=2035; rho*m   → 2.035 km     ← m 被当成米
 * rho=2035; rho*g   → 2.035 kg     ← g 被当成克
 * ```
 *
 * 不报错、不警告，而且数字看着正常（2.035 是个"合理"的数）。
 * 而物理推演里最规范的变量名恰恰都是单字母：m/V/W/T/L/P/A/C/h/g。
 * **工具在惩罚最规范的命名习惯。**
 *
 * ## 为什么不能简单地「未定义就报错」
 *
 * 因为 mathjs 把 `5 V`（单位）与 `rho*V`（变量）解析成**完全相同**的 AST：
 *
 * ```
 * 5 V    → OperatorNode(*) [ConstantNode(5), SymbolNode(V)]
 * rho*V  → OperatorNode(*) [SymbolNode(rho), SymbolNode(V)]
 * ```
 *
 * 语法层无法区分，只能看**上下文**。所以判据是：
 *
 * · 放行：符号处「单位位置」—— 父是乘法且兄弟里有数字（`5 V`、`9.81 m`），
 *   或父是幂且指数是数字（`s^2`）。这些是真单位用法。
 * · 报错：符号与**已定义变量同级**（`rho*V` 的兄弟 rho 已定义），
 *   或它**单独出现**（`V` 一个字母单独求值，语义含糊）。
 * · 其它：放行（如纯单位表达式 `9.81 m/s^2`）。
 *
 * ## 已知的取舍
 *
 * 批内混用「变量 + 单位」会被拦（`["v=30", "9.81 m/s^2 * v"]` 里的 m/s）。
 * 这是有意的：那种写法本身含糊，报错比猜更安全，且提示会说明两种写法。
 *
 * @param node - 已解析的 AST
 * @param scope - 当前作用域（含已定义变量）
 */
function guardBareUnitSymbols(node: any, scope: Record<string, unknown>): void {
  if (!node || typeof node !== 'object') return
  const defined = new Set(Object.keys(scope ?? {}))
  const problems: string[] = []

  const visit = (current: any, parent: any): void => {
    if (!current || typeof current !== 'object') return
    if (current.type === 'SymbolNode') {
      const name = String(current.name ?? '')
      if (name.length === 1 && !defined.has(name) && BARE_UNIT_LETTERS.has(name)) {
        const siblings: any[] = Array.isArray(parent?.args) ? parent.args : []
        const others = siblings.filter((a) => a !== current)
        const hasConstantSibling = others.some((a) => a?.type === 'ConstantNode')
        const hasDefinedSibling = others.some(
          (a) => a?.type === 'SymbolNode' && defined.has(String(a.name)),
        )
        /**
         * ★ 顺序是判据的一部分，不能只看「同级有没有数字」。
         *
         * mathjs 保留了书写顺序，于是：
         *
         *   2 b   → OperatorNode(*) [0:ConstantNode(2), 1:SymbolNode(b)]   ← 单位
         *   b*2   → OperatorNode(*) [0:SymbolNode(b), 1:ConstantNode(2)]   ← 变量
         *
         * 两者兄弟都含数字，旧判据一律放过 —— 结果 `b*2` 被算成
         * 「2 b（单位）」，静默给出 `2 b`。实测踩到过：
         * 批量里 `b=oops*2` 失败之后，后续 `d=b*2` 不报错、算出 `2 b`，
         * 一个依赖失败步骤的下游悄悄变成了合法结果（虚成功）。
         *
         * 单位写法是「数字在前、符号在后」；符号在前是**变量乘数字**。
         */
        const symbolIndex = siblings.indexOf(current)
        const constantIndex = siblings.findIndex((a) => a?.type === 'ConstantNode')
        const constantBefore = constantIndex >= 0 && constantIndex < symbolIndex
        // 单位位置：数字 × 单位（数字在前）、或 数字 × 单位的幂
        const isUnitPosition =
          (parent?.type === 'OperatorNode' && parent.op === '*' && constantBefore) ||
          (parent?.type === 'OperatorNode' && parent.op === '^' && hasConstantSibling)
        /**
         * 三个条件里**任一**成立就报：都不是「数字在前的单位写法」时，
         * 这个单字母就不该被静默当成单位。
         *
         * 踩过的坑：旧版只报了「有已定义兄弟」与「单独出现」两种情况，
         * 于是 `b*2`（符号在前、没有已定义兄弟、又不是根）三条全不命中，
         * 被放过去算成 `2 b` —— 批量里一个失败步骤的下游就这样变成了
         * 「成功」，而且是合法单位结果，最难看出来的那种。
         */
        if (!isUnitPosition) {
          const isBareSymbolChild =
            parent?.type === 'OperatorNode' &&
            parent.op === '*' &&
            siblings.length === 2 &&
            siblings.every((a) => a === current || a?.type === 'ConstantNode')
          if (hasDefinedSibling || parent === null || isBareSymbolChild) problems.push(name)
        }
      }
      return
    }
    for (const key of ['args', 'items']) {
      const list = current[key]
      if (Array.isArray(list)) for (const child of list) visit(child, current)
    }
    if (current.content) visit(current.content, current)
    if (current.object) visit(current.object, current)
    if (current.index) visit(current.index, current)
    /**
     * ★ 赋值语句的右半部分挂在 `value` 上，不在 `args` 里。
     *
     * 踩过的坑：`d=b*2` 的 AST 是 `AssignmentNode(name=d, value=OperatorNode(*))`，
     * 而这里原本只走 `args/items/content/object/index` —— 赋值右侧**整个不被遍历**。
     * 于是批量里 `b=oops*2` 失败之后，`d=b*2` 从未被判据看到，
     * 直接被 mathjs 当成「2 b」算出一个合法单位结果。
     *
     * 这类「下游悄悄变成虚成功」比报错难发现得多：批量汇总里它是「成功」。
     */
    if (current.value && typeof current.value === 'object') visit(current.value, current)
  }

  visit(node, null)

  if (problems.length > 0) {
    const uniq = [...new Set(problems)]
    const list = uniq.map((n) => '"' + n + '"').join('、')
    /**
     * 「为什么报错」这句写在 `hint` 里，不写 `message`。
     *
     * 批量模式的失败行格式是 `失败[type]：<hint>`，**只显示 hint**；
     * 单条模式两者都回。把「既是变量名也是单位符号」放进 hint，
     * 两种模式都能看到 —— 这是用户理解报错原因的唯一线索。
     */
    throw new CalcError(
      'unknown_symbol',
      '未定义的标识符 ' + list,
      list + ' 既是变量名也是单位符号。若要当单位用，请写成带数字的形式（如 "5 V"）；' +
        '若要当变量，请先在本次调用里赋值，或通过 variables 参数传入（如 {"' +
        uniq[0] + '": 100}）。',
    )
  }
}

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

/**
 * 判断表达式里有没有**显式要求的目标单位**。
 *
 * mathjs 里三种写法都表示「换成这个单位」：
 *
 * ```
 *   5 cm to inch            OperatorNode(op=to)
 *   to(5 cm, inch)          FunctionNode(fn=to)
 *   (10 hp/0.475).to('kW')  FunctionNode(fn=AccessorNode(property=to))
 * ```
 *
 * ## 为什么需要这个判断
 *
 * 输出层的单位归位（`normalizeUnitPrefix`）会在「没人指定单位」时挑一个顺口的档。
 * 但调用方一旦写了 `.to(...)`，选择权就该归他 —— 否则会出现
 * `2 m to cm` 被改成 `2 m` 这种**把用户的换算悄悄撤回**的回归。
 * 数字仍然合法（`2 m` 是个正经长度），所以这类错误不会被怀疑。
 *
 * @param node - 已解析的 AST；解析失败时调用方本来就走不到这里
 * @returns 有显式目标单位时为 true
 */
function usesExplicitUnitConversion(node: any): boolean {
  let found = false
  if (!node || typeof node !== 'object') return false
  const visit = (current: any, depth: number): void => {
    if (found || !current || typeof current !== 'object' || depth > 64) return
    if (current.type === 'OperatorNode' && String(current.op ?? '') === 'to') {
      found = true
      return
    }
    if (current.type === 'FunctionNode') {
      if (String(current.fn?.name ?? '') === 'to') {
        found = true
        return
      }
      /** `.to('kW')` 的 fn 是 AccessorNode，属性名挂在 index 上。 */
      const indexNode = current.fn?.index
      const property = typeof indexNode?.value === 'string' ? indexNode.value : indexNode?.name
      if (typeof property === 'string' && property.replace(/^["']|["']$/g, '') === 'to') {
        found = true
        return
      }
    }
    for (const key of ['args', 'items']) {
      const list = current[key]
      if (Array.isArray(list)) for (const child of list) visit(child, depth + 1)
    }
    for (const key of ['content', 'object', 'index', 'value']) {
      if (current[key]) visit(current[key], depth + 1)
    }
  }
  visit(node, 0)
  return found
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
/**
 * 是否把工作区里登记的命名变量并入作用域。
 *
 * ## 这是显式开关，默认关闭
 *
 * 打开后同一个调用在不同工作区状态下会给出不同结果 ——
 * 那会削弱「同输入同输出」。所以：
 *   · 默认关闭，**不改变任何现有调用的行为**
 *   · 要开就在工作区里固化：`{action2:"set", useWorkspaceVariables:true}`
 *
 * 关掉后 `workspaceVariables` 里存的东西仍然存着（能 show、能 remove），
 * 只是不参与计算 —— 与旧版行为完全一致。
 *
 * @param name - 工作区名；省略用当前工作区
 * @returns 是否启用
 */
function useWorkspaceVariables(name?: string): boolean {
  try {
    const data = loadWorkspace(name ?? activeWorkspaceNameForCache())
    return data.useWorkspaceVariables === true
  } catch {
    return false
  }
}

/**
 * 把工作区变量与本次传入的变量合成最终作用域输入。
 *
 * ## 优先级：本次参数 > 工作区
 *
 * 临时覆盖长期，符合「显式优先」。同名的键以本次传入为准 ——
 * 这样「临时想换个值算一下」不必先去改工作区。
 *
 * ## 两个来源都要规范化
 *
 * `buildScope` 会校验变量名与取值，所以这里不能只做浅合并：
 * 否则工作区里存了非法名字（历史上可能写进去过），
 * 会绕过校验直接进 mathjs 作用域。
 *
 * @param passed - 本次调用传的 `variables` 参数
 * @returns 合并后的变量字典；开关关闭时原样返回 passed
 */
function mergeWorkspaceVariables(passed: unknown): unknown {
  if (!useWorkspaceVariables()) return passed
  const stored = workspaceVariablesOf()
  const incoming =
    passed && typeof passed === 'object' && !Array.isArray(passed)
      ? (passed as Record<string, unknown>)
      : {}
  if (Object.keys(stored).length === 0 && Object.keys(incoming).length === 0) return passed
  return { ...stored, ...incoming }
}

/**
 * 收集上一次 `buildScope` 跳过的非法变量键。
 *
 * 模块级、每次调用开头清空 —— 与 `activeDisplayPrecision` 同样的理由：
 * 逐层传参要改四十多个函数签名，而这个信息只在**入口**用来组装一条提示。
 */
let skippedVariableKeys: Array<{ name: string; reason: string }> = []

/**
 * 取本次调用中被跳过的非法变量键（组装提示用）。
 *
 * @returns 被跳过的键与原因
 */
export function takeSkippedVariableKeys(): Array<{ name: string; reason: string }> {
  const taken = skippedVariableKeys
  skippedVariableKeys = []
  return taken
}

/**
 * 清理被跳过的变量键记录（每次工具调用开头）。
 */
export function resetSkippedVariableKeys(): void {
  skippedVariableKeys = []
}

/**
 * 把变量字典装进 mathjs 作用域。
 *
 * ## 非法键只跳过，不中止整批
 *
 * 实测反馈（2026-11-06 第二份）：
 *
 * ```
 *   expressions: ["P*330", "Q+1"], variables: {"P":1000, "Q":5, "人口":1}
 *   → ok:false，连合法的 P*330 都没算
 * ```
 *
 * 一个键名写错，前面排队的算式全白写的 —— 而这类语料的**概念名几乎全是中文**
 * （人口/粮食/石料），用户第一反应就是用中文命名。
 *
 * 现在：合法的键照常进作用域，非法的记进 `skippedVariableKeys`，
 * 由入口在结果里列出来。**算出来的数仍然是对的** —— 只是那个中文键没生效。
 *
 * ## 为什么不做「支持中文变量名」
 *
 * 那要放宽 mathjs 的词法，而词法宽松会带来新的歧义
 * （中文字符与单位名、量级词的边界更难判）。
 * 相比之下「跳过 + 明确告知」既解决了痛点，又不引入不确定性。
 *
 * @param engine - mathjs 实例
 * @param variables - 变量字典
 * @returns 可用的作用域对象
 */
function buildScope(engine: any, variables: unknown): Record<string, any> {
  const scope: Record<string, any> = {}
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) return scope
  for (const [key, raw] of Object.entries(variables as Record<string, unknown>)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      skippedVariableKeys.push({ name: key, reason: '标识符只能含字母、数字、下划线' })
      continue
    }
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) {
        skippedVariableKeys.push({ name: key, reason: '不是有限数字' })
        continue
      }
      scope[key] = engine.bignumber(String(raw))
    } else if (typeof raw === 'string') {
      // 允许字符串形式的大数，例如 "1e100"
      try {
        scope[key] = engine.bignumber(raw.trim())
      } catch {
        skippedVariableKeys.push({ name: key, reason: '无法解析为数字' })
      }
    } else if (typeof raw === 'boolean') {
      scope[key] = raw
    } else {
      skippedVariableKeys.push({ name: key, reason: '必须是数字或数字字符串' })
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
  /**
   * 数学记号归一化（`**` → `^`、`π` → `pi`、`ln(` → `log(`、`×`/`÷`）。
   *
   * 为什么必须在这里：其它 op（derivative / integral / stats / solve…）
   * 都在内部调了 `normalizeSource`，**只有 evaluate 漏了** ——
   * 于是 `2**10`、`π`、`2 × 3` 这些直觉写法在 evaluate 上全部报错，
   * 而同一套写法在 formula 的 overrides 里却能过（实测反馈的语法糖问题）。
   *
   * 幂等：这些替换重复执行结果不变，所以不会因多次归一化而出错。
   */
  expression = normalizeSource(expression)
  /**
   * 中文单位展开：把「1 里 + 3 米」变成 mathjs 能算的形态。
   *
   * 必须放在 normalizeSource **之后**：前者处理数学记号（× ÷ π **），
   * 后者处理单位名；顺序反了会让 `2 × 3 里` 这类混合写法漏掉。
   */
  expression = normalizeChineseUnits(expression)
  if (expression.length > MAX_INPUT_LENGTH) {
    throw new CalcError('too_large', `表达式过长（${expression.length} > ${MAX_INPUT_LENGTH}）`)
  }
  let node: any
  try {
    node = engine.parse(expression)
  } catch (error) {
    throw translateError(error, 'syntax', expression)
  }
  guardAst(node)
  guardComplexity(node)

  // 拦「未定义单字母被当单位」的静默错误（实测反馈 P0-2）
  guardBareUnitSymbols(node, scope)

  let raw: any
  try {
    raw = node.evaluate(scope)
  } catch (error) {
    throw translateError(error)
  }

  const value = unwrapResult(raw)
  /**
   * ## 非有限值必须在**这里**拦，不能指望顶层
   *
   * 顶层的 `containsNonFinite(result.value)` 拿到的是**序列化后**的值：
   * 带单位的结果被压成字符串 `"Infinity g"`，而那个判据只认恰好 `"Infinity"`。
   * 于是：
   *
   * ```
   *   1/0          →  错误[non_finite]      ✓ 拦住
   *   (1/0)*2 kg   →  ok=true, "Infinity g"  ✗ 放过
   * ```
   *
   * 而后者更危险：它看起来**像个带单位的正经结果**（`Infinity g` 读起来
   * 像「无穷克」，不像「算错了」），而且会顺着链式推演传下去。
   *
   * 所以判在原始对象上 —— `isNonFiniteValue` 会下钻到 `Unit.value`。
   * 注意 `1e400`、`2^1024` 这类**有限的极大数**不能误判：
   * 它们转成双精度才溢出，而 BigNumber 自己知道自己是有限的。
   */
  if (isNonFiniteValue(value)) {
    const shown = String(raw)
    throw new CalcError(
      'non_finite',
      `计算结果非有限（${shown}）`,
      '常见于除以零、tan(π/2)、log(0)。若要符号形式可改用 operation="simplify"。',
    )
  }
  /**
   * 表达式里写了目标单位（`.to('cm')`、`5 cm to inch`）时，**不归位**。
   *
   * 归位的职责是「调用方没指定时挑一个顺口的档」；指定了就不该被改写。
   * 详见 `formatValue` 的 `respectExplicitUnit` 参数说明 —— 那里记着
   * `2 m to cm` 被改回 `2 m` 这条回归。
   */
  const explicitUnit = usesExplicitUnitConversion(node)
  const text = formatValue(engine, value, precision, currentDisplayPrecision(), explicitUnit)
  return {
    /**
     * 带 SI 质量前缀时补一句中文量级参照（如 `87.78 Tg（= 8778 万吨）`）。
     *
     * 只对「质量 × 克」这一族生效 —— 它是中文语料里量级混用最严重的场景，
     * 也是实测反馈里唯一真实出过事故的地方（两次把「吨」当成「亿吨」）。
     *
     * 其它单位、复合单位一律原样返回：量级词在那个位置不适用，
     * 硬套只会制造噪音。
     */
    result: annotateMetricPrefix(text),
    value: toJsonValue(value),
  }
}

/**
 * 批量求值（operation=evaluate 的批量模式）。
 *
 * ## 为什么要批量
 *
 * 每次工具调用都有固定开销：一次往返 + 结果文本进入上下文。
 * 算 5 个式子的代价是 5 次往返；批量把 5 次压成 1 次。
 *
 * ## 设计要点
 *
 * 1. **逐条独立报错**：一条失败不影响其它条 —— 作者常常一次问五件事，
 *    其中一条写错不该让另外四条白算。
 * 2. **失败也占用输出行**：明确写出哪条错了、错在哪，而不是静默跳过
 *    （静默跳过会让人以为「这条没算」而不是「这条错了」）。
 * 3. **结果紧凑**：一行一条 `表达式 = 值`，不逐条输出完整诊断块。
 *
 * @param engine - mathjs 实例
 * @param expressions - 待算的表达式数组
 * @param scope - 变量作用域
 * @param precision - 计算精度
 * @returns 结果文本与结构化值
 */
function opEvaluateBatch(
  engine: any,
  expressions: Array<string | { label?: string; expr?: string }>,
  scope: Record<string, any>,
  precision: number,
  terse = false,
): Outcome {
  const items = expressions.slice(0, MAX_BATCH_EXPRESSIONS)
  if (items.length === 0) {
    throw new CalcError('invalid_argument', 'expressions 为空', '例如 ["1/7","2^0.5"]')
  }

  const shown: string[] = []
  const values: Array<{ expression: string; label?: string; ok: boolean; result?: string; error?: string }> = []
  /** 量级类提示（不影响成败，只提醒核对）。 */
  const magnitudeWarnings: string[] = []
  let successCount = 0
  let failCount = 0

  for (const raw of items) {
    /**
     * 两种条目形态：
     *   字符串 `"1/7"`
     *   带标签对象 `{label:"储耗比-中值", expr:"139e8/152e4"}`
     *
     * ## 为什么要 label
     *
     * 实测反馈：同一批算两个口径（`["139e8/1743500","139e8/152e4"]` → 7972 / 9144），
     * 输出里**只有顺序号区分**。后续引用时得回翻表达式原文，
     * 报告里「一次差点引错」。
     *
     * 批内条目一多（该会话单批最多 14 条），纯靠位置对齐的心智负担很大。
     */
    /**
     * ## 纯数字元素自动转成表达式
     *
     * 实测反馈（2026-11-06 第二份）：`expressions: [0.5, 9.9, 10]` 五条全被当成
     * **「空表达式」跳过**，汇总「成功 0，失败 5」。
     *
     * 这是**类型错误被伪装成内容错误** —— 用户传的是合法数字，
     * 工具说「空表达式」，会让人去翻数据源而不是检查类型。
     *
     * 转成字符串是零风险的：`0.5` → `"0.5"` → 正常求值得 0.5。
     * 布尔与 null 不转换（那不是「一个数」，是调用方写错了，该报错）。
     */
    const entry =
      typeof raw === 'string'
        ? { expr: raw }
        : typeof raw === 'number' && Number.isFinite(raw)
          ? { expr: String(raw) }
          : (raw as { label?: string; expr?: string }) ?? {}
    /**
     * ## 元素里的未知键也要点名
     *
     * 顶层的未知参数有 `findUnknownArguments` 拦着，但**数组元素内部没查**。
     * 实测（2026-11-06）：
     *
     * ```
     *   {expressions:[{label:'a', expr:'1+1', unit:'kg/day'}]}  → ok=true，unit 被静默丢弃
     *   {expression:'1+1', unit:'kg/day'}                       → 报 unknown_argument ✓
     * ```
     *
     * 危险在于：将来若要加 `unit` / `assumption` 这类**按条**的参数，
     * 它们必然写在这个位置 —— 而现有行为会让它们**静默不生效**，
     * 调用方以为生效了。这正是本项目一直在打击的那类问题。
     *
     * 处理方式：认不出的键当作**该条失败**（而不是整批失败），
     * 这样一条写错不影响其余条目 —— 与「逐条独立报错」的既有约定一致。
     */
    /** 元素级允许的键。新增一条按条参数时记得加在这里，否则会被自己的校验拦下。 */
    const allowedEntryKeys = ['label', 'expr', 'sanity']
    const unknownEntryKeys =
      typeof raw === 'string'
        ? []
        : Object.keys(raw as Record<string, unknown>).filter(function (k) { return !allowedEntryKeys.includes(k) })
    if (unknownEntryKeys.length > 0) {
      const echoName = (entry as { label?: string }).label || String((entry as { expr?: string }).expr ?? '')
      values.push({ expression: '', label: String(echoName), ok: false, error: 'unknown_argument' })
      shown.push(
        '  ' + echoName + ' → 失败[unknown_argument]：这一条里有认不出的键 ' +
          unknownEntryKeys.join('、') + '（只接受 ' + allowedEntryKeys.join(' / ') + '）',
      )
      failCount++
      continue
    }
    const label = typeof entry.label === 'string' ? entry.label.trim() : ''
    const rawExpression = String(entry.expr ?? '').trim()

    if (rawExpression === '') {
      values.push({ expression: rawExpression, label, ok: false, error: 'empty' })
      shown.push('  （空表达式）→ 跳过')
      failCount++
      continue
    }
    /**
     * 归一化只用于**计算**，回显仍用用户原文。
     *
     * 否则用户写 `π`、`2**10` 会看到自己被回显成 `pi`、`2^10` ——
     * 那会让人怀疑「我传的到底被改成了什么」。
     */
    const expression = normalizeChineseUnits(normalizeSource(rawExpression))
    try {
      /**
       * 解析单独包一层：给 `translateError` 传 `'syntax'` 作为兜底类型。
       *
       * 为什么：单条求值里写的是 `translateError(error, 'syntax')`，
       * 而批量这里原来是 `translateError(error)` —— 默认兜底是 `internal`。
       * 于是 `不存在xyz(1)` 在单条里报 syntax、在批量里报 internal。
       * `internal` 的含义是「工具自己坏了」，会误导人去重试同一个错，必须对齐。
       */
      let node: any
      try {
        node = engine.parse(expression)
      } catch (error) {
        throw translateError(error, 'syntax', expression)
      }
      guardAst(node)
      guardComplexity(node)

      // 拦「未定义单字母被当单位」的静默错误（实测反馈 P0-2）
      guardBareUnitSymbols(node, scope)
      const value = unwrapResult(node.evaluate(scope))
      /**
       * ## 批量也必须拦非有限值
       *
       * 实测（1107 报告问题 2、3）：单条 `1/0` 报错，批量却宣告
       * 「算式全部求值成功（4 条）」，其中就包括 `1/0` 与 `log(0)`。
       *
       * 这构成一条危险的对称破坏：**同一个式子，换个调用方式就从「错」
       * 变成「对」**。而批量恰恰是 AI 最常用的形态（一次算 8—14 条），
       * 于是最该拦住的地方恰好不拦。
       *
       * 归入 `failed` 而不是单独一类，理由是与单条 `non_finite` 对齐：
       * 调用方的分流逻辑只需要认 `ok/partial/failed` 三个字段。
       */
      if (isNonFiniteValue(value)) {
        throw new CalcError(
          'non_finite',
          `计算结果非有限（${String(value)}）`,
          '常见于除以零、tan(π/2)、log(0)。若要符号形式可改用 operation="simplify"。',
        )
      }
      /** 批量同样要尊重显式目标单位（见 `usesExplicitUnitConversion`）。 */
      const text = formatValue(
        engine, value, precision, currentDisplayPrecision(), usesExplicitUnitConversion(node),
      )
      values.push({ expression, label: label || undefined, ok: true, result: text })
      /**
       * 回显格式：有 label 用 label，否则用用户原文。
       *
       * 回显原文（`π` 而不是 `pi`）是刻意的 —— 否则用户会怀疑「我传的到底被改成了什么」。
       */
      const echo = label ? label : rawExpression
      /**
       * 量级标注：给裸数字配上「这是 10 的几次方」。
       *
       * 实测复盘里最贵的一次错误是：`/1e9` 算出 2133 却贴上「万吨」标签，
       * 据此指控原文「错了 10 倍」。返回体当时只有一行裸数字，看不出量级。
       * 标上 `(~10³)` 之后，「2133 与万吨差一个量级」这件事人眼即可发现。
       */
      /**
       * 量级标注：给裸数字配上「这是 10 的几次方」。
       *
       * 实测复盘里最贵的一次错误是：`/1e9` 算出 2133 却贴上「万吨」标签，
       * 据此指控原文「错了 10 倍」。返回体当时只有一行裸数字，看不出量级。
       *
       * ## 带单位的结果另走一条
       *
       * `annotateMagnitude` 内部做 `Number(text)`，而 `87.78 Mt` 会得到 NaN ——
       * 带单位时它静默失效。所以这里按结果形态分派：
       * 纯数字走 `(~10^N)`，带单位走 `explainUnitResult`（给出基准值与中文量级）。
       */
      const shownValue = annotateMagnitude(text)
      const unitExplain = explainUnitResult(text)
      shown.push(
        '  ' + echo + (label ? '（' + rawExpression + '）' : '') + ' = ' + shownValue +
          (unitExplain ? '｜' + unitExplain : ''),
      )
      /**
       * label 与结果的量级核对：只有 label 里**明确写了量级词**（万/亿/千…）才查，
       * 且结果本身已跨过那个量级时才提示 —— 宁漏勿误。
       */
      if (label) {
        const warn = checkLabelMagnitude(label, text)
        if (warn) magnitudeWarnings.push(warn)
      }
      /**
       * ③ 锚点比对：调用方给了 `sanity` 就拿它的判据去比。
       *
       * 三条来源共用同一个 `magnitudeWarnings` 通道 —— 它的下游
       * （terse 分支、汇总行、结构化计数）全部自动生效，不必改三处。
       *
       * 为什么在这里而不是在缓存层：批量路径**根本不走缓存**（见上方注释），
       * 所以不存在「换锚点却命中旧提示」的问题。
       */
      if (typeof entry === 'object' && entry !== null) {
        const sanity = (entry as { sanity?: unknown }).sanity
        const anchorWarn = checkAnchors(sanity, text)
        if (anchorWarn) {
          const anchorEcho = label || rawExpression
          magnitudeWarnings.push(anchorEcho + ' → ' + anchorWarn)
        }
      }
      successCount++
    } catch (error) {
      const translated = translateError(error)
      values.push({ expression, label: label || undefined, ok: false, error: translated.type })
      // 失败要显眼，但不能长篇大论 —— 一行说清哪条、什么类型
      const echo = label ? label : rawExpression
      shown.push('  ' + echo + ' → 失败[' + translated.type + ']' +
        (translated.hint ? '：' + translated.hint : ''))
      failCount++
    }
  }

  /**
   * `terse` 模式：只回「表达式 = 结果」，去掉标题与统计。
   *
   * 实测反馈：批量 8—14 条时，标题与统计行本身也是固定开销；
   * 报告估算「若全程 terse，省 40%+ 工具输出 token」。
   *
   * 但**失败信息不能省**：省掉失败行会让调用方以为「全成功了」。
   */
  if (terse) {
    /**
     * terse 的承诺是「省掉标题与统计」，**不是**省掉风险提示。
     *
     * 踩过：第一版把 ⚠ 量级提示一起省了，于是 terse 用户看到的是一行干净数字，
     * 而干净正是最危险的 —— 他会以为没问题。
     */
    const terseWarnings: string[] = []
    const terseBatch = findBatchAnomalies(
      values
        .filter(function (v) { return v.ok && typeof v.result === 'string' })
        .map(function (v) { return { label: v.label, result: String(v.result) } }),
    )
    if (terseBatch) magnitudeWarnings.push(terseBatch)
    if (magnitudeWarnings.length > 0) {
      terseWarnings.push('')
      for (const warning of magnitudeWarnings) terseWarnings.push(warning)
    }
    return {
      result: [...shown.map((s) => s.trim()), ...terseWarnings].join('\n'),
      value: toJsonValue({
        count: items.length,
        success: successCount,
        failed: failCount,
        magnitudeWarnings: magnitudeWarnings.length,
        items: values,
      } as never),
    }
  }

  const header = items.length < expressions.length
    ? `═══ 批量求值（前 ${items.length} 条，共给了 ${expressions.length} 条）═══`
    : `═══ 批量求值（${items.length} 条）═══`

  /**
   * 同批次量级一致性比对。
   *
   * 真实案例：四条「年耗/年产（万吨）」全部用了 /1e9（实际是千吨），
   * 全部偏大 10 倍、全部报「成功」。单条看不出问题，四条一起就该看出来。
   */
  const batchWarning = findBatchAnomalies(
    values
      .filter(function (v) { return v.ok && typeof v.result === 'string' })
      .map(function (v) { return { label: v.label, result: String(v.result) } }),
  )
  if (batchWarning) magnitudeWarnings.push(batchWarning)

  /**
   * 分级语义：把「算式没塌」与「结论已验证」分开。
   *
   * 实测反馈原话：「成功 7，失败 0」会让调用方跳过复核 ——
   * 因为「成功」两个字读起来像「对了」。这里显式说明它只表示什么。
   */
  const summary: string[] = []
  if (failCount === 0) {
    summary.push('算式全部求值成功（' + successCount + ' 条，只表示算式无语法/符号错，不含结论正确性判断）')
  } else {
    summary.push('成功 ' + successCount + '，失败 ' + failCount)
  }
  if (magnitudeWarnings.length > 0) {
    summary.push('')
    summary.push('⚠ 量级待核（' + magnitudeWarnings.length + ' 条）：')
    for (const warning of magnitudeWarnings) summary.push(warning)
  }

  return {
    result: [header, '', ...shown, '', ...summary].join('\n'),
    value: toJsonValue({
      count: items.length,
      success: successCount,
      failed: failCount,
      magnitudeWarnings: magnitudeWarnings.length,
      items: values,
    } as never),
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

function opIntegral(
  expression: string,
  variable: string,
  precision: number,
  from?: number,
  to?: number,
): Outcome {
  const text = normalizeSource(expression)
  if (text === '') throw new CalcError('invalid_argument', '表达式为空')

  // 只给一端是含糊的输入：要么两端都给，要么都不给
  if ((from === undefined) !== (to === undefined)) {
    throw new CalcError(
      'invalid_argument',
      '定积分需要同时给 from 与 to',
      '需要同时给两端（如 from=0, to=3）；只给一端无法确定积分区间。',
    )
  }

  const primitive = symbolicIntegral(text, variable)

  /**
   * ── 给了上下限：算定积分 ──
   *
   * 实测反馈（P1-3）：以前传 `from`/`to` 会被**静默忽略**，
   * 只返回不定积分 `1/3*x^3 + C` —— 调用者以为拿到了定积分。
   * 文档的原话：「绝不要静默忽略已传入的参数，这是最伤信任的行为。」
   *
   * 现在按 Newton-Leibniz 算 F(to) − F(from)。
   */
  if (from !== undefined && to !== undefined) {
    const engine = bignum(precision)
    /**
     * 用**有理数引擎**代入，而不是 BigNumber。
     *
     * 实测对比（原函数 1/3·x³ 在 x=3 处）：
     *   BigNumber → 8.99999999999999999999999999999999999999…
     *   Fraction  → 9
     *
     * BigNumber 的 `1/3` 是截断小数，乘 27 回不到整数。
     * 定积分出现的多半是有理系数多项式，Fraction 能约分回精确值。
     */
    const rationalEngine = rational()
    let exact: any
    try {
      const F = rationalEngine.parse(primitive)
      const upper = F.evaluate({ [variable]: to })
      const lower = F.evaluate({ [variable]: from })
      exact = rationalEngine.subtract(upper, lower)
    } catch (error) {
      throw new CalcError(
        'unsupported',
        '原函数 ' + primitive + ' 无法代入上下限求值',
        '这是符号引擎的能力边界。可改用 operation="evaluate" 自己做数值积分（如黎曼和）。',
      )
    }

    /**
     * 显示：优先精确形式（整数或分数），并给出 BigNumber 小数近似。
     *
     * 为什么两个都给：`1/3` 这种系数在定积分里很常见，
     * 化为 `6.75` 会丢「精确等于 27/4」这个信息；而工程场景又常需要小数。
     */
    const exactTextRaw = rationalEngine.format(exact)
    // 分母为 1 时不该写成 `9/1`（mathjs 的 ratio 格式会保留 /1）
    const exactText = exactTextRaw.replace(/\/1$/, '')
    const asNumber = Number(rationalEngine.number(exact))
    const decimalText = Number.isFinite(asNumber)
      ? formatValue(engine, engine.bignumber(String(asNumber)), precision, currentDisplayPrecision())
      : exactText
    const isFraction = exactText.includes('/')
    return {
      result:
        '原函数：' + primitive + ' + C\n' +
        '定积分 ∫[' + from + '→' + to + '] ' + text + ' d' + variable + ' = ' +
        exactText + (isFraction ? '（= ' + decimalText + '）' : ''),
      value: toJsonValue(exactText),
    }
  }

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
    result: formatValue(engine, raw, precision, currentDisplayPrecision()),
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

  let resolved: {
    values: Record<string, unknown>
    overridden: string[]
    missing: string[]
    unknownKeys: string[]
  }
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

  /**
   * ── 未知参数名：明确告知，不静默丢弃 ──
   *
   * 实测反馈：overrides 的 key 拼错时公式**照常出数**，只是那个参数用了默认值。
   * 报告里那次「236 倍缺口」误判就是这么来的 —— 而结果看着完全正常。
   *
   * 这里不抛错（可能是调用方故意传常数名，或用法上无伤），
   * 而是把「你没生效的参数」写成一条提示，让调用方能自己判断。
   */
  const unknownOverrideKeys = resolved.unknownKeys ?? []

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
    throw translateError(error, 'syntax', expression)
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
  parts.push(`结果: ${formatValue(engine, raw, precision, currentDisplayPrecision())}${formula.unit ? ` ${formula.unit}` : ''}`)

  /**
   * 未知参数名提示：把「你没生效的 key」明确说出来。
   *
   * 紧跟在结果后面（而不是压到输出末尾），因为这类问题会直接改变结论，
   * 读者必须第一眼就看到。
   */
  if (unknownOverrideKeys.length > 0) {
    parts.push('')
    parts.push(
      '⚠ 以下 overrides 的 key 不在公式「' + formula.name + '」的参数里，**已被忽略**：' +
        unknownOverrideKeys.join('、') +
        '。该公式的参数是：' + Object.keys(formula.params).join('、') +
        '。若这是拼写笔误，结果可能已偏离——请核对后重算。',
    )
  }

  /**
   * 经验公式的适用性提示。
   *
   * 为什么要挂在输出里：一批经验式把常数**烘焙进了系数**
   * （船舶航速 1.34 里藏着 g=9.81、宜居带 1.1 隐含地球温室条件）。
   * 作者在非地球世界里照抄会算错，而且错得隐蔽——数字看着正常，只是用了地球常数。
   *
   * 三级标注（2026-10-26 修订）：
   *   dimensionless         形式与数值都跨世界成立
   *   scalable-with-caveat  形式可泛化，但系数需重新验证
   *   earth-only            仅在地球成立，换世界必须换公式
   *
   * 关键区分：**形式可泛化 ≠ 系数可直接用**。上一版把两者混为一谈，
   * 等于宣称 Fr=0.4 换世界也精确成立——那是过度自信。
   */
  const empiricalNote = empiricalNoteOf(formula.id)
  if (empiricalNote) {
    parts.push('')
    parts.push('【适用域：' + KIND_LABEL[empiricalNote.kind] + '】')
    if (empiricalNote.principle) parts.push('  底层原理：' + empiricalNote.principle)
    if (empiricalNote.bakedIn) parts.push('  藏了什么：' + empiricalNote.bakedIn)
    if (empiricalNote.genericForm) parts.push('  可沿用的形式：' + empiricalNote.genericForm)
    if (empiricalNote.retuneNeeded) parts.push('  必须重新标定的：' + empiricalNote.retuneNeeded)
    if (empiricalNote.breaksWhen) parts.push('  何时失效：' + empiricalNote.breaksWhen)
    if (empiricalNote.advice) parts.push('  建议：' + empiricalNote.advice)
    if (empiricalNote.needsFrom && empiricalNote.needsFrom.length > 0) {
      parts.push('  需要这些量：' + empiricalNote.needsFrom.join('、'))
    }
  }

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
      /**
       * 例子顺序是刻意的：**带单位的那条排第一**。
       *
       * 实测反馈（1107 报告 P0-1）：原来 `5 cm to inch` 排在第 4 个，
       * 且没说「物理量请全部带单位」，于是使用者一律转成裸数字算，
       * 而那正是四起千倍级事故的共同形式。
       */
      '                例：5 cm to inch、(10 hp/0.475) to kW、28000 BTU/lb to MJ/kg',
      '                    10^20+5、factorial(50)、(1+2i)*(3-i)、sin(30 deg)',
      '                物理量**一律带单位写**：量纲错误当场拦下（10 hp + 3 kg → unit_mismatch）',
      '                裸数字无从判断 745.7 是瓦还是千瓦，差 1000 倍也可能宣告成功',
      '                批量：给 expressions=["1/7","2^0.5","log(10)"] 一次算多条，',
      '                      逐条独立报错；比多次调用省往返',
      '  solve         解方程。多方程逗号分隔 = 方程组',
      '                例：3x + 2y = 10, x - y = 1  /  x^2 - 5x + 6 = 0',
      '  system        显式线性系统（matrix + vector）',
      '  derivative/integral/simplify/expand/roots  符号求导・积分・化简・展开・求根',
      '',
      '【扩展函数】rank(A) nullspace(A) svd(A) factorize(n) nsolve("表达式",初值)',
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
      '  formulas      检索：query="关键词"/"layer:derived"/"domain:物理"/"freq:high"/"symbol:m"',
      '  formula-table 两级扩展：工作区临时公式 + 全局包；tableAction: global-list/add/remove',
      '                字段与校验规则见 docs/formula-authoring.md',
      '',
      '【世界观推演】',
      '  world         输入星球参数 → 体感画像：重力/昼夜/季节/纬度气候/地形上限 +',
      '                天空配色/恒星结构与寿命/卫星系统/化学窗口/生命闸门/跨模块一致性检查',
      '                【world 完整字段表】（全部可选，默认地球）',
      '                  恒星：starMass(太阳质量)、starRadius(太阳半径)、starTemp(K,默认5778)',
      '                  轨道：orbitAU(AU,默认1)、eccentricity(默认0.0167)',
      '                  行星：planetMass(地球质量)、planetRadius(地球半径)、rotationHours(默认23.93)、',
      '                        obliquityDeg(默认23.44)、albedo(默认0.306)',
      '                  大气：pressure(Pa,默认101325)、molarMass(kg/mol,默认0.02896)、',
      '                        gamma(默认1.4)、greenhouse(增温K,默认33)',
      '                  地表：materialStrength(Pa,默认1.3e8花岗岩)、materialDensity(默认2700)',
      '                  地形 terrain（附带）：kind=coastal/plain/plateau/mountain/valley/desert/',
      '                        forest/tundra/island/lake；elevation(海拔m)、distanceToSea(km)、',
      '                        latitudeDeg、annualPrecipMm、humidity(0-1)、windward(1迎风/-1背风)、',
      '                        reliefHeight(m)、oceanCurrent=warm/cold/none、',
      '                        surface=soil/sand/rock/ice/water/vegetation',
      '  constants     改变物理常数，自动推导派生量并评估世界偏离度',
      '                【可改的基础旋钮】c(光速) / G(引力常数) / h(普朗克) / kB(玻尔兹曼) /',
      '                  e_charge(元电荷) / me(电子质量) / mp(质子质量) / NA(阿伏伽德罗) /',
      '                  epsilon0(真空介电常数)',
      '                【派生量，自动跟随，不能直接改】hbar / R / mu0 / kCoulomb / sigma /',
      '                  bWien / alpha_fs / Ry / muB',
      '                例：{c:1.5e8} → mu0/sigma/alpha_fs 等自动重算并评估偏离度',
      '  quantities    看哪些物理量该跟着常数变、哪些不该（量纲分析 + 缩放指数）',
      '  impact        改常数后跑全部公式并与现实对比，算每条偏差',
      '  units         单位换算：把「三里」「两丈」「五百斤」换成标准单位',
      '                不带单位参数 → 列出全部可用单位（含中文古制与天文单位）',
      '                例：unitValue=30, unitFrom="里", unitTo="km" → 15 km',
      '                自创单位用 customUnits 覆盖（如把「里」定成 576 m）',
      '  【输出单位】先归到**常用档**，再按需叠 SI 前缀 k/M/G/T/P/E/Z/Y/R/Q：',
      '    质量 t（→ kt/Mt/Gt/Tt…）｜ 长度 m/km（→ Mm/Gm/Tm…）',
      '    时间 s/min/h/day/year ｜ 功率/能量 W/J（→ kW/MW、kJ/MJ…）｜ 压强 Pa',
      '  例：1e12 g → 1 Mt（不是 1 Tg）；1e9 m → 1 Gm；1e12 W → 1 TW。',
      '  整数一律完整输出（10^20+5 一位不少），批量显示另补千分位分组。',
      '  derivation    推演栈：derivation 子命令（共 ' + DERIVATION_SUBCOMMANDS.length + ' 个，不给会列出全部）',
      '    stack/cards/pipeline/checklist            推演栈与检查表',
      '    dead/chaos/flip/observer                  死寂/混沌/结论翻转/观测者',
      '    anchors/backSolve/sensitivity/phase/heatmap/graph/timeline/compare/diff',
      '                                              逆推/敏感度(base+exponent)/相图/时间轴(from,To,Steps)',
      '    archive/history/tables/whitepaper/trace/cost',
      '                                              档案/白皮书/溯源/算力(costKind,costX,Y,Iterations,Combos)',
      '    fantasy/civilization/dimensionless/inherit/units/impact',
      '                                              幻想层/文明极限/无量纲/继承(inheritBase,Derived,Sync)',
      '                入口：{operation:"derivation", derivation:"stack"}',
      '  balance       收支盘点：粮/水/能/地/财政/军费/信息 多项一起看，给最短板',
      '                例：balance={grain:{demand:2.7e6,supply:3.1e6,unit:"kg/年"}}',
      '                回答「这个王国养不养得起二十万兵」这类问题（feasibility 只管单项上限）',
      '  bodies        天体目录：太阳系 8 大行星 + 卫星 + 代表性系外行星 + 各亮度级恒星',
      '                例：bodyName="mars" / bodyKind="moon" / 不带参数列全部',
      '                bodyConstant="alpha_fs", bodyFactor=2 → 看改常数后哪些天体数据要重算',
      '                （关键：行星质量/半径/轨道与 α 无关，绝不跟着改）',
      '',
      '【数据管理】',
      '  workspace     工作区管理（一个世界观 = 一套常数表 + 公式表 + 地点 + 变量）',
      '                action2: list/show/create/switch/save/set/add-terrain/delete/reset',
      '                stats/cleanup 可查看存储与清理；不同工作区完全隔离',
      '                命名变量：{action2:"set", workspaceVariables:{BTU_LB:1260000}} 存进去（默认不参与计算）',
      '                  启用：{action2:"set", useWorkspaceVariables:true}  ← 必须走 action2:"set"',
      '                        （在 evaluate 上传这个开关不生效，它会被忽略）',
      '                  启用后 evaluate 可直接用变量名；本次 variables 参数优先于工作区值',
      '                  改变量会让缓存失效（避免拿到改之前的数）',
      '                注意：本插件无图形界面，全部经工具与 HTTP 路由操作',
      '',
      '【其他】',
      '  help          本清单',
      '  prompt-mode   调整系统提示注入档位（off/brief/full）',
      '',
      '【常用参数】expression / variables / operation / precision(有效位,默认64)',
      '  overrides(公式参数) / constants / world / terrain',
      '  expressions(批量,{label,expr}) / terse(只回表达式=结果) / variable(自变量)',
      /**
       * 实测反馈（1107 报告问题 10）：schema 只写了「批量求值，逐条独立报错」，
       * 没写元素可以是对象，于是模型几乎必然尝试 `"标签=表达式"` 这种最直觉的写法，
       * 然后撞上一个中文标识符语法错。
       */
      '    元素两种写法：字符串 "1/7"，或对象 {label:"煤砖含能", expr:"2 lb * 28000 BTU/lb to MJ"}',
      '    ★ "标签=表达式" 这种写法**不支持**（= 左边是中文标识符，会报 syntax）',
      '',
      '【锚点 sanity】工具不知道这个数该多大，但你可以逐条声明判据：',
      '  {label:"日产台数", expr:"1e8*25000", sanity:{max:1e10,note:"帝国总兵力"}}',
      '  → ⚠ 超出上限 1e10（帝国总兵力）达 250 倍。键 max/min/expect/note，',
      '  expect 是期望量级（expect:3 即 10³）。',
      '  判据来自你，工具只比对不猜；量纲不管；不声明则零提示。',
      '',
      '【账本闭合】无独立 check 操作，一条 expressions 逐项列值即可：',
      '  [{label:"A",expr:"650*3840"}, {label:"四项和",expr:"..."},',
      '   {label:"与目标之差",expr:"...-4075000"}]  ← 差值 0 即闭合',
      '  不做 PASS/FAIL：差 3 与差 3% 是两回事，压成布尔就糊了。',
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
/**
 * 承认的参数名白名单 —— 从 `MathArgs` 接口派生，不手写。
 *
 * ## 为什么需要这份白名单
 *
 * 踩过的坑：`{expression:'1+3', foo_bar_baz:123}` 会**静默成功**并返回 3。
 * 调用方以为参数生效了，实际被整个吞掉。这类「以为做了、其实没做」
 * 比报错危险得多 —— 与 overrides 里 key 拼错被丢弃是同一类问题。
 *
 * ## 为什么不靠 JSON Schema 的 additionalProperties
 *
 * 工具的 input schema 是宿主侧契约，加严会影响所有历史调用；
 * 而「参数名拼错」这件事在本工具内部就能判，判得更早、提示更具体。
 *
 * ## 白名单从哪来
 *
 * 不手写清单（手写必然与接口漂移）。用 TypeScript 的类型约束保证
 * `KNOWN_ARGUMENT_KEYS` 覆盖 `MathArgs` 的全部键：少一个键 tsconfig 会报错。
 * 见文件末尾的 `_AssertKeysCoverMathArgs`。
 */
const KNOWN_ARGUMENT_KEYS: ReadonlySet<string> = new Set<string>([
  // 基础计算
  'expression', 'expressions', 'terse', 'variables', 'operation', 'variable',
  'matrix', 'vector', 'precision', 'displayPrecision',
  // 数据与统计
  'data', 'dataY', 'distribution', 'params', 'x', 'degree',
  // 公式
  'formula', 'overrides', 'query', 'customExpression',
  // 微分方程 / 物理
  'initial', 'from', 'to', 'steps', 'samples',
  // 星球与推演
  'world', 'terrain', 'constants', 'derivation', 'layer',
  // 工作区
  'action2', 'workspace', 'name', 'description', 'terrainName', 'workspaceVariables',
  'useWorkspaceVariables',
  // 设定一致性
  'claims', 'listConstraints',
  // 单位
  'unitValue', 'unitFrom', 'unitTo', 'customUnits', 'unitScales', 'unitScale',
  // 收支
  'balance',
  // 天体
  'bodyName', 'bodyKind', 'bodyConstant', 'bodyFactor', 'bodyType', 'bodyEvidence',
  // 逆推校准
  'anchor', 'anchorValue', 'compareFrom', 'compareTo',
  // 幻想层
  'fantasyAbility', 'fantasyDemand', 'fantasyPhysical', 'fantasyBodyArea',
  // 混沌 / 继承 / 对比
  'lyapunov', 'inheritDerived', 'inheritBase', 'inheritSync', 'diffA', 'diffB',
  // 观测者 / 图 / 时间轴 / 白皮书 / 溯源 / 算力
  'observerKind', 'graphDepths', 'timelineFrom', 'timelineTo', 'timelineSteps',
  'whitepaperMode', 'traceTarget', 'costKind', 'costX', 'costY',
  'costIterations', 'costCombos', 'costWithPipeline',
  // 提示档位
  'promptMode',
  // 公式表
  'tableAction', 'formulaId', 'newExpression', 'newParams', 'customFormula',
  // 自定义常数
  'customAction', 'customConstant', 'customConstantName', 'expectedDimension',
  // 结论文翻转
  'flipClaim', 'flipEpsilon', 'flipBase',
  // 杂项
  'threshold', 'worstLimit', 'variableName', 'constantName',
  'emptyOnly', 'dryRun', 'olderThanDays', 'keep', 'tempPrefixes',
  'sensitivityBase', 'sensitivityExponent',
]);

/**
 * world 的**顶层简写参数**（`{operation:'world', starMass:10}` 这种写法）。
 *
 * 这些键**不在 `MathArgs` 接口里**，但它们是合法输入 —— 由 `WORLD_PARAMS` 决定，
 * `opWorld` 会遍历它把顶层值并入 `world`。
 *
 * 踩过的坑：白名单第一版只抄了接口里的 4 个（planetRadius/planetMass/rotationHours/obliquityDeg），
 * 于是 `{operation:'world', starMass:10}` 被新加的校验拦下 —— **world 套件当场红**。
 * 教训：白名单不能只认 TypeScript 接口，接口落后于实现的部分会变成假阳性。
 * 所以这里**从真实数据源 `WORLD_KEYS` 派生**，接口补不全也不影响。
 */
const WORLD_SHORTHAND_KEYS: readonly string[] = WORLD_KEYS

/**
 * 查有没有拼错/多余的参数名。
 *
 * ## 为什么大小写变体也一律报错
 *
 * 做过一版「容忍大小写差异」（把 `DisplayPrecision` 归一到 `displayPrecision`），
 * 实测发现更糟：**参数被接受，却因为代码只读小写键而完全不生效**，
 * 输出静默退回 8 位。那不是宽容，那是另一种静默 ——
 * 比直接报错更难排查，因为连错误信息都没有。
 *
 * 所以这里只做**精确匹配**：名字必须是白名单里那个写法，一个字母都不差。
 *
 * @param rawArguments - 调用方原样的参数对象
 * @returns 认不出的键；空数组表示全部可识别
 */
function findUnknownArguments(rawArguments: unknown): string[] {
  if (rawArguments === null || typeof rawArguments !== 'object' || Array.isArray(rawArguments)) return []
  const unknown: string[] = []
  for (const key of Object.keys(rawArguments as Record<string, unknown>)) {
    if (KNOWN_ARGUMENT_KEYS.has(key)) continue
    if (WORLD_SHORTHAND_KEYS.includes(key)) continue
    unknown.push(key)
  }
  return unknown.sort()
}

/**
 * 工具主入口：永不抛异常。
 *
 * 所有失败都转成 `{ ok:false, error:{ type, message, hint } }`，
 * 因为宿主侧把抛异常当成「工具坏了」，而这里的失败几乎都是**输入问题**，
 * 调用方按 hint 改一下就能过。
 *
 * @param rawArguments - 宿主传进来的参数对象（可能是任意形态，这里先做白名单校验）
 * @returns 永远是一个 MathResult，不会 throw
 */
export function runMathTool(rawArguments: unknown): MathResult {
  const args = (rawArguments ?? {}) as Partial<MathArgs>
  const input = typeof args.expression === 'string' ? args.expression.trim() : ''

  let operation: MathOperation = 'auto'
  let precision = DEFAULT_PRECISION
  /** 显示有效位数；undefined = 未设定（沿用计算精度，即完整输出）。 */
  let displayPrecision: number | undefined

  try {
    /**
     * 先把「认不出的参数名」拦下来。
     *
     * 不静默继续算 —— 那样调用方会以为某个参数已经生效
     * （实测见过：`displayPrecision:0`、`format`、`sigfigs` 都是这样被吞的）。
     */
    const unknownArguments = findUnknownArguments(rawArguments)
    if (unknownArguments.length > 0) {
      throw new CalcError(
        'unknown_argument',
        '这些参数名认不出来，已经被忽略（本次没有生效）: ' + unknownArguments.join('、'),
        '按名字传给 help 可查用法: {operation:"help"}。' +
          '常见原因：拼写笔误、大小写、把某个 operation 的子字段提到了顶层' +
          '（如 terrain 的字段要放在 terrain 对象里）。',
      )
    }
    precision = clampPrecision(args.precision)
    /**
     * 显示精度：本次显式给 > 工作区固化值 > 沿用计算精度。
     *
     * 优先级这样排，是为了让「临时想看更多」不必改工作区设置：
     *   · 对话开始时定一次（workspace set displayPrecision）
     *   · 某次需要更多，那一次单独传 displayPrecision 即可
     */
    /**
     * 显示精度：本次显式给 > 工作区固化值 > **默认 8 位小数**。
     *
     * ## 为什么默认不是「完整输出」
     *
     * 原来未设时按 64 位全吐，结果一条公式回来六十五个数字，
     * 人和 AI 都得自己截断才能读。默认 8 位小数后：
     *   · 月供 5307.26720623（可读）
     *   · 整数照旧完整（10^20+5 仍是 21 位）
     *
     * ## 8 是「小数点后 8 位」，不是 8 位有效数字
     *
     * 这点很关键：有效数字语义下 `12345.678901234` 只会给 3 位小数，
     * 与「保留 8 位」的直觉不符。
     *
     * ## 需要更多时
     *
     * 单次传 `displayPrecision` 即可（如 12），或固化到工作区。
     * 大整数/数论场景整数本就完整，不受影响。
     */
    /**
     * 显示精度优先级：本次 displayPrecision > 工作区固化 > **由 precision 推出** > 默认 8 位。
     *
     * ## 为什么要看 precision
     *
     * 原来未设显示精度时一律用默认 8 位小数，结果 `precision:30` 算出的
     * `1/3` 只显示 `0.33333333` —— 调用方明确要求 30 位却只给 8 位，
     * 这是把「计算精度」的心智模型搞坏了。
     *
     * 判据：只要调用方**显式**给了 precision（且不是默认值），
     * 就认为他想要看到那么多位，显示位数取 precision。
     * 没显式给时才回落默认 8 位。
     */
    const explicitPrecision = args.precision !== undefined && Number.isFinite(Number(args.precision))
    const explicitDisplay = clampDisplayPrecision(args.displayPrecision) !== undefined
    displayPrecision =
      clampDisplayPrecision(args.displayPrecision) ??
      displayPrecisionOf() ??
      (explicitPrecision ? Math.min(64, precision) : DEFAULT_DISPLAY_PRECISION)
    /**
     * 记录「显示精度是否由调用方显式指定」。
     *
     * 用途：只有用默认值时才提醒「精度可能不够」。
     * 调用方自己写 `displayPrecision:2` 时，截断是他的意图，再提醒就啰嗦了。
     *
     * 另外每次调用开头都要清空损失统计，否则上一轮的误差会挂到本轮结果上。
     */
    setDisplayPrecisionExplicit(explicitDisplay)
    consumePrecisionLoss()
    /**
     * 设成模块级，让 trimNumber（solve / matrix / stats 等四十多个调用点）自动生效。
     *
     * 不逐个改函数签名，是因为「显示精度在一次调用内全局一致」——
     * 入口设一次即可，各层读同一个值。
     */
    setActiveDisplayPrecision(displayPrecision)
    const variable = normalizeVariable(args.variable)
    const requested = normalizeOperation(args.operation)
    /**
     * 作用域输入按「本次参数 > 工作区变量」合并。
     *
     * 合并只发生在**计算路径**（这一处），且受工作区开关 `useWorkspaceVariables` 控制；
     * 开关关闭时 `mergeWorkspaceVariables` 原样返回 `args.variables`，
     * 行为与旧版完全一致。
     *
     * 为什么只在这一处合并、而不是每个 operation 各自去读工作区：
     * 那样每个 op 都要自己处理「合并 + 优先级 + 缓存指纹」，
     * 迟早有一处漏掉（缓存指纹漏掉就是静默返回旧值）。
     */
    const scopeVariables = mergeWorkspaceVariables(args.variables)
    const known = knownNumbers(scopeVariables)
    const engine = bignum(precision)
    /**
     * 每次调用开头清空「被跳过的变量键」记录，避免串到上一次调用。
     * 与 `activeDisplayPrecision` 同理：模块级状态必须每次开头复位。
     */
    resetSkippedVariableKeys()
    const scope = buildScope(engine, scopeVariables)

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

    /**
     * ── 缓存查询 ──
     *
     * 只缓存**纯计算型** operation：它们的结果只取决于参数、常数与工作区，
     * 不随时间变化。`world`/`derivation`/`impact`/`bodies` 这类也确定，
     * 但输出较长、不是高频重复对象，缓存收益低于占位成本，故不纳入。
     *
     * `workspace` / `formula-table` / `promptMode` 有**副作用**（会改状态），
     * 绝不能缓存 —— 命中会跳过副作用，行为就变了。
     *
     * 键里必须含常数与工作区指纹：改常数后同一式子结果不同，
     * 漏了这条会静默返回「改之前」的数。
     */
    const CACHEABLE: MathOperation[] = [
      'auto', 'evaluate', 'solve', 'system', 'derivative', 'integral',
      'simplify', 'expand', 'roots', 'matrix', 'eigen', 'stats', 'dist',
      'regression', 'ode', 'formula', 'units',
    ]
    /**
     * 状态变更类操作：先清空缓存，再走正常流程。
     *
     * 为什么必须在**查询之前**清：这些操作会改变后续计算的结果
     * （改公式表覆盖、切工作区、改常数、改显示精度），
     * 而其自身不在 CACHEABLE 里，所以不会被缓存命中 ——
     * 但它们影响过的**下游计算**仍在缓存里，不清就会拿到旧值。
     *
     * 实测踩到：先覆盖 kinetic_energy 公式算出 18，移除覆盖后
     * 再算同一公式仍得 18（缓存命中），而正确答案是 9。
     * 这类错很隐蔽——两个数都是「算出来的」，只是后者属于旧公式表。
     */
    const MUTATING: MathOperation[] = ['workspace', 'formula-table']
    if (MUTATING.includes(operation)) {
      clearCache()
    }

    let cacheHitKey: string | undefined
    if (CACHEABLE.includes(operation)) {
      try {
        /**
         * 缓存键用**整个 args 的稳定序列化**，而不是手动列举几个参数。
         *
         * 为什么改（踩过）：最初只列了 expression/formula/overrides/data 等几项，
         * 结果 `dist` 的 `distribution`/`params`/`x` 没进键 ——
         * 先算正态分布、再算二项分布时**命中了正态的结果**，
         * 二项 PMF 返回了正态的 PDF。这类串键的错最难发现（结果看着像个正常的数）。
         *
         * 现在把 args 全量序列化（排除纯显示选项），漏一个参数的可能性归零。
         * 代价是多算几次字符串，与「算错」比起来不值一提。
         */
        const { displayPrecision: _dp, promptMode: _pm, ...restForCache } = args as Record<string, unknown>
        /**
         * 键里要带「显示精度是否显式」这一位。
         *
         * 踩过：显式传 `displayPrecision:8` 与用默认值 8 是**同一个数值**，
         * 键就撞了 —— 显式调用命中了默认调用的缓存，连带返回那条
         * 「精度不足」提示（默认调用才该有）。结果作者自己指定了精度，
         * 却被告知「精度不够，请调高」，自相矛盾。
         *
         * 两者的输出确实不同（提示有无），所以键必须区分。
         */
        const key = cacheKey([
          operation,
          precision,
          displayPrecision ?? -1,
          explicitDisplay ? 'explicit' : 'default',
          stableArgs(restForCache),
          activeWorkspaceNameForCache(),
          constantsFingerprint(),
          /**
           * 变量内容必须进键：见 `workspaceVariablesFingerprint` 的说明。
           * 开关关闭时这一项是常量 'disabled'，等价于旧行为。
           */
          workspaceVariablesFingerprint(),
        ])
        const cached = getCached(key)
        if (cached !== undefined) {
          cacheHitKey = key
          // 命中：直接返回，但仍标注是缓存结果，便于观察
          return { ...(cached as MathResult), cached: true }
        }
        cacheHitKey = key
      } catch {
        /* 缓存键构造失败不影响计算（可能含不可序列化的参数） */
      }
    }

    let outcome: Outcome
    /**
     * 批量模式优先：给了 expressions 就走批量，忽略单条 expression。
     *
     * 不缓存批量结果：批量通常是一次性探查（同一批式子很少重复出现），
     * 缓存它们只会挤占单条计算的位置。
     */
    if (Array.isArray(args.expressions) && args.expressions.length > 0) {
      outcome = opEvaluateBatch(engine, args.expressions, scope, precision, args.terse === true)
      /**
       * 批量里**有失败**时，顶层 `ok` 必须为 false。
       *
       * ## 修的是什么
       *
       * 实测反馈（2026-11-06）：批量里一条 `unknown_symbol` 失败时，
       * `result` 里写着「→ 失败[unknown_symbol]」，但 `ok` 仍是 `true`、
       * `error` 是 `undefined`。于是任何写 `if (r.ok)` 的调用方
       * **都会把失败当成成功**，再把失败文本当数值用。
       *
       * 原话：「我在本次任务中多次写 `if (!r.ok)` 来判断成败，
       *   得到的结果是『永远成功』——因为 `ok` 永远是 `true`。」
       *
       * ## 为什么不是「一条失败就整批失败」
       *
       * 「一条失败不影响其它条」是这个批量模式的核心优点，不能丢。
       * 所以这里分开表达：
       *   · `ok: false`      —— 告诉自动化流程「本批**不是**全好」
       *   · `partial: true`  —— 告诉它「但有成功的条目可用」
       *   · `failed / succeeded` —— 给出具体数量，便于分流处理
       *
       * 顶层 `error` 仍是 `undefined`（这是**批量**失败，不是某个单条的错误；
       * 每条的原因都在 `value.items` 里）。若硬塞一个 error，
       * 反而会让「只有第 3 条错」被读成「整个调用都错了」。
       */
      const batchValue = (outcome.value ?? {}) as Record<string, unknown>
      const failedCount = typeof batchValue.failed === 'number' ? batchValue.failed : 0
      const succeededCount = typeof batchValue.success === 'number' ? batchValue.success : 0
      const batchResult: MathResult = {
        ok: failedCount === 0,
        operation: 'evaluate',
        input: args.expressions.join(' ; ').slice(0, 200),
        result: outcome.result,
        precision,
      }
      if (outcome.value !== undefined) batchResult.value = outcome.value
      if (failedCount > 0) {
        batchResult.partial = succeededCount > 0
        batchResult.failed = failedCount
        batchResult.succeeded = succeededCount
      }
      /**
       * 被跳过的变量键在**批量路径**也要告知。
       *
       * 踩过：第一版只在函数末尾的单条路径上组装这条提示，
       * 而批量在 3078 行就 return 了 —— 于是批量调用永远看不到它。
       * 这正是实测反馈里的原始场景（一批算式 + 一个中文变量名）。
       */
      const skippedInBatch = takeSkippedVariableKeys()
      if (skippedInBatch.length > 0) {
        const parts = skippedInBatch.map(function (item) { return item.name + '（' + item.reason + '）' })
        batchResult.notice =
          '这些变量名没被采用，已跳过（其余照算）: ' + parts.join('；') +
          '。变量名只能含字母、数字、下划线；中文名可先存进工作区再引用。'
      }
      return batchResult
    }
    switch (operation) {
      case 'help':
        outcome = opHelp()
        break
      case 'derivative':
        outcome = opDerivative(input, variable, precision)
        break
      case 'integral':
        outcome = opIntegral(
          input,
          variable,
          precision,
          typeof args.from === 'number' ? args.from : undefined,
          typeof args.to === 'number' ? args.to : undefined,
        )
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
      case 'bodies':
        outcome = opBodies(args)
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
     * ── 显示精度提示（方案 B）──
     *
     * 放进独立的 `notice` 字段，**不拼进 `result`**：
     * `result` 是数据通道，做精确相等断言的调用方依赖它保持干净；
     * `notice` 只在渲染时展示给模型看。
     *
     * 确定性：没固化 + 结果有小数 → 每次都带同样的提示，
     * 所以「同输入同输出」不受影响。
     */
    const hintNote = maybeDisplayPrecisionHint(result.result)
    if (hintNote) result.notice = hintNote

    /**
     * 三角函数按弧度算时补一句说明。
     *
     * 走 `notice` 而不是拼进 `result`：`result` 是数据通道，
     * 往里拼提示会让依赖精确相等（`sin(30) = -0.98803162`）的调用方失配 ——
     * 这与「显示精度提示走 notice」是同一条既有约定。
     *
     * 实测反馈（2026-11-06 第二份）：中文工程语境里 `sin(30)` 的默认读法是 30 度，
     * 而工具按弧度给出 `-0.988` —— 数字看着正常，用户不会察觉。
     */
    if (operation === 'evaluate' && input !== '') {
      const angleNote = checkAngleUnit(input)
      if (angleNote) {
        result.notice = result.notice ? result.notice + '\n' + angleNote : angleNote
      }
    }

    /**
     * 带单位的结果补说明：「这个数有多大、等价于什么」。
     *
     * 实测：`evaluate` 带单位的结果只有裸文本（`87.78 Mt`，notice 为空），
     * 而 `units` 操作有【代入过程】【注意】——两者信息量差得远。
     * 模型看到 `87.78 Mt` 并不知道它是 8778 万吨。
     *
     * 用户原话：「面向 AI 的运算信息最好把信息注释写到位。」
     */
    {
      const unitNote = explainUnitResult(result.result)
      if (unitNote) {
        result.notice = result.notice ? result.notice + '\n' + unitNote : unitNote
      }
    }

    /**
     * 被跳过的变量键要告知，不能静默。
     *
     * 实测反馈（2026-11-06 第二份）：`variables` 里写了一个中文键，
     * 整批中止、合法算式一条没算。现在改成「跳过 + 告知」——
     * 算出来的数是对的，但调用方必须知道哪个键没生效，
     * 否则它会以为 `人口` 已经传进去了。
     */
    const skippedVars = takeSkippedVariableKeys()
    if (skippedVars.length > 0) {
      const parts = skippedVars.map(function (item) { return item.name + '（' + item.reason + '）' })
      const skipNote =
        '这些变量名没被采用，已跳过（其余照算）: ' + parts.join('；') +
        '。变量名只能含字母、数字、下划线；中文名可先存进工作区再引用。'
      result.notice = result.notice ? result.notice + '\n' + skipNote : skipNote
    }

    /**
     * ── 精度不足提醒 ──
     *
     * 与上面那条「可以调精度」不同：这条是**具体的**——本次结果真的因为位数不够
     * 而丢了精度。判据是相对误差超过万分之一。
     *
     * ## 什么时候该提醒
     *
     * 例：`0.00000123456789` 在 8 位小数下变成 `0.00000123`，
     * 相对误差约 0.3%。作者看到这个数会以为是精确值，实际已经偏了。
     * 而 `1/7` 在 8 位小数下误差约 1e-9，完全不用提。
     *
     * ## 什么时候不提醒
     *
     * 调用方自己指定了 `displayPrecision` 时不提 —— 那是他的选择。
     *
     * 取「两条提示取更强的」：精度损失提示优先于泛泛的「可以调」提示。
     */
    /**
     * ── 精度损失：只在**真的丢精度**时提示一句 ──
     *
     * 与旧实现的关键区别：旧版只要「未固化 + 结果有小数」就附一段说明，
     * 一次 60+ 次调用的会话里出现 60+ 次（用户实测反馈：纯噪音）。
     * 现在判据是**相对误差超过万分之一**，普通计算（`1/7` 误差 1e-9）不提示。
     *
     * 两种情况的说法不同：
     *   · 未显式指定 → 已自动改用科学计数法，说明为什么换格式
     *   · 显式指定   → 格式按你要求的保留，但告知这个位数丢了精度
     */
    const loss = consumePrecisionLoss()
    /**
     * 显式指定时用**更宽松**的提示阈值。
     *
     * 理由：调用方既然写了 `displayPrecision:4`，就已经接受「4 位小数的精度」。
     * `1/7` → `0.1429` 的相对误差是 0.03% —— 那是他要求的结果，不值得提示。
     * 只有丢到 1% 以上（如 `disp:4` 下的 σ 直接归零）才该说一句。
     *
     * 未显式指定时保持万分之一：那时代码替用户做了取舍，要说明。
     */
    const noticeThreshold = isDisplayPrecisionExplicit() ? 1e-2 : PRECISION_LOSS_THRESHOLD
    if (loss > noticeThreshold) {
      const percent = loss >= 1 ? '>100' : (loss * 100).toFixed(loss > 0.1 ? 0 : 2)
      result.notice = isDisplayPrecisionExplicit()
        ? '按你指定的 ' + displayPrecision + ' 位小数定点显示会丢约 ' + percent +
          '% 的精度，结果已按该位数给出。需要精确值请传 displayPrecision:' +
          Math.min(64, displayPrecision + 8) + '。'
        : '本次结果已改用科学计数法：按 ' + displayPrecision + ' 位小数定点显示会丢约 ' +
          percent + '% 的精度。要定点显示请传 displayPrecision:' +
          Math.min(64, displayPrecision + 8) + '。'
    }

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
    // 写缓存（只在成功路径；错误不缓存，否则同一个错会一直被命中）
    if (cacheHitKey !== undefined) {
      try {
        setCached(cacheHitKey, result)
      } catch {
        /* 写入失败不影响返回 */
      }
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

/**
 * 首次调用时提示显示精度可调（方案 B）。
 *
 * ## 为什么需要这个
 *
 * 提示词里的「开工时定一次显示精度」实测没被触发：它在注入文本第 607 字符，
 * 而且「开工」这个时机对模型并不存在（每轮都像「继续」）。
 *
 * 但**拿到结果的那一刻**不同：模型手上正拿着一个被截断过的小数，
 * 这时说「这个位数可以调」才有说服力 —— 需求在眼前，建议才有效。
 *
 * ## 为什么放进独立的 notice 字段，而不是拼进 result
 *
 * 试过拼进 result，代价太大：一条 `0.1+0.2` 的结果从 `0.3` 变成两行，
 * 所有做**精确相等**断言的调用方（测试、脚本、下游工具）全部失效 ——
 * 实测一次跑挂 8 个套件。
 *
 * `result` 是数据通道，必须保持干净；`notice` 只用于渲染给模型看。
 *
 * ## 为什么不用「每会话只提示一次」
 *
 * 那个版本破坏了「同输入同输出」的确定性（第一次带提示、第二次不带）。
 * 现在改成确定性判断：没固化 + 结果里有小数 → 每次都带。
 *
 * @param resultText - 已格式化的结果文本
 * @returns 提示文本；不该提示时返回空串
 */
function maybeDisplayPrecisionHint(resultText: string): string {
  try {
    /**
     * ── 这条通用提示已被移除（2026-11-02，依据实测反馈）──
     *
     * 原实现：「未固化显示精度 + 结果里有小数」就附一行说明。
     * 实测代价：一次 60+ 次调用的会话里，这条提示出现 **60+ 次** —— 纯噪音。
     *
     * 为什么不能改成「只提示前 3 次」：那会破坏「同输入同输出」的确定性
     * （第一次带提示、第二次不带，输出不再字节一致），本项目把它当硬不变量。
     *
     * 现在改为**只在真的丢精度时**提示一句具体的说明（见下方的精度损失分支），
     * 而且格式本身已自动换成科学计数法，所以那种情况也很少出现。
     *
     * 「显示精度可调」这件事已经写在工具描述、系统提示与 playbook 三处，
     * 不需要每次调用重复提醒。
     */
    void resultText
    return ''
  } catch {
    return ''
  }
}

/**
 * 常数指纹：把当前生效的常数压成一个稳定字符串，用于缓存键。
 *
 * 为什么必须有它：改了 c 之后，同样的表达式结果不同。
 * 若缓存键不含常数，命中时会返回「改之前」的数 —— 那是静默错误，
 * 而且是本插件最不能出的那种错（作者以为看到的是新宇宙的结果）。
 *
 * 只取**基础旋钮**就够：派生量由它们唯一决定。
 *
 * @returns 指纹字符串
 */
function constantsFingerprint(): string {
  try {
    const active = getActiveConstants() as Record<string, unknown>
    const keys = Object.keys(active).sort()
    return keys.map(function (key) {
      const value = active[key]
      return key + '=' + (typeof value === 'number' ? value.toPrecision(15) : String(value))
    }).join(';')
  } catch {
    // 读不到就返回随机值，等于禁用缓存（宁可慢，不可错）
    return 'unknown-' + Math.random()
  }
}

/**
 * 工作区变量指纹（缓存键用）。
 *
 * ## 为什么必须有这一条
 *
 * 缓存键原本只含**工作区名**与**常数指纹**，不含变量内容。于是：
 *
 * ```
 *   存 BTU_LB=1260000 → 算 30*BTU_LB → 得数，进缓存
 *   改成 BTU_LB=126000   → 再算 → 命中旧缓存 → 还是按 1260000 的数
 * ```
 *
 * 这是**静默返回改之前的数**，比不缓存危险得多 ——
 * 与「改常数后必须失效」是同一条道理，只是状态源换成了变量。
 *
 * ## 开关关闭时返回固定串（而不是空）
 *
 * 空串与「有变量但指纹为空」无法区分。返回一个明确的常量，
 * 让键的行为在「开关关闭」这件事上也保持稳定。
 *
 * @returns 稳定的指纹字符串
 */
function workspaceVariablesFingerprint(): string {
  if (!useWorkspaceVariables()) return 'disabled'
  try {
    const stored = workspaceVariablesOf()
    const keys = Object.keys(stored).sort()
    if (keys.length === 0) return 'empty'
    return keys
      .map(function (key) { return key + '=' + stored[key].toPrecision(15) })
      .join(';')
  } catch {
    // 读不到就给随机值 —— 宁可慢，不可错（与 constantsFingerprint 同策略）
    return 'unknown-' + Math.random()
  }
}

/**
 * 当前工作区名（缓存键用）。
 *
 * 不同工作区有各自的公式表、自定义常数与变量，
 * 同一个表达式可能给出不同结果，所以必须进键。
 *
 * @returns 工作区名
 */
function activeWorkspaceNameForCache(): string {
  try {
    return currentWorkspace()
  } catch {
    return 'unknown-' + Math.random()
  }
}

/**
 * 把参数对象序列化成稳定字符串（缓存键用）。
 *
 * 与 `stableStringify` 的区别：这个专为「可能含各种嵌套」的调用参数而写，
 * 遇到不可序列化的值就退化成类型标记 —— 宁可少命中，不可串键。
 *
 * @param value - 参数值
 * @returns 稳定字符串
 */
function stableArgs(value: unknown): string {
  if (value === null || value === undefined) return ''
  const kind = typeof value
  if (kind === 'number') {
    return Number.isFinite(value as number) ? (value as number).toPrecision(15) : String(value)
  }
  if (kind === 'string' || kind === 'boolean') return String(value)
  if (Array.isArray(value)) return '[' + value.map(stableArgs).join(',') + ']'
  if (kind === 'object') {
    const object = value as Record<string, unknown>
    const keys = Object.keys(object).sort()
    return '{' + keys.map(function (key) {
      return key + ':' + stableArgs(object[key])
    }).join(',') + '}'
  }
  return '?' + kind
}

/**
 * 解析**显示**精度。
 *
 * 与 `clampPrecision` 的区别：这个不影响计算，只影响写出来的位数，
 * 所以允许更宽的范围（**0—64**）并且**允许返回 undefined**（= 没给）。
 *
 * ## 0 在这里是「0 位小数」，不是「清除」
 *
 * 踩过的坑：这里原先把 `<= 0` 当作未给，于是 `displayPrecision: 0`
 * 被静默丢弃、照旧输出 8 位小数 —— 而 schema 上白纸黑字写着「0-64」。
 * 文档与实现对不上，正是这个项目一直要避免的那类问题。
 *
 * **两处 0 的语义刻意不同，各有各的理由**：
 *   · 本次参数 `displayPrecision: 0` → `3.14159265` 显示成 `3`
 *     （问的是「这次显示几位」，0 是合法答案）
 *   · 工作区 `set displayPrecision: 0` → 清除固化值
 *     （问的是「要不要保存」，0 表示不要）
 *
 * @param value - 原始参数
 * @returns 显示位数（0—64）；未给或非法返回 undefined
 */
function clampDisplayPrecision(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return undefined
  return Math.min(64, Math.max(0, Math.round(numeric)))
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
    /**
     * 附加提示（渲染时展示，不进 `result`）。
     *
     * ⚠️ 必须声明在这里。宿主用 `additionalProperties: false` **校验**工具输出，
     * 漏一个字段就会让整次调用判为「invalid output」而失败 ——
     * 实测踩过：加了 notice 却忘了声明，`bodies` 调用直接被宿主拒绝。
     */
    notice: { type: 'string', description: '附加提示（显示精度/精度不足等）' },
    /** 结果来自缓存（未重算）。同样必须声明，否则命中缓存时调用失败。 */
    cached: { type: 'boolean', description: '是否命中缓存' },
    /**
     * 批量模式下「部分成功」。
     *
     * 语义：本批**有失败条目**（所以 `ok` 是 false），但**也有成功的**可用。
     * 没这个字段时，调用方无法区分「整批全废」与「废一条、其余可用」。
     */
    partial: { type: 'boolean', description: '批量部分成功（有失败条目但仍有成功结果）' },
    /** 批量模式：失败条目数。 */
    failed: { type: 'integer', description: '批量中失败条数' },
    /** 批量模式：成功条目数。 */
    succeeded: { type: 'integer', description: '批量中成功条数' },
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

/**
 * 编译期守卫：`KNOWN_ARGUMENT_KEYS` 必须覆盖 `MathArgs` 的每一个键。
 *
 * 手写白名单最大的风险是**与接口漂移** —— 新增一个参数却忘了加进白名单，
 * 那条新参数就会被自己的校验拦下（比不校验更糟）。
 * 这里用「键的联合类型必须被白名单收住」的写法把漂移变成编译期报错。
 *
 * 少了哪个键，tsc 会直接指出该键名。
 */
type MathArgsKeys = keyof MathArgs
type _KeysCovered = MathArgsKeys extends string ? (MathArgsKeys extends KnownKeyUnion ? true : never) : never
type KnownKeyUnion =
  | 'expression' | 'expressions' | 'terse' | 'variables' | 'operation' | 'variable'
  | 'matrix' | 'vector' | 'precision' | 'displayPrecision'
  | 'data' | 'dataY' | 'distribution' | 'params' | 'x' | 'degree'
  | 'formula' | 'overrides' | 'query' | 'customExpression'
  | 'initial' | 'from' | 'to' | 'steps' | 'samples'
  | 'world' | 'planetRadius' | 'planetMass' | 'rotationHours' | 'obliquityDeg'
  | 'terrain' | 'constants' | 'derivation' | 'layer'
  | 'action2' | 'workspace' | 'name' | 'description' | 'terrainName' | 'workspaceVariables'
  | 'useWorkspaceVariables'
  | 'claims' | 'listConstraints'
  | 'unitValue' | 'unitFrom' | 'unitTo' | 'customUnits' | 'unitScales' | 'unitScale'
  | 'balance'
  | 'bodyName' | 'bodyKind' | 'bodyConstant' | 'bodyFactor' | 'bodyType' | 'bodyEvidence'
  | 'anchor' | 'anchorValue' | 'compareFrom' | 'compareTo'
  | 'fantasyAbility' | 'fantasyDemand' | 'fantasyPhysical' | 'fantasyBodyArea'
  | 'lyapunov' | 'inheritDerived' | 'inheritBase' | 'inheritSync' | 'diffA' | 'diffB'
  | 'observerKind' | 'graphDepths' | 'timelineFrom' | 'timelineTo' | 'timelineSteps'
  | 'whitepaperMode' | 'traceTarget' | 'costKind' | 'costX' | 'costY'
  | 'costIterations' | 'costCombos' | 'costWithPipeline'
  | 'promptMode'
  | 'tableAction' | 'formulaId' | 'newExpression' | 'newParams' | 'customFormula'
  | 'customAction' | 'customConstant' | 'customConstantName' | 'expectedDimension'
  | 'flipClaim' | 'flipEpsilon' | 'flipBase'
  | 'threshold' | 'worstLimit' | 'variableName' | 'constantName'
  | 'emptyOnly' | 'dryRun' | 'olderThanDays' | 'keep' | 'tempPrefixes'
  | 'sensitivityBase' | 'sensitivityExponent'

/** 运行期再兜一次：白名单里不许有接口没有的键（防止手滑多写）。 */
const _KEY_SET_MATCHES_INTERFACE: ReadonlySet<string> = KNOWN_ARGUMENT_KEYS
void 0 as unknown as _KeysCovered
void _KEY_SET_MATCHES_INTERFACE

function renderResult(value: any): Array<{ type: 'text'; text: string }> {
  const payload = (value ?? {}) as Partial<MathResult>
  if (payload.ok === false) {
    const type = payload.error?.type ?? 'error'
    const message = payload.error?.message ?? '未知错误'
    const hint = payload.error?.hint
    return [{ type: 'text', text: hint ? `错误[${type}]: ${message}\n提示: ${hint}` : `错误[${type}]: ${message}` }]
  }
  const result = typeof payload.result === 'string' ? payload.result : String(payload.result ?? '')
  /**
   * notice 只在渲染时追加，不进 `result` 本身。
   *
   * 这样模型看得到提示，而依赖 `result` 精确相等的调用方不受影响。
   */
  const notice = typeof payload.notice === 'string' && payload.notice !== '' ? payload.notice : ''
  return [{ type: 'text', text: notice ? `${result}\n\n（${notice}）` : result }]
}

const PARAMETER_SPEC = {
  expression: {
    type: 'string',
    description:
      '数学表达式、方程或待处理数据。多方程用逗号分隔（3x + 2y = 10, x - y = 1）。' +
      '例：10^20 + 5、factorial(50)、x^3 * sin(x)、[[1,2],[3,4]] * [[5],[6]]、[1,2,3,4]。operation=help 时可空。',
  },
  expressions: {
    type: 'array',
    /**
     * ## 这里声明 items，是推翻了之前「刻意不声明」的决定
     *
     * 之前的理由是「不声明也收得进来 + 省 schema 长度」。但那是错的：
     * **不声明等于模型看不见元素级字段**。上一轮修「元素里的未知键被静默忽略」时
     * 就撞上了这个 —— 校验现在会拒绝未声明的键，而模型不知道能写什么。
     *
     * 加了 `sanity` 之后更明显：一个模型看不见的参数等于不存在。
     * 所以把 items 加回来，长度从别处腾（`operation` 与 `customExpression` 各压一段）。
     */
    items: {
      type: 'json',
      description:
        '字符串（"1/7"）或对象 {label?, expr, sanity?}。' +
        'sanity 给锚点：{max,min,expect,note}，例 {max:1e10,note:"帝国总兵力"}。',
    },
    description: '批量求值，逐条独立报错。',
  },
  terse: {
    type: 'boolean',
    description: '省 token：只回「表达式 = 结果」。失败条照常标出原因。',
  },
  variables: {
    type: 'object',
    additionalProperties: true,
    description: '变量字典，注入表达式求值的环境。例：{"m": 500, "v": 30}。值可为数字或数字字符串。',
  },
  workspaceVariables: {
    type: 'object',
    additionalProperties: true,
    description: 'workspace/action2=set：把命名常数存进工作区，免去重打。默认不参与计算。',
  },
  useWorkspaceVariables: {
    type: 'boolean',
    description: 'workspace/action2=set：命名变量是否参与计算（默认 false）。详见 help。',
  },
  operation: {
    type: 'string',
    enum: OPERATIONS,
    // 不逐个解释每个 operation 名称：enum 里已经列全，而 `help` 有完整说明。
    // 这里只给「怎么选」的判断线索，那才是 AI 真正需要的。
    description:
      '默认 auto。简易算式用 evaluate；数据用 stats/dist/regression；' +
      '改动设定后用 world/derivation；不确定就调 help 看全表。',
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
      '每项 {name, dimension, factor}；dimension 见 help。',
  },
  balance: {
    type: 'object',
    additionalProperties: true,
    description:
      '收支盘点（operation=balance）：每项 {demand, supply, unit?}，给最短板。' +
      '只判社会收支；单项生理/工程上限用 feasibility。',
  },
  bodyName: {
    type: 'string',
    description:
      '查单个天体（operation=bodies）。可给 id（mars）或中文名（火星）。' +
      '已收录太阳系全 8 大行星 + 月球类卫星 + 代表性系外行星 + 矮行星 + 各亮度级恒星。',
  },
  bodyKind: {
    type: 'string',
    description:
      'bodies：按类别筛。star / planet-terrestrial / planet-gas-giant / moon / dwarf-planet 等，全文见 help。',
  },
  bodyConstant: {
    type: 'string',
    description:
      'bodies：改常数后看哪些天体数据该重算。例 bodyConstant="alpha_fs", bodyFactor=2。' +
      '输出分「必须重算」与「绝不该动」两块（行星质量/半径/轨道与 α 无关）。',
  },
  bodyFactor: {
    type: 'number',
    description: '常数变化倍数（operation=bodies，默认 2）。',
  },
  bodyType: {
    type: 'string',
    description:
      'bodies：查天体类型学条目（中子星/热木星/戴森球等）。每类标证据等级与「物理锁死项」。',
  },
  bodyEvidence: {
    type: 'string',
    description:
      '按证据等级筛天体类型（operation=bodies）：observed（已观测）/ ' +
      'theoretical（理论预言，物理必然但未直接观测）/ speculative（纯思辨）。',
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
    description:
      '**计算精度**：BigNumber 有效数字位数，默认 64，范围 1-256。' +
      '⚠️ 不要为了「输出好看」调低它——它决定计算的正确性：' +
      '`(10^20+1)-(10^20)` 在 precision=20 时会得 0（应为 1）。' +
      '只想让输出短一些，用 displayPrecision。',
  },
  displayPrecision: {
    type: 'integer',
    description:
      '**显示精度：小数点后几位**（0-64，默认 8）。只截小数，整数永远完整；0 = 只留整数。' +
      '换档可传单次值，或用 workspace set displayPrecision=N 固化（那里的 0 = 清除）。' +
      '别用 precision 达此目的。',
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
      'structure 级改造：临时替换公式表达式，沿用其参数名。例 formula="weight", customExpression="m*g*1.3" 表示重力 +30%。',
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
    // 字段清单不写在 schema 里：schema 每轮都要付费，而这些字段只在
    // 真用 world 时才需要。全文见 help（operation="help", query="world"）。
    description:
      '星球参数（operation=world），全部可选，默认地球。' +
      '常用键：planetMass/planetRadius、starMass/starTemp、rotationHours、obliquityDeg。' +
      '完整字段表见 help。',
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
    // 同上：地形字段有九项，逐项列在 schema 里太贵。
    description:
      '局部地形（operation=world 附带），给了就额外输出该地点气候细节。' +
      '常用键：kind、elevation、latitudeDeg、oceanCurrent。完整键表见 help。',
  },
  constants: {
    type: 'object',
    additionalProperties: true,
    // 旋钮清单移进 help：只有要改常数时才需要，不该每轮付费
    description:
      '要改的物理常数（operation=constants），只能改基础旋钮，派生量自动重算。' +
      '例：{c:1.5e8}。可用旋钮清单见 help 的 constants 条目。',
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
