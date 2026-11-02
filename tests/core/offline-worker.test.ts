import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function worker(options:{blockedStorage?:boolean;closedWindow?:boolean}={}){
 const events=new Map<string,(event:{waitUntil:(task:Promise<unknown>)=>void})=>void>();
 const cacheNames=new Set(['pocket-arcade:/:7cc4be4c7742:shell','pocket-arcade-v2:/Qcc-games-/:old:pack','unrelated-cache']);
 const order:string[]=[],navigated:string[]=[];
 let registered=true;
 const urls=['https://arcade.test/?tab=one#/game/snake','https://arcade.test/?tab=two#/study'];
 const self={
  location:{href:'https://arcade.test/sw.js',origin:'https://arcade.test'},
  registration:{scope:'https://arcade.test/',async unregister(){order.push('unregister');registered=false;return true;}},
  async skipWaiting(){order.push('skipWaiting');},
  clients:{async claim(){order.push('claim');},async matchAll(query:{type:string}){
   order.push('matchAll');expect(query.type).toBe('window');expect(registered).toBe(true);
   return urls.map((url,index)=>({url,async navigate(target:string){
    order.push('navigate');expect(registered).toBe(false);expect(target).toBe(url);navigated.push(target);
    if(index===0&&options.closedWindow)throw new Error('Window closed');
   }}));
  }},
  addEventListener:(name:string,handler:(event:{waitUntil:(task:Promise<unknown>)=>void})=>void)=>events.set(name,handler)
 };
 const caches={async keys(){if(options.blockedStorage)throw new Error('Storage denied');return [...cacheNames];},async delete(name:string){
  order.push('delete');return cacheNames.delete(name);
 }};
 const source=readFileSync(new URL('../../public/sw.js',import.meta.url),'utf8');
 runInNewContext(source,{self,caches,URL,Response,setTimeout,clearTimeout,MessageChannel});
 async function emit(name:string){
  const tasks:Promise<unknown>[]=[];
  events.get(name)!({waitUntil:task=>tasks.push(task)});
  await Promise.all(tasks);
 }
 return {events,cacheNames,order,navigated,urls,registered:()=>registered,emit};
}

test('the replacement never intercepts fetches',()=>{
 expect([...worker().events.keys()].sort()).toEqual(['activate','install']);
});
test('installation immediately skips waiting without accessing caches',async()=>{
 const w=worker({blockedStorage:true});await w.emit('install');
 expect(w.order).toEqual(['skipWaiting']);expect(w.navigated).toEqual([]);
});
test('activation clears only pocket-arcade caches, claims and enumerates windows before unregistering and navigating',async()=>{
 const w=worker();await w.emit('activate');
 expect([...w.cacheNames]).toEqual(['unrelated-cache']);expect(w.registered()).toBe(false);
 expect(w.order).toEqual(['delete','delete','claim','matchAll','unregister','navigate','navigate']);
 expect(w.navigated).toEqual(w.urls);
});
test('a closed window does not prevent the other window from recovering',async()=>{
 const w=worker({closedWindow:true});await expect(w.emit('activate')).resolves.toBeUndefined();
 expect(w.navigated).toEqual(w.urls);expect(w.registered()).toBe(false);
});
