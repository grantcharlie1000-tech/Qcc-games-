// Globle: a desk globe on a brass stand. Land is cream, guessed countries run cream to deep red, the found one is green.
export default function build(s, {C, hash, shift}) {
  const R = 18, cx = 0, cy = 0, cz = 31;
  // Coastlines as compact lon/lat polygons (degrees), drawn by hand.
  const LAND = [
    [-17,21,-16,12,-12,5,-5,5,4,6,9,4,9,-1,13,-6,12,-17,15,-27,18,-34,26,-34,32,-28,35,-22,40,-15,40,-5,43,0,51,11,44,11,40,16,35,24,32,29,25,30,20,29,11,31,10,34,0,33,-6,33,-10,31], // Africa
    [-9,38,-9,43,-1,43,-4,48,2,51,8,54,8,57,12,56,11,59,5,59,5,62,14,68,25,71,40,67,68,68,80,73,105,77,140,73,180,68,180,65,162,58,156,51,142,54,135,44,128,38,122,31,120,23,108,20,108,11,103,9,100,13,98,16,94,16,90,22,80,15,77,8,72,20,66,25,57,25,52,29,48,30,56,26,59,22,52,16,45,13,37,28,36,38,27,39,26,41,22,39,19,42,13,45,18,41,16,40,12,44,8,44,3,43,0,40,-5,38], // Eurasia
    [-5,50,1,51,1,53,-2,56,-3,58,-6,58,-5,54,-3,53,-5,52], [-10,52,-6,52,-6,55,-10,54], [-24,64,-14,64,-14,66,-23,66], // Britain, Ireland, Iceland
    [-45,60,-52,65,-55,70,-68,76,-60,82,-30,83,-18,76,-22,70,-40,65], [44,-25,47,-25,50,-15,49,-12,44,-17], // Greenland, Madagascar
    [-168,66,-160,58,-150,60,-135,58,-125,48,-124,40,-117,33,-110,23,-105,20,-97,16,-92,15,-88,16,-83,9,-78,8,-83,12,-88,21,-97,22,-97,28,-90,30,-83,29,-80,25,-81,31,-75,35,-70,42,-65,44,-60,46,-65,49,-56,52,-62,58,-78,58,-80,52,-94,58,-82,68,-95,72,-125,70,-156,71], // North America
    [-78,8,-72,12,-62,10,-50,0,-35,-6,-39,-15,-48,-25,-58,-38,-65,-42,-68,-53,-74,-50,-72,-35,-70,-18,-80,-5,-78,3], // South America
    [114,-22,114,-34,130,-32,138,-35,146,-39,153,-28,146,-19,142,-11,136,-12,130,-12], // Australia
  ];
  const SEA = [[28,41,41,41,41,46,30,46], [48,37,54,37,54,46,47,46], [16,54,22,54,24,60,30,60,24,65,18,60]]; // Black, Caspian, Baltic
  // Guessed countries as lon/lat boxes clipped to land: [lon0, lat0, lon1, lat1, colour].
  const HOT = ['#f7d9a8', '#f6b56b', '#ee8245', '#e24f45', '#b3263a'];
  const GUESS = [
    [-9, 36, 3, 44, HOT[0]], [-5, 43, 8, 51, HOT[1]], [6, 47, 15, 55, HOT[0]], [26, 37, 44, 42, HOT[2]],
    [-8, 19, 10, 37, HOT[1]], [10, 20, 25, 33, HOT[3]], [25, 22, 36, 32, HOT[4]], [22, 9, 37, 22, C.green],
    [36, 16, 56, 30, HOT[2]], [3, 4, 14, 13, HOT[1]], [13, -12, 30, 4, HOT[0]], [34, 4, 48, 14, HOT[3]],
    [-74, -33, -35, 4, HOT[0]], [68, 8, 88, 30, HOT[1]],
  ];
  const inside = (p, lon, lat) => {
    let c = false;
    for (let i = 0, n = p.length / 2, j = n - 1; i < n; j = i++) {
      const xi = p[i * 2], yi = p[i * 2 + 1], xj = p[j * 2], yj = p[j * 2 + 1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  // Globe orientation: tilted axis, with lon 17E turned towards the viewer.
  const norm = v => { const m = Math.hypot(...v); return v.map(a => a / m); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const N = norm([-.36, -.04, 1]), V = norm([1, 1, 1]);
  const E1 = norm(V.map((a, i) => a - dot(V, N) * N[i]));
  const E2 = [E1[1] * N[2] - E1[2] * N[1], E1[2] * N[0] - E1[0] * N[2], E1[0] * N[1] - E1[1] * N[0]];
  const D = Math.PI / 180;
  const geo = d => [((17 + Math.atan2(dot(d, E2), dot(d, E1)) / D + 540) % 360) - 180, Math.asin(Math.max(-1, Math.min(1, dot(d, N)))) / D];

  // ---------- stand ----------
  const wood = (x, y, z) => hash(x >> 2, y, z, 3) < .18 ? shift(C.wood, -5) : C.wood;
  const brass = '#e2ad2e', dkbrass = '#b5811d', ltbrass = '#f6cf55';
  s.cyl(cx, cy, 0, 13, 2, C.dkwood).cyl(cx, cy, 2, 12, 1, wood).cyl(cx, cy, 3, 10, 1, C.ltwood).cyl(cx, cy, 4, 7, 1, wood);
  s.cyl(cx, cy, 5, 4.2, 1, dkbrass).cyl(cx, cy, 6, 2.2, 3, brass).cyl(cx, cy, 9, 3.2, 1, ltbrass);
  // Meridian half ring from pole to pole round the far left side, in the plane of the axis.
  const Wv = norm([-1, 1, 0].map((a, i) => a - dot([-1, 1, 0], N) * N[i]));
  for (let t = -8; t <= 188; t += .6) {
    const a = t * D, d = N.map((n, i) => n * Math.cos(a) + Wv[i] * Math.sin(a));
    for (const r of [R + 2.4, R + 3, R + 3.6]) for (const k of [-.9, -.3, .3, .9]) {
      const q = [cx + d[0] * r + V[0] * k, cy + d[1] * r + V[1] * k, cz + d[2] * r + V[2] * k];
      s.set(Math.floor(q[0]), Math.floor(q[1]), Math.floor(q[2]), brass);
    }
  }
  // Axis pins and the finial on the north pole.
  for (const sg of [1, -1]) for (let r = R; r < R + 4.5; r += .5) s.box(Math.floor(cx + N[0] * r * sg), Math.floor(cy + N[1] * r * sg), Math.floor(cz + N[2] * r * sg), 1, 1, 1, ltbrass);
  const np = N.map((n, i) => Math.floor([cx, cy, cz][i] + n * (R + 4.6)));
  s.ball(np[0] + .5, np[1] + .5, np[2] + .5, 1.6, ltbrass);
  // Neck from the ring down to the stand.
  s.cyl(cx, cy, 10, 1.6, 2, brass);

  // ---------- globe ----------
  for (let x = -R - 2; x <= R + 2; x++) for (let y = -R - 2; y <= R + 2; y++) for (let z = -R - 2; z <= R + 2; z++) {
    const p = [x + .5, y + .5, z + .5], m = Math.hypot(...p);
    if (m > R + 1 || m < R - 3) continue;
    const [lon, lat] = geo(p.map(a => a / m));
    let c = null;
    if (lat < -68 + hash(x, y, z, 5) * 5) c = C.white;
    else if (LAND.some(poly => inside(poly, lon, lat)) && !SEA.some(poly => inside(poly, lon, lat))) {
      c = C.cream;
      if (lat > 62 + hash(x, y, z, 7) * 8) c = C.white;
      for (const g of GUESS) if (lon >= g[0] && lon < g[2] && lat >= g[1] && lat < g[3]) c = g[4];
    }
    if (c) s.set(cx + x, cy + y, cz + z, c);
    else if (m <= R) {
      const band = Math.floor((lat + 90) / 9) % 2;
      s.set(cx + x, cy + y, cz + z, hash(x >> 1, y >> 1, z, 9) < .08 ? '#62b4ee' : band ? '#3f9be0' : '#3890d8');
    }
  }
}
