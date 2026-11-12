/** The Lab's modelled dressing: bench cabinetry (doors, drawers, bar handles, kick plates, end panels), a sink with
 * a gooseneck tap, reagent bottles, wall sockets, a switch on conduit, skirting and a dado rail. Everything fits the
 * existing collision boxes or sits flat on a wall, so nothing new can be mistaken for cover. Lit by the lightmap of
 * the surface each piece stands on (render/detail.ts). */
import { isSetPiece } from './setpieces-data';
import * as THREE from 'three';
import { WALL_H } from '../config';
import { MAP } from '../map';
import { DetailBuilder } from './detail';
import { ROOM_SIGNS } from './printed';
import { OUTDOOR, type Atlas, type Region } from './levelgeo';

type V3 = [number, number, number];
/** Materials the dressing asks for; artworld.ts maps each key to a material. */
export type DressKey = 'roomsign' | 'chassis' | 'led' | 'ledAmber' | 'bulb' | 'casing' | 'door' | 'locker' | 'exit' | 'alarm' | 'fire' | 'card' | 'label' | 'binder' | 'grid' | 'cork' | 'paper' | 'aid' | 'screen' | 'plastic' | 'sign' | 'clock' | 'handle' | 'kick' | 'trim' | 'socket' | 'conduit' | 'steel' | 'chrome' | 'amber' | 'glass';

const inRoom = (r: Region, x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

/** Dressing for any art room. */
export function dressRoom(atlas: Atlas, room: Region): DetailBuilder {
  if (room.name === 'corridor') return dressCorridor(atlas, room);
  if (room.name === 'archive') return dressArchive(atlas, room);
  if (OUTDOOR.has(room.name)) return dressYard(atlas, room);
  if (room.name === 'server') return dressServer(atlas, room);
  if (room.name === 'lobby') return dressLobby(atlas, room);
  if (room.name === 'office') return dressOffice(atlas, room);
  if (room.name === 'break') return dressBreak(atlas, room);
  if (room.name === 'garage') return dressGarage(atlas, room);
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
            // An archive box (drawn instanced): pulled forward by up to 6 cm, turned a touch, now and then tipped
            // against its neighbour; mostly cardboard, a few in faded office colours. One in twelve stands open,
            // with files sticking up out of it.
            const pull = r() * 0.06, depth = 0.035 + pull, mid = u + (w - 0.006) / 2, across = face + side * 0.002, shade = 0.85 + r() * 0.25, pick = r();
            const tint: V3 = pick < 0.75 ? [shade, shade * 0.96, shade * 0.9] : pick < 0.85 ? [0.75, 0.45, 0.42] : pick < 0.93 ? [0.55, 0.65, 0.55] : [0.6, 0.62, 0.7];
            const open = r() < 0.08, bh = open ? h * 0.72 : h;
            D.boxes.push({ x: alongZ ? across : mid, y, z: alongZ ? mid : across, yaw: (alongZ ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI)) + (r() - 0.5) * 0.12, tilt: r() < 0.05 ? (r() > 0.5 ? 1 : -1) * (0.08 + r() * 0.1) : 0, w: w - 0.006, h: bh, depth, tint, label: open ? -1 : Math.floor(r() * 4) });
            if (open) for (let f = 0; f < 4; f++) { const fu = u + 0.03 + f * (w - 0.06) / 4; put('binder', fu, fu + 0.012, y + bh - 0.02, y + bh + 0.04 + r() * 0.05, depth * 0.3, depth * 0.3 + 0.02, [0.85 - r() * 0.2, 0.82, 0.7]); }
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
    if (isSetPiece(b)) continue; // modelled in render/setpieces.ts, with its damage states
    if (!inRoom(room, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)) continue;
    if (b.mat === 'shelf') {
      shelving(D, b.x0, b.z0, b.x1, b.z1, b.y1, seed += 7);
      // A box left on the floor at the end of each run, full depth (it stands in the aisle, not in the shelving).
      const r = seeded(seed), alongZ = b.z1 - b.z0 > b.x1 - b.x0, end = r() > 0.5;
      const fx = alongZ ? (b.x0 + b.x1) / 2 + (r() - 0.5) * 0.2 : (end ? b.x1 + 0.3 : b.x0 - 0.3), fz = alongZ ? (end ? b.z1 + 0.3 : b.z0 - 0.3) : (b.z0 + b.z1) / 2;
      D.boxes.push({ x: fx, y: 0, z: fz - (alongZ ? 0 : 0), yaw: r() * 6.28, tilt: 0, w: 0.32, h: 0.26, depth: 0.4, tint: [0.95, 0.9, 0.82], label: Math.floor(r() * 4) });
    }
    // Filing cabinets face west, into the room.
    if (b.mat === 'steel') filing(D, b.x0, [-1, 0, 0], b.z0, b.z1, b.y1);
    if (b.mat === 'wood') {
      {
        // A desk lamp: a weighted base, a jointed arm and a green enamel shade over a warm bulb.
        const lx = 4.25, lz = 2.85, top = b.y1, on: V3 = [lx, top + 0.001, lz], tu: V3 = [0, 1, 0];
        const geo = (g: THREE.BufferGeometry, key: DressKey, tint?: V3) => { D.mesh(key, g.attributes.position.array, g.attributes.normal.array, g.index!.array, on, tu, tint ?? [1, 1, 1]); g.dispose(); };
        geo(new THREE.CylinderGeometry(0.07, 0.08, 0.025, 20).translate(lx + 0.12, top + 0.0125, lz + 0.02), 'plastic', [0.6, 0.6, 0.6]);
        geo(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 8).rotateZ(-0.35).translate(lx + 0.07, top + 0.16, lz + 0.02), 'chrome');
        geo(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 8).rotateZ(1.1).translate(lx - 0.0, top + 0.31, lz + 0.01), 'chrome');
        geo(new THREE.CylinderGeometry(0.03, 0.085, 0.12, 20, 1, true).translate(lx, top + 0.32, lz), 'aid');
        geo(new THREE.SphereGeometry(0.03, 12, 8).translate(lx, top + 0.31, lz), 'bulb');
      }
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
  // Boxes stacked on the floor beside the runs, a cable tray overhead along the lane, a rolling step.
  { const r = seeded(83);
    for (const [x, z, n2] of [[0.55, 8.6, 3], [6.55, 7.4, 2], [0.55, 4.6, 2]] as const) for (let k = 0; k < n2; k++)
      D.boxes.push({ x: x + (r() - 0.5) * 0.06, y: k * 0.26, z, yaw: (r() - 0.5) * 0.3, tilt: 0, w: 0.32, h: 0.26, depth: 0.4, tint: [0.95 - k * 0.04, 0.9, 0.82], label: Math.floor(r() * 4) });
    const ty = 2.7, up2: V3 = [0, -1, 0];
    D.box('conduit', 3.2, ty, 1.4, 3.5, ty + 0.01, 9.6, [3.35, WALL_H - 0.001, 5.5], up2);
    for (const xx of [3.2, 3.49]) D.box('conduit', xx, ty, 1.4, xx + 0.01, ty + 0.06, 9.6, [3.35, WALL_H - 0.001, 5.5], up2);
    for (let zz = 1.8; zz < 9.6; zz += 1.5) for (const xx of [3.19, 3.5]) D.box('conduit', xx, ty, zz, xx + 0.012, WALL_H, zz + 0.012, [3.35, WALL_H - 0.001, zz], up2);
    const fl: V3 = [7.4, 0.001, 3.6], up3: V3 = [0, 1, 0];
    for (const [yy, rr] of [[0.2, 0.2], [0.42, 0.17]] as const) { const g = new THREE.CylinderGeometry(rr, rr + 0.03, 0.03, 18).translate(7.4, yy, 3.6); D.mesh('steel', g.attributes.position.array, g.attributes.normal.array, g.index!.array, fl, up3, [0.6, 0.6, 0.62]); g.dispose(); }
    const body = new THREE.CylinderGeometry(0.17, 0.24, 0.42, 18, 1, true).translate(7.4, 0.21, 3.6); D.mesh('steel', body.attributes.position.array, body.attributes.normal.array, body.index!.array, fl, up3, [0.5, 0.5, 0.52]); body.dispose(); }
  return D;
}

/** The corridor: ceiling grid and services, hanging exit signs, a cable tray on drop rods, the cabinet and lockers. */
function dressCorridor(atlas: Atlas, room: Region): DetailBuilder {
  const D = new DetailBuilder(atlas), y = WALL_H, up: V3 = [0, -1, 0];
  ceilingGrid(D, room);
  for (const b of MAP.boxes) {
    if (isSetPiece(b)) continue; // modelled in render/setpieces.ts, with its damage states
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
  // Services overhead along the north side: two pipes (a lagged one and a bare copper one) on hangers every 2 m.
  for (const [pz, r, tint] of [[-1.62, 0.045, [0.85, 0.85, 0.82]], [-1.46, 0.018, [0.75, 0.45, 0.25]]] as const) {
    const g = new THREE.CylinderGeometry(r, r, room.x1 - room.x0 - 0.4, 10, 1, true).rotateZ(Math.PI / 2).translate(0, 2.78, pz);
    D.mesh('conduit', g.attributes.position.array, g.attributes.normal.array, g.index!.array, [0, y - 0.001, pz], up, [...tint] as V3);
    g.dispose();
  }
  for (let x = room.x0 + 0.6; x < room.x1 - 0.3; x += 2) {
    D.box('conduit', x - 0.006, 2.83, -1.68, x + 0.006, y, -1.67, [x, y - 0.001, -1.6], up, [0.5, 0.5, 0.5]);
    D.box('conduit', x - 0.015, 2.72, -1.7, x + 0.015, 2.735, -1.4, [x, y - 0.001, -1.6], up, [0.5, 0.5, 0.5]);
  }
  // Hanging room signs at every corridor doorway, printed on both faces so they read from either end.
  for (const [x, wallZ, side, k] of [[-10.25, -2, 1, 0], [-1.25, -2, 1, 1], [8.75, -2, 1, 2], [-8.75, 1, -1, 3], [-2.25, 1, -1, 4], [6.25, 1, -1, 5], [9.75, 1, -1, 6]] as const) {
    const zc = wallZ + side * 0.38, v0 = 1 - (k + 1) / ROOM_SIGNS.length, v1 = 1 - k / ROOM_SIGNS.length;
    D.box('kick', x - 0.012, 2.43, zc - 0.275, x + 0.012, 2.59, zc + 0.275, [x, y - 0.001, zc], up, [1.5, 1.5, 1.5]);
    for (const zz of [zc - 0.2, zc + 0.2]) D.box('chrome', x - 0.004, 2.59, zz - 0.004, x + 0.004, y, zz + 0.004, [x, y - 0.001, zc], up);
    for (const f of [1, -1]) {
      const g = new THREE.PlaneGeometry(0.52, 0.13).rotateY(f > 0 ? Math.PI / 2 : -Math.PI / 2).translate(x + f * 0.0125, 2.51, zc);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
      D.mesh('roomsign', g.attributes.position.array, g.attributes.normal.array, g.index!.array, [x, y - 0.001, zc], up, [1, 1, 1], uv.array);
      g.dispose();
    }
  }
  // On the solid headers above the panels (2.5 m up; the plasterboard below stays bare, it can be shot away):
  // white cable trunking along both sides, an emergency light over each doorway, and a clock.
  for (const [wallZ, side] of [[-2, 1], [1, -1]] as const) {
    const z = wallZ + side * 0.07, n: V3 = [0, 0, side], at = (x: number, yy: number): V3 => [x, yy, z + side * 0.001];
    D.box('casing', room.x0 + 0.3, 2.64, side > 0 ? z : z - 0.035, room.x1 - 0.3, 2.7, side > 0 ? z + 0.035 : z, at(0, 2.67), n, [0.95, 0.95, 0.93]);
  }
  for (const [x, wallZ, side] of [[-10.25, -2, 1], [-1.25, -2, 1], [8.75, -2, 1], [-8.75, 1, -1], [-2.25, 1, -1], [6.25, 1, -1], [9.75, 1, -1]] as const) {
    const z = wallZ + side * 0.07, n: V3 = [0, 0, side], at = (yy: number): V3 => [x, yy, z + side * 0.001];
    D.box('casing', x - 0.17, 2.3, side > 0 ? z : z - 0.07, x + 0.17, 2.4, side > 0 ? z + 0.07 : z, at(2.35), n, [0.96, 0.96, 0.94]);
    D.box('exit', x - 0.12, 2.31, side > 0 ? z + 0.07 : z - 0.072, x + 0.12, 2.39, side > 0 ? z + 0.072 : z - 0.07, at(2.35), n);
  }
  { const z = -2 + 0.07, n: V3 = [0, 0, 1]; D.box('plastic', 3.32, 2.57, z, 3.68, 2.93, z + 0.04, [3.5, 2.75, z + 0.001], n);
    const g = new THREE.PlaneGeometry(0.32, 0.32).translate(3.5, 2.75, z + 0.041); D.mesh('clock', g.attributes.position.array, g.attributes.normal.array, g.index!.array, [3.5, 2.75, z + 0.001], n, [1, 1, 1], g.attributes.uv.array); g.dispose(); }
  // Bins at the foot of three posts (small and open: dressing, not cover).
  for (const [x, z] of [[-6.18, -1.7], [4.18, -1.7], [0.18, 0.72]] as const) {
    const g = new THREE.CylinderGeometry(0.17, 0.14, 0.42, 16, 1, true).translate(x, 0.21, z);
    D.mesh('chassis', g.attributes.position.array, g.attributes.normal.array, g.index!.array, [x, 0.001, z], [0, 1, 0], [1.4, 1.5, 1.6]);
    g.dispose();
  }
  // A ceiling with a history: three water-stained tiles, and one tile pushed up and gone, its void dark and two cables
  // hanging out of it.
  for (const [x, z, k] of [[-5.7, 0.3, 0.8], [2.7, -1.5, 0.86], [11.1, 0.3, 0.76]] as const) D.box('card', x - 0.29, y - 0.004, z - 0.29, x + 0.29, y - 0.0015, z + 0.29, [x, y - 0.001, z], up, [k * 1.25, k * 1.1, k * 0.86]);
  D.box('kick', -10.79, y - 0.003, 0.01, -10.21, y - 0.0012, 0.59, [-10.5, y - 0.001, 0.3], up);
  for (const [dx, dz, len, tint] of [[0.08, 0.12, 0.42, [0.12, 0.12, 0.13]], [-0.1, -0.06, 0.3, [0.55, 0.12, 0.1]]] as const) {
    const pts = [new THREE.Vector3(-10.5 + dx, y + 0.02, 0.3 + dz), new THREE.Vector3(-10.5 + dx * 1.4, y - len * 0.5, 0.3 + dz * 1.3), new THREE.Vector3(-10.5 + dx * 0.6, y - len, 0.3 + dz * 0.4)];
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.006, 6, false);
    D.mesh('conduit', g.attributes.position.array, g.attributes.normal.array, g.index!.array, [-10.5, y - 0.001, 0.3], up, [...tint] as V3);
    g.dispose();
  }
  // Panel radiators in some bays: standing on the floor just off the wall (7 cm deep, too slim to read as cover),
  // with vertical convector fins, two feet and a valve.
  for (const [x, wallZ, side] of [[-7.75, -2, 1], [6, -2, 1], [-5, 1, -1], [11.6, 1, -1]] as const) {
    const back = wallZ + side * 0.1, front = back + side * 0.07, z0 = Math.min(back, front), z1 = Math.max(back, front), on: V3 = [x, 0.001, front + side * 0.2], fu: V3 = [0, 1, 0];
    D.box('socket', x - 0.4, 0.14, z0, x + 0.4, 0.68, z1, on, fu, [0.95, 0.94, 0.9]);
    for (let i = 0; i < 16; i++) { const fx = x - 0.38 + i * 0.05; D.box('socket', fx, 0.16, side > 0 ? z1 : z0 - 0.006, fx + 0.012, 0.66, side > 0 ? z1 + 0.006 : z0, on, fu, [0.82, 0.81, 0.78]); }
    for (const fx of [x - 0.32, x + 0.32]) D.box('steel', fx - 0.02, 0, z0 + 0.01, fx + 0.02, 0.14, z1 - 0.01, on, fu, [0.6, 0.6, 0.6]);
    D.box('chrome', x + 0.4, 0.12, z0 + 0.02, x + 0.45, 0.2, z1 - 0.02, on, fu);
  }
  // Every doorway gets a frame: painted casings on the posts either side and across the lintel, an aluminium
  // threshold strip, hinges left on one jamb (the doors are long gone) and a room plate beside it.
  for (const p of MAP.panels) {
    if (p.kind !== 'door' || p.axis !== 'x' || (p.pos !== -2 && p.pos !== 1)) continue;
    const side = p.pos === -2 ? 1 : -1, face = p.pos + side * 0.11, n: V3 = [0, 0, side], a = p.u0 + 0.11, b = p.u0 + p.cols * 0.25 - 0.11, top = 2.25;
    const proud = (key: DressKey, x0: number, x1: number, y0: number, y1: number, d: number, on: V3, tint?: V3) =>
      D.box(key, x0, y0, side > 0 ? face : face - d, x1, y1, side > 0 ? face + d : face, on, n, tint);
    proud('casing', a - 0.075, a, 0, top + 0.075, 0.018, [a - 0.05, 1, face + side * 0.001]);
    proud('casing', b, b + 0.075, 0, top + 0.075, 0.018, [b + 0.05, 1, face + side * 0.001]);
    proud('casing', a - 0.075, b + 0.075, top, top + 0.075, 0.018, [(a + b) / 2, top + 0.2, face + side * 0.001]);
    // A plinth block at the foot of each casing, where trolleys have chipped it.
    proud('trim', a - 0.08, a + 0.005, 0, 0.14, 0.024, [a - 0.05, 0.07, face + side * 0.001], [1.6, 1.6, 1.6]);
    proud('trim', b - 0.005, b + 0.08, 0, 0.14, 0.024, [b + 0.05, 0.07, face + side * 0.001], [1.6, 1.6, 1.6]);
    D.box('chrome', a, 0, Math.min(p.pos, p.pos + side * 0.12), b, 0.006, Math.max(p.pos, p.pos + side * 0.12), [(a + b) / 2, 0, p.pos + side * 0.3], [0, 1, 0], [0.7, 0.7, 0.68]);
    // Hinges on the jamb's inner face (the post's side towards the opening).
    for (const y of [0.25, 1.1, 2.0]) D.box('steel', a, y, p.pos - 0.03, a + 0.006, y + 0.1, p.pos + 0.03, [a + 0.001, y + 0.05, p.pos], [1, 0, 0]);
    // Room plate: a white plate with a dark band, at eye height on the far post.
    proud('label', b + 0.09, b + 0.2, 1.48, 1.6, 0.006, [b + 0.1, 1.5, face + side * 0.001], [1.05, 1.05, 1.02]);
    proud('kick', b + 0.1, b + 0.19, 1.52, 1.555, 0.0075, [b + 0.1, 1.5, face + side * 0.001]);
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

/** The yard: concrete kerbs round the grass, drain grates in the asphalt. All low enough never to read as cover. */
function dressYard(atlas: Atlas, room: Region): DetailBuilder {
  const D = new DetailBuilder(atlas), up: V3 = [0, 1, 0], K = 0.14, KW = 0.15;
  for (const f of MAP.floors) {
    if (f.mat !== 'grass' || !inRoom(room, (f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2)) continue;
    const kerb = (x0: number, z0: number, x1: number, z1: number) => D.box('socket', x0, 0, z0, x1, K, z1, [(x0 + x1) / 2, 0.02, (z0 + z1) / 2], up, [0.72, 0.71, 0.68]);
    if (f.z0 > room.z0 + 0.1) kerb(f.x0, f.z0 - KW, f.x1, f.z0);
    if (f.x0 > room.x0 + 0.1) kerb(f.x0 - KW, f.z0, f.x0, f.z1);
    if (f.x1 < room.x1 - 0.1) kerb(f.x1, f.z0, f.x1 + KW, f.z1);
  }
  // Drain grates: a dark frame and slats over a black pit.
  for (const [x, z] of [[-12, 12.6], [-2, 16.5], [6.5, 12.6], [14, 15.5], [20, 13], [-24, -6.2], [-19.8, 3.6], [-15, -12.6], [0.5, -19], [10.5, -12.6], [22, -19.5], [24.5, -4], [20.5, 8]] as const) {
    if (!inRoom(room, x, z)) continue;
    const on: V3 = [x, 0.03, z];
    D.box('kick', x - 0.3, 0.005, z - 0.3, x + 0.3, 0.012, z + 0.3, on, up);
    for (let i = 0; i < 9; i++) { const sx = x - 0.27 + i * 0.065; D.box('steel', sx, 0.012, z - 0.27, sx + 0.025, 0.02, z + 0.27, on, up, [0.45, 0.43, 0.4]); }
    for (const zz of [z - 0.3, z + 0.27]) D.box('steel', x - 0.3, 0.012, zz, x + 0.3, 0.022, zz + 0.03, on, up, [0.4, 0.38, 0.36]);
  }
  // Map-fill dressing (off the routes, no collision). Shared mesh helper, all on the ground's light.
  const mesh = (g: THREE.BufferGeometry, key: DressKey, x: number, z: number, tint: V3) => { if (inRoom(room, x, z)) D.mesh(key, g.attributes.position.array, g.attributes.normal.array, g.index!.array, [x, 0.02, z], up, tint); g.dispose(); };
  const B = MAP.bounds, H = MAP.building;
  // Lamp posts along the perimeter wall, every 12 m, arms reaching into the yard.
  for (const [ax, az, nx, nz, len] of [[B.x0 + 0.35, B.z0, 0, 1, B.z1 - B.z0], [B.x1 - 0.35, B.z0, 0, 1, B.z1 - B.z0], [B.x0, B.z0 + 0.35, 1, 0, B.x1 - B.x0], [B.x0, B.z1 - 0.35, 1, 0, B.x1 - B.x0]] as const) {
    const inward = nx ? (az < 0 ? 1 : -1) : (ax < 0 ? 1 : -1);
    for (let t = 6; t < len - 3; t += 12) {
      const x = ax + nx * t, z = az + nz * t, dx = nx ? 0 : inward * 0.9, dz = nx ? inward * 0.9 : 0;
      mesh(new THREE.CylinderGeometry(0.05, 0.075, 5, 10).translate(x, 2.5, z), 'steel', x, z, [0.5, 0.52, 0.5]);
      const arm = new THREE.CylinderGeometry(0.03, 0.03, 0.95, 8).rotateZ(Math.PI / 2); if (!nx) {} else arm.rotateY(Math.PI / 2); arm.translate(x + dx / 2, 4.95, z + dz / 2); mesh(arm, 'steel', x, z, [0.5, 0.52, 0.5]);
      mesh(new THREE.BoxGeometry(0.42, 0.1, 0.22).translate(x + dx, 4.92, z + dz), 'chassis', x, z, [1.5, 1.5, 1.5]);
      mesh(new THREE.BoxGeometry(0.36, 0.01, 0.17).translate(x + dx, 4.865, z + dz), 'glass', x, z, [1.4, 1.4, 1.3]);
    }
  }
  // The building's outside: downpipes at the corners and between openings, a wall light over each door.
  for (const [x, z] of [[H.x0 - 0.22, H.z0 - 0.22], [H.x1 + 0.22, H.z0 - 0.22], [H.x0 - 0.22, H.z1 + 0.22], [H.x1 + 0.22, H.z1 + 0.22], [-6, H.z1 + 0.22], [7.5, H.z1 + 0.22], [-8, H.z0 - 0.22], [6, H.z0 - 0.22], [H.x0 - 0.22, 2.5], [H.x1 + 0.22, -8]] as const) {
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 10).translate(x, 1.7, z), 'conduit', x, z, [0.35, 0.37, 0.36]);
    mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.15, 10).translate(x, 0.075, z), 'conduit', x, z, [0.35, 0.37, 0.36]);
  }
  for (const p of MAP.panels) {
    if (p.kind !== 'door' || Math.abs(Math.abs(p.pos) - (p.axis === 'x' ? 10 : 15)) > 0.01) continue;
    const u = p.u0 + p.cols * 0.125, out = Math.sign(p.pos) * 0.2, x = p.axis === 'x' ? u : p.pos + out, z = p.axis === 'x' ? p.pos + out : u;
    mesh(new THREE.BoxGeometry(p.axis === 'x' ? 0.3 : 0.12, 0.16, p.axis === 'x' ? 0.12 : 0.3).translate(x, 2.55, z), 'casing', x, z, [0.9, 0.9, 0.88]);
    mesh(new THREE.BoxGeometry(p.axis === 'x' ? 0.24 : 0.01, 0.1, p.axis === 'x' ? 0.01 : 0.24).translate(x + (p.axis === 'x' ? 0 : out * 0.35), 2.55, z + (p.axis === 'x' ? out * 0.35 : 0)), 'bulb', x, z, [0.5, 0.5, 0.5]);
  }
  // Weeds in tufts along the foot of the perimeter, puddles and manhole covers on the asphalt, a few cones.
  const r = seeded(97);
  for (let i = 0; i < 90; i++) {
    const edge = Math.floor(r() * 4), t = r(), x = edge < 2 ? B.x0 + 0.15 + t * (B.x1 - B.x0 - 0.3) : edge === 2 ? B.x0 + 0.15 : B.x1 - 0.15, z = edge < 2 ? (edge === 0 ? B.z0 + 0.15 : B.z1 - 0.15) : B.z0 + 0.15 + t * (B.z1 - B.z0 - 0.3);
    for (let k = 0; k < 6; k++) { const a = r() * 6.28, h = 0.12 + r() * 0.2; mesh(new THREE.PlaneGeometry(0.05, h).translate(0, h / 2, 0).rotateX(-0.3 - r() * 0.5).rotateY(a).translate(x, 0.02, z), 'aid', x, z, [0.8 + r() * 0.4, 1 + r() * 0.3, 0.6]); }
  }
  for (const [x, z, sx, sz] of [[-9, 18.5, 1.6, 0.9], [12.5, 19.2, 1.1, 0.7], [-20, -14, 1.8, 1.1], [5, -18.5, 1.3, 0.8], [-24, 2.5, 1.2, 0.9], [24.5, -2, 1.4, 0.8]] as const) {
    const g = new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2).scale(sx, 1, sz).translate(x, 0.011, z);
    mesh(g, 'glass', x, z, [0.55, 0.6, 0.62]);
  }
  for (const [x, z] of [[-3.5, 13.6], [16, -18], [-24.5, -7.5], [21.5, 7.5]] as const) {
    mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.012, 24).translate(x, 0.016, z), 'steel', x, z, [0.35, 0.34, 0.32]);
    for (let k = -2; k <= 2; k++) mesh(new THREE.BoxGeometry(0.5, 0.004, 0.02).translate(x, 0.024, z + k * 0.1), 'kick', x, z, [1, 1, 1]);
  }
  for (const [x, z] of [[0.6, 11.4], [1.2, 11.2], [-16, -11.2], [16.2, 9.4]] as const) {
    mesh(new THREE.ConeGeometry(0.13, 0.5, 14).translate(x, 0.28, z), 'alarm', x, z, [1.6, 0.7, 0.3]);
    mesh(new THREE.BoxGeometry(0.34, 0.03, 0.34).translate(x, 0.015, z), 'chassis', x, z, [1, 1, 1]);
    mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.07, 14).translate(x, 0.32, z), 'paper', x, z, [1.2, 1.2, 1.2]);
  }
  return D;
}

function dressLab(atlas: Atlas, room: Region): DetailBuilder {
  const D = new DetailBuilder(atlas);
  for (const b of MAP.boxes) {
    if (isSetPiece(b)) continue; // modelled in render/setpieces.ts, with its damage states
    if (b.mat !== 'counter' || !inRoom(room, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)) continue;
    cabinetry(D, b.x0, b.z0, b.x1, b.z1, b.y1);
  }
  // Lockers: the tall steel boxes along the north wall, doors facing into the room.
  for (const b of MAP.boxes) {
    if (isSetPiece(b)) continue; // modelled in render/setpieces.ts, with its damage states
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
  // Map fill: fume-hood ducting overhead from the north wall, and hazard tape on the floor round the site's core.
  { const dn: V3 = [0, -1, 0];
    put(D, new THREE.CylinderGeometry(0.16, 0.16, 3.2, 16, 1, true).rotateZ(Math.PI / 2).translate(-3.2, 2.72, -9.3), 'steel', [-3.2, WALL_H - 0.001, -9.3], dn, [0.8, 0.8, 0.82]);
    put(D, new THREE.CylinderGeometry(0.16, 0.16, 0.5, 16, 1, true).translate(-4.8, 2.72 + 0.12, -9.3), 'steel', [-4.8, WALL_H - 0.001, -9.3], dn, [0.8, 0.8, 0.82]);
    for (const x of [-4.4, -3.2, -2.0]) D.box('conduit', x - 0.006, 2.88, -9.32, x + 0.006, WALL_H, -9.28, [x, WALL_H - 0.001, -9.3], dn);
    const up: V3 = [0, 1, 0], cx = -1, cz = -6, h = 1.35;
    for (const [x0, z0, x1, z1] of [[cx - h, cz - h, cx + h, cz - h + 0.05], [cx - h, cz + h - 0.05, cx + h, cz + h], [cx - h, cz - h, cx - h + 0.05, cz + h], [cx + h - 0.05, cz - h, cx + h, cz + h]] as const) D.box('paper', x0, 0.021, z0, x1, 0.024, z1, [(x0 + x1) / 2, 0.022, (z0 + z1) / 2], up, [1.3, 1.1, 0.25]); }
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
/** The Server Room: equipment racks dressed on both faces (posts, servers, switches and patch panels with their
 * status lights, blanking plates), a cable tray over each run on drop rods, a wall air-conditioning unit and kit on the
 * walls. The racks' collision boxes stay the volume; everything here sits on their faces or overhead. */
function dressServer(atlas: Atlas, room: Region): DetailBuilder {
  const D = new DetailBuilder(atlas), up: V3 = [0, -1, 0], H = WALL_H;
  ceilingGrid(D, room);
  let seed = 31;
  for (const b of MAP.boxes) {
    if (isSetPiece(b)) continue; // modelled in render/setpieces.ts, with its damage states
    if (b.mat !== 'rack' || !inRoom(room, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)) continue;
    const r = seeded(seed += 13), alongZ = b.z1 - b.z0 > b.x1 - b.x0, len = alongZ ? b.z1 - b.z0 : b.x1 - b.x0, start = alongZ ? b.z0 : b.x0;
    const bays = Math.max(1, Math.round(len / 0.6)), bw = len / bays;
    for (const side of [1, -1]) {
      const face = alongZ ? (side > 0 ? b.x1 : b.x0) : (side > 0 ? b.z1 : b.z0), n: V3 = alongZ ? [side, 0, 0] : [0, 0, side];
      const put = (key: DressKey, a: number, c: number, y0: number, y1: number, d0: number, d1: number, tint?: V3) => {
        const o0 = face + side * d0, o1 = face + side * d1, lo = Math.min(o0, o1), hi = Math.max(o0, o1), mid = (a + c) / 2, at: V3 = alongZ ? [face + side * 0.001, (y0 + y1) / 2, mid] : [mid, (y0 + y1) / 2, face + side * 0.001];
        if (alongZ) D.box(key, lo, y0, a, hi, y1, c, at, n, tint); else D.box(key, a, y0, lo, c, y1, hi, at, n, tint);
      };
      for (let i = 0; i <= bays; i++) { const u = start + i * bw; put('kick', u - 0.025, u + 0.025, 0, b.y1, 0, 0.035); }
      put('kick', start, start + len, b.y1 - 0.06, b.y1, 0, 0.035); put('kick', start, start + len, 0, 0.09, 0, 0.035);
      for (let i = 0; i < bays; i++) {
        const a = start + i * bw + 0.03, c = start + (i + 1) * bw - 0.03;
        let y = 0.12;
        while (y < b.y1 - 0.12) {
          const pick = r(), u = pick < 0.35 ? 1 : pick < 0.6 ? 2 : pick < 0.75 ? 4 : pick < 0.88 ? 1 : 3, h = Math.min(u * 0.0445 - 0.003, b.y1 - 0.1 - y);
          if (h < 0.03) break;
          if (pick > 0.88 && pick < 0.95) { put('chassis', a, c, y, y + h, 0.002, 0.008, [1.4, 1.4, 1.45]); y += h + 0.003; continue; }  // blanking plate
          // Mostly black bezels; one in five a silver or grey chassis.
          const silver = r() < 0.2, tone = silver ? 5 + r() * 4 : 0.7 + r() * 0.8, depth = 0.012 + r() * 0.02;
          put('chassis', a, c, y, y + h, 0.002, depth, [tone, tone, tone * 1.05]);
          if (pick >= 0.75 && pick < 0.88) {
            // Patch panel: a row of ports and a cable loom hanging off it.
            for (let p = 0; p < 12; p++) { const pu = a + 0.03 + p * (c - a - 0.06) / 12; put('socket', pu, pu + 0.018, y + h * 0.3, y + h * 0.7, depth, depth + 0.002, [0.35, 0.36, 0.38]); }
            put('conduit', a + 0.02, c - 0.02, y - 0.012, y + 0.004, depth + 0.004, depth + 0.03, [0.25, 0.4, 0.75]);
          } else {
            // Drive bays or vents, and two or three status lights at the left end.
            if (u >= 2) for (let k = 0; k < 4; k++) { const ku = a + 0.12 + k * (c - a - 0.16) / 4; put('kick', ku, ku + (c - a - 0.2) / 4 - 0.01, y + 0.008, y + h - 0.008, depth, depth + 0.002); }
            const lights = 2 + Math.floor(r() * 2);
            for (let k = 0; k < lights; k++) put(r() < 0.82 ? 'led' : 'ledAmber', a + 0.03 + k * 0.022, a + 0.04 + k * 0.022, y + h / 2 - 0.005, y + h / 2 + 0.005, depth, depth + 0.003);
          }
          y += h + 0.003;
        }
      }
    }
    // Dark steel side panels over both ends of the run, with a vent grille and a cable entry.
    for (const end of [-1, 1]) {
      const e = alongZ ? (end > 0 ? b.z1 : b.z0) : (end > 0 ? b.x1 : b.x0), n: V3 = alongZ ? [0, 0, end] : [end, 0, 0];
      const slab = (u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, key: DressKey, tint?: V3) => {
        const o0 = e + end * d0, o1 = e + end * d1, lo = Math.min(o0, o1), hi = Math.max(o0, o1), at: V3 = alongZ ? [(u0 + u1) / 2, (y0 + y1) / 2, e + end * 0.001] : [e + end * 0.001, (y0 + y1) / 2, (u0 + u1) / 2];
        if (alongZ) D.box(key, u0, y0, lo, u1, y1, hi, at, n, tint); else D.box(key, lo, y0, u0, hi, y1, u1, at, n, tint);
      };
      const w0 = alongZ ? b.x0 : b.z0, w1 = alongZ ? b.x1 : b.z1;
      slab(w0, w1, 0, b.y1, 0, 0.012, 'chassis', [1.5, 1.5, 1.6]);
      for (let k = 0; k < 9; k++) slab(w0 + 0.12, w1 - 0.12, 1.2 + k * 0.05, 1.22 + k * 0.05, 0.012, 0.016, 'kick');
      slab((w0 + w1) / 2 - 0.08, (w0 + w1) / 2 + 0.08, b.y1 - 0.12, b.y1 - 0.02, 0.012, 0.03, 'plastic');
    }
    // The cable tray over the run, on drop rods to the slab, with a loom of cable in it.
    const ty = 2.42, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, hw = 0.16;
    const tray = (y0: number, y1: number, w: number, key: DressKey, tint?: V3) => alongZ
      ? D.box(key, cx - w, y0, b.z0 - 0.2, cx + w, y1, b.z1 + 0.2, [cx, H - 0.001, cz], up, tint)
      : D.box(key, b.x0 - 0.2, y0, cz - w, b.x1 + 0.2, y1, cz + w, [cx, H - 0.001, cz], up, tint);
    tray(ty, ty + 0.012, hw, 'steel');
    for (const s of [-1, 1]) alongZ ? D.box('steel', cx + s * hw - 0.006, ty, b.z0 - 0.2, cx + s * hw + 0.006, ty + 0.08, b.z1 + 0.2, [cx, H - 0.001, cz], up)
      : D.box('steel', b.x0 - 0.2, ty, cz + s * hw - 0.006, b.x1 + 0.2, ty + 0.08, cz + s * hw + 0.006, [cx, H - 0.001, cz], up);
    tray(ty + 0.012, ty + 0.06, hw - 0.03, 'conduit', [0.18, 0.2, 0.24]);
    for (let a = 0.3; a < len; a += 1.2) for (const s of [-1, 1]) {
      const px = alongZ ? cx + s * (hw + 0.02) : start + a, pz = alongZ ? start + a : cz + s * (hw + 0.02);
      D.box('chrome', px - 0.005, ty, pz - 0.005, px + 0.005, H, pz + 0.005, [px, H - 0.001, pz], up, [0.7, 0.7, 0.7]);
    }
  }
  // North wall (solid): skirting, the wall air-conditioning unit with its pipe run, a fire panel by the door end.
  const z = room.z0 + 0.15, n: V3 = [0, 0, 1], at = (x: number, yy: number): V3 => [x, yy, z + 0.001];
  D.box('trim', room.x0 + 0.12, 0.02, z, room.x1 - 0.12, 0.11, z + 0.016, at(9, 0.06), n);
  D.box('casing', 8.4, 2.3, z, 9.5, 2.62, z + 0.24, at(8.95, 2.46), n, [0.98, 0.98, 0.96]);
  D.box('kick', 8.5, 2.31, z + 0.2, 9.4, 2.35, z + 0.242, at(8.95, 2.33), n);
  D.box('conduit', 9.5, 2.5, z, 10.2, 2.56, z + 0.06, at(9.85, 2.53), n, [0.9, 0.9, 0.88]);
  D.box('conduit', 10.14, 2.56, z, 10.2, H, z + 0.06, at(10.17, 2.8), n, [0.9, 0.9, 0.88]);
  D.box('alarm', 13.2, 1.4, z, 13.55, 1.75, z + 0.08, at(13.37, 1.57), n);
  // Map fill: floor cable covers across the aisles, the trays joined over them, warning signs, a crash cart.
  { const fl = (x: number, z: number): V3 => [x, 0.001, z], upF: V3 = [0, 1, 0];
    for (const x of [7.2, 10.8]) put(D, new THREE.BoxGeometry(0.22, 0.02, 2.5).translate(x, 0.01, -6.3), 'chassis', fl(x, -6.3), upF, [2.4, 2.1, 0.6]);
    for (const x of [7.5, 9.5]) D.box('conduit', x - 0.15, 2.42, -7.4, x + 0.15, 2.43, -5.4, [x, WALL_H - 0.001, -6.4], [0, -1, 0]);
    const z = room.z0 + 0.15, n: V3 = [0, 0, 1];
    for (const x of [6.2, 11.6]) { D.box('paper', x - 0.15, 1.5, z, x + 0.15, 1.72, z + 0.004, [x, 1.6, z + 0.001], n, [1.3, 1.15, 0.3]); D.box('kick', x - 0.12, 1.52, z + 0.004, x + 0.12, 1.56, z + 0.006, [x, 1.6, z + 0.001], n, [1, 1, 1]); }
    const cx = 12.9, cz = -7.0;
    put(D, new THREE.BoxGeometry(0.5, 0.02, 0.35).translate(cx, 0.85, cz), 'chassis', fl(cx, cz), upF, [1.8, 1.8, 1.8]);
    put(D, new THREE.BoxGeometry(0.5, 0.02, 0.35).translate(cx, 0.3, cz), 'chassis', fl(cx, cz), upF, [1.8, 1.8, 1.8]);
    for (const [dx, dz] of [[-0.23, -0.15], [0.23, -0.15], [-0.23, 0.15], [0.23, 0.15]]) put(D, new THREE.CylinderGeometry(0.012, 0.012, 0.85, 6).translate(cx + dx, 0.43, cz + dz), 'chrome', fl(cx, cz), upF);
    put(D, new THREE.BoxGeometry(0.36, 0.26, 0.04).translate(cx, 1.0, cz - 0.08).rotateX(0), 'chassis', fl(cx, cz), upF, [0.8, 0.8, 0.8]);
    put(D, new THREE.BoxGeometry(0.33, 0.22, 0.005).translate(cx, 1.0, cz - 0.055), 'screen', fl(cx, cz), upF); }
  return D;
}

/** The Lobby: the reception desk (panelled front, a ledge, a kick plate, the receptionist's monitor, keyboard and
 * phone), an entrance mat inside the south door with an exit sign over it, a TV on the south wall, a noticeboard and a
 * clock on the west wall, skirting on the solid walls, sofa cushions. Nothing is placed on destructible walls. */
function dressLobby(atlas: Atlas, room: Region): DetailBuilder {
  const D = new DetailBuilder(atlas), up: V3 = [0, 1, 0];
  ceilingGrid(D, room);
  const geo = (g: THREE.BufferGeometry, key: DressKey, on: V3, n: V3, tint?: V3) => { D.mesh(key, g.attributes.position.array, g.attributes.normal.array, g.index!.array, on, n, tint ?? [1, 1, 1], g.attributes.uv?.array); g.dispose(); };
  for (const b of MAP.boxes) {
    if (isSetPiece(b)) continue; // modelled in render/setpieces.ts, with its damage states
    if (!inRoom(room, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)) continue;
    if (b.mat === 'wood' && b.y1 > 0.9) {
      // Reception desk: the long run's north face and the return's west face are the public fronts.
      const alongX = b.x1 - b.x0 > b.z1 - b.z0, top = b.y1;
      if (alongX) {
        const z = b.z0, n: V3 = [0, 0, -1], at = (x: number, y: number): V3 => [x, y, z - 0.001];
        const panels = Math.round((b.x1 - b.x0) / 0.75), pw = (b.x1 - b.x0) / panels;
        for (let i = 0; i < panels; i++) D.box('casing', b.x0 + i * pw + 0.02, 0.12, z - 0.02, b.x0 + (i + 1) * pw - 0.02, top - 0.12, z, at(b.x0 + (i + 0.5) * pw, 0.6), n, [0.62, 0.6, 0.56]);
        D.box('kick', b.x0, 0, z - 0.025, b.x1, 0.1, z, at((b.x0 + b.x1) / 2, 0.05), n);
        D.box('casing', b.x0 - 0.02, top, z - 0.08, b.x1, top + 0.035, z + 0.22, [(b.x0 + b.x1) / 2, top + 0.001, z + 0.1], up, [0.8, 0.78, 0.74]);
        // On the desk, set back for the receptionist: a monitor facing south, a keyboard, a phone, a tray of papers.
        const mx = b.x0 + 1.6, mz = b.z0 + 0.45, on: V3 = [mx, top + 0.001, (b.z0 + b.z1) / 2];
        D.box('chassis', mx - 0.1, top, mz - 0.08, mx + 0.1, top + 0.015, mz + 0.06, on, up);
        D.box('chassis', mx - 0.02, top + 0.015, mz - 0.04, mx + 0.02, top + 0.2, mz - 0.01, on, up);
        D.box('chassis', mx - 0.29, top + 0.14, mz - 0.03, mx + 0.29, top + 0.48, mz, on, up);
        D.box('screen', mx - 0.27, top + 0.16, mz, mx + 0.27, top + 0.46, mz + 0.004, on, up);
        D.box('chassis', mx - 0.22, top, mz + 0.12, mx + 0.22, top + 0.02, mz + 0.27, on, up, [2.4, 2.4, 2.4]);
        D.box('chassis', mx + 0.45, top, mz + 0.05, mx + 0.65, top + 0.07, mz + 0.25, on, up, [1.6, 1.6, 1.6]);
        D.box('chassis', mx + 0.47, top + 0.07, mz + 0.06, mx + 0.52, top + 0.1, mz + 0.24, on, up, [1.2, 1.2, 1.2]);
        D.box('paper', mx - 0.9, top, mz - 0.05, mx - 0.6, top + 0.04, mz + 0.18, on, up, [0.9, 0.9, 0.88]);
      } else {
        const x = b.x0, n: V3 = [-1, 0, 0], at = (zz: number, y: number): V3 => [x - 0.001, y, zz];
        const panels = Math.max(1, Math.round((b.z1 - b.z0) / 0.75)), pw = (b.z1 - b.z0) / panels;
        for (let i = 0; i < panels; i++) D.box('casing', x - 0.02, 0.12, b.z0 + i * pw + 0.02, x, top - 0.12, b.z0 + (i + 1) * pw - 0.02, at(b.z0 + (i + 0.5) * pw, 0.6), n, [0.62, 0.6, 0.56]);
        D.box('kick', x - 0.025, 0, b.z0, x, 0.1, b.z1, at((b.z0 + b.z1) / 2, 0.05), n);
        D.box('casing', x - 0.08, top, b.z0, x + 0.22, top + 0.035, b.z1 + 0.02, [x + 0.1, top + 0.001, (b.z0 + b.z1) / 2], up, [0.8, 0.78, 0.74]);
      }
    }
    if (b.mat === 'fabric') {
      // Seat cushion joints and the cushion fronts' piping.
      const alongZ = b.z1 - b.z0 > b.x1 - b.x0, len = alongZ ? b.z1 - b.z0 : b.x1 - b.x0, start = alongZ ? b.z0 : b.x0;
      for (let k = 1; k < 3; k++) {
        const u = start + 0.18 + k * (len - 0.36) / 3;
        const on: V3 = [(b.x0 + b.x1) / 2, 0.451, (b.z0 + b.z1) / 2];
        if (alongZ) D.box('kick', b.x0 + 0.02, 0.45, u - 0.006, b.x1 - 0.24, 0.456, u + 0.006, on, up, [3, 3, 3]); else D.box('kick', u - 0.006, 0.45, b.z0 + 0.24, u + 0.006, 0.456, b.z1 - 0.02, on, up, [3, 3, 3]);
      }
    }
  }
  // South wall (solid, with the entrance): mat, exit sign, skirting, a TV.
  {
    const z = room.z1 - 0.15, n: V3 = [0, 0, -1], at = (x: number, y: number): V3 => [x, y, z - 0.001];
    D.box('kick', -12.15, 0.02, 8.5, -10.35, 0.028, z, [-11.25, 0.021, 9.2], up, [2.2, 2.1, 2]);
    D.box('trim', room.x0 + 0.12, 0.02, z - 0.016, -12.05, 0.11, z, at(-13.5, 0.06), n);
    D.box('trim', -10.45, 0.02, z - 0.016, room.x1 - 0.12, 0.11, z, at(-8.8, 0.06), n);
    D.box('plastic', -11.45, 2.35, z - 0.06, -11.05, 2.53, z, at(-11.25, 2.44), n);
    geo(new THREE.PlaneGeometry(0.36, 0.16).rotateY(Math.PI).translate(-11.25, 2.44, z - 0.061), 'exit', at(-11.25, 2.44), n);
    D.box('chassis', -9.6, 1.65, z - 0.06, -8.4, 2.35, z, at(-9, 2), n);
    D.box('screen', -9.56, 1.69, z - 0.062, -8.44, 2.31, z - 0.06, at(-9, 2), n);
  }
  // West wall (solid): skirting, a noticeboard with sheets, a clock.
  {
    const x = room.x0 + 0.15, n: V3 = [1, 0, 0], at = (zz: number, y: number): V3 => [x + 0.001, y, zz];
    D.box('trim', x, 0.02, room.z0 + 0.12, x + 0.016, 0.11, room.z1 - 0.12, at(5.5, 0.06), n);
    D.box('handle', x, 1.3, 6.4, x + 0.02, 2.05, 7.6, at(7, 1.6), n);
    D.box('cork', x, 1.325, 6.425, x + 0.022, 2.025, 7.575, at(7, 1.6), n);
    const r = seeded(19);
    for (let i = 0; i < 6; i++) { const w = 0.15 + r() * 0.08, h = 0.21 + r() * 0.06, zz = 6.48 + r() * (1.0 - w), y = 1.36 + r() * (0.62 - h); D.box('paper', x + 0.022, y, zz, x + 0.0235, y + h, zz + w, at(zz + w / 2, y + h / 2), n, i % 3 === 0 ? [1, 0.95, 0.75] : [1, 1, 1]); }
    D.box('plastic', x, 2.52, 4.82, x + 0.04, 2.88, 5.18, at(5, 2.7), n);
    geo(new THREE.PlaneGeometry(0.32, 0.32).rotateY(Math.PI / 2).translate(x + 0.041, 2.7, 5), 'clock', at(5, 2.7), n);
  }
  // A rug in front of the seating, plants in the solid corners, a leaflet rack on the west wall.
  rug(D, -9.9, 2.3, -8.5, 4.3, [0.55, 0.6, 0.75], [0.3, 0.32, 0.42]);
  plant(D, -13.4, 9.6, 1.0, 71); plant(D, -14.55, 1.5, 0.9, 73);
  { const x = room.x0 + 0.15, n: V3 = [1, 0, 0], at = (zz: number, yy: number): V3 => [x + 0.001, yy, zz];
    D.box('steel', x, 0.9, 7.9, x + 0.12, 1.5, 8.4, at(8.15, 1.2), n, [0.7, 0.7, 0.72]);
    for (let k = 0; k < 3; k++) for (let c = 0; c < 2; c++) D.box('paper', x + 0.04, 0.95 + k * 0.18, 7.95 + c * 0.23, x + 0.11, 1.1 + k * 0.18, 8.15 + c * 0.23, at(8.15, 1.2), n, [[1.1, 0.6, 0.4], [0.5, 0.75, 1.1], [1.1, 1.05, 0.6]][(k + c) % 3] as V3); }
  return D;
}

/** A workstation on a desk (long along x): monitor on a stand facing the user's side (s = +1: the user sits at z1),
 * keyboard, mouse, papers and a mug; a task chair and a bin on the user's side. */
function workstation(D: DetailBuilder, b: { x0: number; z0: number; x1: number; z1: number; y1: number }, s: 1 | -1, seed: number) {
  const r = seeded(seed), top = b.y1, up: V3 = [0, 1, 0], on: V3 = [(b.x0 + b.x1) / 2, top + 0.001, (b.z0 + b.z1) / 2];
  const back = s > 0 ? b.z0 + 0.14 : b.z1 - 0.14, front = s > 0 ? b.z1 - 0.2 : b.z0 + 0.2, mx = (b.x0 + b.x1) / 2 + (r() - 0.5) * 0.4;
  const zb = (a: number, c: number) => [Math.min(a, c), Math.max(a, c)] as const;
  const box = (key: DressKey, x0: number, y0: number, za: number, x1: number, y1: number, zc: number, tint?: V3, o: V3 = on) => { const [z0, z1] = zb(za, zc); D.box(key, x0, y0, z0, x1, y1, z1, o, up, tint); };
  box('chassis', mx - 0.11, top, back - 0.08, mx + 0.11, top + 0.012, back + 0.06, [0.9, 0.9, 0.9]);
  box('chassis', mx - 0.02, top + 0.012, back - 0.03, mx + 0.02, top + 0.16, back, [0.9, 0.9, 0.9]);
  box('chassis', mx - 0.27, top + 0.1, back, mx + 0.27, top + 0.42, back + s * 0.03, [0.55, 0.55, 0.55]);
  box('screen', mx - 0.25, top + 0.12, back + s * 0.03, mx + 0.25, top + 0.4, back + s * 0.034);
  box('chassis', mx - 0.22, top, front - 0.07, mx + 0.22, top + 0.02, front + 0.07, [1.1, 1.1, 1.1]);
  box('chassis', mx + 0.3, top, front - 0.03, mx + 0.36, top + 0.025, front + 0.04, [1.1, 1.1, 1.1]);
  for (let i = 0; i < 2; i++) { const px = b.x0 + 0.15 + r() * 0.3 + i * (b.x1 - b.x0 - 0.65), pz = (b.z0 + b.z1) / 2 - 0.15 + r() * 0.1; box('paper', px, top, pz, px + 0.21, top + 0.004 + r() * 0.02, pz + 0.3, [0.5, 0.5, 0.48]); }
  { const g = new THREE.CylinderGeometry(0.04, 0.036, 0.1, 14).translate(b.x1 - 0.18, top + 0.05, front); D.mesh('casing', g.attributes.position.array, g.attributes.normal.array, g.index!.array, on, up, r() < 0.5 ? [0.9, 0.3, 0.25] : [0.95, 0.95, 0.92]); g.dispose(); }
  // The chair, pulled out on the user's side: five-star base, column, seat and back (open and low; not cover).
  const cx = mx + (r() - 0.5) * 0.3, cz = (s > 0 ? b.z1 : b.z0) + s * (0.45 + r() * 0.15), turn = (r() - 0.5) * 0.8, fl: V3 = [cx, 0.001, cz];
  const mesh = (g: THREE.BufferGeometry, key: DressKey, tint?: V3) => { g.rotateY(turn); g.translate(cx, 0, cz); D.mesh(key, g.attributes.position.array, g.attributes.normal.array, g.index!.array, fl, up, tint ?? [1, 1, 1]); g.dispose(); };
  for (let k = 0; k < 5; k++) mesh(new THREE.BoxGeometry(0.3, 0.03, 0.04).translate(0.15, 0.06, 0).rotateY(k * Math.PI * 2 / 5), 'chassis', [0.8, 0.8, 0.8]);
  mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.38, 10).translate(0, 0.26, 0), 'chrome');
  mesh(new THREE.BoxGeometry(0.46, 0.07, 0.46).translate(0, 0.48, 0), 'chassis', [0.5, 0.55, 0.75]);
  mesh(new THREE.BoxGeometry(0.44, 0.5, 0.06).translate(0, 0.82, s * 0.22), 'chassis', [0.5, 0.55, 0.75]);
  // A bin by the desk end.
  { const bx = b.x0 - 0.22, bz = (s > 0 ? b.z1 : b.z0) - s * 0.2, g = new THREE.CylinderGeometry(0.13, 0.11, 0.32, 16, 1, true).translate(bx, 0.16, bz); D.mesh('chassis', g.attributes.position.array, g.attributes.normal.array, g.index!.array, [bx, 0.001, bz], up, [1, 1, 1]); g.dispose(); }
}

/** The Office: three workstations, the filing cabinet's drawers, a whiteboard and clock on the south wall, skirting. */
function dressOffice(atlas: Atlas, room: Region): DetailBuilder {
  const D = new DetailBuilder(atlas);
  ceilingGrid(D, room);
  let seed = 41;
  for (const b of MAP.boxes) {
    if (isSetPiece(b)) continue; // modelled in render/setpieces.ts, with its damage states
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    if (!inRoom(room, cx, cz)) continue;
    // Users sit on the open side: away from the south wall, otherwise facing north.
    if (b.mat === 'wood') workstation(D, b, b.z1 > room.z1 - 1 ? -1 : 1, seed += 9);
    if (b.mat === 'steel') filing(D, b.x0, [-1, 0, 0], b.z0, b.z1, b.y1);
  }
  const z = room.z1 - 0.15, n: V3 = [0, 0, -1], at = (x: number, y: number): V3 => [x, y, z - 0.001];
  D.box('trim', room.x0 + 0.12, 0.02, z - 0.016, room.x1 - 0.12, 0.11, z, at(-3.5, 0.06), n);
  // Whiteboard east of the window: aluminium frame, the board, a pen tray and a few marks.
  D.box('handle', -2.6, 1.0, z - 0.02, -0.9, 2.0, z, at(-1.75, 1.5), n);
  D.box('paper', -2.57, 1.03, z - 0.022, -0.93, 1.97, z - 0.02, at(-1.75, 1.5), n, [1.1, 1.1, 1.1]);
  D.box('handle', -2.3, 0.97, z - 0.07, -1.2, 1.0, z - 0.02, at(-1.75, 1.0), n);
  const r = seeded(23);
  for (let i = 0; i < 6; i++) { const x = -2.45 + r() * 1.2, y = 1.2 + r() * 0.65; D.box('kick', x, y, z - 0.0225, x + 0.1 + r() * 0.25, y + 0.008, z - 0.022, at(x, y), n, i < 2 ? [8, 1.5, 1.5] : [2, 2, 4]); }
  D.box('plastic', -6.3, 2.52, z - 0.04, -5.94, 2.88, z, at(-6.12, 2.7), n);
  { const g = new THREE.PlaneGeometry(0.32, 0.32).rotateY(Math.PI).translate(-6.12, 2.7, z - 0.041); D.mesh('clock', g.attributes.position.array, g.attributes.normal.array, g.index!.array, at(-6.12, 2.7), n, [1, 1, 1], g.attributes.uv.array); g.dispose(); }
  // A rug in the open centre, a coat stand by the door and coats on hooks on the south wall.
  rug(D, -4.4, 5.0, -2.9, 6.3, [0.55, 0.42, 0.35], [0.3, 0.24, 0.2]);
  { const fl: V3 = [-6.3, 0.001, 9.4], up2: V3 = [0, 1, 0];
    const g = new THREE.CylinderGeometry(0.015, 0.02, 1.75, 8).translate(-6.3, 0.875, 9.4); D.mesh('chrome', g.attributes.position.array, g.attributes.normal.array, g.index!.array, fl, up2, [0.4, 0.4, 0.4]); g.dispose();
    const b = new THREE.CylinderGeometry(0.2, 0.22, 0.03, 16).translate(-6.3, 0.015, 9.4); D.mesh('chassis', b.attributes.position.array, b.attributes.normal.array, b.index!.array, fl, up2, [1.5, 1.5, 1.5]); b.dispose();
    const coat = new THREE.CylinderGeometry(0.12, 0.2, 0.85, 10).translate(-6.24, 1.18, 9.4); D.mesh('card', coat.attributes.position.array, coat.attributes.normal.array, coat.index!.array, fl, up2, [0.3, 0.32, 0.38]); coat.dispose(); }
  for (const [x, tint] of [[-0.9, [0.55, 0.3, 0.25]], [-0.6, [0.25, 0.3, 0.2]]] as const) {
    D.box('handle', x - 0.02, 1.62, z - 0.06, x + 0.02, 1.66, z, at(x, 1.64), n);
    D.box('card', x - 0.17, 0.95, z - 0.14, x + 0.17, 1.63, z - 0.02, at(x, 1.3), n, [...tint] as V3);
  }
  return D;
}

/** The Break Room: the kitchen run (cabinet doors and a drawer line on its open face, a sink, a kettle, a
 * microwave and a coffee machine on top, wall cabinets over it), the fridge, chairs round the table with mugs, a
 * clock, a poster and skirting on the solid walls. */
function dressBreak(atlas: Atlas, room: Region): DetailBuilder {
  const D = new DetailBuilder(atlas), up: V3 = [0, 1, 0];
  ceilingGrid(D, room);
  const mesh = (g: THREE.BufferGeometry, key: DressKey, on: V3, n: V3, tint?: V3) => { D.mesh(key, g.attributes.position.array, g.attributes.normal.array, g.index!.array, on, n, tint ?? [1, 1, 1], g.attributes.uv?.array); g.dispose(); };
  for (const b of MAP.boxes) {
    if (isSetPiece(b)) continue; // modelled in render/setpieces.ts, with its damage states
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    if (!inRoom(room, cx, cz)) continue;
    if (b.mat === 'counter') {
      // Kitchen run against the east wall: its open face is the west one.
      const x = b.x0, n: V3 = [-1, 0, 0], at = (z: number, y: number): V3 => [x - 0.001, y, z], top = b.y1, carcass = top - 0.05;
      const bays = Math.max(1, Math.round((b.z1 - b.z0) / 0.6)), w = (b.z1 - b.z0) / bays;
      D.box('kick', x - 0.003, 0.02, b.z0, x, 0.11, b.z1, at(cz, 0.06), n);
      for (let i = 0; i < bays; i++) {
        const z0 = b.z0 + i * w + 0.004, z1 = b.z0 + (i + 1) * w - 0.004, zc = (z0 + z1) / 2;
        D.box('door', x - 0.018, 0.12, z0, x, 0.68, z1, at(zc, 0.4), n, [1.2, 1.2, 1.15]);
        D.box('door', x - 0.018, 0.69, z0, x, carcass - 0.01, z1, at(zc, 0.8), n, [1.15, 1.15, 1.1]);
        D.box('handle', x - 0.05, 0.6, zc - 0.07, x - 0.018, 0.612, zc + 0.07, at(zc, 0.6), n);
        D.box('handle', x - 0.05, (0.69 + carcass) / 2 - 0.006, zc - 0.07, x - 0.018, (0.69 + carcass) / 2 + 0.006, zc + 0.07, at(zc, 0.8), n);
      }
      // On the worktop: sink and tap, kettle, microwave, coffee machine.
      const on: V3 = [cx, top + 0.001, cz];
      D.box('steel', b.x0 + 0.06, top, 2.1, b.x1 - 0.08, top + 0.006, 2.7, on, up);
      D.box('kick', b.x0 + 0.1, top + 0.001, 2.14, b.x1 - 0.12, top + 0.007, 2.66, on, up, [2, 2, 2]);
      mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 8).translate(b.x1 - 0.1, top + 0.125, 2.4), 'chrome', on, up);
      mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 8).rotateZ(Math.PI / 2).translate(b.x1 - 0.19, top + 0.25, 2.4), 'chrome', on, up);
      mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.22, 16).translate(cx, top + 0.11, 1.75), 'chassis', on, up, [3.5, 3.5, 3.5]);
      D.box('chassis', b.x0 + 0.02, top, 3.0, b.x1 - 0.05, top + 0.3, 3.5, on, up, [3, 3, 3]);
      D.box('screen', b.x0 + 0.015, top + 0.05, 3.04, b.x0 + 0.02, top + 0.26, 3.36, on, up);
      D.box('chassis', b.x0 + 0.06, top, 3.8, b.x1 - 0.08, top + 0.38, 4.15, on, up, [0.8, 0.8, 0.8]);
      D.box('amber', b.x0 + 0.055, top + 0.3, 3.95, b.x0 + 0.06, top + 0.32, 4.0, on, up);
      // Wall cabinets over the run, on the east wall.
      const wx = room.x1 - 0.15, wn: V3 = [-1, 0, 0], wa = (z: number, y: number): V3 => [wx - 0.001, y, z];
      for (let i = 0; i < bays; i++) {
        const z0 = b.z0 + i * w + 0.004, z1 = b.z0 + (i + 1) * w - 0.004, zc = (z0 + z1) / 2;
        D.box('kick', wx - 0.33, 1.55, z0 - 0.004, wx, 2.25, z1 + 0.004, wa(zc, 1.9), wn, [3, 3, 3]);
        D.box('door', wx - 0.345, 1.56, z0, wx - 0.33, 2.24, z1, wa(zc, 1.9), wn, [1.2, 1.2, 1.15]);
        D.box('handle', wx - 0.37, 1.6, zc - 0.006, wx - 0.34, 1.75, zc + 0.006, wa(zc, 1.68), wn);
      }
    }
    if (b.mat === 'steel') {
      // The fridge: two doors on its west face with long handles, a grille at the foot.
      const x = b.x0, n: V3 = [-1, 0, 0], at = (z: number, y: number): V3 => [x - 0.001, y, z];
      D.box('casing', x - 0.015, 0.12, b.z0 + 0.01, x, 1.25, b.z1 - 0.01, at(cz, 0.7), n, [1, 1, 0.98]);
      D.box('casing', x - 0.015, 1.27, b.z0 + 0.01, x, b.y1 - 0.02, b.z1 - 0.01, at(cz, 1.6), n, [1, 1, 0.98]);
      D.box('handle', x - 0.05, 0.8, b.z1 - 0.08, x - 0.015, 1.2, b.z1 - 0.06, at(b.z1 - 0.07, 1), n);
      D.box('handle', x - 0.05, 1.3, b.z1 - 0.08, x - 0.015, 1.6, b.z1 - 0.06, at(b.z1 - 0.07, 1.45), n);
      D.box('kick', x - 0.01, 0.02, b.z0 + 0.02, x, 0.11, b.z1 - 0.02, at(cz, 0.06), n);
    }
    if (b.mat === 'wood' && b.y1 < 0.9 && b.y1 > 0.6) {
      // Chairs round the table (open and low; not cover), and mugs on it.
      const top = b.y1, r = seeded(53), on: V3 = [cx, top + 0.001, cz];
      const seats: [number, number, number][] = [[b.x0 + 0.45, b.z0 - 0.38, 0], [b.x1 - 0.45, b.z0 - 0.42, 0.2], [b.x0 + 0.5, b.z1 + 0.4, Math.PI], [b.x1 - 0.4, b.z1 + 0.45, Math.PI - 0.3]];
      for (const [sx, sz, yaw] of seats) {
        const fl: V3 = [sx, 0.001, sz], put = (g: THREE.BufferGeometry, key: DressKey, tint?: V3) => { g.rotateY(yaw + (r() - 0.5) * 0.3); g.translate(sx, 0, sz); mesh(g, key, fl, up, tint); };
        for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) put(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 6).translate(lx, 0.225, lz), 'chrome');
        put(new THREE.BoxGeometry(0.42, 0.03, 0.42).translate(0, 0.46, 0), 'chassis', [0.9, 0.5, 0.35]);
        put(new THREE.BoxGeometry(0.42, 0.28, 0.025).translate(0, 0.7, -0.2), 'chassis', [0.9, 0.5, 0.35]);
        for (const lx of [-0.19, 0.19]) put(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 6).translate(lx, 0.66, -0.2), 'chrome');
      }
      for (let i = 0; i < 3; i++) mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 14).translate(b.x0 + 0.3 + r() * (b.x1 - b.x0 - 0.6), top + 0.05, b.z0 + 0.2 + r() * (b.z1 - b.z0 - 0.4)), 'casing', on, up, i === 1 ? [0.3, 0.5, 0.9] : [0.95, 0.95, 0.92]);
      D.box('paper', b.x0 + 0.6, top, cz - 0.12, b.x0 + 0.9, top + 0.006, cz + 0.12, on, up, [0.6, 0.6, 0.58]);
    }
  }
  // South wall (solid, a window at x 11 to 12.5): skirting, a clock, a poster.
  const z = room.z1 - 0.15, n: V3 = [0, 0, -1], at = (x: number, y: number): V3 => [x, y, z - 0.001];
  D.box('trim', room.x0 + 0.12, 0.02, z - 0.016, room.x1 - 0.12, 0.11, z, at(9.5, 0.06), n);
  D.box('plastic', 9.3, 2.42, z - 0.04, 9.66, 2.78, z, at(9.48, 2.6), n);
  mesh(new THREE.PlaneGeometry(0.32, 0.32).rotateY(Math.PI).translate(9.48, 2.6, z - 0.041), 'clock', at(9.48, 2.6), n);
  D.box('handle', 13.2, 1.25, z - 0.012, 13.9, 2.15, z, at(13.55, 1.7), n);
  mesh(new THREE.PlaneGeometry(0.66, 0.86).rotateY(Math.PI).translate(13.55, 1.7, z - 0.013), 'sign', at(13.55, 1.7), n);
  // East wall: skirting either side of the kitchen run.
  const x = room.x1 - 0.15, en: V3 = [-1, 0, 0];
  D.box('trim', x - 0.016, 0.02, 4.5, x, 0.11, 8.8, [x - 0.001, 0.06, 6.5], en);
  // Map fill: counter clutter (a fruit bowl, a stack of cups, a dish rack), a pedal bin and a mat by the door.
  { const fl = (x: number, z: number): V3 => [x, 0.001, z], upF: V3 = [0, 1, 0], top = 0.95, on = (x: number, z: number): V3 => [x, top + 0.001, z];
    put(D, new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(14.55, top + 0.13, 1.8), 'casing', on(14.55, 1.8), upF, [0.9, 0.9, 0.88]);
    for (let i = 0; i < 4; i++) put(D, new THREE.SphereGeometry(0.04, 10, 8).translate(14.5 + (i % 2) * 0.08, top + 0.06, 1.76 + Math.floor(i / 2) * 0.08), 'casing', on(14.55, 1.8), upF, [[1.2, 0.3, 0.2], [1.1, 0.9, 0.2], [0.4, 0.9, 0.3]][i % 3] as V3);
    for (let i = 0; i < 4; i++) put(D, new THREE.CylinderGeometry(0.04, 0.034, 0.09, 12).translate(14.55, top + 0.045 + i * 0.07, 2.95), 'casing', on(14.55, 2.95), upF, [1.1, 1.1, 1.08]);
    put(D, new THREE.CylinderGeometry(0.15, 0.15, 0.4, 16, 1, true).translate(13.5, 0.2, 9.6), 'steel', fl(13.5, 9.6), upF, [0.8, 0.8, 0.8]);
    put(D, new THREE.CylinderGeometry(0.155, 0.155, 0.03, 16).translate(13.5, 0.41, 9.6), 'steel', fl(13.5, 9.6), upF, [0.8, 0.8, 0.8]);
    D.box('kick', 6.6 + 1.6, 0.003, 7.55, 9.0, 0.01, 8.1, [8.6, 0.001, 7.8], upF, [2.5, 2.2, 1.8]); }
  return D;
}

/** The Garage: the workbench's cabinetry, a roller-door housing and guide rails on the west opening, a pegboard of
 * tools and a wall shelf with cans and boxes on the north wall, skirting. The car and the drums are modelled props. */
function dressGarage(atlas: Atlas, room: Region): DetailBuilder {
  const D = new DetailBuilder(atlas);
  for (const b of MAP.boxes) {
    if (isSetPiece(b)) continue; // modelled in render/setpieces.ts, with its damage states
    if (b.mat === 'counter' && inRoom(room, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)) cabinetry(D, b.x0, b.z0, b.x1, b.z1, b.y1);
  }
  // West opening (z -7.5 to -4.5): a roller-door coil housing over it and guide rails down both sides.
  { const x = room.x0 + 0.15, n: V3 = [1, 0, 0], at = (z: number, y: number): V3 => [x + 0.001, y, z];
    D.box('steel', x, 2.32, -7.7, x + 0.32, 2.72, -4.3, at(-6, 2.8), n, [0.8, 0.82, 0.85]);
    for (const z of [-7.62, -4.38]) D.box('steel', x, 0, z - 0.04, x + 0.09, 2.32, z + 0.04, at(z < -6 ? -7.8 : -4.2, 1.2), n, [0.7, 0.7, 0.72]);
    D.box('alarm', x, 1.2, -4.05, x + 0.05, 1.32, -3.95, at(-4, 1.26), n);
    D.box('trim', x, 0.02, room.z0 + 0.12, x + 0.016, 0.11, -7.75, at(-9, 0.06), n);
    D.box('trim', x, 0.02, -4.25, x + 0.016, 0.11, room.z1 - 0.12, at(-3, 0.06), n); }
  // North wall: pegboard with tools east of the car, a shelf with cans and boxes west of the window.
  { const z = room.z0 + 0.15, n: V3 = [0, 0, 1], at = (x: number, y: number): V3 => [x, y, z + 0.001];
    D.box('cork', -8.0, 1.05, z, -6.4, 2.0, z + 0.018, at(-7.2, 1.5), n, [0.95, 0.85, 0.7]);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 9; j++) D.box('kick', -7.95 + i * 0.1, 1.1 + j * 0.1, z + 0.018, -7.94 + i * 0.1, 1.11 + j * 0.1, z + 0.019, at(-7.2, 1.5), n);
    const r = seeded(61);
    for (let i = 0; i < 9; i++) {
      const x = -7.85 + i * 0.16 + r() * 0.04, y = 1.2 + r() * 0.5, h = 0.18 + r() * 0.2;
      D.box(r() < 0.5 ? 'steel' : 'chassis', x, y, z + 0.02, x + 0.03, y + h, z + 0.035, at(x, y + h / 2), n, r() < 0.5 ? [1, 1, 1] : [6, 1.2, 1]);
      if (r() < 0.5) D.box('chassis', x - 0.03, y + h, z + 0.02, x + 0.06, y + h + 0.04, z + 0.035, at(x, y + h), n, [5, 1.2, 1]);
    }
    D.box('steel', -14.7, 1.6, z, -12.7, 1.63, z + 0.32, at(-13.7, 1.6), n, [0.7, 0.7, 0.7]);
    for (const x of [-14.5, -12.9]) D.box('steel', x - 0.015, 1.4, z, x + 0.015, 1.6, z + 0.25, at(x, 1.5), n, [0.6, 0.6, 0.6]);
    for (let i = 0; i < 5; i++) { const x = -14.6 + i * 0.38, w = 0.22 + r() * 0.1, h = 0.2 + r() * 0.15; D.box(i % 2 ? 'card' : 'chassis', x, 1.63, z + 0.04, x + w, 1.63 + h, z + 0.28, at(x + w / 2, 1.7), n, i % 2 ? [1, 1, 1] : [1.5, 2.5, 1.2]); }
    D.box('trim', -8.1, 0.02, z, room.x1 - 0.12, 0.11, z + 0.016, at(-7, 0.06), n); }
  // Map fill: tyres, a trolley jack, a coiled hose, oil stains, hanging lights, a creeper.
  { const fl = (x: number, z: number): V3 => [x, 0.001, z], upF: V3 = [0, 1, 0];
    for (const [x, z, k] of [[-14.4, -4.2, 0], [-14.4, -4.2, 1], [-14.4, -4.2, 2], [-13.7, -4.0, 0]] as const) put(D, new THREE.TorusGeometry(0.28, 0.1, 10, 22).rotateX(Math.PI / 2).translate(x, 0.1 + k * 0.2, z), 'chassis', fl(x, z), upF, [0.7, 0.7, 0.7]);
    put(D, new THREE.BoxGeometry(0.3, 0.12, 0.7).translate(-8.6, 0.08, -6.6), 'alarm', fl(-8.6, -6.6), upF, [1.4, 0.4, 0.3]);
    put(D, new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6).rotateX(-1.1).translate(-8.6, 0.3, -6.1), 'chrome', fl(-8.6, -6.6), upF);
    put(D, new THREE.TorusGeometry(0.25, 0.018, 6, 28).rotateX(Math.PI / 2).translate(-14.55, 0.03, -6.2), 'conduit', fl(-14.55, -6.2), upF, [0.3, 0.6, 0.3]);
    put(D, new THREE.TorusGeometry(0.2, 0.018, 6, 28).rotateX(Math.PI / 2).translate(-14.55, 0.06, -6.2), 'conduit', fl(-14.55, -6.2), upF, [0.3, 0.6, 0.3]);
    for (const [x, z, sx, sz] of [[-10.4, -6.9, 1.2, 0.8], [-11.6, -6.6, 0.5, 0.4], [-9.0, -4.5, 0.7, 0.5]] as const) put(D, new THREE.CircleGeometry(0.5, 18).rotateX(-Math.PI / 2).scale(sx, 1, sz).translate(x, 0.012, z), 'glass', fl(x, z), upF, [0.35, 0.33, 0.3]);
    for (const [x, z] of [[-12.2, -5.6], [-8.6, -5.6]] as const) {
      put(D, new THREE.CylinderGeometry(0.004, 0.004, 0.5, 4).translate(x, WALL_H - 0.25, z), 'chrome', [x, WALL_H - 0.001, z], [0, -1, 0]);
      put(D, new THREE.ConeGeometry(0.22, 0.18, 18, 1, true).translate(x, WALL_H - 0.58, z), 'steel', [x, WALL_H - 0.001, z], [0, -1, 0], [0.4, 0.45, 0.4]);
      put(D, new THREE.SphereGeometry(0.06, 10, 8).translate(x, WALL_H - 0.64, z), 'bulb', [x, WALL_H - 0.001, z], [0, -1, 0]);
    }
    put(D, new THREE.BoxGeometry(0.45, 0.04, 1.0).translate(-7.9, 0.09, -5.0), 'alarm', fl(-7.9, -5.0), upF, [0.25, 0.25, 0.3]);
    for (const [dx, dz] of [[-0.18, -0.4], [0.18, -0.4], [-0.18, 0.4], [0.18, 0.4]]) put(D, new THREE.SphereGeometry(0.035, 8, 6).translate(-7.9 + dx, 0.035, -5.0 + dz), 'chassis', fl(-7.9, -5.0), upF); }
  return D;
}

/** Shared small-mesh helper for the fill dressing: a geometry placed on the surface under (x, z) at height y. */
function put(D: DetailBuilder, g: THREE.BufferGeometry, key: DressKey, on: V3, n: V3, tint: V3 = [1, 1, 1]) { D.mesh(key, g.attributes.position.array, g.attributes.normal.array, g.index!.array, on, n, tint); g.dispose(); }

/** A rug on the floor (under the knee: dressing, never cover): a field, a border and a worn centre. */
function rug(D: DetailBuilder, x0: number, z0: number, x1: number, z1: number, field: V3, border: V3) {
  const on: V3 = [(x0 + x1) / 2, 0.001, (z0 + z1) / 2], up: V3 = [0, 1, 0];
  D.box('card', x0, 0.003, z0, x1, 0.009, z1, on, up, border);
  D.box('card', x0 + 0.12, 0.009, z0 + 0.12, x1 - 0.12, 0.012, z1 - 0.12, on, up, field);
}
/** A potted plant: a pot, soil and a loose clump of leaf blades (open and soft: dressing, not cover). */
function plant(D: DetailBuilder, x: number, z: number, h: number, seed: number) {
  const r = seeded(seed), fl: V3 = [x, 0.001, z], up: V3 = [0, 1, 0];
  const mesh = (g: THREE.BufferGeometry, key: DressKey, tint: V3) => { D.mesh(key, g.attributes.position.array, g.attributes.normal.array, g.index!.array, fl, up, tint); g.dispose(); };
  mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.42, 16).translate(x, 0.21, z), 'chassis', [2.4, 2.3, 2.2]);
  mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16).translate(x, 0.41, z), 'card', [0.35, 0.25, 0.18]);
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, lean = 0.25 + r() * 0.5, len = h * (0.5 + r() * 0.5);
    const g = new THREE.PlaneGeometry(0.07, len).translate(0, len / 2, 0).rotateX(-lean).rotateY(a).translate(x + Math.cos(a) * 0.05, 0.42, z + Math.sin(a) * 0.05);
    mesh(g, 'aid', [0.7 + r() * 0.5, 0.9 + r() * 0.4, 0.7]);
  }
}

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
