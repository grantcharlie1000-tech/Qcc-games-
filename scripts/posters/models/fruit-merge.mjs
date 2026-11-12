// Fruit Merge: a smiling watermelon, orange, peach and cherries piled on a wooden crate.
export default function build(s, {C, speckle, hash}) {
  const INK = '#2a1b2e', BLUSH = '#ff7d9c';
  // Rounded-cube solid (superellipsoid): round silhouette, flat enough sides to carry a face.
  const blob = (cx, cy, cz, rx, ry, rz, p, c) => {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let z = Math.floor(cz - rz); z <= cz + rz; z++)
      if (Math.abs((x + .5 - cx) / rx) ** p + Math.abs((y + .5 - cy) / ry) ** p + Math.abs((z + .5 - cz) / rz) ** p <= 1) s.set(x, y, z, c);
  };
  // Paint a pixel face onto the lit +y surface. rows: first row is the top; (x0, z0) is the bottom-left pixel.
  const face = (rows, pal, x0, z0, yFrom) => rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (!pal[ch]) return;
    const x = x0 + i, z = z0 + rows.length - 1 - j;
    for (let y = yFrom; y > yFrom - 8; y--) { const v = s.get(x, y, z); if (v) { v.c = pal[ch]; break; } }
  }));
  const FP = {K: INK, W: C.white, B: BLUSH};
  // light-facing highlight test
  const hi = (x, y, z, cx, cy, cz) => (x + .5 - cx) * -.3 + (y + .5 - cy) * .45 + (z + .5 - cz) * .85;

  // Crate: slatted sides, corner posts, plank top.
  const W = 36, T = 12;
  const tone = speckle([C.wood, C.ltwood, '#bd8750'], 1, [4, 3, 3]);
  s.box(0, 0, 0, W, W, T, (x, y, z) => z % 4 === 3 ? C.dkdirt : tone((x + z * 5) >> 3, (y + z * 3) >> 3, z >> 2));
  s.box(0, 0, T, W, W, 1, (x, y) => x % 6 === 5 ? C.dkwood : tone(x / 6 | 0, y >> 4, 9));
  for (const [px, py] of [[0, 0], [W - 3, 0], [0, W - 3], [W - 3, W - 3]]) s.box(px, py, 0, 3, 3, T + 1, '#8a5a30');
  s.box(0, 0, T, W, 1, 1, '#8a5a30').box(0, W - 1, T, W, 1, 1, '#8a5a30').box(0, 0, T, 1, W, 1, '#8a5a30').box(W - 1, 0, T, 1, W, 1, '#8a5a30');
  for (const z of [1, 5, 9]) { s.set(4, W - 1, z, C.ltstone).set(W - 5, W - 1, z, C.ltstone).set(W - 1, 4, z, C.grey).set(W - 1, W - 5, z, C.grey); }
  const z0 = T + 1;

  // Watermelon.
  const wx = 14, wy = 14, wr = 12, wz = z0 + 11;
  blob(wx, wy, wz, wr, wr, 11, 3, (x, y, z) => {
    const a = Math.atan2(y + .5 - wy, x + .5 - wx);
    const st = Math.sin(a * 6 + Math.sin(z * .7) * .35);
    const front = y > wy && Math.abs(x + .5 - wx) < 10 && z > wz - 4 && z < wz + 6;
    return st > .55 && !front ? '#237f3c' : hi(x, y, z, wx, wy, wz) > 8.6 ? '#6fd45c' : '#4dbb4a';
  });
  s.box(13, 13, wz + 11, 2, 2, 1, C.brown);

  // Cherries perched on top of the watermelon.
  const cherry = (cx, cy, cz, r) => blob(cx, cy, cz, r, r, r, 2.6, (x, y, z) => hi(x, y, z, cx, cy, cz) > r * .72 ? '#ff8a93' : C.red);
  const twin = (ax, ay, bx, by, zb, r) => {
    cherry(ax, ay, zb + r, r); cherry(bx, by, zb + r, r);
    const jx = Math.round((ax + bx) / 2), jy = Math.round((ay + by) / 2) - 1, jz = Math.round(zb + r * 2 + 5);
    s.line([Math.floor(ax), Math.floor(ay), Math.round(zb + r * 2)], [jx, jy, jz], C.brown).line([Math.floor(bx), Math.floor(by), Math.round(zb + r * 2)], [jx, jy, jz], C.brown);
    s.box(jx - 3, jy, jz, 3, 2, 1, C.leaf).box(jx - 5, jy + 1, jz - 1, 3, 2, 1, C.green).set(jx, jy, jz + 1, C.brown);
  };
  twin(10.5, 14.5, 17.5, 12.5, wz + 9, 3.5);

  // Orange.
  const ox = 30, oy = 22, or = 6.5, oz = z0 + 6.5;
  blob(ox, oy, oz, or, or, or, 3, (x, y, z) => hi(x, y, z, ox, oy, oz) > 5 ? '#ffb85a' : hash(x, y, z, 11) < .08 ? '#ee8726' : C.orange);
  s.box(29, 21, oz + 6, 2, 2, 1, C.dkgreen);
  s.box(30, 19, oz + 7, 2, 3, 1, C.leaf).box(31, 17, oz + 8, 2, 3, 1, C.green);

  // Peach.
  const px = 5.5, py = 30.5, pr = 5, pz = z0 + 5;
  blob(px, py, pz, pr, pr, 5, 4, (x, y, z) => {
    const t = (z + .5 - pz) / 5 + (hash(x, y, z, 13) - .5) * .25;
    return t > .3 ? '#ff7f96' : t > -.3 ? '#ffa099' : '#ffc48e';
  });
  s.box(5, 30, pz + 4, 1, 1, 1, '#e8607c').box(5, 30, pz + 5, 1, 1, 2, C.brown).box(3, 30, pz + 6, 2, 3, 1, C.leaf).box(2, 28, pz + 7, 2, 3, 1, C.green);

  // A second pair of cherries on the crate at the front.
  cherry(16, 32, z0 + 3, 3); cherry(21.5, 33.5, z0 + 2.5, 2.5);
  s.line([16, 32, z0 + 6], [19, 31, z0 + 9], C.brown).line([21, 33, z0 + 5], [19, 31, z0 + 9], C.brown);
  s.box(19, 30, z0 + 10, 3, 2, 1, C.leaf);

  // Faces on the lit side.
  face([
    'KKK.......KKK',
    'KWK.......KWK',
    'KKK.......KKK',
    'KKK.......KKK',
    '.............',
    'BB..K...K..BB',
    'BB..KKKKK..BB',
  ], FP, 8, wz - 2, 27);
  const small = [
    'KK...KK',
    'WK...WK',
    'KK...KK',
    '.......',
    'B.K.K.B',
    '..KKK..',
  ];
  face(small, FP, 27, Math.floor(oz) - 2, 30);
  face(small, FP, 2, pz - 2, 37);
}
