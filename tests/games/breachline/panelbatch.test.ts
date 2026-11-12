import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PanelView, type PanelMaterials } from '../../../src/games/breachline/levelmesh';
import type { Bake } from '../../../src/games/breachline/lightbake';
import { newWorld } from '../../../src/games/breachline/map';
import { PanelBatches } from '../../../src/games/breachline/render/panelbatch';

const bake = { light: () => [1, 1, 1] } as unknown as Bake;
const mats: PanelMaterials = { wall: new THREE.MeshBasicMaterial(), core: new THREE.MeshBasicMaterial(), planks: new THREE.MeshBasicMaterial(), plate: new THREE.MeshBasicMaterial() };

/** Triangles a batch mesh still draws (not collapsed to a point), and whether any lies on the panel. */
function drawn(mesh: THREE.Mesh, on: { axis: string; pos: number; u0: number; cols: number }) {
  const idx = mesh.geometry.index!.array, pos = mesh.geometry.attributes.position.array;
  let n = 0, hit = false;
  for (let i = 0; i < idx.length; i += 3) {
    if (idx[i] === idx[i + 1] && idx[i + 1] === idx[i + 2]) continue;
    n++;
    const k = idx[i] * 3, u = on.axis === 'x' ? pos[k] : pos[k + 2], w = on.axis === 'x' ? pos[k + 2] : pos[k];
    if (Math.abs(w - on.pos) < 0.2 && u > on.u0 + 0.01 && u < on.u0 + on.cols * 0.25 - 0.01) hit = true;
  }
  return { n, hit };
}

describe('soft walls drawn in batches', () => {
  it('a damaged wall leaves its batch without a rebuild, and comes back at the next round', () => {
    const world = newWorld(), group = new THREE.Group(), batches = new PanelBatches(group);
    const walls = world.panels.filter(p => p.kind === 'wall' && p.intact === p.cells.length).slice(0, 4);
    const views = walls.map(p => new PanelView(p, bake, mats));
    for (const v of views) { v.sync(); batches.update(v); }
    batches.flush();
    const face = () => group.children.find(o => (o as THREE.Mesh).material === mats.wall) as THREE.Mesh;
    const mesh = face(), p = walls[1], before = drawn(mesh, p);
    expect(before.hit).toBe(true);
    // A round knocks a cell out of the second wall.
    p.cells[0] = 0; p.intact--; p.version++;
    views[1].sync(); batches.update(views[1]); batches.flush();
    expect(face()).toBe(mesh);
    const after = drawn(mesh, p);
    expect(after.hit).toBe(false);
    expect(after.n).toBeLessThan(before.n);
    expect(views[1].mesh.visible).toBe(true);
    // The next round: whole again, and back in a batch.
    p.cells.fill(1); p.intact = p.cells.length; p.version++;
    views[1].sync(); batches.update(views[1]); batches.flush();
    expect(drawn(face(), p)).toEqual(before);
    expect(views[1].mesh.visible).toBe(false);
  });
});
