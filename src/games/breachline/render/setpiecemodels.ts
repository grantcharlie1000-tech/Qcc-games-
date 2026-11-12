/** CC0 models that make up set pieces (map-fill plan, Phase B and 12.3), laid out in each piece's own frame and turned
 * into prop placements. A placement can be limited to some damage states: a crate on top of a stack is there while
 * the stack is intact or damaged, and a different placement shows it knocked askew once wrecked. Damage that is not a
 * model (chips, splinters, spilled sacks) is drawn over these by render/setpieces.ts. Every placement, in every state,
 * stays inside its piece's collision box (tests/games/breachline/setpieces.test.ts). Pure data: the baker reads it. */
import type { Placement } from './props';
import { SET_PIECES, frame, type SetPieceDef } from './setpieces-data';

/** Each model's bounds in its own space (min x, y, z, max x, y, z), measured from the shipped binary glTF. */
export const MODEL_BOUNDS: Record<string, readonly number[]> = {
  worn_metal_rack: [-0.46, 0, -0.3, 0.455, 1.9, 0.3],
  wooden_crate_02: [-0.265, -0.01, -0.583, 0.265, 0.454, 0.583],
  Barrel_02: [-0.244, 0.005, -0.242, 0.244, 0.885, 0.242],
  concrete_road_barrier_02: [-0.776, -0.003, -0.254, 0.789, 1.109, 0.188],
  compost_bags: [-0.744, -0.005, -0.438, 1.084, 0.702, 0.488],
  cement_bag: [-0.229, 0.001, -0.348, 0.234, 0.181, 0.351],
  trashbag: [-0.26, -0.001, -0.24, 0.268, 0.574, 0.223],
  cardboard_box_01: [-0.193, -0.007, -0.225, 0.195, 0.335, 0.291],
  wooden_military_crate: [-0.621, 0, -0.26, 0.621, 0.465, 0.26],
  sofa_02: [-0.903, 0, -0.478, 0.904, 0.71, 0.34],
};
/** Families built from models rather than in code. */
export const MODEL_FAMILIES = new Set(['sofa', 'shelving', 'crates', 'drums', 'lowwall', 'materials', 'binstore']);

type States = readonly (0 | 1 | 2)[];
/** How far a wrecked sofa leans on its broken leg (radians about its front axis). */
export const SOFA_TILT = 0.07;
/** How far a wrecked shelving rack leans on its buckled upright. */
export const RACK_TILT = 0.06;
/** The crate stacks' crate scale, and the drum clusters' scale and drum centres, shared with the code-drawn damage. */
export const crateScale = (L: number, D: number) => Math.min(1, (D - 0.04) / 1.166, (L - 0.04) / 1.08);
export function drumSpots(L: number, D: number) {
  const s = Math.min(1, (L - 0.06) / 1.0, (D - 0.04) / 0.97), r = 0.245 * s;
  return { s, r, us: [0.03 + r, L - 0.03 - r], ws: [0.02 + r, D - 0.02 - r] };
}
/** The scale that fits sofa_02 into an L x D x H box when tipped by `tilt` about its front axis. */
export function sofaScale(L: number, D: number, H: number, tilt: number) {
  const b = [-0.903, 0, -0.478, 0.904, 0.71, 0.34], ct = Math.cos(tilt), st = Math.sin(tilt);
  let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity;
  for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) { const xr = x * ct - y * st, yr = x * st + y * ct; lx = Math.min(lx, xr); hx = Math.max(hx, xr); ly = Math.min(ly, yr); hy = Math.max(hy, yr); }
  return Math.min(L / (hx - lx), D / (b[5] - b[2]), H / (hy - ly));
}
const ALL: States = [0, 1, 2], STANDING: States = [0, 1], WRECKED: States = [2];

/** The eight corners of a model's bounds turned by `tilt` about its own z axis, then `yaw` about y. */
function turnedBounds(b: readonly number[], yaw: number, tilt: number, s: number) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], ct = Math.cos(tilt), st = Math.sin(tilt), cy = Math.cos(yaw), sy = Math.sin(yaw);
  for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) {
    const x1 = x * ct - y * st, y1 = x * st + y * ct, x2 = x1 * cy + z * sy, z2 = -x1 * sy + z * cy, v = [x2 * s, y1 * s, z2 * s];
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); }
  }
  return { lo, hi };
}

/** Places models in a piece's frame: `u` along it and `w` out from its back to the model's footprint centre, `y` its
 * underside; `yaw` and `tilt` in the frame (yaw 0: the model's +z faces the piece's front). */
function layout(p: SetPieceDef, index: number) {
  const f = frame(p), out: Placement[] = [];
  const base = f.alongX ? (f.front > 0 ? 0 : Math.PI) : (f.front > 0 ? Math.PI / 2 : -Math.PI / 2);
  const world = (u: number, w: number): [number, number] => f.alongX
    ? (f.front > 0 ? [p.x0 + u, p.z0 + w] : [p.x1 - u, p.z1 - w])
    : (f.front > 0 ? [p.x0 + w, p.z1 - u] : [p.x1 - w, p.z0 + u]);
  const put = (model: string, u: number, w: number, y: number, yaw: number, scale: number, states: States, tilt = 0) => {
    const yw = base + yaw, b = turnedBounds(MODEL_BOUNDS[model], yw, tilt, scale), [x, z] = world(u, w);
    out.push({ model, x: +(x - (b.lo[0] + b.hi[0]) / 2).toFixed(4), y: +(y - b.lo[1]).toFixed(4), z: +(z - (b.lo[2] + b.hi[2]) / 2).toFixed(4), yaw: +yw.toFixed(4), scale: +scale.toFixed(4), piece: index, states: states === ALL ? undefined : [...states], tilt: tilt || undefined });
  };
  const { L, D } = f, H = p.y1;
  switch (p.family) {
    case 'sofa': {
      // Poly Haven's sofa_02 scaled into the box; wrecked, a leg has gone and it sits tilted on that end (the thrown
      // cushion, the split back and the stuffing are drawn by render/setpieces.ts).
      put('sofa_02', L / 2, D / 2, 0, 0, sofaScale(L, D, H, 0), STANDING);
      put('sofa_02', L / 2, D / 2, 0, 0, sofaScale(L, D, H, SOFA_TILT) * 0.99, WRECKED, SOFA_TILT);
      break;
    }
    case 'shelving': {
      // A steel rack against the wall, a carton beside it; wrecked, an upright has buckled so the rack leans, its
      // contents are on the floor (drawn in code) and the carton is knocked onto its side.
      const s = Math.min(1, H / 1.9, D / 0.6);
      put('worn_metal_rack', 0.03 + 0.46 * s, D / 2, 0, 0, s, STANDING);
      put('worn_metal_rack', 0.03 + 0.52 * s, D / 2, 0, 0, s * 0.97, WRECKED, RACK_TILT);
      if (L - 0.95 * s > 0.4) {
        put('cardboard_box_01', (0.95 * s + L) / 2, D / 2, 0, 0, 1, STANDING);
        put('cardboard_box_01', (0.95 * s + L) / 2, D / 2, 0, 0.3, 0.95, WRECKED, Math.PI / 2);
      }
      break;
    }
    case 'crates': {
      if (p.name === 'equipment crate') {
        // Military crates: two stacked at the back, one in front; wrecked, the top one is shoved askew.
        const s = Math.min(1, (L - 0.04) / 1.242), h = 0.465 * s;
        put('wooden_military_crate', L / 2, 0.02 + 0.26 * s, 0, 0, s, ALL);
        put('wooden_military_crate', L / 2, D - 0.02 - 0.26 * s, 0, 0, s, ALL);
        put('wooden_military_crate', L / 2, 0.02 + 0.26 * s, h, 0, s, STANDING);
        put('wooden_military_crate', L / 2 - 0.04, 0.3, h - 0.02, 0.1, s * 0.97, WRECKED);
      } else {
        // Two crates side by side and one across them; wrecked, the top one is smashed open (its broken boards and
        // spilled contents are drawn in code).
        const s = crateScale(L, D), h = 0.464 * s;
        put('wooden_crate_02', L / 2 - 0.28 * s, D / 2, 0, 0, s, ALL);
        put('wooden_crate_02', L / 2 + 0.28 * s, D / 2, 0, 0, s, ALL);
        put('wooden_crate_02', L / 2, D / 2, h, Math.PI / 2, s, STANDING);
      }
      break;
    }
    case 'drums': {
      // Four drums; wrecked, the front pair is down to one drum lying on its side and a back one is crushed (drawn
      // in code, with the leaks).
      const { s, us, ws } = drumSpots(L, D);
      put('Barrel_02', us[0], ws[0], 0, 0, s, ALL); put('Barrel_02', us[1], ws[0], 0, Math.PI / 2, s, STANDING);
      put('Barrel_02', us[0], ws[1], 0, Math.PI, s, STANDING); put('Barrel_02', us[1], ws[1], 0, -Math.PI / 2, s, STANDING);
      put('Barrel_02', L / 2, ws[1], 0, 0, s, WRECKED, Math.PI / 2);
      break;
    }
    case 'lowwall': {
      // A row of precast barriers; wrecked, one has been shunted out of line.
      const n = Math.ceil(L / 1.6), s = Math.min((L / n) * 0.97 / 1.565, (H - 0.02) / 1.112, (D - 0.04) / 0.442), step = L / n;
      for (let i = 0; i < n; i++) {
        const u = step * (i + 0.5);
        if (i === n - 2) { put('concrete_road_barrier_02', u, D / 2, 0, 0, s, STANDING); put('concrete_road_barrier_02', u + 0.03, D / 2, 0, 0.07, s * 0.98, WRECKED); }
        else put('concrete_road_barrier_02', u, D / 2, 0, i % 2 ? Math.PI : 0, s, ALL);
      }
      break;
    }
    case 'materials': {
      // A pallet of cement bags (the pallet is drawn in code) and a heap of compost sacks; the top layer of cement
      // goes when it is wrecked.
      const cols = 2, rows = D >= 1.45 ? 2 : 1, layers = 4;
      for (let l = 0; l < layers; l++) for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++)
        put('cement_bag', 0.04 + 0.24 + c * 0.47, rows === 1 ? D / 2 : 0.04 + 0.36 + r * 0.72, 0.12 + l * 0.18, (l + c) % 2 ? 0.04 : -0.03, 1, l === layers - 1 ? STANDING : ALL);
      const s = Math.min((L - 1.02) / 1.828, (D - 0.04) / 0.926, 1);
      put('compost_bags', 1.0 + (L - 1.0) / 2, D / 2, 0, 0, s, ALL);
      break;
    }
    case 'binstore': {
      // Sacks of rubbish inside the slatted enclosure (drawn in code); wrecked, one has been thrown down.
      for (let i = 0; i < 3; i++) put('trashbag', 0.45 + i * (L - 0.9) / 2, 0.42, 0, i * 1.3, 1, i === 1 ? STANDING : ALL);
      put('trashbag', L / 2 + 0.1, 0.5, 0, 0.6, 0.95, WRECKED, Math.PI / 2);
      break;
    }
  }
  return out;
}

/** Every set piece's model placements. */
export const PIECE_PROPS: Placement[] = SET_PIECES.flatMap((p, i) => (MODEL_FAMILIES.has(p.family) ? layout(p, i) : []));
