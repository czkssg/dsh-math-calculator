/**
 * 客户端入口：`dsh-math-calculator` 的装配壳。
 *
 * @module client
 * @description
 * 这个文件只做三件事，UI 代码从 `src/ui/*.ts` 内联在这里（宿主把 client
 * 当**脚本**加载，不能有顶层 import/export，所以 UI 无法拆成独立模块）：
 *
 * 1. 用宿主模块加载器注册自己（`__ModuleLoader__.load`，id 必须等于包名）；
 * 2. 把 UI 组件挂到宿主槽位：左栏主页面 + 侧栏入口 + 右栏页签；
 * 3. 上报一次挂载心跳（诊断用）。
 *
 * ⚠️ 加载壳部分**不要随手改**，它踩过两次真机事故：
 * - id 必须是**包名**（曾用 `-client` 后缀 → 宿主按包名查不到 → 桌面端致命退出）；
 * - 入口必须**幂等**（宿主会重放 bundle，二次注册抛错会升级为致命错误）。
 */
/* 以下 UI 代码由 src/ui/*.ts 内联而来（宿主把 client 当脚本加载，不能有 import/export）。 */

// ═══ ui/contract.ts ═══
/**
 * UI 共享契约常量。
 *
 * @module ui/contract
 * @description
 * 面板 id 集中在这里，避免 client.ts 与各面板互相 import 形成环。
 */

/** 主栏页面与侧栏入口共用的 id。 */
var PANEL_ID = 'dsh-math-calculator.workspaces'

/** 右栏页签注册 id。 */
var RIGHT_TAB_ID = 'dsh-math-calculator.workspace'

// ═══ ui/theme.ts ═══
/**
 * UI 主题层：`dsh-math-calculator` 客户端的设计令牌与通用控件。
 *
 * @module ui/theme
 * @description
 * 左栏（全局管理）与右栏（本工作区）**共用这一套**，所以两边的字号、描边、
 * 圆角、悬停态一定一致 —— 这就是「左右 UI 对应」的落地方式。
 *
 * 为什么只用 CSS 变量、不写死颜色：
 * 社区插件（dsh-context / dsh-better-sidebar / agent-teams / my-guardian）
 * 的产物里出现 103 个 `--dsw-*` 令牌、几乎不写死颜色。照做以后，
 * 深色主题、用户改字号、圆角风格都会自动跟随原生界面，不会「一眼外挂」。
 */

/** 宿主主题令牌。只暴露面板会用到的那些，避免乱用。 */
var T = {
  text1: 'var(--dsw-alias-label-primary)',
  text2: 'var(--dsw-alias-label-secondary)',
  text3: 'var(--dsw-alias-label-tertiary)',
  border: 'var(--dsw-alias-border-l2)',
  hairline: 'var(--dsw-alias-border-l1)',
  layer2: 'var(--dsw-alias-bg-layer-2)',
  hover: 'var(--dsw-alias-interactive-bg-hover)',
  accent: 'var(--dsw-alias-accent)',
  accentSoft: 'var(--dsw-alias-interactive-bg-hover-accent)',
  danger: 'var(--dsw-alias-danger)',
  dangerSoft: 'var(--dsw-alias-interactive-bg-hover-danger)',
  warn: 'var(--dsw-alias-state-warn-primary)',
  ok: 'var(--dsw-alias-state-success-primary)',
  radius: 'var(--dsw-radius-sm)',
  radiusLg: 'var(--dsw-radius-md)',
  f11: 'var(--dsw-font-xxxs-11)',
  f12: 'var(--dsw-font-xxs-12)',
  f13: 'var(--dsw-font-xs-13)',
  f14s: 'var(--dsw-font-strong-14)',
} as const

/** 幽灵按钮（描边）的样式。 */
function btnStyle(opts: { danger?: boolean; active?: boolean; tiny?: boolean } = {}): any {
  const color = opts.danger ? T.danger : opts.active ? T.text1 : T.text2
  return {
    padding: opts.tiny ? '2px 7px' : '4px 10px',
    borderRadius: T.radius,
    border: '1px solid ' + (opts.active ? T.accent : T.border),
    background: opts.active ? T.accentSoft : 'transparent',
    color,
    cursor: 'pointer',
    font: opts.tiny ? T.f11 : T.f12,
    whiteSpace: 'nowrap',
    lineHeight: 1.5,
  }
}

/** 输入框/下拉框的样式。 */
function inputStyle(width?: number): any {
  return {
    padding: '5px 8px',
    borderRadius: T.radius,
    border: '1px solid ' + T.border,
    background: 'transparent',
    color: T.text1,
    font: T.f12,
    boxSizing: 'border-box',
    minWidth: 0,
    ...(width === undefined ? { flex: '1 1 0' } : { width, flex: 'none' }),
  }
}

/** 面板根容器。 */
var panel: any = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  boxSizing: 'border-box',
  font: T.f13,
  color: T.text1,
  overflow: 'hidden',
}

/** 可滚动的正文区。 */
var scroller: any = {
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  padding: '0 12px 14px',
}

/** 一行：左标签、右值/按钮。 */
var row: any = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '4px 0',
  minHeight: 24,
}

/** 淡分隔线（用在行之间）。 */
var hairline: any = { borderTop: '1px solid ' + T.hairline }

/** 次要文字。 */
var dim: any = { color: T.text3, font: T.f12 }

/** 空状态文字。 */
var empty: any = { color: T.text3, font: T.f12, padding: '6px 0' }

// ═══ ui/kit.ts ═══
/**
 * UI 基础控件：`dsh-math-calculator` 客户端的面板骨架。
 *
 * @module ui/kit
 * @description
 * 左栏与右栏都用这几个构件拼装，保证两侧**结构一致**：
 * `Panel`（外壳：标题栏 + 滚动正文） / `Section`（分组：标题 + 计数 + 内容）
 * / `Row`（一行数据） / `Empty`（空状态） / `Field`（输入 + 按钮）。
 *
 * 控件只做布局，不做业务；业务在 left-panel.ts / right-panel.ts。
 */

/** 创建一个面板视图工厂（注入 react 后返回组件集合）。 */
function createKit(react: any) {
  const h = react.createElement

  /**
   * 面板外壳：固定标题栏 + 可滚动正文。
   *
   * @param props - `title` 标题；`subtitle` 副标题；`actions` 右上角按钮数组；
   *                `children` 正文；`footer` 底部固定提示
   */
  function Panel(props: any) {
    return h(
      'div',
      { style: panel },
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px 8px',
            borderBottom: '1px solid ' + T.hairline,
            flex: '0 0 auto',
          },
        },
        h(
          'div',
          { style: { minWidth: 0, flex: '1 1 auto' } },
          h('div', { style: { font: T.f14s, color: T.text1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, props.title),
          props.subtitle ? h('div', { style: { ...dim, marginTop: 2 } }, props.subtitle) : null,
        ),
        h('div', { style: { display: 'flex', gap: 6, flex: '0 0 auto' } }, props.actions || null),
      ),
      h('div', { style: scroller }, props.children),
      props.footer
        ? h(
            'div',
            { style: { padding: '8px 12px', borderTop: '1px solid ' + T.hairline, ...dim, flex: '0 0 auto' } },
            props.footer,
          )
        : null,
    )
  }

  /**
   * 分组：标题 + 右侧计数 + 内容。
   *
   * @param props - `title`；`count`（可选，显示为 (n)）；`hint`（可选，浅色说明）；`children`
   */
  function Section(props: any) {
    return h(
      'section',
      { style: { marginTop: 14 } },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 } },
        h('span', { style: { font: T.f14s, color: T.text1 } }, props.title),
        props.count === undefined ? null : h('span', { style: { font: T.f11, color: T.text3 } }, '(' + props.count + ')'),
        props.hint ? h('span', { style: { font: T.f11, color: T.text3, marginLeft: 'auto' } }, props.hint) : null,
      ),
      props.children,
    )
  }

  /** 一行数据：左侧标签（可附带说明），右侧值或操作。 */
  function Row(props: any) {
    return h(
      'div',
      { style: { ...row, ...(props.first ? {} : hairline) } },
      h(
        'div',
        { style: { minWidth: 0, flex: '1 1 auto' } },
        h('div', { style: { color: T.text1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, props.label),
        props.note ? h('div', { style: { font: T.f11, color: T.text3, marginTop: 1 } }, props.note) : null,
      ),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' } }, props.right),
    )
  }

  /** 空状态。 */
  function Empty(props: any) {
    return h('div', { style: empty }, props.text || '（暂无）')
  }

  /** 徽标（小圆角标签）。 */
  function Badge(props: any) {
    return h(
      'span',
      {
        style: {
          font: T.f11,
          padding: '1px 6px',
          borderRadius: 99,
          border: '1px solid ' + (props.tone === 'accent' ? T.accent : T.border),
          color: props.tone === 'accent' ? T.text1 : T.text2,
          background: props.tone === 'accent' ? T.accentSoft : 'transparent',
          whiteSpace: 'nowrap',
        },
      },
      props.text,
    )
  }

  /** 一行「输入 + 按钮」的表单。 */
  function Field(props: any) {
    return h(
      'div',
      { style: { display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0 6px' } },
      props.children,
      props.button ? props.button : null,
    )
  }

  /** 加载中。 */
  function Loading(props: any) {
    return h('div', { style: { padding: '10px 12px', ...dim } }, props.text || '加载中…')
  }

  /** 错误态（带重试）。 */
  function Failure(props: any) {
    return h(
      'div',
      { style: { padding: '10px 12px', color: T.danger, font: T.f12 } },
      h('div', { style: { marginBottom: 6 } }, props.text),
      props.onRetry ? h('button', { style: { cursor: 'pointer' }, onClick: props.onRetry }, '重试') : null,
    )
  }

  /** 提示行（成功/警告）。 */
  function Notice(props: any) {
    return h(
      'div',
      {
        style: {
          margin: '6px 0',
          padding: '5px 8px',
          borderRadius: T.radius,
          font: T.f12,
          color: props.tone === 'error' ? T.danger : props.tone === 'ok' ? T.ok : T.warn,
          background: T.layer2,
          border: '1px solid ' + T.hairline,
        },
      },
      props.text,
    )
  }

  return { Panel, Section, Row, Empty, Badge, Field, Loading, Failure, Notice }
}

/** 面板视图工厂的类型（供各面板模块引用）。 */
type Kit = ReturnType<typeof createKit>

// ═══ ui/data.ts ═══
/**
 * UI 数据层：`dsh-math-calculator` 客户端与后端的所有交互。
 *
 * @module ui/data
 * @description
 * 面板**不自己推导数据**，一切以后端为准（避免两份真相）。
 * 这里集中：HTTP 调用、工作区变更的跨面板通知、客户端心跳上报。
 */

/** 后端 API 前缀（挂载时由宿主注入的同源路由）。 */
var API_BASE = '/api/dsh-math-calculator'

/**
 * 调用后端接口。
 *
 * @param path - 相对路径，如 `/workspaces/current`
 * @param body - 有 body 即 POST，无 body 即 GET
 * @returns 解析后的 JSON（后端统一包在 `data` 里时自动取出）
 */
async function callApi(path: string, body?: any): Promise<any> {
  const init: any = body === undefined
    ? { method: 'GET' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  const response = await fetch(API_BASE + path, init)
  const text = await response.text()
  let parsed: any = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  if (!response.ok) {
    const message = (parsed && (parsed.error || parsed.message)) || ('HTTP ' + response.status)
    throw new Error(message)
  }
  // 后端可能包一层 { ok, data }；两种形状都兼容。
  if (parsed && typeof parsed === 'object' && parsed.data !== undefined) return parsed.data
  return parsed
}

/** 工作区变更的监听者集合（同一个 client bundle 内共享）。 */
var listeners = new Set<() => void>()

/**
 * 广播「工作区变了」。
 *
 * 左栏切换/新建/删除工作区后调用，右栏据此立刻换成对应工作区的数据表。
 * 这是「换工作区自动切换」的实现方式：一个 bundle 内的轻量订阅，不轮询。
 */
function notifyWorkspaceChanged(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener()
    } catch {
      /* 单个面板出错不影响其它 */
    }
  }
}

/**
 * 订阅工作区变更。
 *
 * @param listener - 变更回调
 * @returns 取消订阅
 */
function subscribeWorkspace(listener: () => void): () => void {
  listeners.add(listener)
  return function () {
    listeners.delete(listener)
  }
}

/**
 * 上报客户端挂载情况（诊断用，失败静默）。
 *
 * 面板活在浏览器里、宿主看不见它的死活。回报一次后，宿主侧可以用
 * `GET /client-status` 直接读答案，排查时不必再猜。
 *
 * @param payload - 任意可 JSON 化的状态
 */
function reportClientStatus(payload: Record<string, unknown>): void {
  try {
    if (typeof fetch !== 'function') return
    void fetch(API_BASE + '/client-hello', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(function () {
      /* 诊断信息丢了不能影响功能 */
    })
  } catch {
    /* fetch 不可用就跳过 */
  }
}

/** 字节数格式化。 */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

/** 时间格式化（只到分钟）。 */
function formatTime(iso: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = function (value: number) { return String(value).padStart(2, '0') }
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

// ═══ ui/left-panel.ts ═══
/**
 * 左栏：**全局管理**（`dsh-math-calculator` 主页面）。
 *
 * @module ui/left-panel
 * @description
 * 这里管的是「所有工作区」与「跨工作区的配置」，不负责单个工作区的数据表
 * （那是右栏的职责）。四个页签：
 *
 * 1. 工作区 —— 列表（切换/删除/重置）、新建、清理
 * 2. 常数表 —— 本区常数旋钮，可改可恢复
 * 3. 公式表 —— 本区公式覆盖与停用
 * 4. 设置   —— 提示注入档位（关/简/全）
 *
 * 设计原则：面板只是**后端的视图**。所有写入都发给后端，页面重新拉取，
 * 不做本地乐观拼接 —— 数据结构只有后端一份。
 */



/**
 * 创建左栏页面组件。
 *
 * @param react - 宿主提供的 react
 * @returns 主栏页面组件
 */
function createLeftPanel(react: any) {
  const h = react.createElement
  const { useState, useEffect, useCallback } = react
  const kit = createKit(react)
  const { Panel, Section, Row, Empty, Badge, Loading, Failure, Notice } = kit

  const tabBar: any = {
    display: 'flex',
    gap: 2,
    padding: '0 12px',
    borderBottom: '1px solid ' + hairline.borderTop.replace('1px solid ', ''),
    flex: '0 0 auto',
  }
  const tabButton = function (active: boolean): any {
    return {
      padding: '7px 10px',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      font: active ? T.f14s : T.f12,
      color: active ? T.text1 : T.text2,
      borderBottom: '2px solid ' + (active ? T.accent : 'transparent'),
      marginBottom: '-1px',
    }
  }

  /** 工作区页：列表 + 新建 + 清理。 */
  function WorkspacesTab() {
    const [state, setState] = useState({
      loading: true, error: null, list: [], current: null, stats: null,
      busy: false, message: null, newName: '', confirmDelete: null,
    })

    const reload = useCallback(async () => {
      setState((prev: any) => ({ ...prev, loading: true, error: null }))
      try {
        const [list, stats] = await Promise.all([callApi('/workspaces'), callApi('/workspaces/stats')])
        setState((prev: any) => ({
          ...prev, loading: false, error: null,
          list: (list && list.workspaces) || [], current: (list && list.current) || null, stats,
        }))
      } catch (error: any) {
        setState((prev: any) => ({ ...prev, loading: false, error: (error && error.message) || '读取失败' }))
      }
    }, [])

    useEffect(() => { void reload() }, [reload])

    const act = async (path: string, body: any, okText: string) => {
      setState((prev: any) => ({ ...prev, busy: true, message: null }))
      try {
        await callApi(path, body)
        await reload()
        notifyWorkspaceChanged()
        setState((prev: any) => ({ ...prev, busy: false, message: okText, confirmDelete: null, newName: '' }))
      } catch (error: any) {
        setState((prev: any) => ({ ...prev, busy: false, message: '失败：' + ((error && error.message) || error) }))
      }
    }

    if (state.loading && !state.list.length) return h(Loading, { text: '正在读取工作区…' })
    if (state.error) return h(Failure, { text: '读取失败：' + state.error, onRetry: reload })

    const rows = state.list.map((item: any, index: number) => {
      const active = item.name === state.current
      return h(Row, {
        key: item.name,
        first: index === 0,
        label: h('span', { style: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } },
          h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, item.name),
          active ? h(Badge, { text: '当前', tone: 'accent' }) : null),
        note: (item.updatedAt ? formatTime(item.updatedAt) : '—') +
          (item.description ? ' · ' + item.description : ''),
        right: h('span', { style: { display: 'flex', gap: 4 } },
          active
            ? null
            : h('button', {
                style: btnStyle({ tiny: true }),
                disabled: state.busy,
                onClick: () => void act('/workspaces/switch', { name: item.name }, '已切换到 "' + item.name + '"'),
              }, '切换'),
          h('button', {
            style: btnStyle({ tiny: true, danger: true }),
            disabled: state.busy,
            onClick: () => {
              if (state.confirmDelete === item.name) {
                void act('/workspaces/delete', { name: item.name }, '已删除 "' + item.name + '"')
              } else {
                setState((prev: any) => ({ ...prev, confirmDelete: item.name, message: '再点一次「确认删除」' }))
              }
            },
          }, state.confirmDelete === item.name ? '确认删除' : '删除'),
          h('button', {
            style: btnStyle({ tiny: true }),
            disabled: state.busy,
            onClick: () => void act('/workspaces/reset', { name: item.name }, '已清空 "' + item.name + '" 的常数'),
          }, '清空')),
      })
    })

    return h('div', null,
      state.message ? h(Notice, { text: state.message, tone: /失败/.test(state.message) ? 'error' : 'ok' }) : null,
      // 这里列的是**数据表**。每张表由宿主的一个工作区绑定而来（同名），
      // 所以名字与左侧会话列表里的「5 / 默认工作区」一一对应；
      // 切换宿主工作区时，当前表会自动跟着换。
      h(Section, {
        title: '数据表',
        count: state.list.length,
        hint: '每个宿主工作区一份同名表',
      },
        rows.length ? h('div', null, rows) : h(Empty, { text: '还没有数据表。切换宿主工作区会自动建表。' })),
      h(Section, { title: '新建' },
        h('div', { style: { display: 'flex', gap: 6, margin: '4px 0 6px' } },
          h('input', {
            style: inputStyle(),
            placeholder: '工作区名（会成为数据表文件名）',
            value: state.newName,
            onChange: (event: any) => setState((prev: any) => ({ ...prev, newName: event.target.value })),
            onKeyDown: (event: any) => {
              if (event.key === 'Enter' && state.newName.trim()) {
                void act('/workspaces/create', { name: state.newName.trim() }, '已创建 "' + state.newName.trim() + '"')
              }
            },
          }),
          h('button', {
            style: btnStyle(),
            disabled: state.busy || !state.newName.trim(),
            onClick: () => void act('/workspaces/create', { name: state.newName.trim() }, '已创建 "' + state.newName.trim() + '"'),
          }, '创建'))),
      state.stats
        ? h(Section, { title: '存储' },
            h(Row, { first: true, label: '工作区数量', right: h('span', null, String(state.stats.count ?? '—')) }),
            h(Row, { label: '占用空间', right: h('span', null, formatBytes(state.stats.bytes ?? 0)) }),
            h(Row, { label: '目录', note: state.stats.directory || '', right: null }))
        : null,
    )
  }

  /** 常数表页。 */
  function ConstantsTab() {
    const [state, setState] = useState({ loading: true, error: null, data: null, draft: {}, busy: false, message: null })
    const load = useCallback(async () => {
      setState((prev: any) => ({ ...prev, loading: true, error: null }))
      try {
        const data = await callApi('/constants')
        setState((prev: any) => ({ ...prev, loading: false, data, draft: {} }))
      } catch (error: any) {
        setState((prev: any) => ({ ...prev, loading: false, error: (error && error.message) || '读取失败' }))
      }
    }, [])
    useEffect(() => { void load() }, [load])

    if (state.loading && !state.data) return h(Loading, { text: '正在读取常数…' })
    if (state.error) return h(Failure, { text: '读取失败：' + state.error, onRetry: load })
    const data = state.data || {}
    const base = data.base || []
    const overrides = data.overrides || {}

    const save = async (name: string) => {
      const raw = state.draft[name] !== undefined ? state.draft[name] : overrides[name]
      const value = Number(raw)
      if (!Number.isFinite(value) || value <= 0) {
        setState((prev: any) => ({ ...prev, message: '常数必须是正的有限数' }))
        return
      }
      setState((prev: any) => ({ ...prev, busy: true, message: null }))
      try {
        await callApi('/workspaces/save-constant', { name: data.workspace, constantName: name, value })
        await load()
        notifyWorkspaceChanged()
        setState((prev: any) => ({ ...prev, busy: false, message: name + ' 已保存' }))
      } catch (error: any) {
        setState((prev: any) => ({ ...prev, busy: false, message: '失败：' + ((error && error.message) || error) }))
      }
    }

    return h('div', null,
      state.message ? h(Notice, { text: state.message, tone: /失败/.test(state.message) ? 'error' : 'ok' }) : null,
      h(Section, { title: '可调旋钮', count: base.length, hint: data.workspace ? '本区：' + data.workspace : '' },
        base.length === 0
          ? h(Empty, { text: '（没有可调常数）' })
          : h('div', null, base.map((node: any, index: number) => {
              const changed = overrides[node.name] !== undefined
              const shown = state.draft[node.name] !== undefined ? state.draft[node.name] : (changed ? overrides[node.name] : node.standard)
              return h(Row, {
                key: node.name,
                first: index === 0,
                label: node.name,
                note: (node.meaning || '') + (node.unit ? '  [' + node.unit + ']' : ''),
                right: h('span', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
                  h('input', {
                    style: inputStyle(96),
                    value: shown === undefined ? '' : String(shown),
                    onChange: (event: any) => setState((prev: any) => ({ ...prev, draft: { ...prev.draft, [node.name]: event.target.value } })),
                  }),
                  h('button', { style: btnStyle({ tiny: true, active: changed }), disabled: state.busy, onClick: () => void save(node.name) }, '保存'),
                  changed
                    ? h('button', {
                        style: btnStyle({ tiny: true }),
                        disabled: state.busy,
                        onClick: async () => {
                          await callApi('/workspaces/reset-constant', { name: data.workspace, constantName: node.name })
                          await load()
                          notifyWorkspaceChanged()
                        },
                      }, '恢复')
                    : null),
              })
            }))),
    )
  }

  /** 公式表页。 */
  function FormulasTab() {
    const [state, setState] = useState({ loading: true, error: null, data: null, busy: false, message: null, input: '' })
    const load = useCallback(async () => {
      setState((prev: any) => ({ ...prev, loading: true, error: null }))
      try {
        const data = await callApi('/formula-table')
        setState((prev: any) => ({ ...prev, loading: false, data }))
      } catch (error: any) {
        setState((prev: any) => ({ ...prev, loading: false, error: (error && error.message) || '读取失败' }))
      }
    }, [])
    useEffect(() => { void load() }, [load])

    if (state.loading && !state.data) return h(Loading, { text: '正在读取公式表…' })
    if (state.error) return h(Failure, { text: '读取失败：' + state.error, onRetry: load })
    const overrides = (state.data && state.data.overrides) || []
    const workspace = (state.data && state.data.workspace) || 'default'

    const act = async (action: string, formulaId: string, okText: string) => {
      setState((prev: any) => ({ ...prev, busy: true, message: null }))
      try {
        await callApi('/formula-table', { name: workspace, action, formulaId })
        await load()
        notifyWorkspaceChanged()
        setState((prev: any) => ({ ...prev, busy: false, message: okText, input: '' }))
      } catch (error: any) {
        setState((prev: any) => ({ ...prev, busy: false, message: '失败：' + ((error && error.message) || error) }))
      }
    }

    return h('div', null,
      state.message ? h(Notice, { text: state.message, tone: /失败/.test(state.message) ? 'error' : 'ok' }) : null,
      h(Section, { title: '本区公式改动', count: overrides.length, hint: '本区：' + workspace },
        overrides.length === 0
          ? h(Empty, { text: '（全部使用模板公式）' })
          : h('div', null, overrides.map((item: any, index: number) =>
              h(Row, {
                key: item.id,
                first: index === 0,
                label: item.id,
                note: item.disabled ? '已停用' : '已覆盖',
                right: h('button', {
                  style: btnStyle({ tiny: true }),
                  disabled: state.busy,
                  onClick: () => void act('reset', item.id, '已恢复 ' + item.id),
                }, '恢复'),
              })))),
      h(Section, { title: '停用某条公式' },
        h('div', { style: { display: 'flex', gap: 6, margin: '4px 0 6px' } },
          h('input', {
            style: inputStyle(),
            placeholder: '公式 id（例如 escape_velocity）',
            value: state.input,
            onChange: (event: any) => setState((prev: any) => ({ ...prev, input: event.target.value })),
          }),
          h('button', {
            style: btnStyle(),
            disabled: state.busy || !state.input.trim(),
            onClick: () => void act('disable', state.input.trim(), '已停用 ' + state.input.trim()),
          }, '停用'))),
    )
  }

  /** 设置页。 */
  function SettingsTab() {
    const [state, setState] = useState({ loading: true, error: null, data: null, busy: false, message: null })
    const load = useCallback(async () => {
      setState((prev: any) => ({ ...prev, loading: true, error: null }))
      try {
        const data = await callApi('/settings')
        setState((prev: any) => ({ ...prev, loading: false, data }))
      } catch (error: any) {
        setState((prev: any) => ({ ...prev, loading: false, error: (error && error.message) || '读取失败' }))
      }
    }, [])
    useEffect(() => { void load() }, [load])

    if (state.loading && !state.data) return h(Loading, { text: '正在读取设置…' })
    if (state.error) return h(Failure, { text: '读取失败：' + state.error, onRetry: load })
    const current = (state.data && state.data.promptMode) || 'brief'
    const modes = [
      { id: 'off', label: '关', note: '不向对话注入任何提示' },
      { id: 'brief', label: '简', note: '只注入一行可用提示' },
      { id: 'full', label: '全', note: '注入完整能力说明' },
    ]

    return h('div', null,
      state.message ? h(Notice, { text: state.message, tone: /失败/.test(state.message) ? 'error' : 'ok' }) : null,
      h(Section, { title: '提示注入档位', hint: '当前：' + current },
        h('div', null, modes.map((mode, index) =>
          h(Row, {
            key: mode.id,
            first: index === 0,
            label: mode.label,
            note: mode.note,
            right: h('button', {
              style: btnStyle({ tiny: true, active: current === mode.id }),
              disabled: state.busy || current === mode.id,
              onClick: async () => {
                setState((prev: any) => ({ ...prev, busy: true, message: null }))
                try {
                  await callApi('/settings', { promptMode: mode.id })
                  await load()
                  setState((prev: any) => ({ ...prev, busy: false, message: '已切到「' + mode.label + '」' }))
                } catch (error: any) {
                  setState((prev: any) => ({ ...prev, busy: false, message: '失败：' + ((error && error.message) || error) }))
                }
              },
            }, current === mode.id ? '已启用' : '启用'),
          })))),
    )
  }

  const TABS = [
    { id: 'workspaces', label: '工作区', Component: WorkspacesTab },
    { id: 'constants', label: '常数表', Component: ConstantsTab },
    { id: 'formula', label: '公式表', Component: FormulasTab },
    { id: 'settings', label: '设置', Component: SettingsTab },
  ]

  /** 左栏主页面。 */
  return function LeftPanel() {
    const [tab, setTab] = useState('workspaces')
    const activeTab = TABS.find((item) => item.id === tab) || TABS[0]
    const Active = activeTab.Component

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' } },
      h('div', { style: tabBar },
        TABS.map((item) => h('button', {
          key: item.id,
          style: tabButton(item.id === tab),
          onClick: () => setTab(item.id),
        }, item.label))),
      h(Panel, { title: '数学工作区', subtitle: '数据表与宿主工作区一一对应；切换工作区会自动换表',
        actions: h('span', { style: dim }, '') },
        h(Active, null)))
  }
}

// ═══ ui/right-panel.ts ═══
/**
 * 右栏：**本工作区工作台**（`dsh-math-calculator` 侧边栏页签）。
 *
 * @module ui/right-panel
 * @description
 * 打开就看到**当前工作区**的数据表，并允许就地管理它：
 *
 * - 顶部：工作区切换器（换了立刻拉新区的表）+ 刷新
 * - 开关：提示档位、公式启停
 * - 数据表：改动的常数 / 公式改动 / 地点 / 变量
 * - 管理：变量与地点的新增、删除
 *
 * 与左栏的分工：左栏管「所有工作区」，这里管「这一个工作区」。
 * 两侧共用 theme / kit，所以视觉与结构一致。
 */



/** 地点类型候选（与后端 terrain.kind 对齐）。 */
var TERRAIN_KINDS = ['plain', 'coastal', 'plateau', 'mountain', 'valley', 'desert', 'forest', 'tundra', 'island', 'lake']

/**
 * 创建右栏「本工作区」组件。
 *
 * @param react - 宿主提供的 react
 * @returns 侧边栏页签内容组件
 */
function createRightPanel(react: any) {
  const h = react.createElement
  const { useState, useEffect, useCallback } = react
  const kit = createKit(react)
  const { Panel, Section, Row, Empty, Badge, Loading, Failure, Notice } = kit

  return function RightPanel(props: any) {
    const [state, setState] = useState({
      loading: true, error: null,
      list: [], current: null, data: null, table: null, settings: null,
      busy: false, message: null,
      variable: { name: '', value: '' },
      terrain: { name: '', kind: 'plain' },
      disableId: '',
    })

    /** 一次读齐本区需要的四样东西。 */
    const load = useCallback(async () => {
      setState((prev: any) => ({ ...prev, loading: true, error: null }))
      try {
        const [list, current, table, settings] = await Promise.all([
          callApi('/workspaces'),
          callApi('/workspaces/current'),
          callApi('/formula-table'),
          callApi('/settings'),
        ])
        setState((prev: any) => ({
          ...prev, loading: false, error: null,
          list: (list && list.workspaces) || [], current: (list && list.current) || null,
          data: current, table, settings,
        }))
      } catch (error: any) {
        setState((prev: any) => ({ ...prev, loading: false, error: (error && error.message) || '读取失败' }))
      }
    }, [])

    /** 写操作统一入口：调用 → 通知 → 刷新 → 提示。 */
    const act = useCallback(async (path: string, body: any, okText: string) => {
      setState((prev: any) => ({ ...prev, busy: true, message: null }))
      try {
        await callApi(path, body)
        notifyWorkspaceChanged()
        setState((prev: any) => ({ ...prev, busy: false, message: okText }))
        await load()
        return true
      } catch (error: any) {
        setState((prev: any) => ({ ...prev, busy: false, message: '失败：' + ((error && error.message) || error) }))
        return false
      }
    }, [load])

    useEffect(() => { void load() }, [load])

    // 左栏切换工作区后自动跟随（同一 bundle 内的订阅，不轮询）。
    // 也订阅宿主传来的 subscribeWorkspace（如果宿主提供了）。
    useEffect(() => {
      const offLocal = subscribeWorkspace(() => { void load() })
      const offHost = typeof props?.subscribeWorkspace === 'function' ? props.subscribeWorkspace(() => { void load() }) : null
      return function () {
        offLocal()
        if (typeof offHost === 'function') offHost()
      }
    }, [load, props])

    if (state.loading && !state.data) return h(Loading, { text: '正在读取本工作区…' })
    if (state.error) return h(Failure, { text: '读取失败：' + state.error, onRetry: load })

    const data = state.data || {}
    const summary = data.summary || {}
    const name = summary.name || data.name || state.current || 'default'
    const constants = Object.entries(data.constants || {})
    const overrides = (data.formulaTable && data.formulaTable.overrides) || []
    const custom = (data.formulaTable && data.formulaTable.custom) || []
    const terrains = data.terrains || []
    const variables = Object.entries(data.variables || {})
    const promptMode = (state.settings && state.settings.promptMode) || 'brief'
    const disabled = ((state.table && state.table.overrides) || []).filter((item: any) => item.disabled)

    const switcher = h('select', {
      style: { ...inputStyle(118) },
      value: name,
      disabled: state.busy,
      onChange: (event: any) => {
        const next = event.target.value
        if (next && next !== name) void act('/workspaces/switch', { name: next }, '已切换到 "' + next + '"')
      },
    }, (state.list || []).map((item: any) => h('option', { key: item.name, value: item.name }, item.name)))

    const header = h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 8px', borderBottom: '1px solid ' + hairline.borderTop.replace('1px solid ', '') } },
      h('span', { style: { font: T.f14s, color: T.text1 } }, '本区'),
      switcher,
      h('button', { style: btnStyle({ tiny: true }), onClick: load, disabled: state.busy }, '刷新'))

    /** 开关行：提示档位。 */
    const modeRow = h(Row, {
      first: true,
      label: '提示档位',
      note: '向 AI 注入多少说明',
      right: h('span', { style: { display: 'flex', gap: 4 } },
        [['off', '关'], ['brief', '简'], ['full', '全']].map(function (pair: any) {
          const id = pair[0]
          const label = pair[1]
          return h('button', {
            key: id,
            style: btnStyle({ tiny: true, active: promptMode === id }),
            disabled: state.busy || promptMode === id,
            onClick: function () { void act('/settings', { promptMode: id }, '提示档位已切到 ' + label) },
          }, label)
        })),
    })

    /** 开关行：已停用的公式。 */
    const disabledButtons = disabled.map(function (item: any) {
      return h('button', {
        key: item.id,
        style: btnStyle({ tiny: true }),
        disabled: state.busy,
        onClick: function () { void act('/formula-table', { name: name, action: 'reset', formulaId: item.id }, '已恢复 ' + item.id) },
      }, item.id + ' ×')
    })
    const disabledRow = h(Row, {
      label: '停用的公式',
      note: disabled.length ? '点一下恢复' : '（无）',
      right: h('span', { style: { display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' } }, disabledButtons),
    })

    /** 数据表：改动的常数。 */
    const constantRows = constants.map(function (entry: any, index: number) {
      return h(Row, {
        key: entry[0],
        first: index === 0,
        label: entry[0],
        right: h('span', { style: { font: T.f12, color: T.text2 } }, String(entry[1])),
      })
    })

    /** 数据表：公式改动。 */
    const formulaRows = overrides.map(function (item: any, index: number) {
      return h(Row, { key: 'o-' + item.id, first: index === 0, label: item.id, note: item.disabled ? '已停用' : '已覆盖', right: null })
    }).concat(custom.map(function (item: any, index: number) {
      return h(Row, { key: 'c-' + item.id, first: overrides.length === 0 && index === 0, label: item.id, note: '自定义', right: null })
    }))

    /** 数据表：地点。 */
    const terrainRows = terrains.map(function (terrain: any, index: number) {
      return h(Row, {
        key: terrain && terrain.name ? terrain.name : 'terrain-' + index,
        first: index === 0,
        label: (terrain && terrain.name) || '未命名',
        note: (terrain && terrain.kind) || '',
        right: h('button', {
          style: btnStyle({ tiny: true, danger: true }),
          disabled: state.busy,
          onClick: function () { void act('/workspaces/remove-terrain', { name: name, terrainName: terrain.name }, '已删除地点 ' + terrain.name) },
        }, '删'),
      })
    })

    /** 数据表：变量。 */
    const variableRows = variables.map(function (entry: any, index: number) {
      return h(Row, {
        key: entry[0],
        first: index === 0,
        label: entry[0] + ' = ' + String(entry[1]),
        right: h('button', {
          style: btnStyle({ tiny: true, danger: true }),
          disabled: state.busy,
          onClick: function () { void act('/workspaces/remove-variable', { name: name, variableName: entry[0] }, '已删除变量 ' + entry[0]) },
        }, '删'),
      })
    })

    /** 表单：添加变量。 */
    const variableForm = h('div', { style: { display: 'flex', gap: 6, margin: '4px 0 2px' } },
      h('input', {
        style: inputStyle(84),
        placeholder: '名称',
        value: state.variable.name,
        onChange: function (event: any) { setState((prev: any) => ({ ...prev, variable: { ...prev.variable, name: event.target.value } })) },
      }),
      h('input', {
        style: inputStyle(72),
        placeholder: '数值',
        value: state.variable.value,
        onChange: function (event: any) { setState((prev: any) => ({ ...prev, variable: { ...prev.variable, value: event.target.value } })) },
      }),
      h('button', {
        style: btnStyle({ tiny: true }),
        disabled: state.busy || !state.variable.name.trim() || !state.variable.value.trim(),
        onClick: async function () {
          const value = Number(state.variable.value)
          if (!Number.isFinite(value)) {
            setState((prev: any) => ({ ...prev, message: '变量值必须是数字' }))
            return
          }
          const ok = await act('/workspaces/set-variable', { name: name, variableName: state.variable.name.trim(), value: value }, '变量已保存')
          if (ok) setState((prev: any) => ({ ...prev, variable: { name: '', value: '' } }))
        },
      }, '保存'))

    /** 表单：添加地点。 */
    const terrainForm = h('div', { style: { display: 'flex', gap: 6, margin: '4px 0 2px' } },
      h('input', {
        style: inputStyle(84),
        placeholder: '地点名',
        value: state.terrain.name,
        onChange: function (event: any) { setState((prev: any) => ({ ...prev, terrain: { ...prev.terrain, name: event.target.value } })) },
      }),
      h('select', {
        style: inputStyle(96),
        value: state.terrain.kind,
        onChange: function (event: any) { setState((prev: any) => ({ ...prev, terrain: { ...prev.terrain, kind: event.target.value } })) },
      }, TERRAIN_KINDS.map(function (kind: string) { return h('option', { key: kind, value: kind }, kind) })),
      h('button', {
        style: btnStyle({ tiny: true }),
        disabled: state.busy || !state.terrain.name.trim(),
        onClick: async function () {
          const ok = await act('/workspaces/save-terrain', { name: name, terrain: { name: state.terrain.name.trim(), kind: state.terrain.kind } }, '地点已保存')
          if (ok) setState((prev: any) => ({ ...prev, terrain: { ...prev.terrain, name: '' } }))
        },
      }, '保存'))

    /** 表单：停用公式。 */
    const disableForm = h('div', { style: { display: 'flex', gap: 6, margin: '4px 0 2px' } },
      h('input', {
        style: inputStyle(),
        placeholder: '公式 id',
        value: state.disableId,
        onChange: function (event: any) { setState((prev: any) => ({ ...prev, disableId: event.target.value })) },
      }),
      h('button', {
        style: btnStyle({ tiny: true }),
        disabled: state.busy || !state.disableId.trim(),
        onClick: async function () {
          const id = state.disableId.trim()
          const ok = await act('/formula-table', { name: name, action: 'disable', formulaId: id }, '已停用 ' + id)
          if (ok) setState((prev: any) => ({ ...prev, disableId: '' }))
        },
      }, '停用'))

    const body = h('div', { style: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '0 12px 14px' } },
      state.message ? h(Notice, { text: state.message, tone: /失败/.test(state.message) ? 'error' : 'ok' }) : null,
      h(Section, { title: '开关', hint: '数据表：' + name }, modeRow, disabledRow),
      h(Section, { title: '改动的常数', count: constants.length }, constants.length ? h('div', null, constantRows) : h(Empty, { text: '（全部为现实值）' })),
      h(Section, { title: '公式改动', count: overrides.length + custom.length }, formulaRows.length ? h('div', null, formulaRows) : h(Empty, { text: '（全部使用模板公式）' })),
      h(Section, { title: '地点', count: terrains.length }, terrains.length ? h('div', null, terrainRows) : h(Empty, { text: '（暂无地点）' })),
      h(Section, { title: '变量', count: variables.length }, variables.length ? h('div', null, variableRows) : h(Empty, { text: '（暂无变量）' })),
      h(Section, { title: '添加变量' }, variableForm),
      h(Section, { title: '添加地点' }, terrainForm),
      h(Section, { title: '停用公式' }, disableForm),
    )

    const footer = h('div', { style: { padding: '8px 12px', borderTop: '1px solid ' + hairline.borderTop.replace('1px solid ', ''), ...dim, flex: '0 0 auto' } },
      '每个工作区一份同名数据表；切换后本页自动跟随。全局管理在左侧「数学工作区」。')

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' } }, header, body, footer)
  }
}

// 整个 client 文件会被宿主**重复执行**（热重载/重放 bundle）。
// 顶层用 const/let 声明会在第二次执行时抛「already declared」——
// 那会被判为 web boot 失败并升级成桌面端致命错误。
// 所以这里一律用 var（函数作用域、可重复声明），并靠幂等闸门提前返回。

/** 面板出错时的兜底文案样式。 */
var boundaryStyle = { padding: 12, font: T.f12, color: T.danger }

/**
 * 错误边界：面板内部异常只影响本面板，不传染给原生界面。
 *
 * @param react - 宿主 react
 */
function makeBoundary(react: any) {
  if (!react) return function Noop() { return null }
  // ⚠️ 不能直接 extends react.Component：脚本环境里 react 可能还没注入，
  // 那样会抛「Class extends value undefined」，整份 client 加载失败。
  const Base: any = react.Component || function Placeholder() {}
  return class MathCalcBoundary extends Base {
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
        return react.createElement('div', { style: boundaryStyle }, '数学面板出错了，已被隔离，不影响其它界面。')
      }
      return react.createElement(this.props.component, this.props)
    }
  }
}

/** 侧栏那一行的标题。 */
function makeSidebarTitle(react: any) {
  return function SidebarTitle() {
    return react.createElement('span', { title: '数学工作区', style: { font: T.f12, whiteSpace: 'nowrap' } }, '数学工作区')
  }
}

/** 右栏页签标题。 */
function makeRightTabTitle(react: any) {
  return function RightTabTitle() {
    return react.createElement('span', { title: '本工作区', style: { font: T.f12, whiteSpace: 'nowrap' } }, '本区')
  }
}

;(function bootstrap() {
  const loader = typeof window !== 'undefined' ? (window as any).__ModuleLoader__ : undefined
  if (!loader || typeof loader.load !== 'function') return

  // 幂等闸门：宿主重复执行 bundle 时直接返回。
  const FLAG = '__dshMathCalculatorClientRegistered__'
  const w = window as any
  if (w[FLAG]) return

  try {
    loader.load({
      // ⚠️ 必须等于包名（宿主按包名取 client 模块）。
      id: 'dsh-math-calculator',
      factory: function (require: any) {
        let react: any = null
        try {
          react = require('react')
        } catch {
          react = null
        }

        const LeftPanel = react ? createLeftPanel(react) : function EmptyLeft() { return null }
        const RightPanel = react ? createRightPanel(react) : function EmptyRight() { return null }
        const SidebarTitle = react ? makeSidebarTitle(react) : function EmptyTitle() { return null }
        const RightTabTitle = react ? makeRightTabTitle(react) : function EmptyTabTitle() { return null }
        const Boundary: any = react ? makeBoundary(react) : function EmptyBoundary() { return null }

        /** 用错误边界包一层。 */
        const guard = function (Component: any) {
          if (!react) return Component
          return function Guarded(props: any) {
            return react.createElement(Boundary, { ...props, component: Component })
          }
        }

        return {
          /** 依赖的客户端服务（只声明必需的；uiWorkspace 可选，用 ctx.get 取）。 */
          inject: ['slots'],

          apply: function (ctx: any) {
            if (!ctx || !ctx.slots || typeof ctx.slots.inject !== 'function') return function () {}

            const disposers: Array<() => void> = []
            let pageOk = false
            let rowOk = false

            // ⓪ 把「宿主工作区」绑定到数据表 —— 这是「一个工作区一张同名数据表」的关键。
            //
            // 宿主的 uiWorkspace 服务暴露 workspaces.list（getSnapshot/subscribe），
            // 每项含 workspaceId / path / title。我们据此决定当前数据表：
            //   · 初次：把当前工作区绑定过去（不存在就建表）；
            //   · 用户切换宿主工作区：订阅变更，再绑定一次 → 右栏自动换表。
            //
            // 这条链路缺失过，导致数据表一直停在独立的 default、与宿主工作区无关。
            const bindHost = function () {
              try {
                const ws: any = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined
                const list = ws && ws.workspaces && ws.workspaces.list
                if (!list || typeof list.getSnapshot !== 'function') return
                const snapshot = list.getSnapshot()
                const items = (snapshot && snapshot.items) || []
                if (items.length === 0) return

                // 选「当前正在用的工作区」，不是第一个。
                //
                // 依据 dsh-memory 的 scopeOf：优先看当前会话属于哪个工作区
                // （会话 cwd 的 basename 决定了数据表名）。拿不到会话信息时
                // 才退回列表第一项。
                let active: any = null
                try {
                  const currentSessionId = ws && ws.sessions && ws.sessions.list &&
                    typeof ws.sessions.list.getSnapshot === 'function'
                    ? ws.sessions.list.getSnapshot().currentSessionId
                    : undefined
                  if (currentSessionId) {
                    active = items.find(function (item: any) {
                      return Array.isArray(item.sessionIds) && item.sessionIds.indexOf(currentSessionId) >= 0
                    }) || null
                  }
                } catch {
                  /* 没有会话服务：走兜底 */
                }
                if (!active) active = items[0]
                if (!active) return
                void fetch(API_BASE + '/workspaces/bind', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ workspaceId: active.workspaceId, title: active.title }),
                }).then(function () {
                  // 绑定完成后通知左右两栏重新拉表
                  notifyWorkspaceChanged()
                }).catch(function () {
                  /* 绑定失败不影响面板显示 */
                })
              } catch {
                /* 宿主没有 uiWorkspace：面板仍可用，只是停留在默认表 */
              }
            }
            bindHost()
            try {
              const ws: any = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined
              const list = ws && ws.workspaces && ws.workspaces.list
              if (list && typeof list.subscribe === 'function') {
                disposers.push(list.subscribe(bindHost))
              }
            } catch {
              /* 订阅失败忽略 */
            }
            const right: { service: boolean; registered: boolean; error: string | null } = {
              service: false,
              registered: false,
              error: null,
            }

            // ① 主栏页面：用与入口相同的 id 寻址。
            try {
              const dispose = ctx.slots.inject('main', function () {
                pageOk = true
                const result = ctx.slots.register({ name: 'main', key: PANEL_ID }, guard(LeftPanel))
                // 真正挂上了才上报（这是「UI 到底有没有出现」的可靠信号）
                reportClientStatus({ stage: 'slots', page: pageOk, row: rowOk, right, order: 30 })
                return result
              })
              if (typeof dispose === 'function') disposers.push(dispose)
            } catch {
              /* 宿主没有 main 席位：不影响其它席位 */
            }

            // ② 侧栏入口行：与「插件市场 / 任务看板」同一排。
            //    order 取社区量级（dshmarket=1 / dsh-context=20 / novel-writer=25）。
            try {
              const dispose = ctx.slots.inject('sidebar.panellist', function () {
                rowOk = true
                reportClientStatus({ stage: 'slots', page: pageOk, row: rowOk, right, order: 30 })
                return ctx.slots.register(
                  { name: 'sidebar.panellist', id: PANEL_ID, order: 30, label: function () { return '数学工作区' } },
                  guard(SidebarTitle),
                )
              })
              if (typeof dispose === 'function') disposers.push(dispose)
            } catch {
              /* 没有侧栏席位：跳过 */
            }

            // ③ 右栏页签：先登记页签类型，再挂内容与标题两个槽位。
            //
            // 契约（读宿主 SidebarRightTabRegistry 得出）：
            //   register({ id, kind, title, guide }) —— guide 每项**必须有 id**；
            //   sidebar.right.pane.tab / .title 的 key 必须等于这里的 id。
            // sidebarRightTabs 是可选服务：用嵌套 inject 拿，不存在时静默跳过。
            try {
              if (typeof ctx.inject === 'function') {
                const dispose = ctx.inject(['sidebarRightTabs'], function (sub: any) {
                  right.service = true
                  const inner: Array<() => void> = []
                  try {
                    const registry = sub && sub.sidebarRightTabs
                    if (registry && typeof registry.register === 'function') {
                      right.registered = true
                      inner.push(registry.register({
                        id: RIGHT_TAB_ID,
                        kind: 'dsh-math-calculator',
                        title: function () { return '本区' },
                        guide: [{
                          id: 'workspace',
                          order: 60,
                          title: function () { return '数学工作区' },
                          description: function () { return '本工作区的常数 / 公式 / 地点 / 变量' },
                        }],
                      }))
                    }
                    inner.push(sub.slots.inject('sidebar.right.pane.tab', function () {
                      return sub.slots.register(
                        {
                          name: 'sidebar.right.pane.tab',
                          key: RIGHT_TAB_ID,
                          inject: function () { return { subscribeWorkspace } },
                        },
                        guard(RightPanel),
                      )
                    }))
                    inner.push(sub.slots.inject('sidebar.right.pane.tab.title', function () {
                      return sub.slots.register({ name: 'sidebar.right.pane.tab.title', key: RIGHT_TAB_ID }, guard(RightTabTitle))
                    }))
                  } catch (error: any) {
                    right.error = error && error.message ? error.message : String(error)
                    for (const item of inner) {
                      try { item() } catch { /* ignore */ }
                    }
                    return function () {}
                  }
                  return function () {
                    for (const item of inner) {
                      try { item() } catch { /* ignore */ }
                    }
                  }
                })
                if (typeof dispose === 'function') disposers.push(dispose)
              }
            } catch (error: any) {
              right.error = error && error.message ? error.message : String(error)
            }

            // ④ 心跳：把「挂了哪几个席位」回报给宿主侧（GET /client-status）。
            // 注意：apply 结束时槽位往往还没声明（宿主是异步声明槽位的），
          // 此刻读到的 pageOk/rowOk 一定是 false，不能作为结论。
          // 真实结果由各槽位的注册回调在上报一次（stage: 'slots'）。
          reportClientStatus({ stage: 'apply', page: pageOk, row: rowOk, right, order: 30, note: 'apply 结束时槽位可能尚未声明' })

            return function disposeAll() {
              for (const dispose of disposers) {
                try { dispose() } catch { /* ignore */ }
              }
            }
          },
        }
      },
    })
    w[FLAG] = true
  } catch (error) {
    // 重复注册不是致命错误：必须吞掉，否则整次 web boot 会被判失败。
    try {
      console.warn('[dsh-math-calculator] client registration skipped:', error)
    } catch {
      /* console 也可能不可用 */
    }
  }
})()
