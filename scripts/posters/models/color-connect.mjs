// Flow Free: a dark 5x5 board with fat rounded pipes joining matching pegs.
export default function build(s, {mix, shift, hash}) {
  const RED = '#ee4a52', BLUE = '#3f7ee8', TEAL = '#25c9b4', YEL = '#f9c930', ORG = '#f68a2c';
  const SLATE = '#3d4470', T = 8, P = 7; // T: z of the tile tops, P: cell pitch (6 tile + 1 groove)
  const cc = i => 5 + i * P; // centre line of cell i (between voxels cc - 1 and cc)
  const N = 5, W = 2 + N * P + 1;

  // Board body: navy foot, dark slab, pale bevelled frame, grooved tiles.
  s.box(1, 1, 0, W - 2, W - 2, 3, (x, y, z) => hash(x, y, z, 1) < .2 ? '#2c3a78' : '#283570');
  s.box(0, 0, 3, W, W, 4, (x, y, z) => hash(x, y, z, 2) < .2 ? '#262a48' : '#222640');
  s.box(0, 0, 7, W, W, 2, '#4d5894').box(2, 2, 7, W - 4, W - 4, 2, null).box(1, 1, 7, W - 2, W - 2, 1, '#1a1d34');
  s.box(0, 0, 8, W, W, 1, (x, y) => (x === 0 || y === 0 || x === W - 1 || y === W - 1) ? '#7482c8' : undefined);

  // Routes as lists of cells [col, row]; pegs sit on the first and last cells.
  const paths = [
    [RED, [[2, 0], [3, 0], [4, 0], [4, 1]]],
    [BLUE, [[1, 1], [2, 1], [3, 1], [3, 2]]],
    [TEAL, [[1, 2], [1, 3], [1, 4], [2, 4], [3, 4], [4, 4]]],
    [YEL, [[0, 4], [0, 3], [0, 2], [0, 1], [0, 0], [1, 0]]],
    [ORG, [[2, 2], [2, 3], [3, 3], [4, 3], [4, 2]]],
  ];
  const tint = {};
  for (const [c, cells] of paths) for (const [i, j] of cells) tint[i + ',' + j] = c;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const c = tint[i + ',' + j] ? mix(SLATE, tint[i + ',' + j], .22) : SLATE;
    s.box(2 + i * P, 2 + j * P, T, 6, 6, 1, (x, y) => (x === 2 + i * P || y === 2 + j * P) ? shift(c, 8) : c);
  }

  // Fat pipe: 4 wide, 3 tall, with a rounded top.
  const pipe = (c, cells) => {
    for (let k = 0; k + 1 < cells.length; k++) {
      const [a, b] = [cells[k], cells[k + 1]];
      for (let t = 0; t <= P; t++) {
        const x = cc(a[0]) + (b[0] - a[0]) * t, y = cc(a[1]) + (b[1] - a[1]) * t;
        s.box(x - 2, y - 2, T + 1, 4, 4, 1, shift(c, -9)).box(x - 2, y - 2, T + 2, 4, 4, 1, c).box(x - 1, y - 1, T + 3, 2, 2, 1, c);
      }
    }
  };
  for (const [c, cells] of paths) pipe(c, cells);
  // Highlight stripe along the lit edge of every pipe top.
  s.paint(0, 0, T + 3, W, W, 1, (x, y, z, v) => (!s.has(x - 1, y, z) || !s.has(x, y + 1, z)) ? shift(v.c, 13, 6) : undefined);

  // Peg: a short fat disc with a dome, lighter than its pipe, with one glint.
  const peg = (c, [i, j]) => {
    const x0 = cc(i), y0 = cc(j), l = shift(c, 7, 4);
    s.cyl(x0, y0, T + 1, 3.1, 1, shift(c, -6)).cyl(x0, y0, T + 2, 3.1, 2, l).cyl(x0, y0, T + 4, 2.3, 1, shift(c, 13, 6));
    s.set(x0 - 2, y0, T + 4, '#ffffff').set(x0 - 3, y0 + 1, T + 3, '#ffffff');
  };
  for (const [c, cells] of paths) { peg(c, cells[0]); peg(c, cells[cells.length - 1]); }
}
