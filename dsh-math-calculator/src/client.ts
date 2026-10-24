/**
 * 浏览器端 UI：工作区管理器。
 *
 * ⚠️ 格式说明（这里踩过大坑，务必保留）：
 *   DSH 的 client 插件**不是 ESM 模块**，而是浏览器全局加载器格式：
 *     window.__ModuleLoader__.load({ id, factory })
 *   factory 返回 { apply, inject }，宿主用内部的 require 提供 react。
 *
 *   之前我把它写成普通的 ESM 导出（export const apply），
 *   编译产物是 import/export —— 宿主根本不会认，面板永远不出现。
 *   参考 dsh-novel-writer 的 lib/client.js，它与宿主对接就用这一种格式。
 *
 * 设计取舍：
 *   - 不打包 React（省 13MB），用宿主注入的 react
 *   - 所有数据操作走 /api/dsh-math-calculator/* 路由，前端只负责展示
 *   - 用 React.createElement 手写，不引入 UI 组件库
 *
 * 构建注意：本文件必须保持「无 import/export 语句」，
 * 由 tsconfig 编译成普通脚本；package.json 的 exports 指向 lib/client.js。
  *
 * @module dsh-math-calculator/client
*/

;(function () {
  'use strict'

  // 用「包名.用途」做键，和社区插件一致（例如 dsh-my-guardian 用自己的包名作 TAB key），
  // 这样即使以后有别的数学类插件，也不会撞 key。
  const PANEL_ID = 'dsh-math-calculator.workspaces'
  const API_BASE = '/api/dsh-math-calculator'

  /**
   * 跨面板的工作区通知（轻量订阅，不引入依赖）。
   *
   * 为什么需要：左侧是全局管理、右侧是本工作区，两个面板来自**同一个 client bundle**，
   * 所以可以用模块级订阅互通 —— 左栏切换工作区后，右栏立刻重新拉取，不需要轮询。
   * （社区插件 dsh-better-sidebar 用宿主的 sidebarRight/mounted store 达到同样效果；
   *   我们额外用这个自建 store 覆盖「左栏切换」这条路径。）
   */
  const workspaceListeners = new Set<() => void>()
  function notifyWorkspaceChanged(name?: string) {
    for (const listener of Array.from(workspaceListeners)) {
      try { listener() } catch { /* 单个面板出错不影响其它 */ }
    }
  }
  function subscribeWorkspace(listener: () => void) {
    workspaceListeners.add(listener)
    return function () { workspaceListeners.delete(listener) }
  }

  /**
   * 设计令牌：**左/右两栏共用同一套**（这就是「左右 UI 对应」的基础）。
   *
   * 全部取宿主主题的 CSS 变量（--dsw-*），所以深浅色、字号、圆角、悬停态
   * 都由宿主统一决定，视觉上自动与原生界面一致。
   * 这是社区插件的做法（dsh-context / dsh-better-sidebar / agent-teams /
   * dsh-my-guardian 全部只用令牌，不写死颜色）；它们的样式里共出现 103 个
   * --dsw-* 令牌，我们只取其中与面板相关的一组。
   */
  const UI = {
    text1: 'var(--dsw-alias-label-primary)',
    text2: 'var(--dsw-alias-label-secondary)',
    text3: 'var(--dsw-alias-label-tertiary)',
    border: 'var(--dsw-alias-border-l2)',
    borderSoft: 'var(--dsw-alias-border-l1)',
    surface2: 'var(--dsw-alias-bg-layer-2)',
    hover: 'var(--dsw-alias-interactive-bg-hover)',
    accent: 'var(--dsw-alias-accent)',
    danger: 'var(--dsw-alias-danger)',
    warn: 'var(--dsw-alias-state-warn-primary)',
    ok: 'var(--dsw-alias-state-success-primary)',
    radius: 'var(--dsw-radius-sm)',
    fontXs: 'var(--dsw-font-xxxs-11)',
    fontSm: 'var(--dsw-font-xxs-12)',
    fontMd: 'var(--dsw-font-xs-13)',
    fontStrong: 'var(--dsw-font-s-strong-14)',
  }

  /**
   * 上报客户端挂载情况（诊断用，失败静默）。
   *
   * 面板活在浏览器里，宿主侧看不见它的死活：入口有没有注册成功、
   * 右侧页签服务在不在、注册时报了什么错 —— 这些只有浏览器知道。
   * 回报一次，宿主侧就能用 GET client-status 直接读答案，不用再猜。
   */
  function reportClientStatus(payload: Record<string, unknown>) {
    try {
      if (typeof fetch !== 'function') return
      void fetch(API_BASE + '/client-hello', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(function () { /* 诊断信息丢了不能影响功能 */ })
    } catch {
      /* fetch 不可用就跳过 */
    }
  }

  /** 按钮（幽灵型）：与宿主原生按钮同一套令牌。 */
  function buttonStyle(color?: string) {
    return {
      padding: '4px 10px',
      borderRadius: UI.radius,
      border: '1px solid ' + UI.border,
      background: 'transparent',
      color: color || UI.text2,
      cursor: 'pointer',
      font: UI.fontSm,
      whiteSpace: 'nowrap',
    }
  }

  /** 输入框：与宿主表单同一套令牌。 */
  function inputStyle(width?: number) {
    return {
      padding: '5px 8px',
      borderRadius: UI.radius,
      border: '1px solid ' + UI.border,
      background: 'transparent',
      color: UI.text1,
      font: UI.fontSm,
      minWidth: 0,
      ...(width ? { width } : { flex: 1 }),
    }
  }

  /** 请求后端。 */
  async function callApi(path: string, body?: any): Promise<any> {
    const response = await fetch(API_BASE + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) throw new Error('HTTP ' + response.status)
    return response.json()
  }

  /** 格式化字节。 */
  function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes)) return '?'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  }

  /** 格式化时间。 */
  function formatTime(iso: string): string {
    if (!iso) return '—'
    try {
      return iso.slice(0, 19).replace('T', ' ')
    } catch {
      return iso
    }
  }

  /**
   * 工作区管理面板。
   * @param react - 宿主注入的 React
   */
  function createWorkspacePanel(react: any) {
    const h = react.createElement
    const useState = react.useState
    const useEffect = react.useEffect
    const useCallback = react.useCallback

    // 全局管理面板：全部走 UI 令牌，视觉与右侧「本工作区工作台」对应。
    const styles = {
      root: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        font: UI.fontMd,
        color: UI.text1,
        gap: 8,
        padding: 12,
        overflow: 'hidden',
        boxSizing: 'border-box',
      },
      header: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      title: { fontWeight: 600, font: UI.fontStrong, marginRight: 'auto', color: UI.text1 },
      button: buttonStyle(),
      buttonDanger: buttonStyle(UI.danger),
      input: inputStyle(),
      list: {
        overflowY: 'auto',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minHeight: 0,
      },
      row: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: UI.radius,
        border: '1px solid ' + UI.borderSoft,
        cursor: 'pointer',
      },
      rowActive: { borderColor: UI.accent, background: UI.surface2 },
      badge: {
        font: UI.fontXs,
        padding: '1px 6px',
        borderRadius: 99,
        border: '1px solid ' + UI.borderSoft,
        color: UI.text2,
      },
      muted: { color: UI.text3, font: UI.fontSm },
      error: { color: UI.danger, font: UI.fontSm },
      ok: { color: UI.ok, font: UI.fontSm },
      detail: {
        borderTop: '1px solid ' + UI.borderSoft,
        paddingTop: 8,
        maxHeight: '45%',
        overflowY: 'auto',
        font: UI.fontSm,
        color: UI.text2,
      },
    }

    function WorkspaceSection() {
      const [state, setState] = useState({
        loading: true,
        error: null,
        stats: null,
        current: null,
        selected: null,
        detail: null,
        busy: false,
        message: null,
        newName: '',
        confirmDelete: null,
        cleanupPreview: null,
      } as any)

      const reload = useCallback(async (): Promise<void> => {
        setState((prev) => ({ ...prev, loading: true, error: null }))
        try {
          const stats = await callApi('/workspaces/stats')
          const list = await callApi('/workspaces')
          setState((prev) => ({
            ...prev,
            loading: false,
            stats,
            current: list.current || null,
            error: null,
          }))
        } catch (error) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: error && error.message ? error.message : String(error),
          }))
        }
      }, [])

      useEffect(() => {
        reload()
      }, [reload])

      const act = useCallback(
        async (path: string, body: any, message: any): Promise<void> => {
          setState((prev) => ({ ...prev, busy: true, message: null }))
          try {
            await callApi(path, body)
            await reload()
            // 左栏做了「创建 / 切换 / 删除工作区」→ 通知右栏立刻换成对应工作区的数据表。
            // 这就是用户要的「换工作区自动切换」。
            if (
              path === '/workspaces/switch' ||
              path === '/workspaces/create' ||
              path === '/workspaces/delete'
            ) {
              notifyWorkspaceChanged(body && typeof body.name === 'string' ? body.name : undefined)
            }
            setState((prev) => ({ ...prev, busy: false, message, confirmDelete: null }))
          } catch (error) {
            setState((prev) => ({
              ...prev,
              busy: false,
              error: error && error.message ? error.message : String(error),
            }))
          }
        },
        [reload],
      )

      const openDetail = useCallback(async (name: string): Promise<void> => {
        try {
          const detail = await callApi('/workspaces/' + encodeURIComponent(name))
          setState((prev) => ({ ...prev, selected: name, detail }))
        } catch (error) {
          setState((prev) => ({
            ...prev,
            error: error && error.message ? error.message : String(error),
          }))
        }
      }, [])

      const s = state
      const workspaces = (s.stats && s.stats.workspaces) || []
      const children = []

      children.push(
        h(
          'div',
          { key: 'header', style: styles.header },
          h('span', { style: styles.title }, '数学计算器 · 工作区'),
          h('button', { style: styles.button, onClick: reload, disabled: s.busy }, '刷新'),
        ),
      )

      if (s.error) children.push(h('div', { key: 'err', style: styles.error }, '错误: ' + s.error))
      if (s.message) children.push(h('div', { key: 'msg', style: styles.ok }, s.message))
      if (s.loading) children.push(h('div', { key: 'loading', style: styles.muted }, '加载中…'))

      children.push(
        h(
          'div',
          { key: 'new', style: styles.header },
          h('input', {
            style: styles.input,
            placeholder: '新工作区名（字母/数字/下划线/连字符）',
            value: s.newName,
            onChange: (event) => setState((prev) => ({ ...prev, newName: event.target.value })),
          }),
          h(
            'button',
            {
              style: styles.button,
              disabled: s.busy || !/^[A-Za-z0-9_-]{1,64}$/.test(s.newName.trim()),
              onClick: () => {
                const target = s.newName.trim()
                if (!target) return
                act('/workspaces/create', { name: target }, '已创建并切换到 "' + target + '"').then(() =>
                  setState((prev) => ({ ...prev, newName: '' })),
                )
              },
            },
            '新建并切换',
          ),
        ),
      )

      children.push(
        h(
          'div',
          { key: 'overview', style: styles.header },
          h(
            'span',
            { style: styles.muted },
            '共 ' +
              ((s.stats && s.stats.workspaceCount) || 0) +
              ' 个工作区 · 占用 ' +
              formatBytes((s.stats && s.stats.totalBytes) || 0),
          ),
          h(
            'button',
            {
              style: styles.button,
              disabled: s.busy,
              onClick: async () => {
                try {
                  const preview = await callApi('/workspaces/cleanup', { dryRun: true })
                  setState((prev) => ({ ...prev, cleanupPreview: preview, message: null }))
                } catch (error) {
                  setState((prev) => ({
                    ...prev,
                    error: error && error.message ? error.message : String(error),
                  }))
                }
              },
            },
            '清理预览',
          ),
        ),
      )

      if (s.cleanupPreview) {
        const emptyCount = (s.cleanupPreview.emptyWorkspacesDeleted || []).length
        const tempCount = (s.cleanupPreview.tempWorkspacesDeleted || []).length
        children.push(
          h(
            'div',
            {
              key: 'cleanup',
              style: {
                ...styles.row,
                flexDirection: 'column',
                alignItems: 'stretch',
                cursor: 'default',
              },
            },
            h(
              'div',
              { style: styles.muted },
              '将删除 ' +
                (emptyCount + tempCount) +
                ' 个（空壳 ' +
                emptyCount +
                ' / 临时 ' +
                tempCount +
                '），释放 ' +
                formatBytes(s.cleanupPreview.bytesFreed || 0),
            ),
            h(
              'div',
              { style: styles.header },
              h(
                'button',
                {
                  style: styles.buttonDanger,
                  disabled: s.busy,
                  onClick: () => {
                    act('/workspaces/cleanup', { dryRun: false }, '清理完成').then(() =>
                      setState((prev) => ({ ...prev, cleanupPreview: null })),
                    )
                  },
                },
                '确认清理',
              ),
              h(
                'button',
                {
                  style: styles.button,
                  onClick: () => setState((prev) => ({ ...prev, cleanupPreview: null })),
                },
                '取消',
              ),
            ),
          ),
        )
      }

      const rows = []
      if (workspaces.length === 0) {
        rows.push(h('div', { key: 'empty', style: styles.muted }, '还没有工作区。上面输入名字新建一个。'))
      } else {
        for (const workspace of workspaces) {
          const isSelected = workspace.name === s.selected
          rows.push(
            h(
              'div',
              {
                key: workspace.name,
                style: { ...styles.row, ...(isSelected ? styles.rowActive : {}) },
                onClick: () => openDetail(workspace.name),
              },
              h(
                'div',
                { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 } },
                h(
                  'div',
                  { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                  h('span', { style: { fontWeight: 500 } }, workspace.name),
                  workspace.name === s.current
                    ? h('span', { style: { ...styles.badge, borderColor: UI.accent, color: UI.text1 } }, '当前')
                    : null,
                  workspace.empty ? h('span', { style: styles.badge }, '空') : null,
                ),
                h(
                  'div',
                  { style: styles.muted },
                  '常数 ' +
                    workspace.constantCount +
                    ' · 地点 ' +
                    workspace.terrainCount +
                    ' · 变量 ' +
                    workspace.variableCount +
                    ' · ' +
                    formatBytes(workspace.bytes) +
                    ' · ' +
                    formatTime(workspace.updatedAt),
                ),
              ),
              workspace.name === s.current
                ? null
                : h(
                    'button',
                    {
                      style: styles.button,
                      disabled: s.busy,
                      onClick: (event) => {
                        event.stopPropagation()
                        act('/workspaces/switch', { name: workspace.name }, '已切换到 "' + workspace.name + '"')
                      },
                    },
                    '切换',
                  ),
              s.confirmDelete === workspace.name
                ? h(
                    'button',
                    {
                      style: styles.buttonDanger,
                      disabled: s.busy || workspace.name === 'default',
                      onClick: (event) => {
                        event.stopPropagation()
                        act('/workspaces/delete', { name: workspace.name }, '已删除 "' + workspace.name + '"')
                      },
                    },
                    '确认删除',
                  )
                : h(
                    'button',
                    {
                      style: styles.button,
                      disabled: workspace.name === 'default',
                      onClick: (event) => {
                        event.stopPropagation()
                        setState((prev) => ({ ...prev, confirmDelete: workspace.name }))
                      },
                    },
                    '删除',
                  ),
            ),
          )
        }
      }
      children.push(h('div', { key: 'list', style: styles.list }, rows))

      if (s.detail) {
        const detailRows = []
        detailRows.push(
          h('div', { key: 'dt', style: { fontWeight: 600, marginBottom: 4 } }, '详情: ' + s.detail.name),
        )
        if (s.detail.description) {
          detailRows.push(h('div', { key: 'dd', style: styles.muted }, s.detail.description))
        }
        detailRows.push(
          h(
            'div',
            { key: 'dc', style: { marginTop: 6 } },
            '常数改动 ' + Object.keys(s.detail.constants || {}).length + ' 项',
          ),
          h('div', { key: 'dt2' }, '局部地点 ' + (s.detail.terrains || []).length + ' 处'),
        )

        for (const terrain of s.detail.terrains || []) {
          detailRows.push(
            h(
              'div',
              { key: 'tr-' + terrain.name, style: { display: 'flex', gap: 6, alignItems: 'center' } },
              h('span', { style: styles.muted }, '· ' + terrain.name),
              h(
                'button',
                {
                  style: { ...styles.button, padding: '1px 6px', fontSize: 11 },
                  disabled: s.busy,
                  onClick: () =>
                    act(
                      '/workspaces/remove-terrain',
                      { name: s.detail.name, terrainName: terrain.name },
                      '已删除地点 "' + terrain.name + '"',
                    ).then(() => openDetail(s.detail.name)),
                },
                '删',
              ),
            ),
          )
        }

        detailRows.push(
          h(
            'div',
            { key: 'dv', style: { marginTop: 6 } },
            '自定义变量 ' + Object.keys(s.detail.variables || {}).length + ' 个',
          ),
        )
        for (const name of Object.keys(s.detail.variables || {})) {
          detailRows.push(
            h(
              'div',
              { key: 'vr-' + name, style: { display: 'flex', gap: 6, alignItems: 'center' } },
              h('span', { style: styles.muted }, '· ' + name + ' = ' + String(s.detail.variables[name])),
              h(
                'button',
                {
                  style: { ...styles.button, padding: '1px 6px', fontSize: 11 },
                  disabled: s.busy,
                  onClick: () =>
                    act(
                      '/workspaces/remove-variable',
                      { name: s.detail.name, variableName: name },
                      '已删除变量 "' + name + '"',
                    ).then(() => openDetail(s.detail.name)),
                },
                '删',
              ),
            ),
          )
        }

        detailRows.push(
          h(
            'div',
            { key: 'dr', style: { marginTop: 8 } },
            h(
              'button',
              {
                style: styles.button,
                disabled: s.busy,
                onClick: () =>
                  act(
                    '/workspaces/reset',
                    { name: s.detail.name },
                    '"' + s.detail.name + '" 的常数已重置为现实值',
                  ).then(() => openDetail(s.detail.name)),
              },
              '重置常数（保留地点和变量）',
            ),
          ),
        )

        children.push(h('div', { key: 'detail', style: styles.detail }, detailRows))
      }

      return h('div', { style: styles.root }, children)
    }
    return WorkspaceSection
  }

  /**
   * 配置面板：工作区 / 常数表 / 公式表 / 设置 四个页签。
   *
   * 设计目的（用户明确）：面板不是给用户算数用的，而是**配置与数据管理**——
   *   · 工作区：建/切/删、看常数与地点、清理存储
   *   · 常数表：改当前工作区的物理常数（只影响这个世界观）
   *   · 公式表：停用 / 恢复公式（只影响这个世界观）
   *   · 设置：提示注入档位 off / brief / full
   */
  function createConfigPanel(react: any, WorkspaceSection: any) {
    const h = react.createElement
    const useState = react.useState
    const useEffect = react.useEffect
    const useCallback = react.useCallback

    // 主栏三个页签的按钮/输入框：与左右两栏同一套令牌。
    const btn = buttonStyle()
    const input = { ...inputStyle(), minWidth: 80 }
    // 主栏页签（配置与数据管理）也走同一套令牌。
    const note = { color: UI.text3, font: UI.fontSm }
    const errorStyle = { color: UI.danger, font: UI.fontSm, padding: '4px 12px' }
    const message = (error: any): string => (error && error.message ? error.message : String(error))

    /** 常数表：只改当前工作区的旋钮。 */
    function ConstantsSection() {
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)
      const [busy, setBusy] = useState(false)
      const [draft, setDraft] = useState({})

      const load = useCallback(async () => {
        try {
          setData(await callApi('/constants'))
          setError(null)
        } catch (error) {
          setError(message(error))
        }
      }, [])
      useEffect(() => {
        load()
      }, [load])

      if (error) return h('div', { style: errorStyle }, '错误: ' + error)
      if (!data) return h('div', { style: { padding: 12, ...note } }, '加载中…')

      const save = async (name: string, value: string) => {
        setBusy(true)
        try {
          await callApi('/workspaces/save-constant', {
            name: data.workspace,
            constantName: name,
            value: Number(value),
          })
          setDraft((prev) => {
            const next = { ...prev }
            delete next[name]
            return next
          })
          await load()
        } catch (error) {
          setError(message(error))
        } finally {
          setBusy(false)
        }
      }
      const reset = async (name: string) => {
        setBusy(true)
        try {
          await callApi('/workspaces/reset-constant', { name: data.workspace, constantName: name })
          setDraft((prev) => {
            const next = { ...prev }
            delete next[name]
            return next
          })
          await load()
        } catch (error) {
          setError(message(error))
        } finally {
          setBusy(false)
        }
      }

      const rows = data.base.map((node: any) => {
        const override = data.overrides[node.name]
        const value = draft[node.name] !== undefined ? draft[node.name] : String(override !== undefined ? override : node.standard)
        return h(
          'div',
          { key: node.name, style: { display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0', borderTop: '1px solid ' + UI.borderSoft } },
          h('span', { style: { width: 88, fontSize: 12 }, title: node.meaning }, node.name),
          h('span', { style: { width: 72, fontSize: 10, opacity: 0.65 } }, node.unit || ''),
          h('input', {
            style: { ...input, flex: 1 },
            value,
            onChange: (event: any) => setDraft((prev: any) => ({ ...prev, [node.name]: event.target.value })),
          }),
          h('button', { style: btn, disabled: busy, onClick: () => save(node.name, value) }, override !== undefined ? '保存' : '设为'),
          h('button', { style: btn, disabled: busy || override === undefined, onClick: () => reset(node.name) }, '重置'),
          override !== undefined ? h('span', { style: { fontSize: 10, opacity: 0.7 } }, '已改') : null,
        )
      })

      return h(
        'div',
        { style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 } },
        [h('div', { key: 'h', style: note }, '当前工作区：' + data.workspace + '（改动只影响这个世界观）')].concat(rows),
      )
    }

    /** 公式表：停用 / 恢复；自定义公式只读展示。 */
    function FormulaSection() {
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)
      const [busy, setBusy] = useState(false)
      const [target, setTarget] = useState('')

      const load = useCallback(async () => {
        try {
          setData(await callApi('/formula-table'))
          setError(null)
        } catch (error) {
          setError(message(error))
        }
      }, [])
      useEffect(() => {
        load()
      }, [load])

      if (error) return h('div', { style: errorStyle }, '错误: ' + error)
      if (!data) return h('div', { style: { padding: 12, ...note } }, '加载中…')

      const act = async (action: string, formulaId: string) => {
        if (!formulaId) return
        setBusy(true)
        try {
          await callApi('/formula-table', { name: data.workspace, action, formulaId })
          await load()
        } catch (error) {
          setError(message(error))
        } finally {
          setBusy(false)
        }
      }

      const rows = data.overrides.map((item: any) =>
        h(
          'div',
          { key: item.id, style: { display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0', borderTop: '1px solid ' + UI.borderSoft } },
          h('span', { style: { flex: 1, fontSize: 12 } }, item.id),
          h('span', { style: { fontSize: 10, opacity: 0.7 } }, item.disabled ? '已停用' : '已覆盖'),
          h('button', { style: btn, disabled: busy, onClick: () => act('reset', item.id) }, '恢复模板'),
        ),
      )

      return h(
        'div',
        { style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 } },
        [
          h('div', { key: 'h', style: note }, '当前工作区：' + data.workspace + '（只影响这个世界观）'),
          h(
            'div',
            { key: 'add', style: { display: 'flex', gap: 6, margin: '8px 0' } },
            h('input', {
              style: { ...input, flex: 1 },
              placeholder: '公式 id，例如 velocity_uniform',
              value: target,
              onChange: (event: any) => setTarget(event.target.value),
            }),
            h('button', { style: btn, disabled: busy || !target, onClick: () => act('disable', target.trim()) }, '停用'),
            h('button', { style: btn, disabled: busy || !target, onClick: () => act('enable', target.trim()) }, '启用'),
          ),
        ]
          .concat(rows.length > 0 ? rows : [h('div', { key: 'none', style: note }, '没有覆盖或停用项。')])
          .concat([
            h('div', { key: 'c', style: { marginTop: 8, ...note } }, '自定义公式 ' + data.custom.length + ' 条；新增/编辑请用 operation="formula-table"'),
          ]),
      )
    }

    /** 设置：提示注入档位。 */
    function SettingsSection() {
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)

      const load = useCallback(async () => {
        try {
          setData(await callApi('/settings'))
          setError(null)
        } catch (error) {
          setError(message(error))
        }
      }, [])
      useEffect(() => {
        load()
      }, [load])

      if (error) return h('div', { style: errorStyle }, '错误: ' + error)
      if (!data) return h('div', { style: { padding: 12, ...note } }, '加载中…')

      const setMode = async (mode: string) => {
        try {
          await callApi('/settings', { promptMode: mode })
          await load()
        } catch (error) {
          setError(message(error))
        }
      }

      const EXPLAIN = {
        off: '完全不注入提示（最省 token）',
        brief: '每轮注入简短提醒（推荐）',
        full: '每轮注入完整能力清单（最费 token）',
      }

      const rows = data.modes.map((mode: string) =>
        h(
          'div',
          { key: mode, style: { display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0' } },
          h('button', { style: { ...btn, background: data.promptMode === mode ? 'var(--dsw-alias-interactive-bg-hover-accent)' : 'transparent', borderColor: data.promptMode === mode ? UI.accent : UI.border }, onClick: () => setMode(mode) }, mode),
          h('span', { style: { fontSize: 11, opacity: data.promptMode === mode ? 0.95 : 0.65 } }, EXPLAIN[mode] || ''),
          data.promptMode === mode ? h('span', { style: { fontSize: 10, opacity: 0.7 } }, '使用中') : null,
        ),
      )

      return h(
        'div',
        { style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 } },
        [h('div', { key: 'h', style: note }, '提示注入档位（影响模型每轮看到的提醒长度）')].concat(rows),
      )
    }

    const TABS = [
      { id: 'workspaces', label: '工作区' },
      { id: 'constants', label: '常数表' },
      { id: 'formula', label: '公式表' },
      { id: 'settings', label: '设置' },
    ]

    return function ConfigPanel() {
      const [tab, setTab] = useState('workspaces')
      const tabBar = h(
        'div',
        { style: { display: 'flex', gap: 2, padding: '6px 8px 0', borderBottom: '1px solid ' + UI.borderSoft, flexShrink: 0 } },
        TABS.map((item) =>
          h(
            'button',
            {
              key: item.id,
              onClick: () => setTab(item.id),
              style: {
                padding: '4px 10px',
                fontSize: 12,
                cursor: 'pointer',
                background: 'transparent',
                color: 'inherit',
                border: 'none',
                borderBottom: tab === item.id ? '2px solid ' + UI.accent : '2px solid transparent',
              },
            },
            item.label,
          ),
        ),
      )
      const body =
        tab === 'constants'
          ? h(ConstantsSection)
          : tab === 'formula'
            ? h(FormulaSection)
            : tab === 'settings'
              ? h(SettingsSection)
              : h(WorkspaceSection)
      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' } },
        tabBar,
        h('div', { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } }, body),
      )
    }
  }

  /** 侧栏页签标题（很小，只占一个 tab 的位置）。 */
  /**
 * 右侧边栏页签：**当前工作区**的数据表。
 *
 * 与左侧入口的分工（用户 2026-10-24 的要求）：
 *   · 左侧入口（sidebar.panellist + main 页面）——**全局管理**：所有工作区，创建/切换/删除
 *   · 右侧页签（sidebar.right.pane.tab）      ——**本工作区**：一打开就看到当前工作区的
 *                                                改动常数 / 公式覆盖 / 地点 / 变量
 *
 * 数据全部来自后端 /workspaces/current，前端不自己推导（避免两份真相）。
 */
function createWorkspaceTab(react: any) {
  const h = react.createElement
  const { useState, useEffect, useCallback } = react

  // 右侧「本工作区工作台」：与左侧全局管理共用同一套 UI 令牌与组件样式。
  const box = {
    padding: '10px 12px',
    font: UI.fontSm,
    color: UI.text1,
    lineHeight: 1.65,
    overflow: 'auto',
    height: '100%',
    boxSizing: 'border-box',
  }
  const sectionTitle = { marginTop: 14, marginBottom: 4, font: UI.fontStrong, color: UI.text1 }
  const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '3px 0' }
  const muted = { color: UI.text3 }
  const btn = buttonStyle()
  const btnDanger = buttonStyle(UI.danger)
  const btnActive = { ...buttonStyle(UI.text1), borderColor: UI.accent, background: UI.surface2 }
  const input = inputStyle()
  const selectStyle = { ...inputStyle(), width: 128, flex: 'none' }

  /** 分节标题：标题 + 可选计数徽标，左右两栏同款。 */
  function Section(props: any) {
    return h('div', null,
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 6 }, },
        h('div', { style: sectionTitle }, props.title),
        props.count !== undefined
          ? h('span', { style: { font: UI.fontXs, color: UI.text3 } }, '（' + props.count + '）')
          : null),
      props.children)
  }

  return function WorkspaceTab(props: any) {
    const [state, setState] = useState({
      loading: true,
      error: null,
      data: null,
      list: [],
      current: null,
      settings: null,
      table: null,
      busy: false,
      message: null,
      newVariable: { name: '', value: '' },
      newTerrain: { name: '', kind: 'plain' },
    } as any)

    // 一次把「本工作区」需要的四样东西读齐：工作区列表（切换器）、
    // 本区详情（数据表）、本区公式表（开关）、提示档位（开关）。
    const load = useCallback(function () {
      setState(function (prev: any) { return { ...prev, loading: true, error: null } })
      return Promise.all([
        callApi('/workspaces'),
        callApi('/workspaces/current'),
        callApi('/formula-table'),
        callApi('/settings'),
      ])
        .then(function (result: any) {
          setState(function (prev: any) {
            return {
              ...prev,
              loading: false,
              error: null,
              list: (result[0] && result[0].workspaces) || [],
              current: (result[0] && result[0].current) || null,
              data: result[1],
              table: result[2],
              settings: result[3],
            }
          })
        })
        .catch(function (error: any) {
          setState(function (prev: any) {
            return { ...prev, loading: false, error: (error && error.message) || '读取失败' }
          })
        })
    }, [])

    /** 统一动作入口：调用后端 → 刷新 → 提示。 */
    const act = useCallback(function (path: string, body: any, okMessage: string) {
      setState(function (prev: any) { return { ...prev, busy: true, message: null } })
      return callApi(path, body)
        .then(function () {
          notifyWorkspaceChanged(body && typeof body.name === 'string' ? body.name : undefined)
          setState(function (prev: any) { return { ...prev, busy: false, message: okMessage } })
          return load()
        })
        .catch(function (error: any) {
          setState(function (prev: any) {
            return { ...prev, busy: false, message: '失败：' + ((error && error.message) || error) }
          })
        })
    }, [load])

    useEffect(function () { void load() }, [load])

    // ① 左栏切换工作区 → 右栏立刻跟着换（同一个 client bundle 里的轻量订阅）
    // ② 宿主把右栏页签打开/可见性变化时也刷新一次（学习 dsh-better-sidebar 的做法：
    //    订阅 sidebarRight 的 mounted store，而不是轮询）。
    useEffect(function () {
      const off = typeof props?.subscribeWorkspace === 'function' ? props.subscribeWorkspace(load) : null
      return function () { if (typeof off === 'function') off() }
    }, [load, props])

    if (state.loading && !state.data) return h('div', { style: box }, '正在读取当前工作区…')
    if (state.error) {
      return h('div', { style: box }, '读取失败：' + state.error,
        h('button', { onClick: load, style: { marginLeft: 8 } }, '重试'))
    }

    const data = state.data || {}
    const summary = data.summary || {}
    const changed = Object.entries(data.constants || {})
    const overrides = (data.formulaTable && data.formulaTable.overrides) || []
    const custom = (data.formulaTable && data.formulaTable.custom) || []
    const terrains = data.terrains || []
    const variables = Object.entries(data.variables || {})
    // 本区工作区名（所有写操作都要带上它 —— 一个工作区一张数据表）
    const currentName = summary.name || data.name || state.current || 'default'

    // 顶部：当前工作区 + 切换器 + 刷新。
    // 「换工作区自动切换」在这里与左栏共享同一个通知源（notifyWorkspaceChanged）。
    const switcher = h('select', {
      value: summary.name || data.name || '',
      disabled: state.busy,
      onChange: function (event: any) {
        const next = event && event.target ? event.target.value : ''
        if (next && next !== (summary.name || data.name)) {
          void act('/workspaces/switch', { name: next }, '已切换到 "' + next + '"')
        }
      },
      style: selectStyle,
    }, (state.list || []).map(function (item: any) {
      return h('option', { key: item.name, value: item.name }, item.name)
    }))

    const header = h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' } },
      h('div', { style: { font: UI.fontStrong, color: UI.text1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, '本工作区：'),
      switcher,
      h('button', { onClick: load, title: '重新读取', disabled: state.busy, style: btn }, '刷新'))

    const messageLine = state.message
      ? h('div', { style: { marginTop: 6, color: UI.warn, font: UI.fontSm } }, state.message)
      : null

    const counts = h('div', { style: { ...muted, paddingBottom: 4, borderBottom: '1px solid ' + UI.borderSoft } },
      '改动常数 ' + changed.length +
      ' · 公式覆盖 ' + overrides.length +
      ' · 自定义 ' + custom.length +
      ' · 地点 ' + terrains.length +
      ' · 变量 ' + variables.length)

    const constSection = h(Section, { title: '【改动的常数】', count: changed.length },
      changed.length === 0
        ? h('div', { style: muted }, '（未改动，全部为现实值）')
        : h('div', null, changed.map(function (entry: any) {
            const name = entry[0]
            const value = entry[1]
            return h('div', { key: name, style: rowStyle },
              h('span', null, name),
              h('span', null, typeof value === 'number' ? String(value) : String(value)))
          })))

    const formulaSection = h(Section, { title: '【本工作区公式表】', count: overrides.length + custom.length },
      overrides.length === 0 && custom.length === 0
        ? h('div', { style: muted }, '（未改动公式，全部用模板）')
        : h('div', null,
            overrides.map(function (item: any) {
              return h('div', { key: 'o-' + item.id, style: rowStyle },
                h('span', null, item.id),
                h('span', { style: muted }, item.disabled ? '已停用' : '已覆盖'))
            }),
            custom.map(function (item: any) {
              return h('div', { key: 'c-' + item.id, style: rowStyle },
                h('span', null, item.id),
                h('span', { style: muted }, '自定义'))
            })))

    const terrainSection = h(Section, { title: '【地点】', count: terrains.length },
      terrains.length === 0
        ? h('div', { style: muted }, '（暂无）')
        : h('div', null, terrains.map(function (t: any, index: number) {
            return h('div', { key: (t && t.name) || index, style: rowStyle },
              h('span', null, (t && t.name) || '未命名'),
              h('span', { style: muted }, (t && t.kind) || ''))
          })))

    const variableSection = h(Section, { title: '【变量】', count: variables.length },
      variables.length === 0
        ? h('div', { style: muted }, '（暂无）')
        : h('div', null, variables.map(function (entry: any) {
            return h('div', { key: entry[0], style: rowStyle },
              h('span', null, entry[0]),
              h('span', null, String(entry[1])))
          })))

    // ── 开关：提示档位 + 公式启停 ──
    //
    // 用户明确要求：右侧不只看数据，还要有「开关」。
    const promptMode = (state.settings && state.settings.promptMode) || 'brief'
    const modeButton = function (mode: string, label: string) {
      const active = promptMode === mode
      return h('button', {
        key: mode,
        disabled: state.busy || active,
        onClick: function () { void act('/settings', { promptMode: mode }, '提示档位已切到 ' + mode) },
        style: active ? { ...btnActive, marginRight: 4 } : { ...btn, marginRight: 4 },
      }, label)
    }

    const overridesNow = (state.table && state.table.overrides) || []
    const disabledIds = overridesNow.filter(function (item: any) { return item.disabled }).map(function (item: any) { return item.id })

    const toggleSection = h(Section, { title: '【开关】' },
      h('div', { style: { marginBottom: 6 } },
        h('span', { style: muted }, '提示档位 '),
        modeButton('off', '关'),
        modeButton('brief', '简'),
        modeButton('full', '全')),
      h('div', { style: { marginBottom: 4 } },
        h('span', { style: muted }, '停用公式：'),
        disabledIds.length === 0
          ? h('span', { style: muted }, '（无）')
          : h('span', null, disabledIds.map(function (id: string) {
              return h('button', {
                key: id,
                disabled: state.busy,
                onClick: function () { void act('/formula-table', { name: currentName, action: 'reset', formulaId: id }, '已恢复公式 "' + id + '"') },
                style: { ...btn, marginRight: 4 },
                title: '点一下恢复',
              }, id + ' ×')
            }))),
      h('div', null,
        h('input', {
          placeholder: '公式 id',
          value: state.disableId || '',
          onChange: function (event: any) {
            const value = event && event.target ? event.target.value : ''
            setState(function (prev: any) { return { ...prev, disableId: value } })
          },
          style: { ...input, width: 110, flex: 'none', marginRight: 4 },
        }),
        h('button', {
          disabled: state.busy || !(state.disableId || '').trim(),
          onClick: function () {
            const id = String(state.disableId || '').trim()
            if (id) void act('/formula-table', { name: currentName, action: 'disable', formulaId: id }, '已停用公式 "' + id + '"')
          },
          style: btn,
        }, '停用')))

    // ── 管理：变量与地点（增删）──
    //
    // 数据表只读是没用的；这里给出最小可用的增删入口，全部走后端接口，
    // 前端不自己拼数据结构（避免两份真相）。
    const manageSection = h(Section, { title: '【管理】' },
      // 变量
      h('div', { style: { marginBottom: 2 } }, h('span', { style: muted }, '变量')),
      h('div', { style: { display: 'flex', gap: 4, marginBottom: 4 } },
        h('input', {
          placeholder: '名称',
          value: state.newVariable.name,
          onChange: function (event: any) {
            const value = event && event.target ? event.target.value : ''
            setState(function (prev: any) { return { ...prev, newVariable: { ...prev.newVariable, name: value } } })
          },
          style: { ...input, width: 84, flex: 'none' },
        }),
        h('input', {
          placeholder: '数值',
          value: state.newVariable.value,
          onChange: function (event: any) {
            const value = event && event.target ? event.target.value : ''
            setState(function (prev: any) { return { ...prev, newVariable: { ...prev.newVariable, value } } })
          },
          style: { ...input, width: 70, flex: 'none' },
        }),
        h('button', {
          disabled: state.busy || !state.newVariable.name.trim() || !state.newVariable.value.trim(),
          onClick: function () {
            const name = state.newVariable.name.trim()
            const value = Number(state.newVariable.value)
            if (!Number.isFinite(value)) {
              setState(function (prev: any) { return { ...prev, message: '变量值必须是数字' } })
              return
            }
            void act('/workspaces/set-variable', { name: currentName, variableName: name, value },
              '变量 "' + name + '" 已保存').then(function () {
                setState(function (prev: any) { return { ...prev, newVariable: { name: '', value: '' } } })
              })
          },
          style: btn,
        }, '保存')),
      variables.map(function (entry: any) {
        return h('div', { key: 'v-' + entry[0], style: rowStyle },
          h('span', null, entry[0] + ' = ' + String(entry[1])),
          h('button', {
            disabled: state.busy,
            onClick: function () {
              void act('/workspaces/remove-variable', { name: currentName, variableName: entry[0] }, '已删除变量 "' + entry[0] + '"')
            },
            style: btnDanger,
          }, '删'))
      }),
      // 地点
      h('div', { style: { marginTop: 8, marginBottom: 2 } }, h('span', { style: muted }, '地点')),
      h('div', { style: { display: 'flex', gap: 4, marginBottom: 4 } },
        h('input', {
          placeholder: '地点名',
          value: state.newTerrain.name,
          onChange: function (event: any) {
            const value = event && event.target ? event.target.value : ''
            setState(function (prev: any) { return { ...prev, newTerrain: { ...prev.newTerrain, name: value } } })
          },
          style: { ...input, width: 84, flex: 'none' },
        }),
        h('select', {
          value: state.newTerrain.kind,
          onChange: function (event: any) {
            const value = event && event.target ? event.target.value : 'plain'
            setState(function (prev: any) { return { ...prev, newTerrain: { ...prev.newTerrain, kind: value } } })
          },
          style: selectStyle,
        }, ['plain', 'coastal', 'plateau', 'mountain', 'valley', 'desert', 'forest', 'tundra', 'island', 'lake'].map(function (kind) {
          return h('option', { key: kind, value: kind }, kind)
        })),
        h('button', {
          disabled: state.busy || !state.newTerrain.name.trim(),
          onClick: function () {
            const name = state.newTerrain.name.trim()
            void act('/workspaces/save-terrain', { name: currentName, terrain: { name, kind: state.newTerrain.kind } },
              '地点 "' + name + '" 已保存').then(function () {
                setState(function (prev: any) { return { ...prev, newTerrain: { ...prev.newTerrain, name: '' } } })
              })
          },
          style: btn,
        }, '保存')),
      terrains.map(function (t: any, index: number) {
        return h('div', { key: 't-' + ((t && t.name) || index), style: rowStyle },
          h('span', null, ((t && t.name) || '未命名') + (((t && t.kind)) ? ' · ' + t.kind : '')),
          h('button', {
            disabled: state.busy || !(t && t.name),
            onClick: function () {
              if (t && t.name) void act('/workspaces/remove-terrain', { name: currentName, terrainName: t.name }, '已删除地点 "' + t.name + '"')
            },
            style: btnDanger,
          }, '删'))
      }))

    const footer = h('div', { style: { marginTop: 12, ...muted } },
      '每个工作区各有独立数据表；切换工作区后本页自动跟随。全局管理在左侧「∑ 数学」。')

    return h('div', { style: box },
      header, messageLine, counts,
      toggleSection, constSection, formulaSection, terrainSection, variableSection, manageSection, footer)
  }
}

/** 右侧页签的标题（宿主页签条上显示的那个）。 */
function createWorkspaceTabTitle(react: any) {
  return function WorkspaceTabTitle() {
    return react.createElement(
      'span',
      { title: '当前工作区', style: { font: UI.fontSm, whiteSpace: 'nowrap' } },
      '∑ 本区',
    )
  }
}

function createSidebarTitle(react: any) {
    return function SidebarTitle() {
      return react.createElement(
        'span',
        { title: '数学工作区', style: { font: UI.fontSm, whiteSpace: 'nowrap' } },
        '∑ 数学',
      )
    }
  }

  // ── 注册到宿主的浏览器模块加载器 ──
  //
  // ⚠️ 真机事故（2026-10-24 崩溃日志）：
  //   Uncaught Error: client-modules: duplicate factory registration for
  //   "dsh-math-calculator-client" (bundle executed twice without invalidate?)
  //   → web boot: 1 entry did not activate
  //   → DesktopHostFatalError: cannot create effect on inactive context
  //   → 桌面端直接退出，窗口都没出来。
  //
  // 原因：桌面宿主在启动/热重载时会**重复执行同一个 client bundle**。
  // 宿主加载器对同一个 id 第二次 load 会抛错，这个未捕获错误会把整次
  // web boot 判为失败；桌面端再把它升级成致命错误。
  //
  // 教训：client 入口必须**幂等**——重复执行只能是 no-op，绝不能抛。
  const loader = typeof window !== 'undefined' ? (window as any).__ModuleLoader__ : undefined
  if (!loader || typeof loader.load !== 'function') {
    // 宿主未提供加载器时静默跳过（不影响 node 侧功能）
    return
  }

  // 幂等闸门：同一个页面里第二次执行直接返回。
  const REGISTER_FLAG = '__dshMathCalculatorClientRegistered__'
  const w = window as any
  if (w[REGISTER_FLAG]) return

  try {
    loader.load({
      // ⚠️ 这个 id 必须等于**包名**（不是随便起的名）。
      //
      // 真机证据（2026-10-24 02:03 崩溃日志 + 逐插件比对）：
      //   dsh-hover-approve / dsh-context / dshmarket / dsh-question-note /
      //   dsh-mattpocock-skills-deck / dsh-connect-workbuddy —— 全部用包名注册。
      //   宿主 boot 时按**包名**去模块表里取 client 模块；取不到就判
      //   「entry did not activate → import failed」，桌面端随即致命退出。
      //
      // 原先用 'dsh-math-calculator-client'：模块其实注册成功了，
      // 但宿主按 'dsh-math-calculator' 查不到 → 一直被判失败。
      // 这也是「侧栏入口从来没出现过」的真正原因。
      id: 'dsh-math-calculator',
    factory: function (require) {
      let react = null
      try {
        react = require('react')
      } catch {
        react = null
      }

      // React 不可用时给空组件，绝不让宿主在渲染阶段崩掉
      const WorkspaceSection = react ? createWorkspacePanel(react) : function EmptySection() { return null }
      const ConfigPanel = react ? createConfigPanel(react, WorkspaceSection) : function EmptyPanel() { return null }
      const SidebarTitle = react ? createSidebarTitle(react) : function EmptyTitle() { return null }
      // 右侧页签：当前工作区的数据表（与左侧「全局管理」分工不同）
      const WorkspaceTab = react ? createWorkspaceTab(react) : function EmptyTab() { return null }
      const WorkspaceTabTitle = react ? createWorkspaceTabTitle(react) : function EmptyTabTitle() { return null }

      /**
       * 错误边界：面板内部异常只影响本面板，不会传染给原生界面。
       * 社区插件（dsh-my-guardian 等）也把面板当成独立故障域。
       */
      function withBoundary(Component: any) {
        if (!react) return Component
        return class MathCalcBoundary extends react.Component {
          constructor(props: any) {
            super(props)
            this.state = { error: null }
          }
          static getDerivedStateFromError(error: any) {
            return { error }
          }
          componentDidCatch() {
            /* 静默：不把错误抛给宿主 */
          }
          render() {
            if (this.state.error) {
              return react.createElement(
                'div',
                { style: { padding: 12, fontSize: 12, opacity: 0.75 } },
                '数学面板出错了，已被隔离，不影响其它界面。',
              )
            }
            return react.createElement(Component, this.props)
          }
        }
      }

      return {
        /** 依赖的客户端服务。 */
        inject: ['slots'],

        /**
         * 插件入口：只挂右侧边栏页签，不动主界面。
         *
         * 槽位名对齐社区插件的做法（dsh-my-guardian / dsh-question-note）：
         *   sidebar.right.pane.tab        —— 页签内容
         *   sidebar.right.pane.tab.title  —— 页签标题
         * 每个槽位单独 try/catch：某个槽位不存在只跳过，不影响其它槽位。
         */
        apply: function (ctx) {
          if (!ctx || !ctx.slots || typeof ctx.slots.inject !== 'function') return

          const disposers: Array<() => void> = []

          // ① 主栏页面：用与入口相同的 id 寻址。
          //    行盒子、选中态、折叠提示、无障碍名称全部由宿主的 layout 服务负责，
          //    我们只画内容 —— 这是 DSH 官方席位，不会和原生界面抢空间。
          let pageDispose: any = null
          try {
            pageDispose = ctx.slots.inject('main', function () {
              return ctx.slots.register({ name: 'main', key: PANEL_ID }, withBoundary(ConfigPanel))
            })
            if (typeof pageDispose === 'function') disposers.push(pageDispose)
          } catch {
            pageDispose = null
          }

          // ⚠️ 这里**不再**因为「主栏席位缺失」就整块放弃。
          //
          // 改前：main 拿不到就直接 return —— 结果是左栏入口、右栏页签全都不会注册，
          // 用户看到的就是「UI 没做出来」，而且没有任何信号说明是哪一步断的。
          // 改后：两个席位各自独立尝试，谁成功算谁的；结果全部写进心跳，
          // 宿主侧 GET client-status 一看就知道断在哪。
          const pageOk = typeof pageDispose === 'function'

          // ② 侧栏入口行：与「插件市场 / 任务看板」同一排，只占一行。
          //    宿主负责点击与选中态，我们只提供 icon 与 label。
          let rowRegistered = false
          try {
            const rowDispose = ctx.slots.inject('sidebar.panellist', function () {
              rowRegistered = true
              return ctx.slots.register(
                {
                  name: 'sidebar.panellist',
                  id: PANEL_ID,
                  // order 取社区同量级：任务看板 20 / skill-explorer 30 / ssh 40。
                  //
                  // ⚠️ 更正（读宿主 dsh-client-ui-sidebar 源码后确认）：
                  //   左侧栏的「更多」是**宿主原生**的面板启动器（语言包键 panels.more），
                  //   只要官方插件管理器提供了 sidebar.panellist.actions 就总会出现，
                  //   它列出全部面板并提供「固定/取消固定」；**与 order 无关**，
                  //   插件无法移除它。最初写成 900 只是排位靠后，并不会导致进「更多」。
                  order: 30,
                  label: function () {
                    return '数学工作区'
                  },
                },
                withBoundary(SidebarTitle),
              )
            })
            if (typeof rowDispose === 'function') disposers.push(rowDispose)
          } catch {
            // 入口注册失败时把页面也撤掉，避免出现「有页面没入口」的孤儿状态。
            if (typeof pageDispose === 'function') {
              try {
                pageDispose()
              } catch {
                /* ignore */
              }
            }
          }

          // ③ 右侧边栏页签：**当前工作区**的数据表。
          //
          // 契约来源（读 dsh-context / dsh-better-sidebar / dsh-agent-teams 的产物得出）：
          //   1) 先向 sidebarRightTabs.register({ id, kind, title, guide }) 登记页签；
          //   2) 再挂 sidebar.right.pane.tab（内容）与 sidebar.right.pane.tab.title（标题），
          //      两个槽位的 key 必须与登记的 id 一致。
          //
          // sidebarRightTabs 是**可选**服务：用嵌套 ctx.inject 拿子上下文，
          // 服务不存在时回调不执行 → 静默跳过，绝不因此让插件激活失败。
          const RIGHT_TAB_ID = 'dsh-math-calculator.workspace'
          // 右侧页签的注册结果（心跳要用：服务在不在、注册成没成、错在哪）
          const rightTabOutcome: { service: boolean; registered: boolean; error: string | null } = {
            service: false,
            registered: false,
            error: null,
          }
          try {
            if (typeof ctx.inject === 'function') {
              const disposeRight = ctx.inject(['sidebarRightTabs'], function (sub: any) {
                rightTabOutcome.service = true
                const inner: Array<() => void> = []
                try {
                  const registry = sub && sub.sidebarRightTabs
                  if (registry && typeof registry.register === 'function') {
                    rightTabOutcome.registered = true
                    inner.push(registry.register({
                      id: RIGHT_TAB_ID,
                      kind: 'dsh-math-calculator',
                      title: function () { return '数学' },
                      // guide 入口的契约（读宿主 SidebarRightTabRegistry 得出）：
//   guideEntries = definition.guide.map(e => ({...e, kind, providerId}))
//   每个入口必须有 id（宿主用 kind:id 拼固定态标识，并检查同一定义内 id 不重复）；
//   title/description 是函数；order 决定胶囊在「开始」页里的排序。
                      guide: [{
                        id: 'workspace',
                        order: 60,
                        title: function () { return '数学工作区' },
                        description: function () { return '当前工作区的常数 / 公式 / 地点 / 变量' },
                      }],
                    }))
                  }
                  inner.push(sub.slots.inject('sidebar.right.pane.tab', function () {
                    return sub.slots.register(
                      {
                        name: 'sidebar.right.pane.tab',
                        key: RIGHT_TAB_ID,
                        // 把「工作区变更」的订阅函数交给面板：
                        // 左栏一切换，右栏就重新拉本工作区的数据表。
                        inject: function () { return { subscribeWorkspace: subscribeWorkspace } },
                      },
                      withBoundary(WorkspaceTab),
                    )
                  }))

                  // 页签可见性变化时也刷新一次（学 dsh-better-sidebar：订阅宿主的
                  // sidebarRight.mounted store，而不是定时轮询）。
                  try {
                    const right = sub.sidebarRight
                    if (right && right.mounted && typeof right.mounted.subscribe === 'function') {
                      inner.push(right.mounted.subscribe(function () { notifyWorkspaceChanged() }))
                    }
                  } catch {
                    /* 宿主没有该 store：不影响其它功能 */
                  }
                  inner.push(sub.slots.inject('sidebar.right.pane.tab.title', function () {
                    return sub.slots.register(
                      { name: 'sidebar.right.pane.tab.title', key: RIGHT_TAB_ID },
                      withBoundary(WorkspaceTabTitle),
                    )
                  }))
                } catch (error) {
                  rightTabOutcome.error = error && (error as Error).message ? (error as Error).message : String(error)
                  // 部分注册失败：撤掉已注册的，避免出现「有页签没内容」
                  for (const dispose of inner) {
                    try { dispose() } catch { /* ignore */ }
                  }
                  return function () {}
                }
                return function () {
                  for (const dispose of inner) {
                    try { dispose() } catch { /* ignore */ }
                  }
                }
              }, 'dsh-math-calculator: 右侧工作区页签')
              if (typeof disposeRight === 'function') disposers.push(disposeRight)
            }
          } catch (error) {
            rightTabOutcome.error = error && (error as Error).message ? (error as Error).message : String(error)
            /* 宿主没有 ctx.inject：右侧页签跳过，左侧入口与工具照常可用 */
          }

          // ④ 心跳：把「我注册了什么」回报给宿主侧，供诊断查询
          //    （GET /api/dsh-math-calculator/client-status）。
          //    面板在浏览器里挂载、宿主看不见；没有这个信号，排查只能靠猜。
          reportClientStatus({
            registered: disposers.length,
            page: pageOk,
            rowRegistered,
            rightTabService: rightTabOutcome.service,
            rightTabRegistered: rightTabOutcome.registered,
            rightTabError: rightTabOutcome.error,
            order: 30,
          })

          return function disposeAll() {
            for (const dispose of disposers) {
              try {
                dispose()
              } catch {
                /* 卸载失败忽略 */
              }
            }
          }
        },
      }
    },
    })
    // 注册成功才置位；重复执行时上面会直接 return。
    w[REGISTER_FLAG] = true
  } catch (error) {
    // 重复注册不是致命错误：宿主可能重放 bundle。
    // 这里必须吞掉——抛出会让整次 web boot 判为失败，桌面端直接退出。
    try {
      console.warn('[dsh-math-calculator] client module registration skipped:', error)
    } catch {
      /* console 也可能不可用 */
    }
  }
})()
