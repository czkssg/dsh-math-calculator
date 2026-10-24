/**
 * 宇宙死寂态兜底：当参数让世界不可存在时，给一个体面的收尾。
 *
 * @module dsh-math-calculator/dead-universe
 * @description
 * 方案补丁6：若常数导致原子无法稳定，右侧面板全部灰化，输出定性结语
 * （如「宇宙退化为夸克汤」）。
 *
 * ## 延续用户的定位（2026-10-25）
 *
 * > 插件是给用户圆世界观的，不是去反驳的。
 *
 * 所以措辞不是「你这个设定错了」，而是：
 *   · 「按当前参数，这个宇宙里长不出物质。」
 *   · 「如果你就是想要这样的宇宙，那它本来就是这样，可以写成设定本身。」
 *   · 「如果你想要物质，把这几个参数往这个方向调。」
 *
 * 死寂不是错误，是一种**设定结果**。插件只负责说清它意味着什么。
 */

import type { ChemistryWindow } from './life.js'

/** 死寂判定等级。 */
export type DeadLevel = 'alive' | 'marginal' | 'dead'

/** 一条致命原因。 */
export interface FatalCause {
  id: string
  name: string
  value: string
  physics: string
  epitaph: string
  remedy: string
}

/** 死寂判定结果。 */
export interface DeadVerdict {
  level: DeadLevel
  causes: FatalCause[]
  summary: string
  greyOut: boolean
  note: string
}

/**
 * 判定一个世界是否进入死寂态。
 *
 * 从最底层往上查：化学键 → 溶剂 → 恒星寿命 → 核稳定性。
 *
 * @param world - world 的输出值
 * @returns 判定结果
 */
export function judgeDead(world: any): DeadVerdict {
  const causes: FatalCause[] = []
  const chem: ChemistryWindow | undefined = world?.life?.chemistry

  if (chem) {
    if (chem.verdict === 'bonds-too-weak') {
      causes.push({
        id: 'bonds-weak',
        name: '化学键过弱',
        value: chem.bondEnergyEv.toFixed(3) + ' eV',
        physics: '热扰动 kT 足以打断化学键（稳定性仅 ' + chem.stability.toFixed(1) + ' 倍 kT）',
        epitaph: '这个宇宙里分子一形成就被热运动打散，只有单个原子在飘。',
        remedy: '把 α 调高一些（键能 ∝ α²），或降低温度',
      })
    } else if (chem.verdict === 'bonds-too-strong') {
      causes.push({
        id: 'bonds-strong',
        name: '化学键过强',
        value: chem.bondEnergyEv.toFixed(1) + ' eV',
        physics: '键能太高，分子一旦形成就不再重排，化学失去选择性',
        epitaph: '原子只会紧紧抱住彼此，没有任何反应能改写它们。',
        remedy: '把 α 调低一些，让键能回到 1—10 eV 的反应窗口',
      })
    }
  }

  const temp = world?.temperature
  if (temp && typeof temp.surfaceMeanK === 'number' && typeof temp.freezingPointK === 'number') {
    const meanK = temp.surfaceMeanK
    const boilK = typeof temp.boilingPointK === 'number' ? temp.boilingPointK : 373.15
    if (meanK < temp.freezingPointK) {
      causes.push({
        id: 'frozen',
        name: '全球冻结',
        value: meanK.toFixed(0) + ' K（冰点 ' + temp.freezingPointK.toFixed(0) + ' K）',
        physics: '地表均温低于溶剂冰点，没有液态介质',
        epitaph: '海洋是一整块冰，化学反应只能以极慢的固相扩散进行。',
        remedy: '提高温室效应、拉近轨道、或提高恒星光度',
      })
    } else if (meanK > boilK) {
      causes.push({
        id: 'boiled',
        name: '全球沸腾',
        value: meanK.toFixed(0) + ' K（沸点 ' + boilK.toFixed(0) + ' K）',
        physics: '地表均温高于溶剂沸点，液态介质蒸发',
        epitaph: '海洋被蒸干，剩下一层高压蒸汽与干裂的岩石。',
        remedy: '降低温室效应、拉远轨道、或提高气压把沸点抬上去',
      })
    }
  }

  const stellar = world?.stellar
  if (stellar && typeof stellar.lifetimeGyr === 'number' && stellar.lifetimeGyr < 0.1) {
    causes.push({
      id: 'short-star',
      name: '恒星寿命过短',
      value: stellar.lifetimeGyr.toFixed(3) + ' Gyr',
      physics: '主序寿命不足 1 亿年，来不及演化出复杂化学或生命',
      epitaph: '这个世界的太阳在行星冷却之前就烧完了。',
      remedy: '降低恒星质量（寿命 ∝ M^-2.5）',
    })
  }

  if (chem && typeof chem.alphaRatio === 'number' && chem.alphaRatio > 3) {
    causes.push({
      id: 'nuclei-unstable',
      name: '原子核不稳定',
      value: 'α = ' + chem.alphaRatio.toFixed(1) + ' 倍现实',
      physics: '库仑排斥过强，重核（碳以上）无法束缚质子',
      epitaph: '这个宇宙里只造得出氢和氦，没有碳，也就没有化学。',
      remedy: '把 α 降到现实的 3 倍以内',
    })
  }

  // 分级依据：
  //   · 化学键坏 / 核不稳定 → 真的长不出物质 → dead
  //   · 温度极端（冻结/沸腾）→ 环境恶劣但物质还在（火星均温 210 K 仍有液态卤水）→ marginal
  //
  // 曾经把温度类也算 dead，导致相图里 1.3 AU 之后一片红，与常识不符。
  const hard = causes.filter(function (c) {
    return c.id === 'bonds-weak' || c.id === 'nuclei-unstable'
  })
  const level: DeadLevel = hard.length > 0 ? 'dead' : causes.length > 0 ? 'marginal' : 'alive'
  const greyOut = level === 'dead'

  let summary: string
  if (level === 'alive') {
    summary = '这个世界能长出物质与化学，下游推演可以正常进行。'
  } else if (level === 'marginal') {
    summary = '这个世界的化学或环境很勉强，物质能存在但选择很少。'
  } else {
    summary = '按当前参数，这个宇宙里长不出常规物质。'
  }

  const note = level === 'dead'
    ? '这不是说设定错了。死寂宇宙本身可以是一个设定：' +
      '「这个世界只有等离子体，文明以电磁形式存在」也是一种写法。' +
      '若你想要的其实是普通物质世界，按每条的「若想要物质世界」调即可。'
    : '若你想更极端，可以继续推；想更稳妥，参考各条依据。'

  return { level: level, causes: causes, summary: summary, greyOut: greyOut, note: note }
}

/**
 * 渲染死寂态报告。
 *
 * @param verdict - 判定结果
 * @returns 可读文本
 */
export function renderDead(verdict: DeadVerdict): string {
  const out: string[] = []
  const mark = verdict.level === 'dead' ? '死寂' : verdict.level === 'marginal' ? '勉强' : '正常'
  out.push('═══ 宇宙状态判定：' + mark + ' ═══')
  out.push('')
  out.push('  ' + verdict.summary)
  out.push('')
  if (verdict.causes.length > 0) {
    out.push('【致命原因】')
    for (const cause of verdict.causes) {
      out.push('  · ' + cause.name + '（' + cause.value + '）')
      out.push('    物理依据：' + cause.physics)
      out.push('    参考写法：' + cause.epitaph)
      out.push('    若想要物质世界：' + cause.remedy)
      out.push('')
    }
  }
  if (verdict.greyOut) {
    out.push('【下游面板建议】灰化锁定——生命、生态、文明部分在此宇宙中无对象。', '')
  }
  out.push('注：' + verdict.note)
  return out.join(String.fromCharCode(10))
}
