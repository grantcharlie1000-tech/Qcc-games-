import { describe, expect, it } from 'vitest';
import { angleTo, buildMask, cellOf, distToSegment, sweepHit } from '../../../src/games/claimline/geometry';
import {
  advance, createWorld, eliminate, percent, placePlayer, ranking, recount, restoreWorld, setOwner, snapshot, start, step
} from '../../../src/games/claimline/model';
import { CENTER, GRID, HEAD_EDGE_R, HIT_R, HUMAN, MAX_FRAME, PLAYER_COUNT, SPEED, STEP, type World } from '../../../src/games/claimline/types';
import { at, drain, put, scene } from './harness';

describe('sweepHit (analytic swept circle vs capsule)', () => {
  it('finds the exact earliest crossing of a segment', () => {
    // Moving along x from -5 to 5 across a vertical segment at x = 0: contact at x = -r.
    expect(sweepHit(-5, 0, 5, 0, 0, -3, 0, 3, 0.6)).toBeCloseTo((5 - 0.6) / 10, 12);
    // Reverse direction hits the other side at the same distance.
    expect(sweepHit(5, 0, -5, 0, 0, -3, 0, 3, 0.6)).toBeCloseTo((5 - 0.6) / 10, 12);
  });
  it('returns 0 when the start is already inside and Infinity when it never gets there', () => {
    expect(sweepHit(0.3, 1, 5, 1, 0, -3, 0, 3, 0.6)).toBe(0);
    expect(sweepHit(0, 3.7, 5, 3.7, 0, -3, 0, 3, 0.6)).toBe(Infinity); // passes beyond the end
    expect(sweepHit(-5, 4, 5, 4, 0, -3, 0, 3, 0.6)).toBe(Infinity); // parallel miss above
    expect(sweepHit(-5, 0, -1, 0, 0, -3, 0, 3, 0.6)).toBe(Infinity); // stops short
  });
  it('treats grazing at exactly r as a hit and just beyond r as a miss', () => {
    expect(sweepHit(-5, 0.6, 5, 0.6, 0, 0, 0, 0, 0.6)).toBeCloseTo(0.5, 6); // tangent to the end circle
    expect(sweepHit(-5, 0.6 + 1e-6, 5, 0.6 + 1e-6, 0, 0, 0, 0, 0.6)).toBe(Infinity);
    expect(sweepHit(0.6, -5, 0.6, 5, 0, -3, 0, 3, 0.6)).toBeCloseTo(0.2, 6); // parallel at exactly r: tangent to the end cap
    expect(sweepHit(0.6 + 1e-6, -5, 0.6 + 1e-6, 5, 0, -3, 0, 3, 0.6)).toBe(Infinity);
  });
  it('handles parallel travel that ends up on the capsule through an end cap', () => {
    // Travelling along the segment's own line from outside: contact at the end circle, y = -3 - r.
    expect(sweepHit(0, -8, 0, 8, 0, -3, 0, 3, 0.6)).toBeCloseTo((8 - 3 - 0.6) / 16, 12);
    // Offset by 0.5 (< r): first contact on the end circle at the matching chord.
    const t = sweepHit(0.5, -8, 0.5, 8, 0, -3, 0, 3, 0.6);
    expect(t).toBeCloseTo((8 - 3 - Math.sqrt(0.6 * 0.6 - 0.25)) / 16, 12);
  });
  it('degenerate cases: zero-length segment is a circle, zero-length move is a point test', () => {
    expect(sweepHit(-5, 0, 5, 0, 0, 0, 0, 0, 1)).toBeCloseTo(0.4, 12);
    expect(sweepHit(3, 3, 3, 3, 0, 0, 0, 0, 1)).toBe(Infinity);
    expect(sweepHit(0.2, 0.2, 0.2, 0.2, 0, 0, 0, 0, 1)).toBe(0);
    expect(sweepHit(0, 0, 0, 0, -1, 0, 1, 0, 0.5)).toBe(0);
  });
  it('is not sampled: a move far longer than the capsule is still caught, and it agrees with dense sampling on random cases', () => {
    expect(sweepHit(-500, 0.2, 500, 0.2, 0, -0.1, 0, 0.1, 0.6)).toBeCloseTo((500 - Math.sqrt(0.6 * 0.6 - 0.01)) / 1000, 9);
    let seed = 12345;
    const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let n = 0; n < 400; n++) {
      const [ax, ay, bx, by, cx, cy, dx, dy] = Array.from({ length: 8 }, () => rand() * 10 - 5);
      const exact = sweepHit(ax, ay, bx, by, cx, cy, dx, dy, 0.8);
      let sampled = Infinity;
      for (let i = 0; i <= 4000; i++) { const t = i / 4000; if (distToSegment(ax + (bx - ax) * t, ay + (by - ay) * t, cx, cy, dx, dy) <= 0.8) { sampled = t; break; } }
      if (exact === Infinity) expect(sampled).toBe(Infinity);
      else {
        expect(sampled - exact).toBeGreaterThanOrEqual(-1e-9);
        expect(sampled - exact).toBeLessThan(0.002 + 1e-9);
      }
    }
  });
});

describe('geometry helpers', () => {
  it('angleTo returns the signed shortest rotation in (-PI, PI]', () => {
    expect(angleTo(0, 1)).toBeCloseTo(1);
    expect(angleTo(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    expect(angleTo(0, Math.PI)).toBeCloseTo(Math.PI);
    expect(angleTo(0, -Math.PI)).toBeCloseTo(Math.PI);
    expect(angleTo(10, 10 + 0.5)).toBeCloseTo(0.5);
  });
  it('cellOf maps points to cells and reports -1 off the grid', () => {
    expect(cellOf(0.5, 0.5)).toBe(0);
    expect(cellOf(3.99, 2.01)).toBe(2 * GRID + 3);
    expect(cellOf(-0.01, 5)).toBe(-1);
    expect(cellOf(GRID, 5)).toBe(-1);
    expect(cellOf(NaN, 5)).toBe(-1);
  });
});

describe('world', () => {
  it('[3] % maths: playable counts only mask cells, the grid ring is outside, and shares add up to at most 100', () => {
    const world = createWorld(3);
    const { mask, playable } = buildMask();
    expect(world.playable).toBe(playable);
    expect(playable).toBe(mask.reduce((n, v) => n + v, 0));
    expect(playable).toBeLessThan(GRID * GRID);
    expect(mask[0]).toBe(0);
    expect(mask[at(CENTER, CENTER)]).toBe(1);
    expect(mask[at(GRID - 1, CENTER)]).toBe(0);
    let sum = 0;
    for (let id = 1; id <= PLAYER_COUNT; id++) sum += percent(world, id);
    expect(sum).toBeLessThanOrEqual(100 + 1e-9);
    expect(world.counts.reduce((n, v) => n + v, 0)).toBe(playable);
    expect(world.counts).toEqual(recount(world));
    // Theft makes a share fall: hand player 2 cells of the human, then take them back.
    const before = percent(world, HUMAN);
    const mine: number[] = [];
    for (let i = 0; i < world.owner.length && mine.length < 5; i++) if (world.owner[i] === HUMAN) mine.push(i);
    for (const i of mine) setOwner(world, i, 2);
    expect(percent(world, HUMAN)).toBeLessThan(before);
    expect(world.counts).toEqual(recount(world));
    setOwner(world, 0, 5); // outside the arena: ignored
    expect(world.owner[0]).toBe(0);
    expect(world.counts[5]).toBe(recount(world)[5]);
  });

  it('createWorld is deterministic, names are fixed, and fewer bots leave the rest permanently out', () => {
    const a = createWorld(42), b = createWorld(42), c = createWorld(43);
    expect(snapshot(a)).toEqual(snapshot(b));
    expect(snapshot(a)).not.toEqual(snapshot(c));
    expect(a.players.map(p => p.name)).toEqual(['You', 'Moss', 'Juno', 'Pip', 'Rook', 'Tansy', 'Bram']);
    expect(a.players.every(p => p.alive)).toBe(true);
    expect(a.counts.slice(1).every(n => n >= 25)).toBe(true);
    const some = createWorld(1, { bots: 2 });
    expect(some.players.filter(p => p.alive)).toHaveLength(3);
    expect(some.players.slice(3).every(p => !p.alive && p.respawnAt === Infinity)).toBe(true);
    const empty = createWorld(1, { spawn: false });
    expect(empty.players.every(p => !p.alive)).toBe(true);
    expect(empty.counts[0]).toBe(empty.playable);
    expect(ranking(a)).toHaveLength(7);
    expect(ranking(a).map(r => r.bp)).toEqual([...ranking(a).map(r => r.bp)].sort((x, y) => y - x));
  });

  it('step does nothing until started and advance reports sub-steps', () => {
    const world = createWorld(5);
    step(world);
    expect(world.tick).toBe(0);
    expect(advance(world, 1)).toBe(0);
    start(world);
    expect(world.phase).toBe('running');
    expect(advance(world, STEP * 3 + 1e-6)).toBe(3);
    expect(world.tick).toBe(3);
  });

  it('[6] cut at low frame rate: one 0.25 s step jumps across a trail that no sampled head position touches', () => {
    const make = () => {
      const world = scene();
      put(world, 2, 60, 36, Math.PI / 2);
      put(world, 3, 59.3, 50, 0);
      const v = world.players[1], a = world.players[2];
      v.trail = [60, 39, 60, 58]; v.x = v.px = 60; v.y = v.py = 58; v.angle = v.target = Math.PI / 2;
      a.angle = a.target = 0;
      return { world, v, a };
    };
    const { world, v, a } = make();
    const end = { x: a.x + SPEED * 0.25, y: a.y };
    expect(distToSegment(a.x, a.y, 60, 39, 60, 60)).toBeGreaterThan(HIT_R); // start is clear of the trail
    expect(distToSegment(end.x, end.y, 60, 39, 60, 60)).toBeGreaterThan(HIT_R); // and so is the end
    step(world, 0.25);
    expect(v.alive).toBe(false);
    expect(a.kills).toBe(1);
    expect(drain(world)).toContainEqual(expect.objectContaining({ kind: 'defeat', id: 2, by: 3, reason: 'cut' }));
    expect(world.counts).toEqual(recount(world));

    // A stall of five seconds is clamped to MAX_FRAME of sub-steps, each swept, and detection survives.
    const slow = make();
    expect(advance(slow.world, 5)).toBe(Math.round(MAX_FRAME / STEP));
    expect(slow.world.time).toBeCloseTo(MAX_FRAME, 9);
    expect(slow.v.alive).toBe(false);
    expect(slow.a.alive).toBe(true);
  });

  it('[8] edge sliding: steering straight outward slides along the wall at full speed without ever passing HEAD_EDGE_R', () => {
    const world = scene();
    put(world, HUMAN, CENTER + 50, CENTER, 0);
    const p = world.players[0];
    let prevX = p.x, prevY = p.y, travelled = 0;
    for (let i = 0; i < 600; i++) {
      p.target = 0; // straight at the wall, forever
      step(world);
      expect(Math.hypot(p.x - CENTER, p.y - CENTER)).toBeLessThanOrEqual(HEAD_EDGE_R + 1e-9);
      const d = Math.hypot(p.x - prevX, p.y - prevY);
      expect(d).toBeLessThanOrEqual(SPEED * STEP + 1e-9);
      travelled += d;
      prevX = p.x; prevY = p.y;
    }
    expect(Math.hypot(p.x - CENTER, p.y - CENTER)).toBeGreaterThan(HEAD_EDGE_R - 0.01); // reached and held the wall
    expect(Math.abs(p.y - CENTER)).toBeGreaterThan(10); // moved tangentially along it
    expect(travelled).toBeGreaterThan(SPEED * STEP * 600 * 0.7); // and kept (most of) its speed
    // A head exactly on the wall pointing exactly outward picks the counter-clockwise tangent.
    const exact = scene();
    put(exact, HUMAN, CENTER + HEAD_EDGE_R, CENTER, 0);
    exact.players[0].target = 0;
    step(exact);
    expect(exact.players[0].y).toBeGreaterThan(CENTER);
    expect(Math.hypot(exact.players[0].x - CENTER, exact.players[0].y - CENTER)).toBeLessThanOrEqual(HEAD_EDGE_R + 1e-9);
  });

  it('turning is limited to TURN_RATE and every step moves at SPEED', () => {
    const world = scene();
    put(world, HUMAN, CENTER, CENTER, 0);
    const p = world.players[0];
    p.target = Math.PI;
    step(world);
    expect(p.angle).toBeCloseTo(4.2 * STEP, 9);
    expect(Math.hypot(p.x - p.px, p.y - p.py)).toBeCloseTo(SPEED * STEP, 9);
  });
});

describe('bots', () => {
  it('[13] a seeded 60 s run with six bots stays consistent, bots capture land, targets are finite and replans are 5-10 Hz', () => {
    const world = createWorld(2024);
    start(world);
    // Park the human: a large disc it circles inside, so it is never exposed and never leaves.
    const human = world.players[0];
    placePlayer(world, HUMAN, human.x, human.y, human.angle, 6);
    let captures = 0, bestBotShare = 0;
    const lastPlan = new Map<number, { time: number; at: number; fresh: boolean }>();
    const intervals: number[] = [];
    for (let i = 0; i < 60 * 60; i++) {
      human.target = human.angle + 1;
      step(world);
      expect(world.phase, `human ended at tick ${world.tick}`).toBe('running');
      const events = drain(world);
      for (const e of events) if (e.kind === 'respawn') lastPlan.delete(e.id); // a respawn replans at once by design
      for (const p of world.players) {
        expect(Number.isFinite(p.target) && Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        if (!p.brain || !p.alive) { lastPlan.delete(p.id); continue; }
        const prev = lastPlan.get(p.id);
        if (!prev || p.brain.nextPlanAt !== prev.at) {
          if (prev && !prev.fresh) intervals.push(world.time - prev.time);
          lastPlan.set(p.id, { time: world.time, at: p.brain.nextPlanAt, fresh: !prev });
        }
      }
      for (const e of events) if (e.kind === 'capture' && e.id !== HUMAN) captures++;
      if (world.tick % 60 === 0) {
        expect(world.counts, `counts diverged at ${world.time}s`).toEqual(recount(world));
        for (const r of ranking(world)) if (r.isBot) bestBotShare = Math.max(bestBotShare, r.bp);
      }
    }
    expect(world.time).toBeCloseTo(60, 6);
    expect(captures).toBeGreaterThan(0);
    expect(bestBotShare).toBeGreaterThan(100);
    expect(intervals.length).toBeGreaterThan(200);
    for (const gap of intervals) {
      expect(gap).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(gap).toBeLessThanOrEqual(0.2 + STEP + 1e-9);
    }
  });

  it('a respawning bot never lands within 8 cells of an exposed trail (no unfair instant cut)', () => {
    // The human's exposed trail zig-zags across the arena in rows 20 cells apart, so most neutral ground is near it.
    const trail: number[] = [];
    for (let k = 0, y = CENTER - 40; y <= CENTER + 40; y += 20, k++) {
      const xs = [CENTER - 44, CENTER + 44];
      if (k % 2) xs.reverse();
      trail.push(xs[0], y, xs[1], y);
    }
    const clearance = (x: number, y: number) => {
      let d = Infinity;
      for (let i = 0; i + 3 < trail.length; i += 2) d = Math.min(d, distToSegment(x, y, trail[i], trail[i + 1], trail[i + 2], trail[i + 3]));
      return d;
    };
    let respawned = 0;
    for (let trial = 0; trial < 30; trial++) {
      const world = scene();
      world.rngState = 1000 + trial * 7919;
      put(world, HUMAN, CENTER, CENTER - 50, 0, 2);
      const human = world.players[0];
      human.trail = trail.slice();
      human.x = human.px = trail[trail.length - 2]; human.y = human.py = trail[trail.length - 1];
      const bot = world.players[1];
      bot.respawnAt = 0; // dead and due
      step(world);
      if (!bot.alive) continue;
      respawned++;
      expect(clearance(bot.x, bot.y)).toBeGreaterThanOrEqual(8);
      expect(human.alive).toBe(true);
    }
    expect(respawned).toBeGreaterThan(5);
  });

  it('defeated bots respawn on free neutral ground after RESPAWN_SECONDS and bots never respawn when disabled', () => {
    const world = createWorld(9, { bots: 2 });
    start(world);
    const bot = world.players[1], human = world.players[0];
    placePlayer(world, HUMAN, human.x, human.y, human.angle, 6); // a disc the human can circle on forever
    for (let i = 0; i < 20; i++) { human.target = human.angle + 1; step(world); }
    eliminate(world, bot.id, 0, 'cut');
    expect(bot.alive).toBe(false);
    expect(world.counts[bot.id]).toBe(0);
    expect(bot.respawnAt).toBeCloseTo(world.time + 3);
    for (let i = 0; i < 60 * 2; i++) { human.target = human.angle + 1; step(world); }
    expect(bot.alive).toBe(false);
    for (let i = 0; i < 60 + 5; i++) { human.target = human.angle + 1; step(world); }
    expect(bot.alive).toBe(true);
    expect(drain(world)).toContainEqual({ kind: 'respawn', id: bot.id });
    expect(world.counts[bot.id]).toBeGreaterThan(20);
    expect(world.players.slice(3).every(p => !p.alive)).toBe(true);
  });
});

describe('snapshot', () => {
  const sameState = (a: World, b: World) => {
    expect(b.owner).toEqual(a.owner);
    expect(b.rngState).toBe(a.rngState);
    expect(b.tick).toBe(a.tick);
    expect(b.time).toBe(a.time);
    expect(b.phase).toBe(a.phase);
    expect(b.counts).toEqual(a.counts);
    expect(b.players).toEqual(a.players);
    expect(b.result).toEqual(a.result);
  };
  const running = () => {
    const world = createWorld(77);
    start(world);
    for (let i = 0; i < 400; i++) { world.players[0].target = world.players[0].angle + (i % 90 < 45 ? 0.4 : -0.4); step(world); }
    drain(world);
    return world;
  };

  it('[14a] snapshot -> restoreWorld round-trips through JSON and then continues identically for 120 steps', () => {
    const original = running();
    const copy = restoreWorld(JSON.parse(JSON.stringify(snapshot(original))));
    expect(copy).not.toBeNull();
    sameState(original, copy as World);
    expect((copy as World).counts).toEqual(recount(copy as World));
    expect((copy as World).landVersion).toBe(1);
    expect((copy as World).events).toEqual([]);
    for (let i = 0; i < 120; i++) {
      for (const w of [original, copy as World]) { w.players[0].target = w.players[0].angle + 0.1; step(w); }
    }
    sameState(original, copy as World);
  });

  it('snapshot of a won/over and a mid-trail world restores, and the owner grid is run-length encoded', () => {
    const world = running();
    const data = snapshot(world) as { owner: string };
    expect(typeof data.owner).toBe('string');
    expect(data.owner.length).toBeLessThan(world.owner.length / 4);
    const over = running();
    over.phase = 'over'; over.result = { reason: 'cut', by: 2 };
    sameState(over, restoreWorld(JSON.parse(JSON.stringify(snapshot(over)))) as World);
  });

  it('rejects an impossible save: a running match whose human is dead, or a live player with no land', () => {
    const world = createWorld(5);
    start(world);
    const dead = JSON.parse(JSON.stringify(snapshot(world)));
    dead.players[0].alive = false; dead.players[0].trail = [];
    expect(restoreWorld(dead)).toBeNull();
    const landless = JSON.parse(JSON.stringify(snapshot(world)));
    landless.owner = `0:${GRID * GRID}`;
    expect(restoreWorld(landless)).toBeNull();
    expect(restoreWorld(JSON.parse(JSON.stringify(snapshot(world))))).not.toBeNull();
  });

  it('[14b] malformed data restores to null and never throws', () => {
    const good = JSON.parse(JSON.stringify(snapshot(running()))) as Record<string, any>;
    const clone = () => JSON.parse(JSON.stringify(good)) as Record<string, any>;
    const bad: unknown[] = [
      null, undefined, 5, 'x', [], {}, { ...clone(), version: 2 },
      { ...clone(), owner: (good.owner as string).slice(0, 40) },
      { ...clone(), owner: '9:13456' },
      { ...clone(), owner: 'junk' },
      { ...clone(), phase: 'paused' },
      { ...clone(), seed: 'a' },
      { ...clone(), rngState: Infinity },
      { ...clone(), players: good.players.slice(1) },
      { ...clone(), phase: 'over', result: null },
      { ...clone(), result: { reason: 'quit', by: 1 } }
    ];
    const nan = clone(); nan.players[0].x = null; bad.push(nan);
    const nan2 = clone(); nan2.players[0].y = 'NaN'; bad.push(nan2);
    const far = clone(); far.players[2].x = 1e9; bad.push(far);
    const unknownId = clone(); unknownId.players[3].id = 99; bad.push(unknownId);
    const dupId = clone(); dupId.players[3].id = 2; bad.push(dupId);
    const botNoBrain = clone(); botNoBrain.players[2].brain = null; bad.push(botNoBrain);
    const humanBrain = clone(); humanBrain.players[0].brain = clone().players[1].brain; bad.push(humanBrain);
    const badMode = clone(); badMode.players[1].brain.mode = 'dance'; bad.push(badMode);
    const badTrail = clone(); badTrail.players[0].trail = [1, 2, 3]; bad.push(badTrail);
    const badPeak = clone(); badPeak.players[0].peak = -4; bad.push(badPeak);
    const cyc: Record<string, unknown> = {}; cyc.self = cyc; bad.push(cyc);
    bad.push(new Proxy({}, { get() { throw new Error('boom'); } }));
    bad.forEach((input, i) => expect(restoreWorld(input), `case ${i}`).toBeNull());
    expect(restoreWorld(clone())).not.toBeNull();
  });
});
