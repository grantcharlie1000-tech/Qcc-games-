import type {Saves,SaveRecord} from './shared';
import {normalizeLastLightScore} from '../core/last-light-score';
import {stableText} from '../core/content';
/** Stable ties make the merge independent of request arrival order. */
const newest=(a:SaveRecord,b:SaveRecord)=>a.updated===b.updated?(stableText(a.value)>=stableText(b.value)?a:b):a.updated>b.updated?a:b;
export function mergeSaves(a:Saves,b:Saves):Saves {
 const normalize=(key:string,record:SaveRecord):SaveRecord=>key==='best:last-light'?{...record,value:normalizeLastLightScore(record.value as number)}:record;
 const result:Saves=Object.fromEntries(Object.entries(a).map(([key,record])=>[key,normalize(key,record)]));
 for(const [key,record] of Object.entries(b)){
  const next=normalize(key,record);
  const old=result[key];if(!old){result[key]=next;continue;}
  if(key.startsWith('best:'))result[key]={value:Math.max(old.value as number,next.value as number),updated:Math.max(old.updated,next.updated)};
  else result[key]=newest(old,next);
 }
 return result;
}
