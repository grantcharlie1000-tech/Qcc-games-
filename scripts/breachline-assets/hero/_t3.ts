import { MeshoptSimplifier as S } from 'meshoptimizer';
import { ar5Parts } from '../../../src/games/breachline/render/hero/sculpt/ar5';
import { meshField } from './mesher';
await S.ready;
const p = ar5Parts(false).find(q => q.name === 'lower')!;
const m = meshField(p.s.f, p.s.b, 0.4);
const hits = (idx: Uint32Array) => { const out: number[] = []; const P = m.pos; const oy = -35, oz = -137;
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    // 2D point-in-triangle in (y, z), then x by barycentric
    const y1 = P[a + 1], z1 = P[a + 2], y2 = P[b + 1], z2 = P[b + 2], y3 = P[c + 1], z3 = P[c + 2];
    const d = (y2 - y1) * (z3 - z1) - (y3 - y1) * (z2 - z1); if (Math.abs(d) < 1e-12) continue;
    const w1 = ((y2 - oy) * (z3 - oz) - (y3 - oy) * (z2 - oz)) / d, w2 = ((y3 - oy) * (z1 - oz) - (y1 - oy) * (z3 - oz)) / d, w3 = 1 - w1 - w2;
    if (w1 >= 0 && w2 >= 0 && w3 >= 0) out.push(+(P[a] * w1 + P[b] * w2 + P[c] * w3).toFixed(2)); }
  return out.sort((x, y) => x - y).join(' '); };
console.log('raw', hits(m.idx));
for (const e of [0.03, 0.1, 0.3, 1]) { const [i] = S.simplify(m.idx, m.pos, 3, 0, e, ['ErrorAbsolute']); console.log(e, i.length / 3, hits(i)); }
