/**
 * 分节帮助系统。
 *
 * ## 为什么把摊平的 help 拆成目录
 *
 * 旧的 `opHelp()` 是**一整块 5900 字符**，每次调用都付全量成本。实测分段统计：
 *
 * ```
 *   世界观推演   3039 字符   ← 占 52%，但只在少数调用里用到
 *   求值与代数    612
 *   数据管理      557
 *   公式库        337
 *   其余各节合计  700 左右
 * ```
 *
 * 算一条 `1/3` 也要读 3039 字符的 derivation 子命令表与 world 字段表。
 * 而**平均只查一节时是 426 字符 —— 全量的 7%**。
 *
 * ## 三层结构
 *
 * ```
 *   第1层  help                              → 目录（节名 + 一句话简介 + 常见别名）
 *   第2层  help, helpTopic:"world"          → 该节完整正文
 *   第3层  help, helpTopic:"world"          → 正文里含逐字段表（默认值/单位/坑）
 * ```
 *
 * 目录层只保证「AI 知道有什么功能」，所以每节的 `summary` 必须**说清用途**：
 * 简介写得太省，AI 就不会去查，那个功能等于不存在。
 *
 * ## 正文可以写得比旧版更细
 *
 * 旧版为压 6000 字符上限，把字段表、默认值、常见坑都砍了。
 * 现在每节按需取用，**单节详细程度不再受总量约束** —— 只在真用那一节时付费。
 *
 * @module dsh-math-calculator/help
 */

import type { Outcome } from './ops/shared.js'
import { FORMULAS } from './formulas.js'
import { DERIVATION_SUBCOMMANDS } from './ops/derivation-op.js'

/**
 * 一节帮助：目录简介 + 正文生成器。
 *
 * `body` 用函数而不是字符串：正文里有 `FORMULAS.length`、
 * `DERIVATION_SUBCOMMANDS.length` 这类**运行期才知道的数**，写成函数才能取到真值。
 */
export interface HelpTopic {
  /** 目录键（`helpTopic` 取它）。 */
  key: string
  /** 中文标题。 */
  title: string
  /** 一句话简介：这节解决什么问题（目录层唯一可见的信息）。 */
  summary: string
  /** 常见别名，便于用直觉词命中也（如「概率」命中 dist）。 */
  aliases?: string[]
  /**
   * 频次档：`core` = 几乎每次都会用到，目录里占一行带简介；
   * `extra` = 低频，折叠成一行只给 key + 极短标签。
   *
   * ## 为什么要分档（用户 2026-11-07 要求）
   *
   * 「加减乘除高频其余低频可以折叠」——目录每轮都要付费，
   * 而 12 节里真正高频的是 evaluate / units / formula 这几节。
   * 把低频节压成一行，省下的字给高频节写更详细的正文。
   *
   * 折叠不等于藏起来：key 与极短标签仍然列在目录里，
   * 只是不再为它们付「一句话简介 + 别名清单」的成本。
   */
  tier: 'core' | 'extra'
  /** 折叠档用的极短标签（≤8 字，目录里跟 key 同行）。 */
  short?: string
  /**
   * 实测使用频率（越大越高频）。数据来自「实践文档」里各能力被提到的次数。
   *
   * ## 为什么用实测而不是凭直觉分档（用户 2026-11-07 要求）
   *
   * 「高低频根据目前的实践文档进行统计频率来调整显示」——
   * 我原先的分档是凭印象定的（evaluate/units/formula/world 四节 core），
   * 而实测信号量是：
   *
   * ```
   *   evaluate 250   units 173   solve 59   formula 28
   *   workspace 28   world 26    derivation 21   recipe 17
   *   matrix 11      stats 11    constants 5    balance 5    ode 4
   * ```
   *
   * 与直觉的两处出入值得记：
   *   · `solve` 59 排第三，却原来被折在 evaluate 里没有独立位置；
   *   · `workspace` 28 与 formula 并列，凭印象时被我低估了。
   *
   * 这个数只用于**排序与分档参考**，不直接决定显示 ——
   * 分档还要看「它是不是一个独立操作」，例如 workspace 虽高频但不该占 core 位置。
   */
  weight?: number
  /** 该节正文。 */
  body: () => string
}
/**
 * `evaluate` 节（最常用的一节，写得最细）。
 *
 * ## 为什么它排第一且有最多细节
 *
 * 实测 1107 报告的四起千倍级事故，共同形式都是**全部转成裸数字再算**。
 * 报告原话：「help 里确实有 5 cm to inch，但被埋在第 4 个例子，
 * 且没有任何一句说『所有物理量计算都带单位』。」
 *
 * 所以这一节要讲清三件事：带单位写、批量元素两种形态、量纲错误长什么样。
 */
const EVALUATE_BODY = () => [
  '【evaluate】任意 mathjs 表达式，BigNumber 高位精度。',
  '',
  '★ 物理量一律带单位写 —— 带单位时量纲错误会被当场拦下：',
  '    好：(10 hp/0.475) to kW、28000 BTU/lb to MJ/kg、(5 inch)^3 to cm^3',
  '        (0.5 * 117 g * (900 ft/s)^2) to J、30 里 to km、1800 grain to g',
  '    差：10*745.7/0.475 —— 裸数字无从判断 745.7 是瓦还是千瓦，',
  '        同一批里 0.907/(10*745.7/…)*60 与 0.907/(10*0.7457/…)*60 会一个算成',
  '        0.369、一个算成 368.9，而工具无法告诉你哪个对。',
  '',
  '【带单位时的量纲校验】',
  '  10 hp + 3 kg        → unit_mismatch（两侧必须同量纲）',
  '  1 m + 1 s           → unit_mismatch',
  '  光年 to kg          → 量纲不符（长度 vs 质量）',
  '',
  '【单位换写的三种写法】',
  '  5 cm to inch        后缀式（最常用）',
  '  to(5 cm, inch)      函数式',
  '  (10 hp/0.475).to("kW")   点式',
  '  ★ 写了目标单位时**不会被输出层改写**；没写时才归到常用档',
  '    （1e6 m → 1 Mm、1e12 g → 1 Mt、2.66e8*330 kg → 87.78 Mt）',
  '',
  '【显式精度】precision（计算位，默认 64）与 displayPrecision（小数位，默认 8）',
  '  1/3                      → 0.33333333（默认 8 位小数）',
  '  1/3, displayPrecision:0  → 0（只留整数）',
  '  ★ 调低 precision 会算错大数：(10^20+1)-(10^20) 在 precision=20 得 0',
  '',
  '【批量】expressions 一次算多条，逐条独立报错（一条错不影响其它条）',
  '  元素两种写法：字符串 "1/7"，或对象 {label:"名称", expr:"算式"}',
  '  ★ "标签=表达式" 这种写法不支持（= 左边是中文标识符，会报 syntax）',
  '  例：[{label:"煤砖含能", expr:"2 lb * 28000 BTU/lb to MJ"}, "1/7"]',
  '  terse:true 只回「表达式 = 结果」，省 token；失败行照常标出，不藏风险。',
  '',
  '【带单位的变量与公式】变量可以给带单位的量，量纲自动参与运算：',
  '  variables:{V:"10 m/s", T:"1 s"}, expression:"V*T"   →  10 m',
  '  也支持中文单位：variables:{V:"30 里/h", T:"2 时辰"}  →  60 km',
  '  链式赋值同样可用：["V=10 m/s", "T=1 s", "L=V*T"]',
  '  ★ 公式的参数也可以带单位，工具会校验量纲并换算到该参数声明的单位：',
  '    formula:"velocity_uniform", overrides:{s:"60 里", t:"2 时辰"}',
  '      → 结果 2.08333333 m/s；【单位换算】说明换成了什么',
  '      → 【同体系折算】约 30 里/时辰（输入用了里、时辰就折回里、时辰）',
  '    量纲不符会当场报错（把 kg 传给位移参数），不会静默按数字算。',
  '  ★ 裸数字照旧接受 —— 工具不猜 10 是米还是公里。',
  '',
  '【批量里的 ok 契约】',
  '  全成功  → ok=true',
  '  有失败  → ok=false + partial=true + failed=N + succeeded=M',
  '  ★ 单条与批量对非有限值（1/0、log(0)）的判断完全一致，都报 non_finite',
  '  复数是正常结果（sqrt(-1) → i），不算失败。',
  '',
  '【常见语法】2**10、π、2 × 3、6 ÷ 2、ln(10) 都能直接写。',
  '  三角函数默认弧度：sin(30) = -0.988，要角度请写 sin(30 deg)。',
].join('\n')

/** 【代数与微积分】求解/方程组/符号运算。 */
const ALGEBRA_BODY = (): string => `【解方程与微积分】

  solve        解方程。多方程用逗号分隔 = 方程组
                 3x + 2y = 10, x - y = 1   → x=2.4, y=1.4
                 x^2 - 5x + 6 = 0          → x=2, x=3
                 x^3 - 6x^2 + 11x - 6 = 0  → x=1, 2, 3（三次也解）
               ★ 退化方程组会说「无穷多解」，不静默给单解 ——
                 那正是最容易把错答案当对的场景。
               ★ 无解时会说「无解」，不给一个近似值糊弄。

  system       显式线性系统（matrix 系数 + vector 右端项）
                 例：{matrix:[[3,2],[1,-1]], vector:[10,1]}  ← 3x+2y=10, x-y=1
               与 solve 的区别：solve 吃方程文本，system 吃矩阵。
               两者都能解同一组方程；**大方程组用 system 更清晰**。

  derivative   符号求导，variable 指定自变量（默认 x）
                 例：{expression:"x^3*sin(x)", variable:"x"}

  integral     符号积分。给 from/to 就做定积分
                 ★ 定积分用 **Fraction 引擎**代入上下限，不出 8.9999… 这类尾差
                   （BigNumber 的 1/3 是截断小数，乘 27 回不到整数）

  simplify     化简（含三角恒等式）
  expand       展开（多项式与二项式）
  roots        多项式求根（含复数根）

【扩展函数】
  rank(A) 秩 / nullspace(A) 零空间 / svd(A) 奇异值
  factorize(n) 整数分解 / nsolve("表达式", 初值) 数值求根

  ★ 这些函数在 evaluate 里也能用（它们是注册进 mathjs 的）。
    例如 {expression:"rank([[1,2],[2,4]])"} → 1（两行线性相关）`

/** 【线性代数】矩阵与特征值。 */
const LINALG_BODY = (): string => `【线性代数】

  matrix       矩阵运算。代入 mathjs 表达式，所以可以直接写算式：
                 {matrix:[[1,2],[3,4]]}                只给矩阵 → 输出完整画像
                 {expression:"[[1,2],[3,4]] * [[5],[6]]"}   矩阵乘向量
                 {expression:"inv([[1,2],[3,4]])"}        求逆
                 {expression:"det([[1,2],[3,4]])"}        行列式
                 {expression:"transpose([[1,2],[3,4]])"}   转置
                 {expression:"trace([[1,2],[3,4]])"}      迹

                ★ 只给 matrix 时输出的是**完整画像**，不只是结果：
                  秩 / 行列式 / 迹 / 奇异值 / 零空间 / 逆
                  这套画像用来看「这个矩阵有没有信息量」——
                  秩为 1 说明所有行线性相关，那方程组就无唯一解。

  eigen        特征值与特征向量（复数特征值也支持）
               例：{expression:"eigen([[2,0],[0,3]])"}

  system       解线性方程组，给 matrix（系数）与 vector（右端项）
               例：{matrix:[[3,2],[1,-1]], vector:[10,1]}  ← 解 3x+2y=10, x-y=1

  ★ 秩与零空间常被忽略但很有用：
    rank 小 → 方程组不独立，会得到「无穷多解」而非唯一解
    nullspace 给出那些「解不出来」的方向，是理解退化方程组的钥匙

  ★ 本工具不做数值优化（最小二乘、SVD 压缩这类），
    需要时用 expressions 手写，或退回 operation="evaluate"。`

/** 【统计与概率】描述统计/分布/回归。 */
const STATS_BODY = (): string => `【统计与概率】

  stats        描述统计，一次给全套：
               均值 / 中位数 / 众数 / 方差 / 标准差 / 分位数 / 偏度 / 峰度
               例：{operation:"stats", data:[1,2,3,4]}
               ★ 均值与中位数差得远，说明数据偏斜（少数极值拉动了均值）——
                 这是判断「平均数能不能用」的第一眼信号。

  dist         概率分布。三个参数：distribution 选型 / params 给参数 / x 给求值点

               normal      params:[均值, 标准差]     正态分布
               binomial    params:[n, p]              二项分布（n 次试验成功 p 次）
               poisson     params:[lambda]            泊松分布（单位时间事件数）
               exponential params:[lambda]            指数分布（等待时间）
               chisquare   params:[df]                χ² 分布
               t           params:[df]                t 分布（小样本）
               normalinv   x=分位数 → 给出对应的值（正态反查）
               quantile    x=分位数 → 给出分位数值

               ★ 给出的是 CDF 或 PDF，取决于分布定义——看输出里写的是哪个，
                 别凭分布名猜。

  regression   线性与多项式回归
               degree 指定次数（默认 1 = 线性）
               返回系数与 **R²**
               ★ R² 接近 1 不代表因果成立，只说明拟合贴合——
                 这是最常见的误读，尤其在「用拟合曲线论证规律」时。

  ★ 概率类常用场景：
    两年一遇的洪水 → 求超越概率 0.5 对应的重现期
    「这个数字落在正常区间的概率」→ normal + CDF
    A/B 结果差异是不是巧合 → t 分布`

/** 【微分方程】ODE 数值解。 */
const ODE_BODY = (): string => `【微分方程】ode 数值求解（RK4）

  一阶方程组（SIR / 捕食模型）与二阶方程（自动降阶）都能解。

  参数：
    expression  状态方程，多个用分号分隔。等号左边是导数变量
                例："S'=-k1*S*I; I'=k1*S*I-k2*I; R'=k2*I"   ← SIR 传染病
                    "x'=y; y'=-k*x"                        ← 简谐振子
    initial     初值对象 {S:999, I:1, R:0}
    from/to     积分区间（默认 0 → 10）
    steps       RK4 步数（默认 1000，刚性方程要加大）
    samples     返回的采样点数（默认 24，只要不爆内存可以调大）

  返回：轨迹（时间序列）、终点值、极值、**发散警告**

  ★ 二阶方程降阶：y'' 要写成 y'=y_d; y_d'=…，y_d 表示 dy/dt。
    缺了辅助变量会提示补哪个，不会静默给错。

  ★ 数值解不是解析解：steps 太少会失真，且刚性方程（变化极快）
    容易发散——看到发散警告就加大 steps，或换解析思路。

  ★ 写故事时的常见用法：
    传染病扩散（SIR）、捕食者-猎物振荡（Lotka-Volterra）、
    碳循环、人口动态、冷却曲线`

/** 【公式库】442 条公式的调用与检索。 */
const FORMULA_BODY = (): string => `【公式库】共 ${FORMULAS.length} 条自然科学公式
  formula      调一条公式：formula="escape_velocity", overrides={M,r}
               ★ overrides 可覆盖任意参数 —— 这是架空世界改造的关键
               例：把重力改成 1.5 倍地球 {"g": 14.71}；光速 {"c": 1e8}
               ★ 错拼的 key 会点名上报，不会静默忽略
  ★ 新补充的领域（写世界观常用）：
    engineering/structures  梁柱应力/挠度/惯性矩/螺栓焊缝（7 条）
    engineering/thermal     卡诺效率/蒸汽功率/煤耗/换热/导热（5 条）
    engineering/fluid,energy 管流/水头损失/泵/孔口/风电/水电（6 条）
    biology/ecology         载畜量/出栏/料肉比/NPP/营养级（5 条）
    econ/macro              劳力/总产出/储蓄/资本产出比/货币供应/通胀（6 条）

  formulas     检索与分类：
               query="关键词"        按名称/关键词（如 "重力"、"人口"）
               query="layer:derived" 按规则层级
                 fundamental 基本规则 / mathematical 数学基础（与基本同级）
                 derived 派生 / phenomenological 唯象
                 engineering 工程 / conventional 惯例
               query="domain:物理"   按学科领域（多标签）
               query="freq:high"     按主角感知频率（high/medium/low）
               query="symbol:m"      按符号含义
               query="*" 或留空      列出全部分类
  formula-table 两级扩展：工作区临时公式（覆盖/自定义/停用）+ 全局公式包
               tableAction: global-list / global-add / global-remove
               字段与校验规则见 docs/formula-authoring.md`

/** 【单位换算】与输出单位策略。 */
const UNITS_BODY = (): string => `【单位换算】把「三里」「两丈」「五百斤」换成标准单位
  units        例：unitValue=30, unitFrom="里", unitTo="km" → 15 km
               不带单位参数 → 列出全部可用单位（分类计数 + 示例）
               自创单位用 customUnits 覆盖：
                 [{name:"里", dimension:"length", factor:576}] → 30 里 = 17.28 km
               支持：中文古制（里/丈/尺/寸/步/亩/顷/斤/两/石/斗/刻/时辰/更）、
                     英制（英里/英尺/磅/加仑/盎司/格令）、天文（AU/光年/秒差距）
                     以及 32 个量纲的科学单位（电/光/核/化学计量）
  terse:true   只回一行结果，保留适用域提示

【输出单位策略】先归到**常用档**，再按需叠 SI 前缀 k/M/G/T/P/E/Z/Y/R/Q：
  质量 t（→ kt/Mt/Gt/Tt…）｜ 长度 m/km（→ Mm/Gm/Tm…）
  时间 s/min/h/day/year ｜ 功率/能量 W/J（→ kW/MW、kJ/MJ…）｜ 压强 Pa
  例：1e12 g → 1 Mt（不是 1 Tg）；1e9 m → 1 Gm；1e12 W → 1 TW
  ★ 整数一律完整输出（10^20+5 一位不少），批量显示另补千分位分组
  ★ 你写了 to/换算目标时不会被改写，只有没写时才归位

【单位歧义披露】1 t 会给注「公制吨 = 1000 kg，英制长吨请写 longton」；
  30 里 会给注「市里=500m。古代差异极大：周制约 415m、秦汉约 415m、清制 576m」。
  evaluate 里现在也能直接写 mph / kn / rpm / inHg / cal / gauss / slug / shortton。`

/** 【世界观推演】world 完整字段表 —— 旧版为了压总量砍掉了细节，现在可以写全。 */
const WORLD_BODY = (): string => `【世界观推演】world 输入星球参数 → 体感画像
  world        重力/昼夜/季节/纬度气候/地形上限 + 天空配色/恒星结构与寿命/
               卫星系统/化学窗口/生命闸门/跨模块一致性检查
  例：{operation:"world", planetMass:0.75, starTemp:5000, terrain:{kind:"coastal"}}

  ★ 全部字段可选，默认地球。计步单位见括号。

  【恒星】
    starMass        太阳质量倍数，默认 1
    starRadius      太阳半径倍数，默认 1
    starTemp        表面温度 K，默认 5778
  【轨道】
    orbitAU         轨道半径 AU，默认 1
    eccentricity    偏心率，默认 0.0167
  【行星】
    planetMass      地球质量倍数，默认 1
    planetRadius    地球半径倍数，默认 1
    rotationHours   自转周期小时，默认 23.93
    obliquityDeg    轴倾角 度，默认 23.44
    albedo          反照率，默认 0.306
  【大气】
    pressure        地表气压 Pa，默认 101325
    molarMass       平均摩尔质量 kg/mol，默认 0.02896
    gamma           比热比，默认 1.4
    greenhouse      温室增温 K，默认 33
  【地表】
    materialStrength 材料强度 Pa，默认 1.3e8（花岗岩）
    materialDensity  材料密度 kg/m³，默认 2700

  【地形 terrain】（给了才输出局地气候细节）
    kind            coastal/plain/plateau/mountain/valley/desert/
                    forest/tundra/island/lake
    elevation       海拔 m
    latitudeDeg     纬度 度
    distanceToSea   距海 km
    annualPrecipMm  年降水 mm
    humidity        湿度 0-1
    windward        1 迎风 / -1 背风
    reliefHeight    地形起伏 m
    oceanCurrent    warm/cold/none
    surface         soil/sand/rock/ice/water/vegetation

  ★ 两个经常被误解的点：
    1. 行星质量/半径/轨道与 α、c 等常数**无关**，改常数不该让它们变；
    2. 恒星不给时**不会**静默替换成太阳 —— 会用默认值但明确声明用了什么。`

/** 【常数推演】constants / quantities / impact。 */
const CONSTANTS_BODY = (): string => `【常数推演】改变物理常数，自动推导派生量并评估世界偏离度
  constants    改常数：{constants:{c:1.5e8}} → mu0/sigma/alpha_fs 自动重算
    【可改的基础旋钮】
      c(光速) / G(引力常数) / h(普朗克) / kB(玻尔兹曼) / e_charge(元电荷)
      me(电子质量) / mp(质子质量) / NA(阿伏伽德罗) / epsilon0(真空介电常数)
    【派生量，自动跟随，不能直接改】
      hbar / R / mu0 / kCoulomb / sigma / bWien / alpha_fs / Ry / muB
  quantities   看哪些物理量该跟着变、哪些不该（量纲分析 + 缩放指数）
  impact       改常数后跑全部公式并与现实对比，算每条偏差
  ★ 常数指纹进缓存键：改了常数后绝不会拿到旧宇宙的数`

/** 【收支与天体】balance / bodies。 */
const BALANCE_BODY = (): string => `【收支盘点】balance 多项一起看，给最短板
  例：balance={grain:{demand:2.7e6, supply:3.1e6, unit:"kg/年"}}
  可同时给 grain(粮)/water(水)/energy(能)/land(地)/finance(财政)/
           military(军费)/information(信息)
  回答「这个王国养不养得起二十万兵」这类问题
  ★ 单项生理/工程上限用 feasibility，社会收支用 balance，两者不互相替代

【天体目录】bodies
  bodyName="mars"        查单个天体
  bodyKind="moon"        按类别筛（star/planet-terrestrial/
                          planet-gas-giant/moon/dwarf-planet 等）
  不带参数                列出全部（太阳系 8 大行星 + 卫星 + 系外行星 + 恒星）
  bodyType="中子星"       查天体类型学条目，每类标证据等级与物理锁死项
  bodyEvidence="observed" 按证据等级筛：observed(已观测) /
                          theoretical(理论预言) / speculative(纯思辨)
  bodyConstant="alpha_fs", bodyFactor=2
                          改常数后看哪些天体数据该重算
  ★ 输出分「必须重算」与「绝不该动」两块 ——
    行星质量/半径/轨道与 α 无关，绝不跟着改`

/** 【推演栈】derivation 的 29 个子命令。旧版挤成一行行，现在可以逐个说清。 */
const DERIVATION_BODY = (): string => `【推演栈】derivation 子命令（共 ${DERIVATION_SUBCOMMANDS.length} 个）
  入口：{operation:"derivation", derivation:"stack"}（不给 derivation 会列出全部）

  【推演流程】
    stack        推演栈总览（八层结构）
    cards        接口卡
    pipeline     正向推演链路 world → P1—P5 逐层判定
    checklist    检查表
  【判定与兜底】
    dead         死寂态：判定 + 结语 + 挽救方向
    chaos        混沌拦截（误差超 100% 时明确说不可预测）
    flip         结论翻转判定：数值变了 ≠ 结论翻了
    observer     观测者物理过滤（人择选择效应）
  【反推与探查】
    anchors      逆推校准（七张表持久化 + 版本对比）
    backSolve    逆向求解
    sensitivity  敏感度，参数 base + exponent
    phase        相图
    heatmap      热力图（没有解的区域会明说）
    graph        依赖图，graphDepths 控制深度
    timeline     时间轴，参数 from / to / steps
    compare      A-B 对比
    diff         版本差异
  【档案】
    archive      档案
    history      历史
    tables       数据表
    whitepaper   白皮书导出，whitepaperMode
    trace        溯源，traceTarget 指定目标
  【算力】
    cost         算力预算：costKind / costX / costY / costIterations / costCombos
                costWithPipeline 可把推演链一起估
  【叠加层】
    fantasy      幻想层（叠加能力，只提醒不反驳）
                fantasyAbility / fantasyDemand / fantasyPhysical / fantasyBodyArea
    civilization 文明极限（能量/材料/交通/技术树）
    dimensionless 无量纲分析
    inherit      继承：inheritBase / inheritDerived / inheritSync
    units        单位陷阱检查
    impact       影响评估`

/** 【数据管理】workspace 与工作区变量。 */
const WORKSPACE_BODY = (): string => `【数据管理】workspace 工作区管理
  一个世界观 = 一套常数表 + 公式表 + 地点 + 变量，工作区之间完全隔离
  action2: list / show / create / switch / save / set / add-terrain / delete / reset
           stats / cleanup 查看存储与清理

  【命名变量】存进去之后不必每次重打：
    1) {action2:"set", workspaceVariables:{BTU_LB:1260000}}   存进去（默认不参与计算）
    2) {action2:"set", useWorkspaceVariables:true}            启用（★ 必须走 action2:"set"）
       ⚠ 在 evaluate 上传 useWorkspaceVariables 不生效，它会被忽略
    3) 之后 evaluate 可直接用变量名：BTU_LB * 1e8
       ★ 本次调用的 variables 参数优先于工作区值
       ★ 改变量会让缓存失效，避免拿到改之前的数

  【显示精度固化】{action2:"set", displayPrecision:4} 固化；传 0 = 清除
  【注意】本插件无图形界面，全部经工具与 HTTP 路由操作`

/** 【常见配方】跨节的组合用法。 */
const RECIPE_BODY = (): string => `【锚点 sanity】工具不知道这个数该多大，但你可以逐条声明判据
  {label:"日产台数", expr:"1e8*25000", sanity:{max:1e10, note:"帝国总兵力"}}
  → ⚠ 超出锚点上限 1e10（帝国总兵力）达 250 倍
  键：max 上限 / min 下限 / expect 期望量级（expect:3 即 10³）/ note 依据
  ★ 判据来自你，工具只比对不猜；量纲不可比时不报；不声明则零提示
  ★ 目前只在批量 expressions 里生效

【账本闭合】无独立 check 操作，一条 expressions 逐项列值即可：
  [{label:"A", expr:"650*3840"}, {label:"四项和", expr:"…"}]
  再补一条 {label:"与目标之差", expr:"...-4075000"}  ← 差值 0 即闭合
  不做 PASS/FAIL：差 3 与差 3% 是两回事，压成布尔就糊了

【多步链】批量内前一条的赋值对后一条可见：
  [{label:"单价", expr:"u=5"}, {label:"小计", expr:"u*3"}]
  ★ 中间某步失败时，依赖它的下游会明确报错，不会变成「虚成功」

【失败时】返回 ok=false + error.type / message / hint，按 hint 修正即可，不会崩溃。
  常见 error.type：
    non_finite         结果非有限（除以零、log(0)）
    unit_mismatch      两侧单位不同量纲
    unknown_symbol     变量/函数未定义
    unit_name_conflict 目标单位名撞内置函数（1 s to min → 写 minute）
    not_a_quantity     to 左边不是带单位的量（裸数字没有单位可换）
    unknown_argument   参数名认不出来（会点名是哪个）`


/**
 * 【工程 / 生物 / 宏观】专节 —— 覆盖写世界观最常用的三块。
 *
 * ## 为什么单独成节
 *
 * 这三块是本次新增的 29 条公式的落点，但它们在目录里跟「统计」「线代」混在一起时
 * 读者不会想到去查。单独一节把「我要算这座塔立不立得住」直接对上一个 key。
 *
 * ## 内容比旧版细得多
 *
 * 旧版 6000 字总预算下，每节只能给十几个字。现在每节按需付费，
 * 所以这里把**每条公式的适用域、典型取值、以及它会教你的那条 scaling 律**都写出来 ——
 * 那些才是判断「这个数合不合理」时真正要用的。
 */
const DOMAINS_BODY = (): string => `【工程 / 生物 / 宏观】三块的常用算式（共 29 条，公式库里按 id 调用）

调用方式与其它公式一样：{operation:"formula", formula:"id", overrides:{参数}}
参数可带单位（"10 km"、"2 时辰"），会校验量纲并换算。

════ 工程·结构（engineering/structures）════
  beam_section_modulus      抗弯截面系数 W = b·h²/6
                            ★ 梁要高不要宽：高度翻倍，抗弯能力 4 倍
  beam_bending_stress       弯曲应力 σ = M/W（输出 MPa）
                            与屈服强度比即知安全；钢梁许用应力取屈服 1/1.5~1/2
  rect_inertia              惯性矩 I = b·h³/12
                            ★ 高度的**三次方**——「梁要竖着放」的数学理由
  beam_self_weight_moment   自重跨中弯矩 qL²/8
                            ★ 跨度的**平方律**：跨度翻倍，弯矩 4 倍
                            大跨度结构必须先算这项，否则漏掉最主要的荷载
  beam_uniform_load_deflection 均布挠度 δ = 5qL⁴/(384EI)
                            ★ 跨度的**四次方**：跨度翻倍，挠度 16 倍
                            所以桥梁不能靠「加厚」延长跨度，必须改结构形式
  bolt_shear_capacity       螺栓抗剪 F = n·τ·π·d²/4（4.6 级 τ≈141 MPa）
                            ★ 承压型高强螺栓靠摩擦传力，不按这个算式
  weld_throat_capacity      角焊缝 F = 0.707a·L·τ（喉部有效厚度 0.707a）

════ 工程·热机与能量（engineering/thermal, energy）════
  thermal_efficiency_carnot 卡诺上限 η ≤ 1 − Tc/Th
                            ★ **绝对温度**不是摄氏度；300K/500K 之间上限 40%
                            加多少煤都没用——只能提高热源温度或降低排热温度
  steam_power_output        P = ṁ·Δh·η（Δh 焓差 J/kg）
                            ★ 汽轮机 η≈0.35，往复式 η≈0.12：同功率只需 1/3 蒸汽
                            这个 3 倍差距决定蒸汽朋克的煤耗与锅炉体积
  boiler_coal_rate          每小时耗煤 = P/(cv·η)×3600（标准煤 2.93e7 J/kg）
                            ★ 用「多少吨煤」比「多少瓦」更有体感
  heat_exchanger_duty       Q = U·A·LMTD（对数平均温差）
                            ★ 同样两端温差，逆流 LMTD 明显大于顺流——好换热器都做成逆流
                            dT1 与 dT2 不能相等（那对应换热面积无穷大）
  conduction_wall_loss      Q = k·A·ΔT/d
                            ★ 岩棉 k=0.04、钢 45 —— 差 1000 倍
                            10 cm 岩棉 ≈ 100 m 钢，这是「隔热好不好」的量化说法
  wind_power_available      P = ½ρA·v³·Cp
                            ★ 风速的**三次方**：5→10 m/s，功率 8 倍（最反直觉的一条）
                            贝茨极限 0.593 是理论上限，实用 0.35~0.45
  water_turbine_power       P = ρ·g·Q·H·η（与水泵恰好相反：η 是乘的）

════ 工程·流体与管路（engineering/fluid）════
  pipe_flow_rate            Q = v·π·d²/4
                            ★ 管径翻倍，流量 4 倍——扩一倍口径顶四条旧管
  darcy_head_loss           h = f·(L/d)·v²/(2g)
                            ★ 流速的平方：流速翻倍损失 4 倍
                            所以长距离输水宁可加大管径降流速（经济流速 1~2 m/s）
  pump_power                P = ρ·g·Q·H/η（扬程含沿程损失）
                            流量与扬程都是相乘，任一翻倍功率就翻倍
  orifice_discharge         Q = Cd·A·√(2gh)
                            ★ 水头的**平方根**：流量翻倍要水头 4 倍
                            水库泄洪、攻城水攻、倒水时间估算都用它

════ 生物·生态（biology/ecology）════
  grazing_capacity          载畜量 = 面积×产草量×利用率/(采食量×天数)
                            ★ 利用率取 0.5 不是保守而是必需：超载后草地退化，第二年产量腰斩
                            温带草原 2000~5000 kg/(ha·年)，牛采食 40~60 kg/日
  livestock_growth_time     (出栏重−初生重)/日增重
                            ★ 猪≈180 天、牛≈450 天、肉鸡≈42 天；这个比值决定肉价与周转率
  feed_conversion_ratio     料肉比 = 耗料/增重
                            ★ 牛 6~8、猪 2.5~3.5、鸡 1.6~2.0
                            直接决定「养一头牛要多少亩地」；牛高是反刍维持消耗大，不是品种差
  crop_yield_npp            可收获干物质 = NPP×面积×收获指数
                            ★ 谷物收获指数 0.4~0.5 —— 六成生物量是秸秆（饲料与燃料的来源）
  trophic_chain_support     每级只剩约 10%
                            ★ 养活 1 kg 狼要 10 kg 兔、100 kg 草
                            这解释了为什么食物链一般不超过 5 级，也立刻否掉「满地猛兽」

════ 宏观·经济（econ/macro）════
  labor_force               劳力 = 人口 × 参与率（农业社会 0.45~0.55）
                            ★ 0.45 里含着大量童工与老人——决定「能征多少兵、能修多大工程」
  gdp_from_labor            产出 = 劳力 × 人均产出
                            ★ 想提高总产出只有两条路；长期增长几乎全靠提高单产
  macro_savings_rate        可投资额 = 产出 × 储蓄率
                            ★ 增长燃料：东亚高速期 0.3+，贫困农业社会几乎攒不出投资
  capital_output_ratio      所需资本产出比 = 储蓄率/增长率
                            ★ 储蓄率 10%、目标增长 5%，需要资本产出比 2；实际要 4 就达不到 5%
                            这条能立刻判断增长目标现不现实
  money_supply_from_base    广义货币 = 基础货币 × 乘数
                            ★ 金属货币制乘数≈1，现代部分准备金 8~12
                            这解释了为什么古代通胀罕见而现代可以剧烈
  inflation_from_money_growth  通胀 ≈ 货币增速 − 产出增速
                            ★ 0.15 对 0.03 即约 12%，三年物价翻倍
                            「滥发货币导致崩溃」时用它量化

★ 这些式子的共同特点：**缩放律比绝对值更重要**。算出来的数可以偏，
  但「跨度翻倍挠度 16 倍」这类关系错了就是硬伤——那是判断合不合理的第一道关。`
/**
 * 各节注册表。**顺序即目录顺序**，而顺序决定「AI 会不会翻到它」。
 *
 * 排前面的是高频或高风险节：`evaluate` 最常用、`world` 体量最大。
 * `recipe` 放最后是因为它是跨节组合，读它之前一般已经读了几节。
 */
export const HELP_TOPICS: HelpTopic[] = [
  /**
   * ## 分档依据：实践文档实测信号量（用户 2026-11-07 要求）
   *
   * 「高低频根据目前的实践文档进行统计频率来调整显示」。
   * 6 份实践文档合计 6.1 万字符，按能力关键词统计后：
   *
   * ```
   *   evaluate 250  units 173  solve 59  formula 28
   *   workspace 28  world 26   derivation 21  recipe 17
   *   matrix 11     stats 11   constants 5  balance 5  ode 4  bodies 0
   * ```
   *
   * ## 分档不只看信号量，还看「是不是独立操作」
   *
   * · `solve` 59 排第三，**原来被折在 evaluate 里**——这是分档时最容易漏的，
   * 实测才看出来它该独立。
   * · `workspace` 28 与 formula 并列，但它是**低频操作**（一个会话通常切换一两次），
   * 不该占 core 的目录位，保留 extra。
   * · `bodies` 信号量 0，但它是**新功能**（用户还没用过），折在 balance 里一并说明。
   *
   * 所以分档 = 信号量排序 + 人工判断「独立操作 / 一次性配置 / 冷启动功能」。
   */
  {
    key: 'evaluate',
    tier: 'core',
    /** 实践文档信号量 250，断层第一：算术/带单位/批量/label 全落在这一节。 */
    weight: 250,
    title: '求值（evaluate）',
    summary: '算一条式子。物理量带单位写，量纲错当场拦下；批量一次多条。',
    aliases: ['算式', '计算', '求值', 'mathjs', 'expression'],
    body: EVALUATE_BODY,
  },
  {
    key: 'solve',
    tier: 'core',
    /**
     * 信号量 59，排第三 —— 原来被折在 evaluate 里，实测才看出来它该独立。
     * 现实里「解方程」与「算一条式子」是两种不同的心智动作，
     * 前者要写方程、要看解的形式（唯一解/无穷多解/无解）。
     */
    weight: 59,
    title: '解方程与微积分（solve / derivative / integral）',
    summary: '解方程与方程组、符号求导积分。退化方程组会说「无穷多解」而非静默给单解。',
    aliases: ['方程', '求解', 'solve', '积分', '求导', '微积分', 'algebra'],
    body: ALGEBRA_BODY,
  },
  {
    key: 'units',
    tier: 'core',
    /** 信号量 173：中制单位（里/丈/斤/亩）与 to 换算在各文档频繁出现。 */
    weight: 173,
    title: '单位换算与输出单位（units）',
    summary: '中外古今单位换算、自定义单位，以及输出为什么是大数配吨/公里。',
    aliases: ['单位', '换算', '里', '丈', '斤', '亩', 'unit', 'conversion'],
    body: UNITS_BODY,
  },
  {
    key: 'formula',
    tier: 'core',
    /** 信号量 28。 */
    weight: 28,
    title: '公式库（formula / formulas）',
    summary: `调 ${FORMULAS.length} 条公式、overrides 改造参数（架空世界的关键）、按层级/领域检索。`,
    aliases: ['公式', 'formula', '检索', 'overrides', '覆盖参数'],
    body: FORMULA_BODY,
  },
  {
    key: 'world',
    tier: 'core',
    /** 信号量 26。 */
    weight: 26,
    title: '世界观推演（world / 地形 / 气候）',
    summary: '星球参数得体感画像：重力昼夜气候、天空、恒星寿命、卫星、生命闸门。★ 完整字段表在这里。',
    aliases: ['星球', '世界', '重力', '气候', '恒星', '地形', 'world', 'planet'],
    body: WORLD_BODY,
  },
  /**
   * ## extra：低频，折叠成一行 key + 短标签
   *
   * 用户原话：「加减乘除高频其余低频可以折叠。」
   * 折叠不等于藏起来 —— key 与六字标签仍在目录里，AI 能看见并可以查，
   * 只是不再为它们付「一句话简介 + 别名清单」的成本。
   */
  {
    key: 'domains',
    tier: 'core',
    /** 新增节，文档中尚无信号；按用户明确要求保留 core。 */
    weight: 0,
    title: '工程 / 生物 / 宏观（29 条领域公式）',
    summary: '梁柱应力挠度、热机效率煤耗、管流泵功率、载畜量营养级、劳动力货币通胀。每条都写了 scaling 律。',
    aliases: ['工程', '生物', '经济', '宏观', '建筑', '结构', '热机', '流体', '生态', '畜牧', '通胀'],
    body: DOMAINS_BODY,
  },
  {
    key: 'linalg',
    tier: 'extra',
    /** 信号量 11。 */
    weight: 11,
    short: '矩阵/特征值',
    title: '线性代数（matrix / eigen）',
    summary: '矩阵运算、特征值；只给 matrix 时输出秩/行列式/奇异值/零空间/逆的完整画像。',
    aliases: ['矩阵', '行列式', '特征值', 'matrix', 'eigen', '线性'],
    body: LINALG_BODY,
  },
  {
    key: 'stats',
    tier: 'extra',
    /** 信号量 11。 */
    weight: 11,
    short: '统计/分布/回归',
    title: '统计与概率（stats / dist / regression）',
    summary: '描述统计、八种概率分布（CDF/PDF/分位数）、线性与多项式回归。',
    aliases: ['统计', '概率', '分布', '回归', '方差'],
    body: STATS_BODY,
  },
  {
    key: 'ode',
    tier: 'extra',
    /** 信号量 4 —— 最低的一档。 */
    weight: 4,
    short: '微分方程',
    title: '微分方程（ode）',
    summary: 'RK4 数值解一阶方程组与二阶方程，返回轨迹/终点值/极值/发散警告。',
    aliases: ['微分方程', 'ode', '传染病', '捕食模型', 'rk4'],
    body: ODE_BODY,
  },
  {
    key: 'constants',
    tier: 'extra',
    /** 信号量 5。 */
    weight: 5,
    short: '改常数看后果',
    title: '常数推演（constants / quantities / impact）',
    summary: '改光速/引力常数，派生量自动重算并评估偏离度；看哪些物理量该跟着变。',
    aliases: ['常数', '物理常数', '光速', '引力常数', '推翻物理'],
    body: CONSTANTS_BODY,
  },
  {
    key: 'balance',
    tier: 'extra',
    /** 信号量 5。 */
    weight: 5,
    short: '收支/天体',
    title: '收支盘点与天体目录（balance / bodies）',
    summary: '粮水能地财政军费多项一起看给最短板；以及天体目录、类型学、常数变化影响。',
    aliases: ['收支', '盘点', '养得起', '经济', '天体', '火星'],
    body: BALANCE_BODY,
  },
  {
    key: 'derivation',
    tier: 'extra',
    /** 信号量 21。 */
    weight: 21,
    short: '推演栈 29 子命令',
    title: '推演栈（derivation 子命令）',
    summary: '八层推演栈、混沌拦截、结论翻转、逆推校准、敏感度、相图、白皮书、算力、幻想层、文明极限。',
    aliases: ['推演', 'derivation', '混沌', '白皮书', '相图', '敏感度', '算力'],
    body: DERIVATION_BODY,
  },
  {
    key: 'workspace',
    tier: 'extra',
    /** 信号量 28 —— 与 formula 并列，但它是低频操作，保留 extra。 */
    weight: 28,
    short: '工作区/变量',
    title: '数据管理（workspace）',
    summary: '工作区（一个世界观一套常数/公式/地点/变量）、命名变量跨调用复用、精度固化。',
    aliases: ['工作区', '变量', 'workspace', '切换', '保存'],
    body: WORKSPACE_BODY,
  },
  {
    key: 'recipe',
    tier: 'extra',
    /** 信号量 17。 */
    weight: 17,
    short: '锚点/账本/错误码',
    title: '常见配方（锚点/账本闭合/多步链/错误码）',
    summary: '跨节组合用法：sanity 锚点比对你自己给的判据、账本闭合、多步链、错误码对照。',
    aliases: ['锚点', 'sanity', '账本', '闭合', '多步', '错误', '配方'],
    body: RECIPE_BODY,
  },
]

/**
 * 归一化查询词：去空格、转小写、去掉 layer:/domain: 这类前缀。
 *
 * AI 会写 `helpTopic:"world"`，也可能写成 `"星球"`、`"World"`、
 * `"world 字段"` —— 都得能命中。
 */
function normalizeTopicQuery(topic: string): string {
  return topic.trim().toLowerCase().replace(/[\s_\-]+/g, '').replace(/^help:?/, '')
}

/**
 * 在目录里找一节。
 *
 * 匹配顺序：key 精确 → 别名精确 → key/别名**包含**查询词。
 * 最后那层包含匹配是给 `"world"` 命中 `"world（星球）"` 这类写法用的，
 * 但只在前两层都没命中时才用 —— 否则短词会乱咬。
 */
function findTopic(topic: string): HelpTopic | undefined {
  const query = normalizeTopicQuery(topic)
  if (query === '') return undefined
  const exact = HELP_TOPICS.find((item) => normalizeTopicQuery(item.key) === query)
  if (exact) return exact
  const byAlias = HELP_TOPICS.find(function (item) {
    return (item.aliases ?? []).some((alias) => normalizeTopicQuery(alias) === query)
  })
  if (byAlias) return byAlias
  return HELP_TOPICS.find(function (item) {
    if (normalizeTopicQuery(item.key).includes(query)) return true
    return (item.aliases ?? []).some((alias) => normalizeTopicQuery(alias).includes(query))
  })
}

/**
 * 目录层：**高频给简介，低频折叠成一行**。
 *
 * ## 用户要求（2026-11-07）
 *
 * 「压缩目录本身的字符数，合并同类项减少目录本身的字数，
 *   加减乘除高频其余低频可以折叠。」
 *
 * ## 旧版哪里浪费了
 *
 * 旧目录 1731 字符里，**12 行「也可写: 别名…」占了 432 字符**。
 * 而那些别名本来就能通过 `findTopic` 的 alias 匹配命中
 * （写「矩阵」照样查到 linalg）—— 列出来只是为了「让人看见」。
 *
 * 但 AI 不需要看见别名清单才能查到它。真正需要看见的是：
 *   · 有哪些**能力**（key + 一句话用途）
 *   · 哪些是高频（值得先查）
 *
 * ## 现在的结构
 *
 * ```
 *   ▸ core 节（4 个）：key + 标题 + 一句简介   ← 每行值钱，保留
 *   ▸ extra 节（8 个）：一行 key + 六字标签     ← 折叠，但仍在目录里
 * ```
 *
 * 折叠掉的部分：别名清单、长标题、extra 节的长简介。
 * 它们没有丢 —— 查那一节时正文里有，且别名匹配照旧生效。
 */
function renderIndex(): string {
  /**
   * 按实测信号量排序（大的在前）——
   * 这样 AI 读目录时，最可能用到的能力自然排在最前面。
   * 同权重时保持注册顺序（`Array.prototype.sort` 是稳定的）。
   */
  const byWeight = (a: HelpTopic, b: HelpTopic) => (b.weight ?? 0) - (a.weight ?? 0)
  const core = HELP_TOPICS.filter((item) => item.tier === 'core').sort(byWeight)
  const extra = HELP_TOPICS.filter((item) => item.tier === 'extra').sort(byWeight)
  const lines: string[] = [
    '══════ math_execute 能力目录（' + HELP_TOPICS.length + ' 节）══════',
    'helpTopic:"键名" 取该节全文；也可用中文词（矩阵/星球/单位…）。',
    '',
  ]
  for (const topic of core) {
    lines.push('  ' + topic.key.padEnd(10) + topic.title)
    lines.push('    ' + topic.summary)
  }
  /**
   * 低频节压成一行：`key` 后面跟六字标签。
   * 用 ` / ` 分隔而不是每个占一行，是因为 8 行 = 8 次换行成本，
   * 而它们本来只是「顺带知道一下」的存在。
   */
  lines.push('')
  lines.push('  低频（同样可查，正文里有完整说明）:')
  const folded = extra.map(function (item) {
    const label = item.short ?? item.title.slice(0, 8)
    return item.key + '=' + label
  })
  /** 每行约三到四项，便于目视扫读，也不至于把一行拉得过长。 */
  for (let index = 0; index < folded.length; index += 3) {
    lines.push('    ' + folded.slice(index, index + 3).join('  ·  '))
  }
  lines.push('')
  lines.push('★ 物理量一律带单位写（(10 hp/0.475) to kW、5 cm to inch）：量纲错当场拦下。')
  return lines.join('\n')
}

/**
 * 帮助入口。
 *
 * @param topic - 可选。给则返回该节正文；不给返回目录。
 *                 认不出的 topic 不报错 —— 回目录并说明没这一节，
 *                 顺带列出可选 key。报错会打断调用方的探索，目录更能自救。
 */
export function opHelp(topic?: string): Outcome {
  if (typeof topic !== 'string' || topic.trim() === '') {
    return { result: renderIndex(), value: { topics: HELP_TOPICS.map((item) => item.key) } }
  }
  const found = findTopic(topic)
  if (found) {
    return {
      result: found.body(),
      value: { topic: found.key, title: found.title },
    }
  }
  const keys = HELP_TOPICS.map((item) => item.key).join(' / ')
  return {
    result: '没有名为 "' + topic + '" 的节。下面是目录，可用 key 取任一节：\n\n' + renderIndex(),
    value: { topics: HELP_TOPICS.map((item) => item.key), requested: topic },
  }
}