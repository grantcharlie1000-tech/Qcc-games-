// Last Light: a hooded courier holding out a glowing lantern on a broken rooftop, with the sleeping city's
// towers and a few lit windows below.
export default function build(s, {C, speckle, hash, shift, mix}) {
  const HOOD = '#b9d6b8', HOOD_D = '#93b79a', CLOAK = '#4f958a', CLOAK_D = '#3a766f', TUNIC = '#2c504f';
  const SCARF = '#e0554f', SCARF_D = '#b63b40', LEATHER = '#9a6639', LEATHER_D = '#6f4526', BOOT = '#5b3b27';
  const SKIN = '#f8d2b0', SKIN_L = '#ffe6c2', HAIR = '#3b2a2c', INK = '#1f1a2c';
  const BRASS = '#d9a441', BRASS_D = '#a8782a', LIT = '#ffc85a', DARKWIN = '#222a45';
  const roofC = speckle(['#7b88a5', '#6c7994', '#8996b2'], 1, [5, 3, 2]);
  const wallC = speckle(['#47526f', '#3f4966', '#505c7b'], 2, [5, 3, 2]);
  const ZB = -12;

  // A city block: stone walls with windows on both visible faces, a cornice and a roof slab at z = ztop.
  const block = (x0, y0, w, d, ztop, seed, roof = roofC) => {
    s.box(x0, y0, ZB, w, d, ztop - ZB - 1, wallC);
    s.box(x0, y0, ztop - 1, w, d, 1, '#5d6988').box(x0, y0, ztop, w, d, 1, roof);
    for (let z = ztop - 6; z > ZB; z -= 5) {
      for (let x = x0 + 2; x < x0 + w - 2; x += 4) {
        const lit = hash(x, z, 1, seed) < .34;
        s.box(x, y0 + d - 1, z, 2, 1, 3, lit ? LIT : DARKWIN, lit ? {glow: true} : undefined);
        if (lit) s.set(x, y0 + d - 1, z + 1, '#fff0b8', {glow: true});
      }
      for (let y = y0 + 2; y < y0 + d - 2; y += 4) {
        const lit = hash(y, z, 2, seed) < .3;
        s.box(x0 + w - 1, y, z, 1, 2, 3, lit ? LIT : DARKWIN, lit ? {glow: true} : undefined);
      }
    }
  };

  // ---- main rooftop ----
  block(0, 0, 22, 26, 0, 3);
  // Slate tiles with darker joints.
  s.paint(0, 0, 0, 22, 26, 1, (x, y) => ((y % 4 === 3) || ((x + (y >> 2) * 2) % 5 === 4)) ? '#5a6682' : undefined);
  // Broken edge on the right: missing chunks, exposed rafters, rubble.
  for (let y = 7; y < 20; y++) {
    const bite = Math.round(1.5 + hash(y >> 1, 0, 0, 8) * 3 + (y > 10 && y < 16 ? 2 : 0));
    s.box(22 - bite, y, -4, bite, 1, 5, null);
    s.box(22 - bite, y, -5, bite, 1, 1, '#333c57');
  }
  for (const y of [9, 13, 17]) s.box(15, y, -1, 7, 1, 1, LEATHER_D).set(21, y, -1, LEATHER);
  for (const [x, y, z] of [[18, 6, 1], [17, 20, 1], [16, 12, 1], [19, 21, 1], [14, 16, 1]]) s.set(x, y, z, '#6c7994');
  s.box(17, 5, 1, 2, 2, 1, '#8996b2');
  // Low parapet along the two back edges, with gaps.
  s.box(0, 0, 1, 22, 1, 2, (x) => (x > 8 && x < 11) ? null : '#66728e').box(0, 0, 1, 1, 26, 2, (x, y) => (y > 14 && y < 18) ? null : '#66728e');
  s.box(0, 0, 3, 22, 1, 1, (x) => (x % 4 < 2 && !(x > 7 && x < 12)) ? '#7b88a5' : null);
  // Moss.
  for (let i = 0; i < 26; i++) { const x = 1 + Math.floor(hash(i, 1, 0, 6) * 20), y = 1 + Math.floor(hash(i, 2, 0, 6) * 24); if (s.has(x, y, 0) && !s.has(x, y, 1)) s.set(x, y, 0, hash(i, 3, 0, 6) < .5 ? '#5c8f6a' : '#4a7a5c'); }
  // Brick chimney with a pot (back right).
  s.box(15, 2, 1, 5, 4, 12, (x, y, z) => (z % 2 ? x % 3 === 0 : x % 3 === 1) ? '#7a4a44' : '#9c5b4f');
  s.box(14, 1, 13, 7, 6, 1, '#66728e').box(16, 3, 14, 3, 2, 2, '#b06a4f').box(16, 3, 16, 3, 2, 1, '#8c4d3c');
  // Parcels waiting by the edge (front right).
  s.box(14, 20, 1, 5, 5, 3, '#c79a62').box(16, 20, 1, 1, 5, 4, '#f1e3c4').box(14, 22, 1, 5, 1, 4, '#f1e3c4').box(14, 20, 3, 5, 5, 1, '#d8ad75').box(16, 20, 4, 1, 5, 1, '#f1e3c4').box(14, 22, 4, 5, 1, 1, '#f1e3c4');
  s.box(15, 21, 5, 3, 3, 2, '#b98552').box(16, 21, 5, 1, 3, 3, SCARF).box(15, 22, 7, 3, 1, 1, SCARF);

  // ---- neighbouring towers of the sleeping city ----
  block(25, 2, 6, 8, -3, 5, speckle(['#a35a4d', '#8f4c42', '#b3685a'], 4));
  s.box(25, 4, -2, 6, 4, 1, '#a35a4d').box(25, 5, -1, 6, 2, 1, '#b3685a');
  block(24, 17, 7, 8, -7, 7);
  s.box(26, 19, -6, 2, 2, 3, '#66728e').box(26, 19, -3, 2, 2, 1, '#333c57');

  // ---- lantern light pooling on the roof ----
  const cx = 10, lx = cx - 7, ly = 20;
  s.paint(0, 8, -1, 22, 18, 3, (x, y, z, v) => {
    const d = Math.hypot(x - lx, y - ly), t = Math.max(0, 1 - d / 10);
    return t > 0 ? mix(v.c, '#ffbe45', Math.min(.8, t * .95)) : undefined;
  });

  for (let x = lx - 4; x <= lx + 4; x++) for (let y = ly - 4; y <= ly + 4; y++) { const v = s.get(x, y, 0); if (v && Math.hypot(x - lx, y - ly) < 4.3 && !s.has(x, y, 1)) s.set(x, y, 0, mix(v.c, '#ffd66e', .35), {glow: true}); }

  // ---- the courier ----
  // Boots and legs.
  for (const fx of [cx - 4, cx + 1]) s.box(fx, 9, 1, 3, 5, 2, BOOT).box(fx, 13, 2, 3, 1, 1, null).box(fx, 9, 2, 3, 1, 1, LEATHER).box(fx, 9, 3, 3, 3, 3, TUNIC);
  // Cloak body with a flared hem, open at the front over a dark tunic.
  s.box(cx - 5, 8, 6, 10, 6, 8, CLOAK).box(cx - 6, 7, 6, 12, 7, 2, CLOAK_D);
  s.box(cx - 6, 7, 6, 1, 1, 2, null).box(cx + 5, 7, 6, 1, 1, 2, null).box(cx - 5, 8, 6, 1, 1, 8, null).box(cx + 4, 8, 6, 1, 1, 8, null);
  s.box(cx - 2, 13, 6, 4, 1, 8, TUNIC).box(cx - 3, 13, 8, 1, 1, 6, shift(CLOAK, 9)).box(cx + 2, 13, 8, 1, 1, 6, shift(CLOAK, 9));
  s.box(cx - 5, 13, 9, 10, 1, 1, LEATHER).box(cx - 1, 13, 9, 2, 1, 1, BRASS);
  // Satchel strap and satchel on the hip.
  for (let i = 0; i < 5; i++) s.set(cx - 4 + i, 14, 13 - i, LEATHER_D);
  s.box(cx + 1, 14, 6, 4, 2, 4, LEATHER).box(cx + 1, 15, 8, 4, 1, 2, LEATHER_D).set(cx + 2, 15, 8, BRASS).set(cx + 3, 15, 8, BRASS).box(cx + 1, 14, 10, 1, 1, 1, LEATHER_D);
  // Right arm at the side; left arm held out with the lantern.
  s.box(cx + 6, 9, 7, 3, 3, 7, CLOAK).box(cx + 6, 9, 7, 3, 3, 1, shift(CLOAK, 9)).box(cx + 6, 9, 5, 3, 3, 2, LEATHER);
  s.box(cx - 9, 9, 11, 3, 3, 3, CLOAK).box(cx - 9, 12, 10, 3, 6, 3, CLOAK).box(cx - 9, 17, 10, 3, 1, 3, shift(CLOAK, 9)).box(cx - 9, 18, 10, 3, 2, 3, LEATHER);
  // Scarf: a red ring round the neck with a tail in the wind.
  s.box(cx - 5, 7, 13, 10, 8, 3, SCARF).box(cx - 5, 7, 13, 10, 8, 1, SCARF_D);
  s.box(cx - 5, 7, 13, 1, 1, 3, null).box(cx + 4, 7, 13, 1, 1, 3, null).box(cx - 5, 14, 13, 1, 1, 3, null).box(cx + 4, 14, 13, 1, 1, 3, null);
  for (let i = 0; i < 9; i++) s.box(cx - 6 - i, 12, 14 + Math.round(i * .45), 1, 2, i > 6 ? 1 : 2, i % 3 === 1 ? SCARF_D : SCARF);
  // Head: 10-wide face inside the hood.
  const hz = 16, hy = 5;
  s.box(cx - 6, hy, hz, 12, 10, 10, HOOD);
  for (const [x, y] of [[cx - 6, hy], [cx + 5, hy], [cx - 6, hy + 9], [cx + 5, hy + 9]]) s.box(x, y, hz, 1, 1, 10, null);
  s.box(cx - 5, hy + 9, hz, 10, 1, 8, SKIN).box(cx - 5, hy + 9, hz + 7, 10, 1, 1, HAIR);
  s.box(cx - 5, hy + 9, hz, 1, 1, 7, SKIN_L); // lantern rim light on the cheek
  s.set(cx - 5, hy + 9, hz, null).set(cx + 4, hy + 9, hz, null);
  // Hood rim one voxel proud around the face, a soft crown and a drooping peak.
  s.box(cx - 6, hy + 10, hz + 8, 12, 1, 2, HOOD).box(cx - 6, hy + 10, hz + 1, 1, 1, 7, HOOD_D).box(cx + 5, hy + 10, hz + 1, 1, 1, 7, HOOD_D);
  s.box(cx - 5, hy + 1, hz + 10, 10, 9, 1, HOOD).box(cx - 3, hy + 1, hz + 11, 6, 6, 1, HOOD).box(cx - 1, hy, hz + 12, 2, 3, 1, HOOD_D);
  s.box(cx - 1, hy - 2, hz + 9, 2, 3, 3, HOOD_D).box(cx - 1, hy - 3, hz + 7, 2, 2, 3, HOOD_D);
  s.box(cx - 5, hy, hz - 3, 10, 3, 3, HOOD_D); // hood draped over the shoulders at the back
  s.paint(cx - 6, hy, hz, 12, 10, 12, (x, y, z, v) => v.c === HOOD && hash(x, y, z, 5) < .1 ? shift(HOOD, -3) : undefined);
  // Face: eyes with a highlight, brows two rows up, a nose one voxel proud, a small mouth.
  for (const ex of [cx - 3, cx + 1]) {
    s.box(ex, hy + 9, hz + 3, 2, 1, 2, INK).set(ex, hy + 9, hz + 4, '#ffffff').set(ex + 1, hy + 9, hz + 3, '#7a4a2a');
    s.box(ex, hy + 9, hz + 6, 2, 1, 1, HAIR);
  }
  s.set(cx - 4, hy + 9, hz + 6, HAIR).set(cx + 3, hy + 9, hz + 6, HAIR);
  s.set(cx - 1, hy + 10, hz + 2, SKIN_L);
  s.box(cx - 1, hy + 9, hz + 1, 2, 1, 1, '#b8604f');
  s.set(cx - 4, hy + 9, hz + 2, '#f3a98f').set(cx + 3, hy + 9, hz + 2, '#f3a98f');

  // ---- the lantern, hanging from the outstretched hand ----
  const lz = 2;
  s.box(lx - 2, ly - 2, lz, 5, 5, 1, BRASS_D);
  s.box(lx - 1, ly - 1, lz + 1, 3, 3, 5, '#ffd257', {glow: true}).box(lx, ly, lz + 2, 1, 2, 3, '#fff6d0', {glow: true}).box(lx - 1, ly + 1, lz + 2, 2, 1, 3, '#fff0b0', {glow: true});
  for (const [x, y] of [[lx - 2, ly - 2], [lx + 2, ly - 2], [lx - 2, ly + 2], [lx + 2, ly + 2]]) s.box(x, y, lz + 1, 1, 1, 5, BRASS);
  s.box(lx - 2, ly - 2, lz + 6, 5, 5, 1, BRASS).box(lx - 1, ly - 1, lz + 7, 3, 3, 1, BRASS_D).box(lx, ly - 1, lz + 8, 1, 1, 1, '#3a3340');
}
