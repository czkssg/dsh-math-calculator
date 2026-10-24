# 客户端 UI 架构（重写后）

> 2026-10-24 整体重写。这里记录**为什么这么组织**，以及宿主侧的三条硬约束。

## 一句话

`src/client.ts` 是**单文件脚本**，包含「加载壳 + UI 全部代码」；
宿主把它当脚本执行，**不能有顶层 `import` / `export`**。

## 为什么不能拆模块（真机约束）

一开始我把 UI 拆成 `src/ui/{theme,kit,data,left-panel,right-panel}.ts` 五个模块，
编译后 `lib/client.js` 带顶层 `import`/`export` —— 结果两个测试直接红：

| 测试 | 报错 |
|---|---|
| `integration.mjs` | 「是脚本格式（无顶层 import/export）」失败 |
| `client-registration.mjs` | 「client.js 在脚本环境执行」失败 |

宿主用 `window.__ModuleLoader__.load({ id, factory })` 接收这一份文件，
它期望的是一个**脚本**：`factory(require)` 内部才 `require('react')`。
顶层 ESM 语法会让它无法执行。所以 UI 代码**必须内联**。

## 另一条约束：顶层声明必须用 `var`

宿主会**重复执行**同一份 `client.js`（热重载 / 重放 bundle）。顶层写
`const PANEL_ID = ...` 时，第二次执行会抛：

```
Identifier 'PANEL_ID' has already been declared
```

这个未捕获错误会把整次 web boot 判为失败，桌面端再升级成致命错误
（历史上真发生过：`DesktopFatalError` → `app.quit()`，窗口都没出来）。

**做法**：顶层一律 `var`（函数作用域、可重复声明），并且第二道防线是
`window.__dshMathCalculatorClientRegistered__` 幂等闸门 —— 重复执行直接 return。

## 第三条约束：`react.Component` 可能还没有

脚本环境里 `react` 由 `factory(require)` 注入。如果写成
`class X extends react.Component`，在 react 尚未取到的路径上会抛
`Class extends value undefined`。

**做法**：

```js
const Base = react.Component || function Placeholder() {}
return class MathCalcErrorBoundary extends Base { ... }
```

## 文件内部布局

```
src/client.ts
├── 常量（PANEL_ID / RIGHT_TAB_ID）
├── 主题令牌 T + btnStyle/inputStyle      ← 左/右两栏共用
├── kit：Panel / Section / Row / Empty / Badge / Notice / Loading / Failure
├── data：callApi / notifyWorkspaceChanged / subscribeWorkspace / reportClientStatus
├── left-panel：全局管理（工作区 / 常数表 / 公式表 / 设置 四页签）
├── right-panel：本工作区工作台（切换器 / 开关 / 数据表 / 管理）
└── bootstrap：__ModuleLoader__.load({ id: '包名', factory }) + 幂等闸门
```

各段用 `// ═══ 段落名 ═══` 分隔，靠注释而不是靠 import 组织。

## 席位注册（4 处）

| 席位 | 作用 | 关键参数 |
|---|---|---|
| `main` | 左栏点开后显示的主页面 | `key = PANEL_ID` |
| `sidebar.panellist` | 左栏那一行入口 | `id = PANEL_ID`、`order = 30` |
| `sidebarRightTabs.register` | 右栏页签类型 | `id = RIGHT_TAB_ID`，`guide` 每项**必须有 `id`** |
| `sidebar.right.pane.tab` / `.title` | 右栏内容与标题 | `key = RIGHT_TAB_ID` |

四个席位**各自独立 try/catch**：任一缺失只跳过自己，不影响其它；
结果全部写进心跳（`GET /api/dsh-math-calculator/client-status`）。

## 验证方式

```bash
node .scratch/simulate-host.mjs     # 用 vm 模拟宿主，打印实际注册了什么
```

预期输出：4 个席位全部注册、`id === 包名`、零异常。
**这是判断「UI 到底有没有挂上」最可靠的证据** —— 比看浏览器截图更早、更准。
