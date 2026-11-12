/**
 * 白皮书与 Prompt 卡片：把推演结果变成可直接用的设定集。
 *
 * 白皮书只输出**确定性事实**（数值、判定、边界），不写叙事——
 * 那是 AI 与作者的活。所以这里没有「史诗开始了」，只有
 * 「表面重力 1.6 g，化学火箭 Δv 是逃逸速度的 0.97 倍，飞不出去」。
 *
 * @module dsh-math-calculator/features/deduction/whitepaper
 */

import { generateWorld, type WorldDeps } from './world.js'
import { runCivilization, type CivilizationResult } from './civilization.js'
import { judgeDead } from './dead-universe.js'
import { buildTimeline } from './timeline.js'

/** 白皮书。 */
export interface Whitepaper {
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
  civilization: {
    energy: Array<{ name: string; value: string }>
    material: Array<{ name: string; value: string }>
    transport: Array<{ name: string; value: string }>
    ecoCapacity: string
    techOpen: string[]
    techLocked: string[]
  }
  timeline: { habitableYears: string; critical: Array<{ tGyr: number; name: string }> }
  verdicts: { deadLevel: string; note: string }
}

/** Prompt 卡片。 */
export interface PromptCard {
  oneLine: string
  physical: string[]
  capabilities: string[]
  warnings: string[]
}

/** 数值格式化。 */
function num(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e6 || (abs < 1e-2 && abs > 0)) return value.toExponential(2)
  return Number(value.toPrecision(digits + 2)).toString()
}

/**
 * 从世界参数生成白皮书。
 *
 * @param worldParams - 世界参数
 * @param deps - 注入数据
 * @returns 白皮书
 */
export function buildWhitepaper(worldParams: Record<string, unknown> = {}, deps: WorldDeps = {}): Whitepaper {
  const profile = generateWorld(worldParams as never, deps)
  const civ: CivilizationResult = runCivilization(worldParams)
  const dead = judgeDead(profile as unknown as Record<string, unknown>)
  const pick = (category: string): Array<{ name: string; value: string }> =>
    civ.limits.filter((item) => item.category === category).map((item) => ({ name: item.name, value: num(item.value) + ' ' + item.unit }))

  const timeline = buildTimeline({
    starMassSun: typeof worldParams['starMass'] === 'number' ? (worldParams['starMass'] as number) : 1,
    orbitAU: typeof worldParams['orbitAU'] === 'number' ? (worldParams['orbitAU'] as number) : 1,
    steps: 11,
    toGyr: 10,
  })
  const lastHabitable = timeline.points.filter((point) => point.habitable && point.hasAtmosphere).pop()
  const eco = civ.limits.find((item) => item.name === '生态承载力')

  return {
    physical: {
      gravity: profile.planet.surfaceGravity,
      gravityEarth: profile.planet.surfaceGravityEarth,
      dayHours: profile.planet.dayHours,
      meanTempK: profile.temperature.surfaceMeanK,
      pressureAtm: profile.atmosphere.pressureAtm,
      starType: profile.stellar.description,
      starLifetimeGyr: profile.stellar.lifetimeGyr,
      habitableZone: profile.stellar.habitableZoneAU[0].toFixed(2) + '—' + profile.stellar.habitableZoneAU[1].toFixed(2) + ' AU',
    },
    civilization: {
      energy: pick('energy'),
      material: pick('material'),
      transport: pick('transport'),
      ecoCapacity: eco ? (eco.value / 1e8).toFixed(1) + ' 亿人' : '—',
      techOpen: civ.tech.filter((item) => item.status === 'open').map((item) => item.branch),
      techLocked: civ.tech.filter((item) => item.status === 'locked').map((item) => item.branch),
    },
    timeline: {
      habitableYears: lastHabitable ? (lastHabitable.tGyr * 10).toFixed(0) + ' 亿年' : '当前已不在宜居带',
      critical: timeline.critical.map((item) => ({ tGyr: item.tGyr, name: item.name })),
    },
    verdicts: { deadLevel: dead.level, note: dead.summary },
  }
}

/**
 * 渲染白皮书（Markdown）。
 *
 * @param paper - 白皮书
 * @returns Markdown
 */
export function renderWhitepaper(paper: Whitepaper): string {
  const out: string[] = [
    '# 世界物理与文明白皮书',
    '',
    '> 本文件由推演引擎生成，只含确定性事实。叙事与描写由作者/AI 完成。',
    '',
    '## 一、物理底色',
    '',
    '| 项 | 值 |',
    '|---|---|',
    '| 表面重力 | ' + paper.physical.gravity.toFixed(2) + ' m/s²（地球的 ' + paper.physical.gravityEarth.toFixed(2) + ' 倍） |',
    '| 一天时长 | ' + paper.physical.dayHours.toFixed(1) + ' 小时 |',
    '| 全球均温 | ' + paper.physical.meanTempK.toFixed(0) + ' K |',
    '| 海平面气压 | ' + paper.physical.pressureAtm.toFixed(2) + ' atm |',
    '| 恒星 | ' + paper.physical.starType + ' |',
    '| 恒星寿命 | ' + paper.physical.starLifetimeGyr.toFixed(1) + ' Gyr |',
    '| 宜居带 | ' + paper.physical.habitableZone + ' |',
    '',
    '## 二、文明极限',
    '',
  ]
  for (const [label, items] of [['能量', paper.civilization.energy], ['材料', paper.civilization.material], ['交通', paper.civilization.transport]] as Array<[string, Array<{ name: string; value: string }>]>) {
    if (items.length === 0) continue
    out.push('### ' + label, '')
    for (const item of items) out.push('- **' + item.name + '**：' + item.value)
    out.push('')
  }
  out.push('### 生态与科技', '')
  out.push('- 生态承载力：' + paper.civilization.ecoCapacity)
  out.push('- 技术开放：' + (paper.civilization.techOpen.join('、') || '（无）'))
  out.push('- 技术锁死：' + (paper.civilization.techLocked.join('、') || '（无）'))
  out.push('', '## 三、时间尺度', '')
  out.push('- 可居住年限：' + paper.timeline.habitableYears)
  out.push('- 历史临界点：')
  for (const point of paper.timeline.critical) out.push('  - ' + point.tGyr.toFixed(1) + ' Gyr — ' + point.name)
  out.push('', '## 四、状态判定', '')
  out.push('- 宇宙状态：' + paper.verdicts.deadLevel)
  out.push('- ' + paper.verdicts.note)
  out.push('', '---', '', '**注意**：以上是物理约束，不是叙事判决。作者可以决定这个世界的任何走向。')
  return out.join('\n')
}

/**
 * 生成给 AI 的 Prompt 卡片。
 *
 * @param paper - 白皮书
 * @returns 卡片
 */
export function buildPromptCard(paper: Whitepaper): PromptCard {
  const oneLine = '表面重力为地球的 ' + paper.physical.gravityEarth.toFixed(2) + ' 倍、一天 ' + paper.physical.dayHours.toFixed(0) + ' 小时、' + paper.physical.starType.split('：')[0] + ' 的世界。'
  const physical = [
    '重力 ' + paper.physical.gravity.toFixed(2) + ' m/s²（' + paper.physical.gravityEarth.toFixed(2) + ' g）',
    '一天 ' + paper.physical.dayHours.toFixed(1) + ' 小时',
    '均温 ' + paper.physical.meanTempK.toFixed(0) + ' K',
    '气压 ' + paper.physical.pressureAtm.toFixed(2) + ' atm',
    '宜居带 ' + paper.physical.habitableZone,
  ]
  const capabilities: string[] = []
  if (paper.civilization.techOpen.length > 0) capabilities.push('可以做：' + paper.civilization.techOpen.join('、'))
  if (paper.civilization.techLocked.length > 0) capabilities.push('做不到：' + paper.civilization.techLocked.join('、'))
  capabilities.push('生态可承载 ' + paper.civilization.ecoCapacity)

  const warnings: string[] = []
  if (paper.civilization.techLocked.length > 0) {
    warnings.push('这个世界的 ' + paper.civilization.techLocked[0] + ' 被物理锁死——若要写相关情节，需要给出替代技术或外部输入')
  }
  warnings.push('可居住年限 ' + paper.timeline.habitableYears + '，之后会发生不可逆的环境转变')
  return { oneLine, physical, capabilities, warnings }
}

/**
 * 渲染 Prompt 卡片为紧凑文本。
 *
 * @param card - 卡片
 * @returns 紧凑文本
 */
export function renderPromptCard(card: PromptCard): string {
  const out: string[] = ['【世界设定卡】', card.oneLine, '', '硬参数：' + card.physical.join('；'), '']
  for (const line of card.capabilities) out.push(line)
  out.push('', '注意：')
  for (const line of card.warnings) out.push('- ' + line)
  out.push('', '（以上是物理约束。怎么写成故事由你决定，不要把它们当禁令。）')
  return out.join('\n')
}
