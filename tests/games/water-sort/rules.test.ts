import { describe, expect, it } from 'vitest';
import { pour, won, topRun } from '../../../src/games/water-sort/rules';

describe('Water Sort pours', () => {
  it('pours the contiguous top run, leaving lower colours untouched', () => {
    const board = [[0, 1, 1], [1], []];
    expect(pour(board, 0, 1)).toEqual({ board: [[0], [1, 1, 1], []], from: 0, to: 1, colour: 1, amount: 2 });
    expect(board).toEqual([[0, 1, 1], [1], []]);
    expect(topRun([0, 1, 0, 0])).toBe(2);
  });
  it('caps the transfer by destination capacity without overflowing', () => {
    expect(pour([[0, 1, 1, 1], [1, 1, 1], []], 0, 1)?.board).toEqual([[0, 1, 1], [1, 1, 1, 1], []]);
  });
  it.each([
    [[[0], [1], []], 0, 1],
    [[[0], [0, 0, 0, 0], []], 0, 1],
    [[[], [0], []], 0, 1],
    [[[0], [], []], 0, 0],
    [[[0], [], []], -1, 1],
    [[[0], [], []], 0, 9],
    [[[0], [], []], 0.5, 1],
  ] as const)('rejects illegal pour %#', (board, from, to) => {
    expect(pour(board, from, to)).toBeNull();
  });
  it('wins only when each colour is gathered into its own single tube', () => {
    expect(won([[0, 0, 0, 0], [], [1, 1, 1, 1]])).toBe(true);
    expect(won([[0, 0], [0, 0], [1, 1, 1, 1], []])).toBe(false);
    expect(won([[0, 0], [0, 0], []])).toBe(false);
    expect(won([[0, 0, 0], [1, 1, 1, 1], [0]])).toBe(false);
    expect(won([[0, 0, 0, 1], [], [1, 1, 1, 0]])).toBe(false);
    expect(won([[], []])).toBe(false);
  });
});
