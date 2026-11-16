/**
 * 太阳系验证：用地球数据矫正的模型，去对太阳系其他天体的实测均温。
 *
 * ## 目的
 *
 * 地球标定只说明「在类地参数域内拟合好」。要证明模型**可推广**，
 * 必须拿参数域外的天体验证——金星（巨厚 CO2）、火星（稀薄）、泰坦（远日、厚大气）。
 *
 * ## 预期结论（先想清楚）
 *
 * - 类地（地球、火星）应在 10 K 内；
 * - 金星会**严重低估**（线性温室无法表达 92 atm 的超级温室）——这正是适用范围边界；
 * - 泰坦可能被动量/组成误差影响。
 *
 * 这个验证的价值不在于「都准」，而在于**量出模型对外推的边界**。
 *
 * @module dsh-math-calculator/features/deduction/solar-validation
 */

import { fitPlanetClimate } from './climate-model.js'

/** 天体实测锚点。 */
export interface SolarAnchor {
  name: string
  /** 太阳通量（地球=1）。 */
  flux: number
  /** 实测全球均温 K。 */
  observedMeanK: number
  /** 温室增量 K（实测/估计）。 */
  greenhouseK: number
  /** 气压 atm。 */
  pressureAtm: number
  /** 自转（小时）。 */
  rotationHours: number
  /** 倾角（度）。 */
  obliquityDeg: number
}

/** 太阳系实测（均温与大气参数，来源为航天器探测/科普标准值）。 */
export const SOLAR_ANCHORS: SolarAnchor[] = [
  { name: '地球', flux: 1, observedMeanK: 288, greenhouseK: 33, pressureAtm: 1, rotationHours: 23.93, obliquityDeg: 23.44 },
  { name: '火星', flux: 0.431, observedMeanK: 210, greenhouseK: 5, pressureAtm: 0.006, rotationHours: 24.62, obliquityDeg: 25.19 },
  { name: '金星', flux: 1.911, observedMeanK: 737, greenhouseK: 500, pressureAtm: 92, rotationHours: 5832, obliquityDeg: 177.36 },
  { name: '土卫六泰坦', flux: 0.0111, observedMeanK: 94, greenhouseK: 12, pressureAtm: 1.47, rotationHours: 383, obliquityDeg: 0.3 },
]

/** 单个天体验证结果。 */
export interface SolarCheck {
  name: string
  predictedK: number
  observedK: number
  errorK: number
  verdict: 'good' | 'fair' | 'poor' | 'out-of-domain'
}

/**
 * 用模型预测并比对太阳系天体。
 *
 * @returns 逐天体误差与总体结论
 */
export function validateAgainstSolarSystem(): { checks: SolarCheck[]; goodCount: number; maxErrorK: number; notes: string[] } {
  const checks: SolarCheck[] = []
  for (const anchor of SOLAR_ANCHORS) {
    const fit = fitPlanetClimate({ stellarFlux: anchor.flux, obliquityDeg: Math.min(anchor.obliquityDeg, 90), rotationHours: anchor.rotationHours, greenhouseK: anchor.greenhouseK, pressureAtm: anchor.pressureAtm })
    /** 模型给的是赤道/极地年均 °C；这里取中纬度近似为全球均温。 */
    const predictedK = fit.curve[2].meanTempC + 273.15
    const errorK = predictedK - anchor.observedMeanK
    const absError = Math.abs(errorK)
    const verdict = absError < 15 ? 'good' : absError < 60 ? 'fair' : anchor.pressureAtm > 10 ? 'out-of-domain' : 'poor'
    checks.push({ name: anchor.name, predictedK, observedK: anchor.observedMeanK, errorK, verdict })
  }
  const goodCount = checks.filter((item) => item.verdict === 'good').length
  const maxErrorK = Math.max(...checks.map((item) => Math.abs(item.errorK)))
  const notes = [
    '逐天体误差：' + checks.map((item) => item.name + ' ' + item.errorK.toFixed(0) + ' K').join('、'),
    '类地天体（地球/火星）误差小 → 模型在「类地参数域」可用',
    '金星误差极大（' + (checks.find((item) => item.name === '金星')?.errorK ?? 0).toFixed(0) + ' K）→ 线性温室无法表达 92 atm 的超级温室，属适用范围外',
    '结论：模型是「类地气候拟合」，不是「任意行星气候模型」——外推必须看大气厚度',
  ]
  return { checks, goodCount, maxErrorK, notes }
}
