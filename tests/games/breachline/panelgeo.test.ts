import { describe, expect, it } from 'vitest';
import { CELL } from '../../../src/games/breachline/config';
import { panelGeometry } from '../../../src/games/breachline/levelmesh';
import { newWorld } from '../../../src/games/breachline/map';

const light = () => [1, 1, 1] as [number, number, number];
let seed = 42;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

describe('Breachline destructible panel geometry', () => {
  it('puts studs only in intact cells, so nothing solid shows where the simulation has a gap', () => {
    const world = newWorld();
    const walls = world.panels.filter(p => p.kind === 'wall');
    for (let trial = 0; trial < 60; trial++) {
      const p = walls[trial % walls.length];
      p.cells.fill(1);
      // Knock out a random blob of cells, as gunfire and charges do.
      const cc = Math.floor(rnd() * p.cols), cr = Math.floor(rnd() * p.rows), rad = 1 + rnd() * 4;
      for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) if (Math.hypot(c - cc, r - cr) < rad || rnd() < 0.05) p.cells[r * p.cols + c] = 0;
      p.intact = p.cells.reduce((n, v) => n + v, 0);
      if (!p.intact) continue;
      const { geometry, studs } = panelGeometry(p, null, light);
      for (const s of studs) expect(p.cells[s.r * p.cols + s.c]).toBe(1);
      const pos = geometry.getAttribute('position').array as Float32Array;
      expect(pos.every(v => Number.isFinite(v))).toBe(true);
      // Ragged rims tear back into the board, never out past the panel (checked as the extremes, one assertion each).
      const span = p.cols * CELL;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < pos.length; i += 3) { const u = p.axis === 'x' ? pos[i] : pos[i + 2]; lo = Math.min(lo, u); hi = Math.max(hi, u); }
      expect(lo).toBeGreaterThanOrEqual(p.u0 - 1e-6);
      expect(hi).toBeLessThanOrEqual(p.u0 + span + 1e-6);
      geometry.dispose();
    }
  });
  it('keeps an undamaged wall to its two faces', () => {
    const p = newWorld().panels.find(q => q.kind === 'wall')!;
    const { geometry, studs } = panelGeometry(p, null, light);
    expect(studs.length).toBe(0);
    expect(geometry.groups.length).toBe(1);
  });
});
