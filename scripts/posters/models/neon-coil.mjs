// Neon Coil: a glowing lime worm weaving across a dark arena between bright energy orbs, head reared up.
export default function build(s, {C, island, speckle, hash, shift, mix}) {
  const G = {glow: true}, N = 34;
  const LIME = '#b4f552', GREEN = '#5fd63e', FLOOR = '#1f2552', FLOOR2 = '#252c60';

  // Arena: dark tiles inside a raised rim with a neon edge line.
  island(s, 0, 0, N, N, (x, y) => ((x >> 1) + (y >> 1)) % 2 ? FLOOR : FLOOR2, speckle(['#12163a', '#171b44'], 2), 4, 0, 1);
  for (let i = 0; i < N; i++) for (const [x, y] of [[i, 0], [i, N - 1], [0, i], [N - 1, i]]) s.set(x, y, 0, '#2f3878').set(x, y, 1, '#39448c');
  for (let i = 2; i < N - 2; i++) if (i % 4 < 2) { s.set(i, N - 1, 1, '#58c8ff', G); s.set(N - 1, i, 1, '#58c8ff', G); s.set(i, 0, 1, '#58c8ff', G); s.set(0, i, 1, '#58c8ff', G); }

  // Light spilled on the floor around glowing things.
  const spill = new Map();
  const light = (cx, cy, r, c, k = .5) => {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      if (x < 1 || y < 1 || x > N - 2 || y > N - 2) continue;
      const d = Math.hypot(x + .5 - cx, y + .5 - cy) / r; if (d > 1) continue;
      const a = k * (1 - d * d), key = x + ',' + y, o = spill.get(key);
      if (!o || o.a < a) spill.set(key, {x, y, a, c});
    }
  };

  // Orbs: bright balls hovering just off the floor, each with a pale core.
  const orb = (x, y, r, c) => {
    const cz = 1.6 + r;
    s.ball(x, y, cz, r, (px, py, pz) => pz + .5 - cz > r * .35 && px + .5 < x + .3 && py + .5 > y - .3 ? shift(c, 16) : pz + .5 - cz < -r * .45 ? shift(c, -10) : c, G);
    light(x, y, r + 2.6, c, .55);
  };
  orb(10, 10, 2.6, '#ffd23f'); orb(19, 10, 1.8, '#ff5fb0'); orb(30, 21, 2.6, '#3fe0ff'); orb(16, 20, 2, '#ff9a3c');
  orb(5, 29.5, 2.6, '#d06bff'); orb(14, 30.5, 1.7, '#ffd23f'); orb(30, 30, 2, '#ff5fb0'); orb(3.5, 11, 1.6, '#3fe0ff');

  // The worm: a thick flat-backed body laid along an S path, then a neck that rears up.
  const pts = [];
  const seg = (n, f) => { for (let i = 0; i < n; i++) pts.push(f(i / n)); };
  seg(60, t => [5 + 20 * t, 5, 0]);
  seg(50, t => [25 + 5 * Math.sin(Math.PI * t), 10 - 5 * Math.cos(Math.PI * t), 0]);
  seg(50, t => [25 - 16 * t, 15, 0]);
  seg(50, t => [9 - 5 * Math.sin(Math.PI * t), 20 - 5 * Math.cos(Math.PI * t), 0]);
  seg(30, t => [9 + 9 * t, 25, 0]);
  seg(40, t => [18 + 6 * Math.sin(Math.PI / 2 * t), 25, 6 * (1 - Math.cos(Math.PI / 2 * t))]);
  seg(50, t => [24 - 2 * Math.sin(Math.PI * t), 25, 6 + 14 * t]);
  let arc = 0, prev = pts[0];
  pts.forEach((p, i) => {
    arc += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]); prev = p;
    const r = 1 + 1.4 * Math.min(1, arc / 10), band = Math.floor(arc / 4) % 2, base = band ? LIME : GREEN;
    if (p[2] === 0) {
      s.cyl(p[0] + .5, p[1] + .5, 1, r, 2, shift(base, -8), 'z', G).cyl(p[0] + .5, p[1] + .5, 3, r, 1, base, 'z', G);
      if (arc % 4 > 1.6 && arc % 4 < 2.4 && arc > 8) s.set(p[0], p[1], 3, shift(base, 14), G);
      light(p[0] + .5, p[1] + .5, r + 2.6, GREEN, .45);
    } else {
      const cz = p[2] + 1.5 + r * .4;
      s.ball(p[0] + .5, p[1] + .5, cz, 2.5, (x, y, z) => z + .5 - cz > 1 ? base : shift(base, -8), G);
    }
  });
  for (const v of spill.values()) { const f = s.get(v.x, v.y, 0); if (f) f.c = mix(f.c, v.c, v.a); }

  // Head: a rounded block facing the viewer.
  const hx = 24.5, hy = 26, hz = 25.5;
  for (let x = Math.floor(hx - 6); x <= hx + 6; x++) for (let y = Math.floor(hy - 6); y <= hy + 6; y++) for (let z = Math.floor(hz - 5); z <= hz + 5; z++) {
    if (Math.abs((x + .5 - hx) / 5.5) ** 5 + Math.abs((y + .5 - hy) / 4.6) ** 5 + Math.abs((z + .5 - hz) / 5) ** 5 > 1) continue;
    s.set(x, y, z, z + .5 - hz > 3.4 ? shift(LIME, 7) : z + .5 - hz < -3.2 ? GREEN : LIME, G);
  }
  const decal = (rows, pal, ox, oz, o) => rows.forEach((row, j) => [...row].forEach((ch, i) => {
    const c = pal[ch]; if (!c) return;
    const x = ox + i, z = oz + rows.length - 1 - j;
    for (let y = Math.floor(hy) + 7; y >= hy; y--) if (s.has(x, y, z)) { s.set(x, y, z, c, o); return; }
  }));
  const eye = ['WWW', 'WWW', 'WKK', 'WKK', 'WWW'];
  decal(eye, {W: '#ffffff', K: C.ink}, 21, 25, G);
  decal(eye, {W: '#ffffff', K: C.ink}, 26, 25, G);
  decal(['D....D', '.DDDD.'], {D: '#1f7a2a'}, 22, 22, G);
  // Motes of light drifting up from the arena.
  for (const [x, y, z, c] of [[6, 3, 9, '#ffd23f'], [29, 8, 12, '#3fe0ff'], [12, 16, 11, '#ff5fb0'], [31, 14, 6, '#d06bff'], [3, 20, 7, '#ff9a3c'], [9, 31, 12, '#3fe0ff']]) s.set(x, y, z, c, G);
}
