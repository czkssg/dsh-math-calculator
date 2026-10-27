/**
 * 显示精度的损失追踪：判断「当前位数够不够用」。
 *
 * ## 为什么需要这个模块
 *
 * 显示精度截断是**悄悄发生**的，作者与模型都不会察觉：
 *
 *   1/7                 8 位小数 → 0.14285714        损失约 1e-9（无感）
 *   123456.789012345    8 位小数 → 123456.78901235    损失约 5e-9（无感）
 *   0.00000123456789    8 位小数 → 0.00000123        相对损失约 0.3%（有感！）
 *
 * 最后一个例子是关键：数值很小时，8 位小数只留下 3 位有效数字，
 * 相对误差 0.3% —— 作者以为拿到的是精确值，实际已经偏了。
 *
 * 本模块只做一件事：记住本轮格式化过程中最大的相对误差，
 * 让工具层能据此提醒「该调高 displayPrecision 了」。
 *
 * ## 为什么不写在 format.ts
 *
 * `format.ts` 不依赖任何其它模块，而 `shared.ts` 已经导入它。
 * 把状态放进 `format.ts` 就得反向导入，形成循环。
 * 单独一个模块两边都能用，依赖方向干净。
 *
 * ## 阈值
 *
 * 取 1e-4（万分之一）：低于它的损失对创作与工程核对都无影响；
 * 高于它说明显示值已经明显偏离真值，值得提醒一次。
 *
 * @module dsh-math-calculator/precision-report
 */

/** 允许的最大相对误差（万分之一）。超过就提醒。 */
export const PRECISION_LOSS_THRESHOLD = 1e-4

/** 本轮调用中已记录的最大相对误差。 */
let maxRelativeLoss = 0

/**
 * 记录一次截断造成的相对误差。
 *
 * @param relativeLoss - |显示值−真值| / |真值|
 */
export function reportPrecisionLoss(relativeLoss: number): void {
  if (Number.isFinite(relativeLoss) && relativeLoss > maxRelativeLoss) {
    maxRelativeLoss = relativeLoss
  }
}

/**
 * 取出并清空本轮的最大相对误差。
 *
 * 清空是必要的：每次工具调用开始都要重新统计，
 * 否则上一轮的损失会一直挂在本轮结果上。
 *
 * @returns 最大相对误差；0 表示没有可感知的损失
 */
export function consumePrecisionLoss(): number {
  const value = maxRelativeLoss
  maxRelativeLoss = 0
  return value
}

/**
 * 本轮显示精度是否由调用方**显式**指定。
 *
 * 为什么要区分：作者自己写 `displayPrecision:2` 时，截断是他的意图，
 * 再提醒「精度不够」就是啰嗦。只有用默认值时才值得提醒。
 */
let displayPrecisionExplicit = false

/**
 * 标记本轮显示精度是否来自显式参数。
 *
 * @param explicit - 是否显式
 */
export function setDisplayPrecisionExplicit(explicit: boolean): void {
  displayPrecisionExplicit = explicit
}

/**
 * 当前显示精度是否来自显式参数。
 *
 * @returns 是否显式
 */
export function isDisplayPrecisionExplicit(): boolean {
  return displayPrecisionExplicit
}
