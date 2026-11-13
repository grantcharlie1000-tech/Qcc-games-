// Quad Clash: an egg fighter in a gold house headband aiming a pencil blaster across the school quad,
// with a blue-ringed rival peeking over a brick wall.
export default function build(s, {C, island, speckle, hash, shift}) {
  const SHELL = '#f6e7c6', SHELL_HI = '#fff6e0', SHELL_LO = '#ecd7ac', GOLD = '#f7c531', DKGOLD = '#d99c1a';
  const INK = '#2a1c1a', BRICK = '#c4553f', BRICK2 = '#a9432f', MORTAR = '#e2c9a6';

  // Ground: grass quad with a pale checkered court path running across it.
  const grass = speckle([C.grass, C.ltgrass, C.dkgrass], 1, [5, 2, 2]);
  island(s, 0, 0, 32, 32, grass, speckle([C.dirt, C.dkdirt, '#845433'], 2, [4, 2, 2]), 5, 0, 2);
  s.box(0, 15, 0, 32, 12, 1, (x, y) => ((x >> 2) + ((y - 15) >> 2)) % 2 ? '#e9dcc0' : '#d8c8a6');
  s.box(0, 14, 0, 32, 1, 1, '#b9a784').box(0, 27, 0, 32, 1, 1, '#b9a784');
  // Grass tufts and daisies.
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(hash(i, 1, 0, 5) * 32), y = Math.floor(hash(i, 2, 0, 5) * 32);
    if (y >= 13 && y <= 28) continue;
    const r = hash(i, 3, 0, 5);
    if (r < .2) s.set(x, y, 1, C.white).set(x, y, 0, C.yellow); else s.set(x, y, 1, r < .6 ? C.ltgrass : C.dkgrass);
  }

  // ---- egg builder ----
  // Blocky egg: rounded-square cross-section, fuller below the middle and tapering to a domed top.
  const egg = (cx, cy, zb, rx, ry, H, col) => {
    const za = zb + Math.round(H * .23), zc = zb + Math.round(H * .66); // straight-walled band between za and zc
    const inside = (x, y, z) => {
      if (z < zb || z >= zb + H) return false;
      const k = z < za ? Math.cbrt(Math.max(0, 1 - ((za - z - .5) / (za - zb + .6)) ** 2.6)) : z >= zc ? Math.max(0, 1 - ((z + .5 - zc) / (zb + H - zc + .4)) ** 2.2) ** .55 : 1;
      if (k <= 0) return false;
      return Math.abs((x + .5 - cx) / (rx * k)) ** 3.4 + Math.abs((y + .5 - cy) / (ry * k)) ** 3.4 <= 1;
    };
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let z = zb; z < zb + H; z++)
      if (inside(x, y, z)) s.set(x, y, z, col);
    return inside;
  };
  // Ring one voxel proud of an egg between two heights.
  const ring = (inside, cx, cy, r, z0, z1, col, col2) => {
    for (let z = z0; z <= z1; z++) for (let x = cx - r - 2; x <= cx + r + 2; x++) for (let y = cy - r - 2; y <= cy + r + 2; y++)
      if (!inside(x, y, z) && (inside(x - 1, y, z) || inside(x + 1, y, z) || inside(x, y - 1, z) || inside(x, y + 1, z))) s.set(x, y, z, z === z0 ? col2 : col);
  };
  // Paint the frontmost (+y) voxel of a column.
  const front = (x, z, c, y1 = 40) => { for (let y = y1; y >= 0; y--) if (s.has(x, y, z)) { s.set(x, y, z, c); return y; } };

  // ---- rival egg peeking over a low brick wall (back right) ----
  const rIn = egg(24, 6, 1, 5.5, 5, 15, '#f1dfc0');
  ring(rIn, 24, 6, 6, 11, 12, C.blue, C.dkblue);
  for (const x of [21, 25]) { front(x, 8, INK); front(x + 1, 8, INK); front(x, 9, INK); front(x + 1, 9, INK); front(x, 9, '#ffffff'); }
  s.box(16, 11, 1, 15, 2, 5, (x, y, z) => (z % 2 ? x % 4 === 0 : x % 4 === 2) ? MORTAR : hash(x >> 1, z, 7) < .3 ? BRICK2 : BRICK);
  s.box(16, 11, 6, 15, 2, 1, '#e4d3b4');

  // ---- house flag on a pole (far right) ----
  s.box(29, 1, 1, 1, 1, 27, '#c9ced8').box(28, 0, 1, 3, 3, 1, C.slate).set(29, 1, 28, GOLD);
  s.sprite([
    '..ggggggggg',
    'gggggwggggg',
    '.gggwwwgggg',
    '..gwwwwwggg',
    '...gggggggg',
    '.....gggggg',
  ], {g: GOLD, w: '#fff3c4'}, [18, 1, 21], 'xz');

  // ---- stack of books with an apple (front left) ----
  const book = (x, y, z, dx, dy, c) => { s.box(x, y, z, dx, dy, 2, c).box(x + 1, y + 1, z, dx - 1, dy - 1, 1, C.paper).box(x, y, z + 1, dx, dy, 1, c).box(x, y, z + 1, 1, dy, 1, shift(c, -10)); s.box(x + 1, y + dy - 1, z, dx - 1, 1, 1, C.paper); };
  book(1, 24, 1, 8, 6, C.red); book(2, 25, 3, 7, 5, C.blue); book(1, 24, 5, 7, 5, C.green);
  s.ball(4.5, 26.5, 8.5, 1.6, C.red).set(4, 26, 10, C.brown).set(5, 26, 10, C.leaf);

  // ---- hero egg ----
  const cx = 15, cy = 14, zb = 5, H = 26;
  // Feet and legs.
  for (const fx of [cx - 6, cx + 2]) {
    s.box(fx, cy + 1, 1, 4, 7, 2, C.orange).box(fx, cy + 1, 1, 4, 7, 1, C.white).box(fx, cy + 5, 3, 4, 2, 1, C.orange).box(fx + 1, cy + 2, 3, 2, 3, 3, SHELL_LO);
    s.box(fx + 1, cy + 7, 2, 2, 1, 1, C.white);
  }
  const inE = egg(cx, cy, zb, 10, 9, H, SHELL);
  // Shell underside tone.
  s.paint(cx - 11, cy - 10, zb, 22, 20, 3, SHELL_LO);
  // Face.
  for (const [ex, flip] of [[cx - 5, 0], [cx + 3, 1]]) {
    for (let z = 16; z <= 19; z++) { front(ex, z, INK); front(ex + 1, z, INK); }
    front(ex, 19, '#ffffff'); // highlight
    const b = flip ? [ex + 2, ex + 1, ex, ex - 1] : [ex - 1, ex, ex + 1, ex + 2];
    front(b[0], 22, INK); front(b[1], 22, INK); front(b[1], 21, INK); front(b[2], 21, INK); front(b[3], 21, INK);
    front(flip ? ex + 3 : ex - 2, 15, '#f4a58e'); front(flip ? ex + 2 : ex - 1, 15, '#f4a58e');
  }
  front(cx - 2, 14, INK); front(cx - 1, 13, INK); front(cx, 13, INK); front(cx + 1, 13, INK); front(cx + 2, 14, INK); front(cx + 2, 15, INK);
  // Shell highlight.
  for (const [x, z] of [[cx - 8, 21], [cx - 8, 20], [cx - 7, 21]]) front(x, z, SHELL_HI);
  // Headband with knot and streaming tails.
  ring(inE, cx, cy, 10, 24, 25, GOLD, DKGOLD);
  s.box(cx - 12, cy + 1, 23, 2, 3, 4, DKGOLD).box(cx - 13, cy + 1, 24, 1, 3, 2, GOLD);
  for (let i = 0; i < 8; i++) {
    const up = 25 + Math.round(i * .45 + Math.sin(i * 1.1) * .8), dn = 23 - Math.round(i * .6 + Math.sin(i * 1.3) * .6);
    s.box(cx - 14 - i, cy + 2, up, 1, 2, 2, i % 3 === 2 ? DKGOLD : GOLD);
    if (i < 6) s.box(cx - 14 - i, cy + 1, dn, 1, 2, 2, i % 3 === 1 ? DKGOLD : GOLD);
  }

  // ---- pencil blaster held across the body ----
  const py = cy + 9, pz = 8, px = cx - 12;
  // Gloved hands (the pencil runs through them).
  for (const hx of [cx - 7, cx + 5]) { s.box(hx, py - 1, pz - 1, 2, 5, 5, C.orange).box(hx, py - 3, pz, 2, 2, 3, SHELL_LO).box(hx, py - 1, pz - 1, 2, 5, 1, C.dkorange); }
  const shaft = (x, y, z) => z === pz + 1 && y === py + 2 ? DKGOLD : z === pz + 2 ? '#ffd84a' : GOLD;
  s.box(px, py, pz, 3, 3, 3, C.pink).box(px, py, pz + 2, 3, 3, 1, '#ff8cc0');
  s.box(px + 3, py, pz, 2, 3, 3, '#b9c0cc').box(px + 4, py, pz, 1, 3, 3, '#8b93a3');
  s.box(px + 5, py, pz, 19, 3, 3, shaft);
  // Sight, grip and clip make it a blaster.
  s.box(cx + 8, py, pz + 3, 2, 3, 1, C.dark).box(cx + 8, py + 1, pz + 4, 2, 1, 1, C.red, {glow: true});
  s.box(cx - 3, py, pz - 3, 3, 3, 3, C.dark).box(cx - 3, py, pz - 3, 3, 3, 1, C.slate);
  s.box(px + 24, py, pz, 2, 3, 3, '#e7c08e').box(px + 26, py, pz, 1, 3, 3, '#d9aa72');
  s.box(px + 27, py + 1, pz + 1, 1, 1, 1, '#d9aa72').box(px + 27, py, pz, 1, 3, 3, (x, y, z) => (y === py + 1 || z === pz + 1) ? '#e7c08e' : null);
  s.box(px + 28, py + 1, pz + 1, 2, 1, 1, '#3a3340');
  // Graphite shot leaving the tip.
  s.set(px + 32, py + 1, pz + 1, '#fff2a8', {glow: true}).set(px + 31, py + 1, pz + 2, '#ffd84a', {glow: true}).set(px + 31, py + 1, pz, '#ffd84a', {glow: true});
}
