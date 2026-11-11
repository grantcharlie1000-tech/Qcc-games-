/** Bakes a fighter variant's texture sets (run with `npx vite-node scripts/breachline-assets/fighters/bake.ts`).
 *
 * For each level of detail: builds the same mesh the game builds (render/fighters/figure.ts), unwraps it
 * (unwrap.ts), rasterises every triangle into the atlas, and for each texel evaluates a high-detail surface that is too
 * fine for triangles: cloth folds at elbows, knees, the waist and behind the knee; seams with stitch rows; ripstop
 * grid; Cordura twill and stitched binding tape on kit; webbing ribs; sole tread; leather pebble; helmet-cover
 * wrinkles. The tangent-space normal comes from that height sampled along the texel's tangent frame; occlusion from 64
 * rays per texel against the mesh (three-mesh-bvh; arms and body occlude only themselves, as in play they are apart);
 * albedo, roughness and metalness are painted in layers from those masks. Writes, per level, KTX2 sets (`diff`, `nor`,
 * `arm`: occlusion, roughness, metalness) and the UV data the runtime applies to its own mesh
 * (`public/game-art/breachline/fighters/<variant>/`), plus PNG previews for the evidence.
 *
 * KTX2 encoding mirrors the settings of scripts/breachline-assets/build.mjs (not exported there). */
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { heroReady } from '../../../src/games/breachline/render/hero/geom';
import { figureGeometry } from '../../../src/games/breachline/render/fighters/figure';
import { LOOKS, type Look } from '../../../src/games/breachline/render/fighters/look';
import { B, JOINT, SIDE } from '../../../src/games/breachline/render/fighters/skeleton';
import { FIGHTER_SETS, type FighterSetMeta } from '../../../src/games/breachline/render/fighters/sets';
import { unwrap } from './unwrap';

const ROOT = join(import.meta.dirname ?? '.', '..', '..', '..');
const OUT = join(ROOT, 'public', 'game-art', 'breachline', 'fighters');
const PREVIEW = join(ROOT, 'scripts', 'breachline-assets', '.cache', 'fighters');
const AO_RAYS = Number(process.env.AO_RAYS ?? 64);

// ---- Noise -------------------------------------------------------------------------------------------------------
const hh = (x: number, y: number, z: number) => { let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
function vn(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(hh(ix, iy, iz), hh(ix + 1, iy, iz), u), l(hh(ix, iy + 1, iz), hh(ix + 1, iy + 1, iz), u), v), l(l(hh(ix, iy, iz + 1), hh(ix + 1, iy, iz + 1), u), l(hh(ix, iy + 1, iz + 1), hh(ix + 1, iy + 1, iz + 1), u), v), w);
}
const fbm = (x: number, y: number, z: number, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vn(x * f + i * 17.3, y * f - i * 9.1, z * f + i * 3.7); f *= 2.03; a *= 0.5; } return s; };
const ss = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const line = (x: number, period: number, width: number) => { const d = Math.abs(((x / period) % 1 + 1) % 1 - 0.5) * period; return 1 - ss(0, width, period / 2 - d); };

// ---- Surface classes ---------------------------------------------------------------------------------------------
const C = { uniform: 0, kit: 1, web: 2, helmet: 3, poly: 4, rubber: 5, metal: 6, boot: 7, skin: 8, glove: 9, face: 10, lens: 11, other: 12 } as const;
type Cls = typeof C[keyof typeof C];
function classes(l: Look): [number, Cls][] {
  const lin = (hex: number) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  const list: [number, Cls][] = [[l.shirt.color, C.uniform], [l.pants.color, C.uniform], [l.kit.color, C.kit], [l.web.color, C.web], [l.helmet.color, C.helmet], [l.poly.color, C.poly], [l.rubber.color, C.rubber], [l.metal.color, C.metal], [l.boot.color, C.boot], [l.skin.color, C.skin], [l.lip.color, C.skin], [l.glove.color, C.glove], [l.palm.color, C.glove], [l.knuckle.color, C.rubber], [l.face.color, C.face], [l.lens.color, C.lens], [l.scarf.color, C.face], [l.hair.color, C.face], [l.band, C.web]];
  return list.map(([h, c]) => [lin(h).getHex(), c]);
}

interface Texel { p: THREE.Vector3; n: THREE.Vector3; t: THREE.Vector3; b: THREE.Vector3; col: THREE.Color; rough: number; metal: number; edge: number; cls: Cls; bone: number }

// ---- High-detail height (metres) and masks -------------------------------------------------------------------------
const LIMB = (s: number, kind: 'elbow' | 'knee') => new Set(kind === 'elbow' ? [SIDE[s].upper, SIDE[s].elbow, SIDE[s].fore, SIDE[s].twist] : [SIDE[s].thigh, SIDE[s].knee, SIDE[s].shin]);
/** Elbows and knees; each applies only to texels skinned to its own limb (in the bind pose an elbow sits beside the
 * carrier, which must not get its folds or dirt). */
const JOINTS = [0, 1].flatMap(s => [{ c: JOINT[SIDE[s].fore], a: JOINT[SIDE[s].hand].clone().sub(JOINT[SIDE[s].upper]).normalize(), w: 0.07, back: new THREE.Vector3(0, 0, 1), kind: 'elbow', bones: LIMB(s, 'elbow') }, { c: JOINT[SIDE[s].shin], a: new THREE.Vector3(0, 1, 0), w: 0.08, back: new THREE.Vector3(0, 0, 1), kind: 'knee', bones: LIMB(s, 'knee') }]);
/** Which two axes to use for a woven pattern on a surface facing `n` (triplanar by the dominant axis). */
const plane = (p: THREE.Vector3, n: THREE.Vector3): [number, number] => { const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z); return ax > ay && ax > az ? [p.z, p.y] : ay > az ? [p.x, p.z] : [p.x, p.y]; };

function height(p: THREE.Vector3, x: Texel): { h: number; seam: number; fold: number; tape: number } {
  let h = 0, seam = 0, fold = 0, tape = 0;
  const [u, v] = plane(p, x.n);
  switch (x.cls) {
    case C.uniform: {
      // Ripstop grid (5 mm) and a soft weave.
      h += 0.00012 * Math.max(line(u, 0.005, 0.0006), line(v, 0.005, 0.0006)) + 0.00004 * Math.sin(u * 3000) * Math.sin(v * 3000);
      // Folds round the elbows and knees (deeper behind the knee and inside the elbow), bunching at the waist.
      for (const j of JOINTS) {
        if (!j.bones.has(x.bone)) continue;
        const d = p.clone().sub(j.c), t = d.dot(j.a), r = d.clone().addScaledVector(j.a, -t);
        const g = Math.exp(-Math.pow(t / j.w, 2)); if (g < 0.02) continue;
        const ang = Math.atan2(r.dot(new THREE.Vector3().crossVectors(j.a, j.back).normalize()), r.dot(j.back));
        const behind = Math.max(0, Math.cos(ang)), k = j.kind === 'knee' ? 1 : 0.8;
        const f = g * (0.4 + 0.6 * behind) * k;
        h += 0.0035 * f * Math.sin(t * 140 + Math.sin(ang * 3) * 2.2 + 1.3);
        fold = Math.max(fold, f);
      }
      const waist = Math.exp(-Math.pow((p.y - 1.06) / 0.05, 2));
      h += 0.002 * waist * Math.sin(Math.atan2(p.x, -p.z) * 9 + p.y * 40); fold = Math.max(fold, waist * 0.6);
      // Seams: trouser and sleeve side seams, knee panels, waist and yoke; stitch rows either side.
      const side = ss(0.95, 0.985, Math.abs(x.n.x)) * (p.y < 1.0 || x.bone !== B.spine2 ? 1 : 0);
      const knee = (1 - ss(0, 0.004, Math.abs(Math.abs(p.y - 0.495) - 0.065))) * (p.y < 0.62 ? 1 : 0);
      const waistS = 1 - ss(0, 0.004, Math.abs(p.y - 0.955));
      const yoke = (1 - ss(0, 0.004, Math.abs(p.y - 1.36))) * (p.y > 1.1 ? 1 : 0);
      seam = Math.max(side, knee, waistS, yoke);
      const along = (p.x + p.y + p.z) * 300;
      h += seam * (-0.0006 + 0.00025 * (Math.sin(along) > 0.2 ? 1 : 0));
      // Overall drape.
      h += 0.0012 * (fbm(p.x * 18, p.y * 18, p.z * 18, 3) - 0.5);
      break;
    }
    case C.kit: {
      // Cordura twill, stitched binding tape on the edges, panel stitching.
      h += 0.00008 * Math.sin((u + v) * 2600);
      tape = ss(0.12, 0.3, x.edge);
      h += tape * 0.0006 + tape * 0.0002 * (Math.sin((u + v) * 900) > 0.3 ? 1 : 0);
      h += 0.0006 * (fbm(p.x * 30, p.y * 30, p.z * 30, 2) - 0.5);
      break;
    }
    case C.web: h += 0.0002 * line(v, 0.0035, 0.0008) + 0.00006 * Math.sin(u * 2400); break;
    case C.helmet: h += 0.0009 * (fbm(p.x * 40, p.y * 40, p.z * 40, 3) - 0.5); break;
    case C.poly: h += 0.00012 * (vn(p.x * 900, p.y * 900, p.z * 900) - 0.5); break;
    case C.rubber: {
      // Sole lugs underneath and ribs round the sole edge.
      if (x.n.y < -0.6) h += 0.0025 * Math.max(line(p.x * 0.7 + p.z * 0.7, 0.012, 0.003), line(p.x * 0.7 - p.z * 0.7, 0.012, 0.003));
      else h += 0.0003 * line(p.y, 0.004, 0.001);
      break;
    }
    case C.boot: h += 0.00015 * (vn(p.x * 700, p.y * 700, p.z * 700) - 0.5) + 0.0008 * (fbm(p.x * 25, p.y * 25, p.z * 25, 2) - 0.5); break;
    case C.glove: h += 0.00012 * (vn(p.x * 800, p.y * 800, p.z * 800) - 0.5); break;
    case C.face: h += 0.00008 * Math.sin(u * 2600) * Math.sin(v * 2600); break;
    case C.skin: h += 0.00005 * (vn(p.x * 1500, p.y * 1500, p.z * 1500) - 0.5); break;
  }
  return { h, seam, fold, tape };
}

// ---- Paint ---------------------------------------------------------------------------------------------------------
function paint(x: Texel, ao: number, d: ReturnType<typeof height>, out: { col: THREE.Color; rough: number; metal: number }) {
  const p = x.p, col = out.col.copy(x.col);
  let rough = x.rough, metal = 0;
  const big = fbm(p.x * 9, p.y * 9, p.z * 9, 4), small = vn(p.x * 120, p.y * 120, p.z * 120);
  const cav = 1 - ao;
  if (x.cls === C.uniform) {
    // Printed three-tone pattern with breakup.
    const b1 = fbm(p.x * 9 + 3.1, p.y * 9, p.z * 9 - 2, 4), b2 = fbm(p.x * 17 + 7.3, p.y * 17, p.z * 17, 3);
    if (b1 > 0.54) col.multiplyScalar(0.68);
    else if (b2 > 0.57) col.multiply(new THREE.Color(1.22, 1.18, 1.12));
    col.multiplyScalar(0.92 + 0.12 * small);
    col.multiplyScalar(1 - d.seam * 0.3);
    rough = 0.9 + 0.06 * (small - 0.5);
  } else if (x.cls === C.kit) { col.multiplyScalar(0.9 + 0.2 * big); col.multiplyScalar(1 + d.tape * 0.12); rough = 0.82 + 0.08 * (small - 0.5); }
  else if (x.cls === C.web) { col.multiplyScalar(0.92 + 0.16 * big); rough = 0.74; }
  else if (x.cls === C.helmet) { col.multiplyScalar(0.9 + 0.2 * big); const worn = ss(0.3, 0.7, x.edge * (0.5 + big)); col.lerp(col.clone().multiplyScalar(1.6), worn * 0.6); rough = 0.62 + 0.1 * (big - 0.5) - worn * 0.1; }
  else if (x.cls === C.poly) { const worn = ss(0.3, 0.75, x.edge * (0.5 + big)); col.lerp(col.clone().multiplyScalar(2.2).addScalar(0.02), worn * 0.5); rough = 0.58 - worn * 0.15; }
  else if (x.cls === C.metal) { const worn = ss(0.25, 0.65, x.edge * (0.5 + big)); col.lerp(new THREE.Color(0.32, 0.32, 0.33), worn); metal = worn; rough = 0.45 - worn * 0.15; }
  else if (x.cls === C.boot) { col.multiplyScalar(0.85 + 0.3 * big); const worn = ss(0.2, 0.6, x.edge); col.lerp(col.clone().multiplyScalar(1.5), worn * 0.5); rough = 0.58 - worn * 0.18; }
  else if (x.cls === C.rubber) { rough = 0.9; }
  else if (x.cls === C.skin) {
    // Less saturated, rougher skin; a little colour in the cheeks and nose.
    const g = col.r * 0.3 + col.g * 0.59 + col.b * 0.11; col.lerp(new THREE.Color(g, g, g), 0.45).multiplyScalar(0.82);
    // Shading the eye reads from: darker under the brow and beside the nose; stubble on the jaw and upper lip.
    const brow = (1 - ss(0.0, 0.025, Math.abs(p.y - 1.632))) * ss(-0.06, -0.085, p.z) * 0.25;
    const stubble = (1 - ss(1.555, 1.585, p.y)) * ss(1.5, 1.52, p.y) * 0.3 * (0.6 + 0.4 * vn(p.x * 900, p.y * 900, p.z * 900));
    col.multiplyScalar(1 - brow).lerp(new THREE.Color(0.06, 0.05, 0.045), stubble);
    col.multiplyScalar(0.94 + 0.1 * small); rough = 0.72 + 0.06 * (small - 0.5) + stubble * 0.2;
  } else if (x.cls === C.glove) { col.multiplyScalar(0.9 + 0.2 * big); const worn = ss(0.3, 0.7, x.edge); col.lerp(col.clone().multiplyScalar(1.5), worn * 0.4); rough = 0.75 - worn * 0.15; }
  else if (x.cls === C.face) { col.multiplyScalar(0.92 + 0.12 * small); rough = 0.95; }
  else if (x.cls === C.lens) { rough = 0.06; metal = 0.3; }
  // Grime in recesses and folds, dirt on knees and elbows, dust on boots and the lower legs.
  if (x.cls !== C.lens) {
    // Neutral grime, darkening rather than tinting (a brown tint read as a painted block on deep recesses).
    col.multiplyScalar(1 - Math.min(0.45, cav * cav * 0.8 + d.fold * 0.1));
    col.lerp(new THREE.Color(0.09, 0.085, 0.078), Math.min(0.2, cav * 0.3));
    let dirt = 0;
    for (const j of JOINTS) { if (!j.bones.has(x.bone)) continue; const dist = p.distanceTo(j.c); dirt = Math.max(dirt, (1 - ss(0.03, 0.12, dist)) * (j.kind === 'knee' ? 0.55 : 0.35)); }
    dirt = Math.max(dirt, (1 - ss(0.04, 0.5, p.y)) * 0.55);
    dirt *= 0.4 + 0.6 * ss(0.35, 0.7, big);
    col.lerp(new THREE.Color(0.2, 0.17, 0.13), dirt);
    rough = Math.min(1, rough + dirt * 0.15 + cav * 0.1);
  }
  out.rough = Math.max(0.04, Math.min(1, rough)); out.metal = metal;
}

// ---- Bake one level --------------------------------------------------------------------------------------------------
async function bakeLevel(squad: 0 | 1, lod: number, size: number, dir: string): Promise<FighterSetMeta['levels'][number]> {
  const t0 = performance.now();
  const g = figureGeometry(squad, lod).geo, l = LOOKS[squad];
  const weight = (p: THREE.Vector3) => (p.y > 1.45 ? 1.6 : p.y > 1.05 ? 1.25 : p.y < 0.25 ? 0.9 : 1.0);
  const U = unwrap(g, size, lod === 0 ? 4 : 2, weight);
  const P = g.getAttribute('position'), N = g.getAttribute('normal'), COL = g.getAttribute('color'), PBR = g.getAttribute('pbr'), EDGE = g.getAttribute('edge'), SI = g.getAttribute('skinIndex');
  const cls = classes(l), classOf = (r: number, gg: number, b: number): Cls => {
    const hex = new THREE.Color(r, gg, b).getHex(); let best: Cls = C.other, bd = 1e9;
    for (const [h, c] of cls) { const dd = Math.abs(((h >> 16) & 255) - ((hex >> 16) & 255)) + Math.abs(((h >> 8) & 255) - ((hex >> 8) & 255)) + Math.abs((h & 255) - (hex & 255)); if (dd < bd) { bd = dd; best = c; } }
    return bd < 24 ? best : C.other;
  };
  // Occluders: arms (and hands) only occlude arms; the rest only the rest.
  const ARM = new Set(SIDE.flatMap(S => [S.clav, S.delt, S.upper, S.elbow, S.fore, S.twist, S.hand]));
  const isArm = (v: number) => ARM.has(SI.getX(v));
  const sub = (arm: boolean) => {
    const idx: number[] = [], I = g.index!.array;
    for (let f = 0; f < I.length; f += 3) if (isArm(I[f]) === arm) idx.push(I[f], I[f + 1], I[f + 2]);
    const s = new THREE.BufferGeometry(); s.setAttribute('position', P); s.setIndex(idx); return new MeshBVH(s);
  };
  const bvh = [sub(false), sub(true)];
  // Rasterise: triangle id and barycentrics per texel.
  const tri = new Int32Array(size * size).fill(-1), bu = new Float32Array(size * size), bv = new Float32Array(size * size);
  const ix = U.index, uv = U.uv;
  for (let f = 0; f < ix.length / 3; f++) {
    const a = ix[f * 3], b = ix[f * 3 + 1], c = ix[f * 3 + 2];
    const ax = uv[a * 2] * size, ay = uv[a * 2 + 1] * size, bx = uv[b * 2] * size, by = uv[b * 2 + 1] * size, cx = uv[c * 2] * size, cy = uv[c * 2 + 1] * size;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 1)), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx) + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 1)), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy) + 1));
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, w2 = 1 - w0 - w1;
      // Conservative: accept texels whose centre is within a texel of the triangle; clamp barycentrics.
      const m = Math.min(w0, w1, w2), tol = 1.2 / Math.max(1, Math.sqrt(Math.abs(den)));
      if (m < -tol) continue;
      const k = y * size + x;
      if (tri[k] >= 0 && m < 0) continue;
      const W0 = Math.max(0, w0), W1 = Math.max(0, w1), W2 = Math.max(0, w2), S = W0 + W1 + W2;
      tri[k] = f; bu[k] = W0 / S; bv[k] = W1 / S;
    }
  }
  // Per triangle tangent frames from the unwrap (dP/du, dP/dv).
  const nf = ix.length / 3, TT = new Float32Array(nf * 3), BB = new Float32Array(nf * 3);
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3();
  for (let f = 0; f < nf; f++) {
    const a = ix[f * 3], b = ix[f * 3 + 1], c = ix[f * 3 + 2];
    pa.fromBufferAttribute(P, U.remap[a]); pb.fromBufferAttribute(P, U.remap[b]); pc.fromBufferAttribute(P, U.remap[c]);
    const e1 = pb.clone().sub(pa), e2 = pc.clone().sub(pa), du1 = uv[b * 2] - uv[a * 2], dv1 = uv[b * 2 + 1] - uv[a * 2 + 1], du2 = uv[c * 2] - uv[a * 2], dv2 = uv[c * 2 + 1] - uv[a * 2 + 1];
    const r = 1 / ((du1 * dv2 - du2 * dv1) || 1e-12);
    const t = e1.clone().multiplyScalar(dv2).addScaledVector(e2, -dv1).multiplyScalar(r), bt = e2.clone().multiplyScalar(du1).addScaledVector(e1, -du2).multiplyScalar(r);
    TT.set([t.x, t.y, t.z], f * 3); BB.set([bt.x, bt.y, bt.z], f * 3);
  }
  // Evaluate every covered texel.
  const diff = Buffer.alloc(size * size * 4), nor = Buffer.alloc(size * size * 4), arm = Buffer.alloc(size * size * 4);
  const x: Texel = { p: new THREE.Vector3(), n: new THREE.Vector3(), t: new THREE.Vector3(), b: new THREE.Vector3(), col: new THREE.Color(), rough: 1, metal: 0, edge: 0, cls: C.other, bone: 0 };
  const out = { col: new THREE.Color(), rough: 1, metal: 0 }, ray = new THREE.Ray(), dirs: THREE.Vector3[] = [];
  for (let i = 0; i < AO_RAYS; i++) { const phi = i * 2.399963, ct = Math.sqrt((i + 0.5) / AO_RAYS), st = Math.sqrt(1 - ct * ct); dirs.push(new THREE.Vector3(Math.cos(phi) * st, Math.sin(phi) * st, ct)); }
  const q = new THREE.Vector3(), tmp = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  const toS = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  const lin2s = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  // Occlusion is smooth: evaluate it on a coarser grid of texels and reuse it within each cell's triangle.
  const AO_STEP = size >= 2048 ? 2 : 1, aoCache = new Map<number, number>();
  const occlusion = (k: number, arm: boolean) => {
    const xx = k % size, yy = Math.floor(k / size), ck = Math.floor(yy / AO_STEP) * size + Math.floor(xx / AO_STEP);
    const hit = aoCache.get(ck * 2 + (arm ? 1 : 0)); if (hit !== undefined) return hit;
    const n = x.n; t1.set(Math.abs(n.x) < 0.9 ? 1 : 0, Math.abs(n.x) < 0.9 ? 0 : 1, 0).cross(n).normalize(); t2.crossVectors(n, t1);
    let occ = 0;
    for (const d of dirs) {
      tmp.copy(t1).multiplyScalar(d.x).addScaledVector(t2, d.y).addScaledVector(n, d.z);
      ray.origin.copy(x.p).addScaledVector(n, 0.002); ray.direction.copy(tmp);
      const h = bvh[arm ? 1 : 0].raycastFirst(ray, THREE.DoubleSide, 0, 0.12);
      if (h) occ += 1 - (h.distance / 0.12) * 0.5;
    }
    const v = 1 - Math.min(0.9, occ / dirs.length * 1.15);
    aoCache.set(ck * 2 + (arm ? 1 : 0), v);
    return v;
  };
  let covered = 0;
  for (let k = 0; k < size * size; k++) {
    const f = tri[k]; if (f < 0) continue;
    covered++;
    const a = U.remap[ix[f * 3]], b = U.remap[ix[f * 3 + 1]], c = U.remap[ix[f * 3 + 2]], w0 = bu[k], w1 = bv[k], w2 = 1 - w0 - w1;
    const lerp3 = (A: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, o: THREE.Vector3) => o.set(A.getX(a) * w0 + A.getX(b) * w1 + A.getX(c) * w2, A.getY(a) * w0 + A.getY(b) * w1 + A.getY(c) * w2, A.getZ(a) * w0 + A.getZ(b) * w1 + A.getZ(c) * w2);
    lerp3(P, x.p); lerp3(N, x.n).normalize();
    const dom = w0 >= w1 && w0 >= w2 ? a : w1 >= w2 ? b : c;
    x.col.setRGB(COL.getX(dom), COL.getY(dom), COL.getZ(dom));
    x.cls = classOf(COL.getX(dom), COL.getY(dom), COL.getZ(dom));
    x.rough = PBR.getX(dom); x.metal = PBR.getY(dom); x.edge = EDGE.getX(a) * w0 + EDGE.getX(b) * w1 + EDGE.getX(c) * w2; x.bone = SI.getX(dom);
    // Orthonormal tangent frame (T along +u, B along +v).
    x.t.set(TT[f * 3], TT[f * 3 + 1], TT[f * 3 + 2]); x.t.addScaledVector(x.n, -x.t.dot(x.n)).normalize();
    x.b.crossVectors(x.n, x.t);
    if (x.b.dot(q.set(BB[f * 3], BB[f * 3 + 1], BB[f * 3 + 2])) < 0) x.b.negate();
    // Height detail to a tangent-space normal (sampled in 3D, so chart seams do not show in it).
    const e = 0.0006, d0 = height(x.p, x);
    const hx = height(q.copy(x.p).addScaledVector(x.t, e), x).h - height(tmp.copy(x.p).addScaledVector(x.t, -e), x).h;
    const hy = height(q.copy(x.p).addScaledVector(x.b, e), x).h - height(tmp.copy(x.p).addScaledVector(x.b, -e), x).h;
    const nx = -hx / (2 * e), ny = -hy / (2 * e), nl = Math.hypot(nx, ny, 1);
    nor[k * 4] = toS((nx / nl) * 0.5 + 0.5); nor[k * 4 + 1] = toS((ny / nl) * 0.5 + 0.5); nor[k * 4 + 2] = toS((1 / nl) * 0.5 + 0.5); nor[k * 4 + 3] = 255;
    const ao = occlusion(k, ARM.has(x.bone));
    paint(x, ao, d0, out);
    diff[k * 4] = toS(lin2s(out.col.r)); diff[k * 4 + 1] = toS(lin2s(out.col.g)); diff[k * 4 + 2] = toS(lin2s(out.col.b)); diff[k * 4 + 3] = 255;
    arm[k * 4] = toS(ao); arm[k * 4 + 1] = toS(out.rough); arm[k * 4 + 2] = toS(out.metal); arm[k * 4 + 3] = 255;
  }
  // Dilate charts outward so mips and filtering never pull in the empty background.
  for (let pass = 0; pass < 8; pass++) {
    const filled = new Uint8Array(size * size); for (let k = 0; k < size * size; k++) filled[k] = tri[k] >= 0 || diff[k * 4 + 3] === 254 ? 1 : 0;
    for (let y = 0; y < size; y++) for (let xx = 0; xx < size; xx++) {
      const k = y * size + xx; if (filled[k]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = xx + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= size || Y >= size) continue;
        const kk = Y * size + X; if (!filled[kk]) continue;
        for (const buf of [diff, nor, arm]) { buf[k * 4] = buf[kk * 4]; buf[k * 4 + 1] = buf[kk * 4 + 1]; buf[k * 4 + 2] = buf[kk * 4 + 2]; }
        diff[k * 4 + 3] = 254; nor[k * 4 + 3] = 255; arm[k * 4 + 3] = 255; break;
      }
    }
  }
  for (let k = 0; k < size * size; k++) { if (diff[k * 4 + 3] === 0) { nor[k * 4] = nor[k * 4 + 1] = 128; nor[k * 4 + 2] = 255; arm[k * 4] = 255; arm[k * 4 + 1] = 230; } diff[k * 4 + 3] = 255; nor[k * 4 + 3] = 255; arm[k * 4 + 3] = 255; }
  // Write: previews, KTX2 sets, UV data.
  const L = `l${lod}`;
  await mkdir(join(dir, L), { recursive: true }); await mkdir(PREVIEW, { recursive: true });
  const png = (buf: Buffer) => sharp(buf, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
  // Shipped size per map: albedo at the atlas size; normal and occlusion / roughness / metal at half size (the normal
  // at full size was 2.3 MB of a 4.1 MB set for little visible gain at play distances).
  const shipped = { diff: size, nor: size / 2, arm: size / 2 };
  let bytes = 0;
  for (const [kind, buf] of [['diff', diff], ['nor', nor], ['arm', arm]] as const) {
    const full = await png(buf);
    await writeFile(join(PREVIEW, `${variantName(squad)}-${L}-${kind}.png`), full);
    const s = shipped[kind], src = s === size ? full : await sharp(full).resize(s, s, { kernel: 'lanczos3' }).png().toBuffer();
    const ktx = await ktx2(src, kind);
    await writeFile(join(dir, L, `${kind}-${s}.ktx2`), ktx); bytes += ktx.length;
  }
  // UV data: per output vertex the source vertex (uint16 or uint32), the index, and the UVs (uint16 normalised).
  const nv = U.remap.length, wide = g.getAttribute('position').count > 65535;
  const remap = wide ? Buffer.from(U.remap.buffer) : Buffer.from(Uint16Array.from(U.remap).buffer);
  const index = Buffer.from(Uint32Array.from(U.index).buffer);
  const uvq = Buffer.from(Uint16Array.from(U.uv, v => Math.round(Math.max(0, Math.min(1, v)) * 65535)).buffer);
  await writeFile(join(dir, L, 'uv.bin'), Buffer.concat([remap, index, uvq])); bytes += remap.length + index.length + uvq.length;
  console.log(`${variantName(squad)} ${L}: ${size}² atlas, ${U.charts} charts, ${(U.density).toFixed(0)} texels/m, ${(covered / (size * size) * 100).toFixed(0)}% covered (charts ${(U.coverage * 100).toFixed(0)}%), ${(bytes / 1024).toFixed(0)} KB, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  return { lod, size, sizes: [shipped.diff, shipped.nor, shipped.arm], vertices: g.getAttribute('position').count, outVertices: nv, indices: U.index.length, wide };
}

const variantName = (squad: 0 | 1) => FIGHTER_SETS[squad];

async function ktx2(png: Buffer, kind: 'diff' | 'nor' | 'arm'): Promise<Buffer> {
  const SETTINGS = {
    diff: { isUASTC: false, qualityLevel: 160, compressionLevel: 2, isSetKTX2SRGBTransferFunc: true, isPerceptual: true },
    nor: { isUASTC: true, isNormalMap: true, isPerceptual: false, uastcLDRQualityLevel: 1, enableRDO: true, rdoQualityLevel: 3, needSupercompression: true },
    arm: { isUASTC: true, isPerceptual: false, uastcLDRQualityLevel: 1, enableRDO: true, rdoQualityLevel: 4, needSupercompression: true },
  } as const;
  const imageDecoder = async (buf: Uint8Array) => { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, data: new Uint8Array(data) }; };
  const log = console.log; console.log = () => {};
  try { return Buffer.from(await encodeToKTX2(new Uint8Array(png), { ...SETTINGS[kind], generateMipmap: true, isKTX2File: true, imageDecoder } as never)); }
  finally { console.log = log; }
}

await heroReady;
const squads = (process.env.SQUADS ?? '0').split(',').map(Number) as (0 | 1)[];
for (const squad of squads) {
  const dir = join(OUT, variantName(squad));
  const levels = [];
  for (const [lod, size] of [[0, 2048], [1, 1024], [2, 512]] as const) levels.push(await bakeLevel(squad, lod, size, dir));
  const meta: FighterSetMeta = { variant: variantName(squad), levels };
  await writeFile(join(dir, 'set.json'), JSON.stringify(meta, null, 1));
}
