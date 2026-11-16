// Game downloads for offline play. The service worker (public/sw.js) serves what this stores.
// Files live in one shared cache, so games that share code (Three.js, physics) store it once.
// Each stored file carries its SHA-256 in an x-qcc-sha256 header. A game is only marked ready
// after every file it lists has been fetched, checked against the build's size and hash, and found again.
import type {GameId} from '../core/types';

export interface PackFile {path:string;size:number;sha256:string}
export interface Packs {version:string;shell:PackFile[];games:Record<string,{files:PackFile[];size:number}>}
export type State='none'|'queued'|'downloading'|'ready'|'update'|'failed';
export interface Status {state:State;done:number;total:number;message?:string}
interface Saved {id:string;state:'partial'|'ready'|'stale';version:string;size:number;files:string[]}

export const FILES='pocket-arcade-v3:files',META='pocket-arcade-v3:meta';
const base=()=>new URL(import.meta.env.BASE_URL,location.href);
const at=(path:string)=>new URL(path,base()).href;
const recordUrl=(id:string)=>at(`offline/game/${id}.json`);
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
export const megabytes=(bytes:number)=>{
  if(bytes<=0)return '0 MB';
  if(bytes>=1073741824)return `${(bytes/1073741824).toFixed(1)} GB`;
  const mb=bytes/1048576;
  return `${mb<.1?'0.1':mb.toFixed(mb<100?1:0)} MB`;
};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function sha256(data:ArrayBuffer):Promise<string>{
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function has(cache:Cache,file:PackFile):Promise<boolean>{
  return (await cache.match(at(file.path)))?.headers.get('x-qcc-sha256')===file.sha256;
}
async function pool<T>(items:T[],limit:number,task:(item:T)=>Promise<void>){
  let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length)await task(items[next++]);}));
}
class Cancelled extends Error {}
const quota=(error:unknown)=>error instanceof DOMException&&error.name==='QuotaExceededError';

export class Downloads {
  packs:Packs|undefined;
  private saved=new Map<string,Saved>();
  private live=new Map<string,Status>();
  private queue:GameId[]=[];
  private running:GameId|undefined;
  private cancelled=new Set<string>();
  private listeners=new Set<(id?:GameId)=>void>();
  private updateWaiting:()=>boolean;
  readonly ready:Promise<void>;
  /** Downloads need Cache Storage and a service worker to serve them, so only production builds offer them. */
  static supported=():boolean=>import.meta.env.PROD&&typeof caches!=='undefined'&&'serviceWorker' in navigator&&isSecureContext;

  constructor(updateWaiting:()=>boolean=()=>false){
    this.updateWaiting=updateWaiting;
    this.ready=Downloads.supported()?this.load().catch(()=>{}):Promise.resolve();
  }
  subscribe(listener:(id?:GameId)=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
  private emit(id?:GameId){for(const listener of this.listeners)listener(id);}

  private async load(){
    // From the worker's cache when offline, so sizes and file lists match the running version.
    this.packs=await (await fetch(at('offline/packs.json'))).json() as Packs;
    const meta=await caches.open(META);
    for(const request of await meta.keys()){
      const record=await (await meta.match(request))?.json() as Saved|undefined;
      if(record?.id)this.saved.set(record.id,record);
    }
    this.emit();
  }

  size(id:GameId):number{return this.packs?.games[id]?.size??0;}
  status(id:GameId):Status{
    const live=this.live.get(id);if(live)return live;
    const total=this.size(id),record=this.saved.get(id);
    if(!record)return {state:'none',done:0,total};
    if(record.state==='ready')return {state:'ready',done:total,total};
    if(record.state==='stale')return {state:'update',done:0,total,message:'Download again to keep playing offline.'};
    return {state:'failed',done:0,total,message:'Download stopped. Tap to resume.'};
  }
  hasAny():boolean{return this.saved.size>0||this.queue.length>0||!!this.running;}
  downloaded():GameId[]{return [...this.saved.values()].filter(record=>record.state==='ready').map(record=>record.id as GameId);}
  /** Bytes stored for finished downloads, counting shared files once. */
  storedBytes():number{
    const sizes=new Map<string,number>();
    for(const id of this.downloaded())for(const file of this.packs?.games[id]?.files??[])sizes.set(file.path,file.size);
    return [...sizes.values()].reduce((sum,size)=>sum+size,0);
  }

  download(id:GameId){
    if(!this.packs?.games[id]||this.running===id||this.queue.includes(id))return;
    this.cancelled.delete(id);this.queue.push(id);
    this.live.set(id,{state:'queued',done:0,total:this.size(id)});this.emit(id);
    void this.pump();
  }
  private async pump(){
    if(this.running)return;
    while(this.queue.length){
      const id=this.running=this.queue.shift()!;
      try{await this.fetchGame(id);this.live.delete(id);}
      catch(error){
        if(error instanceof Cancelled||this.cancelled.has(id))this.live.delete(id);
        else this.live.set(id,{state:'failed',done:0,total:this.size(id),message:quota(error)?'Not enough storage on this device.':error instanceof TypeError?'No connection. Try again.':error instanceof Error&&error.message?error.message:'Download failed. Try again.'});
      }
      this.running=undefined;this.emit(id);
    }
  }
  private async fetchGame(id:GameId){
    const packs=this.packs!,pack=packs.games[id];
    if(this.updateWaiting())throw new Error('Restart the app to finish its update first.');
    const files=await caches.open(FILES),meta=await caches.open(META);
    // Listed first, so storage cleanup keeps these files while they download, and a stop can resume.
    const record:Saved={id,state:'partial',version:packs.version,size:pack.size,files:pack.files.map(file=>file.path)};
    await meta.put(recordUrl(id),json(record));this.saved.set(id,record);
    let done=0;const missing:PackFile[]=[];
    for(const file of pack.files)if(await has(files,file))done+=file.size;else missing.push(file);
    const need=pack.size-done;
    const estimate=await navigator.storage?.estimate?.().catch(()=>undefined);
    if(estimate?.quota&&estimate.usage!==undefined&&estimate.quota-estimate.usage<need)throw new Error(`Not enough storage. Needs ${megabytes(need)}.`);
    // Asks the browser to keep this data. Safari may still remove it when the device is low on space.
    void navigator.storage?.persist?.().catch(()=>false);
    // One failure stops the whole run: the other fetches stop taking files and stop reporting progress.
    const run={stopped:false};
    let shown=0;
    const progress=()=>{if(run.stopped)return;if(done-shown>65536||done===pack.size){shown=done;this.live.set(id,{state:'downloading',done,total:pack.size});this.emit(id);}};
    this.live.set(id,{state:'downloading',done,total:pack.size});this.emit(id);
    await pool(missing,4,async file=>{
      for(let attempt=0;!run.stopped;attempt++){
        let counted=0;
        try{await this.fetchFile(id,files,file,()=>run.stopped,bytes=>{counted+=bytes;done+=bytes;progress();});return;}
        catch(error){
          done-=counted;
          if(error instanceof Cancelled||this.cancelled.has(id)||quota(error)||attempt>=2){run.stopped=true;throw error;}
          await sleep(1000*2**attempt);
        }
      }
    });
    for(const file of pack.files)if(!await has(files,file))throw new Error('Download incomplete. Try again.');
    if(this.cancelled.has(id)||!this.saved.has(id))throw new Cancelled();
    const finished:Saved={...record,state:'ready'};
    await meta.put(recordUrl(id),json(finished));this.saved.set(id,finished);
  }
  private async fetchFile(id:GameId,cache:Cache,file:PackFile,stopped:()=>boolean,onBytes:(bytes:number)=>void){
    // The query skips the worker's copy and any HTTP cache, so an outdated file is never stored again.
    const response=await fetch(at(file.path)+'?v='+file.sha256.slice(0,12),{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw new Error(`Download failed (${response.status}). Try again.`);
    const body=new Uint8Array(file.size);let length=0;
    const reader=response.body!.getReader();
    for(;;){
      if(this.cancelled.has(id)||stopped()){void reader.cancel();throw new Cancelled();}
      const {done,value}=await reader.read();if(done)break;
      if(length+value.length>file.size)throw new Error('A file did not match this version. Try again.');
      body.set(value,length);length+=value.length;onBytes(value.length);
    }
    if(length!==file.size||await sha256(body.buffer)!==file.sha256)throw new Error('A file did not match this version. Try again.');
    if(this.cancelled.has(id)||stopped())throw new Cancelled();
    const headers:Record<string,string>={'x-qcc-sha256':file.sha256};
    const type=response.headers.get('content-type');if(type)headers['content-type']=type;
    await cache.put(at(file.path),new Response(body,{headers}));
  }

  /** Confirm a finished download still has every file it recorded; the browser may have removed some.
   * Its own list, not this page's: after a deploy the worker brings downloads up to date before it takes over. */
  async verify(id:GameId):Promise<boolean>{
    const record=this.saved.get(id);
    if(!record||record.state!=='ready')return false;
    const files=await caches.open(FILES);
    for(const path of record.files)if(!await files.match(at(path))){
      const stale:Saved={...record,state:'stale'};
      await (await caches.open(META)).put(recordUrl(id),json(stale));this.saved.set(id,stale);this.emit(id);
      return false;
    }
    return true;
  }
  async verifyAll(){for(const id of this.downloaded())await this.verify(id);}

  async remove(id:GameId){
    if(this.running===id||this.queue.includes(id)){this.cancelled.add(id);this.queue=this.queue.filter(queued=>queued!==id);}
    await (await caches.open(META)).delete(recordUrl(id));
    this.saved.delete(id);this.live.delete(id);
    await this.prune();this.emit(id);
  }
  async removeAll(){
    for(const id of [...this.saved.keys(),...this.queue,...(this.running?[this.running]:[])])this.cancelled.add(id);
    this.queue=[];
    await caches.delete(META);this.saved.clear();this.live.clear();
    await this.prune();this.emit();
  }
  /** Delete stored files that no download still lists. */
  private async prune(){
    // A waiting version has already stored files for its own records; it cleans up when it takes over.
    if(this.updateWaiting())return;
    const keep=new Set<string>();
    const meta=await caches.open(META);
    for(const request of await meta.keys())for(const path of ((await (await meta.match(request))?.json()) as Saved|undefined)?.files??[])keep.add(at(path));
    const files=await caches.open(FILES);
    for(const request of await files.keys())if(!keep.has(request.url))await files.delete(request);
  }
}
