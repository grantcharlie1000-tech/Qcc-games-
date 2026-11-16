import { describe, expect, it } from 'vitest';
import { validState } from '../../../src/games/chess/online/friend';
import { START_FEN } from '../../../src/games/chess/rules';

const good = { t: 'state', rev: 3, startFen: START_FEN, moves: ['e2e4', 'e7e5'], outcome: null, drawOffer: null, clock: { w: 1000, b: 2000, running: 'w' }, tc: '3+2', hostColor: 'w', names: { w: 'Hana', b: 'Gus' }, rematch: null };

describe('friend game state from the host', () => {
  it('accepts a valid state', () => {
    expect(validState(good)).toMatchObject({ rev: 3, moves: ['e2e4', 'e7e5'] });
  });

  it('rejects hostile or impossible states', () => {
    expect(validState({ ...good, outcome: { result: '<img src=x onerror=alert(1)>', termination: 'checkmate' } })).toBeNull();
    expect(validState({ ...good, outcome: { result: '1-0', termination: '<b>' } })).toBeNull();
    expect(validState({ ...good, moves: ['e2e4', 'e2e4'] })).toBeNull();
    expect(validState({ ...good, moves: ['e2e4"><script>'] })).toBeNull();
    expect(validState({ ...good, drawOffer: 'x' })).toBeNull();
    expect(validState({ ...good, clock: { w: Number.NaN, b: 0, running: null } })).toBeNull();
    expect(validState({ ...good, tc: 'forever' })).toBeNull();
    expect(validState({ ...good, names: { w: 1, b: 'Gus' } })).toBeNull();
    expect(validState('state')).toBeNull();
  });
});
