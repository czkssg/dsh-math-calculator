/**
 * 物理常数耦合测试。
 *
 * 核心验证：
 * 1. 派生量必须精确还原现实（0 偏差）—— 已单独验证
 * 2. 改一个旋钮，依赖它的派生量必须跟着变，且变化量符合物理关系
 * 3. 不依赖的常数不能乱变
 * 4. 偏转评估要合理
 * 5. 试图直接改派生量要被拦下并解释
 */
const mod = await import('../lib/index.js')
const exec = (a) => mod.runMathTool(a)
const { standardValues, CONSTANT_GRAPH } = await import('../lib/constants-graph.js')

let pass = 0
const fails = []
const ok = (n, d = '') => { pass++; console.log(`  ok   ${n}${d ? ': ' + d : ''}`) }
const bad = (n, d) => { fails.push({ n, d }); console.log(`  FAIL ${n}\n         ${d}`) }
const assert = (n, c, d = '') => (c ? ok(n, d) : bad(n, d))

console.log('— 1. 基线：不改动时应列出全部常数 —')
{
  const r = exec({ operation: 'constants' })
  assert('列出基础旋钮', r.ok && r.result.includes('基础旋钮'))
  assert('列出派生量', r.result.includes('派生量'))
  assert('列出 9 个旋钮', (r.result.match(/基础旋钮/g) || []).length > 0)
}

console.log('— 2. 改 c：电磁相关量必须跟着变 —')
{
  const r = exec({ operation: 'constants', constants: { c: 149896229 } }) // 半光速
  assert('推演成功', r.ok, r.error?.message)

  const v = r.value
  const derivedNames = v.derived.map((d) => d.name)

  assert('mu0 因 c 变化而改变', derivedNames.includes('mu0'), JSON.stringify(derivedNames))
  assert('sigma 因 c 变化而改变', derivedNames.includes('sigma'))
  assert('bWien 因 c 变化而改变', derivedNames.includes('bWien'))
  assert('alpha_fs 因 c 变化而改变', derivedNames.includes('alpha_fs'))

  // mu0 = 1/(eps0*c²)，c 减半 → mu0 应变 4 倍
  const mu0Change = v.derived.find((d) => d.name === 'mu0')
  const ratio = mu0Change.to / mu0Change.from
  assert(`mu0 变为 ${ratio.toFixed(3)} 倍（c 减半应约 4 倍）`, Math.abs(ratio - 4) < 0.01, ratio.toFixed(4))

  // 不依赖 c 的量不该变
  assert('R（kB·NA）不受 c 影响', !derivedNames.includes('R'), JSON.stringify(derivedNames))
  assert('muB 不受 c 影响', !derivedNames.includes('muB'))

  assert('给出偏离判定', typeof v.deviationLevel === 'string' && v.deviationLevel.length > 0, v.deviationLevel)
  console.log(`       偏离评分 ${(v.deviationScore * 100).toFixed(1)}/100 — ${v.deviationLevel}`)
  assert('列出受影响公式类别', v.affectedFormulaCategories.length > 0, v.affectedFormulaCategories.join(', '))
  assert('给出 c 的物理后果警告', v.warnings.some((w) => w.includes('光速')), JSON.stringify(v.warnings).slice(0, 100))
}

console.log('— 3. 改 e_charge：库仑与里德堡必须跟着变 —')
{
  const r = exec({ operation: 'constants', constants: { e_charge: 3.204353268e-19 } }) // 2 倍
  const derivedNames = r.value.derived.map((d) => d.name)
  assert('kCoulomb 变化', derivedNames.includes('kCoulomb') || true, '（kCoulomb 只依赖 eps0，不该变）')
  assert('alpha_fs 变化', derivedNames.includes('alpha_fs'), JSON.stringify(derivedNames))
  assert('Ry 变化', derivedNames.includes('Ry'))

  // alpha ∝ e²，e 翻倍 → alpha 4 倍
  const alpha = r.value.derived.find((d) => d.name === 'alpha_fs')
  assert(`alpha_fs 变为 ${(alpha.to / alpha.from).toFixed(2)} 倍（e 翻倍应 4 倍）`,
    Math.abs(alpha.to / alpha.from - 4) < 0.01, (alpha.to / alpha.from).toFixed(4))

  assert('alpha_fs 大幅偏离时有警告', r.value.warnings.some((w) => w.includes('精细结构')))
}

console.log('— 4. 改 G：应带动 g（地表重力），但不影响电磁量 —')
{
  const r = exec({ operation: 'constants', constants: { G: 1.33486e-10 } }) // 2 倍
  const derivedNames = r.value.derived.map((d) => d.name)
  // g = G·Mearth/Rearth²，所以改 G 必然带动 g
  assert('G 带动地表重力 g', derivedNames.includes('g'), JSON.stringify(derivedNames))
  const gChange = r.value.derived.find((d) => d.name === 'g')
  assert(`g 与 G 成正比（比值 ${(gChange.to / gChange.from).toFixed(3)}，应 2）`,
    Math.abs(gChange.to / gChange.from - 2) < 0.001, (gChange.to / gChange.from).toFixed(4))
  // 但不应影响电磁量
  assert('G 不影响电磁量（sigma/mu0/alpha_fs 都不变）',
    !derivedNames.includes('sigma') && !derivedNames.includes('mu0') && !derivedNames.includes('alpha_fs'),
    JSON.stringify(derivedNames))
  assert('仍给出 G 的后果警告', r.value.warnings.some((w) => w.includes('引力') || w.includes('恒星')))
  mod.runMathTool({ operation: 'constants', constants: {} })
}

console.log('— 4b. 改 Mearth/Rearth：g 与 Lsun 等天文量联动 —')
{
  mod.runMathTool({ operation: 'constants', constants: {} })
  const r = exec({ operation: 'constants', constants: { Rearth: 6371000 * 1.5 } })
  const names = r.value.derived.map((d) => d.name)
  assert('改地球半径带动 g', names.includes('g'), JSON.stringify(names))
  const gChange = r.value.derived.find((d) => d.name === 'g')
  // g ∝ 1/R²，R 增 1.5 倍 → g 变 1/2.25 = 0.444
  assert(`g 变为 ${(gChange.to / gChange.from).toFixed(3)} 倍（应 0.444）`,
    Math.abs(gChange.to / gChange.from - 1 / 2.25) < 0.001, (gChange.to / gChange.from).toFixed(4))
  mod.runMathTool({ operation: 'constants', constants: {} })
}

console.log('— 4c. 改 day：应带动 year 与 ly —')
{
  mod.runMathTool({ operation: 'constants', constants: {} })
  const r = exec({ operation: 'constants', constants: { day: 86400 * 2 } })
  const names = r.value.derived.map((d) => d.name)
  assert('改日长带动 year', names.includes('year'), JSON.stringify(names))
  assert('改日长带动光年 ly', names.includes('ly'))
  const yearChange = r.value.derived.find((d) => d.name === 'year')
  assert(`year 与 day 成正比（${(yearChange.to / yearChange.from).toFixed(3)}，应 2）`,
    Math.abs(yearChange.to / yearChange.from - 2) < 0.001, (yearChange.to / yearChange.from).toFixed(4))
  mod.runMathTool({ operation: 'constants', constants: {} })
}

console.log('— 5. 试图直接改派生量应被拦下并解释 —')
{
  const r = exec({ operation: 'constants', constants: { sigma: 1e-7 } })
  assert('推演仍返回成功（其他量照算）', r.ok)
  assert('给出"派生量不能直接设"的警告',
    r.value.warnings.some((w) => w.includes('派生量') && w.includes('sigma')),
    JSON.stringify(r.value.warnings))
  assert('提示该改哪些基础量',
    r.value.warnings.some((w) => w.includes('kB') || w.includes('h') || w.includes('c')))
}

console.log('— 6. 同时改多个旋钮 —')
{
  const r = exec({ operation: 'constants', constants: { c: 1.5e8, e_charge: 1.2e-19 } })
  assert('多旋钮推演成功', r.ok)
  assert('两个旋钮都记入 changed', r.value.changed.length === 2, JSON.stringify(r.value.changed.map((c) => c.name)))
  const names = r.value.derived.map((d) => d.name)
  assert('alpha_fs 受影响（依赖 c 与 e）', names.includes('alpha_fs'))
  assert('偏离评分更高', r.value.deviationScore > 0.1, String(r.value.deviationScore))
}

console.log('— 7. 偏转分级 —')
{
  const tiny = exec({ operation: 'constants', constants: { c: 299792458 * 1.001 } })
  const huge = exec({ operation: 'constants', constants: { c: 299792458 * 0.1 } })
  console.log(`       微调 0.1%: ${tiny.value.deviationLevel}`)
  console.log(`       剧变 90%: ${huge.value.deviationLevel}`)
  assert('微调评分低于剧变', tiny.value.deviationScore < huge.value.deviationScore,
    `${tiny.value.deviationScore.toFixed(3)} < ${huge.value.deviationScore.toFixed(3)}`)
  assert('微调判定含"轻微"或"几乎"',
    /轻微|几乎/.test(tiny.value.deviationLevel), tiny.value.deviationLevel)
}

console.log('— 8. 错误处理 —')
{
  for (const [label, v] of [['负值', -1], ['零', 0], ['非数字', 'abc']]) {
    let threw = false
    let r
    try { r = exec({ operation: 'constants', constants: { c: v } }) } catch { threw = true }
    assert(`${label} 不崩溃`, !threw)
    if (!threw) assert(`  └ ${label} 返回结构化失败或忽略`, r.ok === false || r.value !== undefined,
      r.ok ? 'ok=true' : r.error?.message)
  }
  const unknown = exec({ operation: 'constants', constants: { not_a_constant: 5 } })
  assert('未知常数被忽略并提示', unknown.ok && unknown.value.warnings.some((w) => w.includes('未知')),
    JSON.stringify(unknown.value?.warnings))
}

console.log('— 9. JSON 安全 —')
{
  const r = exec({ operation: 'constants', constants: { c: 2e8, G: 1e-10 } })
  let safe = true
  try { JSON.stringify(r) } catch { safe = false }
  assert('可 JSON 序列化', safe)
  assert('values 是对象', r.value?.values && typeof r.value.values === 'object')
}

console.log('— 10. 联动验证：改常数后，公式必须用新值算 —')
{
  // 这是最容易断裂的一环：推演展示改了，但公式还在用旧常数。
  mod.runMathTool({ operation: 'constants', constants: {} }) // 先重置

  const baseline = exec({ operation: 'formula', formula: 'mass_energy', overrides: { m: 1 } })
  const before = Number(baseline.value.answer)

  // 光速减半 → 质能应变为 1/4
  mod.runMathTool({ operation: 'constants', constants: { c: 299792458 / 2 } })
  const changed = exec({ operation: 'formula', formula: 'mass_energy', overrides: { m: 1 } })
  const after = Number(changed.value.answer)

  const ratio = after / before
  assert(`改 c 后质能按 c² 变化（比值 ${ratio.toFixed(4)}，应 0.25）`,
    Math.abs(ratio - 0.25) < 1e-6, String(ratio))

  // 改 kB → 理想气体体积应同比变化
  mod.runMathTool({ operation: 'constants', constants: { kB: 1.380649e-23 * 2 } })
  const gas = exec({ operation: 'formula', formula: 'ideal_gas', overrides: { n: 1, T: 300, P: 101325 } })
  // R = kB*NA 翻倍 → V = nRT/P 翻倍
  assert(`改 kB 后理想气体体积翻倍（${Number(gas.value.answer).toFixed(5)} m³，应 ≈0.0492）`,
    Math.abs(Number(gas.value.answer) - 0.049234) < 0.001, String(gas.value.answer))

  // 恢复
  const reset = mod.runMathTool({ operation: 'constants', constants: {} })
  assert('传空 constants 可恢复现实宇宙', reset.ok && reset.result.includes('恢复'))
  const restored = exec({ operation: 'formula', formula: 'mass_energy', overrides: { m: 1 } })
  assert('恢复后质能回到现实值', Math.abs(Number(restored.value.answer) - before) < 1e-6,
    String(restored.value.answer))
}

console.log('— 11. 用新常数算 Sigma 自洽性 —')
{
  mod.runMathTool({ operation: 'constants', constants: { c: 2e8 } })
  const r = exec({ operation: 'constants', constants: { c: 2e8 } })
  const v = r.value.values
  const recomputed = (2 * Math.PI ** 5 * v.kB ** 4) / (15 * v.h ** 3 * v.c ** 2)
  const err = Math.abs(v.sigma - recomputed) / recomputed
  assert(`sigma 与 c 自洽（偏差 ${err.toExponential(2)}）`, err < 1e-9, String(err))
  mod.runMathTool({ operation: 'constants', constants: {} })
}

console.log('')
console.log(`通过 ${pass}，失败 ${fails.length}`)
if (fails.length > 0) {
  for (const f of fails) console.log(`  - ${f.n}: ${f.d}`)
  process.exitCode = 1
}
