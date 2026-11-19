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
  /** 注册按命名空间隔离的自定义单位。 */
  registerUnits(namespace: string, units: RegisteredUnitSpec[]): RegisterUnitsResult
  /** 列出已注册单位（不传 namespace 列出全部）。 */
  listUnits(namespace?: string): ListUnitsResult
  /** 注销整个命名空间（丢弃其引擎）。 */
  unregisterUnits(namespace: string): { ok: boolean; removed?: boolean }
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

/**
 * 创建服务实例（纯工厂：测试可直接调用，不依赖 cordis 上下文）。
 *
 * @returns 服务
 */
export function createMathEngineService(): MathEngineService {
  const version = readVersion()
  const unitFamilies = readUnitFamilies()
  /** 命名空间 → 独立引擎与已注册单位。 */
  const namespaces = new Map<string, { engine: Engine; units: NamespaceUnit[] }>()

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
        methods: ['describe', 'evaluate', 'convert', 'checkDimension', 'formula', 'interval', 'constant', 'registerUnits', 'listUnits', 'unregisterUnits'],
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
      const entry = namespaces.get(namespace) ?? { engine: createEngine(), units: [] }
      const registered: string[] = []
      for (const spec of units) {
        const name = typeof spec?.name === 'string' ? spec.name.trim() : ''
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
          return failRegister('invalid_argument', '单位名必须是字母开头的字母数字：' + JSON.stringify(name), '中文名请走别名；createUnit 只接受 ASCII。')
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
  }
}
