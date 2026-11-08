/**
 * 分节帮助系统（v2.3.0）。
 *
 * ## 这套测试守什么
 *
 * 改造的动机是「每次调用都付全量 help 的成本」，所以第一件事是**证明真的省了**：
 * 目录要小、单节要小。但如果省到「AI 找不到功能」，那是另一种失败 ——
 * 所以第二件事是**证明目录可发现**：每节有说清用途的简介，别名能命中。
 *
 * 这两条互相拉扯，必须同时断言，否则很容易滑向任何一边。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-help-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool
const helpMod = await import(pathToFileURL(join(root, 'lib/help.js')).href)
const TOPICS = helpMod.HELP_TOPICS

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const text = async (args) => String((await run(args)).result || '')

console.log('-- 1. 目录层：小、且能指向每一节 --')
{
  const index = await text({ operation: 'help' })
  /**
   * ## 目录预算收紧（用户 2026-11-07 要求）
   *
   * 用户原话：「压缩目录本身的字符数，合并同类项减少目录本身的字数，
   * 加减乘除高频其余低频可以折叠。」
   *
   * 旧目录 1731 字符，其中 432 是「也可写: 别名…」清单——而那些别名
   * 本来就能通过 alias 匹配命中，列出来只为「让人看见」，AI 并不需要。
   *
   * 现在折叠后目录约 700 字符。上限设 900 是为了防止将来又悄悄膨胀回去。
   */
  assert('目录压到 900 以内', index.length <= 900, index.length + ' 字符（旧版 1731）')
  assert('目录自称是目录', /目录/.test(index), '')
  assert('目录说明了两步查法', /helpTopic/.test(index), '')

  /** 每一节的 key 都必须出现在目录里，否则 AI 无从得知它存在。 */
  const missing = TOPICS.filter((t) => !index.includes(t.key))
  assert('目录列出全部 ' + TOPICS.length + ' 节', missing.length === 0,
    '缺: ' + missing.map((t) => t.key).join(', '))

  /**
   * 简介的完整性与「折叠」是两件事，必须分开守：
   *
   *   · **每个 topic 都要有一句说清用途的 summary**（≥15 字）——
   *     折叠只影响它出不出现在目录里，不影响它存在。查那一节时仍会读到。
   *   · **高频（tier=core）节的 summary 必须出现在目录里** ——
   *     它们才是「目录要让人发现」的那部分。
   */
  const thin = TOPICS.filter((t) => t.summary.trim().length < 15)
  assert('每节都有一句够具体的简介（≥15 字）', thin.length === 0,
    thin.map((t) => t.key + ':' + t.summary.length).join(', '))

  const coreTopics = TOPICS.filter((t) => t.tier === 'core')
  assert('core 档节数（按实测频率定为 6）', coreTopics.length === 6, String(coreTopics.length))
  const coreNoSummary = coreTopics.filter((t) => !index.includes(t.summary.slice(0, 10)))
  assert('高频节的简介都出现在目录里', coreNoSummary.length === 0,
    coreNoSummary.map((t) => t.key).join(', '))

  /**
   * ## 分档必须有实测依据，不能凭印象（用户 2026-11-07 要求）
   *
   * 「高低频根据目前的实践文档进行统计频率来调整显示」。
   * 这里守两件事：
   *   1. 每节都带 weight（来自 6 份实践文档的关键词统计）；
   *   2. core 档的权重**整体高于** extra 档 —— 若某天有人凭感觉把一节
   *      提进 core 却没数据支撑，这条会红。
   */
  const noWeight = TOPICS.filter((t) => typeof t.weight !== 'number')
  assert('每节都登记实测权重', noWeight.length === 0, noWeight.map((t) => t.key).join(', '))
  /**
   * 用**中位数**而不是极值来判「分档有序」。
   *
   * 踩过：第一版写 `min(core) >= max(extra)`，被 `domains` 卡住 ——
   * 它是新增节、文档里还没人用过，权重 0 是**事实**（不是拍脑袋填的），
   * 而「新功能就该用 0」本身是对的：权重是「已发生的使用量」，不是「重要性」。
   * 用极值判会把这种正常情形判成错误。
   */
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }
  const coreMedian = median(coreTopics.map((t) => t.weight ?? 0))
  const extraMedian = median(TOPICS.filter((t) => t.tier === 'extra').map((t) => t.weight ?? 0))
  assert('core 权重中位数明显高于 extra', coreMedian > extraMedian * 2,
    'core 中位 ' + coreMedian + ' vs extra 中位 ' + extraMedian)

  /** 新节（权重 0）必须在正文里有说明，而不是只填 0 了事。 */
  const zeroWeight = TOPICS.filter((t) => (t.weight ?? 0) === 0)
  for (const topic of zeroWeight) {
    const body = await text({ operation: 'help', helpTopic: topic.key })
    assert('权重 0 的节仍有完整正文: ' + topic.key, body.length > 200, String(body.length))
  }

  /**
   * 目录里的展示顺序必须**按权重降序** —— 这是「高频优先」的实际体现。
   * 判据：evaluate 与 units 必须出现在 solve 之前（250/173 vs 59）。
   */
  const iEval = index.indexOf('evaluate')
  const iUnits = index.indexOf('units')
  const iSolve = index.indexOf('solve')
  assert('高频节按权重排在前', iEval >= 0 && iUnits >= 0 && iSolve >= 0 && iEval < iUnits && iUnits < iSolve,
    'evaluate@' + iEval + ' units@' + iUnits + ' solve@' + iSolve)

  /**
   * `solve` 必须是独立节 —— 实测 59 排第三，旧版把它折在 evaluate 里，
   * 那是分档时最容易漏的一处。
   */
  const solveTopic = TOPICS.find((t) => t.key === 'solve')
  assert('solve 是独立节（信号量 59 排第三）', Boolean(solveTopic) && solveTopic.tier === 'core',
    String(solveTopic?.tier))
  const solveBody = await text({ operation: 'help', helpTopic: 'solve' })
  assert('solve 节含退化方程组的说明', /无穷多解/.test(solveBody), '')
  assert('solve 节含 system 与 integral', /system/.test(solveBody) && /integral/.test(solveBody), '')

  /**
   * 折叠节必须仍**可被识别**：目录里要有 key 与短标签，
   * 否则「折叠」就变成了「藏起来」。
   */
  const extraTopics = TOPICS.filter((t) => t.tier === 'extra')
  const extraBroken = extraTopics.filter((t) => !index.includes(t.key) || !t.short)
  assert('折叠节仍有 key 与短标签', extraBroken.length === 0,
    extraBroken.map((t) => t.key).join(', '))
}

console.log('-- 2. 单节：按需取用，且比全文小得多 --')
{
  let total = 0
  for (const topic of TOPICS) {
    const body = await text({ operation: 'help', helpTopic: topic.key })
    total += body.length
    assert('节 ' + topic.key + ' 有正文', body.length > 50, String(body.length))
    /**
     * 单节上限 9000（原 5900 = 「旧版全文」）。
     *
     * ★ 为什么必须放宽：分节的目的**就是让单节写得更细**。
     *
     * 旧版是一块 5900 字符的摊平板，那时「单节不超过全文」有意义 ——
     * 它守的是「别把拆分做成搬运」。但现在分节已经成立（目录 837 字符），
     * 单节写得细恰恰是用户要的（「现在只查一节，字数可以多一些」）。
     *
     * 用旧全文大小当上限，会把「写细」这件事本身判成回归 ——
     * 而 domains 节现在 8707 字符，全是因为它真写了 57 条公式的缩放律，
     * 压回去等于又回到「每条公式只有一行」的状态。
     *
     * 真正该守的是**每次查询的总成本**（目录 + 一节），下面那条继续守。
     * 这里只留一个防失控的硬上限：万一某节误写成两万字，要能拦住。
     */
    assert('节 ' + topic.key + ' 不超过 9000', body.length <= 9000, String(body.length))
  }
  const avg = Math.round(total / TOPICS.length)
  /**
   * 平均单节上限放宽到 2000（旧 1400 → 本轮 2000）。
   *
   * 同上的理由：本轮 domains 节从 ~1500 涨到 8707（新增材料/财政/生物三块），
   * 平均被拉高是对的。**平均值的意义在于「典型一次查询要付多少」**，
   * 而典型查询命中的是 evaluate/units 这类 600~900 的节，
   * 不是 domains 这种把 57 条公式都列全的重节。
   */
  assert('单节平均不超过 2000', avg <= 2000, '平均 ' + avg + ' 字符')
  /** 目录 + 最常用一节，必须仍显著小于全文。 */
  const index = await text({ operation: 'help' })
  const evalBody = await text({ operation: 'help', helpTopic: 'evaluate' })
  assert('目录+evaluate 节仍省于全文', index.length + evalBody.length < 5900,
    String(index.length + evalBody.length))
}

console.log('-- 3. 别名与容错：AI 用直觉词也要查得到 --')
{
  /** 这是「可发现性」的关键：AI 不知道 key 叫 linalg，但会说「矩阵」。 */
  const aliasCases = [
    ['星球', 'world'],
    ['矩阵', 'linalg'],
    ['概率', 'stats'],
    ['单位', 'units'],
    ['推演', 'derivation'],
    ['锚点', 'recipe'],
  ]
  for (const [alias, expectKey] of aliasCases) {
    const body = await text({ operation: 'help', helpTopic: alias })
    const expected = await text({ operation: 'help', helpTopic: expectKey })
    assert('别名「' + alias + '」命中 ' + expectKey, body === expected, body.split('\n')[0].slice(0, 40))
  }

  /** 大小写与空格必须容忍（AI 会写 "World"、" world "）。 */
  const world = await text({ operation: 'help', helpTopic: 'world' })
  for (const variant of ['WORLD', 'World', '  world  ', 'world\n']) {
    const got = await text({ operation: 'help', helpTopic: variant })
    assert('容忍写法 ' + JSON.stringify(variant), got === world, '')
  }

  /**
   * 认不出的节名**不报错**，回目录 —— 报错会打断调用方的探索，
   * 而目录能让它自己纠偏。
   */
  const bad = await run({ operation: 'help', helpTopic: '不存在的节' })
  assert('未知节名不报错', bad.ok === true, String(bad.error && bad.error.type))
  assert('未知节名回目录', /目录/.test(String(bad.result)), '')
  assert('未知节名说明原因并点名', /没有名为/.test(String(bad.result)),
    String(bad.result).split('\n')[0].slice(0, 50))
}

console.log('-- 4. 内容没因分节而丢失 --')
{
  /**
   * 这是分节最容易造成的退化：为了拆而砍内容。
   * 抽查旧版里最常被引用的几组信息，现在必须仍在对应节里。
   */
  const world = await text({ operation: 'help', helpTopic: 'world' })
  for (const key of ['starMass', 'planetMass', 'rotationHours', 'pressure', 'terrain']) {
    assert('world 节含 ' + key, world.includes(key), '')
  }
  const evalBody = await text({ operation: 'help', helpTopic: 'evaluate' })
  for (const key of ['displayPrecision', 'terse', 'label', 'unit_mismatch', 'non_finite']) {
    assert('evaluate 节含 ' + key, evalBody.includes(key), '')
  }
  const units = await text({ operation: 'help', helpTopic: 'units' })
  for (const key of ['customUnits', 'unitFrom', '里']) {
    assert('units 节含 ' + key, units.includes(key), '')
  }

  /** 正文比旧版可以更细 —— 至少 world 节该保住了原来的字段数。 */
  const fieldCount = (world.match(/^    [a-zA-Z]+\s{2,}/gm) ?? []).length
  assert('world 节字段数不少于旧版', fieldCount >= 18, String(fieldCount))
}

console.log('-- 5. 工具描述必须指引这两步 --')
{
  const tool = mod.mathExecuteTool
  const desc = String(tool.description || '')
  /**
   * 如果描述不提 helpTopic，AI 会以为 help 只有目录、或干脆不查，
   * 那分节就等于把功能藏起来了 —— 这比不拆更糟。
   */
  assert('描述提到 help 查目录', /help/.test(desc), '')
  assert('描述提到 helpTopic 取节', /helpTopic/.test(desc), '')
  assert('描述仍在预算内（≤450）', desc.length <= 450, String(desc.length))
  /** schema 里必须声明 helpTopic，否则模型看不见这个参数。 */
  const props = Object.keys(tool.parameters.properties)
  assert('schema 声明 helpTopic', props.includes('helpTopic'), '')
}

rmSync(home, { recursive: true, force: true })

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)