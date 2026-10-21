# 安装机制调研（本机实测）

> 这份文档记录的是 **Lead 直接在本机读到的证据**，不是推测。每一条都标了来源。
> 结论直接写进了插件根目录的 `README.md` 第 2 节。

> **2026-10-22 更正**：本文第 3 节与第 8 节的「运行期完全不 import `@deepseek-ai/*`」**已不成立**。
> 插件后来改用官方 `defineTool`（`src/index.ts:23`），因此 `@deepseek-ai/dsh-tools` 是**运行期依赖**，
> 必须留在 `devDependencies` 并列入 `peerDependencies`，运行时从插件自己的 `node_modules` 解析。
> 换来的是 schema 编译 / 参数校验 / 错误包装不用自己维护。其余调研结论（CLI 转发 pnpm、
> profile 无 `dsh-tools`、desktop 由 Electron 独占管理）仍然有效。

## 0. 本机事实

| 项 | 值 | 证据 |
| --- | --- | --- |
| DSH 版本 | `0.2.1-rc.2` | `resources\runtime\primary-runtime\runtime.json` → `"desktopVersion": "0.2.1-rc.2"`；`dsh.cmd --version` 输出 `0.2.1-rc.2` |
| 桌面版 Electron | `44.7.0` | `resources\version` |
| 内置 Node | `24.21.0` | `runtime.json` → `"node": "24.21.0"`；`runtime\versions.json` |
| 内置 pnpm | `11.28.5` | `runtime.json` → `"pnpm": "11.28.5"` |
| profile | `desktop`（**唯一一个**） | `Get-ChildItem C:\Users\曹某\.dsh\profiles -Directory` 只返回 `desktop` |
| profile 目录 | `C:\Users\曹某\.dsh\profiles\desktop` | 同上 |
| CLI 入口 | `C:\Users\曹某\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd` | 该文件内容：`ELECTRON_RUN_AS_NODE=1` + `"%~dp0..\..\..\..\DeepSeek Harness.exe" --expose-internals "%~dp0..\..\..\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js" %*` |
| `dsh` 在 PATH 上？ | **否** | `Get-Command dsh / dsh.cmd / dsh.exe` 全部为空 |

## 1. `dsh plugin` 到底是什么

`& dsh.cmd plugin --help` 原文：

```
Usage: dsh plugin [options] [args...]
manage a profile's plugins by forwarding the remaining arguments to pnpm in the
profile directory
Arguments: args  pnpm arguments, forwarded verbatim (add <pkg>, remove <pkg>, why <pkg>, ...)
Options: --profile <name>  the profile whose plugins to manage (initialized on first use)
```

**结论（EVIDENCE）**：`dsh plugin` 不自己做安装，而是把参数原样交给 profile 目录里的 pnpm。
所以「本地目录路径」能不能装，等价于「pnpm 能不能 `add` 这个 spec」——`file:`、相对路径、绝对路径、
`.tgz`、`github:` 都可以。

## 2. 一个插件是怎样进入插件树的

证据：`C:\Users\曹某\.dsh\profiles\desktop\node_modules\dsh-hot-installer\README.md`

- 第 41 行（EVIDENCE）：读包 `package.json` 的 `dsh.bundle.patch` → 解析 `cordis.patch.yml` →
  把 patch 条目追加到根 include entry 的 `config.patches` → `entry.update`。
- 第 55 行（EVIDENCE）：**insert 行里 `name` 为绝对路径或以 `./`、`../` 开头时，平台会把它改写成
  「紧邻该补丁文件」的 `file://` URL**；裸包名保持原样。
- 第 49 行（EVIDENCE）：Windows 上 `link:` 用 junction；同一次 dsh 运行期间把 link 切到别的目录，
  会继续跑旧代码（日志却写 `hot-reloaded`）。→ 改完代码要重启。
- 第 53 行（EVIDENCE）：dsh `0.1.7-alpha.1` 起 `dsh.bundle.patch` 支持**有序文件数组**；单文件声明照旧。

**结论**：插件必须提供 `dsh.bundle.patch`，并在该补丁里用 `- insert:` 插入自己的行。本插件两条都满足。

## 3. profile 里没有 `@deepseek-ai/*`

- `Get-ChildItem C:\Users\曹某\.dsh\profiles\desktop\node_modules\@deepseek-ai`（`-Force`, `-ErrorAction Continue`）
  → **无输出**。
- `Test-Path C:\Users\曹某\.dsh\profiles\desktop\node_modules\@deepseek-ai\dsh-tools\package.json` → `False`。
- profile 的 `package.json` 里，`@deepseek-ai/*` 只出现在 `dsh.profile.bundles`（`dsh-base`、`dsh-web-app` 等），
  **不在 `dependencies`**（EVIDENCE，直接读该文件）。

**推论（INFERENCE，已在插件侧规避）**：从插件目录 `import '@deepseek-ai/dsh-tools'` 是否可解析，
取决于宿主是否对内置包做额外的模块映射；仅从文件系统看，profile 内解析不到。

→ **本插件的应对**：运行期**完全不 import** 任何 `@deepseek-ai/*`。只 import `mathjs`。
schema 编译与参数校验在本地实现，并用 `test/schema-parity.mjs` 与真实 `defineTool` 做逐字段等价验证
（当前 100% 一致，包括 `required` 汇总、`type:'json'` 的注解-only 编译、参数根的「隐式开放对象」不写
`additionalProperties`）。

## 4. 推荐的安装步骤（本机）

见 `README.md` 第 2 节「方式 A / B / C」。核心两条命令：

```powershell
cd D:\0cengxu\5\dsh-math-calculator
npm install ; npm run build

& "C:\Users\曹某\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add D:/0cengxu/5/dsh-math-calculator
```

验证：

```powershell
Get-Content C:\Users\曹某\.dsh\profiles\desktop\package.json          # dependencies + dsh.profile.bundles 两处
& "...\dsh.cmd" --profile desktop --dump-config | Select-String math-calc
```

## 5. 未解决 / 风险

| 项 | 状态 | 影响 |
| --- | --- | --- |
| `app.asar` 内的宿主源码（是否对 `@deepseek-ai/*` 做模块映射） | **未读到**，asar 是打包的（182 MB），`glob` 只能看到 `app.asar.unpacked` | 已通过「零 `@deepseek-ai` 运行期依赖」完全规避，不需要这个答案 |
| `dsh --dump-config` 是否存在于 0.2.1-rc.2 | 未实测（未执行，避免改动 profile） | 验证步骤若失败，退化为「重启后看设置→插件列表」 |
| `dsh plugin add <本地目录>` 的实际产物是 `link:` 还是拷贝 | 未实测（不执行安装命令） | README 已写明两种可能的后果与坑 |

## 6. 本插件必须满足的 manifest 字段

| 字段 | 本插件取值 | 理由 |
| --- | --- | --- |
| `name` | `dsh-math-calculator` | 与 `cordis.patch.yml` 的 insert 行 `name` 一致 |
| `type` | `module` | 宿主按 ESM `import()` |
| `main` / `exports["."]` | `lib/index.js` | 指向 tsc 产物 |
| `dsh.bundle.patch` | `./cordis.patch.yml` | 见第 2 节 |
| `dsh.engines.dsh` | `>=0.1.1-rc.2` | 与已安装插件（如 dsh-novel-writer `>=0.1.1-rc.2`）对齐 |
| `dependencies` | `mathjs` | 唯一的运行期依赖 |
| `peerDependencies` | `mathjs` + 两个 `@deepseek-ai/*`（optional） | `mathjs` 进 peer 是为了让 pnpm 在 profile 里也建副本，避免 `link:` 模式下解析失败；`@deepseek-ai/*` 标 optional 只是声明兼容性，运行期不使用 |
| `files` | `lib`、`index.ts`、`cordis.patch.yml`、`README.md` | `npm pack` 产物完整性 |
