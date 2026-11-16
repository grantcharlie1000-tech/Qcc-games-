// A separate worker URL keeps /sw.js as the recovery kill-switch for old clients.
// Explicit game packs live in CacheStorage. This worker never caches redirects as
// navigations, which was the cause of the 2 November returning-visitor failure.
const VERSION='__QCC_VERSION__';
const SCOPE=self.registration.scope;
const SHELL='qcc-offline-shell:'+new URL(SCOPE).pathname+':'+VERSION;
const ROOT=new URL('./',SCOPE).href;

async function safeResponse(response){
 if(!response.ok||response.type==='opaque')throw new Error('Offline asset unavailable');
 if(!response.redirected)return response;
 // A redirected Response used for a navigation is rejected by WebKit/Chromium.
 // Reconstruct it with the final body, but without the redirected flag.
 const headers=new Headers(response.headers);
 headers.delete('content-encoding');headers.delete('content-length');
 return new Response(await response.blob(),{status:response.status,statusText:response.statusText,headers});
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const manifestRequest=new Request(new URL('offline-packs.json',SCOPE),{cache:'reload'});
 const response=await fetch(manifestRequest);
 if(!response.ok)throw new Error('Offline pack list unavailable');
 const manifest=await response.json();
 if(manifest.version!==VERSION||!Array.isArray(manifest.shell)||manifest.shell.length===0)throw new Error('Offline pack mismatch');
 const cache=await caches.open(SHELL);
 for(const path of manifest.shell){
  const url=new URL(path,SCOPE);
  if(url.origin!==self.location.origin||!url.href.startsWith(SCOPE))throw new Error('Unsafe offline path');
  const request=new Request(url,{cache:'reload'});
  const asset=await safeResponse(await fetch(request));
  await cache.put(url,asset);
 }
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(event.data?.type==='QCC_OFFLINE_VERSION')event.ports[0]?.postMessage({version:VERSION});
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(SCOPE))return;
 if(request.mode==='navigate'){
  event.respondWith((async()=>{
   try{
    const online=await fetch(request);
    if(online.ok)return online;
    if(online.status<500)return online;
   }catch{}
   const cached=await(await caches.open(SHELL)).match(ROOT);
   return cached||new Response('Offline shell unavailable',{status:503});
  })());
  return;
 }
 const path=url.pathname.slice(new URL(SCOPE).pathname.length);
 // Never cache private account, leaderboard, movie, chat or multiplayer traffic.
 if(!/^(?:assets\/|game-art\/|audio\/|chess-engines\/|icon\.svg$|manifest\.webmanifest$|offline-packs\.json$)/.test(path))return;
 if(path==='offline-packs.json'){
  event.respondWith((async()=>{try{const response=await fetch(request);if(response.ok)return response;}catch{}return await caches.match(request)||new Response('Unavailable',{status:503});})());
  return;
 }
 event.respondWith((async()=>{
  // Bundled Vite assets are immutable hashes; unversioned artwork and engines
  // prefer the network so online players see the latest files.
  if(path.startsWith('assets/')){const local=await caches.match(request);if(local)return local;}
  try{const response=await fetch(request);if(response.ok||response.status<500)return response;}catch{}
  return await caches.match(request)||new Response('This game is not downloaded',{status:503});
 })());
});
