/**
 * 工具入口：schema、execute、结果渲染。
 *
 * ## 与老 index.ts 的关系
 *
 * 老入口把「schema + 分发 + 6,000 行实现」混在一个文件里。这里只留入口该有的东西：
 * ```
 *   schema     参数与输出的完整声明（输出必须 additionalProperties:false）
 *   execute    设作用域 → 新实现优先 → 未迁移的交老入口 → 错误统一翻译
 *   render     result 是数据通道，notice 只在渲染时附上
 * ```
 *
 * 新实现由 `dispatch.ts` 提供；老入口以依赖注入的方式传进来，避免循环依赖。
 *
 * @module dsh-math-calculator/tool
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { TOOL_DESCRIPTION } from './awareness.js'
import { dispatchNew } from './dispatch.js'
import { toJsonValue } from './core/format.js'

/** JSON 值（与老入口的 MathResult.value 同构）。 */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
/** 错误形状（老入口的 CalcError 与新入口的 CalcError 字段一致，只是 type 的联合范围不同）。 */
type TranslatedError = { type: string; message: string; hint?: string }

/** 与老 MathResult 对齐。 */
export interface MathResult {
  ok: boolean
  operation: string
  input: string
  result: string
  precision: number
  value?: JsonValue
  variables?: { [key: string]: JsonValue }
  error?: { type: string; message: string; hint?: string }
  cached?: boolean
  notice?: string
  partial?: boolean
  failed?: number
  succeeded?: number
}

/** 老入口与错误翻译由 index.ts 注入。 */
type LegacyRunner = (args: unknown) => MathResult
type ErrorTranslator = (error: unknown, fallbackType?: string, source?: string) => TranslatedError
let legacyRunner: LegacyRunner | null = null
let errorTranslator: ErrorTranslator | null = null
let toolContext: unknown = null

/**
 * 绑定老入口（index.ts 在模块级调用一次）。
 *
 * @param run - 老 runMathTool
 * @param translate - 老 translateError
 */
export function bindLegacy(run: LegacyRunner, translate: ErrorTranslator): void {
  legacyRunner = run
  errorTranslator = translate
}

/** 保存插件上下文（apply 时调）。 */
export function setToolContext(ctx: unknown): void {
  toolContext = ctx
}

/** 输出 schema（必须完整声明，否则宿主校验会拒绝）。 */
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
    notice: { type: 'string', description: '附加提示（渲染时展示，不进 result）' },
    cached: { type: 'boolean', description: '是否命中缓存' },
    partial: { type: 'boolean', description: '批量部分成功' },
    failed: { type: 'integer', description: '批量失败条数' },
    succeeded: { type: 'integer', description: '批量成功条数' },
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

/** 渲染。 */
function renderResult(value: unknown): Array<{ type: 'text'; text: string }> {
  const payload = (value ?? {}) as MathResult
  if (payload.ok === false) {
    const type = payload.error?.type ?? 'error'
    const message = payload.error?.message ?? '未知错误'
    const hint = payload.error?.hint
    return [{ type: 'text', text: hint ? '错误[' + type + ']: ' + message + '\n提示: ' + hint : '错误[' + type + ']: ' + message }]
  }
  const result = typeof payload.result === 'string' ? payload.result : String(payload.result ?? '')
  const notice = typeof payload.notice === 'string' && payload.notice !== '' ? payload.notice : ''
  return [{ type: 'text', text: notice ? result + '\n\n（' + notice + '）' : result }]
}

/**
 * 输入参数规范。
 *
 * ## 为什么不是逐字照抄老版 6,000 字符
 *
 * 老版的长度主要花在长描述上（每段都在讲「为什么」）。schema 每轮都要付 token，
 * 而参数的可发现性靠**名字与类型**，不靠段落。这里保留全部参数名与关键示例，
 * 把解释压到一行；详细用法在 `help` 里。
 */
const PARAMETER_SPEC = {
  expression: { type: 'string', description: '表达式/方程/数据。例：10^20+5、x^3*sin(x)、[[1,2],[3,4]]' },
  expressions: { type: 'array', items: { type: 'json', description: '字符串或 {label?, expr, sanity?}' }, description: '批量求值，逐条独立报错' },
  terse: { type: 'boolean', description: '只回「表达式 = 结果」' },
  variables: { type: 'object', additionalProperties: true, description: '变量字典，如 {"m":500}' },
  operation: { type: 'string', description: '默认 auto。简易算式 evaluate；数据 stats；改设定 world/derivation；不确定调 help' },
  variable: { type: 'string', description: '求导/求根/积分的自变量，默认 x' },
  precision: { type: 'integer', description: '计算精度（默认 64，不要为好看调低）' },
  displayPrecision: { type: 'integer', description: '小数点后显示位数（默认 8）' },
  matrix: { type: 'json', description: '矩阵（二维数组）' },
  vector: { type: 'json', description: '向量' },
  data: { type: 'array', items: { type: 'number' }, description: '数据序列' },
  dataY: { type: 'array', items: { type: 'number' }, description: '第二条数据序列' },
  distribution: { type: 'string', description: '分布名（normal/binomial/poisson/exponential/chisquare/t）' },
  params: { type: 'object', additionalProperties: true, description: '分布参数' },
  x: { type: 'number', description: '分布求值点' },
  degree: { type: 'integer', description: '回归阶数 / 根' },
  formula: { type: 'string', description: '公式 id 或名称' },
  formulas: { type: 'array', items: { type: 'json', description: '"kleiber" 或 {formula,overrides?,label?}' }, description: '批量调公式' },
  overrides: { type: 'object', additionalProperties: true, description: '覆盖公式参数' },
  query: { type: 'string', description: '检索词；"sys" 看体系链' },
  customExpression: { type: 'string', description: '自定义公式表达式' },
  recurrence: { type: 'string', description: '递推式，如 "P*2"' },
  periods: { type: 'integer', description: '递推期数（默认 12，上限 5000）' },
  initial: { type: 'json', description: '初值' },
  from: { type: 'number', description: '定积分下界 / 区间起点' },
  to: { type: 'number', description: '定积分上界 / 区间终点' },
  steps: { type: 'integer', description: '步数' },
  samples: { type: 'integer', description: '采样点数' },
  at: { type: 'array', items: { type: 'number' }, description: 'ODE 精确输出时点' },
  world: { type: 'object', additionalProperties: true, description: '世界参数（planetMass/orbitAU/...）' },
  planetRadius: { type: 'number', description: '行星半径（地球=1）' },
  planetMass: { type: 'number', description: '行星质量（地球=1）' },
  rotationHours: { type: 'number', description: '自转周期（小时）' },
  obliquityDeg: { type: 'number', description: '轴倾角（度）' },
  terrain: { type: 'object', additionalProperties: true, description: '地形参数（kind/elevation/distanceToSea/...）' },
  constants: { type: 'object', additionalProperties: true, description: '常数覆盖（c/G/alpha_fs/...）' },
  helpTopic: { type: 'string', description: 'help 节名' },
  derivation: { type: 'string', description: '推演子命令（29 个）' },
  layer: { type: 'string', description: '接口卡层（P1—P5）' },
  claims: { type: 'json', description: 'feasibility 用对象 {约束id:值}；units_audit 用数组 [{name,unit}]' },
  listConstraints: { type: 'boolean', description: '只列物理上限' },
  unitValue: { type: 'number', description: '换算数值' },
  unitFrom: { type: 'string', description: '源单位' },
  unitTo: { type: 'string', description: '目标单位' },
  customUnits: { type: 'array', items: { type: 'json' }, description: '自定义单位 {name,dimension,factor}' },
  unitScales: { type: 'object', additionalProperties: true, description: '单位缩放（derive units 子命令）' },
  bodyName: { type: 'string', description: '天体 id 或中文名' },
  bodyKind: { type: 'string', description: '天体类别' },
  bodyType: { type: 'string', description: '天体类型' },
  bodyEvidence: { type: 'string', description: '证据等级' },
  bodyConstant: { type: 'string', description: '改哪个常数看天体传导' },
  bodyFactor: { type: 'number', description: '常数倍数' },
  quickFeasible: { type: 'object', additionalProperties: true, description: '一句话可行性 {claim,world?}' },
  hierarchy: { type: 'object', additionalProperties: true, description: '编制树 {levels,tree,base|total} 或 {nodes}' },
  world_state: { type: 'object', additionalProperties: true, description: '设定库 {action,entries?,id?,query?}' },
  chain: { type: 'object', additionalProperties: true, description: '链条传导 {stages,raw}' },
  threshold: { type: 'object', additionalProperties: true, description: '阈值判断 {value,thresholds}' },
  scaling: { type: 'object', additionalProperties: true, description: '缩放判定 {law,from,to}' },
  anchor: { type: 'object', additionalProperties: true, description: '基准锚定 {anchor,anchors}' },
  text: { type: 'string', description: 'extract_numbers / units_audit 的正文' },
  keepNoise: { type: 'boolean', description: '保留噪音行' },
  limit: { type: 'integer', description: '最多抽多少条' },
  events: { type: 'array', items: { type: 'json' }, description: 'timeline_check 事件' },
  maxSpan: { type: 'number', description: 'timeline_check 最大跨度（年）' },
  overlapAllowed: { type: 'boolean', description: '允许时间线重叠' },
  anchorValue: { type: 'number', description: 'backSolve 目标值' },
  compareFrom: { type: 'string', description: 'compare 起始版本' },
  compareTo: { type: 'string', description: 'compare 目标版本' },
  diffA: { type: 'string', description: 'diff 版本 A' },
  diffB: { type: 'string', description: 'diff 版本 B' },
  fantasyAbility: { type: 'object', additionalProperties: true, description: '幻想能力定义' },
  fantasyDemand: { type: 'number', description: '幻想需求值' },
  fantasyPhysical: { type: 'number', description: '纯物理提供量' },
  fantasyBodyArea: { type: 'number', description: '施术者体表面积' },
  lyapunov: { type: 'number', description: 'Lyapunov 指数' },
  observerKind: { type: 'string', description: '观测者类型' },
  timelineFrom: { type: 'number', description: '时间轴起点 Gyr' },
  timelineTo: { type: 'number', description: '时间轴终点 Gyr' },
  timelineSteps: { type: 'integer', description: '时间轴采样数' },
  whitepaperMode: { type: 'string', description: 'whitepaper | prompt' },
  traceTarget: { type: 'string', description: '溯源/影响面目标' },
  costKind: { type: 'string', description: 'timeline | phase | backsolve | sweep' },
  costX: { type: 'number', description: '相图 X 步数' },
  costY: { type: 'number', description: '相图 Y 步数' },
  costIterations: { type: 'integer', description: '逆推迭代数' },
  costCombos: { type: 'integer', description: '扫描组合数' },
  costWithPipeline: { type: 'boolean', description: '时间轴是否跑推演栈' },
  inheritDerived: { type: 'string', description: '衍生表名' },
  inheritBase: { type: 'string', description: '基线表名' },
  inheritCheck: { type: 'boolean', description: '校验继承关系' },
  inheritSync: { type: 'boolean', description: '列出受影响的表' },
  tableNames: { type: 'array', items: { type: 'string' }, description: '已存在的表名' },
  workspace: { type: 'string', description: '工作区名' },
  note: { type: 'string', description: '归档备注' },
  flipClaim: { type: 'string', description: '翻转判据 id' },
  flipEpsilon: { type: 'number', description: '扰动幅度' },
  flipBase: { type: 'number', description: '扰动基线' },
} as const

/** 插件名。 */
const PLUGIN_NAME = 'dsh-math-calculator'

/** 工具名。 */
export const TOOL_NAME = 'math_execute'

/**
 * 数学执行工具。
 *
 * ## execute 的顺序
 *
 * 1. 解析 operation（缺省 auto）；
 * 2. 具名 operation 且已迁移 → 走新实现；
 * 3. 其它（含 auto）→ 老入口；
 * 4. 任何异常都翻译成结构化错误（不吞）。
 */
export const mathExecuteTool = defineTool({
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  parameters: PARAMETER_SPEC,
  output: { schema: OUTPUT_SCHEMA, render: (_args: unknown, value: unknown) => renderResult(value) },
  execute: async (args: Record<string, unknown>, _exec: unknown) => {
    const operation = typeof args['operation'] === 'string' ? args['operation'].trim() : 'auto'
    try {
      if (operation !== 'auto') {
        const migrated = dispatchNew(operation, args)
        if (migrated !== null) {
          return {
            ok: true,
            operation,
            input: typeof args['expression'] === 'string' ? (args['expression'] as string) : '',
            result: migrated.result,
            precision: typeof args['precision'] === 'number' ? (args['precision'] as number) : 64,
            value: toJsonValue(migrated.value) as JsonValue,
            ...(migrated.notice !== undefined ? { notice: migrated.notice } : {}),
          } satisfies MathResult
        }
      }
      if (legacyRunner === null) {
        throw new Error(PLUGIN_NAME + ': 老入口未绑定（bindLegacy 未调用）')
      }
      return legacyRunner(args)
    } catch (error) {
      /**
       * ## 先认新入口的 CalcError
       *
       * 新实现的错误自带 `type`（ErrorType 联合）与 `hint`，直接透传即可。
       * 交给老 translateError 会被它当成未知异常、回落成 internal——
       * 那会让「缺参数」看起来像工具 bug（反馈包 T7-N8 报过的正是这一类）。
       * 只有不带 type 的异常（库抛的、内部 bug）才交老翻译器。
       */
      const typed = error !== null && typeof error === 'object' && typeof (error as { type?: unknown }).type === 'string'
      const direct = typed
        ? {
            type: (error as { type: string }).type,
            message: error instanceof Error ? error.message : String(error),
            ...(typeof (error as { hint?: unknown }).hint === 'string' ? { hint: (error as { hint: string }).hint } : {}),
          }
        : null
      const translated = direct ?? (errorTranslator !== null ? errorTranslator(error, 'internal', typeof args['expression'] === 'string' ? (args['expression'] as string) : '') : null)
      const type = translated?.type ?? 'internal'
      const message = translated?.message ?? (error instanceof Error ? error.message : String(error))
      const hint = translated?.hint
      return {
        ok: false,
        operation,
        input: typeof args['expression'] === 'string' ? (args['expression'] as string) : '',
        result: '错误[' + type + ']: ' + message,
        precision: typeof args['precision'] === 'number' ? (args['precision'] as number) : 64,
        error: { type, message, ...(hint !== undefined ? { hint } : {}) },
      } satisfies MathResult
    } finally {
      void toolContext
    }
  },
})
