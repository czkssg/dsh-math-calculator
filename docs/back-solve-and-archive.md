# 逆推校准 · 七张表持久化 · 版本记录

> 三项一起做，因为它们是同一件事的三个面：**逆推**告诉你参数该在哪，
> **持久化**把结论留住，**版本记录**让你看得见变化。

## 一、逆推校准（作者最需要的方向）

正推是「给定参数 → 看世界观成不成立」；逆推是「我想要这个效果 → 参数该在什么范围」。

### 实测：要有 50 米巨兽

```jsonc
{"operation":"derivation","derivation":"backSolve","anchor":"creatureHeight","anchorValue":50}
```

输出：

```
【反推出的参数窗口】
  重力倍数（相对地球）  <= 0.5
    依据：陆生生物高度上限 = 25 / 重力倍数；要 50 米，则重力倍数 <= 25 / 50 = 0.500
  行星质量（地球质量）  <= 0.5
    依据：g ∝ M/R²；R 取 1.00 地球半径时，M <= 0.500 × 1.00² = 0.500

【推荐取值】
  gravityRatio = 0.45   planetMass = 0.45   planetRadius = 1

【用推荐参数跑正向链路】
  [OK] P1 微观有效层     [OK] P2 介观材料层
  [边缘] P3 宏观体感层（有边缘项）
  [OK] P4 行星环境层     [OK] P5 恒星天文层
  总结论：无禁止项，但有边缘项（可接受，需注意）

没有发现冲突
```

### 第三步是关键：落地校验

单条约束很容易自洽，但推演栈是层层依赖的。所以反推出参数后，
**立刻代回正向链路**，确认别的层没被搞坏 —— 这就是规格里
「冲突优先级：硬约束 > 叙事锚点 > 软约束」的落地。

### 可反推的锚点（4 个）

| 锚点 | 地球参数下当前上限 |
|---|---|
| 陆生生物最大高度 | 25.0 m |
| 飞行生物最大质量 | 249.7 kg |
| 建筑高度上限 | 4902.9 m |
| 山峰高度上限 | 8987.5 m |

## 二、七张表持久化

```jsonc
{"operation":"derivation","derivation":"archive"}
```

落盘到 `<工作区>.derivation.json`，包含规格要求的七张表：

| 表 | 字段 |
|---|---|
| 项目卡 | `projectCard`（类型/范围/观测者/不推演什么） |
| 变更清单 | `changeList`（参数、原值、新值、处理方式） |
| 接口卡 | `interfaceCards`（13 条：层/变量/值/单位/判定） |
| 约束表 | `constraints`（hard / soft / narrative） |
| 敏感性表 | `sensitivity` |
| 叙事锚点表 | `anchors`（锚点、目标值、反推窗口、冲突） |
| 版本记录 | `versions` |

**工作区隔离**（实测）：A 区 1 版、B 区 2 版，互不影响。

## 三、版本记录与对比

```jsonc
{"operation":"derivation","derivation":"history"}
{"operation":"derivation","derivation":"compare","compareFrom":"v1"}
```

实测对比（地球参数 v1 → 参数减半 v2）：

```
v1 → v2 共 5 处差异
· P2/材料强度密度比：5.513e+5 → 2.757e+5
· P3/骨骼强度体重比：4.993 → 9.986      （重力减半，骨比翻倍）
· P3/身高大气标高比：0.0002024 → 0.0001012
· P3/反应时间重力比：0.3398 → 0.4805
· P4/大气逃逸率：17.73 → 12.54
```

这正是作者需要的：「我把重力调低后，哪些结论变了」。

## 四、修掉一个自相矛盾的显示

反推出参数后跑正向链路，P3 显示失败，但总结论写「全链路通过」。
原因是：失败标记用的是 `allAllowed`（含边缘项），而结论只看「有没有禁止项」。

修正为三态：

| 标记 | 含义 |
|---|---|
| OK | 全部允许 |
| 边缘 | 有边缘项（可接受） |
| 禁止 | 有禁止项（必须改） |

## 五、用法汇总

```jsonc
{"operation":"derivation","derivation":"anchors"}
{"operation":"derivation","derivation":"backSolve","anchor":"creatureHeight","anchorValue":50}
{"operation":"derivation","derivation":"archive"}
{"operation":"derivation","derivation":"archive","world":{"planetMass":0.5}}
{"operation":"derivation","derivation":"history"}
{"operation":"derivation","derivation":"compare","compareFrom":"v1"}
```

## 六、验证

```
47 套 / 1945 项全绿（新增 anchor.mjs 30 项）
50 米巨兽 → 重力 <= 0.5g、质量 <= 0.5 地球质量
200 米 → 重力 <= 0.125g（比例正确）
七张表字段齐全、工作区隔离、版本对比捕捉到 5 处差异
```
