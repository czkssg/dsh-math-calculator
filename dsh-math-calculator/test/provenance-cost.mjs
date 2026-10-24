/**
 * 补丁4（因果溯源）+ 补丁5（算力预警）测试。
 */
import { buildGraph, allNodes, trace, impact, renderTrace, renderImpact } from '../lib/provenance-graph.js'
import {
  estimateTimeline, estimatePhase, estimateBackSolve, estimateSweep,
  shouldWarn, renderCost, THRESHOLDS,
} from '../lib/compute-budget.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

console.log('-- 1. 依赖图构建 --')
{
  const graph = buildGraph()
  assert('图非空', graph.length > 0, String(graph.length))
  assert('节点数 > 40', allNodes(graph).size > 40, String(allNodes(graph).size))
  assert('每条边有 from/to/layer',
    graph.every((e) => e.from && e.to && e.layer))
  assert('含常数边', graph.some((e) => e.layer === 'constant'))
  assert('含接口卡边', graph.some((e) => /^P[1-5]$/.test(e.layer)))
  assert('含约束边', graph.some((e) => e.layer === 'constraint'))
  assert('含桥接边', graph.some((e) => e.layer === 'bridge'))
}

console.log('-- 2. 溯源：建筑高度上限 --')
{
  const result = trace('建筑高度上限')
  assert('找到依赖', result.found === true, String(result.direct))
  assert('直接依赖含表面重力', result.direct.includes('表面重力'), result.direct.join(','))
  assert('能追到行星质量或半径',
    result.roots.some((r) => r.includes('行星')), result.roots.join(','))
  assert('有面包屑', result.breadcrumb.length > 1, String(result.breadcrumb.length))
  assert('给出该改什么', result.adjust.length > 0, result.adjust.join(','))
}

console.log('-- 3. 溯源：未知节点 --')
{
  const result = trace('完全不存在的量')
  assert('找不到时 found=false', result.found === false)
  assert('空链', result.chain.length === 0)
  assert('渲染不崩', renderTrace(result).includes('基础量'))
}

console.log('-- 4. 影响面：改 c --')
{
  const result = impact('c')
  assert('有直接下游', result.direct.length > 0, String(result.direct.length))
  assert('含 mu0', result.direct.includes('mu0'), result.direct.slice(0, 5).join(','))
  assert('含 alpha_fs', result.direct.includes('alpha_fs'))
  assert('有间接波及', result.indirect.length > 0, String(result.indirect.length))
  assert('间接含骨骼强度体重比',
    result.indirect.some((n) => n.includes('骨骼')), result.indirect.join(','))
}

console.log('-- 5. 影响面：改无关量 --')
{
  const result = impact('根本没人依赖它')
  assert('无直接下游', result.direct.length === 0)
  assert('无间接波及', result.indirect.length === 0)
}

console.log('-- 6. 算力估算：时间轴 --')
{
  const small = estimateTimeline(10)
  const large = estimateTimeline(1000)
  assert('规模越大越慢', large.estimatedMs > small.estimatedMs,
    large.estimatedMs + ' > ' + small.estimatedMs)
  assert('小规模判为快', small.risk === 'fast', small.risk)
  assert('大规模判为慢或很慢', ['slow', 'very-slow'].includes(large.risk), large.risk)

  const withPipeline = estimateTimeline(100, true)
  const withoutPipeline = estimateTimeline(100, false)
  assert('跑推演栈更慢', withPipeline.estimatedMs > withoutPipeline.estimatedMs,
    withPipeline.estimatedMs.toFixed(0) + ' > ' + withoutPipeline.estimatedMs.toFixed(0))
}

console.log('-- 7. 算力估算：相图 --')
{
  const small = estimatePhase(10, 10)
  const big = estimatePhase(200, 200)
  // 10×10=100 点 × 30 单元 × 0.2ms ≈ 0.6 秒，判 moderate 是合理的
  assert('小相图不至于很慢', ['fast', 'moderate'].includes(small.risk), small.risk)
  assert('大相图很慢', big.risk === 'very-slow', big.risk)
  assert('大相图耗时 > 15 秒', big.estimatedMs > 15000, big.estimatedMs.toFixed(0))
  assert('给出降级建议', big.downgrade.length >= 3, String(big.downgrade.length))
  assert('小相图无降级建议', small.downgrade.length === 0)
}

console.log('-- 8. 预警阈值 --')
{
  assert('shouldWarn: 快的不用警告',
    shouldWarn(estimateTimeline(10)) === false)
  assert('shouldWarn: 慢的要警告',
    shouldWarn(estimatePhase(200, 200)) === true)
  assert('阈值递增',
    THRESHOLDS.moderate < THRESHOLDS.slow && THRESHOLDS.slow < THRESHOLDS.verySlow)
}

console.log('-- 9. 其他估算器 --')
{
  const bs = estimateBackSolve(40)
  assert('逆推估算有值', bs.estimatedMs > 0, bs.estimatedMs.toFixed(1))
  const sweep = estimateSweep(10000)
  assert('大扫描判慢', ['slow', 'very-slow'].includes(sweep.risk), sweep.risk)
}

console.log('-- 10. 渲染 --')
{
  const text = renderCost(estimatePhase(200, 200))
  assert('含算力估算标题', text.includes('算力估算'))
  assert('含风险等级', text.includes('风险等级'))
  assert('含降级建议', text.includes('降级建议'))
  assert('明确说不拒绝请求', text.includes('不会拒绝'), text.slice(-60))

  const traceText = renderTrace(trace('建筑高度上限'))
  assert('溯源含依赖链', traceText.includes('依赖链'))
  assert('溯源含该改什么', traceText.includes('最该动'))

  const impactText = renderImpact('c', impact('c'))
  assert('影响面含直接/间接',
    impactText.includes('直接依赖') && impactText.includes('间接'))
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
