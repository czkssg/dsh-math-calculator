/**
 * consistency（数值口径体检）的测试。
 *
 * ## 这个套件记录了一次方向更正
 *
 * 第一版照搬了 novel-writer 的三个叙事检查（陈条/缺席/断线），
 * 理由是「小说与世界观同构」。**那是错的**，实测两个反例：
 *
 * ```
 * ① 正常背景设定被误报陈条
 *    第 1 段「行星半径 8000 公里」，之后 19 段讲政治
 *    → 报「立了 19 段还没回收」
 *    → 但常量型设定本来就不该被「回收」
 *
 * ② 真实硬伤查不出
 *    第 1 段「人口 920 亿」、第 5 段「人口 8 亿」（差 115 倍）
 *    → 报「没发现结构问题」
 * ```
 *
 * 差异的本质：
 *
 * ```
 *   小说是「顺序阅读」       世界观是「查询式使用」
 *   读者会忘 → 缺席是问题     按需查 → 缺席不是问题
 *   伏笔必有回收 → 陈条是问题 常量永不回收 → 陈条不是问题
 *   一致性 = 前后提及对得上   一致性 = **同一件事两处说的数相悖**
 * ```
 *
 * 反馈包 282 条硬伤里，一致性类全是数值层（W13 人口三口径差 10–33 倍、
 * W18 39 亿 vs「数百万计」、W20 42 MJ/kg 与 3.7 倍不自洽）。
 *
 * ## 本套件守三件事
 *
 *   ① **真实硬伤形态必须检出**（同量多值、分项不符、单位不一）
 *   ② **正常背景设定不许误报**（常量型设定立一次不重复是对的）
 *   ③ **抽不到东西时必须说「不可信」**（「没冲突」不能等同于「检查过了」）
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

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ 真实硬伤：同一量多处不同值 --')
// ───────────────────────────────────────────────────────────
{
  /** 反馈包 W13 的真实形态：人口三套口径差 10–33 倍。 */
  const pop = await run({
    sections: [
      { number: 1, text: '巢都总人口 920 亿，分布在 99 层。' },
      { number: 5, text: '全巢都人口约 8 亿，其中底层占多数。' },
      { number: 9, text: '巢都人口达到 920 亿后开始外溢。' },
    ],
  })
  assert('人口 920亿 vs 8亿 被检出', (pop.value?.inconsistencies ?? []).length > 0,
    JSON.stringify((pop.value?.inconsistencies ?? []).map((i) => i.subject)))
  assert('主体是「人口」', pop.value?.inconsistencies?.[0]?.subject === '人口',
    String(pop.value?.inconsistencies?.[0]?.subject))
  assert('差 115 倍被算出', /115/.test(txt(pop)), txt(pop).split('\n').find((l) => /冲突/.test(l)) ?? '')
  /** 115 倍属于「明确冲突」档（10–100 倍 → severity 7，>100 → 10）。 */
  assert('严重度 ≥ 7', (pop.value?.inconsistencies?.[0]?.severity ?? 0) >= 7,
    String(pop.value?.inconsistencies?.[0]?.severity))
  assert('列出各处主张供核对', (pop.value?.inconsistencies?.[0]?.quantities ?? []).length >= 3, '')

  /** 面积差 10 倍。 */
  const area = await run({
    sections: [
      { number: 1, text: '帝国面积 1200 万平方公里。' },
      { number: 4, text: '帝国国土面积约 120 万平方公里。' },
    ],
  })
  assert('面积差 10 倍被检出', (area.value?.inconsistencies ?? []).some((i) => i.subject === '面积'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 正常背景设定不许误报（这是上一版的错）--')
// ───────────────────────────────────────────────────────────
{
  /**
   * 常量型设定：第 1 段写行星参数，之后 19 段全讲政治。
   *
   * 上一版会报「P01 立了 19 段还没回收」—— 那是把小说的「伏笔」概念
   * 硬套到世界观的「常量」上。常量立一次一直有效才对。
   */
  const world = await run({
    sections: [
      { number: 1, text: '这颗行星半径 8000 公里，表面重力 1.4 倍地球。' },
      ...Array.from({ length: 19 }, (_, i) => ({
        number: i + 2,
        text: '第 ' + (i + 2) + ' 段：王国财政与军费争执，税负加重。',
      })),
    ],
  })
  assert('★ 常量型设定不被误报', (world.value?.inconsistencies ?? []).length === 0,
    JSON.stringify((world.value?.inconsistencies ?? []).map((i) => i.message)))
  assert('文本说没发现冲突', /没发现数值口径冲突/.test(txt(world)), '')
  /** 不该再出现「陈条/缺席/断线」这些叙事层词汇。 */
  assert('不再报陈条', !/陈条/.test(txt(world)), '')
  assert('不再报缺席', !/\[缺席\]/.test(txt(world)), '')
  assert('不再报断线', !/\[断线\]/.test(txt(world)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 同一值重复出现不算冲突 --')
// ───────────────────────────────────────────────────────────
{
  const same = await run({
    sections: [
      { number: 1, text: '巢都人口 920 亿。' },
      { number: 3, text: '人口 920 亿的巢都，分 99 层。' },
      { number: 7, text: '巢都人口仍是 920 亿。' },
    ],
  })
  assert('同值多处出现不算冲突', (same.value?.inconsistencies ?? []).length === 0,
    JSON.stringify((same.value?.inconsistencies ?? []).map((i) => i.message)))
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 阈值：3 倍以内算口径差异，不算冲突 --')
// ───────────────────────────────────────────────────────────
{
  /** 1000 万人 vs 2000 万 = 2 倍，可能是「含/不含周边」，不算**数值冲突**。 */
  const mild = await run({
    sections: [
      { number: 1, text: '首都有 1000 万人。' },
      { number: 3, text: '首都人口约 2000 万。' },
    ],
  })
  assert('2 倍差异不算数值冲突',
    !(mild.value?.inconsistencies ?? []).some((i) => i.kind === 'multi_value'),
    JSON.stringify((mild.value?.inconsistencies ?? []).map((i) => i.message)))
  /**
   * 但「1000 万人」与「2000 万」的**单位实质相同**（都是「人」，一个省略了），
   * 所以不该报单位不一致 —— 那只是写法差异，不是口径差异。
   */
  assert('单位实质相同不报 unit_mismatch',
    !(mild.value?.inconsistencies ?? []).some((i) => i.kind === 'unit_mismatch'),
    JSON.stringify((mild.value?.inconsistencies ?? []).map((i) => i.kind)))

  /** 自定义阈值：调到 1.5 时该报数值冲突。 */
  const strict = await run({
    sections: [
      { number: 1, text: '首都有 1000 万人。' },
      { number: 3, text: '首都人口约 2000 万。' },
    ],
    conflictRatio: 1.5,
  })
  assert('阈值调严后报数值冲突',
    (strict.value?.inconsistencies ?? []).some((i) => i.kind === 'multi_value'),
    JSON.stringify((strict.value?.inconsistencies ?? []).map((i) => i.kind)))
  assert('阈值被记录', strict.value?.conflictRatio === 1.5, String(strict.value?.conflictRatio))
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. ★ 抽不到东西必须说「不可信」--')
// ───────────────────────────────────────────────────────────
{
  /** 纯叙述段，一个带量级的数都没有。 */
  const prose = await run({
    sections: [
      { number: 1, text: '北境的风终年不停，雪盖住了道路。' },
      { number: 2, text: '旅人很难在冬天穿越这片区域。' },
    ],
  })
  assert('抽到 0 条主张', prose.value?.quantityCount === 0, String(prose.value?.quantityCount))
  assert('★ 明说「没抽到」的两种可能', /一条数值主张都没抽到/.test(txt(prose)), '')
  assert('★ 明说「没冲突」不可信', /误读成「检查过了没问题」/.test(txt(prose)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 不同主体不许混比 --')
// ───────────────────────────────────────────────────────────
{
  /** 人口 8 亿、面积 8 亿平方公里 —— 数值相同但主体不同，不该互相抵消或混比。 */
  const mixed = await run({
    sections: [
      { number: 1, text: '人口 8 亿，面积 800 万平方公里。' },
      { number: 2, text: '人口 920 亿。' },
    ],
  })
  const subjects = mixed.value?.subjects ?? []
  assert('人口与面积被分开归组', subjects.includes('人口') && subjects.includes('面积'),
    JSON.stringify(subjects))
  const popIssue = (mixed.value?.inconsistencies ?? []).find((i) => i.subject === '人口')
  assert('人口冲突被识别', popIssue !== undefined, '')
  /** 面积只有一处，不该报冲突。 */
  assert('面积只有一处不报冲突',
    !(mixed.value?.inconsistencies ?? []).some((i) => i.subject === '面积' && i.kind === 'multi_value'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 单位口径 --')
// ───────────────────────────────────────────────────────────
{
  /** 数值一致但单位写法不同（不冲突，但要提示统一）。 */
  const units = await run({
    sections: [
      { number: 1, text: '人口 8 亿人。' },
      { number: 2, text: '人口 8 亿。' },
    ],
  })
  /** 数值相同 → 不报 multi_value；单位不同 → 可能报 unit_mismatch（severity 低）。 */
  assert('数值相同不报 multi_value',
    !(units.value?.inconsistencies ?? []).some((i) => i.kind === 'multi_value'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 错误处理与边界 --')
// ───────────────────────────────────────────────────────────
{
  const none = await runMathTool({ operation: 'consistency' })
  assert('不给参数报错', none.ok === false, String(none.ok))
  assert('报错说明查的是数值口径', /同一量/.test(none.error?.hint ?? ''), '')

  const empty = await run({ sections: [] })
  assert('空 sections 报错', empty.ok === false, String(empty.ok))

  /** 乱序片段按 number 排序。 */
  const shuffled = await run({
    sections: [
      { number: 3, text: '人口 8 亿。' },
      { number: 1, text: '人口 920 亿。' },
    ],
  })
  const q = shuffled.value?.inconsistencies?.[0]?.quantities ?? []
  assert('乱序按 number 排序后比对', q.length === 2, String(q.length))
  assert('排在最前的是第 1 段', q[0]?.section === 1, String(q[0]?.section))

  /** 单片段：只有一处，不该报冲突。 */
  const one = await run({ sections: [{ number: 1, text: '人口 920 亿。' }] })
  assert('单片段不报冲突', (one.value?.inconsistencies ?? []).length === 0, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. 结构化输出 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({
    sections: [
      { number: 1, text: '巢都人口 920 亿。' },
      { number: 5, text: '人口约 8 亿。' },
    ],
  })
  for (const key of ['sections', 'quantities', 'subjects', 'inconsistencies', 'conflictRatio', 'quantityCount']) {
    assert('value 含 ' + key, r.value?.[key] !== undefined, '')
  }
  assert('inconsistencies 按严重度降序', (() => {
    const list = r.value?.inconsistencies ?? []
    for (let i = 1; i < list.length; i += 1) if (list[i].severity > list[i - 1].severity) return false
    return true
  })(), '')
  assert('结果可 JSON 序列化', (() => {
    try { JSON.stringify(r.value); return true } catch { return false }
  })(), '')
  /** 每条冲突都要带原文片段，便于核对。 */
  const first = r.value?.inconsistencies?.[0]?.quantities?.[0]
  assert('主张带原文片段', typeof first?.raw === 'string' && first.raw.length > 0, String(first?.raw))
  assert('主张带片段号', typeof first?.section === 'number', String(first?.section))
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
