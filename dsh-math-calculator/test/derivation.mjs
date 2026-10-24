/**
 * 推演栈框架测试。
 *
 * 覆盖规格要求的核心机制：分层、接口卡、无量纲化、单位重定义检测、
 * 敏感性、相图、检查表、七张表。
 */
import { opDerivation } from '../lib/ops/derivation-op.js'
import {
  STACK, INTERFACE_CARDS, judgeRange, detectUnitRedefinition,
  dimensionlessPack, sensitivity, phaseSlice, VERDICT_LABEL,
  CONSTRAINT_LABEL, PROJECT_TYPE_LABEL,
} from '../lib/derivation-stack.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

console.log('-- 1. 推演栈结构 --')
{
  assert('八层齐备', STACK.length === 8, String(STACK.length))
  const ids = STACK.map((l) => l.id).join(',')
  assert('层 id 顺序正确', ids === 'M0,P0,P1,P2,P3,P4,P5,P6', ids)
  assert('每层都有核心问题', STACK.every((l) => l.question.length > 5))
  assert('每层都有输入', STACK.every((l) => l.inputs.length > 0))
  assert('每层都有下游接口', STACK.every((l) => l.outputs.length > 0))
  assert('每层都有失败模式', STACK.every((l) => l.failureModes.length > 0))
  const p1 = STACK.find((l) => l.id === 'P1')
  assert('P1 接口 5—10 个', p1.outputs.length >= 5 && p1.outputs.length <= 10, String(p1.outputs.length))
}

console.log('-- 2. 接口卡 --')
{
  const layers = Object.keys(INTERFACE_CARDS)
  assert('至少覆盖 P1—P5', layers.length >= 4, layers.join(','))
  for (const [layer, cards] of Object.entries(INTERFACE_CARDS)) {
    assert(layer + ' 卡片数 ≤ 12', cards.length <= 12, String(cards.length))
    assert(layer + ' 每张卡字段齐全', cards.every((c) =>
      c.name && c.definition && c.unit && Array.isArray(c.dependsOn) &&
      c.range && c.kind && c.confidence && Array.isArray(c.sensitiveTo) &&
      Array.isArray(c.narrativeImpact)))
    assert(layer + ' 约束类型合法', cards.every((c) => ['hard','soft','narrative'].includes(c.kind)))
    assert(layer + ' 置信度合法', cards.every((c) => ['high','medium','low'].includes(c.confidence)))
  }
  // judgeRange
  const card = { range: { allowed: [1, 10], marginal: [0.5, 20] }, kind: 'hard', confidence: 'high',
    name: 't', definition: 'd', unit: 'u', dependsOn: [], sensitiveTo: [], narrativeImpact: [] }
  assert('judgeRange 允许区', judgeRange(5, card) === 'allowed')
  assert('judgeRange 边缘区', judgeRange(0.7, card) === 'marginal')
  assert('judgeRange 禁止区', judgeRange(100, card) === 'forbidden')
  assert('judgeRange 非数待定', judgeRange(NaN, card) === 'pending')
}

console.log('-- 3. 单位重定义检测 --')
{
  assert('单量纲缩放判为单位重定义',
    detectUnitRedefinition({ mass: 2 }).isUnitRedefinition === true)
  assert('全部同比例判为单位重定义',
    detectUnitRedefinition({ length: 2, mass: 2, time: 2 }).isUnitRedefinition === true)
  assert('多量纲不同比例判为真实变化',
    detectUnitRedefinition({ length: 2, mass: 3 }).isUnitRedefinition === false)
  assert('空变更不判为重定义',
    detectUnitRedefinition({}).isUnitRedefinition === false)
}

console.log('-- 4. 无量纲参数包 --')
{
  const packs = dimensionlessPack({})
  assert('四个无量纲量', packs.length === 4, String(packs.length))
  const names = packs.map((p) => p.name).join(',')
  assert('含规格点名的四个', names === 'alpha,mp/me,alphaG,gravity/em', names)
  const alpha = packs.find((p) => p.name === 'alpha')
  assert('alpha 现实值正确', Math.abs(alpha.current - 1/137.036) / (1/137.036) < 1e-3,
    String(alpha.current))
  const mpMe = packs.find((p) => p.name === 'mp/me')
  assert('mp/me 现实值正确', Math.abs(mpMe.current - 1836.15) < 1, String(mpMe.current))
  assert('现实参数下偏差≈0', packs.every((p) => Math.abs(p.deviation) < 1e-6))
}

console.log('-- 5. 敏感性分析 --')
{
  const linear = sensitivity((x) => x, 100)
  assert('线性模型不告警', linear.fineTuningWarning === false)
  const cubic = sensitivity((x) => Math.pow(x, 3), 100)
  assert('立方模型变化更大', cubic.items[0].relativeChange > linear.items[0].relativeChange,
    cubic.items[0].relativeChange.toFixed(4) + ' > ' + linear.items[0].relativeChange.toFixed(4))
  assert('敏感性有排序', cubic.ranking.length === 2)
}

console.log('-- 6. 相图切片 --')
{
  const slice = phaseSlice((g, s) => (g * s > 10 ? 'forbidden' : 'allowed'), [1, 5], [1, 5], 5)
  assert('网格尺寸正确', slice.grid.length === 5 && slice.grid[0].length === 5)
  assert('计数总和等于格子数', slice.counts.allowed + slice.counts.forbidden === 25,
    String(slice.counts.allowed + slice.counts.forbidden))
  assert('三种状态都有计数键', ['allowed','marginal','forbidden','pending','narrative']
    .every((k) => typeof slice.counts[k] === 'number'))
}

console.log('-- 7. 标签词典 --')
{
  assert('五种结论状态', Object.keys(VERDICT_LABEL).length === 5, Object.keys(VERDICT_LABEL).join(','))
  assert('三类约束', Object.keys(CONSTRAINT_LABEL).length === 3)
  assert('四种推演类型', Object.keys(PROJECT_TYPE_LABEL).length === 4)
}

console.log('-- 8. eight subcommands 都能跑 --')
{
  for (const sub of ['stack','cards','dimensionless','units','sensitivity','phase','checklist','tables']) {
    const out = opDerivation({ derivation: sub })
    assert('子命令 ' + sub + ' 有输出', typeof out.result === 'string' && out.result.length > 20,
      String(out.result && out.result.length))
  }
}
console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
