/**
 * `derivation` 子命令的「缺参数提示」质量。
 *
 * ## 缺陷来源
 *
 * 审阅实践文档时发现 6 个子命令在缺参数时只回一句话：
 *
 * ```
 *   backSolve  70 字符「缺参数：anchor…」
 *   impact     21 字符「需要 traceTarget」
 *   compare    24 字符「缺 compareFrom」
 *   diff       21 字符「需要 diffA 与 diffB 两张表名」
 * ```
 *
 * **用户看完仍不知道该填什么** —— 尤其：
 *
 * ```
 *   ① anchor 是驼峰 id（creatureHeight），拼错就找不到
 *   ② traceTarget 必须是依赖图里的节点名（76 个里的一个）
 *   ③ compare 需要先 archive 一版，而新工作区根本没有版本
 *   ④ diffA/diffB 其实是**工作区名**，原提示写成「表名」是**错的**
 * ```
 *
 * 第 ④ 条是这次发现的实质错误：按「表名」去填只会得到「A 表不存在」。
 *
 * ## 本套守的判据
 *
 * 提示里给的**每一个示例都必须真能跑** —— 否则就是把用户从「不知道填什么」
 * 变成「填了报错」，比原来更糟。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-hint-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool: run } = await import(pathToFileURL(join(root, 'lib/index.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const hint = async (sub) =>
  String((await run({ operation: 'derivation', derivation: sub })).result ?? '')

/** 从提示文本里抽出可复制的 JSON 示例。 */
function extractExamples(text) {
  const out = []
  for (const m of text.matchAll(/\{"operation":"derivation"[^}]*\}/g)) {
    try { out.push(JSON.parse(m[0])) } catch { /* 忽略解析失败 */ }
  }
  return out
}

console.log('-- 1. backSolve：给出真实锚点与可复制调用 --')
{
  const text = await hint('backSolve')
  assert('说明两个参数各自含义', /anchor\s+锚点 id/.test(text) && /anchorValue/.test(text), '')
  assert('给出可复制 JSON 示例', extractExamples(text).length > 0, String(extractExamples(text).length))
  assert('列出真实锚点 id', /creatureHeight/.test(text), '')
  /**
   * ★★ 核心断言：示例必须真能跑。
   * 这条防的是「提示里写了个不存在的锚点」——那比不给提示更糟。
   */
  const example = extractExamples(text)[0]
  assert('示例可被解析', Boolean(example), JSON.stringify(example ?? {}))
  if (example) {
    const r = await run(example)
    assert('示例真的能跑通', r.ok === true, String(r.result).split('\n')[0].slice(0, 50))
  }
}

console.log('-- 2. compare：说明前置条件（先 archive）--')
{
  const text = await hint('compare')
  /**
   * ★ 新工作区没有版本，直接说「缺 compareFrom」会误导 ——
   * 用户填 v1 会得到「找不到」，而真正该做的是先 archive。
   */
  assert('说明当前无版本', /还没有归档版本|已有版本/.test(text), text.split('\n')[0].slice(0, 30))
  assert('指引用 archive', /archive/.test(text), '')
  const examples = extractExamples(text)
  assert('给出可复制示例', examples.length > 0, String(examples.length))
  /** archive 那个示例应真能跑（它不需要参数）。 */
  const archiveEx = examples.find((e) => e.derivation === 'archive')
  if (archiveEx) {
    const r = await run(archiveEx)
    assert('archive 示例可跑通', r.ok === true, String(r.result).split('\n')[0].slice(0, 40))
  }
}

console.log('-- 3. impact：列出真实节点名 --')
{
  const text = await hint('impact')
  assert('说明须与节点同名', /节点同名|量名/.test(text), '')
  assert('给出可复制示例', extractExamples(text).length > 0, '')
  /** ★ 必须真的列出节点（76 个），而不是空话。 */
  assert('列出真实节点清单', /共 \d+ 个/.test(text), text.match(/共 \d+ 个[^\n]*/)?.[0] ?? '')
  const example = extractExamples(text)[0]
  if (example) {
    const r = await run(example)
    assert('示例真的能跑通', r.ok === true, String(r.result).split('\n')[0].slice(0, 50))
  }
  /** 清单里出现的节点名必须真在图上（抽查第一个）。 */
  const listed = text.match(/前 12 个）：\s*\n\s*(.+)/)?.[1] ?? ''
  const firstNode = listed.split('·')[0]?.trim()
  if (firstNode) {
    const r = await run({ operation: 'derivation', derivation: 'impact', traceTarget: firstNode })
    assert('清单里的节点真存在：' + firstNode, r.ok && !/找不到|不存在/.test(String(r.result)), '')
  }
}

console.log('-- 4. ★★ diff：纠正「表名」这个错误说法 --')
{
  const text = await hint('diff')
  /**
   * ★★ 这是本次发现的实质错误。
   *
   * 原来写「需要 diffA 与 diffB 两张**表名**」，但读 `diffTables` 实现可知，
   * 它比对的是**两个工作区**：
   *
   * ```
   *   const names = listWorkspaces().map(item => item.name)
   *   if (!names.includes(aName)) return { message: 'A 表不存在' }
   * ```
   *
   * 用户按「表名」去填七张表的名字（「项目卡」「变更清单」…）必然失败。
   */
  assert('说明要的是工作区名', /工作区名/.test(text), text.split('\n')[0].slice(0, 40))
  assert('明确否认「七张表的名字」', /不是七张表/.test(text), '')
  /** ★ 反向对照：不该再说「表名」作为唯一解释。 */
  assert('不再把 diffA 说成表名', !/^需要 diffA 与 diffB 两张表名$/.test(text.split('\n')[0]), '')
}

console.log('-- 5. 反向对照：这些提示不是空话 --')
{
  /**
   * ★ 长短不是目的 —— 但要能「照着做」。
   * 所以判断标准是：每段提示里至少有一个可解析的 JSON 调用。
   */
  for (const sub of ['backSolve', 'impact', 'compare']) {
    const text = await hint(sub)
    assert(sub + ' 提示含可复制调用', extractExamples(text).length > 0, String(text.length) + ' 字符')
    /** 且不能只给「缺参数」四个字了事。 */
    assert(sub + ' 提示不只一句', text.split('\n').length >= 3, text.split('\n').length + ' 行')
  }
}

console.log('-- 6. graph 与 fantasy 原本就合格（不该被改坏）--')
{
  /** graph 有真实数据（节点/连线/层数），不是空提示。 */
  const g = await hint('graph')
  assert('graph 给出节点数', /节点 \d+ 个/.test(g), g.match(/节点 \d+ 个[^\n]*/)?.[0] ?? '')
  assert('graph 指向 value.graph', /value\.graph/.test(g), '')

  /** fantasy 本来就有完整字段说明与三种 source，保持。 */
  const f = await hint('fantasy')
  assert('fantasy 列出所需字段', /fantasyAbility/.test(f), '')
  assert('fantasy 说明三种 source', /metabolism/.test(f) && /external/.test(f), '')
  assert('fantasy 提醒永动机禁令', /永动/.test(f), '')
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
