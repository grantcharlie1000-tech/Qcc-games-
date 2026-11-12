/** A room's light and identity on top of its bake (map-fill second round): soft contact shadows where furniture meets
 * the floor, a pool of light under each ceiling fitting fading between them, darker ceiling-wall and floor-wall
 * junctions, and per-room wall tones (the tones themselves are applied where the room's surfaces are built, from
 * ROOM_LOOK). All of it is a few transparent quads per room; nothing changes the bake or collision. */
import * as THREE from 'three';
import { CELL, WALL_H } from '../config';
import { MAP } from '../map';
import { FIXTURES } from './fixtures';
import type { Region } from './levelgeo';
import { SET_PIECES } from './setpieces-data';

type RGB = readonly [number, number, number];
/** Each room's identity: its wall tone, its dado (height and tone), the colour of its light, how dark its corners go. */
export const ROOM_LOOK: Record<string, { wall: RGB; band?: { height: number; tint: RGB }; rail?: RGB; tiles?: readonly [number, number]; light: RGB; pool?: number; corners: number; wear: RGB; wearOpacity: number; scuffs?: boolean; tape?: boolean; accent?: { axis: 'x' | 'z'; at: number; tint: RGB }; stains?: number }> = {
  office: { wall: [1.04, 0.98, 0.88], band: { height: 1.0, tint: [0.5, 0.36, 0.25] }, rail: [0.32, 0.22, 0.15], light: [1.0, 0.86, 0.66], corners: 0.42, wear: [0.16, 0.13, 0.1], wearOpacity: 0.3 },
  corridor: { wall: [1, 1, 1], light: [1.0, 0.95, 0.88], corners: 0.4, wear: [0.15, 0.14, 0.12], wearOpacity: 0.32 },
  lobby: { wall: [1.02, 0.99, 0.94], band: { height: 1.2, tint: [0.76, 0.69, 0.6] }, rail: [0.5, 0.46, 0.4], tiles: [0.6, 0.4], light: [1.0, 0.9, 0.75], pool: 0.35, corners: 0.4, wear: [0.16, 0.14, 0.12], wearOpacity: 0.28 },
  server: { wall: [0.36, 0.38, 0.42], band: { height: 1.0, tint: [0.7, 0.72, 0.76] }, rail: [0.3, 0.32, 0.35], light: [0.72, 0.86, 1.0], pool: 0.42, corners: 0.5, wear: [0.12, 0.12, 0.13], wearOpacity: 0.22, scuffs: false },
  archive: { wall: [0.9, 0.98, 0.88], band: { height: 1.0, tint: [0.62, 0.72, 0.6] }, rail: [0.4, 0.28, 0.18], light: [1.0, 0.92, 0.8], corners: 0.44, wear: [0.15, 0.14, 0.11], wearOpacity: 0.26 },
  break: { wall: [1.04, 1.0, 0.94], accent: { axis: 'x', at: 15, tint: [0.42, 0.78, 0.8] }, light: [1.02, 0.94, 0.84], pool: 0.35, corners: 0.4, wear: [0.15, 0.13, 0.11], wearOpacity: 0.26 },
  garage: { wall: [0.9, 0.9, 0.88], band: { height: 3.5, tint: [1, 1, 1] }, tiles: [0.44, 0.215], light: [0.95, 0.98, 1.0], corners: 0.5, wear: [0.13, 0.13, 0.12], wearOpacity: 0.3, scuffs: false, stains: 12 },
  lab: { wall: [1.18, 1.23, 1.28], band: { height: 1.5, tint: [1.3, 1.34, 1.38] }, rail: [1.2, 1.22, 1.25], tiles: [0.15, 0.15], light: [0.82, 0.92, 1.0], pool: 0.5, corners: 0.36, wear: [0.2, 0.2, 0.19], wearOpacity: 0.22, scuffs: false, tape: true },
};

let radial: THREE.CanvasTexture | null = null, ramp: THREE.CanvasTexture | null = null;
/** A soft round spot, opaque at the centre and clear at the edge. */
function radialTex() {
  if (radial) return radial;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (radial = new THREE.CanvasTexture(c));
}
/** A ramp from opaque (v = 0) to clear (v = 1). */
function rampTex() {
  if (ramp) return ramp;
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const g = c.getContext('2d')!, gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  return (ramp = new THREE.CanvasTexture(c));
}

let wearTex: THREE.CanvasTexture | null = null, stripeTex: THREE.CanvasTexture | null = null;
/** A worn path: a soft-edged band (across u) mottled along it (v), so the wear is uneven. */
function wearMap() {
  if (wearTex) return wearTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d')!;
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) {
    const e = Math.sin(Math.PI * (x + 0.5) / 64) ** 1.6, n = 0.7 + 0.3 * Math.sin(y * 0.11 + Math.sin(x * 0.2) * 2) * Math.sin(y * 0.037 + 1.3) + (rnd() - 0.5) * 0.25;
    g.fillStyle = `rgba(255,255,255,${Math.max(0, Math.min(1, e * n)).toFixed(3)})`; g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping;
  return (wearTex = t);
}
/** Yellow and black diagonal hazard stripes, repeating along u. */
function stripeMap() {
  if (stripeTex) return stripeTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d9b21c'; g.fillRect(0, 0, 64, 16); g.fillStyle = '#16161a';
  for (let k = -1; k < 5; k++) { g.beginPath(); g.moveTo(k * 16, 16); g.lineTo(k * 16 + 8, 16); g.lineTo(k * 16 + 24, 0); g.lineTo(k * 16 + 16, 0); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return (stripeTex = t);
}

/** Quads collected for one material: corner positions and uvs. */
class Quads {
  pos: number[] = []; uv: number[] = []; idx: number[] = [];
  /** A quad from four corners (in order round it) with uvs (0,0), (1,0), (1,1), (0,1). */
  add(a: number[], b: number[], c: number[], d: number[]) {
    const n = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d); this.uv.push(0, 0, 1, 0, 1, 1, 0, 1); this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  floor(x0: number, z0: number, x1: number, z1: number, y: number) { this.add([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]); }
  /** A floor strip from (ax, az) to (bx, bz), `w` wide; uv u across it, v along it in metres / `per`. */
  strip(ax: number, az: number, bx: number, bz: number, w: number, y: number, per = 4, alongU = false) {
    const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L * w / 2, nz = (bx - ax) / L * w / 2, n = this.pos.length / 3, v = L / per;
    this.pos.push(ax - nx, y, az - nz, ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz);
    this.uv.push(...(alongU ? [0, 0, 0, 1, v, 1, v, 0] : [0, 0, 1, 0, 1, v, 0, v]));
    // Face up whichever way the strip runs.
    this.idx.push(...((bx - ax) * nz - (bz - az) * nx > 0 ? [n, n + 2, n + 1, n, n + 3, n + 2] : [n, n + 1, n + 2, n, n + 2, n + 3]));
  }
  mesh(mat: THREE.Material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setIndex(this.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; m.renderOrder = 2;
    return m;
  }
}

export interface WallRunLike { n: readonly number[]; alongX: boolean; c: number; a0: number; a1: number }

/** The ambience meshes for one art room. `runs` are its solid wall runs (render/labdress.ts wallRuns). */
export function roomAmbience(region: Region, runs: readonly WallRunLike[]): { meshes: THREE.Mesh[]; dispose(): void } {
  const look = ROOM_LOOK[region.name];
  if (!look) return { meshes: [], dispose() {} };
  const inside = (x: number, z: number) => x > region.x0 && x < region.x1 && z > region.z0 && z < region.z1;
  const shadows = new Quads(), pools = new Quads(), edges = new Quads(), wear = new Quads(), tape = new Quads();
  // Floor wear: a worn path from each doorway to the room's middle, and scuffing where chairs are pulled in and out
  // at the desks. The Lab's doorways are marked off with hazard stripes.
  const cx = (region.x0 + region.x1) / 2, cz = (region.z0 + region.z1) / 2;
  const doors = MAP.panels.filter(p => p.kind === 'door').map(p => {
    const m = p.u0 + p.cols * CELL / 2;
    return p.axis === 'x' ? { x: m, z: p.pos, alongX: true, w: p.cols * CELL } : { x: p.pos, z: m, alongX: false, w: p.cols * CELL };
  }).filter(d => d.x > region.x0 - 0.3 && d.x < region.x1 + 0.3 && d.z > region.z0 - 0.3 && d.z < region.z1 + 0.3);
  for (const d of doors) {
    // Into the room from the doorway, then across to the middle.
    const ix = d.alongX ? d.x : d.x + Math.sign(cx - d.x) * 1.4, iz = d.alongX ? d.z + Math.sign(cz - d.z) * 1.4 : d.z;
    const ox = d.alongX ? d.x : d.x + Math.sign(cx - d.x) * 0.1, oz = d.alongX ? d.z + Math.sign(cz - d.z) * 0.1 : d.z;
    wear.strip(ox, oz, ix, iz, d.w * 0.8, 0.021);
    if (Math.hypot(cx - ix, cz - iz) > 0.5) wear.strip(ix, iz, cx, cz, 1.0, 0.0215, 4);
    if (look.tape) {
      const s = 0.07, px = d.alongX ? d.w / 2 + 0.05 : 0, pz = d.alongX ? 0 : d.w / 2 + 0.05;
      const ex = d.alongX ? 0 : Math.sign(cx - d.x) * 1.0, ez = d.alongX ? Math.sign(cz - d.z) * 1.0 : 0, bx = d.alongX ? 0 : Math.sign(cx - d.x) * 0.15, bz = d.alongX ? Math.sign(cz - d.z) * 0.15 : 0;
      tape.strip(d.x - px + bx, d.z - pz + bz, d.x + px + bx, d.z + pz + bz, s, 0.023, 0.35, true);
      tape.strip(d.x - px + bx + ex, d.z - pz + bz + ez, d.x + px + bx + ex, d.z + pz + bz + ez, s, 0.023, 0.35, true);
      tape.strip(d.x - px + bx, d.z - pz + bz, d.x - px + bx + ex, d.z - pz + bz + ez, s, 0.023, 0.35, true);
      tape.strip(d.x + px + bx, d.z + pz + bz, d.x + px + bx + ex, d.z + pz + bz + ez, s, 0.023, 0.35, true);
    }
  }
  // Contact shadows under furniture and set pieces standing on the floor: a soft dark spot a little wider than the
  // footprint.
  const feet = MAP.boxes.filter(b => b.solid && b.y0 < 0.05 && b.y1 > 0.3 && b.y1 < WALL_H - 0.2 && inside((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2));
  for (const b of [...feet, ...SET_PIECES.filter(p => inside((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2))]) {
    const g = 0.3;
    shadows.floor(b.x0 - g, b.z0 - g, b.x1 + g, b.z1 + g, 0.024);
  }
  // Desks (furniture at desk height): a scuffed patch on each long side, where the chair goes.
  for (const b of feet) {
    if (b.y1 < 0.65 || b.y1 > 0.85 || look.scuffs === false) continue;
    const ax = b.x1 - b.x0 >= b.z1 - b.z0, m = ax ? (b.x0 + b.x1) / 2 : (b.z0 + b.z1) / 2, len = Math.min(1.2, (ax ? b.x1 - b.x0 : b.z1 - b.z0) * 0.6);
    for (const [e, o] of ax ? [[b.z0, -1], [b.z1, 1]] as const : [[b.x0, -1], [b.x1, 1]] as const) {
      const c = e + o * 0.45;
      if (ax) { if (inside(m, c)) wear.strip(m - len / 2, c, m + len / 2, c, 0.85, 0.0218, 2); }
      else if (inside(c, m)) wear.strip(c, m - len / 2, c, m + len / 2, 0.85, 0.0218, 2);
    }
  }
  // Oil and water stains on a concrete floor: dark soft blotches, seeded so every client draws the same.
  const stains = new Quads();
  let seed = Math.abs(Math.round(region.x0 * 31 + region.z0 * 17)) | 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < (look.stains ?? 0); k++) {
    const x = region.x0 + 0.8 + rnd() * (region.x1 - region.x0 - 1.6), z = region.z0 + 0.8 + rnd() * (region.z1 - region.z0 - 1.6), r = 0.3 + rnd() * 0.7, e = 0.6 + rnd() * 0.8;
    stains.floor(x - r * e, z - r / e, x + r * e, z + r / e, 0.0205);
  }
  // A pool of light under each ceiling fitting.
  for (const f of FIXTURES[region.name] ?? []) {
    if (f.y !== undefined || !inside(f.x, f.z)) continue;
    pools.floor(f.x - 1.6, f.z - 1.3, f.x + 1.6, f.z + 1.3, 0.026);
  }
  // Ceiling-wall and floor-wall junctions on the solid walls: a dark ramp down from the ceiling and up from the floor.
  for (const w of runs) {
    const s = w.alongX ? w.n[2] : w.n[0], c = w.c + s * 0.004;
    const P = (u: number, y: number) => (w.alongX ? [u, y, c] : [c, y, u]);
    const flip = (w.alongX ? s < 0 : s > 0);
    const quad = (y0: number, y1: number, top: boolean) => {
      const a = P(w.a0 - 0.1, y0), b = P(w.a1 + 0.1, y0), cc = P(w.a1 + 0.1, y1), d = P(w.a0 - 0.1, y1);
      // uv v = 0 at the junction (opaque), 1 away from it.
      const n = edges.pos.length / 3;
      edges.pos.push(...a, ...b, ...cc, ...d); edges.uv.push(0, top ? 1 : 0, 1, top ? 1 : 0, 1, top ? 0 : 1, 0, top ? 0 : 1);
      edges.idx.push(...(flip ? [n, n + 2, n + 1, n, n + 3, n + 2] : [n, n + 1, n + 2, n, n + 2, n + 3]));
    };
    quad(WALL_H - 0.55, WALL_H - 0.002, true);
    quad(0.002, 0.3, false);
  }
  const radialMap = radialTex(), rampMap = rampTex();
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: radialMap, transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const poolMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...look.light).multiplyScalar(look.pool ?? 0.3), map: radialMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: rampMap, transparent: true, opacity: look.corners, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const wearMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...look.wear), map: wearMap(), transparent: true, opacity: look.wearOpacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const tapeMat = new THREE.MeshBasicMaterial({ map: stripeMap(), color: 0x8a8a8a, depthWrite: false, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const stainMat = new THREE.MeshBasicMaterial({ color: 0x0b0a08, map: radialMap, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const meshes = [stains.mesh(stainMat), wear.mesh(wearMat), tape.mesh(tapeMat), shadows.mesh(shadowMat), pools.mesh(poolMat), edges.mesh(edgeMat)].filter(m => (m.geometry.index?.count ?? 0) > 0);
  return { meshes, dispose() { for (const m of meshes) m.geometry.dispose(); shadowMat.dispose(); poolMat.dispose(); edgeMat.dispose(); wearMat.dispose(); tapeMat.dispose(); stainMat.dispose(); } };
}
