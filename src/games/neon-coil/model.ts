/** Original, deterministic local arena. Coordinates and speeds are world pixels. */
import {
  ARENA_RADIUS, BODY_RADIUS, BODY_RADIUS_MAX_GROWTH, BODY_RADIUS_PER_MASS, BOOST_COST_PER_SECOND, BOOST_MULTIPLIER, BOT_COUNT, BOT_RING_RADII,
  FOOD_TARGET, HEAD_RADIUS_SCALE, HOOVER_ACCELERATION, HOOVER_ARRIVAL_DISTANCE, HOOVER_MAX_SPEED, HOOVER_RADIUS, HOOVER_RADIUS_PER_BODY_PX,
  HOOVER_START_SPEED, IMMUNITY_FADE_SECONDS, MAX_FOOD, MAX_TURN_RATE, RESPAWN_PLAYER_CLEARANCE, RESPAWN_RIM_MARGIN, SPAWN_IMMUNITY_TICKS, SPEED,
  STEP, TAIL_TAPER_DIAMETERS, TAIL_TAPER_MIN, TURN_RESPONSE
} from './tuning';
export { ARENA_RADIUS, BOT_COUNT, FOOD_TARGET, MAX_FOOD, MAX_TURN_RATE, SPAWN_IMMUNITY_TICKS, SPEED, STEP } from './tuning';
export const MIN_MASS = 20;
export const START_MASS = 30;
// Numeric safety is separate from the fixed geometry budget: meals keep scoring.
export const MAX_MASS = Number.MAX_SAFE_INTEGER;
export const MAX_BODY_POINTS = 2048;
const CELL = 64;
const COLORS = ['#b9f655', '#6bdcf5', '#f5a2d4', '#a99bff', '#ffc66d', '#74e6b9', '#ff817f'];
const NAMES = ['Juniper', 'Mochi', 'Orbit', 'Saffron', 'Pebble', 'Comet', 'Mango', 'Fern', 'Nimbus', 'Pippin', 'Kelp', 'Clover', 'Echo', 'Coral', 'Tango', 'Miso', 'Cosmo', 'Ripple'];
export interface Point { x: number; y: number }
/**
 * `owner`/`speed` exist only while a head is hoovering the pellet in. Both are
 * optional, so snapshots from before the hoover still load unchanged.
 */
export interface Pellet extends Point { id: number; value: number; color: number; trail: boolean; owner?: number; speed?: number }
export interface Snake extends Point {
  id: number; name: string; color: string; angle: number; target: number;
  mass: number; body: Point[]; pathLength: number; alive: boolean; boosting: boolean;
  boostSpent: number; brainAt: number; diedAt: number; kills: number;
  previous: Point; previousAngle: number;
  /** Spawn-protection ticks remaining (0 = vulnerable). Older saves without it restore as 0. */
  immune: number;
}
export interface Arena {
  version: 1; phase: 'ready' | 'running' | 'dead'; seed: number; ticks: number;
  accumulator: number; nextFood: number; snakes: Snake[]; food: Pellet[];
  cause: string; eaten: number; defeated: number; droppedSeconds: number;
}
export interface Controls { angle?: number; boost?: boolean }
/** `from`/`to` are arc distances behind the owner's head; `length` is the owner's body length. */
interface Segment { owner: number; a: Point; b: Point; radius: number; from: number; to: number; length: number }
type Grid = Map<string, Segment[]>;
export const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
// Preserve every existing run's growth through 600. Beyond it, diminishing
// length gains keep enormous scores playable, while every meal still grows.
export const bodyLength = (mass: number) => mass <= 600 ? 130 + mass * 3 : 1930 + 1800 * Math.log1p((mass - 600) / 600);
/** Base body radius. Every hitbox and every drawn disc derives from this one function. */
export const radius = (snake: Snake) => BODY_RADIUS + Math.min(BODY_RADIUS_MAX_GROWTH, Math.max(0, snake.mass - START_MASS) * BODY_RADIUS_PER_MASS);
/** Head disc radius: drawn at this size and collided at this size. */
export const headRadius = (snake: Snake) => radius(snake) * HEAD_RADIUS_SCALE;
/** Body radius `distance` px behind the head of a body `length` px long (tapered tail). */
export function bodyRadiusAt(base: number, distance: number, length: number) {
  return base * (TAIL_TAPER_MIN + (1 - TAIL_TAPER_MIN) * Math.min(1, Math.max(0, length - distance) / (base * 2 * TAIL_TAPER_DIAMETERS)));
}
/** The collision radius of `snake`'s body at an arc distance behind its head. */
export const collisionRadiusAt = (snake: Snake, distance: number) => bodyRadiusAt(radius(snake), distance, snake.pathLength);
/** Hoover reach around a head; grows gently with body width. */
export const hooverRadius = (snake: Snake) => HOOVER_RADIUS + (radius(snake) - BODY_RADIUS) * HOOVER_RADIUS_PER_BODY_PX;
/**
 * The single steering law shared by joystick, pointer, keyboard and bots:
 * turn toward `target` at min(MAX_TURN_RATE, |error| × TURN_RESPONSE), never overshooting.
 */
export function turnToward(angle: number, target: number, dt: number) {
  const error = wrapAngle(target - angle), size = Math.abs(error);
  const rate = Math.min(MAX_TURN_RATE, size * TURN_RESPONSE);
  return wrapAngle(angle + Math.sign(error) * Math.min(size, rate * dt));
}
/** 1 while fully protected, easing to 0 over the final IMMUNITY_FADE_SECONDS. `alpha` is render interpolation. */
export function immunityPaleness(snake: Snake, alpha = 1) {
  if (!snake.alive || snake.immune <= 0) return 0;
  const left = Math.max(0, snake.immune - alpha) * STEP, t = Math.min(1, left / IMMUNITY_FADE_SECONDS);
  return t * t * (3 - 2 * t);
}
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
  return { ...p, id, name: id === 0 ? 'YOU' : NAMES[id - 1], color: COLORS[id % COLORS.length], angle, target: angle, mass, body, pathLength: length, alive: true, boosting: false, boostSpent: 0, brainAt: id * 4, diedAt: 0, kills: 0, previous: { ...p }, previousAngle: angle, immune: SPAWN_IMMUNITY_TICKS };
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
    const angle = (id - 1) / BOT_COUNT * Math.PI * 2, r = BOT_RING_RADII[id % 3];
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
    let from = 0;
    const r = radius(snake);
    for (let i = 1; i < snake.body.length; i++) {
      const a = snake.body[i - 1], b = snake.body[i], to = from + distance(a, b);
      // Bucketed by the untapered radius, which bounds every tapered radius on the segment.
      const segment: Segment = { owner: snake.id, a, b, radius: r, from, to, length: snake.pathLength };
      from = to;
      for (let x = Math.floor((Math.min(a.x, b.x) - r) / CELL); x <= Math.floor((Math.max(a.x, b.x) + r) / CELL); x++)
        for (let y = Math.floor((Math.min(a.y, b.y) - r) / CELL); y <= Math.floor((Math.max(a.y, b.y) + r) / CELL); y++) {
          const key = `${x},${y}`, bucket = grid.get(key);
          if (bucket) bucket.push(segment); else grid.set(key, [segment]);
        }
    }
  }
  return grid;
}
/**
 * Gap between a disc of radius `r` at `p` and the drawn body along `seg`
 * (negative = overlapping). The body is the envelope of discs whose radius
 * varies along the trail (tail taper), so the nearest disc is not always the
 * perpendicular foot: for a radius slope k it sits k·v/√(1−k²) further along.
 */
function segmentGap(p: Point, r: number, seg: Segment) {
  const dx = seg.b.x - seg.a.x, dy = seg.b.y - seg.a.y, length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(p.x - seg.a.x, p.y - seg.a.y) - r - bodyRadiusAt(seg.radius, seg.from, seg.length);
  const u = ((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / length, v = Math.abs((p.x - seg.a.x) * dy - (p.y - seg.a.y) * dx) / length;
  const slope = (bodyRadiusAt(seg.radius, seg.to, seg.length) - bodyRadiusAt(seg.radius, seg.from, seg.length)) / length;
  const along = Math.max(0, Math.min(length, u + slope * v / Math.sqrt(1 - slope * slope)));
  return Math.hypot(along - u, v) - r - bodyRadiusAt(seg.radius, seg.from + along, seg.length);
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
      angle = turnToward(angle, desired, .12);
      x += Math.cos(angle) * SPEED * .12; y += Math.sin(angle) * SPEED * .12;
      const wall = ARENA_RADIUS - Math.hypot(x, y) - headRadius(snake);
      if (wall < 100) cost += (100 - wall) * (wall < 30 ? 50 : 1);
      nearby(grid, { x, y }, 55, seg => {
        if (seg.owner === snake.id) return;
        // A planning heuristic: untapered clearance is cheap and errs on the side of caution.
        const clearance = pointSegmentDistance({ x, y }, seg.a, seg.b) - seg.radius - headRadius(snake);
        if (clearance < 42) cost += (42 - clearance) * (clearance < 10 ? 35 : 2);
      });
    }
    if (cost < bestCost) { bestCost = cost; choice = desired; }
  }
  snake.target = choice;
  snake.boosting = false; // Bots use the same motion, immunity and collision rules; no teleporting.
  snake.brainAt = s.ticks + 12;
}
function move(snake: Snake) {
  snake.previous = { x: snake.x, y: snake.y }; snake.previousAngle = snake.angle;
  snake.angle = turnToward(snake.angle, snake.target, STEP);
  const travel = SPEED * (snake.boosting ? BOOST_MULTIPLIER : 1) * STEP;
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
  snake.alive = false; snake.boosting = false; snake.diedAt = s.ticks; snake.immune = 0;
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
    const p = randomPoint(s, RESPAWN_RIM_MARGIN); if (distance(p, s.snakes[0]) < RESPAWN_PLAYER_CLEARANCE) continue;
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
      const cost = Math.min(snake.mass - MIN_MASS, BOOST_COST_PER_SECOND * STEP); snake.mass -= cost; snake.boostSpent += cost;
      if (snake.boostSpent >= 1) { snake.boostSpent -= 1; addFood(s, snake.body[snake.body.length - 1], 1, true, 0); }
    }
    move(snake);
  }
  const grid = buildGrid(s), deaths = new Map<number, { cause: string; killer?: number }>();
  // Spawn immunity: an immune head survives other bodies and head-on contact, and an
  // immune body or head defeats nobody. The rim still defeats immune snakes.
  for (const snake of s.snakes) if (snake.alive) {
    const reach = headRadius(snake);
    if (Math.hypot(snake.x, snake.y) + reach >= ARENA_RADIUS) deaths.set(snake.id, { cause: 'You reached the arena rim.' });
    if (snake.immune > 0) continue;
    nearby(grid, snake, reach, seg => {
      if (seg.owner === snake.id || deaths.has(snake.id) || s.snakes[seg.owner].immune > 0) return; // Crossing your own body is safe.
      if (segmentGap(snake, reach, seg) < 0) deaths.set(snake.id, { cause: `Your head touched ${s.snakes[seg.owner].name}’s body.`, killer: seg.owner });
    });
  }
  // Simultaneous head-on contact defeats both, independent of iteration order or mass.
  const live = s.snakes.filter(snake => snake.alive);
  for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
    if (live[a].immune > 0 || live[b].immune > 0) continue;
    if (distance(live[a], live[b]) < headRadius(live[a]) + headRadius(live[b])) {
      deaths.set(live[a].id, { cause: 'Head-on collision. Both snakes become food.' });
      deaths.set(live[b].id, { cause: 'Head-on collision. Both snakes become food.' });
    }
  }
  for (const [id, info] of deaths) defeat(s, s.snakes[id], info.cause, info.killer);
  hoover(s);
  for (const snake of s.snakes) if (snake.alive && snake.immune > 0) snake.immune--;
  // Bounded replenishment is seeded, including during long sessions.
  for (let n = 0; n < 5 && s.food.length < FOOD_TARGET; n++) addFood(s, randomPoint(s), 1 + Math.floor(random(s) * 3));
}
/**
 * Dot hoover. A pellet inside a living head's hoover radius is claimed by the
 * nearest such head (lower ID breaks exact ties) and flows toward it, accelerating.
 * Mass is awarded once, on arrival. A pellet whose owner dies stays where it is.
 */
function hoover(s: Arena) {
  const heads = s.snakes.filter(snake => snake.alive).map(snake => ({ id: snake.id, x: snake.x, y: snake.y, reach: hooverRadius(snake) }));
  s.food = s.food.filter(food => {
    if (food.owner !== undefined && !s.snakes[food.owner]?.alive) { delete food.owner; delete food.speed; }
    if (food.owner === undefined) {
      let best = Infinity;
      for (const head of heads) {
        const dx = food.x - head.x, dy = food.y - head.y;
        if (Math.abs(dx) > head.reach || Math.abs(dy) > head.reach) continue;
        const d = Math.hypot(dx, dy); if (d <= head.reach && d < best) { best = d; food.owner = head.id; }
      }
      if (food.owner === undefined) return true;
      food.speed = HOOVER_START_SPEED;
    }
    const owner = s.snakes[food.owner];
    food.speed = Math.min(HOOVER_MAX_SPEED, (food.speed ?? HOOVER_START_SPEED) + HOOVER_ACCELERATION * STEP);
    const dx = owner.x - food.x, dy = owner.y - food.y, d = Math.hypot(dx, dy), travel = food.speed * STEP;
    if (d - travel <= HOOVER_ARRIVAL_DISTANCE) {
      owner.mass = Math.min(MAX_MASS, owner.mass + food.value); if (owner.id === 0) s.eaten++;
      return false;
    }
    food.x += dx / d * travel; food.y += dy / d * travel;
    return true;
  });
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
  const bound = ARENA_RADIUS + 400, point = (p: unknown): p is Point => !!p && typeof p === 'object' && finite((p as Point).x, -bound, bound) && finite((p as Point).y, -bound, bound);
  if (s.version !== 1 || !['ready', 'running', 'dead'].includes(s.phase) || !Number.isInteger(s.seed) || !finite(s.seed, 0, 0xffffffff) || !Number.isInteger(s.ticks) || !finite(s.ticks, 0, 1e9) || !finite(s.accumulator, 0, STEP) || !Number.isInteger(s.nextFood) || !finite(s.nextFood, 1, 1e12) || !finite(s.eaten, 0, 1e9) || !finite(s.defeated, 0, 1e9) || !finite(s.droppedSeconds, 0, 1e9) || typeof s.cause !== 'string' || s.cause.length > 150) return null;
  if (!Array.isArray(s.snakes) || s.snakes.length !== BOT_COUNT + 1 || !Array.isArray(s.food) || s.food.length > MAX_FOOD) return null;
  for (let id = 0; id < s.snakes.length; id++) {
    const snake = s.snakes[id];
    if (!point(snake) || snake.id !== id || snake.name !== (id === 0 ? 'YOU' : NAMES[id - 1]) || snake.color !== COLORS[id % COLORS.length] || !point(snake.previous) || !finite(snake.angle, -Math.PI, Math.PI) || !finite(snake.previousAngle, -Math.PI, Math.PI) || !finite(snake.target, -10, 10) || !finite(snake.mass, MIN_MASS - 1e-6, MAX_MASS) || !finite(snake.pathLength, 0, bodyLength(MAX_MASS) + 10) || !finite(snake.boostSpent, 0, 1.1) || !finite(snake.brainAt, 0, 1e9) || !finite(snake.diedAt, 0, s.ticks) || !finite(snake.kills, 0, 1e9) || typeof snake.alive !== 'boolean' || typeof snake.boosting !== 'boolean' || !Array.isArray(snake.body) || snake.body.length > MAX_BODY_POINTS || !snake.body.every(point)) return null;
    if (snake.immune !== undefined && (!Number.isInteger(snake.immune) || !finite(snake.immune, 0, 1e6))) return null;
    if (snake.alive && (snake.body.length < 2 || distance(snake, snake.body[0]) > .01)) return null;
    if (!snake.alive && snake.body.length !== 0) return null;
    let length = 0;
    const maxSegment = Math.max(6, bodyLength(snake.mass) / MAX_BODY_POINTS * 32);
    for (let i = 1; i < snake.body.length; i++) { const d = distance(snake.body[i], snake.body[i - 1]); if (d > maxSegment) return null; length += d; }
    if (Math.abs(length - snake.pathLength) > .1) return null;
  }
  if ((s.phase === 'dead') === s.snakes[0].alive) return null;
  const foodIds = new Set<number>();
  for (const food of s.food) { if (!point(food) || !Number.isInteger(food.id) || food.id < 1 || food.id >= s.nextFood || foodIds.has(food.id) || !finite(food.value, .001, MAX_MASS) || !Number.isInteger(food.color) || !finite(food.color, 0, COLORS.length - 1) || typeof food.trail !== 'boolean') return null;
    if ((food.owner === undefined) !== (food.speed === undefined)) return null;
    if (food.owner !== undefined && (!Number.isInteger(food.owner) || !finite(food.owner, 0, BOT_COUNT) || !finite(food.speed, 0, HOOVER_MAX_SPEED))) return null;
    foodIds.add(food.id);
  }
  const restored = snapshot(s);
  // Backward compatible: pre-immunity saves load unprotected; retuned timers clamp.
  for (const snake of restored.snakes) snake.immune = snake.alive ? Math.min(snake.immune ?? 0, SPAWN_IMMUNITY_TICKS) : 0;
  return restored;
}
