import {imageAsset} from './model';
import type {Title} from './model';
import {STREAM_PROVIDERS} from './provider';
import type {StreamProviderId} from './provider';
// Separate namespace. Never use game saves, scores, sync, or analytics.
export const MOVIES_KEY='qcc:movies:v1';
export interface TitleSnapshot {id:string;kind:'movie'|'tv';name:string;year:number;poster:string;backdrop?:string}
export interface MediaMeta {duration?:number;updated:number}
export interface MoviePreferences {list:string[];progress:Record<string,number>;titles:Record<string,TitleSnapshot>;meta:Record<string,MediaMeta>;provider?:StreamProviderId}
export interface ContinueItem {key:string;id:string;season?:number;episode?:number;time:number;duration?:number;updated:number}
const MAX_SNAPSHOTS=200,MAX_SECONDS=30*86400;
// Progress and meta keys are exactly the keys mediaKey produces (see model.ts): movie-N, or tv-N:sS:eE for an episode.
const KEY=/^(?:movie-[a-z0-9-]+|tv-[a-z0-9-]+:s\d{1,4}:e\d{1,4})$/,EPISODE=/:s(\d{1,4}):e(\d{1,4})$/;
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const isText=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
const isYear=(v:unknown):v is number=>v===0||(typeof v==='number'&&Number.isInteger(v)&&v>0&&v<10000);
const isDuration=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=MAX_SECONDS;
const isProvider=(v:unknown):v is StreamProviderId=>STREAM_PROVIDERS.some(provider=>provider.id===v);
const idOf=(key:string)=>key.split(':')[0];
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
export class MovieStorage {
 data:MoviePreferences={list:[],progress:{},titles:{},meta:{}};
 durable=true;
 constructor(private storage:()=>Storage=()=>localStorage){
  try {
   const v=JSON.parse(this.storage().getItem(MOVIES_KEY)||'null');
   if(v&&Array.isArray(v.list)&&v.list.every((id:unknown)=>typeof id==='string'))this.data.list=v.list.slice(0,200);
   if(v?.progress&&typeof v.progress==='object')for(const [key,time] of Object.entries(v.progress))if(KEY.test(key)&&typeof time==='number'&&Number.isFinite(time)&&time>=0)this.data.progress[key]=time;
   for(const [id,value] of Object.entries(isRecord(v?.titles)?v.titles:{})){const snapshot=parseSnapshot(id,value);if(snapshot)this.data.titles[id]=snapshot;}
   for(const [key,value] of Object.entries(isRecord(v?.meta)?v.meta:{})){const meta=KEY.test(key)?parseMeta(value):undefined;if(meta)this.data.meta[key]=meta;}
   if(isProvider(v?.provider))this.data.provider=v.provider;
   // Only a read that succeeded may be written back, so unreadable storage is left exactly as found.
   this.write();
  }catch{this.durable=false;}
 }
 private write(){
  // Snapshots stay only while their title is listed or has a saved position, and never beyond the cap.
  const live=new Set([...this.data.list,...Object.keys(this.data.progress).map(idOf)]);
  for(const id of Object.keys(this.data.titles))if(!live.has(id))delete this.data.titles[id];
  for(const id of Object.keys(this.data.titles).slice(0,-MAX_SNAPSHOTS))delete this.data.titles[id];
  try{this.storage().setItem(MOVIES_KEY,JSON.stringify(this.data));this.durable=true;}catch{this.durable=false;}
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
  this.data.progress[key]=time;
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
