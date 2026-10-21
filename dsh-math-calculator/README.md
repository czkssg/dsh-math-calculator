# dsh-math-calculator

DSH（DeepSeek Harness）原生数学计算与**架空世界观推演**插件。

运行期只依赖 `mathjs` 与 `algebrite`，**不 import 任何 `@deepseek-ai/*` 包** —— 所以不会因为 `CallId` 这类导出被删除而崩在启动阶段。

---

## 它解决什么

| 场景 | 传统方式 | 这个插件 |
|---|---|---|
| 高精度计算 | 心算 / bash 拼 | BigNumber 64 位，整数输出完整定点 |
| 写公式 | 每次都重推 | 270 条公式库，参数全可覆盖 |
| 架空世界设定 | 凭感觉 | 输入星球参数 → 出重力/气候/地形上限 |
| 改物理常数 | 无法验证 | 自动推导派生量 + 全公式偏差 + 设定校验 |
| 多世界观 | 互相污染 | 工作区隔离，各持一套常数表与公式表 |

---

## 安装

本插件是标准 DSH bundle（`dsh.bundle.patch` → `cordis.patch.yml`）。

本机 `dsh` 未加入 PATH，实际入口是随桌面版分发的：
`C:\Users\曹某\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd`

```powershell
cd D:\0cengxu\5\dsh-math-calculator
npm install
npm run build

& "C:\Users\曹某\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add D:/0cengxu/5/dsh-math-calculator
```

`dsh plugin` 会把参数转发给 profile 目录里的 pnpm。装完重启桌面版。

**注意**：`desktop` profile 由 Electron 应用独占管理，CLI 无法用 `--dump-config` 检查它
（会报 `profile "desktop" is managed exclusively by the Electron application`）。
验证方式是重启后看「设置 → 插件列表」。

打包成 tgz 再装也可：

```powershell
npm pack
& "...\dsh.cmd" plugin --profile desktop add ./dsh-math-calculator-2.0.0.tgz
```

---

## 25 个 operation

### 基础运算

| operation | 说明 | 示例 |
|---|---|---|
| `evaluate` | 求值（BigNumber 64 位） | `{"expression":"10^20+5"}` |
| `solve` | 解方程；多方程逗号分隔 = 方程组 | `{"expression":"3x + 2y = 10, x - y = 1"}` |
| `system` | 显式线性系统 | `{"matrix":[[3,2],[1,-1]],"vector":[10,1],"operation":"system"}` |
| `derivative` | 符号求导（`order` 指定阶数） | `{"expression":"x^3 * sin(x)","operation":"derivative"}` |
| `integral` | 符号不定积分 | `{"expression":"x^2","operation":"integral"}` |
| `simplify` / `expand` | 化简 / 展开 | `{"expression":"2*x + 3*x","operation":"simplify"}` |
| `roots` | 多项式求根（含复数） | `{"expression":"x^4 + 1","operation":"roots"}` |

### 线性代数与统计

| operation | 说明 | 示例 |
|---|---|---|
| `matrix` | 矩阵运算 | `{"expression":"inv([[1,2],[3,4]])"}` |
| `eigen` | 特征值与特征向量 | `{"matrix":[[2,1],[1,2]],"operation":"eigen"}` |
| `stats` | 描述统计 | `{"data":[1,2,3,4],"operation":"stats"}` |
| `dist` | 概率分布 | `{"distribution":"normal","params":[0,1],"x":1.96,"operation":"dist"}` |
| `regression` | 线性/多项式回归 | `{"data":[1,2,3],"dataY":[2,4,6],"operation":"regression"}` |
| `ode` | 微分方程数值解（RK4） | `{"expression":"dy/dt = -0.5*y","initial":{"y":100},"from":0,"to":10,"operation":"ode"}` |

### 公式库与世界观推演

| operation | 说明 | 示例 |
|---|---|---|
| `formula` | 调用 270 条公式之一 | `{"formula":"escape_velocity","overrides":{"M":5.97e24,"r":6371000},"operation":"formula"}` |
| `formulas` | 检索公式库 | `{"query":"重力","operation":"formulas"}` |
| `world` | 星球参数 → 体感画像 | `{"world":{"planetRadius":1.4,"rotationHours":40},"operation":"world"}` |
| `terrain` | 局地气候（配合 world） | `{"world":{"planetMass":2},"terrain":{"kind":"coastal","latitudeDeg":58},"operation":"world"}` |
| `constants` | 改常数 → 推导派生量 | `{"constants":{"c":1.5e8},"operation":"constants"}` |
| `quantities` | 哪些物理量该跟着变 | `{"constants":{"G":1.3e-10},"constantName":"G","operation":"quantities"}` |
| `impact` | 改常数 → 全公式偏差 | `{"constants":{"c":1.5e8},"operation":"impact"}` |
| `feasibility` | 设定一致性校验 | `{"world":{"planetMass":2},"claims":{"creatureHeight":50},"operation":"feasibility"}` |

### 数据管理

| operation | 说明 | 示例 |
|---|---|---|
| `workspace` | 工作区管理（隔离世界观） | `{"action2":"list","operation":"workspace"}` |
| `formula-table` | 工作区公式表 | `{"tableAction":"show","operation":"formula-table"}` |

### 其他

| operation | 说明 |
|---|---|
| `auto` | 默认。含 `=` 判为方程，其余求值 |
| `help` | 完整能力清单 |

---

## 一个架空世界观的完整推演流程

```jsonc
// 1. 建立世界观（独立数据空间）
{"operation":"workspace","action2":"create","workspace":"aether","description":"低光速高重力世界"}

// 2. 改这个世界的物理常数
{"operation":"constants","constants":{"c":1.5e8,"G":1.3e-10}}
//    → 派生量自动跟随：mu0 +299%、sigma +299%、alpha_fs +100%、ly -50%、Lsun +299%

// 3. 看哪些物理量该跟着变、哪些不该（量纲分析）
{"operation":"quantities","constants":{"G":1.3e-10},"constantName":"G"}
//    → 普朗克长度 ∝√G、玻尔半径与 G 无关、表面重力 ∝G

// 4. 看全部 270 条公式相对现实的偏差
{"operation":"impact","constants":{"c":1.5e8}}
//    → 11 条受影响：质能 -75%、黑体辐射 +300%、维恩位移 -50%

// 5. 设定星球参数，看体感画像
{"operation":"world","world":{"planetRadius":1.4,"rotationHours":40,"obliquityDeg":45}}

// 6. 细化某个地点的气候
{"operation":"world","world":{"planetMass":2},"terrain":{"kind":"coastal","latitudeDeg":58,"oceanCurrent":"warm"}}

// 7. 校验设定有没有超出物理上限
{"operation":"feasibility","world":{"planetMass":2},"claims":{"creatureHeight":50,"buildingHeight":3000}}
//    → 50m 巨兽超限 4 倍（上限 12.5m），建议降低重力

// 8. 定制这个世界的公式（改结构或加新公式）
{"operation":"formula-table","tableAction":"override","formulaId":"kinetic_energy","newExpression":"m * v^2"}
```

**关键点**：第 2 步改的常数会自动流入后续所有公式计算。因为公式里的常量（如 `gravitation` 的 `G`）会**自动绑定到工作区的常数表**，而不是写死现实值。

---

## 常用参数

| 参数 | 说明 |
|---|---|
| `expression` | 表达式/方程；多方程用逗号 |
| `variables` | 变量字典，如 `{"m":500,"v":30}` |
| `operation` | 上述 25 个之一；不填 = `auto` |
| `precision` | 有效数字，默认 64，范围 1-256 |
| `variable` | 求导/求根的自变量，默认 `x` |
| `overrides` | 公式参数覆盖（架空改造的核心） |
| `constants` | 要改的物理常数（只能改基础旋钮） |
| `world` | 星球参数 |
| `terrain` | 局地地形参数 |
| `claims` | 待校验的设定 |

**34 个物理常数**：20 个基础旋钮（`c` `G` `h` `kB` `e_charge` `me` `mp` `NA` `epsilon0` `day` `AU` `Rearth` `Mearth` `Rsun` `Msun` `atm` + 4 个数学常数）+ 14 个派生量（自动推导，不能直接设）。

---

## 让模型记得用它

插件做了三层感知机制，避免模型「自己心算一遍」：

1. **工具描述**枚举全部 25 个 operation，并写明「凡是需要数值计算都必须调用」
2. **系统提示注入**（`ctx.systemPrompt.section`）每轮对话提醒，默认 `brief` 档，可用 `{"promptMode":"full"}` 切换
3. **`agent/pre-step` 钩子**实时检测用户消息里的计算需求，命中则插入提醒（每会话最多 3 次，用过插件后静默）

检测器经 22 个样本验证：12 个计算需求全中，10 个非计算文本（编年史、编号列表、版本号等）零误报。

---

## 已知边界

完整实测档案见 [LIMITS.md](LIMITS.md)（78 条，46 项支持 / 19 项不支持）。

1. **符号积分受 Algebrite 限制**。`∫x²`、`∫sin(x)`、`∫1/x` 能算；`∫x³sin(x)`、`∫ln(x)/x` 其实有初等原函数但引擎算不出；`∫sin(x²)`、`∫x^x` 数学上确实无初等原函数。
2. **特征值/概率/回归是 double 精度**，不受 `precision` 影响（mathjs 限制）。
3. **ODE 只做初值问题**，刚性方程用显式 RK4 可能不准（会警告）。
4. **方程组只支持线性**，非线性明确报 `unsupported`。
5. **mathjs 没有 SVD / 秩 / 零空间**。
6. **`pi` 常量硬编码 64 位**，`precision` 超过 64 对 pi 无效（对 `1/7` 等有效）。
7. **局地气候与可行性校验是经验模型**，有 2~3 倍不确定性，输出已标注置信度。
8. **UI 面板需要宿主提供 `slots` 服务**，部分宿主版本可能不派发槽位。

---

## 安全模型

- 禁用 `math.import` 与 `createUnit`（前者可注入任意 JS 函数）
- AST 遍历拦截 `process` / `require` / `constructor` / `globalThis` 等标识符与危险属性访问
- 复杂度阈值：`factorial(1e9)` 一类在 AST 层拒绝
- **无 `eval`、无 `new Function`**
- 工作区名白名单（防路径穿越），写盘用临时文件 + rename 原子替换

---

## 开发与测试

```powershell
npm run build          # 主代码 + client 分别编译
npm run typecheck
node run-all-tests.mjs # 19 套测试，960 项
```

单套测试：`node test/<name>.mjs`。

测试清单：主功能 66 / 公式库 35 / 公式完整性 270 / 常识反算 15 / 常数耦合 51 / 长链后果 61 / 影响评估 42 / 量纲分析 42 / 公式表 33 / 可行性 40 / 模型感知 29 / 检测器 38 / 钩子 20 / 地形 30 / 星球 32 / ODE 34 / 工作区 38 / 清理 35 / 整合 49。

### 目录结构

```
src/
├── index.ts            插件入口 + 工具定义 + operation 分发（2032 行）
├── ops/                8 个较大的 operation 实现
├── formula-library*.ts 270 条公式（3 个批次）
├── constants-graph.ts  34 个常数的依赖图
├── quantities.ts       量纲分析与缩放指数
├── feasibility.ts      11 条设定约束
├── consequences.ts     跨尺度长链后果
├── world.ts / terrain.ts  星球与局地推演
├── workspace.ts        工作区隔离与持久化
├── formula-table.ts    工作区公式表
├── awareness.ts / detector.ts  模型感知
├── api.ts / client.ts  UI 后端与浏览器面板
└── ...
```

---

## 许可

MIT
