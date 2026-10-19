export async function registerOffline():Promise<void> { if('serviceWorker' in navigator && import.meta.env.PROD) {try{await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,{scope:import.meta.env.BASE_URL});}catch{/* Status in menu explains unavailable support. */}} }
export async function cacheAll(progress:(done:number,total:number)=>void):Promise<number> {
  if(!('serviceWorker' in navigator)||!('caches' in window))throw new Error('Offline storage is unavailable in this browser.');
  await registerOffline();
  await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Offline caching is blocked or unavailable on this device.')),12000))]);
  const base=new URL(import.meta.env.BASE_URL,location.href),res=await fetch(new URL('offline-manifest.json',base));
  if(!res.ok)throw new Error('Build the production app to download the offline pack.');
  const manifest=await res.json() as {version:string;files:string[]};
  const cache=await caches.open('pocket-arcade:'+base.pathname+':'+manifest.version+':pack');let done=0;
  for(const file of manifest.files){const url=new URL(file,base);const result=await fetch(url,{cache:'reload'});if(!result.ok)throw new Error('Could not download '+file+'. Try again when online.');await cache.put(url,result);progress(++done,manifest.files.length);}
  return done;
}
