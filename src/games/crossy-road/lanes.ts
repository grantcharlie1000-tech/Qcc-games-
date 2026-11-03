/** Hazards as pure functions of time. Every vehicle, log and train position is computed from a
 * lane's parameters and the world time `t`, so a run can be replayed, saved and tested at any t
 * without simulating. Pure: no DOM and no Three.js, and nothing allocates unless the caller asks. */
import {
  BAND_MAX, BAND_MIN, START_COL, PLATFORM_GRACE, PLAYER_HALF, RENDER_X_MAX, RENDER_X_MIN, VEHICLE_INSET, WARN_LEAD, WARN_TAIL,
  type Lane, type LilyLane, type Mover, type MovingLane, type RailLane, type RiverLane, type RoadLane,
} from './config';

import {lilyAt} from './terrain';

/** Euclidean modulo: the result is in [0, m). */
export const mod = (v: number, m: number): number => ((v % m) + m) % m;

/** Left edge, inside [0, cycle), of one copy of a mover at time t. Copies repeat every `cycle` tiles. */
export function moverBase(lane: MovingLane, mover: Mover, t: number): number {
  return mod(lane.phase + mover.offset + lane.dir * lane.speed * t, lane.cycle);
}

/** Calls `fn(x0, x1, mover, index)` for every copy of every mover whose span [x0, x1] meets
 * [xMin, xMax] at time t. Movers translate rigidly, so spans never overlap. */
export function forEachMover(lane: MovingLane, t: number, xMin: number, xMax: number, fn: (x0: number, x1: number, mover: Mover, index: number) => void): void {
  for (let i = 0; i < lane.movers.length; i++) {
    const mover = lane.movers[i], base = moverBase(lane, mover, t);
    for (let x0 = base + Math.ceil((xMin - mover.len - base) / lane.cycle) * lane.cycle; x0 <= xMax; x0 += lane.cycle) fn(x0, x0 + mover.len, mover, i);
  }
}

/** D1: does a vehicle's hitbox (its span minus VEHICLE_INSET per end) overlap the player's
 * [x − PLAYER_HALF, x + PLAYER_HALF] at time t? Touching edges do not count. */
export function vehicleHit(lane: RoadLane, x: number, t: number): boolean {
  const lo = x - PLAYER_HALF, hi = x + PLAYER_HALF;
  for (const mover of lane.movers) {
    const base = moverBase(lane, mover, t);
    for (let x0 = base + Math.ceil((lo - mover.len - base) / lane.cycle) * lane.cycle; x0 < hi; x0 += lane.cycle)
      if (x0 + VEHICLE_INSET < hi && x0 + mover.len - VEHICLE_INSET > lo) return true;
  }
  return false;
}

/** D3/D4: is there a log (its span widened by PLATFORM_GRACE per end) or a lily pad under centre x at time t? */
export function platformAt(lane: RiverLane | LilyLane, x: number, t: number): boolean {
  if (lane.kind === 'lily') {
    const c = Math.round(x);
    return lilyAt(lane, c);
  }
  for (const mover of lane.movers) {
    const base = moverBase(lane, mover, t);
    for (let x0 = base + Math.ceil((x - PLATFORM_GRACE - mover.len - base) / lane.cycle) * lane.cycle; x0 <= x + PLATFORM_GRACE; x0 += lane.cycle)
      if (x >= x0 - PLATFORM_GRACE && x <= x0 + mover.len + PLATFORM_GRACE) return true;
  }
  return false;
}

/** How fast a lane carries a player standing on it (tiles/s, +x is right). Only logs move. */
export function laneVelocity(lane: Lane): number {
  return lane.kind === 'river' ? lane.dir * lane.speed : 0;
}

/** Entry time of the train pass whose warning has most recently started at time t: the moment its
 * front reaches the near band edge (x = −0.5 heading right, x = 8.5 heading left). Passes are
 * `phase + k·period`; at any t the current pass satisfies entry − WARN_LEAD ≤ t < entry − WARN_LEAD + period. */
export function trainEntry(lane: RailLane, t: number, x = START_COL): number {
  const phase = lane.phase + lane.dir * (x - START_COL) / lane.speed;
  return phase + Math.floor((t - phase + WARN_LEAD) / lane.period) * lane.period;
}

/** Seconds from the train's front entering the band until its back leaves it. */
export function trainClear(lane: RailLane): number {
  return (BAND_MAX - BAND_MIN + lane.length) / lane.speed;
}

/** The current train's span at time t, or null when it is entirely outside the render span.
 * Pass `out` to avoid allocating. Generation guarantees period ≥ WARN_LEAD + trainClear + quiet time,
 * so the previous pass is always far off screen. */
export function trainSpan(lane: RailLane, t: number, out: { x0: number; x1: number } = { x0: 0, x1: 0 }): { x0: number; x1: number } | null {
  const u = t - trainEntry(lane, t), front = (lane.dir > 0 ? BAND_MIN : BAND_MAX) + lane.dir * lane.speed * u;
  out.x0 = lane.dir > 0 ? front - lane.length : front;
  out.x1 = out.x0 + lane.length;
  return out.x1 < RENDER_X_MIN || out.x0 > RENDER_X_MAX ? null : out;
}

/** Every train copy intersecting the visible horizontal window. Period and speed
 * define its spatial spacing, so panning never teleports a train. */
export function forEachTrain(lane: RailLane, t: number, xMin: number, xMax: number, fn: (x0:number,x1:number)=>void): void {
  const cycle=lane.speed*lane.period;
  const front=(lane.dir>0?BAND_MIN:BAND_MAX)+lane.dir*lane.speed*(t-lane.phase);
  const base=mod(lane.dir>0?front-lane.length:front,cycle);
  for(let x0=base+Math.ceil((xMin-lane.length-base)/cycle)*cycle;x0<=xMax;x0+=cycle)fn(x0,x0+lane.length);
}

/** Train collisions use the same periodic world coordinates as rendering. */
export function trainHit(lane: RailLane, x: number, t: number): boolean {
  const cycle=lane.speed*lane.period;
  const front=(lane.dir>0?BAND_MIN:BAND_MAX)+lane.dir*lane.speed*(t-lane.phase);
  const base=mod(lane.dir>0?front-lane.length:front,cycle), lo=x-PLAYER_HALF, hi=x+PLAYER_HALF;
  for(let x0=base+Math.ceil((lo-lane.length-base)/cycle)*cycle;x0<hi;x0+=cycle)
    if(x0+VEHICLE_INSET<hi && x0+lane.length-VEHICLE_INSET>lo)return true;
  return false;
}

/** F5: the signal flashes from WARN_LEAD seconds before the front enters the band until WARN_TAIL
 * seconds after the back has left it. */
export function railWarning(lane: RailLane, t: number, x = START_COL): boolean {
  const u = t - trainEntry(lane, t, x);
  return u >= -WARN_LEAD && u <= trainClear(lane) + WARN_TAIL;
}
