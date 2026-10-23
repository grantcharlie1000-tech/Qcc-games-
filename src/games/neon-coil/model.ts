/** Original, deterministic local arena. Coordinates and speeds are world pixels. */
export const STEP = 1 / 60;
export const ARENA_RADIUS = 1500;
export const SPEED = 165;
export const TURN_RATE = 3.2;
export const MIN_MASS = 20;
export const START_MASS = 30;
// Numeric safety is separate from the fixed geometry budget: meals keep scoring.
export const MAX_MASS = Number.MAX_SAFE_INTEGER;
export const MAX_BODY_POINTS = 2048;
export const FOOD_TARGET = 1500;
export const BOT_COUNT = 18;
const MAX_FOOD = 2600;
const CELL = 64;
const COLORS = ['#b9f655', '#6bdcf5', '#f5a2d4', '#a99bff', '#ffc66d', '#74e6b9', '#ff817f'];
const NAMES = ['Juniper', 'Mochi', 'Orbit', 'Saffron', 'Pebble', 'Comet', 'Mango', 'Fern', 'Nimbus', 'Pippin', 'Kelp', 'Clover', 'Echo', 'Coral', 'Tango', 'Miso', 'Cosmo', 'Ripple'];
export interface Point { x: number; y: number }
export interface Pellet extends Point { id: number; value: number; color: number; trail: boolean }
export interface Snake extends Point {
  id: number; name: string; color: string; angle: number; target: number;
  mass: number; body: Point[]; pathLength: number; alive: boolean; boosting: boolean;
  boostSpent: number; brainAt: number; diedAt: number; kills: number;
  previous: Point; previousAngle: number;
}
export interface Arena {
  version: 1; phase: 'ready' | 'running' | 'dead'; seed: number; ticks: number;
  accumulator: number; nextFood: number; snakes: Snake[]; food: Pellet[];
  cause: string; eaten: number; defeated: number; droppedSeconds: number;
}
export interface Controls { angle?: number; boost?: boolean }
interface Segment { owner: number; a: Point; b: Point; radius: number }
type Grid = Map<string, Segment[]>;
export const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
// Preserve every existing run's growth through 600. Beyond it, diminishing
// length gains keep enormous scores playable, while every meal still grows.
export const bodyLength = (mass: number) => mass <= 600 ? 130 + mass * 3 : 1930 + 1800 * Math.log1p((mass - 600) / 600);
export const radius = (snake: Snake) => 8 + Math.min(4, Math.max(0, snake.mass - START_MASS) * .014);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function random(s: Arena) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
function randomPoint(s: Arena, margin = 60): Point {
  const angle = random(s) * Math.PI * 2, r = Math.sqrt(random(s)) * (ARENA_RADIUS - margin);
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}
function makeSnake(id: number, p: Point, angle: number, mass: number): Snake {
  angle = wrapAngle(angle);
  const length = bodyLength(mass), body: Point[] = [{ ...p }];
  for (let d = 5; d < length; d += 5) body.push({ x: p.x - Math.cos(angle) * d, y: p.y - Math.sin(angle) * d });
  body.push({ x: p.x - Math.cos(angle) * length, y: p.y - Math.sin(angle) * length });
  return { ...p, id, name: id === 0 ? 'YOU' : NAMES[id - 1], color: COLORS[id % COLORS.length], angle, target: angle, mass, body, pathLength: length, alive: true, boosting: false, boostSpent: 0, brainAt: id * 4, diedAt: 0, kills: 0, previous: { ...p }, previousAngle: angle };
}
function addFood(s: Arena, p: Point, value: number, trail = false, color?: number) {
  if (s.food.length >= MAX_FOOD) {
    if (!trail) return;
    const ordinary = s.food.findIndex(food => !food.trail);
    s.food.splice(ordinary < 0 ? 0 : ordinary, 1);
  }
  s.food.push({ ...p, id: s.nextFood++, value, color: color ?? Math.floor(random(s) * COLORS.length), trail });
}
export function createArena(seed = 0x51a7e): Arena {
  const s: Arena = { version: 1, phase: 'ready', seed: seed >>> 0, ticks: 0, accumulator: 0, nextFood: 1, snakes: [], food: [], cause: '', eaten: 0, defeated: 0, droppedSeconds: 0 };
  s.snakes.push(makeSnake(0, { x: 0, y: 0 }, 0, START_MASS));
  // A safe, readable first meal rewards steering immediately. Bots start outside it.
  for (let n = 0; n < 12; n++) addFood(s, { x: 85 + n * 25, y: Math.sin(n * .6) * 15 }, n % 4 === 0 ? 3 : 1);
  for (let id = 1; id <= BOT_COUNT; id++) {
    const angle = (id - 1) / BOT_COUNT * Math.PI * 2, r = 720 + (id % 3) * 215;
    s.snakes.push(makeSnake(id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r }, angle + Math.PI / 2, 30 + Math.floor(random(s) * 65)));
  }
  while (s.food.length < FOOD_TARGET) addFood(s, randomPoint(s), 1 + Math.floor(random(s) * 3));
  return s;
}
export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function buildGrid(s: Arena): Grid {
  const grid: Grid = new Map();
  for (const snake of s.snakes) if (snake.alive) {
    for (let i = 1; i < snake.body.length; i++) {
      const a = snake.body[i - 1], b = snake.body[i], r = radius(snake);
      const segment = { owner: snake.id, a, b, radius: r };
      for (let x = Math.floor((Math.min(a.x, b.x) - r) / CELL); x <= Math.floor((Math.max(a.x, b.x) + r) / CELL); x++)
        for (let y = Math.floor((Math.min(a.y, b.y) - r) / CELL); y <= Math.floor((Math.max(a.y, b.y) + r) / CELL); y++) {
          const key = `${x},${y}`, bucket = grid.get(key);
          if (bucket) bucket.push(segment); else grid.set(key, [segment]);
        }
    }
  }
  return grid;
}
function nearby(grid: Grid, p: Point, reach: number, visitor: (segment: Segment) => void) {
  for (let x = Math.floor((p.x - reach) / CELL); x <= Math.floor((p.x + reach) / CELL); x++)
    for (let y = Math.floor((p.y - reach) / CELL); y <= Math.floor((p.y + reach) / CELL); y++)
      for (const segment of grid.get(`${x},${y}`) ?? []) visitor(segment);
}
function steerBot(s: Arena, snake: Snake, grid: Grid) {
  let foodAngle = snake.angle, bestFood = Infinity;
  for (const food of s.food) {
    const d = distance(snake, food); if (d > 650) continue;
    const angle = Math.atan2(food.y - snake.y, food.x - snake.x);
    const cost = d * (1 + Math.abs(wrapAngle(angle - snake.angle)) * .9) / Math.sqrt(food.value);
    if (cost < bestFood) { bestFood = cost; foodAngle = angle; }
  }
  if (!Number.isFinite(bestFood)) foodAngle = Math.atan2(-snake.y, -snake.x);
  let bestCost = Infinity, choice = snake.angle;
  // Score reachable curved trajectories, including other heads and the arena wall.
  for (const desired of [foodAngle, snake.angle, snake.angle - .65, snake.angle + .65, snake.angle - 1.5, snake.angle + 1.5, Math.atan2(-snake.y, -snake.x)]) {
    let x = snake.x, y = snake.y, angle = snake.angle;
    let cost = Math.abs(wrapAngle(desired - foodAngle)) * 22;
    for (let k = 0; k < 7; k++) {
      angle += Math.max(-TURN_RATE * .12, Math.min(TURN_RATE * .12, wrapAngle(desired - angle)));
      x += Math.cos(angle) * SPEED * .12; y += Math.sin(angle) * SPEED * .12;
      const wall = ARENA_RADIUS - Math.hypot(x, y) - radius(snake);
      if (wall < 100) cost += (100 - wall) * (wall < 30 ? 50 : 1);
      nearby(grid, { x, y }, 55, seg => {
        if (seg.owner === snake.id) return;
        const clearance = pointSegmentDistance({ x, y }, seg.a, seg.b) - seg.radius - radius(snake);
        if (clearance < 42) cost += (42 - clearance) * (clearance < 10 ? 35 : 2);
      });
    }
    if (cost < bestCost) { bestCost = cost; choice = desired; }
  }
  snake.target = choice;
  snake.boosting = false; // Bots use the same collision rules; no teleporting or immunity.
  snake.brainAt = s.ticks + 12;
}
function move(snake: Snake) {
  snake.previous = { x: snake.x, y: snake.y }; snake.previousAngle = snake.angle;
  snake.angle = wrapAngle(snake.angle + Math.max(-TURN_RATE * STEP, Math.min(TURN_RATE * STEP, wrapAngle(snake.target - snake.angle))));
  const travel = SPEED * (snake.boosting ? 1.7 : 1) * STEP;
  snake.x += Math.cos(snake.angle) * travel; snake.y += Math.sin(snake.angle) * travel;
  snake.body.unshift({ x: snake.x, y: snake.y }); snake.pathLength += travel;
  const target = bodyLength(snake.mass);
  // Trim by arc length; the tail follows the exact curved head history.
  while (snake.body.length > 2 && snake.pathLength > target) {
    const tail = snake.body[snake.body.length - 1], before = snake.body[snake.body.length - 2];
    const d = distance(tail, before), excess = snake.pathLength - target;
    if (d <= excess + 1e-8) { snake.body.pop(); snake.pathLength -= d; }
    else { tail.x += (before.x - tail.x) * excess / d; tail.y += (before.y - tail.y) * excess / d; snake.pathLength = target; }
  }
  if (snake.body.length > MAX_BODY_POINTS) {
    // Keep recent motion exact and sample the older trail at uniform arc-length
    // intervals. Repeated index decimation can create arbitrarily long chords
    // on wide turns, making a legitimate trail fail its own save validator.
    const recent = 64, slots = MAX_BODY_POINTS / 2 - recent;
    let olderLength = 0;
    for (let i = recent; i < snake.body.length; i++) olderLength += distance(snake.body[i - 1], snake.body[i]);
    const compact = snake.body.slice(0, recent), spacing = olderLength / slots;
    let segment = recent, traversed = 0;
    for (let sample = 1; sample < slots; sample++) {
      const at = spacing * sample;
      while (segment < snake.body.length - 1 && traversed + distance(snake.body[segment - 1], snake.body[segment]) < at) {
        traversed += distance(snake.body[segment - 1], snake.body[segment]); segment++;
      }
      const a = snake.body[segment - 1], b = snake.body[segment], length = distance(a, b);
      const t = length ? Math.max(0, Math.min(1, (at - traversed) / length)) : 0;
      compact.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    compact.push(snake.body[snake.body.length - 1]);
    snake.body = compact;
    // Drawing, collision and persistence all use this actual polyline length.
    snake.pathLength = 0;
    for (let i = 1; i < snake.body.length; i++) snake.pathLength += distance(snake.body[i - 1], snake.body[i]);
  }
}
function defeat(s: Arena, snake: Snake, cause: string, killer?: number) {
  if (!snake.alive) return;
  snake.alive = false; snake.boosting = false; snake.diedAt = s.ticks;
  // Redistribute the actual mass along the actual body, never a random reward cloud.
  let traversed = 0, last = snake.body[0]; const points: Point[] = [];
  for (const p of snake.body) { traversed += distance(p, last); last = p; if (traversed >= 17) { points.push(p); traversed = 0; } }
  if (points.length === 0) points.push({ x: snake.x, y: snake.y });
  for (const p of points) addFood(s, p, snake.mass / points.length, true, snake.id % COLORS.length);
  snake.body = []; snake.pathLength = 0;
  if (killer !== undefined && killer !== snake.id) { const winner = s.snakes.find(other => other.id === killer); if (winner) winner.kills++; }
  if (snake.id === 0) { s.phase = 'dead'; s.cause = cause; }
  else s.defeated++;
}
function respawn(s: Arena, snake: Snake) {
  // Include snakes that respawned earlier in this same tick.
  const grid = buildGrid(s);
  for (let n = 0; n < 12; n++) {
    const p = randomPoint(s, 450); if (distance(p, s.snakes[0]) < 600) continue;
    const angle = random(s) * Math.PI * 2, replacement = makeSnake(snake.id, p, angle, START_MASS);
    let safe = true;
    for (let i = 0; i < replacement.body.length; i += 5) nearby(grid, replacement.body[i], 65, () => { safe = false; });
    if (safe) { Object.assign(snake, replacement); snake.brainAt = s.ticks; return; }
  }
}
export function stepArena(s: Arena, controls: Controls = {}) {
  if (s.phase !== 'running') return;
  s.ticks++;
  const player = s.snakes[0];
  if (controls.angle !== undefined && Number.isFinite(controls.angle)) player.target = wrapAngle(controls.angle);
  const oldGrid = buildGrid(s);
  for (const snake of s.snakes) {
    if (!snake.alive) { if (snake.id !== 0 && s.ticks - snake.diedAt >= 180) respawn(s, snake); continue; }
    if (snake.id !== 0 && s.ticks >= snake.brainAt) steerBot(s, snake, oldGrid);
    snake.boosting = snake.id === 0 && !!controls.boost && snake.mass > MIN_MASS + 1e-8;
    if (snake.boosting) {
      const cost = Math.min(snake.mass - MIN_MASS, 6 * STEP); snake.mass -= cost; snake.boostSpent += cost;
      if (snake.boostSpent >= 1) { snake.boostSpent -= 1; addFood(s, snake.body[snake.body.length - 1], 1, true, 0); }
    }
    move(snake);
  }
  const grid = buildGrid(s), deaths = new Map<number, { cause: string; killer?: number }>();
  for (const snake of s.snakes) if (snake.alive) {
    if (Math.hypot(snake.x, snake.y) + radius(snake) >= ARENA_RADIUS) deaths.set(snake.id, { cause: 'You reached the arena rim.' });
    nearby(grid, snake, radius(snake), seg => {
      if (seg.owner === snake.id || deaths.has(snake.id)) return; // Crossing your own body is safe.
      if (pointSegmentDistance(snake, seg.a, seg.b) < radius(snake) + seg.radius - 1) deaths.set(snake.id, { cause: `Your head touched ${s.snakes[seg.owner].name}’s body.`, killer: seg.owner });
    });
  }
  // Simultaneous head-on contact defeats both, independent of iteration order or mass.
  const live = s.snakes.filter(snake => snake.alive);
  for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
    if (distance(live[a], live[b]) < radius(live[a]) + radius(live[b])) {
      deaths.set(live[a].id, { cause: 'Head-on collision. Both snakes become food.' });
      deaths.set(live[b].id, { cause: 'Head-on collision. Both snakes become food.' });
    }
  }
  for (const [id, info] of deaths) defeat(s, s.snakes[id], info.cause, info.killer);
  // Resolve one owner per pellet, choosing the nearest head (ID breaks exact ties).
  s.food = s.food.filter(food => {
    let eater: Snake | undefined, best = Infinity;
    for (const snake of live) if (snake.alive) {
      const d = distance(snake, food); if (d < radius(snake) + 6 && d < best) { best = d; eater = snake; }
    }
    if (!eater) return true;
    eater.mass = Math.min(MAX_MASS, eater.mass + food.value); if (eater.id === 0) s.eaten++;
    return false;
  });
  // Bounded replenishment is seeded, including during long sessions.
  for (let n = 0; n < 5 && s.food.length < FOOD_TARGET; n++) addFood(s, randomPoint(s), 1 + Math.floor(random(s) * 3));
}
export function advanceArena(s: Arena, milliseconds: number, controls: Controls = {}) {
  if (s.phase !== 'running' || !Number.isFinite(milliseconds) || milliseconds <= 0) return;
  // At most 15 catch-up ticks. A suspended tab must never teleport a snake into a wall.
  const seconds = milliseconds / 1000, accepted = Math.min(.25, seconds);
  s.droppedSeconds += seconds - accepted;
  s.accumulator += accepted;
  while (s.accumulator + 1e-9 >= STEP && s.phase === 'running') { s.accumulator = Math.max(0, s.accumulator - STEP); stepArena(s, controls); }
  if (!s.snakes[0].alive) s.accumulator = 0;
}
export function ranking(s: Arena): Snake[] { return s.snakes.filter(snake => snake.alive || snake.id === 0).sort((a, b) => b.mass - a.mass || a.id - b.id); }
export function snapshot(s: Arena): Arena { return JSON.parse(JSON.stringify(s)) as Arena; }
export function restoreArena(data: unknown): Arena | null {
  if (!data || typeof data !== 'object') return null;
  const s = data as Arena;
  const finite = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const point = (p: unknown): p is Point => !!p && typeof p === 'object' && finite((p as Point).x, -2000, 2000) && finite((p as Point).y, -2000, 2000);
  if (s.version !== 1 || !['ready', 'running', 'dead'].includes(s.phase) || !Number.isInteger(s.seed) || !finite(s.seed, 0, 0xffffffff) || !Number.isInteger(s.ticks) || !finite(s.ticks, 0, 1e9) || !finite(s.accumulator, 0, STEP) || !Number.isInteger(s.nextFood) || !finite(s.nextFood, 1, 1e12) || !finite(s.eaten, 0, 1e9) || !finite(s.defeated, 0, 1e9) || !finite(s.droppedSeconds, 0, 1e9) || typeof s.cause !== 'string' || s.cause.length > 150) return null;
  if (!Array.isArray(s.snakes) || s.snakes.length !== BOT_COUNT + 1 || !Array.isArray(s.food) || s.food.length > MAX_FOOD) return null;
  for (let id = 0; id < s.snakes.length; id++) {
    const snake = s.snakes[id];
    if (!point(snake) || snake.id !== id || snake.name !== (id === 0 ? 'YOU' : NAMES[id - 1]) || snake.color !== COLORS[id % COLORS.length] || !point(snake.previous) || !finite(snake.angle, -Math.PI, Math.PI) || !finite(snake.previousAngle, -Math.PI, Math.PI) || !finite(snake.target, -10, 10) || !finite(snake.mass, MIN_MASS - 1e-6, MAX_MASS) || !finite(snake.pathLength, 0, bodyLength(MAX_MASS) + 10) || !finite(snake.boostSpent, 0, 1.1) || !finite(snake.brainAt, 0, 1e9) || !finite(snake.diedAt, 0, s.ticks) || !finite(snake.kills, 0, 1e9) || typeof snake.alive !== 'boolean' || typeof snake.boosting !== 'boolean' || !Array.isArray(snake.body) || snake.body.length > MAX_BODY_POINTS || !snake.body.every(point)) return null;
    if (snake.alive && (snake.body.length < 2 || distance(snake, snake.body[0]) > .01)) return null;
    if (!snake.alive && snake.body.length !== 0) return null;
    let length = 0;
    const maxSegment = Math.max(6, bodyLength(snake.mass) / MAX_BODY_POINTS * 32);
    for (let i = 1; i < snake.body.length; i++) { const d = distance(snake.body[i], snake.body[i - 1]); if (d > maxSegment) return null; length += d; }
    if (Math.abs(length - snake.pathLength) > .1) return null;
  }
  if ((s.phase === 'dead') === s.snakes[0].alive) return null;
  const foodIds = new Set<number>();
  for (const food of s.food) { if (!point(food) || !Number.isInteger(food.id) || food.id < 1 || food.id >= s.nextFood || foodIds.has(food.id) || !finite(food.value, .001, MAX_MASS) || !Number.isInteger(food.color) || !finite(food.color, 0, COLORS.length - 1) || typeof food.trail !== 'boolean') return null; foodIds.add(food.id); }
  return snapshot(s);
}
