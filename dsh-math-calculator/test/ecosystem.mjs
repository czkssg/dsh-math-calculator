/**
 * 目录3.2 生态热力学金字塔测试（重写版）。
 *
 * 关键回归：地球标定必须落在 0.5—1.5 倍之间。
 * 旧版用叶片峰值效率 1.5%，算出 3400 亿（高 42 倍）——已修正。
 */
import {
  computeEcosystem, ecosystemFromWorld, judgeOverload, trophicLevels,
  renderEcosystem, ECO_CONSTANTS,
} from '../lib/ecosystem.js'
import { mergePlaybookConfig } from '../lib/playbook.js'
import { opWorld } from '../lib/ops/world-op.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

console.log('-- 1. 标定常量 --')
{
  assert('地球 NPP 1.05e14', ECO_CONSTANTS.earthNPP === 1.05e14,
    ECO_CONSTANTS.earthNPP.toExponential(2))
  assert('地球吸收能量 3.8e24', ECO_CONSTANTS.earthAbsorbedJ === 3.8e24)
  assert('含碳率 45%', Math.abs(ECO_CONSTANTS.carbonFraction - 0.45) < 0.01)
  assert('热值 1.8e7', ECO_CONSTANTS.biomassEnergyDensity === 1.8e7)
  assert('10% 传递效率', ECO_CONSTANTS.trophicEfficiency === 0.1)
  assert('现实折扣 0.58', Math.abs(ECO_CONSTANTS.realWorldDiscount - 0.58) < 0.01)
}

console.log('-- 2. 地球标定（关键回归）--')
{
  const eco = computeEcosystem(ECO_CONSTANTS.earthAbsorbedJ)
  // NPP 必须精确等于地球实测值
  assert('NPP 精确等于 1.05e14', Math.abs(eco.netPrimaryProduction / 1.05e14 - 1) < 1e-9,
    eco.netPrimaryProduction.toExponential(3))
  // 承载力应在 0.5—1.5 倍地球人口之间（旧版高 42 倍）
  const ratio = eco.carryingCapacity / 8e9
  assert('承载力在地球实际 0.5—1.5 倍内', ratio > 0.5 && ratio < 1.5, ratio.toFixed(2) + ' 倍')
  assert('不再是 3400 亿那种数量级', eco.carryingCapacity < 1e11,
    (eco.carryingCapacity / 1e8).toFixed(1) + ' 亿')
  assert('理论值高于现实值', eco.theoreticalCapacity > eco.carryingCapacity)
}

console.log('-- 3. 10% 定律 --')
{
  const levels = trophicLevels(4)
  assert('四级营养', levels.length === 4)
  assert('生产者 100%', levels[0].fraction === 1)
  assert('初级 10%', Math.abs(levels[1].fraction - 0.1) < 1e-9)
  assert('次级 1%', Math.abs(levels[2].fraction - 0.01) < 1e-9)
  assert('三级 0.1%', Math.abs(levels[3].fraction - 0.001) < 1e-9)
}

console.log('-- 4. 肉食比例影响 --')
{
  const plant = computeEcosystem(ECO_CONSTANTS.earthAbsorbedJ, { meatFraction: 0 })
  const meat = computeEcosystem(ECO_CONSTANTS.earthAbsorbedJ, { meatFraction: 1 })
  assert('全素高于全肉', plant.carryingCapacity > meat.carryingCapacity)
  assert('接近 10 倍差',
    Math.abs(plant.carryingCapacity / meat.carryingCapacity - 10) < 1,
    (plant.carryingCapacity / meat.carryingCapacity).toFixed(1))
}

console.log('-- 5. 亮星承载更多 --')
{
  const dim = computeEcosystem(ECO_CONSTANTS.earthAbsorbedJ * 0.5)
  const bright = computeEcosystem(ECO_CONSTANTS.earthAbsorbedJ * 2)
  assert('能量翻倍承载力翻倍',
    Math.abs(bright.carryingCapacity / dim.carryingCapacity - 4) < 0.1,
    (bright.carryingCapacity / dim.carryingCapacity).toFixed(2))
}

console.log('-- 6. 远轨道世界承载力更低（字段名回归）--')
{
  const near = ecosystemFromWorld(opWorld({ world: { orbitAU: 0.7 } }, 32).value)
  const far = ecosystemFromWorld(opWorld({ world: { orbitAU: 2 } }, 32).value)
  assert('远轨道更低', far.carryingCapacity < near.carryingCapacity,
    (far.carryingCapacity / 1e8).toFixed(1) + ' < ' + (near.carryingCapacity / 1e8).toFixed(1))
  assert('差距明显', near.carryingCapacity / far.carryingCapacity > 3,
    (near.carryingCapacity / far.carryingCapacity).toFixed(1) + ' 倍')
}

console.log('-- 7. 世界参数实证 --')
{
  const earth = ecosystemFromWorld(opWorld({ world: {} }, 32).value)
  assert('地球判为充足', earth.verdict === 'ample', earth.verdict)
  const ratio = earth.carryingCapacity / 8e9
  assert('地球承载力合理', ratio > 0.5 && ratio < 1.5, ratio.toFixed(2) + ' 倍')
}

console.log('-- 8. 过载判定 --')
{
  const ok = judgeOverload(8e9, 6e9)
  assert('未过载判可持续', ok.overloaded === false, ok.verdict)
  const over = judgeOverload(8e9, 4e10)
  assert('远超判过载', over.overloaded === true, over.verdict)
  assert('给 3 个应对方案', over.options.length >= 3, String(over.options.length))
  assert('含「崩溃也可以是设定」',
    over.options.some((o) => o.includes('崩溃')), over.options.join('|').slice(0, 60))
}

console.log('-- 9. 渲染 --')
{
  const text = renderEcosystem(computeEcosystem(ECO_CONSTANTS.earthAbsorbedJ))
  assert('含能量流', text.includes('能量流'))
  assert('含承载力', text.includes('承载力'))
  assert('含营养级', text.includes('营养级'))
  assert('用亿作单位', text.includes('亿'))
}

console.log('-- 10. playbook 可配置化 --')
{
  const merged = mergePlaybookConfig({})
  assert('默认 11 步', merged.workflow.length === 11, String(merged.workflow.length))
  assert('默认 12 能力', merged.capabilities.length === 12, String(merged.capabilities.length))
  const custom = mergePlaybookConfig({
    extraNarrative: ['要有龙'],
    disabledCapabilities: ['world'],
  })
  assert('追加叙事选择', custom.narrative.includes('要有龙'))
  assert('关闭能力生效', custom.capabilities.length === 11, String(custom.capabilities.length))
  const wf = mergePlaybookConfig({ customWorkflow: [{ step: 'x', do: 'y', skip: 'z' }] })
  assert('工作流整批替换', wf.workflow.length === 1)
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
