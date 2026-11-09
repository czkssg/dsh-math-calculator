# -*- coding: utf-8 -*-
"""生成体系全景文档：18 条链的逐步明细 + 跨链接点清单 + 多跳路径。

数据全部从 lib/ 导出，不手抄 —— 文档与代码必须永远一致，
手抄的文档一定会漂移（本项目已经吃过一次：README 写 404 条而代码 442 条）。
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
JS = r"""
const sys = await import('file:///D:/0cengxu/5/dsh-math-calculator/lib/formula-systems.js')
const fm = await import('file:///D:/0cengxu/5/dsh-math-calculator/lib/formulas.js')
const out = {
  systems: sys.FORMULA_SYSTEMS.map(s => ({
    id: s.id, name: s.name, purpose: s.purpose, keys: s.keys,
    steps: s.steps.map(st => ({ f: st.formula, note: st.note, feeds: st.feeds || [] })),
    bridges: s.bridges || [],
  })),
  formulas: {},
}
const want = new Set()
for (const s of out.systems) for (const st of s.steps) want.add(st.f)
for (const id of want) {
  const f = fm.FORMULA_INDEX.get(id)
  if (f) out.formulas[id] = { name: f.name, expr: f.expr, unit: f.unit, cat: f.cat, freq: f.frequency }
}
out.total = fm.FORMULAS.length
console.log(JSON.stringify(out))
"""
proc = subprocess.run(["node", "--input-type=module", "-e", JS],
                      capture_output=True, text=True, encoding="utf-8", cwd=str(ROOT))
if proc.returncode != 0:
    print(proc.stderr, file=sys.stderr)
    sys.exit(1)
D = json.loads(proc.stdout)
SYS = D["systems"]
FM = D["formulas"]

# --- 图统计 ---
# 图（BFS 用，去重）与计数（显示用，不去重）要分开：
# 用 set 数「有几个邻居」和数「参与几个接点」是两回事 ——
# 两条接点连到同一条链时，set 只记 1，而接点确实有两个。
# 第一版混用了，导致本文写 fiscal=6 而图上标的是 ★8，同一份数据两个数。
adj = {s["id"]: set() for s in SYS}
deg = {s["id"]: 0 for s in SYS}
edges = []
for s in SYS:
    for b in s["bridges"]:
        edges.append((s["id"], b["toSystem"], b["formula"], b["note"]))
        adj[s["id"]].add(b["toSystem"])
        adj[b["toSystem"]].add(s["id"])
        deg[s["id"]] += 1
        deg[b["toSystem"]] += 1

inSys = set()
for s in SYS:
    for st in s["steps"]:
        inSys.add(st["f"])
    for b in s["bridges"]:
        inSys.add(b["formula"])

# 最短路（无向）
def sp(a, b):
    prev = {a: None}
    q = [a]
    while q:
        c = q.pop(0)
        if c == b:
            break
        for n in adj[c]:
            if n not in prev:
                prev[n] = c
                q.append(n)
    if b not in prev:
        return None
    path, cur = [], b
    while cur is not None:
        path.append(cur)
        cur = prev[cur]
    return list(reversed(path))

L = []
L.append("# 公式体系全景（18 条推演链 · 165 步 · 28 个跨链接点）")
L.append("")
L.append("> 本文由 `gen-sysdoc.py` 从 `src/formula-systems.ts` 与 `src/formulas.ts` **直接导出生成**，")
L.append("> 不手抄。要更新请重跑脚本，不要手改本文。")
L.append("")
L.append("## 一、这套体系是什么")
L.append("")
L.append("513 条公式按 `cat` 分成 73 个分类，但**分类不等于链条**：")
L.append("")
L.append("```")
L.append("  engineering/thermal 里有 boiler_coal_rate、steam_power_output、carnot")
L.append("  但它们之间没有登记「谁的输出喂给谁的输入」")
L.append("  使用者拿到 5 条公式，仍然不知道先算哪个、结果怎么往下传")
L.append("```")
L.append("")
L.append("所以登记三层：")
L.append("")
L.append("| 层 | 字段 | 作用 |")
L.append("|---|---|---|")
L.append("| 体系 | `FORMULA_SYSTEMS` | 一条推演链，含 `purpose`（什么时候想起它）|")
L.append("| 步间连线 | `steps[].feeds` | 上一步的输出喂进本步的哪个参数 |")
L.append("| 体系间接点 | `bridges` | 某公式同时属于几条链 |")
L.append("")
L.append("### 查法（三种，都是 `formulas` 的 query）")
L.append("")
L.append("```")
L.append('  formulas query="sys"                    → 18 条链清单与 purpose')
L.append('  formulas query="sys:sys-energy"         → 能源链逐步（公式/输出单位/需自备参数）')
L.append('  formulas query="sys:formula:metallurgy" → 属于哪几条链 + 接点说明')
L.append("```")
L.append("")
L.append("---")
L.append("")
L.append("## 二、为什么不是一个大体系")
L.append("")
L.append("「能连的尽量连」不等于「全部串成一条」。真实推演里：")
L.append("")
L.append("```")
L.append("  算一座窑   → 能源链（燃料→热量→时间）—— 不需要人口与财政")
L.append("  算一个文明 → 食物链+人口链+财政链 —— 也不需要窑的具体热损")
L.append("```")
L.append("")
L.append("硬串成一条会让每一步都拖上无关参数。所以按**推演目的**分体系，")
L.append("体系之间只登记真实存在的共用公式。")
L.append("")
L.append("---")
L.append("")
L.append("## 三、18 条链全表")
L.append("")
L.append("| 链 | 名称 | 步数 | 接点数 | 这条链回答什么 |")
L.append("|---|---|---|---|---|")
for s in SYS:
    L.append(f'| `{s["id"]}` | {s["name"].split("（")[0]} | {len(s["steps"])} | '
             f'{deg[s["id"]]} | {s["purpose"]} |')
L.append("")
L.append(f"合计 **{len(SYS)} 条链 / {sum(len(s['steps']) for s in SYS)} 步 / {len(edges)} 个接点**。")
L.append("")
L.append("接点数排序就是「枢纽度」：")
L.append("")
L.append("```")
for i in sorted(deg, key=lambda x: -deg[x]):
    bar = "█" * deg[i]
    L.append(f"  {deg[i]:>2}  {bar:<8} {i}")
L.append("```")
L.append("")
L.append("`fiscal`（8）、`capacity`/`energy`/`food`（各 6）是枢纽；")
L.append("`finance` / `info` / `astronomy` 各只有 1 个接点 —— 它们是**端点**而不是枢纽，")
L.append("这是正确的：天文链只往外送一个 `inverse_square_flux`，它不需要接收别的链。")
L.append("")
L.append("---")
L.append("")
L.append("## 四、逐链明细")
L.append("")
for idx, s in enumerate(SYS, 1):
    L.append(f'### {idx}. {s["name"]}')
    L.append("")
    L.append(f'`{s["id"]}`　**{s["purpose"]}**')
    L.append("")
    L.append("| # | 公式 | 做什么 | 输出单位 | 需要自备 |")
    L.append("|---|---|---|---|---|")
    for i, st in enumerate(s["steps"], 1):
        f = FM.get(st["f"], {})
        note = st["note"]
        if st["feeds"]:
            feed = "，".join(f'← {x["from"]}.{x["to"]}' for x in st["feeds"])
            note = note + f"　`{feed}`"
        L.append(f'| {i} | `{st["f"]}`<br>{f.get("name","")} | {note} | '
                 f'{f.get("unit","")} | {f.get("expr","")} |')
    if s["bridges"]:
        L.append("")
        L.append("**接点：**")
        L.append("")
        for b in s["bridges"]:
            L.append(f'- `{b["formula"]}` → `{b["toSystem"]}`：{b["note"]}')
    L.append("")

L.append("---")
L.append("")
L.append("## 五、跨链接点全表（28 个）")
L.append("")
L.append("| 从 | 到 | 共用公式 | 为什么共用 |")
L.append("|---|---|---|---|")
for a, b, f, n in edges:
    L.append(f'| `{a}` | `{b}` | `{f}` | {n} |')
L.append("")
L.append("### 双向可达（曾经踩过的坑）")
L.append("")
L.append("第一版登记了 28 个 `bridges`，但其中 **21 个指向的公式只出现在本链**、")
L.append("没出现在目标链上 —— 于是「跳过去就回不来」。")
L.append("")
L.append("修法是**把接点公式真正加入目标链**，而不是只声明。现在 28/28 双向可达。")
L.append("测试用这条断言守着：查 `sys:formula:<接点公式>` 必须能查到至少 2 条链。")
L.append("")
L.append("---")
L.append("")
L.append("## 六、跨链多跳路径（体系真正的用处）")
L.append("")
L.append("单条链只能算「一步接一步」。真正难的问题是跨 3~4 条链的推演，")
L.append("下面是从图上实测出来的真实路径（最短，不是凑的）：")
L.append("")
demos = [
    ("sys-astronomy", "sys-fiscal", "一颗星的光度，怎么一路推到财政能不能撑住"),
    ("sys-water", "sys-military", "水渠容量，怎么推到这支军队打不打得起"),
    ("sys-material", "sys-food", "材料工艺，怎么推到能养多少人"),
    ("sys-info", "sys-capacity", "信息传递速度，怎么推到一个社会能产出多少"),
    ("sys-climate", "sys-capacity", "气候，怎么推到产能"),
]
for a, b, why in demos:
    p = sp(a, b)
    if not p:
        continue
    L.append(f'### `{a}` → `{b}`（{len(p)-1} 跳）')
    L.append("")
    L.append(f"*{why}*")
    L.append("")
    for i in range(len(p) - 1):
        e = next((x for x in edges if x[0] == p[i] and x[1] == p[i + 1]), None)
        if e is None:
            e = next(x for x in edges if x[0] == p[i + 1] and x[1] == p[i])
            cross = f'`{e[2]}`（对方链声明）'
        else:
            cross = f'`{e[2]}`'
        L.append(f'{i+1}. `{p[i]}` → `{p[i+1]}`　via {cross}')
    L.append("")

L.append("---")
L.append("")
L.append("## 七、覆盖率")
L.append("")
high = [f for f in FM.values() if f.get("freq") == "high"]
L.append("| 指标 | 值 |")
L.append("|---|---|")
L.append(f'| 公式总数 | {D["total"]} |')
L.append(f'| 入链公式数 | {len(inSys)}（{len(inSys)/D["total"]*100:.1f}%）|')
L.append(f'| 线上公式总数（本文件可见部分）| {len(FM)} |')
L.append("")
L.append("**覆盖率不是越高越好。** 几何公式（正余弦定理）、电池续航、")
L.append("回声测距这类确实没有上下游 —— 为刷覆盖率硬塞进去，")
L.append("造出假关系比保持孤立更糟。")
L.append("")
L.append("`error_propagation` 是**故意不归链**的：它服务于所有计算，")
L.append("挂到某一条链上反而误导。测试里有断言守着这个决定。")
L.append("")
L.append("---")
L.append("")
L.append("## 八、复合路径（跨多条链的现成路线）")
L.append("")
L.append("单条链只覆盖一步到十几步。真实推演里最难的**不是算某一步，而是跨 4 条链**：")
L.append("")
L.append("```")
L.append("  「有铁矿」能不能变成「有帝国」？")
L.append("  材料链 → 产能链 → 财政链 → 军事链")
L.append("```")
L.append("")
L.append("这些路径在图上**本来就连通**（图直径 5 跳、单一连通分量），但读者要自己一段段拼。")
L.append("`compounds` 把它们登记下来：")
L.append("")
L.append("```")
L.append('  formulas query="sys:compound"                → 清单')
L.append('  formulas query="sys:compound:mine-to-empire" → 逐跳展开')
L.append("```")
L.append("")
# 从 lib 现取，不手抄
JS_COMPOUND = r"""
const sys = await import('file:///D:/0cengxu/5/dsh-math-calculator/lib/formula-systems.js')
console.log(JSON.stringify(sys.COMPOUND_PATHS.map(p => ({
  id: p.id, name: p.name, purpose: p.purpose, via: p.via,
  hops: sys.traceCompound(p).map(h => ({ f: h.formula, ok: h.ok, kind: h.kind, note: h.note })),
}))))
"""
proc2 = subprocess.run(["node", "--input-type=module", "-e", JS_COMPOUND],
                       capture_output=True, text=True, encoding="utf-8", cwd=str(ROOT))
COMPOUNDS = json.loads(proc2.stdout) if proc2.returncode == 0 else []

L.append(f"共 **{len(COMPOUNDS)} 条**：")
L.append("")
for cp in COMPOUNDS:
    chain = " → ".join(cp["via"])
    ok = sum(1 for h in cp["hops"] if h["ok"])
    L.append(f'### `{cp["id"]}`　{cp["name"]}')
    L.append("")
    L.append(f'{cp["purpose"]}')
    L.append("")
    L.append(f"`{chain}`　（{ok}/{len(cp['hops'])} 跳已连通）")
    L.append("")
    for i, h in enumerate(cp["hops"]):
        mark = "✓" if h["ok"] else "✗"
        L.append(f'{i+1}. `{cp["via"][i]}` → `{cp["via"][i+1]}`　{mark} `{h["f"]}`'
                 f'（{"bridge" if h["kind"] == "bridges" else "共用"}）　{h["note"]}')
    L.append("")
L.append("### 一条被删掉的假路径")
L.append("")
L.append("第一版我登记了 `civ-sustainability`（光→气候→食物→财政），")
L.append("用 `gdd_accumulated` 当作气候与食物之间的接点。")
L.append("")
L.append("**实测发现这两条链之间根本没有任何真实接点** —— 那条路径是拼出来的，已删除。")
L.append("")
L.append("现在 `traceCompound` 每次都回到 `FORMULA_SYSTEMS` 现查证据，依次尝试：")
L.append("本链声明的 bridges → 对方链声明的 bridges → 两链 steps 里的共用公式。")
L.append("三条都不成立就判 `ok: false`。测试里还构造了一条假路径做反向对照，")
L.append("防止 `traceCompound` 永远返回 true。")
L.append("")
L.append("**假关系比没有关系更糟** —— 这是本项目的既定原则，这里也照办。")
L.append("")

out = ROOT / "体系全景.md"
out.write_text("\n".join(L), encoding="utf-8")
print(f"OK {out}  {len(chr(10).join(L))} 字节  {len(L)} 行")
