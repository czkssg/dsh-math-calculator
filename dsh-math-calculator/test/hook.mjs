/**
 * agent/pre-step 钩子集成测试。
 *
 * 验证：注册的钩子能被调用，且检测到计算需求时真的会插入提醒消息。
 * 这是「主动询问」闭环的关键 —— 不验证就等于没做。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempHome = mkdtempSync(join(tmpdir(), 'dsh-hook-test-'))
process.env.DSH_MATH_CALC_HOME = tempHome

const mod = await import('../lib/index.js')
const detector = await import('../lib/detector.js')

let pass = 0
const fails = []
function ok(n, d) { pass++; console.log('  ok   ' + n + (d ? ': ' + d : '')) }
function bad(n, d) { fails.push({ n, d }); console.log('  FAIL ' + n + '\n         ' + d) }
function assert(n, c, d) { if (c) ok(n, d); else bad(n, d || '') }

/** 桩 ctx：记录注册的工具与钩子。 */
function createStubContext() {
  const registeredTools = []
  const handlers = new Map()

  const ctx = {
    tools: {
      register: (definition) => {
        registeredTools.push(definition)
        return () => {}
      },
    },
    on: (event, handler) => {
      handlers.set(event, handler)
      return () => handlers.delete(event)
    },
    systemPrompt: {
      section: (spec) => {
        handlers.set('systemPrompt.section:' + spec.name, spec)
        return () => {}
      },
    },
  }

  return { ctx, registeredTools, handlers }
}

console.log('-- 1. apply() 应注册工具与钩子 --')
const stub = createStubContext()
mod.apply(stub.ctx)

assert('注册了 math_execute 工具', stub.registeredTools.some((t) => t.name === 'math_execute'))
assert('注册了 agent/pre-step 钩子', stub.handlers.has('agent/pre-step'))
assert('注册了 systemPrompt section',
  [...stub.handlers.keys()].some((k) => k.startsWith('systemPrompt.section:')))

console.log('-- 2. 钩子能插入提醒（计算需求）--')
{
  detector.resetDetectionState()
  const handler = stub.handlers.get('agent/pre-step')
  assert('handler 是函数', typeof handler === 'function')

  const next = async () => ({
    kind: 'enter',
    messages: [{ role: 'user', content: '计算 15 + 27 * 3 等于多少' }],
  })

  const decision = await handler(
    { agent: { id: 'agent-1', sessionId: 'sess-hook-1' }, step: 1 },
    next,
  )

  assert('返回 enter 决策', decision && decision.kind === 'enter', JSON.stringify(decision)?.slice(0, 100))
  assert('消息数增加了（插入了提醒）', decision.messages.length > 1,
    String(decision.messages.length))

  const reminder = decision.messages[decision.messages.length - 1]
  assert('最后一条是提醒', reminder.role === 'system', reminder.role)
  assert('提醒内容提到 math_execute', String(reminder.content).includes('math_execute'),
    String(reminder.content).slice(0, 80))
  assert('提醒内容提到公式/常数等能力',
    /公式|常数|推演|高精度/.test(String(reminder.content)))
}

console.log('-- 3. 非计算需求不打扰 --')
{
  detector.resetDetectionState()
  const handler = stub.handlers.get('agent/pre-step')
  const next = async () => ({
    kind: 'enter',
    messages: [{ role: 'user', content: '她看着窗外，天边泛起鱼肚白' }],
  })
  const decision = await handler(
    { agent: { id: 'agent-2', sessionId: 'sess-hook-2' }, step: 1 },
    next,
  )
  assert('未插入提醒', decision.messages.length === 1, String(decision.messages.length))
}

console.log('-- 4. 已用过插件则不打扰 --')
{
  detector.resetDetectionState()
  const handler = stub.handlers.get('agent/pre-step')
  /**
   * 「用过插件」必须看**真实工具调用结构**，不能看文本里有没有 math_execute。
   *
   * 这里造的是 assistant 消息带 `tool_calls`（OpenAI 风格）——
   * 这才是宿主里「模型真的调了这个工具」的样子。
   *
   * 旧实现用 `content.includes('math_execute')` 判断，而我们的系统提示
   * 每轮都注入、且必然包含这个词 —— 于是 toolUsed 恒为 true、检测永久静默，
   * 命中率归零。这个测试区下面的「4b/4c」专门守住那一点。
   */
  const next = async () => ({
    kind: 'enter',
    messages: [
      { role: 'user', content: '计算 15 + 27 * 3' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'math_execute', arguments: '{}' } }],
      },
    ],
  })
  const decision = await handler(
    { agent: { id: 'agent-3', sessionId: 'sess-hook-3' }, step: 1 },
    next,
  )
  assert('真调过工具后不再插入', decision.messages.length === 2, String(decision.messages.length))
}

console.log('-- 4b. 仅有系统提示时仍应提醒（关键回归）--')
{
  /**
   * 这是命中率归零的直接复现场景。
   *
   * 系统提示每轮注入，内容里必然有 math_execute 这个词。
   * 旧实现因此判「已用过插件」，从此再也不提醒 —— 第一轮之后就永久静默。
   *
   * 正确行为：光有系统提示**不算**用过工具，应当正常提醒。
   */
  detector.resetDetectionState()
  const handler = stub.handlers.get('agent/pre-step')
  const next = async () => ({
    kind: 'enter',
    messages: [
      { role: 'system', content: '你应当优先调用 math_execute 做数值计算。' },
      { role: 'user', content: '帮我算一下这个行星的重力' },
    ],
  })
  const decision = await handler(
    { agent: { id: 'agent-4', sessionId: 'sess-hook-4' }, step: 0 },
    next,
  )
  assert('只有系统提示时仍插入提醒', decision.messages.length === 3, String(decision.messages.length))
  const reminder = decision.messages[decision.messages.length - 1]
  assert('插入的是提醒', reminder.role === 'system' && String(reminder.content).includes('math_execute'),
    String(reminder.content).slice(0, 60))
}

console.log('-- 4c. 正文提到 math_execute 也不算「用过」--')
{
  /**
   * 用户问「math_execute 怎么用」时也会让旧判据误判成「已用过」。
   * 提到工具名 ≠ 用过工具。
   */
  detector.resetDetectionState()
  const handler = stub.handlers.get('agent/pre-step')
  const next = async () => ({
    kind: 'enter',
    messages: [
      { role: 'user', content: 'math_execute 这个工具怎么算 15 + 27 * 3' },
      { role: 'assistant', content: '我可以用 math_execute 来算这个表达式' },
    ],
  })
  const decision = await handler(
    { agent: { id: 'agent-5', sessionId: 'sess-hook-5' }, step: 0 },
    next,
  )
  assert('正文提到工具名仍插入提醒', decision.messages.length === 3, String(decision.messages.length))
}

console.log('-- 4d. 结构化工具调用（tool_use 块 / role=tool）也算用过 --')
{
  detector.resetDetectionState()
  const handler = stub.handlers.get('agent/pre-step')

  // Anthropic 风格：content 数组里有 tool_use 块
  const anthropicNext = async () => ({
    kind: 'enter',
    messages: [
      { role: 'user', content: '计算 15 + 27 * 3' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu-1', name: 'math_execute', input: {} }],
      },
    ],
  })
  const d1 = await handler({ agent: { sessionId: 'sess-hook-6' }, step: 1 }, anthropicNext)
  assert('tool_use 块算用过', d1.messages.length === 2, String(d1.messages.length))

  // role = 'tool' 的消息也算
  detector.resetDetectionState()
  const toolRoleNext = async () => ({
    kind: 'enter',
    messages: [
      { role: 'user', content: '计算 15 + 27 * 3' },
      { role: 'assistant', content: '' },
      { role: 'tool', content: '{"ok":true}', tool_call_id: 'call-1' },
    ],
  })
  const d2 = await handler({ agent: { sessionId: 'sess-hook-7' }, step: 1 }, toolRoleNext)
  assert('role=tool 消息算用过', d2.messages.length === 3, String(d2.messages.length))
}

console.log('-- 5. 钩子不破坏原有决策 --')
{
  detector.resetDetectionState()
  const handler = stub.handlers.get('agent/pre-step')

  // reject 决策应原样返回
  const rejectNext = async () => ({ kind: 'reject' })
  const rejected = await handler({ agent: { id: 'a' }, step: 1 }, rejectNext)
  assert('reject 决策保持不变', rejected && rejected.kind === 'reject')

  // 空消息应原样返回
  const emptyNext = async () => ({ kind: 'enter', messages: [] })
  const empty = await handler({ agent: { id: 'a' }, step: 2 }, emptyNext)
  assert('空消息不崩', empty && empty.kind === 'enter' && empty.messages.length === 0)
}

console.log('-- 6. 钩子内部异常不能中断对话 --')
{
  detector.resetDetectionState()
  const handler = stub.handlers.get('agent/pre-step')

  // 传入畸形 payload，钩子应兜底
  let threw = false
  let decision
  try {
    decision = await handler({ agent: null, step: 'bad' }, async () => ({
      kind: 'enter',
      messages: [{ role: 'user', content: '计算 1+1' }],
    }))
  } catch {
    threw = true
  }
  assert('畸形 payload 不抛异常', !threw)
  assert('仍返回有效决策', decision && decision.kind === 'enter', JSON.stringify(decision)?.slice(0, 80))
}

console.log('-- 7. 多轮提醒受节流控制 --')
{
  detector.resetDetectionState()
  const handler = stub.handlers.get('agent/pre-step')
  const next = async () => ({
    kind: 'enter',
    messages: [{ role: 'user', content: '计算 15 + 27 * 3' }],
  })

  const counts = []
  for (let step = 1; step <= 12; step += 1) {
    const decision = await handler(
      { agent: { id: 'agent-throttle', sessionId: 'sess-throttle' }, step },
      next,
    )
    counts.push(decision.messages.length - 1) // 0 或 1
  }
  const promptCount = counts.filter((c) => c > 0).length
  console.log('       12 步内提醒次数: ' + promptCount + ' (模式: ' + counts.join('') + ')')
  assert('12 步内提醒不超过 3 次', promptCount <= 3, String(promptCount))
  assert('至少提醒过 1 次', promptCount >= 1)
}

console.log('-- 8. systemPrompt section 内容可用 --')
{
  const sectionKey = [...stub.handlers.keys()].find((k) => k.startsWith('systemPrompt.section:'))
  const spec = stub.handlers.get(sectionKey)
  assert('section 有 text 函数', typeof spec.text === 'function')
  const text = spec.text()
  assert('注入文本非空', typeof text === 'string' && text.length > 0, String(text.length))
  assert('提到 math_execute', text.includes('math_execute'))
}

rmSync(tempHome, { recursive: true, force: true })

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  - ' + f.n + ': ' + f.d)
  process.exitCode = 1
}
