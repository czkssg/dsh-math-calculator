/**
 * 宿主契约的复刻件（测试专用）。
 *
 * 存在的理由：**以前的桩不校验任何契约，于是插件在真宿主里全盘失效而测试全绿。**
 *
 * 两次真机事故都出在这里：
 *   1. `apply` 里直接读 `ctx.systemPrompt` —— 真宿主的 ctx 是 Proxy，读未在 `inject`
 *      声明的服务会抛 `cannot get property "systemPrompt" without inject`，整个 entry
 *      判为 did not activate，**工具根本没注册**。当时的桩是个普通对象，随便读都不报错。
 *   2. UI 路由写成 `ctx.server.route(prefix, req => res)` —— 宿主既没有 `server` 服务，
 *      也没有 `route()` 方法；真契约是 `ctx.inject(['webServer'], cb)` +
 *      `webServer.register({kind, path, handler})` + express 风格 handler。
 *
 * 本文件逐字复刻真宿主的行为，依据（宿主 DSH 0.2.1-rc.2）：
 *   - cordis 4.0.5 `ReflectService.handler`（get 陷阱与 inject 判据）
 *   - `@deepseek-ai/dsh-host-webserver/lib/index.js` 的 `register()` / `match()` / 请求派发
 *
 * 改这里之前先回去读宿主源码——这个文件的价值就在于「和宿主一样」。
 *
 * @module test/_host-mocks
 */

/**
 * 复刻 cordis 4 的 ctx。
 *
 * 行为要点：
 *   - 读**未**在 `inject` 声明的服务 → 抛 `cannot get property "X" without inject`
 *     （注意：即使该服务已经被 provide 出来，只要没声明 inject 就照样抛——这正是
 *     插件当初挂掉的原因）
 *   - `ctx.get(name)` 是唯一免声明的读法，未提供时返回 `undefined`
 *   - `get/provide/on/emit/inject` 是混入的方法，可以随便用
 *   - `ctx.inject(names, cb)`：依赖不齐时**不调用**回调（返回一个空 fiber）；齐了才调，
 *     回调拿到的是**多声明了这些服务的子 ctx**（父 ctx 读不到，这是真 cordis 的 fiber 语义）
 *
 * @param options - `{ inject: string[], services: Record<string, unknown> }`
 * @returns `{ ctx, hooks, store, injected }`
 */
export function makeCordisCtx(options = {}) {
  const store = new Map(Object.entries(options.services ?? {}))
  const hooks = {}
  const injected = []

  /**
   * 造一个 ctx 代理。
   *
   * `declared` 是这个 ctx 能「直接读」的服务集合：插件的 `export const inject`
   * 决定根 ctx 能读什么；`ctx.inject(names, cb)` 的回调拿到的是**多声明了 names
   * 的子 ctx**（真 cordis 的 fiber 语义）。
   *
   * 这一点必须复刻到位：曾把父 ctx 传给回调，于是回调里读 `webCtx.webServer`
   * 被 Proxy 拦下抛错，插件自己的 try/catch 把异常吞掉 → 路由一条都没注册，
   * 而测试以为「插件坏了」。实测真宿主行为是：回调拿到的子 ctx 能直接读该服务。
   */
  const makeProxy = (declared) =>
    new Proxy(
      {
        get: (name) => store.get(name),
        provide: (name, value) => {
          store.set(name, value)
          return () => store.delete(name)
        },
        on: (event, handler) => {
          hooks[event] = handler
          return () => {}
        },
        emit: () => {},
        inject: (names, callback) => {
          const missing = [...names].filter((name) => !store.has(name))
          if (missing.length > 0) return { dispose() {} }
          injected.push({ names: [...names], callback })
          // 回调用子 ctx：真 cordis 的嵌套 inject 就是这样把依赖交给回调的
          const result = callback(makeProxy(new Set([...declared, ...names])), undefined)
          return { dispose() {}, result }
        },
      },
      {
        get(target, prop) {
          if (typeof prop === 'symbol') return Reflect.get(target, prop)
          if (Reflect.has(target, prop)) return Reflect.get(target, prop)
          if (declared.has(prop)) return store.get(prop)
          throw new Error(`cannot get property "${String(prop)}" without inject`)
        },
      },
    )

  const proxy = makeProxy(new Set(options.inject ?? []))
  return { ctx: proxy, hooks, store, injected }
}

/**
 * 复刻 `@deepseek-ai/dsh-host-webserver` 的 WebServer。
 *
 * `match()` 是**逐字**抄的宿主实现：
 *
 *     if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue
 *
 * 也就是说前缀自带后面那个斜杠 —— 注册的 prefix 一旦带了尾斜杠，
 * 除了裸斜杠路径外永远匹配不上（真机踩过）。
 *
 * @returns 带 `register` / `match` / `routes` 的假 webserver。
 */
export function makeFakeWebServer() {
  const exact = new Map()
  const prefix = new Map()
  let fallback

  return {
    /** 注册表，供测试断言用。 */
    routes: { exact, prefix },
    register(route) {
      const table = route.kind === 'exact' ? exact : prefix
      if (table.has(route.path)) {
        throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`)
      }
      table.set(route.path, route)
      return () => table.delete(route.path)
    },
    registerUpgrade() {
      return () => {}
    },
    registerFallback(handler) {
      fallback = handler
      return () => {
        fallback = undefined
      }
    },
    /** 逐字复刻宿主 match()：先精确表，再前缀表取最长。 */
    match(pathname) {
      const hit = exact.get(pathname)
      if (hit !== undefined) return hit
      let best
      for (const [path, route] of prefix) {
        if (pathname !== path && !pathname.startsWith(`${path}/`)) continue
        if (best === undefined || path.length > best.path.length) best = route
      }
      return best
    },
    get fallback() {
      return fallback
    },
  }
}

/**
 * 造一个 express 风格的假 req。
 *
 * @param spec - `{ method, url, body, headers, remoteAddress }`
 * @returns 假 req（带异步迭代器，模拟可读流请求体）
 */
export function makeFakeReq(spec = {}) {
  const chunks = spec.body === undefined ? [] : [Buffer.from(spec.body)]
  return {
    method: spec.method ?? 'GET',
    url: spec.url ?? '/',
    headers: { host: '127.0.0.1:1234', ...(spec.headers ?? {}) },
    socket: { remoteAddress: spec.remoteAddress ?? '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

/**
 * 造一个假 res，记录 writeHead/end。
 *
 * @returns 假 res，含 `status` / `json` getter。
 */
export function makeFakeRes() {
  const res = {
    statusCode: undefined,
    headers: undefined,
    payload: '',
    writeHead(status, headers) {
      res.statusCode = status
      res.headers = headers
      return res
    },
    end(chunk) {
      if (chunk !== undefined && chunk !== null) res.payload = String(chunk)
      return res
    },
  }
  Object.defineProperty(res, 'status', { get: () => res.statusCode })
  Object.defineProperty(res, 'json', {
    get: () => {
      if (res.payload === '') return undefined
      try {
        return JSON.parse(res.payload)
      } catch {
        return undefined
      }
    },
  })
  return res
}

/**
 * 按宿主的方式派发一个请求：匹配路由 → `await route.handler(req, res)`。
 *
 * @param webServer - `makeFakeWebServer()` 的产物。
 * @param method - HTTP 方法。
 * @param url - 完整 URL 或 path（查询串会被剥掉，与宿主一致）。
 * @param options - 透传给 `makeFakeReq`。
 * @returns `{ matched, status, json, payload }`；没匹配到路由时 `matched=false`。
 */
export async function callRoute(webServer, method, url, options = {}) {
  const pathname = new URL(url, 'http://x').pathname
  const route = webServer.match(pathname)
  if (route === undefined) {
    return { matched: false, status: undefined, json: undefined, payload: '' }
  }
  const req = makeFakeReq({ method, url, ...options })
  const res = makeFakeRes()
  await route.handler(req, res)
  return { matched: true, status: res.statusCode, json: res.json, payload: res.payload }
}