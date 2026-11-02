import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  bodyRadiusAt, collisionRadiusAt, createArena, headRadius, hooverRadius, immunityPaleness, radius, restoreArena, snapshot, stepArena, turnToward, wrapAngle,
  type Arena, type Pellet, type Point
} from '../../../src/games/neon-coil/model';
import { inJoystickZone, joystickVector, KeyboardSteering, pointerAngle } from '../../../src/games/neon-coil/input';
import * as tuning from '../../../src/games/neon-coil/tuning';
const {
  ARENA_RADIUS, BOT_RING_RADII, FOOD_TARGET, HOOVER_ARRIVAL_DISTANCE, HOOVER_RADIUS, JOYSTICK_DEAD_ZONE, JOYSTICK_TRAVEL, LEGACY_ARENA_RADIUS,
  MAX_FOOD, MAX_TURN_RATE, POINTER_DEAD_ZONE, SPAWN_IMMUNITY_SECONDS, SPAWN_IMMUNITY_TICKS, SPEED, STEP, TURN_RESPONSE
} = tuning;

/** Bots parked, food far away. Immunity is left as spawned unless a test clears it. */
function quiet(): Arena {
  const s = createArena(); s.phase = 'running';
  for (const snake of s.snakes.slice(1)) { snake.alive = false; snake.body = []; snake.pathLength = 0; snake.diedAt = 1e8; snake.immune = 0; }
  return withFood(s);
}
/** Saves only accept death times in the past; park the bots' timers at `now` before snapshotting. */
const savable = (s: Arena) => { for (const snake of s.snakes.slice(1)) snake.diedAt = s.ticks; return s; };
function withFood(s: Arena) {
  s.food = Array.from({ length: FOOD_TARGET }, (_, i) => ({ x: 1200, y: 0, id: i + 1, value: 1, color: 1, trail: false })); s.nextFood = FOOD_TARGET + 1;
  return s;
}
function place(s: Arena, id: number, points: Point[], angle = 0, immune = 0) {
  const snake = s.snakes[id]; Object.assign(snake, points[0]); snake.body = points.map(p => ({ ...p })); snake.previous = { ...points[0] };
  snake.pathLength = points.reduce((total, p, i) => total + (i ? Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) : 0), 0);
  snake.alive = true; snake.brainAt = 1e8; snake.angle = snake.target = snake.previousAngle = angle; snake.immune = immune;
}
const wall = (s: Arena) => place(s, 1, [{ x: 200, y: -50 }, { x: 2, y: -50 }, { x: 2, y: 50 }], 0);
const pellet = (s: Arena, x: number, y: number, value = 1) => { const food: Pellet = { id: s.nextFood++, x, y, value, color: 0, trail: false }; s.food.unshift(food); return food; };

describe('spawn immunity', () => {
  test('every spawn is protected for the tunable timer, derived from SPAWN_IMMUNITY_SECONDS', () => {
    expect(SPAWN_IMMUNITY_TICKS).toBe(Math.round(SPAWN_IMMUNITY_SECONDS / STEP));
    expect(SPAWN_IMMUNITY_SECONDS).toBeCloseTo(3);
    const s = createArena(7); expect(s.snakes.every(snake => snake.immune === SPAWN_IMMUNITY_TICKS)).toBe(true);
    // A restart is a fresh createArena: protected again.
    expect(createArena(8).snakes[0].immune).toBe(SPAWN_IMMUNITY_TICKS);
  });
  test('an immune head survives another body, and is normal once the timer expires', () => {
    const s = quiet(); s.snakes[0].immune = 5; wall(s);
    for (let n = 0; n < 4; n++) { stepArena(s); s.snakes[0].x = 0; s.snakes[0].body[0].x = 0; }
    expect(s.phase).toBe('running'); expect(s.snakes[0].immune).toBe(1);
    stepArena(s); expect(s.snakes[0].immune).toBe(0); expect(s.phase).toBe('running');
    stepArena(s); expect(s.phase).toBe('dead'); expect(s.cause).toContain('body');
  });
  test('immunity lasts exactly SPAWN_IMMUNITY_TICKS simulated steps', () => {
    const s = quiet(); const player = s.snakes[0]; expect(player.immune).toBe(SPAWN_IMMUNITY_TICKS);
    for (let n = 0; n < SPAWN_IMMUNITY_TICKS - 1; n++) stepArena(s, { angle: n * .02 });
    expect(player.immune).toBe(1); stepArena(s); expect(player.immune).toBe(0);
  });
  test('head-on contact with an immune snake defeats nobody, but is mutual once both are vulnerable', () => {
    const s = quiet(); s.snakes[0].immune = 0; place(s, 1, [{ x: 12, y: 0 }, { x: 30, y: 0 }], Math.PI, 30); s.snakes[1].mass = 250;
    stepArena(s); expect(s.snakes[0].alive).toBe(true); expect(s.snakes[1].alive).toBe(true);
    const both = quiet(); both.snakes[0].immune = 0; place(both, 1, [{ x: 12, y: 0 }, { x: 30, y: 0 }], Math.PI, 0);
    stepArena(both); expect(both.snakes[0].alive).toBe(false); expect(both.snakes[1].alive).toBe(false);
  });
  test('an immune body is non-lethal to others; the rim still defeats an immune head', () => {
    const s = quiet(); s.snakes[0].immune = 0; wall(s); s.snakes[1].immune = 40;
    stepArena(s); expect(s.phase).toBe('running');
    const rim = quiet(); expect(rim.snakes[0].immune).toBeGreaterThan(0);
    rim.snakes[0].x = ARENA_RADIUS - 8; rim.snakes[0].body[0].x = rim.snakes[0].x; stepArena(rim);
    expect(rim.phase).toBe('dead'); expect(rim.cause).toContain('rim');
  });
  test('bots respawn immune and the player cannot defeat a freshly respawned bot', () => {
    const s = quiet(); s.snakes[0].immune = 0; place(s, 2, [{ x: ARENA_RADIUS - 2, y: 0 }, { x: ARENA_RADIUS - 40, y: 0 }]);
    stepArena(s); expect(s.snakes[2].alive).toBe(false); s.snakes[2].diedAt = s.ticks;
    let respawnedAt = -1;
    for (let n = 0; n < 200 && respawnedAt < 0; n++) { stepArena(s, { angle: s.ticks * .04 }); if (s.snakes[2].alive) respawnedAt = s.ticks; }
    expect(respawnedAt).toBeGreaterThan(0);
    // Respawn happens mid-tick; the end-of-tick countdown has already run once.
    expect(s.snakes[2].immune).toBe(SPAWN_IMMUNITY_TICKS - 1);
  });
  test('immunity persists in snapshots, and pre-immunity saves still load (unprotected)', () => {
    const s = quiet(); for (let n = 0; n < 10; n++) stepArena(s);
    savable(s); const restored = restoreArena(snapshot(s))!; expect(restored.snakes[0].immune).toBe(SPAWN_IMMUNITY_TICKS - 10); expect(restored).toEqual(s);
    const legacy = snapshot(s) as unknown as { snakes: Record<string, unknown>[] }; for (const snake of legacy.snakes) delete snake.immune;
    const loaded = restoreArena(legacy)!; expect(loaded).not.toBeNull(); expect(loaded.snakes.every(snake => snake.immune === 0)).toBe(true);
    const corrupt = snapshot(s); corrupt.snakes[0].immune = -4; expect(restoreArena(corrupt)).toBeNull();
    const tooLong = snapshot(s); tooLong.snakes[0].immune = SPAWN_IMMUNITY_TICKS * 9; expect(restoreArena(tooLong)!.snakes[0].immune).toBe(SPAWN_IMMUNITY_TICKS);
  });
  test('the pale look holds, then eases smoothly back to normal colour as protection ends', () => {
    const s = createArena(), snake = s.snakes[0];
    expect(immunityPaleness(snake)).toBe(1);
    const fade: number[] = []; for (let left = 60; left >= 0; left -= 5) { snake.immune = left; fade.push(immunityPaleness(snake)); }
    expect(fade[0]).toBe(1); expect(fade.at(-1)).toBe(0);
    for (let i = 1; i < fade.length; i++) expect(fade[i]).toBeLessThanOrEqual(fade[i - 1]);
    for (let i = 1; i < fade.length; i++) expect(fade[i - 1] - fade[i]).toBeLessThan(.25);
  });
});

describe('dot hoover', () => {
  test('a dot inside the radius accelerates toward the head and scores only on arrival, exactly once', () => {
    const s = quiet(), player = s.snakes[0]; player.immune = 0;
    // Beside the head, so its approach is not just the head driving into it.
    const food = pellet(s, 0, HOOVER_RADIUS - 2, 3);
    const gaps: number[] = [Math.hypot(food.x - player.x, food.y - player.y)], speeds: number[] = [];
    while (s.food.includes(food)) {
      expect(player.mass).toBe(30); stepArena(s); speeds.push(food.speed ?? Infinity);
      if (s.food.includes(food)) gaps.push(Math.hypot(food.x - player.x, food.y - player.y));
      expect(speeds.length).toBeLessThan(30);
    }
    expect(speeds.length).toBeGreaterThan(3); // visibly drawn in over several frames
    for (let i = 1; i < speeds.length - 1; i++) expect(speeds[i]).toBeGreaterThan(speeds[i - 1]);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeLessThan(gaps[i - 1]);
    expect(player.mass).toBe(33); expect(s.eaten).toBe(1);
    for (let n = 0; n < 20; n++) stepArena(s);
    expect(player.mass).toBe(33); expect(s.eaten).toBe(1);
  });
  test('dots outside the radius stay put', () => {
    const s = quiet(); const far = pellet(s, 0, HOOVER_RADIUS + 30);
    for (let n = 0; n < 6; n++) stepArena(s);
    expect(far).toMatchObject({ x: 0, y: HOOVER_RADIUS + 30 }); expect(far.owner).toBeUndefined(); expect(far.speed).toBeUndefined();
  });
  test('the nearest head claims a dot; bots hoover by the same rules; a dropped owner releases it in place', () => {
    const s = quiet(); s.snakes[0].immune = 0; place(s, 3, [{ x: 0, y: 70 }, { x: -30, y: 70 }]);
    const shared = pellet(s, 0, 45); stepArena(s); expect(shared.owner).toBe(3);
    const bot = s.snakes[3], mass = bot.mass;
    for (let n = 0; n < 20 && s.food.includes(shared); n++) stepArena(s);
    expect(bot.mass).toBe(mass + 1);
    const loose = pellet(s, bot.x + 30, bot.y + 25); stepArena(s); expect(loose.owner).toBe(3);
    bot.x = ARENA_RADIUS; bot.body[0].x = bot.x; stepArena(s); expect(bot.alive).toBe(false);
    const at = { x: loose.x, y: loose.y };
    stepArena(s); expect(loose.owner).toBeUndefined(); expect(loose).toMatchObject(at);
  });
  test('the food cap never evicts a pellet that is being hoovered', () => {
    const s = quiet(); s.snakes[0].immune = 0;
    s.food = Array.from({ length: tuning.MAX_FOOD }, (_, i) => ({ x: 1200, y: 0, id: i + 1, value: 1, color: 1, trail: false })); s.nextFood = tuning.MAX_FOOD + 1;
    const flying = s.food[0]; flying.x = 30; flying.y = 30;
    stepArena(s); expect(flying.owner).toBe(0);
    stepArena(s, { boost: true }); stepArena(s, { boost: true }); // boost trails force evictions at the cap
    expect(s.food.length).toBeLessThanOrEqual(tuning.MAX_FOOD);
    expect(s.food.includes(flying) || s.snakes[0].mass > 29).toBe(true);
    for (let n = 0; n < 30 && s.food.includes(flying); n++) stepArena(s);
    expect(s.eaten).toBe(1);
  });
  test('hoover reach grows gently with body width', () => {
    const s = createArena(), snake = s.snakes[0];
    expect(hooverRadius(snake)).toBe(HOOVER_RADIUS);
    snake.mass = 1e6; expect(hooverRadius(snake)).toBeGreaterThan(HOOVER_RADIUS); expect(hooverRadius(snake)).toBeLessThanOrEqual(HOOVER_RADIUS * 1.5);
  });
  test('dots in flight survive snapshot/restore and continue deterministically; legacy pellets still load', () => {
    const s = quiet(); pellet(s, 30, 20, 2); pellet(s, -20, -35, 1); stepArena(s); stepArena(s);
    expect(s.food.filter(f => f.owner === 0)).toHaveLength(2);
    savable(s); const copy = restoreArena(snapshot(s))!; expect(copy).toEqual(s);
    // A later retune that lowers the speed cap clamps in-flight pellets instead of discarding the save.
    const fast = snapshot(s); fast.food[0].speed = tuning.HOOVER_MAX_SPEED * 3; expect(restoreArena(fast)!.food[0].speed).toBe(tuning.HOOVER_MAX_SPEED);
    for (let n = 0; n < 15; n++) { stepArena(s, { angle: .3 }); stepArena(copy, { angle: .3 }); }
    expect(copy).toEqual(s); expect(s.snakes[0].mass).toBe(33);
    const bad = snapshot(s); bad.food[0].owner = 0; delete bad.food[0].speed; expect(restoreArena(bad)).toBeNull();
    const bad2 = snapshot(s); bad2.food[0].owner = 99; bad2.food[0].speed = 10; expect(restoreArena(bad2)).toBeNull();
  });
  test('arrival distance and pull constants are exported tunables', () => {
    for (const key of ['HOOVER_RADIUS', 'HOOVER_RADIUS_PER_BODY_PX', 'HOOVER_START_SPEED', 'HOOVER_ACCELERATION', 'HOOVER_MAX_SPEED', 'HOOVER_ARRIVAL_DISTANCE'] as const)
      expect(typeof tuning[key]).toBe('number');
    expect(HOOVER_ARRIVAL_DISTANCE).toBeLessThan(headRadius(createArena().snakes[0]));
    expect(tuning.HOOVER_MAX_SPEED).toBeGreaterThan(SPEED * tuning.BOOST_MULTIPLIER * 2);
  });
});

describe('smooth steering', () => {
  test('large errors turn at the capped rate; small errors ease in without overshoot', () => {
    expect(turnToward(0, Math.PI - .01, STEP)).toBeCloseTo(MAX_TURN_RATE * STEP);
    expect(turnToward(0, -2, STEP)).toBeCloseTo(-MAX_TURN_RATE * STEP);
    const small = .05, next = turnToward(0, small, STEP);
    expect(next).toBeCloseTo(small * TURN_RESPONSE * STEP); expect(next).toBeLessThan(small);
    let angle = 0; const path: number[] = [];
    for (let n = 0; n < 60; n++) { angle = turnToward(angle, 1.2, STEP); path.push(angle); }
    for (let i = 1; i < path.length; i++) { expect(path[i]).toBeGreaterThanOrEqual(path[i - 1]); expect(path[i]).toBeLessThanOrEqual(1.2); }
    expect(1.2 - path.at(-1)!).toBeLessThan(.005);
    // Across the ±π seam it takes the short way round.
    expect(turnToward(3, -3, STEP)).toBeGreaterThan(3);
  });
  test('the body follows the curved head trail without kinks', () => {
    const s = quiet(); s.snakes[0].immune = 0;
    for (let n = 0; n < 90; n++) stepArena(s, { angle: n < 45 ? 1.5 : -1.5 });
    const body = s.snakes[0].body;
    for (let i = 2; i < body.length; i++) {
      const a = Math.atan2(body[i - 1].y - body[i - 2].y, body[i - 1].x - body[i - 2].x), b = Math.atan2(body[i].y - body[i - 1].y, body[i].x - body[i - 1].x);
      expect(Math.abs(wrapAngle(a - b))).toBeLessThanOrEqual(MAX_TURN_RATE * STEP + 1e-6);
    }
  });
  test('joystick: any 360° vector maps to its angle, the knob clamps to the ring and the dead zone holds', () => {
    for (let k = 0; k < 24; k++) {
      const angle = wrapAngle(k / 24 * Math.PI * 2 + .1), v = joystickVector(Math.cos(angle) * 37, Math.sin(angle) * 37);
      expect(v.angle).toBeCloseTo(angle); expect(v.magnitude).toBeCloseTo(37 / JOYSTICK_TRAVEL);
    }
    const far = joystickVector(300, -400); expect(Math.hypot(far.x, far.y)).toBeCloseTo(JOYSTICK_TRAVEL); expect(far.magnitude).toBe(1); expect(far.angle).toBeCloseTo(Math.atan2(-400, 300));
    const dead = JOYSTICK_TRAVEL * JOYSTICK_DEAD_ZONE;
    expect(joystickVector(dead * .9, 0).angle).toBeUndefined(); expect(joystickVector(0, dead * 1.1).angle).toBeCloseTo(Math.PI / 2);
    expect(tuning.JOYSTICK_RADIUS * 2).toBeGreaterThanOrEqual(120);
    expect(inJoystickZone(60, 780, 390, 844)).toBe(true); expect(inJoystickZone(330, 780, 390, 844)).toBe(false); expect(inJoystickZone(60, 120, 390, 844)).toBe(false);
  });
  test('pointer aim uses the same target path with its centre dead zone', () => {
    expect(pointerAngle(POINTER_DEAD_ZONE - 1, 0)).toBeUndefined();
    expect(pointerAngle(0, -200)).toBeCloseTo(-Math.PI / 2); expect(pointerAngle(-120, 120)).toBeCloseTo(3 * Math.PI / 4);
  });
  test('keyboard: hold to turn toward 8-way directions; release keeps the current heading', () => {
    const keys = new KeyboardSteering(); expect(keys.target()).toBeUndefined();
    expect(keys.press('Enter')).toBe(false); expect(keys.press('ArrowDown')).toBe(true); expect(keys.target()).toBeCloseTo(Math.PI / 2);
    keys.press('d'); expect(keys.target()).toBeCloseTo(Math.PI / 4);
    keys.release('ArrowDown', .2); expect(keys.target()).toBe(0);
    keys.release('d', .37); expect(keys.target()).toBe(.37);
    keys.press('ArrowLeft'); keys.press('ArrowRight'); expect(keys.target()).toBe(.37);
    keys.clear(); expect(keys.target()).toBeUndefined();
  });
  test('keyboard: a short tap nudges smoothly, a held key completes the turn', () => {
    const run = (ticks: number) => {
      const s = quiet(), keys = new KeyboardSteering(); s.snakes[0].immune = 0;
      keys.press('ArrowDown');
      for (let n = 0; n < ticks; n++) stepArena(s, { angle: keys.target() });
      keys.release('ArrowDown', s.snakes[0].angle);
      for (let n = 0; n < 60; n++) stepArena(s, { angle: keys.target() });
      return s.snakes[0].angle;
    };
    const tap = run(6), hold = run(40);
    expect(tap).toBeCloseTo(6 * MAX_TURN_RATE * STEP, 5); expect(tap).toBeLessThan(.5);
    expect(hold).toBeCloseTo(Math.PI / 2, 2);
  });
});

describe('arena +20% playable area', () => {
  test('world area is 1.2× the legacy arena with the same circular proportions', () => {
    expect(tuning.ARENA_LINEAR_SCALE).toBeCloseTo(1.0954, 4);
    expect((Math.PI * ARENA_RADIUS ** 2) / (Math.PI * LEGACY_ARENA_RADIUS ** 2)).toBeCloseTo(1.2, 6);
  });
  test('food population and bot spacing scale so density feels the same', () => {
    expect(FOOD_TARGET / (Math.PI * ARENA_RADIUS ** 2)).toBeCloseTo(1500 / (Math.PI * LEGACY_ARENA_RADIUS ** 2), 8);
    expect(MAX_FOOD).toBe(3120); expect(BOT_RING_RADII.map(r => Math.round(r))).toEqual([789, 1024, 1260]);
    const s = createArena(); let outer = 0;
    for (const food of s.food) outer = Math.max(outer, Math.hypot(food.x, food.y));
    expect(outer).toBeGreaterThan(LEGACY_ARENA_RADIUS); expect(outer).toBeLessThan(ARENA_RADIUS);
    for (const bot of s.snakes.slice(1)) expect(Math.hypot(bot.x, bot.y)).toBeLessThan(ARENA_RADIUS - 300);
  });
});

describe('render radius ≡ collision radius', () => {
  // A minimal recording canvas so the real renderer runs under Node.
  const draws: { target: number; args: unknown[] }[] = [];
  let contexts = 0;
  const stub: (...args: unknown[]) => unknown = () => ({ addColorStop() {} });
  function fakeCanvas() {
    const id = contexts++, ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get: (t, k) => k in t ? t[k] : k === 'drawImage' ? (...args: unknown[]) => draws.push({ target: id, args }) : stub,
      set: (t, k, v) => { t[k] = v; return true; }
    });
    return { width: 1, height: 1, getContext: () => ctx };
  }
  beforeEach(() => {
    Object.assign(globalThis, { document: { createElement: fakeCanvas }, window: { devicePixelRatio: 1 } });
  });
  afterEach(() => { delete (globalThis as Record<string, unknown>).document; delete (globalThis as Record<string, unknown>).window; });

  for (const mass of [30, 300, 5000]) test(`every drawn body disc and the head match the hitbox at mass ${mass}`, async () => {
    const { createRenderer, SPRITE_DISC } = await import('../../../src/games/neon-coil/render');
    draws.length = 0; contexts = 0;
    const canvas = fakeCanvas(), renderer = createRenderer(canvas as unknown as HTMLCanvasElement), main = 0;
    renderer.resize(2400, 2400);
    const s = createArena(), p = s.snakes[0]; s.food = []; for (const bot of s.snakes.slice(1)) bot.alive = false;
    p.mass = mass; p.immune = 0;
    const length = 200; place(s, 0, Array.from({ length: length / 4 + 1 }, (_, i) => ({ x: -i * 4, y: 0 })), 0, 0); p.mass = mass;
    draws.length = 0; renderer.draw(s, 1);
    const discs = draws.filter(d => d.target === main && d.args.length === 5).map(d => {
      const [, x, y, w] = d.args as number[]; return { cx: x + w / 2, cy: y + w / 2, r: w / 2 * SPRITE_DISC };
    });
    const head = discs.at(-1)!, body = discs.slice(0, -1);
    expect(body.length).toBeGreaterThan(20);
    expect(head.r).toBeCloseTo(headRadius(p), 9); expect(head.cx).toBeCloseTo(0, 9);
    for (const disc of body) { expect(disc.cy).toBeCloseTo(0, 9); expect(disc.r).toBeCloseTo(collisionRadiusAt(p, -disc.cx), 9); }
    // The tail visibly tapers, and that taper is the hitbox too.
    expect(body[0].r).toBeCloseTo(bodyRadiusAt(radius(p), -body[0].cx, length), 9); expect(body[0].r).toBeLessThan(radius(p) * .6);
  });

  for (const mass of [30, 300, 5000]) test(`contact happens exactly where the drawn discs touch at mass ${mass}`, () => {
    const step = SPEED * STEP, headX = 400 + step;
    const arena = (y: number, x: number) => {
      const s = quiet(); s.snakes[0].immune = 0;
      place(s, 1, Array.from({ length: 51 }, (_, i) => ({ x: 400 - i * 4, y: 0 })), 0, 0); s.snakes[1].mass = mass;
      place(s, 0, [{ x, y: y - step }, { x, y: y - step - 40 }], Math.PI / 2, 0); s.snakes[0].mass = 30;
      return s;
    };
    // Gap to the union of drawn discs, densely sampled along the bot's body after its one forward step.
    const drawnGap = (x: number, y: number) => {
      const bot = { ...arena(0, x).snakes[1], pathLength: 200 + step }, head = headRadius(arena(0, x).snakes[0]);
      let gap = Infinity;
      for (let along = 0; along <= bot.pathLength; along += .01) gap = Math.min(gap, Math.hypot(x - (headX - along), y) - head - collisionRadiusAt(bot, along));
      return gap;
    };
    for (const [along, label] of [[100, 'mid-body'], [192, 'tapered tail']] as const) {
      const x = headX - along;
      let lo = 0, hi = 40; for (let n = 0; n < 40; n++) { const mid = (lo + hi) / 2; if (drawnGap(x, mid) < 0) lo = mid; else hi = mid; }
      const probe = (y: number) => { const s = arena(y, x); stepArena(s, { angle: Math.PI / 2 }); return s.phase; };
      expect(probe(lo - .05), `${label} overlap`).toBe('dead');
      expect(probe(lo + .05), `${label} near miss`).toBe('running');
    }
  });
});
