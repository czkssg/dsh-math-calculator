/**
 * `mathEngine`：计算能力的**程序化门面**（cordis 服务）。
 *
 * ## 为什么不是工具的执行函数别名
 *
 * `math_execute` 是「给模型看的」：结果里混排版文本、走工具流水线、记会话历史。
 * 服务消费者（其他插件）要的是**结构化值 + 稳定形状**——两者不能混。
 * 这里只调 `dispatchNew`（纯分发），不经过工具包装、不写会话。
 *
 * ## 与工具的一致性
 *
 * 同一输入经服务与工具应得到相同数值（r81 回归锁住）。因为底层是同一个
 * `dispatchNew`/引擎，差异只可能在「提取规范值」这一步。
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
  /** 单位族与数量概览。 */
  unitFamilies: Array<{ dimension: string; count: number }>
  /** 是否支持自定义单位注册（第二期）。 */
  supportsCustomUnits: boolean
  /** 服务直接提供的方法名。 */
  methods: string[]
}

/** 服务接口。 */
export interface MathEngineService {
  readonly version: string
  describe(): EngineServiceDescribe
  evaluate(expression: string, options?: { variables?: Record<string, number> }): EngineServiceResult
  convert(value: number, from: string, to: string): EngineServiceResult
  checkDimension(unit: string): EngineServiceResult
}

/** 能力缺失类错误（可降级）。 */
const CAPABILITY_TYPES = new Set(['unknown_formula', 'unknown_argument', 'unknown_subcommand', 'unknown_op', 'not_supported', 'unknown_symbol', 'unknown_unit'])
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

/**
 * 创建服务实例（纯工厂：测试可直接调用，不依赖 cordis 上下文）。
 *
 * @returns 服务
 */
export function createMathEngineService(): MathEngineService {
  const version = readVersion()
  const unitFamilies = readUnitFamilies()
  return {
    version,
    describe() {
      return {
        version,
        operations: [...MIGRATED_OPERATIONS],
        unitFamilies,
        supportsCustomUnits: false,
        methods: ['describe', 'evaluate', 'convert', 'checkDimension'],
      }
    },
    evaluate(expression, options = {}) {
      if (typeof expression !== 'string' || expression.trim() === '') {
        return fail('missing_params', 'expression 不能为空', '例如 evaluate("1 m + 1 ft")。')
      }
      const args: Record<string, unknown> = { expression: expression.trim(), terse: true }
      if (options.variables !== undefined) args['variables'] = options.variables
      return callDispatch('evaluate', args)
    },
    convert(value, from, to) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return fail('invalid_argument', 'value 必须是有限数', '')
      if (typeof from !== 'string' || typeof to !== 'string' || from === '' || to === '') {
        return fail('missing_params', 'convert 需要 from 与 to', '例如 convert(1, "m", "ft")。')
      }
      return callDispatch('units', { unitValue: value, unitFrom: from, unitTo: to })
    },
    checkDimension(unit) {
      if (typeof unit !== 'string' || unit.trim() === '') return fail('missing_params', 'checkDimension 需要 unit', '例如 checkDimension("kg/m3")。')
      return callDispatch('units', { unitFrom: unit.trim() })
    },
  }
}
