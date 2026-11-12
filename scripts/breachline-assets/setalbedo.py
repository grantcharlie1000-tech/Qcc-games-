#!/usr/bin/env python3
"""Average linear albedo of each room-surface texture set, from its shipped 512 px JPEG: the table SET_ALBEDO in
src/games/breachline/render/surfaces.ts (the far rooms' merged meshes use it). Run after changing a set:
  python3 scripts/breachline-assets/setalbedo.py"""
import re, sys
from PIL import Image
src = open('src/games/breachline/render/surfaces.ts').read()
sets = sorted(set(re.findall(r"set: '([a-zA-Z0-9_]+)'", src)))
lin = lambda c: (c / 255) / 12.92 if c / 255 <= 0.04045 else ((c / 255 + 0.055) / 1.055) ** 2.4
rows = []
for s in sets:
    try: im = Image.open(f'public/game-art/breachline/tex/{s}/diff-512.jpg').convert('RGB').resize((64, 64), Image.BOX)
    except FileNotFoundError: continue
    px = list(im.get_flattened_data()) if hasattr(im, 'get_flattened_data') else list(im.getdata()); n = len(px)
    rows.append(f"  {s}: [{', '.join(f'{sum(lin(p[k]) for p in px) / n:.3f}' for k in range(3))}],")
print('\n'.join(rows))
