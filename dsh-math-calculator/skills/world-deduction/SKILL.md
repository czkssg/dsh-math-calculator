---
name: world-deduction
description: 世界观推演与设定对账引擎（dsh-math-calculator 插件）：从星球参数推出重力/气候/生命闸门，从编制倍数推兵力，从分项推账本闭合，从文本抽数字台账、查同一量多处不同值的口径冲突，用区间给推演范围、用方案对比做取舍，并把设定存成可按 id 取回的条目库。全部本地计算、不联网。当用户要推演一个架空世界的物理/社会/军事/经济设定，或要核对既有设定文档里的数字是否自洽时使用。
whenToUse: 用户提到世界观、架空设定、推演、星球参数、重力、气候、编制、兵力、人口、账本、分项合计、单位换算、量纲、区间、估算范围、方案对比、设定对账、口径冲突、数字对不上、设定库时
---

# 世界观推演与设定对账（world-deduction）

## 这是什么工具

`math_execute` 一个工具 64 个 operation。它的定位是**带约束检查的推演引擎**，不是计算器。

三条不可违反的性质：

| 性质 | 含义 |
|---|---|
| **可信度标签** | 结果带 `[精确]`/`[标度]`/`[量级]`/`[仅方向]`。引用时必须保留——它们是结论强度的声明，不是装饰 |
| **不猜** | 判据由调用方给（`sanity:{max,min,expect,note}`）。工具不会替你决定「这个数合不合理」 |
| **`result` 是数据通道** | 提示走 `notice`。不要把提示当结论读 |

## 能力速查（三类门面 + 专项）

**先记三个门面**：`calc`（数值/公式）、`derive`（推演/对账）、`manage`（帮助/工作区）。
`auto` 是兜底：表达式含 `=` → `solve`，给 `matrix` → `matrix`，否则 `evaluate`。
`{operation:"calc", op:"solve", expression:"x^2-4=0"}` 等价于 `{operation:"solve", ...}`。
旧 op 名全部继续可用；下面按用途分组。

**多组结果一次交（批量）**：用 `calls:[{operation,...},...]` 一次提交多条——
按序执行、逐条独立报错（一条失败不中断）、单次上限 50 条。
外层 `precision`/`displayPrecision` 会继承，条目显式值覆盖；`saveAs` 写在条目里。
`{calls:[{operation:"units",unitFrom:"担",unitTo:"kg"},{operation:"evaluate",expression:"1/3"}]}`
**不要逐条发工具调用**；批量结果在 `value.results[]`（含每条的 ok/operation/result/error）。

### calc：算数、线代、公式

| 想做什么 | op | 关键参数 |
|---|---|---|
| 算一条式子（可带单位） | `evaluate` | `expression`，批量用 `expressions[]` |
| 解方程 / 方程组 | `solve` | 等式写法，逗号分隔多式 |
| 求导 / 积分 / 化简 / 展开 / 求根 | `derivative` / `integral` / `simplify` / `expand` / `roots` | `expression`；积分给 `from`/`to` |
| 矩阵 / 特征值 / 线性方程组 | `matrix` / `eigen` / `system` | `matrix`（+ `vector`） |
| 统计 / 分布 / 回归 | `stats` / `dist` / `regression` | `data`；`distribution`+`params`+`x` |
| 微分方程 / 递推 | `ode` / `recurrence` | `initial` + `at:[...]` / `periods` |
| 单条公式 | `formula` | `formula` + `params`（单位可写 "300 K"）；反解用 `solveFor`+`targetValue` |
| 多条公式 / 链传导 / 结构图 | `formulas` | `query:"chain"（或 "neighbors" / "graph"）`，或 `formulas:[...]` 批量 |
| 公式参数表 | `formula-table` | 不传参看全表 |
| 单位换算 / 量纲体检 | `units` / `units_audit` | `unitFrom`/`unitTo`/`unitValue`；`claims` |
| 账本闭合 / 收支 / 口径冲突 / 区间 / 方案对比 | `ledger` / `balance` / `consistency` / `interval` / `compare` | 分项；冲突判据 ≥10% 或 ≥2 倍 |

### derive：推演与对账

| 想做什么 | op | 关键参数 |
|---|---|---|
| 行星骨架与气候 | `world` | 质量/半径/轨道/恒星；`brief:true` 只看骨架 |
| 推导栈（29 子命令） | `derivation` | `derivation:"pipeline"（或 "backSolve" / "heatmap" / "timeline" / "compare" / "diff" / "fantasy" / "impact"） 等`；缺参给**演示模式** |
| 可行性 / 快速判定 | `feasibility` / `quick_feasible` | 给约束与数值 |
| 编制树 / 世界状态 / 常数 | `hierarchy` / `world_state` / `constants` | 见对应 help 节 |
| 链条 / 阈值 / 缩放 / 锚定 | `chain` / `threshold` / `scaling` / `anchor` | `chain:{raw,stages}`；`thresholds:[{at,label}]`；`from/to` |
| 文本抽数字 / 时间线体检 | `extract_numbers` / `timeline_check` | `text`；`events:[{name,start,end}]` |
| 影响面分析 | `impact` | `traceTarget`（不给则列可查量） |
| 目标回溯（公式链/模型链） | `backtrace` | `{target:"这座窑一天烧多少煤", given:[...]}` → 链+缺参+可执行调用 |
| 历史纪元 / 冲突 / 分支 | `history` / `conflict` / `diverge` | `history` 可给 `simulate:{actors,edges,steps,seed}` 一站式 |

### topology：空间、编制、工程

| 想做什么 | op | 关键参数 |
|---|---|---|
| 通用图 / 路径 / 视线 / 可达 | `topology` | `action:"model"（或 "route" / "sightline" / "reachable"）` |
| 编制拓扑（军队/政府） | `topology` | `action:"org"` + `units:[{id,level,headcount,parent}]` |
| 地形 / 舱室 / 建筑 | `topology` | `action:"terrain"（或 "ship"）` + 节点/舱室/通道 |
| 结构容量与**工程校核** | `topology` | `action:"structure"（或 "ship"）` + `kind`：`building`（或 `vehicle` / `space-vessel` / `space-habitat` / `enclosure` / `greenhouse` / `closed-loop` / `megastructure` / `sponge` / `mechanism` / `fluid-power` / `gear-train`）（规则表驱动） |
| **液压/气动** | `topology` | `kind:"fluid-power"` + `{pressurePa,flowM3s,efficiency,boreMm,rodMm}` → 液压功率/输出功率/推力/回程力/缸速 |
| **热工** | `topology` | `kind:"thermal"` + `{hotK,coldK,areaM2,uValueWm2K,inputW,outputW}` → 卡诺上限/实际效率/距上限百分比/换热功率 |
| **电气** | `topology` | `kind:"electric"` + `{voltageV, currentA 或 powerW, lengthM, crossSectionMm2}` → 线阻/压降%/线损/电流密度 |
| **流体** | `topology` | `kind:"fluid"` + `{diameterM,flowM3s,lengthM,densityKgM3,viscosityPaS,roughnessM}` → 流速/雷诺数/流态/沿程损失/水头 |
| **多级传动链** | `topology` | `kind:"gear-train"` + `{powerW,rpm,stages:[{ratio,efficiency}]}` → 总传动比/总效率/末级转速与扭矩/逐级累计 |
| 实体类型 / 自创 / 校验 | `topology` | `action:"entities"（或 "define" / "validate"）` |
| 拓扑模型存取 | `topology` | `action:"save"（或 "load" / "list" / "export" / "import"）` |
| 后勤/信息时延（疆域上限） | `topology` | `action:"logistics"` + `{mode,distanceKm,maxRoundTripDays}` |
| **面状绕障（绕山/绕湖/禁飞区）** | `topology` | `action:"avoid"` + `fromPoint/toPoint:{lat,lon}` + `obstacles:[[[lon,lat],…]]`；`gridKm`/`safetyKm`/`planetRadiusKm` |
| **公式网（常数→公式→公式）** | `formulas` | `query:"web"`（统计）；`formulaFocus` 传常数名/公式 id，`webDepth`/`webDirection`/`webLimit` |
| **公式调用带上下游** | `formula` | 默认返回 `value.web`（上游/下游）+ notice；`webContext:false` 关闭 |
| **架空常数可改** | formulas | 物理常数是参数（c、G、h_planck、NA、Lsun、rayleigh_factor…），默认现实值，params 里直接覆盖 |
| **常数联动** | constants | 改基础旋钮会自动重算派生量（hbar/R/mu0/sigma/alpha_fs/g/Lsun…）；不带参调用看「→ 派生」；调和办法见 docs/常数关系网.md |
| **随机数/行为映射** | random | randomSeed + count/min/max/integer；或 randomActors + randomTraits（子流，顺序无关） || **货币符号库** | currency | list/get（中文名/符号/缩写；不做汇率与购买力） |
| **入口路由** | （自动） | 用 evaluate 算别的需求时，结果里会提示该换哪个 operation（solve/topology/balance…） |
| **先分诊** | （自动） | 直答/对账/推演/查证四条路；直答跳过全部 11 步，推演才走完整流程 |

### astro：天文与历法

| 想做什么 | op | 关键参数 |
|---|---|---|
| 真实地球历表 | `astro` | `action:"rise-set"（或 "sun" / "moon"）` + `date/lat/lon`；**日照时长用当日 5 分钟高度扫描**（极昼 24h/极夜 0h，正午高度取当日最大值）；**按当地日切窗口**，时区按经度推算（每 15°=1h）或显式 timezoneMinutes（UTC+8=480） |
| 任意天体轨道 / 双星 / 行星系统 | `astro` | `action:"orbit"（或 "binary" / "system"）` |
| 引力与相对论 | `astro` | `action:"gravity"（或 "relativity"）` + `massKg/radiusM` |
| 历法推导 / 换算 / from-world | `astro` | `action:"calendar"（或 "calendar-convert" / "world-calendar"）` |
| 观测精度 → 科技 | `astro` | `action:"tech"` + `{device,precision}` |

### manage：帮助与工作区

| 想做什么 | op | 关键参数 |
|---|---|---|
| 能力目录 / 某节全文 / 按任务搜 | `help` | 不带参=目录；`helpTopic:"矩阵"`；`helpQuery:"..."` |
| 工作区变量 / 切换世界 / 导出 | `workspace` | `action2:"set"（或 "list" / "export" / "import"）` |
| **自动入库** | 任意 op | 加 `saveAs:"记录名"` → 成功结果自动写进统一数据层（失败不入库） |
| **数据检索（全文）** | `data` | `dataAction:"search", query:"关键词"`（minisearch + 中文分词）；`dataAction:"migrate"` 把旧 workspace/归档导入统一库（幂等） |
| **全球地图（地形/地质/国家）** | `world-map` | ★`worldTopology:"sphere"`（球体，经度环绕——**跨 180° 经线不绕远路**）或 `"plane"`（天圆地方）；`mapDistance:{from,to}` 查两点实际距离（球体用大圆） | `{mapWidth,mapHeight,seed,seaLevel(陆地目标占比),mountainScale,riverCount,nationCount,mineralDensity,edits,ascii}` → 高度场/地形分类/河流/矿产/国家边界（Voronoi）+ **精细 ASCII 地图（ascii，默认 120×60，字符=高度带+河/矿/国界，自带比例尺与图例）与国界图（asciiBorders）**；`edits:[{x,y,height,seaLevel,nation,mineral}]` 可改地形/国界/矿产（mineral 1–3，0 清除）。★ **随机大陆，只作相对位置与距离校验，不作真实地球底图**；**多尺度**：首都/经济中心/国界密集段各附 1 字符=1 格的精细子图（value.focusMaps）；**格子粗细可自主编辑**：asciiWidth/asciiHeight + focusRegions:[{name,x,y,radius,detail}]；**真实地球历史节点** earthNode:"medieval/pre-ww1/pre-ww2/cold-war"（默认文本地图约 5KB，按真实国界光栅化；**多层** layers:[powers/water/terrain/elevation/all] 各自成图，海拔 10 带）；**预存真实地球**：earthEra:"1500/1800/1900/1945/2000"（简化轮廓，非精确测绘）；**地图模型** mapModel:"save/load/list" + modelName；**导出** export:"txt/md/json/**svg（矢量，推荐）**"；SVG 支持 viewBox 局部放大 |
| **简化环流（简单流体）** | `world-map` + `climate:true` | 热成风 `u∝−(1/f)·∂T/∂y` + 三圈环流（Hadley/Ferrel/Polar）+ 水汽平流；地球校核：0–30° 东风 −14 m/s、30–60° 西风 +9 m/s、60–90° 东风 −8 m/s。**定常解，不是 CFD** |
| **极宏观三机制** | `world-map` + `climate:true` | 季风（海陆热力差 → 降水 ±14%）、洋流（沿岸温度 ±1.5 K）、云（云量=f(降水) → 温度 ∓1–2 K）；粗到只剩几个常数，不是环流模型 |
| **通用气候拟合** | `world-map` + `climate:true` | 地球标定的解析模型：`T(φ)=T_eq−ΔT·(1−cos^p φ)`（p 由地球 7 点最小二乘定标，残差 0.2 K）；换行星参数（`stellarFlux`/`greenhouseK`/`pressureAtm`/`rotationHours`/`obliquityDeg`/`landRatio`）自动缩放 |
| **气候层** | `world-map` + `climate:true` | 温度（纬度+海拔递减）、降水（ITCZ/副高/极锋 + 距海 + 迎风坡−雨影）、分区（K 类）、可耕率；`world-build` 加 `useMap:true` 用气候可耕率反算承载力（10% → 46–53%，承载力 14.8 亿 → 68–78 亿） |
| **完整世界编排** | `world-build` | `{planetMass, planetRadius, orbitAU, starMass, initialPopulation, muPerPerson}` → 一次跑完：世界骨架→可耕土地→承载力→百年人口→粮食上限→疆域半径→舱室需求，并给出**瓶颈**（哪一步先撞上限） |
| **跨模块对账** | `crosscheck` | 5 项比对（逃逸/年长/排水量/耗氧/人口），两侧各算一遍看是否一致；`checkId` 只跑某项 |
| **系统动力学（存量/流量）** | `simulate` | `{stocks:{name:{initial}}, flows:{name:{to,rate}}（rate 可用存量名与 t）, dt, simSteps}` → 各存量时间序列/峰值/拐点判定（长期动态：人口-资源-污染） |
| **线性/整数规划（最优配比）** | `optimize` | `{objective, opType:"max"（或 "min"）, constraints:{资源:{max,min}}, lpVariables:{x:{资源:消耗, 目标:贡献}}, integers:[...]}` → 最优值/变量取值/无解或无界 |
| **统一数据层（记录/血缘）** | `data` | `dataAction:"put"（或 "get" / "query" / "lineage" / "stats" / "export" / "import" / "compact"）`；`dataVersion:N` 取历史版本；`compactThreshold` 压缩日志；记录 `{kind,name,tags,refs,payload}`，同名再写即新版本；血缘查「依赖谁/被谁用」 |
| 自定义量（带量纲新常数） | `custom` | 名称+单位+量纲 |
| 天体数据 / 依赖传导 | `bodies` / `dependency` | 行星恒星半径质量温度；`node` 查上下游 |
| 量纲声明体检 | `quantities` | 给定量的量纲声明 |
| 解析 PDF | `document` | `action:"extract"（或 "tables" / "numbers"）` + `path`（不做 OCR） |

**两处易错**：`workspace` 存的变量默认不参与计算（要 `useWorkspaceVariables:true`）；`constants` 改全局表（`preview:true` 只算不存）。

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

**建实体图谱时**（军队/行政/派系/技术树/商路）：先 `topology action:"entities"` 看类型与关系，再 `define` 自创缺的类型，最后 `validate` 校验——
这一步能抓出「师有两个上级」「技术依赖了不存在的前置」这类结构错。

**数据不自动建表**，但可以：

- `workspace action2:"export"` 把**结果**（自创常数/公式/变量/实体类型/拓扑模型）写进工作区的 `.artifacts/workspace-state.json`，之后 `import` 读回；
- `workspace action2:"export-builtin"` 把**内置数据**（公式/单位/常数/天体）导成只读快照；
- `topology action:"save"` 把建好的拓扑存进工作区，`export`/`import` 在工作区产物目录里交换文件。

推演里反复用到的字段/数字，导出一次、之后 import，不必每次重抄。

## 四条主干工作流

### ① 从零推演一个星球

```
world           星球参数 → 体感画像（重力/昼夜/气候/天空/生命闸门）
  ↓ brief:true 时只给 296 字符摘要（省 93%）
derivation      接着往下推：敏感度/结论翻转/逆推校准/相图
  ↓ 29 个子命令
formula         要具体数值时调公式（870 条，params/overrides 改参数；solveFor 可反解）
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
- **优先用国际符号，不要用中文别名**：`kn`（不用「节」）、`degC`（不用「摄氏」）、`kcal`、`GJ`、`kPa`。
  中文别名是兜底表、覆盖不全（生僻的「石」「吨标煤」经常缺），**符号才是可靠路径**
- 温度必须写 `degC`/`degF`——裸 `C` 是库仑；光速是常量 `c`，不是单位
- 复合单位（`kg/m³`、`W/m²`）必须用 `units`，不要心算
- `consistency` 查的是「同一量多处不同值」，**不查「多久没提到」**——后者是小说的检查，世界观读者按需查询，缺席不是问题

### ⑥ 精度是两层

- `precision`：计算精度（默认 64）。**不要为好看调低**，会让大数算错
- `displayPrecision`：小数点后几位（默认 8）。只想输出短些用这个

### ⑦ 数字要判据就用 sanity

`{label, expr, sanity:{max,min,expect,note}}`（只在批量 `expressions` 里生效）：
超限输出 `⚠ 超出锚点上限 … 达 N 倍`，`value.items[].sanityStatus` 为 passed/violated。
判据由你给，工具只比对不猜；不声明就零提示。

## 按需查详细说明

上面只给流程与判据。**具体字段、参数、子命令清单在工具内**：

```
{operation:"help"}                        能力目录（66 节带简介）
{operation:"help", helpTopic:"world"}     星球参数字段表（20+ 个带默认值）
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

## 已知边界

遇到时要如实告知，**不要承诺工具做不到的事**：

| 边界 | 现状 |
|---|---|
| **复合单位写法** | `kg/m^3` / `kg/m3` / `kg/m³`（上标）三种都 ✅（上标已归一；R53 后修） |
| **表达式规模** | 字符 ≤10000、运算符 ≤2000、括号深度 ≤200；超了明确报错——**项数/嵌套先于字符数撞栈**，别按「写到 10000 也行」来写 |
| **拓扑图规模** | 割点/桥用定义式判（几十到几百节点够用）；上千节点会慢，需换 Tarjan |
| **不联网** | 内置常数/单位是现实参考；算现实问题时**你可自行搜索**权威数据核对/替代默认值，注明来源——工具本身不发网络请求 |

> 层级/地形/舱室拓扑已接入 `topology` operation；编制树已支持等比与不等比（`hierarchy`）；
> 跨级混编/兵种比例仍简化。

## 给开发者的规则（不是给使用者的）

如果你要**给这个插件加功能**，开工前必须先查开源社区：

    npm registry + GitHub + 领域标准（UCUM / QUDT / GeoJSON）

因为本项目已经三次返工证明手写更容易错（graphology 早就有连通分量、@turf/turf 早就有绕障寻路）。

完整流程见 AGENTS.md 与 docs/开工前先查开源.md。

## 一句话

**排错先看本地运行日志**：每次调用的结果与报错都自动写到 `<DSH_MATH_CALC_HOME>/logs/run.log.jsonl`（JSONL，每条含 operation/ok/errorType/耗时）。遇到反复报错，先读日志最后几行，比让用户复述快。

**这个工具的价值不在算得快，在算完之后能告诉你「这个数站不站得住」。**
凡是会被写进设定、或被用来做取舍的数，都过一次检查；纯算术不用。
