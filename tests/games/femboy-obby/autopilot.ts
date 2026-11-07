/** Test-only autopilot: plays a stage through the real simulation with ordinary intents (move direction + jump).
 * Before each hop it rehearses the hop on a cloned run and only commits when the rehearsal lands, so it waits
 * for moving platforms and hazards the way a careful player does. It never edits the run's state. */
import { blinkState, cloneRun, createRun, isSolidActive, solidOffset, step, sweeperAngle } from '../../../src/games/femboy-obby/sim';
import { PLAYER } from '../../../src/games/femboy-obby/config';
import type { Course, Intent, Run } from '../../../src/games/femboy-obby/types';

const IDLE: Intent = { mx: 0, mz: 0, jump: false };

interface Target { ids: number[]; final: number }

function topBox(course: Course, run: Run, id: number) {
  const s = course.solids[id], o = solidOffset(s, run.mt);
  return { x0: o.x - s.hx, x1: o.x + s.hx, z0: o.z - s.hz, z1: o.z + s.hz, top: o.y, active: isSolidActive(run, s) };
}

/** Steer toward the nearest comfortable point of the target's top; jump at edges and in front of higher landings. */
export type Mode = 'walk' | 'hop';

/** Steer toward the target; 'hop' also jumps whenever grounded (for low sweeper arms). */
export function policy(course: Course, run: Run, targetId: number, mode: Mode = 'walk'): Intent {
  const p = run.player, b = topBox(course, run, targetId);
  const m = (lo: number, hi: number) => Math.min(0.9, Math.max(0.05, (hi - lo) / 2 - 0.05));
  const mx = m(b.x0, b.x1), mz = m(b.z0, b.z1);
  const ax = Math.max(b.x0 + mx, Math.min(p.x, b.x1 - mx)), az = Math.max(b.z0 + mz, Math.min(p.z, b.z1 - mz));
  let dx = ax - p.x, dz = az - p.z;
  const d = Math.hypot(dx, dz);
  if (d > 1e-6) { dx /= d; dz /= d; }
  const speed = d < 0.15 ? 0 : 1;
  // On a belt, lean against it so the belt doesn't carry you off the side.
  const under = p.grounded ? course.solids[p.support] : undefined;
  if (under?.belt && speed > 0) {
    dx -= under.belt.x / 6; dz -= under.belt.z / 6;
    const n = Math.hypot(dx, dz); dx /= n; dz /= n;
  }
  if (!p.grounded) return { mx: dx * speed, mz: dz * speed, jump: p.vy > 0 };
  // Is there ground just ahead?
  const fx = p.x + dx * 0.55, fz = p.z + dz * 0.55;
  const kx = p.x + dx * 0.85, kz = p.z + dz * 0.85;
  let ground = false, spike = false;
  for (const id of course.byStage.flat()) {
    const o = topBox(course, run, id), s = course.solids[id];
    const inside = (m: number) => fx > o.x0 - m && fx < o.x1 + m && fz > o.z0 - m && fz < o.z1 + m;
    // A kill brick just ahead at foot height counts as a gap: jump it.
    if (s.surface === 'spike') {
      if (kx > o.x0 - 0.05 && kx < o.x1 + 0.05 && kz > o.z0 - 0.05 && kz < o.z1 + 0.05 && o.top > p.y + 0.05 && o.top - 2 * s.hy < p.y + 0.5) spike = true;
      continue;
    }
    if (!o.active) continue;
    if (inside(0.25) && o.top <= p.y + 0.36 && o.top >= p.y - 0.6) ground = true;
  }
  if (spike) ground = false;
  const edge = Math.max(b.x0 - (p.x + PLAYER.halfWidth), p.x - PLAYER.halfWidth - b.x1, b.z0 - (p.z + PLAYER.halfWidth), p.z - PLAYER.halfWidth - b.z1, 0);
  const higher = b.top > p.y + 0.36 && edge < 1.4;
  // Jump a low (jump-rope) sweeper arm just before it reaches you, as a player would; 'hop' mode hops throughout.
  const rope = course.sweepers.some(w => {
    if (w.floor === undefined || w.y - w.floor > 0.6 || Math.abs(w.floor - p.y) > 0.05 || Math.hypot(p.x - w.x, p.z - w.z) > w.length + 1.2) return false;
    if (mode === 'hop') return true;
    const phi = Math.atan2(-(p.z - w.z), p.x - w.x), a = sweeperAngle(w, run.mt);
    for (let k = 0; k < w.arms; k++) {
      const arm = a + (2 * Math.PI * k) / w.arms;
      let gap = Math.sign(w.omega) * (phi - arm);
      gap = ((gap % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      // Leave the floor about 0.11 s before the arm's near edge arrives (it takes ~0.09 s to rise clear).
      const half = 0.8 / Math.max(0.8, Math.hypot(p.x - w.x, p.z - w.z));
      if ((gap - half) / Math.abs(w.omega) < 0.13) return true;
    }
    return false;
  });
  return { mx: dx * speed, mz: dz * speed, jump: (!ground && speed > 0) || higher || (rope && speed > 0) };
}

/** Landed on the target, and (for a fairy-light panel) with time left to plan the next hop. */
function landedOn(run: Run, target: Target, course: Course, stage: number): boolean {
  if (run.checkpoint >= stage) return true;
  if (!run.player.grounded || run.player.support !== target.final) return false;
  const s = course.solids[target.final];
  return !s.blink || blinkState(s, run.mt + 0.9) !== 'dark';
}

/** Rehearse following the target chain from this state. */
function rehearse(course: Course, run: Run, target: Target, stage: number, horizon: number, mode: Mode): boolean {
  const r = cloneRun(run);
  let k = -1;
  for (let i = 0; i < horizon; i++) {
    k = Math.max(k, target.ids.indexOf(r.player.support)); // last surface touched, even a spring
    step(r, course, policy(course, r, target.ids[Math.min(k + 1, target.ids.length - 1)], mode));
    if (r.deaths > run.deaths) return false;
    if (landedOn(r, target, course, stage)) {
      // A careful player only commits to a landing they can stand on for a moment.
      if (r.checkpoint >= stage) return true;
      for (let j = 0; j < 30; j++) step(r, course, IDLE);
      return r.deaths === run.deaths;
    }
  }
  return false;
}

export interface StageResult { ok: boolean; seconds: number; deaths: number; stuckAt?: number }

export function playStage(course: Course, stage: number, opts: { assist?: boolean; limit?: number; run?: Run } = {}): StageResult {
  const info = course.stages[stage - 1];
  const run = opts.run ?? createRun(course, { checkpoint: stage - 1, assist: opts.assist });
  const route = info.route;
  const limit = (opts.limit ?? 120) * 60;
  let k = -1, going: Target | null = null, goK = -1, mode: Mode = 'walk';
  for (let i = 0; i < limit; i++) {
    if (run.checkpoint >= stage) return { ok: true, seconds: i / 60, deaths: run.deaths };
    if (run.dead > 0) { step(run, course, IDLE); going = null; k = -1; continue; }
    if (run.player.grounded) {
      const at = route.findIndex(r => r.id === run.player.support);
      if (at > k || (at >= 0 && going === null)) k = at;
    }
    if (going) {
      if (run.player.grounded && run.player.support === going.final) { going = null; continue; }
      goK = Math.max(goK, going.ids.indexOf(run.player.support));
      const before = run.deaths;
      step(run, course, policy(course, run, going.ids[Math.min(goK + 1, going.ids.length - 1)], mode));
      if (run.deaths > before) going = null;
      continue;
    }
    // Plan the next hop (through pass-through solids to the next safe one).
    let j = k + 1;
    const ids: number[] = [];
    while (j < route.length) { ids.push(route[j].id); if (!route[j].through) break; j++; }
    if (!ids.length) { step(run, course, IDLE); continue; }
    const target = { ids, final: ids[ids.length - 1] };
    const found = (['walk', 'hop'] as const).find(m => rehearse(course, run, target, stage, 8 * 60, m));
    if (found) { going = target; goK = -1; mode = found; continue; }
    step(run, course, IDLE);
  }
  return { ok: false, seconds: limit / 60, deaths: run.deaths, stuckAt: k };
}
