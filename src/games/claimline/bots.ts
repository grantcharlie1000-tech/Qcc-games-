import { cellOf } from './geometry';
import { random } from './rng';
import { ARENA_R, CENTER, GRID, type BotBrain, type Player, type World } from './types';

/** Rule-based, deterministic bots. They only ever set `target`; the model's step() turns and moves them like the human. */
export function makeBrain(rand: () => number): BotBrain {
  return {
    aggression: 0.2 + 0.7 * rand(),
    loopSize: 5 + 9 * rand(),
    reaction: 0.1 + 0.1 * rand(),
    nextPlanAt: 0,
    mode: 'home',
    waypoints: [],
    targetId: 0
  };
}

const WAYPOINT_R = 1.5;
const SAFE_R = ARENA_R - 3;

/** Nearest cell owned by `id` to (x, y), found by scanning outward rings. */
function nearestOwn(world: World, id: number, x: number, y: number): { x: number; y: number; d: number } | null {
  const cx = Math.floor(x), cy = Math.floor(y);
  let best: { x: number; y: number; d: number } | null = null;
  for (let r = 0; r < GRID; r++) {
    if (best && r > best.d + 1) break;
    for (let oy = -r; oy <= r; oy++) {
      const yy = cy + oy;
      if (yy < 0 || yy >= GRID) continue;
      const edgeRow = oy === -r || oy === r;
      for (let ox = -r; ox <= r; ox += edgeRow || r === 0 ? 1 : 2 * r) {
        const xx = cx + ox;
        if (xx < 0 || xx >= GRID || world.owner[yy * GRID + xx] !== id) continue;
        const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
        if (!best || d < best.d) best = { x: xx + 0.5, y: yy + 0.5, d };
      }
    }
  }
  return best;
}

function centroid(world: World, id: number): { x: number; y: number } | null {
  let sx = 0, sy = 0, n = 0;
  for (let cy = 0; cy < GRID; cy++) for (let cx = 0; cx < GRID; cx++) if (world.owner[cy * GRID + cx] === id) { sx += cx + 0.5; sy += cy + 0.5; n++; }
  return n ? { x: sx / n, y: sy / n } : null;
}

function trailLength(trail: number[], hx: number, hy: number): number {
  let total = 0;
  for (let i = 2; i < trail.length; i += 2) total += Math.hypot(trail[i] - trail[i - 2], trail[i + 1] - trail[i - 1]);
  if (trail.length) total += Math.hypot(hx - trail[trail.length - 2], hy - trail[trail.length - 1]);
  return total;
}

/** Closest point of a player's exposed trail (including its live segment) to (x, y). */
function closestTrailPoint(v: Player, x: number, y: number): { x: number; y: number; d: number } | null {
  const t = v.trail;
  if (!t.length) return null;
  let best: { x: number; y: number; d: number } | null = null;
  const consider = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let u = len2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const qx = ax + u * dx, qy = ay + u * dy, d = Math.hypot(x - qx, y - qy);
    if (!best || d < best.d) best = { x: qx, y: qy, d };
  };
  for (let i = 0; i + 3 < t.length; i += 2) consider(t[i], t[i + 1], t[i + 2], t[i + 3]);
  consider(t[t.length - 2], t[t.length - 1], v.x, v.y);
  return best;
}

/** Clamp a point inside the safe radius so waypoints never ask for the wall. */
function inside(x: number, y: number): { x: number; y: number } {
  const dx = x - CENTER, dy = y - CENTER, d = Math.hypot(dx, dy);
  return d > SAFE_R ? { x: CENTER + (dx / d) * SAFE_R, y: CENTER + (dy / d) * SAFE_R } : { x, y };
}

/** How much non-own, playable ground lies along a ray: the loop heads where there is land to take. */
function openness(world: World, id: number, x: number, y: number, angle: number, length: number): number {
  let score = 0;
  for (let s = 2; s <= length; s += 2) {
    const px = x + Math.cos(angle) * s, py = y + Math.sin(angle) * s;
    if (Math.hypot(px - CENTER, py - CENTER) > SAFE_R) return score - 4;
    const i = cellOf(px, py);
    if (i >= 0 && world.mask[i] && world.owner[i] !== id) score += world.owner[i] === 0 ? 1 : 1.5;
  }
  return score;
}

function planLoop(world: World, p: Player, b: BotBrain): void {
  const home = centroid(world, p.id) ?? { x: p.x, y: p.y };
  let away = Math.atan2(p.y - home.y, p.x - home.x);
  if (Math.hypot(p.x - home.x, p.y - home.y) < 1) away = random(world) * Math.PI * 2;
  let bestAngle = away, bestScore = -Infinity;
  for (let k = 0; k < 5; k++) {
    const angle = away + (random(world) - 0.5) * 1.8;
    const score = openness(world, p.id, p.x, p.y, angle, b.loopSize) + random(world) * 0.5;
    if (score > bestScore) { bestScore = score; bestAngle = angle; }
  }
  const side = random(world) < 0.5 ? 1 : -1;
  const w1 = inside(p.x + Math.cos(bestAngle) * b.loopSize, p.y + Math.sin(bestAngle) * b.loopSize);
  const sideAngle = bestAngle + side * Math.PI / 2;
  const w2 = inside(w1.x + Math.cos(sideAngle) * b.loopSize * 0.8, w1.y + Math.sin(sideAngle) * b.loopSize * 0.8);
  b.waypoints = [w1.x, w1.y, w2.x, w2.y];
  b.mode = 'out';
  b.targetId = 0;
}

/** Look for a trailing opponent whose trail I can reach before they get home. */
function findIntercept(world: World, p: Player, b: BotBrain): { v: Player; x: number; y: number } | null {
  if (trailLength(p.trail, p.x, p.y) >= b.loopSize * 1.5) return null;
  const reach = 5 + 10 * b.aggression;
  let best: { v: Player; x: number; y: number; d: number } | null = null;
  for (const v of world.players) {
    if (v === p || !v.alive || !v.trail.length) continue;
    const c = closestTrailPoint(v, p.x, p.y);
    if (!c || c.d >= reach) continue;
    const home = nearestOwn(world, v.id, v.x, v.y);
    // Same speed for everyone: only chase a trail point the bot can reach before its owner gets home.
    if (!home || c.d >= home.d) continue;
    if (!best || c.d < best.d) best = { v, x: c.x, y: c.y, d: c.d };
  }
  return best;
}

function threatened(world: World, p: Player, b: BotBrain): boolean {
  const danger = 5 + 7 * (1 - b.aggression);
  for (const v of world.players) {
    if (v === p || !v.alive || (b.mode === 'intercept' && v.id === b.targetId)) continue;
    if (Math.hypot(v.x - p.x, v.y - p.y) < danger) return true;
    for (let i = 0; i < p.trail.length; i += 2) if (Math.hypot(v.x - p.trail[i], v.y - p.trail[i + 1]) < danger) return true;
  }
  return false;
}

function followWaypoints(p: Player, b: BotBrain): boolean {
  while (b.waypoints.length >= 2) {
    const dx = b.waypoints[0] - p.x, dy = b.waypoints[1] - p.y, d = Math.hypot(dx, dy);
    const passed = d < 3.5 && Math.cos(p.angle) * dx + Math.sin(p.angle) * dy < 0;
    if (d >= WAYPOINT_R && !passed) { p.target = Math.atan2(dy, dx); return true; }
    b.waypoints.splice(0, 2);
  }
  return false;
}

function steerHome(world: World, p: Player, b: BotBrain): void {
  const home = nearestOwn(world, p.id, p.x, p.y);
  if (home) p.target = Math.atan2(home.y - p.y, home.x - p.x);
  b.mode = 'return';
  b.waypoints = [];
  b.targetId = 0;
}

function plan(world: World, p: Player, b: BotBrain): void {
  const trailing = p.trail.length > 0;
  if (trailing) {
    if (b.mode === 'home') b.mode = 'out';
    if (b.mode !== 'return' && (threatened(world, p, b) || trailLength(p.trail, p.x, p.y) > b.loopSize * 4)) { steerHome(world, p, b); return; }
  } else if (b.mode === 'return') {
    b.mode = 'home';
  }
  if (b.mode !== 'return') {
    const hit = findIntercept(world, p, b);
    if (hit) { b.mode = 'intercept'; b.targetId = hit.v.id; b.waypoints = []; p.target = Math.atan2(hit.y - p.y, hit.x - p.x); return; }
  }
  if (b.mode === 'intercept') {
    // The chase ended (target home, cut, or out of reach): go home if exposed, otherwise plan a new loop.
    b.targetId = 0;
    b.mode = trailing ? 'return' : 'home';
  }
  if (b.mode === 'return') { steerHome(world, p, b); return; }
  if (b.mode === 'out' && followWaypoints(p, b)) return;
  if (trailing) { steerHome(world, p, b); return; }
  planLoop(world, p, b);
  followWaypoints(p, b);
}

export function thinkBots(world: World): void {
  for (const p of world.players) {
    const b = p.brain;
    if (!p.isBot || !p.alive || !b || world.time < b.nextPlanAt) continue;
    plan(world, p, b);
    if (!Number.isFinite(p.target)) p.target = p.angle;
    b.nextPlanAt = world.time + b.reaction;
  }
}
