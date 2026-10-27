/**
 * 计算需求的三档分流（simple / forced / fuzzy）。
 *
 * ## 为什么要分流
 *
 * 原来用**单一阈值**（score ≥ 0.45 就提醒），它只能回答「数学需求强不强」，
 * 回答不了「该心算还是该用工具」。实测两个方向都判反了：
 *
 *   `2+2`            score 0.95 → 按阈值会提醒，但它该心算
 *   `20 个数字求和`   score 0.30 → 按阈值不提醒，但它最该用工具
 *
 * 前者得分高是因为命中「完整算式」模式；后者得分低是因为
 * **数据信号词表完全空缺** —— 「求和/汇总/精确/CSV/批量」一个词都没有。
 *
 * ## 三档定义
 *
 * | 档 | 判据 | 处置 |
 * |---|---|---|
 * | simple | 短、数字≤5、纯四则、无数据信号、无物理推演词 | 不提醒（想用工具仍可用） |
 * | forced | 命中数据/汇总/金融/多步信号 | 按阈值提醒 |
 * | fuzzy  | 其它数学需求 | 按阈值提醒 |
 *
 * ## 重要取舍：simple 只表示「不提醒」，不表示「禁止」
 *
 * 文档建议「简单算式让 AI 心算」。这里采纳判据，但**不采纳禁止**：
 * 心算给的是数字，工具给的是带约束的数字。
 * 实测：`1.5 倍重力下花岗岩山能长多高` ——
 *   心算「大概 3000 米」看着合理，但没有任何校验；
 *   工具给 3262 米并提示「已接近花岗岩极限」。
 * 所以物理推演类**一律不算 simple**。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-triage-'))
process.env.DSH_MATH_CALC_HOME = home

const d = await import(pathToFileURL(join(root, 'lib/detector.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

console.log('-- 1. 简单算术 → simple（不该提醒）--')
{
  const SIMPLE = [
    '2+2',
    '(3+4)*5/2',
    '235*17',
    '12.5/0.4',
    '100-37',
  ]
  for (const text of SIMPLE) {
    const r = d.detectMathNeed(text)
    assert(text + ' → simple', r.demandClass === 'simple', r.demandClass)
    assert(text + ' 不提醒', r.shouldPrompt === false, String(r.shouldPrompt))
  }
}

console.log('-- 2. 数据/汇总/金融 → forced（最该用工具）--')
{
  const FORCED = [
    '把这20个数字求和：' + Array.from({ length: 20 }, (_, i) => i + 1).join(','),
    '这份CSV里所有销售额加起来',
    '求这几个数的平均值：3,7,9,12',
    '100万本金，年息5%，30年后本利和',
    '精确核对这批数据的标准差',
    '批量算一下每一行的合计',
  ]
  for (const text of FORCED) {
    const r = d.detectMathNeed(text)
    assert(text.slice(0, 20) + ' → forced', r.demandClass === 'forced', r.demandClass)
    assert(text.slice(0, 20) + ' 有数据信号',
      r.signals.some((s) => s.startsWith('数据信号:')), r.signals.join('|'))
  }
}

console.log('-- 3. 物理推演 → 不是 simple（核心价值场景）--')
{
  /**
   * 这是最重要的取舍。物理推演即便形式像算术，也不能归为「自己算算就行」——
   * 因为这些问题的价值在约束检查，不在数字本身。
   */
  const PHYSICS = [
    '1.5倍重力下，花岗岩山能长多高',
    '这颗星球逃逸速度多少',
    '潮汐锁定行星的昼夜温差',
    '3倍重力下人类能站住吗',
    '大气压0.1时的沸点',
  ]
  for (const text of PHYSICS) {
    const r = d.detectMathNeed(text)
    assert(text.slice(0, 18) + ' 不归为 simple', r.demandClass !== 'simple', r.demandClass)
  }
}

console.log('-- 4. 防误伤：`1.5倍` 里的 `1.` 不该被当成列表编号 --')
{
  // 实测过：这条曾因「列表编号」扣除而漏判
  const r = d.detectMathNeed('1.5倍重力下，花岗岩山能长多高')
  assert('不被列表编号规则误伤',
    !r.signals.some((s) => s.includes('列表编号')), r.signals.join('|'))
  assert('仍能识别出计算需求（score > 0.1）', r.score > 0.1, String(r.score))
}

console.log('-- 5. 分流驱动提醒决策（而非只看 score）--')
{
  // simple 高分也不提醒
  const simple = d.detectMathNeed('2+2')
  assert('2+2 得分高（>0.9）', simple.score > 0.9, String(simple.score))
  assert('2+2 仍不提醒（分流优先于分数）', simple.shouldPrompt === false, '')

  // forced 低分也提醒
  const csv = d.detectMathNeed('这份CSV里所有销售额加起来')
  assert('CSV 句得分不高', csv.score < 0.9, String(csv.score))
  assert('CSV 句仍提醒（forced 档）', csv.shouldPrompt === true, '')

  // shouldPromptNow 用分流而非阈值
  d.resetDetectionState('triage-1')
  const now = d.shouldPromptNow('triage-1', '2+2', 1, false)
  assert('shouldPromptNow: 2+2 不提醒', now.shouldPrompt === false, now.reason)
  assert('shouldPromptNow 返回档位', now.demandClass === 'simple', String(now.demandClass))
}

console.log('-- 6. 防打扰规则仍生效（分流不绕过它们）--')
{
  d.resetDetectionState('triage-2')
  const ask = (text, step, used) => {
    const r = d.shouldPromptNow('triage-2', text, step, used)
    if (r.shouldPrompt) d.recordPrompt('triage-2', step)
    return r
  }

  const first = ask('把CSV加起来', 1, false)
  assert('第 1 次提醒', first.shouldPrompt === true, '')

  const cooling = ask('求和：1,2', 2, false)
  assert('冷却期内跳过', cooling.shouldPrompt === false, cooling.reason)

  const afterCooldown = ask('求和：3,4', 4, false)
  assert('过了冷却再提醒', afterCooldown.shouldPrompt === true, '')

  // 次数上限（默认 3）
  ask('求和：5,6', 7, false)
  const overLimit = ask('求和：7,8', 10, false)
  assert('达上限后跳过', overLimit.shouldPrompt === false, overLimit.reason)

  // 用过工具就不再提醒
  d.resetDetectionState('triage-3')
  const used = d.shouldPromptNow('triage-3', '把CSV加起来', 1, true)
  assert('用过工具后不提醒', used.shouldPrompt === false, used.reason)
  assert('原因写明', /用过/.test(used.reason || ''), used.reason)
}

console.log('-- 7. 提醒文案按档位区分 --')
{
  const forced = d.buildReminderMessage(d.detectMathNeed('把CSV里所有销售额加起来'))
  assert('forced 文案强调「容易出错」', /容易出错|看不出来/.test(forced), forced.slice(0, 40))

  /**
   * fuzzy 档要用**确实落在 fuzzy** 的句子。
   *
   * 原来这里用「这颗星球逃逸速度多少」—— 但盲测后物理/天文词已升级为强信号，
   * 那条现在归 forced。改用一条只有疑问词、不含强信号的句子。
   */
  const fuzzyText = '这条路线大概要花多少时间'
  const fuzzyDetection = d.detectMathNeed(fuzzyText)
  assert('选用的句子确实在 fuzzy 档', fuzzyDetection.demandClass === 'fuzzy', fuzzyDetection.demandClass)
  const fuzzy = d.buildReminderMessage(fuzzyDetection)
  assert('fuzzy 文案更温和', /可以用/.test(fuzzy), fuzzy.slice(0, 40))

  // 两档不该完全相同
  assert('两档文案有区别', forced !== fuzzy, '')

  // 措辞不反驳作者
  for (const text of [forced, fuzzy]) {
    assert('文案不出现「禁止/必须」', !/禁止|必须/.test(text), '')
  }
}

console.log('-- 8. 非计算文本不误报 --')
{
  const NOT_MATH = [
    '第3章 2024年15岁的主角',
    '这个版本是 v1.2.3',
    '参见 https://example.com/a/b',
  ]
  for (const text of NOT_MATH) {
    const r = d.detectMathNeed(text)
    assert('不误报: ' + text.slice(0, 18), r.demandClass !== 'forced', r.demandClass)
  }
}

try {
  rmSync(home, { recursive: true, force: true })
} catch {
  /* 忽略 */
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
