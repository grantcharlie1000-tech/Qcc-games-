import { describe, expect, test } from 'vitest';
import { advanceArena, ARENA_RADIUS, bodyLength, BOT_COUNT, createArena, MIN_MASS, pointSegmentDistance, ranking, restoreArena, snapshot, SPEED, STEP, stepArena, TURN_RATE, type Arena } from '../../../src/games/neon-coil/model';
function quiet(): Arena {
  const s = createArena(); s.phase = 'running';
  for (const snake of s.snakes.slice(1)) { snake.alive = false; snake.body = []; snake.pathLength = 0; snake.diedAt = 1e8; }
  s.food = Array.from({ length: 1500 }, (_, i) => ({ x: 1000, y: 0, id: i + 1, value: 1, color: 1, trail: false })); s.nextFood = 1501;
  return s;
}
function body(s: Arena, id: number, points: { x: number; y: number }[]) {
  const snake = s.snakes[id]; Object.assign(snake, points[0]); snake.body = points; snake.previous = { ...points[0] }; snake.pathLength = points.reduce((total, p, i) => total + (i ? Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) : 0), 0); snake.alive = true; snake.brainAt = 1e8;
}
describe('continuous local arena', () => {
  test('seed creates 18 named bots, original player, safe opening and deterministic food', () => {
    const a = createArena(42); expect(a).toEqual(createArena(42)); expect(a.snakes).toHaveLength(BOT_COUNT + 1);
    expect(a.snakes[0].name).toBe('YOU'); expect(new Set(a.snakes.map(s => s.name)).size).toBe(19);
    expect(a.food.length).toBe(1500); expect(restoreArena(a)).toEqual(a);
  });
  test('equal elapsed time and inputs produce the same fixed-step world at 30, 60 and 120 Hz', () => {
    const states = [30, 60, 120].map(hz => { const s = createArena(2); s.phase = 'running'; for (let n = 0; n < hz * 2; n++) advanceArena(s, 1000 / hz, { angle: -.7 }); return s; });
    for (const s of states) s.accumulator = 0;
    expect(states[0]).toEqual(states[1]); expect(states[1]).toEqual(states[2]);
  });
  test('turning is limited, travel is continuous and the body follows curved head history', () => {
    const s = quiet(), snake = s.snakes[0]; stepArena(s, { angle: Math.PI });
    expect(snake.angle).toBeCloseTo(TURN_RATE * STEP); expect(Math.hypot(snake.x, snake.y)).toBeCloseTo(SPEED * STEP);
    const head = { x: snake.x, y: snake.y }; stepArena(s, { angle: Math.PI }); expect(snake.body[1]).toEqual(head);
    expect(snake.pathLength).toBeCloseTo(bodyLength(snake.mass));
  });
  test('eating removes one actual pellet and increases earned mass and actual body length', () => {
    const s = quiet(), player = s.snakes[0], before = player.pathLength;
    s.food[0] = { ...s.food[0], x: SPEED * STEP, y: 0, value: 4 }; stepArena(s);
    expect(player.mass).toBe(34); expect(s.eaten).toBe(1); expect(s.food.some(f => f.id === 1)).toBe(false);
    for (let n = 0; n < 20; n++) stepArena(s); expect(player.pathLength).toBeCloseTo(before + 12);
  });
  test('boost travels 1.7x, spends actual mass, drops food and stops at the minimum', () => {
    const normal = quiet(), boosted = quiet(); stepArena(normal); stepArena(boosted, { boost: true });
    expect(boosted.snakes[0].x / normal.snakes[0].x).toBeCloseTo(1.7); expect(boosted.snakes[0].mass).toBeCloseTo(29.9);
    for (let n = 0; n < 130; n++) stepArena(boosted, { angle: (boosted.ticks + 1) * .04, boost: true });
    expect(boosted.snakes[0].mass).toBeCloseTo(MIN_MASS); expect(boosted.snakes[0].boosting).toBe(false); expect(boosted.food.some(f => f.trail)).toBe(true);
    stepArena(boosted, { boost: false }); expect(boosted.snakes[0].boosting).toBe(false);
  });
  test('head versus body defeats the head, credits the owner and creates an ordered collectible trail', () => {
    const s = quiet(); body(s, 1, [{ x: 200, y: -50 }, { x: 2, y: -50 }, { x: 2, y: 50 }]);
    s.snakes[1].angle = 0; s.snakes[1].target = 0; stepArena(s);
    expect(s.phase).toBe('dead'); expect(s.snakes[0].alive).toBe(false); expect(s.snakes[1].kills).toBe(1);
    const trail = s.food.filter(f => f.trail); expect(trail.length).toBeGreaterThan(5); expect(trail.reduce((sum, f) => sum + f.value, 0)).toBeCloseTo(30);
    expect(trail.every(f => f.x <= 3 && Math.abs(f.y) < 1)).toBe(true);
  });
  test('head-on contact defeats both regardless of mass, while self-crossing is safe', () => {
    const s = quiet(); body(s, 1, [{ x: 12, y: 0 }, { x: 30, y: 0 }]); s.snakes[1].angle = Math.PI; s.snakes[1].target = Math.PI; s.snakes[1].mass = 250;
    stepArena(s); expect(s.snakes[0].alive).toBe(false); expect(s.snakes[1].alive).toBe(false); expect(s.cause).toContain('Head-on');
    const self = quiet(); body(self, 0, [{ x: 0, y: 0 }, { x: -40, y: 0 }, { x: -40, y: 40 }, { x: 3, y: 40 }, { x: 3, y: -30 }]);
    stepArena(self); expect(self.phase).toBe('running');
  });
  test('bots genuinely consume food, grow, collide, drop mass and safely respawn', () => {
    const s = quiet(); body(s, 1, [{ x: 900, y: 0 }, { x: 895, y: 0 }]); s.snakes[1].angle = s.snakes[1].target = 0;
    s.food[0] = { ...s.food[0], x: 903, y: 0, value: 5 }; const mass = s.snakes[1].mass;
    stepArena(s); expect(s.snakes[1].mass).toBe(mass + 5);
    s.snakes[1].x = ARENA_RADIUS - 2; s.snakes[1].body[0].x = s.snakes[1].x; stepArena(s);
    expect(s.snakes[1].alive).toBe(false); expect(s.defeated).toBe(1); expect(s.food.some(f => f.trail)).toBe(true);
    for (let n = 0; n < 200; n++) stepArena(s, { angle: s.ticks * .04 });
    expect(s.snakes[1].alive).toBe(true); expect(Math.hypot(s.snakes[1].x, s.snakes[1].y)).toBeLessThan(ARENA_RADIUS);
  });
  test('death pellets can be collected by another living snake', () => {
    const s = quiet(); body(s, 1, [{ x: ARENA_RADIUS - 2, y: 0 }, { x: 800, y: 0 }, { x: 700, y: 0 }]); s.snakes[1].angle = s.snakes[1].target = 0;
    stepArena(s); const pellet = s.food.find(f => f.trail)!;
    body(s, 2, [{ x: pellet.x - 3, y: pellet.y }, { x: pellet.x - 8, y: pellet.y }]); s.snakes[2].angle = s.snakes[2].target = 0; const mass = s.snakes[2].mass;
    stepArena(s); expect(s.snakes[2].mass).toBeGreaterThan(mass); expect(s.food.some(f => f.id === pellet.id)).toBe(false);
  });
  test('ranking uses actual mass, includes YOU outside top 10 and moves when mass changes', () => {
    const s = createArena(); s.snakes[0].mass = MIN_MASS; expect(ranking(s).findIndex(v => v.id === 0)).toBe(18);
    s.snakes[0].mass = 300; expect(ranking(s)[0].id).toBe(0);
  });
  test('ready, dead, invalid deltas and long stalls cannot advance or explode the simulation', () => {
    const s = createArena(); advanceArena(s, 1000); expect(s.ticks).toBe(0); s.phase = 'running';
    advanceArena(s, NaN); advanceArena(s, -100); expect(s.ticks).toBe(0); advanceArena(s, 8000);
    expect(s.ticks).toBe(15); expect(s.droppedSeconds).toBe(7.75); s.phase = 'dead'; const frozen = snapshot(s); advanceArena(s, 500); expect(s).toEqual(frozen);
  });
  test('rim collision is terminal and geometry handles degenerate segments', () => {
    const s = quiet(); s.snakes[0].x = ARENA_RADIUS - 8; s.snakes[0].body[0].x = s.snakes[0].x; stepArena(s);
    expect(s.phase).toBe('dead'); expect(s.cause).toContain('rim'); expect(pointSegmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
  test('death during catch-up discards the remaining time and its snapshot remains restorable', () => {
    const s = createArena(); s.phase = 'running';
    const player = s.snakes[0], shift = ARENA_RADIUS - 10;
    player.x += shift; player.previous.x += shift; for (const p of player.body) p.x += shift;
    advanceArena(s, 250); expect(s.phase).toBe('dead'); expect(s.accumulator).toBe(0); expect(restoreArena(s)).toEqual(s);
  });
  test('snapshot is independent, save round-trips and corrupt saves are rejected', () => {
    const s = createArena(); s.phase = 'running'; advanceArena(s, 200, { angle: 1 }); expect(restoreArena(snapshot(s))).toEqual(s);
    const copied = snapshot(s); copied.snakes[0].mass++; expect(copied.snakes[0].mass).not.toBe(s.snakes[0].mass);
    for (const mutate of [(v: Arena) => { v.seed = NaN; }, (v: Arena) => { v.food[0].value = -3; }, (v: Arena) => { v.snakes[0].name = '<img>'; }, (v: Arena) => { v.snakes[0].body[1].x += 100; }, (v: Arena) => { v.food.push(v.food[0]); }]) {
      const value = snapshot(s); mutate(value); expect(restoreArena(value)).toBeNull();
    }
    expect(restoreArena(null)).toBeNull(); expect(restoreArena({ version: 1 })).toBeNull();
  });
});
