/**
 * 长链后果测试。
 *
 * 关键验证：
 * 1. 现实基线必须零后果（不能无改动就报警）
 * 2. 后果的物理方向必须正确（G↑ → 恒星寿命↓ 等）
 * 3. 可信度标注必须诚实
 * 4. 数值不能荒谬（这就是抓出量纲 bug 的地方）
 */
const mod = await import('../lib/index.js')
const g = await import('../lib/constants-graph.js')
const { analyzeConsequences } = await import('../lib/consequences.js')

let pass = 0
const fails = []
const ok = (n, d = '') => { pass++; console.log(`  ok   ${n}${d ? ': ' + d : ''}`) }
const bad = (n, d) => { fails.push({ n, d }); console.log(`  FAIL ${n}\n         ${d}`) }
const assert = (n, c, d = '') => (c ? ok(n, d) : bad(n, d))

const run = (ov) => analyzeConsequences(g.recalculateConstants(ov).values)
const find = (list, name) => list.find((c) => c.name.includes(name))

console.log('— 1. 现实基线必须零后果 —')
{
  const base = analyzeConsequences(g.standardValues())
  assert('不改常数时无任何后果', base.length === 0, JSON.stringify(base.map((c) => c.name)))
}

console.log('— 2. G 变大 → 恒星寿命变短、光度变高 —')
{
  const list = run({ G: 6.6743e-11 * 2 })
  const life = find(list, '寿命')
  const lum = find(list, '光度')
  assert('有寿命后果', Boolean(life))
  assert('G↑ 生命变短', life && life.value < 10, life ? String(life.value.toFixed(2)) : '')
  assert('有光度后果', Boolean(lum))
  assert('G↑ 光度变高', lum && lum.value > 1, lum ? String(lum.value.toFixed(1)) : '')
  assert('寿命公式被标注为经验估算', life && life.confidence === 'empirical')
}

console.log('— 3. G 变小 → 恒星寿命变长 —')
{
  const list = run({ G: 6.6743e-11 * 0.5 })
  const life = find(list, '寿命')
  assert('G↓ 寿命变长', life && life.value > 10, life ? String(life.value.toFixed(1)) + ' Gyr' : '')
}

console.log('— 4. e_charge 变大 → 原子变小、化学键变强 —')
{
  const list = run({ e_charge: 1.602176634e-19 * 1.2 })
  const atom = find(list, '原子半径')
  const bond = find(list, '化学键')
  assert('有原子半径后果', Boolean(atom))
  assert('e↑ 原子半径变小', atom && atom.value < 1, atom ? atom.value.toFixed(2) : '')
  assert('e↑ 化学键变强', bond && bond.value > 1, bond ? bond.value.toFixed(2) : '')
  assert('原子半径标注为精确', atom && atom.confidence === 'exact')
}

console.log('— 5. alpha_fs 大幅偏离 → 碳无法合成 —')
{
  // e 翻倍 → alpha 变 4 倍，远超 4% 临界值
  const list = run({ e_charge: 1.602176634e-19 * 2 })
  const carbon = find(list, '碳')
  assert('有碳合成后果', Boolean(carbon))
  assert('碳合成警告为"大概率不存在"', carbon && carbon.description.includes('不存在'),
    carbon ? carbon.description.slice(0, 50) : '')
}

console.log('— 6. 数值必须合理（不能出现 1e13 这种荒谬值）—')
{
  for (const [label, ov] of [
    ['G×2', { G: 6.6743e-11 * 2 }],
    ['c×0.5', { c: 299792458 * 0.5 }],
    ['me×2', { me: 9.1093837015e-31 * 2 }],
    ['Rearth×1.5', { Rearth: 6371000 * 1.5 }],
  ]) {
    const list = run(ov)
    let allFinite = true
    let allReasonable = true
    for (const c of list) {
      if (!Number.isFinite(c.value) || !Number.isFinite(c.ratio)) allFinite = false
      // 比值不应超过 10 个数量级（那种通常是量纲错）
      if (Math.abs(Math.log10(Math.abs(c.value) || 1)) > 12) allReasonable = false
    }
    assert(`${label} 数值有限`, allFinite)
    assert(`${label} 数值量级合理`, allReasonable, JSON.stringify(list.map((c) => `${c.name}=${c.value.toExponential(2)}`)))
  }
}

console.log('— 7. 大气保留判据必须按气体成分区分 —')
{
  // Jeans 判据 v_esc > 6·v_thermal 是**对每种气体**的判据，不是对"大气整体"。
  // 地球：氮气比值约 22（保留）、氢气约 5.9（逃逸）。
  // 早先我用"地球约 6.5"是不对的，那是氢气的值。
  const v = g.standardValues()
  const R = v.kB * v.NA
  const vEsc = Math.sqrt((2 * v.G * v.Mearth) / v.Rearth)
  const nitrogenRatio = vEsc / Math.sqrt((3 * R * 288) / 0.028)
  const hydrogenRatio = vEsc / Math.sqrt((3 * R * 288) / 0.002)
  console.log(`       现实地球：氮 ${nitrogenRatio.toFixed(1)}（应保留，>6） | 氢 ${hydrogenRatio.toFixed(1)}（应逃逸，<6）`)
  assert('氮气比值 > 6（地球能保住氮气大气）', nitrogenRatio > 6, nitrogenRatio.toFixed(2))
  assert('氢气比值 < 6（地球确实在丢失氢气）', hydrogenRatio < 6, hydrogenRatio.toFixed(2))
  assert('氮气比值在 18~26 区间（真实地球约 22）',
    nitrogenRatio > 18 && nitrogenRatio < 26, nitrogenRatio.toFixed(2))
}

console.log('— 8. 人体尺度后果 —')
{
  const list = run({ G: 6.6743e-11 * 2 })
  const jump = find(list, '跳跃')
  const body = find(list, '体型')
  assert('有跳跃高度后果', Boolean(jump))
  assert('G↑ 跳跃高度降低', jump && jump.value < 1, jump ? jump.value.toFixed(2) : '')
  assert('有体型后果', Boolean(body))
  assert('G↑ 体型上限缩小', body && body.value < 1, body ? body.value.toFixed(2) : '')
}

console.log('— 9. 可信度标注诚实 —')
{
  const list = run({ G: 6.6743e-11 * 2, e_charge: 1.602176634e-19 * 1.05 })
  for (const c of list) {
    assert(`  ${c.name} 有可信度标注`, ['exact', 'empirical', 'qualitative'].includes(c.confidence), c.confidence)
    assert(`  ${c.name} 有说明`, typeof c.description === 'string' && c.description.length > 0)
    if (c.confidence === 'empirical') {
      assert(`  ${c.name} 经验估算有不确定性说明`, typeof c.note === 'string' && c.note.length > 0,
        c.note ? '有' : '缺')
    }
  }
}

console.log('— 10. 输出结构 —')
{
  const r = mod.runMathTool({ operation: 'constants', constants: { G: 6.6743e-11 * 1.5 } })
  assert('constants 返回 consequences', Array.isArray(r.value.consequences) && r.value.consequences.length > 0,
    String(r.value.consequences?.length))
  assert('结果文本含"长链后果"', r.result.includes('长链后果'))
  assert('结果文本含可信度说明', r.result.includes('可信度说明'))
  let safe = true
  try { JSON.stringify(r) } catch { safe = false }
  assert('可 JSON 序列化', safe)
  mod.runMathTool({ operation: 'constants', constants: {} })
}

console.log('')
console.log(`通过 ${pass}，失败 ${fails.length}`)
if (fails.length > 0) {
  for (const f of fails) console.log(`  - ${f.n}: ${f.d}`)
  process.exitCode = 1
}
