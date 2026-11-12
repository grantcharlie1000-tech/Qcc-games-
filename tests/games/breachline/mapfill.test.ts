/** The map-fill pass's rules (docs/superpowers/plans/2026-11-11-breachline-map-fill.md, section 3) and targets
 * (section 2), checked from map data. Where a rule and a target conflict the rule wins; those conflicts are pinned
 * here as they stand and reported in the evidence STATUS. */
import { describe, expect, it } from 'vitest';
import { MAP } from '../../../src/games/breachline/map';
import { createNav, route } from '../../../src/games/breachline/nav';
import { newWorld } from '../../../src/games/breachline/map';
import { OUTDOOR, baselineIntact, corridorSight, fill, fits, forEmpty, isCorridorPiece, violations } from './mapfill';

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
    // Hand-placed set pieces (plan section 11) leave these over the empty-floor target, reported to the planner: the
    // Lobby's and Break Room's open middles are the routes between their doors and bot points (roam points need 1 m),
    // the North Yard keeps the strip under its windows, and the West Lot's open run is the attack spawn's 3 m ring.
    expect(over).toEqual(['Lobby', 'Break Room', 'North Yard', 'West Lot']);
  });

  it('leaves every panel a corridor piece stands against reachable from its room side (plan 11.6)', () => {
    const nav = createNav(newWorld()), open = { barricade: 6, wall: Infinity }, spawn = MAP.attackSpawns[0].points[0];
    const pieces = fill().filter(isCorridorPiece);
    expect(pieces).toHaveLength(3);
    for (const b of pieces) for (const p of MAP.panels) {
      if (p.kind !== 'wall' || p.axis !== 'x' || Math.abs(p.pos - (b.z0 < 0 ? -2 : 1)) > 0.01) continue;
      const a = p.u0, e = p.u0 + p.cols * 0.25;
      if (e <= b.x0 || a >= b.x1) continue;
      const room = p.pos < 0 ? p.pos - 0.6 : p.pos + 0.6, x = Math.max(a, b.x0) + 0.25;
      expect(route(nav, spawn.x, spawn.z, x, room, open), `panel at z=${p.pos} behind the piece at x ${b.x0}`).not.toBeNull();
    }
  });

  it('pins the corridor sight line: both corridor walls are destructible, so rule 2 leaves no legal cover there', () => {
    // Conflict reported to the planner: rule 2 (0.75 m from every panel) and rule 3 (1.8 m of lane) leave no place
    // for the plan's corridor stubs, so the 12 m target is not met by cover. Update this when the planner decides.
    expect(corridorSight().length).toBeGreaterThan(12);
  });
});
