# ADR-0003：安装方式决定卸载风险（源码目录可能被删）

- 状态：已采纳
- 日期：2026-10-24
- 起因：一次真实事故（见下）

## 背景

DSH 插件有两种装法，profile 的 `package.json` 会记下不同 spec：

| 装法 | 记录的 spec | pnpm 行为 |
|---|---|---|
| `dsh plugin add <目录路径>` | `file:<绝对路径>`（或 `link:`） | 把**源目录**纳入依赖图 |
| `dsh plugin add <npm 包 / tgz>` | 包名或 `file:...tgz` | 从 registry/store 取，与源码无关 |

## 事故

2026-10-24 开源收尾时，对隔离 profile `mathlab` 执行：

```bash
dsh plugin --profile mathlab add <插件目录>   # 早期，记成 file:<目录>
dsh plugin --profile mathlab remove dsh-math-calculator
```

**结果：本地源码目录 `D:\0cengxu\5\dsh-math-calculator\` 的 110 个文件被整体删除**
（只剩空目录），桌面端 profile 的 junction 一度指向空目录。

恢复方式（可行且已验证）：

```bash
git checkout -- dsh-math-calculator     # 从仓库恢复被跟踪文件
cd dsh-math-calculator
npm install                             # 恢复依赖（lib 与 node_modules 不在 git 里）
npm run build
node run-all-tests.mjs && npm run preflight   # 41 套 / 1697 项全绿
```

## 决策

1. **要能安全卸载的 profile，只从 npm 包或 tgz 安装。**
   需要改代码时，用**另一套**机制（junction/`link:`）或直接在源码目录里开发、用隔离 profile 验证。
2. **任何指向源码目录的安装，卸载前先做一份副本**（或确认仓库干净、已推送）。
3. **仓库是最终防线**：源码目录必须始终处于「已提交、可 `git checkout` 恢复」的状态。
   `lib/` 与 `node_modules/` 不入库，所以恢复后必须 `npm install && npm run build`。
4. 官方 CLI 报出的 spec 要看清：`file:<目录>` 与 `file:<tgz>` 的风险完全不同。

## 后果

- `CONTRIBUTING.md` 与 `docs/PUBLISHING.md` 加醒目警告。
- 恢复流程写进本文档，任何人遇到同款事故可照做。
