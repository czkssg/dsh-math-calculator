/**
 * 天文观测 → 科技能力推导（古代/近代）。
 *
 * ## 它回答什么
 *
 * 「这个世界的观测精度/计时精度/工艺水平，能推出什么天文结论、造出什么仪器」——
 * 每条都是一条**可算的精度链**，不是叙事形容词。
 *
 * ## 六条链（公式都有出处）
 *
 * - 圭表测影 → 回归年精度：影长变化率 ≈ 日影长 × 赤纬变化率；
 * - 六分仪 → 定位误差：1 角分纬度 ≈ 1 海里（1852 m）；
 * - 航海钟 → 经度误差：4 分钟 ≈ 1° 经度；
 * - 望远镜 → 角分辨率：瑞利判据 θ = 1.22λ/D；
 * - 钟摆 → 秒摆长度 T = 2π√(L/g)；
 * - 历法漂移 → 回归年误差累积多少年差 1 天。
 *
 * @module dsh-math-calculator/features/deduction/astrotech
 */

/** 输入。 */
export interface AstroTechInput {
  /** 链路：shadow / sextant / clock / telescope / pendulum / calendar-drift。 */
  device?: string
  /** 精度参数：影长（mm）或角度（角分）或口径（mm）或日误差（秒）。 */
  precision?: number
  /** 纬度（度，用于投影）。 */
  latitudeDeg?: number
  /** 年长误差（天，calendar-drift 用）。 */
  yearErrorDays?: number
}

/** 结果。 */
export interface AstroTechResult {
  device: string
  /** 输入精度。 */
  input: number
  /** 推导结论。 */
  conclusion: string
  /** 数值。 */
  value: Record<string, number | string>
  /** 说明。 */
  notes: string[]
}

/** 1 角分对应的纬度距离（m，地球）。 */
const ARCMIN_KM = 1.852
/** 经度 1° 对应赤道距离（km）。 */
const DEG_KM = 111.32

/**
 * 推导天文科技能力。
 *
 * @param input - 输入
 * @returns 结果
 * @throws {Error} 参数非法
 */
export function deriveAstroTech(input: AstroTechInput): AstroTechResult {
  const device = input.device ?? 'telescope'
  const precision = input.precision ?? 1
  const notes: string[] = []

  if (device === 'telescope') {
    /** 瑞利判据：θ = 1.22λ/D，λ=550nm。 */
    if (!(precision > 0)) throw new Error('口径必须为正（mm）')
    const dM = precision / 1000
    const theta = (1.22 * 550e-9) / dM
    const arcsec = theta * 206265
    notes.push('口径 ' + precision + ' mm → 角分辨率 ' + arcsec.toFixed(3) + ' 角秒（瑞利判据，λ=550 nm）')
    const canSee = arcsec < 1 ? '可分辨行星圆面与卫星' : arcsec < 10 ? '可分辨行星圆面' : '只能看到星点'
    notes.push('能力：' + canSee)
    return { device, input: precision, conclusion: canSee, value: { resolutionArcsec: arcsec, canSee }, notes }
  }

  if (device === 'sextant') {
    /** 角分 → 纬度 km（1' ≈ 1 海里）→ 经度误差换算（按纬度余弦）。 */
    const lat = input.latitudeDeg ?? 0
    const latKm = precision * ARCMIN_KM
    const lonKm = latKm / Math.max(0.01, Math.cos((lat * Math.PI) / 180))
    const timeErrorMin = (lonKm / DEG_KM) * 4
    notes.push('六分仪 ' + precision + ' 角分 → 纬度误差 ' + latKm.toFixed(2) + ' km')
    notes.push('经度误差（纬度 ' + lat + '°）约 ' + lonKm.toFixed(1) + ' km，折合时间 ' + timeErrorMin.toFixed(1) + ' 分钟')
    notes.push('这就是「航海钟为什么要 4 分钟内」的来源：4 分钟 = 1° 经度 ≈ 111 km（赤道）')
    return { device, input: precision, conclusion: '定位误差 ' + latKm.toFixed(1) + ' km（纬度）', value: { latErrorKm: latKm, lonErrorKm: lonKm, timeErrorMin }, notes }
  }

  if (device === 'clock') {
    /** 日误差（秒）→ 经度误差（4 分钟 = 1° 经度）。 */
    const degError = (precision / 240) * 1
    const kmError = degError * DEG_KM
    notes.push('航海钟日误差 ' + precision + ' 秒 → 经度误差 ' + degError.toFixed(4) + '°/天')
    notes.push('航行 30 天累积 ' + (degError * 30).toFixed(2) + '° ≈ ' + (kmError * 30).toFixed(0) + ' km（赤道）')
    notes.push('18 世纪航海钟目标：日误差 < 3 秒（约 1/2 角分经度）')
    return { device, input: precision, conclusion: '日误差 ' + precision + ' 秒 → 每天 ' + degError.toFixed(4) + '° 经度', value: { degPerDay: degError, kmPerDay: kmError }, notes }
  }

  if (device === 'pendulum') {
    /** 秒摆：T=2π√(L/g)，T=2s → L。 */
    const length = (9.80665 * 4) / (4 * Math.PI * Math.PI)
    notes.push('秒摆（周期 2 s）长度 = ' + length.toFixed(4) + ' m（g=9.807）')
    notes.push('周期误差来自摆长误差：ΔL/L = 2ΔT/T；摆长精度 1 mm → 日误差约 ' + ((1 / length) * 0.5 * 86400).toFixed(2) + ' 秒')
    notes.push('温度每变化 1 K，黄铜摆长变化约 1.9e-5 → 日误差约 0.8 秒（这就是温度补偿摆的由来）')
    return { device, input: precision, conclusion: '秒摆 ' + length.toFixed(4) + ' m', value: { secondsPendulumM: length }, notes }
  }

  if (device === 'shadow') {
    /** 圭表：影长精度 mm → 太阳高度角精度 → 回归年精度（近似）。 */
    const shadow = input.precision || 1
    const note = '影长精度 ' + shadow + ' mm（表高 8 尺 ≈ 2.56 m）'
    /** 影长变化率：冬至前后每天影长变化约 1-2 cm/mm 量级；用典型值 15 mm/天。 */
    const dayResolution = shadow / 15
    notes.push(note)
    notes.push('可分辨的回归年精度约 ' + dayResolution.toFixed(3) + ' 天（按冬至前后影长日变化 15 mm 估）')
    notes.push('要测准回归年（365.2422），需要连续多年观测取平均——这是古代历法「多年测影」的原因')
    return { device, input: shadow, conclusion: '回归年分辨率约 ' + dayResolution.toFixed(3) + ' 天', value: { yearResolutionDays: dayResolution }, notes }
  }

  if (device === 'calendar-drift') {
    /** 历法年长误差（天/年）→ 多少年差 1 天。 */
    const error = input.yearErrorDays ?? 0.0078
    if (!(error > 0)) throw new Error('年长误差必须为正（天）')
    const years = 1 / error
    notes.push('历法年长比真实回归年差 ' + error + ' 天/年 → 每 ' + years.toFixed(1) + ' 年差 1 天')
    notes.push('儒略历误差 0.0078 天/年 → 128 年差 1 天（这就是 1582 年格里历改革的原因）')
    return { device, input: error, conclusion: '每 ' + years.toFixed(1) + ' 年差 1 天', value: { yearsPerDay: years }, notes }
  }

  throw new Error('不认识的 device：' + device + '（可用：telescope / sextant / clock / pendulum / shadow / calendar-drift）')
}
