/** Breakable dressing (map-fill plan, section 10.2): screens crack and go dark, status lights go out, bottles,
 * glassware, mugs and jars shatter, bins dent and tip over, plants lose leaves, a shot ceiling fitting loses its
 * diffuser, sparks and flickers on its bare tubes (the room keeps its baked light), and a blast knocks small loose
 * things off the surfaces round it. Cosmetic only, driven by the `shot` and `boom` events every client gets; reset at
 * each round's preparation. Each break is reported (for the sound code) through `onBreak`. */
import * as THREE from 'three';
import { WALL_H } from '../config';
import type { Effects } from '../effects';
import { MARK } from '../textures';
import type { ArtWorld } from './artworld';
import type { DressProxy } from './detail';
import { DIFFUSER_Y } from './fixturemesh';

type V3 = [number, number, number];
/** Debris colour by role (and by material for loose things a blast throws). */
const SHARDS: Record<string, V3> = { glass: [0.75, 0.86, 0.9], mug: [0.92, 0.91, 0.88], leaf: [0.26, 0.46, 0.2], bin: [0.9, 0.9, 0.86], screen: [0.1, 0.12, 0.14], led: [0.2, 0.2, 0.2], paper: [0.9, 0.9, 0.86], binder: [0.3, 0.35, 0.6], card: [0.6, 0.48, 0.32], casing: [0.85, 0.85, 0.82] };
/** What a blast knocks off: breakables and small loose things (under about 3 litres). */
const LOOSE = new Set(['paper', 'binder', 'card', 'casing']);
const SMALL = (p: DressProxy) => (p.x1 - p.x0) * (p.y1 - p.y0) * (p.z1 - p.z0) < 0.003;

export class Breakables {
  readonly group = new THREE.Group();
  /** Called as something breaks: its role ('screen', 'led', 'glass', 'mug', 'bin', 'leaf', 'fitting') and where. */
  onBreak: (role: string, x: number, y: number, z: number) => void = () => {};
  private broken = new Set<DressProxy>();
  private dead: THREE.InstancedMesh; private bins: THREE.InstancedMesh; private tubes: THREE.InstancedMesh;
  private nDead = 0; private nBins = 0; private nTubes = 0;
  private flicker: { i: number; t: number; seed: number }[] = [];
  private fitBroken = new Set<number>();
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private s = new THREE.Vector3(); private c = new THREE.Color();

  constructor(private fx: Effects, private art: ArtWorld) {
    this.dead = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x050607 }), 48);
    const bin = new THREE.CylinderGeometry(0.14, 0.12, 0.34, 14, 1, true); bin.rotateZ(Math.PI / 2);
    this.bins = new THREE.InstancedMesh(bin, new THREE.MeshBasicMaterial({ color: 0x3a3c3e, side: THREE.DoubleSide }), 8);
    this.tubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), 32);
    for (const im of [this.dead, this.bins, this.tubes]) { im.count = 0; im.frustumCulled = false; this.group.add(im); }
    this.tubes.setColorAt(0, this.c.setRGB(1, 1, 1));
  }

  /** A round passed through dressing piece `p` at (x, y, z), travelling along (dx, dy, dz). */
  shotDress(p: DressProxy, x: number, y: number, z: number, dx: number, dy: number, dz: number) {
    if (!p.role || this.broken.has(p)) return;
    this.breakOne(p, dx * 2, 1, dz * 2, x, y, z);
  }
  /** A round stopped by the ceiling at (x, z): a fitting there loses its diffuser. */
  shotCeiling(x: number, y: number, z: number) {
    if (y < WALL_H - 0.08) return;
    this.art.fittings.forEach((f, i) => {
      if (this.fitBroken.has(i) || Math.abs(x - f.x) > f.w / 2 + 0.04 || Math.abs(z - f.z) > f.d / 2 + 0.04) return;
      this.fitBroken.add(i); f.lens(false);
      // The prismatic lens falls in shards; two bare tubes are left, and they flicker.
      for (let k = 0; k < 14; k++) this.fx.debris(f.x + (Math.random() - 0.5) * f.w, DIFFUSER_Y - 0.01, f.z + (Math.random() - 0.5) * f.d, (Math.random() - 0.5) * 1.2, -Math.random(), (Math.random() - 0.5) * 1.2, 0.03 + Math.random() * 0.05, 0.85, 0.87, 0.88, true, 0.97);
      for (let k = 0; k < 10; k++) this.fx.spark(x, DIFFUSER_Y, z, (Math.random() - 0.5) * 3, -Math.random() * 2, (Math.random() - 0.5) * 3, 0.03, 0.35);
      const along = f.w >= f.d;
      for (const o of [-0.25, 0.25]) {
        if (this.nTubes >= 32) break;
        const j = this.nTubes++;
        this.v.set(f.x + (along ? 0 : o * f.w), DIFFUSER_Y - 0.018, f.z + (along ? o * f.d : 0)); this.q.identity();
        this.tubes.setMatrixAt(j, this.m.compose(this.v, this.q, this.s.set(along ? f.w * 0.92 : 0.026, 0.026, along ? 0.026 : f.d * 0.92)));
        this.flicker.push({ i: j, t: 0, seed: Math.random() * 100 });
      }
      this.tubes.count = this.nTubes; this.tubes.instanceMatrix.needsUpdate = true;
      this.onBreak('fitting', f.x, DIFFUSER_Y, f.z);
    });
  }
  /** A blast at (x, y, z): breakables and small loose things within 3 m are broken or knocked off, thrown away from it. */
  blast(x: number, y: number, z: number) {
    let n = 0;
    for (const p of this.art.markables.dress as DressProxy[]) {
      if (n > 40 || this.broken.has(p) || !(p.role || (LOOSE.has(p.key) && SMALL(p)))) continue;
      const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2, cz = (p.z0 + p.z1) / 2, d = Math.hypot(cx - x, cy - y, cz - z);
      if (d > 3 || p.role === 'led') continue;
      const k = (3.2 - d) * 1.6 / (d || 1);
      this.breakOne(p, (cx - x) * k, 1 + Math.random() * 1.5, (cz - z) * k, cx, cy, cz);
      n++;
    }
  }
  private breakOne(p: DressProxy, vx: number, vy: number, vz: number, x: number, y: number, z: number) {
    // A piece with parts (a bin and its rim, a stack of cups) goes as one.
    // (and a round through a plant strips the leaves round where it passed)
    const near = p.role === 'leaf' ? 0.12 : 0.02;
    const group = (this.art.markables.dress as DressProxy[]).filter(o => o === p || (p.role && o.role === p.role && (p.role === 'bin' || p.role === 'mug' || p.role === 'leaf') && !this.broken.has(o) && o.x0 < p.x1 + near && o.x1 > p.x0 - near && o.z0 < p.z1 + near && o.z1 > p.z0 - near && (p.role !== 'leaf' || Math.abs((o.y0 + o.y1) / 2 - y) < 0.25)));
    for (const o of group) this.broken.add(o);
    const col = SHARDS[p.role] ?? SHARDS[p.key] ?? [0.6, 0.6, 0.6], cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2, cz = (p.z0 + p.z1) / 2;
    switch (p.role) {
      case 'screen': {
        // The panel cracks and goes dark: a black face over it, a crack star where the round went in, sparks.
        if (this.nDead < 48) { const j = this.nDead++; this.v.set(cx, cy, cz); this.q.identity(); this.dead.setMatrixAt(j, this.m.compose(this.v, this.q, this.s.set(p.x1 - p.x0 + 0.004, p.y1 - p.y0 + 0.004, p.z1 - p.z0 + 0.004))); this.dead.count = this.nDead; this.dead.instanceMatrix.needsUpdate = true; }
        const thin = p.x1 - p.x0 < p.z1 - p.z0 ? 'x' : 'z', nx = thin === 'x' ? Math.sign(-vx) || 1 : 0, nz = thin === 'z' ? Math.sign(-vz) || 1 : 0;
        this.fx.hole(thin === 'x' ? (nx > 0 ? p.x1 : p.x0) + nx * 0.004 : x, y, thin === 'z' ? (nz > 0 ? p.z1 : p.z0) + nz * 0.004 : z, nx, 0, nz, 0.2, -1, MARK.glass, [1.2, 1.25, 1.3]);
        for (let k = 0; k < 8; k++) this.fx.spark(x, y, z, (Math.random() - 0.5) * 2 - vx * 0.3, Math.random() * 1.5, (Math.random() - 0.5) * 2 - vz * 0.3, 0.025, 0.3);
        break;
      }
      case 'led': for (const o of group) this.art.hideDress(o); for (let k = 0; k < 3; k++) this.fx.spark(x, y, z, (Math.random() - 0.5), Math.random(), (Math.random() - 0.5), 0.02, 0.2); break;
      case 'bin': {
        // Dented and knocked over: the bin lies on its side by where it stood, its rubbish spilled.
        for (const o of group) this.art.hideDress(o);
        if (this.nBins < 8) { const j = this.nBins++, a = Math.atan2(vz, vx); this.v.set(cx + Math.cos(a) * 0.25, 0.14, cz + Math.sin(a) * 0.25); this.q.setFromAxisAngle(this.s.set(0, 1, 0), -a); this.bins.setMatrixAt(j, this.m.compose(this.v, this.q, this.s.set(1, 0.85, 1))); this.bins.count = this.nBins; this.bins.instanceMatrix.needsUpdate = true; }
        for (let k = 0; k < 8; k++) this.fx.debris(cx, 0.2, cz, vx * 0.4 + (Math.random() - 0.5), Math.random(), vz * 0.4 + (Math.random() - 0.5), 0.04 + Math.random() * 0.06, ...col, true, 0.8);
        break;
      }
      default: {
        // Glass, mugs, jars, a leaf, loose things: gone from the surface, in pieces (or whole, for paper) on the floor.
        for (const o of group) this.art.hideDress(o);
        const many = p.role === 'glass' || p.role === 'mug' ? 10 : p.role === 'leaf' ? 3 : 2, flat = p.role === 'leaf' || p.key === 'paper' ? 0.1 : 0.9;
        for (let k = 0; k < many; k++) this.fx.debris(cx, cy, cz, vx + (Math.random() - 0.5) * 1.2, vy * Math.random(), vz + (Math.random() - 0.5) * 1.2, p.role === 'glass' || p.role === 'mug' ? 0.02 + Math.random() * 0.03 : Math.min(0.12, Math.max(0.03, (p.x1 - p.x0 + p.z1 - p.z0) / 2)), ...col, true, flat);
      }
    }
    this.onBreak(p.role || 'loose', cx, cy, cz);
  }
  /** Bare tubes flicker: mostly on, with stutters. */
  update(dt: number, reduced: boolean) {
    for (const f of this.flicker) {
      f.t += dt;
      const on = reduced ? 1 : Math.sin(f.t * 37 + f.seed) > -0.6 && Math.sin(f.t * 5.3 + f.seed * 2) > -0.85 ? 1 : 0.15;
      this.tubes.setColorAt(f.i, this.c.setRGB(3 * on, 3 * on, 2.9 * on));
    }
    if (this.flicker.length && this.tubes.instanceColor) this.tubes.instanceColor.needsUpdate = true;
  }
  /** Every piece whole again (a new round). */
  reset() {
    this.art.restoreDress(); this.broken.clear(); this.fitBroken.clear(); this.flicker.length = 0;
    this.nDead = this.nBins = this.nTubes = 0; this.dead.count = this.bins.count = this.tubes.count = 0;
  }
  dispose() { for (const im of [this.dead, this.bins, this.tubes]) { im.geometry.dispose(); (im.material as THREE.Material).dispose(); im.dispose(); } }
}
