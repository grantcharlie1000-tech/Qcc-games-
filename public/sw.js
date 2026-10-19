const VERSION='__ARCADE_VERSION__';
const PRECACHE=__ARCADE_PRECACHE__;
const PREFIX='pocket-arcade:'+new URL(self.registration.scope).pathname+':';
const SHELL=PREFIX+VERSION+':shell';
const PACK=PREFIX+VERSION+':pack';
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(SHELL);await cache.addAll(PRECACHE.map(path=>new URL(path,self.registration.scope).href));await self.skipWaiting();})());});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==SHELL&&key!==PACK)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 event.respondWith((async()=>{const shell=await caches.open(SHELL),pack=await caches.open(PACK);const hit=await shell.match(event.request)||await pack.match(event.request);
 if(event.request.mode==='navigate'){try{const response=await fetch(event.request);if(response.ok){await shell.put(event.request,response.clone());return response;}}catch{}return hit||await shell.match(new URL('index.html',self.registration.scope))||new Response('The arcade has not been downloaded on this device.',{status:503});}
 if(hit)return hit;try{const response=await fetch(event.request);if(response.ok)await shell.put(event.request,response.clone());return response;}catch{return new Response('This file has not been downloaded on this device.',{status:503});}
 })());});
