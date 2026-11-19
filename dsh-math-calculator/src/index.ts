/**
 * 插件入口：注册 math_execute + 系统提示注入 + agent 提醒钩子。
 *
 * 阶段 2 起：老工具实现、自动建表、UI 后端路由都已删除。
 * 保留提醒钩子——它决定「模型会不会想起用这个插件」，是插件价值的一部分。
 *
 * @module dsh-math-calculator/index
 */

import { mathExecuteTool, bindLegacy, setToolContext } from './tool.js'
import { createMathEngineService, MATH_ENGINE_SERVICE } from './service.js'
import { buildSystemPromptSection } from './awareness.js'
import { buildReminderMessage, detectMathNeed, recordPrompt, shouldPromptNow, type DetectorConfig } from './detector.js'

const PLUGIN_NAME = 'dsh-math-calculator'
const TOOL_NAME = 'math_execute'
let ctxRef: any = null
let detectorConfig: Partial<DetectorConfig> = {}

/**
 * 读一个**可选**宿主服务（cordis 明文的读法是 ctx.get；桩环境退回属性访问）。
 *
 * @param ctx - 插件上下文
 * @param name - 服务名
 * @returns 服务实例或 undefined
 */
function optionalService(ctx: any, name: string): any {
  try {
    if (ctx && typeof ctx.get === 'function') return ctx.get(name)
  } catch {
    /* 未注册的服务：ctx.get 也可能抛错，按“没有”处理 */
  }
  try {
    return ctx ? ctx[name] : undefined
  } catch {
    return undefined
  }
}

/**
 * 插件入口：注册工具 → 系统提示注入 → agent 提醒钩子。
 * 每一步独立 try/catch：任何一步失败都不能让插件判为未激活（否则工具注册不上）。
 *
 * @param ctx - cordis 插件上下文
 */
export function apply(ctx: any): void {
  if (!ctx || typeof ctx.tools?.register !== "function") {
    throw new Error(PLUGIN_NAME + ": 宿主未提供 tools 服务，无法注册 " + TOOL_NAME)
  }
  ctxRef = ctx
  setToolContext(ctx)

  ctx.tools.register(mathExecuteTool)

  /**
   * 程序化门面：mathEngine 服务（其他插件用 ctx.get('mathEngine') 调用）。
   * 不经过工具流水线、不写会话；失败不影响工具注册（服务不是核心）。
   */
  try {
    if (typeof ctx.provide === 'function') ctx.provide(MATH_ENGINE_SERVICE, createMathEngineService())
  } catch {
    /* 桩环境/旧版 cordis 没有 provide：忽略 */
  }

  // ── 第三层提醒：实时检测模型「思维中的计算需求」──
  //
  // 用 agent/pre-step 钩子：它在模型发起请求前介入，
  // 能通过 { kind: 'enter', messages } 往对话里插入提醒消息。
  //
  // 之所以需要这一层：系统提示注入是「被动提醒」，
  // 模型可能读而不采。这一层是「主动询问」——
  // 检测到用户消息里有大量数字或数学运算时，直接把提醒放进消息流。
  //
  // 防打扰：每会话最多 3 次、有冷却、模型用过插件后静默。
  try {
    const ctxAny = ctx as any
    if (typeof ctxAny.on === 'function') {
      ctxAny.on('agent/pre-step', async (payload: any, next: () => Promise<any>) => {
        try {
          const decision = await next()
          if (!decision || decision.kind !== 'enter') return decision
          const messages = Array.isArray(decision.messages) ? decision.messages : []
          if (messages.length === 0) return decision

          // 取最后一条用户消息的文本
          const lastUser = [...messages].reverse().find((m: any) => m && m.role === 'user')
          if (!lastUser) return decision
          const text =
            typeof lastUser.content === 'string'
              ? lastUser.content
              : Array.isArray(lastUser.content)
                ? lastUser.content
                    .filter((block: any) => block && block.type === 'text')
                    .map((block: any) => String(block.text ?? ''))
                    .join('\n')
                : ''
          if (text.trim() === '') return decision

          // 会话标识：优先用 sessionId，退化为 agent 标识
          const sessionKey = String(
            payload?.agent?.sessionId ?? payload?.agent?.id ?? payload?.sessionId ?? 'default',
          )
          const step = typeof payload?.step === 'number' ? payload.step : 0

          // 本会话是否已用过插件。
          //
          // ⚠️ 必须看**结构化的工具调用痕迹**，绝不能看文本里有没有 "math_execute"。
          // 曾经写成 `content.includes('math_execute')`，而我们的系统提示每轮注入、
          // 且必然包含这个词 —— 于是 toolUsed 恒为 true，检测器从第一轮之后永久静默，
          // 主动提醒的命中率归零（检测器本身命中率其实有 72%）。
          // 另外「用户问 math_execute 怎么用」也会被误判成「已用过」。
          //
          // 三种真实形态都算用过：
          //   · OpenAI 风格：assistant 消息带 tool_calls 数组
          //   · Anthropic 风格：content 数组里有 type === 'tool_use' 的块
          //   · 工具结果消息：role === 'tool'
          const toolUsedInSession = messages.some((m: any) => {
            if (!m || typeof m !== 'object') return false
            if (m.role === 'tool') return true
            if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) return true
            if (Array.isArray(m.content)) {
              return m.content.some(
                (block: any) => block && typeof block === 'object' && block.type === 'tool_use',
              )
            }
            return false
          })

          const detection = shouldPromptNow(sessionKey, text, step, toolUsedInSession, detectorConfig)
          if (!detection.shouldPrompt) return decision

          // 插入提醒：作为一条 system 角色的提示消息追加在用户消息之后
          const reminder = {
            role: 'system',
            content: buildReminderMessage(detection),
          }
          recordPrompt(sessionKey, step)

          return {
            ...decision,
            messages: [...messages, reminder],
          }
        } catch {
          // 检测失败绝不影响正常对话
          try {
            return await next()
          } catch {
            return { kind: 'reject' }
          }
        }
      })
    }
  } catch {
    /* 宿主不支持 agent/pre-step 时跳过这一层 */
  }

  // ── 系统提示注入：每轮带一句「有这个插件」，解决「对话长了忘记」──
  const systemPrompt = optionalService(ctx, "systemPrompt")
  if (systemPrompt && typeof systemPrompt.section === "function") {
    try {
      systemPrompt.section({
        name: "math-calculator",
        order: 180,
        text: () => buildSystemPromptSection(),
      })
    } catch {
      /* 注入失败不影响工具 */
    }
  }
}

/** cordis 插件名：必须与 package.json 的 name 一致（宿主用它去重与排序）。 */
export const name = PLUGIN_NAME

/** 必需服务：只有 tools（其它服务一律走 optionalService）。 */
export const inject = ["tools"]

export { mathExecuteTool }

export default { name, inject, apply, mathExecuteTool }

/** 老入口已移除：dispatch 未覆盖的路径直接报 internal。 */
bindLegacy(
  () => {
    throw new Error("这个 operation 没有可用实现（dispatch 未覆盖）")
  },
  (error: unknown) => ({
    type: "internal",
    message: error instanceof Error ? error.message : String(error),
  }),
)
