/**
 * ops 共享基础设施。
 * ============================================================================
 *
 * 这些原本都定义在 index.ts 里，被多个 operation 实现共用。抽取 operation 时
 * 统一挪到这里，各 op 模块从这里导入 —— 既不复制定义，也避免 op 模块反向
 * import index.ts 造成循环依赖。
 *
 * 注意 mathjs 引擎缓存（bignum / fast）必须保持单例，所以和类型放在同一模块。
 * JsonValue / toJsonValue 属于 format.js，这里不重复定义。
 */

import { create, all } from 'mathjs'

import type { JsonValue } from '../format.js'
import type { TerrainParams } from '../terrain.js'
import type { WorldParams } from '../world.js'

// ────────────────────────────────────────────────────────────────────────────
// 类型
// ────────────────────────────────────────────────────────────────────────────

export type MathOperation =
  | 'auto'
  | 'evaluate'
  | 'solve'
  | 'system'
  | 'derivative'
  | 'integral'
  | 'simplify'
  | 'expand'
  | 'roots'
  | 'matrix'
  | 'eigen'
  | 'stats'
  | 'dist'
  | 'regression'
  | 'formula'
  | 'formulas'
  | 'ode'
  | 'world'
  | 'constants'
  | 'workspace'
  | 'impact'
  | 'quantities'
  | 'formula-table'
  | 'feasibility'
  | 'help'

export interface MathArgs {
  expression?: string
  variables?: { [key: string]: number | string }
  operation?: MathOperation
  variable?: string
  matrix?: number[][]
  vector?: number[]
  precision?: number
  data?: number[]
  dataY?: number[]
  distribution?: string
  params?: number[]
  x?: number
  degree?: number
  /** operation=formula：公式 id 或名称。 */
  formula?: string
  /** operation=formula：覆盖公式里的任意参数（架空世界改造用）。 */
  overrides?: { [key: string]: number | string | number[] }
  /** operation=formulas：按关键词检索。 */
  query?: string
  /** operation=formula：临时替换公式表达式（结构级改造）。 */
  customExpression?: string
  /** operation=ode：初值，如 {"S":999,"I":1,"R":0} */
  initial?: { [key: string]: number }
  /** operation=ode：积分起点（自变量）。 */
  from?: number
  /** operation=ode：积分终点。 */
  to?: number
  /** operation=ode：步数（越大越准）。 */
  steps?: number
  /** operation=ode：返回的采样点上限。 */
  samples?: number
  /** operation=world：世界参数（全部可选，默认地球）。 */
  world?: WorldParams
  /** operation=world 便捷参数。 */
  planetRadius?: number
  planetMass?: number
  rotationHours?: number
  obliquityDeg?: number
  /** operation=world：局部地形推演参数。给了就额外输出该地点的人文气候。 */
  terrain?: TerrainParams
  /** operation=constants：要改的物理常数（基础旋钮 → 新值）。派生量会自动重算。 */
  constants?: { [key: string]: number }
  /**
   * operation=workspace 的动作：
   * list / show / create / switch / delete / save / set / reset
   */
  action2?: string
  /** 工作区名（operation=workspace 用）。 */
  workspace?: string
  /** 工作区简介。 */
  description?: string
  /** 要保存的局部地点。 */
  terrainName?: string
  /** 工作区里要设的变量。 */
  workspaceVariables?: { [key: string]: number }
  /** operation=feasibility：待校验的设定（约束 id → 值）。 */
  claims?: { [constraintId: string]: number }
  /** operation=feasibility：只列出约束上限而不校验。 */
  listConstraints?: boolean
  /** 提示注入档位: off / brief / full（传了就切换并返回当前值）。 */
  promptMode?: string
  /** operation=formula-table 的动作: list / show / override / remove / add / disable / enable / reset */
  tableAction?: string
  /** 目标公式 id。 */
  formulaId?: string
  /** 新的表达式（结构级改造）。 */
  newExpression?: string
  /** 参数默认值覆盖。 */
  newParams?: { [key: string]: number | null }
  /** 自定义公式定义。 */
  customFormula?: {
    id: string
    name?: string
    category?: string
    expression: string
    params?: { [key: string]: { value?: number | null; desc?: string } }
    unit?: string
    description?: string
    keys?: string[]
  }
  /** operation=impact 的偏差阈值与列表长度。 */
  threshold?: number
  worstLimit?: number
  /** operation=workspace 清理/删除用的参数。 */
  variableName?: string
  constantName?: string
  emptyOnly?: boolean
  dryRun?: boolean
  olderThanDays?: number
  keep?: string[]
  tempPrefixes?: string[]
}

export interface Outcome {
  result: string
  value?: JsonValue
}

// ────────────────────────────────────────────────────────────────────────────
// 错误
// ────────────────────────────────────────────────────────────────────────────

export class CalcError extends Error {
  readonly type: string
  readonly hint?: string
  constructor(type: string, message: string, hint?: string) {
    super(message)
    this.name = 'CalcError'
    this.type = type
    this.hint = hint
  }
}

// ────────────────────────────────────────────────────────────────────────────
// mathjs 实例（BigNumber 模式 + 加固）
// ────────────────────────────────────────────────────────────────────────────

/**
 * BigNumber 模式实例与 Number 模式实例并存：
 * - `bignum` 负责精确算术（整数运算、大数、高精度小数）
 * - `fast` 负责本来就只能近似的部分（eigs、概率、回归），避免 BigNumber 拖慢
 *
 * 关闭 `import` / `createUnit`：这两个允许注入任意 JS 函数或改写单位表。
 * **不能**删 `typed` / `parse` / `evaluate` —— derivative、simplify 依赖它们。
 */
import { factorizeInt, makeNsolve, nullspaceOf, rankOf, singularValuesOf } from '../numeric.js'

export function buildMath(numberMode: 'BigNumber' | 'number', precision: number): any {
  const instance: any = create(all as any, {
    number: numberMode,
    precision,
    matrix: 'Matrix',
    randomSeed: '42',
  })
  // ── 注册扩展函数（纯 JS，不引入新依赖）──
  //
  // 注意：mathjs 的 create() 只认它自己的 factory 集合，普通函数必须走 import()。
  // 所以顺序是「先 import 扩展，再删除 import 方法」——安全边界不变：
  // 表达式求值时 import 已经不存在，用户无法往引擎里注入任意 JS。
  try {
    instance.import({
      rank: (matrix: any) => rankOf(matrix),
      nullspace: (matrix: any) => nullspaceOf(matrix),
      svd: (matrix: any) => singularValuesOf(matrix),
      singularvalues: (matrix: any) => singularValuesOf(matrix),
      factorize: (value: any) => factorizeInt(Number(value)),
      nsolve: makeNsolve((text: string) => instance.parse(text)),
    })
  } catch {
    /* 注册失败不影响核心运算 */
  }

  for (const key of ['import', 'createUnit']) {
    try {
      delete instance[key]
    } catch {
      /* 只读属性忽略 */
    }
  }
  return instance
}

/** 当前精度下的 BigNumber 引擎（精度可变，按需重建）。 */
let bignumCache: { precision: number; instance: any } | undefined

export function bignum(precision: number): any {
  if (!bignumCache || bignumCache.precision !== precision) {
    bignumCache = { precision, instance: buildMath('BigNumber', precision) }
  }
  return bignumCache.instance
}

/** 数值引擎（eigs/概率/回归用）。 */
let fastCache: any | undefined
export function fast(): any {
  if (!fastCache) fastCache = buildMath('number', 15)
  return fastCache
}

// ────────────────────────────────────────────────────────────────────────────
// 输入处理 / 数字格式化
// ────────────────────────────────────────────────────────────────────────────

export function normalizeSource(input: string): string {
  let output = ''
  let quote = ''
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quote !== '') {
      output += char
      if (char === quote && input[i - 1] !== '\\') quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      output += char
      continue
    }
    if (char === '\n' || char === '\r') {
      output += ';'
      continue
    }
    output += char
  }
  return output.replace(/;{2,}/g, ';').replace(/^;+|;+$/g, '').trim()
}

/** 数字修剪：去掉浮点噪声。 */
export function trimNumber(value: number, precision: number): string {
  if (!Number.isFinite(value)) return String(value)
  if (Number.isInteger(value)) return String(value)
  const significant = Math.min(Math.max(precision, 1), 15)
  return Number(value.toPrecision(significant)).toString()
}

/** 把数字安全地塞进 JsonValue（非有限值转字符串）。 */
export function safeNumberForJson(value: number): JsonValue {
  return Number.isFinite(value) ? value : String(value)
}
