import { CAPACITY, topRun } from './rules';
import type { Board } from './rules';
export interface Level { name: string; difficulty: string; colours: number; board: Board; witness: [number,number][] }
/** Each reverse exchange splits two exposed runs through a spare tube.
 * Its three inverse pours are ordinary legal, maximal-run forward pours.
 * Every exchange leaves all coloured tubes full and both spares empty. */
export function constructLevel(colours: number, seed: number, swaps: number): {board:number[][]; witness:[number,number][]} {
  const board = Array.from({length:colours}, (_, c) => Array<number>(CAPACITY).fill(c));
  board.push([], []);
  const witness: [number,number][] = [];
  const random = (max: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
  for (let step = 0; step < swaps; step++) {
    const choices: [number,number][] = [];
    for (let a = 0; a < colours; a++) for (let b = a + 1; b < colours; b++) {
      if (topRun(board[a]) > 1 && topRun(board[b]) > 1 && board[a].at(-1) !== board[b].at(-1)) choices.push([a,b]);
    }
    if (!choices.length) break;
    const [a,b] = choices[random(choices.length)];
    const amount = 1 + random(Math.min(topRun(board[a]), topRun(board[b])) - 1);
    const spare = colours;
    board[spare].push(...board[a].splice(-amount));
    board[a].push(...board[b].splice(-amount));
    board[b].push(...board[spare].splice(-amount));
    witness.unshift([b,spare], [a,b], [spare,a]);
  }
  return { board, witness };
}

const definitions: [string, string, number, number, number][] = [
  ['First pour', 'Gentle', 2, 17, 1],
  ['Three flavours', 'Gentle', 3, 41, 2],
  ['A little twist', 'Gentle', 3, 91, 4],
  ['Colour current', 'Flow', 4, 28, 3],
  ['Ripple effect', 'Flow', 4, 373, 7],
  ['Perfect balance', 'Flow', 4, 193, 5],
  ['Deep water', 'Deep', 5, 23, 9],
  ['Prism pool', 'Deep', 5, 185, 9],
  ['Liquid logic', 'Deep', 5, 257, 9],
];
export const LEVELS: readonly Level[] = definitions.map(([name, difficulty, colours, seed, swaps]) => ({
  name, difficulty, colours, ...constructLevel(colours, seed, swaps),
}));
