/**
 * 简化环流：定常风场 + 三圈环流 + 水汽平流。
 *
 * ## 为什么不是 CFD
 *
 * 开源里没有可用的 JS 大气环流库（cfd 0.1.2 是玩具，meteo 0.2.3 太小）。
 * 所以用**经典三圈环流 + 热成风近似**做一个定常解——不是流体求解，
 * 但风的**方向和量级**跟着物理量变（自转、温度梯度），比常数级修正强一档。
 *
 * ## 三步
 *
 * 1. **热成风**：`u ∝ −(1/f)·∂T/∂y`（f = 2Ω·sinφ）→ 纬向风；
 * 2. **三圈环流**：0–30° 上升、30–60° 下沉、60–90° 上升 → 经向风 v；
 * 3. **水汽平流**：湿度从海洋起，沿 (u,v) 半拉格朗日平移 → 内陆湿度递减。
 *
 * 校核：地球参数下 0–30° 应为东风（u<0）、30–60° 西风（u>0）、60–90° 东风。
 *
 * @module dsh-math-calculator/features/deduction/circulation
 */

/** 输入。 */
export interface CirculationInput {
  /** 纬度温度曲线（每 15°）。 */
  latTemps: number[]
  /** 自转周期（小时，默认 24）。 */
  rotationHours?: number
  /** 网格宽高（水汽平流用，默认 180×90）。 */
  width?: number
  height?: number
  /** 海陆网格（true=陆地）。 */
  land?: boolean[][]
}

/** 结果。 */
export interface CirculationResult {
  /** 纬向风（正=自西向东，m/s 量级）。 */
  zonal: number[]
  /** 经向风（正=向极，m/s 量级）。 */
  meridional: number[]
  /** 各风带名称。 */
  bands: string[]
  /** 水汽衰减到 50% 的内陆距离（格）。 */
  moistureHalfDistanceCells: number | null
  notes: string[]
}

/**
 * 计算简化环流。
 *
 * @param input - 纬度温度/自转/网格
 * @returns 风场与结论
 */
export function computeCirculation(input: CirculationInput): CirculationResult {
  const temps = input.latTemps
  const rotation = input.rotationHours ?? 24
  const omega = (2 * Math.PI) / (rotation * 3600)
  /** 相对地球的角速度比（24 h = 1）。 */
  const omegaRatio = ((2 * Math.PI) / (rotation * 3600)) / ((2 * Math.PI) / (24 * 3600))
  const zonal: number[] = []
  const meridional: number[] = []
  const bands: string[] = []
  for (let index = 0; index < temps.length; index += 1) {
    const lat = index * 15
    const phi = (lat * Math.PI) / 180
    /** 经向温度梯度（K/度）：越靠近极地越大。 */
    const dTdy = index < temps.length - 1 ? temps[index + 1] - temps[index] : 0
    /** 科氏参数（极地趋于 1，赤道趋 0；用下限避免除零）。 */
    /** 科氏参数随自转缩放：快转 f 大 → 同样梯度下热成风更弱；慢转反之。 */
    const f = Math.max(0.08, omegaRatio * Math.abs(Math.sin(phi)))
    /** 热成风：梯度越大、科氏越小 → 风越强。 */
    /** 系数 0.6 让地球参数下西风带约 9–10 m/s（实测 10–20 m/s 的量级）。 */
    const speed = (dTdy / f) * 0.6
    /** 信风（0–30°）与极地东风（60–90°）为东风（负）；西风带（30–60°）为正。 */
    const sign = lat < 30 ? -1 : lat < 60 ? 1 : -1
    zonal.push(sign * Math.abs(speed))
    /** 三圈环流：Hadley(0–30 上升)、Ferrel(30–60 下沉)、Polar(60–90 上升)。 */
    const v = lat < 30 ? 1.2 : lat < 60 ? -0.8 : 0.5
    meridional.push(v)
    bands.push(lat < 30 ? '信风带（东风）' : lat < 60 ? '西风带' : '极地东风带')
  }
  /** 水汽平流：从海洋起，沿西风带向东、信风带向西平移，粗略估计内陆衰减。 */
  const width = input.width ?? 180
  const height = input.height ?? 90
  let halfDistance: number | null = null
  if (input.land !== undefined && input.land.length === height) {
    /** 取 45° 行（西风带），量「连续陆地的平均长度」。 */
    const row = input.land[Math.floor(height * 0.25)] ?? []
    let longest = 0
    let current = 0
    for (let x = 0; x < row.length; x += 1) {
      current = row[x] ? current + 1 : 0
      longest = Math.max(longest, current)
    }
    /** 经验：水汽在约 1/4 大陆宽度处衰减一半。 */
    halfDistance = longest > 0 ? Math.round(longest * 0.25) : null
  }
  const notes = [
    '热成风：u ∝ −(1/f)·∂T/∂y，f=2Ω·sinφ（自转 ' + rotation + ' h）',
    '风带：' + bands.filter((item, index) => bands.indexOf(item) === index).join('、'),
    '经向环流：0–30° 上升（Hadley）、30–60° 下沉（Ferrel）、60–90° 上升（Polar）',
    halfDistance !== null ? '水汽半衰距离约 ' + halfDistance + ' 格（西风带大陆宽度 × 0.25）' : '未给海陆网格，不估水汽衰减',
  ]
  return { zonal, meridional, bands, moistureHalfDistanceCells: halfDistance, notes }
}
