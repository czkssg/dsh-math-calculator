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

## 未决

- 客户端 `dsh.client.inject` 目前只写 `@deepseek-ai/dsh-client-runtime`；
  前端真正接入时需按 dsh-question-note 的做法补齐 `dsh-client-ui-slots` 等 UI 包。
- 是否需要把 `agent/pre-step` 的提醒频率做成用户可配置项。
