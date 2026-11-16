// Corn Clicker: a giant smiling corn cob in peeled husk leaves, with gold coins popping out around it.
export default function build(s, {C, island, speckle}) {
  const INK = '#33230f', BLUSH = '#ff9a5c';
  const grass = speckle([C.grass, C.ltgrass], 1, [5, 2]);
  island(s, 0, 0, 26, 26, grass, speckle([C.dirt, C.dkdirt, '#845433'], 2, [4, 2, 2]), 5, 0, 2);

  // Cob: rounded-square section that swells then tapers to a blunt tip. Kernels are 2x2 cells in three golds.
  const cx = 13, cy = 13, H = 38, zb = 1;
  const rad = z => { const t = (z - zb + .5) / H; return 6.4 * (t > .5 ? Math.sqrt(Math.max(0, 1 - ((t - .5) / .5) ** 2.4)) : 1) * Math.min(1, .8 + t * 1.6); };
  const kernel = (x, y, z) => {
    const side = Math.abs(y + .5 - cy) >= Math.abs(x + .5 - cx) ? x : y + 1;
    const kx = side >> 1;
    return (z + (kx & 1) * 2) % 3 === 2 ? '#e3a21b' : kx & 1 ? '#ffd84a' : '#f8c02c';
  };
  for (let z = zb; z < zb + H; z++) {
    const r = rad(z);
    for (let x = Math.floor(cx - r); x <= cx + r; x++) for (let y = Math.floor(cy - r); y <= cy + r; y++)
      if (Math.abs((x + .5 - cx) / r) ** 3.4 + Math.abs((y + .5 - cy) / r) ** 3.4 <= 1) s.set(x, y, z, kernel);
  }
  s.box(12, 12, zb + H, 2, 2, 1, '#e3a21b');

  // Husk leaves: curved sheets that hug the cob low down and peel outwards to a point.
  const leaf = (ang, h, wide, curl, seed) => {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let k = 0; k <= h * 2; k++) {
      const t = k / (h * 2), z = zb + t * h;
      const half = wide * Math.sin(Math.PI * Math.min(1, .12 + t * .88)) ** .7 * (t > .6 ? 1 - (t - .6) * 1.6 : 1);
      for (let w = -half; w <= half; w += .5) {
        const out = rad(Math.min(z, zb + 12)) + 1 + curl * t ** 2.4 - w * w * .09;
        const zz = Math.floor(z - curl * .35 * t ** 4);
        const c = seed < 3 ? (Math.abs(w) < .6 ? '#4fb548' : '#6ccf55') : Math.abs(w) < .6 ? '#2f8f3a' : '#45a840';
        for (let o = 0; o < 2; o++) { const px = Math.floor(cx + dx * (out - o) - dy * w), py = Math.floor(cy + dy * (out - o) + dx * w); if (!s.has(px, py, zz)) s.set(px, py, zz, c); }
      }
    }
  };
  leaf(Math.PI * .5, 12, 5, 4, 1);    // front left (+y)
  leaf(0, 12, 5, 4, 2);               // front right (+x)
  leaf(Math.PI, 26, 5.5, 10, 3);      // back left
  leaf(-Math.PI * .5, 26, 5.5, 10, 4); // back right

  // Face on the lit side.
  const face = (rows, pal, x0, z0, yFrom) => rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (!pal[ch]) return;
    const x = x0 + i, z = z0 + rows.length - 1 - j;
    for (let y = yFrom; y > yFrom - 6; y--) { const v = s.get(x, y, z); if (v) { v.c = pal[ch]; break; } }
  }));
  face([
    'KK.....KK',
    'WK.....WK',
    'KK.....KK',
    'KK.....KK',
    '.........',
    'B.K...K.B',
    'B..KKK..B',
  ], {K: INK, W: C.white, B: BLUSH}, 9, zb + 17, 22);

  // Coins: upright discs facing the light, each with a plus sign.
  const coin = (x0, y0, z0) => {
    const rows = ['..ooooo..', '.oYYYYYo.', 'oYYYWYYYo', 'oYYYWYYYo', 'oYWWWWWYo', 'oYYYWYYYo', 'oYYYWYYYo', '.oYYYYYo.', '..ooooo..'];
    s.sprite(rows, {o: '#d99c1a', Y: '#ffd23e', W: '#fff3b8'}, [x0, y0, z0], 'xz', 1, {glow: true});
    s.sprite(rows, {o: '#b97f12', Y: '#d99c1a', W: '#d99c1a'}, [x0, y0 - 1, z0], 'xz', 1);
  };
  coin(-5, 25, 18); coin(23, -2, 23); coin(-6, 3, 31);

  // A stack of coins and tufts on the grass.
  for (let k = 0; k < 4; k++) s.cyl(22, 20, 1 + k, 3, 1, k % 2 ? '#d99c1a' : '#ffd23e');
  s.cyl(22, 20, 5, 3, 1, (x, y) => Math.hypot(x + .5 - 22, y + .5 - 20) < 1.6 ? '#fff3b8' : '#ffd23e');
  for (let k = 0; k < 3; k++) s.cyl(5, 21, 1 + k, 3, 1, (x, y) => k === 2 && Math.hypot(x + .5 - 5, y + .5 - 21) < 1.6 ? '#fff3b8' : k % 2 ? '#d99c1a' : '#ffd23e');
  for (const [tx, ty] of [[1, 12], [11, 24], [24, 9], [19, 1], [4, 2]]) s.box(tx, ty, 1, 1, 1, 2, C.dkgrass).set(tx + 1, ty, 1, C.leaf);
}
