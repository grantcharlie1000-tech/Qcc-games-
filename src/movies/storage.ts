import {imageAsset} from './model';
import type {Title} from './model';
import {STREAM_PROVIDERS,START_THRESHOLD} from './provider';
import type {StreamProviderId} from './provider';
// Separate namespace. Never use game saves, scores, sync, or analytics.
export const MOVIES_KEY='qcc:movies:v1';
export interface TitleSnapshot {id:string;kind:'movie'|'tv';name:string;year:number;poster:string;backdrop?:string}
export interface MediaMeta {duration?:number;updated:number}
export interface MoviePreferences {list:string[];progress:Record<string,number>;titles:Record<string,TitleSnapshot>;meta:Record<string,MediaMeta>;provider?:StreamProviderId}
export interface ContinueItem {key:string;id:string;season?:number;episode?:number;time:number;duration?:number;updated:number}
const MAX_SNAPSHOTS=200,MAX_SECONDS=30*86400;
// A list entry is a title id, so it has the shape a snapshot id has.
const isListed=(v:unknown):v is string=>typeof v==='string'&&v.length<=80&&/^(movie|tv)-[a-z0-9-]+$/.test(v);
// Progress and meta keys are exactly the keys mediaKey produces (see model.ts): movie-N, or tv-N:sS:eE for an episode.
const KEY=/^(?:movie-[a-z0-9-]+|tv-[a-z0-9-]+:s\d{1,4}:e\d{1,4})$/,EPISODE=/:s(\d{1,4}):e(\d{1,4})$/;
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const isText=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
const isYear=(v:unknown):v is number=>v===0||(typeof v==='number'&&Number.isInteger(v)&&v>0&&v<10000);
const isDuration=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=MAX_SECONDS;
const isProvider=(v:unknown):v is StreamProviderId=>STREAM_PROVIDERS.some(provider=>provider.id===v);
const idOf=(key:string)=>key.split(':')[0];
// A provider can report 0 to 14 seconds before it applies its start time. That report must not replace a resume point, but a finished title always saves.
export const keepsResume=(saved:number|undefined,time:number,ended:boolean)=>!ended&&time<START_THRESHOLD&&(saved??0)>=START_THRESHOLD;
export const snapshotOf=(title:Title):TitleSnapshot=>{const backdrop=imageAsset(title.backdrop);return {id:title.id,kind:title.kind,name:title.name,year:title.year,poster:title.poster,...(backdrop?{backdrop}:{})};};
// Any invalid field drops the whole snapshot, so stored artwork is always an approved image URL.
function parseSnapshot(id:string,value:unknown):TitleSnapshot|undefined {
 if(!isRecord(value)||value.id!==id||id.length>80||!/^(movie|tv)-[a-z0-9-]+$/.test(id))return;
 const {kind,name,year,poster,backdrop}=value,art=imageAsset(poster),back=imageAsset(backdrop);
 if((kind!=='movie'&&kind!=='tv')||!id.startsWith(kind+'-')||!isText(name,200)||!isYear(year)||!art||(backdrop!==undefined&&!back))return;
 return {id,kind,name,year,poster:art,...(back?{backdrop:back}:{})};
}
function parseMeta(value:unknown):MediaMeta|undefined {
 if(!isRecord(value))return;
 const {duration,updated}=value;
 if(typeof updated!=='number'||!Number.isFinite(updated)||updated<0||(duration!==undefined&&!isDuration(duration)))return;
 return {...(duration===undefined?{}:{duration}),updated};
}
// Reads one stored value. An invalid entry is dropped on its own, so the valid entries beside it survive.
function parseStored(raw:string|null):MoviePreferences {
 const v:unknown=JSON.parse(raw||'null'),stored:Record<string,unknown>=isRecord(v)?v:{},data:MoviePreferences={list:[],progress:{},titles:{},meta:{}};
 if(Array.isArray(stored.list))data.list=stored.list.filter(isListed).slice(0,200);
 if(isRecord(stored.progress))for(const [key,time] of Object.entries(stored.progress))if(KEY.test(key)&&typeof time==='number'&&Number.isFinite(time)&&time>=0)data.progress[key]=Math.min(time,MAX_SECONDS);
 for(const [id,value] of Object.entries(isRecord(stored.titles)?stored.titles:{})){const snapshot=parseSnapshot(id,value);if(snapshot)data.titles[id]=snapshot;}
 for(const [key,value] of Object.entries(isRecord(stored.meta)?stored.meta:{})){const meta=KEY.test(key)?parseMeta(value):undefined;if(meta)data.meta[key]=meta;}
 if(isProvider(stored.provider))data.provider=stored.provider;
 return data;
}
export class MovieStorage {
 data:MoviePreferences={list:[],progress:{},titles:{},meta:{}};
 durable=true;
 // The stored text this page last read or wrote. A reload adopts storage only when that text has changed.
 private seen?:string|null;
 // Set when a write is refused, so this page holds changes that storage does not. A write that saves clears it.
 private unsaved=false;
 constructor(private storage:()=>Storage=()=>localStorage){
  try {
   const raw=this.storage().getItem(MOVIES_KEY);
   this.seen=raw;
   this.data=parseStored(raw);
   // Only a read that succeeded may be written back, so unreadable storage is left exactly as found.
   this.write();
  }catch{this.durable=false;}
 }
 // Another page's write is adopted. Storage that still holds what this page last saw keeps this page's copy, unsaved changes included.
 // Returns whether the data changed.
 reload():boolean{
  try{
   const raw=this.storage().getItem(MOVIES_KEY);
   // While this page holds changes it could not save, another page's data waits. The next write that saves replaces the stored text.
   if(raw===this.seen||this.unsaved)return false;
   this.data=parseStored(raw);this.seen=raw;this.durable=true;
   return true;
  }catch{this.durable=false;return false;}
 }
 private write(){
  // A snapshot stays while its title is listed or has a position above zero. Only unlisted snapshots count toward the cap.
  const live=new Set([...this.data.list,...Object.entries(this.data.progress).filter(([,time])=>time>0).map(([key])=>idOf(key))]);
  for(const id of Object.keys(this.data.titles))if(!live.has(id))delete this.data.titles[id];
  const unlisted=Object.keys(this.data.titles).filter(id=>!this.data.list.includes(id));
  for(const id of unlisted.slice(0,-MAX_SNAPSHOTS))delete this.data.titles[id];
  const json=JSON.stringify(this.data);
  try{this.storage().setItem(MOVIES_KEY,json);this.seen=json;this.durable=true;this.unsaved=false;}catch{this.durable=false;this.unsaved=true;}
 }
 // Re-inserting moves a snapshot to the end, so key order runs least to most recently remembered and the cap drops the oldest.
 private remember(id:string,snapshot?:TitleSnapshot){const valid=parseSnapshot(id,snapshot);if(valid){delete this.data.titles[id];this.data.titles[id]=valid;}}
 toggle(id:string,snapshot?:TitleSnapshot){
  if(this.data.list.includes(id))this.data.list=this.data.list.filter(x=>x!==id);
  else{this.data.list=[...this.data.list,id];this.remember(id,snapshot);}
  this.write();
 }
 progress(key:string,time:number,duration?:number,snapshot?:TitleSnapshot){
  if(!KEY.test(key)||!Number.isFinite(time)||time<0)return;
  // A position update without a duration keeps the duration already known for this media.
  const known=isDuration(duration)?duration:this.data.meta[key]?.duration;
  this.data.progress[key]=Math.min(time,MAX_SECONDS);
  this.data.meta[key]={...(known===undefined?{}:{duration:known}),updated:Date.now()};
  this.remember(idOf(key),snapshot);
  this.write();
 }
 setProvider(id:StreamProviderId){if(isProvider(id)){this.data.provider=id;this.write();}}
 snapshot(id:string):TitleSnapshot|undefined{return Object.hasOwn(this.data.titles,id)?this.data.titles[id]:undefined;}
 continueItems():ContinueItem[]{
  const items:ContinueItem[]=[];
  for(const [key,time] of Object.entries(this.data.progress)){
   if(!KEY.test(key)||!(time>0))continue;
   const episode=EPISODE.exec(key),meta:MediaMeta|undefined=this.data.meta[key];
   items.push({key,id:idOf(key),...(episode?{season:Number(episode[1]),episode:Number(episode[2])}:{}),time,...(meta?.duration===undefined?{}:{duration:meta.duration}),updated:meta?.updated??0});
  }
  return items.sort((a,b)=>b.updated-a.updated);
 }
 clear(){this.data={list:[],progress:{},titles:{},meta:{}};this.write();}
}
