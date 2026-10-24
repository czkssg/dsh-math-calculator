# 发布流程（npm + DSH 社区）

> 面向维护者。普通用户看 [README](../README.md) 即可。

## 0. 发布前检查（一条命令）

```bash
cd dsh-math-calculator
npm run build && npm run test:all && npm run preflight && npm run doccheck
```

四项全绿再往下走。**任何一项红都别发。**

## 1. 版本号

遵循语义化版本：

| 改动类型 | 版本 |
|---|---|
| 修 bug、改文档、改文案 | patch（2.0.1） |
| 加公式、加参数、加界面能力（兼容） | minor（2.1.0） |
| 改 operation 契约、改数据格式、改 UI 席位 | major（3.0.0） |

同时更新 `CHANGELOG.md`（不要只改版本号就发）。

```bash
npm version patch -m "chore(release): v%s"
```

## 2. 打包自检

```bash
npm pack --dry-run         # 看清单里有什么
npm pack                   # 生成 tgz，用 dsh plugin add <tgz> 实测安装
```

必须出现在 tarball 里的东西：

```
lib/                构建产物（含 client.js）
src/                源码（便于他人审阅）
cordis.patch.yml    让包成为 profile bundle 的补丁
dsh.plugin.json     注册清单（社区目录读它）
README.md  CHANGELOG.md  LICENSE
```

**不应该**出现：`node_modules`、测试产物、任何本地路径或密钥。

## 3. 发布到 npm

```bash
npm login                 # 一次性
npm publish --access public
```

`prepublishOnly` 会自动跑全量测试 + 装机自检 —— 测试不过就发不出去，这是有意的。

也可以走 CI 发布（推荐）：

```bash
git tag v2.1.0 && git push origin v2.1.0
```

`.github/workflows/release.yml` 会带上 provenance 发布。
**需要先在仓库 Secrets 里配置 `NPM_TOKEN`**（npm Automation Token）。

## 4. 上 DSH 社区

社区靠**三条线索**索引插件，缺一条就可能搜不到：

| 线索 | 做法 | 状态 |
|---|---|---|
| npm 包 | 上一步发布后自动可见 | ⬜ 需 npm 登录 |
| GitHub topic | 仓库加 `dsh-plugin`、`deepseek-harness`、`dsh` | ⬜ |
| 注册清单 | `dsh.plugin.json`（id/version/main/contributes） | ✅ 已就绪 |

### 加 topic

```bash
gh repo edit czkssg/dsh-math-calculator \
  --add-topic dsh-plugin --add-topic deepseek-harness --add-topic dsh \
  --add-topic math --add-topic worldbuilding --add-topic scientific-computing
```

### 提交到目录（按需，选一个即可）

- **awesome-dsh-plugin**：向其仓库提 PR，在对应分类下加一行
  `- [dsh-math-calculator](https://github.com/czkssg/dsh-math-calculator) — 一句话说明`
- **dsh.works / dsh.so 类目录**：多数会自动爬 npm + GitHub topic；
  若需手动登记，填的是 `dsh.plugin.json` 里的 id 与 npm 包名。

### 社区对插件的硬要求（我们已满足）

| 要求 | 我们的情况 |
|---|---|
| `dsh.bundle.patch` | ✅ `./cordis.patch.yml` |
| `engines.dsh` | ✅ `>=0.1.1-rc.2 <0.4.0` |
| 客户端 bundle 的注册 id = 包名 | ✅ 已修复并有回归测试 |
| `peerDependencies` 接受宿主 prerelease | ✅ `>=0.1.0-0 <0.3.0` |
| 不写 `prepare`（避免装时执行代码） | ✅ 只用 `prepack` / `prepublishOnly` |

## 5. 发布后验证

```bash
# 从 npm 安装到隔离 profile（不要直接上主 profile）
dsh plugin --profile mathlab add dsh-math-calculator
dsh --profile mathlab --dump-config | Select-String dsh-math-calculator
```

再确认：侧栏入口出现、右侧页签出现、`math_execute` 可用。

## 6. 发布清单

- [x] 四项检查全绿（41 套 / 1697 项）
- [x] 版本号 + CHANGELOG 已更新（2.0.0）
- [x] `npm pack` 清单干净（151 项 / 519 KB，无密钥、无本地路径、无 node_modules）
- [ ] **`npm publish`** ← 唯一阻塞项：本机 npm 未登录
- [x] GitHub topic 已加（dsh-plugin / deepseek-harness / dsh / math / worldbuilding / scientific-computing）
- [ ] 目录/清单已提交（如需，见 §4）
- [x] 隔离 profile 实测安装通过（从 tgz 装进 mathlab：pnpm 从 registry 拉到 12 个依赖，
      三个后端接口全部 200）
- [ ] GitHub Release 写清本次变更（建议等 npm 发布成功后一起做）

---

## 7. 当前进度（2026-10-24 记录）

已完成：

| 项 | 结果 |
|---|---|
| 仓库改名 | `czkssg/5` → **`czkssg/dsh-math-calculator`** |
| 公开 | ✅ PUBLIC（匿名访问网页与 API 均 200） |
| 历史清理 | ✅ 全历史已清除 `.scratch`（含误提交的 `.credentials.yaml` 与 web token 日志），已强推替换 |
| 探针清理 | ✅ 移除 `host-load-test.cjs` / `scan-market.cjs` / `.dsh-acl-recovery` |
| 脱敏 | ✅ 文档里的真实用户名 → `<you>` |
| 开源文件 | ✅ LICENSE / CONTRIBUTING / CODE_OF_CONDUCT / SECURITY / CHANGELOG / CI / 模板 |
| npm 包 | ✅ `npm pack` 产物干净，隔离 profile 实测可装可用 |
| 包名可用 | ✅ `registry.npmjs.org/dsh-math-calculator` 返回 404（名字未被占用） |

**待你执行的一步**（我无法代做，需要你的 npm 凭据）：

```bash
cd D:\0cengxu\5\dsh-math-calculator
npm login                     # 输入 npm 账号 + 密码 + 邮箱 OTP
npm publish --access public   # prepublishOnly 会自动跑全量测试 + 自检
```

或者走 CI（推荐，带 provenance）：先在仓库
Settings → Secrets → Actions 里加 `NPM_TOKEN`（npm Automation Token），然后

```bash
git tag v2.0.0 && git push origin v2.0.0
```

发布成功后建议再做一次：`dsh plugin --profile mathlab add dsh-math-calculator`，
确认从 npm 拉取也能装（与本文 §5 的本地 tgz 验证互为补充）。
