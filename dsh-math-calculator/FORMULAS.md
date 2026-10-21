# 公式库完整清单

> 共 **342** 条，**51** 个分类。由 `node test/formulas-list.mjs` 从代码导出。

调用方式：`{ "operation": "formula", "formula": "<id>", "overrides": {...} }`

**所有参数都可被 `overrides` 覆盖**，这是架空世界改造的基础。

## 规则层级（离最底层规则的远近）

| 层级 | 含义 | 条数 |
|---|---|---|
| 基本规则（fundamental） | 守恒律、相对论、量子、热力学定律——自然律本身 | 26 |
| 导出规律（derived） | 由基本规则推出、有闭合形式的经典关系 | 156 |
| 经验规律（phenomenological） | 带实验拟合系数，量级可信、具体数字有误差 | 41 |
| 工程换算（engineering） | 几何、配比、剂量、补给——由定义与算术决定 | 82 |
| 社会约定（conventional） | 货币、制度、统计口径——由人类约定而非自然律 | 37 |

## 学科领域（多标签）

| 领域 | 条数 |
|---|---|
| 物理（physics） | 191 |
| 化学（chemistry） | 10 |
| 生物（biology） | 54 |
| 材料（materials） | 27 |
| 地球（earth） | 12 |
| 天文（astronomy） | 27 |
| 工程（engineering） | 48 |
| 军事（military） | 14 |
| 农业（agriculture） | 16 |
| 医学（medicine） | 18 |
| 经济（economics） | 16 |
| 社会（social） | 20 |
| 数学（math） | 14 |

> 注意：`cat` 只是旧的路径字段；分类请用「规则层级 + 学科领域」。
> `frequency` 指**主角视角**感知频率，不是世界观推导常用度。

## 目录

- [biology/ecology](#biologyecology) — 6 条
- [biology/physiology](#biologyphysiology) — 18 条
- [chemistry/acid](#chemistryacid) — 1 条
- [chemistry/electro](#chemistryelectro) — 1 条
- [chemistry/kinetics](#chemistrykinetics) — 2 条
- [chemistry/mole](#chemistrymole) — 2 条
- [chemistry/solution](#chemistrysolution) — 3 条
- [chemistry/thermo](#chemistrythermo) — 1 条
- [econ/finance](#econfinance) — 7 条
- [econ/growth](#econgrowth) — 2 条
- [econ/io](#econio) — 1 条
- [econ/macro](#econmacro) — 2 条
- [econ/micro](#econmicro) — 2 条
- [econ/production](#econproduction) — 1 条
- [econ/utility](#econutility) — 1 条
- [materials/structures](#materialsstructures) — 11 条
- [math/geometry](#mathgeometry) — 7 条
- [math/growth](#mathgrowth) — 3 条
- [math/scales](#mathscales) — 2 条
- [math/series](#mathseries) — 2 条
- [military/combat](#militarycombat) — 14 条
- [perception/agriculture](#perceptionagriculture) — 16 条
- [perception/architecture](#perceptionarchitecture) — 16 条
- [perception/celestial](#perceptioncelestial) — 15 条
- [perception/climate](#perceptionclimate) — 5 条
- [perception/horizon](#perceptionhorizon) — 5 条
- [perception/senses](#perceptionsenses) — 14 条
- [perception/technology](#perceptiontechnology) — 4 条
- [perception/travel](#perceptiontravel) — 12 条
- [perception/weather](#perceptionweather) — 7 条
- [physics/astronomy](#physicsastronomy) — 12 条
- [physics/em](#physicsem) — 22 条
- [physics/fluid](#physicsfluid) — 4 条
- [physics/gravity](#physicsgravity) — 8 条
- [physics/mechanics](#physicsmechanics) — 45 条
- [physics/nuclear](#physicsnuclear) — 4 条
- [physics/optics](#physicsoptics) — 7 条
- [physics/quantum](#physicsquantum) — 3 条
- [physics/relativity](#physicsrelativity) — 5 条
- [physics/scaling](#physicsscaling) — 5 条
- [physics/thermo](#physicsthermo) — 16 条
- [physics/waves](#physicswaves) — 8 条
- [social/demography](#socialdemography) — 2 条
- [social/development](#socialdevelopment) — 1 条
- [social/ecology](#socialecology) — 2 条
- [social/economics](#socialeconomics) — 1 条
- [social/epidemiology](#socialepidemiology) — 3 条
- [social/inequality](#socialinequality) — 3 条
- [social/information](#socialinformation) — 2 条
- [social/politics](#socialpolitics) — 5 条
- [social/urban](#socialurban) — 1 条

## biology/ecology

### population_growth_rate

**内禀增长率** · 层级 phenomenological · 领域 生物 · 主角频率 medium · 单位 1/年

```
birth - death
```

必填：`birth` (出生率 1/年)、`death` (死亡率 1/年)

r = b - d。

### generation_time

**倍增时间（由增长率）** · 层级 phenomenological · 领域 生物 · 主角频率 medium · 单位 年

```
ln2 / r
```

必填：`r` (增长率 1/年)
可选：`ln2`=0.6931471805599453 (ln2)

种群翻倍所需时间。

### carrying_capacity_time

**逻辑斯蒂达 90% 容量所需时间** · 层级 phenomenological · 领域 生物 · 主角频率 medium · 单位 时间

```
log(9 * (K / N0 - 1)) / r
```

必填：`K` (环境容量)、`N0` (初始种群)、`r` (增长率)

解 N(t)=0.9K 得 t。文明扩张推演。

### predator_prey_ratio

**捕食者-猎物平衡比** · 层级 phenomenological · 领域 生物 · 主角频率 medium

```
alpha / beta
```

必填：`alpha` (捕食者死亡率)、`beta` (捕食效率)

平衡时猎物/捕食者数量比。

### photosynthesis_rate

**光合作用效率上限** · 层级 phenomenological · 领域 生物 · 主角频率 medium · 单位 W/m²

```
P_in * efficiency
```

必填：`P_in` (入射光功率 W/m²)
可选：`efficiency`=0.1 (转化效率 0-1)

生态系统的能量输入。

### trophic_energy

**营养级能量传递** · 层级 phenomenological · 领域 生物 · 主角频率 medium

```
E0 * efficiency^level
```

必填：`E0` (初级生产量)、`level` (营养级 n)
可选：`efficiency`=0.1 (传递效率)

每升一级损失约 90%。支撑食物链长度的估算。

## biology/physiology

### bmr_mifflin

**基础代谢率（Mifflin-St Jeor，男性）** · 层级 phenomenological · 领域 生物、医学 · 主角频率 medium · 单位 kcal/day

```
10 * m + 6.25 * h - 5 * age + 5
```

必填：`m` (体重 kg)、`h` (身高 cm)、`age` (年龄 岁)

经验公式。异星生物的系数可全部覆盖。

### body_surface_area

**体表面积（Du Bois）** · 层级 phenomenological · 领域 生物、医学 · 主角频率 medium · 单位 m²

```
0.007184 * m^0.425 * h^0.725
```

必填：`m` (体重 kg)、`h` (身高 cm)

BSA，用于散热/给药推演。

### heat_dissipation

**代谢产热（与散热的平衡点）** · 层级 phenomenological · 领域 生物、医学 · 主角频率 medium · 单位 W

```
sigma * emissivity * A * T^4
```

必填：`A` (体表面积 m²)、`T` (体温 K)
可选：`sigma`=5.670374419e-8 (斯特藩常数)、`emissivity`=0.98 (皮肤发射率)

辐射散热。巨兽能否散热的关键。

### lifespan_scaling

**寿命异速生长** · 层级 phenomenological · 领域 生物、医学 · 主角频率 medium · 单位 年

```
L0 * (m / m0)^b
```

必填：`L0` (基准寿命 年)、`m0` (基准质量 kg)、`m` (目标质量 kg)
可选：`b`=0.25 (标度指数)

寿命 ∝ 质量^b。架空生物可改 b。

### human_body_surface_area

**人体表面积（Du Bois）** · 层级 phenomenological · 领域 生物、医学 · 主角频率 high · 单位 m^2

```
0.007184 * W^0.425 * H^0.725
```

必填：`W` (体重 kg)、`H` (身高 cm)

Du Bois 经验公式；用药剂量、散热、烫伤面积都按体表面积算。

### basal_metabolic_rate

**基础代谢率（Kleiber）** · 层级 phenomenological · 领域 生物、医学 · 主角频率 high · 单位 kcal/日

```
70 * W^0.75
```

必填：`W` (体重 kg)

Kleiber 经验式；生物代谢随体重 3/4 次幂缩放，跨物种都近似成立。

### daily_water_need

**每日需水量（经验）** · 层级 phenomenological · 领域 生物、医学 · 主角频率 high · 单位 ml/日

```
35 * W
```

必填：`W` (体重 kg)

经验值 35 ml/kg/日（含食物水分）；高温或重体力要上调。

### widmark_bac

**血液酒精浓度（Widmark）** · 层级 phenomenological · 领域 生物、医学 · 主角频率 medium · 单位 g/L

```
A * 100 / (W * r) - 0.015 * t
```

必填：`A` (摄入纯酒精质量 g)、`W` (体重 kg)、`t` (自饮酒起小时数 h)
可选：`r`=0.68 (分布系数（男≈0.68，女≈0.55）)

Widmark 经验公式；代谢项 0.015 g/L/h。只作量级参考，个体差异大。

### allometric_dose_scale

**跨物种剂量换算** · 层级 phenomenological · 领域 生物、医学 · 主角频率 medium · 单位 mg/kg

```
D_human * (W_human / W_animal)^0.75
```

必填：`D_human` (人体剂量 mg/kg)、`W_human` (人体质量 kg)、`W_animal` (动物质量 kg)

异速缩放（经验）；兽药/毒理从人推到动物、或反向推的常用近似。

### drug_dose_by_weight

**按体重给药** · 层级 engineering · 领域 生物、医学 · 主角频率 high · 单位 mg

```
dose_per_kg * weight
```

必填：`dose_per_kg` (每公斤剂量 mg/kg)、`weight` (体重 kg)

最常用的给药换算；儿童、瘦弱者必须按体重而不是按成人剂量照搬。

### clark_child_dose

**儿童剂量（Clark 法则）** · 层级 phenomenological · 领域 生物、医学 · 主角频率 medium · 单位 mg

```
adult_dose * weight / 70
```

必填：`adult_dose` (成人剂量 mg)、`weight` (儿童体重 kg)

Clark 经验法则；比按体重线性换算更保守，但仍有争议，量级参考。

### blood_volume_estimate

**血量估算** · 层级 phenomenological · 领域 生物、医学 · 主角频率 high · 单位 ml

```
70 * weight
```

必填：`weight` (体重 kg)

成人约 70 ml/kg；失血超过 30% 即有生命危险，这是"伤员能撑多久"的算术。

### fluid_deficit

**脱水缺口** · 层级 engineering · 领域 生物、医学 · 主角频率 high · 单位 ml

```
weight * deficit_percent / 100 * 1000
```

必填：`weight` (体重 kg)、`deficit_percent` (脱水占体重百分比 %)

体重每降 1% 约失水 10 ml/kg；5% 已明显虚弱，10% 危及生命。

### infusion_rate

**输液速率** · 层级 engineering · 领域 生物、医学 · 主角频率 medium · 单位 ml/h

```
volume_ml / hours
```

必填：`volume_ml` (液体总量 ml)、`hours` (计划输完小时数)

输液泵/滴速换算的基准；成人常用 20 滴/ml 的输液器。

### max_heart_rate

**最大心率（估算）** · 层级 phenomenological · 领域 生物、医学 · 主角频率 medium · 单位 bpm

```
220 - age
```

必填：`age` (年龄 岁)

Fox 经验公式；个体差异可达 ±10–12 bpm，只作量级参考。

### pregnancy_days_remaining

**孕期剩余天数（Naegele）** · 层级 phenomenological · 领域 生物、医学 · 主角频率 medium · 单位 天

```
280 - days_since_lmp
```

必填：`days_since_lmp` (末次月经至今的天数)

Naegele 法则：280 天（40 周）为预产期；只是估算，实际波动 ±2 周。

### fever_energy_cost

**发热额外耗能** · 层级 phenomenological · 领域 生物、医学 · 主角频率 medium · 单位 kcal/日

```
base_kcal * 0.13 * fever_delta
```

必填：`base_kcal` (基础代谢 kcal/日)、`fever_delta` (体温升高 °C)

经验：体温每升 1°C，代谢率约增 13%；持续高热会迅速耗尽体力。

### ld50_dose

**半数致死剂量** · 层级 engineering · 领域 生物、医学 · 主角频率 low · 单位 mg

```
ld50_per_kg * weight
```

必填：`ld50_per_kg` (LD50 mg/kg)、`weight` (体重 kg)

把 LD50 换算成具体体重下的剂量；毒理量级判断用，个体差异很大。

## chemistry/acid

### ph_from_pka

**缓冲液 pH（Henderson-Hasselbalch）** · 层级 phenomenological · 领域 化学 · 主角频率 medium

```
pKa + log(base / acid, 10)
```

必填：`pKa` (pKa)、`base` (共轭碱浓度)、`acid` (酸浓度)

pH = pKa + log([A⁻]/[HA])。

## chemistry/electro

### nernst

**能斯特方程** · 层级 phenomenological · 领域 化学 · 主角频率 medium · 单位 V

```
E0 - R * T / (n * F) * log(Q, 10)
```

必填：`E0` (标准电势 V)、`n` (电子数)、`Q` (反应商)
可选：`T`=298.15 (温度 K)、`R`=8.314462618 (气体常数)、`F`=96485.33212 (法拉第常数)

E = E₀ - (RT/nF)lnQ。

## chemistry/kinetics

### arrhenius

**阿伦尼乌斯速率常数** · 层级 phenomenological · 领域 化学 · 主角频率 medium · 单位 1/s

```
A * exp(-Ea / (R * T))
```

必填：`A` (指前因子)、`Ea` (活化能 J/mol)、`T` (温度 K)
可选：`R`=8.314462618 (气体常数)

k = Ae^(-Ea/RT)。反应速率对温度的敏感性。

### half_life_first_order

**一级反应半衰期** · 层级 phenomenological · 领域 化学 · 主角频率 medium · 单位 s

```
ln2 / k
```

必填：`k` (速率常数 1/s)
可选：`ln2`=0.6931471805599453 (ln2)

t½ = ln2/k。与初始浓度无关。

## chemistry/mole

### avogadro_molecules

**分子数** · 层级 derived · 领域 化学 · 主角频率 medium · 单位 个

```
n * NA
```

必填：`n` (物质的量 mol)
可选：`NA`=6.02214076e+23 (阿伏伽德罗常数)

N = nN_A。

### molar_mass_density

**由密度算摩尔体积** · 层级 derived · 领域 化学 · 主角频率 medium · 单位 cm³/mol

```
M / rho
```

必填：`M` (摩尔质量 g/mol)、`rho` (密度 g/cm³)

V_m = M/ρ。

## chemistry/solution

### molarity

**摩尔浓度** · 层级 derived · 领域 化学 · 主角频率 medium · 单位 mol/L

```
n / V
```

必填：`n` (物质的量 mol)、`V` (体积 L)

c = n/V。

### dilution

**稀释公式** · 层级 derived · 领域 化学 · 主角频率 medium · 单位 L

```
C1 * V1 / C2
```

必填：`C1` (原浓度)、`V1` (原体积)、`C2` (目标浓度)

C₁V₁ = C₂V₂，求所需体积。

### ideal_solution_vapor

**拉乌尔定律（蒸气压）** · 层级 derived · 领域 化学 · 主角频率 medium · 单位 Pa

```
x_solvent * P0
```

必填：`x_solvent` (溶剂摩尔分数)、`P0` (纯溶剂蒸气压 Pa)

P = x·P₀。

## chemistry/thermo

### gibbs_free_energy

**吉布斯自由能变** · 层级 derived · 领域 化学 · 主角频率 medium · 单位 J

```
dH - T * dS
```

必填：`dH` (焓变 J)、`T` (温度 K)、`dS` (熵变 J/K)

ΔG = ΔH - TΔS。ΔG<0 反应自发。

## econ/finance

### compound_interest

**复利终值** · 层级 conventional · 领域 经济 · 主角频率 low

```
P * (1 + r / n)^(n * t)
```

必填：`P` (本金)、`r` (年利率)、`t` (年数)
可选：`n`=1 (每年计息次数)

A = P(1+r/n)^(nt)。n=1 为年复利，n=12 为月复利。

### continuous_compounding

**连续复利终值** · 层级 conventional · 领域 经济 · 主角频率 low

```
P * exp(r * t)
```

必填：`P` (本金)、`r` (年利率)、`t` (年数)

A = Pe^(rt)。

### present_value

**现值** · 层级 conventional · 领域 经济 · 主角频率 low

```
FV / (1 + r)^t
```

必填：`FV` (未来值)、`r` (贴现率)、`t` (年数)

PV = FV/(1+r)^t。

### annuity_pv

**年金现值** · 层级 conventional · 领域 经济 · 主角频率 low

```
PMT * (1 - (1 + r)^(-t)) / r
```

必填：`PMT` (每期支付)、`r` (每期利率)、`t` (期数)

PV = PMT·(1-(1+r)^-t)/r。

### cagr

**复合年均增长率 CAGR** · 层级 conventional · 领域 经济 · 主角频率 low

```
(finalValue / startValue)^(1 / t) - 1
```

必填：`startValue` (起始值)、`finalValue` (终值)、`t` (年数)

CAGR = (终/始)^(1/t) - 1。

### inflation_adjust

**通胀换算（实际购买力）** · 层级 conventional · 领域 经济 · 主角频率 low

```
amount / (1 + rate)^t
```

必填：`amount` (名义金额)、`rate` (年通胀率)、`t` (年数)

未来同等购买力折算到今天的金额。

### roi

**投资回报率** · 层级 conventional · 领域 经济 · 主角频率 low

```
(gain - cost) / cost
```

必填：`gain` (收益)、`cost` (成本)

ROI = (收益-成本)/成本。

## econ/growth

### solow_steady_state

**索洛模型稳态资本** · 层级 conventional · 领域 经济 · 主角频率 medium

```
(s * A / (delta + n + gx))^(1 / (1 - alpha))
```

必填：`s` (储蓄率)、`A` (技术水平)、`delta` (折旧率)、`n` (人口增长率)
可选：`gx`=0 (技术进步率)、`alpha`=0.3 (资本份额 α)

稳态人均资本 k* = (sA/(δ+n+g))^(1/(1-α))。

### harrod_domar

**哈罗德-多马增长率** · 层级 conventional · 领域 经济 · 主角频率 medium

```
s / v
```

必填：`s` (储蓄率)、`v` (资本产出比)

g = s/v。

## econ/io

### leontief_inverse

**列昂惕夫逆矩阵（完全消耗）** · 层级 conventional · 领域 经济 · 主角频率 low

```
inv([[1 - A11, -A12], [-A21, 1 - A22]])
```

可选：`A11`=0.2 (部门1→1 直接消耗系数)、`A12`=0.1 (部门1→2)、`A21`=0.15 (部门2→1)、`A22`=0.25 (部门2→2)

(I-A)⁻¹ 的两部门形式。多部门请用 operation="matrix" 直接写表达式。

## econ/macro

### money_multiplier

**货币乘数** · 层级 conventional · 领域 经济 · 主角频率 low

```
1 / reserve
```

必填：`reserve` (准备金率)

基础货币扩张倍数。

### gdp_growth

**GDP 增长率** · 层级 conventional · 领域 经济 · 主角频率 low

```
(gdp1 - gdp0) / gdp0
```

必填：`gdp0` (基期 GDP)、`gdp1` (报告期 GDP)

(新-旧)/旧。

## econ/micro

### break_even

**盈亏平衡产量** · 层级 conventional · 领域 经济 · 主角频率 medium

```
FC / (price - VC)
```

必填：`FC` (固定成本)、`price` (单价)、`VC` (单位变动成本)

Q = FC/(P-VC)。

### price_elasticity

**需求价格弹性（点弹性）** · 层级 conventional · 领域 经济 · 主角频率 medium

```
(dQ / Q) / (dP / P)
```

必填：`dQ` (需求量变化)、`Q` (原需求量)、`dP` (价格变化)、`P` (原价格)

|E|>1 富有弹性。

## econ/production

### cobb_douglas

**柯布-道格拉斯生产函数** · 层级 conventional · 领域 经济 · 主角频率 medium

```
A * K^alpha * L^beta
```

必填：`K` (资本)、`L` (劳动)
可选：`A`=1 (全要素生产率)、`alpha`=0.3 (资本弹性 α)、`beta`=0.7 (劳动弹性 β)

Y = A·Kᵅ·Lᵝ。α+β=1 为规模报酬不变。

## econ/utility

### utility_crra

**CRRA 效用函数** · 层级 conventional · 领域 经济 · 主角频率 low

```
c^(1 - gamma) / (1 - gamma)
```

必填：`c` (消费)、`gamma` (相对风险厌恶系数 γ ≠ 1)

常数相对风险厌恶效用，γ=1 时退化为 ln c。

## materials/structures

### buckling_euler

**欧拉屈曲临界载荷** · 层级 derived · 领域 材料、工程 · 主角频率 high · 单位 N

```
pi^2 * E * I / (K * L)^2
```

必填：`E` (弹性模量 Pa)、`I` (截面惯性矩 m^4)、`L` (柱长 m)
可选：`K`=1 (长度系数（两端铰支=1，一端固定=0.7）)

细长柱失稳的临界压力 P_cr = π²EI/(KL)²；超过它柱子会突然弯折，不是压碎。

### hoop_stress

**薄壁圆筒环向应力** · 层级 derived · 领域 材料、工程 · 主角频率 high · 单位 Pa

```
p * r / t
```

必填：`p` (内压 Pa)、`r` (半径 m)、`t` (壁厚 m)

锅炉/管道/压力容器的环向应力 σ = pr/t；判断会不会炸开看它是否超过屈服强度。

### thermal_stress

**热应力** · 层级 derived · 领域 材料、工程 · 主角频率 high · 单位 Pa

```
E * alpha * dT
```

必填：`E` (弹性模量 Pa)、`alpha` (热膨胀系数 1/K)、`dT` (温差 K)

约束状态下温度变化产生的应力 σ = EαΔT；玻璃杯骤冷骤裂就是这个。

### beam_center_deflection

**简支梁跨中挠度** · 层级 derived · 领域 材料、工程 · 主角频率 high · 单位 m

```
F * L^3 / (48 * E * I)
```

必填：`F` (集中载荷 N)、`L` (跨度 m)、`E` (弹性模量 Pa)、`I` (惯性矩 m^4)

简支梁跨中集中力的下挠量；判断楼板/桥面「软不软」用它。

### beam_center_moment

**简支梁跨中弯矩** · 层级 derived · 领域 材料、工程 · 主角频率 high · 单位 N·m

```
F * L / 4
```

必填：`F` (集中载荷 N)、`L` (跨度 m)

跨中集中力的最大弯矩；与截面模量配合可判断是否屈服。

### wood_beam_moment_capacity

**矩形木梁抗弯承载力** · 层级 derived · 领域 材料、工程 · 主角频率 high · 单位 N·m

```
sigma_b * b * h^2 / 6
```

必填：`sigma_b` (抗弯强度 Pa)、`b` (宽度 m)、`h` (高度 m)

矩形截面可承受的最大弯矩；木材顺纹强度远高于横纹，取值时注意方向。

### column_axial_capacity

**短柱轴压承载力** · 层级 derived · 领域 材料、工程 · 主角频率 high · 单位 N

```
sigma_y * A
```

必填：`sigma_y` (屈服强度 Pa)、`A` (截面积 m^2)

短粗柱的压溃载荷；细长柱要改用 buckling_euler（先屈曲不是先压碎）。

### arch_thrust

**三铰拱水平推力** · 层级 derived · 领域 材料、工程 · 主角频率 medium · 单位 N

```
W * L / (8 * h)
```

必填：`W` (总竖向载荷 N)、`L` (跨度 m)、`h` (矢高 m)

三铰拱在均布载荷下的水平推力；拱越扁推力越大，桥台要更厚。

### hardness_to_yield

**硬度估屈服强度** · 层级 phenomenological · 领域 材料、工程 · 主角频率 medium · 单位 Pa

```
3 * H * 9.80665e6
```

必填：`H` (布氏硬度 HB)

经验关系 σy ≈ 3HB（量级估算，误差可达 30%）。

### fatigue_life_basquin

**疲劳寿命（Basquin）** · 层级 phenomenological · 领域 材料、工程 · 主角频率 medium · 单位 次

```
(sigma_f / sigma_a)^(1 / b)
```

必填：`sigma_f` (疲劳强度系数 Pa)、`sigma_a` (应力幅 Pa)
可选：`b`=-0.1 (疲劳指数（-0.05~-0.15）)

反复受力多久会断的 S-N 经验式；金属构件在交变载荷下的寿命量级估算。

### corrosion_rate_weightloss

**腐蚀速率（失重法）** · 层级 phenomenological · 领域 材料、工程 · 主角频率 medium · 单位 mm/yr

```
87.6 * W / (A * rho * t)
```

必填：`W` (失重 g)、`A` (暴露面积 cm^2)、`rho` (材料密度 g/cm^3)、`t` (暴露时间 h)

由失重换算年腐蚀深度；经验公式，实际速率随环境大幅变化。

## math/geometry

### circle_area

**圆面积** · 层级 fundamental · 领域 数学 · 主角频率 medium

```
pi * r^2
```

必填：`r` (半径)

S = πr²。

### sphere_volume

**球体积** · 层级 fundamental · 领域 数学 · 主角频率 medium

```
4 / 3 * pi * r^3
```

必填：`r` (半径)

V = 4πr³/3。

### sphere_area

**球表面积** · 层级 fundamental · 领域 数学 · 主角频率 medium

```
4 * pi * r^2
```

必填：`r` (半径)

S = 4πr²。

### cylinder_volume

**圆柱体积** · 层级 fundamental · 领域 数学 · 主角频率 medium

```
pi * r^2 * h
```

必填：`r` (半径)、`h` (高)

V = πr²h。

### cone_volume

**圆锥体积** · 层级 fundamental · 领域 数学 · 主角频率 medium

```
pi * r^2 * h / 3
```

必填：`r` (半径)、`h` (高)

V = πr²h/3。

### heron_area

**海伦公式（三角形面积）** · 层级 fundamental · 领域 数学 · 主角频率 medium

```
sqrt(p * (p - a) * (p - b) * (p - c))
```

必填：`a` (边 a)、`b` (边 b)、`c` (边 c)、`p` (半周长 (a+b+c)/2)

S = √(p(p-a)(p-b)(p-c))。

### pythagoras

**勾股定理（求斜边）** · 层级 fundamental · 领域 数学 · 主角频率 medium

```
sqrt(a^2 + b^2)
```

必填：`a` (直角边 a)、`b` (直角边 b)

c = √(a²+b²)。

## math/growth

### exponential_growth

**指数增长** · 层级 fundamental · 领域 数学 · 主角频率 medium

```
N0 * exp(r * t)
```

必填：`N0` (初始量)、`r` (增长率 1/时间)、`t` (时间)

N = N₀e^(rt)。

### doubling_time

**倍增时间** · 层级 fundamental · 领域 数学 · 主角频率 medium · 单位 时间

```
log(2) / r
```

必填：`r` (增长率 1/时间)

t = ln2/r（即 70/百分比 的精确版）。

### logistic_growth

**逻辑斯蒂增长（t 时刻）** · 层级 fundamental · 领域 数学 · 主角频率 medium

```
K / (1 + ((K - N0) / N0) * exp(-r * t))
```

必填：`K` (环境容量 K)、`N0` (初始量)、`r` (内禀增长率)、`t` (时间)

N(t) = K/(1+((K-N₀)/N₀)e^(-rt))。人口/资源上限推演核心公式。

## math/scales

### richter

**里氏震级（能量比）** · 层级 fundamental · 领域 数学 · 主角频率 medium · 单位 倍数

```
10^(1.5 * dM)
```

必填：`dM` (震级差)

震级每增 1，能量约增 31.6 倍。

### ph

**pH 值** · 层级 fundamental · 领域 数学 · 主角频率 medium

```
-log(H) / log(10)
```

必填：`H` (氢离子浓度 mol/L)

pH = -log₁₀[H⁺]。

## math/series

### arithmetic_sum

**等差数列求和** · 层级 fundamental · 领域 数学 · 主角频率 medium

```
n * (a1 + an) / 2
```

必填：`n` (项数)、`a1` (首项)、`an` (末项)

S = n(a₁+aₙ)/2。

### geometric_sum

**等比数列求和** · 层级 fundamental · 领域 数学 · 主角频率 medium

```
a1 * (1 - r^n) / (1 - r)
```

必填：`a1` (首项)、`r` (公比)、`n` (项数)

S = a₁(1-rⁿ)/(1-r)。

## military/combat

### lanchester_linear

**兰彻斯特线性律（古战/近战）** · 层级 engineering · 领域 军事、物理 · 主角频率 high

```
sqrt(N0^2 - (b / a) * M0^2)
```

必填：`N0` (我方初始兵力)、`M0` (敌方初始兵力)
可选：`a`=1 (我方效率)、`b`=1 (敌方效率)

逐个交战模型，优势线性累积。结果为我方剩余兵力。

### lanchester_square

**兰彻斯特平方律（远程火力）** · 层级 engineering · 领域 军事、物理 · 主角频率 high

```
sqrt(N0^2 - (b / a) * M0^2)
```

必填：`N0` (我方初始兵力)、`M0` (敌方初始兵力)
可选：`a`=1 (我方效率)、`b`=1 (敌方效率)

集中火力模型，平方优势。兵力比 2:1 时损失约 1:4。

### force_ratio_required

**进攻所需兵力比（3:1 法则）** · 层级 engineering · 领域 军事、物理 · 主角频率 high

```
defender * ratio
```

必填：`defender` (防御方兵力)
可选：`ratio`=3 (所需倍数（经典 3:1）)

进攻方需要的兵力优势。架空战术可改 ratio。

### attrition_rate

**累计损耗率** · 层级 engineering · 领域 军事、物理 · 主角频率 high

```
1 - (1 - per_round)^rounds
```

必填：`per_round` (每轮损耗率)、`rounds` (轮数)

累计损耗。后勤/消耗战推演。

### projectile_energy

**弹丸动能** · 层级 engineering · 领域 军事、物理 · 主角频率 high · 单位 J

```
0.5 * m * v^2
```

必填：`m` (弹丸质量 kg)、`v` (初速度 m/s)

动能，与穿甲能力相关。

### penetration_estimate

**穿深估算（简化）** · 层级 engineering · 领域 军事、物理 · 主角频率 high · 单位 m

```
E / (k * A)
```

必填：`E` (弹丸动能 J)、`A` (着弹面积 m²)
可选：`k`=1000000000 (材料阻力系数)

极简模型，仅用于相对比较。

### blast_radius

**爆炸冲击波半径（立方根律）** · 层级 engineering · 领域 军事、物理 · 主角频率 high · 单位 m

```
k * E^(1/3)
```

必填：`E` (爆炸能量 J)
可选：`k`=0.1 (经验系数)

R ∝ E^(1/3)。当量翻倍半径只增 26%。

### oxygen_depletion

**密闭空间耗氧时间** · 层级 engineering · 领域 军事、物理 · 主角频率 high · 单位 min

```
V * 0.21 / (n * consumption)
```

必填：`V` (空间体积 m³)、`n` (人数)
可选：`consumption`=0.0003 (人均耗氧 m³/min)

围城/密闭推演。

### ram_momentum

**撞锤动量** · 层级 derived · 领域 军事、物理 · 主角频率 high · 单位 N·s

```
m * v
```

必填：`m` (撞锤质量 kg)、`v` (撞击速度 m/s)

破门看的是动量与冲量；同样的能量，重而慢比轻而快更容易把门撞开。

### trebuchet_range_estimate

**配重投石机射程（估算）** · 层级 phenomenological · 领域 军事、物理 · 主角频率 high · 单位 m

```
2 * eff * E / (m * g)
```

必填：`E` (配重势能 J)、`m` (弹丸质量 kg)
可选：`eff`=0.5 (能量转化效率（经验 0.3–0.6）)、`g`=9.80665 (重力加速度 m/s^2)

由能量守恒估算的 45° 射程；经验效率修正，实际受结构强度与空气阻力限制。

### wall_breach_energy

**破墙所需能量** · 层级 phenomenological · 领域 军事、物理 · 主角频率 medium · 单位 J

```
toughness * area * thickness
```

必填：`toughness` (墙体破坏能密度 J/m^3（经验）)、`area` (破口面积 m^2)、`thickness` (墙厚 m)

把墙打穿所需的最小能量；toughness 只能按经验取值，量级判断用。

### formation_frontage

**阵型正面宽度** · 层级 engineering · 领域 军事、物理 · 主角频率 high · 单位 m

```
troops * spacing / ranks
```

必填：`troops` (总人数)、`spacing` (士兵间距 m)、`ranks` (排数)

阵线有多宽；正面太宽两翼薄弱，太窄容易被包抄。

### army_supply_days

**军队补给可支撑天数** · 层级 engineering · 领域 军事、物理 · 主角频率 high · 单位 日

```
stores / (troops * daily_ration)
```

必填：`stores` (存粮 kg)、`troops` (人数)、`daily_ration` (人均日耗 kg)

古代军队每天人均 1–2 kg 粮；这是"粮尽而退"的算术。

### march_days

**行军天数** · 层级 engineering · 领域 军事、物理 · 主角频率 high · 单位 日

```
distance / (speed * hours_per_day)
```

必填：`distance` (距离 km)、`speed` (行军速度 km/h)、`hours_per_day` (每日行军小时)

步兵常行军约 4 km/h、每日 8 小时；骑兵可翻倍但马匹需要休整。

## perception/agriculture

### crop_yield_area

**所需耕地面积** · 层级 engineering · 领域 农业、生物 · 主角频率 high · 单位 m²

```
people * kcal_per_day * 365 / (yield_per_m2 * kcal_per_kg)
```

必填：`people` (供养人口)、`yield_per_m2` (每平方米年产量 kg)
可选：`kcal_per_day`=2200 (每人每日热量 kcal)、`kcal_per_kg`=3500 (每公斤热量 kcal)

养活一座城需要多大农田。农业文明的承载上限。

### food_surplus_ratio

**农业剩余率（供养非农人口）** · 层级 engineering · 领域 农业、生物 · 主角频率 high

```
(yield - consumed) / yield
```

必填：`yield` (总产量)、`consumed` (农民自身消耗)

剩余率决定能养多少工匠/士兵/祭司。这是城市化的基本原理。

### population_density_limit

**土地承载力** · 层级 engineering · 领域 农业、生物 · 主角频率 high · 单位 人

```
area * yield_per_m2 / (kcal_per_day * 365)
```

必填：`area` (面积 m²)、`yield_per_m2` (每平方米年产 kg)
可选：`kcal_per_day`=2200 (人均日热量)

一块地最多养活多少人。

### irrigation_water_need

**灌溉需水量** · 层级 engineering · 领域 农业、生物 · 主角频率 high · 单位 m³

```
area * depth
```

必填：`area` (灌溉面积 m²)、`depth` (灌溉深度 m（水稻约 0.1）)

农业用水。河流改道、水利工程的动机。

### river_discharge

**河流流量** · 层级 engineering · 领域 农业、生物 · 主角频率 high · 单位 m³/s

```
width * depth * velocity
```

必填：`width` (河宽 m)、`depth` (水深 m)、`velocity` (流速 m/s)

河有多大。航运能力、渡河难度、洪水规模。

### growing_degree_days

**生长度日** · 层级 engineering · 领域 农业、生物 · 主角频率 high · 单位 °C·日

```
(Tmax + Tmin) / 2 - Tbase
```

必填：`Tmax` (日最高温 °C)、`Tmin` (日最低温 °C)、`Tbase` (作物基点温度 °C)

积温的日值；累计到某个阈值作物才成熟，是农时推算的基础。

### reference_evapotranspiration

**参考蒸散量（简化）** · 层级 phenomenological · 领域 农业、生物 · 主角频率 medium · 单位 mm/日

```
0.408 * Rn + 0.9 * (900 / (T + 273)) * u2 * (es - ea)
```

必填：`Rn` (净辐射 MJ/(m^2·日))、`T` (平均气温 °C)、`u2` (2m 风速 m/s)、`es` (饱和水汽压 kPa)、`ea` (实际水汽压 kPa)

FAO-56 的简化形式（经验），估算作物每天耗水；灌溉设计常用。

### crop_total_yield

**作物总产量** · 层级 engineering · 领域 农业、生物 · 主角频率 high · 单位 kg

```
area_ha * yield_per_ha
```

必填：`area_ha` (面积 公顷)、`yield_per_ha` (单产 kg/公顷)

总产 = 面积 × 单产；古代谷物单产约 500–1500 kg/公顷，现代农业可达 6000+。

### food_energy_supply

**食物总能量** · 层级 engineering · 领域 农业、生物 · 主角频率 high · 单位 J

```
mass_kg * kcal_per_kg * 4184
```

必填：`mass_kg` (食物质量 kg)、`kcal_per_kg` (热量密度 kcal/kg（谷物≈3500）)

食物热量换算成焦耳；1 kcal = 4184 J。

### population_fed

**能养活多少人·日** · 层级 engineering · 领域 农业、生物 · 主角频率 high · 单位 人·日

```
food_kcal / daily_kcal_per_person
```

必填：`food_kcal` (食物总热量 kcal)
可选：`daily_kcal_per_person`=2500 (人均日需 kcal)

这批粮食能支撑多少人吃一天；除以人口就是可支撑天数。

### seed_rate

**播种量估算** · 层级 engineering · 领域 农业、生物 · 主角频率 medium · 单位 kg

```
area_m2 * plants_per_m2 / germination / seeds_per_gram / 1000
```

必填：`area_m2` (播种面积 m^2)、`plants_per_m2` (目标株数 /m^2)、`germination` (发芽率 0–1)、`seeds_per_gram` (每克种子数)

按目标株数与发芽率反推播种量；留 10–20% 余量更稳。

### fertilizer_need

**施肥总量** · 层级 engineering · 领域 农业、生物 · 主角频率 medium · 单位 kg

```
area_ha * rate_kg_per_ha
```

必填：`area_ha` (面积 公顷)、`rate_kg_per_ha` (施肥量 kg/公顷)

总施肥量 = 面积 × 单位面积用量；过量会烧苗并污染水源。

### irrigation_volume

**灌溉水量** · 层级 engineering · 领域 农业、生物 · 主角频率 high · 单位 m^3

```
area_m2 * depth_mm / 1000
```

必填：`area_m2` (灌溉面积 m^2)、`depth_mm` (灌水深度 mm)

1 mm 水深 = 每平方米 1 升；这是水渠与蓄水池设计的基准。

### livestock_feed_need

**牲畜饲料需求** · 层级 engineering · 领域 农业、生物 · 主角频率 high · 单位 kg

```
heads * daily_feed_kg * days
```

必填：`heads` (头数)、`daily_feed_kg` (每头每日 kg)、`days` (天数)

牛每日干草 10–15 kg，羊 2–3 kg；过冬要按最长冬季算。

### pasture_carrying_capacity

**草场载畜量** · 层级 phenomenological · 领域 农业、生物 · 主角频率 medium · 单位 头

```
area_ha * productivity_kg_per_ha / (intake_kg_per_day * days)
```

必填：`area_ha` (草场面积 公顷)、`productivity_kg_per_ha` (年产草量 kg/公顷)、`intake_kg_per_day` (每头日食量 kg)、`days` (放牧天数)

草场能养多少牲畜；经验值，超载会导致草场退化。

### harvest_labor_days

**收割所需工日** · 层级 phenomenological · 领域 农业、生物 · 主角频率 high · 单位 人·日

```
area_ha * labor_days_per_ha
```

必填：`area_ha` (面积 公顷)、`labor_days_per_ha` (每公顷需工日（人工收割约 10–20）)

抢收窗口很短（雨季前），劳力量决定能收多少——这是古代农业的核心约束。

## perception/architecture

### building_height_limit

**建筑高度上限（材料强度）** · 层级 engineering · 领域 工程、材料 · 主角频率 high · 单位 m

```
strength / (rho * g)
```

必填：`strength` (材料抗压强度 Pa)、`rho` (材料密度 kg/m³)
可选：`g`=9.80665 (重力加速度)

材料能撑起的最大高度（等截面）。花岗岩约 2km，钢约 30km。高重力世界建筑更矮。

### tower_footprint

**高塔底部所需占地面积** · 层级 engineering · 领域 工程、材料 · 主角频率 high · 单位 m²

```
W / (sigma_allow * 0.5)
```

必填：`W` (总重量 N)、`sigma_allow` (容许应力 Pa)

塔越高底部越粗。粗野主义巨构的城市轮廓依据。

### wall_thickness

**城墙厚度（抗冲击）** · 层级 engineering · 领域 工程、材料 · 主角频率 high · 单位 m

```
F / (sigma * h)
```

必填：`F` (冲击力 N)、`sigma` (材料强度 Pa)、`h` (墙高 m)

城墙要多厚才能挡得住攻城锤。

### city_population_area

**城市人口与面积** · 层级 engineering · 领域 工程、材料 · 主角频率 high · 单位 m²

```
population * area_per_person
```

必填：`population` (人口)
可选：`area_per_person`=200 (人均占地 m²（古代城市约 100-300）)

城市铺多大。城墙周长、街市规模的估算。

### city_wall_perimeter

**城墙周长（圆形城市）** · 层级 engineering · 领域 工程、材料 · 主角频率 high · 单位 m

```
2 * pi * sqrt(area / pi)
```

必填：`area` (城市面积 m²)

围一圈城墙要修多长。防御成本。

### beacon_chain

**烽火传递时间** · 层级 engineering · 领域 工程、材料 · 主角频率 high · 单位 s

```
(distance / spacing) * relay_time
```

必填：`distance` (总距离 m)、`spacing` (烽火台间距 m)
可选：`relay_time`=60 (每站响应秒数)

消息传递多快。信息传播速度决定政治版图大小——这是历史铁律。

### messenger_network_time

**驿站传信时间** · 层级 engineering · 领域 工程、材料 · 主角频率 high · 单位 小时

```
distance / (speed * 3600) + stops * rest_hours
```

必填：`distance` (距离 km)、`stops` (换马次数)
可选：`speed`=15 (马速 km/h)、`rest_hours`=0.2 (每次换马耗时 小时)

帝国通信的实际延迟。版图上限由此决定。

### floor_area_ratio

**容积率（ FAR ）** · 层级 engineering · 领域 工程、材料 · 主角频率 medium · 单位 无量纲

```
total_floor_area / site_area
```

必填：`total_floor_area` (总建筑面积 m^2)、`site_area` (用地面积 m^2)

容积率 = 总建筑面积 / 用地面积；城市密度最常用的单一指标。

### brick_count

**砖墙用砖量** · 层级 engineering · 领域 工程、材料 · 主角频率 high · 单位 块

```
area * thickness * mortar_factor / (brick_l * brick_w * brick_h)
```

必填：`area` (墙面面积 m^2)、`thickness` (墙厚 m)
可选：`brick_l`=0.24 (砖长 m)、`brick_w`=0.115 (砖宽 m)、`brick_h`=0.053 (砖高 m)、`mortar_factor`=1.15 (含砂浆损耗系数（经验 1.1–1.2）)

按体积估算用砖量；砂浆占体积约 10–20%，用 mortar_factor 修正（经验）。

### roof_load

**屋顶总载荷** · 层级 engineering · 领域 工程、材料 · 主角频率 high · 单位 N

```
area * load_per_area
```

必填：`area` (屋顶面积 m^2)、`load_per_area` (面载荷 N/m^2（含雪载/瓦重）)

屋顶承受的总竖向载荷；木梁/柱子按它选截面。

### stair_comfort_rule

**楼梯舒适度（2R+G）** · 层级 conventional · 领域 工程、材料 · 主角频率 medium · 单位 m

```
2 * rise + run
```

必填：`rise` (踏步高 m)、`run` (踏步宽 m)

经验规则 2R+G ≈ 0.60–0.65 m 最省力；太小费劲，太大容易绊倒。

### water_tower_pressure

**水塔静水压** · 层级 derived · 领域 工程、材料 · 主角频率 high · 单位 Pa

```
rho * g * h
```

必填：`h` (水头高度 m)
可选：`rho`=1000 (水的密度 kg/m^3)、`g`=9.80665 (重力加速度 m/s^2)

水塔每高 10 m 约 1 个大气压；供水能否上楼由它决定。

### window_heat_loss

**窗户热损失** · 层级 derived · 领域 工程、材料 · 主角频率 high · 单位 W

```
U * A * dT
```

必填：`U` (传热系数 W/(m^2·K)（单层玻璃≈5.8）)、`A` (窗面积 m^2)、`dT` (室内外温差 K)

冬季取暖负荷的主要来源；双层玻璃 U≈2.8，三层≈1.8。

### lighting_lumen_need

**照明光通量需求** · 层级 engineering · 领域 工程、材料 · 主角频率 medium · 单位 lm

```
area * lux
```

必填：`area` (面积 m^2)、`lux` (照度 lx（居住≈100，阅读≈300）)

房间需要多少流明；蜡烛约 12 lm/W，油灯更低。

### chimney_draft

**烟囱抽力** · 层级 derived · 领域 工程、材料 · 主角频率 high · 单位 Pa

```
rho_out * g * h * (1 - T_out / T_in)
```

必填：`h` (烟囱高度 m)、`T_out` (室外温度 K)、`T_in` (烟道温度 K)
可选：`rho_out`=1.2 (室外空气密度 kg/m^3)、`g`=9.80665 (重力加速度 m/s^2)

热空气比冷空气轻形成的压差；烟囱越高、温差越大抽力越强，这是炉火不呛人的物理原因。

### city_wall_perimeter

**方形城墙周长** · 层级 engineering · 领域 工程、材料 · 主角频率 medium · 单位 m

```
4 * sqrt(area)
```

必填：`area` (城内面积 m^2)

正方式估算；城墙越长，守军越难铺满，这是攻城方的基本算术。

## perception/celestial

### day_length

**自转周期（昼夜长短）** · 层级 engineering · 领域 天文 · 主角频率 high · 单位 s

```
2 * pi / omega
```

必填：`omega` (自转角速度 rad/s)

一天多长。地球 ω=7.29e-5 rad/s → 86164s（23h56m）。

### day_length_from_radius

**由赤道线速度求一天长度** · 层级 engineering · 领域 天文 · 主角频率 high · 单位 s

```
2 * pi * R / v_equator
```

必填：`R` (星球半径 m)、`v_equator` (赤道线速度 m/s)

另一种写法：赤道有人以 v 运动，一天就是绕一圈的时间。

### centrifugal_ratio

**赤道离心/重力比** · 层级 engineering · 领域 天文 · 主角频率 high

```
omega^2 * R / g
```

必填：`omega` (自转角速度 rad/s)、`R` (星球半径 m)
可选：`g`=9.80665 (表面重力 m/s²)

这个比值接近 1 时星球会解体。决定"最大自转速度"，进而决定最短的一天。

### solar_declination

**太阳赤纬（季节位移）** · 层级 engineering · 领域 天文 · 主角频率 high · 单位 rad

```
obliquity * sin(2 * pi * day_of_year / year_length)
```

必填：`day_of_year` (一年中的第几天)
可选：`obliquity`=0.409105 (轴倾角 rad（地球 23.44°）)、`year_length`=365.25 (一年天数)

太阳直射点纬度。倾角为 0 则无季节，倾角大则季节极端。

### solar_elevation

**正午太阳高度角** · 层级 engineering · 领域 天文 · 主角频率 high · 单位 rad

```
pi / 2 - abs(latitude - declination)
```

必填：`latitude` (纬度 rad)、`declination` (太阳赤纬 rad)

正午影子的长短由此决定。极昼极夜的界线也在这里。

### shadow_length

**影子长度** · 层级 engineering · 领域 天文 · 主角频率 high · 单位 m

```
h / tan(elevation)
```

必填：`h` (物体高度 m)、`elevation` (太阳高度角 rad)

正午影长。高纬度冬季影子极长，这是读者能直接感受到的季节信号。

### solar_day_length

**昼长（小时）** · 层级 engineering · 领域 天文 · 主角频率 high · 单位 小时

```
24 / pi * acos(max(-1, min(1, -tan(latitude) * tan(declination))))
```

必填：`latitude` (纬度 rad)
可选：`declination`=0 (太阳赤纬 rad（0=春分）)

日照时长。返回 24 表示极昼、0 表示极夜（已夹边界，不会报错）。故事节奏的关键参数。

### year_length

**公转周期（一年多长）** · 层级 engineering · 领域 天文 · 主角频率 high · 单位 s

```
2 * pi * sqrt(a^3 / (G * M))
```

必填：`a` (轨道半长轴 m)、`M` (恒星质量 kg)
可选：`G`=6.6743e-11 (引力常数)

一年多长。轨道远或恒星轻则一年漫长。

### tidal_period

**潮汐周期（双潮）** · 层级 engineering · 领域 天文 · 主角频率 high · 单位 s

```
2 * pi / (2 * (omega_planet - omega_moon) + 1e-30)
```

可选：`omega_planet`=0.00007292 (行星自转角速度 rad/s（地球值）)、`omega_moon`=0.000002662 (卫星公转角速度 rad/s（地球月亮值）)

两次高潮之间的间隔。地球约 12h25m。两者同步时无相对潮汐。

### tidal_force_ratio

**卫星潮汐力（相对地球月亮）** · 层级 engineering · 领域 天文 · 主角频率 high · 单位 kg/m³

```
m_moon / d^3
```

必填：`m_moon` (卫星质量 kg)、`d` (轨道距离 m)

与 7.35e22/(3.84e8)³ 比较，判断潮汐比地球强多少。多卫星世界的潮汐叠加。

### eclipse_angular

**日食条件（视角重合）** · 层级 engineering · 领域 天文 · 主角频率 high · 单位 rad

```
r_sun / d_sun - r_moon / d_moon
```

必填：`r_sun` (恒星半径 m)、`d_sun` (恒星距离 m)、`r_moon` (卫星半径 m)、`d_moon` (卫星距离 m)

接近 0 说明卫星恰好能遮住恒星——日全食奇观。地球这对数字极其巧合。

### sky_color_wavelength

**大气散射强度（瑞利）** · 层级 engineering · 领域 天文 · 主角频率 high · 单位 1/m⁴

```
1 / lambda^4
```

必填：`lambda` (波长 m)

短波散射强 → 天空偏蓝。大气成分/厚度不同的世界，天空颜色会变。

### atmospheric_scale_height

**大气标高（稀薄程度）** · 层级 engineering · 领域 天文 · 主角频率 high · 单位 m

```
R * T / (M * g)
```

必填：`T` (地表温度 K)、`M` (摩尔质量 kg/mol)
可选：`R`=8.314462618 (气体常数)、`g`=9.80665 (重力 m/s²)

气压降到 1/e 的高度。地球约 8.5km。决定"高原反应"和"天空尽头"。

### pressure_at_altitude

**高原气压** · 层级 engineering · 领域 天文 · 主角频率 high · 单位 Pa

```
P0 * exp(-h / H)
```

必填：`h` (海拔 m)
可选：`P0`=101325 (海平面气压 Pa)、`H`=8500 (大气标高 m)

越高空气越稀薄。登山、飞行、高原文明的能量基础。

### twilight_duration

**黄昏时长（近似）** · 层级 engineering · 领域 天文 · 主角频率 high · 单位 小时

```
18 * pi / 180 / (pi / 2) * (24 / pi)
```

必填：`latitude` (纬度 rad)

太阳从地平线落到 -18° 的耗时。高纬度夏季有长黄昏。

## perception/climate

### wind_power

**风功率密度** · 层级 engineering · 领域 地球、物理 · 主角频率 high · 单位 W

```
0.5 * rho * A * v^3
```

必填：`A` (迎风面积 m²)、`v` (风速 m/s)
可选：`rho`=1.225 (空气密度 kg/m³)

风力随速度三次方增长。风帆、风车、风暴破坏力。

### rainfall_runoff

**降水径流总量** · 层级 engineering · 领域 地球、物理 · 主角频率 high · 单位 m³

```
catchment * rainfall * runoff_coefficient
```

必填：`catchment` (流域面积 m²)、`rainfall` (降水量 m/年)
可选：`runoff_coefficient`=0.4 (径流系数 0-1)

一条河的年流量来源。绿洲/荒漠分界的定量判断。

### evaporation_rate

**蒸发速率（简化）** · 层级 engineering · 领域 地球、物理 · 主角频率 high · 单位 kg/(m²·s)

```
k * (es - ea)
```

必填：`k` (传质系数)、`es` (饱和水汽压 Pa)、`ea` (实际水汽压 Pa)

干旱程度的物理基础。

### lapse_rate_temp

**海拔降温** · 层级 engineering · 领域 地球、物理 · 主角频率 high · 单位 K

```
T0 - lapse * h
```

必填：`T0` (海平面温度 K)、`h` (海拔 m)
可选：`lapse`=0.0065 (递减率 K/m)

每升高 1km 降约 6.5℃。雪线、高山苔原的依据。

### snow_line

**雪线高度** · 层级 engineering · 领域 地球、物理 · 主角频率 high · 单位 m

```
(T_summer - 273.15) / lapse
```

必填：`T_summer` (夏季海平面温度 K)
可选：`lapse`=0.0065 (递减率 K/m)

常年积雪的起始高度。山脉的巨大感来源。

## perception/horizon

### horizon_distance

**地平线距离（平视）** · 层级 engineering · 领域 工程 · 主角频率 high · 单位 m

```
sqrt(2 * R * h + h^2)
```

必填：`h` (观察者/塔楼高度 m)
可选：`R`=6371000 (星球半径 m)

站在高度 h 处能看到多远。地球 1.7m 眼高约 4.7km。星球更小则地平线更近——这是"世界大小"最直观的暗示。

### horizon_tower_visibility

**两座塔互相可见的最大距离** · 层级 engineering · 领域 工程 · 主角频率 high · 单位 m

```
sqrt(2 * R * h1 + h1^2) + sqrt(2 * R * h2 + h2^2)
```

必填：`h1` (塔1 高度 m)、`h2` (塔2 高度 m)
可选：`R`=6371000 (星球半径 m)

两座高塔上的人能否互相望见。古代烽火台间距的直接依据。

### curvature_drop

**地球曲率下沉量** · 层级 engineering · 领域 工程 · 主角频率 high · 单位 m

```
d^2 / (2 * R)
```

必填：`d` (水平距离 m)
可选：`R`=6371000 (星球半径 m)

走过 d 后，远处物体相对视线"沉下去"多少。船桅消失、远山隐没的物理原因。

### apparent_size

**天体视直径（张角）** · 层级 engineering · 领域 工程 · 主角频率 high · 单位 rad

```
2 * atan(r / d)
```

必填：`r` (天体半径 m)、`d` (距离 m)

月亮/太阳在天空占多大。地球上看月亮约 0.52°。双月世界的标志性参数。

### angular_diameter_from_sizes

**给定视直径反推天体大小** · 层级 engineering · 领域 工程 · 主角频率 high · 单位 m

```
d * tan(angle / 2)
```

必填：`d` (距离 m)、`angle` (目标视直径 rad)

要让"月亮"看起来是地球月亮的 3 倍大，它得多大/多近。

## perception/senses

### sound_speed_air

**空气中的声速** · 层级 engineering · 领域 物理、生物 · 主角频率 high · 单位 m/s

```
331.3 * sqrt(T / 273.15)
```

必填：`T` (温度 K)

声音多快。天气/气体成分不同会变。轻重大气让喊话传得更远或更近。

### sound_speed_gas

**气体声速（通用）** · 层级 engineering · 领域 物理、生物 · 主角频率 high · 单位 m/s

```
sqrt(gamma * R * T / M)
```

必填：`T` (温度 K)、`M` (摩尔质量 kg/mol)
可选：`gamma`=1.4 (绝热指数)、`R`=8.314462618 (气体常数)

不同大气成分的声速。氙气大气里声音慢得多，对话会有"低沉"感。

### echo_delay

**回声延迟** · 层级 engineering · 领域 物理、生物 · 主角频率 high · 单位 s

```
2 * d / v
```

必填：`d` (障碍物距离 m)
可选：`v`=343 (声速 m/s)

喊一声多久听到回声。山谷/洞穴描写的依据。

### sound_attenuation

**声强随距离衰减** · 层级 engineering · 领域 物理、生物 · 主角频率 high · 单位 W/m²

```
I0 / d^2
```

必填：`I0` (参考距离处声强 W/m²)、`d` (距离 m)

平方反比。远处的人能不能听见呼喊。

### light_travel_time

**光行时间** · 层级 engineering · 领域 物理、生物 · 主角频率 high · 单位 s

```
d / c
```

必填：`d` (距离 m)
可选：`c`=299792458 (光速 m/s)

看到的是多久以前的景象。极远天体=看到过去（观测宇宙学的文学素材）。

### light_pollution_limit

**肉眼可见星等极限（近似）** · 层级 engineering · 领域 物理、生物 · 主角频率 high · 单位 星等

```
2.5 * log(brightness, 10) + 6
```

必填：`brightness` (相对亮度（以肉眼阈值为 1）)

不同程度黑暗下能看到多暗的星。星空描写的量化依据。

### echo_distance

**回声测距** · 层级 derived · 领域 物理、生物 · 主角频率 high · 单位 m

```
v * t / 2
```

必填：`t` (往返时间 s)
可选：`v`=343 (声速 m/s)

对着山崖喊一声听到回声，距离 = 声速×时间/2。

### lightning_distance

**闪电距离** · 层级 derived · 领域 物理、生物 · 主角频率 high · 单位 km

```
t * 343 / 1000
```

必填：`t` (看到闪电到听到雷声的秒数 s)

声速约 343 m/s，3 秒 ≈ 1 km；故事里最常用的野外常识。

### music_note_frequency

**音符频率（十二平均律）** · 层级 derived · 领域 物理、生物 · 主角频率 medium · 单位 Hz

```
440 * 2^((n - 69) / 12)
```

必填：`n` (MIDI 音高（A4=69）)

十二平均律：A4=440Hz，每升高 12 个半音频率翻倍。

### string_fundamental_frequency

**弦的基频** · 层级 derived · 领域 物理、生物 · 主角频率 medium · 单位 Hz

```
1 / (2 * L) * sqrt(T / mu)
```

必填：`L` (弦长 m)、`T` (张力 N)、`mu` (线密度 kg/m)

琴弦越短、越紧、越细，音越高。

### sound_attenuation_distance

**点声源距离衰减** · 层级 derived · 领域 物理、生物 · 主角频率 medium · 单位 dB

```
L0 - 20 * log10(r / r0)
```

必填：`L0` (参考距离处声压级 dB)、`r` (目标距离 m)
可选：`r0`=1 (参考距离 m)

自由场理论衰减：距离每翻倍降 6 dB；有遮挡/地面反射时实际更复杂。

### lens_magnification

**薄透镜放大率** · 层级 derived · 领域 物理、生物 · 主角频率 medium · 单位 无量纲

```
-di / do
```

必填：`di` (像距 m)、`do` (物距 m)

负号表示倒立实像；配合 1/f=1/do+1/di 用。

### camera_exposure_ev

**曝光值 EV** · 层级 engineering · 领域 物理、生物 · 主角频率 low · 单位 EV

```
log2(N^2 / t)
```

必填：`N` (光圈 f 数)、`t` (快门时间 s)

摄影曝光的统一标尺；EV 每 +1 少一半进光。

### optical_resolving_power

**望远镜分辨极限** · 层级 derived · 领域 物理、生物 · 主角频率 medium · 单位 rad

```
1.22 * lambda / D
```

必填：`lambda` (波长 m)、`D` (口径 m)

瑞利判据：口径越大看得越细；这是望远镜/显微镜的物理上限。

## perception/technology

### combustion_energy

**燃料燃烧热量** · 层级 engineering · 领域 工程 · 主角频率 high · 单位 J

```
mass * energy_density
```

必填：`mass` (燃料质量 kg)、`energy_density` (能量密度 J/kg（木材 1.6e7，煤 2.4e7，油 4.4e7）)

燃料决定文明能做什么。木材 vs 煤 vs 油的代差。

### smelting_temperature

**熔炼所需能量** · 层级 engineering · 领域 工程 · 主角频率 high · 单位 J

```
mass * (cp * (T_melt - T0) + latent)
```

必填：`mass` (质量 kg)、`cp` (比热 J/(kg·K))、`T_melt` (熔点 K)、`latent` (熔化潜热 J/kg)
可选：`T0`=293 (环境温度 K)

炼铁/炼铜的能量门槛。这决定了技术树能走到哪一步。

### energy_per_capita

**人均能量消耗** · 层级 engineering · 领域 工程 · 主角频率 high · 单位 J/人·年

```
total_energy / population
```

必填：`total_energy` (总能耗 J/年)、`population` (人口)

文明的能量级别。采集社会约 1e10，工业社会约 1e12。

### carrying_kcal_per_hectare

**耕地能量产出密度** · 层级 engineering · 领域 工程 · 主角频率 high · 单位 J/m²·年

```
kg_per_hectare * kcal_per_kg * 4184 / 1e4
```

必填：`kg_per_hectare` (每公顷产量 kg)
可选：`kcal_per_kg`=3500 (每公斤热量 kcal)

一平方米土地每年产出多少能量。对比人均能耗就知道能养多少人。

## perception/travel

### travel_time

**旅行耗时** · 层级 engineering · 领域 工程、物理 · 主角频率 high · 单位 s

```
distance / speed
```

必填：`distance` (距离 m)、`speed` (速度 m/s)

走多远要多久。马 5.5m/s、船 3m/s、驼队 1.4m/s。

### travel_time_hours

**旅行耗时（小时）** · 层级 engineering · 领域 工程、物理 · 主角频率 high · 单位 小时

```
distance / (speed * 3.6)
```

必填：`distance` (距离 km)、`speed` (速度 km/h)

步行 5km/h、行军 4km/h、骑兵 20km/h。情节节奏的直接依据。

### march_supply

**行军补给需求** · 层级 engineering · 领域 工程、物理 · 主角频率 high · 单位 kg

```
n * days * per_day
```

必填：`n` (人数)、`days` (天数)
可选：`per_day`=3 (每人每日补给 kg)

军队能走多远、补给车队多大。战争推演的基础。

### drayage_range

**人力/畜力运输经济半径** · 层级 engineering · 领域 工程、物理 · 主角频率 high

```
value / (cost_per_km * distance)
```

必填：`value` (货物单位价值)、`cost_per_km` (每公里运输成本)、`distance` (距离 km)

比值 <1 说明运过去的成本超过了货值——贸易半径的硬边界。

### walking_range_human

**人的日常活动半径** · 层级 engineering · 领域 工程、物理 · 主角频率 high · 单位 m

```
speed * hours
```

必填：`hours` (可活动小时数)
可选：`speed`=1.4 (步行速度 m/s)

一天能走多远。聚落规模与市场范围。

### river_crossing_time

**渡河耗时** · 层级 engineering · 领域 工程、物理 · 主角频率 high · 单位 s

```
width / boat_speed
```

必填：`width` (河宽 m)
可选：`boat_speed`=1 (船速 m/s)

渡河要多久。军事行动的窗口期。

### hull_speed

**船舶理论航速** · 层级 phenomenological · 领域 工程、物理 · 主角频率 high · 单位 kn

```
1.34 * sqrt(L)
```

必填：`L` (水线长度 ft)

排水型船的兴波极限速度（经验）；再快就得上滑行艇或水翼。

### mach_number

**马赫数** · 层级 derived · 领域 工程、物理 · 主角频率 high · 单位 无量纲

```
v / c
```

必填：`v` (速度 m/s)
可选：`c`=343 (当地声速 m/s)

速度与声速之比；>1 即超音速。高空声速更低，同速下马赫数更大。

### projectile_range_vacuum

**抛体射程（真空）** · 层级 derived · 领域 工程、物理 · 主角频率 high · 单位 m

```
v^2 * sin(2 * theta) / g
```

必填：`v` (初速度 m/s)、`theta` (发射角 rad)
可选：`g`=9.80665 (重力加速度 m/s^2)

忽略空气阻力的射程；45° 最远。真实投石机/弓箭因阻力射程明显更短。

### projectile_apex_height

**抛体最高点** · 层级 derived · 领域 工程、物理 · 主角频率 high · 单位 m

```
(v * sin(theta))^2 / (2 * g)
```

必填：`v` (初速度 m/s)、`theta` (发射角 rad)
可选：`g`=9.80665 (重力加速度 m/s^2)

真空抛体的最大高度；箭能射多高、石弹能砸多高。

### stopping_distance

**刹车距离** · 层级 derived · 领域 工程、物理 · 主角频率 high · 单位 m

```
v^2 / (2 * mu * g)
```

必填：`v` (初速度 m/s)、`mu` (摩擦系数（干沥青≈0.7，湿≈0.4）)
可选：`g`=9.80665 (重力加速度 m/s^2)

与速度平方成正比：速度翻倍，刹车距离四倍。

### impact_speed_freefall

**自由落体落地速度** · 层级 derived · 领域 工程、物理 · 主角频率 high · 单位 m/s

```
sqrt(2 * g * h)
```

必填：`h` (下落高度 m)
可选：`g`=9.80665 (重力加速度 m/s^2)

忽略空气阻力；10 米约 14 m/s，相当于 50 km/h 撞墙。

## perception/weather

### wind_chill

**风寒指数** · 层级 phenomenological · 领域 地球、物理 · 主角频率 high · 单位 °C

```
13.12 + 0.6215*T - 11.37*v^0.16 + 0.3965*T*v^0.16
```

必填：`T` (气温 °C)、`v` (风速 km/h)

加拿大环境部经验公式（适用 T ≤ 10°C、v > 4.8 km/h）；「体感温度」的来源。

### heat_index

**酷热指数** · 层级 phenomenological · 领域 地球、物理 · 主角频率 high · 单位 °C

```
-42.379 + 2.04901523*T + 10.14333127*R - 0.22475541*T*R - 0.00683783*T^2 - 0.05481717*R^2 + 0.00122874*T^2*R + 0.00085282*T*R^2 - 0.00000199*T^2*R^2
```

必填：`T` (气温 °C)、`R` (相对湿度 %)

Rothfusz 回归（经验），高温高湿下的体感温度。

### dew_point_magnus

**露点温度（Magnus）** · 层级 phenomenological · 领域 地球、物理 · 主角频率 high · 单位 °C

```
243.04*(log(RH/100) + 17.625*T/(243.04+T)) / (17.625 - log(RH/100) - 17.625*T/(243.04+T))
```

必填：`T` (气温 °C)、`RH` (相对湿度 %)

Magnus 经验式；露点以下水汽凝结，是结露、起雾、下露的判据。

### wind_power_density

**风功率** · 层级 derived · 领域 地球、物理 · 主角频率 medium · 单位 W

```
0.5 * rho * A * v^3 * Cp
```

必填：`A` (迎风面积 m^2)、`v` (风速 m/s)
可选：`rho`=1.225 (空气密度 kg/m^3)、`Cp`=0.35 (风轮功率系数（理论上限 0.593）)

风能可提取功率 P = ½ρAv³Cp；风速是三次方，所以风车对风速极敏感。

### cooling_newton

**牛顿冷却** · 层级 derived · 领域 地球、物理 · 主角频率 high · 单位 W

```
h * A * dT
```

必填：`h` (对流换热系数 W/(m^2·K))、`A` (表面积 m^2)、`dT` (温差 K)

对流散热功率；自然对流 h≈5–25，强制风冷可达 100 以上。

### heat_conduction_slab

**一维导热** · 层级 derived · 领域 地球、物理 · 主角频率 high · 单位 W

```
k * A * dT / L
```

必填：`k` (导热系数 W/(m·K))、`A` (截面积 m^2)、`dT` (温差 K)、`L` (厚度 m)

傅里叶定律；砌墙、做衣服、隔热层的核心公式。

### thermal_time_constant

**物体升降温时间** · 层级 derived · 领域 地球、物理 · 主角频率 high · 单位 s

```
m * c * dT / P
```

必填：`m` (质量 kg)、`c` (比热容 J/(kg·K))、`dT` (温差 K)、`P` (加热功率 W)

烧开一壶水要多久、石头多久凉透，都用它估。

## physics/astronomy

### stellar_luminosity

**恒星光度** · 层级 derived · 领域 物理、天文 · 主角频率 medium · 单位 W

```
4 * pi * R^2 * sigma * T^4
```

必填：`R` (恒星半径 m)、`T` (表面温度 K)
可选：`sigma`=5.670374419e-8 (斯特藩常数)

L = 4πR²σT⁴。

### equilibrium_temp

**行星平衡温度** · 层级 derived · 领域 物理、天文 · 主角频率 medium · 单位 K

```
Tstar * sqrt(Rstar / (2 * d)) * (1 - albedo)^0.25
```

必填：`Tstar` (恒星表面温度 K)、`Rstar` (恒星半径 m)、`d` (轨道距离 m)
可选：`albedo`=0.3 (反照率 0-1)

简化模型，用于估算宜居带温度。

### schwarzschild_radius

**史瓦西半径（黑洞视界）** · 层级 derived · 领域 物理、天文 · 主角频率 medium · 单位 m

```
2 * G * M / c^2
```

必填：`M` (质量 kg)
可选：`G`=6.6743e-11 (引力常数)、`c`=299792458 (光速)

r_s = 2GM/c²。质量多大才能形成黑洞。

### orbital_altitude_period

**圆轨道周期（给高度）** · 层级 derived · 领域 物理、天文 · 主角频率 medium · 单位 s

```
2 * pi * sqrt((R + h)^3 / (G * M))
```

必填：`R` (天体半径 m)、`h` (轨道高度 m)、`M` (天体质量 kg)
可选：`G`=6.6743e-11 (引力常数)

T = 2π√((R+h)³/GM)。卫星/空间站周期。

### synchronous_altitude

**同步轨道高度** · 层级 derived · 领域 物理、天文 · 主角频率 medium · 单位 m

```
(G * M * T^2 / (4 * pi^2))^(1/3) - R
```

必填：`M` (天体质量 kg)、`T` (自转周期 s)、`R` (天体半径 m)
可选：`G`=6.6743e-11 (引力常数)

静止卫星轨道高度。

### hubble_velocity

**哈勃定律退行速度** · 层级 derived · 领域 物理、天文 · 主角频率 medium · 单位 m/s

```
H0 * d
```

必填：`d` (距离 m)
可选：`H0`=2.27e-18 (哈勃常数 1/s)

v = H₀d。宇宙膨胀推演。

### hubble_time

**哈勃时间（宇宙年龄尺度）** · 层级 derived · 领域 物理、天文 · 主角频率 medium · 单位 s

```
1 / H0
```

可选：`H0`=2.27e-18 (哈勃常数 1/s)

t_H = 1/H₀ ≈ 139 亿年。

### redshift_distance

**红移→距离（低红移近似）** · 层级 derived · 领域 物理、天文 · 主角频率 medium · 单位 m

```
c * z / H0
```

必填：`z` (红移 z)
可选：`c`=299792458 (光速)、`H0`=2.27e-18 (哈勃常数)

d ≈ cz/H₀（z≪1）。

### habitable_zone

**宜居带内边界（简化）** · 层级 derived · 领域 物理、天文 · 主角频率 medium · 单位 AU

```
sqrt(L / 1.1)
```

必填：`L` (恒星相对光度 L/Lsun)

经验近似，用于快速判断行星位置。

### tidal_locking_time

**潮汐锁定时间尺度（比例）** · 层级 derived · 领域 物理、天文 · 主角频率 medium

```
Q * a^6 * M / (m * R^3)
```

必填：`Q` (耗散因子)、`a` (轨道半径 m)、`M` (主星质量 kg)、`m` (卫星质量 kg)、`R` (卫星半径 m)

相对量级，用于比较不同天体的锁定快慢。

### stefan_radius

**由光度与温度反推恒星半径** · 层级 derived · 领域 物理、天文 · 主角频率 medium · 单位 m

```
sqrt(L / (4 * pi * sigma * T^4))
```

必填：`L` (光度 W)、`T` (表面温度 K)
可选：`sigma`=5.670374419e-8 (斯特藩常数)

R = √(L/(4πσT⁴))。

### kepler_mass

**由轨道反推中心天体质量** · 层级 derived · 领域 物理、天文 · 主角频率 medium · 单位 kg

```
4 * pi^2 * r^3 / (G * T^2)
```

必填：`r` (轨道半径 m)、`T` (周期 s)
可选：`G`=6.6743e-11 (引力常数)

M = 4π²r³/(GT²)。

## physics/em

### ohm

**欧姆定律** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 V

```
I * R
```

必填：`I` (电流 A)、`R` (电阻 Ω)

V = IR。

### electric_power

**电功率** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 W

```
V * I
```

必填：`V` (电压 V)、`I` (电流 A)

P = VI。

### joule_heating

**焦耳热** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 J

```
I^2 * R * t
```

必填：`I` (电流 A)、`R` (电阻 Ω)、`t` (时间 s)

Q = I²Rt。

### coulomb

**库仑定律** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 N

```
k * q1 * q2 / r^2
```

必填：`q1` (电荷1 C)、`q2` (电荷2 C)、`r` (距离 m)
可选：`k`=8987551792.3 (库仑常数)

F = kq₁q₂/r²。

### capacitor_energy

**电容储能** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 J

```
0.5 * C * V^2
```

必填：`C` (电容 F)、`V` (电压 V)

E = ½CV²。

### rc_time

**RC 时间常数** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 s

```
R * C
```

必填：`R` (电阻 Ω)、`C` (电容 F)

τ = RC。

### inductor_energy

**电感储能** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 J

```
0.5 * L * I^2
```

必填：`L` (电感 H)、`I` (电流 A)

E = ½LI²。

### lc_resonance

**LC 谐振频率** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Hz

```
1 / (2 * pi * sqrt(L * C))
```

必填：`L` (电感 H)、`C` (电容 F)

f = 1/(2π√(LC))。

### lorentz_force

**洛伦兹力（磁场分量）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 N

```
q * v * B * sin(theta)
```

必填：`q` (电荷 C)、`v` (速度 m/s)、`B` (磁感应强度 T)
可选：`theta`=1.5707963267948966 (夹角 rad)

F = qvB·sinθ。

### resistors_series

**串联电阻** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Ω

```
r1 + r2
```

必填：`r1` (电阻1 Ω)、`r2` (电阻2 Ω)

R = R₁ + R₂。

### resistors_parallel

**并联电阻** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Ω

```
r1 * r2 / (r1 + r2)
```

必填：`r1` (电阻1 Ω)、`r2` (电阻2 Ω)

R = R₁R₂/(R₁+R₂)。

### electric_field

**均匀电场强度** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 V/m

```
V / d
```

必填：`V` (电压 V)、`d` (距离 m)

E = V/d。

### magnetic_force_wire

**通电导线磁力** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 N

```
I * L * B * sin(theta)
```

必填：`I` (电流 A)、`L` (长度 m)、`B` (磁感应强度 T)
可选：`theta`=1.5707963267948966 (夹角 rad)

F = ILB·sinθ。

### magnetic_flux

**磁通量** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Wb

```
B * A * cos(theta)
```

必填：`B` (磁感应强度 T)、`A` (面积 m²)
可选：`theta`=0 (夹角 rad)

Φ = BA·cosθ。

### faraday_emf

**法拉第感应电动势** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 V

```
N * dPhi / dt
```

必填：`dPhi` (磁通变化 Wb)、`dt` (时间 s)
可选：`N`=1 (匝数)

ε = NΔΦ/Δt。

### transformer

**变压器电压比** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 V

```
V1 * N2 / N1
```

必填：`V1` (初级电压 V)、`N1` (初级匝数)、`N2` (次级匝数)

V₂ = V₁N₂/N₁。

### parallel_plate_capacitance

**平行板电容** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 F

```
epsilon0 * A / d
```

必填：`A` (极板面积 m²)、`d` (间距 m)
可选：`epsilon0`=8.8541878128e-12 (真空介电常数)

C = ε₀A/d。

### capacitor_charge

**电容电荷量** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 C

```
C * V
```

必填：`C` (电容 F)、`V` (电压 V)

Q = CV。

### rc_charge_voltage

**RC 充电电压（t 时刻）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 V

```
V0 * (1 - exp(-t / (R * C)))
```

必填：`V0` (电源电压 V)、`R` (电阻 Ω)、`C` (电容 F)、`t` (时间 s)

V(t) = V₀(1-e^(-t/RC))。

### rc_discharge_voltage

**RC 放电电压（t 时刻）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 V

```
V0 * exp(-t / (R * C))
```

必填：`V0` (初电压 V)、`R` (电阻 Ω)、`C` (电容 F)、`t` (时间 s)

V(t) = V₀e^(-t/RC)。

### drift_velocity

**电子漂移速度** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m/s

```
I / (n * e_charge * A)
```

必填：`I` (电流 A)、`n` (载流子密度 1/m³)、`A` (截面积 m²)
可选：`e_charge`=1.602176634e-19 (元电荷)

v = I/(neA)。

### joule_power

**电阻发热功率** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 W

```
I^2 * R
```

必填：`I` (电流 A)、`R` (电阻 Ω)

P = I²R。

## physics/fluid

### pressure_depth

**液体压强（含大气）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Pa

```
P0 + rho * g * h
```

必填：`rho` (密度 kg/m³)、`h` (深度 m)
可选：`P0`=101325 (表面压强 Pa)、`g`=9.80665 (重力加速度)

P = P₀ + ρgh。深海世界推演常用。

### buoyancy

**浮力（阿基米德）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 N

```
rho * V * g
```

必填：`rho` (流体密度 kg/m³)、`V` (排开体积 m³)
可选：`g`=9.80665 (重力加速度)

F = ρVg。

### flow_rate

**体积流量** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m³/s

```
A * v
```

必填：`A` (截面积 m²)、`v` (流速 m/s)

Q = Av。

### reynolds

**雷诺数** · 层级 derived · 领域 物理 · 主角频率 medium

```
rho * v * D / mu
```

必填：`rho` (密度 kg/m³)、`v` (流速 m/s)、`D` (特征长度 m)、`mu` (动力粘度 Pa·s)

Re > 4000 通常为湍流。

## physics/gravity

### gravitation

**万有引力** · 层级 derived · 领域 物理 · 主角频率 high · 单位 N

```
G * m1 * m2 / r^2
```

必填：`m1` (质量1 kg)、`m2` (质量2 kg)、`r` (距离 m)
可选：`G`=6.6743e-11 (引力常数)

F = Gm₁m₂/r²。

### surface_gravity

**星球表面重力** · 层级 derived · 领域 物理 · 主角频率 high · 单位 m/s^2

```
G * M / R^2
```

必填：`M` (星球质量 kg)、`R` (星球半径 m)
可选：`G`=6.6743e-11 (引力常数)

g = GM/R²。造星球时直接算表面重力。

### orbital_velocity

**环绕速度** · 层级 derived · 领域 物理 · 主角频率 high · 单位 m/s

```
sqrt(G * M / r)
```

必填：`M` (中心天体质量 kg)、`r` (轨道半径 m)
可选：`G`=6.6743e-11 (引力常数)

v = √(GM/r)。

### escape_velocity

**逃逸速度** · 层级 derived · 领域 物理 · 主角频率 high · 单位 m/s

```
sqrt(2 * G * M / r)
```

必填：`M` (天体质量 kg)、`r` (半径 m)
可选：`G`=6.6743e-11 (引力常数)

v = √(2GM/r)。

### orbital_period

**轨道周期（开普勒第三定律）** · 层级 derived · 领域 物理 · 主角频率 high · 单位 s

```
2 * pi * sqrt(r^3 / (G * M))
```

必填：`M` (中心天体质量 kg)、`r` (轨道半径 m)
可选：`G`=6.6743e-11 (引力常数)

T = 2π√(r³/GM)。

### hill_sphere

**希尔球半径** · 层级 derived · 领域 物理 · 主角频率 high · 单位 m

```
a * (m / (3 * M))^(1/3)
```

必填：`a` (轨道半长轴 m)、`m` (小天体质量 kg)、`M` (主星质量 kg)

卫星能稳定绕行的最大范围。

### roche_limit

**洛希极限（流体卫星）** · 层级 derived · 领域 物理 · 主角频率 high · 单位 m

```
2.44 * R * (rhoM / rhom)^(1/3)
```

必填：`R` (主星半径 m)、`rhoM` (主星密度 kg/m^3)、`rhom` (卫星密度 kg/m^3)

小于此距离卫星会被潮汐力撕碎。

### tidal_accel

**潮汐加速度差** · 层级 derived · 领域 物理 · 主角频率 high · 单位 m/s^2

```
2 * G * M * d / r^3
```

必填：`M` (主星质量 kg)、`r` (距离 m)、`d` (天体尺度 m)
可选：`G`=6.6743e-11 (引力常数)

≈ 2GMd/r³，衡量潮汐力强弱。

## physics/mechanics

### velocity_uniform

**匀速速度** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m/s

```
s / t
```

必填：`s` (位移 m)、`t` (时间 s)

匀速直线运动的速度。

### acceleration

**加速度** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m/s^2

```
(v - v0) / t
```

必填：`v` (末速度 m/s)、`t` (时间 s)
可选：`v0`=0 (初速度 m/s)

匀变速运动的加速度。

### kinematics_v

**速度公式（无位移）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m/s

```
v0 + a * t
```

必填：`a` (加速度 m/s^2)、`t` (时间 s)
可选：`v0`=0 (初速度 m/s)

v = v0 + at。

### kinematics_s

**位移公式（无末速）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m

```
v0 * t + 0.5 * a * t^2
```

必填：`a` (加速度 m/s^2)、`t` (时间 s)
可选：`v0`=0 (初速度 m/s)

s = v0·t + ½at²。

### kinematics_v2

**速度-位移关系** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m/s

```
sqrt(v0^2 + 2 * a * s)
```

必填：`a` (加速度 m/s^2)、`s` (位移 m)
可选：`v0`=0 (初速度 m/s)

v² = v0² + 2as（不含时间）。

### newton_second

**牛顿第二定律** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 N

```
m * a
```

必填：`m` (质量 kg)、`a` (加速度 m/s^2)

F = ma。

### weight

**重力（重量）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 N

```
m * g
```

必填：`m` (质量 kg)
可选：`g`=9.80665 (重力加速度 m/s^2（架空世界可改）)

W = mg。改 g 即可模拟高重力/低重力世界。

### friction

**滑动摩擦力** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 N

```
mu * N
```

必填：`mu` (摩擦系数 μ)、`N` (正压力 N)

f = μN。

### kinetic_energy

**动能** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 J

```
0.5 * m * v^2
```

必填：`m` (质量 kg)、`v` (速度 m/s)

Ek = ½mv²。

### potential_energy

**重力势能** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 J

```
m * g * h
```

必填：`m` (质量 kg)、`h` (高度 m)
可选：`g`=9.80665 (重力加速度 m/s^2)

Ep = mgh。

### momentum

**动量** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 kg·m/s

```
m * v
```

必填：`m` (质量 kg)、`v` (速度 m/s)

p = mv。

### impulse

**冲量** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 N·s

```
F * t
```

必填：`F` (力 N)、`t` (时间 s)

J = F·t = Δp。

### work

**功** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 J

```
F * s * cos(theta)
```

必填：`F` (力 N)、`s` (位移 m)
可选：`theta`=0 (力与位移夹角 rad)

W = F·s·cosθ。

### power

**功率** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 W

```
W / t
```

必填：`W` (功 J)、`t` (时间 s)

P = W/t。

### centripetal_accel

**向心加速度** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m/s^2

```
v^2 / r
```

必填：`v` (线速度 m/s)、`r` (半径 m)

a = v²/r。

### circular_period

**圆周运动周期** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 s

```
2 * pi * r / v
```

必填：`r` (半径 m)、`v` (线速度 m/s)

T = 2πr/v。

### spring_force

**弹簧力（胡克定律）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 N

```
k * x
```

必填：`k` (劲度系数 N/m)、`x` (形变 m)

F = kx。

### spring_energy

**弹簧势能** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 J

```
0.5 * k * x^2
```

必填：`k` (劲度系数 N/m)、`x` (形变 m)

E = ½kx²。

### pendulum_period

**单摆周期（小角）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 s

```
2 * pi * sqrt(L / g)
```

必填：`L` (摆长 m)
可选：`g`=9.80665 (重力加速度 m/s^2)

T = 2π√(L/g)。改 g 可推演异星钟摆。

### projectile_range

**抛射射程（平地）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m

```
v^2 * sin(2 * theta) / g
```

必填：`v` (初速度 m/s)、`theta` (发射角 rad)
可选：`g`=9.80665 (重力加速度 m/s^2)

R = v²sin2θ/g。

### projectile_height

**抛射最大高度** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m

```
(v * sin(theta))^2 / (2 * g)
```

必填：`v` (初速度 m/s)、`theta` (发射角 rad)
可选：`g`=9.80665 (重力加速度 m/s^2)

H = (v·sinθ)²/(2g)。

### torque

**力矩** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 N·m

```
r * F * sin(theta)
```

必填：`r` (力臂 m)、`F` (力 N)
可选：`theta`=1.5707963267948966 (夹角 rad)

τ = rF·sinθ。

### moment_inertia_rod

**细杆转动惯量（过中心）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 kg·m^2

```
m * L^2 / 12
```

必填：`m` (质量 kg)、`L` (长度 m)

I = mL²/12。

### kinematics_avg_velocity

**平均速度** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m/s

```
(v0 + v) / 2
```

必填：`v0` (初速度 m/s)、`v` (末速度 m/s)

匀变速运动的平均速度。

### free_fall_time

**自由落体时间** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 s

```
sqrt(2 * h / g)
```

必填：`h` (高度 m)
可选：`g`=9.80665 (重力加速度 m/s²)

从高度 h 自由落体所需时间。改 g 可算异星坠落时间。

### free_fall_velocity

**自由落体末速度** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m/s

```
sqrt(2 * g * h)
```

必填：`h` (高度 m)
可选：`g`=9.80665 (重力加速度 m/s²)

落地速度（忽略空气阻力）。

### terminal_velocity

**终端速度** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m/s

```
sqrt(2 * m * g / (rho * Cd * A))
```

必填：`m` (质量 kg)、`A` (迎风面积 m²)
可选：`g`=9.80665 (重力加速度)、`rho`=1.225 (空气密度 kg/m³)、`Cd`=0.47 (阻力系数（球 0.47，人 1.0）)

流体中下落达到的极限速度。高重力世界的落体速度上限。

### reduced_mass

**约化质量** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 kg

```
m1 * m2 / (m1 + m2)
```

必填：`m1` (质量1 kg)、`m2` (质量2 kg)

双体问题的有效质量。

### elastic_collision_v1

**弹性碰撞后速度（1 号球）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m/s

```
(m1 - m2) / (m1 + m2) * u1 + 2 * m2 / (m1 + m2) * u2
```

必填：`m1` (质量1)、`u1` (初速度1)、`m2` (质量2)
可选：`u2`=0 (初速度2)

一维弹性碰撞后的速度。

### inelastic_collision_v

**完全非弹性碰撞后共同速度** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m/s

```
(m1 * u1 + m2 * u2) / (m1 + m2)
```

必填：`m1` (质量1)、`u1` (初速度1)、`m2` (质量2)
可选：`u2`=0 (初速度2)

动量守恒，碰撞后粘在一起。

### moment_inertia_sphere

**实心球转动惯量** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 kg·m²

```
2 / 5 * m * r^2
```

必填：`m` (质量 kg)、`r` (半径 m)

I = 2mr²/5。

### moment_inertia_cylinder

**实心圆柱转动惯量** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 kg·m²

```
1 / 2 * m * r^2
```

必填：`m` (质量 kg)、`r` (半径 m)

I = mr²/2。

### angular_momentum

**角动量** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 kg·m²/s

```
I * omega
```

必填：`I` (转动惯量 kg·m²)、`omega` (角速度 rad/s)

L = Iω。

### rotational_ke

**转动动能** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 J

```
0.5 * I * omega^2
```

必填：`I` (转动惯量 kg·m²)、`omega` (角速度 rad/s)

Ek = ½Iω²。

### simple_harmonic_omega

**简谐振动角频率** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 rad/s

```
sqrt(k / m)
```

必填：`k` (劲度系数 N/m)、`m` (质量 kg)

ω = √(k/m)。

### simple_harmonic_period

**简谐振动周期** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 s

```
2 * pi * sqrt(m / k)
```

必填：`m` (质量 kg)、`k` (劲度系数 N/m)

T = 2π√(m/k)。

### damped_frequency

**阻尼振动频率** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 rad/s

```
sqrt(k / m - (b / (2 * m))^2)
```

必填：`k` (劲度系数)、`m` (质量)、`b` (阻尼系数)

ω_d = √(ω₀² - γ²)。为虚数说明过阻尼。

### damping_ratio

**阻尼比** · 层级 derived · 领域 物理 · 主角频率 medium

```
b / (2 * sqrt(k * m))
```

必填：`b` (阻尼系数)、`k` (劲度系数)、`m` (质量)

ζ<1 欠阻尼，=1 临界，>1 过阻尼。

### pressure_force

**压力（压强×面积）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 N

```
P * A
```

必填：`P` (压强 Pa)、`A` (面积 m²)

F = PA。

### stress

**应力** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Pa

```
F / A
```

必填：`F` (力 N)、`A` (截面积 m²)

σ = F/A。材料强度推演。

### strain

**应变** · 层级 derived · 领域 物理 · 主角频率 medium

```
dL / L0
```

必填：`dL` (形变 m)、`L0` (原长 m)

ε = ΔL/L₀。

### young_modulus

**杨氏模量** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Pa

```
stress / strain
```

必填：`stress` (应力 Pa)、`strain` (应变)

E = σ/ε。判断材料刚度。

### beam_deflection

**简支梁中点挠度** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m

```
F * L^3 / (48 * E * I)
```

必填：`F` (集中载荷 N)、`L` (跨度 m)、`E` (杨氏模量 Pa)、`I` (截面惯性矩 m⁴)

δ = FL³/(48EI)。建筑/巨构推演用。

### buckling_load

**欧拉屈曲临界载荷** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 N

```
pi^2 * E * I / L^2
```

必填：`E` (杨氏模量 Pa)、`I` (截面惯性矩 m⁴)、`L` (柱长 m)

P_cr = π²EI/L²。超高建筑/巨兽骨骼的塌缩点。

### hydrostatic_pressure

**静水压（相对）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Pa

```
rho * g * h
```

必填：`h` (深度 m)
可选：`rho`=1025 (液体密度 kg/m³)、`g`=9.80665 (重力加速度)

ρgh，不含大气压。深海世界的结构强度需求。

## physics/nuclear

### decay_constant

**衰变常数** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 1/s

```
log(2) / T
```

必填：`T` (半衰期 s)

λ = ln2/T。

### radioactive_decay

**放射性剩余量** · 层级 fundamental · 领域 物理 · 主角频率 low

```
N0 * 0.5^(t / T)
```

必填：`N0` (初始量)、`T` (半衰期 s)、`t` (经过时间 s)

N = N₀·(½)^(t/T)。架空世界的"高辐射区"设定常用。

### decay_power

**指数衰减（连续形式）** · 层级 fundamental · 领域 物理 · 主角频率 low

```
N0 * exp(-lambda * t)
```

必填：`N0` (初始量)、`lambda` (衰变常数 1/s)、`t` (时间 s)

N = N₀e^(-λt)。

### mass_defect_energy

**质量亏损能量** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 J

```
dm * c^2
```

必填：`dm` (质量亏损 kg)
可选：`c`=299792458 (光速 m/s)

E = Δmc²，核反应能量来源。

## physics/optics

### snell

**折射定律（求折射角）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 rad

```
asin(n1 * sin(theta1) / n2)
```

必填：`n2` (介质2折射率)、`theta1` (入射角 rad)
可选：`n1`=1 (介质1折射率)

n₁sinθ₁ = n₂sinθ₂。

### thin_lens

**薄透镜像距** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m

```
1 / (1/f - 1/u)
```

可选：`f`=0.1 (焦距 m)、`u`=0.3 (物距 m（等于焦距时无有限像）)

1/f = 1/u + 1/v。

### magnification

**横向放大率** · 层级 derived · 领域 物理 · 主角频率 medium

```
-v / u
```

必填：`v` (像距 m)、`u` (物距 m)

m = -v/u。

### diffraction_grating

**光栅衍射角** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 rad

```
asin(n * lambda / d)
```

必填：`lambda` (波长 m)、`d` (栅距 m)
可选：`n`=1 (衍射级次)

d·sinθ = nλ。

### critical_angle

**全反射临界角** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 rad

```
asin(n2 / n1)
```

必填：`n1` (光密介质折射率)
可选：`n2`=1 (光疏介质折射率)

sinθc = n₂/n₁。

### optical_power

**透镜光焦度** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 D

```
1 / f
```

必填：`f` (焦距 m)

P = 1/f（屈光度）。

### lens_equation

**透镜成像公式（求像距）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m

```
1 / (1 / f - 1 / u)
```

可选：`f`=0.1 (焦距 m)、`u`=0.3 (物距 m（等于焦距时像在无穷远）)

1/v = 1/f - 1/u。u=f 时无有限像距，属正常物理情况。

## physics/quantum

### photon_energy

**光子能量** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 J

```
h * f
```

必填：`f` (频率 Hz)
可选：`h`=6.62607015e-34 (普朗克常数)

E = hf。

### de_broglie

**德布罗意波长** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 m

```
h / p
```

必填：`p` (动量 kg·m/s)
可选：`h`=6.62607015e-34 (普朗克常数)

λ = h/p。

### hydrogen_levels

**氢原子能级** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 eV

```
-13.6 / n^2
```

必填：`n` (主量子数 n)

Eₙ = -13.6/n² eV。

## physics/relativity

### lorentz_factor

**洛伦兹因子** · 层级 fundamental · 领域 物理 · 主角频率 low

```
1 / sqrt(1 - (v / c)^2)
```

必填：`v` (速度 m/s)
可选：`c`=299792458 (光速 m/s（架空世界可改）)

γ = 1/√(1-β²)。

### time_dilation

**时间膨胀** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 s

```
dt0 / sqrt(1 - (v / c)^2)
```

必填：`dt0` (固有时间 s)、`v` (速度 m/s)
可选：`c`=299792458 (光速 m/s)

Δt = γΔt₀。

### length_contraction

**长度收缩** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 m

```
L0 * sqrt(1 - (v / c)^2)
```

必填：`L0` (固有长度 m)、`v` (速度 m/s)
可选：`c`=299792458 (光速 m/s)

L = L₀/γ。

### mass_energy

**质能方程** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 J

```
m * c^2
```

必填：`m` (质量 kg)
可选：`c`=299792458 (光速 m/s)

E = mc²。

### relativistic_energy

**相对论总能量** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 J

```
m * c^2 / sqrt(1 - (v / c)^2)
```

必填：`m` (静止质量 kg)、`v` (速度 m/s)
可选：`c`=299792458 (光速 m/s)

E = γmc²。

## physics/scaling

### square_cube_law

**平方-立方定律** · 层级 phenomenological · 领域 物理 · 主角频率 medium · 单位 倍数

```
(s^3) / (s^2)
```

必填：`s` (线性缩放倍数)

体积按 s³ 增长、截面积按 s² 增长，故单位面积承重按 s 增长。巨兽悖论的根源。

### mass_scaling

**质量缩放** · 层级 phenomenological · 领域 物理 · 主角频率 medium · 单位 kg

```
m0 * s^3
```

必填：`m0` (基准质量 kg)、`s` (线性缩放倍数)

几何相似时质量正比于长度的三次方。

### strength_scaling

**承重能力缩放** · 层级 phenomenological · 领域 物理 · 主角频率 medium · 单位 N

```
F0 * s^2
```

必填：`F0` (基准承重 N)、`s` (线性缩放倍数)

承重正比于截面积 s²。

### kleiber

**克莱伯定律（代谢率）** · 层级 phenomenological · 领域 物理 · 主角频率 medium · 单位 W

```
B0 * (m / m0)^0.75
```

必填：`B0` (基准代谢率 W)、`m0` (基准质量 kg)、`m` (目标质量 kg)

代谢率 ∝ 质量^¾。架空生物若无此约束，把指数当参数另算。

### allometric

**通用异速生长律** · 层级 phenomenological · 领域 物理 · 主角频率 medium

```
Y0 * (m / m0)^b
```

必填：`Y0` (基准量)、`m0` (基准质量 kg)、`m` (目标质量 kg)、`b` (标度指数)

Y = Y₀(m/m₀)^b。b 可任意改，用于架空生物设定。

## physics/thermo

### ideal_gas

**理想气体状态方程** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m^3

```
n * R * T / P
```

必填：`n` (物质的量 mol)、`T` (温度 K)
可选：`R`=8.314462618 (气体常数)、`P`=101325 (压强 Pa)

V = nRT/P。

### heat_capacity

**显热** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 J

```
m * c * dT
```

必填：`m` (质量 kg)、`c` (比热容 J/(kg·K))、`dT` (温差 K)

Q = mcΔT。

### latent_heat

**潜热** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 J

```
m * L
```

必填：`m` (质量 kg)、`L` (潜热 J/kg)

Q = mL（相变不升温）。

### mix_temperature

**混合终温** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 K

```
(m1 * c1 * T1 + m2 * c2 * T2) / (m1 * c1 + m2 * c2)
```

必填：`m1` (质量1 kg)、`c1` (比热1)、`T1` (初温1 K)、`m2` (质量2 kg)、`c2` (比热2)、`T2` (初温2 K)

能量守恒下的热平衡温度。

### thermal_expansion

**线膨胀** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m

```
alpha * L * dT
```

必填：`alpha` (线膨胀系数 1/K)、`L` (原长 m)、`dT` (温差 K)

ΔL = αLΔT。

### stefan_boltzmann

**黑体辐射功率** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 W

```
sigma * A * T^4
```

必填：`A` (表面积 m²)、`T` (温度 K)
可选：`sigma`=5.670374419e-8 (斯特藩常数)

P = σAT⁴。

### wien_displacement

**维恩位移峰值波长** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m

```
bWien / T
```

必填：`T` (温度 K)
可选：`bWien`=0.002897771955 (维恩常数)

λmax = b/T。

### carnot_efficiency

**卡诺效率** · 层级 derived · 领域 物理 · 主角频率 medium

```
1 - Tc / Th
```

必填：`Tc` (低温热源 K)、`Th` (高温热源 K)

任何热机的理论上限。

### thermal_conductivity

**热传导速率** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 W

```
k * A * dT / d
```

必填：`k` (导热系数 W/(m·K))、`A` (面积 m²)、`dT` (温差 K)、`d` (厚度 m)

Q/t = kAΔT/d。房屋/盔甲保温推演。

### convection

**对流散热** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 W

```
h * A * dT
```

必填：`h` (对流系数 W/(m²·K))、`A` (面积 m²)、`dT` (温差 K)

Q/t = hAΔT。

### entropy_change

**熵变（可逆过程）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 J/K

```
Q / T
```

必填：`Q` (热量 J)、`T` (温度 K)

ΔS = Q/T。热力学第二定律推演。

### carnot_cop

**卡诺制冷系数** · 层级 derived · 领域 物理 · 主角频率 medium

```
Tc / (Th - Tc)
```

必填：`Tc` (低温 K)、`Th` (高温 K)

制冷机的理论极限 COP。

### mean_free_path

**分子平均自由程** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m

```
kB * T / (sqrt(2) * pi * d^2 * P)
```

必填：`T` (温度 K)、`d` (分子直径 m)、`P` (压强 Pa)
可选：`kB`=1.380649e-23 (玻尔兹曼常数)

稀薄气体/高空环境用。

### rms_speed

**方均根速率** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m/s

```
sqrt(3 * R * T / M)
```

必填：`T` (温度 K)、`M` (摩尔质量 kg/mol)
可选：`R`=8.314462618 (气体常数)

v_rms = √(3RT/M)。

### most_probable_speed

**最概然速率** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m/s

```
sqrt(2 * R * T / M)
```

必填：`T` (温度 K)、`M` (摩尔质量 kg/mol)
可选：`R`=8.314462618 (气体常数)

麦克斯韦速率分布峰值。

### thermal_voltage

**热电压** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 V

```
kB * T / e_charge
```

可选：`T`=300 (温度 K)、`kB`=1.380649e-23 (玻尔兹曼常数)、`e_charge`=1.602176634e-19 (元电荷)

V_T = kT/e ≈ 25.85mV @ 300K。

## physics/waves

### wave_speed

**波速** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m/s

```
f * lambda
```

必填：`f` (频率 Hz)、`lambda` (波长 m)

v = fλ。

### decibel

**声压级（分贝）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 dB

```
10 * log(I / I0) / log(10)
```

必填：`I` (声强 W/m²)
可选：`I0`=1e-12 (基准声强 W/m²)

dB = 10·log₁₀(I/I₀)。

### doppler

**多普勒频移（源移动）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Hz

```
f0 * vs / (vs - v)
```

必填：`f0` (原频率 Hz)、`v` (源速 m/s（靠近为正）)
可选：`vs`=343 (声速 m/s)

f = f₀·vs/(vs-v)。

### string_frequency

**弦振动基频** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Hz

```
sqrt(T / mu) / (2 * L)
```

必填：`T` (张力 N)、`mu` (线密度 kg/m)、`L` (弦长 m)

f = √(T/μ)/(2L)。乐器/建筑共振推演。

### pipe_frequency

**管中驻波基频（两端开口）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Hz

```
vs / (2 * L)
```

必填：`L` (管长 m)
可选：`vs`=343 (声速 m/s)

f = v/(2L)。

### sound_intensity

**球面声强** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 W/m²

```
P / (4 * pi * r^2)
```

必填：`P` (声功率 W)、`r` (距离 m)

I = P/(4πr²)。

### beat_frequency

**拍频** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Hz

```
abs(f1 - f2)
```

必填：`f1` (频率1 Hz)、`f2` (频率2 Hz)

|f₁-f₂|。

### standing_wave_wavelength

**驻波波长（第 n 谐波）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 m

```
2 * L / n
```

必填：`L` (弦/管长 m)、`n` (谐波次数)

λ = 2L/n。

## social/demography

### population_exponential

**马尔萨斯人口增长** · 层级 conventional · 领域 社会 · 主角频率 medium · 单位 人

```
N0 * exp(r * t)
```

必填：`N0` (初始人口)、`r` (增长率 1/年)、`t` (年数)

无约束指数增长。

### population_logistic

**逻辑斯蒂人口（t 时刻）** · 层级 conventional · 领域 社会 · 主角频率 medium · 单位 人

```
K / (1 + ((K - N0) / N0) * exp(-r * t))
```

必填：`K` (环境容量)、`N0` (初始人口)、`r` (内禀增长率)、`t` (年数)

有上限的人口演化。架空世界承载力设定必用。

## social/development

### literacy_proxy

**人力资本指数（教育年限代理）** · 层级 conventional · 领域 社会 · 主角频率 medium

```
years / max_years
```

必填：`years` (平均受教育年限)
可选：`max_years`=18 (理论上限)

0-1 归一化的人力资本。

## social/ecology

### simpson_diversity

**辛普森多样性指数** · 层级 conventional · 领域 社会 · 主角频率 medium · JS 内置实现

```
D = 1 - Σ pᵢ²
```

必填：`p` (各物种相对丰度数组)

D = 1 - Σp²。生态/语言多样性。

### lotka_volterra_equilibrium

**洛特卡-沃尔泰拉平衡点** · 层级 conventional · 领域 社会 · 主角频率 medium

```
d / beta
```

必填：`d` (捕食者死亡率)、`beta` (捕食效率)

猎物平衡量 x* = d/β。完整轨迹需要数值积分。

## social/economics

### gravity_trade

**引力模型（贸易/迁徙）** · 层级 conventional · 领域 社会 · 主角频率 medium

```
G * M1 * M2 / D^beta
```

必填：`M1` (规模1（人口/GDP）)、`M2` (规模2)、`D` (距离)
可选：`G`=1 (耦合常数)、`beta`=2 (距离衰减指数)

T = G·M₁M₂/D^β。城市间互动、贸易流。

## social/epidemiology

### r0_basic

**基本传染数 R₀** · 层级 conventional · 领域 社会 · 主角频率 medium

```
beta / gamma
```

必填：`beta` (传播率 1/时间)、`gamma` (康复率 1/时间)

R₀ = β/γ。R₀>1 疫情扩散。

### herd_immunity

**群体免疫阈值** · 层级 conventional · 领域 社会 · 主角频率 medium

```
1 - 1 / R0
```

必填：`R0` (基本传染数)

需免疫的人口比例。

### sir_equilibrium

**SIR 最终感染比例（隐式解近似）** · 层级 conventional · 领域 社会 · 主角频率 medium

```
1 - exp(-R0 * x)
```

必填：`R0` (基本传染数)、`x` (最终感染比例猜测值（迭代求解用）)

S∞ 满足 1-S∞ = exp(-R₀(1-S∞))。传入猜测值做不动点迭代。

## social/inequality

### gini

**基尼系数（分组近似）** · 层级 conventional · 领域 社会 · 主角频率 low · JS 内置实现

```
G = 1 - Σ (yᵢ + yᵢ₋₁)·(1/n)
```

必填：`y` (按收入升序排列的收入份额数组)

分组数据的梯形法近似。小样本建议直接用 operation="stats" 取分位数后手工积分。

### hhi

**赫芬达尔-赫希曼指数** · 层级 conventional · 领域 社会 · 主角频率 low · JS 内置实现

```
HHI = Σ sᵢ²
```

必填：`s` (各主体份额数组（小数，如 [0.4,0.3,0.3]）)

市场集中度。HHI>0.25 视为高度集中。

### power_law

**幂律分布（齐夫定律）** · 层级 conventional · 领域 社会 · 主角频率 low

```
C * rank^(-alpha)
```

必填：`C` (归一化常数)、`rank` (排名)、`alpha` (幂指数 α)

y = C·r^(-α)。城市规模、财富、词频通用。

## social/information

### shannon_entropy

**香农熵** · 层级 conventional · 领域 社会 · 主角频率 low · 单位 bit · JS 内置实现

```
H = -Σ pᵢ·log_base(pᵢ)
```

必填：`p` (概率分布数组（各分量和为 1）)
可选：`base`=2 (对数底，2=比特)

H = -Σp·log_base(p)。信息量/多样性度量。

### information_propagation

**信息传播（单源扩散）** · 层级 conventional · 领域 社会 · 主角频率 low

```
N * (1 - exp(-k * t))
```

必填：`N` (总人口)、`k` (传播速率)、`t` (时间)

知识/谣言波及人数。

## social/politics

### duverger_index

**有效政党数（拉阿克指数）** · 层级 conventional · 领域 社会 · 主角频率 medium · JS 内置实现

```
1 / sum(s^2)
```

必填：`s` (各党得票份额数组)

N = 1/Σp²。衡量政党体系碎片化程度。

### banzhaf_power

**班茨哈夫权力指数（简化）** · 层级 conventional · 领域 社会 · 主角频率 medium

```
1 / n
```

必填：`n` (投票者数量)

等权情形的基线。加权情形需枚举联盟，不在此公式范围。

### popitz_law

**波皮茨定律（财富幂律指数）** · 层级 conventional · 领域 社会 · 主角频率 medium

```
1 / (1 - a)
```

必填：`a` (帕累托指数 α（越大越平等）)

财富分布的幂律关系。

### cost_of_corruption

**腐败成本占 GDP 比例** · 层级 conventional · 领域 社会 · 主角频率 medium

```
gdp * rate
```

必填：`gdp` (GDP)、`rate` (腐败损耗率)

制度效率损失的粗略估算。

### tragedy_commons

**公地可持续开采量** · 层级 conventional · 领域 社会 · 主角频率 medium

```
R * regeneration
```

必填：`R` (资源存量)、`regeneration` (再生率 1/时间)

可持续采伐上限。超出即资源崩溃。

## social/urban

### urban_scaling

**城市规模标度律** · 层级 conventional · 领域 社会 · 主角频率 medium

```
Y0 * (P / P0)^b
```

必填：`Y0` (基准产出)、`P0` (基准人口)、`P` (目标人口)
可选：`b`=1.15 (超线性指数)

城市创新/产出随人口超线性增长（b≈1.15）。基础设施是亚线性（b≈0.85）。
