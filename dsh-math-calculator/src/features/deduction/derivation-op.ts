/**
 * `derivation` 的 op 实现：推演栈框架。
 *
 * 这不是又一种计算，而是把计算组织成可管理的方法论：
 * 展示推演栈、接口卡、无量纲化、单位重定义检测、敏感性、相图、检查表、七张表。
 *
 * ## 契约（修掉老实现的 A21/A43）
 *
 * - 未知子命令 → `unknown_subcommand`，并附可用列表（不能 ok=true 地回一段文本）；
 * - 缺参数 → `missing_params`，hint 里给可复制的完整调用。
 *
 * ## 子命令分批
 *
 * 本文件先实现**纯计算类**：stack / cards / dimensionless / units / sensitivity /
 * phase / checklist / chaos / tables / pipeline。
 * 依赖工作区档案的（archive/history/compare/diff/inherit）与依赖档案模板的
 * （whitepaper/trace/impact/graph/timeline/cost/fantasy/civilization/heatmap/
 * dead/observer/anchors/backSolve）在后续块接入，未接入时明确报 unknown_subcommand
 * 并说明"本分支尚未迁移"，不假装成功。
 *
 * @module dsh-math-calculator/features/deduction/derivation-op
 */

import { CalcError } from '../../core/errors.js'
import {
  STACK,
  INTERFACE_CARDS,
  CONSTRAINT_LABEL,
  CONFIDENCE_LABEL,
  VERDICT_LABEL,
  dimensionlessPack,
  detectUnitRedefinition,
  sensitivity,
  phaseSlice,
  buildChecklist,
  judgeRange,
  type ChecklistItem,
  type Verdict,
} from './derivation-stack.js'
import { generateWorld, type WorldDeps } from './world.js'
import { judgeDead, renderDead } from './dead-universe.js'
import { checkFlip, FLIP_CLAIMS } from './flip.js'
import { OBSERVERS, perceive, renderObserver } from './observer.js'
import { ANCHORS, solveAnchor, renderBackSolve, type AnchorKind } from './anchor-solve.js'
import { buildHeatmap, detectNarrowWindow, linspace } from './heatmap.js'
import { buildTimeline, renderTimeline } from './timeline.js'
import {
  buildDependencyGraph,
  layoutDependencyGraph,
  allNodeNames,
  traceTarget,
  impactOf,
  renderTrace,
  renderImpact,
} from './graph.js'
import { estimateTimeline, estimatePhase, estimateBackSolve, estimateSweep, renderCost } from './compute-budget.js'
import { buildWhitepaper, buildPromptCard, renderWhitepaper, renderPromptCard } from './whitepaper.js'
import { checkFields, computeCost, overlay, renderFantasy, type FantasyAbility } from './fantasy-layer.js'
import { runCivilization } from './civilization.js'
import { archiveVersion, compareVersions, readArchiveInput, renderCompare, renderHistory, type ArchiveVersion } from './derivation-archive.js'
import { affectedBy, checkInheritance, linkInherit, renderInherit, type InheritLink } from './inherit.js'
import { loadArchiveFile, saveArchiveFile, loadInheritFile, saveInheritFile } from '../../io/archive-store.js'

/** 已实现的子命令。 */
export const IMPLEMENTED_SUBCOMMANDS = [
  'stack',
  'cards',
  'dimensionless',
  'units',
  'sensitivity',
  'phase',
  'checklist',
  'chaos',
  'tables',
  'pipeline',
  'dead',
  'flip',
  'observer',
  'anchors',
  'backSolve',
  'heatmap',
  'timeline',
  'graph',
  'trace',
  'impact',
  'cost',
  'whitepaper',
  'fantasy',
  'civilization',
  'archive',
  'history',
  'compare',
  'diff',
  'inherit',
] as const

/** 尚未迁移的子命令（明确报错，不假装成功）。 */
export const PENDING_SUBCOMMANDS = [] as const

/** 注入的数据。 */
export interface DerivationDeps extends WorldDeps {}

/** 输出。 */
export interface DerivationOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 数字格式化。 */
function f(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs === 0) return '0'
  if (abs >= 1e6 || abs < 1e-3) return value.toExponential(3)
  return Number(value.toPrecision(5)).toString()
}

/** 混沌判定（纯函数，与天体/工作区无关）。 */
export function checkChaos(
  lyapunov: number,
  initialError = 1e-6,
  tolerance = 0.1,
  steps = 8,
): {
  chaotic: boolean
  lyapunov: number
  horizon: number
  spread: Array<{ t: number; low: number; high: number }>
  reason: string
  advice: string
} {
  const chaotic = lyapunov > 0
  const horizon = chaotic ? Math.log(tolerance / Math.max(initialError, 1e-15)) / lyapunov : Infinity
  const spread: Array<{ t: number; low: number; high: number }> = []
  if (chaotic && Number.isFinite(horizon)) {
    for (let index = 0; index < steps; index += 1) {
      const t = (horizon * 3 * index) / (steps - 1)
      const growth = initialError * Math.exp(lyapunov * t)
      spread.push(growth >= 1 ? { t, low: Number.NaN, high: Number.NaN } : { t, low: 1 - growth, high: 1 + growth })
    }
  }
  const reason = chaotic
    ? 'Lyapunov 指数 ' + lyapunov.toFixed(3) + ' > 0：初值误差每 ' + (1 / lyapunov).toFixed(2) +
      ' 个特征时间放大 e 倍。超过 ' + horizon.toFixed(1) + ' 个特征时间后，任何数值结果都不再可信。'
    : 'Lyapunov 指数 ' + lyapunov.toFixed(3) + ' 不大于 0：系统可预测，误差不会放大。'
  const advice = chaotic
    ? '不要给确定数值。改用区间（概率云）表达，并说明"在此尺度上不可预测"；若剧情需要确定结论，让它发生在 ' +
      horizon.toFixed(1) + ' 个特征时间之内。'
    : '可以给确定数值。'
  return { chaotic, lyapunov, horizon, spread, reason, advice }
}

/** 常见混沌系统的 Lyapunov 量级。 */
const CHAOS_LIBRARY = [
  { name: '大气涡流（天气）', lyapunov: 1.0, note: '约 1/天；两周后天气不可预测' },
  { name: '三体轨道', lyapunov: 0.5, note: '轨道在数十个周期后发散' },
  { name: '湍流', lyapunov: 2.0, note: '极快，只在粘性尺度内可算' },
  { name: '捕食者-猎物生态', lyapunov: 0.1, note: '长期震荡不可精确预测' },
  { name: '气候长期演化', lyapunov: 0.01, note: '千年尺度可估，万年以上不可' },
]

/** 检查表渲染。 */
function renderChecklist(items: ChecklistItem[]): string {
  const lines = ['═══ 检查表（13 项）═══', '']
  for (const item of items) lines.push('  ' + (item.pass ? '✓' : '✗') + ' ' + item.name + (item.note ? ' —— ' + item.note : ''))
  const failed = items.filter((item) => !item.pass).length
  lines.push('')
  lines.push(failed === 0 ? '全部通过。' : failed + ' 项待填，补全后再发布。')
  return lines.join('\n')
}

/** 一层是否无硬失败（pending 不算失败）。 */
function noHardFail(items: LayerResult['items']): boolean {
  return !items.some((item) => item.verdict === 'forbidden' || item.verdict === 'marginal')
}

/** 一层的判定结果。 */
interface LayerResult {
  layer: string
  name: string
  items: Array<{ card: string; value: number; unit: string; verdict: Verdict; note: string }>
  allAllowed: boolean
}

/**
 * 正向推演链路：把 world 的结果逐层映射成接口卡判定。
 *
 * 只映射世界结果里**确实算出来**的量，不为了凑满卡片去编数。
 */
function runPipeline(profile: ReturnType<typeof generateWorld>): { layers: LayerResult[]; verdict: Verdict; advice: string[] } {
  const cardOf = (layer: string, name: string) => (INTERFACE_CARDS[layer] ?? []).find((card) => card.name === name)
  const judge = (layer: string, name: string, value: number, unit: string, note: string): LayerResult['items'][number] => {
    const card = cardOf(layer, name)
    const verdict = card ? judgeRange(value, card) : 'pending'
    return { card: name, value, unit, verdict, note }
  }
  const layers: LayerResult[] = []

  // P1：化学窗口（键能）+ 原子尺度
  const bondEnergy = profile.life.chemistry.bondEnergyEv
  const p1 = [
    judge('P1', '键能范围', bondEnergy, 'eV', '来自化学窗口计算（键能 ∝ α²）'),
  ]
  layers.push({ layer: 'P1', name: '微观有效层', items: p1, allAllowed: noHardFail(p1) })

  // P3：身高大气标高比（有明确公式）；骨骼强度体重比缺输入 → pending，不编
  const heightScaleRatio = 1.8 / profile.atmosphere.scaleHeightM
  const p3 = [
    { card: '骨骼强度体重比', value: Number.NaN, unit: '无量纲', verdict: 'pending' as Verdict, note: 'world 没有骨骼强度与体重输入，本层不判（不替作者编）' },
    judge('P3', '身高大气标高比', heightScaleRatio, '无量纲', '1.8m 眼高 / 大气标高'),
  ]
  layers.push({ layer: 'P3', name: '宏观体感层', items: p3, allAllowed: noHardFail(p3) })

  // P4：大气逃逸率（用热速度比作为量级代理）
  const thermalSpeed = Math.sqrt((3 * 8.314462618 * profile.temperature.surfaceMeanK) / profile.atmosphere.molarMass)
  const escapeRatio = profile.planet.escapeVelocity / thermalSpeed
  const p4 = [judge('P4', '大气逃逸率', escapeRatio > 6 ? 0 : 1e4, 'kg/s', '逃逸速度/热速度 ' + escapeRatio.toFixed(1) + '（>6 视为保住大气）')]
  layers.push({ layer: 'P4', name: '行星环境层', items: p4, allAllowed: noHardFail(p4) })

  // P5：恒星寿命与峰值波长
  const lifetimeYears = profile.stellar.lifetimeGyr * 1e9
  const peakM = profile.stellar.peakWavelengthNm * 1e-9
  const p5 = [
    judge('P5', '恒星寿命', lifetimeYears, 'yr', '主序寿命（经验关系）'),
    judge('P5', '辐射谱峰值波长', peakM, 'm', '维恩位移'),
  ]
  layers.push({ layer: 'P5', name: '恒星天文层', items: p5, allAllowed: noHardFail(p5) })

  const worst = layers.find((layer) => !layer.allAllowed)
  const verdict: Verdict = worst ? 'marginal' : 'allowed'
  const advice: string[] = []
  if (worst) {
    advice.push('第一处不通过的是 ' + worst.layer + '（' + worst.name + '）：' + worst.items.find((item) => item.verdict !== 'allowed')?.card)
    advice.push('先改造成这一层的输入参数（重力/大气/恒星），再看下游。')
  } else {
    advice.push('四层都在允许区；剩余判断（生命、文明）交给作者。')
  }
  // 化学窗口是硬否决时单独说
  if (profile.life.gate.verdict === 'excluded') advice.push('生命闸门给了硬否决：' + profile.life.gate.note)
  return { layers, verdict, advice }
}

/**
 * 执行 derivation。
 *
 * @param input - 子命令与参数（沿用老插件的参数名）
 * @param deps - 注入的数据（常数与光谱型表，pipeline 需要）
 * @returns 渲染结果
 */
export function runDerivation(input: Record<string, unknown>, deps: DerivationDeps = {}): DerivationOutcome {
  const sub = typeof input['derivation'] === 'string' && input['derivation'].trim() !== '' ? input['derivation'].trim() : 'stack'
  const lines: string[] = []
  const value: Record<string, unknown> = { subcommand: sub }

  if (sub === 'stack') {
    lines.push('═══ 推演栈（8 层）═══', '')
    for (const layer of STACK) {
      lines.push('【' + layer.id + '】' + layer.name)
      lines.push('  核心问题：' + layer.question)
      lines.push('  输入：' + layer.inputs.join(' / '))
      lines.push('  下游接口（' + layer.outputs.length + ' 个）：' + layer.outputs.join(' / '))
      lines.push('  硬约束/失败模式：' + layer.failureModes.join(' / '))
      lines.push('')
    }
    lines.push('贯穿层：单位与观测者 / 不确定性与版本 / 时间与历史路径 / 约束分级')
    lines.push('提示：多数世界只需 P1—P4 + 少量 P5，不必全宇宙展开。')
    value['layers'] = STACK.map((layer) => layer.id)
  } else if (sub === 'cards') {
    const which = typeof input['layer'] === 'string' ? input['layer'].toUpperCase() : ''
    const keys = which !== '' && INTERFACE_CARDS[which] !== undefined ? [which] : Object.keys(INTERFACE_CARDS)
    lines.push('═══ 接口卡 ═══', '')
    for (const key of keys) {
      const cards = INTERFACE_CARDS[key]
      lines.push('【' + key + '】共 ' + cards.length + ' 个接口变量')
      for (const card of cards) {
        lines.push('  · ' + card.name + '  [' + card.unit + ']  约束=' + CONSTRAINT_LABEL[card.kind] + '  置信度=' + CONFIDENCE_LABEL[card.confidence])
        lines.push('    定义：' + card.definition)
        lines.push('    依赖：' + card.dependsOn.join(', ') + '  敏感于：' + card.sensitiveTo.join(', '))
        if (card.range.allowed) lines.push('    允许区间：' + f(card.range.allowed[0]) + ' — ' + f(card.range.allowed[1]))
        if (card.range.marginal) lines.push('    边缘区间：' + f(card.range.marginal[0]) + ' — ' + f(card.range.marginal[1]))
        lines.push('    叙事影响：' + card.narrativeImpact.join(', '))
        if (card.notes) lines.push('    备注：' + card.notes)
      }
      lines.push('')
    }
    value['layers'] = keys
  } else if (sub === 'dimensionless') {
    const packs = dimensionlessPack(deps.constants ?? {})
    lines.push('═══ 无量纲参数包（真正该追踪的量）═══', '')
    lines.push('  名称          含义                            现实值        当前值        偏差')
    for (const pack of packs) {
      lines.push(
        '  ' + pack.name.padEnd(14) + pack.meaning.padEnd(32) + f(pack.standard).padStart(13) + '  ' +
          f(pack.current).padStart(13) + '  ' + (pack.deviation === 0 ? '—' : (pack.deviation * 100).toFixed(2) + '%'),
      )
    }
    lines.push('')
    lines.push('要点：同时缩放所有质量通常只是换了单位；真正变化要看这些比值。')
    value['packs'] = packs
  } else if (sub === 'units') {
    const changes = (input['unitScales'] ?? {}) as Record<string, number>
    const verdict = detectUnitRedefinition(changes)
    lines.push('═══ 单位重定义检测 ═══', '')
    if (Object.keys(changes).length === 0) {
      lines.push('用法：传 unitScales，例如 {"unitScales":{"mass":2}} 表示"所有质量 ×2"。')
    } else {
      lines.push('  缩放：' + JSON.stringify(changes))
      lines.push('  判定：' + (verdict.isUnitRedefinition ? '是单位重定义（非物理变化）' : '是真实物理变化'))
      lines.push('  理由：' + verdict.reason)
    }
    value['verdict'] = verdict
  } else if (sub === 'sensitivity') {
    const base = typeof input['sensitivityBase'] === 'number' ? input['sensitivityBase'] : 9.80665
    const exponent = typeof input['sensitivityExponent'] === 'number' ? input['sensitivityExponent'] : 3
    const report = sensitivity((x: number) => x ** exponent, base)
    lines.push('═══ 敏感性分析 ═══', '')
    lines.push('  模型：结果 = 输入^' + exponent + '，基线 ' + f(base))
    for (const item of report.items) {
      lines.push('  ' + item.parameter.padEnd(10) + ' 结果=' + f(item.perturbed) + '  相对变化=' + (item.relativeChange * 100).toFixed(2) + '%  ' + item.verdict)
    }
    lines.push('')
    lines.push(report.fineTuningWarning ? '⚠ 微调警告：结论对输入高度敏感，允许区间可能极窄。' : '✓ 结论基本稳定。')
    value['report'] = report
  } else if (sub === 'phase') {
    const slice = phaseSlice(
      (g: number, size: number): Verdict => {
        const ratio = 500 / (g * Math.max(size, 0.01))
        if (ratio >= 3 && ratio <= 300) return 'allowed'
        if (ratio >= 1.5 && ratio <= 1000) return 'marginal'
        return 'forbidden'
      },
      [0.2, 3],
      [0.1, 100],
      7,
    )
    lines.push('═══ 相图：重力 × 生物尺寸 → 骨骼强度体重比 ═══', '')
    lines.push('  g\\尺寸 ' + slice.xs.map((x) => f(x).padStart(9)).join(''))
    for (let yi = 0; yi < slice.ys.length; yi += 1) {
      const row = slice.grid[yi]
        .map((v) => (v === 'allowed' ? '允许' : v === 'marginal' ? '边缘' : v === 'forbidden' ? '禁止' : '待定').padStart(9))
        .join('')
      lines.push('  ' + f(slice.ys[yi]).padStart(7) + row)
    }
    lines.push('')
    lines.push('  统计：允许 ' + slice.counts.allowed + ' / 边缘 ' + slice.counts.marginal + ' / 禁止 ' + slice.counts.forbidden)
    lines.push('  要点：不追求单点答案——先看哪些区域存在解。')
    value['slice'] = slice
  } else if (sub === 'checklist') {
    const items = buildChecklist()
    lines.push(renderChecklist(items))
    value['checklist'] = items
  } else if (sub === 'chaos') {
    const lyapunov = typeof input['lyapunov'] === 'number' ? input['lyapunov'] : 1.0
    const verdict = checkChaos(lyapunov)
    lines.push('═══ 混沌系统拦截器 ═══', '')
    lines.push('  Lyapunov 指数：' + lyapunov.toFixed(3), '')
    if (verdict.chaotic) {
      lines.push('  【判定】进入混沌区——不给确定数值')
      lines.push('  可预测时间：' + verdict.horizon.toFixed(1) + ' 个特征时间', '')
      lines.push('  【概率云】随时间扩张的不确定度：')
      for (const point of verdict.spread) {
        if (Number.isNaN(point.low)) lines.push('    t=' + point.t.toFixed(1) + '  不可预测（误差已超过 100%）')
        else lines.push('    t=' + point.t.toFixed(1) + '  区间 [' + point.low.toFixed(3) + ', ' + point.high.toFixed(3) + ']')
      }
    } else {
      lines.push('  【判定】可预测，可以给确定数值')
    }
    lines.push('', '  ' + verdict.reason, '  ' + verdict.advice, '', '【常见混沌系统的 Lyapunov 量级】')
    for (const item of CHAOS_LIBRARY) lines.push('  ' + item.name.padEnd(20) + item.lyapunov.toFixed(2).padStart(6) + '  ' + item.note)
    value['chaos'] = verdict
  } else if (sub === 'tables') {
    lines.push('═══ 七张表（固定输出格式）═══', '')
    lines.push('  1. 项目卡     推演类型 / 范围 / 时间窗口 / 观测者 / 优先级 / 不推演什么')
    lines.push('  2. 变更清单   常数 / 对称性 / 粒子谱 / 初条件 / 历史路径，各标处理方式')
    lines.push('  3. 接口卡     P1—P6 每层 5—10 个变量，带区间与约束类型')
    lines.push('  4. 约束表     硬约束 / 软约束 / 叙事约束')
    lines.push('  5. 敏感性表   一阶扰动 / 阈值跨越 / 反馈放大 / 时间尺度错配')
    lines.push('  6. 叙事锚点表 锚点 / 硬需求 / 可妥协项 / 反推接口 / 反推窗口 / 冲突处理')
    lines.push('  7. 版本记录   版本号 / 变更 / 受影响接口 / 结论变化 / 待定项 / 下轮任务')
    value['tables'] = 7
  } else if (sub === 'pipeline') {
    const worldParams = (input['world'] ?? {}) as Record<string, unknown>
    const profile = generateWorld(worldParams as never, { constants: deps.constants, starClasses: deps.starClasses })
    const report = runPipeline(profile)
    lines.push('═══ 正向推演链路（P1 → P5）═══', '')
    for (const layer of report.layers) {
      lines.push('【' + layer.layer + '】' + layer.name + (layer.allAllowed ? ' —— 全通' : ' —— 有问题'))
      for (const item of layer.items) {
        lines.push('  ' + VERDICT_LABEL[item.verdict].padEnd(6) + item.card.padEnd(16) + f(item.value).padStart(12) + ' ' + item.unit + '  ' + item.note)
      }
      lines.push('')
    }
    lines.push('总结论：' + VERDICT_LABEL[report.verdict])
    for (const line of report.advice) lines.push('  · ' + line)
    value['pipeline'] = report
  } else if (sub === 'dead') {
    const worldParams = (input['world'] ?? {}) as Record<string, unknown>
    const profile = generateWorld(worldParams as never, { constants: deps.constants, starClasses: deps.starClasses })
    const verdict = judgeDead(profile as unknown as Record<string, unknown>)
    lines.push(renderDead(verdict))
    lines.push('')
    lines.push('─── 给作者的话 ───')
    lines.push('死寂是被判定的设定结果，不是错误。上面每条都给了「若想要物质世界」的调整方向；')
    lines.push('若你就是要写一个没有常规物质的宇宙，把它当设定本身即可。')
    value['dead'] = verdict
  } else if (sub === 'flip') {
    const claimId = typeof input['flipClaim'] === 'string' ? input['flipClaim'] : 'rocket'
    const epsilon = typeof input['flipEpsilon'] === 'number' ? input['flipEpsilon'] : 0.2
    const base = typeof input['flipBase'] === 'number' ? input['flipBase'] : 1
    const chosen = FLIP_CLAIMS.find((claim) => claim.id === claimId)
    if (!chosen) {
      throw new CalcError(
        'invalid_argument',
        '不认识的判据「' + claimId + '」',
        '可用判据：' + FLIP_CLAIMS.map((claim) => claim.id + '（' + claim.label + '）').join(' / ') + '。',
      )
    }
    if (!(base > 0)) {
      throw new CalcError('invalid_argument', 'flipBase 必须是正数（收到 ' + String(base) + '）', '倍率基线通常取 1（地球）。')
    }
    const report = checkFlip(chosen.evaluate, chosen.judge, base, { epsilon, claim: chosen.label })
    lines.push('═══ 结论翻转判定：' + chosen.label + ' ═══', '')
    lines.push('  判据：' + chosen.formula)
    lines.push('  基线输入 ' + f(base) + ' → 判据值 ' + f(report.baseValue) + ' → ' + (report.baseHolds ? '成立' : '不成立'), '')
    lines.push('【扰动 ±' + (epsilon * 100).toFixed(0) + '%】')
    for (const probe of report.probes) {
      lines.push(
        '  ' + (probe.direction < 0 ? '下调' : '上调').padEnd(4) + ' 输入=' + f(probe.input).padEnd(12) +
        ' 判据值=' + f(probe.value).padEnd(12) + ' 数值变化=' + (probe.relativeChange * 100).toFixed(2) + '%' +
        ' ' + (probe.flipped ? '✗ 结论翻转' : '○ 结论不变'),
      )
    }
    lines.push('', '【判定】' + (report.severity === 'critical' ? '踩线' : report.severity === 'fragile' ? '余量薄' : '稳'))
    lines.push('  ' + report.verdict)
    lines.push('', '  说明：数值变化率不能用来判翻转——变 1.8% 也可能让「能/不能」颠倒。')
    value['flip'] = report
    value['claim'] = { id: chosen.id, label: chosen.label, formula: chosen.formula }
  } else if (sub === 'observer') {
    const kind = typeof input['observerKind'] === 'string' ? input['observerKind'] : 'human'
    const observer = OBSERVERS.find((item) => item.kind === kind)
    if (!observer) {
      throw new CalcError(
        'invalid_argument',
        '不认识的观测者「' + kind + '」',
        '可选：' + OBSERVERS.map((item) => item.kind + '（' + item.label + '）').join(' / ') + '。',
      )
    }
    const worldParams = (input['world'] ?? {}) as Record<string, unknown>
    const profile = generateWorld(worldParams as never, { constants: deps.constants, starClasses: deps.starClasses })
    const gravity = profile.planet.surfaceGravity
    const scaleHeight = profile.atmosphere.scaleHeightM
    lines.push(renderObserver(observer, gravity, scaleHeight))
    value['observer'] = { kind, metrics: perceive(observer, gravity, scaleHeight) }
  } else if (sub === 'anchors') {
    const worldParams = (input['world'] ?? {}) as Record<string, unknown>
    lines.push('═══ 可反推的叙事锚点 ═══', '')
    lines.push('  锚点 id              名称                单位        提示')
    for (const anchor of ANCHORS) {
      lines.push('  ' + anchor.kind.padEnd(22) + anchor.label.padEnd(20) + anchor.unit.padEnd(12) + anchor.hint)
    }
    lines.push('')
    lines.push('用法：{"derivation":"backSolve","anchor":"creatureHeight","anchorValue":50}')
    value['anchors'] = ANCHORS
    void worldParams
  } else if (sub === 'backSolve') {
    const anchorId = typeof input['anchor'] === 'string' ? input['anchor'].trim() : ''
    const anchorValue = typeof input['anchorValue'] === 'number' && Number.isFinite(input['anchorValue']) ? input['anchorValue'] : 0
    if (anchorId === '' || anchorValue <= 0) {
      throw new CalcError(
        'missing_params',
        'derivation 子命令 backSolve 缺少必需参数',
        '需要 anchor（锚点 id）与 anchorValue（正数）。锚点清单见 derivation="anchors"。' +
          '可复制的调用：' + JSON.stringify({ operation: 'derivation', derivation: 'backSolve', anchor: 'creatureHeight', anchorValue: 50 }) +
          '。可用 anchor：' + ANCHORS.map((anchor) => anchor.kind).join(' / ') + '。',
      )
    }
    if (!ANCHORS.some((anchor) => anchor.kind === anchorId)) {
      throw new CalcError(
        'invalid_argument',
        '不认识的锚点「' + anchorId + '」',
        '可用锚点：' + ANCHORS.map((anchor) => anchor.kind + '（' + anchor.label + '）').join(' / ') + '。',
      )
    }
    const worldParams = (input['world'] ?? {}) as Record<string, unknown>
    const solution = solveAnchor(anchorId as AnchorKind, anchorValue, worldParams, { constants: deps.constants, starClasses: deps.starClasses })
    lines.push(renderBackSolve(solution))
    value['solution'] = solution
  } else if (sub === 'heatmap') {
    const massValues = linspace(0.2, 5, 9)
    const orbitValues = linspace(0.5, 2.5, 9)
    const map = buildHeatmap(
      massValues,
      orbitValues,
      (mass, orbit) => {
        const profile = generateWorld({ planetMass: mass, orbitAU: orbit }, { constants: deps.constants, starClasses: deps.starClasses })
        const verdict = judgeDead(profile as unknown as Record<string, unknown>)
        const level = verdict.level === 'alive' ? 'ok' : verdict.level === 'marginal' ? 'warn' : 'danger'
        return { level, note: '质量 ' + mass.toFixed(2) + ' / 轨道 ' + orbit.toFixed(2) + ' AU → ' + verdict.summary }
      },
      { x: '行星质量（地球=1）', y: '轨道距离（AU）' },
    )
    const narrow = detectNarrowWindow(map.cells)
    lines.push('═══ 相图热力图 ═══', '')
    lines.push('  X：' + map.xLabel + '（' + massValues.length + ' 档）')
    lines.push('  Y：' + map.yLabel + '（' + orbitValues.length + ' 档）', '')
    lines.push('  允许 ' + map.summary.ok + ' / 边缘 ' + map.summary.warn + ' / 禁止 ' + map.summary.danger, '')
    lines.push('  ' + narrow.note, '')
    lines.push('（本插件没有界面。完整网格在 value.heatmap，可自行渲染或转成文字。）')
    value['heatmap'] = { ...map, narrow }
  } else if (sub === 'timeline') {
    const worldParams = (input['world'] ?? {}) as Record<string, unknown>
    const config = {
      fromGyr: typeof input['timelineFrom'] === 'number' ? input['timelineFrom'] : 0,
      toGyr: typeof input['timelineTo'] === 'number' ? input['timelineTo'] : 10,
      steps: typeof input['timelineSteps'] === 'number' ? input['timelineSteps'] : 11,
      starMassSun: typeof worldParams['starMass'] === 'number' ? (worldParams['starMass'] as number) : 1,
      orbitAU: typeof worldParams['orbitAU'] === 'number' ? (worldParams['orbitAU'] as number) : 1,
    }
    const timeline = buildTimeline(config)
    lines.push(renderTimeline(timeline))
    value['timeline'] = timeline
  } else if (sub === 'graph') {
    const focus = typeof input['traceTarget'] === 'string' ? input['traceTarget'] : undefined
    const edges = buildDependencyGraph()
    const layout = layoutDependencyGraph(edges, focus)
    lines.push('═══ 依赖图 ═══', '')
    lines.push('  节点 ' + layout.nodes.length + ' 个，连线 ' + layout.edges.length + ' 条，共 ' + (layout.maxDepth + 1) + ' 层')
    if (focus !== undefined) lines.push('  焦点：' + focus + (layout.focusNode ? '' : '（图中没有这个节点）'))
    lines.push('', '（本插件没有界面。完整坐标在 value.graph，可自行渲染或转成文字。）')
    value['graph'] = layout
  } else if (sub === 'trace') {
    const target = typeof input['traceTarget'] === 'string' ? input['traceTarget'].trim() : ''
    const edges = buildDependencyGraph()
    const names = [...allNodeNames(edges)].sort()
    if (target === '') {
      lines.push('═══ 可溯源的量（共 ' + names.length + ' 个）═══', '')
      for (let index = 0; index < names.length; index += 3) lines.push('  ' + names.slice(index, index + 3).map((name) => name.padEnd(22)).join(''))
      lines.push('', '用法：{"derivation":"trace","traceTarget":"建筑高度上限"}')
      value['nodes'] = names
    } else {
      const result = traceTarget(target, edges)
      lines.push(renderTrace(result))
      value['trace'] = result
    }
  } else if (sub === 'impact') {
    const target = typeof input['traceTarget'] === 'string' ? input['traceTarget'].trim() : ''
    const edges = buildDependencyGraph()
    const names = [...allNodeNames(edges)].sort()
    if (target === '') {
      throw new CalcError(
        'missing_params',
        'derivation 子命令 impact 缺少 traceTarget（要改的量名）',
        '可查的量共 ' + names.length + ' 个，前 12 个：' + names.slice(0, 12).join(' · ') + '。完整清单用 derivation="trace"。',
      )
    }
    if (!names.includes(target)) {
      throw new CalcError('unknown_symbol', '依赖图里没有「' + target + '」', '可查的量：' + names.slice(0, 20).join(' · ') + (names.length > 20 ? ' …' : '') + '。')
    }
    const result = impactOf(target, edges)
    lines.push(renderImpact(target, result))
    value['impact'] = result
  } else if (sub === 'cost') {
    const kind = typeof input['costKind'] === 'string' ? input['costKind'] : 'timeline'
    let estimate
    if (kind === 'phase') {
      estimate = estimatePhase(typeof input['costX'] === 'number' ? input['costX'] : 50, typeof input['costY'] === 'number' ? input['costY'] : 50)
    } else if (kind === 'backsolve') {
      estimate = estimateBackSolve(typeof input['costIterations'] === 'number' ? input['costIterations'] : 40)
    } else if (kind === 'sweep') {
      estimate = estimateSweep(typeof input['costCombos'] === 'number' ? input['costCombos'] : 1000)
    } else {
      estimate = estimateTimeline(typeof input['timelineSteps'] === 'number' ? input['timelineSteps'] : 11, input['costWithPipeline'] === true)
    }
    lines.push(renderCost(estimate))
    value['cost'] = estimate
  } else if (sub === 'whitepaper') {
    const worldParams = (input['world'] ?? {}) as Record<string, unknown>
    const paper = buildWhitepaper(worldParams, { constants: deps.constants, starClasses: deps.starClasses })
    if (input['whitepaperMode'] === 'prompt') {
      const card = buildPromptCard(paper)
      lines.push(renderPromptCard(card))
      value['promptCard'] = card
    } else {
      lines.push(renderWhitepaper(paper))
    }
    value['whitepaper'] = paper
  } else if (sub === 'fantasy') {
    const raw = input['fantasyAbility']
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new CalcError(
        'missing_params',
        'derivation 子命令 fantasy 缺少 fantasyAbility（幻想能力定义）',
        '需要 { name, label, source, efficiency, costPerUnit, powerLimit, boosts, meaning }。' +
          '三种常见来源：metabolism（自身代谢）/ ambient-field（环境场）/ artifact（器物）/ external（外部注入）。',
      )
    }
    const ability = raw as unknown as FantasyAbility
    const problems = checkFields(ability)
    if (problems.length > 0) {
      throw new CalcError(
        'invalid_argument',
        'fantasyAbility 字段不完整，算不了：' + problems.join('；'),
        '补齐 name / label / efficiency（>0）/ powerLimit（>0）后即可计算。',
      )
    }
    const demand = typeof input['fantasyDemand'] === 'number' ? input['fantasyDemand'] : 1000
    const physical = typeof input['fantasyPhysical'] === 'number' ? input['fantasyPhysical'] : 100
    const bodyArea = typeof input['fantasyBodyArea'] === 'number' ? input['fantasyBodyArea'] : 1.8
    lines.push(renderFantasy(ability, demand, physical, bodyArea))
    value['fantasy'] = overlay(physical, ability, demand)
    value['cost'] = computeCost(overlay(physical, ability, demand).fantasy * ability.costPerUnit, bodyArea)
  } else if (sub === 'civilization') {
    const worldParams = (input['world'] ?? {}) as Record<string, unknown>
    const civ = runCivilization(worldParams)
    lines.push('═══ 宏观文明推演 ═══', '')
    const groups: Array<[string, string]> = [['energy', '4.1 能量与热力学'], ['material', '4.2 材料与结构'], ['transport', '4.3 空间与交通']]
    for (const [category, label] of groups) {
      const items = civ.limits.filter((item) => item.category === category)
      if (items.length === 0) continue
      lines.push('【' + label + '】')
      for (const item of items) {
        lines.push('  ' + item.name.padEnd(22) + f(item.value).padStart(12) + ' ' + item.unit)
        lines.push('    依据：' + item.basis)
        if (item.breakthrough) lines.push('    突破方向：' + item.breakthrough)
      }
      lines.push('')
    }
    lines.push('【4.4 技术树】被物理锁死或放开的分支')
    for (const item of civ.tech) {
      const mark = item.status === 'open' ? '开放' : item.status === 'conditional' ? '有条件' : '锁死'
      lines.push('  ' + mark.padEnd(6) + item.branch.padEnd(18) + item.reason)
      if (item.requirement) lines.push('         需要：' + item.requirement)
    }
    const eco = civ.limits.find((item) => item.name === '生态承载力')
    if (eco) {
      lines.push('', '  生态承载力：' + f(eco.value) + ' 人（【量级】）')
      if (eco.breakthrough) lines.push('    突破方向：' + eco.breakthrough)
    }
    lines.push('', '统计：开放 ' + civ.summary.open + ' / 有条件 ' + civ.summary.conditional + ' / 锁死 ' + civ.summary.locked)
    value['civilization'] = civ
  } else if (sub === 'archive') {
    const workspace = typeof input['workspace'] === 'string' && input['workspace'].trim() !== '' ? input['workspace'].trim() : 'default'
    const { world, note } = readArchiveInput(input)
    const book = loadArchiveFile<ArchiveVersion>(workspace)
    const { version, versions } = archiveVersion(book.versions, world, { constants: deps.constants, starClasses: deps.starClasses }, note)
    saveArchiveFile(workspace, versions)
    lines.push('═══ 已归档（' + version.version + '）═══', '')
    lines.push('  工作区：' + workspace)
    lines.push('  版本：' + version.version + '（共 ' + versions.length + ' 版）')
    lines.push('  世界参数：' + (Object.keys(world).length > 0 ? JSON.stringify(world) : '（地球默认）'))
    lines.push('  重力 ' + version.physical.gravityEarth.toFixed(2) + ' g，均温 ' + version.physical.meanTempC.toFixed(0) + '°C，判定 ' + version.verdict.deadLevel)
    lines.push('')
    lines.push('换工作区会看到各自的历史；用 derivation="history" 查看，用 "compare" 对比两版。')
    value['archive'] = version
    value['total'] = versions.length
  } else if (sub === 'history') {
    const workspace = typeof input['workspace'] === 'string' && input['workspace'].trim() !== '' ? input['workspace'].trim() : 'default'
    const book = loadArchiveFile<ArchiveVersion>(workspace)
    lines.push(renderHistory(book.versions))
    value['versions'] = book.versions
  } else if (sub === 'compare') {
    const workspace = typeof input['workspace'] === 'string' && input['workspace'].trim() !== '' ? input['workspace'].trim() : 'default'
    const book = loadArchiveFile<ArchiveVersion>(workspace)
    const from = typeof input['compareFrom'] === 'string' ? input['compareFrom'] : ''
    if (from === '') {
      const known = book.versions.map((item) => item.version)
      throw new CalcError(
        'missing_params',
        'derivation 子命令 compare 缺少 compareFrom（起始版本）',
        known.length === 0
          ? '这个工作区还没有归档版本。先存一版：' + JSON.stringify({ operation: 'derivation', derivation: 'archive' }) + '，改点东西后再存一版，然后对比。'
          : '已有版本：' + known.join(' · ') + '。示例：' + JSON.stringify({ operation: 'derivation', derivation: 'compare', compareFrom: known[0] }),
      )
    }
    const result = compareVersions(book.versions, from, typeof input['compareTo'] === 'string' ? input['compareTo'] : undefined)
    if (!result.ok) throw new CalcError('invalid_argument', result.message, '用 derivation="history" 查看已有版本。')
    lines.push(renderCompare(result))
    value['diff'] = result
  } else if (sub === 'diff') {
    const workspace = typeof input['workspace'] === 'string' && input['workspace'].trim() !== '' ? input['workspace'].trim() : 'default'
    const book = loadArchiveFile<ArchiveVersion>(workspace)
    const aName = typeof input['diffA'] === 'string' ? input['diffA'].trim() : ''
    const bName = typeof input['diffB'] === 'string' ? input['diffB'].trim() : ''
    if (aName === '' || bName === '') {
      throw new CalcError(
        'missing_params',
        'derivation 子命令 diff 缺少 diffA 与 diffB（要对比的两个版本号，如 v1 与 v2）',
        '已有版本：' + (book.versions.map((item) => item.version).join(' · ') || '（还没有归档）') + '。' +
          '示例：' + JSON.stringify({ operation: 'derivation', derivation: 'diff', diffA: 'v1', diffB: 'v2' }),
      )
    }
    const result = compareVersions(book.versions, aName, bName)
    if (!result.ok) throw new CalcError('invalid_argument', result.message, '用 derivation="history" 查看已有版本。')
    lines.push(renderCompare(result))
    value['diff'] = result
  } else if (sub === 'inherit') {
    const workspace = typeof input['workspace'] === 'string' && input['workspace'].trim() !== '' ? input['workspace'].trim() : 'default'
    const store = loadInheritFile<InheritLink>(workspace)
    const derived = typeof input['inheritDerived'] === 'string' ? input['inheritDerived'].trim() : ''
    const base = typeof input['inheritBase'] === 'string' ? input['inheritBase'].trim() : ''
    if (derived !== '' && base !== '') {
      const tables = Array.isArray(input['tableNames']) ? (input['tableNames'] as unknown[]).map((item) => String(item)) : [derived, base]
      const result = linkInherit(store.links, derived, base, tables)
      if (!result.ok) throw new CalcError('invalid_argument', result.message, '表名要与已存在的表一致；不能继承自己。')
      saveInheritFile(workspace, result.links)
      lines.push(result.message)
      value['link'] = result
    } else {
      const tables = Array.isArray(input['tableNames']) ? (input['tableNames'] as unknown[]).map((item) => String(item)) : Array.from(new Set(store.links.flatMap((link) => [link.derived, link.base])))
      const findings = input['inheritCheck'] === true ? checkInheritance(store.links, tables) : []
      lines.push(renderInherit(store.links, findings))
      if (input['inheritSync'] === true) {
        const base = typeof input['inheritBase'] === 'string' ? input['inheritBase'] : ''
        const affected = affectedBy(store.links, base)
        lines.push('', '【同步】改 ' + (base || '任意基线') + ' 会影响：' + (affected.join('、') || '（无）'))
        value['sync'] = { affected }
      }
      value['links'] = store.links
    }
  } else {
    const all = [...IMPLEMENTED_SUBCOMMANDS, ...PENDING_SUBCOMMANDS]
    if ((PENDING_SUBCOMMANDS as readonly string[]).includes(sub)) {
      throw new CalcError(
        'unknown_subcommand',
        '子命令 "' + sub + '" 在本分支尚未迁移（老插件里有，新实现未接）',
        '本分支已实现：' + IMPLEMENTED_SUBCOMMANDS.join(' / ') + '。' +
          '尚未迁移：' + PENDING_SUBCOMMANDS.join(' / ') + '。' +
          '这一步会在第 6 步后续块里补上；现在报错是为了不让自动化流水线把它当成功。',
      )
    }
    throw new CalcError(
      'unknown_subcommand',
      '不认识 derivation 子命令 "' + sub + '"',
      '可用（共 ' + all.length + ' 个）：' + all.join(' / ') + '。',
    )
  }

  return { result: lines.join('\n'), value }
}
