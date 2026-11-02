import {afterEach,expect,test,vi} from 'vitest';
import * as offline from '../../src/core/offline';

afterEach(()=>vi.unstubAllGlobals());

function browser(options:{registrationDenied?:boolean;unregisterFails?:boolean;cacheDenied?:boolean;deleteFails?:boolean;noWorker?:boolean;noCaches?:boolean}={}){
 const registrations=new Set(['root','subpath']),cacheNames=new Set(['pocket-arcade:/:old:shell','pocket-arcade-v2:/Qcc-games-/:old:pack','other-cache']);
 const register=vi.fn(()=>{throw new Error('New worker registration is forbidden');});
 vi.stubGlobal('navigator',options.noWorker?{}:{serviceWorker:{register,async getRegistrations(){
  if(options.registrationDenied)throw new Error('Registration access denied');
  return [...registrations].map(name=>({async unregister(){
   if(options.unregisterFails&&name==='root')throw new Error('Unregister failed');
   return registrations.delete(name);
  }}));
 }}});
 if(options.noCaches)vi.stubGlobal('caches',undefined);
 else vi.stubGlobal('caches',{async keys(){if(options.cacheDenied)throw new Error('Storage denied');return [...cacheNames];},async delete(name:string){
  if(options.deleteFails&&name==='pocket-arcade:/:old:shell')throw new Error('Cache unavailable');return cacheNames.delete(name);
 }});
 return {registrations,cacheNames,register};
}

test('startup unregisters every existing worker and deletes only pocket-arcade caches without registering another',async()=>{
 const b=browser();await offline.retireOffline();
 expect([...b.registrations]).toEqual([]);expect([...b.cacheNames]).toEqual(['other-cache']);expect(b.register).not.toHaveBeenCalled();
});
test('orphaned caches are cleared even without service worker support',async()=>{
 const b=browser({noWorker:true});await offline.retireOffline();expect([...b.cacheNames]).toEqual(['other-cache']);
});
test('startup unregisters workers when CacheStorage is unavailable',async()=>{
 const b=browser({noCaches:true});await offline.retireOffline();expect([...b.registrations]).toEqual([]);
});
test('denied cache access does not reject startup or prevent unregistration',async()=>{
 const b=browser({cacheDenied:true});await expect(offline.retireOffline()).resolves.toBeUndefined();expect([...b.registrations]).toEqual([]);
});
test('denied registration access does not prevent cache cleanup',async()=>{
 const b=browser({registrationDenied:true});await offline.retireOffline();expect([...b.cacheNames]).toEqual(['other-cache']);
});
test('one failed unregistration does not block other registrations or cache cleanup',async()=>{
 const b=browser({unregisterFails:true});await offline.retireOffline();
 expect([...b.registrations]).toEqual(['root']);expect([...b.cacheNames]).toEqual(['other-cache']);
});
test('one failed cache deletion does not block the remaining deletions',async()=>{
 const b=browser({deleteFails:true});await offline.retireOffline();expect([...b.cacheNames]).toEqual(['pocket-arcade:/:old:shell','other-cache']);expect([...b.registrations]).toEqual([]);
});
