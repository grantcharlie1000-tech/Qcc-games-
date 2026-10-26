import type {Saves,SaveRecord} from './shared';
/** Stable ties make the merge independent of request arrival order. */
const newest=(a:SaveRecord,b:SaveRecord)=>a.updated===b.updated?(JSON.stringify(a.value)>=JSON.stringify(b.value)?a:b):a.updated>b.updated?a:b;
export function mergeSaves(a:Saves,b:Saves):Saves {
 const result:Saves={...a};
 for(const [key,next] of Object.entries(b)){
  const old=result[key];if(!old){result[key]=next;continue;}
  if(key.startsWith('best:'))result[key]={value:Math.max(old.value as number,next.value as number),updated:Math.max(old.updated,next.updated)};
  else result[key]=newest(old,next);
 }
 return result;
}
