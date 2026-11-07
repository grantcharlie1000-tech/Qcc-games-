/** Femboy Frosthop's fixed-step kinematic controller and course rules. Pure and deterministic: the same course,
 * starting state and intents always produce the same run, whatever the display refresh rate. */
import { ASSIST_SPEED, CRUMBLE, HAZARD_GRACE, MAX_FRAME, MOVE, PLAYER, RESPAWN_DELAY, STAR_RADIUS, STEP } from './config';
import type { Course, Intent, Player, Run, Snowball, Solid, Sweeper } from './types';

const EPS = 1e-6;
const HW = PLAYER.halfWidth, H = PLAYER.height;

/** Fixed-step accumulator with bounded catch-up. */
export class Stepper {
  acc = 0;
  advance(seconds: number, tick: () => void): number {
    if (!(seconds > 0)) return 0;
    this.acc += Math.min(seconds, MAX_FRAME);
    let n = 0;
    while (this.acc >= STEP - 1e-9) { this.acc -= STEP; tick(); n++; }
    return n;
  }
  get alpha(): number { return Math.max(0, Math.min(1, this.acc / STEP)); }
  reset(): void { this.acc = 0; }
}

// ---------- course geometry over time ----------

const scratch = { x: 0, y: 0, z: 0 };
/** Fraction 0..1 along a ping-pong path with eased travel and a dwell at each end. */
export function motionFraction(period: number, dwell: number, phase: number, t: number): number {
  const half = period / 2, travel = Math.max(0.01, half - dwell);
  let u = ((t + phase) % period + period) % period;
  const back = u >= half;
  if (back) u -= half;
  const k = u < dwell ? 0 : Math.min(1, (u - dwell) / travel);
  const eased = 0.5 - 0.5 * Math.cos(Math.PI * k);
  return back ? 1 - eased : eased;
}
/** Centre of a solid at motion time t. Returns a shared scratch object: copy what you need. */
export function solidOffset(s: Solid, t: number, out = scratch): { x: number; y: number; z: number } {
  if (!s.motion) { out.x = s.x; out.y = s.y + s.hy; out.z = s.z; return out; }
  const m = s.motion, f = motionFraction(m.period, m.dwell, m.phase, t);
  out.x = s.x + m.dx * f; out.y = s.y + s.hy + m.dy * f; out.z = s.z + m.dz * f;
  return out;
}
/** Note: solidOffset reports the TOP surface height in y, which is what riders care about. */

export function sweeperAngle(w: Sweeper, t: number): number { return w.phase + w.omega * t; }
const ballScratch = { x: 0, y: 0, z: 0, active: false };
/** Position of a snowball at motion time t. Returns a shared scratch object: copy what you need. */
export function snowballAt(b: Snowball, t: number, out = ballScratch): { x: number; y: number; z: number; active: boolean } {
  const cycle = b.travel + b.gap;
  const u = (((t + b.phase) % cycle) + cycle) % cycle / b.travel;
  const k = Math.min(1, u);
  out.x = b.ax + (b.bx - b.ax) * k; out.y = b.ay + (b.by - b.ay) * k; out.z = b.az + (b.bz - b.az) * k;
  out.active = u <= 1;
  return out;
}

// ---------- run state ----------

export interface RunOptions { assist?: boolean; stars?: readonly string[]; checkpoint?: number }

export function spawnPlayer(course: Course, checkpoint: number): Player {
  const cp = course.checkpoints[checkpoint];
  return { x: cp.x, y: cp.y, z: cp.z, vx: 0, vy: 0, vz: 0, ex: 0, ez: 0, grounded: true, support: cp.solid, coyote: MOVE.coyote, buffer: 0, jumpHeld: false, cut: false, facing: cp.yaw };
}

export function createRun(course: Course, options: RunOptions = {}): Run {
  const checkpoint = Math.max(0, Math.min(course.checkpoints.length - 1, Math.floor(options.checkpoint ?? 0)));
  const known = new Set(course.stars.map(s => s.id));
  return {
    steps: 0, mt: 0, assist: !!options.assist,
    player: spawnPlayer(course, checkpoint),
    checkpoint,
    crumble: course.solids.filter(s => s.surface === 'crumble').map(s => ({ id: s.id, phase: 0 as const, time: 0 })),
    dead: 0, deaths: 0, stageFails: 0, startCrossed: false,
    stars: [...new Set(options.stars ?? [])].filter(id => known.has(id)),
    events: [],
  };
}

export function isSolidActive(run: Run, s: Solid): boolean {
  if (s.surface !== 'crumble') return true;
  const c = run.crumble.find(t => t.id === s.id);
  return !c || c.phase !== 2;
}

interface Box { id: number; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; vx: number; vy: number; vz: number }

// Reused every step so the hot path allocates nothing. step() is never re-entered, so one pool is enough.
const pool: Box[] = [];
const live: Box[] = [];
const ta = { x: 0, y: 0, z: 0 }, tb = { x: 0, y: 0, z: 0 };

/** Collision boxes for the solids that can touch the player: the current, previous and next stages only. */
function boxesAt(course: Course, run: Run, t0: number, t1: number): Box[] {
  live.length = 0;
  const cp = run.checkpoint;
  for (let st = Math.max(0, cp - 1); st <= Math.min(course.byStage.length - 1, cp + 2); st++) {
    for (const id of course.byStage[st]) {
      const s = course.solids[id];
      if (!isSolidActive(run, s)) continue;
      solidOffset(s, t1, tb);
      if (s.motion) solidOffset(s, t0, ta); else { ta.x = tb.x; ta.y = tb.y; ta.z = tb.z; }
      const box = pool[live.length] ?? (pool[live.length] = { id: 0, x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0, vx: 0, vy: 0, vz: 0 });
      box.id = id; box.x0 = tb.x - s.hx; box.x1 = tb.x + s.hx; box.y0 = tb.y - 2 * s.hy; box.y1 = tb.y; box.z0 = tb.z - s.hz; box.z1 = tb.z + s.hz;
      box.vx = (tb.x - ta.x) / STEP; box.vy = (tb.y - ta.y) / STEP; box.vz = (tb.z - ta.z) / STEP;
      live.push(box);
    }
  }
  return live;
}

const overlapsXZ = (p: Player, b: Box, m = 0) => p.x + HW - m > b.x0 && p.x - HW + m < b.x1 && p.z + HW - m > b.z0 && p.z - HW + m < b.z1;
const overlaps = (p: Player, b: Box) => overlapsXZ(p, b) && p.y + H > b.y0 + EPS && p.y < b.y1 - EPS;

function approach(v: number, target: number, maxDelta: number): number {
  return v < target ? Math.min(target, v + maxDelta) : Math.max(target, v - maxDelta);
}

function kill(run: Run, cause: 'fall' | 'sweeper' | 'snowball'): void {
  run.dead = RESPAWN_DELAY;
  run.deaths++; run.stageFails++;
  run.events.push({ type: 'death', cause });
}

export function respawn(course: Course, run: Run): void {
  run.player = spawnPlayer(course, run.checkpoint);
  run.dead = 0;
  // Crumble tiles near the checkpoint are whole again so the retry is the same as the first try.
  for (const c of run.crumble) { const s = course.solids[c.id]; if (Math.abs(s.stage - (run.checkpoint + 1)) <= 1) { c.phase = 0; c.time = 0; } }
  run.events.push({ type: 'respawn' });
}

/** Advance the run by exactly one fixed step. Events from this step replace the previous step's. */
export function step(run: Run, course: Course, intent: Intent): void {
  run.events.length = 0;
  run.steps++;
  const t0 = run.mt;
  run.mt += STEP * (run.assist ? ASSIST_SPEED : 1);
  const t1 = run.mt;

  // Crumble timetable (in motion time, so assistance slows it too).
  const dtm = t1 - t0;
  for (const c of run.crumble) {
    if (c.phase === 0) continue;
    c.time += dtm;
    if (c.phase === 1 && c.time >= (run.assist ? CRUMBLE.assistWarn : CRUMBLE.warn) * (run.assist ? ASSIST_SPEED : 1)) { c.phase = 2; c.time = 0; }
    else if (c.phase === 2 && c.time >= CRUMBLE.gone) { c.phase = 0; c.time = 0; }
  }

  if (run.dead > 0) {
    run.dead -= STEP;
    if (run.dead <= EPS) respawn(course, run);
    return;
  }

  const p = run.player;
  const boxes = boxesAt(course, run, t0, t1);
  const wasGrounded = p.grounded, prevSupport = p.support;
  const prevZ = p.z;

  // 1. Carry: a grounded rider moves with the platform it stands on.
  let support: Box | undefined;
  if (p.grounded) for (const b of boxes) if (b.id === p.support) { support = b; break; }
  if (p.grounded && !support) p.grounded = false;
  if (support) {
    p.x += support.vx * STEP; p.z += support.vz * STEP;
    if (support.vy !== 0) p.y = support.y1;
  }
  const solid = support ? course.solids[support.id] : undefined;
  if (solid?.belt) { p.x += solid.belt.x * STEP; p.z += solid.belt.z * STEP; }

  // 2. Horizontal control, normalised so diagonals are not faster.
  let mx = intent.mx, mz = intent.mz;
  const mag = Math.hypot(mx, mz);
  if (mag > 1) { mx /= mag; mz /= mag; }
  const accel = !p.grounded ? MOVE.airAccel : solid?.surface === 'ice' ? MOVE.iceAccel : MOVE.groundAccel;
  const tx = mx * MOVE.speed, tz = mz * MOVE.speed;
  const dvx = tx - p.vx, dvz = tz - p.vz, dv = Math.hypot(dvx, dvz), maxDv = accel * STEP;
  if (dv <= maxDv) { p.vx = tx; p.vz = tz; } else { p.vx += dvx / dv * maxDv; p.vz += dvz / dv * maxDv; }
  if (Math.hypot(mx, mz) > 0.15) p.facing = Math.atan2(-mx, -mz);

  // 3. Jump: buffered press, coyote window, one inheritance of platform velocity.
  let tookOff = false;
  const pressed = intent.jump && !p.jumpHeld;
  p.jumpHeld = intent.jump;
  if (pressed) p.buffer = MOVE.buffer;
  else p.buffer = Math.max(0, p.buffer - STEP);
  p.coyote = p.grounded ? MOVE.coyote : Math.max(0, p.coyote - STEP);
  if (p.buffer > 0 && p.coyote > 0 && p.vy <= EPS) {
    p.vy = MOVE.jump;
    if (support) { p.ex = support.vx; p.ez = support.vz; }
    p.grounded = false; p.coyote = 0; p.buffer = 0; tookOff = true;
    run.events.push({ type: 'jump' });
    p.cut = true;
  } else if (p.cut && !intent.jump && p.vy > 0) {
    p.vy *= MOVE.jumpCut; p.cut = false;
  }

  // 4. Gravity.
  if (!p.grounded) p.vy = Math.max(-MOVE.fallLimit, p.vy - MOVE.gravity * STEP);
  else p.vy = 0;

  // 5. Swept movement in bounded substeps, resolving one axis at a time.
  // The carry above already moved the rider with the platform this step; inherited velocity applies from the next.
  const ex = tookOff ? 0 : p.ex, ez = tookOff ? 0 : p.ez;
  const dx = (p.vx + ex) * STEP, dy = p.vy * STEP, dz = (p.vz + ez) * STEP;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.15));
  let landed: Box | undefined;
  for (let i = 0; i < n; i++) {
    moveAxis(p, boxes, 'x', dx / n, wasGrounded);
    moveAxis(p, boxes, 'z', dz / n, wasGrounded);
    const hit = moveY(p, boxes, dy / n);
    if (hit === 'ceiling') break;
    if (hit) { landed = hit; break; }
  }
  depenetrate(p, boxes);

  // 6. Ground probe.
  if (!landed && p.vy <= EPS) {
    let best: Box | undefined;
    for (const b of boxes) if (overlapsXZ(p, b) && p.y <= b.y1 + 0.02 && p.y >= b.y1 - 0.06 && (!best || b.y1 > best.y1)) best = b;
    landed = best;
  }
  if (landed) {
    p.y = landed.y1; p.vy = 0; p.grounded = true; p.support = landed.id; p.ex = 0; p.ez = 0; p.cut = false;
    const s = course.solids[landed.id];
    if (!wasGrounded) run.events.push({ type: 'land', surface: s.surface });
    if (!wasGrounded || prevSupport !== landed.id) {
      if (s.surface === 'spring') {
        p.vy = MOVE.spring; p.grounded = false; p.coyote = 0; p.buffer = 0; p.ex = 0; p.ez = 0;
        run.events.push({ type: 'spring' });
      }
    }
    if (s.surface === 'crumble') {
      const c = run.crumble.find(t => t.id === s.id);
      if (c && c.phase === 0) { c.phase = 1; c.time = 0; run.events.push({ type: 'crumble', id: s.id }); }
    }
    if (p.grounded && s.surface === 'checkpoint') {
      const cp = course.checkpoints[run.checkpoint + 1];
      if (cp && cp.solid === s.id) { run.checkpoint++; run.stageFails = 0; run.events.push({ type: 'checkpoint', index: run.checkpoint }); }
    }
  } else p.grounded = false;

  // 7. Start line (forward crossing within the plaza width), stars, hazards and the fail plane.
  const line = course.startLine;
  if (!run.startCrossed && prevZ > line.z && p.z <= line.z && p.x >= line.x0 && p.x <= line.x1) {
    run.startCrossed = true;
    run.events.push({ type: 'start-line' });
  }
  for (const star of course.stars) {
    if (Math.abs(star.stage - (run.checkpoint + 1)) > 1 || run.stars.includes(star.id)) continue;
    if (boxSphere(p, star.x, star.y, star.z, STAR_RADIUS)) { run.stars.push(star.id); run.events.push({ type: 'star', id: star.id, stage: star.stage }); }
  }
  for (const w of course.sweepers) {
    if (Math.abs(w.stage - (run.checkpoint + 1)) > 1) continue;
    if (sweeperHits(w, t1, p)) { kill(run, 'sweeper'); return; }
  }
  for (const b of course.snowballs) {
    if (Math.abs(b.stage - (run.checkpoint + 1)) > 1) continue;
    const at = snowballAt(b, t1);
    if (at.active && boxSphere(p, at.x, at.y, at.z, b.radius * HAZARD_GRACE)) { kill(run, 'snowball'); return; }
  }
  if (p.y < course.killY[run.checkpoint]) kill(run, 'fall');
}

function moveAxis(p: Player, boxes: Box[], axis: 'x' | 'z', d: number, wasGrounded: boolean): void {
  if (d === 0) return;
  p[axis] += d;
  for (const b of boxes) {
    if (!overlaps(p, b)) continue;
    // Step up onto low ledges while walking.
    const rise = b.y1 - p.y;
    if (wasGrounded && rise > 0 && rise <= MOVE.stepUp && !boxes.some(o => o !== b && overlapsXZ(p, o) && o.y0 < b.y1 + H && o.y1 > b.y1 + EPS)) { p.y = b.y1; continue; }
    if (axis === 'x') p.x = d > 0 ? b.x0 - HW - EPS : b.x1 + HW + EPS;
    else p.z = d > 0 ? b.z0 - HW - EPS : b.z1 + HW + EPS;
    if (axis === 'x') p.vx = 0; else p.vz = 0;
  }
}

function moveY(p: Player, boxes: Box[], d: number): Box | 'ceiling' | undefined {
  if (d === 0) return undefined;
  p.y += d;
  let hit: Box | undefined;
  for (const b of boxes) {
    if (!overlaps(p, b)) continue;
    if (d < 0) { if (!hit || b.y1 > hit.y1) hit = b; }
    else { p.y = b.y0 - H - EPS; p.vy = 0; return 'ceiling'; }
  }
  if (hit) { p.y = hit.y1; return hit; }
  return undefined;
}

/** A platform that moved into the player pushes them out along the shallowest axis. */
function depenetrate(p: Player, boxes: Box[]): void {
  for (const b of boxes) {
    if (!overlaps(p, b)) continue;
    // Push out along the shallowest of the five directions (no upward push through a ceiling).
    let axis: 'x' | 'y' | 'z' = 'y', value = b.y1, depth = Math.abs(b.y1 - p.y);
    const consider = (a: 'x' | 'z', v: number, d: number) => { if (d < depth) { axis = a; value = v; depth = d; } };
    consider('x', b.x0 - HW - EPS, Math.abs(p.x + HW - b.x0));
    consider('x', b.x1 + HW + EPS, Math.abs(b.x1 - (p.x - HW)));
    consider('z', b.z0 - HW - EPS, Math.abs(p.z + HW - b.z0));
    consider('z', b.z1 + HW + EPS, Math.abs(b.z1 - (p.z - HW)));
    p[axis] = value;
  }
}

function boxSphere(p: Player, x: number, y: number, z: number, r: number): boolean {
  const cx = Math.max(p.x - HW, Math.min(x, p.x + HW)), cy = Math.max(p.y, Math.min(y, p.y + H)), cz = Math.max(p.z - HW, Math.min(z, p.z + HW));
  return (cx - x) ** 2 + (cy - y) ** 2 + (cz - z) ** 2 < r * r;
}

export function sweeperHits(w: Sweeper, t: number, p: Player): boolean {
  if (w.y + w.radius < p.y || w.y - w.radius > p.y + H) return false;
  const a = sweeperAngle(w, t);
  // Arm direction: +x at angle 0, turning towards -z as the angle grows.
  const ux = Math.cos(a), uz = -Math.sin(a);
  const reach = w.radius * HAZARD_GRACE + HW * HAZARD_GRACE;
  for (let arm = 0; arm < w.arms; arm++) {
    const sx = arm ? -ux : ux, sz = arm ? -uz : uz;
    const rx = p.x - w.x, rz = p.z - w.z;
    const k = Math.max(0, Math.min(w.length, rx * sx + rz * sz));
    const qx = w.x + sx * k, qz = w.z + sz * k;
    if (Math.hypot(p.x - qx, p.z - qz) < reach) return true;
  }
  return false;
}

export function cloneRun(run: Run): Run {
  return { ...run, player: { ...run.player }, crumble: run.crumble.map(c => ({ ...c })), stars: [...run.stars], events: [] };
}
