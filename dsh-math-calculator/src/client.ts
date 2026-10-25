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
          // 「运行中」= 当前这个数据表正被活跃工作区绑定。
          // 这是「一区一表强绑定」在界面上的唯一可见证据，不能省。
          active ? h(Badge, { text: '运行中', tone: 'accent' }) : null,
          item.boundWorkspace ? h(Badge, { text: '已绑定', tone: 'ok' }) : null),
        note: (item.updatedAt ? formatTime(item.updatedAt) : '—') +
          (item.description ? ' · ' + item.description : '') +
          // 绑定到哪个宿主工作区——用户切换工作区前需要先看到这个
          (item.boundWorkspace ? ' · 绑定 ' + item.boundWorkspace : ' · 未绑定'),
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
        hint: '一个宿主工作区强制绑定一份表；切换工作区时自动跟随',
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
            // 字段名必须与后端 storageStats() 一致：workspaceCount / totalBytes。
            // 早先写成 count / bytes，界面只能显示「—」和「0 B」。
            h(Row, { first: true, label: '数据表数量', right: h('span', null, String(state.stats.workspaceCount ?? '—')) }),
            h(Row, { label: '占用空间', right: h('span', null, formatBytes(state.stats.totalBytes ?? 0)) }),
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

  /**
   * 继承页（补丁9）：建立基线表与衍生表的关系。
   *
   * 基线表锁定物理基石，衍生表只读继承、允许覆写初条件。
   * 基线一改，所有衍生表跟着更新——这是「平行宇宙」的工程基础。
   */
  function InheritTab() {
    const [state, setState] = useState({ loading: true, error: null, links: [], busy: false, message: null, derived: '', base: '' })
    const load = useCallback(async () => {
      setState((prev: any) => ({ ...prev, loading: true, error: null }))
      try {
        const data = await callApi('/workspaces/inherit')
        setState((prev: any) => ({ ...prev, loading: false, links: data.links || [] }))
      } catch (error: any) {
        setState((prev: any) => ({ ...prev, loading: false, error: (error && error.message) || '读取失败' }))
      }
    }, [])
    useEffect(() => { void load() }, [load])

    const act = async (path: string, body: any, okText: string) => {
      setState((prev: any) => ({ ...prev, busy: true, message: null }))
      try {
        await callApi(path, body)
        setState((prev: any) => ({ ...prev, busy: false, message: okText }))
        await load()
      } catch (error: any) {
        setState((prev: any) => ({ ...prev, busy: false, message: '失败：' + ((error && error.message) || error) }))
      }
    }

    if (state.loading) return h(Loading, { text: '正在读取继承关系…' })
    if (state.error) return h(Failure, { text: '读取失败：' + state.error, onRetry: load })

    const rows = state.links.map(function (link: any, index: number) {
      return h(Row, {
        key: link.derived,
        first: index === 0,
        label: link.derived,
        note: '继承自 ' + link.base,
        right: null,
      })
    })

    return h('div', null,
      state.message ? h(Notice, { text: state.message, tone: /失败/.test(state.message) ? 'error' : 'ok' }) : null,
      h(Section, { title: '继承关系', count: state.links.length, hint: '基线一改，衍生表跟着变' },
        rows.length ? h('div', null, rows) : h(Empty, { text: '还没有继承关系。' })),
      h(Section, { title: '建立继承' },
        h('div', { style: { display: 'flex', gap: 6, margin: '4px 0 6px' } },
          h('input', {
            style: inputStyle(88),
            placeholder: '衍生表名',
            value: state.derived,
            onChange: (event: any) => setState((prev: any) => ({ ...prev, derived: event.target.value })),
          }),
          h('span', { style: { font: T.f12, color: T.text3, alignSelf: 'center' } }, '继承'),
          h('input', {
            style: inputStyle(88),
            placeholder: '基线表名',
            value: state.base,
            onChange: (event: any) => setState((prev: any) => ({ ...prev, base: event.target.value })),
          }),
          h('button', {
            style: btnStyle({ tiny: true }),
            disabled: state.busy || !state.derived.trim() || !state.base.trim(),
            onClick: () => void act('/workspaces/inherit', { derived: state.derived.trim(), base: state.base.trim() },
              '已建立继承：' + state.derived.trim() + ' ← ' + state.base.trim()),
          }, '建立'))),
      h(Section, { title: '同步更新' },
        h('div', { style: { display: 'flex', gap: 6, margin: '4px 0 2px' } },
          h('button', {
            style: btnStyle({ tiny: true }),
            disabled: state.busy,
            onClick: () => void act('/workspaces/inherit-sync', {}, '所有衍生表已同步'),
          }, '把基线的常数推给所有衍生表')),
        h('div', { style: { font: T.f11, color: T.text3, marginTop: 4 } },
          '衍生表自己的地点与变量不会被覆盖。'))
    )
  }

  /**
   * A/B 对比页（补丁3）：两张表并排比，看常数改动导致什么差异。
   */
  function DiffTab() {
    const [state, setState] = useState({ loading: true, error: null, list: [], busy: false, message: null, a: '', b: '', result: null })
    const load = useCallback(async () => {
      setState((prev: any) => ({ ...prev, loading: true, error: null }))
      try {
        const list = await callApi('/workspaces')
        setState((prev: any) => ({ ...prev, loading: false, list: (list && list.workspaces) || [] }))
      } catch (error: any) {
        setState((prev: any) => ({ ...prev, loading: false, error: (error && error.message) || '读取失败' }))
      }
    }, [])
    useEffect(() => { void load() }, [load])

    const compare = async () => {
      setState((prev: any) => ({ ...prev, busy: true, message: null, result: null }))
      try {
        const result = await callApi('/workspaces/diff', { a: state.a, b: state.b })
        setState((prev: any) => ({ ...prev, busy: false, result }))
      } catch (error: any) {
        setState((prev: any) => ({ ...prev, busy: false, message: '失败：' + ((error && error.message) || error) }))
      }
    }

    if (state.loading) return h(Loading, { text: '正在读取数据表…' })
    if (state.error) return h(Failure, { text: '读取失败：' + state.error, onRetry: load })

    const names = state.list.map(function (item: any) { return item.name })
    const picker = function (key: string, value: string) {
      return h('select', {
        style: inputStyle(110),
        value: value,
        onChange: (event: any) => setState((prev: any) => ({ ...prev, [key]: event.target.value })),
      }, h('option', { value: '' }, '（选一张表）'),
        names.map(function (n: string) { return h('option', { key: n, value: n }, n) }))
    }

    const diff = state.result
    const items = (diff && diff.items) || []
    const rows = items.map(function (item: any, index: number) {
      return h(Row, {
        key: 'd-' + index,
        first: index === 0,
        label: item.name,
        note: item.note,
        right: h(Badge, {
          text: item.tone === 'worse' ? '变差' : item.tone === 'better' ? '变好' : '变化',
          tone: item.tone === 'worse' ? 'danger' : item.tone === 'better' ? 'ok' : 'accent',
        }),
      })
    })

    return h('div', null,
      state.message ? h(Notice, { text: state.message, tone: 'error' }) : null,
      h(Section, { title: '选择两张表对比' },
        h('div', { style: { display: 'flex', gap: 6, margin: '4px 0 6px', flexWrap: 'wrap' } },
          picker('a', state.a),
          h('span', { style: { font: T.f12, color: T.text3, alignSelf: 'center' } }, 'vs'),
          picker('b', state.b),
          h('button', {
            style: btnStyle({ tiny: true }),
            disabled: state.busy || !state.a || !state.b || state.a === state.b,
            onClick: () => void compare(),
          }, '对比'))),
      diff
        ? h(Section, { title: '差异', count: items.length, hint: diff.message || '' },
            rows.length ? h('div', null, rows) : h(Empty, { text: '两表没有差异。' }))
        : null)
  }
  const TABS = [
    // 全局管理只放**跨工作区**的东西：有哪些工作区 + 插件的全局开关。
    //
    // 常数表 / 公式表不在这里 —— 它们属于某个工作区的数据，
    // 放在右侧「本工作区」工作台（每个工作区各一份）。
    { id: 'workspaces', label: '工作区', Component: WorkspacesTab },
    { id: 'inherit', label: '继承', Component: InheritTab },
    { id: 'diff', label: '对比', Component: DiffTab },
    { id: 'settings', label: '插件设置', Component: SettingsTab },
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
      h(Panel, { title: '数学工作区', subtitle: '一个宿主工作区绑定一份数据表；切换时自动跟随',
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
// ═══════════════════════════════════════════════════════════════════
// 推演控制台：六大目录（对齐 ui-design-v2 第三部）
//
// 设计要点：**一个 DSH 工作区强制绑定唯一数据表**。
// 顶部永远显示「当前绑定：表名」，切换工作区时整棵树跟着换数据，
// 不允许出现「左侧看 A 表、右侧改 B 表」的错位。
// ═══════════════════════════════════════════════════════════════════

/** 六大目录的静态结构（顺序即推演顺序）。 */
/**
 * 面向作者的面板（不是推演栈的镜像）。
 *
 * ## 为什么砍到 5 个
 *
 * 上一版照搬方案里的六大目录，做了 18 个节点。但那 18 个是**推演栈的结构**，
 * 不是「作者要做什么」。真正改设定的作者只需要五件事：
 *
 *   1. 调这个世界的样子（重力、日长、轨道…）
 *   2. 看这样调会怎样（体感 / 文明极限）
 *   3. 要个我能拿走的成品（白皮书 / 提示词）
 *   4. 翻我的改动记录
 *   5. 用魔法 / 灵能这类超出物理的设定
 *
 * 其余的（依赖图、接口卡、相图、敏感性、变更清单…）是**给 AI 的数据**，
 * 不该占用户界面——AI 需要时自己调工具，不必让作者看懂它们。
 */

/**
 * 推演结果面板：请求 /derive 并渲染成可读文本。
 *
 * 为什么直接显示文本而不是自己解析成图表：
 *   后端的 opDerivation 已经按「给人读」排好版，界面再解析一遍只会**二次失真**。
 *   图表留给以后真有需要再做（DAG 画布是独立的大工程）。
 *
 * @param react - 宿主 react
 */
/**
 * DAG 画布：用原生 SVG 画依赖图。
 *
 * 为什么不用 React Flow：本项目 client.js 是**单文件、无 import、无打包**，
 * 引不进第三方库。而 SVG 元素在 react 里就是普通标签，
 * 所以手写布局 + SVG 就够用了。
 *
 * @param react - 宿主 react
 */
/**
 * 依赖图（可折叠版）。
 *
 * 用户反馈的三点都在这：
 *   · 可折叠——按层收起，默认只展开最上一层；
 *   · 有标注——节点显示中文名（下面小字给出符号原名）；
 *   · 连线明显——加粗、加深，带箭头。
 *
 * @param react - 宿主 react
 */
/**
 * 依赖图：SVG 画布，可按层折叠。
 *
 * 用户的三点要求都在这：
 *   · 「像图片一样点开伸缩」→ 按层折叠，默认只展开相邻两层；
 *   · 「加上标注」→ 节点显示中文名，下面小字给符号原名；
 *   · 「连线希望更明显」→ 描边加粗到 1.6px、用强调色、末端加箭头。
 *
 * 为什么按层折叠而不是把所有节点塞进一张图：
 *   40 个节点铺开要 1970px 宽，侧栏里只能横向滚动，很难用。
 *
 * @param react - 宿主 react
 */
/**
 * 基本设定表单：作者最常调的四个参数。
 *
 * 为什么只有这几个：world 支持十几个参数，但作者 90% 的时间只动
 * 重力（行星质量/半径）、日长、轨道、大气。其余留默认，
 * 想精调的人可以用 AI 对话改，或者去「常数改动」。
 *
 * @param react - 宿主 react
 */
/**
 * 工作台（v3）：左调右看，一屏完成。
 *
 * @module ui/workbench
 * @description
 * ## 为什么重写
 *
 * v2 是「推演栈镜像」的目录树，改一个参数看结果要走 6 步（4 步导航）。
 * 实测后端一次综合推演只要 2.1ms，完全可以实时——导航和保存按钮都是多余的。
 *
 * ## 结构
 *
 *   ┌──────────────┬──────────────────────┐
 *   │ ① 设定         │ ② 这个世界长什么样（只读）│
 *   │  （基础量）    │ ③ 这意味着什么          │
 *   │  ▸ 进阶参数    │                      │
 *   │ ④ 我想要（反解）│                      │
 *   └──────────────┴──────────────────────┘
 *
 * ## 三条铁律
 *
 * 1. **① 区只放基础量**——派生量（重力/均温）绝不出现输入框；
 * 2. **② 区只读**——它由 ① 现算，用户不能改；
 * 3. **改完自动存**——没有保存按钮，300ms 防抖后自动写入并重算。
 */

/** 工作台需要的样式（复用主文件的 T 与 btnStyle/inputStyle）。 */
function makeWorkbench(react: any) {
  if (!react) return function Noop() { return null }
  const h = react.createElement
  const { useState, useEffect, useRef } = react
  const { Section, Loading, Failure, Notice } = createKit(react)

  return function Workbench(props: any) {
    const [state, setState] = useState({
      loading: true,
      error: null,
      summary: null,
      meta: null,
      draft: {} as Record<string, string>,
      busy: false,
      message: null,
      showAdvanced: false,
      // 反解
      anchorKind: 'gravity',
      anchorWanted: '',
      anchorResult: null as any,
    })

    /** 防抖计时器：避免每敲一个字就重算。 */
    const timerRef = useRef(null)

    /** 首次加载：取元数据 + 当前世界 → 综合推演。 */
    const load = function () {
      setState(function (prev: any) { return { ...prev, loading: true, error: null } })
      Promise.all([
        callApi('/world-params'),
        callApi('/summary', {}),
      ]).then(function (results: any[]) {
        const meta = results[0]
        const summary = results[1]
        // 用已存的值填草稿；没存过的留空（表示用默认）
        const draft: Record<string, string> = {}
        const saved = (summary && summary.params) || {}
        for (const group of (meta && meta.groups) || []) {
          for (const param of group.params) {
            const value = saved[param.key]
            draft[param.key] = value === undefined ? '' : String(value)
          }
        }
        setState(function (prev: any) {
          return { ...prev, loading: false, error: null, meta, summary, draft }
        })
      }).catch(function (error: any) {
        setState(function (prev: any) {
          return { ...prev, loading: false, error: (error && error.message) || '读取失败' }
        })
      })
    }

    useEffect(function () { load() }, [])

    /**
     * 把草稿转成 world 对象：空字符串不传（表示用默认值）。
     *
     * @returns 参数对象
     */
    const draftToWorld = function (draft: Record<string, string>) {
      const world: Record<string, unknown> = {}
      for (const [key, raw] of Object.entries(draft)) {
        if (raw === '' || raw === undefined || raw === null) continue
        // 开关型是布尔
        if (raw === 'true') { world[key] = true; continue }
        if (raw === 'false') { world[key] = false; continue }
        const num = Number(raw)
        if (Number.isFinite(num)) world[key] = num
        else world[key] = raw   // 字符串型（如 starClass）
      }
      return world
    }

    /**
     * 参数改动：更新草稿 → 防抖 → 保存并重算。
     *
     * @param key - 参数键
     * @param raw - 输入框里的原始字符串
     */
    const changeParam = function (key: string, raw: string) {
      setState(function (prev: any) {
        const draft = { ...prev.draft, [key]: raw }
        return { ...prev, draft }
      })
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(function () {
        setState(function (prev: any) {
          const world = draftToWorld(prev.draft)
          // 先存，再算——保证刷新后读到的就是刚改的
          callApi('/workspaces/save-world', { name: props.name || '', world })
            .then(function () { return callApi('/summary', { world }) })
            .then(function (summary: any) {
              setState(function (p: any) { return { ...p, summary, message: null } })
              notifyWorkspaceChanged()
            })
            .catch(function (error: any) {
              setState(function (p: any) {
                return { ...p, message: '重算失败：' + ((error && error.message) || error) }
              })
            })
          return prev
        })
      }, 300)
    }

    /**
     * 恢复成地球：清空草稿 + 清后端。
     */
    const resetAll = function () {
      setState(function (prev: any) { return { ...prev, busy: true, message: null } })
      callApi('/workspaces/reset-world', { name: props.name || '' })
        .then(function () { return callApi('/summary', { world: {} }) })
        .then(function (summary: any) {
          const draft: Record<string, string> = {}
          for (const group of (state.meta && state.meta.groups) || []) {
            for (const param of group.params) draft[param.key] = ''
          }
          setState(function (prev: any) {
            return { ...prev, busy: false, summary, draft, message: '已恢复成地球参数' }
          })
          notifyWorkspaceChanged()
        })
        .catch(function () {
          setState(function (prev: any) { return { ...prev, busy: false, message: '恢复失败' } })
        })
    }

    /**
     * 反解：把「我要什么」翻译成「该改哪个基础量」。
     */
    const solve = function () {
      const wanted = Number(state.anchorWanted)
      if (!Number.isFinite(wanted) || wanted <= 0) {
        setState(function (prev: any) { return { ...prev, message: '目标值要是正数' } })
        return
      }
      setState(function (prev: any) { return { ...prev, message: null } })
      callApi('/solve-anchor', {
        kind: state.anchorKind,
        wanted: wanted,
        world: draftToWorld(state.draft),
      }).then(function (result: any) {
        setState(function (prev: any) { return { ...prev, anchorResult: result } })
      }).catch(function (error: any) {
        setState(function (prev: any) {
          return { ...prev, message: '反解失败：' + ((error && error.message) || error) }
        })
      })
    }

    /**
     * 应用反解结果：把解出的基础量写进草稿并保存。
     */
    const applyAnchor = function () {
      const result = state.anchorResult
      if (!result || !result.solved) return
      const draft = { ...state.draft }
      for (const [key, value] of Object.entries(result.changes || {})) {
        draft[key] = String(value)
      }
      setState(function (prev: any) { return { ...prev, draft, anchorResult: null, anchorWanted: '' } })
      const world = draftToWorld(draft)
      callApi('/workspaces/save-world', { name: props.name || '', world })
        .then(function () { return callApi('/summary', { world }) })
        .then(function (summary: any) {
          setState(function (prev: any) {
            return { ...prev, summary, message: '已应用改动' }
          })
          notifyWorkspaceChanged()
        })
        .catch(function () {
          setState(function (prev: any) { return { ...prev, message: '应用失败' } })
        })
    }

    if (state.loading) return h(Loading, { text: '正在读取世界设定…' })
    if (state.error) return h(Failure, { text: '读取失败：' + state.error, onRetry: load })

    const summary = state.summary || {}
    const meta = state.meta || {}
    const groups = meta.groups || []
    const anchors = meta.anchors || []

    // ── ① 参数输入（只放基础量）──
    const paramRow = function (param: any) {
      const value = state.draft[param.key] !== undefined ? state.draft[param.key] : ''
      return h('div', {
        key: param.key,
        style: { display: 'flex', flexDirection: 'column', gap: 1, margin: '0 0 7px' },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          h('span', {
            style: { font: T.f12, color: T.text2, minWidth: 92, flex: '0 0 auto' },
            title: param.affects,
          }, param.label),
          param.kind === 'bool'
            ? h('select', {
                style: { ...inputStyle(76) },
                value: value === '' ? String(param.def) : value,
                disabled: state.busy,
                onChange: function (event: any) { changeParam(param.key, event.target.value) },
              },
                h('option', { key: 'true', value: 'true' }, '有'),
                h('option', { key: 'false', value: 'false' }, '无'))
            : param.kind === 'choice'
              ? h('select', {
                  style: { ...inputStyle(150) },
                  value: value === '' ? String(param.def) : value,
                  disabled: state.busy,
                  onChange: function (event: any) { changeParam(param.key, event.target.value) },
                }, (param.choices || []).map(function (item: any) {
                  return h('option', { key: item.value, value: item.value }, item.label)
                }))
              : h('input', {
                  style: { ...inputStyle(96), textAlign: 'right' },
                  placeholder: String(param.def),
                  value: value,
                  disabled: state.busy,
                  onChange: function (event: any) { changeParam(param.key, event.target.value) },
                }),
          param.unit
            ? h('span', { style: { font: T.f11, color: T.text3 } }, param.unit)
            : null),
        // 影响说明：灰色小字，鼠标不用悬停也能看到
        h('div', {
          style: { font: T.f11, color: T.text3, paddingLeft: 98, lineHeight: 1.5 },
        }, param.affects))
    }

    const basicParams = []
    const advancedParams = []
    for (const group of groups) {
      for (const param of group.params) {
        if (param.tier === 'basic') basicParams.push(param)
        else advancedParams.push(param)
      }
    }

    const leftPanel = h(Section, {
      title: '① 设定这个世界',
      hint: '改了自动保存，右边立刻更新',
    },
      h('div', null, basicParams.map(paramRow)),
      h('div', { style: { marginTop: 4 } },
        h('div', {
          style: { font: T.f11, color: T.text3, cursor: 'pointer', userSelect: 'none', padding: '4px 0' },
          onClick: function () {
            setState(function (prev: any) { return { ...prev, showAdvanced: !prev.showAdvanced } })
          },
        }, (state.showAdvanced ? '▾ ' : '▸ ') + '进阶参数（' + advancedParams.length + ' 项，一般不用改）'),
        state.showAdvanced ? h('div', { style: { marginTop: 4 } }, advancedParams.map(paramRow)) : null),
      h('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
        h('button', { style: btnStyle({ tiny: true }), disabled: state.busy, onClick: resetAll }, '恢复成地球')))

    // ── ④ 反解 ──
    const anchor = anchors.filter(function (item: any) { return item.kind === state.anchorKind })[0]
    const anchorPanel = h(Section, {
      title: '④ 我想要…',
      hint: '说目标，我告诉你该改哪个数',
    },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, flexWrap: 'wrap' } },
        h('select', {
          style: { ...inputStyle(140) },
          value: state.anchorKind,
          onChange: function (event: any) {
            setState(function (prev: any) {
              return { ...prev, anchorKind: event.target.value, anchorResult: null }
            })
          },
        }, anchors.map(function (item: any) {
          return h('option', { key: item.kind, value: item.kind }, item.label)
        })),
        h('input', {
          style: { ...inputStyle(64), textAlign: 'right' },
          placeholder: '目标',
          value: state.anchorWanted,
          onChange: function (event: any) {
            setState(function (prev: any) { return { ...prev, anchorWanted: event.target.value } })
          },
          onKeyDown: function (event: any) { if (event.key === 'Enter') solve() },
        }),
        h('span', { style: { font: T.f11, color: T.text3 } }, anchor ? anchor.unit : ''),
        h('button', { style: btnStyle({ tiny: true }), onClick: solve }, '算')),
      anchor ? h('div', { style: { font: T.f11, color: T.text3, marginBottom: 6 } }, anchor.hint) : null,
      state.anchorResult
        ? h('div', null,
            state.anchorResult.solved
              ? h('div', null,
                  h('div', { style: { font: T.f12, color: T.text2, lineHeight: 1.7 } },
                    state.anchorResult.reasons.join(' ')),
                  h('div', { style: { font: T.f11, color: T.text3, margin: '6px 0 2px' } }, '连带效应：'),
                  h('div', null, (state.anchorResult.sideEffects || []).map(function (item: any, index: number) {
                    return h('div', {
                      key: 'se-' + index,
                      style: { font: T.f11, color: T.text2, lineHeight: 1.6 },
                    }, '  ' + item.label + '：' + item.before + ' → ' + item.after)
                  })),
                  h('div', { style: { marginTop: 8 } },
                    h('button', { style: btnStyle(), onClick: applyAnchor }, '应用这个改动')))
              : h('div', { style: { font: T.f12, color: T.warn } }, state.anchorResult.why || '解不出来'))
        : null)

    // ── ②③ 结果（只读）──
    const derivedRows = (summary.derived || []).map(function (item: any, index: number) {
      return h('div', {
        key: 'd-' + item.key,
        style: {
          display: 'flex', justifyContent: 'space-between', gap: 8,
          padding: '2px 0',
          borderTop: index === 0 ? 'none' : '1px solid ' + T.hairline,
        },
      },
        h('span', { style: { font: T.f12, color: T.text3 } }, item.label),
        h('span', { style: { font: T.f12, color: T.text1, textAlign: 'right' } }, item.text))
    })

    const impactBlock = function (title: string, lines: any[]) {
      if (!lines || lines.length === 0) return null
      return h('div', { key: title, style: { marginTop: 10 } },
        h('div', { style: { font: T.f12, color: T.text1, marginBottom: 3 } }, title),
        h('div', null, lines.map(function (item: any, index: number) {
          return h('div', {
            key: 'i-' + title + '-' + index,
            title: item.note || '',
            style: { font: T.f11, color: T.text2, lineHeight: 1.7, display: 'flex', gap: 6 },
          },
            h('span', { style: { color: T.text3, minWidth: 96, flex: '0 0 auto' } }, item.label),
            h('span', null, item.value))
        })))
    }

    const rightPanel = h('div', null,
      h(Section, { title: '② 这个世界长什么样', hint: '由左边的输入算出，不能直接改' },
        h('div', null, derivedRows)),
      h(Section, { title: '③ 这意味着什么', hint: '生物与文明会受什么限制' },
        h('div', { style: { font: T.f11, color: T.text3, marginBottom: 2 } }, summary.headline || ''),
        impactBlock('能不能住', summary.environment),
        impactBlock('生物', summary.biology),
        impactBlock('文明', summary.civilization)))

    return h('div', { style: { display: 'flex', height: '100%', overflow: 'hidden' } },
      h('div', {
        style: {
          flex: '0 0 44%', minWidth: 240, overflowY: 'auto',
          padding: '10px 12px',
          borderRight: '1px solid ' + T.hairline,
        },
      },
        state.message ? h(Notice, { text: state.message, tone: /失败/.test(state.message) ? 'error' : 'ok' }) : null,
        leftPanel,
        anchorPanel),
      h('div', { style: { flex: '1 1 auto', minWidth: 0, overflowY: 'auto', padding: '10px 12px' } },
        rightPanel))
  }
}


function makeWorldForm(react: any) {
  if (!react) return function Noop() { return null }
  const h = react.createElement
  const { useState, useEffect } = react
  const { Section, Row, Loading, Failure, Empty, Notice } = createKit(react)

  /** 四个字段的说明（用户要求：非中文处都加标注）。 */
  const FIELDS = [
    {
      key: 'planetMass',
      label: '行星质量',
      unit: '地球 = 1',
      hint: '决定重力。2 倍质量 ≈ 2 倍重力（半径不变时）',
      def: 1,
    },
    {
      key: 'planetRadius',
      label: '行星半径',
      unit: '地球 = 1',
      hint: '和质一起决定重力。半径大则重力小',
      def: 1,
    },
    {
      key: 'rotationHours',
      label: '一天多长',
      unit: '小时',
      hint: '地球 24。太短会有超级风暴，太长会昼夜温差极大',
      def: 24,
    },
    {
      key: 'orbitAU',
      label: '离恒星多远',
      unit: 'AU（地球 = 1）',
      hint: '地球 1。决定冷暖；宜居带约 0.95—1.67',
      def: 1,
    },
  ]

  return function WorldForm(props: any) {
    const [state, setState] = useState({ loading: true, error: null, draft: {}, saved: {}, busy: false, message: null })

    const load = function () {
      setState(function (prev: any) { return { ...prev, loading: true, error: null } })
      callApi('/workspaces/current')
        .then(function (data: any) {
          const world = (data && data.world) || {}
          const draft: any = {}
          for (const field of FIELDS) {
            draft[field.key] = world[field.key] !== undefined ? String(world[field.key]) : ''
          }
          setState(function (prev: any) {
            return { ...prev, loading: false, error: null, draft, saved: world }
          })
        })
        .catch(function (error: any) {
          setState(function (prev: any) {
            return { ...prev, loading: false, error: (error && error.message) || '读取失败' }
          })
        })
    }

    useEffect(function () { load() }, [])

    if (state.loading) return h(Loading, { text: '正在读取世界设定…' })
    if (state.error) return h(Failure, { text: '读取失败：' + state.error, onRetry: load })

    const save = function () {
      setState(function (prev: any) { return { ...prev, busy: true, message: null } })
      const world: any = {}
      for (const field of FIELDS) {
        const raw = state.draft[field.key]
        if (raw !== '' && raw !== undefined) world[field.key] = Number(raw)
      }
      callApi('/workspaces/save-world', { name: (props.name || ''), world })
        .then(function () {
          setState(function (prev: any) {
            return { ...prev, busy: false, message: '已保存。调一下就能看「会有什么后果」那栏的变化。', saved: world }
          })
          notifyWorkspaceChanged()
        })
        .catch(function (error: any) {
          setState(function (prev: any) {
            return { ...prev, busy: false, message: '失败：' + ((error && error.message) || error) }
          })
        })
    }

    const reset = function () {
      setState(function (prev: any) { return { ...prev, busy: true, message: null } })
      callApi('/workspaces/reset-world', { name: (props.name || '') })
        .then(function () {
          setState(function (prev: any) { return { ...prev, busy: false, message: '已恢复成地球参数' } })
          load()
          notifyWorkspaceChanged()
        })
        .catch(function () {
          setState(function (prev: any) { return { ...prev, busy: false, message: '恢复失败' } })
        })
    }

    const rows = FIELDS.map(function (field: any, index: number) {
      return h(Row, {
        key: field.key,
        first: index === 0,
        label: field.label,
        note: field.unit + ' — ' + field.hint,
        right: h('input', {
          style: { ...inputStyle(84), textAlign: 'right' },
          placeholder: String(field.def),
          value: state.draft[field.key] !== undefined ? state.draft[field.key] : '',
          disabled: state.busy,
          onChange: function (event: any) {
            const value = event.target.value
            setState(function (prev: any) {
              return { ...prev, draft: { ...prev.draft, [field.key]: value } }
            })
          },
        }),
      })
    })

    return h('div', null,
      state.message ? h(Notice, { text: state.message, tone: /失败/.test(state.message) ? 'error' : 'ok' }) : null,
      h(Section, {
        title: '基本设定',
        hint: '留空就是默认值（地球）',
      },
        h('div', null, rows),
        h('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
          h('button', { style: btnStyle(), disabled: state.busy, onClick: save }, '保存'),
          h('button', { style: btnStyle({ tiny: true }), disabled: state.busy, onClick: reset }, '恢复成地球'))),
      h('div', { style: { font: T.f11, color: T.text3, marginTop: 10, lineHeight: 1.7 } },
        '调完之后，看左边「会有什么后果」——那里会说清这个设定意味着什么。',
        h('br', null),
        '更细的参数（大气成分、轴倾角、反照率…）可以直接跟 AI 说，让它帮你算。'))
  }
}


function makeGraphCanvas(react: any) {
  if (!react) return function Noop() { return null }
  const h = react.createElement
  const { useState } = react
  const { Section, Empty, Badge } = createKit(react)

  /** 层名（与后端 LAYER_NAMES 对应）。 */
  const LAYER_NAMES = ['基础常数', '第一层（微观）', '第二层（材料）', '第三层（体感）', '第四层（行星）', '第五层（恒星）']

  return function GraphCanvas(props: any) {
    const layout = props.layout
    const labels = props.labels || {}
    const allDepths = (props.allDepths || []).slice().sort(function (a: number, b: number) { return b - a })
    const [hidden, setHidden] = useState({})

    if (!layout || !layout.nodes || layout.nodes.length === 0) {
      return h(Empty, { text: '（这张图没有可画的节点）' })
    }

    // 画布宽度可能就是上千像素：外层加横向滚动，但默认缩放能看全
    const width = Math.max(layout.width, 260)
    const height = Math.max(layout.height, 120)

    // 连线：加粗 + 强调色 + 贝塞尔
    const edges = layout.edges.map(function (edge: any, index: number) {
      const midY = (edge.y1 + edge.y2) / 2
      return h('path', {
        key: 'e-' + index,
        d: 'M ' + edge.x1 + ' ' + edge.y1 + ' C ' + edge.x1 + ' ' + midY + ', ' +
          edge.x2 + ' ' + midY + ', ' + edge.x2 + ' ' + edge.y2,
        fill: 'none',
        stroke: T.accent,
        strokeWidth: 1.6,
        strokeOpacity: 0.55,
      })
    })

    // 箭头：每条线的终点上方一个三角，指示「谁依赖谁」
    const arrows = layout.edges.map(function (edge: any, index: number) {
      const y = edge.y2
      return h('polygon', {
        key: 'a-' + index,
        points: (edge.x2 - 4) + ',' + (y - 7) + ' ' + (edge.x2 + 4) + ',' + (y - 7) + ' ' + edge.x2 + ',' + (y - 1),
        fill: T.accent,
        fillOpacity: 0.75,
      })
    })

    const nodes = layout.nodes.map(function (node: any) {
      const label = labels[node.id] || node.id
      const isBase = node.incoming === 0
      return h('g', { key: node.id, transform: 'translate(' + node.x + ',' + node.y + ')' },
        h('rect', {
          width: 108, height: 30, rx: 4,
          fill: T.layer2,
          // 边框粗细 = 被多少东西依赖（基础量最粗，最好找）
          stroke: isBase ? T.accent : T.hairline,
          strokeWidth: isBase ? 2 : 1,
        }),
        // 第一行：中文名
        h('text', {
          x: 54, y: 13, textAnchor: 'middle',
          style: { font: T.f11, fill: T.text1 },
        }, String(label).slice(0, 12)),
        // 第二行：符号原名（用户要求「非中文处都加标注」）
        label !== node.id
          ? h('text', {
              x: 54, y: 24, textAnchor: 'middle',
              style: { font: T.f11, fill: T.text3 },
            }, String(node.id).slice(0, 14))
          : null)
    })

    // 折叠按钮：每层一个
    const toggles = allDepths.map(function (depth: number) {
      const isHidden = Boolean(hidden[depth])
      return h('button', {
        key: 't-' + depth,
        title: (LAYER_NAMES[depth] || ('第 ' + (depth + 1) + ' 层')) + (isHidden ? '（已隐藏，点击显示）' : '（显示中，点击隐藏）'),
        style: {
          ...btnStyle({ tiny: true, active: !isHidden }),
          marginRight: 3, marginBottom: 3,
        },
        onClick: function () {
          setHidden(function (prev: any) {
            const next = { ...prev }
            next[depth] = !prev[depth]
            return next
          })
          if (typeof props.onToggleDepth === 'function') props.onToggleDepth(depth, !isHidden)
        },
      }, (LAYER_NAMES[depth] || String(depth + 1)))
    })

    return h(Section, {
      title: '依赖关系',
      count: layout.nodes.length,
      hint: '节点框越粗越基础；点层名可隐藏该层',
    },
      h('div', { style: { display: 'flex', flexWrap: 'wrap', marginBottom: 6 } }, toggles),
      h('div', { style: { overflow: 'auto', maxHeight: '46vh', border: '1px solid ' + T.hairline, borderRadius: T.radius } },
        h('svg', {
          width: width, height: height,
          style: { display: 'block', minWidth: width },
        }, arrows.concat(edges).concat(nodes))),
      layout.nodes.length > 0
        ? h('div', { style: { font: T.f11, color: T.text3, marginTop: 4 } },
            '共 ' + layout.nodes.length + ' 个节点、' + layout.edges.length + ' 条连线；箭头指向依赖方。')
        : null)
  }
}


function makeHeatmapView(react: any) {
  if (!react) return function Noop() { return null }
  const h = react.createElement
  const { Section, Empty } = createKit(react)

  return function HeatmapView(props: any) {
    const map = props.map
    if (!map || !map.cells || map.cells.length === 0) {
      return h(Empty, { text: '（没有相图数据）' })
    }
    const cols = map.xValues.length
    const rows = map.yValues.length

    const colorOf = function (level: string) {
      if (level === 'ok') return T.ok
      if (level === 'warn') return T.warn
      if (level === 'danger') return T.danger
      return T.hairline
    }

    // 按行渲染：每行是一个 flex 容器
    const rowEls = []
    for (let r = 0; r < rows; r += 1) {
      const cellsInRow = map.cells.filter(function (c: any) { return c.row === r })
      rowEls.push(h('div', { key: 'row-' + r, style: { display: 'flex', gap: 2 } },
        cellsInRow.map(function (cell: any) {
          return h('div', {
            key: 'c-' + cell.row + '-' + cell.col,
            title: cell.note,
            style: {
              width: 16, height: 16, borderRadius: 2,
              background: colorOf(cell.level),
              opacity: cell.level === 'unknown' ? 0.3 : 1,
            },
          })
        })))
    }

    return h(Section, {
      title: '相图',
      hint: map.xLabel + ' × ' + map.yLabel,
    },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } }, rowEls),
      h('div', { style: { font: T.f11, color: T.text3, marginTop: 6 } },
        '绿=允许，黄=边缘，红=禁止。共 ' + map.cells.length + ' 格；' +
        '每格可悬停看具体说明。'),
      map.narrow && map.narrow.narrow
        ? h('div', { style: { font: T.f11, color: T.warn, marginTop: 4 } }, map.narrow.note)
        : null)
  }
}
function makeDerivationPane(react: any) {
  if (!react) return function Noop() { return null }
  const h = react.createElement
  const { useState, useEffect } = react
  const kit = createKit(react)
  const { Section, Loading, Failure, Empty, Notice } = kit

  return function DerivationPane(props: any) {
    const [state, setState] = useState({ loading: true, error: null, result: '', resultValue: null })

    useEffect(function () {
      let cancelled = false
      setState(function (prev: any) { return { ...prev, loading: true, error: null } })
      // mode：同一子命令的不同呈现（如 whitepaper 的 document / prompt）
      callApi('/derive', {
        sub: props.sub,
        world: props.world || {},
        whitepaperMode: props.mode,
      })
        .then(function (payload: any) {
          if (cancelled) return
          setState({
            loading: false,
            error: null,
            result: (payload && payload.result) || '',
            resultValue: (payload && payload.value) || null,
          })
        })
        .catch(function (error: any) {
          if (cancelled) return
          setState({ loading: false, error: (error && error.message) || '推演失败', result: '', resultValue: null })
        })
      return function () { cancelled = true }
    }, [props.sub])

    if (state.loading) return h(Loading, { text: '正在推演…' })
    if (state.error) return h(Failure, { text: '推演失败：' + state.error })
    if (!state.result) return h(Empty, { text: '（这个目录暂时没有输出）' })

    // 结构化结果交给可视化组件；没有结构化数据就退回文本。
    // 这样同一套 /derive 既能出图也能出文字，不必分成两套接口。
    const structured = state.resultValue || {}
    if (props.viz === 'graph' && structured.graph && props.GraphCanvas) {
      // labels / allDepths 由后端随布局一起给，界面只负责渲染——
      // 这样中文对照表只有一份（src/graph-render.ts），不会前后端各写一遍。
      return h(props.GraphCanvas, {
        layout: structured.graph,
        labels: structured.graph.labels || {},
        allDepths: structured.graph.allDepths || [],
      })
    }
    if (props.viz === 'heatmap' && structured.heatmap && props.HeatmapView) {
      return h(props.HeatmapView, { map: structured.heatmap })
    }

    // 按行渲染：等宽字体 + 保留缩进，因为它本身就是排版好的表格
    const lines = String(state.result).split(String.fromCharCode(10))
    return h('div', null,
      h(Section, { title: '推演结果', hint: '只读：由后端计算，界面不维护第二份数据' },
        h('pre', {
          style: {
            margin: 0, padding: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            font: '11px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            color: T.text2, background: T.layer2, borderRadius: T.radius,
            maxHeight: '52vh', overflowY: 'auto',
          },
        }, lines.join(String.fromCharCode(10)))))
  }
}
function createRightPanel(react: any) {
  const h = react.createElement
  const { useState, useEffect, useCallback } = react
  const kit = createKit(react)
  const { Panel, Section, Row, Empty, Badge, Loading, Failure, Notice } = kit
  const DerivationPane = makeDerivationPane(react)
  const GraphCanvas = makeGraphCanvas(react)
  const HeatmapView = makeHeatmapView(react)
  const WorldForm = makeWorldForm(react)

  return function RightPanel(props: any) {
    const [state, setState] = useState({
      loading: true, error: null,
      list: [], current: null, data: null, table: null, settings: null,
      busy: false, message: null,
      variable: { name: '', value: '' },
      terrain: { name: '', kind: 'plain' },
      disableId: '',
      // 当前打开的目录节点（默认第一项的 1.1 常数表）
      activeNode: 'constants',
      exportText: '',
      worldParams: {} as Record<string, unknown>,
      // 常数表的编辑草稿（名称 → 输入框里的字符串）
      draft: {},
    })

    /** 一次读齐本区需要的五样东西（含完整常数表）。 */
    const load = useCallback(async () => {
      setState((prev: any) => ({ ...prev, loading: true, error: null }))
      try {
        const [list, current, table, settings, constants] = await Promise.all([
          callApi('/workspaces'),
          callApi('/workspaces/current'),
          callApi('/formula-table'),
          callApi('/settings'),
          // 常数表属于**本区**数据，所以在这里读（不再放全局管理）
          callApi('/constants'),
        ])
        setState((prev: any) => ({
          ...prev, loading: false, error: null,
          list: (list && list.workspaces) || [], current: (list && list.current) || null,
          data: current, table, settings, constants,
          // 记录本次刷新的时刻：切换工作区时它会变，用户据此确认「自动跟随」生效了
          syncedAt: new Date().toTimeString().slice(0, 8),
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

    /**
     * 导出：白皮书或 AI 卡片。
     *
     * 结果直接显示在右栏，用户自己复制——不做「下载文件」是因为
     * 桌面端写文件路径会有权限问题，复制粘贴最稳。
     *
     * @param mode - document 或 prompt
     */
    const loadExport = async function (mode: string) {
      setState((prev: any) => ({ ...prev, busy: true, message: null }))
      try {
        const result = await callApi('/derive', { sub: 'whitepaper', whitepaperMode: mode })
        setState((prev: any) => ({
          ...prev,
          busy: false,
          exportText: (result && result.result) || '（没有内容）',
          message: mode === 'prompt' ? '已生成 AI 卡片，复制粘贴即可' : '已生成设定文档',
        }))
      } catch (error: any) {
        setState((prev: any) => ({
          ...prev, busy: false, message: '生成失败：' + ((error && error.message) || error),
        }))
      }
    }

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

    // ══ 宇宙初始化引擎（方案 1.1）══
    //
    // 一个 DSH 工作区强制绑定唯一数据表。若当前工作区还没有表，
    // 不给空白界面——那样用户不知道发生了什么事——而是明确告诉他「这里缺一张表」，
    // 并给出两条路：立即生成，或从已有表导入。
    // ⚠️ 这里不能用下面的 name（它稍后才声明）。
    // state.current 是 /workspaces/current 返回的当前工作区，最可靠。
    const boundName = (state.current && state.current.name) || state.current || 'default'
    const hasTable = Boolean(state.data && (state.data.summary || state.data.name))
    if (!hasTable) {
      const createIt = async function () {
        setState((prev: any) => ({ ...prev, busy: true, message: null }))
        try {
          await callApi('/workspaces/create', { name: boundName })
          notifyWorkspaceChanged()
          await load()
        } catch (error: any) {
          setState((prev: any) => ({ ...prev, busy: false, message: '失败：' + ((error && error.message) || error) }))
        }
      }
      return h('div', { style: { padding: 16, display: 'flex', flexDirection: 'column', gap: 10 } },
        state.message ? h(Notice, { text: state.message, tone: /失败/.test(state.message) ? 'error' : 'ok' }) : null,
        h('div', { style: { font: T.f14s, color: T.text1 } }, '宇宙初始化引擎'),
        h('div', { style: { font: T.f12, color: T.text2, lineHeight: 1.7 } },
          '检测到当前工作区尚未绑定物理规则。'),
        h('div', { style: { font: T.f12, color: T.text2, lineHeight: 1.7 } },
          '系统将自动为你创建专属数据表《' + boundName + '》，并初始化常数表与空公式库。'),
        h('div', { style: { display: 'flex', gap: 8, marginTop: 6 } },
          h('button', {
            style: btnStyle(),
            disabled: state.busy,
            onClick: createIt,
          }, '立即生成'),
          h('button', {
            style: btnStyle({ tiny: true }),
            disabled: state.busy,
            onClick: function () { void load() },
          }, '重新检测')),
        h('div', { style: { font: T.f11, color: T.text3, marginTop: 8, lineHeight: 1.6 } },
          '一个工作区只绑定一份数据表。切换工作区时，本页会自动跟随到对应表，不会混数据。'))
    }

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

    // 下拉框：既显示、也能切。选中后**同时**改「当前表」和绑定，两边保持一致。
    //
    // 早先只调 /workspaces/switch 改当前表、不动绑定，于是后台轮询会按宿主工作区
    // 把表拉回去，出现「选了 B 又变回 A」的错位。
    // 现在改成走 bind 语义：既然数据表与工作区一一对应，切表就等于绑到该表。
    const switcher = h('select', {
      title: '切换数据表：会同时更新「当前表」与绑定关系，右栏内容随之刷新',
      style: { ...inputStyle(118) },
      value: name,
      disabled: state.busy,
      onChange: (event: any) => {
        const next = event.target.value
        if (!next || next === name) return
        // 用 bind 而不是 switch：bind 会把「当前表」和绑定元信息一起改掉。
        //
        // 参数说明（bindHostWorkspace 的语义）：
        //   workspaceId —— 宿主工作区 id；这里传表名，因为选中的就是「想让哪个表当当前表」
        //   title       —— 用来**推导表名**（它才是决定读哪张表的字段）
        // 两者都传 next，于是「选中的表 == 绑定的表 == 当前表」，三处一致，不会错位。
        void act('/workspaces/bind', { workspaceId: next, title: next }, '已切换到 "' + next + '"')
      },
    }, (state.list || []).map((item: any) => {
      return h('option', { key: item.name, value: item.name },
        item.name + (item.boundWorkspace ? '（已绑定）' : ''))
    }))

    const header = h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 8px', borderBottom: '1px solid ' + hairline.borderTop.replace('1px solid ', '') } },
      h('span', { style: { font: T.f14s, color: T.text1 } }, '本区'),
      switcher,
      // 绑定状态灯：切换工作区后这里会自动跟着变。
      // 用户排查「自动切换有没有生效」时，看这一行就够——
      // 左边灰字显示宿主工作区，右边徽标显示已绑定哪张表。
      h('span', {
        title: '一个宿主工作区强制绑定一份同名数据表；切换工作区时本行会自动跟随',
        style: { display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 2 },
      },
        h('span', { style: { font: T.f11, color: T.text3 } }, '已绑定'),
        h('span', {
          style: {
            font: T.f11, color: T.ok,
            border: '1px solid ' + T.hairline, borderRadius: T.radius,
            padding: '0 4px',
          },
        }, name),
        h('span', {
          title: '上一次自动跟随发生的时间',
          style: { font: T.f11, color: T.text3 },
        }, state.syncedAt ? '· ' + state.syncedAt : '')),
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


    /**
     * 常数表（**本区数据**，不是全局配置）。
     *
     * 每个工作区可以有自己的「这个世界的光速/重力/日长」——
     * 所以它属于工作区侧栏，而全局管理里只放「有哪些工作区」。
     *
     * 分组显示：SI 定义常数（度量衡源头）排在最前，因为用户最需要先理解
     * 「单位是怎么被定义的」，再谈改数值。
     */
    const constantsData = state.constants || {}
    const constBase = constantsData.base || []
    const constOverrides = constantsData.overrides || {}
    const siNodes = constBase.filter(function (node: any) { return node.siDefines })
    const otherNodes = constBase.filter(function (node: any) { return !node.siDefines })
    const changedCount = Object.keys(constOverrides).length

    /** 保存单个常数。 */
    const saveConstant = async function (constantName: string) {
      const raw = state.draft[constantName] !== undefined ? state.draft[constantName] : constOverrides[constantName]
      const value = Number(raw)
      if (!Number.isFinite(value) || value <= 0) {
        setState(function (prev: any) { return { ...prev, message: '常数必须是正的有限数' } })
        return
      }
      const ok = await act('/workspaces/save-constant',
        { name: name, constantName: constantName, value: value }, constantName + ' 已保存')
      if (ok) {
        setState(function (prev: any) {
          const draft = { ...prev.draft }
          delete draft[constantName]
          return { ...prev, draft }
        })
      }
    }

    /** 单条恢复为现实值。 */
    const resetConstant = async function (constantName: string) {
      const ok = await act('/workspaces/reset-constant',
        { name: name, constantName: constantName }, constantName + ' 已恢复默认值')
      if (ok) {
        setState(function (prev: any) {
          const draft = { ...prev.draft }
          delete draft[constantName]
          return { ...prev, draft }
        })
      }
    }

    /** 全部恢复为现实值（清空本区所有常数覆盖）。 */
    const resetAllConstants = async function () {
      const ok = await act('/workspaces/reset', { name: name }, '本区常数已全部恢复默认值')
      if (ok) setState(function (prev: any) { return { ...prev, draft: {} } })
    }

    /** 渲染一行常数。 */
    const constantRow = function (node: any, index: number) {
      const changed = constOverrides[node.name] !== undefined
      const shown = state.draft[node.name] !== undefined
        ? state.draft[node.name]
        : changed ? constOverrides[node.name] : node.standard
      return h(Row, {
        key: node.name,
        first: index === 0,
        label: h('span', { style: { display: 'flex', alignItems: 'center', gap: 5 } },
          node.name,
          node.siDefines ? h(Badge, { text: '定义' + node.siDefines, tone: 'accent' }) : null,
          changed ? h(Badge, { text: '已改' }) : null),
        note: (node.meaning || '') + (node.unit ? '  [' + node.unit + ']' : ''),
        right: h('span', { style: { display: 'flex', gap: 4, alignItems: 'center', flex: '0 0 auto' } },
          h('input', {
            style: { ...inputStyle(112), font: T.f11 },
            value: shown === undefined ? '' : String(shown),
            onChange: function (event: any) {
              const value = event.target.value
              setState(function (prev: any) { return { ...prev, draft: { ...prev.draft, [node.name]: value } } })
            },
          }),
          h('button', {
            style: btnStyle({ tiny: true, active: state.draft[node.name] !== undefined }),
            disabled: state.busy || state.draft[node.name] === undefined,
            onClick: function () { void saveConstant(node.name) },
          }, '保存'),
          h('button', {
            style: btnStyle({ tiny: true }),
            disabled: state.busy || !changed,
            onClick: function () { void resetConstant(node.name) },
            title: '恢复成现实宇宙的值',
          }, '重置')),
      })
    }

    const constantSection = h(Section, {
      title: '常数表',
      count: constBase.length,
      hint: changedCount > 0 ? '已改 ' + changedCount + ' 项' : '',
    },
      constBase.length === 0
        ? h(Empty, { text: '（没有可调常数）' })
        : h('div', null,
            h('div', { style: { display: 'flex', justifyContent: 'flex-end', margin: '2px 0 4px' } },
              h('button', {
                style: btnStyle({ tiny: true, danger: changedCount > 0 }),
                disabled: state.busy || changedCount === 0,
                onClick: function () { void resetAllConstants() },
              }, '全部重置为默认值')),
            siNodes.length
              ? h('div', null,
                  h('div', { style: { font: T.f11, color: T.text3, margin: '2px 0' } },
                    'SI 定义常数（国际单位制）—— 它们定义了秒/米/千克/安培/开尔文/摩尔/坎德拉'),
                  siNodes.map(constantRow))
              : null,
            otherNodes.length
              ? h('div', null,
                  h('div', { style: { font: T.f11, color: T.text3, margin: '8px 0 2px' } }, '其它可调量'),
                  otherNodes.map(function (node: any, index: number) { return constantRow(node, index) }))
              : null,
          ),
    )

    // ══ 六大目录的内容区 ══
    //
    // 规则：只有「1.1—1.4」四页是真正可编辑的表单，其余页面都是**只读的推演结果**。
    // 这样才能保证「一个工作区 = 一份数据」——用户能改的永远只有常数与公式，
    // 推演结果由后端算，界面不自己维护第二份真相。
    const renderPane = function (id: string) {
      if (id === 'constants') {
        return h('div', null,
          h(Section, { title: '可调常数', count: constBase.length, hint: changedCount > 0 ? '已改 ' + changedCount + ' 项' : '' },
            constantSection),
          h(Section, { title: '地点与变量', count: terrains.length + variables.length },
            terrains.length ? h('div', null, terrainRows) : h(Empty, { text: '（暂无地点）' }),
            variables.length ? h('div', null, variableRows) : null,
            variableForm, terrainForm))
      }
      // 常数精调：绝大多数作者不需要，所以只挂在「我改过什么」下面，
      // 不占主流程。想改光速、普朗克常数这类基础量的人才进来。
      if (id === 'history-changes') {
        return h('div', null,
          h(Section, {
            title: '基础物理常数',
            count: constBase.length,
            hint: changedCount > 0 ? '已改 ' + changedCount + ' 项（会影响整个世界）' : '默认全部为现实值',
          }, constantSection),
          changedCount > 0
            ? h(Section, { title: '改动清单', hint: '本区相对现实值改了什么' },
                h('div', null, constants.map(function (entry: any) {
                  return h(Row, { key: 'ch-' + entry[0], label: entry[0], note: '= ' + String(entry[1]), right: null })
                })))
            : null)
      }
      // 「基本设定」是唯一的输入表单：作者在这里动手，其余页面都是结果。
      if (id === 'world-basic') {
        return h(WorldForm, { name: name, key: 'world-form-' + name })
      }

      // 其余页面：统一渲染后端推演结果。
      //
      // 一个节点对应一个子命令，多对一是有意的（体感与文明都是不同切面）。
      const subMap: Record<string, string> = {
        'world-dead': 'dead',
        'impact-feel': 'pipeline',
        'impact-civ': 'civilization',
        'fantasy-magic': 'fantasy',
        'fantasy-custom': 'cards',
        'out-whitepaper': 'whitepaper',
        'out-prompt': 'whitepaper',
        'history-archive': 'history',
        'history-changes': 'checklist',
      }
      const sub = subMap[id] || 'pipeline'
      // 提示词卡片单独走一个模式，其余都是文档模式
      const mode = (id === 'out-prompt') ? 'prompt' : undefined
      return h(DerivationPane, {
        sub: sub,
        mode: mode,
        world: state.worldParams || {},
        key: id + '-' + sub,
      })
    }

    const activeItem = state.activeNode || 'world-basic'

    // ══ 右栏：只放三件事 ══
    //
    // 主区已经是完整工作台（改参数 → 看后果），右栏再放目录树就是重复。
    // 这里只保留：状态速览 / 导出 / 换表。
    const body = h('div', { style: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '6px 12px 14px' } },
      state.message ? h(Notice, { text: state.message, tone: /失败/.test(state.message) ? 'error' : 'ok' }) : null,

      // ① 状态速览：说明主区与右栏的关系
      h(Section, { title: '这个世界', hint: '在主区调参数，这里实时反映' },
        h('div', { style: { font: T.f11, color: T.text3, lineHeight: 1.7 } },
          '在主区「① 设定这个世界」改完，右侧「② 这个世界长什么样」会立刻更新。',
          h('br', null),
          '一个工作区固定一份数据表，切换工作区会自动跟随。')),

      // ② 导出：白皮书 / Prompt
      h(Section, { title: '拿走它', hint: '给别人看，或喂给 AI' },
        h('div', { style: { display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' } },
          h('button', {
            style: btnStyle({ tiny: true }),
            onClick: function () { void loadExport('document') },
          }, '生成设定文档'),
          h('button', {
            style: btnStyle({ tiny: true }),
            onClick: function () { void loadExport('prompt') },
          }, '生成 AI 卡片')),
        state.exportText
          ? h('pre', {
              style: {
                margin: '8px 0 0', padding: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                font: '11px/1.55 ui-monospace, Menlo, Consolas, monospace',
                color: T.text2, background: T.layer2, borderRadius: T.radius,
                maxHeight: '34vh', overflowY: 'auto',
              },
            }, state.exportText)
          : null),

      // ③ 设置：提示档位（大部分人可以不管）
      h(Section, { title: 'AI 提示注入', hint: '向 AI 注入多少推演说明' }, modeRow))

    const footer = h('div', { style: { padding: '8px 12px', borderTop: '1px solid ' + hairline.borderTop.replace('1px solid ', ''), ...dim, flex: '0 0 auto' } },
      '一个工作区强制绑定一份数据表；切换工作区时本页自动跟随。全局管理在左侧「数学工作区」。')

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

/**
 * 侧栏那一行的图标。
 *
 * ⚠️ 这里**只能返回图标，不能再写字**。
 * 宿主会把 `label` 回调的返回值当标题文字渲染，如果组件也写字，
 * 就会出现「数学工作区 数学工作区」这样重复两遍（曾经就是这样）。
 *
 * @param react - 宿主 react
 */
function makeSidebarTitle(react: any) {
  return function SidebarTitle() {
    return react.createElement('span', {
      style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16 },
      'aria-hidden': 'true',
    }, react.createElement('span', {
      style: { font: T.f13, color: 'currentColor', lineHeight: 1 },
    }, '∑'))
  }
}

/** 右栏页签标题。 */
/**
 * AI 工具卡片（方案第四部）：把推演结果显示成对话流里的一张卡。
 *
 * 宿主为工具结果提供了 `tool.view.cordis` 这个 slot，
 * 注册进去就能在对话流里渲染自己的结果，而不是一坨纯文本。
 *
 * 卡片只显示**结论与状态**，不堆细节——细节在右侧控制台里看。
 *
 * @param react - 宿主 react
 */
function makeToolCard(react: any) {
  if (!react) return function Noop() { return null }
  const h = react.createElement

  return function ToolCard(props: any) {
    // 宿主会把工具结果放在 props.result / props.output 等字段上。
    // 字段名不确定，所以从几个常见位置兜底取，取不到就退回原文。
    const raw = props && (props.result ?? props.output ?? props.data ?? props.value)
    const text = typeof raw === 'string'
      ? raw
      : (raw && (raw.result || raw.text || raw.content)) || ''

    if (!text) return h('div', { style: { padding: 8, font: T.f12, color: T.text3 } }, '（无推演结果）')

    // 抽取「标题行」与「结论行」：推演输出都以 ═══ 开头
    const lines = String(text).split(String.fromCharCode(10)).filter(function (line: string) {
      return line.trim() !== ''
    })
    const title = (lines[0] || '').replace(/^[=\s]+|[=\s]+$/g, '') || '推演结果'
    const conclusion = lines.filter(function (line: string) {
      return /判定|结论|总结|状态|承载力|上限|速度/.test(line)
    }).slice(0, 3)

    return h('div', {
      style: {
        border: '1px solid ' + T.hairline,
        borderRadius: T.radius,
        padding: '8px 10px',
        margin: '4px 0',
        background: T.layer2,
      },
    },
      h('div', { style: { font: T.f13, color: T.text1, marginBottom: 4 } }, title),
      conclusion.length > 0
        ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            conclusion.map(function (line: string, index: number) {
              return h('div', { key: 'k' + index, style: { font: T.f12, color: T.text2 } }, line.trim())
            }))
        : h('div', { style: { font: T.f12, color: T.text2 } }, (lines[1] || '').trim()),
      h('div', { style: { font: T.f11, color: T.text3, marginTop: 6 } },
        '详细结论在右侧「推演控制台」查看。'))
  }
}

/**
 * 右栏页签标题：只返回图标，文字交给注册时的 title。
 *
 * 同 SidebarTitle：组件再写一遍文字会渲染两遍。
 * 图标与左侧入口保持一致（同一个 ∑），这样一眼能看出左右是一套。
 *
 * @param react - 宿主 react
 */
function makeRightTabTitle(react: any) {
  return function RightTabTitle() {
    return react.createElement('span', {
      style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16 },
      'aria-hidden': 'true',
    // 与左侧入口用同一个字形：同属一个插件，视觉上要能看出是一套。
    }, react.createElement('span', { style: { font: T.f13, color: 'currentColor', lineHeight: 1 } }, '∑'))
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
        // AI 工具卡片：在对话流里渲染推演结果（宿主 slot = tool.view.cordis）
        const ToolCard = react ? makeToolCard(react) : function EmptyToolCard() { return null }
        // v3 工作台：一屏完成「改参数 → 看后果」
        const Workbench = react ? makeWorkbench(react) : function EmptyWorkbench() { return null }

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
            /**
             * 同步「宿主工作区」与「数据表」。
             *
             * 一次做三件事（这就是用户要的「自动创建」）：
             *   ① **批量补建**：把所有已存在的宿主工作区都建出同名数据表
             *      —— 插件装到已有工作区的环境里时，这一步会把历史工作区补齐；
             *   ② **新建即建表**：宿主新建工作区会触发 list 变更 → 再次同步，
             *      新工作区立刻拿到自己的表；
             *   ③ **切当前表**：把「用户正在用的工作区」切为当前数据表，
             *      这样右栏显示的就是本区数据。
             *
             * 为什么用 sync 而不是逐个 bind：bind 会把每个工作区都切成当前，
             * 循环一遍后当前表会是「最后一个」，不是用户所在的那个。
             */
            const bindHost = function () {
              try {
                const ws: any = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined
                const list = ws && ws.workspaces && ws.workspaces.list
                if (!list || typeof list.getSnapshot !== 'function') return
                const snapshot = list.getSnapshot()
                const items = (snapshot && snapshot.items) || []
                if (items.length === 0) return

                const payload = items.map(function (item: any) {
                  return { workspaceId: item.workspaceId, title: item.title }
                })

                // ① + ②：把所有工作区都建表（已存在的复用）
                void fetch(API_BASE + '/workspaces/sync', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ workspaces: payload }),
                }).then(function (response) {
                  return response && typeof response.json === 'function' ? response.json() : null
                }).then(function (result: any) {
                  const created = result && result.data ? result.data.created : undefined
                  if (created > 0) notifyWorkspaceChanged()

                  // ③ 再切到「用户正在用的工作区」
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
                  return fetch(API_BASE + '/workspaces/bind', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workspaceId: active.workspaceId, title: active.title }),
                  }).then(function () {
                    notifyWorkspaceChanged()
                  })
                }).catch(function () {
                  /* 同步失败不影响面板显示 */
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
                // 宿主新建 / 改名 / 删除工作区都会触发这里 → 自动建表
                disposers.push(list.subscribe(bindHost))
              }
            } catch {
              /* 订阅失败忽略 */
            }

            // ── 自动切换的兜底：轮询「当前是哪个工作区」 ──
            //
            // ⚠️ 只订阅 list 是不够的。用户在左侧点另一个工作区时，
            //    列表本身**没有变化**，变的只是「当前指向」——
            //    所以 list.subscribe 永远不触发，自动切换看起来「没做到」。
            //    宿主没有暴露「当前工作区变化」的订阅点（查了已装插件也没找到），
            //    因此用轮询兜底：低频、只比对 id，开销可忽略。
            let lastActiveId = ''
            const pollActive = function () {
              try {
                const ws: any = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined
                const list = ws && ws.workspaces && ws.workspaces.list
                if (!list || typeof list.getSnapshot !== 'function') return
                const items = (list.getSnapshot() || {}).items || []
                if (items.length === 0) return

                // 找「当前工作区」——宿主没有稳定契约，所以按可能性依次试：
                //   ① 列表快照自己带当前 id（最理想）
                //   ② 用「当前会话」反推所在工作区
                //   ③ 都拿不到才退回第一个（此时不会触发切换，只是保证界面有数据）
                let active: any = null

                // ① 快照里的当前 id 字段（不同版本叫法不同，都试一遍）
                try {
                  const snap: any = list.getSnapshot() || {}
                  const currentId = snap.currentWorkspaceId || snap.activeWorkspaceId ||
                    snap.currentId || snap.activeId
                  if (currentId) {
                    active = items.find(function (item: any) {
                      return String(item.workspaceId) === String(currentId) || String(item.id) === String(currentId)
                    }) || null
                  }
                } catch {
                  /* 没有这个字段：继续试 ② */
                }

                // ② 用当前会话反推
                if (!active) {
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
                    /* 没有会话服务：继续 ③ */
                  }
                }

                // ③ 兜底：第一个。注意这里只是让面板有数据可显示，
                //    如果 ①② 都失败，说明拿不到「当前指向」，切换检测不会生效。
                if (!active) active = items[0]
                if (!active) return

                const activeId = String(active.workspaceId || '')

                // ⚠️ 首次轮询**只记录、不绑定**。
                //
                // 早先 lastActiveId 初值是空串，第一次必然「不相等」→ 立刻 bind，
                // 而 active 可能只是兜底拿到的 items[0]（不是用户真正在用的工作区），
                // 于是把「当前表」强行改成第一张表——用户看到的就是
                // 「我明明切到 B 了，界面却显示 A」，误以为自动切换没做到。
                if (lastActiveId === '') {
                  lastActiveId = activeId
                  return
                }
                if (activeId === lastActiveId) return   // 没变，什么都不做
                lastActiveId = activeId

                // 变了：绑到对应数据表，并让两侧面板刷新
                void fetch(API_BASE + '/workspaces/bind', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ workspaceId: active.workspaceId, title: active.title }),
                }).then(function () {
                  notifyWorkspaceChanged()
                }).catch(function () {
                  /* 失败就等下一轮 */
                })
              } catch {
                /* 宿主没有 uiWorkspace：忽略 */
              }
            }

            // ── 兜底轮询：只要后端「当前表」变了，就通知界面刷新 ──
            //
            // 为什么还要这一层：上面的 pollActive 负责「宿主工作区 → 数据表」，
            // 但它依赖宿主的内部结构，不一定拿得到当前工作区。
            // 而**界面显示的是后端的当前表**——只要这个变了，UI 就必须跟着换，
            // 否则就是用户说的「后台绑定了但 UI 不换，让人误会」。
            //
            // 这一层不猜宿主，只问后端：GET /workspaces/current 的 name 变了吗？
            let lastBackendName = ''
            const pollBackend = function () {
              void fetch(API_BASE + '/workspaces/current', { method: 'GET' })
                .then(function (response) { return response && response.json ? response.json() : null })
                .then(function (payload: any) {
                  const data = (payload && payload.data) || payload || {}
                  const currentName = String(data.name || '')
                  if (!currentName) return
                  if (lastBackendName === '') { lastBackendName = currentName; return }
                  if (currentName === lastBackendName) return
                  // 后端当前表变了 → 通知所有面板重新拉数据
                  lastBackendName = currentName
                  notifyWorkspaceChanged()
                })
                .catch(function () { /* 网络失败等下一轮 */ })
            }

            // 2 秒一次：切换工作区是低频操作，2 秒足够快，也不会打扰宿主
            const pollTimer = setInterval(function () {
              pollActive()
              pollBackend()
            }, 2000)
            disposers.push(function () { clearInterval(pollTimer) })
            const right: { service: boolean; registered: boolean; error: string | null } = {
              service: false,
              registered: false,
              error: null,
            }

            // ① 主栏页面：用与入口相同的 id 寻址。
            try {
              const dispose = ctx.slots.inject('main', function () {
                pageOk = true
                // 主区就是工作台。
                //
                // 它需要知道「当前是哪个工作区」（决定存到哪张表）。
                // 主区组件的 props 不会自动带这个，所以用 inject 声明——
                // 这是宿主的正规做法（dsh-novel-writer 也这么用）。
                const MainPage = function MainPage(props: any) {
                  // 空串 = 「用后端当前工作区」，由 save-world 的 name 字段留空表示
                  return react.createElement(Workbench, {
                    name: (props && props.workspaceName) || '',
                  })
                }
                const result = ctx.slots.register({
                  name: 'main',
                  key: PANEL_ID,
                  // ⚠️ 客户端拿不到 currentWorkspace（那是后端函数）。
                  // 工作台内部会自己读 /summary（它返回当前工作区的参数），
                  // 所以这里不注入名字，让 Workbench 用空串表示「用后端当前表」。
                  inject: function () { return {} },
                }, guard(MainPage))
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
                    // 工具卡片（方案第四部）：注册到宿主的工具结果视图 slot。
                    // key 用 'self' —— 与社区插件的用法一致，表示「自己的工具结果」。
                    // 注册失败不算致命：卡片只是锦上添花，不能因为它把整个面板搞挂。
                    try {
                      inner.push(sub.slots.inject('tool.view.cordis', function () {
                        if (!ToolCard) return function () {}
                        return sub.slots.register({ name: 'tool.view.cordis', key: 'self' }, guard(ToolCard))
                      }))
                    } catch {
                      /* 宿主没提供这个 slot 就算了 */
                    }
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
