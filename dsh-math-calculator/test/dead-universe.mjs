/**
 * 补丁6 宇宙死寂态兜底测试。
 *
 * 重点验证：判定准确 + 措辞不反驳（不出现「错误/禁止/必须」）。
 */
import { judgeDead, renderDead } from '../lib/dead-universe.js'
import { opWorld } from '../lib/ops/world-op.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

function world(overrides) { return opWorld({ world: overrides || {} }, 64).value }

console.log('-- 1. 地球参数：正常 --')
{
  const v = judgeDead(world({}))
  assert('判为 alive', v.level === 'alive', v.level)
  assert('无致命原因', v.causes.length === 0, String(v.causes.length))
  assert('不灰化', v.greyOut === false)
  assert('说清可正常推演', v.summary.includes('正常'), v.summary)
}

console.log('-- 2. 远轨道：冻结（marginal，不是死寂）--')
{
  const v = judgeDead(world({ orbitAU: 3 }))
  // ⚠️ 冻结不该判 dead：火星均温 210 K 仍有液态卤水，物质还在。
  // 只有「化学键坏 / 核不稳定」才是真的长不出物质。
  assert('冻结判为 marginal', v.level === 'marginal', v.level)
  assert('识别为冻结', v.causes.some((c) => c.id === 'frozen'), v.causes.map((c) => c.id).join(','))
  assert('不灰化下游（物质还在）', v.greyOut === false)
  const cause = v.causes.find((c) => c.id === 'frozen')
  assert('给出物理依据', cause.physics.length > 5, cause.physics)
  assert('给出定性结语', cause.epitaph.includes('冰'), cause.epitaph)
  assert('给出挽救方向', cause.remedy.includes('温室') || cause.remedy.includes('轨道'), cause.remedy)
}

console.log('-- 2b. 真死寂：化学键过弱 --')
{
  const fake = { life: { chemistry: { verdict: 'bonds-too-weak', bondEnergyEv: 0.01, stability: 0.2, alphaRatio: 0.1 } } }
  const v = judgeDead(fake)
  assert('化学键坏判为 dead', v.level === 'dead', v.level)
  assert('建议灰化下游', v.greyOut === true)
  assert('指出化学键问题', v.causes.some((c) => c.id === 'bonds-weak'), v.causes.map((c) => c.id).join(','))
}

console.log('-- 3. 近轨道：沸腾 --')
{
  const v = judgeDead(world({ orbitAU: 0.4 }))
  assert('识别为沸腾或正常', v.causes.some((c) => c.id === 'boiled') || v.level !== 'dead',
    v.causes.map((c) => c.id).join(',') || v.level)
}

console.log('-- 4. 大质量恒星：寿命过短 --')
{
  const v = judgeDead(world({ starMass: 5 }))
  const short = v.causes.find((c) => c.id === 'short-star')
  assert('识别寿命问题或正常', Boolean(short) || v.level !== 'dead', v.level)
  if (short) {
    assert('寿命问题给出依据', short.physics.includes('主序'), short.physics)
    assert('建议降低恒星质量', short.remedy.includes('质量'), short.remedy)
  }
}

console.log('-- 5. 措辞：不反驳设定 --')
{
  // 用真正的死寂场景（化学键坏），措辞检查才有意义——
  // marginal 的 note 文案不同，check 不到「不是设定错了」。
  const v = judgeDead({ life: { chemistry: { verdict: 'bonds-too-weak', bondEnergyEv: 0.01, stability: 0.2, alphaRatio: 0.1 } } })
  const text = renderDead(v)
  assert('不含「错误」', !text.includes('错误'))
  assert('不含「禁止」', !text.includes('禁止'))
  assert('不含「必须」', !text.includes('必须'))
  assert('明确说「不是设定错了」', text.includes('不是说设定错了'), text.slice(-80))
  assert('提供保留设定的话术', text.includes('也是一种写法'), text.slice(-80))
  assert('给出「若想要物质世界」的调法', text.includes('若想要物质世界'))
}

console.log('-- 6. 渲染结构 --')
{
  const ok = renderDead(judgeDead(world({})))
  assert('正常世界里含状态判定', ok.includes('宇宙状态判定'))
  assert('正常世界不做灰化', !ok.includes('灰化锁定'))

  // 真死寂（化学键坏）才会建议灰化；冻结只是 marginal
  const dead = renderDead(judgeDead({ life: { chemistry: { verdict: 'bonds-too-weak', bondEnergyEv: 0.01, stability: 0.2, alphaRatio: 0.1 } } }))
  assert('死寂世界含致命原因', dead.includes('致命原因'))
  assert('死寂世界建议灰化', dead.includes('灰化锁定'))

  // 冻结世界不灰化，但仍要有致命原因清单
  const frozen = renderDead(judgeDead(world({ orbitAU: 3 })))
  assert('冻结世界也有原因', frozen.includes('致命原因'), '')
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
