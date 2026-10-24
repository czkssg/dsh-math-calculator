# 依赖说明

> 结论：**保留 `mathjs` 与 `algebrite` 两个第三方依赖。**
> 理由：它们是常规 npm 依赖，`npm install` 时自动装，不影响使用，也不影响开源分发。

## 一、当前依赖清单

### 第三方（`dependencies`，npm 自动安装）

| 包 | 版本 | 体积 | 用途 |
|---|---|---|---|
| `mathjs` | ^15.2.0 | 9 MB | 公式包校验（解析表达式、提取符号名，防变量拼错） |
| `algebrite` | ^1.4.0 | 2.4 MB | 符号代数（求导、积分、化简、展开、求根） |

### 官方（`peerDependencies`，宿主 DSH 提供）

| 包 | 版本 | 用途 |
|---|---|---|
| `@deepseek-ai/cordis` | ^4.0.1 | 插件框架（slot / 生命周期） |
| `@deepseek-ai/dsh-tools` | >=0.1.0-0 <0.3.0 | 工具注册 |

## 二、为什么用 `dependencies` 而不是 `peerDependencies`

| 类型 | npm 行为 | 适用场景 |
|---|---|---|
| `dependencies` | **自动安装** | 插件自身要用、宿主不提供的库 |
| `peerDependencies` | **不自动装**，由宿主提供 | 必须是同一份实例的框架/运行时 |

`mathjs` 和 `algebrite` 用户在插件内部、和宿主没有共享实例的需求，
所以放 `dependencies` 是对的——`npm install dsh-math-calculator` 会自动带上它们。

官方 `@deepseek-ai/*` 必须放 `peerDependencies`：它们是宿主的核心运行时，
装两份会导致 slot 注册到错误的实例上。

## 三、安装行为验证

```
npm install dsh-math-calculator
  → 自动安装 mathjs + algebrite（及其传递依赖）
  → 不安装 @deepseek-ai/*（由宿主提供）
  → 插件立即可用
```

发布包**不含 `node_modules`**（正确做法，依赖由 npm 解析）。

实测打包：

```
package size:  754 kB
unpacked size: 2.6 MB
total files:   217
```

## 四、功能验证

```
∫x² dx      = 1/3·x³        ✓
d/dx x³     = 3·x²          ✓
simplify 2x+3x = 5·x        ✓
expand (x+1)² = x² + 2x + 1 ✓
```

## 五、为什么不做「零第三方依赖」

评估过自写轻量 CAS 替换：

| 能力 | 自写可行性 |
|---|---|
| 表达式解析（mathjs 的唯一用途） | 容易（80 行扫描器） |
| 求导 | 中等 |
| 展开 / 化简 | 中等 |
| 求根 | 容易（本项目已有求解器） |
| **符号积分** | **难**（`∫x³·sin(x)` 这类需要完整 CAS） |

去掉 `mathjs` 没问题，但去掉 `algebrite` 会砍掉符号积分——
那正是 `operation="integral"` 的核心能力。

**判断**：为省 2.4 MB 砍掉一个功能，不划算。且这两个库都是常规 npm 包，
不影响安装与分发，所以保留。

## 六、什么情况下该重新考虑

| 触发条件 | 应对 |
|---|---|
| npm 安装失败或被墙 | 自写求导/展开，格式积分标「不支持」 |
| 包体积成为问题 | 同上；或把 CAS 改成可选依赖 `optionalDependencies` |
| 宿主已内置同类能力 | 改用宿主的，去掉自己的 |

## 七、检查命令

```bash
# 看依赖清单
node -e "console.log(require('./package.json').dependencies)"

# 看打包内容（确认不含 node_modules）
npm pack --dry-run

# 验证库能加载
node -e "require('mathjs'); require('algebrite'); console.log('ok')"
```