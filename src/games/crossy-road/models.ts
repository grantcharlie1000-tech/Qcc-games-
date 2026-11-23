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
import {carLength, type CarModel, type Loco, type TruckModel, type Wagon} from './variety';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A linear RGB triple; components may exceed 1 (used to keep a fixed colour under an instance tint). */
export type Rgb = readonly [r: number, g: number, b: number];
/** One box: x centre, y bottom, z centre, width (x), height (y), depth (z), colour (sRGB hex or a
 * linear triple), optional rotations through the box centre (radians: about x first, then about z) and
 * an optional colour for every face but the top (the sides and the underside). */
export type Part = readonly [x: number, y: number, z: number, w: number, h: number, d: number, color: number | Rgb, rotZ?: number, rotX?: number, side?: number | Rgb];

/** Palettes shared with the renderer so instance tints and baked colours agree. */
/** Car paints. Taxi yellow is not among them: only taxis wear it. */
export const CAR_COLORS: readonly number[] = [0xe43135, 0x23c6ed, 0x9a4adb, 0x85bd42, 0x3f75bc, 0xf18a32, 0xff7fb0, 0x2ea59a, 0xf2f3f8, 0x3b3f4c, 0xaeb5c6, 0x9a6242, 0x1f3f8f];
export const TRUCK_COLORS: readonly number[] = [0xbd163c, 0x13bfdc, 0x8a3e92, 0x477db3, 0xe67c2c, 0x3f9d4f, 0xf2c230, 0x2c8f8a, 0xe9ecf4, 0x4a5063];
export const TRAIN_COLORS: readonly number[] = [0xe94f64, 0x3a86ff, 0x2bb673, 0xf4a259, 0x8a4fd8, 0x1fa7a0, 0x8f2d3a, 0x2f4a7d];
export const CONTAINER_COLORS: readonly number[] = [0xd8452f, 0x2f7fd0, 0x3f9d4f, 0xf2b530, 0xe07a2c, 0x7b8496];
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
  // Build bounds once, not once for every face/occluder pair at scene startup.
  const bounds = parts.map(([x, y, z, w, h, d]) => [x-w/2, y, z-d/2, x+w/2, y+h, z+d/2]);
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
      // Reject only whole, axis-aligned faces covered by another solid. Keep
      // partial faces, rotated boxes and coincident outer paint layers intact.
      const face = FACES[f];
      if (!rotZ && !rotX && parts.some((other, q) => {
        if (q === p || other[7] || other[8]) return false;
        const box = bounds[p], cover = bounds[q];
        const axis = f < 2 ? 0 : f < 4 ? 1 : 2, sign = face[axis], plane = box[axis + (sign > 0 ? 3 : 0)], eps = 1e-7;
        if (sign > 0 ? cover[axis] > plane + eps || cover[axis+3] <= plane + eps : cover[axis+3] < plane - eps || cover[axis] >= plane - eps) return false;
        for (let a = 0; a < 3; a++) if (a !== axis && (cover[a] > box[a] + eps || cover[a+3] < box[a+3] - eps)) return false;
        return true;
      })) continue;
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
  geometry.setAttribute('position', new THREE.BufferAttribute(position.slice(0, v * 3), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal.slice(0, v * 3), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color.slice(0, v * 3), 3));
  geometry.setIndex(new THREE.BufferAttribute(index.slice(0, ii), 1));
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
const CAB = 0xf6f7ff, CAB_SIDE = 0xdfe3f3, GLASS = 0x262b3d, WHEEL = 0x1b1d26, HUB = 0xd9dceb, UNDER = 0x2b2e3b;
const PINE = 0x2f8a55, PINE_SIDE = 0x1f6b40, TIMBER = 0x8a5a3c, TIMBER_SIDE = 0x6a4230, GRAIN = 0xdcae7c;
/** Top of a car's painted body. */
const CAR_TOP = 0.36;

/** A cab on a car body: a box (white, or painted when `shell` is the body list), a windscreen, a rear window and
 * side panes separated by pillars. */
function cabin(detail: Part[], shell: Part[], cx: number, len: number, h: number, panes: number): void {
  const d = 0.58, painted = shell !== detail;
  shell.push([cx, CAR_TOP, 0, len, h, d, painted ? WHITE : CAB, 0, 0, painted ? PAINT_SIDE : CAB_SIDE]);
  for (const s of [-1, 1]) detail.push([cx + s * (len / 2 + 0.006), CAR_TOP + 0.06, 0, 0.012, h - 0.11, d - 0.1, GLASS]);
  // Wing mirrors, and a door seam with a handle on each side.
  for (const z of [-1, 1]) detail.push([cx + len / 2 - 0.05, CAR_TOP + 0.02, z * (d / 2 + 0.05), 0.06, 0.06, 0.07, UNDER],
    [cx - 0.02, 0.18, z * 0.362, 0.012, 0.18, 0.008, UNDER], [cx - 0.12, 0.3, z * 0.364, 0.08, 0.022, 0.012, HUB]);
  const span = len - 0.12, paneLen = (span - (panes - 1) * 0.05) / panes;
  for (let i = 0; i < panes; i++) {
    const x = cx - span / 2 + paneLen / 2 + i * (paneLen + 0.05);
    for (const z of [-1, 1]) detail.push([x, CAR_TOP + 0.07, z * (d / 2 + 0.006), paneLen, h - 0.13, 0.012, GLASS]);
  }
}

/** Lane-specific bodies are authored at their collision length. Wheels and windows keep their physical
 * dimensions; compact cars are not stretched wagons.
 *
 * Every car is a low, wide painted body with a darker sill and bumpers, a dark undercarriage, chunky wheels
 * with pale hubs and lights at both ends. On top of that:
 * compact: a short white cab and a stubby bonnet. mini: a painted cab with a white roof and a present on it.
 * sedan: a long white cab with three panes. taxi: a roof sign and a chequered stripe. police: a sedan with a
 * light bar and a blue band. pickup: a short cab and an open bed that carries a Christmas tree.
 * van: a tall painted box with a white stripe. sports: a low glass canopy, a long striped bonnet and a spoiler. */
export function carGeometry(model: CarModel): VehicleParts {
  const len = carLength(model), e = len / 2, wx = len < 1.5 ? e - 0.27 : e - 0.33;
  const detail: Part[] = [
    [0, 0.04, 0, len - 0.16, 0.07, 0.6, UNDER],
    // Lights and grille, inside the collision length.
    [e - 0.01, 0.2, 0.24, 0.02, 0.07, 0.11, 0xfff1c4], [e - 0.01, 0.2, -0.24, 0.02, 0.07, 0.11, 0xfff1c4],
    [e - 0.01, 0.13, 0, 0.02, 0.06, 0.3, 0x3a3e4e],
    [-e + 0.01, 0.2, 0.25, 0.02, 0.07, 0.1, 0xd8343c], [-e + 0.01, 0.2, -0.25, 0.02, 0.07, 0.1, 0xd8343c],
  ];
  for (const x of [-wx, wx]) for (const z of [-0.33, 0.33]) {
    detail.push([x, 0, z, 0.26, 0.26, 0.13, WHEEL], [x, 0.08, z + Math.sign(z) * 0.07, 0.1, 0.1, 0.012, HUB]);
  }
  const body: Part[] = [
    [0, 0.1, 0, len, 0.26, 0.72, WHITE, 0, 0, PAINT_SIDE],
    // A darker sill and bumpers.
    [0, 0.1, 0, len - 0.24, 0.07, 0.74, PAINT_TRIM],
    [e - 0.04, 0.1, 0, 0.08, 0.13, 0.74, PAINT_TRIM], [-e + 0.04, 0.1, 0, 0.08, 0.13, 0.74, PAINT_TRIM],
  ];
  /** A raised bonnet in front of the cab and a low boot lid behind it. */
  const bonnet = (length: number, boot = true): void => {
    body.push([e - length / 2 - 0.02, CAR_TOP, 0, length, 0.04, 0.66, WHITE, 0, 0, PAINT_SIDE]);
    if (boot) body.push([-e + 0.13, CAR_TOP, 0, 0.2, 0.025, 0.66, WHITE, 0, 0, PAINT_SIDE]);
  };
  switch (model) {
    case 'compact': cabin(detail, detail, -0.07, 0.62, 0.27, 2); bonnet(0.24); break;
    case 'mini': {
      cabin(detail, body, -0.04, 0.74, 0.28, 2); bonnet(0.2, false);
      detail.push([-0.04, 0.64, 0, 0.66, 0.03, 0.5, CAB, 0, 0, CAB_SIDE]);
      // A present strapped to the roof.
      detail.push([-0.06, 0.67, 0, 0.26, 0.13, 0.26, 0xd8263a, 0, 0, 0xa81b2d],
        [-0.06, 0.67, 0, 0.27, 0.135, 0.07, 0xffd84a], [-0.06, 0.67, 0, 0.07, 0.135, 0.27, 0xffd84a]);
      break;
    }
    case 'sedan': cabin(detail, detail, -0.16, 1.0, 0.27, 3); bonnet(0.4); break;
    case 'taxi': {
      cabin(detail, detail, -0.1, 0.86, 0.27, 2); bonnet(0.4);
      detail.push([-0.1, 0.63, 0, 0.16, 0.08, 0.3, 0xffd84a, 0, 0, 0xe0b52c], [-0.1, 0.71, 0, 0.12, 0.012, 0.22, 0xfff6c8]);
      // A chequered stripe along each flank.
      for (let x = -e + 0.2, i = 0; x < e - 0.2; x += 0.1, i++) if (i % 2 === 0) for (const z of [-1, 1]) detail.push([x, 0.26, z * 0.366, 0.1, 0.05, 0.012, GLASS]);
      break;
    }
    case 'police': {
      cabin(detail, detail, -0.16, 1.0, 0.27, 3); bonnet(0.4);
      detail.push([-0.16, 0.63, 0.12, 0.14, 0.07, 0.2, 0xe43135], [-0.16, 0.63, -0.12, 0.14, 0.07, 0.2, 0x2f6fe8], [-0.16, 0.63, 0, 0.14, 0.05, 0.04, 0x2b2e3b]);
      for (const z of [-1, 1]) detail.push([0, 0.21, z * 0.366, len - 0.4, 0.09, 0.012, 0x2a5bd7]);
      break;
    }
    case 'pickup': {
      cabin(detail, detail, 0.14, 0.52, 0.27, 1); bonnet(0.34, false);
      // The bed: two side rails and a tailgate.
      for (const z of [-1, 1]) body.push([-0.44, CAR_TOP, z * 0.33, 0.84, 0.1, 0.06, WHITE, 0, 0, PAINT_SIDE]);
      body.push([-e + 0.05, CAR_TOP, 0, 0.06, 0.1, 0.6, WHITE, 0, 0, PAINT_SIDE]);
      detail.push([-0.46, CAR_TOP, 0, 0.74, 0.012, 0.58, 0x3a3e4e]);
      // A Christmas tree on its side, the trunk toward the cab.
      detail.push([-0.2, 0.39, 0, 0.14, 0.07, 0.07, 0x6a4636],
        [-0.42, 0.372, 0, 0.3, 0.22, 0.46, PINE, 0, 0, PINE_SIDE], [-0.62, 0.372, 0, 0.16, 0.17, 0.34, PINE, 0, 0, PINE_SIDE],
        [-0.75, 0.372, 0, 0.12, 0.12, 0.2, PINE, 0, 0, PINE_SIDE], [-0.44, 0.592, 0.03, 0.18, 0.02, 0.2, 0xf6faff]);
      break;
    }
    case 'van': {
      body.push([-0.14, CAR_TOP, 0, 1.44, 0.34, 0.7, WHITE, 0, 0, PAINT_SIDE]);
      bonnet(0.28, false);
      detail.push([0.586, 0.42, 0, 0.012, 0.24, 0.6, GLASS], [-0.866, 0.44, 0, 0.012, 0.2, 0.5, GLASS],
        [-0.14, 0.7, 0, 1.36, 0.03, 0.6, CAB, 0, 0, CAB_SIDE]);
      for (const z of [-1, 1]) detail.push([0.4, 0.46, z * 0.356, 0.28, 0.2, 0.012, GLASS], [-0.34, 0.45, z * 0.356, 0.96, 0.07, 0.012, CAB]);
      break;
    }
    case 'sports': {
      bonnet(0.56);
      // A low glass canopy under a painted roof, two bonnet stripes and a rear wing on posts.
      detail.push([-0.14, CAR_TOP, 0, 0.6, 0.15, 0.56, GLASS]);
      body.push([-0.14, 0.51, 0, 0.5, 0.03, 0.5, WHITE, 0, 0, PAINT_SIDE], [-e + 0.1, 0.45, 0, 0.14, 0.03, 0.7, WHITE, 0, 0, PAINT_SIDE]);
      for (const z of [-1, 1]) detail.push([e - 0.3, 0.4, z * 0.08, 0.56, 0.006, 0.07, CAB], [-e + 0.1, CAR_TOP, z * 0.26, 0.05, 0.09, 0.05, UNDER]);
      break;
    }
  }
  return laneVehicle({body: voxel(body), detail: voxel(detail)}, 1, 0.88);
}

/** Logs stacked along x on a deck at height y: two below, one above, pale end grain and snow on the top log. */
function timber(out: Part[], x: number, y: number, len: number): void {
  for (const [ly, z] of [[y, -0.19], [y, 0.19], [y + 0.26, 0]] as const) {
    out.push([x, ly, z, len, 0.26, 0.34, TIMBER, 0, 0, TIMBER_SIDE]);
    for (const s of [-1, 1]) out.push([x + s * (len / 2 + 0.004), ly + 0.04, z, 0.008, 0.18, 0.24, GRAIN]);
  }
  out.push([x, y + 0.52, 0, len * 0.8, 0.03, 0.26, 0xf6faff, 0, 0, 0xdbe5f3]);
}

/** A lorry of 2 or 3 tiles (x), 0.84 wide. Every model but the bus has a tall tinted cab with a white roof cap, a
 * wide windscreen, grille, bumper and mirrors at the front (+x), then a load on a dark chassis:
 * box: an oversized white / blue-grey trailer with ribbed panels. tanker: a silver tank with dark bands, hatches
 * and a red stripe. logs: a stake bed with three logs. fire: a tinted body with a ladder, lockers and a blue
 * light bar. plough: a grit hopper, an amber beacon and a blade across the front.
 * The bus is one long tinted body with a row of windows, a door and a white roof. Nothing is taller than 0.96. */
export function truckGeometry(len: 2 | 3, model: TruckModel = 'box'): VehicleParts {
  const e = len / 2, cab = 0.74, cargoLen = len - cab - 0.1, cargoX = -e + cargoLen / 2;
  const glass = 0x2b3040, wheel = 0x1d2029, hub = 0xc9cddd, chassis = 0x343945;
  const parts: Part[] = [[0, 0.08, 0, len, 0.14, 0.7, chassis]], body: Part[] = [];
  const axle = (x: number): void => {
    for (const z of [-1, 1]) parts.push([x, 0, z * 0.375, 0.28, 0.28, 0.12, wheel], [x, 0.09, z * 0.44, 0.1, 0.1, 0.012, hub]);
  };
  axle(e - 0.34);
  axle(-e + 0.36);
  if (len === 3) axle(-e + 0.72);
  // Head lights, bumper and tail lights.
  parts.push([e - 0.01, 0.22, 0.29, 0.02, 0.08, 0.12, 0xffe08a], [e - 0.01, 0.22, -0.29, 0.02, 0.08, 0.12, 0xffe08a],
    [e - 0.02, 0.08, 0, 0.04, 0.08, 0.82, chassis],
    [-e + 0.01, 0.16, 0.3, 0.02, 0.06, 0.12, 0xff5a5a], [-e + 0.01, 0.16, -0.3, 0.02, 0.06, 0.12, 0xff5a5a]);
  if (model === 'bus') {
    body.push([0, 0.16, 0, len - 0.04, 0.66, 0.8, WHITE, 0, 0, PAINT_SIDE], [0, 0.16, 0, len - 0.02, 0.07, 0.82, PAINT_TRIM]);
    parts.push([0, 0.82, 0, len - 0.14, 0.05, 0.74, 0xf4f6fc, 0, 0, 0xd7dbea],
      [e - 0.014, 0.4, 0, 0.012, 0.34, 0.68, glass], [e - 0.014, 0.75, 0, 0.012, 0.06, 0.4, 0xffb53c],
      [-e + 0.014, 0.5, 0, 0.012, 0.22, 0.6, glass],
      // Roof hatches and a cooling unit, mirrors, and a white stripe under the windows.
      [-0.3, 0.87, 0, 0.6, 0.06, 0.42, 0xc9cddd, 0, 0, 0xaab1c2], [e - 0.5, 0.87, 0, 0.2, 0.03, 0.2, 0x8a929c], [-e + 0.3, 0.87, 0, 0.2, 0.03, 0.2, 0x8a929c],
      [e - 0.1, 0.56, 0.43, 0.04, 0.14, 0.04, chassis], [e - 0.1, 0.56, -0.43, 0.04, 0.14, 0.04, chassis],
      [0, 0.38, 0.406, len - 0.3, 0.05, 0.012, 0xf4f6fc], [0, 0.38, -0.406, len - 0.3, 0.05, 0.012, 0xf4f6fc]);
    // A window row on both sides, with the door in place of the first pane on the near side.
    for (let x = -e + 0.3, i = 0; x < e - 0.2; x += 0.38, i++) for (const z of [-1, 1]) {
      if (z > 0 && x + 0.38 >= e - 0.2) parts.push([x, 0.24, z * 0.406, 0.26, 0.5, 0.012, glass]);
      else parts.push([x, 0.5, z * 0.406, 0.3, 0.22, 0.012, glass]);
    }
    return laneVehicle({body: voxel(body), detail: voxel(parts)}, 0.79, 0.66);
  }
  parts.push(
    // windscreen, side windows and the white roof cap
    [e - 0.2, 0.52, 0, 0.05, 0.24, 0.66, glass],
    [e - 0.48, 0.52, 0.405, 0.3, 0.22, 0.03, glass], [e - 0.48, 0.52, -0.405, 0.3, 0.22, 0.03, glass],
    [e - cab / 2 - 0.1, 0.86, 0, cab - 0.2, 0.05, 0.8, 0xf4f6fc, 0, 0, 0xd7dbea],
    // an exhaust stack behind the cab and three marker lights on the roof
    [e - 0.79, 0.22, 0.3, 0.06, 0.7, 0.06, 0x8a929c], [e - 0.79, 0.92, 0.3, 0.08, 0.03, 0.08, chassis],
    [e - 0.2, 0.91, 0.2, 0.04, 0.025, 0.07, 0xffb53c], [e - 0.2, 0.91, 0, 0.04, 0.025, 0.07, 0xffb53c], [e - 0.2, 0.91, -0.2, 0.04, 0.025, 0.07, 0xffb53c],
    // grille with bright bars, and mirrors
    [e - 0.008, 0.2, 0, 0.01, 0.16, 0.4, 0x4a4f5e],
    [e - 0.004, 0.225, 0, 0.008, 0.014, 0.38, 0xaab1c2], [e - 0.004, 0.27, 0, 0.008, 0.014, 0.38, 0xaab1c2], [e - 0.004, 0.315, 0, 0.008, 0.014, 0.38, 0xaab1c2],
    // a sun visor, two wipers and a pair of air horns
    [e - 0.165, 0.77, 0, 0.07, 0.03, 0.7, chassis], [e - 0.172, 0.53, 0.16, 0.008, 0.1, 0.02, chassis], [e - 0.172, 0.53, -0.16, 0.008, 0.1, 0.02, chassis],
    [e - 0.5, 0.91, 0.12, 0.22, 0.035, 0.05, hub], [e - 0.5, 0.91, -0.12, 0.22, 0.035, 0.05, hub],
    // an underrun bar at the back
    [-e + 0.03, 0.03, 0, 0.04, 0.05, 0.8, chassis],
    [e - 0.26, 0.56, 0.43, 0.04, 0.14, 0.04, chassis], [e - 0.26, 0.56, -0.43, 0.04, 0.14, 0.04, chassis]);
  for (const z of [-1, 1]) parts.push(
    // a door seam, a handle and a step on each side of the cab
    [e - 0.66, 0.2, z * 0.403, 0.012, 0.6, 0.008, chassis], [e - 0.6, 0.44, z * 0.405, 0.07, 0.025, 0.012, hub], [e - 0.47, 0.09, z * 0.42, 0.3, 0.04, 0.06, 0x8a929c],
    // a fuel tank between the axles and a mud flap behind the last wheel
    [e - 1.0, 0.04, z * 0.37, 0.34, 0.15, 0.12, hub, 0, 0, 0x9aa1b3], [e - 1.08, 0.03, z * 0.375, 0.03, 0.17, 0.13, chassis], [e - 0.92, 0.03, z * 0.375, 0.03, 0.17, 0.13, chassis],
    [-e + 0.15, 0.02, z * 0.38, 0.02, 0.2, 0.14, 0x23252c]);
  // Coloured cab and short nose.
  body.push([e - cab / 2 - 0.1, 0.16, 0, cab - 0.2, 0.7, 0.8, WHITE, 0, 0, PAINT_SIDE],
    [e - 0.1, 0.16, 0, 0.2, 0.36, 0.78, WHITE, 0, 0, PAINT_SIDE],
    [e - 0.1, 0.16, 0, 0.2, 0.05, 0.8, PAINT_TRIM]);
  const lo = cargoX - cargoLen / 2, hi = cargoX + cargoLen / 2;
  switch (model) {
    case 'box': {
      // Baked side lift keeps the cargo blue-grey under the weak side-facing hemisphere light.
      const cargoSide: Rgb = [1.36, 1.51, 2.23], rib: Rgb = [1.08, 1.2, 1.85];
      parts.push([cargoX, 0.22, 0, cargoLen, 0.74, 0.84, 0xeef2fb, 0, 0, cargoSide], [-e + 0.005, 0.26, 0, 0.01, 0.66, 0.02, 0x9aa3c0]);
      // Rear door lock bars with handles, a band in the cab's colour and amber marker lights along each side.
      for (const z of [-0.2, 0.2]) parts.push([-e + 0.004, 0.28, z, 0.008, 0.62, 0.025, 0x7d86a3], [-e + 0.004, 0.5, z, 0.008, 0.03, 0.1, 0x4a4f5e]);
      for (const z of [-1, 1]) body.push([cargoX, 0.66, z * 0.4215, cargoLen - 0.06, 0.16, 0.012, WHITE, 0, 0, PAINT_SIDE]);
      for (let x = lo + 0.2; x < hi - 0.1; x += 0.36) for (const z of [-1, 1]) parts.push([x, 0.26, z * 0.425, 0.04, 0.4, 0.012, rib], [x + 0.18, 0.225, z * 0.424, 0.06, 0.03, 0.012, 0xffb53c]);
      break;
    }
    case 'tanker': {
      const tank = 0xdfe4ee, tankSide: Rgb = [1.0, 1.1, 1.36];
      parts.push([cargoX, 0.26, 0, cargoLen - 0.08, 0.54, 0.7, tank, 0, 0, tankSide], [cargoX, 0.8, 0, cargoLen - 0.24, 0.08, 0.44, tank, 0, 0, tankSide]);
      for (let x = lo + 0.2; x < hi - 0.1; x += 0.42) {
        parts.push([x, 0.25, 0, 0.06, 0.56, 0.72, 0x5d6475], [x + 0.2, 0.88, 0, 0.16, 0.05, 0.16, 0x5d6475]);
      }
      for (const z of [-1, 1]) parts.push([cargoX, 0.48, z * 0.356, cargoLen - 0.2, 0.09, 0.012, 0xd8343c],
        // a pipe along the underside and a hazard plate at the back
        [cargoX, 0.2, z * 0.3, cargoLen - 0.3, 0.05, 0.05, 0x8a929c], [lo + 0.035, 0.34, z * 0.2, 0.008, 0.14, 0.14, 0xff9a1f]);
      // A walkway along the top and a ladder up the near side.
      parts.push([cargoX, 0.88, 0.14, cargoLen - 0.3, 0.012, 0.1, 0x8a929c]);
      for (let i = 0; i < 6; i++) parts.push([lo + 0.14, 0.28 + i * 0.09, 0.362, 0.12, 0.016, 0.02, 0x8a929c]);
      break;
    }
    case 'logs': {
      parts.push([cargoX, 0.22, 0, cargoLen, 0.06, 0.82, 0x4a4f5e]);
      for (const x of [lo + 0.08, hi - 0.08]) for (const z of [-1, 1]) parts.push([x, 0.28, z * 0.39, 0.05, 0.5, 0.05, 0x5d6475]);
      timber(parts, cargoX, 0.28, cargoLen - 0.3);
      // Two straps over the load and a red flag on the end of it.
      for (const x of [cargoX - cargoLen / 4, cargoX + cargoLen / 4]) parts.push([x, 0.8, 0, 0.035, 0.035, 0.38, 0x2b2e3b], [x, 0.54, 0.365, 0.035, 0.28, 0.012, 0x2b2e3b], [x, 0.54, -0.365, 0.035, 0.28, 0.012, 0x2b2e3b]);
      parts.push([lo + 0.12, 0.6, 0, 0.012, 0.12, 0.14, 0xd8343c]);
      break;
    }
    case 'fire': {
      body.push([cargoX, 0.22, 0, cargoLen, 0.5, 0.84, WHITE, 0, 0, PAINT_SIDE]);
      // Silver lockers and a white stripe on each side, a ladder on top and a blue light bar on the cab.
      for (const z of [-1, 1]) {
        parts.push([cargoX, 0.52, z * 0.426, cargoLen, 0.07, 0.012, 0xf4f6fc]);
        for (let x = lo + 0.24; x < hi - 0.1; x += 0.4) parts.push([x, 0.26, z * 0.426, 0.3, 0.2, 0.012, 0xbfc6d6]);
        parts.push([cargoX, 0.78, z * 0.14, cargoLen - 0.1, 0.05, 0.04, 0xc9cddd]);
      }
      parts.push([cargoX, 0.72, 0, cargoLen - 0.2, 0.06, 0.4, 0x5d6475]);
      for (let x = lo + 0.14; x < hi - 0.1; x += 0.16) parts.push([x, 0.785, 0, 0.04, 0.03, 0.28, 0xc9cddd]);
      parts.push([e - cab / 2 - 0.1, 0.91, 0, 0.12, 0.05, 0.5, 0x2f6fe8]);
      break;
    }
    case 'plough': {
      // A dark hopper that widens upward, heaped with grit, and a blade across the front.
      parts.push([cargoX, 0.22, 0, cargoLen - 0.2, 0.24, 0.6, 0x4a4f5e, 0, 0, 0x3a3e4e], [cargoX, 0.46, 0, cargoLen - 0.06, 0.24, 0.8, 0x5d6475, 0, 0, 0x4a4f5e],
        [cargoX, 0.7, 0, cargoLen - 0.2, 0.07, 0.64, 0xe9dccb, 0, 0, 0xcbbda8], [cargoX - 0.06, 0.77, 0.04, cargoLen - 0.5, 0.05, 0.36, 0xf3e9da, 0, 0, 0xcbbda8],
        [e - 0.035, 0.0, 0, 0.07, 0.3, 0.84, 0xffc93c, 0, 0, 0xe0a51c], [e - 0.075, 0.02, 0, 0.012, 0.05, 0.84, 0x2b2e3b],
        [e - cab / 2 - 0.1, 0.91, 0, 0.1, 0.05, 0.1, 0xff9a1f]);
      break;
    }
  }
  return laneVehicle({body: voxel(body), detail: voxel(parts)}, 0.79, 0.66);
}

/** Train pieces, each 2.0 long (x, front at +x), 0.8 wide, drawn 0.1 above the rails. The tinted body carries the
 * train's colour; stripes, windows, roofs and loads stay fixed.
 * Locomotives: `nose` (a sloped passenger front with a tall cab), `diesel` (a long hood with grilles and exhausts,
 * hazard stripes on the nose and a cab at the back) and `steam` (a black boiler with a chimney, a brass dome, red
 * wheels and a tinted cab).
 * Wagons: `carriage` (stripe and window row), `container` (a tinted ribbed box), `tank`, `hopper` (heaped with
 * coal), `flat` (three logs) and `tender` (coal behind a steam locomotive). */
export function trainGeometry(): Record<Loco | Wagon, VehicleParts> {
  const stripe = 0xfff4dc, glass = 0x2b3040, roof = 0x4b5262, dark = 0x2c2f38, coal = 0x23252c, steel = 0x8a929c;
  const windows: Part[] = [];
  for (const x of [-0.72, -0.24, 0.24, 0.72]) windows.push([x, 0.5, 0.405, 0.34, 0.2, 0.02, glass], [x, 0.5, -0.405, 0.34, 0.2, 0.02, glass]);
  const bogies: Part[] = [];
  // Each bogie: a dark frame, a steel side beam with two springs, and four wheels with bright rims.
  for (const bx of [-0.62, 0.62]) {
    bogies.push([bx, 0.0, 0, 0.7, 0.14, 0.56, dark]);
    for (const z of [-1, 1]) {
      bogies.push([bx, 0.06, z * 0.3, 0.56, 0.05, 0.06, steel], [bx - 0.08, 0.11, z * 0.3, 0.05, 0.04, 0.07, 0xc9cddd], [bx + 0.08, 0.11, z * 0.3, 0.05, 0.04, 0.07, 0xc9cddd]);
      for (const wx of [-0.2, 0.2]) bogies.push([bx + wx, 0, z * 0.33, 0.2, 0.2, 0.03, 0x3a3e4e], [bx + wx, 0.06, z * 0.348, 0.08, 0.08, 0.008, steel]);
    }
  }
  /** Equipment boxes hung under the floor between the bogies. */
  const underfloor: Part[] = [[-0.08, 0.02, 0.24, 0.3, 0.11, 0.18, 0x3a3e4e], [0.14, 0.03, -0.24, 0.24, 0.1, 0.18, 0x3a3e4e], [0.1, 0.04, 0.26, 0.1, 0.07, 0.14, steel]];
  const couplers: Part[] = [[0.97, 0.2, 0, 0.08, 0.06, 0.2, dark], [-0.97, 0.2, 0, 0.08, 0.06, 0.2, dark]];
  /** A heap of coal with a dusting of snow, on top of a wagon at height y. */
  const heap = (y: number, len: number): Part[] => [
    [0, y, 0, len, 0.06, 0.62, coal], [-0.2, y + 0.06, 0.03, len * 0.6, 0.06, 0.42, coal], [0.3, y + 0.06, -0.1, len * 0.25, 0.04, 0.3, coal],
    [-0.25, y + 0.12, 0.03, len * 0.3, 0.02, 0.24, 0xf6faff],
  ];
  const piece = (body: Part[], detail: Part[]): VehicleParts => laneVehicle({body: voxel(body), detail: voxel(detail)}, 0.755, 0.65);
  const hood: Part[] = [];
  for (let x = -0.2; x < 0.75; x += 0.19) for (const z of [-1, 1]) hood.push([x, 0.34, z * 0.356, 0.1, 0.2, 0.012, dark]);
  const flat: Part[] = [...bogies, ...couplers];
  for (const x of [-0.86, 0.86]) for (const z of [-1, 1]) flat.push([x, 0.2, z * 0.37, 0.05, 0.56, 0.05, 0x5d6475]);
  timber(flat, 0, 0.2, 1.6);
  for (const x of [-0.4, 0.4]) flat.push([x, 0.72, 0, 0.035, 0.035, 0.38, dark], [x, 0.46, 0.365, 0.035, 0.28, 0.012, dark], [x, 0.46, -0.365, 0.035, 0.28, 0.012, dark]);
  const ribs: Part[] = [];
  for (let x = -0.8; x < 0.85; x += 0.2) for (const z of [-1, 1]) ribs.push([x, 0.24, z * 0.386, 0.06, 0.56, 0.012, PAINT_TRIM]);
  const wheels: Part[] = [];
  for (const x of [-0.5, -0.1, 0.3]) for (const z of [-1, 1]) wheels.push([x, 0, z * 0.33, 0.34, 0.34, 0.08, 0xb3262f], [x, 0.12, z * 0.375, 0.1, 0.1, 0.012, 0xffd9a8]);
  for (const z of [-1, 1]) wheels.push([-0.1, 0.13, z * 0.385, 0.9, 0.05, 0.012, steel], [0.72, 0, z * 0.33, 0.2, 0.2, 0.08, 0xb3262f]);
  return {
    carriage: piece([[0, 0.12, 0, 2.0, 0.64, 0.8, WHITE]], [
      [0, 0.76, 0, 1.96, 0.08, 0.68, roof],
      [0, 0.3, 0.405, 2.0, 0.12, 0.02, stripe], [0, 0.3, -0.405, 2.0, 0.12, 0.02, stripe],
      ...windows, ...bogies, ...couplers, ...underfloor,
      // Roof units and vents, a gutter and a dark skirt along each side, and the gangway at each end.
      [-0.5, 0.84, 0, 0.5, 0.05, 0.4, 0x5d6475, 0, 0, 0x454b5a], [0.5, 0.84, 0, 0.5, 0.05, 0.4, 0x5d6475, 0, 0, 0x454b5a], [0, 0.84, 0, 0.14, 0.03, 0.2, steel],
      [0, 0.73, 0.405, 2.0, 0.02, 0.02, 0x3a3e4e], [0, 0.73, -0.405, 2.0, 0.02, 0.02, 0x3a3e4e],
      [0, 0.13, 0.405, 2.0, 0.05, 0.02, dark], [0, 0.13, -0.405, 2.0, 0.05, 0.02, dark],
      [0.99, 0.2, 0, 0.02, 0.5, 0.4, dark], [-0.99, 0.2, 0, 0.02, 0.5, 0.4, dark],
    ]),
    nose: piece([
      [-0.275, 0.12, 0, 1.45, 0.72, 0.8, WHITE],
      [0.58, 0.12, 0, 0.26, 0.5, 0.8, WHITE],
      [0.79, 0.12, 0, 0.16, 0.36, 0.78, WHITE],
      [0.935, 0.12, 0, 0.13, 0.24, 0.74, WHITE],
    ], [
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
      ...bogies, ...underfloor,
      [-0.97, 0.2, 0, 0.08, 0.06, 0.2, dark],
      // A pantograph folded up from the roof: a base, two arms and the contact bar.
      [-0.05, 0.91, 0, 0.36, 0.03, 0.3, dark], [-0.05, 0.99, 0, 0.36, 0.025, 0.04, steel, -0.44], [-0.08, 1.14, 0, 0.3, 0.025, 0.04, steel, 0.5],
      [0.06, 1.22, 0, 0.05, 0.02, 0.5, steel], [0.06, 1.24, 0.2, 0.05, 0.03, 0.06, dark], [0.06, 1.24, -0.2, 0.05, 0.03, 0.06, dark],
      // Wipers, a destination board, a gutter and a dark skirt.
      [0.478, 0.63, 0.14, 0.008, 0.1, 0.02, dark], [0.478, 0.63, -0.14, 0.008, 0.1, 0.02, dark], [0.455, 0.8, 0, 0.04, 0.035, 0.3, 0xffb53c],
      [-0.275, 0.81, 0.405, 1.45, 0.02, 0.02, 0x3a3e4e], [-0.275, 0.81, -0.405, 1.45, 0.02, 0.02, 0x3a3e4e],
      [-0.275, 0.13, 0.405, 1.45, 0.05, 0.02, dark], [-0.275, 0.13, -0.405, 1.45, 0.05, 0.02, dark],
    ]),
    diesel: piece([
      [0.2, 0.12, 0, 1.46, 0.5, 0.7, WHITE, 0, 0, PAINT_SIDE],
      [-0.66, 0.12, 0, 0.6, 0.76, 0.8, WHITE, 0, 0, PAINT_SIDE],
      [0, 0.12, 0, 1.96, 0.1, 0.8, PAINT_TRIM],
    ], [
      ...bogies, ...hood, [-0.97, 0.2, 0, 0.08, 0.06, 0.2, dark],
      [-0.66, 0.88, 0, 0.64, 0.06, 0.74, roof],
      [-0.354, 0.6, 0, 0.012, 0.2, 0.62, glass], [-0.66, 0.6, 0.405, 0.36, 0.2, 0.012, glass], [-0.66, 0.6, -0.405, 0.36, 0.2, 0.012, glass],
      [0.1, 0.62, 0, 0.16, 0.1, 0.16, dark], [0.5, 0.62, 0, 0.16, 0.1, 0.16, dark], [0.3, 0.62, 0, 1.2, 0.02, 0.3, roof],
      // Hazard stripes and lamps on the nose.
      [0.936, 0.24, 0, 0.012, 0.3, 0.68, 0xffc93c], [0.94, 0.3, 0.17, 0.012, 0.1, 0.1, dark], [0.94, 0.3, -0.17, 0.012, 0.1, 0.1, dark],
      [0.944, 0.46, 0, 0.012, 0.08, 0.2, 0xfff3b0], [0.97, 0.1, 0, 0.06, 0.08, 0.8, dark],
      // White handrails on posts along the hood, two roof fans, a fuel tank, a horn and cab steps.
      ...[-1, 1].flatMap((z): Part[] => [[0.2, 0.7, z * 0.37, 1.4, 0.016, 0.016, 0xf4f6fc],
        ...[-0.45, 0, 0.45, 0.88].map((x): Part => [x, 0.62, z * 0.37, 0.016, 0.08, 0.016, 0xf4f6fc]),
        [-0.9, 0.02, z * 0.38, 0.12, 0.04, 0.08, steel], [-0.9, 0.1, z * 0.38, 0.12, 0.04, 0.08, steel]]),
      [-0.15, 0.62, 0, 0.2, 0.035, 0.2, 0x3a3e4e], [0.75, 0.62, 0, 0.2, 0.035, 0.2, 0x3a3e4e],
      [0, 0.0, 0, 0.5, 0.13, 0.5, 0x5d6475, 0, 0, 0x454b5a], [-0.6, 0.94, 0.16, 0.22, 0.03, 0.04, steel],
    ]),
    steam: piece([
      [-0.66, 0.12, 0, 0.6, 0.76, 0.8, WHITE, 0, 0, PAINT_SIDE],
      [0.14, 0.14, 0, 1.6, 0.07, 0.76, WHITE, 0, 0, PAINT_SIDE],
    ], [
      ...wheels, [-0.97, 0.2, 0, 0.08, 0.06, 0.2, dark],
      [0.22, 0.21, 0, 1.2, 0.46, 0.54, 0x343844, 0, 0, 0x262932], [0.86, 0.21, 0, 0.12, 0.48, 0.58, 0x23252c],
      [0.7, 0.67, 0, 0.18, 0.26, 0.18, 0x23252c], [0.7, 0.93, 0, 0.24, 0.05, 0.24, 0x343844],
      [0.22, 0.67, 0, 0.2, 0.12, 0.2, 0xe0b040, 0, 0, 0xb98a25], [-0.14, 0.67, 0, 0.12, 0.08, 0.12, 0xe0b040, 0, 0, 0xb98a25],
      [0.93, 0.5, 0, 0.03, 0.12, 0.14, 0xfff3b0], [0.96, 0.02, 0, 0.07, 0.16, 0.72, 0xb3262f],
      [-0.66, 0.88, 0, 0.68, 0.06, 0.84, roof],
      [-0.66, 0.58, 0.405, 0.3, 0.22, 0.012, glass], [-0.66, 0.58, -0.405, 0.3, 0.22, 0.012, glass], [-0.354, 0.62, 0, 0.012, 0.16, 0.5, glass],
      // Brass boiler bands, a whistle, cylinders at the front, handrails, a number plate and three puffs of smoke.
      [-0.1, 0.205, 0, 0.035, 0.47, 0.552, 0xe0b040], [0.48, 0.205, 0, 0.035, 0.47, 0.552, 0xe0b040], [-0.3, 0.67, 0, 0.05, 0.11, 0.05, 0xe0b040],
      ...[-1, 1].flatMap((z): Part[] => [[0.8, 0.06, z * 0.33, 0.24, 0.16, 0.1, 0x343844, 0, 0, 0x262932], [0.2, 0.52, z * 0.285, 1.1, 0.016, 0.016, steel],
        [-0.66, 0.36, z * 0.405, 0.22, 0.09, 0.012, 0xe0b040]]),
      [0.66, 1.02, 0, 0.16, 0.12, 0.16, 0xf2f4f8, 0, 0, 0xd4d9e4], [0.54, 1.17, 0.03, 0.21, 0.15, 0.21, 0xf2f4f8, 0, 0, 0xd4d9e4], [0.38, 1.35, -0.02, 0.26, 0.18, 0.26, 0xf2f4f8, 0, 0, 0xd4d9e4],
    ]),
    tender: piece([[0, 0.12, 0, 1.9, 0.5, 0.78, WHITE, 0, 0, PAINT_SIDE], [0, 0.12, 0, 1.92, 0.1, 0.8, PAINT_TRIM]],
      [...bogies, ...couplers, ...heap(0.62, 1.7), [0, 0.42, 0.396, 1.5, 0.06, 0.012, stripe], [0, 0.42, -0.396, 1.5, 0.06, 0.012, stripe],
        // A ladder up the back and a water hatch.
        ...[0, 1, 2, 3].map((i): Part => [-0.954, 0.2 + i * 0.1, 0.2, 0.008, 0.016, 0.14, steel]), [-0.7, 0.62, -0.2, 0.2, 0.03, 0.2, 0x5d6475]]),
    container: piece([[0, 0.22, 0, 1.84, 0.6, 0.76, WHITE, 0, 0, PAINT_SIDE], ...ribs],
      [...bogies, ...couplers, [0, 0.12, 0, 1.96, 0.1, 0.72, dark], [-0.924, 0.26, 0, 0.012, 0.52, 0.03, dark], [-0.924, 0.46, 0.14, 0.014, 0.12, 0.04, steel],
        // Door lock bars, corner castings and a white shipping label on each side.
        [-0.924, 0.26, 0.2, 0.012, 0.52, 0.02, steel], [-0.924, 0.26, -0.2, 0.012, 0.52, 0.02, steel], [-0.924, 0.46, -0.14, 0.014, 0.12, 0.04, steel],
        ...[-1, 1].flatMap((z): Part[] => [[0.5, 0.5, z * 0.392, 0.36, 0.16, 0.012, 0xf4f6fc], [0.5, 0.54, z * 0.396, 0.24, 0.03, 0.012, dark],
          ...[-0.9, 0.9].flatMap((x): Part[] => [[x, 0.22, z * 0.375, 0.06, 0.06, 0.03, steel], [x, 0.76, z * 0.375, 0.06, 0.06, 0.03, steel]])])]),
    tank: piece([[0, 0.26, 0, 1.7, 0.46, 0.64, WHITE, 0, 0, PAINT_SIDE], [0, 0.72, 0, 1.5, 0.08, 0.4, WHITE, 0, 0, PAINT_SIDE]],
      [...bogies, ...couplers, [0, 0.12, 0, 1.96, 0.14, 0.6, dark],
        [-0.5, 0.25, 0, 0.06, 0.48, 0.66, dark], [0.5, 0.25, 0, 0.06, 0.48, 0.66, dark], [0, 0.8, 0, 0.2, 0.06, 0.2, dark],
        [0, 0.44, 0.326, 0.7, 0.1, 0.012, stripe], [0, 0.44, -0.326, 0.7, 0.1, 0.012, stripe],
        // A walkway and a red valve on top, a ladder on the near side and a hazard plate on each side.
        [0.3, 0.8, 0.12, 1.0, 0.012, 0.1, steel], [-0.3, 0.8, 0, 0.1, 0.08, 0.1, 0xd8343c],
        ...[0, 1, 2, 3, 4].map((i): Part => [0.7, 0.28 + i * 0.09, 0.332, 0.12, 0.016, 0.02, steel]),
        [-0.7, 0.4, 0.326, 0.14, 0.14, 0.012, 0xff9a1f], [-0.7, 0.4, -0.326, 0.14, 0.14, 0.012, 0xff9a1f]]),
    hopper: piece([[0, 0.22, 0, 1.9, 0.46, 0.78, WHITE, 0, 0, PAINT_SIDE], [0, 0.64, 0, 1.94, 0.05, 0.8, PAINT_TRIM], ...ribs.map((r): Part => [r[0], 0.24, r[2], 0.06, 0.4, 0.012, PAINT_TRIM])],
      [...bogies, ...couplers, [0, 0.12, 0, 1.96, 0.1, 0.72, dark], ...heap(0.66, 1.7),
        // Two discharge chutes underneath and a ladder on the end.
        [-0.2, 0.02, 0, 0.3, 0.1, 0.5, 0x3a3e4e], [0.2, 0.02, 0, 0.3, 0.1, 0.5, 0x3a3e4e],
        ...[0, 1, 2, 3].map((i): Part => [-0.954, 0.26 + i * 0.1, -0.2, 0.008, 0.016, 0.14, steel])]),
    flat: piece([[0, 0.12, 0, 1.96, 0.08, 0.78, PAINT_TRIM]], flat),
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

/** Thin stepped pads, with one shallow notch. The whole cell remains safe support.
 * Variant 1 carries a pink flower at its edge; variant 2 is a wider pad with a white bud and a small second pad. */
export function lilyGeometry(variant = 0): THREE.BufferGeometry {
  const pad = 0x43b958, parts: Part[] = [
    [0, 0, 0, 0.49, 0.035, 0.34, pad], [0, 0, 0, 0.34, 0.035, 0.49, pad],
    [-0.018, 0.035, -0.018, 0.33, 0.018, 0.33, 0x51c65f],
    [0.19, 0.035, 0.035, 0.12, 0.005, 0.05, 0x3d9e50],
  ];
  if (variant === 1) parts.push([-0.15, 0.053, -0.15, 0.15, 0.03, 0.15, 0xff8fc0, 0, 0, 0xe0669c], [-0.15, 0.083, -0.15, 0.09, 0.03, 0.09, 0xffd0e4], [-0.15, 0.113, -0.15, 0.04, 0.015, 0.04, 0xffd84a]);
  if (variant === 2) parts.push([0, 0, 0, 0.58, 0.03, 0.2, pad], [0, 0, 0, 0.2, 0.03, 0.58, pad],
    [0.3, 0, 0.3, 0.2, 0.03, 0.14, 0x3fae52], [0.3, 0, 0.3, 0.14, 0.03, 0.2, 0x3fae52],
    [0.16, 0.053, -0.16, 0.07, 0.07, 0.07, 0xffffff, 0, 0, 0xdfe6ee], [0.16, 0.123, -0.16, 0.035, 0.02, 0.035, 0xffe9a0]);
  return voxel(parts, 0.93);
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

/** A level-crossing signal, facing +z (towards the camera): a concrete footing, a grey mast, a white crossbuck with
 * red borders on top, a small bell, and a black cross-arm carrying two lamp backboards with sun hoods. The lamps
 * themselves are drawn separately (lampGeometry) at x = ±0.2, y = 1.06, just in front of the backboards. Every
 * part stays within z ≤ 0.05 so the post fits the near edge of its rail cell. */
export function signalPostGeometry(): THREE.BufferGeometry {
  const mast = 0xb9bdca, mastSide = 0x8e93a3, black = 0x1d1e26, red = 0xc8283a, white = 0xf4f5fa;
  const parts: Part[] = [
    [0, 0, 0, 0.26, 0.08, 0.1, 0x9a98a2, 0, 0, 0x7a7884],
    [0, 0.08, 0, 0.08, 1.38, 0.08, mast, 0, 0, mastSide],
    // Cross-arm and the two lamp backboards with their hoods.
    [0, 1.02, -0.015, 0.62, 0.07, 0.05, black],
    [-0.2, 0.94, 0, 0.24, 0.24, 0.04, black], [0.2, 0.94, 0, 0.24, 0.24, 0.04, black],
    [-0.2, 1.18, 0.02, 0.24, 0.03, 0.06, black], [0.2, 1.18, 0.02, 0.24, 0.03, 0.06, black],
    // A small bell under the crossbuck.
    [0, 1.26, 0.01, 0.12, 0.08, 0.07, 0x2a2b33],
    // Crossbuck: two white boards in an X with red borders behind them, and a red centre boss.
    [0, 1.47, -0.02, 0.68, 0.13, 0.02, red, 0.6], [0, 1.47, -0.02, 0.68, 0.13, 0.02, red, -0.6],
    [0, 1.475, 0.0, 0.62, 0.08, 0.025, white, 0.6], [0, 1.475, 0.0, 0.62, 0.08, 0.025, white, -0.6],
    [0, 1.495, 0.02, 0.05, 0.05, 0.02, red],
  ];
  return voxel(parts, 0.92);
}

/** A signal lamp lens: a 0.2-wide ten-sided disc centred on its origin, its axis along z, so it can swell about its
 * centre when lit. */
export function lampGeometry(): THREE.BufferGeometry {
  const g = solids([], [[0, -0.1, 0, 0.1, 0.1, 0.2, 10, WHITE]], 1).rotateX(Math.PI / 2);
  g.computeBoundingSphere();
  return g;
}

/** The bloom around a lit lamp: a soft red-orange disc of radius 0.42 tilted 45° back to face the camera, bright in
 * the middle and fading to nothing. Drawn additively. */
export function signalHaloGeometry(): THREE.BufferGeometry {
  const g = radial([[0, 0.95], [0.1, 0.8], [0.22, 0.35], [0.42, 0]], 20, 0xff4a30).rotateX(Math.PI / 4);
  g.computeBoundingSphere();
  return g;
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

/** A soft red ground spill; the small solid bulb is rendered separately. */
export function signalGlowGeometry(): THREE.BufferGeometry {
  return radial([[0, 0.34], [0.38, 0.24], [1, 0]], 24, 0xff1532);
}
