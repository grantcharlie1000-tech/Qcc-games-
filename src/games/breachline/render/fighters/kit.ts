/** The fighter's kit, modelled (not painted): helmet with rim, rails, shroud, chin strap and the squad's band and
 * shape patch; goggles or glasses; scarf; plate carrier with cummerbund, padded shoulder straps, PALS rows, three
 * magazine pouches with magazines, admin pouch, radio with a bent whip antenna and drag handle; belt with buckle,
 * pouches and a thigh holster with its pistol; shoulder pockets carrying the squad patch; knee pads; boots with
 * soles, toe caps and laces. Rigid parts hang on one bone each; soft goods that wrap a joint are lofts with smooth
 * weights. All coordinates are the bind pose in model space. */
import * as THREE from 'three';
import { Builder, surf } from '../hero/geom';
import { chain, frame, loft, section, table, type Ring } from './loft';
import { B, JOINT, SIDE, armDir, armOut, sgn } from './skeleton';
import type { Look } from './look';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ss = THREE.MathUtils.smoothstep;

/** Places a geometry (authored with depth along +Z, up +Y) at `at`, facing `normal`, with `up` as its up. */
function orient(g: THREE.BufferGeometry, at: THREE.Vector3, normal: THREE.Vector3, up: THREE.Vector3) {
  const z = normal.clone().normalize(), x = new THREE.Vector3().crossVectors(up, z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(at));
  return g;
}

/** A chamfered box (44 triangles; 12 below full detail): flat faces, and chamfers whose normals turn from one face
 * to the next, so edges catch light and take the wear shader's edge wear. Centred at the origin, depth along Z. */
export function cbox(size: readonly [number, number, number], c: number, lod = 0): THREE.BufferGeometry {
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  if (lod >= 1) { const g = new THREE.BoxGeometry(size[0], size[1], size[2]); g.deleteAttribute('uv'); return g; }
  c = Math.min(c, hx * 0.45, hy * 0.45, hz * 0.45);
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const vid = (sx: number, sy: number, sz: number, axis: number) => ((((sx > 0 ? 1 : 0) * 2 + (sy > 0 ? 1 : 0)) * 2 + (sz > 0 ? 1 : 0)) * 3 + axis);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) for (let axis = 0; axis < 3; axis++) {
    pos.push(sx * (axis === 0 ? hx : hx - c), sy * (axis === 1 ? hy : hy - c), sz * (axis === 2 ? hz : hz - c));
    nor.push(axis === 0 ? sx : 0, axis === 1 ? sy : 0, axis === 2 ? sz : 0);
  }
  const tri = (a: number, b: number, d: number) => {
    const A = new THREE.Vector3().fromArray(pos, a * 3), Bv = new THREE.Vector3().fromArray(pos, b * 3), D = new THREE.Vector3().fromArray(pos, d * 3);
    const n = new THREE.Vector3().subVectors(Bv, A).cross(new THREE.Vector3().subVectors(D, A)), m = A.add(Bv).add(D);
    if (n.dot(m) < 0) idx.push(a, d, b); else idx.push(a, b, d);
  };
  const quad = (a: number, b: number, d: number, e: number) => { tri(a, b, d); tri(a, d, e); };
  const S = [-1, 1];
  // Faces.
  for (const s of S) {
    quad(vid(s, -1, -1, 0), vid(s, 1, -1, 0), vid(s, 1, 1, 0), vid(s, -1, 1, 0));
    quad(vid(-1, s, -1, 1), vid(1, s, -1, 1), vid(1, s, 1, 1), vid(-1, s, 1, 1));
    quad(vid(-1, -1, s, 2), vid(1, -1, s, 2), vid(1, 1, s, 2), vid(-1, 1, s, 2));
  }
  // Chamfer strips along the twelve edges.
  for (const a of S) for (const b of S) {
    quad(vid(a, b, -1, 0), vid(a, b, 1, 0), vid(a, b, 1, 1), vid(a, b, -1, 1));
    quad(vid(a, -1, b, 0), vid(a, 1, b, 0), vid(a, 1, b, 2), vid(a, -1, b, 2));
    quad(vid(-1, a, b, 1), vid(1, a, b, 1), vid(1, a, b, 2), vid(-1, a, b, 2));
  }
  // Corners.
  for (const sx of S) for (const sy of S) for (const sz of S) tri(vid(sx, sy, sz, 0), vid(sx, sy, sz, 1), vid(sx, sy, sz, 2));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** An indexed grid from rows of points (each row a closed loop of the same length). */
function grid(rows: THREE.Vector3[][], closed = true, capFirst = false): THREE.BufferGeometry {
  const n = rows[0].length, pos: number[] = [], idx: number[] = [];
  for (const r of rows) for (const p of r) pos.push(p.x, p.y, p.z);
  const m = closed ? n : n - 1;
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < m; j++) {
    const a = i * n + j, b = i * n + (j + 1) % n, c = a + n, d = b + n;
    idx.push(a, b, c, b, d, c);
  }
  if (capFirst) {
    const c = pos.length / 3, p0 = rows[0].reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / n);
    pos.push(p0.x, p0.y, p0.z);
    for (let j = 0; j < n; j++) idx.push(c, (j + 1) % n, j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** The squad's shape (◆ or ▲) as a flat extrusion, size `s` metres, facing +Z. */
function shapeGeo(squad: 0 | 1, s: number, depth: number) {
  const sh = new THREE.Shape();
  if (squad === 0) { sh.moveTo(0, s); sh.lineTo(s * 0.78, 0); sh.lineTo(0, -s); sh.lineTo(-s * 0.78, 0); }
  else { sh.moveTo(0, s * 0.95); sh.lineTo(s * 0.95, -s * 0.72); sh.lineTo(-s * 0.95, -s * 0.72); }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 1 });
  g.deleteAttribute('uv');
  return g;
}

/** A patch: a dark backing plate with a raised squad shape in the squad colour (shape plus colour, never colour
 * alone). */
function patch(b: Builder, l: Look, lod: number, at: THREE.Vector3, normal: THREE.Vector3, up: THREE.Vector3, size: number) {
  orient(b.add(cbox([size * 2.3, size * 2.3, 0.004], 0.0015, lod).translate(0, 0, 0.002), l.web), at, normal, up);
  orient(b.add(shapeGeo(l.squad, size, 0.003), surf(l.web, { color: l.band, rough: 0.6, wear: 0 })), at.clone().addScaledVector(normal.clone().normalize(), 0.004), normal, up);
}

// ---- Helmet -------------------------------------------------------------------------------------------------------

const HC = V(0, 1.664, 0.006), HR = V(0.104, 0.116, 0.126);
/** Point on the helmet's outer shell at azimuth `az` (0 front, +pi/2 right) and polar angle `th`, pushed out by `o`. */
function shell(az: number, th: number, o = 0) {
  const d = V(Math.sin(th) * Math.sin(az), Math.cos(th), -Math.sin(th) * Math.cos(az));
  const p = V(HC.x + HR.x * d.x, HC.y + HR.y * d.y, HC.z + HR.z * d.z);
  if (o) { const n = V(d.x / HR.x, d.y / HR.y, d.z / HR.z).normalize(); p.addScaledVector(n, o); }
  return p;
}
/** Polar angle of the rim at azimuth `az`: brow at the front, cut high over the ears, low at the nape. */
function rimTh(az: number) {
  const c = Math.cos(az), y = 1.664 + 0.01 * Math.max(0, c) - 0.058 * Math.pow(Math.max(0, -c), 0.8) - 0.008 * Math.pow(Math.sin(az), 2);
  return Math.acos(THREE.MathUtils.clamp((y - HC.y) / HR.y, -1, 1));
}

function helmet(b: Builder, l: Look, lod: number) {
  b.bone = B.head;
  const seg = [22, 14, 8][lod], rows = [5, 3, 2][lod], outer: THREE.Vector3[][] = [];
  for (let i = 0; i <= rows; i++) {
    const t = 0.06 + 0.94 * Math.pow(i / rows, 0.85), row: THREE.Vector3[] = [];
    for (let j = 0; j < seg; j++) { const az = (j / seg) * Math.PI * 2; row.push(shell(az, rimTh(az) * t)); }
    outer.push(row);
  }
  // Rim: a rolled edge (trim) and the inside of the shell.
  const rimRow = (o: number, dy: number, th = 1) => { const row: THREE.Vector3[] = []; for (let j = 0; j < seg; j++) { const az = (j / seg) * Math.PI * 2; row.push(shell(az, rimTh(az) * th, o).add(V(0, dy, 0))); } return row; };
  const shellRows = lod < 2 ? [...outer, rimRow(0.002, -0.002), rimRow(-0.006, -0.004), rimRow(-0.011, 0.0, 0.97), rimRow(-0.012, 0, 0.7)] : [...outer, rimRow(-0.008, -0.003)];
  b.add(grid(shellRows, true, true), l.helmet);
  // Trim band along the rim, slightly proud, in rubber.
  if (lod < 2) b.add(grid([rimRow(0.0035, 0.008), rimRow(0.004, 0.0), rimRow(0.0035, -0.004)]), l.rubber);
  // Squad band round the crown (an elastic cover band), part of the helmet's identity at any range.
  b.add(grid([[0.62, 0.0018], [0.62, 0.0045], [0.5, 0.0045], [0.5, 0.0018]].map(([t, o]) => { const row: THREE.Vector3[] = []; for (let j = 0; j < seg; j++) { const az = (j / seg) * Math.PI * 2; row.push(shell(az, rimTh(az) * t, o)); } return row; })), surf(l.web, { color: l.band, rough: 0.65 }));
  // Side rails over the ear cut, with end stops.
  for (const g of [-1, 1]) {
    const pts: [number, number, number][] = [];
    for (let k = 0; k <= 6; k++) { const az = g * (Math.PI / 2 + (k / 6 - 0.5) * 1.2), p = shell(az, rimTh(az) * 0.9, 0.006); pts.push([p.x, p.y, p.z]); }
    if (lod < 2) b.tube(pts, 0.0055, l.poly, 6, 4);
  }
  // Front shroud for a night-vision mount.
  const sp = shell(0, rimTh(0) * 0.62, 0.008), sn = shell(0, rimTh(0) * 0.62, 1).sub(shell(0, rimTh(0) * 0.62)).normalize();
  if (lod < 2) orient(b.add(cbox([0.052, 0.034, 0.012], 0.003, lod), l.metal), sp, sn, V(0, 1, 0.3));
  // Hook-and-loop panel on top and the squad shape patch at the back.
  if (lod < 2) orient(b.add(cbox([0.07, 0.05, 0.004], 0.002, lod), surf(l.helmet, { color: 0x2b2b2b, rough: 0.95, pat: 3 })), shell(0, 0.28, 0.002), V(0, 1, -0.25), V(0, 0.2, -1));
  const bp = shell(Math.PI, rimTh(Math.PI) * 0.6, 0.002), bn = shell(Math.PI, rimTh(Math.PI) * 0.6, 1).sub(shell(Math.PI, rimTh(Math.PI) * 0.6)).normalize();
  patch(b, l, lod, bp, bn, V(0, 1, 0), 0.022);
  // Chin strap: from inside the rim in front of each ear, along the jaw to a cup under the chin; and a nape strap.
  if (lod < 2) {
    for (const g of [-1, 1]) {
      b.tube([[g * 0.083, 1.66, -0.03], [g * 0.075, 1.6, -0.04], [g * 0.055, 1.56, -0.055], [g * 0.028, 1.522, -0.072]], 0.0035, l.web, 5, 3);
      if (lod === 0) b.tube([[g * 0.086, 1.655, 0.03], [g * 0.07, 1.6, 0.045], [g * 0.04, 1.565, 0.06]], 0.0035, l.web, 4, 3);
    }
    orient(b.add(cbox([0.04, 0.026, 0.012], 0.005, lod), l.web), V(0, 1.514, -0.074), V(0, -0.6, -1), V(0, 1, 0));
  }
}

// ---- Eyes and face -------------------------------------------------------------------------------------------------

function goggles(b: Builder, l: Look, lod: number) {
  b.bone = B.head;
  const R = 0.106, c = V(0, 1.627, -0.005), n = [12, 8, 5][lod], frameRows: THREE.Vector3[][] = [], lens: THREE.Vector3[][] = [];
  const at = (az: number, y: number, r: number) => V(c.x + Math.sin(az) * r, c.y + y, c.z - Math.cos(az) * r * 1.0);
  // The frame: a soft rounded band, deeper at the sides; the lens a curved sheet set into it.
  for (const [y, r] of [[0.03, R - 0.015], [0.032, R], [0.022, R + 0.006], [-0.019, R + 0.006], [-0.028, R], [-0.026, R - 0.015]] as const) {
    const row: THREE.Vector3[] = [];
    for (let k = 0; k <= n; k++) { const az = -1.05 + 2.1 * k / n, sag = 0.006 * Math.cos(az * 2.2); row.push(at(az, y + (y > 0 ? sag : -sag * 0.4) - Math.abs(az) * 0.004 * Math.sign(y), r)); }
    frameRows.push(row);
  }
  b.add(grid(frameRows, false), l.poly);
  for (const y of [0.021, -0.017]) { const row: THREE.Vector3[] = []; for (let k = 0; k <= n; k++) { const az = -0.92 + 1.84 * k / n; row.push(at(az, y + (y > 0 ? 0.004 : -0.002) * Math.cos(az * 2), R + 0.008)); } lens.push(row); }
  b.add(grid(lens, false), l.lens);
  // Strap round the helmet.
  const pts: [number, number, number][] = [];
  for (let k = 0; k <= 10; k++) { const az = 1.0 + (2 * Math.PI - 2.0) * k / 10, p = shell(az, rimTh(az) * 0.94, 0.004); pts.push([p.x, p.y, p.z]); }
  b.tube(pts, 0.0065, surf(l.web, { color: 0x1b1c1d }), [8, 6, 4][lod], 3);
}

function glasses(b: Builder, l: Look, lod: number) {
  b.bone = B.head;
  const c = V(0, 1.626, -0.004), R = 0.104, n = [8, 6, 4][lod];
  const at = (az: number, y: number, r: number) => V(c.x + Math.sin(az) * r, c.y + y, c.z - Math.cos(az) * r);
  const lens: THREE.Vector3[][] = [];
  for (const y of [0.018, -0.014]) { const row: THREE.Vector3[] = []; for (let k = 0; k <= n; k++) { const az = -0.85 + 1.7 * k / n; row.push(at(az, y * (1 - 0.25 * Math.pow(Math.abs(az) / 0.85, 2)) - (Math.abs(az) < 0.12 ? (y < 0 ? -0.006 : 0) : 0), R)); } lens.push(row); }
  b.add(grid(lens, false), l.lens);
  const top: [number, number, number][] = [];
  for (let k = 0; k <= n; k++) { const az = -0.88 + 1.76 * k / n, p = at(az, 0.019, R + 0.001); top.push([p.x, p.y, p.z]); }
  b.tube(top, 0.0028, l.poly, n, 3);
  for (const g of [-1, 1]) b.tube([[g * 0.085, 1.645, -0.062], [g * 0.09, 1.642, -0.02], [g * 0.085, 1.632, 0.012]], 0.0025, l.poly, 3, 3);
}

/** The scarf: wrapped round the neck and pulled over the mouth and nose, with loose folds. */
function scarf(b: Builder, l: Look, lod: number) {
  const nr = [6, 4, 3][lod], seg = [16, 12, 7][lod], rings: Ring[] = [];
  for (let i = 0; i < nr; i++) {
    const t = i / (nr - 1), y = 1.425 + t * 0.165;
    // Wide round the collar, snug under the jaw, up over the chin and mouth at the front.
    const w = 0.084 - 0.02 * Math.sin(t * Math.PI * 0.9) + 0.004, f = 0.075 + 0.04 * t, bk = 0.078 - 0.012 * t, zc = 0.004 - 0.032 * t;
    rings.push({ c: V(0, y, zc), u: V(1, 0, 0), v: V(0, 0, -1), at: section(w, w, f, bk, 2, a => 0.05 * Math.sin(a * 5 + t * 7) * Math.sin(t * Math.PI) + 0.03 * Math.sin(a * 9 + 1.7)) });
  }
  b.addTagged(loft(rings, { seg, weight: p => chain([[B.spine2, 1.42], [B.neck, 1.47], [B.head, 1.56]], p.y) }), [l.scarf]);
  // A loose tail at the back.
  b.bone = B.spine2;
  b.tube([[0.02, 1.47, 0.07], [0.035, 1.4, 0.1], [0.03, 1.33, 0.115]], 0.016, l.scarf, 4, 5);
}

// ---- Plate carrier -----------------------------------------------------------------------------------------------

/** Torso rows, as in body.ts, for kit that wraps it: y, half-width, front, back. */
const T = [[0.94, 0.172, 0.1, 0.118], [1.0, 0.163, 0.1, 0.105], [1.06, 0.152, 0.098, 0.094], [1.12, 0.156, 0.104, 0.096], [1.19, 0.166, 0.115, 0.102], [1.26, 0.176, 0.124, 0.108]] as const;

function band(y0: number, y1: number, out: number, seg: number, weight: (p: THREE.Vector3) => [number, number][]) {
  const rings: Ring[] = [];
  const at = (y: number, o: number): Ring => { const [w, f, bk] = table(T, y); return { c: V(0, y, -0.012 * Math.sin((y - 0.8) / 0.7 * Math.PI)), u: V(1, 0, 0), v: V(0, 0, -1), at: section(w + o, w + o, f + o, bk + o, 2.8) }; };
  rings.push(at(y0 + 0.004, out - 0.008), at(y0, out), at(y1, out), at(y1 - 0.004, out - 0.008));
  return loft(rings, { seg, weight });
}

function carrier(b: Builder, l: Look, lod: number) {
  const seg = [22, 14, 8][lod];
  // Cummerbund round the waist and ribs.
  b.addTagged(band(1.075, 1.215, 0.016, seg, p => chain([[B.spine1, 1.09], [B.spine2, 1.2]], p.y)), [l.kit]);
  b.bone = B.spine2;
  // Plate bags: front tilted with the chest, back flatter; edges bound with tape.
  const front = b.add(cbox([0.27, 0.315, 0.05], 0.012, lod), l.kit); front.rotateX(0.06); front.translate(0, 1.245, -0.152);
  const back = b.add(cbox([0.275, 0.34, 0.045], 0.012, lod), l.kit); back.rotateX(-0.08); back.translate(0, 1.255, 0.14);
  // Padded shoulder straps over the trapezius, front plate to back plate.
  for (const g of [-1, 1]) {
    const pts = [V(g * 0.085, 1.39, -0.165), V(g * 0.1, 1.45, -0.09), V(g * 0.108, 1.475, 0.0), V(g * 0.098, 1.445, 0.085), V(g * 0.085, 1.41, 0.15)];
    const curve = new THREE.CatmullRomCurve3(pts), n = [6, 4, 2][lod], rings: Ring[] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, c = curve.getPoint(t), d = curve.getTangent(t);
      const F = frame(c, d, V(g * 0.4, 1, 0));
      rings.push({ ...F, at: section(0.028, 0.028, 0.009, 0.004, 3.5) });
    }
    b.addTagged(loft(rings, { seg: [8, 6, 4][lod], capStart: true, capEnd: true, weight: p => (p.y > 1.43 ? [[B.spine2, 0.6], [SIDE[g > 0 ? 1 : 0].clav, 0.4]] : [[B.spine2, 1]]) }), [l.kit]);
  }
  b.bone = B.spine2;
  // PALS rows: 25 mm webbing stitched every 38 mm, across the upper front and the back.
  if (lod < 2) {
    const rowPts = (z: number, y: number, tilt: number, cols: number) => { for (let c = 0; c < cols; c++) { const x = (c - (cols - 1) / 2) * 0.038; const g = b.add(cbox([0.034, 0.024, 0.004], 0, 2), l.web); g.rotateX(tilt); g.translate(x, y, z); } };
    for (const y of [1.355]) rowPts(-0.18 + (y - 1.245) * 0.06, y, 0.06, 6);
    for (const y of [1.36, 1.33]) rowPts(0.164 - (y - 1.255) * 0.08, y, -0.08, 6);
  }
  // Admin pouch high on the front, with a hook-and-loop name strip.
  orient(b.add(cbox([0.15, 0.095, 0.03], 0.008, lod), l.kit), V(0, 1.305, -0.19), V(0, 0.06, -1), V(0, 1, 0));
  // Three magazine pouches with the magazines' base plates and bungee loops showing.
  for (let k = -1; k <= 1; k++) {
    const x = k * 0.083;
    orient(b.add(cbox([0.078, 0.12, 0.045], 0.008, lod), l.kit), V(x, 1.16, -0.2), V(0, 0.04, -1), V(0, 1, 0));
    orient(b.add(cbox([0.062, 0.05, 0.026], 0.004, lod), l.poly), V(x, 1.235, -0.197), V(0, 0.04, -1), V(0, 1, 0.05));
    if (lod === 0) b.tube([[x - 0.03, 1.212, -0.224], [x, 1.262, -0.212], [x + 0.03, 1.212, -0.224]], 0.0028, surf(l.poly, { color: 0x111111 }), 4, 3);
  }
  // Radio pouch on the back left, radio with a bent whip antenna; drag handle at the top of the back.
  orient(b.add(cbox([0.075, 0.16, 0.05], 0.008, lod), l.kit), V(-0.085, 1.21, 0.192), V(0, 0, 1), V(0, 1, 0));
  orient(b.add(cbox([0.06, 0.04, 0.035], 0.004, lod), l.poly), V(-0.085, 1.3, 0.19), V(0, 0, 1), V(0, 1, 0));
  if (lod < 2) b.cyl(0.006, 0.03, 'y', [-0.098, 1.33, 0.19], l.poly, 6);
  b.tube([[-0.098, 1.34, 0.19], [-0.103, 1.48, 0.205], [-0.112, 1.6, 0.235], [-0.125, 1.68, 0.29]], 0.0028, l.poly, [8, 5, 3][lod], 3);
  if (lod < 2) b.tube([[-0.05, 1.37, 0.165], [-0.04, 1.405, 0.18], [0.04, 1.405, 0.18], [0.05, 1.37, 0.165]], 0.008, l.web, 6, 4);
  // A hydration bladder flat on the back.
  orient(b.add(cbox([0.17, 0.2, 0.025], 0.01, lod), l.kit), V(0.04, 1.2, 0.18), V(0, -0.05, 1), V(0, 1, 0));
  // Grenade pouch on the right side of the cummerbund.
  b.bone = B.spine1;
  b.cyl(0.032, 0.085, 'y', [0.178, 1.13, -0.02], l.kit, [8, 6, 4][lod]);
  if (lod < 2) b.cyl(0.034, 0.012, 'y', [0.178, 1.178, -0.02], l.web, 8);
}

// ---- Belt, holster -------------------------------------------------------------------------------------------------

function belt(b: Builder, l: Look, lod: number) {
  const seg = [22, 14, 8][lod];
  b.addTagged(band(0.975, 1.03, 0.014, seg, () => [[B.pelvis, 1]]), [l.web]);
  b.bone = B.pelvis;
  orient(b.add(cbox([0.06, 0.045, 0.012], 0.003, lod), l.metal), V(0, 1.0, -0.12), V(0, 0, -1), V(0, 1, 0));
  // Dump pouch at the back, two utility pouches on the left front.
  orient(b.add(cbox([0.15, 0.1, 0.05], 0.015, lod), l.kit), V(0, 0.955, 0.14), V(0, 0, 1), V(0, 1, 0));
  for (const x of [-0.12, -0.165]) orient(b.add(cbox([0.055, 0.085, 0.038], 0.008, lod), l.kit), V(x, 0.975, -0.075 - (x + 0.12) * 1.2), V(x * 2, 0, -1), V(0, 1, 0));
  // Thigh holster on the firing side, with the pistol's grip and a leg strap.
  b.bone = B.thighR;
  orient(b.add(cbox([0.04, 0.18, 0.06], 0.008, lod), l.poly), V(0.17, 0.79, -0.005), V(1, 0, 0), V(0, 1, 0.08));
  orient(b.add(cbox([0.03, 0.08, 0.034], 0.004, lod), l.poly), V(0.17, 0.89, 0.005), V(1, 0, 0), V(0, 1, -0.3));
  if (lod < 2) b.tube([[0.16, 0.965, 0.0], [0.167, 0.9, 0.0]], 0.012, l.web, 2, 4);
  if (lod < 2) b.addTagged(legRing(0.735, 0.012, 0.022, lod, () => [[B.thighR, 1]]), [l.web]);
}

/** Leg rows: y, inner, outer, front, back (as body.ts). */
const L = [[0.1, 0.046, 0.046, 0.046, 0.05], [0.17, 0.05, 0.05, 0.048, 0.054], [0.24, 0.054, 0.054, 0.05, 0.062], [0.31, 0.058, 0.058, 0.054, 0.07], [0.38, 0.06, 0.06, 0.056, 0.073], [0.44, 0.057, 0.059, 0.06, 0.064], [0.5, 0.058, 0.061, 0.068, 0.058], [0.56, 0.06, 0.066, 0.068, 0.064], [0.64, 0.066, 0.074, 0.076, 0.072], [0.74, 0.073, 0.083, 0.083, 0.083], [0.84, 0.078, 0.091, 0.088, 0.098]] as const;
function legAxis(s: number, y: number) {
  const S = SIDE[s], hip = JOINT[S.thigh], knee = JOINT[S.shin], ankle = JOINT[S.foot];
  return y > knee.y ? hip.clone().lerp(knee, (hip.y - y) / (hip.y - knee.y)) : knee.clone().lerp(ankle, (knee.y - y) / (knee.y - ankle.y));
}
/** A strap or band round the leg at height `y`, on `side` (0 left, 1 right). */
function legRing(y: number, out: number, h: number, lod: number, weight: (p: THREE.Vector3) => [number, number][], side = 1) {
  const s = side, g = sgn(s), rings: Ring[] = [];
  const at = (yy: number, o: number): Ring => {
    const c = legAxis(s, yy), d = legAxis(s, yy - 0.01).sub(legAxis(s, yy + 0.01)).normalize(), F = frame(c, d, V(0, 0, -1)), [inner, outer, front, back] = table(L, yy);
    const os = F.u.x * g > 0;
    return { ...F, at: section((os ? outer : inner) + o, (os ? inner : outer) + o, front + o, back + o, 2.2) };
  };
  rings.push(at(y + h / 2 - 0.002, out - 0.006), at(y + h / 2, out), at(y - h / 2, out), at(y - h / 2 + 0.002, out - 0.006));
  return loft(rings, { seg: [12, 9, 6][lod], weight });
}

// ---- Arms: shoulder pockets with the squad patch, elbow pads -------------------------------------------------------

function sleeves(b: Builder, l: Look, lod: number) {
  for (const s of [0, 1]) {
    const S = SIDE[s], d = armDir(s), out = armOut(s);
    b.bone = S.upper;
    const at = JOINT[S.upper].clone().addScaledVector(d, 0.105).addScaledVector(out, 0.058);
    orient(b.add(cbox([0.068, 0.085, 0.012], 0.005, lod), l.shirt), at, out, d.clone().negate());
    patch(b, l, lod, at.clone().addScaledVector(out, 0.006), out, d.clone().negate(), 0.019);
    if (lod < 2) {
      // Elbow pad on the elbow helper, so it follows the joint.
      b.bone = S.elbow;
      const back = V(0, 0, 1).addScaledVector(d, -d.z).normalize(), ep = JOINT[S.fore].clone().addScaledVector(back, 0.04);
      b.sphere(0.036, [ep.x, ep.y, ep.z], surf(l.kit, { color: 0x2a2b2c }), 7, [0.9, 1, 0.32]);
    }
  }
}

// ---- Knees and boots -------------------------------------------------------------------------------------------------

function knees(b: Builder, l: Look, lod: number) {
  for (const s of [0, 1]) {
    const S = SIDE[s], k = JOINT[S.shin];
    b.bone = S.knee;
    if (lod < 2) b.sphere(0.06, [k.x, k.y - 0.005, k.z - 0.062], l.kit, [7, 5, 4][lod], [0.95, 1.05, 0.45]);
    b.sphere(0.05, [k.x, k.y, k.z - 0.08], l.rubber, [8, 6, 4][lod], [0.95, 1.1, 0.42]);
    if (lod < 2) b.addTagged(legRing(0.565, 0.008, 0.022, lod, () => [[S.thigh, 0.5], [S.knee, 0.5]], s), [l.web]);
    if (lod < 2) b.addTagged(legRing(0.425, 0.008, 0.022, lod, () => [[S.shin, 0.6], [S.knee, 0.4]], s), [l.web]);
  }
}

/** Boot foot rows: z, half-width, bottom y, top y. */
const FOOT = [[0.088, 0.03, 0.02, 0.07], [0.075, 0.043, 0.014, 0.11], [0.04, 0.05, 0.012, 0.135], [0.0, 0.051, 0.012, 0.13], [-0.045, 0.053, 0.012, 0.1], [-0.095, 0.054, 0.012, 0.075], [-0.14, 0.05, 0.013, 0.06], [-0.175, 0.042, 0.015, 0.05], [-0.195, 0.026, 0.02, 0.04]] as const;

function boots(b: Builder, l: Look, lod: number) {
  const toeCap = surf(l.boot, { color: 0x1a1a1a, rough: 0.6 });
  for (const s of [0, 1]) {
    const S = SIDE[s], x = JOINT[S.foot].x;
    // Shaft round the ankle, from the shin into the foot.
    const shaft: Ring[] = [];
    for (const y of [0.245, 0.235, 0.2, 0.15, 0.1]) {
      const c = legAxis(s, y), F = frame(c, V(0, -1, 0), V(0, 0, -1)), [inner, , front, back] = table(L, y);
      const o = y > 0.24 ? 0.003 : 0.01;
      shaft.push({ ...F, at: section(inner + o, inner + o, front + o + (y < 0.16 ? 0.012 : 0), back + o, 2.2) });
    }
    b.addTagged(loft(shaft, { seg: [12, 8, 5][lod], weight: p => chain([[S.foot, 0.12], [S.shin, 0.2]], p.y) }), [l.boot]);
    // The foot: heel to toe, flat soled.
    const rings: Ring[] = [];
    const nz = [7, 5, 3][lod];
    for (let i = 0; i < nz; i++) {
      const z = FOOT[0][0] + (FOOT[FOOT.length - 1][0] - FOOT[0][0]) * i / (nz - 1), [w, y0, y1] = footRow(z);
      rings.push({ c: V(x, (y0 + y1) / 2, z), u: V(1, 0, 0), v: V(0, 1, 0), at: section(w, w, (y1 - y0) / 2, (y1 - y0) / 2, 3) });
    }
    b.addTagged(loft(rings, { seg: [10, 8, 5][lod], capStart: true, capEnd: true, weight: p => chain([[S.foot, 0.06], [S.toe, 0.13]], -p.z), tag: p => (p.z < -0.15 ? 1 : 0) }), [l.boot, toeCap]);
    // Sole: lugged rubber, split at the ball of the foot so the toe can bend.
    const outline = (z0: number, z1: number) => { const pts: [number, number][] = []; const n = [5, 3, 2][lod]; for (let k = 0; k <= n; k++) { const z = z0 + (z1 - z0) * k / n; pts.push([x + footRow(z)[0] + 0.006, z]); } for (let k = n; k >= 0; k--) { const z = z0 + (z1 - z0) * k / n; pts.push([x - footRow(z)[0] - 0.006, z]); } return pts; };
    if (lod < 2) { b.bone = S.foot; b.slab(outline(0.092, -0.1), 0, 0.024, l.rubber, 0); b.bone = S.toe; b.slab(outline(-0.1, -0.2), 0.002, 0.026, l.rubber, 0); }
    // Laces: a criss-cross up the instep.
    if (lod === 0) {
      b.bone = S.foot;
      const pts: [number, number, number][] = [];
      for (let k = 0; k < 6; k++) { const z = -0.075 + k * 0.022, y = 0.083 + k * 0.012; pts.push([x + (k % 2 ? 0.018 : -0.018), y, z - 0.03 - 0.015 * (5 - k) / 5]); }
      b.tube(pts, 0.0025, surf(l.web, { color: 0x151515 }), 10, 3);
    }
  }
}
function footRow(z: number): [number, number, number] {
  const rows = FOOT.map(r => [-r[0], r[1], r[2], r[3]] as const);
  const [w, y0, y1] = table(rows, -z);
  return [w, y0, y1];
}

/** Builds every piece of kit into `b` for the given look and level of detail. */
export function buildKit(b: Builder, l: Look, lod: number) {
  b.tag = 'helmet'; helmet(b, l, lod);
  if (l.eyes === 'goggles') goggles(b, l, lod); else { b.tag = 'glasses'; glasses(b, l, lod); }
  if (l.mask === 'scarf') { b.tag = 'scarf'; scarf(b, l, lod); }
  b.tag = 'carrier'; carrier(b, l, lod);
  b.tag = 'belt'; belt(b, l, lod);
  b.tag = 'sleeves'; sleeves(b, l, lod);
  b.tag = 'knees'; knees(b, l, lod);
  b.tag = 'boots'; boots(b, l, lod);
  void ss;
}
