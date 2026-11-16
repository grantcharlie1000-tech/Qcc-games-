// Downloads: a chunky phone on a floating stone plinth, its screen showing a tiny platformer, with a big
// yellow arrow and a trail of game cubes dropping into it and a little aeroplane passing by (offline play).
export default function build(s, {C, hash, shift, mix, speckle}) {
  const G = {glow: true}, NS = {noshadow: true};
  const CX = 21, CY = 21, R = 20.5, N = 42;
  const rad = (x, y) => Math.hypot(x + .5 - CX, y + .5 - CY);

  // ---------- floating plinth: paved top, carved stone rim, ragged rock underneath ----------
  const PAVE = '#ead9b4', PAVE_L = '#f3e6c8', JOINT = '#c5ac7c', RIM = '#aab3c4', RIM_D = '#8791a6';
  const rock = speckle(['#6f6a86', '#625d7a', '#7d7896'], 2, [5, 3, 2]);
  const earth = speckle([C.dirt, C.dkdirt, '#a56d43'], 3, [5, 2, 2]);
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
    const r = rad(x, y); if (r > R) continue;
    const joint = x % 6 === 0 || (y + (Math.floor(x / 6) % 2) * 3) % 6 === 0;
    s.set(x, y, 0, r > R - 2 ? (hash(x, y, 0, 1) < .2 ? RIM_D : RIM) : joint ? JOINT : hash(Math.floor(x / 6), Math.floor((y + (Math.floor(x / 6) % 2) * 3) / 6), 0, 4) < .3 ? PAVE_L : PAVE);
    const dep = Math.max(2, Math.round(6 * (1 - (r / R) ** 2) + 3 + hash(x >> 1, y >> 1, 0, 5) * 3 - 1.5));
    for (let k = 1; k <= dep; k++) {
      const z = -k;
      s.set(x, y, z, k === 1 ? RIM_D : k === 2 ? (((x + y) >> 1) % 3 === 0 ? '#6f7a90' : RIM_D) : k < 5 + hash(x >> 2, y >> 2, 0, 6) * 3 ? earth : rock);
    }
  }
  // Crystals glinting in the rock, on both visible faces.
  for (let i = 0; i < 22; i++) {
    const a = hash(i, 1, 0, 7) * Math.PI * .9 - .2, r = 8 + hash(i, 2, 0, 7) * 10;
    const x = Math.round(CX + Math.cos(a) * r), y = Math.round(CY + Math.sin(a) * r);
    for (let z = -5; z > -20; z--) if (s.has(x, y, z) && (!s.has(x, y + 1, z) || !s.has(x + 1, y, z))) {
      const c = [C.sky, C.teal, C.pink][i % 3];
      s.set(x, y, z, c, G); if (s.has(x, y, z - 1)) s.set(x, y, z - 1, shift(c, -12), G);
      break;
    }
  }
  // Grass tufts and tiny flowers on the rim.
  for (let i = 0; i < 52; i++) {
    const a = hash(i, 1, 0, 8) * Math.PI * 2, r = R - 1.2 - hash(i, 2, 0, 8) * 1.2;
    const x = Math.floor(CX + Math.cos(a) * r), y = Math.floor(CY + Math.sin(a) * r);
    if (!s.has(x, y, 0) || s.has(x, y, 1)) continue;
    s.set(x, y, 1, hash(i, 3, 0, 8) < .5 ? C.ltgrass : C.grass);
    if (hash(i, 4, 0, 8) < .3) s.set(x, y, 2, [C.pink, C.white, C.red][i % 3]);
  }

  // ---------- dais and phone ----------
  const PX = 12, PW = 18, PY = 19, PZ = 2, PH = 26; // phone: x 12..29, y 19..21, z 2..27
  s.box(PX - 2, PY - 2, 1, PW + 4, 7, 1, (x, y) => (x === PX - 2 || x === PX + PW + 1 || y === PY - 2 || y === PY + 4) ? '#8791a6' : '#b9c1d0');
  for (let x = PX - 1; x < PX + PW + 1; x += 3) s.set(x, PY + 4, 1, C.yellow, G);
  const SHELL = '#eef1f7', SHELL_D = '#cfd6e4', BEZEL = '#23263a';
  s.box(PX, PY, PZ, PW, 2, PH, SHELL).box(PX, PY + 2, PZ, PW, 1, PH, BEZEL);
  s.box(PX, PY + 1, PZ, PW, 1, PH, (x, y, z) => (x === PX || x === PX + PW - 1 || z === PZ || z === PZ + PH - 1) ? SHELL_D : undefined);
  for (const x of [PX, PX + PW - 1]) for (const z of [PZ, PZ + PH - 1]) s.box(x, PY, z, 1, 3, 1, null); // rounded corners
  s.box(PX + PW, PY + 1, PZ + 18, 1, 1, 4, '#9aa3b8').box(PX + PW, PY + 1, PZ + 13, 1, 1, 3, '#9aa3b8'); // side buttons
  // The screen: a tiny platformer, drawn pixel by pixel and unlit so it glows.
  const SCREEN = [
    'SSSSSSSSSYYYSS',
    'SSWWSSSSSYYYSS',
    'WWWWWSSSSYYYSS',
    'SSSSSSSSSSSSSS',
    'SSSSSSSWWSSSSS',
    'ssssssWWWWssss',
    'ssssssssssssss',
    'sssCssssssssss',
    'ssCcCsssssssss',
    'sssCsssssssCss',
    'PPPPPPssssCcCC',
    'ddddddsssssCss',
    'ttttttRRRttttt',
    'tttttRRRRRtttt',
    'tttttFKFKFtHHH',
    'HHtttFFFFFHHHH',
    'HHHttBBBBBHHHH',
    'HHHHtBtttBHhHH',
    'GGGGGGGGGGGGGG',
    'ggGgGGgGgGGgGG',
    'DDDDDDDDDDDDDD',
    'DDdDDdDDDdDDdd',
  ];
  const SP = {S: '#4fb4ee', s: '#74c8f4', t: '#9adaf8', Y: '#ffd84a', W: '#ffffff', C: '#f7c531', c: '#fff0a0', P: '#b07a45', d: '#7a4f2b',
    R: '#e8474f', F: '#fde3cf', K: '#1d1a2c', B: '#3f7ee8', H: '#58b85a', h: '#3f9a3a', G: '#7fd058', g: '#4fb548', D: '#93603a'};
  s.sprite(SCREEN, SP, [PX + 2, PY + 2, PZ + 2], 'xz', 1, G);
  s.box(PX + 7, PY + 2, PZ + PH - 2, 4, 1, 1, '#4a5070'); // speaker slot
  s.box(PX + 6, PY + 2, PZ + 1, 6, 1, 1, '#4a5070'); // home bar

  // ---------- the download arrow, dropping into the top of the phone ----------
  const AZ = PZ + PH + 1, ARROW = C.yellow, A_L = '#ffe07a', A_D = C.dkyellow;
  const arrowRow = (z, w) => { const x0 = CX - w / 2; s.box(x0, PY + 1, z, w, 2, 1, (x, y) => y < PY + 2 ? A_D : (x === x0 || x === x0 + w - 1) ? C.gold : ARROW); };
  for (let k = 0; k < 8; k++) arrowRow(AZ + k, 2 + k * 2);
  for (let k = 8; k < 13; k++) arrowRow(AZ + k, 8);
  s.box(CX - 3, PY + 2, AZ + 5, 1, 1, 7, A_L).box(CX - 6, PY + 2, AZ + 7, 1, 1, 1, A_L).box(CX - 5, PY + 2, AZ + 6, 1, 1, 2, A_L).box(CX - 4, PY + 2, AZ + 5, 1, 1, 3, A_L); // highlight
  for (const [x, z, h] of [[CX - 7, AZ + 9, 3], [CX + 6, AZ + 10, 3], [CX - 9, AZ + 11, 2]]) s.box(x, PY + 1, z, 1, 1, h, '#fff3c4', {glow: true, noshadow: true});

  // ---------- game cubes: a trail falling in from the right, and a stack already on the plinth ----------
  const ICONS = {plus: ['.#.', '###', '.#.'], play: ['#..', '##.', '#..'], gem: ['#.#', '.#.', '#.#'], bars: ['#.#', '#.#', '#.#'], dot: ['###', '#.#', '###']};
  const cube = (x, y, z, c, icon, o) => {
    s.box(x, y, z, 5, 5, 5, c, o).box(x, y, z, 5, 5, 1, shift(c, -9), o).box(x, y, z + 4, 5, 5, 1, (px, py) => (px === x || px === x + 4 || py === y || py === y + 4) ? shift(c, 7) : c, o);
    ICONS[icon].forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') s.set(x + 1 + i, y + 4, z + 3 - j, '#ffffff', o); }));
    s.box(x + 4, y + 1, z + 2, 1, 3, 1, shift(c, -14), o); // label slot on the shaded side
  };
  cube(33, 14, 27, C.pink, 'gem', NS); cube(35, 19, 18, C.teal, 'plus', NS); cube(31, 11, 35, C.purple, 'play', NS);
  for (const [x, y, z] of [[39, 14, 34], [32, 18, 24], [40, 19, 26], [37, 12, 39]]) s.set(x, y, z, '#fff3c4', {glow: true, noshadow: true});
  cube(3, 17, 1, C.red, 'play'); cube(5, 25, 1, C.blue, 'bars'); cube(3, 17, 6, C.orange, 'plus');

  // ---------- a gamepad resting on the plinth (front right) ----------
  const gx = 21, gy = 29, PAD = '#5a6fc4', PAD_D = C.navy;
  s.box(gx, gy, 1, 11, 5, 2, PAD_D).box(gx - 1, gy + 2, 1, 1, 4, 2, PAD_D).box(gx + 11, gy + 2, 1, 1, 4, 2, PAD_D);
  s.box(gx, gy + 5, 1, 3, 1, 2, PAD_D).box(gx + 8, gy + 5, 1, 3, 1, 2, PAD_D);
  s.paint(gx - 1, gy, 2, 13, 6, 1, PAD);
  s.box(gx + 1, gy + 2, 3, 3, 1, 1, C.ink).box(gx + 2, gy + 1, 3, 1, 3, 1, C.ink); // d-pad
  s.set(gx + 8, gy + 1, 3, C.yellow).set(gx + 9, gy + 2, 3, C.red).set(gx + 7, gy + 2, 3, C.sky).set(gx + 8, gy + 3, 3, C.green);
  s.box(gx + 5, gy + 2, 2, 1, 1, 1, C.lilac);

  // ---------- aeroplane passing by (airplane mode), with a puffed trail ----------
  const ax = -1, ay = 27, az = 29, P = NS;
  s.box(ax, ay, az, 13, 3, 3, C.white, P).box(ax, ay, az, 13, 3, 1, C.snow, P);
  s.box(ax + 13, ay, az, 1, 3, 2, C.white, P).box(ax + 14, ay + 1, az, 1, 1, 2, C.snow, P); // nose
  s.box(ax + 12, ay, az + 2, 1, 3, 1, C.navy, P); // windscreen
  for (let x = ax + 3; x < ax + 12; x += 2) s.set(x, ay + 2, az + 2, C.sky, P); // windows
  s.box(ax, ay + 2, az + 1, 12, 1, 1, C.red, P); // cheat line
  s.box(ax + 5, ay - 6, az, 4, 15, 1, C.snow, P).box(ax + 5, ay - 6, az, 4, 1, 1, C.red, P).box(ax + 5, ay + 8, az, 4, 1, 1, C.red, P); // wings
  s.box(ax + 6, ay + 5, az - 1, 3, 2, 1, C.slate, P).box(ax + 6, ay - 4, az - 1, 3, 2, 1, C.slate, P); // engines
  s.box(ax, ay + 1, az + 3, 3, 1, 3, C.red, P).box(ax, ay + 1, az + 5, 2, 1, 1, C.dkred, P).set(ax + 2, ay + 1, az + 5, null); // fin
  s.box(ax, ay - 2, az + 2, 2, 7, 1, C.snow, P); // tailplane
  for (const [d, w] of [[2, 1]]) s.box(ax - d - w, ay + 1, az + 1, w, 1, 1, C.white, P);
}
