# 数据表跟着「工作区」走（照 dsh-memory 的做法）

> 结论：**作用域 = 当前会话 cwd 的 basename**，不是「工作区列表的第一项」。

## 之前错在哪（两次都错）

| 版本 | 做法 | 为什么错 |
|---|---|---|
| 第一版 | 插件内部自己维护 `default` 工作区 | 与宿主的「5 / 默认工作区」毫无关系 |
| 第二版 | 取 `uiWorkspace.workspaces.list` 的 **`items[0]`** | 同时开着多个工作区时，第一项往往不是用户正在用的那个 |

所以你看到的现象是：切了工作区，右侧数据表还是 `default`。

## 正确做法（读 `dsh-memory` 源码得出）

`dsh-memory/lib/util.js`：

```js
export function scopeOf(sessionOrAgent, registry) {
  const session = sessionOrAgent?.session ?? sessionOrAgent
  const cwd = session?.meta?.cwd ?? session?.cwd
  if (cwd) {
    const base = basename(String(cwd).replace(/\\/g, '/'))
    if (base && base !== '.' && base !== '/') return base      // D:\\0cengxu\\5 → "5"
  }
  // 回落：按 sessionIds 在 registry 里反查工作区
  if (registry && session?.id) {
    for (const ws of registry.list()) {
      if (Array.isArray(ws.sessionIds) && ws.sessionIds.includes(session.id)) { ... }
    }
  }
  return 'global'
}
```

它的工具侧调用方式（`lib/tools/memory.js`）：

```js
async execute(args, exec) {
  const toolScope = scopeOf(exec?.agent, ctx?.workspaceRegistry)
}
```

**两个要点**：

1. 作用域看 **`exec.agent.meta.cwd`**（工具执行的第二个参数），不是看工作区列表；
2. 派生方式是 **basename** —— 目录名就是工作区名。

## 我们的实现

```ts
// workspace.ts
export function scopeFromCwd(cwd: unknown): string   // D:\\0cengxu\\5 → "5"
export function cwdOfExec(exec: unknown): string     // exec.agent.meta.cwd

// index.ts —— mathExecuteTool
execute: async (args, exec) => {
  const scope = scopeFromCwd(cwdOfExec(exec))
  if (scope !== currentWorkspace()) switchWorkspace(scope)   // 跟着工作区切表
  return runMathTool(rawArgs)
}
```

⚠️ **我们之前根本没接第二个参数 `exec`**（写的是 `execute: async (args) => ...`），
所以永远不知道用户在哪个工作区 —— 这就是「不跟工作区切换」的根因。

## 前端同样修正

右栏绑定不再取 `items[0]`，而是：

1. 读 `uiWorkspace.sessions.list` 的 `currentSessionId`；
2. 在 `workspaces.list.items` 里找 `sessionIds` 包含它的那个工作区；
3. 拿不到才退回第一项。

## 已验证

```
scopeFromCwd("D:\\0cengxu\\5")      → 5
scopeFromCwd("/home/u/mathlab")      → mathlab
scopeFromCwd("D:\\a b\\with space") → with-space
scopeFromCwd("D:\\中文目录")          → default（回落）

工具执行序列：
  cwd = proj-alpha → current = alpha
  cwd = proj-beta  → current = beta
  回到 proj-alpha → current = alpha      ← 不重建，原表还在
```

这些全部进了 `test/workspace-scope.mjs`（20 项断言）。

## 一个遗留限制

中文目录名会被清成空，回落 `default`（与其它工作区撞表）。
原因是数据表名只允许 `[A-Za-z0-9_-]`。要支持中文目录，放宽
`scopeFromCwd` 里的白名单即可，但需要同步确认文件读写路径安全。
