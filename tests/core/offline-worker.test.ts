import {expect,test,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const origin='https://arcade.test/';
const oldPack='pocket-arcade-v2:/:old:pack',oldShell='pocket-arcade-v2:/:old:shell';
const legacyPack='pocket-arcade:/:old:pack',legacyShell='pocket-arcade:/:old:shell';
type Backend=Map<string,Map<string,Response>>;
function worker(options:{putFails?:boolean;openFails?:boolean;mismatch?:boolean;backend?:Backend;legacy?:boolean;version?:string;previous?:string;uncachedRuntime?:boolean}={}){
 const version=options.version??'new',previous=options.previous??'old',entry=`assets/${version}-entry.js`;
 let failWrites=options.putFails,holdWrite:Promise<void>|undefined,holdDelete:Promise<void>|undefined;
 const backend=options.backend??new Map<string,Map<string,Response>>([
  [options.legacy?legacyPack:oldPack,new Map([[origin+'assets/game-oldhash123.js',new Response('retained old lazy chunk')]])],
  [options.legacy?legacyShell:oldShell,new Map([[origin+'index.html',new Response('old HTML')]])],
  ['pocket-arcade-v2:/Qcc-games-/:old:pack',new Map()],['unrelated-cache',new Map()]
 ]);
 const handlers:Record<string,(event:any)=>void>={},pending:Promise<unknown>[]=[];
 const clients=[{id:'old-page',url:origin}],omitted=new Set<string>();
 const navigate=vi.fn(),skipWaiting=vi.fn(async()=>{}),claim=vi.fn(async()=>{});
 const fetch=vi.fn(async(request:Request|string)=>{
  const url=typeof request==='string'?request:request.url;
  if(url.endsWith('offline-manifest.json'))return Response.json({version:options.mismatch?'different':version,files:[entry,...(options.uncachedRuntime?['assets/lazy-extra123.js']:[])]});
  if(url===origin||url.endsWith('index.html'))return new Response(`<script type="module" src="./${entry}"></script>`);
  if(url.endsWith('assets/game-oldhash123.js'))return new Response('gone from deployment',{status:404});
  return new Response('fresh game chunk');
 });
 const caches={
  async open(key:string){
   if(options.openFails)throw new Error('storage blocked');
   if(!backend.has(key))backend.set(key,new Map());const data=backend.get(key)!;
   return {
    async match(request:Request|string|URL){return data.get(typeof request==='string'?request:request instanceof URL?request.href:request.url)?.clone();},
    async put(request:Request|string,response:Response){if(holdWrite)await holdWrite;if(failWrites)throw new Error('QuotaExceededError');data.set(typeof request==='string'?request:request.url,response.clone());},
    async addAll(requests:(Request|string)[]){for(const request of requests){const response=await fetch(request);if(!response.ok)throw new Error('bad precache response');data.set(typeof request==='string'?request:request.url,response.clone());}}
   };
  },
  keys:async()=>[...backend.keys()],delete:vi.fn(async(key:string)=>{if(holdDelete)await holdDelete;return backend.delete(key);})
 };
 if(!options.legacy&&!options.backend)backend.get(oldShell)!.set(origin+'.arcade-update-state',Response.json({version:'old',entry:origin+'assets/old-entry.js',stale:[],pinned:[],pending:[],current:[],legacy:[],owners:[],assets:[{entry:origin+'assets/old-entry.js',keys:[oldShell,oldPack]}]}));
 const active={state:'activated',scriptURL:origin+'sw.js',postMessage:(message:any,ports:MessagePort[])=>ports[0].postMessage(message.type==='ARCADE_RETIRE_CACHES'?{retired:true,keys:message.keys}:options.legacy?{version:previous}:{version:previous,entry:origin+`assets/${previous}-entry.js`,cacheRetirement:1,cacheNamespace:2})};
 const installing={state:'installing',scriptURL:origin+'sw.js'};
 const self={registration:{scope:origin,active,installing,waiting:undefined as any},location:{origin:new URL(origin).origin,href:origin+'sw.js'},clients:{claim,get:async(id:string)=>clients.find(client=>client.id===id),matchAll:async()=>clients.filter(client=>!omitted.has(client.id)).map(client=>({...client,navigate}))},skipWaiting,addEventListener:(name:string,handler:(event:any)=>void)=>handlers[name]=handler};
 const source=readFileSync(new URL('../../public/sw.js',import.meta.url),'utf8').replace('__ARCADE_VERSION__',version).replace('__ARCADE_PRECACHE__',JSON.stringify(['./','index.html','offline-manifest.json',entry]));
 runInNewContext(source,{self,caches,fetch,URL,Request,Response,MessageChannel,setTimeout,clearTimeout,console});
 async function emit(name:string,data:Record<string,unknown>={}){handlers[name]({...data,waitUntil:(task:Promise<unknown>)=>pending.push(task)});await Promise.all(pending.splice(0));}
 async function request(path='assets/game-new.js',mode='cors'){
  let response:Promise<Response>|undefined;
  if(mode!=='navigate')handlers.fetch({request:new Request(origin+path),clientId:'old-page',respondWith:(result:Promise<Response>)=>response=result,waitUntil:(task:Promise<unknown>)=>pending.push(task)});
  // Request.mode is readonly, so navigations use the same worker boundary shape.
  if(mode==='navigate'){
   handlers.fetch({request:{url:origin+path,method:'GET',mode},resultingClientId:'reserved-page',clientId:'old-page',respondWith:(result:Promise<Response>)=>response=result,waitUntil:(task:Promise<unknown>)=>pending.push(task)});
  }
  const result=await response!;await Promise.all(pending.splice(0));return result;
 }
 return {setWriteFailure:(value:boolean)=>failWrites=value,holdWrites:(value:Promise<void>|undefined)=>holdWrite=value,holdDeletes:(value:Promise<void>|undefined)=>holdDelete=value,self,installing,handlers,pending,skipWaiting,claim,navigate,fetch,caches,backend,clients,omitted,emit,request};
}
test('online gameplay survives a full response cache',async()=>{const w=worker({putFails:true});const response=await w.request();expect(response.status).toBe(200);expect(await response.text()).toBe('fresh game chunk');});
test('full-catalog API requests bypass service-worker caches and reach the network directly',async()=>{
 const w=worker();const url=origin+'api/movies?q=private-search';
 const respondWith=vi.fn(),waitUntil=vi.fn();
 w.handlers.fetch({request:new Request(url),clientId:'old-page',respondWith,waitUntil});
 expect(respondWith).not.toHaveBeenCalled();expect(w.fetch).not.toHaveBeenCalled();
 for(const cache of w.backend.values())expect(cache.has(url)).toBe(false);
});
test('online gameplay survives completely blocked cache storage',async()=>{const w=worker({openFails:true});const response=await w.request();expect(response.status).toBe(200);expect(await response.text()).toBe('fresh game chunk');});
test('installing an update never navigates documents or deletes their game caches',async()=>{const w=worker();await w.emit('install');expect(w.navigate).not.toHaveBeenCalled();expect(w.claim).not.toHaveBeenCalled();expect(w.backend.has(oldPack)).toBe(true);});
test('a coherent update can activate without waiting for legacy documents to close',async()=>{const w=worker();await w.emit('install');expect(w.skipWaiting).toHaveBeenCalledOnce();await w.emit('activate');expect(w.backend.has(oldPack)).toBe(true);expect(w.navigate).not.toHaveBeenCalled();});
test('an inconsistent deployment cannot activate over the retained version',async()=>{const w=worker({mismatch:true});await expect(w.emit('install')).rejects.toThrow();expect(w.skipWaiting).not.toHaveBeenCalled();expect(w.backend.has(oldPack)).toBe(true);});
test('old cached chunks remain usable after the worker process restarts',async()=>{const w=worker();await w.emit('install');await w.emit('activate');const restarted=worker({backend:w.backend});expect(await (await restarted.request('assets/game-oldhash123.js')).text()).toBe('retained old lazy chunk');expect(w.backend.has(oldPack)).toBe(true);});
test('cleanup only deletes the captured stale set, preserving future installs and other scopes',async()=>{
 const w=worker();await w.emit('install');await w.emit('activate');
 const future='pocket-arcade-v2:/:future-install:shell';w.backend.set(future,new Map());
 w.clients.splice(0,w.clients.length,{id:'new-page',url:origin});
 await w.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}});
 expect(w.backend.has(oldPack)).toBe(false);expect(w.backend.has(oldShell)).toBe(false);
 expect(w.backend.has(future)).toBe(true);expect(w.backend.has('pocket-arcade-v2:/Qcc-games-/:old:pack')).toBe(true);expect(w.backend.has('unrelated-cache')).toBe(true);
});
test('a live unacknowledged legacy document prevents stale cache deletion',async()=>{
 const w=worker();await w.emit('install');await w.emit('activate');
 w.clients.push({id:'new-page',url:origin});
 await w.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}});
 expect(w.backend.has(oldPack)).toBe(true);
 await w.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/old-entry.js'},source:{id:'old-page'}});
 expect(w.backend.has(oldPack)).toBe(true);
});
test('missing persisted retention metadata fails closed after a restart',async()=>{
 const w=worker();await w.emit('install');await w.emit('activate');w.backend.get('pocket-arcade-v2:/:new:shell')!.clear();
 const restarted=worker({backend:w.backend});restarted.clients.splice(0,restarted.clients.length,{id:'new-page',url:origin});
 await restarted.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}});
 expect(w.backend.has(oldPack)).toBe(true);
});

test('legacy migration pins old caches even when an execution-unready navigation is absent',async()=>{
 const w=worker({legacy:true});await w.emit('install');await w.emit('activate');w.clients.splice(0,w.clients.length,{id:'new-page',url:origin});
 await w.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}});
 expect(w.backend.has(legacyPack)).toBe(true);expect(w.backend.has(legacyShell)).toBe(true);
});
test('an absent current navigation retains its own generation and settles only its source ACK',async()=>{
 const w=worker();await w.emit('install');await w.emit('activate');await w.request('', 'navigate');
 w.clients.splice(0,w.clients.length,{id:'new-page',url:origin});await w.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}});
 expect(w.backend.has('pocket-arcade-v2:/:new:shell')).toBe(true);
 const reservation=await w.backend.get('pocket-arcade-v2:/:new:shell')!.get(origin+'.arcade-update-state')!.clone().json();expect(reservation.pending).toContainEqual({id:'reserved-page',entry:origin+'assets/new-entry.js'});
 w.clients.push({id:'reserved-page',url:origin});await w.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'reserved-page'}});
 expect(w.backend.has(oldPack)).toBe(false);
});
test('activation imports late predecessor reservations and an old-module ACK retains its dependencies',async()=>{
 const w=worker();await w.emit('install');
 // Navigation began after the new worker's install snapshot, before activation.
 w.backend.get(oldShell)!.set(origin+'.arcade-update-state',Response.json({version:'old',entry:origin+'assets/old-entry.js',stale:[],pinned:[],pending:[{id:'late-page',entry:origin+'assets/old-entry.js'}],current:[],legacy:[],owners:[],assets:[{entry:origin+'assets/old-entry.js',keys:[oldShell,oldPack]}]}));
 await w.emit('activate');w.clients.splice(0,w.clients.length,{id:'new-page',url:origin});
 await w.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}});expect(w.backend.has(oldPack)).toBe(true);
 w.clients.push({id:'late-page',url:origin});await w.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/old-entry.js'},source:{id:'late-page'}});expect(w.backend.has(oldPack)).toBe(true);
 w.clients.splice(1,1);await w.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}});expect(w.backend.has(oldPack)).toBe(false);
});
test('an unresolved old navigation protects its generation across restart and a later update',async()=>{
 const w=worker();await w.emit('install');
 w.backend.get(oldShell)!.set(origin+'.arcade-update-state',Response.json({version:'old',entry:origin+'assets/old-entry.js',stale:[],pinned:[],pending:[{id:'cancelled-page',entry:origin+'assets/old-entry.js'}],current:[],legacy:[],owners:[],assets:[{entry:origin+'assets/old-entry.js',keys:[oldShell,oldPack]}]}));
 await w.emit('activate');const restarted=worker({backend:w.backend});restarted.clients.splice(0,restarted.clients.length,{id:'new-page',url:origin});
 await restarted.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}});expect(w.backend.has(oldPack)).toBe(true);
 const next=worker({backend:w.backend,version:'next',previous:'new'});await next.emit('install');await next.emit('activate');next.clients.splice(0,next.clients.length,{id:'next-page',url:origin});
 await next.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/next-entry.js'},source:{id:'next-page'}});
 expect(w.backend.has(oldPack)).toBe(true);expect(w.backend.has('pocket-arcade-v2:/:new:shell')).toBe(false);
});
test('navigation never emits HTML before its reservation is durably stored',async()=>{
 const w=worker();await w.emit('install');await w.emit('activate');let release!:()=>void;w.holdWrites(new Promise<void>(resolve=>release=resolve));
 let emitted=false;const navigation=w.request('','navigate').then(response=>{emitted=true;return response;});
 await new Promise(resolve=>setTimeout(resolve,20));expect(emitted).toBe(false);release();expect(await (await navigation).text()).toContain('new-entry.js');
 w.holdWrites(undefined);w.setWriteFailure(true);const failed=await w.request('','navigate');expect(failed.status).toBe(503);expect(await failed.text()).not.toContain('new-entry.js');
});

test('normal multi-generation cleanup accepts legitimately absent old asset mappings',async()=>{
 const first=worker();await first.emit('install');await first.emit('activate');first.clients.splice(0,first.clients.length,{id:'first-page',url:origin});
 await first.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'first-page'}});expect(first.backend.has(oldShell)).toBe(false);
 const second=worker({backend:first.backend,version:'next',previous:'new'});await second.emit('install');await second.emit('activate');second.clients.splice(0,second.clients.length,{id:'next-page',url:origin});
 await second.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/next-entry.js'},source:{id:'next-page'}});expect(first.backend.has('pocket-arcade-v2:/:new:shell')).toBe(false);
 const third=worker({backend:first.backend,version:'third',previous:'next'});await third.emit('install');await third.emit('activate');third.clients.splice(0,third.clients.length,{id:'third-page',url:origin});
 await third.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/third-entry.js'},source:{id:'third-page'}});expect(first.backend.has('pocket-arcade-v2:/:next:shell')).toBe(false);
});
test('one evicted legacy pinned cache does not turn unrelated future generations into permanent pins',async()=>{
 const legacy=worker({legacy:true});await legacy.emit('install');await legacy.emit('activate');legacy.clients.splice(0,legacy.clients.length,{id:'new-page',url:origin});
 await legacy.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}});legacy.backend.delete(legacyShell);
 const next=worker({backend:legacy.backend,version:'next',previous:'new'});await next.emit('install');await next.emit('activate');next.clients.splice(0,next.clients.length,{id:'next-page',url:origin});
 await next.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/next-entry.js'},source:{id:'next-page'}});
 expect(next.backend.has(legacyPack)).toBe(true);expect(next.backend.has('pocket-arcade-v2:/:new:shell')).toBe(false);
});

test('an update cannot activate when its manifest needs a runtime chunk outside its atomic precache',async()=>{
 const w=worker({uncachedRuntime:true});await expect(w.emit('install')).rejects.toThrow();expect(w.skipWaiting).not.toHaveBeenCalled();expect(w.backend.has(oldPack)).toBe(true);
});

test('waiting activation accepts only its own exact build and entry',async()=>{
 const w=worker();await w.emit('message',{data:{type:'ARCADE_ACTIVATE',version:'new',entry:origin+'assets/wrong.js'}});expect(w.skipWaiting).not.toHaveBeenCalled();
 await w.emit('message',{data:{type:'ARCADE_ACTIVATE',version:'new',entry:origin+'assets/new-entry.js'}});expect(w.skipWaiting).toHaveBeenCalledOnce();
});

test('a ready module ACK already sent before its tab closes can settle that source reservation',async()=>{
 const w=worker();await w.emit('install');w.backend.get(oldShell)!.set(origin+'.arcade-update-state',Response.json({version:'old',entry:origin+'assets/old-entry.js',stale:[],pinned:[],pending:[{id:'ready-then-closed',entry:origin+'assets/old-entry.js'}],current:[],legacy:[],owners:[],assets:[{entry:origin+'assets/old-entry.js',keys:[oldShell,oldPack]}]}));await w.emit('activate');w.clients.splice(0,w.clients.length,{id:'new-page',url:origin});
 await w.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/old-entry.js'},source:{id:'ready-then-closed'}});
 await w.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}});expect(w.backend.has(oldPack)).toBe(false);
});

test('a known ready owner omitted by enumeration remains protected via clients.get across handover',async()=>{
 const b=worker();await b.emit('install');await b.emit('activate');await b.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'old-page'}});
 b.omitted.add('old-page');await b.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'another-closed-page'}});
 const state=await b.backend.get('pocket-arcade-v2:/:new:shell')!.get(origin+'.arcade-update-state')!.clone().json();expect(state.current).toContain('old-page');
 const c=worker({version:'third',previous:'new',backend:b.backend});c.omitted.add('old-page');await c.emit('install');await c.emit('activate');await c.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/third-entry.js'},source:{id:'another-closed-page'}});
 expect(c.backend.has('pocket-arcade-v2:/:new:shell')).toBe(true);const inherited=await c.backend.get('pocket-arcade-v2:/:third:shell')!.get(origin+'.arcade-update-state')!.clone().json();expect(inherited.owners).toContainEqual({id:'old-page',entry:origin+'assets/new-entry.js'});
});

test('a reclaimed cache name is retired before a later same-version install recreates it',async()=>{
 const w=worker();await w.emit('install');await w.emit('activate');w.clients.splice(0,w.clients.length,{id:'new-page',url:origin});
 const ack={data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}};
 await w.emit('message',ack);expect(w.backend.has(oldShell)).toBe(false);
 w.backend.set(oldShell,new Map([[origin+'future-install',new Response('new incarnation')]]));const restarted=worker({backend:w.backend});restarted.clients.splice(0,restarted.clients.length,{id:'new-page',url:origin});await restarted.emit('message',ack);
 expect(w.backend.has(oldShell)).toBe(true);expect(await w.backend.get(oldShell)!.get(origin+'future-install')!.text()).toBe('new incarnation');
});

function connect(predecessor:ReturnType<typeof worker>,successor:ReturnType<typeof worker>){
 const active={state:'activated',scriptURL:origin+'sw.js',postMessage:(data:unknown,ports:MessagePort[])=>{void predecessor.emit('message',{data,ports,source:successor.installing});}};
 successor.self.registration.active=active;predecessor.self.registration.installing=successor.installing;return active;
}
test('rollback cache reuse waits for predecessor in-flight deletion and durable retirement before opening',async()=>{
 const c=worker();await c.emit('install');await c.emit('activate');c.clients.splice(0,c.clients.length,{id:'c-page',url:origin});let release!:()=>void;c.holdDeletes(new Promise<void>(resolve=>release=resolve));
 const gc=c.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'c-page'}});await vi.waitFor(()=>expect(c.caches.delete).toHaveBeenCalled());
 const b=worker({version:'old',previous:'new',backend:c.backend});connect(c,b);const opened=vi.spyOn(b.caches,'open');let finished=false;const install=b.emit('install').then(()=>{finished=true;});
 try{await new Promise(resolve=>setTimeout(resolve,20));expect(finished).toBe(false);expect(opened).not.toHaveBeenCalledWith(oldShell);expect(opened).not.toHaveBeenCalledWith(oldPack);expect(b.fetch).not.toHaveBeenCalled();}finally{release();await gc;await install;}
 expect(b.backend.has(oldShell)).toBe(true);expect(b.skipWaiting).toHaveBeenCalledOnce();
});
test('failed predecessor retirement persistence refuses installation before opening successor caches',async()=>{
 const c=worker();await c.emit('install');await c.emit('activate');const b=worker({version:'next',previous:'new',backend:c.backend});connect(c,b);c.setWriteFailure(true);
 await expect(b.emit('install')).rejects.toThrow();expect(b.backend.has('pocket-arcade-v2:/:next:shell')).toBe(false);expect(b.fetch).not.toHaveBeenCalled();expect(b.skipWaiting).not.toHaveBeenCalled();
});
test('a distinct waiting D refuses cache reuse and wrong-predecessor installation before opening',async()=>{
 const b=worker();b.self.registration.waiting={state:'installed',scriptURL:origin+'sw.js'};
 await expect(b.emit('install')).rejects.toThrow();expect(b.backend.has('pocket-arcade-v2:/:new:shell')).toBe(false);expect(b.fetch).not.toHaveBeenCalled();
});
test('D changing the active predecessor during retirement ACK refuses installation before opening',async()=>{
 const b=worker(),old=b.self.registration.active;old.postMessage=(message:any,ports)=>{if(message.type==='ARCADE_VERSION')ports[0].postMessage({version:'old',entry:origin+'assets/old-entry.js',cacheRetirement:1,cacheNamespace:2});else {b.self.registration.active={...old,state:'activating'};ports[0].postMessage({retired:true,keys:message.keys});}};
 await expect(b.emit('install')).rejects.toThrow();expect(b.backend.has('pocket-arcade-v2:/:new:shell')).toBe(false);expect(b.fetch).not.toHaveBeenCalled();
});
test('losing the installing worker identity during retirement ACK refuses opening successor caches',async()=>{
 const b=worker(),old=b.self.registration.active;old.postMessage=(message:any,ports)=>{if(message.type==='ARCADE_VERSION')ports[0].postMessage({version:'old',entry:origin+'assets/old-entry.js',cacheRetirement:1,cacheNamespace:2});else {b.self.registration.installing={...b.installing};ports[0].postMessage({retired:true,keys:message.keys});}};
 await expect(b.emit('install')).rejects.toThrow();expect(b.backend.has('pocket-arcade-v2:/:new:shell')).toBe(false);
});

test('legacy A with an already-waiting legacy D remains a supported migration state',async()=>{
 const b=worker({legacy:true});b.self.registration.waiting={state:'installed',scriptURL:origin+'sw.js',postMessage:(_message:any,ports:MessagePort[])=>ports[0].postMessage({version:'legacy-D'})};await b.emit('install');expect(b.skipWaiting).toHaveBeenCalledOnce();
});

test('legacy waiting D activation during B install cannot delete the v2 candidate',async()=>{
 const b=worker({legacy:true});const d={state:'installed',scriptURL:origin+'sw.js',postMessage:(_message:any,ports:MessagePort[])=>ports[0].postMessage({version:'legacy-D'})};b.self.registration.waiting=d;
 const fetch=b.fetch.getMockImplementation()!;let activated=false;b.fetch.mockImplementation(async request=>{if(!activated){activated=true;d.state='activated';b.self.registration.active=d as any;b.self.registration.waiting=undefined;for(const key of b.backend.keys())if(key.startsWith('pocket-arcade:'))b.backend.delete(key);}return fetch(request);});
 await b.emit('install');expect(activated).toBe(true);expect(b.skipWaiting).toHaveBeenCalledOnce();expect(b.backend.has('pocket-arcade-v2:/:new:shell')).toBe(true);
});
test('a live modern predecessor cache pair can never be reused by an installer with the same version',async()=>{
 const c=worker();await c.emit('install');await c.emit('activate');const b=worker({version:'new',previous:'new',backend:c.backend});connect(c,b);
 await expect(b.emit('install')).rejects.toThrow();expect(b.fetch).not.toHaveBeenCalled();expect(c.backend.has('pocket-arcade-v2:/:new:shell')).toBe(true);
});

test('the same active ACK target becoming activating also refuses successor cache access',async()=>{
 const b=worker(),active=b.self.registration.active;active.postMessage=(message:any,ports)=>{if(message.type==='ARCADE_VERSION')ports[0].postMessage({version:'old',entry:origin+'assets/old-entry.js',cacheRetirement:1,cacheNamespace:2});else {active.state='activating';ports[0].postMessage({retired:true,keys:message.keys});}};
 await expect(b.emit('install')).rejects.toThrow();expect(b.backend.has('pocket-arcade-v2:/:new:shell')).toBe(false);
});
test('legacy active A with a modern waiting D refuses the mixed predecessor case',async()=>{
 const b=worker({legacy:true});b.self.registration.waiting={state:'installed',scriptURL:origin+'sw.js',postMessage:(_message:any,ports:MessagePort[])=>ports[0].postMessage({version:'modern-D',entry:origin+'assets/d-entry.js',cacheRetirement:1,cacheNamespace:2})};
 await expect(b.emit('install')).rejects.toThrow();expect(b.backend.has('pocket-arcade-v2:/:new:shell')).toBe(false);
});

test('a ready source received before activate is durable across worker restart and settles its inherited reservation',async()=>{
 const w=worker();w.backend.get(oldShell)!.set(origin+'.arcade-update-state',Response.json({version:'old',entry:origin+'assets/old-entry.js',stale:[],pinned:[],pending:[{id:'early-ready',entry:origin+'assets/old-entry.js'}],current:[],legacy:[],owners:[],assets:[{entry:origin+'assets/old-entry.js',keys:[oldShell,oldPack]}]}));
 await w.emit('install');await w.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/old-entry.js'},source:{id:'early-ready'}});
 const restarted=worker({backend:w.backend});restarted.clients.splice(0,restarted.clients.length,{id:'early-ready',url:origin});await restarted.emit('activate');
 const state=await restarted.backend.get('pocket-arcade-v2:/:new:shell')!.get(origin+'.arcade-update-state')!.clone().json();
 expect(state.pending).toEqual([]);expect(state.owners).toContainEqual({id:'early-ready',entry:origin+'assets/old-entry.js'});expect(restarted.backend.has(oldPack)).toBe(true);
});

function reserveOldReady(w:ReturnType<typeof worker>){w.backend.get(oldShell)!.set(origin+'.arcade-update-state',Response.json({version:'old',entry:origin+'assets/old-entry.js',stale:[],pinned:[],pending:[{id:'early-ready',entry:origin+'assets/old-entry.js'}],current:[],legacy:[],owners:[],assets:[{entry:origin+'assets/old-entry.js',keys:[oldShell,oldPack]}]}));}
const earlyReady={data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/old-entry.js'},source:{id:'early-ready'}};
test('a durably queued early source that closes before activation settles its reservation',async()=>{
 const w=worker();reserveOldReady(w);await w.emit('install');await w.emit('message',earlyReady);const restarted=worker({backend:w.backend});restarted.clients.splice(0);await restarted.emit('activate');
 const state=await restarted.backend.get('pocket-arcade-v2:/:new:shell')!.get(origin+'.arcade-update-state')!.clone().json();expect(state.pending).toEqual([]);expect(restarted.backend.has(oldPack)).toBe(false);
});
test('failed early ACK persistence cannot authorize releasing an unacknowledged reservation',async()=>{
 const w=worker();reserveOldReady(w);await w.emit('install');w.setWriteFailure(true);await w.emit('message',earlyReady);const restarted=worker({backend:w.backend});restarted.clients.splice(0);await restarted.emit('activate');
 const state=await restarted.backend.get('pocket-arcade-v2:/:new:shell')!.get(origin+'.arcade-update-state')!.clone().json();expect(state.pending).toContainEqual({id:'early-ready',entry:origin+'assets/old-entry.js'});expect(restarted.backend.has(oldPack)).toBe(true);
});
test('a crash after activation initialization preserves early ACKs for idempotent later drain',async()=>{
 const w=worker();reserveOldReady(w);await w.emit('install');await w.emit('message',earlyReady);w.self.clients.get=async()=>{throw new Error('worker stopped during ownership reconciliation');};await w.emit('activate');
 const initialized=await w.backend.get('pocket-arcade-v2:/:new:shell')!.get(origin+'.arcade-update-state')!.clone().json();expect(initialized.legacy).not.toBeNull();expect(initialized.early).toContainEqual({id:'early-ready',entry:origin+'assets/old-entry.js'});
 const restarted=worker({backend:w.backend});restarted.clients.splice(0,restarted.clients.length,{id:'early-ready',url:origin},{id:'later-ready',url:origin});const laterReady={data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'later-ready'}};await restarted.emit('message',laterReady);await restarted.emit('message',laterReady);
 const state=await restarted.backend.get('pocket-arcade-v2:/:new:shell')!.get(origin+'.arcade-update-state')!.clone().json();expect(state.pending).toEqual([]);expect(state.owners.filter((owner:{id:string})=>owner.id==='early-ready')).toEqual([{id:'early-ready',entry:origin+'assets/old-entry.js'}]);expect(state.early).toEqual([]);expect(restarted.backend.has(oldPack)).toBe(true);
});

test('malformed early ACK entries cannot corrupt the durable navigation ledger',async()=>{
 const w=worker();await w.emit('install');await w.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:{}},source:{id:'bad-source'}});await w.emit('activate');expect((await w.request('','navigate')).status).toBe(200);
});

test('a successor merges its own early ACK with a predecessor queue left after initialized activation',async()=>{
 const c=worker();reserveOldReady(c);await c.emit('install');await c.emit('message',earlyReady);c.self.clients.get=async()=>{throw new Error('C terminated after activation initialization');};await c.emit('activate');
 const d=worker({version:'next',previous:'new',backend:c.backend});connect(c,d);await d.emit('install');await d.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/next-entry.js'},source:{id:'d-ready'}});d.clients.splice(0,d.clients.length,{id:'early-ready',url:origin},{id:'d-ready',url:origin});await d.emit('activate');
 const state=await d.backend.get('pocket-arcade-v2:/:next:shell')!.get(origin+'.arcade-update-state')!.clone().json();expect(state.pending).toEqual([]);expect(state.early).toEqual([]);expect(state.owners).toContainEqual({id:'early-ready',entry:origin+'assets/old-entry.js'});expect(state.owners).toContainEqual({id:'d-ready',entry:origin+'assets/next-entry.js'});expect(d.backend.has(oldPack)).toBe(true);
});
test('leaderboard reads bypass the service worker and cannot replay a cached ranking',async()=>{
 const w=worker(),respondWith=vi.fn();
 w.handlers.fetch({request:new Request(origin+'.netlify/functions/leaderboard?game=snake'),respondWith,waitUntil:()=>{}});
 expect(respondWith).not.toHaveBeenCalled();
});
