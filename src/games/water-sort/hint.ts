import type { Board } from './rules';
import { won } from './rules';
import { solve } from './solver';

export interface HintInput { tubes: Board; history: readonly Board[] }
export type Hint = {kind:'pour';from:number;to:number;remaining:number} | {kind:'undo';steps:number} | {kind:'done'};

export function hintFor(state: HintInput): Hint {
  if (won(state.tubes)) return { kind:'done' };
  const path = solve(state.tubes);
  if (path?.length) return { kind:'pour', from:path[0][0], to:path[0][1], remaining:path.length };
  for (let i = state.history.length - 1; i >= 0; i--) {
    if (solve(state.history[i])) return { kind:'undo', steps:state.history.length - i };
  }
  // Valid states always have their reverse-constructed start in their history.
  return { kind:'undo', steps:state.history.length };
}
