import { createWorld, placePlayer, step } from '../../../src/games/claimline/model';
import { CENTER, GRID, type GameEvent, type World } from '../../../src/games/claimline/types';

/** An empty running arena: nobody owns land, every player is down, bots never respawn. */
export function scene(): World {
  const world = createWorld(7, { spawn: false });
  world.phase = 'running';
  return world;
}

/** Place a player on a disc of land and keep bots from thinking (tests steer them by hand). */
export function put(world: World, id: number, x: number, y: number, angle = 0, r = 3, orbit = false): void {
  placePlayer(world, id, x, y, angle, r);
  const brain = world.players[id - 1].brain;
  if (brain) brain.nextPlanAt = Infinity;
  if (orbit) {
    const set = orbiting.get(world) ?? new Set<number>();
    set.add(id);
    orbiting.set(world, set);
  }
}

const orbiting = new WeakMap<World, Set<number>>();

/** One step; players placed with orbit=true turn at full rate so they circle inside a big disc of their own land. */
export function tick(world: World, dt?: number): void {
  for (const id of orbiting.get(world) ?? []) { const p = world.players[id - 1]; p.target = p.angle + 1; }
  step(world, dt);
}

export function drain(world: World): GameEvent[] {
  const events = world.events;
  world.events = [];
  return events;
}

export const at = (cx: number, cy: number): number => cy * GRID + cx;

/**
 * Steer a player through waypoints with normal steps until it has left land and come home (when stopAtHome),
 * or every waypoint has been passed. Returns the number of steps taken.
 */
export function follow(world: World, id: number, points: [number, number][], stopAtHome = true, popR = 2): number {
  const p = world.players[id - 1];
  let steps = 0, left = false;
  for (const [wx, wy] of points) {
    for (let n = 0; n < 3000 && p.alive; n++) {
      if (Math.hypot(wx - p.x, wy - p.y) < popR) break;
      p.target = Math.atan2(wy - p.y, wx - p.x);
      tick(world);
      steps++;
      if (p.trail.length) left = true;
      if (stopAtHome && left && !p.trail.length) return steps;
    }
  }
  return steps;
}

export const centre = (dx: number, dy: number): [number, number] => [CENTER + dx, CENTER + dy];

/** Cells within r of (x, y) whose centres are playable. */
export function discCells(x: number, y: number, r: number): number[] {
  const out: number[] = [];
  for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy++) for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
    if ((cx + 0.5 - x) ** 2 + (cy + 0.5 - y) ** 2 <= r * r) out.push(cy * GRID + cx);
  }
  return out;
}
