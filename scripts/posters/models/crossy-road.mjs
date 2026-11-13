// Crossy Road: a big chicken in a Santa hat and scarf about to hop across a river and a snowy road.
export default function build(s, {C, island, speckle, hash, shift}) {
  const WHITE = '#ffffff', FEATHER = '#eef2f8', HAT = '#e8474f', HATD = '#c93340', SCARF = '#3fae5a', SCARFD = '#2b8a48';
  const snow = speckle(['#dbe7f6', '#e6eefa', '#cfdcf0'], 1, [5, 3, 1]);
  island(s, 0, 0, 32, 32, snow, speckle([C.dirt, C.dkdirt, '#845433'], 2, [4, 2, 2]), 5, 0, 2);

  // Road (y 7..14): asphalt one voxel down between snowy kerbs, with lane dashes.
  s.box(0, 7, 0, 32, 8, 1, null).box(0, 7, -1, 32, 8, 1, speckle([C.asphalt, '#41445a', '#373a4a'], 3, [5, 2, 2]));
  for (let x = 2; x < 32; x += 8) s.box(x, 10, -1, 4, 2, 1, C.cream);
  // River (y 17..22): water two voxels down with pale ripples.
  s.box(0, 17, -1, 32, 6, 2, null).box(0, 17, -2, 32, 6, 1, (x, y) => (x + y * 5) % 11 < 2 ? C.ltblue : hash(x >> 2, y, 4) < .2 ? '#3d93d0' : C.water);
  s.box(0, 17, -1, 32, 1, 1, (x) => hash(x, 0, 0, 6) < .4 ? '#bcd4ee' : undefined); // icy lip on the far bank

  // One car on the road, driving +x, with snow on its roof.
  {
    const x0 = 19, y0 = 8, body = C.blue, dark = C.dkblue;
    s.box(x0, y0, 1, 12, 6, 3, body).box(x0, y0, 1, 12, 6, 1, dark);
    s.box(x0 + 11, y0, 1, 1, 6, 1, C.grey).box(x0, y0, 1, 1, 6, 1, C.grey); // bumpers
    s.box(x0 + 2, y0, 4, 7, 6, 3, body).box(x0 + 2, y0 + 5, 4, 7, 1, 2, C.ink).box(x0 + 8, y0, 4, 1, 6, 2, C.ink);
    s.box(x0 + 3, y0 + 5, 4, 2, 1, 2, C.ltblue).box(x0 + 6, y0 + 5, 4, 2, 1, 2, C.ltblue); // side windows
    s.box(x0 + 8, y0 + 1, 4, 1, 4, 2, C.ltblue); // windscreen
    s.box(x0 + 2, y0, 7, 7, 6, 1, WHITE).box(x0 + 3, y0 + 1, 8, 5, 4, 1, WHITE); // snowy roof
    for (const wx of [x0 + 1, x0 + 8]) s.box(wx, y0 + 5, 0, 3, 1, 2, C.ink).set(wx + 1, y0 + 5, 1, C.grey).box(wx, y0, 0, 3, 1, 1, C.ink);
    s.set(x0 + 11, y0 + 1, 2, C.yellow, {glow: true}).set(x0 + 11, y0 + 4, 2, C.yellow, {glow: true});
    s.box(x0, y0 + 5, 2, 1, 1, 1, C.red);
  }

  // A log and two ice floes on the river.
  s.box(22, 18, -1, 9, 3, 2, (x, y, z) => (x * 3 + z + y) % 5 === 0 ? C.dkwood : C.wood).box(22, 19, 1, 9, 1, 1, C.wood);
  s.box(30, 18, -1, 1, 3, 2, C.ltwood).set(30, 19, 1, C.ltwood).set(30, 19, 0, C.wood).box(23, 19, 1, 3, 1, 1, WHITE);
  s.box(2, 18, -1, 4, 3, 1, '#eaf3fd').box(3, 21, -1, 2, 1, 1, '#eaf3fd').box(8, 20, -1, 3, 2, 1, '#eaf3fd');

  // Pine trees: round tiers with snow on each.
  const pine = (x, y, tiers, r0) => {
    s.box(x - 1, y - 1, 1, 2, 2, 3, C.brown);
    let z = 3;
    const green = (px, py, pz) => hash(px, py, pz, 8) < .3 ? '#35893b' : C.dkgreen;
    for (let t = 0; t < tiers; t++) {
      const r = r0 - t * (r0 - 1.8) / tiers;
      s.cyl(x, y, z, r, 1, green).cyl(x, y, z + 1, r - .9, 1, green).cyl(x, y, z + 2, r - 1.7, 1, WHITE);
      s.cyl(x, y, z + 1, r, 1, (px, py) => s.has(px, py, z + 1) ? undefined : hash(px, py, z, 9) < .45 ? WHITE : undefined);
      z += 3;
    }
    s.box(x - 1, y - 1, z, 2, 2, 1, WHITE);
  };
  pine(27, 3, 4, 5); pine(15, 3, 3, 3.6);
  // A present and snow drifts on the near bank.
  s.ellipsoid(27, 28, .5, 3.5, 3, 1.6, WHITE).ellipsoid(5, 3, .5, 4, 2.5, 1.8, WHITE);
  s.box(1, 25, 1, 5, 5, 4, C.red).box(3, 25, 1, 1, 5, 5, C.yellow).box(1, 27, 1, 5, 1, 5, C.yellow);
  s.box(2, 27, 6, 1, 1, 1, C.yellow).box(4, 27, 6, 1, 1, 1, C.yellow);

  // The chicken, facing the viewer (+y) on the near bank.
  const X = 13.5, Y = 26.5;
  const blob = (cx, cy, cz, rx, ry, rz, c, p = 4) => {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let z = Math.floor(cz - rz); z <= cz + rz; z++)
      if (Math.abs((x + .5 - cx) / rx) ** p + Math.abs((y + .5 - cy) / ry) ** p + Math.abs((z + .5 - cz) / rz) ** p <= 1) s.set(x, y, z, c);
  };
  // Paint or raise a sprite on the +y surface found between y limits.
  const decal = (rows, pal, ox, oz, proud = 0) => rows.forEach((row, j) => [...row].forEach((ch, i) => {
    const c = pal[ch]; if (!c) return;
    const x = ox + i, z = oz + rows.length - 1 - j;
    for (let y = 34; y >= 24; y--) if (s.has(x, y, z)) { if (!proud) s.set(x, y, z, c); for (let k = 1; k <= proud; k++) s.set(x, y + k, z, c); return; }
  }));
  // Feet and short legs, a gap between them.
  for (const fx of [9, 15]) {
    s.box(fx, 27, 1, 3, 4, 1, C.orange).set(fx, 31, 1, C.orange).set(fx + 2, 31, 1, C.orange);
  }
  blob(X, Y - .5, 7.5, 6.5, 4.5, 5.5, (x, y, z) => z < 4 ? FEATHER : WHITE); // body
  s.box(6, 24, 5, 1, 5, 6, FEATHER).box(5, 25, 6, 1, 3, 4, FEATHER); // far wing
  s.box(20, 24, 5, 1, 5, 6, FEATHER).box(21, 25, 6, 1, 3, 4, FEATHER); // near wing
  s.box(11, 20, 9, 5, 2, 5, WHITE).box(12, 19, 11, 3, 1, 4, FEATHER); // tail
  blob(X, Y, 17.5, 5.5, 4.5, 4.5, WHITE); // head
  // Scarf with a hanging end.
  blob(X, Y, 13, 6.2, 5.2, 1, (x, y) => (x + y) % 4 === 0 ? SCARFD : SCARF, 5);
  s.box(17, 31, 8, 2, 1, 5, (x, y, z) => z % 3 === 0 ? SCARFD : SCARF).box(17, 31, 7, 1, 1, 1, SCARFD);
  // Face.
  decal(['KH', 'KK', 'KK'], {K: C.ink, H: WHITE}, 10, 18);
  decal(['KH', 'KK', 'KK'], {K: C.ink, H: WHITE}, 16, 18);
  decal(['PP'], {P: '#ffb0c0'}, 10, 16); decal(['PP'], {P: '#ffb0c0'}, 16, 16);
  s.box(12, 31, 17, 3, 3, 1, C.orange).box(12, 31, 16, 3, 2, 1, C.dkorange); // beak
  s.box(12, 31, 15, 3, 1, 1, C.red).set(13, 31, 14, C.red); // wattle
  // Santa hat: fur brim, a tall cone that leans away to the left, and a pompom hanging from the tip.
  blob(X, Y, 22.5, 6.4, 5.4, 1.5, WHITE, 5);
  for (let k = 0; k < 10; k++) {
    const cx = X - k * k * .085, r = 5 - k * .42;
    s.ellipsoid(cx, Y, 24.5 + k, r, r * .85, .5, k % 3 === 2 ? HATD : HAT);
  }
  s.box(5, 26, 33, 2, 2, 1, HAT).box(3, 26, 31, 2, 2, 3, HAT);
  s.ball(4, 27, 29.5, 2, WHITE);
}
