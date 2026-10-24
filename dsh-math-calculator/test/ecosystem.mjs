/**
 * 目录3.2 生态热力学金字塔 + playbook 可配置化测试。
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

console.log('-- 1. 常量合理 --')
{
  assert('10% 传递效率', ECO_CONSTANTS.trophicEfficiency === 0.1)
  assert('含碳率 45%', Math.abs(ECO_CONSTANTS.carbonFraction - 0.45) < 0.01)
  assert('干物质热值 1.8e7', ECO_CONSTANTS.biomassEnergyDensity === 1.8e7)
  assert('人均年能量约 3e9 J', ECO_CONSTANTS.perCapitaEnergyJ > 3e9 && ECO_CONSTANTS.perCapitaEnergyJ < 3.1e9,
    ECO_CONSTANTS.perCapitaEnergyJ.toExponential(2))
}

console.log('-- 2. 10% 定律 --')
{
  const levels = trophicLevels(4)
  assert('四级营养', levels.length === 4, String(levels.length))
  assert('生产者 100%', levels[0].fraction === 1)
  assert('初级消费者 10%', Math.abs(levels[1].fraction - 0.1) < 1e-9)
  assert('次级消费者 1%', Math.abs(levels[2].fraction - 0.01) < 1e-9)
  assert('三级消费者 0.1%', Math.abs(levels[3].fraction - 0.001) < 1e-9)
}

console.log('-- 3. 地球量级（关键回归）--')
{
  const earth = opWorld({ world: {} }, 32).value
  const eco = ecosystemFromWorld(earth)
  // 地球实际 NPP 约 1e14-1e15 kg C/yr
  assert('NPP 量级合理（1e14—1e16）',
    eco.netPrimaryProduction > 1e14 && eco.netPrimaryProduction < 1e16,
    eco.netPrimaryProduction.toExponential(2))
  // 承载力应在 1e10—1e12 之间（现实 8e9，考虑浪费后合理）
  assert('承载力量级合理（1e10—1e12）',
    eco.carryingCapacity > 1e10 && eco.carryingCapacity < 1e12,
    eco.carryingCapacity.toExponential(2))
  assert('判为充足', eco.verdict === 'ample', eco.verdict)
}

console.log('-- 4. 肉食比例影响 --')
{
  const earth = opWorld({ world: {} }, 32).value
  const plant = ecosystemFromWorld(earth, { meatFraction: 0 })
  const meat = ecosystemFromWorld(earth, { meatFraction: 1 })
  assert('全素食承载力更高', plant.carryingCapacity > meat.carryingCapacity,
    plant.carryingCapacity.toExponential(2) + ' > ' + meat.carryingCapacity.toExponential(2))
  assert('差距接近 10 倍',
    Math.abs(plant.carryingCapacity / meat.carryingCapacity - 10) < 2,
    (plant.carryingCapacity / meat.carryingCapacity).toFixed(1))
}

console.log('-- 5. 文明过载判定 --')
{
  const sustainable = judgeOverload(1e11, 8e9)
  assert('地球人口可持续', sustainable.overloaded === false, sustainable.verdict)
  assert('给出占用比例', sustainable.note.includes('占用的'), sustainable.note)

  const critical = judgeOverload(1e10, 1.05e10)
  assert('略超判为临界', critical.verdict === '临界', critical.verdict)

  const over = judgeOverload(1e10, 5e10)
  assert('远超判为过载', over.overloaded === true, over.verdict)
  assert('给出 3 个以上应对方案', over.options.length >= 3, String(over.options.length))
  assert('提到生态已崩溃也是一种设定',
    over.options.some((o) => o.includes('崩溃')), over.options.join('|').slice(0, 80))
}

console.log('-- 6. 远轨道世界承载力更低 --')
{
  const near = ecosystemFromWorld(opWorld({ world: { orbitAU: 0.7 } }, 32).value)
  const far = ecosystemFromWorld(opWorld({ world: { orbitAU: 2 } }, 32).value)
  assert('远轨道承载力更低', far.carryingCapacity < near.carryingCapacity,
    far.carryingCapacity.toExponential(1) + ' < ' + near.carryingCapacity.toExponential(1))
}

console.log('-- 7. 渲染 --')
{
  const eco = ecosystemFromWorld(opWorld({ world: {} }, 32).value)
  const text = renderEcosystem(eco)
  assert('含能量流', text.includes('能量流'))
  assert('含营养级', text.includes('营养级'))
  assert('含判定', text.includes('判定'))
}

console.log('-- 8. playbook 可配置化 --')
{
  const merged = mergePlaybookConfig({})
  assert('默认有硬约束', merged.hard.length > 0, String(merged.hard.length))
  assert('默认 11 步工作流', merged.workflow.length === 11, String(merged.workflow.length))
  assert('默认 12 项能力', merged.capabilities.length === 12, String(merged.capabilities.length))

  const custom = mergePlaybookConfig({
    extraHardConstraints: ['我的自定义硬约束'],
    extraNarrative: ['要有龙'],
    disabledCapabilities: ['world'],
  })
  assert('追加自定义硬约束', custom.hard.includes('我的自定义硬约束'))
  assert('追加自定义叙事', custom.narrative.includes('要有龙'))
  assert('关闭能力生效', custom.capabilities.length === 11, String(custom.capabilities.length))
  assert('关闭后不含 world', !custom.capabilities.some((c) => c.call === 'world'))

  const customWorkflow = mergePlaybookConfig({
    customWorkflow: [{ step: '1 只做一件事', do: '算', skip: '从不跳过' }],
  })
  assert('自定义工作流整批替换', customWorkflow.workflow.length === 1,
    String(customWorkflow.workflow.length))
  assert('替换后内容正确', customWorkflow.workflow[0].step === '1 只做一件事')

  const withDuty = mergePlaybookConfig({
    extraDuties: [{ duty: '我的职责', why: '因为', good: '好' }],
  })
  assert('追加 AI 职责', withDuty.duties.length > 6, String(withDuty.duties.length))
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
