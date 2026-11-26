/**
 * 任务分诊（借 ask-matt 的「先选路，再走路」）。
 *
 * ## 为什么插件需要这个
 *
 * 现有的 `WORKFLOW` 是**一条 11 步的推演长流程**，适用于「完整世界推演」。
 * 但真实使用里 80% 的问题是「一个数」「一条公式」「这个账对不对」——
 * 让它们走 11 步是浪费，而且模型会硬套流程。
 *
 * ask-matt 的做法是：**先判断你处在哪条路上，再给那条路**；
 * 并且明确「不属于任何流程时就不套流程」（它的 Standalone 段）。
 *
 * ## 三条路 + 一条直答
 *
 * | 路 | 什么时候走 | 典型入口 |
 * |---|---|---|
 * | **直答** | 单点求值/换算，不需要推演 | evaluate / units / formula |
 * | **对账** | 已有数据，问「对不对/差多少」 | balance / consistency / ledger |
 * | **推演** | 要判断「这个世界会怎样」 | derivation 11 步 |
 * | **查证** | 要看「历史上/现实里是什么」 | earthNode / constants / help |
 *
 * 分诊放在最前：先认路，再走路。走错路的代价是「算了一堆但没回答」。
 *
 * @module dsh-math-calculator/triage
 */
export interface TriageResult {
  /** 命中的路线。 */
  route: 'direct' | 'reconcile' | 'deduce' | 'lookup'
  /** 一句话说明为什么走这条。 */
  why: string
  /** 建议的入口（operation 列表）。 */
  entry: string[]
  /** 这条路上**可以跳过**的步骤（对应 WORKFLOW 的 step 名）。 */
  skip: string[]
}

/**
 * 按用户意图分诊（第一个命中就赢，与 ask-matt 的树一致）。
 *
 * @param text - 用户的话或表达式
 * @returns 分诊结果；完全拿不准时返回 undefined（不强行套流程）
 */
export function triageTask(text: string): TriageResult | undefined {
  const raw = text.trim()
  if (raw === '') return undefined
  const has = (pattern: RegExp): boolean => pattern.test(raw)

  /** ① 对账：已有数据，只问「对不对/差多少」。这是最短路径，优先识别。 */
  if (has(/对账|账目|收支|结余|亏|盈利|利润|差多少|对不对|闭合|一致|冲突/)) {
    return {
      route: 'reconcile',
      why: '你已有数据，问的是「对不对」而不是「会怎样」。',
      entry: ['balance', 'consistency', 'ledger'],
      skip: ['0 立项', '1 变更清单', '2 无量纲化', '3 依赖图', '5 接口卡', '6 正向推演', '7 逆推校准', '8 敏感性', '10 版本发布'],
    }
  }
  /** ② 查证：问「现实/历史里是什么」。 */
  if (has(/历史|当时|哪个时期|国界|地图|地形|矿产|常数是多少|现实|真实|查一下/)) {
    return {
      route: 'lookup',
      why: '你要的是「已有的参照」，不是「推出来的结论」。',
      entry: ['world-map', 'constants', 'help', 'formula'],
      skip: ['0 立项', '1 变更清单', '2 无量纲化', '5 接口卡', '6 正向推演', '7 逆推校准', '8 敏感性'],
    }
  }
  /** ③ 推演：要判断「这个世界会怎样」。关键词是系统性后果。 */
  if (has(/这颗星球|这个世界|气候|宜居|能不能支撑|会怎样|推演|文明|承载力|极限/)) {
    return {
      route: 'deduce',
      why: '你要的是「多因素交叠后的后果」，需要按层推演。',
      entry: ['derivation', 'world', 'feasibility'],
      skip: [],
    }
  }
  /** ④ 直答：单点求值。**默认落到这里**，因为大多数问题是它。 */
  if (has(/[\d+\-*/^%]|算|求|多少|等于/)) {
    return {
      route: 'direct',
      why: '这是一个可直接算出的点，不需要走推演长流程。',
      entry: ['evaluate', 'units', 'formula'],
      skip: ['0 立项', '1 变更清单', '2 无量纲化', '3 依赖图', '4 硬约束筛选', '5 接口卡', '6 正向推演', '7 逆推校准', '8 敏感性', '9 冲突解决', '10 版本发布'],
    }
  }
  /** ⑤ 拿不准就不套流程（对应 ask-matt 的 Standalone）。 */
  return undefined
}

/**
 * 把分诊结果渲染成一行可执行提示。
 *
 * @param result - 分诊结果
 * @returns 提示文本
 */
export function renderTriage(result: TriageResult): string {
  const skipText = result.skip.length === 0 ? '不走 11 步，按需取步' : '可跳过 ' + result.skip.length + ' 步'
  return '【分诊】' + result.why + ' 走 **' + result.route + '** 路线：入口 ' + result.entry.join(' / ') + '（' + skipText + '）。'
}