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
  *
 * @module dsh-math-calculator/ops/shared
*/

import { create, all } from 'mathjs'

import type { JsonValue } from '../format.js'
import type { TerrainParams } from '../terrain.js'
import type { WorldParams } from '../world.js'

// ────────────────────────────────────────────────────────────────────────────
// 类型
// ────────────────────────────────────────────────────────────────────────────

/**
 * 工具支持的全部 operation。
 *
 * ⚠️ 这是**对外契约**：schema 的 enum、help 清单、integration 测试的
 * "27 个 operation" 断言都直接依赖它。新增 operation 必须同步改三处，
 * 否则模型看得到名字却调不通，或测试直接变红。
 */
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
  | 'derivation'
  | 'custom'
  | 'units'
  | 'balance'
  | 'bodies'
  | 'help'

/**
 * 所有 operation 共用的参数对象。
 *
 * 不同 operation 只读取自己关心的字段，其余忽略；所以字段注释必须标明归属
 * （例如 "operation=formula：…"），否则调用方不知道该在什么时候传。
 */
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
  /**
   * 工作区名的别名（operation=workspace 的 create/switch 也认这个）。
   *
   * 为什么保留两个名字：schema 里早已暴露 name 给调用方，
   * 模型常按直觉写 name 而不是 workspace。两者等价，谁给谁算。
   */
  name?: string
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

  // ── operation=derivation（推演栈框架）──
  /** 子命令：stack / cards / dimensionless / units / sensitivity / phase / checklist / tables */
  derivation?: string
  /** 只看某一层的接口卡（P1—P5）。 */
  layer?: string
  /** 单位缩放因子，检测「单位重定义陷阱」，如 { mass: 2 }。 */
  unitScales?: Record<string, number>
  /** 敏感性分析的基线值。 */
  sensitivityBase?: number
  /** 敏感性分析的幂次（结果 = 输入^幂）。 */
  sensitivityExponent?: number

  // ── operation=custom（自创常数 / 新物理量）──
  /** 子命令：list / add / remove / check */
  customAction?: string
  /** 要定义的自创量（origin / dimension 必填）。 */
  customConstant?: Record<string, unknown>
  /** 要删除的自创量名。 */
  customConstantName?: string
  /** 量纲检查时期望的结果量纲。 */
  expectedDimension?: Record<string, number>

  // ── operation=derivation 的「结论翻转」判定 ──
  /**
   * 判据 id（derivation="flip" 用）。
   *
   * 与 sensitivity 的区别：sensitivity 问「数值变了多少」，
   * flip 问「**能不能**变了没有」——数值变 1.8% 也可能让结论颠倒。
   *
   * 可用：rocket（化学火箭能飞出）/ human（人能站立）/
   * flight（生物能飞）/ escape_keeps_atmosphere（能留住大气）。
   */
  flipClaim?: string
  /** 扰动幅度（默认 0.2 = ±20%）。 */
  flipEpsilon?: number
  /** 输入倍率（相对地球基线，默认 1）。 */
  flipBase?: number

  // ── operation=units（单位换算）──
  /**
   * 要换算的数值。
   *
   * 不给 `unitFrom`/`unitTo` 时，`units` 只列出全部可用单位。
   */
  unitValue?: number
  /** 源单位，如「里」「丈」「斤」。 */
  unitFrom?: string
  /** 目标单位，如「km」「m」。 */
  unitTo?: string
  /**
   * 项目自定义单位（可覆盖内置）。
   *
   * 每项 `{ name, dimension, factor, aliases? }`，`factor` 是换到该量纲基准单位的系数。
   * 例如把「里」定义成 576 m：`{name:'里', dimension:'length', factor:576}`。
   */
  customUnits?: Array<{
    name: string
    dimension: string
    factor: number
    aliases?: string[]
    note?: string
  }>

  // ── operation=balance（收支盘点与最短板）──
  /**
   * 收支项：键名 → `{ demand, supply, unit? }`。
   *
   * 内置键名：grain / water / energy / land / fiscal / army / info，
   * 也可自定键名。demand 是需求方，supply 是能提供多少。
   * 最短板 K = min(supply/demand)。
   */
  balance?: Record<string, { demand: number; supply: number; unit?: string }>

  // ── operation=bodies（天体目录与常数传导）──
  /** 查单个天体：id（mars）或中文名（火星）。 */
  bodyName?: string
  /** 按类别筛：star / planet-terrestrial / moon / dwarf-planet … */
  bodyKind?: string
  /**
   * 改常数后看天体数据哪些该重算。
   *
   * 例：`bodyConstant:"alpha_fs", bodyFactor:2` 表示 α 变成两倍，
   * 输出会分成「必须重算的量」与「绝不该动的量」两块——
   * 后者尤其重要：行星质量、半径、轨道与 α 无关，改了就是篡改设定。
   */
  bodyConstant?: string
  /** 常数变化倍数（默认 2）。 */
  bodyFactor?: number

  // ── operation=derivation 的逆推与档案 ──
  /** 叙事锚点 id（如 creatureHeight）。 */
  anchor?: string
  /** 锚点想要的值（如 50 米）。 */
  anchorValue?: number
  /** 版本对比的起始版本（如 v1）。 */
  compareFrom?: string
  /** 版本对比的目标版本（省略则取最新）。 */
  compareTo?: string

  // ── operation=derivation 的幻想层（叠加式）──
  /** 幻想能力定义（必须含 source / efficiency / costPerUnit / powerLimit）。 */
  fantasyAbility?: Record<string, unknown>
  /** 想达到的能力总量。 */
  fantasyDemand?: number
  /** 纯物理能提供多少（基底）。 */
  fantasyPhysical?: number
  /** 施术者体表面积（m²），用于散热核算。 */
  fantasyBodyArea?: number

  // ── 混沌拦截 / 继承 / A/B 对比 ──
  /** Lyapunov 指数（>0 判为混沌）。 */
  lyapunov?: number
  /** 衍生表名。 */
  inheritDerived?: string
  /** 基线表名。 */
  inheritBase?: string
  /** 是否执行继承同步。 */
  inheritSync?: boolean
  /** A/B 对比的 A 表。 */
  diffA?: string
  /** A/B 对比的 B 表。 */
  diffB?: string

  /** 观测者类型：human / tiny / giant / aquatic / aerial / 2d。 */
  observerKind?: string

  /** 依赖图只画这些层（层号数组，界面按层折叠时传）。 */
  graphDepths?: number[]

  // ── 时间轴（补丁1/11）──
  /** 时间轴起点（Gyr）。 */
  timelineFrom?: number
  /** 时间轴终点（Gyr）。 */
  timelineTo?: number
  /** 采样点数。 */
  timelineSteps?: number

  /** 白皮书模式：document（默认，给人读）/ prompt（给 AI 用）。 */
  whitepaperMode?: string

  // ── 因果溯源（补丁4）──
  /** 要溯源的量名。 */
  traceTarget?: string
  // ── 算力预警（补丁5）──
  /** 估算类型：timeline / phase / backsolve / sweep。 */
  costKind?: string
  /** 相图 X 采样数。 */
  costX?: number
  /** 相图 Y 采样数。 */
  costY?: number
  /** 迭代次数。 */
  costIterations?: number
  /** 组合数。 */
  costCombos?: number
  /** 时间轴是否每步跑推演栈。 */
  costWithPipeline?: boolean
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

/**
 * 一次操作的结果。
 *
 *   result —— 给人和模型读的文本：含单位、提示、错误说明，必须能独立复述结论
 *   value  —— 给程序/UI 用的结构化数据，必须 JSON 安全（不能有 BigNumber/undefined）
 *
 * 两者内容保持一致；只给 value 会让模型无从解释，只给 result 会让 UI 无法渲染。
 */
export interface Outcome {
  result: string
  value?: JsonValue
}

// ────────────────────────────────────────────────────────────────────────────
// 错误
// ────────────────────────────────────────────────────────────────────────────

/**
 * 计算器内部错误。
 *
 * type 供调用方程序判断（invalid_argument / no_solution / unsupported / forbidden …），
 * message 给人看，hint 给**修复方向**。
 *
 * 约定：不要抛裸 Error —— 裸 Error 会丢掉 type 与 hint，模型就只能看到一句
 * 无法行动的话（这是踩过的坑）。
 */
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

/**
 * 创建一个 mathjs 实例。
 *
 * 三个关键设置：
 *   · matrix: 'Matrix' —— 矩阵函数返回 mathjs Matrix（eigs/lusolve 依赖这个形状）
 *   · randomSeed 固定 —— 概率分布/蒙特卡洛可复现（确定性是硬要求）
 *   · number/precision —— BigNumber 模式做精确算术
 *
 * 安全：删除 import / createUnit，防止表达式注入任意 JS 或改写单位表。
 * **不能**删 typed/parse/evaluate —— derivative/simplify 依赖它们。
 * 自定义函数（rank/nsolve…）在删除 import **之前**注册，顺序不能反。
 */
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

/**
 * 取 BigNumber 引擎（按 precision 缓存）。
 *
 * 缓存原因：mathjs 实例创建成本高，而 precision 在单次调用内不变。
 * 精度变化必须重建，否则旧配置会污染新结果。
 */
export function bignum(precision: number): any {
  if (!bignumCache || bignumCache.precision !== precision) {
    bignumCache = { precision, instance: buildMath('BigNumber', precision) }
  }
  return bignumCache.instance
}

/** 数值引擎（eigs/概率/回归用）。 */
let fastCache: any | undefined
/**
 * 取数值引擎（固定 15 位有效数字）。
 *
 * 用于本来就只能近似的部分：eigs、概率、回归、ODE —— 迭代算法本身是浮点的，
 * 用 BigNumber 只会更慢且没有意义。
 */
export function fast(): any {
  if (!fastCache) fastCache = buildMath('number', 15)
  return fastCache
}

// ────────────────────────────────────────────────────────────────────────────
// 输入处理 / 数字格式化
// ────────────────────────────────────────────────────────────────────────────

/**
 * 规范化输入：换行转语句分隔符、去多余分号、引号内原样保留。
 *
 * 为什么需要：模型常把多行表达式或带引号的字符串直接传来，
 * 换行会被 mathjs 当成语句结束而报错。
 */
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
