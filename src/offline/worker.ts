// Registers public/sw.js and reports when a new version is ready. The new version never takes over
// by itself while the app is open: the player restarts from the library, and a game is never interrupted.
// Closing the app also lets it take over, because it then has no pages left to serve.
let registration:ServiceWorkerRegistration|undefined;
let applying=false;
let lastCheck=0;

export function updateWaiting():boolean{return !!registration?.waiting&&!!navigator.serviceWorker.controller;}

export async function registerWorker(onUpdate:()=>void):Promise<void>{
  if(!import.meta.env.PROD||!('serviceWorker' in navigator)||!isSecureContext)return;
  const base=new URL(import.meta.env.BASE_URL,location.href);
  try{registration=await navigator.serviceWorker.register(new URL('sw.js',base),{scope:base.href,updateViaCache:'none'});}
  catch{return;}
  const watch=(worker:ServiceWorker|null)=>worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&updateWaiting())onUpdate();});
  registration.addEventListener('updatefound',()=>watch(registration!.installing));
  watch(registration.installing);
  if(updateWaiting())onUpdate();
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(applying)location.reload();});
  // An installed app can stay open for days: look for a new version when it comes back to the front.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine&&Date.now()-lastCheck>3600000)void checkForUpdate();});
}

export async function checkForUpdate():Promise<boolean>{
  if(!registration)return false;
  lastCheck=Date.now();
  try{await registration.update();}catch{/* Offline or blocked: the current version keeps working. */}
  return updateWaiting()||!!registration.installing;
}

export function applyUpdate(){
  if(!registration?.waiting)return;
  applying=true;registration.waiting.postMessage({type:'SKIP_WAITING'});
}
