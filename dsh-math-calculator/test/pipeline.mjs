/**
 * 正向推演链路测试：world 输出 → P1—P5 逐层判定。
 */
import { runPipeline, renderPipeline } from '../lib/pipeline.js'
import { opWorld } from '../lib/ops/world-op.js'
import { opDerivation } from '../lib/ops/derivation-op.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

function world(overrides) {
  return opWorld({ world: overrides || {} }, 64).value
}

console.log('-- 1. 地球参数：全链路应通过 --')
{
  const result = runPipeline(world({}))
  assert('五层都在', result.layers.length === 5, String(result.layers.length))
  assert('层顺序 P1..P5', result.layers.map((l) => l.layer).join(',') === 'P1,P2,P3,P4,P5')
  assert('总结论允许', result.verdict === 'allowed', result.verdict)
  assert('无首个断点', result.firstBlocked === null, String(result.firstBlocked))
  for (const layer of result.layers) {
    assert(layer.layer + ' 全部允许', layer.allAllowed === true,
      layer.items.filter((i) => i.verdict !== 'allowed').map((i) => i.card).join(','))
  }
}

console.log('-- 2. 关键物理量确实被算出来 --')
{
  const result = runPipeline(world({}))
  const p1 = result.layers[0].items
  const p3 = result.layers[2].items
  const p4 = result.layers[3].items
  const p5 = result.layers[4].items
  assert('P1 有键能', p1.some((i) => i.card === '键能范围' && i.value > 1 && i.value < 10),
    String(p1.find((i) => i.card === '键能范围')?.value))
  assert('P3 骨比 ≈5（地球基准）', Math.abs(p3.find((i) => i.card === '骨骼强度体重比').value - 5) < 0.5)
  assert('P4 Jeans 参数 > 6', p4.find((i) => i.card === '大气逃逸率').value > 6)
  assert('P5 恒星寿命 ≈1e10 yr', Math.abs(p5.find((i) => i.card === '恒星寿命').value - 1e10) / 1e10 < 0.1)
}

console.log('-- 3. 单位换算正确（nm 不能当 m 用）--')
{
  const p5 = runPipeline(world({})).layers[4].items
  const wl = p5.find((i) => i.card === '辐射谱峰值波长')
  assert('峰值波长以米记（~5e-7）', wl.value > 1e-7 && wl.value < 1e-6, String(wl.value))
  assert('峰值波长判为允许', wl.verdict === 'allowed', wl.verdict)
}

console.log('-- 4. 低重力小行星：应在体感层告警 --')
{
  const result = runPipeline(world({ planetRadius: 0.4, planetMass: 0.05, rotationHours: 8 }))
  const p3 = result.layers[2]
  const marginalOrBad = p3.items.some((i) => i.verdict !== 'allowed')
  assert('小行星在 P3 有告警', marginalOrBad,
    p3.items.map((i) => i.card + '=' + i.verdict).join(','))
  assert('总结论不是全允许', result.verdict !== 'allowed', result.verdict)
}

console.log('-- 5. 超级地球：重力更大，骨比应更小 --')
{
  const earth = runPipeline(world({})).layers[2].items.find((i) => i.card === '骨骼强度体重比')
  const superEarth = runPipeline(world({ planetRadius: 2.5, planetMass: 10 })).layers[2].items
    .find((i) => i.card === '骨骼强度体重比')
  assert('超级地球骨比更小', superEarth.value < earth.value,
    superEarth.value.toFixed(2) + ' < ' + earth.value.toFixed(2))
}

console.log('-- 6. 渲染与子命令 --')
{
  const text = renderPipeline(runPipeline(world({})))
  assert('报告含五层标题', ['P1','P2','P3','P4','P5'].every((id) => text.includes('【' + id + '】')))
  assert('报告含总结论', text.includes('总结论'))
  const viaOp = opDerivation({ derivation: 'pipeline' })
  assert('pipeline 子命令可用', viaOp.result.includes('正向推演链路'), String(viaOp.result.slice(0, 30)))
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
