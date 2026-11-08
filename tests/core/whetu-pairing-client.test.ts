import {afterEach,describe,expect,it,vi} from 'vitest';
import {StudyPairingClient} from '../../src/study/whetu-pairing';
const TOKEN='acct_'+'a'.repeat(64),CHALLENGE='b'.repeat(64),INTENT='c'.repeat(64);
const action=(url:RequestInfo|URL)=>String(url).split('/').pop();
afterEach(()=>vi.restoreAllMocks());
describe('host-owned verified account pairing client',()=>{
 it('refuses protocol calls until the current browser selection has a server acknowledgement',async()=>{
  const fetcher=vi.fn(async()=>Response.json({selected:true}));const client=new StudyPairingClient(()=>TOKEN,fetcher);
  await expect(client.status()).rejects.toThrow('Account changed. Start again.');expect(fetcher).not.toHaveBeenCalled();
  await client.select(TOKEN);expect(fetcher).toHaveBeenCalledOnce();
 });
 it('keeps the bearer inside same-origin QCC link calls with no account IDs in the body',async()=>{
  const fetcher=vi.fn(async(url:RequestInfo|URL)=>Response.json(action(url)==='select'?{selected:true}:{started:true,expiresIn:300,intent:INTENT}));const client=new StudyPairingClient(()=>TOKEN,fetcher);
  await client.select(TOKEN);await client.start();expect(fetcher).toHaveBeenCalledTimes(2);
  const [url,init]=fetcher.mock.calls[1] as unknown as [string,RequestInit];
  expect(url).toBe('/api/integrations/nceastudy/link/start');expect(init.headers).toEqual({Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+TOKEN});
  expect(init.body).toBe('{"consent":true}');expect(init.credentials).toBe('same-origin');expect(init.redirect).toBe('error');
 });
 it('treats unauthenticated/unlinked status as false, never as verified',async()=>{
  const client=new StudyPairingClient(()=>TOKEN,async(url)=>action(url)==='select'?Response.json({selected:true}):Response.json({verified:false},{status:401}));await client.select(TOKEN);await expect(client.status()).resolves.toBe(false);
  const malformed=new StudyPairingClient(()=>TOKEN,async(url)=>Response.json(action(url)==='select'?{selected:true}:{linked:true}));await malformed.select(TOKEN);await expect(malformed.status()).rejects.toThrow();
 });
 it('validates server labels and challenge and sends only explicit confirmation',async()=>{
  const fetcher=vi.fn(async(url:RequestInfo|URL)=>Response.json(action(url)==='select'?{selected:true}:action(url)==='review'?{qccUsername:'StudyPlayer',whetuLabel:'Student',challenge:CHALLENGE}:{linked:true}));
  const client=new StudyPairingClient(()=>TOKEN,fetcher);await client.select(TOKEN);await expect(client.review()).resolves.toEqual({qccUsername:'StudyPlayer',whetuLabel:'Student',challenge:CHALLENGE});
  await client.confirm(CHALLENGE);expect(fetcher.mock.calls[2]?.[0]).toBe('/api/integrations/nceastudy/link/confirm');
  expect((fetcher.mock.calls[2] as unknown as [string,RequestInit])[1].body).toBe(JSON.stringify({consent:true,challenge:CHALLENGE}));
  for(const bad of ['',TOKEN,'<script>'])await expect(client.confirm(bad)).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(3);
 });
 it('does not retry an uncertain confirmation or echo provider/server error strings',async()=>{
  const fetcher=vi.fn(async(url:RequestInfo|URL)=>{if(action(url)==='select')return Response.json({selected:true});throw new Error('private token detail');});const client=new StudyPairingClient(()=>TOKEN,fetcher);await client.select(TOKEN);
  await expect(client.confirm(CHALLENGE)).rejects.toThrow('Account linking could not be checked. Try again.');expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('invalidates old work and waits for server selection before a new identity starts',async()=>{
  let token=TOKEN,release!:(value:Response)=>void;
  const fetcher=vi.fn(async(url:RequestInfo|URL)=>action(url)==='status'?new Promise<Response>(done=>{release=done;}):Response.json(action(url)==='select'?{selected:true}:{started:true,expiresIn:300,intent:INTENT}));
  const client=new StudyPairingClient(()=>token,fetcher);await client.select(TOKEN);const pending=client.status();await Promise.resolve();
  token='acct_'+'d'.repeat(64);const selected=client.select(token),next=client.start();
  release(Response.json({linked:true,verified:true}));await expect(pending).rejects.toThrow('Account changed. Start again.');await selected;await next;
  expect(fetcher.mock.calls.map(call=>action(call[0]))).toEqual(['select','status','select','start']);
 });
 it('queues scoped intent cleanup after an in-flight start, never global context cancellation',async()=>{
  let release!:(value:Response)=>void;
  const fetcher=vi.fn(async(url:RequestInfo|URL)=>action(url)==='start'?new Promise<Response>(done=>{release=done;}):Response.json(action(url)==='select'?{selected:true}:{cancelled:true}));
  const client=new StudyPairingClient(()=>TOKEN,fetcher);await client.select(TOKEN);const start=client.start();await Promise.resolve();const cancelled=client.cancel();
  release(Response.json({started:true,expiresIn:300,intent:INTENT}));await start;await cancelled;
  const [url,init]=fetcher.mock.calls[2] as unknown as [string,RequestInit];expect(url).toMatch(/\/cancel$/);expect(init.body).toBe(JSON.stringify({intent:INTENT}));expect(new Headers(init.headers).has('Authorization')).toBe(false);
 });
 it('fails closed after an uncertain selection and never silently reselects an old identity',async()=>{
  let available=false;const fetcher=vi.fn(async()=>available?Response.json({selected:true}):Response.json({error:'unavailable'},{status:503}));
  const client=new StudyPairingClient(()=>TOKEN,fetcher);await expect(client.select(TOKEN)).rejects.toThrow();await expect(client.status()).rejects.toThrow('Account changed. Start again.');expect(fetcher).toHaveBeenCalledOnce();
  available=true;await client.select(TOKEN);expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('retries failed scoped cleanup before starting any new setup',async()=>{
  let available=false;const fetcher=vi.fn(async(url:RequestInfo|URL)=>action(url)==='select'?Response.json({selected:true}):action(url)==='start'?Response.json({started:true,expiresIn:300,intent:INTENT}):available?Response.json({cancelled:true}):Response.json({error:'unavailable'},{status:503}));
  const client=new StudyPairingClient(()=>TOKEN,fetcher);await client.select(TOKEN);await client.start();await expect(client.cancel()).rejects.toThrow();await expect(client.start()).rejects.toThrow();
  expect(fetcher.mock.calls.filter(call=>action(call[0])==='start')).toHaveLength(1);available=true;await client.start();expect(fetcher.mock.calls.filter(call=>action(call[0])==='start')).toHaveLength(2);
 });
});
