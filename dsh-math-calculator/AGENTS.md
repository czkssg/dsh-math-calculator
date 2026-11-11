# 开发规则（接手前必读）

## 一、开工前先查开源社区（硬门槛）

> 用户明确指令（2026-11-12）：
> **以后编写或者开工前，无论是什么功能，任何一个功能开工前，先查开源社区。**

**流程四步，缺一不可：**

```
① 查      npm registry + GitHub + 领域标准（如 UCUM / QUDT / GeoJSON）
② 评估    依赖数 / 包体积 / 停更风险 / 许可兼容 / 能否只引子包
③ 记录    选型理由写进对应规划文档（不只在对话里说）
④ 开工    前三步做完才能动 src/
```

**为什么是硬门槛**：这个项目已经用三次返工证明了手写更容易错——

| 手写的 | 开源早有的 |
|---|---|
| `traverse` + `findCycles`（含上游方向 bug） | `graphology` 的 components/dag/shortest-path |
| 地形绕障寻路（计划中） | `@turf/turf` 的 `shortestPath` |
| 复合单位三次补丁 | `@lhncbc/ucum-lhc`（通过 UCUM 官方测试） |

完整细则见 [docs/开工前先查开源.md](docs/开工前先查开源.md)。

## 二、三条不可违反的输出性质

1. **可信度标签**（`[精确]`/`[标度]`/`[量级]`/`[仅方向]`）必须保留——它们是结论强度的声明
2. **不猜**——判据由调用方给（`sanity:{max,min,expect,note}`）
3. **`result` 是数据通道**——提示走 `notice`

## 三、改完必跑的三件事

```bash
npm run build      # 编译
npm run doccheck   # 注释覆盖（大段插入后必跑，否则 JSDoc 被挤掉）
npm run preflight  # 自检（版本三处一致、清单声明等）
```

全量测试见 `run-all-tests.mjs`；因 Node `spawn EPERM` 限制，
需为每个套件用独立的 `DSH_MATH_CALC_HOME` 逐个跑。

## 四、已知的坑（都踩过）

| 坑 | 表现 | 正确做法 |
|---|---|---|
| 注释里写 `+-*/` | `*/` 提前闭合块注释，整段编译失败 | 用文字描述正则，不写字面量 |
| 模板字符串漏结尾反引号 | TS1005 `';' expected`，报错行号≠出错位置 | 插入后立刻 build；用 `npx tsc --noEmit` 看第一个错 |
| 大段插入挤掉 JSDoc | `doccheck` 红 | 改完立刻跑 doccheck |
| `git add -A` | 把用户私有文件提交进去 | 永远只用显式文件列表 |
| Python 改 TS 含 `\n` 的字符串 | 转义被吃掉，文件损坏 | 用 `edit` 工具，或先写脚本文件再执行 |
| 测试用共享 `DSH_MATH_CALC_HOME` | 套件互相污染 | 每套件独立临时目录 |
| 只测一边 | 「该拒绝的拒绝了」但「该放行的也拒了」 | 每条断言成对：拒绝 + 放行 |

## 五、文档索引

| 文档 | 内容 |
|---|---|
| [开工前先查开源](docs/开工前先查开源.md) | **开工前必读**的流程规则 |
| [工程质量评估报告](docs/工程质量评估报告_2026-11-11.md) | 缺陷与能力缺口的完整评估 |
| [功能详解](docs/功能详解.md) | 每个 operation 怎么用、怎么读结果 |
| [复合单位体系规划](docs/复合单位体系规划.md) | 复合单位的现状与选型（未开工） |
| [带拓扑的编制树规划](docs/带拓扑的编制树规划.md) | 编制树泛化 + 功能拓扑化的判断 |
| [空间拓扑层规划](docs/空间拓扑层规划.md) | 地形/建筑/载具的几何与连通（未开工） |
| [skills/world-deduction](skills/world-deduction/SKILL.md) | 给 AI 的技能文档（需随功能同步） |

## 六、skill 必须同步

`skills/world-deduction/SKILL.md` 是 AI 认识这个插件的入口。

**新增 operation 必须同步 skill**，否则 AI 永远不知道有这功能。
`test/skill-sync.mjs` 会检查：所有 operation 都被提到、
引用的 `helpTopic` 真实存在、写死的数字与当前一致。

## 七、发版

用户规则（2026-11-09）：**默认只同步 git**（commit + push），
npm 发版改为「攒多了再更新」。发版时需完整验证链路
（registry 查询 → 装临时目录 → 真实调用 → shasum 字节比对）。
