// Ball Run: a striped ball rolling down a neon-edged track that drops from a high start gate round two corners.
export default function build(s, {C, island, speckle, hash, shift}) {
  const PINK = '#ff5fb0', HOT = '#ffa0dc', TRACK = '#3d4570', UNDER = '#1f2547', CYAN = '#3fe0d0', GOLD = '#ffd23f';
  const BALL = '#8a5ae8', BALLL = '#b79aff', BALLD = '#6a3fd0', BAND = '#ffd23f';
  const G = {glow: true};
  const N = 34, W = 12, F = N - W; // F: where the far legs end and the near strip begins

  // Base: a dark arena slab with a faint grid.
  island(s, 0, 0, N, N, (x, y) => x % 6 === 0 || y % 6 === 0 ? '#3b4380' : '#2a3060', speckle(['#171b3c', '#1c2147'], 2), 3, 0, 1);

  // Track heights. Leg A runs +y down the far-left edge, leg B runs +x along the near-left edge,
  // leg C runs back along -y down the right edge to the floor.
  const hA = y => 21 - Math.floor(y * 7 / F), hB = x => 14 - Math.floor((x - W) * 6 / (F - W)), hC = y => 2 + Math.floor(y * 6 / F);
  const cell = (x, y, h, edge) => {
    s.set(x, y, h, edge ? '#232949' : TRACK).set(x, y, h - 1, UNDER);
    if (edge) s.set(x, y, h + 1, PINK, G);
  };
  for (let y = 0; y < F; y++) for (let x = 0; x < W; x++) cell(x, y, hA(y), x === 0 || x === W - 1);
  for (let y = F; y < N; y++) for (let x = 0; x < W; x++) cell(x, y, 14, x === 0 || y === N - 1);
  for (let x = W; x < F; x++) for (let y = F; y < N; y++) cell(x, y, hB(x), y === F || y === N - 1);
  for (let x = F; x < N; x++) for (let y = F; y < N; y++) cell(x, y, 8, x === N - 1 || y === N - 1);
  for (let y = 0; y < F; y++) for (let x = F; x < N; x++) cell(x, y, hC(y), x === F || x === N - 1);
  // Glowing centre dashes.
  for (let y = 2; y < F; y += 5) s.box(5, y, hA(y), 2, 1, 1, HOT, G).box(5, y + 1, hA(y + 1), 2, 1, 1, HOT, G);
  for (let y = 1; y < F; y += 5) s.box(F + 5, y, hC(y), 2, 1, 1, HOT, G).box(F + 5, y + 1, hC(y + 1), 2, 1, 1, HOT, G);
  s.box(3, F + 5, 14, 5, 2, 1, HOT, G).box(F + 5, F + 2, 8, 2, 5, 1, HOT, G);

  // Pillars with cyan bands.
  const pillar = (x, y, top) => { for (let z = 1; z < top; z++) s.box(x, y, z, 2, 2, 1, z % 5 === 3 ? CYAN : '#2c3566', z % 5 === 3 ? G : undefined); };
  pillar(5, 2, hA(3) - 1); pillar(5, 13, hA(14) - 1); pillar(5, F + 5, 13); pillar(F + 5, F + 5, 7); pillar(F + 5, 10, hC(10) - 1);

  // Start gate at the top of the run.
  s.box(0, 0, hA(0) + 1, 1, 1, 9, C.white).box(W - 1, 0, hA(0) + 1, 1, 1, 9, C.white);
  s.box(0, 0, hA(0) + 8, W, 1, 3, (x, y, z) => (x + z) % 2 ? C.white : C.ink);

  // Obstacles: cyan blocks and gold spikes.
  const block = (x, y, z, w, d, h) => { s.box(x, y, z, w, d, h, '#25b6a6').box(x, y, z + h - 1, w, d, 1, CYAN).box(x + 1, y + d - 1, z + 1, w - 2, 1, h - 2, '#178a80'); };
  const spike = (x, y, z) => { s.box(x, y, z, 3, 3, 1, '#d99c1a').box(x, y, z + 1, 2, 2, 1, GOLD).set(x + 1, y + 1, z + 1, GOLD).set(x + 1, y + 1, z + 2, GOLD).set(x + 1, y + 1, z + 3, '#fff2a8'); };
  block(2, 6, hA(6) + 1, 5, 3, 5);
  spike(7, 13, hA(14) + 1);
  spike(2, F + 8, 15);
  block(F + 6, F + 2, 9, 4, 4, 5);
  spike(F + 2, 12, hC(12) + 1); spike(F + 6, 12, hC(12) + 1);
  block(F + 6, 3, hC(3) + 1, 4, 3, 4);

  // Gold gems hovering over the middle of the arena.
  const gem = (x, y, z) => { s.box(x, y, z, 2, 2, 2, GOLD, G).set(x, y, z - 1, '#ffb52e', G).set(x, y, z + 2, '#fff2a8', G); };
  gem(16, 6, 4); gem(16, 14, 4);

  // The ball, with a gold band and a highlight.
  const bx = 17, by = F + 6, r = 7, bz = hB(17) + 1 + r;
  s.ball(bx, by, bz, r, (x, y, z) => {
    const dx = x + .5 - bx, dy = y + .5 - by, dz = z + .5 - bz;
    const band = dz * .95 + dx * .3;
    if (Math.abs(band) < 1.5) return BAND;
    if (Math.abs(band) < 2.5) return BALLD;
    if (dz > 3.2 && dx < 0 && dx > -3.2 && dy > .5 && dy < 3.7) return BALLL;
    return BALL;
  });
}
