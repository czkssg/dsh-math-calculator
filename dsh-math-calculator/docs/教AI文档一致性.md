# 教 AI 用的文档：一致性审计与精修

> 2026-11-18 · 触发：测试员反馈「功能描述与实际功能/声明不一致」。
> 范围：工具描述、系统提示、help、SKILL、参数 schema。

## 一、五份文档各自管什么（避免重复与漂移）

| 文档 | 位置 | 读者 | 职责 | 更新时机 |
|---|---|---|---|---|
| 工具描述 | `src/awareness.ts` | 模型每轮看工具清单 | 定位、触发、单位策略、批量、help 两步、精度 | 改能力/口径时 |
| 系统提示 | `src/awareness.ts`（brief）+ `playbook.ts` | 每轮注入 | 行为约束、选 op、可信度标签、推演分工 | 改工作流时 |
| help | `src/data/help.json` | 模型按需查 | 每节字段表、示例、边界（63 节） | 改参数/行为时 |
| SKILL | `skills/world-deduction/SKILL.md` | 技能加载时 | 能力速查、工作流、误用、边界 | 改能力时 |
| schema | `src/tool.ts` | 宿主校验 | 参数类型与一行说明 | 加参数时 |

## 二、本次审计抓到的六类不一致

1. **数字各写各的**：playbook 写「公式 342 条」（实际 805）；SKILL/工具描述的 help 节数滞后。
2. **声明了但不可用**：门面里列了 `sanity`（其实是 evaluate 的条目参数）、`alert`（从未实现）、
   `catalog/explain/invariants/examples`（是 help 的能力）——门面放行后落到 internal。
3. **operation 查不到**：22 个 operation 在 help 里既无节也搜不到（chain/threshold/scaling/anchor、
   units_audit、timeline_check、derivative/integral/simplify/expand/roots/system、custom、
   formula-table、data、optimize、simulate、crosscheck、world-build、world-map、document、auto）。
4. **管道串**：SKILL 14 处 `action:"model|route|…"`、help 若干 `save|load|…`——AI 照抄整串必然失败。
5. **拼写/参数名**：astro 节 `precison`（应 precision）。
6. **示例不可运行**：help 的示例此前未系统验证（本次 9 个 operation 片段全部实测通过）。

## 三、修法

| 类 | 处理 |
|---|---|
| 数字 | playbook 改为**动态读** formulas.json；SKILL/工具描述节数同步 63；测试守护数字一致 |
| 门面 | 只保留真实 operation；help facade 节说明 sanity 是参数、catalog 等是 help 能力 |
| 覆盖 | 新增 6 节（chain/data/document/world-map/audit/tools）+ 4 组合并别名 → 22 → 0 |
| 管道串 | 全部改成「"第一值"（或 "第二值" / "第三值"）」；help/SKILL 零管道串 |
| 拼写 | precison → precision |
| 示例 | `r62-doc-consistency` 里直接执行 help 的 operation 示例与 SKILL 的 calls 示例 |

## 四、守护（`test-v3/r62-doc-consistency.mjs`，90 项）

1. 数字：help 节数 = SKILL/工具描述声明；公式数 = SKILL 声明；无过期数字（665/740/803/804/342/12 节/55 节）；
2. 门面：每个子命令 ∈ 已迁移 operation；facade 节不再列假子命令；`calc op:"sanity"` 明确拒绝；
3. 覆盖：SKILL 覆盖全部 operation（含 auto）；help 有 topology/batch 节；
4. 可查：63 节逐节 `helpTopic:key` 取到全文；
5. 术语：`calls`/`sanity` 在三处一致；SKILL 提 topology；工具描述提「单位优先符号」；
6. 示例：help 的 operation 片段全部可运行；SKILL 的 calls 示例可运行；
7. 无管道串（只把 `a|b|c` 且各段都是标识符的算管道串）。

## 五、边界（诚实清单）

- help 从 57 → 63 节，**目录变长**（每轮只在调 help 时付，可接受）；SKILL 的能力表仍是速查，字段细节以 help 为准。
- 参数名只做了「顶层键 ⊆ schema」的反向抽查与示例实测；嵌套对象里的字段（如 `document.path`、`compare.rows`）不在 schema 顶层，属正常。
- 公式 805 条逐条带单位调用仍未做（见 R61-R62 文档）。
