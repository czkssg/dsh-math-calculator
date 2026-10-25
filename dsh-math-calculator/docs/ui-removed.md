# UI 移除：能力全面转向 AI 接口

> 决定（2026-10-25）：**UI 全砍，不做了。**
> 理由：做了三版（目录树 → 精简 → 工作台），始终效果不佳。
> 所有能力内化为组件接口，只面向 AI。

## 一、砍掉了什么

| 项 | 数量 |
|---|---|
| `src/client.ts` | **2497 行** |
| `lib/client.js` 产物 | **138.8 KB** |
| 客户端测试套件 | 9 个 |
| `tsconfig.client.json` | 1 个 |
| `package.json` 的 `dsh.client` 与 `exports["./client"]` | 2 处 |

## 二、保留了什么

**63 个后端模块，一个没动。**

| 入口 | 用途 |
|---|---|
| `math_execute`（DSH 工具） | 27 种 operation，AI 的主入口 |
| `POST /derive` | 20+ 子命令（推演栈/文明/死寂/观察者/混沌/白皮书…） |
| `POST /summary` | 综合推演（派生量+生物+文明+环境） |
| `GET /world-params` | 23 个参数的元数据 + 4 个锚点 |
| `POST /solve-anchor` | 叙事锚点反解 |
| `POST /workspaces/*` | 数据表 CRUD、绑定、常数、公式、世界参数 |

## 三、这次移除反而强化了三件事

### 1. 参数分层逻辑留在了后端

`world-params.ts` 仍是唯一真相：23 个基础量、7 组、basic/advanced 分层。
AI 调 `GET /world-params` 就能知道「哪些能改、单位是什么、影响什么」。

### 2. 派生量绝不入库的保证还在

`deriveAll()` 的白名单过滤仍然生效：

```
硬塞 gravity=99 → 被丢弃，重力仍按 G·M/R² 现算
```

### 3. 反解能力保留

AI 可以直接调 `POST /solve-anchor`：

```json
{ "kind": "gravity", "wanted": 1.5 }
→ { "changes": { "planetMass": 1.5 },
    "sideEffects": [逃逸速度 11.2→13.7, 大气标高 8400→5600] }
```

## 四、AI 怎么用（代替界面）

用户不再点界面，而是直接说需求：

| 用户说 | AI 调用 |
|---|---|
| 「我想要个重力 1.5 倍的世界」 | `solve-anchor` → 得 planetMass=1.5 → 保存 |
| 「这个星球能住人吗」 | `derive`（dead） |
| 「50 米巨兽需要什么条件」 | `derivation backSolve` |
| 「文明能飞出这个星球吗」 | `derivation civilization` |
| 「把设定整理成文档」 | `derivation whitepaper` |
| 「画个相图」 | `derivation heatmap` |

**这些能力之前也都在，只是现在不再需要先点一个界面。**

## 五、验收

```
56 套 / 2232 项全绿（无基线告警）
没有 client.js 产物 ✓
没有 dsh.client 声明 ✓
exports 不含 ./client ✓
integration 42 项（含上述三条断言，防止被加回来）
```

## 六、前后对比

| | 有 UI | 无 UI |
|---|---|---|
| 客户端代码 | 2497 行 | **0** |
| 前端产物 | 138.8 KB | **0** |
| CLI/工具代码 | — | **不变（63 个模块）** |
| 后端测试 | — | **2232 项全绿** |
| 用户门槛 | 要点开面板、填表、找按钮 | **直接说需求** |

## 七、如果以后想恢复界面

后端接口一个没删，恢复界面只需：

1. 重建 `src/client.ts`（调用 `/summary`、`/world-params`、`/solve-anchor`）；
2. 恢复 `tsconfig.client.json` 与 `package.json` 的 `dsh.client`；
3. 把 `integration.mjs` 里「没有 client.js」三条断言改回存在断言。

数据与能力都不受影响。