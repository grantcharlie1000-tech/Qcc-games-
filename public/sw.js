const VERSION='__ARCADE_VERSION__';
const PRECACHE=__ARCADE_PRECACHE__;
const PREFIX='pocket-arcade:'+new URL(self.registration.scope).pathname+':';
const SHELL=PREFIX+VERSION+':shell';
const PACK=PREFIX+VERSION+':pack';
// A waiting update activates after existing clients close, keeping their lazy chunks available.
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(SHELL);await cache.addAll(PRECACHE.map(path=>new URL(path,self.registration.scope).href));})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{try{for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==SHELL&&key!==PACK)await caches.delete(key);}catch{}await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='ARCADE_VERSION')event.ports[0]?.postMessage({version:VERSION});});
async function find(request){try{const shell=await caches.open(SHELL),pack=await caches.open(PACK);return await shell.match(request)||await pack.match(request);}catch{return undefined;}}
async function remember(request,response){try{const cache=await caches.open(SHELL);await cache.put(request,response);}catch{/* Caching must never prevent online gameplay. */}}
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 event.respondWith((async()=>{let hit=await find(event.request);
 // Keep a client's HTML, manifest and worker version coherent until the waiting update activates.
 if(event.request.mode==='navigate'&&!hit)hit=await find(new URL('index.html',self.registration.scope));
 if(hit)return hit;
 try{const response=await fetch(event.request);if(response.ok)event.waitUntil(remember(event.request,response.clone()));return response;}
 catch{return new Response('This file has not been downloaded on this device.',{status:503});}
 })());});
