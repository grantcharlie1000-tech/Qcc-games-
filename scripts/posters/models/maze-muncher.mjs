// Maze Muncher: an original big-mouthed block chomper with a crest and feet charges down a neon maze lane after
// pellets, while a one-eyed horned jelly gives chase from the next lane.
export default function build(s, {C, island, speckle, hash, shift}) {
  const FLOOR = '#1b1a3c', FLOOR2 = '#26245a', WALL = '#2a43b0', WALL_D = '#213592', NEON = '#6d9bff', PELLET = '#ffe9a8';
  const NX = 34, NY = 40;
  island(s, 0, 0, NX, NY, (x, y) => ((x + y) % 2 === 0 && (x % 4 === 1 || y % 4 === 1) ? FLOOR2 : FLOOR), speckle(['#2c2a66', '#25235a', '#34327a'], 2, [4, 3, 1]), 4, 0, 1);

  // Walls: 2 thick, 3 tall, dark sides with an unlit neon top.
  const wall = (x0, y0, dx, dy) => {
    s.box(x0, y0, 1, dx, dy, 2, (x, y, z) => (z === 1 ? WALL_D : WALL)).box(x0, y0, 3, dx, dy, 1, NEON, {glow: true});
  };
  wall(0, 0, NX, 2); wall(0, 0, 2, NY); wall(18, 38, 16, 2);
  wall(32, 0, 2, 20); wall(32, 30, 2, 10);
  wall(18, 0, 2, 5); wall(18, 16, 2, 4); wall(18, 28, 2, 12);
  wall(26, 18, 8, 2);
  wall(6, 5, 8, 7);

  // Pellets: small glowing cubes, and one big power orb with banded shading so it reads as round.
  const pellet = (x, y) => s.box(x, y, 2, 2, 2, 2, PELLET, {glow: true}).box(x, y, 1, 2, 2, 1, '#8a7a5a', {glow: true});
  for (const y of [31, 34, 37]) pellet(9, y);
  for (const y of [22, 25]) pellet(25, y);
  for (const [x, y] of [[3, 4], [3, 8], [3, 12], [9, 14], [15, 6], [15, 10], [15, 14], [24, 3], [28, 3]]) pellet(x, y);
  s.ball(26, 33, 4, 3.05, (x, y, z) => {
    const d = [x + .5 - 26, y + .5 - 33, z + .5 - 4], l = (d[0] * -.5 + d[1] * .31 + d[2] * .81) / Math.hypot(...d);
    return l > .8 ? '#ffe0f6' : l > .3 ? '#ffa8e6' : l > -.2 ? '#f47fd2' : '#c95aae';
  }, {glow: true});

  // The jelly chaser: soft block body, domed top, notched hem, one big eye, two horns with glowing tips.
  const jelly = (jx, jy, col, iris) => {
    const w = 11, d = 9, dk = shift(col, -12), lt = shift(col, 8);
    s.box(jx, jy, 1, w, d, 11, (x, y, z) => (z <= 3 ? dk : col));
    s.box(jx + 1, jy + 1, 12, w - 2, d - 2, 1, lt).box(jx + 2, jy + 2, 13, w - 4, d - 4, 1, lt);
    for (let z = 1; z <= 11; z++) for (const [x, y] of [[jx, jy], [jx + w - 1, jy], [jx, jy + d - 1], [jx + w - 1, jy + d - 1]]) s.del(x, y, z);
    for (let x = jx; x < jx + w; x++) if ((x - jx) % 4 >= 2) s.box(x, jy, 1, 1, d, 2, null); // hem notches
    for (let y = jy; y < jy + d; y++) if ((y - jy) % 4 === 1 || (y - jy) % 4 === 2) s.box(jx + w - 1, y, 1, 1, 1, 2, null);
    s.sprite(['.WWW.', 'WWWWW', 'WWIIW', 'WIKKW', 'WIKKW', '.WWW.'], {W: '#ffffff', I: iris, K: C.ink}, [jx + 3, jy + d - 1, 5]);
    s.set(jx + 5, jy + d - 1, 8, '#ffffff');
    s.sprite(['K.K.K', '.K.K.'], {K: shift(col, -30)}, [jx + 3, jy + d - 1, 3]);
    for (const hx of [jx + 1, jx + w - 3]) { s.box(hx, jy + 3, 12, 2, 2, 3, dk).set(hx, jy + 4, 15, C.yellow, {glow: true}).set(hx + 1, jy + 4, 15, C.yellow, {glow: true}); }
    s.box(jx + w, jy + 3, 5, 1, 2, 2, dk); // stubby arm on the shaded side
  };
  jelly(20, 6, C.pink, C.sky);

  // The muncher: chamfered block body with a huge toothy mouth on the lit face.
  const x0 = 3, y0 = 18, zb = 3, bw = 14, bd = 11, bh = 15, Y = '#f8c62f', YD = '#dc9d1c', YL = '#ffdb5c', M = '#8f2038', T = '#f27aa2';
  s.box(x0, y0, zb, bw, bd, bh, (x, y, z) => (z < zb + 2 ? YD : z >= zb + bh - 1 ? YL : Y));
  for (let x = x0; x < x0 + bw; x++) for (let y = y0; y < y0 + bd; y++) for (let z = zb; z < zb + bh; z++) {
    const e = (x === x0 || x === x0 + bw - 1) + (y === y0 || y === y0 + bd - 1) + (z === zb || z === zb + bh - 1);
    if (e >= 2) s.del(x, y, z);
  }
  const fy = y0 + bd - 1;
  s.sprite([
    '..............',
    '.OOOO....OOOO.',
    '..WWWW..WWWW..',
    '..WWWK..WWWK..',
    '..WWKK..WWKK..',
    '..WWKK..WWKK..',
    '..............',
    '.WWMWWMMWWMWW.',
    '.MMMMMMMMMMMM.',
    '.MMMMMMMMMMMM.',
    '.MMMMMMMMMMMM.',
    '.MMMMMMMMMMMM.',
    '.MWWMWWMWWMWM.',
    '..............',
    '..............',
  ], {O: C.dkorange, W: '#ffffff', K: C.ink, M, T}, [x0, fy, zb]);
  // Recess the open mouth one voxel so the teeth stand proud; the tongue lies inside.
  for (let x = x0 + 1; x <= x0 + 12; x++) for (let z = zb + 3; z <= zb + 6; z++) {
    const i = x - x0, tongue = (z === zb + 3 && i >= 3 && i <= 10) || (z === zb + 4 && i >= 5 && i <= 8);
    s.del(x, fy, z); s.set(x, fy - 1, z, tongue ? T : M);
  }
  // Crest of three spikes, side fin and feet.
  s.box(x0 + 2, y0 + 5, zb + bh, 2, 2, 2, C.orange).box(x0 + 6, y0 + 5, zb + bh, 2, 2, 4, C.orange).box(x0 + 10, y0 + 5, zb + bh, 2, 2, 2, C.orange);
  s.box(x0 + bw, y0 + 4, zb + 4, 1, 4, 3, YD).box(x0 + bw + 1, y0 + 5, zb + 4, 1, 2, 2, YD);
  for (const fx of [x0 + 1, x0 + 9]) s.box(fx, y0 + 5, 1, 4, 8, 2, C.orange).box(fx, y0 + 5, 1, 4, 8, 1, C.dkorange);
}
