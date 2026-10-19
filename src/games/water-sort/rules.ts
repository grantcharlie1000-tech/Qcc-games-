export type Board = readonly (readonly number[])[];
export const CAPACITY = 4;
export interface Pour { board: number[][]; from: number; to: number; colour: number; amount: number }
export const cloneBoard = (board: Board): number[][] => board.map(tube => [...tube]);
export const boardKey = (board: Board): string => board.map(tube => tube.join('')).join('|');
export function topRun(tube: readonly number[]): number {
  let amount = 0;
  for (let i = tube.length - 1; i >= 0 && tube[i] === tube[tube.length - 1]; i--) amount++;
  return amount;
}
export function pour(board: Board, from: number, to: number): Pour | null {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return null;
  const source = board[from], target = board[to];
  if (!source?.length || !target || target.length >= CAPACITY) return null;
  const colour = source[source.length - 1];
  if (target.length && target[target.length - 1] !== colour) return null;
  const amount = Math.min(topRun(source), CAPACITY - target.length);
  const next = cloneBoard(board);
  next[from].splice(source.length - amount);
  next[to].push(...Array<number>(amount).fill(colour));
  return { board: next, from, to, colour, amount };
}
export function won(board: Board): boolean {
  return board.some(tube => tube.length) && board.every(tube => tube.length === 0 || (tube.length === CAPACITY && tube.every(colour => colour === tube[0])));
}
export function legalPours(board: Board): Pour[] {
  const moves: Pour[] = [];
  for (let from = 0; from < board.length; from++) {
    for (let to = 0; to < board.length; to++) {
      const result = pour(board, from, to);
      if (result) moves.push(result);
    }
  }
  return moves;
}
