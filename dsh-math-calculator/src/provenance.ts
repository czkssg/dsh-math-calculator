/**
 * 模型出处登记：把"哪些数字是物理、哪些只是地球标定、哪些根本推不出来"摊开。
 *
 * 为什么需要（ADR-0001）：用户要的是"逻辑自洽、不矛盾太大"，不是科研精度。
 * 但自洽的前提是**知道自己哪里在估算** —— 否则作者会拿一个地球标定的经验系数
 * 当物理定律用，写进小说后在第 20 章崩掉。
 *
 * 三类：
 *   first-principles  严格物理关系，改常数只需换公式
 *   calibrated        地球标定 + 标度律，只在给定适用域内可信
 *   contingent        不可推导，纯作者选择（卫星数量、生物上限、反照率……）
 *
 * @module dsh-math-calculator/provenance
 */

/** 一个模型常数的来源类别。 */
export type ModelSource = 'first-principles' | 'calibrated' | 'contingent'

/** 登记条目。 */
export interface ModelConstant {
  id: string
  value: number | string
  unit?: string
  source: ModelSource
  /** 是否随精细结构常数缩放（以及怎么缩）。 */
  scalesWithAlpha: boolean
  /** 适用域；超出只降级不拒绝。 */
  domain: string
  note: string
}

/** 全部经验/标定/设定项。 */
export const MODEL_CONSTANTS: ModelConstant[] = [
  {
    id: 'granite-strength',
    value: 1.3e8,
    unit: 'Pa',
    source: 'calibrated',
    scalesWithAlpha: true,
    domain: 'α 偏离现实 < 50%',
    note: '花岗岩抗压强度，作为材料强度 S ∝ α⁵ 的标定点（现实宇宙取值）',
  },
  {
    id: 'lapse-moist-factor',
    value: 0.665,
    source: 'calibrated',
    scalesWithAlpha: false,
    domain: '地球型大气（N₂/O₂/CO₂ 量级）',
    note: '干绝热 Γ=g·M/(3.5R) 到湿绝热的修正系数，用地球 6.5 K/km 标定',
  },
  {
    id: 'ocean-inertia',
    value: 0.5,
    source: 'calibrated',
    scalesWithAlpha: true,
    domain: 'α 偏离现实 < 20%',
    note: '海洋热惯性对季节振幅的阻尼；热容 ∝ 键能 ∝ α²',
  },
  {
    id: 'atmosphere-inertia',
    value: 0.15,
    source: 'calibrated',
    scalesWithAlpha: false,
    domain: '气压 0–5 atm',
    note: '大气输运对季节振幅的阻尼系数（每 atm）',
  },
  {
    id: 'rayleigh-tau550',
    value: 0.1,
    source: 'calibrated',
    scalesWithAlpha: true,
    domain: 'α 偏离现实 < 20%',
    note: '地球大气 550nm 垂直光学厚度；散射截面 ∝ α²',
  },
  {
    id: 'tidal-lock-timescale',
    value: '0.5 Gyr',
    source: 'calibrated',
    scalesWithAlpha: false,
    domain: '岩石质卫星、近圆顺行轨道',
    note: '地月系统标定的潮汐锁定时间尺度；换材料只保证量级',
  },
  {
    id: 'mutual-hill-spacing',
    value: 3.5,
    source: 'calibrated',
    scalesWithAlpha: false,
    domain: '顺行、近圆轨道、质量比 < 1e-2',
    note: 'Gladman 1993 数值判据：相邻卫星间距 ≥ 3.5 倍互相希尔半径',
  },
  {
    id: 'roche-fluid-factor',
    value: 2.44,
    source: 'first-principles',
    scalesWithAlpha: false,
    domain: '流体假设；刚体约 1.26',
    note: '洛希极限系数 d = 2.44·R·(ρp/ρm)^(1/3)',
  },
  {
    id: 'night-star-count',
    value: 9100,
    source: 'calibrated',
    scalesWithAlpha: false,
    domain: '地球夜空、极限星等 6.5',
    note: '全天可见星数基准，用于亮度↔星数换算',
  },
  {
    id: 'full-moon-lux',
    value: 0.25,
    unit: 'lux',
    source: 'calibrated',
    scalesWithAlpha: false,
    domain: '地球月球的反照率与距离',
    note: '满月在地表的照度基准',
  },
  {
    id: 'moon-albedo',
    value: 0.12,
    source: 'contingent',
    scalesWithAlpha: false,
    domain: '作者可改',
    note: '月球几何反照率；不同卫星差异可达数倍',
  },
  {
    id: 'moon-density',
    value: 3344,
    unit: 'kg/m³',
    source: 'contingent',
    scalesWithAlpha: false,
    domain: '作者可改',
    note: '月球密度；冰质卫星约 1000–2000，铁质更高',
  },
  {
    id: 'biological-size-limit',
    value: '25 m',
    source: 'contingent',
    scalesWithAlpha: false,
    domain: '地球碳基生物 + 平方-立方定律',
    note: '陆生生物体长上限基准（蜥脚类），随重力反比缩放',
  },
]

/** 按来源统计条数。 */
export function provenanceSummary(): { firstPrinciples: number; calibrated: number; contingent: number } {
  return {
    firstPrinciples: MODEL_CONSTANTS.filter((x) => x.source === 'first-principles').length,
    calibrated: MODEL_CONSTANTS.filter((x) => x.source === 'calibrated').length,
    contingent: MODEL_CONSTANTS.filter((x) => x.source === 'contingent').length,
  }
}

/**
 * 生成给作者看的可信度说明（逐行）。
 * @param onlyCalibrated - 只列地球标定项（默认 false，三类都列概要）。
 */
export function describeProvenance(onlyCalibrated = false): string[] {
  const s = provenanceSummary()
  const lines: string[] = []
  lines.push(
    `第一性原理 ${s.firstPrinciples} 条（严格物理关系）；地球标定 ${s.calibrated} 条（有效范围有限）；设定自由 ${s.contingent} 条（不可推导）。`,
  )

  if (!onlyCalibrated) {
    lines.push('  地球标定项（这些会随常数偏离而失真）：')
    for (const item of MODEL_CONSTANTS.filter((x) => x.source === 'calibrated')) {
      lines.push(`    · ${item.id}: ${item.value}${item.unit ?? ''}  适用域 ${item.domain}`)
    }
  }

  lines.push('  设定自由项（这些不是物理，是作者选择）：')
  for (const item of MODEL_CONSTANTS.filter((x) => x.source === 'contingent')) {
    lines.push(`    · ${item.id}: ${item.value}${item.unit ?? ''}`)
  }

  return lines
}
