// Femboy Frosthop: a boy in a pink cat-ear beanie and snowflake jumper mid-hop on a stack of gift boxes in the snow.
export default function build(s, {C, island, speckle, hash, shift}) {
  const PINK = '#f79fc1', PINK_D = '#e87aa6', HAT = '#ee62a0', HAT_D = '#cf4686', HAT_L = '#ffc4dc';
  const SKIN = '#fde0c9', SKIN_D = '#eeb999', HAIR = '#8a5632', HAIR_D = '#6b3f22', INK = '#2a2140';
  const MAROON = '#8f2850', CREAM = '#fbf0d6', WHITE = '#ffffff', SHORTS = '#3a2c44';

  // ---- snowy ground ----
  const snow = speckle([C.snow, C.white, '#d3e0f3'], 1, [5, 3, 1]);
  island(s, 0, 0, 26, 26, snow, speckle(['#9db2e6', '#869cd8', '#b6c6f0'], 2, [4, 2, 2]), 4, 0, 2);
  s.ellipsoid(13, 24, .5, 5, 2, 1.6, C.white).ellipsoid(22, 14, .5, 3, 3, 1.5, C.white).ellipsoid(12, 3, .5, 4, 3, 1.6, C.white);

  // ---- gift boxes ----
  const gift = (x, y, z, w, d, h, body, lid, rib, bow = true) => {
    s.box(x + 1, y + 1, z, w - 2, d - 2, h - 2, body);
    s.box(x, y, z + h - 2, w, d, 2, lid);
    const mx = x + (w >> 1) - 1, my = y + (d >> 1) - 1;
    s.box(mx, y, z, 2, d, h, (px, py, pz) => (pz >= z + h - 2 || py === y + d - 2 || py === y + 1) ? rib : undefined);
    s.box(x, my, z, w, 2, h, (px, py, pz) => (pz >= z + h - 2 || px === x + w - 2 || px === x + 1) ? rib : undefined);
    s.box(mx, y + d - 1, z, 2, 1, h - 2, null).box(x + w - 1, my, z, 1, 2, h - 2, null);
    if (bow) {
      s.box(mx, my, z + h, 2, 2, 1, rib);
      s.box(mx - 3, my, z + h, 3, 2, 2, rib).box(mx + 2, my, z + h, 3, 2, 2, rib).box(mx - 2, my, z + h, 1, 2, 1, shift(rib, -8)).box(mx + 2, my, z + h, 1, 2, 1, shift(rib, -8));
    }
  };
  gift(0, 8, 1, 6, 6, 5, HAT, '#ff9cc6', WHITE);           // lilac step, left
  gift(19, 1, 1, 7, 7, 9, '#7fd6b4', '#b7ecd6', C.red);          // tall mint box, far right
  gift(20, 20, 1, 5, 5, 4, C.red, '#ff7b7f', CREAM, false);             // small red box, near corner
  gift(7, 8, 1, 14, 14, 4, '#7a68e0', '#a898f6', C.yellow, false);        // the hero's box

  // ---- candy cane ----
  const cane = (x, y, z) => (x + y + z) % 3 === 0 ? C.red : WHITE;
  s.box(23, 11, 1, 2, 2, 10, cane).box(20, 11, 11, 5, 2, 2, cane).box(20, 11, 9, 2, 2, 2, cane);

  // ---- little Christmas tree (left corner) ----
  const tx = 4, ty = 21;
  s.box(tx - 1, ty - 1, 1, 2, 2, 3, C.brown);
  for (let t = 0; t < 3; t++) {
    const r = 4 - t, z = 3 + t * 3;
    s.box(tx - r, ty - r, z, r * 2, r * 2, 2, (px, py) => hash(px, py, z) < .25 ? C.leaf : C.dkgreen);
    s.box(tx - r + 1, ty - r + 1, z + 2, r * 2 - 2, r * 2 - 2, 1, C.dkgreen);
    s.box(tx - r, ty - r, z + 1, r * 2, r * 2, 1, (px, py) => (px === tx - r || py === ty - r || px === tx + r - 1 || py === ty + r - 1) && hash(px, py, z + 9) < .65 ? C.white : undefined);
    // baubles on the lit side
    s.set(tx - r + 1 + t, ty + r - 1, z, [C.red, C.yellow, '#6fc8ff', HAT][t], {glow: true});
    s.set(tx + r - 2, ty + r - 1, z, [C.yellow, '#6fc8ff', C.red, C.yellow][t], {glow: true});
  }
  s.box(tx - 1, ty - 1, 12, 2, 2, 1, C.dkgreen);
  s.box(tx - 1, ty - 1, 13, 2, 1, 3, C.yellow, {glow: true}).box(tx - 2, ty - 1, 14, 4, 1, 1, C.yellow, {glow: true});

  // ---- the hero ----
  const cx = 14, zf = 5;
  // Standing leg (viewer right) and hopping leg (viewer left, knee lifted forward).
  const sock = (x, y, z) => z % 2 ? PINK_D : WHITE;
  s.box(cx + 1, 12, zf, 3, 5, 2, WHITE).box(cx + 1, 12, zf, 3, 5, 1, '#ddd6ea').box(cx + 1, 16, zf, 3, 1, 1, HAT);
  s.box(cx + 1, 12, zf + 2, 3, 3, 3, sock);
  s.box(cx - 4, 14, zf + 2, 3, 5, 2, WHITE).box(cx - 4, 14, zf + 2, 3, 5, 1, '#ddd6ea').box(cx - 4, 18, zf + 2, 3, 1, 1, HAT);
  s.box(cx - 4, 14, zf + 4, 3, 3, 2, sock);
  // Shorts.
  s.box(cx - 4, 12, zf + 5, 8, 4, 1, SHORTS).box(cx - 1, 12, zf + 5, 2, 4, 1, null).box(cx - 4, 14, zf + 5, 3, 3, 1, SHORTS);
  // Jumper: one voxel proud of the body all round.
  const jz = zf + 6;
  s.box(cx - 5, 11, jz, 10, 6, 8, PINK);
  s.box(cx - 5, 11, jz, 10, 6, 1, (x) => x % 2 ? PINK_D : HAT);
  s.paint(cx - 5, 11, jz, 1, 1, 8, null).paint(cx + 4, 11, jz, 1, 1, 8, null);
  s.sprite([
    '..ww..',
    'w.ww.w',
    '.wwww.',
    '.wwww.',
    'w.ww.w',
    '..ww..',
  ], {w: WHITE}, [cx - 3, 16, jz + 1], 'xz');
  s.box(cx - 3, 16, jz + 7, 6, 1, 1, WHITE).box(cx - 1, 17, jz + 7, 2, 1, 1, MAROON);
  // Arms: viewer-left arm reaches forward and up in a wave, the other is flung out for balance.
  for (let i = 0; i < 8; i++) {
    const c = i < 5 ? (i === 2 ? PINK_D : PINK) : i === 5 ? WHITE : SKIN;
    s.box(cx - 9, 14 + i, jz + 4 + Math.round(i * .6), 3, 1, 3, c);
    s.box(cx + 6 + i, 12, jz + 5 - Math.round(i * .45), 1, 3, 3, c);
  }
  s.box(cx - 9, 12, jz + 4, 3, 2, 3, PINK).box(cx + 5, 12, jz + 5, 1, 3, 2, PINK_D);
  // Neck.
  s.box(cx - 2, 12, jz + 8, 4, 4, 2, SKIN_D);
  // Head: 10-wide face inside a one-voxel hair shell.
  const hz = jz + 10, hy = 8;
  s.box(cx - 6, hy, hz, 12, 10, 10, HAIR);
  s.box(cx - 5, hy + 9, hz, 10, 1, 8, SKIN).box(cx - 5, hy + 1, hz, 10, 8, 1, SKIN_D);
  for (const [x, y] of [[cx - 6, hy], [cx + 5, hy], [cx - 6, hy + 9], [cx + 5, hy + 9]]) s.box(x, y, hz, 1, 1, 10, null);
  s.set(cx - 5, hy + 9, hz, null).set(cx + 4, hy + 9, hz, null);
  // Side locks and fringe.
  s.box(cx - 6, hy + 8, hz - 2, 1, 1, 10, HAIR).box(cx + 5, hy + 8, hz - 2, 1, 1, 10, HAIR_D);
  s.box(cx - 5, hy + 9, hz + 7, 10, 1, 1, (x) => (x - cx + 5) % 3 === 2 ? SKIN : HAIR);
  s.set(cx - 5, hy + 9, hz + 6, HAIR).set(cx + 4, hy + 9, hz + 6, HAIR);
  s.box(cx - 5, hy, hz - 2, 10, 2, 3, HAIR_D); // hair at the nape
  // Strands on the shaded side of the hair, and a longer bob at the back.
  s.paint(cx + 5, hy + 1, hz, 1, 8, 8, (x, y, z) => (y % 3 === 0 && z < 7) ? HAIR_D : (y % 3 === 1 && z > 2 && z - hz < 6 && z - hz > 3) ? shift(HAIR, 8) : undefined);
  s.box(cx + 5, hy + 1, hz - 1, 1, 7, 1, (x, y) => y % 2 ? HAIR : null);
  // Eyes (2 wide, 3 tall, highlight), blush, nose, smile.
  for (const ex of [cx - 3, cx + 1]) {
    s.box(ex, hy + 9, hz + 3, 2, 1, 3, INK).box(ex, hy + 9, hz + 3, 2, 1, 1, '#7a56c8').set(ex, hy + 9, hz + 5, WHITE);
  }
  s.box(cx - 5, hy + 9, hz + 2, 2, 1, 1, '#f79ab8').box(cx + 3, hy + 9, hz + 2, 2, 1, 1, '#f79ab8');
  s.set(cx - 1, hy + 10, hz + 2, SKIN);
  s.box(cx - 1, hy + 9, hz + 1, 2, 1, 1, '#c2506e');
  // Beanie: ribbed band one voxel proud, soft crown, two cat ears.
  const bz = hz + 8;
  s.box(cx - 7, hy - 1, bz, 14, 12, 2, (x, y) => (x + y) % 2 ? HAT_L : '#ffdcea');
  for (const [x, y] of [[cx - 7, hy - 1], [cx + 6, hy - 1], [cx - 7, hy + 10], [cx + 6, hy + 10]]) s.box(x, y, bz, 1, 1, 2, null);
  s.box(cx - 6, hy, bz + 2, 12, 10, 2, HAT).box(cx - 5, hy + 1, bz + 4, 10, 8, 1, HAT).box(cx - 4, hy + 2, bz + 5, 8, 6, 1, HAT);
  for (const [x, y] of [[cx - 6, hy], [cx + 5, hy], [cx - 6, hy + 9], [cx + 5, hy + 9]]) s.box(x, y, bz + 2, 1, 1, 2, null);
  s.paint(cx - 6, hy, bz + 2, 12, 10, 4, (x, y, z) => hash(x, y, z, 4) < .18 ? shift(HAT, 5) : undefined);
  s.ball(cx, hy + 5, bz + 7, 1.9, '#fff0f6');
  for (const [ex, dir] of [[cx - 6, 1], [cx + 5, -1]]) {
    const rows = [4, 4, 3, 2, 1];
    rows.forEach((w, k) => { for (let i = 0; i < w; i++) s.box(ex + dir * i, hy + 5, bz + 3 + k, 1, 3, 1, HAT); });
    s.set(ex + dir, hy + 7, bz + 4, HAT_L).set(ex + dir * 2, hy + 7, bz + 4, HAT_L).set(ex + dir, hy + 7, bz + 5, HAT_L);
    s.set(ex + dir * 2, hy + 7, bz + 3, HAT_D).set(ex + dir, hy + 7, bz + 3, HAT_D);
  }
}
