import {advance, TICK_MS, type Cell, type SnakeState} from './model';

/** Presentation history is independent of the deterministic grid and its save version. */
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
const copy = (body: Cell[]) => body.map(p => ({...p}));
export function createPresentation(): SnakePresentation {
  return {previous:null, grew:false, time:0, foodAt:-Infinity, ateAt:-Infinity, eaten:null, endedAt:-Infinity};
}

/** Split only at existing model ticks, retaining the final committed edge after a dropped frame. */
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

function pointAt(path: Cell[], distance: number): Cell {
  const index = Math.min(Math.floor(distance), path.length - 2);
  const fraction = distance - index;
  return {x:path[index].x + (path[index+1].x-path[index].x)*fraction,
    y:path[index].y + (path[index+1].y-path[index].y)*fraction};
}

/** Keep the corner vertices! Joining interpolated segment centres cuts diagonally across bends. */
export function projectSnake(state: SnakeState, view: SnakePresentation, reducedMotion = false): SnakePose {
  const fraction = state.elapsed / TICK_MS;
  if (!view.previous || reducedMotion || state.phase !== 'running') {
    const path = copy(state.body), head = path[0], neck = path[1];
    return {path, head, tangent:{x:head.x-neck.x,y:head.y-neck.y}, progress:1};
  }
  const trail = [state.body[0], ...view.previous];
  const start = 1 - fraction;
  const end = view.grew ? trail.length - 1 : trail.length - 1 - fraction;
  const head = pointAt(trail, start), path = [head];
  for (let i = Math.floor(start)+1; i < end; i++) path.push({...trail[i]});
  path.push(pointAt(trail, end));
  // The committed edge sets facing as soon as a queued turn is consumed.
  return {path, head, tangent:{x:trail[0].x-trail[1].x,y:trail[0].y-trail[1].y}, progress:fraction};
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
