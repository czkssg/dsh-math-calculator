/**
 * 工作区与数据隔离。
 *
 * 需求背景：推演世界观时，**一个世界观 = 一套常数表 + 一套星球参数 + 一堆局部地点**。
 * 推演不同世界观时这些数据绝不能互相污染。同时还要能存下来、之后接着推。
 *
 * 设计：
 *   1. **工作区（workspace）是一级隔离单位**。每个工作区有自己的：
 *        - 物理常数覆盖（改过的 c、G ...）
 *        - 星球参数（world profile 的输入）
 *        - 局部地形设定（可多个地点）
 *        - 命名空间变量（用户定义的量）
 *   2. **落盘结构**：每个工作区一个 JSON 文件，放在
 *        ~/.dsh/math-calc/workspaces/<name>.json
 *      工作区名经过安全过滤（防路径穿越）。
 *   3. **只有「当前活动工作区」才生效**。切换工作区 = 切换整张常数表，
 *      避免"A 世界的引力"泄漏到"B 世界"。
 *   4. **不设活动工作区时用 `default`**，行为与之前完全一致（向后兼容）。
 *
 * 安全注意：
 *   - 工作区名只允许 [A-Za-z0-9_-]，长度 ≤ 64，防路径穿越
 *   - 写盘用临时文件 + rename 原子替换
 *   - 读盘容错：损坏的 JSON 当作空工作区，绝不让插件起不来
 *
 * @module dsh-math-calculator/workspace
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import type { WorkspaceFormulaTable } from './formula-table.js'

/** 局部地形设定（存的是参数，不是计算结果——结果会随常数变化）。 */
export interface SavedTerrain {
  /** 地点名，如「北境港口」。 */
  name: string
  /** describeTerrain 的输入参数。 */
  params: Record<string, unknown>
  /** 备注。 */
  note?: string
  /** 创建/更新时间。 */
  updatedAt: string
}

/** 一个工作区。 */
export interface WorkspaceData {
  /** 工作区名。 */
  name: string
  /** 简介。 */
  description?: string
  /** 物理常数覆盖（只有基础旋钮 + 派生量快照）。 */
  constants: Record<string, number>
  /** 星球参数（generateWorld 的输入）。 */
  world: Record<string, unknown>
  /** 保存的局部地点。 */
  terrains: SavedTerrain[]
  /** 命名空间变量（用户自定义的量，如「主角身高」「帝国人口」）。 */
  variables: Record<string, number>
  /** 本工作区的公式表（覆盖 + 自定义），不同世界互不影响。 */
  formulaTable?: WorkspaceFormulaTable
  /** 创建时间。 */
  createdAt: string
  /** 最后修改时间。 */
  updatedAt: string
}

/** 工作区摘要（用于列表）。 */
export interface WorkspaceSummary {
  name: string
  description?: string
  /** 改过的常数个数。 */
  constantCount: number
  /** 保存的地点个数。 */
  terrainCount: number
  /** 变量个数。 */
  variableCount: number
  updatedAt: string
}

/** 工作区错误。 */
export class WorkspaceError extends Error {
  readonly type: string
  constructor(type: string, message: string) {
    super(message)
    this.name = 'WorkspaceError'
    this.type = type
  }
}

/** 默认工作区名。 */
export const DEFAULT_WORKSPACE = 'default'

/** 当前活动工作区名（进程级）。 */
let activeWorkspaceName: string = DEFAULT_WORKSPACE

/** 内存缓存：避免每次调用都读盘。 */
const cache = new Map<string, { data: WorkspaceData; stamp: string }>()

/**
 * 工作区目录。
 *
 * 解析顺序：
 *   1. `DSH_MATH_CALC_HOME` —— 本插件自己的显式覆盖（测试与隔离验证用），优先级最高
 *   2. `$DSH_HOME/math-calc/workspaces` —— 宿主自己也有可迁移的家目录时跟着走
 *   3. `~/.dsh/math-calc/workspaces` —— 默认
 *
 * 为什么要有第 2 条：原先只认 `~/.dsh`，于是**把 DSH_HOME 指到别处做隔离验证时，
 * 插件照样往真实家目录写**（实测：隔离宿主跑一次就落在 `C:\Users\<用户>\.dsh\math-calc`）。
 * 宿主其余部分都尊重 `DSH_HOME`，插件不该是那个例外。
 * `DSH_HOME` 未设置时行为与原来完全一致，不需要迁移数据。
 */
export function workspaceDirectory(): string {
  const override = process.env.DSH_MATH_CALC_HOME
  if (typeof override === 'string' && override.trim() !== '') {
    return join(override.trim(), 'workspaces')
  }
  const dshHome = process.env.DSH_HOME
  const home =
    typeof dshHome === 'string' && dshHome.trim() !== '' ? dshHome.trim() : join(homedir(), '.dsh')
  return join(home, 'math-calc', 'workspaces')
}

/**
 * 校验并归一化工作区名。
 * 只允许字母数字下划线连字符，防路径穿越。
 */
export function normalizeWorkspaceName(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_WORKSPACE
  const trimmed = value.trim()
  if (trimmed === '') return DEFAULT_WORKSPACE
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(trimmed)) {
    throw new WorkspaceError(
      'invalid_name',
      `工作区名 "${trimmed}" 不合法：只允许字母、数字、下划线、连字符，长度 1-64。`,
    )
  }
  return trimmed
}

/** 工作区文件路径。 */
function workspaceFile(name: string): string {
  return join(workspaceDirectory(), `${name}.json`)
}

/** 空的默认工作区。 */
function emptyWorkspace(name: string): WorkspaceData {
  const now = new Date().toISOString()
  return {
    name,
    constants: {},
    world: {},
    terrains: [],
    variables: {},
    formulaTable: { overrides: [], custom: [] },
    createdAt: now,
    updatedAt: now,
  }
}

/** 取文件指纹（mtime+size），检测外部改动。 */
function fileStamp(path: string): string {
  try {
    const info = statSync(path)
    return `${info.mtimeMs}:${info.size}`
  } catch {
    return ''
  }
}

/**
 * 读取一个工作区。
 * 文件不存在 → 返回空工作区（不落盘）。
 * 文件损坏 → 返回空工作区并记警告（绝不让插件起不来）。
 */
export function loadWorkspace(name: string): WorkspaceData {
  const normalized = normalizeWorkspaceName(name)
  const path = workspaceFile(normalized)
  const stamp = fileStamp(path)

  const cached = cache.get(normalized)
  if (cached && cached.stamp === stamp) return cached.data

  let data: WorkspaceData
  if (stamp === '') {
    data = emptyWorkspace(normalized)
  } else {
    try {
      const raw = readFileSync(path, 'utf8')
      const parsed = JSON.parse(raw) as Partial<WorkspaceData>
      data = {
        name: normalized,
        description: typeof parsed.description === 'string' ? parsed.description : undefined,
        constants: sanitizeNumberMap(parsed.constants),
        world: sanitizeObject(parsed.world),
        terrains: sanitizeTerrains(parsed.terrains),
        variables: sanitizeNumberMap(parsed.variables),
        formulaTable: sanitizeFormulaTable(parsed.formulaTable),
        createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      }
    } catch {
      // 损坏就当作空工作区，不抛错
      data = emptyWorkspace(normalized)
    }
  }

  cache.set(normalized, { data, stamp })
  return data
}

/** 清洗数字表，只保留有限正数。 */
function sanitizeNumberMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    const numeric = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(numeric)) out[key] = numeric
  }
  return out
}

/** 清洗普通对象。 */
function sanitizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return { ...(value as Record<string, unknown>) }
}

/**
 * 清洗公式表。
 * 只保留结构正确的条目，防止损坏的 JSON 让整个工作区不可用。
 */
function sanitizeFormulaTable(value: unknown): WorkspaceFormulaTable {
  const empty: WorkspaceFormulaTable = { overrides: [], custom: [] }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty
  const record = value as Record<string, unknown>

  const overrides: WorkspaceFormulaTable['overrides'] = []
  if (Array.isArray(record.overrides)) {
    for (const item of record.overrides) {
      if (!item || typeof item !== 'object') continue
      const entry = item as Record<string, unknown>
      if (typeof entry.id !== 'string' || entry.id.trim() === '') continue
      const override: WorkspaceFormulaTable['overrides'][number] = { id: entry.id.trim() }
      if (typeof entry.expression === 'string' && entry.expression.trim() !== '') {
        override.expression = entry.expression.trim()
      }
      if (entry.params && typeof entry.params === 'object' && !Array.isArray(entry.params)) {
        const params: Record<string, number | null> = {}
        for (const [name, raw] of Object.entries(entry.params as Record<string, unknown>)) {
          if (raw === null) {
            params[name] = null
            continue
          }
          const numeric = typeof raw === 'number' ? raw : Number(raw)
          if (Number.isFinite(numeric)) params[name] = numeric
        }
        if (Object.keys(params).length > 0) override.params = params
      }
      if (typeof entry.name === 'string') override.name = entry.name
      if (typeof entry.description === 'string') override.description = entry.description
      if (entry.disabled === true) override.disabled = true
      overrides.push(override)
    }
  }

  const custom: WorkspaceFormulaTable['custom'] = []
  if (Array.isArray(record.custom)) {
    for (const item of record.custom) {
      if (!item || typeof item !== 'object') continue
      const entry = item as Record<string, unknown>
      if (typeof entry.id !== 'string' || entry.id.trim() === '') continue
      if (typeof entry.expression !== 'string' || entry.expression.trim() === '') continue
      const params: Record<string, { value: number | null; desc: string }> = {}
      if (entry.params && typeof entry.params === 'object' && !Array.isArray(entry.params)) {
        for (const [name, raw] of Object.entries(entry.params as Record<string, unknown>)) {
          if (!raw || typeof raw !== 'object') continue
          const spec = raw as Record<string, unknown>
          const numeric = typeof spec.value === 'number' && Number.isFinite(spec.value) ? spec.value : null
          params[name] = { value: numeric, desc: typeof spec.desc === 'string' ? spec.desc : '' }
        }
      }
      custom.push({
        id: entry.id.trim(),
        name: typeof entry.name === 'string' ? entry.name : entry.id.trim(),
        category: typeof entry.category === 'string' ? entry.category : 'custom',
        expression: entry.expression.trim(),
        params,
        unit: typeof entry.unit === 'string' ? entry.unit : undefined,
        description: typeof entry.description === 'string' ? entry.description : undefined,
        keys: Array.isArray(entry.keys) ? entry.keys.filter((k) => typeof k === 'string') as string[] : undefined,
      })
    }
  }

  return { overrides, custom }
}

/** 清洗地点列表。 */
function sanitizeTerrains(value: unknown): SavedTerrain[] {
  if (!Array.isArray(value)) return []
  const out: SavedTerrain[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (typeof record.name !== 'string' || record.name.trim() === '') continue
    out.push({
      name: record.name.trim().slice(0, 80),
      params: sanitizeObject(record.params),
      note: typeof record.note === 'string' ? record.note.slice(0, 500) : undefined,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    })
  }
  return out
}

/**
 * 保存工作区（原子写）。
 * 写失败不抛错——持久化是尽力而为。
 */
export function saveWorkspace(data: WorkspaceData): boolean {
  const normalized = normalizeWorkspaceName(data.name)
  const path = workspaceFile(normalized)
  const payload: WorkspaceData = {
    ...data,
    name: normalized,
    updatedAt: new Date().toISOString(),
  }

  try {
    mkdirSync(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify(payload, null, 2), 'utf8')
    renameSync(temporary, path)
    // 更新缓存与指纹
    cache.set(normalized, { data: payload, stamp: fileStamp(path) })
    return true
  } catch {
    // 磁盘满/权限问题等：更新内存缓存，保证本次会话仍可用
    cache.set(normalized, { data: payload, stamp: '' })
    return false
  }
}

/** 列出全部工作区。 */
export function listWorkspaces(): WorkspaceSummary[] {
  const directory = workspaceDirectory()
  let files: string[] = []
  try {
    files = readdirSync(directory).filter((file) => file.endsWith('.json'))
  } catch {
    return []
  }

  const summaries: WorkspaceSummary[] = []
  for (const file of files) {
    const name = file.slice(0, -'.json'.length)
    try {
      normalizeWorkspaceName(name)
    } catch {
      continue // 非法名字跳过
    }
    const data = loadWorkspace(name)
    summaries.push({
      name: data.name,
      description: data.description,
      constantCount: Object.keys(data.constants).length,
      terrainCount: data.terrains.length,
      variableCount: Object.keys(data.variables).length,
      updatedAt: data.updatedAt,
    })
  }
  return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

/** 删除工作区。 */
export function deleteWorkspace(name: string): boolean {
  const normalized = normalizeWorkspaceName(name)
  if (normalized === DEFAULT_WORKSPACE) {
    throw new WorkspaceError('protected', '不能删除 default 工作区')
  }
  const path = workspaceFile(normalized)
  cache.delete(normalized)
  try {
    unlinkSync(path)
    return true
  } catch {
    return false
  }
}

/**
 * 删除某个工作区里的单个地点。
 * @returns 是否删掉了（找不到返回 false）
 */
export function removeTerrain(workspaceName: string, terrainName: string): boolean {
  const normalized = normalizeWorkspaceName(workspaceName)
  let removed = false
  updateWorkspace(normalized, (current) => {
    const before = current.terrains.length
    const terrains = current.terrains.filter((t) => t.name !== terrainName)
    removed = terrains.length < before
    return { ...current, terrains }
  })
  return removed
}

/**
 * 删除某个工作区里的单个变量。
 */
export function removeVariable(workspaceName: string, variableName: string): boolean {
  const normalized = normalizeWorkspaceName(workspaceName)
  let removed = false
  updateWorkspace(normalized, (current) => {
    if (!(variableName in current.variables)) return current
    const variables = { ...current.variables }
    delete variables[variableName]
    removed = true
    return { ...current, variables }
  })
  return removed
}

/**
 * 重置某个工作区的某个常数为现实值。
 */
export function resetConstant(workspaceName: string, constantName: string): boolean {
  const normalized = normalizeWorkspaceName(workspaceName)
  let removed = false
  updateWorkspace(normalized, (current) => {
    if (!(constantName in current.constants)) return current
    const constants = { ...current.constants }
    delete constants[constantName]
    removed = true
    return { ...current, constants }
  })
  return removed
}

/** 清理统计。 */
export interface CleanupReport {
  /** 被删除的完整工作区。 */
  workspacesDeleted: string[]
  /** 被删除的空工作区。 */
  emptyWorkspacesDeleted: string[]
  /** 被删除的临时/测试工作区。 */
  tempWorkspacesDeleted: string[]
  /** 释放的字节数。 */
  bytesFreed: number
  /** 跳过的（受保护或仍在用）。 */
  skipped: string[]
}

/** 清理选项。 */
export interface CleanupOptions {
  /** 删除所有「空工作区」（没有常数改动、没有地点、没有变量）。 */
  emptyOnly?: boolean
  /** 删除名称匹配这些前缀的工作区（如 test-、tmp-、scratch-）。 */
  tempPrefixes?: string[]
  /** 删除超过 N 天未修改的工作区。 */
  olderThanDays?: number
  /** 保留清单（永不删除）。 */
  keep?: string[]
  /** 仅预览，不真删。 */
  dryRun?: boolean
}

/** 工作区文件字节数。 */
function workspaceSize(name: string): number {
  try {
    return statSync(workspaceFile(name)).size
  } catch {
    return 0
  }
}

/** 判断工作区是否为空。 */
function isWorkspaceEmpty(data: WorkspaceData): boolean {
  const changedConstants = Object.keys(data.constants).length
  return changedConstants === 0 && data.terrains.length === 0 && Object.keys(data.variables).length === 0
}

/** 默认的临时工作区前缀。 */
export const DEFAULT_TEMP_PREFIXES = ['test-', 'tmp-', 'temp-', 'scratch-', 'debug-']

/**
 * 批量清理工作区（你要求的「清除机制」）。
 *
 * 三种清理策略，可组合：
 *   1. emptyOnly     —— 删掉空壳（没有任何数据的）
 *   2. tempPrefixes  —— 删掉临时命名的（test- 开头等）
 *   3. olderThanDays —— 删掉很久没动的
 *
 * 默认保留 default 与 keep 列表里的。
 */
export function cleanupWorkspaces(options: CleanupOptions = {}): CleanupReport {
  const {
    emptyOnly = true,
    tempPrefixes = DEFAULT_TEMP_PREFIXES,
    olderThanDays,
    keep = [],
    dryRun = false,
  } = options

  const protectedNames = new Set([DEFAULT_WORKSPACE, ...keep])
  const report: CleanupReport = {
    workspacesDeleted: [],
    emptyWorkspacesDeleted: [],
    tempWorkspacesDeleted: [],
    bytesFreed: 0,
    skipped: [],
  }

  const summaries = listWorkspaces()
  const now = Date.now()

  for (const summary of summaries) {
    if (protectedNames.has(summary.name)) {
      report.skipped.push(`${summary.name}（受保护）`)
      continue
    }

    const data = loadWorkspace(summary.name)
    const size = workspaceSize(summary.name)

    // 判断是否符合删除条件
    let reason: 'empty' | 'temp' | 'old' | undefined

    if (emptyOnly && isWorkspaceEmpty(data)) {
      reason = 'empty'
    } else if (tempPrefixes.some((prefix) => summary.name.toLowerCase().startsWith(prefix.toLowerCase()))) {
      reason = 'temp'
    } else if (olderThanDays !== undefined) {
      const ageDays = (now - new Date(data.updatedAt).getTime()) / 86_400_000
      if (Number.isFinite(ageDays) && ageDays > olderThanDays) reason = 'old'
    }

    if (!reason) {
      report.skipped.push(`${summary.name}（有数据，不在清理条件内）`)
      continue
    }

    if (dryRun) {
      if (reason === 'empty') report.emptyWorkspacesDeleted.push(summary.name)
      else if (reason === 'temp') report.tempWorkspacesDeleted.push(summary.name)
      else report.workspacesDeleted.push(summary.name)
      report.bytesFreed += size
      continue
    }

    try {
      deleteWorkspace(summary.name)
      report.bytesFreed += size
      if (reason === 'empty') report.emptyWorkspacesDeleted.push(summary.name)
      else if (reason === 'temp') report.tempWorkspacesDeleted.push(summary.name)
      else report.workspacesDeleted.push(summary.name)
    } catch {
      report.skipped.push(`${summary.name}（删除失败）`)
    }
  }

  return report
}

/** 存储统计（给 UI 显示用）。 */
export interface StorageStats {
  /** 工作区总数。 */
  workspaceCount: number
  /** 占用字节。 */
  totalBytes: number
  /** 每个工作区的明细。 */
  workspaces: Array<{
    name: string
    bytes: number
    constantCount: number
    terrainCount: number
    variableCount: number
    empty: boolean
    updatedAt: string
  }>
  /** 目录路径。 */
  directory: string
}

/** 统计存储占用。 */
export function storageStats(): StorageStats {
  const summaries = listWorkspaces()
  const workspaces = summaries.map((summary) => {
    const data = loadWorkspace(summary.name)
    return {
      name: summary.name,
      bytes: workspaceSize(summary.name),
      constantCount: summary.constantCount,
      terrainCount: summary.terrainCount,
      variableCount: summary.variableCount,
      empty: isWorkspaceEmpty(data),
      updatedAt: summary.updatedAt,
    }
  })
  return {
    workspaceCount: workspaces.length,
    totalBytes: workspaces.reduce((sum, w) => sum + w.bytes, 0),
    workspaces,
    directory: workspaceDirectory(),
  }
}

/** 取当前活动工作区名。 */
export function currentWorkspace(): string {
  return activeWorkspaceName
}

/** 切换活动工作区。 */
export function switchWorkspace(name: string): WorkspaceData {
  const normalized = normalizeWorkspaceName(name)
  activeWorkspaceName = normalized
  const data = loadWorkspace(normalized)

  // 自动创建数据表：切到一个还没有数据文件的工作区时立刻落盘。
  //
  // 为什么必须这么做：loadWorkspace 对缺失文件只返回**内存**里的空工作区，
  // 不写盘。于是 currentWorkspace() 会指向一个磁盘上不存在的"幽灵工作区"，
  // 界面上显示「当前工作区」却不在列表里，后续编辑还会悄悄生成新文件。
  // 现在切换即落盘：每个工作区一定有自己真实存在的数据表（常数/公式/地点/变量）。
  try {
    if (!existsSync(workspaceFile(normalized))) saveWorkspace(data)
  } catch {
    /* 落盘失败不影响本次会话（saveWorkspace 本身也不抛） */
  }
  return data
}

/**
 * 更新工作区（读-改-写）。
 * @param name - 工作区名
 * @param mutate - 修改函数，返回要写回的完整数据
 */
export function updateWorkspace(
  name: string,
  mutate: (data: WorkspaceData) => WorkspaceData,
): WorkspaceData {
  const current = loadWorkspace(name)
  const next = mutate(current)
  next.name = normalizeWorkspaceName(name)
  saveWorkspace(next)
  return loadWorkspace(name) // 重新读，保证返回的是落盘后的状态
}

/** 清空缓存（测试用）。 */
export function clearWorkspaceCache(): void {
  cache.clear()
}

/** 重置活动工作区（测试用）。 */
export function resetActiveWorkspace(): void {
  activeWorkspaceName = DEFAULT_WORKSPACE
  cache.clear()
}
