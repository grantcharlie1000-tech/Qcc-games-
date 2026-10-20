const VERSION='__ARCADE_VERSION__';
const PRECACHE=__ARCADE_PRECACHE__;
const SCOPE=self.registration.scope;
const PREFIX='pocket-arcade:'+new URL(SCOPE).pathname+':';
const SHELL=PREFIX+VERSION+':shell',PACK=PREFIX+VERSION+':pack';
const ENTRY=new URL(PRECACHE.find(path=>path.endsWith('.js')),SCOPE).href;
const STATE=new URL('.arcade-update-state',SCOPE).href;
const scoped=key=>typeof key==='string'&&key.startsWith(PREFIX)&&/:(shell|pack)$/.test(key);
const owned=key=>key.startsWith(PREFIX)&&key!==SHELL&&key!==PACK&&/:(shell|pack)$/.test(key);
let maintenance=Promise.resolve();
function serial(task){const pending=maintenance.then(task);maintenance=pending.catch(()=>{});return pending;}
async function state(){
 try{
  const cached=await(await caches.open(SHELL)).match(STATE);if(!cached)return;
  const value=await cached.json();
  if(value.version!==VERSION||value.entry!==ENTRY||!Array.isArray(value.stale)||!value.stale.every(key=>typeof key==='string'&&owned(key))
   ||!Array.isArray(value.pinned)||!value.pinned.every(scoped)
   ||!(value.legacy===null||Array.isArray(value.legacy)&&value.legacy.every(id=>typeof id==='string'))
   ||!Array.isArray(value.current)||!value.current.every(id=>typeof id==='string')
   ||!Array.isArray(value.pending)||!value.pending.every(item=>typeof item.id==='string'&&typeof item.entry==='string')
   ||!Array.isArray(value.owners)||!value.owners.every(item=>typeof item.id==='string'&&typeof item.entry==='string')
   ||!Array.isArray(value.assets)||!value.assets.every(item=>typeof item.entry==='string'&&Array.isArray(item.keys)&&item.keys.every(scoped)))return;
  return value;
 }catch{return;}
}
async function persist(value){await(await caches.open(SHELL)).put(STATE,Response.json(value));}
function hasEntry(html,entry=ENTRY){return [...html.matchAll(/<script\b([^>]*)>/gi)].some(([,attributes])=>{const src=attributes.match(/\bsrc=["']([^"']+)["']/i);return /\btype=["']module["']/i.test(attributes)&&src&&new URL(src[1],SCOPE).href===entry;});}
async function predecessor(active){
 if(!active)return;
 return new Promise(resolve=>{
  const channel=new MessageChannel();
  const finish=value=>{clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(value);};
  const timer=setTimeout(()=>finish(undefined),3000);
  channel.port1.onmessage=event=>finish(event.data);
  try{active.postMessage({type:'ARCADE_VERSION'},[channel.port2]);}catch{finish(undefined);}
 });
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 // Immutable candidate snapshot: runtime cleanup never enumerates future installs.
 const stale=(await caches.keys()).filter(owned),previous=await predecessor(self.registration.active);
 // Include the known predecessor pack even if its user starts a download during install.
 const prior=previous&&typeof previous.version==='string'&&/^[A-Za-z0-9_-]+$/.test(previous.version)?{version:previous.version,entry:previous.entry,shell:PREFIX+previous.version+':shell',pack:PREFIX+previous.version+':pack'}:undefined;
 if(prior)for(const key of [prior.shell,prior.pack])if(owned(key)&&!stale.includes(key))stale.push(key);
 const cache=await caches.open(SHELL);
 await cache.addAll(PRECACHE.map(path=>new Request(new URL(path,SCOPE),{cache:'reload'})));
 const manifest=await cache.match(new URL('offline-manifest.json',SCOPE));
 if(!manifest)throw new Error('Update manifest missing');
 const pack=await manifest.json();
 if(pack.version!==VERSION||!Array.isArray(pack.files)||!pack.files.some(path=>new URL(path,SCOPE).href===ENTRY))throw new Error('Update manifest does not match this worker');
 const required=pack.files.filter(path=>/^assets\/.*\.(?:m?js|css)$/.test(path));
 if(required.some(path=>!PRECACHE.includes(path)))throw new Error('Update runtime assets are incomplete');
 for(const path of required)if(!await cache.match(new URL(path,SCOPE)))throw new Error('Update runtime asset missing');
 for(const path of ['./','index.html']){const page=await cache.match(new URL(path,SCOPE));if(!page||!hasEntry(await page.text()))throw new Error('Update HTML does not match this worker');}
 await persist({version:VERSION,entry:ENTRY,stale,pinned:[],previous:prior,unknownPrevious:!!self.registration.active&&!prior,legacy:null,current:[],pending:[],owners:[],assets:[{entry:ENTRY,keys:[SHELL,PACK]}]});
 // Activation changes controllers, never documents. All old immutable assets
 // remain protected until their document/navigation ownership is accounted for.
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(serial(async()=>{
 try{
  // The browser terminates the predecessor before dispatching activate. Read its
  // final durable ledger here, not during install when it can still serve HTML.
  const value=await state();if(!value)return;
  if(value.previous?.entry){
   const prior=await(await caches.open(value.previous.shell)).match(STATE),old=prior&&await prior.json();
   if(old?.version===value.previous.version&&old.entry===value.previous.entry&&Array.isArray(old.pinned)&&old.pinned.every(scoped)&&Array.isArray(old.pending)&&old.pending.every(item=>typeof item.id==='string'&&typeof item.entry==='string')&&Array.isArray(old.current)&&old.current.every(id=>typeof id==='string')&&Array.isArray(old.legacy)&&old.legacy.every(id=>typeof id==='string')&&Array.isArray(old.owners)&&old.owners.every(item=>typeof item.id==='string'&&typeof item.entry==='string')&&Array.isArray(old.assets)&&old.assets.every(item=>typeof item.entry==='string'&&Array.isArray(item.keys)&&item.keys.every(scoped))){
    value.pinned=old.pinned;value.pending=old.pending;value.legacy=[...old.current,...old.legacy];value.owners=old.owners;value.assets.push(...old.assets);
   }else value.pinned=value.stale; // Lost/malformed metadata must retain everything.
  }else if(value.previous||value.unknownPrevious)value.pinned=value.stale;
  await self.clients.claim();
  const clients=await self.clients.matchAll({type:'window'});value.legacy=[...new Set([...(value.legacy||[]),...clients.map(client=>client.id)])];value.current=[];
  await persist(value);
 }catch{/* Missing protection metadata always means retain old caches. */}
})));
async function collect(ack){
 const value=await state();if(!value||value.legacy===null)return;
 const clients=await self.clients.matchAll({type:'window'}),live=new Set(clients.map(client=>client.id));
 const known=await Promise.all([...new Set([...value.current,...value.legacy])].map(async id=>await self.clients.get(id)?id:undefined));
 const ready=new Set(known.filter(Boolean));
 value.current=value.current.filter(id=>ready.has(id));
 value.legacy=[...new Set([...ready,...live].filter(id=>!value.current.includes(id)))];
 value.owners=value.owners.filter(item=>ready.has(item.id)||live.has(item.id));
 if(ack){
  // Message source is the actual ready document, even if it closed before this
  // queued maintenance turn. Its ACK settles its reservation; get() separately
  // proves whether that known-ready source still needs its old dependencies.
  value.pending=value.pending.filter(item=>item.id!==ack.id||(ack.entry!==item.entry&&ack.entry!==ENTRY));
  const source=await self.clients.get(ack.id);
  value.owners=value.owners.filter(item=>item.id!==ack.id);
  value.legacy=value.legacy.filter(id=>id!==ack.id);value.current=value.current.filter(id=>id!==ack.id);
  if(source){
   value.owners.push({id:ack.id,entry:ack.entry});
   if(ack.entry===ENTRY)value.current.push(ack.id);else value.legacy.push(ack.id);
  }
 }
 await persist(value);
 const entries=[...value.pending.map(item=>item.entry)];
 for(const id of value.legacy){const owner=value.owners.find(item=>item.id===id);if(!owner)return;entries.push(owner.entry);}
 const protectedKeys=new Set(value.pinned);
 for(const entry of entries){const generation=value.assets.find(item=>item.entry===entry);if(!generation)return;for(const key of generation.keys)protectedKeys.add(key);}
 // An unresolved B navigation protects B, not every unrelated later generation.
 const obsolete=value.stale.filter(key=>!protectedKeys.has(key));
 // Retire candidates durably before deletion. A later rollback may recreate
 // the same version name; another ACK/restart must not delete that new cache.
 // Failure to delete can leak an old cache, which is safer than retrying a
 // destructive operation against a name that may now belong to a new install.
 value.stale=value.stale.filter(key=>protectedKeys.has(key));await persist(value);
 for(const key of obsolete)await caches.delete(key);
}
self.addEventListener('message',event=>{
 if(event.data?.type==='ARCADE_ACTIVATE'&&event.data.version===VERSION&&event.data.entry===ENTRY)event.waitUntil(self.skipWaiting());
 if(event.data?.type==='ARCADE_VERSION')event.ports[0]?.postMessage({version:VERSION,entry:ENTRY});
 if(event.data?.type==='ARCADE_CLIENT_READY'&&event.source?.id)event.waitUntil(serial(()=>collect({id:event.source.id,entry:event.data.entry})).catch(()=>{}));
});
async function own(request){try{const shell=await caches.open(SHELL),pack=await caches.open(PACK);return await shell.match(request)||await pack.match(request);}catch{return;}}
function immutable(url){const relative=url.pathname.slice(new URL(SCOPE).pathname.length);return /^assets\/[^/]+-[A-Za-z0-9_-]{6,}\.(?:m?js|css|woff2?|ttf|png|webp|svg)$/.test(relative);}
async function retained(request,url){if(!immutable(url))return;try{for(const key of (await caches.keys()).filter(owned)){const response=await(await caches.open(key)).match(request);if(response)return response;}}catch{}return;}
async function remember(request,response){try{await(await caches.open(SHELL)).put(request,response);}catch{/* Caching must never prevent online gameplay. */}}
async function navigation(event){
 return serial(async()=>{
  const value=await state();if(!value)throw new Error('Navigation protection unavailable');
  if(!event.resultingClientId)throw new Error('Navigation client unavailable');
  value.pending=[...value.pending.filter(item=>item.id!==event.resultingClientId),{id:event.resultingClientId,entry:ENTRY}];
  await persist(value); // Do not emit old HTML without a durable reservation.
  const page=await own(new URL('index.html',SCOPE).href);if(!page)throw new Error('Shell unavailable');return page;
 });
}
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(SCOPE))return;
 event.respondWith((async()=>{
  try{
   if(event.request.mode==='navigate')return await navigation(event);
   const hit=await own(event.request)||await retained(event.request,url);if(hit)return hit;
   const response=await fetch(event.request);if(!response.ok)return response;
   if(url.href===new URL('offline-manifest.json',SCOPE).href&&(await response.clone().json()).version!==VERSION)return new Response('An arcade update is being prepared. Try again when online.',{status:503});
   event.waitUntil(remember(event.request,response.clone()));return response;
  }catch{return new Response('This file is unavailable on this device. Try refreshing when online.',{status:503});}
 })());
});
