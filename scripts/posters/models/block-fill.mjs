// Block Fill: a golden path of raised blocks winding through a tile grid. The path climbs one step per
// block from the near corner to the far corner, where the orange head cube leads the way.
export default function build(s, {C, hash, shift, mix}) {
  const S = 6, N = 6, OX = 2, OY = 2, W = N * S + 4;
  const RIM = '#5d4a9c', RIM_LT = '#7c68c0', RIM_DK = '#33265f', GROOVE = '#231a44';
  const TILE = '#56609a', TILE_LT = '#6b76b4', TILE_DK = '#414a7c';

  // Plinth with a stepped foot.
  s.box(2, 2, -9, W - 4, W - 4, 3, shift(RIM_DK, -6)).box(1, 1, -6, W - 2, W - 2, 2, RIM_DK).box(0, 0, -4, W, W, 4, RIM);
  s.box(0, 0, -1, W, W, 1, RIM_LT).box(0, 0, -3, W, W, 1, shift(RIM, -6));
  s.box(OX - 1, OY - 1, -1, W - 2, W - 2, 2, GROOVE);
  for (let x = 4; x < W - 2; x += 6) s.box(x, W - 1, -3, 3, 1, 1, C.yellow, {glow: true});

  const path = [[4, 4], [3, 4], [2, 4], [1, 4], [0, 4], [0, 3], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [5, 1], [5, 0], [4, 0], [3, 0], [2, 0], [1, 0], [0, 0]];
  const walls = [[1, 5], [3, 3], [2, 1]];
  const key = (i, j) => i + ',' + j;
  const step = new Map(path.map((p, k) => [key(...p), k]));

  // Empty tiles: low bevelled pads. Walls: slate blocks with a dark cross on top.
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x0 = OX + i * S, y0 = OY + j * S;
    if (step.has(key(i, j))) continue;
    if (walls.some(w => w[0] === i && w[1] === j)) {
      s.box(x0, y0, 1, 5, 5, 5, '#8792b4').box(x0, y0, 1, 5, 5, 1, '#5d6788').box(x0, y0, 5, 5, 5, 1, '#a3adcb');
      for (let k = 0; k < 5; k++) s.set(x0 + k, y0 + k, 5, '#2f3552').set(x0 + 4 - k, y0 + k, 5, '#2f3552');
    } else {
      s.box(x0, y0, 1, 5, 5, 1, TILE_DK).box(x0, y0, 2, 5, 5, 1, (i + j) % 2 ? TILE : TILE_LT);
      s.box(x0 + 1, y0 + 1, 2, 3, 3, 1, (i + j) % 2 ? shift(TILE, 4) : shift(TILE_LT, 4));
    }
  }

  // Golden path: each block one voxel taller than the last, joined to its neighbours so it reads as one ribbon.
  const hOf = k => 3 + Math.round(k * .8);
  const gold = (i, j, k) => {
    const x0 = OX + i * S, y0 = OY + j * S, h = hOf(k);
    const near = (di, dj) => { const n = step.get(key(i + di, j + dj)); return n !== undefined && Math.abs(n - k) === 1; };
    const dx = near(1, 0) ? 6 : 5, dy = near(0, 1) ? 6 : 5;
    s.box(x0, y0, 1, dx, dy, h, (x, y, z) => z === 1 ? C.dkyellow : (x === x0 + 5 || y === y0 + 5) && z < h ? '#c98f14' : z > h - 2 ? '#ffd24a' : z > h - 4 ? C.yellow : (z + k) % 4 === 0 ? '#dfa51e' : C.gold);
    s.box(x0, y0, h + 1, 5, 5, 1, '#ffe07a').box(x0 + 1, y0 + 1, h + 1, 3, 3, 1, '#ffeb9e');
    s.set(x0 + 1, y0 + 1, h + 1, '#ffffff').set(x0 + 2, y0 + 1, h + 1, '#fff7d6').set(x0 + 1, y0 + 2, h + 1, '#fff7d6');
  };
  path.forEach(([i, j], k) => gold(i, j, k));

  // The head: an orange cube with a little face, mid-hop above the newest block at the top of the climb.
  const [hi, hj] = path[path.length - 1];
  const hx = OX + hi * S, hy = OY + hj * S, hz = hOf(path.length - 1) + 4;
  s.box(hx - 1, hy - 1, hz, 7, 7, 7, C.orange).box(hx - 1, hy - 1, hz, 7, 7, 1, C.dkorange).box(hx, hy, hz + 6, 5, 5, 1, '#ffb868');
  s.set(hx, hy, hz + 6, '#ffffff').set(hx + 1, hy, hz + 6, '#ffe6c4');
  s.box(hx, hy + 5, hz + 3, 1, 1, 2, C.ink).box(hx + 4, hy + 5, hz + 3, 1, 1, 2, C.ink);
  s.set(hx, hy + 5, hz + 4, '#ffffff').set(hx + 4, hy + 5, hz + 4, '#ffffff');
  const spark = (x, y, z, r) => { for (let k = -r; k <= r; k++) s.set(x + k, y, z, '#fff3c0', {glow: true}).set(x, y, z + k, '#fff3c0', {glow: true}); };
  spark(hx + 13, hy + 2, hz + 9, 2); spark(hx - 1, hy + 14, hz + 5, 2);
}
