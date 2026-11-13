// Stack: a tall tower of rainbow slabs on a plinth, the next slab sliding in above it and an offcut tumbling away.
export default function build(s, {C, hash, shift, hsl, speckle}) {
  // Plinth: two dark stepped tiers with a pale trim.
  const stone = speckle(['#6c3f61', '#75466a', '#63395a'], 1, [4, 2, 2]);
  s.box(-4, -4, 0, 28, 28, 2, stone).box(-2, -2, 2, 24, 24, 2, stone);
  s.box(-4, -4, 1, 28, 28, 1, (x, y) => (x === -4 || y === -4 || x === 23 || y === 23) ? '#93598a' : undefined);
  s.box(-2, -2, 3, 24, 24, 1, (x, y) => (x === -2 || y === -2 || x === 21 || y === 21) ? '#b877a8' : undefined);

  // One bevelled slab: bright rim on the top layer, darker foot, soft speckle.
  const slab = (x0, y0, z0, w, d, hue, o) => {
    const base = hsl(hue, 80, 58), hi = hsl(hue, 88, 70), lo = hsl(hue, 72, 49);
    for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + d; y++) for (let k = 0; k < 4; k++) {
      const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + d - 1;
      const corner = (x === x0 || x === x0 + w - 1) && (y === y0 || y === y0 + d - 1);
      if (corner && k === 3) continue; // nibbled corners soften the block
      s.set(x, y, z0 + k, k === 3 ? (edge ? hi : hash(x, y, z0, 3) < .1 ? shift(base, 4) : base) : k === 0 ? lo : base, o);
    }
  };

  // The tower: each slab is trimmed a little, as if earlier drops were not quite perfect.
  const trims = [[0, 0, 18, 18], [0, 0, 18, 18], [0, 1, 18, 17], [1, 1, 17, 17], [1, 2, 17, 16], [2, 2, 16, 16],
    [2, 2, 15, 16], [2, 3, 15, 15], [3, 3, 14, 15], [3, 3, 14, 14]];
  const N = trims.length;
  trims.forEach(([x, y, w, d], i) => slab(x, y, 4 + i * 4, w, d, 272 - i * (272 - 46) / (N - 1)));
  const top = 4 + N * 4;

  // Next slab sliding in from the right, hovering one gap above the top, with speed streaks behind it.
  slab(3, -7, top + 2, 14, 14, 16);
  for (const [x, len] of [[5, 5], [9, 7], [13, 4]]) s.box(x, -13 - len, top + 4, 1, len, 1, '#ffd9a8', {glow: true});
  s.box(7, -11, top + 4, 1, 2, 1, '#ffd9a8', {glow: true}).box(15, -10, top + 4, 1, 2, 1, '#ffd9a8', {glow: true});

  // Offcut sliver from the last drop tumbling down the lit side, with crumbs.
  const cut = hsl(46, 80, 58);
  s.box(5, 24, 24, 11, 2, 4, cut).box(5, 24, 27, 11, 2, 1, hsl(46, 88, 70));
  s.box(7, 25, 21, 1, 1, 1, cut).box(13, 24, 20, 1, 1, 1, cut).box(10, 25, 30, 1, 1, 1, hsl(46, 88, 70));

  // Sparkles where the top slab landed.
  for (const [x, y, z] of [[1, 19, top + 4], [19, 10, top + 6], [-2, 8, top + 1]]) {
    s.box(x, y, z - 1, 1, 1, 3, '#ffffff', {glow: true}).set(x + 1, y - 1, z, '#ffffff', {glow: true}).set(x - 1, y + 1, z, '#ffffff', {glow: true});
  }
}
