# 自动创建（补建 + 新建即建）

> 用户两条要求：
> ① 新建工作区时自动创建对应数据表；
> ② 安装插件后，给**已经存在**的工作区创建对应数据表。

## 实现方式

新增接口 `POST /api/dsh-math-calculator/workspaces/sync`：

```json
{ "workspaces": [ { "workspaceId": "...", "title": "..." }, ... ] }
```

后端对**每个**工作区执行 `bindHostWorkspace`：表不存在就建、存在就复用，
返回逐项明细 + 汇总（`total / created / existing / results[]`）。

### 前端什么时候调用

```js
// client.ts 的 bindHost()
bindHost()                                    // ① 插件加载时立刻同步一次
list.subscribe(bindHost)                      // ② 宿主工作区列表变化时再同步
```

于是：

| 场景 | 触发 | 结果 |
|---|---|---|
| **安装插件**（宿主已有 3 个工作区） | 启动时 `bindHost()` | 一次建出 3 张表 |
| **新建工作区** | `list.subscribe` 回调 | 新表立刻出现 |
| 工作区改名/删除 | 同上 | 重新对齐 |

**为什么用 sync 而不是循环 bind**：`bind` 会把每个工作区都切成当前，
循环一遍后当前表变成「最后一个」，而不是用户所在的那个。
所以 sync 只建表、不切当前；切换由单独的 bind 负责（在 sync 之后执行）。

## 实测结果

清空数据表目录，模拟「刚装上插件」：

```
起点：0 个文件

① 安装后补建
   sync → total=3 created=3 existing=0
   proj-alpha   新建
   proj-beta    新建
   world-gamma  新建
   磁盘：proj-alpha.json / proj-beta.json / world-gamma.json

② 再 sync 一次
   total=3 created=0 existing=3      ← 不重复建

③ 宿主新建第 4 个工作区
   total=4 created=1
   new-delta.json 存在: true         ← 新建即建表

④ 切换当前表
   绑定 proj-beta  → current = proj-beta
   绑定 proj-alpha → current = proj-alpha
```

这些全部进了 `test/api.mjs` 的「10.6」小节（9 条断言）。

## 与「工作区作用域」的关系

两者配合工作：

- `sync` 负责**建齐**所有工作区的表（安装后 / 新建后）；
- `scopeFromCwd` 负责**选中**当前该用哪张表（每次工具调用按 cwd 切）。

只有建齐了，切换工作区才能立刻拿到自己的表 —— 这就是之前缺的那一环。
