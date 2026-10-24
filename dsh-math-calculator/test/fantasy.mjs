/**
 * 幻想层测试：叠加式判定 + 代价核算 + 真实感校验。
 */
import {
  overlay, computeCost, validateFantasy, renderFantasy,
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

console.log('-- 1. 叠加式（不是覆盖）--')
{
  const r = overlay(100, mage, 5000)
  assert('物理部分保留', r.physical === 100, String(r.physical))
  assert('幻想部分是补足量', r.fantasy === 4900, String(r.fantasy))
  assert('合计等于需求', r.total === 5000, String(r.total))
  assert('合计 = 物理 + 幻想', r.total === r.physical + r.fantasy)
  // 对比：若是覆盖式，physical 会被丢弃，total 只有 4900
  assert('不是覆盖式（total > 幻想单独）', r.total > r.fantasy, r.total + ' > ' + r.fantasy)
}

console.log('-- 2. 效率语义 --')
{
  const efficient = { ...mage, efficiency: 0.1 }
  const r1 = overlay(0, mage, 1000)
  const r2 = overlay(0, efficient, 1000)
  assert('效率越低，成本越高', r2.cost > r1.cost, r2.cost + ' > ' + r1.cost)
  assert('效率 0.5 的成本是需求 2 倍', Math.abs(r1.cost - 2000) < 1e-6, String(r1.cost))
}

console.log('-- 3. 永动机检测 --')
{
  const cheat = { ...mage, efficiency: 3, source: 'metabolism' }
  const r = overlay(0, cheat, 1000)
  assert('效率>1 且非外部来源 → 禁止', r.verdict === 'forbidden', r.verdict)
  assert('给出明确原因', r.notes.some((n) => n.includes('凭空产生能量')), r.notes.join('|'))

  const divine = { ...cheat, source: 'external' }
  const r2 = overlay(0, divine, 1000)
  assert('声明外部来源后放行', r2.verdict === 'allowed', r2.verdict)
}

console.log('-- 4. 超预算检测 --')
{
  const weak = { ...mage, powerLimit: 100 }
  const r = overlay(0, weak, 10000)
  assert('超预算 → 边缘', r.verdict === 'marginal', r.verdict)
  assert('标出超出倍数', r.notes.some((n) => n.includes('超出')), r.notes.join('|'))
}

console.log('-- 5. 代价核算（幻想带真实的核心）--')
{
  const cost = computeCost(5000, 1.8)
  assert('等价人力 = 功率/100W', Math.abs(cost.humanEquivalent - 50) < 0.01, String(cost.humanEquivalent))
  assert('等价食物可算', cost.sugarKg > 0, cost.sugarKg.toExponential(2))
  assert('散热需求 = 功率/100W每平米', Math.abs(cost.coolingAreaM2 - 50) < 0.01, String(cost.coolingAreaM2))
  assert('散热不足时体温上升', cost.temperatureRiseK > 0, cost.temperatureRiseK.toFixed(1))
  assert('指出会烧起来', cost.notes.some((n) => n.includes('体温')), cost.notes.join('|'))

  // 小功率不该报散热问题
  const small = computeCost(50, 1.8)
  assert('50W 不需要额外散热', small.coolingAreaM2 < 1.8, String(small.coolingAreaM2))
}

console.log('-- 6. 真实感校验 --')
{
  assert('完整定义通过', validateFantasy(mage).length === 0, validateFantasy(mage).join(';'))
  assert('无代价被拒',
    validateFantasy({ ...mage, costPerUnit: 0 }).some((p) => p.includes('不付代价')))
  assert('无上限被拒',
    validateFantasy({ ...mage, powerLimit: 0 }).some((p) => p.includes('上限')))
  assert('效率>1 非外部被拒',
    validateFantasy({ ...mage, efficiency: 3 }).some((p) => p.includes('永动机') || p.includes('external')))
  assert('缺含义被拒',
    validateFantasy({ ...mage, meaning: '' }).some((p) => p.includes('meaning')))
}

console.log('-- 7. 常数语义 --')
{
  assert('人力基准 100W', HUMAN_POWER_W === 100)
  assert('糖能量密度正确', SUGAR_ENERGY_J_PER_KG === 1.6e7)
  assert('散热基准 100W/m²', COOLING_W_PER_M2 === 100)
  assert('四种来源都有中文名', Object.keys(SOURCE_LABEL).length === 4)
}

console.log('-- 8. 渲染 --')
{
  const text = renderFantasy(mage, 5000, 100)
  assert('含叠加结果', text.includes('叠加结果'))
  assert('含代价核算', text.includes('代价核算'))
  assert('含判定', text.includes('判定'))
  assert('含等价人力', text.includes('等价人力'))
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
