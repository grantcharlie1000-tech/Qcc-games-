// Claimline: a round arena carved into coloured territories, with the pink player looping a trail out to claim more.
export default function build(s, {C, hash, shift, mix}) {
  const R = 21, cx = 21, cy = 21;
  const inDisc = (x, y, r = R) => (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r * r;
  const floorC = '#46507e', floorDot = '#4d5889', rim = '#2a2f55', rimLt = '#39407a';

  // ---------- arena disc ----------
  for (let x = 0; x < 2 * R + 1; x++) for (let y = 0; y < 2 * R + 1; y++) {
    if (!inDisc(x, y)) continue;
    const edge = !inDisc(x, y, R - 1.5);
    s.box(x, y, -3, 1, 1, 3, edge ? rim : '#353b68');
    s.set(x, y, 0, edge ? rimLt : ((x >> 2) + (y >> 2)) % 2 ? floorDot : floorC);
    if (edge) s.set(x, y, 1, rimLt);
    if (inDisc(x, y, R - 4)) s.box(x, y, -5, 1, 1, 2, rim); // underside keel
  }

  // ---------- territories: blobs of circles, raised two voxels ----------
  const blob = circles => (x, y) => inDisc(x, y, R - 1.5) && circles.some(([a, b, r]) => (x + .5 - a) ** 2 + (y + .5 - b) ** 2 <= r * r);
  const lands = [
    {c: C.teal, f: blob([[13, 7, 7], [21, 6, 5], [5, 13, 4]])},
    {c: '#ffb52e', f: blob([[31, 7, 5.5], [36, 12, 4]])},
    {c: C.purple, f: blob([[7, 34, 6], [18, 38, 4.5], [13, 37, 4.5], [4, 27, 4.5], [27, 38, 3.5]])},
    {c: C.pink, f: blob([[10, 19, 5.8], [15, 23, 4.2]])},
  ];
  for (const {c, f} of lands) for (let x = 0; x < 2 * R + 1; x++) for (let y = 0; y < 2 * R + 1; y++) {
    if (!f(x, y)) continue;
    const border = !(f(x + 1, y) && f(x - 1, y) && f(x, y + 1) && f(x, y - 1));
    s.set(x, y, 1, shift(c, -8)).set(x, y, 2, border ? shift(c, 9) : (x + y) % 2 ? c : shift(c, -2.5));
  }

  // ---------- the pink trail: out of home, round the front of the arena and up to the player ----------
  const trailC = '#ff9ccb';
  const path = [[14, 25], [14, 29], [16, 31], [25, 31], [27, 29], [27, 24], [29, 22], [30, 22]];
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i], [bx, by] = path[i + 1], n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let t = 0; t <= n; t++) {
      const x = Math.round(ax + (bx - ax) * t / n), y = Math.round(ay + (by - ay) * t / n);
      for (let i2 = 0; i2 < 2; i2++) for (let j = 0; j < 2; j++) {
        const z = s.has(x + i2, y + j, 2) ? 3 : 1;
        s.set(x + i2, y + j, z, trailC);
      }
    }
  }

  // ---------- players: rounded cubes with eyes looking at the viewer ----------
  const cube = (x0, y0, z0, w, h, c, crown) => {
    s.box(x0, y0, z0, w, w, h, c).box(x0, y0, z0, w, w, 1, shift(c, -10));
    for (const x of [x0, x0 + w - 1]) for (const y of [y0, y0 + w - 1]) s.box(x, y, z0, 1, 1, h, null); // round the upright edges
    for (let i = 0; i < w; i++) { s.set(x0 + i, y0, z0 + h - 1, null).set(x0 + i, y0 + w - 1, z0 + h - 1, null).set(x0, y0 + i, z0 + h - 1, null).set(x0 + w - 1, y0 + i, z0 + h - 1, null); }
    s.box(x0 + 2, y0 + 2, z0 + h - 1, w - 4, w - 4, 1, shift(c, 7)); // glossy top
    // Eyes on the lit +y face.
    const big = w >= 9, ew = big ? 3 : 1, eh = big ? 4 : 2, ez = z0 + (big ? 4 : 2), mid = x0 + Math.floor(w / 2);
    for (const ex of big ? [x0 + 1, x0 + w - 4] : [x0 + 1, x0 + w - 2]) {
      s.box(ex, y0 + w - 1, ez, ew, 1, eh, C.white);
      s.box(ex + ew - 1 - (big ? 1 : 0), y0 + w - 1, ez, big ? 2 : 1, 1, big ? 3 : 1, C.ink);
      if (big) s.set(ex + ew - 1, y0 + w - 1, ez + 2, C.white);
    }
    if (w >= 9) { // smile and cheeks
      s.box(mid - 1, y0 + w - 1, z0 + 2, 3, 1, 1, C.maroon).set(mid - 2, y0 + w - 1, z0 + 3, C.maroon).set(mid + 2, y0 + w - 1, z0 + 3, C.maroon);
      s.box(x0 + 1, y0 + w - 1, z0 + 2, 2, 1, 1, '#ff9ccb').box(x0 + w - 3, y0 + w - 1, z0 + 2, 2, 1, 1, '#ff9ccb');
    }
    if (crown) {
      const kx = x0 + 2, ky = y0 + 2, kz = z0 + h, n = w - 4;
      s.box(kx, ky, kz, n, n, 2, C.yellow).box(kx + 1, ky + 1, kz, n - 2, n - 2, 2, null);
      for (const [i, j] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1], [Math.floor(n / 2), n - 1], [Math.floor(n / 2), 0], [0, Math.floor(n / 2)], [n - 1, Math.floor(n / 2)]]) s.set(kx + i, ky + j, kz + 2, C.yellow);
      s.set(kx + Math.floor(n / 2), ky + n - 1, kz, C.red);
    }
  };
  // A purple rival has wandered into the loop, trailing a line back to its land.
  for (let y = 30; y < 38; y++) for (let i = 0; i < 2; i++) s.set(20 + i, y, s.has(20 + i, y, 2) ? 3 : 1, '#c9aeff');
  cube(18, 24, 1, 6, 6, C.purple);
  cube(29, 17, 1, 11, 10, C.pink, true);    // the player, at the head of the trail
  cube(8, 5, 3, 6, 6, C.teal);                // rivals standing on their own land
  cube(27, 5, 3, 6, 6, '#ffb52e');

  // ---------- rim pylons with glowing caps round the back ----------
  for (const a of [170, 200, 230, 260, 290, 320]) {
    const px = Math.round(cx - .5 + Math.cos(a * Math.PI / 180) * (R - .8)), py = Math.round(cy - .5 + Math.sin(a * Math.PI / 180) * (R - .8));
    s.box(px, py, 1, 2, 2, 11, rim).box(px, py, 5, 2, 2, 1, rimLt).box(px, py, 9, 2, 2, 1, rimLt);
    s.box(px, py, 12, 2, 2, 2, '#ff8cc6', {glow: true});
  }
}
