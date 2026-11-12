/**
 * 跨模块一致性检查（后端整合）。
 *
 * 各模块单独算都对，但彼此可能矛盾：
 *   · 恒星结构算出宜居带 0.95–1.67 AU，行星却在 3 AU —— 没人提醒；
 *   · 历法按"主卫星"定月，但最短周期的是另一颗；
 *   · 行星在宜居带内，生命闸门却因气压判死 —— 作者需要知道这是气压问题。
 *
 * 本模块不重算物理量：输入是各模块已算好的结果，输出 ok / warn / contradiction 三档。
 *
 * @module dsh-math-calculator/features/deduction/integration
 */

/** 检查状态。 */
export type CheckStatus = 'ok' | 'warn' | 'contradiction'

/** 一条跨模块检查。 */
export interface IntegrationCheck {
  id: string
  status: CheckStatus
  title: string
  detail: string
}

/** 检查所需的世界快照（结构化类型，避免与 world 循环依赖）。 */
export interface WorldSnapshot {
  orbitAU: number
  starTempK: number
  stellar: {
    massSun: number
    effectiveTempK: number
    habitableZoneAU: [number, number]
    lifetimeAlphaGyr: number
  }
  moonSystem: {
    moons: Array<{ name: string; periodDays: number }>
    maxMoonCount: number
  }
  calendar: {
    monthsPerYear: number
    daysPerMonth: number
  }
  life: {
    gate: { verdict: 'excluded' | 'constrained' | 'open'; blockers: Array<{ id: string; kind: string }> }
  }
  temperature: { surfaceMeanC: number }
}

/** 百分比格式化。 */
function pct(value: number, digits = 1): string {
  return (value * 100).toFixed(digits) + '%'
}

/**
 * 跑一遍跨模块检查。
 *
 * @param snapshot - 世界快照（各模块已算好的结果）
 * @returns 检查清单
 */
export function checkWorld(snapshot: WorldSnapshot): IntegrationCheck[] {
  const checks: IntegrationCheck[] = []
  const [hzInner, hzOuter] = snapshot.stellar.habitableZoneAU
  const inHz = snapshot.orbitAU >= hzInner && snapshot.orbitAU <= hzOuter

  // 1. 行星轨道 vs 宜居带
  checks.push(
    inHz
      ? {
          id: 'orbit-in-hz',
          status: 'ok',
          title: '轨道在宜居带内',
          detail: snapshot.orbitAU.toFixed(2) + ' AU 落在 ' + hzInner.toFixed(2) + '–' + hzOuter.toFixed(2) + ' AU 之间。',
        }
      : {
          id: 'orbit-in-hz',
          status: 'warn',
          title: '轨道不在宜居带内',
          detail:
            snapshot.orbitAU.toFixed(2) + ' AU 在宜居带 ' + hzInner.toFixed(2) + '–' + hzOuter.toFixed(2) +
            ' AU 之外；这是恒星辐照层面的判断，温室效应可部分补偿，但需要作者说明。',
        },
  )

  // 2. 显式恒星参数 vs 质量-半径关系
  const tempGap = Math.abs(snapshot.stellar.effectiveTempK - snapshot.starTempK) / Math.max(1, snapshot.starTempK)
  checks.push(
    tempGap <= 0.15
      ? {
          id: 'star-consistent',
          status: 'ok',
          title: '恒星参数自洽',
          detail: '显式温度与质量-半径关系相差 ' + pct(tempGap) + '（阈值 15%）。',
        }
      : {
          id: 'star-consistent',
          status: 'warn',
          title: '恒星参数不自洽',
          detail:
            '显式温度 ' + Math.round(snapshot.starTempK) + ' K 与质量-半径关系推出的 ' +
            Math.round(snapshot.stellar.effectiveTempK) + ' K 相差 ' + pct(tempGap) +
            '。若只给了质量，半径/温度会退回太阳值——建议同时给出三项或都不给。',
        },
  )

  // 3. 历法用的哪颗卫星
  const moons = snapshot.moonSystem.moons
  if (moons.length >= 2) {
    const primary = moons[0]
    const shortest = [...moons].sort((a, b) => a.periodDays - b.periodDays)[0]
    const gap = (primary.periodDays - shortest.periodDays) / Math.max(1e-9, primary.periodDays)
    checks.push(
      shortest.name === primary.name || gap < 0.2
        ? {
            id: 'calendar-moon-source',
            status: 'ok',
            title: '历法卫星选择合理',
            detail: '主卫星 ' + primary.name + '（' + primary.periodDays.toFixed(2) + ' 天）与最短周期卫星一致或接近。',
          }
        : {
            id: 'calendar-moon-source',
            status: 'warn',
            title: '历法可能用错了卫星',
            detail:
              '历法按主卫星 ' + primary.name + '（' + primary.periodDays.toFixed(2) + ' 天）计月，' +
              '但最短周期是 ' + shortest.name + '（' + shortest.periodDays.toFixed(2) + ' 天）。' +
              '叙事上通常用最醒目的那颗定月，建议明确选择。',
          },
    )
  }

  // 4. 宜居带内却被生命闸门排除
  if (inHz && snapshot.life.gate.verdict === 'excluded') {
    const hardIds = snapshot.life.gate.blockers.filter((b) => b.kind === 'hard').map((b) => b.id)
    checks.push({
      id: 'hz-vs-life',
      status: 'contradiction',
      title: '在宜居带内但生命被硬否决',
      detail:
        '轨道在宜居带内，但生命闸门给了硬否决（' + hardIds.join(', ') +
        '）。通常意味着气压/化学问题而非温度问题——请确认这是有意设定。',
    })
  } else if (inHz) {
    checks.push({
      id: 'hz-vs-life',
      status: 'ok',
      title: '宜居带与生命闸门不冲突',
      detail: '轨道在宜居带内，生命闸门未给出硬否决。',
    })
  }

  // 5. 卫星数量 vs 容量估算
  if (moons.length > snapshot.moonSystem.maxMoonCount) {
    checks.push({
      id: 'moon-capacity',
      status: 'warn',
      title: '卫星数量超过几何容量',
      detail:
        moons.length + ' 颗 > 估算容量 ' + snapshot.moonSystem.maxMoonCount + ' 颗；需要更小的卫星或特殊形成历史。',
    })
  } else if (moons.length > 0) {
    checks.push({
      id: 'moon-capacity',
      status: 'ok',
      title: '卫星数量在容量内',
      detail: moons.length + ' 颗 ≤ 估算容量 ' + snapshot.moonSystem.maxMoonCount + ' 颗。',
    })
  }

  // 6. 宜居带 vs 表面温度
  if (inHz && (snapshot.temperature.surfaceMeanC < -50 || snapshot.temperature.surfaceMeanC > 100)) {
    checks.push({
      id: 'hz-vs-temperature',
      status: 'warn',
      title: '宜居带内但表面温度极端',
      detail:
        '表面均温 ' + snapshot.temperature.surfaceMeanC.toFixed(0) +
        '°C。宜居带只保证恒星辐照量级，温度差异由温室/反照率解释，请确认大气参数。',
    })
  } else if (inHz) {
    checks.push({
      id: 'hz-vs-temperature',
      status: 'ok',
      title: '宜居带与表面温度一致',
      detail: '表面均温 ' + snapshot.temperature.surfaceMeanC.toFixed(1) + '°C，与恒星辐照量级相符。',
    })
  }

  return checks
}

/**
 * 统计各状态数量。
 *
 * @param checks - 检查清单
 * @returns 各档计数
 */
export function summarizeChecks(checks: IntegrationCheck[]): { ok: number; warn: number; contradiction: number } {
  return {
    ok: checks.filter((c) => c.status === 'ok').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    contradiction: checks.filter((c) => c.status === 'contradiction').length,
  }
}
