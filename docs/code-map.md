# 代码地图（自检指南）

面向：接手的人、另一个 AI、以及未来的自己。

**目标**：任何一段代码都能回答三件事——它解决什么问题、依据是什么、什么时候会失效。
配套自检命令在文末；npm run preflight 会把注释覆盖也纳入装机前检查。

---

## 1. 入口与加载链路

| 入口 | 文件 | 说明 |
|---|---|---|
| 工具入口 | src/index.ts → lib/index.js | 导出 name / inject / apply；apply 注册工具、提醒层、HTTP 路由 |
| HTTP 入口 | src/api.ts | /api/dsh-math-calculator/*，供 **AI** 调用（没有前端，UI 已移除） |
| 清单 | cordis.patch.yml + package.json 的 dsh 字段 | 决定插件加载顺序与依赖 |

> **没有客户端入口。** 2026-10-25 砍掉全部前端，`src/client.ts` / `lib/client.js`
> 已不存在，见 [../dsh-math-calculator/docs/ui-removed.md](../dsh-math-calculator/docs/ui-removed.md)。

apply() 的顺序是有意的：先注册工具（核心能力），再挂提醒（失败不影响工具），最后挂路由（没有 webServer 就跳过）。

---

## 2. 数据流

### 2.1 一次工具调用

   模型 → math_execute(args)
           └─ runMathTool → operation 分发（index.ts）
                ├─ evaluate / solve / derivative…  直接算
                ├─ formula  → formulas.ts → formula-table 物化 → mathjs 求值
                ├─ world    → generateWorld（见 2.2）
                ├─ constants→ constants-graph 重算派生量 → 写入工作区
                └─ 返回 { result 文本, value JSON }

### 2.2 world 推演管线

   有效常数（现实基准 ⊕ 工作区覆盖）
     → constants-core：α、μ → 尺度阶梯（原子/材料/键能）
     → stellar：质光/质径 → 有效温度、主序寿命、宜居带、紫外占比、α 敏感度
     → climate：辐照 → 季节成因 → 纬度气候 → 全球均温
     → sky：恒星颜色/视星等 → 白天配色 → 夜空亮度与星数
     → moons：希尔球/洛希极限/间距 → 每颗卫星的角直径、视星等、潮汐锁定
     → life：化学窗口 → 生命硬否决（只判绝对不行）
     → integration：跨模块一致性（轨道 vs 宜居带、历法卫星、容量…）
     → provenance：哪些数字只是地球标定

### 2.3 常数如何传导

   operation=constants → setActiveConstants(覆盖表)
     → 后续 formula / world / sky / climate 全部读 getActiveConstants()
     → 工作区切换时换成该工作区的常数表（数据隔离）

### 2.4 数据落盘

   $DSH_HOME/math-calc/workspaces/<name>.json    工作区（常数表、公式表、地点、变量）
   $DSH_HOME/math-calc/formula-packs/global.json 全局公式包（所有工作区共享）

---

## 3. 模块分组

### 基础运算

| 文件 | 职责 | 测试 |
|---|---|---|
| index.ts | operation 分发、工具 schema、错误翻译 | run / integration |
| ops/shared.ts | mathjs 实例、参数类型、错误类型、输入规范化 | run |
| numeric.ts | 秩/零空间/奇异值/质因数分解/数值求根 | numeric |
| symbolic.ts / systems.ts / stats.ts / ode.ts | 符号计算 / 线性系统 / 统计分布 / RK4 | 对应套件 |

### 公式库

| 文件 | 职责 | 测试 |
|---|---|---|
| formula-library*.ts（6 批） | 395 条公式数据 | formulas-all |
| formulas.ts | 合并批次、求值、检索、频次 | formulas / formula-story |
| formula-table.ts | 工作区公式表（覆盖/自定义/停用）+ 常量绑定 | formula-table |
| formula-pack.ts | 全局公式包（$DSH_HOME，可写盘） | formula-ext |
| taxonomy.ts | 三轴标签：规则层级 / 学科领域 / 主角频率 | taxonomy |
| symbols.ts | 符号索引与消歧（symbol:m@质量） | formula-ext |

### 世界推演

| 文件 | 职责 | 测试 |
|---|---|---|
| world.ts | 总装：恒星/轨道/行星/气候/天空/卫星/生命/检查 | world / scale-world |
| constants-core.ts | 无量纲常数 → 尺度阶梯 | constants-core |
| constants-graph.ts | 20 旋钮 + 14 派生量的依赖图 | constants |
| stellar.ts | 恒星结构、寿命、α 敏感度 | stellar |
| climate.ts | 三层气候（辐照/季节/纬度） | climate |
| sky.ts | 恒星颜色、白天天空、夜空 | sky |
| moons.ts | 多卫星稳定性与观感 | moons |
| life.ts | 化学窗口 + 生命硬否决 | life |
| integration.ts | 跨模块一致性检查 | integration-checks |
| provenance.ts | 经验/设定项登记 | provenance |
| terrain.ts / quantities.ts / feasibility.ts / impact.ts / consequences.ts | 局地气候 / 量纲 / 设定校验 / 公式影响 / 长链后果 | 对应套件 |

### 数据与接口

| 文件 | 职责 | 测试 |
|---|---|---|
| workspace.ts | 工作区隔离、持久化、清理 | workspace / cleanup |
| api.ts | HTTP 路由（设置/常数/公式表/工作区/推演），供 AI 调用 | api / host-contract / ai-journey |
| world-params.ts | 23 个基础量的元数据（**白名单的唯一真相**） | summary / ai-journey |
| summary.ts | `deriveAll()`：派生量现算、绝不入库 | summary |
| awareness.ts / detector.ts | 工具描述、系统提示、pre-step 检测 | awareness / detector / hook |

---

## 4. 自检命令

    npm run build        # tsc 单份配置（无客户端 bundle）
    npm run test:all     # 58 套 / 2327 项
    npm run preflight    # 装机前自检（含「客户端确实已移除」反向断言）
    npm run doccheck     # 注释覆盖（模块头 + 每条导出）
    npm run preflight    # 装机前总检（构建/契约/席位/依赖/注释/package）

---

## 5. 注释规范（硬性）

1. **模块头**：/** … @module dsh-math-calculator/<路径> */，写清职责、依据、失效条件；
2. **每条导出**：必须有紧邻的文档注释，说明参数、返回值与坑；
3. **经验系数**：必须写明适用域（例："α 偏离现实 < 50%"）；
4. **踩过的坑**：写成「⚠️ + 真机证据 + 正确做法」，放在代码旁而不是提交信息里；
5. **错误**：抛 CalcError（type/message/hint），不要抛裸 Error。

doccheck 会强制 1、2；3–5 靠 review，但都有既有例子可照抄。

---

## 6. 遇到不明代码时怎么查

1. 读**模块头**——大多数「为什么这样写」都在里面；
2. grep 导出名找调用点，看它被谁依赖；
3. 找**对应测试**（第 3 节表）；测试名通常就是行为说明；
4. 还看不懂就 npm run doccheck + 读 FORMULAS.md / LIMITS.md / docs/adr/；
5. 仍不明 → 视为缺陷：补注释或补测试，别让下一任再猜。

---

## 7. 扩展步骤

| 要加什么 | 步骤 |
|---|---|
| 新 operation | MathOperation 联合类型 → schema enum → opHelp → 分发 switch → integration 的 operation 断言 → 测试 |
| 新公式 | 写进对应 formula-library-*.ts（含 params 单位描述）→ node test/formulas-list.mjs 重生成目录 → formulas-all 基线 +1 |
| 新全局公式（不改代码） | tableAction:"global-add"（校验会挡住坏公式） |
| 新推演模块 | 先写模块头（问题/依据/失效条件）→ 纯函数 + 测试 → 接进 world.ts → 在 provenance.ts 登记经验系数 |
| 新路由 | 加进 api.ts，**专用路由必须写在 `workspaces/*` 通配之前**（否则会被通配截获并自动建表）→ 进 test/api.mjs 基线 |
| 新世界参数 | 只改 `world-params.ts` 一处（白名单单一真相，`save-world` 与 `deriveAll` 都跟着它走）→ summary 基线 +1 |
