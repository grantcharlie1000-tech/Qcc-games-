import {afterEach,describe,expect,it,vi} from 'vitest';
import {AccountsClient} from '../../src/accounts/client';
import {mergeSaves} from '../../src/accounts/merge';
import type {Saves} from '../../src/accounts/shared';
const token='acct_'+'c'.repeat(64);
function fixture(){
 const values=new Map<string,unknown>(),listeners=new Set<(key:string)=>void>();
 const storage={read:<T>(key:string,fallback:T)=>(values.get(key)??fallback) as T,write:(key:string,value:unknown)=>{values.set(key,structuredClone(value));for(const l of listeners)l(key);return true;},remove:(key:string)=>{values.delete(key);return true;},keys:()=>[...values.keys()],subscribe:(listener:(key:string)=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};}};
 let remote:Saves={},revision=0;const revisions:Record<string,string>={};let failure:Response|Error|undefined;
 const calls:{method:string;body:any;url:URL;headers:Headers}[]=[];
 const fetcher=(async(input:any,init:any)=>{
  const url=new URL(String(input),'https://test'),headers=new Headers(init.headers),body=init.body?JSON.parse(init.body):undefined;calls.push({url,headers,body,method:init.method});
  if(failure){const next=failure;failure=undefined;if(next instanceof Error)throw next;return next;}
  const action=url.searchParams.get('action');if(action==='signup'||action==='login')return Response.json({token,username:'Ada'});if(action!=='sync')return Response.json({ok:true});
  const since=Number(body?.cursor??url.searchParams.get('cursor')??0),acks:Record<string,string>={},conflicts:Saves={};
  for(const [key,record] of Object.entries(body?.saves??{}) as [string,any][]){
   const merged=mergeSaves(remote,{[key]:record})[key]!;
   if(JSON.stringify(merged)!==JSON.stringify(remote[key])){remote[key]=merged;revisions[key]=String(++revision);}
   if(JSON.stringify(merged)===JSON.stringify(record))acks[key]=revisions[key]!;else conflicts[key]=merged;
  }
  const saves=Object.fromEntries(Object.entries(remote).filter(([key])=>Number(revisions[key])>since&&!acks[key]&&!conflicts[key]));
  return Response.json({protocolVersion:2,cursor:String(revision),saves,revisions:{...revisions},acks,conflicts});
 }) as typeof fetch;
 return {values,storage,fetcher,calls,fail:(value:Response|Error)=>{failure=value;},seed:(saves:Saves)=>{for(const [key,value] of Object.entries(saves)){remote[key]=value;revisions[key]=String(++revision);}},remote:()=>remote};
}
const clients:AccountsClient[]=[];const client=(f:ReturnType<typeof fixture>,fetcher=f.fetcher)=>{const c=new AccountsClient(f.storage,fetcher);clients.push(c);return c;};
afterEach(()=>{for(const c of clients)c.dispose();clients.length=0;vi.useRealTimers();vi.unstubAllGlobals();});
describe('v2 durable sync scheduling',()=>{
 it('has no visible idle pulls for thirty minutes and batches sustained local changes once per three minutes',async()=>{
  vi.useFakeTimers();const f=fixture(),c=client(f);await c.authenticate('signup','Ada','password1');c.start();await vi.advanceTimersByTimeAsync(0);f.calls.length=0;
  await vi.advanceTimersByTimeAsync(30*60000);expect(f.calls).toHaveLength(0);
  for(let i=0;i<18;i++){f.storage.write('best:snake',i+1);await vi.advanceTimersByTimeAsync(10000);}
  expect(f.calls.filter(c=>c.method==='PUT')).toHaveLength(1);expect(f.remote()['best:snake']!.value).toBe(18);
  expect(f.calls[0]!.headers.get('X-QCC-Sync')).toBe('2');
 });
 it('keeps hidden timers silent and pulls once on stale visibility regain',async()=>{
  vi.useFakeTimers();let hidden=false;const callbacks=new Map<string,()=>void>();vi.stubGlobal('document',{get hidden(){return hidden;},addEventListener:(name:string,fn:()=>void)=>callbacks.set(name,fn),removeEventListener:()=>{}});
  const f=fixture(),c=client(f);await c.authenticate('signup','Ada','password1');c.start();await vi.advanceTimersByTimeAsync(0);f.calls.length=0;
  hidden=true;callbacks.get('visibilitychange')!();await vi.advanceTimersByTimeAsync(30*60000);expect(f.calls).toHaveLength(0);
  hidden=false;callbacks.get('visibilitychange')!();await vi.advanceTimersByTimeAsync(0);expect(f.calls).toHaveLength(1);expect(f.calls[0]!.method).toBe('GET');
 });
 it('persists dirty keys immediately and resumes them after a crash',async()=>{
  vi.useFakeTimers();const f=fixture(),c=client(f);await c.authenticate('signup','Ada','password1');f.storage.write('best:tower',27);
  c.dispose();const recovered=client(f);recovered.start();await vi.advanceTimersByTimeAsync(0);
  expect(f.remote()['best:tower']!.value).toBe(27);await recovered.flush();expect(f.calls.filter(c=>c.method==='PUT')).toHaveLength(1);
 });
 it('retains an edit made while its older revision is in flight',async()=>{
  const f=fixture();let release:(()=>void)|undefined,delay=false;
  const c=client(f,(async(input,init)=>{const response=await f.fetcher(input,init);if(delay&&init?.method==='PUT')await new Promise<void>(resolve=>{release=resolve;});return response;}) as typeof fetch);
  await c.authenticate('signup','Ada','password1');f.storage.write('save:snake',{version:1,data:{turn:1},updated:1});delay=true;
  const flight=c.flush();await vi.waitFor(()=>expect(release).toBeDefined());f.storage.write('save:snake',{version:1,data:{turn:2},updated:2});release!();await flight;
  expect(f.storage.read<any>('save:snake',null).data.turn).toBe(2);delay=false;await c.flush();expect((f.remote()['save:snake']!.value as any).data.turn).toBe(2);
 });
 it('honours read_only Retry-After across reload, then converges without losing queued changes',async()=>{
  vi.useFakeTimers();const f=fixture(),c=client(f);await c.authenticate('signup','Ada','password1');f.storage.write('best:snake',41);
  f.fail(Response.json({error:'read_only',retryable:true},{status:503,headers:{'Retry-After':'120'}}));await expect(c.flush()).rejects.toThrow();const count=f.calls.length;c.dispose();const recovered=client(f);recovered.start();
  await vi.advanceTimersByTimeAsync(119999);expect(f.calls).toHaveLength(count);await vi.advanceTimersByTimeAsync(1000);expect(f.remote()['best:snake']!.value).toBe(41);
 });
 it('retries a network failure with backoff while keeping content durable',async()=>{
  vi.useFakeTimers();const f=fixture(),c=client(f);await c.authenticate('signup','Ada','password1');f.storage.write('best:tower',8);f.fail(Error('offline'));
  await expect(c.flush()).rejects.toThrow();const count=f.calls.length;await c.flush();expect(f.calls).toHaveLength(count);await vi.advanceTimersByTimeAsync(60000);expect(f.remote()['best:tower']!.value).toBe(8);
 });
 it('replays an interrupted commit idempotently, preserving the acknowledged revision',async()=>{
  const f=fixture();let lose=false;const c=client(f,(async(input,init)=>{const response=await f.fetcher(input,init);if(lose&&init?.method==='PUT'){lose=false;throw Error('response lost');}return response;}) as typeof fetch);
  await c.authenticate('signup','Ada','password1');f.storage.write('best:snake',18);lose=true;await expect(c.flush()).rejects.toThrow();vi.useFakeTimers();await vi.advanceTimersByTimeAsync(60000);await c.flush();
  expect(f.remote()['best:snake']!.value).toBe(18);const writes=f.calls.filter(c=>c.method==='PUT');expect(writes).toHaveLength(2);expect(writes[1]!.body.saves).toEqual(writes[0]!.body.saves);
 });
 it('does not transfer a two megabyte existing world when only a small score changes',async()=>{
  const f=fixture(),world={version:1,data:{blocks:'x'.repeat(2000000)},updated:1};f.seed({'save:blockcraft':{value:world,updated:1},'best:snake':{value:4,updated:1}});const c=client(f);
  await c.authenticate('login','Ada','password1');f.calls.length=0;f.storage.write('best:snake',5);await c.flush();
  expect(f.calls).toHaveLength(1);expect(JSON.stringify(f.calls[0]!.body)).not.toContain('save:blockcraft');expect(f.storage.read<any>('save:blockcraft',null).data.blocks.length).toBe(2000000);
 });
 it('does not loop requests when a dirty batch is rejected by a revoked session',async()=>{
  vi.useFakeTimers();const f=fixture(),c=client(f);await c.authenticate('signup','Ada','password1');f.storage.write('best:snake',10);
  f.fail(Response.json({error:'Please log in again.'},{status:401}));await expect(c.flush()).rejects.toThrow();const count=f.calls.length;
  await vi.advanceTimersByTimeAsync(30*60000);await c.flush(false,false);await c.flush(true,false);expect(f.calls).toHaveLength(count);expect(f.storage.read('best:snake',0)).toBe(10);
  await c.authenticate('login','Ada','password1');const afterLogin=f.calls.length;f.storage.write('best:snake',42);await vi.advanceTimersByTimeAsync(3*60000);expect(f.calls.length).toBeGreaterThan(afterLogin);expect(f.remote()['best:snake']!.value).toBe(42);
 });
 it('ignores an old identity even when only its JSON response body is delayed',async()=>{
  const f=fixture();let delay=false,release:(()=>void)|undefined;
  const c=client(f,(async(input,init)=>{const response=await f.fetcher(input,init);if(delay&&init?.method==='GET'){const data=await response.json();response.json=async()=>{await new Promise<void>(resolve=>{release=resolve;});return data;};}return response;}) as typeof fetch);
  await c.authenticate('signup','Ada','password1');f.seed({'best:snake':{value:123,updated:1}});delay=true;const flight=c.flush();await vi.waitFor(()=>expect(release).toBeDefined());
  f.values.delete('accounts:session');f.values.set('best:snake',3);(c as any).storageChanged({key:'pocket-arcade:v1:accounts:session'});release!();await flight;
  expect(f.storage.read('best:snake',0)).toBe(3);expect(f.values.has('accounts:sync:undefined')).toBe(false);
 });

});
