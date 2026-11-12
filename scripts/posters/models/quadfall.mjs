// Quadfall: a tall falling-blocks well with a jagged stack of bevelled blocks and an orange T piece dropping
// towards the notch that fits it. A small pedestal on the left shows the next piece.
export default function build(s, {C, hash, shift, mix}) {
  const S = 5, COLS = 6, ROWS = 10, WX = COLS * S, WZ = ROWS * S;
  const WALL = '#7484b4', WALL_LT = '#9aa8d2', WALL_DK = '#4e5a86', BACK = '#2a3466', BACK_LT = '#3a4682';

  // Plinth with a stepped foot and a glowing trim on the lit front.
  s.box(-5, -4, -4, WX + 10, 14, 2, WALL_DK).box(-4, -3, -2, WX + 8, 12, 2, WALL).box(-4, -3, -1, WX + 8, 12, 1, WALL_LT);
  for (let x = -3; x < WX + 3; x += 4) s.box(x, 9, -4, 2, 1, 1, C.orange, {glow: true});
  // Floor of the well, back wall with cell grid, side pillars.
  s.box(0, -1, -1, WX, 6, 1, '#39446e');
  s.box(-1, -3, 0, WX + 2, 2, WZ + 1, (x, y, z) => (x % S === 0 || z % S === 0) && x >= 0 && x <= WX ? BACK_LT : BACK);
  // The right pillar is shallower so it does not hide the last column from this view.
  for (const [x0, d] of [[-4, 8], [WX, 4]]) {
    s.box(x0, -3, 0, 4, d, WZ + 1, (x, y, z) => z % 10 === 9 ? WALL_DK : WALL);
    s.box(x0 + 1, d - 4, 1, 2, 1, WZ - 1, (x, y, z) => z % 10 === 9 ? WALL_DK : WALL_LT); // raised lit strip
    s.box(x0 - 1, -4, WZ + 1, 6, d + 2, 2, WALL_LT).box(x0, -3, WZ + 3, 4, d, 1, WALL);
    s.box(x0 + 1, d - 6, WZ + 3, 2, 2, 3, C.orange, {glow: true});
  }
  s.box(0, -4, WZ + 1, WX, 2, 2, WALL_LT); // lintel across the back

  // One bevelled block: body, proud front plate, glint, dark foot seam.
  const block = (x0, y0, z0, n, c) => {
    s.box(x0, y0, z0, n, n - 1, n, c).box(x0, y0, z0, n, n - 1, 1, shift(c, -10)).box(x0, y0, z0 + n - 1, n, n - 1, 1, shift(c, 6));
    s.box(x0 + 1, y0 + n - 1, z0 + 1, n - 2, 1, n - 2, shift(c, 6));
    s.set(x0 + 1, y0 + n - 1, z0 + n - 2, mix(c, '#ffffff', .8));
    if (n > 4) s.set(x0 + n - 2, y0 + n - 1, z0 + 1, shift(c, -7)).set(x0 + n - 3, y0 + n - 1, z0 + 1, shift(c, -3)).set(x0 + n - 2, y0 + n - 1, z0 + 2, shift(c, -3));
  };
  const map = {b: C.blue, y: C.yellow, p: C.purple, r: C.red, g: C.green, t: C.teal, k: C.pink};
  const stack = ['bbyyrr', 'bgyyrp', 'bgg.pp', 'k....t']; // bottom row first
  stack.forEach((row, r) => [...row].forEach((k, i) => { if (map[k]) block(i * S, 0, r * S, S, map[k]); }));

  // Landing ghost: glowing outline on the back wall where the piece will lock.
  const T = [[2, 1], [3, 1], [4, 1], [3, 0]]; // bar above, stem below
  const inT = (i, r) => T.some(([a, b]) => a === i && b === r);
  for (const [i, dr] of T) {
    const x0 = i * S, z0 = (2 + dr) * S;
    s.box(x0, -1, z0, S, 1, S, (x, y, z) => ((x === x0 && !inT(i - 1, dr)) || (x === x0 + S - 1 && !inT(i + 1, dr)) || (z === z0 && !inT(i, dr - 1)) || (z === z0 + S - 1 && !inT(i, dr + 1))) ? '#ffb45e' : undefined, {glow: true});
  }
  // The falling T piece with speed streaks above it.
  for (const [i, dr] of T) block(i * S, 0, (6 + dr) * S, S, C.orange);
  for (const [x, len] of [[11, 5], [17, 8], [23, 6]]) s.box(x, -1, 8 * S + 1, 1, 1, len, '#7f92d6');

  // Next-piece pedestal on the left with a small S piece hovering over a glowing pad.
  s.box(-20, 1, -4, 14, 11, 2, WALL_DK).box(-19, 2, -2, 12, 9, 2, WALL).box(-19, 2, -1, 12, 9, 1, WALL_LT);
  s.box(-17, 4, -1, 8, 5, 1, '#39446e').box(-16, 5, -1, 6, 3, 1, C.teal, {glow: true});
  for (const [i, k] of [[0, 0], [1, 0], [1, 1], [2, 1]]) block(-19 + i * 4, 5, 4 + k * 4, 4, C.teal);
}
