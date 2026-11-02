import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaderboardSync } from '../../../src/leaderboard/client';
import { formatScore } from '../../../src/leaderboard/format';
import { SCORED_GAMES, scoredGame } from '../../../src/leaderboard/shared';
import { createWorld, placePlayer, setOwner, start, step } from '../../../src/games/claimline/model';
import { basisPoints, formatShare, leaderboardScore } from '../../../src/games/claimline/score';
import { HUMAN } from '../../../src/games/claimline/types';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const memory = () => {
  const map = new Map<string, unknown>([['accounts:session', { token: 'acct_' + 'a'.repeat(64), username: 'Ada' }]]);
  return {
    read: <T,>(key: string, fallback: T) => (map.get(key) ?? fallback) as T,
    write: (key: string, value: unknown) => { map.set(key, structuredClone(value)); return true; }
  };
};

describe('score', () => {
  it('basisPoints floors the share and tolerates a degenerate arena; formatShare prints two decimals', () => {
    expect(basisPoints(0, 100)).toBe(0);
    expect(basisPoints(1, 3)).toBe(3333);
    expect(basisPoints(2, 3)).toBe(6666);
    expect(basisPoints(7, 100)).toBe(700); // float noise must not lose a basis point
    expect(basisPoints(10, 0)).toBe(0);
    expect(basisPoints(5, -3)).toBe(0);
    expect(formatShare(1234)).toBe('12.34%');
    expect(formatShare(0)).toBe('0.00%');
    expect(formatShare(10000)).toBe('100.00%');
  });

  it('[12a] leaderboard: only the human peak is ever reported, bots never leak in, and the peak survives a fall', () => {
    const world = createWorld(11);
    start(world);
    expect(leaderboardScore(world)).toBe(world.players[0].peak);
    // Give a bot a far larger share than the human.
    let given = 0;
    for (let i = 0; i < world.owner.length && given < 4000; i++) if (world.mask[i] && world.owner[i] === 0) { setOwner(world, i, 2); given++; }
    for (let i = 0; i < 5; i++) step(world);
    expect(world.players[1].peak).toBeGreaterThan(world.players[0].peak);
    expect(leaderboardScore(world)).toBe(world.players[0].peak);
    expect(leaderboardScore(world)).toBeLessThan(world.players[1].peak);
    // The human grows, then falls: the peak stays.
    const human = world.players[0];
    placePlayer(world, HUMAN, human.x, human.y, human.angle, 9);
    const high = basisPoints(world.counts[HUMAN], world.playable);
    for (let i = 0; i < world.owner.length; i++) if (world.owner[i] === HUMAN && i % 2 === 0) setOwner(world, i, 3);
    for (let i = 0; i < 3; i++) step(world);
    expect(basisPoints(world.counts[HUMAN], world.playable)).toBeLessThan(high);
    expect(leaderboardScore(world)).toBeGreaterThanOrEqual(high);
    expect(leaderboardScore(world)).toBe(world.players[0].peak);
    // Invalid input never produces a score.
    expect(leaderboardScore({ players: [] })).toBe(0);
    expect(leaderboardScore({ players: [{ ...world.players[1] }] })).toBe(0);
    expect(leaderboardScore({ players: [{ ...world.players[0], peak: NaN }] })).toBe(0);
    expect(leaderboardScore({ players: [{ ...world.players[0], peak: -5 }] })).toBe(0);
    expect(leaderboardScore({ players: [{ ...world.players[0], isBot: true }] })).toBe(0);
  });

  it('[12b] shared leaderboard: Claimline is a scored game, formats as a share and submits only the human peak', async () => {
    expect(formatScore('claimline', 1234)).toBe('12.34%');
    expect(formatScore('claimline', 5)).toBe('0.05%');
    expect(scoredGame('claimline')).toBe(true);
    expect(SCORED_GAMES).toContain('claimline');
    // A real match: bots hold far more land than the human, yet only the human's peak is ever queued.
    const world = createWorld(31, { spawn: false });
    start(world);
    placePlayer(world, HUMAN, 40, 40, 0, 5);
    placePlayer(world, 2, 80, 80, 0, 12);
    const score = leaderboardScore(world);
    expect(score).toBe(world.players[0].peak);
    expect(score).toBeLessThan(basisPoints(world.counts[2], world.playable));
    const storage = memory(), bodies: unknown[] = [];
    const fetcher = vi.fn(async (_url: unknown, options: RequestInit) => { bodies.push(JSON.parse(String(options.body))); return Response.json({ entries: [], player: null }); });
    const sync = new LeaderboardSync(storage, fetcher as unknown as typeof fetch);
    sync.queue('claimline', score);
    await sync.flush();
    expect(bodies).toEqual([{ game: 'claimline', score, name: 'Ada' }]);
    expect(JSON.stringify(bodies)).not.toMatch(/Moss|Juno|Pip|Rook|Tansy|Bram/);
    expect(storage.read('leaderboard:pending:account:ada', {})).toEqual({});
    expect(storage.read('leaderboard:sent:account:ada', {})).toEqual({ claimline: score });
    sync.dispose();
  });
});
