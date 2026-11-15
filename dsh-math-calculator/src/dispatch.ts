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
import { CalcError } from './core/errors.js'
import { evaluateBatch, evaluateOne } from './features/numeric/evaluate.js'
import { findRoots, solveEquation, symbolicOperation } from './features/numeric/algebra.js'
import { eigenValues, matrixProfile, solveLinearSystem } from './features/numeric/linalg.js'
import { describe, distribution, regression } from './features/numeric/stats.js'
import { solveOde, solveRecurrence } from './features/numeric/ode.js'
import { convertUnits, describeUnit } from './features/numeric/units.js'
import { evaluateFormula } from './features/formulas/evaluate.js'
import { solveFor } from './features/formulas/solve-for.js'
import { buildRelationIndex, relationReason, type RelationIndex } from './features/formulas/relations.js'
import { callFormula } from './features/formulas/function.js'
import { runFormulaGraph } from './features/formulas/formula-graph.js'
import { runChainNumeric } from './features/formulas/chain-run.js'
import { runTopology } from './features/topology/ops.js'
import { backtrace } from './features/formulas/backtrace.js'
import { buildEpochs, detectCrises } from './features/deduction/history.js'
import { runConflict, runConflictSeries } from './features/deduction/conflict.js'
import { runAstro } from './features/deduction/astro.js'
import { runDocument } from './features/document/pdf.js'
import { tryUnitPipeline } from './core/unit-pipeline.js'
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
export function dispatchNew(operation: string, rawArgs: Record<string, unknown>): DispatchOutcome | null {
  const args = normalizeArgs(rawArgs)
  const worldDeps = {
    constants: constantsTable(),
    starClasses: dataOf<Array<Record<string, unknown>>>('stars', 'stars.json', []) as never,
  }

  switch (operation) {
    case 'world': {
      /**
       * terrain.kind 拼错必须报错（T3-13）。
       *
       * 旧行为：world 不读 terrain.kind，拼错的 'coastel' 被静默丢弃，
       * 输出一份「正常」的气候——作者以为地形生效了。
       * 局地气候本身由 topology/terrain 计算，world 只做行星级。
       */
      const terrainInput = asRecord(args['terrain'])
      const kind = terrainInput?.['kind']
      if (kind !== undefined) {
        const KINDS = ['coastal', 'plain', 'plateau', 'mountain', 'valley', 'desert', 'forest', 'tundra', 'island', 'lake']
        if (typeof kind !== 'string' || !KINDS.includes(kind)) {
          throw new CalcError(
            'invalid_argument',
            '不认识的 terrain.kind「' + String(kind) + '」',
            '可用：' + KINDS.join(' / ') + '。注意 world 本身只做行星级气候；局地地形气候由 topology/terrain 计算。',
          )
        }
      }
      const outcome = runWorld(args as WorldOpInput, worldDeps)
      /**
       * 地球标定提示（W09-T4-11）。
       *
       * 全部用默认值时，输出就是地球的推算结果；不标出来的话，
       * 作者会把「地球值」当成自己世界的结论。
       */
      const WORLD_KEYS = ['planetMass', 'planetRadius', 'rotationHours', 'obliquityDeg', 'starMass', 'starRadius', 'starTemp', 'orbitAU', 'eccentricity', 'albedo', 'pressure', 'molarMass', 'world']
      const customized = WORLD_KEYS.some((key) => args[key] !== undefined)
      const earthNotice = customized ? undefined : '地球标定：本次未改任何星球参数，结果即地球默认值；要推演别的世界请改 planetMass / starTemp 等。'
      const merged = [outcome.notice, earthNotice].filter((item): item is string => typeof item === 'string' && item !== '')
      return {
        result: outcome.result,
        value: outcome.value,
        ...(merged.length > 0 ? { notice: merged.join('\n') } : {}),
      }
    }

    case 'derivation':
      return runDerivation(args, worldDeps)

    case 'topology':
      return runTopology((args['topology'] ?? args) as never)

    case 'conflict': {
      const actors = Array.isArray(args['actors']) ? (args['actors'] as Array<Record<string, unknown>>).map((a) => ({ id: String(a['id'] ?? ''), wealth: Number(a['wealth'] ?? 0) })) : []
      const edges = Array.isArray(args['edges']) ? (args['edges'] as Array<Record<string, unknown>>).map((e) => ({ from: String(e['from'] ?? ''), to: String(e['to'] ?? '') })) : []
      const result = runConflict({ actors, edges, steps: typeof args['steps'] === 'number' ? (args['steps'] as number) : undefined, seed: typeof args['seed'] === 'number' ? (args['seed'] as number) : undefined })
      const lines = ['═══ 冲突/贡赋模拟 ═══', '']
      lines.push('  最终排序：' + result.ranking.map((r, i) => (i + 1) + '. ' + r.id + '(' + r.wealth.toFixed(0) + ')').join('  '))
      lines.push('  战争 ' + result.wars + ' 次，付贡 ' + result.tributes + ' 次')
      lines.push('  最强：' + result.strongest + '，最弱：' + result.weakest)
      const losers = Object.entries(result.records).filter(([, v]) => v.losses > 0).map(([k, v]) => k + '(-' + v.losses + ')').join('、')
      if (losers !== '') lines.push('  战败方：' + losers)
      for (const note of result.notes) lines.push('  ' + note)
      return { result: lines.join('\n'), value: result } as never
    }

    case 'history': {
      let series = Array.isArray(args['series']) ? (args['series'] as Array<Record<string, unknown>>).map((p) => ({ year: Number(p['year'] ?? 0), value: Number(p['value'] ?? 0) })) : []
      let events = Array.isArray(args['events']) ? (args['events'] as Array<Record<string, unknown>>).map((e) => ({ year: Number(e['year'] ?? 0), label: String(e['label'] ?? ''), ...(e['kind'] !== undefined ? { kind: String(e['kind']) } : {}) })) : []
      /** 一站式：给 simulate 就先用冲突模型跑出「最强势力份额」序列与事件。 */
      const simArgs = args['simulate'] as Record<string, unknown> | undefined
      let simulation: Record<string, unknown> | null = null
      if (simArgs !== undefined && simArgs !== null && typeof simArgs === 'object') {
        const sim = runConflictSeries({ actors: Array.isArray(simArgs['actors']) ? (simArgs['actors'] as Array<Record<string, unknown>>).map((a) => ({ id: String(a['id'] ?? ''), wealth: Number(a['wealth'] ?? 0) })) : [], edges: Array.isArray(simArgs['edges']) ? (simArgs['edges'] as Array<Record<string, unknown>>).map((e) => ({ from: String(e['from'] ?? ''), to: String(e['to'] ?? '') })) : [], steps: typeof simArgs['steps'] === 'number' ? (simArgs['steps'] as number) : undefined, seed: typeof simArgs['seed'] === 'number' ? (simArgs['seed'] as number) : undefined })
        series = sim.leaderShare
        events = sim.events
        simulation = { events: sim.events.length, finalHhi: sim.concentration[sim.concentration.length - 1].hhi }
      }
      const result = buildEpochs({ series, events, minEpochYears: typeof args['minEpochYears'] === 'number' ? (args['minEpochYears'] as number) : undefined, threshold: typeof args['historyThreshold'] === 'number' ? (args['historyThreshold'] as number) : undefined, smoothing: typeof args['smoothing'] === 'number' ? (args['smoothing'] as number) : undefined })
      const crises = detectCrises(series, { dropRatio: typeof args['crisisDrop'] === 'number' ? (args['crisisDrop'] as number) : 0.2 })
      const lines = ['═══ 历史纪元划分 ═══', '']
      if (simulation !== null) lines.push('  [模拟] 冲突事件 ' + simulation['events'] + ' 次，末态集中度 ' + Number(simulation['finalHhi']).toFixed(2), '')
      for (const epoch of result.epochs) lines.push('  ' + epoch.startYear + ' — ' + epoch.endYear + ' 年：' + epoch.turn + '（' + epoch.events.map((e) => e.label).join('、') + '）')
      lines.push('', '  转折年：' + (result.turningPoints.length > 0 ? result.turningPoints.join('、') : '无'))
      if (crises.length > 0) lines.push('  危机年：' + crises.slice(0, 8).map((c) => c.year + '（' + c.detail + '）').join('；'))
      for (const note of result.notes) lines.push('  ' + note)
      return { result: lines.join('\n'), value: { ...result, crises, simulation } } as never
    }

    case 'backtrace': {
      const formulas = dataOf<Array<Record<string, unknown>>>('formulas', 'formulas.json', [])
      const target = typeof args['target'] === 'string' ? (args['target'] as string) : ''
      if (target.trim() === '') throw new CalcError('missing_params', 'backtrace 需要 target（目标描述）', '例如 {operation:"backtrace", target:"这座窑一天烧多少煤"}。')
      const given = Array.isArray(args['given']) ? (args['given'] as unknown[]).map(String) : []
      const chainFile = dataOf<{ chains?: unknown[] }>('modelChains', 'model-chains.json', { chains: [] })
      const chains = Array.isArray(chainFile) ? chainFile : (chainFile.chains ?? [])
      const result = backtrace(formulas as never, target, { maxDepth: typeof args['maxDepth'] === 'number' ? (args['maxDepth'] as number) : 2, given, modelChains: chains as never[] })
      const lines = ['═══ 目标回溯：' + target + ' ═══', '']
      if (result.modelChain !== undefined) {
        lines.push('  ★ 模型链：' + result.modelChain.label)
        lines.push('  ' + result.modelChain.steps.map((s, i) => (i + 1) + '. ' + s.label + '（' + s.op + (s.action !== undefined ? ':' + s.action : '') + (s.kind !== undefined ? ' kind=' + s.kind : '') + '）').join('\n  '))
        lines.push('', '  需你给的参数：' + result.modelChain.needs.join('、'))
        lines.push('', '  可执行：' + result.modelChain.calls.map((c) => JSON.stringify(c)).join(' → '))
      } else if (result.matches.length === 0) lines.push('  ' + result.notes[0])
      else {
        lines.push('  命中公式：' + result.matches.map((m) => m.name).join('、'))
        lines.push('', '  推荐链：' + (result.chain.length > 0 ? result.chain.map((c) => c.name).join(' → ') : '（单公式）'))
        if (result.missing.length > 0) lines.push('', '  需你给的参数：' + result.missing.map((m) => m.formula + '.' + m.param + (m.desc !== '' ? '（' + m.desc + '）' : '')).join('、'))
        lines.push('', '  可执行：' + result.calls.map((c) => JSON.stringify(c)).join(' → '))
      }
      return { result: lines.join('\n'), value: result } as never
    }

    case 'astro':
      return runAstro((args['astro'] ?? args) as never) as never

    case 'document':
      return runDocument((args['document'] ?? args) as never) as never

    case 'impact': {
      /** 影响面分析：老的独立 operation，v3 里以 derivation:impact 子命令实现。 */
      const target = typeof args['traceTarget'] === 'string' ? args['traceTarget'] : (typeof args['node'] === 'string' ? args['node'] : '')
      if (target === '') {
        throw new CalcError('missing_params', 'impact 需要 traceTarget（要查影响的量）', '例如 {operation:"impact", traceTarget:"建筑高度上限"}。')
      }
      return runDerivation({ derivation: 'impact', traceTarget: target, ...(args['world'] !== undefined ? { world: args['world'] } : {}) }, worldDeps)
    }

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
       * 变量注入与精度：
       * - variables 交给 engine.evaluate 的 scope（已支持）；
       * - precision 是引擎级（BigNumber 固定 64），按调用改不了——
       *   显式给了就提示一句，不再回退老入口。
       */
      const scope = asRecord(args['variables'])
      const options = {
        terse: args['terse'] === true,
        displayPrecision: displayPrecisionOf(args),
        ...(typeof args['precision'] === 'number' ? { precision: args['precision'] } : {}),
      } as never
      const precisionNotice =
        typeof args['precision'] === 'number' && Math.round(args['precision']) !== 64
          ? '计算精度固定为 64 位有效数字（BigNumber 引擎级），本次的 precision=' + args['precision'] + ' 未改变引擎精度；显示位数请用 displayPrecision。'
          : undefined
      if (Array.isArray(args['expressions'])) {
        const batch = evaluateBatch(buildEngine(), args['expressions'] as never, options, scope as never)
        return toOutcome({ ...batch, ...(precisionNotice !== undefined ? { notice: precisionNotice } : {}) })
      }
      const expression = typeof args['expression'] === 'string' ? args['expression'] : ''
      let single
      try {
        single = evaluateOne(buildEngine(), expression, options, scope as never)
      } catch (error) {
        /** 统一单位管道（现代↔现代走 UCUM，非现代先桥接）。 */
        const pipeline = tryUnitPipeline(expression)
        if (pipeline !== null && pipeline.ok && pipeline.value !== null) {
          return toOutcome({ result: pipeline.text, value: pipeline.value, ok: true, notice: '单位管道：' + pipeline.message + '（' + pipeline.steps.join('；') + '）' })
        }
        throw error
      }
      return toOutcome({
        ...single,
        ...(single.notice !== undefined && precisionNotice !== undefined ? { notice: single.notice + ' ' + precisionNotice } : single.notice !== undefined ? { notice: single.notice } : precisionNotice !== undefined ? { notice: precisionNotice } : {}),
      })
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
      /** dataY 是 regression 的参数；stats 收了会静默忽略（T7-N3）。 */
      if (args['dataY'] !== undefined) {
        throw new CalcError('unknown_argument', 'stats 不收 dataY——它是 regression 的参数（data 与 dataY 配对）', '要算两条序列的关系请用 {operation:"regression", data, dataY, degree}。')
      }
      return toOutcome(describe(args['data']))

    case 'dist':
      if (typeof args['distribution'] !== 'string') {
        throw new CalcError('missing_params', 'dist 需要 distribution（分布名）', '可用：normal / binomial / poisson / exponential / chisquare / t。')
      }
      if (typeof args['x'] !== 'number' || !Number.isFinite(args['x'])) {
        throw new CalcError('missing_params', 'dist 需要 x（求值点）', '例如 {operation:"dist", distribution:"normal", params:[0,1], x:0}。')
      }
      return toOutcome(distribution(args['distribution'], args['params'], args['x'], displayPrecisionOf(args)))

    case 'regression':
      return toOutcome(regression(args['data'], args['dataY'], typeof args['degree'] === 'number' ? args['degree'] : 1))

    case 'ode': {
      const initial = asRecord(args['initial'])
      if (initial === undefined) {
        throw new CalcError('missing_params', 'ode 需要 initial（状态初值）', '例如 {operation:"ode", expression:"dy/dt = -y", initial:{y:1}, from:0, to:1}。')
      }
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
      if (initial === undefined) {
        throw new CalcError('missing_params', 'recurrence 需要 initial（初值）', '例如 {operation:"recurrence", recurrence:"P*1.02", initial:{P:100}, periods:10}。')
      }
      if (typeof args['recurrence'] !== 'string' || args['recurrence'].trim() === '') {
        throw new CalcError('missing_params', 'recurrence 需要递推式', '例如 {operation:"recurrence", recurrence:"P*1.02", initial:{P:100}, periods:10}。')
      }
      return toOutcome(solveRecurrence(buildEngine(), args['recurrence'], initial as Record<string, number>, typeof args['periods'] === 'number' ? args['periods'] : 12))
    }

    case 'units': {
      const from = typeof args['unitFrom'] === 'string' ? args['unitFrom'] : ''
      const to = typeof args['unitTo'] === 'string' ? args['unitTo'] : ''
      if (from === '') {
        throw new CalcError('missing_params', 'units 需要 unitFrom（源单位）', '例如 {operation:"units", unitValue:30, unitFrom:"里", unitTo:"km"}；只给 unitFrom 会列出该单位信息。')
      }
      if (to === '') return toOutcome(describeUnit(buildEngine(), from))
      const value = typeof args['unitValue'] === 'number' ? args['unitValue'] : 1
      return toOutcome(convertUnits(buildEngine(), value, from, to, args['terse'] === true, displayPrecisionOf(args)))
    }

    // ── 公式库（features/formulas）──
    case 'formulas': {
      const entries = formulaEntries()
      /**
       * 批量公式：逐条调用（一条失败不影响其它条）。
       *
       * 旧实现在批量里**吞掉未知 key 的警告**（T4-15）：单条会点名拼错，
       * 批量却静默。这里改为逐条走 callFormula，未知 key 由 evaluateFormula
       * 的校验抛出，只让那一条失败。
       */
      if (Array.isArray(args['formulas'])) {
        const items = args['formulas'] as unknown[]
        const lines: string[] = ['═══ 批量公式（' + items.length + ' 条）═══', '']
        let succeeded = 0
        let failed = 0
        for (const raw of items) {
          const item = typeof raw === 'string' ? { formula: raw } : (asRecord(raw) ?? {})
          const idText = typeof item['formula'] === 'string' ? item['formula'] : ''
          const label = typeof item['label'] === 'string' && item['label'] !== '' ? item['label'] : idText
          const overrides = asRecord(item['overrides']) ?? asRecord(item['params']) ?? {}
          try {
            const call = callFormula(entries, idText, buildEngine(), overrides, relations(), { displayPrecision: displayPrecisionOf(args), terse: true })
            succeeded += 1
            lines.push('  ✓ ' + label + ' = ' + call.result)
          } catch (error) {
            failed += 1
            const type = error !== null && typeof error === 'object' && typeof (error as { type?: unknown }).type === 'string' ? (error as { type: string }).type : 'error'
            const message = error instanceof Error ? error.message : String(error)
            lines.push('  ✗ ' + label + '（' + type + '）：' + message)
          }
        }
        lines.push('', '成功 ' + succeeded + '，失败 ' + failed)
        return {
          result: lines.join('\n'),
          value: { total: items.length, succeeded, failed },
          ...(failed > 0 ? { notice: '有 ' + failed + ' 条失败——逐条看上面的 ✗' } : {}),
        }
      }
      const query = typeof args['query'] === 'string' ? args['query'].trim() : ''
      /** 公式-链结构图：query="graph" 或 formulaGraph:true；焦点用 formulaFocus。 */
      /**
       * 链数值传导：query="chain" + formulaFocus=链 id。
       *
       * 只走 systems.json 里显式声明的 inputs 映射；缺初始参数会列出来。
       */
      if (query === 'chain') {
        const chainId = typeof args['formulaFocus'] === 'string' ? args['formulaFocus'] : (typeof args['traceTarget'] === 'string' ? args['traceTarget'] : '')
        if (chainId === '') throw new CalcError('missing_params', 'chain 需要 formulaFocus（链 id，如 sys-material）', '可查：' + formulaSystems().map((item) => item.id).join('、'))
        const initialRaw = asRecord(args['initial']) ?? asRecord(args['params']) ?? {}
        return toOutcome(runChainNumeric(formulaEntries(), formulaSystems() as never, chainId, buildEngine(), initialRaw as never, relations()))
      }

      /** 相邻公式：query="neighbors" + formulaFocus / formula。 */
      if (query === 'neighbors' || args['neighbors'] === true) {
        const focus = typeof args['formulaFocus'] === 'string' ? args['formulaFocus'] : (typeof args['formula'] === 'string' ? args['formula'] : '')
        if (focus === '') {
          throw new CalcError('missing_params', 'neighbors 需要 formulaFocus（公式 id）', '例如 {operation:"formulas", query:"neighbors", formulaFocus:"ideal_gas"}。')
        }
        const entry = formulaEntries().find((item) => item.id === focus || item.name === focus)
        if (entry === undefined) throw new CalcError('unknown_formula', '没有 id 为 "' + focus + '" 的公式', '用 formulas query 查可用的公式 id。')
        const hits = relations().neighbors(entry.id, 10)
        const lines: string[] = ['═══ 与 ' + entry.id + '（' + entry.name + '）相邻的公式 ═══', '', '  通过共用参数、共用常数与共性建立联系：', '']
        for (const hit of hits) {
          lines.push('  ' + hit.id.padEnd(28) + hit.name + '（' + hit.score + ' 分）')
          lines.push('    ' + relationReason(hit))
        }
        if (hits.length === 0) lines.push('  （没有相邻公式——它用的是独有参数，且没有同标签的节）')
        return {
          result: lines.join('\n'),
          value: { focus: entry.id, neighbors: hits },
        }
      }
      if (query === 'graph' || args['formulaGraph'] === true) {
        const focus = typeof args['formulaFocus'] === 'string' ? args['formulaFocus'] : (typeof args['traceTarget'] === 'string' ? args['traceTarget'] : undefined)
        return toOutcome(runFormulaGraph(entries, formulaSystems(), focus))
      }
      if (query === '') {
        throw new CalcError('missing_params', 'formulas 需要 query（检索词、公式 id、"sys:链id" 或 "graph"/"neighbors"/"chain"）', '例如 {operation:"formulas", query:"克莱伯"}。')
      }
      if (query.startsWith('sys')) {
        const system = formulaSystems().find((item) => item.id === query || item.id === query.replace(/^sys:?/, ''))
        if (system === undefined) {
          throw new CalcError('unknown_symbol', '没有 id 为 "' + query + '" 的体系链', '可查：' + formulaSystems().map((item) => item.id).join('、'))
        }
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
      if (id === '') {
        throw new CalcError('missing_params', 'formula 需要 formula（公式 id 或名称）', '例如 {operation:"formula", formula:"ideal_gas", params:{n:1,T:300}}；用 formulas query 查可用的公式。')
      }
      /** 反解：{formula:"ideal_strength", solveFor:"sigma", targetValue:1e8, params:{E:...}} */
      if (typeof args['solveFor'] === 'string' && args['solveFor'].trim() !== '') {
        const rangeRaw = asRecord(args['solveRange'])
        const range = rangeRaw !== undefined && typeof rangeRaw['min'] === 'number' && typeof rangeRaw['max'] === 'number' ? { min: rangeRaw['min'] as number, max: rangeRaw['max'] as number } : undefined
        const paramsRaw = asRecord(args['params'])
        const params: Record<string, number> = {}
        for (const [key, value] of Object.entries(paramsRaw ?? {})) if (typeof value === 'number' && Number.isFinite(value)) params[key] = value
        return toOutcome(
          solveFor(
            {
              formulaId: id,
              target: args['solveFor'].trim(),
              value: typeof args['targetValue'] === 'number' ? args['targetValue'] : Number.NaN,
              params,
              ...(range !== undefined ? { range } : {}),
            },
            formulaEntries(),
          ),
        )
      }
      const entry = formulaEntries().find((item) => item.id === id || item.name === id)
      if (entry === undefined) {
        throw new CalcError('unknown_formula', '没有 id 或名称为 "' + id + '" 的公式', '用 formulas query 查可用的公式 id。')
      }
      /**
       * 走「公式即函数」：参数契约 + 相邻公式。
       *
       * params 与 overrides 等价（老调用方写 overrides，新调用方写 params）。
       */
      const values = asRecord(args['params']) ?? asRecord(args['overrides']) ?? {}
      const call = callFormula(formulaEntries(), id, buildEngine(), values, relations(), {
        displayPrecision: displayPrecisionOf(args),
        terse: args['terse'] === true,
      })
      const neighborLine = call.neighbors.length > 0 ? '相邻公式：' + call.neighbors.slice(0, 4).map((hit) => hit.id + '（' + hit.reason + '）').join('；') : ''
      return {
        result: call.result,
        value: call.value !== null && typeof call.value === 'object' ? { ...(call.value as Record<string, unknown>), neighbors: call.neighbors } : { value: call.value, neighbors: call.neighbors },
        ...(call.notice !== undefined ? { notice: call.notice } : {}),
        ...(neighborLine !== '' ? { notice: (call.notice !== undefined ? call.notice + '\n' : '') + neighborLine } : {}),
      }
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
        what: typeof args['what'] === 'string' ? args['what'] : undefined,
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
      if (expression === '' && !Array.isArray(args['matrix']) && !Array.isArray(args['expressions'])) {
        throw new CalcError('missing_params', 'auto 需要 expression（表达式）或 matrix（矩阵）', '例如 {expression:"2+3*4"}；不确定时先调 help 看目录。')
      }
      if (expression !== '' && expression.includes('=') && !expression.includes('>') && !expression.includes('<')) {
        return dispatchNew('solve', args)
      }
      if (Array.isArray(args['matrix'])) return dispatchNew('matrix', args)
      return dispatchNew('evaluate', args)
    }

    default:
      return null
  }
}

/**
 * 参数归一：把「文档/直觉」的写法映射到内部字段。
 *
 * 反馈报告里最集中的痛点不是算错，而是**参数猜不到**：
 * solve 写 equation、ode 写 y0、chain 直接给 stages/raw、impact 写 from/to…
 * 这些别名在入口层统一收，比在 37 个 feature 里各写一遍稳。
 */
function normalizeArgs(raw: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = { ...raw }

  /** solve：equation / equations / expr → expression。 */
  if (args['expression'] === undefined) {
    if (typeof args['equation'] === 'string') args['expression'] = args['equation']
    else if (Array.isArray(args['equations'])) args['expression'] = (args['equations'] as unknown[]).join(',')
    else if (typeof args['expr'] === 'string') args['expression'] = args['expr']
  }

  /** world：嵌套 world 对象合并到顶层（显式顶层优先）。 */
  const worldObject = asRecord(args['world'])
  if (worldObject !== undefined) {
    for (const [key, value] of Object.entries(worldObject)) if (args[key] === undefined) args[key] = value
  }

  /** ode / recurrence：initial 允许数字、数组、y0。 */
  if (args['initial'] !== undefined && typeof args['initial'] !== 'object') {
    const expression = typeof args['expression'] === 'string' ? args['expression'] : ''
    /** 从 dy/dt = … 里取状态名；取不到就用 y / P。 */
    const stateMatch = /d\s*([A-Za-z_][A-Za-z0-9_]*)\s*\/\s*dt/.exec(expression)
    const stateName = stateMatch !== null ? stateMatch[1] : (args['recurrence'] !== undefined ? 'P' : 'y')
    args['initial'] = Array.isArray(args['initial']) ? { [stateName]: Number((args['initial'] as unknown[])[0]) } : { [stateName]: Number(args['initial']) }
  }
  if (args['initial'] === undefined && args['y0'] !== undefined) {
    args['initial'] = { y: Number(args['y0']) }
  }

  /** chain：顶层 stages/raw 收进 chain 对象。 */
  if (args['chain'] === undefined && (args['stages'] !== undefined || args['raw'] !== undefined)) {
    args['chain'] = { raw: args['raw'], stages: args['stages'] }
  }

  /** impact / trace：from 或 node → traceTarget。 */
  if (args['traceTarget'] === undefined) {
    if (typeof args['from'] === 'string') args['traceTarget'] = args['from']
    else if (typeof args['node'] === 'string') args['traceTarget'] = args['node']
  }

  return args
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

/** 关系索引（懒建一次）。 */
let relationIndex: RelationIndex | null = null

/**
 * 常数名集合（来自 constants-graph.json），含公式惯用别名。
 *
 * 常数表把玻尔兹曼常数记作 \`kB\`，而公式库里参数名惯写 \`k\`。
 * 不补别名的话，\`k\` 会被当成「共用参数」，关系图上「共用常数」这条边就丢了。
 */
function constantNames(): Set<string> {
  const rows = dataOf<Array<{ name: string }>>('constants', 'constants-graph.json', [])
  const names = new Set(rows.map((row) => row.name))
  names.add('k')
  names.add('mu_0')
  names.add('epsilon_0')
  return names
}

/** 取关系索引。 */
function relations(): RelationIndex {
  if (relationIndex === null) relationIndex = buildRelationIndex(formulaEntries(), constantNames())
  return relationIndex
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
  /** 老 operation，v3 以 derivation:impact 实现。 */
  'impact',
  'topology',
  /** 天文历表（astronomy-engine）。 */
  'astro',
  /** 目标驱动回溯（给目标 → 公式链）。 */
  'backtrace',
  /** 历史推演：时间序列 → 纪元划分。 */
  'history',
  /** 冲突/贡赋（Axelrod 贡赋模型）。 */
  'conflict',
  /** PDF/文档解析（来自实践文档 _tools 的整合）。 */
  'document',
  'auto',
] as const
