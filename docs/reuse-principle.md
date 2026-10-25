# 复用原则：推演是指令集，不重复实现计算

> 用户的设计原则：「**世界观推演模型是指令集，可以复用基础计算模块以及常数表公式库，
> 不需要重复写相关代码**」。

## 一、之前违反了这个原则

我第一版 pipeline 里硬编码了物理量：

```ts
const bohr = 5.29177210903e-11        // 玻尔半径
const kB = 1.380649e-23              // 玻尔兹曼常数
const NA = 6.02214076e23             // 阿伏伽德罗常数
const mWater = 0.018 / NA
```

而插件里**本来就有**这些：

| 需要什么 | 已有 | 之前 |
|---|---|---|
| 大气标高 | 公式 `atmospheric_scale_height`（R·T/(M·g)） | 直接用 world 给的值 |
| 逃逸速度 | 公式 `escape_velocity`（√(2GM/r)） | 直接用 world 给的值 |
| 黑体峰值波长 | 公式 `wien_displacement`（b/T） | 直接用 world 给的值 |
| kB / NA / c / G / h | 常数表 43 个（含 7 个 SI 定义常数） | 抄了一堆数字进 pipeline |
| 355 条公式 | 公式库 | 完全没用上 |

这就是**第二份真相**：公式改了，推演层不跟着变。

## 二、现在的做法：公式桥

新增 `src/formula-bridge.ts`，把公式库当「可程序化调用的计算模块」：

```ts
evalFormula('atmospheric_scale_height', { T: 287.3, M: 0.02896, g: 9.8 })
// → { value: 8411, unit: 'm', expr: 'R * T / (M * g)' }

constantValue('kB')      // → 1.380649e-23（从常数表读，跟着覆盖层变）
constantsFor(['c','G','h'])  // → 批量读
```

### 三个好处

| 好处 | 说明 |
|---|---|
| 一处修正，处处生效 | 公式改了，pipeline 自动跟着变 |
| 常数覆盖自动流入 | `operation=constants` 改的 c/G/h 被公式直接读到 |
| 不产生第二份真相 | 不会出现「pipeline 与 formula 算得不一样」 |

## 三、常数表读取的关键修正

第一版 `constantValue` 只读 `getActiveConstants()`，拿到的是**空表**——
因为那是「本世界的改动」，不含基准值。

正确做法：**先看覆盖层，再退回 `standardValues()`**。

```ts
const overridden = getActiveConstants()[name]
if (typeof overridden === 'number') return overridden
const standard = standardValues()[name]   // 43 个常数（含 7 个 SI 定义常数）
return typeof standard === 'number' ? standard : undefined
```

## 四、无量纲量的「标准值」也自算

之前写死：

```ts
standard: 1 / 137.035999084,
standard: 1836.15267343,
standard: 5.906149417e-39,
```

现在用**同一组公式 + 现实常数**算：

```ts
const REAL = { c: 299792458, hbar: 1.054571817e-34, e: 1.602176634e-19, ... }
const realAlpha = (REAL.e ** 2) / (4 * Math.PI * REAL.epsilon0 * REAL.hbar * REAL.c)
```

实测结果：现实参数下四个偏差**精确为 0**（alpha=0.0e+0 等），
证明 standard 与 current 用的是同一组公式。

## 五、新测试：复用性守卫（18 项）

`test/reuse.mjs` 专门防回归：

| 检查 | 断言 |
|---|---|
| 公式桥能调到已有公式库 | 标高 8411 m / 逃逸速度 11186 m/s / 维恩位移 5.015e-7 |
| 桥接的是同一份库 | `FORMULA_INDEX.size ≥ 300`（实际 341） |
| 常数表接入 | 能从常数表读 kB、批量读 c/G/h，库规模 ≥ 40 |
| **源码里不应有重复实现** | pipeline 里不许出现 kB/NA/玻尔半径的硬编码 |
| 标准值自算 | 现实参数下偏差 ≈ 0；有 `REAL` 常数块 |

## 六、验证

```
45 套 / 1887 项全绿（新增 reuse.mjs 18 项）
pipeline 里已无物理常数硬编码 ✓
公式库 355 条被真正复用 ✓
常数表 43 个（含 7 个 SI 定义常数）被读取 ✓
```

## 七、这条原则的延伸

后续做逆推、七张表持久化时，同样要遵守：

1. 需要算物理量 → 先查公式库有没有现成 id
2. 需要常数 → 一律走 `constantValue()`，不写字面量
3. 需要引擎 → 用 `bignum(precision)`，不新建 mathjs 实例
4. 需要判定 → 用接口卡的区间，不另设阈值
