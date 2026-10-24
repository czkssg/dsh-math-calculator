# 三项可视化能力（不引第三方库）

> 用户要求：尽量用现有工具完成，不行从 git 仓库找可用代码，实在完不成就放弃。
> **三项全部完成，且没有引入任何新依赖。**

## 一、结论先行

| 项目 | 方案原估计 | 实际做法 | 结果 |
|---|---|---|---|
| DAG 画布 | 需要绘图库 + 布局算法 | **手写分层布局 + 原生 SVG** | ✅ |
| 相图热力图 | 需要 canvas 渲染 | **CSS grid + 背景色** | ✅ |
| AI 工具卡片 | 需要宿主协议 | **`tool.view.cordis` slot** | ✅ |

## 二、DAG 画布：手写分层布局

### 为什么不用 React Flow

我查了社区插件 `dsh-node-flow`，它用了 `@xyflow/react` + `zustand`，
产物 370 KB。但我的 client 有一条硬约束：

```
client.js 必须单文件、无 import、无打包
```

所以引不进第三方库。**但也不需要**——SVG 元素在 react 里就是普通标签：

```ts
h('svg', { width, height }, edges.concat(nodes))
h('path', { d: 'M ... C ...' })
h('rect', { width: 108, height: 24 })
```

### 布局算法：分层 + 同层均分

```
1. 按「到最底层的距离」算层号
2. 同层节点等距横向排开
3. 层与层之间纵向留白
```

比力导向布局简单，但对**分层依赖图**效果更好——力导向会画成一团，
而分层布局一眼能看出「谁依赖谁」。

### 实测（地球世界）

```
节点 40 个，连线 62 条，共 4 层，画布 1970×296 px
```

节点框**边框越粗表示被越多东西依赖**——基础量一眼可见。

## 三、相图热力图：CSS grid 而非 canvas

相图通常只有几十×几十格，用 DOM 反而更好：能 hover、能看 title、可无障碍。

### 实测（行星质量 × 轨道距离，9×9=81 格）

```
   0.5 AU : ~~~~~~~~~   ← 太热，边缘
   0.8 AU : OOOOOOOOO   ← 允许
   1.0 AU : OOOOOOOOO   ← 地球在这里
   1.3 AU : ~~~~~~~~~   ← 偏冷，边缘
   2.5 AU : ~~~~~~~~~

统计：允许 18 / 边缘 63 / 禁止 0
```

### 这里发现并修掉一个判定错误

第一版把「全球冻结」也判成 **dead（死寂）**，导致 1.3 AU 之后一片红。

**但火星均温 210 K 仍有液态卤水**——温度极端不等于长不出物质。

修正分级：

| 原因 | 等级 |
|---|---|
| 化学键过弱 / 原子核不稳定 | **dead**（真的没有物质） |
| 冻结 / 沸腾 | **marginal**（环境恶劣但物质还在） |

修完后 0.8—1.0 AU 是绿，其余是黄——**符合常识**。

## 四、AI 工具卡片：找到了宿主协议

### 怎么找到的

宿主 asar 读不了，但**已装插件的产物可以读**。
汇总 17 个已装插件用过的 slot 名，得到：

```
main
sidebar.panellist
sidebar.right.pane.tab
sidebar.right.pane.tab.title
conversation.input.dock
settings.plugins.tab
settings.section
tool.view.cordis          ← 就是它
```

`dsh-mattpocock-skills-deck` 的实际用法：

```js
slots.register({ name: 'tool.view.cordis', key: 'self' }, withCx(RunPanel))
```

### 我的实现

```
工具卡片只显示：
  标题行（从 ═══ 开头那行提取）
  结论行（含「判定/结论/上限/速度」的 3 行）
  一行提示「详细结论在右侧推演控制台查看」
```

**不堆细节**——卡片是摘要，细节去控制台看。

注册包了 try/catch：宿主没这个 slot 时卡片不生效，但不影响面板。

## 五、踩到的其他坑

### 坑 1：组件跨闭包引用

`GraphCanvas` 在右栏闭包外定义，`DerivationPane` 拿不到。
改从 props 传入：`h(DerivationPane, { viz, GraphCanvas, HeatmapView })`。

### 坑 2：导出常量缺注释

`NODE_W` / `GAP_X` 这些被 doccheck 拦下（项目要求每个导出都有注释）。逐个补上。

### 坑 3：测试断言跟着行为变更失效

冻结降级后，5 处测试还在断言 `level === 'dead'`。
改成用「化学键过弱」这个**真正的死寂场景**来测。

## 六、验证

```
62 套 / 2423 项全绿（新增 visualization.mjs 26 + visualization-ui.mjs 31）
DAG：40 节点 / 62 边 / 4 层，坐标与尺寸齐全 ✓
热力图：81 格，地球附近判为允许 ✓
工具卡片：已注册 tool.view.cordis ✓
无第三方绘图库：无 @xyflow、无 getContext ✓
客户端硬约束：无 import/export、无写死颜色 ✓
```

## 七、如果以后要升级

| 现状 | 可升级为 | 代价 |
|---|---|---|
| 分层布局 + SVG | React Flow（拖拽、缩放、小地图） | 需改打包方式，产物 +300 KB |
| CSS grid 热力图 | canvas（十万级格子） | 需 canvas 渲染，失去 hover |
| 静态 SVG | 加入「点击节点看溯源」交互 | 需要状态管理 |

目前的版本**够用且零依赖**，符合「尽量用现有工具完成」的要求。
