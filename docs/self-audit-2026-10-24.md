# 自检报告（2026-10-24 21:55）

> ⚠️ **历史报告，2026-10-25 起部分作废**：本文「要求 3」「要求 4」核对的是已移除的界面
> （4 个槽位、设计令牌、客户端硬约束）。要求 1（数据表跟着工作区走）与
> 要求 2（一区一表）**仍然有效**，是后端能力。见
> [../dsh-math-calculator/docs/ui-removed.md](../dsh-math-calculator/docs/ui-removed.md)。
>
> 保留原文是为了记住当时的证据链与踩过的坑（cwd 取值链、心跳时序），不改写。

针对用户提出的四项要求逐条核对。**每条都附实测证据，不是"应该能行"。**

## 要求 1：数据表跟着工作区切换

| 检查项 | 结果 | 证据 |
|---|---|---|
| 取到当前会话 cwd | ✅ | `execShape.resolvedCwd = "D:\0cengxu\5"` |
| 由 cwd 推出作用域 | ✅ | `resolvedScope = "5"` |
| 已切到该作用域的表 | ✅ | `currentWorkspace = "5"` |
| 表文件真实存在 | ✅ | `workspaces/5.json` |
| 表里记着绑定关系 | ✅ | `hostWorkspaceTitle: "5"`，`hostWorkspaceId: e3f9433a-…` |

**cwd 的正确来源**（读宿主 `dsh-tools` 源码确认，不是猜）：

```
exec = { token, callId, rootCallId, name, signal, agent, parent, schema, ... }
agent = { id, session, ctx, runtimeContext, ... }      ← 没有 meta.cwd
cwd   = ctx.get("workingDirectory").ensure(agent)      ← 权威来源
```

取值链：`exec 上直接读` → `workingDirectory 服务` → `agent.session 投影` → 回落 `default`。

## 要求 2：一个工作区一张同名数据表

当前磁盘：

| 文件 | 绑定的宿主工作区 |
|---|---|
| `5.json` | `5` |
| `default-workspace.json` | `default-workspace` |
| `default.json` | （无绑定，旧版遗留） |

命名规则：`basename(cwd)` → 清洗成 `[A-Za-z0-9_-]` → 文件名。
测试覆盖 20 项（`test/workspace-scope.mjs`）。

## 要求 3：UI 显示（左栏 + 右栏）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 4 个席位都注册 | ✅ | 宿主模拟输出：`main` / `sidebar.panellist order=30` / `sidebar.right.pane.tab` / `.title` |
| 零异常 | ✅ | `=== 警告/异常 === （无）` |
| 用户可见 | ✅ | 已由用户截图确认：左栏「数学工作区」，右栏「本区 + default 下拉」 |

**心跳时序已修正**：原来看 `apply` 结束时的 `pageOk/rowOk`，但宿主是**异步声明槽位**的，
那一刻必然为 false（所以显示 `page:false` 却界面正常）。现在改为在**注册回调里**上报，
读到的才是真实结果。

## 要求 4：UI 重写（内部代码）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 使用宿主设计令牌 | ✅ | 产物 19 个 `--dsw-*` |
| 无写死颜色 | ✅ | `#/rgba` 命中 0 处 |
| 左右共用同一套 | ✅ | 同一份 `T` 令牌表 + 同一组 `kit` 构件 |
| 符合宿主加载约束 | ✅ | 单脚本、无顶层 `import/export`、顶层全 `var` 幂等 |

## 全量检查

```
42 套 / 1764 项    全绿
preflight          通过
doccheck           0 缺失（49 文件 / 321 导出）
宿主模拟           4 席位全注册，零异常
HTTP 接口          5 个全部 200
```

## 仍未验收的

- **切换工作区后自动换表**：代码已实现（`list.subscribe(bindHost)` + 工具侧
  `switchWorkspace(scope)`），但**需要两个不同 cwd 的工作区实测**。目前只有一个
  `D:\0cengxu\5` 在工作，无法验证 B 区的表现。
- **中文目录名**：会被清洗成空 → 回落 `default`。当前工作区不受影响。
