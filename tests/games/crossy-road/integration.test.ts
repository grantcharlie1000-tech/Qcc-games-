import {describe, expect, it} from 'vitest';
import {games} from '../../../src/core/catalog';
import {entryFromHash, entryHash} from '../../../src/core/navigation';
import {GAME_IDS} from '../../../src/core/types';
import {scoredGame} from '../../../src/leaderboard/shared';

describe('Crossy Road shell registration', () => {
  it('opens through its catalogue route without changing existing public entries', () => {
    expect(GAME_IDS).toContain('crossy-road');
    expect(games.find(game => game.id === 'crossy-road')).toMatchObject({title: 'Crossy Road'});
    expect(entryFromHash('#/game/crossy-road')).toBe('crossy-road');
    expect(entryFromHash('#/collection/23')).toBe('crossy-road');
    expect(entryHash('claimline')).toBe('#/collection/22');
  });

  it('uses the shared score queue and rankings service', () => {
    expect(scoredGame('crossy-road')).toBe(true);
  });
});
