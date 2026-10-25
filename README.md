# dsh-math-calculator

一个给 DSH（DeepSeek Harness）用的**高精度数学计算器插件**。

模型不再心算，而是调用它：64 位 BigNumber 求值、符号微积分、线性代数、统计概率、
微分方程、单位换算、395 条带标签的公式、物理常数推演。**全部本地执行，不联网。**

> 它首先是一个计算器。此外附带一组可选的架空世界推演工具（星球、文明、收支）——
> 用得上就用，用不上不影响计算能力。

**主包在 [`dsh-math-calculator/`](dsh-math-calculator/)** —— 安装、用法、完整能力清单看那份 README。

## 快速安装

```bash
# 从 npm（发布后）
dsh plugin --profile <profile> add dsh-math-calculator

# 从源码
git clone https://github.com/czkssg/dsh-math-calculator.git
cd dsh-math-calculator/dsh-math-calculator
npm install && npm run build
dsh plugin --profile <profile> add .
```

## 计算能力

| 类别 | 能做什么 |
|---|---|
| 高精度求值 | 64 位有效数字，`10^20+5` 精确到个位，不丢精度 |
| 符号运算 | 求导、积分（带 +C）、化简、展开、多项式求根（含复根） |
| 线性代数 | 矩阵乘/逆/行列式/迹、秩、零空间、奇异值、特征值与特征向量 |
| 统计概率 | 描述统计（含偏度峰度分位数）、7 种分布的 PDF/CDF、线性与多项式回归 |
| 微分方程 | RK4 数值解，一阶方程组与二阶自动降阶 |
| 单位换算 | 73 个单位：SI、中文古制（里/丈/斤/亩/时辰）、英制、天文；温度按仿射换算 |
| 公式库 | 395 条公式，参数全可覆盖；支持三轴检索与工作区自定义 |
| 物理常数 | 改一个常数，自动重算依赖它的派生量，并评估对世界的偏离度 |

## 为什么安全

- 禁用 `math.import` 与 `createUnit`（这两者能注入任意 JS）
- AST 遍历拦截 `process` / `require` / `constructor` / `globalThis` 等标识符
- 复杂度阈值：`factorial(1e9)` 这类在 AST 层就拒绝
- **无 `eval`、无 `new Function`**

## 可选：架空世界推演

同一套底座也能推演虚构世界的物理后果（重力、气候、恒星、收支、技术树）。
这部分是**附加能力**，对纯计算需求没有影响。见
[dsh-math-calculator/README.md](dsh-math-calculator/README.md)。

## 开发

```bash
cd dsh-math-calculator
npm run build        # tsc
npm run test:all     # 67 套 / 2970 项
npm run doccheck     # 注释覆盖（每个模块头 + 每条导出）
npm run preflight    # 装机前自检
```

## 文档

完整索引见 **[docs/README.md](docs/README.md)**（按「计算 / 工程 / 数据 / 推演 / 归档」分组）。

| 想了解 | 去哪 |
|---|---|
| 安装与完整用法 | [dsh-math-calculator/README.md](dsh-math-calculator/README.md) |
| 全部文档索引 | [docs/README.md](docs/README.md) |
| 395 条公式目录 | [dsh-math-calculator/FORMULAS.md](dsh-math-calculator/FORMULAS.md) |
| 能力边界（实测） | [dsh-math-calculator/LIMITS.md](dsh-math-calculator/LIMITS.md) |
| 代码结构 | [docs/code-map.md](docs/code-map.md) |
| 关键设计决策 | [docs/adr/](docs/adr/) |

## 许可

[MIT](LICENSE)
