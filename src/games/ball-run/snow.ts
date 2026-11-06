/** Christmas: a light covering of snow on top of every obstacle. One instanced pool draws all of the caps,
 * so the season adds a single draw call. scene.ts scales the cap to each block's top: slightly wider than the
 * block, so a soft lip hangs over the edges, and a few centimetres thick. Collision ignores it.
 *
 * The rounded edge is a fixed width in metres on every block, from a 0.3 m post to a 14 m wall. Each vertex
 * has an anchor in the unit square (`position`, scaled by the instance) and an `inset` in metres, which the
 * vertex shader divides by the instance's scale before scaling. So the edge band and the baked shading are
 * the same on every block. Without the shader the cap is still a unit square with a collapsed edge band. */
import * as THREE from 'three';

/** Thickness at the crest, overhang past each edge, and how far the lip hangs below the block's top (metres). */
export const SNOW_DEPTH = .075, SNOW_OVERHANG = .03, SNOW_SINK = .004;
/** Width of the rounded edge band (metres). The narrowest cap is 0.36 m (a 0.3 m block plus overhang). */
export const SNOW_EDGE = .15;
const BAND = 4, INTERIOR = 10, LIP = -.35;

/** Deterministic [0, 1) lumps, so every mount draws the same snow. */
const lump = (i: number, j: number) => {
  let h = Math.imul(i * 374761393 + j * 668265263, 1274126177) >>> 0;
  h = Math.imul(h ^ h >>> 13, 1274126177) >>> 0;
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
};

/** One axis of the grid: anchor in the unit square, inset in metres, and distance from the edge in metres. */
interface Stop { anchor: number; inset: number; edge: number }
function axis(): Stop[] {
  const stops: Stop[] = [];
  for (let k = 0; k < BAND; k++) { const e = SNOW_EDGE * k / BAND; stops.push({ anchor: -.5, inset: e, edge: e }); }
  // Between the bands: from one band's inner edge to the other's, wherever they fall on this block.
  for (let k = 0; k <= INTERIOR; k++) { const t = k / INTERIOR; stops.push({ anchor: t - .5, inset: SNOW_EDGE * (1 - 2 * t), edge: SNOW_EDGE }); }
  for (let k = BAND - 1; k >= 0; k--) { const e = SNOW_EDGE * k / BAND; stops.push({ anchor: .5, inset: -e, edge: e }); }
  return stops;
}

/** The snow's material: unlit with baked shading, its vertex shader applying the metric insets. */
export function snowCapMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 inset;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
	transformed.xz += inset / vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz));
#endif`);
  };
  material.customProgramCacheKey = () => 'ball-run-snow-cap';
  return material;
}

export function snowCapGeometry(): THREE.BufferGeometry {
  const stops = axis(), M = stops.length, N = M - 1;
  const positions: number[] = [], insets: number[] = [], indices: number[] = [];
  // Top: a grid whose height rises over the edge band to a gently lumpy crest.
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const x = stops[i], z = stops[j], edge = Math.min(x.edge, z.edge);
    const rise = Math.sin(Math.min(1, edge / SNOW_EDGE) * Math.PI / 2);
    const inside = x.edge >= SNOW_EDGE && z.edge >= SNOW_EDGE && i > BAND && j > BAND && i < N - BAND && j < N - BAND;
    const y = .3 + .7 * rise + (inside ? .22 * (lump(i, j) - .5) : 0);
    positions.push(x.anchor, y, z.anchor); insets.push(x.inset, z.inset);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * M + i, b = a + M;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // The lip: the grid's rim drawn straight down past the block's top edge, at the cap's full size, so on any
  // block it hangs outside the faces by the overhang.
  const rim: number[] = [];
  for (let i = 0; i < N; i++) rim.push(i);
  for (let j = 0; j < N; j++) rim.push(j * M + N);
  for (let i = N; i > 0; i--) rim.push(N * M + i);
  for (let j = N; j > 0; j--) rim.push(j * M);
  const base = positions.length / 3;
  for (const v of rim) { positions.push(positions[v * 3], LIP, positions[v * 3 + 2]); insets.push(insets[v * 2], insets[v * 2 + 1]); }
  for (let k = 0; k < rim.length; k++) {
    const next = (k + 1) % rim.length, top0 = rim[k], top1 = rim[next], low0 = base + k, low1 = base + next;
    // The rim runs clockwise seen from above (+x right, +z toward the viewer), so this winding faces outward.
    indices.push(top0, top1, low0, top1, low1, low0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('inset', new THREE.Float32BufferAttribute(insets, 2));
  g.setIndex(indices);
  // Like the blocks, the snow is unlit with its light baked in. The shading is computed on the cap as it is
  // drawn, in metres (the edge band is the same on every block, so it is right for every block): white where
  // it faces the sky and a cool lavender in the lip's shade.
  const real = new THREE.BufferGeometry(), metric: number[] = [];
  for (let v = 0; v < positions.length / 3; v++) metric.push(positions[v * 3] * 1.2 + insets[v * 2], positions[v * 3 + 1] * SNOW_DEPTH, positions[v * 3 + 2] * 1.2 + insets[v * 2 + 1]);
  real.setAttribute('position', new THREE.Float32BufferAttribute(metric, 3));
  real.setIndex(indices);
  real.computeVertexNormals();
  const normals = real.getAttribute('normal'), colors = new Float32Array(normals.count * 3);
  const sun = new THREE.Vector3(.3, 1, .6).normalize(), normal = new THREE.Vector3(), lit = new THREE.Color(0xf6f9ff), shade = new THREE.Color(0x8e98cf), c = new THREE.Color();
  for (let v = 0; v < normals.count; v++) {
    const light = Math.max(0, normal.fromBufferAttribute(normals, v).dot(sun)), lip = positions[v * 3 + 1] < .3 ? .85 : 1;
    c.copy(shade).lerp(lit, Math.min(1, (.3 + .7 * light / sun.y * .9) * lip));
    c.toArray(colors, v * 3);
  }
  real.dispose();
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}
