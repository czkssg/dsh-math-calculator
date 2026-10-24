# 贡献指南

感谢你愿意改进这个插件。这个仓库有一条**明确的质量底线**：任何改动都要能过全量测试与装机自检。

## 环境

- Node.js `>= 22`（推荐 24）
- DSH（DeepSeek Harness）`>= 0.1.1-rc.2`
- Windows / macOS / Linux

```bash
cd dsh-math-calculator
npm install
npm run build
npm run test:all
```

## 改动前先跑基线

```bash
npm run test:all     # 期望：41 套 / 1697 项 全绿
npm run preflight    # 期望：全 ✓
npm run doccheck     # 期望：0 缺失
```

**基线不绿就别开工**，否则后面分不清是你改坏的还是本来就坏的。

## 提交前必须过的四道关

| 命令 | 检查什么 |
|---|---|
| `npm run build` | 编译通过（主 + 客户端两份 tsconfig） |
| `npm run test:all` | 全量测试；新增测试**必须同时加进 `run-all-tests.mjs` 的基线表** |
| `npm run preflight` | 装机自检：入口契约、客户端席位、注释覆盖、清单一致性 |
| `npm run doccheck` | 每个 `.ts` 有模块头、每条导出有文档注释 |

## 代码约定（都很短，但请遵守）

1. **注释是硬要求**：模块头写清「职责 / 依据 / 失效条件」；每条导出写清参数与坑。
   踩过的坑写成 `⚠️ + 真机证据 + 正确做法`，放在代码旁。
2. **错误要结构化**：抛 `CalcError(type, message, hint)`，不要抛裸 Error。
3. **确定性**：计算路径里不许有 `Math.random`；同一输入必须同一输出（有 `determinism` 测试守着）。
4. **不污染别人**：不改宿主原生界面、不注入全局样式、不与其它插件抢槽位/路由/工具名。
   命名一律带包名前缀。
5. **经验公式必须写适用域**（例如「α 偏离现实 < 50%」），并登记到 `src/provenance.ts`。

## 加一条公式

1. 写进对应 `src/formula-library-*.ts`，`params` 的 `desc` **必须带单位**（符号索引靠它消歧）；
2. `node test/formulas-list.mjs` 重新生成 `FORMULAS.md`；
3. 把 `run-all-tests.mjs` 里 `formulas-all.mjs` 的基线 +1。

细节见 [docs/formula-authoring.md](../docs/formula-authoring.md)。

## 加一个新 operation（谨慎）

operation 数量是**对外契约**（有测试断言）。要加必须同时改四处：
`MathOperation` 联合类型 → schema enum → `opHelp()` → 分发 switch → 断言基线。

**更推荐的做法**：给已有 operation 加参数或子动作（就像 `formulas` 的 `freq:` / `symbol:` 查询）。

## ⚠️ 卸载前必读（真实事故）

**不要把「从目录路径安装的插件」直接 `dsh plugin remove`。**

如果 profile 里记录的是 `file:<你的源码目录>`（`dsh plugin add <目录>` 会这样记），
执行 remove 可能**把源码目录整个删掉**。2026-10-24 发生过一次：110 个文件被清空。

安全做法：

1. 只从 **npm 包或 tgz** 安装到需要反复卸载的 profile；
2. 指向源码目录的安装，卸载前先确认**仓库干净且已推送**（`lib/`、`node_modules/` 不在 git 里，
   恢复后要 `npm install && npm run build`）；
3. 详细分析与恢复步骤见 [docs/adr/0003](../docs/adr/0003-install-method-and-uninstall-risk.md)。

## 报 bug

用 GitHub Issue，带上：
- DSH 版本、插件版本、操作系统；
- `math_execute` 的实际入参与输出；
- 若与界面有关，附 `%APPDATA%\@deepseek-ai\dsh-desktop\logs\` 下的崩溃日志。

## 提交信息

```
feat(公式库): 新增读者视角高频公式第三批
fix(client): 注册 id 改为包名，修复桌面端 import failed
docs(handoff): 新增会话交接
```

## 许可

提交即表示你同意以 [MIT](../LICENSE) 授权你的贡献。
