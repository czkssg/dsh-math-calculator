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
   * 目录必须显著小于旧版全文（5900）。
   * 上限 2500 是留了大余量的：只要它不再随节数线性膨胀到全文量级就合格。
   */
  assert('目录显著小于旧版全文', index.length <= 2500, index.length + ' 字符（旧版全文 5900）')
  assert('目录自称是目录', /目录/.test(index), '')
  assert('目录说明了两步查法', /helpTopic/.test(index), '')

  /** 每一节的 key 都必须出现在目录里，否则 AI 无从得知它存在。 */
  const missing = TOPICS.filter((t) => !index.includes(t.key))
  assert('目录列出全部 ' + TOPICS.length + ' 节', missing.length === 0,
    '缺: ' + missing.map((t) => t.key).join(', '))

  /**
   * 每节的简介必须**说清用途**，不能只写标题的同义词。
   * 判据：至少 15 个字 ——「矩阵」「统计」这种两字简介等于没写。
   */
  const thin = TOPICS.filter((t) => t.summary.trim().length < 15)
  assert('每节简介都够具体（≥15 字）', thin.length === 0,
    thin.map((t) => t.key + ':' + t.summary.length).join(', '))

  /** 简介要出现在目录里（否则目录只是一堆 key）。 */
  const noSummary = TOPICS.filter((t) => !index.includes(t.summary.slice(0, 10)))
  assert('目录里能看到简介', noSummary.length === 0, noSummary.map((t) => t.key).join(', '))
}

console.log('-- 2. 单节：按需取用，且比全文小得多 --')
{
  let total = 0
  for (const topic of TOPICS) {
    const body = await text({ operation: 'help', helpTopic: topic.key })
    total += body.length
    assert('节 ' + topic.key + ' 有正文', body.length > 50, String(body.length))
    /** 单节不该超过旧版全文 —— 若某节比全文还大，说明该继续拆。 */
    assert('节 ' + topic.key + ' 不超过旧版全文', body.length <= 5900, String(body.length))
  }
  const avg = Math.round(total / TOPICS.length)
  /**
   * 这是改造的核心收益指标：平均查一节 vs 旧版全文。
   * 实测旧版全文 5900，单节平均应在 1000 以内（约 1/6）。
   */
  assert('单节平均成本远低于旧版全文', avg <= 1200, '平均 ' + avg + ' 字符 vs 全文 5900')
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