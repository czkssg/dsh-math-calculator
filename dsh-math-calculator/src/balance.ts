/**
 * 收支平衡与最短板：这个势力到底撑不撑得住。
 *
 * ## 为什么要有这一层
 *
 * 插件此前能算**单项上限**（`feasibility.ts` 的「城市人口上限」「帝国控制半径」、
 * `civilization.ts` 的「生态承载力」），但答不了作者最常问的那种问题：
 *
 *   「我这个王国，两百万人口、二十万兵，养得起吗？」
 *
 * 因为这类问题不是「某一项超没超」，而是**几项一起看、最紧的那一项说了算**。
 * 就像木桶：粮食够、水够、但军费占财政 150%，那这个国家就是撑不住，
 * 无论其它项多宽松。
 *
 * 这对应 WorldForge-Q 方案 FR-07 的 `K = min(K粮, K水, K能, K地, K污染)`。
 * 但实现取向不同：那一版要「七模块耦合 + 100—300 年时间步」，
 * 这一版只要**一次静态收支盘点 + 最短板**——不给演化曲线，只回答
 * 「此刻最紧的是哪一项、缺多少」。
 *
 * ## 设计要点
 *
 * 1. **只报缺口，不报「错误」**：某项不够时，说「缺 30%，要么加税要么裁军」，
 *    不说「你的设定不成立」。设定是作者的，代价是物理的。
 * 2. **最短板唯一**：`K = min(...)`，且给出是哪一项、缺口多少。
 * 3. **检查项可选**：作者只关心粮食时不必填军费；未填的项不参与最短板，
 *    但**明确列出「没检查的项」**，避免造成「全都查过了」的错觉。
 * 4. **单位口径要一致**：财政类全部折算成「同一口径」，否则占比无意义。
 *
 * @module dsh-math-calculator/balance
 */

/** 一项收支的输入。 */
export interface BalanceItem {
  /** 需求方有多少（需求量）。 */
  demand: number
  /** 能提供多少（供给量）。 */
  supply: number
  /** 这叫什么（中文名，如「粮食」）。 */
  label: string
  /** 单位（如「kg/年」）。 */
  unit?: string
  /** 缺口大了怎么补（写给作者看的方向，不是命令）。 */
  remedy?: string
}

/** 一项的判定结果。 */
export interface BalanceCheck {
  /** 键名（grain / water / energy / fiscal / army …）。 */
  key: string
  /** 中文名。 */
  label: string
  /** 需求量。 */
  demand: number
  /** 供给量。 */
  supply: number
  /** 覆盖率 = supply / demand（>1 表示有余）。 */
  coverage: number
  /** 状态：够 / 紧 / 不够。 */
  status: 'ample' | 'tight' | 'short'
  /** 缺口（正数表示还缺这么多；0 表示不缺）。 */
  gap: number
  /** 单位。 */
  unit: string
  /** 补充方向。 */
  remedy: string
}

/** 整盘结果。 */
export interface BalanceReport {
  /** 每一项的判定。 */
  checks: BalanceCheck[]
  /** 最短板（覆盖率最低的那一项）；全部较宽裕时仍给出最低的一项。 */
  bottleneck: BalanceCheck | undefined
  /** 最短板的一句话结论。 */
  verdict: string
  /** 哪些项没检查（作者没给）。 */
  unchecked: string[]
  /** 是否整体撑得住（所有已检查项 coverage >= 1）。 */
  sustainable: boolean
}

/** 内置检查项（顺序即展示顺序）。 */
export const BALANCE_ITEMS: Array<{ key: string; label: string; remedy: string }> = [
  { key: 'grain', label: '粮食', remedy: '提高单产、开垦耕地，或减少非农人口' },
  { key: 'water', label: '水', remedy: '引水、蓄水，或降低人均用水' },
  { key: 'energy', label: '能源', remedy: '换更高 EROI 的能源，或降低人均能耗' },
  { key: 'land', label: '耕地', remedy: '开垦、提高复种指数，或从外邦输入' },
  { key: 'fiscal', label: '财政', remedy: '加税、削减开支，或开辟新财源' },
  { key: 'army', label: '军费', remedy: '裁军、改用民兵，或提高财政基础' },
  { key: 'info', label: '信息传递', remedy: '缩短半径、增设驿站，或接受地方自治' },
]

/**
 * 判定一项的状态。
 *
 * 分档：coverage >= 1.5 为「充裕」，>= 1 为「刚够」，< 1 为「不够」。
 * 为什么把 1—1.5 也叫「紧」：真实社会没有余量的系统经不起任何波动
 * （一次歉收、一场瘟疫就崩），所以「刚好够」在推演里等同于危险。
 *
 * @param demand - 需求量
 * @param supply - 供给量
 * @returns 状态
 */
function statusOf(demand: number, supply: number): 'ample' | 'tight' | 'short' {
  if (demand <= 0) return 'ample'
  const coverage = supply / demand
  if (coverage >= 1.5) return 'ample'
  if (coverage >= 1) return 'tight'
  return 'short'
}

/**
 * 跑一次收支盘点。
 *
 * @param inputs - 键名 → `{ demand, supply, unit? }`
 * @returns 每项判定、最短板与整体结论
 */
export function checkBalance(
  inputs: Record<string, { demand: number; supply: number; unit?: string }>,
): BalanceReport {
  const checks: BalanceCheck[] = []
  const unchecked: string[] = []

  for (const spec of BALANCE_ITEMS) {
    const given = inputs[spec.key]
    if (!given || typeof given.demand !== 'number' || typeof given.supply !== 'number') {
      unchecked.push(spec.label)
      continue
    }
    const demand = given.demand
    const supply = given.supply
    const coverage = demand > 0 ? supply / demand : Infinity
    const gap = Math.max(0, demand - supply)
    checks.push({
      key: spec.key,
      label: spec.label,
      demand: demand,
      supply: supply,
      coverage: coverage,
      status: statusOf(demand, supply),
      gap: gap,
      unit: given.unit || '',
      remedy: spec.remedy,
    })
  }

  // 作者可能给了内置清单之外的项，也一起算（扩展性）
  for (const [key, given] of Object.entries(inputs)) {
    if (BALANCE_ITEMS.some(function (item) { return item.key === key })) continue
    if (!given || typeof given.demand !== 'number' || typeof given.supply !== 'number') continue
    const demand = given.demand
    const supply = given.supply
    checks.push({
      key: key,
      label: key,
      demand: demand,
      supply: supply,
      coverage: demand > 0 ? supply / demand : Infinity,
      status: statusOf(demand, supply),
      gap: Math.max(0, demand - supply),
      unit: given.unit || '',
      remedy: '这一项是自定义的，缺口要往哪个方向补由作者决定',
    })
  }

  // 最短板：覆盖率最低的那一项（demand > 0 的才算）
  let bottleneck: BalanceCheck | undefined
  for (const check of checks) {
    if (check.demand <= 0) continue
    if (!bottleneck || check.coverage < bottleneck.coverage) bottleneck = check
  }

  const sustainable = checks.length > 0 && checks.every(function (check) {
    return check.demand <= 0 || check.supply >= check.demand
  })

  let verdict: string
  if (checks.length === 0) {
    verdict = '没有给出任何收支项，无从判断。至少给一组 demand/supply。'
  } else if (!sustainable) {
    const short = checks.filter(function (check) { return check.status === 'short' })
    verdict =
      '撑不住：' + short.length + ' 项不够。最紧的是' + (bottleneck ? bottleneck.label : '—') +
      (bottleneck ? '（覆盖 ' + (bottleneck.coverage * 100).toFixed(0) + '%，缺 ' +
        bottleneck.gap.toPrecision(3) + ' ' + bottleneck.unit + '）' : '') +
      '。' + (bottleneck ? bottleneck.remedy + '。' : '')
  } else if (checks.some(function (check) { return check.status === 'tight' })) {
    verdict =
      '勉强够：所有项都不缺，但' +
      (bottleneck ? bottleneck.label + '只有 ' + (bottleneck.coverage * 100).toFixed(0) + '% 余量' : '余量很薄') +
      '，一次波动就可能翻到不够。' + (bottleneck ? bottleneck.remedy + '可以增加余量。' : '')
  } else {
    verdict =
      '撑得住：最紧的是' + (bottleneck ? bottleneck.label : '—') +
      (bottleneck ? '，仍有 ' + (bottleneck.coverage * 100).toFixed(0) + '% 覆盖' : '') + '。'
  }

  return {
    checks: checks,
    bottleneck: bottleneck,
    verdict: verdict,
    unchecked: unchecked,
    sustainable: sustainable,
  }
}
