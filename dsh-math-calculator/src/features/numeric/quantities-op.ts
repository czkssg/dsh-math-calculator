/**
 * `quantities`：改常数后，哪些物理量该变、哪些不该变。
 *
 * 三类量的处理原则完全不同：
 * ```
 *   derived  必须变 —— 由常数严格定义（普朗克长度、玻尔半径…）
 *   setting  绝不自动变 —— 你的创作选择（行星质量、恒星质量…）
 *   bounded  你选，但有物理上限，上限随常数变（生物体型、山高…）
 * ```
 *
 * 这比 constants（常数之间耦合）与 impact（公式结果偏差）更根本：
 * 它回答「物理量本身」该不该跟着变。
 *
 * @module dsh-math-calculator/features/numeric/quantities-op
 */

import { QUANTITIES, computeQuantities, scalingExponent } from './quantities.js'

/** 结果。 */
export interface QuantitiesOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 数字渲染。 */
function sci(value: number): string {
  if (!Number.isFinite(value)) return '∞'
  const abs = Math.abs(value)
  if (abs === 0) return '0'
  if (abs >= 1000 || abs < 1e-3) return value.toExponential(4)
  return Number(value.toPrecision(5)).toString()
}

function pct(value: number): string {
  if (!Number.isFinite(value)) return '∞'
  const shown = value * 100
  if (Math.abs(shown) >= 10000) return shown.toExponential(2) + '%'
  return (shown >= 0 ? '+' : '') + shown.toFixed(2) + '%'
}

/**
 * 执行 quantities。
 *
 * @param input - 常数覆盖与关注常数
 * @returns 三类量与敏感度
 */
export function runQuantities(input: { constants?: Record<string, number>; constantName?: string } = {}): QuantitiesOutcome {
  const overrides = input.constants ?? {}
  const focus = typeof input.constantName === 'string' && input.constantName.trim() !== '' ? input.constantName.trim() : undefined
  const quantities = computeQuantities(overrides)
  const hasOverrides = Object.keys(overrides).length > 0
  const lines: string[] = ['══════ 物理量影响分析 ══════', '']

  if (hasOverrides) {
    lines.push('【改动的常数】')
    for (const [name, value] of Object.entries(overrides)) lines.push('  ' + name.padEnd(10) + ' → ' + sci(value))
    lines.push('')
  } else {
    lines.push('未指定常数改动，列出全部物理量分类与现实值。', '')
  }

  lines.push('【一、导出量 —— 由常数严格定义，必须跟着变】')
  lines.push('  这些量的值完全由基本常数决定；改了常数它们不变才说明算错了。', '')
  lines.push('  物理量                    现实值            改动后            变化')
  for (const item of quantities.derived) {
    lines.push('  ' + (item.changed ? '●' : ' ') + ' ' + item.name.padEnd(22) + sci(item.standard).padStart(14) + sci(item.altered).padStart(14) + pct(item.relativeChange).padStart(11))
  }
  const changedDerived = quantities.derived.filter((item) => item.changed)
  if (hasOverrides) {
    lines.push('')
    lines.push(changedDerived.length === 0 ? '  → 本次改动没有影响任何导出量。' : '  → ' + changedDerived.length + ' 个导出量随常数变化，这是正确的、必须的。')
  }

  lines.push('', '【二、设定量 —— 你的创作选择，绝不自动变】')
  lines.push('  这些是你指定的值（行星多大、恒星多重）。改常数时系统不会去"修正"它们。', '')
  lines.push('  物理量                    你设定的值')
  for (const item of quantities.setting) lines.push('    ' + item.name.padEnd(22) + sci(item.standard).padStart(14) + ' ' + item.unit)
  lines.push('', '  → 全部保持不变 ✓（这是设计意图，不是遗漏）')

  lines.push('', '【三、受限量 —— 你选择，但有物理上限；上限本身随常数变】')
  lines.push('  这些量由你的设定 + 常数共同决定。改常数会让"能到多大"的天花板移动。', '')
  lines.push('  物理量                    现实上限          改动后上限        变化')
  for (const item of quantities.bounded) {
    lines.push('  ' + (item.changed ? '●' : ' ') + ' ' + item.name.padEnd(22) + sci(item.standard).padStart(14) + sci(item.altered).padStart(14) + pct(item.relativeChange).padStart(11))
  }

  if (focus !== undefined) {
    lines.push('', '【四、对 "' + focus + '" 的敏感度（缩放指数）】')
    lines.push('  指数 = 该常数变 1% 时这个量变百分之几。0 表示无关——此时让它变才是错的。', '')
    lines.push('  物理量                    缩放指数  含义')
    for (const quantity of QUANTITIES) {
      if (quantity.category === 'setting') continue
      const exponent = scalingExponent(quantity, focus, overrides)
      if (!Number.isFinite(exponent)) continue
      let meaning: string
      if (Math.abs(exponent) < 1e-6) {
        lines.push('    ' + quantity.name.padEnd(22) + '0'.padStart(8) + '  与该常数无关（不该变）')
        continue
      }
      if (Math.abs(exponent - 1) < 1e-6) meaning = '正比 ∝ k'
      else if (Math.abs(exponent + 1) < 1e-6) meaning = '反比 ∝ 1/k'
      else if (Math.abs(exponent - 0.5) < 1e-6) meaning = '平方根 ∝ √k'
      else if (Math.abs(exponent + 0.5) < 1e-6) meaning = '反平方根 ∝ 1/√k'
      else if (Math.abs(exponent - 2) < 1e-6) meaning = '平方 ∝ k²'
      else if (Math.abs(exponent + 2) < 1e-6) meaning = '反平方 ∝ 1/k²'
      else if (Math.abs(exponent - 4) < 1e-6) meaning = '四次方 ∝ k⁴'
      else meaning = '∝ k^' + exponent.toFixed(2)
      lines.push('    ' + quantity.name.padEnd(22) + exponent.toFixed(3).padStart(8) + '  ' + meaning)
    }
  }

  lines.push('', '【怎么判断一个量该不该变】')
  lines.push('  · 定义式里出现了某个常数（指数 ≠ 0）→ 必须变')
  lines.push('  · 你直接指定的（行星半径）→ 不该变，改了就是篡改设定')
  lines.push('  · 有上限的（生物体型）→ 数值不变，但上限会移动')

  return {
    result: lines.join('\n'),
    value: {
      overrides,
      derived: quantities.derived.map((item) => ({ id: item.id, name: item.name, unit: item.unit, standard: item.standard, altered: item.altered, relativeChange: item.relativeChange, changed: item.changed })),
      setting: quantities.setting.map((item) => ({ id: item.id, name: item.name, unit: item.unit, value: item.standard, changed: item.changed })),
      bounded: quantities.bounded.map((item) => ({ id: item.id, name: item.name, unit: item.unit, standard: item.standard, altered: item.altered, relativeChange: item.relativeChange, changed: item.changed })),
    },
  }
}
