/**
 * 三项可视化能力测试：DAG SVG 画布 / 相图热力图 / 工具卡片。
 */
import { handleApiRequest } from '../lib/api.js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

async function call(path, body, method) {
  return handleApiRequest(path, { method: method || 'POST', route: path, body, params: {}, headers: {} })
}

console.log('-- 1. DAG 画布数据（方案 2.1）--')
{
  const r = await call('/derive', { sub: 'graph' })
  assert('返回 200', r.status === 200, 'status=' + r.status)
  const g = r.json.value && r.json.value.graph
  assert('有 graph 数据', Boolean(g), JSON.stringify(Object.keys(r.json.value || {})))
  assert('有节点', g && g.nodes.length > 0, String(g && g.nodes.length))
  assert('有连线', g && g.edges.length > 0, String(g && g.edges.length))
  assert('节点有坐标', g && g.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)))
  assert('有画布尺寸', g && g.width > 0 && g.height > 0, g && (g.width.toFixed(0) + '×' + g.height.toFixed(0)))
  assert('有分层', g && g.maxDepth >= 1, String(g && g.maxDepth))
  assert('文本说明也给了', typeof r.json.result === 'string' && r.json.result.includes('依赖图'))
}

console.log('-- 2. 相图热力图（方案 5.2）--')
{
  const r = await call('/derive', { sub: 'heatmap' })
  assert('返回 200', r.status === 200, 'status=' + r.status)
  const m = r.json.value && r.json.value.heatmap
  assert('有 heatmap 数据', Boolean(m))
  assert('格子数 = 行×列', m && m.cells.length === m.xValues.length * m.yValues.length,
    String(m && m.cells.length))
  assert('每格有 level', m && m.cells.every((c) => ['ok', 'warn', 'danger', 'unknown'].includes(c.level)))
  assert('每格有说明', m && m.cells.every((c) => c.note.length > 3))
  assert('有统计', m && m.summary && typeof m.summary.ok === 'number', JSON.stringify(m && m.summary))
  assert('有轴标签', m && m.xLabel.length > 0 && m.yLabel.length > 0, (m && m.xLabel) + ' × ' + (m && m.yLabel))
  // 地球附近（质量1、轨道1）必须是绿的
  const earthCell = m && m.cells.find((c) => Math.abs(c.x - 2.0) < 1.2 && Math.abs(c.y - 1.0) < 0.2)
  assert('地球附近判为允许', earthCell && earthCell.level === 'ok', earthCell && earthCell.level)
}

console.log('-- 3. 死寂分级（温度类不该判死）--')
{
  // 火星均温约 210 K，仍有液态卤水，不该判「死寂」
  const { judgeDead } = await import('../lib/dead-universe.js')
  const { opWorld } = await import('../lib/ops/world-op.js')
  const cold = judgeDead(opWorld({ world: { orbitAU: 1.5 } }, 32).value)
  assert('偏冷世界不是 dead', cold.level !== 'dead', cold.level)
  assert('归为 marginal', cold.level === 'marginal', cold.level)

  // 化学键坏掉才是真的 dead
  const fake = { life: { chemistry: { verdict: 'bonds-too-weak', bondEnergyEv: 0.01, stability: 0.2, alphaRatio: 0.1 } } }
  assert('化学键坏才判 dead', judgeDead(fake).level === 'dead')
}

console.log('-- 4. 工具卡片已注册 --')
{
  const source = readFileSync(join(process.cwd(), 'lib', 'client.js'), 'utf8')
  assert('含 ToolCard 组件', source.includes('ToolCard'))
  assert('注册到 tool.view.cordis', source.includes('tool.view.cordis'))
  assert('含卡片样式令牌', source.includes('T.hairline') || source.includes('hairline'))
}

console.log('-- 5. 依赖图渲染（不引第三方库）--')
{
  const source = readFileSync(join(process.cwd(), 'lib', 'client.js'), 'utf8')
  // DAG = SVG 画布 + 按层开关（层开关只控制显示哪些层，不换渲染方式）。
  // 之所以保留 SVG：用户要求「连线希望更明显」，纯列表没有连线。
  assert('用 SVG 画布', source.includes("'svg'"))
  assert('有连线 path', source.includes("'path'"))
  assert('有箭头 polygon', source.includes("'polygon'"))
  assert('有层开关', source.includes('已隐藏') || source.includes('点击隐藏'))
  assert('无 react-flow 依赖', !source.includes('@xyflow'))
  assert('无 canvas 依赖', !source.includes('getContext'))
}

console.log('-- 6. 客户端硬约束 --')
{
  const source = readFileSync(join(process.cwd(), 'lib', 'client.js'), 'utf8')
  assert('无顶层 import', !/^import\s/m.test(source))
  assert('无顶层 export', !/^export\s/m.test(source))
  assert('无写死颜色', !/#[0-9a-fA-F]{6}\b/.test(source) && !/rgba\(/.test(source))
  assert('含引导', source.includes('__ModuleLoader__'))
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
