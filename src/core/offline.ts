export type UpdateStatus={available:boolean;message:string};
type WorkerBuild={version:string;entry?:string};
const base=()=>new URL(import.meta.env.BASE_URL,location.href);
let runningEntry:string|undefined;
let listening=false;
let registration:Promise<ServiceWorkerRegistration|undefined>|undefined;
let checking:Promise<void>|undefined;
let listener:(status:UpdateStatus)=>void=()=>{};
let available=false;
function build(worker:ServiceWorker):Promise<WorkerBuild>{
  return new Promise((resolve,reject)=>{
    const channel=new MessageChannel();
    const finish=()=>{clearTimeout(timer);channel.port1.close();channel.port2.close();};
    const timer=setTimeout(()=>{finish();reject(new Error('The update check did not respond. Try again when online.'));},3000);
    channel.port1.onmessage=event=>{finish();resolve(event.data as WorkerBuild);};
    try{worker.postMessage({type:'ARCADE_VERSION'},[channel.port2]);}catch(error){finish();reject(error);}
  });
}
type OfferedUpdate={worker:ServiceWorker;version:string;entry:string};
let offered:OfferedUpdate|undefined;
let inspection=0;
const watchedRegistrations=new WeakSet<ServiceWorkerRegistration>(),watchedWorkers=new WeakSet<ServiceWorker>();
function deadline<T>(task:Promise<T>,milliseconds:number,message:string):Promise<T>{
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(message)),milliseconds);task.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
}
function coherent(value:WorkerBuild):value is {version:string;entry:string}{
  try{return typeof value.version==='string'&&!!value.version&&typeof value.entry==='string'&&value.entry.startsWith(new URL('assets/',base()).href)&&new URL(value.entry).pathname.endsWith('.js');}catch{return false;}
}
function watchRegistration(current:ServiceWorkerRegistration){
  const observe=()=>{for(const worker of [current.installing,current.waiting])if(worker&&!watchedWorkers.has(worker)){watchedWorkers.add(worker);worker.addEventListener('statechange',()=>{void inspect().catch(()=>{});});}};
  if(!watchedRegistrations.has(current)){watchedRegistrations.add(current);current.addEventListener('updatefound',observe);}
  observe();
}
async function currentRegistration(){
  const current=await deadline(navigator.serviceWorker.getRegistration(base().href),3000,'The update check did not respond. Try again when online.');
  if(current?.scope===base().href){watchRegistration(current);return current;}
}
async function inspect(){
  const token=++inspection,worker=navigator.serviceWorker.controller,entry=runningEntry;if(!entry)return;
  if(worker)worker.postMessage({type:'ARCADE_CLIENT_READY',entry});
  const active=worker?await build(worker):undefined,current=await currentRegistration(),waiting=current?.waiting;
  let nextOffer:OfferedUpdate|undefined;
  if(waiting&&waiting.scriptURL===new URL('sw.js',base()).href){const next=await build(waiting);if(coherent(next)&&next.entry!==entry)nextOffer={worker:waiting,...next};}
  if(token!==inspection||navigator.serviceWorker.controller!==worker||current?.waiting!==waiting)return;
  offered=nextOffer;available=!!offered||!!(active&&coherent(active)&&active.entry!==entry);
  listener({available,message:available?'An update is ready. Reload when you are ready; your game will be saved first.':''});
}
export async function activateUpdate():Promise<void>{
  const target=offered,initial=navigator.serviceWorker.controller;
  if(!target){
    if(initial){const active=await build(initial);if(coherent(active)&&active.entry!==runningEntry)return;}
    throw new Error('The update changed. Try again when online.');
  }
  if(initial){const active=await build(initial);if(active.version===target.version&&active.entry===target.entry)return;}
  const current=await currentRegistration();
  if(current?.waiting!==target.worker||target.worker.state!=='installed')throw new Error('The update changed. Try again when online.');
  const expected=await build(target.worker);
  if(expected.version!==target.version||expected.entry!==target.entry)throw new Error('The update changed. Try again when online.');
  await new Promise<void>((resolve,reject)=>{
    let finished=false;
    const finish=(error?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',verify);target.worker.removeEventListener('statechange',verify);error?reject(error):resolve();};
    const verify=()=>{void (async()=>{
      const controller=navigator.serviceWorker.controller;
      if(controller){const active=await build(controller);if(active.version===target.version&&active.entry===target.entry){finish();return;}}
      if(target.worker.state==='redundant'||controller!==initial)finish(new Error('The update changed. Try again when online.'));
    })().catch(()=>{});};
    const timer=setTimeout(()=>finish(new Error('The update could not start. Try again when online.')),12000);
    navigator.serviceWorker.addEventListener('controllerchange',verify);target.worker.addEventListener('statechange',verify);
    try{target.worker.postMessage({type:'ARCADE_ACTIVATE',version:target.version,entry:target.entry});verify();}catch{finish(new Error('The update could not start. Try again when online.'));}
  });
}
export function watchUpdates(entry:string,onStatus:(status:UpdateStatus)=>void){
  runningEntry=entry;listener=onStatus;
  // Ownership must not wait for register()/update(): a future installation can
  // be held by the network while this already-running document remains usable.
  if('serviceWorker' in navigator&&import.meta.env.PROD){try{navigator.serviceWorker.controller?.postMessage({type:'ARCADE_CLIENT_READY',entry});}catch{/* A changing controller is inspected again below. */}}
}
function listen(){
  if(!listening){
    listening=true;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{void inspect().catch(()=>{});});
    window.addEventListener('online',()=>void checkForUpdates());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkForUpdates();});
  }
}
export async function registerOffline():Promise<void>{
  if(!('serviceWorker' in navigator)||!import.meta.env.PROD)return;
  listen();
  if(!registration){
    const pending=navigator.serviceWorker.register(new URL('sw.js',base()),{scope:base().href,updateViaCache:'none'}).then(value=>{watchRegistration(value);return value;}).catch(()=>{if(registration===pending)registration=undefined;return undefined;});
    registration=pending;
  }
  await deadline(registration,12000,'The update check did not respond. Try again when online.');
}
export async function checkForUpdates():Promise<void>{
  if(!('serviceWorker' in navigator)||!import.meta.env.PROD)return;
  listen();
  if(checking)return checking;
  checking=(async()=>{
    try{
      await inspect();await registerOffline();const current=await registration;
      if(!current)throw new Error('Updates are unavailable in this browser. Try again when online.');
      await inspect();await deadline(current.update(),12000,'The update check did not respond. Try again when online.');await inspect();
    }catch{
      listener({available,message:available?'An update is ready. Reload when you are ready; your game will be saved first.':'Could not check for updates. Your current game remains available. Try again when online.'});
    }
  })().finally(()=>{checking=undefined;});
  return checking;
}
export async function cacheAll(progress:(done:number,total:number)=>void):Promise<number>{
  if(!('serviceWorker' in navigator)||!('caches' in window))throw new Error('Offline storage is unavailable in this browser.');
  await registerOffline();
  const ready=await new Promise<ServiceWorkerRegistration>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Offline caching is blocked or unavailable on this device.')),12000);
    navigator.serviceWorker.ready.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
  const address=base();
  if(ready.scope!==address.href)throw new Error('Offline caching could not start for this arcade address.');
  const res=await fetch(new URL('offline-manifest.json',address));
  if(!res.ok)throw new Error('Build the production app to download the offline pack.');
  const manifest=await res.json() as {version:string;files:string[]};
  if(!ready.active)throw new Error('Offline caching is not ready. Try again when online.');
  const active=await build(ready.active);
  if(active.version!==manifest.version||active.entry&&active.entry!==runningEntry)throw new Error('An update is ready. Reload from the menu before downloading the new offline pack.');
  const cache=await caches.open('pocket-arcade:'+address.pathname+':'+manifest.version+':pack');let done=0;
  for(const file of manifest.files){const url=new URL(file,address);const result=await fetch(url,{cache:'reload'});if(!result.ok)throw new Error('Could not download '+file+'. Try again when online.');await cache.put(url,result);progress(++done,manifest.files.length);}
  return done;
}
