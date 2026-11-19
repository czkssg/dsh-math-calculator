# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

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

## [3.1.0] — 2026-11-16

**「硬核推演」批次**：把天文、封闭系统、历史推演、工程校核、优化、系统动力学
全部接成一条链，并把分散的数据存储收敛为统一数据层。operation 从 45 增到 61。

### 新增

- **天文（`astro`）**：真实地球历表（日出日落/太阳高度/月相）、任意天体开普勒轨道、
  双星、行星系统（希尔球/洛希）、引力与相对论（史瓦西/ISCO/时间膨胀/红移）、
  历法推导与换算、观测精度→科技（望远镜/六分仪/航海钟/圭表/历法漂移）。
  依赖 `astronomy-engine`（MIT）。
- **封闭系统**：避难所/生物温室日需求（`enclosure`）、闭环自持上限与故障小时数
  （`closed-loop`）、多舱段连通与泄漏（`compartments`）、千万级舱室网络
  （`megastructure`）、海绵状小空腔（`sponge`）。
- **历史推演**：确定性 PRNG（LCG）、冲突/贡赋（`conflict`，Axelrod 模型）、
  纪元划分与危机（`history`）、分支对照（`diverge`）。三者可一站式串联。
- **工程校核规则表**（`topology` 的 `kind`）：建筑、载具、舰船、太空舰船、太空建筑、
  避难所、温室、闭环、舱室网络、海绵、机械、液压/气动、多级传动、热工、电气、流体。
  规则表在 `src/data/topology-assessments.json`，新增类型只改数据。
- **优化（`optimize`）**：线性/整数规划（`javascript-lp-solver`，Unlicense）。
- **系统动力学（`simulate`）**：存量/流量欧拉演化（人口-资源-捕捞），给时间序列与拐点。
- **目标回溯（`backtrace`）**：先匹配模型链（9 条，world→人口→财政、文明→历史等），
  未命中回落公式链；输出链、缺参、可执行调用序列。
- **完整世界编排**：`world` 的 `profile:"full"`——骨架→可耕土地→承载力→百年人口→
  粮食上限→疆域半径→舱室需求，并给出**瓶颈**。
- **跨模块对账（`crosscheck`）**：5 项同一物理量两份实现比对（逃逸速度/一年天数/
  排水量/耗氧/人口）。
- **统一数据层（`data`）**：记录/版本/查询/全文检索/血缘/统计/导入导出/压缩/迁移；
  任意 operation 可加 `saveAs` 自动入库。
- **三类门面**：`calc`（数值公式）、`derive`（推演对账）、`manage`（帮助工作区）。
- **历法换算**（日期↔年日）与**后勤时延**（疆域半径上限）。
- **公式库 757 → 803**（建筑/舰船 16 条、机械 14 条、封闭系统 14 条、居住密度/生长能量等）。
- **单位**：本地单位全维度注册进 UCUM（820 个）、古代/传统单位穷举 201 条（22 个文明）。

### 变更

- **功能合并**（旧名保留为单向别名）：`quick_feasible`→`feasibility(quick)`、
  `world-build`→`world(profile:"full")`、`formula-table`→`formulas(query:"table")`、
  `world_state`→`data` 的 `kind:"setting"`。
- **数据层统一**：变量/常数/自定义公式/实体类型/设定库/推演归档/拓扑模型五处存储
  收敛到 `<workspace>/.artifacts/datastore/`；旧文件首次读时自动导入。
- **帮助与技能文本精修**：skill 速查表按门面重排（19,958→14,425 字符），
  help 补 6 个章节（astro/history/conflict/diverge/backtrace/facade），49→55 节。

### 修复

- **错误结构化**：语法错从 `internal` 改为 `syntax`；未知 operation 从 THROW 改为
  `invalid_argument`；8 类失败全部带 `{type,message,hint}`。
- **world**：小行星 `planetMass` 下限放到 1e-6；小值重力显示改科学计数（0.00g→2.20e-3g）。
- **balance**：跨量纲改为分项盘点（最短板按覆盖率比）；速率单位归一（吨/年、m^3/年）。
- **公式**：结果单位 UCUM 自检（`unitValid/unitUcum`），描述性单位不误报。
- **数据层**：修正重复 `datastore` 子目录；归档读取按版本升序（原来 compare 取错最新版）；
  设定库列表改从数据层取。
- **对账发现**：ship 排水量 t vs 公式 kg（差 99.9%）、一年天数 秒 vs 天（换算方向反了）——
  两处口径冲突已修正并纳入 `crosscheck` 守护。

### 测试

**97 套 / 2,401 项全绿**；`doccheck` / `preflight` 通过。新增套件：`astro`、`orbit`、`system`、
`gravity`、`calendar`、`astrotech`、`world-calendar`、`enclosure`、`closure`、`megastructure`、
`sponge`、`mechanism`、`hydraulic-train`、`physical-systems`、`optimize`、`system-dynamics`、
`backtrace`、`model-chains`、`history-prng`、`conflict`、`diverge`、`history-sim`、`data-store`、
`data-store-advanced`、`crosscheck`、`world-build`、`dedupe`、`facade`、`error-structure`、
`r44-fixes`、`run-log`、`topology-examples`、`topology-engineering`、`assessment-rules`。
## [3.0.0] — 2026-11-13

**v3 重写（rewrite/v3 分支）**。这一版把实现按「数据 / 功能 / 入口」三层重排，
功能与输出契约保持不变，测试从 14 套扩到 42 套。

### 新增

- **入口分层**：`dispatch.ts`（45 个 operation 路由）+ `tool.ts`（schema/execute/render）；
  `index.ts` 保留老实现作回退，但工具入口已切到新层。
- **新 operation**：`chain`、`threshold`、`scaling`、`anchor`、`quick_feasible`、
  `hierarchy`、`world_state`、`units_audit`、`timeline_check`、`extract_numbers`。
- **实体拓扑**（`features/topology/`）：距离/最短路径/视线/可达预算、建筑与载具容量、
  七条通用规则（闭合/对称/无环/可达/容量/连续/一致）。
- **公式库**（740 条，原 665）：
  - 结构化：65 条补单位、4 条展示式标记（求值时报「展示式」而非语法错）；
  - 静态校验：665→740 条全部过 parse/符号/单位/sources 检查；
  - **反解**（`solveFor`）：符号解 + 数值兜底 + 代回验证，多解/无解明确报告；
  - **公式即函数**：参数契约（必填/默认）、缺参报错、调用结果带相邻公式；
  - **关系图**：按共用物理量（`quantity` 量名，525 个）、共用常数、同标签连边，40,794 条边；
  - **符号量名注释**：同名异义（如 `n`：物质的量 vs 数量）连上但标注。
- **权威信源体系**：`docs/公式信源体系.md`（NIST CODATA/DLMF、OpenStax、MIT OCW 等，
  含实测可达性）；新增 75 条公式带 `sources`（教材章节 + URL + 许可 + 访问日期）。

### 修复

- `noonElevation` 北半球冬至返回夏至值（45°N 68.44° → 21.56°）；
- `feasibility` 字符串单位被静默丢弃、未知 id 假通过；
- `chain` 断点用累计占比（永远判末段）→ 改增量占比；
- `scaling` 强度指数缺省 0；
- `algebrite` 特征值输出带省略号导致 `eig` 假失败；
- 德拜低温热容系数 `9R` → `(12π⁴/5)R ≈ 233.8R`（偏低约 26 倍）；
- `doccheck` / `preflight` 历史遗留（5 个 core 文件缺 `@module`、graph.ts 常量无注释）。

### 测试

42 套 / 1,756 项全绿（含新增 `skills` 同步检查 39 项）。

## [2.3.25] — 2026-11-10

**`derivation` 缺参数提示：从「一句话」改成「照着做」。**

### 问题

6 个子命令在缺参数时只回一句话：

```
backSolve  70 字符「缺参数：anchor（锚点 id）与 anchorValue」
impact     21 字符「需要 traceTarget（要改的量名）」
compare    24 字符「缺 compareFrom（起始版本，如 v1）」
diff       21 字符「需要 diffA 与 diffB 两张表名」
```

用户看完仍不知道该填什么，尤其：

```
① anchor 是驼峰 id（creatureHeight），拼错就找不到
② traceTarget 必须是依赖图里的节点名（76 个里的一个）
③ compare 需要先 archive 一版，而新工作区根本没有版本
④ diffA/diffB 其实是工作区名 —— 原提示写「表名」是错的
```

### 第 ④ 条是实质错误，不只是提示不足

读 `diffTables` 的实现：

```ts
const names = listWorkspaces().map(item => item.name)
if (!names.includes(aName)) return { message: 'A 表不存在' }
```

它比对的是**两个工作区**。用户按「表名」去填七张推演表的名字
（「项目卡」「变更清单」…）**必然失败**。已改为「两个工作区名（不是七张表的名字）」。

### 修法：给真实候选 + 可复制调用 + 前置条件

**① backSolve** —— 直接列出现有锚点：

```
需要两个参数：
  anchor      锚点 id（驼峰，如 creatureHeight）
  anchorValue 你想要的叙事值（正数）

  {"operation":"derivation","derivation":"backSolve","anchor":"creatureHeight","anchorValue":50}

可用的 anchor（共 4 个）：
  creatureHeight · flyingCreatureMass · buildingHeight · mountainHeight
```

**② compare** —— 先查有没有版本，没有就直说该先做什么：

```
这个工作区还没有归档版本，无法对比。
先存一版：{"operation":"derivation","derivation":"archive"}
改点东西后再存一版，然后：{... "compareFrom":"v1"}
```

**③ impact** —— 从依赖图取真实节点清单：

```
需要 traceTarget（要改的量名，须与依赖图里的节点同名）
可查的量（共 76 个，前 12 个）：hbar · h · R · kB · NA · mu0 · epsilon0 · c · …
```

**④ diff** —— 纠正说法并给出工作区情况。

### 关键判据：提示里的每个示例都必须真能跑

否则就是把用户从「不知道填什么」变成「填了报错」—— 比原来更糟。

新增 `test/derivation-hints.mjs`（28 项），核心断言：

```
从提示文本里抽出 JSON 示例 → 直接拿去 runMathTool → 断言 ok
清单里出现的第一个节点名 → 拿去查 → 断言真的存在
```

**实测确认**：`backSolve` 与 `impact` 的示例都真能跑通。

### `graph` 与 `fantasy` 检查后未改

- `graph` 已有真实数据（节点 40 / 连线 62 / 4 层）+ 指向 `value.graph`
- `fantasy` 已有完整字段说明、三种 source、永动机禁令提醒（218 字符）

测试里加了断言防止将来把它们改坏。

### 状态

| 指标 | 之前 | 之后 |
|---|---|---|
| 测试 | 121 套 / 5893 项 | **122 套 / 5921 项** |

---

## [2.3.24] — 2026-11-10

**审视 29 份实践文档，修掉 3 处「半修」缺陷 + 1 处检索误导。**

### 方法：先核对文档，再逐条实测

读了全部 29 份实践文档（11 份已采纳、2 份未采纳、16 份 docs）。重点是两份**未采纳**的：

- `math_execute_问题与建议.md`（8 个问题）
- `工程公式缺口与公式库扩展建议.md`（36 条建议）

**逐条实测后，8 个问题分化了：4 个已修、3 个半修、1 个是设计取舍。**

### 缺陷① `sanity` 越界时 `items[].ok` 仍是 `true`

```
{expr:'999999', sanity:{max:1000}}
→ items[0].ok = true            ← 越界了却说成功
→ magnitudeWarnings: 1          ← 数字在，但说不出「是哪一条」
```

程序化调用方只看 `ok` 会认为这条通过。

**修法：新增 `sanityStatus` 字段**，而不是改 `ok`：

```
ok: true,  sanityStatus: 'violated'   ← 算对了，但越过你给的锚点
ok: false, error: 'non_finite'        ← 根本没算出来
```

理由：`ok` 的语义是「算得出来吗」，锚点越界是「算了但不符合判据」。
混为一谈会让调用方以为公式算错 —— 而本工具最核心的性质就是「不猜判据、只比对」。

没给判据的条目不写该字段（「没检查」≠「检查通过」）。

### 缺陷② 批量失败时顶层拿不到失败原因

顶层 `error` 保持 `undefined` 是**有意的**（避免「某条错」被读成「整批错」）。
但调用方确实拿不到汇总 —— 只能读中文或翻 `items[]`。

**修法：新增 `errorTypes` 汇总**，不动 `error` 语义：

```
errorTypes: { non_finite: 1, unknown_symbol: 1 }
```

### 缺陷③ 提示词让 AI 找不存在的标签

```
world      → 输出 [量级] [精确] [仅方向] ✓
evaluate   → 0 次命中                    ✗
```

提示词原文写「`[精确]/[标度]/[量级]/[仅方向]` 是可信度标签，引用时保留」——
但最常用的 `evaluate` 从不输出这些。

**修法：说清适用范围**（不是给 evaluate 硬加标签，那对纯算术是噪音）：

```
· 可信度标签 [精确]/[标度]/[量级]/[仅方向] 只在推演类（world/derivation）出现；
  evaluate/formula 只给 (~10ⁿ) 量级附注。
```

提示词 897 字符（上限 900）。**压缩时撞破两条原有断言**（「选 operation 段必须最长」），
选择压缩内容而非放宽限制。

### 缺陷④ ★ 检索「假装有结果」

实测发现两个标本：

```
query="作用量"  → 11 条，首条「两平行导线间的作用力」   ← 整串零命中
query="机械"    → 5 条，首条「指数分布的均值」         ← 命中的是 desc 里「机械件的磨损不是」
```

根因是中文滑窗把「作用量」切成「作用」「用量」，各自命中了别的公式描述。

**危害不是「排序不好」，而是「看起来像有」** —— 用户以为库里有这么多相关内容，
逐个点开才发现全不相干，**于是不会去补那条真缺的公式**。
（本项目一贯原则：假关系比没有关系更糟。检索层面同理。）

**修法：区分标注，不假装**：

```
有精确：匹配 "齿轮" 的公式（5 条，前 3 条精确命中）
无精确：⚠ 没有精确匹配 "作用量" 的公式；以下 11 条只是描述里出现了相近的词
```

不直接返回空 —— 子词结果仍有参考价值（用户可能记错词），但必须**显式降级**。

### 顺带确认一个真缺口

`作用量 S = W×T`（实践文档 M1，称「02 卷全书的决策框架」）**库里确实没有**。
之前被模糊检索掩盖了 —— 现在检索诚实了，缺口才看得见。测试里留了一条断言让这个缺口保持可见。

### 已被修复的（对照文档）

| 文档问题 | 现状 |
|---|---|
| 2.1 label 里的「万」触发警告 | ✅ 已修（实测 0 误报） |
| 2.3 precision 调低静默算错 | ✅ 已修（有 notice 明确警告） |
| 2.7 workspace 变量累积无提示 | ✅ 已修（列出变量名） |
| 2.8 world 缺分级标注 | ✅ 已修（【推导链】+【模型可信度】） |
| 2.2 evaluate 不做量纲检查 | ⚠️ **设计取舍**：裸数字无法判断量纲，工具不该猜 |

### 状态

| 指标 | 之前 | 之后 |
|---|---|---|
| 测试 | 119 套 / 5851 项 | **121 套 / 5893 项** |
| 提示词 | 897 字符 | 897 字符（内容换了，长度守住） |

---

## [2.3.23] — 2026-11-10

**重构：消除 34 处跨文件重复，修掉 4 个静默覆盖的公式 id。**

按用户要求「检查插件代码，参考成熟开源方案重构」。先做诊断再动手。

### 诊断结果

```
117 个 .ts 文件 / 54341 行
最大文件 src/index.ts 5305 行（但无重复代码，是 50 个函数的平铺集合）
跨文件重复片段：34 组
```

### ① 数字格式化：7 个文件各写一份

这是最大的重复。各文件阈值与位数都不同：

```
anchor-solve / summary   fmt    ≥1e6 或 <1e-2 → exp(2)，否则 prec(3)
pipeline                 fmtNum ≥1e5 或 <1e-2 → exp(2)，否则 prec(4)
custom-op / derivation   sci    ≥1e5 或 <1e-3 → exp(3)，否则 prec(5)
units-op / units         show   ≥1e15 或 <1e-4 → exp(4)，否则 prec(6)
param-units              fmt    ≥1e6 或 <1e-3 → exp(3)，否则 prec(4)
```

**为什么不用 d3-format**（周下载 1 亿、0 依赖的成熟库）：

```
① 本项目非有限值显示 —，d3 显示 NaN
② 指数阈值是硬阈值，d3 的 ~g 是「有效位数」语义，行为不同
③ 51 处测试锁定这些输出，换库会连锁破坏行为契约
```

所以**学它的接口设计（单一职责、可参数化），不学它的实现**：
新增 `fmtNumber(value, opt)` + 三个语义化包装（`fmtShort`/`fmtSci`/`fmtShow`），
7 处变体全部改为调用。行为逐位不变（118 套测试验证）。

### ② planck：两处硬编码物理常数

`sky.ts` 与 `stellar.ts` 各有一份**完全相同**的 `planck`，且都在函数里写死
`h = 6.62607015e-34`、`c`、`k` —— 而 `CONSTANTS` 里都有。

若哪天改 α 联动常数，这三处会**静默不同步**。已收进 `core-physics.planckRadiance`。

### ③ 量纲顺序清单：抄了一份 30 项数组

`ops/units-op.ts` 复制了 `units-data.ts` 的完整 `DIMENSION_ORDER`。
后果：新增量纲时若只改 `units-data`，**单位清单里看不到它**，且不报错。

### ④ world 顶层参数：两处抄同一份

`derivation-op` 与 `feasibility-op` 各自写了一遍
`['planetRadius', 'planetMass', 'rotationHours', 'obliquityDeg']`。
加一个新便捷参数时只改一处，两个操作就会对同一份输入给出不同结论。

已抽成 `shared.WORLD_TOP_LEVEL_KEYS` + `mergeWorldArgs`。

### ⑤ ★ 4 个公式 id 被静默覆盖（最严重）

```
spring_energy        formula-library.ts  ← 被覆盖，永不加载
                     formula-library-basic.ts  ← 实际生效
lc_resonance         同上
thermal_stress       formula-library.ts  ← 被 formula-library-story.ts 覆盖
city_wall_perimeter  perception.ts       ← 被 story2.ts 覆盖
```

`FORMULA_INDEX.set` 是「后者覆盖前者」，**没有任何报错**。
症状：按名字查「弹簧势能」查不到，`FORMULAS.length` 比预期少 4 —— 但少 4 没人会注意。

已删除 4 条重复副本（保留原版，内容完全相同），公式数 669 → **665**。
新增 `test/formula-integrity.mjs`（9 项）守：id 唯一、INDEX 与数组一致、字段完整。

### ⑥ 分隔符解析：两个版本行为不一致

`ode.splitOdeEquations` 认 `{}`，`systems.splitEquations` 不认。
同一份输入（含 `{}`）在两条路径上拆出不同结果。已统一由 `systems` 承载。

### 结果

| 指标 | 之前 | 之后 |
|---|---|---|
| 跨文件重复片段 | 34 | **3**（剩余均为 import 语句等合理重复） |
| 重复公式 id | 4 | **0** |
| 公式库 | 669 | **665**（删 4 条重复副本） |
| 测试 | 118 套 / 5842 项 | **119 套 / 5851 项** |

改动：23 文件，+278 / −209 行。

### 一条自我提醒

补 `doccheck` 时连续被挤掉 7 处导出注释（我插入代码时覆盖了相邻的 JSDoc）。
这是本项目第二次犯同类错误（历史记录里也有）。
教训：**改完 src/ 立刻跑 doccheck**，它会逐一点名，比事后用正则修补可靠。

---

## [2.3.22] — 2026-11-10

**多步推演：把规则写进提示词，让 AI 按工具的真实接口串调用。**

用户要的是「每个值在运算中变成不同物理量，带标记进入下一个算式，直到跑完」。

### 我先试了做成自动执行器，实测失败

我写了 `src/chain-runner.ts`（约 400 行），尝试让工具内部自动跑完一条链。结果：

```
22 条链 / 259 步，只有 9 步声明了依赖（3.5%）

sys-energy  19 步  0 条依赖
sys-travel  15 步  0 条依赖
sys-military 8 步  0 条依赖
```

打开能源链看：窑炉热平衡、锅炉煤耗、卡诺效率、制冷 COP、储热、导热、泵功率、
扩散、蒸汽、辐射、RC 滤波、风功率、水轮机 —— **这些是并列主题，不是依赖链**。

**「链」目前是主题分组。** 让一条并列清单顺序执行，只会得到一堆相互无关的数。
执行器已删除（不留死代码）。

### 改用：规则进提示词

「先算什么、把哪个输出喂给哪个参数」这个判断**工具做不了，必须 AI 做**。
所以把规则写进系统提示注入（`brief` 与 `full` 两档都写）：

```
**多步推演：把上一步的输出喂给下一步**
· 拿输出：value.answer 是全精度裸数，value.unit 是单位（如 m/s^2）
· 下一步的 overrides 直接写这个数；带单位的字符串也行：{g:"9.82 m/s^2"}
· 换单位不必手算：{g:"9.82 m/s^2"} 喂给要 N/kg 的公式，工具自动换算
· 先查链条：formulas query="sys:sys-energy" 看这一步该接谁
· ⚠ 链条是主题分组，不是严格依赖 —— 顺序要你自己判断，别机械照抄
```

最后一条尤其重要：**不说清楚，AI 会机械顺序执行 19 步并列主题。**

### 提示词承诺的每件事都必须实测可用

新增 `test/multistep-prompt.mjs`（23 项）。最有价值的是这一节：

```
提示词说「带单位的字符串也行」→ 实测 {g:"9.82 m/s^2"} 可作输入 ✓
提示词说「换单位不必手算」    → 实测 N/kg 与 m/s^2 得到同一结果 ✓
提示词说「value.answer 是裸数」→ 实测 Number() 可解析，且 unit 单独给出 ✓
```

**若提示词写了一个不支持的接口，AI 会照写然后失败 —— 那比不写更糟。**

测试里还有一个真实的三步串联范例（M/R → 重力 → 山高 → 直减率），
验证「输出 → 下一步参数」这条链真的能跑。

### 顺手修正：量纲判断改用 mathjs

之前我手写了 400 行 `composeDimension` + 一张 KNOWN 表（用户提醒「先去 GIT 查现成的」）。

**mathjs 本来就提供 `dimensions` 向量，项目早已依赖它**：

```
'm/s^2' → [0,1,-2,...]
'N/kg'  → [0,1,-2,...]   ← 自动认出是同一个量纲
```

我手写那张表**根本认不出 `N/kg` 与 `m/s^2` 等价**。已改为 mathjs 实现，代码 400 行 → 90 行。

复合单位识别能力（实测）：

```
m/s^2 ✓  N/kg ✓  kg/m^3 ✓  W/m^2 ✓  mol/L ✓  Pa*s ✓  J/K ✓  N*m ✓
```

### 一处诚实交代

搜过 npm（`js-quantities`、`dimensional`、`convert-units`）与 GitHub，没有能直接替换的 ——
它们解决「解析单位字符串」，而我卡的是「从中文描述里把单位抠出来」（NLP）。
部分确实要自己写，但只需 20 行归一化，不是 400 行。

### 状态

| 指标 | 之前 | 之后 |
|---|---|---|
| 测试 | 117 套 / 5819 项 | **118 套 / 5842 项** |
| 提示词 | 691 字符 | **963 字符** |
| 删除 | — | `chain-runner.ts`（未接入且实测无效） |

---

## [2.3.21] — 2026-11-10

**把公式库与世界观推导耦合起来。** 这是用户最初的诉求（「自动通过公式推导出整个世界」），
也是本项目一直存在的结构性缺口。

### 问题：两边各算一套，数字碰巧一致

实测确认：

```
grep -c "formula" src/world.ts  →  1（那唯一一处是 import CONSTANTS 常量表）
```

**`world.ts` 完全不引用公式库。** 它自己算 surfaceGravity / escapeVelocity /
maxMountainHeight…，而公式库里也有同一批公式。

当前数字一致（实测对账 4 项全对），但那是**因为当初抄对了，不是结构保证一致**。
本项目已经吃过一次同类的亏（README 写 404 条而代码 442 条）。

### 为什么不能直接让 world import 公式库

两个原因，实测都踩过：

```
① 重量：formulas.ts 会拉进 631 条公式与 mathjs 全依赖，而 world 只需 4 个算式
② 口径：building_height_limit 的 strength，world 用 1.3e8（由 α 推出），
        公式库默认 2e8 —— 算出的山高差 54%（4.9 km vs 7.54 km）
```

若直接让 world 调公式库，就得把「α → 材料强度」那条链也搬进去，
而它依赖 `provenance.ts` 与 `constants-graph.ts` —— **会形成双向依赖**。

### 做法：抽一层零依赖的纯函数（单一数据源）

新增 `src/core-physics.ts`：11 个纯函数，**零依赖**。

```
core-physics.ts（本文件，纯函数）
     ↑                    ↑
world.ts            formula-library.ts
（推演用）           （对外暴露成公式）
```

依赖单向：两边都指向它，它不指向任何人。**改一处，两边同时变。**

替换了 world 里的 8 处重复实现：

```
meanDensity / surfaceGravity / escapeVelocity / stellarLuminosity
orbitalPeriod / orbitalVelocity / centrifugalRatio / buildingHeightLimit
```

### 为什么公式库那边不换成函数

公式库的公式是 **mathjs 表达式字符串**（`'G * M / R^2'`），不能调函数。
所以「函数 + 字符串」必然是两份文本 —— **这时候靠断言把它们钉在一起**：

新增 `test/core-physics-parity.mjs`（25 项）：
- 逐项验证「函数值 == 公式库 expr 值」
- **改参数再验一次**（火星/木星/虚构星）—— 单点一致可能是巧合，形式相同才会继续一致
- **已知物理事实做锚**（地球重力 9.8、逃逸 11.2、公转 365.25 天、太阳光度 = Lsun）
  —— 否则两边同时写错时对账仍会通过

### 新增 `test/world-formula-consistency.mjs`（28 项）

守 `world` 与公式库的逐项对账，含一条**反向对照**：

```
用默认 strength=2e8 会得到 7.54 km ≠ world 的 4.9 km
→ 证明这条对账真的能抓到不一致
```

### world 输出新增两段（层二：推导可追溯）

**①【推导链】** —— 每个数从哪来：

```
表面重力  = G·M/R²  ← G=6.6743e-11, M=5.9722e+24, R=6.3710e+6
最大山高  = strength/(ρ·g)  ← strength=1.3e8 Pa（由 α 推出）
⚠ strength 不是通用常数：地球花岗岩约 1.3e8，公式库默认 2e8 会算出 7.54 km
```

**②【接着往下推】** —— 这些值能喂给公式库的哪些下一步：

```
生物体型  formula="kleiber" overrides={m: <体重kg>}
飞行可行  formula="lift_force" overrides={density:..., velocity:..., wing_area:...}
          → 这个重力下要多大的翅膀（g=9.82 已决定所需升力）
结构极限  formula="buckling_euler" ...
★ formulas query="sys" / query="sys:compound"
```

这是「耦合」的兑现处：**world 只是第一层，输出可直接作为公式库的输入**。

### 测试里抓出我自己的一个错

`centrifugalRatio` 的地球值我第一版断言写 0.034，实算 **0.00345**（差 10 倍）。
校验方法：赤道自转线速度 ωR = 464.7 m/s（应 465），
则 v²/(Rg) = 465²/(6.371e6×9.82) ≈ 0.00345。

**这正是这条测试的价值：它对账的是「我的记忆」与「实现」。**

### 明确不做的：层三

**不让 world 变成「复合路径的一次执行」。**
理由：复合路径的定位是「给人看的路线」，不是「给机器执行的程序」。
硬做会把 world 变成僵化流水线，失去按需计算的灵活性。

### 状态

| 指标 | 之前 | 之后 |
|---|---|---|
| 测试 | 115 套 / 5766 项 | **117 套 / 5819 项** |
| world 输出 | 3496 字符 | **4519 字符**（含推导链与衔接） |

公式数不变（669）—— 这一批改的是**结构**，不是内容。

---

## [2.3.20] — 2026-11-10

缺口分析的 P3~P5 三批：**日常生产（23 条 + 地质 + 失稳）**。

### P3：日常生产链 8 条 —— 前工业社会的真实成本

已有工艺公式全在金属/窑炉/化工（重工业）。但普通人一生接触最多的是**纺织**。

本批的统一单位是「**人日**」—— 让不同行业可比，这是核心设计。

| 公式 | 关键结论 |
|---|---|
| `spinning_labor_per_kg` | 1 kg 羊毛 = **30 人日**；一件外衣 60~90 人日（一个人三个月） |
| `weaving_labor_per_meter` | 一匹布的纱 150 人日、织 30 人日 → **纺占 83%** |
| `copying_labor_per_book` | 抄一本 300 页书 **53.6 人日**，而纸本身只要 0.6 人日 |
| `paper_labor_per_sheet` | **贵在抄不在纸** —— 这解释了为什么印刷术比造纸术影响大 |
| `salt_preservation_need` | 腌 1 吨肉需 **150 kg 盐** —— 盐是战略物资的定量根据 |
| `brick_firing_fuel` | 1.5 万块砖需 **18 吨柴** —— 砖房为何是奢侈品 |
| `lime_plaster_need` | 100 m² 抹灰需 **850 kg 石灰** |
| `smoking_drying_capacity` | 熏房日处理 16.7 kg —— **秋杀旺季的瓶颈** |

**最有价值的一条推论**：纺纱占纺织链 83%（150 vs 30 人日）——
这正是「工业革命的第一个突破是纺纱机而不是织布机」的量化原因。
（飞梭先出现，反而造成「纱荒」，才催生珍妮机。）

### P4：地质速率 10 条 —— 世界的时间深度

| 公式 | 关键结论 |
|---|---|
| `erosion_rate_denudation` | 活跃山地 **3.7 mm/年**、低地 **0.037 mm/年** |
| `mountain_lifetime` | 1000m 山无抬升 → **200 万年削平**；抬升>剥蚀时「寿命」为负 |
| `soil_formation_time` | **1 cm 表土 500 年**、30 cm 耕作层 **3000~15000 年** |
| `delta_progradation_time` | 大河三角洲 **千年尺度**形成 |
| `coastal_erosion_rate` | 软岩比花岗岩快 **100 倍** |
| `groundwater_recharge_time` | 深层含水层 **100 年换水**；沙漠深部是化石水 |
| `sediment_trap_efficiency` | 库容/来沙=10 → 拦 **91%** |
| `reservoir_life` | **大水库只 12.5 年就淤满**（残酷但真实） |

**最有价值的一条**：成土速率 0.02~0.1 mm/年，而**耕作侵蚀可达 1 mm/年**（快 10~50 倍）。
这就是「土壤是 mining 不是 farming」的定量根据，也是「古代文明为何因土地耗尽而崩」的解释。

### P5：社会失稳 7 条 —— 最容易写错的一类

这批**没有物理锚**，所以每一条都在 desc 里明确声明「**不是预测**」，
测试里还有一条专门的断言守着这个要求。

| 公式 | 关键结论 |
|---|---|
| `subsistence_pressure` | **「刚好够」是最危险的状态**（农业波动 ±10~20% 是常态） |
| `tax_burden_stress` | 税率高低本身没意义 —— **要看税占剩余的多少** |
| `grievance_accumulation` | 第一年只有 26%（可忍）、**第三年 59%**、第五年 78% |
| `revolt_organization_threshold` | 缺组织起不来 —— **这就是为什么起义都有宗教/宗族色彩** |
| `elite_overproduction` | **王朝崩溃最稳定的一条模式**：想当官的人 / 官缺 > 2 就危险 |
| `legitimacy_decay` | 威信自己衰减：承平 50 年剩 37%，灾荒时快 5 倍 |
| `repression_cost_ratio` | 比值 <1 压不住；但**赢了镇压可能输掉财政** |

**最有解释力的一条**：「精英过剩」与「农民困苦」是**两个独立机制**——
前者靠上升通道堵塞，后者靠生存压力。**两者叠加时王朝才会真正崩。**

### 明确不做的一条

**不做「王朝寿命预测」。** 历史周期律是描述不是公式 ——
把它做成 expr 会给出「这个王朝还剩 87 年」这种荒谬的精确。
测试里有一条断言守着「全库不存在 dynasty_life / collapse_year 类公式」。

### 状态

| 指标 | 之前 | 之后 |
|---|---|---|
| 公式库 | 646 | **669** |
| 体系步数 | 252 | **259** |
| 测试 | 114 套 / 5681 项 | **115 套 / 5766 项** |

---

## [2.3.19] — 2026-11-10

按缺口分析的 P0~P2 补第一批：**过程配方 + 瘟疫饥荒 + 营养生命表**。

### P0：过程配方（不需要新公式，只需要有人写模板）

缺口分析的核心结论是：**过程类缺口 80% 是「没人写模板」，不是「能力不够」**。
所以我先跑实测确认 `ode` 能做 SIR，然后写了 `recipe-process` 一节（2965 字符），
五份可直接抄的模板：

```
一、瘟疫时程      ode 双状态，at:[10,20,30,40,60,90] 直接给「第几周爆发」
二、人口年表      recurrence 带内禀减速（logistic）
三、资源枯竭      存量-流量 + EROI 下降
四、债务螺旋      i 与 g 的比较决定命运
五、技术扩散      logistic + 临界质量 1/⟨k⟩
```

三组 R0 的对比是最有价值的（实跑数据）：

```
R0=2  峰值第 60 期、峰值 14%  ← 慢，社会有时间反应
R0=3  峰值第 40 期、峰值 30%
R0=6  峰值第 20 期、峰值 49%  ← 快到来不及做任何事
```

### 修了一个真能力缺口：`recurrence` 缺内置期数变量

写「资源逐年枯竭」时实测报 `Undefined symbol n` —— 而**所有「每期变化的量」都依赖它**。

排查后确认：求值域里只注入 `initial` 的变量，没有期数。已加内置 `n`（从 1 开始，用户在 initial 里自定义时以用户为准）。

```
  修前：R-2000/(1+0.03*n)  → Undefined symbol n
  修后：期1 → 98058｜期6 → 89117｜期12 → 79763
```

**这个缺口的价值不在「多一个变量」，而在「过程建模最常用的一类式子之前根本写不出来」。**

### P1：瘟疫与饥荒 8 条

| 公式 | 关键结论 |
|---|---|
| `epidemic_doubling_time` | R0=3 → **3.5 天翻倍**；R0=6（天花）→ **1.4 天**（一个月 100 万倍） |
| `herd_immunity_fraction` | R0=12（麻疹）→ 需 **92%** 免疫 |
| `quarantine_effectiveness` | 每天识别 5%（隐性感染）→ **只拦住 30%** |
| `starvation_survival_time` | 体脂 15kg 撑 **48 天**；5kg 只 **16 天** —— 胖子活得久是数学 |
| `famine_excess_mortality` | 缺口 30% → 死 6%；**缺口 70% → 死 17%**（超线性） |
| `crop_failure_threshold` | 储备 300 把灾年门槛从 **9% 抬到 36%** —— 这就是「三年储备」的意义 |

### P2：营养与生命表 7 条

**本批最重要的一条是认知纠正：**

```
  「古人平均活 35 岁」的真相 ——
  IMR=30%、成人余命 60 → e₀ = 42.1 岁
  但活到 60 岁的仍有 23%（每 4 个里有 1 个）
```

**所以「古代没有老人」是错的。** 老人是少数但绝对存在，足以承担经验传承。
反过来，若战乱使成年风险升到 0.05/年，活到 60 的只剩 **4.5%** —— 那时社会才会「失忆」。

其余几条：

| 公式 | 关键结论 |
|---|---|
| `maternal_mortality_risk` | 生 6 次、每次 1% → 终生风险 **5.9%**（每 17 个母亲死 1 个） |
| `protein_energy_malnutrition` | **取短板不取平均** —— 热量够但缺蛋白仍会得夸希奥科病 |
| `micronutrient_deficiency_risk` | 坏血病/脚气/碘缺乏的「缺多少会出事」 |
| `food_stock_days` | 1 吨粮养 100 人 **15.9 天**；「万石粮」= 600 吨 ≈ 百天 |
| `water_survival_time` | 沙漠劳动 **13 小时**就不行了 —— 缺水比缺粮快两个数量级 |

### 数字自查

- `survival_to_age` 我第一版写「活到 60 岁 31%」，实算 **23%**（已改）
- `micronutrient_deficiency_risk` 我把 1−e^(−0.2)=18% 误读成「风险 82%」（已按实算改正并补了说明）
- `life_expectancy_from_imr` 42.2 → **42.1**

### 状态

| 指标 | 之前 | 之后 |
|---|---|---|
| 公式库 | 631 | **646** |
| help 节 | 26 | **27**（新增 recipe-process） |
| 测试 | 113 套 / 5603 项 | **114 套 / 5681 项** |

---

## [2.3.18] — 2026-11-10

补**复合路径（compounds）**—— 这是「把公式连成体系」这件事的最后一块。

### 它解决什么问题

22 条链各自只覆盖一步到十几步。但真实推演里最难的**不是算某一步，而是跨 4 条链**：

```
  「有铁矿」能不能变成「有帝国」？
  材料链 → 产能链 → 财政链 → 军事链
```

这些路径在图上**本来就连通**（图直径 5 跳、单一连通分量），但读者要自己一段段拼。
现在登记下来了：

```
  formulas query="sys:compound"               → 7 条复合路径清单
  formulas query="sys:compound:mine-to-empire" → 逐跳展开，含接点公式与说明
```

### 7 条路径

| id | 路线 | 回答什么 |
|---|---|---|
| `mine-to-empire` | 材料→产能→财政→军事 | 「有铁矿」能否变成「有帝国」 |
| `water-to-army` | 水利→食物→财政→军事 | 灌溉能力最终能养多少兵 |
| `info-to-capacity` | 信息→财政→产能 | 治理半径决定产能上限 |
| `material-to-fly` | 材料→结构→交通 | 这个世界的材料能否造出飞行器 |
| `energy-to-output` | 能源→产能 | 产量瓶颈卡在燃料还是工艺 |
| `quantum-to-industry` | 量子→信息控制→产能 | 能否做出电子工业 |
| `queue-to-output` | 排队→产能 | 再加一个人有没有用 |

### 设计决定：只登记「经过哪几条链」，不复制公式与参数

```
  复制 → 公式改了、链条调整了，复合路径不跟着变 → 必然漂移
  引用 → 每次从 FORMULA_SYSTEMS 现查 → 永远与代码一致
```

所以一条路径只写 `via`（链的顺序）+ `hops`（每跳用哪个接点作为提示）+ `purpose`。
具体参数去查那条链。

### 最关键的一条：不许登记假路径

第一版我写了 `sys-climate → sys-food`（用 `gdd_accumulated` 当接点），
**实测发现这两条链之间根本没有任何真实接点** —— 那条路径是我拼出来的。

所以 `traceCompound` 每次都回到 `FORMULA_SYSTEMS` 现查证据，依次尝试：

1. 本链声明的 `bridges`（且接点公式必须真在目标链的步骤里，否则是死链）；
2. 对方链声明的 `bridges`（反向）；
3. 两链 `steps` 里的**共用公式**（弱一些但也是真实连接）。

三条都不成立就判 `ok: false`。

测试里还加了一条**反向对照**：构造一条不存在的路径（`sys-astronomy → sys-military`），
`traceCompound` 必须报断。若实现里漏了判断永远返回 true，这条会红 ——
否则第 3 节的全部「每跳连通」断言都会假通过。

### 顺手删掉的假路径

`civ-sustainability`（光→气候→食物→财政）—— 气候与食物之间没有接点，
按上面的规则**直接删掉，不是硬凑一个**。假关系比没有关系更糟。

### 状态

| 指标 | 之前 | 之后 |
|---|---|---|
| 复合路径 | 0 | **7** |
| 测试 | 112 套 / 5569 项 | **113 套 / 5603 项** |

公式数不变（631）—— 这一批加的是**组织方式**，不是新公式。

---

## [2.3.17] — 2026-11-10

补化学工程单元操作 11 条。这批回答的是**「能不能量产酸、碱、药」** —— 之前库里只有实验室化学。

### 缺口：23 条化学公式全是「实验室」，没有一条「工厂」

```
  已有：摩尔、浓度、滴定、pH、溶度积、能斯特、阿伦尼乌斯、吉布斯能
  没有：反应器尺寸、转化率、传质、萃取级数、精馏板数、吸附穿透、干燥
```

区别不是「多几条」，而是能不能回答：

```
  实验室问题：这杯溶液 pH 多少（已有）
  工业问题：  这个反应釜一天能产多少、要多大、几级萃取够（全空）
```

### 本批的组织方式：围绕「放大」而不是「单元操作名称」

化学工程的核心是 scale-up，而放大问题的三条主线是：

```
  停留时间 τ = V/Q       → 决定装置**体积**
  级数（萃取/精馏板）     → 决定装置**高度**
  传质系数 K·a           → 决定设备能多快达到平衡
```

所以 11 条全按这三条组织。

### 新增 11 条，最实用的六条

| 公式 | 关键结论 |
|---|---|
| `reactor_conversion_first_order` | **指数饱和**：kτ=3→95%、kτ=6.9→99.9% —— 「最后几个百分点最贵」 |
| `cstr_conversion` | 同 kτ 下 **75% vs 95%** —— 返混的代价，工业用多釜串联的原因 |
| `distillation_min_stages` | α 2.2→1.2，板数 **7.5→32（4.3 倍）**；α→1 时发散=共沸物蒸不出来 |
| `extraction_stages` | K_D 0.5→5，级数 **11.4→2.6** —— **选对溶剂比多加级数重要** |
| `crystallization_supersaturation` | **过饱和度越大晶体越细**；想要大晶体必须慢冷却（数天到数周） |
| `heat_exchanger_area_chemical` | **放大困境**：放热 ∝L³ 而面积 ∝L² —— 体积放大 10 倍时单位体积散热降到 1/2.15 |

### 放大困境：本批最有价值的一条

```
  反应放热量 ∝ L³，换热面积 ∝ L²
  → 放大后单位体积的散热能力按 L 下降
  → 「小试能控温、中试就飞温」不是操作问题，是几何决定的
```

而放热剧烈的反应（硝化、氧化、聚合）**放大时最危险** —— 这正是化工事故的典型模式。

### 四处数字自查（全部是我写错的）

| 位置 | 我写的 | 实算 |
|---|---|---|
| Fenske α=2.2 | 4.1 板 | **7.5 板** |
| Fenske α=1.2 | 12.8 板 | **32.3 板** |
| 放大 10 倍时 ΔT | 需升到 100K | **21.5K**（我把 10 倍线性放大误当 100 倍体积放大） |
| Fenske 两端各提一档 | +5.84 板 | **+6.08 板**（两端同时提纯是**平方效应**：A·B 涨 121 倍，不是 11 倍） |

最后一条本身值得记：**「纯度提高一个数量级 → 板数 +ln10/lnα」只对一端成立**；
两端同时提纯时是 ln(121)/lnα。

### 采样器又补一层

`extraction_stages` 的四个浓度参数被采样器全填成 0.1（log(0/0)）。已在采样器里加
`initial_ratio/final_ratio_target/equilibrium_ratio/distribution_ratio` 的微调，
与之前的 `hot_`/`cold_`/`h_in`/`cutoff_ratio` 同一机制。

### 状态

| 指标 | 之前 | 之后 |
|---|---|---|
| 公式库 | 620 | **631** |
| 体系步数 | 247 | **252** |
| 测试 | 111 套 / 5512 项 | **112 套 / 5569 项** |

---

## [2.3.16] — 2026-11-10

补流体力学与空气动力 13 条。这批回答的是**「能不能飞、船能多快」** —— 之前库里根本答不了。

### 缺口：能算「水多深压多大」，算不了「这东西能不能飞」

```
  已有（10 条）：静水压、浮力、流量、雷诺数、弗劳德数、达西损失、泵功率、孔口出流
  没有：伯努利、升力、阻力、边界层、Stokes 沉降、马赫角、波阻
```

### 本批的主轴：两种阻力必须分开

```
  压差阻力  ∝ v²   高速主导（drag_force）
  粘性阻力  ∝ v    低速主导（viscous_drag_stokes）
```

这不是「同一公式的两个近似」，是**两种不同的物理机制**。混用会得出「船越快越省力」这种荒谬结论。
所以测试专门验这两条标度：速度翻倍时，压差阻力必须 ×4、粘性阻力必须 ×2。

### 新增 13 条

| 公式 | 关键结论 |
|---|---|
| `stagnation_pressure` | 动压 q=½ρv² —— **所有气动力 ∝ v²**，v=100m/s 时 q≈6125Pa |
| `drag_force` | C_D 量级：流线型 0.04~0.1、球 0.47、平板 1.28、**鱼 0.01** |
| `viscous_drag_stokes` | 低速 ∝ v；**沉降速度 ∝ r²** —— 粗砂瞬沉、黏土悬浮数天 |
| `terminal_velocity_sphere` | 1mm 砂 3.6 m/s；**1µm 黏土 3.6e-6 m/s（1 米深要 77 小时）** |
| `lift_force` | 升力 ∝ v² —— **人力扑翼机要 700W 持续输出，人能维持的只有 200~400W** |
| `wing_loading_stall_speed` | **放襟翼不是为了升力大，是为了失速速度低**（C_Lmax 1.4→2.5 降 25%） |
| `lift_to_drag_ratio` | 信天翁 20~25、滑翔机 40~60、客机 17、**昆虫 1~3** |
| `induced_drag` | **升力的代价是平方级的**；AR 越大越省 →「只算型阻的 L/D 会高估 2~5 倍」 |
| `boundary_layer_thickness` | δ ∝ √x；**高尔夫球凹坑的原理**：主动造湍流反而减总阻力 |
| `mach_angle` | M=2 → 30°、M=5 → 11.5°；音爆的来源 |
| `wave_drag_coefficient` | **立方律**：ΔM ×1.5 → 波阻 ×3.4。「音障」不是声音的墙，是阻力暴涨 |
| `reynolds_transition` | 1mm 虫 Re=10（世界像蜂蜜）、100m 船 Re=1e9 |
| `bernoulli_pressure` | ★ 顺带纠正一个常见误用：两纸相吸需要卷吸解释，不能简单套伯努利（它只在同一流线上成立） |

### 一处必须反算的系数

`wave_drag_coefficient` 第一版我随手写了系数 20，算出 M=0.9 时 C_Dw=0.0675，
而文献量级是 0.02 —— **差 3.4 倍**。用「M=0.90 时 C_Dw≈0.02」反算得 **K=5.93**，
并验证立方律比值 3.375 与「0.85→0.90 涨 3.4 倍」一致。

这正是本项目反复强调的那条：**经验式的系数不能拍，要拿锚点反算。**

### 两处手算错误（都被测试抓到）

- `Re = 0.01×1e-3/1e-6` 我算成 0.01，实为 **10**（把速度与长度都记成 1e-3 了）
- 「微观与宏观差 11 个数量级」实为 **8 个**（1e9 ÷ 10）

### help 归属修正

流体内容一开始被我误加进 `d-thermal`（热机节），已按行号移到 `d-fluid`，
并把该节标题从「工程·流体与管路」改为「**工程·流体与气动**」——
否则按「升力」「飞行」查 help 会命中一个标题里没有这些词的节。

### 状态

| 指标 | 之前 | 之后 |
|---|---|---|
| 公式库 | 607 | **620** |
| 体系步数 | 239 | **247** |
| 测试 | 110 套 / 5459 项 | **111 套 / 5512 项** |

---

## [2.3.15] — 2026-11-10

补热机循环 11 条。这批的价值不是「多了几个效率公式」，而是**把卡诺从「唯一答案」降回「上限」**。

### 缺口：库里有 17 条热力学，但全是「物性」不是「循环」

```
  已有：理想气体、热容、潜热、导热、卡诺效率、卡诺 COP、熵变
  没有：Rankine、Otto、Diesel、Brayton、联合循环、实际制冷 COP
```

后果很直接：**卡诺只是天花板，而真实机器从来达不到它。**
只有引入循环形式，才能回答「这台蒸汽机效率 8% 是差还是已经接近极限」。

### 本批最重要的结论：两条技术树从这里分叉

```
  卡诺/Rankine   效率只由**温度**决定    → 提效率必须提蒸汽温度（材料问题）
  Otto/Brayton   效率只由**压缩比**决定  → 提效率必须提压缩比（爆震/结构问题）
```

这个区别不是设计偏好，是**公式结构决定的**。所以测试直接验结构性质：
改温度时 Otto 效率必须不变、改压缩比时 Rankine 效率必须不变。这比验数值更能守住真正的知识。

### 新增 11 条

| 公式 | 关键结论 |
|---|---|
| `rankine_efficiency` | 3MPa 饱和算例 **34.4%**（同温限卡诺 39.6%，达到 87%） |
| `otto_efficiency` | r=8→56.5%、r=10→60.2%；**公式里没有温度项** |
| `diesel_efficiency` | 优势是压缩比能到 18，代价是**rc 越大效率越低**（rc=3 时 58.9% < rc=1.5 时 65.6%） |
| `brayton_efficiency` | 优势不在效率而在**功率密度**（无往复件）—— 喷气式的基础 |
| `combined_cycle_efficiency` | 60% 不是提高单机，是**用燃机废热再驱动汽轮机**；高于任一单机但低于两者相加 |
| `condenser_vacuum_gain` | **「把排气冷下来」与「把蒸汽烧热」等价** —— 冷却塔不是为环保，是为真空 |
| `refrigeration_cop_real` | 空调 COP≈18、冷冻≈3.6 —— **同一台机器差 5 倍**，只因温差 |
| `heat_pump_cop` | COP_供暖 = COP_制冷 + 1；室外 −10℃ 时骤降（热力学决定） |
| `cooling_load` | **渗透热往往与围护热同量级** → 「密封门窗」比「加厚墙」更有效 |
| `thermal_storage_capacity` | 水比热是岩石 5.2 倍 —— 蓄热用水是数值决定的；一次相变≈升温 80K |
| `rankine_reheat_gain` | 再热不只是提效率，更是**防止末级叶片被水滴打坏** |

### 修掉的采样陷阱（这次改的是采样器，不是公式）

`formulas-all.mjs` 用描述关键词填参数，导致三处 non_finite：

```
  condenser_vacuum_gain   三个温度全填 300 → 分母 0
  diesel_efficiency       cutoff_ratio 填 1 → 分母 (rc−1)=0
  rankine_efficiency      三个焓全填 10 → 分母 0
```

前两批我靠改描述绕开，但这是治标：**采样器不知道「这几个参数必须不同」**。
这次在采样器末尾加了一层按参数名的微调（`hot_`→773、`cold_*_old`→373、
`cutoff_ratio`→2、`h_in`→2.8e6…），并把理由写进注释。
以后再遇到同类失败，应改这一层，而不是逐条迁就描述。

### 数字自查

引用的效率值我先全部手算过一遍，抓出 6 处偏差（Diesel rc=2 是 63.2% 不是 63.1%、
Brayton π=30 是 62.2% 不是 62.4%、γ=1.33 时 52.4% 不是 54.9%…），已逐条改正。
唯一无法手算的 Rankine 用了完整算例核对：h₁=2803、等熵膨胀到 0.005MPa 时 x₂=0.721、
h₂=1886、h₃=141 → 34.4%。

### 状态

| 指标 | 之前 | 之后 |
|---|---|---|
| 公式库 | 596 | **607** |
| 体系步数 | 232 | **239** |
| 测试 | 109 套 / 5408 项 | **110 套 / 5459 项** |

---

## [2.3.14] — 2026-11-10

补分布矩与可靠性 11 条。这批不是「再加一类公式」，而是补 `dist` operation 的**分布缺口**。

### 缺口在哪

`dist` 只支持 normal / binomial / poisson / exponential 四种。而冷战到千禧年
工程与可靠性最常用的另外几种**连基本矩都算不出来**：

```
  Weibull      疲劳/寿命分析的标准分布（k 是它的全部价值）
  对数正态     收入、粒径、修复时间 —— 乘法过程的结果
  卡方         方差检验、拟合优度
```

### 分工：这批与 dist 不是重复

```
  dist      → 某一点上的概率密度/累积（需要完整参数）
  本条一批  → 这个分布长什么样（均值/方差/中位/失效率/存活率）
```

即：**先用这批判断该用哪个分布、参数大概多少，再用 dist 算点值。** 分工写进了 desc。

### 新增 11 条

| 公式 | 关键结论 |
|---|---|
| `weibull_reliability` | **t=λ 时恒有 36.8% 存活**（与 k 无关）—— 这才是「特征寿命」的定义 |
| `weibull_failure_rate` | 浴盆曲线**不是一条曲线，是三段不同的 k** |
| `weibull_mean_life` | 均值永远 < 特征寿命（k=2 时只有 0.886 倍） |
| `lognormal_median_vs_mean` | 均值/中位 = exp(σ²/2)，**必然 ≥1** —— 「平均收入」为何无描述力 |
| `lognormal_mean` / `lognormal_variance` | 方差含两个指数项，**比均值敏感得多**（σ 1→2，均值 ×4.5，方差 ×627） |
| `poisson_mean_variance` | E=Var，真正的用途是**模型选择**：方差≫均值即有聚集 |
| `binomial_mean_variance` | 相对误差 ∝ 1/√n —— 「10 个里 7 个痊愈=70%」经不起追问 |
| `exponential_mean_life` | 无记忆的真正含义：旧的不比新的更容易坏 |
| `chi_square_mean_variance` | E=k，Var=2k；用于「偏差是否只是随机波动」 |
| `coefficient_of_variation` | 唯一能跨单位比离散度的指标：50±5 与 500±50 都是 0.1 |

### 最实用的两条推论（写设定时能直接用）

**① 维护策略只看 k：**

```
  k<1  早期失效  → 换新的反而更容易坏，「磨合」比「更换」有意义
  k=1  随机失效  → 换不换一样，定期更换纯属浪费
  k>1  磨损失效  → 到点就换能避免失效，定期维护才划算
```

**② 精度门槛可以用 CV 自查：**

```
  CV<0.1  精密（需要模具与质检）
  0.2~0.4 手工常态
  「50±1g」= CV 0.02 → 这已经是量产级工艺，不是作坊能做的
```

### 体系接入

接进 `sys-decision`（决策与可靠性链）：Weibull 两条 + 变异系数 + 泊松散布检验。
链规模 228 → **232 步**，22 链不变，死链 0。

### 一处自查出来的数字错误

`lognormal_variance` 的 desc 里我先写了「σ=2 时 Var=2980」，实算 **2926.36**。
差 2% 看着无关紧要，但这正是本项目一直在防的「数字不异常但错了」——
已按实算值改正，并顺手把「差 7 倍」改成准确的「涨 627 倍」。

### 状态

| 指标 | 之前 | 之后 |
|---|---|---|
| 公式库 | 585 | **596** |
| 体系步数 | 228 | **232** |
| 测试 | 108 套 / 5355 项 | **109 套 / 5408 项** |

---

## [2.3.13] — 2026-11-09

按「把冷战到千禧年的主流学科囊括进来」的要求做了一次**学科普查**，而不是零星补公式。

### 普查发现了什么：不是「缺几条」，是整块学科空白

现有 528 条看着分布均匀，但按学科支柱一对照，缺口是断崖式的：

```
控制论   0 条   信息论   1 条（只有熵，没有信道容量）
运筹学   0 条   博弈论   1 条（只有公地悲剧）
系统工程 0 条   信号处理 0 条
量子      3 条（只有光子能量、德布罗意、氢能级）
统计物理 0 条   固体/半导体 0 条
核        12 条，全是「衰变」一侧 —— 裂变、临界、结合能全空
```

也就是说：**1900—1950 这半个世纪的主线，几乎全空**。而这正是架空世界最有杠杆的一段 ——
「能不能造出电灯、无线电、原子弹」的分水岭就在这里。

### 新增三批 45 条（合并重复后净增 44）

| 批 | 文件 | 条数 | 内容 |
|---|---|---|---|
| 一 | `formula-library-cybernetics.ts` | 14 | 控制论 4 + 信息论 6 + 信号 4 |
| 二 | `formula-library-or.ts` | 17 | 排队 4 + 库存 2 + 可靠性 4 + 决策博弈 5 + 判断 3 |
| 三 | `formula-library-modern-physics.ts` | 13 | 量子 4 + 统计固体 5 + 核 4 |
| 四 | `formula-library-social-science.ts` | 13 | 人口 4 + 网络 3 + 组织 3 + 城市与不平等 3 |

**每条都只收有闭式解的那一层。** 这条判据压掉了大量候选：
线性规划（需单纯形迭代）、薛定谔一般解、能带结构计算、卡尔曼滤波（需矩阵先验）
—— 它们做成一条 `expr` 只会给出「看似精确的错数」，这正是本项目一直在打击的。

### 这批公式的价值不在算式（都只有一两行），在它们推翻的直觉

```
人多一倍不是慢一倍            ρ 从 0.9→0.95，负载 +5.6%，等待 ×2.1
检测阳性不是有病              1% 发生率 + 90%/90% 检测 → 阳性后只有 8.33%
多备冗余不是更安全            0.9 单件备 2 份 → 0.99；备到第 4 份已无收益
欠阻尼不是更快                又冲又慢：ζ=0.3 时超调 37% 且建立时间是 ζ=0.9 的 3 倍
加增益不是更准                延迟卡死上限 K_max ≈ 1/(τ·ω)，加增益只会自激
电子在导线里不是「跑过去」     铜里漂移速度约每小时 14 厘米，亮灯是场建立了
铁不是随便一种金属            比结合能峰值在 Fe-56，所以往它走就放能，两边都是
```

### 建了 4 条新体系链（18 → 22）

新公式若只是孤立条目，等于没加。所以补了 4 条链，判据与前 18 条一致 —— 按**推演目的**分：

```
sys-info-control   信息与控制  信道容量→采样→反馈校准（「能传多远、能控多准」）
sys-decision       决策与可靠性 赔率→概率→冗余→可用度（「该不该做、做不做得成」）
sys-quantum        量子与固体  黑体→能带→器件→核（「能碰到物质的哪一层」）
sys-queue          排队与产能  负载ρ→等待→库存（「这个作坊够不够用」）
```

体系规模：**22 链 / 228 步 / 45 个接点**，死链 0。

### 过程中修掉的四个真错误（都是我的，不是环境的）

| # | 错误 | 怎么发现的 |
|---|---|---|
| 1 | `log_base` 在公式求值路径里不存在（只有 `log(x, base)`） | 全批 4 条一次全报 `unknown_symbol` |
| 2 | 劳森判据漏了反应率 ⟨σv⟩，算出 0.0049（差 22 个数量级） | 结果量级明显不对 |
| 3 | 临界质量的形式错了：实算是 ∝ρ 不是 ∝1/ρ²，且比真实小 29 倍 | 用真实锚点（U-235 52kg）反算发现的 |
| 4 | 带隙把 eV 与 J 混用，GaN 的 3.4eV 被写成 5.5e-19 J（差 1.6 倍以上） | 对照表逐行验证 |

第 3 条最值得记：我原本把公式命名为「临界质量估算」，断言「密度翻倍 → 质量 ÷4」，
但实算是 ∝ρ。查证后确认**是我的物理推导错了**，不是实现错了。于是改名为
「临界半径的量级下界」，并在 desc 里明写「算得 1.8kg 而真实 52kg，差 29 倍，
差的是几何泄漏与中子能谱」。**把偏差写出来，比假装精确更有用。**

### 一处必须合并的重复
