/**
 * 量纲审计与裸数字护栏（`units_audit`）。
 *
 * 反馈包 N12（P1）的要求：**一组量的量纲组合是否矛盾**。
 * 另一个高频硬伤是「正文里写了『年产 2.66』却没单位」——读者不知道该乘什么。
 *
 * ## 两类检查
 *
 * ```
 *   组内一致性   同一个量在不同位置给了不同量纲（人口一处「万人」一处「万吨」）→ 矛盾
 *   裸数字护栏   数字后面没有单位 → 列表报出来，由作者补
 * ```
 *
 * ## 单位从哪来
 *
 * 数据由调用方注入（`src/data/units.json` 的 `ALL_UNITS`），不在这里内嵌。
 * 支持单量纲单位（`吨`、`km`）与一次除法复合（`吨/年`、`kg/m3`）。
 *
 * ## 不猜
 *
 * 工具只说「这个单位不认识」「这个量的两处量纲不同」，
 * 不说「哪个是对的」——哪一处是作者笔误，只有作者知道。
 *
 * @module dsh-math-calculator/features/graph/units-audit
 */

import { CalcError } from '../../core/errors.js'

/** 单位条目（与 units.json 的 ALL_UNITS 形状一致）。 */
export interface UnitEntry {
  name: string
  aliases?: string[]
  dimension: string
  factor?: number
  note?: string
}

/** 一条待审计的量。 */
export interface AuditClaim {
  /** 量名（如「人口」「年产量」）；同名的会分组对比。 */
  name: string
  /** 单位（如「吨」「吨/年」）。 */
  unit?: string
  /** 数值（可选，只用于展示）。 */
  value?: number
  /** 期望量纲（可选，调用方给判据；如 ['mass'] 或 ['mass/time']）。 */
  expect?: string[]
  /** 出处（行号/段落，可选）。 */
  where?: string
}

/** 输入。 */
export interface UnitsAuditInput {
  /** 待审计的量。 */
  claims?: AuditClaim[]
  /** 或给一段文本，做裸数字护栏。 */
  text?: string
}

/** 一条审计结果。 */
export interface AuditFinding {
  name: string
  /** 原始单位。 */
  unit: string | null
  /** 解析出的量纲（复合用 `mass/time`）；解析不出为 null。 */
  dimension: string | null
  /** 状态。 */
  status: 'ok' | 'unknown-unit' | 'missing-unit' | 'mismatch' | 'conflict'
  message: string
  where?: string
}

/** 结果。 */
export interface UnitsAuditOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 建立单位索引。 */
function buildIndex(units: UnitEntry[]): Map<string, UnitEntry> {
  const index = new Map<string, UnitEntry>()
  /** 小写键**不覆盖**已有键：`s`（秒）与 `S`（西门子）只差大小写，覆盖会让秒被认成西门子。 */
  const setIfAbsent = (key: string, unit: UnitEntry): void => { if (!index.has(key)) index.set(key, unit) }
  for (const unit of units) {
    index.set(unit.name, unit)
    const lower = unit.name.toLowerCase()
    if (lower !== unit.name) setIfAbsent(lower, unit)
    for (const alias of unit.aliases ?? []) {
      index.set(alias, unit)
      const lowerAlias = alias.toLowerCase()
      if (lowerAlias !== alias) setIfAbsent(lowerAlias, unit)
    }
  }
  return index
}

/** 解析单段单位。 */
function lookupUnit(index: Map<string, UnitEntry>, token: string): UnitEntry | undefined {
  const exact = index.get(token) ?? index.get(token.toLowerCase())
  if (exact !== undefined) return exact
  /** `kg/m3` 的 `m3` 归一到表里的 `m³`（数字指数 → 上标）。 */
  const withSuperscript = token.replace(/(\d)$/, (_, digit: string) => digit === '3' ? '³' : digit === '2' ? '²' : digit)
  if (withSuperscript !== token) return index.get(withSuperscript) ?? index.get(withSuperscript.toLowerCase())
  return undefined
}

/**
 * 解析一个单位表达式：
 *   `吨`      → mass
 *   `吨/年`   → mass/time
 *   `kg/m3`   → mass/length^3（数字指数按 3 处理）
 *
 * @param index - 单位索引
 * @param unit - 单位串
 * @returns 量纲或 null
 */
export function dimensionOf(index: Map<string, UnitEntry>, unit: string): string | null {
  const text = unit.trim()
  if (text === '') return null
  const parts = text.split('/')
  if (parts.length > 2) return null
  const numerator = lookupUnit(index, parts[0].trim())
  if (!numerator) return null
  if (parts.length === 1) return numerator.dimension
  const denominator = lookupUnit(index, parts[1].trim())
  if (!denominator) return null
  return numerator.dimension + '/' + denominator.dimension
}

/**
 * 裸数字护栏：找出「数字后面没有单位」的片段。
 *
 * @param text - 正文
 * @returns 裸数字片段（含上下文）
 */
export function findBareNumbers(text: string): Array<{ raw: string; context: string; line: number }> {
  const out: Array<{ raw: string; context: string; line: number }> = []
  /** 单位必须出现在数字**紧邻**的位置；隔了标点就不是这个数字的单位。 */
  const unitStart = /^(万亿|亿|万|千|百|吨|公斤|千克|kg|克|斤|米|千米|公里|km|cm|mm|平方米|平方公里|亩|公顷|立方米|升|年|天|小时|分钟|秒|人|个|台|辆|艘|座|层|间|条|只|元|美元|先令|度|℃|K|焦|J|卡|瓦|W|kW|MW|GW|帕|Pa|kPa|MPa|atm|牛|N|kN|马力|hp|%|倍)/
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const matches = [...line.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)]
    for (const match of matches) {
      const at = match.index ?? 0
      const after = line.slice(at + match[0].length, at + match[0].length + 6).replace(/^\s+/, '')
      if (unitStart.test(after)) continue
      const segStart = Math.max(line.lastIndexOf('，', at), line.lastIndexOf('。', at), 0)
      const segEndRaw = ['，', '。', '；'].map((mark) => line.indexOf(mark, at)).filter((pos) => pos >= 0)
      const segEnd = segEndRaw.length > 0 ? Math.min(...segEndRaw) : line.length
      out.push({ raw: match[0], context: line.slice(segStart === 0 ? 0 : segStart + 1, segEnd).trim().slice(0, 80), line: i + 1 })
    }
  }
  return out
}

/**
 * 执行量纲审计。
 *
 * @param input - 待审计的量或文本
 * @param units - 单位表（注入）
 * @returns 审计结果
 * @throws {CalcError} 缺输入 → missing_params；claims 形态错 → invalid_argument
 */
export function runUnitsAudit(input: UnitsAuditInput | undefined, units: UnitEntry[]): UnitsAuditOutcome {
  if (input === undefined || input === null) {
    throw new CalcError(
      'missing_params',
      'units_audit 需要 claims 或 text 之一',
      'claims 形如 [{name:"人口",unit:"万人"},{name:"年产量",unit:"吨"}]；text 给正文则做裸数字护栏。',
    )
  }
  const index = buildIndex(units)
  const claims = Array.isArray(input.claims) ? input.claims : []
  const hasText = typeof input.text === 'string' && input.text.trim() !== ''
  if (claims.length === 0 && !hasText) {
    throw new CalcError('missing_params', 'units_audit 的 claims 为空且没有 text', '至少给一条待审计的量或一段正文。')
  }

  const findings: AuditFinding[] = []
  const groups = new Map<string, string[]>()

  for (const claim of claims) {
    if (!claim || typeof claim.name !== 'string' || claim.name.trim() === '') {
      throw new CalcError('invalid_argument', 'claims 里每条都要有非空 name（量名）', '例如 {name:"人口", unit:"万人"}。')
    }
    const name = claim.name.trim()
    const unit = typeof claim.unit === 'string' && claim.unit.trim() !== '' ? claim.unit.trim() : null
    const where = typeof claim.where === 'string' ? claim.where : undefined

    if (unit === null) {
      findings.push({ name, unit: null, dimension: null, status: 'missing-unit', message: '没给单位（裸数字）——读者不知道该乘什么', ...(where ? { where } : {}) })
      continue
    }

    const dimension = dimensionOf(index, unit)
    if (dimension === null) {
      findings.push({ name, unit, dimension: null, status: 'unknown-unit', message: '单位「' + unit + '」在单位表里找不到（复合写法只支持一次「/」）', ...(where ? { where } : {}) })
      continue
    }

    const expects = Array.isArray(claim.expect) ? claim.expect.filter((item): item is string => typeof item === 'string') : []
    if (expects.length > 0 && !expects.includes(dimension)) {
      findings.push({
        name, unit, dimension, status: 'mismatch',
        message: '量纲是 ' + dimension + '，但调用方期望 ' + expects.join(' 或 ') + '——两者不符',
        ...(where ? { where } : {}),
      })
      continue
    }

    findings.push({ name, unit, dimension, status: 'ok', message: '量纲 ' + dimension, ...(where ? { where } : {}) })
    const key = name.replace(/^(年|每日|每|总)/, '').replace(/(量|率|数|值)$/, '')
    const list = groups.get(key) ?? []
    list.push(dimension)
    groups.set(key, list)
  }

  /** 组内一致性：同名量在不同位置量纲不同 → conflict。 */
  for (const [key, dimensions] of groups) {
    const unique = [...new Set(dimensions)]
    if (unique.length > 1) {
      for (const finding of findings) {
        if (finding.name.replace(/^(年|每日|每|总)/, '').replace(/(量|率|数|值)$/, '') === key && finding.status === 'ok') {
          finding.status = 'conflict'
          finding.message = '同名量「' + key + '」出现了不同量纲：' + unique.join(' / ') + '——工具不判断哪个对，请核对'
        }
      }
    }
  }

  const bare = hasText ? findBareNumbers(input.text as string) : []
  const lines: string[] = ['═══ 量纲审计 ═══', '']
  const okCount = findings.filter((item) => item.status === 'ok').length
  const badCount = findings.length - okCount
  lines.push('  审计 ' + findings.length + ' 条：' + okCount + ' 条通过，' + badCount + ' 条有问题')
  lines.push('')
  if (findings.length > 0) {
    for (const finding of findings) {
      const mark = finding.status === 'ok' ? '✓' : finding.status === 'missing-unit' ? '○' : '✗'
      lines.push('  ' + mark + ' ' + finding.name.padEnd(12) + (finding.unit ?? '（无单位）').padEnd(10) + finding.message + (finding.where ? '  @' + finding.where : ''))
    }
    lines.push('')
  }
  if (hasText) {
    lines.push('  【裸数字护栏】' + (bare.length === 0 ? '未发现裸数字' : '发现 ' + bare.length + ' 处数字没有单位'))
    for (const item of bare.slice(0, 20)) lines.push('  ○ L' + item.line + ' ' + item.raw + ' —— ' + item.context)
    if (bare.length > 20) lines.push('  …还有 ' + (bare.length - 20) + ' 处，见 value.bareNumbers')
    lines.push('')
  }
  lines.push('  ★ 工具只报「不认识 / 量纲不同 / 缺单位」，不判断哪个是对的。')
  lines.push('  ★ 复合单位只支持一次「/」（如 吨/年、kg/m3）；更复杂的写法请拆成多条。')

  const notices: string[] = []
  if (badCount > 0) notices.push('有 ' + badCount + ' 条量纲问题，核对后修改')
  if (bare.length > 0) notices.push('正文里有 ' + bare.length + ' 处裸数字')

  return {
    result: lines.join('\n'),
    value: { findings, okCount, badCount, bareNumbers: bare, groups: Object.fromEntries(groups) },
    ...(notices.length > 0 ? { notice: notices.join('；') } : {}),
  }
}
