import { thinkBots, makeBrain } from './bots';
import { angleTo, buildMask, cellOf, distToSegment, sweepHit } from './geometry';
import { random } from './rng';
import { basisPoints } from './score';
import {
  ARENA_R, BOT_COUNT, CENTER, GRID, HEAD_EDGE_R, HIT_R, HUMAN, MAX_FRAME, NEUTRAL, PLAYER_COUNT, RESPAWN_SECONDS,
  SPEED, STAMP_R, START_R, STEP, TRAIL_SPACING, TURN_RATE,
  type BotBrain, type EndReason, type Phase, type Player, type World
} from './types';

export { random };

const BOT_NAMES = ['Moss', 'Juno', 'Pip', 'Rook', 'Tansy', 'Bram'] as const;
const CELLS = GRID * GRID;
const SAMPLE_SPACING = 0.25;
const TWO_PI = Math.PI * 2;
/** Restore limit for a stored trail: 50,000 points is 25,000 cells of travel, far beyond any real excursion. */
const MAX_TRAIL_VALUES = 100000;
/** Two heads this close are touching; contact between heads never cuts a trail. */
const HEAD_CONTACT_R = 2 * HIT_R;

function newPlayer(index: number, brain: BotBrain | null): Player {
  const isBot = index > 0;
  return {
    id: index + 1, name: isBot ? BOT_NAMES[index - 1] : 'You', isBot,
    x: CENTER, y: CENTER, px: CENTER, py: CENTER, angle: 0, target: 0,
    alive: false, trail: [], peak: 0, kills: 0,
    respawnAt: Infinity,
    brain
  };
}

export function createWorld(seed: number, opts: { bots?: number; spawn?: boolean } = {}): World {
  const bots = Math.max(0, Math.min(BOT_COUNT, Math.floor(opts.bots ?? BOT_COUNT)));
  const { mask, playable } = buildMask();
  const world: World = {
    seed: seed >>> 0, rngState: seed >>> 0, tick: 0, time: 0, accumulator: 0, phase: 'ready',
    mask, owner: new Uint8Array(CELLS), playable, counts: new Int32Array(PLAYER_COUNT + 1),
    players: [], landVersion: 1, dirty: null, events: [], result: null
  };
  world.counts[NEUTRAL] = playable;
  for (let i = 0; i < PLAYER_COUNT; i++) world.players.push(newPlayer(i, i > 0 ? makeBrain(() => random(world)) : null));
  if (opts.spawn ?? true) spawnAll(world, bots);
  return world;
}

function spawnAll(world: World, bots: number): void {
  const a0 = random(world) * TWO_PI, slot = TWO_PI / (BOT_COUNT + 1);
  placePlayer(world, HUMAN, CENTER + Math.cos(a0) * ARENA_R * 0.5, CENTER + Math.sin(a0) * ARENA_R * 0.5, a0 + Math.PI / 2);
  for (let k = 0; k < bots; k++) {
    const a = a0 + (k + 1) * slot + (random(world) - 0.5) * 0.5 * slot;
    const r = ARENA_R * (0.3 + 0.45 * random(world));
    const bot = world.players[k + 1];
    placePlayer(world, bot.id, CENTER + Math.cos(a) * r, CENTER + Math.sin(a) * r, a + Math.PI / 2);
    if (bot.brain) bot.brain.nextPlanAt = random(world) * bot.brain.reaction;
  }
}

export function setOwner(world: World, idx: number, id: number): void {
  if (idx < 0 || idx >= CELLS || !world.mask[idx]) return;
  const old = world.owner[idx];
  if (old === id) return;
  world.counts[old]--;
  world.counts[id]++;
  world.owner[idx] = id;
  world.landVersion++;
  const cx = idx % GRID, cy = (idx - cx) / GRID, d = world.dirty;
  if (!d) world.dirty = [cx, cy, cx, cy];
  else {
    if (cx < d[0]) d[0] = cx;
    if (cy < d[1]) d[1] = cy;
    if (cx > d[2]) d[2] = cx;
    if (cy > d[3]) d[3] = cy;
  }
}

function claimDisc(world: World, id: number, x: number, y: number, r: number): void {
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(GRID - 1, Math.floor(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(GRID - 1, Math.floor(y + r));
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const dx = cx + 0.5 - x, dy = cy + 0.5 - y;
    if (dx * dx + dy * dy <= r * r) setOwner(world, cy * GRID + cx, id);
  }
}

export function placePlayer(world: World, id: number, x: number, y: number, angle: number, discR = START_R): void {
  const p = world.players[id - 1];
  p.alive = true;
  p.x = p.px = x; p.y = p.py = y;
  p.angle = p.target = angleTo(0, angle);
  p.trail = [];
  p.respawnAt = Infinity;
  if (p.brain) { p.brain.mode = 'home'; p.brain.waypoints = []; p.brain.targetId = 0; p.brain.nextPlanAt = world.time; }
  claimDisc(world, id, x, y, discR);
  p.peak = Math.max(p.peak, basisPoints(world.counts[id], world.playable));
}

export const percent = (world: World, id: number): number => (world.playable > 0 ? (100 * world.counts[id]) / world.playable : 0);

export function ranking(world: World): { id: number; name: string; isBot: boolean; alive: boolean; bp: number }[] {
  return world.players
    .map(p => ({ id: p.id, name: p.name, isBot: p.isBot, alive: p.alive, bp: basisPoints(world.counts[p.id], world.playable) }))
    .sort((a, b) => b.bp - a.bp || a.id - b.id);
}

export function start(world: World): void {
  if (world.phase === 'ready') world.phase = 'running';
}

export function recount(world: World): Int32Array {
  const counts = new Int32Array(PLAYER_COUNT + 1);
  for (let i = 0; i < CELLS; i++) if (world.mask[i]) counts[world.owner[i]]++;
  return counts;
}

/* ---------- elimination and capture ---------- */

export function eliminate(world: World, victim: number, by: number, reason: EndReason): void {
  const v = world.players[victim - 1];
  if (!v || !v.alive) return;
  v.alive = false;
  v.trail = [];
  v.respawnAt = v.isBot ? world.time + RESPAWN_SECONDS : Infinity;
  if (v.brain) { v.brain.mode = 'home'; v.brain.waypoints = []; v.brain.targetId = 0; }
  const winner = by > 0 && by !== victim ? world.players[by - 1] : undefined;
  const to = winner && winner.alive ? winner.id : NEUTRAL;
  const cells: number[] = [];
  for (let i = 0; i < CELLS; i++) if (world.owner[i] === victim) cells.push(i);
  for (const i of cells) setOwner(world, i, to);
  if (to !== NEUTRAL && cells.length) world.events.push({ kind: 'takeover', from: victim, to, cells });
  world.events.push({ kind: 'defeat', id: victim, by, reason, x: v.x, y: v.y });
  if (victim === HUMAN && !world.result) world.result = { reason, by };
}

function stamp(world: World, wall: Uint8Array, ax: number, ay: number, bx: number, by: number): void {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - STAMP_R)), x1 = Math.min(GRID - 1, Math.floor(Math.max(ax, bx) + STAMP_R));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - STAMP_R)), y1 = Math.min(GRID - 1, Math.floor(Math.max(ay, by) + STAMP_R));
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const i = cy * GRID + cx;
    if (world.mask[i] && !wall[i] && distToSegment(cx + 0.5, cy + 0.5, ax, ay, bx, by) <= STAMP_R) wall[i] = 1;
  }
}

/** Capture with the trail's live segment ending at (endX, endY) (the head, or the home entry point). */
function captureCore(world: World, id: number, endX: number, endY: number): { cells: number[]; stolen: number } {
  const p = world.players[id - 1];
  const wall = new Uint8Array(CELLS);
  for (let i = 0; i < CELLS; i++) if (world.owner[i] === id) wall[i] = 1;
  const t = p.trail;
  for (let i = 0; i + 3 < t.length; i += 2) stamp(world, wall, t[i], t[i + 1], t[i + 2], t[i + 3]);
  if (t.length) stamp(world, wall, t[t.length - 2], t[t.length - 1], endX, endY);
  // Flood the outside from the grid corner (never playable, never a wall) over 4-neighbours.
  const seen = new Uint8Array(CELLS), stack = new Int32Array(CELLS);
  let sp = 0;
  stack[sp++] = 0; seen[0] = 1;
  while (sp) {
    const i = stack[--sp], cx = i % GRID;
    if (cx > 0 && !seen[i - 1] && !wall[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
    if (cx < GRID - 1 && !seen[i + 1] && !wall[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
    if (i >= GRID && !seen[i - GRID] && !wall[i - GRID]) { seen[i - GRID] = 1; stack[sp++] = i - GRID; }
    if (i < CELLS - GRID && !seen[i + GRID] && !wall[i + GRID]) { seen[i + GRID] = 1; stack[sp++] = i + GRID; }
  }
  const cells: number[] = [];
  let stolen = 0;
  for (let i = 0; i < CELLS; i++) {
    if (!world.mask[i] || seen[i]) continue;
    const old = world.owner[i];
    if (old === id) continue;
    if (old !== NEUTRAL) stolen++;
    cells.push(i);
  }
  for (const i of cells) setOwner(world, i, id);
  p.trail = [];
  if (cells.length) world.events.push({ kind: 'capture', id, cells, stolen });
  for (const q of world.players) if (q.alive && q.id !== id && world.counts[q.id] === 0) eliminate(world, q.id, id, 'land');
  return { cells, stolen };
}

export function capture(world: World, id: number): { cells: number[]; stolen: number } {
  const p = world.players[id - 1];
  return captureCore(world, id, p.x, p.y);
}

/* ---------- movement ---------- */

function move(p: Player, dt: number): void {
  p.px = p.x; p.py = p.y;
  const maxTurn = TURN_RATE * dt;
  p.angle = angleTo(0, p.angle + Math.max(-maxTurn, Math.min(maxTurn, angleTo(p.angle, p.target))));
  const d = SPEED * dt;
  let nx = p.x + Math.cos(p.angle) * d, ny = p.y + Math.sin(p.angle) * d;
  if (Math.hypot(nx - CENTER, ny - CENTER) <= HEAD_EDGE_R) { p.x = nx; p.y = ny; return; }
  // Edge slide: keep only the tangential part of the heading so the head runs along the wall at full speed, never faster.
  const rx = p.x - CENTER, ry = p.y - CENTER, rl = Math.hypot(rx, ry) || 1;
  const ux = rx / rl, uy = ry / rl;
  const hx = Math.cos(p.angle), hy = Math.sin(p.angle), dot = hx * ux + hy * uy;
  let tx = hx - dot * ux, ty = hy - dot * uy;
  const tl = Math.hypot(tx, ty);
  if (tl < 1e-9) {
    const ccw = angleTo(Math.atan2(uy, ux), p.target) >= 0;
    tx = ccw ? -uy : uy; ty = ccw ? ux : -ux;
  } else { tx /= tl; ty /= tl; }
  p.angle = Math.atan2(ty, tx);
  nx = p.x + tx * d; ny = p.y + ty * d;
  const nd = Math.hypot(nx - CENTER, ny - CENTER);
  if (nd > HEAD_EDGE_R) { nx = CENTER + ((nx - CENTER) / nd) * HEAD_EDGE_R; ny = CENTER + ((ny - CENTER) / nd) * HEAD_EDGE_R; }
  p.x = nx; p.y = ny;
}

/* ---------- step events ---------- */

interface StepEvent { home: boolean; t: number; a: number; v: number; x: number; y: number }

/**
 * Walk the head's segment in <= 0.25-cell samples. Starts the trail where the head last touched its own land and
 * returns the first sample back on own land, if any. `trailStart[id]` records when (0..1) a trail began this step.
 */
function scanHome(world: World, p: Player, trailStart: Float64Array): StepEvent | null {
  const dx = p.x - p.px, dy = p.y - p.py;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / SAMPLE_SPACING));
  let trailing = p.trail.length > 0;
  let homeX = p.px, homeY = p.py, homeT = 0;
  for (let k = 0; k <= n; k++) {
    const t = k / n, sx = p.px + dx * t, sy = p.py + dy * t;
    const i = cellOf(sx, sy), owned = i >= 0 && world.owner[i] === p.id;
    if (!trailing) {
      if (owned) { homeX = sx; homeY = sy; homeT = t; }
      else { p.trail = [homeX, homeY]; trailing = true; trailStart[p.id] = homeT; }
    } else if (owned) return { home: true, t, a: p.id, v: 0, x: sx, y: sy };
  }
  return null;
}

/** Earliest cut of V's exposed trail by mover A this step, or Infinity. */
function cutTime(a: Player, v: Player, trailStartT: number): number {
  const t = v.trail, n = t.length;
  const lo = HIT_R;
  const minX = Math.min(a.px, a.x) - lo, maxX = Math.max(a.px, a.x) + lo, minY = Math.min(a.py, a.y) - lo, maxY = Math.max(a.py, a.y) + lo;
  let best = Infinity;
  const test = (cx: number, cy: number, dx: number, dy: number): number => {
    if (Math.max(cx, dx) < minX || Math.min(cx, dx) > maxX || Math.max(cy, dy) < minY || Math.min(cy, dy) > maxY) return Infinity;
    const h = sweepHit(a.px, a.py, a.x, a.y, cx, cy, dx, dy, HIT_R);
    if (h > 1) return h;
    // Heads in contact are not a cut: ignore a hit that happens within two head radii of the victim's own head.
    const hx = a.px + (a.x - a.px) * h - (v.px + (v.x - v.px) * h), hy = a.py + (a.y - a.py) * h - (v.py + (v.y - v.py) * h);
    return hx * hx + hy * hy < HEAD_CONTACT_R * HEAD_CONTACT_R ? Infinity : h;
  };
  for (let i = 0; i + 3 < n; i += 2) best = Math.min(best, test(t[i], t[i + 1], t[i + 2], t[i + 3]));
  const lx = t[n - 2], ly = t[n - 1];
  // Part of V's path laid this step: from where the trail began (its last point if it began this step, else the old head).
  let sx = v.px, sy = v.py, t0 = 0;
  if (trailStartT >= 0) { sx = lx; sy = ly; t0 = trailStartT; }
  else best = Math.min(best, test(lx, ly, v.px, v.py));
  const px = v.x - sx, py = v.y - sy, len2 = px * px + py * py;
  if (len2 > 1e-18) {
    const h = test(sx, sy, v.x, v.y);
    if (h < best) {
      const qx = a.px + (a.x - a.px) * h - sx, qy = a.py + (a.y - a.py) * h - sy;
      const u = Math.max(0, Math.min(1, (qx * px + qy * py) / len2));
      if (t0 + (1 - t0) * u <= h + 1e-9) best = h;
    }
  }
  return best;
}

/** A respawn never lands this close to anyone's exposed trail, so nobody loses to a bot that was not there a moment ago. */
const SPAWN_TRAIL_CLEARANCE = 8;

/** Distance from (x, y) to a player's exposed trail including its live segment to the head; Infinity when home. */
function trailClearance(q: Player, x: number, y: number): number {
  const t = q.trail;
  if (!t.length) return Infinity;
  let d = distToSegment(x, y, t[t.length - 2], t[t.length - 1], q.x, q.y);
  for (let i = 0; i + 3 < t.length; i += 2) d = Math.min(d, distToSegment(x, y, t[i], t[i + 1], t[i + 2], t[i + 3]));
  return d;
}

function findSpawn(world: World): { x: number; y: number } | null {
  const r = START_R + 2;
  for (let attempt = 0; attempt < 40; attempt++) {
    const dist = (ARENA_R - r - 1) * Math.sqrt(random(world)), ang = random(world) * TWO_PI;
    const x = CENTER + Math.cos(ang) * dist, y = CENTER + Math.sin(ang) * dist;
    let free = true;
    for (let cy = Math.floor(y - r); free && cy <= Math.floor(y + r); cy++) for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
      const dx = cx + 0.5 - x, dy = cy + 0.5 - y;
      if (dx * dx + dy * dy > r * r) continue;
      const i = cellOf(cx + 0.5, cy + 0.5);
      if (i < 0 || !world.mask[i] || world.owner[i] !== NEUTRAL) { free = false; break; }
    }
    if (free && world.players.every(q => !q.alive || (Math.hypot(q.x - x, q.y - y) >= 10 && trailClearance(q, x, y) >= SPAWN_TRAIL_CLEARANCE))) return { x, y };
  }
  return null;
}

function respawnBots(world: World): void {
  for (const p of world.players) {
    if (!p.isBot || p.alive || !Number.isFinite(p.respawnAt) || world.time < p.respawnAt) continue;
    const spot = findSpawn(world);
    if (!spot) { p.respawnAt = world.time + 1; continue; }
    p.peak = 0; p.kills = 0;
    placePlayer(world, p.id, spot.x, spot.y, random(world) * TWO_PI - Math.PI);
    world.events.push({ kind: 'respawn', id: p.id });
  }
}

export function step(world: World, dt: number = STEP): void {
  if (world.phase !== 'running') return;
  world.time += dt;
  world.tick++;
  thinkBots(world);
  respawnBots(world);

  const movers = world.players.filter(p => p.alive);
  for (const p of movers) move(p, dt);

  const trailStart = new Float64Array(PLAYER_COUNT + 1).fill(-1);
  const events: StepEvent[] = [];
  for (const p of movers) {
    const h = scanHome(world, p, trailStart);
    if (h) events.push(h);
  }
  for (const a of movers) for (const v of movers) {
    if (a === v || !v.trail.length) continue;
    const t = cutTime(a, v, trailStart[v.id]);
    if (t <= 1) events.push({ home: false, t, a: a.id, v: v.id, x: 0, y: 0 });
  }
  events.sort((e, f) => e.t - f.t || Number(f.home) - Number(e.home) || e.a - f.a || e.v - f.v);
  for (const e of events) {
    const a = world.players[e.a - 1];
    if (e.home) {
      if (!a.alive || !a.trail.length) continue;
      a.trail.push(e.x, e.y);
      captureCore(world, a.id, e.x, e.y);
    } else {
      const v = world.players[e.v - 1];
      if (!a.alive || !v.alive || !v.trail.length) continue;
      eliminate(world, v.id, a.id, 'cut');
      a.kills++;
    }
  }

  for (const p of world.players) {
    if (!p.alive) continue;
    const n = p.trail.length;
    if (n && Math.hypot(p.x - p.trail[n - 2], p.y - p.trail[n - 1]) >= TRAIL_SPACING) p.trail.push(p.x, p.y);
    p.peak = Math.max(p.peak, basisPoints(world.counts[p.id], world.playable));
  }

  if (world.result) world.phase = 'over';
  else if (world.counts[HUMAN] === world.playable) { world.result = { reason: 'won', by: HUMAN }; world.phase = 'over'; }
}

export function advance(world: World, frameSeconds: number): number {
  if (world.phase !== 'running') return 0;
  world.accumulator += Math.max(0, Math.min(frameSeconds, MAX_FRAME));
  let steps = 0;
  while (world.accumulator >= STEP - 1e-9 && world.phase === 'running') {
    world.accumulator = Math.max(0, world.accumulator - STEP);
    step(world, STEP);
    steps++;
  }
  return steps;
}

/* ---------- snapshot ---------- */

function encodeOwner(owner: Uint8Array): string {
  const parts: string[] = [];
  let run = 1;
  for (let i = 1; i <= owner.length; i++) {
    if (i < owner.length && owner[i] === owner[i - 1]) { run++; continue; }
    parts.push(owner[i - 1] + ':' + run);
    run = 1;
  }
  return parts.join(',');
}

function decodeOwner(text: string, mask: Uint8Array): Uint8Array | null {
  const owner = new Uint8Array(CELLS);
  let at = 0;
  for (const part of text.split(',')) {
    const m = /^(\d{1,2}):(\d{1,6})$/.exec(part);
    if (!m) return null;
    const value = Number(m[1]), run = Number(m[2]);
    if (value > PLAYER_COUNT || run < 1 || at + run > CELLS) return null;
    for (let i = at; i < at + run; i++) { if (value && !mask[i]) return null; owner[i] = value; }
    at += run;
  }
  return at === CELLS ? owner : null;
}

export function snapshot(world: World): unknown {
  return {
    version: 1, seed: world.seed, rngState: world.rngState, tick: world.tick, time: world.time, phase: world.phase,
    owner: encodeOwner(world.owner),
    players: world.players.map(p => ({
      id: p.id, x: p.x, y: p.y, px: p.px, py: p.py, angle: p.angle, target: p.target, alive: p.alive,
      trail: p.trail.slice(), peak: p.peak, kills: p.kills, respawnAt: Number.isFinite(p.respawnAt) ? p.respawnAt : null,
      brain: p.brain ? { ...p.brain, waypoints: p.brain.waypoints.slice() } : null
    })),
    result: world.result ? { ...world.result } : null
  };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const int = (v: unknown, lo: number, hi: number): v is number => num(v, lo, hi) && Number.isInteger(v);
const numList = (v: unknown, maxLen: number, lo: number, hi: number): v is number[] =>
  Array.isArray(v) && v.length <= maxLen && v.length % 2 === 0 && v.every(n => num(n, lo, hi));
const MODES: readonly BotBrain['mode'][] = ['home', 'out', 'return', 'intercept'];
const PHASES: readonly Phase[] = ['ready', 'running', 'over'];
const REASONS: readonly EndReason[] = ['cut', 'land', 'won'];

function restorePlayer(data: unknown, index: number): Player | null {
  if (!isObj(data) || data.id !== index + 1) return null;
  const p = newPlayer(index, null);
  const { x, y, px, py, angle, target, alive, trail, peak, kills, respawnAt, brain } = data;
  if (!num(x, 0, GRID) || !num(y, 0, GRID) || !num(px, 0, GRID) || !num(py, 0, GRID)) return null;
  if (!num(angle, -10, 10) || !num(target, -10, 10) || typeof alive !== 'boolean') return null;
  if (!numList(trail, MAX_TRAIL_VALUES, 0, GRID) || (!alive && trail.length)) return null;
  if (!int(peak, 0, 10000) || !int(kills, 0, 100000)) return null;
  if (respawnAt !== null && !num(respawnAt, 0, 1e9)) return null;
  if (p.isBot) {
    if (!isObj(brain) || !num(brain.aggression, 0, 1) || !num(brain.loopSize, 1, 60) || !num(brain.reaction, 0.05, 0.5)) return null;
    if (!num(brain.nextPlanAt, 0, 1e9) || !MODES.includes(brain.mode as BotBrain['mode']) || !int(brain.targetId, 0, PLAYER_COUNT)) return null;
    if (!numList(brain.waypoints, 40, -GRID, 2 * GRID)) return null;
    p.brain = { aggression: brain.aggression, loopSize: brain.loopSize, reaction: brain.reaction, nextPlanAt: brain.nextPlanAt, mode: brain.mode as BotBrain['mode'], waypoints: brain.waypoints.slice(), targetId: brain.targetId };
  } else if (brain !== null) return null;
  Object.assign(p, { x, y, px, py, angle, target, alive, trail: trail.slice(), peak, kills, respawnAt: respawnAt === null ? Infinity : respawnAt });
  return p;
}

/** Rebuild a world from snapshot() output. Never throws; returns null for anything malformed. */
export function restoreWorld(data: unknown): World | null {
  try {
    if (!isObj(data) || data.version !== 1) return null;
    const { seed, rngState, tick, time, phase, owner, players, result } = data;
    if (!int(seed, 0, 4294967295) || !int(rngState, 0, 4294967295) || !int(tick, 0, 1e9) || !num(time, 0, 1e9)) return null;
    if (!PHASES.includes(phase as Phase) || typeof owner !== 'string' || !Array.isArray(players) || players.length !== PLAYER_COUNT) return null;
    let res: World['result'] = null;
    if (result !== null) {
      if (!isObj(result) || !REASONS.includes(result.reason as EndReason) || !int(result.by, 0, PLAYER_COUNT)) return null;
      res = { reason: result.reason as EndReason, by: result.by };
    }
    if (phase === 'over' && !res) return null;
    const { mask, playable } = buildMask();
    const grid = decodeOwner(owner, mask);
    if (!grid) return null;
    const world: World = {
      seed, rngState, tick, time, accumulator: 0, phase: phase as Phase, mask, owner: grid, playable,
      counts: new Int32Array(PLAYER_COUNT + 1), players: [], landVersion: 1, dirty: [0, 0, GRID - 1, GRID - 1], events: [], result: res
    };
    for (let i = 0; i < PLAYER_COUNT; i++) {
      const p = restorePlayer(players[i], i);
      if (!p) return null;
      world.players.push(p);
    }
    world.counts = recount(world);
    // A live match needs a live human (a dead one would never end the run); every live player holds land.
    if (phase !== 'over' && !world.players[0].alive) return null;
    if (world.players.some(p => p.alive && world.counts[p.id] === 0)) return null;
    return world;
  } catch {
    return null;
  }
}
