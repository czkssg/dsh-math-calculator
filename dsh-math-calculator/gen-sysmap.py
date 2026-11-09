# -*- coding: utf-8 -*-
"""从 lib/formula-systems.js 导出体系结构，生成紧凑的拓扑 SVG。

## 布局为什么用「语义分组网格」而不是力导向 / 分层

第一次试了最长路径分层：结果 L1 挤了 8 条链，后面每层只有 1 条，
画出来 2586×1610 —— 因为这张依赖图本身就是 5 跳的长链（天文→气候→能源→产能→财政）。

力导向能反映真实拓扑，但中文卡片宽 268px，18 个节点必然重叠，
而**在没有视觉反馈的环境里，力导向是赌运气**。

所以选可预测的方案：按推演领域分 3 组、6 列 3 行网格。
位置由语义决定（人读得懂），边用贝塞尔曲线（不会被卡片压住）。
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
JS = r"""
const sys = await import('file:///D:/0cengxu/5/dsh-math-calculator/lib/formula-systems.js')
console.log(JSON.stringify(sys.FORMULA_SYSTEMS.map(s => ({
  id: s.id, name: s.name, purpose: s.purpose,
  steps: s.steps.map(st => ({ f: st.formula, note: st.note, feeds: st.feeds || [] })),
  bridges: s.bridges || [],
}))))
"""
proc = subprocess.run(["node", "--input-type=module", "-e", JS],
                      capture_output=True, text=True, encoding="utf-8", cwd=str(ROOT))
if proc.returncode != 0:
    print(proc.stderr, file=sys.stderr)
    sys.exit(1)
SYSTEMS = json.loads(proc.stdout)
SYS = {s["id"]: s for s in SYSTEMS}

edges = []
for s in SYSTEMS:
    for b in s["bridges"]:
        edges.append((s["id"], b["toSystem"], b["formula"], b["note"]))

deg = {s["id"]: 0 for s in SYSTEMS}
for a, b, f, n in edges:
    deg[a] += 1
    deg[b] += 1

# 语义三组：自然基础 / 生产与机体 / 社会与经济
GROUPS = [
    ("Ⅰ 自然基础（世界为什么这样）", [
        "sys-astronomy", "sys-material", "sys-structure",
        "sys-energy", "sys-climate", "sys-water",
    ]),
    ("Ⅱ 物质与信息（能造什么、能传多远、能控多准）", [
        "sys-quantum", "sys-info-control", "sys-decision",
        "sys-capacity", "sys-queue", "sys-travel",
    ]),
    ("Ⅲ 生产与机体（能产出多少、能活多大）", [
        "sys-food", "sys-body", "sys-physiology",
        "sys-building", "sys-military", "sys-time",
    ]),
    ("Ⅳ 社会与经济（能管多宽、能撑多久）", [
        "sys-info", "sys-finance", "sys-growth",
        "sys-fiscal",
    ]),
]
assert sum(len(g[1]) for g in GROUPS) == len(SYSTEMS), "分组必须覆盖全部链且不重复"
allg = [i for _, g in GROUPS for i in g]
assert sorted(allg) == sorted(SYS), "分组与代码里的链不一致：" + str(set(allg) ^ set(SYS))

CARD_W, CARD_H = 262, 78
GAP_X, GAP_Y = 44, 210   # 22 条链后跨组连线增至 24 条，158 不够分槽（实测标签压卡片）
GROUP_H = 34          # 组标题占高
ROW_CHANNEL = 46      # 行内连线通道：从卡片上沿往上 46px 放标签
PAD_X, PAD_Y = 56, 212   # 上边距要够第Ⅰ组走一条行内通道 + 标签（46px 装不下，实测压到标题）
COLS = 6
ROWS = len(GROUPS)

W = PAD_X * 2 + COLS * CARD_W + (COLS - 1) * GAP_X
CONTENT_BOTTOM = PAD_Y + ROWS * (CARD_H + GAP_Y + GROUP_H) - GAP_Y  # 最后一行卡片底部
H = CONTENT_BOTTOM + 58   # 只留图例那一行，不要按 PAD_Y*2 撑（那会多出 200px 空白）

coord = {}
group_band = {}
for r, (gname, gids) in enumerate(GROUPS):
    y_band = PAD_Y + r * (CARD_H + GAP_Y + GROUP_H)
    group_band[gname] = y_band
    for c, sid in enumerate(gids):
        coord[sid] = (PAD_X + c * (CARD_W + GAP_X), y_band + GROUP_H)

def center(sid):
    x, y = coord[sid]
    return x + CARD_W / 2, y + CARD_H / 2

def row_top_limit(y):
    """某一行的拱顶最高能到哪 —— 不能钻到上一组的卡片里。

    第一版用固定的 y=92，结果第Ⅲ组的弧线拱高 500+ px，
    直接盖在第Ⅱ组的卡片上（实测 fiscal_burden_ratio 压在产能链卡片上）。
    """
    # 找到这一行属于第几组
    for r, (gname, gids) in enumerate(GROUPS):
        y_band = PAD_Y + r * (CARD_H + GAP_Y + GROUP_H)
        if abs(coord[gids[0]][1] - (y_band + GROUP_H)) < 1:
            if r == 0:
                return 92
            # 上一组卡片底部 + 组标题高度 + 余量
            return y_band - GAP_Y + 8
    return 92


def edge_curve(a, b):
    """返回路径点列表（供折线与标签定位共用）。

    ## 为什么同组走拱弧、跨组走正交折线

    第一版全都用贝塞尔 S 形，结果跨组线在中间区域交织成一团、还穿过卡片 ——
    因为两组在同一列时 x1≈x2，S 形退化成一条竖直穿心的线。

    正交折线走**组间通道**（每两组之间有 GAP_Y+GROUP_H 的空白带）就不会穿卡片，
    代价是不如曲线好看。但这类图的价值在可读性，不在好看。
    """
    ax, ay = coord[a]
    bx, by = coord[b]
    acx, acy = center(a)
    bcx, bcy = center(b)
    if abs(ay - by) < 1:
        span = abs(acx - bcx)
        if span > CARD_W * 3:
            yslot = ay - ROW_CHANNEL
            return [(acx, ay), (acx, yslot), (bcx, yslot), (bcx, by)]
        limit = row_top_limit(ay)
        room = ay - limit
        lift = min(58 + span * 0.16, max(room, 26))
        return [(acx, ay), (acx, ay - lift), (bcx, by - lift), (bcx, by)]
    # 跨组：竖直 → 水平（走通道）→ 竖直
    down = by > ay
    y_from = ay + CARD_H if down else ay
    y_to = by if down else by + CARD_H
    return [(acx, y_from), (acx, y_to), (None, None), (bcx, y_to)]


def assign_slots(edges_list):
    """给每条跨组边分配通道内的 y 槽位，避免重叠。"""
    slots = {}
    # 按通道（相邻两组之间）分组
    bands = {}
    for a, b, formula, note in edges_list:
        ay = coord[a][1]
        by = coord[b][1]
        if abs(ay - by) < 1:
            continue
        lo, hi = (ay, by) if ay < by else (by, ay)
        key = (lo, hi)
        bands.setdefault(key, []).append((a, b, formula))
    for key, items in bands.items():
        lo, hi = key
        gap_top = lo + CARD_H       # 上一组卡片底
        gap_bot = hi - GROUP_H      # 下一组标题之上
        span = gap_bot - gap_top
        n = len(items)
        for i, (a, b, formula) in enumerate(sorted(items)):
            # n 条线均分通道，夹在中间 60% 范围内
            if n == 1:
                y = gap_top + span * 0.5
            else:
                y = gap_top + span * (0.20 + 0.60 * i / (n - 1))
            slots[(a, b, formula)] = y
    return slots


slots = assign_slots(edges)


def edge_points(a, b, formula):
    pts = edge_curve(a, b)
    if pts[2][0] is None:
        yslot = slots.get((a, b, formula), (pts[0][1] + pts[1][1]) / 2)
        return [pts[0], (pts[0][0], yslot), (pts[3][0], yslot), pts[3]]
    return pts


def edge_path(a, b, formula):
    pts = edge_points(a, b, formula)
    return "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts)


def polyline_at(pts, t):
    """在折线上按弧长比例取点。"""
    segs = []
    total = 0.0
    for i in range(len(pts) - 1):
        x1, y1 = pts[i]
        x2, y2 = pts[i + 1]
        d = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
        segs.append((d, (x1, y1), (x2, y2)))
        total += d
    if total == 0:
        return pts[0]
    target = total * t
    acc = 0.0
    for d, p1, p2 in segs:
        if acc + d >= target:
            r = (target - acc) / d if d else 0
            return (p1[0] + (p2[0] - p1[0]) * r, p1[1] + (p2[1] - p1[1]) * r)
        acc += d
    return pts[-1]


# ---- 标签定位：沿曲线取点，并与已放置的标签、卡片避让 ----
def label_box(x, y, formula):
    w = len(formula) * 5.4 + 7
    return (x - w / 2, y - 7.5, w, 13.5)


def collides(box, placed, cards_xy, pad=2):
    x, y, w, h = box
    # 越界也算撞：跑到标题带或画布外，读者就看不见了
    if x < 4 or y < 86 or x + w > W - 4 or y + h > H - 40:
        return True
    for (px, py, pw, ph) in placed:
        if x < px + pw + pad and px < x + w + pad and y < py + ph + pad and py < y + h + pad:
            return True
    for cx, cy in cards_xy:
        if x < cx + CARD_W and cx < x + w and y < cy + CARD_H and cy < y + h:
            return True
    return False


placed_labels = []
label_pos = {}
cards_list = list(coord.values())  # 供标签避让用
# 先放同组弧线（拱顶位置天然分散），再放跨组 S 形（容易挤，给它更多备选 t）
order = sorted(edges, key=lambda e: 0 if abs(coord[e[0]][1] - coord[e[1]][1]) < 1 else 1)
for a, b, formula, note in order:
    pts = edge_points(a, b, formula)
    cands = [0.5, 0.35, 0.65, 0.22, 0.78, 0.14, 0.86]
    chosen = None
    for t in cands:
        x, y = polyline_at(pts, t)
        box = label_box(x, y, formula)
        if not collides(box, placed_labels, cards_list):
            placed_labels.append(box)
            chosen = (x, y)
            break
    if chosen is None:
        # 全部候选都撞：沿竖直方向让开
        x, y = polyline_at(pts, 0.5)
        for dy in (-15, 15, -25, 25, -35, 35):
            box = label_box(x, y + dy, formula)
            if not collides(box, placed_labels, cards_list):
                placed_labels.append(box)
                chosen = (x, y + dy)
                break
    if chosen is None:
        chosen = polyline_at(pts, 0.5)
        placed_labels.append(label_box(chosen[0], chosen[1], formula))
    label_pos[(a, b, formula)] = chosen

out = []
out.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.0f}" height="{H:.0f}" '
           f'viewBox="0 0 {W:.0f} {H:.0f}" font-family="Microsoft YaHei, Segoe UI, sans-serif">')
out.append('<defs>'
           '<marker id="a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" '
           'markerHeight="6.5" orient="auto-start-reverse">'
           '<path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8"/></marker>'
           '<marker id="a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7.5" '
           'markerHeight="7.5" orient="auto-start-reverse">'
           '<path d="M 0 0 L 10 5 L 0 10 z" fill="#1d4ed8"/></marker>'
           '</defs>')
out.append(f'<rect width="{W:.0f}" height="{H:.0f}" fill="#f8fafc"/>')

out.append(f'<text x="{W/2:.0f}" y="46" text-anchor="middle" font-size="26" font-weight="700" '
           f'fill="#0f172a">{len(SYSTEMS)} 条推演链 · '
           f'{sum(len(s["steps"]) for s in SYSTEMS)} 步 · {len(edges)} 个跨链接点</text>')
out.append(f'<text x="{W/2:.0f}" y="72" text-anchor="middle" font-size="13" fill="#64748b">'
           f'箭头＝「上一步的输出喂进下一步的输入」　曲线上标的是被共用的公式　'
           f'★ 越大＝接入链越多　深蓝实线＝枢纽链（≥5 个接点）</text>')

# 组标题
for gname, y0 in group_band.items():
    out.append(f'<text x="{PAD_X}" y="{y0+20}" font-size="14" font-weight="700" '
               f'fill="#334155">{gname}</text>')

# 边（画在卡片之下）
for a, b, formula, note in edges:
    hi = deg[a] >= 5 or deg[b] >= 5
    color = "#1d4ed8" if hi else "#94a3b8"
    wd = 1.9 if hi else 1.1
    mk = "a2" if hi else "a1"
    dash = "" if hi else ' stroke-dasharray="4.5 4"'
    out.append(f'<path d="{edge_path(a,b,formula)}" fill="none" stroke="{color}" '
               f'stroke-width="{wd}"{dash} marker-end="url(#{mk})" opacity="0.8"/>')

# 线上公式名（后画，压住线）
for a, b, formula, note in edges:
    mx, my = label_pos[(a, b, formula)]
    wpx = len(formula) * 5.4 + 7
    out.append(f'<rect x="{mx-wpx/2:.1f}" y="{my-7.5:.1f}" width="{wpx:.1f}" height="13.5" '
               f'rx="3" fill="#f8fafc" opacity="0.94"/>')
    out.append(f'<text x="{mx:.1f}" y="{my+2.5:.1f}" text-anchor="middle" font-size="9.4" '
               f'fill="#475569">{formula}</text>')

# 卡片
for s in SYSTEMS:
    n = s["id"]
    x, y = coord[n]
    d = deg[n]
    if d >= 5:
        sc, sw = "#1d4ed8", 3.0
    elif d >= 3:
        sc, sw = "#2563eb", 2.0
    else:
        sc, sw = "#94a3b8", 1.4
    out.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{CARD_W}" height="{CARD_H}" rx="9" '
               f'fill="#ffffff" stroke="{sc}" stroke-width="{sw}"/>')
    full = s["name"]
    main = full.split("（")[0]
    sub = full.split("（")[1].rstrip("）") if "（" in full else ""
    if len(sub) > 24:
        sub = sub[:23] + "…"
    out.append(f'<text x="{x+12:.1f}" y="{y+23:.1f}" font-size="14" font-weight="700" '
               f'fill="#0f172a">{main}</text>')
    out.append(f'<text x="{x+CARD_W-11:.1f}" y="{y+23:.1f}" text-anchor="end" font-size="10" '
               f'fill="#94a3b8">{len(s["steps"])} 步</text>')
    out.append(f'<text x="{x+12:.1f}" y="{y+43:.1f}" font-size="10.2" fill="#64748b">{sub}</text>')
    first = s["steps"][0]["f"]
    last = s["steps"][-1]["f"]
    if len(first) > 20:
        first = first[:19] + "…"
    if len(last) > 20:
        last = last[:19] + "…"
    out.append(f'<text x="{x+12:.1f}" y="{y+62:.1f}" font-size="9.5" fill="#94a3b8">'
               f'{first} → {last}</text>')
    star_color = "#1d4ed8" if d >= 5 else "#94a3b8"
    out.append(f'<text x="{x+CARD_W-11:.1f}" y="{y+62:.1f}" text-anchor="end" font-size="10" '
               f'font-weight="700" fill="{star_color}">★{d}</text>')

out.append(f'<text x="{W/2:.0f}" y="{CONTENT_BOTTOM + 36}" text-anchor="middle" font-size="12.5" fill="#64748b">'
           f'图直径 5 跳（天文 ↔ 增长）· 单一连通分量（没有孤岛链）· '
           f'接点最少的是 finance / astronomy（各 1 个）— 它们是「端点」而非枢纽</text>')
out.append("</svg>")

(ROOT / "体系图.svg").write_text("\n".join(out), encoding="utf-8")
print(f"OK {W:.0f}x{H:.0f} bytes={len(chr(10).join(out))}")
