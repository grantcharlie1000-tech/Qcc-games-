// Color Blocks: a 6x6 puzzle tray half filled with chunky jelly blocks, a completed row flashing gold,
// and an orange T piece hovering high above its landing spot.
export default function build(s, {C, hash, shift, mix}) {
  const S = 6, N = 6, OX = 3, OY = 3, W = N * S + 6;
  const FRAME = '#4a4590', FRAME_LT = '#6a64b8', FRAME_DK = '#2f2b66', SOCK = '#262257', SOCK_LT = '#615cb4';

  // Tray: stepped plinth, raised rim with rounded corners, recessed sockets.
  const round = (x, y, r) => {
    const dx = x < r ? r - x : x > W - 1 - r ? x - (W - 1 - r) : 0, dy = y < r ? r - y : y > W - 1 - r ? y - (W - 1 - r) : 0;
    return dx + dy <= r;
  };
  for (let x = 0; x < W; x++) for (let y = 0; y < W; y++) {
    if (!round(x, y, 2)) continue;
    const rim = x < 3 || y < 3 || x >= W - 3 || y >= W - 3;
    for (let z = -6; z <= (rim ? 2 : 0); z++) {
      const c = z <= -5 ? FRAME_DK : z === -4 ? '#3a3678' : z === 2 ? FRAME_LT : rim ? FRAME : SOCK;
      if (z <= -5 && (x < 1 || y < 1 || x >= W - 1 || y >= W - 1)) continue;
      s.set(x, y, z, c);
    }
  }
  // gold studs on the lit front rim
  for (let x = 6; x < W - 4; x += 6) s.set(x, W - 1, -1, C.yellow, {glow: true}).set(x - 1, W - 1, -1, C.gold);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++)
    s.box(OX + i * S + 1, OY + j * S + 1, 0, S - 2, S - 2, 1, (x, y) => (i + j) % 2 ? SOCK_LT : '#6964bd');

  // One jelly block: bevelled top with a paler face and a glint, darker foot, inset seams on the lit face.
  const block = (i, j, z0, c, h = 7, o) => {
    const x0 = OX + i * S, y0 = OY + j * S;
    s.box(x0, y0, z0, S, S, h - 1, c, o).box(x0, y0, z0, S, S, 1, shift(c, -10), o);
    s.box(x0 + 1, y0 + 1, z0 + h - 1, S - 2, S - 2, 1, shift(c, 8), o);
    s.box(x0 + 1, y0 + 1, z0 + h - 1, 2, 1, 1, mix(c, '#ffffff', .8), o).set(x0 + 1, y0 + 2, z0 + h - 1, mix(c, '#ffffff', .8), o).set(x0 + 3, y0 + 1, z0 + h - 1, mix(c, '#ffffff', .4), o);
    s.box(x0 + 1, y0 + S - 1, z0 + h - 2, S - 2, 1, 1, shift(c, 8), o);
  };

  const map = {b: C.blue, y: C.purple, p: C.green, r: C.red, g: C.teal, t: C.pink, k: C.sky};
  const grid = [
    'GGGGGG',
    'yy..gg',
    '......',
    '......',
    '...k.r',
    '...krr',
  ];
  grid.forEach((row, j) => [...row].forEach((k, i) => {
    if (k === 'G') block(i, j, 3, i % 2 ? C.yellow : '#ffd75e');
    else if (map[k]) block(i, j, 1, map[k]);
  }));
  // The completed line flashes: white glints on top and sparkles bursting above it.
  for (let i = 0; i < N; i++) s.box(OX + i * S + 2, OY + 2, 9, 2, 2, 1, '#fffbe0', {glow: true});
  const star = (x, z, r, c = '#fff6c8') => {
    const y = 5;
    for (let k = -r; k <= r; k++) s.set(x + k, y, z, c, {glow: true}).set(x, y, z + k, c, {glow: true});
    s.set(x, y, z, '#ffffff', {glow: true});
  };
  star(35, 17, 3); star(25, 15, 2, '#ffffff'); star(41, 25, 2, '#ffffff');

  // The hovering T piece, its glowing landing outline and (from the engine) its cast shadow on the tray.
  const cells = [[0, 4], [1, 4], [2, 4], [1, 5]], hz = 27;
  for (const [i, j] of cells) block(i, j, hz, C.orange, 7);
  for (const [i, j] of cells) {
    const x0 = OX + i * S, y0 = OY + j * S;
    s.box(x0, y0, 0, S, S, 1, (x, y) => (x === x0 || y === y0 || x === x0 + S - 1 || y === y0 + S - 1) ? '#ffb45e' : undefined, {glow: true});
  }
}
