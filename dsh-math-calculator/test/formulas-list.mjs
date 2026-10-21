/**
 * 导出公式库完整清单（直接读编译产物，保证与代码一致）。
 */
import { writeFileSync } from 'node:fs'
// 从 formulas.js 读，它已合并主批次 + 扩展批次（217 条）。
// 直接读 formula-library.js 只会拿到主批次的 119 条。
import { FORMULAS, formulaFrequency } from '../lib/formulas.js'
import { LAYERS, DOMAIN_NAMES, layerCounts, domainCounts, layerOf, domainsOf } from '../lib/taxonomy.js'

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

// 三轴标签概览
lines.push('## 规则层级（离最底层规则的远近）')
lines.push('')
lines.push('| 层级 | 含义 | 条数 |')
lines.push('|---|---|---|')
for (const layer of LAYERS) {
  const count = layerCounts().find((item) => item.layer === layer.id)?.count ?? 0
  lines.push(`| ${layer.name}（${layer.id}） | ${layer.desc} | ${count} |`)
}
lines.push('')
lines.push('## 学科领域（多标签）')
lines.push('')
lines.push('| 领域 | 条数 |')
lines.push('|---|---|')
for (const domain of domainCounts()) lines.push(`| ${domain.name}（${domain.domain}） | ${domain.count} |`)
lines.push('')
lines.push('> 注意：`cat` 只是旧的路径字段；分类请用「规则层级 + 学科领域」。')
lines.push('> `frequency` 指**主角视角**感知频率，不是世界观推导常用度。')
lines.push('')
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
    const domains = domainsOf(f).map((domain) => DOMAIN_NAMES[domain] ?? domain)
    lines.push(
      `**${f.name}**` +
        ` · 层级 ${layerOf(f)}` +
        ` · 领域 ${domains.join('、') || '—'}` +
        ` · 主角频率 ${formulaFrequency(f)}` +
        (f.unit ? ` · 单位 ${f.unit}` : '') +
        (f.builtin ? ' · JS 内置实现' : ''),
    )
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
