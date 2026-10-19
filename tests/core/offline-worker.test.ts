import {expect,test,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
function worker(options:{putFails?:boolean;openFails?:boolean;hit?:Response}={}){
 const handlers:Record<string,(event:any)=>void>={};const pending:Promise<unknown>[]=[];
 const skipWaiting=vi.fn(),claim=vi.fn(),remove=vi.fn();
 const cache={match:vi.fn(async()=>options.hit),put:vi.fn(async()=>{if(options.putFails)throw new Error('QuotaExceededError');}),addAll:vi.fn(async()=>{})};
 const fetch=vi.fn(async()=>new Response('fresh game chunk',{status:200}));
 const caches={open:vi.fn(async()=>{if(options.openFails)throw new Error('storage blocked');return cache;}),keys:vi.fn(async()=>['pocket-arcade:/:old:pack']),delete:remove};
 const self={registration:{scope:'https://arcade.test/'},location:{origin:'https://arcade.test'},clients:{claim},skipWaiting,addEventListener:(name:string,handler:(event:any)=>void)=>handlers[name]=handler};
 const source=readFileSync(new URL('../../public/sw.js',import.meta.url),'utf8').replace('__ARCADE_VERSION__','new').replace('__ARCADE_PRECACHE__','[]');
 runInNewContext(source,{self,caches,fetch,URL,Response});
 const request=(mode='cors')=>{let response:Promise<Response>|undefined;handlers.fetch({request:{url:'https://arcade.test/assets/game-new.js',method:'GET',mode},respondWith:(result:Promise<Response>)=>response=result,waitUntil:(task:Promise<unknown>)=>pending.push(task)});return response!;};
 return {handlers,pending,skipWaiting,claim,remove,fetch,cache,caches,request};
}
test('online gameplay survives a full response cache',async()=>{const w=worker({putFails:true});const response=await w.request();expect(response.status).toBe(200);expect(await response.text()).toBe('fresh game chunk');await Promise.all(w.pending);});
test('online gameplay survives completely blocked cache storage',async()=>{const w=worker({openFails:true});const response=await w.request();expect(response.status).toBe(200);expect(await response.text()).toBe('fresh game chunk');await Promise.all(w.pending);});
test('installing a new version does not force existing clients to change workers or delete their games',async()=>{const w=worker();w.handlers.install({waitUntil:(task:Promise<unknown>)=>w.pending.push(task)});await Promise.all(w.pending);expect(w.skipWaiting).not.toHaveBeenCalled();expect(w.claim).not.toHaveBeenCalled();expect(w.remove).not.toHaveBeenCalled();});
