import type { GameId, Settings } from './types';
const prefix = 'pocket-arcade:v1:';
const memory = new Map<string, unknown>();
const unpersisted = new Set<string>();
let retained = true;
export function canRetain(): boolean { return retained; }
export function read<T>(key:string, fallback:T):T {
  if(unpersisted.has(key)) return (memory.get(key) as T) ?? fallback;
  try { const raw = localStorage.getItem(prefix+key); if(raw!==null) return JSON.parse(raw) as T; }
  catch { retained=false; }
  return (memory.get(key) as T) ?? fallback;
}
export function write(key:string,value:unknown):boolean {
  memory.set(key,value);
  try { localStorage.setItem(prefix+key,JSON.stringify(value)); unpersisted.delete(key); return true; }
  catch { retained=false; unpersisted.add(key); return false; }
}
export function probeStorage():boolean { try { localStorage.setItem(prefix+'probe','1'); localStorage.removeItem(prefix+'probe'); } catch { retained=false; } return retained; }
export function settings():Settings { return {...{sound:false,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,colorBlind:false},...read<Partial<Settings>>('settings',{})}; }
export function highScore(id:GameId):number { const score=read('best:'+id,0);return typeof score==='number'&&Number.isFinite(score)?score:0; }
export function recordScore(id:GameId,score:number):number { const best=Math.max(highScore(id),Number.isFinite(score)?score:0);write('best:'+id,best);return best; }
export function saveGame(id:GameId,data:unknown):boolean { return write('save:'+id,{version:1,data,updated:Date.now()}); }
export function savedGame(id:GameId):unknown { const value=read<{version:number,data:unknown}|null>('save:'+id,null); return value?.version===1?value.data:undefined; }
export function favourites():GameId[] { const result=read<GameId[]>('favourites',[]);return Array.isArray(result)?result:[]; }
export function toggleFavourite(id:GameId):boolean { const set=new Set(favourites());if(set.has(id))set.delete(id);else set.add(id);write('favourites',[...set]);return set.has(id); }

export function flushPending():boolean {
  for(const key of [...unpersisted])write(key,memory.get(key));
  return unpersisted.size===0;
}
