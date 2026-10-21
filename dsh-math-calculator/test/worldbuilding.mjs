/**
 * 世界观推导需求压测：拿真实的架空设定问题打这个插件，
 * 看哪些能算、哪些算不了、算不了的时候是报错还是给假答案。
 */
const mod = await import('../lib/index.js')
const registered = []
mod.apply({ tools: { register: (d) => registered.push(d) } })
const tool = registered[0]

async function probe(label, args) {
  let r
  try {
    r = await tool.execute(args, {})
  } catch (e) {
    console.log(`\n【${label}】\n  抛异常: ${e.message}`)
    return
  }
  const text = tool.output.render(args, r)[0].text
  const status = r.ok ? '✅' : '❌'
  console.log(`\n${status}【${label}】`)
  console.log('   ' + text.split('\n').slice(0, 4).join('\n   '))
  if (!r.ok) console.log(`   错误类型: ${r.error?.type}`)
}

// ── 物理 ──
await probe('平方立方定律：3 倍体型巨兽的承重压力倍数', {
  expression: '3^3 / 3^2',
})
await probe('开普勒第三定律：双倍轨道半径的公转周期比', {
  expression: '2^(3/2)',
})
await probe('相对论时间膨胀：0.8c 下 1 年对应多少年', {
  expression: '1 / sqrt(1 - 0.8^2)',
})
await probe('热平衡：两种物质混合后的终温（能量守恒）', {
  expression: '(m1*c1*T1 + m2*c2*T2) / (m1*c1 + m2*c2)',
  variables: { m1: 2, c1: 4186, T1: 100, m2: 5, c2: 900, T2: 20 },
})
await probe('理想气体：1 mol 在 300K、100kPa 的体积', {
  expression: 'n*R*T/P',
  variables: { n: 1, R: 8.314462618, T: 300, P: 100000 },
})
await probe('阻力下落的微分方程（应无法求解）', {
  expression: 'dv/dt = g - k*v',
  operation: 'solve',
})

// ── 经济 ──
await probe('列昂惕夫逆矩阵：两部门投入产出', {
  expression: 'inv([[0.8,-0.2],[-0.3,0.9]])',
})
await probe('复利：年化 7%，30 年后的 1000 金', {
  expression: '1000 * (1 + 0.07)^30',
})
await probe('边际成本：总成本 C(q)=0.5q^2+20q 的边际函数', {
  expression: '0.5*q^2 + 20*q',
  operation: 'derivative',
  variable: 'q',
})
await probe('供需均衡（非线性联立，应无法求解）', {
  expression: 'q = 100 - 2p, q = 10 + 3p',
  operation: 'solve',
})
await probe('柯布-道格拉斯规模报酬', {
  expression: 'A * K^a * L^(1-a)',
  variables: { A: 1.5, K: 100, L: 50, a: 0.3 },
})

// ── 社科 / 复杂网络 ──
await probe('马尔可夫链稳态：转移矩阵特征值', {
  expression: '[[0.9,0.1],[0.2,0.8]]',
  operation: 'eigen',
})
await probe('基尼系数（自算需要分组数据，先看能否求分位数）', {
  operation: 'stats',
  data: [5, 10, 20, 40, 80, 160],
})
await probe('洛伦兹曲线面积积分', {
  expression: 'x^2',
  operation: 'integral',
})
await probe('博弈论 2x2 混合策略纳什均衡', {
  expression: 'p = 1/3',
  operation: 'solve',
})
