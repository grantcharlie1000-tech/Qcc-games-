import {describe,it,expect,vi} from 'vitest';
import * as store from '../../src/core/storage';
import {MAX_KEY_BYTES} from '../../src/accounts/shared';
import {AccountsClient} from '../../src/accounts/client';
const token='acct_'+'a'.repeat(64);
function fixture(){
 const values=new Map<string,unknown>(),listeners=new Set<(key:string)=>void>();
 const storage={read:<T>(k:string,f:T)=>(values.get(k)??f) as T,write:(k:string,v:unknown)=>{values.set(k,v);for(const l of listeners)l(k);return true;},remove:(k:string)=>{values.delete(k);return true;},keys:()=>[...values.keys()],subscribe:(l:(key:string)=>void)=>{listeners.add(l);return ()=>{listeners.delete(l);};}};
 let offline=false;let remote:any={};
 const fetcher=vi.fn(async(url:any,init:any)=>{
  if(offline)throw new Error('offline');
  const action=new URL(String(url),'https://test').searchParams.get('action');
  if(action==='signup'||action==='login')return Response.json({token,username:'Ada'});
  if(action==='sync'){if(init.method==='PUT')remote={...remote,...JSON.parse(init.body).saves};return Response.json({saves:remote});}
  return Response.json({ok:true});
 }) as unknown as typeof fetch;
 return {storage,values,fetcher,offline:(v:boolean)=>{offline=v;},remote:(v:any)=>{remote=v;}};
}
describe('account client',()=>{
 it('pushes only dirty keys and pulls when clean',async()=>{
  const f=fixture(),c=new AccountsClient(f.storage,f.fetcher);f.storage.write('save:snake',{version:1,data:{score:1},updated:1});await c.authenticate('signup','Ada','password1');
  f.storage.write('best:tower',10);await c.flush();expect(JSON.parse((f.fetcher as any).mock.calls.at(-1)[1].body).saves).toEqual({'best:tower':{value:10,updated:0}});
  await c.flush();expect((f.fetcher as any).mock.calls.at(-1)[1].method).toBe('GET');c.dispose();
 });
 it('debounces changes for five seconds and flushes sustained changes by twenty',async()=>{
  vi.useFakeTimers();const f=fixture(),c=new AccountsClient(f.storage,f.fetcher);
  try{await c.authenticate('signup','Ada','password1');(f.fetcher as any).mockClear();
   f.storage.write('best:snake',1);await vi.advanceTimersByTimeAsync(4999);expect(f.fetcher).not.toHaveBeenCalled();
   await vi.advanceTimersByTimeAsync(1);expect((f.fetcher as any).mock.calls[0][1].method).toBe('PUT');(f.fetcher as any).mockClear();
   for(let i=0;i<5;i++){f.storage.write('best:snake',i+2);await vi.advanceTimersByTimeAsync(4000);}
   expect((f.fetcher as any).mock.calls).toHaveLength(1);
  }finally{c.dispose();vi.useRealTimers();}
 });
 it('pulls idle tabs at sixty seconds, skips hidden ticks and flushes on hiding',async()=>{
  vi.useFakeTimers();const f=fixture(),c=new AccountsClient(f.storage,f.fetcher);let hidden=false,visibility:(()=>void)|undefined;
  vi.stubGlobal('document',{get hidden(){return hidden;},addEventListener:(_name:string,listener:()=>void)=>{visibility=listener;},removeEventListener:()=>{}});
  try{await c.authenticate('signup','Ada','password1');c.start();await vi.advanceTimersByTimeAsync(0);(f.fetcher as any).mockClear();
   await vi.advanceTimersByTimeAsync(59999);expect(f.fetcher).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect((f.fetcher as any).mock.calls.at(-1)[1].method).toBe('GET');
   (f.fetcher as any).mockClear();hidden=true;await vi.advanceTimersByTimeAsync(60000);expect(f.fetcher).not.toHaveBeenCalled();
   f.storage.write('best:snake',10);visibility!();await vi.advanceTimersByTimeAsync(0);
   expect((f.fetcher as any).mock.calls.at(-1)[1]).toMatchObject({method:'PUT',keepalive:true});
  }finally{c.dispose();vi.unstubAllGlobals();vi.useRealTimers();}
 });
 it('does not dirty identical snapshots when JSONB changes property order',async()=>{
  const f=fixture(),c=new AccountsClient(f.storage,f.fetcher);
  f.storage.write('save:snake',{version:1,data:{score:1,level:2},updated:1});await c.authenticate('signup','Ada','password1');
  f.remote({'save:snake':{updated:1,value:{updated:1,data:{level:2,score:1},version:1}}});await c.flush();await c.flush();
  expect((f.fetcher as any).mock.calls.at(-1)[1].method).toBe('GET');c.dispose();
 });
 it('stores session, imports guest saves only on signup, clears account saves and restores guest on logout',async()=>{
  const f=fixture();f.storage.write('best:snake',50);const c=new AccountsClient(f.storage,f.fetcher);
  await c.authenticate('signup','Ada','password1');expect(c.session()).toEqual({token,username:'Ada'});expect(f.storage.read('best:snake',0)).toBe(50);
  f.storage.write('best:tower',90);await c.logout();expect(c.session()).toBeNull();expect(f.storage.read('best:tower',0)).toBe(0);expect(f.storage.read('best:snake',0)).toBe(50);c.dispose();
 });
 it('does not import guest saves on login and retries offline changes',async()=>{
  const f=fixture();f.storage.write('best:snake',50);f.remote({'best:tower':{value:10,updated:1}});const c=new AccountsClient(f.storage,f.fetcher);
  await c.authenticate('login','Ada','password1');expect(f.storage.read('best:snake',0)).toBe(0);expect(f.storage.read('best:tower',0)).toBe(10);
  f.offline(true);f.storage.write('best:tower',100);await expect(c.flush()).rejects.toThrow();expect(f.storage.read('best:tower',0)).toBe(100);
  f.offline(false);await c.flush();expect(f.fetcher).toHaveBeenLastCalledWith(expect.stringContaining('sync'),expect.objectContaining({method:'PUT'}));c.dispose();
 });
 it('restores unsent progress only after authenticating to the same account',async()=>{
  const f=fixture(),c=new AccountsClient(f.storage,f.fetcher);await c.authenticate('signup','Ada','password1');f.offline(true);f.storage.write('best:snake',200);await c.logout();expect(f.storage.read('best:snake',0)).toBe(0);f.offline(false);await c.authenticate('login','Ada','password1');expect(f.storage.read('best:snake',0)).toBe(200);c.dispose();
 });
 it('ignores delayed sync after logout and removes the local token even offline',async()=>{
  const f=fixture(),c=new AccountsClient(f.storage,f.fetcher);await c.authenticate('signup','Ada','password1');f.offline(true);await c.logout();expect(c.session()).toBeNull();expect(f.storage.read<any[]>('accounts:revocations',[])).toHaveLength(1);expect(f.storage.read<string[]>('accounts:revocations',[])[0]).not.toBe(token);c.dispose();
 });
 it('ignores a real delayed response after another tab changes identity',async()=>{
  const f=fixture();let release:((value:Response)=>void)|undefined,delayed=false;
  const fetcher=(async(url:any,init:any)=>delayed&&String(url).includes('action=sync')?new Promise<Response>(resolve=>{release=resolve;}):f.fetcher(url,init)) as typeof fetch;
  const c=new AccountsClient(f.storage,fetcher);await c.authenticate('signup','Ada','password1');f.storage.write('best:snake',20);delayed=true;
  const request=c.flush();f.values.delete('accounts:session');f.values.set('best:snake',3);
  (c as any).storageChanged({key:'pocket-arcade:v1:accounts:session'});
  release!(Response.json({saves:{'best:snake':{value:900,updated:9}}}));await request;expect(f.storage.read('best:snake',0)).toBe(3);c.dispose();
 });
 it('serializes concurrent logouts and leaves no synced account staging',async()=>{
  const f=fixture(),c=new AccountsClient(f.storage,f.fetcher);f.storage.write('best:snake',5);await c.authenticate('signup','Ada','password1');f.storage.write('best:tower',50);
  await Promise.all([c.logout(),c.logout()]);expect(f.storage.read('best:snake',0)).toBe(5);expect(f.storage.read('best:tower',0)).toBe(0);expect(f.storage.read('accounts:pending:ada',null)).toBeNull();c.dispose();
 });
 it('skips oversized keys while syncing others, stages them privately and bounds pagehide batches',async()=>{
  const f=fixture(),c=new AccountsClient(f.storage,f.fetcher);await c.authenticate('signup','Ada','password1');
  f.storage.write('save:snake',{version:1,data:'x'.repeat(MAX_KEY_BYTES),updated:10});f.storage.write('best:tower',50);await c.flush();
  expect(c.message).toContain('too large');expect(f.storage.read<any>('accounts:pending:ada',{})['save:snake']).toBeDefined();
  const calls=(f.fetcher as any).mock.calls;const body=JSON.parse(calls.filter((c:any)=>c[1].method==='PUT').at(-1)[1].body);expect(body.saves['best:tower'].value).toBe(50);expect(body.saves['save:snake']).toBeUndefined();
  f.storage.write('save:tower',{version:1,data:'x'.repeat(80000),updated:10});await c.flush(true);
  for(const [,init] of (f.fetcher as any).mock.calls.filter((c:any)=>c[1].keepalive&&c[1].method==='PUT'))expect(new TextEncoder().encode(init.body).length).toBeLessThan(60000);c.dispose();
 });
 it('invalidates cached session and save memory when another tab removes disk values',()=>{
  const disk=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>disk.get(k)??null,setItem:(k:string,v:string)=>disk.set(k,v),removeItem:(k:string)=>disk.delete(k),get length(){return disk.size;},key:(i:number)=>[...disk.keys()][i]??null});
  const c=new AccountsClient(store,fixture().fetcher);
  try{
   store.write('accounts:session',{token,username:'Ada'});store.write('best:snake',80);store.write('corn-clicker:backups',[{data:'private'}]);
   disk.delete('pocket-arcade:v1:accounts:session');disk.delete('pocket-arcade:v1:best:snake');disk.delete('pocket-arcade:v1:corn-clicker:backups');
   (c as any).knownToken=token;(c as any).storageChanged({key:'pocket-arcade:v1:accounts:session'});
   expect(c.session()).toBeNull();expect(store.highScore('snake')).toBe(0);expect(store.read('corn-clicker:backups',[])).toEqual([]);
  }finally{c.dispose();for(const key of store.keys())store.remove(key);vi.unstubAllGlobals();}
 });

 it('loads a new identity despite an older epoch flight and ignores the old response',async()=>{
  const f=fixture();let release:((value:Response)=>void)|undefined,delay=false;
  const fetcher=(async(url:any,init:any)=>delay&&String(url).includes('action=sync')&&init.method==='PUT'?new Promise<Response>(resolve=>{release=resolve;}):f.fetcher(url,init)) as typeof fetch;
  const c=new AccountsClient(f.storage,fetcher);await c.authenticate('signup','Ada','password1');f.storage.write('best:snake',20);delay=true;const old=c.flush();
  f.values.delete('accounts:session');f.values.delete('best:snake');(c as any).storageChanged({key:'pocket-arcade:v1:accounts:session'});delay=false;
  f.remote({'save:snake':{value:{version:1,data:{score:80},updated:4},updated:4}});await c.authenticate('login','Ada','password1');expect(f.storage.read<any>('save:snake',null).data.score).toBe(80);
  release!(Response.json({saves:{'best:snake':{value:900,updated:9}}}));await old;expect(f.storage.read('best:snake',0)).toBe(0);c.dispose();
 });
 it('preserves the guest and revokes a new session if initial login pull fails',async()=>{
  const f=fixture();f.storage.write('best:snake',20);
  const fetcher=(async(url:any,init:any)=>String(url).includes('action=sync')?Response.json({error:'Unavailable'},{status:503}):f.fetcher(url,init)) as typeof fetch;
  const c=new AccountsClient(f.storage,fetcher);await expect(c.authenticate('login','Ada','password1')).rejects.toThrow('Unavailable');expect(c.session()).toBeNull();expect(f.storage.read('best:snake',0)).toBe(20);c.dispose();
 });

 it('keeps a mature oversized guest snapshot locally on signup and stages it for the same account',async()=>{
  const f=fixture(),snapshot={version:1,data:'x'.repeat(MAX_KEY_BYTES),updated:10};f.storage.write('save:blockcraft',snapshot);
  const c=new AccountsClient(f.storage,f.fetcher);await c.authenticate('signup','Ada','password1');expect(f.storage.read('save:blockcraft',null)).toEqual(snapshot);expect(f.storage.read<any>('accounts:pending:ada',{})['save:blockcraft'].value).toEqual(snapshot);c.dispose();
 });

});
