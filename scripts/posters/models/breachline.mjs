// Breachline: a cutaway office. An Azure attacker steps through a hole blown in the back wall, amber light
// pouring in behind him, while two Ember defenders hold behind an overturned desk. No gore.
export default function build(s, {C, speckle, hash, shift, mix, Scene}) {
  const AZURE = '#3f8cf0', AZURE_D = '#2a63c0', EMBER = '#f58a26', EMBER_D = '#c9661a';
  const WALL = '#d9cfb9', WALL_LO = '#8c9bb0', RAIL = '#6f7d93', WALL_TOP = '#f1e9d8', BRICK = '#b86c52', CONC = '#a39a8d';
  const SKIN = '#f3c9a6', SKIN_D = '#d9a885', INK = '#1d1c28', HAIR = '#3a2c28';
  const UNI_A = '#5870a0', UNI_A_D = '#465a84', VEST_A = '#2f3a54', HELM_A = '#2f3b58', GUN = '#1c1e26', GUN_L = '#6b7386';
  const UNI_E = '#8d8160', UNI_E_D = '#6e6449', VEST_E = '#4b4838', HELM_E = '#6d6c4e', BOOT = '#22232b';
  const AMBER = '#ffb545', WOOD = '#b98450', WOOD_D = '#8a5d36';
  const N = 30, WH = 28, hx = 22;

  // ---- floor: carpet tiles on a slab ----
  s.box(-2, -2, -3, N + 2, N + 2, 2, speckle(['#3b4252', '#333a49'], 1));
  s.box(0, 0, -1, N, N, 2, (x, y, z) => z < 0 ? '#4a5568' : (x % 6 === 5 || y % 6 === 5) ? '#485870' : speckle(['#586a82', '#51637b', '#60728a'], 2, [4, 3, 2])(x, y, z));
  s.box(-2, -2, -1, N + 2, 2, 2, '#4a5568').box(-2, -2, -1, 2, N + 2, 2, '#4a5568');

  // ---- walls ----
  const wallCol = (x, y, z) => z >= WH ? WALL_TOP : z <= 1 ? RAIL : z < 8 ? WALL_LO : z === 8 ? RAIL : hash(x + y, z >> 1, 0, 3) < .08 ? shift(WALL, -3) : WALL;
  s.box(-2, -2, 1, N + 2, 2, WH, wallCol).box(-2, 0, 1, 2, N, WH, wallCol);
  // The breach: a ragged hole with exposed brick and concrete, scorched plaster and amber light behind it.
  const hole = (x, z) => ((x - hx) / 7.3) ** 2 + ((z - 6) / 19) ** 2 + (hash(x, z, 0, 4) - .5) * .34;
  for (let x = 4; x < N; x++) for (let z = 1; z <= WH; z++) {
    const f = hole(x, z);
    if (f < 1) {
      s.del(x, -1, z);
      s.set(x, -2, z, mix('#ff9632', '#ffd978', Math.min(1, z / 24 + hash(x, z, 1, 4) * .15)), {glow: true});
    } else if (f < 1.22) { s.set(x, -1, z, hash(x, z, 2, 4) < .5 ? BRICK : hash(x, z, 3, 4) < .5 ? CONC : '#8f5440'); }
    else if (f < 1.6 && z < WH) s.set(x, -1, z, mix(wallCol(x, -1, z), '#4d4036', (1.6 - f) * 1.6));
  }
  // Cracks running out from the hole.
  for (const [x0, z0, dx] of [[13, 17, -1], [14, 23, -1], [11, 12, -1]]) for (let i = 0; i < 5; i++) s.set(x0 + dx * i, -1, z0 + Math.round(i * .6), '#7d7263');

  // Amber light spilling across the carpet from the breach.
  s.paint(0, 0, 0, N, N, 1, (x, y, z, v) => {
    const w = 6.5 + y * .42, t = Math.max(0, 1 - Math.abs(x - hx + y * .15) / w) * Math.max(0, 1 - y / 26);
    return t > 0 ? mix(v.c, AMBER, Math.min(.85, t * 1.25)) : undefined;
  });

  // ---- left wall: window with blinds glowing with dusk light ----
  s.box(-1, 8, 14, 1, 16, 12, WOOD_D);
  s.box(-1, 9, 15, 1, 14, 10, (x, y, z) => mix('#ff8f3a', '#ffd27a', (z - 15) / 10), {glow: true});
  s.box(-1, 9, 15, 1, 14, 10, (x, y, z) => z % 3 === 2 ? '#5a4a3c' : undefined);
  s.box(-1, 15, 15, 1, 2, 10, WOOD_D).box(0, 7, 13, 1, 18, 1, WOOD);

  // ---- office dressing ----
  // Filing cabinet in the corner with a drawer pulled out and papers on top.
  s.box(1, 0, 1, 6, 5, 11, '#8e98a8').box(1, 0, 12, 6, 5, 1, '#a7b0be');
  for (const z of [2, 5, 9]) s.box(2, 4, z, 4, 1, 2, '#7a8496').box(3, 5, z + 1, 2, 1, 1, '#d5dbe4');
  s.box(2, 5, 5, 4, 3, 3, '#8e98a8').box(2, 7, 5, 4, 1, 3, '#7a8496').box(3, 8, 6, 2, 1, 1, '#d5dbe4').box(3, 5, 7, 2, 2, 1, C.paper);
  s.box(2, 1, 13, 3, 3, 1, C.paper).box(3, 2, 14, 3, 2, 1, '#f3d98a');
  // Cork board on the back wall.
  s.box(1, 0, 15, 8, 1, 8, WOOD_D).box(2, 0, 16, 6, 1, 6, '#cf9f66');
  s.box(2, 0, 19, 2, 1, 3, C.paper).box(5, 0, 18, 2, 1, 2, '#f3d98a').box(5, 0, 21, 3, 1, 1, '#9fd0ff').set(3, 0, 16, C.red).set(6, 0, 16, C.paper);
  // The uplink console on the floor, its screen glowing teal.
  s.box(23, 23, 1, 6, 6, 1, '#3a4254').box(24, 24, 2, 4, 4, 4, '#2b3140').box(24, 27, 3, 4, 1, 2, '#58f0cf', {glow: true}).set(25, 27, 4, '#d6fff4', {glow: true}).box(24, 24, 6, 4, 4, 1, '#3a4254');
  s.box(27, 24, 7, 1, 1, 5, '#8e98a8').set(27, 24, 12, '#58f0cf', {glow: true}).box(28, 25, 2, 1, 2, 2, '#58f0cf', {glow: true});
  // Papers, a mug and rubble on the floor.
  for (const [x, y, c] of [[13, 24, C.paper], [15, 26, C.paper], [14, 19, '#f3d98a'], [27, 17, C.paper], [17, 21, C.paper]]) s.box(x, y, 1, 2, 2, 1, c);
  for (let i = 0; i < 46; i++) {
    const x = 12 + Math.floor(hash(i, 1, 0, 9) * 17), y = Math.floor(hash(i, 2, 0, 9) ** 1.6 * 12), r = hash(i, 3, 0, 9);
    const c = r < .35 ? BRICK : r < .7 ? CONC : WALL, h = r > .8 && y < 4 ? 2 : 1;
    s.fill(x, y, 1, h, 1 + (r > .5), h, c);
  }

  // ---- overturned desk: top facing the breach, one end panel towards us ----
  s.box(9, 9, 1, 2, 21, 7, WOOD).box(10, 9, 1, 1, 21, 7, (x, y, z) => (y === 9 || y === 29 || z === 1 || z === 7) ? WOOD_D : (y % 6 === 2) ? shift(WOOD, -5) : WOOD);
  s.box(9, 9, 8, 2, 21, 1, '#d6a570');
  s.box(4, 29, 1, 5, 1, 7, WOOD).box(4, 29, 1, 5, 1, 1, WOOD_D).box(4, 29, 7, 5, 1, 1, WOOD_D).box(4, 29, 8, 5, 1, 1, '#d6a570');
  for (const y of [10, 27]) for (const z of [2, 6]) s.box(11, y, z, 4, 2, 1, '#9aa3b2').box(14, y, z, 1, 2, 1, '#d5dbe4'); // legs in the air
  s.box(11, 20, 1, 3, 3, 1, C.paper).box(12, 13, 1, 2, 3, 2, '#2b3140').box(12, 14, 3, 2, 1, 1, '#58f0cf', {glow: true}); // spilled papers and a phone

  // ---- defenders braced behind the desk, built facing +y then turned to face the breach ----
  const defender = (zo, radio) => {
    const d = new Scene();
    d.box(-4, 0, 1, 3, 4, 2 + zo, UNI_E_D).box(1, 0, 1, 3, 4, 2 + zo, UNI_E_D).box(-4, 0, 1, 3, 5, 2, BOOT).box(1, 0, 1, 3, 5, 2, BOOT);
    const tz = 3 + zo;
    d.box(-4, 0, tz, 8, 5, 6, UNI_E).box(-3, 5, tz + 1, 6, 1, 4, VEST_E);
    d.box(-5, 1, tz + 2, 1, 3, 4, UNI_E).box(4, 1, tz + 2, 1, 3, 4, UNI_E).box(-5, 1, tz + 3, 1, 3, 2, EMBER).box(4, 1, tz + 3, 1, 3, 2, EMBER);
    d.box(-5, 4, tz + 4, 2, 5, 2, UNI_E).box(3, 4, tz + 4, 2, 5, 2, UNI_E).box(-5, 8, tz + 4, 2, 2, 2, BOOT).box(3, 8, tz + 4, 2, 2, 2, BOOT);
    d.box(-1, 6, tz + 5, 2, 5, 2, GUN).box(0, 11, tz + 5, 1, 6, 1, GUN).box(0, 9, tz + 7, 1, 2, 1, GUN_L).box(0, 16, tz + 5, 1, 1, 1, GUN_L);
    d.box(-2, 1, tz + 6, 4, 4, 1, SKIN_D);
    const hz = tz + 7;
    d.box(-4, -1, hz, 8, 8, 8, (x, y, z) => z < hz + 3 ? HAIR : HELM_E);
    for (const [x, y] of [[-4, -1], [3, -1], [-4, 6], [3, 6]]) d.box(x, y, hz, 1, 1, 8, null);
    d.box(-3, 6, hz, 6, 1, 4, SKIN).box(-3, 0, hz, 6, 6, 1, SKIN_D);
    d.box(-2, 6, hz + 2, 1, 1, 2, INK).box(1, 6, hz + 2, 1, 1, 2, INK).set(-1, 6, hz, '#a55a4b').set(0, 6, hz, '#a55a4b');
    d.box(-5, -2, hz + 4, 10, 10, 2, (x, y, z) => (x === -5 || x === 4 || y === -2 || y === 7) && !((x === -5 || x === 4) && (y === -2 || y === 7)) ? (z === hz + 4 ? EMBER_D : EMBER) : undefined);
    d.box(-4, -1, hz + 6, 8, 8, 1, HELM_E).box(-3, 0, hz + 7, 6, 6, 1, shift(HELM_E, 5)).box(-4, -1, hz + 7, 8, 8, 1, (x, y) => (x === -4 || x === 3 || y === -1 || y === 6) ? null : undefined);
    d.box(-5, 2, hz + 1, 1, 3, 3, BOOT).box(4, 2, hz + 1, 1, 3, 3, BOOT); // headset cups
    if (radio) d.box(-3, -2, tz + 1, 4, 1, 4, '#33372c').box(-3, -2, tz + 5, 1, 1, 10, '#22232b').set(-3, -2, tz + 15, EMBER, {glow: true});
    return d;
  };
  s.stamp(defender(1, true), [1, 14, 0], 3);
  s.stamp(defender(3, false), [1, 24, 0], 3);

  // ---- the attacker, stepping through the breach ----
  const cx = 21, fy = 13; // fy = front plane of the torso
  // Boots and legs: left leg strides forward, right leg trails in the rubble.
  s.box(cx - 4, fy - 2, 1, 3, 5, 2, BOOT).box(cx - 4, fy + 2, 2, 3, 1, 1, null).box(cx - 4, fy - 2, 3, 3, 3, 5, UNI_A_D).box(cx - 4, fy, 5, 3, 1, 2, '#5b657a');
  s.box(cx + 1, fy - 6, 1, 3, 5, 2, BOOT).box(cx + 1, fy - 2, 2, 3, 1, 1, null).box(cx + 1, fy - 5, 3, 3, 3, 5, UNI_A_D).box(cx + 1, fy - 3, 5, 3, 1, 2, '#5b657a');
  // Torso, belt and vest one voxel proud.
  s.box(cx - 5, fy - 5, 8, 10, 6, 8, UNI_A).box(cx - 5, fy - 5, 8, 10, 6, 1, BOOT).box(cx - 1, fy, 8, 2, 1, 1, '#8e98a8');
  for (const [x, y] of [[cx - 5, fy - 5], [cx + 4, fy - 5]]) s.box(x, y, 8, 1, 1, 8, null);
  s.box(cx - 4, fy + 1, 9, 8, 1, 6, VEST_A).box(cx - 4, fy - 4, 15, 2, 5, 1, VEST_A).box(cx + 2, fy - 4, 15, 2, 5, 1, VEST_A);
  s.box(cx - 3, fy + 1, 12, 3, 1, 1, AZURE).set(cx - 2, fy + 1, 13, AZURE).set(cx - 2, fy + 1, 11, AZURE); // squad diamond
  s.box(cx + 1, fy + 1, 13, 2, 1, 1, '#5b657a');
  // Arms: banded upper arms, forearms forward on the carbine.
  for (const ax of [cx - 8, cx + 6]) {
    s.box(ax, fy - 4, 11, 3, 3, 5, UNI_A).box(ax, fy - 4, 13, 3, 3, 2, (x, y, z) => z === 13 ? AZURE_D : AZURE);
    s.box(ax, fy - 1, 10, 3, 3, 3, UNI_A).box(ax, fy + 2, 10, 3, 2, 3, BOOT);
  }
  // Carbine held low across the body.
  s.box(cx - 9, fy + 2, 9, 16, 2, 3, null);
  s.box(cx - 7, fy + 2, 10, 13, 2, 2, GUN).box(cx - 9, fy + 2, 10, 2, 1, 1, GUN_L);
  s.box(cx - 2, fy + 2, 7, 2, 2, 3, GUN_L).box(cx + 3, fy + 2, 8, 2, 2, 2, GUN).box(cx - 5, fy + 3, 11, 9, 1, 1, GUN_L).box(cx - 4, fy + 2, 12, 3, 1, 1, GUN_L).box(cx + 6, fy + 2, 9, 3, 2, 2, GUN);
  for (const ax of [cx - 8, cx + 6]) s.box(ax, fy + 2, 11, 3, 2, 2, BOOT);
  // Neck.
  s.box(cx - 2, fy - 4, 16, 4, 4, 2, SKIN_D);
  // Head: 10-wide face in a one-voxel shell, open-face helmet with a blue band and amber goggles pushed up.
  const hz = 18, hy = fy - 8;
  s.box(cx - 6, hy, hz, 12, 10, 10, (x, y, z) => z < hz + 4 ? HAIR : HELM_A);
  for (const [x, y] of [[cx - 6, hy], [cx + 5, hy], [cx - 6, hy + 9], [cx + 5, hy + 9]]) s.box(x, y, hz, 1, 1, 10, null);
  s.box(cx - 5, hy + 9, hz, 10, 1, 6, SKIN).set(cx - 5, hy + 9, hz, null).set(cx + 4, hy + 9, hz, null);
  s.box(cx - 6, hy + 5, hz + 2, 1, 4, 4, HELM_A).box(cx + 5, hy + 5, hz + 2, 1, 4, 4, HELM_A); // ear covers
  s.box(cx - 5, hy + 1, hz, 10, 8, 1, SKIN_D);
  const kz = hz + 6;
  s.box(cx - 7, hy - 1, kz, 14, 12, 3, HELM_A).box(cx - 7, hy - 1, kz, 14, 12, 1, AZURE_D).box(cx - 7, hy - 1, kz + 1, 14, 12, 1, AZURE);
  for (const [x, y] of [[cx - 7, hy - 1], [cx + 6, hy - 1], [cx - 7, hy + 10], [cx + 6, hy + 10]]) s.box(x, y, kz, 1, 1, 3, null);
  for (const [x, y] of [[cx - 6, hy - 1], [cx + 5, hy - 1], [cx - 7, hy], [cx + 6, hy], [cx - 6, hy + 10], [cx + 5, hy + 10], [cx - 7, hy + 9], [cx + 6, hy + 9]]) s.set(x, y, kz + 2, null);
  s.box(cx - 6, hy, kz + 3, 12, 10, 1, HELM_A).box(cx - 5, hy + 1, kz + 4, 10, 8, 1, shift(HELM_A, 5));
  for (const [x, y] of [[cx - 6, hy], [cx + 5, hy], [cx - 6, hy + 9], [cx + 5, hy + 9]]) s.set(x, y, kz + 3, null);
  for (const [x, y] of [[cx - 5, hy + 1], [cx + 4, hy + 1], [cx - 5, hy + 8], [cx + 4, hy + 8]]) s.set(x, y, kz + 4, null);
  s.box(cx - 5, hy + 10, kz + 2, 10, 1, 1, GUN).box(cx - 4, hy + 10, kz + 2, 3, 1, 1, AMBER, {glow: true}).box(cx + 1, hy + 10, kz + 2, 3, 1, 1, AMBER, {glow: true}).set(cx - 4, hy + 10, kz + 2, '#ffe3a3', {glow: true}).set(cx + 1, hy + 10, kz + 2, '#ffe3a3', {glow: true});
  // Face.
  for (const ex of [cx - 3, cx + 1]) {
    s.box(ex, hy + 9, hz + 3, 2, 1, 2, INK).set(ex, hy + 9, hz + 4, '#ffffff');
    s.box(ex - (ex < cx ? 1 : 0), hy + 9, hz + 5, 3, 1, 1, HAIR);
  }
  s.set(cx - 1, hy + 10, hz + 2, SKIN);
  s.box(cx - 1, hy + 9, hz + 1, 2, 1, 1, '#a55a4b');

  // ---- debris and dust thrown into the room ----
  for (let i = 0; i < 34; i++) {
    const x = 9 + Math.floor(hash(i, 1, 0, 12) * 20), y = Math.floor(hash(i, 2, 0, 12) * 8), z = 3 + Math.floor(hash(i, 3, 0, 12) * 20), r = hash(i, 4, 0, 12);
    if (Math.abs(x - cx) < 9 && y > 3) continue;
    if (r < .45) s.fill(x, y, z, 1, 1, 1, '#ffd98a', {glow: true}); else s.fill(x, y, z, 1, 1, 1, r < .7 ? BRICK : r < .85 ? CONC : WALL);
  }
}
