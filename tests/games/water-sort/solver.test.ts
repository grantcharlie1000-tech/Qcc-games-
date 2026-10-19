import { describe, expect, it } from 'vitest';
import { LEVELS, constructLevel } from '../../../src/games/water-sort/levels';
import { solve } from '../../../src/games/water-sort/solver';
import { boardKey, cloneBoard, pour, won } from '../../../src/games/water-sort/rules';
import type { Board } from '../../../src/games/water-sort/rules';

// Independent BFS: deliberately does not call production move generation, goal,
// canonicalization, or solver. A rules/solver bug cannot verify its own fixture.
export function independentSolve(input: Board): [number, number][] | null {
  const queue = [{ board: input.map(t => [...t]), path: [] as [number, number][] }];
  const seen = new Set<string>();
  for (let at = 0; at < queue.length && at < 150000; at++) {
    const { board, path } = queue[at];
    if (board.every(t => !t.length || (t.length === 4 && new Set(t).size === 1))) return path;
    for (let a = 0; a < board.length; a++) {
      if (!board[a].length) continue;
      const c = board[a].at(-1)!;
      let run = 1;
      while (board[a][board[a].length - 1 - run] === c) run++;
      for (let b = 0; b < board.length; b++) {
        if (a === b || board[b].length === 4 || (board[b].length && board[b].at(-1) !== c)) continue;
        const qty = Math.min(run, 4 - board[b].length);
        const next = board.map(t => [...t]);
        next[a].splice(-qty);
        next[b].push(...new Array<number>(qty).fill(c));
        const key = next.map(t => JSON.stringify(t)).sort().join('/');
        if (!seen.has(key)) { seen.add(key); queue.push({ board: next, path: [...path, [a, b]] }); }
      }
    }
  }
  return null;
}

describe('soluble level construction and search', () => {
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
  it('ships nine distinct levels with all three difficulty tiers', () => {
    expect(LEVELS).toHaveLength(9);
    expect(new Set(LEVELS.map(l => boardKey(l.board))).size).toBe(9);
    expect(new Set(LEVELS.map(l => l.difficulty)).size).toBe(3);
  });
  it.each(Array.from({length:9}, (_, i) => i))('independently BFS verifies shipped level %i and its reverse witness', index => {
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
  it.each(Array.from({length:9}, (_, i) => i))('finds legal decreasing hint routes from level %i', index => {
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
