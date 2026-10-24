/**
 * AI 协作提示词：把「无法穷举」的部分交给 AI。
 *
 * @module dsh-math-calculator/ai-brief
 * @description
 * 用户的判断（2026-10-25）：
 *
 * > 情况多种多样穷举不完，所以兜底需要给 AI 注入提示词让 AI 判断，
 * > 原因结语也可以让模型生产。这些穷举不完的都可以给 AI——
 * > 这是 AI 的插件，好好利用 AI 的能力。
 *
 * ## 分工原则
 *
 * | 交给插件（确定性） | 交给 AI（生成性） |
 * |---|---|
 * | 数值计算、量纲检查 | 结语怎么写 |
 * | 硬约束是否成立 | 这个设定合不合理（叙事判断） |
 * | 区间与概率云 | 该选哪个方案 |
 * | 结构化的判定结果 | 把结果变成读者能读懂的描述 |
 *
 * 插件不做的事：**不用枚举所有情况的结语**。
 * 插件给「结构 + 判据 + 少量范例」，AI 根据具体语境生成。
 */

/**
 * 死寂/异常判定的结构（给 AI 的输入）。
 *
 * AI 拿到这个结构后，自己决定怎么措辞、要不要写成小说片段。
 */
export interface AIDeadBrief {
  /** 判定等级。 */
  level: string
  /** 致命原因（结构化）。 */
  causes: Array<{
    id: string
    name: string
    value: string
    physics: string
  }>
  /** 关键参数快照（AI 可据此自己解释）。 */
  keyParams: Record<string, number>
  /** 插件给出的参考方向（不是答案）。 */
  remedyHints: string[]
}

/**
 * 构建给 AI 的死寂判定提示词。
 *
 * 提示词不写死结语，而是告诉 AI：
 *   · 发生了什么（结构性事实）
 *   · 为什么（物理依据）
 *   · 你可以怎么用（生成结语、写进小说、或提出替代设定）
 *
 * @param brief - 结构化判定结果
 * @returns 提示词文本
 */
export function buildDeadBriefPrompt(brief: AIDeadBrief): string {
  const lines2: string[] = []
  lines2.push('【世界状态判定：' + brief.level + '】')
  lines2.push('');
  if (brief.causes.length === 0) {
    lines2.push('判定：这个世界能长出物质与化学，下游推演可正常进行。');
  } else {
    lines2.push('结构性事实（插件算出的，可直接引用）：');
    for (const cause of brief.causes) {
      lines2.push('- ' + cause.name + '：' + cause.value);
      lines2.push('  物理依据：' + cause.physics);
    }
    lines2.push('');
    lines2.push('关键参数：' + Object.entries(brief.keyParams).map(function (pair) {
      return pair[0] + '=' + pair[1];
    }).join(', '));
    if (brief.remedyHints.length > 0) {
      lines2.push('');
      lines2.push('参数调整方向（仅供参考，不是唯一解）：');
      for (const hint of brief.remedyHints) lines2.push('- ' + hint);
    }
  }
  lines2.push('');
  lines2.push('你的任务（AI）：');
  lines2.push('1. 用一段有画面感的文字描述这个世界的状态——要写成读者能读懂的，');
  lines2.push('   不要照抄上面的物理术语。');
  lines2.push('2. 如果用户想要的是别的效果，指出该调哪几个参数、朝哪个方向。');
  lines2.push('3. 如果用户就是想要这样的世界，把它当作设定来写，不要说「这不合理」。');
  return lines2.join(String.fromCharCode(10));
}

/**
 * 构建给 AI 的综合推演提示词：告诉 AI 手上有哪些能力、该怎么配合。
 *
 * 这是插件对 AI 的「能力说明」，让 AI 知道不必什么都自己算，
 * 也不必什么都问用户——该算的调工具，该写的自己写。
 *
 * @returns 提示词文本
 */
export function buildCapabilityPrompt(): string {
  const lines2: string[] = []
  lines2.push('【世界推演工具的使用分工】');
  lines2.push('');
  lines2.push('你要算的，交给 derivation（确定性，可引用）：');
  lines2.push('  pipeline      正向推演 P1→P5，看世界观在哪层受阻');
  lines2.push('  backSolve     逆推：给叙事锚点反推参数窗口');
  lines2.push('  civilization  能量/材料/交通/技术树极限');
  lines2.push('  dead          判定宇宙是否死寂');
  lines2.push('  observer      切换观测者重算体感（人择选择效应）');
  lines2.push('  chaos         Lyapunov 超限时给概率云而非假精确值');
  lines2.push('  fantasy       幻想量与等价现实量（只提醒不判定）');
  lines2.push('  custom        定义自创常数与新物理量');
  lines2.push('  archive       存七张表、版本对比');
  lines2.push('');
  lines2.push('你要写的，不要调工具（生成性，AI 更擅长）：');
  lines2.push('  · 结语、描写、把数字译成读者能懂的话');
  lines2.push('  · 判断某个设定在叙事上合不合适');
  lines2.push('  · 在多个可行方案里替用户挑一个');
  lines2.push('  · 用户没想清楚的地方，主动问，而不是硬算');
  lines2.push('');
  lines2.push('重要：插件不做穷举。它给的是结构和判据，');
  lines2.push('具体怎么表达、写成什么样，是你的活。');
  return lines2.join(String.fromCharCode(10));
}

/**
 * 构建「该问用户什么」的提示词。
 *
 * 有些东西插件算不出来但 AI 可以问出来——这比硬猜有用。
 *
 * @returns 提示词文本
 */
export function buildAskUserPrompt(): string {
  const lines2: string[] = []
  lines2.push('【何时该问用户，而不是硬算】');
  lines2.push('');
  lines2.push('插件算不出来的，别编数字，去问：');
  lines2.push('  · 这是给读者看的硬设定，还是背景板？（决定精度）');
  lines2.push('  · 观测者是谁？（人类 / 本地生物 / 上帝视角，会影响全部体感结论）');
  lines2.push('  · 哪些是「必须成立」的叙事锚点，哪些可以妥协？');
  lines2.push('  · 这个世界你更想要哪种张力？（资源稀缺 / 环境险恶 / 技术被锁死）');
  lines2.push('');
  lines2.push('问法则：一次问 1-2 个，别列问卷。先给出你算出的东西，再问。');
  return lines2.join(String.fromCharCode(10));
}
