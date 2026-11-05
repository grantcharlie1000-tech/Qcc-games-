/** CrossyRoad's voxel models: pure builders that return merged box geometry with a linear `color`
 * attribute (vertex colours). No materials or meshes are created here, and nothing touches the DOM.
 *
 * Units are column widths; rendered rows have ROW_DEPTH depth. Unless a builder says otherwise the origin is the
 * bottom centre of the model (x and z centred, y = 0 at the base) and vehicles face +x, so a
 * renderer turns a vehicle by a yaw of π to face −x. The bird faces −z (forward).
 *
 * Tinted builders return a white `body` and fixed-colour `detail` (windows, wheels, cargo).
 * The renderer merges them with a paint mask for one instanced draw at the same transform.
 * Side faces get a slightly darker bottom edge (a cheap ambient occlusion)
 * that tints along with the instance colour. */
import * as THREE from 'three';
import type {CarStyle} from './config';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A linear RGB triple; components may exceed 1 (used to keep a fixed colour under an instance tint). */
export type Rgb = readonly [r: number, g: number, b: number];
/** One box: x centre, y bottom, z centre, width (x), height (y), depth (z), colour (sRGB hex or a
 * linear triple), optional rotations through the box centre (radians: about x first, then about z) and
 * an optional colour for every face but the top (the sides and the underside). */
export type Part = readonly [x: number, y: number, z: number, w: number, h: number, d: number, color: number | Rgb, rotZ?: number, rotX?: number, side?: number | Rgb];

/** Palettes shared with the renderer so instance tints and baked colours agree. */
export const VEHICLE_COLORS: readonly number[] = [0xe43135, 0x23c6ed, 0xf4d33e, 0x9a4adb, 0x85bd42, 0x3f75bc, 0xf18a32];
export const TRUCK_COLORS: readonly number[] = [0xbd163c, 0x13bfdc, 0xbd163c, 0x8a3e92, 0x477db3, 0x18bdd8, 0xe67c2c];
export const TRAIN_COLORS: readonly number[] = [0xe94f64, 0x3a86ff, 0x2bb673, 0xf4a259];
export const LOG_COLORS: readonly number[] = [0x7d4a3c, 0x71423a, 0x885443];

const WHITE = 0xffffff;
const scratch = new THREE.Color();

/** Outward normal followed by the four corner signs of a face, counter-clockwise seen from outside. */
const FACES: readonly (readonly number[])[] = [
  [1, 0, 0, 1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1],
  [-1, 0, 0, -1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1],
  [0, 1, 0, -1, 1, -1, -1, 1, 1, 1, 1, 1, 1, 1, -1],
  [0, -1, 0, -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1],
  [0, 0, 1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1],
  [0, 0, -1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1, -1],
];
const BOTTOM_SHADE = 0.86;

/** Merges boxes into one indexed geometry with `position`, `normal` and `color` (linear RGB). The
 * bottom vertices of every side face are multiplied by `bottomShade`. */
export function voxel(parts: readonly Part[], bottomShade = BOTTOM_SHADE): THREE.BufferGeometry {
  const n = parts.length;
  const position = new Float32Array(n * 72), normal = new Float32Array(n * 72), color = new Float32Array(n * 72);
  const index = new Uint16Array(n * 36);
  let v = 0, ii = 0;
  for (let p = 0; p < n; p++) {
    const [px, py, pz, w, h, d, tint, rotZ = 0, rotX = 0, side = tint] = parts[p];
    let r: number, g: number, b: number, sr: number, sg: number, sb: number;
    if (typeof tint === 'number') { scratch.set(tint); r = scratch.r; g = scratch.g; b = scratch.b; } else { r = tint[0]; g = tint[1]; b = tint[2]; }
    if (typeof side === 'number') { scratch.set(side); sr = scratch.r; sg = scratch.g; sb = scratch.b; } else { sr = side[0]; sg = side[1]; sb = side[2]; }
    const hx = w / 2, hy = h / 2, hz = d / 2, cy = py + hy, cs = Math.cos(rotZ), sn = Math.sin(rotZ), cx = Math.cos(rotX), sx = Math.sin(rotX);
    for (let f = 0; f < 6; f++) {
      const face = FACES[f];
      for (let k = 0; k < 4; k++) {
        const lx = face[3 + k * 3] * hx, ly = face[4 + k * 3] * hy, lz = face[5 + k * 3] * hz;
        const shade = face[4 + k * 3] < 0 ? bottomShade : 1, o = v * 3;
        // About x, then about z.
        const y1 = ly * cx - lz * sx, z1 = ly * sx + lz * cx;
        position[o] = px + lx * cs - y1 * sn;
        position[o + 1] = cy + lx * sn + y1 * cs;
        position[o + 2] = pz + z1;
        const ny1 = face[1] * cx - face[2] * sx, nz1 = face[1] * sx + face[2] * cx;
        normal[o] = face[0] * cs - ny1 * sn;
        normal[o + 1] = face[0] * sn + ny1 * cs;
        normal[o + 2] = nz1;
        // The top face takes the main colour, every other face the side colour.
        if (face[1] === 1) { color[o] = r * shade; color[o + 1] = g * shade; color[o + 2] = b * shade; } else { color[o] = sr * shade; color[o + 1] = sg * shade; color[o + 2] = sb * shade; }
        v++;
      }
      index[ii++] = v - 4; index[ii++] = v - 3; index[ii++] = v - 2;
      index[ii++] = v - 4; index[ii++] = v - 2; index[ii++] = v - 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** A regular polygon frustum (a prism when the radii match): centre x, base y, centre z, radius at the
 * base, radius at the top, height, number of sides and colour (sRGB hex or a linear triple). */
export type Frustum = readonly [x: number, y: number, z: number, r0: number, r1: number, h: number, sides: number, color: number | Rgb];

/** Flat-shaded frusta with `position`, `normal` and `color`. The underside is left open because the
 * camera never sees it. */
function frusta(list: readonly Frustum[], bottomShade: number): THREE.BufferGeometry {
  const position: number[] = [], normal: number[] = [], color: number[] = [], index: number[] = [];
  for (const [fx, fy, fz, r0, r1, h, sides, tint] of list) {
    let r: number, g: number, b: number;
    if (typeof tint === 'number') { scratch.set(tint); r = scratch.r; g = scratch.g; b = scratch.b; } else { r = tint[0]; g = tint[1]; b = tint[2]; }
    const vertex = (x: number, y: number, z: number, nx: number, ny: number, nz: number, shade: number): void => {
      position.push(x, y, z); normal.push(nx, ny, nz); color.push(r * shade, g * shade, b * shade);
    };
    const centre = position.length / 3;
    if (r1 > 1e-6) vertex(fx, fy + h, fz, 0, 1, 0, 1);
    for (let j = 0; j < sides; j++) {
      const a0 = (j / sides) * Math.PI * 2, a1 = ((j + 1) / sides) * Math.PI * 2, am = (a0 + a1) / 2;
      const nl = Math.hypot(h, r0 - r1), nx = (Math.cos(am) * h) / nl, ny = (r0 - r1) / nl, nz = (Math.sin(am) * h) / nl, v = position.length / 3;
      vertex(fx + r0 * Math.cos(a1), fy, fz + r0 * Math.sin(a1), nx, ny, nz, bottomShade);
      vertex(fx + r0 * Math.cos(a0), fy, fz + r0 * Math.sin(a0), nx, ny, nz, bottomShade);
      vertex(fx + r1 * Math.cos(a0), fy + h, fz + r1 * Math.sin(a0), nx, ny, nz, 1);
      vertex(fx + r1 * Math.cos(a1), fy + h, fz + r1 * Math.sin(a1), nx, ny, nz, 1);
      index.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
    if (r1 > 1e-6) {
      // Top cap: a fan around the centre, counter-clockwise seen from above.
      const ring = position.length / 3;
      for (let j = 0; j < sides; j++) { const a = (j / sides) * Math.PI * 2; vertex(fx + r1 * Math.cos(a), fy + h, fz + r1 * Math.sin(a), 0, 1, 0, 1); }
      for (let j = 0; j < sides; j++) index.push(centre, ring + ((j + 1) % sides), ring + j);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  geometry.setIndex(index);
  return geometry;
}

/** Boxes and frusta merged into one geometry. */
export function solids(parts: readonly Part[], rounds: readonly Frustum[], bottomShade = BOTTOM_SHADE): THREE.BufferGeometry {
  const merged = mergeGeometries([voxel(parts, bottomShade), frusta(rounds, bottomShade)]);
  merged.computeBoundingSphere();
  return merged;
}

/** A white 1×1×1 box, origin at the bottom centre: lane strips, road dashes, rails, foam, ripples,
 * blob shadows and splash cubes are all this box scaled per instance. */
export function unitBoxGeometry(): THREE.BufferGeometry {
  return voxel([[0, 0, 0, 1, 1, 1, WHITE]], 0.9);
}

/** A white voxel bird, facing −z, dressed for Christmas. The 0.68-tile footprint includes the small wings;
 * the orange feet, raised head, short tail, green scarf and a red Santa hat (cream fur brim, a tip that flops
 * back and a white pompom) keep the silhouette readable in a hop and against snow. */
export function chickenGeometry(): THREE.BufferGeometry {
  const white = 0xffffff, flank = 0xdce1ef, wing = 0xf3f4fb, orange = 0xf28a25, red = 0xcf3041, eye = 0x202535;
  const hat = 0xd8263a, hatSide = 0xa81b2d, fur = 0xfff6e6, furSide = 0xe6dccb, scarf = 0x2c9a55, scarfSide = 0x1f7a42;
  return voxel([
    // Two orange legs and forward-pointing feet.
    [-0.14, 0, -0.035, 0.105, 0.13, 0.12, orange], [0.14, 0, -0.035, 0.105, 0.13, 0.12, orange],
    [-0.14, 0, -0.11, 0.13, 0.055, 0.25, orange], [0.14, 0, -0.11, 0.13, 0.055, 0.25, orange],
    // Body, breast and the upright head.
    [0, 0.12, 0.035, 0.48, 0.34, 0.48, white, 0, 0, flank],
    [0, 0.31, -0.135, 0.38, 0.41, 0.34, white, 0, 0, flank],
    // Small wing blocks and a stepped tail.
    [-0.285, 0.23, 0.04, 0.105, 0.18, 0.32, wing, 0, 0, 0xc4ccdf],
    [0.285, 0.23, 0.04, 0.105, 0.18, 0.32, wing, 0, 0, 0xc4ccdf],
    [0, 0.29, 0.285, 0.26, 0.12, 0.14, white, 0, 0, flank],
    // A green scarf round the neck with one end hanging down the back.
    [0, 0.42, -0.135, 0.41, 0.075, 0.37, scarf, 0, 0, scarfSide],
    [0.12, 0.27, 0.05, 0.09, 0.2, 0.06, scarf, 0, 0, scarfSide],
    // Santa hat: fur brim, a red crown that steps back and droops, and a pompom behind the head.
    [0, 0.70, -0.135, 0.42, 0.08, 0.38, fur, 0, 0, furSide],
    [0, 0.78, -0.12, 0.34, 0.1, 0.31, hat, 0, 0, hatSide],
    [0, 0.88, -0.08, 0.26, 0.09, 0.24, hat, 0, 0, hatSide],
    [0, 0.97, -0.02, 0.18, 0.07, 0.17, hat, 0, 0, hatSide],
    [0, 0.98, 0.09, 0.12, 0.07, 0.1, hat, 0, 0, hatSide],
    [0, 0.92, 0.17, 0.12, 0.12, 0.12, fur, 0, 0, furSide],
    // Beak, red wattle, and eyes on both sides of the head.
    [0, 0.48, -0.365, 0.18, 0.105, 0.16, orange],
    [0, 0.39, -0.31, 0.085, 0.1, 0.085, red],
    [-0.195, 0.585, -0.23, 0.025, 0.065, 0.065, eye],
    [0.195, 0.585, -0.23, 0.025, 0.065, 0.065, eye],
  ], 0.88);
}

/** The result for tinted vehicles: draw `body` with an instance tint and `detail` untinted. */
export interface VehicleParts { body: THREE.BufferGeometry; detail: THREE.BufferGeometry }

/** One instanced draw for both paint and fixed details. The paint mask keeps
 * windows, cargo and wheels unchanged when the body receives a lane colour.
 * The caller retains ownership of the two input geometries. */
export function mergeVehicle(parts: VehicleParts): THREE.BufferGeometry {
  for (const [geometry, paint] of [[parts.body, 1], [parts.detail, 0]] as const) {
    geometry.setAttribute('paint', new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count).fill(paint), 1));
  }
  return mergeGeometries([parts.body, parts.detail]);
}

/** Keep complete roofs and wheels inside the projected lane, as well as its ground footprint.
 * Length stays equal to the collision span; body and details receive the same proportions. */
function laneVehicle(parts: VehicleParts, height: number, depth: number): VehicleParts {
  parts.body.scale(1, height, depth);
  parts.detail.scale(1, height, depth);
  return parts;
}

/** Paint shades baked into tinted bodies (multiplied by the lane colour): darker sides and bumpers give the
 * two-tone voxel look, so one instance tint still reads as a lit top, shaded flank and dark trim. */
const PAINT_SIDE: Rgb = [0.84, 0.84, 0.84], PAINT_TRIM: Rgb = [0.6, 0.6, 0.6];

/** Lane-specific bodies are authored at their collision length. Wheels and windows keep their physical
 * dimensions; compact cars are not stretched wagons.
 *
 * Every car is a low, wide painted body with a darker sill and bumpers, a dark undercarriage, chunky wheels
 * with pale hubs, and a raised white cab set behind the bonnet with a dark window band split into panes.
 * The compact has a short cab and stubby bonnet; the wagon (`sedan`) a long cab with three panes; the taxi
 * the wagon's body with a roof sign and a chequered stripe along each flank. */
export function carGeometry(style: CarStyle): VehicleParts {
  const compact = style === 'compact', len = compact ? 1.2 : 1.8, e = len / 2;
  const cabLen = compact ? 0.62 : style === 'taxi' ? 0.86 : 1.0;
  const cx = compact ? -0.07 : style === 'taxi' ? -0.1 : -0.16, cy = 0.36, h = 0.27, cabD = 0.58;
  const cab = 0xf6f7ff, cabSide = 0xdfe3f3, glass = 0x262b3d, wheel = 0x1b1d26, hub = 0xd9dceb, under = 0x2b2e3b;
  const parts: Part[] = [
    // Undercarriage, then the white cab.
    [0, 0.04, 0, len - 0.16, 0.07, 0.6, under],
    [cx, cy, 0, cabLen, h, cabD, cab, 0, 0, cabSide],
    // Windscreen and rear window.
    [cx + cabLen / 2 + 0.006, cy + 0.06, 0, 0.012, h - 0.11, cabD - 0.1, glass],
    [cx - cabLen / 2 - 0.006, cy + 0.06, 0, 0.012, h - 0.11, cabD - 0.1, glass],
    // Lights and grille, inside the collision length.
    [e - 0.01, 0.2, 0.24, 0.02, 0.07, 0.11, 0xfff1c4], [e - 0.01, 0.2, -0.24, 0.02, 0.07, 0.11, 0xfff1c4],
    [e - 0.01, 0.13, 0, 0.02, 0.06, 0.3, 0x3a3e4e],
    [-e + 0.01, 0.2, 0.25, 0.02, 0.07, 0.1, 0xd8343c], [-e + 0.01, 0.2, -0.25, 0.02, 0.07, 0.1, 0xd8343c],
  ];
  // Side window panes separated by white pillars.
  const panes = compact ? 2 : style === 'taxi' ? 2 : 3, span = cabLen - 0.12, paneLen = (span - (panes - 1) * 0.05) / panes;
  for (let i = 0; i < panes; i++) {
    const x = cx - span / 2 + paneLen / 2 + i * (paneLen + 0.05);
    for (const z of [-1, 1]) parts.push([x, cy + 0.07, z * (cabD / 2 + 0.006), paneLen, h - 0.13, 0.012, glass]);
  }
  const wx = compact ? e - 0.27 : e - 0.33;
  for (const x of [-wx, wx]) for (const z of [-0.33, 0.33]) {
    parts.push([x, 0, z, 0.26, 0.26, 0.13, wheel], [x, 0.08, z + Math.sign(z) * 0.07, 0.1, 0.1, 0.012, hub]);
  }
  if (style === 'taxi') {
    parts.push([cx, cy + h, 0, 0.16, 0.08, 0.3, 0xffd84a, 0, 0, 0xe0b52c], [cx, cy + h + 0.08, 0, 0.12, 0.012, 0.22, 0xfff6c8]);
    // A chequered stripe along each flank.
    for (let x = -e + 0.2, i = 0; x < e - 0.2; x += 0.1, i++) if (i % 2 === 0) for (const z of [-1, 1]) parts.push([x, 0.26, z * 0.366, 0.1, 0.05, 0.012, 0x262b3d]);
  }
  const bonnet = compact ? 0.24 : 0.4;
  return laneVehicle({body: voxel([
    [0, 0.1, 0, len, 0.26, 0.72, WHITE, 0, 0, PAINT_SIDE],
    // A darker sill and bumpers, and a raised bonnet in front of the cab.
    [0, 0.1, 0, len - 0.24, 0.07, 0.74, PAINT_TRIM],
    [e - 0.04, 0.1, 0, 0.08, 0.13, 0.74, PAINT_TRIM], [-e + 0.04, 0.1, 0, 0.08, 0.13, 0.74, PAINT_TRIM],
    [e - bonnet / 2 - 0.02, cy, 0, bonnet, 0.04, 0.66, WHITE, 0, 0, PAINT_SIDE],
    [-e + 0.13, cy, 0, 0.2, 0.025, 0.66, WHITE, 0, 0, PAINT_SIDE],
  ]), detail: voxel(parts)}, 1, 0.88);
}

/** A delivery lorry of 2 or 3 tiles (x), 0.84 wide: a tall tinted cab with a white roof cap, wide windscreen,
 * grille, bumper and mirrors at the front (+x), then a gap and an oversized white / blue-grey box trailer with
 * ribbed panels and rear doors on a dark chassis. The cab is 0.86 tall and the trailer 0.96. */
export function truckGeometry(len: 2 | 3): VehicleParts {
  const e = len / 2, cab = 0.74, cargoLen = len - cab - 0.1, cargoX = -e + cargoLen / 2;
  const glass = 0x2b3040, wheel = 0x1d2029, hub = 0xc9cddd, chassis = 0x343945, cargo = 0xeef2fb;
  // Baked side lift keeps the cargo blue-grey under the weak side-facing hemisphere light.
  const cargoSide: Rgb = [1.36, 1.51, 2.23], rib: Rgb = [1.08, 1.2, 1.85];
  const parts: Part[] = [
    [0, 0.08, 0, len, 0.14, 0.7, chassis],
    [cargoX, 0.22, 0, cargoLen, 0.74, 0.84, cargo, 0, 0, cargoSide],
    // windscreen, side windows and the white roof cap
    [e - 0.2, 0.52, 0, 0.05, 0.24, 0.66, glass],
    [e - 0.48, 0.52, 0.405, 0.3, 0.22, 0.03, glass], [e - 0.48, 0.52, -0.405, 0.3, 0.22, 0.03, glass],
    [e - cab / 2 - 0.1, 0.86, 0, cab - 0.2, 0.05, 0.8, 0xf4f6fc, 0, 0, 0xd7dbea],
    // grille, lights, bumper and mirrors
    [e - 0.005, 0.2, 0, 0.01, 0.16, 0.4, 0x4a4f5e],
    [e - 0.01, 0.22, 0.29, 0.02, 0.08, 0.12, 0xffe08a], [e - 0.01, 0.22, -0.29, 0.02, 0.08, 0.12, 0xffe08a],
    [e - 0.02, 0.08, 0, 0.04, 0.08, 0.82, chassis],
    [e - 0.26, 0.56, 0.43, 0.04, 0.14, 0.04, chassis], [e - 0.26, 0.56, -0.43, 0.04, 0.14, 0.04, chassis],
    // rear doors and tail lights
    [-e + 0.005, 0.26, 0, 0.01, 0.66, 0.02, 0x9aa3c0],
    [-e + 0.01, 0.16, 0.3, 0.02, 0.06, 0.12, 0xff5a5a], [-e + 0.01, 0.16, -0.3, 0.02, 0.06, 0.12, 0xff5a5a],
  ];
  // Vertical ribs along both trailer flanks.
  for (let x = cargoX - cargoLen / 2 + 0.2; x < cargoX + cargoLen / 2 - 0.1; x += 0.36) for (const z of [-1, 1]) parts.push([x, 0.26, z * 0.425, 0.04, 0.66, 0.012, rib]);
  const axle = (x: number): void => {
    for (const z of [-1, 1]) parts.push([x, 0, z * 0.375, 0.28, 0.28, 0.12, wheel], [x, 0.09, z * 0.44, 0.1, 0.1, 0.012, hub]);
  };
  axle(e - 0.34);
  axle(-e + 0.36);
  if (len === 3) axle(-e + 0.72);
  return laneVehicle({
    body: voxel([
      // Coloured cab and short nose; the trailer stays white / blue-grey.
      [e - cab / 2 - 0.1, 0.16, 0, cab - 0.2, 0.7, 0.8, WHITE, 0, 0, PAINT_SIDE],
      [e - 0.1, 0.16, 0, 0.2, 0.36, 0.78, WHITE, 0, 0, PAINT_SIDE],
      [e - 0.1, 0.16, 0, 0.2, 0.05, 0.8, PAINT_TRIM],
    ]),
    detail: voxel(parts),
  }, 0.79, 0.66);
}

/** Train pieces, each 2.0 long (x, front at +x), 0.8 wide, drawn 0.1 above the rails: a locomotive
 * `nose` (sloped front, tall cab, headlight, dark roof) and a `carriage` (stripe, window row, roof,
 * bogies). The body is tinted per train and carries the colour; the stripe, windows and roof stay
 * fixed so every train reads as long, striped and windowed, never like a car. */
export function trainGeometry(): { nose: VehicleParts; carriage: VehicleParts } {
  const stripe = 0xfff4dc, glass = 0x2b3040, roof = 0x4b5262, dark = 0x2c2f38;
  const windows: Part[] = [];
  for (const x of [-0.72, -0.24, 0.24, 0.72]) windows.push([x, 0.5, 0.405, 0.34, 0.2, 0.02, glass], [x, 0.5, -0.405, 0.34, 0.2, 0.02, glass]);
  const bogies: Part[] = [
    [-0.62, 0.0, 0, 0.7, 0.14, 0.56, dark], [0.62, 0.0, 0, 0.7, 0.14, 0.56, dark],
    [-0.62, 0.0, 0.3, 0.5, 0.1, 0.06, 0x8a929c], [-0.62, 0.0, -0.3, 0.5, 0.1, 0.06, 0x8a929c],
    [0.62, 0.0, 0.3, 0.5, 0.1, 0.06, 0x8a929c], [0.62, 0.0, -0.3, 0.5, 0.1, 0.06, 0x8a929c],
  ];
  return {
    carriage: laneVehicle({
      body: voxel([[0, 0.12, 0, 2.0, 0.64, 0.8, WHITE]]),
      detail: voxel([
        [0, 0.76, 0, 1.96, 0.08, 0.68, roof],
        [0, 0.3, 0.405, 2.0, 0.12, 0.02, stripe], [0, 0.3, -0.405, 2.0, 0.12, 0.02, stripe],
        ...windows, ...bogies,
        [0.97, 0.2, 0, 0.08, 0.06, 0.2, dark], [-0.97, 0.2, 0, 0.08, 0.06, 0.2, dark],
      ]),
    }, 0.78, 0.65),
    nose: laneVehicle({
      body: voxel([
        [-0.275, 0.12, 0, 1.45, 0.72, 0.8, WHITE],
        [0.58, 0.12, 0, 0.26, 0.5, 0.8, WHITE],
        [0.79, 0.12, 0, 0.16, 0.36, 0.78, WHITE],
        [0.935, 0.12, 0, 0.13, 0.24, 0.74, WHITE],
      ]),
      detail: voxel([
        [-0.275, 0.84, 0, 1.4, 0.07, 0.72, roof],
        [-0.55, 0.91, 0, 0.3, 0.1, 0.3, dark],
        [0.455, 0.62, 0, 0.04, 0.17, 0.62, glass],
        [-0.12, 0.52, 0.405, 0.5, 0.22, 0.02, glass], [-0.12, 0.52, -0.405, 0.5, 0.22, 0.02, glass],
        [-0.55, 0.52, 0.405, 0.22, 0.22, 0.02, glass], [-0.55, 0.52, -0.405, 0.22, 0.22, 0.02, glass],
        [-0.275, 0.3, 0.405, 1.45, 0.12, 0.02, stripe], [-0.275, 0.3, -0.405, 1.45, 0.12, 0.02, stripe],
        [0.58, 0.3, 0.405, 0.26, 0.12, 0.02, stripe], [0.58, 0.3, -0.405, 0.26, 0.12, 0.02, stripe],
        [0.79, 0.3, 0.395, 0.16, 0.12, 0.02, stripe], [0.79, 0.3, -0.395, 0.16, 0.12, 0.02, stripe],
        [0.995, 0.2, 0, 0.03, 0.1, 0.34, 0xfff3b0],
        [0.98, 0.1, 0, 0.05, 0.06, 0.8, dark],
        ...bogies,
        [-0.97, 0.2, 0, 0.08, 0.06, 0.2, dark],
      ]),
    }, 0.78, 0.65),
  };
}

/** Flat voxel log beams 0.64 deep and 0.26 tall, tinted per log, with rectangular pale end-grain caps, a darker
 * plank patchwork across the top and drifts of snow. The tinted beam and patchwork carry `paint` 1, end grain and
 * snow carry 0 (see mergeVehicle), so one instanced draw keeps the snow white whatever the log colour. A local
 * integer hash gives each length a stable, uneven pattern without world RNG draws. */
export function logGeometry(len: 2 | 3 | 4): THREE.BufferGeometry {
  const e = len / 2, dark: Rgb = [0.6, 0.6, 0.63], light: Rgb = [1.18, 1.14, 1.1];
  const top = 0.26, body: Part[] = [[0, 0, 0, len - 0.06, top, 0.64, WHITE, 0, 0, [0.8, 0.8, 0.8]]];
  const detail: Part[] = [];
  const h = (i: number): number => Math.imul(i + len * 131 + 7, 0x45d9f3b) >>> 0;
  // Three rows of planks, each a run of segments of uneven length, alternately darker and lighter.
  for (let r = 0; r < 3; r++) {
    let x = -e + 0.06 + (h(r) % 5) * 0.03;
    for (let i = 0; x < e - 0.2; i++) {
      const w = Math.min(e - 0.08 - x, 0.3 + (h(r * 17 + i) % 6) * 0.08);
      if ((i + r) % 2 === 0 || h(r * 31 + i) % 3 === 0) body.push([x + w / 2, top, (r - 1) * 0.2, w - 0.04, 0.012, 0.15, (i + r) % 3 === 0 ? light : dark]);
      x += w;
    }
  }
  // End grain: a pale cap with a darker ring at each end of the beam.
  for (const s of [-1, 1]) {
    detail.push([s * (e - 0.03), 0.01, 0, 0.06, 0.24, 0.6, 0xdcae7c, 0, 0, 0xc99a68]);
    detail.push([s * (e - 0.001), 0.07, 0, 0.002, 0.12, 0.3, 0x9c6a43]);
  }
  // Snow: a few small irregular drifts hugging one edge or the middle, each with a lump on top.
  const drifts = len + 1;
  for (let i = 0; i < drifts; i++) {
    const k = h(90 + i);
    if (i > 0 && k % 3 === 0) continue;
    const w = 0.18 + (k % 4) * 0.07, x = -e + 0.3 + (len - 0.6) * (i + 0.5) / drifts + ((k >>> 4) % 5 - 2) * 0.05;
    const dz = 0.14 + ((k >>> 12) % 3) * 0.05, z = ((k >>> 8) % 3 - 1) * (0.32 - dz / 2);
    detail.push([x, top, z, w, 0.035, dz, 0xf7fbff, 0, 0, 0xdbe5f3]);
    if ((k >>> 15) % 2 === 0) detail.push([x + ((k >>> 16) % 3 - 1) * 0.04, top + 0.035, z, w * 0.5, 0.025, dz * 0.6, 0xffffff, 0, 0, 0xdbe5f3]);
  }
  const b = voxel(body, 0.87), d = voxel(detail, 0.9), merged = mergeVehicle({body: b, detail: d});
  b.dispose(); d.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/** Thin stepped pads, with one shallow notch. The whole cell remains safe support. */
export function lilyGeometry(): THREE.BufferGeometry {
  return voxel([
    [0, 0, 0, 0.49, 0.035, 0.34, 0x43b958], [0, 0, 0, 0.34, 0.035, 0.49, 0x43b958],
    [-0.018, 0.035, -0.018, 0.33, 0.018, 0.33, 0x51c65f],
    [0.19, 0.035, 0.035, 0.12, 0.005, 0.05, 0x3d9e50],
  ], 0.93);
}

const BARK = 0x6a4636, BARK_SIDE = 0x523629, SNOW = 0xf6faff, SNOW_SIDE = 0xd9e3f1;

/** Bare winter trees: a thick trunk that forks into stepped limbs and upturned twigs, spreading about as wide as a
 * tile so a tree still reads as a blocker. Every limb, twig tip and the crown carries snow, with a mound at the
 * foot. Variants 0..2 grow taller (0.8, 1.1 and 1.4 trunks) and mirror their branching; variant 3 is a short
 * snow-capped stump. Baked colours, so the instance tint stays white. */
export function treeGeometry(variant: number): THREE.BufferGeometry {
  if (variant === 3) return voxel([
    [0, 0, 0, 0.42, 0.07, 0.42, SNOW, 0, 0, SNOW_SIDE],
    [0, 0, 0, 0.35, 0.32, 0.35, 0x613d48, 0, 0, 0x4b2d3b],
    [0, 0.32, 0, 0.37, 0.05, 0.37, SNOW, 0, 0, SNOW_SIDE],
  ], 0.9);
  const v = clampInt(variant, 0, 2), H = 0.8 + 0.3 * v, m = v === 1 ? -1 : 1, t = 0.12;
  const parts: Part[] = [
    [0, 0, 0, 0.52, 0.08, 0.52, SNOW, 0, 0, SNOW_SIDE],
    [0, 0, 0, 0.26, H, 0.26, BARK, 0, 0, BARK_SIDE],
    // The crown: a short leader with a snowy cap.
    [0, H, 0, 0.14, 0.32, 0.14, BARK, 0, 0, BARK_SIDE],
    [0, H + 0.32, 0, 0.18, 0.05, 0.18, SNOW, 0, 0, SNOW_SIDE],
    [0, H, 0, 0.3, 0.045, 0.3, SNOW, 0, 0, SNOW_SIDE],
  ];
  /** One limb: out from the trunk along (dx, dz) at height y, then a twig up by `up`, snow on both. */
  const limb = (y: number, dx: number, dz: number, reach: number, up: number): void => {
    const ox = dx * (t + reach / 2), oz = dz * (t + reach / 2), tx = dx * (t + reach - 0.05), tz = dz * (t + reach - 0.05);
    parts.push([ox, y, oz, dx ? reach : 0.1, 0.1, dz ? reach : 0.1, BARK, 0, 0, BARK_SIDE]);
    parts.push([ox, y + 0.1, oz, dx ? reach : 0.12, 0.035, dz ? reach : 0.12, SNOW, 0, 0, SNOW_SIDE]);
    parts.push([tx, y + 0.1, tz, 0.1, up, 0.1, BARK, 0, 0, BARK_SIDE]);
    parts.push([tx, y + 0.1 + up, tz, 0.13, 0.04, 0.13, SNOW, 0, 0, SNOW_SIDE]);
  };
  // Two tiers of limbs on alternating sides, front and back, reaching out to about ±0.38.
  limb(H * 0.45, -m, 0, 0.24, 0.3);
  limb(H * 0.7, m, 0, 0.22, 0.32);
  limb(H * 0.58, 0, 1, 0.18, 0.24);
  limb(H * 0.82, 0, -1, 0.16, 0.22);
  if (v >= 1) limb(H * 0.95, -m, 0, 0.14, 0.2);
  if (v >= 2) { limb(H * 0.32, m, 0, 0.16, 0.18); limb(H * 0.4, 0, -1, 0.14, 0.16); }
  return voxel(parts, 0.9);
}

const clampInt = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v | 0));

/** Lavender notched boulders, split tops and low clusters, each with a snow cap on its highest block. */
export function rockGeometry(variant: number): THREE.BufferGeometry {
  const top=0xab99c9, side=0x7e6c9a, cap = (x: number, y: number, z: number, w: number, d: number): Part => [x, y, z, w, 0.05, d, SNOW, 0, 0, SNOW_SIDE];
  if(variant<=0) return voxel([
    [0,0,0,0.77,0.30,0.64,top,0,0,side],
    [-0.10,0.30,-0.12,0.56,0.15,0.37,top,0,0,side],
    [0.17,0.30,0.13,0.19,0.15,0.15,top,0,0,side],
    cap(-0.12,0.45,-0.12,0.44,0.3),
  ],0.91);
  if(variant===1) return voxel([
    [-0.16,0,-0.04,0.45,0.46,0.62,top,0,0,side],
    [0.20,0,0.07,0.29,0.32,0.45,top,0,0,side],
    cap(-0.16,0.46,-0.04,0.4,0.54), cap(0.2,0.32,0.07,0.22,0.36),
  ],0.91);
  return voxel([
    [0,0,0,0.80,0.25,0.70,top,0,0,side],
    [-0.13,0.25,0.09,0.44,0.14,0.31,top,0,0,side],
    [0.23,0.25,-0.06,0.17,0.14,0.40,top,0,0,side],
    cap(-0.13,0.39,0.09,0.36,0.26),
  ],0.91);
}

/** A striped post with a wide black lamp box, red front bulb and white cap.
 * The separate bulb is centred at y=1.27 so it can flash and swell visibly. */
export function signalPostGeometry(): THREE.BufferGeometry {
  const red = 0xa94750, white = 0xe5deef;
  const parts: Part[] = [
    [0, 0, 0, 0.2, 0.06, 0.10, 0x4b505c],
    [0, 0.06, 0, 0.1, 1.12, 0.1, white],
    [0, 1.12, 0, 0.5, 0.3, 0.08, 0x24232f],
    [0, 1.42, 0, 0.115, 0.11, 0.09, white],
  ];
  for (const y of [0.12, 0.38, 0.64, 0.9]) parts.push([0, y, 0, 0.112, 0.13, 0.096, red]);
  return voxel(parts, 0.92);
}

/** The signal lamp bulb: a 0.2 cube centred on its origin so it pulses about its centre. */
export function lampGeometry(): THREE.BufferGeometry {
  return voxel([[0, -0.1, 0, 0.2, 0.2, 0.2, WHITE]], 1);
}

/** The cartoon UFO: a ten-sided lavender saucer with a pale dome and a ring of yellow lights, about 1.8
 * wide, wearing a Santa hat on its dome (a fur brim, a stepped red cone whose tip flops to one side and a
 * pompom), about 1.15 tall in all. Origin at the centre of the underside, where the beam starts. */
export function ufoGeometry(): THREE.BufferGeometry {
  const saucer = 0xc59bd2, hull = 0xa97fba, under = 0x8e6aa0, top = 0xd6b3e2, glass = 0xe8f4ff, light = 0xffd461, n = 10;
  const hat = 0xd8263a, hatSide = 0xa81b2d, fur = 0xfff6e6, furSide = 0xe6dccb;
  const parts: Part[] = [];
  for (let i = 0; i < 10; i++) {
    const a = ((i + 0.5) / 10) * Math.PI * 2;
    parts.push([Math.cos(a) * 0.86, 0.2, Math.sin(a) * 0.86, 0.13, 0.1, 0.13, light]);
  }
  // The hat's drooping tip and pompom hang off the cone towards +x.
  parts.push([0.13, 0.94, 0, 0.16, 0.09, 0.13, hat, 0, 0, hatSide], [0.25, 0.86, 0, 0.1, 0.1, 0.1, hat, 0, 0, hatSide]);
  parts.push([0.3, 0.72, 0, 0.16, 0.16, 0.16, fur, 0, 0, furSide]);
  return solids(parts, [
    [0, 0, 0, 0.3, 0.26, 0.07, n, under],
    [0, 0.06, 0, 0.4, 0.8, 0.14, n, hull],
    [0, 0.2, 0, 0.85, 0.85, 0.09, n, saucer],
    [0, 0.29, 0, 0.85, 0.5, 0.11, n, top],
    [0, 0.4, 0, 0.46, 0.34, 0.12, n, glass],
    [0, 0.5, 0, 0.37, 0.37, 0.09, n, fur],
    [0, 0.59, 0, 0.3, 0.22, 0.18, n, hat],
    [0, 0.77, 0, 0.22, 0.12, 0.17, n, hat],
  ], 0.92);
}

/** Fills a geometry with `position` and an rgba `color` (alpha fades) from rings of [radius, alpha]. */
function radial(rows: readonly (readonly [number, number])[], segments: number, hex: number): THREE.BufferGeometry {
  scratch.set(hex);
  const position = new Float32Array(rows.length * segments * 3), color = new Float32Array(rows.length * segments * 4);
  const index: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2, o = i * segments + j;
      position.set([Math.cos(a) * rows[i][0], 0, Math.sin(a) * rows[i][0]], o * 3);
      color.set([scratch.r, scratch.g, scratch.b, rows[i][1]], o * 4);
      if (i > 0) {
        const j2 = (j + 1) % segments, p0 = (i - 1) * segments + j, p1 = (i - 1) * segments + j2, q0 = i * segments + j, q1 = i * segments + j2;
        index.push(p0, q0, p1, p1, q0, q1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 4));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

/** The UFO's tractor beam: an eight-sided open cone from a 0.4 radius at y = 0 down to a 0.92 radius
 * at y = −1 (scale y to the drop), pale mint, fading from alpha 0.7 at the top to 0.12 at the bottom. */
export function beamGeometry(): THREE.BufferGeometry {
  scratch.set(0xc9fff0);
  const sides = 8, position = new Float32Array(sides * 2 * 3), color = new Float32Array(sides * 2 * 4), index: number[] = [];
  for (let j = 0; j < sides; j++) {
    const a = ((j + 0.5) / sides) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    position.set([c * 0.4, 0, s * 0.4, c * 0.92, -1, s * 0.92], j * 6);
    color.set([scratch.r, scratch.g, scratch.b, 0.7, scratch.r, scratch.g, scratch.b, 0.12], j * 8);
    const j2 = (j + 1) % sides;
    index.push(j * 2, j * 2 + 1, j2 * 2, j2 * 2, j * 2 + 1, j2 * 2 + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 4));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

/** The idle-warning spotlight: a flat soft pale-yellow ring (radius 0.84 outside, bright at 0.68)
 * with a faint fill, lying in the xz plane at y = 0 with rgba vertex colours. */
export function spotRingGeometry(): THREE.BufferGeometry {
  return radial([[0, 0.14], [0.56, 0.14], [0.68, 0.95], [0.84, 0]], 28, 0xfff2a6);
}

/** The UFO's shadow: a soft dark disc of radius 1 in the xz plane at y = 0 (darkest at the centre). */
export function ufoShadowGeometry(): THREE.BufferGeometry {
  return radial([[0, 0.42], [0.55, 0.34], [1, 0]], 28, 0x0b1410);
}

/** The soft dark ellipse under the bird: a disc of radius 1 in the xz plane at y = 0, darkest (alpha
 * 0.58) in the middle and fading to nothing at the rim; scale it to the bird's footprint. */
export function dropShadowGeometry(): THREE.BufferGeometry {
  return radial([[0, 0.58], [0.5, 0.5], [1, 0]], 24, 0x0b1410);
}

/** A soft red ground spill; the small solid bulb is rendered separately. */
export function signalGlowGeometry(): THREE.BufferGeometry {
  return radial([[0, 0.34], [0.38, 0.24], [1, 0]], 24, 0xff1532);
}
