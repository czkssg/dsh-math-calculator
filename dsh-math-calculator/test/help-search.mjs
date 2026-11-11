/**
 * help 搜索引擎的测试。
 *
 * ## 为什么需要搜索
 *
 * 目录能回答「有哪些能力」，但答不了「我想做的那件事对应哪个能力」。
 * 实测：AI 拿着「这个城能守多久」这类问题，在目录里找不到对应项 ——
 * 目录用的是**能力名**，而它脑子里是**任务描述**。
 *
 * 本套件守三件事：
 *
 *   ① **任务描述能命中正确的能力**（这是搜索存在的唯一理由）
 *   ② **不该命中的不许命中**（别名太泛会让每条查询都「有结果」，等于没有搜索）
 *   ③ **弱匹配要诚实**（搜不到时说「大概率没有」，而不是给一条像模像样的错结果）
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-helpsearch-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { searchHelp } = await import(pathToFileURL(join(root, 'lib/help.js')).href)

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

const run = (args) => runMathTool({ operation: 'help', ...args })
const txt = (r) => String(r.result ?? '')

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ 任务描述能命中正确的能力 --')
// ───────────────────────────────────────────────────────────
{
  /**
   * 这些查询的共同点：**没有一个词是能力名**。
   * 它们全是「我要做一件事」的说法，而搜索的价值正在于此。
   */
  const cases = [
    ['账本对不上', ['ledger']],
    ['占比加起来不对', ['ledger']],
    ['粮食够不够', ['balance']],
    ['这个城能守多久', ['balance', 'feasibility']],
    ['大约一万吨怎么算', ['interval']],
    ['单位换算', ['units']],
    ['改了常数会影响什么', ['constants']],
    ['微分方程逐年表', ['ode']],
    ['解方程', ['solve']],
    ['星球重力', ['world']],
  ]
  for (const [query, expected] of cases) {
    const hits = searchHelp(query, 3)
    const keys = hits.map((hit) => hit.key)
    assert(
      `「${query}」命中 ${expected.join('/')} 之一`,
      expected.some((key) => keys.includes(key)),
      '实际命中: ' + (keys.join(', ') || '（无）'),
    )
  }
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. 精确 key 查询必须排第一（别名不能盖过正名） --')
// ───────────────────────────────────────────────────────────
{
  for (const key of ['ledger', 'interval', 'units', 'world', 'evaluate', 'ode']) {
    const hits = searchHelp(key, 3)
    assert(`搜 "${key}" 时 ${key} 排第一`, hits[0]?.key === key, '实际第一: ' + (hits[0]?.key ?? '（无）'))
  }
  /** 中文 key 别名（矩阵/星球/单位）也该命中对应节。 */
  const cn = [
    ['矩阵', 'linalg'],
    ['星球', 'world'],
    ['单位', 'units'],
    ['区间', 'interval'],
    ['台账', 'ledger'],
  ]
  for (const [query, expected] of cn) {
    const hits = searchHelp(query, 3)
    assert(`中文别名「${query}」命中 ${expected}`,
      hits.some((hit) => hit.key === expected),
      '实际: ' + hits.map((hit) => hit.key).join(', '))
  }
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 排序：key 命中要压过正文命中 --')
// ───────────────────────────────────────────────────────────
{
  /** `ledger` 这个词在 recipe 的正文里也出现过（「账本闭合」），但正名该第一。 */
  const hits = searchHelp('ledger', 5)
  assert('ledger 正名分数远高于其它', hits[0].score >= 40, String(hits[0].score))
  /** 分数必须单调递减。 */
  let ordered = true
  for (let i = 1; i < hits.length; i += 1) {
    if (hits[i].score > hits[i - 1].score) ordered = false
  }
  assert('结果按分数降序', ordered, hits.map((hit) => hit.score).join('>'))
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. ★ 弱匹配必须诚实（不许给像模像样的错结果） --')
// ───────────────────────────────────────────────────────────
{
  /**
   * 一个这个工具**根本不做**的事。
   *
   * 搜索可能命中某个含相同字的节，但那种命中分数很低。
   * 关键不是「返回空」，而是**返回时必须标明「大概率没有对应节」**。
   */
  const r = await run({ helpQuery: '帮我把这段英文翻译成法语' })
  const body = txt(r)
  const weakMarked = /大概率没有正好对应的节/.test(body)
  const noHit = /没有找到与/.test(body)
  assert('无关查询要么明说没有，要么标明弱匹配', weakMarked || noHit, body.split('\n')[0].slice(0, 60))
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. helpQuery 与 helpTopic 的分工 --')
// ───────────────────────────────────────────────────────────
{
  /** helpTopic 给全文。 */
  const full = await run({ helpTopic: 'ledger' })
  assert('helpTopic 返回该节全文', full.ok === true && /台账闭合/.test(txt(full)), '')
  assert('全文比搜索长得多', txt(full).length > 300, String(txt(full).length))

  /** helpQuery 给排序列表，不给全文。 */
  const search = await run({ helpQuery: '账本' })
  assert('helpQuery 返回搜索列表', /═══ 搜索/.test(txt(search)), '')
  assert('搜索列表列出多个候选', (search.value?.hits ?? []).length > 0, '')
  assert('搜索结果是结构化 hits', Array.isArray(search.value?.hits), '')

  /**
   * ★ 即使 helpQuery 的内容恰好是个合法 key，也必须给搜索而不是全文。
   *
   * 调用方说了「我要搜」，就该得到搜索结果 —— 否则它以为在搜，
   * 实际拿到单节全文，会漏掉其它可能更合适的节。
   */
  const both = await run({ helpTopic: 'world', helpQuery: '账本' })
  assert('给了 helpQuery 时优先搜索', /═══ 搜索/.test(txt(both)), txt(both).split('\n')[0].slice(0, 40))
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 查不到 helpTopic 时自动降级成搜索 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ helpTopic: '账本对不上' })
  assert('不认识的主题不直接甩目录', !/能力目录/.test(txt(r)), '')
  assert('而是先搜索', /═══ 搜索|没有找到与/.test(txt(r)), txt(r).split('\n')[0].slice(0, 40))
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 边界 --')
// ───────────────────────────────────────────────────────────
{
  assert('空查询不崩', searchHelp('', 5).length === 0, '')
  assert('单字符查询不崩', Array.isArray(searchHelp('a', 5)), '')
  assert('极长查询不崩', Array.isArray(searchHelp('这个城能守多久'.repeat(20), 5)), '')
  assert('limit 生效', searchHelp('单位', 2).length <= 2, String(searchHelp('单位', 2).length))

  const empty = await run({ helpQuery: '   ' })
  assert('空白 helpQuery 退回目录', /能力目录/.test(txt(empty)), txt(empty).split('\n')[0].slice(0, 40))

  /** 全中文无空格、带标点、混英文都要能处理。 */
  for (const query of ['单位，换算。', 'ode 怎么写', 'LEDGER 是什么', '？']) {
    const hits = searchHelp(query, 3)
    assert(`查询「${query}」不崩`, Array.isArray(hits), '')
  }
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
