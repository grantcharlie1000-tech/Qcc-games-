import { describe, expect, it } from 'vitest';
import { ROUND, SKILLS } from '../../../src/games/breachline/config';
import { MAP, newWorld } from '../../../src/games/breachline/map';
import { cellX, cellZ, createNav, crossing, route } from '../../../src/games/breachline/nav';
import { HostSession } from '../../../src/games/breachline/net';
import { bite, fillPanel } from '../../../src/games/breachline/world';
import { count, run } from './helpers';

const botsOnly = (seed: number, skill = 'regular' as (typeof SKILLS)[number], teamSize = 5) => {
  const s = new HostSession('x', { teamSize, bots: true, skill }, seed), me = s.m.players[s.self];
  me.bot = true; me.owner = '';
  s.start();
  return s;
};

describe('navigation', () => {
  const open = { barricade: 6, wall: Infinity };
  it('finds a way from every attacker spawn into both sites, only by breaking a barricade', () => {
    const nav = createNav(newWorld());
    for (const g of MAP.attackSpawns) for (const site of MAP.posts) {
      const path = route(nav, g.points[0].x, g.points[0].z, site[0].x, site[0].z, open)!;
      expect(path, g.name).not.toBeNull();
      let closed = 0;
      for (let i = 1; i < path.length; i++) { const x = crossing(nav, path[i - 1], path[i]); if (x && !x.open) closed++; }
      expect(closed).toBe(1);
      expect(route(nav, g.points[0].x, g.points[0].z, site[0].x, site[0].z, { barricade: Infinity, wall: Infinity })).toBeNull();
    }
  });
  it('routes through a breach once it is wide enough, and never through a reinforced wall', () => {
    const world = newWorld(), nav = createNav(world), panel = world.panels.find(p => p.kind === 'wall' && p.axis === 'x' && p.pos === -2 && p.u0 <= -4.5 && p.u0 + p.cols * 0.25 >= -3.5)!;
    const through = () => { const path = route(nav, -4, -0.5, -4, -3.5, { barricade: 6, wall: Infinity })!; return path.length; };
    const around = through();
    bite(world, panel, -4, 1, 0.3);
    expect(through()).toBe(around);
    bite(world, panel, -4, 1, 1.2);
    expect(through()).toBeLessThan(around);
    expect(through()).toBeLessThanOrEqual(8);
    fillPanel(world, panel, true);
    expect(through()).toBe(around);
    expect(route(nav, -4, -0.5, -4, -3.5, { barricade: 6, wall: 1 })!.length).toBe(around);
  });
  it('keeps routes off furniture and inside the yard', () => {
    const nav = createNav(newWorld()), path = route(nav, 0, 19, 3.7, 4.5, open)!;
    for (const c of path) { expect(nav.blocked[c]).toBe(0); expect(Math.abs(cellX(c))).toBeLessThan(28); expect(Math.abs(cellZ(c))).toBeLessThan(22); }
  });
});

describe('bots', () => {
  it('play whole matches to a result at every skill, with plants, defuses, set-up and breaking in', () => {
    let plants = 0, defused = 0, attackWins = 0, defendWins = 0, reinforced = 0;
    for (const skill of SKILLS) for (const seed of [1, 2]) {
      const s = botsOnly(seed, skill), events = run(s, 60 * 25, m => m.phase === 'over');
      expect(s.m.phase, `${skill} ${seed}`).toBe('over');
      expect(Math.max(...s.m.wins)).toBe(ROUND.toWin);
      plants += count(events, 'plant'); defused += count(events, 'defused'); reinforced += events.filter(e => e.e === 'panel' && e.s === 2).length;
      for (const e of events) if (e.e === 'phase' && e.phase === 'end') e.winner === e.attackers ? attackWins++ : defendWins++;
      expect(count(events, 'kill')).toBeGreaterThan(8);
    }
    expect(plants).toBeGreaterThan(6); expect(defused).toBeGreaterThan(1); expect(reinforced).toBeGreaterThan(20);
    // Neither role should run away with it.
    expect(attackWins / (attackWins + defendWins)).toBeGreaterThan(0.25);
    expect(attackWins / (attackWins + defendWins)).toBeLessThan(0.75);
  }, 60000);
  it('are deterministic for a seed', () => {
    const a = botsOnly(11, 'regular', 3), b = botsOnly(11, 'regular', 3), c = botsOnly(12, 'regular', 3);
    const ea = run(a, 90), eb = run(b, 90), ec = run(c, 90);
    expect(JSON.stringify(ea)).toBe(JSON.stringify(eb));
    expect(a.m.players.map(p => [p.x, p.z, p.hp])).toEqual(b.m.players.map(p => [p.x, p.z, p.hp]));
    expect(JSON.stringify(ea)).not.toBe(JSON.stringify(ec));
  });
  it('never walk through walls: every living bot stands somewhere a body fits', () => {
    const s = botsOnly(3);
    for (let i = 0; i < 40; i++) {
      run(s, 1.5);
      for (const p of s.m.players) if (p.alive) { expect(Math.abs(p.x)).toBeLessThan(28); expect(Math.abs(p.z)).toBeLessThan(22); }
    }
  });
  it('keep attackers still and defenders indoors during preparation', () => {
    const s = botsOnly(4), start = s.m.players.map(p => [p.x, p.z]);
    run(s, ROUND.prep - 1);
    s.m.players.forEach((p, i) => {
      if (p.squad === s.m.attackers) expect([p.x, p.z]).toEqual(start[i]);
      else { expect(Math.abs(p.x)).toBeLessThan(15); expect(Math.abs(p.z)).toBeLessThan(10); }
    });
  });
});
