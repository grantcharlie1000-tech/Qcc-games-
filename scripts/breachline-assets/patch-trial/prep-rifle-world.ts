/** Job 5.3: the Patch rifle at world level of detail for the fighters (about the stock world AR's 2.5k triangles):
 * public/game-art/breachline/patch/rifle-scifi/rifle-world.glb, nodes body and magazine (magazine translation = its
 * seat), same frame, UVs and texture set as rifle.glb. Run with `npx vite-node`. */
import { MeshoptSimplifier } from 'meshoptimizer';
// @ts-expect-error plain JS modules
import { readGlb, primitive, writeGlb } from './glb.mjs';
// @ts-expect-error plain JS modules
import { compact } from './mesh.mjs';

const DIR = 'public/game-art/breachline/patch/rifle-scifi';
async function main() {
  await MeshoptSimplifier.ready;
  const g = await readGlb(`${DIR}/rifle.glb`), out = [];
  for (const [name, target] of [['body', 2200], ['magazine', 250]] as const) {
    const i = g.json.nodes.findIndex((n: { name: string }) => n.name === name), p = primitive(g, i);
    // Welded by position (UV seams would stop the simplifier), each corner then takes the duplicate in its
    // triangle's UV island (the large islands of this atlas make stretched triangles rare).
    const n = p.pos.length / 3, key = (v: number) => `${Math.round(p.pos[v * 3] * 1e5)},${Math.round(p.pos[v * 3 + 1] * 1e5)},${Math.round(p.pos[v * 3 + 2] * 1e5)}`;
    const first = new Map<string, number>(), dups: number[][] = [], weld = new Uint32Array(n);
    for (let v = 0; v < n; v++) { const k = key(v); let w = first.get(k); if (w === undefined) { w = dups.length; first.set(k, w); dups.push([]); } weld[v] = w; dups[w].push(v); }
    const par = Int32Array.from({ length: n }, (_, k) => k), find = (k: number): number => { while (par[k] !== k) k = par[k] = par[par[k]]; return k; };
    for (let t = 0; t < p.idx.length; t += 3) { const a = find(p.idx[t]); par[find(p.idx[t + 1])] = a; par[find(p.idx[t + 2])] = a; }
    const wp = new Float32Array(dups.length * 3); dups.forEach((d, w) => wp.set(p.pos.subarray(d[0] * 3, d[0] * 3 + 3), w * 3));
    const [sidx] = MeshoptSimplifier.simplify(Uint32Array.from(p.idx, (v: number) => weld[v]), wp, 3, target * 3, 0.2, []);
    const idx = new Uint32Array(sidx.length);
    for (let t = 0; t < sidx.length; t += 3) { const cnt = new Map<number, number>(); for (let q = 0; q < 3; q++) for (const v of dups[sidx[t + q]]) { const r = find(v); cnt.set(r, (cnt.get(r) ?? 0) + 1); }
      let best = -1, bn = 0; for (const [r, c] of cnt) if (c > bn) { bn = c; best = r; }
      for (let q = 0; q < 3; q++) idx[t + q] = dups[sidx[t + q]].find(v => find(v) === best) ?? dups[sidx[t + q]][0]; }
    const c = compact({ pos: p.pos, nrm: p.nrm, uv: p.uv, idx });
    out.push({ name, attributes: { POSITION: c.pos, NORMAL: c.nrm, TEXCOORD_0: c.uv }, indices: c.idx, ...(p.node.translation ? { translation: p.node.translation } : {}) });
    console.log(name, p.idx.length / 3, '->', c.idx.length / 3);
  }
  await writeGlb(`${DIR}/rifle-world.glb`, out, { ...g.json.asset.extras, note: 'world level of detail of rifle.glb (no TANGENT: the world material does not use the normal map)' });
}
main();
