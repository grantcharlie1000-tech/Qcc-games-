"""Generates public/game-art/blockcraft/cover.svg: an original isometric block island.

viewBox 0 0 320 410, no text; y 0-95 stays open sky for the library card title.
Run: python3 scripts/generate-blockcraft-cover.py
"""
import random

S = 26                       # cube edge in px
CX, CY = 160, 258            # screen position of grid origin (top corner of cell 0,0 at y=0)
COS, SIN = 0.866 * S, 0.5 * S
rng = random.Random(7)

def shade(hex_colour, k):
    r, g, b = (int(hex_colour[i:i + 2], 16) for i in (1, 3, 5))
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(c * k))) for c in (r, g, b))

def project(x, y, z):
    return CX + (x - z) * COS, CY + (x + z) * SIN - y * S

def poly(points, fill, extra=''):
    return '<path d="M%s Z" fill="%s"%s/>' % (' L'.join('%.1f %.1f' % p for p in points), fill, extra)

# name: (top, side, side-top band)
BLOCKS = {
    'grass': ('#6fbf45', '#8b5e3c', '#5ea83a'),
    'dirt': ('#8b5e3c', '#8b5e3c', None),
    'stone': ('#8d8f93', '#7d7f84', None),
    'sand': ('#e3d394', '#d8c886', None),
    'log': ('#c49a5c', '#6e5230', None),
    'leaves': ('#3f8f2c', '#357a25', None),
    'planks': ('#c08d55', '#b07f4a', None),
    'brick': ('#a8483a', '#9a3f33', None),
    'water': ('#4a86e8', '#3c74d6', None),
}

def cube(x, y, z, kind, h=1.0):
    top, side, band = BLOCKS[kind]
    p = lambda dx, dy, dz: project(x + dx, y + dy * h, z + dz)
    out = []
    left = [p(0, 1, 1), p(1, 1, 1), p(1, 0, 1), p(0, 0, 1)]       # +z face (lower left on screen)
    right = [p(1, 1, 1), p(1, 1, 0), p(1, 0, 0), p(1, 0, 1)]      # +x face (lower right)
    upper = [p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1)]
    opacity = ' fill-opacity=".82"' if kind == 'water' else ''
    out.append(poly(left, shade(side, .82), opacity))
    out.append(poly(right, shade(side, .64), opacity))
    out.append(poly(upper, top, opacity))
    if band:   # the grass overhang on both visible sides
        b = .28
        out.append(poly([p(0, 1, 1), p(1, 1, 1), p(1, 1 - b, 1), p(0, 1 - b, 1)], shade(band, .86)))
        out.append(poly([p(1, 1, 1), p(1, 1, 0), p(1, 1 - b, 0), p(1, 1 - b, 1)], shade(band, .7)))
    # Pixel speckles on the top face give the blocks their texture.
    if kind in ('grass', 'leaves', 'stone', 'sand', 'dirt'):
        for _ in range(5):
            u, v = rng.uniform(.15, .75), rng.uniform(.15, .75)
            q = [p(u, 1, v), p(u + .14, 1, v), p(u + .14, 1, v + .14), p(u, 1, v + .14)]
            out.append(poly(q, shade(top, rng.choice((.82, 1.14)))))
    if kind == 'planks':
        for t in (.33, .66):
            out.append('<path d="M%.1f %.1f L%.1f %.1f" stroke="%s" stroke-width="1.6"/>' % (*p(0, t, 1), *p(1, t, 1), shade(side, .6)))
            out.append('<path d="M%.1f %.1f L%.1f %.1f" stroke="%s" stroke-width="1.6"/>' % (*p(1, t, 1), *p(1, t, 0), shade(side, .5)))
    if kind == 'brick':
        for t in (.5,):
            out.append('<path d="M%.1f %.1f L%.1f %.1f M%.1f %.1f L%.1f %.1f" stroke="#e2d6c8" stroke-width="1.6"/>' % (*p(0, t, 1), *p(1, t, 1), *p(1, t, 1), *p(1, t, 0)))
    if kind == 'log':
        out.append(poly(left, shade(side, .82)))
        for t in (.3, .7):
            out.append('<path d="M%.1f %.1f L%.1f %.1f" stroke="%s" stroke-width="2"/>' % (*p(t, 0, 1), *p(t, 1, 1), shade(side, .6)))
    return out

world = {}
def put(x, y, z, kind):
    world[(x, y, z)] = kind

# Island terrain: a 6×6 patch with a hill at the back, beach and water at the front.
heights = [
    [3, 3, 2, 2, 1, 1],
    [3, 2, 2, 1, 1, 1],
    [2, 2, 1, 1, 1, 0],
    [2, 1, 1, 1, 0, 0],
    [1, 1, 1, 0, 0, 0],
    [1, 1, 0, 0, 0, 0],
]
for z in range(6):
    for x in range(6):
        h = heights[z][x]
        for y in range(h):
            put(x, y, z, 'stone' if y < h - 2 else 'dirt')
        if h == 0:
            put(x, 0, z, 'water')
        elif h == 1 and x + z >= 6:
            put(x, 0, z, 'sand')
        else:
            put(x, h - 1, z, 'grass')
# A tree on the hill.
for y in range(3, 6):
    put(1, y, 1, 'log')
for dx in (-1, 0, 1):
    for dz in (-1, 0, 1):
        for y in (5, 6):
            if (dx, dz) != (0, 0) or y == 6:
                if not (abs(dx) == 1 and abs(dz) == 1 and y == 6):
                    put(1 + dx, y, 1 + dz, 'leaves')
# A little build: planks and brick.
put(3, 1, 1, 'planks'); put(3, 2, 1, 'planks'); put(4, 1, 1, 'brick'); put(3, 1, 2, 'brick')
put(2, 2, 3, 'stone')

parts = []
for (x, y, z) in sorted(world, key=lambda c: (c[0] + c[2], c[1], c[0])):
    kind = world[(x, y, z)]
    # Hidden cubes are skipped (all three visible faces covered).
    if (x + 1, y, z) in world and (x, y, z + 1) in world and (x, y + 1, z) in world and kind != 'water':
        continue
    parts += cube(x, y, z, kind, .86 if kind == 'water' else 1)

clouds = ''.join('<rect x="%d" y="%d" width="%d" height="%d" fill="#fff" fill-opacity=".9"/>' % r for r in [
    (18, 128, 54, 14), (30, 118, 30, 10), (232, 146, 64, 14), (246, 136, 26, 10), (268, 138, 16, 8)])
sea = '<path d="M0 322 L320 322 L320 410 L0 410 Z" fill="url(#sea)"/>'
svg = ('<?xml version="1.0" encoding="UTF-8"?>\n'
       '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 410" role="img" aria-labelledby="title desc">'
       '<title id="title">A blocky island with a tree, a small brick and plank build and the sea</title>'
       '<desc id="desc">Original illustrated game cover for Pocket Arcade.</desc>'
       '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#8fd0f7"/><stop offset="1" stop-color="#cdeeff"/></linearGradient>'
       '<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#5b97ec"/><stop offset="1" stop-color="#2f62c4"/></linearGradient></defs>'
       '<rect width="320" height="410" fill="url(#sky)"/>' + clouds + sea +
       '<g stroke="#00000022" stroke-width=".6" stroke-linejoin="round">' + ''.join(parts) + '</g></svg>\n')
open('public/game-art/blockcraft/cover.svg', 'w').write(svg)
print('wrote public/game-art/blockcraft/cover.svg', len(svg), 'bytes')
