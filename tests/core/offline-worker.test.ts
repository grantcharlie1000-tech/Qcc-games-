import {expect,test,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const origin='https://arcade.test/';
const oldPack='pocket-arcade:/:old:pack',oldShell='pocket-arcade:/:old:shell';
type Backend=Map<string,Map<string,Response>>;
function worker(options:{putFails?:boolean;openFails?:boolean;mismatch?:boolean;backend?:Backend;legacy?:boolean;version?:string;previous?:string;uncachedRuntime?:boolean}={}){
 const version=options.version??'new',previous=options.previous??'old',entry=`assets/${version}-entry.js`;
 let failWrites=options.putFails,holdWrite:Promise<void>|undefined;
 const backend=options.backend??new Map<string,Map<string,Response>>([
  [oldPack,new Map([[origin+'assets/game-oldhash123.js',new Response('retained old lazy chunk')]])],
  [oldShell,new Map([[origin+'index.html',new Response('old HTML')]])],
  ['pocket-arcade:/Qcc-games-/:old:pack',new Map()],['unrelated-cache',new Map()]
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
  keys:async()=>[...backend.keys()],delete:vi.fn(async(key:string)=>backend.delete(key))
 };
 if(!options.legacy&&!options.backend)backend.get(oldShell)!.set(origin+'.arcade-update-state',Response.json({version:'old',entry:origin+'assets/old-entry.js',stale:[],pinned:[],pending:[],current:[],legacy:[],owners:[],assets:[{entry:origin+'assets/old-entry.js',keys:[oldShell,oldPack]}]}));
 const active={postMessage:(_message:unknown,ports:MessagePort[])=>ports[0].postMessage(options.legacy?{version:previous}:{version:previous,entry:origin+`assets/${previous}-entry.js`})};
 const self={registration:{scope:origin,active},location:{origin:new URL(origin).origin},clients:{claim,get:async(id:string)=>clients.find(client=>client.id===id),matchAll:async()=>clients.filter(client=>!omitted.has(client.id)).map(client=>({...client,navigate}))},skipWaiting,addEventListener:(name:string,handler:(event:any)=>void)=>handlers[name]=handler};
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
 return {setWriteFailure:(value:boolean)=>failWrites=value,holdWrites:(value:Promise<void>|undefined)=>holdWrite=value,handlers,pending,skipWaiting,claim,navigate,fetch,caches,backend,clients,omitted,emit,request};
}
test('online gameplay survives a full response cache',async()=>{const w=worker({putFails:true});const response=await w.request();expect(response.status).toBe(200);expect(await response.text()).toBe('fresh game chunk');});
test('online gameplay survives completely blocked cache storage',async()=>{const w=worker({openFails:true});const response=await w.request();expect(response.status).toBe(200);expect(await response.text()).toBe('fresh game chunk');});
test('installing an update never navigates documents or deletes their game caches',async()=>{const w=worker();await w.emit('install');expect(w.navigate).not.toHaveBeenCalled();expect(w.claim).not.toHaveBeenCalled();expect(w.backend.has(oldPack)).toBe(true);});
test('a coherent update can activate without waiting for legacy documents to close',async()=>{const w=worker();await w.emit('install');expect(w.skipWaiting).toHaveBeenCalledOnce();await w.emit('activate');expect(w.backend.has(oldPack)).toBe(true);expect(w.navigate).not.toHaveBeenCalled();});
test('an inconsistent deployment cannot activate over the retained version',async()=>{const w=worker({mismatch:true});await expect(w.emit('install')).rejects.toThrow();expect(w.skipWaiting).not.toHaveBeenCalled();expect(w.backend.has(oldPack)).toBe(true);});
test('old cached chunks remain usable after the worker process restarts',async()=>{const w=worker();await w.emit('install');await w.emit('activate');const restarted=worker({backend:w.backend});expect(await (await restarted.request('assets/game-oldhash123.js')).text()).toBe('retained old lazy chunk');expect(w.backend.has(oldPack)).toBe(true);});
test('cleanup only deletes the captured stale set, preserving future installs and other scopes',async()=>{
 const w=worker();await w.emit('install');await w.emit('activate');
 const future='pocket-arcade:/:future-install:shell';w.backend.set(future,new Map());
 w.clients.splice(0,w.clients.length,{id:'new-page',url:origin});
 await w.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}});
 expect(w.backend.has(oldPack)).toBe(false);expect(w.backend.has(oldShell)).toBe(false);
 expect(w.backend.has(future)).toBe(true);expect(w.backend.has('pocket-arcade:/Qcc-games-/:old:pack')).toBe(true);expect(w.backend.has('unrelated-cache')).toBe(true);
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
 const w=worker();await w.emit('install');await w.emit('activate');w.backend.get('pocket-arcade:/:new:shell')!.clear();
 const restarted=worker({backend:w.backend});restarted.clients.splice(0,restarted.clients.length,{id:'new-page',url:origin});
 await restarted.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}});
 expect(w.backend.has(oldPack)).toBe(true);
});

test('legacy migration pins old caches even when an execution-unready navigation is absent',async()=>{
 const w=worker({legacy:true});await w.emit('install');await w.emit('activate');w.clients.splice(0,w.clients.length,{id:'new-page',url:origin});
 await w.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}});
 expect(w.backend.has(oldPack)).toBe(true);expect(w.backend.has(oldShell)).toBe(true);
});
test('an absent current navigation retains its own generation and settles only its source ACK',async()=>{
 const w=worker();await w.emit('install');await w.emit('activate');await w.request('', 'navigate');
 w.clients.splice(0,w.clients.length,{id:'new-page',url:origin});await w.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}});
 expect(w.backend.has('pocket-arcade:/:new:shell')).toBe(true);
 const reservation=await w.backend.get('pocket-arcade:/:new:shell')!.get(origin+'.arcade-update-state')!.clone().json();expect(reservation.pending).toContainEqual({id:'reserved-page',entry:origin+'assets/new-entry.js'});
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
 expect(w.backend.has(oldPack)).toBe(true);expect(w.backend.has('pocket-arcade:/:new:shell')).toBe(false);
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
 await second.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/next-entry.js'},source:{id:'next-page'}});expect(first.backend.has('pocket-arcade:/:new:shell')).toBe(false);
 const third=worker({backend:first.backend,version:'third',previous:'next'});await third.emit('install');await third.emit('activate');third.clients.splice(0,third.clients.length,{id:'third-page',url:origin});
 await third.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/third-entry.js'},source:{id:'third-page'}});expect(first.backend.has('pocket-arcade:/:next:shell')).toBe(false);
});
test('one evicted legacy pinned cache does not turn unrelated future generations into permanent pins',async()=>{
 const legacy=worker({legacy:true});await legacy.emit('install');await legacy.emit('activate');legacy.clients.splice(0,legacy.clients.length,{id:'new-page',url:origin});
 await legacy.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}});legacy.backend.delete(oldShell);
 const next=worker({backend:legacy.backend,version:'next',previous:'new'});await next.emit('install');await next.emit('activate');next.clients.splice(0,next.clients.length,{id:'next-page',url:origin});
 await next.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/next-entry.js'},source:{id:'next-page'}});
 expect(next.backend.has(oldPack)).toBe(true);expect(next.backend.has('pocket-arcade:/:new:shell')).toBe(false);
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
 const state=await b.backend.get('pocket-arcade:/:new:shell')!.get(origin+'.arcade-update-state')!.clone().json();expect(state.current).toContain('old-page');
 const c=worker({version:'third',previous:'new',backend:b.backend});c.omitted.add('old-page');await c.emit('install');await c.emit('activate');await c.emit('message',{data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/third-entry.js'},source:{id:'another-closed-page'}});
 expect(c.backend.has('pocket-arcade:/:new:shell')).toBe(true);const inherited=await c.backend.get('pocket-arcade:/:third:shell')!.get(origin+'.arcade-update-state')!.clone().json();expect(inherited.owners).toContainEqual({id:'old-page',entry:origin+'assets/new-entry.js'});
});

test('a reclaimed cache name is retired before a later same-version install recreates it',async()=>{
 const w=worker();await w.emit('install');await w.emit('activate');w.clients.splice(0,w.clients.length,{id:'new-page',url:origin});
 const ack={data:{type:'ARCADE_CLIENT_READY',entry:origin+'assets/new-entry.js'},source:{id:'new-page'}};
 await w.emit('message',ack);expect(w.backend.has(oldShell)).toBe(false);
 w.backend.set(oldShell,new Map([[origin+'future-install',new Response('new incarnation')]]));const restarted=worker({backend:w.backend});restarted.clients.splice(0,restarted.clients.length,{id:'new-page',url:origin});await restarted.emit('message',ack);
 expect(w.backend.has(oldShell)).toBe(true);expect(await w.backend.get(oldShell)!.get(origin+'future-install')!.text()).toBe('new incarnation');
});
