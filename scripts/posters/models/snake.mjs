// Snake: a striped snake winds across a checkered grass board and rears up towards a big red apple.
export default function build(s, {C, island, speckle}) {
  const INK = '#1c2030';
  const W = 32, D = 36;
  island(s, 0, 0, W, D, (x, y) => ((x >> 2) + (y >> 2)) & 1 ? '#a2dc74' : '#86cc5c', speckle([C.dirt, C.dkdirt, '#845433'], 2, [4, 2, 2]), 6, 0, 2);

  // Body: a tube swept along a smooth path (Catmull-Rom through the control points).
  const R = 2.5, zf = 1 + R;
  const pts = [[34, 33, zf], [30, 33, zf], [24, 32, zf], [17, 31, zf], [12.5, 25.5, zf], [17, 20, zf], [24, 19.5, zf], [29, 14.5, zf], [25, 9, zf], [17, 7.5, zf], [13.5, 9, zf + 2.5], [13, 11, zf + 8], [13, 11.5, zf + 12], [13, 12, zf + 15]];
  const samples = [];
  let len = 0, prev = null;
  for (let i = 1; i < pts.length - 2; i++) for (let k = 0; k < 20; k++) {
    const t = k / 20, [a, b, c, d] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    const p = [0, 1, 2].map(j => .5 * (2 * b[j] + (c[j] - a[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t * t + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * t * t * t));
    if (prev) len += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
    prev = p; samples.push({p, len});
  }
  for (const q of samples) q.r = Math.min(R, .8 + q.len * .14);
  const G1 = '#25b862', G2 = '#178f4e', G3 = '#35c873', BELLY = '#d9ec6a', SPOT = '#ffd84a';
  for (let x = -1; x < W + 2; x++) for (let y = -1; y < D; y++) for (let z = 1; z < 24; z++) {
    let best = null, bd = 1e9;
    for (const q of samples) { const d = Math.hypot(x + .5 - q.p[0], y + .5 - q.p[1], z + .5 - q.p[2]) - q.r; if (d < bd) { bd = d; best = q; } }
    if (bd > 0) continue;
    const up = (z + .5 - best.p[2]) / best.r, band = Math.floor(best.len / 4), f = best.len / 4 - band;
    const front = (y + .5 - best.p[1]) / best.r;
    s.set(x, y, z, best.p[2] > zf + 3 ? (front > .25 ? (z % 2 ? BELLY : '#c3d94e') : G1) : up < -.45 ? BELLY : up > .5 && f > .3 && f < .7 ? SPOT : band % 2 ? G1 : G3);
  }

  // Head, reared up and facing the light.
  const hx = 13, hy = 12, hz = Math.round(zf + 14);
  for (let x = 5; x < 21; x++) for (let y = 5; y < 19; y++) for (let z = hz - 6; z < hz + 6; z++)
    if (Math.abs((x + .5 - hx) / 7) ** 3 + Math.abs((y + .5 - hy) / 5.5) ** 3 + Math.abs((z + .5 - hz) / 5) ** 3 <= 1) s.set(x, y, z, z < hz - 2 ? '#f0f59c' : G1);
  const face = (rows, pal, x0, z0, yFrom) => rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (!pal[ch]) return;
    const x = x0 + i, z = z0 + rows.length - 1 - j;
    for (let y = yFrom; y > yFrom - 6; y--) { const v = s.get(x, y, z); if (v) { v.c = pal[ch]; break; } }
  }));
  face([
    '.KKK....KKK.',
    '.WKK....WKK.',
    '.KKK....KKK.',
    '.KKK....KKK.',
    '............',
    '....N..N....',
    '.MMMMMMMMMM.',
  ], {K: INK, W: C.white, N: G2, M: '#0f6e3c'}, 7, hz - 3, 19);
  s.box(8, 10, hz + 5, 2, 3, 1, SPOT).box(16, 10, hz + 5, 2, 3, 1, SPOT).box(12, 7, hz + 5, 2, 3, 1, SPOT);
  s.box(12, 17, hz - 4, 2, 3, 1, C.red).box(11, 20, hz - 4, 1, 1, 1, C.red).box(14, 20, hz - 4, 1, 1, 1, C.red);

  // Apple.
  const ax = 5.5, ay = 30, az = 6;
  for (let x = 0; x < 12; x++) for (let y = 24; y < 36; y++) for (let z = 1; z < 12; z++) {
    const dx = x + .5 - ax, dy = y + .5 - ay, dz = z + .5 - az;
    if (Math.abs(dx / 5) ** 2.5 + Math.abs(dy / 5) ** 2.5 + Math.abs(dz / 5) ** 2.5 > 1) continue;
    s.set(x, y, z, dx * -.3 + dy * .45 + dz * .85 > 3 ? '#ff7f86' : C.red);
  }
  s.box(5, 29, az + 4, 1, 1, 1, C.dkred).box(5, 29, az + 5, 1, 1, 3, C.brown).box(6, 28, az + 7, 3, 2, 1, C.leaf).box(8, 27, az + 8, 2, 2, 1, C.green);

  // Board dressing.
  for (const [fx, fy, fc] of [[22, 14, C.pink], [21, 26, C.white], [30, 25, C.yellow], [13, 34, C.white], [2, 10, C.white], [23, 2, C.yellow]]) s.box(fx, fy, 1, 1, 1, 1, C.dkgrass).box(fx, fy, 2, 1, 1, 1, fc);
  s.ellipsoid(3, 19, 1.5, 2.5, 2, 1.8, C.stone).ellipsoid(5, 21, 1.2, 1.5, 1.5, 1.2, C.ltstone);
  const shroom = (mx, my, h) => { s.box(mx, my, 1, 2, 2, h, C.cream); s.box(mx - 1, my - 1, 1 + h, 4, 4, 1, C.red).box(mx, my, 2 + h, 2, 2, 1, C.red).set(mx - 1, my + 2, 1 + h, C.white).set(mx + 2, my, 1 + h, C.white).set(mx, my, 2 + h, C.white); };
  shroom(27, 3, 3); shroom(30, 7, 2); shroom(2, 3, 2);
}
