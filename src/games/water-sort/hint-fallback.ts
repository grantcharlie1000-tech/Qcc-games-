import type { Board } from './rules';
import { cloneBoard, pour, won } from './rules';
import type { Hint, HintInput } from './hint';

type Move = [number, number];
type Node = { board: Board; parent: number; move?: Move };
const canonical = (board: Board) => board.map(t => t.join('')).sort().join('|');

/** A yield is a suspension point, never an exhausted-search result. */
export function* solveFallback(board: Board, maxNodes = 100000): Generator<void, Move[] | null, void> {
  maxNodes = Math.floor(maxNodes);
  if (!Number.isFinite(maxNodes) || maxNodes < 1) return null;
  const nodes: Node[] = [{ board: cloneBoard(board), parent: -1 }];
  const seen = new Set([canonical(board)]);
  for (let at = 0; at < nodes.length; at++) {
    yield;
    const node = nodes[at];
    if (won(node.board)) {
      const path: Move[] = [];
      let index = at;
      while (nodes[index].parent !== -1) {
        path.push(nodes[index].move!);
        index = nodes[index].parent;
        yield;
      }
      return path.reverse();
    }
    if (nodes.length >= maxNodes) continue;
    // Same from-major/to-minor order as legalPours, without its eager move array.
    for (let from = 0; from < node.board.length; from++) {
      for (let to = 0; to < node.board.length; to++) {
        yield;
        if (nodes.length >= maxNodes) break;
        const move = pour(node.board, from, to);
        if (!move) continue;
        const key = canonical(move.board);
        if (seen.has(key)) continue;
        seen.add(key);
        nodes.push({ board: move.board, parent: at, move: [move.from, move.to] });
      }
      if (nodes.length >= maxNodes) break;
    }
  }
  return null;
}

export function* hintFallback(state: HintInput): Generator<void, Hint, void> {
  yield;
  if (won(state.tubes)) return { kind: 'done' };
  const path = yield* solveFallback(state.tubes);
  if (path?.length) return { kind: 'pour', from: path[0][0], to: path[0][1], remaining: path.length };
  for (let i = state.history.length - 1; i >= 0; i--) {
    const route = yield* solveFallback(state.history[i]);
    if (route) return { kind: 'undo', steps: state.history.length - i };
  }
  return { kind: 'undo', steps: state.history.length };
}
