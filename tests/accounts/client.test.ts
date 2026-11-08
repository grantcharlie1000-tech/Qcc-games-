import {afterEach,describe,it,expect,vi} from 'vitest';
import * as store from '../../src/core/storage';
import {MAX_KEY_BYTES} from '../../src/accounts/shared';
import {AccountsClient,SYNC_BATCH_MS} from '../../src/accounts/client';
import {mergeSaves} from '../../src/accounts/merge';
const token='acct_'+'a'.repeat(64);
function fixture(){
 const values=new Map<string,unknown>(),listeners=new Set<(key:string)=>void>();
 const storage={read:<T>(k:string,f:T)=>(values.get(k)??f) as T,write:(k:string,v:unknown)=>{values.set(k,v);for(const l of listeners)l(k);return true;},remove:(k:string)=>{values.delete(k);return true;},keys:()=>[...values.keys()],subscribe:(l:(key:string)=>void)=>{listeners.add(l);return ()=>{listeners.delete(l);};}};
 let offline=false;let remote:any={};let revision=0;const revisions:Record<string,string>={};
 const fetcher=vi.fn(async(url:any,init:any)=>{
  if(offline)throw new Error('offline');
  const action=new URL(String(url),'https://test').searchParams.get('action');
  if(action==='signup'||action==='login')return Response.json({token,username:'Ada'});
  if(action==='sync'){
   const data=init.body?JSON.parse(init.body):{},cursor=Number(data.cursor??new URL(String(url),'https://test').searchParams.get('cursor')??0),acks:Record<string,string>={};
   for(const [key,record] of Object.entries(data.saves??{})){const merged=mergeSaves(remote,{[key]:record as any});if(JSON.stringify(remote[key])!==JSON.stringify(merged[key]))revisions[key]=String(++revision);remote=merged;acks[key]=revisions[key]!;}
   return Response.json({protocolVersion:2,cursor:String(revision),saves:Object.fromEntries(Object.entries(remote).filter(([key])=>Number(revisions[key])>cursor&&!acks[key])),revisions,acks,conflicts:{}});
  }
  return Response.json({ok:true});
 }) as unknown as typeof fetch;
 return {storage,values,fetcher,offline:(v:boolean)=>{offline=v;},remote:(v:any)=>{remote=v;for(const key of Object.keys(v))revisions[key]=String(++revision);}};
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('account client',()=>{
 it('pushes only dirty keys and pulls when clean',async()=>{
  const f=fixture(),c=new AccountsClient(f.storage,f.fetcher);f.storage.write('save:snake',{version:1,data:{score:1},updated:1});await c.authenticate('signup','Ada','password1');
  f.storage.write('best:tower',10);await c.flush();expect(JSON.parse((f.fetcher as any).mock.calls.at(-1)[1].body).saves).toEqual({'best:tower':{value:10,updated:0}});
  await c.flush();expect((f.fetcher as any).mock.calls.at(-1)[1].method).toBe('GET');c.dispose();
 });
 it('batches genuine changes for three minutes without postponing sustained changes',async()=>{
  vi.useFakeTimers();const f=fixture(),c=new AccountsClient(f.storage,f.fetcher);
  try{await c.authenticate('signup','Ada','password1');(f.fetcher as any).mockClear();
   f.storage.write('best:snake',1);await vi.advanceTimersByTimeAsync(SYNC_BATCH_MS-1);expect(f.fetcher).not.toHaveBeenCalled();
   await vi.advanceTimersByTimeAsync(1);expect((f.fetcher as any).mock.calls[0][1].method).toBe('PUT');(f.fetcher as any).mockClear();
   for(let i=0;i<18;i++){f.storage.write('best:snake',i+2);await vi.advanceTimersByTimeAsync(10000);}
   expect((f.fetcher as any).mock.calls).toHaveLength(1);
  }finally{c.dispose();vi.useRealTimers();}
 });
 it('keeps idle tabs silent and flushes dirty data once on hiding',async()=>{
  vi.useFakeTimers();const f=fixture(),c=new AccountsClient(f.storage,f.fetcher);let hidden=false,visibility:(()=>void)|undefined;
  vi.stubGlobal('document',{get hidden(){return hidden;},addEventListener:(_name:string,listener:()=>void)=>{visibility=listener;},removeEventListener:()=>{}});
  try{await c.authenticate('signup','Ada','password1');c.start();await vi.advanceTimersByTimeAsync(0);(f.fetcher as any).mockClear();
   await vi.advanceTimersByTimeAsync(30*60000);expect(f.fetcher).not.toHaveBeenCalled();
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
 it('keeps guest scored runs separate on signup and restores them on logout',async()=>{
  const f=fixture();f.storage.write('best:snake',50);f.storage.write('save:snake',{version:1,data:{score:50},updated:1});f.storage.write('leaderboard:profile',{token:'b'.repeat(64),name:'Guest'});const c=new AccountsClient(f.storage,f.fetcher);
  await c.authenticate('signup','Ada','password1');expect(c.session()).toEqual({token,username:'Ada'});expect(f.storage.read('best:snake',0)).toBe(0);expect(f.storage.read('save:snake',null)).toBeNull();expect(JSON.parse((f.fetcher as any).mock.calls[0][1].body)).not.toHaveProperty('guestToken');
  f.storage.write('best:tower',90);await c.logout();expect(c.session()).toBeNull();expect(f.storage.read('best:tower',0)).toBe(0);expect(f.storage.read('best:snake',0)).toBe(50);c.dispose();
 });
 it('does not import guest saves on login and retries offline changes',async()=>{
  vi.useFakeTimers();const f=fixture();f.storage.write('best:snake',50);f.remote({'best:tower':{value:10,updated:1}});const c=new AccountsClient(f.storage,f.fetcher);
  await c.authenticate('login','Ada','password1');expect(f.storage.read('best:snake',0)).toBe(0);expect(f.storage.read('best:tower',0)).toBe(10);
  f.offline(true);f.storage.write('best:tower',100);await expect(c.flush()).rejects.toThrow();expect(f.storage.read('best:tower',0)).toBe(100);
  f.offline(false);await vi.advanceTimersByTimeAsync(60000);f.storage.write('best:tower',101);await c.flush();expect(f.fetcher).toHaveBeenLastCalledWith(expect.stringContaining('sync'),expect.objectContaining({method:'PUT'}));c.dispose();
 });
 it('restores unsent progress only after authenticating to the same account',async()=>{
  vi.useFakeTimers();const f=fixture(),c=new AccountsClient(f.storage,f.fetcher);await c.authenticate('signup','Ada','password1');f.offline(true);f.storage.write('best:snake',200);await c.logout();expect(f.storage.read('best:snake',0)).toBe(0);f.offline(false);await c.authenticate('login','Ada','password1');expect(f.storage.read('best:snake',0)).toBe(200);c.dispose();
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

 it('preserves unsent leaderboard scores and retry deadlines across account cleanup',async()=>{
  const f=fixture(),c=new AccountsClient(f.storage,f.fetcher);await c.authenticate('signup','Ada','password1');
  f.storage.write('leaderboard:pending:account:ada',{snake:70});f.storage.write('leaderboard:retry:account:ada',{attempt:2,nextAt:Date.now()+120000});f.storage.write('leaderboard:cache:snake:account:ada',{private:true});
  const retry=f.storage.read('leaderboard:retry:account:ada',null);f.offline(true);await c.logout();
  expect(f.storage.read('leaderboard:pending:account:ada',{})).toEqual({snake:70});expect(f.storage.read('leaderboard:retry:account:ada',null)).toEqual(retry);expect(f.storage.read('leaderboard:cache:snake:account:ada',null)).toBeNull();c.dispose();
 });

});

describe('integration-safe identity transitions',()=>{
 it('keeps the current account and saves when strict sign-out cannot revoke the server session',async()=>{
  const f=fixture(),c=new AccountsClient(f.storage,f.fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async()=>{}});
  try{
   await c.authenticate('signup','Ada','password1');f.storage.write('best:snake',42);f.offline(true);
   await expect(c.logout()).rejects.toThrow('could not be verified');
   expect(c.session()).toEqual({token,username:'Ada'});expect(f.storage.read('best:snake',0)).toBe(42);
   f.offline(false);await c.logout();expect(c.session()).toBeNull();
  }finally{c.dispose();}
 });
 it('does not commit local sign-out until the exact outgoing session revocation is acknowledged',async()=>{
  const f=fixture();let begin!:()=>void,finish!:()=>void;
  const begun=new Promise<void>(resolve=>{begin=resolve;});
  const pending=new Promise<void>(resolve=>{finish=resolve;});let delay=false;
  const fetcher=(async(url:any,init:any)=>{if(delay&&String(url).includes('action=logout')){begin();await pending;}return f.fetcher(url,init);}) as typeof fetch;
  const c=new AccountsClient(f.storage,fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async()=>{}});let changed=0;c.beforeIdentityChange=()=>{changed++;};
  try{
   await c.authenticate('signup','Ada','password1');changed=0;delay=true;const logout=c.logout();await begun;
   expect(c.session()?.token).toBe(token);expect(changed).toBe(0);
   finish();await logout;expect(c.session()).toBeNull();expect(changed).toBe(1);
  }finally{finish();c.dispose();}
 });
 it('a successful HTTP response without a confirmed logout body is not revocation proof',async()=>{
  const f=fixture();let malformed=false;
  const fetcher=(async(url:any,init:any)=>malformed&&String(url).includes('action=logout')?Response.json({notRevoked:true}):f.fetcher(url,init)) as typeof fetch;
  const c=new AccountsClient(f.storage,fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async()=>{}});
  try{await c.authenticate('signup','Ada','password1');malformed=true;await expect(c.logout()).rejects.toThrow('could not be verified');expect(c.session()?.token).toBe(token);}
  finally{c.dispose();}
 });
 it('blocks guest login when residual integration context cannot be invalidated',async()=>{
  const f=fixture();f.storage.write('best:snake',19);
  const c=new AccountsClient(f.storage,f.fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async()=>{throw Error('context still active');}});
  try{await expect(c.authenticate('signup','Ada','password1')).rejects.toThrow('could not be verified');expect(c.session()).toBeNull();expect(f.storage.read('best:snake',0)).toBe(19);}
  finally{c.dispose();}
 });
 it('blocks account switching and preserves original saves when strict outgoing revocation fails',async()=>{
  const f=fixture();let failLogout=false;
  const fetcher=(async(url:any,init:any)=>failLogout&&String(url).includes('action=logout')?Response.json({error:'unavailable'},{status:503}):f.fetcher(url,init)) as typeof fetch;
  const c=new AccountsClient(f.storage,fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async()=>{}});
  try{
   await c.authenticate('signup','Ada','password1');f.storage.write('best:snake',55);failLogout=true;
   await expect(c.authenticate('login','Bob','password1')).rejects.toThrow('could not be verified');
   expect(c.session()).toEqual({token,username:'Ada'});expect(f.storage.read('best:snake',0)).toBe(55);
  }finally{c.dispose();}
 });
 it('strict blocking integration cleanup must finish before identity writes',async()=>{
  const f=fixture();let rejectCleanup=false;
  const c=new AccountsClient(f.storage,f.fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async()=>{if(rejectCleanup)throw Error('cleanup failed');}});
  try{
   await c.authenticate('signup','Ada','password1');rejectCleanup=true;
   await expect(c.logout()).rejects.toThrow('could not be verified');expect(c.session()?.token).toBe(token);
  }finally{c.dispose();}
 });
 it('a failed strict transition cannot publish a different identity to another tab',async()=>{
  const f=fixture(),first=new AccountsClient(f.storage,f.fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async()=>{}}),second=new AccountsClient(f.storage,f.fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async()=>{}});
  try{
   await first.authenticate('signup','Ada','password1');await second.ready();f.offline(true);await expect(first.logout()).rejects.toThrow();
   expect(first.session()).toEqual(second.session());expect(second.session()?.token).toBe(token);
  }finally{first.dispose();second.dispose();}
 });
});

describe('strict cross-tab identity adoption',()=>{
 it('quarantines an external identity until integration cleanup and outgoing revocation are confirmed',async()=>{
  const f=fixture();let blocking=false,release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  const c=new AccountsClient(f.storage,f.fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async()=>{if(blocking)await pending;}});
  try{
   await c.authenticate('signup','Ada','password1');blocking=true;
   f.values.set('accounts:session',{token:'acct_'+'b'.repeat(64),username:'Bob'});
   (c as any).storageChanged({key:'pocket-arcade:v1:accounts:session'});
   expect(c.session()).toBeNull();
   release();await (c as any).externalIdentityFlight;
   expect(c.session()?.username).toBe('Bob');
  }finally{release();c.dispose();}
 });
 it('does not expose an externally selected account when server invalidation is unavailable',async()=>{
  const f=fixture();let fail=false;
  const c=new AccountsClient(f.storage,f.fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async()=>{if(fail)throw Error('offline');}});
  try{
   await c.authenticate('signup','Ada','password1');fail=true;
   f.values.set('accounts:session',{token:'acct_'+'b'.repeat(64),username:'Bob'});f.values.set('best:snake',12);
   (c as any).storageChanged({key:'pocket-arcade:v1:accounts:session'});await (c as any).externalIdentityFlight;
   expect(c.session()).toBeNull();expect(f.storage.read('best:snake',0)).toBe(12);expect(c.message).toContain('could not be verified');
  }finally{c.dispose();}
 });
 it('never replaces a concurrent stored identity while initial-login cleanup awaits the server',async()=>{
  const f=fixture();
  const c=new AccountsClient(f.storage,f.fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async()=>{f.values.set('accounts:session',{token:'acct_'+'b'.repeat(64),username:'Bob'});}});
  try{await expect(c.authenticate('signup','Ada','password1')).rejects.toThrow('could not be verified');expect(f.storage.read<any>('accounts:session',null).username).toBe('Bob');}
  finally{c.dispose();}
 });
});

describe('persistent strict transition barrier',()=>{
 it('a reload cannot bypass a failed external identity cleanup',async()=>{
  const f=fixture();let fail=false;
  const first=new AccountsClient(f.storage,f.fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async()=>{if(fail)throw Error('offline');}});
  await first.authenticate('signup','Ada','password1');fail=true;f.values.set('accounts:session',{token:'acct_'+'b'.repeat(64),username:'Bob'});
  (first as any).storageChanged({key:'pocket-arcade:v1:accounts:session'});await (first as any).externalIdentityFlight;first.dispose();
  const reloaded=new AccountsClient(f.storage,f.fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async()=>{}});
  try{
   expect(reloaded.session()).toBeNull();reloaded.start();await (reloaded as any).externalIdentityFlight;
   expect(reloaded.session()?.username).toBe('Bob');expect(f.storage.read('accounts:identity-pending',false)).toBe(false);
  }finally{reloaded.dispose();}
 });
 it('retries a quarantined identity after reconnect without deleting its saved data',async()=>{
  const f=fixture();let fail=false;
  const c=new AccountsClient(f.storage,f.fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async()=>{if(fail)throw Error('offline');}});
  try{
   await c.authenticate('signup','Ada','password1');fail=true;f.values.set('accounts:session',{token:'acct_'+'b'.repeat(64),username:'Bob'});f.values.set('best:snake',29);
   (c as any).storageChanged({key:'pocket-arcade:v1:accounts:session'});await (c as any).externalIdentityFlight;expect(c.session()).toBeNull();
   fail=false;(c as any).online();await (c as any).externalIdentityFlight;
   expect(c.session()?.username).toBe('Bob');expect(f.storage.read('best:snake',0)).toBe(29);
  }finally{c.dispose();}
 });
 it('strict mode without a confirmed-cleanup guard cannot silently commit an identity',async()=>{
  const f=fixture(),c=new AccountsClient(f.storage,f.fetcher,{strictIdentityChanges:true});
  try{await expect(c.authenticate('signup','Ada','password1')).rejects.toThrow('could not be verified');expect(c.session()).toBeNull();}
  finally{c.dispose();}
 });
});


describe('server-authoritative strict startup',()=>{
 it('cannot bypass startup reconciliation when durable barrier writes fail',async()=>{
  const f=fixture();f.values.set('accounts:session',{token:'acct_'+'b'.repeat(64),username:'Bob'});
  const storage={...f.storage,write:(key:string,value:unknown)=>key==='accounts:identity-pending'?false:f.storage.write(key,value)};
  const first=new AccountsClient(storage,f.fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async()=>{throw Error('server unavailable');}});
  try{expect(first.session()).toBeNull();await expect(first.ready()).rejects.toThrow('could not be verified');expect(first.session()).toBeNull();}
  finally{first.dispose();}
  let selected:string|undefined;
  const reloaded=new AccountsClient(storage,f.fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async next=>{selected=next?.username;}});
  try{expect(reloaded.session()).toBeNull();await reloaded.ready();expect(selected).toBe('Bob');expect(reloaded.session()?.username).toBe('Bob');}
  finally{reloaded.dispose();}
 });
 it('server startup selection receives the actual stored session before it is exposed',async()=>{
  const f=fixture();f.values.set('accounts:session',{token,username:'Ada'});let finish!:()=>void;const pending=new Promise<void>(resolve=>{finish=resolve;});let seen:string|undefined;
  const c=new AccountsClient(f.storage,f.fetcher,{strictIdentityChanges:true,beforeIdentityCommit:async next=>{seen=next?.token;await pending;}});
  try{const ready=c.ready();expect(c.session()).toBeNull();expect(seen).toBe(token);finish();await ready;expect(c.session()?.token).toBe(token);}
  finally{finish();c.dispose();}
 });
});
