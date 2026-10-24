# 正向推演链路（world → P1—P5）

> 推演栈从「展示卡片」变成「真正跑起来」的那一步。

## 一、它做什么

一次调用就把 `world` 的物理计算结果**逐层喂给接口卡判定**，输出：

```
【P1】微观有效层（化学）  ✓
  ok 键能范围        4 eV          [允许 0.5—10]
  ok 原子尺度        5.29e-11 m    [允许 5e-11—3e-10]
  ok 化学稳定度      161.6 kT 倍数  [允许 10—1e6]

【P2】介观材料层（材料与相态）  ✓
【P3】宏观体感层（生物力学）    ✓
【P4】行星环境层（大气与地质）  ✓
【P5】恒星天文层（寿命与辐射）  ✓

总结论：允许
```

每行带「实际值 / 单位 / 允许区间」，越界行会额外说明原因。

## 二、数据流

```
opWorld({world:{...}})            ← 已有模块，算重力/标高/逃逸速度/恒星寿命
  ↓ value（18 个顶层字段）
runPipeline(worldValue)
  ├→ layerP1(world.life.chemistry)      键能 / α→原子尺度 / 稳定度
  ├→ layerP2(planet, temperature)       材料密度 / 液态溶剂窗口
  ├→ layerP3(planet, atmosphere)        骨骼比 / 标高比 / 反应比
  ├→ layerP4(planet, atmosphere)        Jeans 参数 / 气压
  └→ layerP5(stellar)                   寿命 / 峰值波长 / 宜居带
  ↓
PipelineResult { layers[], firstBlocked, verdict, advice[] }
```

## 三、各层的映射依据

| 层 | 接口变量 | 从哪来 | 怎么算 |
|---|---|---|---|
| P1 | 键能范围 | `life.chemistry.bondEnergyEv` | 直接取 |
| P1 | 原子尺度 | `life.chemistry.alphaRatio` | 玻尔半径 ÷ α 比值 |
| P1 | 化学稳定度 | `life.chemistry.stability` | 直接取（kT 倍数） |
| P2 | 材料强度密度比 | `planet.densityKgM3` | 密度 ÷ 1000 × 1e5 |
| P2 | 液态溶剂窗口 | `temperature.surfaceMeanK` | 与凝固/沸点比较 |
| P3 | 骨骼强度体重比 | `planet.surfaceGravityEarth` | 地球基准 5 ÷ g 倍数 |
| P3 | 身高大气标高比 | `atmosphere.scaleHeightM` | 1.7 m ÷ 标高 |
| P3 | 反应时间重力比 | `planet.surfaceGravityEarth` | 0.34 ÷ √g |
| P4 | 大气逃逸率 | `planet.escapeVelocity` + 温度 | Jeans 参数 = v_esc / v_thermal |
| P4 | 大气压 | `atmosphere.pressureAtm` | 直接取 |
| P5 | 恒星寿命 | `stellar.lifetimeGyr` | × 1e9 转年 |
| P5 | 辐射谱峰值 | `stellar.peakWavelengthNm` | **× 1e-9 转米** |
| P5 | 宜居带宽度 | `stellar.habitableZoneAU` | 上限 − 下限 |

## 四、实测三个世界的差异

| 世界 | 参数 | 结果 |
|---|---|---|
| A 地球 | 默认 | **全链路允许** |
| B 小行星 | R=0.4, M=0.05, 8h | P3 标高比边缘（大气标高 26.9 km，人类占比 0.006%） |
| C 超级地球 | R=2.5, M=10 | P3 骨比降到 3.12（仍允许，接近下限） |

**这证明链路真的在算，不是照抄常数。**

## 五、踩到的坑：单位不一致

第一版把 `peakWavelengthNm`（**nm**）直接拿去和卡片的允许区间
`[3e-7, 2e-6]`（**m**）比较，导致太阳这类完美恒星被判「辐射峰值波长越界」。

教训：**接口卡的单位声明必须和喂进去的数据单位一致**。
现在先 `× 1e-9` 转成米再判，并在代码里写了注释防止回归。
测试里专门有一条守着（「峰值波长以米记」）。

## 六、用法

```jsonc
{"operation":"derivation","derivation":"pipeline"}
{"operation":"derivation","derivation":"pipeline","world":{"planetRadius":2.5,"planetMass":10}}
```

## 七、验证

```
44 套 / 1869 项全绿（新增 pipeline.mjs 21 项）
地球参数：五层全允许 ✓
小行星：P3 正确告警 ✓
超级地球：骨比按重力正确下降 ✓
单位换算：nm→m 有专门断言守护 ✓
```

## 八、下一步可做

1. **逆推校准**：给一个叙事锚点（如「要有 50 米巨兽」），反推 g 的上限与行星质量窗口
2. **七张表持久化**：把链路结果写进工作区数据表
3. **版本记录**：每次链路跑完自动留一版，便于对比「改了参数后结论怎么变」
