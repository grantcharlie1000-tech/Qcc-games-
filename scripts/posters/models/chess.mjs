// Chess: a white king and a charcoal knight on a tan board set in a walnut tray, with a pawn of each colour in front.
export default function build(s, {C, hash, shift, mix}) {
  const LIGHT = shift('#eedcc0', -7), DARK = shift('#b89b7c', -7);
  const WHITE = '#e2dccf', W_RING = '#b9b1a1', COAL = '#444750', C_RING = '#8b909c', INK = '#f2f4f8';
  const WAL = '#96643a', WAL_D = '#774b2c', WAL_L = '#b07a48';
  const N = 6, S = 9, R = 3, W = N * S + R * 2;

  // Tray: a walnut block with long grain streaks, a proud rim with a brass inlay, and a dark base moulding.
  const grain = (x, y, z) => (hash((x + y) >> 3, z, 0, 3) < .3 ? WAL_D : hash((x + y) >> 2, z, 1, 4) < .18 ? WAL_L : WAL);
  s.box(0, 0, -8, W, W, 9, grain);
  s.box(-1, -1, -11, W + 2, W + 2, 3, (x, y, z) => (z === -9 ? WAL_D : '#553220'));
  for (let x = 0; x < W; x++) for (let y = 0; y < W; y++) {
    const e = Math.min(x, y, W - 1 - x, W - 1 - y);
    if (e < R - 1) s.set(x, y, 1, hash((x + y) >> 3, x - y, 0, 5) < .25 ? WAL : WAL_L);
    else if (e === R - 1) s.set(x, y, 0, C.gold);
  }
  for (const [x, y] of [[-1, -1], [W - 2, -1], [-1, W - 2], [W - 2, W - 2]]) s.box(x, y, -1, 3, 3, 3, C.gold);
  // The squares, in the game's own tan and cream.
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const c = (i + j) % 2 ? LIGHT : DARK;
    s.box(R + i * S, R + j * S, 0, S, S, 1, (x, y) => (hash(x, y, 0, 7) < .05 ? shift(c, -2) : c));
  }
  const at = (i, j) => [R + i * S + 4, R + j * S + 4];

  // The pieces are unlit voxels with hand-banded shading from their own surface normals, so they read as
  // smooth turned shapes; each paints its own soft shadow on the board.
  const L = [-.5, .31, .81], G = {glow: true};
  const band = (c, n) => { const l = (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / (Math.hypot(...n) || 1); return shift(c, l > .8 ? 10 : l > .35 ? 5 : l > -.15 ? -4 : -15); };
  const dark = new Set();
  const shadow = (cx, cy, r, len) => {
    for (let x = R; x < W - R; x++) for (let y = R; y < W - R; y++) {
      const px = x + .5 - cx, py = y + .5 - cy, t = Math.max(0, Math.min(len, px * .85 - py * .52));
      if (Math.hypot(px - t * .85, py + t * .52) > r || dark.has(x * 999 + y)) continue;
      dark.add(x * 999 + y);
      const v = s.get(x, y, 0); v.c = mix(shift(v.c, -7), '#1b1440', .08);
    }
  };
  // Turned shapes: a stack of discs, one radius per layer.
  const lathe = (cx, cy, z0, radii, col) => radii.forEach((r, k) => {
    const slope = ((radii[k - 1] ?? r) - (radii[k + 1] ?? 0)) / 2;
    for (let a = -8; a < 8; a++) for (let b = -8; b < 8; b++) {
      const m = Math.hypot(a + .5, b + .5); if (m > r) continue;
      const edge = m > r - 1.2 ? 1 : .15, na = (a + .5) / m * edge, nb = (b + .5) / m * edge, nk = edge === 1 ? slope : 1;
      s.set(cx + a, cy + b, z0 + k, band(col(k), [na, nb, nk]), G);
    }
  });
  const ball = (cx, cy, cz, r, c) => s.ellipsoid(cx, cy, cz, r, r, r, (x, y, z) => band(c, [x + .5 - cx, y + .5 - cy, z + .5 - cz]), G);
  const mat = (base, ring, rings) => k => (rings.includes(k) ? ring : base);

  // King: broad foot, short stem, collar, a wide crown bowl with a gold band and a cross.
  const king = (i, j, base, ring) => {
    const [cx, cy] = at(i, j);
    const body = [5.9, 5.9, 5.9, 5.3, 4.5, 3.9, 3.5, 3.3, 3.3, 3.3, 3.5, 3.9, 5.3, 5.3, 4, 4.2, 4.6, 5, 5.3, 5.6, 5.8, 5.9, 5.9, 5.9, 5.6, 5, 4.2, 3];
    shadow(cx, cy, 6.5, 8);
    lathe(cx, cy, 1, body, k => (k === 21 || k === 22 ? C.gold : mat(base, ring, [2, 12])(k)));
    const z = 1 + body.length;
    s.box(cx - 1, cy - 1, z, 2, 2, 11, shift(base, 4), G).box(cx - 4, cy - 1, z + 5, 8, 2, 2, shift(base, 4), G);
  };
  // Pawn: flared foot, collar and a round head.
  const PAWN = [5, 5, 5, 4.3, 3.6, 3.1, 2.8, 2.7, 2.7, 2.9, 4.4, 4.4, 3];
  const pawn = (i, j, base, ring) => {
    const [cx, cy] = at(i, j);
    shadow(cx, cy, 5.5, 5);
    lathe(cx, cy, 1, PAWN, mat(base, ring, [2, 10]));
    ball(cx, cy, 18, 5, base);
    if (base === COAL) s.box(cx - 2, cy + 2, 21, 1, 1, 1, INK, G).box(cx - 3, cy + 2, 20, 1, 1, 1, INK, G);
  };
  // Knight: a horse head cut from a side profile, snout towards +x, rounded off on both flanks. The profile
  // is drawn level and then tilted up towards the snout so it reads level in the isometric view.
  const HEAD = [
    '.......#..............',
    '......###.............',
    '......####............',
    '.....#######..........',
    '....##########........',
    '...#############......',
    '...###############....',
    '..##################..',
    '..###################.',
    '.#####################',
    '.#####################',
    '######################',
    '###########..#########',
    '##########....#######.',
    '##########......####..',
    '##########............',
    '###########...........',
    '############..........',
    '#############.........',
    '.#############........',
    '.#############........',
    '..############........',
    '..############........',
    '...###########........',
  ];
  const knight = (i, j, base, ring, ink) => {
    const [cx, cy] = at(i, j), w = HEAD[0].length, ox = cx - 8, z0 = 7, lift = c => Math.round((c - 8) * .3);
    shadow(cx, cy, 6.5, 8);
    lathe(cx, cy, 1, [5.9, 5.9, 5.9, 5.3, 5.6, 5.6], mat(base, ring, [2, 5]));
    // cells: profile pixels as "c,z" (z up from the base), with the neck filled down to the base.
    const cells = new Set();
    HEAD.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') cells.add(c + ',' + (HEAD.length - 1 - r + lift(c) + 3)); }));
    for (let c = 3; c < 14; c++) for (let z = 0; z < 6; z++) cells.add(c + ',' + z);
    const inside = (c, z) => z < 0 || cells.has(c + ',' + z);
    const depth = (c, z) => { let d = 0; while (d < 3 && [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([a, b]) => inside(c + a * (d + 1), z + b * (d + 1)))) d++; return d; };
    for (const key of cells) {
      const [c, z] = key.split(',').map(Number), d = depth(c, z);
      // outward direction in the profile plane, from the empty cells nearby
      let ex = 0, ez = 0;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (!inside(c + a, z + b)) { ex += a; ez += b; }
      for (let t = 0; t < 8; t++) {
        // two ears: the tip rows skip the middle layers
        if (z - lift(c) - 3 > HEAD.length - 4 ? ![1, 2, 5, 6].includes(t) : d < [3, 2, 1, 0, 0, 1, 2, 3][t]) continue;
        const ny = [-1, -.8, -.4, 0, 0, .4, .8, 1][t] * 6;
        s.set(ox + c, cy - 4 + t, z0 + z, band(shift(base, 3), [ex, ny + (d > 1 ? 4 : 0), ez]), G);
      }
    }
    // Paint onto the lit flank: (c, r) in the level drawing above.
    const face = (r, c, col) => { for (let y = cy + 4; y > cy - 5; y--) { const v = s.get(ox + c, y, z0 + HEAD.length - 1 - r + lift(c) + 3); if (v) { v.c = col; return; } } };
    for (const [r, c] of [[7, 12], [7, 13], [8, 12], [8, 13], [10, 20]]) face(r, c, ink);
    for (const r of [11, 15, 19]) for (let k = 0; k < 3; k++) face(r, 3 + k, ink);
  };

  king(3, 1, WHITE, W_RING);
  knight(1, 3, COAL, C_RING, INK);
  pawn(4, 4, COAL, C_RING);
  pawn(1, 5, WHITE, W_RING);
}
