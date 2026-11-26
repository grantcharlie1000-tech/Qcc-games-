// Slipline: a packed board of chunky arrow bars, each pointing the way it can slide, with a lime bar
// that has just slipped free and is flying off the far edge.
export default function build(s, {C, hash, shift, mix}) {
  const S = 6, N = 6, OX = 2, OY = 2, W = N * S + 3;
  const RIM = '#6b58b4', RIM_LT = '#8a78d2', RIM_DK = '#3d2f74', TILE_A = '#3b2f68', TILE_B = '#473a7c', GROOVE = '#2a2050';

  // Plinth: stepped foot, lit rim, recessed checker floor with grooves between cells.
  s.box(2, 2, -10, W - 4, W - 4, 3, shift(RIM_DK, -6)).box(1, 1, -7, W - 2, W - 2, 2, RIM_DK).box(0, 0, -5, W, W, 4, RIM).box(0, 0, -1, W, W, 1, RIM_LT);
  s.box(0, 0, -3, W, W, 1, shift(RIM, -6));
  for (let x = OX - 1; x < W - 1; x++) for (let y = OY - 1; y < W - 1; y++) {
    const i = Math.floor((x - OX + 1) / S), j = Math.floor((y - OY + 1) / S);
    const edge = (x - OX + 1) % S === 0 || (y - OY + 1) % S === 0;
    s.set(x, y, 0, edge ? GROOVE : (i + j) % 2 ? TILE_A : TILE_B);
  }
  s.box(OX - 1, OY - 1, -1, W - 2, W - 2, 1, GROOVE);
  for (let x = 4; x < W - 2; x += 6) s.box(x, W - 1, -3, 3, 1, 1, C.teal, {glow: true});

  // One arrow bar. (i, j) is its tail cell, d its heading, len its length in cells, off = slide in voxels.
  const DIRS = {r: [1, 0], l: [-1, 0], d: [0, 1], u: [0, -1]};
  const bar = (i, j, d, len, c, z0 = 1, off = 0, h = 6) => {
    const [dx, dy] = DIRS[d], L = len * S - 1;
    // local (a along the heading from the tail, b across 0..4) to world
    const cx = OX + i * S + (dx < 0 ? S - 2 : 0), cy = OY + j * S + (dy < 0 ? S - 2 : 0);
    const at = (a, b) => [cx + dx * (a + off) + (dx ? 0 : b), cy + dy * (a + off) + (dy ? 0 : b)];
    for (let a = 0; a < L; a++) for (let b = 0; b < 5; b++) {
      const corner = (a === 0 || a === L - 1) && (b === 0 || b === 4);
      const [x, y] = at(a, b);
      for (let z = 0; z < h; z++) {
        if (corner && z === h - 1) continue;
        const rimTop = z === h - 1 && (a === 0 || a === L - 1 || b === 0 || b === 4);
        s.set(x, y, z0 + z, z === 0 ? shift(c, -11) : z === h - 1 ? (rimTop ? shift(c, 3) : shift(c, 9)) : z === h - 2 ? shift(c, 4) : c);
      }
    }
    // bold white chevrons painted into the top, pointing along the heading
    const top = z0 + h - 1;
    for (const a0 of [L - 3]) for (let k = 0; k < 3; k++) for (const b of [2 - k, 2 + k]) for (const t of [0, 1]) {
      const [x, y] = at(a0 - k - t, b); s.set(x, y, top, '#ffffff');
    }
  };

  bar(0, 0, 'r', 2, C.teal);
  bar(4, 0, 'd', 3, C.pink);
  bar(5, 0, 'd', 2, C.yellow);
  bar(0, 1, 'd', 3, C.purple);
  bar(1, 2, 'r', 3, C.sky);
  bar(5, 3, 'l', 3, C.orange);
  bar(1, 3, 'd', 3, C.yellow);
  bar(0, 4, 'd', 2, C.pink);
  bar(2, 4, 'r', 3, C.teal);
  bar(2, 5, 'r', 2, C.purple);
  bar(5, 4, 'd', 2, C.sky);

  // The freed bar: lifted high, sliding out past the far edge, with a smear and speed lines behind its tail.
  bar(2, 1, 'u', 2, C.lime, 16, 8);
  const lx = OX + 2 * S, ty = OY + S + 4 - 8 + 1; // first voxel behind the tail
  // speed lines that step down towards the lane, so the bar reads as launched up and out
  for (const [b, len] of [[0, 4], [2, 6], [4, 4]]) s.box(lx + b, ty + 1, 19, 1, len, 1, '#e4ffb0', {glow: true});
  for (const [b, len] of [[1, 3], [3, 3]]) s.box(lx + b, ty + 7, 15, 1, len, 1, '#e4ffb0', {glow: true});
  s.box(lx + 2, ty + 11, 11, 1, 3, 1, '#e4ffb0', {glow: true});
  const spark = (x, y, z) => { for (const k of [-2, -1, 0, 1, 2]) s.set(x + k, y, z, '#ffffff', {glow: true}).set(x, y, z + k, '#ffffff', {glow: true}); };
  spark(lx - 4, -4, 29); spark(lx + 10, -9, 23);
}
