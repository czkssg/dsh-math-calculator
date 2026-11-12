/**
 * 数据表继承（`inherit`）：派生表只读继承基线表的物理基石。
 *
 * ## 解决什么
 *
 * 同一个宇宙的多个世界（母星 / 殖民地 / 飞船）共享常数与公式表，
 * 但各自有自己的初条件与变量。改基线一次，所有派生表跟着变——
 * 而不是每个表各改一遍、改漏一处。
 *
 * ## 只继承物理基石
 *
 * ```
 *   继承：constants（常数覆盖）、formulaTable（公式覆盖）
 *   不继承：初条件、地点、变量、备注——那些是表自己的
 * ```
 *
 * ## 本模块的边界
 *
 * 纯逻辑：接受继承关系数组与表名数组，返回校验结果。
 * 文件读写由 `src/io/archive-store.ts` 负责。
 *
 * @module dsh-math-calculator/features/deduction/inherit
 */

import { CalcError } from '../../core/errors.js'

/** 一条继承关系。 */
export interface InheritLink {
  derived: string
  base: string
  inheritFields: string[]
  createdAt: string
}

/**
 * 建立继承关系。
 *
 * @param links - 现有关系
 * @param derived - 衍生表名
 * @param base - 基线表名
 * @param tableNames - 已存在的表名（用于校验）
 * @param now - 时间戳
 * @returns 结果与更新后的关系
 */
export function linkInherit(
  links: InheritLink[],
  derived: string,
  base: string,
  tableNames: string[],
  now = new Date().toISOString(),
): { ok: boolean; message: string; links: InheritLink[] } {
  if (typeof derived !== 'string' || typeof base !== 'string' || derived.trim() === '' || base.trim() === '') {
    throw new CalcError('missing_params', 'inherit 需要 inheritDerived（衍生表名）与 inheritBase（基线表名）', '例如 {inheritDerived:"殖民地", inheritBase:"母星"}。')
  }
  if (derived === base) return { ok: false, message: '不能继承自己', links }
  if (!tableNames.includes(base)) return { ok: false, message: '基线表 "' + base + '" 不存在', links }
  if (!tableNames.includes(derived)) return { ok: false, message: '衍生表 "' + derived + '" 不存在', links }
  const next = links.filter((item) => item.derived !== derived)
  next.push({ derived, base, inheritFields: ['constants', 'formulaTable'], createdAt: now })
  return { ok: true, message: derived + ' 现在继承 ' + base + ' 的常数与公式', links: next }
}

/**
 * 校验继承关系：悬空、自继承、环。
 *
 * @param links - 关系
 * @param tableNames - 表名
 * @returns 问题清单（空表示健康）
 */
export function checkInheritance(links: InheritLink[], tableNames: string[]): Array<{ kind: string; message: string }> {
  const findings: Array<{ kind: string; message: string }> = []
  const byDerived = new Map(links.map((link) => [link.derived, link]))
  for (const link of links) {
    if (link.derived === link.base) findings.push({ kind: 'self', message: link.derived + ' 继承自己' })
    if (!tableNames.includes(link.base)) findings.push({ kind: 'dangling_base', message: link.derived + ' 的基线 "' + link.base + '" 不存在' })
    if (!tableNames.includes(link.derived)) findings.push({ kind: 'dangling_derived', message: '衍生表 "' + link.derived + '" 不存在' })
  }
  /** 环检测：沿 derived → base 走，能回到自己就是环。 */
  for (const link of links) {
    const seen = new Set<string>([link.derived])
    let cursor: string | undefined = link.base
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        findings.push({ kind: 'cycle', message: '继承成环：' + link.derived + ' → … → ' + cursor })
        break
      }
      seen.add(cursor)
      cursor = byDerived.get(cursor)?.base
    }
  }
  return findings
}

/**
 * 同步检查：改基线后哪些派生表需要更新。
 *
 * @param links - 关系
 * @param base - 被改的基线表
 * @returns 受影响的衍生表
 */
export function affectedBy(links: InheritLink[], base: string): string[] {
  return links.filter((link) => link.base === base).map((link) => link.derived)
}

/**
 * 渲染继承关系。
 *
 * @param links - 关系
 * @param findings - 校验问题
 * @returns 可读文本
 */
export function renderInherit(links: InheritLink[], findings: Array<{ kind: string; message: string }>): string {
  const lines: string[] = ['═══ 继承关系 ═══', '']
  if (links.length === 0) lines.push('  （还没有继承关系）')
  else for (const link of links) lines.push('  ' + link.derived + ' 继承 ' + link.base + '（' + link.inheritFields.join('、') + '）')
  lines.push('')
  lines.push('建立继承：{"derivation":"inherit","inheritDerived":"派生表","inheritBase":"基线表"}')
  lines.push('校验：{"derivation":"inherit","inheritCheck":true}')
  if (findings.length > 0) {
    lines.push('')
    lines.push('【问题】' + findings.length + ' 条')
    for (const finding of findings) lines.push('  ✗ [' + finding.kind + '] ' + finding.message)
  }
  return lines.join('\n')
}
