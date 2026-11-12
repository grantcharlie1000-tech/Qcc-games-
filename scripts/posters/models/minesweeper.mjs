// Minesweeper: a 4x4 field of raised covered tiles and sunken numbered cells, flags at the back, a spiky mine in its crater.
export default function build(s, {C, hash, shift, speckle}) {
  const T = 6, P = 10, N = 4, W = N * P + 1; // T: z of the revealed floor, P: cell pitch (9 tile + 1 seam)
  const o = i => 1 + i * P;
  const INK = {1: '#2f6fe6', 2: '#2a9d4a', 3: '#e23a44'}, TILE = '#a7b4cc';

  // Board body: navy foot, dark slab, seam layer.
  s.box(1, 1, 0, W - 2, W - 2, 3, speckle(['#283a6e', '#2d4079'], 1, [4, 1]));
  s.box(0, 0, 3, W, W, 3, speckle(['#222a40', '#262f47'], 2, [4, 1]));
  s.box(0, 0, T, W, W, 1, '#c9b388');

  const map = ['UFU2', 'FUU3', 'UUM1', '2311'];
  const digit = {
    1: ['..##.', '.###.', '..##.', '..##.', '..##.', '..##.', '.####'],
    2: ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '#####'],
    3: ['####.', '...##', '...##', '.###.', '...##', '...##', '####.'],
  };
  const flag = (x, y, z) => {
    s.box(x - 1, y - 1, z, 3, 3, 1, C.ink).box(x, y, z + 1, 1, 1, 13, '#2f2a44').set(x, y, z + 14, C.yellow);
    s.sprite(['##.....', '####...', '######.', '#######', '######.', '####...', '##.....'], {'#': '#f0454e'}, [x + 1, y, z + 7], 'xz', 1);
    s.box(x + 1, y, z + 10, 2, 1, 2, '#ff8a8e'); // sheen near the pole
  };

  map.forEach((row, j) => [...row].forEach((ch, i) => {
    const x0 = o(i), y0 = o(j);
    if (ch === 'U' || ch === 'F') {
      // Raised, bevelled covered tile.
      s.box(x0, y0, T, 9, 9, 4, (x, y, z) => z === T ? shift(TILE, -14) : shift(TILE, -6));
      s.box(x0, y0, T + 4, 9, 9, 1, (x, y) => {
        const e = Math.min(x - x0, y - y0, x0 + 8 - x, y0 + 8 - y);
        return e === 0 ? '#e3e9f4' : e === 1 ? shift(TILE, 4) : hash(x, y, 3) < .1 ? shift(TILE, -2) : TILE;
      });
      if (ch === 'F') flag(x0 + 4, y0 + 4, T + 5);
      return;
    }
    // Sunken revealed cell in pale cream; the mine's cell is a scorched red crater.
    const cream = (i + j) % 2 ? '#f8edd6' : '#fff8e8';
    s.box(x0, y0, T, 9, 9, 1, ch === 'M' ? (x, y) => Math.hypot(x - x0 - 4, y - y0 - 4) < 3.6 ? '#8f2532' : '#e8474f' : cream);
    // Bold flat numeral inlaid in the cell top, reading along +x.
    if (digit[ch]) s.sprite(digit[ch], {'#': INK[ch]}, [x0 + 2, y0 + 1, T], 'xy', 1);
  }));

  // The mine sitting in its crater.
  const mx = o(2) + 4, my = o(2) + 4, R = 5.5, mz = T + 6;
  const BODY = '#2e3154', CAP = '#4a5088', SP = '#2e3154', TIP = '#9aa0cc';
  s.ball(mx + .5, my + .5, mz + .5, R, (x, y, z) => {
    const dz = z - mz, lit = (y - my) - (x - mx) + dz * 2;
    return lit > 9 ? CAP : dz < -2 ? shift(BODY, -6) : BODY;
  });
  for (const [dx, dy, dz] of [[0, 0, 1], [1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 1, 0], [.7, -.7, 0], [-.7, .7, 0], [.7, 0, .7], [-.7, 0, .7], [0, .7, .7], [0, -.7, .7]]) {
    const at = k => [Math.round(mx + dx * k), Math.round(my + dy * k), Math.round(mz + dz * k)];
    s.line(at(R - 1), at(R + 1), SP).set(...at(R + 2), TIP);
  }
  s.box(mx - 2, my + 1, mz + 5, 2, 1, 1, '#ffffff').set(mx - 1, my + 2, mz + 5, '#ffffff');
  const face = (u, dz, c) => { // frontmost voxel of the ball on screen column u
    for (let k = 14; k >= 0; k--) {
      if ((k - u) % 2) continue;
      const x = mx + (k + u) / 2, y = my + (k - u) / 2;
      if (s.has(x, y, mz + dz)) { s.set(x, y, mz + dz, c); return; }
    }
  };
  for (const side of [-1, 1]) for (let i = 1; i <= 4; i++) for (let k = -1; k <= 2; k++) {
    if (i === 4 && (k === -1 || k === 2)) continue;
    face(side * i, k, (i === 2 || i === 3) && k <= 1 && k >= 0 ? '#14121c' : '#ffffff');
  }
  face(0, -3, '#e8474f'); face(-1, -3, '#14121c'); face(1, -3, '#14121c');
}
