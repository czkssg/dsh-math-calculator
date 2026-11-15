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

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { workspaceArtifactDir, workspaceDirectory } from '../../io/workspace-store.js'

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
  /** 与其它产物同根：<workspace>.artifacts/datastore/。 */
  const dir = join(workspaceArtifactDir('datastore', workspaceDirectory()), 'datastore')
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
  if (typeof input.kind !== 'string' || input.kind.trim() === '') throw new Error('kind 不能为空')
  if (typeof input.name !== 'string' || input.name.trim() === '') throw new Error('name 不能为空')
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
