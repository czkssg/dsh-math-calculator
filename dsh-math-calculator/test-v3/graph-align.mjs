/**
 * graph 层对齐测试：依赖传导 / 台账闭合 / 口径体检 / 方案对比 / 区间运算。
 *
 * ## 这五项是对账能力的核心
 *
 * 反馈包的统计：**282 条硬伤里 139 条（48%）是账本闭合问题**，
 * 而「同一量两处不同值」是最能抓硬伤的一类。
 *
 * ## ★ 本套件最重要的两条判据
 *
 * ### ① `ledger` 要能自己找出「差了一个数量级」的分项
 *
 * ```
 *   W02 真实案例：贵族占比写 0.01 而应为 1（差 100 倍）
 *   → 工具应指出「贵族 ×100 时总和恰好闭合」
 * ```
 *
 * ### ② `consistency` 要能抓「920 亿 vs 8 亿」
 *
 * ```
 *   第一版把「约」吸进主体名 → 两个主体名不同 → 漏报
 *   修正后：主体名归一 → 检出 115 倍差异
 * ```
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-graph-'))
process.env.DSH_MATH_CALC_HOME = home

const dep = await import(pathToFileURL(join(root, 'lib/features/graph/dependency.js')).href)
const led = await import(pathToFileURL(join(root, 'lib/features/graph/ledger.js')).href)
const con = await import(pathToFileURL(join(root, 'lib/features/graph/consistency.js')).href)
const cmp = await import(pathToFileURL(join(root, 'lib/features/graph/compare.js')).href)
const itv = await import(pathToFileURL(join(root, 'lib/features/graph/interval.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass += 1
    console.log('  ok   ' + name)
  } else {
    fails.push(name + (detail ? ' :: ' + detail : ''))
    console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''))
  }
}
const NL = String.fromCharCode(10)

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ dependency：上下游 / 层深 / 环 --')
// ───────────────────────────────────────────────────────────
{
  const graph = {
    edges: [
      { from: 'G', to: 'g' }, { from: 'M', to: 'g' }, { from: 'R', to: 'g' },
      { from: 'g', to: 'v' }, { from: 'v', to: 'E' },
    ],
  }
  const out = dep.analyzeDependency(graph, 'G', 'downstream')
  assert('节点 6 个', out.value.nodeCount === 6, String(out.value.nodeCount))
  assert('边 5 条', out.value.edgeCount === 5, String(out.value.edgeCount))
  assert('★ 层深 4 代', out.value.generations.length === 4, String(out.value.generations.length))
  assert('L0 是 G/M/R', JSON.stringify((out.value.generations[0] ?? []).sort()) === '["G","M","R"]',
    JSON.stringify(out.value.generations[0]))
  assert('无环', out.value.cyclic === false, String(out.value.cyclic))

  /** 下游传导。 */
  assert('★ G 下游 1 跳 = g', JSON.stringify(out.value.traversal.levels[0]) === '["g"]',
    JSON.stringify(out.value.traversal.levels))
  assert('G 下游最远 3 跳', out.value.traversal.depth === 3, String(out.value.traversal.depth))

  /** 上游传导（老插件在这里有过方向 bug）。 */
  const up = dep.analyzeDependency(graph, 'g', 'upstream')
  assert('★ g 上游 = G/M/R', JSON.stringify(up.value.traversal.levels[0].sort()) === '["G","M","R"]',
    JSON.stringify(up.value.traversal.levels))

  /** 环检测。 */
  const cyclic = dep.analyzeDependency({
    edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'A' }],
  })
  assert('★ 检出环', cyclic.value.cyclic === true, String(cyclic.value.cyclic))
  assert('有环时给 notice', typeof cyclic.notice === 'string' && cyclic.notice.length > 10,
    String(cyclic.notice).slice(0, 40))

  /** 自环要拒绝。 */
  let selfLoop = null
  try {
    dep.analyzeDependency({ edges: [{ from: 'A', to: 'A' }] })
  } catch (error) {
    selfLoop = error
  }
  assert('自环被拒', selfLoop !== null, '')

  /** 空边要拒绝。 */
  let noEdges = null
  try {
    dep.analyzeDependency({ edges: [] })
  } catch (error) {
    noEdges = error
  }
  assert('空边报 missing_params', noEdges?.type === 'missing_params', String(noEdges?.type))
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ ledger：闭合判定与量级笔误 --')
// ───────────────────────────────────────────────────────────
{
  /** 正常闭合。 */
  const closed = led.checkLedger({ parts: [{ name: '甲', value: 60 }, { name: '乙', value: 40 }], total: 100 })
  assert('60+40=100 闭合', closed.value.closed === true, String(closed.value.closed))

  /**
   * ★ W02 真实案例：贵族占比写 0.01 而应为 1。
   */
  const w02 = led.checkLedger({
    parts: [
      { name: '士', value: 1 }, { name: '农', value: 60 }, { name: '工', value: 30 },
      { name: '商', value: 8.011 }, { name: '贵族', value: 0.01 },
    ],
    total: 100,
  })
  assert('★ W02 不闭合', w02.value.closed === false, String(w02.value.closed))
  assert('★ 指出贵族 ×100 恰好闭合',
    w02.value.suspects.some((s) => s.name === '贵族' && s.ratio === 100),
    JSON.stringify(w02.value.suspects.map((s) => s.name + '×' + s.ratio)))
  assert('★ 正文提醒「不判断对错」', /不猜哪个数是对的|不判断对错/.test(w02.result), '')

  /** 容差。 */
  const withinTolerance = led.checkLedger({
    parts: [{ name: '甲', value: 99.8 }],
    total: 100,
  })
  assert('0.2% 差异在默认容差内', withinTolerance.value.closed === true, String(withinTolerance.value.closed))

  /** 无笔误时不给可疑项。 */
  const scattered = led.checkLedger({
    parts: [{ name: '甲', value: 33 }, { name: '乙', value: 33 }, { name: '丙', value: 33 }],
    total: 100,
  })
  assert('零散误差不给可疑项', scattered.value.suspects.length === 0,
    JSON.stringify(scattered.value.suspects))

  /** 空分项要拒绝。 */
  let empty = null
  try {
    led.checkLedger({ parts: [], total: 100 })
  } catch (error) {
    empty = error
  }
  assert('空分项报 missing_params', empty?.type === 'missing_params', String(empty?.type))
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. ★ consistency：同量不同值 --')
// ───────────────────────────────────────────────────────────
{
  /**
   * ★ 反馈包头号案例：920 亿 vs 8 亿（差 115 倍）。
   */
  const w01 = con.checkConsistency({
    sections: [
      { number: 1, text: '帝国总人口 920 亿，其中农业人口占多数' },
      { number: 2, text: '帝国总人口约 8 亿，军队 3000 万' },
    ],
  })
  assert('★ 检出 1 处冲突', w01.value.conflicts.length === 1, String(w01.value.conflicts.length))
  assert('★ 冲突主体是帝国总人口',
    w01.value.conflicts[0]?.subject === '帝国总人口', String(w01.value.conflicts[0]?.subject))
  assert('★ 差异约 115 倍',
    Math.abs((w01.value.conflicts[0]?.ratio ?? 0) - 115) < 1,
    String(w01.value.conflicts[0]?.ratio))
  assert('★ 正文说「不判断哪一处是对的」', /不判断哪一处是对的|哪个数是原文给的/.test(w01.result), '')

  /** 同一值出现多次不算冲突。 */
  const same = con.checkConsistency({
    sections: [
      { number: 1, text: '帝国总人口 920 亿' },
      { number: 2, text: '帝国总人口 920 亿' },
    ],
  })
  assert('同值多处不算冲突', same.value.conflicts.length === 0, String(same.value.conflicts.length))

  /** 差异 <2 倍不算冲突（精度差异）。 */
  const close = con.checkConsistency({
    sections: [
      { number: 1, text: '帝国总人口 100 亿' },
      { number: 2, text: '帝国总人口 102 亿' },
    ],
  })
  assert('★ 1.02 倍不算冲突（精度差异）', close.value.conflicts.length === 0,
    String(close.value.conflicts.length))

  /** 中文量级折算。 */
  const magnitude = con.checkConsistency({
    sections: [{ number: 1, text: '储量 1.49 亿吨' }],
  })
  const claim = magnitude.value.allClaims.find((c) => c.subject === '储量')
  assert('★ 1.49 亿吨 = 1.49e8', Math.abs((claim?.value ?? 0) - 1.49e8) < 1, String(claim?.value))

  /** 空片段要拒绝。 */
  let empty = null
  try {
    con.checkConsistency({ sections: [] })
  } catch (error) {
    empty = error
  }
  assert('空片段报 missing_params', empty?.type === 'missing_params', String(empty?.type))
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. ★ compare：不给权重就不给综合分 --')
// ───────────────────────────────────────────────────────────
{
  const base = {
    rows: ['甲', '乙', '丙'],
    cols: ['成本', '产出'],
    data: [[100, 20], [60, 35], [80, 25]],
  }

  /** 无权重。 */
  const noWeights = cmp.comparePlans(base)
  assert('★ 无权重时 scores 为 null', noWeights.value.scores === null, String(noWeights.value.scores))
  assert('★ 正文说「不给综合分」', /不给综合分/.test(noWeights.result), '')
  assert('仍给各指标最强', noWeights.value.best.length === 2, String(noWeights.value.best.length))
  /** 默认越大越好。 */
  assert('成本最强是甲（100，默认越大越好）',
    noWeights.value.best[0].row === '甲', noWeights.value.best[0].row)

  /** 指定方向：成本越小越好。 */
  const withDir = cmp.comparePlans({ ...base, directions: ['min', 'max'] })
  assert('★ 成本越小越好 → 最强是乙（60）', withDir.value.best[0].row === '乙', withDir.value.best[0].row)

  /** 带权重。 */
  const withWeights = cmp.comparePlans({ ...base, directions: ['min', 'max'], weights: [1, 1] })
  assert('★ 有权重时给 scores', Array.isArray(withWeights.value.scores), String(typeof withWeights.value.scores))
  assert('有权重时排序', withWeights.value.scores.length === 3, String(withWeights.value.scores.length))
  /** 归一化后综合分在 [0,1]。 */
  assert('综合分在 [0,1]',
    withWeights.value.scores.every((s) => s.score >= 0 && s.score <= 1),
    JSON.stringify(withWeights.value.scores.map((s) => s.score.toFixed(2))))

  /** 形状校验。 */
  let badShape = null
  try {
    cmp.comparePlans({ rows: ['甲'], cols: ['a', 'b'], data: [[1]] })
  } catch (error) {
    badShape = error
  }
  assert('★ data 列数不符报错', badShape?.type === 'invalid_argument', String(badShape?.type))

  let badWeight = null
  try {
    cmp.comparePlans({ ...base, weights: [1, -1] })
  } catch (error) {
    badWeight = error
  }
  assert('负权重被拒', badWeight?.type === 'invalid_argument', String(badWeight?.type))
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. ★ interval：四点验证与门槛 --')
// ───────────────────────────────────────────────────────────
{
  /**
   * ★ 乘法必须试四个角 —— 只算 low×low / high×high 会低估宽度。
   */
  const multiply = itv.applyOp({ low: -2, high: 3 }, { low: -1, high: 4 }, '*')
  assert('★ [-2,3] × [-1,4] = [-8,12]', multiply.low === -8 && multiply.high === 12,
    JSON.stringify(multiply))

  /** 减法。 */
  const subtract = itv.applyOp({ low: 10, high: 20 }, { low: 3, high: 5 }, '-')
  assert('[10,20] - [3,5] = [5,17]', subtract.low === 5 && subtract.high === 17, JSON.stringify(subtract))

  /** 正数乘法。 */
  const positive = itv.applyOp({ low: 20, high: 50 }, { low: 2000, high: 2500 }, '*')
  assert('[20,50] × [2000,2500] = [40000,125000]',
    positive.low === 40000 && positive.high === 125000, JSON.stringify(positive))

  /** 除数含 0 必须拒绝。 */
  let divZero = null
  try {
    itv.applyOp({ low: 1, high: 2 }, { low: -1, high: 1 }, '/')
  } catch (error) {
    divZero = error
  }
  assert('★ 除数含 0 被拒（结果无界）', divZero !== null, '')

  /** 单区间形态。 */
  const single = itv.intervalOperation({ expr: '20-50' })
  assert('★ 单区间 20-50 → [20,50]',
    single.value.result.low === 20 && single.value.result.high === 50,
    JSON.stringify(single.value.result))
  /** 与 [20,50] 一致。 */
  const bracket = itv.intervalOperation({ expr: '[20,50]' })
  assert('★ 两种写法结果一致',
    bracket.value.result.low === single.value.result.low &&
      bracket.value.result.high === single.value.result.high, '')
  /** 中文写法。 */
  const cn = itv.intervalOperation({ expr: '20 到 50' })
  assert('「20 到 50」也能解析', cn.value.result.low === 20 && cn.value.result.high === 50, '')

  /** 带运算的表达式。 */
  const expr = itv.intervalOperation({ expr: '[20,50] * [2000,2500]' })
  assert('★ 表达式形态正确', expr.value.result.low === 40000 && expr.value.result.high === 125000,
    JSON.stringify(expr.value.result))

  /** 把握程度。 */
  assert('★ ±42.86% 判为「很松」', expr.value.confidence === '很松', expr.value.confidence)
  const tight = itv.intervalOperation({ expr: '[100,102] * [1,1]' })
  assert('±1% 判为「很紧」', tight.value.confidence === '很紧', tight.value.confidence)

  /** 门槛判定。 */
  const above = itv.intervalOperation({ expr: '[100,200]', against: 50 })
  assert('★ 整段在门槛之上', /整个区间都在门槛之上/.test(above.result), '')
  const below = itv.intervalOperation({ expr: '[10,20]', against: 50 })
  assert('整段在门槛之下', /整个区间都在门槛之下/.test(below.result), '')
  const cross = itv.intervalOperation({ expr: '[20,50]', against: 25 })
  assert('★ 跨过门槛', /跨过/.test(cross.result), '')
  assert('★ 跨门槛时把握低', /低/.test(cross.result), '')

  /** 不可解析的表达式。 */
  let bad = null
  try {
    itv.intervalOperation({ expr: '这不是区间' })
  } catch (error) {
    bad = error
  }
  assert('无法解析的 expr 报错', bad?.type === 'invalid_argument', String(bad?.type))
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
