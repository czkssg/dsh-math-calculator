# 安全策略

## 报告漏洞

请**不要**用公开 Issue 报告安全问题。请通过 GitHub 的
[私密漏洞报告](https://github.com/czkssg/dsh-math-calculator/security/advisories/new)
提交，或私下联系维护者（@czkssg）。

请在报告里说明：

- 受影响版本（插件版本 + DSH 版本）
- 复现步骤
- 影响面（能否读文件、能否执行任意代码、能否影响其它插件）

## 设计上的安全边界（已知且有意为之）

| 项 | 现状 | 说明 |
|---|---|---|
| 表达式求值 | 使用 mathjs，**已删除 `import` 与 `createUnit`** | 防止表达式注入任意 JS 或改写单位表 |
| 计算执行 | 全部本地，不联网 | 没有远程调用 |
| UI 后端路由 | 独占 `/api/dsh-math-calculator`，仅回环可达 | 不依赖远端鉴权 |
| 数据落盘 | `$DSH_HOME/math-calc` | 工作区与公式包都在本地 |
| 输入规模 | **未做体积上限** | 超大输入可能耗内存，已知限制 |

## 我们关心的依赖

- `mathjs`、`algebrite`：计算内核
- `@deepseek-ai/dsh-tools`：宿主工具契约（peerDependency）

依赖有已知 CVE 时请开 Issue 并附公告链接。
