// Recovery also runs when the app reaches the network before sw.js updates.
// Never register a replacement worker here.
export async function retireOffline():Promise<void>{
 try{
  if('serviceWorker' in navigator){
   const registrations=await navigator.serviceWorker.getRegistrations();
   await Promise.allSettled(registrations.map(async registration=>registration.unregister()));
  }
 }catch{/* Browser policy can deny access to registrations. */}
 try{
  if(typeof caches!=='undefined'){
   const names=await caches.keys();
   await Promise.allSettled(names.map(async name=>caches.delete(name)));
  }
 }catch{/* Cleanup must never prevent the rest of the app from starting. */}
}

