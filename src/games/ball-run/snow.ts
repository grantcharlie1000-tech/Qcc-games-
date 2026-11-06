/** Christmas: a light covering of snow on top of every obstacle. One instanced pool draws all of the caps,
 * so the season adds a single draw call. The cap is a unit mound (x and z in [-0.5, 0.5], base at y = 0,
 * crest at y = 1) that scene.ts scales to each block's top: slightly wider than the block, so a soft lip
 * hangs over the edges, and a few centimetres thick. Collision ignores it. */
import * as THREE from 'three';

/** Thickness at the crest, overhang past each edge, and how far the lip hangs below the block's top (metres). */
export const SNOW_DEPTH = .075, SNOW_OVERHANG = .03, SNOW_SINK = .004;
const N = 14, LIP = -.35;

/** Deterministic [0, 1) lumps, so every mount draws the same snow. */
const lump = (i: number, j: number) => {
  let h = Math.imul(i * 374761393 + j * 668265263, 1274126177) >>> 0;
  h = Math.imul(h ^ h >>> 13, 1274126177) >>> 0;
  return (h ^ h >>> 16) / 4294967296;
};

export function snowCapGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  // Top: a grid whose height rises from the rounded edge to a gently lumpy crest.
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = i / N - .5, z = j / N - .5;
    const edge = Math.min(.5 - Math.abs(x), .5 - Math.abs(z)) / .5;
    const rise = Math.sin(Math.min(1, edge / .32) * Math.PI / 2);
    const bumps = i && j && i < N && j < N ? .22 * (lump(i, j) - .5) : 0;
    positions.push(x, .3 + .7 * rise + bumps * rise, z);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + N + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // The lip: the grid's rim drawn straight down past the block's top edge. It stays at the cap's full size, so
  // on any width it hangs outside the block's faces (the overhang is a fixed 3 cm, not a share of the width).
  const rim: number[] = [];
  for (let i = 0; i < N; i++) rim.push(i);
  for (let j = 0; j < N; j++) rim.push(j * (N + 1) + N);
  for (let i = N; i > 0; i--) rim.push(N * (N + 1) + i);
  for (let j = N; j > 0; j--) rim.push(j * (N + 1));
  const base = positions.length / 3;
  for (const v of rim) positions.push(positions[v * 3], LIP, positions[v * 3 + 2]);
  for (let k = 0; k < rim.length; k++) {
    const next = (k + 1) % rim.length, top0 = rim[k], top1 = rim[next], low0 = base + k, low1 = base + next;
    // The rim runs clockwise seen from above (+x right, +z toward the viewer), so this winding faces outward.
    indices.push(top0, top1, low0, top1, low1, low0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  // Like the blocks, the snow is unlit with its light baked in: shaded at a typical block's real proportions
  // (a mound a few centimetres high on a top about a metre across), white where it faces the sky and a cool
  // lavender in the lip's shade, so its soft shape reads against the scene without any light in the scene.
  const real = g.clone();
  real.scale(1.2, SNOW_DEPTH, 1.2);
  real.computeVertexNormals();
  const normals = real.getAttribute('normal'), colors = new Float32Array(normals.count * 3);
  const sun = new THREE.Vector3(.3, 1, .6).normalize(), normal = new THREE.Vector3(), lit = new THREE.Color(0xf6f9ff), shade = new THREE.Color(0x8e98cf), c = new THREE.Color();
  for (let v = 0; v < normals.count; v++) {
    const light = Math.max(0, normal.fromBufferAttribute(normals, v).dot(sun)), rim = positions[v * 3 + 1] < .3 ? .85 : 1;
    c.copy(shade).lerp(lit, Math.min(1, (.3 + .7 * light / sun.y * .9) * rim));
    c.toArray(colors, v * 3);
  }
  real.dispose();
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // The material is unlit, so the normals were only needed for the baked shading.
  g.deleteAttribute('normal');
  return g;
}
