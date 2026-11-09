#!/bin/bash
# 把 SVG 渲染成 PNG。
#
# 两个踩过的坑，都写成机制而不是注释：
#
# ① 直接用 file:// 打开 .svg，浏览器有默认 body margin:8px，整页比 SVG 高 16px，
#    截图永远裁掉底部（实测第三组卡片被切）。→ 包一层 margin:0 的 HTML。
#
# ② --window-size 设的窗口高度 ≠ 视口高度，headless 下实测视口只有窗口的约 93%，
#    所以「按 SVG 高度设窗口」仍然会切。→ 窗口开得比需要的大，截完再按内容裁。
set -e
cd "$(dirname "$0")"

SVG="体系图.svg"
PY="C:\\Users\\曹某\\.dsh\\dsh-runtimes\\dsh-next-primary-runtime\\dependencies\\python\\python.exe"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"

W=$("$PY" -c "import re,io;s=io.open('$SVG',encoding='utf-8').read();print(re.search(r'width=\"(\d+)\"',s).group(1))")
H=$("$PY" -c "import re,io;s=io.open('$SVG',encoding='utf-8').read();print(re.search(r'height=\"(\d+)\"',s).group(1))")

cat > .tmp-svg-wrap.html <<HTML
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#f8fafc;overflow:hidden}img{display:block}</style>
<img src="$SVG" width="$W" height="$H">
HTML

PWDW=$(pwd -W 2>/dev/null || pwd)
BIG=$((H + 320))
"$EDGE" --headless --disable-gpu --hide-scrollbars \
  --window-size="$W,$BIG" \
  --screenshot="$PWDW/.tmp-shot.png" \
  "file:///$PWDW/.tmp-svg-wrap.html" 2>&1 | grep -i written || true

"$PY" - "$W" "$H" <<'PYEOF'
import sys
from PIL import Image
W, H = int(sys.argv[1]), int(sys.argv[2])
im = Image.open('.tmp-shot.png').convert('RGB')
w, h = im.size
# 找出真正的背景色（左上角）
bg = im.getpixel((2, h - 2))
# 从底部往上找第一行有内容的
bottom = h
for y in range(h - 1, -1, -1):
    row = [im.getpixel((x, y)) for x in range(0, w, 3)]
    if any(abs(p[0] - bg[0]) > 6 or abs(p[1] - bg[1]) > 6 or abs(p[2] - bg[2]) > 6 for p in row):
        bottom = min(y + 1, h)
        break
# 再裁到 SVG 的原始比例：内容区应占 W x H（devicePixelRatio 可能不是 1）
scale = w / W
crop_h = min(int(round(H * scale)), h)
out = im.crop((0, 0, w, max(crop_h, bottom + 2)))
out.save('体系图.png')
print(f"截图 {w}x{h} → 裁剪 {out.size[0]}x{out.size[1]}（内容底部 {bottom}，期望 {int(round(H*scale))}）")
PYEOF

rm -f .tmp-svg-wrap.html .tmp-shot.png
