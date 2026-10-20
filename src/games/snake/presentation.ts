import {advance, TICK_MS, type Cell, type Direction, type SnakeState} from './model';

/** Effect time and legacy presentation history are independent of the deterministic grid and its save version. */
export interface SnakePresentation {
  previous: Cell[] | null;
  grew: boolean;
  time: number;
  foodAt: number;
  ateAt: number;
  eaten: Cell | null;
  endedAt: number;
}
export interface SnakePose {path: Cell[]; head: Cell; tangent: Cell; progress: number}
const facing: Record<Direction,Cell> = {up:{x:0,y:-1},right:{x:1,y:0},down:{x:0,y:1},left:{x:-1,y:0}};
const copy = (body: Cell[]) => body.map(p => ({...p}));
export function createPresentation(): SnakePresentation {
  return {previous:null, grew:false, time:0, foodAt:-Infinity, ateAt:-Infinity, eaten:null, endedAt:-Infinity};
}

/** Split only at existing model ticks, retaining compatible save history and effect ages after a dropped frame. */
export function advancePresentation(state: SnakeState, view: SnakePresentation, ms: number): void {
  if (state.phase !== 'running' || !Number.isFinite(ms) || ms < 0) return;
  let remaining = ms;
  while (remaining + 1e-8 >= TICK_MS - state.elapsed && state.phase === 'running') {
    const interval = TICK_MS - state.elapsed;
    const previous = copy(state.body), food = state.food && {...state.food}, score = state.score;
    view.time += interval;
    advance(state, interval);
    remaining = Math.max(0, remaining - interval);
    if ((state.phase as SnakeState['phase']) === 'lost') {
      view.previous = null;
      view.endedAt = view.time;
    } else {
      view.previous = previous;
      view.grew = state.body.length > previous.length;
      if (state.score !== score) {
        view.ateAt = view.foodAt = view.time;
        view.eaten = food;
      }
      if ((state.phase as SnakeState['phase']) === 'won') view.endedAt = view.time;
    }
  }
  if (state.phase === 'running') {
    advance(state, remaining);
    view.time += remaining;
  }
}

/** Display the authoritative cells on their consuming tick, without a visual arrival offset. */
export function projectSnake(state: SnakeState, _view: SnakePresentation, _reducedMotion = false): SnakePose {
  const path = copy(state.body), head = path[0];
  // A fatal perpendicular turn updates direction while retaining the last valid body.
  return {path, head, tangent:{...facing[state.direction]}, progress:1};
}

export interface SavedPresentation {
  previous: Cell[] | null;
  grew: boolean;
  foodAge: number;
  eatAge: number;
  eaten: Cell | null;
}
/** Relative ages are bounded, finite, and independent of the wall-clock baseline. */
export function savePresentation(view: SnakePresentation): SavedPresentation {
  const age = (at:number) => Number.isFinite(at) ? Math.min(200,Math.max(0,view.time-at)) : 200;
  const eatAge = age(view.ateAt);
  return {previous:view.previous && copy(view.previous), grew:view.grew,
    foodAge:age(view.foodAt),eatAge,eaten:eatAge<200 && view.eaten ? {...view.eaten} : null};
}
export function restorePresentation(state: SnakeState, value: unknown): SnakePresentation {
  const view = createPresentation();
  if (!value || typeof value !== 'object') return view;
  const candidate = value as {previous?:unknown;grew?:unknown;foodAge?:unknown;eatAge?:unknown;eaten?:unknown};
  const age = (n:unknown):n is number => typeof n==='number' && Number.isFinite(n) && n>=0 && n<=200;
  const cell = (p:unknown):p is Cell => !!p && typeof p==='object' && Number.isInteger((p as Cell).x) && Number.isInteger((p as Cell).y) && (p as Cell).x>=0 && (p as Cell).x<16 && (p as Cell).y>=0 && (p as Cell).y<16;
  // Effect metadata is optional, so older presentation-only snapshots remain valid.
  if(age(candidate.foodAge))view.foodAt=-candidate.foodAge;
  if(age(candidate.eatAge) && cell(candidate.eaten) && state.body.some(p=>p.x===(candidate.eaten as Cell).x && p.y===(candidate.eaten as Cell).y)) {
    view.ateAt=-candidate.eatAge;view.eaten={...candidate.eaten};
  }
  if (!Array.isArray(candidate.previous) || typeof candidate.grew !== 'boolean') return view;
  const previous = candidate.previous as Cell[];
  if (previous.length !== state.body.length - (candidate.grew ? 1 : 0)) return view;
  if (!previous.every(cell)) return view;
  const current = state.body;
  if (Math.abs(current[0].x-previous[0].x)+Math.abs(current[0].y-previous[0].y)!==1) return view;
  if (!current.slice(1).every((p,i) => p.x===previous[i].x && p.y===previous[i].y)) return view;
  if (new Set(previous.map(p => p.x + 16*p.y)).size !== previous.length) return view;
  if (!previous.slice(1).every((p,i) => Math.abs(p.x-previous[i].x)+Math.abs(p.y-previous[i].y)===1)) return view;
  view.previous = copy(previous); view.grew = candidate.grew;
  return view;
}
