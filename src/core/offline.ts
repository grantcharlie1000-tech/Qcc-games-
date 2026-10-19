export async function registerOffline():Promise<void> { if('serviceWorker' in navigator && import.meta.env.PROD) {try{await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,{scope:import.meta.env.BASE_URL});}catch{/* Status in menu explains unavailable support. */}} }
export async function cacheAll(progress:(done:number,total:number)=>void):Promise<number> {
  if(!('serviceWorker' in navigator)||!('caches' in window))throw new Error('Offline storage is unavailable in this browser.');
  await registerOffline();
  const registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Offline caching is blocked or unavailable on this device.')),12000))]) as ServiceWorkerRegistration;
  const base=new URL(import.meta.env.BASE_URL,location.href);
  if(registration.scope!==base.href)throw new Error('Offline caching could not start for this arcade address.');
  const res=await fetch(new URL('offline-manifest.json',base));
  if(!res.ok)throw new Error('Build the production app to download the offline pack.');
  const manifest=await res.json() as {version:string;files:string[]};
  const activeVersion=await new Promise<string>((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();reject(new Error('Close all arcade tabs and reopen before downloading this version.'));},3000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data.version);};registration.active?.postMessage({type:'ARCADE_VERSION'},[channel.port2]);});
  if(activeVersion!==manifest.version)throw new Error('Close all arcade tabs and reopen before downloading this version.');
  const cache=await caches.open('pocket-arcade:'+base.pathname+':'+manifest.version+':pack');let done=0;
  for(const file of manifest.files){const url=new URL(file,base);const result=await fetch(url,{cache:'reload'});if(!result.ok)throw new Error('Could not download '+file+'. Try again when online.');await cache.put(url,result);progress(++done,manifest.files.length);}
  return done;
}
