/**
 * AI 协作提示词测试：确认插件只给结构，不穷举结语。
 */
import { buildDeadBriefPrompt, buildCapabilityPrompt, buildAskUserPrompt } from '../lib/ai-brief.js'
import { judgeDead } from '../lib/dead-universe.js'
import { buildSystemPromptSection, setPromptMode } from '../lib/awareness.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

console.log('-- 1. 死寂提示词：给事实 + 把判断交给 AI --')
{
  const prompt = buildDeadBriefPrompt({
    level: 'dead',
    causes: [{ id: 'frozen', name: '全球冻结', value: '180 K', physics: '低于冰点' }],
    keyParams: { 均温: 180, 重力: 9.8 },
    remedyHints: ['提高温室效应'],
  })
  assert('含结构性事实', prompt.includes('结构性事实'), prompt.slice(0, 40))
  assert('含物理依据', prompt.includes('低于冰点'))
  assert('含关键参数', prompt.includes('均温'))
  assert('明确说参考不是唯一解', prompt.includes('不是唯一解'), prompt.slice(0, 120))
  assert('任务 1：让 AI 写有画面感的文字', prompt.includes('画面感'))
  assert('任务 2：指出该调哪些参数', prompt.includes('调哪几个参数'))
  assert('任务 3：不要说「不合理」', prompt.includes('不要说「这不合理」'))
}

console.log('-- 2. 能力提示词：分工清晰 --')
{
  const prompt = buildCapabilityPrompt()
  assert('含「你要算的」', prompt.includes('你要算的'))
  assert('含「你要写的」', prompt.includes('你要写的'))
  assert('列出 pipeline', prompt.includes('pipeline'))
  assert('列出 backSolve', prompt.includes('backSolve'))
  assert('列出 civilization', prompt.includes('civilization'))
  assert('列出 dead', prompt.includes('dead'))
  assert('列出 observer', prompt.includes('observer'))
  assert('列出 chaos', prompt.includes('chaos'))
  assert('明确说插件不做穷举', prompt.includes('不做穷举') || prompt.includes('穷举'))
  assert('写明生成性任务归 AI', prompt.includes('结语') || prompt.includes('描写'))
}

console.log('-- 3. 提问提示词 --')
{
  const prompt = buildAskUserPrompt()
  assert('含何时该问', prompt.includes('何时该问'))
  assert('提问包括观测者', prompt.includes('观测者'))
  assert('提醒一次问 1-2 个', prompt.includes('1-2'))
  assert('提醒别编数字', prompt.includes('别编') || prompt.includes('别列问卷'))
}

console.log('-- 4. 系统提示已含分工说明 --')
{
  setPromptMode('brief')
  const brief = buildSystemPromptSection()
  assert('brief 含分工', brief.includes('分工'), brief.slice(0, 60))
  assert('brief 含「插件只给结构与判据」', brief.includes('结构与判据'))
  assert('brief 含「不要反驳」', brief.includes('不要反驳'))
  assert('brief 含「算不出来的别编」', brief.includes('别编数字'))

  setPromptMode('full')
  const full = buildSystemPromptSection()
  assert('full 含世界推演 operation', full.includes('世界推演相关 operation'))
  assert('full 列出 derivation 子命令', full.includes('backSolve') && full.includes('civilization'))
  assert('full 含插件不做穷举', full.includes('插件不做穷举'))
  setPromptMode('brief')
}

console.log('-- 5. 死寂结语是「参考写法」不是判决 --')
{
  const v = judgeDead({ temperature: { surfaceMeanK: 180, freezingPointK: 273.15, boilingPointK: 373.15 } })
  assert('判为死寂', v.level === 'dead', v.level)
  const cause = v.causes[0]
  assert('有参考结语', typeof cause.epitaph === 'string' && cause.epitaph.length > 5, String(cause.epitaph))
  assert('结语是给作者的素材（含画面）', cause.epitaph.includes('冰') || cause.epitaph.length > 10)
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
