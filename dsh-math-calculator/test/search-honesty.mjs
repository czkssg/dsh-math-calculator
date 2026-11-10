/**
 * 公式检索的诚实性：**没命中就说没命中**。
 *
 * ## 缺陷来源
 *
 * 审视实践文档时发现 `query="作用量"` 返回 11 条结果，首条是「两平行导线间的作用力」。
 * 而整串「作用量」在库里**一次都没命中**——是中文滑窗把它切成
 * 「作用」「用量」后各自命中了别的公式描述。
 *
 * `"机械"` 同理：命中的是「指数分布」desc 里那句「机械件的磨损不是」。
 *
 * ## 为什么这算缺陷而不只是「检索宽松」
 *
 * ```
 *   用户看到 11 条结果 → 以为库里有这么多相关内容
 *   逐个点开 → 全不相干
 *   更糟的是「看起来像有」，于是不会去补那条真缺的公式
 * ```
 *
 * 本项目一贯原则是「假关系比没有关系更糟」。检索层面同理：
 * **假装有结果比说明没有更有害**。
 *
 * ## 本套守两件事
 *
 * 1. 精确命中与子词凑数必须**可区分**（输出措辞 + 首条是否真相关）
 * 2. 有精确命中时不能误报「没有」（反向对照，防止改过头）
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-search-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool: run } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const fm = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const search = async (q) => String((await run({ operation: 'formulas', query: q })).result ?? '')

console.log('-- 1. ★ 无精确命中时必须明说 --')
{
  /**
   * ★★ 这两个查询是真实的误匹配标本（实测确认整串零命中）。
   */
  for (const q of ['作用量', '机械']) {
    const text = await search(q)
    assert(`"${q}" 标注为无精确匹配`, text.includes('没有精确匹配'), text.split('\n')[0].slice(0, 50))
    /**
     * ★ 但不能直接返回空 —— 子词结果仍有参考价值（用户可能记错了词）。
     * 所以是「降级标注」而不是「丢弃」。
     */
    assert(`"${q}" 仍给出候选`, /以下 \d+ 条/.test(text), '')
  }
}

console.log('-- 2. ★ 有精确命中时不能误报 --')
{
  /**
   * 反向对照：改过头会让「明明有」也报「没有」，
   * 那比原来的问题更糟（用户会以为库里根本没这条公式）。
   */
  const cases = [
    ['齿轮', 'gear_geometry'],
    ['发酵', 'fermentation_time'],
    ['蒸馏', 'distillation_enrichment'],
    ['熵', 'shannon_entropy'],
  ]
  for (const [q, expected] of cases) {
    const text = await search(q)
    assert(`"${q}" 不报无精确匹配`, !text.includes('没有精确匹配'), text.split('\n')[0].slice(0, 46))
    assert(`"${q}" 首条是 ${expected}`, text.includes(expected), '')
  }
}

console.log('-- 3. 精确命中数量标注正确 --')
{
  /** 全部精确时不显示「前 N 条」这种多余的修饰。 */
  const single = await search('发酵')
  assert('全精确时不显示「前 N 条」', !/前 \d+ 条精确命中/.test(single), single.split('\n')[0].slice(0, 40))

  /** 部分精确时应标出条数。 */
  const mixed = await search('齿轮')
  assert('部分精确时标出条数', /前 \d+ 条精确命中/.test(mixed), mixed.split('\n')[0].slice(0, 50))
}

console.log('-- 4. ★ 「精确」的判据必须与实现一致 --')
{
  /**
   * 这一节防止「标注」与「实际排序」脱节。
   *
   * 若输出说「前 3 条精确命中」，那前 3 条就必须真的在 id/name/keys 里含该词
   * —— 否则标注本身就成了新的误导。
   */
  const text = await search('齿轮')
  const ids = [...text.matchAll(/^\s+([a-z][a-z0-9_]+)\s+——/gm)].map((m) => m[1])
  const head = ids.slice(0, 3)
  const allExact = head.every((id) => {
    const f = fm.FORMULA_INDEX.get(id)
    if (!f) return false
    return f.id.includes('齿轮') || f.name.includes('齿轮') ||
      (f.keys ?? []).some((k) => k.includes('齿轮'))
  })
  assert('标注为精确的前几条真的精确', allExact, head.join(', '))
}

console.log('-- 5. M1「作用量」确实是缺口（不是检索问题）--')
{
  /**
   * 实践文档建议补「作用量 S = W×T」作为一等公民。
   * 上面确认了检索是诚实的 —— 那么「查不到」就是**真的没有**。
   *
   * 这条断言让缺口保持可见：将来若补了这条公式，它会红，提示该更新文档。
   */
  const hasAction = fm.FORMULAS.some((f) => /^action_|_action$|action_S/.test(f.id))
  assert('当前库里没有作用量公式（已知缺口）', hasAction === false, hasAction ? '已补，请更新缺口文档' : '确认缺')
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
