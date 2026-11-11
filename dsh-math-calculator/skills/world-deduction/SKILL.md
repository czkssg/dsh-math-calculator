---
name: world-deduction
description: 世界观推演与设定对账引擎（dsh-math-calculator 插件）：从星球参数推出重力/气候/生命闸门，从编制倍数推兵力，从分项推账本闭合，从文本抽数字台账、查同一量多处不同值的口径冲突，用区间给推演范围、用方案对比做取舍，并把设定存成可按 id 取回的条目库。全部本地计算、不联网。当用户要推演一个架空世界的物理/社会/军事/经济设定，或要核对既有设定文档里的数字是否自洽时使用。
whenToUse: 用户提到世界观、架空设定、推演、星球参数、重力、气候、编制、兵力、人口、账本、分项合计、单位换算、量纲、区间、估算范围、方案对比、设定对账、口径冲突、数字对不上、设定库时
---

# 世界观推演与设定对账（world-deduction）

## 这是什么工具

`math_execute` 一个工具 40 个 operation。它的定位是**带约束检查的推演引擎**，不是计算器。

三条不可违反的性质：

| 性质 | 含义 |
|---|---|
| **可信度标签** | 结果带 `[精确]`/`[标度]`/`[量级]`/`[仅方向]`。引用时必须保留——它们是结论强度的声明，不是装饰 |
| **不猜** | 判据由调用方给（`sanity:{max,min,expect,note}`）。工具不会替你决定「这个数合不合理」 |
| **`result` 是数据通道** | 提示走 `notice`。不要把提示当结论读 |

## 基础能力速查（推演之外的日常操作）

推演会用到的底子都在这里。**大多数时候一句话就够，不必查 help**。

| 你想做的事 | operation | 关键参数 |
|---|---|---|
| 算一条式子（可带单位） | `evaluate` | `expression` 或 `expressions[]` 批量 |
| 解方程 / 方程组 | `solve` | `expression` 写等式，逗号分隔多式 |
| 求导 | `derivative` | `expression` + `variable`（默认 x） |
| 积分（含定积分） | `integral` | `expression` + `from`/`to` |
| 化简 / 展开 | `simplify` / `expand` | `expression` |
| 求根 / 零点 | `roots` | `expression` |
| 线性方程组 | `system` | `matrix` + `vector` |
| 矩阵运算 | `matrix` | `matrix`（乘法/求逆/行列式） |
| 特征值 | `eigen` | `matrix` |
| 统计量 | `stats` | `data`（均值/方差/分位…） |
| 概率分布 | `dist` | `distribution` + `params` + `x` |
| 回归拟合 | `regression` | `data` + `dataY` + `degree` |
| 单条公式 | `formula` | `formula` + `overrides` |
| 多条公式一次算 | `formulas` | `formulas:[{formula,overrides,label}]` |
| 查公式参数表 | `formula-table` | 不传参就看全表 |
| 依赖传导 / 编制结构 | `dependency` | 给 `node` 查上下游；`levels`+`tree` 可简写编制 |
| 微分方程 / 离散递推 | `ode` / `recurrence` | `initial` + `periods`；年表用 `at:[5,10,20]` |
| 改物理常数看后果 | `constants` | 传新值；`preview:true` 只算不存 |
| 工作区（存变量/切世界） | `workspace` | `action2:"set"`、`workspaceVariables` |
| 影响面分析 | `impact` | 改一个量，看哪些派生量变 |
| 量纲与量级体检 | `quantities` | 给定量的量纲声明 |
| 自定义新量（以太压等） | `custom` | 带量纲的新常数 |
| 天体数据 | `bodies` | 行星/恒星的半径质量温度 |
| 单位换算 | `units` | `unitFrom`/`unitTo`/`unitValue` |

**注意两处易错**：

- `workspace` 存了变量后**默认不参与计算**（为保「同输入同输出」）。要生效必须 `action2:"set", useWorkspaceVariables:true`。报 `Undefined symbol` 时先查这个开关。
- `constants` 改的是**全局**常数表。只想看后果不想污染当前世界时，传 `preview:true`。

## 什么时候该调它

**该调**（推演或对账有实际需要）：

- 从设定推数值：星球参数 → 重力/逃逸速度/山高上限/潮汐/生命可行性
- 数字要进文档：任何会被写进设定的数，都该经过一次检查
- 多处数字要一致：已经写过几处人口/面积/兵力，要查它们是否相悖
- 取舍要依据：几个方案各有优劣，需要表格与量化对比
- 不确定的量：只能给范围（「大概 2—5 万」），需要区间运算而不是点值

**不必调**（心算即可，调了反而费事）：

- 单步四则运算（`2+2`、`(3+4)*5`）
- 单位换算只要一个数且没有歧义（但 `kg/m³` 这类复合单位要调，心算易错）
- 纯文字整理、无数字参与

**判据**：结果会不会被写进设定、或被用来做判断？会 → 调。

## 四条主干工作流

### ① 从零推演一个星球

```
world           星球参数 → 体感画像（重力/昼夜/气候/天空/生命闸门）
  ↓ brief:true 时只给 296 字符摘要（省 93%）
derivation      接着往下推：敏感度/结论翻转/逆推校准/相图
  ↓ 29 个子命令
formula         要具体数值时调公式（665 条，overrides 改参数）
  ↓ query:"sys" 可看 22 条推演链怎么连
```

**关键**：`world` 只给「这个世界长什么样」，不给「所以会怎样」。后者要接 `derivation` 与 `formula`。

### ② 检查一份既有设定文档（对账）

```
extract_numbers 正文 → 结构化数字台账（中文量级折算、区间、上下文）
  ↓
ledger          分项之和 vs 总量：占比合计 99.01% 差在哪
  ↓
consistency     同一量在多处写了不同值？差多少倍、各在哪一段
  ↓
units / measure 单位与量纲是否可比
```

**这一条链是对账的主干**，按顺序走，每步的产物喂给下一步。

### ③ 算一张表而不是一个数

```
hierarchy       编制树：每级辖属数 × 底层基数 → 逐级人数；给总兵力可反解
interval        区间：上下界进、上下界出，不把范围压成点值
compare         方案对比：表格 + 每列最强者（不给权重就不给综合分）
balance         收支盘点：给最短板，不给「总体平衡」这种无信息结论
```

**判据**：如果答案是「一张表」而不是「一个数」，用这四个之一，不要拆成多次 `evaluate`。

### ④ 保住设定不丢（长对话必用）

```
world_state set   建条目（可很长，不压缩）
world_state get   按 id 取全文（不占对话上下文）
world_state list  只给标题
world_state check 悬空引用 / 引用已废弃 / 同主题多版本
```

**为什么需要它**：网页版撞上下文上限时只能做有损压缩（压掉细节、口径、推导链）。`world_state` 把设定存进文件，按 id 查——**不压缩**。

改设定时**不要覆盖**：旧条目 `status:"deprecated"`，新条目 `supersedes:["旧id"]`。这样后人才知道前面推过什么、为什么改。

## 最容易误用的六处

### ① 别把 `[量级]` 当精确值

`[量级]` 意思是「数量级对，具体数字别引用」。写进设定时要说「约 X」，不要说「X」。

### ② 别在 `world` 里期待它给你结论

`world` 给上游参数，`derivation`/`formula` 才是下游。以为 `world` 能回答「这个文明能不能造出蒸汽机」是误用——那要接 `feasibility` 或 `quick_feasible`。

### ③ `quick_feasible` 判不了会说判不了

它只做词面匹配（尺寸/能量/人口/材料/时间）。认不出就说「判不了」并列出能判什么。**看到「判不了」不要追问它给个大概**——那是设计，不是失败。

### ④ 账本要闭合不是「差不多」

`ledger` 默认容差 0.001（相对）。99.011% 会被报出来，因为**剩下的 0.989% 意味着有分项记错或漏记**。不要看到接近 100% 就放过。

### ⑤ 单位和量纲

- 物理量**带单位写**：`(10 hp/0.475) to kW`、`5 cm to inch`
- 复合单位（`kg/m³`、`W/m²`）必须用 `units`，不要心算
- `consistency` 查的是「同一量多处不同值」，**不查「多久没提到」**——后者是小说的检查，世界观读者按需查询，缺席不是问题

### ⑥ 精度是两层

- `precision`：计算精度（默认 64）。**不要为好看调低**，会让大数算错
- `displayPrecision`：小数点后几位（默认 8）。只想输出短些用这个

## 按需查详细说明

上面只给流程与判据。**具体字段、参数、子命令清单在工具内**：

```
{operation:"help"}                        能力目录（48 节带简介）
{operation:"help", helpTopic:"world"}     星球参数 25 个字段带默认值
{operation:"help", helpTopic:"evaluate"}  函数清单与语法
{operation:"help", helpQuery:"账本对不上"} 按任务描述搜（不用记 key）
```

**先 `helpQuery` 再 `helpTopic`**：前者按自然语言找节，后者取全文。不确定某功能怎么用时先搜，比翻目录快。

## 常见任务速查

| 用户说 | 该做什么 |
|---|---|
| 「推演一个 1.4 倍重力的星球」 | `world{planetMass:1.4}` → 再 `derivation` 接下游 |
| 「这个城能养 920 亿人吗」 | `quick_feasible{claim:"…"}` → 它会说人口无硬上限，指向 `balance` |
| 「这份设定里人口有三处，对不对得上」 | `consistency{sections:[…]}` |
| 「分项加起来只有 99%」 | `ledger{ledger:{parts:[…], total:100}}` |
| 「师团营连班各多少人」 | `hierarchy{levels:[…], tree:[…], base:10}` |
| 「大概 2—5 万吨」 | `interval{interval:{expr:"2-5 万吨"}}`（不要压成 3.5 万） |
| 「三个方案选哪个」 | `compare{compare:{rows,cols,data}}` |
| 「别把前面推的忘了」 | `world_state set` 建条目，之后 `get` 按需取 |

## 一句话

**这个工具的价值不在算得快，在算完之后能告诉你「这个数站不站得住」。**
凡是会被写进设定、或被用来做取舍的数，都过一次检查；纯算术不用。
