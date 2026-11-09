# -*- coding: utf-8 -*-
"""检查生成的 SVG 布局：卡片重叠、标签压卡片、边穿过卡片。

不靠眼睛验收 —— 在没有渲染反馈的环境里，「看起来没问题」等于没检查。
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
svg = (ROOT / "体系图.svg").read_text(encoding="utf-8")

# 1. 提取所有卡片矩形（宽 262 高 78 的那些）
cards = []
for m in re.finditer(r'<rect x="([\d.]+)" y="([\d.]+)" width="262" height="78"', svg):
    cards.append((float(m.group(1)), float(m.group(2))))
print(f"卡片数 {len(cards)}")

# 2. 两两重叠检查
overlaps = []
for i in range(len(cards)):
    for j in range(i + 1, len(cards)):
        ax, ay = cards[i]
        bx, by = cards[j]
        if ax < bx + 262 and bx < ax + 262 and ay < by + 78 and by < ay + 78:
            overlaps.append((cards[i], cards[j]))
print(f"卡片重叠 {len(overlaps)} 处", overlaps[:3] if overlaps else "")

# 3. 线上标签是否压在卡片上
labels = []
for m in re.finditer(
    r'<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="13.5" rx="3"', svg
):
    labels.append((float(m.group(1)), float(m.group(2)), float(m.group(3))))
print(f"公式标签 {len(labels)}")


def hit_card(x, y, w, h):
    for cx, cy in cards:
        if x < cx + 262 and cx < x + w and y < cy + 78 and cy < y + h:
            return (cx, cy)
    return None


bad = [(l, hit_card(l[0], l[1], l[2], 13.5)) for l in labels if hit_card(l[0], l[1], l[2], 13.5)]
print(f"标签压卡片 {len(bad)} 处", bad[:3] if bad else "")

# 4. 标签之间互相重叠（会糊成一片）
lab_overlap = 0
for i in range(len(labels)):
    for j in range(i + 1, len(labels)):
        ax, ay, aw = labels[i]
        bx, by, bw = labels[j]
        if ax < bx + bw and bx < ax + aw and abs(ay - by) < 13.5:
            lab_overlap += 1
print(f"标签互相重叠 {lab_overlap} 处")

# 5. 画布边界：有没有东西跑出去
W = float(re.search(r'<svg[^>]*width="(\d+)"', svg).group(1))
H = float(re.search(r'<svg[^>]*height="(\d+)"', svg).group(1))
outside = [c for c in cards if c[0] < 0 or c[1] < 0 or c[0] + 262 > W or c[1] + 78 > H]
print(f"越界卡片 {len(outside)} 处")

# 6. 文本是否含有会破坏 XML 的字符
if "&" in svg.replace("&amp;", "").replace("&lt;", "").replace("&gt;", ""):
    print("⚠ SVG 里有未转义的 &")
else:
    print("XML 转义 OK")

ok = not overlaps and not bad and not outside and lab_overlap == 0
print()
print("布局自检：" + ("通过" if ok else "有问题，需调整"))
sys.exit(0 if ok else 1)
