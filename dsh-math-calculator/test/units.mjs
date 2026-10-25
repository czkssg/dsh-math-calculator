/**
 * 单位换算（`operation="units"`）。
 *
 * ## 为什么需要
 *
 * 插件此前只有**量纲分析**（`quantities.ts`），没有**单位换算**。作者写
 * 「城墙高三丈」「三十里外」时，AI 要么自己心算（违反「复杂计算必须调工具」），
 * 要么换算错了也没人发现。
 *
 * ## 期望值来源
 *
 * 全部从**单位定义**独立算出，不从实现里抄：
 *   30 里 = 30 × 500 m = 15000 m = 15 km
 *   3 丈 = 3 × 3.2 m = 9.6 m
 *   37 °C → 310.15 K → 98.6 °F
 *   1.5 AU = 1.5 × 1.495978707e11 m = 2.2439700605e11 m = 2.24397e8 km
 *   100 亩 = 100 × 666.67 m² = 66666.7 m² = 6.66667 ha
 */
import { opUnits } from '../lib/ops/units-op.js'
import { convert, findUnit, listUnits, UNITS, BASE_UNIT } from '../lib/units.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 跑一次换算，返回结构化结果。 */
function run(args) {
  try {
    const r = opUnits(args)
    return { ok: true, text: r.result, value: r.value }
  } catch (error) {
    return { ok: false, type: error.type, message: error.message, hint: error.hint }
  }
}

/** 取换算出来的数值。 */
function num(args) {
  const r = run(args)
  return r.ok ? r.value.result : undefined
}

console.log('-- 1. 基础换算（期望值独立手算）--')
{
  // 30 里 × 500 m = 15000 m = 15 km
  assert('30 里 = 15 km', Math.abs(num({ unitValue: 30, unitFrom: '里', unitTo: 'km' }) - 15) < 1e-9,
    String(num({ unitValue: 30, unitFrom: '里', unitTo: 'km' })))
  // 3 丈 × 3.2 m = 9.6 m
  assert('3 丈 = 9.6 m', Math.abs(num({ unitValue: 3, unitFrom: '丈', unitTo: 'm' }) - 9.6) < 1e-9,
    String(num({ unitValue: 3, unitFrom: '丈', unitTo: 'm' })))
  // 1.5 AU = 1.5 × 1.495978707e11 m / 1000 = 2.24396806e8 km
  const au = num({ unitValue: 1.5, unitFrom: 'AU', unitTo: 'km' })
  assert('1.5 AU ≈ 2.2439681e8 km', au && Math.abs(au / 2.2439680605e8 - 1) < 1e-6, au && au.toExponential(7))
  // 100 亩 × 666.6667 m² / 1e4 = 6.66667 ha
  assert('100 亩 ≈ 6.6667 公顷', Math.abs(num({ unitValue: 100, unitFrom: '亩', unitTo: 'ha' }) - 6.666666666666667) < 1e-6,
    String(num({ unitValue: 100, unitFrom: '亩', unitTo: 'ha' })))
  // 2 时辰 × 7200 s / 3600 = 4 h
  assert('2 时辰 = 4 h', Math.abs(num({ unitValue: 2, unitFrom: '时辰', unitTo: 'h' }) - 4) < 1e-9,
    String(num({ unitValue: 2, unitFrom: '时辰', unitTo: 'h' })))
}

console.log('-- 2. 温度是仿射换算，不能只乘系数 --')
{
  // 37 °C → 310.15 K → 98.6 °F
  assert('37 °C = 98.6 °F', Math.abs(num({ unitValue: 37, unitFrom: '°C', unitTo: '°F' }) - 98.6) < 1e-9,
    String(num({ unitValue: 37, unitFrom: '°C', unitTo: '°F' })))
  assert('0 °C = 273.15 K', Math.abs(num({ unitValue: 0, unitFrom: '°C', unitTo: 'K' }) - 273.15) < 1e-9,
    String(num({ unitValue: 0, unitFrom: '°C', unitTo: 'K' })))
  assert('100 °C = 212 °F', Math.abs(num({ unitValue: 100, unitFrom: '°C', unitTo: '°F' }) - 212) < 1e-9,
    String(num({ unitValue: 100, unitFrom: '°C', unitTo: '°F' })))
  // 结冰点反向：273.15 K = 32 °F
  assert('273.15 K = 32 °F', Math.abs(num({ unitValue: 273.15, unitFrom: 'K', unitTo: '°F' }) - 32) < 1e-6,
    String(num({ unitValue: 273.15, unitFrom: 'K', unitTo: '°F' })))
  // 低于绝对零度应给警告而非静默
  const r = run({ unitValue: -5, unitFrom: 'K', unitTo: '°C' })
  assert('负绝对温度会警告', r.ok && JSON.stringify(r.value.warnings).includes('绝对零度'),
    r.ok ? JSON.stringify(r.value.warnings) : r.message)
}

console.log('-- 3. 量纲不符必须拒绝，不能瞎算 --')
{
  const r = run({ unitFrom: '里', unitTo: 'kg' })
  assert('长度 → 质量 被拒', r.ok === false, r.ok ? '算出了 ' + r.value.result : '')
  assert('拒绝信息说清两个量纲', r.ok === false && r.message.includes('长度') && r.message.includes('质量'),
    r.ok ? '' : r.message)
  assert('给了修复方向', r.ok === false && Boolean(r.hint), r.ok ? '' : r.hint)

  const r2 = run({ unitFrom: '斤', unitTo: 's' })
  assert('质量 → 时间 被拒', r2.ok === false, r2.ok ? '' : r2.message)
}

console.log('-- 4. 不认识单位要报错并指路，不猜 --')
{
  const r = run({ unitFrom: '斯特恩', unitTo: 'km' })
  assert('未知单位被拒', r.ok === false, r.ok ? '猜了一个结果' : '')
  assert('报错里点出这个单位名', r.ok === false && r.message.includes('斯特恩'), r.ok ? '' : r.message)
  assert('提示怎么查单位清单', r.ok === false && r.hint.includes('units'), r.ok ? '' : r.hint)
}

console.log('-- 5. 缺参数要说清缺什么 --')
{
  const r = run({ unitFrom: '里' })
  assert('只给一个单位 → 报错', r.ok === false, r.ok ? '' : '')
  assert('报错说明要同时给两个', r.ok === false && r.message.includes('unitTo'), r.ok ? '' : r.message)

  const r2 = run({ unitValue: 5 })
  assert('只给数值 → 报错', r2.ok === false, r2.ok ? '' : '')

  const r3 = run({ unitValue: 5, unitFrom: '里', unitTo: 'km' })
  assert('三个都给 → 成功', r3.ok === true, r3.ok ? '' : r3.message)
}

console.log('-- 6. 不带参数 → 列出全部单位 --')
{
  const r = run({})
  assert('列清单成功', r.ok === true, r.ok ? '' : r.message)
  assert('含中文古制「里」', r.text.includes('里'), '')
  assert('含天文单位 AU', r.text.includes('AU'), '')
  assert('含温度 °C', r.text.includes('°C'), '')
  assert('按量纲分组标题', r.text.includes('【长度】') && r.text.includes('【温度】'), '')
  assert('给了用法示例', r.text.includes('unitFrom'), '')
  // 结构化值也要有
  assert('value.mode = list', r.value && r.value.mode === 'list', r.value && r.value.mode)
  assert('每个量纲都带基准单位',
    r.value && r.value.dimensions.every((d) => typeof d.base === 'string' && d.base !== ''),
    '')
}

console.log('-- 7. 自定义单位：项目可以覆盖内置 --')
{
  // 把「里」定义成清制 576 m：30 里 = 30 × 576 = 17280 m = 17.28 km
  const r = run({
    unitValue: 30,
    unitFrom: '里',
    unitTo: 'km',
    customUnits: [{ name: '里', dimension: 'length', factor: 576, note: '清制' }],
  })
  assert('自定义「里」= 576 m 生效', r.ok && Math.abs(r.value.result - 17.28) < 1e-9,
    r.ok ? String(r.value.result) : r.message)

  // 完全自创的单位
  const r2 = run({
    unitValue: 3,
    unitFrom: '斯特恩',
    unitTo: 'km',
    customUnits: [{ name: '斯特恩', dimension: 'length', factor: 12000 }],
  })
  assert('自创单位「斯特恩」可用（3 × 12 km = 36 km）',
    r2.ok && Math.abs(r2.value.result - 36) < 1e-9, r2.ok ? String(r2.value.result) : r2.message)

  // 自定义量纲写错要报错
  const r3 = run({
    unitValue: 1,
    unitFrom: '甲',
    unitTo: 'km',
    customUnits: [{ name: '甲', dimension: '重量', factor: 1 }],
  })
  assert('自定义量纲写错被拒', r3.ok === false, r3.ok ? '' : '')
  assert('报错列出可用量纲', r3.ok === false && r3.hint.includes('length'), r3.ok ? '' : r3.hint)

  // factor 为 0 要报错（否则除零）
  const r4 = run({
    unitValue: 1,
    unitFrom: '乙',
    unitTo: 'm',
    customUnits: [{ name: '乙', dimension: 'length', factor: 0 }],
  })
  assert('factor=0 被拒', r4.ok === false, r4.ok ? '' : '')
}

console.log('-- 8. 代入过程必须可核对外 --')
{
  const r = run({ unitValue: 30, unitFrom: '里', unitTo: 'km' })
  assert('给出 1 单位的基准换算', r.text.includes('1 里 = 500 m'), '')
  assert('给出中间值', r.text.includes('15000'), '')
  assert('给出目标单位换算', r.text.includes('1 km = 1000 m'), '')
  assert('结构化 steps 非空', Array.isArray(r.value.steps) && r.value.steps.length >= 2,
    String(r.value.steps && r.value.steps.length))
  // 历史单位差异要提醒，否则作者以为 500 m 是唯一答案
  assert('提醒古制朝代差异', r.text.includes('朝代') || r.text.includes('清制'), '')
}

console.log('-- 9. 单位表自身的完整性 --')
{
  assert('单位数量可观', UNITS.length >= 60, String(UNITS.length))
  // 每个单位都能按名字与别名查到
  const missing = UNITS.filter(function (unit) {
    return findUnit(unit.name) === undefined
  })
  assert('每个单位名都能查到', missing.length === 0, missing.map((u) => u.name).join(','))
  const aliasMissing = UNITS.filter(function (unit) {
    return (unit.aliases || []).some(function (alias) { return findUnit(alias) === undefined })
  })
  assert('每个别名都能查到', aliasMissing.length === 0, aliasMissing.map((u) => u.name).join(','))
  // factor 必须都是正的有限数，否则换算会崩
  const badFactor = UNITS.filter(function (unit) {
    return !Number.isFinite(unit.factor) || unit.factor <= 0
  })
  assert('所有 factor 是正有限数', badFactor.length === 0, badFactor.map((u) => u.name).join(','))
  // 每个量纲都要有基准单位
  const badBase = Object.entries(BASE_UNIT).filter(function ([, base]) {
    return !UNITS.some(function (unit) { return unit.name === base })
  })
  assert('每个基准单位都在表里', badBase.length === 0, badBase.map(([d]) => d).join(','))
  // 基准单位的 factor 必须是 1
  const badOne = Object.entries(BASE_UNIT).filter(function ([, base]) {
    const unit = findUnit(base)
    return unit !== undefined && unit.factor !== 1
  })
  assert('基准单位 factor = 1', badOne.length === 0, badOne.map(([, b]) => b).join(','))
  assert('listUnits 能按量纲列出', listUnits('length').length > 10, String(listUnits('length').length))
}

console.log('-- 10. 自洽性：往返换算回到原点 --')
{
  const pairs = [
    ['里', 'km'],
    ['丈', 'ft'],
    ['斤', 'lb'],
    ['亩', 'ha'],
    ['年', 'day'],
  ]
  for (const [a, b] of pairs) {
    const forward = num({ unitValue: 1, unitFrom: a, unitTo: b })
    if (forward === undefined) { assert(a + ' → ' + b + ' 可换算', false, '换算失败'); continue }
    const back = num({ unitValue: forward, unitFrom: b, unitTo: a })
    assert(a + ' ⇄ ' + b + ' 往返一致', back !== undefined && Math.abs(back - 1) < 1e-9,
      back === undefined ? '反向失败' : String(back))
  }
  // convert() 直接调用也要一致（不经 op 层）
  const direct = convert(30, '里', 'km')
  assert('convert() 直接调用 = 15', direct.ok && Math.abs(direct.conversion.result - 15) < 1e-9,
    direct.ok ? String(direct.conversion.result) : direct.error)
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
