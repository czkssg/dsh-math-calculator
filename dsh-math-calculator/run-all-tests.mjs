/**
 * 统一测试入口：一次跑完全部测试套件。
 *
 * 为什么需要这个：
 *   之前是逐个 `node test/xxx.mjs`，容易漏掉、也不好判断整体状态。
 *   这个脚本给出一张总表，任何一套失败就非零退出。
 *
 * 每套测试用**独立的临时目录**（DSH_MATH_CALC_HOME），
 * 避免工作区数据在测试之间串味 —— 这是之前踩过的坑：
 * constants 测试曾经因为 formula-table 测试留下的覆盖而失败。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

/**
 * 测试清单：文件、期望的通过数（用于发现静默减少）、描述。
 *
 * ⚠️ 新增真测试**必须**进这张表，否则「全绿」不代表覆盖 ——
 * host-contract.mjs 就是这么漏掉的：它专门防「真宿主装不起来」，
 * 却不在清单里，于是 1008 项全绿照样漏掉了两次真机事故。
 *
 * 以下三个**故意不进来**（不是漏了）：
 *   formulas-list.mjs —— 生成 FORMULAS.md 的导出脚本，无断言
 *   limits.mjs        —— 生成 LIMITS.md 的采集脚本，无断言
 *   worldbuilding.mjs —— 手工压测探针，只打印结果
 */
const SUITES = [
  { file: 'run.mjs', expect: 66, label: '主功能（契约/运算/作用域）' },
  { file: 'formulas.mjs', expect: 35, label: '公式库' },
  // 每条公式一项，公式总数变化时同步（404 → 442，新增电/光/核/化学计量 38 条）
  { file: 'formulas-all.mjs', expect: 665, label: '全部公式可求值' },
  { file: 'formulas-sanity.mjs', expect: 15, label: '常识值反算' },
  { file: 'constants.mjs', expect: 51, label: '物理常数耦合' },
  { file: 'constants-core.mjs', expect: 40, label: '无量纲常数与尺度阶梯' },
  { file: 'scale-world.mjs', expect: 17, label: '常数传导到星球模型（S2）' },
  { file: 'provenance.mjs', expect: 17, label: '模型出处与可信度（S2.5）' },
  { file: 'stellar.mjs', expect: 37, label: '恒星结构与常数敏感度（S3）' },
  { file: 'life.mjs', expect: 25, label: '化学窗口与生命硬否决' },
  { file: 'determinism.mjs', expect: 18, label: '确定性（同输入同输出）' },
  { file: 'numeric.mjs', expect: 29, label: '基础运算扩展（秩/零空间/奇异值/分解/求根）' },
  { file: 'integration-checks.mjs', expect: 24, label: '跨模块一致性（后端整合）' },
  { file: 'api.mjs', expect: 102, label: 'UI 后端 API（绑定/sync/自动建表/SI常数/重置/心跳）' },
  { file: 'workspace-scope.mjs', expect: 20, label: '工作区作用域（数据表跟着会话 cwd 走）' },
  { file: 'derivation.mjs', expect: 58, label: '推演栈（八层/接口卡/无量纲/单位陷阱/敏感性/相图）' },
  { file: 'pipeline.mjs', expect: 21, label: '正向推演链路（world → P1—P5 逐层判定）' },
  { file: 'reuse.mjs', expect: 18, label: '复用性守卫（推演复用公式库与常数表，不重复实现）' },
  { file: 'custom.mjs', expect: 28, label: '自创常数（量纲校验/派生求解/安全求值/量纲检查）' },
  { file: 'anchor.mjs', expect: 30, label: '逆推校准 + 七张表持久化 + 版本对比' },
  { file: 'fantasy.mjs', expect: 36, label: '幻想层（叠加/等价现实量/只提醒不反驳）' },
  { file: 'universe-ops.mjs', expect: 26, label: '补丁（混沌拦截/数据表继承/A-B对比）' },
  { file: 'civilization.mjs', expect: 30, label: '目录4 宏观文明（能量/材料/交通/技术树）' },
  { file: 'dead-universe.mjs', expect: 26, label: '补丁6 死寂态兜底（判定+结语+挽救方向）' },
  { file: 'observer.mjs', expect: 25, label: '补丁7 观测者物理过滤（人择选择效应）' },
  { file: 'ai-brief.mjs', expect: 31, label: 'AI 协作提示（分工/不穷举/结语交给 AI）' },
  { file: 'playbook.mjs', expect: 44, label: '推演指令集（底座清单/AI职责/判据/动态定制）' },
  { file: 'ecosystem.mjs', expect: 35, label: '目录3.2 生态金字塔 + playbook 可配置化' },
  { file: 'timeline.mjs', expect: 34, label: '补丁1/11 时间轴（快慢解耦+临界点+路径锁定）' },
  { file: 'whitepaper.mjs', expect: 35, label: '补丁8 白皮书 + Prompt 投射' },
  { file: 'provenance-cost.mjs', expect: 43, label: '补丁4/5 因果溯源 + 算力预警' },
  { file: 'advanced.mjs', expect: 30, label: '收尾补齐（复数根/扩展函数/help/世界字段）' },
  { file: 'formula-ext.mjs', expect: 29, label: '公式库扩展与符号消歧' },
  { file: 'formula-story.mjs', expect: 42, label: '读者视角高频公式（第 4 批）' },
  { file: 'formula-story2.mjs', expect: 29, label: '读者视角高频公式（第 5 批：建筑/攻城/农业/医药）' },
  { file: 'taxonomy.mjs', expect: 35, label: '公式三轴标签（层级/领域/频率）' },
  // 兼容性：模拟「别的插件可以任意编程」的敌意环境。
  // 这两套专门防「装上了但被别人的插件搞挂」——和 host-contract 一样属于真机防线。
  { file: 'compat.mjs', expect: 29, label: '兼容性：敌意 ctx / 服务抢占 / 全局污染' },
  { file: 'compat-data.mjs', expect: 13, label: '兼容性：数据损坏 / 并发 / 目录共存' },
  // 真机崩溃回归：桌面宿主会重复执行 client bundle，重复注册必须是无害的 no-op。
  // 这条来自 2026-10-24 的崩溃日志：duplicate factory registration → 桌面端退出。
  { file: 'consequences.mjs', expect: 61, label: '长链后果' },
  { file: 'impact.mjs', expect: 42, label: '全公式影响评估' },
  { file: 'quantities.mjs', expect: 42, label: '物理量分类与缩放' },
  { file: 'formula-table.mjs', expect: 33, label: '工作区公式表' },
  { file: 'feasibility.mjs', expect: 40, label: '设定一致性校验' },
  { file: 'awareness.mjs', expect: 68, label: '模型感知（提示注入）' },
  { file: 'detector.mjs', expect: 38, label: '计算需求检测器' },
  { file: 'hook.mjs', expect: 25, label: 'agent/pre-step 钩子' },
  { file: 'terrain.mjs', expect: 30, label: '局地地形气候' },
  { file: 'world.mjs', expect: 32, label: '星球体貌画像' },
  { file: 'ode.mjs', expect: 34, label: '微分方程求解' },
  { file: 'workspace.mjs', expect: 38, label: '工作区隔离' },
  { file: 'cleanup.mjs', expect: 35, label: '删除与清理' },
  { file: 'climate.mjs', expect: 48, label: '分层气候（辐照/季节/纬度）' },
  // 新增守卫：产出字段（notice / cached）必须已在 output.schema 声明。
  // 宿主用 additionalProperties:false 校验，漏声明会让工具**整次调用失败** ——
  // 实测踩过（2.1.0 就是这样坏的），而当时单元测试全绿（它们绕过宿主校验）。
  { file: 'integration.mjs', expect: 46, label: '整合验收（整体装配/输出字段声明）' },
  { file: 'sky.mjs', expect: 43, label: '天空与星空（观测者视角）' },
  { file: 'moons.mjs', expect: 32, label: '多卫星系统（稳定性/观感）' },
  // 这一套专门防「插件在真宿主里装不起来」：桩忠实度 + 路由形状 + 派发行为。
  // 它曾经不在清单里，于是 1008 项全绿也照样漏掉了两次真机事故。
  { file: 'host-contract.mjs', expect: 32, label: '宿主契约回归（真机契约）' },
  // UI 三版删掉后，deriveAll 的白名单过滤成了「派生量绝不入库」的唯一实现点，
  // 守护它的 test/ui-v3.mjs 也随界面一起没了 —— 这里补回来。
  { file: 'summary.mjs', expect: 37, label: '综合推演（派生量绝不入库）' },
  // 交接文档把「验证 AI 全链路」列为未完成事项，但原方式是重启 DSH 人肉看。
  // 这一套把 solve-anchor → save-world → summary → dead 这条链复刻成路由调用，
  // 跑在真派发上（含路由顺序与前缀），进回归。
  { file: 'ai-journey.mjs', expect: 58, label: 'AI 全链路（锚点反解→入库→重算→判定）' },
  // world-params 里的 range 曾经是纯装饰（22 处声明无人读取），
  // 于是 planetRadius=0 能存进去并算出 Infinity。这一套守着校验三档。
  { file: 'validation.mjs', expect: 82, label: '参数校验（硬边界/软警告/类型严格）' },
  // L1 只在写入时拦；历史存档、/summary 直传仍可能带坏值。
  // 这一套守着「Infinity 绝不流到 AI」与 invalid 判定档。
  { file: 'sanity.mjs', expect: 34, label: '物理量健全性（invalid 判定/不泄 Infinity）' },
  // WorldForge-Q 方案里**方向对且我们确实缺**的几块，已按本插件取向实现：
  //   · 单位换算：此前只有量纲分析，作者写「三丈」时无人换算
  //   · 收支盘点：此前只有单项上限，答不了「这个王国养不养得起这支军队」
  //   · 势力运行公式：EROI/技术扩散/粮食/财政/信息，原库 342 条里都没有
  //   · 结论翻转：数值变了 ≠ 结论翻了，这两件事必须分开判
  // 单位表扩到近三百条后，第 6 节从「全量展开」改为「摘要 + 按量纲展开」，断言增至 60。
  { file: 'units.mjs', expect: 60, label: '单位换算（中外古今 287 条/公制中转/自定义）' },
  { file: 'balance.mjs', expect: 55, label: '收支盘点与最短板（粮水能财政军费信息）' },
  { file: 'power-formulas.mjs', expect: 115, label: '势力运行公式（EROI/扩散/粮食/财政/信息）' },
  { file: 'flip.mjs', expect: 64, label: '结论翻转判定（数值变了≠结论翻了）' },
  // 第七批：通用计算基础件（金融/几何/化学/电学/工程）+ 检索可达性。
  // 「房贷月供」「余弦定理」「容抗」这类日常问题此前在 355 条里无解。
  { file: 'basic-formulas.mjs', expect: 101, label: '通用计算公式（金融/几何/化学/电学/工程）' },
  // 上面那些验「算得对不对」；这一套验「作者拿去能不能用」：
  // 输出里不许让 AI 去找已删的界面、不许有 Infinity/NaN、必须带单位与可信度标签、
  // 措辞不许反驳作者设定，并且一个场景从头推到尾要前后自洽。
  // 子命令报错提示曾硬编码只列 21 个（实现有 29 个），漏掉的 8 个「存在但不可发现」。
  { file: 'derivation-subcommands.mjs', expect: 84, label: '推演子命令完整性（清单↔实现一致）' },
  // 分析型 operation 里的无穷是结论（不可预测/无解），不该报错；数值型仍然要报。
  { file: 'non-finite.mjs', expect: 30, label: '非有限策略（分析型给结论/数值型报错）' },
  { file: 'real-usage.mjs', expect: 105, label: '实际使用验收（作者视角的完整场景）' },
  // 恒星目录只有主序星，且默认是太阳。这两件事以前都是静默发生的：
  // 传 'F5III'（巨星）会回退成 G2V，提示压在 150 行之后 —— 结论可能从「冰封」翻成「熔融」。
  { file: 'star-assumptions.mjs', expect: 32, label: '恒星假设显式声明（不静默替换成太阳）' },
  // 天体目录 + 常数传导：改 alpha/G/c 之后，哪些量要重算、哪些绝不能动。
  // 最要紧的是分清「间接依赖」（平衡温度，要重跑）与「严格不动」（行星质量）。
  { file: 'bodies.mjs', expect: 53, label: '天体目录与常数传导（哪些该变/哪些绝不该动）' },
  // 面向宇宙科幻创作的类型学：32 类，含理论预言（中子星/黑洞）与纯思辨（戴森球）。
  // 核心是证据分级——「中子星重力 1e11 g」是物理必然，「戴森球厚 1 公里」只是拍脑袋。
  { file: 'body-taxonomy.mjs', expect: 186, label: '天体类型学（已观测/理论预言/纯思辨分级）' },
  // 经验公式拆解：把烘焙进系数的常数剥出来（船的 1.34 里藏着 g=9.81、宜居带 1.1
  // 是地球温室阈值），并分清「可泛化 / 无量纲通用 / 纯拟合不可泛化」。
  // 三级标注：无量纲通用 / 形式可泛化但系数需重验 / 仅地球成立。
  // 关键：hull_speed 的 Fr≈0.4 实测 ≈ 1/√(2π)，有物理内核；但数值仍依赖「类水液体」，
  // 所以不能标成无量纲通用——那等于宣称 0.4 换世界也精确成立。
  { file: 'empirical-generic.mjs', expect: 63, label: '经验式拆解（底层原理与三级适用域）' },
  // 显示精度与计算精度分离：AI 定一次位数即可全局变短，读起来省 token。
  // 核心不变量：降低显示精度**绝不改变计算结果**（(10^20+1)-(10^20) 永远是 1），
  // 且整数永不截断（10^20+5、50! 一位不少）。
  // 语义是「小数点后几位」（默认 8）；提示走 notice 字段，不进 result。
  // 精度说明从 playbook 挪进注入正文后，多了一条「语义是小数点后几位」的断言。
  { file: 'display-precision.mjs', expect: 52, label: '显示精度（小数点后几位/可固化/不改计算）' },
  // 精度不足时提醒：判据是**相对误差**超过万分之一，不是绝对小数位数。
  // 大数用 8 位小数相对误差 1e-14（不用提醒），小数值才真失真（要提醒）。
  { file: 'precision-loss.mjs', expect: 35, label: '精度不足提醒（相对误差判据）' },
  // 未定义单字母不得被当成单位（静默错误）。实测反馈称「只能改一件事就改这条」。
  { file: 'bare-unit-symbols.mjs', expect: 55, label: '单字母标识符（变量 vs 单位，防静默错算）' },
  // 语法糖（** / ln / π / × / ÷）与定积分（含有理数精确代入）。
  { file: 'syntax-and-integral.mjs', expect: 41, label: '语法糖与定积分（直觉写法可用/参数不静默忽略）' },
  // overrides 里拼错的 key 必须点名（实测：曾导致「236 倍缺口」误判且看不出来）。
  { file: 'overrides-unknown-keys.mjs', expect: 12, label: '未知参数名上报（错拼不静默忽略）' },
  // 批量 label（结果可认）与 terse（省输出但绝不隐藏失败）。
  { file: 'batch-label-terse.mjs', expect: 22, label: '批量 label 与 terse（可认/省 token/不藏失败）' },
  // 本轮：三份实测文档评审后补的三条守卫 + 单位英制别名。
  // 共同点都是「调用方以为生效了、其实没有」这类静默问题。
  { file: 'arg-guard.mjs', expect: 42, label: '参数不静默/显示精度0/括号定位/英制单位' },
  // 工作区命名变量：默认关闭（不削弱同输入同输出），显式打开后参与计算。
  // 最要紧的是第 3 节——改变量后缓存必须失效，否则会静默返回改之前的数。
  { file: 'workspace-variables.mjs', expect: 19, label: '工作区命名变量（默认关/缓存失效/参数优先）' },
  // 2026-11-06 第二份实测反馈：中文量级词（万/亿/万亿）、数字数组容错、
  // 非法变量键不中止、语法错子类型、SI 前缀中文参照、大数千万分位。
  { file: 'report-1106b.mjs', expect: 45, label: '实测报告 1106b（中文量级词/容错/语法分类/可读性/说明注释）' },
  // 1107 报告：单条与批量的非有限判断一致、显式换算不被归位吞掉、to 报错分类、两套单位表打通
  { file: 'report-1107.mjs', expect: 63, label: '实测报告 1107（非有限一致/换算不被吞/to 报错分类/工程单位）' },
  // 分节帮助：目录小、单节小、目录可发现、内容没因拆而丢
  { file: 'help-topics.mjs', expect: 101, label: '分节帮助（目录/按节取用/别名容错/内容完整/描述指引）' },
  // 公式与单位耦合：符号带单位运算、参数量纲校验、同体系折算
  { file: 'formula-units.mjs', expect: 35, label: '公式单位耦合（符号带单位/参数量纲校验/同体系折算）' },
  // 工程/生物/宏观公式：数值手算核对 + scaling 律（四次方/三次方/十分之一）
  // 1108 报告：只收复核确认的真缺陷，含两条误判的「正确用法」钉死
  { file: 'report-1108.mjs', expect: 41, label: '实测报告 1108（formula 单位/terse/Math 提示/复合单位/精度提示）' },
  { file: 'engineering-formulas.mjs', expect: 30, label: '工程与生物经济公式（手算核对/scaling 律/单位与标签完整）' },
  // 多步计算的两条静默不变量：批量内按序可见 + 失败步骤的下游不能变「虚成功」。
  // 后者是本轮实测发现的真缺陷：d=b*2 曾静默算成「2 b（单位）」并显示为成功。
  { file: 'multistep.mjs', expect: 27, label: '多步计算（链式可见/失败不虚成功/单位顺序）' },
  // 注入提示词是每轮都付费的固定成本。这套守「字数按频率分配」：
  // 高频的选择指引最长、低频的世界推演压到极短、不许同时写两条矛盾的精度说明。
  { file: 'prompt-budget.mjs', expect: 23, label: '注入提示词（按频率分字数/不罗列全清单/无矛盾）' },
  // 中外古单位：日本尺贯法、中国历代、俄德法西荷等列强传统单位。
  // 这些数值**无法靠直觉判断对错**，所以每条断言都用独立手算的期望值；
  // 第 9 节守「扩充最容易埋的雷」——重名与重别名。
  { file: 'world-units.mjs', expect: 106, label: '中外古单位（日本/中国历代/欧洲列强/公制中转/度量衡与科学分类）' },
  // 电学/光学/化学/核物理：补齐 18 个新量纲（原来只有 4 个 SI 基本单位，这些领域无法换算）。
  // 第 3 节守 rad 撞名、第 4 节守欧姆两个 Unicode 码位 —— 这两处最容易静默出错。
  { file: 'si-units.mjs', expect: 97, label: 'SI 电学/光学/化学/核物理（32 量纲/rad 不撞名/双码位）' },
  // 公式库补齐：原空白 8 个量纲（磁通密度/立体角/照度/活度/剂量/催化活度…）现在都有公式产出。
  // 第 6 节守「公式表达式不许用 ln」——公式库不经 evaluate 的归一化层，用 ln 会全部报错。
  { file: 'em-formulas.mjs', expect: 43, label: '电/光/核/化学计量公式（38 条/量纲全覆盖/不许用 ln）' },
  // 第十三批：宏观/财政/材料/生物通用 28 条 + 索引漏登修复
  // 工艺级工程公式 14 条 + precision/label 两处护栏修复
  // 公式体系（18 条推演链 + 28 个跨链接点）
  // 材料成品性能三条（烧结/淬火/炉膛效率）
  // 化工单元（蒸馏/结晶）+ 坯体收缩 + 误差传播
  // 土壤养分平衡 + 投资回本期（M1 通用化）
  { file: 'process-soil.mjs', expect: 26, label: '土壤养分与投资回本（A4/M1 通用化）' },
  // 反馈 A9：取用率上限是「增量」不是「存量」（MSY=rK/4）。
  // 核心断言是 MSY 与 N=K/2 处增长率内部一致 —— 4 写成 2 立刻红。
  { file: 'ecology-msy.mjs', expect: 31, label: '逻辑斯谛增长与最大可持续猎获（A9/MSY）' },
  // 反馈 A6/A10/P12：补「总产 → 能吃的」与「单件精度 → 装配精度」两段空白。
  // 核心断言：指数衰减不能写成线性（线性式 50 年后为负）；均方根叠加仅在误差独立时成立。
  { file: 'storage-drying-tolerance.mjs', expect: 45, label: '储备损耗/干燥时间/公差叠加（A6/A10/P12）' },
  // 冷战—千禧年学科扩充（一、二）：控制论/信息论/信号处理 + 运筹/博弈/可靠性。
  // 最重的两条断言：ρ/(1−ρ) 的悬崖（负载+5.6% 等待×2.1）、假阳性压倒真阳性（1% 发病率 → 后验 8.3%）。
  { file: 'coldwar-cybernetics-or.mjs', expect: 87, label: '控制论/信息论/运筹/博弈（31 条）' },
  // 现代物理基础（三）：量子/统计/固体/半导体/核 16 条。
  // 断言重点不是数值而是**标度律方向**：T⁴ 是 16 倍、λ∝1/T、费米能 ∝n^(2/3)、比热 ∝T³。
  { file: 'coldwar-modern-physics.mjs', expect: 52, label: '现代物理基础（量子/固体/核 16 条）' },
  // 社科（四）：人口转变/网络科学/组织/城市标度/不平等 13 条。
  // 断言三层：边界值、单调性、内部一致性。并强制每条声明「统计 vs 因果」的界线。
  { file: 'coldwar-social-science.mjs', expect: 50, label: '社科（人口/网络/组织/城市 13 条）' },
  // 分布矩与可靠性（五）：Weibull/对数正态/泊松/二项/卡方/变异系数 11 条。
  // 核心断言：Weibull 的 k 必须真的改变失效率方向（k<1 递减 / k=1 恒定 / k>1 递增）。
  { file: 'distribution-reliability.mjs', expect: 42, label: '分布矩与可靠性（Weibull/对数正态 11 条）' },
  // 热机循环（六）：Rankine/Otto/Diesel/Brayton/联合循环/制冷/蓄热 11 条。
  // 核心断言是**结构性质**：Otto 里没有温度项、Rankine 里没有压缩比 → 两条技术树不同源。
  { file: 'heat-engines.mjs', expect: 40, label: '热机循环与制冷（Rankine/Otto/COP 11 条）' },
  // 流体与气动（七）：伯努利/阻力/升力/失速/边界层/马赫角/波阻 13 条。
  // 核心断言：**压差阻力 ∝v² 与粘性阻力 ∝v 是两种机制**，混用会得出「越快越省力」。
  { file: 'fluid-dynamics.mjs', expect: 40, label: '流体与气动（升力/阻力/失速/激波 13 条）' },
  // 化学工程（八）：反应器/精馏/萃取/吸附/传质/干燥/结晶/放大困境 11 条。
  // 核心断言：放大困境（放热 ∝L³ 而面积 ∝L²）与 CSTR 返混代价。
  { file: 'chemical-engineering.mjs', expect: 46, label: '化学工程放大（反应器/精馏/萃取 11 条）' },
  // 复合路径（compounds）：跨多条链的现成路线。
  // 核心断言：**不许登记假路径** —— 每一跳都要回到 FORMULA_SYSTEMS 现查证据；
  // 并构造一条假路径做反向对照，防止 traceCompound 永远返回 ok。
  { file: 'compound-paths.mjs', expect: 34, label: '复合路径（跨链路线/不许假路径/反向对照）' },
  // 瘟疫/饥荒/营养/生命表（P1+P2）+ recurrence 内置期数变量 n（P0 能力修复）。
  // 最重要的断言：**平均寿命 42 的社会里仍有 23% 活到 60** —— 拆穿「古人活 35 岁」。
  { file: 'famine-disease-lifetable.mjs', expect: 63, label: '瘟疫饥荒生命表（P1+P2 15 条 + recurrence n）' },
  // P3 日常生产 + P4 地质速率 + P5 社会失稳（23 条）。
  // 最重要的断言：社会失稳公式**必须声明「不是预测」**，否则会被当预言用。
  { file: 'craft-geology-instability.mjs', expect: 62, label: '生产/地质/失稳（P3+P4+P5 23 条）' },
  // ★ 耦合守卫：world 与公式库必须算出同一个数。
  // 痛点：world.ts 曾完全不引用公式库（两套独立实现，数字碰巧一致）。
  { file: 'world-formula-consistency.mjs', expect: 28, label: '耦合守卫（world ↔ 公式库逐项对账 + 推导链）' },
  // ★ 函数层对账：core-physics（world 用）与公式库 expr（对外暴露）必须一致。
  { file: 'core-physics-parity.mjs', expect: 25, label: 'core-physics 与公式库 expr 一致性（单一数据源）' },
  // ★ 多步推演规则进提示词：让 AI 按「输出→下一步参数」串调用。
  // 核心：提示词承诺的每个接口（带单位输入、N/kg 等价）必须实测可用，否则是骗 AI。
  { file: 'multistep-prompt.mjs', expect: 23, label: '多步推演提示词（规则 + 承诺可验证）' },
  // ★ 公式库结构不变量：id 唯一 / INDEX 与数组一致 / 字段完整。
  // 重构时发现 4 个 id 在不同文件各定义一次，后者静默覆盖前者。
  { file: 'formula-integrity.mjs', expect: 9, label: '公式库结构不变量（id 唯一/索引一致/字段完整）' },
  { file: 'process-chem.mjs', expect: 28, label: '化工单元与误差传播（蒸馏/结晶/收缩/误差）' },
  { file: 'process-finish.mjs', expect: 26, label: '材料成品性能（烧结致密度/淬火硬度/炉膛效率）' },
  { file: 'formula-systems.mjs', expect: 26, label: '公式体系（18 链/接点无死链/覆盖率）' },
  { file: 'process-formulas.mjs', expect: 53, label: '工艺公式（窑炉/冶金/齿轮/发酵/护栏修复）' },
  { file: 'macro-materials-bio.mjs', expect: 67, label: '第十三批 28 条（宏观恒等式/财政链/材料本构/生物通用）' },
  // 三份实践文档的缺口补齐：马力族单位/批量公式/离散递推/指定采样时点
  { file: 'gap-fills.mjs', expect: 43, label: '实践文档缺口（单位族/批量公式/离散递推/指定采样）' },
  // 防呆层：在数字旁边多放一句「这个数看起来不对劲」。
  // 来自一份 200 余条表达式的实测复盘 —— 最贵的错误不是算错，是算对了却没人觉得不对。
  // 第 4 节守「正确用例零误报」（误报会让整条通道被关掉，比漏报更糟）。
  { file: 'guards.mjs', expect: 23, label: '防呆（量级标注/label 核对/同批比对/正确用例不误报）' },
  // 2026-11-06 实测报告里的真缺陷：批量 ok 契约 / label 误报回归 /
  // 中文单位参与运算 / units 步骤去重与 terse / 英文全称别名 / 元素级未知键。
  { file: 'report-1106.mjs', expect: 64, label: '实测报告 1106（ok 契约/中文单位/units 精简/别名/锚点）' },
  // 工具定义是每轮重复计费的固定成本（基线 7789 字符 ≈ 4868 token/轮）。
  // 瘦身做法是把详细说明挪进 help，不是删参数；同时守住「改常数后缓存必须失效」。
  { file: 'slim-and-cache.mjs', expect: 67, label: 'schema 瘦身与结果缓存（每轮成本/缓存安全）' },
  // 三档分流替代单一阈值：simple 不提醒 / forced 提醒 / fuzzy 按阈值。
  // 关键：`2+2` 得分高但该心算，`20 个数字求和` 得分低但最该用工具——阈值把两者都判反了。
  { file: 'triage.mjs', expect: 50, label: '计算需求三档分流（心算/强制用工具）' },
  // 泛化测试：用**绕开词表**的句子检验（中文数字/工程语境/文学描写陷阱）。
  // 教训：先写的 400 条随机用例全对，但那批是「用词表词生成的」，
  // 只证明了词表覆盖词表。换成绕开词表的句子后真实水平是 5/14。
  { file: 'generalization.mjs', expect: 42, label: '分流泛化（中文数字/工程语境/文学描写不误伤）' },
]

/** 跑一个测试文件，返回 stdout 与退出码。 */
function runSuite(file) {
  return new Promise((resolve) => {
    // 每个套件独立临时目录，避免数据串味
    const home = mkdtempSync(join(tmpdir(), 'dsh-test-'))
    const child = spawn(process.execPath, [join(root, 'test', file)], {
      cwd: root,
      env: { ...process.env, DSH_MATH_CALC_HOME: home },
    })

    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('close', (code) => {
      try {
        rmSync(home, { recursive: true, force: true })
      } catch {
        /* 忽略清理失败 */
      }
      resolve({ code: code ?? 0, output })
    })
  })
}

/** 从输出里提取通过数。 */
function parsePassCount(output) {
  // 「全部通过：66 项」或「通过 39，失败 1」或「✅ 可求值: 270/270」
  let match = output.match(/全部通过：(\d+)\s*项/)
  if (match) return Number(match[1])
  match = output.match(/通过\s+(\d+)，失败\s+(\d+)/)
  if (match) return Number(match[1])
  match = output.match(/可求值:\s*(\d+)\/(\d+)/)
  if (match) return Number(match[1])
  return null
}

/** 从输出里提取失败数。 */
function parseFailCount(output) {
  const match = output.match(/通过\s+(\d+)，失败\s+(\d+)/)
  if (match) return Number(match[2])
  if (/FAIL/.test(output)) return 1
  return 0
}

async function main() {
  console.log('══════════════════════════════════════════════════════════')
  console.log('  dsh-math-calculator 全量测试')
  console.log('══════════════════════════════════════════════════════════')
  console.log('')

  const results = []
  let totalPass = 0
  let totalFail = 0
  let anyFailed = false
  let anyCountMismatch = false

  for (const suite of SUITES) {
    process.stdout.write('  ' + suite.label.padEnd(30) + ' ')
    const result = await runSuite(suite.file)
    const passCount = parsePassCount(result.output)
    const failCount = parseFailCount(result.output)

    const okExit = result.code === 0
    const okCount = passCount === null || passCount === suite.expect

    if (passCount !== null) totalPass += passCount
    totalFail += failCount

    if (okExit && okCount) {
      console.log('✓ ' + (passCount !== null ? passCount + ' 项' : '通过'))
    } else {
      anyFailed = anyFailed || !okExit
      anyCountMismatch = anyCountMismatch || !okCount
      console.log('✗ 失败')
      if (!okExit) {
        console.log('    退出码: ' + result.code)
        // 只打印失败的断言，避免刷屏
        const failLines = result.output
          .split('\n')
          .filter((line) => /FAIL|Error|错误/.test(line))
          .slice(0, 8)
        for (const line of failLines) console.log('    ' + line.trim())
      }
      if (!okCount && passCount !== null) {
        console.log('    通过数不符: 实际 ' + passCount + '，期望 ' + suite.expect)
      }
    }
  }

  console.log('')
  console.log('──────────────────────────────────────────────────────────')
  console.log('  合计: ' + totalPass + ' 项通过' + (totalFail > 0 ? '，' + totalFail + ' 项失败' : ''))
  console.log('  测试套件: ' + SUITES.length + ' 套')
  if (anyCountMismatch) {
    console.log('  ⚠ 有套件的通过数与基线不一致（可能新增或丢失了用例）')
  }
  console.log('──────────────────────────────────────────────────────────')

  if (anyFailed) {
    console.log('')
    console.log('✗ 存在失败项')
    process.exitCode = 1
  } else {
    console.log('')
    console.log('✓ 全部通过')
  }
}

await main()
