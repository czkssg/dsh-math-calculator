/**
 * 给 UI 用的后端 API。
 *
 * 说明：DSH 的插件可以在 node 侧注册 HTTP 路由（novel-writer 就是这么做的：
 * 它注册了 /api/dsh-novel-writer/state 给侧栏面板用）。
 * 这里注册 /api/dsh-math-calculator/*，前端只负责展示。
 *
 * **为什么把逻辑放后端**：避免前端复制一份业务规则。
 * 删除保护、名字校验、清理条件全部复用 workspace.ts 的实现，
 * 前端改坏了也不会绕过安全边界。
 *
 * @module dsh-math-calculator/api
 */

import { existsSync } from 'node:fs'
import {
  cleanupWorkspaces,
  currentWorkspace,
  deleteWorkspace,
  listWorkspaces,
  loadWorkspace,
  normalizeWorkspaceName,
  removeTerrain,
  removeVariable,
  resetConstant,
  storageStats,
  switchWorkspace,
  updateWorkspace,
  workspaceFilePath,
  lastExecShape,
  bindHostWorkspace,
} from './workspace.js'
import { CONSTANT_GRAPH, setActiveConstants } from './constants-graph.js'
import { emptyFormulaTable, removeOverride, upsertOverride } from './formula-table.js'
import { getPromptMode, setPromptMode, type PromptMode } from './awareness.js'

/** 简单的 HTTP 请求/响应抽象（避免依赖具体宿主类型）。 */
interface ApiRequest {
  method?: string
  params?: Record<string, string>
  body?: unknown
}

/**
 * 全部「具名」路由。
 *
 * 用途只有一个：区分「路径打错」（404）与「路径对但方法不对」（405）。
 * 不含 `workspaces/<name>` 这条动态详情路由——它只有 GET 一种形态。
 */
const KNOWN_ROUTES = new Set([
  'constants',
  'formula-table',
  'settings',
  'workspaces',
  'workspaces/stats',
  'workspaces/create',
  'workspaces/switch',
  'workspaces/delete',
  'workspaces/reset',
  'workspaces/remove-terrain',
  'workspaces/remove-variable',
  'workspaces/reset-constant',
  'workspaces/save-constant',
  'workspaces/cleanup',
])

interface ApiResponse {
  status: number
  json: unknown
}

/** 统一的成功响应。 */
function ok(json: unknown): ApiResponse {
  return { status: 200, json }
}

/** 统一的错误响应。 */
function fail(status: number, message: string): ApiResponse {
  return { status, json: { error: message } }
}

/** 从 body 里取字符串字段。 */
function field(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const value = (body as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * 处理一个 API 请求。
 *
 * 路由表：
 *   GET  /workspaces                     列出工作区
 *   GET  /workspaces/stats               存储统计
 *   GET  /workspaces/:name               单个工作区详情
 *   POST /workspaces/create              {name, description?}
 *   POST /workspaces/switch              {name}
 *   POST /workspaces/delete              {name}
 *   POST /workspaces/reset               {name}
 *   POST /workspaces/remove-terrain      {name, terrainName}
 *   POST /workspaces/remove-variable     {name, variableName}
 *   POST /workspaces/reset-constant      {name, constantName}
 *   POST /workspaces/save-constant       {name, constantName, value}
 *   POST /workspaces/cleanup             {dryRun?, olderThanDays?, keep?}
 *
 * @param path - 去掉前缀后的路径，如 "/workspaces/stats"
 * @param request - 请求
 * @returns 响应
 */
/**
 * 最近一次「客户端心跳」。
 *
 * 面板在浏览器里挂载，宿主侧看不见；出问题时只能猜。客户端每次挂载
 * 回报一次「我注册了什么」，这里存下来，`GET client-status` 读回。
 */
let clientHeartbeat: { at: string; payload: Record<string, unknown> | null } | null = null

/**
 * 处理一次 UI 后端请求。
 *
 * @param path - 去掉前缀的路径
 * @param request - 请求
 * @returns 响应
 */
export function handleApiRequest(path: string, request: ApiRequest): ApiResponse {
  const method = (request.method ?? 'GET').toUpperCase()
  const body = request.body
  const route = path.replace(/^\/+/, '').replace(/\/+$/, '')

  try {
    // ── 列表 ──
    if (method === 'GET' && (route === 'workspaces' || route === '')) {
      return ok({ current: currentWorkspace(), workspaces: listWorkspaces() })
    }

    // ── 统计 ──
    if (method === 'GET' && route === 'workspaces/stats') {
      return ok(storageStats())
    }

    // ── 按宿主工作区绑定数据表（「一个工作区一张同名数据表」的真正入口）──
    //
    // 宿主的每个工作区有稳定身份：`workspaceId` + `path` + `title`
    // （来自 uiWorkspace.workspaces.list）。用它派生数据表名，于是：
    //   · 切到工作区 A → 自动建/读 A 的表；切到 B → 自动建/读 B 的表；
    //   · 互不影响，也不会凭空多出与宿主无关的 default。
    //
    // GET  ：查询（不存在就**创建**）
    // POST ：显式绑定（带上 title 便于第一次命名）
    if (route === 'workspaces/bind') {
      const params = request.params ?? {}
      const rawId = method === 'GET' ? (params.workspaceId ?? '') : field(body, 'workspaceId')
      const rawTitle = method === 'GET' ? (params.title ?? '') : field(body, 'title')
      return ok(bindHostWorkspace(rawId, rawTitle))
    }

    // ── 批量补建：给「已存在的宿主工作区」一次性建齐数据表 ──
    //
    // 两个用途：
    //   ① 插件刚装上时，宿主已经有若干工作区 → 一次性补建，不用一个个点；
    //   ② 宿主工作区被新建/重命名后 → 再同步一次。
    //
    // body: { workspaces: [{ workspaceId, title }, ...] }
    // 返回每个工作区的处理结果（新建 / 已有）与汇总。
    if (route === 'workspaces/sync') {
      const rawList = body && typeof body === 'object' ? (body as Record<string, unknown>).workspaces : undefined
      const items = Array.isArray(rawList) ? rawList : []
      const results: Array<{ name: string; workspaceId: string; title: string; created: boolean }> = []
      for (const item of items) {
        const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
        const bound = bindHostWorkspace(record.workspaceId, record.title)
        results.push({
          name: bound.name,
          workspaceId: bound.workspaceId,
          title: typeof record.title === 'string' ? record.title : '',
          created: bound.created,
        })
      }
      return ok({
        total: results.length,
        created: results.filter((item) => item.created).length,
        existing: results.filter((item) => !item.created).length,
        results,
      })
    }

    // ── 当前工作区详情（右侧边栏用：打开就看到本工作区的数据表）──
    //
    // 必须放在下面的 `workspaces/` 前缀匹配**之前**，否则 "workspaces/current"
    // 会被当成工作区名 "current" 处理。
    if (method === 'GET' && route === 'workspaces/current') {
      const name = currentWorkspace()
      const data = loadWorkspace(name)
      return ok({
        ...data,
        // 给界面用的摘要：一眼看清本工作区改了什么
        summary: {
          name,
          changedConstants: Object.keys(data.constants ?? {}).length,
          overrides: (data.formulaTable?.overrides ?? []).length,
          customFormulas: (data.formulaTable?.custom ?? []).length,
          terrains: (data.terrains ?? []).length,
          variables: Object.keys(data.variables ?? {}).length,
        },
      })
    }

    // ── 详情 ──
    if (method === 'GET' && route.startsWith('workspaces/')) {
      const name = decodeURIComponent(route.slice('workspaces/'.length))
      const data = loadWorkspace(normalizeWorkspaceName(name))
      return ok(data)
    }

    // ── 客户端心跳（诊断：面板到底挂上了没有）──
    if (method === 'GET' && route === 'client-status') {
      return ok({
        heartbeat: clientHeartbeat,
        // 最近一次工具调用的 exec 结构（含取到的 cwd 与推出的作用域）。
        // 「数据表不跟工作区走」的排查全靠这一项。
        execShape: lastExecShape,
        currentWorkspace: currentWorkspace(),
      })
    }

    // ── 设置（提示档位）──
    if (method === 'GET' && route === 'settings') {
      return ok({ promptMode: getPromptMode(), modes: ['off', 'brief', 'full'] })
    }

    // ── 当前工作区的常数表 ──
    //
    // UI 不自己维护常数清单，一律以后端为准：
    //   base      —— 可调旋钮的现实标准值（含单位与说明）
    //   overrides —— 当前工作区已改动的值
    if (method === 'GET' && route === 'constants') {
      const name = normalizeWorkspaceName(currentWorkspace())
      const data = loadWorkspace(name)
      const base = CONSTANT_GRAPH.filter((node) => node.fundamental).map((node) => ({
        name: node.name,
        standard: node.standard,
        unit: node.unit,
        meaning: node.meaning,
      }))
      return ok({ workspace: name, base, overrides: data.constants ?? {} })
    }

    // ── 当前工作区的公式表 ──
    if (method === 'GET' && route === 'formula-table') {
      const name = normalizeWorkspaceName(currentWorkspace())
      const table = loadWorkspace(name).formulaTable ?? emptyFormulaTable()
      return ok({ workspace: name, overrides: table.overrides, custom: table.custom })
    }

    if (method !== 'POST') {
      // 路径认识、只是方法不对 → 405；路径本身不认识 → 404。
      // 原先一律回 405，会把「路径打错」误报成「方法不对」，面板排查时被这句话带偏。
      return KNOWN_ROUTES.has(route)
        ? fail(405, '不支持的请求方法')
        : fail(404, `未知路径: ${route}`)
    }

    // ── 客户端心跳写入 ──
    if (route === 'client-hello') {
      clientHeartbeat = {
        at: new Date().toISOString(),
        payload: body && typeof body === 'object' ? (body as Record<string, unknown>) : null,
      }
      return ok({ recorded: true })
    }

    // ── 设置：切换提示档位 ──
    if (route === 'settings') {
      const mode = field(body, 'promptMode')
      if (mode !== 'off' && mode !== 'brief' && mode !== 'full') {
        return fail(400, 'promptMode 只能是 off / brief / full')
      }
      setPromptMode(mode as PromptMode)
      return ok({ promptMode: getPromptMode(), switched: true })
    }

    // ── 公式表：停用 / 启用 / 重置单条 ──
    if (route === 'formula-table') {
      const name = normalizeWorkspaceName(field(body, 'name'))
      const action = field(body, 'action')
      const formulaId = field(body, 'formulaId')
      if (!formulaId) return fail(400, '缺少 formulaId')
      if (action !== 'disable' && action !== 'enable' && action !== 'reset') {
        return fail(400, 'action 只能是 disable / enable / reset')
      }

      let message = ''
      const data = updateWorkspace(name, (current) => {
        const table = current.formulaTable ?? emptyFormulaTable()
        if (action === 'reset') {
          const result = removeOverride(table, formulaId)
          message = result.message
          return { ...current, formulaTable: result.table }
        }
        const existing = table.overrides.find((item) => item.id === formulaId)
        const result = upsertOverride(table, { ...(existing ?? {}), id: formulaId, disabled: action === 'disable' })
        message = result.message
        return { ...current, formulaTable: result.table }
      })
      return ok({ workspace: name, action, formulaId, message, overrides: data.formulaTable?.overrides ?? [] })
    }

    // ── 新建 ──
    if (route === 'workspaces/create') {
      const name = normalizeWorkspaceName(field(body, 'name'))
      if (name === 'default') return fail(400, '不能创建名为 default 的工作区')
      const description = field(body, 'description')
      const data = updateWorkspace(name, (current) => ({
        ...current,
        description: description ?? current.description,
      }))
      switchWorkspace(name)
      setActiveConstants(data.constants)
      return ok({ created: true, workspace: data })
    }

    // ── 切换 ──
    if (route === 'workspaces/switch') {
      const name = normalizeWorkspaceName(field(body, 'name'))
      const data = switchWorkspace(name)
      setActiveConstants(data.constants)
      return ok({ switched: true, current: name, constants: data.constants })
    }

    // ── 删除 ──
    if (route === 'workspaces/delete') {
      const name = normalizeWorkspaceName(field(body, 'name'))
      const deleted = deleteWorkspace(name)
      return ok({ deleted, name })
    }

    // ── 重置常数 ──
    if (route === 'workspaces/reset') {
      const name = normalizeWorkspaceName(field(body, 'name'))
      const data = updateWorkspace(name, (current) => ({ ...current, constants: {} }))
      if (currentWorkspace() === name) setActiveConstants({})
      return ok({ reset: true, workspace: data })
    }

    // ── 删地点 ──
    if (route === 'workspaces/remove-terrain') {
      const name = normalizeWorkspaceName(field(body, 'name'))
      const terrainName = field(body, 'terrainName')
      if (!terrainName) return fail(400, '缺少 terrainName')
      const removed = removeTerrain(name, terrainName)
      return ok({ removed, name, terrainName })
    }

    // ── 删变量 ──
    if (route === 'workspaces/remove-variable') {
      const name = normalizeWorkspaceName(field(body, 'name'))
      const variableName = field(body, 'variableName')
      if (!variableName) return fail(400, '缺少 variableName')
      const removed = removeVariable(name, variableName)
      return ok({ removed, name, variableName })
    }

    // ── 写入变量（新增/修改本工作区的变量）──
    //
    // 右侧「本工作区」面板的管理区用它；与 save-constant 同一套形状，
    // 保证 UI 不自己拼数据结构。
    if (route === 'workspaces/set-variable') {
      const name = normalizeWorkspaceName(field(body, 'name'))
      const variableName = field(body, 'variableName')
      if (!variableName) return fail(400, '缺少 variableName')
      const rawValue = body && typeof body === 'object' ? (body as Record<string, unknown>).value : undefined
      const value = typeof rawValue === 'number' ? rawValue : Number(rawValue)
      if (!Number.isFinite(value)) return fail(400, '变量值必须是有限数')
      updateWorkspace(name, (current) => ({
        ...current,
        variables: { ...current.variables, [variableName]: value },
      }))
      return ok({ saved: true, name, variableName, value })
    }

    // ── 写入地点（新增/修改本工作区的地点）──
    if (route === 'workspaces/save-terrain') {
      const name = normalizeWorkspaceName(field(body, 'name'))
      const terrain = body && typeof body === 'object' ? (body as Record<string, unknown>).terrain : undefined
      if (!terrain || typeof terrain !== 'object') return fail(400, '缺少 terrain 对象')
      const terrainName = typeof (terrain as Record<string, unknown>).name === 'string'
        ? String((terrain as Record<string, unknown>).name).trim()
        : ''
      if (terrainName === '') return fail(400, '缺少 terrain.name')
      const data = updateWorkspace(name, (current) => {
        const rest = current.terrains.filter((item) => item.name !== terrainName)
        return { ...current, terrains: [...rest, terrain as never] }
      })
      return ok({ saved: true, name, terrain: data.terrains.find((item) => item.name === terrainName) })
    }

    // ── 重置单个常数 ──
    if (route === 'workspaces/reset-constant') {
      const name = normalizeWorkspaceName(field(body, 'name'))
      const constantName = field(body, 'constantName')
      if (!constantName) return fail(400, '缺少 constantName')
      const removed = resetConstant(name, constantName)
      const data = loadWorkspace(name)
      if (currentWorkspace() === name) setActiveConstants(data.constants)
      return ok({ removed, name, constantName })
    }

    // ── 保存单个常数 ──
    if (route === 'workspaces/save-constant') {
      const name = normalizeWorkspaceName(field(body, 'name'))
      const constantName = field(body, 'constantName')
      if (!constantName) return fail(400, '缺少 constantName')
      const raw = body && typeof body === 'object' ? (body as Record<string, unknown>).value : undefined
      const value = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(value) || value <= 0) return fail(400, '常数必须是正的有限数')
      const data = updateWorkspace(name, (current) => ({
        ...current,
        constants: { ...current.constants, [constantName]: value },
      }))
      if (currentWorkspace() === name) setActiveConstants(data.constants)
      return ok({ saved: true, name, constantName, value })
    }

    // ── 清理 ──
    if (route === 'workspaces/cleanup') {
      const options: Record<string, unknown> = {}
      if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>
        if (record.dryRun === true) options.dryRun = true
        if (typeof record.olderThanDays === 'number') options.olderThanDays = record.olderThanDays
        if (Array.isArray(record.keep)) options.keep = record.keep
        if (typeof record.emptyOnly === 'boolean') options.emptyOnly = record.emptyOnly
      }
      const report = cleanupWorkspaces(options as Parameters<typeof cleanupWorkspaces>[0])
      return ok(report)
    }

    // 走到这里说明：路径认识，但没有对应的 POST 处理 → 405 而不是 404。
    // 否则 UI 会把「方法用错」误判成「接口不存在」，排查方向就歪了。
    return KNOWN_ROUTES.has(route)
      ? fail(405, '该路径不支持此请求方法')
      : fail(404, `未知路径: ${route}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fail(400, message)
  }
}

/**
 * 本插件 HTTP 前缀（唯一性关键：撞了别的插件会互相截胡）。
 *
 * 注册 prefix 路由时**不能带尾斜杠** —— 宿主判据是
 * `pathname === prefix || pathname.startsWith(prefix + '/')`，自带斜杠；
 * 写尾斜杠会让除裸路径外的所有子路由失效。
 */
export const API_PREFIX = '/api/dsh-math-calculator'

// ────────────────────────────────────────────────────────────────────────────
// 宿主 HTTP 路由适配层
// ────────────────────────────────────────────────────────────────────────────
//
// 这一层存在的唯一原因：**宿主的真实路由契约与原设计完全不同**。
//
// 实测依据（宿主 DSH 0.2.1-rc.2）：HTTP 服务由 `@deepseek-ai/dsh-host-webserver`
// 提供，服务名是 `webServer`（源码 `super(ctx, "webServer")`），契约是：
//
//   1. 必须用 `ctx.inject(['webServer'], (wctx) => ...)` 拿到上下文。
//      —— 这**不会**阻塞插件本身加载：它是一个嵌套 fiber，服务永远不来就只是回调不跑。
//   2. 注册用 `wctx.webServer.register({ kind, path, handler })`，
//      kind ∈ {'exact' | 'prefix'}；同一张表内重复 path 直接抛错。
//   3. handler 是 **express 风格 `(req, res)`**，由宿主 `await route.handler(req, res)` 调用，
//      必须自己 `res.writeHead(...)` + `res.end(...)` 写出响应。
//   4. 匹配只看 URL 的 pathname（查询串被剥掉），先精确表、再最长前缀、最后回退 handler。
//   5. 前缀判据是 `pathname === prefix || pathname.startsWith(prefix + '/')`
//      —— 所以注册的 prefix **自带宽限**，写尾斜杠就永远匹配不上（见 buildApiRoutes 注释）。
//
// 原实现写的是 `ctx.server.route(prefix, (request) => ApiResponse)` ——
// 既没有 `server` 这个服务，也没有 `route(prefix, fn)` 这个方法，handler 形状也不对。
// 那套写法在任何宿主上都不会生效（且历史上从未在真宿主验证过）。
// 参考实现在 dsh-novel-writer（已在生产的插件），此处按同款契约书写。

/** 宿主 webserver 的一条路由。 */
export interface WebRoute {
  /** 精确匹配或前缀匹配。 */
  kind: 'exact' | 'prefix'
  /** 匹配的 pathname。 */
  path: string
  /** express 风格 handler：自己写响应。 */
  handler: (req: any, res: any) => Promise<void> | void
}

/** POST 体的上限：1MB。超过即当“没有 body”处理，避免被大请求拖住。 */
const BODY_LIMIT = 1024 * 1024

/** 写一个 JSON 响应（沿用宿主 handler 的 res 契约）。 */
function writeJson(res: any, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(payload)
}

/**
 * 只接受本机回环请求。
 *
 * 这些接口能**删除工作区**，所以默认不开 LAN：宿主可以把 webServer 绑到某个
 * 局域网地址（配置允许具体接口地址，只拒绝通配地址），绑上去就意味着同网段
 * 任何人都能删数据。判据与 dsh-novel-writer 的 isLoopbackRequest 一致：
 * 看 socket 远端地址 + Host 头 + Sec-Fetch-Site + Origin。
 */
function isLoopbackRequest(request: any): boolean {
  const address = request?.socket?.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request?.headers?.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') {
    return false
  }
  if (request?.headers?.['sec-fetch-site'] === 'cross-site') return false
  const origin = request?.headers?.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** 读 JSON 请求体；空体或非法 JSON 一律返回 undefined（调用方讲成“参数缺失”）。 */
async function readJsonBody(request: any): Promise<unknown> {
  if (request === null || typeof request !== 'object' || typeof request[Symbol.asyncIterator] !== 'function') {
    return undefined
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    size += buffer.length
    if (size > BODY_LIMIT) return undefined
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * 组装 UI 后端路由。
 *
 * 两条一起挂：
 *   - `exact`  API_PREFIX  → 裸入口（不带尾斜杠），GET 列出工作区
 *   - `prefix` API_PREFIX  → 其余全部子路径，交给 handleApiRequest 分发
 *
 * ⚠️ prefix 的 path **绝不能带尾斜杠**。宿主的匹配判据是逐字这样的
 * （`dsh-host-webserver/lib/index.js` 的 `match()`）：
 *
 *     if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue
 *
 * 也就是说「前缀」这个概念本身已经包含了后面那个 `/`。若把 path 写成
 * `/api/dsh-math-calculator/`，判据会去找 `/api/dsh-math-calculator//...`，
 * 于是**除了裸斜杠路径之外永远匹配不上**。
 * 实测症状（隔离真机）：`/api/dsh-math-calculator/` 返回 200（走了 `pathname === prefix`），
 * 而 `/api/dsh-math-calculator/workspaces` 落到宿主自己的 `/api` 栅栏拿 401。
 *
 * 边界已由宿主保证（前缀之后必须是 `/`），所以不必自己防
 * `/api/dsh-math-calculator-other`——它既不等于前缀、也不以 `前缀/` 开头。
 * 精确表先于前缀表匹配，所以 API_PREFIX 本身走 exact 那条；
 * 两张表各存一份同名字符串不算冲突（重复检测是 per-table 的）。
 *
 * @returns 交给 `webServer.register` 的路由数组。
 */
export function buildApiRoutes(): WebRoute[] {
  const handler = async (req: any, res: any): Promise<void> => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: 'forbidden: 仅本机回环可访问' })
      return
    }
    const method = String(req?.method ?? 'GET').toUpperCase()
    const rawPath = String(req?.url ?? '/')
    let pathname: string
    try {
      pathname = new URL(rawPath, 'http://localhost').pathname
    } catch {
      writeJson(res, 400, { error: '非法请求路径' })
      return
    }
    if (!pathname.startsWith(API_PREFIX)) {
      writeJson(res, 404, { error: `未知路径: ${pathname}` })
      return
    }
    const rest = pathname.slice(API_PREFIX.length)
    const body = method === 'POST' ? await readJsonBody(req) : undefined
    const response = handleApiRequest(rest, { method, body })
    writeJson(res, response.status, response.json)
  }

  return [
    { kind: 'exact', path: API_PREFIX, handler },
    { kind: 'prefix', path: API_PREFIX, handler },
  ]
}
