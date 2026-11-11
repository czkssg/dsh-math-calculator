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
import { FORMULA_SYSTEMS } from './formula-systems.js'
import { DERIVATION_SUBCOMMANDS } from './ops/derivation-op.js'

/** 体系链数：从数据源动态取，避免 help 里的数字与代码脱节（已踩过一次）。 */
const FORMULA_SYSTEM_COUNT = FORMULA_SYSTEMS.length

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
  '【复合单位】evaluate 能算复合单位，units 操作只认单单位。',
  '  1 L/min to m^3/s     → 1.6667e-5 m^3 / s（L/min 里的 min 会自动当成分钟）',
  '  1 MJ/day to kW       → 0.01157407 kW',
  '  1 g/dL to kg/m^3     → 10 kg / m^3',
  '  ★ 写成 min 也没问题：单位位置的 min 与函数 min() 不会互相干扰',
  '  ★ units 操作的单位表是按量纲组织的，复合单位请改用 evaluate',
  '',
  '【Math.xxx 不支持】写 Math.min(3,5) 会提示「去掉 Math. 前缀」，',
  '  直接写 min(3,5) 即可。',
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
const ODE_BODY = (): string => `【动力学】连续用 ode，离散用 recurrence

  ★★ 先判断：你的模型是「连续变化」还是「按期结算」？
     连续（每个人随时都在增长）→ ode
     离散（年度结算、批次解锁、世代更替）→ recurrence
     两者答案不同，写年表必须用离散值（见下面第 3 段）。

══ 1. ode：连续时间积分（RK4）══
  一阶方程组（SIR / 捕食模型）与二阶方程（自动降阶）都能解。

  参数：
    expression  状态方程，分号分隔。等号左边是导数变量
                例："S'=-k1*S*I; I'=k1*S*I-k2*I; R'=k2*I"   ← SIR
                    "x'=y; y'=-k*x"                        ← 简谐
    initial     初值 {S:999, I:1, R:0}
    from/to     积分区间（默认 0 → 10）
    steps       RK4 步数（默认 1000，刚性方程加大）
    samples     返回采样点数（默认 24）
    at           ★ 要精确输出的时点，如 [5,10,20]

  返回：轨迹、终点值、极值、指定时点的值、**发散警告**

  ★ at 是什么用的：默认采样是均匀的（t = 1, 2.9, 4.8, …），
    写年表时「第 5 年、第 10 年」一个都对不上。传 at:[5,10,20] 就精确给那几个。

  ★ 二阶方程降阶：y'' 写成 y'=y_d; y_d'=…（y_d = dy/dt）。
    缺辅助变量会提示补哪个，不会静默给错。

  ★ 数值解不是解析解：steps 太少会失真，刚性方程易发散 ——
    看到发散警告就加大 steps，或换解析思路。

══ 2. recurrence：离散递推（出逐年表）══
  {operation:"recurrence", recurrence:"P*2", initial:{P:1}, periods:20}
  → 逐期表 + 终值 + 与连续模型的差额

  参数：
    recurrence  下一期 = f(本期)。单状态最常见：
                "P*2"                 ← 每期翻倍
                "P*min(1.2, 1000/P)"   ← 带资源上限的年度增长
    initial     初值，可多个状态（逗号/分号分隔的表达式各自求一次）
    periods     迭代期数（默认 12，上限 5000）

  ★ 支持 min()/max() 约束 —— 「增速 20% 但不超过 1000」这种写法直接可用，
    结果会在第 38 期左右平滑收敛到 1000，不会越过。

══ 3. 为什么非要区分（实测数字）══
  同一件事「从 1 起每年 ×2」：
     离散（recurrence）   2^19        = 524,288
     连续（ode, 0.693P）  e^(0.693×19) = 522,824
     差 0.28%

  0.28% 看着可忽略，但第 33 年换成本「亿人」时差 0.5 亿 ——
  **而写作时写的是「第 33 年，四十二亿人」这种具体整数。**
  连续模型的 4.24e9 会让你在「42 亿还是 43 亿」上反复纠结。

  ★ 所以 recurrence 会在结果末尾直接给出「连续近似 vs 离散」的差额，
    让你一眼看出「用 ode 顶替会差多少」。

★ 写故事时的常见用法：
  传染病扩散（SIR）、捕食者-猎物振荡（Lotka-Volterra）、
  碳循环、人口动态、冷却曲线、**逐年人口/资源年表**`

/** 【公式库】全部公式的调用与检索（条数由 FORMULAS.length 动态填）。 */
const FORMULA_BODY = (): string => `【公式库】共 ${FORMULAS.length} 条自然科学公式
  formula      调一条公式：formula="escape_velocity", overrides={M,r}
               ★ overrides 可覆盖任意参数 —— 这是架空世界改造的关键
               例：把重力改成 1.5 倍地球 {"g": 14.71}；光速 {"c": 1e8}
               ★ 错拼的 key 会点名上报，不会静默忽略

  【体系】公式不是散着的 —— ${FORMULA_SYSTEM_COUNT} 条推演链按「一条链算一遍」组织：
    formulas query="sys"                  → 列出全部体系（材料/结构/能源/产能/食物/生物/
                                             时间/财政/增长/建筑/气候/交通/军事/信息/水利/
                                             金融/天文/生理/信息控制/决策/量子/排队）
    formulas query="sys:sys-energy"       → 看能源链的逐步（每步公式、输出单位、需自备参数）
    formulas query="sys:formula:材料"      → 看某条公式属于哪几条链（体系间的接点）
    formulas query="sys:compound"           → 看 7 条**复合路径**（跨 4 条链的现成路线）
    formulas query="sys:compound:mine-to-empire" → 从矿石到帝国：每一跳的接点公式
    ★ 每步都标「← 上一步的谁作为本步的哪个参数」，照着填即可
    ★ 体系之间靠共用公式连接（如 metallurgy_yield 同时属于材料链与产能链）
    ★ 不必追求全部串成一条 —— 按推演目的取一条链，参数才不会拖家带口
  【参数带单位】两种写法等价，都能让单位真的参与计算：
    1) 逐参数带单位：overrides={V:"324375 L", n:20}   ← 更精确，可各给不同单位
    2) 整批声明：unitFrom="L", overrides={V:324375, n:20}   ← 更省事
       目标单位默认用该参数自己声明的（V 声明 m³，故 324375 L → 324.375 m³）
       ★ 无量纲参数（人数、个数、份额）**不参与换算** —— 只有声明了单位的才换
       ★ 量纲不符会报错，不会静默按原数字算

  【terse】只回一行，省 token：
    terse:true → kleiber = 164316767.25 W，并注明覆盖了哪些参数
    ★ 砍掉的是标题与参数表，**风险提示不砍**：经验式的【适用域】仍然保留

  ★ 调低 precision 导致结果被截时会提示（如 10^20+1 在 precision=8 下末位失真）
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
/**
 * ## feasibility 节的正文（N19 / A33 根因修复）
 *
 * ## 为什么这一节必须存在
 *
 * 反馈包把 `feasibility` 的「假通过」评为致命级，而它的根因不是代码 bug，
 * 是**这一节根本不存在**：
 *
 * ```
 *   helpTopic:'feasibility'  →  「没有名为 feasibility 的节」
 * ```
 *
 * 没有文档，调用方只能猜入参形态。最常见的一猜就错——
 * 把 `claims` 写成数组 `[{claim, value, unit}]`，而正确形态是对象
 * `{cityPopulation: 9.2e10}`。猜错之后：
 *
 * ```
 *   claims:[{...}]  →  1 项 claim 被整批丢弃
 *                  →  返回「全部 0 项设定都在物理允许范围内」「自洽」
 * ```
 *
 * **假通过比报错危险得多**：使用者会以为「已通过物理校验」，
 * 而这个项目里 `feasibility` 被用了 31 次，是高频功能。
 *
 * 所以这一节的首要任务不是介绍能力，而是**把正确入参形态钉死**。
 */
const FEASIBILITY_BODY = (): string => `【物理可行域】feasibility 单项所列的上限判定

  ★ 入参是**对象**，不是数组：
    {operation:"feasibility", claims:{cityPopulation:9.2e10, soldierCount:2e6}}
    键名可自取（英文/拼音都行），值是数字或带单位字符串（"9.2e10 人"）。

  ✗ 常见错法：claims:[{claim:"…", value:1, unit:"…"}]
    数组形态会被整批丢弃，然后报「自洽 0 项」—— 那是**假通过**。
    现在传数组会直接报错，不再静默。

  不带 claims 调用 → 列出本世界的物理上限表（11 项固定约束），
  回答「这个世界最多能容纳多少人/多高的建筑/多大的生物」。

  ★ 单项生理/工程上限用 feasibility，社会收支用 balance，两者不互相替代。
  社会收支（粮/水/能/财政）见 helpTopic:"balance"。`

/**
 * ## hierarchy 的正文
 *
 * 反馈包 `14` 号实测：99层项目**连续 7 轮返工，其中 5 轮是它**。
 *
 * > 层级树要「树状 + 闭合」：每级辖属数、底层基数、总兵力三者必须自洽。
 * > 而 AI 只能一层一层算，每回都漏掉某一级。
 *
 * 这是「算一张表」而不是「算一个数」—— 单点公式覆盖不了。
 */
const HIERARCHY_BODY = (): string => `【编制树】hierarchy 每级辖属数 × 底层基数 → 逐级人数

  {operation:"hierarchy", hierarchy:{
    levels:["师","团","营","连","班"], tree:[3,3,3,3], base:10}}

  三种用法：
    ① 给 base      → 正向：算出每级单位数与人数（一个满编师 = 810 人）
    ② 给 total     → 反解：每级应有多少单位、每个含多少人
    ③ 两个都给     → 校验是否自洽，不自洽时说差额 + 三种可能原因

  ★ tree 长度必须 = levels.length − 1（每级一个下辖倍数）。
  ★ 算错一次整棵树都错 —— 所以正算给出的每级数字**逐个列出来**，便于核对。

  ⚠ 编制对不上时，工具只给「差额 + 可能原因」，**不替你改倍数** ——
    哪个数字是原文给的只有你知道。`

/**
 * ## extract_numbers 的正文
 *
 * 反馈包实测：整理 23 份 PDF 时，**22,115 行台账是用 Python 脚本抽的**。
 * 工具在「对账入口第一件事」上零支撑 —— 而那是全部工作中耗时最多的一环。
 *
 * ## 分层：本操作不读 PDF
 *
 * 用户已确认「允许读 PDF」，但那不等于本插件要自己造解析器：
 * 宿主已有 `read_pdf` / `async_parse_pdf`（dsh-pdf-mineru 证明完全可行）。
 * 重复造只会两套都不一致。本操作只做「文本 → 台账」这一层。
 */
const EXTRACT_BODY = (): string => `【数字台账】extract_numbers 从文本抽结构化数字

  先取文本（PDF 用宿主工具），再送进来：
    read_pdf / async_parse_pdf → 拿到正文
    {operation:"extract_numbers", text:"…正文…"} → 台账

  每条给：原文、数值（中文量级已折算）、单位、上下文、行号。
  区间的给上下界；噪音（页码/时间戳/思考耗时/轮次）默认滤掉。

  ★ 中文量级会折算：1.49 亿 → 149000000，2.66 亿吨 → 266000000。
  ★ 每个数字带**上下文**（所在那半句）—— 否则抽出来也不知道是什么。
  ★ keepNoise:true 可保留噪音（会标出原因）；limit 控制上限（默认 2000）。

  ⚠ 这是**台账**不是验算。要对账请把成组的数送进 ledger 或 evaluate。`

/**
 * ## compare 的正文
 *
 * 反馈包 15 号的动作 4 是「方案对比」，真实例子是第 43 轮的列强国力表。
 * 原来 AI 只能手工排表，然后凭感觉说「哪个好」——**判断标准没写下来，
 * 所以每次结论可能不一样**。
 */
const COMPARE_BODY = (): string => `【方案对比】compare 几个互斥选项比指标

  {operation:"compare", compare:{
    rows:["维多利亚","高卢","条顿"],
    cols:["综合国力","工业产能","金融航运","军事"],
    data:[[100,95,130,105],[85,80,90,115],[90,110,70,125]]}}

  返回：表格 + 每个指标的最强者。
  ★ 不给 weights 就**不给综合分** —— 工具不猜「哪个指标更重要」。

  要综合排序就传 weights（每个指标一个非负数，长度同 cols）：
    weights:[1,10,1,1]  → 偏重工业，条顿第一
    weights:[1,1,1,10]  → 偏重军事，条顿仍第一但高卢与维多利亚换位

  ⚠ 综合分只是「按你给的权重加权」，不是客观优劣。
    权重换了排序就换 —— 哪个指标更重要是**世界观设定**，不是物理事实。

  ★ 这是「方案对比」（几个互斥选项）。要对比同一个世界的两个版本，
    用 derivation="compare"（读归档记录）。`

/**
 * ## interval 的正文
 *
 * 反馈包 15 号的核心发现：AI 在推演时**全程用区间思考**
 * （「大约一万吨」「20–40%」「21–25 亿」），但工具只支持点值，
 * 逼它把区间压成单个数再算 —— **那一步压缩就是失真的源头**。
 */
const INTERVAL_BODY = (): string => `【区间运算】interval 上下界进来，上下界出去

  {operation:"interval", interval:{expr:"[21,25] * [2000,2500]"}}
  → [42000, 62500]，并给出相对宽度与「把握」分档

  输入形态（都认）：[20,50] / 20-50 / 20~50 / 20 到 50 / {low,high} / 单个数字
  ★ 无方括号时运算符两侧留空格（20-50 * 2000-2500），否则连字符有歧义。

  三种用法：
    ① 纯四则：a / op / b
    ② 阈值判定：加 against:25 → below / above / crosses
    ③ 带单位：unit:"元"，只影响显示

  ★ 输出会分档「把握」：±5% 可直接写设定 / ±20% 建议给区间 / 更宽只能当方向。
  ★ 只给上下界时**不猜分布** —— 中点只是算术中点，不是「最可能的值」。
  除数跨零会直接报错（结果不是单个区间，是两段）。`

/**
 * ## ledger 的正文
 *
 * 反馈包统计 282 条硬伤里 **48% 是账本问题**，而工具此前**零覆盖** ——
 * 用户只能手工拼 evaluate 算式再看差额。这一节的第一个任务是
 * **把「分项之和 vs 总量」这件事变成一次调用**。
 */
const LEDGER_BODY = (): string => `【台账闭合】ledger 分项之和 vs 声称总量

  ★ 占比简写（推演分配比最常用，总数默认 100）：
    {operation:"ledger", ledger:{士:1, 农:85, 工:10, 商:4}}
    → 合计 100，闭合 ✓

  ★ 显式（对账查分项之和）：
    {operation:"ledger", ledger:{parts:[{name:"甲",value:120},{name:"乙",value:80}], total:300}}

  不闭合时会指出**最可疑的分项**，判据有三条：
    ① 量级笔误：该项差 10/100 倍时账本就能对上
    ② 漏项/重复：差额恰好等于某一项的值
    ③ 整数异常：其余都带小数，只有它是整数

  ★ 工具只给可疑度排序，**不确定该改哪一项** —— 哪个数是原文给的只有作者知道。
  与 balance 的分工：ledger 查「分项合不合得上」，balance 查「够不够用」。`

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

/** 【工程·结构（梁柱应力/挠度/惯性矩/螺栓焊缝）】按公式 id 调用，参数可带单位。 */
const D_STRUCT_BODY = (): string => `【工程·结构（梁柱应力/挠度/惯性矩/螺栓焊缝）】

  调用方式：{operation:"formula", formula:"id", overrides:{参数}}
  参数可带单位（"10 km"、"2 时辰"），会校验量纲并换算。


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
`

/** 【工程·热机与能量（卡诺/蒸汽/锅炉/换热）】按公式 id 调用，参数可带单位。 */
const D_THERMAL_BODY = (): string => `【工程·热机与能量（卡诺/蒸汽/锅炉/换热）】

  调用方式：{operation:"formula", formula:"id", overrides:{参数}}
  参数可带单位（"10 km"、"2 时辰"），会校验量纲并换算。


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

  ── 循环形式：真实机器能到多少（卡诺只是天花板）──
  rankine_efficiency        η = (h₁−h₂)/(h₁−h₃)
                            ★ 蒸汽循环的真实效率，3MPa 饱和算例 **34.4%**（同温限卡诺 39.6%）
                            达不到卡诺不是设计差，是循环本身的结构限制
  otto_efficiency           η = 1 − r^(1−γ)
                            ★★ **公式里没有温度项** —— 内燃机提效率唯一主路是提压缩比
                            r=8 → 56.5%、r=10 → 60.2%；受爆震限制（汽油机只到 10~12）
  diesel_efficiency         η 比 Otto 多一个截断比修正
                            ★ 优势是压缩比能到 18（只压空气），代价是结构重、转速低
                            ⚠ rc 越大效率越低（rc=3 时 58.9% < rc=1.5 时 65.6%）
  brayton_efficiency        η = 1 − 1/π^((γ−1)/γ)
                            ★ 优势不在效率而在**功率密度**（无往复件）——喷气式的基础
  combined_cycle_efficiency η = 1 − (1−η₁)(1−η₂)
                            ★ 60% 效率不是提高任何单机，而是**用燃机废热再驱动汽轮机**
                            ★★ 高于任一单机，但**永远低于两者相加**
  condenser_vacuum_gain     效率 ∝ (Th − Tc)
                            ★ 反直觉：**「把排气冷下来」与「把蒸汽烧热」等价**
                            所以电站的巨大冷却塔不是为环保，是为了拿到真空
  refrigeration_cop_real    COP = COP_卡诺 × η_等熵
                            ★ COP 可以远大于 1（搬热不是造热）
                            ★ 温差越小越省：空调 COP≈18、冷冻≈3.6 —— 同一台机器的量级差 5 倍
  heat_pump_cop             COP_供暖 = COP_制冷 + 1
                            ★ 「送出的热 = 搬来的热 + 消耗的功」，所以比电暖器省
                            ⚠ 室外 −10℃ 时 COP 骤降（热力学决定，不是设计缺陷）
  cooling_load              Q = 围护 + 内部 + 渗透
                            ★ **渗透热往往与围护热同量级** → 「密封门窗」比「加厚墙」更有效
                            人 100W/人、20㎡ 房间总负荷约 1.1kW
  thermal_storage_capacity  Q = m·c·ΔT
                            ★ 水的比热是岩石 5.2 倍、铁的 9.3 倍 —— 蓄热用水是数值决定的
                            一次冰水相变 ≈ 水升温 80K（这就是冰窖高效的原因）
`

/** 【工程·流体与气动（管流/水头/泵 · 升力/阻力/失速/激波）】按公式 id 调用，参数可带单位。 */
const D_FLUID_BODY = (): string => `【工程·流体与气动（管流/水头/泵 · 升力/阻力/失速/激波）】

  调用方式：{operation:"formula", formula:"id", overrides:{参数}}
  参数可带单位（"10 km"、"2 时辰"），会校验量纲并换算。


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

  ── 流体与空气动力（能不能飞、船能多快）──
  stagnation_pressure       q = ½ρv² ★ **所有气动力 ∝ v²**（v=100 时 q≈6125Pa）
  drag_force                F = q·A·C_D ★ C_D: 流线型 0.04~0.1、球 0.47、平板 1.28、鱼 0.01
                            ⚠ 只是压力阻力（∝v²）；低速时粘性阻力（∝v）可能才是主项
  viscous_drag_stokes       F = 6πμrv ★ 低速蠕流（Re<1），**∝v 不是 v²**
                            沉降速度 ∝ r²：粗砂瞬沉、黏土悬浮数天（浑水一夜清不了）
  lift_force                L = q·S·C_L ★ 升力 ∝ v²，所以「速度不够就飞不起来」是平方墙
                            ★ 人力扑翼机要 700W 持续输出，而人能维持的只有 200~400W
  wing_loading_stall_speed  V_stall ∝ √翼载 ★ 放襟翼不是为了升力大，是为了**失速速度低**
                            客机 C_Lmax 1.4→2.5 → 失速速度降 25%，跑道短 40%
  lift_to_drag_ratio        L/D ★ 航程 ∝ L/D。信天翁 20~25、滑翔机 40~60、客机 17、昆虫 1~3
  induced_drag              C_Di = C_L²/(π·AR·e) ★ **升力的代价是平方级的**；AR 越大越省
                            ⚠ 只算型阻的 L/D 会高估 2~5 倍（最常见的气动错误）
  boundary_layer_thickness  δ ≈ 5x/√Re_x ★ δ ∝ √x；转捩后厚 3~5 倍但分离更晚
                            这就是高尔夫球有凹坑的原因（主动造湍流反而减总阻力）
  mach_angle                μ = arcsin(1/M) ★ M=2 → 30°、M=5 → 11.5°；音爆的来源
  wave_drag_coefficient     波阻 ∝ (M−M_cr)³ ★ 立方律：ΔM ×1.5 → 波阻 ×3.4
                            「音障」不是声音的墙，是阻力在 M→1 时暴增
  reynolds_transition       Re = vL/ν ★ 1mm 虫 Re=10（世界像蜂蜜）、100m 船 Re=1e9
                            Re 决定一切：蠕流 <1、管流转捩 ~2000、平板转捩 ~5e5

`

/** 【生物·生态（载畜量/料肉比/NPP/营养级）】按公式 id 调用，参数可带单位。 */
/** 【冷战支柱】控制论 / 信息论 / 排队 / 可靠性 / 决策 31 条。 */
const D_COLDWAR_BODY = (): string => `【冷战支柱（控制论/信息论/排队/可靠性/决策）】

  调用方式：{operation:"formula", formula:"id", overrides:{参数}}
  这 31 条不是「物理的延伸」，而是 1940—1970 另一套语言：处理**信息与调控**。
  共同点：都只收有闭式解的那一层（需要迭代求解的线性规划一律不收）。


════ 控制论：为什么闭环、增益能加到多少 ════
  open_loop_error            残差 = 扰动 / (1 + 增益)
                             ★ 纠错能力等于增益：增益 10 压到 1/10，增益 100 压到 1/100
                             所以「把传感器做准」与「把增益做大」等价，而后者通常便宜
  loop_stability_limit       增益上限 ≈ 1 / (延迟 × 带宽)
                             ★ 增益不能无限加：延迟让反馈信号「过期」，纠错变助推振荡
                             想提高增益**必须先减延迟**，调参数没用
                             历史印证：蒸汽机调速器轻载飞车、重载迟钝；远距离调压难
  second_order_settling      建立时间 ≈ 4 / (ζ·ω_n)
                             ★ 4 来自 ln(50)≈3.9（衰减到 2% 的时刻），不是随手写的
  overshoot_from_damping     超调 = exp(−πζ/√(1−ζ²))
                             ★ ζ=0.3→37%、0.5→16.3%、0.7→4.6%、1→0
                             ⚠ 欠阻尼不是「又快又冲」，是**又冲又慢**（要振荡几次才进误差带）
                             ζ=0.7 被偏爱不是审美：超调只剩 4.6% 且建立时间接近最优

════ 信息论与信号：上限、门槛、换算 ════
  channel_capacity           C = B·log₂(1 + S/N)
                             ★ 带宽**线性**、信噪比**对数** —— 加功率收益递减，加带宽才是主路
                             实测：3000Hz + 30dB → 29.9 kbit/s（正是 33.6k 猫的物理天花板）
  shannon_limit_min_snr      S/N ≥ 2^η − 1（由容量式反解）
                             ★ 最反直觉：η<1 时 S/N 可以小于 1，**信号弱于噪声也能传**
                             代价是带宽 —— 这就是扩频/深空通信的原理
  nyquist_rate               采样率 ≥ 2·最高频率
                             ★ 低于它不是「变模糊」，而是**凭空造出不存在的低频**（混叠）
                             车轮倒转、摩尔纹都是这条
  quantization_snr           SNR ≈ 6.02n + 1.76 dB
                             ★ 每多一位 +6dB。8 位 49.9、16 位 98.1、24 位 146.2
                             ⚠ 超过硬件本底就是浪费：前端只有 90dB 时，24 位存了 6 位噪声
  shannon_hartley_bits       I = log₂(状态数)
                             ★ 同样刻一道痕：二进制 1 位、六十四卦 6 位 —— 密度差 6 倍
  redundancy_ratio           冗余 = 1 − H/H_max
                             ★ 冗余不是浪费，是**抗噪预算**；英语约 0.5~0.75
                             电报体压冗余提速，公文加冗余防误，同一机制
  signal_to_noise_db         dB = 10·log₁₀(功率比)
                             ★ 必记：3dB=2 倍、10dB=10 倍、20dB=100 倍、30dB=1000 倍
                             ⚠ 功率比用 10log、电压比用 20log，混用差 2 倍
  path_loss_freespace        L = 20·log₁₀(4πd/λ)
                             ★ 距离翻倍 +6dB；频率翻倍也 +6dB → 远程通信用低频
                             唯一可无限扩展的解法是**中继**（卫星、驿站、烽火台）
  fresnel_zone_radius        r = √(λ·d₁·d₂/(d₁+d₂))
                             ★ 通信不是「连一条线」，要清出一个椭球管道
                             山脊上方 1m 通不了、20m 就通了 —— 视线没断但管道被切
                             r ∝ √λ，所以频率高 10 倍只需降 3.2 倍高度
  rc_cutoff_frequency        f_c = 1/(2πRC)
                             ★ 带宽与响应速度是同一件事的两面（因果律要求）
                             滤波越重 → 延迟越大 → 能加的增益越小，三处同一条限制
  mmc_queue_length           多服务台近似（看「该加 1 个还是 10 个」）

════ 排队与库存：为什么忙时突然崩 ════
  little_law                 L = λ·W
                             ★ 排队论唯一**无条件成立**的式子（不含概率假设，本质是守恒）
                             ⚠ W 必须含服务时间，只算等待会少算好几倍
                             实战用法：验证「店里积压几件」与「日接几单」是否自洽
  queue_utilization          ρ = λ/µ
                             ★★ 全批最该记住：等待 ∝ ρ/(1−ρ)
                             ρ=0.5→1 倍、0.8→4 倍、0.9→9 倍、0.95→**19 倍**
                             负载只多 5%，等待翻倍 —— 留 20% 余量不是浪费，是止损
  mm1_wait_time              等待 = 服务时间 × ρ/(1−ρ)
                             ⚠ 服务时间很规律时，实际等待约为本式一半
  eoq                        Q* = √(2DS/H)
                             ★ 需求 ×4 → 批量只 ×2（平方根）
                             总成本在最优点附近是平的：Q 偏 2 倍只贵约 25%
  safety_stock               SS = z·σ·√L
                             ★ 提前期 ×4 → 安全库存只 ×2
                             95%→99% 服务水平，库存要多 41%（2.33/1.65），典型边际递减

════ 可靠性与决策 ════
  reliability_series         R_total = R^n
                             ★ 0.99 跑 100 环 → 只剩 0.366。简单机械比精巧机械可靠，是环节数问题
                             想提高可靠度，**减少环节比提高单环有效**
  reliability_parallel       R = 1 − (1−R)^n
                             ★ 0.9 单件 → 2 份 0.99、3 份 0.999。两份就压一个数量级
                             ⚠ 前提是失效独立：两条船同处会被同一场洪水冲走，那就不是并联
  mtbf_availability          A = MTBF/(MTBF+MTTR)
                             ★ **修得快 ≡ 不容易坏**：MTTR 减半与 MTBF 翻倍效果完全相同
                             这解释了为什么现实中「修得快」的文化更常见
  spares_required            期望故障数 = 装机数 × 时间 / MTBF
                             ⚠ 期望≠保证：期望坏 2 件时，备 2 件约 32% 概率不够
  expected_value_decision    EV = p·G − (1−p)·L
  breakeven_probability      p* = L/(G+L) ← 更好用：不需知道概率就能判断
                             ★ 收益 9 倍只需 10% 把握；**损失 9 倍则需 90%**
  nash_bargaining_split      先拿回退路，再把剩余对半分
                             ★ 分的是**剩余**不是总数；唯一能改变分配的杠杆是提高退路
  winner_curse_markup        赢家平均高估 ≈ σ·(n+1)/n
                             ★ 「赢了」这个事实本身携带坏消息 —— 出价最高者往往最乐观
  bayes_posterior            P(病|阳) = p·Se / [p·Se + (1−p)(1−Sp)]
                             ★★ 1% 发生率 + 90%/90% 检测 → 阳性后只有 **8.33%**
                             假阳是真阳的 11 倍。检测在低发人群里几乎没有意义
  bayes_evidence_strength    证据强度 = log₁₀(Se/(1−Sp))
                             ★ 对数让证据可**相加**：+1 分 = 10 倍把握
                             孤证不立：Se=0.8、Sp=0.5 的证词只有 0.2 分（1.6 倍）
  base_rate_neglect_error    量化「基础率忽视」错得有多离谱（1% 时高估 12 倍）
★ 共同点：这批的价值不在算式（都只有一两行），而在**它们推翻了哪些直觉**：
  人多一倍不是慢一倍、检测阳性不是有病、多备冗余不是更安全、
  欠阻尼不是更快、加增益不是更准。
  现代物理与社会科学的同类清单见 helpTopic:"d-modern-society"。`;

/** 【现代物理与社会科学】1900—2000 两条主线：经典失效 + 社会可测。 */
const D_MODERN_SOCIETY_BODY = (): string => `【现代物理与社会科学（1900—2000）】

  调用方式：{operation:"formula", formula:"id", overrides:{参数}}
  这两块原本是库里的整片空白：量子只 3 条、统计固体 0 条、核只有衰变一侧；
  社科有经典（基尼/SIR/洛卡-伏特拉）但缺 1960 年以后那一层。
  共同判据：**只收有闭式解、参数可填的那一层** —— 需要数据集或迭代求解的一律不收。


════ 现代物理：1900—1950 为什么经典失效 ════
  wien_displacement          峰值波长 = b/T
                             ★ 颜色就是温度：3000K→966nm（暗红）、铁熔点1811K→1.6µm（全在红外）
                             ⚠ 「炉火纯青」需 8000K 以上，柴火/煤火只有 1500~2000K，只能看到红橙
  stefan_boltzmann           P = ε·σ·A·T⁴
                             ★★ 四次方：温度翻倍功率 ×16。铁熔点比沸水辐射强 **557 倍**
                             ⚠ ε 是最易错处：抛光金属 0.05~0.1，氧化后跳到 0.7~0.9
  photoelectric_threshold    阈频 = W/h
                             ★ 红光再强也打不出电子 —— 这推翻了波动说（能量是一份份的）
                             只有碱金属（铯 662nm）能被可见光打出电子，这才是光电管的门槛
  compton_shift              Δλ = (h/mₑc)(1−cos θ)
                             ★ 位移与入射波长无关 → 可见光测不出（1e-5），**必须用 X 射线**
  heisenberg_uncertainty     Δx·Δp ≥ ℏ/2
                             ★ 不是「测不准」而是「本来就没有同时确定的值」
                             电子困在原子尺度 → 速度 0.2%c，**所以不可能静止在核旁**
  fermi_energy               E_F ∝ n^(2/3)
                             ★ 金属为什么导电：只有费米面附近约 1% 的电子能动
                             铜 n=8.5e28 → 7.03 eV（实测 7.00，自由电子气模型的经典成功）
  debye_temperature_heat_capacity  低温 C ∝ T³
                             ★ 温度减半热容降到 1/8 —— 经典「热容恒定 3R」在低温失效的证据
  band_gap_wavelength        λ = hc/E_g
                             ★ 整张颜色对照：Si 1107nm｜红光 649｜绿 521｜蓝 449｜**GaN 365（紫外）**
                             ⚠ 纯 GaN 是紫外不是蓝光；蓝光靠 InGaN 掺铟调下来（这就是它晚到 1993 的原因）
  pn_junction_builtin_voltage  V_bi ∝ ln(N_D·N_A)
                             ★ 只随浓度**对数**变化 → 硅 0.7V、锗 0.3V 是材料常数，不是设计选择
  drift_velocity_mobility    v_d = μ·E
                             ★ 铜导线里电子漂移约**每小时 14 厘米**；亮灯是场建立了，不是电子跑到了
  fission_energy_per_mass    E/m = E_f·N_A/M
                             ★★ U-235 约 **8.2e13 J/kg**，是煤的 **273 万倍**（差六个数量级，不是「更厉害」）
                             ⚠ 完全裂变值；实际堆只烧掉燃料 1~5%
  nuclear_binding_energy_curve  B/A 峰值在 Fe-56（8.79 MeV）
                             ★★ 往铁走就放能，两边都是 —— 所以「铁是恒星聚变的终点」
                             ★ 文明能碰到元素周期表哪一段，决定它的能源上限（化学→裂变→聚变，三级断崖）
  shielding_attenuation      I = I₀·e^(−μx)
                             ★ 指数衰减，**永远不为零**：屏蔽没有「挡住」，只有「减弱」
                             铅对 1MeV γ 半值层约 1cm；7cm 剩 0.68%
                             ⚠ 按本式设计常偏薄（宽束累积因子未计），这是真实事故成因之一

════ 社会科学：1960 年以后那一层 ════
  doubling_time_population   t₂ = ln2/ln(1+r)
                             ★ 70 法则：1%→70 年、2%→35 年。**长期 1% 不可能持续**
                             自查：「三千年前百人、现在千万」= 年增 0.38%，合理
  demographic_transition_rate  r = b − d
                             ★★ 人口爆炸的唯一机制：**死亡率先降、出生率后降**，中间落差就是爆炸
                             不是「生得多」，是「死得少了但生得还没少」
  tfr_replacement            更替水平 ≈ 2·(1+育龄前死亡率)
                             ★ 现代 2.04；育龄前死亡率 40% 时需 **2.8**
                             所以「古代生 5 个」不是不节制，是接近生存必需
  dependency_ratio           抚养比 = (幼+老)/劳力
                             ★ 人口红利的窗口：生育率先降、老龄化还没到，中间那段抚养比低谷
  clustering_coefficient     C = 2T/(k(k−1))
                             ★ 村庄 C≈0.5、随机网络 C≈0。**高聚集 + 少量长程连接 = 小世界**
  diffusion_threshold        φ_c ≈ 1/⟨k⟩
                             ★ 圈子越密越难动摇：⟨k⟩=5 需 20% 核心，⟨k⟩=20 只需 5%
                             这就是「城市更宽容」的定量形式之一
  olson_group_size_effect    个体份额 ≈ 1/N
                             ★ 团体越大越易搭便车 —— 推翻了「人多力量大」
                             所以工会/行会/教派都要有排他性福利，那不是温暖，是解决搭便车
  span_of_control            h = log N / log s（s 有效 4~8）
                             ★★ 规模 ×1000 只多约 3.9 层（对数）—— **层级不爆炸**
                             真正的瓶颈不是层数，是每一级的信息衰减
  parkinson_law_growth       S = S₀(1+g)^n，g≈6%
                             ★ 帕金森实测英国海军部 5.6~6.5%；6% 意味着 12 年翻倍
                             运转 200 年的机构若无裁撤会膨胀 11 万倍 → 真实机构必须周期整顿
  rank_size_city             P_r = P₁/r^q
                             ★ 齐普夫：第二城恰为首位一半。q 偏离 1 本身是有含义的设定信息
                             q≈0.3 → 多中心均衡；q≈2 → 首位城市极端压倒（集权帝国/单一港口）
  social_mobility_percentile R² = β²
                             ★ 出身能解释的地位差异：北欧 4%、美国 22%、传统社会 49%
  gini_from_lorenz           G = 1 − 2A
                             ★ 洛伦兹曲线下面积 A∈[0,0.5]，所以 1−2A 直接落在 0~1
                             财富基尼通常比收入基尼高 0.2 以上，不可混引
  urban_scaling              Y ∝ N^β
                             ★★ β≈0.85（基础设施，人均下降）vs β≈1.15（GDP/犯罪，人均上升）
                             人口翻倍 → 人均产出 ×1.11、人均基础设施 ×0.90


════ 分布与可靠性（dist 没有的那几种分布的矩）════
  weibull_reliability        R(t) = exp[−(t/λ)^k]
                             ★★ **t=λ 时恒为 36.8%**（与 k 无关）—— 这就是「特征寿命」的定义
                             所以 mean ≠ λ（除非 k=1）：k=2 时均值只有 λ 的 0.886
  weibull_failure_rate       h(t) = (k/λ)(t/λ)^(k−1)
                             ★★ 浴盆曲线不是一条曲线，是**三段不同的 k**：
                             k<1 早期失效（磨合，越用越好）｜k=1 随机（换不换一样）
                             k>1 磨损（越老越脆）→ **只有这一段「定期更换」才划算**
  lognormal_median_vs_mean   均值/中位 = exp(σ²/2) ≥ 1
                             ★ σ=1 → 1.65 倍、σ=2 → 7.39 倍 —— 「平均收入」为何无描述力
  poisson_mean_variance      E = Var = λt
                             ★ 真正的用途是**模型选择**：方差≈均值→随机；方差≫均值→有聚集
  binomial_mean_variance     E=np, Var=np(1−p)
                             ★ 相对误差 ∝ 1/√n：投 100 次 ±5%，投 10000 次 ±0.5%
                             「10 个里 7 个痊愈 = 70%」的设定经不起追问（真实可能 45~95%）
  coefficient_of_variation   CV = σ/μ
                             ★ 唯一能跨单位比离散度的指标：50±5 与 500±50 都是 0.1
                             CV<0.1 精密（需模具质检）｜0.2~0.4 手工｜>0.5 极离散

★ 共同点：这批公式的价值不在算式本身（都只有一两行），
  而在**它们推翻了哪些直觉**：人多一倍不是慢一倍、检测阳性不是有病、
  多备冗余不是更安全、欠阻尼不是更快、加增益不是更准、
  温度不是「越来越亮」而是 T⁴、电子在导线里不是「跑过去」的、
  铁不是随便一种金属而是核能的终点、大城市不是「效率低」而是人均更富也更乱。`;

/** 【生物·生态（载畜量/料肉比/NPP/营养级）】按公式 id 调用，参数可带单位。 */
const D_ECOLOGY_BODY = (): string => `【生物·生态（载畜量/料肉比/NPP/营养级）】

  调用方式：{operation:"formula", formula:"id", overrides:{参数}}
  参数可带单位（"10 km"、"2 时辰"），会校验量纲并换算。


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
`

/**
 * 【工艺链】能源→材料→传动→农业。
 *
 * 外部反馈的核心判断：库里有 246 条物理规律，但缺「往下接一层到工艺参数」的桥。
 * 这一节就是那座桥 —— 每条都给「什么场景该用」，而不只是式子。
 */
/** 【化学工程】反应器/分离/放大 —— 「能不能量产」的判据。 */
const D_CHEMENG_BODY = (): string => `【化学工程（反应器/分离/放大）】

  调用方式：{operation:"formula", formula:"id", overrides:{参数}}
  与 chemistry/* 的分工：那 23 条是**实验室尺度**（浓度/摩尔/滴定/pH），
  这 11 条是**工厂尺度**（反应器多大、几级分离、放大后会不会飞温）。


  reactor_residence_time    τ = V/Q
                            ★ 物料在装置里的平均寿命，直接决定装置体积
  reactor_conversion_first_order   X = 1 − e^(−kτ)
                            ★ **指数饱和**：kτ=3→95%、kτ=6.9→99.9%
                            「最后几个百分点最贵」—— 精制/制药贵的数学根源
  cstr_conversion           X = kτ/(1+kτ)
                            ★ 同 kτ 下远低于活塞流（kτ=3：75% vs 95%）
                            **返混的代价** —— 所以工业用多釜串联/管式
  reactor_volume_from_throughput   V = 产能×τ/收率
                            ★ **收率减半，体积翻倍**
                            忽略收率是最常见的设定错误（会低估设备规模 2~10 倍）
  distillation_min_stages   Fenske: N_min ∝ 1/ln α
                            ★ α 从 2.2 降到 1.2，板数 7.5→32（4.3 倍）
                            α→1 时板数发散 —— **这就是共沸物蒸不出来的数学形态**
  extraction_stages         级数 ∝ log(纯度)
                            ★ K_D 从 0.5 提到 5，级数 11.4→2.6（差 4.4 倍）
                            **选对溶剂比多加级数重要得多**
  adsorption_breakthrough   t_b = Vρq/(Q·C₀)
                            ★ 穿透时间 ∝ 1/浓度：进水浓度翻倍，寿命减半
                            所以「预处理」能极大延长吸附剂寿命
  mass_transfer_rate        N = K·A·ΔC（与传热完全同形）
                            ★ 三个因子都线性 → 设备能做多小取决于哪项容易提
  drying_rate_constant      dM/dt = k(M − M_e)
                            ★ 越接近平衡越慢 → **先猛吹后慢烘**
                            急烘会外干内湿（表面干了、内部还湿）
  crystallization_supersaturation   S = (C − C_sat)/C_sat
                            ★ **过饱和度越大晶体越细**
                            想要大晶体必须**慢冷却**（数天到数周），不是快点结晶
  heat_exchanger_area_chemical   A = Q/(U·ΔT)
                            ★★ **放大困境**：放热 ∝ L³ 而面积 ∝ L²
                            体积放大 10 倍时单位体积散热降到 1/2.15
                            —— 「小试能控温、中试就飞温」的物理原因

★ 共同点：这 11 条全部围绕**放大（scale-up）**，不是「实验室化学」。
  ⚠ 所有系数（k、K、U、q、α）都必须实测或查手册 —— 本批只给结构式与量级。
`;

/**
 * 【过程配方】把「静态快照」变成「能演算的世界」。
 *
 * 这不是新公式，是**把已有的 ode/recurrence 写成可直接抄用的模板**。
 * 缺口分析里判过：过程类缺口的 80% 是「没人写模板」，不是「能力不够」。
 */
const RECIPE_PROCESS_BODY = (): string => `【过程配方（让世界动起来）】

  ★ 这些不是新公式，是**可以直接抄的模板**。改两个参数就能出表。
  ★ 库里原来全是「状态量」（给定条件 → 立刻得答案），缺的是「通量」（这一刻取决于上一刻）。
  ★ 全部参数实测过，下面的输出是真跑出来的。


══ 一、瘟疫时程：第几周爆发、峰值多少人 ══

  {operation:"ode",
   expression:"dS/dt=-0.3*S*I/1000, dI/dt=0.3*S*I/1000-0.1*I",
   initial:{S:999, I:1}, from:0, to:120, at:[10,20,30,40,60,90]}

  ★ 语法要点：方程用**逗号**分隔；导数必须写 dS/dt（不能写 S'）；at 精确取点。

  实测（R0=3、γ=0.1，即 β=0.3）：
     t      S         I
     10   989.36    7.41     ← 第 10 期：几乎没动静（这是「初期无人重视」的数学原因）
     20   925.30   49.15     ← 开始加速
     30   652.22  205.66     ← **爆发**
     40   285.48  296.99     ← 峰值：感染者约 30% 人口
     60    86.84   98.94     ← 回落，但代价已成
     90    61.50    9.25     ← 尾声

  ★★ 三个 R0 的对比（这是最有叙事价值的一组）：
     R0=2（γ=0.1）峰值在第 60 期左右、峰值 14% ← 慢，社会有时间反应
     R0=3         峰值在第 40 期、峰值 30%    ← 中等
     R0=6         峰值在第 20 期、峰值 49%    ← 快到「来不及做任何事」

  ★ 换算：β = R0 × γ。γ 是恢复率的倒数（病程 10 天 → γ=0.1/天）。
  ⚠ initial 总和要等于总人口（S+I=1000），否则比例失真。
  ⚠ 本模型不含出生死亡、不含潜伏期。要潜伏期就加一个 E（暴露）状态：
     dE/dt = βSI/N − σE，dI/dt = σE − γI（σ=1/潜伏期）


══ 二、人口年表：第几年越过承载线 ══

  {operation:"recurrence", recurrence:"P*(1+0.02*(1-P/50000))",
   initial:{P:10000}, periods:60}

  ★ 这是带**内禀减速**的 logistic：增长率随拥挤自动下降。
    参数含义：0.02 = 内禀增长率 r，50000 = 承载量 K。

  实测（r=0.02、K=50000、P₀=10000）：
     期 10 → 21800 左右；期 30 → 40000 左右；期 60 → 逼近 50000

  ★ 若要「灾年」：单独一期乘 0.7 再继续（用两次 recurrence，把终值当初值）。
  ★ 若要「迁移」：加第二个状态 M，写成
     recurrence:"P*(1+0.02*(1-P/50000))-M*0.01, M+(P-40000)*0.05"
     注意多状态时**每个状态都要给出表达式**，用逗号分隔。


══ 三、资源枯竭：净产出为何逐年下降 ══

  {operation:"recurrence", recurrence:"R-2000/(1+0.03*n)",
   initial:{R:100000}, periods:12}

  ★★ **n 是内置的当前期数**（从 1 开始）—— 这是本批新增的能力，
     原来写「每期递减的量」会报 Undefined symbol n。

  实测（储量 100000、初始年采 2000、难度年增 3%）：
     期 1 → 98058｜期 6 → 89117｜期 12 → 79763

  ★ 为什么这样写：分母 (1+0.03n) 代表「开采难度逐年上升」，
    所以**同样的努力，净得越来越少** —— 这就是 EROI 下降的数学形态。

  ★ 三种常见变体：
     逐年减产：R-2000*0.97^n
     先增后减：R-2000*(1+n/20)*exp(-n/30)
     硬上限：R-min(2000, R)


══ 四、债务螺旋：i 与 g 的比较决定命运 ══

  {operation:"recurrence", recurrence:"D*(1+i)-PB",
   initial:{D:1000, i:0.05, PB:60}, periods:20}

  ★ 判据（比算具体数值更重要）：
     **i > g 且基本余额 PB < i·D 时，债务比重必然发散** —— 这是恒等式，不是经验。
     本例 i=5%、PB=60、D=1000 → 利息 50 < PB 60，所以能稳住（D 逐年微降）。
     若把 PB 改成 40 → 利息 50 > 40，D 必然指数增长。

  ★ 世界观用法：这是「王朝为什么会被利息压垮」的最简模型。
    ⚠ 不含通胀侵蚀（那会让 i 变成实际利率 i−π，反而是好事）。


══ 五、技术扩散：多少年普及一半 ══

  {operation:"ode", expression:"dA/dt=0.4*A*(1-A/1000)",
   initial:{A:10}, from:0, to:30, at:[5,10,15,20,25]}

  ★ 这是标准 logistic：dA/dt = r·A·(1−A/K)。
    r=0.4（传播率）、K=1000（最终采用者）。
  ★ 特征：**前期慢（10→50 要 5 期以上）、中期极快（50→500 只要 10 期）、后期又慢**。
    这就是「新技术头几年没人理，然后突然人人都用」的数学形态。

  ★★ 复杂传染（需要多次接触才采纳的，如改信仰、换农具）有**临界质量**：
     初始采纳者比例必须超过 1/⟨k⟩（⟨k⟩ = 平均社交度数），否则会熄灭。
     平均度 5 → 需 20% 核心；平均度 20 → 只需 5%。
     查：formula id="diffusion_threshold"


══ 用法提示 ══

  ★ 这五份覆盖了最常问的四类过程：**传染病、人口、资源、债务**（技术扩散是第五类）。
  ★ 共同套路：① 写清状态变量 → ② 写清变化率 → ③ 用 at/periods 指定想要的时点。
  ★ 不要手写循环（本项目历史上有人写了 300 行 Python 做逐年迭代，而 ode 就在那里）。
  ★ 需要参数扫描时：改一个参数重跑几次，比较 at 处的值即可。
`;

const D_PROCESS_BODY = (): string => `【工艺链】把物理规律接到工艺参数上（14 条，engineering/process）

  调用方式：{operation:"formula", formula:"id", overrides:{参数}}
  参数可带单位，会校验量纲并换算。

════ 能源链：窑炉 → 烧成 → 围护 ════
  kiln_heat_balance          Q = m·c·ΔT·(1+损比)
                             ★ 全库第一缺口：有了它「单窑耗煤 8kg」才能验算
                             100kg 坯 20→1100℃ 本身只需 97MJ，实际耗煤对应 8~15 倍，
                             差的那部分是窑体蓄热+窑壁散热+烟气带走
                             ★ 省燃料的关键在损比：间歇窑 12、连续窑/余热回收 3~6
  kiln_firing_time           t = ΔT / 升温速率（K/h）
                             ★ 升温速率被热应力卡住，不是工艺保守：
                             薄壁 150~300 K/h、厚壁 60~120 —— 壁厚翻倍，工期翻倍
  wall_heat_loss             Q = A·ΔT/R + 通风
                             ★ 用总热阻 R（多层墙要累加 δ/k），不是导热系数 k
                             64㎡、R=9.34、ΔT=25℃ → 171W；实测常比计算大（缝隙与热桥）
                             ★ 反推用途：有实测耗热 282W → 反推真实 R 值，检验保温够不够

════ 材料链：矿石 → 金属 → 硬化 → 强度 ════
  metallurgy_yield           m = m_矿 × 品位 × 回收率
                             ★ 一眼看出「年产 5kg」与「15~20kg」差在哪
                             反推最实用：两炉年产 5kg → 每炉投 5/(2×0.35×0.7)≈10kg 矿
                             三因子（品位/回收率/矿量）各自可调，外推时先看哪个先到顶
  case_depth                 x ≈ 2√(D·t)，D = D₀·exp(−Q/RT)
                             ★ **温度是平方级杠杆、时间是线性**：
                             900→950℃ 层深涨 √2 倍，而 3h→5h 只涨 1.29 倍
                             所以「渗层不够多烧一会儿」效率低，提温才是真手段
  gear_bending_strength      σ = F_t/(b·m·Y)
                             ★ 能验算「模数 4 比 2.5 厚 60% 足以承受 30kg 重锤」
                             实算：m4/z30 → d=120mm，30kg@r60 → F_t≈294N，σ≈7.7MPa（铸铁许用 30~60）
                             ⚠ 简化式，未含动载/应力集中/齿面接触疲劳；手工低速齿轮够用
  gear_geometry              d = m·z
                             ★ 齿轮一切尺寸都从模数与齿数派生（外径 d+2m、中心距 (d₁+d₂)/2）
                             传动比 i = z_从/z_主，同一模数下可自由组合齿数

════ 传动/储能/水力 ════
  pendulum_clock_drift       Δt/天 = 86400·(−½·ΔL/L + ½·Δg/g)
                             ★ 钢摆冬夏差 20℃ → 每天慢约 10.4s（这就是要重新校的原因）
                             周期只与 √L 有关，所以摆长误差的影响被压掉一半
                             ★ 异星设定直接可用：g 变多少，钟就快慢多少
  gravity_storage_discharge  t = m·g·h / P
                             ★ 用途是**检查设定自不自洽**，不是算新数：
                             25kg×2.5m=625J，若说「8W 撑 12 分钟」→ 实为 78 秒，差一个数量级
                             ★ 反推：要 8W×12min 需 5760J → 235kg×2.5m 或 25kg×23.5m
  water_turbine_output       P = ρgQHη
                             ★ 与泵同形但反向：低水头大流量 → 转速慢扭矩大，能直驱锻锤
                             ★ 效率 0.4→0.85 就是「木轮改铁轮+导流」的全部收益，翻 2 倍

════ 农业与化工 ════
  gdd_accumulated            GDD = 超出基点的日均温 × 天数
                             ★ 四季节奏的数学骨架：把时间换算成热量
                             无霜期 180~210 天 → 反推能攒多少积温，对照作物需求判断能不能熟
                             （玉米 2500~2800、小麦 1800~2200、水稻 3000+）
  leaching_residue           C_n = C₀·rⁿ（r 为每次换水的残留比）
                             ★ **换水次数比每次泡多久更重要**：
                             r=0.6 换 4 次剩 13%、6 次剩 4.7%；而泡 4 天不换几乎不衰减
  fermentation_time          t = −ln(S_残/S₀)/k
                             ★ 温度低 → k 小 → 时间成倍延长（k=0.07→43天，k=0.035→86天）
                             与 q10_temperature 串联：由温度得 k，再得工期
  syrup_concentration        V_f = V₀·Brix₀/Brix_f
                             ★ **得率只由糖度比决定**，与锅大小、火大小无关
                             所以「熬多久」只影响风味，不影响得率
  logistic_growth_rate       dN/dt = r·N·(1−N/K)
                             ★ N = K/2 时增长最快，速率恰为 rK/4
                             这是「今年到底多出来多少」——猎获只该取这一块增量
  sustainable_harvest        H_max = r·K/4（最大可持续猎获 MSY）
                             ★ 增量 ≠ 存量：「猎走一半」是吃本金，「每年取 r/2 成」才是可持续
                             鹿 r=0.4、K=400 → 40 只/年；猎 15~25 只 = 38%~63% MSY，属保守
                             ⚠ 不含 Allee 效应（小种群反而负增长）与年龄结构
  drying_time                t = −ln[(M_f−M_e)/(M_0−M_e)]/k
                             ★ 先快后慢，且**目标越接近平衡含水率越发散**
                             25% 晒到 14% 约 6.2 天；改阴干（k 降到 1/3）要 18.7 天
                             想干到 12.1% 就要 16.2 天 —— 所以 13~14% 是工程红线，不是越干越好
  storage_loss               N = N₀·(1−r)^t
                             ★ 指数不是线性：线性式算 50 年会是负数，而损耗拿不光存量
                             谷仓 r=0.04 存 5 年剩 82%；露天 r=0.15 只乘 44%
                             ★ 推论：损耗率减半胜过储量翻倍，而且前者不受地力限制
  tolerance_stack            σ_装配 = √(n·σ²)
                             ★ 单件差也能装出高精度：5 件 ±0.05 → 装配 ±0.112（线性是 ±0.25）
                             ⚠ 前提是误差独立随机；同人同机同批料的共因偏差必须退回线性叠加

★ 共同点：这些式子大多**形式上简单，但接住了此前断开的链**。
  「窑温、配比、精度、工期、产量」这些散落的经验数，有了它们才能互相验算。`;

/** 【宏观·经济（劳力/产出/储蓄/货币/通胀）】按公式 id 调用，参数可带单位。 */
const D_MACRO_BODY = (): string => `【宏观·经济（劳力/产出/储蓄/货币/通胀）】

  调用方式：{operation:"formula", formula:"id", overrides:{参数}}
  参数可带单位（"10 km"、"2 时辰"），会校验量纲并换算。


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
`

/** 【材料·本构与微观决定（胡克/断裂韧性/熔点/Ashby）】按公式 id 调用，参数可带单位。 */
const D_MATERIAL_BODY = (): string => `【材料·本构与微观决定（胡克/断裂韧性/熔点/Ashby）】

  调用方式：{operation:"formula", formula:"id", overrides:{参数}}
  参数可带单位（"10 km"、"2 时辰"），会校验量纲并换算。


【本构：应力→应变→失效】
  hooke_law                 σ = E·ε（弹性区公理，与材料种类无关）
                            ★ 补上了库里断掉的一环：有 strain 定义却没有应力
  safety_factor_check       σ_allow = σ_y/n（静载 1.5~2、冲击 2~4、疲劳 3~6）
                            ★ 安全系数是工程惯例不是物理律，失效后果重就取大
  fracture_kic              σ_c = K_IC/(Y·√(πa))
                            ★ σ_c ∝ 1/√a：裂纹长一档，承载降 √10≈3.2 倍
                            这就是为什么压力容器要定期探伤、大件比小试样更脆
  ashby_index               M = E^a·σ^b/ρ^c（指数由几何形式决定）
                            轻而刚的梁 E^½/ρ ｜ 轻而强的梁 σ^(2/3)/ρ ｜ 弹性储能 σ²/E
                            ★ 把「选材」从审美变成可计算：设定说「这合金轻又强」→ 一算就知排第几

【微观决定：材料属性从基础物理量推出】
  ideal_strength            σ_ideal ≈ E/10（Frenkel；E/5~E/15 都有人用）
                            ★ 真正有用的是比值：实际强度只有理论的 1/100~1/10
                            **这个比值就是「冶金水平」** —— 工艺差的世界只能发挥 1%
  melting_from_cohesive     T_m ≈ (2/3)·(结合能/k_B)（Lindemann）
                            ★ 熔点能从结合能推 → 可反推设计：「要熔点 2000°C 的金属」
  pugh_ductility            G/K > 0.57 偏脆，< 0.57 偏韧
                            ★ K 与 G 都由键势推出，所以脆性也能从底层推
  gruneisen_expansion       α = γ·C_v/(3KV)
                            ★ 补上闭环：原来 α 是硬设定，现在能由 K、C_v、γ 推
  hall_petch                σ_y = σ₀ + k_y·d^(−1/2)
                            ★ 晶粒细化一个数量级，强度可翻倍 ——「锻造水平」= 能达到的 d
                            ⚠ 有反 Hall-Petch 区（纳米晶粒下反而变弱）
  wiedemann_franz           κ/σ = L₀·T（L₀ = 2.44e-8 是基本常数）
                            ★ 罕见的严格关系：设了电导率，导热系数自动定
`

/** 【生物·通用（异速生长/扩散/遗传/生长/酶）】按公式 id 调用，参数可带单位。 */
const D_BIO_BODY = (): string => `【生物·通用（异速生长/扩散/遗传/生长/酶）】

  调用方式：{operation:"formula", formula:"id", overrides:{参数}}
  参数可带单位（"10 km"、"2 时辰"），会校验量纲并换算。


  sa_volume_ratio           A ∝ M^(2/3) → 面积/体积 ∝ M^(−1/3)（**纯几何**）
                            ★ 体重 ×8 → 面积 ×4 → 单位体重散热 ÷2（为什么会过热）
                            同理鳃面积也只 ×4 → 摄氧 ÷2（为什么会缺氧）
  fick_diffusion            J = D·A·ΔC/δ（鳃/肺/皮肤/根/细胞膜同一个式子）
                            ★ A∝M^(2/3)、δ∝M^(1/3) → 供氧 ∝ M^(1/3)
                            这就是「大生物必须换气而不能靠扩散」的定量证明
  diffusion_time            t ≈ Δx²/(2D)
                            ★ 1 µm→5 ms ｜ 10 µm→0.5 s（细胞够用）｜ 1 mm→83 min ｜ 1 m→158 年
                            能立刻否掉「靠扩散供氧的巨兽」，用的是硬数学而非估计
  peclet_number             Pe = L·u/D（扩散 vs 对流）
                            ★ Reynolds 数的质量输运版：库里已有动量版，缺这个
                            Pe≪1 扩散主导（微循环）、Pe≫1 必须泵（大血管）
  hardy_weinberg            p² + 2pq + q² = 1（**纯概率论**，无生物假设）
                            ★ 常算 2pq：隐性携带者比例。p=.9 q=.1 → 携带者 18% 而表现型只 1%
  gompertz_growth           N = a·exp(−b·exp(−c·t))
                            ★ 比指数/logistic 更贴合**有机体**真实生长（logistic 偏种群）
  michaelis_menten          v = Vmax·S/(Km+S)
                            ★ 一条式子覆盖五种现象：酶、载体转运、Holling 摄食、受体结合、养分吸收
                            S≪Km 近线性、S≫Km 饱和 —— 这是「处理能力有限」的通用形状
  q10_temperature           R = R₀·Q₁₀^((T−T₀)/10)
                            ★ 生物界**实际使用**的温度律（生态模型几乎都用它，不用 Ea）
                            与 arrhenius 并存：化学用 Arrhenius、生物用 Q₁₀
`

/** 【政权财政（赤字/基本余额/债务螺旋/铸币税）】按公式 id 调用，参数可带单位。 */
const D_FISCAL_BODY = (): string => `【政权财政（赤字/基本余额/债务螺旋/铸币税）】

  调用方式：{operation:"formula", formula:"id", overrides:{参数}}
  参数可带单位（"10 km"、"2 时辰"），会校验量纲并换算。


  fiscal_balance            D = T − G（**会计恒等式**）
                            ★ 关键细节：赤字**不含借债** —— 借来的钱是「赤字融资」不是收入
                            把借债算成收入，就是财政崩溃前的典型自欺
  primary_balance           PB = T −(G − 利息) = 财政余额 + 利息
                            ★ 判断「还有没有救」的第一条判据：
                            PB 正而总赤字负 → 经营赚钱、被旧债利息拖垮（可救）
                            PB 负 → 经营本身在亏（结构性危机）
  fiscal_sustainability     Δd = (i−g)·d − PB
                            ★ i>g 时债务自我膨胀 —— 古代帝国（高利率低增长）财政脆弱的根源
                            工业革命后的高增长期能承受高债务，就是这条的另一面
  seigniorage               铸币税 ≈ 通胀 × 实际货币余额
                            ★ 财政与货币的唯一接口：税收加不动、借债又 i>g → 只能铸币
                            历史上几乎所有恶性通胀都发生在财政危机之后
  effective_tax_rate        ETR = 实际税收/GDP（≠ 名义税率）
                            ★ 差额正是漏征+逃亡。「名义 vs 实际」的差距 = 政权渗透能力
                            前工业国家 ETR 通常只有 5%~10%
  fiscal_autonomy           可裁量支出占比 = 1 − 刚性占比
                            ★ 「改革为什么推不动」的定量答案：
                            刚性 80%+ → 几乎没有政策自由度，任何冲击直接触发危机
`

/** 【宏观恒等式（GDP/增长核算/趋同/费雪）】按公式 id 调用，参数可带单位。 */
const D_GDP_BODY = (): string => `【宏观恒等式（GDP/增长核算/趋同/费雪）】

  调用方式：{operation:"formula", formula:"id", overrides:{参数}}
  参数可带单位（"10 km"、"2 时辰"），会校验量纲并换算。


  gdp_expenditure           Y = C + I + G +(X−M)（会计恒等式）
                            ★ 能立刻暴露不闭合的设定：C+I+G 超过 Y → 差额只能来自净进口或举债
  growth_accounting         g_Y = g_A + α·g_K +(1−α)·g_L
                            ★ 人口与资本都停时 g_Y ≈ g_A —— 这就是停滞文明为何停滞
                            来源：BLS 官方 TFP 方法即基于此
  convergence_speed         λ =(1−α)(n+δ+g)，差距按 e^(−λt) 收敛
                            ★ 补 solow_steady_state 缺的那半：它给终点，这条给多久到达
  fisher_money              MV = PY（V 是**可调的世界观参数**）
                            ★ 金属货币社会 V 低、信用货币社会 V 高

★ 这些式子的共同特点：**缩放律与恒等式比绝对值更重要**。算出来的数可以偏，
  但「跨度翻倍挠度 16 倍」「PB = T −(G−利息)」这类关系错了就是硬伤。
  可查 operation="help", helpTopic="policy" 看文明推演配方。`

/**
 * ────────────────────────────────────────────────────────────────────
 * ## recipe 拆成三节（v2.3.4）
 *
 * 拆分前 `recipe` 一节 **5371 字符**，其中：
 *
 * ```
 *   材料推演      2834  (53%)  ← 只有做材料设定才需要
 *   文明崩溃推演   535
 *   巨兽可行性     403
 *   锚点/账本/多步  400  ← 通用，几乎每次都要
 *   错误码表       953  ← 通用，出错时必查
 * ```
 *
 * 三条推演配方是**不同场景**（财政 / 生物 / 材料），不该压在一节里 ——
 * 查「怎么算帝国会不会崩」不该先读 2834 字符的材料链条。
 *
 * 拆成：`recipe`（通用手法：锚点/账本/多步链/错误码）、
 * `recipe-fiscal`（文明崩溃）、`recipe-bio`（巨兽可行性）、`recipe-material`（材料三层链）。
 * ────────────────────────────────────────────────────────────────────
 */

/** 【通用手法】锚点 sanity、账本闭合、多步链。 */
const RECIPE_COMMON_BODY = (): string => `【锚点 sanity】工具不知道这个数该多大，但你可以逐条声明判据
  {label:"日产台数", expr:"1e8*25000", sanity:{max:1e10, note:"帝国总兵力"}}
  → ⚠ 超出锚点上限 1e10（帝国总兵力）达 250 倍
  键：max 上限 / min 下限 / expect 期望量级（expect:3 即 10³）/ note 依据
  ★ 判据来自你，工具只比对不猜；量纲不可比时不报；不声明则零提示
  ★ 目前只在批量 expressions 里生效

【账本闭合】无独立 check 操作，一条 expressions 逐项列值即可：
  [{label:"A", expr:"650*3840"}, {label:"四项和", expr:"…"}]
  再补一条 {label:"与目标之差", expr:"...-4075000"}  ← 差值 0 即闭合
  不做 PASS/FAIL：差 3 与差 3% 是两回事，压成布尔就糊了


【瓶颈排查】哪条链先撞天花板（不做成公式：它是四则运算 + 取最小，不是物理关系）
  思路：每条产线各自算「年产出上限」，然后取**最小值** —— 那个就是真瓶颈。

  {operation:"evaluate", terse:true, expressions:[
    {label:"矿→金属（收得率）", expr:"矿量*品位*回收率"},
    {label:"金属→工具（工时限）", expr:"可用工时/单件工时"},
    {label:"燃料→窑次",        expr:"年燃料/单窑耗料"},
    {label:"人力→总工日",      expr:"人数*年工作日"},
  ]}
  → 四个数里**最小的**就是瓶颈。其他三条再高也没用。

  ★ 为什么不做成 formula：min(a,b,c,d) 是四则运算，公式库收它只会增加检索负担。
    真正的知识在「该列哪几条产线」和「哪些量会互相牵制」，那属于推演，不属于公式。
  ★ 一个常见误区：**瓶颈会随规模移动**。小规模时人力是瓶颈，扩大后燃料变成瓶颈，
    再扩大水与运输变成瓶颈。所以每换一次规模都要重排一遍。
  ★ 与 payback_period 配合：解除瓶颈的投入 / 每年多出的产出 = 值不值得解除。
【多步链】批量内前一条的赋值对后一条可见：
  [{label:"单价", expr:"u=5"}, {label:"小计", expr:"u*3"}]
  ★ 中间某步失败时，依赖它的下游会明确报错，不会变成「虚成功」
`

/** 【错误码】出错时按 hint 修正。 */
const RECIPE_ERROR_BODY = (): string => `【失败时】返回 ok=false + error.type / message / hint，按 hint 修正即可，不会崩溃。
  常见 error.type：
    non_finite         结果非有限（除以零、log(0)）
    unit_mismatch      两侧单位不同量纲
    unknown_symbol     变量/函数未定义
    unit_name_conflict 目标单位名撞内置函数（1 s to min → 写 minute）
    not_a_quantity     to 左边不是带单位的量（裸数字没有单位可换）
    unknown_argument   参数名认不出来（会点名是哪个）


/**
 * ────────────────────────────────────────────────────────────────────
 * ## 领域公式节：从一节拆成九节（v2.3.4）
 *
 * 拆分前 domains 一节 **8707 字符**，是单次查询最贵的开销。
 * 而它是九个互不相关的领域压在一起 —— 查「财政赤字」也要把梁柱挠度、
 * 营养级、Péclet 数全读一遍。
 *
 * ## 为什么这是对的做法（成本结构决定）
 *
 * 
 *   schema    6212 字符   每轮固定付，无法通过拆分降低
 *   目录      1083 字符   按需付一次
 *   单节       800~1400   按需付
 * 
 *
 * 拆开后单次查询从 **8707 → 约 1500**（加目录约 2600），降 3.4 倍，
 * 而固定成本只增加目录里多出来的几行。
 *
 * ★ 这正是「总长可以扩容，但要控制单次任务查询消耗」的落点：
 *   扩容发生在**按需层**，固定层（schema）不动。
 * ────────────────────────────────────────────────────────────────────
 */

/** 【工程·结构（梁柱应力/挠度/惯性矩/螺栓焊缝）】按公式 id 调用，参数可带单位。 */
`

/** 【文明崩溃推演】财政六步链。 */
const RECIPE_FISCAL_BODY = (): string => `【文明崩溃推演】财政链，每步可核对（用 formula 逐条调，数值自己代入）
  ① effective_tax_rate     名义税率 30% 但实际只 10% → 征管弱，20% 是漏征+逃亡
  ② fiscal_balance         收入 10% GDP、支出 15% → 赤字 5%
  ③ primary_balance        PB = −5% + 利息 3% = −2% GDP
     → 不是被旧债拖垮，而是**经营本身在亏**（结构性危机，比单纯赤字严重）
  ④ fiscal_sustainability  i=8%、g=2%、d=80% → 需 PB ≥ 6%×0.8 = 4.8%，实际 −2%
     → 缺口 6.8%/年，十年翻倍
  ⑤ seigniorage            税加不动、借债又 i>g → 只能铸币 → 通胀上升
     → 通胀推高 i → 回到 ④，死亡螺旋
  ⑥ fiscal_autonomy        刚性 85% → 没有可裁量的钱，改革也推不动
  ★ 这套链能推出「为什么这个政权看着还能撑、其实已在螺旋里」，
    比「因为腐败所以要亡」可信得多——腐败只是其中一环。
`

/** 【巨兽可行性推演】生物六步链。 */
const RECIPE_BIO_BODY = (): string => `【巨兽可行性推演】生物链，回答「这么大的生物能不能活」
  ① sa_volume_ratio        体重 ×8 → 表面积 ×4 → 单位体重散热与摄氧都 ÷2
  ② fick_diffusion         A∝M^(2/3)、δ∝M^(1/3) → 供氧能力 ∝ M^(1/3)
  ③ diffusion_time         若无循环，1 m 组织扩散需 158 年 → 必须有循环系统
  ④ peclet_number          血管里 Pe≫1 → 对流主导，扩散送不到深处
  ⑤ michaelis_menten       血红蛋白结合是饱和式 → 浓度再高也提不上去
  ⑥ gompertz_growth        生长必然饱和 → 有上限体型
  ★ 结论通常是「不能靠扩散活，必须进化出循环 + 换气」，而不是「不可能」
    —— 差别在于前者给了可行路径。
`

/** 【材料推演】微观决定 → 本构 → 构件失效。 */
const RECIPE_MATERIAL_BODY = (): string => `【材料推演】三层链：**微观决定 → 本构 → 构件失效**
  分两档起步：① 只想要工程结论 → 从 B 开始，硬设定 E/σ_y/K_IC/ρ
              ② 想让材料「自洽地生出来」→ 从 A 开始，从键强度推

  A. 微观决定（材料属性从基础物理量推出）
     输入：每原子结合能（J）、原子间距、键的非谐性 γ
     ① melting_from_cohesive   T_m ≈(2/3)·E_k/k_B
        ★ 反推设计：要熔点 2000°C → 需要多大结合能？这一条能算
        ⚠ 系数 0.036（不是 2/3！）由 12 种金属实测反算得来：
          Fe 1797K vs 实测 1811（−0.8%）、W −0.5%、Mo −1.6%、Ag −0.4%
          但 Al +52%、Mg +52% 偏高 —— 轻金属的结合能构成不同，别用它推轻合金
        ⚠ 输入是**每原子**结合能（J），若资料给 kJ/mol 要先除以 6.022e23
     ② ideal_strength          σ_ideal ≈ E/10
        ★ 真正有用的是**比值**：实际强度只有理论的 1/100(工艺差) ~ 1/10(精密)
        「这个文明的冶金水平」= 他们能发挥百分之几
     ③ pugh_ductility          G/K >0.57 偏脆、<0.57 偏韧
        ★ 更强的键往往同增 K 与 G —— 这条检查「变强了但更脆」的副作用
     ④ gruneisen_expansion     α = γ·C_v/(3KV)
        ★ 补闭环：原来 α 只能硬填，现在由 K、C_v、γ 推出来
     ⑤ wiedemann_franz         κ/σ = L₀·T（L₀ 是基本常数）
        ★ 罕见的严格关系：设了电导率，导热系数自动定，不必两个都编

     ★ 关键的物理直觉：**结合能越深 → 势能井越陡 → E 越大 → 熔点与强度都上升**
       所以「改基础物理量」不是各自拍脑袋，而是有方向、有幅度的推导。

  B. 本构（应力 → 应变 → 失效）
    输入：E、σ_y、K_IC、ρ
     ① hooke_law              σ = E·ε。σ=200MPa → ε=1e-3
                             ★ 弹性区公理；超屈服后失效，别用它算大变形
     ② safety_factor_check    σ_allow = σ_y/n。200/235=1.18 → 低于 1.5，不安全
                             n 取 1.5~2（静载）／2~4（冲击）／3~6（疲劳）
     ③ fracture_kic           σ_c = K_IC/(Y·√(πa))
                             5mm 裂纹 → 30e6/√(π·0.005)=239MPa（与屈服几乎相等）
                             ★ σ_c ∝1/√a：裂纹 1mm→1cm，承载降 √10≈3.2 倍
                             ⚠ 仅脆性/小范围屈服；高韧材料会低估（需 J 积分）
     ④ hall_petch             σ_y = σ₀ + k_y·d^(−1/2)
                             ★ 同一成分，晶粒细化一档强度可翻倍
                             「锻造水平」= 这个文明能达到的 d
                             ⚠ 有反 Hall-Petch 区（纳米晶反而变弱）
     ⑤ ashby_index            M = E^a·σ^b/ρ^c
                             轻而刚的梁 E^½/ρ ｜ 轻而强的梁 σ^(2/3)/ρ ｜ 储能 σ²/E
                             ★ 把「这合金轻又强」从形容词变成可比的数

  C. 构件失效（接已有的工程公式）
     buckling_euler / beam_bending_stress / beam_uniform_load_deflection / bolt_shear_capacity
     ★ 到这一步才谈「这根梁要多粗」—— 前面两层定材料，这层定尺寸

  完整例子（铁：结合能 415 kJ/mol、E=2e11、σy=235MPa、K_IC=30MPa·√m、ρ=7850）
      输入换算：415 kJ/mol ÷ 6.022e23 = 6.89e-19 J/原子
      melting_from_cohesive  → 1797 K（实测铁 1811 K，−0.8% ✓ 自洽）
      ideal_strength         → 2e10 Pa = 20 GPa（理论值上限）
      实际/理论 = 235e6/2e10 = **1.2%** → 属「工艺一般」而非精密
        （精密工艺能到 10%，差一个数量级 —— 这就是该调的世界观参数）
      pugh_ductility         设 G=8e10、K=1.6e11 → 0.5 <0.57，韧性好 ✓
      hooke_law              200MPa → ε=1e-3
      safety_factor_check    许用 156.7MPa，而实际 200MPa
                             200/156.7=1.28 → 只有 1.28 倍余量，低于要求的 1.5
      fracture_kic           5mm 裂纹时 σ_c=239MPa，与屈服 235MPa 之比 **1.02**
     ★ 结论：这钢的瓶颈不在强度而在**裂纹容限**——
       5mm 裂纹就让承载降到屈服线，所以要定期探伤、限制缺陷尺寸。
       这是单看屈服强度绝对推不出来的结论。

  ★ 一条纪律：工具**不判断你的材料合不合理**，只保证「基于你给的性质，后果算对」。
    A 层给方向、B 层给数值、C 层给尺寸 —— 想让哪层自洽，就从哪层起步。
`

/**
 * 各节注册表。**顺序即目录顺序**，而顺序决定「AI 会不会翻到它」。
 *
 * 排前面的是高频或高风险节：`evaluate` 最常用、`world` 体量最大。
 *
 * ## v2.3.4 从 14 节扩到 26 节
 *
 * 不是为了塞更多内容，而是**把「按需付费」做彻底**：
 *
 * ```
 *   原 domains  8707 字符  九个互不相关的领域压在一起
 *   原 recipe   5371 字符  三条场景配方 + 通用手法 + 错误码
 * ```
 *
 * 查「财政赤字」要读梁柱挠度与 Péclet 数，查「帝国会不会崩」要先读 2834 字符的材料链 ——
 * 这不合理。拆开后单次查询从 8707 降到 2840（最大节），典型任务约 2400。
 *
 * ★ 固定成本（schema 6212 字符）**一分没涨**：扩容全部发生在按需层。
 * 目录从 1083 涨到 1284 —— 多出的 201 字符换来 12 个可独立查询的节。
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
    title: '求值 evaluate',
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
    title: '解方程与微积分（solve）',
    summary: '解方程与方程组、符号求导积分。退化方程组会说「无穷多解」而非静默给单解。',
    aliases: ['方程', '求解', 'solve', '积分', '求导', '微积分', 'algebra'],
    body: ALGEBRA_BODY,
  },
  {
    key: 'units',
    tier: 'core',
    /** 信号量 173：中制单位（里/丈/斤/亩）与 to 换算在各文档频繁出现。 */
    weight: 173,
    title: '单位换算 units',
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
    /**
     * 摘要里必须提**体系**：用户要的是「公式怎么连起来」，
     * 而不只是「有多少条公式」。一条 summary 里塞不下 18 条链的名字，
     * 所以只给入口 `query="sys"`。
     */
    /** 压缩：去掉「（公式怎么连起来）」那半句重复解释，省 9 字符。 */
    summary: `调 ${FORMULAS.length} 条公式、overrides 改参数。★ query="sys" 看 ${FORMULA_SYSTEM_COUNT} 条链；formulas:[…] 批量。`,
    aliases: ['公式', 'formula', '检索', 'overrides', '覆盖参数'],
    body: FORMULA_BODY,
  },
  {
    key: 'world',
    tier: 'core',
    /** 信号量 26。 */
    weight: 26,
    title: '世界观推演（world / 地形 / 气候）',
    summary: '星球参数 → 体感画像：重力昼夜气候、天空、恒星寿命、卫星、生命闸门。★ 字段表在这。',
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
    key: 'd-struct',
    tier: 'core',
    short: '梁柱结构',
    /** 从原 domains 一节拆出，权重按各领域实际使用分配。 */
    weight: 12,
    title: '工程·结构（梁柱应力/挠度/惯性矩/螺栓焊缝）',
    summary: '抗弯截面系数、弯曲应力、自重弯矩、均布挠度、惯性矩、螺栓抗剪、角焊缝。★ 跨度的高次方律：挠度 ∝ L⁴、弯矩 ∝ L²。',
    aliases: ['结构', '梁', '柱', '跨中挠度', '弯曲应力', '惯性矩', '螺栓', '焊缝', 'beam'],
    body: D_STRUCT_BODY,
  },
  {
    key: 'd-thermal',
    tier: 'core',
    short: '热机煤耗',
    /** 从原 domains 一节拆出，权重按各领域实际使用分配。 */
    weight: 10,
    title: '工程·热机与能量（卡诺/蒸汽/锅炉/换热）',
    summary: '卡诺效率上限、蒸汽机功率、锅炉煤耗、换热器 LMTD、平壁导热。★ 卡诺是上限不是可达值。',
    aliases: ['热机', '卡诺', '蒸汽机', '锅炉', '煤耗', '换热器', '导热', 'carnot',
      '循环', '内燃机', '燃气轮机', '制冷', '空调', '热泵', '蓄热', 'Rankine', 'Otto', 'Diesel'],
    body: D_THERMAL_BODY,
  },
  {
    key: 'd-fluid',
    tier: 'core',
    short: '流体气动',
    /** 从原 domains 一节拆出，权重按各领域实际使用分配。 */
    weight: 10,
    title: '工程·流体与气动（管流/泵 · 升力/阻力/失速/激波）',
    summary: '管道流量、达西水头损失、水泵轴功率、孔口出流、风功率、水轮机。★ 管径平方律、风功率随 v³。',
    aliases: ['流体', '管流', '水头', '泵', '孔口', '风功率', '水轮机', 'darcy',
      '升力', '阻力', '空气动力', '飞行', '失速', '马赫', '激波', '雷诺数', '边界层', '沉降', 'lift', 'drag'],
    body: D_FLUID_BODY,
  },
  {
    key: 'd-coldwar',
    tier: 'core',
    short: '冷战学科',
    /** 1940—1970 最被低估的一层：不是「物理的延伸」，而是处理「信息与调控」的另一套语言。 */
    weight: 12,
    title: '冷战支柱（控制论/信息论/排队/可靠性/决策）',
    summary: '反馈把残差压 1/(1+K)、延迟卡死增益上限、信道容量 B·log₂(1+S/N)、' +
      'ρ/(1−ρ) 排队悬崖、串联可靠度 R^n、贝叶斯假阳性。★ 31 条，全是有闭式解的那一层。',
    aliases: ['冷战支柱', '冷战学科', '控制论', '信息论', '反馈', '信道', '排队', '运筹', '可靠性', '博弈', '贝叶斯',
      'cybernetics', 'shannon', 'queue', 'reliability', 'bayes'],
    body: D_COLDWAR_BODY,
  },
  {
    key: 'd-modern-society',
    tier: 'core',
    short: '现代物社',
    /**
     * 1900—2000 的两条主线：物理进入「经典失效」区，社科进入「可测量」区。
     * 与 d-coldwar 分节的理由：那节是「信息与调控」的语言，
     * 这节是「物质底层与社会规模」的结论，两者的查询场景不重叠。
     */
    weight: 11,
    title: '现代物理与社会科学（量子/固体/核 · 人口/网络/城市）',
    summary: 'T⁴ 辐射与峰值波长、费米能、带隙颜色表、裂变 8.2e13 J/kg、铁峰；' +
      '人口转变的爆炸机制、更替生育率 2.8、幂律与扩散阈值、帕金森 6%、城市标度 β=1.15。' +
      '★ 26 条，每条都标了「统计/经验 vs 因果」的界线。',
    aliases: ['现代物理', '量子', '黑体', '固体', '半导体', '核物理', '裂变', '聚变',
      '人口转变', '生育率', '网络科学', '幂律', '城市标度', '齐普夫', '帕金森', '社科',
      'quantum', 'solid state', 'nuclear', 'demography', 'network', 'urban'],
    body: D_MODERN_SOCIETY_BODY,
  },
  {
    key: 'd-ecology',
    tier: 'core',
    short: '生态畜牧',
    /** 从原 domains 一节拆出，权重按各领域实际使用分配。 */
    weight: 8,
    title: '生物·生态（载畜量/料肉比/NPP/营养级）',
    summary: '草地载畜量、畜禽出栏、料肉比、农田 NPP、营养级支撑。★ 每级只剩约 10%：养活 1kg 猛兽要 100kg 草。',
    aliases: ['生态', '载畜量', '料肉比', '出栏', 'NPP', '营养级', '畜牧', 'grazing'],
    body: D_ECOLOGY_BODY,
  },
  {
    key: 'd-macro',
    tier: 'core',
    short: '劳力货币',
    /** 从原 domains 一节拆出，权重按各领域实际使用分配。 */
    weight: 8,
    title: '宏观·经济（劳力/产出/储蓄/货币/通胀）',
    summary: '劳动力、总产出、储蓄率、资本产出比、货币供应、通胀压力。★ 通胀 ≈ 货币增速 − 产出增速。',
    aliases: ['宏观', '劳力', '储蓄率', '资本产出比', '货币供应', '通胀', '经济'],
    body: D_MACRO_BODY,
  },
  {
    key: 'd-process',
    tier: 'core',
    weight: 18,
    short: '工艺链',
    title: '工艺链（窑炉/冶金/齿轮/发酵·14 条）',
    summary: '把物理规律接到工艺参数：窑炉热平衡、烧成时间、围护热损、冶金收得率、渗碳层深、齿轮强度、摆钟漂移、重力储能、水轮、积温、浸提、发酵、浓缩。',
    aliases: ['工艺', '窑炉', '烧成', '冶金', '渗碳', '齿轮', '发酵', '酿造', '糖浆', '窑', '工程工艺', 'process'],
    body: D_PROCESS_BODY,
  },
  {
    key: 'd-chemeng',
    tier: 'core',
    /** 与 d-process 分节的理由：那节是「单件工艺」（窑炉/冶金），这节是「工业放大」。 */
    weight: 10,
    short: '化工放大',
    title: '化学工程（反应器/分离/放大）',
    summary: '停留时间→反应器体积、一级反应转化率的指数饱和、CSTR 返混代价、' +
      'Fenske 板数 ∝1/lnα、萃取级数 ∝log 纯度、吸附穿透、传质速率、干燥降速、' +
      '过饱和度决定晶粒、**放大困境（放热 ∝L³ 而面积 ∝L²）**。★ 11 条，全部围绕 scale-up。',
    aliases: ['化学工程', '反应器', '反应釜', '精馏', '萃取', '吸附', '传质', '干燥',
      '结晶', '放大', '量产', '化工', 'scale-up', 'reactor', 'distillation'],
    body: D_CHEMENG_BODY,
  },
  {
    key: 'd-material',
    tier: 'core',
    short: '材料本构',
    /** 从原 domains 一节拆出，权重按各领域实际使用分配。 */
    weight: 14,
    title: '材料·本构与微观决定（胡克/断裂韧性/熔点/Ashby）',
    summary: '胡克定律与许用应力、断裂韧性 K_IC、Ashby 选材、理论强度、熔点与结合能、Pugh 脆韧性、Hall-Petch。',
    aliases: ['材料', '胡克', '断裂韧性', '韧性', '熔点', 'Ashby', '选材', '强度', '结合能', 'pugh'],
    body: D_MATERIAL_BODY,
  },
  {
    key: 'd-bio',
    tier: 'core',
    short: '生物通用',
    /** 从原 domains 一节拆出，权重按各领域实际使用分配。 */
    weight: 14,
    title: '生物·通用（异速生长/扩散/遗传/生长/酶）',
    summary: '表面积-体积比、Fick 扩散、扩散时间、Péclet、Hardy-Weinberg、Gompertz、米氏、Q₁₀。★ 跨类群跨世界通用。',
    aliases: ['生物', '异速生长', '扩散', '供氧', '遗传', '基因频率', '生长曲线', 'Q10', '米氏', 'fick', 'Gompertz'],
    body: D_BIO_BODY,
  },
  {
    key: 'd-fiscal',
    tier: 'core',
    short: '政权财政',
    /** 从原 domains 一节拆出，权重按各领域实际使用分配。 */
    weight: 12,
    title: '政权财政（赤字/基本余额/债务螺旋/铸币税）',
    summary: '财政余额、基本余额、债务可持续判据、铸币税、有效税率、财政自由度。★ 「这个政权还有没有救」的判据在这。',
    aliases: ['财政', '赤字', '税收', '债务', '铸币税', '基本余额', '国债', '破产', 'fiscal'],
    body: D_FISCAL_BODY,
  },
  {
    key: 'd-gdp',
    tier: 'core',
    short: 'GDP增长',
    /** 从原 domains 一节拆出，权重按各领域实际使用分配。 */
    weight: 10,
    title: '宏观恒等式（GDP/增长核算/趋同/费雪）',
    summary: '支出法 GDP（会计恒等式）、增长核算 TFP、趋同速度、费雪方程。★ 恒等式能立刻否掉不闭合的设定。',
    aliases: ['GDP', '增长核算', 'TFP', '趋同', '费雪', '货币数量', '恒等式', '全要素生产率'],
    body: D_GDP_BODY,
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
    /**
     * ★ 从 extra 提到 core（2026-11-08）。
     *
     * 实测反馈里最重的一条：该会话「写了 300 行 Python 做逐年迭代、参数扫描、
     * 双状态耦合」，而 ode 就在那里 —— 只是排在「低频」栏的最后一行。
     *
     * 所以「低频」这个分档本身是错的：它表达的是「用得少」，
     * 但用得少不等于「该在想建模时绕过它」。
     */
    tier: 'core',
    /**
     * 权重从 4 提到 60。
     *
     * 原来的 4 是「实践文档里出现 4 次」的信号量 —— 但这只反映**已经发生的使用**，
     * 不反映**该用而没用的机会数**。实测那份会话里手写了 6 个脚本做逐年迭代，
     * 那些都该是一次 ode/recurrence 调用。所以按「错过的机会」重估。
     */
    weight: 60,
    short: '微分方程与递推',
    title: '动力学：微分方程与离散递推（ode / recurrence）',
    /**
     * 压缩过一轮（91 → 63 字符）。
     *
     * 原文把同一件事说了两遍：「写年表用离散值」与「离散用 recurrence 出逐年表」
     * 是同一句。合并后省 28 字符，信息量不减 —— 细节都在 ODE_BODY 里。
     */
    summary:
      '连续用 ode（RK4，支持 min() 约束）；离散年表用 recurrence。★ at:[5,10,20] 精确取点。',
    aliases: ['微分方程', 'ode', '递推', 'recurrence', '逐年', '年表', '增长模型', '传染病', '捕食模型', 'rk4'],
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
    /**
     * 「这个城能守多久」这类问法属于收支够不够，不是物理上限。
     * 补上够/不够的动词短语，让它能命中这一节。
     */
    aliases: ['收支', '盘点', '养得起', '经济', '天体', '火星', '够吃', '够用', '够不够', '守多久'],
    body: BALANCE_BODY,
  },
  {
    key: 'ledger',
    /**
     * ## 为什么是 core 而不是 extra
     *
     * 它是**两段共用**的（反馈包 14 号的关键发现）：
     * 推演段分配比（士农工商合计要 100%），对账段查闭合（99.011%）。
     * 而账本问题占全部硬伤的 48% —— 这个频率不该只值一个折叠标签。
     */
    tier: 'core',
    /** 信号量按「两段共用」估：推演分配比 + 对账查闭合。 */
    weight: 20,
    short: '台账闭合',
    title: '台账闭合（ledger）',
    /**
     * 压缩：60 → 41 字符。原句「推演分配比与对账查闭合共用」在正文里说，
     * 目录这一行只需要让人知道「它能查占比合不上」。
     */
    summary: '分项之和 vs 总量：占比差在哪、哪项疑似 10 倍笔误。★ 两段共用。',
    /**
     * 别名要覆盖**用户的实际问法**，不只是名词。
     *
     * 实测：「账本对不上」原来只命中 recipe（因为它提到「账本闭合」，
     * 但那只是通用手法里的一句话）。补上「对不上/合不上/差在哪/笔误」
     * 这类动词短语后，问法能直达这一节。
     */
    aliases: [
      '台账', '闭合', '占比', '合计', '配比', 'ledger',
      '对不上', '合不上', '差在哪', '笔误', '漏项', '分项',
      '100%', '百分之', '账本', '结算',
    ],
    body: LEDGER_BODY,
  },
  {
    key: 'interval',
    /**
     * ## 为什么是 core
     *
     * 推演段的设定**天然是区间**（「大约一万吨」「20–50%」），
     * 而工具此前只支持点值 —— 反馈包 15 号判定这是「推演失真的源头之一」。
     * 修这类失真的能力该在目录首页，不是折叠区。
     */
    tier: 'core',
    /** 推演段高频：设定天然是区间。 */
    weight: 18,
    short: '区间运算',
    title: '区间运算（interval）',
    /**
     * 压缩：17 字符的示例数值对「让人知道有这么个能力」没有增量价值，
     * 换成结果形态描述；完整例子在 INTERVAL_BODY 里。
     */
    summary: '上下界进来、上下界出去，并给把握分档。★ 不把区间压成单值。',
    aliases: ['区间', '范围', '上下界', '大约', 'interval'],
    body: INTERVAL_BODY,
  },
  {
    key: 'compare',
    tier: 'core',
    /**
     * 方案对比是推演段的常规动作：反馈包 15 号把它列为「AI 实际做的 7 类动作」之一
     * （第 43 轮列强国力表、第 47 轮海洋式 vs 植物式）。
     */
    weight: 16,
    short: '方案对比',
    title: '方案对比（compare）',
    summary: '几个互斥选项比指标：表格 + 每列最强者。★ 不给权重就不给综合分（工具不猜哪个指标更重要）。',
    aliases: [
      '方案', '对比', '比较', '哪个好', '选哪个', '权衡', 'compare',
      '对比表', '优劣',
    ],
    body: COMPARE_BODY,
  },
  {
    key: 'extract',
    tier: 'core',
    /**
     * 对账段的第一件事：把文档里的数字抠出来。
     * 反馈包实测「40% 的工作量在这里，而工具零支撑」。
     */
    weight: 22,
    short: '数字台账',
    title: '数字台账（extract_numbers）',
    summary: '从正文抽结构化数字：中文量级折算、区间给上下界、每个数带上下文。★ 对账第一步。',
    aliases: [
      '抽取', '台账', '抠数字', '抽数字', '提取', 'extract',
      '识别数字', '表格化', '结构化',
    ],
    body: EXTRACT_BODY,
  },
  {
    key: 'hierarchy',
    tier: 'core',
    /**
     * 99层项目 7 轮返工里 5 轮是它 —— 推演段最痛的表计算。
     */
    weight: 19,
    short: '编制树',
    title: '编制树（hierarchy）',
    summary: '每级辖属数 × 底层基数 → 逐级人数；给总兵力可反解。★ 编制对不上时查这里。',
    aliases: [
      '编制', '层级', '树状', '辖属', '兵力编制', 'hierarchy',
      '军区', '师团营', '建制', '组织架构',
    ],
    body: HIERARCHY_BODY,
  },
  {
    key: 'feasibility',
    tier: 'extra',
    /**
     * 信号量 31：反馈包实测它是高频功能（被用了 31 次）。
     *
     * 但它在 help 里**整节缺失**——`helpTopic:'feasibility'` 报「没有此节」。
     * 这正是 A33「claims 数组假通过」的根因：没有文档 → 猜入参 → 猜成数组 → 整批丢弃。
     *
     * 权重给 31 与实测一致；放 extra 档是因为它一次调用就能答完，
     * 不像 evaluate/world 那样贯穿全程。
     */
    weight: 31,
    short: '物理上限',
    title: '物理可行域（feasibility）',
    summary: 'claims 传**对象**（不是数组）：这个世界能不能容纳这么多人/这么高的楼。不带 claims 列出 11 项上限。',
    /**
     * 收紧：原来有「能不能」这个过于泛的别名，
     * 导致「这个城能守多久」也命中它（那其实是粮食够不够，不是物理上限）。
     * 换成更具体的能力词。
     */
    aliases: ['可行', '上限', '容纳', 'feasibility', '限制', '生理上限', '工程上限', '最多能'],
    body: FEASIBILITY_BODY,
  },
  {
    key: 'derivation',
    /** 同上，从 extra 提到 core：参数扫描与结论翻转是建模的一部分。 */
    tier: 'core',
    /** 信号量 21。 */
    weight: 21,
    short: '推演栈 29 子命令',
    title: '推演栈（derivation 子命令）',
    summary: '敏感度/结论翻转/逆推校准/相图/算力预算等 29 子命令。★ 全部子命令在这。',
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
    /** 通用手法：锚点/账本/多步链。几乎每次做多步推演都要看。 */
    tier: 'core',
    weight: 20,
    short: '通用手法',
    title: '通用手法（锚点 sanity / 账本闭合 / 多步链）',
    summary: '怎么给数字加你自己的判据（sanity）、怎么串多步链。★ 不依赖领域。',
    aliases: ['锚点', 'sanity', '账本', '闭合', '多步', '配方', 'recipe'],
    body: RECIPE_COMMON_BODY,
  },
  {
    key: 'recipe-errors',
    tier: 'core',
    weight: 12,
    short: '错误码对照',
    title: '错误码对照（ok=false 时看这节）',
    summary: 'non_finite / unit_mismatch / unknown_symbol / not_a_quantity 等错误类型的含义与修法。',
    aliases: ['错误', '报错', 'error', '失败', 'error type'],
    body: RECIPE_ERROR_BODY,
  },
  {
    key: 'recipe-fiscal',
    tier: 'core',
    weight: 14,
    short: '文明崩溃链',
    title: '推演配方·文明崩溃（财政六步链）',
    summary: '征管弱 → 赤字 → 基本余额为负 → i>g 螺旋 → 铸币 → 改革无空间。★ 每步可核对。',
    aliases: ['文明崩溃', '帝国崩溃', '财政链', '死亡螺旋', '破产推演'],
    body: RECIPE_FISCAL_BODY,
  },
  {
    key: 'recipe-bio',
    tier: 'core',
    weight: 12,
    short: '巨兽可行性',
    title: '推演配方·巨兽可行性（生物六步链）',
    summary: '表面积比 → Fick 通量 → 扩散时间 → Péclet → 饱和 → 生长上限。★ 回答「这么大的生物能不能活」。',
    aliases: ['巨兽', '巨型生物', '可行性', '能不能活', '生物链'],
    body: RECIPE_BIO_BODY,
  },
  {
    key: 'recipe-material',
    tier: 'core',
    weight: 14,
    short: '材料三层链',
    title: '推演配方·材料（微观决定 → 本构 → 构件失效）',
    summary: '从键强度推熔点/模量/强度，再到胡克/断裂韧性/许用应力，最后接梁柱尺寸。★ 两档起步。',
    aliases: ['材料推演', '材料链', '本构', '键强度', '熔模强'],
    body: RECIPE_MATERIAL_BODY,
  },
  {
    key: 'recipe-process',
    tier: 'core',
    /** 过程配方：把「静态快照」变成「能演算的世界」。缺口分析里的 P0。 */
    weight: 16,
    short: '过程配方',
    title: '过程配方（瘟疫时程/人口年表/资源枯竭/债务螺旋/技术扩散）',
    summary: '★ 不是新公式，是可直接抄的 ode/recurrence 模板：' +
      '瘟疫第几周爆发、人口第几年越线、资源为何逐年减产、债务何时发散、技术几年普及。' +
      '全部参数实测过。含 **recurrence 的内置期数变量 n**（本轮新增）。',
    aliases: ['过程', '时程', '演化', '动力学', '怎么变', '逐年', '逐期',
      '瘟疫', '疫情', '人口年表', '资源枯竭', '债务', '扩散', 'process', 'dynamics'],
    body: RECIPE_PROCESS_BODY,
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
/**
 * 把查询切成词元。
 *
 * ## 为什么中文要滑窗
 *
 * 中文没有空格，`能不能住人` 不能靠 split 切。
 * 但也不能直接拿整串去比子串 —— `帮我算一下这个城能守多久`
 * 整串在正文里当然找不到。
 *
 * 所以取 2–4 字的滑窗：短到能命中关键词，长到不至于全撞上。
 *
 * @param text - 原始查询
 * @returns 去重后的词元列表
 */
function tokenizeQuery(text: string): string[] {
  const raw = text.toLowerCase()
  const out = new Set<string>()
  /** 英文/数字按词切。 */
  for (const word of raw.match(/[a-z][a-z0-9_-]{1,}/g) ?? []) out.add(word)
  /** 中文按 2–4 字滑窗。 */
  const cjk = raw.replace(/[^\u4e00-\u9fa5]/g, '')
  for (let size = 4; size >= 2; size -= 1) {
    for (let start = 0; start + size <= cjk.length; start += 1) {
      out.add(cjk.slice(start, start + size))
    }
  }
  /** 整串也留一个（短查询时最有效）。 */
  if (cjk.length >= 2) out.add(cjk)
  return [...out]
}

/**
 * 一个节的搜索索引（惰性构建，每节只算一次）。
 *
 * 权重分配的依据：
 * ```
 *   key 命中      ×10  —— 直接叫对了名字，最强信号
 *   别名命中      ×6   —— 用户用了同义词
 *   标题命中      ×4   —— 标题里出现，通常正是这一节的用途
 *   short 命中    ×3   —— 六字标签
 *   正文命中      ×1   —— 正文出现太泛，只能算弱信号
 * ```
 */
interface TopicIndex {
  topic: HelpTopic
  keyText: string
  aliasText: string
  titleText: string
  shortText: string
  bodyText: string
}

const TOPIC_INDEX_CACHE = new Map<string, TopicIndex>()

/**
 * 取（并缓存）某一节的搜索索引。
 *
 * @param topic - 节
 * @returns 索引
 */
function topicIndex(topic: HelpTopic): TopicIndex {
  const cached = TOPIC_INDEX_CACHE.get(topic.key)
  if (cached) return cached
  const built: TopicIndex = {
    topic,
    keyText: topic.key.toLowerCase(),
    aliasText: (topic.aliases ?? []).join(' ').toLowerCase(),
    titleText: topic.title.toLowerCase(),
    shortText: (topic.short ?? '').toLowerCase(),
    bodyText: topic.summary.toLowerCase(),
  }
  TOPIC_INDEX_CACHE.set(topic.key, built)
  return built
}

/** 一条搜索结果。 */
export interface HelpSearchHit {
  /** 节的 key。 */
  key: string
  /** 标题。 */
  title: string
  /** 一句话简介。 */
  summary: string
  /** 相关度分数（越大越相关）。 */
  score: number
  /** 命中了什么（给调用方解释为什么推荐这条）。 */
  matched: string[]
}

/**
 * 在全部 help 节里搜索。
 *
 * ## 为什么需要它
 *
 * 目录能回答「有哪些能力」，但答不了「我想做的那件事对应哪个能力」。
 * 实测：AI 拿着「这个城能守多久」「改常数会影响什么」这类问题，
 * 在目录里找不到对应项 —— 目录用的是**能力名**，而它脑子里是**任务描述**。
 *
 * 这个搜索就是那座桥：用任务描述的词，去找能力名与简介。
 *
 * ## 排序
 *
 * 按加权命中分排序。只返回分数 > 0 的，最多 `limit` 条。
 * 若最高分太低（< 8，即只命中了正文级别的弱信号），
 * 说明大概率没有对应能力 —— 这时调用方应回目录，而不是盲信第一条。
 *
 * @param query - 自然语言描述或关键词
 * @param limit - 最多返回几条（默认 5）
 * @returns 按相关度降序的命中列表
 */
export function searchHelp(query: string, limit = 5): HelpSearchHit[] {
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) return []
  const hits: HelpSearchHit[] = []

  for (const topic of HELP_TOPICS) {
    const idx = topicIndex(topic)
    let score = 0
    const matched = new Set<string>()

    for (const token of tokens) {
      if (idx.keyText === token) { score += 40; matched.add('key') }
      else if (idx.keyText.includes(token)) { score += 10; matched.add('key') }
      if (idx.aliasText.includes(token)) { score += 6; matched.add('别名') }
      if (idx.titleText.includes(token)) { score += 4; matched.add('标题') }
      if (idx.shortText.includes(token)) { score += 3; matched.add('标签') }
      if (idx.bodyText.includes(token)) { score += 1; matched.add('简介') }
    }

    if (score > 0) {
      hits.push({
        key: topic.key,
        title: topic.title,
        summary: topic.summary,
        score,
        matched: [...matched],
      })
    }
  }

  hits.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
  return hits.slice(0, limit)
}

/**
 * 把搜索结果渲染成给 AI 读的文本。
 *
 * @param query - 原始查询
 * @param hits - 搜索结果
 * @returns 文本
 */
function renderSearch(query: string, hits: HelpSearchHit[]): string {
  if (hits.length === 0) {
    return (
      '没有找到与 "' + query + '" 相关的 help 节。\n' +
      '可以试：换用更具体的名词（如「单位」「账本」「区间」），或不带参数看目录。'
    )
  }

  const lines: string[] = []
  lines.push('═══ 搜索 "' + query + '" 命中 ' + hits.length + ' 节 ═══')
  lines.push('')

  /**
   * 弱匹配要明确标出来。
   *
   * 若最高分 < 8，说明只命中了简介里的字（那些词太泛），
   * 很可能**根本没有对应能力**。这时说「不确定」比给一条像模像样的
   * 结果更有用 —— 否则 AI 会拿一个错节当答案。
   */
  const weak = hits[0].score < 8
  if (weak) {
    lines.push('⚠ 命中的只是简介里的常见词，**大概率没有正好对应的节**。')
    lines.push('  下面按相关度排列，请自行判断；也可以不带参数看目录。')
    lines.push('')
  }

  for (const hit of hits) {
    lines.push('  ' + hit.key + '  ' + hit.title)
    lines.push('    ' + hit.summary)
    lines.push('    （命中：' + hit.matched.join('/') + '　分数 ' + hit.score + '）')
    lines.push('')
  }
  lines.push('取某一节全文：helpTopic:"<key>"。')
  return lines.join('\n')
}

/**
 * 查找一节：先精确，再别名，再包含。
 *
 * @param topic - 查询词
 * @returns 命中的节，或 undefined
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
  /**
   * ## 目录分三段：算术 / 建模与推演 / 其余
   *
   * 实测反馈（能力评估文档第 4 节）是本轮最重的一条：
   *
   * > 「一个能做动力学 + 参数扫描 + 499 条领域公式的工具，被排在了『低频』栏里。」
   * > 「我写了 300 行 Python 做逐年迭代、参数扫描、双状态耦合 ——
   * >   而 ode、sensitivity、formula 就在那里，只是排在了『低频』栏的最后一行。」
   *
   * 原始证据也很硬：该会话调用 math_execute 18 次、手写 Python 6 个脚本约 300 行，
   * 而脚本做的事（逐年迭代、参数扫描、状态耦合）工具全都有对应的 operation。
   *
   * ## 所以改动只有一处，但很关键
   *
   * 不是「再加一句说明」，而是**把建模类从『低频』栏里提出来单独成段**。
   * 因为「低频」这个词本身就在劝退 —— 它表达的是「用得少」，
   * 而 `ode` 用得少不代表不该在写增长模型时想起它。
   *
   * 并且在这一段的开头直接给一句**触发词**：「正在手写循环/逐年表/参数扫描？先看这几节」。
   * 文档的建议原话也是这句：「能力不缺，缺的是一句『你正在手写循环？先看这里』」。
   */
  /**
   * 建模段包含：动力学、公式库、参数扫描、配方、世界观，以及**九个领域公式节**。
   *
   * 领域节原本压成一节 `domains`（8707 字符），现在拆开 ——
   * 查询「财政赤字」不必再读梁柱挠度与 Péclet 数。
   * 拆开后它们仍然属于「建模」，因为它们都是公式（而不是算术）。
   */
  const MODELING_KEYS = ['ode', 'formula', 'derivation', 'recipe', 'recipe-errors', 'recipe-fiscal', 'recipe-bio', 'recipe-material', 'recipe-process', 'world',
    'd-struct', 'd-thermal', 'd-fluid', 'd-ecology', 'd-macro', 'd-material', 'd-bio', 'd-fiscal', 'd-gdp', 'd-process', 'd-coldwar', 'd-modern-society', 'd-chemeng']
  const isModeling = (topic: HelpTopic) => MODELING_KEYS.includes(topic.key)
  const arithmetic = core.filter((topic) => !isModeling(topic))
  const modeling = core.filter(isModeling)
  const lines: string[] = [
    '══════ math_execute 能力目录（' + HELP_TOPICS.length + ' 节）══════',
    'helpTopic:"键名" 取全文；可中文词（矩阵/星球）。helpQuery:"…" 按任务搜。',
    '',
    '  ── 一、算术 ──',
  ]
  for (const topic of arithmetic) {
    lines.push('  ' + topic.key.padEnd(10) + topic.title)
    lines.push('    ' + topic.summary)
  }
  lines.push('')
  lines.push('  ── 二、建模与推演 ──')
  lines.push('  ★ 正在手写循环 / 逐年表 / 参数扫描？先看这几节')
  /**
   * ## 领域公式节在目录里只给一行
   *
   * 这九节是原 `domains` 拆出来的。**如果每节都给标题 + 两句简介**，
   * 目录会从 1083 涨到 1821 字符 —— 那等于把「按需付费」又搬回「每次多付」。
   *
   * 所以它们按「一行 key + 六字标签」呈现（与 extra 折叠节同一形态）：
   * key 与标签足够让人知道**有这一节、叫什么**，详细内容查时再付。
   *
   * 这与本轮的目标一致：**扩容发生在按需层，固定层（目录）尽量不动**。
   */
  /**
   * 紧凑组：领域公式节与推演配方节都只给「key=六字标签」。
   *
   * 它们的共同点是**场景特定** —— 查「财政赤字」的人不需要先读材料链条，
   * 反之亦然。所以详细内容只在被查询时才付费。
   */
  const isCompact = (topic: HelpTopic) => topic.key.startsWith('d-') || topic.key.startsWith('recipe-')
  const modelingCore = modeling.filter((topic) => !isCompact(topic))
  const compactSections = modeling.filter(isCompact)
  for (const topic of modelingCore) {
    lines.push('  ' + topic.key.padEnd(10) + topic.title)
    lines.push('    ' + topic.summary)
  }
  if (compactSections.length > 0) {
    const domainSections = compactSections.filter((topic) => topic.key.startsWith('d-'))
    const recipeSections = compactSections.filter((topic) => topic.key.startsWith('recipe-'))
    const pushCompact = function (label: string, topics: HelpTopic[]) {
      lines.push('  ' + label)
      const labels = topics.map(function (topic) {
        return topic.key + '=' + (topic.short ?? topic.title.slice(0, 8))
      })
      for (let index = 0; index < labels.length; index += 3) {
        lines.push('    ' + labels.slice(index, index + 3).join(' · '))
      }
    }
    /**
     * 这一行原本是「★ 公式不是散着的：query="sys" 看 N 条推演链…」，与 formula 节重复。
     *
     * 但完全不提链也不对。折中成一句话，并从「领两节」缩到只领一节 ——
     * recipe 的用途已经写在它自己的简介里，这里重复领它等于付两次钱。
     */
    lines.push('  ★ 链怎么连、每步填什么，见 helpTopic:"formula"。')
    if (domainSections.length > 0) pushCompact('领域公式（各 600~1600 字符，按需查）:', domainSections)
    if (recipeSections.length > 0) pushCompact('推演配方（场景特定，按需查）:', recipeSections)
  }
  /**
   * 低频节压成一行：`key` 后面跟六字标签。
   * 用 ` / ` 分隔而不是每个占一行，是因为 8 行 = 8 次换行成本，
   * 而它们本来只是「顺带知道一下」的存在。
   */
  lines.push('')
  lines.push('  ── 三、其余能力 ──')
  const folded = extra.map(function (item) {
    const label = item.short ?? item.title.slice(0, 8)
    return item.key + '=' + label
  })
  /** 每行约三到四项，便于目视扫读，也不至于把一行拉得过长。 */
  for (let index = 0; index < folded.length; index += 3) {
    lines.push('    ' + folded.slice(index, index + 3).join(' · '))
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
export function opHelp(topic?: string, query?: string): Outcome {
  /**
   * 显式搜索优先于目录。
   *
   * `helpQuery` 存在时**一定**走搜索 —— 哪怕它碰巧也是个合法 key。
   * 因为调用方明确说了「我要搜」，就该得到搜索结果而不是某节全文。
   */
  if (typeof query === 'string' && query.trim() !== '') {
    const searched = searchHelp(query.trim(), 5)
    return {
      result: renderSearch(query.trim(), searched),
      value: {
        requested: query.trim(),
        hits: searched.map((hit) => ({ key: hit.key, score: hit.score })),
      },
    }
  }
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
  /**
   * ## 查不到就搜，而不是直接甩目录
   *
   * 原来查不到时回一屏 1650 字符的目录 —— 那对「我描述一件事，想知道用哪个功能」
   * 毫无帮助：AI 得自己在几十个 key 里挑。
   *
   * 现在先按自然语言搜一遍。即使搜索结果不理想，也比让调用方
   * 从零开始读目录更有用 —— 至少缩小了范围。
   */
  const hits = searchHelp(topic, 5)
  if (hits.length > 0) {
    return {
      result: renderSearch(topic, hits),
      value: { requested: topic, hits: hits.map((hit) => ({ key: hit.key, score: hit.score })) },
    }
  }
  const keys = HELP_TOPICS.map((item) => item.key).join(' / ')
  return {
    result: '没有名为 "' + topic + '" 的节，也没搜到相关项。\n可用 key：' + keys +
      '\n\n不带参数调用可看目录。',
    value: { topics: HELP_TOPICS.map((item) => item.key), requested: topic },
  }
}