/**
 * 光谱型基准表（数据来自 `src/data/stars.json`）。
 *
 * ## 为什么这里不内嵌数据
 *
 * v3 的约定是数据与逻辑分离：数据文件由调用方加载后注入（与 formulas 一致）。
 * 所以本模块只提供类型、索引与查询函数，不持有光谱型表本身。
 *
 * ## 一个需要记住的边界
 *
 * 目录里只有主序星（O5V…M5V）。巨星（III）、白矮星等同光谱字母的亮度
 * 高出 20–100 倍，用主序值顶替会让平衡温度差出几百开。遇到非 V 级设定，
 * 调用方应显式给 starMass/starRadius/starTemp，并在 starNotes 里说清。
 *
 * @module dsh-math-calculator/features/deduction/star-catalog
 */

/** 一个光谱型的基准值（与 `data/stars.json` 形状一致）。 */
export interface StarClass {
  id: string
  name: string
  tempK: number
  radiusSun: number
  massSun: number
  luminositySun: number
  color: string
  peakWavelengthNm: number
  lifespanGyr: number
  habitableInnerAU: number
  habitableOuterAU: number
  uvFactor: number
  notes: string
}

/**
 * 按 id 建索引。
 *
 * @param classes - 光谱型表
 * @returns id → 基准值
 */
export function indexStarClasses(classes: StarClass[]): Map<string, StarClass> {
  return new Map(classes.map((s) => [s.id, s]))
}

/**
 * 按温度反查最接近的光谱型（用对数距离，避免高温端一边倒）。
 *
 * @param classes - 光谱型表
 * @param tempK - 目标温度
 * @returns 最接近的基准值（表为空时返回 undefined）
 */
export function closestStarClass(classes: StarClass[], tempK: number): StarClass | undefined {
  let best: StarClass | undefined
  let bestDelta = Infinity
  for (const star of classes) {
    const delta = Math.abs(Math.log(star.tempK / Math.max(1, tempK)))
    if (delta < bestDelta) {
      bestDelta = delta
      best = star
    }
  }
  return best
}

/**
 * 光谱型的通俗描述。
 *
 * @param star - 基准值
 * @returns 一句话
 */
export function describeStarClass(star: StarClass): string {
  return (
    star.name + '（' + star.id + '），表面 ' + star.tempK + 'K，颜色' + star.color +
    '，光度是太阳的 ' + star.luminositySun.toFixed(star.luminositySun >= 1 ? 1 : 3) + ' 倍，寿命约 ' +
    star.lifespanGyr.toFixed(0) + ' 亿年，宜居带 ' + star.habitableInnerAU.toFixed(2) + '~' +
    star.habitableOuterAU.toFixed(2) + ' AU'
  )
}
