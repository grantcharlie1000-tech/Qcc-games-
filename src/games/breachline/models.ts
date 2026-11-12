/** Fighters and weapons, built from coloured boxes at load. One vertex-coloured Lambert material shades them all;
 * each fighter's material is tinted by the baked light where it stands. */
import * as THREE from 'three';
import { SQUADS, type WeaponId } from './config';

export interface Part { s: [number, number, number]; p: [number, number, number]; c: number; r?: [number, number, number] }
const tmp = new THREE.Matrix4(), euler = new THREE.Euler(), quat = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), vec = new THREE.Vector3(), color = new THREE.Color();

/** Merges boxes (size, centre, colour, optional rotation) into one geometry with normals and vertex colours. */
export function boxes(parts: readonly Part[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  for (const part of parts) {
    const g = new THREE.BoxGeometry(part.s[0], part.s[1], part.s[2]);
    euler.set(part.r?.[0] ?? 0, part.r?.[1] ?? 0, part.r?.[2] ?? 0);
    tmp.compose(vec.set(part.p[0], part.p[1], part.p[2]), quat.setFromEuler(euler), one);
    g.applyMatrix4(tmp);
    const base = pos.length / 3, p = g.getAttribute('position'), n = g.getAttribute('normal');
    color.setHex(part.c, THREE.SRGBColorSpace);
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(color.r, color.g, color.b); }
    for (const i of g.getIndex()!.array as ArrayLike<number> as number[]) idx.push(base + i);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

const GUN = 0x4b5057, GUN2 = 0x666c74, POLY = 0x5b6b5c, TAN = 0xa68a5c, SKIN = 0xd3a983, GLOVE = 0x3a3d42, CLOTH = 0x545b66, VEST = 0x68735a, BOOT = 0x34363a, LENS = 0x7fd0f0, RIG = 0x4a5342, HELMET = 0x50585f;

interface GunSpec { len: number; barrel: number; mag: [number, number, number] | null; stock: number; guard: number; body: number; optic: 'dot' | 'holo' | 'scope' | 'bead' | 'irons'; accent: number; tube?: boolean }
export const GUNS: Record<WeaponId, GunSpec> = {
  ar: { len: 0.46, barrel: 0.3, mag: [0.045, 0.2, 0.09], stock: 0.26, guard: 0.28, body: POLY, optic: 'dot', accent: GUN2 },
  carbine: { len: 0.42, barrel: 0.2, mag: [0.045, 0.18, 0.085], stock: 0.22, guard: 0.22, body: TAN, optic: 'holo', accent: GUN2 },
  smg: { len: 0.34, barrel: 0.12, mag: [0.036, 0.24, 0.05], stock: 0.2, guard: 0.14, body: GUN2, optic: 'dot', accent: 0x7a8088 },
  shotgun: { len: 0.44, barrel: 0.4, mag: null, stock: 0.28, guard: 0.24, body: 0x8a5f3c, optic: 'bead', accent: GUN2, tube: true },
  dmr: { len: 0.5, barrel: 0.42, mag: [0.045, 0.14, 0.1], stock: 0.3, guard: 0.3, body: 0x5a6068, optic: 'scope', accent: TAN },
  pistol: { len: 0.2, barrel: 0, mag: null, stock: 0, guard: 0, body: GUN2, optic: 'irons', accent: GUN },
};
/** Height of the sight line above the bore: the weapon is modelled with its sight line on the local Z axis. */
const SIGHT = 0.062;

/** A weapon with its sight line along -Z through the origin, as the shooter sees it. Returns the model and where the
 * muzzle and the moving parts are. */
export function weaponParts(id: WeaponId): { fixed: Part[]; slide: Part[]; mag: Part[]; muzzle: number; sightGlow: [number, number, number] | null } {
  const g = GUNS[id], y = -SIGHT, fixed: Part[] = [], slide: Part[] = [], mag: Part[] = [];
  if (id === 'pistol') {
    slide.push({ s: [0.03, 0.036, 0.2], p: [0, y + 0.012, -0.1], c: GUN });
    fixed.push({ s: [0.028, 0.03, 0.17], p: [0, y - 0.018, -0.1], c: GUN2 }, { s: [0.03, 0.11, 0.045], p: [0, y - 0.07, -0.025], c: GUN2, r: [0.22, 0, 0] });
    fixed.push({ s: [0.006, 0.014, 0.006], p: [0, -0.012, -0.19], c: 0xdedede }, { s: [0.022, 0.014, 0.008], p: [0, -0.014, -0.012], c: GUN });
    return { fixed, slide, mag, muzzle: -0.21, sightGlow: null };
  }
  const front = -g.len;
  fixed.push({ s: [0.05, 0.075, g.len], p: [0, y, front / 2], c: g.body });
  fixed.push({ s: [0.054, 0.02, g.len * 0.9], p: [0, y + 0.044, front / 2], c: GUN });
  fixed.push({ s: [0.052, 0.058, g.guard], p: [0, y - 0.004, front - g.guard / 2 + 0.02], c: g.accent });
  for (let i = 0; i < 7; i++) fixed.push({ s: [0.03, 0.008, 0.016], p: [0, y + 0.058, front * (0.1 + i * 0.125)], c: GUN2 });
  fixed.push({ s: [0.004, 0.022, 0.07], p: [0.027, y + 0.012, front * 0.45], c: 0x8d949c }, { s: [0.012, 0.012, 0.09], p: [0, y - 0.052, -0.11], c: GUN }, { s: [0.012, 0.045, 0.012], p: [0, y - 0.07, -0.15], c: GUN });
  if (g.barrel) fixed.push({ s: [0.022, 0.022, g.barrel], p: [0, y + 0.008, front - g.barrel / 2], c: GUN });
  if (g.tube) { fixed.push({ s: [0.024, 0.024, g.barrel * 0.92], p: [0, y - 0.026, front - g.barrel * 0.46], c: GUN }); slide.push({ s: [0.058, 0.05, 0.15], p: [0, y - 0.03, front - 0.14], c: g.body }); }
  else fixed.push({ s: [0.03, 0.03, 0.05], p: [0, y + 0.008, front - g.barrel - 0.02], c: GUN2 });
  fixed.push({ s: [0.042, 0.11, 0.05], p: [0, y - 0.085, -0.06], c: GUN, r: [0.3, 0, 0] });
  if (g.stock) fixed.push({ s: [0.04, 0.05, g.stock], p: [0, y - 0.004, g.stock / 2], c: GUN }, { s: [0.044, 0.1, 0.05], p: [0, y - 0.03, g.stock - 0.025], c: g.body });
  if (g.mag) mag.push({ s: g.mag, p: [0, y - 0.04 - g.mag[1] / 2, -g.len * 0.42], c: GUN2, r: [0.14, 0, 0] });
  let glow: [number, number, number] | null = null;
  if (g.optic === 'dot' || g.optic === 'holo') {
    const w = g.optic === 'holo' ? 0.05 : 0.04, h = g.optic === 'holo' ? 0.046 : 0.04, z = -g.len * 0.52;
    fixed.push({ s: [w + 0.012, 0.014, 0.07], p: [0, -h / 2 - 0.01, z], c: GUN });
    fixed.push({ s: [0.006, h + 0.01, 0.05], p: [-w / 2 - 0.003, 0, z], c: GUN }, { s: [0.006, h + 0.01, 0.05], p: [w / 2 + 0.003, 0, z], c: GUN }, { s: [w + 0.012, 0.006, 0.05], p: [0, h / 2 + 0.005, z], c: GUN });
    glow = [0, 0, z];
  } else if (g.optic === 'scope') {
    const z = -g.len * 0.5;
    for (const [sx, sy, px, py] of [[0.062, 0.008, 0, 0.031], [0.062, 0.008, 0, -0.031], [0.008, 0.062, 0.031, 0], [0.008, 0.062, -0.031, 0]] as const) fixed.push({ s: [sx, sy, 0.24], p: [px, py, z], c: GUN });
    fixed.push({ s: [0.03, 0.03, 0.05], p: [0, -0.045, z + 0.06], c: GUN2 }, { s: [0.03, 0.03, 0.05], p: [0, -0.045, z - 0.06], c: GUN2 }, { s: [0.056, 0.056, 0.004], p: [0, 0, z - 0.1], c: LENS });
    glow = [0, 0, z + 0.1];
  } else fixed.push({ s: [0.008, 0.018, 0.008], p: [0, -0.012, front - g.barrel + 0.02], c: 0xd8d8d8 });
  return { fixed, slide, mag, muzzle: front - g.barrel - 0.05, sightGlow: glow };
}

/** First-person arms holding a weapon. The right hand is on the grip, the left on the handguard. */
export function armParts(id: WeaponId, band: number): Part[] {
  const g = GUNS[id], sleeve = CLOTH;
  if (id === 'pistol') return [
    { s: [0.075, 0.075, 0.4], p: [0.06, -0.15, 0.17], c: sleeve, r: [0.28, -0.2, 0] }, { s: [0.079, 0.079, 0.022], p: [0.03, -0.12, 0.03], c: band, r: [0.28, -0.2, 0] }, { s: [0.07, 0.085, 0.1], p: [0.012, -0.105, -0.02], c: GLOVE },
    { s: [0.075, 0.075, 0.4], p: [-0.13, -0.17, 0.15], c: sleeve, r: [0.3, 0.42, 0] }, { s: [0.065, 0.075, 0.09], p: [-0.03, -0.12, -0.03], c: GLOVE },
  ];
  const hold = -g.len - g.guard * 0.45;
  return [
    { s: [0.08, 0.08, 0.42], p: [0.085, -0.2, 0.12], c: sleeve, r: [0.3, -0.16, 0] }, { s: [0.07, 0.09, 0.1], p: [0.012, -0.14, -0.06], c: GLOVE },
    { s: [0.08, 0.08, 0.5], p: [-0.16, -0.2, hold + 0.26], c: sleeve, r: [0.2, 0.48, 0] }, { s: [0.084, 0.084, 0.022], p: [-0.062, -0.148, hold + 0.075], c: band, r: [0.2, 0.48, 0] }, { s: [0.075, 0.07, 0.11], p: [-0.02, -0.105, hold], c: GLOVE },
  ];
}

/** A fighter in third person, standing at the origin and facing -Z. Parts hang off pivots so legs can swing and bend
 * and the upper body can lean and follow the aim. */
export interface Figure {
  root: THREE.Group;
  hips: THREE.Group; upper: THREE.Group;
  thigh: [THREE.Group, THREE.Group]; shin: [THREE.Group, THREE.Group];
  material: THREE.MeshLambertMaterial;
  muzzle: THREE.Object3D;
}
let figureGeo: { pelvis: THREE.BufferGeometry; thigh: THREE.BufferGeometry; shin: THREE.BufferGeometry; upper: [THREE.BufferGeometry, THREE.BufferGeometry] } | null = null;
function figureGeometry() {
  if (figureGeo) return figureGeo;
  const upper = (squad: 0 | 1): Part[] => {
    const c = Number(`0x${SQUADS[squad].color.slice(1)}`), d = Number(`0x${SQUADS[squad].dark.slice(1)}`);
    return [
      { s: [0.4, 0.46, 0.24], p: [0, 0.25, 0], c: VEST }, { s: [0.34, 0.2, 0.06], p: [0, 0.2, -0.14], c: RIG }, { s: [0.3, 0.3, 0.1], p: [0, 0.28, 0.16], c: RIG },
      { s: [0.12, 0.1, 0.05], p: [-0.1, 0.12, -0.16], c: 0x3c4436 }, { s: [0.12, 0.1, 0.05], p: [0.1, 0.12, -0.16], c: 0x3c4436 },
      // Squad colour on both shoulders and across the helmet.
      { s: [0.13, 0.1, 0.2], p: [-0.25, 0.42, 0], c }, { s: [0.13, 0.1, 0.2], p: [0.25, 0.42, 0], c },
      { s: [0.1, 0.07, 0.1], p: [0, 0.5, 0], c: SKIN }, { s: [0.19, 0.2, 0.2], p: [0, 0.62, -0.01], c: SKIN },
      { s: [0.24, 0.13, 0.26], p: [0, 0.72, 0], c: HELMET }, { s: [0.25, 0.035, 0.27], p: [0, 0.685, 0], c }, { s: [0.2, 0.06, 0.03], p: [0, 0.63, -0.115], c: 0x23282c },
      { s: [0.06, 0.05, 0.05], p: [-0.13, 0.62, 0], c: d }, { s: [0.06, 0.05, 0.05], p: [0.13, 0.62, 0], c: d },
      // Arms brought forward onto a rifle.
      { s: [0.1, 0.1, 0.34], p: [0.24, 0.3, -0.12], c: CLOTH, r: [0.5, 0.25, 0] }, { s: [0.09, 0.09, 0.3], p: [0.14, 0.2, -0.33], c: CLOTH, r: [-0.1, 0.75, 0] }, { s: [0.08, 0.08, 0.09], p: [0.03, 0.2, -0.42], c: GLOVE },
      { s: [0.1, 0.1, 0.36], p: [-0.24, 0.3, -0.16], c: CLOTH, r: [0.35, -0.3, 0] }, { s: [0.09, 0.09, 0.3], p: [-0.14, 0.22, -0.45], c: CLOTH, r: [0, -0.6, 0] }, { s: [0.08, 0.08, 0.09], p: [-0.04, 0.22, -0.58], c: GLOVE },
      { s: [0.05, 0.08, 0.62], p: [0.03, 0.24, -0.5], c: GUN }, { s: [0.04, 0.16, 0.06], p: [0.03, 0.14, -0.5], c: GUN2 }, { s: [0.045, 0.1, 0.22], p: [0.03, 0.25, -0.12], c: GUN2 }, { s: [0.025, 0.025, 0.2], p: [0.03, 0.26, -0.9], c: GUN },
    ];
  };
  figureGeo = {
    pelvis: boxes([{ s: [0.36, 0.18, 0.23], p: [0, 0, 0], c: CLOTH }, { s: [0.38, 0.05, 0.25], p: [0, 0.08, 0], c: 0x3a3f45 }, { s: [0.1, 0.14, 0.07], p: [0.2, -0.02, 0], c: 0x3c4436 }]),
    thigh: boxes([{ s: [0.16, 0.46, 0.19], p: [0, -0.22, 0], c: CLOTH }]),
    shin: boxes([{ s: [0.14, 0.46, 0.16], p: [0, -0.23, 0], c: CLOTH }, { s: [0.15, 0.12, 0.05], p: [0, -0.04, -0.09], c: 0x3c4436 }, { s: [0.16, 0.1, 0.28], p: [0, -0.43, -0.04], c: BOOT }]),
    upper: [boxes(upper(0)), boxes(upper(1))],
  };
  return figureGeo;
}
export const HIP_Y = 0.94, THIGH = 0.45, SHIN = 0.49;
export function makeFigure(squad: 0 | 1): Figure {
  const geo = figureGeometry(), material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const root = new THREE.Group(), hips = new THREE.Group(), upper = new THREE.Group();
  root.add(hips); hips.position.y = HIP_Y;
  hips.add(new THREE.Mesh(geo.pelvis, material));
  upper.position.y = 0.1; hips.add(upper);
  upper.add(new THREE.Mesh(geo.upper[squad], material));
  const muzzle = new THREE.Object3D(); muzzle.position.set(0.03, 0.26, -1.02); upper.add(muzzle);
  const thigh: THREE.Group[] = [], shin: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const t = new THREE.Group(), s = new THREE.Group();
    t.position.set(side * 0.1, -0.04, 0); t.add(new THREE.Mesh(geo.thigh, material));
    s.position.y = -THIGH; s.add(new THREE.Mesh(geo.shin, material)); t.add(s);
    hips.add(t); thigh.push(t); shin.push(s);
  }
  return { root, hips, upper, thigh: thigh as [THREE.Group, THREE.Group], shin: shin as [THREE.Group, THREE.Group], material, muzzle };
}

/** The uplink device the attackers plant: a case with an aerial and a status light. */
export function deviceParts(): Part[] {
  return [
    { s: [0.42, 0.14, 0.3], p: [0, 0.07, 0], c: 0x2b3238 }, { s: [0.38, 0.02, 0.26], p: [0, 0.15, 0], c: 0x14181b }, { s: [0.14, 0.012, 0.09], p: [-0.07, 0.165, 0.02], c: 0x1f6f8f },
    { s: [0.02, 0.46, 0.02], p: [0.16, 0.38, -0.09], c: 0x9aa2a6 }, { s: [0.05, 0.05, 0.05], p: [0.16, 0.62, -0.09], c: 0x9aa2a6 }, { s: [0.44, 0.03, 0.04], p: [0, 0.1, 0.16], c: 0xe0b020 },
  ];
}
export function chargeParts(): Part[] {
  return [{ s: [0.3, 0.22, 0.045], p: [0, 0, 0.022], c: 0x3b4136 }, { s: [0.24, 0.035, 0.05], p: [0, 0.075, 0.028], c: 0xe0b020 }, { s: [0.07, 0.07, 0.06], p: [0.07, -0.03, 0.032], c: 0x1a1d1f }];
}
