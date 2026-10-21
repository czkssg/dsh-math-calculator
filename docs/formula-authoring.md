# 公式库扩展与符号约定

面向：后来的人、另一个 AI。

## 两级扩展，别混用

| 级别 | 存在哪 | 谁可见 | 适合什么 |
|---|---|---|---|
| **全局公式包** | `$DSH_HOME/math-calc/formula-packs/global.json` | 所有工作区 | 这套设定里反复用、值得沉淀的公式 |
| **工作区临时公式** | 工作区 JSON 的 `formulaTable.custom` | 只有当前世界观 | 一次性试算、还没想清楚的公式 |

内置 270 条公式改的是**代码**（`src/formula-library*.ts`）；这两级都不需要改代码、不需要重装。

## 全局公式包：文件格式

```json
{
  "version": 1,
  "updatedAt": "2026-10-22T00:00:00.000Z",
  "formulas": [
    {
      "id": "my_weight",
      "cat": "physics/custom",
      "name": "测试：重量",
      "expr": "m * g",
      "params": {
        "m": { "value": 1, "desc": "质量 kg" },
        "g": { "value": 9.80665, "desc": "重力加速度 m/s^2" }
      },
      "unit": "N",
      "desc": "F = mg。",
      "keys": ["weight", "重量"]
    }
  ]
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✓ | 小写字母开头，只含 `a-z0-9_`，2–64 字符；不能与内置公式重名 |
| `cat` | ✓ | 分类路径，如 `physics/custom` |
| `name` | ✓ | 中文名（展示与检索用） |
| `expr` | ✓ | mathjs 表达式；变量必须出现在 `params` 或 `CONSTANTS` 里 |
| `params` | ✓ | 参数表：名字 → `{ value, desc }`；`value: null` 表示必填 |
| `desc` | ✓ | 一句话物理说明（会展示给调用方） |
| `unit` |  | 结果单位（仅展示） |
| `keys` |  | 检索关键词（中英文都放） |

### 校验规则（不合格会被拒绝，并说明原因）

1. id 格式与重名；
2. `expr` 必须能被 mathjs 解析；
3. `expr` 里的符号必须是 `params` 的键或 `CONSTANTS` 的键——**拼错变量名会被当场抓住**；
4. 每个参数必须有 `desc`，且写清**物理概念与单位**（例：`"质量 kg"`、`"距离 m"`）。

## 用工具增删，而不是手改 JSON

```jsonc
// 新增
{"operation":"formula-table","tableAction":"global-add","customFormula":{ ... }}
// 列出
{"operation":"formula-table","tableAction":"global-list"}
// 删除
{"operation":"formula-table","tableAction":"global-remove","formulaId":"my_weight"}
```

新增后立即可用：`{"operation":"formula","formula":"my_weight","overrides":{"m":2}}`。

## 符号约定：同字母不同含义怎么办

同一个字母在不同公式里含义不同（`m` 既可能是质量也可能是米）。本库的处理方式：

1. **符号就是参数名**（表达式里怎么写，符号就是什么），不另维护一份表——避免两份数据脱节；
2. **单位和概念写在参数 `desc` 里**，由 `symbols.ts` 自动解析（"质量 kg" → 概念=质量，单位=kg）；
3. **查询时带语境**：
   ```jsonc
   {"operation":"formulas","query":"symbol:m"}          // 列出 m 的全部含义
   {"operation":"formulas","query":"symbol:m@质量"}      // 只看"质量"这一种
   {"operation":"formulas","query":"symbol:*"}           // 列出所有多义符号
   ```

### 写新公式时的命名建议

- 容易混淆的符号加限定词：`m_body`、`r_orbit`、`T_surface`；
- `desc` 必须带单位，否则符号索引无法消歧；
- 公式 `desc` 写清「这是什么」和「什么时候用」，这是给 AI 的调用依据。

## 三轴标签（重要：分类不是学科）

一条公式同时带三条**互相独立**的标签，另加自由细标签：

### 1) layer：离最底层规则的远近

| 层级 | 含义 | 例子 |
|---|---|---|
| `fundamental` 基本规则 | 守恒律、相对论、量子、热力学定律 | 洛伦兹因子、光电效应 |
| `derived` 导出规律 | 由基本规则推出、有闭合式 | 牛顿第二定律、环向应力、回声测距 |
| `phenomenological` 经验规律 | 带实验拟合系数，量级可信 | 风寒指数、疲劳寿命、Kleiber 代谢 |
| `engineering` 工程换算 | 几何、配比、剂量、补给 | 用砖量、灌溉水量、按体重给药 |
| `conventional` 社会约定 | 货币、制度、统计口径、经验规则 | 楼梯舒适度、经济指标 |

> 旧字段 `cat`（physics/mechanics 之类）只是路径，**不再作为分类依据**。

### 2) domains：学科领域（多标签）

`physics / chemistry / biology / materials / earth / astronomy / engineering /
military / agriculture / medicine / economics / social / math`，一条公式可同时属于多个。
例：环向应力 = `materials` + `engineering`；人体表面积 = `biology` + `medicine`。

### 3) frequency：主角感知频率

**不是"世界观推导常用度"，而是"以主角为视角，读者在故事里感知到它的频率"。**

- `high`：主角会直接看到/摸到/被影响（砖墙会不会塌、船多快、风多冷、箭射多远、人一天喝多少水）；
- `medium`：设定与推演常用，但不直接出现在场景里；
- `low`：量子/核物理/相对论/金融——除非故事专门讲这些。

频率与层级**独立**：用砖量是「工程 + 高频」，洛伦兹因子是「基本规则 + 低频」。

### 查询

```jsonc
{"operation":"formulas","query":"layer:derived"}   // 按层级（中文：层级:经验）
{"operation":"formulas","query":"domain:物理"}      // 按领域（多标签）
{"operation":"formulas","query":"freq:high"}        // 按主角感知频率
```

## 给别人维护的检查清单

- [ ] `npm run build && npm run test:all` 全绿
- [ ] 新公式的 `expr` 在 `params/CONSTANTS` 范围内（校验器会查）
- [ ] `desc` 含单位；`keys` 含中英文关键词
- [ ] 若改了内置公式，同步 `FORMULAS.md`（`node test/formulas-list.mjs`）
- [ ] 若新增了符号含义，`symbol:*` 能查到

## 生成公式目录

```bash
node test/formulas-list.mjs   # 重新生成 FORMULAS.md
```
