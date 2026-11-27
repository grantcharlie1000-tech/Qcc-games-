/** Drops triangles the Crossy camera, or its flattened shadow projection, can never face.
 * The orthographic view is fixed (45° pitch, 20° yaw) and casters only yaw about Y, with positive
 * scale. A triangle that stays back-facing for every yaw the mesh actually uses is already discarded
 * by the GPU's front-face cull, so removing it does not change a pixel. The shadow pass flattens
 * geometry onto the ground; its facing test is the projected winding after that flatten, across the
 * horizontal scales the mesh can be drawn at. Player tumble and the UFO's free spin are not clipped. */
import * as THREE from 'three';

export interface ViewBasis {
  right: readonly [number, number, number];
  up: readonly [number, number, number];
  slope: number;
}

const EPS = 1e-8;

/** Camera right and up for the same pitch, yaw and sun slope the renderer uses. */
export function viewBasis(pitch: number, yaw: number, distance: number, slope: number): ViewBasis {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, distance * 2 + 10);
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch), fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  camera.position.set(-fx * cosP * distance, sinP * distance, -fz * cosP * distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const e = camera.matrixWorld.elements;
  return {right: [e[0], e[1], e[2]], up: [e[4], e[5], e[6]], slope};
}

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** True when ax²+bx+c exceeds EPS anywhere on [lo, hi]. A downward parabola is sampled at its vertex. */
function positiveOn(a: number, b: number, c: number, lo: number, hi: number): boolean {
  const at = (x: number): number => (a * x + b) * x + c;
  if (!(at(lo) <= EPS) || !(at(hi) <= EPS)) return true;
  if (a < -1e-14) {
    const vertex = -b / (2 * a);
    if (vertex > lo && vertex < hi && !(at(vertex) <= EPS)) return true;
  }
  return false;
}

/** Returns `geometry` itself when every triangle faces the camera (or the shadow). Otherwise a
 * new geometry whose vertices are copied, not moved. */
export function clipFacing(geometry: THREE.BufferGeometry, basis: ViewBasis, yaws: readonly number[], shadow: boolean, sx: readonly [number, number] = [1, 1]): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const triangles = index ? index.count / 3 : position.count / 3;
  const right = basis.right, up = basis.up, slope = basis.slope;
  const keep: number[] = [];
  const yawed = yaws.map(yaw => [Math.cos(yaw), Math.sin(yaw)] as const);
  for (let t = 0; t < triangles; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const p = [i0, i1, i2].map(i => [position.getX(i), position.getY(i), position.getZ(i)] as const);
    let faces = false;
    for (const [c, s] of yawed) {
      const w = p.map(([x, y, z]) => [c * x + s * z, y, -s * x + c * z] as const);
      if (!shadow) {
        const q = w.map(([x, y, z]) => [x * right[0] + y * right[1] + z * right[2], x * up[0] + y * up[1] + z * up[2]] as const);
        if (!(cross(q[0][0], q[0][1], q[1][0], q[1][1], q[2][0], q[2][1]) <= EPS)) { faces = true; break; }
        continue;
      }
      // Flatten: world (sx·xr + slope·y, constant, zr). Screen edges are linear in sx.
      const e1x = w[1][0] - w[0][0], e1y = w[1][1] - w[0][1], e1z = w[1][2] - w[0][2];
      const e2x = w[2][0] - w[0][0], e2y = w[2][1] - w[0][1], e2z = w[2][2] - w[0][2];
      const a1s = e1x * right[0], b1s = slope * e1y * right[0] + e1z * right[2];
      const a1u = e1x * up[0], b1u = slope * e1y * up[0] + e1z * up[2];
      const a2s = e2x * right[0], b2s = slope * e2y * right[0] + e2z * right[2];
      const a2u = e2x * up[0], b2u = slope * e2y * up[0] + e2z * up[2];
      const quadA = a1s * a2u - a1u * a2s;
      const quadB = a1s * b2u - a1u * b2s + b1s * a2u - b1u * a2s;
      const quadC = b1s * b2u - b1u * b2s;
      if (positiveOn(quadA, quadB, quadC, sx[0], sx[1])) { faces = true; break; }
    }
    if (faces) keep.push(t);
  }
  if (keep.length === triangles) return geometry;

  const remap = new Int32Array(position.count).fill(-1);
  const order: number[] = [];
  const indices = new Uint32Array(keep.length * 3);
  let n = 0;
  for (let k = 0; k < keep.length; k++) {
    const t = keep[k];
    for (let v = 0; v < 3; v++) {
      const from = index ? index.getX(t * 3 + v) : t * 3 + v;
      let to = remap[from];
      if (to < 0) { to = order.length; remap[from] = to; order.push(from); }
      indices[n++] = to;
    }
  }
  const clipped = new THREE.BufferGeometry();
  for (const name of Object.keys(geometry.attributes)) {
    const attribute = geometry.getAttribute(name);
    if (!(attribute instanceof THREE.BufferAttribute)) throw new Error(`Crossy clip cannot copy ${name}`);
    const item = attribute.itemSize;
    const out = new Float32Array(order.length * item);
    for (let i = 0; i < order.length; i++) for (let c = 0; c < item; c++) out[i * item + c] = attribute.getComponent(order[i], c);
    clipped.setAttribute(name, new THREE.BufferAttribute(out, item, attribute.normalized));
  }
  clipped.setIndex(new THREE.BufferAttribute(order.length > 65535 ? indices : new Uint16Array(indices), 1));
  clipped.computeBoundingSphere();
  return clipped;
}
