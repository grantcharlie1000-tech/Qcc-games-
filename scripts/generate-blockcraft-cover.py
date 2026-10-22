"""Generates public/game-art/blockcraft/cover.svg: an original isometric block island.

A snowy taiga corner (snow-covered grass, a spruce, a frozen pond) and a desert edge (sand over sandstone, a
cactus, a dead bush) meet the plains in the middle (an oak, flowers, a crafting table), where a cow, a sheep and a
creeper stand. The sea surrounds the island.

viewBox 0 0 320 410, no text; y 0-95 stays open sky for the library card title (checked below).
Run: python3 scripts/generate-blockcraft-cover.py
"""
import heapq
import random
import re
from xml.etree import ElementTree

W, H, CLEAR_TOP = 320, 410, 95
S = 21                       # cube edge in px
CX, CY = 160, 214            # screen position of the grid origin (top corner of cell 0,0 at y=0)
COS, SIN = 0.866 * S, 0.5 * S
EPS = 1e-6
rng = random.Random(7)
OUTPUT = 'public/game-art/blockcraft/cover.svg'


def shade(hex_colour, k):
    r, g, b = (int(hex_colour[i:i + 2], 16) for i in (1, 3, 5))
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(c * k))) for c in (r, g, b))


def project(x, y, z):
    return CX + (x - z) * COS, CY + (x + z) * SIN - y * S


def poly(points, fill, extra=''):
    return '<path d="M%s Z" fill="%s"%s/>' % (' L'.join('%.1f %.1f' % p for p in points), fill, extra)


# ---- Boxes ------------------------------------------------------------------------------------------
# Every solid thing is an axis-aligned box drawn with its three visible faces: 'top' (+y), 'left' (+z, lower left on
# screen) and 'right' (+x, lower right). Face-local coordinates u, v run 0..1: on side faces u goes left to right as
# seen and v from the top edge down; on the top face u follows +x and v follows +z.
LEFT_SHADE, RIGHT_SHADE = .82, .64


class Box:
    def __init__(self, x0, y0, z0, x1, y1, z1, top, left, right, faces=('top', 'left', 'right'), opacity=None, cls=None):
        self.x0, self.y0, self.z0, self.x1, self.y1, self.z1 = x0, y0, z0, x1, y1, z1
        self.fills = {'top': top, 'left': left, 'right': right}
        self.faces = set(faces)
        self.details = []
        self.opacity = opacity
        self.cls = cls

    def point(self, face, u, v):
        if face == 'top':
            return project(self.x0 + u * (self.x1 - self.x0), self.y1, self.z0 + v * (self.z1 - self.z0))
        if face == 'left':
            return project(self.x0 + u * (self.x1 - self.x0), self.y1 - v * (self.y1 - self.y0), self.z1)
        return project(self.x1, self.y1 - v * (self.y1 - self.y0), self.z1 - u * (self.z1 - self.z0))

    def quad(self, face, u0, v0, u1, v1):
        return [self.point(face, u0, v0), self.point(face, u1, v0), self.point(face, u1, v1), self.point(face, u0, v1)]

    def detail(self, face, u0, v0, u1, v1, colour):
        self.details.append((face, u0, v0, u1, v1, colour))
        return self

    def corners(self):
        return [project(x, y, z) for x in (self.x0, self.x1) for y in (self.y0, self.y1) for z in (self.z0, self.z1)]

    def render(self):
        opacity = ' fill-opacity="%.2f"' % self.opacity if self.opacity is not None else ''
        out = [poly(self.quad(face, 0, 0, 1, 1), self.fills[face], opacity) for face in ('left', 'right', 'top') if face in self.faces]
        out += [poly(self.quad(face, u0, v0, u1, v1), colour, ' stroke="none"')
                for face, u0, v0, u1, v1, colour in self.details if face in self.faces]
        body = ''.join(out)
        return '<g class="%s">%s</g>' % (self.cls, body) if self.cls and body else body


def draw_order(boxes):
    """Painter's order for non-intersecting boxes: a box is drawn before every box that can cover it on screen."""
    rects = []
    for b in boxes:
        xs, ys = zip(*b.corners())
        rects.append((min(xs), min(ys), max(xs), max(ys)))
    after = [[] for _ in boxes]
    blockers = [0] * len(boxes)
    for i, a in enumerate(boxes):
        for j in range(i + 1, len(boxes)):
            ra, rb = rects[i], rects[j]
            if ra[2] <= rb[0] + .3 or rb[2] <= ra[0] + .3 or ra[3] <= rb[1] + .3 or rb[3] <= ra[1] + .3:
                continue
            b = boxes[j]
            votes = set()
            for lo_a, hi_a, lo_b, hi_b in ((a.x0, a.x1, b.x0, b.x1), (a.y0, a.y1, b.y0, b.y1), (a.z0, a.z1, b.z0, b.z1)):
                if hi_a <= lo_b + EPS:
                    votes.add(-1)
                elif hi_b <= lo_a + EPS:
                    votes.add(1)
            if not votes:
                raise ValueError('boxes %d and %d intersect' % (i, j))
            if len(votes) == 1:
                first, second = (i, j) if votes.pop() < 0 else (j, i)
                after[first].append(second)
                blockers[second] += 1
    key = lambda k: (boxes[k].x0 + boxes[k].z0 + boxes[k].y0, k)
    ready = [key(k) for k in range(len(boxes)) if not blockers[k]]
    heapq.heapify(ready)
    order = []
    while ready:
        _, k = heapq.heappop(ready)
        order.append(boxes[k])
        for n in after[k]:
            blockers[n] -= 1
            if not blockers[n]:
                heapq.heappush(ready, key(n))
    if len(order) != len(boxes):
        raise ValueError('cyclic overlap between boxes')
    return order


# ---- Terrain ------------------------------------------------------------------------------------------
# name: (top, side, side band colour or None)
BLOCKS = {
    'grass': ('#6fbf45', '#8b5e3c', '#5ea83a'),
    'snowy_grass': ('#f2f7fa', '#8b5e3c', '#e6eef3'),
    'dirt': ('#8b5e3c', '#8b5e3c', None),
    'stone': ('#8d8f93', '#7d7f84', None),
    'sand': ('#e3d394', '#d8c886', None),
    'sandstone': ('#dccb8c', '#d2bf7f', None),
    'log': ('#c49a5c', '#6e5230', None),
    'spruce_log': ('#8a6a40', '#4e3519', None),
    'leaves': ('#3f8f2c', '#357a25', None),
    'spruce_leaves': ('#eef4f8', '#2e5a33', None),
    'crafting_table': ('#b8854c', '#a3713d', None),
    'water': ('#4a86e8', '#3c74d6', None),
    'ice': ('#a6caf4', '#8fb7ec', None),
}
SPECKLED = {'grass': (.82, 1.14), 'leaves': (.82, 1.14), 'stone': (.82, 1.14), 'sand': (.9, 1.08), 'dirt': (.82, 1.14),
            'snowy_grass': (.93, .97), 'sandstone': (.92, 1.06)}
TRANSPARENT = {'water'}

HEIGHTS = [            # ground height per cell, rows z = 0..7 (back right to front left), columns x = 0..7
    [4, 4, 3, 3, 3, 2, 2, 2],
    [4, 3, 3, 3, 2, 2, 2, 2],
    [3, 3, 3, 2, 2, 2, 2, 2],
    [3, 3, 2, 2, 2, 2, 2, 1],
    [3, 2, 2, 2, 2, 2, 1, 1],
    [2, 2, 2, 2, 2, 1, 1, 0],
    [2, 2, 2, 1, 1, 1, 0, 0],
    [2, 2, 1, 1, 1, 0, 0, 0],
]
N = len(HEIGHTS)
POND = {(3, 7), (4, 7)}          # frozen water in the taiga


def biome(x, z):
    d = x - z
    return 'snowy' if d <= -3 else 'desert' if d >= 3 else 'plains'


world = {}


def put(x, y, z, kind):
    world[(x, y, z)] = kind


def is_water(x, z):
    return 0 <= x < N and 0 <= z < N and HEIGHTS[z][x] == 0


for z in range(N):
    for x in range(N):
        h, b = HEIGHTS[z][x], biome(x, z)
        if h == 0:
            put(x, 0, z, 'water')
            continue
        for y in range(h - 1):
            put(x, y, z, 'stone' if y < h - 3 else 'sandstone' if b == 'desert' else 'dirt')
        near_water = any(is_water(x + dx, z + dz) for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        if (x, z) in POND:
            top = 'ice'
        elif b == 'snowy':
            top = 'snowy_grass'
        elif b == 'desert' or near_water:
            top = 'sand'
        else:
            top = 'grass'
        put(x, h - 1, z, top)
        if b == 'desert' and h >= 2:
            put(x, h - 2, z, 'sand')

# An oak in the plains.
OAK = (3, 2)
oak_ground = HEIGHTS[OAK[1]][OAK[0]]
for y in range(oak_ground, oak_ground + 3):
    put(OAK[0], y, OAK[1], 'log')
for dx in (-1, 0, 1):
    for dz in (-1, 0, 1):
        if (dx, dz) != (0, 0):
            put(OAK[0] + dx, oak_ground + 2, OAK[1] + dz, 'leaves')
        put(OAK[0] + dx, oak_ground + 3, OAK[1] + dz, 'leaves')
        if abs(dx) + abs(dz) <= 1:
            put(OAK[0] + dx, oak_ground + 4, OAK[1] + dz, 'leaves')
# A snowy spruce in the taiga: rings of needles narrowing to a tip.
SPRUCE = (1, 6)
spruce_ground = HEIGHTS[SPRUCE[1]][SPRUCE[0]]
for y in range(spruce_ground, spruce_ground + 4):
    put(SPRUCE[0], y, SPRUCE[1], 'spruce_log')
for layer, plus_only in ((1, False), (2, True), (3, False), (4, True), (5, None)):
    for dx in (-1, 0, 1):
        for dz in (-1, 0, 1):
            if plus_only is None and (dx, dz) != (0, 0):
                continue
            if plus_only and abs(dx) + abs(dz) > 1:
                continue
            cell = (SPRUCE[0] + dx, spruce_ground + layer, SPRUCE[1] + dz)
            if cell not in world:
                put(*cell, 'spruce_leaves')
# A crafting table beside the oak.
TABLE = (4, 2)
put(TABLE[0], HEIGHTS[TABLE[1]][TABLE[0]], TABLE[1], 'crafting_table')

FULL = {k for k in BLOCKS if k not in TRANSPARENT}


def terrain_box(x, y, z, kind):
    top, side, band = BLOCKS[kind]
    full = lambda c: world.get(c) in FULL
    faces = []
    if kind == 'water':
        if (x, y + 1, z) not in world:
            faces.append('top')
        if (x, y, z + 1) not in world:
            faces.append('left')
        if (x + 1, y, z) not in world:
            faces.append('right')
    else:
        if not full((x, y + 1, z)):
            faces.append('top')
        if not full((x, y, z + 1)):
            faces.append('left')
        if not full((x + 1, y, z)):
            faces.append('right')
    if not faces:
        return None
    h = .86 if kind == 'water' else 1
    b = Box(x, y, z, x + 1, y + h, z + 1, top, shade(side, LEFT_SHADE), shade(side, RIGHT_SHADE), faces,
            opacity=.82 if kind == 'water' else .94 if kind == 'ice' else None)
    if band:
        for face, k in (('left', .86), ('right', .7)):
            b.detail(face, 0, 0, 1, .28, shade(band, k))
            for u in (.12, .45, .78):     # drips of the band down the side
                b.detail(face, u, .28, u + .12, .4, shade(band, k * .96))
    if kind in SPECKLED:
        lo, hi = SPECKLED[kind]
        for _ in range(5):
            u, v = rng.uniform(.1, .76), rng.uniform(.1, .76)
            b.detail('top', u, v, u + .14, v + .14, shade(top, rng.choice((lo, hi))))
    if kind in ('log', 'spruce_log'):
        for face, k in (('left', LEFT_SHADE), ('right', RIGHT_SHADE)):
            for u in (.25, .62):
                b.detail(face, u, 0, u + .08, 1, shade(side, k * .72))
        b.detail('top', .25, .25, .75, .75, shade(top, .85)).detail('top', .4, .4, .6, .6, shade(top, 1.08))
    if kind == 'sandstone':
        for face, k in (('left', LEFT_SHADE), ('right', RIGHT_SHADE)):
            b.detail(face, 0, .3, 1, .36, shade(side, k * .86)).detail(face, 0, .72, 1, .78, shade(side, k * .86))
    if kind == 'ice':
        b.detail('top', .15, .2, .55, .28, '#e4f1ff').detail('top', .45, .6, .85, .68, '#d2e6fd')
    if kind == 'water':
        b.detail('top', .2, .3, .5, .36, '#7fb0f2').detail('top', .5, .65, .8, .71, '#78a8ee')
    if kind == 'spruce_leaves':
        for face, k in (('left', LEFT_SHADE), ('right', RIGHT_SHADE)):
            b.detail(face, 0, 0, 1, .16, shade('#eef4f8', k + .1))
            b.detail(face, .2, .45, .34, .59, shade(side, k * .78)).detail(face, .62, .7, .76, .84, shade(side, k * 1.2))
    if kind == 'leaves':
        for face, k in (('left', LEFT_SHADE), ('right', RIGHT_SHADE)):
            b.detail(face, .18, .22, .32, .36, shade(side, k * .78)).detail(face, .6, .55, .74, .69, shade(side, k * 1.22))
    if kind == 'crafting_table':
        for t in (.33, .66):
            b.detail('top', t - .03, .08, t + .03, .92, shade(top, .72)).detail('top', .08, t - .03, .92, t + .03, shade(top, .72))
        for face, k in (('left', LEFT_SHADE), ('right', RIGHT_SHADE)):
            b.detail(face, 0, .22, 1, .3, shade(side, k * .6))
            b.detail(face, .2, .42, .3, .86, shade('#8a8a90', k + .1)).detail(face, .58, .45, .82, .55, shade('#8a8a90', k + .1))
            b.detail(face, .66, .55, .74, .86, shade('#6a4420', k + .1))
    return b


boxes = []
for (x, y, z), kind in world.items():
    b = terrain_box(x, y, z, kind)
    if b:
        boxes.append(b)

# A cactus (inset 1/16 like the block) and a dead bush on the desert edge.
CACTUS = (6, 1)
cy0 = HEIGHTS[CACTUS[1]][CACTUS[0]]
inset = 1 / 16
cactus = Box(CACTUS[0] + inset, cy0, CACTUS[1] + inset, CACTUS[0] + 1 - inset, cy0 + 2, CACTUS[1] + 1 - inset,
             '#5aa83a', shade('#2f8a2c', LEFT_SHADE), shade('#2f8a2c', RIGHT_SHADE))
for face, k in (('left', LEFT_SHADE), ('right', RIGHT_SHADE)):
    for u in (.2, .5, .8):
        cactus.detail(face, u - .04, 0, u + .04, 1, shade('#1f6b1f', k))
    for u, v in ((.33, .2), (.66, .45), (.33, .7), (.66, .9)):
        cactus.detail(face, u - .03, v - .015, u + .03, v + .015, shade('#e8e2b0', k + .1))
cactus.detail('top', .3, .3, .7, .7, '#7cc456')
boxes.append(cactus)
BUSH = (7, 2)
by0 = HEIGHTS[BUSH[1]][BUSH[0]]
twig = '#8a6234'
for x0, y0, z0, x1, y1, z1 in ((.46, 0, .46, .54, .3, .54), (.3, .22, .46, .46, .28, .54), (.54, .26, .46, .7, .32, .54),
                               (.25, .28, .46, .31, .42, .54), (.69, .32, .46, .75, .46, .54), (.46, .3, .46, .54, .44, .54)):
    boxes.append(Box(BUSH[0] + x0, by0 + y0, BUSH[1] + z0, BUSH[0] + x1, by0 + y1, BUSH[1] + z1,
                     shade(twig, 1.1), shade(twig, LEFT_SHADE), shade(twig, RIGHT_SHADE)))


# Flowers in the plains: a stem and a blossom.
def flower(x, z, colour, centre):
    ground = HEIGHTS[z][x]
    stem = Box(x + .46, ground, z + .46, x + .54, ground + .26, z + .54, '#3b8a24', shade('#3b8a24', LEFT_SHADE), shade('#3b8a24', RIGHT_SHADE))
    bloom = Box(x + .38, ground + .26, z + .38, x + .62, ground + .42, z + .62, colour, shade(colour, LEFT_SHADE), shade(colour, RIGHT_SHADE))
    bloom.detail('top', .35, .35, .65, .65, centre)
    return [stem, bloom]


boxes += flower(2, 4, '#d8281c', '#2a1a10') + flower(6, 4, '#f4cf22', '#f59f12') + flower(4, 5, '#3f66e0', '#1a1a5a')


# ---- Mobs ---------------------------------------------------------------------------------------------------
# Models are in pixels (16 = one block at scale 1) with the head toward +f; `facing` turns +f to world +z or +x.
# Parts list: (s0, s1, y0, y1, f0, f1, colour, details) with details (face, u0, v0, u1, v1, colour) where face is
# 'front', 'side' or 'top' and side u runs from the back (0) to the front (1).
def mob(cls, cell, facing, parts, scale=.85):
    x, z = cell
    cx, cz, ground, k = x + .5, z + .5, HEIGHTS[z][x], scale / 16
    out = []
    for s0, s1, y0, y1, f0, f1, colour, details in parts:
        if facing == 'z':
            b = Box(cx + s0 * k, ground + y0 * k, cz + f0 * k, cx + s1 * k, ground + y1 * k, cz + f1 * k,
                    colour, shade(colour, LEFT_SHADE + .04), shade(colour, RIGHT_SHADE + .04), cls=cls)
            front, side = 'left', 'right'
        else:
            b = Box(cx + f0 * k, ground + y0 * k, cz + s0 * k, cx + f1 * k, ground + y1 * k, cz + s1 * k,
                    colour, shade(colour, LEFT_SHADE + .04), shade(colour, RIGHT_SHADE + .04), cls=cls)
            front, side = 'right', 'left'
        for face, u0, v0, u1, v1, c in details:
            real = {'front': front, 'side': side, 'top': 'top'}[face]
            k_shade = 1 if real == 'top' else (LEFT_SHADE if real == 'left' else RIGHT_SHADE) + .04
            if face == 'side' and real == 'right':     # the right face's u runs front to back
                u0, u1 = 1 - u1, 1 - u0
            b.detail(real, u0, v0, u1, v1, shade(c, k_shade))
        out.append(b)
    return out


def mottled(palette, count, seed):
    r = random.Random(seed)
    spots = []
    for face in ('front', 'side', 'top'):
        for _ in range(count):
            u, v = r.randrange(8) / 8, r.randrange(8) / 8
            spots.append((face, u, v, u + 1 / 8, v + 1 / 8, r.choice(palette)))
    return spots


BROWN, WHITE, PINK, HORN, HOOF, EYE = '#5a3a22', '#e8e3da', '#d9a99a', '#d8d2c4', '#2e2118', '#151515'
hooves = [('front', 0, .82, 1, 1, HOOF), ('side', 0, .82, 1, 1, HOOF)]
COW = [
    *[(s0, s0 + 4, 0, 12, f0, f0 + 4, BROWN, hooves + [('side', 0, .55, 1, .82, WHITE)] if f0 > 0 else hooves)
      for s0 in (-6, 2) for f0 in (-8, 4)],
    (-6, 6, 12, 22, -9, 9, BROWN, [('side', .12, .1, .42, .6, WHITE), ('side', .58, .45, .8, .95, WHITE),
                                   ('top', .2, .25, .55, .6, WHITE), ('front', .25, .5, .75, 1, WHITE)]),
    (-4, 4, 15, 23, 9, 15, BROWN, [('front', .35, 0, .65, .6, WHITE), ('front', .08, .3, .26, .48, EYE),
                                   ('front', .74, .3, .92, .48, EYE), ('side', .5, .3, .75, .48, EYE)]),
    (-3, 3, 15, 18.5, 15, 16, PINK, [('front', .12, .3, .32, .65, '#7a4e44'), ('front', .68, .3, .88, .65, '#7a4e44')]),
    (-5.5, -4, 21, 24, 11, 12.5, HORN, []),
    (4, 5.5, 21, 24, 11, 12.5, HORN, []),
]
WOOL, SKIN = '#ece9e2', '#cdb59c'
SHEEP = [
    *[(s0, s0 + 4, 0, 11, f0, f0 + 4, SKIN, [('front', 0, .8, 1, 1, '#5b4a3c'), ('side', 0, .8, 1, 1, '#5b4a3c')])
      for s0 in (-5, 1) for f0 in (-7, 3)],
    (-6, 6, 11, 21, -9, 9, WOOL, [('side', .15, .2, .3, .35, '#d9d5cc'), ('side', .55, .5, .7, .65, '#d9d5cc'),
                                  ('side', .8, .15, .92, .3, '#f7f5f0'), ('top', .3, .2, .45, .35, '#d9d5cc'),
                                  ('top', .6, .6, .75, .75, '#f7f5f0'), ('front', .2, .3, .4, .5, '#d9d5cc')]),
    (-3, 3, 14, 20, 9, 14, SKIN, [('front', .1, .3, .35, .5, '#f4f1ea'), ('front', .65, .3, .9, .5, '#f4f1ea'),
                                  ('front', .2, .3, .35, .5, EYE), ('front', .65, .3, .8, .5, EYE),
                                  ('front', .35, .7, .65, .85, '#a88e76'), ('side', .55, .3, .8, .5, EYE)]),
    (-3.5, 3.5, 20, 22, 9, 13, WOOL, []),
]
GREEN, FACE = '#5aa83c', '#141414'
SKIN_SPOTS = ('#86cf5c', '#3f8229', '#2f6b1f', '#74bf4c')
CREEPER = [
    *[(s0, s0 + 4, 0, 6, f0, f0 + 4, GREEN, mottled(SKIN_SPOTS, 3, 10 + i) + [('front', 0, .8, 1, 1, '#2f6b1f')])
      for i, (s0, f0) in enumerate((s, f) for s in (-4, 0) for f in (-6, 2))],
    (-4, 4, 6, 18, -2, 2, GREEN, mottled(SKIN_SPOTS, 7, 20)),
    (-4, 4, 18, 26, -4, 4, GREEN, mottled(SKIN_SPOTS, 6, 30) + [
        ('front', 1 / 8, 2 / 8, 3 / 8, 4 / 8, FACE), ('front', 5 / 8, 2 / 8, 7 / 8, 4 / 8, FACE),
        ('front', 3 / 8, 4 / 8, 5 / 8, 6 / 8, FACE), ('front', 2 / 8, 5 / 8, 3 / 8, 7 / 8, FACE),
        ('front', 5 / 8, 5 / 8, 6 / 8, 7 / 8, FACE)]),
]
boxes += mob('mob-cow', (5, 4), 'z', COW)
boxes += mob('mob-sheep', (3, 4), 'x', SHEEP)
boxes += mob('mob-creeper', (4, 6), 'z', CREEPER)

parts = [b.render() for b in draw_order(boxes)]

# ---- Sky, sea and frame -----------------------------------------------------------------------------------
CLOUDS = [(14, 104, 56, 12), (28, 96, 26, 8), (236, 112, 66, 12), (252, 104, 28, 8), (280, 106, 14, 6)]
clouds = ''.join('<rect x="%d" y="%d" width="%d" height="%d" fill="#fff" fill-opacity=".9"/>' % r for r in CLOUDS)
sea = '<path d="M0 282 L320 282 L320 410 L0 410 Z" fill="url(#sea)"/>'
svg = ('<?xml version="1.0" encoding="UTF-8"?>\n'
       '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" role="img" aria-labelledby="title desc">' % (W, H) +
       '<title id="title">A blocky island where a snowy taiga and a desert edge meet the plains, with a cow, '
       'a sheep and a creeper</title>'
       '<desc id="desc">Original illustrated game cover for Pocket Arcade.</desc>'
       '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#8fd0f7"/><stop offset="1" stop-color="#cdeeff"/></linearGradient>'
       '<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#5b97ec"/><stop offset="1" stop-color="#2f62c4"/></linearGradient></defs>'
       '<rect width="%d" height="%d" fill="url(#sky)"/>' % (W, H) + clouds + sea +
       '<g stroke="#00000022" stroke-width=".6" stroke-linejoin="round">' + ''.join(parts) + '</g></svg>\n')

# Checks: well-formed XML, the frame, the clear title area and the three mobs.
root = ElementTree.fromstring(svg.split('\n', 1)[1])
assert root.get('viewBox') == '0 0 %d %d' % (W, H)
for d in re.findall(r' d="([^"]+)"', svg):
    numbers = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', d)]
    for px, py in zip(numbers[::2], numbers[1::2]):
        assert -.05 <= px <= W + .05 and py <= H + .05, (px, py)
        assert py >= CLEAR_TOP or d.startswith('M0 282'), 'drawing inside the clear title area: %s' % d[:40]
assert all(y >= CLEAR_TOP for _, y, _, _ in CLOUDS)
for name in ('mob-cow', 'mob-sheep', 'mob-creeper'):
    assert 'class="%s"' % name in svg, name

with open(OUTPUT, 'w') as out:
    out.write(svg)
print('wrote', OUTPUT, len(svg), 'bytes,', len(parts), 'boxes')
