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
import { dispatchNew, MIGRATED_OPERATIONS } from './dispatch.js'
import { toJsonValue } from './core/format.js'
import { tryUnitPipeline } from './core/unit-pipeline.js'
import { entryFromResult, writeRunLog } from './core/run-log.js'
import { putRecord } from './features/data-store/store.js'

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
  /** 常见别名（反馈报告：equation/equations/expr/y0/stages/raw/levels/area 都有人猜）。 */
  equation: { type: 'string', description: 'solve 的别名（等同 expression，写等式）' },
  equations: { type: 'array', items: { type: 'string' }, description: 'solve 的别名：多个方程' },
  expr: { type: 'string', description: 'solve 的别名（等同 expression）' },
  y0: { type: 'number', description: 'ode 的别名：单状态初值（等同 initial:{y:…}）' },
  stages: { type: 'array', items: { type: 'json' }, description: 'chain 的别名：段列表（等同 chain.stages）' },
  raw: { type: 'number', description: 'chain 的别名：起始值（等同 chain.raw）' },
  levels: { type: 'integer', description: 'topology structure 的别名：层数（等同 building.floors）' },
  area: { type: 'number', description: 'topology structure 的别名：单层面积 m²（等同 building.footprintM2）' },
  kind: { type: 'string', description: 'topology structure 的别名：building / vehicle' },
  massKg: { type: 'number', description: 'topology structure 的别名：载具满载质量 kg' },
  speedKph: { type: 'number', description: 'topology structure 的别名：载具巡航速度 km/h' },
  energyJ: { type: 'number', description: 'topology structure 的别名：载具可用能量 J' },
  energyPerKmJ: { type: 'number', description: 'topology structure 的别名：单位距离能耗 J/km' },
  expressions: { type: 'array', items: { type: 'json', description: '字符串或 {label?, expr, sanity?}' }, description: '批量求值，逐条独立报错' },
  terse: { type: 'boolean', description: '只回「表达式 = 结果」' },
  variables: { type: 'object', additionalProperties: true, description: '变量字典，如 {"m":500}' },
  operation: {
    type: 'string',
    /**
     * enum 让调用方一眼看到有哪些 operation（不用先查 help）。
     * 与 dispatch 的 MIGRATED_OPERATIONS 同源，避免两处清单漂移。
     */
    enum: [...new Set([...MIGRATED_OPERATIONS, 'auto'])],
    description: '默认 auto。三类门面最省心：calc（数值/公式，配 op）、derive（推演/对账，配 op）、manage（help/workspace，配 op）；也可直接用具体 op 名',
  },
  op: { type: 'string', description: '门面子命令：calc→evaluate/solve/…；derive→world/derivation/…；manage→help/workspace/…' },
  variable: { type: 'string', description: '求导/求根/积分的自变量，默认 x' },
  precision: { type: 'integer', description: '计算精度（默认 64，不要为好看调低）' },
  displayPrecision: { type: 'integer', description: '小数点后显示位数（默认 8）' },
  matrix: { type: 'json', description: '矩阵（二维数组）' },
  vector: { type: 'json', description: '向量' },
  data: { type: 'array', items: { type: 'number' }, description: '数据序列' },
  dataY: { type: 'array', items: { type: 'number' }, description: '第二条数据序列' },
  distribution: { type: 'string', description: '分布名（normal/binomial/poisson/exponential/chisquare/t）' },
  params: { type: 'json', description: '分布参数：数组 [均值,标准差] 或对象' },
  x: { type: 'number', description: '分布求值点' },
  degree: { type: 'integer', description: '回归阶数 / 根' },
  formula: { type: 'string', description: '公式 id 或名称' },
  solveFor: { type: 'string', description: '反解：给定目标值求这条公式的某个参数（如 solveFor:"sigma"）' },
  targetValue: { type: 'number', description: '反解的目标结果值' },
  solveRange: { type: 'object', additionalProperties: true, description: '反解的数值搜索区间 {min,max}（符号解失败时用）' },
  formulaGraph: { type: 'boolean', description: '输出公式-链结构图（公式 + 22 条链）' },
  neighbors: { type: 'boolean', description: '配合 query:"neighbors" 列出与某公式相邻的公式（共用参数/常数/标签）' },
  formulaFocus: { type: 'string', description: '结构图焦点：公式 id 或链 id' },
  formulas: { type: 'array', items: { type: 'json', description: '"kleiber" 或 {formula,overrides?,label?}' }, description: '批量调公式' },
  overrides: { type: 'object', additionalProperties: true, description: '覆盖公式参数' },
  query: { type: 'string', description: '检索词；"sys" 看体系链' },
  customExpression: { type: 'string', description: '自定义公式表达式' },
  recurrence: { type: 'string', description: '递推式，如 "P*2"' },
  periods: { type: 'integer', description: '递推期数（默认 12，上限 5000）' },
  initial: { type: 'json', description: '初值' },
  from: { type: 'json', description: '定积分下界 / 区间起点（数字）；impact 里也可写节点名（字符串）' },
  to: { type: 'json', description: '定积分上界 / 区间终点（数字）；也可写目标名（字符串）' },
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
  base: { type: 'json', description: 'diverge：基线 {actors,edges,steps,seed}' },
  variant: { type: 'json', description: 'diverge：变体（可覆盖 seed/actors/edges）' },
  dataAction: { type: 'string', enum: ['put', 'get', 'query', 'search', 'lineage', 'stats', 'export', 'import', 'compact', 'migrate'], description: 'data：put/get/query/lineage/stats/export/import/compact' },
  dataVersion: { type: 'integer', description: 'data get：取历史版本（1 起）' },
  compactThreshold: { type: 'number', description: 'data compact：行数阈值（默认 500）' },
  id: { type: 'string', description: 'data：记录 id（如 model:北境军）' },
  tags: { type: 'array', items: { type: 'string' }, description: 'data put：标签' },
  refs: { type: 'array', items: { type: 'string' }, description: 'data put：引用（血缘上游 id）' },
  payload: { type: 'json', description: 'data put：数据本体' },
  tag: { type: 'string', description: 'data query：按标签过滤' },
  dataJson: { type: 'string', description: 'data import：JSON 记录数组' },
  worldTopology: { type: 'string', enum: ['sphere', 'plane'], description: 'world-map：sphere（球体，经度环绕）或 plane（天圆地方）' },
  planetRadiusKm: { type: 'number', description: 'world-map：星球半径 km（默认 6371）' },
  mapDistance: { type: 'json', description: 'world-map：两点距离 {from:{x,y},to:{x,y}}' },
  climate: { type: 'boolean', description: 'world-map：叠加气候层（温度/降水/分区/可耕率）' },
  globalMeanK: { type: 'number', description: '气候：全球平均温度 K（默认 288）' },
  greenhouseK: { type: 'number', description: '气候：温室增量 K（默认 33）' },
  useMap: { type: 'boolean', description: 'world/world-build：用地图+气候反算可耕率' },
  mapSeed: { type: 'number', description: 'world-build：地图种子' },
  mapWidth: { type: 'integer', description: 'world-map：网格宽（默认 720）' },
  mapHeight: { type: 'integer', description: 'world-map：网格高（默认 90）' },
  seaLevel: { type: 'number', description: 'world-map：陆地目标占比（默认 0.29，即地球量级）' },
  mountainScale: { type: 'number', description: 'world-map：山脉强度（默认 1）' },
  riverCount: { type: 'number', description: 'world-map：河流条数（默认 24）' },
  nationCount: { type: 'number', description: 'world-map：国家数（默认 8，Voronoi 分区）' },
  mineralDensity: { type: 'number', description: 'world-map：矿产密度（默认 0.02）' },
  edits: { type: 'json', description: 'world-map：编辑 [{x,y,height?,seaLevel?,nation?}]（改地形/海陆/国界）' },
  profile: { type: 'string', description: 'world：profile:"full" 追加完整世界编排（承载力/人口/粮食/疆域/瓶颈）' },
  quick: { type: 'boolean', description: 'feasibility：quick:true 快速判定' },
  initialPopulation: { type: 'number', description: 'world（profile:full）/ world-build：初始人口' },
  muPerPerson: { type: 'number', description: 'world-build：人均耕地（亩，默认 15）' },
  checkId: { type: 'string', description: 'crosscheck：只跑某一项（如 gravity）' },
  stocks: { type: 'json', description: 'simulate：存量 {name:{initial,unit}}' },
  flows: { type: 'json', description: 'simulate：流量 {name:{to,rate}}（rate 可用存量名与 t）' },
  dt: { type: 'number', description: 'simulate：步长（年，默认 1）' },
  simSteps: { type: 'number', description: 'simulate：步数（默认 100）' },
  objective: { type: 'string', description: 'optimize：目标名（如 profit）' },
  opType: { type: 'string', enum: ['max', 'min'], description: 'optimize：最大化/最小化' },
  constraints: { type: 'json', description: 'optimize：约束 {资源:{max,min}}' },
  lpVariables: { type: 'json', description: 'optimize：变量系数 {x:{资源:消耗, 目标:贡献}}' },
  integers: { type: 'array', items: { type: 'string' }, description: 'optimize：整数变量名' },
  actors: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'conflict：行动者 [{id,wealth}]' },
  seed: { type: 'number', description: '确定性随机种子（conflict 等，同 seed 同结果）' },
  series: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'history：指标时间序列 [{year,value}]' },
  minEpochYears: { type: 'number', description: 'history：最小纪元长度（年，默认 10）' },
  smoothing: { type: 'number', description: 'history：平滑窗口（年，默认 1=不平滑）' },
  crisisDrop: { type: 'number', description: 'history：危机阈值（跌幅比例，默认 0.2）' },
  simulate: { type: 'json', description: 'history：一站式模拟 {actors,edges,steps,seed}（先跑冲突模型再切纪元）' },
  historyThreshold: { type: 'number', description: 'history：转折重要性阈值（默认 0.05）' },
  saveAs: { type: 'string', description: '把本次结果自动写进统一数据层（记录名）' },
  target: { type: 'string', description: 'backtrace：目标描述，如「这座窑一天烧多少煤」' },
  given: { type: 'array', items: { type: 'string' }, description: 'backtrace：已知参数名（不再展开）' },
  maxDepth: { type: 'number', description: 'backtrace：展开深度（默认 2）' },
  astro: {
    type: 'json',
    description: '天文历表：{action:"sun|rise-set|moon|position", date:"2026-06-21T12:00:00Z", lat, lon, elevation}',
  },
  document: {
    type: 'json',
    description: '文档：{action:"extract|tables|numbers", path:"某.pdf", text?}——PDF 文本/表格/数字台账（不做 OCR）',
  },
  topology: {
    type: 'json',
    description: '拓扑：{action:"model|route|sightline|reachable|structure|rules|org|terrain|ship", nodes, edges, from, to, mode, maxKm, units, compartments, passages, entry, building, vehicle, rules}',
  },
  world_state: { type: 'object', additionalProperties: true, description: '设定库 {action,entries?,id?,query?}' },
  chain: { type: 'object', additionalProperties: true, description: '链条传导 {stages,raw}' },
  threshold: { type: 'object', additionalProperties: true, description: '阈值判断 {value,thresholds}' },
  scaling: { type: 'object', additionalProperties: true, description: '缩放判定 {law,from,to}' },
  anchor: { type: 'json', description: '锚定：anchor op 传 {anchor,anchors} 对象；derivation backSolve 传锚点 id（字符串）' },
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
  what: { type: 'string', description: 'workspace export 的导出项：formulas/systems/help/units/constants/bodies/entities/world_state/all' },
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
const baseTool = defineTool({
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  parameters: PARAMETER_SPEC,
  output: { schema: OUTPUT_SCHEMA, render: (_args: unknown, value: unknown) => renderResult(value) },
  execute: async (args: Record<string, unknown>, _exec: unknown) => {
    /**
     * displayPrecision 越界钳制并说明（T8-D04a）。
     *
     * 旧行为是「传 -1 静默按 8 位」——调用方以为生效了。
     * 现在钳到 0–64，并把「你要的 -1 已被钳成 0」写进 notice。
     */
    let clampNotice: string | undefined
    if (typeof args['displayPrecision'] === 'number') {
      const requested = Math.round(args['displayPrecision'])
      if (requested < 0 || requested > 64) {
        const clamped = Math.min(64, Math.max(0, requested))
        clampNotice = 'displayPrecision 只接受 0–64（收到 ' + requested + '），已按 ' + clamped + ' 位显示。'
        args = { ...args, displayPrecision: clamped }
      }
    }
    const operation = typeof args['operation'] === 'string' && args['operation'].trim() !== '' ? args['operation'].trim() : 'auto'
    /** auto 时对外报出实际执行的 operation（与老入口一致）。 */
    const expressionText = typeof args['expression'] === 'string' ? args['expression'] : ''
    const resolvedOperation =
      operation === 'auto'
        ? expressionText.includes('=') && !expressionText.includes('>') && !expressionText.includes('<')
          ? 'solve'
          : Array.isArray(args['matrix'])
            ? 'matrix'
            : 'evaluate'
        : operation
    try {
      {
        /** document 是异步的（PDF 解析）；同步实现返回对象，await 解开两者都兼容。 */
        const migrated = await Promise.resolve(dispatchNew(operation, args))
        if (migrated !== null) {
          return {
            ok: true,
            operation: resolvedOperation,
            input: typeof args['expression'] === 'string' ? (args['expression'] as string) : '',
            result: migrated.result,
            precision: typeof args['precision'] === 'number' ? (args['precision'] as number) : 64,
            value: toJsonValue(migrated.value) as JsonValue,
            ...(() => {
              const merged = [clampNotice, migrated.notice].filter((item): item is string => typeof item === 'string' && item !== '')
              return merged.length > 0 ? { notice: merged.join('\n') } : {}
            })(),
          } satisfies MathResult
        }
      }
      if (legacyRunner === null) {
        throw new Error(PLUGIN_NAME + ': 老入口未绑定（bindLegacy 未调用）')
      }
      const legacy = legacyRunner(args)
      return clampNotice === undefined
        ? legacy
        : { ...legacy, notice: legacy.notice !== undefined && legacy.notice !== '' ? legacy.notice + '\n' + clampNotice : clampNotice }
    } catch (error) {
      /**
       * ## 先认新入口的 CalcError
       *
       * 新实现的错误自带 `type`（ErrorType 联合）与 `hint`，直接透传即可。
       * 交给老 translateError 会被它当成未知异常、回落成 internal——
       * 那会让「缺参数」看起来像工具 bug（反馈包 T7-N8 报过的正是这一类）。
       * 只有不带 type 的异常（库抛的、内部 bug）才交老翻译器。
       */
      /**
       * 复合单位最后一层兜底：mathjs 不认的上标写法（`kg/m³`）交给 UCUM。
       *
       * 为什么放在这里而不是只放 evaluateOne：
       * 真实错误可能来自 unit 解析的任意一层（归一化、歧义修正…）；
       * 在出口统一拦一次，比在每层各放一次稳。
       */
      const expressionText = typeof args['expression'] === 'string' ? (args['expression'] as string) : ''
      const pipeline = expressionText !== '' ? tryUnitPipeline(expressionText) : null
      if (pipeline !== null && pipeline.ok && pipeline.value !== null) {
        return {
          ok: true,
          operation,
          input: expressionText,
          result: pipeline.text,
          precision: typeof args['precision'] === 'number' ? (args['precision'] as number) : 64,
          value: pipeline.value,
          notice: '单位管道：' + pipeline.message + '（' + pipeline.steps.join('；') + '）',
        }
      }
      const typed = error !== null && typeof error === 'object' && typeof (error as { type?: unknown }).type === 'string'
      const direct = typed
        ? {
            type: (error as { type: string }).type,
            message: error instanceof Error ? error.message : String(error),
            ...(typeof (error as { hint?: unknown }).hint === 'string' ? { hint: (error as { hint: string }).hint } : {}),
          }
        : null
      const rawMessage = error instanceof Error ? error.message : String(error)
      /** 语法错误不能当 internal：mathjs 的 Value expected / Unexpected 都是输入问题。 */
      const syntaxLike = /value expected|syntax error|unexpected|unexpected end of expression|parenthesis/i.test(rawMessage)
      const translated = direct ?? (errorTranslator !== null ? errorTranslator(error, 'internal', typeof args['expression'] === 'string' ? (args['expression'] as string) : '') : null)
      const type = translated?.type ?? (syntaxLike ? 'syntax' : 'internal')
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

/**
 * 工具导出：包一层，把 schema 校验错误也转成结构化结果。
 *
 * 不包的话，`operation` 不在 enum 里时宿主收到的是 **THROW**，
 * 反馈报告里「73% 错误不可解析」有一类就是这种。
 */
export const mathExecuteTool = {
  ...baseTool,
  execute: async (args: unknown, ctx?: unknown): Promise<MathResult> => {
    const startedAt = Date.now()
    let result: MathResult
    try {
      result = (await (baseTool as { execute: (a: unknown, c?: unknown) => Promise<MathResult> }).execute(args, ctx)) as MathResult
    } catch (error) {
      const name = error !== null && typeof error === 'object' ? (error as { name?: string }).name : ''
      const code = error !== null && typeof error === 'object' ? (error as { code?: string }).code : ''
      if (name !== 'ToolArgsError' && code !== 'INVALID_ARGS') throw error
      const message = error instanceof Error ? error.message : String(error)
      result = {
        ok: false,
        operation: 'unknown',
        input: '',
        result: '错误[invalid_argument]: ' + message,
        precision: 64,
        error: { type: 'invalid_argument', message, hint: '参数名或类型不对；operation 必须是已迁移的值（用 help 查），参数类型见工具 schema。' },
      }
    }
    /** 自动入库：给 saveAs 就把结果写进统一数据层（失败不影响返回）。 */
    const rawSaveArgs = (args ?? {}) as Record<string, unknown>
    if (typeof rawSaveArgs['saveAs'] === 'string' && (rawSaveArgs['saveAs'] as string).trim() !== '' && result.ok === true) {
      try {
        const operation = String(result.operation ?? 'note')
        const kind = ['world', 'history', 'conflict', 'diverge', 'astro'].includes(operation) ? operation : 'note'
        putRecord({ kind, name: (rawSaveArgs['saveAs'] as string).trim(), tags: ['自动'], payload: result.value ?? null })
      } catch {
        /* 入库失败不影响返回 */
      }
    }
    /** 运行日志：成功与失败都记一条（旁路，失败不影响返回）。 */
    try {
      writeRunLog(entryFromResult((args ?? {}) as Record<string, unknown>, result, startedAt))
    } catch {
      /* 日志失败静默 */
    }
    return result
  },
}
