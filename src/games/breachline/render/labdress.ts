/** The Lab's modelled dressing: bench cabinetry (doors, drawers, bar handles, kick plates, end panels), a sink with
 * a gooseneck tap, reagent bottles, wall sockets, a switch on conduit, skirting and a dado rail. Everything fits the
 * existing collision boxes or sits flat on a wall, so nothing new can be mistaken for cover. Lit by the lightmap of
 * the surface each piece stands on (render/detail.ts). */
import * as THREE from 'three';
import { WALL_H } from '../config';
import { MAP } from '../map';
import { DetailBuilder } from './detail';
import type { Atlas, Region } from './levelgeo';

type V3 = [number, number, number];
/** Materials the dressing asks for; artworld.ts maps each key to a material. */
export type DressKey = 'door' | 'locker' | 'exit' | 'alarm' | 'fire' | 'card' | 'label' | 'binder' | 'grid' | 'cork' | 'paper' | 'aid' | 'screen' | 'plastic' | 'sign' | 'clock' | 'handle' | 'kick' | 'trim' | 'socket' | 'conduit' | 'steel' | 'chrome' | 'amber' | 'glass';

const inRoom = (r: Region, x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

/** Dressing for any art room. */
export function dressRoom(atlas: Atlas, room: Region): DetailBuilder {
  if (room.name === 'corridor') return dressCorridor(atlas, room);
  if (room.name === 'archive') return dressArchive(atlas, room);
  return dressLab(atlas, room);
}

/** Deterministic random numbers for dressing layouts. */
const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

/** Steel shelving on a solid shelf box: uprights, shelf lips, and the fronts of archive boxes and box files standing
 * just proud of each long face. The collision box stays the volume; the dressing only reads as its contents. */
function shelving(D: DetailBuilder, x0: number, z0: number, x1: number, z1: number, top: number, seed: number) {
  const r = seeded(seed), alongZ = z1 - z0 > x1 - x0, len = alongZ ? z1 - z0 : x1 - x0;
  const levels = [0.08, 0.5, 0.92, 1.34, 1.76];
  for (const side of [1, -1]) {
    const face = alongZ ? (side > 0 ? x1 : x0) : (side > 0 ? z1 : z0), n: V3 = alongZ ? [side, 0, 0] : [0, 0, side];
    // A box on this face from (a..b along the run, y0..y1, d0..d1 out from the face).
    const put = (key: DressKey, a: number, b: number, y0: number, y1: number, d0: number, d1: number, tint?: V3) => {
      const o0 = face + side * d0, o1 = face + side * d1, lo = Math.min(o0, o1), hi = Math.max(o0, o1), mid = (a + b) / 2, at: V3 = alongZ ? [face + side * 0.001, (y0 + y1) / 2, mid] : [mid, (y0 + y1) / 2, face + side * 0.001];
      if (alongZ) D.box(key, lo, y0, a, hi, y1, b, at, n, tint); else D.box(key, a, y0, lo, b, y1, hi, at, n, tint);
    };
    const start = alongZ ? z0 : x0, bays = Math.max(1, Math.round(len / 0.9)), bw = len / bays;
    for (let i = 0; i <= bays; i++) { const u = start + i * bw; put('handle', u - 0.02, u + 0.02, 0, top, 0, 0.03, [0.45, 0.47, 0.5]); }
    for (const y of [...levels, top - 0.04]) put('handle', start, start + len, y, y + 0.03, 0, 0.028, [0.5, 0.52, 0.55]);
    for (let l = 0; l < levels.length; l++) {
      const y = levels[l] + 0.03, room = (levels[l + 1] ?? top - 0.04) - y - 0.04;
      for (let i = 0; i < bays; i++) {
        let u = start + i * bw + 0.03;
        const end = start + (i + 1) * bw - 0.03;
        while (u < end - 0.08) {
          const file = r() < 0.35, w = Math.min(end - u, file ? 0.06 + r() * 0.02 : 0.24 + r() * 0.14), h = Math.min(room, file ? 0.3 + r() * 0.04 : 0.24 + r() * 0.08);
          if (r() < 0.12) { u += w + 0.02; continue; }
          if (file) {
            const tone = [0.3 + r() * 0.5, 0.3 + r() * 0.3, 0.25 + r() * 0.35] as V3;
            put('binder', u, u + w - 0.004, y, y + h, 0.004, 0.012, tone);
            put('label', u + 0.012, u + w - 0.016, y + h * 0.55, y + h * 0.8, 0.012, 0.0135);
          } else {
            const shade = 0.75 + r() * 0.3;
            put('card', u, u + w - 0.006, y, y + h, 0.002, 0.014, [shade, shade * 0.97, shade * 0.92]);
            put('label', u + w * 0.3, u + w * 0.7, y + h * 0.58, y + h * 0.74, 0.014, 0.0155, [0.82, 0.8, 0.74]);
            put('kick', u + w * 0.43, u + w * 0.57, y + h * 0.22, y + h * 0.28, 0.014, 0.0152, [0.35, 0.3, 0.25]);
          }
          u += w + 0.004;
        }
      }
    }
  }
}

/** A bank of filing cabinets on one face of a steel box: drawer fronts, pull handles, label holders. */
function filing(D: DetailBuilder, face: number, n: V3, a0: number, a1: number, top: number) {
  const units = Math.max(1, Math.round((a1 - a0) / 0.47)), w = (a1 - a0) / units, drawers = Math.max(2, Math.round(top / 0.33)), dh = (top - 0.06) / drawers;
  const alongZ = n[0] !== 0, side = alongZ ? n[0] : n[2];
  const put = (key: DressKey, a: number, b: number, y0: number, y1: number, d0: number, d1: number, tint?: V3) => {
    const o0 = face + side * d0, o1 = face + side * d1, lo = Math.min(o0, o1), hi = Math.max(o0, o1), at: V3 = alongZ ? [face + side * 0.001, (y0 + y1) / 2, (a + b) / 2] : [(a + b) / 2, (y0 + y1) / 2, face + side * 0.001];
    if (alongZ) D.box(key, lo, y0, a, hi, y1, b, at, n, tint); else D.box(key, a, y0, lo, b, y1, hi, at, n, tint);
  };
  for (let i = 0; i < units; i++) {
    const a = a0 + i * w + 0.004, b = a0 + (i + 1) * w - 0.004, c = (a + b) / 2;
    for (let k = 0; k < drawers; k++) {
      const y0 = 0.05 + k * dh + 0.004, y1 = 0.05 + (k + 1) * dh - 0.004;
      put('locker', a, b, y0, y1, 0, 0.016);
      put('handle', c - 0.07, c + 0.07, y1 - 0.09, y1 - 0.07, 0.016, 0.04);
      put('label', c - 0.04, c + 0.04, y1 - 0.055, y1 - 0.025, 0.016, 0.019);
    }
  }
}

/** The Archive (site B): shelving runs, a bank of filing cabinets, the reading table, ceiling and wall kit. */
function dressArchive(atlas: Atlas, room: Region): DetailBuilder {
  const D = new DetailBuilder(atlas), y = WALL_H, up: V3 = [0, -1, 0];
  ceilingGrid(D, room);
  let seed = 11;
  for (const b of MAP.boxes) {
    if (!inRoom(room, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)) continue;
    if (b.mat === 'shelf') shelving(D, b.x0, b.z0, b.x1, b.z1, b.y1, seed += 7);
    // Filing cabinets face west, into the room.
    if (b.mat === 'steel') filing(D, b.x0, [-1, 0, 0], b.z0, b.z1, b.y1);
    if (b.mat === 'wood') {
      // The reading table: paper stacks, box files lying flat, an open archive box.
      const top = b.y1, r = seeded(5), on = (x: number, z: number): V3 => [x, top + 0.001, z], tu: V3 = [0, 1, 0];
      for (let i = 0; i < 5; i++) {
        const x = b.x0 + 0.2 + r() * (b.x1 - b.x0 - 0.5), z = b.z0 + 0.15 + r() * (b.z1 - b.z0 - 0.45), h = 0.005 + r() * 0.03;
        D.box('paper', x, top, z, x + 0.21, top + h, z + 0.3, on(x + 0.1, z + 0.15), tu, [0.5, 0.5, 0.47]);
      }
      D.box('binder', b.x1 - 0.5, top, b.z0 + 0.2, b.x1 - 0.18, top + 0.07, b.z0 + 0.48, on(b.x1 - 0.34, b.z0 + 0.34), tu, [0.2, 0.25, 0.45]);
      D.box('card', b.x0 + 0.25, top, b.z1 - 0.42, b.x0 + 0.62, top + 0.26, b.z1 - 0.12, on(b.x0 + 0.43, b.z1 - 0.27), tu, [0.9, 0.86, 0.78]);
    }
  }
  for (const [x, z] of [[2.4, 2.4], [6.6, 2.4], [2.4, 8.4], [6.6, 8.4], [4.2, 5.4]]) {
    const g = new THREE.CylinderGeometry(0.012, 0.03, 0.05, 10).translate(x, y - 0.025, z);
    D.mesh('chrome', g.attributes.position.array, g.attributes.normal.array, g.index!.array, [x, y - 0.001, z], up, [0.85, 0.8, 0.7]);
    g.dispose();
  }
  const det = new THREE.CylinderGeometry(0.06, 0.065, 0.035, 20).translate(4.5, y - 0.0175, 4.8);
  D.mesh('socket', det.attributes.position.array, det.attributes.normal.array, det.index!.array, [4.5, y - 0.001, 4.8], up);
  det.dispose();
  // The solid south wall: skirting, a clock, sockets, a records-room sign.
  const z = room.z1 - 0.15, n: V3 = [0, 0, -1], at = (x: number, yy: number): V3 => [x, yy, z - 0.001];
  D.box('trim', room.x0 + 0.12, 0.02, z - 0.016, room.x1 - 0.12, 0.11, z, at(4, 0.06), n);
  D.box('plastic', 6.3, 2.42, z - 0.04, 6.66, 2.78, z, at(6.48, 2.6), n);
  { const g = new THREE.PlaneGeometry(0.32, 0.32).rotateY(Math.PI).translate(6.48, 2.6, z - 0.041); D.mesh('clock', g.attributes.position.array, g.attributes.normal.array, g.index!.array, at(6.48, 2.6), n, [1, 1, 1], g.attributes.uv.array); g.dispose(); }
  for (const x of [1.2, 6.9]) D.box('socket', x - 0.073, 0.27, z - 0.01, x + 0.073, 0.356, z, at(x, 0.31), n);
  return D;
}

/** The corridor: ceiling grid and services, hanging exit signs, a cable tray on drop rods, the cabinet and lockers. */
function dressCorridor(atlas: Atlas, room: Region): DetailBuilder {
  const D = new DetailBuilder(atlas), y = WALL_H, up: V3 = [0, -1, 0];
  ceilingGrid(D, room);
  for (const b of MAP.boxes) {
    if (!inRoom(room, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)) continue;
    if (b.mat === 'counter') cabinetry(D, b.x0, b.z0, b.x1, b.z1, b.y1);
    // Lockers against the south wall face north, into the corridor.
    if (b.mat === 'steel') lockers(D, b.x0, b.x1, b.z0, b.y1, -1);
  }
  for (let x = -13.5; x <= 13.6; x += 3) {
    const g = new THREE.CylinderGeometry(0.012, 0.03, 0.05, 10).translate(x + 1.5, y - 0.025, -1.2);
    D.mesh('chrome', g.attributes.position.array, g.attributes.normal.array, g.index!.array, [x + 1.5, y - 0.001, -1.2], up, [0.85, 0.8, 0.7]);
    g.dispose();
  }
  for (const x of [-9, 0.3, 9]) {
    const det = new THREE.CylinderGeometry(0.06, 0.065, 0.035, 20).translate(x, y - 0.0175, 0.25);
    D.mesh('socket', det.attributes.position.array, det.attributes.normal.array, det.index!.array, [x, y - 0.001, 0.25], up);
    det.dispose();
  }
  // Cable tray along the south side, hung on drop rods every 1.5 m.
  const tz0 = 0.45, tz1 = 0.75, ty = 2.72;
  D.box('conduit', room.x0 + 0.2, ty, tz0, room.x1 - 0.2, ty + 0.01, tz1, [0, y - 0.001, 0.6], up);
  for (const z of [tz0, tz1 - 0.01]) D.box('conduit', room.x0 + 0.2, ty, z, room.x1 - 0.2, ty + 0.06, z + 0.01, [0, y - 0.001, 0.6], up);
  for (let x = room.x0 + 0.5; x < room.x1 - 0.3; x += 1.5) for (const z of [tz0 - 0.01, tz1]) D.box('conduit', x - 0.006, ty, z, x + 0.006, y, z + 0.012, [x, y - 0.001, 0.6], up);
  // On the posts (static, unlike the plasterboard between them): fire-alarm call points and extinguisher signs.
  const postFace = (x: number, wallZ: number, side: number) => wallZ + side * 0.11;
  const onPost = (key: DressKey, x: number, wallZ: number, side: number, y0: number, y1: number, w: number, d: number, tint?: V3) => {
    const z = postFace(x, wallZ, side), n: V3 = [0, 0, side];
    D.box(key, x - w / 2, y0, side > 0 ? z : z - d, x + w / 2, y1, side > 0 ? z + d : z, [x, (y0 + y1) / 2, z + side * 0.001], n, tint);
  };
  for (const [x, wallZ, side] of [[-9.5, -2, 1], [5.5, 1, -1], [8, -2, 1]] as const) {
    onPost('alarm', x, wallZ, side, 1.38, 1.47, 0.09, 0.045);
    onPost('paper', x, wallZ, side, 1.405, 1.445, 0.05, 0.047, [0.95, 0.95, 0.95]);
  }
  for (const [x, wallZ, side] of [[5.5, 1, -1]] as const) {
    const z = postFace(x, wallZ, side) + side * 0.004, g = new THREE.PlaneGeometry(0.16, 0.2).rotateY(side > 0 ? 0 : Math.PI).translate(x, 1.8, z);
    D.mesh('fire', g.attributes.position.array, g.attributes.normal.array, g.index!.array, [x, 1.8, postFace(x, wallZ, side) + side * 0.001], [0, 0, side], [1, 1, 1], g.attributes.uv.array);
    g.dispose();
  }
  // Exit signs hung across the corridor, readable from both ends.
  for (const x of [-12, 0.75, 12]) {
    D.box('plastic', x - 0.02, 2.62, -0.66, x + 0.02, 2.8, -0.34, [x, y - 0.001, -0.5], up);
    for (const z of [-0.6, -0.4]) D.box('conduit', x - 0.004, 2.8, z - 0.004, x + 0.004, y, z + 0.004, [x, y - 0.001, -0.5], up);
    for (const s of [1, -1]) {
      const g = new THREE.PlaneGeometry(0.3, 0.16).rotateY(s * Math.PI / 2).translate(x + s * 0.0205, 2.71, -0.5);
      D.mesh('exit', g.attributes.position.array, g.attributes.normal.array, g.index!.array, [x, y - 0.001, -0.5], up, [1, 1, 1], g.attributes.uv.array);
      g.dispose();
    }
  }
  return D;
}

function dressLab(atlas: Atlas, room: Region): DetailBuilder {
  const D = new DetailBuilder(atlas);
  for (const b of MAP.boxes) {
    if (b.mat !== 'counter' || !inRoom(room, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)) continue;
    cabinetry(D, b.x0, b.z0, b.x1, b.z1, b.y1);
  }
  // Lockers: the tall steel boxes along the north wall, doors facing into the room.
  for (const b of MAP.boxes) {
    if (b.mat !== 'steel' || !inRoom(room, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)) continue;
    lockers(D, b.x0, b.x1, b.z1, b.y1);
  }
  // A sink in the east bench, on the corridor side, with its tap at the bench's spine.
  sink(D, 2.45, -5.92, 0.95, -6.1);
  bottles(D, -1.9, -6.1, 0.95);
  walls(D, room);
  ceilingGrid(D, room);
  wallKit(D, room);
  ceilingKit(D);
  benchKit(D);
  return D;
}

/** Doors and drawers on both long sides, bar handles, a dark recessed-look kick plate, end panels. */
function cabinetry(D: DetailBuilder, x0: number, z0: number, x1: number, z1: number, top: number) {
  const carcass = top - 0.05, bays = Math.max(1, Math.round((x1 - x0) / 0.5)), w = (x1 - x0) / bays, T = 0.018, gap = 0.004;
  for (const side of [1, -1]) {
    const z = side > 0 ? z1 : z0, n: V3 = [0, 0, side], out = (d: number) => (side > 0 ? [z, z + d] : [z - d, z]) as [number, number];
    const on = (x: number, y: number): V3 => [x, y, z + side * 0.001];
    // Kick plate: dark band to the floor, barely proud, reads as a recess under the doors.
    { const [a, b] = out(0.003); D.box('kick', x0, 0.02, a, x1, 0.11, b, on((x0 + x1) / 2, 0.06), n); }
    for (let i = 0; i < bays; i++) {
      const bx = x0 + i * w, left = (i + (side > 0 ? 0 : 1)) % 2 === 0;
      // Door, then the drawer above it.
      const [a, b] = out(T);
      D.box('door', bx + gap, 0.12, a, bx + w - gap, 0.62, b, on(bx + w / 2, 0.37), n);
      D.box('door', bx + gap, 0.63 + gap, a, bx + w - gap, carcass - 0.01, b, on(bx + w / 2, 0.75), n, [0.94, 0.94, 0.94]);
      // Door handle: a vertical bar on two posts near the free edge. Drawer handle: a short horizontal bar.
      const hx = left ? bx + w - 0.06 : bx + 0.06, [pa, pb] = out(T + 0.026), [ba, bb] = out(T + 0.032);
      D.box('handle', hx - 0.005, 0.44, pa, hx + 0.005, 0.452, pb, on(hx, 0.45), n);
      D.box('handle', hx - 0.005, 0.548, pa, hx + 0.005, 0.56, pb, on(hx, 0.55), n);
      D.box('handle', hx - 0.006, 0.43, side > 0 ? z + T + 0.026 : z - T - 0.032, hx + 0.006, 0.57, side > 0 ? z + T + 0.032 : z - T - 0.026, on(hx, 0.5), n);
      const cx = bx + w / 2, cy = (0.63 + carcass) / 2, [qa, qb] = out(T + 0.026);
      for (const px of [cx - 0.06, cx + 0.06]) D.box('handle', px - 0.005, cy - 0.005, qa, px + 0.005, cy + 0.005, qb, on(px, cy), n);
      D.box('handle', cx - 0.075, cy - 0.006, side > 0 ? z + T + 0.026 : z - T - 0.032, cx + 0.075, cy + 0.006, side > 0 ? z + T + 0.032 : z - T - 0.026, on(cx, cy), n);
      void ba; void bb;
    }
  }
  // End panels, slightly proud and a shade darker.
  for (const side of [1, -1]) {
    const x = side > 0 ? x1 : x0, n: V3 = [side, 0, 0], a = side > 0 ? x : x - 0.015, b = side > 0 ? x + 0.015 : x;
    D.box('door', a, 0.1, z0 + 0.02, b, carcass - 0.005, z1 - 0.02, [x + side * 0.001, 0.5, (z0 + z1) / 2], n, [0.82, 0.82, 0.82]);
  }
}

/** A bank of lockers on the +Z face of a box: doors with louvres, a latch handle, a number plate, a dark plinth. */
function lockers(D: DetailBuilder, x0: number, x1: number, z: number, top: number, side = 1) {
  // `side` is the way the doors face along Z; depths are measured out from the face at z.
  const n: V3 = [0, 0, side], on = (x: number, y: number): V3 => [x, y, z + side * 0.001], count = Math.max(1, Math.round((x1 - x0) / 0.4)), w = (x1 - x0) / count;
  const zr = (d0: number, d1: number): [number, number] => (side > 0 ? [z + d0, z + d1] : [z - d1, z - d0]);
  const box = (key: DressKey, ax: number, ay: number, bx: number, by: number, d0: number, d1: number, at: V3, tint?: V3) => { const [za, zb] = zr(d0, d1); D.box(key, ax, ay, za, bx, by, zb, at, n, tint); };
  box('kick', x0, 0.02, x1, 0.1, 0, 0.004, on((x0 + x1) / 2, 0.06));
  for (let i = 0; i < count; i++) {
    const a = x0 + i * w + 0.004, b = x0 + (i + 1) * w - 0.004, cx = (a + b) / 2, hx = side > 0 ? b - 0.06 : a + 0.06;
    box('locker', a, 0.11, b, top - 0.04, 0, 0.014, on(cx, 1));
    // Louvres near the top and bottom: dark slots, each with a lip.
    for (const y0 of [top - 0.34, 0.24]) for (let k = 0; k < 4; k++) {
      const y = y0 + k * 0.03;
      box('kick', cx - 0.11, y, cx + 0.11, y + 0.012, 0.014, 0.0155, on(cx, y), [0.5, 0.5, 0.5]);
      box('locker', cx - 0.11, y + 0.012, cx + 0.11, y + 0.018, 0.014, 0.022, on(cx, y), [0.9, 0.9, 0.9]);
    }
    box('handle', hx - 0.0125, 0.95, hx + 0.0125, 1.13, 0.014, 0.034, on(hx, 1.04));
    box('socket', cx - 0.035, top - 0.48, cx + 0.035, top - 0.44, 0.014, 0.017, on(cx, top - 0.46));
  }
}

/** Steel rim, a darker basin, a gooseneck tap with two lever handles. */
function sink(D: DetailBuilder, x: number, z: number, top: number, tapZ: number) {
  const up: V3 = [0, 1, 0], on: V3 = [x, top + 0.001, z];
  D.box('steel', x - 0.25, top, z - 0.21, x + 0.25, top + 0.012, z + 0.21, on, up);
  D.box('steel', x - 0.21, top + 0.0005, z - 0.17, x + 0.21, top + 0.0125, z + 0.17, on, up, [0.32, 0.33, 0.35]);
  // Drain.
  D.box('chrome', x - 0.025, top + 0.0128, z - 0.025, x + 0.025, top + 0.0132, z + 0.025, on, up, [0.4, 0.4, 0.4]);
  // Tap: a tube up from the bench spine, over and down into the basin.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, top, tapZ), new THREE.Vector3(x, top + 0.22, tapZ), new THREE.Vector3(x, top + 0.33, tapZ + 0.06),
    new THREE.Vector3(x, top + 0.31, tapZ + 0.16), new THREE.Vector3(x, top + 0.24, tapZ + 0.2),
  ]);
  const tube = new THREE.TubeGeometry(curve, 28, 0.011, 10, false);
  D.mesh('chrome', tube.attributes.position.array, tube.attributes.normal.array, tube.index!.array, [x, top + 0.001, tapZ], up);
  tube.dispose();
  const body = new THREE.CylinderGeometry(0.022, 0.026, 0.07, 16).translate(x, top + 0.035, tapZ);
  D.mesh('chrome', body.attributes.position.array, body.attributes.normal.array, body.index!.array, [x, top + 0.001, tapZ], up);
  body.dispose();
  for (const s of [-1, 1]) D.box('chrome', x + s * 0.035 - 0.006, top + 0.06, tapZ - 0.006, x + s * 0.1, top + 0.072, tapZ + 0.006, [x, top + 0.001, tapZ], up);
}

/** Reagent bottles: turned profiles, amber and clear, with dark caps. */
function bottles(D: DetailBuilder, x: number, z: number, top: number) {
  const profile = (r: number, h: number) => [
    new THREE.Vector2(0, 0), new THREE.Vector2(r * 0.96, 0), new THREE.Vector2(r, 0.01), new THREE.Vector2(r, h * 0.7),
    new THREE.Vector2(r * 0.8, h * 0.8), new THREE.Vector2(r * 0.38, h * 0.88), new THREE.Vector2(r * 0.36, h), new THREE.Vector2(0, h),
  ];
  const set: [number, number, number, number, DressKey][] = [
    [0, 0, 0.045, 0.22, 'amber'], [0.11, 0.04, 0.038, 0.19, 'amber'], [0.21, -0.03, 0.05, 0.25, 'glass'], [-0.12, 0.05, 0.032, 0.16, 'glass'], [0.32, 0.06, 0.04, 0.2, 'amber'],
  ];
  for (const [dx, dz, r, h, key] of set) {
    const g = new THREE.LatheGeometry(profile(r, h), 18).translate(x + dx, top, z + dz);
    D.mesh(key, g.attributes.position.array, g.attributes.normal.array, g.index!.array, [x + dx, top + 0.001, z + dz], [0, 1, 0]);
    g.dispose();
    const cap = new THREE.CylinderGeometry(r * 0.4, r * 0.4, 0.025, 14).translate(x + dx, top + h + 0.012, z + dz);
    D.mesh('kick', cap.attributes.position.array, cap.attributes.normal.array, cap.index!.array, [x + dx, top + 0.001, z + dz], [0, 1, 0]);
    cap.dispose();
  }
}

const plane = (D: DetailBuilder, key: DressKey, cx: number, cy: number, z: number, w: number, h: number, on: V3) => {
  // A flat quad facing +Z with 0..1 UVs, for printed things (signs, the clock face).
  const g = new THREE.PlaneGeometry(w, h).translate(cx, cy, z);
  D.mesh(key, g.attributes.position.array, g.attributes.normal.array, g.index!.array, on, [0, 0, 1], [1, 1, 1], g.attributes.uv.array);
  g.dispose();
};

/** What a lab's solid wall carries: a noticeboard, a first-aid box, safety signs, a clock, a vent grille, cable tray. */
function wallKit(D: DetailBuilder, room: Region) {
  const z = room.z0 + 0.15, n: V3 = [0, 0, 1], on = (x: number, y: number): V3 => [x, y, z + 0.001];
  // Noticeboard east of the second window: aluminium frame, cork, pinned sheets.
  const bx0 = 2.68, bx1 = 3.78, by0 = 1.3, by1 = 2.05;
  D.box('handle', bx0, by0, z, bx1, by1, z + 0.02, on(3.2, 1.6), n);
  D.box('cork', bx0 + 0.025, by0 + 0.025, z, bx1 - 0.025, by1 - 0.025, z + 0.022, on(3.2, 1.6), n);
  let seed = 7;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 7; i++) {
    const w = 0.15 + r() * 0.08, h = 0.21 + r() * 0.06, x = bx0 + 0.08 + r() * (bx1 - bx0 - 0.16 - w), y = by0 + 0.06 + r() * (by1 - by0 - 0.12 - h);
    D.box('paper', x, y, z + 0.022, x + w, y + h, z + 0.0235, on(x + w / 2, y + h / 2), n, i % 3 === 0 ? [1, 0.95, 0.75] : [1, 1, 1]);
  }
  // First-aid box and an eye-protection sign by the west door; a clock high over the lockers.
  D.box('aid', -4.15, 1.35, z, -3.8, 1.7, z + 0.11, on(-3.97, 1.5), n);
  D.box('paper', -4.0, 1.5, z + 0.11, -3.94, 1.6, z + 0.112, on(-3.97, 1.5), n);
  D.box('paper', -4.02, 1.53, z + 0.11, -3.92, 1.57, z + 0.112, on(-3.97, 1.5), n);
  plane(D, 'sign', -4.95, 1.62, z + 0.004, 0.3, 0.4, on(-4.95, 1.6));
  D.box('plastic', -0.68, 2.52, z, -0.32, 2.88, z + 0.04, on(-0.5, 2.7), n);
  plane(D, 'clock', -0.5, 2.7, z + 0.041, 0.32, 0.32, on(-0.5, 2.7));
  // Vent grille high on the wall: frame and slats.
  D.box('grid', 3.0, 2.55, z, 3.5, 2.8, z + 0.03, on(3.25, 2.67), n);
  for (let k = 0; k < 6; k++) D.box('kick', 3.03, 2.575 + k * 0.035, z + 0.03, 3.47, 2.592 + k * 0.035, z + 0.034, on(3.25, 2.67), n, [0.4, 0.4, 0.4]);
  // Cable tray along the top of the wall, with a drop of conduit to the noticeboard socket.
  D.box('conduit', room.x0 + 0.15, 2.82, z, room.x1 - 0.15, 2.86, z + 0.12, on(-1, 2.84), n);
  D.box('conduit', room.x0 + 0.15, 2.86, z + 0.11, room.x1 - 0.15, 2.92, z + 0.12, on(-1, 2.84), n);
}

/** Ceiling services: sprinkler heads, a smoke detector, a supply diffuser filling one tile. */
function ceilingKit(D: DetailBuilder) {
  const y = WALL_H, up: V3 = [0, -1, 0];
  for (const [x, z] of [[-4.5, -8.7], [-1.5, -8.7], [1.5, -8.7], [-4.5, -3.3], [-1.5, -3.3], [1.5, -3.3], [3.3, -6.0]]) {
    const g = new THREE.CylinderGeometry(0.012, 0.03, 0.05, 10).translate(x, y - 0.025, z);
    D.mesh('chrome', g.attributes.position.array, g.attributes.normal.array, g.index!.array, [x, y - 0.001, z], up, [0.85, 0.8, 0.7]);
    g.dispose();
  }
  const det = new THREE.CylinderGeometry(0.06, 0.065, 0.035, 20).translate(-0.3, y - 0.0175, -6.3);
  D.mesh('socket', det.attributes.position.array, det.attributes.normal.array, det.index!.array, [-0.3, y - 0.001, -6.3], up);
  det.dispose();
  // Supply diffuser in the tile at x 0..0.6, z -9.0..-8.4: frame and three stepped cones as rings.
  const cx = 0.3, cz = -8.7;
  for (let k = 0; k < 4; k++) {
    const h = 0.28 - k * 0.07, d = 0.012 + k * 0.012;
    D.box('grid', cx - h, y - d, cz - h, cx + h, y - d + 0.012, cz - h + 0.02, [cx, y - 0.001, cz], up);
    D.box('grid', cx - h, y - d, cz + h - 0.02, cx + h, y - d + 0.012, cz + h, [cx, y - 0.001, cz], up);
    D.box('grid', cx - h, y - d, cz - h, cx - h + 0.02, y - d + 0.012, cz + h, [cx, y - 0.001, cz], up);
    D.box('grid', cx + h - 0.02, y - d, cz - h, cx + h, y - d + 0.012, cz + h, [cx, y - 0.001, cz], up);
  }
  D.box('kick', cx - 0.06, y - 0.06, cz - 0.06, cx + 0.06, y - 0.055, cz + 0.06, [cx, y - 0.001, cz], up, [0.3, 0.3, 0.3]);
}

/** Bench equipment in clusters, all low enough to keep sight lines over the benches. */
function benchKit(D: DetailBuilder) {
  const top = 0.95, up: V3 = [0, 1, 0], on = (x: number, z: number): V3 => [x, top + 0.001, z];
  // West bench, corridor side: a monitor on a stand with a keyboard, facing the room's south half.
  const mx = -2.75, mz = -5.95;
  D.box('kick', mx - 0.12, top, mz - 0.1, mx + 0.12, top + 0.012, mz + 0.06, on(mx, mz), up);
  D.box('kick', mx - 0.025, top + 0.012, mz - 0.06, mx + 0.025, top + 0.2, mz - 0.03, on(mx, mz), up);
  D.box('kick', mx - 0.27, top + 0.12, mz - 0.03, mx + 0.27, top + 0.45, mz - 0.005, on(mx, mz), up);
  D.box('screen', mx - 0.255, top + 0.135, mz - 0.005, mx + 0.255, top + 0.435, mz - 0.003, on(mx, mz), up);
  D.box('plastic', mx - 0.22, top, mz + 0.14, mx + 0.22, top + 0.022, mz + 0.29, on(mx, mz + 0.2), up);
  // Sample trays and a test-tube rack.
  for (const [x, z] of [[-1.55, -5.85], [-1.55, -6.3]]) {
    D.box('socket', x - 0.17, top, z - 0.12, x + 0.17, top + 0.04, z + 0.12, on(x, z), up, [0.62, 0.66, 0.68]);
    D.box('kick', x - 0.15, top + 0.005, z - 0.1, x + 0.15, top + 0.035, z + 0.1, on(x, z), up, [0.4, 0.42, 0.45]);
  }
  const rx = -2.2, rz = -6.35;
  D.box('plastic', rx - 0.16, top, rz - 0.05, rx + 0.16, top + 0.012, rz + 0.05, on(rx, rz), up);
  D.box('plastic', rx - 0.16, top + 0.08, rz - 0.05, rx + 0.16, top + 0.092, rz + 0.05, on(rx, rz), up);
  for (const s of [-1, 1]) D.box('plastic', rx + s * 0.155 - 0.006, top, rz - 0.05, rx + s * 0.155 + 0.006, top + 0.092, rz + 0.05, on(rx, rz), up);
  for (let i = 0; i < 6; i++) {
    const g = new THREE.CylinderGeometry(0.009, 0.009, 0.13, 8).translate(rx - 0.12 + i * 0.048, top + 0.075, rz);
    D.mesh(i % 2 ? 'amber' : 'glass', g.attributes.position.array, g.attributes.normal.array, g.index!.array, on(rx, rz), up);
    g.dispose();
  }
  // East bench: a benchtop centrifuge and a clipboard.
  const cx = 1.25, cz = -6.25;
  const body = new THREE.CylinderGeometry(0.17, 0.19, 0.2, 24).translate(cx, top + 0.1, cz);
  D.mesh('socket', body.attributes.position.array, body.attributes.normal.array, body.index!.array, on(cx, cz), up);
  body.dispose();
  const lid = new THREE.CylinderGeometry(0.15, 0.16, 0.03, 24).translate(cx, top + 0.215, cz);
  D.mesh('plastic', lid.attributes.position.array, lid.attributes.normal.array, lid.index!.array, on(cx, cz), up);
  lid.dispose();
  D.box('screen', cx - 0.05, top + 0.12, cz + 0.17, cx + 0.05, top + 0.16, cz + 0.185, on(cx, cz), up);
  D.box('kick', 0.55, top, -5.95, 0.78, top + 0.006, -5.63, on(0.66, -5.8), up, [0.5, 0.4, 0.3]);
  D.box('paper', 0.57, top + 0.006, -5.93, 0.76, top + 0.008, -5.67, on(0.66, -5.8), up);
  // (Services reach the sink from under the bench, inside the cabinetry: no pipes stand in the room.)
}

/** The suspended ceiling's T-bar grid at 600 mm, over the tile joints the ceiling texture draws. */
function ceilingGrid(D: DetailBuilder, room: Region) {
  const y = WALL_H, drop = 0.014, half = 0.012, n: V3 = [0, -1, 0];
  const on = (x: number, z: number): V3 => [x, y - 0.001, z];
  for (let x = Math.ceil(room.x0 / 0.6) * 0.6; x < room.x1 - 0.01; x += 0.6) if (x > room.x0 + 0.01) D.box('grid', x - half, y - drop, room.z0, x + half, y, room.z1, on(x, (room.z0 + room.z1) / 2), n);
  for (let z = Math.ceil(room.z0 / 0.6) * 0.6; z < room.z1 - 0.01; z += 0.6) if (z > room.z0 + 0.01) D.box('grid', room.x0, y - drop, z - half, room.x1, y, z + half, on((room.x0 + room.x1) / 2, z), n);
  // Wall angle trim where the grid meets the walls.
  for (const [x0, z0, x1, z1] of [[room.x0, room.z0, room.x1, room.z0 + 0.02], [room.x0, room.z1 - 0.02, room.x1, room.z1], [room.x0, room.z0, room.x0 + 0.02, room.z1], [room.x1 - 0.02, room.z0, room.x1, room.z1]]) {
    D.box('grid', x0, y - drop, z0, x1, y, z1, on((x0 + x1) / 2, (z0 + z1) / 2), n);
  }
}

/** On the solid north wall: skirting, a dado rail (broken at the window openings), sockets, a switch on conduit. */
function walls(D: DetailBuilder, room: Region) {
  const z = room.z0 + 0.15, n: V3 = [0, 0, 1], on = (x: number, y: number): V3 => [x, y, z + 0.001];
  const x0 = room.x0 + 0.12, x1 = room.x1 - 0.12;
  const windows = MAP.panels.filter(p => p.kind === 'window' && p.axis === 'x' && Math.abs(p.pos - room.z0) < 0.01).map(p => [p.u0, p.u0 + p.cols * 0.25]);
  D.box('trim', x0, 0.02, z, x1, 0.11, z + 0.016, on((x0 + x1) / 2, 0.06), n);
  let at = x0;
  for (const [a, b] of [...windows.filter(w => w[1] > x0 && w[0] < x1), [x1, x1]].sort((p, q) => p[0] - q[0])) {
    if (a - at > 0.05) D.box('trim', at, 1.03, z, a - 0.08, 1.07, z + 0.02, on((at + a) / 2, 1.05), n);
    at = b + 0.08;
  }
  for (const x of [-3.0, 2.9, 3.4]) {
    D.box('socket', x - 0.073, 0.27, z, x + 0.073, 0.356, z + 0.01, on(x, 0.31), n);
    for (const s of [-1, 1]) D.box('kick', x + s * 0.035 - 0.012, 0.3, z + 0.01, x + s * 0.035 + 0.012, 0.326, z + 0.0115, on(x, 0.31), n, [0.6, 0.6, 0.6]);
  }
  // A light switch beside the lockers, fed by surface conduit from the ceiling.
  const sx = room.x0 + 1.25;
  D.box('conduit', sx - 0.011, 1.27, z, sx + 0.011, WALL_H - 0.01, z + 0.022, on(sx, 2.1), n);
  D.box('socket', sx - 0.045, 1.15, z, sx + 0.045, 1.27, z + 0.045, on(sx, 1.2), n);
  D.box('kick', sx - 0.008, 1.19, z + 0.045, sx + 0.008, 1.225, z + 0.052, on(sx, 1.2), n, [0.7, 0.7, 0.7]);
}
