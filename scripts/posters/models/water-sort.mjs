// Water Sort: three round glass tubes of banded water on a wooden rack, with a fourth tube tipped in mid pour.
export default function build(s, {C, speckle, shift}) {
  const BLUE = '#3f7ee8', PINK = '#f05fa6', YEL = '#f7c531', TEAL = '#25c9b4', GLASS = '#dff3ff';
  const R = 5, LEN = 21, BAND = 5;

  // Rack: a chunky bevelled plank with a pale rim, plank seams and a dark cup under each tube.
  const wood = speckle([C.wood, '#a87240', C.ltwood], 1, [5, 3, 1]);
  const dk = speckle([C.dkwood, '#6e4526'], 2);
  s.box(-2, 0, 0, 44, 16, 2, dk).box(-1, 1, 2, 42, 14, 1, wood);
  s.box(-2, 0, 2, 44, 1, 1, C.ltwood).box(-2, 15, 2, 44, 1, 1, C.ltwood).box(-2, 0, 2, 1, 16, 1, C.ltwood).box(41, 0, 2, 1, 16, 1, C.ltwood);
  for (let x = 3; x < 40; x += 6) s.box(x, 1, 2, 1, 14, 1, '#9a6838'); // plank seams

  // Generic glass tube: closed round end at `b`, running `len` along unit vector d, radius R.
  // water(t, q, x, y, z) returns a colour for interior voxels, or nothing for air.
  const tube = (b, d, len, water, hi) => {
    const lo = [0, 1, 2].map(i => Math.floor(Math.min(b[i], b[i] + d[i] * len) - R - 2));
    const up = [0, 1, 2].map(i => Math.ceil(Math.max(b[i], b[i] + d[i] * len) + R + 2));
    for (let x = lo[0]; x < up[0]; x++) for (let y = lo[1]; y < up[1]; y++) for (let z = lo[2]; z < up[2]; z++) {
      const p = [x + .5 - b[0], y + .5 - b[1], z + .5 - b[2]];
      const t = p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
      if (t > len) continue;
      const q = p.map((v, i) => v - t * d[i]);
      const rr = t < 0 ? Math.hypot(...p) : Math.hypot(...q);
      if (rr > R) { if (t > len - 1 && rr <= R + 1) s.set(x, y, z, C.white); continue; }
      if (rr > R - 1.15) {
        const h = hi(t, q);
        s.set(x, y, z, h ? '#ffffff' : GLASS, {alpha: h ? .9 : t > len - 1 ? .7 : Math.abs(q[0] - q[1]) > R * 1.41 - 2.2 ? .5 : .24});
        continue;
      }
      const c = water(t, q, x, y, z);
      if (c) s.set(x, y, z, c);
    }
  };

  // Standing tubes.
  const stand = (cx, bands, fill) => {
    s.cyl(cx, 8, 3, 6.3, 2, C.dkwood).cyl(cx, 8, 5, 6.3, 1, '#c89058');
    tube([cx, 8, 3 + R], [0, 0, 1], LEN, (t, q, x, y, z) => {
      const h = t + R - .5; if (h >= fill) return;
      const c = bands[Math.min(bands.length - 1, Math.floor(h / BAND))];
      if (h >= fill - 1) return shift(c, 12, 5); // bright surface
      return (Math.floor(h) % BAND === BAND - 1 && h < fill - 2) ? shift(c, -7) : c;
    }, (t, q) => q[1] > 2 && q[0] < -1 && q[0] > -2 && ((t > 1 && t < 12) || (t > 14 && t < 18)));
  };
  stand(7, [BLUE, PINK, YEL, BLUE], 20);
  stand(20, [YEL, TEAL, TEAL], 13);
  stand(33, [TEAL, PINK, BLUE, YEL], 20);

  // Pouring tube, tipped over the middle tube with its mouth low.
  const d = [.87, 0, -.5], n = [-.5, 0, -.87];
  const M = [22.5, 8, 37.5], PL = 17;
  tube([M[0] - d[0] * PL, 8, M[2] - d[2] * PL], d, PL, (t, q, x, y, z) => {
    const depth = q[0] * n[0] + q[2] * n[2];
    if (depth < 0) return;
    const c = t < 7 ? PINK : TEAL;
    return c;
  }, (t, q) => q[1] > 3 && q[0] * n[0] + q[2] * n[2] < -1.2 && q[0] * n[0] + q[2] * n[2] > -2.6 && t > 1 && t < 12);

  // The stream falling into the middle tube, with a splash.
  for (let z = 16; z < 34; z++) s.box(19, 7, z, 2, 2, 1, (x, y) => (x === 19 && y === 8) ? shift(TEAL, 14, 5) : TEAL);
  s.box(18, 6, 16, 4, 4, 1, shift(TEAL, 12, 5)).box(18, 7, 17, 1, 1, 1, shift(TEAL, 16)).box(21, 8, 17, 1, 1, 2, shift(TEAL, 16));

  // Props: a cork stopper and spilled drops on the rack.
  s.cyl(13, 13, 3, 1.6, 2, C.sand).cyl(13, 13, 5, 2.1, 1, C.dksand);
  s.box(26, 12, 3, 3, 2, 1, TEAL).box(27, 13, 3, 2, 2, 1, TEAL).set(27, 12, 3, shift(TEAL, 16)).box(30, 14, 3, 1, 1, 1, TEAL);
}
