/**
 * 检测器准确度测试。
 *
 * 重点不是「能检测到」，而是**不误报**。
 * 一个总在提醒的插件会让用户烦，比不提醒更糟。
 */
const { detectMathNeed, shouldPromptNow, recordPrompt, resetDetectionState } = await import('../lib/detector.js')

let pass = 0
const fails = []
function ok(n, d) { pass++; console.log('  ok   ' + n + (d ? ': ' + d : '')) }
function bad(n, d) { fails.push({ n, d }); console.log('  FAIL ' + n + '\n         ' + d) }
function assert(n, c, d) { if (c) ok(n, d); else bad(n, d || '') }

console.log('-- 1. 应当检测到的（真阳性）--')
{
  const positives = [
    ['计算 15 + 27 * 3 等于多少', 'arithmetic'],
    ['求解方程组 3x + 2y = 10, x - y = 1', 'equation'],
    ['求 x^3 * sin(x) 的导数', 'derivative'],
    ['这个星球的逃逸速度是多少？质量 5.97e24 kg，半径 6371 km', 'physics'],
    ['如果重力是地球的 1.5 倍，生物体型上限会变成多少', 'scaling'],
    ['帮我算一下 (1+2i)*(3-i)', 'complex'],
    ['这一年的GDP增长率是多少，去年 8.2 万亿，今年 9.1 万亿', 'growth'],
    ['计算矩阵 [[1,2],[3,4]] 的行列式', 'matrix'],
    ['这批数据的标准差是多少：12, 15, 18, 22, 25', 'stats'],
    ['把 100 km/h 换算成 m/s', 'unit'],
    ['推演这个行星的气候：半径 1.4 地球，自转 40 小时', 'world'],
    ['∫x²dx 的结果', 'integral'],
  ]
  for (const [text, label] of positives) {
    const r = detectMathNeed(text)
    assert(`检测到「${text.slice(0, 24)}…」（${label}）`, r.shouldPrompt,
      `score=${r.score.toFixed(2)} signals=[${r.signals.join(',')}]`)
  }
}

console.log('-- 2. 不应检测到的（真阴性，防误报）--')
{
  const negatives = [
    '这一章讲的是主角在 2024 年的第 3 次远征',
    '他今年 25 岁，住在第 7 区 12 号楼',
    '版本号 v2.0.1 修复了 3 个 bug',
    '请把这段文字翻译成英文',
    '这个设定的名字叫「星海纪元」，是一个架空世界',
    'https://example.com/path/to/123/file',
    '第一、第二、第三点分别是：设定、人物、情节',
    '她看着窗外，天边泛起鱼肚白',
    '第 3 章 第 5 节 讲了帝国的兴衰',
    '让我想想这个角色的性格应该怎么写',
  ]
  for (const text of negatives) {
    const r = detectMathNeed(text)
    assert(`不误报「${text.slice(0, 22)}…」`, !r.shouldPrompt,
      `score=${r.score.toFixed(2)} signals=[${r.signals.join(',')}]`)
  }
}

console.log('-- 3. 边界：正文里带大量数字但不算数学 --')
{
  // 编年史风格，数字多但都是年份/序号
  const chronicle =
    '公元 1247 年，第三代皇帝登基。公元 1251 年颁布第 4 号法令。' +
    '公元 1263 年，第 7 次北征。公元 1278 年，第 12 位大臣上任。'
  const r = detectMathNeed(chronicle)
  assert('编年史文本不误报', !r.shouldPrompt,
    `score=${r.score.toFixed(2)} signals=[${r.signals.join(',')}]`)
}

console.log('-- 4. 纯数字列表不应误报 --')
{
  const list = '1. 设定\n2. 人物\n3. 情节\n4. 世界观'
  const r = detectMathNeed(list)
  assert('编号列表不误报', !r.shouldPrompt, `score=${r.score.toFixed(2)}`)
}

console.log('-- 5. 会话节流 --')
{
  resetDetectionState('sess-a')
  const text = '计算 15 + 27 * 3'

  // 第一次应该提醒
  const first = shouldPromptNow('sess-a', text, 1, false)
  assert('第一次提醒', first.shouldPrompt, `score=${first.score.toFixed(2)}`)
  recordPrompt('sess-a', 1)

  // 冷却期内不应再提醒
  const duringCooldown = shouldPromptNow('sess-a', text, 2, false)
  assert('冷却期内不提醒', !duringCooldown.shouldPrompt, duringCooldown.reason ?? '')

  // 冷却过后可以再提醒
  const afterCooldown = shouldPromptNow('sess-a', text, 5, false)
  assert('冷却后可以再提醒', afterCooldown.shouldPrompt, `score=${afterCooldown.score.toFixed(2)}`)
  recordPrompt('sess-a', 5)

  const third = shouldPromptNow('sess-a', text, 9, false)
  assert('第三次仍可提醒', third.shouldPrompt)
  recordPrompt('sess-a', 9)

  // 达到上限后不再提醒
  const fourth = shouldPromptNow('sess-a', text, 20, false)
  assert('达上限后不再提醒', !fourth.shouldPrompt, fourth.reason ?? '')
}

console.log('-- 6. 用过插件后不再提醒 --')
{
  resetDetectionState('sess-b')
  const r = shouldPromptNow('sess-b', '计算 15 + 27 * 3', 1, true) // toolUsed=true
  assert('已用过插件则静默', !r.shouldPrompt, r.reason ?? '')
}

console.log('-- 7. 会话隔离 --')
{
  resetDetectionState()
  const text = '计算 15 + 27 * 3'
  const a = shouldPromptNow('sess-x', text, 1, false)
  recordPrompt('sess-x', 1)
  // 另一个会话不应受 sess-x 的提醒次数影响
  const b = shouldPromptNow('sess-y', text, 1, false)
  assert('会话间状态隔离', a.shouldPrompt && b.shouldPrompt,
    `a=${a.shouldPrompt} b=${b.shouldPrompt}`)
}

console.log('-- 8. 配置可调 --')
{
  resetDetectionState('sess-c')
  const text = '他今年 25 岁'
  const strict = shouldPromptNow('sess-c', text, 1, false, { threshold: 0.9 })
  const loose = shouldPromptNow('sess-c', text, 1, false, { threshold: 0.05 })
  assert('高阈值不触发', !strict.shouldPrompt, `score=${strict.score.toFixed(2)}`)
  assert('低阈值触发', loose.shouldPrompt, `score=${loose.score.toFixed(2)}`)

  resetDetectionState('sess-d')
  const disabled = shouldPromptNow('sess-d', '计算 15 + 27 * 3', 1, false, { enabled: false })
  assert('禁用后不提醒', !disabled.shouldPrompt, disabled.reason ?? '')
}

console.log('-- 9. 候选表达式提取 --')
{
  const r = detectMathNeed('计算 15 + 27 * 3 的值，还有 sqrt(144)')
  assert('提取到算式片段', r.candidates.length > 0, JSON.stringify(r.candidates))
}

console.log('-- 10. 空文本与异常输入 --')
{
  assert('空字符串不报错', detectMathNeed('').shouldPrompt === false)
  assert('纯空白不报错', detectMathNeed('   ').shouldPrompt === false)
  assert('非字符串不报错', detectMathNeed(null).shouldPrompt === false)
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  - ' + f.n + ': ' + f.d)
  process.exitCode = 1
}
