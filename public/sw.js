const VERSION='__ARCADE_VERSION__';
const PRECACHE=__ARCADE_PRECACHE__;
const SCOPE=self.registration.scope;
const LEGACY_PREFIX='pocket-arcade:'+new URL(SCOPE).pathname+':';
const PREFIX='pocket-arcade-v2:'+new URL(SCOPE).pathname+':';
const SHELL=PREFIX+VERSION+':shell',PACK=PREFIX+VERSION+':pack';
const ENTRY=new URL(PRECACHE.find(path=>path.endsWith('.js')),SCOPE).href;
const STATE=new URL('.arcade-update-state',SCOPE).href;
function validEntry(entry){try{const url=new URL(entry);return typeof entry==='string'&&url.href===entry&&entry.startsWith(new URL('assets/',SCOPE).href)&&url.pathname.endsWith('.js')&&!url.search&&!url.hash;}catch{return false;}}
const legacyScoped=key=>typeof key==='string'&&key.startsWith(LEGACY_PREFIX)&&/:(shell|pack)$/.test(key);
const scoped=key=>typeof key==='string'&&(key.startsWith(PREFIX)||key.startsWith(LEGACY_PREFIX))&&/:(shell|pack)$/.test(key);
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
   ||!(value.early===undefined||Array.isArray(value.early)&&value.early.every(item=>typeof item.id==='string'&&validEntry(item.entry)))
   ||!Array.isArray(value.owners)||!value.owners.every(item=>typeof item.id==='string'&&typeof item.entry==='string')
   ||!Array.isArray(value.assets)||!value.assets.every(item=>typeof item.entry==='string'&&Array.isArray(item.keys)&&item.keys.every(scoped)))return;
  value.early??=[];return value;
 }catch{return;}
}
async function persist(value){await(await caches.open(SHELL)).put(STATE,Response.json(value));}
function hasEntry(html,entry=ENTRY){return [...html.matchAll(/<script\b([^>]*)>/gi)].some(([,attributes])=>{const src=attributes.match(/\bsrc=["']([^"']+)["']/i);return /\btype=["']module["']/i.test(attributes)&&src&&new URL(src[1],SCOPE).href===entry;});}
async function predecessor(active,message={type:'ARCADE_VERSION'}){
 if(!active)return;
 return new Promise(resolve=>{
  const channel=new MessageChannel();
  const finish=value=>{clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(value);};
  const timer=setTimeout(()=>finish(undefined),3000);
  channel.port1.onmessage=event=>finish(event.data);
  try{active.postMessage(message,[channel.port2]);}catch{finish(undefined);}
 });
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 // v2 is a top-level namespace: legacy activation cleanup cannot touch it.
 const target=self.registration.active,installing=self.registration.installing,waiting=self.registration.waiting;
 const ownsInstall=()=>!!installing&&self.registration.installing===installing&&installing.state==='installing'&&installing.scriptURL===self.location.href;
 const previous=await predecessor(target);
 const legacy=value=>!!value&&typeof value.version==='string'&&/^[A-Za-z0-9_-]+$/.test(value.version)&&Object.keys(value).length===1;
 const modern=previous?.cacheNamespace===2&&previous.cacheRetirement===1&&typeof previous.entry==='string'&&previous.entry.startsWith(new URL('assets/',SCOPE).href)&&previous.entry.endsWith('.js')&&typeof previous.version==='string'&&/^[A-Za-z0-9_-]+$/.test(previous.version);
 if(target&&!modern&&!legacy(previous))throw new Error('Predecessor protection is unavailable');
 const stable=()=>ownsInstall()&&self.registration.active===target&&(!target||target.state==='activated')&&self.registration.waiting===waiting;
 if(!stable())throw new Error('The predecessor changed during installation');
 if(modern){
  if(waiting||previous.version===VERSION)throw new Error('A modern waiting or same-version worker prevents safe cache reuse');
  // Serialize behind any predecessor deletion BEFORE opening/reusing our names.
  const keys=[SHELL,PACK],reply=await predecessor(target,{type:'ARCADE_RETIRE_CACHES',version:VERSION,entry:ENTRY,keys});
  if(!reply?.retired||!Array.isArray(reply.keys)||reply.keys.length!==2||reply.keys.some((key,index)=>key!==keys[index])||!stable())throw new Error('Predecessor cache retirement failed');
 }else if(waiting){
  // Only the demonstrated legacy-active + legacy-waiting pair is exempt.
  // Both legacy workers delete only the OLD prefix; v2 remains unreachable.
  if(!target||!legacy(previous)||!legacy(await predecessor(waiting))||!stable())throw new Error('Waiting worker protection is unavailable');
 }
 const names=await caches.keys();if(!stable())throw new Error('The predecessor changed before cache access');
 const stale=names.filter(owned),legacyPins=names.filter(legacyScoped);
 const prior=target?{version:previous.version,entry:modern?previous.entry:undefined,shell:(modern?PREFIX:LEGACY_PREFIX)+previous.version+':shell',pack:(modern?PREFIX:LEGACY_PREFIX)+previous.version+':pack'}:undefined;
 if(modern)for(const key of [prior.shell,prior.pack])if(owned(key)&&!stale.includes(key))stale.push(key);
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
 await persist({version:VERSION,entry:ENTRY,stale,pinned:modern?[]:legacyPins,previous:prior,unknownPrevious:false,legacy:null,current:[],pending:[],early:[],owners:[],assets:[{entry:ENTRY,keys:[SHELL,PACK]}]});
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
   if(old?.version===value.previous.version&&old.entry===value.previous.entry&&Array.isArray(old.pinned)&&old.pinned.every(scoped)&&Array.isArray(old.pending)&&old.pending.every(item=>typeof item.id==='string'&&typeof item.entry==='string')&&Array.isArray(old.current)&&old.current.every(id=>typeof id==='string')&&Array.isArray(old.legacy)&&old.legacy.every(id=>typeof id==='string')&&(old.early===undefined||Array.isArray(old.early)&&old.early.every(item=>typeof item.id==='string'&&validEntry(item.entry)))&&Array.isArray(old.owners)&&old.owners.every(item=>typeof item.id==='string'&&typeof item.entry==='string')&&Array.isArray(old.assets)&&old.assets.every(item=>typeof item.entry==='string'&&Array.isArray(item.keys)&&item.keys.every(scoped))){
    value.pinned=old.pinned;value.pending=old.pending;value.early=[...(old.early||[]),...value.early];value.legacy=[...old.current,...old.legacy];value.owners=old.owners;value.assets.push(...old.assets);
   }else value.pinned=value.stale; // Lost/malformed metadata must retain everything.
  }else if(value.previous||value.unknownPrevious)value.pinned=[...new Set([...value.pinned,...value.stale])];
  await self.clients.claim();
  const clients=await self.clients.matchAll({type:'window'});value.legacy=[...new Set([...(value.legacy||[]),...clients.map(client=>client.id)])];value.current=[];
  await persist(value);
  await collect(); // Direct drain: this activation already owns the serial turn.
 }catch{/* Missing protection metadata always means retain old caches. */}
})));
async function collect(ack){
 const value=await state();if(!value)return;
 if(value.legacy===null){
  // A claimed controller can receive ready messages before activate dispatch.
  // Keep the authenticated source durably; waiting on activation here would
  // deadlock the maintenance queue that activation itself must enter.
  if(ack){value.early=[...value.early.filter(item=>item.id!==ack.id),ack];await persist(value);}return;
 }
 const clients=await self.clients.matchAll({type:'window'}),live=new Set(clients.map(client=>client.id));
 const known=await Promise.all([...new Set([...value.current,...value.legacy])].map(async id=>await self.clients.get(id)?id:undefined));
 const ready=new Set(known.filter(Boolean));
 value.current=value.current.filter(id=>ready.has(id));
 value.legacy=[...new Set([...ready,...live].filter(id=>!value.current.includes(id)))];
 value.owners=value.owners.filter(item=>ready.has(item.id)||live.has(item.id));
 const acknowledgements=[...value.early,...(ack?[ack]:[])];value.early=[];
 for(const readyAck of acknowledgements){
  // Message source is the actual ready document, even if it closed before this
  // queued maintenance turn. Its ACK settles its reservation; get() separately
  // proves whether that known-ready source still needs its old dependencies.
  value.pending=value.pending.filter(item=>item.id!==readyAck.id||(readyAck.entry!==item.entry&&readyAck.entry!==ENTRY));
  const source=await self.clients.get(readyAck.id);
  value.owners=value.owners.filter(item=>item.id!==readyAck.id);
  value.legacy=value.legacy.filter(id=>id!==readyAck.id);value.current=value.current.filter(id=>id!==readyAck.id);
  if(source){
   value.owners.push({id:readyAck.id,entry:readyAck.entry});
   if(readyAck.entry===ENTRY)value.current.push(readyAck.id);else value.legacy.push(readyAck.id);
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
 if(event.data?.type==='ARCADE_VERSION')event.ports[0]?.postMessage({version:VERSION,entry:ENTRY,cacheNamespace:2,cacheRetirement:1});
 if(event.data?.type==='ARCADE_RETIRE_CACHES'){
  const data=event.data,port=event.ports[0],source=event.source;
  const keys=typeof data.version==='string'&&/^[A-Za-z0-9_-]+$/.test(data.version)?[PREFIX+data.version+':shell',PREFIX+data.version+':pack']:[];
  const valid=source&&source===self.registration.installing&&source.state==='installing'&&source.scriptURL===self.location.href&&data.version!==VERSION&&typeof data.entry==='string'&&data.entry.startsWith(new URL('assets/',SCOPE).href)&&data.entry.endsWith('.js')&&keys.length===2&&Array.isArray(data.keys)&&data.keys.length===2&&data.keys.every((key,index)=>key===keys[index]);
  event.waitUntil(serial(async()=>{
   if(!valid)throw new Error('Cache retirement source is not the installer');
   const value=await state();if(!value||value.legacy===null)throw new Error('Cache retirement metadata unavailable');
   value.stale=value.stale.filter(key=>!keys.includes(key));await persist(value);
   port?.postMessage({retired:true,keys});
  }).catch(()=>port?.postMessage({retired:false})).finally(()=>port?.close()));
 }
 if(event.data?.type==='ARCADE_CLIENT_READY'&&typeof event.source?.id==='string'&&event.source.id&&validEntry(event.data.entry))event.waitUntil(serial(()=>collect({id:event.source.id,entry:event.data.entry})).catch(()=>{}));
});
async function own(request){try{const shell=await caches.open(SHELL),pack=await caches.open(PACK);return await shell.match(request)||await pack.match(request);}catch{return;}}
function immutable(url){const relative=url.pathname.slice(new URL(SCOPE).pathname.length);return /^assets\/[^/]+-[A-Za-z0-9_-]{6,}\.(?:m?js|css|woff2?|ttf|png|webp|svg)$/.test(relative);}
async function retained(request,url){if(!immutable(url))return;try{for(const key of (await caches.keys()).filter(key=>owned(key)||legacyScoped(key))){const response=await(await caches.open(key)).match(request);if(response)return response;}}catch{}return;}
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
