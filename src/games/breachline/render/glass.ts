/** Window glass (map-fill plan, section 10.2): a pane outside every barricaded window in the brick shell. The first
 * round through a pane cracks it, the second (or a blast within 5 m) shatters it: the pane goes, a jagged rim stays in
 * the frame and shards lie below. Glass never stops a round or changes what can be seen; it is cosmetic and driven
 * only by the `shot` and `boom` events every client already gets, so all players see the same breakage. */
import * as THREE from 'three';
import { CELL } from '../config';
import { MAP } from '../map';
import type { Effects } from '../effects';
import { MARK } from '../textures';

interface Pane { axis: 'x' | 'z'; pos: number; out: number; u0: number; u1: number; y0: number; y1: number; hits: number }
const OFF = 0.17;

/** A jagged band round the inside of a unit square (the shards left in a broken pane's frame), as triangles. */
function rimGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  let seed = 7;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const side = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number) => {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2, d = 0.03 + r() * 0.16;
      const p0 = [ax + (bx - ax) * t0, ay + (by - ay) * t0], p1 = [ax + (bx - ax) * t1, ay + (by - ay) * t1], pm = [ax + (bx - ax) * tm + nx * d, ay + (by - ay) * tm + ny * d];
      pos.push(p0[0] - 0.5, p0[1] - 0.5, 0, p1[0] - 0.5, p1[1] - 0.5, 0, pm[0] - 0.5, pm[1] - 0.5, 0);
    }
  };
  side(0, 0, 1, 0, 0, 1); side(1, 0, 1, 1, -1, 0); side(1, 1, 0, 1, 0, -1); side(0, 1, 0, 0, 1, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export class Glass {
  readonly group = new THREE.Group();
  private panes: Pane[];
  private sheet: THREE.InstancedMesh;
  private rim: THREE.InstancedMesh;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private s = new THREE.Vector3();
  private static ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  /** Called as a pane cracks or shatters (the scene's cosmetic event stream). */
  onEvent: (stage: 'crack' | 'shatter', x: number, y: number, z: number) => void = () => {};
  constructor(private fx: Effects) {
    const B = MAP.building;
    this.panes = MAP.panels.filter(p => p.kind === 'window' && (p.axis === 'x' ? Math.abs(Math.abs(p.pos) - Math.abs(B.z1)) < 0.01 : Math.abs(Math.abs(p.pos) - Math.abs(B.x1)) < 0.01))
      .map(p => ({ axis: p.axis, pos: p.pos, out: Math.sign(p.pos), u0: p.u0, u1: p.u0 + p.cols * CELL, y0: p.y0, y1: p.y0 + p.rows * CELL, hits: 0 }));
    const mat = new THREE.MeshStandardMaterial({ color: 0x9db4bf, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
    // A flat pane needs no back-then-front pass (three draws transparent double-sided things twice and rebuilds their
    // program state for each pass, every frame).
    mat.forceSinglePass = true;
    this.sheet = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, this.panes.length);
    this.rim = new THREE.InstancedMesh(rimGeometry(), mat, this.panes.length);
    this.sheet.renderOrder = this.rim.renderOrder = 3;
    this.group.add(this.sheet, this.rim);
    this.reset();
  }
  private place(mesh: THREE.InstancedMesh, i: number, show: boolean) {
    const p = this.panes[i];
    if (!show) { mesh.setMatrixAt(i, Glass.ZERO); return; }
    const u = (p.u0 + p.u1) / 2, y = (p.y0 + p.y1) / 2, w = p.u1 - p.u0, h = p.y1 - p.y0;
    if (p.axis === 'x') this.v.set(u, y, p.pos + p.out * OFF); else this.v.set(p.pos + p.out * OFF, y, u);
    this.q.setFromAxisAngle(this.s.set(0, 1, 0), p.axis === 'x' ? 0 : Math.PI / 2);
    mesh.setMatrixAt(i, this.m.compose(this.v, this.q, this.s.set(w, h, 1)));
  }
  /** Every pane whole again (a new round). */
  reset() {
    this.panes.forEach((p, i) => { p.hits = 0; this.place(this.sheet, i, true); this.place(this.rim, i, false); });
    this.sheet.instanceMatrix.needsUpdate = this.rim.instanceMatrix.needsUpdate = true;
  }
  private tag = (i: number) => 900000 + i;
  /** A round from (o) along unit (d), stopped by the world at `tmax`: crack or break every pane it passes through. */
  shot(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tmax: number) {
    this.panes.forEach((p, i) => {
      if (p.hits >= 2) return;
      const plane = p.pos + p.out * OFF, along = p.axis === 'x' ? dz : dx, from = p.axis === 'x' ? oz : ox;
      if (Math.abs(along) < 1e-4) return;
      const t = (plane - from) / along;
      if (t < 0.05 || t > tmax + 0.3) return;
      const u = p.axis === 'x' ? ox + dx * t : oz + dz * t, y = oy + dy * t;
      if (u < p.u0 || u > p.u1 || y < p.y0 || y > p.y1) return;
      p.hits++;
      const x = p.axis === 'x' ? u : plane, z = p.axis === 'x' ? plane : u, n = -Math.sign(along);
      for (let k = 0; k < 5; k++) this.fx.debris(x, y, z, dx * 2 + (Math.random() - 0.5) * 1.5, Math.random() * 1.2, dz * 2 + (Math.random() - 0.5) * 1.5, 0.008 + Math.random() * 0.012, 0.75, 0.85, 0.9, true, 0.95);
      if (p.hits === 1) { this.fx.hole(x, y, z, p.axis === 'x' ? 0 : n, 0, p.axis === 'x' ? n : 0, 0.42 + Math.random() * 0.15, this.tag(i), MARK.glass, [1.1, 1.15, 1.2]); this.onEvent('crack', x, y, z); }
      else this.shatter(i, dx, dz);
    });
  }
  /** A blast at (x, y, z): panes within 5 m shatter, their shards thrown away from it. */
  blast(x: number, y: number, z: number) {
    this.panes.forEach((p, i) => {
      if (p.hits >= 2) return;
      const u = Math.max(p.u0, Math.min(p.u1, p.axis === 'x' ? x : z)), yy = Math.max(p.y0, Math.min(p.y1, y));
      const px = p.axis === 'x' ? u : p.pos, pz = p.axis === 'x' ? p.pos : u;
      const d = Math.hypot(px - x, yy - y, pz - z);
      if (d > 5) return;
      p.hits = 2;
      this.shatter(i, (px - x) / (d || 1), (pz - z) / (d || 1));
    });
  }
  private shatter(i: number, dx: number, dz: number) {
    const p = this.panes[i];
    p.hits = 2;
    { const u = (p.u0 + p.u1) / 2, y = (p.y0 + p.y1) / 2, plane = p.pos + p.out * OFF; this.onEvent('shatter', p.axis === 'x' ? u : plane, y, p.axis === 'x' ? plane : u); }
    this.fx.clearHoles(this.tag(i));
    this.place(this.sheet, i, false); this.place(this.rim, i, true);
    this.sheet.instanceMatrix.needsUpdate = this.rim.instanceMatrix.needsUpdate = true;
    // Shards burst out along the hit and fall: most land below the window, a few skitter further; they stay.
    for (let k = 0; k < 18; k++) {
      const u = p.u0 + Math.random() * (p.u1 - p.u0), y = p.y0 + Math.random() * (p.y1 - p.y0), plane = p.pos + p.out * OFF;
      const x = p.axis === 'x' ? u : plane, z = p.axis === 'x' ? plane : u;
      this.fx.debris(x, y, z, dx * (0.5 + Math.random() * 2) + (Math.random() - 0.5), Math.random() * 1.5, dz * (0.5 + Math.random() * 2) + (Math.random() - 0.5), 0.015 + Math.random() * 0.03, 0.72, 0.82, 0.88, true, 0.97);
    }
  }
  dispose() { this.sheet.geometry.dispose(); this.rim.geometry.dispose(); (this.sheet.material as THREE.Material).dispose(); this.sheet.dispose(); this.rim.dispose(); }
}
