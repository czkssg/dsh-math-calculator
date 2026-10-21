/**
 * ODE 测试：用有解析解的方程验证 RK4 精度。
 *
 * 关键：不能只看"跑起来了"，要用已知答案核对。
 */
const mod = await import('../lib/index.js')
const exec = (a) => mod.runMathTool(a)

let passed = 0
const failures = []
const ok = (n) => { passed++; console.log(`  ok   ${n}`) }
const bad = (n, d) => { failures.push({ n, d }); console.log(`  FAIL ${n}\n         ${d}`) }
const assert = (n, c, d = '') => (c ? ok(n) : bad(n, d))
const near = (a, b, tol) => Math.abs(a - b) <= tol

console.log('— 1. 指数增长/衰减（解析解可核对）—')
{
  // dy/dt = y, y(0)=1  →  y(t) = e^t
  const r = exec({ operation: 'ode', expression: 'dy/dt = y', initial: { y: 1 }, from: 0, to: 2, steps: 200 })
  assert('dy/dt=y 求解成功', r.ok, r.error?.message)
  const y2 = r.value?.final?.y
  assert(`y(2) ≈ e^2 = 7.389（实测 ${y2?.toFixed(6)}）`, near(y2, Math.exp(2), 1e-4), String(y2))

  // dy/dt = -0.5y, y(0)=100 → y(t)=100e^(-t/2)
  const decay = exec({ operation: 'ode', expression: 'dy/dt = -0.5*y', initial: { y: 100 }, from: 0, to: 10, steps: 500 })
  assert('放射性衰变求解成功', decay.ok, decay.error?.message)
  const y10 = decay.value?.final?.y
  const exact = 100 * Math.exp(-5)
  assert(`y(10) ≈ 100e^-5 = ${exact.toFixed(6)}（实测 ${y10?.toFixed(6)}）`, near(y10, exact, 1e-4), String(y10))
}

console.log('— 2. 谐振动（二阶方程降阶）—')
{
  // d^2x/dt^2 = -x, x(0)=1, v(0)=0 → x(t)=cos(t)
  const r = exec({
    operation: 'ode',
    expression: 'd^2x/dt^2 = -x',
    initial: { x: 1, x_d: 0 },
    from: 0,
    to: Math.PI,
    steps: 2000,
  })
  assert('二阶方程求解成功', r.ok, r.error?.message)
  const xPi = r.value?.final?.x
  assert(`x(π) ≈ cos(π) = -1（实测 ${xPi?.toFixed(6)}）`, near(xPi, -1, 1e-4), String(xPi))
}

console.log('— 3. SIR 传染病模型（这正是之前说做不到的）—')
{
  const r = exec({
    operation: 'ode',
    expression: 'dS/dt = -0.3*S*I, dI/dt = 0.3*S*I - 0.1*I, dR/dt = 0.1*I',
    initial: { S: 0.99, I: 0.01, R: 0 },
    from: 0,
    to: 100,
    steps: 5000,
  })
  assert('SIR 三方程求解成功', r.ok, r.error?.message)

  const final = r.value?.final ?? {}
  assert('S+I+R 守恒（≈1）', near((final.S ?? 0) + (final.I ?? 0) + (final.R ?? 0), 1, 1e-6),
    `S=${final.S}, I=${final.I}, R=${final.R}`)
  assert('最终 I → 0（疫情结束）', (final.I ?? 1) < 0.01, String(final.I))
  assert('最终 S 显著下降', (final.S ?? 1) < 0.5, String(final.S))
  assert('R 上升', (final.R ?? 0) > 0.5, String(final.R))

  // 峰值感染应在过程中出现
  const peak = r.value?.extremes?.I
  assert('记录了感染峰值', peak && peak.max > 0.01, JSON.stringify(peak))
  console.log(`       峰值 I = ${peak?.max?.toFixed(5)} @ t = ${peak?.maxAt?.toFixed(2)}`)
}

console.log('— 4. Lotka-Volterra 捕食模型 —')
{
  const r = exec({
    operation: 'ode',
    expression: 'dx/dt = 1.0*x - 0.05*x*y, dy/dt = 0.02*x*y - 0.4*y',
    initial: { x: 20, y: 5 },
    from: 0,
    to: 200,
    steps: 20000,
  })
  assert('捕食模型求解成功', r.ok, r.error?.message)
  assert('猎物有波动', r.value?.extremes?.x?.max > r.value?.extremes?.x?.min, JSON.stringify(r.value?.extremes?.x))
  console.log(`       猎物 x: ${r.value?.extremes?.x?.min?.toFixed(2)} ~ ${r.value?.extremes?.x?.max?.toFixed(2)}`)
  console.log(`       捕食者 y: ${r.value?.extremes?.y?.min?.toFixed(2)} ~ ${r.value?.extremes?.y?.max?.toFixed(2)}`)
}

console.log('— 5. 阻尼落体（有终端速度解析解）—')
{
  // dv/dt = g - k*v, v(0)=0 → v(t) = (g/k)(1-e^{-kt})
  const g = 9.8, k = 0.5
  const r = exec({ operation: 'ode', expression: 'dv/dt = 9.8 - 0.5*v', initial: { v: 0 }, from: 0, to: 20, steps: 2000 })
  assert('阻尼落体求解成功', r.ok, r.error?.message)
  const v20 = r.value?.final?.v
  const exact = (g / k) * (1 - Math.exp(-k * 20))
  assert(`v(20) ≈ 终端速度 ${exact.toFixed(4)}（实测 ${v20?.toFixed(4)}）`, near(v20, exact, 1e-3), String(v20))
}

console.log('— 6. 步数对精度的影响 —')
{
  const results = []
  for (const steps of [10, 100, 1000]) {
    const r = exec({ operation: 'ode', expression: 'dy/dt = y', initial: { y: 1 }, from: 0, to: 1, steps })
    results.push({ steps, error: Math.abs((r.value?.final?.y ?? 0) - Math.E) })
  }
  console.log(`       steps=10:   误差 ${results[0].error.toExponential(2)}`)
  console.log(`       steps=100:  误差 ${results[1].error.toExponential(2)}`)
  console.log(`       steps=1000: 误差 ${results[2].error.toExponential(2)}`)
  assert('步数越多误差越小', results[2].error < results[0].error, JSON.stringify(results))
}

console.log('— 7. 错误处理 —')
{
  const cases = [
    ['缺初值', { operation: 'ode', expression: 'dy/dt = y', from: 0, to: 1 }],
    ['非导数形式', { operation: 'ode', expression: 'y = x', initial: { y: 1 } }],
    ['缺等号', { operation: 'ode', expression: 'dy/dt', initial: { y: 1 } }],
    ['未定义符号', { operation: 'ode', expression: 'dy/dt = zzz*y', initial: { y: 1 } }],
    ['区间零长度', { operation: 'ode', expression: 'dy/dt = y', initial: { y: 1 }, from: 1, to: 1 }],
  ]
  for (const [label, args] of cases) {
    let threw = false
    let r
    try { r = exec(args) } catch { threw = true }
    assert(`${label} 不抛异常`, !threw)
    if (!threw) {
      assert(`  └ ${label} 返回结构化失败`, r.ok === false, JSON.stringify(r).slice(0, 80))
      assert(`  └ ${label} 有错误信息`, typeof r.error?.message === 'string' && r.error.message.length > 0)
    }
  }
}

console.log('— 8. 发散检测 —')
{
  // dy/dt = y^2, y(0)=1 → 在 t=1 处发散
  const r = exec({ operation: 'ode', expression: 'dy/dt = y^2', initial: { y: 1 }, from: 0, to: 5, steps: 1000 })
  assert('发散方程未崩溃', r.ok === true, r.error?.message)
  assert('检测到发散或数值爆炸', (r.value?.warnings?.length ?? 0) > 0 || !Number.isFinite(r.value?.final?.y),
    JSON.stringify(r.value?.warnings))
  console.log(`       警告: ${r.value?.warnings?.[0]?.slice(0, 70) ?? '(无)'}`)
}

console.log('')
if (failures.length > 0) {
  console.log(`${passed} passed, ${failures.length} failed`)
  for (const f of failures) console.log(`  - ${f.n}: ${f.d}`)
  process.exitCode = 1
} else {
  console.log(`全部通过：${passed} 项`)
}
