// Drift Club: a shuffleboard court on a harbour pier, pucks gliding to the bullseye under a striped lighthouse.
export default function build(s, {C, hash, shift}) {
  const W = 38, D = 40;
  const coral = '#f2665f', blue = '#3f9be6';
  // ---------- sea ----------
  const sea = (x, y) => hash(x >> 2, y, 0, 1) < .1 ? '#7fe0dc' : (x + y * 2 + (hash(x >> 3, y >> 2, 0, 2) * 4 | 0)) % 9 === 0 ? '#3cc4c4' : '#22a7b0';
  for (let x = 0; x < W; x++) for (let y = 0; y < D; y++) {
    s.set(x, y, 0, sea).box(x, y, -3, 1, 1, 3, '#178a96');
    if (Math.min(x, y, W - 1 - x, D - 1 - y) > 2 && hash(x >> 1, y >> 1, 0, 3) < .7) s.set(x, y, -4, '#12707c');
  }

  // ---------- pier deck on pilings ----------
  const px0 = 2, pw = 24, dz = 5; // deck top surface at z = dz
  for (let y = 2; y < D; y += 9) for (const x of [px0, px0 + pw - 2]) s.box(x, y, 1, 2, 2, dz - 2, (a, b, z) => z === 1 ? C.brown : C.dkwood);
  s.box(px0, 0, dz - 1, pw, D, 1, C.dkwood);
  s.box(px0, 0, dz, pw, D, 1, (x, y) => y % 4 === 3 ? C.dkwood : hash(x >> 2, y >> 2, 0, 4) < .3 ? C.ltwood : C.wood);

  // ---------- the court ----------
  const bx0 = px0 + 3, bw = 18, by0 = 1, bl = D - 3, bz = dz + 1, mx = bx0 + bw / 2;
  s.box(bx0, by0, bz, bw, bl, 1, (x, y) => ((x - bx0) >> 1) % 2 ? '#f3e2c2' : '#fcf6e8');
  // Scoring lines across the court.
  for (const y of [by0 + 5, by0 + 11]) s.box(bx0, y, bz, bw, 1, 1, C.teal);
  // Bullseye near the front end.
  const tcy = by0 + 23;
  for (let x = bx0; x < bx0 + bw; x++) for (let y = by0; y < by0 + bl; y++) {
    const d = Math.hypot(x + .5 - mx, y + .5 - tcy);
    const c = d < 1.8 ? C.yellow : d < 4 ? '#25b6a6' : d < 6.3 ? '#fcf6e8' : d < 8.7 ? coral : null;
    if (c) s.set(x, y, bz, c);
  }
  // Teal gutters with mint posts.
  for (const x of [bx0 - 2, bx0 + bw]) {
    const h = x < bx0 ? 2 : 1; // the near rail is kept low so it does not hide the court
    s.box(x, by0, bz, 2, bl, h, C.teal);
    for (let y = by0; y < by0 + bl; y += 6) s.box(x, y, bz, 2, 2, h + 1, C.mint).box(x, y, bz + h + 1, 2, 2, 1, '#d9f3e4');
  }
  s.box(bx0 - 2, by0 - 1, bz, bw + 4, 2, 2, C.teal).box(bx0 - 2, by0 - 1, bz + 2, bw + 4, 2, 1, C.mint);

  // ---------- pucks ----------
  const puck = (x, y, c) => {
    s.cyl(x, y, bz + 1, 2.6, 1, shift(c, -12)).cyl(x, y, bz + 2, 2.6, 1, c);
    s.box(x - 1, y - 1, bz + 2, 2, 2, 1, C.white);
  };
  puck(mx + 4, tcy - 2, coral);    // closest to the bullseye
  puck(mx - 5, tcy + 6, blue);
  puck(mx + 5, tcy + 11, coral);
  puck(mx - 3, tcy - 12, blue);
  puck(mx + 2, by0 + 5, coral);    // still gliding in, with a speed trail
  for (let k = 0; k < 3; k++) s.box(mx - 1 + k * 2, by0 + 1, bz, 1, 2 - k % 2, 1, '#f8b9a6');

  // ---------- lighthouse on a rock ----------
  const lx = 31, ly = 8;
  const rock = (x, y, z) => hash(x, y, z, 5) < .2 ? C.dkstone : hash(x, y, z, 6) < .18 ? C.ltstone : C.stone;
  s.ellipsoid(lx, ly, 0, 6.6, 7.4, 4.2, rock);
  s.box(lx - 7, ly - 8, -6, 15, 17, 6, null);
  for (let x = lx - 7; x < lx + 7; x++) for (let y = ly - 8; y < ly + 8; y++) if (s.has(x, y, 1) && x < W) { s.set(x, y, 0, rock); } // rock foot replaces the sea
  for (let x = lx - 8; x < lx + 8; x++) for (let y = ly - 9; y < ly + 9; y++) if (x >= 0 && x < W && y >= 0 && s.has(x, y, 0) && !s.has(x, y, 1) && (s.has(x + 1, y, 1) || s.has(x - 1, y, 1) || s.has(x, y + 1, 1) || s.has(x, y - 1, 1))) s.set(x, y, 0, C.white); // foam
  const tz = 4;
  for (let k = 0; k < 24; k++) {
    const r = 4.6 - k * .055, band = (k >> 2) % 2;
    s.cyl(lx, ly, tz + k, r, 1, band ? C.white : C.red);
  }
  s.cyl(lx, ly, tz, 5.2, 1, C.dkstone);
  // Door and windows on the lit side.
  s.box(lx - 1, ly + 4, tz + 1, 2, 1, 4, C.navy).set(lx - 1, ly + 4, tz + 3, C.yellow);
  s.box(lx - 1, ly + 3, tz + 10, 2, 1, 2, C.navy).box(lx - 1, ly + 3, tz + 18, 2, 1, 2, C.navy);
  // Gallery, lamp room and roof.
  s.cyl(lx, ly, tz + 24, 5.6, 1, C.navy);
  for (let a = 0; a < 360; a += 30) s.set(Math.floor(lx + Math.cos(a * Math.PI / 180) * 5), Math.floor(ly + Math.sin(a * Math.PI / 180) * 5), tz + 25, C.navy);
  s.cyl(lx, ly, tz + 25, 3.1, 4, '#ffe680', 'z', {glow: true});
  for (let a = 0; a < 360; a += 60) { const x = Math.floor(lx + Math.cos(a * Math.PI / 180) * 2.8), y = Math.floor(ly + Math.sin(a * Math.PI / 180) * 2.8); s.box(x, y, tz + 25, 1, 1, 4, C.navy); }
  s.cyl(lx, ly, tz + 29, 4.2, 1, C.red).cyl(lx, ly, tz + 30, 3.2, 1, C.red).cyl(lx, ly, tz + 31, 2.2, 1, C.dkred).cyl(lx, ly, tz + 32, 1.2, 1, C.dkred);
  s.box(lx - 1, ly - 1, tz + 33, 1, 1, 2, C.gold);

  // ---------- harbour props ----------
  // Bollard with a rope coil on the pier's far end, and a ring buoy hung on the rail.
  s.cyl(px0 + pw - 1, 3, dz + 1, 1.6, 3, C.navy).cyl(px0 + pw - 1, 3, dz + 4, 2.2, 1, C.dark);
  // Channel buoy bobbing in the water near the front.
  const qx = 32, qy = 31;
  s.cyl(qx, qy, 1, 2.6, 2, C.red).cyl(qx, qy, 3, 2, 1, C.white).cyl(qx, qy, 4, 1.4, 2, C.red);
  s.box(qx - 1, qy - 1, 6, 1, 1, 3, C.dark).set(qx - 1, qy - 1, 9, C.yellow, {glow: true});
  for (const [x, y] of [[qx - 4, qy], [qx + 2, qy - 1], [qx - 1, qy + 3], [qx - 1, qy - 4]]) if (x < W) s.set(x, y, 0, C.white);
  // A second small buoy and a gull post.
  s.cyl(32, 21, 1, 1.6, 2, '#ffb52e').set(31, 20, 3, C.white);
  // Club pennant on a mast at the front corner of the pier.
  const fx = px0 + 1, fy = D - 3;
  s.box(fx, fy, dz + 1, 1, 1, 21, C.white).set(fx, fy, dz + 22, C.gold);
  for (let k = 0; k < 9; k++) s.box(fx + 1 + k, fy, dz + 15 + Math.ceil(k / 3), 1, 1, 7 - Math.ceil(k * 2 / 3), k % 4 < 2 ? coral : C.white);
  // Festoon lights strung from the mast to the lighthouse gallery.
  const bulbs = [coral, C.yellow, '#8ff0d0', '#8fd0f5'];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40, x = Math.round(fx + (lx - 4 - fx) * u), y = Math.round(fy + (ly + 3 - fy) * u), z = Math.round(dz + 22 + 6 * u - 22 * u * (1 - u));
    s.set(x, y, z, '#4f7f86', {noshadow: true});
    if (i % 4 === 2) s.box(x, y, z - 2, 1, 1, 2, bulbs[(i >> 2) % 4], {glow: true});
  }
}
