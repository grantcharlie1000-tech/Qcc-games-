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
  ['Quiet stream', 'Gentle', 3, 1001, 3],
  ['Soft ripples', 'Gentle', 3, 1002, 4],
  ['Morning dew', 'Gentle', 3, 1003, 5],
  ['Pastel pools', 'Gentle', 3, 1005, 6],
  ['Spring water', 'Gentle', 3, 1006, 7],
  ['Calm cascade', 'Gentle', 3, 1009, 8],
  ['Cross currents', 'Flow', 4, 1001, 5],
  ['Colour tide', 'Flow', 4, 1002, 6],
  ['River bend', 'Flow', 4, 1003, 7],
  ['Glass garden', 'Flow', 4, 1004, 8],
  ['Winding water', 'Flow', 4, 1005, 9],
  ['Spectrum stream', 'Flow', 4, 1006, 10],
  ['Midnight prism', 'Deep', 5, 1001, 8],
  ['Hidden lagoon', 'Deep', 5, 1002, 9],
  ['Ocean colours', 'Deep', 5, 1003, 10],
  ['Crystal depths', 'Deep', 5, 1004, 11],
  ['Aurora falls', 'Deep', 5, 1005, 12],
  ['Rainbow reservoir', 'Deep', 5, 1006, 13],
  // Extension: independently solved and ordered by minimum legal pour count.
  ['Prism channel', 'Deep', 5, 3015, 30], // optimal pours: 14
  ['Moonlit inlet', 'Deep', 5, 3029, 30], // optimal pours: 14
  ['Silver eddies', 'Deep', 5, 3081, 30], // optimal pours: 14
  ['Tidal ribbons', 'Deep', 5, 3121, 30], // optimal pours: 14
  ['Glass rapids', 'Deep', 5, 3147, 30], // optimal pours: 14
  ['Opal current', 'Deep', 5, 3217, 30], // optimal pours: 14
  ['Copper spring', 'Deep', 5, 3223, 30], // optimal pours: 14
  ['Luminous bend', 'Deep', 5, 3263, 30], // optimal pours: 14
  ['Sapphire flow', 'Deep', 5, 3269, 30], // optimal pours: 14
  ['Estuary lights', 'Deep', 6, 3003, 30], // optimal pours: 14
  ['Twilight basin', 'Deep', 6, 3007, 30], // optimal pours: 15
  ['Sixfold stream', 'Deep', 6, 3014, 30], // optimal pours: 15
  ['Mosaic spring', 'Deep', 6, 3021, 30], // optimal pours: 15
  ['Braided delta', 'Deep', 6, 3192, 30], // optimal pours: 15
  ['Moonstone pool', 'Deep', 6, 3296, 30], // optimal pours: 15
  ['Prismatic arch', 'Deep', 7, 3001, 30], // optimal pours: 15
  ['Coral currents', 'Deep', 7, 3009, 30], // optimal pours: 15
  ['Ribbon reservoir', 'Deep', 7, 3019, 30], // optimal pours: 15
  ['Velvet tide', 'Deep', 7, 3024, 30], // optimal pours: 15
  ['Indigo crossing', 'Deep', 7, 3037, 30], // optimal pours: 15
  ['Labyrinth lake', 'Deep', 6, 3005, 30], // optimal pours: 16
  ['Woven waters', 'Deep', 6, 3009, 30], // optimal pours: 16
  ['Cascade chamber', 'Deep', 6, 3029, 30], // optimal pours: 16
  ['Hidden confluence', 'Deep', 6, 3055, 30], // optimal pours: 16
  ['Cobalt passage', 'Deep', 6, 3075, 30], // optimal pours: 16
  ['Mirror lagoon', 'Deep', 6, 3085, 30], // optimal pours: 16
  ['Colour vortex', 'Deep', 6, 3121, 30], // optimal pours: 16
  ['Jewel basin', 'Deep', 6, 3127, 30], // optimal pours: 16
  ['Northern current', 'Deep', 6, 3205, 30], // optimal pours: 16
  ['Rainbow narrows', 'Deep', 6, 3217, 30], // optimal pours: 16
  ['Sevenfold sea', 'Deep', 6, 3069, 30], // optimal pours: 17
  ['Spectral passage', 'Deep', 6, 3107, 30], // optimal pours: 17
  ['Tangled tributaries', 'Deep', 7, 3003, 30], // optimal pours: 17
  ['Kaleidoscope bay', 'Deep', 7, 3071, 30], // optimal pours: 17
  ['Deepwater weave', 'Deep', 7, 3087, 30], // optimal pours: 17
  ['Midnight channels', 'Deep', 7, 3133, 30], // optimal pours: 17
  ['Prism labyrinth', 'Deep', 7, 3137, 30], // optimal pours: 17
  ['Starlit rapids', 'Deep', 7, 3183, 30], // optimal pours: 17
  ['Ocean tapestry', 'Deep', 7, 3213, 30], // optimal pours: 17
  ['Aurora channel', 'Deep', 6, 3015, 30], // optimal pours: 18
  ['Chromatic depths', 'Deep', 7, 3599, 30], // optimal pours: 18
  ['Glass whirlpool', 'Deep', 7, 3761, 30], // optimal pours: 18
  ['Rainbow riddle', 'Deep', 7, 3873, 30], // optimal pours: 18
  ['Crystal labyrinth', 'Deep', 7, 3985, 30], // optimal pours: 18
  ['Infinite inlet', 'Deep', 7, 4111, 30], // optimal pours: 18
  ['Seventh tide', 'Deep', 7, 3619, 30], // optimal pours: 19
  ['Spectral summit', 'Deep', 7, 3847, 30], // optimal pours: 19
  ['Prism pinnacle', 'Deep', 7, 3949, 30], // optimal pours: 19
  ['Ocean odyssey', 'Deep', 7, 3497, 30], // optimal pours: 20
  ['Master of currents', 'Deep', 7, 3807, 30], // optimal pours: 21
];
export const LEVELS: readonly Level[] = definitions.map(([name, difficulty, colours, seed, swaps]) => ({
  name, difficulty, colours, ...constructLevel(colours, seed, swaps),
}));
