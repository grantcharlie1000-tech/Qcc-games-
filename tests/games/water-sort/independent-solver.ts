import type { Board } from '../../../src/games/water-sort/rules';
// Independent BFS: deliberately does not call production move generation, goal,
// canonicalization, or solver. A rules/solver bug cannot verify its own fixture.
export function independentSolve(input: Board): [number, number][] | null {
  const queue = [{ board: input.map(t => [...t]), path: [] as [number, number][] }];
  const seen = new Set<string>();
  for (let at = 0; at < queue.length && at < 150000; at++) {
    const { board, path } = queue[at];
    if (board.some(t => t.length) && board.every(t => new Set(t).size <= 1) && new Set(board.flat()).size === board.filter(t => t.length).length) return path;
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
