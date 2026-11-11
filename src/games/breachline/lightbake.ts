/** Lighting is computed once, when the map loads, and stored in vertex colours: a low evening sun and sky outdoors,
 * ceiling lamps indoors, each shadowed by ray tests against the level. Nothing is lit per pixel at run time, which is
 * what lets the game hold its frame rate on integrated graphics. */
import { WALL_H } from './config';
import { MAP, newWorld } from './map';
import { obstruction } from './world';

export type RGB = [number, number, number];
export interface Bake {
  /** Light arriving at a surface point with the given normal. */
  light(x: number, y: number, z: number, nx: number, ny: number, nz: number): RGB;
  /** Light for something standing at (x, z): fighters, the weapon in hand, effects. */
  probe(x: number, z: number): RGB;
}

const len = Math.hypot(-0.52, 0.4, 0.76);
export const SUN = { x: -0.52 / len, y: 0.4 / len, z: 0.76 / len };
export const SUN_COLOR: RGB = [1.55, 1.12, 0.7], SKY: RGB = [0.3, 0.37, 0.52];
const FILL: RGB = [0.105, 0.11, 0.125];
const PROBE = 1;

export function createBake(): Bake {
  // Walls whole, outside barricades shut, inside doorways open: the level as a round begins.
  const world = newWorld(), b = MAP.building, cache = new Map<number, RGB>();
  const indoors = (x: number, y: number, z: number) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < WALL_H + 0.02;
  function compute(x: number, y: number, z: number, nx: number, ny: number, nz: number): RGB {
    const px = x + nx * 0.07, py = Math.max(0.03, y + ny * 0.07), pz = z + nz * 0.07;
    if (!indoors(px, py, pz)) {
      const up = 0.62 + 0.38 * ny, ndl = nx * SUN.x + ny * SUN.y + nz * SUN.z;
      let sun = 0;
      if (ndl > 0 && obstruction(world, px, py, pz, px + SUN.x * 70, py + SUN.y * 70, pz + SUN.z * 70) === 0) sun = ndl;
      // A little warm bounce keeps shadowed faces from going flat.
      const bounce = 0.07 * (1 - ny) * 0.5;
      return [SKY[0] * up + SUN_COLOR[0] * (sun + bounce), SKY[1] * up + SUN_COLOR[1] * (sun + bounce), SKY[2] * up + SUN_COLOR[2] * (sun + bounce)];
    }
    let r = FILL[0], g = FILL[1], bl = FILL[2];
    for (const l of MAP.lamps) {
      const dx = l.x - px, dy = l.y - py, dz = l.z - pz, d = Math.hypot(dx, dy, dz);
      if (d >= l.range) continue;
      const fall = (1 - d / l.range) ** 2, ndl = Math.max(0, (dx * nx + dy * ny + dz * nz) / Math.max(d, 1e-4)) * 0.72 + 0.28;
      const seen = obstruction(world, px, py, pz, l.x, l.y, l.z) === 0 ? 1 : 0.1;
      const k = 1.5 * fall * ndl * seen;
      r += l.color[0] * k; g += l.color[1] * k; bl += l.color[2] * k;
    }
    // Contact shade where walls meet the floor and ceiling.
    const edge = ny === 0 ? Math.min(1, 0.72 + Math.min(y, WALL_H - y) * 1.1) : 1;
    return [r * edge, g * edge, bl * edge];
  }
  const probes = new Map<number, RGB>();
  const probeAt = (ix: number, iz: number): RGB => {
    const key = ix * 4096 + iz;
    let v = probes.get(key);
    if (!v) {
      const x = ix * PROBE, z = iz * PROBE, up = compute(x, 1.1, z, 0, 1, 0), side = compute(x, 1.1, z, 0, 0, 0);
      v = [(up[0] + side[0]) * 0.5, (up[1] + side[1]) * 0.5, (up[2] + side[2]) * 0.5];
      probes.set(key, v);
    }
    return v;
  };
  return {
    light(x, y, z, nx, ny, nz) {
      const key = ((Math.round(x * 8) + 2048) * 4096 + (Math.round(z * 8) + 2048)) * 64 * 27 + Math.round(y * 8) * 27 + (Math.round(nx) + 1) * 9 + (Math.round(ny) + 1) * 3 + Math.round(nz) + 1;
      let v = cache.get(key);
      if (!v) { v = compute(x, y, z, nx, ny, nz); cache.set(key, v); }
      return v;
    },
    probe(x, z) {
      const fx = x / PROBE, fz = z / PROBE, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
      const a = probeAt(ix, iz), c = probeAt(ix + 1, iz), d = probeAt(ix, iz + 1), e = probeAt(ix + 1, iz + 1), out: RGB = [0, 0, 0];
      for (let i = 0; i < 3; i++) out[i] = (a[i] * (1 - tx) + c[i] * tx) * (1 - tz) + (d[i] * (1 - tx) + e[i] * tx) * tz;
      return out;
    },
  };
}
