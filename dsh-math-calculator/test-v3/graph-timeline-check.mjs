/**
 * timeline_check 行为测试：逆序 / 重叠 / 跨度 / 缺起点 / 乱序。
 *
 * 这是反馈包 N9 新增的 op。核心设计：重叠是否合理由作者定
 * （`overlapAllowed`），工具只列冲突不说「该删哪个」。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-timeline-'))
const mod = await import(pathToFileURL(join(root, 'lib/features/graph/timeline-check.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
function throwsOf(fn) { try { fn(); return null } catch (error) { return error } }

console.log('-- 1. 正常时间线与排序 --')
{
  const out = mod.runTimelineCheck({ events: [
    { name: '冰层形成', year: 5 },
    { name: '施工期', start: 6, end: 10 },
    { name: '第一城', year: 12 },
  ] })
  assert('无问题', out.value.findings.length === 0, JSON.stringify(out.value.findings))
  assert('排序后第一个是冰层形成', out.value.events[0].name === '冰层形成', out.value.events[0].name)
  assert('覆盖 5–12', out.value.coverage.from === 5 && out.value.coverage.to === 12, JSON.stringify(out.value.coverage))
}

console.log('-- 2. ★ 逆序 --')
{
  const out = mod.runTimelineCheck({ events: [{ name: '施工', start: 8, end: 3 }] })
  assert('★ start>end → reversed', out.value.counts.reversed === 1, JSON.stringify(out.value.counts))
  assert('消息说区间写反', out.value.findings[0].message.includes('区间写反'), out.value.findings[0].message)
  assert('notice 报硬错误', (out.notice ?? '').includes('硬错误'), String(out.notice))
}

console.log('-- 3. ★ 重叠与 overlapAllowed --')
{
  const events = [
    { name: '工程期', start: 1, end: 5 },
    { name: '结冰期', start: 4, end: 6 },
  ]
  const out = mod.runTimelineCheck({ events })
  assert('★ 检出 overlap', out.value.counts.overlap === 1, JSON.stringify(out.value.counts))
  assert('点名两个事件', out.value.findings[0].events.length === 2, JSON.stringify(out.value.findings[0].events))
  const allowed = mod.runTimelineCheck({ events, overlapAllowed: true })
  assert('★ overlapAllowed:true → 不报重叠', allowed.value.counts.overlap === 0, JSON.stringify(allowed.value.counts))
  assert('result 说明重叠是否合理由作者定', out.result.includes('由作者定'), '')
}

console.log('-- 4. 跨度超限与缺起点 --')
{
  const out = mod.runTimelineCheck({ events: [{ name: '长工期', start: 0, end: 30 }], maxSpan: 10 })
  assert('★ 跨度 30 > 上限 10 → span-exceeded', out.value.counts['span-exceeded'] === 1, JSON.stringify(out.value.counts))
  const missing = mod.runTimelineCheck({ events: [{ name: '无时间' }] })
  assert('★ 缺起点 → missing-start', missing.value.counts['missing-start'] === 1, JSON.stringify(missing.value.counts))
  assert('缺起点的事件不进时间线', missing.value.events.length === 0, String(missing.value.events.length))
}

console.log('-- 5. 乱序与负年份 --')
{
  const out = mod.runTimelineCheck({ events: [{ name: '后来', year: 10 }, { name: '早先', year: 3 }] })
  assert('★ 输入乱序 → out-of-order', out.value.counts['out-of-order'] === 1, JSON.stringify(out.value.counts))
  assert('排序后早先在前', out.value.events[0].name === '早先', JSON.stringify(out.value.events.map((e) => e.name)))
  const bc = mod.runTimelineCheck({ events: [{ name: '建城', year: -500 }, { name: '扩建', year: -480 }] })
  assert('负年份（公元前）能排', bc.value.coverage.from === -500 && bc.value.coverage.to === -480, JSON.stringify(bc.value.coverage))
}

console.log('-- 6. 边界 --')
{
  assert('无输入 → missing_params', throwsOf(() => mod.runTimelineCheck(undefined))?.type === 'missing_params', '')
  assert('空 events → missing_params', throwsOf(() => mod.runTimelineCheck({ events: [] }))?.type === 'missing_params', '')
  assert('事件非对象 → invalid_argument', throwsOf(() => mod.runTimelineCheck({ events: ['x'] }))?.type === 'invalid_argument', '')
  const duration = mod.runTimelineCheck({ events: [{ name: '施工', start: 2, duration: 4 }] })
  assert('duration → end = 6', duration.value.events[0].end === 6, String(duration.value.events[0].end))
  const point = mod.runTimelineCheck({ events: [{ name: '点', year: 7 }] })
  assert('点事件 span = 0', point.value.events[0].span === 0, String(point.value.events[0].span))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
