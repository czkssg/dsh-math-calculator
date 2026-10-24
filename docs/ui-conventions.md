# UI 约定（从社区插件源码学到的做法）

> 读的是本机已安装的社区插件产物（`dsh-context` / `dsh-better-sidebar` /
> `@nanmicoder/dsh-agent-teams` / `dsh-my-guardian` / `dshmarket` / `dsh-novel-writer`）。
> 结论都带证据（谁在用、怎么写的），不是猜。

---

## 1. 右侧边栏页签：必须「注册 + 两个槽位」

只挂 `sidebar.right.pane.tab` 是**不够的**——页签条上不会出现这一项。三个插件
（dsh-context、dsh-better-sidebar、agents-teams）都是同一套两段式：

```js
// ① 先登记页签（决定页签条上出现什么）
sidebarRightTabs.register({
  id, kind,
  title: () => '...',           // 页签标题（函数，便于本地化/延迟求值）
  guide: [{ order, title, description, icon }],  // 引导项
})

// ② 再挂内容与标题两个槽位，key === 上面的 id
slots.inject('sidebar.right.pane.tab',       () => slots.register({ key: id, inject }, Body))
slots.inject('sidebar.right.pane.tab.title', () => slots.register({ key: id }, Title))
```

证据：`dsh-context` 客户端里连着写这三步；`dsh-better-sidebar` 的注释明确说
「title slots for one native implementation id」。

**我们的做法**：id = `dsh-math-calculator.workspace`（带包名，避免与别人的页签相撞），
两段式照抄；`sidebarRightTabs` 作为**可选服务**用嵌套 `ctx.inject` 拿，
服务不存在时静默跳过。

---

## 2. 响应式：订阅宿主的 store，不要轮询

`dsh-better-sidebar` 探到的服务面：

```js
const right = ctx.get('sidebarRight')
methods(right, ['openTab', 'focus', 'active', 'isExpanded', 'toggleExpanded'])
methods(right.mounted,  ['getSnapshot', 'subscribe'])
methods(right.openTabs, ['getSnapshot', 'subscribe'])
methods(registry,       ['get', 'subscribe'])
```

它的集成写法（关键几行）：

```js
ctx.inject(['sidebarRightTabs', 'sidebarRight', 'uiWorkspace', 'layout', 'slots'], (injected) => {
  const connected = facesOf(injected)        // 逐个校验方法存在，缺一个就整体放弃
  if (connected === undefined) return
  cleanups.push(connected.registry.subscribe(refresh))
  cleanups.push(connected.slots.subscribe(BODY_SLOT, refresh))
  refresh()
  return () => cleanups.forEach((fn) => fn())
})
```

**要点**：① 只订阅、不轮询；② 注册前先**验证服务面**（方法齐全才用）；
③ 回调里返回 dispose，卸载时清理。

**我们的做法**：订阅 `sidebarRight.mounted`（页签可见性变化 → 刷新）；
另外增补一条宿主没覆盖的路径——**左栏切换工作区**时，用同一个 client bundle 内的
模块级订阅（`subscribeWorkspace` / `notifyWorkspaceChanged`）通知右栏重新拉数据。

---

## 3. `sidebar.panellist` 的 order 有约定，别乱写

左侧主导航行的 `order` 是**小整数**，社区实际取值：

| 插件 | order |
|---|---|
| `dshmarket` | **1** |
| `dsh-context` | **20** |
| `dsh-novel-writer` | **25**（源码注释：「任务看板=20、skill-explorer=30、ssh=40：我们排在任务看板之后」） |

**我们用 30**（与它们同排）。写更大（如 900）只会排到后面，**没有别的后果**。

### ⚠️ 更正：左侧那行「更多」是宿主原生的

读宿主 `dsh-client-ui-sidebar/lib/client.js` 后确认：

```js
const NO_PANELS = []
createSnapshotStore({ unpinned: NO_PANELS })      // 初始为空、纯内存、不持久化

// 主列表 = panels 中「不在 unpinned 集合里」的项
panels.filter(({ id }) => id === 'plugins' || !unpinned.includes(id)).map(...)

// 「更多」= 只要宿主提供了 entry actions 就**总是渲染**
hasEntryActions && <PanelMoreMenu label={t('panels.more')} entries={panels} onPinnedChange={setPinned} />
```

- 语言包证据：`zh = { "panels.label": "全局面板", "panels.more": "更多" }`；
- 它列出**全部面板**并带「固定 / 取消固定」开关；
- 触发条件是 `hasEntryActions`（官方插件管理器提供 `sidebar.panellist.actions`），
  **不是插件的 order**，插件侧也**无法移除**它；
- `unpinned` 只存在内存里：默认空 → **所有面板默认都出现在主列表**；
  只有在「更多」里点了取消固定，该面板才会从主列表移走（重启即恢复）。

**自查**：看不到我们的入口时，先确认面板**注册成功**（见 §1），而不是去调 order。

---

## 4. 数据归属：一个工作区 = 一份数据，UI 不自己存状态

社区插件的共同点：**显示什么由后端/宿主决定，前端只渲染**。

- 我们不学它们的具体数据模型（`uiWorkspace` 面向会话/文件树），但照搬这条原则：
  - 每份工作区一个 JSON（`$DSH_HOME/math-calc/workspaces/<name>.json`），
    内含常数表 / 公式表 / 地点 / 变量 —— **一个工作区一张数据表**；
  - 右侧面板一次性读 `/workspaces`（列表）+ `/workspaces/current`（本区详情）
    + `/formula-table`（开关状态）+ `/settings`（档位），**不在前端拼数据结构**；
  - 所有写操作都带 `name`（当前工作区），保证写到「本区」而不是别的区。

---


## 5.5 视觉：只用宿主设计令牌，左右共用一套

社区插件的面板外观不是自己调色，而是**全部取宿主主题 CSS 变量**。
统计它们产物里出现的 `--dsw-*` 令牌共 **103 个**，常用的是：

| 用途 | 令牌 |
|---|---|
| 文本层级 | `--dsw-alias-label-primary / -secondary / -tertiary / -caption` |
| 分隔与描边 | `--dsw-alias-border-l1 … l4`、`--dsw-alias-hairline` |
| 面/层 | `--dsw-alias-bg-layer-1 … 4`、`--dsw-alias-bg-overlay` |
| 交互态 | `--dsw-alias-interactive-bg-hover`、`-hover-accent`、`-bg-active` |
| 状态色 | `--dsw-alias-state-warn-primary`、`-success-primary`、`-error-primary`、`--dsw-alias-danger` |
| 字体 | `--dsw-font-xxxs-11` / `xxs-12` / `xs-13` / `s-14` / `s-strong-14` |
| 圆角 | `--dsw-radius-sm` / `md` / `lg` / `panel` |

写法是 **`font: var(--dsw-font-xs-13)`** 与 `border: 1px solid var(--dsw-alias-border-l2)`，
不要写死 `13px`、`#ccc`、`rgba(128,128,128,.4)` —— 那样在深色主题或用户改字号时就会失配。

**我们的做法**：模块级 `UI` 令牌表 + `buttonStyle()` / `inputStyle()` 两个构造器，
左栏（全局管理）、右栏（本工作区工作台）、主栏三个页签**全部复用同一套**。
现有结果：源码 59 处令牌引用、产物 17 个令牌、**写死颜色 0 处**（有测试守着）。

### 宿主 UI 原语（可选增强）

社区插件还会 `require('@deepseek-ai/dsh-client-ui-primitives')` 拿宿主组件，
实测可用的导出包括：
`Button`、`Input`、`Switch`、`Pill`、`Tag`、`Menu`、`MenuSurface`、`Modal`、`Tooltip`、`Toast`、
`DisclosureRow`、`StateDot`、`JsonTree`、`MarkdownText`，以及成体系的图标
（`IconPlusOutlineRegular`、`IconTrashOutlineRegular`、`IconRefreshOutlineRegular`、
`IconCheckOutlineRegular`、`IconWarningTriangleOutlineRegular` …）。

它是**客户端基线模块**（不必在 `dsh.client.external` 声明），但 `dsh-novel-writer`
的做法最稳：**`try/catch` 取，取不到就回退自绘**。我们目前只用令牌 + 原生元素，
换取「零 API 依赖风险」；未来要用原语，请照 novel-writer 那样带兜底。

---

## 5. 面板必须能单独失败

`dsh-my-guardian` 等社区插件把面板当**独立故障域**；我们沿用：

- 每个槽位单独 `try/catch`：某个槽位不存在只跳过；
- 面板外包一层错误边界（`MathCalcBoundary`），渲染异常只降级本面板；
- 注册失败要**回滚已注册的部分**（避免「有页签没内容」）；
- 不注入全局样式（不碰 `document.head`）。

---

## 6. 命名与命名空间

- 槽位 id / key / DOM class / HTTP 路径一律带包名前缀（`dsh-math-calculator`）；
- 页签 id 用 `<包名>.<用途>`（我们：`dsh-math-calculator.workspace`）；
- 路由独占 `/api/dsh-math-calculator`，注册时**不带尾斜杠**。

---

## 7. 自查清单（改 UI 前过一遍）

- [ ] 右栏：`sidebarRightTabs.register` + 两个槽位，`key` 与页签 id 一致
- [ ] 可选服务用嵌套 `ctx.inject`，缺失时静默跳过
- [ ] 刷新靠订阅（`sidebarRight.mounted`）+ 跨面板通知，不用轮询
- [ ] `sidebar.panellist` 的 order 在 10–40 量级，注释写清排位依据
- [ ] 写操作都带当前工作区名；读操作一律走后端接口
- [ ] 面板有错误边界；注册失败能回滚
- [ ] 不注入全局样式、不与其它插件抢 id / 路由 / 槽位
