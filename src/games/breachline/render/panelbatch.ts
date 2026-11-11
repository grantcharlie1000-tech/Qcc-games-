/** Draws every undamaged destructible panel as part of a few merged meshes, one per material, so a room's soft walls
 * cost a draw call per material instead of one or two per panel. Each whole panel's geometry is split by its material
 * groups (face, edges) and each part filed under its material. A panel leaves the batches (and draws on its own) once
 * it is damaged, reinforced or gone; the batches it was in are rebuilt then, which is a small merge at the moment of
 * damage, never per frame. Panel geometry is already in world space with its light in the vertex colours, so merging
 * needs no transforms. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PanelView } from '../levelmesh';

interface Batch { material: THREE.Material; parts: Map<PanelView, THREE.BufferGeometry>; mesh: THREE.Mesh | null; dirty: boolean }

/** A whole, unreinforced panel's geometry split by material: [material, part] per group. Null if it cannot batch. */
function split(v: PanelView): [THREE.Material, THREE.BufferGeometry][] | null {
  const p = v.panel, g = v.mesh.geometry, mats = v.mesh.material;
  if (!p.intact || p.intact !== p.cells.length || p.reinforced || !g.index || !g.groups.length) return null;
  const index = g.index.array;
  return g.groups.map(gr => {
    const part = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(g.attributes)) part.setAttribute(k, a);
    part.setIndex(Array.from(index.slice(gr.start, gr.start + gr.count)));
    return [Array.isArray(mats) ? mats[gr.materialIndex ?? 0] : mats, part];
  });
}

export class PanelBatches {
  private batches = new Map<THREE.Material, Batch>();
  private home = new Map<PanelView, Batch[]>();
  constructor(private group: THREE.Group) {}

  /** Call after a panel's sync() rebuilt it (or once for every panel after binding). */
  update(v: PanelView) {
    for (const b of this.home.get(v) ?? []) { b.parts.get(v)?.dispose(); b.parts.delete(v); b.dirty = true; }
    this.home.delete(v);
    const parts = split(v);
    if (!parts) { v.mesh.visible = v.panel.intact > 0; return; }
    const homes: Batch[] = [];
    for (const [material, part] of parts) {
      let b = this.batches.get(material);
      if (!b) this.batches.set(material, b = { material, parts: new Map(), mesh: null, dirty: true });
      // Two groups of one panel can share a material: merge them into the one part.
      const had = b.parts.get(v);
      if (had) { const both = mergeGeometries([had, part], false)!; had.dispose(); part.dispose(); b.parts.set(v, both); } else b.parts.set(v, part);
      b.dirty = true; if (!homes.includes(b)) homes.push(b);
    }
    this.home.set(v, homes);
    v.mesh.visible = false;
  }

  /** Rebuilds the batches whose members changed. */
  flush() {
    for (const b of this.batches.values()) {
      if (!b.dirty) continue;
      b.dirty = false;
      if (b.mesh) { this.group.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh = null; }
      if (!b.parts.size) continue;
      const merged = mergeGeometries([...b.parts.values()], false);
      if (!merged) { for (const v of b.parts.keys()) v.mesh.visible = true; continue; }
      merged.computeBoundingSphere();
      b.mesh = new THREE.Mesh(merged, b.material);
      b.mesh.matrixAutoUpdate = false; b.mesh.name = 'panels:batch';
      this.group.add(b.mesh);
    }
  }

  dispose() {
    for (const b of this.batches.values()) { if (b.mesh) { this.group.remove(b.mesh); b.mesh.geometry.dispose(); } for (const g of b.parts.values()) g.dispose(); }
    this.batches.clear(); this.home.clear();
  }
}
