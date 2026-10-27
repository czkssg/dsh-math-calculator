# 文档索引

按你关心的事分组。**这个插件主体是计算器**，所以计算与工程文档在前，
世界推演的文档集中在最后一组——那部分是附加能力。

---

## 一、计算能力（插件本体）

| 文档 | 讲什么 |
|---|---|
| [formula-authoring.md](formula-authoring.md) | 公式怎么写：字段、三轴标签、符号消歧、校验规则 |
| [custom-constants.md](custom-constants.md) | 自创物理量：定义、量纲校验、与现有物理的关系 |
| [reuse-principle.md](reuse-principle.md) | 复用原则：推演调用公式库，不重复实现计算 |
| [../dsh-math-calculator/FORMULAS.md](../dsh-math-calculator/FORMULAS.md) | 404 条公式的完整目录（自动生成） |
| [../dsh-math-calculator/LIMITS.md](../dsh-math-calculator/LIMITS.md) | 能力边界：哪些支持、哪些做不到（实测档案） |

## 二、插件工程

| 文档 | 讲什么 |
|---|---|
| [architecture.md](architecture.md) | 顶层架构：确定性底座 + AI 开放层，为什么这样分 |
| [code-map.md](code-map.md) | 代码地图：入口、数据流、模块分组、扩展步骤 |
| [dsh-plugin-anatomy.md](dsh-plugin-anatomy.md) | DSH 插件如何生效：五步链路 + 社区实践对照 |
| [compat.md](compat.md) | 兼容性：敌意 ctx、服务抢占、数据损坏、目录共存 |
| [PUBLISHING.md](PUBLISHING.md) | 发布流程：版本号、打包自检、npm 与社区 |
| [adr/](adr/) | 关键设计决策记录 |
| [ai-collaboration.md](ai-collaboration.md) | 插件给结构、AI 给表达的分工边界 |

## 三、数据管理

| 文档 | 讲什么 |
|---|---|
| [workspace-binding.md](workspace-binding.md) | 数据表 ↔ 宿主工作区绑定 |
| [workspace-scope.md](workspace-scope.md) | 数据表跟着会话 cwd 走 |
| [auto-create-workspaces.md](auto-create-workspaces.md) | 工作区自动建表（补建 + 新建即建） |
| [constants-and-layering.md](constants-and-layering.md) | 常数表 / 公式表的分层与重置 |

## 四、世界推演（附加能力）

> 这一组是**可选的**。用不上不影响任何计算功能。

| 文档 | 讲什么 |
|---|---|
| [derivation-stack.md](derivation-stack.md) | 推演栈：P1—P5 分层框架 |
| [pipeline.md](pipeline.md) | 正向推演链路与逐层判定 |
| [back-solve-and-archive.md](back-solve-and-archive.md) | 锚点逆推、七张表持久化、版本记录 |
| [timeline.md](timeline.md) | 时间轴：快慢变量解耦与不可逆临界点 |
| [dead-universe.md](dead-universe.md) | 死寂判定：alive / marginal / dead / invalid 四档 |
| [ecosystem.md](ecosystem.md) | 生态金字塔与承载力（含「3400 亿人」事故复盘） |
| [civilization.md](civilization.md) | 宏观文明：能量、材料、交通、技术树极限 |
| [observer.md](observer.md) | 观测者视角：人择选择效应与体感重算 |
| [fantasy-layer.md](fantasy-layer.md) | 幻想层：算清等价现实量，只提醒不反驳 |
| [whitepaper.md](whitepaper.md) | 白皮书与 Prompt 投射 |
| [provenance-and-cost.md](provenance-and-cost.md) | 因果溯源与算力预警 |
| [ui-redesign-v3.md](ui-redesign-v3.md) | 参数分层与自洽推演（**领域核心**：哪些量能改、哪些只能算） |

## 五、历史归档

早期设计与自检记录。保留是为了记住当初为什么这样定，**不要照它们干活**。

| 文档 | 状态 |
|---|---|
| [world-simulator-design.md](world-simulator-design.md) | 早期方案原文 |
| [ui-design-v2.md](ui-design-v2.md) | UI 已移除；数据模型仍有效 |
| [visualization.md](visualization.md) | 界面已删；布局算法与分级结论仍有效 |
| [implementation-status.md](implementation-status.md) | 逐项对照，「待在 UI 层做」的项已作废 |
| [self-audit-2026-10-24.md](self-audit-2026-10-24.md) | 自检报告；要求 1、2 仍有效 |
| [tryout-checklist.md](tryout-checklist.md) | 试用清单 |

---

## 关于「没有界面」

本插件 2026-10-25 移除了全部前端。原因与现状见
[../dsh-math-calculator/docs/ui-removed.md](../dsh-math-calculator/docs/ui-removed.md)。
所有能力经 `math_execute` 工具与 HTTP 路由提供。
