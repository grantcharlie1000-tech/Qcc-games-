import {imageAsset} from './model';
import type {TitleSnapshot} from './storage';
export interface MovieProgressEntry {time:number;duration?:number;updated:number;snapshot:TitleSnapshot}
export interface MovieProgressDocument {entries:Record<string,MovieProgressEntry>;cleared:number}
export const MAX_PROGRESS_ENTRIES=200,MAX_PROGRESS_BODY_BYTES=131072;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const timestamp=(v:unknown,now:number):v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=now+60000;
const seconds=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=30*86400;
export function parseMovieProgress(value:unknown,now=Date.now()):MovieProgressDocument|null {
 if(!object(value)||Object.keys(value).some(k=>!['entries','cleared'].includes(k))||!timestamp(value.cleared,now)||!object(value.entries)||Object.keys(value.entries).length>MAX_PROGRESS_ENTRIES)return null;
 const entries:Record<string,MovieProgressEntry>={};
 for(const [key,entry] of Object.entries(value.entries)){
  if(key.length>100||!/^(?:movie-[a-z0-9-]+|tv-[a-z0-9-]+:s\d{1,4}:e\d{1,4})$/.test(key)||!object(entry)||Object.keys(entry).some(k=>!['time','duration','updated','snapshot'].includes(k))||!seconds(entry.time)||!timestamp(entry.updated,now)||(entry.duration!==undefined&&(!seconds(entry.duration)||entry.duration===0)))return null;
  const s=entry.snapshot,id=key.split(':')[0]!;
  if(!object(s)||Object.keys(s).some(k=>!['id','kind','name','year','poster','backdrop'].includes(k))||id.length>80||s.id!==id||(s.kind!=='movie'&&s.kind!=='tv')||!id.startsWith(s.kind+'-')||typeof s.name!=='string'||!s.name.length||s.name.length>200||!Number.isInteger(s.year)||Number(s.year)<0||Number(s.year)>9999||!imageAsset(s.poster)||(s.backdrop!==undefined&&!imageAsset(s.backdrop)))return null;
  entries[key]={time:entry.time,updated:entry.updated,...(entry.duration===undefined?{}:{duration:entry.duration as number}),snapshot:{id,kind:s.kind,name:s.name,year:s.year as number,poster:s.poster as string,...(s.backdrop===undefined?{}:{backdrop:s.backdrop as string})}};
 }
 return {entries,cleared:value.cleared};
}

/** Equal timestamps retain the authoritative first document. Clear always wins ties. */
export function mergeMovieProgress(a:MovieProgressDocument,b:MovieProgressDocument):MovieProgressDocument {
 const cleared=Math.max(a.cleared,b.cleared),entries={...a.entries};
 for(const [key,entry] of Object.entries(b.entries))if(entry.updated>cleared&&(!entries[key]||entry.updated>entries[key]!.updated))entries[key]=entry;
 for(const [key,entry] of Object.entries(entries))if(entry.updated<=cleared)delete entries[key];
 return {entries,cleared};
}
