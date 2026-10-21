/**
 * 公式库测试：重点验证「架空世界改造」能力。
 */
const mod = await import('../lib/index.js')
const registered = []
mod.apply({ tools: { register: (d) => registered.push(d) } })
const tool = registered[0]

let passed = 0
const failures = []
const ok = (n) => { passed++; console.log(`  ok   ${n}`) }
const bad = (n, d) => { failures.push({ n, d }); console.log(`  FAIL ${n}\n         ${d}`) }
const assert = (n, c, d = '') => (c ? ok(n) : bad(n, d))

async function run(args) {
  const v = await tool.execute(args, {})
  return { v, text: tool.output.render(args, v)[0].text }
}

console.log('— 公式库浏览 —')
{
  const { v, text } = await run({ operation: 'formulas' })
  assert('列出全部分类', v.ok && text.includes('physics/mechanics'), text.slice(0, 80))
  const total = v.value?.total
  assert(`公式总数 >= 80（实际 ${total}）`, total >= 80, String(total))
}

{
  const { v, text } = await run({ operation: 'formulas', query: '重力' })
  assert('检索「重力」有结果', v.ok && v.value.matches.length > 0, text.slice(0, 100))
  assert('命中 gravitation', v.value.matches.includes('gravitation') || text.includes('万有引力'), JSON.stringify(v.value.matches))
}

console.log('— 公式计算 —')
{
  const { v, text } = await run({ operation: 'formula', formula: 'escape_velocity', overrides: { M: 5.9722e24, r: 6.371e6 } })
  assert('地球逃逸速度 ≈ 11186 m/s', v.ok && Number(v.value.answer) > 11000 && Number(v.value.answer) < 11300, text.split('\n').pop())
}

{
  const { v } = await run({ operation: 'formula', formula: 'surface_gravity', overrides: { M: 5.9722e24, R: 6.371e6 } })
  assert('地球表面重力 ≈ 9.8', v.ok && Math.abs(Number(v.value.answer) - 9.82) < 0.1, String(v.value?.answer))
}

console.log('— 架空世界改造：改重力 —')
{
  // 地球：跳动高度 h = v^2/(2g)
  const earth = await run({ operation: 'formula', formula: 'projectile_height', overrides: { v: 10, theta: Math.PI / 2, g: 9.80665 } })
  // 1.5g 异星
  const alien = await run({ operation: 'formula', formula: 'projectile_height', overrides: { v: 10, theta: Math.PI / 2, g: 14.71 } })
  const hEarth = Number(earth.v.value?.answer)
  const hAlien = Number(alien.v.value?.answer)
  assert('地球跳跃高度 ≈ 5.1m', Math.abs(hEarth - 5.1) < 0.1, String(hEarth))
  assert('1.5g 星球高度约为地球 2/3', Math.abs(hAlien / hEarth - 1 / 1.5) < 0.01, `${hAlien} vs ${hEarth}`)
  assert('回显标注了覆盖参数 g', alien.text.includes('*') && alien.text.includes('g'), alien.text.slice(0, 200))
}

console.log('— 架空世界改造：改光速 —')
{
  const { v } = await run({ operation: 'formula', formula: 'lorentz_factor', overrides: { v: 0.8 * 100000000, c: 100000000 } })
  assert('光速=1e8 时 0.8c 的 γ=1.667', v.ok && Math.abs(Number(v.value.answer) - 1.6667) < 0.001, String(v.value?.answer))
}

console.log('— 结构级改造：自定义表达式 —')
{
  const { v, text } = await run({
    operation: 'formula',
    formula: 'weight',
    overrides: { m: 100, g: 9.8 },
    customExpression: 'm * g * 1.3',
  })
  assert('自定义表达式生效（重力异常 +30%）', v.ok && Math.abs(Number(v.value.answer) - 1274) < 1, text.split('\n').pop())
  assert('回显显示被改写的表达式', v.value.expression === 'm * g * 1.3', String(v.value?.expression))
}

console.log('— 缺参数必须明确报错 —')
{
  const { v, text } = await run({ operation: 'formula', formula: 'kinetic_energy' })
  assert('缺参数返回失败', v.ok === false, JSON.stringify(v).slice(0, 100))
  assert('错误类型 missing_params', v.error?.type === 'missing_params', String(v.error?.type))
  assert('提示里列出缺的参数', /m|v/.test(v.error?.hint ?? ''), v.error?.hint)
  assert('提示含完整参数表', text.includes('质量') || text.includes('速度'), text.slice(0, 150))
}

console.log('— 不存在的公式 —')
{
  const { v } = await run({ operation: 'formula', formula: '完全不存在的公式xyz' })
  assert('未知公式返回失败', v.ok === false, JSON.stringify(v).slice(0, 80))
  assert('错误类型 unknown_formula', v.error?.type === 'unknown_formula', String(v.error?.type))
}

console.log('— 各学科抽样 —')
{
  const cases = [
    ['gravitation', { m1: 5.9722e24, m2: 70, r: 6.371e6 }, '体重 70kg 受到的地球引力'],
    ['ideal_gas', { n: 1, T: 300, P: 101325 }, '理想气体摩尔体积'],
    ['compound_interest', { P: 1000, r: 0.07, t: 30 }, '复利 30 年'],
    ['cobb_douglas', { K: 100, L: 50 }, '柯布-道格拉斯产出'],
    ['logistic_growth', { K: 1000, N0: 10, r: 0.3, t: 20 }, '逻辑斯蒂人口'],
    ['herd_immunity', { R0: 3 }, '群体免疫阈值'],
    ['square_cube_law', { s: 3 }, '平方立方定律'],
    ['carnot_efficiency', { Tc: 300, Th: 600 }, '卡诺效率'],
    ['mass_energy', { m: 1 }, '1kg 质能'],
    ['decibel', { I: 1e-6 }, '声压级'],
    ['shannon_entropy', { p: '[0.5,0.5]' }, '二元熵'],
    ['gravity_trade', { M1: 1000000, M2: 500000, D: 100 }, '引力模型'],
  ]
  for (const [id, overrides, label] of cases) {
    const { v } = await run({ operation: 'formula', formula: id, overrides })
    assert(`${label}（${id}）`, v.ok === true, String(v.error?.message ?? v.error?.type))
  }
}

console.log('— 数组参数（熵/HHI/辛普森/基尼，走 JS 内置实现） —')
{
  const entropy = await run({ operation: 'formula', formula: 'shannon_entropy', overrides: { p: [0.5, 0.5] } })
  assert('二元均匀分布熵 = 1 bit', entropy.v.ok && Math.abs(Number(entropy.v.value.answer) - 1) < 1e-9, String(entropy.v.value?.answer))

  const entropy4 = await run({ operation: 'formula', formula: 'shannon_entropy', overrides: { p: '[0.25,0.25,0.25,0.25]' } })
  assert('四元均匀分布熵 = 2 bit（字符串数组也可）', entropy4.v.ok && Math.abs(Number(entropy4.v.value.answer) - 2) < 1e-9, String(entropy4.v.value?.answer))

  const hhiResult = await run({ operation: 'formula', formula: 'hhi', overrides: { s: [0.4, 0.3, 0.3] } })
  assert('HHI = 0.34', hhiResult.v.ok && Math.abs(Number(hhiResult.v.value.answer) - 0.34) < 1e-9, String(hhiResult.v.value?.answer))

  const simpson = await run({ operation: 'formula', formula: 'simpson_diversity', overrides: { p: [0.5, 0.3, 0.2] } })
  assert('辛普森多样性 = 0.62', simpson.v.ok && Math.abs(Number(simpson.v.value.answer) - 0.62) < 1e-9, String(simpson.v.value?.answer))

  const giniResult = await run({ operation: 'formula', formula: 'gini', overrides: { y: [10, 20, 30, 40] } })
  assert('基尼系数 = 0.25', giniResult.v.ok && Math.abs(Number(giniResult.v.value.answer) - 0.25) < 1e-9, String(giniResult.v.value?.answer))
}

console.log('')
if (failures.length > 0) {
  console.log(`${passed} passed, ${failures.length} failed`)
  for (const f of failures) console.log(`  - ${f.n}: ${f.d}`)
  process.exitCode = 1
} else {
  console.log(`全部通过：${passed} 项`)
}
