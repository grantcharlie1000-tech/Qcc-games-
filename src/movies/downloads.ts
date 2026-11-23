// Offline copies of operator-approved Movies & TV files. Separate from the game download caches.
// Third-party iframe streams, DRM media and unreviewed sources are never downloaded.
import {licensedSource,mediaKey,parseTitle} from './model';
import type {LicensedMedia,MovieRoute,Title} from './model';

export const MEDIA_FILES='qcc:movies:downloads-files:v1';
export const MEDIA_META='qcc:movies:downloads-meta:v1';

export type MediaDownloadState='none'|'downloading'|'ready'|'failed';
export interface MediaDownloadStatus {state:MediaDownloadState;done:number;total:number;message?:string}
interface SavedMedia {key:string;path:string;source:LicensedMedia;title:Title;bytes:number;created:number}
const root=()=>new URL(import.meta.env.BASE_URL,location.href);
const at=(path:string)=>new URL(path,root()).href;
const recordUrl=(key:string)=>at('offline/media/'+encodeURIComponent(key)+'.json');
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});

function validRecord(value:unknown):SavedMedia|undefined {
 if(!value||typeof value!=='object'||Array.isArray(value))return;
 const item=value as Partial<SavedMedia>;
 const title=parseTitle(item.title,false,false);
 if(!title||typeof item.key!=='string'||typeof item.path!=='string'||!item.source)return;
 const route:MovieRoute=title.kind==='movie'?{id:title.id,play:false}:(()=>{
  const match=/^tv-[a-z0-9-]+:s([1-9]\d{0,3}):e([1-9]\d{0,3})$/.exec(item.key!);
  return {id:title.id,season:match?Number(match[1]):undefined,episode:match?Number(match[2]):undefined,play:false};
 })();
 const source=licensedSource([item.source],item.key);
 if(!source||source.path!==item.path||mediaKey(title,route)!==item.key||
  typeof item.bytes!=='number'||!Number.isSafeInteger(item.bytes)||item.bytes<1)return;
 return {key:item.key,path:item.path,source,title,bytes:item.bytes,created:typeof item.created==='number'?item.created:0};
}

export class MovieDownloads {
 readonly ready:Promise<void>;
 private records=new Map<string,SavedMedia>();
 private live=new Map<string,MediaDownloadStatus>();
 private controllers=new Map<string,AbortController>();
 private jobs=new Map<string,Promise<void>>();
 private listeners=new Set<(key:string)=>void>();

 static supported=()=>import.meta.env.PROD&&typeof caches!=='undefined'&&typeof navigator!=='undefined'&&
  'serviceWorker' in navigator&&typeof isSecureContext!=='undefined'&&isSecureContext;

 constructor(private enabled=MovieDownloads.supported()){
  this.ready=enabled?this.restore().catch(()=>{this.enabled=false;}):Promise.resolve();
 }
 subscribe(listener:(key:string)=>void){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
 private notify(key:string){for(const listener of this.listeners)listener(key);}
 private workerChanged(){
  if(typeof navigator!=='undefined'&&'serviceWorker' in navigator)navigator.serviceWorker.controller?.postMessage({type:'MOVIE_DOWNLOAD_CHANGED'});
 }
 status(key:string):MediaDownloadStatus{
  const live=this.live.get(key);if(live)return live;
  const saved=this.records.get(key);
  return saved&&this.source(key)?{state:'ready',done:saved.bytes,total:saved.bytes}:{state:'none',done:0,total:0};
 }
 source(key:string):LicensedMedia|undefined{
  const record=this.records.get(key);
  return record?licensedSource([record.source],key):undefined;
 }
 downloadedTitles():Title[]{
  const titles=new Map<string,Title>();
  for(const record of this.records.values())if(this.source(record.key))titles.set(record.title.id,record.title);
  return [...titles.values()];
 }
 private async restore(){
  const meta=await caches.open(MEDIA_META),files=await caches.open(MEDIA_FILES);
  for(const request of await meta.keys()){
   let record:SavedMedia|undefined;
   try {record=validRecord(await (await meta.match(request))?.json());}catch{/* Broken or removed metadata is not a download. */}
   if(record&&await files.match(at(record.path)))this.records.set(record.key,record);
   else await meta.delete(request);
  }
  await this.prune();
 }
 // A new operator licence registry can withdraw a title or change its file. Do not keep serving revoked copies.
 async reconcile(licenses:unknown){
  await this.ready;
  for(const [key,record] of [...this.records]){
   const current=licensedSource(licenses,key);
   if(!current||current.path!==record.path||current.expires!==record.source.expires||
    current.license!==record.source.license)await this.remove(key);
  }
 }
 async download(title:Title,route:MovieRoute,source:LicensedMedia):Promise<void>{
  await this.ready;
  const key=mediaKey(title,route),approved=licensedSource([source],key);
  if(!this.enabled)throw new Error('Offline downloads require a secure browser with Cache Storage.');
  if(!approved||!parseTitle(title,false,false))throw new Error('Only approved, licensed files can be downloaded.');
  if(this.jobs.has(key))return this.jobs.get(key)!;
  if(this.source(key))return;
  const controller=new AbortController();
  this.controllers.set(key,controller);
  const job=this.transfer(key,title,approved,controller);
  this.jobs.set(key,job);
  try{await job;}finally{this.jobs.delete(key);this.controllers.delete(key);}
 }
 private async transfer(key:string,title:Title,source:LicensedMedia,controller:AbortController){
  const url=at(source.path);
  let total=0,done=0;
  this.live.set(key,{state:'downloading',done,total});this.notify(key);
  try{
   // Same-origin only. A redirect, iframe, HTML page or partial response must never enter the cache.
   const response=await fetch(url,{cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal});
   const mime=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
   if(response.status!==200||response.type==='opaque'||response.redirected||!response.body||
    (mime!=='video/mp4'&&mime!=='video/webm'))throw new Error('The licensed video file is unavailable.');
   total=Number(response.headers.get('content-length'))||0;
   if(!Number.isSafeInteger(total)||total<0)total=0;
   if(total){
    const estimate=await navigator.storage?.estimate?.().catch(()=>undefined);
    if(estimate?.quota&&estimate.usage!==undefined&&estimate.quota-estimate.usage<total+1048576)
     throw new Error('Not enough storage on this device.');
   }
   void navigator.storage?.persist?.().catch(()=>false);
   const cache=await caches.open(MEDIA_FILES);
   const read=async()=>{
    const reader=response.body!.getReader();
    let lastUpdate=0;
    for(;;){
     const part=await reader.read();
     if(part.done)break;
     done+=part.value.byteLength;
     if(performance.now()-lastUpdate>180){
      lastUpdate=performance.now();this.live.set(key,{state:'downloading',done,total});this.notify(key);
     }
    }
   };
   const saving=cache.put(url,response.clone());
   try{await Promise.all([read(),saving]);}
   catch(error){controller.abort();await Promise.allSettled([saving]);await cache.delete(url);throw error;}
   if(!done||(total&&done!==total)){
    await cache.delete(url);throw new Error('Download incomplete. Try again.');
   }
   const snapshot=parseTitle(title,false,false)!;
   const record:SavedMedia={key,path:source.path,source,title:{...snapshot,related:undefined,cast:undefined},bytes:done,created:Date.now()};
   await (await caches.open(MEDIA_META)).put(recordUrl(key),json(record));
   this.records.set(key,record);this.live.delete(key);
   this.workerChanged();this.notify(key);
  }catch(error){
   this.live.set(key,controller.signal.aborted
    ?{state:'none',done:0,total:0}
    :{state:'failed',done:0,total:0,message:error instanceof Error?error.message:'Download failed. Try again.'});
   this.notify(key);throw error;
  }
 }
 cancel(key:string){this.controllers.get(key)?.abort();}
 async remove(key:string){
  this.cancel(key);
  await this.jobs.get(key)?.catch(()=>{});
  this.records.delete(key);this.live.delete(key);
  if(this.enabled){
   await (await caches.open(MEDIA_META)).delete(recordUrl(key));
   await this.prune();
  }
  this.workerChanged();this.notify(key);
 }
 private async prune(){
  const used=new Set([...this.records.values()].map(record=>at(record.path)));
  const cache=await caches.open(MEDIA_FILES);
  for(const request of await cache.keys())if(!used.has(request.url))await cache.delete(request);
 }
}

// Shared across MoviesView navigations, so an in-progress video download is never lost.
export const movieDownloads=new MovieDownloads();
