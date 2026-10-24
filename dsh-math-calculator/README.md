# dsh-math-calculator

DSH（DeepSeek Harness）原生数学计算与**架空世界观推演**插件。

运行期依赖三样：`mathjs`、`algebrite`，以及官方 `@deepseek-ai/dsh-tools` 里的 **`defineTool` 一个导出**。
宿主服务一律用 `ctx.get` 可选读取，**不碰 `CallId` 这类宿主内部导出** —— 旧版正是死在那个导出被删除上。

---

## 它解决什么

| 场景 | 传统方式 | 这个插件 |
|---|---|---|
| 高精度计算 | 心算 / bash 拼 | BigNumber 64 位，整数输出完整定点 |
| 写公式 | 每次都重推 | 342 条公式库，参数全可覆盖 |
| 架空世界设定 | 凭感觉 | 输入星球参数 → 出重力/气候/地形上限 |
| 改物理常数 | 无法验证 | 自动推导派生量 + 全公式偏差 + 设定校验 |
| 多世界观 | 互相污染 | 工作区隔离，各持一套常数表与公式表 |

---

## 安装

本插件是标准 DSH bundle（`dsh.bundle.patch` → `cordis.patch.yml`）。

本机 `dsh` 未加入 PATH，实际入口是随桌面版分发的：
`C:\Users\<you>\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd`

```powershell
cd D:\0cengxu\5\dsh-math-calculator
npm install
npm run build

& "C:\Users\<you>\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
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
| `formula` | 调用 342 条公式之一 | `{"formula":"escape_velocity","overrides":{"M":5.97e24,"r":6371000},"operation":"formula"}` |
| `formulas` | 检索公式库 | `{"query":"重力","operation":"formulas"}` |
| `world` | 星球参数 → 体感画像 | `{"world":{"planetRadius":1.4,"rotationHours":40},"operation":"world"}` |
| `terrain` | 局地气候（配合 world） | `{"world":{"planetMass":2},"terrain":{"kind":"coastal","latitudeDeg":58},"operation":"world"}` |
| `constants` | 改常数 → 推导派生量 | `{"constants":{"c":1.5e8},"operation":"constants"}` |
| `quantities` | 哪些物理量该跟着变 | `{"constants":{"G":1.3e-10},"constantName":"G","operation":"quantities"}` |
| `impact` | 改常数 → 全公式偏差 | `{"constants":{"c":1.5e8},"operation":"impact"}` |
| `feasibility` | 设定一致性校验 | `{"world":{"planetMass":2},"claims":{"creatureHeight":50},"operation":"feasibility"}` |

### 恒星结构（S3）

`world` 会由恒星质量推出一整套结构量，并明确标注每一层的可信度：

| 结论 | 依据 | 置信度 |
|---|---|---|
| 光度 L(M)、半径 R(M) | 质光关系 L∝M^3.5、质径关系 R∝M^0.57 | 经验 |
| 有效温度 | 斯特藩-玻尔兹曼反解 | 精确 |
| 主序寿命 τ=10 Gyr·M^-2.5 | 质光关系直接推出 | 经验 |
| 宜居带 0.95–1.67√L | 辐射平衡 | 精确 |
| 辐射峰值、紫外占比 | 维恩位移 + 普朗克积分 | 精确 |
| α 对点火温度、不透明度 | 库仑势垒 ∝ α、σ_T ∝ α² | 量级 / 精确 |
| α 对寿命的净效应 | 需要完整恒星演化 | **只给方向** |

例：0.3 M☉ → 3241 K、寿命 203 Gyr、宜居带 0.11–0.20 AU、紫外 0.4%；
10 M☉ → 26504 K、寿命 32 Myr、宜居带 63–111 AU、紫外 92%。

> 作者显式给的恒星半径/温度优先于质径关系，避免同一份输出里出现两套数字。

### 面向用户的 UI：配置与数据管理（不是计算器）

**入口不占界面**：侧栏「插件市场 / 任务看板」那一排多一行「数学工作区」，
点开才显示页面；不点就只占一行，不动原生主界面。

实现用的是 DSH 官方席位（与 dsh-novel-writer 同一套）：
`sidebar.panellist` 提供入口行（`id/order/label`），`main` 用同名 `key` 提供页面内容，
行盒子、选中态、折叠与无障碍全由宿主的 layout 服务负责。

> 真机教训（来自 dsh-novel-writer 的注释）：等槽位必须用 `ctx.slots.inject`，
> **绝不能用 `ctx.inject`** —— 后者会让宿主判定 entry "did not activate"，直接导致桌面端启动失败。

面板的定位是**管理**，不是计算。计算全部交给 AI 调用工具完成。面板分四个页签：

| 页签 | 作用 | 对应接口 |
|---|---|---|
| 工作区 | 建/切/删、看常数与地点、清理存储 | `/workspaces/*` |
| 常数表 | 改当前工作区的物理常数（只影响这个世界观） | `GET /constants` + `save-constant` / `reset-constant` |
| 公式表 | 停用 / 恢复公式、查看自定义公式数量 | `GET /formula-table` + `POST /formula-table` |
| 设置 | 提示注入档位 off / brief / full | `GET/POST /settings` |

所有修改都落到**当前工作区**，不同世界观互不影响。前端不复制业务规则，只调用后端接口。

### 面向 AI 的设计

插件对 AI 有三层提示（详见 [ADR-0002](../docs/adr/0002-plugin-ai-facing.md)）：

| 层 | 位置 | 预算 |
|---|---|---|
| 工具描述 | `TOOL_DESCRIPTION` | ≤ 800 字符，枚举 25 个 operation 与读输出规则 |
| 系统提示 | `systemPrompt.section`（brief） | ≤ 320 字符，每轮注入 |
| 主动提醒 | `agent/pre-step` 钩子 | 每会话 ≤ 3 次，检测到计算需求才触发 |

输出里的 `[精确]/[标度]/[量级]/[仅方向]`、`【跨模块一致性】✓/⚠/✗`、`【模型可信度】`
既是给人看的，也是给 AI 判断"这条能信几分"的。

### 公式库扩展（全局包 + 工作区临时）

342 条内置公式不够时，不必改代码：

| 级别 | 存放 | 范围 | 用法 |
|---|---|---|---|
| 全局公式包 | `$DSH_HOME/math-calc/formula-packs/global.json` | 所有工作区 | `tableAction:"global-add"` |
| 工作区临时公式 | 工作区 JSON | 单个世界观 | `tableAction:"add"` |

新增时校验器会挡住：非法 id、坏表达式、**表达式里未在 params/CONSTANTS 定义的符号**、参数缺描述。
字段说明与检查清单见 [docs/formula-authoring.md](../docs/formula-authoring.md)。

**符号消歧**：同一个字母在不同公式里含义不同（`m` = 质量/米）。
符号索引从公式参数自动生成，查询方式：

```jsonc
{"operation":"formulas","query":"symbol:m"}       // m 的全部含义
{"operation":"formulas","query":"symbol:m@质量"}   // 只看质量
{"operation":"formulas","query":"symbol:*"}        // 所有多义符号
```

**三轴标签**（分类不是学科，是「离底层规则的远近」）：

| 轴 | 取值 | 例子 |
|---|---|---|
| `layer` 规则层级 | fundamental / **mathematical**（与基本同级）/ derived / phenomenological / engineering / conventional | 洛伦兹因子→基本；圆面积→数学；环向应力→导出；风寒→经验；用砖量→工程 |
| `domains` 学科领域（多标签） | physics / materials / medicine / agriculture / military… | 人体表面积 = 生物 + 医学 |
| `frequency` 主角感知频率 | high / medium / low | 用砖量→高；洛伦兹因子→低 |

```jsonc
{"operation":"formulas","query":"layer:derived"}
{"operation":"formulas","query":"domain:物理"}
{"operation":"formulas","query":"freq:high"}
```

**按主角感知频率筛选**（不是世界观推导常用度，而是读者在故事里会不会感知到）：

```jsonc
{"operation":"formulas","query":"freq:high"}   // 高频：材料/天气/感知/交通/人体/战斗
{"operation":"formulas","query":"freq:low"}    // 低频：量子/核物理/相对论/金融
```

当前分布：高频 113 / 中频 199 / 低频 30（共 342 条）。

### 基础运算扩展

除了 mathjs 自带的能力，引擎里额外注册了这些（表达式里可直接用）：

| 函数 | 说明 | 例子 |
|---|---|---|
| `rank(A)` | 矩阵的秩（RREF 主元计数） | `rank([[1,2],[2,4]])` → 1 |
| `nullspace(A)` | 零空间的一组基 | `nullspace([[1,2],[2,4]])` → `[[-2,1]]` |
| `svd(A)` | 奇异值（AᵀA 的 Jacobi 特征值开方） | `svd([[1,2],[3,4]])` → `[5.465, 0.366]` |
| `factorize(n)` | 整数质因数分解 | `factorize(360)` → `[2,2,2,3,3,5]` |
| `nsolve(expr, guess)` | 数值求根（牛顿法 + 二分兜底） | `nsolve("x^2-2", 1)` → `1.41421356` |

另外修复了一个真实缺陷：`operation:"matrix"` 只给矩阵时会报「缺少 vector」，
连行列式和逆矩阵都算不了。现在只给矩阵会输出完整画像（秩 / 行列式 / 迹 / 奇异值 / 零空间 / 逆）。

### 化学窗口与生命闸门

按「只判绝对不行，其余交给叙事」的原则，`world` 会给出一个生命闸门：

| 档位 | 判定 | 例子 |
|---|---|---|
| **硬否决** | 物理上不可能 | 气压低于水的三相点、全星球低于冰点/高于沸点、化学窗口失效 |
| **强约束** | 可以写，但需要解释 | 恒星寿命 < 0.5 Gyr、潮汐锁定 + 稀薄大气、强紫外无屏蔽 |
| **开放** | 本模型不下结论 | 板块运动、细胞/多细胞、非水溶剂、智慧与文明 |

化学窗口由 α 决定：共价键能 ∝ α²。α 降到现实的 30% 时，键能只剩约 0.36 eV（14 kT），
分子会被热运动直接扯散——这是**硬否决**；α 升到 3 倍时键太强、重排困难，只算**强约束**。

> 注意区分两件事：**化学**（分子能否稳定，由 α 决定，本模块算）与
> **核合成**（碳元素能否生成，由 α_s 与 Hoyle 共振决定，本模型不覆盖）。

### 常数与宇宙（ADR-0001 新增）

改常数时最容易犯的错是「我把光速改成 1.5e8，宇宙就不一样了」。**物理上不成立**：c、G、h、kB 都是**有量纲**的，
单独改它们只是换了一套单位。真正决定世界长什么样的是**无量纲常数**：

| 常数 | 现实值 | 决定什么 |
|---|---|---|
| α | 1/137.036 | 原子大小、化学键能、光与物质作用 |
| μ = mₚ/mₑ | 1836.15 | 化学多样性、物质稳定性 |
| α_s | ≈0.118 | 核力、元素是否存在 |
| α_G | 5.9×10⁻³⁹ | 引力强度、恒星与行星形成 |

`operation:"constants"` 现在会多输出一段【无量纲视角】：判定这次改动是「换单位」还是「换物理」，
并由 α、μ 推出尺度阶梯（原子半径、里德伯能量、键能、材料强度、山峰尺度），每条都带置信度标签：

- **精确**：严格代数关系（a₀ = ħ/(mₑcα)、Ry = ½mₑc²α²）
- **标度**：形式正确但有一个地球标定系数（材料强度 S ∝ α⁵，基准 1.3×10⁸ Pa）
- **量级**：只保证数量级（化学多样性窗口、山峰尺度）

超出标定范围时**不拒绝回答**，而是降级并列出「与已知物理的张力」（例如 α 偏离 4% 以上，碳的恒星核合成就不再成立）。

**常数会真的传导进星球模型（S2）**：`world` 不再使用地球常数快照，而是读当前生效的常数表。
改 α 会改变材料强度（S ∝ α⁵）→ 山峰上限随之移动；改 G 会改变重力与逃逸速度；
气温直减率由 `Γ = g·M/(3.5R)` 推出，所以重行星/厚大气会自己得到不同的雪线。
现实常数下这些值与原实现完全一致（回归锚）。

### 抬头看宇宙（v4 新增）

`world` 的输出里现在多了两块**从地表观测者视角**推演的内容：

**【抬头看见什么】**
- **恒星的光谱与颜色**：表面温度 → 峰值波长（维恩位移）→ sRGB 色号 → 中文观感名；同时给光谱型（O/B/A/F/G/K/M）与典型吸收线（例如 M 型的 TiO 分子带吃掉蓝光，所以看上去橙红）
- **视星等与角直径**：以太阳 0.53° / −26.74 等为标尺
- **白天天空**：瑞利散射 1/λ⁴ 单次散射 → 天顶色与日落色（红矮星的白昼是橙金色，不是蓝的）
- **夜晚天空**：分开报「无月夜」与「满月夜」两种——极限星等、可见星数、银河是否可见、夜空基色

**【卫星系统】**
- 希尔球、洛希极限、稳定轨道区间
- 每颗卫星的角直径、满相视星等、潮汐强度、是否已被潮汐锁定
- **多卫星在物理上是否成立**：相邻卫星间距必须 ≥ 3.5 倍互相希尔半径，否则几十万年内失稳；同时检测轨道共振（1:2、1:3……）

```json
{"operation":"world","world":{
  "starClass":"M5V","orbitAU":0.2,
  "moons":[
    {"name":"银月","massMoon":1.2,"distanceMoon":0.8},
    {"name":"赤月","massMoon":0.4,"distanceMoon":2.2}
  ]}}
```

> **一条容易踩的物理红线**：卫星能放多远由**希尔球**决定。M5V 红矮星在 0.2 AU 时希尔球只有约 52 万 km，和地月的 38 万 km 同量级——所以「红矮星 + 多颗卫星 + 大轨道」这类设定经常直接不成立，插件会明确警告而不是照单全收。

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

// 4. 看全部 342 条公式相对现实的偏差
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

装机前先跑自检（会检查构建产物、入口契约、客户端席位、运行期依赖、package.json）：

```bash
npm run build
npm run test:all      # 33 套 / 1380+ 项
npm run preflight     # 一条命令判断「能不能装」
```

`preflight` 通过后再装；装的时候优先在隔离 profile 里试。


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
├── formula-library*.ts 342 条公式（5 个批次，含读者视角高频批）
├── constants-graph.ts  34 个常数的依赖图
├── quantities.ts       量纲分析与缩放指数
├── feasibility.ts      11 条设定约束
├── consequences.ts     跨尺度长链后果
├── world.ts / terrain.ts  星球与局地推演
├── sky.ts / moons.ts      地表观测（星空色谱/夜空亮度）与多卫星系统
├── workspace.ts        工作区隔离与持久化
├── formula-table.ts    工作区公式表
├── awareness.ts / detector.ts  模型感知
├── api.ts / client.ts  UI 后端与浏览器面板
└── ...
```

---

## 许可

MIT
