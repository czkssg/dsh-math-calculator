# CHANGELOG 历史明细（3.2.0 ~ 3.56.0）

> **为什么有这个文件**
>
> 2026-11-26 按作者要求重编版本号：npm 实际只发布到 **3.1.0**，之后 70 条改动
> 全部按 minor 递增（3.2.0 → 3.56.0），编号早已与实际改动量脱节。
>
> 现归并为 **3.2.0** 一条，完整明细移入本文件备查。
> 主线 CHANGELOG 只保留归并后的版本。

---

## [3.56.0] — 2026-11-26

**补上提交前守卫（依据 /retro 的自动化检查建议）。**

### 问题：有检查脚本，却没有任何 guardrail

仓库早就有 `typecheck` / `doccheck` / `preflight` / `test:report`，
但**没有一个在提交时自动跑**——全靠人记得。本轮会话可举证的后果：

- 4 次 `git add` 漏文件（`engine.ts` 被遗忘）；
- 3 次 `doccheck` 失败（插代码挤掉 JSDoc，事后才补）；
- 版本号三处不同步的风险。

这些全是**机械性错误**，钩子能在写坏当场拦住，不必跑完 10 分钟全量才发现。

### 新增

- `.git-hooks/pre-commit`：提交前跑三项秒级检查（typecheck / doccheck / preflight），
  **不含全量测试**——10 分钟的检查会让人习惯性 `--no-verify`，等于没有钩子；
- `doccheck` 新增**块注释提前闭合检测**：AGENTS.md 的「已知的坑」第一条一直只写在文档里，
  没有确定性检查。现在有了。

### 踩到的坑（记录）

1. **`core.hooksPath` 相对 git 根解析**：仓库根是 `D:/0cengxu/5`，
   而钩子在 `dsh-math-calculator/.git-hooks`——写成相对路径会让 git 找不到，
   **钩子静默不执行**（实测提交直接通过才发现）。必须用绝对路径；
2. **写这个检查时自己踩了三次同一个坑**：在注释里描述「星号紧跟斜杠」这几个字符，
   直接把文件写坏。最后改成纯文字描述才通过；
3. `git reset --hard` 会连带丢掉未提交的检查代码——本次重写了一次。

## [3.55.0] — 2026-11-26

**参数读取模块接线完成：5 个函数全部有真实调用方。**

### 背景

3.53.0 引入 `src/core/args.ts` 时只接入了 `num`/`str`，`bool`/`rec`/`strList` 三个**一直没有调用方**（code-review 判为 Speculative Generality）。本次补完：

| 函数 | 替代的重复写法 | 接入处数 |
|---|---|---|
| `rec` | `asRecord(args['x'])`（与 `rec` 完全同构的第二份实现） | **29** |
| `bool` | `args['x'] === true` / `!== false` | **21** |
| `strList` | `Array.isArray(args['x']) ? (args['x'] as unknown[]).map(String)` | **5** |

`asRecord(args[..])` 从 30 处降到 1 处（只剩函数自身定义）。

### 语义差异（唯一一处，是改进）

`strList` 跳过数组里的 `null`/`undefined`，旧写法会产出字符串 `"null"`——那作为标签毫无意义。已写进 `r99` 锁住。

### 测试

- `r99-args-module` 从 33 项扩到 **41 项**：新增「五个函数都有真实调用方」与「`asRecord` 已收敛」的接线断言；
- 全量 **159 套 / 3,542 项全绿**。

## [3.54.0] — 2026-11-26

**用真实架空世界观材料（1106 万字）做压力检验，修掉 3 类单位缺陷。**

### 发现方式

用 `D:/0cengxu/架空世界观/工具压力测试/md/` 里的真实设定（战锤、生物质空间站、蒸汽朋克）验算其中的数值声明，而不是造测试用例。

### 修复 1：复合单位显示成冷门代号

| 输入 | 修复前 | 修复后 |
|---|---|---|
| `1 J/g` | `1e+5 raddose`（吸收剂量内部代号） | `1000 m^2/s^2` |
| `1 N*m` | `1e-44 foe`（超新星能量单位） | `1 (kg m^2)/s^2` |

mathjs 对复合单位结果会挑**同量纲里最冷门的一个**显示。数值都对，但读者看不懂，写设定时极易误判成「工具算错了」。

### 修复 2：裸写 `m/s` 被内部合成名劫持 ⚠ 最严重

| 输入 | 修复前 | 修复后 |
|---|---|---|
| `5 m/s` | `288.018` | `5 m/s` |
| `10 m / 2 s` | `288.018` | `5 m/s` |

根因链条：数据表里有 `日行里快`（factor 0.01736，速度维度）→ 注册成 `czxxl` → mathjs 在解析「数值+单位」时把 `m/s` 匹配成了 `czxxl` → `5 ÷ 0.01736 = 288`。

**这个 bug 影响所有裸写复合单位的式子**，而它是「数值 + 单位」最常见的写法。

### 修复 3：除法链缺提示

`30 MJ/kg / 16 MJ/kg` 按左结合算成 `1.875 kg^-2`（不是 `1.875`）。这**符合数学约定**（`6/2/3=1`），不能替用户改语义，所以只给提示：

> 除号链按从左到右计算…若你想要同量纲相除，请把两边各自括起来，例如 `(30 MJ/kg) / (16 MJ/kg)`。

### 测试

- 新增 `r100-realworld-fixtures` **21 项**：全部用真实设定里的数值当 fixture（MHD 功率 `6.25e11 W`、驱逐舰 `800×90×70`、激光枪齐射 `2.5 MJ`、卡诺效率 `31%`、自转重力 `0.598 rpm`…），断言写**算术自洽性**而非「原文对不对」；
- 全量 **159 套 / 3,542 项全绿**。

### 走过的三条弯路（记下来避免重犯）

1. **「一律归约到 SI」** → `10 hp to kW` 变 `(kg m^2)/s^3`、`5 cm to inch` 变 `0.05 m`，把用户明确要的单位冲掉了，**比原 bug 更糟**；
2. **「不在常见单位集里就归约」** → `1 kg to 担` 里的「担」被判冷门，被 `unit-pipeline` 抓出；
3. **「表达式层转译复合单位」** → 正则误伤 `e_charge`（`e_` 被切），`formulas-align` 一片红。

最终方案：**显示层只归位「`cz` 开头的内部合成名」**（`/^cz[a-z]{3}$/`），其余一律原样。用户注册的单位（`zli`）也不碰——被 `r82-namespace-units` 抓过。

> 另：一度给 `engine.ts` 加了 135 行转译机制（`COMPOUND_TRANSLATIONS` / `STANDARD_UNIT_NAMES` / `translateCompoundUnits`）。
> 干净对照实测它**完全不影响行为**（去掉后 `5 m/s` 一样正确），属于「为假想需求造抽象」，已整段删除。

## [3.53.1] — 2026-11-26

**修复：复合单位被显示成冷门单位**（`1 J/g` → `1e+5 raddose`）。

### 问题

mathjs 对复合单位的结果会挑**同量纲里最冷门的一个**显示：

- `1 J/g` / `1 J/kg` → `1e+5 raddose` / `100 raddose`（吸收剂量内部代号）
- `1 N*m` → `1e-44 foe`（超新星能量单位）

数值都对，但读者看不懂，而且看起来像把量纲搞错了。这个问题在写架空世界观时最容易被误判成「工具算错了」。

### 修复

- 新增判据 `isObscureUnitText()`：**只认已知会误导的内部代号**（`foe` / `raddose` / `rad_dose` / `radabsorbed`）；
- 命中时才归约到 SI 基准（`1000 m^2 / s^2`），其余一律原样；
- 同步修 `result` 与 `value` 两条显示路径（`features/numeric/evaluate.ts` + `core/format.ts`）。

### 走过的两条弯路（记录下来避免重犯）

1. **一开始想「一律归约到 SI」**——实测把 `10 hp to kW` 变成 `(kg m^2)/s^3`、`5 cm to inch` 变成 `0.05 m`，把用户明确要的单位冲掉了，**比原问题更糟**；
2. **改成「不在常见单位集里就归约」**——`1 kg → 0.02 担` 里的「担」被判冷门，强行改成 `1 kg`，被 `unit-pipeline` 抓出。中文单位/时代单位/自设单位都不能当冷门。

最终判据必须是**白名单式的已知代号**，不能用「不在常见集」这种否定式。

### 测试

- 全量 **158 套 / 3,521 项全绿**（`unit-pipeline` 19 项、`units-*` 各套均未受影响）。

## [3.53.0] — 2026-11-25

**架构深化：参数读取模块**（improve-codebase-architecture 的 Top recommendation）。

### 问题（实测）

`dispatch.ts` 1436 行、最近 40 次提交改 16 次，其中 `typeof args[...]` 重复 **151 处**；第 428 行一行内联 14 个参数、2588 字符。这是典型的**浅接口**——每个调用点都要懂「怎么判类型、怎么断言、缺省写什么」。

### 新增 `src/core/args.ts`（深模块）

接口 5 个方法，每个一行：`num` / `str` / `bool` / `rec` / `strList`。

藏在实现里的知识：

- `num` 拒绝 NaN/Infinity（旧的判法会漏过去，污染下游并让 JSON 变 null）；
- `str` 统一 trim 并把空串归一成 undefined（消除空串与 undefined 两种空）；
- `bool` 只认真 boolean（不把字符串 true 当真）；
- `rec` 拒绝数组与 null。

### 替换

- `dispatch.ts` 151 处 → 81 处（替换 70 处等价写法）；剩余是「中间夹函数调用」的复杂变体，手改风险高于收益，保留。

### 替换中发现并修掉的 2 个真实 bug

1. **`data get` 运算符优先级**：`??` 与三目混用被解析成 `(x ?? a) ? b : c`，导致 id 变成 `note:undefined`；已加括号；
2. **`data search` keyword 逻辑**：query 与 nameContains 的合并写法冗余且优先级可疑，已简化。

> 这两条由 `data-store`（23 项）与 `data-store-advanced`（12 项）抓出——正是「接口即测试面」的价值。

### 测试

- 新增 `r99-args-module` **33 项**（含与旧写法的逐例等价性对照）；
- 全量 **158 套 / 3,521 项全绿**。
## [3.52.0] — 2026-11-25

**任务分诊：先认路，再走路**（ask-matt 的 flow 范式落到数学插件）。

### 问题

插件原本只有**一条 11 步推演长流程**（WORKFLOW）。但真实使用里大多数问题是「一个数」「这条账对不对」——让它们走 11 步是浪费，模型还会硬套流程。

### 新增 `src/triage.ts`

先判断处在哪条路上，再给那条路；**拿不准就不套流程**：

| 路线 | 何时走 | 入口 | 跳过 |
|---|---|---|---|
| **direct** 直答 | 单点求值/换算 | evaluate / units / formula | 全部 11 步 |
| **reconcile** 对账 | 已有数据问「对不对/差多少」 | balance / consistency / ledger | 9 步 |
| **deduce** 推演 | 问「这个世界会怎样」 | derivation / world / feasibility | 不跳 |
| **lookup** 查证 | 问「现实/历史里是什么」 | world-map（earthNode）/ constants / help | 8 步 |

- 优先级：对账 > 查证 > 推演 > 直答（越具体越先赢）；
- `renderTriage()` 输出一行可执行提示；brief 档已接入「先分诊，再动手」三行。

### 3.51.0 补记

- 意图路由从 12 条平铺 `if` 改为 **5 层决策树**（第一个命中就赢）；
- 优先级：方程组 > 单方程、特征值 > 矩阵、回归 > 描述统计、地图 > 拓扑；
- 拿不准静默；`r97` 扩到 29 项。

### 测试

- 新增 `r98-triage` 13 项（四路线、对账优先、跳过步数、静默、渲染）。
## [3.50.0] — 2026-11-25

**意图路由：用错入口时给可执行建议**（照 ask-matt 的决策树范式重做）。

### 修复

- `suggestOperation` 此前只覆盖 5 条规则**且从未被调用**（死代码）；
- 重写为 **12 类意图识别**：方程/方程组/微积分/线代/统计/对账/可造性/世界推演/单位/天文/拓扑/地图/公式库；
- **接入两条路径**：成功结果的 `notice`、失败结果的 `error.hint` + `result` 文本；
- 报错类型改判：`x^2-4=0` 这类「= 被当赋值」从 `internal` 改为 `invalid_argument`（输入问题，不是工具 bug）。

### 噪音控制

- 只在通用入口（evaluate/calc/auto）触发；
- 纯算式（`1+1`、`sqrt(16)`、`(80/25-101/41.5)/(80/25)*100`、`10 hp to kW`）**不打扰**；
- 非通用入口（solve/eigen…）不越权提示。

### 测试

- 新增 `r97-intent-routing` **29 项**（12 类命中 + 类型改判 + 6 条噪音 + 不越权 + 4 条决策树优先级 + 4 条静默）。

### 范式（借自 ask-matt）

- **树而非清单**：初版 12 条平铺 `if` 会互相抢（谁先写谁赢）；现在 5 层有序判断题，第一个 yes 就赢；
- **优先级明确**：方程组 > 单方程、特征值 > 矩阵、回归 > 描述统计、地图 > 拓扑；
- **宁缺勿滥**：拿不准（「嗯」「这个」「看看」）一律静默，不强行归类——对应 ask-matt 的「不强行套用 standalone」；
  全量 **156 套 / 3,475 项全绿**（`test-v3/test-report.json` 已刷新）。

## [3.50.0] — 2026-11-25

（3.50.0 为路由初版：12 类平铺规则；3.51.0 起改为决策树。）

## [3.49.0] — 2026-11-25

**预存拓扑模板 + 1914 欧洲地图精修**（按用户提供的历史地图核对）。

### 新增：内置拓扑模板

- `topology` 加 `action:"templates"`（列表）与 `load` 回退内置模板（**免 save 直接用**）：
  `town-roadnet`（镇内路网）/ `capital-fortress`（都城防御）/ `mine-supply`（矿区运输链）/ `border-outposts`（边境哨所）；
- 新数据 `src/data/topology-templates.json`（4 模板，均为 7–9 节点、8–12 边，可算最短路/割点/可达）。

### 修复：`pre-ww1` 史实错误（对照 1914 欧洲地图）

| 问题 | 修正 |
|---|---|
| 塞尔维亚/保加利亚/罗马尼亚/希腊/荷兰/比利时/丹麦/瑞典/挪威/瑞士/西班牙/葡萄牙全缺 | 补齐 12 个欧洲政权 |
| 德意志帝国只有 Germany（缺阿尔萨斯-洛林） | 加 Poland（东部）/留 France 的争议区 |
| 罗马尼亚同时属奥匈与罗马尼亚 | 去重，各自独立 |
| 同一国被多政权包含 | 全局去重（94 国各归一个政权） |

- 政权数 10 → **22**，编号与参考图一致（0 德 / 1 奥匈 / 2 俄 / 3 法 / 4 意 / 5 奥斯曼 / 6 塞 / 7 保 / 8 罗 / 9 希）。

### 测试

- 新增 `r96-topo-templates-1914` **21 项**（模板列表/载入/最短路/not_found、1914 欧洲占格、巴尔干小国、殖民地归属、独立国）；
  全量 **155 套 / 3,446 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.48.0] — 2026-11-25

**修复《2026-11-25 数学工具问题》四个问题**。

### P0-1 `calls` 不继承 `variables`

- 根因：`BATCH_INHERITED_KEYS` 只含 precision/displayPrecision；
- 现在 `variables` 也继承，且**逐键合并**（条目同名覆盖、其余保留）。

### P0-2 `useWorkspaceVariables` 不生效

- 根因：`evaluate` 只读 `variables` 参数，从不读工作区；
- 现在作用域为 **工作区变量 ← 调用参数**（参数优先），且只有该工作区开关为真时才读。

### P1-3 复合表达式 BigNumber 溢出

- 根因：JS number 与 BigNumber 混算产生 17 位有效数字，转回时抛错；
- 修复：变量注入前统一转 BigNumber（`toBigNumberScope`）；
- `(A/B - C/D)/(A/B)*100` 现已得 `23.94578313253012`。

### P2-4 错误类型

- 新增 `not_found`（工作区/记录不存在），不再借用 `unknown_symbol`。

### 测试

- 新增 `r95-feedback-1125` 10 项（三档修复 + not_found）；
  全量 **154 套 / 3,425 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.47.0] — 2026-11-22

**多层文本地图：政权 / 水系 / 地形 / 海拔分带**。

### 新增

- `layers:["powers"|"water"|"terrain"|"elevation"|"all"]`——每层独立字符网格，可单独读或叠加；
- **水系层**：Natural Earth 10m 河流（2,145 段）+ 湖泊（120 个），`≈` 河流、`o` 湖；
- **海拔层**：10 个高程带（`<200 / 200-500 / 500-1k / 1-1.5k / 1.5-2k / 2-3k / 3-4k / 4-5k / 5-6.5k / >6.5k`），
  由 239 个地形区域 + 86 座真实山峰（珠峰 8848 m 等）合成；
- **地形层**：山脉 / 高原 / 沙漠 / 平原 / 盆地；
- 矢量图（`format:"svg"`）保留给需要精细呈现的场合。

### 性能

- 水系层加包围盒预筛：**1680 ms → 213 ms**（8 倍）。

### 数据（新增）

- `earth-water.json` 357 KB；`earth-terrain.json` 65 KB；`earth-elevation.json` 69 KB。

### 测试

- 新增 `r94-earth-layers` 12 项（四层 + 叠加 + 体积）；
  全量 **153 套 / 3,415 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.46.0] — 2026-11-22

**真实地球历史节点：文本地图（给 AI 读）+ 按真实国界光栅化**。

### 新增

- `world-map` 的 `earthNode:"medieval" / "pre-ww1" / "pre-ww2" / "cold-war"`：
  **默认输出字符网格文本地图**（每格 1 字符，数字=政权编号 + 经纬度坐标尺 + 格数统计）；
- 数据源换成 **Natural Earth 10m 真实国界**（258 国，`earth-borders.json` 668 KB），
  按国家多边形**实时光栅化**——不再用半透明圆近似；
- 体积 **约 5 KB/张**（同内容 SVG 要 ~1 MB）；`format:"svg"` 才出矢量；
- 局部放大 `viewBox:[lon0,lat0,lon1,lat1]`；
- 节点以**历史事件**命名（中世纪盛期/一战前夕/二战前夕/冷战），不用公元年份。

### 说明

- 地图读者是 AI：文本网格比百万像素的 SVG 更省 token 也更好推理；
- 移除 15 个未被引用的预存 SVG（2.9 MB 死数据）。

### 测试

- 新增 `r93-earth-node-text` 14 项（文本地图、坐标尺、四节点、局部放大、矢量可选、未知节点）；
  全量 **152 套 / 3,403 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.45.0] — 2026-11-22

**world-map：SVG 矢量地图（精细 + 可缩放 + 可编辑）**。

### 新增

- `export:"svg"`：输出**矢量**世界地图（不是马赛克 ASCII）；
- 要素：等高分层色带 + 等高线（marching squares）+ 河流 + 国界 + 矿产点 + 经纬网格 + 国家注记 + 比例尺 + 指北针；
- **局部放大** `viewBox:[x0,y0,x1,y1]` + `svgWidth`（画布宽 200–4000）；
- 开关 `graticule` / `svgLabels` / `svgMinerals`；
- 新模块 `src/features/deduction/map-svg.ts`（纯手写，无新依赖）。

### 修复（关键）

- **色带按相对高度分档**：初版用绝对 0–1 阈值，而实际海平面是**分位数**（本例 0.647），
  导致大片陆地落进「海」色带——渲染出来是噪声图不是地图。现在统一换算「高于海平面多少」。

### 验证

- 400×200 网格 → SVG 约 750 KB，352 ms；`viewBox` 局部放大 387 KB；
- 新增 `r92-map-svg` 15 项（结构、相对色带、要素开关、viewBox、编辑后重渲）；
  全量 **151 套 / 3,389 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.44.0] — 2026-11-22

**astro rise-set：按当地日切窗口（时区）**。

### 修复

- 旧实现按 **UTC 日**切 24 小时窗口：经度不为 0 时当地日期错位——
  实测北京 lon116 夏至算出「日出 20:46Z 晚于日落 11:46Z」（把次日日出算进来）；
- 现在按**当地日**切窗口：时区默认由经度推算（每 15° = 1 小时，北京 → UTC+8），
  也可用 `timezoneMinutes` 显式指定（UTC+8 = 480）；
- 输出给**当地时刻 + UTC 时刻**两套，日照时长仍按当地日 24h 高度扫描；
- 日出/日落限制在当地日窗口内（超窗 = 极昼/极夜，不再串到次日）。

### 验证

| 地点 | 日出（当地） | 日落（当地） | 日照 |
|---|---|---|---|
| 北京 39.9N/116.4E | 04:46 | 19:46 | 15.17h |
| 东京 35.7N/139.7E | 04:25 | 19:00 | 14.67h |
| 伦敦 51.5N/-0.1 | 03:43 | 20:21 | 16.83h |
| 纽约 40.7N/-74 | 04:25 | 19:30 | 15.17h |

### 测试

- `astro` 扩到 12 项（北京 rise<set、经度推时区、纽约 −300、显式 timezoneMinutes、正午高度）；
  全量 **150 套 / 3,374 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.43.2] — 2026-11-22

**按《2026-11-22 工具与流程反馈》修三处**。

### 修复

- **`world-map` climate:true**：数据一直生成，但只放在 `value.climate`、文本里没写 → 用户以为没生成。
  现在文本追加【气候层】（分区占比 / 可耕率 / 可耕面积）；
- **`world-map` edits 越界/小数**：此前静默跳过，传经纬度（如 x=7,y=50.5）会得到 internal 或无声无息；
  现在报 `invalid_argument` 并提示换算公式（x=(lon+180)/360×mapWidth，y=(90−lat)/180×mapHeight）；
- **astro rise-set**：报告里的 32.92h 复测为旧 lib 所致——当前代码 1980-11-17 / 50.5N / 7E = **9.00h**（改前 32.92h），
  已把「重启后复验」写进 help；

### 测试

- `r89` 扩到 20 项（climate 文本、edits 越界报错）；
  全量 **150 套 / 3,369 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.43.1] — 2026-11-22

**help 文本更新（astro 复验 / world-map 图例与导出细节）**。

### 文档

- `help` 的 astro 节：补**字段与复验**——`dayLengthHours` / `noonAltitude` / `polar`，
  给复验命令（lat45 · 2026-11-17 → 应得 9.58h，不是 32.9h），并注明「仍见 >24h 就先重启 DSH」；
- `help` 的 world-map 节：补**地球时期线字图例**（`~` 海岸 / `|` 国界 / `:` 行政线 / `·` 未划归大陆）、
  导出文件命名（`map-<seed 或时期>-<时间戳>.<txt|md|json>`）与 JSON 内容、`earthEra` 不生成 focusMaps 的说明。
## [3.43.0] — 2026-11-22

**world-map：拓扑模型（地图模型）+ 地图导出**。

### 新增

- `mapModel:"save" / "load" / "list"` + `modelName`：把生成参数存进数据层（kind `map-model`），
  之后 `load` 用同一 seed/参数**确定性重建**整张地图；
- `export:"txt" / "md" / "json"`：把当前地图（含 ASCII、notes、结构化 value）写到
  `$DSH_MATH_CALC_HOME/exports/`，返回 `exportPath`；地球时期图同样支持导出；
- 随机地图与 `earthEra` 两条路径都接入了导出。

### 说明

- 模型只存**参数**（seed/尺寸/参数/edits），不存网格——重建是确定性的，体积小；
- 导出目录可被调用方读取；JSON 导出含完整 value（含 ascii/asciiBorders/focusMaps）。

### 测试

- 新增 `r91-map-model-export` 9 项（save/load/list、未知模型/动作、md/json 导出、地球图导出）。
## [3.42.0] — 2026-11-22

**预存真实地球（历史时期地图）**。

### 新增

- `world-map` 加 `earthEra:"1500" / "1800" / "1900" / "1945" / "2000"`：
  用内置**真实地球**数据（简化大陆轮廓 + 各时期主要政权圆近似）渲染等距投影 ASCII 图 + 政权列表；
- 新增 `src/data/earth-maps.json`（6 大陆、5 时期、政权 7–10 个/时期）；
- 新增 `src/features/deduction/earth-maps.ts`（等距投影、射线法点在多边形内、政权圆判定、ASCII 边界）；
- 不给 `earthEra` 时仍走随机大陆（行为不变）。

### 口径（已写入 help/SKILL/输出）

- **简化轮廓，非精确测绘**；只给「地球该时期格局」的参照。

### 测试

- 新增 `r90-earth-maps` 10 项（5 时期、陆地占比、政权列表、未知时期、随机地图不受影响）。
## [3.41.0] — 2026-11-22

**world-map：格子粗细自主编辑**。

### 新增

- `focusRegions:[{name,x,y,radius,detail}]`：指定重点区域，`radius` 控制窗口范围、`detail` 控制子图列数（越大越细，上限 160）；
- 给了 `focusRegions` 就**替代**自动检测（首都/经济中心/国界密集）；不给则仍自动；
- 主图粗细仍由 `asciiWidth/asciiHeight` 控制（全局）。

### 验证

- 端口例：`focusRegions:[{name:"北门",x:100,y:50,radius:10,detail:40}]` → 1 张 21×21 全分辨率子图；
- 自动模式仍给 6 张（4 首都 + 经济 + 国界）。

### 测试

- `r89` 扩到 18 项（focusRegions 生效）。
## [3.40.0] — 2026-11-22

**world-map 多尺度（自适应精细）**。

### 新增

- **局部精细子图 `focusMaps`**：首都（每国）、经济中心（矿密集窗口）、国界密集段自动各附一张；
- 子图 **1 字符 = 1 网格格**（全分辨率），主图 1 字符 ≈ 3 格——重要地点细、荒野粗；
- 子图同样叠加地形分层/河流/矿产/国界，并保留在 `value.focusMaps`（result 里也渲染一份）；
- 总字符仍约 11 KB（6 张子图），「精而不费」。

### 说明

- **道路沿线精细未做**：当前没有路网数据；有道路概念后可把「道路经过的格」加入重点区域，机制已就绪（`renderWindow` + `densestCenter`）。

### 测试

- `r89` 扩到 17 项（多尺度子图存在、子图全分辨率）。
## [3.39.0] — 2026-11-22

**world-map ASCII 精细化（不走海量坐标，把 ASCII 本身做细）**。

### 新增

- **精细 ASCII 地图**（默认 **120×60**，`asciiWidth`/`asciiHeight` 可调 20–240 / 10–160）：约 7 KB/张；
- **字符=高度带**（· 平原 / - 低地 / : 丘陵 / + 高地 / ^ 山 / @ 高峰 / # 高原 / % 极高原），形成等高视觉；
- 叠加 **= 河**、**\* 矿**、**| 国界**；**~ 浅海 / ≈ 深海 / . 海岸**；
- 顶行：**指北针 + 比例尺（1 字符 ≈ X km，同时给网格格距）**；底行：**图例**；
- 原 80×40 粗糙地形图被替换；`asciiBorders`（国家编号+边界）保留作另一视图。

### 说明

- 未采用 GeoJSON/等高线折线：用户明确要求「挖掘 ASCII、精而不费」（海量坐标会让 value 膨胀到 MB 级）；
- 地形精度取决于网格（`mapWidth/mapHeight`，上限 1440×1440），ASCII 只是它的紧凑视图。

### 测试

- `r89` 更新为 15 项（≥60 行/120 列、比例尺与图例在 ASCII 内）。
## [3.38.0] — 2026-11-22

**world-map 国界/地形/矿产编辑 + astro 日照时长修复**（用户 2026-11-22 两条要求）。

### 新增（world-map）

- `edits` 支持 `mineral`（1–3 级，0 清除该格矿）；
- **ASCII 国界图** `asciiBorders`（数字=国家编号，`|`=边界）+ 国界统计 `borders:{cells,nations}`；
- ASCII 地形图与国界图都保留在 `value`（程序画图要用）；
- notes 加图例与**声明**：ASCII 是随机生成的大陆，只作相对位置/距离校验，不作真实地球底图。

### 修复（astro）

- **日照时长**：改用当日太阳高度 5 分钟步长扫描。旧实现 `|set−rise|` 在跨日/高纬把**次日日出**算进来，
  lat45 夏至得 39.62h、冬至 32.78h（用户报的「32.9 小时」类异常）；现在 lat45 夏 15.75h / 冬 8.92h。
- **正午太阳高度**：取当日扫描最大值（旧实现用 UTC 12:00，北京夏至算出 -2.1°；现 68.4°）。
- 极昼/极夜明确给 24h / 0h（此前 `SearchRiseSet` 返回 null 时只给「极昼或极夜」一句）。

### 测试

- 新增 `r89-worldmap-astro` 14 项（地形/国界图、矿产编辑、国界变化、astro 高纬回归）；
- `world-map` 22 项保持；
  全量 **148 套 / 3,344 项全绿**（`test-v3/test-report.json` 已刷新）。

### 文档

- help `world-map` / `astro` 节、SKILL 同步（含「随机大陆不作底图」「日照用高度扫描」两条声明）。
## [3.37.1] — 2026-11-21

**声明打磨第二轮：核对「声明了但没做」**。

### 核对结论

- **op / 子命令**：`derivation` 29/29 已实现（PENDING 为空）；`topology` 实现 20 个动作（≥ help 声明）；
- **schema 死键**：0（`customExpression` 已在 3.37.0 移除）；
- **help 引用的参数名**：20 个全部在 schema（3 个 `partial/failed/succeeded` 是输出字段，非输入）；
- **help 的 operation**：0 个假 operation。

### 修复（文档说「未实现」但其实已做）

- `docs/项目状态总结`、`docs/全量功能清单`：17 号（通用实体台账）/ 18 号（几何与地形）标「一行未实现」→
  改为「已实现（topology entities/geometry，2026-11-21 复核）」；
- `help` 的 topology 节：补 `action:"ship"/"building"` 简写与 `action:"rules"`（实现已有、help 未提）。
## [3.37.0] — 2026-11-21

**声明与实现对齐（第一轮打磨）**。

### 修复（声明承诺 ≠ 实现）

- **`topology` 顶层别名被丢弃**：schema 声明了 `area/massKg/speedKph/energyJ/energyPerKmJ/fromPoint/toPoint/obstacles/gridKm/safetyKm`，
  但传 `topology:{...}` 时只读对象内部——现在顶层别名会合并进去。
- **`units` 不带参数**：help 说「列出全部可用单位」，实际报 missing_params；现在真的列出**单位族概览**（469 条按量纲分组）。
- **`customExpression`**：schema 有、代码从不读取（死键）→ 已从 schema 移除。
- **`hierarchy` 顶层 `levels`**：与 topology 的 integer 类型冲突（hierarchy 要数组）→ 撤销合并，统一用 `hierarchy` 对象。

### 文档

- help 新增 **「参数总表 args」** 节：65 个此前从未在 help 出现的键集中列出；节数 65 → 66；
- `docs/整合方案…` 的 53 operation → 64；`docs/随机数.md` 的「第 64 节」改为 `helpTopic:"random"` 写法。

### 测试

- 新增 `r88-declaration-align` 10 项（units 概览、topology 顶层、hierarchy 对象、死键移除、args 节）。
## [3.36.1] — 2026-11-21

**提示层：不联网，但提醒 AI 可自行搜索现实数据验证**。

### 新增（提示，不是功能）

- `awareness`（brief / full 两档）：加「现实数据验证」段——
  「本工具不联网；内置常数/单位是现实参考（CODATA/IAU 等）。算现实问题时，可自行搜索权威来源（地区物价、折算率、标准值、行业参数）核对或替代默认值；用搜索来的数时注明来源与适用域。」
- `help` 的「帮助怎么用」节与 `SKILL.md` 的「已知边界」表同口径提醒；
- 工具本身仍然**不发任何网络请求**（纯本地）。

### 修复

- `help.json` 被编辑工具写成裸换行（非法 JSON），已修复转义并验证 65 节可解析；
  全量 **146 套 / 3,319 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.36.0] — 2026-11-21

**服务化最后一块：自定义公式链**。

### 新增

- `registerChains` / `listChains` / `unregisterChains` / `chain(id, {namespace, initial})`；
- 命名空间隔离；步骤 1–20；`dataFlow` 只能指向更早步骤；
- 步骤公式可用内置或命名空间自定义公式；`chain()` 自定义优先、否则内置 `sys-*`；
- `describe().methods` 22 → 26。

### 测试

- 新增 `r87-chains` 18 项；`r81/r83/r85/r86` methods 断言同步 26；
  全量 **146 套 / 3,319 项全绿**（`test-v3/test-report.json` 已刷新）。

### 压测（链）

| 项 | 结果 |
|---|---|
| 10 命名空间 × 50 链注册 | 1.35s |
| 1000 次自定义链执行 | 5.3s（5.3ms/次） |
| 50 并发链执行 | 50/50 |
| 注销 10 ns 链 | 1ms，注销后 capability |
## [3.35.0] — 2026-11-20

**功能盘点 + 补齐扩展接口（五组）**。

### 新增

- `constants()`：全部物理常数（只读标准值）；
- `worldState(set/get/list/delete)`：命名空间级世界设定；
- `data(put/get/query/stats)`：服务层数据层（当前工作区）；
- `entities(register/list/unregister)`：命名空间级实体类型清单；
- `models(save/load/list/delete)`：命名空间级拓扑模型；
- `describe()` 方法数 17 → 22；新增 `docs/扩展接口清单.md`（功能盘点 + 为什么只读）。

### 测试

- 新增 `r86-extensions2` 20 项；`r81/r83/r85` methods 断言同步；
  全量 **145 套 / 3,301 项全绿**（`test-v3/test-report.json` 已刷新）。

### 压测（五组）

| 项 | 结果 |
|---|---|
| 1000 次 worldState set/get | 5ms |
| 1000 次 worldState list（每条 1000 项） | 647ms |
| 10 ns × 100 实体注册 | 16ms |
| 500 次 models save/load | 7ms |
| 500 次 data put | 3.2s（6.4ms/条） |
| 50 并发 worldState | 50/50 |
## [3.34.0] — 2026-11-20

**mathEngine 扩展接口：命名空间级自定义货币 / 公式**。

### 新增

- `currency(action)` 服务方法（list/get，合并内置符号库与命名空间自定义货币）；
- `registerCurrencies` / `listCurrencies` / `unregisterCurrencies`；
- `registerFormulas` / `listFormulas` / `unregisterFormulas`（自定义公式支持 params 默认值与 unit）；
- `formula()` 优先查命名空间自定义公式；
- 注册校验：code/id 字母开头、与内置同名拒绝、expr 非空、params 有限数。

### 测试

- 新增 `r85-extensions` 18 项；
  全量 **144 套 / 3,281 项全绿**（`test-v3/test-report.json` 已刷新）。

### 压测（扩展接口）

| 项 | 结果 |
|---|---|
| 10 命名空间 × 100 货币 | 1.3s |
| 10 命名空间 × 20 公式 | 2ms |
| 1000 次 currency get | 13ms |
| 1000 次自定义公式求值 | 2.5s（2.5ms/次） |
| 1000 次货币列表（合并 147 条） | 14ms |
| 50 并发 currency get | 50/50 |
| 注销 10 命名空间 | 10/10，注销后 capability |
## [3.33.0] — 2026-11-20

**货币符号库（currency）**：现代/古代/架空货币的中文名、国际符号与缩写。

### 新增

- `src/data/currencies.json`：**47 条**（现代 22 / 古代 16 / 架空 9）；
- `operation:"currency"`：`list`（按类别分组）/ `get`（代码、中文名、缩写均可查）；
- **不做汇率换算、不记录购买力**（用户口径：购买力由 AI 按当时世界查询/设定）；
- help 第 65 节、SKILL 行、`docs/货币库.md`。

### 测试

- 新增 `r84-currency` 14 项；
  全量 **143 套 / 3,263 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.32.1] — 2026-11-20

**服务层压测：单位名规则收紧**。

### 修复

- 自定义单位名曾允许下划线（`zu0_0`），但 `createUnit` 拒绝 → 注册必然失败；
  现在正则收紧为「字母开头、只含字母数字」，与 createUnit 一致（r82 补断言）；
  全量 **142 套 / 3,248 项全绿**（`test-v3/test-report.json` 已刷新）。

### 压测数据（本机）

| 项 | 结果 |
|---|---|
| 1000 次 evaluate | 1.2s |
| 500 次 formula | 1.9s（3.9ms/次） |
| 500 次 interval | 8ms |
| 10 命名空间 × 50 单位 | 1.05s |
| 命名空间内 1000 次 evaluate | 1.1s |
| 1000 次错误调用 | 0.35s |
| 50 并发（服务+工具混用） | 50/50 |
| 注销 10 命名空间 | 10/10，注销后 capability |
## [3.32.0] — 2026-11-20

**服务化第三期：公式代入 / 区间 / 常量**。

### 新增

- `formula(id, params)`：按 id 或中文名代入，返回数值/单位/输出量（`value.output`）；
- `interval(expr)`：结构化区间（low/high/mid/相对半宽/置信档）；
- `constant(name)`：读 constants-graph 标准值（`{number, unit, value:{name, meaning}}`）；
- 三者同样遵守错误三档与「与工具一致」。

### 测试

- 新增 `r83-service-third` 15 项；`r81` methods 断言 7 → 10；
  全量 **142 套 / 3,247 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.31.0] — 2026-11-20

**服务化第二期：自定义单位命名空间**。

### 新增

- `registerUnits(namespace, units)` / `listUnits(namespace?)` / `unregisterUnits(namespace)`；
- **每个命名空间独立引擎**（`createEngine()` 无缓存工厂）：注册单位只在该世界生效，注销即丢弃实例；
- `evaluate`/`convert`/`checkDimension` 支持 `namespace` 选项；
- 注册校验：字母名、正 factor、base 必须已知、与内置/已注册同名拒绝；
- `describe().supportsCustomUnits` 改为 `true`。

### 测试

- 新增 `r82-namespace-units` 18 项；`r81` 更新 methods 断言（17 项）；
  全量 **141 套 / 3,232 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.30.0] — 2026-11-20

**对外服务化第一期：`mathEngine` cordis 服务**（回应 dsh-canon-memory 提案）。

### 新增

- `ctx.provide("mathEngine", …)`：程序化门面，不经过工具流水线、不写会话；
- 方法：`describe()`（版本/operations/单位族）、`evaluate()`、`convert()`、`checkDimension()`；
- 结构化返回（`number` 字符串 / `unit` / `value` / `steps`），值与展示分离；
- **错误三档**：`input` / `capability` / `internal`（可降级语义）；
- 与工具一致性由 `r81` 锁住（同输入同数值）。
- 新增 `docs/服务化接口.md`（API、三档映射、第二三期规划）。

### 测试

- 新增 `r81-math-engine-service` 17 项；
  全量 **140 套 / 3,214 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.29.3] — 2026-11-20

**压测第六轮：符号查询短路**。

### 修复

- **`formulas query:"*"` 花 1.1s**：纯符号查询会触发首次模糊索引构建且无意义；
  现在直接返回「纯符号查询没有意义」提示（< 20ms），不建索引。
- 正常查询的首次 ~1.1s 是索引构建（一次性），第二次命中缓存（补断言说明）。

### 测试

- 新增 `r80-symbol-query` 6 项；
  全量 **139 套 / 3,197 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.29.2] — 2026-11-20

**压测第四/五轮：写入性能与单位全表**。

### 修复

- **`putRecord` O(n²)**：每条都全表重读，5000 条写入 52s；现在用缓存查重、追加后更新缓存，
  5000 条 **9s**（5.5×）。
- **`rad_dose` 无法换算**：注册时清洗成 `raddose`，但输入 `rad_dose` 无映射（units 全表 22/23）；
  现在主名也建「原名→清洗名」映射，全表 23/23。
- **显示名还原**：`5 rad_dose` 曾显示成 `5 raddose`；现在还原为原名。

### 新增

- `r79-perf-units` 6 项：5000 条 put ≤30s、同量纲单位全表、rad_dose 往返与显示；
  全量 **138 套 / 3,191 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.29.1] — 2026-11-20

**压测第三轮：`sys:` 链归一 + `data export` 内容字段**。

### 修复

- **`formulas query:"sys:material"` 用不了**：实现只认 `sys-material`，文档说的 `sys:链id` 报 unknown_symbol；
  现在 `sys:material` / `sys-material` / `material`（带 sys 前缀时）都归一。
- **`data export` 的 value 没有内容**：只有 `{exported:true}`，程序化拿不到 JSON；现在 `value.json` 带完整导出串。

### 测试

- 新增 `r78-sys-export` 6 项；
  全量 **137 套 / 3,185 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.29.0] — 2026-11-20

**压力测试第二轮：7 条真问题修复**。

### 修复

- **复数结果被误判 non_finite**：`sqrt(-1)` 报「结果不是有限数」；现在返回 `复数：1i`（value `{re,im}`）。
- **温度换算低于绝对零度**：`-300 degC` 曾给出 `-26.85 K`；现在拒绝（`invalid_argument`），`-273.15 degC = 0 K` 仍允许。
- **数据层 workspace 未隔离**：所有工作区共用一个 `workspaces/.artifacts/datastore`，w2 能查到 w1 记录；
  现在每工作区独立目录（`<name>.artifacts/datastore`），旧全局数据首次访问迁移一次。
- **中文子串检索失效**：索引把「w1记录」当整串 token，查「记录」0 命中；现在用 segmentit 分词（与公式检索同款）。
- **`params` 传数组**：曾误报「缺必填参数」；现在 `invalid_argument`（params 必须是对象）。
- **`chain` 的 `initial` 传字符串/数组**：曾误报缺参；现在 `invalid_argument` 并点名键。
- **`extract_numbers` 控制字符**：曾进台账上下文；现在先清洗。

### 测试

- 新增 `r77-stress2` 15 项（复数/温度/隔离/检索/类型/控制字符）；
  全量 **136 套 / 3,179 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.28.2] — 2026-11-20

**`label` 字符清洗**：多语言/符号保留，四类异常清洗。

### 修复

- **换行/制表**：label 里的 `\n`/`\t`/`\r` 压成空格（此前会截断结果头行）；
- **超长**：截断到 80 字 + `…`（此前 3000 字直接进头行）；
- **控制字符**（U+0000–U+001F、U+007F）与**孤立代理项**（U+D800–U+DFFF）移除；
- 空白 label 仍被忽略；非字符串忽略。

### 支持范围（实测）

- 中文、日文、韩文、俄文、阿拉伯文（RTL）、泰文、emoji、数学符号（→ ≤ ∑ π）、
  引号/反斜杠——全部原样保留。

### 测试

- 新增 `r76-label-chars` 16 项；
  全量 **135 套 / 3,164 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.28.1] — 2026-11-20

**批量 `calls` 支持 `label` 标签**（用户实测：17 条全部报警「参数名认不出来」）。

### 修复

- `calls` 条目可带 `label`：结果显示在每条头部（`── [1] evaluate（电解·耗电）──`），
  并写进 `value.results[].label`；不再触发「认不出来」提示；
- `expressions` 的 `{label, expr}` 标签同步可用（此前已支持，补断言）；
- 单条调用带 `label` 也不报警（仅忽略）。

### 测试

- 新增 `r75-batch-label` 8 项；
  全量 **134 套 / 3,148 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.28.0] — 2026-11-20

**自行压力性测试 + 4 条真问题修复**。

### 修复

- **`evaluate` 的 `NaN`/`Infinity`/`-Infinity`**：此前当字符串结果返回 `ok=true`（AI 会误以为算成功）；
  现在一律 `non_finite`。
- **`constants` 极端值溢出**：`c=1e-300` 会让派生量变成 Infinity/NaN，JSON 序列化成 `null` 静默污染；
  现在检查 `changed/derived`，非有限 → `non_finite`。
- **`expressions` 超 100 条**：此前静默只算前 100（`ok=true` + 小字提示）；现在 `invalid_argument` 直接拒绝。
- **`data search` 的 `nameContains`**：此前只认 `query`，别名不生效；现在回退可用。

### 新增

- `r74-stress` **17 项**：批量上限（50/51）、表达式上限（100/300）、NaN/Infinity、极端常数、
  100 万点 stats（≤5s）、1440×720 地图（≤12s）、空表达式/超长表达式/多斜杠单位。
- `numeric-boundary` 的「250 条截断」断言改为「250 条拒绝」；
  全量 **133 套 / 3,140 项全绿**（`test-v3/test-report.json` 已刷新）。

### 压测结论

- 规模：calls 50 219ms、stats 100 万 2.0s、world-map 1440×720 2.7s、查询 156ms——达标；
- 边界：空/超长/未知单位/参数 NaN 均可读拒绝；
- 长时/并发留待后续（本轮未做 22 链全跑与 1000 次调用循环）。
## [3.27.0] — 2026-11-19

**`output`（输出物理量名）扩到全库**。

### 新增

- **830 条主公式全部标注 `output`**：211 条链上人工映射、212 条理论/定理类人工给量名、
  407 条按名称自动提取（如「能量」「功率」「基尼系数」）；
- 定理类不再输出成「XX 定律」而是输出量名（如 `newton_second → 合力`、`coulomb → 静电力`）；
- 新增 `r73-output-coverage` 5 项：覆盖率、长度、关键语义抽查、调用/网查询；
  全量 **132 套 / 3,124 项全绿**（`test-v3/test-report.json` 已刷新）。

### 口径

- 自动提取按名称（去括号），理论类人工核对 212 条；
- `output` 供跨链语义匹配与 AI 查询用，不影响公式计算。
## [3.26.0] — 2026-11-19

**语义判定：链上公式补 `output`，跨链候选标 `semantic`**。

### 新增

- 链上 **211 条**公式加 `output`（输出物理量名，如 hall_petch → 屈服强度）；
- 跨链候选加语义标记（量名 ≥3 字且相等/互为词段，防「力」「时间」子串撞车）；
- 统计行显示「自动候选 N 条（语义 M 条）」；
- 确认 1 条：建筑链 #2 `column_axial_capacity.sigma_y` ← 材料链第 5 步（屈服强度）。

### 口径

- 语义判定只做「量名匹配」，不是物理推理；多数候选仍是组匹配弱提示；
- 当前语义候选已全部确认（统计显示 0）。

### 测试

- `r71-cross-chain` 8 项（候选结构 6 → 7 字段）；`r72-cross-flow` 10 项；
  全量 **131 套 / 3,119 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.25.0] — 2026-11-19

**高置信跨链候选逐条确认**。

### 新增

- 确认 **2 条** `crossFlow`：时间链/量子链的 `wien_displacement.T` ← 材料链第 2 步（熔点温度）；
- 候选生成排除已声明 `crossFlow` 的参数（358 → 352），避免重复展示。

### 审阅结论

- 679 条候选行逐条看过：只有 2 条同时满足「输出组一致 + chainRef 命中 + 语义一致」；
- 其余为组匹配噪声（长度/比率/速度同组撞车），**不自动成边**；
- 自动候选保留为弱提示，需人工确认后才进 `crossFlow`。

### 测试

- `r72-cross-flow` 9 → 10 项（新增 wien 确认断言）；
  全量 **131 套 / 3,119 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.24.0] — 2026-11-19

**跨链取值**：链的步骤可以直接接另一条链某步的输出。

### 新增

- `crossFlow`：步骤参数 ← 其他链某步（当前声明 5 条：结构链 sigma_y←材料链5、
  产能/财政/排队 labor_force.population←食物链9、能源链 fick.area←生物链1）；
- `crossValues` 参数：调用时传 `{链 id: {步号: 数值}}`；
- 链渲染显示 `sigma_y←材料链第5步`；缺值报 `missing_params` 并**指明来源链与步**；
- hint 给 crossValues 示例。

### 测试

- 新增 `r72-cross-flow` 9 项：数据、来源提示、取值跑通、渲染；
  全量 **131 套 / 3,118 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.23.0] — 2026-11-19

**跨链自动接点**：note 的人工声明结构化 + 公式网自动候选。

### 新增

- **声明接点解析**：`note` 的「接点自 X 链」→ `chainRef`（**39 步**、22 条链），
  `formulas query:"chain"` 的表格多一列「接点」并统计「跨链接点：N 步」；
- **跨链自动候选**：公式网生成 **358 条**候选（链 A 某步的参数组 == 链 B 某步的输出组），
  写入 `formula-web.json` 的 `crossCandidates`，统计里显示；不依赖人工声明。

### 口径

- 声明接点 = 人工确认的路线（文本→结构化，AI 可读）；自动候选 = 组匹配建议（需人工确认）；
- **数值传导仍未跨链**：chain-run 只走链内 `dataFlow`，跨链取值仍要手工带入（下一步）。

### 测试

- 新增 `r71-cross-chain` 8 项：chainRef 解析、链查询接点列、自动候选结构与来源；
  全量 **130 套 / 3,109 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.22.0] — 2026-11-19

**跨链打通 + 经验系数参数化 + 最后一组重复折叠**。

### 新增

- **链与公式网打通**：`systems.json` 的 `dataFlow` 生成为 `chainEdges`（16 条，其中 9 条是组匹配没有的边）；
  `chainIndex` 记录公式参与的链与步骤；查询树里链边**优先显示**并标注 `（链:材料链 第5→9步）`；
  公式调用返回 `value.web.chains` 与 notice 链摘要。
- **经验系数参数化 26 条**：Mifflin（4）、Du Bois（3）、Kleiber 70、每日需水 35、Widmark 0.015、
  Clark 70、血容量 70、Fox 心率 220、Naegele 280、发热代谢 0.13、洛希 2.44、里德伯 13.6 eV、
  宜居带 1.1、主序指数 −2.5、太阳常数 1361、声速 343、A4 440/69、兴波 1.34/1.944、
  Magnus 243.04/17.625、收后损耗 0.9、年天数 365、STP 摩尔体积 22.414、氧气占比 0.21。

### 修复

- `avogadro_molecules` 与 `particles_from_moles` 完全同式 → 归入后者（第 29 组重复折叠）。

### 测试

- 新增 `r70-chain-web` 7 项；`r65` 14→16、`r66` 9→12；
  全量 **129 套 / 3,101 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.21.0] — 2026-11-19

**反馈报告 v2 全量的 11 条待修**（3 真 bug + 8 接口）。

### 修复

- **`system` 把无解报成 singular**：改用增广矩阵秩——`rank(A|b) > rank(A)` → `no_solution`，
  相等才是 `singular`（无穷多解）。
- **`optimize` 无解**：从 `ok=true` 文本改为 `no_solution` 错误体（无界仍是有解状态，返回 ok=true）。
- **`data` 空名**：`internal` → `invalid_argument`（kind/name 空都点明）。
- **`random` count:0**：返回 0 个（此前被 Math.max(1) 兜成 1）。
- **`audit` 大小写**：小写键不再覆盖精确键（`s` 秒 vs `S` 西门子）；`kg/m3` 归一 `m³` 后可识别（mass/volume）。
- **`world-map`**：`mapSeed` 生效（回退兼容 `seed`）；`mapDistance` 的结果进文本（此前只在 value 里）。
- **门面免 op**：`calc` 按表达式是否含 `=` 推断 evaluate/solve；`derive` 推断 derivation/world。
- **`document` 认 text**：extract 直通纯文本；tables 按制表符/竖线切行。

### 测试

- 新增 `r69-feedback-v2` 13 项（3 真 bug + 8 接口 + 无界仍 ok）；
  全量 **128 套 / 3,089 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.20.0] — 2026-11-19

**长周期随机数 + 行为映射**（`operation:"random"`）。

### 新增

- **xoshiro256++**（周期 **2^256−1**，SHA-256 播种，状态 32 B）：
  序列模式 `randomSeed + count/min/max/integer`；
- **行为映射**：`randomActors + randomTraits`（`{min,max}` 或 `{choices}`）——
  每个实体的子流由 `seed|实体名` 派生，**与排序无关**（同一人任何时候同一值）；
- 兼容 `algorithm:"lcg"`（旧 2^32，仅序列）；
- help 第 64 节；`docs/随机数.md`；选型记录进 `docs/推演选型.md`。

### 测试

- 新增 `r68-random` 13 项：序列/复现/行为映射/顺序无关/LCG 兼容/边界；
  全量 **127 套 / 3,076 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.19.0] — 2026-11-19

**常数关系网（文档式）**：改一个常数会牵动谁、不想牵动怎么调和。

### 新增

- `docs/常数关系网.md`：15 条基本关系（c=1/√(μ0ε0)、α、R=NA·kB、σ、R∞、a0、λ_C、g0=GM/R²…）、
  联动表（改 c/G/h/e/kB/NA/σ/α/g0 各会牵动什么）、三种调和办法（加独立参数 / 声明新常数 / 固定标定量反推）。
- `constants` 操作的「基础旋钮」行现在带 **→ 派生: …**（反查依赖图，直接看到改它牵动谁）。

### 修复

- 派生量（mu0、sigma、alpha_fs…）以前传进 `constants` 会被**静默忽略**；
  现在明确拒绝并给出改法（改依赖旋钮 / 在具体公式 params 里覆盖）。未知常数名也点名提示。

### 测试

- 新增 `r67-constant-relations` 9 项：依赖图结构、→ 派生渲染、改 c 联动 mu0/sigma、派生量拒绝；
  全量 **126 套 / 3,062 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.18.0] — 2026-11-19

**架空常数可改：公式里的物理常数不再定死**。

### 新增

- 12 条公式把硬编码/隐式注入的常数提升为**可选参数**（默认现实值，可覆盖）：
  `c`、`G`、`h_planck`、`hbar`、`NA`、`m_e`、`g0`、`Lsun`、`day_seconds`、`rayleigh_factor` 等；
- 覆盖即生效：`photoelectric_threshold` 改 `h_planck` 翻倍 → 阈值频率减半；
  `compton_shift` 改 `c` 翻倍 → 频移减半；`fission_energy_per_mass` 改 `NA` → 结果按比例；
  `solar_luminosity` 改 `Lsun`、`optical_resolving_power` 改 `rayleigh_factor` 同理。
- 扫描确认：**表达式里已无硬编码物理常数**（宽松匹配 0 条）；数学系数（0.5/2/π）保留。

### 文档

- 新增 `docs/架空常数.md`：原则、参数化清单、用法、限制。

### 测试

- 新增 `r66-formula-constants` 9 项（默认值 + 覆盖生效）；
  全量 **125 套 / 3,053 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.17.0] — 2026-11-19

**上下游显示：每条边都标「输出量 → 参数」**。

### 改进

- `value.web` 的每条边加 `output`（上游输出物理量组；常数边为单位）与 `value`（常数数值）；
- `notice` 摘要改为可读的双向格式：
  `上游 56：velocity_uniform（输出「速度」） → .v`；`下游 46：输出「能量」 → power.W`；
  常数上游：`c（输出 m/s，值 299792458） → .c`；
- `formulas query:"web"` 的树同步：`G → gravitation.G`、`velocity_uniform 输出「速度」→ kinetic_energy.v`。

### 测试

- `r65-formula-web-context` 10 → **14** 项（输出字段、常数单位/数值、摘要格式）；
- `r64-formula-web` 断言更新为「G → 公式.参数」；
  全量 **124 套 / 3,044 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.16.0] — 2026-11-19

**真重复折叠 + 公式调用带网上下文**。

### 新增

- **公式调用自动带上下游**：`formula` 成功时返回 `value.web`（上游/下游，含常数上游）与 notice 摘要；
  `webContext:false` 可关。公式不再只是孤立函数——每次调用都看得到它在网里的位置。
- **26 组真重复折叠为别名**（28 条）：`projectile_energy→kinetic_energy`、`ram_momentum→momentum`、
  `thermal_efficiency_carnot→carnot_efficiency`、`rc_time`/`lc_resonance`/`moment_inertia_*` 等；
  网节点 859 → **831**；查询别名自动指向主节点；调用别名仍可算（兼容）。

### 修复

- `lanchester_linear` 表达式抄成了平方律 → 改回线性律 `N0 − (b/a)M0`；
- `titration_moles` 缺化学计量比 → `C₁V₁/(nC₂)`，补参数 `n`。

### 测试

- 新增 `r65-formula-web-context` 10 项；`r64-formula-web` 21 → 23 项（别名折叠/别名查询）；
  全量 **124 套 / 3,040 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.15.0] — 2026-11-19

**公式扩展：工程/地质/社会 +15 条经典公式**（844 → 859）。

### 新增（全部经典式，不含经验拟合）

- 工程：莫尔圆正应力、最大主应力、最大剪应力、冯·米塞斯等效应力、文丘里流量、水力半径、
  分压/分流电路、交流有效电流、无功功率/视在功率；
- 地质：莫尔-库仑强度准则、艾里均衡地壳根深度、放射性定年、斯托克斯沉降速度；
- 社会：帕尔马比值、差异指数（居住隔离）。

被跳过的重复：托里拆利出流、分压电路、视在功率、人口倍增时间（已存在）。

### 公式网

- **84,174 条公式边、158 条常数边、748 可达、117 无入边、36 无出边、32,771 环边**（859 节点）。

### 测试

- `r62-formula-matrix` 64 → 65 项；`r62-formula-units-full`（859 条，0 mismatch）；
  全量 **123 套 / 3,028 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.14.0] — 2026-11-19

**公式扩展：+39 条经典公式**（805 → 844）。

### 新增（全部为教科书经典式，不含经验拟合）

- 物理：洛伦兹变换、布拉格衍射、回旋频率、霍尔电压、交流有效值、串联 RLC 阻抗、品质因数、
  引力势能、轨道机械能、玻尔半径、里德伯波长、光子频率、点电荷势能、电容/电感串并联、KVL；
- 化学：道尔顿分压、亨利定律、朗缪尔吸附、赫斯定律、凝固点降低、沸点升高、比尔-朗伯；
- 生物：SIR 感染率、洛特卡-沃尔泰拉（猎物/捕食者）、莫诺生长；
- 天文：爱丁顿光度极限；地质：地震矩、达西地下水、曼宁流速；
- 经济：单笔现值、实际利率；统计：正态/泊松/二项分布、组合数。

### 口径

- 每条都带 `sources`（OpenStax 教材，标注「相关章节、未逐字比对」）与 `confidence: exact`；
- 被跳过的重复：`rayleigh_criterion`（已存在）；
- 公式网重建：**79,660 条公式边、157 条常数边、733 可达、117 无入边、36 无出边、28,452 环边**。

### 修复

- `binomial_pmf` 的 `comb` 改用阶乘式（mathjs 符号检查要求）。

### 测试

- `formulas-static` 15 项、`r62-formula-units-full`（844 条，0 mismatch）、`r64-formula-web` 21 项。
## [3.13.2] — 2026-11-19

**公式库体检**：调用缺陷 2 处、数据错误 4 处修复。

### 修复

- **`min(...)` 被单位替换成 `minute(...)`**（`solar_day_length`、`protein_energy_malnutrition` 必崩）：
  `unit-ambiguity` 的 `min` 后边界排除 `(`。
- **`minutes_per_page` 被英文别名归一成 `min_per_page`**（`copying_labor_per_book` 必崩）：
  `normalizeUnits` 对 ASCII 别名加整词边界。
- 光通量公式表达式错用角动量 `I*omega` → `intensity*solid_angle`（lm）。
- `carnot_efficiency` 参数标注「低温热源/高温热源」→「温度」；`magnetic_flux` 的 B「密度」→「磁感应强度」。
- 29 组同式重复统一参数 quantity 11 处。

### 文档

- 新增 `docs/公式体检.md`：检查项、修复清单、剩余限制、低可信公式处理原则。
## [3.13.1] — 2026-11-18

**公式重复条目与伪重复修复**（用户问「卡诺效率为什么没有上游」时查到）。

### 修复

- `carnot_efficiency`（与 `thermal_efficiency_carnot` 完全同式）的参数标注是「低温热源/高温热源」，
  无法归入温度组 → 网里没有入边；已统一为「温度」。网无入边 115 → **114**。
- `magnetic_flux` / `magnetic_flux_from_bt` 的 `B` quantity 标成「密度」→ 改为「磁感应强度」。
- `luminous_flux_from_intensity_angle`（光通量）表达式错用角动量的 `I * omega` →
  改为 `intensity * solid_angle`（lm），参数改为发光强度 / 立体角。
- 29 组同表达式公式（换场景命名产生的重复）统一参数 quantity 11 处。

### 说明

- 公式网只表达**数值依赖**（谁给参数）；理论推导来源（定律/定义/常数）不是网的入边。
- 无入边的 114 条是「输入型/恒等式/理论推导式」，不是缺上游；分类见 `docs/公式网.md`。
## [3.13.0] — 2026-11-18

**公式网闭合版**：输出物理量组 ↔ 下游参数组（同义词组 + 量纲），向上向下延伸成环。

### 变更

- 公式边 8,995 → **68,732**；从常数可达 624 → **696**；无入边 161 → **115**；无出边 → 38；
  检测到 **25,851 条环边**（速度↔加速度这类真实互引）。
- 用 **27 个物理量组**（力/能量/力矩/功率/速度/加速度/时间/长度/面积/体积/质量/密度/温度/压强/…）替代精确词表，
  组内同义词（力=载荷/重量/张力）可连，量纲校验防跨组误连。
- 数据文件改为紧凑数组格式（常数边 [常数,公式,参数]；公式边 [上游,下游,参数,组]）。

### 测试

- `r64-formula-web` 15 → **21** 项（边数/组数/环/源/汇）；
  全量 **123 套 / 3,027 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.12.0] — 2026-11-18

**公式网：从物理常数出发的全量依赖网**。

### 新增

- `src/data/formula-web.json` + `formulas query:"web"`：
  43 个常数节点、805 个公式节点、**144 条常数边**、**8,995 条公式边**；
  从常数可达 **624** 个公式，孤立公式 161。
  - 常数边口径：公式参数默认值 ≈ 常数标准值（相对误差 < 1e-6）；
  - 公式边口径：输出量 identity == 下游参数 quantity **且量纲一致**（受控词表 544 词）。
- 查询：`formulas query:"web"`（统计）/ `formulaFocus`（常数名或公式 id）/
  `webDepth`（默认 2）/ `webDirection`（down/up/both）/ `webLimit`（每层显示，默认 20）。
- 新增 `docs/公式网.md`（结构、口径、查询、局限）。

### 修复（数据标注，48 条）

- g/a 标成「速度」→ 加速度；omega → 角速度；弹簧 k → N/m；应力 → Pa；
  比潜热 → J/kg；摩尔质量 → kg/mol；换热系数 → W/(m²·K)；
  `cobb_douglas.A`「功率」→ 全要素生产率（无量纲）。

### 测试

- 新增 `r64-formula-web` 15 项：统计口径、从 G 向下、公式上下游、未知 focus、层限制；
  全量 **123 套 / 3,021 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.11.0] — 2026-11-18

**公式体系：链的物理量流（dataFlow）** + 单位歧义缺陷修复。

### 新增

- **6 条核心链建立 15 条物理量映射**：材料（Ashby 强度/许用应力/弯曲应力 ← 上游）、
  结构（惯性矩 → 挠度/屈曲）、能源（热损 → 锅炉功率、炉效 → 锅炉效率）、
  建筑（砖数 → 烧砖燃料）、生物（体表面积 → 扩散面积）、食物（总产 → 入储 → 可用粮 → 劳力）。
- **材料链重排**：自重弯矩移到弯曲应力之前（物理流顺向）。
- 新增 `docs/公式体系标准.md`：编排标准、判据（量纲 + 语义）、剩余 16 条链待办。

### 修复

- **`unit-ambiguity` 误改参数名**：`ha → hectare` 的替换未排除下划线，
  把 `area_ha` 改成 `area_hectare`，导致 `crop_total_yield` 调用必崩（r63 抓到）。
  边界改为「前后不接字母或下划线」；`area_ha`/`minutes_per_page` 保持，`5 min`/`L/min` 仍替换。

### 测试

- 新增 `r63-chain-flow` 28 项：结构合法性、四条链端到端传导、单位歧义回归；
  全量 **122 套 / 3,006 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.10.0] — 2026-11-18

**公式信源第二批（工程/社会）**：带 sources 的公式 371 → 497（46% → 62%）。

### 新增

- **Hibbeler《Mechanics of Materials》10e**（Pearson eLibrary 目录逐条抓取）：结构/材料力学 14 条；
- **Incropera《Fundamentals of Heat and Mass Transfer》8e**（Wiley 目录逐条抓取）：传热 8 条；
- **University Physics Vol 2 第 4 章**：热机/制冷循环 12 条；**Vol 1 第 14 章**：工程流体 5 条；
- **OpenStax《Introduction to Sociology 3e》**：社会 23 条（章节 slug 已验证）；
- 物理规则漏匹配约 50 条、生物生理/生态 17 条。

### 口径

- 仍未补 308 条：perception/engineering-process/military 等无对应教材；全量 **121 套 / 2,978 项全绿**。
  Callister/Hillier/地质 OER 的目录抓不到——按「不编造」保持空。
## [3.9.0] — 2026-11-18

**公式信源补全（搜索核实）**：带 sources 的公式 135 → 371（17% → 46%）。

### 新增

- 按「分类 + 关键词 → 教材章节」给 236 条公式补 sources：
  University Physics Vol 1/2/3（力学/热/电磁/光/量子/相对论/核）、Chemistry 2e、Biology 2e、
  Principles of Economics 3e、Introductory Statistics、Calculus Vol 1、Shannon 1948（信息论）。
- 章节页 slug 与标题**逐条抓取验证**（7-1-work、1-1-temperature-and-thermal-equilibrium、
  14-1-bronsted-lowry-acids-and-bases、44-1-the-scope-of-ecology 等，全部 200）。

### 口径

- confidence 一律 `scaling`；license 注明「教材引用，未逐字比对」——引用的是章节主题，不是逐字原文。
- perception/engineering/materials/military 等无对应教材的领域**保持无 sources**（不硬凑）。

### 测试

`formulas-static` 15 项通过（sources 完整性/confidence 合法/URL 格式）；全量 **121 套 / 2,978 项全绿**（test-report 已刷新）。
## [3.8.0] — 2026-11-18

**面状地形绕障**：`topology action:"avoid"`（绕山/绕湖/禁飞区）。

### 新增

- **栅格 A* 绕障**：输入 `fromPoint`/`toPoint`（{lat,lon}）、`obstacles:[[[lon,lat],…]]`、
  `gridKm`（分辨率，默认 2）、`safetyKm`（安全间距）、`planetRadiusKm`（架空星球半径）。
  输出绕行长度、绕行比、采样路径点；起点/终点落在障碍内明确报错。
  - 为什么自写：`@turf/shortest-path` 的距离用 `@turf/distance`（**地球半径写死**），
    架空星球不可配；自写约 200 行、零依赖。选型记录在 `docs/推演选型.md` 第九节。
- schema 补 5 个键；help 的 topology 节与示例清单补 `avoid`；SKILL 速查表补一行。

### 测试

新增 `topology-avoid` 10 项：直线基线、矩形绕行、安全间距、非法起点、行星半径缩放、示例清单。
全量 **121 套 / 2,978 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.7.0] — 2026-11-18

**生态承载力迁移 + 适用域补全**（功能深度检查的后续）。

### 修复

- **生态承载力从「简化公式」改为「地球实测 NPP 标定」**：
  旧版用「1% 光合效率 × 10% 占用 × 10% 收获」，1% 是叶片峰值；全球实际光能→碳只有约 **0.11%**
  （由地球 NPP 1.05e14 kg C/yr 反推），旧值因此高估百万倍。
  现在按「行星吸收能量 / 地球吸收能量」比例缩放地球实测 NPP，量级天然正确：
  地球默认 **65 亿人**（实况 80 亿同量级）。
- **可调项**：`meatFraction`（肉食比例，10% 法则：全肉食 8 亿人，全素食 80 亿人）、
  `humanUsableNpp`（人类占用比例）、`caloriesPerDay`（人均热量）——三者进 schema。
- **删除死代码**：根目录 `src/civilization.ts` 与 `src/ecosystem.ts` 在 v3 无任何引用；
  标定版生态迁至 `src/features/deduction/ecosystem.ts`。

### 新增

- **适用域**：给 37 条核心公式补「适用域：…」一句（172 → 176 / 805），
  输出层自动渲染【适用域】（不编造：desc 没写就不加）。

### 测试

- `deduction-derivation` 139 → **142**（生态与实况同量级、肉食 0→1 降 10 倍、半径 ×2 承载力 ×4）；
  全量 **120 套 / 2,968 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.6.0] — 2026-11-18

**数据深度补全**（功能缺口检查后的 P1/P2）：量纲标注、链传导、公式带单位全矩阵。

### 修复 / 补全

- **参数 `dimension`**：73% → **83.5%**（1,542 → 1,761 / 2,108）。从 desc 里的单位推导写入 **219 条**；
  3 条语义歧义（`carrying_capacity` 的 K 是容量符号、`work_function` 的 W 是功函数）跳过。
- **链的数值传导**：`dataFlow` 映射 1 → **3 条**——材料链第 7 步 `strength ← 第 5 步屈服强度`、
  建筑链第 7 步 `brick_count ← 第 6 步砖数`（其余步的参数是外部输入，不做机械映射）。

### 新增

- **公式带单位全矩阵**（`r62-formula-units-full`）：对**每条可执行公式**按参数量纲构造
  「数值 + SI 基单位」真的调用一次——805 条全跑、**0 个 `unit_mismatch`**、耗时 3.2s。
  这比 R62 建议的 60 条抽样强得多，能抓住任何「量纲标注与解析不一致」。

### 测试

- `formulas-chain-run` 11 → 16 项（新增两处映射的 linked 断言）；
- 新增 `r62-formula-units-full` 2 项（覆盖 805 条）；
- 全量 **120 套 / 2,965 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.5.0] — 2026-11-18

**R66 最终验收收口**：问题集成文档「未修 9 类」逐条复现后全部处理。

### 新增

- **公式分项（parts）**：公式数据可声明中间项。哈迪-温伯格现在输出
  `分项：p²=0.81、2pq=0.18、q²=0.01`，`value.parts` 三项（此前只给恒为 1 的总和）。
- **表达式结构复杂度预检**：三道闸——字符 ≤10000 / 运算符 ≤2000 / 括号深度 ≤200。
  9899 字符的 `1+1+…` 现在报「运算符过多」，而不是先撞「解析栈溢出」。
- **性能预警**：单次调用 ≥2s 时在 `notice` 里写「本次耗时 X 秒（规模较大），正常等待不是卡死」
  （recurrence 5000 期实测 5.3 秒）。

### 变更

- SKILL 边界表更正：复合单位 `kg/m^3` / `kg/m3` / `kg/m³` 三种写法实测都可用（旧标 ❌ 已过期）。
  help 的 evaluate/formula 节补「三道闸」与「分项」说明。

### 复现结论（未修 9 类）

| # | 结论 |
|---|---|
| 1–3 | consistency 科学计数/区间/百分比：3.4.0 已修，本轮验收通过 |
| 4 | 多步链：3.4.0 已修 |
| 5 | stats 100 万点：实测 **1.27s**（旧报告的 6.8s 不复现，≤3s 达标） |
| 6 | recurrence 5000 期：5.3s，**已加耗时提示** |
| 7 | 上限虚标：**已修**（结构预检 + 文档写清三道闸） |
| 8 | 哈温分项：**已修**（p²/2pq/q²） |
| 9 | backtrace：3.4.0 已修 |

### 测试

新增 `r66-final` 16 项；全量 **119 套 / 2,958 项全绿**（`test-v3/test-report.json` 已刷新）。
## [3.4.1] — 2026-11-18

**「教 AI 用的文档」精修**：功能描述与实际功能/声明对齐（测试员反馈“二者不一致”）。

### 修复

- **门面清单只留真实 operation**：移除 `sanity`（其实是 evaluate 的条目参数）、`alert`（从未实现）、
  `catalog/explain/invariants/examples`（是 help 的能力）——这些调用原先被门面放行后落到 internal。
- **playbook 的公式数 342 → 动态**（实际 805）；SKILL 与工具描述的 help 节数同步到 63。
- **help 补 6 节**：`chain`（链接/阈值/缩放/锚定四合一）、`data`、`document`、`world-map`、
  `audit`（units_audit + timeline_check）、`tools`（optimize/simulate/crosscheck/custom）；
  并给 `solve/formula/evaluate/world` 补合并别名 → **22 个原先查不到的 operation 全部可按名查**。
- **管道串清除**：SKILL 的 14 处 `action:"model|route|…"` 与 help 的同类写法改成可复制的单值
  （AI 照抄整串必失败）；`astro` 节参数名拼写 `precison` → `precision`。

### 测试

**118 套 / 2,940 项全绿**。新增 `r62-doc-consistency` **90 项**：数字一致、门面自洽、operation 覆盖、每节可按 key 取全文、
关键术语三处一致、help 示例可运行、无管道串。
## [3.4.0] — 2026-11-18

**R61/R62 增量测试与官方自检落地**：7 条真缺陷全部收口，新增 5 套 156 项守护。

### 新增

- **help 第 56 节「拓扑与工程校核」**：`helpTopic:"拓扑"` 走**别名精确命中**返回全文（原先甩弱匹配搜索）。
- **`equivalent`（当量）**：1 当量 = 1 mol；`吨标准煤` 补进 tce 别名与引擎手动表。
- **公式库 805 条**：新增 `solar_luminosity`（太阳光度 3.828e26 W，带 sources）。
- **反向守护**：`solar_luminosity` / `thermal_radiation` / `potential_gravity` 均可按名命中（别名机制）。

### 变更

- **多步链**：批量 `expressions` 共享作用域，`u=5 → u*3 = 15`（help 早已承诺，实现缺失）。
- **`consistency` 形态归一**：科学计数（1e12）、百分比（÷100）、倍、单位换算（km/m、MJ/kg）、区间（50-60）与负区间；
  判定用归一值 + 区间相容；正负号相反仍直接算冲突。
- **`backtrace`**：keys/name 为强索引（单字只看 keys），双字词表过滤长句伪词；低分或无强匹配时明确说「没找到」。

### 修复

- `helpTopic` 只认 key → 支持别名整词（`拓扑`/`单位` 等中文名可取全文）。
- `equivalent` 的短别名 `equiv` 会把 `equivalent` 拆成 `equivalentalent`（短别名拆长词坑），已移除。
- 公式条数从 7 个测试文件的硬编码改为「≥800 + 结构自洽」，加公式不再连锁改测试。

### 测试

**117 套 / 2,850 项全绿**；新增 `r62-declaration` 27、`r62-consistency-forms` 27、
`r62-units-unregistered` 23、`r62-formula-matrix` 64、`r62-quality` 15。
复现与缺口详见 `docs/R61-R62测试自检.md`。
## [3.3.0] — 2026-11-18

**R58–R60 模拟推演 + 144 类问题表复现**：9 个根因、50 条数据修正、36 项新守护。

### 新增

- **公式别名检索**：`formula` 支持按 keys 整词命中（`thermal_radiation` → `stefan_boltzmann`、
  `potential_gravity` → `potential_energy`）；dispatch 与 callFormula 共用 `findFormula`，不再两处漂移。
- **公式库 804 条**：新增 `rocket_equation`（齐奥尔科夫斯基方程，带 sources 与 confidence）。
- **批量锚点 `sanity`**：`expressions` 条目支持 `{max,min,expect,note}`；逐条比对并给
  `⚠ 超出锚点上限 1e10（…） 达 100 倍`，`value.items[].sanityStatus` 为 passed/violated/unknown。
- **两词英文单位别名**：`nautical mile` / `nautical miles`（`nmi`/`海里` 原有）。

### 变更

- `consistency`：支持 `-`/`−`/`－`/`负`/`+` 前缀；判冲突改用绝对值算倍数，正负号相反直接算冲突。
- `units` 代入过程按量纲改写成 SI 基准（`1 MJ/kg = 1e+6 m^2 / s^2`），不再暴露 `raddose` 内部代号。
- `backtrace`：领域单字 + 停用词 + keys 加权；「这座窑一天烧多少煤」第一命中改为窑炉热平衡。

### 修复

- **公式参数量纲/量名 33 条**：气体常数 15、比热容 8、导热系数 5、截面宽 4、扩散系数 4、升温速率 1。
- **输出单位换算 8 条 expr**：kiln_firing_time（7.2 h）、reactor_residence_time（2 h）、
  adsorption_breakthrough、oxygen_depletion（10.5 min）、gear_geometry（40 mm）、
  admin_radius_from_info（100 km）、hardness_yield_generic、gear_contact_stress（219 MPa）。
- `kiln_heat_balance.unit` MJ → **kJ**；`ware_specific_heat` 描述改 J/(kg·K)。
- `potential_energy.g` 量纲从速度改为加速度（desc 写的是 m/s²）。

### 测试

**112 套 / 2,694 项全绿**；新增 `r58-r60-fixes` 36 项；`test-v3/test-report.json` 已刷新。
复现与根因详见 `docs/R58-R60复现结论.md`。
## [3.2.0] — 2026-11-18

**批量调用（calls）**：一次工具调用可提交多条，不再让 AI 逐条发工具调用。

### 新增

- **`calls` 批量**：`{calls:[{operation,...},...]}` 顺序执行、逐条独立报错、一条失败不中断；
  单次上限 50 条；条目禁止嵌套 `calls`；外层 `precision`/`displayPrecision` 继承、条目可覆盖；
  `saveAs` 只在条目内生效。结果同时给分段文本与 `value.results[]`（含每条的 ok/operation/result/error）。
- **选型文档**：`docs/批量调用选型.md`（MCP 2025-06-18 / 2025-11-25 两版 schema 无 batch 的实测，
  JSON-RPC 2.0 batch 语义，以及为什么放在参数层而不是新增 operation）。
- **机器可读测试报告**：`npm run test:report` 逐套运行并写 `test-v3/test-report.json`——
  给测试员 AI 的参考文件（summary / howToRun / conventions / 每套 title+purpose+项数+耗时+复现命令）。

### 变更

- `evaluate.expressions[]` / `formulas.formulas[]` 保留为**专用批量**（每条更短、带领域字段），
  `calls` 作为跨 operation 的通用入口。
- 工具描述与 skill 增「多组结果一次交」；工具描述里 help 节数说明从 12 修正为实际的 55。

### 测试

**111 套 / 2,657 项全绿**；新增 `tool-batch` 41 项（与单条逐字等价、部分失败、未知 op、
嵌套、空/超限、参数继承、部分失败渲染、world notice 保留）。
## [3.1.1] — 2026-11-18

**「单位覆盖」批次**：中文写法 78 → 488（96.4%）→ 641 条，非 ASCII 符号单位全部可换算；
同时修掉 R49 / R51 / R52 / R53 轮测试暴露的边界缺陷与 52 个被静默忽略的 schema 键。

### 新增

- **单位中文写法**：从 `units.json` 自动生成别名表（`autoCjkAliases` + `registerDataUnits`），
  中文名注册成 `cz<hash>` 合成名并保留 factor（`担` = 50 kg，不再被算成 1 kg）。
  非例外单位覆盖率 78 → 488（96.4%）；随后合入 GNU units / pint 筛出的 92 条英文别名、
  中文词典核实的 8 条、搜索收录并逐词核实的 22 条，最终 **641 条中文写法**。
- **非 ASCII 符号单位**（°C / °F / °R / °Ré / Ω / kΩ / MΩ / braça / sążeń / łokieć / deg² 等 28 个）：
  符号归一 + 变音符号折叠。
- **温度中文名**：`degC` / `degF` / `degR` 承载「摄氏度 / 华氏度 / 兰氏度」——
  `100 摄氏度 → degF` 由 −279 修为 **212**。
- **常用符号**：`kn` / `kcal` / `cal` / `kWh` / `GJ` 等 18 个补齐，并加 `unit-symbols` 守护
  （提示词里承诺的例子必须有测试）。
- **地形十种**：ocean / sea / ice / volcano / gas / urban / hive / cave / sky / space；
  `world` 接入局地气候（`describeTerrain` 原为死代码），真空与气态不输出无意义的陆地气候量。
- **schema 补键**：52 个被静默忽略的键（starMass / starTemp / orbitAU / ledger 等）补齐；
  恒星别名归一，未知参数给出提示。

### 变更

- **单位策略转向**：提示词要求优先国际符号（`kn` / `degC` / `kcal` / `GJ`），中文别名降为兜底
  （见 `docs/单位策略-优先国际符号.md`）。
- **撤销 3.2 贸易网络**：用户判定方向不成立。

### 修复

- **单位别名**：补 7 条中文别名（石 / 节 / 牛顿 / 摩尔 / 吨标煤 / 摄氏 / 平方英尺）；
  `createUnit` 逐条 try（原一条失败吞掉后面，`tce` 静默消失）；别名后边界判汉字
  （修「石炭」被拆成 `1 cndan炭`）；修 `knot → kn` 子串误伤、`ohm/Ω` 循环、`degC` 误挂 `K`；
  pressure 单位标注改回 `Pa`。
- **R49**：`eigen` 对非对称矩阵回落 `eigs`；`system` 支持 `equations` 写法；
  `recurrence` 状态名从表达式推断；`solve` 多未知数改报「多组解」。
- **R51**：空表达式不再假成功（`missing_params`）；栈溢出改判「表达式太复杂」并截断原文；
  `sensitivity` 用默认模型时明说；区间反序不再静默交换。
- **R52**：拓扑反向重复边按无向去重（原崩 internal）；无坐标时提示总长不可信；
  经纬度越界校验（原会算出 15,127 km）。
- **输出**：出口统一清理 `undefined`（修 R48 的 ledger 致命错误与 `[object Object]` 次生现象），
  并加无损性守护。
- **对账**：`consistency` 支持中文大写数字（壹仟贰佰 → 1200）；主体字符集排除数字汉字；
  指代型主体丢弃并明确告知；段号不再输出 `undefined`；成本与售价不再误判为同一量。

### 测试

**110 套 / 2,616 项全绿**；`doccheck` / `preflight` 通过。新增 10 套：
`unit-coverage`、`unit-symbols`、`terrain-kinds`、`schema-coverage`、`output-lossless`、
`r49-fixes`、`r51-boundaries`、`r52-topology-dirty`、`r53-units-pressure`、`consistency-cn`。
