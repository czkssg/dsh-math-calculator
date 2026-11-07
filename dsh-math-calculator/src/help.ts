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
const ALGEBRA_BODY = (): string => `【代数与微积分】
  solve        解方程。多方程用逗号分隔 = 方程组
               3x + 2y = 10, x - y = 1   → x=2.4, y=1.4
               x^2 - 5x + 6 = 0          → x=2, x=3
               退化方程组会说「无穷多解」，不静默给单解
  system       显式线性系统（matrix + vector）
  derivative   符号求导，variable 指定自变量（默认 x）
  integral     符号积分；可给 from/to 做定积分
               ★ 定积分用 Fraction 引擎代入，不出 8.9999… 这类尾差
  simplify     化简（含三角恒等式）
  expand       展开
  roots        多项式求根（含复数根）

【扩展函数】rank(A) 秩 / nullspace(A) 零空间 / svd(A) 奇异值
  factorize(n) 整数分解 / nsolve("表达式", 初值) 数值求根`

/** 【线性代数】矩阵与特征值。 */
const LINALG_BODY = (): string => `【线性代数】
  matrix       矩阵乘法/求逆/行列式/转置/迹
               只给 matrix 不给其它参数时，输出完整画像：
               秩 / 行列式 / 迹 / 奇异值 / 零空间 / 逆
  eigen        特征值与特征向量（复数特征值也支持）
  例：{operation:"matrix", matrix:[[1,2],[3,4]]}`

/** 【统计与概率】描述统计/分布/回归。 */
const STATS_BODY = (): string => `【统计与概率】
  stats        描述统计：均值/中位数/众数/方差/标准差/分位数/偏度/峰度
               例：{operation:"stats", data:[1,2,3,4]}
  dist         概率分布。distribution 选型，params 给参数，x 给求值点：
               normal[均值,标准差] / binomial[n,p] / poisson[lambda]
               exponential[lambda] / chisquare[df] / t[df]
               normalinv 给分位数求对应值 / quantile 求分位数
  regression   线性与多项式回归，degree 指定次数（默认 1），给 R²`

/** 【微分方程】ODE 数值解。 */
const ODE_BODY = (): string => `【微分方程】ode 数值求解（RK4）
  一阶方程组（SIR / 捕食模型）、二阶方程自动降阶
  返回轨迹、终点值、极值、发散警告
  参数：from(起点,默认0) / to(终点,默认10) / steps(RK4 步数,默认1000)
        samples(返回采样点数,默认24) / initial(初值对象)
  例：{operation:"ode", expression:"a=k1*S*I-k2*I", initial:{S:999,I:1,R:0}}
  ★ 二阶方程降阶后可能需要辅助变量（y_d 表示 dy/dt），缺了会提示补哪个`

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
 * 各节注册表。**顺序即目录顺序**，而顺序决定「AI 会不会翻到它」。
 *
 * 排前面的是高频或高风险节：`evaluate` 最常用、`world` 体量最大。
 * `recipe` 放最后是因为它是跨节组合，读它之前一般已经读了几节。
 */
export const HELP_TOPICS: HelpTopic[] = [
  {
    key: 'evaluate',
    title: '求值与代数（evaluate / solve / 微积分）',
    summary: '算一条表达式、解方程、求导积分化简。物理量请带单位写，量纲错误会被当场拦下。',
    aliases: ['算式', '计算', '求值', '求解', '方程', '积分', '求导', 'mathjs', 'algebra'],
    body: () => EVALUATE_BODY() + '\n\n' + ALGEBRA_BODY(),
  },
  {
    key: 'linalg',
    title: '线性代数（matrix / eigen）',
    summary: '矩阵乘法求逆行列式、特征值。只给 matrix 时输出秩/行列式/奇异值/零空间/逆的完整画像。',
    aliases: ['矩阵', '行列式', '特征值', 'matrix', 'eigen', '线性'],
    body: LINALG_BODY,
  },
  {
    key: 'stats',
    title: '统计与概率（stats / dist / regression）',
    summary: '描述统计、八种概率分布（给 CDF/PDF/分位数）、线性与多项式回归。',
    aliases: ['统计', '概率', '分布', '回归', '方差', 'standard deviation'],
    body: STATS_BODY,
  },
  {
    key: 'ode',
    title: '微分方程（ode）',
    summary: 'RK4 数值解一阶方程组与二阶方程，返回轨迹/终点值/极值/发散警告。',
    aliases: ['微分方程', 'ode', '传染病', '捕食模型', 'rk4'],
    body: ODE_BODY,
  },
  {
    key: 'formula',
    title: '公式库（formula / formulas / formula-table）',
    summary: '调用 442 条自然科学公式并用 overrides 改造任意参数（架空世界的关键），以及按层级/领域/频率检索。',
    aliases: ['公式', 'formula', '检索', 'overrides', '覆盖参数'],
    body: FORMULA_BODY,
  },
  {
    key: 'units',
    title: '单位换算与输出单位策略（units）',
    summary: '中外古今单位换算、自定义单位覆盖，以及输出时为什么是大数配吨/公里而不是 Tg/Tm。',
    aliases: ['单位', '换算', '里', '丈', '斤', '亩', 'unit', 'conversion'],
    body: UNITS_BODY,
  },
  {
    key: 'world',
    title: '世界观推演（world / 地形 / 气候）',
    summary: '给星球参数得一张体感画像：重力昼夜季节气候、天空配色、恒星寿命、卫星、化学窗口、生命闸门。★ 完整字段表在这里。',
    aliases: ['星球', '世界', '重力', '气候', '恒星', '地形', 'world', 'planet'],
    body: WORLD_BODY,
  },
  {
    key: 'constants',
    title: '常数推演（constants / quantities / impact）',
    summary: '改光速/引力常数等基础旋钮，派生量自动重算并评估世界偏离度；看哪些物理量该跟着变。',
    aliases: ['常数', '物理常数', '光速', '引力常数', '推翻物理', 'constants'],
    body: CONSTANTS_BODY,
  },
  {
    key: 'balance',
    title: '收支盘点与天体目录（balance / bodies / feasibility）',
    summary: '粮水能地财政军费信息多项一起看给最短板；以及天体目录、类型学、改常数后哪些天体数据要重算。',
    aliases: ['收支', '盘点', '养得起', '经济', '天体', '火星', 'balance', 'bodies'],
    body: BALANCE_BODY,
  },
  {
    key: 'derivation',
    title: '推演栈（derivation 的 29 个子命令）',
    summary: '八层推演栈、混沌拦截、结论翻转判定、逆推校准、敏感度、相图、白皮书、算力预算、幻想层、文明极限。',
    aliases: ['推演', 'derivation', '混沌', '白皮书', '相图', '敏感度', '算力'],
    body: DERIVATION_BODY,
  },
  {
    key: 'workspace',
    title: '数据管理（workspace）',
    summary: '工作区（一个世界观一套常数/公式/地点/变量）、命名变量跨调用复用、显示精度固化。',
    aliases: ['工作区', '变量', 'workspace', '切换', '保存'],
    body: WORKSPACE_BODY,
  },
  {
    key: 'recipe',
    title: '常见配方（锚点/账本闭合/多步链/错误码）',
    summary: '跨节组合用法：sanity 锚点让工具比对你自己给的判据、账本闭合配方、多步链、以及错误码对照表。',
    aliases: ['锚点', 'sanity', '账本', '闭合', '多步', '错误', '配方', 'recipe'],
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
 * 目录层：各节 key + 简介 + 别名。
 *
 * ## 为什么不列每节的内部细节
 *
 * 目录的职责只有一个：让 AI 判断「要不要查这一节」。
 * 所以给 key（可操作）、title（人话）、summary（这节解决什么问题）、
 * aliases（AI 用直觉词也能查到）。不放具体参数 —— 那是正文的事。
 */
function renderIndex(): string {
  const lines: string[] = [
    '══════ math_execute 能力目录（' + HELP_TOPICS.length + ' 节）══════',
    '',
    '用 helpTopic 取任一节的详细说明，不带则回到本目录。',
    '（例：{operation:"help", helpTopic:"world"} → world 的完整字段表）',
    '',
  ]
  for (const topic of HELP_TOPICS) {
    lines.push('  ' + topic.key.padEnd(11) + topic.title)
    lines.push('    ' + topic.summary)
    if (topic.aliases && topic.aliases.length > 0) {
      lines.push('    也可写: ' + topic.aliases.slice(0, 5).join(' / '))
    }
  }
  lines.push('')
  lines.push('★ 最常用的一条：物理量带单位写（(10 hp/0.475) to kW、5 cm to inch），')
  lines.push('  带单位时量纲错误会被当场拦下；裸数字无从判断 745.7 是瓦还是千瓦。')
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
