/**
 * 工具定义瘦身与结果缓存。
 *
 * ## 为什么做这两件事
 *
 * 工具定义（description + parameters schema）是**每一轮请求都要重复计费**的固定成本。
 * 实测基线：7789 字符 ≈ 4868 token/轮，20 轮对话 = 9.7 万 token，
 * 纯粹为了「让工具存在」而付。
 *
 * 瘦身的做法不是删参数（那会让功能消失），而是**把详细说明挪到 help**：
 *   · schema 里只留「这是什么、给哪个 operation 用」
 *   · 完整字段表、单位清单、旋钮列表进 help（用到时才读，不占每轮成本）
 *
 * ## 缓存必须守住的一条
 *
 * 缓存键里少了常数或工作区，改了设定后会返回**改之前**的数——
 * 那是静默错误，比不缓存危险得多。本套测试专门验这条。
 *
 * ## 同时守住「信息没丢」
 *
 * 瘦身最怕的是把说明砍掉了却没有替代。所以每个被移走的字段
 * 都必须在 help 里能找到。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-slim-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool
const cache = await import(pathToFileURL(join(root, 'lib/result-cache.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

const tool = mod.mathExecuteTool
const descLen = (tool.description || '').length
const paramLen = JSON.stringify(tool.parameters).length

console.log('-- 1. 工具定义已瘦身（每轮成本）--')
{
  const total = descLen + paramLen
  /**
   * ## 预算策略已改（2026-11-12，用户明确）
   *
   * > 不要节约字符量。一次推演是百万到亿级用量，几千字符不值一提。
   * > 过度压缩会影响可读性、影响 AI 使用。只要保证**没有重复**和**没有废话**。
   *
   * 所以撤掉「省 20%」与「5900 以内」这两条硬上限，改成两条实质检查：
   *
   * ```
   *   ① 没有重复：同一个参数不在 shcema 与 help 里各写一遍
   *   ② 没有废话：不写「本工具可以…」「请注意…」这类零信息量填充
   * ```
   *
   * 同时保留一条**软提醒**（超过 9000 只打印，不判失败）：
   * 那个量级说明声明确实很厚，值得看一眼有没有结构问题，但不该压缩信息。
   */
  console.log('        当前：description ' + descLen + ' + parameters ' + paramLen +
    ' = ' + total + ' 字符')

  /** ① 查废话。 */
  {
    const filler = [/本工具可以/g, /请注意/g, /以下内容/g, /总而言之/g, /众所周知/g]
    const hits = filler.filter((re) => re.test(JSON.stringify(tool))).map((re) => String(re))
    assert('schema 没有废话填充', hits.length === 0, hits.join(','))
  }
  /**
   * ② 查重复：同一个参数的说明不该在 description 与参数描述里各写一遍。
   *
   * 判据是「参数名出现在 description 里」—— 如果 description 把某个参数的
   * 用法讲了一遍，而该参数自己的 description 又讲一遍，那就是付了两次钱。
   */
  {
    const desc = tool.description || ''
    const dupParams = Object.keys(tool.parameters?.properties || {}).filter(
      (key) => key.length >= 4 && new RegExp('\b' + key + '\b').test(desc),
    )
    assert('description 不重复讲参数用法', dupParams.length === 0, dupParams.join(','))
  }
  /** ③ 软提醒（不判失败）。 */
  if (total > 9000) {
    console.log('        提示：定义总长 ' + total + ' 已超过 9000（软提醒，不判失败）')
  }
}

console.log('-- 2. 参数一个都没少（功能未缩水）--')
{
  const props = Object.keys(tool.parameters.properties)
  /**
   * ## 这条守的是「功能没缩水」，所以写成 `>=`，不是 `==`
   *
   * 演进史：41 个原有 + expressions + terse + workspaceVariables +
   * useWorkspaceVariables + helpTopic(v2.3.0) = 46；
   * 本轮再 + formulas / recurrence / periods / at = 50。
   *
   * 原先写成 `=== 46` 是个隐患：**加参数会让这条红**，而加参数本来是正常演进。
   * 结果就是每次加功能都要手改这个数字 —— 而改的次数多了，
   * 这个断言就退化成「照着实际值抄一遍」，什么也守不住。
   *
   * 所以改成下限：只在**参数被删掉**时报警，那才是它真正要防的事。
   */
  assert('参数不少于 46 个（功能未缩水）', props.length >= 46, String(props.length))
  // 关键参数必须都在
  for (const name of ['world', 'terrain', 'constants', 'balance', 'customUnits',
    'precision', 'displayPrecision', 'formula', 'overrides', 'bodyType']) {
    assert('参数 ' + name + ' 仍在', props.includes(name), '')
  }
  /**
   * 同上的理由：改下限。原来 `=== 30`，本轮加 `recurrence` 变 31。
   *
   * 守的是「operation 没被删」，不是「不多不少 30 个」。
   */
  const ops = tool.parameters.properties.operation.enum
  assert('operation 不少于 30 个（功能未缩水）', ops.length >= 30, String(ops.length))
  /** 本轮新增的 recurrence 必须真的在 enum 里（否则调用会报 invalid）。 */
  assert('operation 含 recurrence', ops.includes('recurrence'), ops.join(','))
}

console.log('-- 3. 移走的说明必须在 help 里找得到 --')
{
  /**
   * ## 从「查全文」改成「按节取」
   *
   * 旧断言拿 `operation:"help"` 的输出做全文搜索。但 help 现在返回**目录**
   * （1731 字符，12 节简介），字段表在 `helpTopic:"world"` 那一节里。
   *
   * 断言的目的没变 —— 仍然是「从 schema 移走的说明必须能在 help 里找到」，
   * 只是现在要去对应那一节找。
   */
  const world = String((await run({ operation: 'help', helpTopic: 'world' })).result || '')
  for (const key of ['starMass', 'starRadius', 'starTemp', 'orbitAU', 'eccentricity',
    'albedo', 'pressure', 'molarMass', 'greenhouse', 'materialStrength']) {
    assert('world 节含字段 ' + key, world.includes(key), '')
  }
  // terrain 的地形参数（与 world 同节）
  for (const key of ['kind', 'oceanCurrent', 'surface', 'reliefHeight']) {
    assert('world 节含 terrain 字段 ' + key, world.includes(key), '')
  }
  // constants 的旋钮（在 constants 节）
  const constants = String((await run({ operation: 'help', helpTopic: 'constants' })).result || '')
  for (const key of ['c(光速)', 'G(引力常数)', 'hbar', 'alpha_fs', 'epsilon0']) {
    assert('constants 节含旋钮 ' + key, constants.includes(key), '')
  }
  /** 目录层必须能让人找到这些节（否则 AI 不知道去哪查）。 */
  const index = String((await run({ operation: 'help' })).result || '')
  for (const key of ['evaluate', 'world', 'constants', 'derivation', 'units']) {
    assert('目录列出 ' + key + ' 节', index.includes(key), '')
  }
}

console.log('-- 4. 缓存：命中与键分离 --')
{
  cache.clearCache()
  cache.resetCacheStats()

  const first = await run({ operation: 'evaluate', expression: '2^0.5' })
  assert('第一次未命中', !first.cached, String(first.cached))
  const second = await run({ operation: 'evaluate', expression: '2^0.5' })
  assert('同一条第二次命中', second.cached === true, String(second.cached))
  assert('命中时结果一致', second.result === first.result, '')

  // 不同表达式不能串
  const other = await run({ operation: 'evaluate', expression: '3^0.5' })
  assert('不同表达式不命中', !other.cached, String(other.cached))

  // 精度不同不能串
  const precise = await run({ operation: 'evaluate', expression: '2^0.5', precision: 20 })
  assert('改计算精度不命中', !precise.cached, String(precise.cached))

  // 显示精度不同也不能串
  const shown = await run({ operation: 'evaluate', expression: '2^0.5', displayPrecision: 6 })
  assert('改显示精度不命中', !shown.cached, String(shown.cached))

  // operation 不同不能串
  const asDerivative = await run({ operation: 'derivative', expression: 'x^2', variable: 'x' })
  const asDerivative2 = await run({ operation: 'derivative', expression: 'x^2', variable: 'x' })
  assert('同 operation 重复调用命中', asDerivative2.cached === true, String(asDerivative2.cached))
}

console.log('-- 5. 缓存：改常数后必须失效（安全关键）--')
{
  cache.clearCache()

  const a = await run({ operation: 'evaluate', expression: '1+1' })
  assert('基准计算未命中', !a.cached, '')

  // 改常数
  await run({ operation: 'constants', constants: { c: 1.5e8 } })

  const b = await run({ operation: 'evaluate', expression: '1+1' })
  /**
   * 改常数后必须不再命中。
   *
   * 即使 `1+1` 本身不依赖 c，也**不能**命中 —— 因为缓存键含常数指纹，
   * 而「这条表达式是否依赖某个常数」在缓存层是不知道的。
   * 宁可少命中（重算一条 1+1 成本极低），不可冒「返回旧宇宙结果」的风险。
   */
  assert('改常数后同一表达式不再命中', !b.cached, String(b.cached))
}

console.log('-- 6. 缓存：有副作用的 operation 绝不缓存 --')
{
  cache.clearCache()
  // workspace set 会改状态；若被缓存，第二次调用会跳过副作用
  const w1 = await run({ operation: 'workspace', action2: 'set', displayPrecision: 5 })
  const w2 = await run({ operation: 'workspace', action2: 'set', displayPrecision: 5 })
  assert('workspace set 不返回 cached 标记',
    !w1.cached && !w2.cached, String(w1.cached) + '/' + String(w2.cached))

  // formula-table 有副作用（会改公式表），同样不能缓存
  const f1 = await run({ operation: 'formula-table', formulaTableAction: 'list' })
  assert('formula-table 不被缓存', !f1.cached, String(f1.cached))
}

console.log('-- 7. 缓存：错误不缓存 --')
{
  cache.clearCache()
  const bad1 = await run({ operation: 'evaluate', expression: '不存在的函数xyz(1)' })
  assert('错误返回 ok=false', bad1.ok === false, '')
  const bad2 = await run({ operation: 'evaluate', expression: '不存在的函数xyz(1)' })
  assert('同一个错误不被缓存成成功', bad2.ok === false, '')
}

console.log('-- 8. 缓存的容量与统计 --')
{
  cache.clearCache()
  cache.resetCacheStats()
  // 灌入超过容量的条目
  for (let i = 0; i < 300; i++) {
    await run({ operation: 'evaluate', expression: '1+' + i })
  }
  const stats = cache.cacheStats()
  assert('缓存条目不超过上限 256', stats.size <= 256, String(stats.size))
  assert('有未命中统计', stats.misses > 0, String(stats.misses))
}

console.log('-- 9. 批量求值（一次算多条）--')
{
  const r = await run({
    operation: 'evaluate',
    expressions: ['1/7', '2^0.5', 'log(10)'],
    displayPrecision: 6,
  })
  assert('批量成功', r.ok, '')
  const text = String(r.result)
  assert('标题标明条数', /批量求值（3 条）/.test(text), text.split('\n')[0])
  assert('逐行给出结果', /1\/7 = 0\.142857/.test(text), '')
  /**
   * 全成功时的措辞是分级的，不再说「成功 3，失败 0」——
   * 后者读起来像「结论对了」，会让调用者跳过复核。
   * 见 CHANGELOG「『成功』改为分级语义」。
   */
  assert('统计成功数与失败数', /算式全部求值成功（3 条/.test(text), '')
  assert('结构化值含 items', Array.isArray(r.value && r.value.items), '')

  // 一条失败不影响其它
  const mixed = await run({
    operation: 'evaluate',
    expressions: ['1+1', '不存在xyz(1)', '3*3'],
    displayPrecision: 6,
  })
  const mixedText = String(mixed.result)
  /**
   * 这里断言的是**新契约**（2026-11-06 起）：
   * 批量里有失败时顶层 `ok` 为 false，同时 `partial=true` 表示「仍有可用条目」。
   *
   * 旧断言写的是 `mixed.ok === true` —— 那正是被修掉的缺陷：
   * 任何写 `if (r.ok)` 的调用方都会把「废了一条的批次」当成全好。
   * 「一条失败不影响其它条」这个优点由 `partial` + 成功条目仍在文本来承载。
   */
  assert('批量有失败时 ok=false（新契约）', mixed.ok === false, String(mixed.ok))
  assert('部分成功时 partial=true', mixed.partial === true, String(mixed.partial))
  assert('失败条被标出', /不存在xyz\(1\) → 失败/.test(mixedText), '')
  assert('其它条仍算成功', /1\+1 = 2/.test(mixedText) && /3\*3 = 9/.test(mixedText), '')
  assert('统计正确（成功2失败1）', /成功 2，失败 1/.test(mixedText), '')

  // 上限保护
  const many = await run({
    operation: 'evaluate',
    expressions: Array.from({ length: 150 }, (_, i) => String(i + 1)),
    displayPrecision: 4,
  })
  assert('超上限被截断而非报错', many.ok && /前 100 条/.test(String(many.result)),
    String(many.result).split('\n')[0])

  // 空数组回落
  const empty = await run({ operation: 'evaluate', expressions: [], expression: '5+5' })
  assert('空 expressions 回落单条求值', empty.ok && /10/.test(String(empty.result)),
    String(empty.result).slice(0, 40))
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
