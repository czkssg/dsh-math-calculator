/**
 * R62 文档一致性：教 AI 用的几份文档（工具描述 / 系统提示 / help / SKILL）必须互相对得上。
 *
 * ## 为什么需要
 *
 * 测试员实测的两类不一致：
 *   1. 数字各写各的（playbook 写「公式 342 条」，实际 805）；
 *   2. 声明了但不可用（门面列 sanity/alert/catalog，调用落到 internal）。
 *
 * 这一套把「数字一致 / operation 覆盖 / 门面自洽 / 关键术语三处都有 / 示例可运行」变成硬断言。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-r62doc-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const { FACADE_GROUPS, MIGRATED_OPERATIONS } = await import(pathToFileURL(join(root, 'lib/dispatch.js')).href)
const tool = toolMod.mathExecuteTool

const help = JSON.parse(readFileSync(join(root, 'src/data/help.json'), 'utf8'))
const formulas = JSON.parse(readFileSync(join(root, 'src/data/formulas.json'), 'utf8'))
const skill = readFileSync(join(root, 'skills/world-deduction/SKILL.md'), 'utf8')
const awareness = readFileSync(join(root, 'src/awareness.ts'), 'utf8')
const playbook = readFileSync(join(root, 'src/playbook.ts'), 'utf8')
const helpText = JSON.stringify(help)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 数字一致 --')
{
  const sections = help.length
  assert('help 节数 = ' + sections, sections >= 50, String(sections))
  const skillSections = /能力目录（(\d+) 节/.exec(skill)
  const awSections = /help 看目录（(\d+) 节/.exec(awareness)
  assert('SKILL 的节数 = 实际', skillSections !== null && Number(skillSections[1]) === sections, skillSections ? skillSections[1] : '未写')
  assert('工具描述的节数 = 实际', awSections !== null && Number(awSections[1]) === sections, awSections ? awSections[1] : '未写')

  const count = formulas.length
  const skillFormula = /（(\d+) 条，params/.exec(skill)
  assert('SKILL 的公式数 = 实际', skillFormula !== null && Number(skillFormula[1]) === count, skillFormula ? skillFormula[1] : '未写')
  assert('help 里写着 ' + count + ' 条', helpText.includes(String(count) + ' 条'), '')
  assert('playbook 公式数不再写死', !/（\d{2,4} 条）/.test(playbook), (playbook.match(/（\d{2,4} 条）/) || [''])[0])

  const stale = ['665 条', '740 条', '803 条', '804 条', '342 条', '12 节', '55 节']
  const hits = stale.filter((token) => helpText.includes(token) || skill.includes(token) || awareness.includes(token))
  assert('没有过期数字（' + stale.join('/') + '）', hits.length === 0, hits.join(','))
}

console.log('-- 2. 门面自洽（声明了就要能转发）--')
{
  for (const [group, items] of Object.entries(FACADE_GROUPS)) {
    const missing = items.filter((item) => !MIGRATED_OPERATIONS.includes(item))
    assert('门面 ' + group + ' 的子命令都真实存在', missing.length === 0, missing.join(','))
  }
  const facadeHelp = String((help.find((section) => section.key === 'facade') || {}).body || '')
  assert('facade 节不再把 catalog/explain 列成子命令', !/manage\s*→[^\n]*(catalog|explain|invariants|examples)/.test(facadeHelp), '')
  const bad = await run({ operation: 'calc', op: 'sanity' })
  const rejected = String(bad.result).includes('不接受') || (bad.ok === false && bad.error?.type !== 'internal')
  assert('calc op:sanity → 明确拒绝（不是 internal）', rejected, JSON.stringify({ ok: bad.ok, type: bad.error?.type, head: String(bad.result).slice(0, 60) }))
}

console.log('-- 3. operation 覆盖（SKILL 不漏）--')
{
  const missing = MIGRATED_OPERATIONS.filter((op) => !new RegExp('(^|[^a-zA-Z_])' + op + '([^a-zA-Z_]|$)').test(skill))
  assert('SKILL 覆盖全部 operation（含 auto）', missing.length === 0, missing.join(','))
  const inHelpSections = new Set(help.map((section) => section.key))
  assert('help 有 topology 节', inHelpSections.has('topology'), '')
  assert('help 有 batch 节', inHelpSections.has('batch'), '')
}

console.log('-- 4. 每一节都能按 key 取全文 --')
{
  for (const section of help) {
    const r = await run({ operation: 'help', helpTopic: section.key })
    assert('helpTopic「' + section.key + '」取到全文', String(r.result).includes(section.title), String(r.result).slice(0, 60))
  }
}

console.log('-- 5. 关键术语三处一致 --')
{
  for (const [label, word] of [['calls 批量', 'calls'], ['sanity 锚点', 'sanity']]) {
    assert(label + ' 在 help 里', helpText.includes(word), '')
    assert(label + ' 在 SKILL 里', skill.includes(word), '')
    assert(label + ' 在工具描述里', awareness.includes(word), '')
  }
  assert('SKILL 提到 topology', skill.includes('topology'), '')
  /** R66：表达式上限的三道闸要写清楚（文档与实测一致）。 */
  assert('help 写明运算符上限', helpText.includes('运算符') && helpText.includes('2000'), '')
  assert('SKILL 写明表达式规模', skill.includes('运算符 ≤2000') || skill.includes('运算符'), '')
  assert('工具描述提到单位优先符号', /单位\*\*优先用国际符号\*\*/.test(awareness), '')
}

console.log('-- 6. 示例可运行（help 的 operation 片段 + SKILL 的 calls 片段）--')
{
  const parseLoose = (text) => {
    try { return JSON.parse(text) } catch {}
    const fixed = text.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3').replace(/'/g, '"')
    try { return JSON.parse(fixed) } catch {}
    return null
  }
  let examples = 0
  let broken = 0
  for (const section of help) {
    for (const match of String(section.body || '').matchAll(/\{[^{}]*operation[^{}]*\}/g)) {
      examples += 1
      const args = parseLoose(match[0])
      if (args === null) { broken += 1; continue }
      const r = await run(args)
      if (r.ok !== true) { broken += 1; console.log('    坏示例[' + section.key + ']:', match[0].slice(0, 70), r.error?.type) }
    }
  }
  assert('help 的 ' + examples + ' 个 operation 示例全部可运行', broken === 0, String(broken))

  const callsMatch = /\{calls:\[[^\]]*\]\}/.exec(skill)
  assert('SKILL 有 calls 示例', callsMatch !== null, '')
  if (callsMatch !== null) {
    const args = parseLoose(callsMatch[0])
    if (args !== null) {
      const r = await run(args)
      assert('SKILL 的 calls 示例可运行', r.ok !== false || r.partial === true, JSON.stringify(r.error?.type))
    }
  }
}

console.log('-- 7. 没有管道串（AI 会照抄）--')
{
  /** 只把「a|b|c 且每段都是标识符」当管道串；含中文/花括号的是示意，不算。 */
  const isPipe = (value) => /^[A-Za-z0-9_-]+(\|[A-Za-z0-9_-]+)+$/.test(value)
  const pipeHits = []
  for (const section of help) {
    for (const match of String(section.body || "").matchAll(/"([^"]*\|[^"]*)"/g)) if (isPipe(match[1])) pipeHits.push(section.key + ":" + match[1].slice(0, 40))
  }
  for (const match of skill.matchAll(/"([^"]*\|[^"]*)"/g)) if (isPipe(match[1])) pipeHits.push("SKILL:" + match[1].slice(0, 40))
  assert("help/SKILL 没有管道串", pipeHits.length === 0, pipeHits.join(" | "))
}

console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
