/**
 * 三处「半修」缺陷的守卫：逐条状态、失败汇总、标签适用范围。
 *
 * ## 来源
 *
 * 审视 29 份实践文档后发现，`math_execute_问题与建议.md`（2026-11-08）
 * 报的 8 个问题里有 3 个只修了一半：
 *
 * ```
 * 2.4  sanity 越界 → 警告进了汇总计数，但 items[].ok 仍是 true
 * 2.6  批量失败   → 逐条有了 error，但顶层拿不到失败原因汇总
 * 2.5  四档标签   → 只在推演类输出，提示词却让 AI 到处引用
 * ```
 *
 * 本套把这三条钉住 —— 它们的共同危害是**「看起来正常、实际语义反了」**。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-semi-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool: run } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const awareness = await import(pathToFileURL(join(root, 'lib/awareness.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

console.log('-- 1. ★ sanity 逐条状态（缺陷 2.4 的剩余一半）--')
{
  /**
   * ★★ 核心：`ok` 的语义是「算得出来吗」，锚点越界是「算了但不符合判据」。
   * 两者必须**分开表达**，否则调用方只看 ok 会误判。
   */
  const r = await run({
    operation: 'evaluate',
    expressions: [
      { label: '越界', expr: '999999', sanity: { max: 1000, note: '故意' } },
      { label: '正常', expr: '500', sanity: { max: 1000 } },
      { label: '无判据', expr: '42' },
    ],
  })
  const items = r.value?.items ?? []
  assert('三条都有结果', items.length === 3, String(items.length))

  assert('越界条 → sanityStatus = violated', items[0]?.sanityStatus === 'violated', String(items[0]?.sanityStatus))
  /** ★ 但 ok 仍是 true —— 它确实算出来了，只是越过判据。 */
  assert('越界条 ok 仍为 true（算得出）', items[0]?.ok === true, String(items[0]?.ok))
  assert('越界条带 sanityNote 说明', typeof items[0]?.sanityNote === 'string' && items[0].sanityNote.length > 5, '')

  assert('合规条 → sanityStatus = passed', items[1]?.sanityStatus === 'passed', String(items[1]?.sanityStatus))
  /**
   * ★ 没给判据的条目**不应有**该字段。
   * 「没检查」与「检查通过」必须可区分 —— 否则调用方会以为 42 通过了某个锚点。
   */
  assert('无判据条 → 无 sanityStatus 字段', items[2]?.sanityStatus === undefined, String(items[2]?.sanityStatus))

  /** 汇总计数仍在（向后兼容）。 */
  assert('magnitudeWarnings 计数仍保留', r.value?.magnitudeWarnings === 1, String(r.value?.magnitudeWarnings))
}

console.log('-- 2. ★ 批量失败类型汇总（缺陷 2.6 的剩余一半）--')
{
  /**
   * 顶层 `error` 保持 undefined 是**有意的**（避免「某条错」被读成「整批错」）。
   * 所以补的是 `errorTypes` 汇总，不动 error 的语义。
   */
  const r = await run({
    operation: 'evaluate',
    expressions: [{ label: 'a', expr: '2+2' }, { label: 'b', expr: '1/0' }, { label: 'c', expr: 'foo(3)' }],
    terse: true,
  })
  assert('整批 ok=false', r.ok === false, String(r.ok))
  assert('partial=true（有成功的）', r.partial === true, String(r.partial))
  assert('failed=2', r.failed === 2, String(r.failed))
  assert('succeeded=1', r.succeeded === 1, String(r.succeeded))

  const types = r.errorTypes ?? {}
  assert('有 errorTypes 汇总', Object.keys(types).length > 0, JSON.stringify(types))
  assert('non_finite 计 1', types.non_finite === 1, JSON.stringify(types))
  assert('unknown_symbol 计 1', types.unknown_symbol === 1, JSON.stringify(types))
  /** 成功的条目不计入失败类型。 */
  const total = Object.values(types).reduce((a, b) => a + Number(b), 0)
  assert('汇总总数 == failed', total === 2, String(total))

  /** ★ 顶层 error 仍为 undefined —— 这是刻意的，不能被「修好」。 */
  assert('顶层 error 保持 undefined（有意）', r.error === undefined, String(r.error))

  /** 全部成功时不该有 errorTypes 字段。 */
  const good = await run({ operation: 'evaluate', expressions: [{ expr: '2+2' }], terse: true })
  assert('全成功 → 无 errorTypes', good.errorTypes === undefined, String(good.errorTypes))
}

console.log('-- 3. ★ 提示词说清标签适用范围（缺陷 2.5）--')
{
  const section = String(awareness.buildSystemPromptSection() ?? '')
  /**
   * ★★ 原来的提示词写「`[精确]/[标度]/[量级]/[仅方向]` 是可信度标签，引用时保留」，
   * 但 `evaluate` **从不输出**这些标签 —— AI 会去找不存在的东西。
   *
   * 修法是**说清适用范围**（而不是给 evaluate 硬加标签，那对纯算术是噪音）。
   */
  assert('提到四档标签', /\[精确\]/.test(section), '')
  assert('说明是推演类的标签', /推演类|world\/derivation/.test(section), '')
  assert('说明 evaluate 没有四档标签', /evaluate/.test(section), '')
  /** ★ 新增字段也要在提示词里出现，否则 AI 不知道能用。 */
  assert('提示词提到 sanityStatus', section.includes('sanityStatus'), '')
  assert('提示词提到 errorTypes', section.includes('errorTypes'), '')
}

console.log('-- 4. ★ 反向对照：这些字段真的出现了吗 --')
{
  /**
   * 断言「提示词提到了 sanityStatus」还不够 —— 必须在真实输出里也能拿到。
   * 这一节把「说了」和「做到了」对齐。
   */
  const r = await run({ operation: 'evaluate', expressions: [{ expr: '999999', sanity: { max: 10 } }] })
  assert('真实输出有 sanityStatus', r.value?.items?.[0]?.sanityStatus === 'violated', '')

  const r2 = await run({ operation: 'evaluate', expressions: [{ expr: '1/0' }], terse: true })
  assert('真实输出有 errorTypes', r2.errorTypes?.non_finite === 1, JSON.stringify(r2.errorTypes))

  /**
   * ★ 四档标签确实只在推演类出现 —— 这条断言防止将来有人「顺手」给 evaluate 加上。
   * 若哪天真的加了，这里会红，逼人重新评估提示词的说法。
   */
  const ev = await run({ operation: 'evaluate', expressions: [{ expr: '0.24*41.86' }] })
  assert('evaluate 不输出四档标签（与提示词一致）', !/\[精确\]|\[标度\]/.test(String(ev.result)), '')

  const w = await run({ operation: 'world', planetMass: 2, planetRadius: 1.2 })
  assert('world 仍输出四档标签', /\[精确\]|\[量级\]|\[仅方向\]/.test(String(w.result)), '')
}

console.log('-- 5. 提示词预算未被撑破 --')
{
  const section = String(awareness.buildSystemPromptSection() ?? '')
  assert('≤ 900 字符', section.length <= 900, String(section.length))
  /** 加了三行新内容，不能把原有约束挤掉。 */
  for (const must of ['math_execute', 'displayPrecision', '跨模块一致性']) {
    assert('保留原有约束：' + must, section.includes(must), '')
  }
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
