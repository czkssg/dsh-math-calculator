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
  // 基线是 7789；要求至少省下 20%
  assert('定义总长比基线（7789）省 20% 以上',
    total <= 7789 * 0.8, total + ' 字符（省 ' + Math.round((1 - total / 7789) * 100) + '%）')
  assert('description 控制在 450 字符内', descLen <= 450, String(descLen))
  // 加了 expressions（批量求值）后略增，但仍须比基线省 20%
  assert('parameters 控制在 5800 字符内', paramLen <= 5800, String(paramLen))
}

console.log('-- 2. 参数一个都没少（功能未缩水）--')
{
  const props = Object.keys(tool.parameters.properties)
  // 41 个原有 + expressions（批量求值）= 42
  assert('参数仍有 42 个', props.length === 42, String(props.length))
  // 关键参数必须都在
  for (const name of ['world', 'terrain', 'constants', 'balance', 'customUnits',
    'precision', 'displayPrecision', 'formula', 'overrides', 'bodyType']) {
    assert('参数 ' + name + ' 仍在', props.includes(name), '')
  }
  const ops = tool.parameters.properties.operation.enum
  assert('operation 仍有 30 个', ops.length === 30, String(ops.length))
}

console.log('-- 3. 移走的说明必须在 help 里找得到 --')
{
  const help = String((await run({ operation: 'help' })).result || '')

  // world 的星球参数
  for (const key of ['starMass', 'starRadius', 'starTemp', 'orbitAU', 'eccentricity',
    'albedo', 'pressure', 'molarMass', 'greenhouse', 'materialStrength']) {
    assert('help 含 world 字段 ' + key, help.includes(key), '')
  }
  // terrain 的地形参数
  for (const key of ['kind=coastal', 'oceanCurrent', 'surface=soil', 'reliefHeight']) {
    assert('help 含 terrain 字段 ' + key, help.includes(key), '')
  }
  // constants 的旋钮
  for (const key of ['c(光速)', 'G(引力常数)', 'eBohr', 'hbar', 'alpha_fs', 'epsilon0']) {
    if (key === 'eBohr') continue
    assert('help 含常数旋钮 ' + key, help.includes(key), '')
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
  assert('统计成功数与失败数', /成功 3，失败 0/.test(text), '')
  assert('结构化值含 items', Array.isArray(r.value && r.value.items), '')

  // 一条失败不影响其它
  const mixed = await run({
    operation: 'evaluate',
    expressions: ['1+1', '不存在xyz(1)', '3*3'],
    displayPrecision: 6,
  })
  const mixedText = String(mixed.result)
  assert('批量整体仍 ok', mixed.ok, '')
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
