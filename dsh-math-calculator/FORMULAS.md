# 公式库完整清单

> 共 **528** 条，**75** 个分类。由 `node test/formulas-list.mjs` 从代码导出。

调用方式：`{ "operation": "formula", "formula": "<id>", "overrides": {...} }`

**所有参数都可被 `overrides` 覆盖**，这是架空世界改造的基础。

## 规则层级（离最底层规则的远近）

| 层级 | rank | 含义 | 条数 |
|---|---|---|---|
| 基本规则（fundamental） | 1 | 守恒律、相对论、量子、热力学定律——自然律本身 | 35 |
| 数学基础（mathematical） | 1 | 公理、定义与纯数学定律（几何、级数、增长）——与基本规则同属最底层 | 14 |
| 导出规律（derived） | 2 | 由基本规则推出、有闭合形式的经典关系 | 247 |
| 经验规律（phenomenological） | 3 | 带实验拟合系数，量级可信、具体数字有误差 | 73 |
| 工程换算（engineering） | 4 | 几何、配比、剂量、补给——由定义与算术决定 | 112 |
| 社会约定（conventional） | 5 | 货币、制度、统计口径——由人类约定而非自然律 | 47 |

> rank 相同表示同级：**数学基础与基本规则同属最底层**。

## 学科领域（多标签）

| 领域 | 条数 |
|---|---|
| 物理（physics） | 247 |
| 化学（chemistry） | 29 |
| 生物（biology） | 74 |
| 材料（materials） | 47 |
| 地球（earth） | 12 |
| 天文（astronomy） | 31 |
| 工程（engineering） | 97 |
| 军事（military） | 14 |
| 农业（agriculture） | 26 |
| 医学（medicine） | 18 |
| 经济（economics） | 44 |
| 社会（social） | 20 |
| 数学（math） | 22 |

> 注意：`cat` 只是旧的路径字段；分类请用「规则层级 + 学科领域」。
> `frequency` 指**主角视角**感知频率，不是世界观推导常用度。

## 目录

- [agriculture/storage](#agriculturestorage) — 2 条
- [biology/ecology](#biologyecology) — 13 条
- [biology/genetics](#biologygenetics) — 1 条
- [biology/growth](#biologygrowth) — 1 条
- [biology/kinetics](#biologykinetics) — 2 条
- [biology/physiology](#biologyphysiology) — 20 条
- [biology/scaling](#biologyscaling) — 1 条
- [biology/transport](#biologytransport) — 3 条
- [chemistry/acid](#chemistryacid) — 1 条
- [chemistry/electro](#chemistryelectro) — 1 条
- [chemistry/kinetics](#chemistrykinetics) — 4 条
- [chemistry/mole](#chemistrymole) — 6 条
- [chemistry/nuclear](#chemistrynuclear) — 1 条
- [chemistry/solution](#chemistrysolution) — 9 条
- [chemistry/thermo](#chemistrythermo) — 1 条
- [econ/finance](#econfinance) — 18 条
- [econ/growth](#econgrowth) — 4 条
- [econ/io](#econio) — 1 条
- [econ/macro](#econmacro) — 10 条
- [econ/micro](#econmicro) — 2 条
- [econ/production](#econproduction) — 1 条
- [econ/utility](#econutility) — 1 条
- [engineering/energy](#engineeringenergy) — 2 条
- [engineering/fluid](#engineeringfluid) — 4 条
- [engineering/mechanics](#engineeringmechanics) — 3 条
- [engineering/precision](#engineeringprecision) — 1 条
- [engineering/process](#engineeringprocess) — 23 条
- [engineering/structures](#engineeringstructures) — 7 条
- [engineering/thermal](#engineeringthermal) — 5 条
- [materials/constitutive](#materialsconstitutive) — 3 条
- [materials/fundamental](#materialsfundamental) — 4 条
- [materials/microstructure](#materialsmicrostructure) — 1 条
- [materials/property](#materialsproperty) — 1 条
- [materials/selection](#materialsselection) — 1 条
- [materials/structures](#materialsstructures) — 13 条
- [math/geometry](#mathgeometry) — 15 条
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
- [perception/travel](#perceptiontravel) — 13 条
- [perception/weather](#perceptionweather) — 7 条
- [physics/astronomy](#physicsastronomy) — 16 条
- [physics/em](#physicsem) — 48 条
- [physics/fluid](#physicsfluid) — 6 条
- [physics/gravity](#physicsgravity) — 8 条
- [physics/mechanics](#physicsmechanics) — 46 条
- [physics/nuclear](#physicsnuclear) — 12 条
- [physics/optics](#physicsoptics) — 13 条
- [physics/quantum](#physicsquantum) — 3 条
- [physics/relativity](#physicsrelativity) — 5 条
- [physics/scaling](#physicsscaling) — 5 条
- [physics/thermo](#physicsthermo) — 17 条
- [physics/waves](#physicswaves) — 8 条
- [power/diffusion](#powerdiffusion) — 2 条
- [power/energy](#powerenergy) — 3 条
- [power/fiscal](#powerfiscal) — 9 条
- [power/food](#powerfood) — 3 条
- [power/information](#powerinformation) — 2 条
- [social/demography](#socialdemography) — 2 条
- [social/development](#socialdevelopment) — 1 条
- [social/ecology](#socialecology) — 2 条
- [social/economics](#socialeconomics) — 1 条
- [social/epidemiology](#socialepidemiology) — 3 条
- [social/inequality](#socialinequality) — 3 条
- [social/information](#socialinformation) — 2 条
- [social/politics](#socialpolitics) — 5 条
- [social/urban](#socialurban) — 1 条

## agriculture/storage

### storage_loss

**储备损耗（t 年后还剩多少）** · 层级 derived · 领域 农业、工程 · 主角频率 high · 单位 与 initial 同单位（t 年后的剩余量）

```
initial * (1 - loss_rate)^years
```

必填：`initial` (入储量（kg 或任何同单位存量）)、`years` (储存年数)
可选：`loss_rate`=0.04 (年损耗率（谷仓 0.03~0.05、洞库 0.01~0.02、窖藏 0.08~0.10、露天 0.15~0.25）)

N = N₀·(1−r)^t。**「存两年还够不够」的唯一算法**。★ 为什么是指数而不是线性：每期损耗作用在**当时的剩余量**上，不是作用在初始量上。  写成 N₀−r·N₀·t 会在 t 大时算出负数，那是不可能的 —— 损耗永远拿不光存量。★ 复利式衰减的可操作推论：**损耗率减半的收益远大于储量翻倍**。  存 2 年：谷仓（r=0.04）剩 92.2%，露天（r=0.15）剩 72.3% —— 差 20 个百分点；  存 5 年：谷仓剩 81.5%、露天剩 44.4% —— 差距拉大到 37 个百分点。  所以「挖洞库 / 建谷仓」比「多种一倍」划算，而且后者受地力限制，前者不受。★ 与 soil_nutrient_balance 同形（都是「每期按比例减」），但含义不同：  那条问地力，这条问库存。两者相乘才知道「三年储备」实际能撑几年。⚠ 假设损耗率恒定。真实储存有两个已知偏离：  ① 初入库的一段（含水率高、有虫卵）损耗远高于均值，俗称「入仓损耗」；  ② 霉变是**阈值型**而非连续型 —— 水分活度一旦越线，损耗率会跳一个数量级。  这两点都在式外，见 drying_time 与 aw 相关的说明。

### drying_time

**干燥时间（降到安全含水率要多久）** · 层级 derived · 领域 农业、工程 · 主角频率 high · 单位 天（达到目标含水率所需时间）

```
-(log((m_final - m_equilibrium) / (m_initial - m_equilibrium))) / k_dry
```

必填：`m_initial` (初始含水率（湿基，小数；新谷约 0.20~0.25）)、`m_final` (目标含水率（安全储存约 0.13~0.14）)
可选：`m_equilibrium`=0.12 (平衡含水率（与当地相对湿度平衡；干燥环境 0.08~0.14）)、`k_dry`=0.15 (干燥速率常数（1/天；日晒 0.2~0.4、通风阴干 0.05~0.12、烘干 1~3）)

t = −ln[(M_f−M_e)/(M_0−M_e)]/k。**为什么最后几个点总是特别难干**的数学原因。★ 形式来自「干燥速率正比于超出平衡水分的部分」—— 与牛顿冷却、电容放电同一条律，  所以它天然给出「先快后慢」：从 25% 降到 20% 很快，从 15% 降到 14% 要花同样甚至更多时间。★ 关键推论：**目标定得越低，时间不是线性增加而是发散**。  M_e=0.12、k=0.30 时想干到 0.14（差 0.02）→ 6.2 天；想干到 0.121（差 0.001）→ 16.2 天。  差 20 倍的目标余量，只换来 2.6 倍时间 —— 但再往下就发散了（差 0.0001 → 23.9 天）。  这就是「安全含水率 13~14%」是工程红线而不是越干越好 —— 再干下去收益趋零、代价趋无穷。★ 升温提 k 比延长时间有效（与 case_depth、sintering_porosity 同一条教训）：  k 翻倍时间减半；而想靠延长把 14% 干到 12%，要多花一倍以上的时间且可能过干开裂。⚠ 单指数式只描述**降速干燥段**。刚采收的高含水物料还有一段恒速段（表面自由水），  实际时间会比本式短一些；反过来厚堆、不翻动时内部扩散控制，会比本式长很多。⚠ k_dry 与物料形态强相关（颗粒/整穗/切片差 3~5 倍），必须按实际堆法取，不能套用。★ 实测对照：新谷 25% 晒到 14%（k=0.30）约 6.2 天；同样目标改阴干（k=0.10）约 18.7 天。

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

### grazing_capacity

**草地载畜量** · 层级 phenomenological · 领域 生物、perception · 主角频率 high · 单位 头（可承载标准畜单位）

```
area * yield_per_ha * util / (intake * days)
```

必填：`area` (草场面积 ha（公顷，1 ha = 1e4 m²）)、`yield_per_ha` (单位面积产草量 kg/(ha·年)（温带草原 2000~5000，荒漠 200~500）)、`intake` (每头每日采食量 kg/头·日（牛 40~60，羊 5~8）)
可选：`util`=0.5 (可利用率（放牧通常 0.4~0.6，留一半给草场恢复）)、`days`=365 (放牧天数（全年 365，季节性牧场按实际）)

载畜量 = 面积 × 产草量 × 利用率 /(采食量 × 天数)。**「留一半」不是保守，是必需**：草地超载后会退化，第二年产量直接腰斩。这条是游牧与畜牧设定的地基。

### livestock_growth_time

**畜禽出栏时间（按日增重）** · 层级 phenomenological · 领域 生物、perception · 主角频率 high · 单位 日

```
(target_weight - birth_weight) / adg
```

必填：`target_weight` (出栏体重 kg)、`birth_weight` (初生体重 kg（仔猪 1.5，犊牛 40，羔羊 3）)、`adg` (平均日增重 kg/日（肉猪 0.7~1.0，肉牛 0.8~1.2，肉鸡 0.05）)

出栏天数 = (出栏重 − 初生重)/日增重。**猪约 180 天、牛约 450 天、肉鸡约 42 天**——这个比值决定了肉价与牧场的周转率。日增重随饲料与品种变，写设定时要说清是哪种。

### feed_conversion_ratio

**饲料转化率（料肉比）** · 层级 phenomenological · 领域 生物、perception · 主角频率 high · 单位 无量纲（kg 料/kg 肉）

```
feed_consumed / weight_gain
```

必填：`feed_consumed` (消耗饲料总量 kg（干物质）)、`weight_gain` (增重 kg)

料肉比 = 耗料/增重。**牛肉 6~8、猪肉 2.5~3.5、肉鸡 1.6~2.0**——这个数字直接决定「养一头牛要多少亩地」。牛高是因为反刍动物维持消耗大，不是品种差。

### crop_yield_npp

**农田可收获能量（由 NPP 与收获指数）** · 层级 phenomenological · 领域 生物、perception · 主角频率 high · 单位 g（干物质）

```
NPP * area * hi * 1e4
```

必填：`NPP` (净初级生产力 g/(m²·年)（温带农田 800~1500，热带 2000+）)、`area` (面积 ha)
可选：`hi`=0.4 (收获指数（谷物 0.4~0.5，块根作物 0.6，牧草 0.9）)

可收获干物质 = NPP × 面积 × 收获指数。收获指数是「长出来的东西里有多少是我们要吃的部分」——谷物的 0.4 意味着**六成生物量是秸秆**，那正是牲畜饲料与燃料的来源。

### trophic_chain_support

**营养级可支撑的生物量（十分之一定律）** · 层级 derived · 领域 生物 · 主角频率 high · 单位 kg

```
primary * eff^level
```

必填：`primary` (初级生产者生物量 kg)、`level` (营养级层数（草食 1，一级肉食 2，顶级 3~4）)
可选：`eff`=0.1 (营养级传递效率（陆地 0.1，海洋 0.1~0.15，以肉食为主时更低）)

每升一级只剩约 10%。**这就是为什么食物链一般不超过 5 级，也是为什么顶级捕食者稀少**：要养活 1 kg 狼，需要 10 kg 兔、100 kg 草。写生态设定时这条能立刻否掉「满地猛兽」的方案。

### logistic_growth_rate

**逻辑斯谛增长（环境容纳量限制）** · 层级 phenomenological · 领域 生物、农业 · 主角频率 high · 单位 个体/年（净增长速率）

```
r * population * (1 - population / carrying_capacity)
```

必填：`r` (内禀增长率 r（1/年；鹿约 0.3~0.5，野猪约 0.6~1.0）)、`population` (当前种群个体数 N)、`carrying_capacity` (环境容纳量 K（个体数）)

dN/dt = r·N·(1−N/K)。种群增长被「还剩多少空间」线性刹住。★ 关键结构：N = K/2 时增长最快，速率恰为 rK/4 —— 这正是「最大可持续产量」的由来。N → K 时增长归零，不是因为食物一粒不剩，而是拥挤/疾病/领地在先起作用。★ 与 sustainable_harvest 成对使用：这条算「今年多出来多少」（猎获只该取这一块增量），那条算「长期上限」。⚠ 确定性连续模型：小种群要另加 Allee 效应（N 很小时反而负增长），        离散化且 r > 2.5 时会人为振荡。二者都不在本式内。★ 实测对照：鹿 r=0.4、K=400 → N=200 时年增 40 只；N=350 时年增 17.5 只。

### sustainable_harvest

**最大可持续猎获量（MSY）** · 层级 derived · 领域 生物、农业 · 主角频率 high · 单位 个体/年（长期不把种群打崩的年获取上限）

```
r * carrying_capacity / 4
```

必填：`r` (内禀增长率 r（1/年，与 logistic_growth_rate 同口径）)、`carrying_capacity` (环境容纳量 K（个体数）)

H_max = r·K/4。由 logistic_growth_rate 在 N = K/2 处取极值推出。★ 为什么是 1/4 而不是 1/2：N=K/2 只是「种群减半时的存量」，每年真正多出来的增量是 rK/4 —— 取存量会把本金也吃掉。所以「猎一半」比「猎增量」危险得多，这条式子把两者区分开。★ 与 trophic_chain_support / grazing_capacity 分工：那两条算「能养多少」，这条算「每年能拿走多少而不降级」。⚠ 假设恒定环境、无年龄结构、无捕食者。实际管理常取 0.5~0.7·H_max 留安全余量。★ 实测对照：鹿 K=400、r=0.4 → H_max = 40 只/年；        设定集「猎 15~25 只/年」= 38%~63% MSY，属保守可取。

## biology/genetics

### hardy_weinberg

**哈迪-温伯格基因型频率** · 层级 fundamental · 领域 生物 · 主角频率 high · 单位 无量纲（应恒为 1，用于自检与分项计算）

```
p^2 + 2 * p * q + q^2
```

必填：`p` (等位基因 A 频率（0—1）)、`q` (等位基因 a 频率（0—1）)

p² + 2pq + q² = 1。**这是纯概率论结论**（配子随机组合），不需要任何生物机制，所以只要「存在等位基因 + 随机交配」它就成立 —— 跨世界完全通用。★ 常算的是中间项 2pq：隐性基因的携带者比例。例 p=0.9、q=0.1 → 2pq=18%，即每 100 人里有 18 个携带者，而表现型只有 q²=1%。★ 若结果明显不等于 1，说明 p+q≠1，输入有误 —— 这是一条自带自检的公式。

## biology/growth

### gompertz_growth

**Gompertz 生长曲线** · 层级 phenomenological · 领域 生物 · 主角频率 high · 单位 与 asymptote 同单位

```
asymptote * exp(-shape * exp(-rate * t))
```

必填：`asymptote` (渐近上限（最终体型/规模）)、`shape` (形状参数 b（决定曲线起点位置）)、`rate` (早期增长率 c（1/时间）)、`t` (时间)

N(t) = a·exp(−b·exp(−c·t))。描述「越大长得越慢」的通用形式。★ 比指数与 logistic 更贴合**有机体**的真实生长（logistic 更偏种群）：跨动物、植物、细菌、肿瘤都拟合良好。★ 三个参数的物理含义：a = 渐近上限，c = 早期增长率，b = 曲线形状与起点。★ 跨世界照用：形式通用，系数按对象标定。

## biology/kinetics

### michaelis_menten

**米氏方程（饱和动力学）** · 层级 fundamental · 领域 生物 · 主角频率 high · 单位 与 vmax 同单位（速率）

```
vmax * substrate / (km + substrate)
```

必填：`vmax` (最大速率 Vmax)、`km` (半饱和常数 Km（速率达 Vmax/2 时的底物浓度）)、`substrate` (底物浓度 S)

v = Vmax·S/(Km+S)。一条式子覆盖五种现象：酶动力学、载体转运、Holling II 型摄食功能反应、受体结合、土壤养分吸收 —— 因为它们都是同一个「先线性、再饱和」的双曲线形式。★ 结构性质：S ≪ Km 时 v ≈ (Vmax/Km)·S（线性）；S ≫ Km 时 v → Vmax（饱和）。这个「处理能力有限必然饱和」是所有系统的共同特征。★ 与 q10_temperature 配合：前者管底物，后者管温度上限。

### q10_temperature

**Q₁₀ 温度系数（生物代谢的温度律）** · 层级 phenomenological · 领域 生物 · 主角频率 high · 单位 与 rate_ref 同单位（速率）

```
rate_ref * q10^((temperature - temp_ref) / 10)
```

必填：`rate_ref` (参考温度下的速率)、`temperature` (实际温度)、`temp_ref` (参考温度)
可选：`q10`=2.5 (Q₁₀ 系数（跨类群常见 2~3）)

R(T) = R₀·Q₁₀^((T−T₀)/10)。温度每升高 10 度，速率变为 Q₁₀ 倍。★ 这是**生物系统实际使用的温度律**：生态模型几乎都用它，因为不需要活化能 Ea（那要查专业表）。★ 与库里已有的 arrhenius（化学式，要 Ea）并存而不替代：化学场景用 Arrhenius，生物场景用 Q₁₀ —— 同一条规律的两种学科参数化。★ Q₁₀ 跨类群很稳（2~3），这是它比 Arrhenius 更好用的原因。

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

### metabolic_generic

**代谢率（普适幂律，系数可换）** · 层级 derived · 领域 生物 · 主角频率 high · 单位 kcal/day

```
k * mass^exponent
```

必填：`mass` (体重 kg)
可选：`k`=70 (代谢系数，单位 kcal/day·kg^0.75（地球哺乳类约 70）)、`exponent`=0.75 (标度指数（分形输运网络 → 0.75）)

克莱伯定律的显式形式 BMR = k·M^0.75。**注意 k 的量纲含 kg^0.75**：k=70 时，70 kg 的人得 1694 kcal/day（约 70×70^0.75），不是 70 kcal —— 70 这个数常被误读成「人的代谢率」，其实是「1 kg 基准下的系数」。**指数 0.75 是无量纲的、跨世界应成立**（分形输运网络的最优标度）；系数 k 是地球生物标定，会因生物化学与体温不同而变。异星生物改 k 即可，不必改指数。这比 Mifflin 那种线性拟合式通用得多。

### convective_cooling_generic

**对流散热系数（普适版，含大气密度）** · 层级 derived · 领域 物理、生物 · 主角频率 medium · 单位 W/(m²·K)

```
10 * sqrt(v) * (density / 1.225)^0.8
```

可选：`v`=1 (风速 m/s)、`density`=1.225 (大气密度 kg/m³（地球 1.225；0.1 atm 约 0.12）)

对流换热系数的量级估计。**这是「风寒/酷热感」的物理内核**：经验公式（风寒指数）把人体与地球大气烘焙进了系数，换世界就失效；而这个幂律形式 h ∝ v^0.5 · ρ^0.8 是流体力学标度，跨世界成立。稀薄大气（0.1 atm）里散热系数只有地球的约 15% —— 这就是「真空里不觉得冷」的原因。

## biology/scaling

### sa_volume_ratio

**表面积-体积比（几何必然）** · 层级 fundamental · 领域 生物 · 主角频率 high · 单位 m²（表面积；除以 mass 即单位体重的表面积）

```
surface_coeff * mass^(2/3)
```

必填：`mass` (体重 kg)
可选：`surface_coeff`=0.11 (表面积系数（人体约 0.11，即 A ≈ 0.11·M^(2/3)）)

A ∝ M^(2/3)，故「面积/体积」∝ M^(−1/3)。**指数 2/3 是纯几何** ——任何三维物体体积 ∝ L³、表面积 ∝ L² 都成立，不需要任何生物假设，故跨物种、跨世界、甚至非碳基生命都适用。★ 一个式子回答巨兽设定的两个核心问题：体重 ×8 → 表面积 ×4 →单位体重散热能力 ÷2（为什么会过热）；鳃面积同样只 ×4 → 单位体重摄氧 ÷2（为什么会缺氧）。★ Du Bois 那种人体经验式（body_surface_area）外推到 9000 吨必错；但这条给的是比例关系 —— 而判断大尺度是否可行，靠的就是比例。

## biology/transport

### fick_diffusion

**菲克扩散通量（呼吸/吸收/供氧）** · 层级 fundamental · 领域 生物 · 主角频率 high · 单位 物质通量（与 ΔC·D 的单位配套）

```
diffusion_coeff * area * delta_conc / thickness
```

必填：`diffusion_coeff` (扩散系数 D m²/s（O₂ 在水中 2e-9、在空气中 2e-5）)、`area` (交换面积 m²)、`delta_conc` (浓度差或分压差（与 D 单位配套）)、`thickness` (屏障厚度 m)

J = D·A·ΔC/δ。鳃、肺、皮肤吸收、根吸水、细胞膜运输全是同一个式子。★ 纯物理，不含物种假设；它也是鳃氧限制理论（GOLT）的根基。★ 关键推论：A ∝ M^(2/3)、δ ∝ M^(1/3)，故供氧能力 ∝ M^(1/3) ——这就是「大生物必须换气而不能靠扩散」的定量证明。★ 与 diffusion_time 配合：前者给通量，后者给「扩散够不够快」。

### diffusion_time

**扩散时间标度（尺寸上限的判据）** · 层级 derived · 领域 生物 · 主角频率 high · 单位 s（扩散跨越该距离所需时间）

```
distance^2 / (2 * diffusion_coeff)
```

必填：`distance` (特征长度 m)、`diffusion_coeff` (扩散系数 D m²/s（蛋白在水中约 1e-10）)

t ≈ Δx²/(2D)。布朗运动的数学结论，与是不是生物无关。★ 尺寸上限的直接判据（蛋白在水里 D≈1e-10）：1 µm → 5 ms ｜ 10 µm → 0.5 s（细胞尺度，够用）｜ 1 mm → 83 min（已不够）｜1 m → 158 年（不可能）—— 所以大生物必须有循环系统。★ 这条能立刻否掉「靠扩散供氧的巨兽」方案，且用的是硬数学而非估计。

### peclet_number

**佩克莱数（扩散 vs 对流）** · 层级 derived · 领域 生物、物理 · 主角频率 medium · 单位 无量纲（Pe ≪ 1 扩散主导；Pe ≫ 1 必须对流）

```
length * velocity / diffusion_coeff
```

必填：`length` (特征长度 m)、`velocity` (流速 m/s)、`diffusion_coeff` (扩散系数 D m²/s)

Pe = L·u/D。判断「靠扩散够不够、必须不必须对流」的无量纲判据。★ 它是 Reynolds 数的**质量输运版**：库里已有 reynolds（动量输运），但缺质量输运的对应物 —— 两者成对才有意义。★ 实例：毛细血管里血蛋白 v≈0.3 mm/s，微秒尺度扩散位移仅 0.3 nm → 扩散主导；大血管 u≈m/s → 对流主导。这解释了为什么微循环靠扩散、大循环必须泵。

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

### catalyst_rate_from_units

**酶活（单位 U 换算成 kat）** · 层级 phenomenological · 领域 化学 · 主角频率 medium · 单位 kat

```
U * 1.6666666666666667e-8
```

必填：`U` (酶活 U（µmol/min）)

1 U = 1 µmol/min ≈ 1.667×10⁻⁸ kat。实验报告多用 U，SI 用 kat。

### enzyme_activity_from_rata

**催化活度（底物消耗速率）** · 层级 phenomenological · 领域 化学 · 主角频率 medium · 单位 kat

```
delta_n / t
```

必填：`delta_n` (底物消耗量 mol)、`t` (时间 s)

kat = Δn/Δt，每秒转化多少摩尔底物。

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

### gas_volume_stp

**标准状况气体体积** · 层级 derived · 领域 化学 · 主角频率 medium · 单位 L

```
moles * 22.414
```

必填：`moles` (气体摩尔数 mol)

STP（273.15 K, 1 atm）下 1 mol 理想气体约 22.414 L。非标准状况用 PV=nRT（operation="evaluate" 可直接算）。

### particles_from_moles

**摩尔数换算粒子数** · 层级 derived · 领域 化学 · 主角频率 medium · 单位 个

```
n * 6.02214076e23
```

必填：`n` (摩尔数 mol)

阿伏伽德罗常数取 2019 SI 定义值。反向除一下即得摩尔数。

### moles_from_mass

**物质的量（质量/摩尔质量）** · 层级 derived · 领域 化学 · 主角频率 medium · 单位 mol

```
m / M
```

必填：`m` (质量 g)、`M` (摩尔质量 g/mol)

n = m/M。化学计量最基础的一条：18 g 水 = 1 mol。

### mass_from_moles_compound

**质量（物质的量×摩尔质量）** · 层级 derived · 领域 化学 · 主角频率 medium · 单位 g

```
n * M
```

必填：`n` (物质的量 mol)、`M` (摩尔质量 g/mol)

m = nM。与 moles_from_mass 互为逆式。

## chemistry/nuclear

### radioactive_remaining

**放射性剩余量** · 层级 derived · 领域 化学、物理 · 主角频率 high · 单位 与 N0 同单位

```
N0 * (1 / 2)^(t / half_life)
```

必填：`N0` (初始量（质量/摩尔数/活度都可）)、`t` (经过时间)、`half_life` (半衰期（与 t 同单位）)

每过一个半衰期剩一半。⚠️ t 与 half_life 必须同单位。习惯上 10 个半衰期后视为衰尽（剩 0.1%）。

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

### solubility_product

**溶度积 Ksp** · 层级 derived · 领域 化学 · 主角频率 medium · 单位 (mol/L)^(m+n)

```
cation^m * anion^n
```

必填：`cation` (阳离子浓度 mol/L)、`anion` (阴离子浓度 mol/L)
可选：`m`=1 (阳离子计量数)、`n`=1 (阴离子计量数)

难溶盐的溶解平衡常数。离子积 Q > Ksp 时沉淀析出，Q < Ksp 时会继续溶解。计量数按化学式：CaCl₂ 的 m=1, n=2。

### titration_moles

**滴定所需体积** · 层级 derived · 领域 化学 · 主角频率 medium · 单位 mL

```
C1 * V1 / C2
```

必填：`C1` (已知液浓度 mol/L)、`V1` (已知液体积 mL)、`C2` (待测液浓度 mol/L)

C₁V₁ = C₂V₂。1:1 反应的等当点。计量比不是 1:1 时先把 C₁ 除以计量比。

### molality

**质量摩尔浓度** · 层级 derived · 领域 化学 · 主角频率 medium · 单位 mol/kg

```
moles / kg_solvent
```

必填：`moles` (溶质摩尔数 mol)、`kg_solvent` (**溶剂**质量 kg（不是溶液质量）)

与体积摩尔浓度不同，它不受温度影响（体积会热胀冷缩）。凝固点降低、沸点升高的公式用的是这个。

### mass_percent

**质量百分比浓度** · 层级 engineering · 领域 化学 · 主角频率 high · 单位 %

```
solute_mass / solution_mass * 100
```

必填：`solute_mass` (溶质质量)、`solution_mass` (**溶液**总质量)

实验室最常见的浓度表达。注意分母是溶液不是溶剂。

### ppm_concentration

**百万分浓度 ppm** · 层级 engineering · 领域 化学 · 主角频率 medium · 单位 ppm

```
solute_mass / solution_mass * 1e6
```

必填：`solute_mass` (溶质质量)、`solution_mass` (溶液总质量)

稀溶液常用。水溶液中 1 ppm ≈ 1 mg/L。饮用水余氯、重金属限值都用这个口径。

### molar_concentration_mol_per_l

**摩尔浓度（mol/L）** · 层级 derived · 领域 化学 · 主角频率 medium · 单位 mol/L

```
n / V
```

必填：`n` (溶质物质的量 mol)、`V` (溶液体积 L)

c = n/V。生物与化学里「mmol/L」是临床化验的标准写法。

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

### loan_payment

**等额本息月供** · 层级 engineering · 领域 经济 · 主角频率 high · 单位 每期还款额（与本金同币种）

```
P * (annual_rate / 12) * (1 + annual_rate / 12)^months / ((1 + annual_rate / 12)^months - 1)
```

必填：`P` (贷款本金)、`months` (还款月数（30 年 = 360）)
可选：`annual_rate`=0.049 (年利率（小数，4.9% 写 0.049）)

房贷 / 车贷的标准算法。⚠️ 年利率为 0 时会除零 —— 那种情况直接 本金 / 月数。总利息 = 月供 × 月数 − 本金。

### simple_interest

**单利终值** · 层级 engineering · 领域 经济 · 主角频率 high · 单位 与本金同币种

```
P * (1 + r * t)
```

必填：`P` (本金)、`r` (年利率（小数）)、`t` (年数)

只对本金计息。对比 compound_interest 看复利差多少。

### annuity_present_value

**年金现值** · 层级 engineering · 领域 经济 · 主角频率 medium · 单位 现值（与每期金额同币种）

```
pmt * (1 - (1 + r)^(-n)) / r
```

必填：`pmt` (每期金额)、`r` (每期利率（小数）)、`n` (期数)

未来每期收一笔钱，折算到今天的价值。「这份年金现在值多少」。r 为 0 时直接 pmt × n。

### npv_simple

**净现值 NPV（等额现金流）** · 层级 engineering · 领域 经济 · 主角频率 high · 单位 与现金流同币种

```
cf * (1 - (1 + r)^(-n)) / r - initial
```

必填：`cf` (每期净现金流)、`r` (每期折现率（小数）)、`n` (期数)
可选：`initial`=0 (初始投入)

大于 0 表示这项投资按该折现率划算。

### depreciation_straight_line

**直线折旧（年折旧额）** · 层级 conventional · 领域 经济 · 主角频率 medium · 单位 每年折旧额

```
(cost - salvage) / years
```

必填：`cost` (购置成本)、`years` (使用年限)
可选：`salvage`=0 (残值)

最简单的折旧法。余额递减法等会计方法不在此列。

### break_even_units

**盈亏平衡销量** · 层级 engineering · 领域 经济 · 主角频率 medium · 单位 件

```
fixed_cost / (price - unit_cost)
```

必填：`fixed_cost` (固定成本总额)、`price` (单件售价)、`unit_cost` (单件变动成本)

卖多少件才不亏。售价 ≤ 变动成本时无解（每卖一件都在亏），此时会算出负数或无穷 —— 那本身就是结论。

### effective_annual_rate

**实际年利率 EAR** · 层级 engineering · 领域 经济 · 主角频率 medium · 单位 小数（× 100 得百分比）

```
(1 + nominal_rate / n)^n - 1
```

可选：`nominal_rate`=0.049 (名义年利率（小数）)、`n`=12 (每年复利次数（12 = 月复利）)

月复利的名义 4.9% 不等于实际 4.9%。n 越大越接近连续复利 e^r − 1。对比信用卡与房贷时看这个，不看名义利率。

### compound_growth_time

**复利翻倍所需年数** · 层级 engineering · 领域 经济 · 主角频率 high · 单位 年

```
log(target / P) / log(1 + r)
```

必填：`P` (本金)、`target` (目标金额)、`r` (年利率（小数）)

「多久能翻倍」直接用它。约等于 72/r(%) 的「72 法则」，但这是精确解。⚠️ mathjs 的 log 是自然对数，这里两处都是，所以比值正确。

### purchasing_power

**通胀后的购买力** · 层级 engineering · 领域 经济 · 主角频率 high · 单位 相当于今天的购买力

```
P / (1 + inflation)^years
```

必填：`P` (今天的金额)、`years` (年数)
可选：`inflation`=0.03 (年通胀率（小数）)

「三十年后这笔钱还值多少」。反向问「到时候要多少钱才有同等购买力」用 P × (1+inflation)^years。

### markup_margin

**毛利率** · 层级 conventional · 领域 经济 · 主角频率 medium · 单位 小数（× 100 得百分比）

```
(price - cost) / price
```

必填：`price` (售价)、`cost` (成本)

注意与「加价率」(price−cost)/cost 不同：成本 60 卖 100，毛利率 40%、加价率 66.7%。谈生意时这两个常被混用。

### payback_period

**投资回本期（多少年回本）** · 层级 conventional · 领域 经济 · 主角频率 high · 单位 年（回本所需时间；越小越好）

```
upfront_cost / annual_saving
```

必填：`upfront_cost` (一次性投入（工时、材料、折合的共同单位）)、`annual_saving` (每年节省（同单位）：省下的工时 / 燃料 / 损耗)

T = 投入 / 年节省。**「这项改造值不值得做」的最短答案**。★ 与库里已有的 ROI 互补：`roi` 给「回报率」，`npv_simple` 给「折现后净值」，  而回本期给的是**时间尺度** —— 它更容易判断，因为你只需要知道「我还活不活得到那天」。★ 典型对照（同一套单位：工时）：  铁斧（投入 40 工时，年省 20 工时）→ 2 年回本 —— 立即值得  第二座窑（投入 480 工时，年省 120）→ 4 年 —— 要判断能不能撑到那时  终极墙（投入 336 工时，年省 24）→ 14 年 —— 属于「留给后人」的投资★ 判据不是「回本期越短越好」，而是**回本期 < 你还打算干活的年数**。  这就是为什么乱世里长回本周期的工程没人做。⚠ 简化式：不含折现、不含维护费用、假设年节省恒定。  要严谨就用 `npv_simple`；回本期是「快速筛一遍」的工具。⚠ 年节省必须与投入同单位。工时对工时、能量对能量 —— 混单位会得到荒谬结果。

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

### growth_accounting

**增长核算（Solow 余量 / TFP）** · 层级 derived · 领域 经济 · 主角频率 high · 单位 无量纲（年增长率）

```
g_a + alpha * g_k + (1 - alpha) * g_l
```

必填：`g_a` (技术进步率（TFP 增长率）)、`g_k` (资本增长率)、`g_l` (劳动增长率)
可选：`alpha`=0.3 (资本份额 α)

g_Y = g_A + α·g_K + (1−α)·g_L。由柯布-道格拉斯生产函数取对数微分得出，不是拟合。美国劳工统计局（BLS）的 TFP 方法即基于此。★ 若人口与资本都停止增长（g_L=g_K=0），则 g_Y ≈ g_A —— 这就是停滞文明为何停滞。

### convergence_speed

**趋同速度（追赶到稳态的快慢）** · 层级 derived · 领域 经济 · 主角频率 high · 单位 1/年（收敛速率 λ）

```
(1 - alpha) * (n + delta + gx)
```

必填：`n` (人口增长率)、`delta` (折旧率)
可选：`alpha`=0.3 (资本份额 α)、`gx`=0 (技术进步率)

λ = (1−α)(n+δ+g)。距稳态的相对差距按 e^(−λt) 收敛，故到达一半差距约需 ln(2)/λ 年。这是条件趋同 —— 每个经济体追向自己的稳态，不是所有国家趋同到一处。★ 补的是现有 solow_steady_state 缺的那半：它给终点，这条给多久到达。

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

### labor_force

**劳动力人口（由总人口与年龄结构）** · 层级 conventional · 领域 经济、society · 主角频率 high · 单位 人

```
population * participation
```

必填：`population` (总人口)
可选：`participation`=0.5 (劳动参与率（农业社会 0.45~0.55，工业化 0.55~0.65）)

劳力 = 总人口 × 参与率。**农业社会的 0.45 里含着大量童工与老人**——这个比值决定了「能征多少兵」与「能修多大工程」的上限。

### gdp_from_labor

**总产出（人力 × 人均产出）** · 层级 conventional · 领域 经济 · 主角频率 high · 单位 与人均产出同单位（通常为年产值）

```
labor * output_per_worker
```

必填：`labor` (劳动力人数)、`output_per_worker` (人均年产出（按货币或实物统一定义）)

产出 = 劳力 × 人均产出。最简单的宏观核算模型：**想提高总产出只有两条路——加人或提高单产**。人均产值翻倍比人口翻倍难得多，所以长期增长几乎全靠后者。

### macro_savings_rate

**储蓄率与投资能力** · 层级 conventional · 领域 经济 · 主角频率 high · 单位 与总产出同单位

```
output * savings_rate
```

必填：`output` (总产出)
可选：`savings_rate`=0.2 (储蓄率（农业社会 0.05~0.15，高速增长期 0.25~0.40）)

可投资额 = 产出 × 储蓄率。**这是增长的燃料**：高速增长的经济体储蓄率往往很高（东亚 0.3+），而贫困农业社会几乎全被消费掉，攒不出投资。

### capital_output_ratio

**资本产出比（增长的资本需求）** · 层级 derived · 领域 经济 · 主角频率 medium · 单位 无量纲（资本/产出）

```
savings_rate / growth_rate
```

必填：`savings_rate` (储蓄率)、`growth_rate` (目标增长率（小数）)

哈罗德-多马式的推导：所需资本产出比 = 储蓄率 / 增长率。**想每年增长 5% 而储蓄率只有 10%，需要资本产出比 2（即每 1 元产出要 2 元资本）**——如果实际要 4，那 5% 就达不到。这条能立刻判断一个增长目标现不现实。

### money_supply_from_base

**货币供应量（基础货币 × 货币乘数）** · 层级 derived · 领域 经济 · 主角频率 high · 单位 与基础货币同单位

```
base_money * multiplier
```

必填：`base_money` (基础货币（流通现金 + 准备金）)
可选：`multiplier`=5 (货币乘数（现代银行 8~12，准备金率高时 2~4，金属货币制接近 1）)

广义货币 = 基础货币 × 乘数。**金属货币制的乘数接近 1，现代部分准备金制能放大 10 倍**——这解释了为什么古代通货膨胀罕见而现代可以剧烈。架空设定里「银行体系发达程度」直接改这个乘数。

### inflation_from_money_growth

**货币增长与产出增长之差（通胀压力）** · 层级 phenomenological · 领域 经济 · 主角频率 high · 单位 %（年通胀率近似）

```
(money_growth - output_growth) * 100
```

必填：`money_growth` (货币供应年增长率（小数，如 0.15）)、`output_growth` (实际产出年增长率（小数，如 0.03）)

通胀 ≈ 货币增速 − 产出增速。**这是最实用的通胀判据**：钱印得比东西增长快多少，物价就涨多少。0.15 对 0.03 意味着约 12% 的年通胀——三年物价翻倍。写「滥发货币导致崩溃」时用这条量化。

### gdp_expenditure

**支出法总产出（GDP 恒等式）** · 层级 fundamental · 领域 经济 · 主角频率 high · 单位 与各项同单位（通常为年产出）

```
consumption + investment + gov_spending + export_value - import_value
```

必填：`consumption` (居民消费)、`investment` (资本形成（投资）)、`gov_spending` (政府支出)
可选：`export_value`=0 (出口)、`import_value`=0 (进口)

Y = C + I + G + (X − M)。这是会计恒等式不是理论 —— 它只是「所有产出都被某人用掉了」的记账，所以任何世界观都成立。它的用处是立刻暴露不闭合的设定：若 C+I+G 超过 Y，差额只能来自净进口或举债。

### fisher_money

**货币数量方程（费雪方程）** · 层级 fundamental · 领域 经济 · 主角频率 medium · 单位 与 PY 同单位（价格 × 交易量）

```
money * velocity
```

必填：`money` (货币存量 M)、`velocity` (货币流通速度 V)

MV = PY。作为恒等式时 V 被定义为 PY/M，必然成立；作为理论时要假设 V 稳定。★ 价值在 V 是一个可调的世界观参数：金属货币社会 V 低、信用货币社会 V 高。结果等于名义产出；若要物价，再除以实际产出的交易量。

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

## engineering/energy

### wind_power_available

**风功率（风轮扫掠面积）** · 层级 derived · 领域 工程、物理 · 主角频率 high · 单位 W

```
0.5 * rho * A * v^3 * cp
```

必填：`A` (风轮扫掠面积 m²（直径 D 时 A = pi·D²/4）)、`v` (风速 m/s)
可选：`rho`=1.225 (空气密度 kg/m³（海平面 1.225）)、`cp`=0.45 (功率系数（贝茨极限 0.593，实用 0.35~0.45）)

P = ½rho·A·v³·Cp。**风速的三次方**——这是风能最反直觉的一条：风速从 5 m/s 涨到 10 m/s，功率变 **8 倍**。贝茨极限 0.593 是理论上限（动量守恒要求必须留一部分动能给下游气流）。

### water_turbine_power

**水轮机功率** · 层级 engineering · 领域 工程、power · 主角频率 high · 单位 W

```
rho * g * Q * H * eta
```

必填：`Q` (流量 m³/s)、`H` (水头 m（落差）)
可选：`rho`=1000 (水密度 kg/m³)、`g`=9.80665 (重力加速度 m/s²)、`eta`=0.85 (水轮机效率（大型 0.85~0.92，小型 0.6~0.75）)

P = rho·g·Q·H·eta。**与水泵恰好相反**：这里 eta 是乘的（获取能量），水泵那里是除的。一条 10 m³/s、落差 20 m 的水渠约 1.7 MW。

## engineering/fluid

### pipe_flow_rate

**管道流量（由流速与管径）** · 层级 derived · 领域 工程 · 主角频率 high · 单位 m³/s

```
v * pi * d^2 / 4
```

必填：`v` (流速 m/s（水管 0.5~2，气体 10~30）)、`d` (管内径 m)

Q = v·pi·d²/4。**管径翻倍，流量变 4 倍**——这就是为什么供水管网「扩一倍口径」就能顶四条旧管。反过来，想把流量翻倍而管径只加 40% 时，必须把流速也提上去，代价是阻力急剧上升。

### darcy_head_loss

**管道沿程水头损失（达西-魏斯巴赫）** · 层级 engineering · 领域 工程 · 主角频率 high · 单位 m（水头）

```
f * (L / d) * v^2 / (2 * g)
```

必填：`L` (管长 m)、`d` (管内径 m)、`v` (流速 m/s)
可选：`f`=0.02 (摩阻系数（钢管清水 0.02，旧铸铁 0.04，混凝土渠 0.015）)、`g`=9.80665 (重力加速度 m/s²)

h = f·(L/d)·v²/(2g)。**流速的平方**：流速翻倍，损失变 4 倍。所以长距离输水宁可加大管径、降低流速——这条决定了管网的经济流速（约 1~2 m/s）。

### pump_power

**水泵轴功率** · 层级 engineering · 领域 工程、perception · 主角频率 high · 单位 W

```
rho * g * Q * H / eta
```

必填：`Q` (流量 m³/s)、`H` (扬程 m)
可选：`rho`=1000 (流体密度 kg/m³（水 1000）)、`g`=9.80665 (重力加速度 m/s²)、`eta`=0.7 (泵效率（离心泵 0.6~0.85，小泵取低值）)

P = rho·g·Q·H/eta。扬程 H 是「能把水举多高」，包含沿程损失。这是选泵与估电耗的核心式子：**流量与扬程都是相乘，任意一个翻倍，功率就翻倍**。

### orifice_discharge

**孔口出流流量** · 层级 derived · 领域 工程 · 主角频率 medium · 单位 m³/s

```
Cd * A * sqrt(2 * g * h)
```

必填：`A` (孔口面积 m²)、`h` (水头 m（孔口到水面的高度）)
可选：`Cd`=0.62 (流量系数（薄壁圆孔 0.62，管嘴 0.82，锐缘 0.6）)、`g`=9.80665 (重力加速度 m/s²)

Q = Cd·A·sqrt(2gh)。**水头的平方根**：想把出流量翻倍，水头要涨到 4 倍。这是水库泄洪、攻城水攻、倒水时间估算的通用式子。

## engineering/mechanics

### gear_ratio

**齿轮传动比** · 层级 engineering · 领域 工程 · 主角频率 high · 单位 倍

```
N2 / N1
```

必填：`N1` (主动轮齿数)、`N2` (从动轮齿数)

转速比 = N₁/N₂（与齿数比相反）；扭矩比 = N₂/N₁。大于 1 表示减速增扭。多级传动把各级比值乘起来。

### hydraulic_force

**液压推力** · 层级 derived · 领域 物理、工程 · 主角频率 high · 单位 N

```
pressure * area
```

必填：`pressure` (液压 Pa)、`area` (活塞面积 m²)

帕斯卡原理：压力处处相等，所以小活塞小力 → 大活塞大力。这正是液压千斤顶、挖掘机、刹车系统的原理。

### pulley_ratio

**皮带轮转速比** · 层级 engineering · 领域 工程 · 主角频率 medium · 单位 倍

```
D1 / D2
```

必填：`D1` (主动轮直径)、`D2` (从动轮直径)

从动轮转速 = 主动轮转速 × (D₁/D₂)。与齿轮不同，皮带轮靠摩擦，从动轮直径大则转得慢。

## engineering/precision

### tolerance_stack

**公差叠加（为什么单件差也能装出高精度）** · 层级 derived · 领域 工程 · 主角频率 high · 单位 与 tolerance 同单位（装配后的公差带半宽）

```
sqrt(n * tolerance^2)
```

必填：`n` (串联件数)、`tolerance` (单件公差（±，与结果同单位）)

统计叠加：σ_装配 = √(Σσᵢ²) = √n·σ。**同步装配的 n 件各差一点，装配后反而收紧了**。★ 与最坏情况叠加（Σσᵢ = n·σ）的对比就是全部要点：  5 件各 ±0.05：最坏叠加 ±0.25，统计叠加 ±0.112 —— 差 2.2 倍；  20 件各 ±0.05：最坏 ±1.00，统计 ±0.224 —— 差 4.5 倍。  n 越大差距越大（比值 √n），这就是「精度靠工艺不靠单件」的定量理由。★ 前提是**误差彼此独立且随机**。这条不是无条件的：  若 n 件由同一个人、同一台设备、同一批料做出，误差是**相关的**（同向偏），  那时统计叠加不成立，必须退回线性叠加 —— 这是最常被忽略的失效条件。★ 实用判据：**独立随机 → 均方根；共因偏差 → 线性**。  所以「互换性装配」要靠随机化（不同批次混装），而「配对研磨」是靠消除偏差。⚠ 本式给的是 1σ 量级估计，不含系统偏差与形位公差（平面度/同轴度）——  后者不能靠均方根收，必须单独分配余量。⚠ 若单件公差给的是 ±（全带），先除以 3 转成 σ 再代入，否则会高估装配公差 3 倍。

## engineering/process

### kiln_heat_balance

**窑炉热平衡（燃料热量去哪了）** · 层级 phenomenological · 领域 工程、材料 · 主角频率 high · 单位 MJ（估算的一次烧成总耗热）

```
ware_mass * ware_specific_heat * delta_T / 1000 * (1 + shell_loss_ratio)
```

必填：`ware_mass` (装坯质量 kg)、`delta_T` (升温幅度 K（室温→烧成温度）)
可选：`ware_specific_heat`=0.9 (坯体比热 kJ/(kg·K)（陶 0.8~1.1、瓷 0.9~1.3）)、`shell_loss_ratio`=12 (窑体蓄热+散热相对坯体之比（间歇窑 8~20，连续窑 3~6）)

「单窑耗煤 Xkg」这类经验数可以靠这条验算：Q = m·c·ΔT·(1+损比)。★ 这是全库第一缺口 —— 有了它，耗煤量、窑衬寿命、窑型升级幅度全部可算。★ 实测对照：100kg 坯 20→1100℃ 本身只需 97MJ，而实际耗煤往往对应 8~15 倍，  差的那部分正是窑体蓄热、窑壁散热、烟气带走。★ 省燃料的关键在 shell_loss_ratio：间歇窑 12 是常态，  改连续窑/余热回收能压到 3~6 —— 这就是「窑型升级 +40%~+300%」的来源。⚠ 只算一次烧成的显热，不含保温维持与不完全燃烧。

### kiln_firing_time

**烧成时间（升温速率受热应力限制）** · 层级 phenomenological · 领域 工程、材料 · 主角频率 high · 单位 h（到达烧成温度所需时间）

```
delta_T / heating_rate
```

必填：`delta_T` (升温幅度 K)
可选：`heating_rate`=200 (安全升温速率 K/h（薄壁 150~300、厚壁 60~120）)

t = ΔT / 升温速率。**升温速率不是随便定的，它被热应力上限卡住。**★ 这就是「排潮 2h → 氧化 2.5h → 高温 2h → 保温 1h」里那些 2h 的来源：  不是工艺偏保守，而是厚壁件温差过大会直接开裂。★ 实测对照：室温→1100℃ 取 200K/h → 5.5h 爬温 + 各阶段保温，与常见「一窑一天」对得上。★ 关键推论：薄壁能快、厚壁必须慢 —— 壁厚翻倍，允许升温率大致降一半，工期翻倍。⚠ 150~300 / 60~120 是陶与瓷的常见区间；具体依热膨胀系数与抗张强度。

### wall_heat_loss

**围护结构稳态热损（R 值法）** · 层级 derived · 领域 工程 · 主角频率 high · 单位 W（维持室内温度所需加热功率）

```
total_area * delta_T / r_value + ventilation_loss
```

必填：`total_area` (围护总面积 m²（墙+屋顶+地板）)、`delta_T` (内外温差 K)
可选：`r_value`=2 (总热阻 R = Σ(δ/k) m²·K/W（单层砖墙 0.5，多层保温 9+）)、`ventilation_loss`=0 (通风换气热损 W（可单列）)

Q = A·ΔT/R + 通风。建筑围护结构的标准算法，与工业换热器的 LMTD 完全是两回事。★ 关键：用总热阻 R 而不是导热系数 k，因为多层墙要逐层累加 δ/k。★ 实测对照：64㎡、R=9.34、ΔT=25℃ → 171W；加通风 50W 得 221W，与实测 282W 同量级  （差异来自缝隙与热桥 —— 实际总是比计算大）。★ 反推用途：知道实测耗热 282W，可反推真实 R 值，检验保温做够了没有。⚠ R 值是灵魂：单层砖墙约 0.5，加 10cm 岩棉可到 3~4，多层真空/反射箔可达 9+。

### metallurgy_yield

**冶金收得率（矿石 → 金属）** · 层级 phenomenological · 领域 工程、材料 · 主角频率 high · 单位 kg（产出金属量）

```
ore_mass * grade * recovery
```

必填：`ore_mass` (矿石量 kg)、`grade` (品位 0—1（赤铁 0.5~0.6、孔雀石 0.55~0.57）)
可选：`recovery`=0.85 (回收率（土法 0.6~0.8、改进 0.85~0.95）)

m = m_矿 × 品位 × 回收率。一眼就能看出「年产 5kg」与「年产 15-20kg」差在哪。★ 实测对照：15kg 矿 × 0.3 × 0.9 = 4.05kg 生铁；5kg 孔雀石 × 0.57 × 0.8 = 2.28kg 精铜。★ 反推最实用：已知「两炉年产 5kg」，反推每炉投多少矿 → 5/(2×0.35×0.7) ≈ 10kg 矿/炉。  数字自相矛盾时，这条能把矛盾定位到具体环节。★ 三因子各自可调：品位靠选矿、回收率靠炉型、矿量靠开采 ——  外推产能时先看哪个因子先到天花板，那才是真瓶颈。

### case_depth

**渗碳层深（扩散控制）** · 层级 derived · 领域 工程、材料 · 主角频率 medium · 单位 m（渗碳层深度）

```
2 * sqrt(D0 * exp(-activation_energy / (R * temperature)) * hold_time)
```

必填：`temperature` (渗碳温度 K（900℃ = 1173K）)、`hold_time` (保温时间 s（3h = 10800）)
可选：`D0`=0.00002 (扩散常数 D₀ m²/s（碳在奥氏体铁中约 2e-5）)、`activation_energy`=150000 (激活能 J/mol（碳在 γ-Fe 约 1.3~1.6e5）)、`R`=8.314462618 (气体常数 J/(mol·K))

x ≈ 2√(D·t)，D = D₀·exp(−Q/RT)。表面硬化层的标准算法。★ 实测对照：900℃ 保温 3h → D≈4.2e-12 m²/s、x≈0.42mm，与「表面硬化零点几毫米」吻合。★ 关键推论：温度是平方级杠杆，时间是线性。  900→950℃ 只差 50 度，D 约翻倍，层深涨 √2 倍；而保温 3h→5h 只涨 √(5/3)≈1.29 倍。  所以「渗层不够就多烧一会儿」效率很低，提温才是真手段 —— 但要防过热与晶粒长大。⚠ D₀ 与 Q 依钢种与碳势而变，给的是低碳钢 900-950℃ 的典型区间。

### gear_bending_strength

**齿轮齿根弯曲强度（模数选型）** · 层级 phenomenological · 领域 工程 · 主角频率 high · 单位 Pa（齿根弯曲应力；与许用弯曲应力比即判安全）

```
tangential_force / (face_width * gear_module * form_factor)
```

必填：`tangential_force` (圆周力 F_t N（F_t = 2T/d）)、`face_width` (齿宽 b m)、`gear_module` (模数 m m)
可选：`form_factor`=0.32 (齿形系数 Y（20° 标准齿 0.30~0.34）)

σ = F_t/(b·m·Y)。齿轮传动的强度判据，也是模数选型的依据。★ 这条能验算「模数 4 比 2.5 厚约 60%，足以承受 30kg 重锤」这种断言：  m=4、z=30 → 分度圆 120mm；30kg 在 r=60mm → F_t≈294N；  齿宽 30mm、Y=0.32 → σ ≈ 7.7 MPa，远低于铸铁许用 30~60MPa。★ 结论是「模数 4 绰绰有余」，而模数 2.5 时应力涨到约 12 MPa —— 仍够。  所以那句断言是对的，但只有算出这两个数才知道它对。⚠ 简化式（未含动载系数、应力集中、齿面接触疲劳）。单件低速手工齿轮够用。

### gear_geometry

**齿轮几何（分度圆与传动比）** · 层级 derived · 领域 工程 · 主角频率 high · 单位 mm（分度圆直径 d）

```
gear_module * teeth
```

必填：`gear_module` (模数 m mm)、`teeth` (齿数 z)

d = m·z。齿轮的一切尺寸都从这两个数派生：外径 d+2m、齿高 2.25m、中心距 (d₁+d₂)/2。★ 传动比 i = z_从/z_主（同模数）。所以「1:12 减速」可反推齿数组合：  单级 30:360，或两级 30:180 + 20:40 —— 单级占空间、多级效率低但紧凑，  这就是设计取舍的量化形式。★ 手工加工的约束：模数决定刀具规格，所以一个作坊只用一两种模数，  而齿数可自由组合 —— 「统一模数 + 自由齿数」正是钟表业的传统做法。

### pendulum_clock_drift

**摆钟走时精度（温度引起的快慢）** · 层级 derived · 领域 工程 · 主角频率 medium · 单位 s/天（正为走快，负为走慢）

```
86400 * (-0.5 * length_change_ratio + 0.5 * gravity_change_ratio)
```

必填：`length_change_ratio` (摆长相对变化 ΔL/L（热膨胀 α·ΔT；钢 α≈1.2e-5/K）)
可选：`gravity_change_ratio`=0 (重力相对变化 Δg/g（同地可忽略，高原/异星要算）)

T = 2π√(L/g)，取对数微分得 ΔT/T = −½·ΔL/L + ½·Δg/g，乘 86400 得每天偏差。★ 实测对照：钢摆 α=1.2e-5、冬夏温差 20℃ → ΔL/L=2.4e-4 → 每天慢约 10.4 秒。  这就是「摆钟冬夏要重新校」的定量原因，也是补偿摆（双金属）要解决的问题。★ 重要推论：周期只与摆长的**平方根**有关，所以摆长误差的影响被压掉一半；  摆长差 0.1% 只让每天差 43 秒 —— 天文观测完全够用来校准。★ 反过来最有用：**异星设定**里 g 变了多少，钟就快慢多少，这条直接给数。⚠ 补偿摆能压到每天 1~2 秒；真空+恒温的精密摆钟可到每天 0.01 秒。

### gravity_storage_discharge

**重力储能放电时长（自洽性检查）** · 层级 fundamental · 领域 工程、物理 · 主角频率 high · 单位 s（能维持该功率的时长）

```
mass * 9.80665 * height / power
```

必填：`mass` (配重质量 kg)、`height` (落差 m)、`power` (放电功率 W)

t = E/P = m·g·h/P。**最重要的用途是检查设定自不自洽，而不是算新数。**★ 实测对照（外部反馈的原案例）：25kg 配重 × 2.5m = 625J；  若设定说「6~8W 持续 12~15 分钟」，625J ÷ 8W = 78 秒 —— 差一个数量级。★ 这种错误极难自察：625J、8W、12 分钟各自都「看着合理」，  只有把三个数放进同一个式子才暴露。这正是能量守恒检查的价值。★ 反推用途：要维持 8W 共 12 分钟需 5760J → 需 235kg×2.5m 或 25kg×23.5m。  于是「要么加配重十倍、要么加高十倍」—— 设计方向一下就明确了。

### water_turbine_output

**水轮输出（功率/扭矩/转速）** · 层级 derived · 领域 工程 · 主角频率 high · 单位 W（轴输出功率）

```
density * 9.80665 * flow * head * efficiency
```

必填：`flow` (流量 m³/s)、`head` (有效水头 m)
可选：`density`=1000 (水密度 kg/m³)、`efficiency`=0.7 (总效率（木制水轮 0.4~0.6、改进 0.7~0.85）)

P = ρgQHη。与水轮机的「泵」公式同形但方向相反 —— 泵用电换水头，水轮用水头换功。★ 实测对照：溪流 0.01m³/s、水头 3m、η=0.6 → 176W；小河 0.1m³/s、水头 6m → 3.5kW。★ 扭矩 T = P/ω，转速 n = 60v/(πD)：  低水头大流量的水轮转速慢、扭矩大，**这正是它能直接带动锻锤的原因**；  而带动锯需要高转速，得加增速传动 —— 于是「传动比」成了必需项而不是选择项。★ 效率 0.4→0.85 就是「木轮改铁轮 + 导流」的全部收益，提升 2 倍。

### gdd_accumulated

**累计生长度日（一季能攒多少积温）** · 层级 phenomenological · 领域 农业、生物 · 主角频率 medium · 单位 ℃·d（生长度日 GDD）

```
excess_daily_temp * days
```

必填：`days` (生育期天数（无霜期 180~210）)
可选：`excess_daily_temp`=10 (日均温超出基点部分 K（日均 20℃、基点 10℃ → 10）)

GDD = Σ max(0, T_日均 − T_基点)。**四季节奏的数学骨架。**★ 价值在于「把时间换算成热量」：同样 200 天生育期，  暖地日均积 15 度、冷地 8 度 → GDD 差近 2 倍 → 能种的作物完全不同。★ 实测用途：给定「无霜期 180~210 天」可反推这一季能攒多少积温，  再对照作物需求（玉米 2500~2800、小麦 1800~2200、水稻 3000+）判断能不能熟。★ 这也是「春播秋收冬藏」必须按日历走的定量理由 —— 积温不够就熟不了。⚠ 基点温度依作物而变（小麦 0~5℃、玉米 10℃、水稻 10~12℃）。

### leaching_residue

**浸提残留（换水去单宁/苦涩）** · 层级 derived · 领域 农业、化学 · 主角频率 medium · 单位 与初始浓度同单位

```
initial_concentration * residual_ratio^changes
```

必填：`initial_concentration` (初始浓度（如单宁含量）)、`changes` (换水次数)
可选：`residual_ratio`=0.6 (每次换水后的残留比（0.5~0.7，依切块大小与水温）)

C_n = C₀·rⁿ。橡子、蕨根、苦杏仁去毒去涩的标准算法。★ 实测对照：r=0.6 换 4 次 → 0.1296，残留 13%；换 5 次 7.8%、换 6 次 4.7% —— 指数衰减。★ 关键推论：**换水次数比每次泡多久更重要。**  泡一夜再换 4 次（0.13）远好于泡 4 天不换（几乎不衰减）——  因为扩散平衡后浓度不再下降，必须靠换水把平衡点推下去。★ 这也是「手工程序值得公式化」的最好例子：  设定里写「需浸泡去单宁」但没给次数，而次数直接决定能不能吃。

### fermentation_time

**发酵时间（达到目标残留糖）** · 层级 derived · 领域 农业、生物、化学 · 主角频率 medium · 单位 day（达到目标残留糖所需天数）

```
-(log(target_residual / initial_sugar)) / rate_constant
```

必填：`initial_sugar` (初始糖浓度)、`target_residual` (目标残留糖浓度)
可选：`rate_constant`=0.07 (速率常数 k 1/day（酿酒 0.05~0.09、酿醋 0.02~0.04）)

S(t) = S₀·e^(−kt)，解出 t = −ln(S_残/S₀)/k。酿酒、酿醋、沤肥的时间估算。★ 实测对照：降到 5%、k=0.07 → t = −ln(0.05)/0.07 ≈ 43 天；  而 k=0.04（低温）需 75 天 —— **这就是「温度低一度要延长几天」的定量答案。**★ 关键推论：发酵时间对温度极敏感（k 随温度按 Q₁₀ 律变，见 q10_temperature）。  所以「酿酒 2~4 周、酿醋 6~8 周」不是随便写的，它对应两个不同的 k。★ 串联用途：先用 q10_temperature 由温度得 k，再代入本式得工期 —— 这是「换季要改工艺」的可算理由。⚠ 简化的一级动力学；实际发酵有滞后期与产物抑制，工业上要用 Monod + 抑制项。

### syrup_concentration

**熬煮浓缩（糖浆得率）** · 层级 derived · 领域 农业、化学 · 主角频率 medium · 单位 L（成品体积）

```
juice_volume * initial_brix / final_brix
```

必填：`juice_volume` (原汁体积 L)、`initial_brix` (初始糖度 Brix（%）)、`final_brix` (成品糖度 Brix（%）)

V_f = V₀·Brix₀/Brix_f。糖量守恒的浓缩换算。★ 实测对照：40L 枫汁 Brix=2.5、成品 66 → 40×2.5/66 = 1.52L。  设定里「40L 产 1L 糖浆」对应成品 Brix 更高或含水更多，量级一致。★ 关键推论：**浓缩比只由糖度比决定**，与锅的大小、火的大小都无关。  所以「熬多久」只影响风味与色泽，不影响得率 —— 得率只看两个度数。★ 反过来最实用：知道要熬到多少度，就能预估这一锅能出多少，  这也是判断「值不值得熬」的依据（燃料成本 vs 成品收益）。⚠ Brix 是质量百分比糖度；若用糖度计读数，需按温度修正。

### sintering_porosity

**烧结致密度（温度/时间 → 孔隙率）** · 层级 phenomenological · 领域 材料、工程 · 主角频率 high · 单位 无量纲（残余孔隙率；吸水率与之近似成正比）

```
initial_porosity * exp(-A * exp(-activation_energy / (R * temperature)) * hold_time)
```

必填：`temperature` (烧结温度 K（850℃ = 1123K）)、`hold_time` (保温时间（单位与 A 配套；A 对应「小时」时给 1）)
可选：`initial_porosity`=0.4 (坯体初始孔隙率（压制后 0.35~0.45）)、`A`=5200 (指前因子（依粉体粒度；细粉更大）)、`activation_energy`=80000 (烧结活化能 J/mol（氧化物烧结中值 80 kJ/mol）)、`R`=8.314462618 (气体常数 J/(mol·K))

φ = φ₀·exp(−k·t)，k = A·exp(−Q/RT)。**把「烧到多密」变成可算的**。★ 标定结果（以 A=110、Q=42kJ/mol、1 小时保温）：  750℃ → 孔隙 18.4% ｜ 850℃ → 12.0% ｜ 1000℃ → 5.2% ｜ 1300℃ → 0.5%  与常识完全吻合：普通陶 850℃ 吸水率 10~15%、瓷 1300℃ <0.5%。★ **温度是主杠杆，时间是次级**：指数在温度项里，所以每升 100℃ 的效果  远大于把保温时间延长一倍 —— 这与渗碳的道理相同（都走扩散）。★ 反推用途：要求吸水率 <1%（近似孔隙 <1%），反推需要多高的烧结温度。⚠ 孔隙率与吸水率是**近似正比**而非相等：开口气孔才吸水，闭口气孔不吸。  所以「孔隙 0.5%」时吸水率可能已接近 0，但这个粗糙关系足够判断「够不够瓷化」。

### quench_hardness

**淬火硬度（含碳量 → 可达硬度）** · 层级 phenomenological · 领域 材料、工程 · 主角频率 high · 单位 HRC（洛氏 C 硬度，完全马氏体淬火）

```
max_hardness - drop * exp(-rate * carbon_percent)
```

必填：`carbon_percent` (含碳量 %（0.2~1.2 为可淬硬区间）)
可选：`max_hardness`=71.5 (饱和硬度上限 HRC（实际依合金元素，含铬钼可更高）)、`drop`=70 (从上限往下掉的幅度)、`rate`=2.55 (上升速率（拟合参数）)

H = Hmax − drop·exp(−rate·C)。**含碳量决定「钢能硬到什么程度」的上限**。★ 拟合依据是实测的 HRC-含碳量表（0.2%→20、0.5%→52、0.7%→62、1.2%→67 HRC）：  **差值递减**（0.2→0.5 每档涨 10~12，0.7 之后每档只涨 1~2），所以用饱和型。★ 用默认参数：0.2%→29、0.5%→52、0.7%→60、1.2%→68。  ⚠ 低碳区偏乐观（0.2% 时高 9 个点），因为实际低碳钢淬不硬；高碳区很准。★ 这条的意义在于**判断「这把刀能不能硬」**：C<0.3% 的钢再怎么淬也到不了 HRC50，  而工具钢要 C 0.7~0.9% —— 这是「炼钢要控碳」的定量理由。⚠ 完全淬火的上限硬度。实际回火会显著降低（回火温度每升 50℃ 约降 2~4 HRC）。⚠ 只对「能淬硬的钢」成立：低碳钢、纯铁不适用（它们淬不硬）。

### furnace_efficiency

**炉膛热效率（三种损失的合成）** · 层级 phenomenological · 领域 工程 · 主角频率 high · 单位 无量纲（0—1，燃料热量转成有效热的比例）

```
1 - flue_loss - wall_loss - unburnt_loss
```

可选：`flue_loss`=0.35 (烟气带走比例（土窑 0.45、砖窑 0.30、带余热回收 0.18）)、`wall_loss`=0.08 (炉壁散热比例（土窑 0.10、砖窑 0.06、保温好 0.04）)、`unburnt_loss`=0.04 (不完全燃烧比例（土窑 0.05、改进 0.03、好炉 0.02）)

η = 1 − 烟气 − 炉壁 − 不完全燃烧。**三种损失各自可调，加起来就是天花板**。★ 实测对照：土窑 η=0.40、改进砖窑 0.61、带余热回收 0.76。  这与「火炉效率 0.40~0.50」的常见经验完全吻合。★ **最大的损失永远是烟气**：0.45 的烟气损失意味着近一半热量从烟囱跑了。  所以「加烟囱挡板、延长烟道路径（穿火炕）」比「把炉壁加厚」有效得多 ——  这是传统火炕设计的物理依据。★ 串联用途：η × 燃料热值 = 实际可用热量，再除以工艺所需热量，  就得到「一窑要烧多少料」—— 这条接在 kiln_heat_balance 之前。★ 与卡诺效率的区别：**卡诺是热机理论上限（温度决定），炉膛效率是燃烧损失（结构决定）**。  两者相乘才是「从煤到轴功」的总效率。

### distillation_enrichment

**一次蒸馏的富集倍数（汽液平衡）** · 层级 phenomenological · 领域 工程、化学 · 主角频率 high · 单位 无量纲（气相摩尔分数；除以液相分数即富集倍数）

```
relative_volatility * liquid_fraction / (1 + (relative_volatility - 1) * liquid_fraction)
```

必填：`liquid_fraction` (液相中易挥发组分的摩尔分数（0—1）)
可选：`relative_volatility`=2.2 (相对挥发度 α（乙醇-水 2.0~2.5、甲醇-水 3~4）)

y = αx/(1+(α−1)x)。蒸馏的**单级平衡**关系 —— 不是「一次蒸馏就能到纯度」。★ 关键性质：**富集倍数随浓度下降**。α=2.2 时：  x=0.05 → 富集 2.08 倍 ｜ x=0.30 → 1.62 ｜ x=0.80 → 1.12  所以「从 10% 提到 70%」不可能靠一次蒸馏，必须多级（理论塔板）。★ 塔板数：每级按上式算一次直到达标。10%→70% 在 α=2.2 下约需 6~8 块理论板。★ 这就是「为什么蒸馏器要做成塔」的定量理由 —— 单锅只能提 2 倍。⚠ 高浓度端会撞**共沸点**：乙醇-水在 95.6% 处共沸，再蒸也提不上去。⚠ α 随温度与浓度变化，2.2 是常压低浓度区的典型值。

### crystallization_yield

**冷却结晶收率（溶解度差）** · 层级 derived · 领域 工程、化学 · 主角频率 high · 单位 g（理论最大析出量）

```
(solubility_hot - solubility_cold) * solvent_mass / 100
```

必填：`solubility_hot` (高温溶解度 g/100g 溶剂（KNO₃ 100℃ 约 246）)、`solubility_cold` (低温溶解度 g/100g 溶剂（KNO₃ 20℃ 约 32）)、`solvent_mass` (溶剂质量 g（水）)

m = (S_高温 − S_低温) × 溶剂量/100。**冷却结晶的收率上限**。★ 实测对照（硝石提纯）：100g 水配 246g KNO₃（100℃ 饱和），冷到 20℃ 析出 214g，收率 87%。★ 关键推论：**收率取决于两个温度的溶解度差**，而不是降温幅度本身。  「用冰水降得更低」收益递减（20℃→0℃ 只多析出约 12g）。★ 反过来最实用：要提高收率，**蒸发一部分水**比继续降温有效 —— 海盐晒盐正走这条路。⚠ 析出是理论最大值：实际有母液夹带、晶粒细会带走更多母液。⚠ 只适用「溶解度随温度显著上升」的盐；NaCl 几乎不变，此法无效。

### drying_shrinkage

**坯体总收缩（干燥 + 烧成）** · 层级 phenomenological · 领域 材料、工程 · 主角频率 high · 单位 无量纲（线性收缩率；乘 100 得百分比）

```
drying_shrinkage + firing_shrinkage
```

可选：`drying_shrinkage`=0.06 (干燥线收缩（普通陶土 0.05~0.07；掺熟料可降到 0.03）)、`firing_shrinkage`=0.04 (烧成线收缩（陶 0.03~0.05；瓷 0.10~0.14）)

总收缩 = 干燥收缩 + 烧成收缩。**配料与开裂风险的核心参数**。★ 干缩来自颗粒间水膜消失，烧成收缩来自孔隙闭合 —— 两段成因不同但会叠加。★ 关键数字：普通陶土总收缩 8~12%（干 6% + 烧 4%）；瓷更高（15~18%）。★ **掺熟料（煅烧过的黏土粉）是减收缩的主要手段**：熟料已收缩过，不再收缩。  每掺 10% 熟料约减 1~1.5 个百分点 —— 这是「陶土掺石英砂 10% + 草木灰 5%」的定量依据。★ 为什么要控收缩：收缩不均产生内应力，厚壁件内外不同步 → 开裂。  所以「薄壁能快、厚壁必须慢」不只是热应力，收缩也是原因。⚠ 这是线性收缩率；体积收缩 ≈ 3 × 线性收缩（小量时近似）。

### error_propagation

**测量误差传播（谁主导不确定度）** · 层级 derived · 领域 工程 · 主角频率 high · 单位 与 result_value 同单位（结果的绝对不确定度）

```
result_value * sqrt((relative_error_a * weight_a)^2 + (relative_error_b * weight_b)^2)
```

必填：`result_value` (由 a、b 算出的结果值)、`relative_error_a` (参数 a 的相对误差（Δa/a；±0.1g 测 100g → 0.001）)、`relative_error_b` (参数 b 的相对误差（Δb/b；±0.5mL 测 50mL → 0.01）)
可选：`weight_a`=1 (a 在公式里的幂次（a/b 中 a 为 1、a² 为 2）)、`weight_b`=1 (b 的幂次（a/b 中 b 为 −1，平方后仍是 1）)

σ_y = |y|·√(Σ(wᵢ·σᵢ/xᵢ)²)，wᵢ 是该量的幂次。**误差传播的实用式**。★ 最重要的用途不是算 σ，而是**找出谁主导**：  密度 ρ=m/V，m=100±0.1g、V=50±0.5mL → ρ=2.000±0.020  其中**体积贡献 99%**、质量只占 1%。★ 于是结论明确：**改进天平毫无意义，要换更准的量筒**。  这就是误差传播的全部价值 —— 它告诉你钱该花在哪。★ 幂次的作用：平方项让大误差主导，所以「最差的那个量」几乎决定全部精度 ——  这是「木桶原理」的定量形式。★ 设定集应用：「±0.5mm 标准尺」「±1g 砝码」「±1~2 分钟/天」一旦进链条就会被放大，  必须算传播才知道成品精度能到哪。⚠ 假设各量误差独立且正态；有系统偏差时需另加。⚠ 只在「乘除为主」的公式里用相对误差形式；加减为主时换成绝对误差相加。

### soil_nutrient_balance

**土壤养分平衡（连作多久会耗竭）** · 层级 derived · 领域 农业、生物 · 主角频率 high · 单位 kg/ha（years 年后的库存）

```
stock + (input - uptake - leach) * years
```

必填：`input` (年投入（kg/ha/年）：化肥、绿肥、秸秆回田、豆科固氮、沉降)、`uptake` (年吸收（kg/ha/年）：作物带走 + 挥发损失（谷类 60~120）)、`leach` (年淋失（kg/ha/年）：随水流失（沙土 30~50、黏土 10~20）)
可选：`stock`=2000 (土壤有效养分库存（kg/ha，耕地典型 1500~2500）)、`years`=10 (持续年数)

N(t+1) = N(t) + 投入 − 吸收 − 淋失。**连作能不能持续，一算就知道**。★ 实测三档（每公顷每年 kg N）：  传统连作（草木灰回田，无外源）  投入 15 − 吸收 60 − 淋失 20 = **−65**  施绿肥/沤肥                   投入 80 − 吸收 60 − 淋失 25 = **−5**  轮作休耕年                    投入 40 − 吸收 10 − 淋失 15 = **+15**★ 这就是「为什么要休耕」的定量理由：连作每年亏 65，库存 2000 只够 **31 年**；  而休耕年每年回补 15，十年能把亏空补回来。★ 关键洞察：**吸收与淋失是「出口」，投入是「入口」**，三者同等重要 ——  只盯着「多施肥」而不减少淋失（沙土、漫灌），效率很低。★ 反推用途：已知还能种几年 → 反推每年至少需要多少投入才可持续（令净变化=0）。⚠ 只算单一养分（氮最常见）。磷钾的循环慢得多，不能用同一套数字。⚠ 库存不是「配方指标」而是经验值：真正耕地还有大量难溶态养分，只是不能用。

### nutrient_sustainable_input

**可持续所需的年投入（令净变化为零）** · 层级 derived · 领域 农业 · 主角频率 medium · 单位 kg/ha/年（维持库存不降所需的最低投入）

```
uptake + leach
```

必填：`uptake` (年吸收（kg/ha/年）)、`leach` (年淋失（kg/ha/年）)

投入 ≥ 吸收 + 淋失 才能维持。**这是「必须补多少」的下限**。★ 与 `soil_nutrient_balance` 配套：那条算「会亏多少」，这条算「至少补多少」。★ 实测对照：吸收 60 + 淋失 20 = 80 kg N/ha/年 ——  而传统连作只能投入 15，缺口 65，正是要开垦新地或休耕的原因。★ 最有用的推论：**减少淋失等于增加投入**。  黏土比沙土少淋失 30~40 kg，效果相当于多施同等量的肥 ——  而改土（掺黏、加深耕层）的成本远低于年年买肥。⚠ 只对「库存可测的单一养分」成立；多元素要各算一遍。

## engineering/structures

### beam_section_modulus

**矩形截面抗弯截面系数** · 层级 derived · 领域 工程 · 主角频率 high · 单位 m³

```
b * h^2 / 6
```

必填：`b` (截面宽 m)、`h` (截面高 m)

W = b·h²/6 —— 矩形梁抗弯计算的基础量。最大弯曲应力 σ = M / W，所以梁要高而不是宽：高度翻倍，抗弯能力变 4 倍。

### beam_bending_stress

**梁的最大弯曲应力** · 层级 derived · 领域 工程、材料 · 主角频率 high · 单位 MPa

```
M / (b * h^2 / 6) / 1e6
```

必填：`M` (弯矩 N·m)、`b` (截面宽 m)、`h` (截面高 m)

σ = M / W（W = b·h²/6）。与材料屈服强度对比即知是否安全。钢梁通常取许用应力 = 屈服强度 / 1.5~2。

### beam_self_weight_moment

**简支梁自重产生的跨中弯矩** · 层级 derived · 领域 工程 · 主角频率 high · 单位 N·m

```
rho * g * b * h * L^2 / 8
```

必填：`b` (截面宽 m)、`h` (截面高 m)、`L` (跨度 m)
可选：`rho`=7850 (材料密度 kg/m³（钢 7850，木 600，混凝土 2400）)、`g`=9.80665 (重力加速度 m/s²（由 world 给出）)

均布自重 q = ρ·g·b·h 作用在跨度为 L 的简支梁上，跨中弯矩 qL²/8。**这是跨度的平方律**：跨度翻倍，自重弯矩变 4 倍——大跨度结构必须先算这一项，否则会漏掉最主要的荷载。

### beam_uniform_load_deflection

**简支梁均布荷载跨中挠度** · 层级 derived · 领域 工程 · 主角频率 high · 单位 m

```
5 * q * L^4 / (384 * E * I)
```

必填：`q` (均布荷载 N/m)、`L` (跨度 m)、`I` (截面惯性矩 m⁴（矩形 b·h³/12）)
可选：`E`=206000000000 (弹性模量 Pa（钢 2.06e11，木 1e10，混凝土 3e10）)

δ = 5qL⁴/(384EI)。**跨度的四次方**——这是结构工程里最陡的一条 scaling：跨度翻倍，挠度变 16 倍。所以桥梁不能靠「加厚」来延长跨度，必须改结构形式（桁架、拱、预应力）。

### rect_inertia

**矩形截面惯性矩** · 层级 derived · 领域 工程 · 主角频率 high · 单位 m⁴

```
b * h^3 / 12
```

必填：`b` (截面宽 m)、`h` (截面高 m)

I = b·h³/12（绕水平中性轴）。挠度公式要用它，所以「高 h 的三次方」决定了梁的刚度——这是「梁要竖着放」的数学理由。

### bolt_shear_capacity

**螺栓抗剪承载力** · 层级 engineering · 领域 工程 · 主角频率 medium · 单位 N

```
n * tau * pi * d^2 / 4
```

必填：`d` (螺栓公称直径 m（M16 = 0.016）)
可选：`n`=1 (受剪面数（单剪 1，双剪 2）)、`tau`=141000000 (许用剪应力 Pa（约 0.6×屈服强度；4.6 级取 141e6）)

F = n·τ·π·d²/4。普通螺栓（4.6 级）许用剪应力约 0.6×235 MPa。注意：**承压型高强螺栓靠摩擦传力，不按这个式子算**。

### weld_throat_capacity

**角焊缝承载力（按喉部截面）** · 层级 engineering · 领域 工程 · 主角频率 medium · 单位 N

```
0.707 * a * L * tau
```

必填：`a` (焊脚尺寸 m（K 值，如 6mm 焊脚 = 0.006）)、`L` (焊缝计算长度 m)
可选：`tau`=160000000 (焊缝许用剪应力 Pa（E43 焊条约 160 MPa）)

角焊缝的有效喉部厚度 = 0.707a（45° 等腰直角），有效面积 = 0.707a·L。这是钢结构连接的通用算法，比按母材截面估要准得多。

## engineering/thermal

### thermal_efficiency_carnot

**卡诺热机效率上限** · 层级 fundamental · 领域 工程、物理 · 主角频率 high · 单位 无量纲（比值）

```
1 - Tc / Th
```

必填：`Th` (高温热源温度 K)、`Tc` (低温热源温度 K)

η ≤ 1 − Tc/Th。**绝对温度**，不是摄氏度：300 K（约 27°C）与 500 K（约 227°C）之间，理论上限是 40%。这条给出了任何热机的天花板——想提高效率只能提高热源温度或降低排热温度，加多少煤都没用。

### steam_power_output

**蒸汽机功率（由蒸汽流量与焓差）** · 层级 engineering · 领域 工程 · 主角频率 high · 单位 W

```
mdot * dh * eta
```

必填：`mdot` (蒸汽质量流量 kg/s)、`dh` (进出口焓差 J/kg（饱和蒸汽 2.7 MPa 约 2.1e6）)
可选：`eta`=0.15 (整机效率（单级往复式 0.10~0.15，多级汽轮机 0.25~0.40）)

P = mdot·dh·eta。这是蒸汽动力最实用的算法：**两台同功率的机器，现代汽轮机（eta≈0.35）只需要往复式蒸汽机（eta≈0.12）三分之一的蒸汽**。写蒸汽朋克设定时，这个 3 倍差距决定了煤耗与锅炉体积。

### boiler_coal_rate

**锅炉煤耗率** · 层级 engineering · 领域 工程 · 主角频率 high · 单位 kg/h（每小时耗煤）

```
P / (coal_cv * eta) * 3600
```

必填：`P` (所需功率 W)
可选：`coal_cv`=29300000 (煤低位热值 J/kg（标准煤 2.93e7 约 7000 kcal）)、`eta`=0.7 (锅炉热效率（工业锅炉 0.7~0.85，老式 0.5）)

每小时耗煤 = P/(cv·eta) × 3600。**用「多少吨煤」比用「多少瓦」更容易让读者有体感**。注意这里只算锅炉；整机电效率还要再乘蒸汽机的 eta。

### heat_exchanger_duty

**换热器换热量（对数平均温差）** · 层级 engineering · 领域 工程 · 主角频率 medium · 单位 W

```
U * A * (dT1 - dT2) / log(dT1 / dT2)
```

可选：`U`=500 (总传热系数 W/(m²·K)（水-水 800，气-水 50~200，金属间 1000+）)、`A`=10 (换热面积 m²)、`dT1`=40 (热端温差 K（入口，与 dT2 必须不同）)、`dT2`=20 (冷端温差 K（出口，与 dT1 必须不同）)

Q = U·A·LMTD，LMTD 是对数平均温差。逆流时 dT1 与 dT2 是两端温差，**顺流时 LMTD 明显小于逆流**——这就是为什么好换热器都设计成逆流。注意 dT1 与 dT2 相等时 LMTD 退化为该值（此处按极限处理），两者不能同时为零。

### conduction_wall_loss

**平壁导热损失** · 层级 derived · 领域 工程、物理 · 主角频率 high · 单位 W

```
k * A * dT / d
```

必填：`A` (壁面积 m²)、`dT` (两侧温差 K)、`d` (壁厚 m)
可选：`k`=0.04 (导热系数 W/(m·K)（岩棉 0.04，砖 0.7，钢 45，铜 400）)

Q = k·A·ΔT/d。**保温材料的 k 比钢小 1000 倍**——所以一堵 10 cm 厚的岩棉墙，保温能力相当于 100 m 厚的钢墙。写工业设定时，这个比值比任何形容词都更能说明「隔热做得好不好」。

## materials/constitutive

### hooke_law

**胡克定律（应力-应变）** · 层级 fundamental · 领域 材料、工程 · 主角频率 high · 单位 Pa

```
E * eps
```

必填：`E` (弹性模量 Pa（钢 2.06e11、铝 6.9e10、木 1e10）)、`eps` (应变（无量纲，ΔL/L₀）)

σ = E·ε。弹性区的本构公理，与材料种类无关 —— 只需给出该材料的 E。★ 它补上了库里断掉的一环：已有 strain（ε=ΔL/L₀，纯几何），却没有配对的应力。接上后形成 ΔL → ε → σ → 判安全的完整链。注意仅适用于弹性区（σ < 屈服强度）；超过后进入塑性，此式失效。

### safety_factor_check

**安全系数校核（许用应力）** · 层级 conventional · 领域 材料、工程 · 主角频率 high · 单位 Pa（许用应力，与实际工作应力比较）

```
yield_strength / safety_factor
```

必填：`yield_strength` (屈服强度 Pa)
可选：`safety_factor`=1.5 (安全系数 n（静载 1.5~2、冲击 2~4、疲劳 3~6）)

σ_allow = σ_y / n。把材料强度变成「会不会坏」的判据：工作应力 ≤ 该值即安全。★ 诚实标注：安全系数是工程惯例，不是物理定律 —— 取值依赖失效后果与不确定性。脆性材料、失效后果严重时要取更大值。

### fracture_kic

**断裂韧性（临界应力强度因子）** · 层级 derived · 领域 材料、工程 · 主角频率 high · 单位 Pa（临界应力，超过即失稳断裂）

```
kic / (y_factor * sqrt(pi * crack_length))
```

必填：`kic` (断裂韧性 K_IC（单位 Pa·m^0.5；钢约 30e6，陶瓷约 1e6）)、`crack_length` (裂纹长度 a（半长，m）)
可选：`y_factor`=1 (几何因子 Y（中心裂纹约 1，边裂纹约 1.12）)

σ_c = K_IC / (Y·√(πa))。由线弹性断裂力学（LEFM）推出。★ 关键洞察 σ_c ∝ 1/√a：同样材料，裂纹长一个数量级，承载降 √10 ≈ 3.2 倍。这就是「为什么大构件必须比小试样更小心」的定量解释，也是压力容器要定期探伤的原因。⚠ 仅适用脆性/小范围屈服；高韧性延性材料会低估承载，那时需弹塑性 J 积分。

## materials/fundamental

### ideal_strength

**理论强度（理想晶体强度上限）** · 层级 derived · 领域 材料 · 主角频率 high · 单位 Pa

```
E / factor
```

必填：`E` (弹性模量 Pa)
可选：`factor`=10 (强度系数（Frenkel 常用 E/10，区间 5~15）)

σ_ideal ≈ E/10（Frenkel 估计；也有 √(Eγ/a₀) 的 Orowan-Polanyi 形式）。★ 标注为「仅方向」：E/5 ~ E/15 都有人用，这是量级估计不是精确值。★ 真正的价值在比值：实际材料强度通常只有理论值的 1/100 ~ 1/10（因为缺陷）。**这个比值就是「冶金水平」** —— 同样的理论强度，工艺差的世界只能发挥 1%，精密工业能发挥 10%，差一个数量级。

### melting_from_cohesive

**熔点与结合能（Lindemann 标度）** · 层级 phenomenological · 领域 材料 · 主角频率 high · 单位 K（熔点温度，量级估计）

```
cohesive_energy * 0.036 / kB
```

必填：`cohesive_energy` (每原子结合能 J），即把原子完全分离所需的能量)
可选：`kB`=1.380649e-23 (玻尔兹曼常数 J/K)

Lindemann 判据：熔化发生在原子热振动振幅达到原子间距的临界分数时。量级形式 T_m ≈ 0.036·(每原子结合能/k_B)。★ 这个系数 0.036 是用 12 种金属实测熔点反算的（平均 0.0352、中位 0.0362）。对过渡金属与难熔金属最准（Fe −0.8%、W −0.5%、Mo −1.6%、Ag −0.4%，Ni/Cu +7%），**铝与碱土金属偏高较多**（Al +52%、Mg +52%）—— 它们的结合能里自由电子贡献占比不同。⚠ 输入是「每原子」结合能（J），若你的资料给的是 kJ/mol，先除以 6.022e23。★ 这是真正连到基础物理量的一条：结合能 ← 键能 ← 电子结构，所以换了键强度熔点跟着变。★ 由此可反推设计：想要熔点 2000°C 的金属 → 反推需要多大结合能。⚠ 标度为「标度」不是精确：金属/共价/离子键型的系数差异大，需按类标定。

### pugh_ductility

**Pugh 判据（脆/韧筛选）** · 层级 phenomenological · 领域 材料 · 主角频率 high · 单位 无量纲（G/K；> 0.57 偏脆，< 0.57 偏韧）

```
shear_modulus / bulk_modulus
```

必填：`shear_modulus` (剪切模量 G Pa)、`bulk_modulus` (体积模量 K Pa)

G/K > 0.57（等价 B/G < 1.75）→ 偏脆；反之偏韧。★ K 与 G 都由结合能曲线推出，所以脆性也可以从底层推。⚠ 这是经验筛选线，不是定论 —— 学界近年仍在「推广」这个判据，说明原版不够普适。用法：作为快速筛选，判「这个材料大概会崩还是会让」。

### gruneisen_expansion

**格律奈森关系（热膨胀由非谐性推出）** · 层级 derived · 领域 材料 · 主角频率 medium · 单位 1/K（线膨胀系数 α）

```
gamma * heat_capacity / (3 * bulk_modulus * volume)
```

必填：`heat_capacity` (定容热容 J/K)、`bulk_modulus` (体积模量 K Pa)、`volume` (体积 m³)
可选：`gamma`=1.5 (Grüneisen 参数（通常 1~3）)

α = γ·C_v/(3KV)。γ 是非谐性的度量（键势偏离对称的程度），所以热膨胀可以从键势形状推。★ 补上闭环：现有 thermal_expansion 里 α 是硬设定，这条让 α 可以由 K、C_v、γ 推出来。γ 越大说明键势越不对称 → 受热膨胀越明显。金属 γ≈1~2，聚合物可达 3+。

## materials/microstructure

### hall_petch

**Hall-Petch 强化（晶粒尺寸决定强度）** · 层级 phenomenological · 领域 材料、工程 · 主角频率 high · 单位 Pa（屈服强度）

```
sigma0 + ky / sqrt(grain_size)
```

必填：`grain_size` (晶粒直径 m（10 µm = 1e-5）)
可选：`sigma0`=70000000 (晶格摩擦应力 Pa（纯铁约 70 MPa）)、`ky`=400000 (强化系数（钢约 0.15~0.6 MPa·m^0.5）)

σ_y = σ₀ + k_y·d^(−1/2)。晶界阻挡位错，晶粒越细越强。★ 这是「工艺可调」的典型：同一成分的钢，晶粒细化一个数量级强度可翻倍。「这个文明的锻造水平」就对应他们能达到的 d。⚠ 有反 Hall-Petch 区：纳米晶粒下强度反而下降（晶界开始滑移）。此式只对微米级成立。

## materials/property

### wiedemann_franz

**维德曼-弗兰兹定律（导热与导电的锁合）** · 层级 fundamental · 领域 材料 · 主角频率 medium · 单位 W/(m·K)（电子贡献的导热系数）

```
lorenz * temperature * electrical_conductivity
```

必填：`temperature` (绝对温度 K)、`electrical_conductivity` (电导率 S/m)
可选：`lorenz`=2.44e-8 (洛伦兹数 L₀ = 2.44e-8 W·Ω/K²（基本常数）)

κ/σ = L₀·T。金属中热与电都由电子输运，故两者成比例。★ 这是罕见的**严格关系**（L₀ 是基本常数），不是经验式。★ 价值：设定一个金属的电导率，导热系数就自动定了 —— 不必两个都编。⚠ 仅对金属的电子导热成立；绝缘体、声子导热的材料不适用。

## materials/selection

### ashby_index

**Ashby 性能指数（选材判据）** · 层级 derived · 领域 材料、工程 · 主角频率 high · 单位 性能指数（越大越好，同工况下横向比较）

```
E^exponent_e * strength^exponent_s / rho^exponent_rho
```

必填：`rho` (密度 kg/m³)
可选：`E`=1 (弹性模量（该工况不需要时取 1）)、`strength`=1 (强度（该工况不需要时取 1）)、`exponent_e`=0 (E 的指数（轻而刚的梁 0.5、板 0.333）)、`exponent_s`=0 (强度的指数（轻而强的梁 0.667、板 0.5）)、`exponent_rho`=1 (密度的指数（通常 1）)

M = E^a·σ^b / ρ^c，指数由「功能需求 + 几何形式」决定。常用几种：轻而刚的梁 E^½/ρ ｜ 轻而强的梁 σ^(2/3)/ρ ｜ 轻而刚的板 E^(1/3)/ρ ｜ 弹性储能 σ²/E。★ 它把「选材」从审美判断变成可计算判断：设定说「这种生物合金很轻很强」，一算就知道它排第几。指数与几何绑定、与材料无关，故跨世界通用。例：钢 E=2e11 ρ=7850 → E^½/ρ ≈ 1.8；若某生物合金 E=1e11 ρ=3000 → 3.3，确实更优。

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

### thermal_stress

**热应力** · 层级 derived · 领域 材料 · 主角频率 medium · 单位 Pa

```
E * alpha * dT
```

必填：`E` (弹性模量 Pa（钢约 2e11）)、`alpha` (线膨胀系数 1/K（钢约 1.2e-5）)、`dT` (温差 K（也等于 °C 差）)

完全约束下温度变化产生的应力。这就是铁轨留缝、桥梁装伸缩缝的原因。与材料抗压强度比较即可判断会不会开裂。

### hardness_yield_generic

**硬度估屈服强度（普适版，可换重力）** · 层级 phenomenological · 领域 材料 · 主角频率 medium · 单位 MPa

```
k * hardness * g
```

必填：`hardness` (布氏/维氏硬度（kgf/mm²）)
可选：`k`=3 (硬度-强度比例系数（经验，约 3）)、`g`=9.80665 (地表重力 m/s²（地球 9.81）)

σy ≈ k·HB（比例 π 是无量纲经验），单位换算里含 g。原式的 9.80665e6 就是「kgf/mm² → Pa」的换算，含地球重力。换重力时这 9.8 要跟着变（1.5 g 世界同样硬度值对应 1.5 倍 Pa）。σy≈3HB 本身误差可达 30%，只作量级估算。

## math/geometry

### circle_area

**圆面积** · 层级 mathematical · 领域 数学 · 主角频率 medium

```
pi * r^2
```

必填：`r` (半径)

S = πr²。

### sphere_volume

**球体积** · 层级 mathematical · 领域 数学 · 主角频率 medium

```
4 / 3 * pi * r^3
```

必填：`r` (半径)

V = 4πr³/3。

### sphere_area

**球表面积** · 层级 mathematical · 领域 数学 · 主角频率 medium

```
4 * pi * r^2
```

必填：`r` (半径)

S = 4πr²。

### cylinder_volume

**圆柱体积** · 层级 mathematical · 领域 数学 · 主角频率 medium

```
pi * r^2 * h
```

必填：`r` (半径)、`h` (高)

V = πr²h。

### cone_volume

**圆锥体积** · 层级 mathematical · 领域 数学 · 主角频率 medium

```
pi * r^2 * h / 3
```

必填：`r` (半径)、`h` (高)

V = πr²h/3。

### heron_area

**海伦公式（三角形面积）** · 层级 mathematical · 领域 数学 · 主角频率 medium

```
sqrt(p * (p - a) * (p - b) * (p - c))
```

必填：`a` (边 a)、`b` (边 b)、`c` (边 c)、`p` (半周长 (a+b+c)/2)

S = √(p(p-a)(p-b)(p-c))。

### pythagoras

**勾股定理（求斜边）** · 层级 mathematical · 领域 数学 · 主角频率 medium

```
sqrt(a^2 + b^2)
```

必填：`a` (直角边 a)、`b` (直角边 b)

c = √(a²+b²)。

### law_of_cosines

**余弦定理（求第三边）** · 层级 engineering · 领域 数学 · 主角频率 high · 单位 与输入长度同单位

```
sqrt(a^2 + b^2 - 2 * a * b * cos(angle_c))
```

必填：`a` (第一边)、`b` (第二边)、`angle_c` (两边的夹角（**弧度**）)

已知两边及夹角求第三边。⚠️ 夹角用弧度；给角度时先乘 π/180。也用于「已知三边求角」的反向解：cosC = (a²+b²−c²)/(2ab)。

### law_of_sines

**正弦定理** · 层级 engineering · 领域 数学 · 主角频率 high · 单位 与输入长度同单位

```
a * sin(angle_b) / sin(angle_a)
```

必填：`a` (已知边)、`angle_a` (该边对角（**弧度**）)、`angle_b` (待求边对角（**弧度**）)

a/sinA = b/sinB。已知一边两角求另一边，测距与航海常用。

### sector_area

**扇形面积** · 层级 engineering · 领域 数学 · 主角频率 medium · 单位 面积（与半径单位平方一致）

```
0.5 * r^2 * theta
```

必填：`r` (半径)、`theta` (圆心角（**弧度**）)

θ 用弧度。弧长用 r × θ。整圆 θ = 2π。

### spherical_cap_volume

**球冠体积** · 层级 engineering · 领域 数学 · 主角频率 medium · 单位 体积

```
pi * h^2 * (3 * r - h) / 3
```

必填：`r` (球半径)、`h` (球冠高度)

被平面切下的那部分球体。h = r 时退化为半球（2πr³/3），h = 2r 时是整个球（4πr³/3）—— 可用来验算。

### trapezoid_area

**梯形面积** · 层级 engineering · 领域 数学 · 主角频率 high · 单位 面积

```
(a + b) * h / 2
```

必填：`a` (上底)、`b` (下底)、`h` (高)

「上底加下底乘高除以二」。a = b 时退化为矩形。

### ellipse_area

**椭圆面积** · 层级 engineering · 领域 数学 · 主角频率 medium · 单位 面积

```
pi * a * b
```

必填：`a` (半长轴)、`b` (半短轴)

a = b 时退化为圆。椭圆周长没有初等闭式，需椭圆积分。

### torus_volume

**圆环体体积** · 层级 engineering · 领域 数学 · 主角频率 low · 单位 体积

```
2 * pi^2 * R * r^2
```

必填：`R` (环中心半径（大半径）)、`r` (管半径（小半径）)

甜甜圈形状的体积。R 必须大于 r，否则管子自相交。

### regular_polygon_area

**正多边形面积** · 层级 engineering · 领域 数学 · 主角频率 low · 单位 面积

```
n * s^2 / (4 * tan(pi / n))
```

必填：`n` (边数)、`s` (边长)

n = 4 且 s 为边长时得正方形面积 —— 可用来验算。

## math/growth

### exponential_growth

**指数增长** · 层级 mathematical · 领域 数学 · 主角频率 medium

```
N0 * exp(r * t)
```

必填：`N0` (初始量)、`r` (增长率 1/时间)、`t` (时间)

N = N₀e^(rt)。

### doubling_time

**倍增时间** · 层级 mathematical · 领域 数学 · 主角频率 medium · 单位 时间

```
log(2) / r
```

必填：`r` (增长率 1/时间)

t = ln2/r（即 70/百分比 的精确版）。

### logistic_growth

**逻辑斯蒂增长（t 时刻）** · 层级 mathematical · 领域 数学 · 主角频率 medium

```
K / (1 + ((K - N0) / N0) * exp(-r * t))
```

必填：`K` (环境容量 K)、`N0` (初始量)、`r` (内禀增长率)、`t` (时间)

N(t) = K/(1+((K-N₀)/N₀)e^(-rt))。人口/资源上限推演核心公式。

## math/scales

### richter

**里氏震级（能量比）** · 层级 mathematical · 领域 数学 · 主角频率 medium · 单位 倍数

```
10^(1.5 * dM)
```

必填：`dM` (震级差)

震级每增 1，能量约增 31.6 倍。

### ph

**pH 值** · 层级 mathematical · 领域 数学 · 主角频率 medium

```
-log(H) / log(10)
```

必填：`H` (氢离子浓度 mol/L)

pH = -log₁₀[H⁺]。

## math/series

### arithmetic_sum

**等差数列求和** · 层级 mathematical · 领域 数学 · 主角频率 medium

```
n * (a1 + an) / 2
```

必填：`n` (项数)、`a1` (首项)、`an` (末项)

S = n(a₁+aₙ)/2。

### geometric_sum

**等比数列求和** · 层级 mathematical · 领域 数学 · 主角频率 medium

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

### hull_speed_generic

**船舶极限航速（普适版，可换重力）** · 层级 derived · 领域 物理、工程 · 主角频率 high · 单位 kn（节）

```
froude * sqrt(g * length) * 1.944
```

必填：`length` (水线长 m)
可选：`froude`=0.4 (兴波极限 Froude 数（无量纲，约 0.4）)、`g`=9.80665 (地表重力 m/s²（由 world 给出；地球 9.81）)

排水型船的兴波极限速度。**这是 hull_speed 的普适版**：那个版本的 1.34 把 g=9.81 烘焙进了系数，只在 1 g 世界成立。1.5 g 世界里同一艘 100 m 的船极限航速是 29.8 节而非 24.4 节（快 22%）。Froude ≈ 0.4 是经验值，再快就得上滑行艇或水翼。

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

### main_sequence_lifetime

**主序星寿命** · 层级 phenomenological · 领域 天文 · 主角频率 high · 单位 Gyr（十亿年）

```
10 * M^(-2.5)
```

必填：`M` (恒星质量（**太阳质量**为单位）)

τ ≈ 10 Gyr × M⁻²·²⁵（M 以太阳质量计）。大质量星亮但短命：10 M☉ 只有约 3200 万年 —— 不够演化出复杂生命。此式只在主序阶段成立，且对极端质量有偏差。

### habitable_zone_generic

**宜居带边界（普适版，显式用辐照阈值）** · 层级 derived · 领域 天文 · 主角频率 high · 单位 AU

```
sqrt(luminosity / flux_ratio)
```

可选：`luminosity`=1 (恒星光度（太阳 = 1）)、`flux_ratio`=1.1 (内边界处的辐照阈值（地球温室条件下约 1.1 倍地球辐照）)

innerAU = sqrt(L / f)，其中 f 是「该边界处的辐照是地球的几倍」。原式 `sqrt(L/1.1)` 的 1.1 就是 f —— 现在它是可替换参数。强温室行星（如金星式）的 f 可以远小于 1.1；真空岩石行星则要大得多。**solar_flux_at_1au** 用来把 W/m² 换算成 f。

### solar_flux_at_1au

**太阳常数（由光度与距离推出）** · 层级 derived · 领域 天文 · 主角频率 medium · 单位 W/m²

```
luminosity * 1361
```

可选：`luminosity`=1 (恒星光度（太阳 = 1）)

太阳常数 1361 W/m² 是「1 L☉ 在 1 AU 处的辐照」——可由 L☉/(4π·AU²) 严格算出（得 1362 W/m²，观测值 1361，差 0.07%）。换成任意距离用 inverse_square_flux。

### inverse_square_flux

**辐照随距离的平方反比** · 层级 fundamental · 领域 物理、天文 · 主角频率 high · 单位 W/m²

```
flux0 * (distance0 / distance)^2
```

必填：`flux0` (参考点辐照 W/m²)、`distance0` (参考距离（可与 distance 同单位）)、`distance` (目标距离)

同一颗恒星在不同距离的辐照。这是「为什么热木星会被烧」的第一性依据，也是宜居带宽度 ∝ √L 的来源（辐照 ∝ 1/r²，所以要维持同样辐照，r ∝ √L）。

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

### capacitive_reactance

**容抗** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Ω

```
1 / (2 * pi * f * C)
```

必填：`f` (频率 Hz)、`C` (电容 F（1 µF = 1e-6）)

电容对交流的「等效电阻」。频率越高容抗越小（直流下相当于断路）。⚠️ 电容单位是法拉，微法要乘 1e-6。

### inductive_reactance

**感抗** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Ω

```
2 * pi * f * L
```

必填：`f` (频率 Hz)、`L` (电感 H（1 mH = 1e-3）)

电感对交流的阻抗。频率越高感抗越大（直流下相当于短路）。

### lc_resonance

**LC 谐振频率** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Hz

```
1 / (2 * pi * sqrt(L * C))
```

必填：`L` (电感 H)、`C` (电容 F)

LC 回路自振频率。此频率下容抗与感抗相等、相互抵消。

### voltage_divider

**分压电路输出** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 V

```
Vin * R2 / (R1 + R2)
```

必填：`Vin` (输入电压 V)、`R1` (上臂电阻 Ω)、`R2` (下臂电阻 Ω（输出取在它两端）)

两个电阻串联取中间电压。R2 越大输出越接近 Vin。

### energy_kwh

**用电量（度）** · 层级 engineering · 领域 物理、经济 · 主角频率 high · 单位 kWh（度）

```
power * hours / 1000
```

必填：`power` (功率 W)、`hours` (时长 小时)

1000 W 用 1 小时 = 1 度。电费 = 度数 × 电价。注意功率是 W 不是 kW，否则差 1000 倍。

### battery_runtime

**电池续航时间** · 层级 engineering · 领域 物理 · 主角频率 high · 单位 小时

```
capacity / load
```

必填：`capacity` (电池容量 mAh)、`load` (负载电流 mA)

理想值。实际受放电曲线、温度、内阻影响，通常只有 70—85%。升压/降压电路还有效率损失。

### transformer_turns

**变压器匝数比** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 次级匝数

```
N1 * V2 / V1
```

必填：`N1` (初级匝数)、`V1` (初级电压 V)、`V2` (次级电压 V)

N₁/N₂ = V₁/V₂。升压则次级匝数多。⚠️ 电流反向：电压升几倍，电流就降到几分之一（功率守恒）。

### ohm_current

**欧姆定律（求电流）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 A

```
V / R
```

必填：`V` (电压 V)、`R` (电阻 Ω)

I = V/R。与 ohm（求电压）互为逆式，避免每次自己移项。

### ohms_law_resistance

**欧姆定律（求电阻）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Ω

```
V / I
```

必填：`V` (电压 V)、`I` (电流 A)

R = V/I。

### electric_power_vi

**电功率（电压电流式）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 W

```
V * I
```

必填：`V` (电压 V)、`I` (电流 A)

P = VI。与 joule_power（I²R 式）互补：已知电压电流时用这条。

### resistors_mixed_two

**两电阻并联后的等效电阻** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Ω

```
(R1 * R2) / (R1 + R2)
```

必填：`R1` (电阻1 Ω)、`R2` (电阻2 Ω)

R = R1R2/(R1+R2)。并联结果必小于任一支路，可用来自查。

### conductance_from_resistance

**电导（电阻倒数）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 S

```
1 / R
```

必填：`R` (电阻 Ω)

G = 1/R。电导与电阻互为倒数，小电阻对应大电导。

### charge_from_current_time

**电荷量（电流×时间）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 C

```
I * t
```

必填：`I` (电流 A)、`t` (时间 s)

Q = It。电池容量「1 Ah = 3600 C」就是这条的常用形式。

### capacitor_charge_from_cv

**电容电荷（Q=CU）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 C

```
C * V
```

必填：`C` (电容 F)、`V` (电压 V)

Q = CU。与 capacitor_charge 同义，参数名更直观。

### rc_time_constant_tau

**RC 时间常数** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 s

```
R * C
```

必填：`R` (电阻 Ω)、`C` (电容 F)

τ = RC。经过 1τ 充到 63.2%，5τ 基本充满 —— 电路快慢的判断依据。

### rc_discharge_voltage_tau

**RC 放电电压（τ 倍数式）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 V

```
V0 * exp(-n)
```

必填：`V0` (初始电压 V)
可选：`n`=1 (经过几个时间常数 τ)

V = V0·e^(−n)，n = t/τ。n=1 剩 37%，n=5 剩 0.67%。

### inductor_energy_half_li2

**电感储能** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 J

```
0.5 * L * I^2
```

必填：`L` (电感 H)、`I` (电流 A)

E = ½LI²。与电容储能 ½CV² 对称 —— 电感储能与电流平方成正比。

### lc_resonance_freq_hz

**LC 谐振频率** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Hz

```
1 / (2 * pi * sqrt(L * C))
```

必填：`L` (电感 H)、`C` (电容 F)

f = 1/(2π√(LC))。

### magnetic_field_wire

**直导线磁场（安培环路）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 T

```
mu0 * I / (2 * pi * r)
```

必填：`I` (电流 A)、`r` (到导线距离 m)
可选：`mu0`=0.00000125663706212 (真空磁导率)

B = μ0I/(2πr)。距离翻倍磁场减半 —— 这是「磁通密度 T」最基础的产出式。

### magnetic_field_solenoid

**螺线管内部磁场** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 T

```
mu0 * N * I / L
```

必填：`N` (匝数)、`I` (电流 A)、`L` (螺线管长度 m)
可选：`mu0`=0.00000125663706212 (真空磁导率)

B = μ0NI/L（忽略螺线管端部效应，L ≫ 直径 时成立）。

### magnetic_flux_from_bt

**磁通量（B×面积）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 Wb

```
B * A * cos(theta)
```

必填：`B` (磁通密度 T)、`A` (面积 m²)
可选：`theta`=0 (法线夹角 rad)

Φ = BA·cosθ。θ=0 时通量最大，θ=90° 时为零（磁感线平行于面）。

### ampere_force_two_wires

**两平行导线间的作用力** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 N

```
mu0 * I1 * I2 * L / (2 * pi * d)
```

必填：`I1` (电流1 A)、`I2` (电流2 A)、`L` (导线长度 m)、`d` (间距 m)
可选：`mu0`=0.00000125663706212 (真空磁导率)

F = μ0I1I2L/(2πd)。同向相吸、反向相斥。

### faraday_emf_from_flux_change

**法拉第电磁感应（通量变化率式）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 V

```
N * (B2 - B1) * A / t
```

必填：`N` (匝数)、`B2` (末磁通密度 T)、`B1` (初磁通密度 T)、`A` (面积 m²)、`t` (时间 s)

E = N·Δ(BA)/Δt。与 faraday_emf（速度式）是同一现象的两条写法。

### inductance_solenoid

**螺线管电感** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 H

```
mu0 * N^2 * A / L
```

必填：`N` (匝数)、`A` (截面积 m²)、`L` (长度 m)
可选：`mu0`=0.00000125663706212 (真空磁导率)

L = μ0N²A/L。匝数翻倍电感变四倍（N² 关系）。

### transformer_current_ratio

**变压器电流比** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 A

```
I1 * N1 / N2
```

必填：`I1` (初级电流 A)、`N1` (初级匝数)、`N2` (次级匝数)

I2 = I1·N1/N2。升压则降流，功率守恒（理想变压器）。

### power_factor_real

**有功功率（含功率因数）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 W

```
V * I * cos(phi)
```

必填：`V` (电压 V)、`I` (电流 A)
可选：`phi`=0 (功率因数角 rad)

P = VI·cosφ。φ=0 时是纯阻性（cosφ=1）；感性负载 cosφ<1，视在功率大于有功。

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

### reynolds_number

**雷诺数** · 层级 derived · 领域 物理、工程 · 主角频率 medium · 单位 无量纲

```
rho * v * D / mu
```

必填：`rho` (流体密度 kg/m³)、`v` (流速 m/s)、`D` (特征长度 m（管径等）)、`mu` (动力黏度 Pa·s（20°C 水约 1e-3）)

判断层流还是湍流。圆管中 Re < 2300 层流、> 4000 湍流、中间过渡。⚠️ 用的是动力黏度 μ，不是运动黏度 ν（ν = μ/ρ）。

### froude_number

**Froude 数** · 层级 fundamental · 领域 物理、工程 · 主角频率 medium · 单位 无量纲

```
v / sqrt(g * length)
```

必填：`v` (特征速度 m/s)、`length` (特征长度 m)
可选：`g`=9.80665 (重力 m/s²)

惯性力与重力之比。船舶 Fr < 0.4 为排水航行，> 0.4 进入过渡态，> 1 才可能滑行（需要极大功率）。这是判断「这艘船能不能更快」的核心无量纲数。

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

### spring_energy

**弹簧储能** · 层级 derived · 领域 物理 · 主角频率 high · 单位 J

```
0.5 * k * x^2
```

必填：`k` (弹性系数 N/m)、`x` (形变量 m)

压缩或拉伸储存的能量。这正是弓弩、投石机、钟表发条的储能原理：能量与形变量的**平方**成正比，所以拉两倍距离储能四倍。

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

### decay_constant_from_halflife

**衰变常数（由半衰期）** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 1/s

```
log(2) / T
```

必填：`T` (半衰期 s)

λ = ln2 / T½。放射性活度、衰减比例都从这条出发。（公式表达式用 log：mathjs 的 log 即自然对数，ln 只在 evaluate 层做归一化，公式库不经那层。）

### activity_from_atoms

**放射性活度（原子数×衰变常数）** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 Bq

```
N * log(2) / T
```

必填：`N` (当前放射性原子数)、`T` (半衰期 s)

A = Nλ = N·ln2/T½。活度是「每秒衰变多少次」，与原子总数成正比。

### activity_from_mass

**放射性活度（由质量衡量）** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 Bq

```
(m / M) * NA * log(2) / T
```

必填：`m` (放射性核素质量 g)、`M` (摩尔质量 g/mol)、`T` (半衰期 s)
可选：`NA`=6.02214076e+23 (阿伏伽德罗常数)

A = (m/M)·NA·ln2/T½。这是「1 克镭-226 约 3.7×10¹⁰ Bq」的来源，也就是居里的定义。

### radiation_absorbed_dose

**吸收剂量** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 Gy

```
E / m
```

必填：`E` (沉积能量 J)、`m` (受照质量 kg)

D = E/m。1 Gy = 1 J/kg —— 与比热容同量纲，但含义是辐射沉积。

### dose_equivalent_from_dose

**剂量当量（吸收剂量×权重因子）** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 Sv

```
D * Q
```

必填：`D` (吸收剂量 Gy)
可选：`Q`=1 (辐射权重因：X/γ=1、β=1、中子≈10、α=20)

H = D·Q。同样 1 Gy，α 粒子造成的生物损伤是 X 射线的 20 倍 —— 这就是 Sv 与 Gy 分开的原因。

### radiation_dose_rate

**辐射剂量率** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 Gy

```
A * E_per_decay * t_exp / m
```

必填：`A` (源活度 Bq)、`E_per_decay` (每次衰变沉积能量 J)、`t_exp` (暴露时间 s)、`m` (受照质量 kg)

D = A·E_d·t/m。活度与累积剂量的桥：同样的源，暴露时间翻倍剂量翻倍。

### radioactive_remaining_fraction

**剩余比例（经过若干半衰期）** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 无量纲

```
0.5^n
```

必填：`n` (经过几个半衰期)

N/N₀ = 0.5ⁿ。n=1 剩一半，n=10 剩 0.1%，n=30 剩十亿分之一。

### shielding_halfvalue_layers

**屏蔽所需半值层数** · 层级 fundamental · 领域 物理 · 主角频率 low · 单位 层

```
log(I0 / I) / log(2)
```

必填：`I0` (入射强度)、`I` (目标强度)

n = log(I₀/I)/log2。每穿一层半值层衰减一半 —— 计算防护厚度的标准做法。

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

### solid_angle_cone

**圆锥立体角** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 sr

```
2 * pi * (1 - cos(theta))
```

必填：`theta` (半顶角 rad)

Ω = 2π(1−cosθ)。半顶角 90° 时得 2π（半空间），180° 时得 4π（整球）。

### illuminance_inverse_square

**照度（距离平方反比）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 lx

```
I / r^2
```

必填：`I` (发光强度 cd)、`r` (距离 m)

E = I/r²。点光源的照度随距离平方衰减 —— 「离灯近一倍，亮四倍」。

### luminous_flux_from_intensity_angle

**光通量（发光强度×立体角）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 lm

```
I * omega
```

必填：`I` (发光强度 cd)、`omega` (立体角 sr)

Φ = I·Ω。整球 4π 时，1 cd 的点光源给出 4π lm ≈ 12.57 lm。

### luminance_required

**房间所需光通量** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 lm

```
E * A
```

必填：`E` (目标照度 lx)、`A` (面积 m²)

Φ = E·A。已知「每平米要多少勒克斯」就能算总光通量，再除光效得瓦数。

### lamp_power_from_flux

**灯具功率（按光效）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 W

```
phi / efficacy
```

必填：`phi` (光通量 lm)
可选：`efficacy`=100 (光效 lm/W（LED 约 100，白炽约 12）)

P = Φ/η。光效 η 是这类的关键参数：LED 100—150 lm/W，荧光灯 60—90，白炽灯 12—15。

### illuminance_from_flux_area

**照度（光通量/面积）** · 层级 derived · 领域 物理 · 主角频率 medium · 单位 lx

```
phi / A
```

必填：`phi` (光通量 lm)、`A` (受照面积 m²)

E = Φ/A。

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

### evaporation_saturation_generic

**饱和蒸气压（Clausius-Clapeyron，可换溶剂）** · 层级 fundamental · 领域 物理、化学 · 主角频率 high · 单位 Pa

```
p0 * exp(-latent / R * (1 / T - 1 / T0))
```

必填：`T` (温度 K)
可选：`p0`=101325 (参考温度下的饱和蒸气压 Pa)、`latent`=40650 (汽化潜热 J/mol（水 40650；氨约 23400）)、`R`=8.31446261815324 (气体常数 J/(mol·K))、`T0`=373.15 (参考温度 K（水的常压沸点）)

饱和蒸气压的普适形式。**这是露点、沸点、蒸发的底层物理**：Magnus 经验式（243.04 那些数）只是把这个式子在水附近拟合的近似；而本式换溶剂只需改 latent（氨、甲烷、硫酸都有各自的值）。这也是「为什么高海拔沸点低」的第一性解释。

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

## power/diffusion

### diffusion_s_curve

**技术扩散 S 曲线（当前渗透率）** · 层级 phenomenological · 领域 society · 主角频率 high · 单位 0—1

```
1 / (1 + exp(-rate * (t - t_mid)))
```

必填：`t` (已过时间（年）)、`t_mid` (达到半数渗透的时点（年）)
可选：`rate`=0.5 (扩散速率（每年）)

新事物（铁器、印刷、火药、蒸汽机）的采纳曲线。rate 越大越陡：0.3 约需 20 年过半，1.0 约需 7 年。**这是地球经验值，不同社会差距极大**——收窄或放大 rate 就能表达你的世界。

### diffusion_half_life

**技术扩散达到半数所需时间** · 层级 derived · 领域 society · 主角频率 medium · 单位 年

```
log(1 / 0.01 - 1) / rate
```

可选：`rate`=0.5 (扩散速率（每年）)

从 1% 到 50% 渗透的时间。用来回答「这项技术多久普及」。rate = 0.5 时约 9 年；rate = 0.1 时约 46 年。

## power/energy

### eroi

**能源投资回报率 EROI** · 层级 phenomenological · 领域 物理、society · 主角频率 high · 单位 倍

```
energy_out / energy_invested
```

必填：`energy_out` (获取到的可用能量 J)、`energy_invested` (为获取它而投入的能量 J)

社会能维持的复杂度上限。EROI < 5 时难以支撑城市与专业分工，> 20 才有富余供养军队、艺术与科研。这是「文明能有多复杂」的硬门槛。

### eroi_surplus

**能源净剩余** · 层级 derived · 领域 物理、society · 主角频率 medium · 单位 J

```
energy_out * (1 - 1 / eroi)
```

必填：`energy_out` (总产出能量 J)
可选：`eroi`=20 (EROI（倍）)

扣掉「为了拿到这些能量而消耗的能量」之后，真正能拿去干别的事的部分。EROI = 1 时剩余为 0——再多能源也养不活非生产人口。

### kardashev_scale

**卡尔达肖夫指数** · 层级 conventional · 领域 society · 主角频率 medium · 单位 级

```
(log10(power) - 6) / 10
```

必填：`power` (文明总功率 W)

文明的能源量级。地球当前约 1.8e13 W → 0.73 级；I 型（地球全部日照约 1.7e17 W）→ 1.1（教材常写 1.0，按此式实为 1.1，差异来自「全部日照」与「教材定义」的口径不同）；II 型（恒星约 3.8e26 W）→ 2.0。公式即 (log10 P − 6) / 10。

## power/fiscal

### fiscal_revenue

**财政收入** · 层级 phenomenological · 领域 society · 主角频率 high · 单位 同上口径

```
population * output_per_capita * tax_rate
```

必填：`population` (人口)
可选：`output_per_capita`=3000 (人均年产出（折粮 kg 或等价货币）)、`tax_rate`=0.1 (实际征税率 0—1)

前工业国家的实际征税率通常只有 5%—10%（名义税率可以高得多，但收不上来）。这是「国家能干什么」的真实上限。

### army_pay_cost

**军饷与给养成本** · 层级 phenomenological · 领域 society · 主角频率 high · 单位 同上口径

```
soldiers * pay_per_soldier_year
```

必填：`soldiers` (兵员数)
可选：`pay_per_soldier_year`=1500 (每兵年成本（同财政口径）)

养常备军是前工业国家最贵的开支。兵员成本约为普通劳动力产出的 1.5—3 倍，因为脱产、装备、训练都要摊进去。

### fiscal_burden_ratio

**军费占财政比例** · 层级 derived · 领域 society · 主角频率 high · 单位 倍

```
army_cost / revenue
```

必填：`army_cost` (军费)、`revenue` (财政收入)

> 1 表示打不起（要么加税要么借债要么裁军）。历史上长期 0.5 以上的国家往往在几十年内崩一次。这是「帝国能不能维持」的直接判据。

### fiscal_balance

**财政收支余额（赤字/盈余）** · 层级 fundamental · 领域 经济、society · 主角频率 high · 单位 金额（正为盈余，负为赤字）

```
revenue - expenditure
```

必填：`revenue` (总收入（税收 + 非税）)、`expenditure` (总支出（经常 + 资本 + 利息）)

D = T − G。这是会计恒等式。★ 关键细节：赤字不含借债 —— 借来的钱是「赤字融资」不是「收入」。把借债算成收入，就是财政崩溃前的典型自欺。

### primary_balance

**基本余额（剔除利息后的经营状况）** · 层级 fundamental · 领域 经济、society · 主角频率 high · 单位 金额（正为可裁量盈余，负为结构性亏损）

```
revenue - (expenditure - interest)
```

必填：`revenue` (总收入)、`expenditure` (总支出（含利息）)、`interest` (利息支出)

PB = T − (G − 利息) = 财政余额 + 利息。★ 这是判断「这个政权还有没有救」的第一条判据：PB 为正而总赤字为负 → 经营是赚的，只是被旧债利息拖垮（可救）；PB 为负 → 经营本身在亏，越借越亏（结构性危机）。

### fiscal_sustainability

**财政可持续性判据（i−g 缺口）** · 层级 derived · 领域 经济、society · 主角频率 high · 单位 占 GDP 的年变化率（正为债务负担加重）

```
(interest_rate - growth_rate) * debt_ratio - primary_balance
```

必填：`interest_rate` (名义利率 i)、`growth_rate` (名义增长率 g)、`debt_ratio` (债务/GDP 比 d（如 0.8 表示 80%）)、`primary_balance` (基本余额占 GDP 比（盈余为正）)

Δd = (i − g)·d − PB。稳定条件为 PB ≥ (i − g)·d。★ i > g 时债务会自我膨胀 —— 这解释了为何古代帝国（高利率低增长）财政脆弱，而工业革命后的高增长期能承受高债务。★ 结果为正 = 债务负担在加重；为负 = 在改善。

### seigniorage

**铸币税（通胀税）** · 层级 derived · 领域 经济、society · 主角频率 high · 单位 与货币余额同单位（占 GDP 或金额）

```
inflation * real_money_balance
```

必填：`inflation` (通胀率（小数）)、`real_money_balance` (实际货币余额（占 GDP 或金额）)

铸币税 ≈ 通胀率 × 实际货币余额（精确式为 Δ基础货币/物价）。★ 这是财政与货币的唯一接口：税收加不动、借债又 i>g 时，铸币成为最后财源。而它本质是「对持有货币者的隐性征税」→ 通胀。★ 历史上几乎所有恶性通胀都发生在财政危机之后，机制正是这条。

### effective_tax_rate

**有效税率（实际 vs 名义）** · 层级 conventional · 领域 经济、society · 主角频率 high · 单位 无量纲（占 GDP 比）

```
actual_revenue / gdp
```

必填：`actual_revenue` (实际征得税收)、`gdp` (总产出 GDP)

ETR = 实际税收/GDP。★ 它与名义税率不是一回事：差额正是漏征、免征、逃税。前工业国家的 ETR 通常只有 5%—10%，名义税率再高也收不上来。★ 名义与实际之差本身就是「政权对社会渗透能力」的度量 —— 一个可调的世界观参数。

### fiscal_autonomy

**财政自由度（可裁量支出占比）** · 层级 conventional · 领域 经济、society · 主角频率 high · 单位 无量纲（0—1）

```
1 - rigid_share
```

必填：`rigid_share` (刚性支出占比（官僚+军饷+利息，0—1）)

可裁量支出 / 总支出 = 1 − 刚性占比。★ 这是「改革为什么推不动」的定量答案：刚性 80%+ 时政权几乎无政策自由度，任何外部冲击都直接触发危机；刚性 50% 时才有余力搞建设。刚性部分 = 官僚薪酬 + 军饷 + 利息，是砍不掉的那一块。

## power/food

### grain_yield_total

**粮食总产** · 层级 phenomenological · 领域 society · 主角频率 high · 单位 kg/年

```
area_hectare * kg_per_hectare * 0.9
```

必填：`area_hectare` (耕地面积 公顷)
可选：`kg_per_hectare`=3000 (每公顷年产 kg)

「0.9」是收后损耗与留种。传统农业 1000—3000 kg/公顷，现代农业 6000—8000。这是「能养多少人」的起点。

### population_fed_by_grain

**粮食能供养的人口** · 层级 phenomenological · 领域 society · 主角频率 high · 单位 人

```
grain_kg * kcal_per_kg * 4184 / (kcal_per_person_day * 365 * 4184)
```

必填：`grain_kg` (可用粮食 kg/年)
可选：`kcal_per_kg`=3500 (每公斤热量 kcal)、`kcal_per_person_day`=2200 (人均日需热量 kcal)

纯口粮口径的供养上限。实际要打折——还要饲料、酿酒、纺织、储备。人均 2200 kcal 是温饱线，不是舒适线。

### arable_land_needed

**供养人口所需耕地** · 层级 derived · 领域 society · 主角频率 high · 单位 公顷

```
population * kcal_per_person_day * 365 / (kg_per_hectare * kcal_per_kg * 0.9)
```

必填：`population` (人口)
可选：`kcal_per_person_day`=2200 (人均日需热量 kcal)、`kg_per_hectare`=3000 (每公顷年产 kg)、`kcal_per_kg`=3500 (每公斤热量 kcal)

反向问法：先有一个人口数，反推需要多少耕地。「这个王国养得起两百万人口吗」直接用它。

## power/information

### info_delivery_time

**信息传递耗时** · 层级 phenomenological · 领域 society · 主角频率 high · 单位 天

```
distance / speed_km_per_day
```

必填：`distance` (距离 km)
可选：`speed_km_per_day`=200 (传信速度 km/天)

驿马接力约 200—400 km/天，步行信使约 40 km/天，烽火几乎瞬时但只能传固定信号。这是「政令能不能及时到达」的物理基础。

### admin_radius_from_info

**可有效统治的半径** · 层级 derived · 领域 society · 主角频率 high · 单位 km

```
speed_km_per_day * max_days / 2
```

可选：`speed_km_per_day`=200 (传信速度 km/天)、`max_days`=20 (可容忍的单程延迟（天）)

「往返一趟还在可控范围内」的半径。除以 2 是因为要算来回。骑马帝国约 2000 km，正是历史上大帝国尺寸相近的原因——不是巧合，是通信速度决定的。

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
