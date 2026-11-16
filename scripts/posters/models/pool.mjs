// Pool: a mahogany table in the corner of a pool hall, six balls racked, the cue ball lined up and a cue on the rail.
export default function build(s, {C, island, speckle, hash, shift}) {
  const MAHOG = '#9a4f2c', MAHOG_D = '#6f3520', MAHOG_L = '#b8683a', FELT = '#2fa866', FELT_D = '#23884f', CUSH = '#1f7a47';
  const WALL = '#e3c592', WALL2 = '#d6b47c', TILE_A = '#3d4258', TILE_B = '#4b516b';
  const W = 48, D = 35;
  // Floor: checkered tiles on a slab.
  island(s, 0, 0, W, D, (x, y) => (((x >> 2) + (y >> 2)) % 2 ? TILE_A : TILE_B), speckle([C.dkstone, C.slate, '#59627a'], 2, [3, 3, 1]), 4, 0, 1);

  // Back walls: striped paper over a wood wainscot, on the two far sides.
  const WH = 25;
  for (let z = 1; z <= WH; z++) {
    for (let x = 0; x < W; x++) s.set(x, 0, z, z <= 8 ? (x % 6 === 0 ? MAHOG_D : z === 8 ? MAHOG_L : MAHOG) : z === WH ? MAHOG_D : x % 4 < 2 ? WALL : WALL2);
    for (let y = 0; y < D; y++) s.set(0, y, z, z <= 8 ? (y % 6 === 0 ? MAHOG_D : z === 8 ? MAHOG_L : MAHOG) : z === WH ? MAHOG_D : y % 4 < 2 ? WALL : WALL2);
  }
  // Cue rack on the lit wall: two rails and four cues.
  s.box(4, 1, 20, 13, 1, 1, MAHOG_D).box(4, 1, 11, 13, 1, 1, MAHOG_D);
  for (let i = 0; i < 4; i++) s.box(5 + i * 3, 1, 9, 1, 1, 15, (x, y, z) => (z > 21 ? C.cream : z < 13 ? C.dkwood : C.ltwood));
  // A spare triangle rack hanging on a peg.
  s.sprite(['.....#.....', '....###....', '....#.#....', '...##.##...', '...#...#...', '..##...##..', '..#.....#..', '.##.....##.', '.#########.', '.#########.'], {'#': '#5a2c1a'}, [27, 1, 14]);
  s.set(32, 1, 24, C.gold);
  // Chalk scoreboard on the shaded wall.
  s.sprite(['GGGGGGGGGGGGG', 'GSSSSSSSSSSSG', 'GSWSWSWSSSWSG', 'GSWSWSWSSSWSG', 'GSWSWSWSSSWSG', 'GSSSSSSSSSSSG', 'GSWSWSSSSSSSG', 'GSWSWSSSSSSSG', 'GSSSSSSSSSSSG', 'GGGGGGGGGGGGG'],
    {G: C.gold, S: '#3a4a5a', W: C.cream}, [1, 24, 12], 'yz');

  // The table: x 3..46, y 5..32.
  const tx = 3, ty = 5, tw = 43, td = 27, bed = 11;
  for (const [lx, ly] of [[tx + 1, ty + 1], [tx + tw - 6, ty + 1], [tx + 1, ty + td - 6], [tx + tw - 6, ty + td - 6]]) {
    s.box(lx, ly, 1, 5, 5, 6, MAHOG_D).box(lx + 1, ly + 1, 1, 3, 3, 1, C.gold).box(lx, ly, 6, 5, 5, 1, MAHOG);
  }
  s.box(tx, ty, 7, tw, td, 4, (x, y, z) => (z === 7 ? MAHOG_D : (x + y) % 9 === 0 ? MAHOG_D : MAHOG));
  s.box(tx, ty, bed, tw, td, 1, speckle([FELT, '#33b06c', '#2ca060'], 3, [5, 2, 2]));
  // Rails (wood, 2 wide) and cushions (dark felt, 1 wide), two voxels above the bed.
  for (let x = tx; x < tx + tw; x++) for (let y = ty; y < ty + td; y++) {
    const e = Math.min(x - tx, y - ty, tx + tw - 1 - x, ty + td - 1 - y);
    if (e < 2) { s.set(x, y, bed + 1, MAHOG).set(x, y, bed + 2, (x + y) % 9 === 0 ? MAHOG : MAHOG_L); } else if (e === 2) { s.set(x, y, bed + 1, CUSH).set(x, y, bed + 2, FELT_D); }
  }
  // Sights on the rails.
  for (let x = tx + 6; x < tx + tw - 4; x += 5) { s.set(x, ty + td - 1, bed + 2, C.cream); s.set(x, ty, bed + 2, C.cream); }
  for (let y = ty + 5; y < ty + td - 4; y += 5) { s.set(tx + tw - 1, y, bed + 2, C.cream); s.set(tx, y, bed + 2, C.cream); }
  // Pockets: four corners and two side pockets.
  const mx = tx + (tw >> 1) - 1;
  for (const [px, py] of [[tx + 1, ty + 1], [tx + tw - 5, ty + 1], [tx + 1, ty + td - 5], [tx + tw - 5, ty + td - 5], [mx, ty], [mx, ty + td - 4]]) {
    s.box(px, py, bed + 1, 4, 4, 2, null).box(px, py, bed, 4, 4, 1, C.ink);
    s.box(px, py, bed - 1, 4, 4, 1, C.ink);
  }

  // Balls, radius 3. They are unlit voxels with hand-banded sphere shading so they read as round, plus a
  // painted shadow on the felt, a highlight and a number spot.
  const z0 = bed + 4, L = [-.5, .31, .81];
  const ball = (cx, cy, col, stripe = false) => {
    s.ellipsoid(cx + 2, cy - 1, bed + .5, 3.6, 3, .5, FELT_D);
    s.ellipsoid(cx, cy, z0, 3.05, 3.05, 3.05, (x, y, z) => {
      const d = [x + .5 - cx, y + .5 - cy, z + .5 - z0], m = Math.hypot(...d), l = (d[0] * L[0] + d[1] * L[1] + d[2] * L[2]) / m;
      const c = stripe && Math.abs(d[2]) > 1.6 ? '#f4f1e8' : col;
      return shift(c, l > .8 ? 15 : l > .35 ? 5 : l > -.15 ? -4 : -15);
    }, {glow: true});
    s.box(cx - 2, cy, z0 + 2, 1, 1, 1, '#ffffff', {glow: true});
    if (col !== '#f4f1e8') s.box(cx - 1, cy + 2, z0 - 1, 2, 1, 2, '#ffffff', {glow: true});
  };
  ball(10, 12, C.yellow); ball(10, 18, C.purple, true); ball(10, 24, C.red);
  ball(15, 15, C.blue); ball(15, 21, C.orange);
  ball(20, 18, '#2c2840');
  ball(36, 11, C.dkteal, true);
  ball(28, 18, '#f4f1e8');

  // The cue, aimed at the cue ball, butt raised past the end rail.
  const cue = (a, b) => {
    for (const [oy, oz] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      for (let t = 0; t <= n; t++) {
        const f = t / n, x = Math.round(a[0] + (b[0] - a[0]) * f), y = Math.round(a[1] + (b[1] - a[1]) * f), z = Math.round(a[2] + (b[2] - a[2]) * f);
        s.set(x, y + oy, z + oz, t < 1 ? C.sky : t < 3 ? C.cream : f > .62 ? (t === Math.round(n * .62) + 1 || t === n ? C.gold : '#2b2640') : C.ltwood);
      }
    }
  };
  cue([32, 18, z0 - 1], [57, 19, z0 + 7]);
  // Chalk on the near rail.
  s.box(24, ty + td - 2, bed + 3, 2, 2, 2, C.blue).box(30, ty + td - 2, bed + 4, 2, 2, 1, C.sky);
}
