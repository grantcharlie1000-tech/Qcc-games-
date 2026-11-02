// Keep this recovery worker at the original URL so existing registrations update.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 // Storage policy must not prevent removal of a broken worker.
 try{
  const names=await caches.keys();
  await Promise.allSettled(names.map(async name=>caches.delete(name)));
 }catch{/* CacheStorage may be unavailable on managed devices. */}
 await self.clients.claim();
 await self.registration.unregister();
 const windows=await self.clients.matchAll({type:'window'});
 // A window can close between enumeration and navigation.
 await Promise.allSettled(windows.map(async client=>client.navigate(client.url)));
})()));
