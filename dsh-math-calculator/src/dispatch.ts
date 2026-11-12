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

    default:
      return null
  }
}

/** 已迁移的 operation 清单（供 help / 测试核对）。 */
export const MIGRATED_OPERATIONS = [
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
] as const
