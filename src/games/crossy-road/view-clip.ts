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
 * new geometry whose vertices are copied, not moved. Supports non-uniform positive scale ranges. */
export function clipFacing(
  geometry: THREE.BufferGeometry,
  basis: ViewBasis,
  yaws: readonly number[],
  shadow: boolean,
  sx: readonly [number, number] = [1, 1],
  sy: readonly [number, number] = [1, 1],
  sz: readonly [number, number] = [1, 1],
): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const triangles = index ? index.count / 3 : position.count / 3;
  const right = basis.right, up = basis.up, slope = basis.slope;
  const keep: number[] = [];
  const yawed = yaws.map(yaw => [Math.cos(yaw), Math.sin(yaw)] as const);
  const xs = sx[0] === sx[1] ? [sx[0]] : [sx[0], sx[1]];
  const ys = sy[0] === sy[1] ? [sy[0]] : [sy[0], sy[1]];
  const zs = sz[0] === sz[1] ? [sz[0]] : [sz[0], sz[1]];
  for (let t = 0; t < triangles; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const x0 = position.getX(i0), y0 = position.getY(i0), z0 = position.getZ(i0);
    const x1 = position.getX(i1), y1 = position.getY(i1), z1 = position.getZ(i1);
    const x2 = position.getX(i2), y2 = position.getY(i2), z2 = position.getZ(i2);
    let faces = false;
    outer: for (const [c, s] of yawed) {
      for (const ky of ys) for (const kz of zs) {
        if (!shadow) {
          for (const kx of xs) {
            const wx0 = c * x0 * kx + s * z0 * kz, wy0 = y0 * ky, wz0 = -s * x0 * kx + c * z0 * kz;
            const wx1 = c * x1 * kx + s * z1 * kz, wy1 = y1 * ky, wz1 = -s * x1 * kx + c * z1 * kz;
            const wx2 = c * x2 * kx + s * z2 * kz, wy2 = y2 * ky, wz2 = -s * x2 * kx + c * z2 * kz;
            const q0x = wx0 * right[0] + wy0 * right[1] + wz0 * right[2], q0y = wx0 * up[0] + wy0 * up[1] + wz0 * up[2];
            const q1x = wx1 * right[0] + wy1 * right[1] + wz1 * right[2], q1y = wx1 * up[0] + wy1 * up[1] + wz1 * up[2];
            const q2x = wx2 * right[0] + wy2 * right[1] + wz2 * right[2], q2y = wx2 * up[0] + wy2 * up[1] + wz2 * up[2];
            if (!(cross(q0x, q0y, q1x, q1y, q2x, q2y) <= EPS)) { faces = true; break outer; }
          }
          continue;
        }
        // Flatten: world (kx*(c*x) + kz*(s*z) + slope*ky*y, constant, kx*(-s*x) + kz*(c*z)).
        // Screen edges are linear in kx.
        const dx1 = x1 - x0, dy1 = (y1 - y0) * ky, dz1 = (z1 - z0) * kz;
        const dx2 = x2 - x0, dy2 = (y2 - y0) * ky, dz2 = (z2 - z0) * kz;
        const a1s = dx1 * (c * right[0] - s * right[2]);
        const b1s = (s * dz1 + slope * dy1) * right[0] + c * dz1 * right[2];
        const a1u = dx1 * (c * up[0] - s * up[2]);
        const b1u = (s * dz1 + slope * dy1) * up[0] + c * dz1 * up[2];
        const a2s = dx2 * (c * right[0] - s * right[2]);
        const b2s = (s * dz2 + slope * dy2) * right[0] + c * dz2 * right[2];
        const a2u = dx2 * (c * up[0] - s * up[2]);
        const b2u = (s * dz2 + slope * dy2) * up[0] + c * dz2 * up[2];
        const quadA = a1s * a2u - a1u * a2s;
        const quadB = a1s * b2u - a1u * b2s + b1s * a2u - b1u * a2s;
        const quadC = b1s * b2u - b1u * b2s;
        if (positiveOn(quadA, quadB, quadC, sx[0], sx[1])) { faces = true; break outer; }
      }
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

const BOX_FACES: readonly (readonly number[])[] = [
  [1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1],
  [-1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1],
  [-1, 1, -1, -1, 1, 1, 1, 1, 1, 1, 1, -1],
  [-1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1],
  [-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1],
  [-1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1, -1],
];

/** Builds a lightweight 1..N-tier voxel silhouette for projected ground shadows, preserving
 * the exact outer bounding box of `source` while dropping sub-voxel micro-detail triangles. */
export function shadowSilhouette(source: THREE.BufferGeometry, tiers = 1): THREE.BufferGeometry {
  const pos = source.getAttribute('position');
  let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity, gMinZ = Infinity, gMaxZ = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (x < gMinX) gMinX = x; if (x > gMaxX) gMaxX = x;
    if (y < gMinY) gMinY = y; if (y > gMaxY) gMaxY = y;
    if (z < gMinZ) gMinZ = z; if (z > gMaxZ) gMaxZ = z;
  }
  const height = gMaxY - gMinY;
  const bands = height > 1e-4 ? Math.max(1, tiers | 0) : 1;
  const boxes: [number, number, number, number, number, number][] = [];
  if (bands === 1) {
    boxes.push([gMinX, gMaxX, gMinY, gMaxY, gMinZ, gMaxZ]);
  } else {
    const minX = new Float64Array(bands).fill(Infinity), maxX = new Float64Array(bands).fill(-Infinity);
    const minZ = new Float64Array(bands).fill(Infinity), maxZ = new Float64Array(bands).fill(-Infinity);
    const minY = new Float64Array(bands).fill(Infinity), maxY = new Float64Array(bands).fill(-Infinity);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const b = Math.min(bands - 1, Math.max(0, Math.floor(((y - gMinY) / height) * bands)));
      if (x < minX[b]) minX[b] = x; if (x > maxX[b]) maxX[b] = x;
      if (y < minY[b]) minY[b] = y; if (y > maxY[b]) maxY[b] = y;
      if (z < minZ[b]) minZ[b] = z; if (z > maxZ[b]) maxZ[b] = z;
    }
    for (let b = 0; b < bands; b++) {
      if (!Number.isFinite(minX[b])) continue;
      const y0 = b === 0 ? gMinY : gMinY + (height * b) / bands;
      const y1 = b === bands - 1 ? gMaxY : gMinY + (height * (b + 1)) / bands;
      boxes.push([minX[b], maxX[b], Math.min(y0, minY[b]), Math.max(y1, maxY[b]), minZ[b], maxZ[b]]);
    }
    if (!boxes.length) boxes.push([gMinX, gMaxX, gMinY, gMaxY, gMinZ, gMaxZ]);
  }
  const position = new Float32Array(boxes.length * 6 * 4 * 3);
  const index = new Uint16Array(boxes.length * 6 * 6);
  let v = 0, ii = 0;
  for (const [x0, x1, y0, y1, z0, z1] of boxes) {
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5, cz = (z0 + z1) * 0.5;
    const hx = Math.max(1e-4, (x1 - x0) * 0.5), hy = Math.max(1e-4, (y1 - y0) * 0.5), hz = Math.max(1e-4, (z1 - z0) * 0.5);
    for (let f = 0; f < 6; f++) {
      const face = BOX_FACES[f];
      for (let k = 0; k < 4; k++) {
        const o = v * 3;
        position[o] = cx + face[k * 3] * hx;
        position[o + 1] = cy + face[k * 3 + 1] * hy;
        position[o + 2] = cz + face[k * 3 + 2] * hz;
        v++;
      }
      index[ii++] = v - 4; index[ii++] = v - 3; index[ii++] = v - 2;
      index[ii++] = v - 4; index[ii++] = v - 2; index[ii++] = v - 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
