/**
 * operation="derivation" 的实现：推演栈框架。
 *
 * @module dsh-math-calculator/ops/derivation-op
 * @description
 * 这不是又一种计算，而是**把计算组织成可管理的方法论**：展示推演栈、
 * 接口卡、无量纲化、单位重定义检测、敏感性、相图、检查表、七个表。
 *
 * 子命令由 args.derivation 选择：
 *   stack / cards / dimensionless / units / sensitivity / phase / checklist / tables
 */

import {
  STACK,
  INTERFACE_CARDS,
  dimensionlessPack,
  detectUnitRedefinition,
  sensitivity,
  phaseSlice,
  CONSTRAINT_LABEL,
  CONFIDENCE_LABEL,
  type Verdict,
  type ChecklistItem,
} from '../derivation-stack.js'
import { recalculateConstants } from '../constants-graph.js'
import { runPipeline, renderPipeline } from '../pipeline.js'
import { opWorld } from './world-op.js'
import { backSolve, listAnchors, renderBackSolve } from '../back-solve.js'
import { archiveDerivation, loadArchive, compareVersions } from '../derivation-log.js'
import { currentWorkspace } from '../workspace.js'
import { overlay, computeCost, checkFields, renderFantasy } from '../fantasy-layer.js'
import { checkChaos, CHAOS_LIBRARY, linkInherit, syncInheritance, loadInheritLinks, diffTables } from '../universe-ops.js'
import { runCivilization } from '../civilization.js'
import { judgeDead, renderDead } from '../dead-universe.js'
import { toJsonValue } from '../format.js'
import type { MathArgs, Outcome } from './shared.js'

/** 数字格式化（大/小值用科学计数）。 */
function sci(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs === 0) return '0'
  if (abs >= 1e5 || abs < 1e-3) return value.toExponential(3)
  return Number(value.toPrecision(5)).toString()
}

/** 检查表渲染。 */
function renderChecklist(items: ChecklistItem[]): string {
  const out: string[] = ['═══ 检查表（13 项）═══', '']
  for (const item of items) {
    out.push('  ' + (item.pass ? '✓' : '✗') + ' ' + item.name + (item.note ? ' —— ' + item.note : ''))
  }
  const failed = items.filter(function (item) { return !item.pass }).length
  out.push('')
  out.push(failed === 0 ? '全部通过。' : failed + ' 项待填，补全后再发布。')
  return out.join('\n')
}

/**
 * `derivation`：推演栈框架的各子命令。
 *
 * @param args - 工具参数
 * @returns 统一结果对象
 */
export function opDerivation(args: MathArgs): Outcome {
  const sub = typeof args.derivation === 'string' ? args.derivation : 'stack'
  const out: string[] = []
  const value: Record<string, unknown> = { subcommand: sub }

  if (sub === 'stack') {
    out.push('═══ 推演栈（8 层）═══', '')
    for (const layer of STACK) {
      out.push('【' + layer.id + '】' + layer.name)
      out.push('  核心问题：' + layer.question)
      out.push('  输入：' + layer.inputs.join(' / '))
      out.push('  下游接口（' + layer.outputs.length + ' 个）：' + layer.outputs.join(' / '))
      out.push('  硬约束/失败模式：' + layer.failureModes.join(' / '))
      out.push('')
    }
    out.push('贯穿层：单位与观测者 / 不确定性与版本 / 时间与历史路径 / 约束分级')
    out.push('提示：多数世界只需 P1—P4 + 少量 P5，不必全宇宙展开。')
    value.layers = STACK.map(function (layer) { return layer.id })
  } else if (sub === 'cards') {
    const which = typeof args.layer === 'string' ? args.layer.toUpperCase() : ''
    const keys = which !== '' && INTERFACE_CARDS[which] !== undefined ? [which] : Object.keys(INTERFACE_CARDS)
    out.push('═══ 接口卡 ═══', '')
    for (const key of keys) {
      const cards = INTERFACE_CARDS[key]
      out.push('【' + key + '】共 ' + cards.length + ' 个接口变量')
      for (const card of cards) {
        out.push('  · ' + card.name + '  [' + card.unit + ']  约束=' + CONSTRAINT_LABEL[card.kind] + '  置信度=' + CONFIDENCE_LABEL[card.confidence])
        out.push('    定义：' + card.definition)
        out.push('    依赖：' + card.dependsOn.join(', ') + '  敏感于：' + card.sensitiveTo.join(', '))
        if (card.range.allowed) out.push('    允许区间：' + sci(card.range.allowed[0]) + ' — ' + sci(card.range.allowed[1]))
        if (card.range.marginal) out.push('    边缘区间：' + sci(card.range.marginal[0]) + ' — ' + sci(card.range.marginal[1]))
        out.push('    叙事影响：' + card.narrativeImpact.join(', '))
        if (card.notes) out.push('    备注：' + card.notes)
      }
      out.push('')
    }
    value.layers = keys
  } else if (sub === 'dimensionless') {
    const overrides = (args.constants ?? {}) as Record<string, number>
    const resolved = recalculateConstants(overrides)
    const packs = dimensionlessPack(resolved.values as Record<string, number>)
    out.push('═══ 无量纲参数包（真正该追踪的量）═══', '')
    out.push('  名称          含义                            现实值        当前值        偏差')
    for (const pack of packs) {
      out.push('  ' + pack.name.padEnd(14) + pack.meaning.padEnd(32) + sci(pack.standard).padStart(13) + '  ' + sci(pack.current).padStart(13) + '  ' + (pack.deviation === 0 ? '—' : (pack.deviation * 100).toFixed(2) + '%'))
    }
    out.push('')
    out.push('要点：同时缩放所有质量通常只是换了单位；真正变化要看这些比值。')
    value.packs = packs
  } else if (sub === 'units') {
    const changes = (args.unitScales ?? {}) as Record<string, number>
    const verdict = detectUnitRedefinition(changes)
    out.push('═══ 单位重定义检测 ═══', '')
    if (Object.keys(changes).length === 0) {
      out.push('用法：传 unitScales，例如 {"unitScales":{"mass":2}} 表示「所有质量 ×2」。')
    } else {
      out.push('  缩放：' + JSON.stringify(changes))
      out.push('  判定：' + (verdict.isUnitRedefinition ? '是单位重定义（非物理变化）' : '是真实物理变化'))
      out.push('  理由：' + verdict.reason)
    }
    value.verdict = verdict
  } else if (sub === 'sensitivity') {
    const base = typeof args.sensitivityBase === 'number' ? args.sensitivityBase : 9.80665
    const exponent = typeof args.sensitivityExponent === 'number' ? args.sensitivityExponent : 3
    const report = sensitivity(function (x: number) { return Math.pow(x, exponent) }, base)
    out.push('═══ 敏感性分析 ═══', '')
    out.push('  模型：结果 = 输入^' + exponent + '，基线 ' + sci(base))
    for (const item of report.items) {
      out.push('  ' + item.parameter.padEnd(10) + ' 结果=' + sci(item.perturbed) + '  相对变化=' + (item.relativeChange * 100).toFixed(2) + '%  ' + item.verdict)
    }
    out.push('')
    out.push(report.fineTuningWarning ? '⚠ 微调警告：结论对输入高度敏感，允许区间可能极窄。' : '✓ 结论基本稳定。')
    value.report = report
  } else if (sub === 'phase') {
    const slice = phaseSlice(
      function (g: number, size: number): Verdict {
        const ratio = 500 / (g * Math.max(size, 0.01))
        if (ratio >= 3 && ratio <= 300) return 'allowed'
        if (ratio >= 1.5 && ratio <= 1000) return 'marginal'
        return 'forbidden'
      },
      [0.2, 3], [0.1, 100], 7,
    )
    out.push('═══ 相图：重力 × 生物尺寸 → 骨骼强度体重比 ═══', '')
    out.push('  g\\尺寸 ' + slice.xs.map(function (x) { return sci(x).padStart(9) }).join(''))
    for (let yi = 0; yi < slice.ys.length; yi += 1) {
      const row = slice.grid[yi].map(function (v) {
        return (v === 'allowed' ? '允许' : v === 'marginal' ? '边缘' : v === 'forbidden' ? '禁止' : '待定').padStart(9)
      }).join('')
      out.push('  ' + sci(slice.ys[yi]).padStart(7) + row)
    }
    out.push('')
    out.push('  统计：允许 ' + slice.counts.allowed + ' / 边缘 ' + slice.counts.marginal + ' / 禁止 ' + slice.counts.forbidden)
    out.push('  要点：不追求单点答案——先看哪些区域存在解。')
    value.slice = slice
  } else if (sub === 'checklist') {
    const items: ChecklistItem[] = [
      { name: '量纲一致', pass: true },
      { name: '单位一致', pass: true },
      { name: '已无量纲化', pass: true },
      { name: '极限行为合理', pass: true },
      { name: '守恒律未被违反', pass: true },
      { name: '稳定性边界已查', pass: true },
      { name: '标度律未越界', pass: true },
      { name: '反馈时间尺度已分', pass: false, note: '待填：快变量与慢变量' },
      { name: '观测者已声明', pass: false, note: '待填：人类 / 本地智慧 / 上帝视角' },
      { name: '硬约束无冲突', pass: true },
      { name: '叙事锚点有反推窗口', pass: false, note: '待填：锚点与反推结果' },
      { name: '待定项明确', pass: true },
      { name: '版本可追溯', pass: false, note: '待填：本轮版本号' },
    ]
    out.push(renderChecklist(items))
    value.checklist = items
  } else if (sub === 'pipeline') {
    // 正向推演链路：跑一次 world，把结果逐层喂给接口卡判定。
    // 这是「推演栈真正跑起来」的部分——不是展示卡片，而是串成流水线。
    const worldParams = (args.world ?? {}) as Record<string, unknown>
    const merged: Record<string, unknown> = {}
    for (const key of ['planetRadius', 'planetMass', 'rotationHours', 'obliquityDeg']) {
      const value = (args as unknown as Record<string, unknown>)[key]
      if (typeof value === 'number') merged[key] = value
    }
    Object.assign(merged, worldParams)

    const worldOut = opWorld({ world: merged } as never, 64)
    const pipelineReport = runPipeline((worldOut as any).value)
    out.push(renderPipeline(pipelineReport))
    value.pipeline = pipelineReport
  } else if (sub === 'anchors') {
    // 列出可反推的叙事锚点及当前上限——让作者知道「哪些效果是可反推的」
    const anchors = listAnchors((args.world ?? {}) as Record<string, unknown>)
    out.push('═══ 可反推的叙事锚点 ═══', '')
    out.push('  锚点 id                 名称                当前上限      说明')
    for (const anchor of anchors) {
      out.push('  ' + anchor.id.padEnd(24) + anchor.name.padEnd(20) +
        (Number.isFinite(anchor.currentLimit) ? anchor.currentLimit.toFixed(1) : '—').padStart(10) +
        ' ' + anchor.unit.padEnd(6) + ' ' + anchor.describe)
    }
    out.push('')
    out.push('用法：{"operation":"derivation","derivation":"backSolve","anchor":"creatureHeight","anchorValue":50}')
    value.anchors = anchors
  } else if (sub === 'backSolve') {
    // 逆推校准：从叙事锚点反推参数窗口（作者最常用的方向）
    const anchor = typeof args.anchor === 'string' ? args.anchor : ''
    const anchorValue = typeof args.anchorValue === 'number' ? args.anchorValue : 0
    if (anchor === '' || anchorValue <= 0) {
      out.push('缺参数：anchor（锚点 id）与 anchorValue（想要的值）')
      out.push('先用 derivation="anchors" 看有哪些锚点可用。')
    } else {
      const solution = backSolve(anchor, anchorValue, (args.world ?? {}) as Record<string, unknown>)
      if (!solution) {
        out.push('无法反推：找不到锚点 "' + anchor + '" 或值不合法。')
      } else {
        out.push(renderBackSolve(solution))
        value.solution = solution
      }
    }
  } else if (sub === 'archive') {
    // 七张表持久化 + 版本记录：把本次链路结果存进工作区
    const worldParams = (args.world ?? {}) as Record<string, unknown>
    const worldOut = opWorld({ world: worldParams } as never, 64)
    const pipelineReport = runPipeline((worldOut as any).value)
    const anchorsUsed: any[] = []
    if (typeof args.anchor === 'string' && typeof args.anchorValue === 'number') {
      const sol = backSolve(args.anchor, args.anchorValue, worldParams)
      if (sol) anchorsUsed.push(sol)
    }
    const changes = Object.entries(worldParams).map(function (pair) {
      return { parameter: pair[0], from: '默认', to: pair[1], handling: '显式追踪' }
    })
    const result = archiveDerivation(currentWorkspace(), pipelineReport, anchorsUsed, changes, [])
    out.push('═══ 已归档（七张表）═══', '')
    out.push('  工作区：' + currentWorkspace())
    out.push('  版本：' + result.version + '（共 ' + result.total + ' 版）')
    out.push('  接口卡：' + result.archive.interfaceCards.length + ' 条')
    out.push('  硬约束：' + result.archive.constraints.hard.length + ' 条')
    out.push('  叙事锚点：' + result.archive.anchors.length + ' 条')
    out.push('')
    out.push('换工作区会看到各自的历史；用 derivation="history" 查看，用 "compare" 对比两版。')
    value.archive = result.archive
    value.total = result.total
  } else if (sub === 'history') {
    const { versions } = loadArchive(currentWorkspace())
    out.push('═══ 推演档案（' + currentWorkspace() + '）═══', '')
    if (versions.length === 0) {
      out.push('  （还没有归档过）')
      out.push('用 derivation="archive" 把当前链路结果存成一版。')
    } else {
      out.push('  版本    时间                  接口卡  禁止项  结论变化')
      for (const item of versions) {
        const forbidden = item.interfaceCards.filter(function (c) { return c.verdict === 'forbidden' }).length
        const marginals = item.interfaceCards.filter(function (c) { return c.verdict === 'marginal' }).length
        out.push('  ' + item.version.padEnd(7) + item.at.slice(0, 19).padEnd(22) +
          String(item.interfaceCards.length).padStart(6) + '  ' +
          String(forbidden).padStart(5) + '  ' +
          (forbidden === 0 ? (marginals > 0 ? '无禁止有边缘' : '全部通过') : '有禁止项'))
      }
    }
    value.versions = versions
  } else if (sub === 'compare') {
    const from = typeof args.compareFrom === 'string' ? args.compareFrom : ''
    const to = typeof args.compareTo === 'string' ? args.compareTo : undefined
    if (from === '') {
      out.push('缺 compareFrom（起始版本，如 v1）')
    } else {
      const diff = compareVersions(currentWorkspace(), from, to)
      out.push('═══ 版本对比 ═══', '')
      out.push('  ' + diff.message)
      if (diff.changes.length > 0) {
        out.push('')
        for (const change of diff.changes) out.push('  · ' + change)
      }
      value.diff = diff
    }
  } else if (sub === 'fantasy') {
    // 幻想层：叠加式（不覆盖物理），并要求付代价——这是「幻想带真实」的核心。
    const raw = (args as unknown as Record<string, unknown>).fantasyAbility
    if (!raw || typeof raw !== 'object') {
      out.push('缺 fantasyAbility：需要 { name, label, source, efficiency, costPerUnit, powerLimit, boosts, meaning }')
      out.push('')
      out.push('三种 source：metabolism（自身代谢）/ ambient-field（环境场）/ artifact（器物）/ external（外部注入）')
      out.push('efficiency > 1 时必须用 external，否则等于永动机会被判禁止。')
    } else {
      const ability = raw as never as import('../fantasy-layer.js').FantasyAbility
      // 只检查「能不能算」，不评判设定合不合理——设定由用户与 AI 决定。
      const problems = checkFields(ability)
      if (problems.length > 0) {
        out.push('═══ 字段不完整，没法算 ═══', '')
        for (const problem of problems) out.push('  · ' + problem)
        out.push('')
        out.push('补齐这些字段就能算出等价人力/食物/散热需求。')
        value.problems = problems
      } else {
        const demand = typeof args.fantasyDemand === 'number' ? args.fantasyDemand : 1000
        const physical = typeof args.fantasyPhysical === 'number' ? args.fantasyPhysical : 100
        const bodyArea = typeof args.fantasyBodyArea === 'number' ? args.fantasyBodyArea : 1.8
        out.push(renderFantasy(ability, demand, physical, bodyArea))
        value.fantasy = overlay(physical, ability, demand)
        value.cost = computeCost(overlay(physical, ability, demand).fantasy * ability.costPerUnit, bodyArea)
      }
    }
  } else if (sub === 'civilization') {
    // 目录4：宏观文明推演（能量/材料/交通/技术树）
    const worldParams = (args.world ?? {}) as Record<string, unknown>
    const civ = runCivilization(worldParams)
    out.push('═══ 宏观文明推演 ═══', '')
    const groups: Array<[string, string]> = [
      ['energy', '4.1 能量与热力学'],
      ['material', '4.2 材料与结构'],
      ['transport', '4.3 空间与交通'],
    ]
    const num = function (value: number): string {
      if (!Number.isFinite(value)) return '—'
      const abs = Math.abs(value)
      if (abs >= 1e6 || (abs < 1e-2 && abs > 0)) return value.toExponential(2)
      return Number(value.toPrecision(4)).toString()
    }
    for (const group of groups) {
      const items = civ.limits.filter(function (item) { return item.category === group[0] })
      if (items.length === 0) continue
      out.push('【' + group[1] + '】')
      for (const item of items) {
        out.push('  ' + item.name.padEnd(22) + num(item.value).padStart(12) + ' ' + item.unit)
        out.push('    依据：' + item.basis)
        if (item.breakthrough) out.push('    突破方向：' + item.breakthrough)
      }
      out.push('')
    }
    out.push('【4.4 技术树】被物理锁死或放开的分支')
    for (const item of civ.tech) {
      const mark = item.status === 'open' ? '开放' : item.status === 'conditional' ? '有条件' : '锁死'
      out.push('  ' + mark.padEnd(6) + item.branch.padEnd(18) + item.reason)
      if (item.requirement) out.push('         需要：' + item.requirement)
    }
    out.push('')
    out.push('统计：开放 ' + civ.summary.open + ' / 有条件 ' + civ.summary.conditional + ' / 锁死 ' + civ.summary.locked)
    value.civilization = civ
  } else if (sub === 'dead') {
    // 补丁6：宇宙死寂态兜底——说清"这个参数意味着什么"，不评判设定。
    const worldParams = (args.world ?? {}) as Record<string, unknown>
    const worldOut = opWorld({ world: worldParams } as never, 64)
    const verdict = judgeDead((worldOut as any).value)
    out.push(renderDead(verdict))
    value.dead = verdict
  } else if (sub === 'chaos') {
    // 混沌拦截器（补丁13）：不确定性的量化表达，不猜数字。
    const lyapunov = typeof args.lyapunov === 'number' ? args.lyapunov : 1.0
    const verdict = checkChaos(lyapunov)
    out.push('═══ 混沌系统拦截器 ═══', '')
    out.push('  Lyapunov 指数：' + lyapunov.toFixed(3))
    out.push('')
    if (verdict.chaotic) {
      out.push('  【判定】进入混沌区——不给确定数值')
      out.push('  可预测时间：' + verdict.horizon.toFixed(1) + ' 个特征时间')
      out.push('')
      out.push('  【概率云】随时间扩张的不确定度：')
      for (const point of verdict.spread) {
        if (Number.isNaN(point.low)) {
          // 误差超过 100%，不再给数字——这才是「不强行闭合」
          out.push('    t=' + point.t.toFixed(1) + '  不可预测（误差已超过 100%）')
        } else {
          out.push('    t=' + point.t.toFixed(1) + '  区间 [' + point.low.toFixed(3) + ', ' + point.high.toFixed(3) + ']')
        }
      }
    } else {
      out.push('  【判定】可预测，可以给确定数值')
    }
    out.push('')
    out.push('  ' + verdict.reason)
    out.push('  ' + verdict.advice)
    out.push('')
    out.push('【常见混沌系统的 Lyapunov 量级】')
    for (const item of CHAOS_LIBRARY) {
      out.push('  ' + item.name.padEnd(20) + item.lyapunov.toFixed(2).padStart(6) + '  ' + item.note)
    }
    value.chaos = verdict
  } else if (sub === 'inherit') {
    // 数据表继承（补丁9）：衍生表只读继承基线表的物理基石
    const derived = typeof args.inheritDerived === 'string' ? args.inheritDerived : ''
    const base = typeof args.inheritBase === 'string' ? args.inheritBase : ''
    if (args.inheritSync === true) {
      const result = syncInheritance()
      out.push('═══ 继承同步 ═══', '')
      out.push('  已更新 ' + result.count + ' 张衍生表')
      for (const name of result.updated) out.push('  · ' + name)
      value.sync = result
    } else if (derived === '' || base === '') {
      const links = loadInheritLinks()
      out.push('═══ 继承关系 ═══', '')
      if (links.length === 0) out.push('  （还没有继承关系）')
      else for (const link of links) out.push('  ' + link.derived + ' 继承 ' + link.base)
      out.push('')
      out.push('建立继承：{"derivation":"inherit","inheritDerived":"派生表","inheritBase":"基线表"}')
      out.push('同步更新：{"derivation":"inherit","inheritSync":true}')
      value.links = links
    } else {
      const result = linkInherit(derived, base)
      out.push(result.message)
      value.link = result
    }
  } else if (sub === 'diff') {
    // A/B 对比（补丁3）
    const aName = typeof args.diffA === 'string' ? args.diffA : ''
    const bName = typeof args.diffB === 'string' ? args.diffB : ''
    if (aName === '' || bName === '') {
      out.push('需要 diffA 与 diffB 两张表名')
    } else {
      const diff = diffTables(aName, bName)
      out.push('═══ A/B 对比：' + aName + ' vs ' + bName + ' ═══', '')
      out.push('  ' + diff.message)
      if (diff.items.length > 0) {
        out.push('')
        for (const item of diff.items) out.push('  · ' + item.note)
      }
      value.diff = diff
    }
  } else if (sub === 'tables') {
    out.push('═══ 七张表（固定输出格式）═══', '')
    out.push('  1. 项目卡     推演类型 / 范围 / 时间窗口 / 观测者 / 优先级 / 不推演什么')
    out.push('  2. 变更清单   常数 / 对称性 / 粒子谱 / 初条件 / 历史路径，各标处理方式')
    out.push('  3. 接口卡     P1—P6 每层 5—10 个变量，带区间与约束类型')
    out.push('  4. 约束表     硬约束 / 软约束 / 叙事约束')
    out.push('  5. 敏感性表   一阶扰动 / 阈值跨越 / 反馈放大 / 时间尺度错配')
    out.push('  6. 叙事锚点表 锚点 / 硬需求 / 可妥协项 / 反推接口 / 反推窗口 / 冲突处理')
    out.push('  7. 版本记录   版本号 / 变更 / 受影响接口 / 结论变化 / 待定项 / 下轮任务')
    value.tables = 7
  } else {
    out.push('未知子命令：' + sub)
    out.push('可用：stack / cards / dimensionless / units / sensitivity / phase / pipeline / anchors / backSolve / fantasy / civilization / dead / chaos / inherit / diff / archive / history / compare / checklist / tables')
  }

  return { result: out.join('\n'), value: toJsonValue(value) }
}
