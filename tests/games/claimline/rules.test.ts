import { describe, expect, it } from 'vitest';
import { capture, percent, recount, setOwner, step } from '../../../src/games/claimline/model';
import { CENTER, GRID, HUMAN, type World } from '../../../src/games/claimline/types';
import { at, centre, drain, follow, put, scene } from './harness';

const captures = (world: World) => drain(world).filter(e => e.kind === 'capture');
const intersects = (a: number[], b: number[]) => {
  const ccw = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (cy - ay) * (bx - ax) - (by - ay) * (cx - ax);
  const [p1, p2, p3, p4] = [[a[0], a[1]], [a[2], a[3]], [b[0], b[1]], [b[2], b[3]]];
  return ccw(...p1 as [number, number], ...p2 as [number, number], ...p3 as [number, number]) * ccw(...p1 as [number, number], ...p2 as [number, number], ...p4 as [number, number]) < 0
    && ccw(...p3 as [number, number], ...p4 as [number, number], ...p1 as [number, number]) * ccw(...p3 as [number, number], ...p4 as [number, number], ...p2 as [number, number]) < 0;
};

describe('capture', () => {
  it('[1] loop fills once: an enclosed loop is claimed by one capture event and later home steps add nothing', () => {
    const world = scene();
    const [x, y] = centre(0, 0);
    put(world, HUMAN, x, y, 0);
    const before = world.counts[HUMAN];
    follow(world, HUMAN, [[x + 14, y], [x + 14, y + 14], [x, y + 14], [x, y]]);
    const events = drain(world).filter(e => e.kind === 'capture');
    expect(events).toHaveLength(1);
    const cells = (events[0] as { cells: number[] }).cells;
    expect(new Set(cells).size).toBe(cells.length);
    expect(world.counts[HUMAN]).toBe(before + cells.length);
    expect(world.owner[at(Math.floor(x + 8), Math.floor(y + 8))]).toBe(HUMAN);
    expect(world.owner[at(Math.floor(x + 12), Math.floor(y + 12))]).toBe(HUMAN);
    expect(world.counts).toEqual(recount(world));
    expect(world.players[0].trail).toEqual([]);
    const landVersion = world.landVersion, owned = world.counts[HUMAN];
    for (let i = 0; i < 6; i++) step(world);
    expect(world.counts[HUMAN]).toBe(owned);
    expect(world.landVersion).toBe(landVersion);
    expect(captures(world)).toHaveLength(0);
    expect(world.players[0].alive).toBe(true);
  });

  it('[2] enclosed enemy cells are stolen once: stolen equals the enemy disc size with no duplicate indices', () => {
    const world = scene();
    const [x, y] = centre(-10, 0);
    put(world, HUMAN, x, y, 0);
    put(world, 2, x + 12, y + 8, 0, 5, true);
    const [fx, fy] = centre(35, 20);
    setOwner(world, at(Math.floor(fx), Math.floor(fy)), 2); // keeps the enemy alive after the theft
    const enemyDisc = world.counts[2] - 1, enemyBefore = percent(world, 2);
    follow(world, HUMAN, [[x + 25, y], [x + 25, y + 18], [x, y + 18], [x, y]]);
    const cap = drain(world).filter(e => e.kind === 'capture');
    expect(cap).toHaveLength(1);
    const ev = cap[0] as { cells: number[]; stolen: number };
    expect(ev.stolen).toBe(enemyDisc);
    expect(new Set(ev.cells).size).toBe(ev.cells.length);
    expect(world.counts[2]).toBe(1);
    expect(world.counts).toEqual(recount(world));
    expect(percent(world, 2)).toBeLessThan(enemyBefore);
    expect(world.players[1].alive).toBe(true);
  });

  it('[4] self-crossing survives: a figure-eight trail never kills its owner and both lobes are captured on return', () => {
    const world = scene();
    const [x, y] = centre(0, 0);
    put(world, HUMAN, x, y, 0);
    const pts: [number, number][] = [[x + 12, y + 6], [x + 12, y + 18], [x + 4, y + 18], [x + 4, y + 6], [x + 20, y + 10], [x + 20, y - 2], [x + 6, y - 2], [x, y]];
    let crossed = false, steps = 0;
    const p = world.players[0];
    for (const w of pts) {
      for (let n = 0; n < 2000 && Math.hypot(w[0] - p.x, w[1] - p.y) > 2; n++) {
        p.target = Math.atan2(w[1] - p.y, w[0] - p.x);
        step(world); steps++;
        expect(p.alive).toBe(true);
        const t = p.trail;
        if (!crossed && t.length > 8) {
          const last = [t[t.length - 2], t[t.length - 1], p.x, p.y];
          for (let i = 0; i + 5 < t.length - 2; i += 2) if (intersects(last, [t[i], t[i + 1], t[i + 2], t[i + 3]])) crossed = true;
        }
      }
    }
    expect(crossed).toBe(true);
    expect(world.phase).toBe('running');
    expect(drain(world).filter(e => e.kind === 'capture').length).toBeGreaterThan(0);
    expect(world.owner[at(Math.floor(x + 8), Math.floor(y + 12))]).toBe(HUMAN); // first lobe
    expect(world.owner[at(Math.floor(x + 15), Math.floor(y + 4))]).toBe(HUMAN); // second lobe
    expect(world.counts).toEqual(recount(world));
  });

  it('[9] loop at the arena edge: the region between trail, wall and land is captured with no leak and no outside cell owned', () => {
    const world = scene();
    const [x, y] = centre(45, 0);
    put(world, HUMAN, x, y, 0);
    const p = world.players[0];
    let phase = 0, steps = 0;
    while (steps++ < 3000 && p.alive) {
      const r = Math.hypot(p.x - CENTER, p.y - CENTER);
      if (phase === 0) { p.target = 0; if (r > 55.7) phase = 1; }
      else if (phase === 1) { p.target = Math.atan2(CENTER + 30 - p.y, CENTER + 70 - p.x); if (p.y > CENTER + 9) phase = 2; }
      else if (phase === 2) { p.target = Math.atan2(CENTER + 9 - p.y, CENTER + 44 - p.x); if (p.x < CENTER + 46) phase = 3; }
      else p.target = Math.atan2(CENTER + 1 - p.y, CENTER + 44 - p.x);
      step(world);
      if (phase === 3 && !p.trail.length) break;
    }
    expect(p.alive).toBe(true);
    expect(p.trail).toEqual([]);
    expect(phase).toBe(3);
    const own = (dx: number, dy: number) => world.owner[at(Math.floor(CENTER + dx), Math.floor(CENTER + dy))];
    expect(own(50, 5)).toBe(HUMAN);
    expect(own(52.5, 3)).toBe(HUMAN);
    expect(own(54.7, 4)).toBe(HUMAN); // beside the wall, between trail and wall
    expect(own(55.2, 1)).toBe(HUMAN);
    for (let i = 0; i < GRID * GRID; i++) if (!world.mask[i]) expect(world.owner[i]).toBe(0);
    expect(world.counts).toEqual(recount(world));
    expect(world.counts[HUMAN]).toBeGreaterThan(150);
  });

  it('[10] thin gap: a trail running 0.8 cells from its own land still seals the enclosed region', () => {
    const world = scene();
    const x0 = 40, y0 = 40;
    for (let cy = y0; cy < y0 + 10; cy++) for (let cx = x0; cx < x0 + 10; cx++) setOwner(world, at(cx, cy), 2);
    put(world, 3, 100, 60, 0); // a bystander so player 2's elimination rules stay out of the way
    const p = world.players[1];
    p.alive = true; p.target = p.angle = 0; p.x = p.px = x0 + 4; p.y = p.py = y0 + 9.5;
    const path: [number, number][] = [[x0 + 9.9, y0 + 5], [x0 + 15, y0 + 5], [x0 + 15, y0 + 10.8], [x0 + 4, y0 + 10.8], [x0 + 4, y0 + 9.5]];
    const trail: number[] = [path[0][0], path[0][1]];
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1], [bx, by] = path[i], n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5);
      for (let k = 1; k <= n; k++) trail.push(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
    }
    p.trail = trail; p.x = p.px = trail[trail.length - 2]; p.y = p.py = trail[trail.length - 1];
    const result = capture(world, 2);
    expect(result.cells.length).toBeGreaterThan(0);
    const owner = (cx: number, cy: number) => world.owner[at(cx, cy)];
    expect(owner(x0 + 12, y0 + 7)).toBe(2); // inside the pocket
    expect(owner(x0 + 12, y0 + 9)).toBe(2);
    expect(owner(x0 + 7, y0 + 10)).toBe(2); // the gap row itself
    expect(owner(x0 + 12, y0 + 12)).toBe(0); // outside stays free
    expect(owner(x0 - 2, y0 + 5)).toBe(0);
    expect(world.counts).toEqual(recount(world));
  });

  it('[11] zero land is defeat: stealing every cell of a player eliminates it with reason land', () => {
    const world = scene();
    put(world, HUMAN, 40, 60, 0);
    put(world, 2, 60, 60, 0);
    put(world, 3, 80, 60, 0); // bystander with land stays alive
    const victimCells = world.counts[2];
    const p = world.players[0];
    const ring: [number, number][] = [[50, 52], [70, 52], [70, 68], [50, 68], [50, 52]];
    const trail: number[] = [];
    for (let i = 1; i < ring.length; i++) {
      const [ax, ay] = ring[i - 1], [bx, by] = ring[i], n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5);
      for (let k = 0; k < n; k++) trail.push(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
    }
    trail.push(50, 52);
    p.trail = trail; p.x = p.px = 50; p.y = p.py = 52;
    const { stolen } = capture(world, HUMAN);
    expect(stolen).toBe(victimCells);
    expect(world.counts[2]).toBe(0);
    expect(world.players[1].alive).toBe(false);
    const events = drain(world);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'defeat', id: 2, by: HUMAN, reason: 'land' }));
    expect(world.players[2].alive).toBe(true);
    expect(world.counts).toEqual(recount(world));
  });
});

describe('trail cuts', () => {
  /** Victim 2 and attacker 3 as bots, held in place by hand so the scene is exact. */
  function crossing() {
    const world = scene();
    put(world, 2, 60, 40, Math.PI / 2);
    setOwner(world, at(70, 40), 2);
    put(world, 3, 56, 60, 0);
    const v = world.players[1], a = world.players[2];
    v.trail = [60, 43, 60, 50]; v.x = v.px = 60; v.y = v.py = 50; v.angle = v.target = Math.PI / 2;
    return { world, v, a };
  }

  it('[5] cut eliminates the owner and transfers all of its land to the attacker', () => {
    const { world, v, a } = crossing();
    const victimCells = world.counts[2], attackerCells = world.counts[3];
    a.x = a.px = 58; a.y = a.py = 46; a.angle = a.target = 0;
    for (let i = 0; i < 40 && v.alive; i++) { a.target = 0; step(world); }
    expect(v.alive).toBe(false);
    expect(v.trail).toEqual([]);
    expect(a.alive).toBe(true);
    expect(a.kills).toBe(1);
    expect(world.counts[2]).toBe(0);
    expect(world.counts[3]).toBe(attackerCells + victimCells);
    const events = drain(world);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'defeat', id: 2, by: 3, reason: 'cut' }));
    const takeover = events.find(e => e.kind === 'takeover') as { from: number; to: number; cells: number[] };
    expect(takeover).toMatchObject({ from: 2, to: 3 });
    expect(takeover.cells).toHaveLength(victimCells);
    expect(world.counts).toEqual(recount(world));
    expect(v.respawnAt).toBeCloseTo(world.time + 3);
  });

  it('head-to-head contact does nothing: two trailing heads meeting nose to nose both survive the contact', () => {
    const world = scene();
    put(world, 2, 40, 60, 0);
    put(world, 3, 80, 60, 0);
    const a = world.players[1], b = world.players[2];
    a.trail = [44, 60, 59.5, 60]; a.x = a.px = 60; a.y = a.py = 60; a.angle = a.target = 0;
    b.trail = [76, 60, 63.5, 60]; b.x = b.px = 63; b.y = b.py = 60; b.angle = b.target = Math.PI;
    let closest = Infinity;
    for (let i = 0; i < 9; i++) { step(world); closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y)); }
    expect(closest).toBeLessThan(1.2);
    expect(a.alive && b.alive).toBe(true);
    expect(drain(world).filter(e => e.kind === 'defeat')).toHaveLength(0);
  });

  /** Victim 2 is one step from home (it re-enters its land at t = 0.625); attacker 3 crosses an older part of its trail. */
  function ordering(attackerStartY: number) {
    const world = scene();
    put(world, 2, 60, 60, Math.PI);
    put(world, 3, 100, 90, 0);
    const v = world.players[1], a = world.players[2];
    v.trail = [63.1, 58, 68, 58, 68, 60, 64.2, 60]; v.x = v.px = 64.2; v.y = v.py = 60; v.angle = v.target = Math.PI;
    a.x = a.px = 65.5; a.y = a.py = attackerStartY; a.angle = a.target = Math.PI / 2;
    return { world, v, a };
  }

  it('[7a] cut vs return-home ordering (a): a victim that gets home earlier in the step survives and captures', () => {
    const { world, v, a } = ordering(56);
    step(world, 0.25);
    expect(v.alive).toBe(true);
    expect(v.trail).toEqual([]);
    expect(a.alive).toBe(true);
    const events = drain(world);
    expect(events.filter(e => e.kind === 'capture')).toHaveLength(1);
    expect(events.filter(e => e.kind === 'defeat')).toHaveLength(0);
  });

  it('[7b] cut vs return-home ordering (b): an attacker that crosses earlier eliminates the victim before it can capture', () => {
    const { world, v } = ordering(57);
    step(world, 0.25);
    expect(v.alive).toBe(false);
    const events = drain(world);
    expect(events.filter(e => e.kind === 'capture')).toHaveLength(0);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'defeat', id: 2, by: 3, reason: 'cut' }));
  });

  it('a head cannot hit the newest part of a trail before its owner has laid it', () => {
    const world = scene();
    put(world, 2, 60, 60, 0);
    put(world, 3, 100, 90, 0);
    const v = world.players[1], a = world.players[2];
    v.angle = v.target = 0; // leaves its land eastwards, laying a new trail this step
    v.x = v.px = 62.5; v.y = v.py = 60.5;
    a.x = a.px = 66; a.y = a.py = 59.2; a.angle = a.target = Math.PI / 2; // would touch the part V has not reached yet
    step(world, 0.25);
    expect(v.alive).toBe(true);
    expect(a.alive).toBe(true);
  });
});
