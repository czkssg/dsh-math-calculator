/**
 * 第 6 步新增四个 operation 的测试：chain / anchor / threshold / scaling。
 *
 * ## 判据来自反馈包 15 号的接口规格
 *
 * chain 的验收标准是「用一条真实价格链跑一遍，表能对齐当时的结论」。
 * 本套件用规格自带的 5 段链（8 先令/吨），并核对末值。
 *
 * 规格示例里 `total:'8 → 10.4 → 13.5 → 16.9'` 与它自己的表达式不自洽
 * （prev+trans=10.4，prev*0.25=2.6，10.4+2.6=13）。测试以**表达式实算**为准，
 * 并在注释里记下这处不自洽——照抄示例数字会让工具输出假值。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-deduction-new-ops-'))

const chain = await import(pathToFileURL(join(root, 'lib/features/deduction/chain.js')).href)
const anchor = await import(pathToFileURL(join(root, 'lib/features/deduction/anchor.js')).href)
const threshold = await import(pathToFileURL(join(root, 'lib/features/deduction/threshold.js')).href)
const scaling = await import(pathToFileURL(join(root, 'lib/features/deduction/scaling.js')).href)

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
const near = (a, b, tol) => Math.abs(a - b) <= tol

function throwsOf(fn) {
  try { fn(); return null } catch (error) { return error }
}

// ───────────────────────────────────────────────────────────
console.log('-- 1. threshold：判据由调用方给 --')
// ───────────────────────────────────────────────────────────
{
  const out = threshold.classifyThreshold({
    value: 0.35,
    thresholds: [{ at: 0.2, label: '低' }, { at: 0.5, label: '中' }, { at: 0.8, label: '高' }],
  })
  assert('0.35 → 中', out.value.label === '中', out.value.label)
  assert('区间说明是 0.2–0.5', out.value.note.includes('0.2') && out.value.note.includes('0.5'), out.value.note)
  assert('结构里带回排序后的阈值', out.value.thresholds.length === 3 && out.value.thresholds[0].at === 0.2, '')

  const low = threshold.classifyThreshold({ value: 0.1, thresholds: [{ at: 0.2, label: '低' }] })
  assert('★ 低于最低档阈值 → 归最低档并说明', low.value.label === '低' && low.value.note.includes('低于最低档阈值'), low.value.note)
  assert('低于最低档进 notice', (low.notice ?? '').includes('低于最低档'), '')

  const high = threshold.classifyThreshold({ value: 9, thresholds: [{ at: 0.2, label: '低' }, { at: 0.5, label: '中' }] })
  assert('★ 高于最高档 → 取最高档并注明', high.value.label === '中' && high.value.note.includes('已超过最高档'), high.value.note)

  const edge = threshold.classifyThreshold({ value: 0.5, thresholds: [{ at: 0.2, label: '低' }, { at: 0.5, label: '中' }] })
  assert('上界 0.5 归上一档（at 是上界，不含）', edge.value.label === '中', edge.value.label)
  assert('0.4 落在 0.2–0.5 → 中', threshold.classifyThreshold({ value: 0.4, thresholds: [{ at: 0.2, label: '低' }, { at: 0.5, label: '中' }] }).value.label === '中', '')

  const atTop = threshold.classifyThreshold({ value: 0.8, thresholds: [{ at: 0.2, label: '低' }, { at: 0.8, label: '高' }] })
  assert('最高档端点归最高档', atTop.value.label === '高', atTop.value.label)

  const unsorted = threshold.classifyThreshold({ value: 0.35, thresholds: [{ at: 0.8, label: '高' }, { at: 0.2, label: '低' }, { at: 0.5, label: '中' }] })
  assert('乱序阈值也按 at 排序', unsorted.value.label === '中', unsorted.value.label)

  assert('★ 缺 thresholds → missing_params', throwsOf(() => threshold.classifyThreshold({ value: 1, thresholds: [] }))?.type === 'missing_params', '')
  assert('缺 value → missing_params', throwsOf(() => threshold.classifyThreshold({ thresholds: [{ at: 1, label: 'x' }] }))?.type === 'missing_params', '')
  assert('value 非数 → invalid_argument', throwsOf(() => threshold.classifyThreshold({ value: '0.3', thresholds: [{ at: 1, label: 'x' }] }))?.type === 'invalid_argument', '')
  assert('at 非数 → invalid_argument', throwsOf(() => threshold.classifyThreshold({ value: 1, thresholds: [{ at: 'x', label: 'x' }] }))?.type === 'invalid_argument', '')
  assert('label 空 → invalid_argument', throwsOf(() => threshold.classifyThreshold({ value: 1, thresholds: [{ at: 1, label: '  ' }] }))?.type === 'invalid_argument', '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. chain：价格链 8 先令/吨 --')
// ───────────────────────────────────────────────────────────
{
  // 累计语义：每段的 value 是该阶段的累计价，prev = 上一段累计价。
  // 规格示例把"成本绝对增量"（raw*0.3）与"累计价"混写，且 total 数字与表达式不自洽；
  // 这里用自洽的累计链：8 → 8×1.3=10.4 → 10.4×1.25=13
  const stages = [
    { name: '坑口价', expr: 'raw' },
    { name: '含运费到岸', expr: 'prev*1.3', as: 'cif' },
    { name: '含利润售价', expr: 'cif*1.25' },
    { name: '最终报价', expr: 'prev' },
  ]
  const out = chain.runChain({ stages, raw: 8, unit: '先令/吨' })
  const v = out.value.table.map((row) => row.value)
  assert('4 段都算出来', v.length === 4, String(v.length))
  assert('坑口价 = 8', near(v[0], 8, 1e-9), String(v[0]))
  assert('★ 到岸价 = 8×1.3 = 10.4', near(v[1], 10.4, 1e-9), String(v[1]))
  assert('★ 售价 = 10.4×1.25 = 13', near(v[2], 13, 1e-9), String(v[2]))
  assert('最终报价 = 13', near(v[3], 13, 1e-9), String(v[3]))
  assert('总量字符串含箭头与单位', out.value.total.includes('→') && out.value.total.includes('先令/吨'), out.value.total)
  assert('增量：到岸段 +2.4', near(out.value.table[1].delta, 2.4, 1e-9), String(out.value.table[1].delta))
  assert('share：坑口价 = 8/13', near(out.value.table[0].share, 8 / 13, 1e-9), String(out.value.table[0].share))
  assert('增量占比：到岸段 +2.4/13 = 18.5%', near(out.value.table[1].deltaShare, 2.4 / 13, 1e-9), String(out.value.table[1].deltaShare))
  assert('★ 增量都 <50% → 无断点（不是累计占比 80% 那种假断点）', out.value.breakpoints.length === 0, JSON.stringify(out.value.breakpoints))
  assert('★ 主导段按增量算 = 含利润售价', out.value.verdict.includes('含利润售价'), out.value.verdict)
  assert('链闭合判定带段数', out.value.verdict.includes('链闭合') && out.value.verdict.includes('4 段'), out.value.verdict)

  // 能引用前段结果 s0..sN
  const withIndex = chain.runChain({ raw: 2, stages: [{ name: 'a', expr: 'raw' }, { name: 'b', expr: 's0*3' }, { name: 'c', expr: 's1+prev' }] })
  assert('★ s_i = 第 i 段的值（s1=6），c = 6+6 = 12', near(withIndex.value.table[2].value, 12, 1e-9), JSON.stringify(withIndex.value.table.map((r) => r.value)))
  // 中文段名不能直接当变量
  const badRef = throwsOf(() => chain.runChain({ raw: 8, stages: [{ name: '运输成本', expr: 'raw' }, { name: '到岸价', expr: 'prev+运输成本' }] }))
  assert('★ 中文段名不能直接引用 → unknown_symbol', badRef?.type === 'unknown_symbol', badRef?.type)
  assert('unknown_symbol 的 hint 说明 as 用法', String(badRef?.hint ?? '').includes('as'), String(badRef?.hint ?? '').slice(0, 80))

  assert('缺 stages → missing_params', throwsOf(() => chain.runChain({ raw: 1, stages: [] }))?.type === 'missing_params', '')
  assert('缺 raw → missing_params', throwsOf(() => chain.runChain({ stages: [{ name: 'a', expr: '1' }] }))?.type === 'missing_params', '')
  assert('expr 非字符串 → invalid_argument', throwsOf(() => chain.runChain({ raw: 1, stages: [{ name: 'a', expr: 3 }] }))?.type === 'invalid_argument', '')
  assert('★ 除零 → non_finite（不静默给 0）', throwsOf(() => chain.runChain({ raw: 1, stages: [{ name: 'a', expr: 'raw/0' }] }))?.type === 'non_finite', '')
  const dominant = chain.runChain({
    raw: 100,
    stages: [{ name: '原料', expr: 'raw' }, { name: '原料处理', expr: 'prev+200', as: 'proc' }, { name: '精加工', expr: 'proc+5' }],
  })
  assert('★ 增量占 80% 的段被识别为断点', dominant.value.breakpoints.some((b) => b.includes('原料处理')), JSON.stringify(dominant.value.breakpoints))

  const single = chain.runChain({ raw: 5, stages: [{ name: '唯一', expr: 'raw' }] })
  assert('单段链也能跑', single.value.table.length === 1 && single.value.verdict.includes('只有一段'), single.value.verdict)
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. scaling：平方立方定律 --')
// ───────────────────────────────────────────────────────────
{
  const out = scaling.judgeScaling({ law: '平方立方', from: { size: 1 }, to: { size: 10 } })
  assert('尺寸比 = 10', near(out.value.sizeRatio, 10, 1e-9), String(out.value.sizeRatio))
  assert('★ 质量倍数 = 1000', near(out.value.factors.mass, 1000, 1e-6), String(out.value.factors.mass))
  assert('★ 截面积倍数 = 100', near(out.value.factors.area, 100, 1e-6), String(out.value.factors.area))
  assert('★ 单位面积负载 = 10 倍', near(out.value.loadPerSupportRatio, 10, 1e-6), String(out.value.loadPerSupportRatio))
  assert('判定说必然崩塌', out.value.verdict.includes('必然崩塌'), out.value.verdict)
  assert('note 讲清平方立方律的后果', out.value.note.includes('N³') && out.value.note.includes('N²'), out.value.note)
  assert('result 里出现倍数表', out.result.includes('mass ×1000'), out.result)

  const shrink = scaling.judgeScaling({ law: 'square-cube', from: { size: 4 }, to: { size: 1 } })
  assert('缩小 4 倍 → 负载降到 1/4', near(shrink.value.loadPerSupportRatio, 0.25, 1e-9), String(shrink.value.loadPerSupportRatio))
  assert('缩小判定说更安全', shrink.value.verdict.includes('更安全'), shrink.value.verdict)

  const linear = scaling.judgeScaling({ law: '线性', from: { size: 1 }, to: { size: 10 } })
  assert('线性律：质量只 ×10', near(linear.value.factors.mass, 10, 1e-9), String(linear.value.factors.mass))

  const custom = scaling.judgeScaling({
    law: 'custom',
    from: { size: 1 },
    to: { size: 10 },
    exponents: { size: 1, mass: 2, area: 1.5 },
  })
  assert('自定义指数：质量 ×100', near(custom.value.factors.mass, 100, 1e-6), String(custom.value.factors.mass))

  const withStrength = scaling.judgeScaling({ from: { size: 1 }, to: { size: 10 }, strengthScaling: 1 })
  assert('强度随尺寸线性增长 → 负载不变', near(withStrength.value.loadPerSupportRatio, 1, 1e-9), String(withStrength.value.loadPerSupportRatio))

  assert('缺 from → missing_params', throwsOf(() => scaling.judgeScaling({ to: { size: 1 } }))?.type === 'missing_params', '')
  assert('负尺寸 → invalid_argument', throwsOf(() => scaling.judgeScaling({ from: { size: -1 }, to: { size: 1 } }))?.type === 'invalid_argument', '')
  assert('★ 不认识的定律 → unknown_argument', throwsOf(() => scaling.judgeScaling({ law: '立方', from: { size: 1 }, to: { size: 2 } }))?.type === 'unknown_argument', '')
  assert('custom 缺 exponents → invalid_argument', throwsOf(() => scaling.judgeScaling({ law: 'custom', from: { size: 1 }, to: { size: 2 } }))?.type === 'invalid_argument', '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. anchor：只查表，不编数据 --')
// ───────────────────────────────────────────────────────────
{
  const anchors = [
    { name: '罗马帝国人口', value: 5.5e7, range: [4.5e7, 7e7], sources: ['示例来源 A'], confidence: '中', unit: '人' },
    { name: '地球半径', value: 6.371e6, unit: 'm', sources: ['bodies.json'], confidence: 'exact' },
  ]
  const out = anchor.lookupAnchor({ anchor: '罗马帝国人口', anchors })
  assert('查到值 5.5e7', near(out.value.value, 5.5e7, 1), String(out.value.value))
  assert('范围原样带回', JSON.stringify(out.value.range) === '[45000000,70000000]', JSON.stringify(out.value.range))
  assert('来源原样带回', out.value.sources[0] === '示例来源 A', '')
  assert('置信度原样带回', out.value.confidence === '中', out.value.confidence)
  assert('result 里出现来源与置信度', out.result.includes('示例来源 A') && out.result.includes('中'), '')

  const list = anchor.lookupAnchor({ list: true, anchors })
  assert('list 模式列出全部', list.value.anchors.length === 2 && list.result.includes('罗马帝国人口'), '')

  const fuzzy = anchor.lookupAnchor({ anchor: '罗马', anchors })
  assert('唯一包含匹配可命中', fuzzy.value.name === '罗马帝国人口', fuzzy.value.name)

  const noSource = anchor.lookupAnchor({ anchor: '无来源锚点', anchors: [{ name: '无来源锚点', value: 42 }] })
  assert('★ 无来源时 notice 提醒核实', (noSource.notice ?? '').includes('没有来源'), '')

  const missing = throwsOf(() => anchor.lookupAnchor({ anchor: '不存在的锚点', anchors }))
  assert('★ 查不到 → unknown_symbol', missing?.type === 'unknown_symbol', missing?.type)
  assert('unknown_symbol 的 hint 列出已收录', String(missing?.hint ?? '').includes('罗马帝国人口'), '')

  const empty = throwsOf(() => anchor.lookupAnchor({ anchor: 'x', anchors: [] }))
  assert('空表查询 → unknown_symbol（不编默认值）', empty?.type === 'unknown_symbol', empty?.type)

  assert('缺 anchors → missing_params', throwsOf(() => anchor.lookupAnchor({ anchor: 'x' }))?.type === 'missing_params', '')
  assert('anchors 非数组 → missing_params', throwsOf(() => anchor.lookupAnchor({ anchor: 'x', anchors: 'x' }))?.type === 'missing_params', '')
  assert('锚点 value 非数 → invalid_argument', throwsOf(() => anchor.lookupAnchor({ anchor: 'x', anchors: [{ name: 'x', value: 'y' }] }))?.type === 'invalid_argument', '')

  const ambiguous = throwsOf(() => anchor.lookupAnchor({ anchor: '地球', anchors: [
    { name: '地球半径', value: 6.371e6 },
    { name: '地球质量', value: 5.9722e24 },
  ] }))
  assert('★ 多条匹配 → invalid_argument（不随便挑一条）', ambiguous?.type === 'invalid_argument', ambiguous?.type)
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  · ' + f)
  process.exitCode = 1
}
