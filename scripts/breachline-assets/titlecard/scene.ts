/** The Breachline title card scene: a small floating diorama of a room at the moment a wall is breached. */
import { LIGHT, type Material } from './palette.ts';
import { Grid, hash } from './voxel.ts';

export const ROOM = { w: 32, d: 28, h: 26, wallY: 7, holeX: 17, holeZ: 11 } as const;

type Facing = '+y' | '+x';
type Team = 'atk' | 'def';
type Pose = 'stand' | 'step' | 'kneel';

/** A soldier, 9 wide, built in local (u lateral, v forward, w up) and turned to face `facing`. */
export function soldier(g: Grid, ox: number, oy: number, oz: number, facing: Facing, team: Team, pose: Pose): void {
  const put = (u: number, v: number, w: number, m: Material | null) => {
    const [x, y] = facing === '+y' ? [ox + u, oy + v] : [ox + v, oy + 8 - u];
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
    cube(2, 1, 5, 2, pose === 'step' ? 3 : 2, 3, cloth);
    cube(5, 1 + back, 0, 2, 3, 1, 'boot'); cube(5, 1 + back, 1, 2, 2, 1, 'boot'); cube(5, 1 + back, 2, 2, 2, 6, cloth);
    h = 8;
  }
  // Belt, a recessed row, then the vest one voxel proud front and back, with pouches.
  cube(2, 0, h, 5, 4, 1, 'boot');
  cube(2, 1, h + 1, 5, 2, 6, cloth);
  cube(2, 0, h + 2, 5, 1, 5, vest); cube(2, 3, h + 2, 5, 1, 5, vest);
  cube(3, 4, h + 3, 1, 1, 2, vest); cube(5, 4, h + 3, 1, 1, 2, vest);
  // Upper arms with the squad band, a gap at the elbow, forearms forward to the rifle.
  for (const u of [1, 7]) { cube(u, 1, h + 3, 1, 2, 4, cloth); cube(u, 1, h + 5, 1, 2, 1, band); }
  cube(7, 3, h + 3, 1, 2, 1, cloth); put(6, 5, h + 3, 'skin');
  cube(1, 3, h + 3, 1, 2, 1, cloth); cube(2, 5, h + 3, 1, 2, 1, cloth); put(3, 7, h + 3, 'skin');
  // Rifle shouldered, pointing forward: dark body, light top edge, sight and magazine.
  const rz = h + 4;
  cube(4, 4, rz, 1, 9, 1, 'gun'); cube(4, 4, rz - 1, 1, 2, 1, 'gun');
  cube(4, 8, rz - 2, 1, 1, 2, 'gun');
  cube(4, 6, rz + 1, 1, 2, 1, 'gunLight');
  put(4, 13, rz, 'gunLight');
  // Neck, then the head: face with eyes or goggles under a dark brim gap, chin strap at the sides.
  cube(3, 1, h + 7, 3, 2, 1, 'skin');
  cube(2, 0, h + 8, 5, 4, 3, team === 'atk' ? 'atkVest' : 'defCloth');
  cube(3, 3, h + 8, 3, 1, 2, 'skin');
  if (team === 'atk') cube(3, 3, h + 9, 3, 1, 1, 'goggle');
  else { put(3, 3, h + 9, 'visor'); put(5, 3, h + 9, 'visor'); }
  put(2, 3, h + 8, 'visor'); put(6, 3, h + 8, 'visor');
  cube(3, 3, h + 10, 3, 1, 1, 'visor');
  // Helmet: a low rounded dome with a short brim, the squad band round its widest row.
  cube(2, -1, h + 10, 5, 1, 1, helmet); cube(2, 0, h + 10, 1, 4, 1, helmet); cube(6, 0, h + 10, 1, 4, 1, helmet);
  cube(2, -1, h + 11, 5, 5, 1, band); cube(3, 4, h + 11, 3, 1, 1, helmet);
  cube(3, -1, h + 12, 3, 5, 1, helmet); cube(2, 0, h + 12, 5, 3, 1, helmet);
}

export function buildScene(): Grid {
  const g = new Grid();
  const { w, d, h, wallY, holeX, holeZ } = ROOM;
  const y0 = wallY - 7; // the corridor is only deep enough for the stack

  // The slab: three voxels of concrete under the floor, tiles in the corridor and lab half, carpet in the office half.
  for (let x = 0; x < w; x++) for (let y = y0; y < d; y++) {
    if (y < wallY && x >= w - 8) continue; // the corridor stops behind the partition's clean end
    g.box(x, y, -3, 1, 1, 2, 'slab');
    g.set(x, y, -1, y < wallY || x >= 15 ? (((x >> 1) + (y >> 1)) % 2 ? 'tile' : 'tileAlt') : 'carpet');
  }

  // Outer wall along x = 0 and the corridor's far wall, both ending cleanly.
  const wallMat = (z: number): Material => (z < 5 ? 'dado' : z === 5 ? 'trim' : 'board');
  g.box(0, y0, 0, 2, d - y0, 16, (_x, _y, z) => wallMat(z));
  g.box(2, y0, 0, w - 10, 1, h - 6, (_x, _y, z) => wallMat(z));

  // The partition: board, stud frame, board. Torn board shows its pale core; soot stays tight to the edge.
  const hole = (x: number, z: number, k: number) => {
    const dx = (x + 0.5 - holeX) / 10, dz = (z + 0.5 - holeZ) / 13;
    return dx * dx + dz * dz < k * (1 + 0.4 * (hash(x, z, 0, 1) - 0.5));
  };
  for (let x = 2; x < w; x++) for (let z = 0; z < h; z++) {
    if (!hole(x, z, 1)) g.set(x, wallY, z, 'boardDim');
    const stud = x % 4 === 1 || z === 0 || z === h - 1 || x === w - 1;
    if (stud && !hole(x, z, 0.75)) g.set(x, wallY + 1, z, 'stud');
    if (hole(x, z, 1.25)) continue;
    const m: Material = hole(x, z, 1.45) ? 'gypsum' : hole(x, z, 1.7) && hash(x, z, 1, 2) < 0.6 ? 'scorch' : wallMat(z);
    g.set(x, wallY + 2, z, m);
  }

  // Reinforced steel panel on the right end of the partition.
  g.box(28, wallY + 3, 0, 4, 1, 19, 'steel');
  g.box(28, wallY + 4, 0, 1, 1, 19, 'steelDark').box(31, wallY + 4, 0, 1, 1, 19, 'steelDark');
  g.box(28, wallY + 4, 9, 4, 1, 1, 'steelDark');

  // Attackers: the hero stepping through, a second one's helmet and muzzle behind him in the hole.
  soldier(g, holeX - 6, wallY - 1, 0, '+y', 'atk', 'step');
  soldier(g, holeX + 2, wallY - 4, 0, '+y', 'atk', 'kneel');

  // Large wallboard chunks in mid-air, flying toward the defender, and rubble on the floor.
  const chunks = [[7, 12, 15, 3, 2], [4, 13, 19, 2, 1], [24, 11, 19, 2, 2], [26, 13, 13, 2, 1]] as const;
  for (const [x, y, z, a, b] of chunks) {
    g.box(x, y, z, a, 1, b, 'gypsum');
    g.box(x, y + 1, z, a, 1, b, 'board');
  }
  for (let x = holeX - 8; x <= holeX + 8; x++) for (let y = wallY + 3; y < wallY + 9; y++) {
    if (!g.get(x, y, 0) && hash(x, y, 0, 21) < 0.32 - (y - wallY) * 0.03) g.set(x, y, 0, hash(x, y, 1, 21) < 0.5 ? 'gypsum' : 'boardDim');
  }

  // The defender holds the angle across the hole from behind an overturned desk, rifle resting on it.
  g.box(9, 12, 0, 1, 11, 7, 'laminate');
  for (const y of [12, 22]) for (const z of [1, 5]) g.box(6, y, z, 3, 1, 1, 'desk');
  soldier(g, 4, 13, 0, '+x', 'def', 'kneel');

  // The uplink on a small table in the lab half.
  const tx = 24, ty = 22;
  for (const [dx, dy] of [[0, 0], [5, 0], [0, 4], [5, 4]]) g.box(tx + dx, ty + dy, 0, 1, 1, 5, 'steelDark');
  g.box(tx, ty, 5, 6, 5, 1, 'laminate');
  g.box(tx + 1, ty + 1, 6, 4, 3, 2, 'uplink');
  g.box(tx + 2, ty + 4, 6, 2, 1, 1, 'uplinkGlow');
  g.box(tx + 2, ty + 2, 8, 2, 1, 1, 'uplinkGlow');
  g.box(tx + 4, ty + 1, 8, 1, 1, 3, 'gunLight').set(tx + 4, ty + 1, 11, 'uplinkGlow');

  // Lights: the breach as a cone into the room, the corridor lit behind the hero, a rim from above, teal on the uplink.
  const fire = { x: holeX, y: wallY - 4, z: 6, rgb: LIGHT.breach };
  g.lights.push({ ...fire, range: 20, power: 2.8, dir: [0, 0.97, -0.24], cut: 0.5 });
  g.lights.push({ ...fire, y: wallY - 1.5, z: 10, range: 12, power: 2.8, dir: [0, -0.5, -0.87], cut: -0.3 });
  g.lights.push({ ...fire, x: holeX + 1, y: wallY + 1, z: 25, range: 14, power: 1.6, dir: [0, 0.45, -0.89], cut: 0.55 });
  g.lights.push({ x: tx + 3, y: ty + 3, z: 10, rgb: LIGHT.uplink, range: 6, power: 1.0 });
  return g;
}
