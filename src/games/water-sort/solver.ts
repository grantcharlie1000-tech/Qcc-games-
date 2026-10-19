import { cloneBoard, legalPours, won } from './rules';
import type { Board } from './rules';
type Node = { board: Board; parent: number; move?: [number,number] };
// Tube permutations are equivalent for the puzzle, but nodes retain their actual
// order so the returned move indices always refer to the player's board.
const canonical = (board: Board) => board.map(t => t.join('')).sort().join('|');
/** Breadth-first graph search. Null means no route found within the safe budget. */
export function solve(board: Board, maxNodes = 100000): [number, number][] | null {
  maxNodes = Math.floor(maxNodes);
  if (!Number.isFinite(maxNodes) || maxNodes < 1) return null;
  const nodes: Node[] = [{ board: cloneBoard(board), parent: -1 }];
  const seen = new Set([canonical(board)]);
  for (let at = 0; at < nodes.length; at++) {
    const node = nodes[at];
    if (won(node.board)) {
      const path: [number,number][] = [];
      let index = at;
      while (nodes[index].parent !== -1) {
        path.push(nodes[index].move!);
        index = nodes[index].parent;
      }
      return path.reverse();
    }
    if (nodes.length >= maxNodes) continue;
    for (const move of legalPours(node.board)) {
      if (nodes.length >= maxNodes) break;
      const key = canonical(move.board);
      if (seen.has(key)) continue;
      seen.add(key);
      nodes.push({ board: move.board, parent: at, move: [move.from, move.to] });
    }
  }
  return null;
}
