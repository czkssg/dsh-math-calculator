---
name: world-deduction
description: 世界观推演与设定对账引擎（dsh-math-calculator 插件）：从星球参数推出重力/气候/生命闸门，从编制倍数推兵力，从分项推账本闭合，从文本抽数字台账、查同一量多处不同值的口径冲突，用区间给推演范围、用方案对比做取舍，并把设定存成可按 id 取回的条目库。全部本地计算、不联网。当用户要推演一个架空世界的物理/社会/军事/经济设定，或要核对既有设定文档里的数字是否自洽时使用。
whenToUse: 用户提到世界观、架空设定、推演、星球参数、重力、气候、编制、兵力、人口、账本、分项合计、单位换算、量纲、区间、估算范围、方案对比、设定对账、口径冲突、数字对不上、设定库时
---

# 世界观推演与设定对账（world-deduction）

## 这是什么工具

`math_execute` 一个工具 50 个 operation。它的定位是**带约束检查的推演引擎**，不是计算器。

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
| 单条公式 | `formula` | `formula` + `params`（或 `overrides`） |
| **反解公式参数** | `formula` | 加 `solveFor:"m"` + `targetValue:100`；其余参数放 `params`，解不出时给 `solveRange:{min,max}` |
| **相邻公式** | `formulas` | `query:"neighbors", formulaFocus:"ideal_gas"`——按共用物理量/常数连边 |
| **公式带单位参数** | `formula` | `params:{T:"300 K", P:"1 atm"}`——自动换算到 SI，量纲不符报 **unit_mismatch** |
| **链数值传导** | `formulas` | `query:"chain", formulaFocus:"sys-material", initial:{…}`——按显式数据流逐步算 |
| 公式-链结构图 | `formulas` | `query:"graph"`（`formulaFocus:"sys-material"` 看某条链） |
| 多条公式一次算 | `formulas` | `formulas:[{formula,overrides,label}]` |
| 查公式参数表 | `formula-table` | 不传参就看全表 |
| 依赖传导 / 编制结构 | `dependency` | 给 `node` 查上下游；`levels`+`tree` 可简写编制 |
| **层级拓扑（军队/政府）** | `topology` | `action:"org"` + `units:[{id,level,headcount,parent}]`——查缺编/多上级/指挥链深度 |
| **地形拓扑（地图）** | `topology` | `action:"terrain"` + `nodes`/`edges`（`kind:"road|river|pass|sea"`）——连通区域/咽喉/桥/最短路 |
| **舱室拓扑（建筑/舰船）** | `topology` | `action:"ship"` + `compartments`/`passages`/`entry`——可达/割点/桥/容量瓶颈 |
| 通用图 | `topology` | `action:"model|route|sightline|reachable"`；`structure`/`rules` 是建筑与体检入口 |
| **实体类型清单** | `topology` | `action:"entities"`——20 种内置实体（军队/行政/聚落/地形/建筑/舰船/舱室/资源/战线/派系/官职/法令/技术/信仰/事件/头衔/人物/器物/商路）+ 14 种关系 |
| **自创实体类型** | `topology` | `action:"define", entityType:{name,label,category,required,relations?}`——存工作区，之后可用 |
| **实体图校验** | `topology` | `action:"validate", entities:[{id,type,...}], relations:[{from,to,kind}]`——查未知类型/缺字段/非法关系/基数 |
| **拓扑模型保存** | `topology` | `action:"save", modelKey:"北境军", nodes, edges`；`list`/`load`/`export`/`import` 都在工作区 |
| **天文历表（真实地球）** | `astro` | `action:"rise-set"`（日出日落/日照时长）、`"sun"`（高度角/方位）、`"moon"`（月相/光照比例）——`date` + `lat` + `lon` |
| **通用轨道（架空天体/双星）** | `astro` | `action:"orbit"`（给轨道根数 a/e/i/omega/w/M0 + centralMass → 周期/位置/速度）、`"binary"`（双星互绕：周期/质心距）——开普勒模型，任意质量 |
| **world → 历法（耦合）** | `astro` | `action:"world-calendar"` + `{orbitAU, starMass, rotationHours, obliquityDeg, moonCount}`——用开普勒从轨道推一年，再推历法（一键从行星参数到历法） |
| **目标回溯（公式链 + 模型链）** | `backtrace` | `{target, given, maxDepth}` → 先匹配**模型链**（world→人口→财政、军队→后勤、行星→历法…共 8 条，数据在 `src/data/model-chains.json`），未命中回落**公式链**；输出链、缺参、可执行调用序列 |
| **历法换算（日期↔年日）** | `astro` | `action:"calendar-convert"` + `{year, dayOfYear}` 或 `{absoluteDay}` → 第几年第几天、闰年、太阳黄经、季节 |
| **后勤/信息时延（疆域上限）** | `topology` | `action:"logistics"` + `{mode:"horse|beacon|ship|rail|telegraph|pigeon", distanceKm, stationKm, stationDelayHours, maxRoundTripDays}` → 单程/往返天数、中转站数、**半径上限** |
| **天文观测 → 科技** | `astro` | `action:"tech"` + `{device:"telescope|sextant|clock|pendulum|shadow|calendar-drift", precision}`——口径→角分辨率、角分→定位误差、日误差→经度误差、秒摆长度、圭表→回归年分辨率、历法漂移→几年差 1 天 |
| **历法推导** | `astro` | `action:"calendar"` + `{rotationHours, orbitDays, obliquityDeg, moonCount, moonPeriodDays}`——一年多少天/闰年规则/太阴月/阴阳历/季节/分至点 |
| **引力与相对论（黑洞/中子星）** | `astro` | `action:"gravity"`（逃逸/圆轨道速度、潮汐、N 体加速度、引力区间）、`"relativity"`（史瓦西半径/光子球/ISCO/时间膨胀/红移）——`massKg` + `radiusM` |
| **海绵状庇护所（小空腔）** | `topology` | `structure` + `kind:"sponge"`（`{targetPeople, cavityVolumeM3, volumePerPersonM3, maxSpanM, excavationRatio, mediumDensityKgM3}`）→ 空腔数/边长/跨度校验/支护面积/排土量——**双限制**：太大跨度失效、太小 S/V 暴增 |
| **千万级聚居（舱室网络）** | `topology` | `structure` + `kind:"megastructure"`（`{targetPeople, compartmentAreaM2, compartmentVolumeM3, areaPerPerson, selfSufficient, cropAreaPerPersonM2}`）→ 居住舱/温室舱数、总容积、总泄漏、氧/食/水需求——支持 1 人到亿级 |
| **封闭系统闭环/上限** | `topology` | `structure` + `kind:"closed-loop"`（`{people, cropAreaM2, algaeM3, waterRecycle, bufferO2Kg, volumeM3}`）→ 自持上限人数（木桶短板）、氧/食物缺口、**故障小时数**（CO₂ 失效/氧耗尽）；`kind:"enclosure"`/`"greenhouse"` 算日需求 |
| **建筑/舰船/太空工程校核** | `topology` | `structure`（kind=building/space-habitat）与 `ship`（kind=ship/space-vessel）自动附【工程校核】；规则表在 `src/data/topology-assessments.json`，新增类型只改数据+注册 calculator |
| **行星系统（多行星+卫星）** | `astro` | `action:"system"` + `{starMass, planets:[{name,a,e,massEarth,radiusEarth,moons:[{name,a}]}]}`——逐行星周期/希尔球/卫星可行域（洛希内限、希尔/3 外限）+ 稳定性警告 |
| **解析 PDF** | `document` | `action:"extract"`（文本）/ `"tables"`（表格）/ `"numbers"`（数字台账）——`path:"某.pdf"`；清洗 DeepSeek 打印版页眉页脚；**不做 OCR** |
| **导出结果（推荐）** | `workspace` | `action2:"export"`——把自创常数/公式/变量/实体类型/拓扑模型写进 `<工作区>.artifacts/workspace-state.json`；`action2:"import"` 读回 |
| 内置数据快照 | `workspace` | `action2:"export-builtin", what:"formulas|...|all"`——静态数据，随插件版本走 |
| 微分方程 / 离散递推 | `ode` / `recurrence` | `initial` + `periods`；年表用 `at:[5,10,20]` |
| 改物理常数看后果 | `constants` | 传新值；`preview:true` 只算不存 |
| 工作区（存变量/切世界） | `workspace` | `action2:"set"`、`workspaceVariables` |
| 影响面分析 | `impact` | 改一个量，看哪些派生量变 |
| 量纲与量级体检 | `quantities` | 给定量的量纲声明 |
| 自定义新量（以太压等） | `custom` | 带量纲的新常数 |
| 天体数据 | `bodies` | 行星/恒星的半径质量温度 |
| 单位换算 | `units` | `unitFrom`/`unitTo`/`unitValue` |
| 链条传导（分段计价/成本递增） | `chain` | `chain:{raw, stages:[{name,expr}]}`；`prev` 指上一段的值 |
| 阈值判定（落在哪一段） | `threshold` | `threshold:{value, thresholds:[{at,label}]}`；`at` 是**上界** |
| 缩放律（平方立方律） | `scaling` | `scaling:{from:{size}, to:{size}}`；强度默认不随尺度变 |
| 基准锚定（历史/现实换算） | `anchor` | `anchor:{anchor, anchors:[{name,value}]}` |
| 量纲体检（同一量多处不同单位） | `units_audit` | `claims:[{name,unit}]` 或给 `text` |
| 时间线体检（逆序/重叠/跨度） | `timeline_check` | `events:[{name,start,end}]`；`maxSpan`/`overlapAllowed` |

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
formula         要具体数值时调公式（803 条，params/overrides 改参数；solveFor 可反解）
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
{operation:"help"}                        能力目录（49 节带简介）
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

## 已知边界

遇到时要如实告知，**不要承诺工具做不到的事**：

| 边界 | 现状 |
|---|---|
| **复合单位写法不全** | `kg/m^3` ✅ `kg/m3` ✅ 但 `kg/m³`（上标）❌（实测） |
| **拓扑图规模** | 割点/桥用定义式判（几十到几百节点够用）；上千节点会慢，需换 Tarjan |

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
