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
export type DressKey = 'door' | 'locker' | 'handle' | 'kick' | 'trim' | 'socket' | 'conduit' | 'steel' | 'chrome' | 'amber' | 'glass';

const inRoom = (r: Region, x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

export function dressLab(atlas: Atlas, room: Region): DetailBuilder {
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
function lockers(D: DetailBuilder, x0: number, x1: number, z: number, top: number) {
  const n: V3 = [0, 0, 1], on = (x: number, y: number): V3 => [x, y, z + 0.001], count = Math.max(1, Math.round((x1 - x0) / 0.4)), w = (x1 - x0) / count;
  D.box('kick', x0, 0.02, z, x1, 0.1, z + 0.004, on((x0 + x1) / 2, 0.06), n);
  for (let i = 0; i < count; i++) {
    const a = x0 + i * w + 0.004, b = x0 + (i + 1) * w - 0.004, cx = (a + b) / 2;
    D.box('locker', a, 0.11, z, b, top - 0.04, z + 0.014, on(cx, 1), n);
    // Louvres near the top and bottom: dark slots, each with a lip.
    for (const y0 of [top - 0.34, 0.24]) for (let k = 0; k < 4; k++) {
      const y = y0 + k * 0.03;
      D.box('kick', cx - 0.11, y, z + 0.014, cx + 0.11, y + 0.012, z + 0.0155, on(cx, y), n, [0.5, 0.5, 0.5]);
      D.box('locker', cx - 0.11, y + 0.012, z + 0.014, cx + 0.11, y + 0.018, z + 0.022, on(cx, y), n, [0.9, 0.9, 0.9]);
    }
    D.box('handle', b - 0.07, 0.95, z + 0.014, b - 0.045, 1.13, z + 0.034, on(b - 0.06, 1.04), n);
    D.box('socket', cx - 0.035, top - 0.48, z + 0.014, cx + 0.035, top - 0.44, z + 0.017, on(cx, top - 0.46), n);
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
