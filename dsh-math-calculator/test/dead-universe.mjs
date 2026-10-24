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

console.log('-- 2. 远轨道：冻结 --')
{
  const v = judgeDead(world({ orbitAU: 3 }))
  assert('判为 dead', v.level === 'dead', v.level)
  assert('识别为冻结', v.causes.some((c) => c.id === 'frozen'), v.causes.map((c) => c.id).join(','))
  assert('建议灰化下游', v.greyOut === true)
  const cause = v.causes.find((c) => c.id === 'frozen')
  assert('给出物理依据', cause.physics.length > 5, cause.physics)
  assert('给出定性结语', cause.epitaph.includes('冰'), cause.epitaph)
  assert('给出挽救方向', cause.remedy.includes('温室') || cause.remedy.includes('轨道'), cause.remedy)
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
  const v = judgeDead(world({ orbitAU: 3 }))
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

  const dead = renderDead(judgeDead(world({ orbitAU: 3 })))
  assert('死寂世界含致命原因', dead.includes('致命原因'))
  assert('死寂世界建议灰化', dead.includes('灰化锁定'))
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
