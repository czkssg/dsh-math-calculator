/**
 * consistency（跨条目结构体检）的测试。
 *
 * ## 借鉴来源：dsh-novel-writer 的 graph.js
 *
 * 它的开场白：
 * > 伏笔表/人物设定/时间线/剧情大纲在插件里都是**离散静态表**，没有任何跨章计算。
 * > 长篇崩掉通常不是某章文笔差，而是**「线断了、人丢了、伏笔忘了」**。
 *
 * 世界观推演里有完全同构的三个问题（设定陈条/势力缺席/依赖断线）。
 *
 * ## 本套件守四个移植过来的机制
 *
 *   ① **长词命中 1 个即算，短词要命中 ≥2 个**（防「的青铜」这类碎片假命中）
 *   ② **首现未知就记 null，不编造数字**
 *   ③ **阈可配**（默认缺席 5 段、陈条 10 段），且登记与实际的首次出现不一致时提示
 *   ④ **数据不足要降级说明**，不许把「算不出」当成「没问题」
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-cons-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool } = await import(pathToFileURL(join(root, 'lib/index.js')).href)

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

const run = (consistency) => runMathTool({ operation: 'consistency', consistency })
const txt = (r) => String(r.result ?? '')

/** 一个模拟的 12 段世界观。 */
const SECTIONS = [
  { number: 1, text: '北境冰原的铁矿支撑着整个王国的军备，寒鸦堡是唯一的冶炼地。' },
  { number: 2, text: '银月公会在王都活动，他们控制着南方的盐路。' },
  { number: 3, text: '王国的粮食主要来自东部平原，每年秋季征税。' },
  { number: 4, text: '寒鸦堡的炉火终年不熄，铁匠们昼夜轮班。' },
  { number: 5, text: '南方连年干旱，盐价飞涨。' },
  { number: 6, text: '北境的铁矿产量下滑，王国开始寻找新的矿源。' },
  { number: 7, text: '东部平原遭遇蝗灾，粮食减产三成。' },
  { number: 8, text: '王国财政吃紧，税负加重。' },
  { number: 9, text: '北境爆发矿工暴动。' },
  { number: 10, text: '王都派出军队镇压暴动。' },
  { number: 11, text: '战事持续，南方的盐路被切断。' },
  { number: 12, text: '王国陷入内乱。' },
]

const ENTRIES = [
  { id: 'T01', content: '北境冰原有大型铁矿', status: 'open', related: ['北境'] },
  { id: 'T02', content: '银月公会控制南方盐路', status: 'open', related: ['银月公会'] },
  { id: 'T03', content: '东部平原是主要粮仓', status: 'done', related: ['东部平原'] },
  { id: 'T04', content: '王都地下有上古遗迹', status: 'open', related: ['王都'] },
]

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ 陈条：立了多久没回收 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ sections: SECTIONS, entries: ENTRIES })
  const t01 = (r.value?.lifecycles ?? []).find((item) => item.id === 'T01')
  assert('T01 首现在第 1 段', t01?.firstSeen === 1, String(t01?.firstSeen))
  assert('T01 已过 11 段', t01?.distance === 11, String(t01?.distance))
  assert('T01 被标为陈条', (r.value?.findings ?? []).some((f) => f.kind === 'stale' && f.target === 'T01'), '')

  /** 已回收的条目不该报陈条。 */
  const t03 = (r.value?.lifecycles ?? []).find((item) => item.id === 'T03')
  assert('T03 状态是 done', t03?.status === 'done', String(t03?.status))
  assert('已回收条目不报陈条',
    !(r.value?.findings ?? []).some((f) => f.kind === 'stale' && f.target === 'T03'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 缺席：连续多少段没出现 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ sections: SECTIONS, entries: ENTRIES })
  const absence = (r.value?.absences ?? []).find((item) => item.name === '银月公会')
  assert('银月公会被算出缺席区间', (absence?.absentRun ?? []).length > 0, '')
  assert('缺席长度 ≥ 5 段', (absence?.absentRun ?? []).some((item) => item.length >= 5),
    JSON.stringify(absence?.absentRun))
  assert('缺席进 findings', (r.value?.findings ?? []).some((f) => f.kind === 'absence'), '')

  /** 阈值可配：调到 20 时不该报缺席。 */
  const loose = await run({ sections: SECTIONS, entries: ENTRIES, absenceThreshold: 20 })
  assert('阈值调大后不报缺席',
    !(loose.value?.findings ?? []).some((f) => f.kind === 'absence'), '')
  assert('阈值被记录', loose.value?.absenceThreshold === 20, String(loose.value?.absenceThreshold))
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. ★ 断线：剧情线的最大空档 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ sections: SECTIONS, entries: ENTRIES })
  const threads = r.value?.threads ?? []
  assert('聚出了剧情线', threads.length > 0, String(threads.length))
  /** 「银月公会」只在第 2 与第 11 段出现，中间断了 8 段。 */
  const guild = threads.find((item) => item.name === '银月公会')
  assert('银月公会线有最大空档', (guild?.maxGap ?? 0) > 0, String(guild?.maxGap))
  assert('断线进 findings', (r.value?.findings ?? []).some((f) => f.kind === 'gap'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. ★ 首现未知就记 null，不编造数字 --')
// ───────────────────────────────────────────────────────────
{
  /** T04「王都地下有上古遗迹」——正文里没有「上古遗迹」的痕迹。 */
  const r = await run({ sections: SECTIONS, entries: ENTRIES })
  const t04 = (r.value?.lifecycles ?? []).find((item) => item.id === 'T04')
  assert('T04 首现为空', t04?.firstSeen === null, String(t04?.firstSeen))
  assert('T04 distance 为空（不编造）', t04?.distance === null, String(t04?.distance))
  assert('★ 在 degraded 里如实说明', (r.value?.degraded ?? []).some((one) => /不编造数字/.test(one)),
    JSON.stringify((r.value?.degraded ?? []).slice(0, 2)))
  assert('T04 被标为「从未出现」',
    (r.value?.findings ?? []).some((f) => f.kind === 'orphan' && f.target === 'T04'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. ★ 长词命中 1 个，短词要 2 个（防碎片假命中）--')
// ───────────────────────────────────────────────────────────
{
  /**
   * 一个只在正文里「擦到一点边」的条目。
   *
   * 若判据是「任一 2 字片段命中即算」，「王国」这种高频二字词会让
   * 几乎所有条目都被判成「每段都提到」—— 那就是假命中。
   */
  const tricky = [
    { number: 1, text: '王国的北方有山。' },
    { number: 2, text: '王国的南方有海。' },
    { number: 3, text: '王国的西方有沙漠。' },
  ]
  const entries = [
    /** 内容里只有一个高频二字词「王国」，不该被判成每段都提及。 */
    { id: 'X1', content: '王国地图册', status: 'open' },
    /** 内容里有长词「北方的山」，应被认出。 */
    { id: 'X2', content: '北方有山且很高', status: 'open' },
  ]
  const r = await run({ sections: tricky, entries })
  const x1 = (r.value?.lifecycles ?? []).find((item) => item.id === 'X1')
  const x2 = (r.value?.lifecycles ?? []).find((item) => item.id === 'X2')
  assert('只命中单个二字词的条目不被当成到处都有', (x1?.mentionedIn ?? []).length <= 1,
    JSON.stringify(x1?.mentionedIn))
  assert('含长词的条目被认出', (x2?.mentionedIn ?? []).length >= 1, JSON.stringify(x2?.mentionedIn))
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 登记首现与实际不符要提示 --')
// ───────────────────────────────────────────────────────────
{
  const entries = [{ id: 'M1', content: '北境冰原有大型铁矿', firstSeen: 5, status: 'open' }]
  const r = await run({ sections: SECTIONS, entries })
  const life = (r.value?.lifecycles ?? []).find((item) => item.id === 'M1')
  /** 正文第 1 段就提到了，但登记说第 5 段。 */
  assert('实际首现取正文命中', life?.firstSeen === 1, String(life?.firstSeen))
  assert('★ 不一致被提示', (r.value?.findings ?? []).some((f) => f.kind === 'mismatch'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 没问题时要说没问题 --')
// ───────────────────────────────────────────────────────────
{
  const clean = await run({
    sections: [
      { number: 1, text: '寒鸦堡是铁矿冶炼地。' },
      { number: 2, text: '寒鸦堡的铁匠昼夜轮班。' },
      { number: 3, text: '寒鸦堡的炉火不熄。' },
    ],
    entries: [{ id: 'C1', content: '寒鸦堡是铁矿冶炼地', status: 'done' }],
  })
  assert('干净的世界观不报问题', (clean.value?.findings ?? []).length === 0,
    JSON.stringify((clean.value?.findings ?? []).map((f) => f.message)))
  assert('文本说「没发现结构问题」', /没发现结构问题/.test(txt(clean)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 错误处理与边界 --')
// ───────────────────────────────────────────────────────────
{
  const none = await runMathTool({ operation: 'consistency' })
  assert('不给参数报错', none.ok === false, String(none.ok))
  assert('报错给示例', /sections/.test(none.error?.hint ?? ''), '')

  const noSections = await run({ sections: [], entries: [] })
  assert('空 sections 报错', noSections.ok === false, String(noSections.ok))
  assert('说明为什么必须有 sections', /多久没提到/.test(noSections.error?.hint ?? ''), '')

  /** 没有条目只有片段：不该崩。 */
  const onlySections = await run({ sections: SECTIONS, entries: [] })
  assert('只有片段不崩', onlySections.ok === true, txt(onlySections).slice(0, 40))

  /** 片段乱序时按 number 排序后再算。 */
  const shuffled = await run({
    sections: [
      { number: 3, text: '寒鸦堡的炉火不熄。' },
      { number: 1, text: '寒鸦堡是铁矿冶炼地。' },
      { number: 2, text: '寒鸦堡的铁匠昼夜轮班。' },
    ],
    entries: [{ id: 'S1', content: '寒鸦堡是铁矿冶炼地', status: 'done' }],
  })
  assert('乱序片段按 number 排序', shuffled.value?.maxChapter === 3, String(shuffled.value?.maxChapter))
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. 结构化输出 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ sections: SECTIONS, entries: ENTRIES })
  for (const key of ['sections', 'entries', 'maxChapter', 'findings', 'lifecycles', 'absences', 'threads', 'degraded']) {
    assert('value 含 ' + key, r.value?.[key] !== undefined, '')
  }
  assert('findings 按严重度降序', (() => {
    const list = r.value?.findings ?? []
    for (let i = 1; i < list.length; i += 1) if (list[i].severity > list[i - 1].severity) return false
    return true
  })(), JSON.stringify((r.value?.findings ?? []).map((f) => f.severity)))
  assert('结果可 JSON 序列化', (() => {
    try { JSON.stringify(r.value); return true } catch { return false }
  })(), '')
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
