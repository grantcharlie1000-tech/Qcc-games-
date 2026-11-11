/** The map-fill pass's rules (docs/superpowers/plans/2026-11-11-breachline-map-fill.md, section 3) and targets
 * (section 2), checked from map data. Where a rule and a target conflict the rule wins; those conflicts are pinned
 * here as they stand and reported in the evidence STATUS. */
import { describe, expect, it } from 'vitest';
import { MAP } from '../../../src/games/breachline/map';
import { createNav, route } from '../../../src/games/breachline/nav';
import { newWorld } from '../../../src/games/breachline/map';
import { OUTDOOR, baselineIntact, corridorSight, fill, fits, forEmpty, violations } from './mapfill';

describe('map fill pass', () => {
  it('only adds boxes: every existing box is unchanged and in place', () => {
    expect(baselineIntact()).toBe(true);
    expect(fill().length).toBeGreaterThan(40);
  });

  it('keeps every section 3 rule that can be checked from data', () => {
    expect(violations()).toEqual([]);
  });

  it('uses only the two cover heights, and gives every room some of each', () => {
    for (const b of fill()) expect(b.y1 <= 1.1 || b.y1 >= 1.8).toBe(true);
    for (const r of MAP.rooms) {
      if (OUTDOOR.has(r.name) || r.name === 'Corridor') continue;
      const inRoom = fill().filter(b => (b.x0 + b.x1) / 2 > r.x0 && (b.x0 + b.x1) / 2 < r.x1 && (b.z0 + b.z1) / 2 > r.z0 && (b.z0 + b.z1) / 2 < r.z1);
      expect(inRoom.some(b => b.y1 <= 1.1), `${r.name} waist-high`).toBe(true);
      expect(inRoom.some(b => b.y1 >= 1.8), `${r.name} full-height`).toBe(true);
    }
  });

  it('leaves a route from every attack spawn into both sites and up to both sides of every door', () => {
    const nav = createNav(newWorld()), open = { barricade: 6, wall: Infinity };
    for (const g of MAP.attackSpawns) {
      const s = g.points[0];
      for (const site of MAP.sites) expect(route(nav, s.x, s.z, (site.x0 + site.x1) / 2, (site.z0 + site.z1) / 2, open), `${g.name} to ${site.name}`).not.toBeNull();
      for (const p of MAP.panels) {
        if (p.kind !== 'door') continue;
        const u = p.u0 + p.cols * 0.125;
        for (const side of [-0.8, 0.8]) {
          const x = p.axis === 'x' ? u : p.pos + side, z = p.axis === 'x' ? p.pos + side : u;
          if (x < MAP.bounds.x0 || x > MAP.bounds.x1 || z < MAP.bounds.z0 || z > MAP.bounds.z1) continue;
          expect(route(nav, s.x, s.z, x, z, open), `${g.name} to the door at ${p.axis}=${p.pos}, ${u}`).not.toBeNull();
        }
      }
    }
  });

  it('meets the empty-floor targets in every room and lane, except where the rules leave no room (reported)', () => {
    const over: string[] = [];
    for (const r of MAP.rooms) {
      const [w, h] = OUTDOOR.has(r.name) ? [12, 5] : [4, 3];
      if (r.name === 'Corridor') continue;
      if (fits(r, w + 0.25, h + 0.25, forEmpty())) over.push(r.name);
    }
    // The North Yard keeps one long strip under the outer windows and along the perimeter that the 0.75 m window
    // clearance and the 1.2 m route rule leave unfillable at greybox; it is reported, not hidden.
    expect(over).toEqual(['North Yard']);
  });

  it('pins the corridor sight line: both corridor walls are destructible, so rule 2 leaves no legal cover there', () => {
    // Conflict reported to the planner: rule 2 (0.75 m from every panel) and rule 3 (1.8 m of lane) leave no place
    // for the plan's corridor stubs, so the 12 m target is not met by cover. Update this when the planner decides.
    expect(corridorSight().length).toBeGreaterThan(12);
  });
});
