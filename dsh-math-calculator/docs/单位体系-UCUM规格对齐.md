# 单位体系：对齐 UCUM 规格与别名索引

> 目标（2026-11-15 用户指示）：本地单位体系**仿照 UCUM 正规规格**；UCUM 有而本地没有的**通通补上**（单位不嫌多）；
> UCUM 已有的重点做**别名系统**（防止写对了名字却不命中）；本地非 UCUM 单位同样要有别名与桥接。

## 一、三层数据

| 文件 | 内容 | 数量 |
|---|---|---|
| `src/data/units-ucum.json` | UCUM 全表（来自 ucum-lhc 8.0.1）：code / name / synonyms / dimVec / magnitude / magnitudeSi / dimension / si / isBase / isMetric / property | **767** |
| `src/data/unit-bridge.json` | 本地非 UCUM 单位（古制/英制/地区）：alias / name / factor / si / dimension | **1,032** |
| `src/data/unit-aliases.json` | **统一别名索引**：alias → {source: ucum\|local, code, name, factor, si, dimension} | **4,764** |

## 二、仿照 UCUM 规格的字段

```
code          权威码（大小写敏感，如 m / kg / Cel）
name          全名（meter / degree Celsius）
synonyms      同义词（分号/逗号分隔，来自 UCUM：pounds / av lbs / avoirdupois pounds…）
dimVec        7 位维度向量，顺序 m, s, kg, A, K, mol, cd
magnitude     相对 UCUM 基准的倍数
magnitudeSi   折成 SI 后的倍数（质量基准 gram → kg，×0.001^kg指数）
dimension     归一维度（length/mass/time/area/volume/…/other）
si            该维度的 SI 基准单位
isBase / isMetric / property   基准/公制/物理量属性
```

## 三、别名覆盖（防止「名字对了却不认识」）

| 来源 | 别名数 | 说明 |
|---|---|---|
| UCUM code/name/同义词 | 3,909 | 含 metre/metre/meters/metres 这类全变体 |
| 本地新增（UCUM 没有的中文/历史/地区写法） | 855 | 担/市尺/普特/图瓦兹/蒲式耳… |
| 被 UCUM 覆盖（同名同义） | 177 | 以 UCUM 条目为准，本地值仍保留在 unit-bridge.json 备查 |

## 四、管道消费顺序

```
输入单位 → unit-aliases.json 查别名
  命中 source=ucum   → 现代，直通（factor 相除）
  命中 source=local  → 非现代，桥接（factor 相除，等价于「换 SI 再换回」）
  未命中            → UCUM validateUnitString 兜底（复合单位）
  仍未知            → 明确报错（不猜）
```

## 五、实测

| 表达式 | 结果 |
|---|---|
| `1 metre to m` | 1 m（同义词命中） |
| `1 litre to L` | 1 L |
| `1 pound to kg` | 0.45359237 kg（UCUM 同义词表） |
| `1 担 to kg` | 50 kg（本地桥接） |
| `1 kg to 担` | 0.02 担（回写） |
| `1 市尺 to cm` | 33.333 cm |

## 六、边界

- 单位别名**不能含空格**：表达式里的单位是 `\S+`，带空格的同义词（`av lbs`）只能以理论形态存在，实际调用请用 `lb_av` 这类无空格写法；
- 同名异物（gal/Gal、s/S、B/bel）**按大小写区分**；小写归一匹配会把它们混成同一个，这在比对脚本里已单独处理；
- 本地 `mol`/`kat` 与 UCUM 的基准不同（UCUM 以粒子数计），桥接时以本地为准，跨体系比较需注明。
