# astronomy-engine 算法解析与推广（通用轨道）

> 目标：解析 astronomy-engine 的算法，把能推广的部分推广到**任意天体**（架空行星、双星、卫星）。

## 一、它内部怎么算（解析结论）

| 对象 | 方法 | 能否推广 |
|---|---|---|
| 太阳系行星 | **VSOP87 级数**（长期项 + 周期项，几百个系数，拟合 1900–2100） | ❌ 只覆盖太阳系行星，不可推广 |
| 月球 | ELP2000 级数 | ❌ 同上 |
| 地轴章动/岁差 | IAU 多项式 | ❌ 地球专属 |
| **行星轨道周期** | 开普勒第三定律 `P = sqrt(a³/μ)` | ✅ **可推广** |
| **位置求解** | 开普勒方程 `M = E − e·sinE`（牛顿迭代）+ 轨道根数旋转 | ✅ **可推广** |

关键发现：astronomy-engine 的 `Orbit` 类**没有导出**，`HelioVector` 只接受枚举的太阳系天体。
所以「推广」不是改它，而是**提取它底层的通用模型**自己实现——这就是 `orbit.ts`。

## 二、推广后的能力（`astro` 的 orbit / binary）

```jsonc
// 任意天体的开普勒轨道：给定轨道根数
{ "operation":"astro", "astro":{ "action":"orbit",
    "elements":{ "a":1.2, "e":0.05, "centralMass":1.1 },
    "years":0.25 } }

// 双星互绕
{ "operation":"astro", "astro":{ "action":"binary",
    "binary":{ "massA":1, "massB":0.5, "semiMajorAu":1 } } }
```

| 输出 | 含义 |
|---|---|
| `periodYears` | 开普勒周期（年） |
| `positionAu` / `velocityAuPerYear` | 位置与速度（三维，含倾角/升交点/近日点幅角） |
| `radiushaus` / `trueAnomaly` | 距中心距离、真近点角 |
| `binary` 的 `aStarAu` / `aCompanionAu` | 质心距离按质量反比分配 |

实测：
- 地球（a=1, e=0.0167）→ 周期 **1.000 年**；
- 木星（a=5.2044）→ **11.873 年**（真实 11.862，开普勒模型差 0.01 年——正常，VSOP 才有那块精度）；
- 双星 1+0.5 M☉、a=1 AU → **0.816 年**，质心距 0.333/0.667 AU。

## 三、分工（重要）

| 场景 | 用什么 | 为什么 |
|---|---|---|
| 真实地球的日出日落/月相 | `astro` 的 rise-set/sun/moon | astronomy-engine 的历表精度（VSOP） |
| **架空行星绕恒星** | `astro` 的 orbit | 开普勒模型，任意质量/轨道 |
| **双星/多星系统** | `astro` 的 binary | 两体质心 |
| **卫星（月球类）** | orbit（centralMass 用行星质量） | 同上 |
| 行星气候/昼夜 | `world` | 领域模型 |

## 四、精度边界

- **开普勒是二体模型**：不含摄动（行星互拉）、不含相对论修正。对架空设定足够；
- **时间尺度**：`years` 从历元算起，跨千年仍有效（无长期项，但二体模型本身无长期演化）；
- **不替代 VSOP**：真实太阳系行星位置请继续用 astronomy-engine 的 HelioVector（astro 暂未暴露，需要可加 action `helio`）。
