/**
 * UI 反馈修复测试：标题去重 / 自动切换 / 中文标注 / 依赖图折叠。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toRenderRows, QUANTITY_LABELS, arrowHead } from '../lib/graph-render.js'
import { layoutGraph } from '../lib/graph-layout.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

const source = readFileSync(join(process.cwd(), 'lib', 'client.js'), 'utf8')

console.log('-- 1. 标题不再重复 --')
{
  // 组件只出图标（∑ / ⚙），文字交给 label / title 回调
  assert('侧栏用 ∑ 图标', source.includes('∑'))
  assert('右栏用 ⚙ 图标', source.includes('⚙'))
  // SidebarTitle 里不该再渲染「数学工作区」这串字
  const marker = 'function makeSidebarTitle'
  const idx = source.indexOf(marker)
  assert('找到 SidebarTitle', idx >= 0)
  if (idx >= 0) {
    const body = source.slice(idx, idx + 600)
    assert('图标组件里不写标题文字', !body.includes('数学工作区'),
      body.slice(0, 100).replace(/\n/g, ' '))
  }
}

console.log('-- 2. 自动切换：有轮询兜底 --')
{
  assert('用了 setInterval', source.includes('setInterval'))
  assert('有 pollActive', source.includes('pollActive'))
  assert('记录上次活动 id', source.includes('lastActiveId'))
  assert('比对 id 避免重复请求', source.includes('=== lastActiveId') || source.includes('== lastActiveId'))
  assert('切换后通知刷新', source.includes('notifyWorkspaceChanged'))
  assert('清理定时器', source.includes('clearInterval'))
}

console.log('-- 3. 中文标注 --')
{
  assert('SI 有中文解释', source.includes('国际单位制'))
  assert('Δv 有中文解释', source.includes('速度增量'))
  assert('P 层有中文解释', source.includes('物理层'))
  assert('Prompt 有中文解释', source.includes('提示词卡片'))
}

console.log('-- 4. 依赖图可折叠 --')
{
  assert('有折叠状态', source.includes('collapsed'))
  assert('有展开/收起提示', source.includes('点击展开') || source.includes('点击收起'))
  assert('有层名', source.includes('基础常数'))
  assert('节点有中文标签', source.includes('光速') || source.includes('引力常数'))
}

console.log('-- 5. 量化标签表 --')
{
  assert('标签表非空', Object.keys(QUANTITY_LABELS).length > 20,
    String(Object.keys(QUANTITY_LABELS).length))
  assert('c 标为光速', QUANTITY_LABELS.c === '光速')
  assert('h 标为普朗克常数', QUANTITY_LABELS.h === '普朗克常数')
  assert('G 标为引力常数', QUANTITY_LABELS.G === '引力常数')
}

console.log('-- 6. 分层渲染 --')
{
  const layout = layoutGraph([{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }])
  const rows = toRenderRows(layout)
  assert('有行', rows.length > 0, String(rows.length))
  assert('按深度降序（上层在前）', rows.every((r, i) => i === 0 || r.depth <= rows[i - 1].depth))
  assert('每行有层名', rows.every((r) => r.layerName.length > 0))
  assert('默认只展开最上层', rows.filter((r) => r.expanded).length === 1,
    String(rows.filter((r) => r.expanded).length))

  const expanded = toRenderRows(layout, [0, 1, 2])
  assert('可手动展开指定层', expanded.every((r) => r.expanded))
}

console.log('-- 7. 箭头 --')
{
  const points = arrowHead({ x2: 100, y2: 50 }, 5)
  assert('箭头是三点', points.split(' ').length === 3, points)
  assert('居中在 x2', points.includes('100,'))
}

console.log('-- 8. 硬约束 --')
{
  assert('无顶层 import', !/^import\s/m.test(source))
  assert('无顶层 export', !/^export\s/m.test(source))
  assert('无写死颜色', !/#[0-9a-fA-F]{6}\b/.test(source) && !/rgba\(/.test(source))
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
