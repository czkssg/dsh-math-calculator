/**
 * operation="quantities" 的实现。
 *
 * 从 index.ts 原样迁出（纯搬迁：逻辑、错误消息、输出文本逐字未改）。
 */

import { toJsonValue } from '../format.js'
import { QUANTITIES, computeQuantities, scalingExponent } from '../quantities.js'
import { safeNumberForJson, type MathArgs, type Outcome } from './shared.js'

/**
 * `quantities`：回答「改常数后，哪些物理量该变、哪些不该变」。
 *
 * 这是比 constants / impact 更根本的一层：
 *   - constants  看「常数之间」的耦合
 *   - impact     看「公式结果」的偏差
 *   - quantities 看「物理量本身」该不该跟着变
 *
 * 三类量的处理原则完全不同：
 *   derived  必须变 —— 由常数严格定义（普朗克长度、玻尔半径…）
 *   setting  绝不自动变 —— 你的创作选择（行星质量、恒星质量…）
 *   bounded  用户选，但有物理上限，上限随常数变（生物体型、山高…）
 */
export function opQuantities(args: MathArgs): Outcome {
  const overrides = (args.constants ?? {}) as Record<string, number>
  const focusConstant = typeof args.constantName === 'string' ? args.constantName : undefined

  const quantities = computeQuantities(overrides)
  const lines: string[] = []
  const pct = (value: number): string => {
    if (!Number.isFinite(value)) return '∞'
    const shown = value * 100
    if (Math.abs(shown) >= 10000) return `${shown.toExponential(2)}%`
    return `${shown >= 0 ? '+' : ''}${shown.toFixed(2)}%`
  }
  const sci = (value: number): string => {
    if (!Number.isFinite(value)) return '∞'
    const abs = Math.abs(value)
    if (abs === 0) return '0'
    if (abs >= 1000 || abs < 1e-3) return value.toExponential(4)
    return Number(value.toPrecision(5)).toString()
  }

  lines.push('══════ 物理量影响分析 ══════')
  lines.push('')

  const hasOverrides = Object.keys(overrides).length > 0
  if (hasOverrides) {
    lines.push('【改动的常数】')
    for (const [name, value] of Object.entries(overrides)) {
      lines.push(`  ${name.padEnd(10)} → ${sci(value)}`)
    }
    lines.push('')
  } else {
    lines.push('未指定常数改动，列出全部物理量分类与现实值。')
    lines.push('')
  }

  lines.push('【一、导出量 —— 由常数严格定义，必须跟着变】')
  lines.push('  这些量的值完全由基本常数决定；改了常数它们不变才说明算错了。')
  lines.push('')
  lines.push('  物理量                    现实值            改动后            变化')
  for (const item of quantities.derived) {
    const flag = item.changed ? '●' : ' '
    lines.push(
      `  ${flag} ${item.name.padEnd(22)} ${sci(item.standard).padStart(14)} ${sci(item.altered).padStart(14)} ${pct(item.relativeChange).padStart(11)}`,
    )
  }

  const changedDerived = quantities.derived.filter((q) => q.changed)
  if (hasOverrides) {
    lines.push('')
    lines.push(
      changedDerived.length === 0
        ? '  → 本次改动没有影响任何导出量。'
        : `  → ${changedDerived.length} 个导出量随常数变化，这是正确的、必须的。`,
    )
  }

  lines.push('')
  lines.push('【二、设定量 —— 你的创作选择，绝不自动变】')
  lines.push('  这些是你指定的值（行星多大、恒星多重）。改常数时系统不会去"修正"它们，')
  lines.push('  因为那是你的设定，不是物理推导的结果。')
  lines.push('')
  lines.push('  物理量                    你设定的值')
  for (const item of quantities.setting) {
    lines.push(`    ${item.name.padEnd(22)} ${sci(item.standard).padStart(14)} ${item.unit}`)
  }
  lines.push('')
  lines.push('  → 全部保持不变 ✓（这是设计意图，不是遗漏）')

  lines.push('')
  lines.push('【三、受限量 —— 你选择，但有物理上限；上限本身随常数变】')
  lines.push('  这些量由你的设定（行星质量/半径）+ 常数共同决定。')
  lines.push('  改常数会让"能到多大"的天花板移动 —— 这是最值得注意的一类。')
  lines.push('')
  lines.push('  物理量                    现实上限          改动后上限        变化')
  for (const item of quantities.bounded) {
    const flag = item.changed ? '●' : ' '
    lines.push(
      `  ${flag} ${item.name.padEnd(22)} ${sci(item.standard).padStart(14)} ${sci(item.altered).padStart(14)} ${pct(item.relativeChange).padStart(11)}`,
    )
  }

  if (focusConstant) {
    lines.push('')
    lines.push(`【四、对 "${focusConstant}" 的敏感度（缩放指数）】`)
    lines.push('  指数 = 该常数变 1% 时这个量变百分之几。0 表示无关 —— 此时让它变才是错的。')
    lines.push('')
    lines.push('  物理量                    缩放指数  含义')
    for (const quantity of QUANTITIES) {
      if (quantity.category === 'setting') continue
      const exponent = scalingExponent(quantity, focusConstant, overrides)
      if (!Number.isFinite(exponent)) continue
      if (Math.abs(exponent) < 1e-6) {
        lines.push(`    ${quantity.name.padEnd(22)} ${'0'.padStart(8)}  与该常数无关（不该变）`)
        continue
      }
      let meaning: string
      if (Math.abs(exponent - 1) < 1e-6) meaning = '正比 ∝ k'
      else if (Math.abs(exponent + 1) < 1e-6) meaning = '反比 ∝ 1/k'
      else if (Math.abs(exponent - 0.5) < 1e-6) meaning = '平方根 ∝ √k'
      else if (Math.abs(exponent + 0.5) < 1e-6) meaning = '反平方根 ∝ 1/√k'
      else if (Math.abs(exponent - 2) < 1e-6) meaning = '平方 ∝ k²'
      else if (Math.abs(exponent + 2) < 1e-6) meaning = '反平方 ∝ 1/k²'
      else if (Math.abs(exponent - 4) < 1e-6) meaning = '四次方 ∝ k⁴'
      else meaning = `∝ k^${exponent.toFixed(2)}`
      lines.push(`    ${quantity.name.padEnd(22)} ${exponent.toFixed(3).padStart(8)}  ${meaning}`)
    }
  }

  lines.push('')
  lines.push('【怎么判断一个量该不该变】')
  lines.push('  · 若它的定义式里出现了某个常数（且指数 ≠ 0）→ 必须变')
  lines.push('  · 若它是你直接指定的（如行星半径）→ 不该变，改了就是篡改设定')
  lines.push('  · 若它有上限（如生物体型）→ 数值不变，但上限会移动，需检查是否越界')

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      overrides,
      derived: quantities.derived.map((q) => ({
        id: q.id,
        name: q.name,
        symbol: q.symbol,
        unit: q.unit,
        standard: safeNumberForJson(q.standard),
        altered: safeNumberForJson(q.altered),
        relativeChange: Number.isFinite(q.relativeChange) ? q.relativeChange : 'inf',
        changed: q.changed,
      })),
      setting: quantities.setting.map((q) => ({
        id: q.id,
        name: q.name,
        unit: q.unit,
        value: safeNumberForJson(q.standard),
        changed: q.changed,
      })),
      bounded: quantities.bounded.map((q) => ({
        id: q.id,
        name: q.name,
        unit: q.unit,
        standard: safeNumberForJson(q.standard),
        altered: safeNumberForJson(q.altered),
        relativeChange: Number.isFinite(q.relativeChange) ? q.relativeChange : 'inf',
        changed: q.changed,
      })),
      exponents: focusConstant
        ? QUANTITIES.filter((q) => q.category !== 'setting').map((q) => {
            const exponent = scalingExponent(q, focusConstant, overrides)
            return { id: q.id, name: q.name, exponent: Number.isFinite(exponent) ? exponent : null }
          })
        : undefined,
    }),
  }
}
