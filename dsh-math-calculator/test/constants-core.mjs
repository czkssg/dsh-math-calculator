/**
 * 无量纲常数 → 尺度阶梯 测试。
 *
 * 两条最重要的断言：
 *   1. 现实常数下必须复现地球值（回归锚）；
 *   2. **只改光速而保持 α 不变时，物理完全不变**——这是整个模块存在的理由。
 */
import {
  OUR_KNOBS,
  OUR_UNIVERSE,
  dimensionlessFromKnobs,
  classifyKnobs,
  deriveScaleLadder,
  analyzeConstantChange,
  contradictionsOf,
  describeUniverse,
} from '../lib/constants-core.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass++
    console.log('  ok   ' + name + (detail ? ': ' + detail : ''))
  } else {
    fails.push({ name, detail })
    console.log('  FAIL ' + name + '\n         ' + (detail ?? ''))
  }
}

console.log('-- 1. 现实常数必须复现地球（回归锚）--')
{
  const ds = dimensionlessFromKnobs(OUR_KNOBS)
  assert('α ≈ 1/137.036', Math.abs(ds.alpha - 1 / 137.036) < 1e-7, ds.alpha.toExponential(6))
  assert('μ = mₚ/mₑ ≈ 1836.15', Math.abs(ds.mu - 1836.15) < 0.1, ds.mu.toFixed(2))
  assert('α_G ≈ 5.9e-39', Math.abs(ds.alphaG / 5.9e-39 - 1) < 0.05, ds.alphaG.toExponential(2))

  const ladder = deriveScaleLadder(OUR_UNIVERSE)
  const byId = Object.fromEntries(ladder.map((x) => [x.id, x]))
  assert('玻尔半径 ≈ 5.29e-11 m', Math.abs(byId['bohr-radius'].value / 5.29177e-11 - 1) < 1e-3, byId['bohr-radius'].value.toExponential(3))
  assert('里德伯能量 ≈ 13.6 eV', Math.abs(byId['rydberg-energy'].value - 13.606) < 0.05, byId['rydberg-energy'].value.toFixed(2))
  assert('键能量级 ≈ 6.8 eV', Math.abs(byId['bond-energy'].value - 6.803) < 0.05, byId['bond-energy'].value.toFixed(2))
  assert('材料强度标定为 1.3e8 Pa', Math.abs(byId['material-strength'].value - 1.3e8) < 1, byId['material-strength'].value.toExponential(2))
  assert('山峰尺度 ≈ 4.9 km', Math.abs(byId['mountain-scale'].value - 4909) < 60, byId['mountain-scale'].value.toFixed(0))
}

console.log('-- 2. 每条结论都带置信度与适用域 --')
{
  const ladder = deriveScaleLadder(OUR_UNIVERSE)
  assert('全部条目都有 confidence', ladder.every((x) => ['exact', 'scaling', 'order-of-magnitude'].includes(x.confidence)))
  assert('全部条目都有适用域', ladder.every((x) => typeof x.domain === 'string' && x.domain.length > 3))
  assert('全部条目都有公式出处', ladder.every((x) => typeof x.formula === 'string' && x.formula.length > 3))
  assert('至少有一条 exact', ladder.some((x) => x.confidence === 'exact'))
  assert('至少有一条 order-of-magnitude', ladder.some((x) => x.confidence === 'order-of-magnitude'))
}

console.log('-- 3. α 变化时各尺度按正确幂律移动 --')
{
  const stronger = { ...OUR_UNIVERSE, alpha: OUR_UNIVERSE.alpha * 1.1 }
  const base = deriveScaleLadder(OUR_UNIVERSE)
  const moved = deriveScaleLadder(stronger)
  const pick = (list, id) => list.find((x) => x.id === id).value

  assert('α×1.1 → 原子半径 ÷1.1', Math.abs(pick(moved, 'bohr-radius') / pick(base, 'bohr-radius') - 1 / 1.1) < 1e-9)
  assert('α×1.1 → 里德伯能量 ×1.21', Math.abs(pick(moved, 'rydberg-energy') / pick(base, 'rydberg-energy') - 1.21) < 1e-9)
  assert('α×1.1 → 键能 ×1.21', Math.abs(pick(moved, 'bond-energy') / pick(base, 'bond-energy') - 1.21) < 1e-9)
  assert('α×1.1 → 材料强度 ×1.61051', Math.abs(pick(moved, 'material-strength') / pick(base, 'material-strength') - 1.1 ** 5) < 1e-9)
}

console.log('-- 4. 换单位 vs 换物理（本模块的核心判据）--')
{
  const twiceC = analyzeConstantChange(OUR_KNOBS, { ...OUR_KNOBS, c: OUR_KNOBS.c * 2 })
  assert('只把 c 翻倍 → 判定为换了物理', twiceC.verdict === 'physical', twiceC.verdict)
  assert('只把 c 翻倍 → α 减半', Math.abs(twiceC.alphaRatio - 0.5) < 1e-9, twiceC.alphaRatio.toFixed(4))
  assert('只把 c 翻倍 → 原子尺度翻倍', Math.abs(twiceC.atomicSizeRatio - 2) < 1e-9, twiceC.atomicSizeRatio.toFixed(3))
  assert('结论里点明"不是换单位"', twiceC.note.includes('不是换单位'), twiceC.note.slice(0, 30))

  // 同时把 ħ 减半 → α 不变 → 纯换单位
  const unitOnly = analyzeConstantChange(OUR_KNOBS, { ...OUR_KNOBS, c: OUR_KNOBS.c * 2, hbar: OUR_KNOBS.hbar / 2 })
  assert('c×2 且 ħ÷2（保持 α）→ 判定为换单位', unitOnly.verdict === 'unit-only', unitOnly.verdict)
  assert('换单位时 α 不变', Math.abs(unitOnly.alphaRatio - 1) < 1e-9)
  assert('换单位时原子尺度不变', Math.abs(unitOnly.atomicSizeRatio - 1) < 1e-9)

  const heavierProton = analyzeConstantChange(OUR_KNOBS, { ...OUR_KNOBS, mp: OUR_KNOBS.mp * 2 })
  assert('质子质量翻倍 → 判定为换了物理', heavierProton.verdict === 'physical')
  assert('质子质量翻倍 → μ 翻倍', Math.abs(heavierProton.muRatio - 2) < 1e-9, heavierProton.muRatio.toFixed(2))
}

console.log('-- 5. 矛盾提示（不拒绝，只标注）--')
{
  assert('现实常数下无矛盾提示', contradictionsOf(OUR_UNIVERSE).length === 0)
  const weird = { ...OUR_UNIVERSE, alpha: OUR_UNIVERSE.alpha * 1.5 }
  const flags = contradictionsOf(weird)
  assert('α 偏 50% 会给出矛盾提示', flags.length > 0, String(flags.length))
  assert('提示里点名 α', flags[0].includes('α'), flags[0].slice(0, 30))
  assert('提示里给出原子尺度倍数', flags[0].includes('倍'), flags[0].slice(0, 50))

  const heavy = contradictionsOf({ ...OUR_UNIVERSE, mu: 2500 })
  assert('μ 偏离会提示化学需重估', heavy.some((x) => x.includes('化学')), heavy.join(' | ').slice(0, 60))
}

console.log('-- 6. 常数分类 --')
{
  const classes = classifyKnobs()
  assert('分类条目覆盖 20 个旋钮', classes.length >= 18, String(classes.length))
  assert('c 被标为有量纲', classes.find((x) => x.name === 'c').kind === 'dimensionful')
  assert('alpha_fs 被标为无量纲（真正物理）', classes.find((x) => x.name === 'alpha_fs').kind === 'dimensionless')
  assert('hbar 被标为派生', classes.find((x) => x.name === 'hbar').kind === 'derived')
  assert('天文单位单独一类', classes.some((x) => x.kind === 'astronomical-unit'))
  assert('每条都有影响说明', classes.every((x) => x.effect.length > 5))
}

console.log('-- 7. 一句话宇宙描述 --')
{
  const text = describeUniverse(OUR_UNIVERSE)
  assert('描述含原子半径', text.includes('原子半径'), text.slice(0, 40))
  assert('描述含材料强度', text.includes('材料强度'))
  assert('描述含化学窗口', text.includes('化学窗口'))
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
