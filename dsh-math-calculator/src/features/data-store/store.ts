/**
 * 统一数据层：把工具用过程中产生的各类数据收进一个可检索、可追溯的库。
 *
 * ## 现状（改之前）
 *
 * 数据散在五处：`workspace-state.json`、拓扑模型文件、derivation 归档、日志、
 * 世界设定库——**各自实现、互不可查**，也无法回答「这个模型依赖哪些数据」。
 *
 * ## 统一模型
 *
 * 一条记录 `DataRecord`：`{ id, kind, name, tags, refs, version, payload, createdAt, updatedAt }`。
 *
 * - `kind`：var / constant / formula / entity-type / model / world / history / note
 * - `refs`：血缘（这条记录引用了哪些记录 id）——可查「依赖谁 / 被谁用」
 * - 存储：`<workspace>.artifacts/datastore/records.jsonl`（追加写，最新覆盖）
 *
 * ## 设计取舍
 *
 * - **追加写 + 内存索引**：不引入数据库依赖，文件可 diff、可手工修；
 * - **id 由 kind + name 决定**（同名即同一条，再 put 就是新版本）——避免随机 id 破坏确定性；
 * - **不存时间进 payload**：时间只用于排序/展示，不参与计算（保「同输入同输出」）。
 *
 * @module dsh-math-calculator/features/data-store/store
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { workspaceArtifactDir, workspaceDirectory } from '../../io/workspace-store.js'
import { CalcError } from '../../core/errors.js'
import MiniSearch from 'minisearch'

/** 数据类型。 */
export type DataKind = 'var' | 'constant' | 'formula' | 'entity-type' | 'model' | 'world' | 'history' | 'note'

/** 一条记录。 */
export interface DataRecord {
  id: string
  kind: string
  name: string
  tags: string[]
  refs: string[]
  version: number
  payload: unknown
  createdAt: string
  updatedAt: string
}

/** 目录。 */
function storeDir(): string {
  /** 与其它产物同根：<workspace>/.artifacts/datastore/。 */
  const dir = join(workspaceDirectory(), '.artifacts', 'datastore')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** 文件。 */
function storeFile(): string {
  return join(storeDir(), 'records.jsonl')
}

/**
 * 记录 id（kind + name，稳定可预测）。
 *
 * @param kind - 类型
 * @param name - 名称
 * @returns id
 */
export function recordId(kind: string, name: string): string {
  return kind + ':' + name
}

/** 读全部记录（后者覆盖前者）。 */
export function readRecords(): Map<string, DataRecord> {
  const map = new Map<string, DataRecord>()
  const file = storeFile()
  if (!existsSync(file)) return map
  const text = readFileSync(file, 'utf8')
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      const record = JSON.parse(line) as DataRecord
      map.set(record.id, record)
    } catch {
      /* 坏行跳过（手工编辑容错） */
    }
  }
  return map
}

/**
 * 写入/更新一条记录。
 *
 * @param input - kind/name/tags/refs/payload
 * @returns 记录
 * @throws {Error} kind/name 为空
 */
export function putRecord(input: { kind: string; name: string; tags?: string[]; refs?: string[]; payload?: unknown }): DataRecord {
  if (typeof input.kind !== 'string' || input.kind.trim() === '') throw new CalcError('invalid_argument', 'kind 不能为空', '例如 kind:"note"。')
  if (typeof input.name !== 'string' || input.name.trim() === '') throw new CalcError('invalid_argument', 'name 不能为空', '例如 name:"北境人口"。')
  const id = recordId(input.kind.trim(), input.name.trim())
  const existing = readRecords().get(id)
  const now = new Date().toISOString()
  const record: DataRecord = {
    id,
    kind: input.kind.trim(),
    name: input.name.trim(),
    tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
    refs: Array.isArray(input.refs) ? input.refs.map(String) : [],
    version: (existing?.version ?? 0) + 1,
    payload: input.payload ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  appendFileSync(storeFile(), JSON.stringify(record) + '\n', 'utf8')
  return record
}

/**
 * 取一条记录（最新版本）。
 *
 * @param id - 记录 id
 * @returns 记录或 null
 */
export function getRecord(id: string): DataRecord | null {
  return readRecords().get(id) ?? null
}

/**
 * 查询记录。
 *
 * @param filter - 过滤条件
 * @returns 记录列表（按更新时间降序）
 */
export function queryRecords(filter: { kind?: string; tag?: string; nameContains?: string; refsTo?: string } = {}): DataRecord[] {
  const all = [...readRecords().values()]
  return all
    .filter((r) => filter.kind === undefined || r.kind === filter.kind)
    .filter((r) => filter.tag === undefined || r.tags.includes(filter.tag))
    .filter((r) => filter.nameContains === undefined || r.name.includes(filter.nameContains))
    .filter((r) => filter.refsTo === undefined || r.refs.includes(filter.refsTo))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

/**
 * 血缘：谁引用了这条记录、这条记录引用了谁。
 *
 * @param id - 记录 id
 * @returns 上游/下游
 */
export function lineage(id: string): { record: DataRecord | null; upstream: DataRecord[]; downstream: DataRecord[] } {
  const all = readRecords()
  const record = all.get(id) ?? null
  if (record === null) return { record: null, upstream: [], downstream: [] }
  const upstream = record.refs.map((ref) => all.get(ref)).filter((r): r is DataRecord => r !== undefined)
  const downstream = [...all.values()].filter((r) => r.refs.includes(id))
  return { record, upstream, downstream }
}

/**
 * 统计。
 *
 * @returns 各类型数量与总记录数
 */
export function storeStats(): { total: number; byKind: Record<string, number>; versions: number } {
  const all = [...readRecords().values()]
  const byKind: Record<string, number> = {}
  for (const r of all) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
  return { total: all.length, byKind, versions: all.reduce((sum, r) => sum + r.version, 0) }
}

/**
 * 导出全部记录（JSON）。
 *
 * @returns JSON 文本
 */
export function exportRecords(): string {
  return JSON.stringify([...readRecords().values()], null, 1)
}

/**
 * 导入记录（合并；同 id 按版本高者胜）。
 *
 * @param json - JSON 文本
 * @returns 导入条数
 * @throws {Error} 格式非法
 */
export function importRecords(json: string): number {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('导入内容不是合法 JSON')
  }
  if (!Array.isArray(parsed)) throw new Error('导入内容必须是记录数组')
  const current = readRecords()
  let count = 0
  for (const item of parsed as DataRecord[]) {
    if (typeof item?.id !== 'string') continue
    const existing = current.get(item.id)
    if (existing !== undefined && existing.version >= item.version) continue
    appendFileSync(storeFile(), JSON.stringify(item) + '\n', 'utf8')
    count += 1
  }
  return count
}

// ───────────────────────────── 借鉴 @seald-io/nedb（2026-11-16） ─────────────────────────────

/**
 * 内存索引缓存（借鉴 nedb 的 ensureIndex）。
 *
 * 原实现每次读全文件解析——记录一多就慢。加缓存：文件 mtime 不变则复用。
 */
let indexCache: { records: Map<string, DataRecord>; mtimeMs: number } | null = null

/**
 * 读记录（带缓存）。
 *
 * @returns 记录表
 */
export function readRecordsCached(): Map<string, DataRecord> {
  const file = storeFile()
  if (!existsSync(file)) {
    indexCache = { records: new Map(), mtimeMs: 0 }
    return indexCache.records
  }
  const mtime = statSync(file).mtimeMs
  if (indexCache !== null && indexCache.mtimeMs === mtime) return indexCache.records
  const records = readRecords()
  indexCache = { records, mtimeMs: mtime }
  return records
}

/**
 * 压缩日志（借鉴 nedb 的 compaction）。
 *
 * JSONL 里每条记录有多版历史；超过阈值时只保留最新版，旧文件改名 .bak。
 *
 * @param threshold - 行数阈值（默认 500）
 * @returns 压缩前后行数
 */
export function compact(threshold = 500): { before: number; after: number; compacted: boolean } {
  const file = storeFile()
  if (!existsSync(file)) return { before: 0, after: 0, compacted: false }
  const lines = readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '')
  if (lines.length <= threshold) return { before: lines.length, after: lines.length, compacted: false }
  const latest = readRecords()
  const body = [...latest.values()].map((record) => JSON.stringify(record)).join('\n') + '\n'
  writeFileSync(file + '.bak', readFileSync(file, 'utf8'), 'utf8')
  writeFileSync(file, body, 'utf8')
  indexCache = null
  return { before: lines.length, after: latest.size, compacted: true }
}

/**
 * 取某条记录的指定历史版本（借鉴双时态数据库的「按版本回放」）。
 *
 * @param id - 记录 id
 * @param version - 版本号（1 起）
 * @returns 记录或 null
 */
export function getRecordVersion(id: string, version: number): DataRecord | null {
  const file = storeFile()
  if (!existsSync(file)) return null
  let found: DataRecord | null = null
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue
    try {
      const record = JSON.parse(line) as DataRecord
      if (record.id === id && record.version === version) found = record
    } catch {
      /* 跳过坏行 */
    }
  }
  return found
}
/**
 * 带缓存的查询（索引未变时复用解析结果）。
 *
 * @param filter - 过滤条件
 * @returns 记录列表
 */
export function queryRecordsCached(filter: { kind?: string; tag?: string; nameContains?: string; refsTo?: string } = {}): DataRecord[] {
  const all = [...readRecordsCached().values()]
  return all
    .filter((r) => filter.kind === undefined || r.kind === filter.kind)
    .filter((r) => filter.tag === undefined || r.tags.includes(filter.tag))
    .filter((r) => filter.nameContains === undefined || r.name.includes(filter.nameContains))
    .filter((r) => filter.refsTo === undefined || r.refs.includes(filter.refsTo))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

// ───────────────────────────── 全文检索（复用 minisearch + segmentit） ─────────────────────────────

/**
 * 全文检索（复用它处已用的 minisearch，不新引依赖）。
 *
 * 公式检索（features/formulas/query.ts）已在用 minisearch + segmentit；
 * 数据层直接复用同一套中文分词，避免「两套检索语义」。
 */
let searchCache: { index: unknown; size: number } | null = null

/**
 * 数据层全文检索。
 *
 * @param keyword - 关键词（中文可用词）
 * @param limit - 返回条数（默认 10）
 * @returns 命中记录与分数
 */
export function searchRecords(keyword: string, limit = 10): Array<{ record: DataRecord; score: number }> {
  const records = [...readRecordsCached().values()]
  if (searchCache === null || searchCache.size !== records.length) {
    const index = new MiniSearch({
      fields: ['name', 'kind', 'tags'],
      storeFields: ['id'],
      tokenize: (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word !== ''),
    })
    index.addAll(records.map((r) => ({ id: r.id, name: r.name, kind: r.kind, tags: r.tags.join(' ') })))
    searchCache = { index, size: records.length }
  }
  const index = searchCache.index as { search: (query: string, options: Record<string, unknown>) => Array<{ id: string; score: number }> }
  const hits = index.search(keyword, { prefix: true, fuzzy: 0.2 })
  const byId = new Map(records.map((r) => [r.id, r]))
  return hits.slice(0, limit).flatMap((hit) => {
    const record = byId.get(hit.id)
    return record === undefined ? [] : [{ record, score: hit.score }]
  })
}

/**
 * 从工作区旧产物迁移到统一数据层（借鉴 umzug 的「版本化迁移 + 幂等」）。
 *
 * 迁移来源：`workspace-state.json`（变量/常数/自定义公式/实体类型/拓扑模型）、
 * `derivation-archive.json`（推演归档）。已迁移过的记录不重复写（同 id 同 payload 跳过）。
 *
 * @returns 各来源迁移条数
 */
export function migrateLegacy(): Record<string, number> {
  const result: Record<string, number> = { workspace: 0, archive: 0, skipped: 0 }
  const wsDir = join(workspaceDirectory(), '.artifacts')
  const statePath = join(wsDir, 'workspace-state.json')
  const current = readRecords()
  const putIfNew = (input: { kind: string; name: string; tags?: string[]; refs?: string[]; payload?: unknown }): void => {
    const id = recordId(input.kind, input.name)
    const existing = current.get(id)
    if (existing !== undefined && JSON.stringify(existing.payload) === JSON.stringify(input.payload ?? null)) {
      result['skipped'] = (result['skipped'] ?? 0) + 1
      return
    }
    putRecord(input)
    result['workspace'] = (result['workspace'] ?? 0) + 1
  }
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>
      const variables = (state['variables'] ?? {}) as Record<string, unknown>
      for (const [name, value] of Object.entries(variables)) putIfNew({ kind: 'var', name, tags: ['迁移'], payload: { value } })
      const constants = (state['constants'] ?? {}) as Record<string, unknown>
      for (const [name, value] of Object.entries(constants)) putIfNew({ kind: 'constant', name, tags: ['迁移'], payload: { value } })
      const formulas = Array.isArray(state['customFormulas']) ? (state['customFormulas'] as Array<Record<string, unknown>>) : []
      for (const formula of formulas) putIfNew({ kind: 'formula', name: String(formula['id'] ?? formula['name'] ?? 'unnamed'), tags: ['迁移'], payload: formula })
      const entityTypes = Array.isArray(state['entityTypes']) ? (state['entityTypes'] as Array<Record<string, unknown>>) : []
      for (const entity of entityTypes) putIfNew({ kind: 'entity-type', name: String(entity['name'] ?? 'unnamed'), tags: ['迁移'], payload: entity })
      const models = (state['topologyModels'] ?? {}) as Record<string, unknown>
      for (const [name, model] of Object.entries(models)) putIfNew({ kind: 'model', name, tags: ['迁移'], payload: model })
    } catch {
      /* 旧文件坏掉不影响其它来源 */
    }
  }
  const archivePath = join(wsDir, 'derivation-archive.json')
  if (existsSync(archivePath)) {
    try {
      const archive = JSON.parse(readFileSync(archivePath, 'utf8')) as { versions?: Array<Record<string, unknown>> }
      for (const version of archive.versions ?? []) {
        putRecord({ kind: 'history', name: String(version['version'] ?? 'v') + '@' + String(version['at'] ?? ''), tags: ['迁移', '归档'], payload: version })
        result['archive'] = (result['archive'] ?? 0) + 1
      }
    } catch {
      /* 忽略 */
    }
  }
  return result
}
