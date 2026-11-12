// Fivefold: two rows of chunky letter tiles, PLANT over the solved PLAYS, on a keyboard tray with a sprouting plant.
export default function build(s, {C, island, speckle, hash, shift}) {
  const GREEN = '#52b84a', GREY = '#77809a', WHITE = '#fbfbf4', TRAY = '#2e3350', TRAY2 = '#383e60';
  const F = {
    P: ['######.', '#######', '##...##', '##...##', '#######', '######.', '##.....', '##.....', '##.....'],
    L: ['##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '#######', '#######'],
    A: ['.#####.', '#######', '##...##', '##...##', '#######', '#######', '##...##', '##...##', '##...##'],
    N: ['##...##', '###..##', '###..##', '####.##', '##.####', '##..###', '##..###', '##...##', '##...##'],
    T: ['#######', '#######', '..###..', '..###..', '..###..', '..###..', '..###..', '..###..', '..###..'],
    Y: ['##...##', '##...##', '###.###', '.#####.', '..###..', '..###..', '..###..', '..###..', '..###..'],
    S: ['.######', '#######', '##.....', '######.', '.######', '.....##', '.....##', '#######', '######.'],
  };
  const BW = 11, BH = 11, BD = 7, GAP = 1, X0 = 2, Y0 = 3;
  const W = X0 * 2 + 5 * BW + 4 * GAP, D = 22;
  island(s, 0, 0, W, D, (x, y) => (x === 0 || y === 0 || x === W - 1 || y === D - 1 ? TRAY2 : TRAY), speckle(['#232742', '#1d2038'], 2), 3, 0, 1);

  // A tile: bevelled slab with the letter one voxel deep in the lit +y face.
  const tile = (i, row, ch, col) => {
    const x0 = X0 + i * (BW + GAP), z0 = 1 + row * (BH + GAP), hi = shift(col, 9), lo = shift(col, -9);
    s.box(x0, Y0, z0, BW, BD, BH, col);
    for (let x = x0; x < x0 + BW; x++) for (let z = z0; z < z0 + BH; z++) {
      const top = z === z0 + BH - 1, bot = z === z0, left = x === x0, right = x === x0 + BW - 1;
      if ((top || bot) && (left || right)) { s.box(x, Y0, z, 1, BD, 1, null); continue; }
      if (top || left) s.set(x, Y0 + BD - 1, z, hi); else if (bot || right) s.set(x, Y0 + BD - 1, z, lo);
    }
    s.box(x0 + 1, Y0, z0 + BH - 1, BW - 2, BD, 1, hi);
    s.sprite(F[ch], {'#': WHITE}, [x0 + 2, Y0 + BD - 1, z0 + 1]);
  };
  // Spacer strip between the rows so the top row sits on something.
  s.box(X0 + 1, Y0 + 1, 1 + BH, W - X0 * 2 - 2, BD - 2, GAP, '#20243c');
  [...'PLAYS'].forEach((ch, i) => tile(i, 0, ch, GREEN));
  [...'PLANT'].forEach((ch, i) => tile(i, 1, ch, i < 3 ? GREEN : GREY));

  // Keyboard keys on the tray in front, coloured by what the guesses revealed.
  const KEYS = ['gdddgkddgg', 'gdddddddg', 'ddddkdd'];
  KEYS.forEach((row, r) => [...row].forEach((k, i) => {
    const kx = 2 + r * 3 + i * 6, ky = Y0 + BD + 2 + r * 4, col = k === 'g' ? GREEN : k === 'k' ? '#474d68' : '#8f97b0';
    if (kx + 5 > W - 1) return;
    s.box(kx, ky, 1, 5, 3, 1, shift(col, -10)).box(kx, ky, 2, 5, 3, 1, col);
  }));

  // A potted sprout on the last tile: PLANT, played.
  const px = X0 + 4 * (BW + GAP) + 3, py = Y0 + 1, pz = 1 + 2 * BH + GAP;
  s.box(px, py, pz, 5, 5, 3, '#c9683c').box(px - 1, py - 1, pz + 3, 7, 7, 1, '#dd7d4c').box(px, py, pz + 3, 5, 5, 1, C.brown);
  s.sprite(['......GG.', '.....GGGG', 'LL...GGGG', 'LLL..GGG.', 'LLLL.GG..', '.LLLSS...', '..LSS....', '...SS....', '...SS....', '...SS....'],
    {G: C.green, L: C.ltgrass, S: C.leaf}, [px - 2, py + 3, pz + 4], 'xz', 2);
  // Sparkles hovering over the solved rows.
  const spark = (x, y, z, n = 2) => {
    for (let k = -n; k <= n; k++) { s.set(x + k, y, z, C.yellow, {glow: true}); s.set(x, y, z + k, C.yellow, {glow: true}); }
    s.set(x, y, z, '#fff6c8', {glow: true});
  };
  spark(9, Y0 + 3, pz + 6); spark(24, Y0 + 3, pz + 9, 1); spark(37, Y0 + 3, pz + 5);
}
