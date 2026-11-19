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
  /**
   * 批量结果：逐条错误已写进 result 分段，不能走「ok=false 只渲染 error」那条路
   * （否则 AI 只看到一行汇总错误，看不到每条的结果）。
   */
  const batchValue = payload.value
  const isBatch = batchValue !== null && typeof batchValue === 'object' && !Array.isArray(batchValue) && Array.isArray((batchValue as { results?: unknown }).results)
  if (isBatch) {
    const text = typeof payload.result === 'string' ? payload.result : ''
    const notice = typeof payload.notice === 'string' && payload.notice !== '' ? payload.notice : ''
    return [{ type: 'text', text: notice ? text + '\n\n（' + notice + '）' : text }]
  }
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
  webDepth: { type: 'number', description: 'formulas web：上下游展开层数（默认 2，最大 5）' },
  webDirection: { type: 'string', description: 'formulas web：down（下游）/ up（上游）/ both' },
  webLimit: { type: 'number', description: 'formulas web：每层最多显示几条（默认 20）' },
  webContext: { type: 'boolean', description: 'formula：调用时附带上下游（默认开；false 关闭）' },
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
  randomSeed: { type: 'string', description: 'random：世界种子文本（同种子同结果）' },
  count: { type: 'number', description: 'random：序列长度（默认 10，上限 1000）' },
  min: { type: 'number', description: 'random：下界（默认 0）' },
  max: { type: 'number', description: 'random：上界（默认 1）' },
  integer: { type: 'boolean', description: 'random：取整数（默认 false = 浮点）' },
  randomActors: { type: 'array', items: { type: 'string' }, description: 'random：行为映射的实体名列表' },
  randomTraits: { type: 'json', description: 'random：特征表 {名称:{min,max}} 或 {名称:{choices:[...]}}' },
  algorithm: { type: 'string', description: 'random：算法（默认 xoshiro256pp；lcg 仅序列）' },
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
  /**
   * 以下为补齐项（2026-11-16 实测记录 R45/R46）：
   * 这些键在 dispatch / WorldParams 里被读取，但 schema 缺失 → 校验阶段被丢弃，
   * 表现为「参数静默忽略」（starType、orbitAU、ledger 全是这个原因）。
   * 守护测试 `schema-coverage.mjs` 会检查「使用键 ⊆ schema 键」。
   */
  starMass: { type: 'number', description: 'world：恒星质量（太阳=1）' },
  starRadius: { type: 'number', description: 'world：恒星半径（太阳=1）' },
  starTemp: { type: 'number', description: 'world：恒星表面温度 K（换恒星类型的唯一入口，5778=太阳；4500=K 型）' },
  starClass: { type: 'string', description: 'world：光谱型（如 G2V/K5V；主序星）' },
  orbitAU: { type: 'number', description: 'world：轨道半长轴 AU' },
  eccentricity: { type: 'number', description: 'world：轨道偏心率（0–0.95）' },
  albedo: { type: 'number', description: 'world：反照率（地球 0.3）' },
  pressure: { type: 'number', description: 'world：地表气压 **Pa**（地球 101325；火星 610；不要写 atm）' },
  molarMass: { type: 'number', description: 'world：大气平均摩尔质量 g/mol' },
  gamma: { type: 'number', description: 'world：绝热指数（双原子 1.4）' },
  greenhouse: { type: 'number', description: 'world：温室增量 K（地球 33）' },
  materialStrength: { type: 'number', description: 'world：地壳材料强度 Pa（影响最大山高）' },
  materialDensity: { type: 'number', description: 'world：地壳材料密度 kg/m³' },
  hasLiquid: { type: 'boolean', description: 'world：有无液态溶剂（影响生命闸门）' },
  moonCount: { type: 'number', description: 'world：卫星数量' },
  moonMass: { type: 'number', description: 'world：卫星质量（月球=1）' },
  moonDistance: { type: 'number', description: 'world：卫星轨道距离（km）' },
  moons: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'world：多卫星 [{name,massEarth,distanceKm}]' },
  lightPollution: { type: 'number', description: 'world：光污染等级（影响观星）' },
  galaxyBand: { type: 'string', description: 'world：银河带方向' },
  dayDefinition: { type: 'string', description: 'world：一天的定义（恒星日/太阳日）' },
  meatFraction: { type: 'number', description: 'world：肉食比例 0–1（默认 0.2；1 份肉要 10 份植物，10% 法则）' },
  humanUsableNpp: { type: 'number', description: 'world：人类可占用的 NPP 比例（默认 0.1；陆地实际约 0.25）' },
  caloriesPerDay: { type: 'number', description: 'world：人均食物能量 kcal/日（默认 2000，范围 1500–4000）' },
  /** 通用别名与子命令。 */
  action: { type: 'string', description: '子动作（topology/data/astro 的 action）' },
  action2: { type: 'string', description: 'workspace 的子动作 set/list/switch/export/import' },
  direction: { type: 'string', description: 'inverse/forward（依赖方向）' },
  node: { type: 'string', description: 'dependency：节点名' },
  edges: { type: 'array', items: { type: 'object', additionalProperties: true }, description: '拓扑/图：边 [{from,to,kind}]' },
  fromPoint: { type: 'json', description: 'topology avoid：起点坐标 {lat,lon}' },
  toPoint: { type: 'json', description: 'topology avoid：终点坐标 {lat,lon}' },
  obstacles: { type: 'json', description: 'topology avoid：障碍多边形数组，每个是 [[lon,lat],...] 环（可不闭合）' },
  gridKm: { type: 'number', description: 'topology avoid：栅格分辨率 km（默认 2）' },
  safetyKm: { type: 'number', description: 'topology avoid：障碍安全间距 km（默认 0）' },
  name: { type: 'string', description: '名称（data/workspace 记录名）' },
  nameContains: { type: 'string', description: 'data query：名称子串' },
  refsTo: { type: 'string', description: 'data query：谁引用了这条记录' },
  start: { type: 'number', description: '区间起点/起始年' },
  ascii: { type: 'boolean', description: 'world-map：输出 ASCII 缩略图（默认 true）' },
  helpQuery: { type: 'string', description: 'help：按任务搜索' },
  preview: { type: 'boolean', description: 'constants：只算不存' },
  /** 复合子对象（各自带完整内部结构）。 */
  ledger: { type: 'json', description: 'ledger：{parts:[{name,value}], total} 或占比简写 {士:1,农:85}' },
  balance: { type: 'json', description: 'balance：{items/production, demand, unit} 收支闭合' },
  consistency: { type: 'json', description: 'consistency：{claims:[{name,value,unit}]} 同一量多处冲突' },
  interval: { type: 'json', description: 'interval：{value, low, high, note} 区间估算' },
  compare: { type: 'json', description: 'compare：多方案对比 {options:[…], criteria:[…]}' },
  feasibility: { type: 'json', description: 'feasibility：{claim, constraints} 可行性' },
  dependency: { type: 'json', description: 'dependency：{node, levels, tree} 依赖传导' },
  formulaId: { type: 'string', description: 'formula-table：公式 id' },
  tableAction: { type: 'string', description: 'formula-table：add/update/remove/enable/disable' },
  newExpression: { type: 'string', description: 'formula-table：新表达式' },
  newParams: { type: 'json', description: 'formula-table：新参数定义' },
  /** 工作区与自定义量。 */
  constantName: { type: 'string', description: 'constants：要改的常数名' },
  customAction: { type: 'string', description: 'custom：add/remove/list' },
  customConstant: { type: 'json', description: 'custom：自定义常数定义' },
  customConstantName: { type: 'string', description: 'custom：自定义常数名' },
  customFormula: { type: 'json', description: 'custom：自定义公式定义' },
  expectedDimension: { type: 'json', description: 'custom：期望量纲（校验用）' },
  useWorkspaceVariables: { type: 'boolean', description: 'workspace：让变量参与计算（默认不参与，保确定性）' },
  workspaceVariables: { type: 'json', description: 'workspace：变量表 {name:value}' },
  /**
   * 批量入口（2026-11-18 用户要求「别让 AI 一个一个调用功能」）。
   *
   * 一次工具调用提交多条，按序执行、逐条独立报错。
   * 不新增 operation：MCP 规范没有 batch，而每加一个 op 都要付 enum/help/门面三处成本。
   */
  calls: {
    type: 'array',
    items: { type: 'json', description: '{operation,...参数}；也可只写 {expression}' },
    description: '批量：一次提交多条调用（顺序执行、逐条独立报错、互不中断）。单次上限 50 条。别再逐条发工具调用。条目内不能再写 calls。',
  },
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

/**
 * 递归删除值为 undefined 的键（数组里的 undefined 转 null）。
 *
 * 宿主校验要求「无损 JSON」：undefined 不是 JSON 值，会让整个输出被判非法。
 *
 * @param value - 任意值
 * @returns 清理后的副本
 */
function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : stripUndefined(item)))
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue
      out[key] = stripUndefined(item)
    }
    return out
  }
  return value
}

/** 批量调用上限：再多请客户端拆批（一次结果直接进上下文）。 */
const BATCH_LIMIT = 50

/** 批量条目可继承的外层参数：只继承「显示/计算」默认值，避免 expression 之类污染每条。 */
const BATCH_INHERITED_KEYS = ['precision', 'displayPrecision'] as const

/**
 * 执行一次 `calls` 批量。
 *
 * ## 为什么在工具参数层做，而不是新增 operation
 *
 * MCP 规范（2025-06-18 / 2025-11-25 的 schema）**没有 batch** —— 协议层只能逐次调用；
 * 模型逐条发工具调用，每条都要付一次完整 schema 与一次往返。批量放在参数层：
 * 不新增 operation（enum / help / 门面三处都不用动），一次调用即可跑完一组。
 *
 * 语义对齐 JSON-RPC 2.0 的 batch：**按数组顺序执行、逐条独立响应、一条失败不影响其它**。
 *
 * ## 三个约束
 *
 * 1. 条目不能再含 `calls`（否则无限套娃）；
 * 2. 上限 {@link BATCH_LIMIT} 条（再多请拆批，别把上下文撑爆）；
 * 3. 外层只继承 precision / displayPrecision；`saveAs` 只在条目内生效。
 *
 * @param outer - 含 calls 的原始参数
 * @param ctx - 工具上下文
 * @param self - 单条执行函数（外层包装后的 execute，复用出口清理与运行日志）
 * @returns 汇总结果：result 为分段文本，value.results 为逐条结构化结果
 */
async function runBatchCalls(
  outer: Record<string, unknown>,
  ctx: unknown,
  self: (args: unknown, c?: unknown) => Promise<MathResult>,
): Promise<MathResult> {
  const calls = outer['calls']
  const reject = (message: string, hint: string): MathResult => ({
    ok: false,
    operation: 'batch',
    input: '',
    result: '错误[invalid_argument]: ' + message,
    precision: 64,
    error: { type: 'invalid_argument', message, hint },
  })
  if (!Array.isArray(calls)) {
    return reject('calls 必须是数组', '形如 calls:[{operation:"units", unitFrom:"摄氏度", unitTo:"degF"}]')
  }
  if (calls.length === 0) {
    return reject('calls 为空', '至少给一条；单条调用请直接写参数，不要用 calls')
  }
  if (calls.length > BATCH_LIMIT) {
    return reject(
      'calls 一次最多 ' + BATCH_LIMIT + ' 条（收到 ' + calls.length + ' 条）',
      '拆成两批，或改用 expressions / formulas 这类专用批量参数',
    )
  }

  const inherited: Record<string, unknown> = {}
  for (const key of BATCH_INHERITED_KEYS) {
    if (outer[key] !== undefined) inherited[key] = outer[key]
  }

  const records: Array<Record<string, unknown>> = []
  let succeeded = 0
  let failed = 0
  for (let index = 0; index < calls.length; index += 1) {
    const raw = calls[index]
    const item = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
    /**
     * 两类条目在本地直接判失败，不进入执行：
     * 非对象（无法解读），嵌套 calls（无限套娃，且外层汇总会失真）。
     */
    if (item === null || item['calls'] !== undefined) {
      const message = item === null ? '第 ' + (index + 1) + ' 条不是对象' : '第 ' + (index + 1) + ' 条不能再嵌套 calls'
      failed += 1
      records.push({
        index: index + 1,
        operation: 'invalid',
        ok: false,
        input: '',
        result: '错误[invalid_argument]: ' + message,
        precision: 64,
        error: { type: 'invalid_argument', message },
      })
      continue
    }
    /**
     * operation 合法性在这里先查：条目参数不走宿主 schema 校验，
     * 不查的话未知 op 会落进老入口翻译成 internal（看起来像工具 bug）。
     */
    const declared = typeof item['operation'] === 'string' ? (item['operation'] as string).trim() : ''
    if (declared !== '' && !(MIGRATED_OPERATIONS as readonly string[]).includes(declared)) {
      const message = '不认识第 ' + (index + 1) + ' 条的 operation「' + declared + '」'
      failed += 1
      records.push({
        index: index + 1,
        operation: declared,
        ok: false,
        input: '',
        result: '错误[invalid_argument]: ' + message,
        precision: 64,
        error: { type: 'invalid_argument', message, hint: 'operation 见工具 schema 的 enum，或先调 {operation:"help"}' },
      })
      continue
    }
    const merged = { ...inherited, ...item }
    let one: MathResult
    try {
      one = await self(merged, ctx)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      one = {
        ok: false,
        operation: declared !== '' ? declared : 'unknown',
        input: typeof item['expression'] === 'string' ? (item['expression'] as string) : '',
        result: '错误[internal]: ' + message,
        precision: 64,
        error: { type: 'internal', message },
      }
    }
    if (one.ok === true) succeeded += 1
    else failed += 1
    records.push({
      index: index + 1,
      operation: one.operation,
      ok: one.ok,
      input: one.input,
      result: one.result,
      precision: one.precision,
      ...(one.value !== undefined ? { value: one.value } : {}),
      ...(one.notice !== undefined ? { notice: one.notice } : {}),
      ...(one.error !== undefined ? { error: one.error } : {}),
    })
  }

  const lines: string[] = ['═══ 批量调用（' + calls.length + ' 条）：成功 ' + succeeded + '，失败 ' + failed + ' ═══']
  for (const record of records) {
    const okEntry = record['ok'] === true
    const error = record['error'] as { type?: string; message?: string; hint?: string } | undefined
    lines.push('')
    lines.push('── [' + String(record['index']) + '] ' + String(record['operation']) + (okEntry ? '' : ' ✗ ' + (error?.type ?? 'error')) + ' ──')
    lines.push(
      okEntry
        ? String(record['result'])
        : '错误[' + (error?.type ?? 'error') + ']: ' + (error?.message ?? '未知错误') + (error?.hint !== undefined ? '\n提示: ' + error.hint : ''),
    )
    /** 条目自己的 notice 跟结果一起给（与单条渲染同格式），否则「地球标定」这类限定会丢。 */
    const entryNotice = record['notice']
    if (okEntry && typeof entryNotice === 'string' && entryNotice !== '') lines.push('（' + entryNotice + '）')
  }

  const noticeParts: string[] = []
  /**
   * 外层同时写了 operation 是常见误用（以为「批量默认 operation」）。
   * 不提示的话，调用方会以为它生效了，实际每条按自己的 operation 跑。
   */
  if (typeof outer['operation'] === 'string' && outer['operation'].trim() !== '' && outer['operation'].trim() !== 'auto') {
    noticeParts.push('外层 operation「' + outer['operation'] + '」已忽略：批量按每条自己的 operation 执行。')
  }
  if (failed > 0) {
    noticeParts.push('批量：' + succeeded + ' 条成功、' + failed + ' 条失败；失败条目已逐条标注，未中断后续。')
  }
  if (typeof outer['saveAs'] === 'string' && (outer['saveAs'] as string).trim() !== '') {
    noticeParts.push('外层 saveAs 已忽略：批量请把 saveAs 写进具体条目。')
  }

  return {
    ok: failed === 0,
    operation: 'batch',
    input: 'calls[' + calls.length + ']',
    result: lines.join('\n'),
    precision: typeof outer['precision'] === 'number' ? (outer['precision'] as number) : 64,
    value: { results: records } as JsonValue,
    ...(failed > 0 ? { partial: true } : {}),
    failed,
    succeeded,
    ...(noticeParts.length > 0 ? { notice: noticeParts.join('\n') } : {}),
  }
}

/**
 * 对外的工具定义（在 baseTool 外包一层：出口清理、未知参数提示、自动入库、运行日志）。
 */
export const mathExecuteTool = {
  ...baseTool,
  execute: async (args: unknown, ctx?: unknown): Promise<MathResult> => {
    const startedAt = Date.now()
    let result: MathResult
    try {
      const rawForBatch = (args ?? {}) as Record<string, unknown>
      if (Array.isArray(rawForBatch['calls'])) {
        /** 每条递归走本函数：复用出口清理、未知参数提示、条目级 saveAs 与运行日志。 */
        result = await runBatchCalls(rawForBatch, ctx, (item, subCtx) => mathExecuteTool.execute(item, subCtx))
      } else {
        result = (await (baseTool as { execute: (a: unknown, c?: unknown) => Promise<MathResult> }).execute(args, ctx)) as MathResult
      }
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
    /**
     * 出口清理：把 value 里值为 undefined 的键彻底删掉。
     *
     * 宿主用 snapshotJsonValue 校验输出，遇到 undefined 属性会抛
     * 「value is not lossless JSON」——表现为「整个工具崩了、错误还读不出」。
     * 实测 R48 的 ledger 致命错误就是这个（parts[i].note 缺省时被赋 undefined）。
     * 在出口统一清理，比在 60 多个 op 里各修一次可靠。
     */
    if (result.value !== undefined) {
      result = { ...result, value: stripUndefined(result.value) as never }
    }
    /**
     * 未知参数提示（实测记录 R45/R46：`starType`/`starLuminosity` 等被静默丢弃，
     * 调用方以为生效了）。schema 已声明全部使用键，所以这里能安全地列出「认不出来的」。
     * 只提示不报错：拼错的参数仍可能是别的 op 的合法键。
     */
    const rawArgsUnknown = (args ?? {}) as Record<string, unknown>
    const knownKeys = new Set(Object.keys(PARAMETER_SPEC))
    const ignoredKeys = Object.keys(rawArgsUnknown).filter((key) => !knownKeys.has(key) && rawArgsUnknown[key] !== undefined)
    if (ignoredKeys.length > 0) {
      const ignoredText = '这些参数名认不出来，已被忽略：' + ignoredKeys.join(', ') + '。可用参数见工具 schema，或 `{operation:"help"}` 查用法。'
      result = { ...result, notice: result.notice !== undefined && result.notice !== '' ? ignoredText + '\n' + result.notice : ignoredText }
    }
    /** 自动入库：给 saveAs 就把结果写进统一数据层（失败不影响返回）。 */
    const rawSaveArgs = (args ?? {}) as Record<string, unknown>
    if (
      typeof rawSaveArgs['saveAs'] === 'string' &&
      (rawSaveArgs['saveAs'] as string).trim() !== '' &&
      result.ok === true &&
      !Array.isArray(rawSaveArgs['calls'])
    ) {
      try {
        const operation = String(result.operation ?? 'note')
        const kind = ['world', 'history', 'conflict', 'diverge', 'astro'].includes(operation) ? operation : 'note'
        putRecord({ kind, name: (rawSaveArgs['saveAs'] as string).trim(), tags: ['自动'], payload: result.value ?? null })
      } catch {
        /* 入库失败不影响返回 */
      }
    }
    /**
     * 性能预警（R66）：>2s 的调用不是卡死，但要在结果里说明。
     * 批量外层不重复报（各条会各自报），避免一段结果里出现 N 条同样的提示。
     */
    const elapsedMs = Date.now() - startedAt
    if (elapsedMs >= 2000 && result.ok === true && !Array.isArray(rawArgsUnknown['calls'])) {
      const timing = '本次耗时 ' + (elapsedMs / 1000).toFixed(1) + ' 秒（规模较大）；这是正常等待，不是卡死。要更快请减小规模或分批。'
      result = { ...result, notice: result.notice !== undefined && result.notice !== '' ? result.notice + '\n' + timing : timing }
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