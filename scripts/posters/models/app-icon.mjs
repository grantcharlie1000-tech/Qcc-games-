// QCC Games app icon: a chunky white game controller in front of a film clapperboard with its arm raised.
// Games plus movies, in the lit voxel style of the library posters, with large voxels for small sizes.
export default function build(s, {C, shift}) {
  // ---------- clapperboard: slate, fixed striped bar, raised striped arm hinged on the left ----------
  const SLATE = '#2b2f45', SLATE_L = '#3b4160', WHITE = '#f4f6fb', INK = '#1d1a2c';
  const BX = 8, BW = 20, BY = 0, BT = 3, BZ = 6, BH = 13, FY = BY + BT - 1;
  s.box(BX, BY, BZ, BW, BT, BH, SLATE);
  s.box(BX, FY, BZ, BW, 1, BH, (x, y, z) => (x === BX || x === BX + BW - 1 || z === BZ || z === BZ + BH - 1) ? SLATE_L : SLATE);
  const stripe = (x, z) => (Math.floor((x - BX + z * 1) / 3) % 2 ? INK : WHITE);
  s.box(BX, BY, BZ + BH, BW, BT, 3, (x, y, z) => stripe(x, z - BZ - BH));
  // raised arm: rises one voxel every three along x
  for (let i = 0; i < BW; i++) { const z = BZ + BH + 4 + Math.floor(i / 3); s.box(BX + i, BY, z, 1, BT, 3, (x, y, zz) => stripe(x + 1, zz - z)); }
  s.box(BX - 1, BY, BZ + BH + 1, 1, BT, 5, C.grey); // hinge plate
  // play triangle chalked on the slate
  ['#...', '##..', '###.', '####', '###.', '##..', '#...'].forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') s.set(BX + 12 + i, FY, BZ + 10 - j, C.yellow, {glow: true}); }));

  // ---------- controller, facing the viewer, floating in front and to the left ----------
  const BODY = [
    '..####################..',
    '.######################.',
    '########################',
    '########################',
    '########################',
    '########################',
    '########################',
    '########################',
    '########################',
    '##########....##########',
    '#########......#########',
    '########........########',
    '.######..........######.',
    '..####............####..',
  ];
  const GX = 0, GY = 12, GZ = 0, SHELL = '#f1f3f9', SHELL_D = '#cfd5e6';
  s.sprite(BODY, {'#': SHELL}, [GX, GY, GZ], 'xz', 4);
  s.paint(GX, GY - 3, GZ, 24, 2, 14, SHELL_D); // back of the shell a tone darker
  const top = GZ + BODY.length - 1, px = (col, row, c, o) => s.set(GX + col, GY + 1, top - row, c, o);
  for (let k = 0; k < 6; k++) { px(5, 2 + k, INK); px(6, 2 + k, INK); px(3 + k, 4, INK); px(3 + k, 5, INK); } // d-pad
  const btn = (col, row, c) => { for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) px(col + a, row + b, b ? shift(c, -8) : c); };
  btn(17, 1, C.yellow); btn(14, 4, C.blue); btn(20, 4, C.red); btn(17, 7, C.green);
  s.set(GX + 10, GY, top - 4, C.grey).set(GX + 11, GY, top - 4, C.grey).set(GX + 13, GY, top - 4, C.grey).set(GX + 12, GY, top - 4, SHELL); // menu pips
}
