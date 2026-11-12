import { describe, expect, it } from 'vitest';
import { firstDressing, surfaceAt, MARKS } from '../../../src/games/breachline/render/surfacehit';

/** Section 10.1 of the map-fill plan: every surface a round can stop on answers with its own material. */
describe('what a stopped round hit', () => {
  it('reads the ground and the ceiling by what covers them there', () => {
    expect(surfaceAt(null, 0, 0, 15, 1)).toBe('earth');          // South Yard asphalt
    expect(surfaceAt(null, -1, 0, -6, 1)).toBe('tile');          // Lab tiles
    expect(surfaceAt(null, -3, 0, 6, 1)).toBe('fabric');         // Office carpet
    expect(surfaceAt(null, 4, 0, 5, 1)).toBe('wood');            // Archive boards
    expect(surfaceAt({ mat: 'concrete', y0: 3 }, -1, 3, -6, -1)).toBe('ceiling');
  });
  it('reads boxes by material, brick by which side of the shell', () => {
    expect(surfaceAt({ mat: 'brick', y0: 0 }, 0, 1.5, 10.2, 0)).toBe('brick');
    expect(surfaceAt({ mat: 'brick', y0: 0 }, 0, 1.5, 9.8, 0)).toBe('concrete');
    expect(surfaceAt({ mat: 'crate', y0: 0 }, 2, 0.5, 13, 0)).toBe('wood');
    expect(surfaceAt({ mat: 'fabric', y0: 0 }, -8, 0.5, 3, 0)).toBe('fabric');
    expect(surfaceAt({ mat: 'van', y0: 0 }, 7, 0.5, 15, 0)).toBe('fabric');
    expect(surfaceAt({ mat: 'rack', y0: 0 }, 8, 1, -6, 0)).toBe('metal');
  });
  it('has a mark for every material it can name, except steel (a scar)', () => {
    for (const k of ['earth', 'tile', 'fabric', 'wood', 'ceiling', 'brick', 'concrete', 'wall']) expect(MARKS[k]).toBeDefined();
  });
});

describe('the first dressing piece a round passes through', () => {
  it('matches testing every piece, for random pieces and rounds', () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const list = Array.from({ length: 400 }, () => {
      const x = rnd() * 40 - 20, y = rnd() * 2.5, z = rnd() * 30 - 15, w = 0.05 + rnd() * (rnd() < 0.1 ? 4 : 0.6), h = 0.05 + rnd() * 0.8, d = 0.05 + rnd() * 0.6;
      return { x0: x, y0: y, z0: z, x1: x + w, y1: y + h, z1: z + d, key: 'k' };
    });
    const brute = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tmax: number) => {
      let best: { t: number; p: (typeof list)[number] } | null = null;
      for (const b of list) {
        let t0 = 0.05, t1 = best ? best.t : tmax - 0.02;
        const o = [ox, oy, oz], dv = [dx, dy, dz], lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
        let hitAxis = false;
        for (let k = 0; k < 3; k++) { let a = (lo[k] - o[k]) / dv[k], c = (hi[k] - o[k]) / dv[k]; if (a > c) [a, c] = [c, a]; if (a > t0) { t0 = a; hitAxis = true; } t1 = Math.min(t1, c); }
        if (t0 <= t1 && hitAxis) best = { t: t0, p: b };
      }
      return best;
    };
    let hits = 0;
    for (let n = 0; n < 3000; n++) {
      const ox = rnd() * 50 - 25, oy = rnd() * 3, oz = rnd() * 40 - 20;
      let dx = rnd() - 0.5, dy = (rnd() - 0.5) * 0.3, dz = rnd() - 0.5;
      if (n % 50 === 0) dx = 0; else if (n % 50 === 1) dz = 0;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const tmax = 2 + rnd() * 40, want = brute(ox, oy, oz, dx, dy, dz, tmax), got = firstDressing(list, ox, oy, oz, dx, dy, dz, tmax);
      expect(got?.p ?? null).toBe(want?.p ?? null);
      if (want) { hits++; expect(got!.t).toBeCloseTo(want.t, 9); }
    }
    expect(hits).toBeGreaterThan(300);
  });
  it('finds a nearer piece in the next cell than a long one met in the first', () => {
    // A long shelf over the first two 2 m cells (the pin sets the grid's corner at 0),, hit by a climbing round only past the first cell; a post there is nearer.
    const shelf = { x0: 0.5, y0: 1.5, z0: 0, x1: 3.5, y1: 2.5, z1: 1, key: 'shelf' }, post = { x0: 2.05, y0: 0, z0: 0, x1: 2.08, y1: 3, z1: 1, key: 'post' };
    const l = Math.hypot(1, 0.5);
    expect(firstDressing([{ x0: 0, y0: 0, z0: 5, x1: 0.01, y1: 0.01, z1: 5.01, key: 'pin' }, shelf, post], 0.1, 0.5, 0.5, 1 / l, 0.5 / l, 0, 10)?.key).toBe('post');
  });
});
