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
  if (plate) return reinforcement();
  // A cell on a hole's rim is drawn on its own, with a ragged outline; the rest of the wall is drawn in runs.
  const open = (c: number, r: number) => c >= 0 && r >= 0 && c < p.cols && r < p.rows && !cell(c, r);
  const rim = (c: number, r: number) => cell(c, r) && (open(c - 1, r) || open(c + 1, r) || open(c, r - 1) || open(c, r + 1));
  // Front and back: runs of intact cells along each row become one quad each (split every half metre, so rows share
  // their lit columns).
  for (let r = 0; r < p.rows; r++) {
    let start = -1;
    for (let c = 0; c <= p.cols; c++) {
      const on = c < p.cols && cell(c, r) && !rim(c, r);
      if (on) { if (start < 0) { start = c; continue; } if (c % 2 !== 0) continue; }
      if (start < 0) continue;
      const u0 = p.u0 + start * CELL, u1 = p.u0 + c * CELL, y0 = p.y0 + r * CELL, y1 = y0 + CELL;
      for (const n of [1, -1]) quad(face, vert(u0, y0, half * n, n, 1), vert(u1, y0, half * n, n, 1), vert(u1, y1, half * n, n, 1), vert(u0, y1, half * n, n, 1), alongX ? n < 0 : n > 0);
      start = on ? c : -1;
    }
  }
  // Rim cells: each skin tears in its own ragged outline. Along every side that faces a hole the break is cut into
  // short segments that bite back into the board by 1-5 cm (now and then a bigger chunk, or a tongue left hanging a
  // little into the hole), so shot board reads as crumbled, not cut. The board's layers show along the break (face
  // paper, white gypsum core, brown back paper), paint and paper peel back from it, the odd flap of paper curls out,
  // and the back of the board shows brown in the cavity.
  const SEG = 6, MARGIN = 0.03;
  const corner = (cu: number, cy: number, sk: number): [number, number] => { const [ju, jy] = jitter(cu, cy, sk); return [p.u0 + cu * CELL + ju, p.y0 + cy * CELL + jy]; };
  for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
    if (!rim(c, r)) continue;
    const mu = p.u0 + (c + 0.5) * CELL, my = p.y0 + (r + 0.5) * CELL;
    for (const sk of [1, -1]) {
      // Sides in order round the cell (counter-clockwise in u, y): bottom, right, top, left, each with its inward axis.
      const k: [number, number][] = [corner(c, r, sk), corner(c + 1, r, sk), corner(c + 1, r + 1, sk), corner(c, r + 1, sk)];
      const sides: [boolean, number, number][] = [[open(c, r - 1), 0, 1], [open(c + 1, r), -1, 0], [open(c, r + 1), 0, -1], [open(c - 1, r), 1, 0]];
      const pts: [number, number][] = [], broke: boolean[] = [];
      sides.forEach(([isOpen, iu, iy], i) => {
        const [au, ay] = k[i], [bu, by] = k[(i + 1) % 4];
        pts.push([au, ay]); broke.push(isOpen);
        if (!isOpen) return;
        for (let j = 1; j < SEG; j++) {
          const t = j / SEG, bu0 = au + (bu - au) * t, by0 = ay + (by - ay) * t;
          const h = hash(bu0 * 31.7 + sk, by0 * 17.3, p.pos + sk * 5.1), h2 = hash(by0 * 13.1, bu0 * 7.9 + sk, p.pos);
          let d = 0.012 + 0.03 * h + (h2 > 0.86 ? 0.045 : 0) - (h2 < 0.08 ? 0.03 : 0);
          // Never past the cell's middle: the outline stays star-shaped about it.
          const lim = (iu ? iu * (mu - bu0) : iy * (my - by0)) - MARGIN;
          d = Math.min(d, lim);
          pts.push([bu0 + iu * d, by0 + iy * d]); broke.push(true);
        }
      });
      const n = sk, flip = alongX ? n < 0 : n > 0, off = sk * half;
      // The face: a fan about the cell's middle.
      const centre = vert(mu, my, off, n, 1, 0, 0, true), ring = pts.map(([u, y]) => vert(u, y, off, n, 1, 0, 0, true));
      for (let i = 0; i < ring.length; i++) { const a2 = ring[i], b2 = ring[(i + 1) % ring.length]; if (flip) face.push(centre, b2, a2); else face.push(centre, a2, b2); }
      // The back of this skin, in the cavity.
      const inner = sk * (half - SKIN), cb = vert(mu, my, inner, -n, CAVITY, 0, 0, true), back = pts.map(([u, y]) => vert(u, y, inner, -n, CAVITY, 0, 0, true));
      for (let i = 0; i < back.length; i++) { const a2 = back[i], b2 = back[(i + 1) % back.length]; if (flip) edge.push(cb, a2, b2); else edge.push(cb, b2, a2); }
      // Along the break: the layers, the peeled fringe and the odd paper flap.
      const out = sk * half, inn = sk * (half - SKIN), pa = sk * (half - PAPER), pb = sk * (half - SKIN + PAPER);
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        if (!broke[i]) continue;
        // A segment is broken when it starts on a broken side (its end may be the corner closing that side).
        const [ua, ya] = pts[i], [ub, yb] = pts[j], du = ub - ua, dy = yb - ya, l = Math.hypot(du, dy) || 1, nx = dy / l, ny = -du / l;
        for (const [o0, o1, shade] of [[out, pa, 0.9], [pa, pb, GYPSUM], [pb, inn, BACK_PAPER]] as const) {
          const v0 = vert(ua, ya, o0, 0, shade, nx, ny, true), v1 = vert(ub, yb, o0, 0, shade, nx, ny, true), v2 = vert(ub, yb, o1, 0, shade, nx, ny, true), v3 = vert(ua, ya, o1, 0, shade, nx, ny, true);
          edge.push(v0, v1, v2, v0, v2, v3, v0, v2, v1, v0, v3, v2);
        }
        const h = hash(ua * 11.3 + sk, ya * 5.7, p.pos), w = FRINGE * (0.5 + h), fo = sk * (half + 0.0006);
        const f0 = vert(ua, ya, fo, n, GYPSUM_FACE, 0, 0, true), f1 = vert(ub, yb, fo, n, GYPSUM_FACE, 0, 0, true);
        // The fringe's inner edge stays on the panel where a slanted segment meets its outer edge.
        const cu = (u: number) => Math.min(Math.max(u, p.u0), p.u0 + p.cols * CELL), cy = (y: number) => Math.min(Math.max(y, p.y0), p.y0 + p.rows * CELL);
        const f2 = vert(cu(ub - nx * w), cy(yb - ny * w), fo, n, TORN, 0, 0, true), f3 = vert(cu(ua - nx * w), cy(ya - ny * w), fo, n, TORN, 0, 0, true);
        edge.push(f0, f1, f2, f0, f2, f3, f0, f2, f1, f0, f3, f2);
        if (h > 0.82) {
          // A flap of face paper torn loose, curling out of the board and over the hole.
          const mu2 = (ua + ub) / 2 + nx * 0.025, my2 = (ya + yb) / 2 + ny * 0.025, tip = vert(mu2, my2, sk * (half + 0.018), n, [1.02, 1.0, 0.95], 0, 0, true);
          const e0 = vert(ua, ya, sk * (half + 0.001), n, [1.02, 1.0, 0.95], 0, 0, true), e1 = vert(ub, yb, sk * (half + 0.001), n, [1.02, 1.0, 0.95], 0, 0, true);
          edge.push(e0, e1, tip, e0, tip, e1);
        }
      }
    }
  }
  if (!plate) {
    // Broken edges along straight runs (cells that are not on a rim never face a hole, so only the panel's outer
    // rim could; plasterboard runs to the frame there, so nothing is drawn).
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
    const GAP = 0.022, T = 0.032;
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
    // Two battens behind the boards, near each jamb: what the boards are nailed to. Drawn cell by cell, only where
    // that cell still stands, so a batten never hangs across a gap.
    const BAT: RGB = [0.5, 0.42, 0.34];
    for (const bu of [p.u0 + 0.1, p.u0 + p.cols * CELL - 0.1]) {
      const c = Math.min(p.cols - 1, Math.floor((bu - p.u0) / CELL)), o0 = -0.024, o1 = -0.064, ua = bu - 0.025, ub = bu + 0.025;
      for (let r = 0; r < p.rows; r++) {
        if (!cell(c, r)) continue;
        const ya = p.y0 + r * CELL, yb = ya + CELL;
        for (const [o, n] of [[o1, -1]] as const) quad(edge, vert(ua, ya, o, n, BAT, 0, 0, true), vert(ub, ya, o, n, BAT, 0, 0, true), vert(ub, yb, o, n, BAT, 0, 0, true), vert(ua, yb, o, n, BAT, 0, 0, true), alongX ? n < 0 : n > 0);
        for (const [uu, nx] of [[ua, -1], [ub, 1]] as const) { const v = [vert(uu, ya, o0, 0, BAT, nx, 0, true), vert(uu, yb, o0, 0, BAT, nx, 0, true), vert(uu, yb, o1, 0, BAT, nx, 0, true), vert(uu, ya, o1, 0, BAT, nx, 0, true)]; edge.push(v[0], v[1], v[2], v[0], v[2], v[3], v[0], v[2], v[1], v[0], v[3], v[2]); }
      }
    }
    return finish();
  }
  /** A reinforcement: folded steel leaves about half a metre wide (a shallow zig-zag across the opening), three
   * stiffening rails with rivet heads, and anchor shoes biting into the floor and ceiling. Both faces alike. */
  function reinforcement() {
    const W = p.cols * CELL, leaves = Math.max(2, Math.round(W / 0.5)), lw = W / leaves, y0 = p.y0, y1 = p.y0 + p.rows * CELL, FOLD = 0.018;
    const PAINT: RGB = [1.75, 1.8, 1.9], RAIL: RGB = [1.15, 1.18, 1.24], STEEL: RGB = [0.9, 0.9, 0.92], RIVET: RGB = [2.3, 2.3, 2.3];
    const at = (u: number, y: number, off: number, n: number, sh: RGB, nx = 0, ny = 0) => {
      const w = panelPoint(p, u, y, off), l = light(u, y, off, n);
      pos.push(w.x, w.y, w.z); uv.push(u / tile[0], y / tile[1]); col.push(l[0] * sh[0], l[1] * sh[1], l[2] * sh[2]);
      if (n) { if (alongX) nor.push(0, 0, n); else nor.push(n, 0, 0); } else if (alongX) nor.push(nx, ny, 0); else nor.push(0, ny, nx);
      return pos.length / 3 - 1;
    };
    const box = (ua: number, ub: number, ya: number, yb: number, o0: number, o1: number, sh: RGB, n: number) => {
      // A small block standing on the face (front, top, bottom and ends; its back is against the plate).
      const flip = alongX ? n < 0 : n > 0;
      quad(edge, at(ua, ya, o1, n, sh), at(ub, ya, o1, n, sh), at(ub, yb, o1, n, sh), at(ua, yb, o1, n, sh), flip);
      for (const [a, b, ny, yy] of [[ua, ub, 1, yb], [ua, ub, -1, ya]] as const) { const v = [at(a, yy, o0, 0, sh, 0, ny), at(b, yy, o0, 0, sh, 0, ny), at(b, yy, o1, 0, sh, 0, ny), at(a, yy, o1, 0, sh, 0, ny)]; edge.push(v[0], v[1], v[2], v[0], v[2], v[3], v[0], v[2], v[1], v[0], v[3], v[2]); }
      for (const [uu, nx] of [[ua, -1], [ub, 1]] as const) { const v = [at(uu, ya, o0, 0, sh, nx, 0), at(uu, yb, o0, 0, sh, nx, 0), at(uu, yb, o1, 0, sh, nx, 0), at(uu, ya, o1, 0, sh, nx, 0)]; edge.push(v[0], v[1], v[2], v[0], v[2], v[3], v[0], v[2], v[1], v[0], v[3], v[2]); }
    };
    for (const n of [1, -1]) {
      const flip = alongX ? n < 0 : n > 0, base = n * half;
      // The leaves: each face runs from a fold line to the next, alternately standing out and set back.
      for (let i = 0; i < leaves; i++) {
        const ua = p.u0 + i * lw, ub = ua + lw, oa = base + n * (i % 2 ? FOLD : 0), ob = base + n * (i % 2 ? 0 : FOLD);
        const tone = 0.9 + 0.12 * hash(i, p.pos, n), sh: RGB = [PAINT[0] * tone, PAINT[1] * tone, PAINT[2] * tone];
        quad(face, at(ua, y0, oa, n, sh), at(ub, y0, ob, n, sh), at(ub, y1, ob, n, sh), at(ua, y1, oa, n, sh), flip);
      }
      // Rails across, standing proud of the folds, each with a row of rivet heads.
      for (const yc of [y0 + 0.22, (y0 + y1) / 2, y1 - 0.22]) {
        const o0 = base + n * FOLD, o1 = o0 + n * 0.028;
        box(p.u0 + 0.03, p.u0 + W - 0.03, yc - 0.045, yc + 0.045, o0, o1, RAIL, n);
        for (let i = 0; i <= leaves; i++) {
          const u = Math.min(Math.max(p.u0 + i * lw, p.u0 + 0.06), p.u0 + W - 0.06);
          for (const dy of [-0.025, 0.025]) box(u - 0.008, u + 0.008, yc + dy - 0.008, yc + dy + 0.008, o1, o1 + n * 0.006, RIVET, n);
        }
      }
      // Anchor shoes at the foot and head of every other fold line, as if fired into the floor and ceiling.
      for (let i = 1; i < leaves; i += 2) {
        const u = p.u0 + i * lw, o0 = base + n * FOLD, o1 = o0 + n * 0.06;
        box(u - 0.04, u + 0.04, y0, y0 + 0.07, o0, o1, STEEL, n);
        box(u - 0.04, u + 0.04, y1 - 0.07, y1, o0, o1, STEEL, n);
      }
    }
    return finish();
  }
  function board(c0: number, c1: number, r: number, yAt: (u: number, top: boolean) => number, depth: number, T: number, vo: number, uo: number, shade: RGB) {
    const ua = p.u0 + c0 * CELL, ub = p.u0 + c1 * CELL, brokeA = c0 > 0, brokeB = c1 < p.cols;
    // A snapped end breaks along the grain into splinter fingers: down the end, points alternate between a deep tear
    // back into the board (3-9 cm) and a finger left reaching out (up to 3 cm into the gap).
    const N = 9;
    const ends = (u: number, broke: boolean, dir: number, k: number): number[] => Array.from({ length: N }, (_, i) => {
      if (!broke) return u;
      const j = hash(u * 9.1 + i * 1.37, r * 1.7 + k, p.pos), f = hash(i * 3.3 + k, u * 4.1, r + p.pos);
      // Mostly a ragged tear of varying depth; about one point in three is a long splinter left reaching out.
      return f > 0.66 ? u + dir * (0.01 + 0.03 * j) : u - dir * (0.015 + 0.09 * j * j);
    });
    const ea = ends(ua, brokeA, -1, 0), eb = ends(ub, brokeB, 1, 1);
    const yk = (u: number, i: number) => { const t = i / (N - 1); return yAt(u, true) * (1 - t) + yAt(u, false) * t; };
    const pt = (u: number, y: number, off: number, n: number, sh: number | RGB, nx = 0, ny = 0, vEdge?: number) => {
      const w = panelPoint(p, u, y, off), l = light(u, y, off, n);
      const [sr, sg, sb] = typeof sh === 'number' ? [sh, sh, sh] : sh;
      pos.push(w.x, w.y, w.z); uv.push(u / tile[0] + uo, vEdge ?? ((y - p.y0 - r * CELL) / CELL * 0.065 + vo)); col.push(l[0] * sr, l[1] * sg, l[2] * sb);
      if (n) { if (alongX) nor.push(0, 0, n); else nor.push(n, 0, 0); } else if (alongX) nor.push(nx, ny, 0); else nor.push(0, ny, nx);
      return pos.length / 3 - 1;
    };
    const L = ea.map((u, i): [number, number] => [u, yk(u, i)]), R = eb.map((u, i): [number, number] => [u, yk(u, i)]);
    // Faces: a strip of quads from the top of the board to the bottom, between its two ends.
    for (const n of [1, -1]) {
      const off = depth + n * T / 2, sh: RGB = n > 0 ? shade : [shade[0] * 0.9, shade[1] * 0.9, shade[2] * 0.9], flip = alongX ? n < 0 : n > 0;
      const lv = L.map(([u, y]) => pt(u, y, off, n, sh)), rv = R.map(([u, y]) => pt(u, y, off, n, sh));
      for (let i = 0; i < N - 1; i++) quad(face, lv[i], rv[i], rv[i + 1], lv[i + 1], flip);
    }
    // Edges all round: the top, down the right end, the bottom, up the left end. Snapped ends show pale fresh wood.
    const outline: [number, number, boolean, boolean][] = [];
    outline.push([...L[0], false, false]);
    R.forEach(([u, y], i) => outline.push([u, y, i < N - 1, brokeB]));
    for (let i = N - 1; i >= 0; i--) outline.push([...L[i], i > 0, brokeA]);
    for (let i = 0; i < outline.length; i++) {
      const [u0, y0, isEnd, snapped] = outline[i], [u1, y1] = outline[(i + 1) % outline.length];
      const du = u1 - u0, dy = y1 - y0, l = Math.hypot(du, dy) || 1, nx = -dy / l, ny = du / l;
      const sh: RGB = snapped && isEnd ? [1.2, 1.08, 0.88] : isEnd ? [0.7, 0.62, 0.52] : [shade[0] * 0.55, shade[1] * 0.52, shade[2] * 0.5];
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
    this.mesh.material = plate ? [this.mats.plate, this.mats.plate, this.mats.plate] : [wood ? planks : look ? look.wall : this.mats.wall, wood ? planks : look ? look.wall : this.mats.core, planks];
    return true;
  }
  dispose() { this.mesh.geometry.dispose(); }
}
