// Animal Stack: a penguin balancing on a lion sitting on an elephant, all facing the light.
export default function build(s, {C, island, speckle}) {
  const INK = '#22202e';
  // Rounded-cube solid: round silhouette with flat enough sides to carry a face.
  const blob = (cx, cy, cz, rx, ry, rz, p, c) => {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let z = Math.floor(cz - rz); z <= cz + rz; z++)
      if (Math.abs((x + .5 - cx) / rx) ** p + Math.abs((y + .5 - cy) / ry) ** p + Math.abs((z + .5 - cz) / rz) ** p <= 1) s.set(x, y, z, c);
  };
  // Paint a pixel sprite onto the lit +y surface. rows: first row is the top; (x0, z0) is the bottom-left pixel.
  const face = (rows, pal, x0, z0, yFrom, depth = 6) => rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (!pal[ch]) return;
    const x = x0 + i, z = z0 + rows.length - 1 - j;
    for (let y = yFrom; y > yFrom - depth; y--) { const v = s.get(x, y, z); if (v) { v.c = pal[ch]; break; } }
  }));

  island(s, 0, 0, 28, 30, speckle([C.grass, C.ltgrass], 1, [5, 2]), speckle([C.dirt, C.dkdirt, '#845433'], 2, [4, 2, 2]), 3, 0, 1);

  // ---- Elephant ----
  const EG = '#93a1ba', EL = '#a9b6cc', ED = '#7b89a4', PINK = '#f2a2b8';
  for (const [lx, ly] of [[7, 5], [20, 5], [7, 16], [20, 16]]) {
    s.cyl(lx, ly, 1, 3, 6, ED);
    s.box(lx - 2, ly + 2, 1, 1, 1, 1, C.white).box(lx, ly + 2, 1, 1, 1, 1, C.white).box(lx - 1, ly + 2, 1, 1, 1, 1, C.white);
  }
  blob(14, 11, 11.5, 10, 9.5, 7.5, 3, EG);
  blob(14, 20.5, 13, 7.5, 5, 7, 3.2, EL);
  for (const ex of [3.5, 24.5]) {
    blob(ex, 18.5, 14, 4.5, 1.5, 6.5, 2.4, ED);
    face(['.PP.', 'PPPP', 'PPPP', 'PPPP', 'PPPP', 'PPPP', '.PP.'], {P: PINK}, ex < 14 ? 1 : 23, 11, 20, 3);
  }
  // trunk: down from the face, curling forward and up at the tip
  s.box(13, 25, 6, 3, 2, 6, EL).box(13, 26, 3, 3, 2, 5, EL).box(13, 27, 2, 3, 3, 2, EL).box(13, 29, 3, 3, 2, 3, EL);
  s.paint(13, 25, 2, 3, 6, 12, (x, y, z) => z % 2 === 0 && y > 25 ? EG : undefined);
  s.box(14, 30, 5, 1, 1, 1, ED);
  s.box(10, 25, 6, 2, 3, 2, C.white).box(17, 25, 6, 2, 3, 2, C.white).box(10, 28, 7, 2, 1, 1, C.white).box(17, 28, 7, 2, 1, 1, C.white);
  face([
    'KK.........KK',
    'WK.........WK',
    'KK.........KK',
    '.............',
    'PP.........PP',
  ], {K: INK, W: C.white, P: PINK}, 8, 11, 26);
  s.line([14, 1, 12], [14, -1, 8], ED).box(13, -2, 6, 2, 2, 2, INK);

  // saddle blanket
  s.paint(3, 5, 13, 22, 12, 8, (x, y, z) => z === 13 || y === 5 || y === 16 ? C.yellow : (x + y) % 4 === 0 ? '#f0606a' : C.red);

  // ---- Lion ---- (sits on the elephant's back, z 19 up)
  const LY = '#f9c63a', LD = '#e2a421', M1 = '#b0561c', M2 = '#8a3d16', CREAM = '#fdeccb';
  blob(14, 10.5, 23.5, 5.5, 5.5, 5, 3, LY);
  s.box(10, 15, 19, 3, 3, 3, LY).box(15, 15, 19, 3, 3, 3, LY).box(10, 17, 19, 3, 1, 1, LD).box(15, 17, 19, 3, 1, 1, LD);
  s.box(7, 9, 19, 2, 5, 2, LD).box(19, 9, 19, 2, 5, 2, LD);
  s.line([19, 7, 20], [23, 6, 21], LD).line([23, 6, 21], [24, 6, 25], LD);
  blob(24.5, 6.5, 27, 2, 2, 2, 2, M2);
  // mane: a spiky disc behind the face
  const hz = 30;
  for (let x = 3; x < 25; x++) for (let z = hz - 10; z < hz + 10; z++) {
    const dx = x + .5 - 14, dz = z + .5 - hz, d = Math.hypot(dx, dz), sec = Math.floor((Math.atan2(dz, dx) + Math.PI) * 14 / (2 * Math.PI));
    if (d > (sec % 2 ? 9.3 : 7.6)) continue;
    for (let y = d > 7.6 ? 13 : 10; y <= (d > 7.6 ? 16 : 18); y++) s.set(x, y, z, sec % 2 ? M1 : M2);
  }
  blob(14, 14.5, hz, 6.5, 4.5, 6, 4, LY);
  s.box(7, 14, hz + 5, 3, 2, 3, LY).box(18, 14, hz + 5, 3, 2, 3, LY).box(8, 15, hz + 6, 1, 1, 1, PINK).box(19, 15, hz + 6, 1, 1, 1, PINK);
  s.box(12, 19, hz - 3, 4, 1, 3, CREAM);
  face([
    '.KK....KK.',
    '.WK....WK.',
    '.KK....KK.',
    '....NN....',
    '..ccNNcc..',
    '..ccKKcc..',
    '...cccc...',
  ], {K: INK, W: C.white, N: '#8a4a2a', c: CREAM}, 9, hz - 4, 20);

  // ---- Penguin ---- (balances on the lion's mane)
  const PK = '#2d3148', pz = hz + 9;
  blob(14, 12.5, pz + 7.5, 6, 5, 7.5, 3, PK);
  s.box(9, 15, pz, 3, 3, 1, '#ffa52e').box(16, 15, pz, 3, 3, 1, '#ffa52e');
  s.box(7, 10, pz + 4, 1, 5, 7, PK).box(20, 10, pz + 4, 1, 5, 7, PK).box(6, 10, pz + 3, 1, 5, 4, PK).box(21, 10, pz + 3, 1, 5, 4, PK).box(5, 11, pz + 2, 1, 3, 2, PK).box(22, 11, pz + 2, 1, 3, 2, PK);
  face([
    '..WWW..WWW..',
    '.WWWW..WWWW.',
    '.WKKW..WKKW.',
    '.WKKW..WKKW.',
    '.WPWWWWWWPW.',
    'WWWWWWWWWWWW',
    'WWWWWWWWWWWW',
    'WWWWWWWWWWWW',
    'WWWWWWWWWWWW',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '..WWWWWWWW..',
  ], {K: INK, W: C.white, P: PINK}, 8, pz + 1, 19);
  s.box(13, 18, pz + 7, 2, 2, 2, C.orange).box(13, 19, pz + 7, 2, 1, 1, C.dkorange);

  // ---- Props ----
  blob(23, 25, 4, 3.5, 3.5, 3.5, 2.2, (x, y, z) => Math.floor((Math.atan2(y + .5 - 25, x + .5 - 23) + Math.PI) * 6 / (2 * Math.PI)) % 2 ? C.red : C.white);
  for (const [fx, fy, fc] of [[4, 26, C.yellow], [2, 8, C.pink], [25, 2, C.white], [8, 28, C.white], [2, 21, C.pink]]) s.box(fx, fy, 1, 1, 1, 1, C.dkgrass).box(fx, fy, 2, 1, 1, 1, fc);
}
