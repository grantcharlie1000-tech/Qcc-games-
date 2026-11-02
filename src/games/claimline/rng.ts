import type { World } from './types';

/** One Mulberry32 step on world.rngState (the scalar generator in src/core/random.ts, with its state kept in the world so snapshots resume exactly). */
export function random(world: Pick<World, 'rngState'>): number {
  const a = (world.rngState + 0x6d2b79f5) >>> 0;
  world.rngState = a;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
