# dsh-math-calculator

DSH（DeepSeek Harness）原生数学与架空世界推演插件。

**主包在 [`dsh-math-calculator/`](dsh-math-calculator/)** —— 安装、用法、能力清单看那份 README。

| 你想做什么 | 去哪 |
|---|---|
| 安装使用 | [dsh-math-calculator/README.md](dsh-math-calculator/README.md) |
| 了解插件怎么生效 | [docs/dsh-plugin-anatomy.md](docs/dsh-plugin-anatomy.md) |
| 了解代码结构 | [docs/code-map.md](docs/code-map.md) |
| 加公式 / 用全局公式包 | [docs/formula-authoring.md](docs/formula-authoring.md) |
| 关心兼容性与冲突 | [docs/compat.md](docs/compat.md) |
| 关键设计决策 | [docs/adr/](docs/adr/) |
| 发布流程（npm / 社区） | [docs/PUBLISHING.md](docs/PUBLISHING.md) |

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

## 能力一句话

BigNumber 高精度求值、符号微积分、线代（秩/零空间/奇异值）、统计概率、微分方程、
**342 条自然科学公式**（带三轴标签：规则层级 / 学科领域 / 主角感知频率）、
物理常数推演与**星球／天空／恒星／卫星／生命闸门**推演。全部本地执行，不联网。

## 开发

```bash
cd dsh-math-calculator
npm run build        # tsc 双配置
npm run test:all     # 41 套 / 1697 项
npm run doccheck     # 注释覆盖
npm run preflight    # 装机前自检
```

## 许可

[MIT](LICENSE)
