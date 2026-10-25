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

/**
 * 死寂判定等级。
 *
 * | 等级 | 含义 |
 * |---|---|
 * | `alive` | 物质与化学成立，下游推演正常 |
 * | `marginal` | 环境恶劣（冻结/沸腾），但物质还在 |
 * | `dead` | 化学键坏 / 核不稳定 —— 长不出常规物质 |
 * | `invalid` | **参数本身不成立**，算出的是 Infinity/NaN/负物理量 |
 *
 * `invalid` 与 `dead` 是两件事，必须分开：
 *   · `dead` 是**设定结果**（死寂宇宙也是一种写法，措辞只讲代价）；
 *   · `invalid` 是**算不出来**（半径为零 → 重力 Infinity），
 *     不是设定问题，是输入问题，要指出哪个参数、怎么改。
 */
export type DeadLevel = 'alive' | 'marginal' | 'dead' | 'invalid'

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
 * 检查世界产物里的物理量是否健全（非有限 / 负值）。
 *
 * 为什么要在渲染前查：`judgeDead` 读的是 `world` 的**输出**，而输出里
 * 有些「数字」其实是格式化后的显示串（`planet.surfaceGravity` 是
 * `'Infinity'` 字符串）。如果不查，`Infinity` 会一路流到 AI 的结语里，
 * 被写成「这颗星球重力是 Infinity」——那比报错更伤可信度。
 *
 * @param world - world 的输出值
 * @returns 不成立的物理量清单（为空表示健全）
 */
export function findPhysicsIssues(world: any): FatalCause[] {
  const issues: FatalCause[] = []
  /**
   * 检查一个可能是数字、也可能是显示串的值。
   *
   * @param label - 中文名
   * @param raw - 原始值
   * @param unit - 单位
   */
  const check = (label: string, raw: unknown, unit: string): void => {
    let num: number | undefined
    if (typeof raw === 'number') num = raw
    else if (typeof raw === 'string') {
      if (raw === 'Infinity' || raw === '-Infinity' || raw === 'NaN') num = Number(raw)
      else {
        const parsed = Number(raw)
        if (Number.isFinite(parsed)) num = parsed
      }
    }
    if (num === undefined) return
    if (Number.isFinite(num) && num > 0) return
    const isNonFinite = !Number.isFinite(num)
    /**
     * 原因里的 `value` 是**给人看的说明**，不是结论数字。
     *
     * 原先直接写成 `String(raw)`，于是 `Infinity` 这个字面量会顺着
     * `verdict.causes` 流到 AI 面前，被当成真数字复述进小说
     * （实测：`summary.verdict.causes[0]` 就是 "表面重力不成立：Infinity m/s²"）。
     * 这里改成中文描述，字面量不再出现在任何响应里。
     */
    const shown = isNonFinite
      ? '算出来是无穷或非数'
      : num < 0
        ? '算出来是负数（' + num + (unit ? ' ' + unit : '') + '）'
        : '算出来是零'
    issues.push({
      id: 'physics-invalid',
      name: label + '不成立',
      value: shown,
      physics: isNonFinite
        ? '这个量算出来是无穷或非数——通常是某个基础参数取了零或负值（如半径为零导致除零）'
        : '这个量算出来不是正数——物理上不成立（如负质量给出负重力）',
      epitaph: '按当前参数，世界的这一环算不出有意义的数字。',
      remedy: '把相关的基础参数改回正常范围（半径、质量、轨道距离取正值即可）',
    })
  }

  check('表面重力', world?.planet?.surfaceGravity, 'm/s²')
  check('逃逸速度', world?.planet?.escapeVelocity, 'km/s')
  check('行星半径', world?.planet?.radiusM, 'm')
  check('年均温', world?.temperature?.surfaceMeanK, 'K')
  check('大气标高', world?.atmosphere?.scaleHeightM, 'm')
  // 有 NaN 时上面的 check 可能因为显示串形态漏掉，补一层全量扫描
  const badLiterals: string[] = []
  const walk = (node: any, path: string): void => {
    if (node === null || node === undefined) return
    if (typeof node === 'string' && (node === 'Infinity' || node === '-Infinity' || node === 'NaN')) {
      badLiterals.push(path + '=' + node)
      return
    }
    if (typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      // 避免把 warnings 里的说明文字也扫进来
      if (key === 'warnings' || key === 'highlights' || key === 'summary') continue
      walk(value, path ? path + '.' + key : key)
    }
  }
  walk(world, '')
  if (badLiterals.length > 0 && issues.length === 0) {
    issues.push({
      id: 'physics-invalid',
      name: '推演产物含无穷或非数',
      value: badLiterals.slice(0, 3).join('、') + (badLiterals.length > 3 ? ' 等 ' + badLiterals.length + ' 处' : ''),
      physics: '有基础参数取了零或负值，导致下游出现除零或开负数',
      epitaph: '按当前参数，世界的这一环算不出有意义的数字。',
      remedy: '把相关的基础参数改回正常范围',
    })
  }
  return issues
}

/**
 * 判定一个世界是否进入死寂态。
 *
 * 从最底层往上查：物理量健全性 → 化学键 → 溶剂 → 恒星寿命 → 核稳定性。
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
  //   · 物理量算不出来（Infinity/NaN/负值）→ invalid（**输入问题**，不是设定问题）
  //   · 化学键坏 / 核不稳定 → 真的长不出物质 → dead
  //   · 温度极端（冻结/沸腾）→ 环境恶劣但物质还在（火星均温 210 K 仍有液态卤水）→ marginal
  //
  // 曾经把温度类也算 dead，导致相图里 1.3 AU 之后一片红，与常识不符。
  //
  // invalid 优先级最高：参数不成立时，下面那些判据读到的都是废数，
  // 继续判 dead/marginal 只会误导作者以为「是设定太极端」。
  const physicsIssues = findPhysicsIssues(world)
  const hard = causes.filter(function (c) {
    return c.id === 'bonds-weak' || c.id === 'nuclei-unstable'
  })
  const level: DeadLevel =
    physicsIssues.length > 0
      ? 'invalid'
      : hard.length > 0
        ? 'dead'
        : causes.length > 0
          ? 'marginal'
          : 'alive'
  const greyOut = level === 'dead' || level === 'invalid'

  // invalid 的原因单独放在最前面，并明确说「这不是设定问题」
  const allCauses = level === 'invalid' ? physicsIssues.concat(causes) : causes

  let summary: string
  if (level === 'invalid') {
    summary = '按当前参数算不出有意义的物理量（出现了无穷或负数），先修正参数才能继续推演。'
  } else if (level === 'alive') {
    summary = '这个世界能长出物质与化学，下游推演可以正常进行。'
  } else if (level === 'marginal') {
    summary = '这个世界的化学或环境很勉强，物质能存在但选择很少。'
  } else {
    summary = '按当前参数，这个宇宙里长不出常规物质。'
  }

  let note: string
  if (level === 'invalid') {
    note = '这不是设定太极端，而是参数本身算不出数——比如把半径写成 0 会导致除零。' +
      '把上面提到的参数改回正常范围，推演就能继续。'
  } else if (level === 'dead') {
    note = '这不是说设定错了。死寂宇宙本身可以是一个设定：' +
      '「这个世界只有等离子体，文明以电磁形式存在」也是一种写法。' +
      '若你想要的其实是普通物质世界，按每条的「若想要物质世界」调即可。'
  } else {
    note = '若你想更极端，可以继续推；想更稳妥，参考各条依据。'
  }

  return {
    level: level,
    causes: allCauses,
    summary: summary,
    greyOut: greyOut,
    note: note,
  }
}

/**
 * 渲染死寂态报告。
 *
 * @param verdict - 判定结果
 * @returns 可读文本
 */
export function renderDead(verdict: DeadVerdict): string {
  const out: string[] = []
  const mark =
    verdict.level === 'dead' ? '死寂'
      : verdict.level === 'marginal' ? '勉强'
        : verdict.level === 'invalid' ? '参数不成立'
          : '正常'
  out.push('═══ 宇宙状态判定：' + mark + ' ═══')
  out.push('')
  out.push('  ' + verdict.summary)
  out.push('')
  if (verdict.causes.length > 0) {
    out.push(verdict.level === 'invalid' ? '【要修的参数】' : '【致命原因】')
    for (const cause of verdict.causes) {
      out.push('  · ' + cause.name + '（' + cause.value + '）')
      out.push('    物理依据：' + cause.physics)
      if (verdict.level !== 'invalid') out.push('    参考写法：' + cause.epitaph)
      out.push('    若想要物质世界：' + cause.remedy)
      out.push('')
    }
  }
  if (verdict.greyOut) {
    out.push(
      verdict.level === 'invalid'
        ? '【下游面板建议】判定为参数不成立，生命、生态、文明部分暂时无对象；修正参数后自动恢复。'
        : '【下游面板建议】灰化锁定——生命、生态、文明部分在此宇宙中无对象。',
      '',
    )
  }
  out.push('注：' + verdict.note)
  return out.join(String.fromCharCode(10))
}
