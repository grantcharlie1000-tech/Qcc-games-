import {afterEach,expect,test,vi} from 'vitest';
import * as offline from '../../src/core/offline';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});

function browser(options:{registrationDenied?:boolean;unregisterFails?:boolean;cacheDenied?:boolean;deleteFails?:boolean;noWorker?:boolean;noCaches?:boolean}={}){
 const registrations=new Set(['old-root','old-subpath','modern','unrelated']);
 const scripts:Record<string,string>={'old-root':'https://arcade.test/sw.js','old-subpath':'https://arcade.test/Qcc-games-/sw.js',modern:'https://arcade.test/offline-sw.js',unrelated:'https://arcade.test/other-sw.js'};
 const cacheNames=new Set(['pocket-arcade:/:old:shell','pocket-arcade-v2:/Qcc-games-/:old:pack','qcc-offline-shell:/:current','qcc-offline-game:/:new:snake','other-cache']);
 const register=vi.fn(async()=>({scope:'https://arcade.test/'}));
 vi.stubGlobal('location',{href:'https://arcade.test/'});
 vi.stubGlobal('navigator',options.noWorker?{}:{serviceWorker:{register,async getRegistrations(){
  if(options.registrationDenied)throw new Error('Registration denied');
  return [...registrations].map(name=>({active:{scriptURL:scripts[name]},waiting:null,installing:null,async unregister(){
   if(options.unregisterFails&&name==='old-root')throw new Error('Unregister failed');
   return registrations.delete(name);
  }}));
 }}});
 if(options.noCaches)vi.stubGlobal('caches',undefined);
 else vi.stubGlobal('caches',{async keys(){if(options.cacheDenied)throw new Error('Storage denied');return [...cacheNames];},async delete(name:string){
  if(options.deleteFails&&name==='pocket-arcade:/:old:shell')throw new Error('Cache unavailable');return cacheNames.delete(name);
 }});
 return {registrations,cacheNames,register};
}
const retained=['modern','unrelated'];
const retainedCaches=['qcc-offline-shell:/:current','qcc-offline-game:/:new:snake','other-cache'];

test('startup retires only the broken worker and its caches, preserving downloaded games',async()=>{
 const b=browser();await offline.retireOffline();
 expect([...b.registrations]).toEqual(retained);expect([...b.cacheNames]).toEqual(retainedCaches);expect(b.register).not.toHaveBeenCalled();
});
test('old caches are removed without service worker support',async()=>{
 const b=browser({noWorker:true});await offline.retireOffline();expect([...b.cacheNames]).toEqual(retainedCaches);
});
test('old registrations are removed when CacheStorage is unavailable',async()=>{
 const b=browser({noCaches:true});await offline.retireOffline();expect([...b.registrations]).toEqual(retained);
});
test('denied storage does not block worker recovery',async()=>{
 const b=browser({cacheDenied:true});await expect(offline.retireOffline()).resolves.toBeUndefined();expect([...b.registrations]).toEqual(retained);
});
test('denied registration access does not block legacy cache cleanup',async()=>{
 const b=browser({registrationDenied:true});await offline.retireOffline();expect([...b.cacheNames]).toEqual(retainedCaches);
});
test('one failed unregistration does not block other workers or cache cleanup',async()=>{
 const b=browser({unregisterFails:true});await offline.retireOffline();
 expect([...b.registrations]).toEqual(['old-root',...retained]);expect([...b.cacheNames]).toEqual(retainedCaches);
});
test('one failed legacy cache deletion does not touch game downloads',async()=>{
 const b=browser({deleteFails:true});await offline.retireOffline();
 expect([...b.cacheNames]).toEqual(['pocket-arcade:/:old:shell',...retainedCaches]);expect([...b.registrations]).toEqual(retained);
});
test('production registers only the new scoped offline worker',async()=>{
 vi.stubEnv('PROD',true);
 const b=browser();await offline.startOffline();
 expect(b.register).toHaveBeenCalledTimes(1);
 const [url,options]=b.register.mock.calls[0];
 expect(String(url)).toBe('https://arcade.test/offline-sw.js');
 expect(options).toMatchObject({scope:'https://arcade.test/',updateViaCache:'none'});
 expect([...b.cacheNames]).toEqual(retainedCaches);
});
