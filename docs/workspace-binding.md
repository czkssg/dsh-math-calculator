# 数据表 ↔ 宿主工作区绑定

> 解决的问题：插件自己的「工作区」与 DSH 的「工作区」原来是两套东西。

## 之前错在哪

插件内部自己维护了一个叫 `default` 的工作区列表，而宿主左侧列表里的
「5」「默认工作区」是**宿主自己的**工作区，两者毫无关联。结果是：

- 右侧面板永远显示 `default`，跟用户在哪个工作区没有关系；
- 左边新建工作区、右边看不到变化；
- 数据表成了「创建后就没人用的临时文件」。

## 现在的机制

宿主的 `uiWorkspace` 服务暴露工作区清单：

```js
ctx.get('uiWorkspace').workspaces.list
// → { items: [{ workspaceId, path, title, sessionIds }], ... }
//    .getSnapshot()  /  .subscribe(fn)   两者都有
```

插件在 `apply` 里做两件事：

```js
bindHost()                              // ① 启动/切换时绑定当前工作区
list.subscribe(bindHost)                // ② 宿主工作区变了再绑一次
```

绑定走 `POST /api/dsh-math-calculator/workspaces/bind`，
后端 `bindHostWorkspace(workspaceId, title)`：

1. 由 `title` 派生数据表名（`sanitizeWorkspaceFileName`，只留 `[A-Za-z0-9_-]`）；
   没有 title 时用 `ws-<workspaceId 前 8 位>`，保证同一工作区永远落到同一张表；
2. **表不存在就建**（`switchWorkspace` 内部落盘）；
3. 记下 `hostWorkspaceId` / `hostWorkspaceTitle`，界面上能说清这张表对应谁；
4. 切换为当前表 → 右栏立刻显示它。

## 已验证的行为

| 操作 | 结果 |
|---|---|
| 绑定工作区「5」 | 新建 `5.json`（created=true） |
| 绑定工作区「default-workspace」 | 新建 `default-workspace.json` |
| 往「5」写变量 | `5.json` 里有；`default-workspace.json` 干净 |
| 再次绑定「5」 | 复用 `5.json`（created=false），**原有数据还在** |
| 只有 id 没有 title | 表名 `ws-<id前8位>`，稳定 |

这五条都进了 `test/api.mjs` 的「10.5」小节（13 条断言），以后不会悄悄退化。

## 命名规则

```
title "5"                  → 5.json
title "默认工作区"          → workspace.json      （中文被清掉后为空，用兜底名）
title "default-workspace"  → default-workspace.json
无 title，id cccccccc-...  → ws-cccccccc.json
```

**注意**：中文标题会被清成空，此时回退到 `workspace`。若你希望中文也能当文件名
（Windows 允许），把 `sanitizeWorkspaceFileName` 的白名单放宽即可 —— 改动只有一行。
