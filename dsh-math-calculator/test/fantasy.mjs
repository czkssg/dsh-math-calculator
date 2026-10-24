/**
 * 幻想层测试：只算数字与提醒，不反驳设定。
 *
 * 用户定位（2026-10-25）：插件是给用户圆世界观的，不是去反驳的。
 * 所以这里重点验证：输出里没有「禁止/必须」这类硬性措辞，
 * 但数字（等价人力/散热/温升）仍然算得出来。
 */
import {
  overlay, computeCost, checkFields, renderFantasy,
  HUMAN_POWER_W, SUGAR_ENERGY_J_PER_KG, COOLING_W_PER_M2, SOURCE_LABEL,
} from '../lib/fantasy-layer.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

const mage = {
  name: 'psiOutput', label: '灵能输出', source: 'metabolism',
  efficiency: 0.5, costPerUnit: 1, powerLimit: 8000,
  boosts: '体力', meaning: '法师靠代谢转化灵能',
}

console.log('-- 1. 叠加式（不覆盖物理）--')
{
  const r = overlay(100, mage, 5000)
  assert('物理部分保留', r.physical === 100, String(r.physical))
  assert('幻想部分是补足量', r.fantasy === 4900, String(r.fantasy))
  assert('合计 = 物理 + 幻想', r.total === r.physical + r.fantasy, String(r.total))
  assert('不是覆盖式', r.total > r.fantasy, r.total + ' > ' + r.fantasy)
}

console.log('-- 2. 不反驳：没有 forbidden 这种判定 --')
{
  // 效率 3 倍、无代价、超预算——这三个原先都会被判禁止/拒绝
  const cheat = { ...mage, efficiency: 3 }
  const free = { ...mage, costPerUnit: 0 }
  const weak = { ...mage, powerLimit: 100 }
  for (const [name, ability] of [['效率3倍', cheat], ['无代价', free], ['超预算', weak]]) {
    const r = overlay(0, ability, 10000)
    assert(name + ' 仍能算出结果', Number.isFinite(r.total), String(r.total))
    assert(name + ' 不产生禁止结论', !('verdict' in r), Object.keys(r).join(','))
    assert(name + ' 只给提醒', r.hints.length > 0, String(r.hints.length))
  }
}

console.log('-- 3. 提醒措辞是「建议」而非「禁令」--')
{
  const free = { ...mage, costPerUnit: 0 }
  const text = renderFantasy(free, 1000, 100)
  assert('不含「禁止」', !text.includes('禁止'))
  assert('不含「必须」', !text.includes('必须'))
  assert('含「由你决定」', text.includes('由你决定'))
  assert('给出圆设定的方向', text.includes('想圆的话') || text.includes('也可以'), text.slice(0, 120))

  const cheat = { ...mage, efficiency: 3 }
  const text2 = renderFantasy(cheat, 10000, 100)
  assert('效率>1 也只提醒不禁止', !text2.includes('禁止'))
  assert('提示可以用来源解释', text2.includes('从哪来') || text2.includes('额外能量源'), text2.slice(0, 120))
}

console.log('-- 4. 现实量仍然算清（这是「结合幻想与真实」）--')
{
  const cost = computeCost(5000, 1.8)
  assert('等价人力 = 功率/100W', Math.abs(cost.humanEquivalent - 50) < 0.01, String(cost.humanEquivalent))
  assert('等价食物可算', cost.sugarKg > 0, cost.sugarKg.toExponential(2))
  assert('散热需求 = 功率/100W每平米', Math.abs(cost.coolingAreaM2 - 50) < 0.01, String(cost.coolingAreaM2))
  assert('标记散热不足', cost.coolingShort === true)
  assert('温升可算', cost.temperatureRiseK > 0, cost.temperatureRiseK.toFixed(1))
  assert('提醒里给出可用的圆法', cost.hints.some((h) => h.text.includes('散热手段')), cost.hints.map((h) => h.text).join('|'))

  const small = computeCost(50, 1.8)
  assert('50W 不报散热不足', small.coolingShort === false)
}

console.log('-- 5. 字段检查：只查能不能算 --')
{
  assert('完整定义能算', checkFields(mage).length === 0, checkFields(mage).join(';'))
  assert('缺 name 算不了', checkFields({ ...mage, name: '' }).some((p) => p.includes('name')))
  assert('效率<=0 算不了', checkFields({ ...mage, efficiency: 0 }).some((p) => p.includes('efficiency')))
  assert('无上限算不了', checkFields({ ...mage, powerLimit: 0 }).some((p) => p.includes('powerLimit')))
  // 这些设定本身合法，不该被 checkFields 拦
  assert('效率>1 不算字段错误', checkFields({ ...mage, efficiency: 3 }).length === 0)
  assert('无代价 不算字段错误', checkFields({ ...mage, costPerUnit: 0 }).length === 0)
}

console.log('-- 6. 常数语义 --')
{
  assert('人力基准 100W', HUMAN_POWER_W === 100)
  assert('糖能量密度', SUGAR_ENERGY_J_PER_KG === 1.6e7)
  assert('散热基准 100W/m²', COOLING_W_PER_M2 === 100)
  assert('四种来源都有中文名', Object.keys(SOURCE_LABEL).length === 4)
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
