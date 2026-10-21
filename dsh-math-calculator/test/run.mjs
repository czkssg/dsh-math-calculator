/**
 * 全能力测试。跑法：node test/run.mjs
 */
const plugin = await import('../lib/index.js')
const registered = []
plugin.apply({ tools: { register: (definition) => registered.push(definition) } })
const tool = registered[0]

let passed = 0
const failures = []

function ok(name) {
  passed += 1
  console.log(`  ok   ${name}`)
}
function bad(name, detail) {
  failures.push({ name, detail })
  console.log(`  FAIL ${name}\n         ${detail}`)
}
function assert(name, condition, detail = '') {
  if (condition) ok(name)
  else bad(name, detail)
}

async function call(args) {
  const value = await tool.execute(args, {})
  const text = tool.output.render(args, value)[0].text
  return { value, text }
}

console.log('— 1. 大数与高精度 —')
{
  const r1 = await call({ expression: '10^20 + 5' })
  assert('10^20+5 完整定点', r1.text === '100000000000000000005', r1.text)

  const r2 = await call({ expression: '0.1 + 0.2' })
  assert('0.1+0.2 = 0.3（无浮点误差）', r2.text === '0.3', r2.text)

  const r3 = await call({ expression: 'factorial(50)' })
  const expected50 = '30414093201713378043612608166064768844377641568960512000000000000'
  assert('50! 精确 65 位', r3.text === expected50, r3.text)

  const r4 = await call({ expression: 'combinations(100,50)' })
  assert('C(100,50) 精确', r4.text === '100891344545564193334812497256', r4.text)

  const r5 = await call({ expression: '2^200' })
  assert('2^200 精确', r5.text === '1606938044258990275541962092341162602522202993782792835301376', r5.text)

  const r6 = await call({ expression: '1/3', precision: 30 })
  assert('1/3 可指定 30 位', r6.text.startsWith('0.333333333333333333333333333333'), r6.text)
}

console.log('— 2. 符号代数与方程 —')
{
  const r1 = await call({ expression: '3x + 2y = 10, x - y = 1' })
  assert('二元一次方程组', r1.text === 'x = 2.4，y = 1.4', r1.text)

  const r2 = await call({ expression: '2x - 3y + z = 5, x + y - z = 2, 3x - y + 2z = 8' })
  assert('三元一次方程组有解', r2.value.ok === true, r2.text)

  const r3 = await call({ expression: 'x^2 - 5*x + 6 = 0' })
  assert('一元二次方程', /x = 2.*x = 3|x = 3.*x = 2/.test(r3.text), r3.text)

  const r4 = await call({ expression: '2*x + 3*x - x', operation: 'simplify' })
  assert('化简 2x+3x-x = 4x', r4.text.replace(/\s/g, '') === '4*x', r4.text)

  const r5 = await call({ expression: '(x+1)^2', operation: 'expand' })
  assert('展开 (x+1)^2', r5.text.includes('2') && r5.text.includes('x^2'), r5.text)

  const r6 = await call({ expression: 'x^2 - 4', operation: 'roots' })
  assert('求根 x^2-4', /-2/.test(r6.text) && /2/.test(r6.text), r6.text)
}

console.log('— 3. 微积分 —')
{
  const r1 = await call({ expression: 'x^3', operation: 'derivative' })
  assert('d/dx x^3 = 3x^2', r1.text.replace(/\s/g, '') === '3*x^2', r1.text)

  const r2 = await call({ expression: 'x^3 * sin(x)', operation: 'derivative' })
  assert(
    'd/dx x^3 sin x（乘积法则）',
    r2.text.includes('3*x^2*sin(x)') && r2.text.includes('x^3*cos(x)'),
    r2.text,
  )

  const r3 = await call({ expression: 'sin(x)', operation: 'derivative' })
  assert('d/dx sin x = cos x', r3.text.replace(/\s/g, '') === 'cos(x)', r3.text)

  const r4 = await call({ expression: 'x^2', operation: 'integral' })
  assert('∫x^2 dx', /x\^3/.test(r4.text) && r4.text.includes('+ C'), r4.text)

  const r5 = await call({ expression: 'sin(x)', operation: 'integral' })
  assert('∫sin x dx = -cos x', /cos\(x\)/.test(r5.text), r5.text)

  const r6 = await call({ expression: '1/x', operation: 'integral' })
  assert('∫1/x dx = ln x', /log\(x\)|ln\(x\)/.test(r6.text), r6.text)

  const r7 = await call({ expression: 'x*exp(x)', operation: 'integral' })
  assert('∫x e^x dx', r7.value.ok === true, r7.text)
}

console.log('— 4. 矩阵与线性代数 —')
{
  const r1 = await call({ expression: '[[1,2],[3,4]] * [[5,6],[7,8]]' })
  assert('矩阵乘法', r1.text.replace(/\s/g, '') === '[[19,22],[43,50]]', r1.text)

  const r2 = await call({ expression: 'det([[1,2],[3,4]])' })
  assert('行列式 = -2', r2.text === '-2', r2.text)

  const r3 = await call({ expression: 'inv([[1,2],[3,4]])' })
  assert('求逆', r3.text.replace(/\s/g, '') === '[[-2,1],[1.5,-0.5]]', r3.text)

  const r4 = await call({ expression: 'transpose([[1,2],[3,4]])' })
  assert('转置', r4.text.replace(/\s/g, '') === '[[1,3],[2,4]]', r4.text)

  const r5 = await call({ matrix: [[2, 1], [1, 2]], operation: 'eigen' })
  assert('特征值 1 和 3', /特征值/.test(r5.text) && r5.text.includes('1') && r5.text.includes('3'), r5.text)

  const r6 = await call({ matrix: [[1, 2], [3, 4]], vector: [5, 6], operation: 'system' })
  assert('显式线性系统求解', r6.value.ok === true, r6.text)

  const r7 = await call({ matrix: [[2, 1, 0], [1, 2, 1], [0, 1, 2]], operation: 'eigen' })
  assert('3×3 特征值', /特征值/.test(r7.text), r7.text)
}

console.log('— 5. 统计与概率 —')
{
  const r1 = await call({ data: [1, 2, 3, 4], operation: 'stats' })
  assert('均值 2.5', r1.text.includes('2.5'), r1.text)
  assert('标准差(样本)', r1.text.includes('1.2909944'), r1.text)

  const r2 = await call({ data: [1, 3, 2], operation: 'stats' })
  assert('中位数 2', r2.text.includes('中位数 = 2'), r2.text)

  const r3 = await call({ distribution: 'normal', params: [0, 1], x: 1.96, operation: 'dist' })
  assert('正态 CDF(1.96) ≈ 0.975', /0\.9750/.test(r3.text), r3.text)

  const r4 = await call({ distribution: 'binomial', params: [10, 0.5], x: 5, operation: 'dist' })
  assert('二项 PMF(5;10,0.5)', r4.text.includes('0.246'), r4.text)

  const r5 = await call({ distribution: 'poisson', params: [3], x: 2, operation: 'dist' })
  assert('泊松 PMF(2;3)', r5.value.ok === true, r5.text)

  const r6 = await call({ distribution: 'normalinv', params: [], x: 0.975, operation: 'dist' })
  assert('正态分位数 0.975 ≈ 1.96', /1\.95|1\.96/.test(r6.text), r6.text)

  const r7 = await call({ data: [1, 2, 3, 4, 5], dataY: [2, 4, 6, 8, 10], operation: 'regression' })
  assert('线性回归 y=2x', r7.text.includes('2') && r7.text.includes('R²'), r7.text)
}

console.log('— 6. variables 变量字典 —')
{
  const r1 = await call({ expression: 'm * v', variables: { m: 500, v: 30 } })
  assert('变量替换 500*30', r1.text === '15000', r1.text)

  const r2 = await call({ expression: '0.5 * m * v^2', variables: { m: 500, v: 30 } })
  assert('动能公式', r2.text === '225000', r2.text)

  const r3 = await call({ expression: 'c^2', variables: { c: '299792458' } })
  assert('大数变量字符串', r3.text === '89875517873681764', r3.text)
}

console.log('— 7. 错误处理（绝不抛异常） —')
{
  for (const [label, args] of [
    ['语法错', { expression: '1++*2' }],
    ['未定义符号', { expression: 'zzz + 1' }],
    ['除零', { expression: '1/0' }],
    ['危险标识符', { expression: 'process.exit(0)' }],
    ['不可积函数', { expression: 'x^3*sin(x)', operation: 'integral' }],
    ['维度不符', { expression: 'det([[1,2],[3,4],[5,6]])' }],
    ['矛盾方程组', { matrix: [[1, 2], [2, 4]], vector: [1, 3], operation: 'system' }],
  ]) {
    let threw = false
    let result
    try {
      result = await call(args)
    } catch {
      threw = true
    }
    assert(`${label} 未抛异常`, !threw)
    if (!threw) {
      assert(`  └ ${label} 返回结构化失败`, result.value.ok === false, JSON.stringify(result.value).slice(0, 100))
      assert(`  └ ${label} 有错误信息`, typeof result.value.error?.message === 'string' && result.value.error.message.length > 0)
      let serializable = true
      try {
        JSON.stringify(result.value)
      } catch {
        serializable = false
      }
      assert(`  └ ${label} JSON 安全`, serializable)
    }
  }
}

console.log('— 8. help —')
{
  const r = await call({ expression: '', operation: 'help' })
  assert('help 返回能力清单', r.value.ok === true && r.text.includes('math_execute'), r.text.slice(0, 50))
}

console.log('')
if (failures.length > 0) {
  console.log(`${passed} passed, ${failures.length} failed`)
  for (const failure of failures) console.log(`  - ${failure.name}: ${failure.detail}`)
  process.exitCode = 1
} else {
  console.log(`全部通过：${passed} 项`)
}
