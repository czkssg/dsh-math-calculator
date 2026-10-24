/**
 * 推演指令集测试：确定性底座 + AI 开放层。
 */
import {
  buildPlaybook, buildBriefPlaybook, BASE_CAPABILITIES, AI_DUTIES,
  VERDICT_RULES, CONFLICT_PRIORITY, WORKFLOW,
} from '../lib/playbook.js'
import { setPromptMode, buildSystemPromptSection } from '../lib/awareness.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

console.log('-- 1. 底座能力清单 --')
{
  assert('至少 10 项能力', BASE_CAPABILITIES.length >= 10, String(BASE_CAPABILITIES.length))
  assert('每项都有调用方式', BASE_CAPABILITIES.every((c) => c.call.length > 3))
  assert('每项都说明产出', BASE_CAPABILITIES.every((c) => c.produces.length > 3))
  assert('每项都说明何时用', BASE_CAPABILITIES.every((c) => c.when.length > 3))
  assert('每项都说明不管什么', BASE_CAPABILITIES.every((c) => c.doesNot.length > 3))
  assert('包含 pipeline', BASE_CAPABILITIES.some((c) => c.call.includes('pipeline')))
  assert('包含 backSolve', BASE_CAPABILITIES.some((c) => c.call.includes('backSolve')))
  assert('dead 明确说不生成结语',
    BASE_CAPABILITIES.some((c) => c.call.includes('dead') && c.doesNot.includes('结语')))
}

console.log('-- 2. AI 职责清单 --')
{
  assert('至少 5 项职责', AI_DUTIES.length >= 5, String(AI_DUTIES.length))
  assert('包含生成结语', AI_DUTIES.some((d) => d.duty.includes('结语')))
  assert('包含兜底', AI_DUTIES.some((d) => d.duty.includes('兜底')))
  assert('每项都解释为什么插件不做', AI_DUTIES.every((d) => d.why.length > 5))
  assert('每项都说明做好是什么样', AI_DUTIES.every((d) => d.good.length > 3))
}

console.log('-- 3. 判据分级 --')
{
  assert('硬约束含物质不存在', VERDICT_RULES.hard.some((r) => r.includes('原子')))
  assert('软约束含技术路径', VERDICT_RULES.soft.some((r) => r.includes('技术路径')))
  assert('叙事选择含巨兽', VERDICT_RULES.narrative.some((r) => r.includes('巨兽')))
  assert('三类都有内容',
    VERDICT_RULES.hard.length > 0 && VERDICT_RULES.soft.length > 0 && VERDICT_RULES.narrative.length > 0)
}

console.log('-- 4. 冲突优先级 --')
{
  assert('四级优先', CONFLICT_PRIORITY.length === 4, String(CONFLICT_PRIORITY.length))
  assert('硬约束最优先', CONFLICT_PRIORITY[0].includes('硬约束'))
  assert('叙事锚点其次', CONFLICT_PRIORITY[1].includes('叙事'))
  assert('细节最后', CONFLICT_PRIORITY[3].includes('细节'))
}

console.log('-- 5. 工作流 --')
{
  assert('11 步', WORKFLOW.length === 11, String(WORKFLOW.length))
  assert('每步有做法', WORKFLOW.every((w) => w.do.length > 3))
  assert('每步有跳过条件', WORKFLOW.every((w) => w.skip.length > 1))
  assert('硬约束筛选不可跳过',
    WORKFLOW.find((w) => w.step.includes('硬约束')).skip === '绝不跳过')
}

console.log('-- 6. 动态定制 --')
{
  const empty = buildBriefPlaybook({})
  assert('空白工作区指令短', empty.split(String.fromCharCode(10)).length <= 6,
    String(empty.split(String.fromCharCode(10)).length))

  const rich = buildBriefPlaybook({ changedConstants: ['c', 'G'], customConstants: 3 })
  assert('改过常数时追加提醒', rich.includes('dimensionless'), rich.slice(-60))
  assert('有自创量时追加提醒', rich.includes('自创量'))
  assert('比空白更长', rich.length > empty.length,
    rich.length + ' > ' + empty.length)

  const full = buildPlaybook({ changedConstants: ['c'], customConstants: 2, hasArchive: true })
  assert('完整版含底座清单', full.includes('底座能给你什么'))
  assert('完整版含 AI 职责', full.includes('你必须接手的'))
  assert('完整版含判据', full.includes('判据'))
  assert('完整版含工作流', full.includes('工作流'))
  assert('完整版含两条底线', full.includes('两条底线'))
  assert('有档案时提醒对比', full.includes('compare'), full.slice(-200))
}

console.log('-- 7. 系统提示已接入 --')
{
  setPromptMode('brief')
  const brief = buildSystemPromptSection()
  assert('brief 含底座算数', brief.includes('底座算数'))
  assert('brief 含「不反驳」', brief.includes('不反驳'))
  assert('brief 含「别编」', brief.includes('别编'))

  setPromptMode('full')
  const fullPrompt = buildSystemPromptSection()
  assert('full 含完整指令集', fullPrompt.includes('世界推演指令集'))
  assert('full 含底座能力', fullPrompt.includes('底座能给你什么'))
  assert('full 含 AI 职责', fullPrompt.includes('你必须接手的'))
  setPromptMode('brief')
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
