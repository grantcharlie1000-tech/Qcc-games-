import { HUMAN, type World } from './types';

/** Territory share in basis points (hundredths of a percent), rounded down; 0 for a degenerate arena. */
export const basisPoints = (owned: number, playable: number): number =>
  playable > 0 ? Math.floor((10000 * owned) / playable + 1e-9) : 0;

/** 1234 -> "12.34%". */
export const formatShare = (bp: number): string => (bp / 100).toFixed(2) + '%';

/** The ONLY value the game reports to context.setScore / the leaderboard: the human's peak share in basis points. */
export function leaderboardScore(world: Pick<World, 'players'>): number {
  const human = world.players[0];
  if (!human || human.id !== HUMAN || human.isBot || !Number.isFinite(human.peak)) return 0;
  return Math.max(0, Math.floor(human.peak));
}
