/**
 * 白皮书与 Prompt 投射：把推演结果变成可直接用的设定集。
 *
 * @module dsh-math-calculator/whitepaper
 * @description
 * 方案补丁8。推演算了一大堆数字，但作者真正要的是两样东西：
 *
 * | 产物 | 给谁看 | 形式 |
 * |---|---|---|
 * | **白皮书** | 人 | 结构化长文档，能直接读、能当设定集 |
 * | **AI Prompt** | 模型 | 压缩后的设定卡片，可直接注入对话 |
 *
 * ## 编排原则（延续「确定性底座 + AI 开放层」）
 *
 * 白皮书只输出**确定性事实**（数值、判定、边界），
 * **不写叙事**——那是 AI 与作者的活。
 *
 * 所以这里没有一句「这支文明的史诗开始了」，
 * 只有「表面重力 1.6 g，化学火箭 Δv 是逃逸速度的 0.97 倍，飞不出去」。
 */

import { opWorld } from './ops/world-op.js'
import { runCivilization } from './civilization.js'
import { ecosystemFromWorld } from './ecosystem.js'
import { judgeDead } from './dead-universe.js'
import { OBSERVERS, perceive } from './observer.js'
import { buildTimeline } from './timeline.js'

/** 白皮书的三个部分。 */
export interface Whitepaper {
  /** 物理底色。 */
  physical: {
    gravity: number
    gravityEarth: number
    dayHours: number
    meanTempK: number
    pressureAtm: number
    starType: string
    starLifetimeGyr: number
    habitableZone: string
  }
  /** 文明极限。 */
  civilization: {
    energy: Array<{ name: string; value: string }>
    material: Array<{ name: string; value: string }>
    transport: Array<{ name: string; value: string }>
    ecoCapacity: string
    techOpen: string[]
    techLocked: string[]
  }
  /** 时间尺度。 */
  timeline: {
    habitableYears: string
    critical: Array<{ tGyr: number; name: string }>
  }
  /** 判定与提醒。 */
  verdicts: {
    deadLevel: string
    note: string
  }
}

/** Prompt 卡片（压缩版，给 AI 用）。 */
export interface PromptCard {
  /** 一句话世界定位。 */
  oneLine: string
  /** 物理硬参数。 */
  physical: string[]
  /** 文明能做什么、不能做什么。 */
  capabilities: string[]
  /** 该注意的坑。 */
  warnings: string[]
}

/**
 * 从世界参数生成白皮书。
 *
 * @param worldParams - 世界参数
 * @returns 白皮书
 */
export function buildWhitepaper(worldParams: Record<string, unknown> = {}): Whitepaper {
  const world = (opWorld({ world: worldParams } as never, 32) as any).value || {}
  const civ = runCivilization(worldParams)
  const eco = ecosystemFromWorld(world)
  const dead = judgeDead(world)

  const num = function (v: number, digits = 2): string {
    if (!Number.isFinite(v)) return '—'
    const abs = Math.abs(v)
    if (abs >= 1e6 || (abs < 1e-2 && abs > 0)) return v.toExponential(2)
    return Number(v.toPrecision(digits + 2)).toString()
  }

  // 物理底色
  const planet = world.planet || {}
  const temp = world.temperature || {}
  const atm = world.atmosphere || {}
  const stellar = world.stellar || {}

  // 文明极限：按类别筛
  const pick = function (category: string): Array<{ name: string; value: string }> {
    return civ.limits
      .filter(function (item) { return item.category === category })
      .map(function (item) { return { name: item.name, value: num(item.value) + ' ' + item.unit } })
  }

  // 时间尺度：宜居年限
  const timeline = buildTimeline({
    starMassSun: typeof worldParams.starMass === 'number' ? (worldParams.starMass as number) : 1,
    orbitAU: typeof worldParams.orbitAU === 'number' ? (worldParams.orbitAU as number) : 1,
    steps: 11,
    toGyr: 10,
  })
  const lastHabitable = timeline.points.filter(function (p) { return p.habitable && p.hasAtmosphere }).pop()

  return {
    physical: {
      gravity: planet.surfaceGravity ?? 0,
      gravityEarth: planet.surfaceGravityEarth ?? 1,
      dayHours: planet.dayHours ?? 24,
      meanTempK: temp.surfaceMeanK ?? 0,
      pressureAtm: atm.pressureAtm ?? 1,
      starType: stellar.description ?? '未知',
      starLifetimeGyr: stellar.lifetimeGyr ?? 10,
      habitableZone: stellar.habitableZoneAU && Array.isArray(stellar.habitableZoneAU)
        ? stellar.habitableZoneAU[0].toFixed(2) + '—' + stellar.habitableZoneAU[1].toFixed(2) + ' AU'
        : '—',
    },
    civilization: {
      energy: pick('energy'),
      material: pick('material'),
      transport: pick('transport'),
      ecoCapacity: (eco.carryingCapacity / 1e8).toFixed(1) + ' 亿人',
      techOpen: civ.tech.filter(function (t) { return t.status === 'open' }).map(function (t) { return t.branch }),
      techLocked: civ.tech.filter(function (t) { return t.status === 'locked' }).map(function (t) { return t.branch }),
    },
    timeline: {
      habitableYears: lastHabitable ? (lastHabitable.tGyr * 10).toFixed(0) + ' 亿年' : '当前已不在宜居带',
      critical: timeline.critical.map(function (c) { return { tGyr: c.tGyr, name: c.name } }),
    },
    verdicts: {
      deadLevel: dead.level,
      note: dead.summary,
    },
  }
}

/**
 * 生成可读的白皮书文档。
 *
 * @param paper - buildWhitepaper 的结果
 * @returns Markdown 文本
 */
export function renderWhitepaper(paper: Whitepaper): string {
  const out: string[] = []
  out.push('# 世界物理与文明白皮书')
  out.push('')
  out.push('> 本文件由推演引擎生成，只含确定性事实。叙事与描写由作者/AI 完成。')
  out.push('')

  out.push('## 一、物理底色')
  out.push('')
  out.push('| 项 | 值 |')
  out.push('|---|---|')
  out.push('| 表面重力 | ' + paper.physical.gravity.toFixed(2) + ' m/s²（地球的 ' +
    paper.physical.gravityEarth.toFixed(2) + ' 倍） |')
  out.push('| 一天时长 | ' + paper.physical.dayHours.toFixed(1) + ' 小时 |')
  out.push('| 全球均温 | ' + paper.physical.meanTempK.toFixed(0) + ' K |')
  out.push('| 海平面气压 | ' + paper.physical.pressureAtm.toFixed(2) + ' atm |')
  out.push('| 恒星 | ' + paper.physical.starType + ' |')
  out.push('| 恒星寿命 | ' + paper.physical.starLifetimeGyr.toFixed(1) + ' Gyr |')
  out.push('| 宜居带 | ' + paper.physical.habitableZone + ' |')
  out.push('')

  out.push('## 二、文明极限')
  out.push('')
  for (const group of [['能量', paper.civilization.energy], ['材料', paper.civilization.material],
    ['交通', paper.civilization.transport]] as Array<[string, Array<{ name: string; value: string }>]>) {
    if (group[1].length === 0) continue
    out.push('### ' + group[0])
    out.push('')
    for (const item of group[1]) out.push('- **' + item.name + '**：' + item.value)
    out.push('')
  }
  out.push('### 生态与科技')
  out.push('')
  out.push('- 生态承载力：' + paper.civilization.ecoCapacity)
  out.push('- 技术开放：' + (paper.civilization.techOpen.join('、') || '（无）'))
  out.push('- 技术锁死：' + (paper.civilization.techLocked.join('、') || '（无）'))
  out.push('')

  out.push('## 三、时间尺度')
  out.push('')
  out.push('- 可居住年限：' + paper.timeline.habitableYears)
  out.push('- 历史临界点：')
  for (const point of paper.timeline.critical) {
    out.push('  - ' + point.tGyr.toFixed(1) + ' Gyr — ' + point.name)
  }
  out.push('')

  out.push('## 四、状态判定')
  out.push('')
  out.push('- 宇宙状态：' + paper.verdicts.deadLevel)
  out.push('- ' + paper.verdicts.note)
  out.push('')
  out.push('---')
  out.push('')
  out.push('**注意**：以上是物理约束，不是叙事判决。作者可以决定这个世界的任何走向。')
  return out.join(String.fromCharCode(10))
}

/**
 * 生成给 AI 的 Prompt 卡片（压缩版）。
 *
 * 与白皮书的区别：这个更短、更适合注入对话上下文。
 *
 * @param paper - buildWhitepaper 的结果
 * @returns Prompt 卡片
 */
export function buildPromptCard(paper: Whitepaper): PromptCard {
  const oneLine = '表面重力为地球的 ' + paper.physical.gravityEarth.toFixed(2) +
    ' 倍、一天 ' + paper.physical.dayHours.toFixed(0) + ' 小时、' +
    paper.physical.starType.split('：')[0] + ' 的世界。'

  const physical: string[] = [
    '重力 ' + paper.physical.gravity.toFixed(2) + ' m/s²（' + paper.physical.gravityEarth.toFixed(2) + ' g）',
    '一天 ' + paper.physical.dayHours.toFixed(1) + ' 小时',
    '均温 ' + paper.physical.meanTempK.toFixed(0) + ' K',
    '气压 ' + paper.physical.pressureAtm.toFixed(2) + ' atm',
    '宜居带 ' + paper.physical.habitableZone,
  ]

  const capabilities: string[] = []
  if (paper.civilization.techOpen.length > 0) {
    capabilities.push('可以做：' + paper.civilization.techOpen.join('、'))
  }
  if (paper.civilization.techLocked.length > 0) {
    capabilities.push('做不到：' + paper.civilization.techLocked.join('、'))
  }
  capabilities.push('生态可承载 ' + paper.civilization.ecoCapacity)

  const warnings: string[] = []
  if (paper.civilization.techLocked.length > 0) {
    warnings.push('这个世界的 ' + paper.civilization.techLocked[0] + ' 被物理锁死——' +
      '若要写相关情节，需要给出替代技术或外部输入')
  }
  warnings.push('可居住年限 ' + paper.timeline.habitableYears + '，' +
    '之后会发生不可逆的环境转变')

  return {
    oneLine: oneLine,
    physical: physical,
    capabilities: capabilities,
    warnings: warnings,
  }
}

/**
 * 渲染 Prompt 卡片为紧凑文本（适合注入）。
 *
 * @param card - buildPromptCard 的结果
 * @returns 紧凑文本
 */
export function renderPromptCard(card: PromptCard): string {
  const out: string[] = []
  out.push('【世界设定卡】')
  out.push(card.oneLine)
  out.push('')
  out.push('硬参数：' + card.physical.join('；'))
  out.push('')
  for (const line of card.capabilities) out.push(line)
  out.push('')
  out.push('注意：')
  for (const line of card.warnings) out.push('- ' + line)
  out.push('')
  out.push('（以上是物理约束。怎么写成故事由你决定，不要把它们当禁令。）')
  return out.join(String.fromCharCode(10))
}
