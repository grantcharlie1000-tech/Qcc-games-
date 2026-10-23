import { describe, expect, it, vi } from 'vitest';
import * as rules from '../../../src/games/water-sort/rules';
import { LEVELS, constructLevel } from '../../../src/games/water-sort/levels';
import { solve } from '../../../src/games/water-sort/solver';
import { boardKey, cloneBoard, pour, won } from '../../../src/games/water-sort/rules';

import { independentSolve } from './independent-solver';

describe('soluble level construction and search', () => {
  it('stops generating children once the queued-state budget is full', () => {
    const expansions = vi.spyOn(rules, 'legalPours');
    try {
      expect(solve([[0,1],[1],[0],[]], 1)).toBeNull();
      expect(expansions).not.toHaveBeenCalled();
      expect(solve([[0],[1],[]], 1)).toEqual([]);
      expect(solve([[0],[1],[]], 0)).toBeNull();
    } finally { expansions.mockRestore(); }
  });
  it('constructs deterministic full-volume mixed boards without mutation', () => {
    const a = constructLevel(4, 29, 5), b = constructLevel(4, 29, 5);
    expect(a).toEqual(b);
    expect(a.board).toHaveLength(6);
    expect(a.board.filter(t => t.length === 4)).toHaveLength(4);
    expect(a.board.flat().sort()).toEqual([0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3]);
    expect(won(a.board)).toBe(false);
    let state = cloneBoard(a.board);
    for (const [from, to] of a.witness) {
      const result = pour(state, from, to);
      expect(result).not.toBeNull();
      state = result!.board;
    }
    expect(won(state)).toBe(true);
  });
  it('ships 77 distinct levels with all three difficulty tiers', () => {
    expect(LEVELS).toHaveLength(77);
    expect(new Set(LEVELS.map(l => boardKey(l.board))).size).toBe(77);
    expect(new Set(LEVELS.map(l => l.difficulty)).size).toBe(3);
  });
  it.each(Array.from({length:LEVELS.length}, (_, i) => i))('independently BFS verifies shipped level %i and its reverse witness', index => {
    const level = LEVELS[index];
    expect(level).toBeDefined();
    const plan = independentSolve(level.board);
    expect(plan?.length).toBeGreaterThan(0);
    let board = cloneBoard(level.board);
    for (const [a,b] of plan!) board = pour(board, a, b)!.board;
    expect(won(board)).toBe(true);
    board = cloneBoard(level.board);
    for (const [a,b] of level.witness) board = pour(board, a, b)!.board;
    expect(won(board)).toBe(true);
  });
  it.each(Array.from({length:LEVELS.length}, (_, i) => i))('finds legal decreasing hint routes from level %i', index => {
    let board = cloneBoard(LEVELS[index].board);
    const plan = solve(board);
    expect(plan?.length).toBeGreaterThan(0);
    let previous = plan!.length + 1;
    for (let i = 0; i < 30 && !won(board); i++) {
      const hint = solve(board)!;
      expect(hint.length).toBeLessThan(previous);
      previous = hint.length;
      const result = pour(board, hint[0][0], hint[0][1]);
      expect(result).not.toBeNull();
      board = result!.board;
    }
    expect(won(board)).toBe(true);
  });
});
