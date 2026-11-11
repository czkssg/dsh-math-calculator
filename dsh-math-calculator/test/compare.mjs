/**
 * compare（多方案对比）的测试。
 *
 * ## 它和 derivation="compare" 不是一回事
 *
 * ```
 *   derivation="compare"   版本对比（同一个世界的 v1 vs v2，读归档）
 *   operation="compare"     方案对比（几个互斥选项，比指标）
 * ```
 *
 * 前者答「我改了什么」，后者答「我该选哪个」。
 *
 * ## 本套件守三件事
 *
 *   ① **表与逐列胜者算对**（这是基础）
 *   ② **不给权重就不给综合分**（工具不猜「哪个指标更重要」）
 *   ③ **给了权重时明说「排序由权重决定」**（避免把加权结果当客观优劣）
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-compare-'))
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

const run = (compare) => runMathTool({ operation: 'compare', compare })
const txt = (r) => String(r.result ?? '')

/** 反馈包第 43 轮的真实例子：列强国力表。 */
const EMPIRES = {
  rows: ['维多利亚', '高卢', '条顿'],
  cols: ['综合国力', '工业产能', '金融航运', '军事'],
  data: [
    [100, 95, 130, 105],
    [85, 80, 90, 115],
    [90, 110, 70, 125],
  ],
}

// ───────────────────────────────────────────────────────────
console.log('-- 1. 表格与逐列胜者 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run(EMPIRES)
  assert('三行四列被接受', r.ok === true, txt(r).slice(0, 50))
  assert('渲染出表格', /方案/.test(txt(r)) && /维多利亚/.test(txt(r)), '')
  assert('四个指标都出现在表头', ['综合国力', '工业产能', '金融航运', '军事']
    .every((col) => txt(r).includes(col)), '')

  const best = r.value?.columnBest ?? []
  assert('逐列胜者共 4 条', best.length === 4, String(best.length))
  const byCol = Object.fromEntries(best.map((item) => [item.col, item.winner]))
  assert('综合国力最强是维多利亚', byCol['综合国力'] === '维多利亚', byCol['综合国力'])
  assert('工业产能最强是条顿', byCol['工业产能'] === '条顿', byCol['工业产能'])
  assert('金融航运最强是维多利亚', byCol['金融航运'] === '维多利亚', byCol['金融航运'])
  assert('军事最强是条顿', byCol['军事'] === '条顿', byCol['军事'])
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 不给权重就不给综合分 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run(EMPIRES)
  assert('没有 weights 时 score 全为 null',
    (r.value?.scores ?? []).every((item) => item.score === null), '')
  assert('没有 weights 时 rank 全为 null',
    (r.value?.scores ?? []).every((item) => item.rank === null), '')
  assert('没有 weights 时 winner 为 null', r.value?.winner === null, String(r.value?.winner))
  assert('文本明说不给综合分', /不给综合分/.test(txt(r)), '')
  assert('文本解释为什么不给', /不猜|哪个指标更重要/.test(txt(r)), '')
  assert('文本给出补权重的写法', /weights/.test(txt(r)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 给了权重：算分、排名、并声明「排序由权重决定」 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ ...EMPIRES, weights: [1, 10, 1, 1] })
  assert('有权重时 score 非 null',
    (r.value?.scores ?? []).every((item) => typeof item.score === 'number'), '')
  assert('有权重时 rank 齐全',
    (r.value?.scores ?? []).every((item) => typeof item.rank === 'number'), '')
  assert('rank 是 1..3 的排列',
    JSON.stringify((r.value?.scores ?? []).map((item) => item.rank).sort()) === '[1,2,3]',
    JSON.stringify((r.value?.scores ?? []).map((item) => item.rank)))
  assert('winner 是最高的那个', typeof r.value?.winner === 'string', String(r.value?.winner))

  /**
   * ★ 核心：换权重会换排序。
   *
   * 这不是 bug，是设计意图 —— 它在告诉调用方
   * 「哪个指标更重要」这个判断是**你**做的，不是工具做的。
   */
  const heavyIndustry = await run({ ...EMPIRES, weights: [1, 10, 1, 1] })
  const heavyMilitary = await run({ ...EMPIRES, weights: [1, 1, 1, 10] })
  const rankOf = (r, name) => (r.value?.scores ?? []).find((item) => item.name === name)?.rank
  assert('重工业时条顿第一', rankOf(heavyIndustry, '条顿') === 1, String(rankOf(heavyIndustry, '条顿')))
  assert('重军事时条顿也第一', rankOf(heavyMilitary, '条顿') === 1, String(rankOf(heavyMilitary, '条顿')))
  /** 高卢与维多利亚的相对位置随权重改变。 */
  assert('两种权重下第三名不同',
    rankOf(heavyIndustry, '高卢') !== rankOf(heavyMilitary, '高卢'),
    `重工业 高卢=${rankOf(heavyIndustry, '高卢')}，重军事 高卢=${rankOf(heavyMilitary, '高卢')}`)

  assert('文本声明「不是客观优劣」', /不是客观优劣|权重换了排序就换/.test(txt(r)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 归一化的口径 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ ...EMPIRES, weights: [1, 1, 1, 1] })
  const norm = r.value?.normalized ?? []
  /** 每列的最大值归一后必须是 1。 */
  for (let j = 0; j < EMPIRES.cols.length; j += 1) {
    const colMax = Math.max(...norm.map((row) => row[j]))
    assert(`第 ${j + 1} 列最大值归一为 1`, Math.abs(colMax - 1) < 1e-9, String(colMax))
  }
  /** 归一后所有值都在 0..1。 */
  assert('归一值都在 0..1',
    norm.every((row) => row.every((value) => value >= 0 && value <= 1)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 并列胜者要被标出来 --')
// ───────────────────────────────────────────────────────────
{
  const tie = await run({
    rows: ['甲', '乙'],
    cols: ['得分'],
    data: [[100], [100]],
  })
  const best = tie.value?.columnBest?.[0]
  assert('并列时 winner 列出两个', /甲/.test(best?.winner ?? '') && /乙/.test(best?.winner ?? ''),
    String(best?.winner))
  assert('并列时 tie 为 true', best?.tie === true, String(best?.tie))
  assert('文本警告并列', /并列/.test(txt(tie)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 全零列不产生假胜者 --')
// ───────────────────────────────────────────────────────────
{
  const zero = await run({
    rows: ['甲', '乙'],
    cols: ['有值', '全零'],
    data: [[10, 0], [20, 0]],
  })
  const norm = zero.value?.normalized ?? []
  assert('全零列归一后仍为 0（不做除法）',
    norm.every((row) => row[1] === 0), JSON.stringify(norm))
  assert('有值列仍正常归一', norm[1]?.[0] === 1, String(norm[1]?.[0]))
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 错误处理 --')
// ───────────────────────────────────────────────────────────
{
  const none = await runMathTool({ operation: 'compare' })
  assert('不给 compare 报错', none.ok === false, String(none.ok))
  assert('报错给示例', /rows/.test(none.error?.hint ?? ''), '')

  const noRows = await run({ cols: ['a'], data: [[1]] })
  assert('缺 rows 报错', noRows.ok === false, String(noRows.ok))

  const rowMismatch = await run({ rows: ['甲', '乙'], cols: ['a'], data: [[1]] })
  assert('data 行数与 rows 不符报错', rowMismatch.ok === false, String(rowMismatch.ok))
  assert('报错说清行数', /2/.test(rowMismatch.error?.message ?? ''), rowMismatch.error?.message?.slice(0, 40))

  const cellMismatch = await run({ rows: ['甲'], cols: ['a', 'b'], data: [[1]] })
  assert('行内格子数与 cols 不符报错', cellMismatch.ok === false, String(cellMismatch.ok))

  const badCell = await run({ rows: ['甲'], cols: ['a'], data: [['不是数']] })
  assert('非数字格子报错', badCell.ok === false, String(badCell.ok))

  const badWeights = await run({ rows: ['甲'], cols: ['a'], data: [[1]], weights: [1, 2] })
  assert('weights 长度不符报错', badWeights.ok === false, String(badWeights.ok))

  const zeroWeights = await run({ rows: ['甲', '乙'], cols: ['a'], data: [[1], [2]], weights: [0] })
  assert('weights 全零报错', zeroWeights.ok === false, String(zeroWeights.ok))
  assert('全零时提示「不想加权就别传」', /不想加权就别传/.test(zeroWeights.error?.hint ?? ''),
    zeroWeights.error?.hint?.slice(0, 40))

  const negWeights = await run({ rows: ['甲'], cols: ['a'], data: [[1]], weights: [-1] })
  assert('负权重报错', negWeights.ok === false, String(negWeights.ok))
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 与 derivation="compare" 不冲突 --')
// ───────────────────────────────────────────────────────────
{
  /** 版本对比走 derivation 的子命令，不该被新 operation 抢走。 */
  const version = await runMathTool({ operation: 'derivation', derivation: 'compare' })
  assert('derivation="compare" 仍可用', version.ok === true, txt(version).slice(0, 40))
  assert('它说的是「版本」不是「方案」', /版本|归档/.test(txt(version)), '')

  const scheme = await runMathTool({ operation: 'compare', compare: EMPIRES })
  assert('operation="compare" 说「方案」', /方案对比/.test(txt(scheme)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. 结构化输出 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ ...EMPIRES, weights: [1, 1, 1, 1] })
  for (const key of ['rows', 'cols', 'data', 'weights', 'normalized', 'columnBest', 'scores', 'winner']) {
    assert('value 含 ' + key, r.value?.[key] !== undefined, '')
  }
  assert('结果可 JSON 序列化', (() => {
    try { JSON.stringify(r.value); return true } catch { return false }
  })(), '')
  /** 单方案也能跑（退化情形）。 */
  const one = await run({ rows: ['唯一'], cols: ['a', 'b'], data: [[1, 2]] })
  assert('单方案不崩', one.ok === true, txt(one).slice(0, 40))
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
