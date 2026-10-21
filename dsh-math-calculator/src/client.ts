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
 */

;(function () {
  'use strict'

  // 用「包名.用途」做键，和社区插件一致（例如 dsh-my-guardian 用自己的包名作 TAB key），
  // 这样即使以后有别的数学类插件，也不会撞 key。
  const PANEL_ID = 'dsh-math-calculator.workspaces'
  const API_BASE = '/api/dsh-math-calculator'

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

    const styles = {
      root: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontSize: 13,
        color: 'inherit',
        gap: 8,
        padding: 12,
        overflow: 'hidden',
        boxSizing: 'border-box',
      },
      header: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      title: { fontWeight: 600, fontSize: 15, marginRight: 'auto' },
      button: {
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid rgba(128,128,128,.4)',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        fontSize: 12,
      },
      buttonDanger: {
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid rgba(220,80,80,.6)',
        background: 'rgba(220,80,80,.12)',
        color: 'inherit',
        cursor: 'pointer',
        fontSize: 12,
      },
      input: {
        padding: '5px 8px',
        borderRadius: 6,
        border: '1px solid rgba(128,128,128,.4)',
        background: 'transparent',
        color: 'inherit',
        fontSize: 12,
        flex: 1,
        minWidth: 100,
      },
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
        borderRadius: 6,
        border: '1px solid rgba(128,128,128,.25)',
        cursor: 'pointer',
      },
      rowActive: { borderColor: 'rgba(90,160,255,.8)', background: 'rgba(90,160,255,.10)' },
      badge: {
        fontSize: 10,
        padding: '1px 6px',
        borderRadius: 99,
        border: '1px solid rgba(128,128,128,.4)',
        opacity: 0.85,
      },
      muted: { opacity: 0.65, fontSize: 11 },
      error: { color: '#e06c75', fontSize: 12 },
      ok: { color: '#98c379', fontSize: 12 },
      detail: {
        borderTop: '1px solid rgba(128,128,128,.3)',
        paddingTop: 8,
        maxHeight: '45%',
        overflowY: 'auto',
        fontSize: 12,
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
                    ? h('span', { style: { ...styles.badge, borderColor: 'rgba(90,160,255,.8)' } }, '当前')
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

    const btn = {
      padding: '3px 8px',
      borderRadius: 6,
      border: '1px solid rgba(128,128,128,.4)',
      background: 'transparent',
      color: 'inherit',
      cursor: 'pointer',
      fontSize: 11,
    }
    const input = {
      padding: '4px 8px',
      borderRadius: 6,
      border: '1px solid rgba(128,128,128,.4)',
      background: 'transparent',
      color: 'inherit',
      fontSize: 12,
      minWidth: 80,
    }
    const note = { fontSize: 11, opacity: 0.7 }
    const errorStyle = { color: '#e06c75', fontSize: 12, padding: '4px 12px' }
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
          { key: node.name, style: { display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0', borderTop: '1px solid rgba(128,128,128,.15)' } },
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
          { key: item.id, style: { display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0', borderTop: '1px solid rgba(128,128,128,.15)' } },
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
          h('button', { style: { ...btn, background: data.promptMode === mode ? 'rgba(90,160,255,.18)' : 'transparent' }, onClick: () => setMode(mode) }, mode),
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
        { style: { display: 'flex', gap: 2, padding: '6px 8px 0', borderBottom: '1px solid rgba(128,128,128,.25)', flexShrink: 0 } },
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
                borderBottom: tab === item.id ? '2px solid #5aa0ff' : '2px solid transparent',
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
  function createSidebarTitle(react: any) {
    return function SidebarTitle() {
      return react.createElement(
        'span',
        { title: '数学工作区', style: { fontSize: 12, whiteSpace: 'nowrap' } },
        '∑ 数学',
      )
    }
  }

  // ── 注册到宿主的浏览器模块加载器 ──
  const loader = typeof window !== 'undefined' ? (window as any).__ModuleLoader__ : undefined
  if (!loader || typeof loader.load !== 'function') {
    // 宿主未提供加载器时静默跳过（不影响 node 侧功能）
    return
  }

  loader.load({
    id: 'dsh-math-calculator-client',
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
          const mount = function (slot: string, Component: any) {
            try {
              const dispose = ctx.slots.inject(slot, function () {
                return ctx.slots.register({ name: slot, key: PANEL_ID }, withBoundary(Component))
              })
              if (typeof dispose === 'function') disposers.push(dispose)
            } catch {
              /* 宿主没有该槽位时跳过 */
            }
          }

          mount('sidebar.right.pane.tab', ConfigPanel)
          mount('sidebar.right.pane.tab.title', SidebarTitle)

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
})()
