/** Job 6: removes the Patch rifle's generated box sight (solid, no window) down to the rail, caps the opening with a
 * rail-top texel, and recomputes tangents. Rewrites public/game-art/breachline/patch/rifle-scifi/rifle.glb in place
 * (the source of truth stays prep-rifle.ts + this script). Run with `npx vite-node`. */
import * as THREE from 'three';
// @ts-expect-error plain JS modules
import { readGlb, primitive, writeGlb } from './glb.mjs';
// @ts-expect-error plain JS modules
import { cut } from './mesh.mjs';

const F = 'public/game-art/breachline/patch/rifle-scifi/rifle.glb';
/** Measured on the side profile: the box sight stands on the rail between z -0.075 and 0.05, rail top at y 0.112. */
const SIGHT = { y: 0.112, z0: -0.075, z1: 0.05 };
async function main() {
  const g = await readGlb(F), out = [];
  for (const nd of g.json.nodes) {
    const p = primitive(g, g.json.nodes.indexOf(nd));
    let m = { pos: p.pos, nrm: p.nrm, uv: p.uv, idx: p.idx };
    if (nd.name === 'body') {
      let best = 0, bd = Infinity; for (let i = 0; i < p.pos.length / 3; i++) { const d = Math.hypot(p.pos[i * 3], p.pos[i * 3 + 1] - 0.105, p.pos[i * 3 + 2] + 0.15); if (d < bd) { bd = d; best = i; } }
      const r = cut(m, [0, SIGHT.y, 0], [0, 1, 0], (c: number[]) => c[2] > SIGHT.z0 && c[2] < SIGHT.z1, [p.uv[best * 2], p.uv[best * 2 + 1]]);
      console.log('sight removed: triangles', r.removed, 'cap loops', r.loops); m = r.mesh;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(m.nrm, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2)); geo.setIndex(new THREE.BufferAttribute(m.idx, 1)); geo.computeTangents();
    out.push({ name: nd.name, attributes: { POSITION: m.pos, NORMAL: m.nrm, TANGENT: geo.getAttribute('tangent').array, TEXCOORD_0: m.uv }, indices: m.idx, ...(nd.translation ? { translation: nd.translation } : {}) });
  }
  await writeGlb(F, out, { ...g.json.asset.extras, sightRemoved: SIGHT });
}
main();
