# 工作区总览（D:\0cengxu\5）

> 2026-11-22 整理。**先看这张表，再进目录。**

## 一、三个层次的目录

| 目录 | 是什么 | 动不动 |
|---|---|---|
| **`dsh-math-calculator/`** | **插件本体**（源码 src / 编译 lib / 文档 docs / 测试 test-v3） | 干活只改这里 |
| `docs/` | **工作区级文档**（34 篇：架构、ADR、规划、评估） | 有索引 `docs/README.md` |
| `.scratch/` | **工作台**（脚本、缓存、交接、参考开源项目） | 可随时清；见 `.scratch/README.md` |

## 二、根目录只留这些

```
README.md / AGENTS.md / CONTRIBUTING.md / CODE_OF_CONDUCT.md / SECURITY.md / LICENSE
docs/            工作区文档（34 篇，有索引）
drafts/          草稿副本（gitignore；原始跟踪文件仍在根目录）
实践文档/         外部资料（gitignore）
dsh-math-calculator/              插件本体
dsh-math-calculator-legacy-backup-20261112/   旧版备份（gitignore）
```

## 三、常用入口

| 想干什么 | 去哪 |
|---|---|
| **接手开发** | `dsh-math-calculator/AGENTS.md` → `docs/项目状态总结_2026-11-12.md` |
| 看测试状态 | `dsh-math-calculator/test-v3/test-report.json` |
| 看每轮交接 | `.scratch/handoff/README.md`（#51 最新） |
| 找历史脚本 | `.scratch/scripts/{add,probe,fix,build,research}/` |
| 查开源参考 | `.scratch/research-oss/`（7 个项目） |

## 四、本次整理做了什么

1. `.scratch/` 842 个散落脚本 → 5 类子目录（add 87 / probe 152 / fix 92 / build 19 / research 418）；
2. 数据 54、日志 4 归档；缓存与参考项目各归各目录；
3. 新增 `.scratch/README.md`（目录职责 + 清理规则）；
4. 根目录 5 个草稿 → `drafts/`（重复的 WorldForge 删一份）；
5. 孤立件（空 legacy 数据、未引用的 web 构建脚本）→ `.scratch/caches/orphans/`；
6. `.gitignore` 补 3 段：drafts、可再生产物、外部实践资料；
7. **git 未跟踪项清零**。

## 五、清理空间

想省空间（当前 596M，主要在 .scratch）：

```bash
rm -rf .scratch/caches .scratch/data .scratch/logs .scratch/scripts/research
```

`.scratch/research-oss/`（516M）是参考项目，删了以后要重新 clone。
