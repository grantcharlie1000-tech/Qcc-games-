/** CrossyRoad's voxel models: pure builders that return merged box geometry with a linear `color`
 * attribute (vertex colours). No materials or meshes are created here, and nothing touches the DOM.
 *
 * Units are tiles (1 unit = 1 lane = 1 column). Unless a builder says otherwise the origin is the
 * bottom centre of the model (x and z centred, y = 0 at the base) and vehicles face +x, so a
 * renderer turns a vehicle by a yaw of π to face −x. The bird faces −z (forward).
 *
 * Tinted models come in two geometries: a `body` in white, which the renderer tints with a
 * per-instance colour, and a `detail` with fixed colours (windows, wheels, cargo). Draw both at
 * the same transform. Side faces get a slightly darker bottom edge (a cheap ambient occlusion)
 * that tints along with the instance colour. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A linear RGB triple; components may exceed 1 (used to keep a fixed colour under an instance tint). */
export type Rgb = readonly [r: number, g: number, b: number];
/** One box: x centre, y bottom, z centre, width (x), height (y), depth (z), colour (sRGB hex or a
 * linear triple), optional rotations through the box centre (radians: about x first, then about z) and
 * an optional colour for every face but the top (the sides and the underside). */
export type Part = readonly [x: number, y: number, z: number, w: number, h: number, d: number, color: number | Rgb, rotZ?: number, rotX?: number, side?: number | Rgb];

/** Palettes shared with the renderer so instance tints and baked colours agree. */
export const VEHICLE_COLORS: readonly number[] = [0xe64732, 0x229acc, 0xf2cf47, 0x8250da, 0x88be43, 0x4269b2];
export const TRAIN_COLORS: readonly number[] = [0xe94f64, 0x3a86ff, 0x2bb673, 0xf4a259];
export const LOG_COLORS: readonly number[] = [0x733b39, 0x82413e, 0x683333];

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

/** A white voxel bird, facing −z. The 0.68-tile footprint includes the small wings;
 * the orange feet, raised head, red comb and short tail keep the silhouette readable in a hop. */
export function chickenGeometry(): THREE.BufferGeometry {
  const white = 0xffffff, flank = 0xdce1ef, wing = 0xf3f4fb, orange = 0xf28a25, red = 0xcf3041, eye = 0x202535;
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
    // Comb: three connected red voxels along the crown, not a texture.
    [0, 0.72, -0.14, 0.115, 0.09, 0.28, red],
    [0, 0.79, -0.22, 0.115, 0.065, 0.09, red], [0, 0.79, -0.055, 0.115, 0.045, 0.09, red],
    // Beak, red wattle, and eyes on both sides of the head.
    [0, 0.48, -0.365, 0.18, 0.105, 0.16, orange],
    [0, 0.39, -0.31, 0.085, 0.1, 0.085, red],
    [-0.195, 0.585, -0.23, 0.025, 0.065, 0.065, eye],
    [0.195, 0.585, -0.23, 0.025, 0.065, 0.065, eye],
  ], 0.88);
}

/** The result for tinted vehicles: draw `body` with an instance tint and `detail` untinted. */
export interface VehicleParts { body: THREE.BufferGeometry; detail: THREE.BufferGeometry }

/** Car geometry is authored at unit length and instanced to the mover's exact
 * collision span. A broad white cabin and black wheels keep the chunky silhouette. */
export function carBodyGeometry(): THREE.BufferGeometry {
  return voxel([[0, 0.1, 0, 1, 0.27, 0.66, WHITE]]);
}

export function carDetailGeometry(): THREE.BufferGeometry {
  const cabin = 0xf8f9ff, glass = 0x20283b, wheel = 0x151923, hub = 0xa6adbc;
  return voxel([
    [-0.05, 0.37, 0, 0.64, 0.27, 0.51, cabin],
    [-0.05, 0.425, 0.26, 0.53, 0.15, 0.02, glass], [-0.05, 0.425, -0.26, 0.53, 0.15, 0.02, glass],
    [0.275, 0.425, 0, 0.02, 0.15, 0.43, glass], [-0.375, 0.425, 0, 0.02, 0.15, 0.43, glass],
    [-0.08, 0.42, 0.27, 0.045, 0.17, 0.02, cabin], [-0.08, 0.42, -0.27, 0.045, 0.17, 0.02, cabin],
    [0.49, 0.18, 0.21, 0.025, 0.07, 0.11, 0xffedbb], [0.49, 0.18, -0.21, 0.025, 0.07, 0.11, 0xffedbb],
    [-0.49, 0.18, 0.22, 0.025, 0.07, 0.1, 0xc8383b], [-0.49, 0.18, -0.22, 0.025, 0.07, 0.1, 0xc8383b],
    [0.29, 0, 0.32, 0.22, 0.22, 0.11, wheel], [0.29, 0, -0.32, 0.22, 0.22, 0.11, wheel],
    [-0.29, 0, 0.32, 0.22, 0.22, 0.11, wheel], [-0.29, 0, -0.32, 0.22, 0.22, 0.11, wheel],
    [0.29, 0.065, 0.379, 0.08, 0.08, 0.012, hub], [-0.29, 0.065, 0.379, 0.08, 0.08, 0.012, hub],
    [0.29, 0.065, -0.379, 0.08, 0.08, 0.012, hub], [-0.29, 0.065, -0.379, 0.08, 0.08, 0.012, hub],
  ]);
}

/** A truck of 2 or 3 tiles (x), 0.84 wide: a tall tinted cab and hood at the front (+x), then a long
 * light cargo box (`detail`) with a tinted stripe (`body`), a dark chassis and wheels. The cab is
 * 0.86 tall and the cargo 0.96. */
export function truckGeometry(len: 2 | 3): VehicleParts {
  const e = len / 2, cab = 0.76, cargoLen = len - cab - 0.06, cargoX = -e + cargoLen / 2;
  const glass = 0x2b3040, wheel = 0x20232b, chassis = 0x373c48, cargo = 0xe7eef2;
  const wheels: Part[] = [];
  const axle = (x: number): void => { wheels.push([x, 0, 0.375, 0.26, 0.26, 0.12, wheel], [x, 0, -0.375, 0.26, 0.26, 0.12, wheel]); };
  axle(e - 0.34);
  axle(-e + 0.38);
  if (len === 3) axle(-e + 1.0);
  return {
    body: voxel([
      // cab, hood and the stripe along the cargo
      [e - cab / 2 - 0.1, 0.16, 0, cab - 0.2, 0.7, 0.8, WHITE],
      [e - 0.1, 0.16, 0, 0.2, 0.36, 0.78, WHITE],
      [cargoX, 0.4, 0.425, cargoLen - 0.04, 0.14, 0.03, WHITE], [cargoX, 0.4, -0.425, cargoLen - 0.04, 0.14, 0.03, WHITE],
      [-e + 0.01, 0.4, 0, 0.03, 0.14, 0.78, WHITE],
    ]),
    detail: voxel([
      [0, 0.1, 0, len, 0.13, 0.7, chassis],
      [cargoX, 0.22, 0, cargoLen, 0.74, 0.84, cargo],
      // windscreen and side windows
      [e - 0.205, 0.52, 0, 0.05, 0.24, 0.62, glass],
      [e - 0.5, 0.52, 0.405, 0.34, 0.22, 0.03, glass], [e - 0.5, 0.52, -0.405, 0.34, 0.22, 0.03, glass],
      // lights and bumper
      [e - 0.01, 0.2, 0.26, 0.03, 0.08, 0.14, 0xffe08a], [e - 0.01, 0.2, -0.26, 0.03, 0.08, 0.14, 0xffe08a],
      [e - 0.015, 0.1, 0, 0.04, 0.07, 0.8, chassis],
      [-e + 0.01, 0.2, 0.3, 0.03, 0.08, 0.12, 0xff5a5a], [-e + 0.01, 0.2, -0.3, 0.03, 0.08, 0.12, 0xff5a5a],
      ...wheels,
    ]),
  };
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
    carriage: {
      body: voxel([[0, 0.12, 0, 2.0, 0.64, 0.8, WHITE]]),
      detail: voxel([
        [0, 0.76, 0, 1.96, 0.08, 0.68, roof],
        [0, 0.3, 0.405, 2.0, 0.12, 0.02, stripe], [0, 0.3, -0.405, 2.0, 0.12, 0.02, stripe],
        ...windows, ...bogies,
        [0.97, 0.2, 0, 0.08, 0.06, 0.2, dark], [-0.97, 0.2, 0, 0.08, 0.06, 0.2, dark],
      ]),
    },
    nose: {
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
    },
  };
}

/** A dark red-brown, broad voxel log. Low stepped ends and sparse bark patches
 * leave water visible on both sides; 2–4 tiles long with a 0.7-tile footprint. */
export function logGeometry(len: 2 | 3 | 4): THREE.BufferGeometry {
  const bark: Rgb = [0.76, 0.72, 0.72], patch: Rgb = [1.12, 1.05, 1.03];
  const parts: Part[] = [
    [0, 0, 0, len, 0.19, 0.7, WHITE],
    [0, 0.19, 0, len - 0.12, 0.07, 0.59, WHITE],
    [0, 0.07, 0.353, len - 0.12, 0.035, 0.012, bark],
    [0, 0.07, -0.353, len - 0.12, 0.035, 0.012, bark],
  ];
  for (let i = 0; i < len * 2; i++) {
    const x = -len / 2 + 0.28 + i * 0.48;
    parts.push([x, 0.26, i % 2 ? -0.12 : 0.1, 0.25, 0.008, 0.12, i % 3 ? bark : patch]);
  }
  return voxel(parts, 0.86);
}

/** A small, stepped lily pad, with a dark notch. Safe support still uses its
 * whole grid cell; the smaller silhouette lets the water show around it. */
export function lilyGeometry(): THREE.BufferGeometry {
  const pad = 0x35a751, top = 0x49bc61, notch = 0x277f40;
  return voxel([
    [0, 0, 0, 0.56, 0.045, 0.38, pad],
    [0, 0, 0, 0.38, 0.045, 0.56, pad],
    [-0.02, 0.045, -0.02, 0.36, 0.03, 0.36, top],
    [0.18, 0.045, 0, 0.2, 0.008, 0.07, notch],
  ], 0.9);
}

/** Tall olive/lime box trees: a visible brown trunk and one to three foliage
 * cubes with nearly constant footprint. Subtle side bands suggest stacked voxels. */
export function treeGeometry(variant: number): THREE.BufferGeometry {
  const count = variant <= 0 ? 1 : variant === 1 ? 2 : 3, h = 0.55;
  const parts: Part[] = [[0, 0, 0, 0.23, 0.42, 0.23, 0x694737]];
  for (let i = 0; i < count; i++) {
    const w = 0.66;
    parts.push([0, 0.39 + i * h, 0, w, h, w, i === count - 1 ? 0xa0c632 : 0x8aaf2e, 0, 0, i & 1 ? 0x8daf32 : 0x86a630]);
  }
  return voxel(parts, 0.9);
}

/** A lilac-grey rock, up to 0.8 wide. Variant 0 is a boulder with a cap (0.54 tall), 1 a tall pair
 * (0.54) and 2 a low cluster (0.5). Origin at the bottom centre. */
export function rockGeometry(variant: number): THREE.BufferGeometry {
  const base = 0x8981a4, lit = 0xa39aba, shade = 0x72698b;
  if (variant <= 0) return voxel([[0, 0, 0, 0.74, 0.34, 0.62, base], [-0.04, 0.34, 0.02, 0.5, 0.2, 0.42, lit]], 0.9);
  if (variant === 1) return voxel([[-0.14, 0, -0.04, 0.5, 0.42, 0.5, base], [0.22, 0, 0.1, 0.38, 0.26, 0.4, shade], [-0.14, 0.42, -0.04, 0.32, 0.12, 0.32, lit]], 0.9);
  return voxel([[0, 0, 0, 0.8, 0.26, 0.7, shade], [0.1, 0.26, -0.05, 0.5, 0.24, 0.42, base], [-0.22, 0.26, 0.16, 0.26, 0.16, 0.26, lit]], 0.9);
}

/** A striped post with a wide black lamp box, red front bulb and white cap.
 * The separate bulb is centred at y=1.27 so it can flash and swell visibly. */
export function signalPostGeometry(): THREE.BufferGeometry {
  const red = 0xa94750, white = 0xe5deef;
  const parts: Part[] = [
    [0, 0, 0, 0.2, 0.06, 0.2, 0x4b505c],
    [0, 0.06, 0, 0.1, 1.12, 0.1, white],
    [0, 1.12, 0, 0.5, 0.3, 0.19, 0x24232f],
    [0, 1.42, 0, 0.115, 0.11, 0.115, white],
  ];
  for (const y of [0.12, 0.38, 0.64, 0.9]) parts.push([0, y, 0, 0.112, 0.13, 0.112, red]);
  return voxel(parts, 0.92);
}

/** The signal lamp bulb: a 0.2 cube centred on its origin so it pulses about its centre. */
export function lampGeometry(): THREE.BufferGeometry {
  return voxel([[0, -0.1, 0, 0.2, 0.2, 0.2, WHITE]], 1);
}

/** The cartoon UFO: a ten-sided lavender saucer with a pale dome and a ring of yellow lights, about 1.8
 * wide and 0.64 tall. Origin at the centre of the underside, where the beam starts. */
export function ufoGeometry(): THREE.BufferGeometry {
  const saucer = 0xc59bd2, hull = 0xa97fba, under = 0x8e6aa0, top = 0xd6b3e2, glass = 0xe8f4ff, cap = 0xf6fbff, light = 0xffd461, n = 10;
  const lights: Part[] = [];
  for (let i = 0; i < 10; i++) {
    const a = ((i + 0.5) / 10) * Math.PI * 2;
    lights.push([Math.cos(a) * 0.86, 0.2, Math.sin(a) * 0.86, 0.13, 0.1, 0.13, light]);
  }
  return solids(lights, [
    [0, 0, 0, 0.3, 0.26, 0.07, n, under],
    [0, 0.06, 0, 0.4, 0.8, 0.14, n, hull],
    [0, 0.2, 0, 0.85, 0.85, 0.09, n, saucer],
    [0, 0.29, 0, 0.85, 0.5, 0.11, n, top],
    [0, 0.4, 0, 0.46, 0.32, 0.14, n, glass],
    [0, 0.54, 0, 0.32, 0.16, 0.1, n, cap],
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
