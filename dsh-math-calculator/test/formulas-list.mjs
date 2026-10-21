/**
 * 导出公式库完整清单（直接读编译产物，保证与代码一致）。
 */
import { writeFileSync } from 'node:fs'
// 从 formulas.js 读，它已合并主批次 + 扩展批次（217 条）。
// 直接读 formula-library.js 只会拿到主批次的 119 条。
import { FORMULAS } from '../lib/formulas.js'

const byCategory = new Map()
for (const f of FORMULAS) {
  if (!byCategory.has(f.cat)) byCategory.set(f.cat, [])
  byCategory.get(f.cat).push(f)
}

const lines = []
lines.push('# 公式库完整清单')
lines.push('')
lines.push(`> 共 **${FORMULAS.length}** 条，**${byCategory.size}** 个分类。由 \`node test/formulas-list.mjs\` 从代码导出。`)
lines.push('')
lines.push('调用方式：`{ "operation": "formula", "formula": "<id>", "overrides": {...} }`')
lines.push('')
lines.push('**所有参数都可被 `overrides` 覆盖**，这是架空世界改造的基础。')
lines.push('')

// 目录
lines.push('## 目录')
lines.push('')
for (const [cat, items] of [...byCategory.entries()].sort()) {
  lines.push(`- [${cat}](#${cat.replace(/\//g, '')}) — ${items.length} 条`)
}
lines.push('')

// 明细
for (const [cat, items] of [...byCategory.entries()].sort()) {
  lines.push(`## ${cat}`)
  lines.push('')
  for (const f of items) {
    const required = Object.entries(f.params).filter(([, s]) => s.value === null)
    const optional = Object.entries(f.params).filter(([, s]) => s.value !== null)
    lines.push(`### ${f.id}`)
    lines.push('')
    lines.push(`**${f.name}**${f.unit ? ` · 单位 ${f.unit}` : ''}${f.builtin ? ' · JS 内置实现' : ''}`)
    lines.push('')
    lines.push('```')
    lines.push(f.expr)
    lines.push('```')
    lines.push('')
    if (required.length > 0) {
      lines.push(`必填：${required.map(([n, s]) => `\`${n}\` (${s.desc})`).join('、')}`)
    }
    if (optional.length > 0) {
      lines.push(`可选：${optional.map(([n, s]) => `\`${n}\`=${s.value} (${s.desc})`).join('、')}`)
    }
    lines.push('')
    lines.push(f.desc)
    lines.push('')
  }
}

writeFileSync(new URL('../FORMULAS.md', import.meta.url), lines.join('\n'), 'utf8')

// 控制台输出紧凑表
console.log(`共 ${FORMULAS.length} 条公式，${byCategory.size} 个分类\n`)
for (const [cat, items] of [...byCategory.entries()].sort()) {
  console.log(`\n【${cat}】${items.length} 条`)
  for (const f of items) {
    console.log(`  ${f.id.padEnd(26)} ${f.name}`)
  }
}
console.log('\n完整文档已写入 FORMULAS.md')
