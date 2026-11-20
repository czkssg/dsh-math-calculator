/**
 * `mathEngine`：计算能力的**程序化门面**（cordis 服务）。
 *
 * ## 为什么不是工具的执行函数别名
 *
 * `math_execute` 是「给模型看的」：结果里混排版文本、走工具流水线、记会话历史。
 * 服务消费者（其他插件）要的是**结构化值 + 稳定形状**——两者不能混。
 *
 * ## 与工具的一致性
 *
 * 同一输入经服务与工具应得到相同数值（r81 回归锁住）。底层同一个引擎。
 *
 * ## 自定义单位命名空间（第二期）
 *
 * 每个 namespace 一个**独立引擎**（`createEngine()`）：注册的单位只在该世界内生效，
 * 注销即丢弃实例——不污染全局 `buildEngine`，也不受「engine 缓存」影响。
 *
 * ## 错误三档（提案 3.6）
 *
 * - `input`：表达式/单位写错——修正后重试；
 * - `capability`：operation 不支持、单位未注册——**可降级到自己的兜底**；
 * - `internal`：插件自身异常——记录并降级，不重试。
 *
 * @module dsh-math-calculator/service
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MIGRATED_OPERATIONS, dispatchNew } from './dispatch.js'
import { buildEngine, createEngine, type Engine } from './core/engine.js'
import { evaluateOne } from './features/numeric/evaluate.js'
import { convertUnits, describeUnit } from './features/numeric/units.js'
import { runChainNumeric, type ChainSystem } from './features/formulas/chain-run.js'
import type { FormulaEntry } from './features/formulas/query.js'

/** 服务名（cordis 服务键）。 */
export const MATH_ENGINE_SERVICE = 'mathEngine'

/** 错误档位。 */
export type ErrorKind = 'input' | 'capability' | 'internal'

/** 服务错误。 */
export interface EngineServiceError {
  type: string
  kind: ErrorKind
  message: string
  hint?: string
}

/** 服务结果（结构化：值与展示分离）。 */
export interface EngineServiceResult {
  ok: boolean
  /** 规范数值（字符串，避免浮点误差；十进制或科学计数法）。 */
  number?: string
  /** 单位（无量纲时省略）。 */
  unit?: string
  /** 附加结构（复数 {re,im}、推导步骤等）。 */
  value?: unknown
  /** 推导过程（结构化数组）。 */
  steps?: string[]
  error?: EngineServiceError
}

/** 能力自述。 */
export interface EngineServiceDescribe {
  version: string
  operations: string[]
  unitFamilies: Array<{ dimension: string; count: number }>
  supportsCustomUnits: boolean
  methods: string[]
}

/** 一个自定义单位（命名空间内）。 */
export interface NamespaceUnit {
  name: string
  factor: number
  /** SI 基准单位；空串表示无量纲（如货币、计件）。 */
  base: string
}

/** 注册单位的入参形状。 */
export interface RegisteredUnitSpec {
  name: string
  factor: number
  base?: string
}

/** 命名空间级自定义货币（符号库扩展）。 */
export interface RegisteredCurrencySpec {
  code: string
  name: string
  symbol?: string
  abbrev?: string
  kind?: 'modern' | 'ancient' | 'fantasy'
  note?: string
}

/** 命名空间级实体类型（topology 用，自由结构）。 */
export interface RegisteredEntitySpec {
  name: string
  fields?: Record<string, unknown>
  note?: string
}

/** 自定义链的一步。 */
export interface RegisteredChainStep {
  formula: string
  /** 参数 ← 第几步（1 起）。 */
  dataFlow?: Record<string, number>
  note?: string
}

/** 命名空间级自定义公式链。 */
export interface RegisteredChainSpec {
  id: string
  name?: string
  steps: RegisteredChainStep[]
}

/** 命名空间级自定义公式。 */
export interface RegisteredFormulaSpec {
  id: string
  name?: string
  expr: string
  /** 参数默认值（expr 里用参数名）。 */
  params?: Record<string, number>
  unit?: string
}

/** 注册结果。 */
export interface RegisterUnitsResult {
  ok: boolean
  namespace?: string
  registered?: string[]
  error?: EngineServiceError
}

/** 列表结果。 */
export interface ListUnitsResult {
  ok: boolean
  units?: Array<{ namespace: string; units: NamespaceUnit[] }>
  error?: EngineServiceError
}

/** 服务接口。 */
export interface MathEngineService {
  readonly version: string
  describe(): EngineServiceDescribe
  evaluate(expression: string, options?: { variables?: Record<string, number>; namespace?: string }): EngineServiceResult
  convert(value: number, from: string, to: string, options?: { namespace?: string }): EngineServiceResult
  checkDimension(unit: string, options?: { namespace?: string }): EngineServiceResult
  /** 公式代入（第三期）：返回数值、单位与公式元信息。 */
  formula(id: string, params?: Record<string, number>, options?: { namespace?: string }): EngineServiceResult
  /** 区间运算（第三期）：返回 low/high/置信档。 */
  interval(expr: string): EngineServiceResult
  /** 常量查询（第三期）：按 constants-graph 的标准值。 */
  constant(name: string): EngineServiceResult
  /** 货币符号库（可带命名空间自定义货币）。 */
  currency(action: string, options?: { kind?: string; code?: string; namespace?: string }): EngineServiceResult
  /** 注册按命名空间隔离的自定义单位。 */
  registerUnits(namespace: string, units: RegisteredUnitSpec[]): RegisterUnitsResult
  /** 列出已注册单位（不传 namespace 列出全部）。 */
  listUnits(namespace?: string): ListUnitsResult
  /** 注销整个命名空间（丢弃其引擎）。 */
  unregisterUnits(namespace: string): { ok: boolean; removed?: boolean }
  /** 注册按命名空间隔离的自定义货币（扩展符号库）。 */
  registerCurrencies(namespace: string, items: RegisteredCurrencySpec[]): RegisterUnitsResult
  /** 列出自定义货币（不传 namespace 列出全部）。 */
  listCurrencies(namespace?: string): ListUnitsResult
  /** 注销命名空间的全部自定义货币。 */
  unregisterCurrencies(namespace: string): { ok: boolean; removed?: boolean }
  /** 注册按命名空间隔离的自定义公式。 */
  registerFormulas(namespace: string, items: RegisteredFormulaSpec[]): RegisterUnitsResult
  /** 列出自定义公式（不传 namespace 列出全部）。 */
  listFormulas(namespace?: string): ListUnitsResult
  /** 注销命名空间的全部自定义公式。 */
  unregisterFormulas(namespace: string): { ok: boolean; removed?: boolean }
  /** 全部物理常数（标准值）。 */
  constants(): EngineServiceResult
  /** 世界设定（命名空间级键值）：set/get/list/delete。 */
  worldState(action: string, options?: { namespace?: string; key?: string; value?: unknown }): EngineServiceResult
  /** 数据层（put/get/query/stats）——用当前工作区。 */
  data(action: string, options?: { kind?: string; name?: string; payload?: unknown; id?: string; query?: string; nameContains?: string; tag?: string; limit?: number }): EngineServiceResult
  /** 实体类型（命名空间级）：register/list/unregister。 */
  entities(action: string, options?: { namespace?: string; items?: RegisteredEntitySpec[]; name?: string }): EngineServiceResult
  /** 拓扑模型（命名空间级）：save/list/load/delete。 */
  models(action: string, options?: { namespace?: string; name?: string; data?: unknown }): EngineServiceResult
  /** 注册命名空间级自定义公式链。 */
  registerChains(namespace: string, chains: RegisteredChainSpec[]): RegisterUnitsResult
  /** 列出命名空间的自定义链。 */
  listChains(namespace?: string): ListUnitsResult
  /** 注销命名空间的自定义链。 */
  unregisterChains(namespace: string): { ok: boolean; removed?: boolean }
  /** 执行链（自定义优先，否则内置 sys-*）。 */
  chain(id: string, options?: { namespace?: string; initial?: Record<string, number> }): EngineServiceResult
}

/** 能力缺失类错误（可降级）。 */
const CAPABILITY_TYPES = new Set(['unknown_formula', 'unknown_argument', 'unknown_subcommand', 'unknown_op', 'not_supported', 'unknown_symbol', 'unknown_unit', 'unknown_namespace'])
/** 输入类错误（修正后重试）。 */
const INPUT_TYPES = new Set(['invalid_argument', 'missing_params', 'unit_mismatch', 'non_finite', 'out_of_range'])

/**
 * 把 CalcError.type 归到三档。
 *
 * @param type - 错误类型
 * @returns 档位
 */
export function classifyError(type: string): ErrorKind {
  if (CAPABILITY_TYPES.has(type)) return 'capability'
  if (INPUT_TYPES.has(type)) return 'input'
  return 'internal'
}

/** 插件目录（lib/ 的上一级 = 包根）。 */
const HERE = dirname(fileURLToPath(import.meta.url))

/** 读版本（package.json 与 dsh.plugin.json 由 preflight 保证一致）。 */
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')) as { version?: string }
    return typeof pkg.version === 'string' ? pkg.version : 'unknown'
  } catch {
    return 'unknown'
  }
}

/** 读单位族统计。 */
function readUnitFamilies(): Array<{ dimension: string; count: number }> {
  try {
    const data = JSON.parse(readFileSync(join(HERE, '..', 'src', 'data', 'units.json'), 'utf8')) as { ALL_UNITS?: Array<{ dimension?: string }> }
    const counts = new Map<string, number>()
    for (const unit of data.ALL_UNITS ?? []) {
      const dimension = String(unit.dimension ?? 'unknown')
      counts.set(dimension, (counts.get(dimension) ?? 0) + 1)
    }
    return [...counts.entries()].map(([dimension, count]) => ({ dimension, count })).sort((a, b) => b.count - a.count)
  } catch {
    return []
  }
}

/** 失败结果。 */
function fail(type: string, message: string, hint?: string): EngineServiceResult {
  return { ok: false, error: { type, kind: classifyError(type), message, ...(hint !== undefined ? { hint } : {}) } }
}

/** 注册/列表失败。 */
function failRegister(type: string, message: string, hint?: string): RegisterUnitsResult {
  return { ok: false, error: { type, kind: classifyError(type), message, ...(hint !== undefined ? { hint } : {}) } }
}

/** 从 dispatch 的 value 提取规范值。 */
function extractValue(operation: string, value: unknown): EngineServiceResult {
  if (operation === 'units') {
    const record = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
    if (record['mode'] === 'convert') {
      const result = record['result']
      return {
        ok: true,
        number: typeof result === 'number' ? String(result) : String(result ?? ''),
        ...(typeof record['to'] === 'string' ? { unit: record['to'] as string } : {}),
        ...(Array.isArray(record['steps']) ? { steps: (record['steps'] as unknown[]).map(String) } : {}),
      }
    }
    return { ok: true, ...(typeof record['unit'] === 'string' ? { unit: record['unit'] as string } : {}), value: record['base'] ?? null }
  }
  if (operation === 'formula') {
    const record = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
    const web = record['web'] !== null && typeof record['web'] === 'object' ? (record['web'] as Record<string, unknown>) : undefined
    return {
      ok: true,
      number: String(record['result'] ?? ''),
      ...(typeof record['unit'] === 'string' ? { unit: record['unit'] as string } : {}),
      value: {
        id: record['id'],
        name: record['name'],
        expr: record['expr'],
        unitValid: record['unitValid'],
        ...(web !== undefined && typeof web['output'] === 'string' ? { output: web['output'] as string } : {}),
        ...(web !== undefined && Array.isArray(web['chains']) ? { chains: web['chains'] } : {}),
      },
    }
  }
  if (operation === 'interval') {
    const record = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
    return {
      ok: true,
      ...(typeof record['mid'] === 'number' ? { number: String(record['mid']) } : {}),
      value: record,
    }
  }
  if (typeof value === 'number') return { ok: true, number: String(value) }
  if (typeof value === 'string') {
    const matched = /^(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s+(.+)$/i.exec(value.trim())
    if (matched !== null) return { ok: true, number: matched[1], unit: matched[2] }
    return { ok: true, number: value }
  }
  if (value !== null && typeof value === 'object' && 're' in (value as object) && 'im' in (value as object)) {
    return { ok: true, value: value as object, number: String((value as { re: unknown }).re) }
  }
  return { ok: true, value: value ?? null }
}

/** 统一调用 dispatchNew 并分类错误。 */
function callDispatch(operation: string, args: Record<string, unknown>): EngineServiceResult {
  try {
    const out = dispatchNew(operation, args)
    if (out === null) return fail('unknown_op', '不支持 operation：' + operation, '可用 describe().operations 查看。')
    return extractValue(operation, out.value)
  } catch (error) {
    const type = (error as { type?: string }).type ?? 'internal'
    const message = error instanceof Error ? error.message : String(error)
    const hint = (error as { hint?: string }).hint
    return fail(type, message, hint)
  }
}

/** 命名空间名合法（字母数字中文下划线连字符，1–40）。 */
function isValidNamespace(name: unknown): name is string {
  return typeof name === 'string' && /^[\w\u4e00-\u9fa5-]{1,40}$/.test(name)
}

/** 常数表（懒加载一次）。 */
let constantTable: Array<{ name: string; standard: number; unit: string; meaning?: string }> | null = null

/** 读 constants-graph.json。 */
function readConstants(): Array<{ name: string; standard: number; unit: string; meaning?: string }> {
  if (constantTable !== null) return constantTable
  try {
    const data = JSON.parse(readFileSync(join(HERE, '..', 'src', 'data', 'constants-graph.json'), 'utf8')) as Array<Record<string, unknown>>
    constantTable = data.map((item) => ({
      name: String(item['name'] ?? ''),
      standard: Number(item['standard'] ?? 0),
      unit: String(item['unit'] ?? ''),
      ...(typeof item['meaning'] === 'string' ? { meaning: item['meaning'] as string } : {}),
    })).filter((item) => item.name !== '' && Number.isFinite(item.standard))
  } catch {
    constantTable = []
  }
  return constantTable
}

/** 内置货币（懒加载一次）。 */
let currencyCache: Array<{ code: string; name: string; symbol?: string; abbrev?: string; kind: string; note?: string }> | null = null

/** 读 currencies.json 的内置条目。 */
function readCurrencies(): Array<{ code: string; name: string; symbol?: string; abbrev?: string; kind: string; note?: string }> {
  if (currencyCache !== null) return currencyCache
  try {
    const data = JSON.parse(readFileSync(join(HERE, '..', 'src', 'data', 'currencies.json'), 'utf8')) as { currencies?: Array<Record<string, unknown>> }
    currencyCache = (data.currencies ?? []).map((item) => ({
      code: String(item['code'] ?? ''),
      name: String(item['name'] ?? ''),
      kind: String(item['kind'] ?? 'modern'),
      ...(typeof item['symbol'] === 'string' ? { symbol: item['symbol'] as string } : {}),
      ...(typeof item['abbrev'] === 'string' ? { abbrev: item['abbrev'] as string } : {}),
      ...(typeof item['note'] === 'string' ? { note: item['note'] as string } : {}),
    })).filter((item) => item.code !== '')
  } catch {
    currencyCache = []
  }
  return currencyCache
}

/** 内置公式与链（链执行用；懒加载一次）。 */
let formulasCache: FormulaEntry[] | null = null
let systemsCache: ChainSystem[] | null = null

/** 读 formulas.json。 */
function readFormulasData(): FormulaEntry[] {
  if (formulasCache !== null) return formulasCache
  try {
    formulasCache = JSON.parse(readFileSync(join(HERE, '..', 'src', 'data', 'formulas.json'), 'utf8')) as FormulaEntry[]
  } catch {
    formulasCache = []
  }
  return formulasCache
}

/** 读 systems.json。 */
function readSystemsData(): ChainSystem[] {
  if (systemsCache !== null) return systemsCache
  try {
    const raw = JSON.parse(readFileSync(join(HERE, '..', 'src', 'data', 'systems.json'), 'utf8')) as ChainSystem[] | { systems?: ChainSystem[] }
    systemsCache = Array.isArray(raw) ? raw : raw.systems ?? []
  } catch {
    systemsCache = []
  }
  return systemsCache
}

/**
 * 创建服务实例（纯工厂：测试可直接调用，不依赖 cordis 上下文）。
 *
 * @returns 服务
 */
export function createMathEngineService(): MathEngineService {
  const version = readVersion()
  const unitFamilies = readUnitFamilies()
  /** 命名空间 → 独立引擎、已注册单位/货币/公式。 */
  const namespaces = new Map<string, { engine: Engine; units: NamespaceUnit[]; currencies: RegisteredCurrencySpec[]; formulas: RegisteredFormulaSpec[]; world: Record<string, unknown>; entities: RegisteredEntitySpec[]; models: Record<string, unknown>; chains: RegisteredChainSpec[] }>()

  /** 取引擎：命名空间优先（不存在时回 undefined）。 */
  const engineOf = (namespace: string | undefined): Engine | undefined => {
    if (namespace === undefined) return buildEngine()
    return namespaces.get(namespace)?.engine
  }

  /** 扫描单位名是否已存在（内置或已注册）。 */
  const unitExists = (engine: Engine, name: string): boolean => {
    try {
      engine.evaluate('1 ' + name)
      return true
    } catch {
      return false
    }
  }

  return {
    version,
    describe() {
      return {
        version,
        operations: [...MIGRATED_OPERATIONS],
        unitFamilies,
        supportsCustomUnits: true,
        methods: ['describe', 'evaluate', 'convert', 'checkDimension', 'formula', 'interval', 'constant', 'constants', 'currency', 'worldState', 'data', 'entities', 'models', 'chain', 'registerUnits', 'listUnits', 'unregisterUnits', 'registerCurrencies', 'listCurrencies', 'unregisterCurrencies', 'registerFormulas', 'listFormulas', 'unregisterFormulas', 'registerChains', 'listChains', 'unregisterChains'],
      }
    },
    evaluate(expression, options = {}) {
      if (typeof expression !== 'string' || expression.trim() === '') {
        return fail('missing_params', 'expression 不能为空', '例如 evaluate("1 m + 1 ft")。')
      }
      if (options.namespace !== undefined && !namespaces.has(options.namespace)) {
        return fail('unknown_namespace', '命名空间「' + options.namespace + '」未注册', '先 registerUnits(namespace, units)。')
      }
      const engine = engineOf(options.namespace)
      if (engine === undefined) return fail('unknown_namespace', '命名空间未注册', '')
      try {
        const outcome = evaluateOne(engine, expression.trim(), { terse: true, displayPrecision: 8 }, options.variables as never)
        return extractValue('evaluate', outcome.value)
      } catch (error) {
        const type = (error as { type?: string }).type ?? 'internal'
        return fail(type, error instanceof Error ? error.message : String(error), (error as { hint?: string }).hint)
      }
    },
    convert(value, from, to, options = {}) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return fail('invalid_argument', 'value 必须是有限数', '')
      if (typeof from !== 'string' || typeof to !== 'string' || from === '' || to === '') {
        return fail('missing_params', 'convert 需要 from 与 to', '例如 convert(1, "m", "ft")。')
      }
      if (options.namespace !== undefined && !namespaces.has(options.namespace)) {
        return fail('unknown_namespace', '命名空间「' + options.namespace + '」未注册', '')
      }
      const engine = engineOf(options.namespace)
      if (engine === undefined) return fail('unknown_namespace', '命名空间未注册', '')
      try {
        const outcome = convertUnits(engine, value, from, to, false, 8)
        return extractValue('units', outcome.value)
      } catch (error) {
        const type = (error as { type?: string }).type ?? 'internal'
        return fail(type, error instanceof Error ? error.message : String(error), (error as { hint?: string }).hint)
      }
    },
    formula(id, params = {}, options = {}) {
      if (typeof id !== 'string' || id.trim() === '') return fail('missing_params', 'formula 需要公式 id 或名称', '例如 formula("kinetic_energy", { m: 2, v: 3 })。')
      if (options.namespace !== undefined && !namespaces.has(options.namespace)) {
        return fail('unknown_namespace', '命名空间「' + options.namespace + '」未注册', '')
      }
      /** 命名空间自定义公式优先（扩展接口注册的）。 */
      const nsEntry = options.namespace !== undefined ? namespaces.get(options.namespace) : undefined
      const customFormula = nsEntry?.formulas.find((item) => item.id === id.trim() || item.name === id.trim())
      if (customFormula !== undefined && nsEntry !== undefined) {
        const scope: Record<string, number> = { ...(customFormula.params ?? {}), ...params }
        try {
          const outcome = evaluateOne(nsEntry.engine, customFormula.expr, { terse: true, displayPrecision: 8 }, scope)
          const extracted = extractValue('evaluate', outcome.value)
          return {
            ...extracted,
            value: {
              ...(typeof extracted.value === 'object' && extracted.value !== null ? extracted.value : {}),
              id: customFormula.id,
              name: customFormula.name ?? customFormula.id,
              expr: customFormula.expr,
              custom: true,
            },
          }
        } catch (error) {
          const type = (error as { type?: string }).type ?? 'internal'
          return fail(type, error instanceof Error ? error.message : String(error), (error as { hint?: string }).hint)
        }
      }
      /** 公式代入允许用命名空间单位（其引擎内已注册）。 */
      if (options.namespace === undefined) return callDispatch('formula', { formula: id.trim(), params })
      const engine = engineOf(options.namespace)
      if (engine === undefined) return fail('unknown_namespace', '命名空间未注册', '')
      try {
        const out = dispatchNew('formula', { formula: id.trim(), params })
        if (out === null) return fail('unknown_op', '不支持 formula', '')
        return extractValue('formula', out.value)
      } catch (error) {
        const type = (error as { type?: string }).type ?? 'internal'
        return fail(type, error instanceof Error ? error.message : String(error), (error as { hint?: string }).hint)
      }
    },
    interval(expr) {
      if (typeof expr !== 'string' || expr.trim() === '') return fail('missing_params', 'interval 需要表达式', '例如 interval("20-50")。')
      return callDispatch('interval', { interval: { expr: expr.trim() } })
    },
    constant(name) {
      if (typeof name !== 'string' || name.trim() === '') return fail('missing_params', 'constant 需要常数名', '例如 constant("c")。')
      const table = readConstants()
      const hit = table.find((item) => item.name === name.trim())
      if (hit === undefined) {
        return fail('unknown_symbol', '没有名为「' + name + '」的常数', '可用：' + table.slice(0, 10).map((item) => item.name).join('、') + '…')
      }
      return {
        ok: true,
        number: String(hit.standard),
        ...(hit.unit !== '' ? { unit: hit.unit } : {}),
        value: { name: hit.name, ...(hit.meaning !== undefined ? { meaning: hit.meaning } : {}) },
      }
    },
    checkDimension(unit, options = {}) {
      if (typeof unit !== 'string' || unit.trim() === '') return fail('missing_params', 'checkDimension 需要 unit', '例如 checkDimension("kg/m3")。')
      if (options.namespace !== undefined && !namespaces.has(options.namespace)) {
        return fail('unknown_namespace', '命名空间「' + options.namespace + '」未注册', '')
      }
      const engine = engineOf(options.namespace)
      if (engine === undefined) return fail('unknown_namespace', '命名空间未注册', '')
      try {
        const outcome = describeUnit(engine, unit.trim())
        return extractValue('units', outcome.value)
      } catch (error) {
        const type = (error as { type?: string }).type ?? 'internal'
        return fail(type, error instanceof Error ? error.message : String(error), (error as { hint?: string }).hint)
      }
    },
    registerUnits(namespace, units) {
      if (!isValidNamespace(namespace)) return failRegister('invalid_argument', 'namespace 名不合法', '字母/数字/中文/下划线/连字符，1–40 字符。')
      if (!Array.isArray(units) || units.length === 0) return failRegister('missing_params', 'units 不能为空', '形如 [{name:"credit", factor:1, base:""}]。')
      const entry = namespaces.get(namespace) ?? { engine: createEngine(), units: [], currencies: [], formulas: [], world: {}, entities: [], models: {}, chains: [] }
      const registered: string[] = []
      for (const spec of units) {
        const name = typeof spec?.name === 'string' ? spec.name.trim() : ''
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
          return failRegister('invalid_argument', '单位名必须是字母开头、只含字母数字（不能有下划线）：' + JSON.stringify(name), 'createUnit 不接受下划线/中文名；需要中文请用业务层映射。')
        }
        const factor = Number(spec?.factor)
        if (!Number.isFinite(factor) || factor <= 0) return failRegister('invalid_argument', 'factor 必须是正有限数：' + name, '')
        const base = typeof spec?.base === 'string' ? spec.base.trim() : ''
        if (unitExists(entry.engine, name) || entry.units.some((item) => item.name === name)) {
          return failRegister('invalid_argument', '单位名「' + name + '」已存在（内置或已注册）', '标准单位与自定义单位不能同名。')
        }
        try {
          entry.engine.math.createUnit(name, base === '' ? String(factor) : factor + ' ' + base)
        } catch (error) {
          return failRegister('invalid_argument', 'createUnit 失败：' + name + '（' + (error instanceof Error ? error.message : String(error)) + '）', 'base 必须是已知单位（m/kg/s/…），无量纲请留空。')
        }
        entry.units.push({ name, factor, base })
        registered.push(name)
      }
      namespaces.set(namespace, entry)
      return { ok: true, namespace, registered }
    },
    listUnits(namespace) {
      if (namespace !== undefined) {
        const entry = namespaces.get(namespace)
        return { ok: true, units: entry === undefined ? [] : [{ namespace, units: [...entry.units] }] }
      }
      return { ok: true, units: [...namespaces.entries()].map(([key, entry]) => ({ namespace: key, units: [...entry.units] })) }
    },
    unregisterUnits(namespace) {
      return { ok: true, removed: namespaces.delete(namespace) }
    },
    currency(action, options = {}) {
      const act = typeof action === 'string' && action.trim() !== '' ? action.trim().toLowerCase() : 'list'
      if (options.namespace !== undefined && !namespaces.has(options.namespace)) {
        return fail('unknown_namespace', '命名空间「' + options.namespace + '」未注册', '先 registerCurrencies(namespace, items)。')
      }
      const custom = options.namespace !== undefined ? namespaces.get(options.namespace)?.currencies ?? [] : []
      const all = [...readCurrencies(), ...custom]
      if (act === 'list') {
        const kinds = ['modern', 'ancient', 'fantasy']
        const filter = typeof options.kind === 'string' && options.kind.trim() !== '' ? options.kind.trim().toLowerCase() : ''
        if (filter !== '' && !kinds.includes(filter)) return fail('invalid_argument', 'kind 只支持 modern / ancient / fantasy', '')
        const listed = all.filter((item) => filter === '' || item.kind === filter)
        return { ok: true, value: { kind: filter === '' ? 'all' : filter, currencies: listed } }
      }
      if (act === 'get') {
        const key = typeof options.code === 'string' ? options.code : ''
        const hit = all.find((item) => item.code.toLowerCase() === key.toLowerCase() || item.name === key || item.abbrev === key || item.symbol === key)
        if (hit === undefined) return fail('unknown_symbol', '货币库里没有「' + key + '」', '用 currency("list") 看全部。')
        return { ok: true, value: hit }
      }
      return fail('unknown_argument', '不认识的 currency 动作「' + act + '」', '可用：list / get。')
    },
    registerCurrencies(namespace, items) {
      if (!isValidNamespace(namespace)) return failRegister('invalid_argument', 'namespace 名不合法', '')
      if (!Array.isArray(items) || items.length === 0) return failRegister('missing_params', 'items 不能为空', '')
      const entry = namespaces.get(namespace) ?? { engine: createEngine(), units: [], currencies: [], formulas: [], world: {}, entities: [], models: {}, chains: [] }
      const registered: string[] = []
      const builtinCodes = new Set(readCurrencies().map((item) => item.code.toLowerCase()))
      for (const spec of items) {
        const code = typeof spec?.code === 'string' ? spec.code.trim() : ''
        const name = typeof spec?.name === 'string' ? spec.name.trim() : ''
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(code)) return failRegister('invalid_argument', '货币 code 必须字母开头（可含下划线）：' + JSON.stringify(code), '')
        if (name === '') return failRegister('invalid_argument', '货币 name 不能为空（' + code + '）', '')
        if (builtinCodes.has(code.toLowerCase()) || entry.currencies.some((item) => item.code.toLowerCase() === code.toLowerCase())) {
          return failRegister('invalid_argument', '货币 code「' + code + '」已存在（内置或已注册）', '不能覆盖内置货币。')
        }
        const kind = spec?.kind === 'ancient' || spec?.kind === 'fantasy' ? spec.kind : 'modern'
        entry.currencies.push({
          code,
          name,
          kind,
          ...(typeof spec?.symbol === 'string' ? { symbol: spec.symbol } : {}),
          ...(typeof spec?.abbrev === 'string' ? { abbrev: spec.abbrev } : {}),
          ...(typeof spec?.note === 'string' ? { note: spec.note } : {}),
        })
        registered.push(code)
      }
      namespaces.set(namespace, entry)
      return { ok: true, namespace, registered }
    },
    listCurrencies(namespace) {
      if (namespace !== undefined) {
        const entry = namespaces.get(namespace)
        return { ok: true, units: entry === undefined ? [] : [{ namespace, units: entry.currencies as never }] }
      }
      return { ok: true, units: [...namespaces.entries()].map(([key, entry]) => ({ namespace: key, units: entry.currencies as never })) }
    },
    unregisterCurrencies(namespace) {
      const entry = namespaces.get(namespace)
      if (entry === undefined) return { ok: true, removed: false }
      const had = entry.currencies.length > 0
      entry.currencies = []
      return { ok: true, removed: had }
    },
    registerFormulas(namespace, items) {
      if (!isValidNamespace(namespace)) return failRegister('invalid_argument', 'namespace 名不合法', '')
      if (!Array.isArray(items) || items.length === 0) return failRegister('missing_params', 'items 不能为空', '')
      const entry = namespaces.get(namespace) ?? { engine: createEngine(), units: [], currencies: [], formulas: [], world: {}, entities: [], models: {}, chains: [] }
      const registered: string[] = []
      for (const spec of items) {
        const id = typeof spec?.id === 'string' ? spec.id.trim() : ''
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) return failRegister('invalid_argument', '公式 id 必须字母开头（可含下划线）：' + JSON.stringify(id), '')
        if (typeof spec?.expr !== 'string' || spec.expr.trim() === '') return failRegister('invalid_argument', '公式「' + id + '」缺 expr', '')
        if (entry.formulas.some((item) => item.id === id)) return failRegister('invalid_argument', '公式 id「' + id + '」已存在', '')
        const params = spec?.params
        if (params !== undefined && (typeof params !== 'object' || params === null || Array.isArray(params))) {
          return failRegister('invalid_argument', 'params 必须是对象（' + id + '）', '')
        }
        for (const [key, value] of Object.entries(params ?? {})) {
          if (typeof value !== 'number' || !Number.isFinite(value)) return failRegister('invalid_argument', '参数「' + key + '」必须是有限数（' + id + '）', '')
        }
        entry.formulas.push({
          id,
          expr: spec.expr.trim(),
          ...(typeof spec.name === 'string' ? { name: spec.name } : {}),
          ...(typeof spec.unit === 'string' ? { unit: spec.unit } : {}),
          ...(params !== undefined ? { params: params as Record<string, number> } : {}),
        })
        registered.push(id)
      }
      namespaces.set(namespace, entry)
      return { ok: true, namespace, registered }
    },
    listFormulas(namespace) {
      if (namespace !== undefined) {
        const entry = namespaces.get(namespace)
        return { ok: true, units: entry === undefined ? [] : [{ namespace, units: entry.formulas as never }] }
      }
      return { ok: true, units: [...namespaces.entries()].map(([key, entry]) => ({ namespace: key, units: entry.formulas as never })) }
    },
    unregisterFormulas(namespace) {
      const entry = namespaces.get(namespace)
      if (entry === undefined) return { ok: true, removed: false }
      const had = entry.formulas.length > 0
      entry.formulas = []
      return { ok: true, removed: had }
    },
    constants() {
      return { ok: true, value: { constants: readConstants() } }
    },
    worldState(action, options = {}) {
      const act = typeof action === 'string' && action.trim() !== '' ? action.trim().toLowerCase() : 'list'
      if (options.namespace === undefined || !namespaces.has(options.namespace)) {
        return fail('unknown_namespace', 'worldState 需要已注册的命名空间', '先 registerUnits(namespace, []) 或 registerCurrencies 建一个。')
      }
      const world = namespaces.get(options.namespace)!.world
      if (act === 'set') {
        const key = typeof options.key === 'string' ? options.key.trim() : ''
        if (key === '') return fail('missing_params', 'worldState set 需要 key', '')
        world[key] = options.value ?? null
        return { ok: true, value: { key, value: world[key] } }
      }
      if (act === 'get') {
        const key = typeof options.key === 'string' ? options.key.trim() : ''
        if (!(key in world)) return fail('unknown_symbol', '世界设定里没有「' + key + '」', '先用 set 写入。')
        return { ok: true, value: { key, value: world[key] } }
      }
      if (act === 'list') return { ok: true, value: { entries: Object.entries(world).map(([key, value]) => ({ key, value })) } }
      if (act === 'delete') {
        const key = typeof options.key === 'string' ? options.key.trim() : ''
        if (!(key in world)) return { ok: true, value: { removed: false } }
        delete world[key]
        return { ok: true, value: { removed: true } }
      }
      return fail('unknown_argument', '不认识的 worldState 动作「' + act + '」', '可用：set / get / list / delete。')
    },
    data(action, options = {}) {
      const args: Record<string, unknown> = {}
      const put = (key: string, value: unknown): void => { if (value !== undefined) args[key] = value }
      put('dataAction', typeof action === 'string' && action.trim() !== '' ? action.trim().toLowerCase() : 'stats')
      put('kind', options.kind)
      put('name', options.name)
      put('payload', options.payload)
      put('id', options.id)
      put('query', options.query)
      put('nameContains', options.nameContains)
      put('tag', options.tag)
      put('limit', options.limit)
      return callDispatch('data', args)
    },
    entities(action, options = {}) {
      const act = typeof action === 'string' && action.trim() !== '' ? action.trim().toLowerCase() : 'list'
      if (options.namespace === undefined || !namespaces.has(options.namespace)) {
        return fail('unknown_namespace', 'entities 需要已注册的命名空间', '')
      }
      const list = namespaces.get(options.namespace)!.entities
      if (act === 'register') {
        const items = Array.isArray(options.items) ? options.items : []
        if (items.length === 0) return fail('missing_params', 'items 不能为空', '')
        const registered: string[] = []
        for (const item of items) {
          const name = typeof item?.name === 'string' ? item.name.trim() : ''
          if (!/^[A-Za-z\u4e00-\u9fa5][A-Za-z0-9\u4e00-\u9fa5_-]{0,39}$/.test(name)) return fail('invalid_argument', '实体名不合法：' + JSON.stringify(name), '字母/中文开头，1–40 字符。')
          if (list.some((entry) => entry.name === name)) return fail('invalid_argument', '实体「' + name + '」已存在', '')
          list.push({
            name,
            ...(item.fields !== undefined && typeof item.fields === 'object' ? { fields: item.fields as Record<string, unknown> } : {}),
            ...(typeof item.note === 'string' ? { note: item.note } : {}),
          })
          registered.push(name)
        }
        return { ok: true, value: { namespace: options.namespace, registered } }
      }
      if (act === 'list') return { ok: true, value: { namespace: options.namespace, entities: [...list] } }
      if (act === 'unregister') {
        const had = list.length > 0
        list.length = 0
        return { ok: true, value: { removed: had } }
      }
      return fail('unknown_argument', '不认识的 entities 动作「' + act + '」', '可用：register / list / unregister。')
    },
    models(action, options = {}) {
      const act = typeof action === 'string' && action.trim() !== '' ? action.trim().toLowerCase() : 'list'
      if (options.namespace === undefined || !namespaces.has(options.namespace)) {
        return fail('unknown_namespace', 'models 需要已注册的命名空间', '')
      }
      const store = namespaces.get(options.namespace)!.models
      const name = typeof options.name === 'string' ? options.name.trim() : ''
      if (act === 'save') {
        if (name === '') return fail('missing_params', 'models save 需要 name', '')
        store[name] = options.data ?? null
        return { ok: true, value: { name, saved: true } }
      }
      if (act === 'load') {
        if (!(name in store)) return fail('unknown_symbol', '没有名为「' + name + '」的模型', '')
        return { ok: true, value: { name, data: store[name] } }
      }
      if (act === 'list') return { ok: true, value: { names: Object.keys(store) } }
      if (act === 'delete') {
        if (!(name in store)) return { ok: true, value: { removed: false } }
        delete store[name]
        return { ok: true, value: { removed: true } }
      }
      return fail('unknown_argument', '不认识的 models 动作「' + act + '」', '可用：save / load / list / delete。')
    },
    registerChains(namespace, chains) {
      if (!isValidNamespace(namespace)) return failRegister('invalid_argument', 'namespace 名不合法', '')
      if (!Array.isArray(chains) || chains.length === 0) return failRegister('missing_params', 'chains 不能为空', '')
      const entry = namespaces.get(namespace) ?? { engine: createEngine(), units: [], currencies: [], formulas: [], world: {}, entities: [], models: {}, chains: [] }
      const registered: string[] = []
      const builtinChainIds = new Set(readSystemsData().map((item) => item.id))
      const builtinFormulaIds = new Set(readFormulasData().map((item) => item.id))
      for (const spec of chains) {
        const id = typeof spec?.id === 'string' ? spec.id.trim() : ''
        if (!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(id)) return failRegister('invalid_argument', '链 id 不合法：' + JSON.stringify(id), '字母开头，可含字母数字下划线连字符。')
        if (builtinChainIds.has(id) || entry.chains.some((item) => item.id === id)) return failRegister('invalid_argument', '链 id「' + id + '」已存在（内置或已注册）', '不能覆盖内置链。')
        const steps = Array.isArray(spec?.steps) ? spec.steps : []
        if (steps.length === 0 || steps.length > 20) return failRegister('invalid_argument', '链「' + id + '」步数必须 1–20', '')
        for (let index = 0; index < steps.length; index += 1) {
          const step = steps[index]
          const formula = typeof step?.formula === 'string' ? step.formula.trim() : ''
          if (!builtinFormulaIds.has(formula) && !entry.formulas.some((item) => item.id === formula)) {
            return failRegister('invalid_argument', '第 ' + (index + 1) + ' 步公式「' + formula + '」不存在', '先用 registerFormulas 注册，或用内置公式 id。')
          }
          for (const [param, fromStep] of Object.entries(step?.dataFlow ?? {})) {
            if (typeof fromStep !== 'number' || !Number.isInteger(fromStep) || fromStep < 1 || fromStep >= index + 1) {
              return failRegister('invalid_argument', '链「' + id + '」第 ' + (index + 1) + ' 步 dataFlow.' + param + ' 必须指向更早的步骤（1–' + index + '）', '')
            }
          }
        }
        entry.chains.push({
          id,
          ...(typeof spec.name === 'string' ? { name: spec.name } : {}),
          steps: steps.map((step) => ({
            formula: step.formula.trim(),
            ...(step.dataFlow !== undefined ? { dataFlow: { ...step.dataFlow } } : {}),
            ...(typeof step.note === 'string' ? { note: step.note } : {}),
          })),
        })
        registered.push(id)
      }
      namespaces.set(namespace, entry)
      return { ok: true, namespace, registered }
    },
    listChains(namespace) {
      if (namespace !== undefined) {
        const entry = namespaces.get(namespace)
        return { ok: true, units: entry === undefined ? [] : [{ namespace, units: entry.chains as never }] }
      }
      return { ok: true, units: [...namespaces.entries()].map(([key, entry]) => ({ namespace: key, units: entry.chains as never })) }
    },
    unregisterChains(namespace) {
      const entry = namespaces.get(namespace)
      if (entry === undefined) return { ok: true, removed: false }
      const had = entry.chains.length > 0
      entry.chains = []
      return { ok: true, removed: had }
    },
    chain(id, options = {}) {
      if (typeof id !== 'string' || id.trim() === '') return fail('missing_params', 'chain 需要链 id', '')
      if (options.namespace !== undefined && !namespaces.has(options.namespace)) {
        return fail('unknown_namespace', '命名空间「' + options.namespace + '」未注册', '先 registerChains(namespace, chains)。')
      }
      const ns = options.namespace !== undefined ? namespaces.get(options.namespace) : undefined
      const toChainSystem = (spec: RegisteredChainSpec): ChainSystem => ({
        id: spec.id,
        name: spec.name ?? spec.id,
        steps: spec.steps.map((step) => ({
          formula: step.formula,
          ...(step.dataFlow !== undefined
            ? { dataFlow: Object.fromEntries(Object.entries(step.dataFlow).map(([param, fromStep]) => [param, { fromStep }])) }
            : {}),
          ...(step.note !== undefined ? { note: step.note } : {}),
        })),
      })
      const custom = ns?.chains.find((item) => item.id === id.trim() || item.name === id.trim())
      const builtin = readSystemsData().find((item) => item.id === id.trim() || item.name === id.trim())
      const systems: ChainSystem[] = [...readSystemsData(), ...(ns?.chains ?? []).map(toChainSystem)]
      const system = custom !== undefined ? toChainSystem(custom) : builtin
      if (system === undefined) {
        return fail('unknown_formula', '没有 id 为「' + id.trim() + '」的链', '内置链：' + readSystemsData().slice(0, 8).map((item) => item.id).join('、') + '…；自定义用 listChains 看。')
      }
      const engine = ns?.engine ?? buildEngine()
      const customFormulas: FormulaEntry[] = (ns?.formulas ?? []).map((item) => ({
        id: item.id,
        name: item.name ?? item.id,
        expr: item.expr,
        unit: item.unit ?? '',
        params: Object.fromEntries(Object.entries(item.params ?? {}).map(([name, value]) => [name, { value }])),
        desc: '',
        cat: 'custom',
        aliases: [],
      })) as never
      try {
        const outcome = runChainNumeric([...readFormulasData(), ...customFormulas], systems, system.id, engine, options.initial ?? {}, undefined)
        const value = outcome.value as { steps?: Array<Record<string, unknown>>; terminal?: Record<string, unknown>; linkedSteps?: number[] }
        return { ok: true, value: { chain: system.id, steps: value.steps ?? [], terminal: value.terminal ?? null, linkedSteps: value.linkedSteps ?? [] } }
      } catch (error) {
        const type = (error as { type?: string }).type ?? 'internal'
        return fail(type, error instanceof Error ? error.message : String(error), (error as { hint?: string }).hint)
      }
    },
  }
}
