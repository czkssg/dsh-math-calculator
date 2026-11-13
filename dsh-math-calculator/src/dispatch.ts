/**
 * 分发：新实现优先，未重写的 operation 交给老入口。
 *
 * ## 绞杀者模式
 *
 * 第 8 步不一次删掉老代码。每个 operation 有两个来源：
 *
 * ```
 *   新实现（src/features/*）   已通过 35 套 / 1,499 项测试
 *   老实现（src/ops/*）        仍在跑，作为未迁移功能的回退
 * ```
 *
 * `dispatchNew` 只处理**已经迁移**的 operation，返回 `null` 表示「这条还没迁」，
 * 由 tool 层交给老入口。这样切换入口时功能不缩水。
 *
 * ## 数据注入
 *
 * v3 的 feature 不自己读文件；本文件负责把 `src/data/*.json` 读进来注入。
 * lib 产物在插件根下的 lib/，所以数据目录是 `../src/data`。
 *
 * @module dsh-math-calculator/dispatch
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runWorld, type WorldOpInput } from './features/deduction/world-op.js'
import { runDerivation } from './features/deduction/derivation-op.js'
import { runBodies } from './features/deduction/bodies.js'
import { runFeasibility } from './features/deduction/feasibility-op.js'
import { runQuickFeasible } from './features/deduction/quick-feasible.js'
import { runHierarchy } from './features/deduction/hierarchy.js'
import { runWorldState } from './features/deduction/world-state.js'
import { runChain } from './features/deduction/chain.js'
import { classifyThreshold } from './features/deduction/threshold.js'
import { judgeScaling } from './features/deduction/scaling.js'
import { lookupAnchor } from './features/deduction/anchor.js'
import { runExtractNumbers } from './features/graph/extract-numbers.js'
import { runUnitsAudit } from './features/graph/units-audit.js'
import { runTimelineCheck } from './features/graph/timeline-check.js'
import { loadStateBook, saveStateBook } from './io/state-store.js'
import { buildEngine } from './core/engine.js'
import { evaluateBatch, evaluateOne } from './features/numeric/evaluate.js'
import { findRoots, solveEquation, symbolicOperation } from './features/numeric/algebra.js'
import { eigenValues, matrixProfile, solveLinearSystem } from './features/numeric/linalg.js'
import { describe, distribution, regression } from './features/numeric/stats.js'
import { solveOde, solveRecurrence } from './features/numeric/ode.js'
import { convertUnits, describeUnit } from './features/numeric/units.js'
import { evaluateFormula } from './features/formulas/evaluate.js'
import { queryFormulas, type FormulaEntry } from './features/formulas/query.js'
import { evaluateSystem, type FormulaSystem } from './features/formulas/systems.js'
import { analyzeDependency } from './features/graph/dependency.js'
import { checkConsistency } from './features/graph/consistency.js'
import { checkLedger } from './features/graph/ledger.js'
import { comparePlans } from './features/graph/compare.js'
import { intervalOperation } from './features/graph/interval.js'
import { runConstants } from './features/deduction/constants-op.js'
import { runQuantities } from './features/numeric/quantities-op.js'
import { runBalance } from './features/graph/balance-op.js'
import { runCustom } from './features/numeric/custom-op.js'
import { runFormulaTable } from './features/formulas/formula-table-op.js'
import { runHelp, type HelpTopic } from './features/help.js'
import { runWorkspace } from './features/workspace.js'

/** 统一的返回形状（与老 Outcome 对齐）。 */
export interface DispatchOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 数据目录。 */
function dataDirectory(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data')
}

/** 读 JSON（不存在返回 null，不抛）。 */
function readJson(name: string): unknown | null {
  const path = join(dataDirectory(), name)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/** 常量与光谱型等注入数据（懒加载，只读一次）。 */
const cache: Record<string, unknown> = {}
function dataOf<T>(name: string, file: string, fallback: T): T {
  if (cache[name] !== undefined) return cache[name] as T
  const raw = readJson(file)
  cache[name] = raw ?? fallback
  return cache[name] as T
}

/** constants-graph.json → name→standard。 */
function constantsTable(): Record<string, number> {
  const rows = dataOf<Array<{ name: string; standard: number }>>('constants', 'constants-graph.json', [])
  return Object.fromEntries(rows.map((row) => [row.name, row.standard]))
}

/** 参数取值。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

/**
 * 尝试用新实现处理一个 operation。
 *
 * @param operation - operation 名
 * @param args - 原始参数
 * @returns 结果；未迁移返回 null
 */
export function dispatchNew(operation: string, args: Record<string, unknown>): DispatchOutcome | null {
  const worldDeps = {
    constants: constantsTable(),
    starClasses: dataOf<Array<Record<string, unknown>>>('stars', 'stars.json', []) as never,
  }

  switch (operation) {
    case 'world':
      return runWorld(args as WorldOpInput, worldDeps)

    case 'derivation':
      return runDerivation(args, worldDeps)

    case 'bodies': {
      const bodies = dataOf<Array<Record<string, unknown>>>('bodies', 'bodies.json', [])
      const taxonomy = dataOf<Array<Record<string, unknown>>>('taxonomy', 'body-taxonomy.json', [])
      return runBodies(args as never, { bodies: bodies as never, taxonomy: taxonomy as never })
    }

    case 'feasibility':
      return runFeasibility(args as never)

    case 'quick_feasible': {
      const input = asRecord(args['quickFeasible']) ?? {}
      return runQuickFeasible({ ...input, world: asRecord(args['world']) })
    }

    case 'hierarchy':
      return runHierarchy(asRecord(args['hierarchy']) as never)

    case 'world_state': {
      const input = asRecord(args['world_state']) ?? {}
      const workspace = typeof input['workspace'] === 'string' && input['workspace'].trim() !== '' ? input['workspace'].trim() : 'default'
      const book = loadStateBook(workspace)
      const outcome = runWorldState(input as never, book)
      saveStateBook(workspace, outcome.book)
      return { result: outcome.result, value: outcome.value, ...(outcome.notice !== undefined ? { notice: outcome.notice } : {}) }
    }

    case 'chain':
      return runChain(asRecord(args['chain']) as never)

    case 'threshold':
      return classifyThreshold(asRecord(args['threshold']) as never)

    case 'scaling':
      return judgeScaling(asRecord(args['scaling']) as never)

    case 'anchor':
      return lookupAnchor(asRecord(args['anchor']) as never)

    case 'extract_numbers':
      return runExtractNumbers(typeof args['text'] === 'string' ? args['text'] : '', {
        ...(args['keepNoise'] === true ? { keepNoise: true } : {}),
        ...(typeof args['limit'] === 'number' ? { limit: args['limit'] } : {}),
      })

    case 'units_audit': {
      const units = dataOf<Array<Record<string, unknown>>>('units', 'units.json', [])
      const all = (units as unknown as { ALL_UNITS?: unknown[] }).ALL_UNITS ?? units
      return runUnitsAudit({ claims: args['claims'] as never, text: args['text'] as never }, all as never)
    }

    case 'timeline_check':
      return runTimelineCheck({ events: args['events'] as never, maxSpan: args['maxSpan'] as never, overlapAllowed: args['overlapAllowed'] === true })

    // ── 数值计算（features/numeric）──
    case 'evaluate': {
      /**
       * 变量注入与显式精度仍走老入口：
       * evaluateOne 不接受 scope，且引擎是单例（精度固定 64）。
       * 这两类交给老入口才不会丢功能。
       */
      if (args['variables'] !== undefined || args['precision'] !== undefined) return null
      const options = { terse: args['terse'] === true, displayPrecision: displayPrecisionOf(args) }
      if (Array.isArray(args['expressions'])) {
        return toOutcome(evaluateBatch(buildEngine(), args['expressions'] as never, options))
      }
      const expression = typeof args['expression'] === 'string' ? args['expression'] : ''
      return toOutcome(evaluateOne(buildEngine(), expression, options))
    }

    case 'solve':
    case 'derivative':
    case 'integral':
    case 'simplify':
    case 'expand':
    case 'roots': {
      const expression = typeof args['expression'] === 'string' ? args['expression'] : ''
      const variable = typeof args['variable'] === 'string' ? args['variable'] : 'x'
      if (operation === 'solve') return toOutcome(solveEquation(buildEngine(), expression))
      if (operation === 'roots') return toOutcome(findRoots(buildEngine(), expression, variable))
      const from = typeof args['from'] === 'number' ? args['from'] : undefined
      const to = typeof args['to'] === 'number' ? args['to'] : undefined
      return toOutcome(symbolicOperation(operation as 'derivative' | 'integral' | 'simplify' | 'expand', expression, variable, from, to))
    }

    case 'matrix':
      return toOutcome(matrixProfile(buildEngine(), args['matrix'], displayPrecisionOf(args)))

    case 'eigen':
      return toOutcome(eigenValues(buildEngine(), args['matrix']))

    case 'system':
      return toOutcome(solveLinearSystem(buildEngine(), args['matrix'], args['vector']))

    case 'stats':
      return toOutcome(describe(args['data']))

    case 'dist': {}
      if (typeof args['distribution'] !== 'string') return null
      return toOutcome(distribution(args['distribution'], args['params'], typeof args['x'] === 'number' ? args['x'] : 0, displayPrecisionOf(args)))

    case 'regression':
      return toOutcome(regression(args['data'], args['dataY'], typeof args['degree'] === 'number' ? args['degree'] : 1))

    case 'ode': {
      const initial = asRecord(args['initial'])
      if (initial === undefined) return null
      return toOutcome(
        solveOde(
          buildEngine(),
          typeof args['expression'] === 'string' ? args['expression'] : '',
          initial as Record<string, number>,
          typeof args['from'] === 'number' ? args['from'] : 0,
          typeof args['to'] === 'number' ? args['to'] : 1,
          typeof args['steps'] === 'number' ? args['steps'] : 1000,
          typeof args['samples'] === 'number' ? args['samples'] : 11,
        ),
      )
    }

    case 'recurrence': {
      const initial = asRecord(args['initial'])
      if (initial === undefined || typeof args['recurrence'] !== 'string') return null
      return toOutcome(solveRecurrence(buildEngine(), args['recurrence'], initial as Record<string, number>, typeof args['periods'] === 'number' ? args['periods'] : 12))
    }

    case 'units': {
      const from = typeof args['unitFrom'] === 'string' ? args['unitFrom'] : ''
      const to = typeof args['unitTo'] === 'string' ? args['unitTo'] : ''
      if (from === '') return null
      if (to === '') return toOutcome(describeUnit(buildEngine(), from))
      const value = typeof args['unitValue'] === 'number' ? args['unitValue'] : 1
      return toOutcome(convertUnits(buildEngine(), value, from, to, args['terse'] === true, displayPrecisionOf(args)))
    }

    // ── 公式库（features/formulas）──
    case 'formulas': {
      const entries = formulaEntries()
      /** 批量公式先交老入口：它按条报错、吞掉未知 key 的语义与通知都已调好。 */
      if (Array.isArray(args['formulas'])) return null
      const query = typeof args['query'] === 'string' ? args['query'].trim() : ''
      if (query === '') return null
      if (query.startsWith('sys')) {
        const system = formulaSystems().find((item) => item.id === query || item.id === query.replace(/^sys:?/, ''))
        if (system === undefined) return null
        const initialRaw = asRecord(args['initial']) ?? {}
        const initial: Record<string, number> = {}
        for (const [key, value] of Object.entries(initialRaw)) {
          if (typeof value === 'number' && Number.isFinite(value)) initial[key] = value
        }
        return toOutcome(evaluateSystem(buildEngine(), entries, system, initial, displayPrecisionOf(args)))
      }
      return toOutcome(queryFormulas(entries, query, typeof args['limit'] === 'number' ? args['limit'] : 8))
    }

    case 'formula': {
      const id = typeof args['formula'] === 'string' ? args['formula'] : ''
      if (id === '') return null
      const entry = formulaEntries().find((item) => item.id === id || item.name === id)
      if (entry === undefined) return null
      return toOutcome(evaluateFormula(buildEngine(), entry, asRecord(args['overrides']) ?? {}, displayPrecisionOf(args), args['terse'] === true))
    }

    // ── 对账图谱（features/graph）──
    case 'dependency':
      return toOutcome(analyzeDependency(args['dependency'] as never, typeof args['traceTarget'] === 'string' ? args['traceTarget'] : (typeof args['start'] === 'string' ? args['start'] : undefined), args['direction'] === 'upstream' ? 'upstream' : 'downstream'))

    case 'ledger':
      return toOutcome(checkLedger(args['ledger'] as never))

    case 'consistency':
      return toOutcome(checkConsistency(args['consistency'] as never))

    case 'compare':
      return toOutcome(comparePlans(args['compare'] as never))

    case 'interval':
      return toOutcome(intervalOperation(args['interval'] as never))

    // ── 历史包袱较轻的五个 op（第 8 步最后一批）──
    case 'constants':
      return runConstants({ constants: args['constants'] as never, preview: args['preview'] === true, workspace: typeof args['workspace'] === 'string' ? args['workspace'] : undefined })

    case 'quantities':
      return runQuantities({ constants: args['constants'] as never, constantName: typeof args['constantName'] === 'string' ? args['constantName'] : undefined })

    case 'balance':
      return runBalance(args['balance'])

    case 'custom':
      return runCustom({
        customAction: typeof args['customAction'] === 'string' ? args['customAction'] : undefined,
        customConstant: args['customConstant'],
        customConstantName: typeof args['customConstantName'] === 'string' ? args['customConstantName'] : undefined,
        expression: typeof args['expression'] === 'string' ? args['expression'] : undefined,
        expectedDimension: args['expectedDimension'] as never,
        workspace: typeof args['workspace'] === 'string' ? args['workspace'] : undefined,
      })

    case 'formula-table':
      return runFormulaTable(
        {
          tableAction: typeof args['tableAction'] === 'string' ? args['tableAction'] : undefined,
          formulaId: typeof args['formulaId'] === 'string' ? args['formulaId'] : undefined,
          newExpression: typeof args['newExpression'] === 'string' ? args['newExpression'] : undefined,
          newParams: args['newParams'] as never,
          customFormula: args['customFormula'] as never,
          workspace: typeof args['workspace'] === 'string' ? args['workspace'] : undefined,
        },
        formulaEntries() as never,
      )

    case 'workspace':
      return runWorkspace({
        action2: typeof args['action2'] === 'string' ? args['action2'] : undefined,
        workspace: typeof args['workspace'] === 'string' ? args['workspace'] : undefined,
        constants: args['constants'] as never,
        workspaceVariables: args['workspaceVariables'] as never,
        useWorkspaceVariables: args['useWorkspaceVariables'] === true,
        world: asRecord(args['world']),
      })

    case 'help':
      return runHelp(
        dataOf<HelpTopic[]>('help', 'help.json', []),
        typeof args['helpTopic'] === 'string' ? args['helpTopic'] : undefined,
        typeof args['helpQuery'] === 'string' ? args['helpQuery'] : undefined,
      )

    // ── 自动识别：与老入口同规则，但落到新实现 ──
    case 'auto': {
      const expression = typeof args['expression'] === 'string' ? args['expression'].trim() : ''
      if (expression !== '' && expression.includes('=') && !expression.includes('>') && !expression.includes('<')) {
        return dispatchNew('solve', args)
      }
      if (Array.isArray(args['matrix'])) return dispatchNew('matrix', args)
      if (expression === '' && typeof args['expression'] !== 'string') return null
      return dispatchNew('evaluate', args)
    }

    default:
      return null
  }
}

/** 把新实现的 {result,value,notice,ok?} 转成统一返回。 */
function toOutcome(outcome: { result: string; value: unknown; notice?: string; ok?: boolean }): DispatchOutcome {
  return {
    result: outcome.result,
    value: outcome.value,
    ...(outcome.notice !== undefined ? { notice: outcome.notice } : {}),
  }
}

/** 显示精度（缺省 8）。 */
function displayPrecisionOf(args: Record<string, unknown>): number {
  return typeof args['displayPrecision'] === 'number' && Number.isFinite(args['displayPrecision']) ? args['displayPrecision'] : 8
}

/** 公式条目（懒加载）。 */
function formulaEntries(): FormulaEntry[] {
  return dataOf<FormulaEntry[]>('formulas', 'formulas.json', [])
}

/** 体系链（懒加载）。 */
function formulaSystems(): FormulaSystem[] {
  return dataOf<FormulaSystem[]>('systems', 'systems.json', [])
}

/** 已迁移的 operation 清单（供 help / 测试核对）。 */
export const MIGRATED_OPERATIONS = [
  // 推演与对账（第 6 步）
  'world',
  'derivation',
  'bodies',
  'feasibility',
  'quick_feasible',
  'hierarchy',
  'world_state',
  'chain',
  'threshold',
  'scaling',
  'anchor',
  'extract_numbers',
  'units_audit',
  'timeline_check',
  // 数值计算（第 3 步）
  'evaluate',
  'solve',
  'derivative',
  'integral',
  'simplify',
  'expand',
  'roots',
  'matrix',
  'eigen',
  'system',
  'stats',
  'dist',
  'regression',
  'ode',
  'recurrence',
  'units',
  // 公式库（第 4 步）
  'formula',
  'formulas',
  // 对账图谱（第 5 步）
  'dependency',
  'ledger',
  'consistency',
  'compare',
  'interval',
  // 收尾批（第 8 步最后 8 个）
  'constants',
  'quantities',
  'balance',
  'custom',
  'formula-table',
  'workspace',
  'help',
  'auto',
] as const
