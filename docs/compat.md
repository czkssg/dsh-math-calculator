# 兼容性设计与测试

> 面向：后来维护的人、另一个 AI。
> 前提：**其它插件可以是任意代码**——可能抛错、抢占服务、污染全局、抢先注册同名资源。
> 我们不能假设宿主环境干净，只能保证自己在脏环境里仍然存活。

---

## 1. 设计原则（代码已实现，测试已锁定）

### 1.1 分层降级：核心能力与附属能力解耦

`apply()` 的执行顺序是刻意的：

| 顺序 | 做什么 | 失败了会怎样 |
|---|---|---|
| 1 | 注册工具 `math_execute` | **唯一硬失败**——没有工具就没有插件 |
| 2 | 挂 `agent/pre-step` 钩子 | 静默跳过，只少一层提醒 |
| 3 | 注入 systemPrompt | 静默跳过，模型少一条提示 |
| 4 | 注册 HTTP 路由 | 逐条 try/catch，只影响 UI 面板 |

任何第 2–4 步失败都**不能让 entry 判为 did not activate**——那是真机事故（插件装上了但工具没注册）。

### 1.2 访问可选服务必须防御

```ts
optionalService(ctx, 'systemPrompt')   // 只用这个，不直接 ctx.systemPrompt
```

原因：cordis 的 Proxy 在未声明 inject 时会抛
`cannot get property ... without inject`。直接访问等于给宿主交了一个必炸的导入。

### 1.3 注册要能释放

`ctx.effect(...)` / 返回 disposer：热重载（HMR）时重复注册会导致槽位重复、路由冲突。

### 1.4 不污染别人

- 只声明 `inject: ['tools']`，不抢服务；
- 不写 `Object.prototype`、不改 `Math/Date/JSON`；
- 不新增全局变量；
- UI 槽位用带包名前缀的 id（`dsh-math-calculator-client`）；
- HTTP 前缀独占 `/api/dsh-math-calculator`，注册时不带尾斜杠。

### 1.5 数据层要容错

工作区 JSON / 全局公式包都由用户和其他工具写，可能损坏：

- 损坏 JSON → 返回可用默认值，不抛；
- 字段类型错 → 忽略该字段；
- 公式包里有非法公式 → **只丢非法的，保留合法的**；
- 同目录下有无关文件 → 忽略，不影响列表。

---

## 2. 测试怎么跑

```bash
node test/compat.mjs        # 29 项：敌意 ctx / 服务抢占 / 全局污染 / 敌意输入
node test/compat-data.mjs   # 13 项：数据损坏 / 并发 / 目录共存 / 重复导入
npm run test:all            # 全量（已包含这两套）
```

---

## 3. 覆盖的场景

### A. 残缺 / 敌意 ctx

| 场景 | 期望 |
|---|---|
| `apply(undefined)` | 抛**说明清楚**的错误（不是 TypeError） |
| 缺 `tools` 服务 | 同上 |
| 任意属性访问都抛错的 Proxy | apply 仍成功 |
| `tools.register` 抛错 | **向上传播**（不能假装注册成功） |

### B. 注册点被抢占

| 场景 | 期望 |
|---|---|
| 别的插件已注册 `math_execute` | 明确失败，不静默 |
| 路由冲突 | 只影响 UI，工具照常 |

### C. 全局污染

| 场景 | 期望 |
|---|---|
| `Math.random` 被劫持 | apply 不失败 |
| `Object.prototype` 被加料 | 计算仍正确（2+3=5） |
| `globalThis.Math` 被替换 | 执行不抛（可能返回 unsupported 错误，但结构完整） |

### D. 重复加载

| 场景 | 期望 |
|---|---|
| 二次 apply | 不抛；要么成功注册要么明确报错 |
| 多个独立 ctx | 各自注册、互不影响 |

### E. 我们不污染别人

| 测点 | 期望 |
|---|---|
| 全局变量 | 新增 0 个 |
| `inject` | 只有 `tools` |
| `Object.prototype` | 条目数不变 |

### F. 服务被顶替

`systemPrompt` / `ctx.on` / `ctx.inject` 抛错或形状不对时，apply 仍成功、工具仍注册。

### G. 敌意输入

9 组畸形参数：**不许出现裸异常**。两类合法拒绝：
- 宿主 schema 拒绝（类型/枚举错，`ToolArgsError`）；
- 我们返回 `ok=false`（语义错）。

### H–K. 数据层

损坏 JSON、字段类型错、坏公式包、并发创建、目录共存——全部不崩、不丢数据。

---

## 4. 本轮测试发现的真实缺陷（已修）

**工作区创建只认 `args.workspace`，不认 `args.name`。**

调用方按直觉写 `{"operation":"workspace","action2":"create","name":"alpha"}` 时，
代码读不到 `name`，落回 `default`，然后抛出「请给一个新工作区名（不能是 default）」——
错误信息完全误导，且**静默地什么都没创建**。

修复：`const requested = args.workspace ?? args.name`，并在 `MathArgs` 上补 `name` 类型。

> 这类缺陷只有对抗性测试能抓到：正常路径永远传对参数。

---

## 5. 已知边界（诚实说明）

| 项 | 状态 |
|---|---|
| 与其它插件**抢同一 UI 槽位 id** | 宿主决定谁生效，我们不控制；已用包名前缀降低概率 |
| 宿主改了 cordis 契约（如 inject 语义） | 只能靠 preflight 的契约检查提前发现 |
| 多个进程同时写同一工作区文件 | 无锁；靠原子写（临时文件 + rename）降低半写风险，不做跨进程互斥 |
| 恶意插件构造超大输入打爆内存 | 未做输入体积上限 |
