import { describe, expect, test } from 'vitest';
import { assembleCourse } from '../../../src/games/femboy-obby/course';
import { blinkState, createRun, step, solidOffset, Stepper, isSolidActive, pendulumBob, sweeperHits } from '../../../src/games/femboy-obby/sim';
import { MOVE, PLAYER, RESPAWN_DELAY, STEP } from '../../../src/games/femboy-obby/config';
import type { Course, Intent, Run, Solid } from '../../../src/games/femboy-obby/types';

const IDLE: Intent = { mx: 0, mz: 0, jump: false };
const FWD: Intent = { mx: 0, mz: -1, jump: false };

function solid(id: number, x: number, top: number, z: number, w: number, d: number, extra: Partial<Solid> = {}): Solid {
  return { id, stage: 1, surface: 'snow', x, y: top - 0.5, z, hx: w / 2, hy: 0.5, hz: d / 2, color: 0xffffff, accent: 0, ...extra };
}
/** A start pad at the origin plus whatever the test adds; checkpoint 1 sits far away so it never triggers by accident. */
function course(extra: Solid[] = [], more: Partial<Parameters<typeof assembleCourse>[0]> = {}): Course {
  const pad = solid(0, 0, 0, 0, 6, 6, { surface: 'checkpoint', stage: 0 });
  const end = solid(999, 0, 0, -400, 6, 6, { surface: 'checkpoint', stage: 1 });
  return assembleCourse({
    solids: [pad, ...extra, end],
    checkpoints: [{ index: 0, x: 0, y: 0, z: 0, yaw: 0, solid: 0 }, { index: 1, x: 0, y: 0, z: -400, yaw: 0, solid: 999 }],
    ...more,
  });
}
const run = (c: Course, n: number, intent: Intent | ((r: Run, i: number) => Intent), r = createRun(c)) => {
  for (let i = 0; i < n; i++) step(r, c, typeof intent === 'function' ? intent(r, i) : intent);
  return r;
};

describe('standing and walking', () => {
  test('a player standing on the start pad stays exactly on it', () => {
    const c = course(), r = run(c, 240, IDLE);
    expect(r.player.y).toBe(0);
    expect(r.player.grounded).toBe(true);
    expect(r.player.support).toBe(0);
  });

  test('diagonal input is normalised to the same top speed', () => {
    const c = course([solid(1, 0, 0, -20, 60, 40)]);
    const straight = run(c, 30, FWD), diag = run(c, 30, { mx: 1, mz: -1, jump: false });
    const s1 = Math.hypot(straight.player.vx, straight.player.vz), s2 = Math.hypot(diag.player.vx, diag.player.vz);
    expect(s1).toBeCloseTo(MOVE.speed, 5);
    expect(s2).toBeCloseTo(MOVE.speed, 5);
  });

  test('walking off an edge with no ground below is a fall to the kill plane, then a respawn within 0.6 s', () => {
    const c = course();
    const r = createRun(c);
    let deathStep = -1, respawnStep = -1;
    for (let i = 0; i < 600 && respawnStep < 0; i++) {
      step(r, c, deathStep < 0 ? FWD : IDLE);
      for (const e of r.events) { if (e.type === 'death') deathStep = i; if (e.type === 'respawn') respawnStep = i; }
    }
    expect(deathStep).toBeGreaterThan(0);
    expect((respawnStep - deathStep) * STEP).toBeLessThanOrEqual(0.6);
    expect((respawnStep - deathStep) * STEP).toBeGreaterThanOrEqual(RESPAWN_DELAY - STEP);
    expect(r.player).toMatchObject({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ex: 0, ez: 0 });
    expect(r.deaths).toBe(1);
  });
});

describe('jump envelope', () => {
  test('a standing jump peaks near 1.69 units and lands after about 0.75 s', () => {
    const c = course();
    const r = createRun(c);
    let apex = 0, air = 0;
    step(r, c, { ...IDLE, jump: true });
    for (let i = 0; i < 120 && !r.player.grounded; i++) { step(r, c, { ...IDLE, jump: true }); apex = Math.max(apex, r.player.y); air++; }
    expect(apex).toBeGreaterThan(1.6);
    expect(apex).toBeLessThan(1.75);
    expect((air + 1) * STEP).toBeGreaterThan(0.7);
    expect((air + 1) * STEP).toBeLessThan(0.8);
  });

  test('a running jump clears a 4-unit gap between equal-height platforms but not a 5.4-unit gap', () => {
    for (const [gap, ok] of [[4, true], [5.4, false]] as const) {
      const far = solid(1, 0, 0, -3 - gap - 5, 6, 10);
      const c = course([far]);
      const r = run(c, 200, (rr) => ({ mx: 0, mz: -1, jump: rr.player.z < -2.7 }));
      expect(r.deaths > 0, `gap ${gap}`).toBe(!ok);
    }
  });

  test('releasing jump early trims the arc', () => {
    const c = course();
    const r = createRun(c);
    let apex = 0;
    for (let i = 0; i < 60; i++) { step(r, c, { ...IDLE, jump: i < 4 }); apex = Math.max(apex, r.player.y); }
    expect(apex).toBeLessThan(1.2);
  });

  test('coyote time allows a jump 80 ms after leaving the edge but not 160 ms after', () => {
    for (const [delay, ok] of [[0.08, true], [0.16, false]] as const) {
      const c = course();
      const r = createRun(c);
      let left = -1, jumped = false;
      for (let i = 0; i < 200; i++) {
        const off = r.player.z < -3 - PLAYER.halfWidth;
        if (off && left < 0) left = i;
        const press = left >= 0 && (i - left) * STEP >= delay && !jumped;
        step(r, c, { mx: 0, mz: -1, jump: press });
        if (r.events.some(e => e.type === 'jump')) jumped = true;
        if (left >= 0 && (i - left) * STEP > delay + 0.05) break;
      }
      expect(jumped, `delay ${delay}`).toBe(ok);
    }
  });

  test('a jump pressed 100 ms before landing is buffered and fires on touchdown', () => {
    const c = course();
    const r = createRun(c);
    step(r, c, { ...IDLE, jump: true });
    let i = 0;
    while (r.player.vy >= 0 || r.player.y > 0.5) { step(r, c, { ...IDLE, jump: i < 2 }); i++; }
    // Now falling and about 0.1 s from landing: tap jump once.
    let jumps = 0;
    for (let k = 0; k < 30; k++) { step(r, c, { ...IDLE, jump: k < 2 }); jumps += r.events.filter(e => e.type === 'jump').length; }
    expect(jumps).toBe(1);
  });

  test('a fast fall onto a thin platform lands instead of tunnelling', () => {
    const thin = solid(1, 0, -30, -20, 4, 4, { hy: 0.1, y: -30.1 });
    const c = course([thin]);
    const r = createRun(c);
    r.player.x = 0; r.player.z = -20; r.player.y = 30; r.player.grounded = false; r.player.vy = -MOVE.fallLimit;
    run(c, 240, IDLE, r);
    expect(r.deaths).toBe(0);
    expect(r.player.support).toBe(1);
    expect(r.player.y).toBeCloseTo(-30, 6);
  });

  test('jumping under a low ceiling stops at the ceiling without launching through it', () => {
    const roof = solid(1, 0, 3.2, 0, 4, 4, { hy: 0.5, y: 2.9 });
    const c = course([roof]);
    const r = createRun(c);
    let top = 0;
    for (let i = 0; i < 90; i++) { step(r, c, { ...IDLE, jump: true }); top = Math.max(top, r.player.y + PLAYER.height); }
    expect(top).toBeLessThanOrEqual(2.4 + 1e-6);
    expect(r.player.y).toBe(0);
  });

  test('a low step is climbed by walking', () => {
    const c = course([solid(1, 0, 0.3, -5, 6, 4)]);
    const r = run(c, 70, FWD);
    expect(r.player.support).toBe(1);
    expect(r.player.y).toBeCloseTo(0.3, 6);
  });
});

describe('frame-rate independence', () => {
  test('30, 60 and 120 Hz rendering with a frame spike produce the same simulation', () => {
    const results = [30, 60, 120].map(hz => {
      const c = course([solid(1, 0, 0, -9, 6, 6)]);
      const r = createRun(c), stepper = new Stepper();
      const frames = hz * 3;
      for (let f = 0; f < frames; f++) {
        const dt = f === Math.floor(frames / 2) ? 0.2 : 1 / hz; // one spike
        stepper.advance(dt, () => step(r, c, { mx: 0, mz: -1, jump: r.steps % 50 === 0 }));
      }
      return { steps: r.steps, x: r.player.x, y: r.player.y, z: r.player.z };
    });
    // The spike adds the same simulated time at every rate; tiny float differences in the accumulator may shift one step.
    for (const r of results) expect(Math.abs(r.steps - results[1].steps)).toBeLessThanOrEqual(1);
    const ref = results[1];
    const c = course([solid(1, 0, 0, -9, 6, 6)]);
    const direct = createRun(c);
    for (let i = 0; i < ref.steps; i++) step(direct, c, { mx: 0, mz: -1, jump: direct.steps % 50 === 0 });
    expect(direct.player.z).toBe(ref.z);
  });

  test('catch-up is bounded after a long stall', () => {
    const s = new Stepper();
    let n = 0;
    s.advance(10, () => n++);
    expect(n).toBeLessThanOrEqual(Math.ceil(0.25 / STEP));
  });
});

describe('moving surfaces', () => {
  const tray = (extra: Partial<Solid> = {}) => solid(1, 0, 0, -7, 4, 4, { surface: 'tray', motion: { dx: 8, dy: 0, dz: 0, period: 6, phase: 0, dwell: 0.6 }, ...extra });

  test('a stationary rider stays supported through a complete translating cycle', () => {
    const c = course([tray()]);
    const r = createRun(c);
    r.player.z = -7; r.player.x = 0;
    for (let i = 0; i < 6 / STEP * 2; i++) {
      step(r, c, IDLE);
      expect(r.deaths).toBe(0);
      if (i > 2) { expect(r.player.support).toBe(1); const o = solidOffset(c.solids[1], r.mt); expect(r.player.x).toBeCloseTo(o.x, 6); }
    }
  });

  test('a rider is carried up and down by a vertical lift', () => {
    const lift = solid(1, 0, 0, -7, 4, 4, { surface: 'lift', motion: { dx: 0, dy: 5, dz: 0, period: 5, phase: 0, dwell: 0.5 } });
    const c = course([lift]);
    const r = createRun(c);
    r.player.z = -7;
    for (let i = 0; i < 600; i++) {
      step(r, c, IDLE);
      expect(r.deaths).toBe(0);
      if (i > 2) expect(r.player.y).toBeCloseTo(solidOffset(lift, r.mt).y, 5);
    }
  });

  test('platform velocity is inherited once at take-off and cleared on landing', () => {
    const c = course([tray({ hx: 20, x: 0, motion: { dx: 8, dy: 0, dz: 0, period: 6, phase: 0, dwell: 0 } })]);
    const r = createRun(c);
    r.player.z = -7; r.player.x = 0;
    run(c, 90, IDLE, r); // mid-cycle: the tray moves at full speed
    const before = r.player.x, t0 = r.mt;
    step(r, c, { ...IDLE, jump: true });
    expect(r.player.ex).not.toBe(0);
    let air = 0;
    while (!r.player.grounded && air < 200) { step(r, c, IDLE); air++; }
    expect(r.player.ex).toBe(0);
    // Drift equals platform speed times flight time: once, not twice.
    const v = (solidOffset(c.solids[1], t0 + STEP).x - solidOffset(c.solids[1], t0).x) / STEP;
    const drift = r.player.x - before;
    expect(Math.abs(drift)).toBeLessThan(Math.abs(v) * (air + 2) * STEP * 1.25);
    expect(Math.abs(drift)).toBeGreaterThan(Math.abs(v) * air * STEP * 0.5);
  });

  test('on the take-off step the platform moves the rider exactly once', () => {
    const c = course([tray({ hx: 20, x: 0, motion: { dx: 8, dy: 0, dz: 0, period: 6, phase: 0, dwell: 0 } })]);
    const r = createRun(c);
    r.player.z = -7; r.player.x = 0;
    run(c, 90, IDLE, r);
    const x0 = r.player.x, t0 = r.mt;
    step(r, c, { ...IDLE, jump: true });
    const platform = solidOffset(c.solids[1], t0 + STEP).x - solidOffset(c.solids[1], t0).x;
    expect(r.events.some(e => e.type === 'jump')).toBe(true);
    expect(r.player.x - x0).toBeCloseTo(platform, 6);
  });

  test('a conveyor carries a grounded player and stops when contact ends', () => {
    const belt = solid(1, 0, 0, -8, 6, 6, { surface: 'conveyor', belt: { x: 2, z: 0 } });
    const c = course([belt]);
    const r = createRun(c);
    r.player.z = -8;
    run(c, 60, IDLE, r);
    expect(r.player.x).toBeCloseTo(2, 1);
    step(r, c, { ...IDLE, jump: true });
    const x0 = r.player.x;
    run(c, 10, IDLE, r);
    expect(r.player.x).toBeCloseTo(x0, 6);
  });

  test('ice keeps momentum longer than snow but still responds to input', () => {
    const stop = (surface: 'snow' | 'ice') => {
      const c = course([solid(1, 0, 0, -20, 10, 30, { surface })]);
      const r = createRun(c);
      r.player.z = -10;
      run(c, 40, FWD, r);
      const z0 = r.player.z;
      run(c, 30, IDLE, r);
      return z0 - r.player.z;
    };
    expect(stop('ice')).toBeGreaterThan(stop('snow') * 3);
  });
});

describe('crumble and spring', () => {
  test('a crumble tile warns, disappears and resets on a fixed timetable', () => {
    const tile = solid(1, 0, 0, -6, 3, 3, { surface: 'crumble' });
    const c = course([tile]);
    const r = createRun(c);
    r.player.z = -6;
    step(r, c, IDLE);
    expect(r.crumble.find(t => t.id === 1)?.phase).toBe(1);
    let goneAt = -1, backAt = -1;
    for (let i = 0; i < 400; i++) {
      step(r, c, IDLE);
      if (goneAt < 0 && !isSolidActive(r, tile)) goneAt = i;
      if (goneAt >= 0 && backAt < 0 && isSolidActive(r, tile)) backAt = i;
    }
    expect(goneAt * STEP).toBeGreaterThan(0.6);
    expect(goneAt * STEP).toBeLessThan(0.9);
    expect(backAt).toBeGreaterThan(goneAt);
    expect(r.deaths).toBe(1); // the player fell through
  });

  test('a spring fires exactly once per landing', () => {
    const spring = solid(1, 0, 0, -6, 3, 3, { surface: 'spring' });
    const c = course([spring]);
    const r = createRun(c);
    r.player.z = -6;
    let springs = 0, apex = 0;
    for (let i = 0; i < 60; i++) { step(r, c, IDLE); springs += r.events.filter(e => e.type === 'spring').length; apex = Math.max(apex, r.player.y); }
    expect(springs).toBe(1);
    expect(apex).toBeGreaterThan(4.5);
  });
});

describe('hazards', () => {
  test('a sweeper arm knocks the player out when it reaches them and misses when it is elsewhere', () => {
    const c = course([], { sweepers: [{ id: 0, stage: 1, x: 0, y: 0.8, z: 0, length: 2.6, radius: 0.3, omega: 1, phase: 0, arms: 1 }] });
    const r = createRun(c);
    r.player.x = 0; r.player.z = -2;
    let death = -1;
    for (let i = 0; i < 400 && death < 0; i++) { step(r, c, IDLE); if (r.events.some(e => e.type === 'death')) death = i; }
    // The arm starts along +x and turns towards -z (angle grows) — reaches the player after about a quarter turn.
    expect(death * STEP).toBeGreaterThan(Math.PI / 2 * 0.7);
    expect(death * STEP).toBeLessThan(Math.PI / 2 * 1.2);
  });

  test('a snowball crossing the path hits a player standing in it', () => {
    const c = course([], { snowballs: [{ id: 0, stage: 1, ax: -6, ay: 0.6, az: -1, bx: 6, by: 0.6, bz: -1, radius: 0.6, travel: 2, gap: 1, phase: 0 }] });
    const r = createRun(c);
    r.player.z = -1;
    let died = false;
    for (let i = 0; i < 200; i++) { step(r, c, IDLE); if (r.events.some(e => e.type === 'death' && e.cause === 'snowball')) died = true; }
    expect(died).toBe(true);
  });
});

describe('checkpoints and stars', () => {
  function line(): Course {
    const s = [solid(0, 0, 0, 0, 6, 6, { surface: 'checkpoint', stage: 0 }), solid(1, 0, 0, -8, 6, 6, { surface: 'checkpoint' }), solid(2, 0, 0, -16, 6, 6, { surface: 'checkpoint', stage: 2 })];
    return assembleCourse({
      solids: s,
      checkpoints: [{ index: 0, x: 0, y: 0, z: 0, yaw: 0, solid: 0 }, { index: 1, x: 0, y: 0, z: -8, yaw: 0.5, solid: 1 }, { index: 2, x: 0, y: 0, z: -16, yaw: 0, solid: 2 }],
      stars: [{ id: 'frosthop-v1:stage-01:star', stage: 1, x: 0, y: 1, z: -8 }],
    });
  }

  test('checkpoints activate in order, once, and later respawns use them', () => {
    const c = line();
    const r = createRun(c);
    r.player.z = -16; // skip ahead: checkpoint 2 must not activate before 1
    run(c, 5, IDLE, r);
    expect(r.checkpoint).toBe(0);
    r.player.z = -8;
    const hits: number[] = [];
    for (let i = 0; i < 30; i++) { step(r, c, IDLE); for (const e of r.events) if (e.type === 'checkpoint') hits.push(e.index); }
    expect(hits).toEqual([1]);
    r.player.y = -100;
    run(c, 60, IDLE, r);
    expect(r.player).toMatchObject({ x: 0, y: 0, z: -8, vx: 0, vy: 0, vz: 0 });
    expect(r.player.facing).toBe(0.5);
  });

  test('a star is awarded once and survives death and repeated overlap', () => {
    const c = line();
    const r = createRun(c);
    r.player.z = -8;
    let awards = 0;
    for (let i = 0; i < 20; i++) { step(r, c, IDLE); awards += r.events.filter(e => e.type === 'star').length; }
    r.player.y = -100; run(c, 60, IDLE, r);
    for (let i = 0; i < 20; i++) { step(r, c, IDLE); awards += r.events.filter(e => e.type === 'star').length; }
    expect(awards).toBe(1);
    expect(r.stars).toEqual(['frosthop-v1:stage-01:star']);
    const again = createRun(c, { stars: r.stars, checkpoint: 1 });
    run(c, 20, IDLE, again);
    expect(again.events.some(e => e.type === 'star')).toBe(false);
  });

  test('crossing the start line forwards emits one start event', () => {
    const c = assembleCourse({
      solids: [solid(0, 0, 0, 0, 6, 12, { surface: 'checkpoint', stage: 0 })],
      checkpoints: [{ index: 0, x: 0, y: 0, z: 3, yaw: 0, solid: 0 }],
      startLine: { z: 1, x0: -3, x1: 3 },
    });
    const r = createRun(c);
    let n = 0;
    for (let i = 0; i < 60; i++) { step(r, c, i < 40 ? FWD : { mx: 0, mz: 1, jump: false }); n += r.events.filter(e => e.type === 'start-line').length; }
    expect(n).toBe(1);
  });
});

describe('assistance', () => {
  test('assistance slows moving platforms consistently', () => {
    const t = solid(1, 0, 0, -7, 4, 4, { motion: { dx: 8, dy: 0, dz: 0, period: 6, phase: 0, dwell: 0 } });
    const c = course([t]);
    const a = run(c, 120, IDLE, createRun(c, { assist: true })), b = run(c, 120, IDLE);
    expect(a.mt).toBeLessThan(b.mt);
    expect(b.mt).toBeCloseTo(2, 6);
  });
});

describe('obstacles added for the harder course', () => {
  test('a kill brick is not solid and sends you back on contact; standing beside it is safe', () => {
    const floor = solid(1, 0, 0, -8, 4, 10);
    const spike = solid(2, 0, 0.55, -8, 4, 0.8, { surface: 'spike', hy: 0.275, y: 0.275 });
    const c = course([floor, spike]);
    const near = createRun(c);
    near.player.z = -6.6; near.player.support = 1;
    run(c, 120, IDLE, near);
    expect(near.deaths).toBe(0);
    expect(isSolidActive(near, c.solids[2])).toBe(false);
    const r = run(c, 120, (rr) => (rr.deaths ? IDLE : FWD));
    expect(r.deaths).toBe(1);
  });

  test('a running jump clears a kill-brick strip', () => {
    const floor = solid(1, 0, 0, -8, 4, 14);
    const spike = solid(2, 0, 0.55, -6, 4, 0.8, { surface: 'spike', hy: 0.275, y: 0.275 });
    const c = course([floor, spike]);
    const r = run(c, 150, (rr) => ({ mx: 0, mz: -1, jump: rr.player.z < -4.6 && rr.player.z > -5.2 }));
    expect(r.deaths).toBe(0);
    expect(r.player.z).toBeLessThan(-9);
  });

  test('a fairy-light panel holds you while lit and drops you when it goes dark', () => {
    const panel = solid(1, 0, 0, -8, 3, 3, { surface: 'blink', blink: { on: 1, off: 1, phase: 0 } });
    const c = course([panel]);
    expect(blinkState(c.solids[1], 0.1)).toBe('lit');
    expect(blinkState(c.solids[1], 0.6)).toBe('warn');
    expect(blinkState(c.solids[1], 1.5)).toBe('dark');
    const r = createRun(c);
    r.player.z = -8; r.player.support = 1;
    run(c, 50, IDLE, r);
    expect(r.player.grounded).toBe(true);
    run(c, 30, IDLE, r);
    expect(r.player.grounded).toBe(false);
    expect(r.player.y).toBeLessThan(-0.1);
  });

  test('a pendulum bauble swings through chest height and knocks you out at the bottom of its arc', () => {
    const pd = { id: 0, stage: 1, x: 0, y: 5.5, z: -2, length: 4.5, radius: 0.75, amp: 0.95, omega: 2, phase: 0, axis: 'x' as const };
    expect(pendulumBob(pd, 0)).toMatchObject({ x: 0, z: -2 });
    expect(pendulumBob(pd, 0).y).toBeCloseTo(1, 9);
    expect(Math.abs(pendulumBob(pd, Math.PI / 4).x)).toBeGreaterThan(3);
    const c = course([], { pendulums: [pd] });
    const r = createRun(c);
    r.player.z = -2;
    step(r, c, IDLE);
    expect(r.events).toContainEqual({ type: 'death', cause: 'pendulum' });
    const safe = createRun(c);
    safe.player.z = 1.5;
    run(c, 300, IDLE, safe);
    expect(safe.deaths).toBe(0);
  });

  test('sweeper arms are spread evenly round the hub; low arms can be jumped', () => {
    const base = { id: 0, stage: 1, x: 0, y: 0.8, z: 0, length: 3, radius: 0.32, omega: 1, phase: 0 };
    const p = { x: 0, y: 0, z: -2 } as Parameters<typeof sweeperHits>[2];
    expect(sweeperHits({ ...base, arms: 1 }, 0, p)).toBe(false);
    expect(sweeperHits({ ...base, arms: 4 }, 0, p)).toBe(true);
    expect(sweeperHits({ ...base, arms: 3 }, 0, { ...p, x: -1, z: 1.732 })).toBe(true);
    const low = { ...base, arms: 1 as const, y: 0.35 };
    expect(sweeperHits(low, 0, { ...p, x: 2, z: 0 })).toBe(true);
    expect(sweeperHits(low, 0, { ...p, x: 2, z: 0, y: 0.8 })).toBe(false);
  });
});
