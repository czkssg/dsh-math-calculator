/**
 * 推演指令集：给 AI 的作战手册。
 *
 * @module dsh-math-calculator/playbook
 * @description
 * ## 顶层架构（用户 2026-10-25 定稿）
 *
 *   确定性底座 + AI 开放层
 *
 * | 确定性部分（插件算） | AI 部分（模型做） |
 * |---|---|
 * | 基础计算模块 | 情况判断 |
 * | 常数表 | 兜底处理 |
 * | 公式库 | 原因生成 |
 * | 可枚举的硬规则 | 结语生成 |
 * |  | 所有「穷举不完、列不完」的开放边界 |
 *
 * **插件本体不是写死分支逻辑，而是给 AI 注入一套推演指令集，
 * 让它调用底座能力做判断和生成。**
 *
 * ## 为什么这样设计
 *
 * 写死分支的问题：每种情况一条 if、一句结语——而世界的可能性是无穷的。
 * 第 28 种情况永远有人能想出来，插件永远追不上。
 *
 * 所以本模块**不产生任何结语**，只描述：
 *   ① 底座有哪些能力（可枚举的清单）；
 *   ② 每种能力该怎么用、什么时候用；
 *   ③ 哪些事插件不做、必须交给 AI；
 *   ④ 判据（什么算硬约束、什么算叙事选择）。
 */

import { currentWorkspace, loadWorkspace, updateWorkspace } from './workspace.js'

/** 底座的一项能力。 */
export interface BaseCapability {
  /** 调用方式。 */
  call: string
  /** 确定性地产出什么。 */
  produces: string
  /** 什么时候该用它。 */
  when: string
  /** 它不管什么（明确边界）。 */
  doesNot: string
}

/** 确定性底座清单。 */
export const BASE_CAPABILITIES: BaseCapability[] = [
  {
    call: 'evaluate / solve / derivative / integral / matrix / stats',
    produces: '数值结果与可信度标签',
    when: '任何需要精确数字的地方',
    doesNot: '不解释数字的意义',
  },
  {
    call: 'formula / formulas（342 条）',
    produces: '带适用域的自然科学公式求值',
    when: '需要标准物理量（重力、标高、恒星寿命等）',
    doesNot: '不判断这个值在故事里合适不合适',
  },
  {
    call: 'world',
    produces: '星球体感画像、天空配色、恒星结构、卫星、生命闸门',
    when: '要一个完整世界的物理底色',
    doesNot: '不写世界的文化、历史、人物',
  },
  {
    call: 'derivation → pipeline',
    produces: 'P1—P5 逐层判定（允许/边缘/禁止）',
    when: '要知道设定在哪一层受阻',
    doesNot: '不告诉你该改哪一层（那要综合叙事判断）',
  },
  {
    call: 'derivation → backSolve',
    produces: '从叙事锚点反推的参数窗口',
    when: '有「必须有某效果」的诉求（如 50 米巨兽）',
    doesNot: '不判断这个诉求是否值得保留',
  },
  {
    call: 'derivation → civilization',
    produces: '能量/材料/交通/技术树的极限值与锁死/开放状态',
    when: '要判断这个物理下文明能走多远',
    doesNot: '不写文明的社会形态',
  },
  {
    call: 'derivation → observer',
    produces: '切换观测者后的体感重算与能力过滤',
    when: '世界里有非人类智慧生物',
    doesNot: '不判断这种生物该有什么文化',
  },
  {
    call: 'derivation → dead',
    produces: '死寂判定的结构化原因与关键参数',
    when: '怀疑参数把世界推到不可能',
    doesNot: '不生成结语——那是 AI 的活',
  },
  {
    call: 'derivation → chaos',
    produces: 'Lyapunov 判定与概率云区间',
    when: '要算的量本身不可预测（天气、三体）',
    doesNot: '不给确定数值（那是骗人）',
  },
  {
    call: 'derivation → fantasy',
    produces: '幻想量的等价现实量（人力/食物/散热）',
    when: '世界有灵能、魔法等超出物理的设定',
    doesNot: '不判断这个设定合不合理',
  },
  {
    call: 'custom',
    produces: '自创常数/新物理量的定义与量纲校验',
    when: '现有物理做不出想要的效果，需要引入新量',
    doesNot: '不判断这个新量在故事里说得通不通',
  },
  {
    call: 'derivation → archive / history / compare',
    produces: '七张表持久化与版本差异',
    when: '改了参数想对比前后结论',
    doesNot: '不判断哪个版本更好',
  },
]

/** AI 必须接手的事。 */
export interface AIDuty {
  /** 职责。 */
  duty: string
  /** 为什么插件不做。 */
  why: string
  /** 做得好是什么样。 */
  good: string
}

/** AI 职责清单。 */
export const AI_DUTIES: AIDuty[] = [
  {
    duty: '把数字译成读者能懂的话',
    why: '同一个重力 1.6g，可以是压迫感、异星感、或者「这里的人都很矮」——语境决定',
    good: '给出画面，而不是重复数值',
  },
  {
    duty: '生成结语 / 定性描述',
    why: '穷举不完。每换一种死法都该有新的写法',
    good: '具体、有画面、贴合用户的世界观，而非套模板',
  },
  {
    duty: '判断设定在叙事上合不合适',
    why: '这是价值判断，插件没有立场',
    good: '说清取舍（保留它要付什么代价），把选择权交回用户',
  },
  {
    duty: '在多个可行方案里挑一个',
    why: '插件能列出候选，但不知道用户更在乎什么',
    good: '列出 2-3 个方案与各自代价，让用户选',
  },
  {
    duty: '兜底：插件没覆盖的情况',
    why: '世界可能性无穷，插件的规则集必然不全',
    good: '承认「这个情况插件没算」，用通用物理原则自己推，标注这是估计',
  },
  {
    duty: '问对问题',
    why: '很多关键信息只有用户知道（这是给谁看的、什么必须成立）',
    good: '一次问 1-2 个，先给算出的东西再问',
  },
]

/** 判据：什么算硬约束、软约束、叙事选择。 */
export const VERDICT_RULES = {
  hard: [
    '原子/分子无法稳定存在',
    '没有液态介质',
    '恒星寿命不足以演化',
    '能量守恒被违反（永动机）',
    '量纲不自洽',
  ],
  soft: [
    '生物形态受限',
    '材料选择受限',
    '城市尺度受限',
    '技术路径被锁死（但可换路径）',
  ],
  narrative: [
    '要有巨兽',
    '要有长寿命文明',
    '要有灵能或魔法',
    '要有特定的社会形态',
  ],
}

/** 冲突处理优先级。 */
export const CONFLICT_PRIORITY = [
  '硬约束（违反则世界不可存在）',
  '核心叙事锚点（用户明说必须成立的）',
  '软约束（可适应但有代价）',
  '细节设定（最后才动）',
];

/** 工作流顺序（方案的 0—10 步，压缩成 AI 可执行的样子）。 */
export const WORKFLOW: Array<{ step: string; do: string; skip: string }> = [
  { step: '0 立项', do: '确认推演类型（叙事级/区域级/硬自洽级）与观测者', skip: '用户已说清时跳过' },
  { step: '1 变更清单', do: '记录改了哪些参数、每项怎么处理', skip: '没改参数时跳过' },
  { step: '2 无量纲化', do: 'derivation → dimensionless，看真正的变化', skip: '只改环境参数时跳过' },
  { step: '3 依赖图', do: '推导链条（哪层影响哪层）', skip: '单点问题不需要' },
  { step: '4 硬约束筛选', do: 'derivation → pipeline 或 dead，排除禁区', skip: '绝不跳过' },
  { step: '5 接口卡', do: 'derivation → cards，每层 5—10 个变量', skip: '深度推演才需要' },
  { step: '6 正向推演', do: 'derivation → pipeline，P1 到 P5', skip: '绝不跳过' },
  { step: '7 逆推校准', do: 'derivation → backSolve，从锚点反推窗口', skip: '有「必须有」的诉求时才用' },
  { step: '8 敏感性', do: 'derivation → sensitivity 或 phase', skip: '参数接近边界时才需要' },
  { step: '9 冲突解决', do: '按 CONFLICT_PRIORITY 排序取舍', skip: '没冲突时跳过' },
  { step: '10 版本发布', do: 'derivation → archive，留一版', skip: '用户只要一个答案时可以不做' },
];

/**
 * 生成给 AI 的推演指令集。
 *
 * 核心：**不是固定模板，而是按工作区实际状态定制**。
 * 例如用户改过常数就提醒先做无量纲检查；有自创量就提醒要参与判定；
 * 有历史档案就提醒可以对比上一版；什么都没做就只给最小指令。
 *
 * @param state - 工作区状态快照
 * @returns 提示词文本
 */
export function buildPlaybook(state: {
  workspace?: string
  changedConstants?: string[]
  customConstants?: number
  customFormulas?: number
  hasArchive?: boolean
}): string {
  const out: string[] = []
  out.push('## 世界推演指令集')
  out.push('')
  out.push('**架构：确定性底座 + AI 开放层。** 底座算数，你负责判断与表达。')
  out.push('插件不写死分支逻辑，也不穷举结语——那是你的活。')
  out.push('')
  out.push('### 底座能给你什么（可直接引用）')
  for (const cap of BASE_CAPABILITIES) {
    out.push('- `' + cap.call + '` → ' + cap.produces)
    out.push('  用在：' + cap.when + '；不管：' + cap.doesNot)
  }
  out.push('')
  out.push('### 你必须接手的（插件刻意不做）')
  for (const duty of AI_DUTIES) {
    out.push('- **' + duty.duty + '**')
    out.push('  因为：' + duty.why)
    out.push('  做好是这样：' + duty.good)
  }
  out.push('')
  out.push('### 判据（别把叙事选择当硬约束）')
  out.push('- 硬约束：' + VERDICT_RULES.hard.join('；'))
  out.push('- 软约束：' + VERDICT_RULES.soft.join('；'))
  out.push('- 叙事选择：' + VERDICT_RULES.narrative.join('；'))
  out.push('')
  out.push('冲突时按这个顺序：' + CONFLICT_PRIORITY.join(' > '))
  out.push('')

  const dynamic: string[] = []
  if (state.changedConstants && state.changedConstants.length > 0) {
    dynamic.push('当前工作区改动了常数（' + state.changedConstants.slice(0, 5).join(', ') +
      '）。先调 `derivation → dimensionless` 确认这是真实物理变化，而不是单位重定义。')
  }
  if ((state.customConstants ?? 0) > 0) {
    dynamic.push('本区有 ' + state.customConstants + ' 个自创物理量——它们能参与判定，' +
      '但它们与现有物理的关系是否讲得通，要你自己判断（插件只保证量纲自洽）。')
  }
  if ((state.customFormulas ?? 0) > 0) {
    dynamic.push('本区有 ' + state.customFormulas + ' 条自定义公式，结果以工具输出为准，不要自己重算。')
  }
  if (state.hasArchive) {
    dynamic.push('本区已有推演档案：改完参数可调 `derivation → compare` 看前后差异，' +
      '并把「哪些判定翻转了」讲给用户。')
  }
  if (dynamic.length > 0) {
    out.push('### 当前工作区的具体提醒')
    for (const line of dynamic) out.push('- ' + line)
    out.push('')
  }

  out.push('### 工作流（按需跳步，不必全走）')
  for (const item of WORKFLOW) {
    out.push('- ' + item.step + '：' + item.do + '（' + item.skip + '）')
  }
  out.push('')
  out.push('### 两条底线')
  out.push('1. **不要反驳用户的设定。** 插件指出「按这个参数会怎样」，你转述，并给出「想保留的话可以怎么调」。')
  out.push('2. **不要编数字。** 算不出来的（混沌、超出现有物理、插件没覆盖的），标待定或问用户。')
  return out.join(String.fromCharCode(10))
}

/**
 * 最小指令集（promptMode=brief 时用，控制在十几行内）。
 *
 * @param state - 工作区状态
 * @returns 精简提示词
 */
export function buildBriefPlaybook(state: {
  changedConstants?: string[]
  customConstants?: number
}): string {
  const out: string[] = []
  out.push('**世界推演：底座算数，你判断与表达。**')
  out.push('- 该算的调 `derivation`（pipeline/civilization/dead/observer/backSolve/chaos）与 `custom`')
  out.push('- 该写的（结语、描写、叙事判断）由你生成，别照抄工具输出')
  out.push('- 硬约束（物质不存在等）如实说；叙事选择（要巨兽、要灵能）不反驳，只讲代价')
  out.push('- 算不出来的别编，标待定或问用户')
  if ((state.changedConstants ?? []).length > 0) {
    out.push('- 本区改过常数，先跑 dimensionless 确认不是单位重定义')
  }
  if ((state.customConstants ?? 0) > 0) {
    out.push('- 本区有自创量，它们与现有物理的关系要你判断')
  }
  return out.join(String.fromCharCode(10))
}

/** 可自定义的指令集配置。 */
export interface PlaybookConfig {
  /** 追加自定义硬约束。 */
  extraHardConstraints?: string[]
  /** 追加自定义软约束。 */
  extraSoftConstraints?: string[]
  /** 追加自定义叙事选择。 */
  extraNarrative?: string[]
  /** 自定义工作流（整批替换默认 11 步）。 */
  customWorkflow?: Array<{ step: string; do: string; skip: string }>
  /** 关闭某些底座能力的说明（减少提示词长度）。 */
  disabledCapabilities?: string[]
  /** 追加 AI 职责。 */
  extraDuties?: Array<{ duty: string; why: string; good: string }>
}

/** 读配置（存在工作区里）。 */
export function loadPlaybookConfig(): PlaybookConfig {
  try {
    const data = loadWorkspace(currentWorkspace())
    return (data as any).playbookConfig ?? {}
  } catch {
    return {}
  }
}

/** 写配置。 */
export function savePlaybookConfig(config: PlaybookConfig): void {
  updateWorkspace(currentWorkspace(), function (current) {
    return { ...current, playbookConfig: config } as never
  })
}

/**
 * 合并默认配置与用户自定义。
 *
 * 用户可以在工作区里改：加自己的硬约束/软约束/叙事选择、
 * 替换整套工作流、关闭不需要的能力说明、加自己的 AI 职责。
 *
 * @param config - 用户配置
 * @returns 合并后的配置
 */
export function mergePlaybookConfig(config: PlaybookConfig = {}): {
  hard: string[]
  soft: string[]
  narrative: string[]
  workflow: Array<{ step: string; do: string; skip: string }>
  capabilities: BaseCapability[]
  duties: AIDuty[]
} {
  const disabled = new Set(config.disabledCapabilities ?? [])
  return {
    hard: VERDICT_RULES.hard.concat(config.extraHardConstraints ?? []),
    soft: VERDICT_RULES.soft.concat(config.extraSoftConstraints ?? []),
    narrative: VERDICT_RULES.narrative.concat(config.extraNarrative ?? []),
    workflow: (config.customWorkflow && config.customWorkflow.length > 0)
      ? config.customWorkflow
      : WORKFLOW,
    capabilities: BASE_CAPABILITIES.filter(function (cap) {
      return !disabled.has(cap.call)
    }),
    duties: AI_DUTIES.concat(config.extraDuties ?? []),
  }
}

/**
 * 生成带用户配置的指令集。
 *
 * @param state - 工作区状态
 * @returns 提示词文本
 */
export function buildConfiguredPlaybook(state: {
  workspace?: string
  changedConstants?: string[]
  customConstants?: number
  customFormulas?: number
  hasArchive?: boolean
}): string {
  const merged = mergePlaybookConfig(loadPlaybookConfig())
  const out: string[] = []
  out.push('## 世界推演指令集')
  out.push('')
  out.push('**架构：确定性底座 + AI 开放层。** 底座算数，你负责判断与表达。')
  out.push('')
  out.push('### 底座能给你什么（可直接引用）')
  for (const cap of merged.capabilities) {
    out.push('- `' + cap.call + '` → ' + cap.produces)
    out.push('  用在：' + cap.when + '；不管：' + cap.doesNot)
  }
  out.push('')
  out.push('### 你必须接手的')
  for (const duty of merged.duties) {
    out.push('- **' + duty.duty + '**：' + duty.why)
  }
  out.push('')
  out.push('### 判据')
  out.push('- 硬约束：' + merged.hard.join('；'))
  out.push('- 软约束：' + merged.soft.join('；'))
  out.push('- 叙事选择：' + merged.narrative.join('；'))
  out.push('')
  out.push('### 工作流')
  for (const item of merged.workflow) {
    out.push('- ' + item.step + '：' + item.do + '（' + item.skip + '）')
  }
  out.push('')
  out.push('### 底线')
  out.push('1. 不要反驳用户的设定——说清「按这个参数会怎样」，并给出「想保留可以怎么调」。')
  out.push('2. 不要编数字——算不出来的标待定或问用户。')
  return out.join(String.fromCharCode(10))
}
