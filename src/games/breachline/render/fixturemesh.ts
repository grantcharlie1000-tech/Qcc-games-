/** Modelled ceiling troffers for the asset-rendered rooms: a shallow painted-steel housing, a rim, and a prismatic
 * diffuser that glows (bright enough to bloom). The light they cast is baked; this is only their look. */
import * as THREE from 'three';
import { WALL_H } from '../config';
import { FIXTURE_Y, type Fixture } from './fixtures';

/** Underside of the housing; the baker's light samples sit just below it. */
export const DIFFUSER_Y = FIXTURE_Y + 0.006;
const LIP = 0.035, GLOW = 5;

let diffuserTex: THREE.CanvasTexture | null = null;
/** A prismatic lens: fine diamond facets, two brighter bands where the tubes sit, dimmer towards the frame. */
function diffuser(): THREE.CanvasTexture {
  if (diffuserTex) return diffuserTex;
  const W = 256, H = 128, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!, img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const facet = 0.93 + 0.07 * Math.abs(Math.sin((x + y) * 0.9) * Math.sin((x - y) * 0.9));
    const tubes = 0.78 + 0.22 * (Math.exp(-(((v - 0.33) / 0.09) ** 2)) + Math.exp(-(((v - 0.67) / 0.09) ** 2)));
    const edge = Math.min(1, Math.min(u, 1 - u) * 14) * Math.min(1, Math.min(v, 1 - v) * 9);
    const l = facet * tubes * (0.72 + 0.28 * edge) * 255, i = (y * W + x) * 4;
    img.data[i] = l; img.data[i + 1] = l; img.data[i + 2] = l; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  diffuserTex = new THREE.CanvasTexture(c);
  diffuserTex.colorSpace = THREE.SRGBColorSpace;
  diffuserTex.anisotropy = 4;
  return diffuserTex;
}

/** One mesh for every housing (vertex-coloured, lit by its own glow) and one for every diffuser. */
export function fixtureMeshes(list: readonly Fixture[]): { meshes: THREE.Mesh[]; dispose(): void } {
  const hp: number[] = [], hc: number[] = [], hi: number[] = [];
  const dp: number[] = [], du: number[] = [], dc: number[] = [], di: number[] = [];
  const quad = (p: number[], c: number[], idx: number[], v: number[][], col: number[]) => {
    const b = p.length / 3;
    for (const q of v) { p.push(...q); c.push(...col); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  for (const f of list) {
    const x0 = f.x - f.w / 2, x1 = f.x + f.w / 2, z0 = f.z - f.d / 2, z1 = f.z + f.d / 2;
    const X0 = x0 - LIP, X1 = x1 + LIP, Z0 = z0 - LIP, Z1 = z1 + LIP, y = DIFFUSER_Y, top = WALL_H;
    // Rim around the diffuser, facing down (lit by the diffuser beside it), then the housing's four sides.
    const rim = [0.95 * f.color[0], 0.95 * f.color[1], 0.95 * f.color[2]], side = [0.62, 0.62, 0.6];
    quad(hp, hc, hi, [[X0, y, Z0], [X1, y, Z0], [X1, y, z0], [X0, y, z0]], rim);
    quad(hp, hc, hi, [[X0, y, z1], [X1, y, z1], [X1, y, Z1], [X0, y, Z1]], rim);
    quad(hp, hc, hi, [[X0, y, z0], [x0, y, z0], [x0, y, z1], [X0, y, z1]], rim);
    quad(hp, hc, hi, [[x1, y, z0], [X1, y, z0], [X1, y, z1], [x1, y, z1]], rim);
    quad(hp, hc, hi, [[X0, y, Z1], [X1, y, Z1], [X1, top, Z1], [X0, top, Z1]], side);
    quad(hp, hc, hi, [[X1, y, Z0], [X0, y, Z0], [X0, top, Z0], [X1, top, Z0]], side);
    quad(hp, hc, hi, [[X1, y, Z1], [X1, y, Z0], [X1, top, Z0], [X1, top, Z1]], side);
    quad(hp, hc, hi, [[X0, y, Z0], [X0, y, Z1], [X0, top, Z1], [X0, top, Z0]], side);
    // The prismatic lens bulges a few millimetres below the rim, so it shows at shallow angles.
    const b = dp.length / 3, yd = y - 0.004;
    for (const [s, t] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      dp.push(x0 + s * f.w, yd, z0 + t * f.d); du.push(s, t); dc.push(f.color[0] * GLOW, f.color[1] * GLOW, f.color[2] * GLOW);
    }
    di.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const make = (p: number[], c: number[], idx: number[], uv: number[] | null, mat: THREE.Material) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false;
    return m;
  };
  // Housing faces are wound for viewing from below and inside the room; draw both sides to be safe.
  const housing = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const lens = new THREE.MeshBasicMaterial({ vertexColors: true, map: diffuser(), side: THREE.DoubleSide });
  const meshes = [make(hp, hc, hi, null, housing), make(dp, dc, di, du, lens)];
  return { meshes, dispose() { for (const m of meshes) m.geometry.dispose(); housing.dispose(); lens.dispose(); } };
}
