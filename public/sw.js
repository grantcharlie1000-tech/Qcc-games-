// Keep this recovery worker at the original URL so existing registrations update.
// Future caching workers must not store redirected responses: omit index.html
// from precache or rebuild the Response before storing it.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 for(const k of await caches.keys())if(k.startsWith('pocket-arcade'))await caches.delete(k);
 await self.clients.claim();
 const cs=await self.clients.matchAll({type:'window'});
 await self.registration.unregister();
 for(const c of cs){try{await c.navigate(c.url);}catch{}}
})()));
