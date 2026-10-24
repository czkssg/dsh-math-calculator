/**
 * 补丁8 白皮书与 Prompt 投射测试。
 */
import { buildWhitepaper, renderWhitepaper, buildPromptCard, renderPromptCard } from '../lib/whitepaper.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

console.log('-- 1. 白皮书结构完整 --')
{
  const paper = buildWhitepaper({})
  assert('含物理底色', Boolean(paper.physical), Object.keys(paper).join(','))
  assert('含文明极限', Boolean(paper.civilization))
  assert('含时间尺度', Boolean(paper.timeline))
  assert('含状态判定', Boolean(paper.verdicts))

  assert('重力约 9.8', paper.physical.gravity > 9 && paper.physical.gravity < 10,
    paper.physical.gravity.toFixed(2))
  assert('一天约 24 小时', paper.physical.dayHours > 23 && paper.physical.dayHours < 25,
    paper.physical.dayHours.toFixed(1))
  assert('均温约 287 K', paper.physical.meanTempK > 280 && paper.physical.meanTempK < 295,
    paper.physical.meanTempK.toFixed(0))
  assert('恒星寿命约 10 Gyr', Math.abs(paper.physical.starLifetimeGyr - 10) < 1,
    paper.physical.starLifetimeGyr.toFixed(1))
}

console.log('-- 2. 文明极限三类齐全 --')
{
  const paper = buildWhitepaper({})
  assert('能量有内容', paper.civilization.energy.length > 0, String(paper.civilization.energy.length))
  assert('材料有内容', paper.civilization.material.length > 0, String(paper.civilization.material.length))
  assert('交通有内容', paper.civilization.transport.length > 0, String(paper.civilization.transport.length))
  assert('有生态承载力', paper.civilization.ecoCapacity.includes('亿'), paper.civilization.ecoCapacity)
  assert('有技术开放列表', paper.civilization.techOpen.length > 0,
    paper.civilization.techOpen.join(','))
  assert('地球的太空电梯被锁死', paper.civilization.techLocked.includes('太空电梯'),
    paper.civilization.techLocked.join(','))
}

console.log('-- 3. 高重力世界差异 --')
{
  const high = buildWhitepaper({ planetMass: 5, planetRadius: 1.8 })
  assert('重力更大', high.physical.gravityEarth > 1.4, high.physical.gravityEarth.toFixed(2))
  assert('化学火箭被锁死', high.civilization.techLocked.includes('化学火箭航天'),
    high.civilization.techLocked.join(','))
}

console.log('-- 4. 时间尺度 --')
{
  const paper = buildWhitepaper({})
  assert('有可居住年限', paper.timeline.habitableYears.includes('亿年'),
    paper.timeline.habitableYears)
  assert('有临界点列表', paper.timeline.critical.length >= 3, String(paper.timeline.critical.length))
  assert('临界点含名称', paper.timeline.critical.every((c) => c.name.length > 2))
}

console.log('-- 5. 渲染白皮书 --')
{
  const text = renderWhitepaper(buildWhitepaper({}))
  assert('是 Markdown', text.startsWith('# '), text.slice(0, 20))
  assert('含四大部分', ['物理底色', '文明极限', '时间尺度', '状态判定'].every((s) => text.includes(s)))
  assert('含表格', text.includes('|---|'))
  assert('含免责声明', text.includes('不是叙事判决'), text.slice(-80))
}

console.log('-- 6. Prompt 卡片 --')
{
  const card = buildPromptCard(buildWhitepaper({}))
  assert('有一句话定位', card.oneLine.length > 10, card.oneLine.slice(0, 30))
  assert('有物理硬参数', card.physical.length >= 4, String(card.physical.length))
  assert('有能做/不能做', card.capabilities.length > 0)
  assert('有注意事项', card.warnings.length > 0)

  const text = renderPromptCard(card)
  assert('含设定卡标题', text.includes('世界设定卡'))
  assert('比白皮书短', text.length < renderWhitepaper(buildWhitepaper({})).length,
    text.length + ' < ' + renderWhitepaper(buildWhitepaper({})).length)
  assert('含「不是禁令」', text.includes('不是禁令') || text.includes('不要把它们当禁令'))
}

console.log('-- 7. 高重力世界的 Prompt 提示 --')
{
  const high = buildPromptCard(buildWhitepaper({ planetMass: 5, planetRadius: 1.8 }))
  assert('提示火箭被锁死', high.warnings.some((w) => w.includes('化学火箭')),
    high.warnings.join('|').slice(0, 60))
  assert('给出替代思路', high.warnings.some((w) => w.includes('替代技术') || w.includes('外部输入')))
}

console.log('-- 8. 两个产物互不混淆 --')
{
  const paper = buildWhitepaper({})
  const card = buildPromptCard(paper)
  assert('白皮书是结构化数据', typeof paper.physical === 'object')
  assert('卡片是紧凑结构', Array.isArray(card.physical))
  assert('卡片可单独渲染', renderPromptCard(card).length > 100)
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
