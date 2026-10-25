# ADR-0002：AI 面向层与插件冲突规避

- 状态：已采纳
- 日期：2026-10-22
- 决策者：用户 + agent

## 背景

本插件是**双重面向**的：对用户要有可视化面板，对 AI 要有可调用、可理解、不会误用的接口。
用户要求：参考开源社区成熟 DSH 插件的做法，设计简短精干的提示词，并让代码与输出用自然语言讲清用途。

## 本机插件审计（2026-10-22）

已装的 18 个插件遵循同一套注册约定：

| 约定 | 证据 |
|---|---|
| 用 `dsh.bundle.patch` 把插件挂进宿主插件树 | 全部插件 package.json |
| 客户端用 `dsh.client.platform: "web"` + `inject` 声明依赖的 UI 包 | dsh-context、dsh-question-note、dsh-connect-* |
| 每个插件有唯一包名与唯一 UI 面板 id | 同上 |
| 重逻辑放宿主侧，前端只调用后端路由 | dsh-connect-*、dsh-memory |

**没有**任何插件靠"改宿主全局变量"生效——全部通过 patch + 服务注入。

## 决策

### 1. AI 面向层分三层，并设定 token 预算

| 层 | 载体 | 预算 | 内容 |
|---|---|---|---|
| 工具描述 | `TOOL_DESCRIPTION` | ≤ 800 字符 | 何时必须用、25 个 operation 分组、读输出约定 |
| 系统提示 | `systemPrompt.section`（brief） | ≤ 320 字符 | 核心能力 + 三条读输出规则 + help 指针 |
| 主动提醒 | `agent/pre-step` 钩子 | 每会话 ≤ 3 次 | 检测到计算需求时插入一条提醒 |

超过预算会挤占模型对内容的注意力，**宁可少说，也要说准**。

### 2. 输出必须自带「可信度语义」

模型读完输出要能直接判断哪条能信：

- `[精确]` / `[标度]` / `[量级]` / `[仅方向]` —— 每条结论的信度；
- `【跨模块一致性】` 的 ✓/⚠/✗ —— 设定是否自相矛盾；
- `【模型可信度】` —— 哪些数字只是地球标定、适用域在哪。

这三样同时存在于**人类可读文本**与 **JSON 字段**中，AI 与前端各取所需。

### 3. 冲突规避（学自成熟插件）

| 风险 | 本插件的做法 |
|---|---|
| 工具重名 | 工具名固定 `math_execute`，不与社区插件冲突 |
| 提示段冲突 | `systemPrompt.section({ name: 'math-calculator', order: 180 })`，名字与顺序都唯一 |
| 路由冲突 | HTTP 前缀 `/api/dsh-math-calculator`，注册为 exact + prefix 两条 |
| UI 面板冲突 | 面板 id `math-calc-workspaces`，槽位 `sidebar.panellist` |
| 服务依赖冲突 | `export const inject = ['tools']`；其余服务一律 `ctx.get` 可选读取 |
| 污染宿主 | 不写全局变量、不改 mathjs 单位表、删除 `import`/`createUnit` |
| 数据污染 | 所有工作区数据在 `$DSH_HOME/math-calc/workspaces`，按工作区隔离 |

### 4. 注释即文档（供人和 AI 共同阅读）

每个模块头部必须回答三件事：**它解决什么问题、依据是什么、什么时候会失效**。
已有的例子：`api.ts` 的宿主契约记录、`_host-mocks.mjs` 的两次真机事故、`provenance.ts` 的标定表。

## 后果

- 工具描述从约 2 KB 压缩到 782 字符，brief 从约 700 字符压缩到 288 字符；
- 新增能力（天空/恒星/生命/一致性）必须同时进入描述与 brief，否则模型不知道；
- 前端仍未接入（用户明确"前端再说"），但 `value` 字段已稳定，前端只做展示。

## 客户端挂载（2026-10-22 修正）

审计发现原实现挂的是 `sidebar.panellist` 与 `main` —— **社区插件不用这两个槽位**
（dsh-my-guardian 用 `sidebar.right.pane.tab` + `.title`），面板很可能永远不出现，
而挂 `main` 还有覆盖原生主界面的风险。已改为：

| 项 | 改后 |
|---|---|
| 挂载点 | 只挂 `sidebar.right.pane.tab` 与 `sidebar.right.pane.tab.title` |
| 面板 id | `math-calc-workspaces`（唯一 key） |
| 样式 | 全部 inline style，**不向 document.head 注入 CSS** |
| 故障隔离 | 每个槽位独立 try/catch + React 错误边界 |
| 卸载 | apply 返回 disposeAll，逐个释放 |
| 依赖声明 | `dsh.client.inject` 补 `@deepseek-ai/dsh-client-ui-slots` |

安全测试见 `test/client-ui.mjs`（19 项）：静态检查不污染全局、模拟宿主加载、
槽位缺失只跳过、无 slots 服务时静默退出。

## 用户界面：只做入口，不占界面（2026-10-22 修正）

用户明确：UI 不是计算器，是配置与数据管理；且**只做一个入口**，不要直接铺在原生界面上。

改用 DSH 官方席位（与 dsh-novel-writer 同款）：

| 席位 | 作用 | 注册参数 |
|---|---|---|
| `sidebar.panellist` | 侧栏「插件市场 / 任务看板」同排的一行入口 | `{ id, order, label }` |
| `main` | 点开后的页面内容（同名 id 寻址） | `{ key: id }` |

宿主负责行盒子、选中态、折叠、无障碍；我们只画 icon 与页面内容。
防御规则：

1. 只用 `ctx.slots.inject`（槽位等待），**绝不用 `ctx.inject`**——后者会让 entry 判为
   did not activate，直接拖垮桌面端启动（dsh-novel-writer 的真机事故记录）；
2. 没有 `main` 席位就不注册入口（避免点开是空页）；
3. 入口注册失败时回滚已注册的页面，不留孤儿；
4. 两个席位都挂在错误边界内，面板内部异常不影响原生界面。

## 未决

> ⚠️ **2026-10-25 取代（superseded in part）**：本文「客户端挂载」「用户界面：只做入口」
> 两节所描述的界面已**全部移除**。做了三版（目录树 18 节点 → 精简 10 节点 → 单页工作台）
> 效果始终不好，决定不做前端，能力只经 `math_execute` 与 HTTP 路由给 AI。
> 见 [../../dsh-math-calculator/docs/ui-removed.md](../../dsh-math-calculator/docs/ui-removed.md)。
>
> **本文仍然有效的是**：AI 面向层这条主决策（工具描述压低、brief 注入、`value` 稳定）、
> 以及「不让插件占用原生界面」这个方向——只是终点从「做一个精简面板」变成了「不做界面」。
> 历史内容保留不改，方便理解为什么当初要折腾三版界面。

- ~~面板尚未在真机（Electron）验证~~ —— 面板已移除，此项作废；
- 是否需要把 `agent/pre-step` 的提醒频率做成用户可配置项（仍有效）。
