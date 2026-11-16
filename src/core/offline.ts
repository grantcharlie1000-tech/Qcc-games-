import type {GameId} from './types';

interface Pack {files:string[];bytes:number}
export interface OfflineManifest {version:string;shell:string[];games:Record<GameId,Pack>}
const base=()=>new URL(import.meta.env.BASE_URL,location.href);
const WORKER='offline-sw.js';
const COMPLETE='__qcc-offline-complete__';
const packName=(version:string,id:GameId)=>'qcc-offline-game:'+base().pathname+':'+version+':'+id;

export async function retireOffline():Promise<void>{
 // Only retire the broken November worker. Leave the new worker and other
 // first-party registrations alone on subsequent visits.
 try{
  if('serviceWorker' in navigator){
   const registrations=await navigator.serviceWorker.getRegistrations();
   await Promise.allSettled(registrations.filter(registration=>
    [registration.active,registration.waiting,registration.installing].some(worker=>
     worker&&new URL(worker.scriptURL).pathname.endsWith('/sw.js')
    )
   ).map(registration=>registration.unregister()));
  }
 }catch{/* Startup must not fail if browser policy denies registration access. */}
 try{
  if(typeof caches!=='undefined'){
   const names=await caches.keys();
   await Promise.allSettled(names.filter(name=>name.startsWith('pocket-arcade')).map(name=>caches.delete(name)));
  }
 }catch{/* Preserve user data and unrelated caches. */}
}

export async function startOffline():Promise<void>{
 await retireOffline();
 if(!import.meta.env.PROD||!('serviceWorker' in navigator))return;
 try{
  await navigator.serviceWorker.register(new URL(WORKER,base()),{scope:base().href,updateViaCache:'none'});
 }catch{/* Online games still work if service worker or storage is disabled. */}
}

export async function offlineManifest():Promise<OfflineManifest>{
 const response=await fetch(new URL('offline-packs.json',base()),{cache:'no-store'});
 if(!response.ok)throw new Error('Offline downloads are not available on this deployment.');
 const result=await response.json() as OfflineManifest;
 if(!result||typeof result.version!=='string'||!Array.isArray(result.shell)||!result.games)throw new Error('Invalid offline game list.');
 return result;
}

export async function downloadedGames(manifest:OfflineManifest):Promise<Set<GameId>>{
 if(!('caches' in window))return new Set();
 const names=new Set(await caches.keys());
 const found=new Set<GameId>();
 for(const id of Object.keys(manifest.games) as GameId[]){
  const name=packName(manifest.version,id);
  if(!names.has(name))continue;
  const cache=await caches.open(name);
  if(await cache.match(new URL(COMPLETE,base())))found.add(id);
 }
 return found;
}

async function activeOfflineWorker(version:string):Promise<void>{
 if(!('serviceWorker' in navigator)||!('caches' in window))throw new Error('Offline storage is not supported on this device.');
 await navigator.serviceWorker.register(new URL(WORKER,base()),{scope:base().href,updateViaCache:'none'});
 const ready=await Promise.race([
  navigator.serviceWorker.ready,
  new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Offline setup is not ready. Try again online.')),12000))
 ]);
 if(ready.scope!==base().href||!ready.active)throw new Error('Offline setup is not ready.');
 const versionReply=await new Promise<string>((resolve,reject)=>{
  const channel=new MessageChannel();
  const timeout=setTimeout(()=>{channel.port1.close();reject(new Error('Offline worker did not respond. Reopen QCC online.'));},4000);
  channel.port1.onmessage=event=>{clearTimeout(timeout);resolve(event.data?.version);channel.port1.close();};
  ready.active!.postMessage({type:'QCC_OFFLINE_VERSION'},[channel.port2]);
 });
 if(versionReply!==version)throw new Error('QCC has updated. Reopen it online before downloading games.');
}

export async function downloadGame(id:GameId,progress:(completed:number,total:number)=>void):Promise<void>{
 const manifest=await offlineManifest(),pack=manifest.games[id];
 if(!pack||!Array.isArray(pack.files))throw new Error('This game has no offline download.');
 await activeOfflineWorker(manifest.version);
 const cacheName=packName(manifest.version,id);
 const existing=await downloadedGames(manifest);
 if(existing.has(id))return;
 const cache=await caches.open(cacheName);
 try{
  let completed=0;
  const files=[...new Set(pack.files)];
  for(const path of files){
   const url=new URL(path,base());
   if(url.origin!==location.origin||!url.href.startsWith(base().href))throw new Error('Unsafe offline game file.');
   const request=new Request(url,{cache:'reload'});
   const response=await fetch(request);
   if(!response.ok||response.redirected||response.url!==url.href)throw new Error('Could not download '+path+'. Check your connection.');
   await cache.put(url,response);
   progress(++completed,files.length);
  }
  await cache.put(new URL(COMPLETE,base()),new Response(manifest.version,{headers:{'Content-Type':'text/plain'}}));
 }catch(error){
  await caches.delete(cacheName);
  throw error;
 }
}

export async function removeDownloadedGame(id:GameId):Promise<void>{
 if(!('caches' in window))return;
 const names=await caches.keys();
 await Promise.all(names.filter(name=>name.startsWith('qcc-offline-game:'+base().pathname+':')&&name.endsWith(':'+id)).map(name=>caches.delete(name)));
}
