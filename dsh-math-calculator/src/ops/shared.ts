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
/**
 * 单位数据表：中文单位归一化要用它派生出展开表。
 *
 * `units-data.ts` 是**纯数据模块**（不 import 任何本项目模块），
 * 所以这里引用它不会造成循环依赖 —— 这一点很关键，
 * 因为 `units.ts` 的逻辑层会 import 本模块。
 */
import { ALL_UNITS } from '../units-data.js'
import { BASE_UNIT } from '../units.js'

import type { JsonValue } from '../format.js'
import {
  PRECISION_LOSS_THRESHOLD,
  isDisplayPrecisionExplicit,
  reportPrecisionLoss,
} from '../precision-report.js'
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
  /**
   * **显示**精度：**小数点后几位**（与计算精度分开）。
   *
   * ## 为什么要分开
   *
   * `precision` 是**计算**精度：它决定 BigNumber 的有效位数，
   * 调低会真的把大数算错 —— 实测 `(10^20+1)-(10^20)`：
   *
   *   precision=64 → 1（正确）
   *   precision=20 → 0（算错了）
   *
   * 所以它不能为了让输出好看而调低。而 `displayPrecision` 只影响**写出来的位数**，
   * 计算仍然按 `precision`（默认 64）进行 —— 大数运算照样精确，只是显示得短些。
   *
   * ## 语义是「小数点后几位」，不是「有效数字」
   *
   * 这个区别很大：
   *   8 位小数   → 12345.678901234 得 12345.67890123
   *   8 位有效数字 → 同一个数得 12345.679（只剩 3 位小数）
   *
   * 说「保留 8 位」时想的是小数位，所以按小数位实现。
   *
   * ## 怎么用
   *
   * 一次设定即固化到当前工作区（后续调用自动沿用），也可每次覆盖：
   *   { operation:'workspace', action2:'set', displayPrecision:8 }  ← 固化
   *   { operation:'evaluate', expression:'1/7', displayPrecision:6 }  ← 临时
   *
   * 默认 8 位小数；工程核对可给 12—16；整数永远完整，不受此参数影响。
   */
  displayPrecision?: number
  /**
   * 批量表达式（operation=evaluate 的批量模式）。
   *
   * 一次算多条，省掉多次工具往返的开销。每条独立报错，
   * 不会因为一条失败就中断整批。
   *
   * 两种条目形态：
   *   - 字符串：`['1/7','2^0.5']`
   *   - 带标签对象：`[{label:'储耗比-中值', expr:'139e8/152e4'}]`
   *
   * ## 为什么要 label
   *
   * 实测反馈：同一批算两个口径时（`['139e8/1743500','139e8/152e4']` → 7972 / 9144），
   * 输出里**只有顺序号区分**，后续引用要回翻表达式原文 —— 报告里「一次差点引错」。
   * 单批十几条时，纯靠位置对齐的心智负担很大。
   *
   * 为什么值得：每次工具调用都有固定开销（往返 + 结果文本进入上下文），
   * 算 5 条就多付 5 次。批量把 5 次往返压成 1 次。
   */
  expressions?: Array<string | { label?: string; expr?: string }>
  /**
   * 精简输出（operation=evaluate 的批量模式）：只回「表达式 = 结果」。
   *
   * 去掉标题与「成功 N，失败 M」统计行。实测反馈：
   * 批量 8—14 条时这些固定行本身也是开销，报告估算全程 terse 可省 40%+ 输出 token。
   *
   * 失败信息**不省**：省掉会让调用方以为全成功了。
   */
  terse?: boolean
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
  /**
   * 工作区开关：命名变量是否参与计算（默认关闭）。
   *
   * 打开后，缓存键会把变量内容算进去（否则改了变量会命中旧缓存）；
   * 关闭时行为与未引入该功能时完全一致。
   */
  useWorkspaceVariables?: boolean
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
  /**
   * 列单位清单时展开哪一维（`"length"` / `"长度"` 等）。
   *
   * 单位表收到近三百条后，全量展开一次是一万七千多字符；
   * 默认只给各量纲的计数与样例，点名才展开。这与 help 的「用到时才读」一致。
   */
  unitScale?: string
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
  /**
   * 查天体**类型**（operation=bodies）。
   *
   * 与 bodyName 的区别：bodyName 查具名天体（火星、木卫二），
   * bodyType 查类型学条目（中子星、热木星、戴森球）——
   * 面向宇宙科幻创作，含理论预言与纯思辨类。
   */
  bodyType?: string
  /** 按证据等级筛类型：observed / theoretical / speculative。 */
  bodyEvidence?: string

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
export function buildMath(numberMode: 'BigNumber' | 'number' | 'Fraction', precision: number): any {
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

/** 有理数引擎缓存。 */
let rationalCache: any | undefined

/**
 * 取**有理数**引擎（Fraction 模式）。
 *
 * ## 为什么需要它
 *
 * 定积分要按 Newton-Leibniz 代入上下限。用 BigNumber 引擎会出这种事：
 *
 *     原函数 1/3·x³，在 x=3 处
 *     BigNumber → 8.99999999999999999999999999999999999999…
 *     Fraction  → 9
 *
 * 因为 BigNumber 的 `1/3` 是**截断的小数**，乘 27 后回不到整数。
 * 而 Fraction 保留精确分数，代入后能约分成整数 —— 结果 9 就是 9。
 *
 * 三角函数等无理性结果 Fraction 会退化成浮点，这是可接受的：
 * 那些结果本来就不是有理数。
 *
 * @returns mathjs 实例（Fraction 模式）
 */
export function rational(): any {
  if (!rationalCache) rationalCache = buildMath('Fraction', 64)
  return rationalCache
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
    /**
     * 数学记号归一化（**只在引号外做**）。
     *
     * 实测反馈：理工科用户的直觉写法直接报错，且报错类型还不一致：
     *   `2 × 3`  → unknown symbol ×
     *   `6 ÷ 2`  → unknown symbol ÷
     *   `π`      → unknown symbol π
     *   `ln(10)` → **internal**（Undefined function ln）
     *
     * 这些替换没有语义风险（× ÷ 在数学里就是乘除，π 就是圆周率），
     * 但必须跳过引号内 —— `5 cm to "inch"` 的单位名不能被改。
     */
    if (char === '×' || char === '·') {
      output += '*'
      continue
    }
    if (char === '÷') {
      output += '/'
      continue
    }
    // U+2212 减号，字形与 ASCII '-' 不同，肉眼难辨
    if (char === '\u2212') {
      output += '-'
      continue
    }
    if (char === 'π') {
      output += 'pi'
      continue
    }
    output += char
  }
  return output
    .replace(/;{2,}/g, ';')
    .replace(/^;+|;+$/g, '')
    .trim()
    // 幂运算：Python / JS 用户习惯写 `**`；mathjs 只认 `^`，而两者都是右结合，无歧义
    .replace(/\*\*/g, '^')
    // 自然对数别名：mathjs 的 `log` 本就是自然对数，但用户直觉会写 `ln`
    .replace(/\bln\s*\(/g, 'log(')
    .replace(/\bLN\s*\(/g, 'log(')
    // 面积别名：`km^2` / `km2` 在表达式里统一成 mathjs 认得的 `km^2`
    // （mathjs 的单位系统能解析 `km^2`，但不能解析裸的 `km2`）
    .replace(/(\d)\s*(m|cm|mm|km|dm|um)2(?![0-9a-zA-Z])/g, '$1 $2^2')
    .replace(/(\d)\s*(m|cm|mm|km|dm|um)\^2(?![0-9a-zA-Z])/g, '$1 $2^2')
    /**
     * 上标字符 → 幂运算。
     *
     * mathjs 的解析器**不认上标**：`5 m²` 报 `Syntax error in part "²"`。
     * 而 `m²` 恰恰是面积单位最自然的写法（`units` 模式里也用它当主名）。
     * 所以表达式里出现 ²/³ 时统一换成 `^2`/`^3`。
     */
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
}

/**
 * 正则元字符转义。
 *
 * @param text - 待转义的字符串
 * @returns 可安全嵌入正则的字符串
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 中文单位展开表（由 units 数据表派生，避免两处维护）。
 *
 * ## 为什么必须定义在 `normalizeChineseUnits` 之前
 *
 * 踩过：第一版把它写在文件末尾，而函数在文件中间。
 * `const` 有暂时性死区（TDZ）—— 函数**首次被调用时**常量还没初始化，
 * 抛 ReferenceError，被外层的 try/catch 吞掉，表现为「函数静默返回原文」。
 * 这个 bug 的隐蔽处在于：函数看着完全正确，测试却全不生效。
 */
const CHINESE_UNIT_EXPANSIONS: Array<{ name: string; dimension: string; factor: number; base: string }> =
  /**
   * ## 逐个别名判断，不按整个单位过滤
   *
   * 踩过两次，都是同一种错：
   *
   *   ① 按 `unit.name` 是否含中文来过滤 → `m` 的单位被整个排除，
   *      于是「米」「克」这些**中文别名**也用不上了（`2 斤 + 300 克` 报错）。
   *   ② 反过来收全部单位 → `m²` 被收进来，展开时把表达式里的 `m²`
   *      也替换掉，变成 `... * 1 * 1 m²` 这种嵌套垃圾，把式子弄坏。
   *
   * 正确做法：**只挑出名字本身是纯中文的那些**，逐个判断，与单位主名无关。
   *
   * ```
   *   m  → aliases 里的「米」      ✓ 收（纯中文）
   *   m² → name `m²` 含 m         ✗ 不收（英文/符号 mathjs 自己认得）
   *   里 → name「里」             ✓ 收
   * ```
   */
  ALL_UNITS.flatMap(function (unit) {
    const names = [unit.name, ...(unit.aliases ?? [])]
    return names
      .filter(function (n) {
        /**
         * ⚠️ 方括号不能省：`/\u4e00-\u9fff/`（无方括号）匹配的是
         * **字面字符串「一-鿿」**，不是字符范围 —— 它对任何单个汉字都返回 false。
         *
         * 这个坑很隐蔽：正则语法合法、编译通过、运行不报错，只是永远匹配不到，
         * 表现为「派生表为空、函数静默不生效」。排查时我一度怀疑循环依赖或 TDZ，
         * 实际只是一对缺失的方括号。
         */
        if (!/[\u4e00-\u9fff]/.test(n)) return false
        /** 纯中文：不能含 ASCII 字母数字（否则是 `m²` 这类符号名）。 */
        return !/[A-Za-z0-9]/.test(n)
      })
      .map(function (n) {
        /**
         * 基准单位要转成 mathjs 认得的写法。
         *
         * `BASE_UNIT` 用人类可读的 `m²` / `m³`，但 mathjs 解析器**不认上标字符**
         * （它会报 `Syntax error in part "²"`）。所以改成 `m^2` / `m^3`。
         */
        const base = BASE_UNIT[unit.dimension].replace(/²/g, '^2').replace(/³/g, '^3')
        return { name: n, dimension: unit.dimension, factor: unit.factor, base }
      })
  })

/**
 * 中文单位 → mathjs 单位表达式的归一化。
 *
 * ## 为什么要这一步
 *
 * 实测反馈（2026-11-06）：
 *
 * ```
 *   3 km + 500 m   → 3.5 km       ✓
 *   1 里 + 3 米    → Syntax error ✗
 *   5 亩 + 100 m²  → Syntax error ✗
 * ```
 *
 * **英文/符号单位可在表达式内混算，中文单位不行** —— 而 `units` 模式里
 * 「里」「亩」都是支持的。两条路径的单位表没打通。
 *
 * ## 为什么不用 mathjs 的 createUnit 注册中文单位
 *
 * 因为 `buildMath` 里**刻意删掉了 createUnit**：那是安全边界的一部分
 * （表达式求值时不允许往引擎里注入任意定义）。为了中文单位把这个边界放开，
 * 代价远大于收益。
 *
 * ## 所以走文本替换：把「数值 + 中文单位」换成「数值 * 系数 基准单位」
 *
 * 这是纯文本变换，不碰引擎能力边界。规则：
 *   · 只替换 `数字 + 可选空格 + 中文单位` 这种**明确带数值**的形态
 *   · 替换后乘上该单位的 factor（数值直接内联，避免再算一次）
 *   · 单位后必须不是中文/字母（否则是更长词的一部分，如「公里」不是「里」）
 *
 * ```
 *   1 里 + 3 米  →  1 * 500 m + 3 * 1 m   →  mathjs 得 503 m
 *   5 亩 + 100 m² →  5 * 666.6666666666666 m^2 + 100 m^2  →  3433.33 m²
 * ```
 *
 * 例外：温度单位是**仿射**的（不能乘），所以不在此处替换 ——
 * 带温度的表达式请走 `operation:"units"`。
 *
 * @param source - 已做过基础归一化的表达式
 * @returns 中文单位已展开的表达式
 */
export function normalizeChineseUnits(source: string): string {
  if (typeof source !== 'string' || source === '') return source
  let output = source
  /**
   * 长单位名优先：否则「公里」会先匹配成「里」，
   * 把 `3 公里` 换成 `3 * 500 m`（错了 2 倍）。
   */
  const ordered = CHINESE_UNIT_EXPANSIONS.slice().sort(function (a, b) {
    return b.name.length - a.name.length
  })
  for (const entry of ordered) {
    if (entry.dimension === 'temperature') continue
    /**
     * 匹配「数字 + 空格? + 单位」，且单位后面不能紧跟中文或字母数字，
     * 避免命中更长词的一部分。
     */
    const pattern = new RegExp(
      '([0-9][0-9,.]*(?:e[+-]?[0-9]+)?)\\s*' + escapeRegExp(entry.name) + '(?![0-9A-Za-z\u4e00-\u9fff])(?![\u4e00-\u9fff])',
      'gi',
    )
    output = output.replace(pattern, function (_match, numeric: string) {
      return numeric.replace(/,/g, '') + ' * ' + entry.factor + ' ' + entry.base
    })
  }
  return output
}

/**
 * 当前显示精度（模块级，每次工具调用开头设置一次）。
 *
 * 为什么用模块级变量而不是逐层传参：`trimNumber` 有四十多个调用点，
 * 分散在 solve / matrix / stats / eigen / roots 各处。逐个加参数会让函数签名
 * 全都变形，而且容易漏。而显示精度是**一次调用内全局一致**的，
 * 正好适合「入口设一次，各层读取」。
 *
 * 并发风险：若宿主并行调用本工具，两条调用会互相覆盖。
 * 实测宿主是串行调用（tool_call 逐个执行），且这个值只影响显示不影响计算 ——
 * 即使竞争，最坏结果是某次输出位数不对，不会算错数。
 */
let activeDisplayPrecision: number | undefined

/**
 * 设置本次调用的显示精度（在工具入口调用）。
 *
 * @param value - 显示有效位数；undefined = 不截断
 */
export function setActiveDisplayPrecision(value: number | undefined): void {
  activeDisplayPrecision = value
}

/**
 * 取当前显示精度。
 *
 * @returns 显示有效位数；未设置返回 undefined
 */
export function currentDisplayPrecision(): number | undefined {
  return activeDisplayPrecision
}

/**
 * 数字修剪：去掉浮点噪声，按**小数点后几位**保留。
 *
 * 语义与 `formatValue` 的 `displayPrecision` 保持一致：**小数位**，不是有效数字。
 *
 * 为什么统一成小数位：说「保留 8 位」时想的是小数位。
 * 有效数字语义下 `12345.678901234` 只给 3 位小数（12345.679），与直觉不符。
 *
 * @param value - 数值
 * @param precision - 计算精度（未设显示精度时作为退路）
 * @param displayPrecision - **小数点后保留几位**；省略则用模块级当前值
 * @returns 显示串
 */
export function trimNumber(
  value: number,
  precision: number,
  displayPrecision?: number,
): string {
  if (!Number.isFinite(value)) return String(value)
  // 整数一律完整输出：`n = 8`、`10^20+5` 都不该被截断
  if (Number.isInteger(value)) return String(value)
  const effective = displayPrecision !== undefined ? displayPrecision : activeDisplayPrecision
  const decimals = effective !== undefined && Number.isFinite(effective)
    ? Math.max(0, Math.min(15, Math.round(effective)))
    : Math.min(Math.max(precision, 1), 15)
  const abs = Math.abs(value)
  // 极小值：会被四舍五入成 0 时必须用科学计数法（否则非零值显示成 0，是数据丢失）
  if (abs !== 0 && abs < Math.pow(10, -decimals)) {
    reportPrecisionLoss(1)
    return value.toExponential(Math.min(Math.max(decimals, 6), 12))
  }
  const fixed = value.toFixed(decimals)
  // 用文本去掉尾随 0（不要 `Number()` 再 `String()`，否则 0.00000081 会变 "8.1e-7"）
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
  const text = trimmed === '-0' ? '0' : trimmed
  const shown = Number(text)
  const rel = abs > 0 && Number.isFinite(shown) ? Math.abs(shown - value) / abs : 0
  /**
   * 与 `formatValue` 同一条判据：定点截断丢精度超过阈值就改用科学计数法。
   *
   * 两处必须一致 —— 否则 `evaluate` 与 `stats`/`solve` 会给同一个小数值
   * 不同的显示形式，那比一个地方错更让人困惑。
   */
  if (rel > PRECISION_LOSS_THRESHOLD) {
    reportPrecisionLoss(rel)
    // 与 formatValue 一致：显式指定时尊重调用方的位数选择，不擅自改格式
    if (!isDisplayPrecisionExplicit()) {
      return value.toExponential(Math.min(Math.max(decimals, 6), 12))
    }
  }
  return text
}

/** 把数字安全地塞进 JsonValue（非有限值转字符串）。 */
export function safeNumberForJson(value: number): JsonValue {
  return Number.isFinite(value) ? value : String(value)
}
