import type { GameId, Settings } from './types';
import {stableText} from './content';
const prefix = 'pocket-arcade:v1:';
const memory = new Map<string, unknown>();
const unpersisted = new Set<string>();
let retained = true;
const listeners=new Set<(key:string)=>void>();
export function subscribe(listener:(key:string)=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
function changed(key:string){for(const listener of listeners)listener(key);}
export function keys():string[]{
 const result=new Set(memory.keys());try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(prefix))result.add(key.slice(prefix.length));}}catch{}return [...result];
}
export function remove(key:string):boolean {
 memory.delete(key);unpersisted.delete(key);
 try{localStorage.removeItem(prefix+key);changed(key);return true;}catch{retained=false;memory.set(key,null);unpersisted.add(key);changed(key);return false;}
}
export function invalidate(key:string){memory.delete(key);unpersisted.delete(key);}
export function canRetain(): boolean { return retained; }
export function read<T>(key:string, fallback:T):T {
  if(unpersisted.has(key)) return (memory.get(key) as T) ?? fallback;
  try { const raw = localStorage.getItem(prefix+key); if(raw!==null) return JSON.parse(raw) as T; }
  catch { retained=false; }
  return (memory.get(key) as T) ?? fallback;
}
export function write(key:string,value:unknown):boolean {
  const same=stableText(read(key,undefined))===stableText(value);
  if(same&&!unpersisted.has(key))return true;
  // Detach snapshots from mutable game state, including the quota-error fallback.
  let encoded:string;try{encoded=JSON.stringify(value);memory.set(key,JSON.parse(encoded));}catch{retained=false;return false;}
  let durable=true;
  try { localStorage.setItem(prefix+key,encoded); unpersisted.delete(key); }
  catch { retained=false; unpersisted.add(key);durable=false; }
  if(!same&&(key==='settings'||key==='favourites'||key.startsWith('best:')))write('updated:'+key,Math.max(Date.now(),read<number>('updated:'+key,0)+1));
  if(!same)changed(key);return durable;
}
export function probeStorage():boolean { try { localStorage.setItem(prefix+'probe','1'); localStorage.removeItem(prefix+'probe'); } catch { retained=false; } return retained; }
export function settings():Settings { return {...{sound:false,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,colorBlind:false,autoNextEpisode:true},...read<Partial<Settings>>('settings',{})}; }
export function highScore(id:GameId):number { const score=read('best:'+id,0);return typeof score==='number'&&Number.isFinite(score)?score:0; }
export function recordScore(id:GameId,score:number):number { const old=highScore(id),best=Math.max(old,Number.isFinite(score)?score:0);if(best>old)write('best:'+id,best);return best; }
export function saveGame(id:GameId,data:unknown):boolean {
 const key='save:'+id,old=read<{version:number;data:unknown;updated?:number}|null>(key,null);
 if(old?.version===1&&stableText(old.data)===stableText(data))return write(key,old);
 return write(key,{version:1,data,updated:Math.max(Date.now(),(old?.updated??0)+1)});
}
export function savedGame(id:GameId):unknown { const value=read<{version:number,data:unknown}|null>('save:'+id,null); return value?.version===1?value.data:undefined; }
export function favourites():GameId[] { const result=read<GameId[]>('favourites',[]);return Array.isArray(result)?result:[]; }
export function toggleFavourite(id:GameId):boolean { const set=new Set(favourites());if(set.has(id))set.delete(id);else set.add(id);write('favourites',[...set]);return set.has(id); }

export function flushPending():boolean {
  for(const key of [...unpersisted])write(key,memory.get(key));
  return unpersisted.size===0;
}
