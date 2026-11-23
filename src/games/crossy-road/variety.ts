/** Which look each thing gets. The renderer asks these functions; the rules never do. Every answer is a
 * pure function of the seed, the row and a stable identity, so a replay or a restored run looks the same.
 * Collision spans do not change: every look of a vehicle or log has the length of its mover. Pure: no DOM, no Three.js. */
import type {Obstacle} from './config';

/** A 30-bit integer from three integers. */
export function mix(a: number, b: number, c = 0): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b) ^ Math.imul((c | 0) + 0x165667b1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) & 0x3fffffff;
}

// Scenery ---------------------------------------------------------------------

/** Obstacle models. `bare` and `rock` are the first of three variants. */
export const PROP = {bare: 0, stump: 3, rock: 4, pineSmall: 7, pineTall: 8, festive: 9, snowman: 10, lamp: 11, bush: 12, logPile: 13, gifts: 14, crystal: 15} as const;

const B = PROP.bare, R = PROP.rock;
/** What a tree cell and a rock cell can be. Repeats set the odds: the same mix everywhere, so nothing gathers in one place. */
const TREES: readonly number[] = [B, B, B, B, B, B, B, PROP.pineTall, PROP.pineTall, PROP.pineTall, PROP.pineTall, PROP.pineSmall, PROP.pineSmall, PROP.pineSmall,
  PROP.bush, PROP.bush, PROP.festive, PROP.snowman, PROP.lamp, PROP.crystal];
const ROCKS: readonly number[] = [R, R, R, R, R, PROP.logPile, PROP.logPile, PROP.gifts, PROP.bush, PROP.crystal];

/** The model for an obstacle. `variant` is the lane's own 0..2 (or 3 for a stump, which stays a stump). */
export function propAt(obstacle: Exclude<Obstacle, null>, variant: number, h: number): number {
  if (obstacle === 'tree' && variant === 3) return PROP.stump;
  const list = obstacle === 'tree' ? TREES : ROCKS, prop = list[h % list.length];
  return prop === B || prop === R ? prop + Math.min(2, Math.max(0, variant | 0)) : prop;
}

// Traffic ---------------------------------------------------------------------

export const CAR_MODELS = ['compact', 'mini', 'sedan', 'taxi', 'pickup', 'van', 'sports', 'police'] as const;
export type CarModel = typeof CAR_MODELS[number];
export const carLength = (model: CarModel): number => model === 'compact' || model === 'mini' ? 1.2 : 1.8;

/** Index into CAR_MODELS for a car of this length. A taxi stays a taxi. */
export function carModel(len: number, taxi: boolean, h: number): number {
  if (taxi) return 3;
  if (len < 1.5) return h % 2;
  const r = h % 100;
  return r < 4 ? 7 : r < 32 ? 2 : r < 55 ? 4 : r < 78 ? 5 : 6;
}

export const TRUCK_MODELS = ['box', 'tanker', 'logs', 'bus', 'fire', 'plough'] as const;
export type TruckModel = typeof TRUCK_MODELS[number];
export const FIRE = 4, PLOUGH = 5;

/** Index into TRUCK_MODELS. The fire engine and the snow plough are two tiles long only. */
export function truckModel(long: boolean, h: number): number {
  const r = h % 100;
  if (long) return r < 40 ? 0 : r < 62 ? 1 : r < 82 ? 2 : 3;
  return r < 32 ? 0 : r < 50 ? 1 : r < 68 ? 2 : r < 82 ? 3 : r < 91 ? FIRE : PLOUGH;
}

export const LOCOS = ['nose', 'diesel', 'steam'] as const;
export type Loco = typeof LOCOS[number];
export const WAGONS = ['carriage', 'container', 'tank', 'hopper', 'flat', 'tender'] as const;
export type Wagon = typeof WAGONS[number];

/** Index into LOCOS: a passenger train, a freight train or a steam train. */
export function trainKind(h: number): number {
  const r = h % 100;
  return r < 45 ? 0 : r < 80 ? 1 : 2;
}

/** Index into WAGONS for wagon `i` (0 is next to the locomotive). */
export function wagonAt(kind: number, i: number, h: number): number {
  if (kind === 0) return 0;
  if (kind === 2) return i === 0 ? 5 : 0;
  return [1, 1, 2, 3, 4][h % 5];
}

// Water -----------------------------------------------------------------------

/** Lily pad model 0..2: plain, in flower, or a large pad with a bud. */
export function lilyLook(h: number): number {
  return [0, 0, 1, 2][h % 4];
}
