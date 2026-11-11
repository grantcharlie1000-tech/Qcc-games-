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
export interface PanelLook { light(c: number, r: number, side: number): RGB | null; wall: THREE.Material; tile: readonly [number, number] }

export class PanelView {
  readonly mesh: THREE.Mesh;
  private version = -1;
  constructor(readonly panel: Panel, private bake: Bake, private mats: PanelMaterials, private look: PanelLook | null = null) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), [mats.wall, mats.core]);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = true;
  }
  /** Rebuilds the mesh if the panel changed. Returns true when it did. */
  sync(): boolean {
    const p = this.panel;
    if (p.version === this.version) return false;
    this.version = p.version;
    this.mesh.visible = p.intact > 0;
    if (!p.intact) return true;
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], face: number[] = [], edge: number[] = [];
    const plate = p.reinforced, wood = p.kind !== 'wall', half = (plate ? 0.2 : wood ? 0.07 : PANEL_T) / 2;
    const look = this.look, tile = plate ? TILE.plate : wood ? TILE.planks : look ? look.tile : TILE.drywall, alongX = p.axis === 'x';
    const vert = (u: number, y: number, off: number, n: number, tu: number, tv: number, shade: number) => {
      const w = panelPoint(p, u, y, off);
      const l = look?.light(Math.round((u - p.u0) / CELL), Math.round((y - p.y0) / CELL), n) ?? this.bake.light(w.x, w.y, w.z, alongX ? 0 : n, 0, alongX ? n : 0);
      pos.push(w.x, w.y, w.z); uv.push(tu, tv); col.push(l[0] * shade, l[1] * shade, l[2] * shade);
      if (alongX) nor.push(0, n ? 0 : 1, n); else nor.push(n, n ? 0 : 1, 0);
      return pos.length / 3 - 1;
    };
    // Front and back: runs of intact cells along each row become one quad each.
    const quad = (list: number[], a: number, b: number, c: number, d: number, flip: boolean) => { if (flip) list.push(a, d, c, a, c, b); else list.push(a, b, c, a, c, d); };
    for (let r = 0; r < p.rows; r++) {
      let start = -1;
      for (let c = 0; c <= p.cols; c++) {
        const on = c < p.cols && (plate || p.cells[r * p.cols + c] === 1);
        // Runs also end every half metre, so every row shares the same columns of lit vertices.
        if (on) { if (start < 0) { start = c; continue; } if (c % 2 !== 0) continue; }
        if (start < 0) continue;
        const u0 = p.u0 + start * CELL, u1 = p.u0 + c * CELL, y0 = p.y0 + r * CELL, y1 = y0 + CELL;
        for (const n of [1, -1]) {
          const a = vert(u0, y0, half * n, n, u0 / tile[0], y0 / tile[1], 1), b = vert(u1, y0, half * n, n, u1 / tile[0], y0 / tile[1], 1);
          const cc = vert(u1, y1, half * n, n, u1 / tile[0], y1 / tile[1], 1), d = vert(u0, y1, half * n, n, u0 / tile[0], y1 / tile[1], 1);
          // Seen from its front, an along-X face runs left to right as u rises; an along-Z face as u falls.
          quad(face, a, b, cc, d, alongX ? n < 0 : n > 0);
        }
        start = on ? c : -1;
      }
    }
    // Broken edges: wherever an intact cell borders an open one, close the wall's thickness.
    if (!plate) {
      const at = (c: number, r: number) => c >= 0 && r >= 0 && c < p.cols && r < p.rows && p.cells[r * p.cols + c] === 1;
      const shade = wood ? 0.55 : 0.8;
      for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
        if (!p.cells[r * p.cols + c]) continue;
        const u0 = p.u0 + c * CELL, u1 = u0 + CELL, y0 = p.y0 + r * CELL, y1 = y0 + CELL;
        const strip = (ua: number, ya: number, ub: number, yb: number) => {
          const a = vert(ua, ya, -half, 0, 0, 0, shade), b = vert(ub, yb, -half, 0, 1, 0, shade), cc = vert(ub, yb, half, 0, 1, 0.4, shade), d = vert(ua, ya, half, 0, 0, 0.4, shade);
          edge.push(a, b, cc, a, cc, d, a, cc, b, a, d, cc);
        };
        if (c > 0 && !at(c - 1, r)) strip(u0, y0, u0, y1);
        if (c < p.cols - 1 && !at(c + 1, r)) strip(u1, y0, u1, y1);
        if (r > 0 && !at(c, r - 1)) strip(u0, y0, u1, y0);
        if (r < p.rows - 1 && !at(c, r + 1)) strip(u0, y1, u1, y1);
      }
    }
    const g = this.mesh.geometry;
    g.dispose();
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ng.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    ng.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    ng.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    ng.setIndex([...face, ...edge]);
    // An undamaged panel is a single draw call; broken edges add a second.
    ng.addGroup(0, face.length, 0);
    if (edge.length) ng.addGroup(face.length, edge.length, 1);
    ng.computeBoundingSphere();
    this.mesh.geometry = ng;
    this.mesh.material = [plate ? this.mats.plate : wood ? this.mats.planks : look ? look.wall : this.mats.wall, wood ? this.mats.planks : this.mats.core];
    return true;
  }
  dispose() { this.mesh.geometry.dispose(); }
}
