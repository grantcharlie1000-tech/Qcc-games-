/** Turns the map into meshes. Static geometry is merged into one mesh per texture with lighting baked into vertex
 * colours; each destructible panel is its own small mesh, rebuilt whenever cells are knocked out of it. */
import * as THREE from 'three';
import { CELL, WALL_H } from './config';
import type { Bake, RGB } from './lightbake';
import { MAP, type FloorMat } from './map';
import { TILE, type TexId } from './textures';
import { PANEL_T, panelPoint, type Box, type Panel } from './world';

class Batch {
  pos: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  mesh(material: THREE.Material): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.matrixAutoUpdate = false;
    return m;
  }
}
const WHITE: RGB = [1, 1, 1];
export type UvMode = 'world' | 'fit';
/** One rectangle of static level surface, as the builder is asked for it. */
export interface FaceRec {
  tex: TexId; o: [number, number, number]; u: [number, number, number]; lu: number; v: [number, number, number]; lv: number;
  tint: RGB; mode: UvMode; cell: number; glow?: RGB;
}
/** Takes faces for another renderer; returns the pieces (possibly none) still to be drawn the old way. */
export type Claim = (f: FaceRec) => FaceRec[];

export class LevelBuilder {
  private batches = new Map<TexId, Batch>();
  constructor(private bake: Bake, private claim?: Claim) {}
  private batch(id: TexId) { let b = this.batches.get(id); if (!b) { b = new Batch(); this.batches.set(id, b); } return b; }
  /** A lit rectangle from `o`, spanning `lu` along U and `lv` along V (unit vectors, U x V = normal), split so no
   * piece is larger than `cell` and the baked light has vertices to live on. */
  face(tex: TexId, ox: number, oy: number, oz: number, ux: number, uy: number, uz: number, lu: number, vx: number, vy: number, vz: number, lv: number, tint: RGB = WHITE, mode: UvMode = 'world', cell = 0.75, glow?: RGB) {
    if (lu < 1e-4 || lv < 1e-4) return;
    if (this.claim) {
      for (const f of this.claim({ tex, o: [ox, oy, oz], u: [ux, uy, uz], lu, v: [vx, vy, vz], lv, tint, mode, cell, glow })) this.draw(f.tex, f.o[0], f.o[1], f.o[2], f.u[0], f.u[1], f.u[2], f.lu, f.v[0], f.v[1], f.v[2], f.lv, f.tint, f.mode, f.cell, f.glow);
      return;
    }
    this.draw(tex, ox, oy, oz, ux, uy, uz, lu, vx, vy, vz, lv, tint, mode, cell, glow);
  }
  private draw(tex: TexId, ox: number, oy: number, oz: number, ux: number, uy: number, uz: number, lu: number, vx: number, vy: number, vz: number, lv: number, tint: RGB, mode: UvMode, cell: number, glow?: RGB) {
    if (lu < 1e-4 || lv < 1e-4) return;
    const b = this.batch(tex), nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nu = Math.max(1, Math.ceil(lu / cell)), nv = Math.max(1, Math.ceil(lv / cell)), base = b.pos.length / 3, tile = TILE[tex];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const s = lu * i / nu, t = lv * j / nv, x = ox + ux * s + vx * t, y = oy + uy * s + vy * t, z = oz + uz * s + vz * t;
      b.pos.push(x, y, z);
      if (mode === 'fit') b.uv.push(s / lu, t / lv);
      else if (Math.abs(ny) > 0.5) b.uv.push(x / tile[0], -z / tile[1]);
      else b.uv.push((Math.abs(nx) > 0.5 ? -z * Math.sign(nx) : x * Math.sign(nz)) / tile[0], y / tile[1]);
      const l = glow ?? this.bake.light(x, y, z, nx, ny, nz);
      b.col.push(l[0] * tint[0], l[1] * tint[1], l[2] * tint[2]);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, c = a + 1, d = a + nu + 1, e = d + 1;
      b.idx.push(a, c, e, a, e, d);
    }
  }
  /** A box. `tex` may choose a texture per side: 0 +X, 1 -X, 2 +Y, 3 -Y, 4 +Z, 5 -Z; null skips the side. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tex: TexId | ((side: number) => TexId | null), tint: RGB = WHITE, mode: UvMode = 'world') {
    const t = typeof tex === 'function' ? tex : () => tex, dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const f = (side: number, ...a: [number, number, number, number, number, number, number, number, number, number, number]) => { const id = t(side); if (id) this.face(id, a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], tint, mode); };
    f(0, x1, y0, z1, 0, 0, -1, dz, 0, 1, 0, dy);
    f(1, x0, y0, z0, 0, 0, 1, dz, 0, 1, 0, dy);
    f(2, x0, y1, z1, 1, 0, 0, dx, 0, 0, -1, dz);
    if (y0 > 0.05) f(3, x0, y0, z0, 1, 0, 0, dx, 0, 0, 1, dz);
    f(4, x0, y0, z1, 1, 0, 0, dx, 0, 1, 0, dy);
    f(5, x1, y0, z0, -1, 0, 0, dx, 0, 1, 0, dy);
  }
  build(materials: Record<TexId, THREE.Material>): THREE.Group {
    const group = new THREE.Group();
    for (const [id, b] of this.batches) if (b.idx.length) group.add(b.mesh(materials[id]));
    return group;
  }
  get triangles() { let n = 0; for (const b of this.batches.values()) n += b.idx.length / 3; return n; }
}

const FLOOR_TEX: Record<FloorMat, TexId> = { asphalt: 'asphalt', grass: 'grass', slab: 'slab', tile: 'tile', lino: 'lino', carpet: 'carpet', planks: 'floorboards', raised: 'raised', check: 'check' };
const CONTAINER_TINTS: RGB[] = [[0.25, 0.6, 0.62], [0.85, 0.42, 0.2], [0.24, 0.36, 0.62], [0.55, 0.6, 0.3], [0.7, 0.24, 0.22]];
const VAN_TINTS: RGB[] = [[0.92, 0.92, 0.9], [0.2, 0.34, 0.5], [0.55, 0.14, 0.12]];
const inside = (x: number, z: number) => x > MAP.building.x0 + 0.01 && x < MAP.building.x1 - 0.01 && z > MAP.building.z0 + 0.01 && z < MAP.building.z1 - 0.01;

function prop(L: LevelBuilder, b: Box, n: number) {
  const { x0, y0, z0, x1, y1, z1 } = b, dx = x1 - x0, dz = z1 - z0, long = dx >= dz;
  switch (b.mat) {
    case 'brick': {
      // Outer shell: brick outside, painted block inside, roofing on top.
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      L.box(x0, y0, z0, x1, y1, z1, side => side === 2 ? 'roof' : side === 3 ? 'cinder' : inside(cx + (side === 0 ? dx / 2 + 0.2 : side === 1 ? -dx / 2 - 0.2 : 0), cz + (side === 4 ? dz / 2 + 0.2 : side === 5 ? -dz / 2 - 0.2 : 0)) ? 'cinder' : 'brick');
      break;
    }
    case 'plaster': L.box(x0, y0, z0, x1, y1, z1, 'drywall'); break;
    case 'trim': L.box(x0, y0, z0, x1, y1, z1, 'trim'); break;
    case 'concrete': L.box(x0, y0, z0, x1, y1, z1, 'concrete'); break;
    case 'crate': L.box(x0, y0, z0, x1, y1, z1, 'crate', WHITE, 'fit'); break;
    case 'container': L.box(x0, y0, z0, x1, y1, z1, 'container', CONTAINER_TINTS[n % CONTAINER_TINTS.length]); break;
    case 'rack': L.box(x0, y0, z0, x1, y1, z1, side => (side === 2 || side === 3 ? 'trim' : (side < 2) === long ? 'trim' : 'rack')); break;
    case 'steel': L.box(x0, y0, z0, x1, y1, z1, 'steel'); break;
    case 'shelf': L.box(x0, y0, z0, x1, y1, z1, side => (side === 2 || side === 3 ? 'trim' : (side < 2) === long ? 'trim' : 'shelf')); break;
    case 'counter':
      L.box(x0, y0, z0, x1, y1 - 0.05, z1, side => (side === 2 ? null : 'counter'));
      L.box(x0 - 0.03, y1 - 0.05, z0 - 0.03, x1 + 0.03, y1, z1 + 0.03, 'paint', [0.78, 0.8, 0.8]);
      break;
    case 'wood':
      if (y1 > 0.9 || y1 < 0.6) { L.box(x0, y0, z0, x1, y1 - 0.05, z1, 'wood', [0.7, 0.7, 0.7]); L.box(x0 - 0.03, y1 - 0.05, z0 - 0.03, x1 + 0.03, y1, z1 + 0.03, 'wood'); }
      else {
        // A desk: a top on two end panels and a modesty panel.
        L.box(x0, y1 - 0.05, z0, x1, y1, z1, 'wood');
        if (long) { L.box(x0 + 0.04, 0, z0 + 0.05, x0 + 0.09, y1 - 0.05, z1 - 0.05, 'wood', [0.6, 0.6, 0.6]); L.box(x1 - 0.09, 0, z0 + 0.05, x1 - 0.04, y1 - 0.05, z1 - 0.05, 'wood', [0.6, 0.6, 0.6]); L.box(x0 + 0.09, 0.2, z0 + 0.08, x1 - 0.09, y1 - 0.05, z0 + 0.11, 'wood', [0.6, 0.6, 0.6]); }
        else { L.box(x0 + 0.05, 0, z0 + 0.04, x1 - 0.05, y1 - 0.05, z0 + 0.09, 'wood', [0.6, 0.6, 0.6]); L.box(x0 + 0.05, 0, z1 - 0.09, x1 - 0.05, y1 - 0.05, z1 - 0.04, 'wood', [0.6, 0.6, 0.6]); L.box(x0 + 0.08, 0.2, z0 + 0.09, x0 + 0.11, y1 - 0.05, z1 - 0.09, 'wood', [0.6, 0.6, 0.6]); }
      }
      break;
    case 'fabric':
      // A sofa: seat, back along one long side, arms at the ends.
      L.box(x0, 0, z0, x1, 0.45, z1, 'fabric');
      if (long) { L.box(x0, 0.45, z0, x1, y1, z0 + 0.22, 'fabric', [0.85, 0.85, 0.85]); L.box(x0, 0.45, z0 + 0.22, x0 + 0.18, 0.62, z1, 'fabric'); L.box(x1 - 0.18, 0.45, z0 + 0.22, x1, 0.62, z1, 'fabric'); }
      else { L.box(x1 - 0.22, 0.45, z0, x1, y1, z1, 'fabric', [0.85, 0.85, 0.85]); L.box(x0, 0.45, z0, x1 - 0.22, 0.62, z0 + 0.18, 'fabric'); L.box(x0, 0.45, z1 - 0.18, x1 - 0.22, 0.62, z1, 'fabric'); }
      break;
    case 'van': {
      // Body, cab glass and wheels, laid out along the long side.
      const tint = VAN_TINTS[n % VAN_TINTS.length], h = y1, w = 0.34, cab = (long ? dx : dz) * 0.3;
      const part = (a0: number, a1: number, b0: number, b1: number, c0: number, c1: number, tex: TexId, t: RGB = WHITE) => (long ? L.box(x0 + a0, b0, z0 + c0, x0 + a1, b1, z0 + c1, tex, t) : L.box(x0 + c0, b0, z0 + a0, x0 + c1, b1, z0 + a1, tex, t));
      const len = long ? dx : dz, wid = long ? dz : dx;
      part(0, len, w, h * 0.58, 0, wid, 'paint', tint);
      part(cab, len, h * 0.58, h, 0, wid, 'paint', tint);
      part(0.08, cab, h * 0.58, h * 0.94, 0.06, wid - 0.06, 'glass');
      part(-0.06, 0.04, w, w + 0.24, 0, wid, 'trim'); part(len - 0.04, len + 0.06, w, w + 0.24, 0, wid, 'trim');
      for (const a of [len * 0.14, len * 0.74]) for (const c of [-0.02, wid - 0.24]) part(a, a + 0.7, 0, 0.7, c, c + 0.26, 'rubber');
      break;
    }
    default: L.box(x0, y0, z0, x1, y1, z1, 'concrete');
  }
}

/** The whole static level, lit. Faces a `claim` takes are left to the asset renderer. */
export function buildLevel(bake: Bake, materials: Record<TexId, THREE.Material>, claim?: Claim): { group: THREE.Group; triangles: number } {
  const L = new LevelBuilder(bake, claim);
  emitLevel(L);
  return { group: L.build(materials), triangles: L.triangles };
}

/** Every static surface of the level, as calls on a builder. Shared by the browser and the offline light baker. */
export function emitLevel(L: LevelBuilder) {
  const B = MAP.building;
  // Ground, then grass and room floors a hair above it.
  MAP.floors.forEach((f, i) => { const y = i === 0 ? 0 : f.mat === 'grass' ? 0.012 : 0.02; L.face(FLOOR_TEX[f.mat], f.x0, y, f.z1, 1, 0, 0, f.x1 - f.x0, 0, 0, -1, f.z1 - f.z0, WHITE, 'world', i === 0 ? 1.4 : 0.6); });
  // Yard markings.
  const line = (x0: number, z0: number, x1: number, z1: number, tint: RGB) => L.face('paint', x0, 0.03, z1, 1, 0, 0, x1 - x0, 0, 0, -1, z1 - z0, tint, 'world', 1.2);
  for (let i = 0; i < 6; i++) line(3 + i * 2.6, 17.2, 3.12 + i * 2.6, 21.6, [0.8, 0.8, 0.76]);
  for (let i = 0; i < 5; i++) line(-26.8, -3 + i * 2.6, -22.4, -2.88 + i * 2.6, [0.8, 0.8, 0.76]);
  for (let i = 0; i < 8; i++) line(-18.4 + i * 0.44, -7.5, -18.2 + i * 0.44, -4.5, [0.85, 0.66, 0.1]);
  line(-15.9, 9.9, 15.9, 10.9, [0.42, 0.42, 0.42]); line(-15.9, -10.9, 15.9, -9.9, [0.42, 0.42, 0.42]);
  // Ceiling, lamp panels and the roof.
  // One ceiling piece per room, so a room can be handed to another renderer whole.
  for (const r of MAP.rooms.slice(0, 8)) L.face('ceiling', r.x0, WALL_H, r.z0, 1, 0, 0, r.x1 - r.x0, 0, 0, 1, r.z1 - r.z0, WHITE, 'world', 0.75);
  for (const l of MAP.lamps) L.face('lamp', l.x - 0.6, WALL_H - 0.015, l.z - 0.3, 1, 0, 0, 1.2, 0, 0, 1, 0.6, WHITE, 'fit', 9, [l.color[0] * 2.6, l.color[1] * 2.6, l.color[2] * 2.6]);
  L.face('roof', B.x0, WALL_H + 0.3, B.z1, 1, 0, 0, B.x1 - B.x0, 0, 0, -1, B.z1 - B.z0, WHITE, 'world', 3);
  MAP.boxes.forEach((b, n) => { if (b.draw) prop(L, b, n); });
  // Frames around every doorway and window.
  for (const p of MAP.panels) {
    if (p.kind === 'wall') continue;
    const t = (p.closed ? 0.3 : 0.14) / 2 + 0.035, u1 = p.u0 + p.cols * CELL, y1 = p.y0 + p.rows * CELL, w = 0.07;
    const bar = (a0: number, a1: number, b0: number, b1: number) => (p.axis === 'x' ? L.box(a0, b0, p.pos - t, a1, b1, p.pos + t, 'trim') : L.box(p.pos - t, b0, a0, p.pos + t, b1, a1, 'trim'));
    bar(p.u0 - w, p.u0, p.y0, y1 + w); bar(u1, u1 + w, p.y0, y1 + w); bar(p.u0, u1, y1, y1 + w);
    if (p.kind === 'window') bar(p.u0 - w, u1 + w, p.y0 - w, p.y0);
  }
}

// ---- Destructible panels -------------------------------------------------------------------------------------------------
export interface PanelMaterials { wall: THREE.Material; core: THREE.Material; planks: THREE.Material; plate: THREE.Material }
/** A panel in an asset-rendered room: baked light per cell corner (side +1/-1 along the wall's normal axis, 0 for
 * the broken edge between them) and the room's wall material, whose UVs are in `tile` metres per repeat. */
export interface PanelLook { light(c: number, r: number, side: number): RGB | null; wall: THREE.Material; tile: readonly [number, number]; planks?: THREE.Material; plankTile?: readonly [number, number] }

/** Where a panel's geometry gets its light: corner (u, y), offset along the wall normal, and side (+1, -1, 0 for edges). */
export type PanelLight = (u: number, y: number, off: number, side: number) => RGB;
/** Board thickness of each skin. */
export const SKIN = 0.0125;
const STUD = 0.045, STUD_PITCH = 0.6, NOGGIN = 1.2;
/** Paper liner thickness; the fringe of bare gypsum where the face paper tears back from a break. */
const PAPER = 0.0012, FRINGE = 0.022;
/** Tints (on the wall's own texture and light): gypsum core, the brown back paper, the cavity side of the board,
 * the bared gypsum at a tear and the ragged paper edge just inside it. */
const GYPSUM: RGB = [1.02, 1.0, 0.94], BACK_PAPER: RGB = [0.62, 0.54, 0.42], CAVITY: RGB = [0.4, 0.35, 0.28];
const GYPSUM_FACE: RGB = [1.12, 1.1, 1.05], TORN: RGB = [0.74, 0.71, 0.66];
/** Deterministic hash in [0, 1) of a panel corner. */
const hash = (a: number, b: number, c: number) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return v - Math.floor(v); };

/** Builds a panel's mesh: faces (group 0), board edges and cavity (group 1), studs (group 2). Pure, testable. */
export function panelGeometry(p: Panel, look: PanelLook | null, light: PanelLight): { geometry: THREE.BufferGeometry; studs: { c: number; r: number }[] } {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], face: number[] = [], edge: number[] = [], stud: number[] = [];
  const studs: { c: number; r: number }[] = [];
  const plate = p.reinforced, wood = p.kind !== 'wall', half = (plate ? 0.2 : wood ? 0.07 : PANEL_T) / 2;
  const tile = plate ? TILE.plate : wood ? look?.plankTile ?? TILE.planks : look ? look.tile : TILE.drywall, alongX = p.axis === 'x';
  const cell = (c: number, r: number) => c < 0 || r < 0 || c >= p.cols || r >= p.rows || plate || p.cells[r * p.cols + c] === 1;
  const torn = !plate && !wood && p.intact < p.cells.length;
  /** How far a skin's corner tears back (in u and y) from the hole beside it, into the intact board; zero away from
   * holes and on the panel's rim. Each skin tears differently, which opens the cavity and shows the studs. */
  const jitter = (cu: number, cy: number, skin: number): [number, number] => {
    if (!torn || cu <= 0 || cy <= 0 || cu >= p.cols || cy >= p.rows) return [0, 0];
    let du = 0, dy = 0, open = 0;
    for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (!cell(cu + dc, cy + dr)) { du += dc + 0.5; dy += dr + 0.5; open++; }
    if (!open || open === 4) return [0, 0];
    // A corner touching a single open cell would cut a long notch, so it moves less.
    const l = Math.hypot(du, dy) || 1, m = CELL * (0.15 + 0.35 * hash(p.u0 + cu, p.y0 + cy, p.pos + skin * 3.1)) * (open === 1 ? 0.45 : 1);
    return [-du / l * m, -dy / l * m];
  };
  const vert = (u: number, y: number, off: number, n: number, shade: number | RGB, nx = 0, ny = 0, fixed = false) => {
    const cu = Math.round((u - p.u0) / CELL), cy = Math.round((y - p.y0) / CELL), [ju, jy] = fixed ? [0, 0] : jitter(cu, cy, Math.sign(off)), uu = u + ju, yy = y + jy;
    const w = panelPoint(p, uu, yy, off), l = light(u, y, off, n);
    const [sr, sg, sb] = typeof shade === 'number' ? [shade, shade, shade] : shade;
    pos.push(w.x, w.y, w.z); uv.push(uu / tile[0], yy / tile[1]); col.push(l[0] * sr, l[1] * sg, l[2] * sb);
    if (n) { if (alongX) nor.push(0, 0, n); else nor.push(n, 0, 0); }
    else if (alongX) nor.push(nx, ny, 0); else nor.push(0, ny, nx);
    return pos.length / 3 - 1;
  };
  const quad = (list: number[], a: number, b: number, c: number, d: number, flip: boolean) => { if (flip) list.push(a, d, c, a, c, b); else list.push(a, b, c, a, c, d); };
  if (wood && !plate) return barricade();
  // Front and back: runs of intact cells along each row become one quad each (split every half metre, so rows share
  // their lit columns).
  for (let r = 0; r < p.rows; r++) {
    let start = -1;
    for (let c = 0; c <= p.cols; c++) {
      const on = c < p.cols && cell(c, r);
      if (on) { if (start < 0) { start = c; continue; } if (c % 2 !== 0) continue; }
      if (start < 0) continue;
      const u0 = p.u0 + start * CELL, u1 = p.u0 + c * CELL, y0 = p.y0 + r * CELL, y1 = y0 + CELL;
      for (const n of [1, -1]) quad(face, vert(u0, y0, half * n, n, 1), vert(u1, y0, half * n, n, 1), vert(u1, y1, half * n, n, 1), vert(u0, y1, half * n, n, 1), alongX ? n < 0 : n > 0);
      start = on ? c : -1;
    }
  }
  if (!plate) {
    // Broken edges. Planks are solid timber, shown full depth; plasterboard shows each skin's board thickness and the
    // dark cavity behind it.
    const skin = wood ? half : SKIN;
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
      if (!cell(c, r)) continue;
      const u0 = p.u0 + c * CELL, u1 = u0 + CELL, y0 = p.y0 + r * CELL, y1 = y0 + CELL;
      const strip = (ua: number, ya: number, ub: number, yb: number, nx: number, ny: number) => {
        // Across each board's cut edge: the face paper, the white gypsum core, the brown back paper.
        const bands: [number, number, number | RGB][] = wood ? [[-half, half, 0.55]] : [];
        if (!wood) for (const sgn of [1, -1]) {
          const out = sgn * half, inn = sgn * (half - skin), a = sgn * (half - PAPER), b = sgn * (half - skin + PAPER);
          bands.push([out, a, 0.9], [a, b, GYPSUM], [b, inn, BACK_PAPER]);
        }
        for (const [o0, o1, shade] of bands) {
          const a = vert(ua, ya, o0, 0, shade, nx, ny), b = vert(ub, yb, o0, 0, shade, nx, ny), cc = vert(ub, yb, o1, 0, shade, nx, ny), d = vert(ua, ya, o1, 0, shade, nx, ny);
          edge.push(a, b, cc, a, cc, d, a, cc, b, a, d, cc);
        }
        if (wood) return;
        // On both faces, a torn fringe: the paint and paper peel back a little from the break, baring gypsum. Its
        // inner edge follows the same tear as the break, so the band's width varies along it.
        const w = FRINGE * (0.6 + 0.8 * hash(ua * 7.3, ya * 3.1, p.pos));
        for (const n of [1, -1]) {
          const off = n * (half + 0.0006);
          const a = vert(ua, ya, off, n, GYPSUM_FACE), b = vert(ub, yb, off, n, GYPSUM_FACE);
          const c2 = vert(ub - nx * w, yb - ny * w, off, n, TORN), d2 = vert(ua - nx * w, ya - ny * w, off, n, TORN);
          edge.push(a, b, c2, a, c2, d2, a, c2, b, a, d2, c2);
        }
      };
      const left = c > 0 && !cell(c - 1, r), right = c < p.cols - 1 && !cell(c + 1, r), down = r > 0 && !cell(c, r - 1), up = r < p.rows - 1 && !cell(c, r + 1);
      if (left) strip(u0, y0, u0, y1, -1, 0);
      if (right) strip(u1, y0, u1, y1, 1, 0);
      if (down) strip(u0, y0, u1, y0, 0, -1);
      if (up) strip(u0, y1, u1, y1, 0, 1);
      if (wood || !(left || right || down || up)) continue;
      // The inside faces of both skins, seen through the hole: the brown back of the board, in shadow.
      for (const n of [1, -1]) {
        const off = n * (half - SKIN);
        quad(edge, vert(u0, y0, off, -n, CAVITY), vert(u1, y0, off, -n, CAVITY), vert(u1, y1, off, -n, CAVITY), vert(u0, y1, off, -n, CAVITY), alongX ? n > 0 : n < 0);
      }
    }
    // Studs and the noggin, inside the cavity, only where their cell is intact and a hole is near enough to see them.
    if (torn) {
      const near = (c: number, r: number) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (!cell(c + dc, r + dr)) return true; return false; };
      const timber = (ua: number, ub: number, ya: number, yb: number) => {
        const d = half - SKIN, sh = 0.5;
        // Four sides of a stick of timber running between the skins.
        quad(stud, vert(ua, ya, -d, 0, sh, -1, 0, true), vert(ua, yb, -d, 0, sh, -1, 0, true), vert(ua, yb, d, 0, sh, -1, 0, true), vert(ua, ya, d, 0, sh, -1, 0, true), false);
        quad(stud, vert(ub, ya, -d, 0, sh, 1, 0, true), vert(ub, ya, d, 0, sh, 1, 0, true), vert(ub, yb, d, 0, sh, 1, 0, true), vert(ub, yb, -d, 0, sh, 1, 0, true), false);
        // End grain where the stick meets a hole above or below it.
        quad(stud, vert(ua, ya, -d, 0, sh * 0.8, 0, -1, true), vert(ua, ya, d, 0, sh * 0.8, 0, -1, true), vert(ub, ya, d, 0, sh * 0.8, 0, -1, true), vert(ub, ya, -d, 0, sh * 0.8, 0, -1, true), false);
        quad(stud, vert(ua, yb, -d, 0, sh * 0.8, 0, 1, true), vert(ub, yb, -d, 0, sh * 0.8, 0, 1, true), vert(ub, yb, d, 0, sh * 0.8, 0, 1, true), vert(ua, yb, d, 0, sh * 0.8, 0, 1, true), false);
        stud.push(...stud.slice(-24).reverse());
      };
      for (let su = Math.ceil((p.u0 + 0.05) / STUD_PITCH) * STUD_PITCH; su < p.u0 + p.cols * CELL - 0.05; su += STUD_PITCH) {
        const c = Math.floor((su - p.u0) / CELL);
        for (let r = 0; r < p.rows; r++) {
          if (!cell(c, r) || !near(c, r)) continue;
          // A stud piece within its cell (stopping short of the cell's edges, so it never reaches into open cells).
          const y0 = p.y0 + r * CELL, ua = Math.max(su - STUD / 2, p.u0 + c * CELL), ub = Math.min(su + STUD / 2, p.u0 + (c + 1) * CELL);
          timber(ua, ub, y0, y0 + CELL);
          studs.push({ c, r });
        }
      }
      const nr = Math.floor((NOGGIN - p.y0) / CELL);
      if (nr >= 0 && nr < p.rows) for (let c = 0; c < p.cols; c++) {
        if (!cell(c, nr) || !near(c, nr)) continue;
        const y = p.y0 + nr * CELL + CELL / 2, u0 = p.u0 + c * CELL;
        timber(u0, u0 + CELL, y - STUD / 2, y + STUD / 2);
        studs.push({ c, r: nr });
      }
    }
  }
  return finish();

  /** A barricade: one plank per row of cells, with gaps, alternating depth and a slight tilt each; a run of intact
   * cells is one length of board, and where cells are gone the board ends in a jagged, splintered break. Nail heads
   * where a board rests on the frame. Faces in group 0, ends and nails in group 1. */
  function barricade() {
    const GAP = 0.022, T = 0.026;
    for (let r = 0; r < p.rows; r++) {
      const h = hash(p.u0, p.y0 + r, p.pos), tilt = (h - 0.5) * 0.035, depth = (r % 2 ? 1 : -1) * 0.007, mid = p.u0 + p.cols * CELL / 2;
      const yAt = (u: number, top: boolean) => p.y0 + r * CELL + (top ? CELL - GAP / 2 : GAP / 2) + (u - mid) * tilt;
      // This plank's slice of the texture and its own shade, so neighbouring boards differ.
      const vo = Math.floor(h * 12) * 0.075, uo = hash(r, p.pos, p.u0) * 3, tone = 0.82 + 0.3 * hash(r * 3.7, p.u0, p.pos);
      const shadeT: RGB = [tone, tone * 0.97, tone * 0.93];
      let start = -1;
      for (let c = 0; c <= p.cols; c++) {
        const on = c < p.cols && cell(c, r);
        if (on) { if (start < 0) start = c; continue; }
        if (start < 0) continue;
        board(start, c, r, yAt, depth, T, vo, uo, shadeT);
        start = -1;
      }
    }
    return finish();
  }
  function board(c0: number, c1: number, r: number, yAt: (u: number, top: boolean) => number, depth: number, T: number, vo: number, uo: number, shade: RGB) {
    const ua = p.u0 + c0 * CELL, ub = p.u0 + c1 * CELL, brokeA = c0 > 0, brokeB = c1 < p.cols;
    // A break is jagged: top, middle and bottom of the end stop at different places.
    const ends = (u: number, broke: boolean, dir: number, k: number): [number, number, number] => {
      if (!broke) return [u, u, u];
      // Top and bottom tear back into the board by different amounts (a rough diagonal break); a splinter tip
      // reaches no more than 3 cm into the gap.
      const j = (n: number) => hash(u * 9.1 + n, r * 1.7 + k, p.pos);
      const top = u - dir * 0.08 * j(1), bottom = u - dir * 0.08 * j(3);
      return [top, Math.max(top, bottom) * (dir > 0 ? 1 : 0) + Math.min(top, bottom) * (dir > 0 ? 0 : 1) + dir * 0.03 * j(2), bottom];
    };
    const [at, am, ab] = ends(ua, brokeA, -1, 0), [bt, bm, bb] = ends(ub, brokeB, 1, 1);
    const ym = (yAt(ua, true) + yAt(ua, false)) / 2, ymB = (yAt(ub, true) + yAt(ub, false)) / 2;
    const pt = (u: number, y: number, off: number, n: number, sh: number | RGB, nx = 0, ny = 0, vEdge?: number) => {
      const w = panelPoint(p, u, y, off), l = light(u, y, off, n);
      const [sr, sg, sb] = typeof sh === 'number' ? [sh, sh, sh] : sh;
      pos.push(w.x, w.y, w.z); uv.push(u / tile[0] + uo, vEdge ?? ((y - p.y0 - r * CELL) / CELL * 0.065 + vo)); col.push(l[0] * sr, l[1] * sg, l[2] * sb);
      if (n) { if (alongX) nor.push(0, 0, n); else nor.push(n, 0, 0); } else if (alongX) nor.push(nx, ny, 0); else nor.push(0, ny, nx);
      return pos.length / 3 - 1;
    };
    // Outline: top edge, the two ends (through their middle points), bottom edge; drawn as an upper and a lower quad.
    const outline: [number, number][] = [[at, yAt(at, true)], [bt, yAt(bt, true)], [bm, ymB], [bb, yAt(bb, false)], [ab, yAt(ab, false)], [am, ym]];
    for (const n of [1, -1]) {
      const off = depth + n * T / 2, sh: RGB = n > 0 ? shade : [shade[0] * 0.9, shade[1] * 0.9, shade[2] * 0.9];
      const v = outline.map(([u, y]) => pt(u, y, off, n, sh)), flip = alongX ? n < 0 : n > 0;
      quad(face, v[0], v[1], v[2], v[5], flip); quad(face, v[5], v[2], v[3], v[4], flip);
    }
    // Edges all round: long top and bottom faces, and the ends (pale, rough end grain where snapped).
    for (let i = 0; i < outline.length; i++) {
      const [u0, y0] = outline[i], [u1, y1] = outline[(i + 1) % outline.length];
      const du = u1 - u0, dy = y1 - y0, l = Math.hypot(du, dy) || 1, nx = -dy / l, ny = du / l;
      const isEnd = i === 1 || i === 2 || i === 4 || i === 5, snapped = (i === 1 || i === 2) ? brokeB : (i === 4 || i === 5) ? brokeA : false;
      const sh: RGB = snapped ? [1.15, 1.05, 0.88] : isEnd ? [0.7, 0.62, 0.52] : [shade[0] * 0.55, shade[1] * 0.52, shade[2] * 0.5];
      const a = pt(u0, y0, depth - T / 2, 0, sh, nx, ny, vo), b = pt(u1, y1, depth - T / 2, 0, sh, nx, ny, vo), cc = pt(u1, y1, depth + T / 2, 0, sh, nx, ny, vo + 0.03), d = pt(u0, y0, depth + T / 2, 0, sh, nx, ny, vo + 0.03);
      edge.push(a, b, cc, a, cc, d, a, cc, b, a, d, cc);
    }
    // Nails where the board rests on the frame, on the face that shows.
    for (const [u, rests] of [[ua + 0.12, !brokeA], [ub - 0.12, !brokeB]] as const) {
      if (!rests) continue;
      for (const dy of [-0.055, 0.055]) {
        const y = (yAt(u, true) + yAt(u, false)) / 2 + dy, s = 0.01;
        for (const side of [1, -1]) {
          const o = depth + side * (T / 2 + 0.002);
          const NAIL: RGB = [0.16, 0.16, 0.17], k = [pt(u - s, y - s, o, side, NAIL), pt(u + s, y - s, o, side, NAIL), pt(u + s, y + s, o, side, NAIL), pt(u - s, y + s, o, side, NAIL)];
          quad(edge, k[0], k[1], k[2], k[3], alongX ? side < 0 : side > 0);
        }
      }
    }
  }
  function finish() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex([...face, ...edge, ...stud]);
  // An undamaged panel is a single draw call; damage adds edges and, for plasterboard, the studs.
  g.addGroup(0, face.length, 0);
  if (edge.length) g.addGroup(face.length, edge.length, 1);
  if (stud.length) g.addGroup(face.length + edge.length, stud.length, 2);
  g.computeBoundingSphere();
  return { geometry: g, studs };
  }
}

export class PanelView {
  readonly mesh: THREE.Mesh;
  private version = -1;
  constructor(readonly panel: Panel, private bake: Bake, private mats: PanelMaterials, private look: PanelLook | null = null) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), [mats.wall, mats.core, mats.planks]);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = true;
  }
  /** Rebuilds the mesh if the panel changed. Returns true when it did.
   *
   * A plasterboard wall is two 12.5 mm skins with a cavity and timber studs at 600 mm centres (a noggin at 1.2 m).
   * Damage shows as torn holes: corners on a hole's rim are pushed out into the hole by a fixed, position-seeded
   * amount, so outlines are ragged but nothing visible ever intrudes into a gap the simulation says is open. Studs
   * exist only in intact cells, so they go with the cells around them. Barricades (planks) and plates stay solid. */
  sync(): boolean {
    const p = this.panel;
    if (p.version === this.version) return false;
    this.version = p.version;
    this.mesh.visible = p.intact > 0;
    if (!p.intact) return true;
    const geo = panelGeometry(p, this.look, (u, y, off, n) => {
      const w = panelPoint(p, u, y, off), alongX = p.axis === 'x';
      return this.look?.light(Math.round((u - p.u0) / CELL), Math.round((y - p.y0) / CELL), n) ?? this.bake.light(w.x, w.y, w.z, alongX ? 0 : n, 0, alongX ? n : 0);
    });
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo.geometry;
    const look = this.look, planks = look?.planks ?? this.mats.planks, plate = p.reinforced, wood = p.kind !== 'wall';
    this.mesh.material = [plate ? this.mats.plate : wood ? planks : look ? look.wall : this.mats.wall, wood ? planks : look ? look.wall : this.mats.core, planks];
    return true;
  }
  dispose() { this.mesh.geometry.dispose(); }
}
