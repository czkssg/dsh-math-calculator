# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 移除

- **UI 全部移除**（2026-10-25，`14f6ed0`）。做了三版（目录树 18 节点 → 精简 10 节点 →
  单页工作台）效果始终不好，决定砍掉：`src/client.ts`（2497 行）、`lib/client.js`
  （138.8 KB）、9 个客户端测试套件、`tsconfig.client.json`、`package.json` 的
  `dsh.client` 与 `exports["./client"]`。**后端 63 个模块一个没动**，能力全部保留，
  只经 `math_execute`（27 种 operation）与 HTTP 路由（`/derive`、`/summary`、
  `/world-params`、`/solve-anchor`、`/workspaces/*`）给 AI。见 `docs/ui-removed.md`。

### 修复

- **`save-world` 的双白名单事故**（最重要）：该路由曾自带一份 14 键硬编码白名单，
  而 `world-params.ts` 的 `WORLD_PARAMS` 有 23 个基础量 —— 于是 `starClass`
  （「我要 G2V 恒星」）、`hasLiquid`、`materialStrength/Density`、`moonCount/Mass/Distance`、
  `lightPollution`、`galaxyBand` 共 9 个键被**静默丢弃**：返回 200 OK，不报错不提示，
  存完世界还是原样。现在白名单只留一个真相（直接遍历 `WORLD_PARAMS`），
  并按 `spec.kind` 分别校验 bool / choice / number。
  `test/ai-journey.mjs` 会逐个试存全部 23 个键来防回归。
- **`npm run preflight` 因 UI 移除而崩溃**：它仍在 `readFileSync('lib/client.js')`，
  文件已删 → `ENOENT`，装机前自检直接非零退出。改为反向断言（客户端产物确实不存在、
  无 `dsh.client`、无 `exports["./client"]`、无 `tsconfig.client.json`），
  与 `test/integration.mjs` 第 5 节互为印证。
- **`tsconfig.json` 仍排除 `src/client.ts`**：文件早不存在，排除项是无用残留，清掉。

### 测试

- 新增 `test/summary.mjs`（37 项），守护 `deriveAll()` 的白名单过滤 —— UI 三版删掉后，
  它是「**派生量绝不入库**」唯一还在运行的实现点。断言：硬塞 `gravity: 99` 被丢弃、
  重力仍按 `G·M/R²` 现算成 19.6 m/s²、垃圾键/空串/null/undefined 一律丢弃、
  基础量与派生量键名不重叠、结论层跟着基础量走、参数元数据表里不许出现派生量。
- 新增 `test/ai-journey.mjs`（58 项），把「作者说一句话 → AI 该走的那条链」复刻成路由调用：
  `world-params` → `solve-anchor` → `save-world` → `summary` → `derive/dead`，
  跑在真派发上（含路由顺序与前缀），断言的终点是**整条链走完世界仍自洽**。
  取代了原来「重启 DSH 人肉看」的验证方式。
- 两个新套件都做过**反向对照**（故意破坏实现确认测试变红），避免装饰性测试。
- 全量基线：**56 套 / 2232 项 → 58 套 / 2327 项**，全绿。

### 文档

- 删除 7 篇只描述已删界面的文档（`ui-simplified.md`、`ui-v3-workbench.md`、
  `ui-feedback-fixes.md`、`ui-implementation-status.md`、`ui-v2-panels.md`、
  `client-ui-architecture.md`、`ui-conventions.md`）。
- 12 篇加了「已作废 / 仍有效」的说明，而不是删掉：`ui-redesign-v3.md`（改题为
  「参数分层与自洽推演」，因为三层结构与四条自洽规则是领域核心）、`ui-design-v2.md`
  （用户原始设计稿）、`adr/0002`（历史决策只追加 superseded）、`README.md`
  （「UI 面板」章改成「AI 调用，没有面板」）、`LIMITS.md`、`code-map.md`、
  `PUBLISHING.md`、`visualization.md`、`constants-and-layering.md`、
  `self-audit-2026-10-24.md`、`implementation-status.md`。

## [2.0.0] — 2026-10-24

首个公开版本。

### 能力

- **计算内核**：BigNumber 64 位高精度求值、符号微积分（求导/积分/化简/展开）、
  解方程与线性系统、矩阵（秩/行列式/迹/奇异值/零空间/逆）、统计与概率分布、
  回归、ODE（RK4）。
- **UI（令牌化）**：左栏「全局管理」与右栏「本工作区工作台」共用同一套宿主设计令牌
  （`--dsw-alias-*` / `--dsw-font-*` / `--dsw-radius-*`），无写死颜色；
  **新建工作区即生成同名数据表**（`<工作区名>.json`，含常数/公式/地点/变量四张子表），
  切换工作区后右栏自动跟随。
- **公式库 342 条**，每条带**三轴标签**：
  `layer`（离最底层规则的远近：基本/数学/导出/经验/工程/约定）、
  `domains`（学科领域，多标签）、`frequency`（**主角视角感知频率**）。
  检索：`freq:` / `layer:` / `domain:` / `symbol:` / `keyword`。
- **两级公式扩展**：全局公式包（`$DSH_HOME/math-calc/formula-packs/global.json`，写盘即生效）
  + 工作区临时公式；新增时校验 id、表达式可解析、**符号必须已定义**（拼错变量当场拒绝）。
- **符号消歧**：同一字母不同含义（`m` = 质量/米）可查 `symbol:m@质量`。
- **常数推演**：无量纲优先（α/μ/α_s/α_G）、尺度阶梯、单位旋钮与物理改动分离、矛盾清单。
- **世界推演**：恒星（质光/寿命/宜居带/α 敏感度）→ 气候 → 天空配色 → 卫星系统 →
  化学窗口与生命硬否决 → 跨模块一致性检查 → 经验系数可信度标注。
- **UI**：左侧入口 = **全局管理**（所有工作区：创建/切换/删除，常数表、公式表、设置）；
  右侧边栏页签 = **本工作区工作台** —— 工作区切换器、本区数据表（常数/公式/地点/变量）、
  **开关**（提示档位、公式启停）、**管理**（变量与地点的增删）。
  左栏切换工作区后右栏**自动跟随**（同一 client bundle 内的订阅 + 宿主 `sidebarRight` store）。

### 工程质量

- 全量 **41 套 / 1716 项**测试；含确定性、真机宿主契约、**对抗性兼容性**（敌意 ctx、
  服务抢占、全局污染、数据损坏）与**客户端注册契约**回归。
- `preflight` 装机前自检：入口契约、客户端席位、运行期依赖、注释覆盖、清单一致性、
  peer 版本可接受性。
- `doccheck` 强制：每个模块有头注释、每条导出有文档注释（321 导出 / 0 缺失）。

### 修复（相对内部早期版本）

- **客户端注册 id 必须等于包名**：此前用 `<包名>-client`，宿主按包名查找不到模块，
  导致桌面端每次启动都报 `import failed` 并致命退出。
- **客户端入口幂等**：宿主会重放 bundle，重复注册会抛错并升级为致命错误。
- **peer 依赖接受 prerelease**：`>=0.1.0 <0.3.0` 不接受 `0.1.7-rc.2`，改为 `>=0.1.0-0 <0.3.0`。
- **工作区切换自动落盘**：此前切到不存在的工作区只产生内存对象，`current` 会指向幽灵工作区。
- 工作区创建兼容 `name` 参数（此前只认 `workspace`，误报「不能是 default」）。
