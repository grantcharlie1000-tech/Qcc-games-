/** The Breachline title card scene: a cutaway office/lab room at the moment a partition wall is breached. */
import { LIGHT, type Material } from './palette.ts';
import { Grid, hash } from './voxel.ts';

export const ROOM = { w: 48, d: 48, h: 26, wallY: 14, holeX: 24, holeZ: 10 } as const;

type Facing = '+y' | '-y' | '-x';
type Team = 'atk' | 'def';
type Pose = 'stand' | 'step' | 'kneel';

/** A soldier, 9 wide, built in local (u lateral, v forward, w up) and turned to face `facing`. */
export function soldier(g: Grid, ox: number, oy: number, oz: number, facing: Facing, team: Team, pose: Pose): void {
  const put = (u: number, v: number, w: number, m: Material | null) => {
    const [x, y] = facing === '+y' ? [ox + u, oy + v] : facing === '-y' ? [ox + 8 - u, oy - v] : [ox - v, oy + u];
    g.set(x, y, oz + w, m);
  };
  const cube = (u0: number, v0: number, w0: number, du: number, dv: number, dw: number, m: Material) => {
    for (let u = u0; u < u0 + du; u++) for (let v = v0; v < v0 + dv; v++) for (let w = w0; w < w0 + dw; w++) put(u, v, w, m);
  };
  const cloth: Material = team === 'atk' ? 'atkCloth' : 'defCloth';
  const vest: Material = team === 'atk' ? 'atkVest' : 'defVest';
  const helmet: Material = team === 'atk' ? 'atkHelmet' : 'defHelmet';
  const band: Material = team === 'atk' ? 'atkBand' : 'defBand';

  // Legs, separated by a one-voxel gap, boots dark.
  let h = 0; // height of the hips
  if (pose === 'kneel') {
    cube(2, -3, 0, 2, 4, 2, cloth); cube(2, -4, 0, 2, 1, 1, 'boot'); cube(2, 1, 0, 2, 2, 4, cloth); // knee down
    cube(5, 3, 0, 2, 2, 1, 'boot'); cube(5, 3, 1, 2, 1, 3, cloth); cube(5, 1, 4, 2, 3, 1, cloth); // knee up
    h = 4;
  } else {
    const front = pose === 'step' ? 2 : 0, back = pose === 'step' ? -1 : 0;
    cube(2, 1 + front, 0, 2, 3, 1, 'boot'); cube(2, 1 + front, 1, 2, 2, 1, 'boot'); cube(2, 1 + front, 2, 2, 2, 3, cloth);
    if (pose === 'step') cube(2, 1, 5, 2, 3, 3, cloth); else cube(2, 1, 5, 2, 2, 3, cloth);
    cube(5, 1 + back, 0, 2, 3, 1, 'boot'); cube(5, 1 + back, 1, 2, 2, 1, 'boot'); cube(5, 1 + back, 2, 2, 2, 6, cloth);
    h = 8;
  }
  // Belt, then a recessed row, then the vest one voxel proud front and back.
  cube(2, 0, h, 5, 4, 1, 'boot');
  cube(2, 1, h + 1, 5, 2, 6, cloth);
  cube(2, 0, h + 2, 5, 1, 5, vest); cube(2, 3, h + 2, 5, 1, 5, vest);
  cube(3, 4, h + 3, 1, 1, 2, vest); cube(5, 4, h + 3, 1, 1, 2, vest); // pouches
  // Shoulders and upper arms with the squad band, a gap at the elbow, forearms forward to the rifle.
  for (const u of [1, 7]) { cube(u, 1, h + 3, 1, 2, 4, cloth); cube(u, 1, h + 5, 1, 2, 2, band); }
  cube(7, 3, h + 3, 1, 2, 1, cloth); put(6, 5, h + 3, 'skin');
  cube(1, 3, h + 3, 1, 2, 1, cloth); cube(2, 5, h + 3, 1, 2, 1, cloth); put(3, 7, h + 3, 'skin');
  // Rifle shouldered, pointing forward.
  const rz = h + 4;
  cube(4, 4, rz, 1, 9, 1, 'gun'); cube(4, 4, rz - 1, 1, 2, 1, 'gun'); // receiver and stock
  cube(4, 8, rz - 2, 1, 1, 2, 'gun'); // magazine
  cube(4, 6, rz + 1, 1, 2, 1, 'gunLight'); // sight
  put(4, 13, rz, 'gunLight');
  // Neck, head a voxel wider each side, face with a dark gap under the helmet brim.
  cube(3, 1, h + 7, 3, 2, 1, 'skin');
  cube(2, 0, h + 8, 5, 4, 3, vest);
  cube(3, 3, h + 8, 3, 1, 2, 'skin');
  cube(3, 3, h + 9, 3, 1, 1, 'visor');
  cube(2, 3, h + 10, 5, 1, 1, 'visor');
  // Helmet: a shell no wider than the head, brim over the face, squad band round the middle.
  cube(2, -1, h + 10, 5, 1, 1, helmet); cube(2, 0, h + 10, 1, 3, 1, helmet); cube(6, 0, h + 10, 1, 3, 1, helmet);
  cube(2, -1, h + 11, 5, 6, 1, band);
  cube(2, -1, h + 12, 5, 5, 1, helmet); put(2, -1, h + 12, null); put(6, -1, h + 12, null);
  cube(3, 0, h + 13, 3, 3, 1, helmet);
}

export function buildScene(): Grid {
  const g = new Grid();
  const { w, d, h, wallY, holeX, holeZ } = ROOM;
  const y0 = wallY - 8; // the corridor behind the partition is only deep enough for the stack

  // Floor slab: tiles in the corridor and the lab half, carpet in the office half.
  for (let x = 0; x < w; x++) for (let y = y0; y < d; y++) {
    g.set(x, y, -3, 'slab').set(x, y, -2, 'slab');
    const lab = y < wallY || x >= 22;
    const top: Material = lab ? (((x >> 1) + (y >> 1)) % 2 ? 'tile' : 'tileAlt') : 'carpet';
    g.set(x, y, -1, top);
  }

  // Outer wall along x = 0 (we see its inside face): dado, trim rail, plaster, a notice board.
  // Plaster in sheet-sized panels, every other one a shade off, so big walls are not flat slabs.
  const wallMat = (z: number, a = 0): Material => (z < 6 ? 'dado' : z === 6 ? 'trim' : z > 7 && Math.floor(a / 6) % 2 ? 'boardDim' : 'board');
  // The outer wall is cut away in a ragged slope toward the viewer.
  for (let y = y0; y < d; y++) {
    const top = Math.round(h - Math.max(0, y - wallY - 4) * 0.45 - 2 * hash(y >> 1, 0, 0, 51));
    g.box(0, y, 0, 2, 1, top, (_x, yy, z) => wallMat(z, yy));
  }
  g.box(2, 29, 12, 1, 7, 6, 'laminate');
  for (const [y, z] of [[30, 16], [31, 16], [33, 15], [34, 15], [30, 13], [32, 13], [33, 13]] as const) g.set(3, y, z, 'paper');

  // The partition: board, stud frame, board. The front board is torn back further than the studs.
  const hole = (x: number, z: number, k: number) => {
    const dx = (x + 0.5 - holeX) / 10.5, dz = (z + 0.5 - holeZ) / 11.5;
    return dx * dx + dz * dz < k * (1 + 0.45 * (hash(x, z, 0, 1) - 0.5));
  };
  for (let x = 2; x < w; x++) for (let z = 0; z < h; z++) {
    if (!hole(x, z, 1)) g.set(x, wallY, z, 'boardDim');
    const stud = x % 4 === 0 || z === 0 || z === h - 1 || x === w - 1;
    if (stud && !hole(x, z, 0.8)) g.set(x, wallY + 1, z, 'stud');
    if (!hole(x, z, 1.35)) g.set(x, wallY + 2, z, hole(x, z, 1.75) ? 'scorch' : hole(x, z, 2.6) && hash(x, z, 1, 2) < 0.45 ? 'soot' : wallMat(z, x + 3));
  }
  // The corridor's far wall, which takes the blast of light.
  g.box(2, y0, 0, 40, 1, h - 8, (_x, _y, z) => wallMat(z));

  // Reinforced steel panel on the right of the partition, braced and hazard striped.
  g.box(35, wallY + 3, 0, 12, 1, 22, 'steel');
  for (const x of [35, 40, 45]) g.box(x, wallY + 4, 0, 1, 1, 22, 'steelDark');
  g.box(35, wallY + 4, 10, 12, 1, 1, 'steelDark');
  for (let x = 35; x < 47; x++) for (let z = 1; z < 3; z++) g.set(x, wallY + 4, z, (x + z) % 4 < 2 ? 'hazard' : 'hazardInk');

  // Attackers: one stepping through the hole, the stack behind it.
  soldier(g, holeX - 9, wallY - 1, 0, '+y', 'atk', 'step');
  soldier(g, holeX + 4, wallY - 4, 0, '+y', 'atk', 'stand');
  soldier(g, holeX - 22, wallY - 4, 0, '+y', 'atk', 'stand');

  // Debris thrown through the light shaft, and rubble on the floor.
  for (let i = 0; i < 24; i++) {
    const t = hash(i, 0, 0, 11);
    const x = Math.round(holeX + 2 + 9 * hash(i, 1, 0, 11)), y = Math.round(wallY + 4 + 6 * t);
    const z = Math.round(12 + 9 * hash(i, 2, 0, 11) - 4 * t);
    if (g.get(x, y, z) || g.get(x, y, z - 1)) continue;
    const m: Material = hash(i, 3, 0, 11) < 0.35 ? 'stud' : hash(i, 3, 0, 11) < 0.6 ? 'scorch' : 'gypsum';
    g.set(x, y, z, m);
    if (hash(i, 4, 0, 11) < 0.35) g.set(x + 1, y, z, m);
  }
  for (let x = holeX - 10; x <= holeX + 10; x++) for (let y = wallY + 3; y < wallY + 10; y++) {
    if (!g.get(x, y, 0) && hash(x, y, 0, 21) < 0.3 - (y - wallY) * 0.025) g.set(x, y, 0, hash(x, y, 1, 21) < 0.5 ? 'gypsum' : 'boardDim');
  }

  // Defenders: one kneeling behind an overturned desk on the left, one behind a barricade on the right.
  g.box(15, 29, 0, 11, 1, 8, 'laminate');
  for (const x of [16, 24]) for (const z of [1, 6]) g.box(x, 30, z, 1, 4, 1, 'desk');
  g.box(16, 30, 0, 9, 3, 1, 'desk');
  soldier(g, 16, 38, 0, '-y', 'def', 'kneel');

  g.box(38, 22, 0, 1, 11, 11, (_x, y, z) => (z === 6 && y >= 25 && y <= 28 ? null : z === 10 ? 'hazard' : 'steelDark'));
  for (const y of [23, 31]) g.box(39, y, 0, 3, 1, 1, 'steel');
  soldier(g, 45, 22, 0, '-x', 'def', 'stand');

  // Office dressing: a filing cabinet, a desk with a monitor, the uplink on its table.
  g.box(2, 17, 0, 3, 5, 10, 'cabinet');
  for (const z of [2, 5, 8]) for (const y of [18, 20]) g.set(5, y, z, 'steelDark');
  g.box(2, 23, 0, 3, 7, 6, 'desk');
  g.box(2, 23, 6, 6, 7, 1, 'laminate');
  g.box(3, 25, 7, 1, 2, 2, 'monitor');
  g.box(3, 24, 9, 1, 4, 3, 'monitor');
  g.box(4, 24, 9, 1, 4, 3, 'screen');

  const tx = 35, ty = 36;
  for (const [dx, dy] of [[1, 1], [8, 1], [1, 7], [8, 7]]) g.box(tx + dx, ty + dy, 0, 1, 1, 6, 'steelDark');
  g.box(tx, ty, 6, 10, 9, 1, 'laminate');
  g.box(tx + 2, ty + 2, 7, 6, 5, 2, 'uplink');
  g.box(tx + 3, ty + 7, 7, 4, 1, 1, 'uplinkGlow');
  g.box(tx + 3, ty + 3, 9, 4, 3, 1, 'uplinkGlow');
  g.box(tx + 7, ty + 3, 9, 1, 1, 5, 'gunLight').set(tx + 7, ty + 3, 14, 'uplinkGlow');

  // Lights: the breach fire as a cone into the room, a glow on the corridor wall, teal on the uplink.
  const fire = { x: holeX - 2, y: wallY - 4, z: 6, rgb: LIGHT.breach };
  g.lights.push({ ...fire, range: 22, power: 2.6, dir: [0, 0.97, -0.24], cut: 0.55 });
  g.lights.push({ ...fire, x: holeX - 1, y: wallY - 1.5, z: 10, range: 14, power: 2.4, dir: [0, -0.5, -0.87], cut: -0.2 });
  g.lights.push({ x: tx + 5, y: ty + 5, z: 11, rgb: LIGHT.uplink, range: 6, power: 1.0 });
  return g;
}
